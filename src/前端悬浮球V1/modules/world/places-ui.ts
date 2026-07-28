// ============================================================================
// places-ui.ts — 地点演化独立视图（世界演化顶部「地点」tab）
//
// 由 evolution.ts 以 host 方式挂载：_mode==='places' 时主区交给 placesInnerHtml；
// 点击/change 先经 placesClick/placesChange（返回 true 即已处理），再由 evolution 统一 render()。
//
// 核心：地点推演是「镜头外这个地方自己在过日子」，绝不把正文主角搬进来演戏（见 place-prompts）。
// ============================================================================
import { esc } from '../../lib/dom-utils';
import { iconHtml } from '../../lib/icons';
import { thToast, thConfirm, thPrompt } from '../../lib/world/ui-kit';
import { getWorldApiPresetNames as getApiPresetNames } from '../../lib/world/world-api';
import { chatGenerate, readTavernFloors, parseLooseJson } from '../../lib/world/ai-chat';
import { getPromptText } from '../../lib/world/world-prompts';
import { QUALITY_EVOLUTION } from '../../lib/world/prompt-kit';
import { isWorldbookAvailable, buildInjectFromKeys, parseWbEntryKey } from '../../lib/world/worldbook';
import { wbPickerHtml, bindWbPicker } from '../../lib/world/wb-picker';
import { registerInjectPlan } from '../../lib/world/inject-plan';
import { getWStateConfig } from '../../lib/world/world-state-store';
import { addChronicle } from '../../lib/world/evolution-store';
import {
  getPlaces, addPlace, removePlace, editPlace, mergePlacesUpdate, resetPlaces, hasPlaces,
} from '../../lib/world/place-store';
import '../../lib/world/place-prompts'; // 注册 wplace.* 提示词

let _requestRender: () => void = () => {};
export function placesSetRender(fn: () => void): void { _requestRender = fn; }

let _busy = false;
let _sel: string | null = null;          // 选中的地点名（右栏详情）
let _sheet: 'pick' | 'streaming' | null = null;
let _pickSel: string[] = [];             // 复选器选中条目 key

function plJailbreak(): string { return (getPromptText('wplace.jailbreak') || '').trim(); }

// ---- 推演：一个或全部地点 ----
async function runPlaceAdvance(names: string[]): Promise<void> {
  if (_busy) { thToast('正在推演，请稍候', 'warn'); return; }
  const targets = getPlaces().filter(p => names.includes(p.name));
  if (!targets.length) { thToast('没有可推演的地点，先绑定地点世界书条目', 'warn'); return; }
  _busy = true; _sheet = 'streaming'; _requestRender();
  try {
    const cfg = getWStateConfig();
    // 拼绑定设定：全局锚点 + 各地点专属条目
    const wbKeys = [...(cfg.globalWbKeys || [])];
    for (const p of targets) if (p.wbKey) wbKeys.push(p.wbKey);
    const wbText = wbKeys.length ? await buildInjectFromKeys(Array.from(new Set(wbKeys))) : '';
    const floors = cfg.readFloors > 0 ? readTavernFloors(cfg.readFloors) : '';
    const placesBlock = targets.map(p => `· ${p.name}${p.wbKey ? '（已绑定设定，见上方）' : ''}：目前记录「${p.busy || '暂无动静'}」`).join('\n');
    const toneBlock = cfg.tonePrompt && cfg.tonePrompt.trim() ? cfg.tonePrompt.trim() : '明亮轻松的日常基调，跟随绑定世界书设定。';
    const tpl = getPromptText('wplace.advance')
      .replace(/\{\{\s*places\s*\}\}/g, placesBlock)
      .replace(/\{\{\s*tone\s*\}\}/g, toneBlock);
    const system = (wbText ? `【绑定设定（地点与世界观的唯一事实来源，务必遵守）】\n${wbText}\n\n` : '')
      + (floors ? `【正文（仅供对齐当前时节/时段/流速，不要复述、不要把这里的角色搬进地点）】\n${floors}\n\n` : '')
      + tpl;
    const user = `请推进${targets.length > 1 ? '这些地点' : `「${targets[0].name}」`}镜头外的最新动静一小步，只输出 JSON。`;
    const raw = await chatGenerate({ system, user, aiPresetName: cfg.aiPresetName || undefined, shouldStream: false, jailbreak: plJailbreak(), qualityBlocks: QUALITY_EVOLUTION });
    const obj = parseLooseJson(raw);
    if (!obj || typeof obj !== 'object') { thToast('推演没有返回有效 JSON', 'error'); return; }
    mergePlacesUpdate(obj);
    // 编年史补全：地点推进也沉淀一条（取更新后第一个目标地点的最新动静）。
    try {
      const first = getPlaces().find(p => names.includes(p.name));
      if (first?.busy) addChronicle({ text: `${first.name}：${String(first.busy).slice(0, 100)}`, actorName: first.name });
    } catch (e) { void e; }
    thToast(targets.length > 1 ? '地点已整体推进' : `「${targets[0].name}」已更新`, 'success');
    _sheet = null;
  } catch (err) {
    thToast('推演失败：' + (err instanceof Error ? err.message : String(err)), 'error');
    _sheet = null;
  } finally {
    _busy = false; _requestRender();
  }
}

