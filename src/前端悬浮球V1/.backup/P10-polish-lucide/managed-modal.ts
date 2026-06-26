// location/event/dlc 共用 managed modal 总览 + 编辑 + 关联（解耦阶段 1a）。
// 从 status-bar-init.ts 纯移动；行为保持一致。
//
// 可变全局归属（§4.1/§4.2）：
// - 移入本模块（1a 专属，仅 1a 内部用）：currentSortMode / mainModalSnapshot / SORT_PREFS_KEY /
//   SEARCH_HISTORY_KEY / 类型 SortMode / SearchMode。
// - 留主文件（跨模块共享，whole-reassigned）：currentFilterTag（getCurrentFilterTag/setCurrentFilterTag）、
//   currentlyCollapsed（getCurrentlyCollapsed/setCurrentlyCollapsed）——本模块经 getter 读、setter 写，防引用断开。
// - 留主文件（对象引用型，仅属性读写 §4.1）：showRecentOnly / showFavOnly / batchMode / batchSelection ——直接 import 同一引用。
//
// 循环依赖：本模块从 '../status-bar-init' import 主文件私有函数（tavernMacro/bindManagedCardEvents 等，
// 函数体内延迟调用，ESM live binding 安全，仿 1b/1c/1d 先例）。1a-2 搬入 bindManagedCardEvents 后删除该过渡 import。
// ================================================================
import { qs, qsa, esc, escAttr, __doc, closestWithin, enteredWithin, leftWithin } from '../lib/dom-utils';
import { type ManagedKind, MANAGED_CFG } from '../lib/config';
// 1g 地点/事件 hover 已抽至 ./hover-tip（阶段 1g）
import { showLocHover, hideLocHover } from './hover-tip';
import {
  type ManagedItemV2,
  type ManagedEntryState,
  type InspectorEntry,
  type Tag,
  managedEntryStates,
  getManagedItems,
  setCurrentManagedItems,
  getCurrentManagedItems,
  addManagedItem,
  deleteManagedItem,
  toggleFavorite,
  copyManagedItem,
  loadTags,
  loadBucketCollapsed,
  saveBucketCollapsed,
  getStashKindCfg,
} from '../lib/managed-store';
import {
  safeGetCharWorldbookNames,
  safeGetWorldbook,
  safeUpdateWorldbookWith,
  safeTriggerSlash,
} from '../lib/tavern-api';
// 循环依赖（ESM live binding + 函数体内延迟调用，仿 1b/1c/1d 先例）：
// 本模块从主文件 import 私有函数；主文件从本模块 import 入口函数；stash-modal/tag-manager/stash-io 双向互 import。
import {
  type AddKind,
  tavernMacro,
  openModal,
  openModal2,
  closeModal2,
  getNPCs,
  getUserKey,
  commitAdd,
  getDefaultEntry,
  getCurrentStatusData,
  getAvatarImages,
  getCurrentFilterTag,
  setCurrentFilterTag,
  getCurrentlyCollapsed,
  setCurrentlyCollapsed,
  showRecentOnly,
  showFavOnly,
  batchMode,
  batchSelection,
} from '../status-bar-init';
import { openStashModal, getStatusStashAllTab, STASH_FIXED_KINDS } from './stash-modal';
import { openTagManagerModal, openBatchTagSelectModal, renderTagFilterBar } from './tag-manager';
import {
  type ParsedImport,
  downloadText,
  serializeManagedItems,
  parseManagedImport,
  reportImportResult,
  readInitialDataFromWorldbook,
  mergeInitialDataIntoLocal,
  openReadInitialConfirmModal,
  openWriteInitialDataModal,
} from './stash-io';

// ==================== 工具 ====================
export function getCharWorldbookList(): string[] {
  const books=safeGetCharWorldbookNames('current');
  return [books.primary,...books.additional].filter((name): name is string=>!!name);
}

export function parseManagedEntryName(entryName:string): {kind:ManagedKind|null; name:string} {
  for(const kind of Object.keys(MANAGED_CFG) as ManagedKind[]){
    const cfg=MANAGED_CFG[kind];
    if(entryName.startsWith(cfg.prefix)) return {kind,name:entryName.slice(cfg.prefix.length).trim()};
  }
  return {kind:null,name:entryName};
}

export function strategyLabel(type:string): string {
  if(type==='constant') return '蓝灯';
  if(type==='selective') return '绿灯';
  if(type==='vectorized') return '向量';
  return type||'未知';
}
export function positionLabel(type:string): string {
  const map:Record<string,string>={
    before_character_definition:'角色定义前', after_character_definition:'角色定义后',
    before_example_messages:'示例消息前', after_example_messages:'示例消息后',
    before_author_note:'作者注释前', after_author_note:'作者注释后',
    at_depth:'指定深度', outlet:'出口',
  };
  return map[type]||type||'未知';
}
export function keysToText(keys:any[]): string { return (keys||[]).map(k=>String(k)).join('\n'); }
export function textToKeys(text:string): string[] { return text.split(/\r?\n|,/).map(s=>s.trim()).filter(Boolean); }
export function nullableNumberFromInput(value:string): number|null { const t=value.trim(); if(!t) return null; const n=Number(t); return isNaN(n)?null:n; }
export function numberFromInput(value:string, fallback:number): number { const n=Number(value); return isNaN(n)?fallback:n; }
export function boolFromSelect(value:string): boolean { return value==='true'; }

// ==================== 识别器 / 刷新 / 开关世界书条目 ====================
export async function loadInspectorEntries(): Promise<InspectorEntry[]> {
  const books=getCharWorldbookList();
  const result:InspectorEntry[]=[];
  for(const book of books){
    const entries=await safeGetWorldbook(book);
    for(const entry of entries){
      const managed=parseManagedEntryName(entry.name);
      result.push({worldbookName:book,entry,managedKind:managed.kind,managedName:managed.name});
    }
  }
  return result;
}

export async function updateInspectorEntry(worldbookName:string, uid:number, updater:(entry:WorldbookEntry)=>WorldbookEntry) {
  await safeUpdateWorldbookWith(worldbookName, entries=>entries.map(entry=>entry.uid===uid?updater(entry):entry), {render:'debounced'});
}

function inspectorSortRank(entry:WorldbookEntry): number {
  if(!entry.enabled) return 2;
  return entry.strategy?.type==='selective'?1:0;
}
export function sortInspectorEntries(entries:InspectorEntry[]): InspectorEntry[] {
  return [...entries].sort((a,b)=>{
    const ra=inspectorSortRank(a.entry);
    const rb=inspectorSortRank(b.entry);
    if(ra!==rb) return ra-rb;
    const oa=a.entry.position?.order??0;
    const ob=b.entry.position?.order??0;
    if(oa!==ob) return ob-oa;
    return b.entry.name.localeCompare(a.entry.name,'zh-Hans-CN');
  });
}

export async function refreshManagedStatesAfterWorldbookEdit() {
  await safeRefreshManagedEntryStates('location');
  await safeRefreshManagedEntryStates('event');
}

async function refreshManagedEntryStates(kind:ManagedKind): Promise<Record<string,ManagedEntryState>> {
  const cfg=MANAGED_CFG[kind];
  const names=Object.keys(getManagedItems(kind));
  const states: Record<string,ManagedEntryState> = {};
  for(const name of names) states[name]={bound:false,enabled:false,count:0,enabledCount:0,worldbookNames:[]};
  const books=getCharWorldbookList();
  for(const book of books){
    const entries=await safeGetWorldbook(book);
    for(const entry of entries){
      if(!entry.name.startsWith(cfg.prefix)) continue;
      const itemName=entry.name.slice(cfg.prefix.length).trim();
      if(!(itemName in states)) continue;
      const state=states[itemName];
      state.bound=true;
      state.count++;
      if(entry.enabled){ state.enabled=true; state.enabledCount++; }
      if(!state.worldbookNames.includes(book)) state.worldbookNames.push(book);
    }
  }
  managedEntryStates[kind]=states;
  return states;
}

export async function safeRefreshManagedEntryStates(kind:ManagedKind) {
  try {
    await refreshManagedEntryStates(kind);
  } catch(e) {
    managedEntryStates[kind]={};
    console.warn(`[此间天地] ${MANAGED_CFG[kind].label}世界书绑定状态刷新失败`,e);
    toastr?.warning?.(`${MANAGED_CFG[kind].label}绑定状态刷新失败，请确认当前角色卡已绑定世界书`);
  }
}

export async function toggleManagedWorldbookEntry(kind:ManagedKind, name:string, desc:string): Promise<boolean|null> {
  const cfg=MANAGED_CFG[kind];
  const targetName=cfg.prefix+name;
  const books=getCharWorldbookList();
  if(!books.length){ toastr?.warning?.('当前角色卡没有绑定世界书'); return null; }
  const currentState=managedEntryStates[kind][name];
  const nextEnabled=!currentState?.enabled;
  let touched=0;
  for(const book of books){
    await safeUpdateWorldbookWith(book, entries=>entries.map(entry=>{
      const matched=entry.name.startsWith(cfg.prefix)&&entry.name.slice(cfg.prefix.length).trim()===name;
      if(!matched) return entry;
      touched++;
      return {...entry, enabled:nextEnabled};
    }), {render:'debounced'});
  }
  if(!touched){
    toastr?.warning?.(`未找到世界书条目：${targetName}`);
    await safeRefreshManagedEntryStates(kind);
    return null;
  }
  await safeRefreshManagedEntryStates(kind);
  toastr?.success?.(`${nextEnabled?'已开启':'已关闭'}${cfg.label}：${name}`);
  if(nextEnabled){
    const text=kind==='location'
      ? `<前往${name}，该地点简介：${desc}>`
      : `<已开启事件：${name}，${desc}>`;
    try { safeTriggerSlash('/setinput '+tavernMacro('input')+' '+text); } catch(e) { void e; }
  }
  return nextEnabled;
}

export async function disableAllManagedWorldbookEntries(kind:ManagedKind): Promise<number|null> {
  const cfg=MANAGED_CFG[kind];
  const books=getCharWorldbookList();
  if(!books.length){ toastr?.warning?.('当前角色卡没有绑定世界书'); return null; }
  let touched=0;
  let changed=0;
  try {
    for(const book of books){
      await safeUpdateWorldbookWith(book, entries=>entries.map(entry=>{
        if(!entry.name.startsWith(cfg.prefix)) return entry;
        touched++;
        if(entry.enabled) changed++;
        return {...entry, enabled:false};
      }), {render:'debounced'});
    }
    await safeRefreshManagedEntryStates(kind);
    if(!touched){ toastr?.info?.(`没有找到${cfg.label}世界书条目`); return 0; }
    if(!changed){ toastr?.info?.(`所有${cfg.label}条目已经处于关闭状态`); return 0; }
    toastr?.success?.(`已关闭 ${changed} 个${cfg.label}世界书条目`);
    return changed;
  } catch(e) {
    console.warn(`[此间天地] 批量关闭${cfg.label}世界书条目失败`,e);
    toastr?.error?.(`批量关闭${cfg.label}失败`);
    return null;
  }
}

// ==================== 排序 + 最近（§10.6）====================
const SORT_PREFS_KEY = '_th_managed_sort_prefs_v1';
export type SortMode = 'az' | 'za' | 'recent' | 'tag';
let currentSortMode: Record<ManagedKind, SortMode> = {} as any;

export function loadSortMode(kind: ManagedKind): SortMode {
  if (currentSortMode[kind]) return currentSortMode[kind];
  try {
    const raw = localStorage.getItem(SORT_PREFS_KEY);
    if (raw) {
      const all = JSON.parse(raw) as Record<ManagedKind, SortMode>;
      currentSortMode[kind] = all[kind] || 'az';
    }
  } catch { }
  return currentSortMode[kind] || 'az';
}
export function saveSortMode(kind: ManagedKind, mode: SortMode) {
  currentSortMode[kind] = mode;
  try {
    const raw = localStorage.getItem(SORT_PREFS_KEY);
    const all: Record<ManagedKind, SortMode> = raw ? JSON.parse(raw) : {} as any;
    all[kind] = mode;
    localStorage.setItem(SORT_PREFS_KEY, JSON.stringify(all));
  } catch { }
}
function sortBucketEntries(kind: ManagedKind, entries: [string, ManagedItemV2][]): [string, ManagedItemV2][] {
  const mode = loadSortMode(kind);
  // 收藏优先（桶内置顶）
  const fav = entries.filter(([, i]) => i.favorite);
  const nonFav = entries.filter(([, i]) => !i.favorite);
  // 组内排序：有 order 的按 order，无 order 的按 mode
  const sortFn = (a: [string, ManagedItemV2], b: [string, ManagedItemV2]): number => {
    const aHasOrder = a[1].order != null;
    const bHasOrder = b[1].order != null;
    if (aHasOrder && bHasOrder) return (a[1].order || 0) - (b[1].order || 0);
    if (aHasOrder) return -1; // 有 order 的排前面
    if (bHasOrder) return 1;
    // 无 order，按 mode
    if (mode === 'az') return a[0].localeCompare(b[0], 'zh');
    if (mode === 'za') return b[0].localeCompare(a[0], 'zh');
    if (mode === 'recent') return (b[1].lastEdited || 0) - (a[1].lastEdited || 0);
    return a[0].localeCompare(b[0], 'zh'); // 'tag' 模式按名字兜底
  };
  return [...fav.sort(sortFn), ...nonFav.sort(sortFn)];
}

