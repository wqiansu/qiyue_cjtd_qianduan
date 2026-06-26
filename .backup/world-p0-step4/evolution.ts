// 世界套件 P0-B · 世界演化（evolution.ts）
// 定位：对「玩家不在场」的角色（离场 NPC / 联系人 / 自定义）做酒馆正文之外的额外演化。
//   玩家点「推进演化」→ generateRaw 组 (角色设定 + 历史演化记忆 + 世界时间 + 玩家方向提示)
//   → 返回演化片段(json_schema:{summary, events[], 变量变化?}) → 存时间线。
//   每条结果可「注入正文」(injectPrompts 持久，可关) + 可选「应用到酒馆变量」(updateVariablesWith，二次确认)。
// 跨窗口：DOM 全走 qs（parent.document），读全局接口 window→getRoot 兜底（§4）。
// 单 modal SPA：openModal2 只调一次（reset+revive），内部视图/sheet 自渲染，绝不堆叠 modal（§10.0）。
import { esc, qs } from '../../lib/dom-utils';
import { openModal2 } from '../../status-bar-init';
import { iconHtml } from '../../lib/icons';
import { getRoot, safeGetVariables, safeUpdateVariablesWith } from '../../lib/tavern-api';
import { registerWorldApp } from '../../lib/world/world-store';
import { registerPromptTemplate, getPromptText, isPromptOverridden, listPromptTemplates, setPromptOverride, resetPrompt } from '../../lib/world/world-prompts';
import { chatGenerate, injectWorldPersistent, uninjectWorld, parseLooseJson } from '../../lib/world/ai-chat';
import { ensureSession, appendTurn, buildMemoryContext, runShortSummary } from '../../lib/world/memory';
import { makeSummarizer } from '../../lib/world/ai-chat';
import { getContacts } from '../../lib/world/contacts';
import {
  EvoEntry, EvoVarChange,
  getActors, getActor, ensureActor, deleteActor, setActorInject,
  addEntry, updateEntry, deleteEntry, buildInjectText,
} from '../../lib/world/evolution-store';

// ==================== 提示词模板注册（#8 可编辑）====================
registerPromptTemplate({
  id: 'evolution.advance', appId: 'evolution', appName: '世界演化', name: '推进演化',
  desc: '玩家不在场时，这个角色独自经历了什么。控制演化片段的笔触与产出结构。',
  vars: [
    { key: 'name', desc: '角色昵称' },
    { key: 'span', desc: '这段时间跨度（如「约半天」）' },
    { key: 'worldTime', desc: '当前世界时间锚点' },
    { key: 'direction', desc: '玩家给的方向提示（可空）' },
  ],
  default: '你是一位擅长「群像叙事」的世界推演者。现在请推演角色「{{name}}」在主角（玩家）不在场的这段时间里，独自经历了什么。\n'
    + '时间跨度：{{span}}；当前世界时间：{{worldTime}}。\n'
    + '要点：\n'
    + '· 让 ta 像一个有自己生活、目标和情绪的人那样行动——会做事、会遇人、会起心思、会变化，而不是原地待机等主角回来。\n'
    + '· 尊重 ta 的人设与既有演化记忆，保持连贯，事件要有因果、有具体细节，别空泛。\n'
    + '· 允许发生关系变化、处境变化、心境变化、意外事件；但不要凭空牵扯到主角身上、不要替主角做决定。\n'
    + (''/* direction 占位由下方拼接 */)
    + '请严格只输出 JSON：{"summary":"这段时间的整体经过（80~160字，叙事口吻）","events":["关键事件1","关键事件2"],'
    + '"变量变化":[{"path":"NPC.{{name}}.心情","value":"建议的新值"}]}。'
    + '变量变化为可选项：只在确有明确、可量化的状态变化时给出，路径用酒馆变量的点路径，没有就给空数组。不要任何额外文字。',
});

const EVO_MODAL_MAXW = 'min(880px,96vw)';
const RID = 'th-evo-app-root';
let _opening = false;
let _busy = false;

// ==================== 视图状态机 ====================
type ViewState = { name: 'list' | 'detail'; actorId?: string };
type SheetState =
  | { kind: 'pick' }                                  // 选演化对象（离场 NPC / 联系人）
  | { kind: 'advance'; actorId: string }              // 推进演化表单
  | { kind: 'varReview'; actorId: string; entryId: string } // 变量回写确认
  | { kind: 'entryEdit'; actorId: string; entryId: string } // 编辑某条演化
  | { kind: 'prompt'; id: string }                    // 提示词编辑
  | null;
