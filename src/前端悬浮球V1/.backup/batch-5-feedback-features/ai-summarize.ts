// 批次4a · AI 总结与注入 主面板（§E）
// 选世界书条目 → 选提示词 → 加入任务池 → 同 kind 分桶统一发送 → AI 返回 JSON → 归一化 → 注入确认 → 注入为 managed 卡片 + 建关联。
// 命令式 innerHTML + openModal2，不引 Vue。跨窗口走 safeGetWorldbook/getRoot 兜底。
// 依赖：resolveGenerateApiConfig（preset-env）、syncBidirLink（managed-modal）、addManagedItem（managed-store）、
//   writeInitialItemsForKind（stash-io，回写初始）、openRuntimeImportModal（stash-io，注入确认复用 UI 范式）。
import { esc, escAttr, qs, qsa, __doc } from '../lib/dom-utils';
import { openModal2, closeModal2 } from '../status-bar-init';
import { safeGetWorldbook } from '../lib/tavern-api';
import { getCharWorldbookList, syncBidirLink } from './managed-modal';
import { AI_SUMMARY_PROMPTS, AI_SUMMARY_SYSTEM_PROMPT, type AiSummaryPrompt, type AiSummaryPromptKind } from '../lib/config';
import {
  getTasks, addTask, removeTask, moveTask, updateTask, clearTasks,
  getCustomPrompts, saveCustomPrompt, deleteCustomPrompt,
  getIncrEnabled, setIncrEnabled, isIncrChanged, recordIncrSent, clearIncrMap,
  type AiTask,
} from '../lib/ai-summary-store';
import { buildJsonSchema, parseAiResult, normalizeItems, type NormalizedItem } from '../lib/ai-summary-schema';
import { resolveGenerateApiConfig } from '../lib/preset-env';
import { getManagedItems, addManagedItem } from '../lib/managed-store';
import { MANAGED_CFG, type ManagedKind } from '../lib/config';
import { getRoot } from '../lib/tavern-api';
import { writeInitialItemsForKind, type InitialWriteItem, type InitialWriteMode } from './stash-io';

// ==================== 提示词（内置 + 自定义合并）====================

function allPrompts(): AiSummaryPrompt[] {
  return [...AI_SUMMARY_PROMPTS, ...getCustomPrompts()];
}
function promptById(id: string): AiSummaryPrompt | undefined {
  return allPrompts().find(p => p.id === id);
}

// ==================== 世界书选择器（三源去重）====================

type WbSource = '全部' | '全局' | '角色卡';
type WbBookInfo = { name: string; source: WbSource; loaded?: boolean; entries?: { name: string; enabled: boolean; contentLen: number }[] };

// 取三源世界书名去重（角色卡优先标注，因其最常用）
function listWorldbooks(): WbBookInfo[] {
  const out: WbBookInfo[] = [];
  const seen = new Set<string>();
  const push = (name: string, src: WbSource) => { if (name && !seen.has(name)) { seen.add(name); out.push({ name, source: src }); } };
  try { getCharWorldbookList().forEach(n => push(n, '角色卡')); } catch (e) { void e; }
  try {
    const w = window as any;
    const fn = (typeof w.getGlobalWorldbookNames === 'function' ? w.getGlobalWorldbookNames : null) || (() => []);
    (fn() as string[]).forEach(n => push(n, '全局'));
  } catch (e) { void e; }
  try {
    const w = window as any;
    const fn = (typeof w.getWorldbookNames === 'function' ? w.getWorldbookNames : null) || (() => []);
    (fn() as string[]).forEach(n => push(n, '全部'));
  } catch (e) { void e; }
  return out;
}

// ==================== 面板状态 ====================

type PanelState = {
  books: WbBookInfo[];
  expanded: Set<string>;       // 展开的世界书名
  selectedEntries: Set<string>; // 选中条目 key：`${book}::${entryName}`
  promptId: string;            // 当前选的提示词
};

function freshState(): PanelState {
  const prompts = allPrompts();
  return { books: listWorldbooks(), expanded: new Set(), selectedEntries: new Set(), promptId: prompts[0]?.id ?? '' };
}

let ST: PanelState = freshState();

// ==================== 主入口 ====================

export function openAiSummarize(): void {
  ST = freshState();
  renderPanel();
}

function renderPanel(): void {
  const html = `
  <div class="th-ai-sum" style="padding:14px;display:flex;flex-direction:column;gap:12px">
    <div class="th-ai-actions" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;align-items:center">
      <span style="flex:1;font-size:12px;color:var(--tx3)">选条目→加入任务池→发送并注入。AI 总结使用内置提取提示词，不携带酒馆预设/世界书。</span>
      <button class="th-btn th-btn-mini" id="th-ai-add" disabled><i class="fa-solid fa-plus"></i> 加入任务池</button>
      <button class="th-btn" id="th-ai-close">关闭</button>
      <button class="th-btn th-btn-primary" id="th-ai-send"><i class="fa-solid fa-paper-plane"></i> 发送并注入</button>
    </div>
    <div class="th-ai-cols" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;height:min(440px,56vh)">
      ${renderSelector()}
      ${renderTaskpool()}
    </div>
  </div>`;
  openModal2('AI 总结注入', html);
  bindPanelEvents();
}

// ==================== 选择器渲染 ====================

function renderSelector(): string {
  const prompts = allPrompts();
  const promptOpts = prompts.map(p =>
    `<option value="${escAttr(p.id)}">${esc(p.label)}${p.isBuiltin ? '' : '（自定义）'}</option>`).join('');
  const bookRows = ST.books.map(b => {
    const expanded = ST.expanded.has(b.name);
    const srcColor = b.source === '角色卡' ? 'var(--pink)' : b.source === '全局' ? 'var(--mint)' : 'var(--sky)';
    return `<div class="th-ai-book" data-book="${escAttr(b.name)}">
      <div class="th-ai-book-head" data-act="toggle" style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg3);border-radius:10px;cursor:pointer">
        <i class="fa-solid fa-chevron-${expanded ? 'down' : 'right'}" style="font-size:11px;width:12px"></i>
        <i class="fa-solid fa-book" style="color:${srcColor}"></i>
        <span style="flex:1">${esc(b.name)}</span>
        <span style="font-size:11px;color:var(--tx3)">${b.source}</span>
      </div>
      ${expanded ? renderBookEntries(b) : ''}
    </div>`;
  }).join('');
  return `<div class="th-ai-sel" style="display:flex;flex-direction:column;gap:10px;min-height:0">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span style="font-weight:700;color:var(--pink);font-size:13px">① 世界书条目</span>
      <span style="color:var(--tx3);font-size:11px">勾选 → 加入任务池</span>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span style="color:var(--tx2);font-size:13px">提示词：</span>
      <select id="th-ai-prompt" class="th-edit-select" style="flex:1;min-width:120px">${promptOpts}</select>
      <button class="th-btn th-btn-mini" id="th-ai-prompt-edit" title="管理提示词"><i class="fa-solid fa-pen"></i></button>
    </div>
    <label style="display:flex;gap:6px;align-items:center;font-size:12px;color:var(--tx2);cursor:pointer" title="开启后，内容未变更的条目会跳过发送（按上次结果保留）">
      <input type="checkbox" id="th-ai-incr" ${getIncrEnabled() ? 'checked' : ''}> 增量模式（仅发送内容有变更的条目）
      <a id="th-ai-incr-clear" style="color:var(--tx3);font-size:11px;cursor:pointer;margin-left:auto">清除记录</a>
    </label>
    <div class="th-ai-books" style="display:grid;gap:6px;flex:1;overflow:auto;min-height:120px;padding-right:4px">${bookRows}</div>
  </div>`;
}

