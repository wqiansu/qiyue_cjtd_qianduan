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
  type ManagedKind,
} from '../lib/config';
import {
  type LinksGraph,
  type LinksNode,
  getManagedItems,
  loadStashKinds,
  loadLinksGraph,
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
  openWriteInitialDataModal,
  downloadText,
} from './stash-io';
import {
  exportLinksGraphFile,
  writeLinksGraphToInitial,
  importLinksFromWorldbookOneClick,
  readLinksGraphFromWorldbook,
  parseLinksGraph,
} from './links-init';
import { openWorldbookEntryDetail } from './wb-inspector';
import { openVisualEditor } from './init-visual-editor';
import { hasCharBook, readCharBookEntries, getCharBookEntryByName, writeCharBookEntry } from '../lib/char-book';

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
  vText: string;                        // 校验器文本（跨刷新保留）
  vType: InitPayloadType;              // 校验器类型
};

let st: PanelState = { entries: [], vText: '', vType: 'stash' };

// ====================面板入口 ====================

export async function openInitManager(): Promise<void> {
  st = { entries: await gatherInitState(), vText: st.vText, vType: st.vType };
  const html = renderInitPanel(st);
  openModal2(`<i class="fa-solid fa-database"></i>初始化管理`, html, { maxWidth: 'min(820px,94vw)', reset: true, revive: () => { void openInitManager(); } });
  setTimeout(() => bindInitEvents(), 50);
}

//刷新看板：重新读取世界书状态后重渲染面板（保留校验器文本/类型）
const refresh = async (): Promise<void> => {
  const state: PanelState = { entries: await gatherInitState(), vText: st.vText, vType: st.vType };
  st = state;
  const body = qs('.th-modal-body-2');
  if (body) { body.scrollTop = 0; body.innerHTML = renderInitPanel(state); setTimeout(() => bindInitEvents(), 40); return; }
  await openInitManager();
};