// ==================== 桶折叠/展开辅助函数（Phase 2）====================
export function bindCollapseToggleEvents(kind: ManagedKind, _idPrefix: string) {
  qsa('[data-collapse-toggle]').forEach(header => {
    header.addEventListener('click', () => {
      const tagName = header.getAttribute('data-collapse-toggle') || '';
      const isCollapsed = !getCurrentlyCollapsed()[tagName];
      // 更新本地状态
      getCurrentlyCollapsed()[tagName] = isCollapsed;
      // 持久化到 localStorage
      const collapsed = loadBucketCollapsed();
      if (!collapsed[kind]) collapsed[kind] = {};
      if (isCollapsed) collapsed[kind][tagName] = true;
      else delete collapsed[kind][tagName];
      saveBucketCollapsed(collapsed);
      // 更新视觉状态
      updateBucketVisual(tagName);
    });
  });
}

export function setAllBucketsCollapsed(kind: ManagedKind, value: boolean) {
  const allTags = loadTags();
  const kindTags = allTags[kind] || {};
  const collapsed = loadBucketCollapsed();
  if (!collapsed[kind]) collapsed[kind] = {};

  for (const tagName of Object.keys(kindTags)) {
    if (value) collapsed[kind][tagName] = true;
    else delete collapsed[kind][tagName];
    getCurrentlyCollapsed()[tagName] = value;
  }
  // 未分类桶
  if (value) collapsed[kind][''] = true;
  else delete collapsed[kind][''];
  getCurrentlyCollapsed()[''] = value;

  saveBucketCollapsed(collapsed);
}

function updateBucketVisual(tagName: string) {
  const group = qs(`[data-bucket-tag="${escAttr(tagName)}"]`);
  if (!group) return;
  const header = group.querySelector('.th-tag-group-header') as HTMLElement | null;
  const isCollapsed = !!getCurrentlyCollapsed()[tagName];
  if (header) header.dataset.collapsed = String(isCollapsed);
}

export function updateAllBucketVisuals() {
  for (const tagName of Object.keys(getCurrentlyCollapsed())) {
    updateBucketVisual(tagName);
  }
}

// 从 desc（可能是 JSON 结构化字符串）中提取显示用文本
export function getDisplayDesc(desc: string): string {
  try {
    const parsed = JSON.parse(desc);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed['简介'] || parsed['效果'] || parsed['外观详情'] || desc;
    }
  } catch { /* not JSON */ }
  return desc;
}

// ==================== 渲染常量（B6 抽取，零行为变化）====================
const RECENT_LIMIT = 10;            // "最近"模式平铺条目数
const TOKENS_PER_ENABLED = 50;      // 已开启条目 token 预估系数
const SCAN_CONTENT_PREVIEW = 100;   // 扫描未绑定条目内容预览长度

function renderManagedCards(kind:ManagedKind, entries: [string, ManagedItemV2][], kindTags: Record<string, Tag>): string {
  // 自定义 stash kind 不在 MANAGED_CFG 里，统一用 getStashKindCfg（返回完整字段）。
  const cfg = getStashKindCfg(kind);
  const isStash = kind.startsWith('stash-');

  return entries.map(([name, item])=>{
    const desc = item.desc;
    const fullDisplayDesc = isStash ? getDisplayDesc(desc) : desc;
    const hasCustomInject = !!item.inject;
    const state=managedEntryStates[kind]?.[name];
    const bound=!!state?.bound;
    const enabled=!!state?.enabled;
    const isFav = !!item.favorite;

    // 世界书绑定三态：绿(开启)、黄(绑定未开启)、灰(未绑定)
    let bindCls = 'unbound';
    if (enabled) bindCls = 'bound enabled';
    else if (bound) bindCls = 'bound partial';

    const favClass = isFav ? ' favorite' : '';
    const cls=`th-location-card th-managed-card ${kind==='event'?'th-event-card':''} ${bindCls}${favClass}`;
    const title=isStash?fullDisplayDesc:(bound?`已绑定 ${state.count} 个条目，已开启 ${state.enabledCount} 个`:`未找到世界书条目：${cfg.prefix}${name}`);

    // 标签色点
    const tagDots = (item.tags || []).filter(t => kindTags[t]).map(tagName => {
      const color = kindTags[tagName].color;
      return `<span class="th-card-tag-dot" data-jump-tag="${escAttr(tagName)}" style="background:var(--${color || 'tx3'})" title="${escAttr(tagName)}"></span>`;
    }).join('');

    // hover 工具栏按钮
    let actionsHtml = '';
    if (!isStash) {
      actionsHtml += `<button class="th-card-act" data-card-act="toggle" title="${enabled?'关闭':'开启'}对应世界书条目"><i class="fa-solid ${enabled?'fa-toggle-on':'fa-toggle-off'}"></i></button>`;
      actionsHtml += `<button class="th-card-act" data-card-act="links" title="查看/开关关联卡片"><i class="fa-solid fa-link"></i></button>`;
    }
    actionsHtml += `<button class="th-card-act" data-card-act="edit" title="编辑"><i class="fa-solid fa-pen"></i></button>`;
    actionsHtml += `<button class="th-card-act th-card-act-fav" data-card-act="fav" title="${isFav?'取消收藏':'收藏'}"><i class="fa-solid ${isFav?'fa-star':'fa-star-half-stroke'}"></i></button>`;
    actionsHtml += `<button class="th-card-act" data-card-act="copy" title="复制"><i class="fa-solid fa-copy"></i></button>`;
    actionsHtml += `<button class="th-card-act th-card-act-danger" data-card-act="del" title="删除${cfg.label}"><i class="fa-solid fa-xmark"></i></button>`;

    const isSelected = batchSelection[kind]?.has(name);
    // P4fix3 反馈1：删左上角类型图标；名称放最上；绑定点+标签点收进名称行右上角
    const titleDots = `${isStash ? '' : `<span class="th-bind-dot ${bindCls}"></span>`}${tagDots?`<span class="th-managed-card-tags">${tagDots}</span>`:''}`;
    return `<div class="${cls}" data-managed-kind="${kind}" data-managed-name="${escAttr(name)}" data-managed-desc="${escAttr(desc)}" title="${escAttr(title)}">
      ${batchMode[kind] ? `<input type="checkbox" class="th-card-checkbox" data-card-checkbox-name="${escAttr(name)}" ${isSelected ? 'checked' : ''} style="margin-right:8px;cursor:pointer">` : ''}
      <div class="th-managed-card-main" style="flex:1;min-width:0">
        <div class="th-managed-card-title" style="font-weight:700;font-size:14px;line-height:1.3">
          <span class="th-managed-card-name">${esc(name)}</span>
          ${hasCustomInject ? ' <i class="fa-solid fa-pen-fancy th-inject-badge" title="已自定义注入模板" style="font-size:10px;color:var(--mint);margin-left:4px"></i>' : ''}
          ${isFav ? ' <i class="fa-solid fa-star th-fav-star" style="font-size:10px;color:var(--gold);margin-left:4px"></i>' : ''}
          ${titleDots ? `<span class="th-card-title-dots">${titleDots}</span>` : ''}
        </div>
        <div class="th-managed-card-preview" style="margin-top:2px">${esc(fullDisplayDesc)}</div>
      </div>
      <div class="th-card-actions">${actionsHtml}</div>
    </div>`;
  }).join('');
}

// ==================== 按桶分组渲染卡片（Phase 2）====================
export function renderManagedBuckets(kind: ManagedKind, _idPrefix: string, query: string = ''): string {
  const allTags = loadTags();
  const kindTags = allTags[kind] || {};
  const items = getCurrentManagedItems(kind);
  const entries = Object.entries(items);

  // 最近10张模式：跨桶平铺显示最近编辑的10张（反馈3：搜索生效——先过滤再按时间取前10）
  if (showRecentOnly[kind]) {
    const parsedRecent = parseSearchQuery(query);
    const pool = parsedRecent.term ? entries.filter(([name, item]) => entryMatchesSearch(name, item, parsedRecent)) : entries;
    const recent = pool
      .sort((a, b) => (b[1].lastEdited || 0) - (a[1].lastEdited || 0))
      .slice(0, RECENT_LIMIT);
    if (!recent.length && parsedRecent.term) {
      return `<div class="th-empty" style="padding:40px 20px;text-align:center"><i class="fa-solid fa-inbox" style="font-size:24px;color:var(--tx3);display:block;margin-bottom:12px"></i><br>没有找到匹配「${esc(parsedRecent.term)}」的最近条目</div>`;
    }
    return renderManagedCards(kind, recent, kindTags);
  }

  // 只看收藏模式过滤
  const filteredEntries = showFavOnly[kind] ? entries.filter(([_, item]) => item.favorite) : entries;

  // 按标签分组（搜索过滤应用在最终渲染前，先按原始数据分组）
  const buckets: Record<string, [string, ManagedItemV2][]> = {};
  // 标签桶（按 order 排序，无 order 按字母）
  for (const tagName of Object.keys(kindTags)) {
    buckets[tagName] = [];
  }
  buckets[''] = []; // 未分类桶

  // 分配 item 到桶
  const parsed = parseSearchQuery(query);
  for (const [name, item] of filteredEntries) {
    // 检查搜索过滤（支持 tag:/desc: 语法）
    if (!entryMatchesSearch(name, item, parsed)) continue;

    if (!item.tags || item.tags.length === 0) {
      buckets[''].push([name, item]);
    } else {
      for (const tagName of item.tags) {
        if (buckets[tagName]) { // 仅分配到存在的标签桶
          buckets[tagName].push([name, item]);
        }
      }
    }
  }

  // 决定显示哪些桶
  let bucketNamesToRender: string[];
  if (getCurrentFilterTag() === null) {
    // 显示全部桶（非空）
    bucketNamesToRender = Object.keys(kindTags).concat(['']).filter(tagName => buckets[tagName]?.length > 0);
  } else {
    // 只显示筛选的桶
    bucketNamesToRender = [getCurrentFilterTag() as string];
  }

  // 渲染桶
  let h = '';
  for (const bucketTag of bucketNamesToRender) {
    const bucketItems = buckets[bucketTag];
    if (!bucketItems || bucketItems.length === 0) continue;

    const isCollapsed = !!getCurrentlyCollapsed()[bucketTag];
    const tag = kindTags[bucketTag];
    const bucketName = bucketTag === '' ? '未分类' : bucketTag;
    const bucketColor = bucketTag === '' ? 'var(--tx3)' : `var(--${tag?.color || 'tx3'})`;

    // 桶 header
    h += `<div class="th-tag-group" data-bucket-tag="${escAttr(bucketTag)}">
      <div class="th-tag-group-header" data-collapse-toggle="${escAttr(bucketTag)}" data-collapsed="${isCollapsed}">
        <i class="fa-solid fa-chevron-down th-tag-group-caret"></i>
        <span class="th-tag-color-swatch th-tag-group-color" style="background:${bucketColor}"></span>
        <span class="th-tag-group-name">${esc(bucketName)}</span>
        <span class="th-tag-group-count">(${bucketItems.length})</span>
      </div>
      <div class="th-tag-group-content">`;
    // 桶内卡片（收藏置顶 + 排序）
    h += renderManagedCards(kind, sortBucketEntries(kind, bucketItems), kindTags);
    h += `</div></div>`;
  }

  // 空结果
  if (!h) {
    const total = entries.length;
    const cfg = getStashKindCfg(kind);
    if (total === 0) {
      h = `<div class="th-empty th-empty-guide" style="padding:40px 20px;text-align:center"><i class="fa-solid fa-folder-open" style="font-size:32px;color:var(--tx3);display:block;margin-bottom:12px"></i><br>暂无${cfg.label}内容<br><span class="th-empty-hint" style="font-size:13px;color:var(--tx3);font-style:normal">点右上角 <i class="fa-solid fa-plus" style="font-size:11px;color:var(--pink)"></i> 新建，或 <i class="fa-solid fa-upload" style="font-size:11px;color:var(--pink)"></i> 导入预设</span></div>`;
    } else {
      h = `<div class="th-empty" style="padding:40px 20px;text-align:center"><i class="fa-solid fa-inbox" style="font-size:24px;color:var(--tx3);display:block;margin-bottom:12px"></i><br>没有找到匹配「${parsed.term}」的条目${getCurrentFilterTag()?`（标签：${getCurrentFilterTag()}）`:''}</div>`;
    }
  }

  return h;
}

export function rerenderManagedGrid(kind:ManagedKind, idPrefix:string, query='') {
  const grid=qs(`#${idPrefix}-grid`);
  if(grid) grid.innerHTML=renderManagedBuckets(kind,idPrefix,query);
  bindManagedCardEvents(kind,idPrefix);
  bindCollapseToggleEvents(kind,idPrefix); // 重新绑定折叠事件
}

export function idPrefixForKind(kind: ManagedKind): string {
  if (kind.startsWith('stash-')) return 'th-stash';
  if (kind === 'location') return 'th-loc';
  if (kind === 'event') return 'th-event';
  return 'th-dlc';
}

