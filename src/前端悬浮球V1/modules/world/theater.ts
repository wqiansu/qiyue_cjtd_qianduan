// 世界套件 P1-A · 小剧场（theater）— 单 modal SPA
// 选角色 + 地点等世界书条目，参考最新楼层正文，生成番外片段。
// 架构同微信/演化：openModal2 仅调一次（reset+revive），内部 _view 状态机 + 常驻根容器，
//   重渲染只改根容器 innerHTML，事件委托绑根容器；子面板=app 内底部 sheet，不堆叠 modal。
import { esc, qs } from '../../lib/dom-utils';
import { getRoot } from '../../lib/tavern-api';
import { openModal2 } from '../../status-bar-init';
import { iconHtml } from '../../lib/icons';
import { registerWorldApp } from '../../lib/world/world-store';
import { getContacts } from '../../lib/world/contacts';
import { AI_STYLES_BUILTIN, getAiStyleSuffix } from '../../lib/ai-summary-store';
import { chatGenerate, readTavernFloors, injectWorldOnce } from '../../lib/world/ai-chat';
import { listWorldbookNames, listWorldbookEntries } from '../../lib/world/worldbook';
import {
  registerPromptTemplate, getPromptText,
} from '../../lib/world/world-prompts';
import {
  getScripts, getScript, createScript, updateScript, deleteScript,
  addScene, deleteScene, updateScene,
  type TheaterScript, type TheaterRef,
} from '../../lib/world/theater-store';

const THR_MODAL_MAXW = 'min(900px,96vw)';
const RID = 'th-thr-app-root';
let _busy = false;

// ==================== 提示词模板注册 ====================
registerPromptTemplate({
  id: 'theater.generate', appId: 'theater', appName: '小剧场', name: '番外片段生成',
  desc: '小剧场如何根据所选角色/地点 + 参考正文，生成一段番外片段。控制叙事质感与分寸。',
  vars: [
    { key: 'cast', desc: '出场角色及其设定' },
    { key: 'places', desc: '地点/场景设定' },
    { key: 'topic', desc: '本次桥段/主题提示' },
    { key: 'refBlock', desc: '参考的最近正文（可空）' },
    { key: 'modeBlock', desc: '单次短片 / 连续多幕 的衔接说明' },
  ],
  default: '你是一位笔力老到的小说作者，正在为一部正在连载的故事撰写一段「番外小剧场」。这一段不必承担主线，却要像主线一样有血有肉、让读者会心一笑或心头一暖。\n\n'
    + '【本场出演】\n{{cast}}\n\n'
    + '【场景设定】\n{{places}}\n\n'
    + '【本段命题】\n{{topic}}\n\n'
    + '{{refBlock}}'
    + '{{modeBlock}}'
    + '【写作要求】\n'
    + '· 旁白与对话混排：用克制的旁白交代环境、动作与心理，用对话和神态把人物性格立起来——每个角色说话的腔调、用词、节奏都要贴合其设定，不能换个名字就面目模糊。\n'
    + '· 抓一个具体的小切口（一次拌嘴、一顿饭、一场雨、一个误会），把它写细、写活，而不是泛泛交代「他们度过了愉快的一天」。\n'
    + '· 有起伏、有余味：哪怕是日常片段，也要有一个小小的张力或转折，结尾留一缕回味，别平铺直叙到底。\n'
    + '· 尊重设定与已发生的剧情：不洗白、不 OOC、不无中生有地引入重大事件；番外是主线缝隙里的光，不是平行宇宙。\n\n'
    + '【输出】直接输出片段正文（旁白 + 对话），不要解释、不要标题、不要「以下是」之类的开场白，不要用 JSON 包裹。',
});

function rootEl(): HTMLElement | null { return qs<HTMLElement>('#' + RID); }

