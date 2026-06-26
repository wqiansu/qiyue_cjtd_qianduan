// 批次1 · 任务1 世界书关联初始化模板（links-init）。
// 把 location/event/dlc 三类 managed 卡片（bindsWorldbook:true）的双向 links 关联图，
// 序列化存进新世界书条目 [初始·关联]，支持一键导入恢复整张关联网。
// 只存关联关系，不存卡片内容（内容仍走现有 [初始·地点] 等）。储藏间不参与。
//
// 仿 stash-io.ts 初始数据范式：readInitialDataFromWorldbook / createInitialWorldbookEntry / downloadText。
// 本批次不加 UI 入口（留批次2 初始化管理面板统一收拢），函数写好供批次2 调用。
// ================================================================
import {
  INITIAL_ENTRY_NAMES,
  LINKS_GRAPH_FORMAT,
  TAG_COLOR_PALETTE,
  type ManagedKind,
} from '../lib/config';
import {
  type LinksGraph,
  type LinksNode,
  getManagedItems,
  addManagedItem,
  loadLinksGraph,
  mergeLinksGraphIntoLocal,
  loadTags,
  saveTags,
} from '../lib/managed-store';
import { safeGetWorldbook, safeUpdateWorldbookWith } from '../lib/tavern-api';
import { getCharWorldbookList, syncBidirLink } from './managed-modal';
import { downloadText, createInitialWorldbookEntry } from './stash-io';
import { esc, escAttr, qs } from '../lib/dom-utils';
import { openModal2, closeModal2 } from '../status-bar-init';

type LinkKind = 'location' | 'event' | 'dlc';
type LinkField = 'locations' | 'events' | 'dlcs';
const LINK_KINDS: LinkKind[] = ['location', 'event', 'dlc'];

// 孤儿关联：图引用了本地不存在的卡片
export type OrphanLink = { kind: LinkKind; field: LinkField; name: string; refs: string[] };

// ==================== 序列化 / 反序列化 ====================

// 把关联图序列化为 JSON 字符串（含 format 版本号）
export function serializeLinksGraph(graph: LinksGraph): string {
  return JSON.stringify({ format: LINKS_GRAPH_FORMAT, links: graph.links }, null, 2);
}

// 解析关联图 JSON 字符串；非法返回 null。校验 format 并兼容无 format 的旧数据。
export function parseLinksGraph(text: string): LinksGraph | null {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  let parsed: any;
  try { parsed = JSON.parse(trimmed); }
  catch { return null; }
  if (!parsed || typeof parsed !== 'object') return null;
  const links = parsed.links && typeof parsed.links === 'object' ? parsed.links : null;
  if (!links) return null;
  // 只取三类，过滤非法字段
  const clean: Record<LinkKind, Record<string, LinksNode>> = { location: {}, event: {}, dlc: {} };
  for (const k of LINK_KINDS) {
    const nodes = links[k];
    if (!nodes || typeof nodes !== 'object') continue;
    for (const [name, node] of Object.entries(nodes)) {
      if (!name || !node || typeof node !== 'object') continue;
      const n = node as any;
      const cleanNode: LinksNode = {};
      if (Array.isArray(n.locations)) cleanNode.locations = n.locations.map(String).filter(Boolean);
      if (Array.isArray(n.events)) cleanNode.events = n.events.map(String).filter(Boolean);
      if (Array.isArray(n.dlcs)) cleanNode.dlcs = n.dlcs.map(String).filter(Boolean);
      if (cleanNode.locations || cleanNode.events || cleanNode.dlcs) clean[k][name] = cleanNode;
    }
  }
  return { format: LINKS_GRAPH_FORMAT, links: clean };
}

// ==================== 世界书读写 ====================