// ==================== 搜索增强（§10.6）====================
type SearchMode = 'all' | 'tag' | 'desc';
function parseSearchQuery(raw: string): { mode: SearchMode; term: string } {
  const r = raw.trim().toLowerCase();
  if (r.startsWith('tag:')) return { mode: 'tag', term: r.slice(4).trim() };
  if (r.startsWith('desc:')) return { mode: 'desc', term: r.slice(5).trim() };
  return { mode: 'all', term: r };
}
// 反馈3：搜索匹配统一谓词（最近模式与桶模式共用，避免最近模式下搜索失效）
function entryMatchesSearch(name: string, item: ManagedItemV2, parsed: { mode: SearchMode; term: string }): boolean {
  if (!parsed.term) return true;
  const nameHit = name.toLowerCase().includes(parsed.term);
  const descHit = getDisplayDesc(item.desc).toLowerCase().includes(parsed.term);
  const tagHit = (item.tags || []).some(t => t.toLowerCase().includes(parsed.term));
  if (parsed.mode === 'tag') return tagHit;
  if (parsed.mode === 'desc') return descHit;
  return nameHit || descHit || tagHit;
}

// ================================================================
// 1a-2: 总览 modal + bind + 编辑 + 关联 + 配发（从 status-bar-init.ts 纯移动）
// currentFilterTag/currentlyCollapsed/currentData/avatarImages 经 getter/setter（§4.2 whole-reassigned）。
// ================================================================

async function openManagedModal(kind:ManagedKind, filterTag:string|null=null) {
  const cfg=MANAGED_CFG[kind];
  setCurrentManagedItems(kind,getManagedItems(kind));
  await safeRefreshManagedEntryStates(kind);
  setCurrentFilterTag(filterTag); // 设置当前筛选标签
  setCurrentlyCollapsed(loadBucketCollapsed()[kind] || {}); // 加载桶折叠状态

  const idPrefix=kind==='location'?'th-loc':kind==='event'?'th-event':'th-dlc';
  let h = '';
  h += `<input type="file" id="${idPrefix}-import-file" accept=".json,.txt" style="display:none">`;
  h += `<input class="th-location-search th-edit-input" type="search" id="${idPrefix}-search" placeholder="搜索${cfg.label}...">`;

  // 标签筛选栏（Phase 2）
  h += renderTagFilterBar(kind, idPrefix);

  // 按桶渲染
  h += `<div class="th-managed-grid" id="${idPrefix}-grid" data-kind="${kind}">`;
  h += renderManagedBuckets(kind, idPrefix);
  h += `</div>`;
  h += `<button class="th-location-add-btn" id="${idPrefix}-add-btn"><i class="fa-solid fa-plus"></i> 新建${cfg.label}</button>`;
  h += `<div class="th-location-add-form" id="${idPrefix}-add-form">
    <input class="th-edit-input" id="${idPrefix}-new-name" placeholder="${cfg.label}名称" maxlength="50">
    <textarea class="th-edit-textarea" id="${idPrefix}-new-desc" placeholder="${cfg.label}简介" rows="3"></textarea>
    <div class="th-loc-form-btns">
      <button class="th-loc-form-btn th-loc-form-btn-save" id="${idPrefix}-save-btn"><i class="fa-solid fa-check"></i> 保存</button>
      <button class="th-loc-form-btn th-loc-form-btn-cancel" id="${idPrefix}-cancel-btn"><i class="fa-solid fa-xmark"></i> 取消</button>
    </div>
  </div>`;

  const totalCount = Object.keys(getCurrentManagedItems(kind)).length;
  const titleIcon=kind==='location'?'fa-solid fa-compass':kind==='event'?'fa-solid fa-flag':'fa-solid fa-folder-plus';
  openModal(`<i class="${titleIcon}"></i> ${cfg.storageName} (${totalCount}) <span class="th-modal-title-actions"><button class="th-title-io-btn" id="${idPrefix}-tags-btn" title="标签管理"><i class="fa-solid fa-tags"></i></button><button class="th-title-io-btn" id="${idPrefix}-refresh-btn" title="刷新绑定状态"><i class="fa-solid fa-rotate"></i></button><button class="th-title-io-btn th-title-danger-btn" id="${idPrefix}-disable-all-btn" title="关闭全部${cfg.label}世界书条目"><i class="fa-solid fa-power-off"></i></button><button class="th-title-io-btn" id="${idPrefix}-scan-btn" title="扫描未绑定世界书条目"><i class="fa-solid fa-magnifying-glass"></i></button><button class="th-title-io-btn" id="${idPrefix}-seed-btn" title="重读初始数据：从世界书 [初始·${cfg.label}] 条目读取初始数据，增量合并到本地（不删除你已有的卡片）"><i class="fa-solid fa-seedling"></i></button><button class="th-title-io-btn" id="${idPrefix}-write-initial-btn" title="写入初始数据：将当前${cfg.label}按类别/标签写入世界书初始数据"><i class="fa-solid fa-file-import"></i></button><button class="th-title-io-btn" id="${idPrefix}-export-btn" title="导出"><i class="fa-solid fa-download"></i></button><button class="th-title-io-btn" id="${idPrefix}-import-btn" title="导入"><i class="fa-solid fa-upload"></i></button></span>`, h);

  setTimeout(() => { bindManagedModalEvents(kind,idPrefix); }, 100);
}

export function openLocationsModal() { void openManagedModal('location'); }
export function openEventsModal() { void openManagedModal('event'); }
export function openDlcsModal() { void openManagedModal('dlc'); }

// 扫描未绑定世界书条目模态框
async function openScanUnboundWorldbookEntriesModal(kind: ManagedKind) {
  const cfg = MANAGED_CFG[kind];
  const currentItems = getManagedItems(kind);
  const currentNames = new Set(Object.keys(currentItems));

  // 扫描所有世界书，找未绑定的条目
  interface UnboundEntry {
    name: string;
    content: string;
    worldbook: string;
  }
  const unbound: UnboundEntry[] = [];

  try {
    const books = getCharWorldbookList();
    for (const book of books) {
      const entries = await safeGetWorldbook(book);
      for (const entry of entries) {
        if (!entry.name.startsWith(cfg.prefix)) continue;
        const itemName = entry.name.slice(cfg.prefix.length).trim();
        if (!itemName) continue;
        if (!currentNames.has(itemName)) {
          unbound.push({ name: itemName, content: entry.content, worldbook: book });
        }
      }
    }
  } catch (e) {
    console.warn('[此间天地] 扫描未绑定条目失败', e);
    toastr?.error?.('扫描失败');
    return;
  }

  // 扫描模态框 html
  let h = '';
  if (!unbound.length) {
    h = `<div class="th-empty" style="padding:40px 20px;"><i class="fa-solid fa-check-circle" style="color:var(--mint);font-size:48px;margin-bottom:16px;"></i><br>未发现未绑定的${cfg.label}世界书条目<br><span style="font-size:13px;color:var(--tx2);margin-top:8px;display:block;">所有已识别条目均已绑定至此面板</span></div>`;
  } else {
    h = `<div style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">
      <span style="font-size:13px;font-weight:800;color:var(--tx2);">发现 ${unbound.length} 个未绑定条目</span>
      <label style="font-size:12px;color:var(--tx3);cursor:pointer;display:flex;align-items:center;gap:4px;">
        <input type="checkbox" id="th-scan-select-all" checked> 全选
      </label>
    </div>
    <div style="max-height:380px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;">`;
    for (let i = 0; i < unbound.length; i++) {
      const entry = unbound[i];
      h += `<div class="th-wb-row" style="align-items:flex-start;">
        <div style="display:flex;align-items:flex-start;gap:10px;flex:1;min-width:0;">
          <input type="checkbox" class="th-scan-item-check" data-index="${i}" checked style="margin-top:4px;accent-color:var(--pink);">
          <div style="min-width:0;flex:1;">
            <div style="font-weight:900;color:var(--tx);font-size:14px;">${esc(entry.name)}</div>
            <div style="font-size:12px;color:var(--tx3);margin-top:2px;line-height:1.5;word-break:break-word;">${esc(Array.from(entry.content).slice(0, SCAN_CONTENT_PREVIEW).join(''))}${entry.content.length > SCAN_CONTENT_PREVIEW ? '...' : ''}</div>
            <div style="font-size:11px;color:var(--lav);margin-top:3px;"><i class="fa-solid fa-book"></i> ${esc(entry.worldbook)}</div>
          </div>
        </div>
      </div>`;
    }
    h += `</div>`;
  }

  const titleIcon = kind === 'location' ? 'fa-solid fa-compass' : kind === 'event' ? 'fa-solid fa-flag' : 'fa-solid fa-folder-plus';
  openModal2(`<i class="${titleIcon}"></i> 扫描未绑定${cfg.label}`, h);

  if (!unbound.length) return;

  // 绑定事件
  setTimeout(() => {
    // 全选/反选
    const selectAllCheckbox = qs<HTMLInputElement>('#th-scan-select-all');
    const checkboxes = qsa<HTMLInputElement>('.th-scan-item-check');
    selectAllCheckbox?.addEventListener('change', () => {
      checkboxes.forEach(cb => { cb.checked = selectAllCheckbox.checked; });
    });

    // 单个点击时更新全选状态
    checkboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        const allChecked = Array.from(checkboxes).every(c => c.checked);
        if (selectAllCheckbox) selectAllCheckbox.checked = allChecked;
      });
    });

    // 一键添加按钮
    const addBtn = document.createElement('button');
    addBtn.className = 'th-loc-form-btn th-loc-form-btn-save';
    addBtn.style.cssText = 'width:100%;margin-top:12px;';
    addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> 一键添加选中条目';
    addBtn.addEventListener('click', () => {
      const selected = Array.from(checkboxes).filter(cb => cb.checked).map(cb => unbound[parseInt(cb.getAttribute('data-index') || '0')]);
      if (!selected.length) { toastr?.warning?.('请至少选择一个条目'); return; }

      setCurrentManagedItems(kind, getManagedItems(kind));
      let added = 0;
      for (const entry of selected) {
        if (!currentNames.has(entry.name)) {
          // 扫描添加时只绑定名称，简介留空（不自动填入世界书内容）
          // 用户后续可手动编辑补充
          addManagedItem(kind, entry.name, '');
          added++;
        }
      }
      toastr?.success?.(`已添加 ${added} 个${cfg.label}`);
      closeModal2();
      void openManagedModal(kind);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'th-loc-form-btn th-loc-form-btn-cancel';
    cancelBtn.style.cssText = 'width:100%;margin-top:8px;';
    cancelBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> 取消';
    cancelBtn.addEventListener('click', closeModal2);

    const body = qs('.th-modal-body-2');
    if (body) {
      body.appendChild(addBtn);
      body.appendChild(cancelBtn);
    }
  }, 60);
}


// ==================== 储藏间主 Modal（阶段 C）已抽至 modules/stash-modal.ts（阶段 1b）====================
// 储藏间导入导出/初始数据/运行时导入已抽至 ./modules/stash-io.ts

