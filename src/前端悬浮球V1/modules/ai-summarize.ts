// 批次4a · AI 总结与注入 主面板（§E）
// 选世界书条目 → 选提示词 → 加入任务池 → 同 kind 分桶统一发送 → AI 返回 JSON → 归一化 → 注入确认 → 注入为 managed 卡片 + 建关联。
// 命令式 innerHTML + openModal2，不引 Vue。跨窗口走 safeGetWorldbook/getRoot 兜底。
// 依赖：resolveGenerateApiConfig（preset-env）、addManagedItem（managed-store）、
//   writeInitialItemsForKind（stash-io，回写初始）、openRuntimeImportModal（stash-io，注入确认复用 UI 范式）。
import { esc, escAttr, qs, qsa, __doc } from '../lib/dom-utils';
import { openModal2, closeModal2, closeAllModal2 } from '../status-bar-init';
import { safeGetWorldbook } from '../lib/tavern-api';
import { getCharWorldbookList } from './managed-modal';
import { AI_SUMMARY_SYSTEM_PROMPT, type AiSummaryPrompt, type AiSummaryPromptKind } from '../lib/config';
import {
  getTasks, addTask, removeTask, moveTask, updateTask, clearTasks,
  getIncrEnabled, setIncrEnabled, isIncrChanged, recordIncrSent, clearIncrMap,
  getAiStyleSuffix,
  getActivePersonaText,
  getPlans, savePlan, deletePlan,
  type AiTask,
} from '../lib/ai-summary-store';
import { getAllAsSummaryPrompts } from '../lib/prompt-registry';
import { openPromptSettings } from './prompt-settings';
import { buildJsonSchema, parseAiResult, normalizeItems, type NormalizedItem } from '../lib/ai-summary-schema';
import { resolveGenerateApiConfig } from '../lib/preset-env';
import { getManagedItems, addManagedItem } from '../lib/managed-store';
import { getSnapshots, rollbackSnapshot, deleteSnapshot, pushSnapshot } from '../lib/ai-snapshots';
import { MANAGED_CFG, type ManagedKind } from '../lib/config';
import { getRoot } from '../lib/tavern-api';
import { writeInitialItemsForKind, type InitialWriteItem, type InitialWriteMode } from './stash-io';

// ==================== 提示词（内置 + 自定义合并）====================

function allPrompts(): AiSummaryPrompt[] {
  return getAllAsSummaryPrompts();
}
function promptById(id: string): AiSummaryPrompt | undefined {
  return allPrompts().find(p => p.id === id);
}

// ==================== 世界书选择器（三源去重）====================

type WbSource = '全部' | '全局' | '角色卡';
type WbBookInfo = { name: string; source: WbSource; loaded?: boolean; entries?: { name: string; enabled: boolean; contentLen: number; content?: string }[] };

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
  drillBook: string | null;    // 批次6：两级钻取——null=书列表视图；书名=进入该书的条目视图
  selectedEntries: Set<string>; // 选中条目 key：`${book}::${entryName}`
  promptId: string;            // 当前选的提示词
  searchQ: string;             // 当前搜索关键字（反馈1）
  searchHits: Set<string>;     // 搜索命中条目 key（高亮用）
  searchBooks: Set<string>;    // 批次6：搜索命中的世界书名（书列表视图只显示命中书）
};

function freshState(): PanelState {
  const prompts = allPrompts();
  return { books: listWorldbooks(), drillBook: null, selectedEntries: new Set(), promptId: prompts[0]?.id ?? '', searchQ: '', searchHits: new Set(), searchBooks: new Set() };
}