function renderInitPanel(state: PanelState): string {
  return `<div class="th-init-panel">
    <div class="th-init-toolbar">
      <span class="th-init-tip">集中管理世界书初始数据条目与本地卡片：读/写/编辑、格式校验、健康自检、备份恢复。</span>
      <button class="th-btn-sm" id="th-init-refresh" type="button"><i class="fa-solid fa-rotate"></i>刷新看板</button>
    </div>
    ${renderInitDashboard(state.entries)}
    ${renderValidator(state.vText, state.vType)}
    ${renderDiagnosticSection()}
    ${renderBackupSection()}
    ${renderLinksSection()}
    ${renderCarrierSection()}
  </div>`;
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

function renderInitDashboard(entries: EntryState[]): string {
  const rows = entries.map(e => {
    const cardCnt = e.key === 'links' ? `${e.cardCount}点` : `${e.cardCount} 卡`;
    const localCnt = localCardCount(e.key);
    const localStr = e.key === 'links' ? '' : `<span class="th-init-count" title="本地已有该类卡片数">本地 ${localCnt} 卡</span>`;
    const books = e.instances.length ? e.instances.map(i => esc(i.book)).join('、') : '—';
    return `<div class="th-init-row" data-init-key="${e.key}">
      <div class="th-init-row-main">
        <div class="th-init-row-name">${esc(e.name)}</div>
        <div class="th-init-row-meta"><span class="th-init-tag">${esc(e.label)}</span><span class="th-init-books" title="${escAttr(books)}"><i class="fa-solid fa-book"></i> ${books}</span><span class="th-init-count" title="世界书初始条目内卡片数">条目 ${cardCnt}</span>${localStr}</div>
        ${renderHealthRow(e)}
      </div>
      <div class="th-init-row-actions">
        <button class="th-btn-xs" data-init-act="read" type="button" title="把世界书 [初始] 条目增量读入本地卡片"><i class="fa-solid fa-arrow-down-to-line"></i> 读入本地</button>
        <button class="th-btn-xs" data-init-act="write" type="button" title="把本地全部卡片写入世界书 [初始] 条目"><i class="fa-solid fa-arrow-up-from-line"></i> 写出条目</button>
        <button class="th-btn-xs" data-init-act="edit" type="button"><i class="fa-solid fa-pen"></i> 编辑</button>
        <button class="th-btn-xs th-btn-visual" data-init-act="visual" type="button" title="可视化编辑（卡片网格增删改，格式自动校验）"><i class="fa-solid fa-pen-ruler"></i> 可视化</button>
      </div>
    </div>`;
  }).join('');
  return `<div class="th-init-sec">
    <div class="th-init-sec-title"><i class="fa-solid fa-table-list"></i> 内容看板<span class="th-init-sec-sub">5 个初始数据条目 · 读入本地 / 写出条目 = 收拢原各 modal 的初始按钮</span></div>
    <div class="th-init-dashboard">${rows}</div>
  </div>`;
}

// 本地某 EntryKey 对应的全部卡片数（储藏间合并 4 个 kind；links 不计）
function localCardCount(key: EntryKey): number {
  if (key === 'links') return 0;
  const kinds = INITIAL_ENTRY_KINDS[INITIAL_ENTRY_NAMES[key]] as ManagedKind[];
  let n = 0;
  for (const k of kinds) n += Object.keys(getManagedItems(k)).length;
  return n;
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

// ====================板行操作（读取/写入/编辑）====================

async function readOneRowIntoLocal(key: EntryKey): Promise<void> {
  if (key === 'links') { await importLinksFromWorldbookOneClick(); return; } // links专属通路（内含预览+孤儿处理+toast）
  const kinds = INITIAL_ENTRY_KINDS[INITIAL_ENTRY_NAMES[key]] as ManagedKind[];
  const parsed = await readInitialDataFromWorldbook();
  const byKind: ParsedImport['byKind'] = {};
  for (const k of kinds) if (parsed.byKind[k]) byKind[k] = parsed.byKind[k];
  const r = await mergeInitialDataIntoLocal({ byKind, warnTags: parsed.warnTags }, { onPreview: openDiffPreviewModal });
  if (r.added) toastr?.success?.(`已补入 ${r.added} 张卡片${r.skipped ? `，跳过 ${r.skipped} 张已存在` : ''}`);
  else toastr?.info?.(`无新增卡片${r.skipped ? `（本地已全部存在，跳过 ${r.skipped}）` : '（条目为空或无卡片）'}`);
}

function writeOneRow(key: EntryKey): void {
  if (key === 'links') { writeLinksRow(); return; }
  openWriteInitialDataModal(INITIAL_ENTRY_KINDS[INITIAL_ENTRY_NAMES[key]] as ManagedKind[]);
}

async function editRow(key: EntryKey): Promise<void> {
  const entryName = INITIAL_ENTRY_NAMES[key];
  let book = ''; let uid = -1;
  const cached = st.entries.find(x => x.key === key);
  if (cached && cached.instances.length) { book = cached.instances[0].book; uid = cached.instances[0].uid; }
  else {
    for (const b of getCharWorldbookList()) {
      try { const es = await safeGetWorldbook(b); const f = es.find(e => e && e.name === entryName); if (f) { book = b; uid = Number(f.uid); break; } } catch (e) { console.warn(e); }
    }
  }
  if (!book || uid < 0) { toastr?.warning?.(`未找到 ${entryName} 条目（可先用「写入」创建）`); return; }
  await openWorldbookEntryDetail(book, uid);
}

// links 行「写入」：覆盖写入 [初始·关联]（破坏性，二次确认）
function writeLinksRow(): void {
  openReadInitialConfirmModal('关联图（覆盖写入 [初始·关联]）', async () => {
    try {
      const r = await writeLinksGraphToInitial('overwrite');
      toastr?.success?.(`已${r.created ? '新建' : '覆盖'} [初始·关联] 条目（世界书：${r.book}）`);
      await openInitManager();
    } catch (e) { toastr?.error?.('写入关联图失败：' + (e as Error).message); }
  });
}

// ==================== ⑤ 关联读写区（任务1 入口收拢）====================

function renderLinksSection(): string {
  return `<div class="th-init-sec">
    <div class="th-init-sec-title"><i class="fa-solid fa-diagram-project"></i> 关联读写（[初始·关联]）<span class="th-init-sec-sub">任务1 关联模板入口收拢</span></div>
    <div class="th-init-links">
      <button class="th-btn-sm" id="th-init-links-export" type="button"><i class="fa-solid fa-file-export"></i>导出关联图</button>
      <button class="th-btn-sm" id="th-init-links-write" type="button"><i class="fa-solid fa-file-import"></i>写入 [初始·关联]</button>
      <button class="th-btn-sm" id="th-init-links-import" type="button"><i class="fa-solid fa-wand-magic-sparkles"></i>一键导入恢复</button>
    </div>
  </div>`;
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
  //板行：读取/写入/编辑
  qsa('.th-init-row').forEach((row) => {
    const key = row.getAttribute('data-init-key') as EntryKey;
    if (!key) return;
    row.querySelectorAll<HTMLButtonElement>('[data-init-act]').forEach((btn) => {
      const act = btn.getAttribute('data-init-act');
      btn.addEventListener('click', async () => {
        try {
          if (act === 'read') {
            await readOneRowIntoLocal(key);
            if (key !== 'links') await openInitManager(); // links览 modal 已自处理，不重开
          } else if (act === 'write') {
            writeOneRow(key);
          } else if (act === 'edit') {
            await editRow(key);
          } else if (act === 'visual') {
            await openVisualEditor(key);
          }
        } catch (e) { console.warn('[init-manager]行操作失败', key, act, e); toastr?.error?.('操作失败：' + (e as Error).message); }
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
  // ⑤ 关联读写区
  qs('#th-init-links-export')?.addEventListener('click', exportLinksGraphFile);
  qs('#th-init-links-write')?.addEventListener('click', writeLinksRow);
  qs('#th-init-links-import')?.addEventListener('click', () => { void importLinksFromWorldbookOneClick(); });
  // ⑥ 数据载体（角色卡内嵌世界书）
  qs('#th-init-cb-to-embed')?.addEventListener('click', copyBoundToEmbed);
  qs('#th-init-cb-from-embed')?.addEventListener('click', copyEmbedToBound);
  qs('#th-init-cb-read')?.addEventListener('click', () => { void readEmbedIntoLocal(); });
  void refreshCarrierCount();
}

// ====================调试挂载（接入 UI 入口前，供控制台手动验证）====================
try {
  const w = (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {})) as any;
  w.__th_init__ = { openInitManager, exportInitBackup, restoreInitBackup, runFullDiagnostic, factoryResetManaged, gatherInitState };
} catch (e) { void e; }