function bindManagedModalEvents(kind:ManagedKind, idPrefix:string) {
  try {
  const cfg=MANAGED_CFG[kind];
  // 标签管理按钮
  qs(`#${idPrefix}-tags-btn`)?.addEventListener('click', () => {
    openTagManagerModal(kind, idPrefix);
  });
  qs(`#${idPrefix}-refresh-btn`)?.addEventListener('click',async()=>{
    await safeRefreshManagedEntryStates(kind);
    rerenderManagedGrid(kind,idPrefix);
    toastr?.success?.(`${cfg.label}绑定状态已刷新`);
  });
  qs(`#${idPrefix}-disable-all-btn`)?.addEventListener('click',async()=>{
    if(!confirm(`确定要关闭所有已绑定的${cfg.label}世界书条目吗？`)) return;
    const result=await disableAllManagedWorldbookEntries(kind);
    if(result!==null) rerenderManagedGrid(kind,idPrefix,(qs<HTMLInputElement>(`#${idPrefix}-search`)?.value||'').trim().toLowerCase());
  });
  // 扫描未绑定世界书条目按钮
  qs(`#${idPrefix}-scan-btn`)?.addEventListener('click',async()=>{
    openScanUnboundWorldbookEntriesModal(kind);
  });
  // 重读初始数据按钮(§10.6 Build 2)
  qs(`#${idPrefix}-seed-btn`)?.addEventListener('click', () => openReadInitialConfirmModal(cfg.label, async () => {
    const btn = qs(`#${idPrefix}-seed-btn`);
    if (btn) { btn.setAttribute('disabled', 'true'); }
    try {
      const parsed = await readInitialDataFromWorldbook();
      // 只处理当前 kind 的数据(面板是按 kind 打开的)
      const kindData = parsed.byKind[kind] || [];
      if (!kindData.length) {
        toastr?.info?.(`未找到 [初始·${cfg.label}] 世界书条目，或条目内无数据`);
        return;
      }
      const singleParsed: ParsedImport = { byKind: { [kind]: kindData }, warnTags: parsed.warnTags };
      const result = await mergeInitialDataIntoLocal(singleParsed);
      // 刷新当前 kind 的 currentManagedItems + 世界书绑定状态
      setCurrentManagedItems(kind, getManagedItems(kind));
      await safeRefreshManagedEntryStates(kind);
      rerenderManagedGrid(kind, idPrefix, (qs<HTMLInputElement>(`#${idPrefix}-search`)?.value || '').trim().toLowerCase());
      let msg = `已从初始数据补入 ${result.added} 张${cfg.label}`;
      if (result.skipped) msg += `，跳过 ${result.skipped} 张（本地已存在）`;
      toastr?.success?.(msg);
      if (parsed.warnTags.length) {
        toastr?.warning?.(`初始数据含未定义标签（已忽略）：${[...new Set(parsed.warnTags)].slice(0, 5).join('、')}`);
      }
    } catch (e) {
      console.warn('[重读初始数据] 失败', e);
      toastr?.error?.('重读初始数据失败，请查看控制台');
    } finally {
      if (btn) btn.removeAttribute('disabled');
    }
  }));
  qs(`#${idPrefix}-write-initial-btn`)?.addEventListener('click', () => openWriteInitialDataModal([kind]));
  qs(`#${idPrefix}-export-btn`)?.addEventListener('click', () => {
    const items=getManagedItems(kind);
    if (!Object.keys(items).length) { toastr?.warning?.(`${cfg.label}数据为空`); return; }
    downloadText(cfg.storageName + '_' + new Date().toISOString().slice(0, 10) + '.json', serializeManagedItems(items));
    toastr?.success?.(`已导出 ${Object.keys(items).length} 个${cfg.label}`);
  });
  qs(`#${idPrefix}-import-btn`)?.addEventListener('click', () => {
    const fi=qs<HTMLInputElement>(`#${idPrefix}-import-file`);
    if(fi) fi.click();
  });
  qs(`#${idPrefix}-import-file`)?.addEventListener('change', function(this:HTMLInputElement){
    if(!this.files||!this.files.length) return;
    const reader=new FileReader();
    reader.onload=()=>{
      const text=reader.result as string;
      const allTags = loadTags();
      const kindTagsByKind: Record<string, Record<string, Tag>> = {};
      kindTagsByKind[kind] = allTags[kind] || {};
      kindTagsByKind['__default__'] = allTags[kind] || {};
      const parsed = parseManagedImport(text, kindTagsByKind, kind);
      setCurrentManagedItems(kind, getManagedItems(kind));
      let imported = 0;
      let failed = 0;
      let skippedOverwrite = 0;
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
          if (existing[name] && !overwrite) { skippedOverwrite++; continue; }
          addManagedItem(kind, name, item); imported++;
        } catch { failed++; }
      }
      reportImportResult(imported, failed, cfg.label, parsed.warnTags, skippedOverwrite);
      void openManagedModal(kind);
    };
    reader.readAsText(this.files[0],'utf-8');
    this.value='';
  });
  // 搜索框
  const searchInput = qs<HTMLInputElement>(`#${idPrefix}-search`);
  if (searchInput) {
    searchInput.addEventListener('input', function(this: HTMLInputElement) {
      rerenderManagedGrid(kind, idPrefix, this.value.trim().toLowerCase());
    });
  }

  // ==================== 标签筛选栏事件绑定（Phase 2）====================
  // 最近10张按钮
  qs('[data-recent-toggle]')?.addEventListener('click', function(this: HTMLElement) {
    showRecentOnly[kind] = !showRecentOnly[kind];
    if (showRecentOnly[kind]) {
      setCurrentFilterTag(null); // 最近模式下重置筛选
      showFavOnly[kind] = false;
      qsa('.th-tag-filter-btn[data-filter-tag]').forEach(b => b.classList.remove('active'));
      qs('[data-fav-toggle]')?.classList.remove('active');
    }
    this.classList.toggle('active', showRecentOnly[kind]);
    const grid = qs(`#${idPrefix}-grid`);
    if (grid) grid.innerHTML = renderManagedBuckets(kind, idPrefix, (qs<HTMLInputElement>(`#${idPrefix}-search`)?.value || '').trim().toLowerCase());
    bindManagedCardEvents(kind, idPrefix);
    bindCollapseToggleEvents(kind, idPrefix); // 最近模式下无桶头为 no-op;保持与筛选/重绘路径对称
  });

  // 只看收藏按钮
  qs('[data-fav-toggle]')?.addEventListener('click', function(this: HTMLElement) {
    showFavOnly[kind] = !showFavOnly[kind];
    if (showFavOnly[kind]) {
      setCurrentFilterTag(null); // 收藏模式下重置筛选
      showRecentOnly[kind] = false;
      qsa('.th-tag-filter-btn[data-filter-tag]').forEach(b => b.classList.remove('active'));
      qs('[data-recent-toggle]')?.classList.remove('active');
    }
    this.classList.toggle('active', showFavOnly[kind]);
    const grid = qs(`#${idPrefix}-grid`);
    if (grid) grid.innerHTML = renderManagedBuckets(kind, idPrefix, (qs<HTMLInputElement>(`#${idPrefix}-search`)?.value || '').trim().toLowerCase());
    bindManagedCardEvents(kind, idPrefix);
    bindCollapseToggleEvents(kind, idPrefix); // B3: 收藏模式仍渲染桶分组,补绑折叠事件否则折叠按钮失灵
  });

  // 标签筛选按钮
  qsa('.th-tag-filter-btn[data-filter-tag]').forEach(btn => {
    btn.addEventListener('click', () => {
      showRecentOnly[kind] = false; // 切到筛选时退出最近模式
      showFavOnly[kind] = false;
      qs('[data-recent-toggle]')?.classList.remove('active');
      qs('[data-fav-toggle]')?.classList.remove('active');
      const filterTag = btn.getAttribute('data-filter-tag') || '__all__';
      if (filterTag === '__all__') setCurrentFilterTag(null);
      else if (filterTag === '__none__') setCurrentFilterTag('');
      else setCurrentFilterTag(filterTag);
      // 更新 active 状态
      qsa('.th-tag-filter-btn[data-filter-tag]').forEach(b => b.classList.toggle('active', b === btn));
      // 重新渲染桶
      const grid = qs(`#${idPrefix}-grid`);
      if (grid) grid.innerHTML = renderManagedBuckets(kind, idPrefix, (qs<HTMLInputElement>(`#${idPrefix}-search`)?.value || '').trim().toLowerCase());
      bindManagedCardEvents(kind, idPrefix); // 重新绑定卡片事件
      // 绑定折叠事件（因为 DOM 重绘了）
      bindCollapseToggleEvents(kind, idPrefix);
    });
  });

  // 排序下拉
  qs<HTMLSelectElement>(`#${idPrefix}-sort`)?.addEventListener('change', function(this: HTMLSelectElement) {
    saveSortMode(kind, this.value as SortMode);
    rerenderManagedGrid(kind, idPrefix, (qs<HTMLInputElement>(`#${idPrefix}-search`)?.value || '').trim().toLowerCase());
  });

  // 全部折叠按钮
  qs(`#${idPrefix}-collapse-all`)?.addEventListener('click', () => {
    setAllBucketsCollapsed(kind, true);
    updateAllBucketVisuals();
  });

  // 全部展开按钮
  qs(`#${idPrefix}-expand-all`)?.addEventListener('click', () => {
    setAllBucketsCollapsed(kind, false);
    updateAllBucketVisuals();
  });

  // 批量模式切换按钮
  qs('[data-batch-toggle]')?.addEventListener('click', function(this: HTMLElement) {
    batchMode[kind] = !batchMode[kind];
    if (!batchSelection[kind]) batchSelection[kind] = new Set();
    this.classList.toggle('active', batchMode[kind]);
    const batchActions = qs('.th-batch-actions');
    if (batchActions) batchActions.style.display = batchMode[kind] ? 'flex' : 'none';
    rerenderManagedGrid(kind, idPrefix, (qs<HTMLInputElement>(`#${idPrefix}-search`)?.value || '').trim().toLowerCase());
  });

  // 批量操作按钮
  qsa('[data-batch-op]').forEach(btn => {
    btn.addEventListener('click', () => {
      const op = btn.getAttribute('data-batch-op');
      if (!batchSelection[kind]) batchSelection[kind] = new Set();

      switch(op) {
        case 'selectAll': {
          // 选中当前筛选/搜索结果下的所有卡片
          const items = getCurrentManagedItems(kind);
          let entries = Object.entries(items);
          // 应用搜索过滤（与 renderManagedBuckets 一致）
          const searchTerm = (qs<HTMLInputElement>(`#${idPrefix}-search`)?.value || '').trim().toLowerCase();
          if (searchTerm) {
            entries = entries.filter(([name, item]) => {
              const nameHit = name.toLowerCase().includes(searchTerm);
              const descHit = getDisplayDesc(item.desc).toLowerCase().includes(searchTerm);
              const tagHit = (item.tags || []).some(t => t.toLowerCase().includes(searchTerm));
              return nameHit || descHit || tagHit;
            });
          }
          // 应用收藏过滤
          if (showFavOnly[kind]) {
            entries = entries.filter(([, item]) => item.favorite);
          }
          // 应用标签过滤
          const ft = getCurrentFilterTag();
          if (ft !== null) {
            entries = entries.filter(([, item]) => {
              if (ft === '') return !item.tags || item.tags.length === 0;
              return !!item.tags && item.tags.includes(ft);
            });
          }
          for (const [name] of entries) {
            batchSelection[kind].add(name);
          }
          break;
        }
        case 'deselectAll':
          batchSelection[kind].clear();
          break;
        case 'delete':
          if (!batchSelection[kind].size) { toastr?.warning?.('请先选择卡片'); return; }
          if (!confirm(`确定删除选中的 ${batchSelection[kind].size} 张卡片吗？`)) return;
          for (const name of batchSelection[kind]) {
            deleteManagedItem(kind, name);
          }
          batchSelection[kind].clear();
          toastr?.success?.('删除成功');
          break;
        case 'tag':
          if (!batchSelection[kind].size) { toastr?.warning?.('请先选择卡片'); return; }
          // 打开标签选择 modal（复用现有 openTagManagerModal 逻辑）
          openBatchTagSelectModal(kind, idPrefix, Array.from(batchSelection[kind]));
          return; // 不立即重绘
        case 'export':
          if (!batchSelection[kind].size) { toastr?.warning?.('请先选择卡片'); return; }
          const items = getCurrentManagedItems(kind);
          const exportData: { name: string; desc: string; tags: string[]; inject?: string }[] = [];
          for (const name of batchSelection[kind]) {
            if (items[name]) {
              exportData.push({ name, desc: items[name].desc, tags: items[name].tags || [], inject: items[name].inject });
            }
          }
          downloadText(`批量导出_${kind}_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(exportData, null, 2));
          toastr?.success?.(`已导出 ${exportData.length} 张卡片`);
          return; // 下载不需要重绘
      }
      rerenderManagedGrid(kind, idPrefix, (qs<HTMLInputElement>(`#${idPrefix}-search`)?.value || '').trim().toLowerCase());
    });
  });

  // 绑定折叠/展开 toggle 事件
  bindCollapseToggleEvents(kind, idPrefix);

  bindManagedCardEvents(kind,idPrefix);

  qs(`#${idPrefix}-add-btn`)?.addEventListener('click', () => {
    const form = qs(`#${idPrefix}-add-form`); if (form) form.style.display = 'block';
    const btn = qs(`#${idPrefix}-add-btn`); if (btn) btn.style.display = 'none';
  });
  qs(`#${idPrefix}-cancel-btn`)?.addEventListener('click', () => {
    const form = qs(`#${idPrefix}-add-form`); if (form) form.style.display = 'none';
    const btn = qs(`#${idPrefix}-add-btn`); if (btn) btn.style.display = '';
    const nameInput = qs<HTMLInputElement>(`#${idPrefix}-new-name`); if (nameInput) nameInput.value = '';
    const descTextarea = qs<HTMLTextAreaElement>(`#${idPrefix}-new-desc`); if (descTextarea) descTextarea.value = '';
  });
  qs(`#${idPrefix}-save-btn`)?.addEventListener('click', () => {
    const nameInput = qs<HTMLInputElement>(`#${idPrefix}-new-name`);
    const descTextarea = qs<HTMLTextAreaElement>(`#${idPrefix}-new-desc`);
    const name = (nameInput?.value || '').trim();
    const desc = (descTextarea?.value || '').trim();
    if (!name) { toastr?.warning?.(`请输入${cfg.label}名称`); return; }
    if (!desc) { toastr?.warning?.(`请输入${cfg.label}简介`); return; }
    setCurrentManagedItems(kind,getManagedItems(kind));
    addManagedItem(kind, name, desc);
    void openManagedModal(kind);
  });
  } catch(e) { console.error('[bindManagedModalEvents] error:', e); }
}