// 从世界书 [初始·关联] 条目读取关联图。多本同名条目合并（后本覆盖前本的同名节点，字段取并集）。
// 无条目返回空图。
export async function readLinksGraphFromWorldbook(): Promise<LinksGraph> {
  const empty: LinksGraph = { format: LINKS_GRAPH_FORMAT, links: { location: {}, event: {}, dlc: {} } };
  const books = getCharWorldbookList();
  if (!books.length) return empty;
  let merged: LinksGraph | null = null;
  for (const book of books) {
    let entries: any[] = [];
    try { entries = await safeGetWorldbook(book); } catch (e) { console.warn('[links-init] 读取世界书失败', book, e); continue; }
    for (const entry of entries) {
      if (entry.name !== INITIAL_ENTRY_NAMES.links) continue;
      const g = parseLinksGraph(entry.content || '');
      if (!g) { console.warn('[links-init] [初始·关联] 条目内容无法解析，已跳过', book); continue; }
      if (!merged) { merged = g; continue; }
      // 合并：同名节点字段取并集
      for (const k of LINK_KINDS) {
        const dst = merged.links[k];
        const src = g.links[k];
        for (const [name, node] of Object.entries(src)) {
          if (!dst[name]) { dst[name] = { ...node }; continue; }
          for (const f of ['locations', 'events', 'dlcs'] as LinkField[]) {
            const arr = node[f] || [];
            const d = dst[name][f] || [];
            for (const t of arr) if (!d.includes(t)) d.push(t);
            if (d.length) dst[name][f] = d;
          }
        }
      }
    }
  }
  return merged || empty;
}

// 找到 [初始·关联] 条目所在世界书与旧 content；不存在返回 { book: books[0], content:'', exists:false }
async function findLinksEntry(): Promise<{ book: string; content: string; exists: boolean }> {
  const books = getCharWorldbookList();
  if (!books.length) throw new Error('当前角色卡没有绑定世界书');
  for (const book of books) {
    const entries = await safeGetWorldbook(book);
    const found = entries.find(e => e.name === INITIAL_ENTRY_NAMES.links);
    if (found) return { book, content: found.content || '', exists: true };
  }
  return { book: books[0], content: '', exists: false };
}

// 合并两份关联图 content（旧保留 + 新去重补入），返回合并后 content
function mergeLinksContent(oldContent: string, newJson: string): string {
  const oldG = parseLinksGraph(oldContent);
  const newG = parseLinksGraph(newJson);
  if (!oldG) return newJson;
  if (!newG) return oldContent;
  const merged: Record<LinkKind, Record<string, LinksNode>> = { location: {}, event: {}, dlc: {} };
  for (const k of LINK_KINDS) {
    const map = new Map<string, LinksNode>();
    // 先放旧的
    for (const [name, node] of Object.entries(oldG.links[k])) map.set(name, { ...node });
    // 再放新的（不覆盖旧同名，但旧不存在的补入）
    for (const [name, node] of Object.entries(newG.links[k])) {
      if (!map.has(name)) { map.set(name, { ...node }); continue; }
      // 旧已有：字段取并集（旧的优先，新的补缺）
      const dst = map.get(name)!;
      for (const f of ['locations', 'events', 'dlcs'] as LinkField[]) {
        const arr = node[f] || [];
        const d = dst[f] || [];
        for (const t of arr) if (!d.includes(t)) d.push(t);
        if (d.length) dst[f] = d;
      }
    }
    if (map.size) merged[k] = Object.fromEntries(map.entries());
  }
  return serializeLinksGraph({ format: LINKS_GRAPH_FORMAT, links: merged });
}

// 写入 [初始·关联] 世界书条目：overwrite=全量覆盖，merge=与旧 content 去重合并。不存在则创建。
export async function writeLinksGraphToInitial(mode: 'overwrite' | 'merge', graphOverride?: LinksGraph): Promise<{ created: boolean; book: string }> {
  const graph = graphOverride || loadLinksGraph();
  const newJson = serializeLinksGraph(graph);
  const found = await findLinksEntry();
  const content = mode === 'merge' ? mergeLinksContent(found.content, newJson) : newJson;
  let created = false;
  await safeUpdateWorldbookWith(found.book, entries => {
    const idx = entries.findIndex(e => e.name === INITIAL_ENTRY_NAMES.links);
    if (idx >= 0) entries[idx] = { ...entries[idx], content };
    else { created = true; entries.push(createInitialWorldbookEntry(INITIAL_ENTRY_NAMES.links, content)); }
    return entries;
  }, { render: 'debounced' });
  return { created: !found.exists || created, book: found.book };
}

// ==================== 文件导入导出 ====================

// 导出本地关联图为 JSON 文件
export function exportLinksGraphFile(): void {
  const graph = loadLinksGraph();
  const total = LINK_KINDS.reduce((s, k) => s + Object.keys(graph.links[k]).length, 0);
  if (!total) { toastr?.warning?.('当前没有关联数据可导出'); return; }
  downloadText('关联图_' + new Date().toISOString().slice(0, 10) + '.json', serializeLinksGraph(graph));
  toastr?.success?.(`已导出关联图（${total} 个有关联的卡片）`);
}