function renderBookEntries(b: WbBookInfo): string {
  if (!b.loaded) return `<div style="padding:10px;color:var(--tx3);font-size:12px">加载中…</div>`;
  const entries = b.entries || [];
  if (!entries.length) return `<div style="padding:10px;color:var(--tx3);font-size:12px">（无条目）</div>`;
  const rows = entries.map(e => {
    const key = `${b.name}::${e.name}`;
    const checked = ST.selectedEntries.has(key) ? 'checked' : '';
    const off = e.enabled ? '' : 'style="opacity:0.5"';
    return `<label ${off} style="display:flex;align-items:center;gap:8px;padding:5px 10px 5px 28px;font-size:13px">
      <input type="checkbox" data-act="entry" data-key="${escAttr(key)}" ${checked}>
      <span style="flex:1">${esc(e.name)}</span>
      <span style="font-size:11px;color:var(--tx3)">${e.contentLen}字</span>
    </label>`;
  }).join('');
  return `<div class="th-ai-entries" style="padding:4px 0">
    <div style="padding:4px 10px 4px 28px;display:flex;gap:12px;font-size:12px">
      <a data-act="all" data-book="${escAttr(b.name)}" style="cursor:pointer;color:var(--pink)">全选</a>
      <a data-act="none" data-book="${escAttr(b.name)}" style="cursor:pointer;color:var(--tx3)">反选</a>
    </div>
    ${rows}
  </div>`;
}

// ==================== 任务池渲染 ====================

function renderTaskpool(): string {
  const tasks = getTasks();
  const cnt = tasks.length;
  // 按 kind 分桶统计
  const buckets = new Map<AiSummaryPromptKind, number>();
  for (const t of tasks) buckets.set(t.kind, (buckets.get(t.kind) || 0) + 1);
  const bucketStr = Array.from(buckets.entries()).map(([k, n]) => `${MANAGED_CFG[k as ManagedKind].label}×${n}`).join(' / ') || '空';
  const rows = tasks.map((t) => {
    const p = promptById(t.promptId);
    return `<div class="th-ai-task" data-tid="${escAttr(t.taskId)}" style="display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;padding:8px 10px;background:var(--bg3);border-radius:10px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <button class="th-icon-btn" data-act="up" title="上移"><i class="fa-solid fa-chevron-up" style="font-size:10px"></i></button>
        <button class="th-icon-btn" data-act="down" title="下移"><i class="fa-solid fa-chevron-down" style="font-size:10px"></i></button>
      </div>
      <div style="min-width:0">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <i class="${MANAGED_CFG[t.kind as ManagedKind].icon}" style="color:var(--pink)"></i>
          <span style="font-weight:600">${esc(t.entryName)}</span>
          <span style="font-size:11px;color:var(--tx3)">${esc(p?.label || '?')} · ${esc(t.book)}</span>
        </div>
        <input class="th-edit-input th-ai-task-instr" data-act="instr" data-tid="${escAttr(t.taskId)}"
          placeholder="本任务备注指令（可选，如：更详细）" value="${escAttr(t.customInstruction)}"
          style="width:100%;margin-top:4px;font-size:12px">
      </div>
      <button class="th-icon-btn" data-act="del" title="删除"><i class="fa-solid fa-trash"></i></button>
    </div>`;
  }).join('');
  return `<div class="th-ai-pool" style="display:flex;flex-direction:column;gap:8px;min-height:0">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-weight:700;color:var(--pink);font-size:13px">② 任务池</span>
      <span style="font-size:12px;color:var(--tx3)">${cnt} 个 · 分桶：${bucketStr}</span>
      <div style="margin-left:auto;display:flex;gap:6px">
        <button class="th-btn th-btn-mini" id="th-ai-pool-export" title="导出任务池为 JSON"><i class="fa-solid fa-file-export"></i></button>
        <button class="th-btn th-btn-mini" id="th-ai-pool-import" title="从 JSON 导入任务池"><i class="fa-solid fa-file-import"></i></button>
        <input type="file" id="th-ai-pool-file" accept=".json,application/json" style="display:none">
        ${cnt ? `<button class="th-btn th-btn-mini" id="th-ai-pool-clear">清空</button>` : ''}
      </div>
    </div>
    <div class="th-ai-tasks" style="display:grid;gap:6px;flex:1;overflow:auto;min-height:120px;padding-right:4px">
      ${rows || `<div style="padding:14px;color:var(--tx3);font-size:13px;text-align:center">任务池为空，从左侧选择世界书条目加入</div>`}
    </div>
  </div>`;
}

// ==================== 事件绑定 ====================

function bindPanelEvents(): void {
  qs('#th-ai-close')?.addEventListener('click', closeModal2);
  qs('#th-ai-send')?.addEventListener('click', onSend);
  qs('#th-ai-add')?.addEventListener('click', onAddToPool);
  qs('#th-ai-prompt')?.addEventListener('change', e => {
    ST.promptId = (e.target as HTMLSelectElement).value;
  });
  qs('#th-ai-prompt-edit')?.addEventListener('click', openPromptManager);
  // 4b 第4项：增量模式开关 + 清除记录
  qs('#th-ai-incr')?.addEventListener('change', e => {
    setIncrEnabled(!!(e.target as HTMLInputElement).checked);
    toastr?.info?.((e.target as HTMLInputElement).checked ? '增量模式已开启' : '增量模式已关闭');
  });
  qs('#th-ai-incr-clear')?.addEventListener('click', () => {
    clearIncrMap(); toastr?.success?.('已清除增量记录（下次将全量发送）');
  });

  // 初始设置下拉选中
  const sel = qs<HTMLSelectElement>('#th-ai-prompt');
  if (sel && ST.promptId) sel.value = ST.promptId;

  // 世界书展开/条目勾选/全选反选（事件委托）
  qs('.th-ai-books')?.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const head = t.closest('[data-act="toggle"]') as HTMLElement | null;
    if (head) { await toggleBook(head.closest('.th-ai-book')!.getAttribute('data-book')!); return; }
    const allLink = t.closest('[data-act="all"]') as HTMLElement | null;
    if (allLink) { toggleBookAll(allLink.getAttribute('data-book')!, true); return; }
    const noneLink = t.closest('[data-act="none"]') as HTMLElement | null;
    if (noneLink) { toggleBookAll(noneLink.getAttribute('data-book')!, false); return; }
  });
  qs('.th-ai-books')?.addEventListener('change', (e) => {
    const cb = e.target as HTMLInputElement;
    if (cb.dataset.act !== 'entry') return;
    if (cb.checked) ST.selectedEntries.add(cb.dataset.key!); else ST.selectedEntries.delete(cb.dataset.key!);
    refreshAddBtn();
  });

  // 任务池操作（事件委托）
  qs('.th-ai-tasks')?.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const btn = t.closest('[data-act]') as HTMLElement | null;
    if (!btn) return;
    const tid = btn.getAttribute('data-tid') || btn.closest('.th-ai-task')?.getAttribute('data-tid');
    if (!tid) return;
    const act = btn.getAttribute('data-act');
    if (act === 'del') removeTask(tid);
    else if (act === 'up') moveTask(tid, -1);
    else if (act === 'down') moveTask(tid, 1);
    if (act === 'del' || act === 'up' || act === 'down') rerenderTaskpool();
  });
  qs('.th-ai-tasks')?.addEventListener('change', (e) => {
    const inp = e.target as HTMLInputElement;
    if (inp.dataset.act !== 'instr') return;
    updateTask(inp.dataset.tid!, { customInstruction: inp.value });
  });
  qs('#th-ai-pool-clear')?.addEventListener('click', () => {
    clearTasks(); rerenderTaskpool();
  });
  // 4c：任务池导入导出（JSON 文件）
  qs('#th-ai-pool-export')?.addEventListener('click', exportTaskpool);
  qs('#th-ai-pool-import')?.addEventListener('click', () => qs<HTMLInputElement>('#th-ai-pool-file')?.click());
  qs<HTMLInputElement>('#th-ai-pool-file')?.addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) void importTaskpool(f);
    (e.target as HTMLInputElement).value = ''; // 允许重复选同文件
  });
}