function openLinksPanel(kind: ManagedKind, name: string) {
  const items = getCurrentManagedItems(kind);
  const item = items[name];
  if (!item) return;
  const links = item.links || { locations: [], events: [], dlcs: [] };

  // 统计已开启数量和 token 估算
  let totalLinked = 0;
  let totalEnabled = 0;
  const allLinked: { kind: ManagedKind; name: string; desc: string; enabled: boolean }[] = [];

  for (const locName of links.locations || []) {
    const locItem = getManagedItems('location')[locName];
    if (locItem) {
      const state = managedEntryStates['location']?.[locName];
      allLinked.push({ kind: 'location', name: locName, desc: locItem.desc, enabled: !!state?.enabled });
      totalLinked++;
      if (state?.enabled) totalEnabled++;
    }
  }
  for (const evtName of links.events || []) {
    const evtItem = getManagedItems('event')[evtName];
    if (evtItem) {
      const state = managedEntryStates['event']?.[evtName];
      allLinked.push({ kind: 'event', name: evtName, desc: evtItem.desc, enabled: !!state?.enabled });
      totalLinked++;
      if (state?.enabled) totalEnabled++;
    }
  }
  for (const dlcName of links.dlcs || []) {
    const dlcItem = getManagedItems('dlc')[dlcName];
    if (dlcItem) {
      const state = managedEntryStates['dlc']?.[dlcName];
      allLinked.push({ kind: 'dlc', name: dlcName, desc: dlcItem.desc, enabled: !!state?.enabled });
      totalLinked++;
      if (state?.enabled) totalEnabled++;
    }
  }

  const estimatedTokens = totalEnabled * TOKENS_PER_ENABLED;

  let h = `<div class="th-links-panel">
    <div class="th-links-tip">已关联 ${totalLinked} 张，已开启 ${totalEnabled} 张，预估 token ${estimatedTokens}</div>`;

  // 按 kind 分组显示（可折叠）
  const KIND_LABELS: Record<string, string> = { location: '📍 关联地点', event: '📅 关联事件', dlc: '📦 关联 DLC' };
  for (const targetKind of ['location', 'event', 'dlc'] as const) {
    const kindItems = allLinked.filter(l => l.kind === targetKind);
    if (kindItems.length === 0) continue;
    h += `<div class="th-links-group">
      <div class="th-links-group-title" data-collapse-group="${targetKind}" style="cursor:pointer;user-select:none;display:flex;align-items:center;gap:8px;">
        <i class="fa-solid fa-chevron-down th-collapse-icon" style="transition:transform 0.2s;"></i>
        ${KIND_LABELS[targetKind]}
        <span class="th-links-group-count">${kindItems.length} 张</span>
      </div>
      <div class="th-links-group-content" data-collapse-content="${targetKind}">`;
    for (const linked of kindItems) {
      const shortDesc = linked.desc.length > 30 ? linked.desc.slice(0, 30) + '…' : linked.desc;
      h += `<div class="th-links-row" data-linked-kind="${linked.kind}" data-linked-name="${escAttr(linked.name)}">
        <button class="th-links-toggle ${linked.enabled ? 'is-on' : ''}" data-toggle-link-kind="${linked.kind}" data-toggle-link-name="${escAttr(linked.name)}" title="${linked.enabled ? '点击关闭' : '点击开启'}"></button>
        <span class="th-links-name">${esc(linked.name)}</span>
        <span class="th-links-desc">${esc(shortDesc)}</span>
      </div>`;
    }
    h += `</div></div>`;
  }

  if (totalLinked === 0) {
    h += `<div class="th-links-empty">暂无关联卡片，点击编辑按钮添加关联</div>`;
  }
  h += `</div>`;

  openModal2(`<i class="fa-solid fa-link"></i> 关联管理 · ${esc(name)}`, h);

  // 绑定开关事件和折叠事件
  setTimeout(() => {
    qsa('[data-toggle-link-kind]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const linkKind = btn.getAttribute('data-toggle-link-kind') as ManagedKind;
        const linkName = btn.getAttribute('data-toggle-link-name') || '';
        const linkItem = getManagedItems(linkKind)[linkName];
        if (linkItem) {
          await toggleManagedWorldbookEntry(linkKind, linkName, linkItem.desc);
          openLinksPanel(kind, name); // 刷新面板
        }
      });
    });

    // 绑定折叠事件
    qsa('[data-collapse-group]').forEach(title => {
      title.addEventListener('click', () => {
        const kind = title.getAttribute('data-collapse-group');
        const content = qs(`[data-collapse-content="${kind}"]`);
        const icon = title.querySelector('.th-collapse-icon');
        if (content && icon) {
          const isCollapsed = (content as HTMLElement).style.display === 'none';
          (content as HTMLElement).style.display = isCollapsed ? 'block' : 'none';
          (icon as HTMLElement).style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(-90deg)';
        }
      });
    });
  }, 60);
}

export function bindManagedCardEvents(kind:ManagedKind, idPrefix:string) {
  const cfg = getStashKindCfg(kind);
  const grid=qs<HTMLElement>(`#${idPrefix}-grid`);
  if(!grid||grid.dataset.managedEventsBound==='true') return;
  grid.dataset.managedEventsBound='true';
  grid.addEventListener('click',async(e:Event)=>{
    // 批量复选框点击
    const checkbox = e.target as HTMLElement;
    if (checkbox.tagName === 'INPUT' && checkbox.getAttribute('type') === 'checkbox') {
      e.stopPropagation();
      const cardName = checkbox.getAttribute('data-card-checkbox-name') || '';
      if (!batchSelection[kind]) batchSelection[kind] = new Set();
      if ((checkbox as HTMLInputElement).checked) {
        batchSelection[kind].add(cardName);
      } else {
        batchSelection[kind].delete(cardName);
      }
      // 更新已选数量显示
      const countEl = qs('.th-batch-actions span');
      if (countEl) countEl.textContent = `已选 ${batchSelection[kind].size} 张`;
      return;
    }
    // 标签色点：跳转到该标签筛选
    const dot=closestWithin<HTMLElement>(grid,e.target,'.th-card-tag-dot');
    if(dot){
      e.stopPropagation();
      const tagName=dot.getAttribute('data-jump-tag')||'';
      if(tagName){
        setCurrentFilterTag(tagName);
        // 同步筛选栏 active 态
        qsa('.th-tag-filter-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.filterTag === tagName || b.dataset.filterTag === '__all__' && getCurrentFilterTag() === null);
        });
        rerenderManagedGrid(kind,idPrefix,(qs<HTMLInputElement>(`#${idPrefix}-search`)?.value||'').trim().toLowerCase());
      }
      return;
    }
    // 新 hover 工具栏按钮（th-card-act）
    const act=closestWithin<HTMLElement>(grid,e.target,'.th-card-act');
    if(act){
      e.stopPropagation();
      const card=act.closest('.th-managed-card') as HTMLElement|null;
      const name=card?.getAttribute('data-managed-name')||'';
      const desc=card?.getAttribute('data-managed-desc')||'';
      const cardKind=(card?.getAttribute('data-managed-kind')||kind) as ManagedKind;
      const cardCfg=MANAGED_CFG[cardKind]||cfg;
      const actType=act.getAttribute('data-card-act');
      if(!name) return;
      switch(actType){
        case 'toggle':{
          const result=await toggleManagedWorldbookEntry(cardKind,name,desc);
          if(result!==null) rerenderManagedGrid(cardKind,idPrefixForKind(cardKind),(qs<HTMLInputElement>(`#${idPrefixForKind(cardKind)}-search`)?.value||'').trim().toLowerCase());
          break;
        }
        case 'links':
          openLinksPanel(cardKind, name);
          break;
        case 'edit':
          void openManagedEditModal(cardKind, name);
          break;
        case 'fav':
          toggleFavorite(cardKind, name);
          rerenderManagedGrid(cardKind,idPrefixForKind(cardKind),(qs<HTMLInputElement>(`#${idPrefixForKind(cardKind)}-search`)?.value||'').trim().toLowerCase());
          break;
        case 'copy':{
          const newName=copyManagedItem(cardKind, name);
          if(newName){
            toastr?.success?.(`已复制为「${newName}」`);
            rerenderManagedGrid(cardKind,idPrefixForKind(cardKind),(qs<HTMLInputElement>(`#${idPrefixForKind(cardKind)}-search`)?.value||'').trim().toLowerCase());
          }
          break;
        }
        case 'del':
          if(confirm(`确定要删除${cardCfg.label}「${name}」吗？`)){
            setCurrentManagedItems(cardKind,getManagedItems(cardKind));
            deleteManagedItem(cardKind,name);
            // 删除后留在当前 tab：在"全部"tab 则刷新"全部"，否则留在该 kind（不跳回"全部"）
            if(cardKind.startsWith('stash-')) openStashModal(getStatusStashAllTab() ? 'all' : cardKind);
            else void openManagedModal(cardKind);
          }
          break;
      }
      return;
    }
    // 兼容旧结构：.th-managed-state 按钮
    const toggle=closestWithin<HTMLElement>(grid,e.target,'.th-managed-state');
    if(toggle){
      e.stopPropagation();
      const name=toggle.getAttribute('data-managed-toggle')||'';
      const card=toggle.closest('.th-managed-card') as HTMLElement|null;
      const desc=card?.getAttribute('data-managed-desc')||'';
      if(name){
        const result=await toggleManagedWorldbookEntry(kind,name,desc);
        if(result!==null) rerenderManagedGrid(kind,idPrefix,(qs<HTMLInputElement>(`#${idPrefix}-search`)?.value||'').trim().toLowerCase());
      }
      return;
    }
    // 兼容旧结构：.th-loc-delete 按钮
    const del=closestWithin<HTMLElement>(grid,e.target,'.th-loc-delete');
    if(del){
      e.stopPropagation();
      const name=del.getAttribute('data-managed-del')||'';
      const card=del.closest('.th-managed-card') as HTMLElement|null;
      const cardKind=(card?.getAttribute('data-managed-kind')||kind) as ManagedKind;
      const cardCfg=MANAGED_CFG[cardKind]||cfg;
      if(name&&confirm(`确定要删除${cardCfg.label}「${name}」吗？`)){
        setCurrentManagedItems(cardKind,getManagedItems(cardKind));
        deleteManagedItem(cardKind,name);
        if(cardKind.startsWith('stash-')) openStashModal(getStatusStashAllTab() ? 'all' : cardKind);
        else void openManagedModal(cardKind);
      }
      return;
    }
    // 点卡片空白处 → 编辑
    const card=closestWithin<HTMLElement>(grid,e.target,'.th-managed-card');
    if(!card) return;
    const name=card.getAttribute('data-managed-name')||'';
    if(!name) return;
    // 从卡片 data 属性读 kind（支持"全部"tab 混合 kind）
    const cardKind=(card.getAttribute('data-managed-kind')||kind) as ManagedKind;
    // 阶段 B：点卡片弹编辑 modal，主 modal 保留
    void openManagedEditModal(cardKind, name);
  });
  grid.addEventListener('mouseover',(e:MouseEvent)=>{
    const card=enteredWithin<HTMLElement>(grid,e,'.th-managed-card');
    if(!card) return;
    const cardKind=(card.getAttribute('data-managed-kind')||kind) as ManagedKind;
    showLocHover(card,card.getAttribute('data-managed-name')||'',card.getAttribute('data-managed-desc')||'',cardKind);
  });
  grid.addEventListener('mouseout',(e:MouseEvent)=>{
    if(leftWithin(grid,e,'.th-managed-card')) hideLocHover();
  });
}
// idPrefixForKind / parseSearchQuery / entryMatchesSearch / loadSearchHistory / pushSearchHistory
// 已随阶段 1a-1 抽至 modules/managed-modal.ts。

// ================================================================
//  Managed Item 编辑 Modal（阶段 B + 阶段 C 扩展）
// ================================================================
// 辅助函数：获取世界书条目详情 HTML
async function renderWorldbookEntryDetails(kind: ManagedKind, name: string): Promise<string> {
  const cfg = getStashKindCfg(kind);
  const targetName = cfg.prefix + name;
  let detailsHtml = '';

  try {
    const books = getCharWorldbookList();
    for (const book of books) {
      const entries = await safeGetWorldbook(book);
      const matchingEntries = entries.filter(e => e.name === targetName);
      for (const entry of matchingEntries) {
        const strategyType = entry.strategy?.type || 'constant';
        const isEnabled = entry.enabled;
        const insertionType = entry.position?.type || 'after_character_definition';
        const insertionDepth = entry.position?.depth ?? 4;

        const strategyLabel = strategyType === 'constant' ? '常量（蓝灯）' : '关键词（绿灯）';
        const strategyColor = strategyType === 'constant' ? 'var(--sky)' : 'var(--mint)';
        const insertionLabel = positionLabel(insertionType);

        detailsHtml += `
          <div class="th-bound-entry-card" style="margin-top:8px;padding:10px 12px;background:var(--bg3);border-radius:8px;border:1px solid var(--dv2)">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${isEnabled ? strategyColor : 'var(--tx3)'}"></span>
              <span style="font-weight:600;color:var(--tx)">${esc(entry.name)}</span>
              <span style="font-size:11px;color:var(--lav);margin-left:auto"><i class="fa-solid fa-book"></i> ${esc(book)}</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;font-size:12px">
              <div style="color:var(--tx2)"><i class="fa-solid fa-lightbulb" style="color:${strategyColor};width:14px"></i> ${strategyLabel}</div>
              <div style="color:var(--tx2)"><i class="fa-solid fa-location-crosshairs" style="color:var(--lav);width:14px"></i> ${insertionLabel}</div>
              <div style="color:var(--tx2)"><i class="fa-solid fa-layer-group" style="color:var(--pink);width:14px"></i> 深度: ${insertionDepth}</div>
              <div style="color:var(--tx2)"><i class="fa-solid fa-power-off" style="color:${isEnabled ? 'var(--mint)' : 'var(--tx3)'};width:14px"></i> ${isEnabled ? '已开启' : '已关闭'}</div>
            </div>
          </div>
        `;
      }
    }
  } catch (e) {
    console.warn('[此间天地] 加载世界书条目详情失败', e);
  }

  return detailsHtml;
}