// ==================== 选材候选 ====================
// 角色候选：联系人 + 在场/离场 NPC（来自状态栏数据桥）
function npcCandidates(): { name: string; persona: string; onScene: boolean }[] {
  try {
    const bridge = (window as any).__thStatusBarData || (getRoot() as any).__thStatusBarData;
    const d = bridge?.getCurrentData?.();
    const npc = (d && typeof d === 'object') ? (d['NPC'] || {}) : {};
    return Object.entries(npc).map(([name, info]: [string, any]) => {
      const bits = [info?.['身份'] ? `身份：${info['身份']}` : '', info?.['性格'] ? `性格：${info['性格']}` : '', info?.['简介'] || info?.['描述'] || ''].filter(Boolean);
      return { name, persona: bits.join('；'), onScene: info?.['是否在场'] === true };
    });
  } catch (e) { void e; return []; }
}

// ==================== 状态机 ====================
type ViewState = { name: 'list' } | { name: 'detail'; scriptId: string };
type SheetState =
  | { kind: 'newScript' }
  | { kind: 'castPick'; scriptId: string }     // 选角色/地点
  | { kind: 'wbPick'; scriptId: string }        // 从世界书选地点条目
  | { kind: 'config'; scriptId: string };       // 编辑剧本配置

let _view: ViewState = { name: 'list' };
let _sheet: SheetState | null = null;

// 选材 sheet 暂存（编辑中的 refs，确认才写库）
let _pickRefs: TheaterRef[] = [];
let _wbBook = '';
let _wbEntries: { uid: number; name: string; content: string }[] = [];
let _stream = '';   // 流式/生成中预览文本