let ST: PanelState = freshState();
// 反馈1：中文 IME 组合态标志（拼音输入未上屏期间为 true，期间不触发搜索重渲染）
let _imeComposing = false;

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
      <button class="th-btn th-btn-mini" id="th-ai-preview" title="预览最终拼装文本（人格+系统+风格+约束+条目原文）"><i class="fa-solid fa-eye"></i> 发送前预览</button>
      <button class="th-btn" id="th-ai-close">关闭</button>
      <button class="th-btn th-btn-primary" id="th-ai-send"><i class="fa-solid fa-paper-plane"></i> 发送并注入</button>
    </div>
    <div class="th-ai-cols" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;height:min(440px,56vh)">
      ${renderSelector()}
      ${renderTaskpool()}
    </div>
  </div>`;
  openModal2('AI 总结注入', html, { reset: true, revive: renderPanel });
  bindPanelEvents();
}

// ==================== 选择器渲染 ====================

function renderSelector(): string {
  const prompts = allPrompts();
  const promptOpts = prompts.map(p =>
    `<option value="${escAttr(p.id)}">${esc(p.label)}${p.isBuiltin ? '' : '（自定义）'}</option>`).join('');

  const inDrill = ST.drillBook != null;
  // 顶部公共区：提示词 + 增量 + 搜索（两视图共用）
  const head = `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span style="font-weight:700;color:var(--pink);font-size:13px">① 世界书条目</span>
      <span style="color:var(--tx3);font-size:11px">${inDrill ? '勾选条目 → 加入任务池' : '点世界书进入查看条目'}</span>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span style="color:var(--tx2);font-size:13px">提示词：</span>
      <select id="th-ai-prompt" class="th-edit-select" style="max-width:200px">${promptOpts}</select>
      <button class="th-btn th-btn-mini" id="th-ai-prompt-edit" title="管理提示词"><i class="fa-solid fa-pen"></i></button>
    </div>
    <label style="display:flex;gap:6px;align-items:center;font-size:12px;color:var(--tx2);cursor:pointer" title="开启后，内容未变更的条目会跳过发送（按上次结果保留）">
      <input type="checkbox" id="th-ai-incr" ${getIncrEnabled() ? 'checked' : ''}> 增量模式（仅发送内容有变更的条目）
      <a id="th-ai-incr-clear" style="color:var(--tx3);font-size:11px;cursor:pointer;margin-left:auto">清除记录</a>
    </label>
    <input id="th-ai-search" class="th-edit-input" style="width:100%;font-size:12px" placeholder="${inDrill ? '在本世界书内搜索条目…' : '搜索世界书 / 条目（命中的世界书才会显示）'}" value="${escAttr(ST.searchQ)}">`;

  const body = inDrill ? renderEntriesView() : renderBooksView();
  // 反馈1：把列表区独立成 .th-ai-body 包裹层。搜索时只重渲染本层、绝不触碰 #th-ai-search 输入框，
  // 输入框 DOM 保持存活 → 焦点与中文 IME 输入不被打断（旧版 rerenderSelector 整块 outerHTML 会销毁输入框）。
  return `<div class="th-ai-sel" style="display:flex;flex-direction:column;gap:10px;min-height:0">
    ${head}
    <div class="th-ai-body" style="display:flex;flex-direction:column;flex:1;min-height:0">${body}</div>
  </div>`;
}

// 书列表视图（drillBook=null）：列出世界书，搜索时只显示命中书；点书进入条目视图
function renderBooksView(): string {
  const q = ST.searchQ.trim();
  const books = q ? ST.books.filter(b => ST.searchBooks.has(b.name)) : ST.books;
  const rows = books.map(b => {
    const srcColor = b.source === '角色卡' ? 'var(--pink)' : b.source === '全局' ? 'var(--mint)' : 'var(--sky)';
    const hitCnt = q ? (b.entries?.filter(e => ST.searchHits.has(`${b.name}::${e.name}`)).length || 0) : 0;
    const selCnt = ST.selectedEntries.size ? Array.from(ST.selectedEntries).filter(k => k.startsWith(b.name + '::')).length : 0;
    return `<div class="th-ai-book" data-book="${escAttr(b.name)}">
      <div class="th-ai-book-head" data-act="enter" style="display:flex;align-items:center;gap:8px;padding:9px 10px;background:var(--bg3);border-radius:10px;cursor:pointer">
        <i class="fa-solid fa-book" style="color:${srcColor}"></i>
        <span style="flex:1">${esc(b.name)}</span>
        ${selCnt ? `<span style="font-size:11px;color:var(--mint)">已选 ${selCnt}</span>` : ''}
        ${hitCnt ? `<span style="font-size:11px;color:var(--pink)">命中 ${hitCnt}</span>` : ''}
        <span style="font-size:11px;color:var(--tx3)">${b.source}</span>
        <i class="fa-solid fa-chevron-right" style="font-size:11px;color:var(--tx3)"></i>
      </div>
    </div>`;
  }).join('');
  const empty = q ? '<div style="padding:14px;color:var(--tx3);font-size:12px;text-align:center">无命中的世界书</div>'
    : '<div style="padding:14px;color:var(--tx3);font-size:12px;text-align:center">没有可用世界书</div>';
  return `<div class="th-ai-books" style="display:grid;gap:6px;flex:1;overflow:auto;min-height:120px;padding-right:4px">${rows || empty}</div>`;
}

// 条目视图（drillBook=书名）：返回按钮 + 当前书条目列表（搜索过滤本书）
function renderEntriesView(): string {
  const b = ST.books.find(x => x.name === ST.drillBook);
  const backBar = `<div style="display:flex;align-items:center;gap:8px">
      <button class="th-btn th-btn-mini" id="th-ai-back"><i class="fa-solid fa-chevron-left"></i> 返回世界书列表</button>
      <span style="font-weight:600;font-size:13px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><i class="fa-solid fa-book" style="color:var(--pink)"></i> ${esc(ST.drillBook || '')}</span>
    </div>`;
  return `<div style="display:flex;flex-direction:column;gap:8px;flex:1;min-height:0">
    ${backBar}
    <div class="th-ai-books" style="display:grid;gap:6px;flex:1;overflow:auto;min-height:120px;padding-right:4px">${b ? renderBookEntries(b) : ''}</div>
  </div>`;
}

function renderBookEntries(b: WbBookInfo): string {
  if (!b.loaded) return `<div style="padding:10px;color:var(--tx3);font-size:12px">加载中…</div>`;
  const q = ST.searchQ.trim().toLowerCase();
  let entries = b.entries || [];
  if (q) entries = entries.filter(e => e.name.toLowerCase().includes(q));
  if (!entries.length) return `<div style="padding:10px;color:var(--tx3);font-size:12px">${q ? '（无匹配条目）' : '（无条目）'}</div>`;
  const rows = entries.map(e => {
    const key = `${b.name}::${e.name}`;
    const checked = ST.selectedEntries.has(key) ? 'checked' : '';
    const offCls = e.enabled ? '' : ' th-ai-entry-off';
    const hitCls = ST.searchHits.has(key) ? ' th-ai-hit' : '';
    return `<label class="th-ai-entry${offCls}${hitCls}" data-entry-key="${escAttr(key)}" style="display:flex;align-items:center;gap:8px;padding:5px 10px;font-size:13px;cursor:pointer">
      <input type="checkbox" data-act="entry" data-key="${escAttr(key)}" ${checked}>
      <span style="flex:1">${esc(e.name)}</span>
      <span style="font-size:11px;color:var(--tx3)">${e.contentLen}字</span>
    </label>`;
  }).join('');
  return `<div class="th-ai-entries" style="padding:4px 0">
    <div style="padding:4px 10px;display:flex;gap:12px;font-size:12px">
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
        <button class="th-btn th-btn-mini" id="th-ai-plan-save" title="把当前任务池存为提取方案">存为方案</button>
        <button class="th-btn th-btn-mini" id="th-ai-plan-load" title="载入已存方案到任务池">载入方案</button>
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
  qs('#th-ai-preview')?.addEventListener('click', () => { void openSendPreview(); });
  qs('#th-ai-prompt')?.addEventListener('change', e => {
    ST.promptId = (e.target as HTMLSelectElement).value;
  });
  qs('#th-ai-prompt-edit')?.addEventListener('click', openPromptSettings);
  // 4b 第4项：增量模式开关 + 清除记录
  qs('#th-ai-incr')?.addEventListener('change', e => {
    setIncrEnabled(!!(e.target as HTMLInputElement).checked);
    toastr?.info?.((e.target as HTMLInputElement).checked ? '增量模式已开启' : '增量模式已关闭');
  });
  qs('#th-ai-incr-clear')?.addEventListener('click', () => {
    clearIncrMap(); toastr?.success?.('已清除增量记录（下次将全量发送）');
  });
  // 反馈1：搜索框 — 跨所有书过滤条目/世界书名，命中自动展开高亮（防抖 + IME 中文输入保护）。
  // _imeComposing：中文拼音组合期间（compositionstart~end）不触发搜索，避免「didian→失焦」。
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  const searchInput = qs<HTMLInputElement>('#th-ai-search');
  searchInput?.addEventListener('compositionstart', () => { _imeComposing = true; });
  searchInput?.addEventListener('compositionend', (e) => {
    _imeComposing = false;
    const q = (e.target as HTMLInputElement).value;
    ST.searchQ = q;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { void onSearch(q); }, 220);
  });
  searchInput?.addEventListener('input', (e) => {
    const q = (e.target as HTMLInputElement).value;
    ST.searchQ = q;
    if (_imeComposing) return; // 组合中（拼音未上屏）不重渲染，保住焦点
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { void onSearch(q); }, 280);
  });

  // 初始设置下拉选中
  const sel = qs<HTMLSelectElement>('#th-ai-prompt');
  if (sel && ST.promptId) sel.value = ST.promptId;

  bindBodyEvents();

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
  // Step7 E：存为方案 / 载入方案
  qs('#th-ai-plan-save')?.addEventListener('click', onSavePlan);
  qs('#th-ai-plan-load')?.addEventListener('click', openLoadPlanModal);
}

