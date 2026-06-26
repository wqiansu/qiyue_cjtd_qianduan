// 储藏间导入导出/初始数据/运行时导入（解耦阶段 1c）。
// 从 status-bar-init.ts 纯移动；行为保持一致。
// currentData/currentStashTab 通过主文件 getter 懒读，避免 whole-reassigned 状态引用断开。
// ================================================================
import {
  type ManagedKind,
  MANAGED_CFG,
  INITIAL_ENTRY_NAMES,
  INITIAL_ENTRY_KINDS,
  STASH_RUNTIME_FIELD,
  TAG_COLOR_PALETTE,
} from '../lib/config';
import {
  type ManagedItemV2,
  type Tag,
  getManagedItems,
  setCurrentManagedItems,
  addManagedItem,
  saveManagedOverrides,
  loadTags,
  saveTags,
  getStashKindCfg,
} from '../lib/managed-store';
import { __doc, __body, qs, qsa, esc, escAttr } from '../lib/dom-utils';
import { safeGetWorldbook, safeUpdateWorldbookWith } from '../lib/tavern-api';
import {
  getCurrentStatusData,
  getUserKey,
  getUser,
  getUN,
  getNPCs,
  openModal2,
  closeModal2,
} from '../status-bar-init';
import { getCharWorldbookList, rerenderManagedGrid } from './managed-modal';
import { getCurrentStashTab, openStashModal } from './stash-modal';

type InitialWriteMode = 'append' | 'dedupe';
type InitialWriteItem = { name: string; desc: string; tags: string[]; inject?: string; links?: { locations?: string[]; events?: string[]; dlcs?: string[] } };
type InitialWriteResult = { written: number; skipped: number; book: string; created: boolean };

// ==================== 统一导入/导出（JSON 格式 + 旧 TSV 向后兼容）====================
// 导出格式：每张卡片一个 JSON 对象（{name,desc,tags,inject}），多卡组成数组
// 旧 TSV 格式（名称<Tab>简介<Tab>标签|标签<Tab>注入）仍可导入，自动识别

type ManagedExportItem = { name: string; desc: string; tags: string[]; inject?: string; links?: { locations?: string[]; events?: string[]; dlcs?: string[] } };

// 把 items 序列化为 JSON 字符串（单 kind）
export function serializeManagedItems(items: Record<string, ManagedItemV2>): string {
  const arr: ManagedExportItem[] = Object.entries(items).map(([name, item]) => ({
    name,
    desc: item.desc ?? '',
    tags: item.tags ?? [],
    inject: item.inject || undefined,
    links: item.links,
  }));
  return JSON.stringify(arr, null, 2);
}

// 把多 kind 序列化为 JSON 字符串（"全部"导出用）
function serializeManagedItemsMulti(groups: Record<string, Record<string, ManagedItemV2>>): string {
  const out: Record<string, ManagedExportItem[]> = {};
  for (const [kind, items] of Object.entries(groups)) {
    if (!Object.keys(items).length) continue;
    out[kind] = Object.entries(items).map(([name, item]) => ({
      name, desc: item.desc ?? '', tags: item.tags ?? [], inject: item.inject || undefined, links: item.links,
    }));
  }
  return JSON.stringify({ format: 'th-managed-multi-v1', groups: out }, null, 2);
}

// 触发下载
export function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const a = __doc.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  __body.appendChild(a);
  a.click();
  __body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

// 解析单条 ManagedExportItem → ManagedItemV2（未定义的标签自动创建，不丢弃）
// normalizeImportItem: 解析单条导入数据。
// 不再自己 load/save 标签；把"需要新建的标签"收集到 newTags 返回，
// 由调用方在知道【真实 kind】后统一建标签并 saveTags（避免 __default__ 误建到错误 kind）。
function normalizeImportItem(raw: any, _kind: string, kindTags: Record<string, Tag>): { name: string; item: ManagedItemV2; newTags: string[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name ?? '').trim();
  const desc = String(raw.desc ?? '').trim();
  if (!name || !desc) return null;
  const rawTags: string[] = Array.isArray(raw.tags) ? raw.tags : [];
  const tags: string[] = [];
  const newTags: string[] = [];
  for (const t of rawTags) {
    const ts = String(t).trim();
    if (!ts) continue;
    tags.push(ts);
    // 记录不存在的标签，交给调用方按真实 kind 新建
    if (!kindTags[ts]) newTags.push(ts);
    break;
  }
  const injectRaw = raw.inject;
  const inject = (typeof injectRaw === 'string' && injectRaw.trim()) ? injectRaw.trim() : undefined;
  // 解析 links 字段
  let links: { locations?: string[]; events?: string[]; dlcs?: string[] } | undefined = undefined;
  if (raw.links && typeof raw.links === 'object') {
    links = {};
    if (Array.isArray(raw.links.locations)) links.locations = raw.links.locations.map(String).filter(Boolean);
    if (Array.isArray(raw.links.events)) links.events = raw.links.events.map(String).filter(Boolean);
    if (Array.isArray(raw.links.dlcs)) links.dlcs = raw.links.dlcs.map(String).filter(Boolean);
    if (!links.locations && !links.events && !links.dlcs) links = undefined;
  }
  return { name, item: { desc, tags, inject, links }, newTags };
}

// 解析导入文本：自动识别 JSON 新格式 / 旧 TSV 格式，返回按 kind 分组的解析结果
export type ParsedImport = { byKind: Record<string, { name: string; item: ManagedItemV2 }[]>; warnTags: string[] };

// internal：在真实 kind 下自动新建缺失标签（统一入口，避免各处重复实现）
function ensureTagsForKind(realKind: string, tagNames: string[]): void {
  if (!tagNames.length) return;
  const allTags = loadTags();
  if (!allTags[realKind]) allTags[realKind] = {};
  let changed = false;
  for (const t of tagNames) {
    if (t && !allTags[realKind][t]) {
      allTags[realKind][t] = { color: TAG_COLOR_PALETTE[Math.floor(Math.random() * TAG_COLOR_PALETTE.length)], desc: '' };
      changed = true;
    }
  }
  if (changed) saveTags(allTags);
}