function timeLabel(ts: number): string {
  try {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch (e) { void e; return ''; }
}
function avatarChip(name: string): string {
  const ch = (name || '?').slice(0, 1);
  return `<span class="th-thr-av">${esc(ch)}</span>`;
}

// ==================== 列表视图 ====================
function listHtml(): string {
  const scripts = getScripts();
  const cards = scripts.length
    ? scripts.map(s => {
        const cast = s.refs.filter(r => r.kind === 'char').map(r => r.name);
        const place = s.refs.filter(r => r.kind === 'place').map(r => r.name);
        const last = s.scenes[s.scenes.length - 1];
        const preview = last ? esc(last.text.slice(0, 70)) : '尚未生成片段';
        return `<div class="th-thr-card" data-thr-card="${esc(s.id)}">
          <button class="th-thr-card-open" data-thr-open="${esc(s.id)}" type="button">
            <span class="th-thr-card-head">
              <span class="th-thr-card-title">${iconHtml('fa-masks-theater')} ${esc(s.title)}</span>
              <span class="th-thr-card-badge">${s.scenes.length} 幕</span>
            </span>
            <span class="th-thr-card-cast">${cast.length ? cast.map(esc).join('、') : '未选角色'}${place.length ? ` · ${place.map(esc).join('、')}` : ''}</span>
            <span class="th-thr-card-preview">${preview}</span>
            <span class="th-thr-card-meta">${timeLabel(s.updatedAt)}</span>
          </button>
          <div class="th-thr-card-ops">
            <button class="th-thr-card-del" data-thr-del="${esc(s.id)}" type="button" title="删除剧本">${iconHtml('fa-trash')}</button>
          </div>
        </div>`;
      }).join('')
    : `<div class="th-thr-empty">
        <i class="fa-solid fa-masks-theater"></i>
        <div>还没有小剧场剧本</div>
        <div class="th-thr-empty-sub">选几个角色和地点，参考当前剧情生成一段番外片段——可以是日常、可以是 if 线，主线缝隙里的光。</div>
      </div>`;
  return `<div class="th-thr-app">
    <div class="th-thr-topbar">
      <span class="th-thr-title">${iconHtml('fa-masks-theater')} 小剧场</span>
      <button class="th-thr-primary" data-thr-new type="button">${iconHtml('fa-plus')} 新剧本</button>
    </div>
    <div class="th-thr-card-grid">${cards}</div>
  </div>`;
}

// ==================== 详情视图（单剧本：选材 + 幕） ====================
function detailHtml(scriptId: string): string {
  const s = getScript(scriptId);
  if (!s) return `<div class="th-thr-app"><div class="th-thr-topbar"><button class="th-thr-back" data-thr-back type="button">${iconHtml('fa-arrow-left')}</button><span class="th-thr-title">剧本不存在</span></div></div>`;
  const cast = s.refs.filter(r => r.kind === 'char');
  const places = s.refs.filter(r => r.kind === 'place');
  const styleName = AI_STYLES_BUILTIN.find(x => x.id === s.styleId)?.name || '默认';
  const castChips = cast.length
    ? cast.map(r => `<span class="th-thr-chip">${avatarChip(r.name)}${esc(r.name)}</span>`).join('')
    : `<span class="th-thr-empty-sub">未选角色</span>`;
  const placeChips = places.length
    ? places.map(r => `<span class="th-thr-chip th-thr-chip-place">${iconHtml('fa-location-dot')}${esc(r.name)}</span>`).join('')
    : `<span class="th-thr-empty-sub">未选地点</span>`;
  const scenes = s.scenes.length
    ? s.scenes.map((sc, i) => `<div class="th-thr-scene" data-thr-scene="${esc(sc.id)}">
        <div class="th-thr-scene-head">
          <span class="th-thr-scene-no">第 ${i + 1} 幕</span>
          <span class="th-thr-scene-time">${timeLabel(sc.ts)}</span>
          <span class="th-thr-scene-ops">
            <button class="th-thr-sc-inject${sc.injected ? ' th-thr-sc-injected' : ''}" data-thr-scene-inject="${esc(sc.id)}" type="button" title="作为已发生剧情注入正文（本次生成生效一次）">${iconHtml('fa-syringe')}</button>
            <button class="th-thr-sc-del" data-thr-scene-del="${esc(sc.id)}" type="button" title="删除本幕">${iconHtml('fa-trash')}</button>
          </span>
        </div>
        <div class="th-thr-scene-body">${esc(sc.text).replace(/\n/g, '<br>')}</div>
      </div>`).join('')
    : `<div class="th-thr-empty-sub" style="padding:14px">还没有片段。点下方「${s.mode === 'multi' ? '生成下一幕' : '生成片段'}」开演。</div>`;
  const streamPreview = _busy && _stream
    ? `<div class="th-thr-scene th-thr-scene-stream"><div class="th-thr-scene-head"><span class="th-thr-scene-no">生成中…</span></div><div class="th-thr-scene-body">${esc(_stream).replace(/\n/g, '<br>')}</div></div>`
    : '';
  const genLabel = s.scenes.length && s.mode === 'multi' ? '生成下一幕' : '生成片段';
  return `<div class="th-thr-app">
    <div class="th-thr-topbar">
      <button class="th-thr-back" data-thr-back type="button">${iconHtml('fa-arrow-left')}</button>
      <span class="th-thr-title">${esc(s.title)}</span>
      <button class="th-thr-icon-btn" data-thr-config type="button" title="剧本配置">${iconHtml('fa-sliders')}</button>
    </div>
    <div class="th-thr-setup">
      <div class="th-thr-setup-row"><span class="th-thr-setup-label">出演</span><div class="th-thr-chips">${castChips}</div><button class="th-thr-mini" data-thr-cast type="button">${iconHtml('fa-user-plus')} 选角色</button></div>
      <div class="th-thr-setup-row"><span class="th-thr-setup-label">场景</span><div class="th-thr-chips">${placeChips}</div><button class="th-thr-mini" data-thr-place type="button">${iconHtml('fa-location-dot')} 选地点</button></div>
      <div class="th-thr-setup-row"><span class="th-thr-setup-label">设置</span>
        <span class="th-thr-setup-tags">
          <span class="th-thr-tag">${s.mode === 'multi' ? '连续多幕' : '单次短片'}</span>
          <span class="th-thr-tag">风格：${esc(styleName)}</span>
          <span class="th-thr-tag">${s.useFloors ? `参考正文 ${s.floorCount} 楼` : '纯架空'}</span>
        </span>
      </div>
      ${s.topic ? `<div class="th-thr-setup-row"><span class="th-thr-setup-label">命题</span><span class="th-thr-topic">${esc(s.topic)}</span></div>` : ''}
    </div>
    <div class="th-thr-scenes">${scenes}${streamPreview}</div>
    <div class="th-thr-genbar">
      <button class="th-thr-primary th-thr-gen" data-thr-gen="${esc(s.id)}" type="button" ${_busy ? 'disabled' : ''}>${_busy ? iconHtml('fa-spinner') + ' 生成中…' : iconHtml('fa-wand-magic-sparkles') + ' ' + genLabel}</button>
    </div>
  </div>`;
}

// ==================== 底部 sheet ====================
function castPickInnerHtml(): string {
  const exist = new Set(_pickRefs.filter(r => r.kind === 'char').map(r => r.key));
  const contacts = getContacts();
  const ctCards = contacts.length
    ? contacts.map(c => {
        const key = 'contact:' + c.id; const done = exist.has(key);
        return `<button class="th-thr-pcard${done ? ' th-thr-pcard-on' : ''}" data-thr-pick-char="${esc(key)}" data-thr-name="${esc(c.name)}" data-thr-setting="${esc(c.persona || '')}" type="button">
          ${avatarChip(c.name)}<span class="th-thr-pcard-name">${esc(c.name)}</span><span class="th-thr-pcard-tag">联系人</span>
          ${done ? `<span class="th-thr-pcard-flag">${iconHtml('fa-check')}</span>` : ''}</button>`;
      }).join('')
    : `<div class="th-thr-empty-sub">还没有联系人。</div>`;
  const npcs = npcCandidates();
  const npcCards = npcs.length
    ? npcs.map(n => {
        const key = 'npc:' + n.name; const done = exist.has(key);
        return `<button class="th-thr-pcard${done ? ' th-thr-pcard-on' : ''}" data-thr-pick-char="${esc(key)}" data-thr-name="${esc(n.name)}" data-thr-setting="${esc(n.persona)}" type="button">
          ${avatarChip(n.name)}<span class="th-thr-pcard-name">${esc(n.name)}</span><span class="th-thr-pcard-tag">${n.onScene ? '在场' : '离场'} NPC</span>
          ${done ? `<span class="th-thr-pcard-flag">${iconHtml('fa-check')}</span>` : ''}</button>`;
      }).join('')
    : `<div class="th-thr-empty-sub">当前无 NPC 数据。</div>`;
  return `<div class="th-thr-pick">
    <div class="th-thr-pick-group"><div class="th-thr-pick-glabel">联系人</div><div class="th-thr-pcard-grid">${ctCards}</div></div>
    <div class="th-thr-pick-group"><div class="th-thr-pick-glabel">NPC</div><div class="th-thr-pcard-grid">${npcCards}</div></div>
    <div class="th-thr-form-actions"><button class="th-thr-primary" data-thr-cast-done type="button">${iconHtml('fa-check')} 确认（已选 ${_pickRefs.filter(r => r.kind === 'char').length}）</button></div>
  </div>`;
}

function wbPickInnerHtml(): string {
  const exist = new Set(_pickRefs.filter(r => r.kind === 'place').map(r => r.key));
  const books = (() => { try { return listWorldbookNames(); } catch (e) { void e; return []; } })();
  const bookOpts = ['<option value="">选择世界书…</option>']
    .concat(books.map(b => `<option value="${esc(b)}" ${_wbBook === b ? 'selected' : ''}>${esc(b)}</option>`)).join('');
  const entryList = _wbBook
    ? (_wbEntries.length
        ? `<div class="th-thr-pcard-grid">${_wbEntries.map(e => {
            const key = `wb:${_wbBook}#${e.uid}`; const done = exist.has(key);
            return `<button class="th-thr-pcard${done ? ' th-thr-pcard-on' : ''}" data-thr-pick-place="${esc(key)}" data-thr-name="${esc(e.name)}" data-thr-setting="${esc(e.content.slice(0, 400))}" type="button">
              ${iconHtml('fa-location-dot')}<span class="th-thr-pcard-name">${esc(e.name)}</span><span class="th-thr-pcard-tag">${esc(e.content.slice(0, 20))}…</span>
              ${done ? `<span class="th-thr-pcard-flag">${iconHtml('fa-check')}</span>` : ''}</button>`;
          }).join('')}</div>`
        : `<div class="th-thr-empty-sub" style="padding:10px">这本世界书暂无可读条目（或正在加载）。</div>`)
    : `<div class="th-thr-empty-sub" style="padding:10px">先选一本世界书，再从中挑地点/场景条目。</div>`;
  return `<div class="th-thr-form">
    <label class="th-thr-frow"><span>世界书</span><select class="th-thr-field th-thr-wb-book">${bookOpts}</select></label>
    ${entryList}
    <div class="th-thr-form-actions">
      <button class="th-thr-chip" data-thr-place-custom type="button">${iconHtml('fa-plus')} 自定义一个地点</button>
      <button class="th-thr-primary" data-thr-cast-done type="button">${iconHtml('fa-check')} 确认（已选 ${_pickRefs.filter(r => r.kind === 'place').length}）</button>
    </div>
  </div>`;
}

function configInnerHtml(s: TheaterScript): string {
  const styleOpts = AI_STYLES_BUILTIN.map(x => `<option value="${x.id}" ${s.styleId === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  return `<div class="th-thr-form">
    <label class="th-thr-frow th-thr-frow-stack"><span>剧本标题</span><input type="text" class="th-thr-field th-thr-c-title" value="${esc(s.title)}"></label>
    <label class="th-thr-frow th-thr-frow-stack"><span>桥段 / 主题提示（可空，越具体越出彩）</span>
      <textarea class="th-thr-field th-thr-c-topic" rows="3" placeholder="如：雨夜，两人在屋檐下躲雨，旧事被提起…">${esc(s.topic || '')}</textarea></label>
    <label class="th-thr-frow th-thr-frow-stack"><span>叙事风格</span><select class="th-thr-field th-thr-c-style">${styleOpts}</select></label>
    <label class="th-thr-frow th-thr-frow-stack"><span>形态</span>
      <select class="th-thr-field th-thr-c-mode">
        <option value="single" ${s.mode === 'single' ? 'selected' : ''}>单次短片（每次独立生成）</option>
        <option value="multi" ${s.mode === 'multi' ? 'selected' : ''}>连续多幕（每幕承接上一幕）</option>
      </select></label>
    <label class="th-thr-frow"><span>参考最近正文楼层</span><input type="checkbox" class="th-thr-c-usefloors" ${s.useFloors ? 'checked' : ''}></label>
    <label class="th-thr-frow th-thr-frow-stack"><span>参考楼数</span><input type="number" class="th-thr-field th-thr-c-floors" value="${s.floorCount}" min="0" max="30"></label>
    <div class="th-thr-form-actions"><button class="th-thr-primary" data-thr-config-save="${esc(s.id)}" type="button">${iconHtml('fa-check')} 保存</button></div>
  </div>`;
}