// 4c：导出任务池为 JSON 文件（内联 Blob 下载，避免 lib→modules 反向依赖 downloadText）
function exportTaskpool(): void {
  const tasks = getTasks();
  if (!tasks.length) { toastr?.warning?.('任务池为空，无可导出'); return; }
  try {
    const payload = JSON.stringify({ format: 'th-ai-taskpool-v1', tasks }, null, 2);
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const a = __doc.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ai任务池_${tasks.length}项.json`;
    __doc.body.appendChild(a); a.click(); __doc.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    toastr?.success?.(`已导出 ${tasks.length} 个任务`);
  } catch (e) { toastr?.error?.('导出失败：' + (e instanceof Error ? e.message : String(e))); }
}

// 4c：从 JSON 文件导入任务池（追加，addTask 重新分配 taskId）
async function importTaskpool(file: File): Promise<void> {
  try {
    const text = await file.text();
    const obj = JSON.parse(text);
    const arr: any[] = Array.isArray(obj) ? obj : (Array.isArray(obj?.tasks) ? obj.tasks : null as any);
    if (!arr) { toastr?.error?.('文件格式不符（需任务数组或 {tasks:[...]}）'); return; }
    const validKinds = new Set<string>(['location', 'event', 'stash-item', 'stash-skill', 'stash-status', 'stash-clothing']);
    let added = 0;
    for (const t of arr) {
      if (!t || typeof t !== 'object') continue;
      if (!t.kind || !validKinds.has(t.kind) || !t.book || !t.entryName) continue;
      addTask({
        kind: t.kind, promptId: t.promptId || `builtin-${t.kind}`, book: String(t.book), entryName: String(t.entryName),
        content: '', customInstruction: t.customInstruction || '',
      });
      added++;
    }
    rerenderTaskpool();
    toastr?.success?.(`已导入 ${added} 个任务到任务池`);
  } catch (e) { toastr?.error?.('导入失败：' + (e instanceof Error ? e.message : String(e))); }
}

function refreshAddBtn(): void {
  const btn = qs<HTMLButtonElement>('#th-ai-add');
  if (btn) btn.disabled = ST.selectedEntries.size === 0;
}

async function toggleBook(bookName: string): Promise<void> {
  if (ST.expanded.has(bookName)) {
    ST.expanded.delete(bookName);
  } else {
    ST.expanded.add(bookName);
    const b = ST.books.find(x => x.name === bookName);
    if (b && !b.loaded) {
      try {
        const entries = await safeGetWorldbook(bookName);
        b.entries = entries.map(e => ({ name: e.name, enabled: !!e.enabled, contentLen: (e.content || '').length }));
      } catch (err) {
        console.warn('[ai-summarize] 读取世界书失败', bookName, err);
        b.entries = [];
      }
      b.loaded = true;
    }
  }
  rerenderSelector();
}

function toggleBookAll(bookName: string, selectAll: boolean): void {
  const b = ST.books.find(x => x.name === bookName);
  if (!b || !b.entries) return;
  for (const e of b.entries) {
    const key = `${bookName}::${e.name}`;
    if (selectAll) ST.selectedEntries.add(key); else ST.selectedEntries.delete(key);
  }
  rerenderSelector();
  refreshAddBtn();
}

function onAddToPool(): void {
  const prompt = promptById(ST.promptId);
  if (!prompt) { toastr?.warning?.('请先选择提示词'); return; }
  if (!ST.selectedEntries.size) { toastr?.warning?.('请先勾选世界书条目'); return; }
  let added = 0;
  for (const key of ST.selectedEntries) {
    const [book, entryName] = key.split('::');
    const b = ST.books.find(x => x.name === book);
    const e = b?.entries?.find(x => x.name === entryName);
    if (!b || !e) continue;
    // 取条目原文 content（展开时已加载条目名，但 content 未存；这里再读一次完整内容）
    addTask({
      kind: prompt.kind, promptId: prompt.id, book, entryName,
      content: '',  // content 在发送时按需读取（避免任务池存大量文本）
      customInstruction: '',
    });
    added++;
  }
  ST.selectedEntries.clear();
  rerenderSelector();
  rerenderTaskpool();
  refreshAddBtn();
  toastr?.success?.(`已加入 ${added} 个任务到任务池`);
}

function rerenderSelector(): void {
  const slot = qs('.th-ai-sel');
  if (slot) { slot.outerHTML = renderSelector(); bindPanelEvents(); }
}
function rerenderTaskpool(): void {
  const slot = qs('.th-ai-pool');
  if (slot) { slot.outerHTML = renderTaskpool(); bindPanelEvents(); }
}

// ==================== 提示词管理器（§E.4 #20）===================

function openPromptManager(): void {
  const builtins = AI_SUMMARY_PROMPTS;
  const customs = getCustomPrompts();
  const row = (p: AiSummaryPrompt) => `<div style="display:flex;gap:8px;align-items:center;padding:6px 8px;background:var(--bg3);border-radius:8px">
    <i class="${MANAGED_CFG[p.kind as ManagedKind].icon}" style="color:var(--pink)"></i>
    <span style="flex:1">${esc(p.label)}${p.isBuiltin ? ' <span style="color:var(--tx3);font-size:11px">内置</span>' : ''}</span>
    ${p.isBuiltin
      ? `<button class="th-btn th-btn-mini" data-pm-act="copy" data-id="${escAttr(p.id)}">复制为自定义</button>`
      : `<button class="th-btn th-btn-mini" data-pm-act="edit" data-id="${escAttr(p.id)}">编辑</button> <button class="th-btn th-btn-mini" data-pm-act="del" data-id="${escAttr(p.id)}">删</button>`}
  </div>`;
  const html = `<div class="th-ai-pm" style="padding:12px;display:grid;gap:10px;max-height:60vh;overflow:auto">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span style="font-weight:600">提示词管理</span>
      <button class="th-btn th-btn-mini th-btn-primary" data-pm-act="new"><i class="fa-solid fa-plus"></i> 新建</button>
    </div>
    <div style="font-size:12px;color:var(--tx3)">内置 ${builtins.length} 套（只读，可复制为自定义后改）；自定义 ${customs.length} 套</div>
    ${[...builtins, ...customs].map(row).join('')}
    <div style="display:flex;justify-content:flex-end"><button class="th-btn" data-pm-act="back">返回</button></div>
  </div>`;
  openModal2('提示词管理', html);
  qs('.th-ai-pm')?.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const btn = t.closest('[data-pm-act]') as HTMLElement | null;
    if (!btn) return;
    const act = btn.getAttribute('data-pm-act');
    const id = btn.getAttribute('data-id');
    if (act === 'back') { renderPanel(); return; }
    if (act === 'new') { openPromptEditor(null); return; }
    if (act === 'copy' && id) { const p = promptById(id); if (p) openPromptEditor({ ...p, id: '', label: p.label + ' 副本', isBuiltin: false }); return; }
    if (act === 'edit' && id) { const p = getCustomPrompts().find(x => x.id === id); if (p) openPromptEditor(p); return; }
    if (act === 'del' && id) { deleteCustomPrompt(id); openPromptManager(); toastr?.success?.('已删除'); return; }
  });
}

function openPromptEditor(seed: (AiSummaryPrompt & { isBuiltin?: boolean }) | null): void {
  const kinds: AiSummaryPromptKind[] = ['location', 'event', 'stash-item', 'stash-skill', 'stash-status', 'stash-clothing'];
  const kindOpts = kinds.map(k => `<option value="${k}">${MANAGED_CFG[k as ManagedKind].label}</option>`).join('');
  const p = seed;
  const html = `<div class="th-ai-pe" style="padding:12px;display:grid;gap:10px">
    <label style="display:grid;gap:4px"><span style="font-size:13px">名称</span>
      <input id="th-pe-label" class="th-edit-input" value="${escAttr(p?.label || '')}" placeholder="如：暗黑风格地点提取"></label>
    <label style="display:grid;gap:4px"><span style="font-size:13px">输出类别</span>
      <select id="th-pe-kind" class="th-edit-select">${kindOpts}</select></label>
    <label style="display:grid;gap:4px"><span style="font-size:13px">模板（用 {{条目原文}} {{自定义指令}} 占位符）</span>
      <textarea id="th-pe-template" class="th-edit-textarea" rows="10" style="font-family:monospace;font-size:12px">${esc(p?.template || '')}</textarea></label>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="th-btn" id="th-pe-cancel">取消</button>
      <button class="th-btn th-btn-primary" id="th-pe-save">保存</button>
    </div>
  </div>`;
  openModal2(seed ? '编辑提示词' : '新建提示词', html);
  const kindSel = qs<HTMLSelectElement>('#th-pe-kind');
  if (kindSel && p) kindSel.value = p.kind;
  qs('#th-pe-cancel')?.addEventListener('click', openPromptManager);
  qs('#th-pe-save')?.addEventListener('click', () => {
    const label = (qs<HTMLInputElement>('#th-pe-label')?.value || '').trim();
    const kind = qs<HTMLSelectElement>('#th-pe-kind')?.value as AiSummaryPromptKind;
    const template = qs<HTMLTextAreaElement>('#th-pe-template')?.value || '';
    if (!label) { toastr?.warning?.('请填名称'); return; }
    if (!template.includes('{{条目原文}}')) { toastr?.warning?.('模板需含 {{条目原文}} 占位符'); return; }
    const id = p?.id || `custom-${Math.floor(Math.random() * 1e9).toString(36)}`;
    saveCustomPrompt({ id, label, kind, template });
    toastr?.success?.('已保存');
    openPromptManager();
  });
}

// ==================== 发送与注入（段3 dry-run/分桶/parse/归一化 + 段4 注入）====================

// 反馈2：改用 generateRaw + ordered_prompts，不带酒馆预设/世界书/聊天历史，内容精确进 user_input 位。
function getGenerateRaw(): ((cfg: any) => Promise<unknown>) | null {
  try {
    const w = window as any;
    if (typeof w.generateRaw === 'function') return w.generateRaw;
    const p = getRoot();
    if (p && typeof p.generateRaw === 'function') return p.generateRaw;
  } catch (e) { void e; }
  return null;
}

// 4c 第二语义：跨窗口取 injectPrompts（@types/function/inject.d.ts，window.TavernHelper 导出）
function getInjectPrompts(): ((p: any[], opts?: any) => { uninject: () => void }) | null {
  try {
    const w = window as any;
    if (typeof w.injectPrompts === 'function') return w.injectPrompts;
    const p = getRoot();
    if (p && typeof p.injectPrompts === 'function') return p.injectPrompts;
  } catch (e) { void e; }
  return null;
}

// 一个桶 = 同 kind 的若干任务，合并为一次 generate 请求（§E.5.2）
type Bucket = { kind: AiSummaryPromptKind; tasks: AiTask[] };
// 桶发送结果
type BucketResult = {
  kind: AiSummaryPromptKind;
  ok: boolean;
  error?: string;
  items: NormalizedItem[];          // 归一化后的卡片
  linksByName: Record<string, { locations?: string[]; events?: string[]; dlcs?: string[] }>;
  taskIds: string[];                 // 本桶覆盖的 task_id（用于进度报告）
};

function bucketTasks(tasks: AiTask[]): Bucket[] {
  const map = new Map<AiSummaryPromptKind, AiTask[]>();
  for (const t of tasks) {
    if (!map.has(t.kind)) map.set(t.kind, []);
    map.get(t.kind)!.push(t);
  }
  return Array.from(map.entries()).map(([kind, ts]) => ({ kind, tasks: ts }));
}

// 读取任务条目原文（按世界书缓存，避免重复读）
async function loadTaskContents(tasks: AiTask[]): Promise<Map<string, string>> {
  const out = new Map<string, string>(); // taskId → content
  const bookCache = new Map<string, any[]>();
  for (const t of tasks) {
    let entries = bookCache.get(t.book);
    if (!entries) {
      try { entries = await safeGetWorldbook(t.book); bookCache.set(t.book, entries); }
      catch (e) { console.warn('[ai-summarize] 读世界书失败', t.book, e); entries = []; bookCache.set(t.book, entries); }
    }
    const found = entries.find(e => e.name === t.entryName);
    out.set(t.taskId, found?.content || '');
  }
  return out;
}

// 粗估 token（中文约 1.5 字/token）
function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 1.5);
}

// 拼 user_input：桶内每个任务一块，标注 task_id，附自定义指令（§E.5.2 / §E.5.3）
// 置信度要求已由 AI_SUMMARY_SYSTEM_PROMPT 统一交代，此处不再重复追加。
function buildBucketInput(bucket: Bucket, contents: Map<string, string>, prompt: AiSummaryPrompt): string {
  const blocks: string[] = [];
  blocks.push(`【提取任务】本次需按 task_id 分别提取 ${bucket.tasks.length} 个任务，全部输出为「${prompt.label}」。`);
  for (const t of bucket.tasks) {
    const instr = t.customInstruction ? `\n[本任务附加指令] ${t.customInstruction}` : '';
    blocks.push(`--- task_id: ${t.taskId} ---${instr}\n【条目原文】\n${contents.get(t.taskId) || '(空)'}`);
  }
  // 用提示词模板包住（替换占位符；条目原文已在上方分块给出，模板里 {{条目原文}} 替换为引导语）
  const tmpl = prompt.template
    .replace(/\{\{条目原文\}\}/g, '见上方各 task_id 块')
    .replace(/\{\{自定义指令\}\}/g, bucket.tasks.some(t => t.customInstruction) ? '各任务附加指令见上方块。' : '');
  return `${tmpl}\n\n${blocks.join('\n\n')}`;
}

// dry-run 预览 modal（优化建议3：发送前展示桶数/token/预设，确认再发）
async function dryRunPreview(buckets: Bucket[], contents: Map<string, string>): Promise<boolean> {
  const cfg = resolveGenerateApiConfig();
  // 4b 第2项：逐桶预估 token（含提示词模板长度），合计为总量
  const bucketTok: number[] = [];
  for (const b of buckets) {
    const prompt = promptById(b.tasks[0].promptId);
    const tmplLen = (prompt?.template || '').length;
    let chars = tmplLen;
    for (const t of b.tasks) chars += (contents.get(t.taskId) || '').length;
    bucketTok.push(estimateTokens(String(chars)));
  }
  const totalTokens = bucketTok.reduce((s, n) => s + n, 0);
  const bucketLines = buckets.map((b, i) => {
    const prompt = promptById(b.tasks[0].promptId);
    return `<div style="padding:5px 10px;background:var(--bg3);border-radius:8px;font-size:13px;display:flex;align-items:center;gap:6px">
      <i class="${MANAGED_CFG[b.kind as ManagedKind].icon}" style="color:var(--pink)"></i>
      <span style="flex:1">${esc(prompt?.label || b.kind)} · ${b.tasks.length} 个任务 → 1 次请求</span>
      <span style="font-size:11px;color:var(--tx3)">≈${bucketTok[i]} tok</span>
    </div>`;
  }).join('');
  const apiName = cfg.usedApiPresetName || '(活动预设)';
  const hasApi = !!cfg.custom_api;
  const html = `<div class="th-ai-dry" style="padding:14px;display:grid;gap:12px">
    <div style="font-size:13px;line-height:1.7;color:var(--tx2)">
      将发送 <b>${buckets.length}</b> 桶（串行），预估输入合计约 <b>${totalTokens}</b> token。<br>
      API 预设：<b>${esc(apiName)}</b>${hasApi ? '' : ' <span style="color:var(--gold)">（未配置 custom_api，将走酒馆当前源）</span>'} · 提示词：<b>内置提取提示词</b>（generateRaw，不携带酒馆预设/世界书）
    </div>
    <div style="display:grid;gap:6px">${bucketLines}</div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="th-btn" id="th-dry-cancel">取消</button>
      <button class="th-btn th-btn-primary" id="th-dry-go"><i class="fa-solid fa-paper-plane"></i> 确认发送</button>
    </div>
  </div>`;
  openModal2('发送预览', html);
  return new Promise(resolve => {
    qs('#th-dry-cancel')?.addEventListener('click', () => { closeModal2(); resolve(false); });
    qs('#th-dry-go')?.addEventListener('click', () => { closeModal2(); resolve(true); });
  });
}

async function onSend(): Promise<void> {
  const tasks = getTasks();
  if (!tasks.length) { toastr?.warning?.('任务池为空'); return; }
  const generateRaw = getGenerateRaw();
  if (!generateRaw) { toastr?.error?.('当前环境无 generateRaw 接口'); return; }

  // 1. 读取所有任务条目原文
  toastr?.info?.('正在读取世界书条目…');
  const contents = await loadTaskContents(tasks);

  // 4b 第4项：增量模式 — 内容未变更的条目跳过发送（沿用上次结果，不重跑）
  let toSend = tasks;
  let skippedIncr = 0;
  if (getIncrEnabled()) {
    toSend = tasks.filter(t => isIncrChanged(t.book, t.entryName, contents.get(t.taskId) || ''));
    skippedIncr = tasks.length - toSend.length;
    if (skippedIncr > 0) toastr?.info?.(`增量模式：跳过 ${skippedIncr} 个未变更条目，发送 ${toSend.length} 个`);
    if (!toSend.length) {
      toastr?.success?.('全部条目内容未变更，无需发送');
      setTimeout(() => { renderPanel(); }, 1000);
      return;
    }
  }

  // 2. 分桶 + dry-run 预览
  const buckets = bucketTasks(toSend);
  const ok = await dryRunPreview(buckets, contents);
  if (!ok) return;

  // 3. 串行发桶（错误隔离）→ 收集原始输出 → 预览确认（反馈3：解析前加确认/取消，失败不自动关）
  const raws = await runSendLoop(buckets, contents);
  if (!raws.length) { renderPanel(); return; }
  showOutputPreview(buckets, raws, contents);
}

// 串行发桶，收集各桶原始 AI 输出（不解析）。开进度 modal + 流式监听，返回 BucketRaw[]。
async function runSendLoop(buckets: Bucket[], contents: Map<string, string>): Promise<BucketRaw[]> {
  const cfg = resolveGenerateApiConfig();
  const generateRaw = getGenerateRaw();
  if (!generateRaw) { toastr?.error?.('当前环境无 generateRaw 接口'); return []; }
  openProgressModal();
  startStreamListener();
  const raws: BucketRaw[] = [];
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    const prompt = promptById(b.tasks[0].promptId);
    setProgress(`(${i + 1}/${buckets.length}) 发送：${prompt?.label || b.kind}（${b.tasks.length} 个任务）…`, i, buckets.length);
    setStream('');
    const r = await sendOneBucket(b, contents, prompt, cfg, generateRaw);
    raws.push(r);
    if (r.ok) {
      // 4b 第4项：记录本桶各条目内容 hash（仅成功桶才记录，失败桶下次重试）
      if (getIncrEnabled()) {
        for (const t of b.tasks) recordIncrSent(t.book, t.entryName, contents.get(t.taskId) || '');
      }
      appendLog(`✓ ${prompt?.label || b.kind}：已收到 ${r.raw.length} 字输出`);
    } else appendLog(`✗ ${prompt?.label || b.kind} 失败：${r.error}`);
  }
  setProgress('发送完成', buckets.length, buckets.length);
  stopStreamListener();
  return raws;
}

// 进度 modal（反馈3：流式区加大到 280px + 可复制当前输出）
function openProgressModal(): void {
  openModal2('AI 总结中', `<div class="th-ai-progress" style="padding:18px;display:grid;gap:10px">
    <div id="th-ai-prog-text" style="font-size:14px">准备发送…</div>
    <div style="height:8px;background:var(--bg3);border-radius:4px;overflow:hidden"><div id="th-ai-prog-bar" style="height:100%;width:0;background:var(--pink);transition:width .3s"></div></div>
    <div style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;color:var(--tx3)">实时输出</span><button class="th-btn th-btn-mini" id="th-ai-prog-copy" style="margin-left:auto"><i class="fa-solid fa-copy"></i> 复制</button></div>
    <div id="th-ai-prog-stream" class="th-ai-stream" style="font-size:11px;color:var(--tx2);background:var(--bg2);border-radius:8px;padding:8px 10px;max-height:280px;overflow:auto;font-family:monospace;white-space:pre-wrap;min-height:48px"></div>
    <div id="th-ai-prog-log" style="font-size:12px;color:var(--tx3);max-height:120px;overflow:auto"></div>
  </div>`);
  qs('#th-ai-prog-copy')?.addEventListener('click', () => { copyText(_streamText); toastr?.success?.('已复制当前输出'); });
}

// 反馈3：AI 输出预览 + 确认/取消/重试。确认后才解析注入；失败(全空)给重试/返回，不自动关。
function showOutputPreview(buckets: Bucket[], raws: BucketRaw[], contents: Map<string, string>): void {
  const anyOk = raws.some(r => r.ok && r.raw);
  const allText = raws.filter(r => r.ok).map(r => r.raw).join('\n\n----\n\n');
  const blocksHtml = raws.map((r, i) => {
    const prompt = promptById(buckets[i].tasks[0].promptId);
    const head = `<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:var(--bg3);border-radius:8px;font-size:12px">
      <i class="${MANAGED_CFG[r.kind as ManagedKind].icon}" style="color:var(--pink)"></i>
      <span style="flex:1">${esc(prompt?.label || r.kind)}（${buckets[i].tasks.length} 个任务）</span>
      <span style="color:${r.ok ? 'var(--mint)' : 'var(--gold)'};font-size:11px">${r.ok ? `${r.raw.length}字` : '失败'}</span>
    </div>`;
    const body = r.ok
      ? `<pre class="th-ai-raw" style="white-space:pre-wrap;word-break:break-word;font-family:monospace;font-size:11px;background:var(--bg2);border-radius:8px;padding:8px 10px;max-height:200px;overflow:auto;margin:4px 0 10px">${esc(r.raw)}</pre>`
      : `<div style="font-size:11px;color:var(--gold);padding:6px 10px;margin-bottom:10px">${esc(r.error || '失败')}</div>`;
    return head + body;
  }).join('');
  const html = `<div class="th-ai-preview" style="padding:14px;display:flex;flex-direction:column;gap:10px;height:min(560px,74vh)">
    <div style="font-size:13px;color:var(--tx2);line-height:1.6">${anyOk ? 'AI 已返回输出，确认后解析并注入。可先复制查看原文。' : '全部任务失败或返回为空，可重试发送或返回。'}</div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="th-btn th-btn-mini" id="th-ai-pv-copy" ${anyOk ? '' : 'disabled'}><i class="fa-solid fa-copy"></i> 复制全部</button>
    </div>
    <div style="flex:1;overflow:auto;display:flex;flex-direction:column;gap:4px;padding-right:4px">${blocksHtml}</div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="th-btn" id="th-ai-pv-back">返回</button>
      <button class="th-btn" id="th-ai-pv-retry"><i class="fa-solid fa-rotate"></i> 重试发送</button>
      ${anyOk ? `<button class="th-btn th-btn-primary" id="th-ai-pv-confirm"><i class="fa-solid fa-circle-down"></i> 确认解析注入</button>` : ''}
    </div>
  </div>`;
  openModal2('AI 输出预览', html);
  qs('#th-ai-pv-copy')?.addEventListener('click', () => { copyText(allText); toastr?.success?.('已复制全部输出'); });
  qs('#th-ai-pv-back')?.addEventListener('click', () => { closeModal2(); renderPanel(); });
  qs('#th-ai-pv-retry')?.addEventListener('click', async () => {
    const again = await runSendLoop(buckets, contents);
    if (again.length) showOutputPreview(buckets, again, contents); else renderPanel();
  });
  qs('#th-ai-pv-confirm')?.addEventListener('click', () => {
    // 解析所有成功桶 → BucketResult[]（失败桶跳过）
    const results: BucketResult[] = [];
    for (let i = 0; i < raws.length; i++) {
      if (!raws[i].ok || !raws[i].raw) continue;
      results.push(parseBucketRaw(buckets[i], raws[i].raw));
    }
    const totalItems = results.reduce((s, r) => s + r.items.length, 0);
    if (totalItems === 0) {
      toastr?.warning?.('解析后无可注入内容（可重试或返回）');
      // 保持预览 modal，不自动关
      return;
    }
    LAST_SEND = { buckets, contents, results };
    openInjectConfirm(results);
  });
}

// 发送单个桶 → 返回原始 AI 输出（不解析）。反馈2：改用 generateRaw + ordered_prompts[内置系统提示词,'user_input']，
// 不带酒馆预设/世界书/聊天历史，内容精确进入 user_input 位。解析延后到玩家「确认」后（反馈3：解析前加确认/取消）。
type BucketRaw = { kind: AiSummaryPromptKind; ok: boolean; raw: string; error?: string; taskIds: string[] };

async function sendOneBucket(
  b: Bucket, contents: Map<string, string>, prompt: AiSummaryPrompt | undefined,
  cfg: ReturnType<typeof resolveGenerateApiConfig>, generateRaw: (c: any) => Promise<unknown>,
): Promise<BucketRaw> {
  try {
    const userInput = buildBucketInput(b, contents, prompt!);
    const genCfg: any = {
      user_input: userInput,
      // 反馈2核心：ordered_prompts 自定义预设，绕开酒馆 RP 预设([Start a new chat])与绑定世界书
      ordered_prompts: [
        { role: 'system', content: AI_SUMMARY_SYSTEM_PROMPT },
        'user_input',
      ],
      json_schema: buildJsonSchema(b.kind),
      should_silence: true,
      should_stream: true, // 4b 第6项：流式预览，配合 STREAM_TOKEN_RECEIVED_FULLY 事件实时显示半截输出
    };
    if (cfg.custom_api) genCfg.custom_api = cfg.custom_api;
    // 不传 preset_name：用内置系统提示词，避免 RP 预设与世界书干扰 user_input
    const ret = await generateRaw(genCfg);
    const raw = typeof ret === 'string'
      ? ret
      : (ret && typeof ret === 'object' && 'content' in (ret as any)) ? String((ret as any).content) : JSON.stringify(ret);
    if (!raw || !raw.trim()) return { kind: b.kind, ok: false, raw: '', error: 'AI 返回为空', taskIds: b.tasks.map(t => t.taskId) };
    return { kind: b.kind, ok: true, raw, taskIds: b.tasks.map(t => t.taskId) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: b.kind, ok: false, raw: '', error: msg, taskIds: b.tasks.map(t => t.taskId) };
  }
}

// 解析单个桶的原始 AI 输出 → BucketResult（parseAiResult + 归一化）。供「确认解析」与单桶重生复用。
function parseBucketRaw(b: Bucket, raw: string): BucketResult {
  try {
    const parsed = parseAiResult(raw);
    const allItems: any[] = [];
    for (const r of parsed.results) allItems.push(...(r.items || []));
    const norm = normalizeItems(b.kind, allItems);
    return { kind: b.kind, ok: true, items: norm.items, linksByName: norm.linksByName, taskIds: b.tasks.map(t => t.taskId) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: b.kind, ok: false, error: msg, items: [], linksByName: {}, taskIds: b.tasks.map(t => t.taskId) };
  }
}

// 4b 第3项：最近一次发送的上下文（桶/原文/结果），供「重新生成本桶」复用，不重跑整批
let LAST_SEND: { buckets: Bucket[]; contents: Map<string, string>; results: BucketResult[] } | null = null;

function setProgress(text: string, done: number, total: number): void {
  const t = qs('#th-ai-prog-text'); if (t) t.textContent = text;
  const bar = qs<HTMLElement>('#th-ai-prog-bar'); if (bar) bar.style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
}
function appendLog(line: string): void {
  const log = qs('#th-ai-prog-log'); if (log) log.innerHTML += esc(line) + '<br>';
}

// ==================== 4b 第6项：流式预览（监听 STREAM_TOKEN_RECEIVED_FULLY 实时显示半截输出）====================
let _streamOff: (() => void) | null = null;
let _streamText = '';   // 当前实时输出文本，供「复制」按钮取用
function setStream(text: string): void {
  _streamText = text || '';
  const el = qs('#th-ai-prog-stream');
  if (el) el.textContent = _streamText || '（等待 AI 输出…）';
}

// 跨窗口复制文本（execCommand 兜底，iframe/parent 均可用）
function copyText(text: string): void {
  try {
    const ta = __doc.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    __doc.body.appendChild(ta); ta.select();
    try { __doc.execCommand('copy'); } catch (e) { void e; }
    __doc.body.removeChild(ta);
  } catch (e) { console.warn('[ai-summarize] 复制失败', e); }
}
function startStreamListener(): void {
  try {
    const w = window as any;
    const root = getRoot();
    const evOn = (typeof w.eventOn === 'function' ? w.eventOn : null) || (root && typeof root.eventOn === 'function' ? root.eventOn : null);
    const evOff = (typeof w.eventOff === 'function' ? w.eventOff : null) || (root && typeof root.eventOff === 'function' ? root.eventOff : null);
    const events = (w.iframe_events) || (root && root.iframe_events);
    if (typeof evOn !== 'function' || !events?.STREAM_TOKEN_RECEIVED_FULLY) return;
    const handler = (fullText: string) => { setStream(String(fullText || '')); };
    const ret = evOn(events.STREAM_TOKEN_RECEIVED_FULLY, handler);
    // eventOn 返回卸载句柄（EventOnReturn），优先用它；否则记 evOff 兜底
    _streamOff = typeof ret === 'function' ? ret : (typeof evOff === 'function' ? () => { try { evOff(events.STREAM_TOKEN_RECEIVED_FULLY, handler); } catch (e) { void e; } } : null);
  } catch (e) { console.warn('[ai-summarize] 流式监听启动失败', e); }
}
function stopStreamListener(): void {
  try { if (_streamOff) { _streamOff(); _streamOff = null; } } catch (e) { void e; }
}

// ==================== 注入确认 + 注入 + 建关联 + 回写初始（段4）====================

// 一条可注入项（展平自各桶归一化结果）
type Injectable = {
  kind: AiSummaryPromptKind;
  name: string;
  desc: string;          // location/event: 纯文本简介；stash-*: 结构化 JSON 字符串
  tags: string[];
  links?: { locations?: string[]; events?: string[]; dlcs?: string[] };
  exists: boolean;       // 本地是否已有同名卡片（冲突）
  confidence?: '高' | '中' | '低';  // 4b 第1项：AI 自评把握
};

function collectInjectables(results: BucketResult[]): Injectable[] {
  const out: Injectable[] = [];
  for (const r of results) {
    if (!r.ok) continue;
    const existing = new Set(Object.keys(getManagedItems(r.kind as ManagedKind)));
    for (const it of r.items) {
      const isStash = r.kind.startsWith('stash-');
      const desc = isStash ? JSON.stringify(it.fields || {}) : (it.desc || '');
      out.push({
        kind: r.kind, name: it.name, desc, tags: it.tags || [],
        links: it.links, exists: existing.has(it.name),
        confidence: it.confidence,
      });
    }
  }
  return out;
}

// 过滤 links：只保留目标 kind 中已存在的卡片名（防 AI 幻觉关联，§E.7 #26）
function filterLinks(links?: { locations?: string[]; events?: string[]; dlcs?: string[] }): { locations?: string[]; events?: string[]; dlcs?: string[] } | undefined {
  if (!links) return undefined;
  const filt = (arr: string[] | undefined, kind: ManagedKind) => {
    if (!arr || !arr.length) return undefined;
    const existing = new Set(Object.keys(getManagedItems(kind)));
    const kept = arr.map(s => s.trim()).filter(s => existing.has(s));
    return kept.length ? kept : undefined;
  };
  const out: { locations?: string[]; events?: string[]; dlcs?: string[] } = {};
  const l = filt(links.locations, 'location'); if (l) out.locations = l;
  const e = filt(links.events, 'event'); if (e) out.events = e;
  const d = filt(links.dlcs, 'dlc'); if (d) out.dlcs = d;
  return Object.keys(out).length ? out : undefined;
}

function openInjectConfirm(results: BucketResult[]): void {
  const injectables = collectInjectables(results);
  if (!injectables.length) { toastr?.warning?.('无可注入内容'); renderPanel(); return; }

  // 4b 第3项：按桶 kind 分组渲染，每组带「重新生成本桶」按钮（单桶重生不重跑整批）
  const groups: { kind: AiSummaryPromptKind; label: string; icon: string; idxs: number[] }[] = [];
  for (let i = 0; i < injectables.length; i++) {
    const it = injectables[i];
    const g = groups[groups.length - 1];
    if (g && g.kind === it.kind) g.idxs.push(i);
    else groups.push({ kind: it.kind, label: MANAGED_CFG[it.kind as ManagedKind].label, icon: MANAGED_CFG[it.kind as ManagedKind].icon, idxs: [i] });
  }

  const rowHtml = (it: Injectable, i: number): string => {
    const cfg = MANAGED_CFG[it.kind as ManagedKind];
    const conflict = it.exists
      ? `<select class="th-edit-select th-ai-conflict" data-idx="${i}" style="font-size:11px">
          <option value="skip" selected>跳过</option>
          <option value="overwrite">覆盖</option>
          <option value="copy">建副本</option>
        </select>`
      : `<span style="font-size:11px;color:var(--mint)">新建</span>`;
    const descPrev = it.kind.startsWith('stash-')
      ? '<span style="color:var(--tx3)">（结构化字段）</span>'
      : esc(it.desc.slice(0, 40)) + (it.desc.length > 40 ? '…' : '');
    const linkBadge = it.links ? ' <span style="color:var(--sky);font-size:11px">🔗</span>' : '';
    const confBadge = it.confidence
      ? ` <span class="th-ai-conf th-ai-conf-${it.confidence}" title="AI 自评把握：${it.confidence}">${it.confidence}</span>`
      : '';
    return `<label class="th-ai-inj-row" data-idx="${i}" style="display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;padding:7px 10px;background:var(--bg3);border-radius:8px">
      <input type="checkbox" class="th-ai-inj-ck" data-idx="${i}" ${it.exists ? '' : 'checked'}>
      <div style="min-width:0">
        <div style="display:flex;gap:6px;align-items:center">
          <i class="${cfg.icon}" style="color:var(--pink)"></i>
          <span style="font-weight:600">${esc(it.name)}</span>${linkBadge}${confBadge}
        </div>
        <div style="font-size:11px;color:var(--tx3)">${descPrev}</div>
      </div>
      <div class="th-ai-inj-conflict">${conflict}</div>
    </label>`;
  };
  // 分组渲染：组头（图标+类别+数量+重新生成按钮）+ 该组条目
  const listHtml = groups.map(g => {
    const head = `<div class="th-ai-inj-group" style="display:flex;align-items:center;gap:8px;padding:6px 4px;margin-top:4px">
      <i class="${g.icon}" style="color:var(--pink)"></i>
      <span style="font-weight:700;font-size:13px">${esc(g.label)}</span>
      <span style="font-size:11px;color:var(--tx3)">${g.idxs.length} 项</span>
      <button class="th-btn th-btn-mini th-ai-reroll" data-reroll="${g.kind}" title="重新生成此类别（不影响其他桶）" style="margin-left:auto"><i class="fa-solid fa-rotate"></i> 重新生成</button>
    </div>`;
    return head + g.idxs.map(i => rowHtml(injectables[i], i)).join('');
  }).join('');

  const html = `<div class="th-ai-inject" style="padding:14px;display:grid;gap:12px">
    <div style="font-size:13px;color:var(--tx2);line-height:1.6">AI 返回 ${injectables.length} 项，逐条勾选后注入为本地卡片。同名冲突可选「跳过/覆盖/建副本」。</div>
    <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:13px">
      <label><input type="checkbox" id="th-ai-writeback"> 同时回写初始数据（[初始·xxx] 条目）</label>
      <label>模式：
        <select id="th-ai-wb-mode" class="th-edit-select" style="font-size:12px">
          <option value="dedupe" selected>检测重名</option>
          <option value="append">增量</option>
        </select>
      </label>
    </div>
    <div class="th-ai-inj-list" style="display:grid;gap:6px;max-height:300px;overflow:auto;padding-right:4px">${listHtml}</div>
    <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap">
      <button class="th-btn" id="th-ai-inj-cancel">取消</button>
      <button class="th-btn" id="th-ai-inj-ctx" title="把选中项作为提示词临时注入下次 AI 请求（不建卡，仅本次有效）"><i class="fa-solid fa-comment-dots"></i> 注入到AI上下文(临时)</button>
      <button class="th-btn th-btn-primary" id="th-ai-inj-go"><i class="fa-solid fa-circle-down"></i> 注入选中项(建卡)</button>
    </div>
  </div>`;
  openModal2('注入确认', html);

  qs('#th-ai-inj-cancel')?.addEventListener('click', () => { closeModal2(); renderPanel(); });
  // 4b 第3项：重新生成本桶（单桶重生，复用 LAST_SEND 上下文，不重跑整批）
  qsa<HTMLButtonElement>('.th-ai-reroll').forEach(btn => {
    btn.addEventListener('click', () => { void rerollBucket(btn.dataset.reroll as AiSummaryPromptKind, btn); });
  });
  qs('#th-ai-inj-go')?.addEventListener('click', () => {
    const writeback = !!qs<HTMLInputElement>('#th-ai-writeback')?.checked;
    const wbMode = (qs<HTMLSelectElement>('#th-ai-wb-mode')?.value || 'dedupe') as InitialWriteMode;
    const picks = collectPicks(injectables);
    if (!picks.length) { toastr?.warning?.('未勾选任何项'); return; }
    void doInject(injectables, picks, writeback, wbMode);
  });
  // 4c 第二语义：把选中项经 injectPrompts 临时注入下次 AI 请求上下文（不建卡，once:true 仅本次有效）
  qs('#th-ai-inj-ctx')?.addEventListener('click', () => {
    const picks = collectPicks(injectables);
    if (!picks.length) { toastr?.warning?.('未勾选任何项'); return; }
    void injectToContext(injectables, picks);
  });
}

// 收集注入确认面板的勾选项（复用：建卡注入 与 4c 注入上下文 共用）
function collectPicks(injectables: Injectable[]): { idx: number; conflict: 'skip' | 'overwrite' | 'copy' }[] {
  const picks: { idx: number; conflict: 'skip' | 'overwrite' | 'copy' }[] = [];
  qsa<HTMLInputElement>('.th-ai-inj-ck').forEach(ck => {
    if (ck.checked) {
      const idx = Number(ck.dataset.idx);
      const exists = injectables[idx].exists;
      const conflictSel = qs<HTMLSelectElement>(`.th-ai-conflict[data-idx="${idx}"]`);
      const conflict = exists && conflictSel ? (conflictSel.value as 'skip' | 'overwrite' | 'copy') : 'overwrite';
      picks.push({ idx, conflict });
    }
  });
  return picks;
}

// 4c：把选中项格式化为提示词文本，经 injectPrompts 注入下次 AI 请求（position:'in_chat'，once:true 仅本次有效，不建卡）。
async function injectToContext(injectables: Injectable[], picks: { idx: number }[]): Promise<void> {
  const injectPrompts = getInjectPrompts();
  if (!injectPrompts) { toastr?.error?.('当前环境无 injectPrompts 接口'); return; }
  const text = formatInjectContextText(injectables, picks);
  try {
    injectPrompts(
      [{ id: 'th_ai_summary_ctx', position: 'in_chat', depth: 0, role: 'system', content: text, should_scan: true }],
      { once: true },
    );
    toastr?.success?.(`已注入 ${picks.length} 项到下次 AI 请求上下文（仅本次有效，不建卡）`);
    closeModal2();
    renderPanel();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    toastr?.error?.(`注入上下文失败：${msg}`);
  }
}

// 把可注入项格式化为给 AI 看的简洁摘要文本（按类别分组）。
function formatInjectContextText(injectables: Injectable[], picks: { idx: number }[]): string {
  const byKind = new Map<AiSummaryPromptKind, Injectable[]>();
  for (const p of picks) {
    const it = injectables[p.idx];
    if (!it) continue;
    if (!byKind.has(it.kind)) byKind.set(it.kind, []);
    byKind.get(it.kind)!.push(it);
  }
  const lines: string[] = ['【AI总结·注入上下文（仅本次有效）】以下是本轮从世界书提取的设定要素，请在后续生成中参考：'];
  for (const [kind, items] of byKind) {
    lines.push(`\n[${MANAGED_CFG[kind as ManagedKind].label}]`);
    for (const it of items) lines.push('- ' + formatItemLine(it));
  }
  return lines.join('\n');
}

// 单条可注入项 → 给 AI 的摘要行
function formatItemLine(it: Injectable): string {
  if (it.kind === 'location' || it.kind === 'event') {
    let line = `${it.name}：${it.desc || '(无简介)'}`;
    if (it.links) {
      const refs: string[] = [];
      if (it.links.locations?.length) refs.push('地点:' + it.links.locations.join('/'));
      if (it.links.events?.length) refs.push('事件:' + it.links.events.join('/'));
      if (it.links.dlcs?.length) refs.push('DLC:' + it.links.dlcs.join('/'));
      if (refs.length) line += `（关联 ${refs.join('，')}）`;
    }
    return line;
  }
  // stash-*：desc 是结构化 JSON 字符串
  let f: Record<string, any> = {};
  try { f = it.desc ? JSON.parse(it.desc) : {}; } catch (e) { void e; }
  const g = (k: string) => (f[k] != null && f[k] !== '') ? String(f[k]) : '';
  if (it.kind === 'stash-item') {
    let line = `${it.name}×${f.数量 ?? 1}：${g('简介')}`;
    if (g('效果')) line += `（效果：${g('效果')}）`;
    return line;
  }
  if (it.kind === 'stash-skill') {
    let line = `${it.name} Lv${f.等级 ?? 1}：${g('简介')}`;
    if (g('效果')) line += `（效果：${g('效果')}）`;
    return line;
  }
  if (it.kind === 'stash-status') {
    let line = `${it.name}：${g('效果')}`;
    if (g('来源')) line += `（来源：${g('来源')}）`;
    if (g('持续时间')) line += ` 持续${g('持续时间')}`;
    return line;
  }
  // stash-clothing
  return `${it.name}（${g('穿着部位') || '?'}·${g('穿着情况') || '穿着'}）：${g('外观详情')}`;
}

// 4b 第3项：重新生成单个桶。复用 LAST_SEND 的桶/原文上下文，仅重跑该 kind 的一次请求，替换其结果后重渲染确认。
async function rerollBucket(kind: AiSummaryPromptKind, btn: HTMLButtonElement): Promise<void> {
  if (!LAST_SEND) { toastr?.warning?.('无可重生的上下文'); return; }
  const generateRaw = getGenerateRaw();
  if (!generateRaw) { toastr?.error?.('当前环境无 generateRaw 接口'); return; }
  const bucket = LAST_SEND.buckets.find(b => b.kind === kind);
  const ri = LAST_SEND.results.findIndex(r => r.kind === kind);
  if (!bucket || ri < 0) { toastr?.warning?.('未找到该桶任务'); return; }
  const prompt = promptById(bucket.tasks[0].promptId);
  const cfg = resolveGenerateApiConfig();
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 重生中…';
  toastr?.info?.(`正在重新生成「${prompt?.label || kind}」…`);
  const raw = await sendOneBucket(bucket, LAST_SEND.contents, prompt, cfg, generateRaw);
  const newRes: BucketResult = raw.ok && raw.raw
    ? parseBucketRaw(bucket, raw.raw)
    : { kind, ok: false, error: raw.error, items: [], linksByName: {}, taskIds: bucket.tasks.map(t => t.taskId) };
  LAST_SEND.results[ri] = newRes;
  if (newRes.ok) toastr?.success?.(`已重新生成「${prompt?.label || kind}」：${newRes.items.length} 项`);
  else toastr?.error?.(`重生失败：${newRes.error}`);
  // 用最新结果重渲染（勾选状态会重置为默认，符合「换了一批结果」的预期）
  openInjectConfirm(LAST_SEND.results);
}

async function doInject(
  injectables: Injectable[],
  picks: { idx: number; conflict: 'skip' | 'overwrite' | 'copy' }[],
  writeback: boolean,
  wbMode: InitialWriteMode,
): Promise<void> {
  let injected = 0, skipped = 0, copied = 0;
  // 按 kind 攒回写初始的 items
  const wbByKind = new Map<ManagedKind, InitialWriteItem[]>();
  const addWb = (kind: ManagedKind, item: InitialWriteItem) => {
    if (!wbByKind.has(kind)) wbByKind.set(kind, []);
    wbByKind.get(kind)!.push(item);
  };

  for (const p of picks) {
    const it = injectables[p.idx];
    if (it.exists && p.conflict === 'skip') { skipped++; continue; }
    // 决定写入名（建副本时换名）
    let name = it.name;
    if (it.exists && p.conflict === 'copy') {
      let i = 1; name = `${it.name} (副本)`;
      while (getManagedItems(it.kind as ManagedKind)[name]) name = `${it.name} (副本${++i})`;
      copied++;
    } else {
      injected++;
    }
    // location/event：纯文本 desc + links（过滤后）+ 双向建关联
    if (it.kind === 'location' || it.kind === 'event') {
      const links = filterLinks(it.links);
      addManagedItem(it.kind as ManagedKind, name, { desc: it.desc, tags: it.tags, links });
      if (links) syncBidirLink(it.kind as ManagedKind, name, links);
      if (writeback) addWb(it.kind as ManagedKind, { name, desc: it.desc, tags: it.tags, links });
    } else {
      // stash-*：desc = 结构化 JSON 字符串（已在 collectInjectables 里 JSON.stringify）
      addManagedItem(it.kind as ManagedKind, name, { desc: it.desc, tags: it.tags });
      if (writeback) addWb(it.kind as ManagedKind, { name, desc: it.desc, tags: it.tags });
    }
  }

  // 回写初始数据（按 kind 逐类调 writeInitialItemsForKind）
  let wbSummary = '';
  if (writeback && wbByKind.size) {
    let wbWritten = 0, wbSkipped = 0;
    for (const [kind, items] of wbByKind) {
      try {
        const res = await writeInitialItemsForKind(kind, items, wbMode);
        wbWritten += res.written; wbSkipped += res.skipped;
      } catch (e) { console.warn('[ai-summarize] 回写初始失败', kind, e); }
    }
    wbSummary = `；回写初始 ${wbWritten} 项（跳过 ${wbSkipped}）`;
  }

  closeModal2();
  toastr?.success?.(`已注入 ${injected} 项${copied ? `、建副本 ${copied} 项` : ''}${skipped ? `、跳过 ${skipped} 项` : ''}${wbSummary}`);
  // 清空已发送的任务池
  clearTasks();
  renderPanel();
}
