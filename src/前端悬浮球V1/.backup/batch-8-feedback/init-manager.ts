//批次2 · 任务2初始化管理模块（init-manager）。
// 把散落在总览/储藏间各处的初始化数据集中到一个面板统一管：内容看板 + 格式校验 +健康自检 +一键备份/恢复/恢复出厂 + 关联读写收拢。
// 严格向下兼容：不改现有 [初始·xxx] 条目名、不改现有 localStorage key、不破坏现有函数签名；本面板是统一入口的补充，原各处入口保留。
//命令式 innerHTML + openModal2 + data属性委托（同 api-settings/appearance-settings），不引 Vue。
// ================================================================
import {
  INITIAL_ENTRY_NAMES,
  INITIAL_ENTRY_KINDS,
  INIT_LS_KEYS,
  INIT_BACKUP_FORMAT,
} from '../lib/config';
import {
  type LinksGraph,
  type LinksNode,
  type ManagedItemV2,
  getManagedItems,
  addManagedItem,
  loadStashKinds,
  loadLinksGraph,
  mergeLinksGraphIntoLocal,
  getStashKindStorageKey,
} from '../lib/managed-store';
import { qs, qsa, esc, escAttr } from '../lib/dom-utils';
import { safeGetWorldbook, safeUpdateWorldbookWith } from '../lib/tavern-api';
import { openModal2, closeModal2, closeAllModal2 } from '../status-bar-init';
import { getCharWorldbookList } from './managed-modal';
import {
  validateInitPayload,
  type InitPayloadType,
  type ParsedImport,
  createInitialWorldbookEntry,
  openDiffPreviewModal,
  openReadInitialConfirmModal,
  readInitialDataFromWorldbook,
  parseInitialEntryContents,
  mergeInitialDataIntoLocal,
  setInitialItemsForKind,
  managedMapToInitialItems,
  downloadText,
} from './stash-io';
import {
  writeLinksGraphToInitial,
  readLinksGraphFromWorldbook,
  parseLinksGraph,
} from './links-init';
import { hasCharBook, readCharBookEntries, getCharBookEntryByName, writeCharBookEntry } from '../lib/char-book';
import {
  type InitCardKind,
  INIT_CARD_KINDS,
  getInitCards,
  getInitCardCount,
  setInitCards,
  getInitLinks,
  getInitLinksCount,
  setInitLinks,
} from '../lib/init-cards';

type EntryKey = 'location' | 'event' | 'dlc' | 'stash' | 'links';
const ENTRY_ORDER: EntryKey[] = ['location', 'event', 'dlc', 'stash', 'links'];
const ENTRY_LABEL: Record<EntryKey, string> = {
  location: '地点', event: '事件', dlc: 'DLC', stash: '储藏间', links: '关联图',
};
const ENTRY_TYPE: Record<EntryKey, InitPayloadType> = {
  location: 'location', event: 'event', dlc: 'dlc', stash: 'stash', links: 'links',
};

type EntryInstance = { book: string; uid: number; content: string };
type Health = 'missing' | 'empty' | 'parse-error' | 'ok';
type EntryState = {
  key: EntryKey;
  name: string;
  label: string;
  instances: EntryInstance[];          // 多本世界书可能有同名条目
  cardCount: number;                    // -1 = 有解析失败；links=节点数；其余=卡片数
  health: Health;
  healthMsg: string;
};

type PanelState = {
  entries: EntryState[];
  rows: RowState[];                     // 批次7：三层 8 行看板（地点/事件/DLC/物品/技能/状态/衣物/关联）
  vText: string;                        // 校验器文本（跨刷新保留）
  vType: InitPayloadType;              // 校验器类型
};

// 批次7 反馈5：三层存储模型——实时卡片 ⟷ 初始卡片(中间层) ⟷ 世界书 [初始·xxx]。
// 看板按 8 行铺开（储藏间 4 子类各一行，落到同一 [初始·储藏间] 条目的不同 group；未分类/自定义不入初始流）。
type RowKind = InitCardKind | 'links';
const ROW_ORDER: RowKind[] = ['location', 'event', 'dlc', 'stash-item', 'stash-skill', 'stash-status', 'stash-clothing', 'links'];
const ROW_LABEL: Record<RowKind, string> = {
  location: '地点', event: '事件', dlc: 'DLC',
  'stash-item': '物品', 'stash-skill': '技能', 'stash-status': '状态', 'stash-clothing': '衣物',
  links: '关联图',
};
const ROW_ICON: Record<RowKind, string> = {
  location: 'fa-solid fa-map-pin', event: 'fa-solid fa-flag', dlc: 'fa-solid fa-folder-plus',
  'stash-item': 'fa-solid fa-box-open', 'stash-skill': 'fa-solid fa-book',
  'stash-status': 'fa-solid fa-sparkles', 'stash-clothing': 'fa-solid fa-shirt',
  links: 'fa-solid fa-diagram-project',
};
type RowState = {
  kind: RowKind;
  live: number;      // 实时卡片数（managed / 关联节点）
  init: number;      // 初始卡片层数
  wb: number;        // 世界书条目内数
  wbErr: boolean;    // 世界书条目解析失败
};

let st: PanelState = { entries: [], rows: [], vText: '', vType: 'stash' };

// ====================面板入口 ====================

export async function openInitManager(): Promise<void> {
  const entries = await gatherInitState();
  st = { entries, rows: buildRows(entries), vText: st.vText, vType: st.vType };
  const html = renderInitPanel(st);
  openModal2(`<i class="fa-solid fa-database"></i>初始化管理`, html, { maxWidth: 'min(900px,95vw)', reset: true, revive: () => { void openInitManager(); } });
  setTimeout(() => bindInitEvents(), 50);
}

//刷新看板：重新读取世界书状态后重渲染面板（保留校验器文本/类型）
const refresh = async (): Promise<void> => {
  const entries = await gatherInitState();
  const state: PanelState = { entries, rows: buildRows(entries), vText: st.vText, vType: st.vType };
  st = state;
  const body = qs('.th-modal-body-2');
  if (body) { body.scrollTop = 0; body.innerHTML = renderInitPanel(state); setTimeout(() => bindInitEvents(), 40); return; }
  await openInitManager();
};

function renderInitPanel(state: PanelState): string {
  return `<div class="th-init-panel">
    <div class="th-init-toolbar">
      <span class="th-init-tip">三层数据：<b>实时卡片</b> ⟷ <b>初始卡片</b>（基线中间层） ⟷ <b>世界书 [初始]</b>。每类各自独立读写，互不影响。</span>
      <button class="th-btn-sm" id="th-init-refresh" type="button"><i class="fa-solid fa-rotate"></i>刷新看板</button>
    </div>
    ${renderTriLayerDashboard(state.rows)}
    ${renderSyncCheckSection()}
    ${renderValidator(state.vText, state.vType)}
    ${renderDiagnosticSection()}
    ${renderBackupSection()}
    ${renderPackSection()}
    ${renderCarrierSection()}
  </div>`;
}

// ==================== 批次7 反馈5：三层 8 行看板 ====================

// 由已聚合的 EntryState（世界书条目状态）+ 实时卡片 + 初始卡片层，构建 8 行三层状态。
function buildRows(entries: EntryState[]): RowState[] {
  // 世界书侧：把储藏间条目按子类拆数；location/event/dlc/links 直接取条目状态。
  const stashEntry = entries.find(e => e.key === 'stash');
  const stashWbByKind = stashEntry ? countStashWbByKind(stashEntry) : {};
  const linksEntry = entries.find(e => e.key === 'links');
  return ROW_ORDER.map((kind): RowState => {
    if (kind === 'links') {
      return {
        kind,
        live: countLiveLinks(),
        init: getInitLinksCount(),
        wb: linksEntry ? linksEntry.cardCount : 0,
        wbErr: linksEntry ? linksEntry.health === 'parse-error' : false,
      };
    }
    if (kind.startsWith('stash-')) {
      const w = stashWbByKind[kind] || { count: 0, err: false };
      return { kind, live: Object.keys(getManagedItems(kind)).length, init: getInitCardCount(kind), wb: w.count, wbErr: w.err };
    }
    // location/event/dlc：条目即单 kind
    const ent = entries.find(e => e.key === (kind as EntryKey));
    return {
      kind,
      live: Object.keys(getManagedItems(kind)).length,
      init: getInitCardCount(kind),
      wb: ent ? ent.cardCount : 0,
      wbErr: ent ? ent.health === 'parse-error' : false,
    };
  });
}