// defaultRealKind: 单 kind JSON 数组（byKind['__default__']）对应的真实 kind，
// 用于把数组内卡片的标签新建到正确 kind（而非 '__default__'）。多 kind 对象路径不需要。
export function parseManagedImport(text: string, kindTagsByKind: Record<string, Record<string, Tag>>, defaultRealKind?: string): ParsedImport {
  const byKind: Record<string, { name: string; item: ManagedItemV2 }[]> = {};
  const warnTags: string[] = [];
  const trimmed = text.trim();

  // 尝试 JSON 解析
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      // 单 kind 数组：[{name,desc,tags,inject}, ...]
      if (Array.isArray(parsed)) {
        byKind['__default__'] = [];
        const defaultKind = '__default__';
        const defaultKindTags = kindTagsByKind[defaultKind] || {};
        const realKind = defaultRealKind || defaultKind;
        const collectedNewTags: string[] = [];
        for (const raw of parsed) {
          const norm = normalizeImportItem(raw, defaultKind, defaultKindTags);
          if (norm) {
            byKind['__default__'].push({ name: norm.name, item: norm.item });
            for (const nt of norm.newTags) if (!collectedNewTags.includes(nt)) collectedNewTags.push(nt);
          }
        }
        // 在真实 kind 下自动新建缺失标签
        ensureTagsForKind(realKind, collectedNewTags);
        return { byKind, warnTags };
      }
      // 多 kind 对象：{format:'th-managed-multi-v1', groups:{kind:[...]}}
      if (parsed && typeof parsed === 'object') {
        const groups = parsed.groups || parsed;
        const newTagsByKind: Record<string, string[]> = {};
        for (const [kind, arr] of Object.entries(groups)) {
          if (!Array.isArray(arr)) continue;
          const kindTags = kindTagsByKind[kind] || {};
          byKind[kind] = [];
          newTagsByKind[kind] = [];
          for (const raw of arr) {
            const norm = normalizeImportItem(raw, kind, kindTags);
            if (norm) {
              byKind[kind].push({ name: norm.name, item: norm.item });
              for (const nt of norm.newTags) if (!newTagsByKind[kind].includes(nt)) newTagsByKind[kind].push(nt);
            }
          }
        }
        for (const [k, ts] of Object.entries(newTagsByKind)) ensureTagsForKind(k, ts);
        return { byKind, warnTags };
      }
    } catch (e) { void e; /* JSON 解析失败，回退到 TSV */ }
  }

  // 回退：旧 TSV 格式解析（按 kind 标记 # [kind] 分组，无标记则进 __default__）
  const lines = text.split(/\r?\n/);
  let currentKind = '__default__';
  byKind[currentKind] = [];
  const tsvNewTagsByKind: Record<string, string[]> = { '__default__': [] };
  for (const line of lines) {
    if (!line.trim() || line.startsWith('#')) {
      // 解析 kind 标记
      if (line.startsWith('#')) {
        const m = line.match(/#\s*\[(.+?)\]/);
        if (m) {
          currentKind = m[1].trim();
          if (!byKind[currentKind]) byKind[currentKind] = [];
          if (!tsvNewTagsByKind[currentKind]) tsvNewTagsByKind[currentKind] = [];
        }
      }
      continue;
    }
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    const name = parts[0].trim();
    const desc = parts[1].trim();
    if (!name || !desc) continue;
    const kindTags = kindTagsByKind[currentKind] || {};
    let tags: string[] = [];
    if (parts[2] && parts[2].trim()) {
      const tagList = parts[2].split('|').map(t => t.trim()).filter(Boolean);
      for (const t of tagList) {
        if (!tags.includes(t)) {
          tags.push(t);
          if (!kindTags[t] && !tsvNewTagsByKind[currentKind].includes(t)) tsvNewTagsByKind[currentKind].push(t);
        }
      }
    }
    const inject = parts[3]?.trim() || undefined;
    byKind[currentKind].push({ name, item: { desc, tags, inject } });
  }
  // TSV 路径同样在真实 kind 下新建标签；__default__ 用 defaultRealKind
  for (const [k, ts] of Object.entries(tsvNewTagsByKind)) {
    const realKind = k === '__default__' ? (defaultRealKind || k) : k;
    ensureTagsForKind(realKind, ts);
  }
  return { byKind, warnTags };
}

// ==================== 初始数据世界书种子（§10.6 Build 2）====================
// 玩家在角色卡世界书里建固定名称的条目,作为初始数据源。脚本读取这些条目增量合并到本地。
// 名称精确匹配,不用前缀 startsWith,避免误匹配现有 [地点]xxx/[事件]xxx/[DLC]xxx 绑定条目。
// INITIAL_ENTRY_NAMES / INITIAL_ENTRY_KINDS 已抽至 ./lib/config.ts

// 读取所有初始数据条目,解析成 ParsedImport(复用 parseManagedImport 的格式)
// - 地点/事件/DLC 条目 content 是 JSON 数组,用单 kind 解析
// - 储藏间条目 content 是多 kind JSON(th-managed-multi-v1),按 kind 分组解析
export async function readInitialDataFromWorldbook(): Promise<ParsedImport> {
  const byKind: Record<string, { name: string; item: ManagedItemV2 }[]> = {};
  const warnTags: string[] = [];
  const allTags = loadTags();
  const books = getCharWorldbookList();
  if (!books.length) return { byKind, warnTags };

  // 收集每个初始条目的 content(同名条目合并)
  const entryContents: Record<string, string> = {};
  for (const book of books) {
    const entries = await safeGetWorldbook(book);
    for (const entry of entries) {
      if (entry.name in INITIAL_ENTRY_KINDS) {
        // 多本世界书可能有同名条目,内容用换行拼接(后续按 JSON 解析会失败则单独处理)
        entryContents[entry.name] = entryContents[entry.name]
          ? entryContents[entry.name] + '\n' + (entry.content || '')
          : (entry.content || '');
      }
    }
  }

  for (const [entryName, content] of Object.entries(entryContents)) {
    const kinds = INITIAL_ENTRY_KINDS[entryName];
    if (!kinds || !content.trim()) continue;

    // 构建标签字典:每个 kind 用自己的标签字典
    const kindTagsByKind: Record<string, Record<string, Tag>> = {};
    for (const k of kinds) kindTagsByKind[k] = allTags[k] || {};

    if (kinds.length === 1) {
      // 地点/事件/DLC:单 kind,content 是 JSON 数组。用 __default__ 入口
      kindTagsByKind['__default__'] = allTags[kinds[0]] || {};
      const parsed = parseManagedImport(content, kindTagsByKind, kinds[0]);
      const items = parsed.byKind['__default__'] || [];
      if (items.length) byKind[kinds[0]] = items;
      for (const t of parsed.warnTags) if (!warnTags.includes(t)) warnTags.push(t);
    } else {
      // 储藏间:多 kind,content 是 {format,groups}
      const parsed = parseManagedImport(content, kindTagsByKind);
      for (const [k, items] of Object.entries(parsed.byKind)) {
        if (items.length) byKind[k] = items;
      }
      for (const t of parsed.warnTags) if (!warnTags.includes(t)) warnTags.push(t);
    }
  }
  return { byKind, warnTags };
}