function sheetHtml(): string {
  if (!_sheet) return '';
  let title = ''; let inner = '';
  if (_sheet.kind === 'newScript') {
    title = '新建剧本';
    inner = `<div class="th-thr-form">
      <label class="th-thr-frow th-thr-frow-stack"><span>剧本标题</span><input type="text" class="th-thr-field th-thr-new-title" placeholder="如：霜月仙宗的一个雪天" autofocus></label>
      <div class="th-thr-set-hint">建好后进去选角色、地点，写下桥段，再生成片段。</div>
      <div class="th-thr-form-actions"><button class="th-thr-primary" data-thr-new-create type="button">${iconHtml('fa-check')} 创建</button></div>
    </div>`;
  } else if (_sheet.kind === 'castPick') {
    title = '选择出演角色';
    inner = castPickInnerHtml();
  } else if (_sheet.kind === 'wbPick') {
    title = '选择地点 / 场景';
    inner = wbPickInnerHtml();
  } else if (_sheet.kind === 'config') {
    const s = getScript(_sheet.scriptId);
    title = '剧本配置';
    inner = s ? configInnerHtml(s) : '<div class="th-thr-empty-sub">剧本不存在</div>';
  }
  return `<div class="th-thr-sheet-mask" data-thr-sheet-close>
    <div class="th-thr-sheet" data-thr-sheet-body>
      <div class="th-thr-sheet-head"><span>${title}</span><button class="th-thr-sheet-x" data-thr-sheet-close type="button">${iconHtml('fa-xmark')}</button></div>
      <div class="th-thr-sheet-content">${inner}</div>
    </div>
  </div>`;
}