// Step7 E：把当前任务池存为方案（弹输入名 modal）
function onSavePlan(): void {
  const tasks = getTasks();
  if (!tasks.length) { toastr?.warning?.('任务池为空，无法存为方案'); return; }
  const html = `<div style="padding:16px;display:flex;flex-direction:column;gap:12px">
    <div style="font-size:13px;color:var(--tx2)">为当前 ${tasks.length} 个任务的方案取个名字（同名覆盖）：</div>
    <input id="th-ai-plan-name" class="th-edit-input" placeholder="如：核心地点+主线事件" style="width:100%">
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="th-btn" id="th-ai-plan-save-cancel">取消</button>
      <button class="th-btn th-btn-primary" id="th-ai-plan-save-go">保存</button>
    </div>
  </div>`;
  openModal2('存为提取方案', html);
  qs('#th-ai-plan-save-cancel')?.addEventListener('click', closeModal2);
  qs('#th-ai-plan-save-go')?.addEventListener('click', () => {
    const name = (qs<HTMLInputElement>('#th-ai-plan-name')?.value || '').trim();
    if (!name) { toastr?.warning?.('请填方案名'); return; }
    const planTasks = getTasks().map(({ taskId, ...rest }) => { void taskId; return rest; });
    savePlan(name, planTasks);
    toastr?.success?.(`已存为方案「${name}」`);
    closeModal2();
  });
}