function countLiveLinks(): number {
  try { const g = loadLinksGraph(); return Object.values(g.links).reduce((s, m) => s + Object.keys(m).length, 0); } catch { return 0; }
}

// 从储藏间条目实例里逐子类数卡片（解析每本 {groups}，按 kind 累加）。
function countStashWbByKind(stashEntry: EntryState): Record<string, { count: number; err: boolean }> {
  const out: Record<string, { count: number; err: boolean }> = {};
  for (const ins of stashEntry.instances) {
    if (!(ins.content || '').trim()) continue;
    let groups: Record<string, any[]> = {};
    try { const parsed = JSON.parse(ins.content); groups = (parsed && parsed.groups) || {}; }
    catch { for (const k of ['stash-item', 'stash-skill', 'stash-status', 'stash-clothing']) { out[k] = out[k] || { count: 0, err: false }; out[k].err = true; } continue; }
    for (const k of ['stash-item', 'stash-skill', 'stash-status', 'stash-clothing']) {
      out[k] = out[k] || { count: 0, err: false };
      if (Array.isArray(groups[k])) out[k].count += groups[k].length;
    }
  }
  return out;
}

// ==================== ① 内容看板 ====================

// 一次性读取全部角色卡世界书，按 5 个初始条目名聚合状态（含多本同名合并提示）。
async function gatherInitState(): Promise<EntryState[]> {
  const books = getCharWorldbookList();
  //每个条目名 →实例清单
  const instances: Record<string, EntryInstance[]> = {};
  for (const name of Object.values(INITIAL_ENTRY_NAMES)) instances[name] = [];
  if (books.length) {
    for (const book of books) {
      let entries: any[] = [];
      try { entries = await safeGetWorldbook(book); } catch (e) { console.warn('[init-manager] 读取世界书失败', book, e); continue; }
      for (const e of entries) {
        const name = e && e.name;
        if (name && instances[name]) instances[name].push({ book, uid: Number(e.uid), content: e.content || '' });
      }
    }
  }
  return ENTRY_ORDER.map(key => buildEntryState(key, instances[INITIAL_ENTRY_NAMES[key]]));
}

// 校验单本实例 content（用 stash-io 的 validateInitPayload），返回 {ok, count, msg}。
function checkInstance(key: EntryKey, content: string): { ok: boolean; count: number; msg: string } {
  if (key === 'links') {
    const g = parseLinksGraph(content);
    if (!g) return { ok: false, count: 0, msg: '关联图 JSON 无法解析' };
    const n = Object.values(g.links).reduce((s, m) => s + Object.keys(m).length, 0);
    return { ok: true, count: n, msg: `${n} 个关联节点` };
  }
  const v = validateInitPayload(content, ENTRY_TYPE[key]);
  if (!v.ok) return { ok: false, count: 0, msg: v.errors[0] || '解析失败' };
  try {
    const parsed = JSON.parse(v.repairedText || content);
    if (key === 'stash') {
      const groups = (parsed && parsed.groups) || {};
      const n = Object.values(groups).reduce((s: number, arr: any) => s + (Array.isArray(arr) ? arr.length : 0), 0);
      return { ok: true, count: n, msg: `${n} 张卡片` };
    }
    return { ok: true, count: Array.isArray(parsed) ? parsed.length : 0, msg: `${Array.isArray(parsed) ? parsed.length : 0} 张卡片` };
  } catch (e) {
    return { ok: false, count: 0, msg: '解析失败' };
  }
}

function buildEntryState(key: EntryKey, instances: EntryInstance[]): EntryState {
  const label = ENTRY_LABEL[key];
  const nonEmpty = instances.filter(i => (i.content || '').trim());
  //无实例：缺失
  if (!instances.length) {
    return { key, name: INITIAL_ENTRY_NAMES[key], label, instances, cardCount: 0, health: 'missing', healthMsg: '条目未创建' };
  }
  if (!nonEmpty.length) {
    return { key, name: INITIAL_ENTRY_NAMES[key], label, instances, cardCount: 0, health: 'empty', healthMsg: '内容为空' };
  }
  let cardCount = 0; let anyErr = false; let errMsg = '';
  for (const ins of nonEmpty) {
    const r = checkInstance(key, ins.content);
    if (!r.ok) { anyErr = true; errMsg = r.msg; }
    else cardCount += r.count;
  }
  const multiBook = nonEmpty.length > 1 ? `（合并自 ${nonEmpty.length} 本）` : '';
  const health: Health = anyErr ? 'parse-error' : 'ok';
  const healthMsg = anyErr ? `解析失败：${errMsg}` : `${cardCount} 项${multiBook}`;
  return { key, name: INITIAL_ENTRY_NAMES[key], label, instances, cardCount, health, healthMsg };
}

//健康徽章
function renderHealthRow(state: EntryState): string {
  const cls = { missing: 'th-init-h-missing', empty: 'th-init-h-empty', 'parse-error': 'th-init-h-error', ok: 'th-init-h-ok' }[state.health];
  const ico = { missing: 'fa-circle-minus', empty: 'fa-circle', 'parse-error': 'fa-circle-exclamation', ok: 'fa-circle-check' }[state.health];
  return `<span class="th-init-health ${cls}"><i class="fa-solid ${ico}"></i> ${esc(state.healthMsg)}</span>`;
}
void renderHealthRow; // 保留供未来行内徽章复用；三层看板已不直接调用

// 批次7 反馈5：三层 8 行看板。每行：实时卡片 ⟷ 初始卡片 ⟷ 世界书[初始]，各层独立读写。
function renderTriLayerDashboard(rows: RowState[]): string {
  const body = rows.map(r => renderTriRow(r)).join('');
  return `<div class="th-init-sec">
    <div class="th-init-sec-title"><i class="fa-solid fa-layer-group"></i> 三层数据看板<span class="th-init-sec-sub">8 类各自独立读写（储藏间 4 子类分开，落到同一 [初始·储藏间] 条目的不同分组）</span></div>
    <div class="th-init-tri-head">
      <span class="th-init-tri-h-label">类别</span>
      <span class="th-init-tri-h-live">实时卡片</span>
      <span class="th-init-tri-h-mid">初始卡片（基线）</span>
      <span class="th-init-tri-h-wb">世界书 [初始]</span>
    </div>
    <div class="th-init-tri">${body}</div>
    <div class="th-init-tri-note"><i class="fa-solid fa-circle-info"></i> 储藏间「未分类」与自定义类别为运行时数据，不纳入初始流；不会出现在上方。</div>
  </div>`;
}

function renderTriRow(r: RowState): string {
  const isLinks = r.kind === 'links';
  const unit = isLinks ? '点' : '卡';
  const wbBadge = r.wbErr
    ? `<span class="th-init-tri-num th-init-tri-err" title="世界书条目解析失败"><i class="fa-solid fa-circle-exclamation"></i> 异常</span>`
    : `<span class="th-init-tri-num">${r.wb} ${unit}</span>`;
  // 中间「初始卡片」层：数字 + 编辑/可视化（关联图走可视化的 links 视图）
  const midEdit = isLinks
    ? `<button class="th-btn-xs" data-tri-act="init-edit-links" title="可视化编辑初始关联图"><i class="fa-solid fa-pen-ruler"></i></button>`
    : `<button class="th-btn-xs" data-tri-act="init-edit" title="编辑该类初始卡片（基线中间层）"><i class="fa-solid fa-pen"></i></button>`;
  return `<div class="th-init-tri-row" data-tri-kind="${r.kind}">
    <div class="th-init-tri-name"><i class="${ROW_ICON[r.kind]}"></i> ${esc(ROW_LABEL[r.kind])}</div>
    <div class="th-init-tri-cell">
      <span class="th-init-tri-num">${r.live} ${unit}</span>
    </div>
    <div class="th-init-tri-arrows" title="实时 ⟷ 初始">
      <button class="th-btn-xs th-init-tri-arrow" data-tri-act="live-to-init" title="把实时卡片写入初始卡片层（覆盖该类初始基线）"><i class="fa-solid fa-arrow-right"></i></button>
      <button class="th-btn-xs th-init-tri-arrow" data-tri-act="init-to-live" title="把初始卡片增量读入实时卡片（同名跳过，保护现状）"><i class="fa-solid fa-arrow-left"></i></button>
    </div>
    <div class="th-init-tri-cell th-init-tri-mid">
      <span class="th-init-tri-num">${r.init} ${unit}</span>
      ${midEdit}
    </div>
    <div class="th-init-tri-arrows" title="初始 ⟷ 世界书">
      <button class="th-btn-xs th-init-tri-arrow" data-tri-act="init-to-wb" title="把初始卡片写出到世界书 [初始] 条目（覆盖该类）"><i class="fa-solid fa-arrow-right"></i></button>
      <button class="th-btn-xs th-init-tri-arrow" data-tri-act="wb-to-init" title="从世界书 [初始] 条目读入初始卡片层（覆盖该类）"><i class="fa-solid fa-arrow-left"></i></button>
    </div>
    <div class="th-init-tri-cell">${wbBadge}</div>
  </div>`;
}