// ==================== 渲染 ====================
function render(): void {
  const root = rootEl();
  if (!root) { openApp(); return; }
  const view = _view.name === 'detail' ? detailHtml(_view.scriptId) : listHtml();
  root.innerHTML = view + sheetHtml();
}
function go(v: ViewState): void { _view = v; _sheet = null; render(); }
function openSheet(s: SheetState): void { _sheet = s; render(); }
function closeSheet(): void { _sheet = null; render(); }

// ==================== 生成 ====================
function buildCastBlock(refs: TheaterRef[]): string {
  const cast = refs.filter(r => r.kind === 'char');
  if (!cast.length) return '（未指定具体角色，可由你按剧情合理安排在场人物）';
  return cast.map(r => `● ${r.name}${r.setting ? `\n  设定：${r.setting}` : ''}`).join('\n');
}
function buildPlaceBlock(refs: TheaterRef[]): string {
  const places = refs.filter(r => r.kind === 'place');
  if (!places.length) return '（未指定地点，可按剧情合理设置场景）';
  return places.map(r => `● ${r.name}${r.setting ? `\n  ${r.setting}` : ''}`).join('\n');
}

async function runGenerate(scriptId: string): Promise<void> {
  if (_busy) return;
  const s = getScript(scriptId);
  if (!s) return;
  _busy = true; _stream = ''; render();
  try {
    const cast = buildCastBlock(s.refs);
    const places = buildPlaceBlock(s.refs);
    const topic = s.topic?.trim() || '一个能体现这些人物关系与性格的日常小片段。';
    // 参考正文
    let refBlock = '';
    if (s.useFloors && s.floorCount > 0) {
      const floors = readTavernFloors(s.floorCount);
      if (floors.trim()) refBlock = `【当前剧情参考（最近 ${s.floorCount} 楼，番外需与之自然衔接，不冲突）】\n${floors}\n\n`;
    }
    // 多幕衔接：带上一幕
    let modeBlock = '';
    if (s.mode === 'multi' && s.scenes.length) {
      const prev = s.scenes[s.scenes.length - 1];
      modeBlock = `【上一幕（请自然承接其后，推进而非重复）】\n${prev.text.slice(0, 1200)}\n\n`;
    } else if (s.mode === 'multi') {
      modeBlock = '【这是连续多幕的第一幕，请起一个好头，为后续留出空间。】\n\n';
    }
    const system = getPromptText('theater.generate')
      .replace('{{cast}}', cast)
      .replace('{{places}}', places)
      .replace('{{topic}}', topic)
      .replace('{{refBlock}}', refBlock)
      .replace('{{modeBlock}}', modeBlock)
      + getAiStyleSuffixFor(s.styleId);
    const out = await chatGenerate({ system, user: '请开始写这一段小剧场。', shouldStream: false });
    const text = (out || '').trim();
    if (text) {
      addScene(scriptId, text);
    }
  } catch (e) {
    console.error('[theater] generate failed', e);
    try { (getRoot() as any)?.toastr?.error?.('小剧场生成失败，请检查 API 设置'); } catch (err) { void err; }
  } finally {
    _busy = false; _stream = '';
    render();
  }
}

