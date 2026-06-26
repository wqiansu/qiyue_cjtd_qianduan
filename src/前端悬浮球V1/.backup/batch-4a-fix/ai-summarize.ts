// 批次4a · AI 总结与注入 主面板（§E）
// 选世界书条目 → 选提示词 → 加入任务池 → 同 kind 分桶统一发送 → AI 返回 JSON → 归一化 → 注入确认 → 注入为 managed 卡片 + 建关联。
// 命令式 innerHTML + openModal2，不引 Vue。跨窗口走 safeGetWorldbook/getRoot 兜底。
// 依赖：resolveGenerateApiConfig（preset-env）、syncBidirLink（managed-modal）、addManagedItem（managed-store）、
//   writeInitialItemsForKind（stash-io，回写初始）、openRuntimeImportModal（stash-io，注入确认复用 UI 范式）。
import { esc, escAttr, qs, qsa, __doc } from '../lib/dom-utils';
import { openModal2, closeModal2 } from '../status-bar-init';
import { safeGetWorldbook } from '../lib/tavern-api';
import { getCharWorldbookList, syncBidirLink } from './managed-modal';
import { AI_SUMMARY_PROMPTS, type AiSummaryPrompt, type AiSummaryPromptKind } from '../lib/config';
import {
  getTasks, addTask, removeTask, moveTask, updateTask, clearTasks,
  getCustomPrompts, saveCustomPrompt, deleteCustomPrompt,
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
  <div class="th-ai-sum" style="padding:14px;display:grid;gap:14px">
    ${renderSelector()}
    ${renderTaskpool()}
    <div class="th-ai-actions" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
      <button class="th-btn" id="th-ai-close">关闭</button>
      <button class="th-btn th-btn-primary" id="th-ai-send"><i class="fa-solid fa-paper-plane"></i> 发送并注入</button>
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
  return `<div class="th-ai-sel" style="display:grid;gap:10px">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span style="color:var(--tx2);font-size:13px">提示词：</span>
      <select id="th-ai-prompt" class="th-edit-select" style="flex:1;min-width:160px">${promptOpts}</select>
      <button class="th-btn th-btn-mini" id="th-ai-prompt-edit" title="管理提示词"><i class="fa-solid fa-pen"></i></button>
    </div>
    <div style="color:var(--tx2);font-size:12px;line-height:1.6">勾选世界书条目 → 选提示词 → 点「加入任务池」。不同类别会自动分桶合并发送。</div>
    <div class="th-ai-books" style="display:grid;gap:6px;max-height:280px;overflow:auto;padding-right:4px">${bookRows}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="th-btn th-btn-mini" id="th-ai-add" disabled><i class="fa-solid fa-plus"></i> 加入任务池</button>
    </div>
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
  return `<div class="th-ai-pool" style="display:grid;gap:8px">
    <div style="display:flex;align-items:center;gap:10px">
      <span style="font-weight:600">任务池</span>
      <span style="font-size:12px;color:var(--tx3)">${cnt} 个任务 · 分桶：${bucketStr}</span>
      ${cnt ? `<button class="th-btn th-btn-mini" id="th-ai-pool-clear" style="margin-left:auto">清空</button>` : ''}
    </div>
    <div class="th-ai-tasks" style="display:grid;gap:6px;max-height:260px;overflow:auto;padding-right:4px">
      ${rows || `<div style="padding:14px;color:var(--tx3);font-size:13px;text-align:center">任务池为空，从上方选择世界书条目加入</div>`}
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

// 跨窗口取 generate（iframe→parent 兜底，同 preset-env 范式）
function getGenerate(): ((cfg: any) => Promise<unknown>) | null {
  try {
    const w = window as any;
    if (typeof w.generate === 'function') return w.generate;
    const p = getRoot();
    if (p && typeof p.generate === 'function') return p.generate;
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
  let totalChars = 0;
  for (const b of buckets) for (const t of b.tasks) totalChars += (contents.get(t.taskId) || '').length;
  const approxTokens = estimateTokens(String(totalChars));
  const bucketLines = buckets.map(b => {
    const prompt = promptById(b.tasks[0].promptId);
    return `<div style="padding:5px 10px;background:var(--bg3);border-radius:8px;font-size:13px">
      <i class="${MANAGED_CFG[b.kind as ManagedKind].icon}" style="color:var(--pink)"></i>
      ${esc(prompt?.label || b.kind)} · ${b.tasks.length} 个任务 → 1 次请求
    </div>`;
  }).join('');
  const apiName = cfg.usedApiPresetName || '(活动预设)';
  const presetName = cfg.preset_name || '(内置提示词)';
  const hasApi = !!cfg.custom_api;
  const html = `<div class="th-ai-dry" style="padding:14px;display:grid;gap:12px">
    <div style="font-size:13px;line-height:1.7;color:var(--tx2)">
      将发送 <b>${buckets.length}</b> 桶（串行），预估输入约 <b>${approxTokens}</b> token。<br>
      API 预设：<b>${esc(apiName)}</b>${hasApi ? '' : ' <span style="color:var(--gold)">（未配置 custom_api，将走酒馆当前源）</span>'} · 提示词预设：<b>${esc(presetName)}</b>
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
  const generate = getGenerate();
  if (!generate) { toastr?.error?.('当前环境无 generate 接口'); return; }

  // 1. 读取所有任务条目原文
  toastr?.info?.('正在读取世界书条目…');
  const contents = await loadTaskContents(tasks);

  // 2. 分桶 + dry-run 预览
  const buckets = bucketTasks(tasks);
  const ok = await dryRunPreview(buckets, contents);
  if (!ok) return;

  // 3. 串行发桶（错误隔离：某桶失败不中断整批，§优化建议6）
  const cfg = resolveGenerateApiConfig();
  const results: BucketResult[] = [];
  openModal2('AI 总结中', `<div class="th-ai-progress" style="padding:18px;display:grid;gap:10px">
    <div id="th-ai-prog-text" style="font-size:14px">准备发送…</div>
    <div style="height:8px;background:var(--bg3);border-radius:4px;overflow:hidden"><div id="th-ai-prog-bar" style="height:100%;width:0;background:var(--pink);transition:width .3s"></div></div>
    <div id="th-ai-prog-log" style="font-size:12px;color:var(--tx3);max-height:160px;overflow:auto"></div>
  </div>`);

  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    const prompt = promptById(b.tasks[0].promptId);
    setProgress(`(${i + 1}/${buckets.length}) 发送：${prompt?.label || b.kind}（${b.tasks.length} 个任务）…`, i, buckets.length);
    try {
      const userInput = buildBucketInput(b, contents, prompt!);
      const genCfg: any = {
        user_input: userInput,
        json_schema: buildJsonSchema(b.kind),
        should_silence: true,
      };
      if (cfg.custom_api) genCfg.custom_api = cfg.custom_api;
      if (cfg.preset_name && cfg.preset_name !== 'in_use') genCfg.preset_name = cfg.preset_name;
      const raw = await generate(genCfg);
      const parsed = parseAiResult(raw);
      // 桶内可能多 task_id，合并所有 items 一起归一化（kind 一致）
      const allItems: any[] = [];
      for (const r of parsed.results) allItems.push(...(r.items || []));
      const norm = normalizeItems(b.kind, allItems);
      results.push({ kind: b.kind, ok: true, items: norm.items, linksByName: norm.linksByName, taskIds: b.tasks.map(t => t.taskId) });
      appendLog(`✓ ${prompt?.label || b.kind}：提取 ${norm.items.length} 项`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ kind: b.kind, ok: false, error: msg, items: [], linksByName: {}, taskIds: b.tasks.map(t => t.taskId) });
      appendLog(`✗ ${prompt?.label || b.kind} 失败：${msg}`);
    }
  }
  setProgress('完成', buckets.length, buckets.length);

  // 4. 汇总 + 进入注入确认（段4）
  const okCnt = results.filter(r => r.ok).length;
  const failCnt = results.length - okCnt;
  const totalItems = results.reduce((s, r) => s + r.items.length, 0);
  appendLog(`\n汇总：${okCnt} 桶成功 / ${failCnt} 桶失败，共 ${totalItems} 项可注入。`);
  if (totalItems === 0) {
    toastr?.warning?.('AI 未返回可注入的内容');
    setTimeout(() => { closeModal2(); renderPanel(); }, 1200);
    return;
  }
  // 段4：注入确认 + 注入卡片 + 建关联 + 回写初始
  openInjectConfirm(results);
}

function setProgress(text: string, done: number, total: number): void {
  const t = qs('#th-ai-prog-text'); if (t) t.textContent = text;
  const bar = qs<HTMLElement>('#th-ai-prog-bar'); if (bar) bar.style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
}
function appendLog(line: string): void {
  const log = qs('#th-ai-prog-log'); if (log) log.innerHTML += esc(line) + '<br>';
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

  const rows = injectables.map((it, i) => {
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
    return `<label class="th-ai-inj-row" data-idx="${i}" style="display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;padding:7px 10px;background:var(--bg3);border-radius:8px">
      <input type="checkbox" class="th-ai-inj-ck" data-idx="${i}" ${it.exists ? '' : 'checked'}>
      <div style="min-width:0">
        <div style="display:flex;gap:6px;align-items:center">
          <i class="${cfg.icon}" style="color:var(--pink)"></i>
          <span style="font-weight:600">${esc(it.name)}</span>${linkBadge}
        </div>
        <div style="font-size:11px;color:var(--tx3)">${descPrev}</div>
      </div>
      <div class="th-ai-inj-conflict">${conflict}</div>
    </label>`;
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
    <div class="th-ai-inj-list" style="display:grid;gap:6px;max-height:300px;overflow:auto;padding-right:4px">${rows}</div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="th-btn" id="th-ai-inj-cancel">取消</button>
      <button class="th-btn th-btn-primary" id="th-ai-inj-go"><i class="fa-solid fa-circle-down"></i> 注入选中项</button>
    </div>
  </div>`;
  openModal2('注入确认', html);

  qs('#th-ai-inj-cancel')?.addEventListener('click', () => { closeModal2(); renderPanel(); });
  qs('#th-ai-inj-go')?.addEventListener('click', () => {
    const writeback = !!qs<HTMLInputElement>('#th-ai-writeback')?.checked;
    const wbMode = (qs<HTMLSelectElement>('#th-ai-wb-mode')?.value || 'dedupe') as InitialWriteMode;
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
    if (!picks.length) { toastr?.warning?.('未勾选任何项'); return; }
    void doInject(injectables, picks, writeback, wbMode);
  });
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