// ==================== ② 格式校验器 ====================

function renderValidator(text: string, type: InitPayloadType): string {
  const opts = ENTRY_ORDER.map(k => {
    const t = ENTRY_TYPE[k];
    return `<option value="${t}"${t === type ? ' selected' : ''}>${ENTRY_LABEL[k]}（${INITIAL_ENTRY_NAMES[k]}）</option>`;
  }).join('');
  return `<div class="th-init-sec">
    <div class="th-init-sec-title"><i class="fa-solid fa-shield-halved"></i> 格式校验器<span class="th-init-sec-sub">粘贴 JSON / YAML，实时校验是否符合该类型初始数据结构</span></div>
    <div class="th-init-validator">
      <select class="th-edit-select" id="th-init-validator-type">${opts}</select>
      <textarea class="th-edit-textarea" id="th-init-validator-text" placeholder="在此粘贴 [初始·地点]/[初始·事件]/[初始·DLC] 的 JSON 数组，或 [初始·储藏间] 的 {format,groups}，或 [初始·关联] 的关联图 JSON；也支持 YAML …" rows="6">${esc(text)}</textarea>
      <div id="th-init-validator-result" class="th-init-validator-result th-init-v-idle">输入内容后实时校验</div>
    </div>
  </div>`;
}

//时校验并刷新结果区（input/change用，不重渲染面板以保留光标）
function runValidator(): void {
  const txtEl = qs<HTMLTextAreaElement>('#th-init-validator-text');
  const typeEl = qs<HTMLSelectElement>('#th-init-validator-type');
  const txt = txtEl?.value || '';
  const type = (typeEl?.value || 'stash') as InitPayloadType;
  st.vText = txt; st.vType = type;
  const box = qs('#th-init-validator-result');
  if (!box) return;
  if (!txt.trim()) { box.className = 'th-init-validator-result th-init-v-idle'; box.innerHTML = '输入内容后实时校验'; return; }
  const v = validateInitPayload(txt, type);
  if (v.ok) {
    const fixed = v.repairedText && v.repairedText.trim() !== txt.trim();
    box.className = 'th-init-validator-result th-init-v-ok';
    box.innerHTML = `<i class="fa-solid fa-circle-check"></i> 格式正确${fixed ? '（jsonrepair 已容错修复）' : ''}`;
  } else {
    box.className = 'th-init-validator-result th-init-v-err';
    box.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> <b>校验失败</b><ul>${v.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`;
  }
}

// ==================== ③健康自检报告 ====================

function renderDiagnosticSection(): string {
  return `<div class="th-init-sec">
    <div class="th-init-sec-title"><i class="fa-solid fa-stethoscope"></i>健康自检<span class="th-init-sec-sub">全面扫描解析失败条目 /孤儿关联 /损坏 localStorage</span></div>
    <div class="th-init-diag-actions"><button class="th-btn-sm" id="th-init-diag-run" type="button"><i class="fa-solid fa-play"></i>运行全面自检</button></div>
    <div id="th-init-diag-report" class="th-init-diag-report"><span class="th-init-v-idle">点击「运行全面自检」生成报告</span></div>
  </div>`;
}

//孤儿关联：[初始·关联] 引用了本地不存在的卡片名（按 kind×field，不影响本地）
function collectOrphanRefs(graph: LinksGraph): { kind: string; field: string; name: string; target: string }[] {
  const out: { kind: string; field: string; name: string; target: string }[] = [];
  const FIELD_KIND: Record<'locations' | 'events' | 'dlcs', 'location' | 'event' | 'dlc'> = { locations: 'location', events: 'event', dlcs: 'dlc' };
  for (const kind of ['location', 'event', 'dlc'] as const) {
    const nodes = graph.links[kind] || {};
    for (const [name, node] of Object.entries(nodes) as [string, LinksNode][]) {
      for (const f of ['locations', 'events', 'dlcs'] as const) {
        const arr = node[f] || [];
        if (!arr.length) continue;
        const items = getManagedItems(FIELD_KIND[f]);
        for (const target of arr) if (!items[target]) out.push({ kind, field: f, name, target });
      }
    }
  }
  return out;
}

async function runFullDiagnostic(): Promise<void> {
  const reportEl = qs('#th-init-diag-report');
  if (reportEl) { reportEl.className = 'th-init-diag-report th-init-v-idle'; reportEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>扫描中…'; }
  const issues: string[] = [];
  // 1) 解析失败条目（逐本世界书实例）
  const entries = await gatherInitState();
  for (const e of entries) {
    for (const ins of e.instances) {
      if (!ins.content.trim()) continue;
      const r = checkInstance(e.key, ins.content);
      if (!r.ok) issues.push(`条目 <b>${esc(e.name)}</b>（世界书 ${esc(ins.book)}）解析失败：${esc(r.msg)}`);
    }
  }
  // 2)孤儿关联
  try {
    const graph = await readLinksGraphFromWorldbook();
    for (const o of collectOrphanRefs(graph)) {
      issues.push(`孤儿关联：${esc(ENTRY_LABEL[o.kind as EntryKey] || o.kind)}「${esc(o.name)}」引用本地不存在的“${esc(o.field)}”卡片「${esc(o.target)}」`);
    }
  } catch (e) { issues.push(`关联图读取异常：${esc((e as Error).message)}`); }
  // 3)损坏 localStorage（managed + tags + stashKinds + groupCollapsed + 自定义 kind 存储）
  const keys = [...INIT_LS_KEYS.managed, INIT_LS_KEYS.tags, INIT_LS_KEYS.stashKinds, INIT_LS_KEYS.groupCollapsed];
  for (const k of keys) {
    const raw = localStorage.getItem(k);
    if (raw && raw.trim()) { try { JSON.parse(raw); } catch { issues.push(`localStorage key「${esc(k)}」内容损坏（非合法 JSON）`); } }
  }
  for (const name of Object.keys(loadStashKinds())) {
    const k = getStashKindStorageKey(name);
    const raw = localStorage.getItem(k);
    if (raw && raw.trim()) { try { JSON.parse(raw); } catch { issues.push(`localStorage key「${esc(k)}」内容损坏（非合法 JSON）`); } }
  }
  if (!reportEl) return;
  if (!issues.length) { reportEl.className = 'th-init-diag-report th-init-v-ok'; reportEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> 全部正常，未发现问题'; }
  else { reportEl.className = 'th-init-diag-report th-init-v-warn'; reportEl.innerHTML = `<div class="th-init-diag-head">发现 ${issues.length} 个问题</div><ul>${issues.map(i => `<li>${i}</li>`).join('')}</ul>`; }
}

// ==================== ④备份 /恢复 /恢复出厂 ====================

function renderBackupSection(): string {
  return `<div class="th-init-sec">
    <div class="th-init-sec-title"><i class="fa-solid fa-box-archive"></i>备份 /恢复 /恢复出厂<span class="th-init-sec-sub">一键备份全部初始条目 + managed +标签 + 关联图</span></div>
    <div class="th-init-backup">
      <button class="th-btn-sm" id="th-init-backup-export" type="button"><i class="fa-solid fa-download"></i>导出备份快照</button>
      <button class="th-btn-sm" id="th-init-backup-restore-btn" type="button"><i class="fa-solid fa-upload"></i>从文件恢复…</button>
      <input type="file" id="th-init-backup-restore" accept=".json" style="display:none">
      <span class="th-init-vline"></span>
      <button class="th-btn-sm th-init-reset-btn" id="th-init-factory-reset" type="button"><i class="fa-solid fa-trash-can-arrow-up"></i>恢复出厂</button>
    </div>
  </div>`;
}

// 一键导出：5 个初始条目 content（多本合并）+ 全部 managed localStorage +标签 + 关联图
async function exportInitBackup(): Promise<void> {
  try {
    const books = getCharWorldbookList();
    const initEntries: Record<string, string> = {};
    for (const name of Object.values(INITIAL_ENTRY_NAMES)) {
      const contents: string[] = [];
      for (const book of books) {
        try { const es = await safeGetWorldbook(book); for (const e of es) if (e && e.name === name && (e.content || '').trim()) contents.push(e.content); } catch (e) { console.warn('[init-manager]备份读条目', book, name, e); }
      }
      initEntries[name] = contents.join('\n');
    }
    const managed: Record<string, unknown> = {};
    for (const k of INIT_LS_KEYS.managed) {
      const raw = localStorage.getItem(k);
      if (raw) { try { managed[k] = JSON.parse(raw); } catch { managed[k] = raw; } }
    }
    for (const name of Object.keys(loadStashKinds())) {
      const k = getStashKindStorageKey(name);
      const raw = localStorage.getItem(k);
      if (raw) { try { managed[k] = JSON.parse(raw); } catch { managed[k] = raw; } }
    }
    let tags: unknown = null;
    const tagsRaw = localStorage.getItem(INIT_LS_KEYS.tags);
    if (tagsRaw) { try { tags = JSON.parse(tagsRaw); } catch { tags = tagsRaw; } }
    const backup = {
      format: INIT_BACKUP_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      initEntries,
      managed,
      tags,
      linksGraph: loadLinksGraph(),
    };
    downloadText('初始化备份_' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(backup, null, 2));
    toastr?.success?.('已导出初始化备份快照');
  } catch (e) { console.warn('[init-manager] exportInitBackup败', e); toastr?.error?.('导出备份失败：' + (e as Error).message); }
}

// 把快照里的初始条目 content 写回世界书（找到的第一本覆盖，不存在则建在 books[0]）
async function restoreInitEntries(initEntries: Record<string, string>): Promise<void> {
  const books = getCharWorldbookList();
  if (!books.length) throw new Error('当前角色卡没有绑定世界书');
  for (const [name, content] of Object.entries(initEntries)) {
    if (!(content || '').trim()) continue;
    let book = books[0]; let uid = -1;
    for (const b of books) {
      try { const es = await safeGetWorldbook(b); const f = es.find(e => e && e.name === name); if (f) { book = b; uid = Number(f.uid); break; } } catch (e) { console.warn('[init-manager]恢复查找条目', b, name, e); }
    }
    await safeUpdateWorldbookWith(book, entries => {
      if (uid >= 0) { const idx = entries.findIndex(e => Number(e.uid) === uid); if (idx >= 0) entries[idx] = { ...entries[idx], content }; }
      else entries.push(createInitialWorldbookEntry(name, content));
      return entries;
    }, { render: 'debounced' });
  }
}

//恢复：mode = init（仅初始条目）/ local（仅本地卡片+标签）/ all（全部）
async function restoreInitBackup(backup: any, mode: 'init' | 'local' | 'all'): Promise<{ init: number; local: number; err?: string }> {
  let initCount = 0, localCount = 0;
  try {
    if ((mode === 'init' || mode === 'all') && backup.initEntries) {
      await restoreInitEntries(backup.initEntries);
      initCount = Object.keys(backup.initEntries).filter((n: string) => (backup.initEntries[n] || '').trim()).length;
    }
    if (mode === 'local' || mode === 'all') {
      if (backup.managed) for (const [k, data] of Object.entries(backup.managed)) {
        localStorage.setItem(k, typeof data === 'string' ? data : JSON.stringify(data));
        localCount++;
      }
      if (backup.tags != null) { localStorage.setItem(INIT_LS_KEYS.tags, typeof backup.tags === 'string' ? backup.tags : JSON.stringify(backup.tags)); localCount++; }
    }
  } catch (e) { return { init: initCount, local: localCount, err: (e as Error).message }; }
  return { init: initCount, local: localCount };
}

function openRestoreModal(backup: any): void {
  const initN = backup.initEntries ? Object.keys(backup.initEntries).length : 0;
  const localN = backup.managed ? Object.keys(backup.managed).length : 0;
  const h = `<div class="th-init-restore" style="padding:14px">
    <div style="color:var(--tx2);line-height:1.7;font-size:13px;margin-bottom:10px">快照导出于 <b>${esc(backup.exportedAt || '?')}</b>，含 ${initN} 个初始条目、${localN} 个本地存储块。恢复初始条目会覆盖现有同名条目内容；恢复本地卡片会覆盖当前 localStorage。</div>
    <div style="display:grid;gap:8px;margin-bottom:16px">
      <label><input type="radio" name="th-init-restore-mode" value="init"> 仅初始条目（写回世界书条目 content）</label>
      <label><input type="radio" name="th-init-restore-mode" value="local" checked> 仅本地卡片（恢复 managed +标签字典）</label>
      <label><input type="radio" name="th-init-restore-mode" value="all"> 全部</label>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="th-btn" id="th-init-restore-cancel">取消</button>
      <button class="th-btn th-btn-primary" id="th-init-restore-confirm"><i class="fa-solid fa-rotate-left"></i>确认恢复</button>
    </div>
  </div>`;
  openModal2('恢复初始化备份', h);
  setTimeout(() => {
    qs('#th-init-restore-cancel')?.addEventListener('click', () => { closeModal2(); });
    qs('#th-init-restore-confirm')?.addEventListener('click', async () => {
      const mode = (qs<HTMLInputElement>('input[name="th-init-restore-mode"]:checked')?.value || 'local') as 'init' | 'local' | 'all';
      closeModal2();
      try {
        const r = await restoreInitBackup(backup, mode);
        toastr?.success?.(`已恢复${r.init ? `：${r.init} 个初始条目` : ''}${r.local ? `${r.init ? '、' : '已恢复：'}${r.local} 个本地存储块` : ''}${r.err ? `\n部分失败：${r.err}` : ''}`);
      } catch (e) { console.warn('[init-manager]恢复失败', e); toastr?.error?.('恢复失败：' + (e as Error).message); }
      // 看板重渲染：用 closeAllModal2 清栈后重开基线看板，避免双重入站 innest 嵌套残留
      closeAllModal2(); void openInitManager();
    });
  }, 40);
}

//恢复出厂：清空 managed 卡片（保留标签/外观/类别定义），再重读初始数据重建
async function factoryResetManaged(): Promise<void> {
  for (const k of INIT_LS_KEYS.managed) { try { localStorage.removeItem(k); } catch (e) { console.warn(e); } }
  for (const name of Object.keys(loadStashKinds())) { try { localStorage.removeItem(getStashKindStorageKey(name)); } catch (e) { console.warn(e); } }
  const parsed = await readInitialDataFromWorldbook();
  const r = await mergeInitialDataIntoLocal(parsed);
  toastr?.success?.(`已恢复出厂：重新构建 ${r.added} 张卡片${r.skipped ? `，跳过 ${r.skipped}` : ''}`);
  await openInitManager();
}

function openFactoryResetConfirm(): void {
  openReadInitialConfirmModal('（清空所有 managed 卡片，保留标签/外观/类别定义，再重读初始数据重建）', async () => {
    try { await factoryResetManaged(); } catch (e) { console.warn('[init-manager]factoryReset失败', e); toastr?.error?.('恢复出厂失败：' + (e as Error).message); void openInitManager(); }
  });
}

// ==================== 批次7 反馈5：三层行操作（6 向流 + 编辑）====================

// 实时 → 初始：把某 kind 的实时卡片整体写入初始卡片层（覆盖该类基线）。
function liveToInit(kind: RowKind): void {
  if (kind === 'links') {
    openReadInitialConfirmModal('把实时关联图写入「初始卡片」层（覆盖初始关联基线）', async () => {
      setInitLinks(loadLinksGraph());
      toastr?.success?.('已把实时关联图写入初始卡片层');
      await refresh();
    });
    return;
  }
  const live = getManagedItems(kind);
  const n = Object.keys(live).length;
  openReadInitialConfirmModal(`把 ${n} 张「${ROW_LABEL[kind]}」实时卡片写入初始卡片层（覆盖该类初始基线）`, async () => {
    setInitCards(kind, deepCloneMap(live));
    toastr?.success?.(`已写入初始卡片层：${ROW_LABEL[kind]} ${n} 张`);
    await refresh();
  });
}

// 初始 → 实时：把某 kind 的初始卡片增量读入实时（同名跳过，保护现状）。
async function initToLive(kind: RowKind): Promise<void> {
  if (kind === 'links') {
    const g = getInitLinks();
    if (!g) { toastr?.info?.('初始卡片层暂无关联图'); return; }
    const r = mergeLinksGraphIntoLocal(g);
    toastr?.success?.(`已从初始卡片合并关联：补入 ${r.added}${r.skipped ? `，跳过 ${r.skipped}` : ''}`);
    await refresh();
    return;
  }
  const initMap = getInitCards(kind);
  const willAdd = Object.keys(initMap).filter(name => !getManagedItems(kind)[name]).map(name => ({ kind, name }));
  if (!Object.keys(initMap).length) { toastr?.info?.(`初始卡片层暂无「${ROW_LABEL[kind]}」`); return; }
  const ok = await openDiffPreviewModal(willAdd);
  if (!ok) return;
  let added = 0, skipped = 0;
  for (const [name, item] of Object.entries(initMap)) {
    if (getManagedItems(kind)[name]) { skipped++; continue; }
    addManagedItem(kind, name, { ...item, favorite: false });
    added++;
  }
  if (added) toastr?.success?.(`已读入实时卡片：${ROW_LABEL[kind]} 补入 ${added}${skipped ? `，跳过 ${skipped}` : ''}`);
  else toastr?.info?.(`无新增（本地已全部存在，跳过 ${skipped}）`);
  await refresh();
}

// 初始 → 世界书：把某 kind 的初始卡片覆盖写出到世界书 [初始] 条目（储藏间只动该子类分组）。
function initToWb(kind: RowKind): void {
  if (kind === 'links') {
    openReadInitialConfirmModal('把初始卡片层的关联图覆盖写入世界书 [初始·关联]', async () => {
      const g = getInitLinks();
      if (!g) { toastr?.info?.('初始卡片层暂无关联图'); return; }
      try {
        const r = await writeLinksGraphToInitial('overwrite', g);
        toastr?.success?.(`已${r.created ? '新建' : '覆盖'} [初始·关联]（世界书：${r.book}）`);
        await refresh();
      } catch (e) { toastr?.error?.('写入关联图失败：' + (e as Error).message); }
    });
    return;
  }
  const initMap = getInitCards(kind);
  const n = Object.keys(initMap).length;
  openReadInitialConfirmModal(`把 ${n} 张「${ROW_LABEL[kind]}」初始卡片覆盖写入世界书 ${INITIAL_ENTRY_NAMES[wbEntryKeyOf(kind)]} 条目`, async () => {
    try {
      const items = managedMapToInitialItems(initMap);
      const r = await setInitialItemsForKind(kind, items);
      toastr?.success?.(`已写出世界书：${ROW_LABEL[kind]} ${r.written} 项（${r.created ? '新建' : '覆盖'}，世界书：${r.book}）`);
      await refresh();
    } catch (e) { toastr?.error?.('写出世界书失败：' + (e as Error).message); }
  });
}

// 世界书 → 初始：从世界书 [初始] 条目读入初始卡片层（覆盖该类）。
async function wbToInit(kind: RowKind): Promise<void> {
  if (kind === 'links') {
    openReadInitialConfirmModal('从世界书 [初始·关联] 读入初始卡片层（覆盖初始关联基线）', async () => {
      try {
        const g = await readLinksGraphFromWorldbook();
        setInitLinks(g);
        toastr?.success?.('已从世界书读入初始关联图');
        await refresh();
      } catch (e) { toastr?.error?.('读取关联图失败：' + (e as Error).message); }
    });
    return;
  }
  openReadInitialConfirmModal(`从世界书 ${INITIAL_ENTRY_NAMES[wbEntryKeyOf(kind)]} 条目读入「${ROW_LABEL[kind]}」初始卡片层（覆盖该类）`, async () => {
    try {
      const parsed = await readInitialDataFromWorldbook();
      const items = parsed.byKind[kind] || [];
      const map: Record<string, ManagedItemV2> = {};
      for (const { name, item } of items) map[name] = item;
      setInitCards(kind, map);
      toastr?.success?.(`已读入初始卡片层：${ROW_LABEL[kind]} ${items.length} 张`);
      await refresh();
    } catch (e) { toastr?.error?.('读取世界书失败：' + (e as Error).message); }
  });
}

// kind → 它在世界书里所属的初始条目 EntryKey（储藏间 4 子类都归 'stash'）
function wbEntryKeyOf(kind: RowKind): EntryKey {
  if (kind === 'links') return 'links';
  if (kind.startsWith('stash-')) return 'stash';
  return kind as EntryKey;
}

function deepCloneMap(m: Record<string, ManagedItemV2>): Record<string, ManagedItemV2> {
  const out: Record<string, ManagedItemV2> = {};
  for (const [k, v] of Object.entries(m)) out[k] = JSON.parse(JSON.stringify(v));
  return out;
}

// 编辑初始卡片层（某 kind）：可视化网格增删改，写回初始卡片层（不碰实时/世界书）。
function editInitCards(kind: InitCardKind): void {
  openInitCardsEditor(kind);
}

// 编辑初始关联图层：JSON 文本编辑（关联图结构简单，直接编辑 {format,links}）。
function editInitLinks(): void {
  const g = getInitLinks();
  const text = g ? JSON.stringify(g, null, 2) : '';
  const html = `<div class="th-init-cee" style="padding:14px;display:flex;flex-direction:column;gap:10px;max-height:80vh;overflow:auto">
    <div style="font-weight:700;color:var(--pink)"><i class="fa-solid fa-diagram-project"></i> 编辑初始关联图层</div>
    <div style="font-size:12px;color:var(--tx3)">直接编辑关联图 JSON（{"format":"th-links-graph-v1","links":{...}}）。留空=清空初始关联层。</div>
    <textarea id="th-cee-links" class="th-edit-textarea" rows="12" style="font-size:12px;font-family:monospace">${esc(text)}</textarea>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="th-btn" id="th-cee-lcancel">取消</button>
      <button class="th-btn th-btn-primary" id="th-cee-lsave"><i class="fa-solid fa-floppy-disk"></i> 保存</button>
    </div>
  </div>`;
  openModal2('编辑初始关联图', html, { maxWidth: 'min(640px,94vw)' });
  qs('#th-cee-lcancel')?.addEventListener('click', () => { closeModal2(); });
  qs('#th-cee-lsave')?.addEventListener('click', () => {
    const raw = (qs<HTMLTextAreaElement>('#th-cee-links')?.value || '').trim();
    if (!raw) { setInitLinks(null); toastr?.success?.('已清空初始关联层'); closeModal2(); void refresh(); return; }
    const parsed = parseLinksGraph(raw);
    if (!parsed) { toastr?.error?.('关联图 JSON 格式不正确'); return; }
    setInitLinks(parsed);
    toastr?.success?.('已保存初始关联图');
    closeModal2();
    void refresh();
  });
}

// 初始卡片层编辑器：列出该 kind 的初始卡片，支持新增/改/删（name/desc/tags/inject），保存即写回初始层。
// 储藏间 4 子类的 desc 是结构化 JSON 字符串，这里以纯文本框编辑（玩家自负其责，与世界书可视化编辑器一致口径）。
function openInitCardsEditor(kind: InitCardKind): void {
  const renderEditor = (): void => {
    const map = getInitCards(kind);
    const names = Object.keys(map);
    const rows = names.length ? names.map(name => {
      const it = map[name];
      const descPrev = (it.desc || '').slice(0, 60);
      return `<div class="th-init-ce-row" data-ce-name="${escAttr(name)}">
        <div class="th-init-ce-info">
          <div class="th-init-ce-name">${esc(name)}</div>
          <div class="th-init-ce-desc">${esc(descPrev)}${(it.desc || '').length > 60 ? '…' : ''}</div>
        </div>
        <button class="th-btn-xs" data-ce-act="edit" data-ce-name="${escAttr(name)}"><i class="fa-solid fa-pen"></i></button>
        <button class="th-btn-xs" data-ce-act="del" data-ce-name="${escAttr(name)}"><i class="fa-solid fa-trash"></i></button>
      </div>`;
    }).join('') : '<div style="padding:14px;color:var(--tx3);font-size:13px;text-align:center">该类初始卡片层为空，可点「新增」或从上/下层读入。</div>';
    const html = `<div class="th-init-ce" style="padding:14px;display:flex;flex-direction:column;gap:10px;max-height:80vh">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-weight:700;color:var(--pink)"><i class="${ROW_ICON[kind]}"></i> 编辑初始卡片 · ${esc(ROW_LABEL[kind])}</span>
        <span style="font-size:12px;color:var(--tx3)">共 ${names.length} 张（中间基线层，不影响实时/世界书）</span>
        <button class="th-btn th-btn-mini th-btn-primary" data-ce-act="new" style="margin-left:auto"><i class="fa-solid fa-plus"></i> 新增</button>
      </div>
      <div class="th-init-ce-list" style="display:flex;flex-direction:column;gap:6px;overflow:auto;padding-right:4px;flex:1">${rows}</div>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button class="th-btn" data-ce-act="close">关闭</button>
      </div>
    </div>`;
    openModal2(`<i class="${ROW_ICON[kind]}"></i> 编辑初始卡片`, html, { maxWidth: 'min(640px,94vw)', reset: true, revive: renderEditor });
    qs('.th-init-ce')?.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const btn = t.closest('[data-ce-act]') as HTMLElement | null;
      if (!btn) return;
      const act = btn.getAttribute('data-ce-act');
      const name = btn.getAttribute('data-ce-name') || '';
      if (act === 'close') { closeModal2(); void refresh(); return; }
      if (act === 'new') { openInitCardEntryEditor(kind, null, renderEditor); return; }
      if (act === 'edit' && name) { openInitCardEntryEditor(kind, name, renderEditor); return; }
      if (act === 'del' && name) {
        openReadInitialConfirmModal(`删除初始卡片「${name}」（仅删初始层，不动实时/世界书）`, async () => {
          const m = getInitCards(kind); delete m[name]; setInitCards(kind, m);
          toastr?.success?.('已删除'); renderEditor();
        });
      }
    });
  };
  renderEditor();
}

// 单张初始卡片编辑（name/desc/tags/inject）。name 为空=新增。
function openInitCardEntryEditor(kind: InitCardKind, editName: string | null, back: () => void): void {
  const map = getInitCards(kind);
  const cur = editName ? map[editName] : null;
  const isStash = kind.startsWith('stash-');
  const html = `<div class="th-init-cee" style="padding:14px;display:flex;flex-direction:column;gap:10px;max-height:80vh;overflow:auto">
    <div style="font-weight:700;color:var(--pink)">${editName ? '编辑' : '新增'}初始卡片 · ${esc(ROW_LABEL[kind])}</div>
    <label style="display:grid;gap:4px"><span style="font-size:13px">名称</span>
      <input id="th-cee-name" class="th-edit-input" value="${escAttr(editName || '')}" placeholder="卡片名称"></label>
    <label style="display:grid;gap:4px"><span style="font-size:13px">${isStash ? '结构化字段（JSON 字符串）' : '简介 desc'}</span>
      <textarea id="th-cee-desc" class="th-edit-textarea" rows="${isStash ? 6 : 4}" style="font-size:12px${isStash ? ';font-family:monospace' : ''}">${esc(cur?.desc || '')}</textarea></label>
    <label style="display:grid;gap:4px"><span style="font-size:13px">标签（逗号分隔，可空）</span>
      <input id="th-cee-tags" class="th-edit-input" value="${escAttr((cur?.tags || []).join(','))}" placeholder="如：主线,战斗"></label>
    <label style="display:grid;gap:4px"><span style="font-size:13px">注入模板 inject（可空）</span>
      <input id="th-cee-inject" class="th-edit-input" value="${escAttr(cur?.inject || '')}" placeholder="留空用默认"></label>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="th-btn" id="th-cee-cancel">取消</button>
      <button class="th-btn th-btn-primary" id="th-cee-save"><i class="fa-solid fa-floppy-disk"></i> 保存</button>
    </div>
  </div>`;
  openModal2(`${editName ? '编辑' : '新增'}初始卡片`, html, { maxWidth: 'min(560px,94vw)' });
  qs('#th-cee-cancel')?.addEventListener('click', () => { closeModal2(); });
  qs('#th-cee-save')?.addEventListener('click', () => {
    const name = (qs<HTMLInputElement>('#th-cee-name')?.value || '').trim();
    if (!name) { toastr?.warning?.('请填名称'); return; }
    const desc = qs<HTMLTextAreaElement>('#th-cee-desc')?.value || '';
    const tags = (qs<HTMLInputElement>('#th-cee-tags')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
    const inject = (qs<HTMLInputElement>('#th-cee-inject')?.value || '').trim();
    const m = getInitCards(kind);
    if (editName && editName !== name) delete m[editName]; // 改名
    m[name] = { ...(cur || {}), desc, tags, inject: inject || undefined } as ManagedItemV2;
    setInitCards(kind, m);
    toastr?.success?.('已保存初始卡片');
    closeModal2();
    back();
  });
}

// ==================== 批次7 反馈6c：世界书条目 ↔ 卡片双向同步检测 ====================
// 扫描每个 kind：世界书 [初始] 条目 与 初始卡片层 的差异（仅在世界书 / 仅在初始 / 两边内容不一致）。
function renderSyncCheckSection(): string {
  return `<div class="th-init-sec">
    <div class="th-init-sec-title"><i class="fa-solid fa-code-compare"></i> 双向同步检测<span class="th-init-sec-sub">对比「初始卡片层」与「世界书 [初始] 条目」，列出差异</span></div>
    <div class="th-init-diag-actions"><button class="th-btn-sm" id="th-init-sync-check" type="button"><i class="fa-solid fa-magnifying-glass"></i> 检测差异</button></div>
    <div id="th-init-sync-report" class="th-init-diag-report"><span class="th-init-v-idle">点击「检测差异」对比初始卡片层与世界书条目</span></div>
  </div>`;
}

async function runSyncCheck(): Promise<void> {
  const box = qs('#th-init-sync-report');
  if (box) { box.className = 'th-init-diag-report th-init-v-idle'; box.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 对比中…'; }
  const lines: string[] = [];
  let wbParsed: ParsedImport;
  try { wbParsed = await readInitialDataFromWorldbook(); } catch (e) { if (box) { box.className = 'th-init-diag-report th-init-v-warn'; box.innerHTML = '读取世界书失败：' + esc((e as Error).message); } return; }
  for (const kind of INIT_CARD_KINDS) {
    const initMap = getInitCards(kind);
    const initNames = new Set(Object.keys(initMap));
    const wbItems = wbParsed.byKind[kind] || [];
    const wbNames = new Set(wbItems.map(x => x.name));
    const onlyInit = [...initNames].filter(n => !wbNames.has(n));
    const onlyWb = [...wbNames].filter(n => !initNames.has(n));
    // 内容不一致（两边都有但 desc 不同）
    const diff: string[] = [];
    for (const it of wbItems) {
      if (initNames.has(it.name)) {
        const a = (initMap[it.name]?.desc || '').trim();
        const b = (it.item?.desc || '').trim();
        if (a !== b) diff.push(it.name);
      }
    }
    if (onlyInit.length || onlyWb.length || diff.length) {
      const parts: string[] = [];
      if (onlyInit.length) parts.push(`仅初始层有 ${onlyInit.length}（${esc(onlyInit.slice(0, 5).join('、'))}${onlyInit.length > 5 ? '…' : ''}）`);
      if (onlyWb.length) parts.push(`仅世界书有 ${onlyWb.length}（${esc(onlyWb.slice(0, 5).join('、'))}${onlyWb.length > 5 ? '…' : ''}）`);
      if (diff.length) parts.push(`内容不一致 ${diff.length}（${esc(diff.slice(0, 5).join('、'))}${diff.length > 5 ? '…' : ''}）`);
      lines.push(`<b>${esc(ROW_LABEL[kind])}</b>：${parts.join('；')}`);
    }
  }
  if (!box) return;
  if (!lines.length) { box.className = 'th-init-diag-report th-init-v-ok'; box.innerHTML = '<i class="fa-solid fa-circle-check"></i> 初始卡片层与世界书条目完全一致'; }
  else { box.className = 'th-init-diag-report th-init-v-warn'; box.innerHTML = `<div class="th-init-diag-head">发现 ${lines.length} 类存在差异（用看板对应箭头对齐）</div><ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul>`; }
}

// ==================== 批次7 反馈6d：整包导出 / 导入分享 ====================
// 整包 = 三层全部数据：初始卡片层 + 实时 managed + 标签 + 世界书 [初始] 条目 content + 各类 AI 配置（提示词/人格/风格/方案）。
function renderPackSection(): string {
  return `<div class="th-init-sec">
    <div class="th-init-sec-title"><i class="fa-solid fa-box-open"></i> 整包导出 / 导入<span class="th-init-sec-sub">一键打包全部数据（初始层+实时+世界书条目+标签+AI配置）分享给他人，导入即用</span></div>
    <div class="th-init-backup">
      <button class="th-btn-sm" id="th-init-pack-export" type="button"><i class="fa-solid fa-file-zipper"></i> 导出整包</button>
      <button class="th-btn-sm" id="th-init-pack-import-btn" type="button"><i class="fa-solid fa-upload"></i> 导入整包…</button>
      <input type="file" id="th-init-pack-import" accept=".json" style="display:none">
    </div>
  </div>`;
}

const FULL_PACK_FORMAT = 'th-full-pack-v1';
// 整包导出涉及的 AI/配置 key（除 managed/tags 外，全部 _th_ai_* / presetenv / init-cards）。
const PACK_EXTRA_KEYS = [
  INIT_LS_KEYS.aiPrompts, INIT_LS_KEYS.aiBuiltinOverrides, INIT_LS_KEYS.aiPlans, INIT_LS_KEYS.aiStyle,
  INIT_LS_KEYS.aiStylesCustom, INIT_LS_KEYS.aiStyleOverrides, INIT_LS_KEYS.aiPersonas,
  INIT_LS_KEYS.aiPersonaOverrides, INIT_LS_KEYS.aiPersonaActive, INIT_LS_KEYS.presetenvActive,
  '_th_init_cards_v1',
];

async function exportFullPack(): Promise<void> {
  try {
    const books = getCharWorldbookList();
    const initEntries: Record<string, string> = {};
    for (const name of Object.values(INITIAL_ENTRY_NAMES)) {
      const parts: string[] = [];
      for (const book of books) {
        try { const es = await safeGetWorldbook(book); for (const e of es) if (e && e.name === name && (e.content || '').trim()) parts.push(e.content); } catch (e) { void e; }
      }
      if (parts.length) initEntries[name] = parts.join('\n');
    }
    const ls: Record<string, unknown> = {};
    const allKeys = [...INIT_LS_KEYS.managed, INIT_LS_KEYS.tags, INIT_LS_KEYS.stashKinds, INIT_LS_KEYS.groupCollapsed, ...PACK_EXTRA_KEYS];
    for (const name of Object.keys(loadStashKinds())) allKeys.push(getStashKindStorageKey(name));
    for (const k of allKeys) {
      const raw = localStorage.getItem(k);
      if (raw != null) { try { ls[k] = JSON.parse(raw); } catch { ls[k] = raw; } }
    }
    const pack = { format: FULL_PACK_FORMAT, version: 1, exportedAt: new Date().toISOString(), initEntries, ls };
    downloadText('整包分享_' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(pack, null, 2));
    toastr?.success?.('已导出整包（含三层数据 + AI 配置）');
  } catch (e) { console.warn('[init-manager] exportFullPack', e); toastr?.error?.('导出整包失败：' + (e as Error).message); }
}

function importFullPack(pack: any): Promise<void> {
  return new Promise((resolve) => {
    if (!pack || pack.format !== FULL_PACK_FORMAT) { toastr?.warning?.('文件不是合法的整包（format 不符）'); resolve(); return; }
    const lsN = pack.ls ? Object.keys(pack.ls).length : 0;
    const initN = pack.initEntries ? Object.keys(pack.initEntries).length : 0;
    openReadInitialConfirmModal(`导入整包将覆盖当前的本地存储（${lsN} 块）与世界书 ${initN} 个 [初始] 条目。建议先「导出整包」备份当前数据`, async () => {
      try {
        if (pack.ls) for (const [k, data] of Object.entries(pack.ls)) {
          localStorage.setItem(k, typeof data === 'string' ? data : JSON.stringify(data));
        }
        if (pack.initEntries) await restoreInitEntries(pack.initEntries);
        toastr?.success?.('整包导入完成，正在刷新…');
        closeAllModal2();
        void openInitManager();
      } catch (e) { console.warn('[init-manager] importFullPack', e); toastr?.error?.('导入整包失败：' + (e as Error).message); }
      resolve();
    });
  });
}

// ==================== ⑥ 数据载体：角色卡内嵌世界书（character_book）====================
// 反馈5c：把 [初始·xxx] 在「角色卡绑定世界书」与「角色卡内嵌世界书（随卡分享）」之间复制/迁移。
// 内嵌世界书经 getCharData/updateCharacterWith 读写，数据随角色卡走，分享时不丢。

function renderCarrierSection(): string {
  const ok = hasCharBook();
  return `<div class="th-init-sec">
    <div class="th-init-sec-title"><i class="fa-solid fa-id-card"></i> 数据载体（角色卡内嵌世界书）<span class="th-init-sec-sub">把 [初始] 条目复制到角色卡自身，分享角色卡时数据随卡走</span></div>
    ${ok ? `<div class="th-init-carrier">
      <div class="th-init-carrier-tip">当前角色卡内嵌世界书共 <b id="th-init-cb-count">…</b> 条匹配的初始条目。</div>
      <div class="th-init-carrier-acts">
        <button class="th-btn-sm" id="th-init-cb-to-embed" type="button" title="把绑定世界书里的全部 [初始·xxx] 条目复制进角色卡内嵌世界书（随卡分享）"><i class="fa-solid fa-arrow-right-to-bracket"></i> 绑定世界书 → 内嵌（随卡走）</button>
        <button class="th-btn-sm" id="th-init-cb-from-embed" type="button" title="把角色卡内嵌世界书里的 [初始·xxx] 条目复制回绑定世界书"><i class="fa-solid fa-arrow-right-from-bracket"></i> 内嵌 → 绑定世界书</button>
        <button class="th-btn-sm" id="th-init-cb-read" type="button" title="直接从角色卡内嵌世界书读取 [初始] 数据，增量合并到本地卡片"><i class="fa-solid fa-arrow-down-to-line"></i> 从内嵌读入本地卡片</button>
      </div>
    </div>` : `<div class="th-init-carrier-tip" style="color:var(--tx3)">当前环境未提供角色卡读写接口（getCharData/updateCharacterWith），无法使用内嵌世界书载体。</div>`}
  </div>`;
}

// 统计内嵌世界书里命中的初始条目数（异步刷新到 #th-init-cb-count）
async function refreshCarrierCount(): Promise<void> {
  const el = qs('#th-init-cb-count');
  if (!el) return;
  try {
    const entries = readCharBookEntries();
    const n = entries.filter(e => e.name in INITIAL_ENTRY_KINDS).length;
    el.textContent = String(n);
  } catch { el.textContent = '?'; }
}

// 绑定世界书 → 内嵌：读各 [初始·xxx] 条目 content（多本合并），逐条 writeCharBookEntry 覆盖写入内嵌。破坏性（改卡）→ 二次确认。
function copyBoundToEmbed(): void {
  openReadInitialConfirmModal('把绑定世界书的全部 [初始·xxx] 条目复制进角色卡内嵌世界书（会覆盖内嵌中的同名条目，改动写入角色卡本体）', async () => {
    try {
      const books = getCharWorldbookList();
      const contents: Record<string, string> = {};
      for (const name of Object.values(INITIAL_ENTRY_NAMES)) {
        const parts: string[] = [];
        for (const book of books) {
          try { const es = await safeGetWorldbook(book); for (const e of es) if (e && e.name === name && (e.content || '').trim()) parts.push(e.content); } catch (e) { console.warn('[init-manager] 读绑定条目', book, name, e); }
        }
        if (parts.length) contents[name] = parts.join('\n');
      }
      const names = Object.keys(contents);
      if (!names.length) { toastr?.info?.('绑定世界书里没有可复制的 [初始·xxx] 条目'); return; }
      for (const name of names) await writeCharBookEntry(name, contents[name]);
      toastr?.success?.(`已复制 ${names.length} 个初始条目到角色卡内嵌世界书`);
      await openInitManager();
    } catch (e) { console.warn('[init-manager] copyBoundToEmbed', e); toastr?.error?.('复制到内嵌失败：' + (e as Error).message); }
  });
}

// 内嵌 → 绑定世界书：读内嵌各 [初始·xxx] 条目，写回绑定世界书（覆盖同名/新建）。破坏性 → 二次确认。
function copyEmbedToBound(): void {
  openReadInitialConfirmModal('把角色卡内嵌世界书的 [初始·xxx] 条目复制回绑定世界书（会覆盖绑定世界书的同名条目）', async () => {
    try {
      const books = getCharWorldbookList();
      if (!books.length) { toastr?.error?.('当前角色卡没有绑定世界书'); return; }
      const embed = readCharBookEntries().filter(e => e.name in INITIAL_ENTRY_KINDS);
      if (!embed.length) { toastr?.info?.('角色卡内嵌世界书里没有 [初始·xxx] 条目'); return; }
      for (const ent of embed) {
        // 找已有同名条目所在书；没有则建在 books[0]
        let book = books[0]; let uid = -1;
        for (const b of books) { try { const es = await safeGetWorldbook(b); const f = es.find(e => e && e.name === ent.name); if (f) { book = b; uid = Number(f.uid); break; } } catch (e) { void e; } }
        await safeUpdateWorldbookWith(book, entries => {
          if (uid >= 0) { const idx = entries.findIndex(e => Number(e.uid) === uid); if (idx >= 0) entries[idx] = { ...entries[idx], content: ent.content }; }
          else entries.push(createInitialWorldbookEntry(ent.name, ent.content));
          return entries;
        }, { render: 'debounced' });
      }
      toastr?.success?.(`已复制 ${embed.length} 个初始条目回绑定世界书`);
      await openInitManager();
    } catch (e) { console.warn('[init-manager] copyEmbedToBound', e); toastr?.error?.('复制回绑定世界书失败：' + (e as Error).message); }
  });
}

// 从内嵌读入本地卡片：解析内嵌 [初始] 条目 → 增量合并到本地 managed。
async function readEmbedIntoLocal(): Promise<void> {
  try {
    const contents: Record<string, string> = {};
    for (const name of Object.keys(INITIAL_ENTRY_KINDS)) {
      const c = getCharBookEntryByName(name);
      if (c && c.trim()) contents[name] = c;
    }
    if (!Object.keys(contents).length) { toastr?.info?.('角色卡内嵌世界书里没有 [初始·xxx] 数据'); return; }
    const parsed = parseInitialEntryContents(contents);
    const r = await mergeInitialDataIntoLocal(parsed, { onPreview: openDiffPreviewModal });
    if (r.added) toastr?.success?.(`已从内嵌世界书补入 ${r.added} 张卡片${r.skipped ? `，跳过 ${r.skipped}` : ''}`);
    else toastr?.info?.(`无新增卡片${r.skipped ? `（本地已全部存在，跳过 ${r.skipped}）` : ''}`);
    await openInitManager();
  } catch (e) { console.warn('[init-manager] readEmbedIntoLocal', e); toastr?.error?.('从内嵌读入失败：' + (e as Error).message); }
}

// ==================== 事件委托绑定 ====================

function bindInitEvents(): void {
  qs('#th-init-refresh')?.addEventListener('click', () => { void refresh(); });
  // 批次7：三层看板行——6 向流 + 编辑（事件委托）
  qsa('.th-init-tri-row').forEach((row) => {
    const kind = row.getAttribute('data-tri-kind') as RowKind;
    if (!kind) return;
    row.querySelectorAll<HTMLButtonElement>('[data-tri-act]').forEach((btn) => {
      const act = btn.getAttribute('data-tri-act');
      btn.addEventListener('click', () => {
        try {
          switch (act) {
            case 'live-to-init': liveToInit(kind); break;
            case 'init-to-live': void initToLive(kind); break;
            case 'init-to-wb': initToWb(kind); break;
            case 'wb-to-init': void wbToInit(kind); break;
            case 'init-edit': if (kind !== 'links') editInitCards(kind as InitCardKind); break;
            case 'init-edit-links': editInitLinks(); break;
          }
        } catch (e) { console.warn('[init-manager] 三层行操作失败', kind, act, e); toastr?.error?.('操作失败：' + (e as Error).message); }
      });
    });
  });
  // ② 校验器：防抖实时校验
  const vText = qs('#th-init-validator-text');
  const vType = qs('#th-init-validator-type');
  let timer: ReturnType<typeof setTimeout> | null = null;
  const sched = () => { if (timer) clearTimeout(timer); timer = setTimeout(runValidator, 250); };
  vText?.addEventListener('input', sched);
  vType?.addEventListener('change', runValidator);
  if (st.vText) runValidator();
  // ③ 自检
  qs('#th-init-diag-run')?.addEventListener('click', () => { void runFullDiagnostic(); });
  // ④份/恢复/恢复出厂
  qs('#th-init-backup-export')?.addEventListener('click', () => { void exportInitBackup(); });
  qs('#th-init-backup-restore-btn')?.addEventListener('click', () => { qs<HTMLInputElement>('#th-init-backup-restore')?.click(); });
  qs('#th-init-backup-restore')?.addEventListener('change', async function (this: HTMLInputElement) {
    if (!this.files || !this.files[0]) return;
    try {
      const text = await this.files[0].text();
      const backup = JSON.parse(text);
      if (!backup || (backup.format && backup.format !== INIT_BACKUP_FORMAT)) { toastr?.warning?.('文件不是合法的初始化备份快照（format 不符）'); return; }
      openRestoreModal(backup);
    } catch (e) { toastr?.error?.('读取备份文件失败：' + (e as Error).message); }
    this.value = ''; // 同文件可再次选
  });
  qs('#th-init-factory-reset')?.addEventListener('click', openFactoryResetConfirm);
  // ⑥ 数据载体（角色卡内嵌世界书）
  qs('#th-init-cb-to-embed')?.addEventListener('click', copyBoundToEmbed);
  qs('#th-init-cb-from-embed')?.addEventListener('click', copyEmbedToBound);
  qs('#th-init-cb-read')?.addEventListener('click', () => { void readEmbedIntoLocal(); });
  // 整包导出/导入（反馈6d）
  qs('#th-init-pack-export')?.addEventListener('click', () => { void exportFullPack(); });
  qs('#th-init-pack-import-btn')?.addEventListener('click', () => { qs<HTMLInputElement>('#th-init-pack-import')?.click(); });
  qs('#th-init-pack-import')?.addEventListener('change', async function (this: HTMLInputElement) {
    if (!this.files || !this.files[0]) return;
    try { const text = await this.files[0].text(); await importFullPack(JSON.parse(text)); }
    catch (e) { toastr?.error?.('读取整包文件失败：' + (e as Error).message); }
    this.value = '';
  });
  // 双向同步检测（反馈6c）
  qs('#th-init-sync-check')?.addEventListener('click', () => { void runSyncCheck(); });
  void refreshCarrierCount();
}

// ====================调试挂载（接入 UI 入口前，供控制台手动验证）====================
try {
  const w = (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {})) as any;
  w.__th_init__ = { openInitManager, exportInitBackup, restoreInitBackup, runFullDiagnostic, factoryResetManaged, gatherInitState };
} catch (e) { void e; }