// 主 modal 状态快照（编辑返回时恢复）
let mainModalSnapshot: { scrollTop: number; filterTag: string | null; searchTerm: string; kind: ManagedKind; showRecent: boolean; showFav: boolean; sortMode: string } | null = null;
function restoreMainModalState() {
  if (!mainModalSnapshot) return;
  const { scrollTop, filterTag, searchTerm, kind, showRecent, showFav, sortMode } = mainModalSnapshot;
  const idPrefix = idPrefixForKind(kind);
  // 恢复筛选和排序
  setCurrentFilterTag(filterTag);
  showRecentOnly[kind] = showRecent;
  showFavOnly[kind] = showFav;
  saveSortMode(kind, sortMode as SortMode);
  // 恢复搜索框
  const searchInput = qs<HTMLInputElement>(`#${idPrefix}-search`);
  if (searchInput) searchInput.value = searchTerm;
  // 重绘
  const grid = qs(`#${idPrefix}-grid`);
  if (grid) grid.innerHTML = renderManagedBuckets(kind, idPrefix, searchTerm.trim().toLowerCase());
  bindManagedCardEvents(kind, idPrefix);
  bindCollapseToggleEvents(kind, idPrefix);
  // 更新按钮状态
  qsa('.th-tag-filter-btn[data-filter-tag]').forEach(b => {
    const ft = b.getAttribute('data-filter-tag') || '';
    if (ft === '__all__') b.classList.toggle('active', getCurrentFilterTag() === null);
    else if (ft === '__none__') b.classList.toggle('active', getCurrentFilterTag() === '');
    else b.classList.toggle('active', getCurrentFilterTag() === ft);
  });
  qs('[data-recent-toggle]')?.classList.toggle('active', showRecent);
  qs('[data-fav-toggle]')?.classList.toggle('active', showFav);
  // 恢复滚动
  requestAnimationFrame(() => {
    const bodyEl = qs<HTMLElement>('.th-modal-body');
    if (bodyEl) bodyEl.scrollTop = scrollTop;
  });
  mainModalSnapshot = null;
}

// ==================== 储藏间配发辅助（B1/B2 抽取，零行为变化）====================
// kind → 配发变量字段名。仅 4 个固定 stash kind 有对应字段；其余返回 null（调用方 return/continue）。
function dispatchFieldFor(kind: ManagedKind): string | null {
  switch (kind) {
    case 'stash-item': return '拥有物品';
    case 'stash-skill': return '拥有技能';
    case 'stash-status': return '状态';
    case 'stash-clothing': return '当前穿着衣物';
    default: return null;
  }
}
// ownerPrefix = userKey 或 `NPC.${npcName}`；返回 `${ownerPrefix}.${field}`，无对应字段时 null。
function dispatchBasePath(kind: ManagedKind, ownerPrefix: string): string | null {
  const field = dispatchFieldFor(kind);
  return field ? `${ownerPrefix}.${field}` : null;
}
// 解析结构化 payload（新格式 desc 是 JSON）；解析失败则按旧格式纯文本兜底重建。inject 为空时用默认模板。
function buildDispatchPayload(kind: ManagedKind, desc: string, inject?: string): Record<string, any> {
  const cfg = getStashKindCfg(kind);
  const injectTemplate = inject || cfg.defaultInject;
  let payload: Record<string, any> | null = null;
  try {
    const parsed = JSON.parse(desc);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) payload = { ...parsed };
  } catch { /* 旧格式 desc 是纯文本，下面兜底 */ }
  if (!payload) {
    const addKind: AddKind = kind === 'stash-item' ? 'item' : kind === 'stash-skill' ? 'skill' : kind === 'stash-status' ? 'status' : 'clothing';
    payload = { ...getDefaultEntry(addKind) };
    if (addKind === 'item' || addKind === 'skill') payload['简介'] = desc;
    else if (addKind === 'status') payload['效果'] = desc;
    else if (addKind === 'clothing') payload['外观详情'] = desc;
  }
  payload['inject'] = injectTemplate;
  return payload;
}