// ---- 视图 ----
export function placesInnerHtml(): string {
  const places = getPlaces();
  const head = `<div class="th-ws-head">
    <span class="th-ws-round">${iconHtml('fa-location-dot')} 地点后台 · ${places.length} 处</span>
    <span class="th-ws-head-ops">
      <button class="th-ws-chipbtn" data-pl-add type="button" ${isWorldbookAvailable() ? '' : 'disabled'}>${iconHtml('fa-plus')} 绑定地点</button>
      <button class="th-ws-primary" data-pl-advance-all type="button" ${_busy || !places.length ? 'disabled' : ''}>${iconHtml('fa-gauge-high')} 演化全部地点</button>
    </span>
  </div>`;

  if (!places.length) {
    const hint = `<div class="th-ws-firsthint">${iconHtml('fa-location-dot')}<div>推演各<b>地点</b>在主角镜头之外的日常。先点<b>「绑定地点」</b>从世界书挑地点条目，绑定后即可单独或整体推演。<br><em>只写地方本身，不把正文角色拉进来演戏。</em></div></div>`;
    return `<div class="th-pl-outer">${head}${hint}</div>${placesSheetHtml()}`;
  }

  const list = places.map(p => {
    const on = _sel === p.name;
    return `<button class="th-ws-ent${on ? ' on' : ''}" data-pl-sel="${esc(p.name)}" type="button">
      <span class="th-ws-ent-n">${iconHtml('fa-location-dot')} ${esc(p.name)}${p.wbKey ? ' <em class="th-ws-tag th-ws-tag-wb">设定</em>' : ''}</span>
      <span class="th-ws-ent-sub">${esc(p.busy || '（还没什么动静）')}</span></button>`;
  }).join('');

  const detail = placesDetailHtml();
  return `<div class="th-pl-outer">${head}
    <div class="th-pl-cols">
      <aside class="th-pl-list">${list}</aside>
      <section class="th-pl-detail">${detail}</section>
    </div>
  </div>${placesSheetHtml()}`;
}

function placesDetailHtml(): string {
  if (!_sel) return `<div class="th-ws-einsp-empty">${iconHtml('fa-hand-pointer')}<div>选择左侧一个地点，查看它镜头外的近况，或单独推演它。</div></div>`;
  const p = getPlaces().find(x => x.name === _sel);
  if (!p) return `<div class="th-ws-einsp-empty">${iconHtml('fa-hand-pointer')}<div>地点已移除。</div></div>`;
  return `<div class="th-pl-card">
    <div class="th-pl-card-head">${iconHtml('fa-location-dot')} ${esc(p.name)}${p.wbKey ? ' <em class="th-ws-tag th-ws-tag-wb">已绑设定</em>' : ''}</div>
    <div class="th-pl-field"><b>动态</b><span>${esc(p.busy || '——')}</span><button class="th-pl-mini" data-pl-edit="busy" type="button" title="编辑">${iconHtml('fa-pen')}</button></div>
    <div class="th-pl-field"><b>出没</b><span>${esc(p.who || '——')}</span><button class="th-pl-mini" data-pl-edit="who" type="button" title="编辑">${iconHtml('fa-pen')}</button></div>
    <div class="th-pl-field"><b>氛围</b><span>${esc(p.mood || '——')}</span><button class="th-pl-mini" data-pl-edit="mood" type="button" title="编辑">${iconHtml('fa-pen')}</button></div>
    <div class="th-pl-ops">
      <button class="th-ws-primary" data-pl-advance-one type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-gauge-high')} 单独演化这里</button>
      <button class="th-pl-mini th-ws-danger" data-pl-del type="button">${iconHtml('fa-trash')} 移除</button>
    </div>
    <div class="th-ws-einsp-hint">${iconHtml('fa-circle-info')} 只推这一个地点，比整体演化更聚焦省 token。地点动静与正文时间线同步，但不会把正文角色拉进来。</div>
  </div>`;
}