let _view: ViewState = { name: 'list' };
let _sheet: SheetState = null;

function rootEl(): HTMLElement | null { return qs<HTMLElement>('#' + RID); }
function toast(kind: 'success' | 'error' | 'info' | 'warning', msg: string): void {
  try { (window as any).toastr?.[kind]?.(msg); } catch (e) { void e; }
}
function ask(msg: string, def = ''): string | null {
  try { const v = (window as any).prompt?.(msg, def); return v == null ? null : String(v); } catch (e) { void e; return null; }
}
function confirmBox(msg: string): boolean {
  try { return !!(window as any).confirm?.(msg); } catch (e) { void e; return false; }
}
function evoSessionId(actorId: string): string { return 'evo_' + actorId; }

// 读酒馆「世界信息」时间（演化锚点）。bridge 优先，跨窗口兜底。
function worldTimeLabel(): string {
  try {
    const bridge = (window as any).__thStatusBarData || (getRoot() as any).__thStatusBarData;
    const d = bridge?.getCurrentData?.();
    const w = (d && typeof d === 'object') ? (d['世界信息'] || {}) : {};
    return [w['日期'], w['时间']].filter(Boolean).join(' ');
  } catch (e) { void e; return ''; }
}

// 读离场 NPC（getCurrentData.NPC 里 是否在场 !== true 的）。返回 {name, persona}。
function offlineNpcs(): { name: string; persona: string }[] {
  try {
    const bridge = (window as any).__thStatusBarData || (getRoot() as any).__thStatusBarData;
    const d = bridge?.getCurrentData?.();
    const npc = (d && typeof d === 'object') ? (d['NPC'] || {}) : {};
    return Object.entries(npc)
      .filter(([, info]: [string, any]) => info && info['是否在场'] !== true)
      .map(([name, info]: [string, any]) => {
        const bits = [info['身份'] ? `身份：${info['身份']}` : '', info['性格'] ? `性格：${info['性格']}` : '', info['简介'] || info['描述'] || ''].filter(Boolean);
        return { name, persona: bits.join('；') };
      });
  } catch (e) { void e; return []; }
}

// MARK_RENDER

// ==================== 中央渲染 ====================
function render(): void {
  const root = rootEl();
  if (!root) {
    if (_opening) return;
    _opening = true;
    try { openApp(); } finally { _opening = false; }
    return;
  }
  root.innerHTML = viewHtml() + sheetHtml();
}
function go(v: ViewState): void { _view = v; _sheet = null; render(); }
function openSheet(s: SheetState): void { _sheet = s; render(); }
function closeSheet(): void { _sheet = null; render(); }

function viewHtml(): string {
  if (_view.name === 'detail' && _view.actorId) return detailHtml(_view.actorId);
  return listHtml();
}