async function openManagedEditModal(kind: ManagedKind, name: string) {
  const isStash = kind.startsWith('stash-');
  const cfg = isStash ? getStashKindCfg(kind) : MANAGED_CFG[kind];
  // 对于 stash kind，确保 currentManagedItems 已加载（从"全部"tab点击时可能没预加载）
  if (isStash && Object.keys(getCurrentManagedItems(kind)).length === 0) {
    setCurrentManagedItems(kind, getManagedItems(kind));
  }
  const items = getCurrentManagedItems(kind);
  const item = items[name];
  if (!item) return;

  // 保存主 modal 状态快照（返回时恢复）
  const idPrefix = idPrefixForKind(kind);
  const modalBody = qs<HTMLElement>('.th-modal-body');
  mainModalSnapshot = {
    scrollTop: modalBody?.scrollTop || 0,
    filterTag: getCurrentFilterTag(),
    searchTerm: (qs<HTMLInputElement>(`#${idPrefix}-search`)?.value || ''),
    kind,
    showRecent: !!showRecentOnly[kind],
    showFav: !!showFavOnly[kind],
    sortMode: loadSortMode(kind),
  };

  const currentInject = item.inject || '';
  const defaultInject = cfg.defaultInject;
  const isFixedStash = STASH_FIXED_KINDS.includes(kind);

  // 预加载世界书绑定条目详情
  let boundEntriesHtml = '';
  if (cfg.bindsWorldbook) {
    boundEntriesHtml = await renderWorldbookEntryDetails(kind, name);
  }

  const h = `
    <div class="th-managed-edit-modal" data-kind="${kind}" data-name="${escAttr(name)}">
      <div class="th-modal-section">
        <div class="th-modal-label">名称</div>
        <input class="th-edit-input" data-edit-field="name" value="${escAttr(name)}">
      </div>
      <div class="th-modal-section">
        <div class="th-modal-label">简介</div>
        <textarea class="th-edit-textarea" data-edit-field="desc" rows="3">${esc(item.desc)}</textarea>
      </div>
      <div class="th-modal-section">
        <div class="th-modal-label">标签</div>
        <div class="th-links-edit-chips" style="max-height:120px;overflow-y:auto">
          ${(() => {
            const allTags = loadTags();
            const kindTags = allTags[kind] || {};
            const tagNames = Object.keys(kindTags);
            if (tagNames.length === 0) return '<span style="font-size:12px;color:var(--tx3)">暂无标签，请先在标签管理中创建</span>';
            return tagNames.map(tagName => {
              const tag = kindTags[tagName];
              const isChecked = item.tags && item.tags.includes(tagName);
              return `<label class="th-links-edit-chip">
                <input type="checkbox" data-edit-tag="${escAttr(tagName)}" ${isChecked ? 'checked' : ''}>
                <span class="th-tag-color-swatch" style="background:var(--${tag.color});width:12px;height:12px;flex-shrink:0"></span>
                ${esc(tagName)}
              </label>`;
            }).join('');
          })()}
        </div>
      </div>
      <div class="th-modal-section">
        <div class="th-modal-label th-modal-label-with-btn">
          注入模板
          <button class="th-btn-sm th-inject-default-btn" type="button">
            <i class="fa-solid fa-clipboard"></i> 插入默认模板
          </button>
        </div>
        <textarea class="th-edit-textarea" data-edit-field="inject" rows="3" placeholder="${escAttr(defaultInject)}">${esc(currentInject)}</textarea>
        <div class="th-inject-tokens">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <span style="font-weight:600;font-size:12px;color:var(--tx2)">可用 token</span>
            <div style="display:flex;gap:4px">
              <button class="th-btn-xs th-token-import" type="button" title="导入token"><i class="fa-solid fa-upload"></i></button>
              <button class="th-btn-xs th-token-export" type="button" title="导出token"><i class="fa-solid fa-download"></i></button>
              <button class="th-btn-xs th-token-add" type="button" title="新建token"><i class="fa-solid fa-plus"></i></button>
            </div>
          </div>
          <div class="th-token-list" id="th-token-list">
            <!-- token 列表由 JS 动态渲染 -->
          </div>
        </div>
      </div>
      ${cfg.bindsWorldbook ? `
      <div class="th-links-edit-section">
        <div class="th-modal-label">关联卡片</div>
        <div class="th-links-edit-grid">
          <div class="th-links-edit-group">
            <div class="th-links-edit-group-title" data-link-group="location">
              <i class="fa-solid fa-chevron-down th-links-collapse-icon"></i>
              📍 关联地点
            </div>
            <div class="th-links-edit-chips" data-link-chips="location">
              ${Object.keys(getManagedItems('location')).map(locName => `
                <label class="th-links-edit-chip">
                  <input type="checkbox" data-link-kind="location" data-link-name="${escAttr(locName)}" ${(item.links?.locations || []).includes(locName) ? 'checked' : ''} ${locName === name && kind === 'location' ? 'disabled' : ''}>
                  ${esc(locName)}
                </label>
              `).join('') || '<span style="font-size:12px;color:var(--tx3)">暂无地点</span>'}
            </div>
          </div>
          <div class="th-links-edit-group">
            <div class="th-links-edit-group-title" data-link-group="event">
              <i class="fa-solid fa-chevron-down th-links-collapse-icon"></i>
              📅 关联事件
            </div>
            <div class="th-links-edit-chips" data-link-chips="event">
              ${Object.keys(getManagedItems('event')).map(evtName => `
                <label class="th-links-edit-chip">
                  <input type="checkbox" data-link-kind="event" data-link-name="${escAttr(evtName)}" ${(item.links?.events || []).includes(evtName) ? 'checked' : ''} ${evtName === name && kind === 'event' ? 'disabled' : ''}>
                  ${esc(evtName)}
                </label>
              `).join('') || '<span style="font-size:12px;color:var(--tx3)">暂无事件</span>'}
            </div>
          </div>
          <div class="th-links-edit-group">
            <div class="th-links-edit-group-title" data-link-group="dlc">
              <i class="fa-solid fa-chevron-down th-links-collapse-icon"></i>
              📦 关联 DLC
            </div>
            <div class="th-links-edit-chips" data-link-chips="dlc">
              ${Object.keys(getManagedItems('dlc')).map(dlcName => `
                <label class="th-links-edit-chip">
                  <input type="checkbox" data-link-kind="dlc" data-link-name="${escAttr(dlcName)}" ${(item.links?.dlcs || []).includes(dlcName) ? 'checked' : ''} ${dlcName === name && kind === 'dlc' ? 'disabled' : ''}>
                  ${esc(dlcName)}
                </label>
              `).join('') || '<span style="font-size:12px;color:var(--tx3)">暂无 DLC</span>'}
            </div>
          </div>
        </div>
      </div>
      ` : ''}
      <div class="th-modal-section th-managed-state-section" style="${cfg.bindsWorldbook ? '' : 'display:none'}">
        <div class="th-modal-label">世界书绑定</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <span style="font-size:13px">绑定状态：<span class="th-managed-state-text" style="color:${managedEntryStates[kind]?.[name]?.bound ? 'var(--mint)' : 'var(--tx3)'}">${managedEntryStates[kind]?.[name]?.bound ? '已绑定' : '未绑定'}</span></span>
          <span style="font-size:13px">启用状态：<span class="th-managed-state-text" style="color:${managedEntryStates[kind]?.[name]?.enabled ? 'var(--mint)' : 'var(--tx3)'}">${managedEntryStates[kind]?.[name]?.enabled ? '已开启' : '未开启'}</span></span>
        </div>
        ${managedEntryStates[kind]?.[name]?.worldbookNames?.length ? `<div style="font-size:12px;color:var(--tx2);margin-bottom:8px"><i class="fa-solid fa-book" style="color:var(--lav)"></i> 世界书：${managedEntryStates[kind][name].worldbookNames.join(', ')}</div>` : ''}
        ${boundEntriesHtml || '<div style="font-size:12px;color:var(--tx2);padding:8px 12px;background:var(--bg3);border-radius:6px">未找到绑定的世界书条目</div>'}
        <div style="display:flex;align-items:center;gap:8px;margin-top:12px">
          <button class="th-btn-sm th-btn-toggle-state" type="button">
            <i class="fa-solid fa-power-off"></i> ${managedEntryStates[kind]?.[name]?.enabled ? '关闭' : '开启'}
          </button>
        </div>
        <div class="th-worldbook-hint" style="margin-top:12px;font-size:12px;color:var(--tx2);background:var(--bg3);padding:10px 14px;border-radius:8px;border-left:3px solid var(--lav)">
          <div style="font-weight:600;color:var(--lav);margin-bottom:4px"><i class="fa-solid fa-info-circle"></i> 世界书条目格式说明</div>
          <div>• 条目名称格式：<code style="background:var(--bg2);padding:2px 6px;border-radius:4px;color:var(--tx)">[${cfg.label}]${name}</code></div>
          <div>• 例如：<code style="background:var(--bg2);padding:2px 6px;border-radius:4px;color:var(--tx)">[地点]森林入口</code>、<code style="background:var(--bg2);padding:2px 6px;border-radius:4px;color:var(--tx)">[事件]月圆之夜</code></div>
          <div>• 绑定成功后可通过"开启/关闭"按钮控制该世界书条目是否生效</div>
        </div>
      </div>
      ${isStash && isFixedStash ? `
      <div class="th-modal-section th-stash-dispatch-section">
        <div class="th-modal-label">配发</div>
        <div class="th-stash-dispatch-btns">
          <button class="th-btn-sm th-btn-add-to-user" type="button"><i class="fa-solid fa-user"></i> 添加给 user</button>
          <button class="th-btn-sm th-btn-add-to-npc" type="button"><i class="fa-solid fa-users"></i> 添加给 NPC...</button>
        </div>
      </div>
      ` : ''}
      <div class="th-edit-actions">
        <button class="th-btn-sm th-btn-edit-save" type="button"><i class="fa-solid fa-floppy-disk"></i> 保存</button>
        <button class="th-btn-sm th-btn-edit-send" type="button"><i class="fa-solid fa-paper-plane"></i> 发送</button>
        <button class="th-btn-sm th-btn-edit-cancel" type="button" style="margin-left:auto"><i class="fa-solid fa-xmark"></i> 取消</button>
      </div>
    </div>
  `;

  openModal2(`<i class="${cfg.icon}"></i> 编辑 · ${esc(name)}`, h);

  // 绑定事件
  setTimeout(() => {
    const modal = qs('.th-managed-edit-modal');
    if (!modal) { console.warn('[openManagedEditModal] .th-managed-edit-modal not found'); return; }

    // 关联分组折叠功能（默认折叠由 CSS 负责：.th-links-edit-chips 默认 display:none，
    // .th-links-collapse-icon 默认 rotate(-90deg)。这里只处理点击展开/收起，不再用 JS
    // 延迟隐藏，避免打开 modal 时先闪一下全部内容再折叠。）
    qsa('.th-links-edit-group-title').forEach(titleEl => {
      titleEl.addEventListener('click', () => {
        const group = titleEl.getAttribute('data-link-group');
        const chipsEl = qs(`[data-link-chips="${group}"]`);
        const iconEl = titleEl.querySelector('.th-links-collapse-icon');
        if (chipsEl && iconEl) {
          const isCollapsed = (chipsEl as HTMLElement).style.display === 'none' || !(chipsEl as HTMLElement).style.display;
          (chipsEl as HTMLElement).style.display = isCollapsed ? 'flex' : 'none';
          (iconEl as HTMLElement).style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(-90deg)';
        }
      });
    });

    // 渲染 token 列表（内置 + 自定义）
    function renderTokenList() {
      const tokenListEl = qs('#th-token-list');
      if (!tokenListEl) return;
      const builtInTokens = ['{{name}}', '{{desc}}', '{{user}}', '{{char}}'];
      const customTokens = JSON.parse(localStorage.getItem('_th_custom_tokens') || '[]');
      const allTokens = [...builtInTokens, ...customTokens];
      tokenListEl.innerHTML = allTokens.map(token => {
        const isBuiltIn = builtInTokens.includes(token);
        const deleteBtn = isBuiltIn ? '' : `<i class="fa-solid fa-times th-token-delete" title="删除token" style="font-size:9px;cursor:pointer;opacity:0.7;margin-left:2px"></i>`;
        return `<span class="th-token" data-token="${escAttr(token)}" title="${isBuiltIn ? '点击插入' : '点击插入，双击编辑'}">${esc(token)}${deleteBtn}</span>`;
      }).join('');

      // 重新绑定所有 token 事件
      bindTokenEvents();
    }

    // 绑定 token 相关事件
    function bindTokenEvents() {
      // Token 点击插入
      qsa('.th-token').forEach(tokenEl => {
        tokenEl.addEventListener('click', (e) => {
          // 如果点击的是删除按钮，不插入
          if ((e.target as HTMLElement).closest('.th-token-delete')) return;
          const tokenText = tokenEl.getAttribute('data-token') || '';
          const injectTextarea = qs<HTMLTextAreaElement>('textarea[data-edit-field="inject"]');
          if (injectTextarea && tokenText) {
            const start = injectTextarea.selectionStart;
            const end = injectTextarea.selectionEnd;
            const text = injectTextarea.value;
            injectTextarea.value = text.substring(0, start) + tokenText + text.substring(end);
            injectTextarea.focus();
            injectTextarea.selectionStart = injectTextarea.selectionEnd = start + tokenText.length;
          }
        });
      });

      // 删除自定义 token
      qsa('.th-token-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const tokenEl = (btn as HTMLElement).closest('.th-token') as HTMLElement | null;
          if (!tokenEl) return;
          const tokenText = tokenEl.getAttribute('data-token') || '';
          if (confirm(`确定要删除自定义 token「${tokenText}」吗？`)) {
            const customTokens = JSON.parse(localStorage.getItem('_th_custom_tokens') || '[]');
            const filtered = customTokens.filter((t: string) => t !== tokenText);
            localStorage.setItem('_th_custom_tokens', JSON.stringify(filtered));
            toastr?.success?.(`已删除 token：${tokenText}`);
            renderTokenList();
          }
        });
      });

      // 编辑 token（双击编辑）
      qsa('.th-token').forEach(tokenEl => {
        tokenEl.addEventListener('dblclick', () => {
          const oldToken = tokenEl.getAttribute('data-token') || '';
          if (['{{name}}', '{{desc}}', '{{user}}', '{{char}}'].includes(oldToken)) {
            toastr?.warning?.('内置 token 不可编辑');
            return;
          }
          const newToken = prompt('编辑 token：', oldToken);
          if (newToken && newToken.trim() && newToken.trim() !== oldToken) {
            const trimmed = newToken.trim();
            if (!trimmed.startsWith('{{') || !trimmed.endsWith('}}')) {
              toastr?.warning?.('token 格式必须为 {{变量名}}');
              return;
            }
            const customTokens = JSON.parse(localStorage.getItem('_th_custom_tokens') || '[]');
            const idx = customTokens.indexOf(oldToken);
            if (idx >= 0) {
              customTokens[idx] = trimmed;
              localStorage.setItem('_th_custom_tokens', JSON.stringify(customTokens));
              toastr?.success?.(`已更新 token：${trimmed}`);
              renderTokenList();
            }
          }
        });
      });
    }

    // 初始渲染 token 列表
    renderTokenList();

    // 新建自定义 token 按钮
    qs('.th-token-add')?.addEventListener('click', () => {
      const tokenName = prompt('请输入新 token 名称（例如：{{变量名}}）：', '{{newVar}}');
      if (tokenName && tokenName.trim()) {
        const trimmed = tokenName.trim();
        if (!trimmed.startsWith('{{') || !trimmed.endsWith('}}')) {
          toastr?.warning?.('token 格式必须为 {{变量名}}');
          return;
        }
        // 保存到 localStorage
        const customTokens = JSON.parse(localStorage.getItem('_th_custom_tokens') || '[]');
        if (!customTokens.includes(trimmed)) {
          customTokens.push(trimmed);
          localStorage.setItem('_th_custom_tokens', JSON.stringify(customTokens));
          toastr?.success?.(`已添加自定义 token：${trimmed}`);
          renderTokenList();
        } else {
          toastr?.warning?.('该 token 已存在');
        }
      }
    });

    // 导出 token
    qs('.th-token-export')?.addEventListener('click', () => {
      const customTokens = JSON.parse(localStorage.getItem('_th_custom_tokens') || '[]');
      const allTokens = ['{{name}}', '{{desc}}', '{{user}}', '{{char}}', ...customTokens];
      const blob = new Blob([allTokens.join('\n')], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'tokens_' + new Date().toISOString().slice(0, 10) + '.txt';
      a.click();
      URL.revokeObjectURL(a.href);
      toastr?.success?.(`已导出 ${allTokens.length} 个 token`);
    });

    // 导入 token
    qs('.th-token-import')?.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const text = ev.target?.result as string;
          const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && l.startsWith('{{') && l.endsWith('}}'));
          if (lines.length === 0) {
            toastr?.warning?.('未找到有效的 token 格式');
            return;
          }
          const customTokens = JSON.parse(localStorage.getItem('_th_custom_tokens') || '[]');
          let added = 0;
          for (const t of lines) {
            if (!customTokens.includes(t) && !['{{name}}', '{{desc}}', '{{user}}', '{{char}}'].includes(t)) {
              customTokens.push(t);
              added++;
            }
          }
          localStorage.setItem('_th_custom_tokens', JSON.stringify(customTokens));
          toastr?.success?.(`成功导入 ${added} 个新 token`);
          renderTokenList();
        };
        reader.readAsText(file, 'utf-8');
      };
      input.click();
    });

    // 插入默认模板按钮
    qs('.th-inject-default-btn')?.addEventListener('click', () => {
      const injectTextarea = qs<HTMLTextAreaElement>('textarea[data-edit-field="inject"]');
      if (injectTextarea) {
        injectTextarea.value = defaultInject;
        injectTextarea.focus();
      }
    });

    // 取消按钮
    qs('.th-btn-edit-cancel')?.addEventListener('click', () => {
      closeModal2();
      restoreMainModalState();
    });

    // 收集关联选择
    function collectLinksSelection(): { locations: string[]; events: string[]; dlcs: string[] } {
      const locChecks = qsa<HTMLInputElement>('input[data-link-kind="location"]:checked');
      const evtChecks = qsa<HTMLInputElement>('input[data-link-kind="event"]:checked');
      const dlcChecks = qsa<HTMLInputElement>('input[data-link-kind="dlc"]:checked');
      return {
        locations: Array.from(locChecks).map(c => c.getAttribute('data-link-name') || '').filter(Boolean),
        events: Array.from(evtChecks).map(c => c.getAttribute('data-link-name') || '').filter(Boolean),
        dlcs: Array.from(dlcChecks).map(c => c.getAttribute('data-link-name') || '').filter(Boolean),
      };
    }

    // 双向同步关联：A 添加关联到 B → B 也自动添加对 A 的关联；A 取消关联 → B 也取消对 A 的关联
    function syncBidirectionalLinks(itemName: string, newLinks: { locations: string[]; events: string[]; dlcs: string[] }) {
      const oldLinks = item.links || { locations: [], events: [], dlcs: [] };
      // 确定当前 kind 对应的目标字段名
      const selfField = kind === 'location' ? 'locations' : kind === 'event' ? 'events' : 'dlcs';

      // 处理新增的关联
      for (const field of ['locations', 'events', 'dlcs'] as const) {
        const targetKind = field === 'locations' ? 'location' : field === 'events' ? 'event' : 'dlc';
        const oldArr = oldLinks[field] || [];
        const newArr = newLinks[field] || [];
        for (const targetName of newArr) {
          if (!oldArr.includes(targetName)) {
            // 新增关联：给目标添加反向关联
            const targetItems = getManagedItems(targetKind);
            if (targetItems[targetName]) {
              const targetLinks = targetItems[targetName].links || {};
              const targetFieldArr = targetLinks[selfField] || [];
              if (!targetFieldArr.includes(itemName)) {
                targetFieldArr.push(itemName);
                addManagedItem(targetKind, targetName, { ...targetItems[targetName], links: { ...targetLinks, [selfField]: targetFieldArr } });
              }
            }
          }
        }
        // 处理移除的关联
        for (const targetName of oldArr) {
          if (!newArr.includes(targetName)) {
            // 移除关联：给目标移除反向关联
            const targetItems = getManagedItems(targetKind);
            if (targetItems[targetName]) {
              const targetLinks = targetItems[targetName].links || {};
              const targetFieldArr = targetLinks[selfField] || [];
              const idx = targetFieldArr.indexOf(itemName);
              if (idx >= 0) {
                targetFieldArr.splice(idx, 1);
                addManagedItem(targetKind, targetName, { ...targetItems[targetName], links: { ...targetLinks, [selfField]: targetFieldArr } });
              }
            }
          } else {
            // 保留的关联：补全反向（修复历史单向数据 —— A→B 存在但 B→A 缺失时补写）
            const targetItems = getManagedItems(targetKind);
            if (targetItems[targetName]) {
              const targetLinks = targetItems[targetName].links || {};
              const targetFieldArr = targetLinks[selfField] || [];
              if (!targetFieldArr.includes(itemName)) {
                targetFieldArr.push(itemName);
                addManagedItem(targetKind, targetName, { ...targetItems[targetName], links: { ...targetLinks, [selfField]: targetFieldArr } });
              }
            }
          }
        }
      }
    }

    // 保存按钮
    qs('.th-btn-edit-save')?.addEventListener('click', () => {
      const nameInput = qs<HTMLInputElement>('input[data-edit-field="name"]');
      const descTextarea = qs<HTMLTextAreaElement>('textarea[data-edit-field="desc"]');
      const injectTextarea = qs<HTMLTextAreaElement>('textarea[data-edit-field="inject"]');

      const newName = nameInput?.value?.trim() || '';
      const newDesc = descTextarea?.value?.trim() || '';
      const newInject = injectTextarea?.value?.trim() || '';
      const newLinks = cfg.bindsWorldbook ? collectLinksSelection() : undefined;
      // 收集标签复选框
      const tagChecks = qsa<HTMLInputElement>('input[data-edit-tag]:checked');
      const newTags = Array.from(tagChecks).map(c => c.getAttribute('data-edit-tag') || '').filter(Boolean);

      if (!newName) { toastr?.warning?.('请输入名称'); return; }
      if (!newDesc) { toastr?.warning?.('请输入简介'); return; }

      // 双向同步关联
      if (cfg.bindsWorldbook && newLinks) {
        syncBidirectionalLinks(name, newLinks);
      }

      // 改名处理
      if (newName !== name) {
        if (items[newName]) { toastr?.warning?.('已存在同名条目'); return; }
        // 删旧的，加新的
        deleteManagedItem(kind, name);
        addManagedItem(kind, newName, { desc: newDesc, tags: newTags, inject: newInject || undefined, links: newLinks });
      } else {
        // 不改名，直接更新
        addManagedItem(kind, name, { desc: newDesc, tags: newTags, inject: newInject || undefined, links: newLinks });
      }

      closeModal2();
      // 刷新主 modal + 恢复状态
      setCurrentManagedItems(kind, getManagedItems(kind));
      if (cfg.bindsWorldbook) void safeRefreshManagedEntryStates(kind);
      if (kind.startsWith('stash-')) openStashModal(getStatusStashAllTab() ? 'all' : kind);
      else restoreMainModalState();
    });

    // 发送按钮
    qs('.th-btn-edit-send')?.addEventListener('click', () => {
      const nameInput = qs<HTMLInputElement>('input[data-edit-field="name"]');
      const descTextarea = qs<HTMLTextAreaElement>('textarea[data-edit-field="desc"]');
      const injectTextarea = qs<HTMLTextAreaElement>('textarea[data-edit-field="inject"]');

      const newName = nameInput?.value?.trim() || '';
      const newDesc = descTextarea?.value?.trim() || '';
      const newInject = injectTextarea?.value?.trim() || '';
      const newLinks = cfg.bindsWorldbook ? collectLinksSelection() : undefined;
      // 收集标签复选框
      const tagChecks = qsa<HTMLInputElement>('input[data-edit-tag]:checked');
      const newTags = Array.from(tagChecks).map(c => c.getAttribute('data-edit-tag') || '').filter(Boolean);

      if (!newName) { toastr?.warning?.('请输入名称'); return; }
      if (!newDesc) { toastr?.warning?.('请输入简介'); return; }

      // 双向同步关联
      if (cfg.bindsWorldbook && newLinks) {
        syncBidirectionalLinks(name, newLinks);
      }

      // 先持久化当前值（防止下次打开还要改）
      if (newName !== name) {
        if (items[newName]) { toastr?.warning?.('已存在同名条目'); return; }
        deleteManagedItem(kind, name);
        addManagedItem(kind, newName, { desc: newDesc, tags: newTags, inject: newInject || undefined, links: newLinks });
      } else {
        addManagedItem(kind, name, { desc: newDesc, tags: newTags, inject: newInject || undefined, links: newLinks });
      }

      // 计算最终文本
      const injectTemplate = newInject || defaultInject;
      const finalText = injectTemplate.replace('{{name}}', newName).replace('{{desc}}', newDesc);

      try { safeTriggerSlash('/setinput ' + tavernMacro('input') + ' ' + finalText); } catch(err) { void err; }

      closeModal2();
      // 刷新主 modal + 恢复状态
      setCurrentManagedItems(kind, getManagedItems(kind));
      if (cfg.bindsWorldbook) void safeRefreshManagedEntryStates(kind);
      if (kind.startsWith('stash-')) openStashModal(getStatusStashAllTab() ? 'all' : kind);
      else restoreMainModalState();
    });

    // 世界书状态切换按钮
    qs('.th-btn-toggle-state')?.addEventListener('click', async () => {
      const descTextarea = qs<HTMLTextAreaElement>('textarea[data-edit-field="desc"]');
      const currentDesc = descTextarea?.value?.trim() || item.desc;
      const result = await toggleManagedWorldbookEntry(kind, name, currentDesc);
      if (result !== null) {
        const stateText = qs('.th-managed-state-text');
        const btn = qs('.th-btn-toggle-state');
        if (stateText && btn) {
          const enabled = !managedEntryStates[kind]?.[name]?.enabled;
          stateText.textContent = enabled ? '已开启' : '未开启';
          btn.innerHTML = `<i class="fa-solid fa-power-off"></i> ${enabled ? '关闭' : '开启'}`;
        }
      }
    });

    // 储藏间：添加给 user 按钮
    qs('.th-btn-add-to-user')?.addEventListener('click', () => {
      const nameInput = qs<HTMLInputElement>('input[data-edit-field="name"]');
      const descTextarea = qs<HTMLTextAreaElement>('textarea[data-edit-field="desc"]');
      const injectTextarea = qs<HTMLTextAreaElement>('textarea[data-edit-field="inject"]');
      const currentName = nameInput?.value?.trim() || name;
      const currentDesc = descTextarea?.value?.trim() || item.desc;
      const currentInject = injectTextarea?.value?.trim() || '';

      const cd = getCurrentStatusData();
      if (!cd) return;
      const userKey = getUserKey(cd);
      const basePath = dispatchBasePath(kind, userKey);
      if (!basePath) return;

      const payload = buildDispatchPayload(kind, currentDesc, currentInject);

      if (commitAdd(basePath, currentName, payload, { onDuplicate: kind === 'stash-item' ? 'stack-qty' : 'overwrite' })) {
        closeModal2();
      }
    });

    // 储藏间：添加给 NPC 按钮
    qs('.th-btn-add-to-npc')?.addEventListener('click', () => {
      const nameInput = qs<HTMLInputElement>('input[data-edit-field="name"]');
      const descTextarea = qs<HTMLTextAreaElement>('textarea[data-edit-field="desc"]');
      const injectTextarea = qs<HTMLTextAreaElement>('textarea[data-edit-field="inject"]');
      const currentName = nameInput?.value?.trim() || name;
      const currentDesc = descTextarea?.value?.trim() || item.desc;
      const currentInject = injectTextarea?.value?.trim() || '';

      openAddToNpcPopover(kind, currentName, currentDesc, currentInject);
    });
  }, 60);
}