// 风格后缀：剧本指定风格优先，否则用全局当前风格
function getAiStyleSuffixFor(styleId?: string): string {
  if (styleId && styleId !== 'default') {
    const st = AI_STYLES_BUILTIN.find(x => x.id === styleId);
    if (st) return st.systemSuffix || '';
  }
  if (styleId === 'default') return '';
  try { return getAiStyleSuffix(); } catch (e) { void e; return ''; }
}

// ==================== 事件委托 ====================
function bindRoot(): void {
  const root = rootEl();
  if (!root || (root as any)._thrBound) return;
  (root as any)._thrBound = true;

  root.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    if (!t) return;
    // sheet 打开时优先交给 sheet 处理（含点遮罩/x 关闭）
    if (_sheet && onSheetClick(t)) return;

    // 列表/详情
    const open = t.closest('[data-thr-open]') as HTMLElement | null;
    if (open) { go({ name: 'detail', scriptId: open.getAttribute('data-thr-open') || '' }); return; }
    if (t.closest('[data-thr-back]')) { go({ name: 'list' }); return; }
    if (t.closest('[data-thr-new]')) { openSheet({ kind: 'newScript' }); return; }
    const del = t.closest('[data-thr-del]') as HTMLElement | null;
    if (del) {
      const id = del.getAttribute('data-thr-del') || '';
      const s = getScript(id);
      if (s && confirmDel(`删除剧本「${s.title}」？`)) { deleteScript(id); render(); }
      return;
    }
    // 详情内
    if (_view.name === 'detail') {
      const sid = _view.scriptId;
      if (t.closest('[data-thr-config]')) { openSheet({ kind: 'config', scriptId: sid }); return; }
      if (t.closest('[data-thr-cast]')) { _pickRefs = (getScript(sid)?.refs || []).slice(); openSheet({ kind: 'castPick', scriptId: sid }); return; }
      if (t.closest('[data-thr-place]')) { _pickRefs = (getScript(sid)?.refs || []).slice(); _wbBook = ''; _wbEntries = []; openSheet({ kind: 'wbPick', scriptId: sid }); return; }
      const gen = t.closest('[data-thr-gen]') as HTMLElement | null;
      if (gen) { runGenerate(gen.getAttribute('data-thr-gen') || sid); return; }
      const scDel = t.closest('[data-thr-scene-del]') as HTMLElement | null;
      if (scDel) {
        const scId = scDel.getAttribute('data-thr-scene-del') || '';
        if (confirmDel('删除这一幕？')) { deleteScene(sid, scId); render(); }
        return;
      }
      const scInj = t.closest('[data-thr-scene-inject]') as HTMLElement | null;
      if (scInj) {
        const scId = scInj.getAttribute('data-thr-scene-inject') || '';
        const s = getScript(sid); const sc = s?.scenes.find(x => x.id === scId);
        if (sc) {
          const ok = injectWorldOnce('th_theater_' + scId, `【番外/已发生剧情参考】\n${sc.text}`);
          updateScene(sid, scId, { injected: true });
          try { (getRoot() as any)?.toastr?.[ok ? 'success' : 'info']?.(ok ? '已注入下次正文生成（生效一次）' : '当前环境无注入接口'); } catch (e) { void e; }
          render();
        }
        return;
      }
    }
  });

  root.addEventListener('change', (ev) => {
    const t = ev.target as HTMLElement;
    if (!t) return;
    if (t.classList.contains('th-thr-wb-book')) {
      _wbBook = (t as HTMLSelectElement).value; _wbEntries = [];
      if (_wbBook) {
        listWorldbookEntries(_wbBook).then(list => { _wbEntries = list; if (_sheet?.kind === 'wbPick') render(); }).catch(() => { /* 降级空 */ });
      }
      render();
    }
  });
}