function timeLabel(ts: number): string {
  try {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch (e) { void e; return ''; }
}
function avatarChip(name: string): string {
  const ch = (name || '?').slice(0, 1);
  return `<span class="th-evo-av">${esc(ch)}</span>`;
}

// MARK_LIST

// ==================== 列表视图：演化对象 ====================
function listHtml(): string {
  const actors = getActors();
  const head = `<div class="th-evo-head">
    <span class="th-evo-title">${iconHtml('fa-seedling')} 世界演化</span>
    <span class="th-evo-head-ops">
      <button class="th-evo-chip" data-evo-prompts type="button" title="提示词">${iconHtml('fa-pen')} 提示词</button>
      <button class="th-evo-primary" data-evo-pick type="button">${iconHtml('fa-plus')} 添加对象</button>
    </span>
  </div>`;
  const intro = `<div class="th-evo-intro">推进「玩家不在场」的角色独自演化，结果可注入正文、可回写变量。</div>`;
  if (!actors.length) {
    return `<div class="th-evo-app" data-evo-view="list">${head}${intro}
      <div class="th-evo-empty">${iconHtml('fa-seedling')}
        <div>还没有演化对象</div>
        <div class="th-evo-empty-sub">点「添加对象」，从离场 NPC 或联系人里挑一个开始</div>
      </div></div>`;
  }
  const rows = actors.map(a => {
    const last = a.timeline[a.timeline.length - 1];
    const preview = last ? esc(last.summary.slice(0, 48)) : '尚未推进演化';
    return `<button class="th-evo-actor-row" data-evo-open="${esc(a.id)}" type="button">
      ${avatarChip(a.name)}
      <span class="th-evo-actor-main">
        <span class="th-evo-actor-name">${esc(a.name)}
          ${a.injectEnabled ? `<span class="th-evo-flag" title="演化注入正文已开">${iconHtml('fa-syringe')}</span>` : ''}
          <span class="th-evo-actor-count">${a.timeline.length} 段</span>
        </span>
        <span class="th-evo-actor-preview">${preview}</span>
      </span>
      <span class="th-evo-actor-time">${last ? timeLabel(last.ts) : ''}</span>
    </button>`;
  }).join('');
  return `<div class="th-evo-app" data-evo-view="list">${head}${intro}
    <div class="th-evo-actor-list">${rows}</div></div>`;
}

// MARK_DETAIL

// ==================== 详情视图：单角色时间线 ====================
function detailHtml(actorId: string): string {
  const a = getActor(actorId);
  if (!a) return `<div class="th-evo-app">${backHead('对象不存在')}</div>`;
  const head = `<div class="th-evo-subhead">
    <button class="th-evo-back" data-evo-back type="button">${iconHtml('fa-arrow-left')}</button>
    ${avatarChip(a.name)}
    <span class="th-evo-subtitle">${esc(a.name)}</span>
    <span class="th-evo-head-ops">
      <label class="th-evo-inject-toggle" title="把该角色最近的演化持续注入酒馆正文生成">
        <input type="checkbox" data-evo-inject ${a.injectEnabled ? 'checked' : ''}> ${iconHtml('fa-syringe')} 注入正文
      </label>
      <button class="th-evo-del" data-evo-actor-del type="button" title="删除对象">${iconHtml('fa-trash')}</button>
    </span>
  </div>`;
  const persona = a.persona ? `<div class="th-evo-persona">${iconHtml('fa-id-card')} ${esc(a.persona.slice(0, 120))}</div>` : '';
  const advanceBar = `<div class="th-evo-advancebar">
    <button class="th-evo-primary th-evo-advance-btn" data-evo-advance type="button" ${_busy ? 'disabled' : ''}>
      ${iconHtml('fa-forward')} ${_busy ? '推演中…' : '推进演化'}
    </button>
  </div>`;

  const timeline = a.timeline.length
    ? a.timeline.slice().reverse().map(e => entryCardHtml(e)).join('')
    : `<div class="th-evo-empty-sub" style="padding:20px;text-align:center">还没有演化。点「推进演化」让 ${esc(a.name)} 动起来。</div>`;

  return `<div class="th-evo-app" data-evo-view="detail" data-evo-aid="${esc(a.id)}">
    ${head}${persona}${advanceBar}
    <div class="th-evo-timeline">${timeline}</div></div>`;
}

function entryCardHtml(e: EvoEntry): string {
  const events = e.events && e.events.length
    ? `<ul class="th-evo-events">${e.events.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  const vc = e.varChanges && e.varChanges.length
    ? `<div class="th-evo-varhint">${iconHtml('fa-database')} ${e.varChanges.length} 项变量变化建议
        <button class="th-evo-chip th-evo-chip-sm" data-evo-varreview="${esc(e.id)}" type="button">查看/应用</button></div>` : '';
  return `<div class="th-evo-entry" data-evo-entry="${esc(e.id)}">
    <div class="th-evo-entry-top">
      <span class="th-evo-entry-when">${e.worldTime ? esc(e.worldTime) + ' · ' : ''}${e.span ? esc(e.span) : timeLabel(e.ts)}</span>
      <span class="th-evo-entry-ops">
        <button data-evo-entry-edit="${esc(e.id)}" title="编辑">${iconHtml('fa-pen')}</button>
        <button data-evo-entry-del="${esc(e.id)}" title="删除">${iconHtml('fa-xmark')}</button>
      </span>
    </div>
    <div class="th-evo-entry-summary">${esc(e.summary)}</div>
    ${events}${vc}
  </div>`;
}

function backHead(title: string): string {
  return `<div class="th-evo-subhead"><button class="th-evo-back" data-evo-back type="button">${iconHtml('fa-arrow-left')}</button><span class="th-evo-subtitle">${esc(title)}</span></div>`;
}

// MARK_SHEET

// ==================== app 内底部 sheet（不堆叠 modal）====================
function sheetHtml(): string {
  if (!_sheet) return '';
  let title = ''; let inner = '';
  if (_sheet.kind === 'pick') {
    title = '添加演化对象';
    const npcs = offlineNpcs();
    const existRefs = new Set(getActors().map(a => `${a.source}:${a.sourceRef || a.name}`));
    const npcList = npcs.length
      ? npcs.map(n => `<button class="th-evo-pick-item${existRefs.has('npc:' + n.name) ? ' th-evo-pick-done' : ''}" data-evo-pick-npc="${esc(n.name)}" data-evo-persona="${esc(n.persona)}" type="button">
          ${avatarChip(n.name)}<span class="th-evo-pick-name">${esc(n.name)}</span>
          <span class="th-evo-pick-tag">离场 NPC${existRefs.has('npc:' + n.name) ? ' · 已添加' : ''}</span></button>`).join('')
      : `<div class="th-evo-empty-sub" style="padding:12px">当前没有离场 NPC（NPC.是否在场=false）。</div>`;
    const contacts = getContacts();
    const ctList = contacts.length
      ? contacts.map(c => `<button class="th-evo-pick-item${existRefs.has('contact:' + c.id) ? ' th-evo-pick-done' : ''}" data-evo-pick-contact="${esc(c.id)}" type="button">
          ${avatarChip(c.name)}<span class="th-evo-pick-name">${esc(c.name)}</span>
          <span class="th-evo-pick-tag">联系人${existRefs.has('contact:' + c.id) ? ' · 已添加' : ''}</span></button>`).join('')
      : `<div class="th-evo-empty-sub" style="padding:12px">还没有联系人。</div>`;
    inner = `<div class="th-evo-pick">
      <div class="th-evo-pick-group"><div class="th-evo-pick-glabel">离场 NPC</div>${npcList}</div>
      <div class="th-evo-pick-group"><div class="th-evo-pick-glabel">联系人</div>${ctList}</div>
      <div class="th-evo-pick-group">
        <button class="th-evo-chip" data-evo-pick-custom type="button">${iconHtml('fa-user-plus')} 自定义一个对象</button>
      </div>
    </div>`;
  } else if (_sheet.kind === 'advance') {
    const a = getActor(_sheet.actorId);
    title = '推进演化 · ' + (a?.name || '');
    inner = `<div class="th-evo-form">
      <label class="th-evo-frow th-evo-frow-stack">
        <span>时间跨度（这段不在场过了多久）</span>
        <input type="text" class="th-evo-field th-evo-f-span" value="约半天" placeholder="如：约半天 / 三天 / 一个月">
      </label>
      <label class="th-evo-frow th-evo-frow-stack">
        <span>世界时间锚点（可选，留空自动读世界信息）</span>
        <input type="text" class="th-evo-field th-evo-f-worldtime" value="${esc(worldTimeLabel())}" placeholder="如：第三日 黄昏">
      </label>
      <label class="th-evo-frow th-evo-frow-stack">
        <span>方向提示（可选，给个走向/侧重）</span>
        <textarea class="th-evo-field th-evo-f-dir" rows="2" placeholder="如：让她在这段时间里筹备一件事 / 遇到旧识 / 心境转变…"></textarea>
      </label>
      <div class="th-evo-form-actions">
        <button class="th-evo-primary" data-evo-advance-run type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-forward')} 开始推演</button>
      </div>
    </div>`;
  } else if (_sheet.kind === 'varReview') {
    const eid = _sheet.entryId;
    const a = getActor(_sheet.actorId);
    const entry = a?.timeline.find(x => x.id === eid);
    title = '变量回写确认';
    const list = (entry?.varChanges || []).map((v, i) => `
      <label class="th-evo-varrow">
        <input type="checkbox" class="th-evo-varck" data-evo-var-idx="${i}" checked>
        <span class="th-evo-var-path">${esc(v.path)}</span>
        <span class="th-evo-var-arrow">→</span>
        <input type="text" class="th-evo-field th-evo-varval" data-evo-var-idx="${i}" value="${esc(v.value)}">
      </label>`).join('');
    inner = `<div class="th-evo-varreview">
      <div class="th-evo-warn">${iconHtml('fa-triangle-exclamation')} 这会改写酒馆变量，操作不可自动撤销。仅勾选你确认无误的项。</div>
      ${list || '<div class="th-evo-empty-sub">没有可应用的变量变化。</div>'}
      ${entry?.varChanges?.length ? `<div class="th-evo-form-actions"><button class="th-evo-primary" data-evo-var-apply type="button">${iconHtml('fa-check')} 应用所选</button></div>` : ''}
    </div>`;
  } else if (_sheet.kind === 'entryEdit') {
    const a = getActor(_sheet.actorId);
    const entry = a?.timeline.find(x => x.id === (_sheet as any).entryId);
    title = '编辑这段演化';
    inner = `<div class="th-evo-form">
      <label class="th-evo-frow th-evo-frow-stack"><span>世界时间</span>
        <input type="text" class="th-evo-field th-evo-e-worldtime" value="${esc(entry?.worldTime || '')}"></label>
      <label class="th-evo-frow th-evo-frow-stack"><span>摘要</span>
        <textarea class="th-evo-field th-evo-e-summary" rows="5">${esc(entry?.summary || '')}</textarea></label>
      <label class="th-evo-frow th-evo-frow-stack"><span>关键事件（每行一条）</span>
        <textarea class="th-evo-field th-evo-e-events" rows="3">${esc((entry?.events || []).join('\n'))}</textarea></label>
      <div class="th-evo-form-actions"><button class="th-evo-primary" data-evo-entry-save type="button">${iconHtml('fa-check')} 保存</button></div>
    </div>`;
  } else if (_sheet.kind === 'prompt') {
    const tpl = listPromptTemplates('evolution').find(t => t.id === (_sheet as any).id);
    title = '提示词 · ' + (tpl?.name || '');
    const varsHtml = (tpl?.vars || []).map(v => `<code>{{${esc(v.key)}}}</code> ${esc(v.desc)}`).join('　');
    inner = `<div class="th-evo-form">
      ${varsHtml ? `<div class="th-evo-prompt-vars">可用占位符：${varsHtml}</div>` : ''}
      <textarea class="th-evo-field th-evo-prompt-text" rows="9">${esc(getPromptText((_sheet as any).id))}</textarea>
      <div class="th-evo-form-actions">
        <button class="th-evo-chip" data-evo-prompt-reset type="button">${iconHtml('fa-rotate-left')} 恢复默认</button>
        <button class="th-evo-primary" data-evo-prompt-save type="button">${iconHtml('fa-check')} 保存</button>
      </div>
    </div>`;
  }
  return `<div class="th-evo-sheet-mask" data-evo-sheet-close>
    <div class="th-evo-sheet" role="dialog">
      <div class="th-evo-sheet-head"><span>${esc(title)}</span>
        <button class="th-evo-sheet-x" data-evo-sheet-close type="button">${iconHtml('fa-xmark')}</button></div>
      <div class="th-evo-sheet-body">${inner}</div>
    </div>
  </div>`;
}

// MARK_PROMPTS_LIST

// 提示词列表 sheet（从「提示词」按钮进；本 APP 仅 1 个模板，直接进编辑）
function openPromptsList(): void {
  const tpls = listPromptTemplates('evolution');
  if (tpls.length === 1) { openSheet({ kind: 'prompt', id: tpls[0].id }); return; }
  // 多模板时也直接进第一个（本 APP 目前只有一个）
  if (tpls.length) openSheet({ kind: 'prompt', id: tpls[0].id });
}
void isPromptOverridden; // 预留：未来在列表标注「·改」

// MARK_EVT

// ==================== 事件绑定（一次性委托）====================
function bindRoot(): void {
  const root = rootEl();
  if (!root || (root as any)._evoBound) return;
  (root as any)._evoBound = true;
  root.addEventListener('click', (e: Event) => { void onClick(e); });
  root.addEventListener('change', (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-evo-inject]') && _view.name === 'detail' && _view.actorId) {
      const on = (t as HTMLInputElement).checked;
      setActorInject(_view.actorId, on);
      syncInject(_view.actorId, on);
      toast('info', on ? '已开启：演化将注入正文' : '已关闭演化注入');
    }
  });
}

async function onClick(e: Event): Promise<void> {
  const t = e.target as HTMLElement;
  // sheet 关闭
  if (t.closest('[data-evo-sheet-close]')) {
    const onMask = (t as HTMLElement).classList?.contains('th-evo-sheet-mask');
    const onX = !!t.closest('.th-evo-sheet-x');
    if (onMask || onX) { closeSheet(); return; }
  }
  if (t.closest('[data-evo-back]')) { go({ name: 'list' }); return; }
  if (t.closest('[data-evo-prompts]')) { openPromptsList(); return; }
  if (t.closest('[data-evo-pick]')) { openSheet({ kind: 'pick' }); return; }

  const openBtn = t.closest('[data-evo-open]') as HTMLElement | null;
  if (openBtn) { go({ name: 'detail', actorId: openBtn.getAttribute('data-evo-open') || '' }); return; }

  if (await onSheetClick(t)) return;
  if (onDetailClick(t)) return;
}

// 详情视图点击
function onDetailClick(t: HTMLElement): boolean {
  if (_view.name !== 'detail' || !_view.actorId) return false;
  const aid = _view.actorId;
  if (t.closest('[data-evo-advance]')) { openSheet({ kind: 'advance', actorId: aid }); return true; }
  if (t.closest('[data-evo-actor-del]')) {
    if (confirmBox('删除这个演化对象及其全部时间线？')) { uninjectWorld('th_world_evo_' + aid); deleteActor(aid); go({ name: 'list' }); }
    return true;
  }
  const vr = t.closest('[data-evo-varreview]') as HTMLElement | null;
  if (vr) { openSheet({ kind: 'varReview', actorId: aid, entryId: vr.getAttribute('data-evo-varreview') || '' }); return true; }
  const ee = t.closest('[data-evo-entry-edit]') as HTMLElement | null;
  if (ee) { openSheet({ kind: 'entryEdit', actorId: aid, entryId: ee.getAttribute('data-evo-entry-edit') || '' }); return true; }
  const ed = t.closest('[data-evo-entry-del]') as HTMLElement | null;
  if (ed) { if (confirmBox('删除这段演化？')) { deleteEntry(aid, ed.getAttribute('data-evo-entry-del') || ''); refreshInject(aid); render(); } return true; }
  return false;
}

// MARK_EVT_SHEET

function fieldVal(sel: string): string {
  const el = rootEl()?.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null;
  return el ? el.value.trim() : '';
}

// sheet 点击。返回 true=已处理。
async function onSheetClick(t: HTMLElement): Promise<boolean> {
  if (!_sheet) return false;
  // ---- 选对象 ----
  if (_sheet.kind === 'pick') {
    const npc = t.closest('[data-evo-pick-npc]') as HTMLElement | null;
    if (npc) {
      const name = npc.getAttribute('data-evo-pick-npc') || '';
      const persona = npc.getAttribute('data-evo-persona') || '';
      const a = ensureActor({ source: 'npc', sourceRef: name, name, persona });
      go({ name: 'detail', actorId: a.id }); return true;
    }
    const ct = t.closest('[data-evo-pick-contact]') as HTMLElement | null;
    if (ct) {
      const id = ct.getAttribute('data-evo-pick-contact') || '';
      const c = getContacts().find(x => x.id === id);
      if (c) { const a = ensureActor({ source: 'contact', sourceRef: c.id, name: c.name, persona: c.persona }); go({ name: 'detail', actorId: a.id }); }
      return true;
    }
    if (t.closest('[data-evo-pick-custom]')) {
      const name = ask('对象名称：'); if (name == null || !name.trim()) return true;
      const persona = ask('角色设定（可空）：', '') || '';
      const a = ensureActor({ source: 'custom', name: name.trim(), persona: persona.trim() });
      go({ name: 'detail', actorId: a.id }); return true;
    }
    return true;
  }
  // ---- 推进演化 ----
  if (_sheet.kind === 'advance') {
    if (t.closest('[data-evo-advance-run]')) {
      const aid = _sheet.actorId;
      const span = fieldVal('.th-evo-f-span') || '一段时间';
      const worldTime = fieldVal('.th-evo-f-worldtime') || worldTimeLabel();
      const dir = fieldVal('.th-evo-f-dir');
      await runAdvance(aid, { span, worldTime, direction: dir });
      return true;
    }
    return true;
  }
  // ---- 变量回写 ----
  if (_sheet.kind === 'varReview') {
    if (t.closest('[data-evo-var-apply]')) { applyVarChanges(_sheet.actorId, _sheet.entryId); return true; }
    return true;
  }
  // ---- 编辑条目 ----
  if (_sheet.kind === 'entryEdit') {
    if (t.closest('[data-evo-entry-save]')) {
      const aid = _sheet.actorId; const eid = _sheet.entryId;
      const summary = fieldVal('.th-evo-e-summary');
      const worldTime = fieldVal('.th-evo-e-worldtime');
      const events = (rootEl()?.querySelector('.th-evo-e-events') as HTMLTextAreaElement | null)?.value
        .split('\n').map(s => s.trim()).filter(Boolean) || [];
      updateEntry(aid, eid, { summary, worldTime, events });
      refreshInject(aid);
      toast('success', '已保存'); closeSheet(); return true;
    }
    return true;
  }
  // ---- 提示词编辑 ----
  if (_sheet.kind === 'prompt') {
    const id = _sheet.id;
    if (t.closest('[data-evo-prompt-save]')) {
      const txt = (rootEl()?.querySelector('.th-evo-prompt-text') as HTMLTextAreaElement | null)?.value ?? '';
      setPromptOverride(id, txt);
      toast('success', '已保存提示词'); closeSheet(); return true;
    }
    if (t.closest('[data-evo-prompt-reset]')) {
      resetPrompt(id);
      toast('success', '已恢复默认'); render(); return true;
    }
    return true;
  }
  return false;
}

// MARK_AI

// ==================== 推进演化（AI 一发）====================
async function runAdvance(actorId: string, opts: { span: string; worldTime: string; direction: string }): Promise<void> {
  if (_busy) { toast('warning', '正在推演，请稍候'); return; }
  const a = getActor(actorId); if (!a) return;
  const sid = evoSessionId(actorId);
  ensureSession({ id: sid, appId: 'evolution', appName: '世界演化', title: a.name });

  _busy = true; closeSheet(); render(); // 关 sheet 并刷新出「推演中」态
  toast('info', `正在推演 ${a.name} 的离场经历…`);
  try {
    const mem = buildMemoryContext(sid);
    const dirLine = opts.direction ? `玩家给的方向提示：${opts.direction}\n` : '';
    const instruction = getPromptText('evolution.advance')
      .replace(/\{\{\s*name\s*\}\}/g, a.name)
      .replace(/\{\{\s*span\s*\}\}/g, opts.span)
      .replace(/\{\{\s*worldTime\s*\}\}/g, opts.worldTime || '未知')
      .replace(/\{\{\s*direction\s*\}\}/g, opts.direction || '（无）');

    const systemParts = [
      a.persona ? `【角色设定】${a.name}：${a.persona}` : `角色：${a.name}`,
      instruction,
    ];
    if (mem.memoryText) systemParts.push('【该角色既有的演化记忆，保持连贯】\n' + mem.memoryText);
    const system = systemParts.filter(Boolean).join('\n\n');
    const history = mem.recentTurns.map(t => `${t.role === 'user' ? '推进' : '经历'}：${t.content}`).join('\n');
    const user = dirLine + (history ? '此前演化：\n' + history + '\n\n' : '') + `请推演 ${a.name} 在这段「${opts.span}」里独自经历了什么。`;

    const schema = {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        events: { type: 'array', items: { type: 'string' } },
        变量变化: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, value: { type: 'string' } }, required: ['path', 'value'] } },
      },
      required: ['summary'],
    };
    const raw = await chatGenerate({ system, user, jsonSchema: schema });
    const obj = parseLooseJson(raw) || {};
    const summary = String(obj.summary || raw || '').trim();
    if (!summary) { toast('error', '推演没有返回有效内容'); return; }
    const events: string[] = Array.isArray(obj.events) ? obj.events.map((x: any) => String(x).trim()).filter(Boolean) : [];
    const varChanges: EvoVarChange[] = Array.isArray(obj['变量变化'])
      ? obj['变量变化'].map((v: any) => ({ path: String(v?.path || '').trim(), value: String(v?.value ?? '').trim() })).filter((v: EvoVarChange) => v.path)
      : [];

    addEntry(actorId, { summary, events, varChanges, worldTime: opts.worldTime, span: opts.span });
    // 记忆：把这次演化记一笔（user=推进意图，assistant=演化结果），达阈值自动小结
    appendTurn(sid, 'user', `推进演化（${opts.span}${opts.direction ? '，方向：' + opts.direction : ''}）`);
    const after = appendTurn(sid, 'assistant', summary + (events.length ? '\n关键事件：' + events.join('；') : ''));
    if (after.reachedThreshold) { try { await runShortSummary(sid, makeSummarizer()); } catch (e) { void e; } }
    refreshInject(actorId);
    toast('success', `${a.name} 的演化已生成`);
  } catch (err) {
    toast('error', '推演失败：' + (err instanceof Error ? err.message : String(err)));
  } finally {
    _busy = false; render();
  }
}

// ==================== 变量回写（二次确认后写）====================
function applyVarChanges(actorId: string, entryId: string): void {
  const a = getActor(actorId); if (!a) return;
  const entry = a.timeline.find(x => x.id === entryId); if (!entry || !entry.varChanges?.length) return;
  const root = rootEl(); if (!root) return;
  // 收集勾选项 + 当前输入框值
  const picks: EvoVarChange[] = [];
  entry.varChanges.forEach((v, i) => {
    const ck = root.querySelector(`.th-evo-varck[data-evo-var-idx="${i}"]`) as HTMLInputElement | null;
    const val = root.querySelector(`.th-evo-varval[data-evo-var-idx="${i}"]`) as HTMLInputElement | null;
    if (ck?.checked) picks.push({ path: v.path, value: (val?.value ?? v.value).trim() });
  });
  if (!picks.length) { toast('warning', '没有勾选任何变量'); return; }
  if (!confirmBox(`确认把 ${picks.length} 项变量写入酒馆？此操作不可自动撤销。`)) return;
  try {
    safeUpdateVariablesWith((vars: Record<string, any>) => {
      for (const p of picks) setByPath(vars, p.path, coerce(p.value));
      return vars;
    }, { type: 'message' });
    toast('success', `已写入 ${picks.length} 项变量`);
    closeSheet();
  } catch (e) {
    toast('error', '写入失败：' + (e instanceof Error ? e.message : String(e)));
  }
}

// 把字符串值尝试转成更合适的类型（数字/布尔/原样）
function coerce(v: string): any {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}
// 按点路径写入对象（不依赖 lodash，简单实现）
function setByPath(obj: Record<string, any>, path: string, value: any): void {
  const keys = path.split('.').map(s => s.trim()).filter(Boolean);
  if (!keys.length) return;
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (typeof cur[k] !== 'object' || cur[k] == null) cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}
void safeGetVariables; // 预留：未来读取现值做 diff 展示

// ==================== 注入正文（持久，可控开关）====================
function injectId(actorId: string): string { return 'th_world_evo_' + actorId; }
// 开关切换时：on→重建注入；off→撤销
function syncInject(actorId: string, on: boolean): void {
  if (on) refreshInject(actorId);
  else uninjectWorld(injectId(actorId));
}
// 内容变化（新增/编辑/删除条目）后，若该对象注入开着，用最新文本重建注入
function refreshInject(actorId: string): void {
  const a = getActor(actorId); if (!a) return;
  if (!a.injectEnabled) return;
  const text = buildInjectText(actorId, 3);
  if (text) injectWorldPersistent(injectId(actorId), text);
  else uninjectWorld(injectId(actorId));
}

// 启动时把所有「注入开启」的对象重新注入一次（脚本重载/换聊天后恢复）
function reviveAllInjects(): void {
  try { for (const a of getActors()) { if (a.injectEnabled) refreshInject(a.id); } } catch (e) { void e; }
}

// MARK_REGISTER

// ==================== 公开入口 + 注册 ====================
function openApp(): void {
  openModal2(`${iconHtml('fa-seedling')} 世界演化`, `<div id="${RID}" class="th-evo"></div>`, {
    maxWidth: EVO_MODAL_MAXW, reset: true, revive: openApp,
  });
  bindRoot();
  render();
}

export function openEvolution(): void {
  _view = { name: 'list' }; _sheet = null;
  openApp();
}

registerWorldApp({
  id: 'evolution', name: '世界演化', icon: 'fa-seedling',
  accent: 'linear-gradient(135deg,#0ea5e9,#6366f1)', order: 20, open: openEvolution,
});

// 模块加载即恢复已开启的持久注入（脚本重载后不丢）
reviveAllInjects();

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_evolution__ = { openEvolution };
} catch (e) { void e; }