function placesSheetHtml(): string {
  if (!_sheet) return '';
  let title = ''; let inner = '';
  if (_sheet === 'streaming') { title = '正在推演…'; inner = `<div class="th-ws-streaming">${iconHtml('fa-gauge-high')}<div class="th-ws-streaming-t">地点后台推演中…</div></div>`; }
  else if (_sheet === 'pick') {
    title = '绑定地点世界书条目（可多选）';
    inner = `<div class="th-ws-wbpick-host" data-pl-pick>
      <div class="th-ws-set-hint">挑「地点」世界书条目（场所/场景），绑定后即可推演这些地方镜头外的日常。地点环境与常驻人物以条目内容为准，可一次勾选多个。</div>
      <div class="th-ws-wbadd" style="margin:8px 0"><button class="th-ws-primary" data-pl-pick-done type="button">${iconHtml('fa-check')} 完成绑定</button></div>
      ${wbPickerHtml(_pickSel)}
    </div>`;
  }
  return `<div class="th-ws-sheet-mask" data-pl-sheet-close><div class="th-ws-sheet" data-pl-sheet-stop>
    <div class="th-ws-sheet-h"><span>${esc(title)}</span><button class="th-ws-sheet-x" data-pl-sheet-close type="button">${iconHtml('fa-xmark')}</button></div>
    <div class="th-ws-sheet-b">${inner}</div>
  </div></div>`;
}

// evolution render() 后调用：绑定地点复选器
export function placesBindPickers(root: HTMLElement): void {
  if (_sheet === 'pick') {
    const host = root.querySelector('.th-ws-wbpick-host[data-pl-pick]') as HTMLElement | null;
    if (host) bindWbPicker(host, () => _pickSel, (keys) => { _pickSel = keys; });
  }
}

// ---- 点击处理 ----
export function placesClick(t: HTMLElement): boolean {
  if (t.closest('[data-pl-sheet-close]') && !t.closest('[data-pl-sheet-stop]')) { _sheet = null; _requestRender(); return true; }
  if (t.closest('[data-pl-advance-all]')) { void runPlaceAdvance(getPlaces().map(p => p.name)); return true; }
  if (t.closest('[data-pl-advance-one]')) { if (_sel) void runPlaceAdvance([_sel]); return true; }
  const selBtn = t.closest('[data-pl-sel]') as HTMLElement | null;
  if (selBtn) { _sel = selBtn.getAttribute('data-pl-sel') || null; _requestRender(); return true; }
  if (t.closest('[data-pl-add]')) {
    _pickSel = getPlaces().filter(p => p.wbKey).map(p => p.wbKey as string);
    _sheet = 'pick'; _requestRender(); return true;
  }
  if (t.closest('[data-pl-pick-done]')) {
    const sel = _pickSel.slice();
    // 取消勾选的已绑定地点移除；新勾选的加入
    for (const p of getPlaces()) { if (p.wbKey && !sel.includes(p.wbKey)) removePlace(p.name); }
    for (const k of sel) { const { entry } = parseWbEntryKey(k); if (entry) addPlace(entry, k); }
    thToast(`已绑定 ${sel.length} 个地点`, 'success');
    _sheet = null; _requestRender(); return true;
  }
  const editBtn = t.closest('[data-pl-edit]') as HTMLElement | null;
  if (editBtn && _sel) {
    const field = editBtn.getAttribute('data-pl-edit') as 'busy' | 'who' | 'mood';
    const p = getPlaces().find(x => x.name === _sel);
    const cur = p ? (p as any)[field] || '' : '';
    const label = field === 'busy' ? '动态' : field === 'who' ? '出没的人' : '氛围';
    thPrompt({ title: `编辑「${_sel}」的${label}`, value: cur, multiline: true }).then(v => {
      if (v != null && _sel) { editPlace(_sel, { [field]: v } as any); _requestRender(); }
    });
    return true;
  }
  if (t.closest('[data-pl-del]')) {
    const name = _sel;
    if (!name) return true;
    thConfirm({ title: '移除地点', message: `不再演化「${name}」？已有的该地点动态会一并移除。`, confirmText: '移除', danger: true }).then(ok => {
      if (ok) { removePlace(name); _sel = null; thToast('已移除', 'success'); _requestRender(); }
    });
    return true;
  }
  return false;
}