function onSheetClick(t: HTMLElement): boolean {
  // 关闭
  if (t.hasAttribute('data-thr-sheet-close') || t.closest('.th-thr-sheet-x')) {
    if (t.classList.contains('th-thr-sheet-mask') || t.closest('.th-thr-sheet-x')) { closeSheet(); return true; }
  }
  if (!_sheet) return false;

  if (_sheet.kind === 'newScript' && t.closest('[data-thr-new-create]')) {
    const input = qs<HTMLInputElement>('.th-thr-new-title');
    const title = (input?.value || '').trim() || '未命名剧本';
    const s = createScript({ title });
    go({ name: 'detail', scriptId: s.id });
    return true;
  }

  // 选角色 / 选地点（切换选中）
  const pickChar = t.closest('[data-thr-pick-char]') as HTMLElement | null;
  if (pickChar) { toggleRef('char', pickChar); return true; }
  const pickPlace = t.closest('[data-thr-pick-place]') as HTMLElement | null;
  if (pickPlace) { toggleRef('place', pickPlace); return true; }

  if (t.closest('[data-thr-place-custom]')) {
    const name = (prompt2('自定义地点名称') || '').trim();
    if (name) { _pickRefs.push({ kind: 'place', key: 'custom:' + name, name, setting: '' }); render(); }
    return true;
  }

  // 确认选材 → 写回剧本
  if (t.closest('[data-thr-cast-done]')) {
    if (_sheet.kind === 'castPick' || _sheet.kind === 'wbPick') {
      updateScript(_sheet.scriptId, { refs: _pickRefs.slice() });
    }
    closeSheet();
    return true;
  }

  // 保存配置
  const cfgSave = t.closest('[data-thr-config-save]') as HTMLElement | null;
  if (cfgSave) {
    const id = cfgSave.getAttribute('data-thr-config-save') || '';
    const title = (qs<HTMLInputElement>('.th-thr-c-title')?.value || '').trim() || '未命名剧本';
    const topic = qs<HTMLTextAreaElement>('.th-thr-c-topic')?.value || '';
    const styleId = qs<HTMLSelectElement>('.th-thr-c-style')?.value || 'default';
    const mode = (qs<HTMLSelectElement>('.th-thr-c-mode')?.value as 'single' | 'multi') || 'single';
    const useFloors = !!qs<HTMLInputElement>('.th-thr-c-usefloors')?.checked;
    const floorCount = Math.max(0, Math.min(30, parseInt(qs<HTMLInputElement>('.th-thr-c-floors')?.value || '6', 10) || 6));
    updateScript(id, { title, topic, styleId, mode, useFloors, floorCount });
    closeSheet();
    return true;
  }
  return false;
}