// Step7 E：载入方案 modal（列出已存方案，载入=清空当前池+填入）
function openLoadPlanModal(): void {
  const plans = getPlans();
  const rows = plans.length ? plans.map(p => `<div class="th-ai-plan-row" style="display:flex;gap:8px;align-items:center;padding:8px 10px;background:var(--bg3);border-radius:8px">
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;font-size:13px">${esc(p.name)}</div>
      <div style="font-size:11px;color:var(--tx3)">${p.tasks.length} 个任务</div>
    </div>
    <button class="th-btn th-btn-mini th-btn-primary" data-plan-load="${escAttr(p.id)}">载入</button>
    <button class="th-btn th-btn-mini" data-plan-del="${escAttr(p.id)}">删</button>
  </div>`).join('') : '<div style="padding:14px;color:var(--tx3);font-size:13px;text-align:center">暂无已存方案</div>';
  const html = `<div class="th-ai-plans" style="padding:14px;display:flex;flex-direction:column;gap:8px;max-height:70vh">
    <div style="font-size:13px;color:var(--tx2);line-height:1.6">载入方案会<b>清空当前任务池</b>并填入方案任务。</div>
    <div style="display:flex;flex-direction:column;gap:6px;overflow:auto;padding-right:4px">${rows}</div>
    <div style="display:flex;justify-content:flex-end"><button class="th-btn" id="th-ai-plan-load-close">关闭</button></div>
  </div>`;
  openModal2('载入提取方案', html);
  qs('#th-ai-plan-load-close')?.addEventListener('click', closeModal2);
  qs('.th-ai-plans')?.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const loadBtn = t.closest('[data-plan-load]') as HTMLElement | null;
    const delBtn = t.closest('[data-plan-del]') as HTMLElement | null;
    if (loadBtn) {
      const id = loadBtn.getAttribute('data-plan-load')!;
      const plan = getPlans().find(p => p.id === id);
      if (!plan) return;
      clearTasks();
      for (const t2 of plan.tasks) addTask(t2);
      toastr?.success?.(`已载入方案「${plan.name}」（${plan.tasks.length} 个任务）`);
      closeModal2();
      rerenderTaskpool();
    } else if (delBtn) {
      const id = delBtn.getAttribute('data-plan-del')!;
      deletePlan(id);
      toastr?.success?.('已删除方案');
      openLoadPlanModal();
    }
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

async function enterBook(bookName: string): Promise<void> {
  const b = ST.books.find(x => x.name === bookName);
  if (b && !b.loaded) await loadBook(b);
  ST.drillBook = bookName;
  rerenderBody();
}

function toggleBookAll(bookName: string, selectAll: boolean): void {
  const b = ST.books.find(x => x.name === bookName);
  if (!b || !b.entries) return;
  for (const e of b.entries) {
    const key = `${bookName}::${e.name}`;
    if (selectAll) ST.selectedEntries.add(key); else ST.selectedEntries.delete(key);
  }
  rerenderBody();
  refreshAddBtn();
}

// Step7 H 悬浮预览：在条目行旁显示该条目 content 全文（自绘浮层，挂 iframe body）
let _previewEl: HTMLElement | null = null;
function showEntryPreview(anchor: HTMLElement, key: string): void {
  const [book, entryName] = key.split('::');
  const b = ST.books.find(x => x.name === book);
  const e = b?.entries?.find(x => x.name === entryName);
  const content = (e?.content || '').trim();
  if (!content) return;
  hideEntryPreview();
  const el = __doc.createElement('div');
  el.className = 'th-ai-entry-preview';
  el.textContent = content.slice(0, 1200) + (content.length > 1200 ? '\n…（已截断）' : '');
  __doc.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  // 优先放右侧，空间不足放左侧
  const w = 320;
  let left = r.right + 8;
  if (left + w > (__doc.documentElement.clientWidth || 9999)) left = Math.max(8, r.left - w - 8);
  el.style.left = `${left}px`;
  el.style.top = `${Math.max(8, r.top)}px`;
  el.style.maxWidth = `${w}px`;
  _previewEl = el;
}
function hideEntryPreview(): void {
  if (_previewEl) { try { _previewEl.remove(); } catch (e) { void e; } _previewEl = null; }
}

// 共享：异步加载某本世界书条目到 ST.books（带 content 缓存，供搜索匹配 + 悬浮预览复用）。
async function loadBook(b: WbBookInfo): Promise<void> {
  if (b.loaded) return;
  try {
    const entries = await safeGetWorldbook(b.name);
    b.entries = entries.map(e => ({ name: e.name, enabled: !!e.enabled, contentLen: (e.content || '').length, content: e.content || '' }));
  } catch (err) {
    console.warn('[ai-summarize] 读取世界书失败', b.name, err);
    b.entries = [];
  }
  b.loaded = true;
}

// 反馈1+批次6：搜索。
//  - 书列表视图：跨所有书匹配，命中的书（书名命中 或 含命中条目）才显示（searchBooks）。
//  - 条目视图：renderBookEntries 内按 searchQ 过滤本书条目即可，无需重算。
async function onSearch(q: string): Promise<void> {
  const query = q.trim().toLowerCase();
  ST.searchHits = new Set();
  ST.searchBooks = new Set();
  if (!query) { rerenderBody(); return; }
  // 条目视图：只过滤本书条目（renderBookEntries 已处理），直接重渲染列表区
  if (ST.drillBook != null) { rerenderBody(); return; }
  // 书列表视图：需加载各书条目以判断命中
  for (const b of ST.books) {
    await loadBook(b);
    const bookNameHit = b.name.toLowerCase().includes(query);
    let anyEntryHit = false;
    for (const e of (b.entries || [])) {
      if (bookNameHit || e.name.toLowerCase().includes(query)) {
        ST.searchHits.add(`${b.name}::${e.name}`);
        anyEntryHit = true;
      }
    }
    if (bookNameHit || anyEntryHit) ST.searchBooks.add(b.name);
  }
  rerenderBody();
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
  rerenderBody();
  rerenderTaskpool();
  refreshAddBtn();
  toastr?.success?.(`已加入 ${added} 个任务到任务池`);
}

function rerenderSelector(): void {
  const slot = qs('.th-ai-sel');
  if (slot) { slot.outerHTML = renderSelector(); bindPanelEvents(); }
}
// 反馈1：只重渲染列表区（.th-ai-body），不触碰搜索输入框 → 焦点/中文输入不被打断。
// 仅在「书列表/条目列表内容变化」时调用（搜索过滤、进入/返回、勾选刷新）。
function rerenderBody(): void {
  const body = qs('.th-ai-body');
  if (!body) { rerenderSelector(); return; }
  body.innerHTML = ST.drillBook != null ? renderEntriesView() : renderBooksView();
  bindBodyEvents();
}
// 列表区事件（进入/返回/全选反选/勾选/悬浮预览）——与搜索输入框解耦，可单独重绑。
function bindBodyEvents(): void {
  qs('#th-ai-back')?.addEventListener('click', () => { ST.drillBook = null; rerenderBody(); });
  qs('.th-ai-books')?.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const enter = t.closest('[data-act="enter"]') as HTMLElement | null;
    if (enter) { await enterBook(enter.closest('.th-ai-book')!.getAttribute('data-book')!); return; }
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
  // Step7 H 悬浮预览：hover 条目行显示 content 全文（自绘浮层，data 委托）
  qs('.th-ai-books')?.addEventListener('mouseover', (e) => {
    const label = (e.target as HTMLElement).closest('[data-entry-key]') as HTMLElement | null;
    if (!label) return;
    const key = label.getAttribute('data-entry-key') || '';
    showEntryPreview(label, key);
  });
  qs('.th-ai-books')?.addEventListener('mouseout', (e) => {
    const label = (e.target as HTMLElement).closest('[data-entry-key]') as HTMLElement | null;
    if (label) hideEntryPreview();
  });
}
function rerenderTaskpool(): void {
  const slot = qs('.th-ai-pool');
  if (slot) { slot.outerHTML = renderTaskpool(); bindPanelEvents(); }
}

// ==================== 提示词管理（§E.4 #20）===================
// 批次5 Step4：旧内联 openPromptManager/openPromptEditor 已由 modules/prompt-settings.ts 的
// openPromptSettings 取代（统一编辑内置 override + 自定义 + 占位符帮助 + registry 接口）。

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

// 批次5 Step5 · 变量扩展：跨窗口取一个全局函数（window 优先 → getRoot 兜底）
function getFn(name: string): any {
  try {
    const w = window as any;
    if (typeof w[name] === 'function') return w[name];
    const p = getRoot();
    if (p && typeof p[name] === 'function') return p[name];
  } catch (e) { void e; }
  return null;
}

// {{角色名}}：酒馆当前角色名（getCharData('current').name）
function getCurrentCharName(): string {
  try {
    const fn = getFn('getCharData');
    const d = fn ? fn('current') : null;
    const name = d && (d.name || d.data?.name);
    if (name) return String(name);
  } catch (e) { void e; }
  return '';
}

// {{最近剧情}}：最近 N 条聊天消息摘要（getChatMessages，按楼层范围）
function getRecentChatSummary(n = 5): string {
  try {
    const fn = getFn('getChatMessages');
    const lastIdFn = getFn('getLastMessageId');
    if (!fn) return '';
    const last = typeof lastIdFn === 'function' ? Number(lastIdFn()) : -1;
    const range = (last >= 0) ? `${Math.max(0, last - n + 1)}-${last}` : -1;
    const msgs = fn(range) as Array<{ name?: string; role?: string; message?: string }>;
    if (!Array.isArray(msgs) || !msgs.length) return '';
    return msgs.map(m => {
      const who = m.name || m.role || '?';
      const text = (m.message || '').replace(/\s+/g, ' ').trim();
      return text ? `${who}：${text.slice(0, 200)}` : '';
    }).filter(Boolean).join('\n');
  } catch (e) { void e; }
  return '';
}

// 一个桶 = 同 kind 的若干任务，合并为一次 generate 请求（§E.5.2）
type Bucket = { kind: AiSummaryPromptKind; tasks: AiTask[] };
// 桶发送结果
type BucketResult = {
  kind: AiSummaryPromptKind;
  ok: boolean;
  error?: string;
  items: NormalizedItem[];          // 归一化后的卡片
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
  // 批次5 Step5：变量扩展 {{当前卡片名列表}} {{角色名}} {{最近剧情}}（懒求值，模板用到才取）
  let tmpl = prompt.template
    .replace(/\{\{条目原文\}\}/g, '见上方各 task_id 块')
    .replace(/\{\{自定义指令\}\}/g, bucket.tasks.some(t => t.customInstruction) ? '各任务附加指令见上方块。' : '');
  if (tmpl.includes('{{当前卡片名列表}}')) {
    const names = Object.keys(getManagedItems(bucket.kind as ManagedKind));
    tmpl = tmpl.replace(/\{\{当前卡片名列表\}\}/g, names.length ? names.join('、') : '（本类别暂无卡片）');
  }
  if (tmpl.includes('{{角色名}}')) {
    tmpl = tmpl.replace(/\{\{角色名\}\}/g, getCurrentCharName() || '（未知角色）');
  }
  if (tmpl.includes('{{最近剧情}}')) {
    const recent = getRecentChatSummary(5);
    tmpl = tmpl.replace(/\{\{最近剧情\}\}/g, recent || '（无最近聊天记录）');
  }
  // 批次6：提取约束（UI 旋钮）渲染成约束文本追加。0/留空不限制。
  const c = prompt.constraints;
  if (c) {
    const lines: string[] = [];
    // 批次8 反馈9：desc 字数支持下限~上限区间
    const lo = c.descMinChars && c.descMinChars > 0 ? c.descMinChars : 0;
    const hi = c.descMaxChars && c.descMaxChars > 0 ? c.descMaxChars : 0;
    if (lo && hi) lines.push(`每项 desc/简介控制在 ${lo}~${hi} 字之间`);
    else if (hi) lines.push(`每项 desc/简介控制在 ${hi} 字以内`);
    else if (lo) lines.push(`每项 desc/简介不少于 ${lo} 字`);
    if (c.maxItems && c.maxItems > 0) lines.push(`单个任务最多提取 ${c.maxItems} 个条目（按重要性取前 ${c.maxItems} 个）`);
    if (lines.length) tmpl += `\n\n【提取约束】${lines.map(l => '- ' + l).join('\n')}`;
  }
  return `${tmpl}\n\n${blocks.join('\n\n')}`;
}

// dry-run 预览 modal（优化建议3：发送前展示桶数/token/预设，确认再发）
async function dryRunPreview(buckets: Bucket[], contents: Map<string, string>): Promise<boolean> {
  const cfg = resolveGenerateApiConfig();
  // 4b 第2项：逐桶预估 token。批次8 反馈8 修复：原代码 estimateTokens(String(chars)) 把"字符总数"
  // 当字符串估算（2万字 → "20000"→长度5→3 tok），完全错误。改为按真实拼装文本（system 人格+系统+风格
  // 与 user_input = buildBucketInput）估算，与实际发送口径一致。
  const systemText = getActivePersonaText() + AI_SUMMARY_SYSTEM_PROMPT + getAiStyleSuffix();
  const bucketTok: number[] = [];
  for (const b of buckets) {
    const prompt = promptById(b.tasks[0].promptId);
    const userText = prompt ? buildBucketInput(b, contents, prompt) : '';
    bucketTok.push(estimateTokens(systemText + userText));
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

// 反馈6b：发送前预览 —— 展示最终拼装给 AI 的完整文本（人格 + 系统提示词 + 风格后缀 = system；
// buildBucketInput = user_input）。按任务池分桶逐桶预览；任务池为空时提示。
async function openSendPreview(): Promise<void> {
  const tasks = getTasks();
  if (!tasks.length) { toastr?.warning?.('任务池为空，先从左侧加入条目'); return; }
  toastr?.info?.('正在读取条目原文以拼装预览…');
  const contents = await loadTaskContents(tasks);
  const buckets = bucketTasks(tasks);
  const systemText = getActivePersonaText() + AI_SUMMARY_SYSTEM_PROMPT + getAiStyleSuffix();
  const sysTok = estimateTokens(systemText);
  const blocks = buckets.map((b, i) => {
    const prompt = promptById(b.tasks[0].promptId);
    const userText = buildBucketInput(b, contents, prompt!);
    const tok = estimateTokens(systemText + userText);
    return `<div style="display:flex;flex-direction:column;gap:4px">
      <div style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:var(--bg3);border-radius:8px;font-size:12px">
        <i class="${MANAGED_CFG[b.kind as ManagedKind].icon}" style="color:var(--pink)"></i>
        <span style="flex:1;font-weight:600">桶 ${i + 1}：${esc(prompt?.label || b.kind)}（${b.tasks.length} 个任务）</span>
        <span style="font-size:11px;color:var(--tx3)">≈${tok} tok</span>
      </div>
      <div style="font-size:11px;color:var(--tx3);margin-top:2px">【system：人格 + 系统提示词 + 风格后缀】</div>
      <pre class="th-ai-raw" style="white-space:pre-wrap;word-break:break-word;font-family:monospace;font-size:11px;background:var(--bg2);border-radius:8px;padding:8px 10px;max-height:180px;overflow:auto;margin:0">${esc(systemText)}</pre>
      <div style="font-size:11px;color:var(--tx3);margin-top:2px">【user_input：提示词模板 + 约束 + 各 task 条目原文】</div>
      <pre class="th-ai-raw" style="white-space:pre-wrap;word-break:break-word;font-family:monospace;font-size:11px;background:var(--bg2);border-radius:8px;padding:8px 10px;max-height:220px;overflow:auto;margin:0">${esc(userText)}</pre>
    </div>`;
  }).join('');
  const persona = getActivePersonaText().trim();
  const html = `<div class="th-ai-sendpv" style="padding:14px;display:flex;flex-direction:column;gap:10px;height:min(620px,80vh)">
    <div style="font-size:13px;color:var(--tx2);line-height:1.6">这是最终拼装给 AI 的完整文本（${buckets.length} 桶，串行发送）。系统提示词 ≈${sysTok} tok，每桶独立计入。${persona ? '已启用头部人格。' : '未启用头部人格。'}</div>
    <div style="flex:1;overflow:auto;display:flex;flex-direction:column;gap:12px;padding-right:4px">${blocks}</div>
    <div style="display:flex;justify-content:flex-end"><button class="th-btn" id="th-ai-sendpv-close">关闭</button></div>
  </div>`;
  openModal2('发送前预览（最终拼装文本）', html, { replace: true });
  qs('#th-ai-sendpv-close')?.addEventListener('click', () => { closeModal2(); });
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
  if (!raws.length) { closeAllModal2(); renderPanel(); return; }
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
  </div>`, { replace: true });
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
  openModal2('AI 输出预览', html, { replace: true });
  qs('#th-ai-pv-copy')?.addEventListener('click', () => { copyText(allText); toastr?.success?.('已复制全部输出'); });
  qs('#th-ai-pv-back')?.addEventListener('click', () => { closeAllModal2(); renderPanel(); });
  qs('#th-ai-pv-retry')?.addEventListener('click', async () => {
    const again = await runSendLoop(buckets, contents);
    if (again.length) showOutputPreview(buckets, again, contents); else { closeAllModal2(); renderPanel(); }
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
        { role: 'system', content: getActivePersonaText() + AI_SUMMARY_SYSTEM_PROMPT + getAiStyleSuffix() },
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
    return { kind: b.kind, ok: true, items: norm.items, taskIds: b.tasks.map(t => t.taskId) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: b.kind, ok: false, error: msg, items: [], taskIds: b.tasks.map(t => t.taskId) };
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
  exists: boolean;       // 本地是否已有同名卡片（冲突）
  locked: boolean;       // Step6 C：本地同名卡片是否被锁定（锁定则注入强制跳过）
};

function collectInjectables(results: BucketResult[]): Injectable[] {
  const out: Injectable[] = [];
  for (const r of results) {
    if (!r.ok) continue;
    const localItems = getManagedItems(r.kind as ManagedKind);
    const existing = new Set(Object.keys(localItems));
    for (const it of r.items) {
      const isStash = r.kind.startsWith('stash-');
      const desc = isStash ? JSON.stringify(it.fields || {}) : (it.desc || '');
      out.push({
        kind: r.kind, name: it.name, desc, tags: [],
        exists: existing.has(it.name),
        locked: !!localItems[it.name]?.locked,
      });
    }
  }
  return out;
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
    const conflict = it.locked
      ? `<span style="font-size:11px;color:var(--gold)" title="该卡片已锁定，注入将强制跳过"><i class="fa-solid fa-lock"></i> 已锁定·跳过</span>`
      : it.exists
        ? `<select class="th-edit-select th-ai-conflict" data-idx="${i}" style="font-size:11px">
            <option value="skip" selected>跳过</option>
            <option value="overwrite">覆盖</option>
            <option value="merge">合并</option>
            <option value="copy">建副本</option>
          </select>`
        : `<span style="font-size:11px;color:var(--mint)">新建</span>`;
    const descPrev = it.kind.startsWith('stash-')
      ? '<span style="color:var(--tx3)">（结构化字段）</span>'
      : esc(it.desc.slice(0, 40)) + (it.desc.length > 40 ? '…' : '');
    return `<label class="th-ai-inj-row" data-idx="${i}" style="display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;padding:7px 10px;background:var(--bg3);border-radius:8px">
      <input type="checkbox" class="th-ai-inj-ck" data-idx="${i}" ${it.locked ? 'disabled' : (it.exists ? '' : 'checked')}>
      <div style="min-width:0">
        <div style="display:flex;gap:6px;align-items:center">
          <i class="${cfg.icon}" style="color:var(--pink)"></i>
          <span style="font-weight:600">${esc(it.name)}</span>${it.locked ? ' <i class="fa-solid fa-lock" style="color:var(--gold);font-size:10px"></i>' : ''}
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
    <div style="font-size:13px;color:var(--tx2);line-height:1.6">AI 返回 ${injectables.length} 项，逐条勾选后注入为本地卡片。同名冲突可选「跳过/覆盖/合并/建副本」；已锁定卡片强制跳过。</div>
    <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:13px">
      <label><input type="checkbox" id="th-ai-writeback"> 同时回写初始数据（[初始·xxx] 条目）</label>
      <label>模式：
        <select id="th-ai-wb-mode" class="th-edit-select" style="font-size:12px">
          <option value="dedupe" selected>检测重名</option>
          <option value="append">增量</option>
        </select>
      </label>
      <button class="th-btn th-btn-mini" id="th-ai-snapshots" title="查看注入快照，可回滚被覆盖的卡片" style="margin-left:auto"><i class="fa-solid fa-clock-rotate-left"></i> 快照/回滚</button>
    </div>
    <div class="th-ai-inj-list" style="display:grid;gap:6px;max-height:300px;overflow:auto;padding-right:4px">${listHtml}</div>
    <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap">
      <button class="th-btn" id="th-ai-inj-cancel">取消</button>
      <button class="th-btn" id="th-ai-inj-ctx" title="把选中项作为提示词临时注入下次 AI 请求（不建卡，仅本次有效）"><i class="fa-solid fa-comment-dots"></i> 注入到AI上下文(临时)</button>
      <button class="th-btn th-btn-primary" id="th-ai-inj-go"><i class="fa-solid fa-circle-down"></i> 注入选中项(建卡)</button>
    </div>
  </div>`;
  openModal2('注入确认', html, { replace: true });

  qs('#th-ai-inj-cancel')?.addEventListener('click', () => { closeModal2(); renderPanel(); });
  qs('#th-ai-snapshots')?.addEventListener('click', openSnapshotsModal);
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

// 收集注入确认面板的勾选项（复用：建卡注入 与 4c 注入上下文 共用）。locked 项已 disabled 复选框，不会进 picks。
function collectPicks(injectables: Injectable[]): { idx: number; conflict: 'skip' | 'overwrite' | 'merge' | 'copy' }[] {
  const picks: { idx: number; conflict: 'skip' | 'overwrite' | 'merge' | 'copy' }[] = [];
  qsa<HTMLInputElement>('.th-ai-inj-ck').forEach(ck => {
    if (ck.checked) {
      const idx = Number(ck.dataset.idx);
      if (injectables[idx]?.locked) return; // C 锁定：强制跳过
      const exists = injectables[idx].exists;
      const conflictSel = qs<HTMLSelectElement>(`.th-ai-conflict[data-idx="${idx}"]`);
      const conflict = exists && conflictSel ? (conflictSel.value as 'skip' | 'overwrite' | 'merge' | 'copy') : 'overwrite';
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
    return `${it.name}：${it.desc || '(无简介)'}`;
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
    : { kind, ok: false, error: raw.error, items: [], taskIds: bucket.tasks.map(t => t.taskId) };
  LAST_SEND.results[ri] = newRes;
  if (newRes.ok) toastr?.success?.(`已重新生成「${prompt?.label || kind}」：${newRes.items.length} 项`);
  else toastr?.error?.(`重生失败：${newRes.error}`);
  // 用最新结果重渲染（勾选状态会重置为默认，符合「换了一批结果」的预期）
  openInjectConfirm(LAST_SEND.results);
}

async function doInject(
  injectables: Injectable[],
  picks: { idx: number; conflict: 'skip' | 'overwrite' | 'merge' | 'copy' }[],
  writeback: boolean,
  wbMode: InitialWriteMode,
): Promise<void> {
  let injected = 0, skipped = 0, copied = 0, merged = 0;
  // 按 kind 攒回写初始的 items
  const wbByKind = new Map<ManagedKind, InitialWriteItem[]>();
  const addWb = (kind: ManagedKind, item: InitialWriteItem) => {
    if (!wbByKind.has(kind)) wbByKind.set(kind, []);
    wbByKind.get(kind)!.push(item);
  };

  // Step6 A 快照：注入前，按 kind 收集「将被覆盖/合并的同名卡片名」，存快照供回滚。
  const willOverwriteByKind = new Map<ManagedKind, string[]>();
  for (const p of picks) {
    const it = injectables[p.idx];
    if (it.exists && (p.conflict === 'overwrite' || p.conflict === 'merge')) {
      const k = it.kind as ManagedKind;
      if (!willOverwriteByKind.has(k)) willOverwriteByKind.set(k, []);
      willOverwriteByKind.get(k)!.push(it.name);
    }
  }
  for (const [k, names] of willOverwriteByKind) {
    pushSnapshot(k, names, `AI注入覆盖/合并 · ${MANAGED_CFG[k].label} · ${names.length}项`);
  }

  for (const p of picks) {
    const it = injectables[p.idx];
    if (it.exists && p.conflict === 'skip') { skipped++; continue; }
    // 决定写入名（建副本时换名）
    let name = it.name;
    if (it.exists && p.conflict === 'copy') {
      let i = 1; name = `${it.name} (副本)`;
      while (getManagedItems(it.kind as ManagedKind)[name]) name = `${it.name} (副本${++i})`;
      copied++;
    } else if (it.exists && p.conflict === 'merge') {
      merged++;
    } else {
      injected++;
    }
    const kindKey = it.kind as ManagedKind;
    // 合并：以旧卡片为基底，新值覆盖非空字段（保留旧 tags/links/inject 等）
    const desc = (it.exists && p.conflict === 'merge')
      ? mergeDesc(kindKey, it.name, it.desc)
      : it.desc;
    const existingItem = getManagedItems(kindKey)[name];
    const mergedTags = (it.exists && p.conflict === 'merge' && existingItem) ? existingItem.tags : it.tags;
    const keepLinks = (it.exists && p.conflict === 'merge' && existingItem) ? existingItem.links : undefined;
    const keepInject = (it.exists && p.conflict === 'merge' && existingItem) ? existingItem.inject : undefined;
    addManagedItem(kindKey, name, { desc, tags: mergedTags, links: keepLinks, inject: keepInject });
    if (writeback) addWb(kindKey, { name, desc, tags: mergedTags });
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
  toastr?.success?.(`已注入 ${injected} 项${merged ? `、合并 ${merged} 项` : ''}${copied ? `、建副本 ${copied} 项` : ''}${skipped ? `、跳过 ${skipped} 项` : ''}${wbSummary}`);
  // 清空已发送的任务池
  clearTasks();
  renderPanel();
}

// Step6 A 快照列表 + 回滚（二次确认）。从注入确认面板进入，返回时重建注入确认。
function openSnapshotsModal(): void {
  const snaps = getSnapshots();
  const rows = snaps.length ? snaps.map(s => {
    const time = new Date(s.ts).toLocaleString();
    const names = s.snapshots.map(x => x.name).join('、');
    return `<div class="th-ai-snap-row" style="display:flex;gap:8px;align-items:center;padding:8px 10px;background:var(--bg3);border-radius:8px">
      <div style="min-width:0;flex:1">
        <div style="font-weight:600;font-size:13px">${esc(s.label)}</div>
        <div style="font-size:11px;color:var(--tx3)">${esc(time)} · ${s.snapshots.length} 项：${esc(names.slice(0, 60))}${names.length > 60 ? '…' : ''}</div>
      </div>
      <button class="th-btn th-btn-mini th-btn-primary" data-snap-roll="${s.ts}"><i class="fa-solid fa-rotate-left"></i> 回滚</button>
      <button class="th-btn th-btn-mini" data-snap-del="${s.ts}">删</button>
    </div>`;
  }).join('') : '<div style="padding:14px;color:var(--tx3);font-size:13px;text-align:center">暂无快照（AI 注入覆盖/合并卡片时自动记录）</div>';
  const html = `<div class="th-ai-snaps" style="padding:14px;display:flex;flex-direction:column;gap:10px;max-height:74vh">
    <div style="font-size:13px;color:var(--tx2);line-height:1.6">注入快照（最近 20 次覆盖/合并前的旧卡片值），可回滚恢复。</div>
    <div style="display:flex;flex-direction:column;gap:6px;overflow:auto;padding-right:4px">${rows}</div>
    <div style="display:flex;justify-content:flex-end"><button class="th-btn" id="th-ai-snap-back">返回</button></div>
  </div>`;
  openModal2('注入快照 / 回滚', html, { replace: true });
  qs('#th-ai-snap-back')?.addEventListener('click', () => {
    if (LAST_SEND) openInjectConfirm(LAST_SEND.results); else { closeAllModal2(); renderPanel(); }
  });
  qs('.th-ai-snaps')?.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const rollBtn = t.closest('[data-snap-roll]') as HTMLElement | null;
    const delBtn = t.closest('[data-snap-del]') as HTMLElement | null;
    if (rollBtn) {
      const ts = Number(rollBtn.getAttribute('data-snap-roll'));
      confirmRollback(ts);
    } else if (delBtn) {
      const ts = Number(delBtn.getAttribute('data-snap-del'));
      deleteSnapshot(ts);
      toastr?.success?.('已删除快照');
      openSnapshotsModal();
    }
  });
}

// 回滚二次确认（破坏性，§J.3）
function confirmRollback(ts: number): void {
  const html = `<div style="padding:16px;display:flex;flex-direction:column;gap:14px">
    <div style="font-size:13px;color:var(--tx2);line-height:1.7">确认回滚？将把该快照记录的卡片恢复为注入前的旧值（注入前不存在的卡片会被删除）。此操作会覆盖当前这些卡片的内容。</div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="th-btn" id="th-ai-roll-cancel">取消</button>
      <button class="th-btn th-btn-primary" id="th-ai-roll-go"><i class="fa-solid fa-rotate-left"></i> 确认回滚</button>
    </div>
  </div>`;
  openModal2('确认回滚', html);
  qs('#th-ai-roll-cancel')?.addEventListener('click', closeModal2);
  qs('#th-ai-roll-go')?.addEventListener('click', () => {
    const r = rollbackSnapshot(ts);
    toastr?.success?.(`已回滚：恢复 ${r.restored} 项${r.deleted ? `、删除 ${r.deleted} 项` : ''}`);
    closeModal2();      // 关确认，弹回快照列表
    openSnapshotsModal(); // 刷新快照列表
  });
}
//  - location/event：纯文本——新 desc 非空则用新，否则保留旧。
//  - stash-*：结构化 JSON——逐字段合并（新值非空覆盖，旧值保留其余）。
function mergeDesc(kind: ManagedKind, name: string, newDesc: string): string {
  const old = getManagedItems(kind)[name];
  if (!old) return newDesc;
  if (kind === 'location' || kind === 'event') {
    return (newDesc && newDesc.trim()) ? newDesc : old.desc;
  }
  // stash-*：合并 JSON 字段
  let oldObj: Record<string, any> = {};
  let newObj: Record<string, any> = {};
  try { oldObj = old.desc ? JSON.parse(old.desc) : {}; } catch (e) { void e; }
  try { newObj = newDesc ? JSON.parse(newDesc) : {}; } catch (e) { void e; }
  const out: Record<string, any> = { ...oldObj };
  for (const [k, v] of Object.entries(newObj)) {
    if (v != null && v !== '' && !(typeof v === 'number' && v === 0 && oldObj[k])) out[k] = v;
  }
  return JSON.stringify(out);
}