// 从 JSON 文本导入关联图：解析 → 增量合并 → 返回统计（孤儿由调用方决定处理）
export function importLinksGraphFile(text: string): { added: number; skipped: number; orphans: OrphanLink[]; error?: string } {
  const graph = parseLinksGraph(text);
  if (!graph) return { added: 0, skipped: 0, orphans: [], error: '关联图 JSON 解析失败或格式不符' };
  const result = mergeLinksGraphIntoLocal(graph);
  // 收敛孤儿（同名同引用去重）
  const seen = new Set<string>();
  const orphans: OrphanLink[] = [];
  for (const o of result.orphans) {
    for (const r of o.refs) {
      const key = `${o.kind}:${o.field}:${o.name}:${r}`;
      if (seen.has(key)) continue;
      seen.add(key);
      orphans.push({ kind: o.kind, field: o.field, name: o.name, refs: [r] });
    }
  }
  return { added: result.added, skipped: result.skipped, orphans };
}

// ==================== UI 层（供批次2 初始化管理面板接入，本批次不挂入口）====================

// 给某 kind 建「待补全」标签（不存在则建，TAG_COLOR_PALETTE 随机色）
function ensurePlaceholderTag(kind: ManagedKind): void {
  const tags = loadTags();
  if (!tags[kind]) tags[kind] = {};
  if (!tags[kind]['待补全']) {
    tags[kind]['待补全'] = { color: TAG_COLOR_PALETTE[Math.floor(Math.random() * TAG_COLOR_PALETTE.length)], desc: '从关联图导入的占位卡片，待补全描述' };
    saveTags(tags);
  }
}

// 建占位卡：desc 占位文字 + 「待补全」标签。返回是否成功建（同名已存在则跳过）。
function createPlaceholderCard(kind: LinkKind, name: string): boolean {
  const items = getManagedItems(kind);
  if (items[name]) return false;
  ensurePlaceholderTag(kind);
  addManagedItem(kind, name, { desc: '(待补全：从关联图导入的占位卡片，请填写描述)', tags: ['待补全'] });
  return true;
}

// 孤儿关联确认 modal：列孤儿清单，「忽略 / 建占位卡」二选一。
// onChoose(placeholderNames) 回调：选忽略传 []，选建占位卡传建好的占位卡 [{kind,name}]。
export function openOrphanLinksModal(orphans: OrphanLink[], onChoose: (built: { kind: LinkKind; name: string }[]) => void): void {
  if (!orphans.length) { onChoose([]); return; }
  // 收敛孤儿目标卡片名（去重）：{kind → Set<name>}
  const byKind = new Map<LinkKind, Set<string>>();
  for (const o of orphans) {
    for (const r of o.refs) {
      if (!byKind.has(o.kind)) byKind.set(o.kind, new Set());
      byKind.get(o.kind)!.add(r);
    }
  }
  const rows: string[] = [];
  for (const [kind, names] of byKind) {
    const label = kind === 'location' ? '地点' : kind === 'event' ? '事件' : 'DLC';
    for (const name of names) {
      rows.push(`<div class="th-links-orphan-row"><span class="th-links-orphan-kind">${label}</span><span class="th-links-orphan-name">${esc(name)}</span></div>`);
    }
  }
  const h = `<div class="th-links-orphan" style="padding:14px">
    <div style="color:var(--tx2);line-height:1.7;font-size:13px;margin-bottom:10px">关联图引用了 <b>${rows.length}</b> 个本地不存在的卡片。可忽略这些孤儿关联，或为它们建占位卡片（打「待补全」标签，desc 占位）。</div>
    <div class="th-links-orphan-list" style="max-height:240px;overflow-y:auto;display:grid;gap:6px;margin-bottom:16px">${rows.join('')}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="th-btn" id="th-links-orphan-ignore">忽略</button>
      <button class="th-btn th-btn-primary" id="th-links-orphan-build"><i class="fa-solid fa-plus"></i> 建占位卡</button>
    </div>
  </div>`;
  openModal2('孤儿关联处理', h);
  setTimeout(() => {
    qs('#th-links-orphan-ignore')?.addEventListener('click', () => { closeModal2(); onChoose([]); });
    qs('#th-links-orphan-build')?.addEventListener('click', () => {
      const built: { kind: LinkKind; name: string }[] = [];
      for (const [kind, names] of byKind) {
        for (const name of names) {
          if (createPlaceholderCard(kind, name)) built.push({ kind, name });
        }
      }
      closeModal2();
      onChoose(built);
    });
  }, 40);
}