function toggleRef(kind: 'char' | 'place', el: HTMLElement): void {
  const key = el.getAttribute(kind === 'char' ? 'data-thr-pick-char' : 'data-thr-pick-place') || '';
  const name = el.getAttribute('data-thr-name') || '';
  const setting = el.getAttribute('data-thr-setting') || '';
  const i = _pickRefs.findIndex(r => r.key === key);
  if (i >= 0) _pickRefs.splice(i, 1);
  else _pickRefs.push({ kind, key, name, setting });
  render();
}

function confirmDel(msg: string): boolean {
  try { return (getRoot() as any)?.confirm ? (getRoot() as any).confirm(msg) : confirm(msg); } catch (e) { void e; return confirm(msg); }
}
function prompt2(msg: string): string | null {
  try { return (getRoot() as any)?.prompt ? (getRoot() as any).prompt(msg) : prompt(msg); } catch (e) { void e; return prompt(msg); }
}

// ==================== 入口 ====================
function openApp(): void {
  openModal2(`${iconHtml('fa-masks-theater')} 小剧场`, `<div class="th-thr th-phone"><div class="th-phone-island"><span class="th-phone-cam"></span></div><div id="${RID}" class="th-phone-screen"></div></div>`, {
    maxWidth: THR_MODAL_MAXW, reset: true, revive: openApp,
  });
  bindRoot();
  render();
}

export function openTheater(): void {
  _view = { name: 'list' }; _sheet = null;
  openApp();
}

registerWorldApp({
  id: 'theater', name: '小剧场', icon: 'fa-masks-theater',
  accent: 'linear-gradient(135deg,#f59e0b,#ef4444)', order: 30, open: openTheater,
});

try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_theater__ = { openTheater };
} catch (e) { void e; }