// 增量合并初始数据到本地:每个 kind 内,本地没有的同名 item 才补入,已有不动(含玩家改过/删过的)
// 返回统计:added 新增数, skipped 跳过数(本地已有)
export async function mergeInitialDataIntoLocal(parsed: ParsedImport): Promise<{ added: number; skipped: number; kinds: string[] }> {
  let added = 0, skipped = 0;
  const touchedKinds: string[] = [];
  for (const [kindKey, items] of Object.entries(parsed.byKind)) {
    const kind = kindKey as ManagedKind;
    // 自定义 kind 不支持初始数据源,跳过
    if (!(kind in MANAGED_CFG) && !kind.startsWith('stash-')) continue;
    if (kind.startsWith('stash-custom-')) continue;
    const current = getManagedItems(kind);
    let kindAdded = 0;
    for (const { name, item } of items) {
      if (current[name]) {
        skipped++;
        // 本地已有,仅增量合并 links(不取并集,保留本地原有)
        if (item.links && !current[name].links) {
          current[name].links = item.links;
          saveManagedOverrides(kind);
        }
        continue;
      }
      // 用 addManagedItem 写入(会自动设 lastEdited + saveManagedOverrides)
      addManagedItem(kind, name, { ...item, favorite: false });
      added++; kindAdded++;
    }
    if (kindAdded > 0) touchedKinds.push(kind);
  }
  return { added, skipped, kinds: touchedKinds };
}

// ==================== 运行时数据导入储藏间 + 写入初始世界书（§10.6 Build 2-2/2-3）====================
// 储藏间 kind → 对应变量路径字段名
// STASH_RUNTIME_FIELD 已抽至 ./lib/config.ts

// 把运行时变量值转成储藏间用的 desc（对象保持 JSON 字符串，以便配发时还原结构）
function runtimeValueToDesc(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  // 对象:保持完整 JSON 字符串，以便配发时能还原完整结构（数量、效果、评价等字段）
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return ''; }
  }
  return '';
}

// 收集当前 user + 所有 NPC 的储藏间四类数据,返回按 kind 分组的候选项(含来源标注)
// 返回: { [kind]: [{ name, desc, source }] }
type RuntimeStashCandidate = { name: string; desc: string; source: string };
export function collectRuntimeStashData(): Record<string, RuntimeStashCandidate[]> {
  const result: Record<string, RuntimeStashCandidate[]> = {
    'stash-item': [], 'stash-skill': [], 'stash-status': [], 'stash-clothing': [],
  };
  const currentData = getCurrentStatusData();
  if (!currentData) return result;
  const userKey = getUserKey(currentData);
  const user = getUser(currentData);
  const userName = getUN(currentData) || userKey;
  const npcs = getNPCs(currentData);

  // user 数据
  for (const [kind, field] of Object.entries(STASH_RUNTIME_FIELD)) {
    const bag = _.get(user, field, {}) || {};
    for (const [name, val] of Object.entries(bag)) {
      const desc = runtimeValueToDesc(val);
      if (!name) continue;
      result[kind].push({ name: String(name).trim(), desc, source: `${userName}(主角)` });
    }
  }
  // NPC 数据
  for (const { name: npcName, info } of npcs) {
    if (!info) continue;
    for (const [kind, field] of Object.entries(STASH_RUNTIME_FIELD)) {
      const bag = _.get(info, field, {}) || {};
      for (const [name, val] of Object.entries(bag)) {
        const desc = runtimeValueToDesc(val);
        if (!name) continue;
        result[kind].push({ name: String(name).trim(), desc, source: npcName });
      }
    }
  }
  return result;
}

// 把选中的候选项组装成多 kind JSON(th-managed-multi-v1 格式),用于写入 [初始·储藏间] 条目
function buildStashInitialJson(selected: Record<string, RuntimeStashCandidate[]>): string {
  const groups: Record<string, { name: string; desc: string; tags: string[] }[]> = {};
  for (const [kind, items] of Object.entries(selected)) {
    if (!items.length) continue;
    // 去重(同名保留第一个)
    const seen = new Set<string>();
    const arr: { name: string; desc: string; tags: string[] }[] = [];
    for (const it of items) {
      if (seen.has(it.name)) continue;
      seen.add(it.name);
      arr.push({ name: it.name, desc: it.desc, tags: [] });
    }
    if (arr.length) groups[kind] = arr;
  }
  return JSON.stringify({ format: 'th-managed-multi-v1', groups }, null, 2);
}

// 读旧 [初始·储藏间] 条目 content,合并新数据(去重),返回合并后 content + 是否需新建条目
function mergeStashInitialContent(oldContent: string, newJson: string): string {
  let oldGroups: Record<string, { name: string; desc: string; tags?: string[] }[]> = {};
  if (oldContent.trim()) {
    try {
      const parsed = JSON.parse(oldContent);
      oldGroups = (parsed && parsed.groups) ? parsed.groups : {};
    } catch { /* 旧 content 非法,忽略 */ }
  }
  let newGroups: Record<string, { name: string; desc: string; tags?: string[] }[]> = {};
  try {
    const parsed = JSON.parse(newJson);
    newGroups = (parsed && parsed.groups) ? parsed.groups : {};
  } catch { return newJson; }

  const merged: Record<string, { name: string; desc: string; tags?: string[] }[]> = {};
  const allKinds = new Set([...Object.keys(oldGroups), ...Object.keys(newGroups)]);
  for (const kind of allKinds) {
    const map = new Map<string, { name: string; desc: string; tags?: string[] }>();
    // 先放旧的(保留玩家已有)
    for (const it of (oldGroups[kind] || [])) map.set(it.name, it);
    // 再放新的(不覆盖旧的同名)
    for (const it of (newGroups[kind] || [])) {
      if (!map.has(it.name)) map.set(it.name, it);
    }
    if (map.size) merged[kind] = [...map.values()];
  }
  return JSON.stringify({ format: 'th-managed-multi-v1', groups: merged }, null, 2);
}