// 导入前预览 modal：列「A → B, C」清单，限高滚动。onConfirm 确认后回调。
export function openLinksPreviewModal(graph: LinksGraph, onConfirm: () => void | Promise<void>): void {
  const lines: string[] = [];
  for (const k of LINK_KINDS) {
    const nodes = graph.links[k] || {};
    const label = k === 'location' ? '地点' : k === 'event' ? '事件' : 'DLC';
    for (const [name, node] of Object.entries(nodes)) {
      const targets: string[] = [];
      if (node.locations) targets.push(...node.locations.map(t => `地点:${t}`));
      if (node.events) targets.push(...node.events.map(t => `事件:${t}`));
      if (node.dlcs) targets.push(...node.dlcs.map(t => `DLC:${t}`));
      if (targets.length) lines.push(`<div class="th-links-preview-row"><span class="th-links-preview-src">${label}:${esc(name)}</span><span class="th-links-preview-arrow">→</span><span class="th-links-preview-dst">${esc(targets.join('、'))}</span></div>`);
    }
  }
  const h = `<div class="th-links-preview" style="padding:14px">
    <div style="color:var(--tx2);font-size:13px;line-height:1.7;margin-bottom:10px">即将导入 <b>${lines.length}</b> 条关联关系。导入后本地已有同名关联会跳过（尊重你的改动），缺失的会补入并自动补反向。</div>
    ${lines.length ? `<div class="th-links-preview-list" style="max-height:300px;overflow-y:auto;display:grid;gap:5px;margin-bottom:16px">${lines.join('')}</div>` : '<div style="color:var(--tx3);text-align:center;padding:20px">无关联关系</div>'}
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="th-btn" id="th-links-preview-cancel">取消</button>
      <button class="th-btn th-btn-primary" id="th-links-preview-confirm"><i class="fa-solid fa-check"></i> 确认导入</button>
    </div>
  </div>`;
  openModal2('关联图导入预览', h);
  setTimeout(() => {
    qs('#th-links-preview-cancel')?.addEventListener('click', closeModal2);
    qs('#th-links-preview-confirm')?.addEventListener('click', async () => { closeModal2(); await onConfirm(); });
  }, 40);
}

// ==================== 组合函数（供批次2 一键导入按钮调）====================

// 一键导入关联图：从世界书读图 → 预览 → 合并入本地 → 孤儿处理（建占位卡则补反向）→ toast 汇总。
export async function importLinksFromWorldbookOneClick(): Promise<void> {
  const graph = await readLinksGraphFromWorldbook();
  const total = LINK_KINDS.reduce((s, k) => s + Object.keys(graph.links[k]).length, 0);
  if (!total) { toastr?.info?.('世界书 [初始·关联] 条目无关联数据或不存在'); return; }
  openLinksPreviewModal(graph, async () => {
    const { added, skipped, orphans } = importLinksGraphFile(serializeLinksGraph(graph));
    if (orphans.length) {
      openOrphanLinksModal(orphans, (built) => {
        // 建了占位卡后，对占位卡涉及的关联补反向（占位卡现在存在了，重跑合并把指向占位卡的正向+反向补全）
        if (built.length) {
          mergeLinksGraphIntoLocal(graph);
        }
        const msg = `已补入 ${added} 条关联${skipped ? `，跳过 ${skipped} 条已存在` : ''}${built.length ? `，建 ${built.length} 张占位卡` : ''}`;
        toastr?.success?.(msg);
      });
    } else {
      toastr?.success?.(`已补入 ${added} 条关联${skipped ? `，跳过 ${skipped} 条已存在` : ''}`);
    }
  });
}

// ==================== 调试挂载（批次2 接入 UI 入口前，供控制台手动验证）====================
// 批次1 不加 UI 入口；挂到 window.__th_links__ 供开发者在控制台手动测试读写/导入导出。
// 批次2 初始化管理面板接入后可保留或移除。
try {
  const w = (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {})) as any;
  w.__th_links__ = {
    loadLinksGraph,
    serializeLinksGraph,
    parseLinksGraph,
    readLinksGraphFromWorldbook,
    writeLinksGraphToInitial,
    exportLinksGraphFile,
    importLinksGraphFile,
    openOrphanLinksModal,
    openLinksPreviewModal,
    importLinksFromWorldbookOneClick,
  };
} catch (e) { void e; }