// ---- 设置面板（供「世界演化 → 设置 → 地点」内联）----
export function placesSettingsPanelHtml(): string {
  const cfg = getWStateConfig();
  const presets = (() => { try { return getApiPresetNames(); } catch (e) { void e; return []; } })();
  const presetHint = cfg.aiPresetName ? `当前：${esc(cfg.aiPresetName)}` : '跟随世界态设置的推演 API';
  void presets;
  return `<div class="th-ws-form th-ws-form-embed">
    <div class="th-ws-set-hint">${iconHtml('fa-circle-info')} 地点演化与「世界态」共用同一套推演 API / 世界观锚点 / 正文楼层设置（在「世界态」分类里配置）。${esc(presetHint)}。</div>
    <div class="th-ws-set-g">${iconHtml('fa-location-dot')} 已绑定地点</div>
    <div class="th-ws-set-hint">在「地点」tab 里点「绑定地点」从世界书勾选场所条目；这里显示当前已绑定的地点数量。</div>
    <div class="th-ws-wbbound">${getPlaces().length ? getPlaces().map(p => `<span class="th-ws-wbtag">${esc(p.name)}</span>`).join('') : '<span class="th-ws-dim">还没绑定地点</span>'}</div>
    <div class="th-ws-set-g">${iconHtml('fa-database')} 数据</div>
    <button class="th-ws-danger" data-pl-reset type="button">${iconHtml('fa-trash')} 清空全部地点动态</button>
  </div>`;
}

// 设置分类里的「清空地点」也走 placesClick
export function placesSettingsClick(t: HTMLElement): boolean {
  if (t.closest('[data-pl-reset]')) {
    thConfirm({ title: '清空地点', message: '清空所有地点动态与绑定？不可恢复。', confirmText: '清空', danger: true }).then(ok => {
      if (ok) { resetPlaces(); thToast('地点已清空', 'success'); _requestRender(); }
    });
    return true;
  }
  return false;
}

// ---- 注入片段 ----
function placeSegBody(): string | null {
  const places = getPlaces().filter(p => p.busy);
  if (!places.length) return null;
  return places.slice(0, 8).map(p => `· 地点[${p.name}]：${p.busy}${p.who ? `（出没：${p.who}）` : ''}`).join('\n');
}
registerInjectPlan({
  appId: 'wplace', appName: '地点演化',
  segments: [
    {
      id: 'places', name: '地点·镜头外动静', kind: 'state',
      desc: '把各地点镜头外正在发生的日常动静注入正文，让主角所在世界的其它角落也活着。',
      module: '地点演化', what: '主角视线之外，各个地点此刻正发生的日常动静',
      guide: '后文怎么体现：作为世界背景的一部分，让这些地方的动静自然透出（路过时瞥见、别人提起、远处传来），聚焦点仍是主角当下剧情，不必逐条复述。',
      build: () => { const b = placeSegBody(); return b ? { body: b, meta: { 范围: '地点' } } : null; },
    },
  ],
});

export { hasPlaces };