// 写入 [初始·储藏间] 世界书条目:合并旧 content,不存在则创建
async function writeStashInitialEntry(newJson: string): Promise<{ created: boolean; book: string }> {
  const books = getCharWorldbookList();
  if (!books.length) throw new Error('当前角色卡没有绑定世界书');
  const targetName = INITIAL_ENTRY_NAMES.stash;
  const mergedContent = await (async () => {
    // 读旧 content
    for (const book of books) {
      const entries = await safeGetWorldbook(book);
      const found = entries.find(e => e.name === targetName);
      if (found) return { book, oldContent: found.content || '', uid: found.uid };
    }
    return { book: books[0], oldContent: '', uid: -1 };
  })();
  const merged = mergeStashInitialContent(mergedContent.oldContent, newJson);

  let created = false;
  await safeUpdateWorldbookWith(mergedContent.book, entries => {
    const idx = entries.findIndex(e => e.name === targetName);
    if (idx >= 0) {
      entries[idx] = { ...entries[idx], content: merged };
    } else {
      // 新建条目:蓝灯 constant + 禁用(数据源不需要激活注入)
      created = true;
      entries.push(createInitialWorldbookEntry(targetName, merged));
    }
    return entries;
  }, { render: 'debounced' });
  return { created, book: mergedContent.book };
}

// 批次1：改为 export，供 links-init 复用（蓝灯 constant + 禁用，数据源条目统一构造）
export function createInitialWorldbookEntry(name:string, content:string): WorldbookEntry {
  return {
    uid: Date.now(),
    name,
    enabled: false,
    content,
    strategy: { type: 'constant', keys: [], keys_secondary: { logic: 'and_any', keys: [] }, scan_depth: 'same_as_global' },
    position: { type: 'before_character_definition', role: 'system', depth: 0, order: 100 },
    probability: 100,
    recursion: { prevent_incoming: false, prevent_outgoing: false, delay_until: null },
    effect: { depth: 0 } as any,
  } as WorldbookEntry;
}

export function openReadInitialConfirmModal(label:string, onConfirm:()=>void|Promise<void>) {
  const h=`<div class="th-confirm-box" style="padding:12px">
    <div style="font-weight:800;margin-bottom:10px">确认重读初始数据？</div>
    <div style="color:var(--tx2);line-height:1.7;font-size:13px">将从世界书初始数据条目增量补入${esc(label)}本地缺失卡片；已有同名卡片不会覆盖。</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">
      <button class="th-btn" id="th-read-initial-cancel">取消</button>
      <button class="th-btn th-btn-primary" id="th-read-initial-confirm"><i class="fa-solid fa-seedling"></i> 确认重读</button>
    </div>
  </div>`;
  openModal2('重读初始数据确认',h);
  setTimeout(()=>{
    qs('#th-read-initial-cancel')?.addEventListener('click',closeModal2);
    qs('#th-read-initial-confirm')?.addEventListener('click',async()=>{ closeModal2(); await onConfirm(); });
  },40);
}

function getInitialEntryNameForKind(kind:ManagedKind): string|null {
  if(kind==='location') return INITIAL_ENTRY_NAMES.location;
  if(kind==='event') return INITIAL_ENTRY_NAMES.event;
  if(kind==='dlc') return INITIAL_ENTRY_NAMES.dlc;
  if(kind==='stash-item'||kind==='stash-skill'||kind==='stash-status'||kind==='stash-clothing') return INITIAL_ENTRY_NAMES.stash;
  return null;
}
function toInitialWriteItem(name:string, item:ManagedItemV2): InitialWriteItem {
  return { name, desc:item.desc??'', tags:(item.tags||[]).slice(0,1), inject:item.inject||undefined, links:item.links };
}
function canonicalInitialItem(item:InitialWriteItem): string {
  return JSON.stringify({ name:item.name, desc:item.desc??'', tags:item.tags||[], inject:item.inject||undefined, links:item.links||undefined });
}
function readInitialArray(content:string): InitialWriteItem[] {
  try { const parsed=JSON.parse(content||'[]'); return Array.isArray(parsed)?parsed:[]; } catch { return []; }
}
function readInitialGroups(content:string): Record<string, InitialWriteItem[]> {
  try { const parsed=JSON.parse(content||'{}'); const groups=parsed?.groups||{}; return (groups&&typeof groups==='object')?groups:{}; } catch { return {}; }
}
async function findInitialEntry(targetName:string): Promise<{ book:string; content:string; exists:boolean }> {
  const books=getCharWorldbookList();
  if(!books.length) throw new Error('当前角色卡没有绑定世界书');
  for(const book of books){
    const entries=await safeGetWorldbook(book);
    const found=entries.find(e=>e.name===targetName);
    if(found) return { book, content:found.content||'', exists:true };
  }
  return { book:books[0], content:'', exists:false };
}
async function upsertInitialContent(targetName:string, content:string, bookHint:string): Promise<{ created:boolean; book:string }> {
  let created=false;
  await safeUpdateWorldbookWith(bookHint, entries=>{
    const idx=entries.findIndex(e=>e.name===targetName);
    if(idx>=0) entries[idx]={...entries[idx],content};
    else { created=true; entries.push(createInitialWorldbookEntry(targetName,content)); }
    return entries;
  }, { render:'debounced' });
  return { created, book:bookHint };
}
async function writeInitialItemsForKind(kind:ManagedKind, items:InitialWriteItem[], mode:InitialWriteMode): Promise<InitialWriteResult> {
  const targetName=getInitialEntryNameForKind(kind);
  if(!targetName) return { written:0, skipped:0, book:'', created:false };
  const found=await findInitialEntry(targetName);
  let written=0, skipped=0, content='';
  if(targetName===INITIAL_ENTRY_NAMES.stash){
    const groups=readInitialGroups(found.content);
    const existing=groups[kind]||[];
    const seen=new Set(existing.map(canonicalInitialItem));
    const next=[...existing];
    for(const item of items){
      const key=canonicalInitialItem(item);
      if(mode==='dedupe'&&seen.has(key)){ skipped++; continue; }
      next.push(item); seen.add(key); written++;
    }
    groups[kind]=next;
    content=JSON.stringify({format:'th-managed-multi-v1',groups},null,2);
  } else {
    const existing=readInitialArray(found.content);
    const seen=new Set(existing.map(canonicalInitialItem));
    const next=[...existing];
    for(const item of items){
      const key=canonicalInitialItem(item);
      if(mode==='dedupe'&&seen.has(key)){ skipped++; continue; }
      next.push(item); seen.add(key); written++;
    }
    content=JSON.stringify(next,null,2);
  }
  const result=await upsertInitialContent(targetName,content,found.book);
  return { written, skipped, book:result.book, created:!found.exists||result.created };
}