// NPC 选择 popover（阶段 C）
function openAddToNpcPopover(kind: ManagedKind, itemName: string, itemDesc: string, itemInject: string) {
  // 用 getNPCs(getCurrentStatusData()) 获取 NPC 列表
  const cd = getCurrentStatusData();
  if (!cd) { toastr?.warning?.('当前没有数据'); return; }
  const allNpcs = getNPCs(cd);

  // 只显示所有 NPC（不筛选在场，因为用户可能想给不在场 NPC 也配发）
  if (allNpcs.length === 0) {
    toastr?.warning?.('当前没有 NPC');
    return;
  }

  // 构建 NPC 列表
  let listHtml = '<div class="th-add-to-npc-list">';
  for (const npc of allNpcs) {
    const avatarUrl = getAvatarImages()['npc:' + npc.name] || '';
    const avatarHtml = avatarUrl ? `<img src="${escAttr(avatarUrl)}" class="th-npc-avatar-mini" alt="">` : '<i class="fa-solid fa-user" style="font-size:20px;color:var(--lav)"></i>';
    const present = npc.info['是否在场'] === true;
    listHtml += `<button class="th-add-to-npc-item" data-npc-name="${escAttr(npc.name)}">
      ${avatarHtml}
      <span style="color:var(--tx);font-weight:600">${esc(npc.name)}</span>
      <span style="font-size:10px;color:${present ? 'var(--mint)' : 'var(--tx2)'}">${present ? '在场' : '离场'}</span>
    </button>`;
  }
  listHtml += '</div>';

  openModal2(`<i class="fa-solid fa-users"></i> 选择 NPC · ${esc(itemName)}`, listHtml);

  setTimeout(() => {
    qsa('.th-add-to-npc-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const npcName = btn.getAttribute('data-npc-name') || '';

        const basePath = dispatchBasePath(kind, `NPC.${npcName}`);
        if (!basePath) return;
        const payload = buildDispatchPayload(kind, itemDesc, itemInject);

        if (commitAdd(basePath, itemName, payload, { onDuplicate: kind === 'stash-item' ? 'stack-qty' : 'overwrite' })) {
          closeModal2();
          closeModal2(); // 关闭编辑 modal
          toastr?.success?.(`已添加给 ${npcName}：${itemName}`);
        }
      });
    });
  }, 100);
}

// 按标签批量配发 modal
export function openDispatchByTagModal(kind: ManagedKind, idPrefix: string) {
  const allTags = loadTags();
  const kindTags = allTags[kind] || {};
  const tagNames = Object.keys(kindTags);
  const items = getManagedItems(kind);

  if (tagNames.length === 0) {
    toastr?.warning?.('暂无标签，请先创建标签');
    return;
  }

  let h = `<div class="th-batch-tag-modal" style="padding:10px">
    <div style="margin-bottom:12px;font-weight:600">第一步：选择标签（该标签下的所有物品将被批量配发）</div>
    <div class="th-batch-tag-list" style="max-height:200px;overflow-y:auto;display:grid;gap:8px;margin-bottom:16px">`;
  for (const tagName of tagNames) {
    const tag = kindTags[tagName];
    const taggedItems = Object.entries(items).filter(([_, item]) => item.tags && item.tags.includes(tagName));
    h += `<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg3);border-radius:8px;cursor:pointer">
      <input type="radio" name="dispatch-tag" value="${escAttr(tagName)}">
      <span class="th-tag-color-swatch" style="background:var(--${tag.color || 'tx3'})"></span>
      <span>${esc(tagName)}</span>
      <span style="color:var(--tx3);margin-left:auto">${taggedItems.length} 张卡片</span>
    </label>`;
  }
  h += `</div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="th-btn" id="th-dispatch-tag-cancel">取消</button>
      <button class="th-btn th-btn-primary" id="th-dispatch-tag-next">下一步</button>
    </div>
  </div>`;

  openModal2('按标签配发：选择标签', h);

  setTimeout(() => {
    qs('#th-dispatch-tag-cancel')?.addEventListener('click', () => closeModal2());
    qs('#th-dispatch-tag-next')?.addEventListener('click', () => {
      const selectedRadio = qs<HTMLInputElement>('input[name="dispatch-tag"]:checked');
      const tagName = selectedRadio?.value || '';
      if (!tagName) { toastr?.warning?.('请选择一个标签'); return; }

      // 第二步：选择配发目标（主角 + NPC）
      const cd = getCurrentStatusData();
      if (!cd) { toastr?.warning?.('当前没有角色数据'); return; }
      const allNpcs = getNPCs(cd);

      let targetsHtml = `<div class="th-batch-tag-modal" style="padding:10px">
        <div style="margin-bottom:12px;font-weight:600">第二步：选择配发目标</div>
        <div class="th-batch-tag-list" style="max-height:300px;overflow-y:auto;display:grid;gap:8px;margin-bottom:16px">
          <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg3);border-radius:8px;cursor:pointer">
            <input type="checkbox" data-dispatch-target="user">
            <i class="fa-solid fa-user" style="color:var(--pink);font-size:20px;width:24px;height:24px;display:flex;align-items:center;justify-content:center"></i>
            <span>主角</span>
          </label>`;
      for (const npc of allNpcs) {
        const present = npc.info['是否在场'] === true;
        targetsHtml += `<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg3);border-radius:8px;cursor:pointer">
          <input type="checkbox" data-dispatch-target="npc:${escAttr(npc.name)}">
          <i class="fa-solid fa-user" style="color:var(--lav);font-size:20px;width:24px;height:24px;display:flex;align-items:center;justify-content:center"></i>
          <span>${esc(npc.name)}</span>
          <span style="font-size:10px;color:${present ? 'var(--mint)' : 'var(--tx2)'}">${present ? '在场' : '离场'}</span>
        </label>`;
      }
      targetsHtml += `</div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="th-btn" id="th-dispatch-target-back">返回</button>
          <button class="th-btn th-btn-primary" id="th-dispatch-target-confirm">确认配发</button>
        </div>
      </div>`;

      openModal2('按标签配发：选择目标', targetsHtml);

      setTimeout(() => {
        qs('#th-dispatch-target-back')?.addEventListener('click', () => openDispatchByTagModal(kind, idPrefix));
        qs('#th-dispatch-target-confirm')?.addEventListener('click', () => {
          const targets: ('user' | string)[] = [];
          qsa<HTMLInputElement>('input[data-dispatch-target]:checked').forEach(cb => {
            const target = cb.getAttribute('data-dispatch-target') || '';
            if (target) targets.push(target);
          });
          if (targets.length === 0) { toastr?.warning?.('请至少选择一个目标'); return; }

          // 获取标签下的所有物品
          const taggedItems = Object.entries(items).filter(([_, item]) => item.tags && item.tags.includes(tagName));
          if (taggedItems.length === 0) { toastr?.warning?.('该标签下没有卡片'); return; }

          const cfg = getStashKindCfg(kind);
          const cd2 = getCurrentStatusData();
          if (!cd2) { toastr?.warning?.('当前没有角色数据'); return; }
          const userKey = getUserKey(cd2);

          let successCount = 0;
          let totalCount = 0;

          for (const [itemName, item] of taggedItems) {
            for (const target of targets) {
              let ownerPrefix = '';
              if (target === 'user') ownerPrefix = userKey;
              else if (target.startsWith('npc:')) ownerPrefix = `NPC.${target.replace('npc:', '')}`;
              const basePath = ownerPrefix ? dispatchBasePath(kind, ownerPrefix) : null;
              if (!basePath) continue;

              const payload = buildDispatchPayload(kind, item.desc, item.inject || '');

              if (commitAdd(basePath, itemName, payload, { onDuplicate: kind === 'stash-item' ? 'stack-qty' : 'overwrite' })) {
                successCount++;
              }
              totalCount++;
            }
          }

          closeModal2();
          toastr?.success?.(`已配发 ${successCount}/${totalCount} 个${cfg.label}`);
        });
      }, 60);
    });
  }, 60);
}