export function openWriteInitialDataModal(defaultKinds:ManagedKind[]) {
  const available = Array.from(new Set(defaultKinds.filter(k=>!!getInitialEntryNameForKind(k))));
  const allTags=loadTags();
  let h=`<div class="th-write-initial" style="padding:12px;display:grid;gap:12px">
    <div style="color:var(--tx2);font-size:13px;line-height:1.7">将当前本地卡片写入世界书初始数据。可选择类别与单一标签；“检测重名写入”只有名称、简介、标签、注入、关联字段全部一致才跳过，否则同名也保留为副本。</div>
    <div style="display:grid;gap:8px">`;
  for(const kind of available){
    const cfg=getStashKindCfg(kind); const tagNames=Object.keys(allTags[kind]||{});
    h+=`<label style="display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px;background:var(--bg3);padding:8px 10px;border-radius:10px">
      <input type="checkbox" data-init-kind="${kind}" checked>
      <span><i class="${cfg.icon}"></i> ${esc(cfg.label)}</span>
      <select class="th-edit-select" data-init-tag-kind="${kind}">
        <option value="__all__">全部标签</option>
        <option value="__none__">未分类</option>
        ${tagNames.map(t=>`<option value="${escAttr(t)}">${esc(t)}</option>`).join('')}
      </select>
    </label>`;
  }
  h+=`</div>
    <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
      <label><input type="radio" name="th-init-mode" value="dedupe" checked> 检测重名写入</label>
      <label><input type="radio" name="th-init-mode" value="append"> 增量写入</label>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="th-btn" id="th-write-initial-cancel">取消</button>
      <button class="th-btn th-btn-primary" id="th-write-initial-confirm"><i class="fa-solid fa-file-import"></i> 确认写入</button>
    </div>
  </div>`;
  openModal2('写入初始数据',h);
  setTimeout(()=>{
    qs('#th-write-initial-cancel')?.addEventListener('click',closeModal2);
    qs('#th-write-initial-confirm')?.addEventListener('click',async()=>{
      const mode=(qs<HTMLInputElement>('input[name="th-init-mode"]:checked')?.value||'dedupe') as InitialWriteMode;
      const selectedKinds=qsa<HTMLInputElement>('input[data-init-kind]:checked');
      if(!selectedKinds.length){ toastr?.warning?.('请至少选择一个类别'); return; }
      try{
        let totalWritten=0,totalSkipped=0; const books:string[]=[];
        for(const cb of Array.from(selectedKinds)){
          const kind=cb.getAttribute('data-init-kind') as ManagedKind;
          const tag=(qs<HTMLSelectElement>(`select[data-init-tag-kind="${kind}"]`)?.value||'__all__');
          const source=getManagedItems(kind);
          const items=Object.entries(source).filter(([,item])=>{
            const tags=item.tags||[];
            if(tag==='__all__') return true;
            if(tag==='__none__') return !tags.length;
            return tags.includes(tag);
          }).map(([name,item])=>toInitialWriteItem(name,item));
          if(!items.length) continue;
          const res=await writeInitialItemsForKind(kind,items,mode);
          totalWritten+=res.written; totalSkipped+=res.skipped;
          if(res.book&&!books.includes(res.book)) books.push(res.book);
        }
        closeModal2();
        toastr?.success?.(`已写入 ${totalWritten} 条初始数据${totalSkipped?`，跳过 ${totalSkipped} 条完全重复`:''}${books.length?`\n世界书：${books.join('、')}`:''}`);
      }catch(e){ console.warn('[写入初始数据] 失败',e); toastr?.error?.('写入初始数据失败：'+(e as Error).message); }
    });
  },40);
}

// 运行时数据导入复选 modal(§10.6 Build 2-2/2-3)
// collected: collectRuntimeStashData 的返回;allTabs: 储藏间所有 kind(用于刷新)
export function openRuntimeImportModal(collected: Record<string, RuntimeStashCandidate[]>, allTabs: ManagedKind[]) {
  const KIND_LABEL: Record<string, string> = {
    'stash-item': '物品', 'stash-skill': '技能', 'stash-status': '状态', 'stash-clothing': '衣物',
  };
  let h = `<div class="th-runtime-import">`;
  h += `<div class="th-runtime-import-tip">勾选要导入储藏间并写入 [初始·储藏间] 世界书条目的数据。已存在于储藏间的同名项会跳过(不覆盖)。</div>`;
  h += `<div class="th-runtime-import-actions"><button class="th-btn-sm" id="th-ri-all" type="button">全选</button><button class="th-btn-sm" id="th-ri-none" type="button">全不选</button><button class="th-btn-sm" id="th-ri-reverse" type="button">反选</button></div>`;
  for (const kind of ['stash-item', 'stash-skill', 'stash-status', 'stash-clothing'] as const) {
    const items = collected[kind] || [];
    if (!items.length) continue;
    h += `<div class="th-runtime-import-group" data-kind="${kind}">
      <div class="th-runtime-import-group-header" data-kind-header="${kind}" style="cursor:pointer;display:flex;align-items:center;gap:8px;">
        <i class="fa-solid fa-square-check" style="color:var(--mint);"></i>
        ${KIND_LABEL[kind]} (${items.length})
        <button class="th-btn-xs" id="th-ri-kind-all-${kind}" type="button" style="margin-left:auto;">全选</button>
        <button class="th-btn-xs" id="th-ri-kind-none-${kind}" type="button">全不选</button>
        <button class="th-btn-xs" id="th-ri-kind-reverse-${kind}" type="button">反选</button>
      </div>
      <div class="th-runtime-import-kind-content" data-kind-content="${kind}">`;
    // 同名去重展示(保留所有来源,但勾选时按 name 去重)
    const seen = new Set<string>();
    for (const it of items) {
      const dup = seen.has(it.name);
      seen.add(it.name);
      h += `<label class="th-runtime-import-item${dup ? ' dup' : ''}">
        <input type="checkbox" data-ri-kind="${kind}" data-ri-name="${escAttr(it.name)}" data-ri-desc="${escAttr(it.desc)}" checked>
        <span class="th-ri-name">${esc(it.name)}</span>
        <span class="th-ri-source">${esc(it.source)}</span>
        ${it.desc ? `<span class="th-ri-desc">${esc(it.desc.slice(0, 30))}${it.desc.length > 30 ? '…' : ''}</span>` : ''}
      </label>`;
    }
    h += `</div></div>`;
  }
  h += `<div class="th-runtime-import-footer"><button class="th-btn th-btn-primary" id="th-ri-confirm" type="button"><i class="fa-solid fa-check"></i> 确认导入并写入世界书</button> <button class="th-btn" id="th-ri-cancel" type="button"><i class="fa-solid fa-xmark"></i> 取消</button></div>`;
  h += `</div>`;
  openModal2('从角色数据导入储藏间', h);

  setTimeout(() => {
    qs('#th-ri-all')?.addEventListener('click', () => {
      qsa<HTMLInputElement>('.th-runtime-import-item input[type="checkbox"]').forEach(cb => cb.checked = true);
    });
    qs('#th-ri-none')?.addEventListener('click', () => {
      qsa<HTMLInputElement>('.th-runtime-import-item input[type="checkbox"]').forEach(cb => cb.checked = false);
    });
    qs('#th-ri-reverse')?.addEventListener('click', () => {
      qsa<HTMLInputElement>('.th-runtime-import-item input[type="checkbox"]').forEach(cb => cb.checked = !cb.checked);
    });
    // 各分组的全选/全不选/反选
    for (const kind of ['stash-item', 'stash-skill', 'stash-status', 'stash-clothing'] as const) {
      qs(`#th-ri-kind-all-${kind}`)?.addEventListener('click', (e) => {
        e.stopPropagation();
        qsa<HTMLInputElement>(`.th-runtime-import-item input[data-ri-kind="${kind}"]`).forEach(cb => cb.checked = true);
      });
      qs(`#th-ri-kind-none-${kind}`)?.addEventListener('click', (e) => {
        e.stopPropagation();
        qsa<HTMLInputElement>(`.th-runtime-import-item input[data-ri-kind="${kind}"]`).forEach(cb => cb.checked = false);
      });
      qs(`#th-ri-kind-reverse-${kind}`)?.addEventListener('click', (e) => {
        e.stopPropagation();
        qsa<HTMLInputElement>(`.th-runtime-import-item input[data-ri-kind="${kind}"]`).forEach(cb => cb.checked = !cb.checked);
      });
    }
    qs('#th-ri-cancel')?.addEventListener('click', () => closeModal2());
    qs('#th-ri-confirm')?.addEventListener('click', async () => {
      const btn = qs('#th-ri-confirm') as HTMLButtonElement | null;
      if (btn) btn.disabled = true;
      try {
        // 收集勾选项,按 kind 分组(同名去重)
        const selected: Record<string, RuntimeStashCandidate[]> = {};
        for (const kind of ['stash-item', 'stash-skill', 'stash-status', 'stash-clothing']) selected[kind] = [];
        qsa<HTMLInputElement>('.th-runtime-import-item input[type="checkbox"]:checked').forEach(cb => {
          const kind = cb.getAttribute('data-ri-kind') || '';
          const name = cb.getAttribute('data-ri-name') || '';
          const desc = cb.getAttribute('data-ri-desc') || '';
          if (kind && name && selected[kind] && !selected[kind].some(c => c.name === name)) {
            selected[kind].push({ name, desc, source: '' });
          }
        });
        const totalSelected = Object.values(selected).reduce((s, a) => s + a.length, 0);
        if (totalSelected === 0) { toastr?.warning?.('请至少勾选一项'); if (btn) btn.disabled = false; return; }

        // 1. 增量合并到储藏间本地
        let added = 0, skipped = 0;
        for (const [kindKey, items] of Object.entries(selected)) {
          const kind = kindKey as ManagedKind;
          const current = getManagedItems(kind);
          for (const it of items) {
            if (current[it.name]) { skipped++; continue; }
            addManagedItem(kind, it.name, { desc: it.desc, tags: [] });
            added++;
          }
        }

        // 2. 写入 [初始·储藏间] 世界书条目
        const newJson = buildStashInitialJson(selected);
        const writeResult = await writeStashInitialEntry(newJson);

        // 3. 刷新储藏间面板
        for (const k of allTabs) setCurrentManagedItems(k, getManagedItems(k));
        closeModal2();
        // 刷新当前储藏间 tab 显示
        const curTab = getCurrentStashTab();
        const stashIdPrefix = 'th-stash';
        rerenderManagedGrid(curTab, stashIdPrefix, (qs<HTMLInputElement>(`#${stashIdPrefix}-search`)?.value || '').trim().toLowerCase());

        let msg = `已导入 ${added} 张到储藏间`;
        if (skipped) msg += `，跳过 ${skipped} 张（已存在）`;
        msg += `\n已${writeResult.created ? '创建' : '更新'} [初始·储藏间] 世界书条目（${writeResult.book}）`;
        toastr?.success?.(msg);
      } catch (e) {
        console.warn('[运行时导入储藏间] 失败', e);
        toastr?.error?.('导入失败：' + (e as Error).message);
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }, 60);
}

// 导出
// 导入
export function importStashKind(kind: ManagedKind, text: string, applyTag?: string) {
  const cfg = getStashKindCfg(kind);
  const allTags = loadTags();
  const kindTagsByKind: Record<string, Record<string, Tag>> = {};
  kindTagsByKind[kind] = allTags[kind] || {};
  kindTagsByKind['__default__'] = allTags[kind] || {}; // 单 kind JSON 数组用
  const parsed = parseManagedImport(text, kindTagsByKind, kind);
  setCurrentManagedItems(kind, getManagedItems(kind));
  let imported = 0;
  let failed = 0;
  let skippedOverwrite = 0;
  // 单 kind 导入：取 __default__ 或与本 kind 匹配的分组
  const candidates = parsed.byKind['__default__']?.length ? parsed.byKind['__default__'] : (parsed.byKind[kind] || []);
  // 反馈2：同名卡片用一次确认统一处理（确定=全部覆盖，取消=全部跳过），避免逐条弹窗
  const existingCount = candidates.filter(c => getManagedItems(kind)[c.name]).length;
  let overwrite = false;
  if (existingCount > 0) {
    overwrite = confirm(`检测到 ${existingCount} 条同名${cfg.label}已存在。\n点击「确定」全部覆盖，点击「取消」全部跳过。`);
  }
  for (const { name, item } of candidates) {
    try {
      const existing = getManagedItems(kind);
      if (existing[name]) {
        if (!overwrite) { skippedOverwrite++; continue; }
      }
      // 应用自动打标签
      if (applyTag) {
        const newTags = [...(item.tags || [])];
        if (!newTags.includes(applyTag)) newTags.push(applyTag);
        item.tags = newTags;
      }
      addManagedItem(kind, name, item);
      imported++;
    } catch { failed++; }
  }
  reportImportResult(imported, failed, cfg.label, parsed.warnTags, skippedOverwrite);
}

// 汇报导入结果（统一 toast）
// skipped：因同名已存在被跳过的条数（反馈2：imported=0 且 skipped>0 时不再误报"未识别"）
export function reportImportResult(imported: number, failed: number, label: string, warnTags: string[], skipped = 0) {
  if (imported > 0) {
    let msg = `成功导入 ${imported} 个${label}${failed > 0 ? `，失败 ${failed} 条` : ''}`;
    if (skipped > 0) msg += `，跳过 ${skipped} 条同名`;
    if (warnTags.length > 0) {
      msg += `\n警告：以下标签未在标签字典中定义，已跳过：${[...new Set(warnTags)].join(', ')}`;
      toastr?.warning?.(msg);
    } else {
      toastr?.success?.(msg);
    }
  } else if (skipped > 0) {
    toastr?.info?.(`全部 ${skipped} 条${label}已存在，已跳过${failed > 0 ? `，失败 ${failed} 条` : ''}`);
  } else {
    toastr?.warning?.(`未识别到有效${label}数据（支持 JSON 格式或旧 TSV 格式）`);
  }
}

// 导出全部 kind（"全部" tab）— JSON 多 kind 格式
export function exportAllStashKinds(allTabs: ManagedKind[]) {
  const groups: Record<string, Record<string, ManagedItemV2>> = {};
  let totalCount = 0;
  for (const kind of allTabs) {
    const items = getManagedItems(kind);
    if (!Object.keys(items).length) continue;
    groups[kind] = items;
    totalCount += Object.keys(items).length;
  }
  if (!totalCount) { toastr?.warning?.('储藏间空空如也'); return; }
  downloadText('储藏间全部_' + new Date().toISOString().slice(0, 10) + '.json', serializeManagedItemsMulti(groups));
  toastr?.success?.(`已导出 ${totalCount} 条`);
}

// 导出单个 kind — JSON 数组格式
export function exportStashKind(kind: ManagedKind) {
  const cfg = getStashKindCfg(kind);
  const items = getManagedItems(kind);
  if (!Object.keys(items).length) { toastr?.warning?.(`${cfg.label}数据为空`); return; }
  downloadText(cfg.storageName + '_' + new Date().toISOString().slice(0, 10) + '.json', serializeManagedItems(items));
  toastr?.success?.(`已导出 ${Object.keys(items).length} 个${cfg.label}`);
}

// 导入时选择自动打标签 modal（Build 2-10）
function saveImportTag(kind: ManagedKind, tagName: string, tag: Tag) {
  const tags = loadTags();
  if (!tags[kind]) tags[kind] = {};
  tags[kind][tagName] = tag;
  saveTags(tags);
}

export function openImportWithTagModal(targetKind: ManagedKind | '__all__', text: string, allTabs: ManagedKind[]) {
  const allTags = loadTags();
  const kindTags = targetKind === '__all__' ? {} : (allTags[targetKind] || {});
  const tagNames = Object.keys(kindTags);

  const label = targetKind === '__all__' ? '储藏间' : getStashKindCfg(targetKind).label;

  const tagOptionsHtml = tagNames.map(tagName => {
    const tag = kindTags[tagName];
    return `<label class="th-radio-label" style="display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:8px;cursor:pointer;">
      <input type="radio" name="import-tag" value="${escAttr(tagName)}" style="accent-color:${tag.color}">
      <span class="th-tag-color-dot" style="background:${tag.color}"></span>
      <span>${esc(tagName)}</span>
    </label>`;
  }).join('');

  const html = `<div style="padding:16px;">
    <div style="margin-bottom:12px;font-weight:500;">导入后自动打标签</div>
    <div style="margin-bottom:12px;">
      <label class="th-radio-label" style="display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:8px;cursor:pointer;">
        <input type="radio" name="import-tag" value="" checked>
        <span>不打标签</span>
      </label>
      <label class="th-radio-label" style="display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:8px;cursor:pointer;">
        <input type="radio" name="import-tag" value="__new__">
        <span>新建标签：</span>
        <input type="text" id="new-import-tag-name" placeholder="输入标签名" style="flex:1;padding:4px 8px;border:1px solid #ddd;border-radius:6px;" disabled>
      </label>
      ${tagOptionsHtml}
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button class="th-btn-sm th-btn-cancel" id="import-tag-cancel">取消</button>
      <button class="th-btn-sm th-btn-save" id="import-tag-confirm">确认导入</button>
    </div>
  </div>`;

  openModal2(`导入 · ${label}`, html, { maxWidth: '400px' });

  // 新建标签选择时启用输入框
  qsa('input[name="import-tag"]').forEach(input => {
    input.addEventListener('change', function(this: HTMLInputElement) {
      const newTagInput = qs<HTMLInputElement>('#new-import-tag-name');
      if (newTagInput) newTagInput.disabled = this.value !== '__new__';
    });
  });

  qs('#import-tag-cancel')?.addEventListener('click', closeModal2);
  qs('#import-tag-confirm')?.addEventListener('click', () => {
    const selected = qsa<HTMLInputElement>('input[name="import-tag"]:checked')[0]?.value;
    let applyTag = selected;

    if (selected === '__new__') {
      const newTagInput = qs<HTMLInputElement>('#new-import-tag-name');
      const newTagName = newTagInput?.value?.trim();
      if (!newTagName) { toastr?.warning?.('请输入新标签名'); return; }
      applyTag = newTagName;
      // 保存新标签
      if (targetKind !== '__all__') {
        saveImportTag(targetKind, newTagName, { color: '#8884d8', desc: '导入时新建' });
      }
    }

    // 执行实际导入
    if (targetKind === '__all__') {
      importAllStashKinds(allTabs, text, applyTag);
    } else {
      importStashKind(targetKind, text, applyTag);
    }
    closeModal2();
    openStashModal(targetKind === '__all__' ? 'all' : targetKind);
  });
}

// 按标签导出（Build 2-10）
export function exportStashKindByTag(kind: ManagedKind, tagName: string) {
  const cfg = getStashKindCfg(kind);
  const items = getManagedItems(kind);
  const filtered: Record<string, ManagedItemV2> = {};
  for (const [name, item] of Object.entries(items)) {
    if (tagName === '__no_tag__') {
      if (!item.tags || item.tags.length === 0) filtered[name] = item;
    } else {
      if (item.tags?.includes(tagName)) filtered[name] = item;
    }
  }
  if (!Object.keys(filtered).length) {
    toastr?.warning?.(`标签「${tagName === '__no_tag__' ? '无标签' : tagName}」下没有${cfg.label}`);
    return;
  }
  const suffix = tagName === '__no_tag__' ? '无标签' : tagName;
  downloadText(`${cfg.storageName}_${suffix}_${new Date().toISOString().slice(0, 10)}.json`, serializeManagedItems(filtered));
  toastr?.success?.(`已导出 ${Object.keys(filtered).length} 个${cfg.label}（标签：${tagName === '__no_tag__' ? '无标签' : tagName}）`);
}

// 打开按标签导出选择 modal
export function openExportByTagModal(kind: ManagedKind) {
  const cfg = getStashKindCfg(kind);
  const allTags = loadTags();
  const kindTags = allTags[kind] || {};
  const tagNames = Object.keys(kindTags);

  const optionsHtml = tagNames.map(tagName => {
    const tag = kindTags[tagName];
    const count = Object.values(getManagedItems(kind)).filter(item => item.tags?.includes(tagName)).length;
    return `<label class="th-radio-label" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;cursor:pointer;">
      <input type="radio" name="export-tag" value="${escAttr(tagName)}" style="accent-color:${tag.color}">
      <span class="th-tag-color-dot" style="background:${tag.color}"></span>
      <span>${esc(tagName)}</span>
      <span style="color:#999;margin-left:auto;">${count} 张</span>
    </label>`;
  }).join('');

  const html = `<div style="padding:16px;">
    <div style="margin-bottom:16px;font-weight:500;">选择要导出的标签</div>
    <div style="max-height:300px;overflow-y:auto;">
      <label class="th-radio-label" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;cursor:pointer;">
        <input type="radio" name="export-tag" value="__no_tag__" checked>
        <span class="th-tag-color-dot" style="background:#ccc;border:1px dashed #999;"></span>
        <span>无标签</span>
      </label>
      ${optionsHtml}
    </div>
    <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
      <button class="th-btn-sm th-btn-cancel" id="export-tag-cancel">取消</button>
      <button class="th-btn-sm th-btn-save" id="export-tag-confirm">确认导出</button>
    </div>
  </div>`;

  openModal2(`按标签导出 · ${cfg.label}`, html, { maxWidth: '400px' });

  qs('#export-tag-cancel')?.addEventListener('click', closeModal2);
  qs('#export-tag-confirm')?.addEventListener('click', () => {
    const selected = qsa<HTMLInputElement>('input[name="export-tag"]:checked')[0]?.value;
    if (!selected) { toastr?.warning?.('请选择标签'); return; }
    exportStashKindByTag(kind, selected);
    closeModal2();
  });
}

// 导入全部 kind（"全部" tab）— 解析 JSON 多 kind 或旧 TSV # [kind] 分组
export function importAllStashKinds(allTabs: ManagedKind[], text: string, applyTag?: string) {
  const allTags = loadTags();
  const kindTagsByKind: Record<string, Record<string, Tag>> = {};
  for (const kind of allTabs) kindTagsByKind[kind] = allTags[kind] || {};
  const parsed = parseManagedImport(text, kindTagsByKind);
  // 预加载所有 kind 数据
  for (const kind of allTabs) setCurrentManagedItems(kind, getManagedItems(kind));

  // 构建导入计划：(kind, name, item)
  type Plan = { kind: ManagedKind; name: string; item: ManagedItemV2 };
  const plan: Plan[] = [];
  // 1) 匹配 allTabs 的分组
  for (const kind of allTabs) {
    for (const { name, item } of (parsed.byKind[kind] || [])) plan.push({ kind, name, item });
  }
  // 2) 单 kind JSON 数组（byKind['__default__']）→ 物品
  if (parsed.byKind['__default__']?.length) {
    for (const { name, item } of parsed.byKind['__default__']) plan.push({ kind: 'stash-item', name, item });
  }
  // 3) 孤儿分组：导出文件里有但本地已不存在的自定义 kind（如已删除）→ 归档到未分类
  for (const [kindKey, items] of Object.entries(parsed.byKind)) {
    if (kindKey === '__default__') continue;
    if (allTabs.includes(kindKey as ManagedKind)) continue;
    for (const { name, item } of items) plan.push({ kind: 'stash-uncategorized', name, item });
  }

  // 反馈2：同名卡片用一次确认统一处理（确定=全部覆盖，取消=全部跳过）
  const existingCount = plan.filter(p => getManagedItems(p.kind)[p.name]).length;
  let overwrite = false;
  if (existingCount > 0) {
    overwrite = confirm(`检测到 ${existingCount} 条同名卡片已存在。\n点击「确定」全部覆盖，点击「取消」全部跳过。`);
  }

  let imported = 0;
  let failed = 0;
  let skippedOverwrite = 0;
  for (const { kind, name, item } of plan) {
    try {
      const existing = getManagedItems(kind);
      if (existing[name]) {
        if (!overwrite) { skippedOverwrite++; continue; }
      }
      // 应用自动打标签
      if (applyTag) {
        const newTags = [...(item.tags || [])];
        if (!newTags.includes(applyTag)) newTags.push(applyTag);
        item.tags = newTags;
      }
      addManagedItem(kind, name, item); imported++;
    } catch { failed++; }
  }
  reportImportResult(imported, failed, '储藏间', parsed.warnTags, skippedOverwrite);
}