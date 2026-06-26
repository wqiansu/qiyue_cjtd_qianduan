// 0615悬浮球：从 0612前端 改造的脚本版本。
// 状态栏 DOM 由外壳 Shell.vue 挂载到酒馆主页面 body 上，
// 因此本模块所有 DOM 查询、事件注册都必须作用于 parent.document。
// ================================================================
import { stripFa } from './lib/icons';
// 批次2：@floating-ui 重写悬停 tip 定位（视口边缘自动 flip/shift + 滚动自动跟随）
import { computePosition, flip, shift, offset, autoUpdate, type Placement } from '@floating-ui/dom';
// 批次8：gsap 数值条数字 CountUp 入口动画（数字 0→目标值 0.8s 滚动 + 已有 width CSS transition 配合进度条平滑过渡）
import { gsap } from 'gsap';
// 编号15：变量变化审核 + 快照系统（数据层 lib + 防递归 guard）
import {
  configureReview,
  isReviewWriting,
  approveAllPending,
  rejectAllPending,
  clearAll as clearReviewAll,
  getReviewQueue,
  getPendingCount,
  getSnapshots,
  applyReviewItem,
  removeItemFromQueue,
  deleteSnapshot,
  restoreSnapshot,
  subscribeReview,
  // PROGRESS §7 Step B：统一审核变更采集 helper + 共享基线
  setReviewBaseline,
  getReviewBaseline,
  collectStatDataChange,
} from './lib/variable-review';
// 安装 innerHTML setter 拦截：所有赋值自动过 stripFa，把 fa-xxx 换成 lucide SVG。
// 这一行必须在 status-bar-init 内部任何 innerHTML 赃值之前执行。
// 关键：modal/状态栏 DOM 都挂到 parent document，用的是 parent 的 Element.prototype，
// 所以必须在 parent 的原型上装拦截器（iframe 自己的原型管不到 parent 的元素）。
(() => {
  function installOnProto(proto: any) {
    if (!proto || proto.__thFaStripped) return;
    const desc = Object.getOwnPropertyDescriptor(proto, 'innerHTML');
    if (!desc || !desc.set) return;
    proto.__thFaStripped = true;
    const originalSet = desc.set;
    Object.defineProperty(proto, 'innerHTML', {
      configurable: true,
      enumerable: desc.enumerable,
      get: desc.get,
      set(v: string) {
        originalSet.call(this, stripFa(v));
      },
    });
  }
  // 1. iframe 自己的原型（iframe 内元素）
  installOnProto(Element.prototype);
  // 2. parent 的原型（modal/状态栏 DOM 实际所在）— 必须装，否则 fa 图标不被替换
  try {
    const pw = window.parent as Window | null;
    if (pw && pw !== window) installOnProto(pw.Element.prototype);
  } catch (e) { void e; }
})();

const __doc: Document = (() => {
  try {
    const d = (window.parent as Window | null)?.document;
    if (d) return d;
  } catch (e) { void e; }
  return document;
})();
const __body: HTMLElement = __doc.body || (document.body as HTMLElement);
let __abortController = new AbortController();
function __sigOpt(): AddEventListenerOptions { return { signal: __abortController.signal }; }
function __sigOptCapture(): AddEventListenerOptions { return { signal: __abortController.signal, capture: true }; }

// ================================================================
function getRoot(): any {
  try {
    const parentWindow = window.parent as any;
    if(parentWindow&&parentWindow!==window) return parentWindow;
  } catch(e) { void e; }
  return window as any;
}

function getHelper(): any {
  return (window as any).TavernHelper || getRoot().TavernHelper || {};
}

function getMvu(): any {
  return (window as any).Mvu || getRoot().Mvu;
}

function hasVariableApi(): boolean {
  return typeof (window as any).getVariables === 'function' || typeof getHelper().getVariables === 'function';
}

function safeGetVariables(option: any): Record<string,any> {
  const localGet = (window as any).getVariables;
  if(typeof localGet==='function') return localGet(option);
  const helperGet = getHelper().getVariables;
  if(typeof helperGet==='function') return helperGet(option);
  throw new Error('getVariables is not available');
}

function safeUpdateVariablesWith(updater: (variables: Record<string,any>) => Record<string,any>, option: any) {
  const localUpdate = (window as any).updateVariablesWith;
  if(typeof localUpdate==='function') return localUpdate(updater, option);
  const helperUpdate = getHelper().updateVariablesWith;
  if(typeof helperUpdate==='function') return helperUpdate(updater, option);
  throw new Error('updateVariablesWith is not available');
}

function safeTriggerSlash(command: string) {
  const localTrigger = (window as any).triggerSlash;
  if(typeof localTrigger==='function') return localTrigger(command);
  const helperTrigger = getHelper().triggerSlash;
  if(typeof helperTrigger==='function') return helperTrigger(command);
}

function safeGetCharWorldbookNames(characterName: 'current'): CharWorldbooks {
  const localGet = (window as any).getCharWorldbookNames;
  if(typeof localGet==='function') return localGet(characterName);
  const helperGet = getHelper().getCharWorldbookNames;
  if(typeof helperGet==='function') return helperGet(characterName);
  throw new Error('getCharWorldbookNames is not available');
}

async function safeGetWorldbook(worldbookName: string): Promise<WorldbookEntry[]> {
  const localGet = (window as any).getWorldbook;
  if(typeof localGet==='function') return localGet(worldbookName);
  const helperGet = getHelper().getWorldbook;
  if(typeof helperGet==='function') return helperGet(worldbookName);
  throw new Error('getWorldbook is not available');
}

async function safeUpdateWorldbookWith(worldbookName: string, updater: WorldbookUpdater, options?: ReplaceWorldbookOptions): Promise<WorldbookEntry[]> {
  const localUpdate = (window as any).updateWorldbookWith;
  if(typeof localUpdate==='function') return localUpdate(worldbookName, updater, options);
  const helperUpdate = getHelper().updateWorldbookWith;
  if(typeof helperUpdate==='function') return helperUpdate(worldbookName, updater, options);
  throw new Error('updateWorldbookWith is not available');
}

async function waitForVariableApi() {
  if(hasVariableApi()) return;
  await waitUntil(()=>hasVariableApi(), 150, 15000);
}

function waitUntil(check: () => boolean, interval = 300, timeout = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const t = setInterval(() => {
      try { if (check()) { clearInterval(t); resolve(); } else if (Date.now()-start>timeout) { clearInterval(t); reject(new Error('timeout')); } }
      catch (e) { if (Date.now()-start>timeout) { clearInterval(t); reject(new Error('timeout')); } }
    }, interval);
  });
}

// ================================================================
//  配置
// ================================================================
const ATTR_KEYS = ['实力','魅力','智慧','专注','学识','交流','文艺','经营','手工','家务'] as const;
const ATTR_MAX = 300;
const ATTR_CLS: Record<string,string> = {
  实力:'attr-type-power',魅力:'attr-type-charm',智慧:'attr-type-wisdom',专注:'attr-type-focus',
  学识:'attr-type-knowledge',交流:'attr-type-social',文艺:'attr-type-art',经营:'attr-type-business',
  手工:'attr-type-craft',家务:'attr-type-housework',
};
const NPC_METRICS = [
  {key:'心动值',icon:'fa-solid fa-heart',cls:'heart'},
  {key:'情欲值',icon:'fa-solid fa-fire-flame-curved',cls:'lust'},
  {key:'兴奋值',icon:'fa-solid fa-sparkles',cls:'excite'},
  {key:'敏感值',icon:'fa-solid fa-water',cls:'sense'},
  {key:'羞耻值',icon:'fa-solid fa-face-grin-wide',cls:'shame'},
] as const;
const NPC_COUNTS = [
  {key:'高潮次数',icon:'fa-solid fa-sparkles'},
  {key:'被内射次数',icon:'fa-solid fa-droplet'},
] as const;
const NPC_ICON_CFG = [
  {key:'内心想法',icon:'fa-solid fa-comment',label:'内心想法'},
  {key:'当前本能渴望',icon:'fa-solid fa-crosshairs',label:'本能渴望'},
  {key:'姿态动作',icon:'fa-solid fa-child-reaching',label:'姿态动作'},
  {key:'身体状态',icon:'fa-solid fa-hand-holding-heart',label:'身体状态'},
  {key:'基础外貌',icon:'fa-solid fa-eye',label:'基础外貌'},
] as const;
const AVATAR_COLORS = ['#e891b9','#b89ae0','#8bb8d6','#8ec5a4','#f0b878','#d088a8','#9898d0','#68b0c8','#68b898','#e8a860'];
// 需求6：额外属性颜色集合（淡粉/糖果色系）
const EXTRA_ATTR_COLORS = [
  'linear-gradient(90deg,#f0a0b8,#f5c0d8)',
  'linear-gradient(90deg,#e8a0c0,#f0c8e0)',
  'linear-gradient(90deg,#f5b0c0,#fad0e0)',
  'linear-gradient(90deg,#e898b0,#f5b8d0)',
  'linear-gradient(90deg,#f0a8c8,#f8d0e0)',
  'linear-gradient(90deg,#f2b0c8,#f8d0d8)',
];
function pickExtraAttrColor(idx: number): string {
  return EXTRA_ATTR_COLORS[idx % EXTRA_ATTR_COLORS.length];
}

// ================================================================
//  需求1：地点/事件数据（localStorage 覆盖）
// ================================================================
type ManagedKind = 'location'|'event'|'dlc'|'stash-item'|'stash-skill'|'stash-status'|'stash-clothing'|`stash-custom-${string}`;
type ManagedItemV2 = { desc: string; tags: string[]; order?: number; inject?: string; favorite?: boolean; lastEdited?: number; links?: { locations?: string[]; events?: string[]; dlcs?: string[] } };
type ManagedEntryState = { bound: boolean; enabled: boolean; count: number; enabledCount: number; worldbookNames: string[] };
type InspectorEntry = { worldbookName:string; entry:WorldbookEntry; managedKind:ManagedKind|null; managedName:string };
const MANAGED_CFG: Record<ManagedKind,{prefix:string;label:string;storageName:string;icon:string;storageKey:string;bindsWorldbook:boolean;defaultInject:string}> = {
  location: { prefix:'[地点]', label:'地点', storageName:'地点总览', icon:'fa-solid fa-map-pin', storageKey:'_th_locations_v2', bindsWorldbook:true, defaultInject:'<前往{{name}}，该地点简介：{{desc}}>' },
  event: { prefix:'[事件]', label:'事件', storageName:'事件总览', icon:'fa-solid fa-flag', storageKey:'_th_events_v1', bindsWorldbook:true, defaultInject:'<已开启事件：{{name}}，{{desc}}>' },
  dlc: { prefix:'[DLC]', label:'DLC', storageName:'DLC补充', icon:'fa-solid fa-folder-plus', storageKey:'_th_dlcs_v1', bindsWorldbook:true, defaultInject:'<已激活DLC：{{name}}，{{desc}}>' },
  'stash-item': { prefix:'', label:'物品', storageName:'储藏间·物品', icon:'fa-solid fa-box-open', storageKey:'_th_stash_items_v1', bindsWorldbook:false, defaultInject:'<使用物品：{{name}}，{{desc}}>' },
  'stash-skill': { prefix:'', label:'技能', storageName:'储藏间·技能', icon:'fa-solid fa-book', storageKey:'_th_stash_skills_v1', bindsWorldbook:false, defaultInject:'<使用技能：{{name}}，{{desc}}>' },
  'stash-status': { prefix:'', label:'状态', storageName:'储藏间·状态', icon:'fa-solid fa-sparkles', storageKey:'_th_stash_statuses_v1', bindsWorldbook:false, defaultInject:'<触发状态：{{name}}，{{desc}}>' },
  'stash-clothing': { prefix:'', label:'衣物', storageName:'储藏间·衣物', icon:'fa-solid fa-shirt', storageKey:'_th_stash_clothing_v1', bindsWorldbook:false, defaultInject:'<更换衣物：{{name}}，{{desc}}>' },
};
let managedEntryStates: Record<ManagedKind,Record<string,ManagedEntryState>> = { location:{}, event:{}, dlc:{}, 'stash-item':{}, 'stash-skill':{}, 'stash-status':{}, 'stash-clothing':{} };
let currentManagedItems: Record<ManagedKind,Record<string,ManagedItemV2>> = { location:{}, event:{}, dlc:{}, 'stash-item':{}, 'stash-skill':{}, 'stash-status':{}, 'stash-clothing':{} };

// ManagedItemV2 迁移工具：旧 string 格式 → v2 对象格式
function migrateManagedItem(v: string | ManagedItemV2): ManagedItemV2 {
  if (typeof v === 'string') return { desc: v, tags: [], inject: undefined, favorite: false, lastEdited: 0 };
  return { desc: v.desc, tags: v.tags ?? [], order: v.order, inject: v.inject, favorite: !!v.favorite, lastEdited: v.lastEdited ?? 0, links: v.links };
}

function loadManagedItems(key:string): Record<string,ManagedItemV2> {
  const result: Record<string,ManagedItemV2> = {};
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const overrides = JSON.parse(raw) as Record<string,any>;
      if (overrides.added && typeof overrides.added === 'object') {
        // 惰性迁移：旧 string 格式 → v2 对象格式
        for (const [name, v] of Object.entries(overrides.added)) {
          result[name] = migrateManagedItem(v as string | ManagedItemV2);
        }
      }
    }
  } catch(e) { void e; }
  return result;
}
function saveManagedOverrides(kind:ManagedKind) {
  const current = currentManagedItems[kind];
  const storageKey = kind.startsWith('stash-custom-') ? getStashKindStorageKey(kind.replace('stash-custom-', '')) : MANAGED_CFG[kind].storageKey;
  try { localStorage.setItem(storageKey, JSON.stringify({ added: current, deleted: [] })); } catch(e) { void e; }
}
function getManagedItems(kind:ManagedKind): Record<string,ManagedItemV2> {
  const storageKey = kind.startsWith('stash-custom-') ? getStashKindStorageKey(kind.replace('stash-custom-', '')) : MANAGED_CFG[kind].storageKey;
  return loadManagedItems(storageKey);
}
function ensureManagedKindInitialized(kind: ManagedKind) {
  if (!currentManagedItems[kind]) {
    currentManagedItems[kind] = {};
  }
}
function setCurrentManagedItems(kind:ManagedKind, items:Record<string,ManagedItemV2>) {
  ensureManagedKindInitialized(kind);
  currentManagedItems[kind] = items;
}
function addManagedItem(kind:ManagedKind, name:string, item:ManagedItemV2|string) {
  ensureManagedKindInitialized(kind);
  const migrated = migrateManagedItem(item);
  migrated.lastEdited = Date.now(); // 新建/更新时自动更新时间戳
  currentManagedItems[kind][name] = migrated;
  saveManagedOverrides(kind);
}
function deleteManagedItem(kind:ManagedKind, name:string) {
  ensureManagedKindInitialized(kind);
  delete currentManagedItems[kind][name];
  saveManagedOverrides(kind);
}
function toggleFavorite(kind:ManagedKind, name:string): boolean {
  ensureManagedKindInitialized(kind);
  const item = currentManagedItems[kind][name];
  if (!item) return false;
  item.favorite = !item.favorite;
  item.lastEdited = Date.now();
  saveManagedOverrides(kind);
  return !!item.favorite;
}
function copyManagedItem(kind:ManagedKind, name:string): string|null {
  ensureManagedKindInitialized(kind);
  const src = currentManagedItems[kind][name];
  if (!src) return null;
  let newName = name + ' (副本)';
  let i = 1;
  while (currentManagedItems[kind][newName]) {
    newName = name + ` (副本${++i})`;
  }
  addManagedItem(kind, newName, { ...src, favorite: false, lastEdited: Date.now() });
  return newName;
}
function getCurrentManagedItems(kind:ManagedKind): Record<string,ManagedItemV2> {
  ensureManagedKindInitialized(kind);
  return currentManagedItems[kind];
}

// ==================== 储藏间自定义 kind 字典 ====================
const STASH_KINDS_STORAGE_KEY = '_th_stash_kinds_v1';
type StashKindMeta = { icon: string; label: string; order?: number };

function loadStashKinds(): Record<string, StashKindMeta> {
  try {
    const raw = localStorage.getItem(STASH_KINDS_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, StashKindMeta>;
  } catch(e) { void e; }
  return {};
}
function saveStashKinds(kinds: Record<string, StashKindMeta>) {
  try { localStorage.setItem(STASH_KINDS_STORAGE_KEY, JSON.stringify(kinds)); } catch(e) { void e; }
}
function addStashKind(kindName: string, meta: StashKindMeta) {
  const kinds = loadStashKinds();
  kinds[kindName] = meta;
  saveStashKinds(kinds);
  // 确保 currentManagedItems 中有该 kind 的空对象
  const kindKey = `stash-custom-${kindName}` as ManagedKind;
  if (!currentManagedItems[kindKey]) {
    currentManagedItems[kindKey] = {};
  }
}
function deleteStashKind(kindName: string) {
  const kinds = loadStashKinds();
  delete kinds[kindName];
  saveStashKinds(kinds);
  // 同时删除该 kind 的数据
  const storageKey = `_th_stash_custom_${kindName}_v1`;
  try { localStorage.removeItem(storageKey); } catch(e) { void e; }
  // 删除该 kind 的标签
  const tags = loadTags();
  const tagKey = `stash-custom-${kindName}` as ManagedKind;
  if (tags[tagKey]) { delete tags[tagKey]; saveTags(tags); }
}
function getStashKindStorageKey(kindName: string): string {
  return `_th_stash_custom_${kindName}_v1`;
}

// ==================== 标签字典 CRUD（A 段只做数据层，UI B 段做）====================
const TAGS_STORAGE_KEY = '_th_tags_v1';
const GROUP_COLLAPSED_STORAGE_KEY = '_th_group_collapsed_v1';

type Tag = { color: string; desc: string; defaultInject?: string };
type TagsByKind = Record<ManagedKind, Record<string, Tag>>;
type CollapsedByKind = Record<ManagedKind, Record<string, true>>;

function loadTags(): TagsByKind {
  try {
    const raw = localStorage.getItem(TAGS_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as TagsByKind;
  } catch(e) { void e; }
  return { location: {}, event: {}, dlc: {}, 'stash-item': {}, 'stash-skill': {}, 'stash-status': {}, 'stash-clothing': {} };
}
function saveTags(tags: TagsByKind) {
  try { localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(tags)); } catch(e) { void e; }
}
function addTag(kind: ManagedKind, tagName: string, tag: Tag) {
  const tags = loadTags();
  if (!tags[kind]) tags[kind] = {};
  tags[kind][tagName] = tag;
  saveTags(tags);
}
function deleteTag(kind: ManagedKind, tagName: string) {
  const tags = loadTags();
  if (tags[kind]) delete tags[kind][tagName];
  saveTags(tags);
}
function renameTag(kind: ManagedKind, oldName: string, newName: string) {
  const tags = loadTags();
  if (!tags[kind] || !tags[kind][oldName]) return;
  tags[kind][newName] = tags[kind][oldName];
  delete tags[kind][oldName];
  saveTags(tags);

  // 更新所有卡片上的标签名
  const items = getManagedItems(kind);
  let changed = false;
  for (const itemName of Object.keys(items)) {
    const itemTags = items[itemName].tags;
    if (itemTags && itemTags.includes(oldName)) {
      items[itemName].tags = itemTags.map(t => t === oldName ? newName : t);
      changed = true;
    }
  }
  if (changed) {
    setCurrentManagedItems(kind, items);
    saveManagedOverrides(kind);
  }
}
function editTagMeta(kind: ManagedKind, tagName: string, meta: Partial<Tag>) {
  const tags = loadTags();
  if (!tags[kind]) tags[kind] = {};
  tags[kind][tagName] = { ...tags[kind][tagName], ...meta };
  saveTags(tags);
}

// ==================== 物品打标 ====================
function setItemTags(kind: ManagedKind, itemName: string, tags: string[]) {
  const items = getManagedItems(kind);
  if (items[itemName]) {
    items[itemName].tags = tags;
    setCurrentManagedItems(kind, items);
    saveManagedOverrides(kind);
  }
}
function addItemTag(kind: ManagedKind, itemName: string, tagName: string) {
  const items = getManagedItems(kind);
  if (items[itemName]) {
    if (!items[itemName].tags) items[itemName].tags = [];
    if (!items[itemName].tags.includes(tagName)) {
      items[itemName].tags.push(tagName);
      // 如果标签有默认注入模板，且卡片没有自定义 inject，应用默认模板
      const allTags = loadTags();
      const tag = allTags[kind]?.[tagName];
      if (tag?.defaultInject && !items[itemName].inject) {
        items[itemName].inject = tag.defaultInject;
      }
      setCurrentManagedItems(kind, items);
      saveManagedOverrides(kind);
    }
  }
}
function removeItemTag(kind: ManagedKind, itemName: string, tagName: string) {
  const items = getManagedItems(kind);
  if (items[itemName] && items[itemName].tags) {
    items[itemName].tags = items[itemName].tags.filter(t => t !== tagName);
    setCurrentManagedItems(kind, items);
    saveManagedOverrides(kind);
  }
}

// ==================== 桶折叠状态 ====================
function loadBucketCollapsed(): CollapsedByKind {
  try {
    const raw = localStorage.getItem(GROUP_COLLAPSED_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CollapsedByKind;
  } catch(e) { void e; }
  return { location: {}, event: {}, dlc: {} };
}
function saveBucketCollapsed(collapsed: CollapsedByKind) {
  try { localStorage.setItem(GROUP_COLLAPSED_STORAGE_KEY, JSON.stringify(collapsed)); } catch(e) { void e; }
}
function getBucketCollapsed(kind: ManagedKind, tagName: string): boolean {
  const collapsed = loadBucketCollapsed();
  return !!collapsed[kind]?.[tagName];
}
function setBucketCollapsed(kind: ManagedKind, tagName: string, value: boolean) {
  const collapsed = loadBucketCollapsed();
  if (!collapsed[kind]) collapsed[kind] = {};
  if (value) collapsed[kind][tagName] = true;
  else delete collapsed[kind][tagName];
  saveBucketCollapsed(collapsed);
}

// ==================== 标签颜色调色板（§10.5）====================
// 只保留鲜艳的主题色，移除接近白色的文本色和背景色
const TAG_COLOR_PALETTE = [
  'pink', 'pink2',
  'lav', 'lav2',
  'gold', 'gold2',
  'mint', 'mint2',
  'sky', 'sky2',
  'rose', 'rose2',
  'blue', 'blue2',
];

// 标签预设（新建标签时快速选择）
const TAG_PRESETS = [
  { name: '主线', color: 'pink', desc: '推动剧情发展的关键内容' },
  { name: '支线', color: 'lav', desc: '可选的分支任务' },
  { name: '战斗', color: 'gold', desc: '战斗相关场景' },
  { name: '日常', color: 'mint', desc: '日常生活互动' },
  { name: '隐藏', color: 'sky', desc: '隐藏内容/彩蛋' },
];

// ================================================================
//  状态
// ================================================================
let currentData: Record<string,any>|null = null;
let avatarColorMap: Record<string,string> = {};
let avatarImages: Record<string,string> = {};
let avatarVersion = 0;
let uploadingTarget = '';
let isEditMode = false;
let npcFilter: 'all'|'present'|'absent' = 'all'; // 需求9：NPC在场筛选
let npcSearchText: string = ''; // 批次6：NPC 搜索（姓名 + 身份），实时过滤

// 0612悬浮球：NPC 筛选持久化到 parent localStorage（跨聊天/角色卡保留）
const NPC_FILTER_STORAGE_KEY = '_th_npc_filter_v2';
const NPC_SEARCH_STORAGE_KEY = '_th_npc_search_v2'; // 批次6：搜索文本持久化
function __parentStorage(): Storage | null {
  try { return (window.parent as Window).localStorage; } catch(e){ void e; return null; }
}
function loadPersistedNpcFilter(): 'all'|'present'|'absent' {
  try {
    const ls = __parentStorage() || localStorage;
    const v = ls.getItem(NPC_FILTER_STORAGE_KEY);
    if (v === 'all' || v === 'present' || v === 'absent') return v;
  } catch(e){ void e; }
  return 'all';
}
function savePersistedNpcFilter(v: 'all'|'present'|'absent') {
  try {
    const ls = __parentStorage() || localStorage;
    ls.setItem(NPC_FILTER_STORAGE_KEY, v);
  } catch(e){ void e; }
}

// 批次6：NPC 搜索文本持久化（沿用 _v2 后缀，max 200 字符防滥用）
function loadPersistedNpcSearch(): string {
  try {
    const ls = __parentStorage() || localStorage;
    const v = ls.getItem(NPC_SEARCH_STORAGE_KEY) || '';
    return typeof v === 'string' ? v.slice(0, 200) : '';
  } catch(e){ void e; return ''; }
}
function savePersistedNpcSearch(v: string) {
  try {
    const ls = __parentStorage() || localStorage;
    ls.setItem(NPC_SEARCH_STORAGE_KEY, v.slice(0, 200));
  } catch(e){ void e; }
}

// 批次3.2：同步合并后的"在场/离场"按钮 textContent + active（模块顶层，启动时 init 也能调）
function applyPresenceBtn() {
  const btn = qs('.th-btn-presence-switcher');
  if (!btn) return;
  const active = (npcFilter === 'present' || npcFilter === 'absent');
  btn.classList.toggle('active', active);
  btn.textContent = (npcFilter === 'absent') ? '离场' : '在场';
}

const _wrapperId = 'th-status-'+Math.random().toString(36).slice(2,8);
let _wrapperEl: HTMLElement|null = null;
function gw(): HTMLElement|null {
  if(_wrapperEl?.isConnected) return _wrapperEl;
  const owned = __doc.querySelector<HTMLElement>('.th-status-wrapper[data-th-id="'+_wrapperId+'"]');
  if (owned) { _wrapperEl = owned; return _wrapperEl; }
  const wrappers = Array.from(__doc.querySelectorAll<HTMLElement>('.th-status-wrapper'));
  const unclaimed = wrappers.filter(w => !w.hasAttribute('data-th-id'));
  _wrapperEl = unclaimed[unclaimed.length - 1] || wrappers[wrappers.length - 1] || null;
  return _wrapperEl;
}
function qs<T extends HTMLElement>(s:string): T|null { const w=gw(); return w?w.querySelector<T>(s):null; }
function qsa<T extends HTMLElement>(s:string): NodeListOf<T> { const w=gw(); return w?w.querySelectorAll<T>(s):([] as any); }
// 在指定 root 下查（仅用于已脱离 wrapper 的独立 portal 元素，如审核编辑 overlay 直接 append 到 __body）
// 注意：root 必须是 parent document 下的元素；不传 root 时默认 document 是 iframe doc，会查不到东西。
// wrapper 内的 modal 元素一律用 qs()/qsa()，不要用 qsRoot。
function qsRoot<T extends HTMLElement>(s:string, root: ParentNode): T|null { return root.querySelector<T>(s); }
function qsaRoot<T extends HTMLElement>(s:string, root: ParentNode): NodeListOf<T> { return root.querySelectorAll<T>(s); }
function setH(s:string,h:string) { const el=qs(s); if(el)el.innerHTML=h; }
function setT(s:string,t:string) { const el=qs(s); if(el)el.textContent=t; }
function clamp(v:number,a:number,b:number) { return Math.max(a,Math.min(b,v)); }
function attrPct(v:number) { return clamp(Math.round(v*100/ATTR_MAX),0,100); }

const activeMessageOption: VariableOption = {type:'message', message_id:'latest'};

function readVariables(option: VariableOption): Record<string,any> {
  try { return safeGetVariables(option); }
  catch(e){ void e; }
  try {
    const mvu = getMvu();
    if(mvu?.getMvuData) return mvu.getMvuData(option);
  } catch(e){ void e; }
  throw new Error('No variable reader is available');
}

function hasStatData(option: VariableOption): boolean {
  try { return _.has(readVariables(option),'stat_data'); }
  catch(e){ void e; return false; }
}

function readData(): Record<string,any>|null {
  try {
    const s=_.get(readVariables(activeMessageOption),'stat_data');
    if(s&&typeof s==='object'&&!Array.isArray(s)) return s;
  } catch(e){ void e; }
  return currentData;
}
function saveData(d:Record<string,any>) {
  const option=activeMessageOption;
  try {
    safeUpdateVariablesWith(v=>{_.set(v,'stat_data',d);return v;},option);
    return;
  } catch(e){ void e; }
  try {
    const mvu = getMvu();
    if(mvu?.getMvuData&&mvu?.replaceMvuData){
      const data=mvu.getMvuData(option);
      _.set(data,'stat_data',d);
      void mvu.replaceMvuData(data,option);
      return;
    }
  } catch(e){ void e; }
}
function refresetH() { currentData=readData(); if(currentData) { syncReviewBaseline(currentData); render(currentData); } }
// 手动刷新（PROGRESS §7 Step B 收尾）：用户点 th-btn-refresh 触发。
// 比 refresetH 多走一次 collectStatDataChange：若基线落后（如外部变量管理器改了数据），
// 这里补一次审核采集并同步基线；基线已同步时 isEqual 短路，无副作用。
function manualRefresh() {
  const data = (() => { try { return readData(); } catch(e) { void e; return null; } })();
  if (!data) { refresetH(); return; }
  try { collectStatDataChange(data, { snapshot: false, label: 'manualRefresh' }); } catch(e) { void e; }
  refresetH();
}
// 内部状态已被本地修改（保存链路、按钮触发、筛选切换等），直接用 currentData 重新渲染。
// 显式清掉 _renderCache 强制全量重绘，避免在保存链路中再做稳定的 JSON.stringify 比较。
function renderCurrent() { if(currentData) { clearRenderCache(); render(currentData); } }
// 使用短延迟合并连续变量更新。MVU 可能在一次输出后连续触发多次事件，rAF 级别重绘仍会造成卡顿。
let _renderScheduled = false;
function scheduleRender() {
  if(_renderScheduled) return;
  _renderScheduled = true;
  setTimeout(()=>{
    _renderScheduled = false;
    refresetH();
  },120);
}

const _renderCache = { world: '', user: '', npc: '' };
function clearRenderCache() {
  _renderCache.world = '';
  _renderCache.user = '';
  _renderCache.npc = '';
}
function stableRenderKey(value:any): string {
  try { return JSON.stringify(value); }
  catch(e) { void e; return String(Date.now()); }
}

const IMG_KEY='_th_avatar_images';
const GALLERY_KEY='_th_npc_gallery';
function loadImages(): Record<string,string> { try { const s=safeGetVariables({type:'chat'}); const im=_.get(s,IMG_KEY,{}); return im&&typeof im==='object'?im:{}; } catch(e){ return{}; } }
function saveImages() { try { avatarVersion++; clearRenderCache(); safeUpdateVariablesWith(v=>{_.set(v,IMG_KEY,avatarImages); return v;},{type:'chat'}); } catch(e){ void e; } }
// 需求6：画廊存储
let galleryImages: Record<string,string[]> = {};
function loadGallery(): Record<string,string[]> { try { const s=safeGetVariables({type:'chat'}); const g=_.get(s,GALLERY_KEY,{}); return g&&typeof g==='object'?g:{}; } catch(e){ return{}; } }
function saveGallery() { try { safeUpdateVariablesWith(v=>{_.set(v,GALLERY_KEY,galleryImages); return v;},{type:'chat'}); } catch(e){ void e; } }
function getNPCGallery(npcName:string): string[] { return galleryImages[npcName]||[]; }
function addNPCGalleryImage(npcName:string, dataUrl:string) { if(!galleryImages[npcName]) galleryImages[npcName]=[]; galleryImages[npcName].push(dataUrl); saveGallery(); }
function deleteNPCGalleryImage(npcName:string, idx:number) { if(!galleryImages[npcName]) return; galleryImages[npcName].splice(idx,1); saveGallery(); }

const DOLLAR_KEY = String.fromCharCode(36);
const MACRO_L = String.fromCharCode(123,123);
const MACRO_R = String.fromCharCode(125,125);
const ANGLE_USER_KEY = [60,117,115,101,114,62].map(code=>String.fromCharCode(code)).join('');
function tavernMacro(name:string): string { return MACRO_L+name+MACRO_R; }
const SK=['世界信息','NPC','_',DOLLAR_KEY];
function isUserPlaceholderKey(key:string): boolean {
  return key===tavernMacro('user')||key===ANGLE_USER_KEY||key==='user';
}
function getUserCandidateKeys(d:Record<string,any>): string[] {
  return Object.keys(d).filter(k=>!SK.includes(k)&&!k.startsWith('_')&&!k.startsWith(DOLLAR_KEY)&&d[k]&&typeof d[k]==='object'&&d[k]['属性']);
}
function getUK(d:Record<string,any>): string|null {
  const keys=getUserCandidateKeys(d);
  return keys.find(k=>!isUserPlaceholderKey(k))||keys[0]||null;
}
function getUser(d:Record<string,any>): Record<string,any> { const k=getUK(d); return k?d[k] as Record<string,any>:(_.get(d,tavernMacro('user'),{})||{}); }
function setUser(d:Record<string,any>,ud:Record<string,any>) { const k=getUK(d); if(k)d[k]=ud; else _.set(d,tavernMacro('user'),ud); }
function getNPCs(d:Record<string,any>) { const n=_.get(d,'NPC',{})||{}; return Object.entries(n).map(([k,v])=>({name:k,info:v as Record<string,any>})); }
function getNPCInfo(d:Record<string,any>|null, npcName:string): Record<string,any>|null {
  if(!d||!npcName) return null;
  const npcs=_.get(d,'NPC',{})||{};
  const info=npcs[npcName];
  return info&&typeof info==='object'?info as Record<string,any>:null;
}

// 需求7：NPC排序 — 在场优先，在场内按仙主顺序，不在场内按首字母
function extractXianzhuOrder(identity:string): number {
  const m=identity.match(/第([一二三四五六七八九十百千]+)仙主/);
  if(!m) return Infinity;
  const map:Record<string,number>={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'十一':11,'十二':12,'十三':13,'十四':14,'十五':15,'十六':16,'十七':17,'十八':18,'十九':19,'二十':20};
  return map[m[1]]||Infinity;
}
function sortNPCs(npcs:{name:string;info:Record<string,any>}[]): {name:string;info:Record<string,any>}[] {
  const present=npcs.filter(n=>n.info['是否在场']===true);
  const absent=npcs.filter(n=>n.info['是否在场']!==true);
  // 在场内排序：按仙主顺序，若都没有仙主则按名称首字母
  present.sort((a,b)=>{
    const oa=extractXianzhuOrder(a.info['身份']||'');
    const ob=extractXianzhuOrder(b.info['身份']||'');
    if(oa!==ob) return oa-ob;
    return a.name.localeCompare(b.name,'zh');
  });
  // 不在场内按名称首字母排序
  absent.sort((a,b)=>a.name.localeCompare(b.name,'zh'));
  return [...present,...absent];
}

// 需求7：切换NPC在场状态
function toggleNpcPresence(npcName:string) {
  if(!currentData) return;
  const npcs=_.get(currentData,'NPC',{})||{};
  const npc=npcs[npcName];
  if(!npc) return;
  const current=_.get(npc,'是否在场',false);
  _.set(npc,'是否在场',!current);
  _.set(currentData,'NPC',npcs);
  saveData(currentData);
  // PROGRESS §7 Step B：本地编辑保存后统一采集审核变更
  try { collectStatDataChange(currentData, { snapshot: true, label: 'toggleNpcPresence' }); } catch(e) { void e; }
  renderCurrent();
}
function getWorld(d:Record<string,any>) { return _.get(d,'世界信息',{})||{}; }
function getUN(d:Record<string,any>) { return getUK(d)||'主角'; }
/** 返回玩家数据的实际 key（用于编辑路径构造） */
function getUserKey(d:Record<string,any>): string { return getUK(d)||tavernMacro('user'); }

// ================================================================
//  渲染总入口
// ================================================================
function render(data: Record<string,any>) {
  // 一次性取出三个顶层子结构，避免 stableRenderKey / 子渲染函数重复调用 getWorld / getUser
  const world = getWorld(data);
  const user = getUser(data);
  const uname = getUN(data);

  const worldKey = stableRenderKey({ data:world, edit:isEditMode });
  if(worldKey!==_renderCache.world){ _renderCache.world=worldKey; renderWorldInfo(data); }

  const userKey = stableRenderKey({ data:user, uname, area:world['当前所处区域名称'], edit:isEditMode, avatarVersion });
  if(userKey!==_renderCache.user){ _renderCache.user=userKey; renderUserPanel(data); }

  const npcKey = stableRenderKey({ data:_.get(data,'NPC',{}), filter:npcFilter, search:npcSearchText, avatarVersion });
  if(npcKey!==_renderCache.npc){ _renderCache.npc=npcKey; renderNPCGrid(data); }

  // 批次8：数值条数字 CountUp 入口动画（gsap 0→目标值 滚动 + 已有 width CSS transition 配合）
  // 限制：jQuery 每次 render 重建元素，无 from value，每次 render 数字都从 0 涨——视觉是"看到数据变化"，可接受
  countUpNumericValues();
}

// 批次8：找所有数值类数字元素（.th-attr-val / .th-npc-metric-val / .th-wheel-val-cascade），gsap 从 0 滚到目标值
const _countedElements = new WeakSet<HTMLElement>();
function countUpNumericValues() {
  // 只对当前可见的数字做（按父元素可见性）
  const w = gw();
  if (!w) return;
  const sels = ['.th-attr-val', '.th-npc-metric-val', '.th-wheel-val-cascade'];
  for (const sel of sels) {
    qsa<HTMLElement>(sel).forEach(el => {
      if (_countedElements.has(el)) return;
      // 跳过编辑模式（input 元素，不是 span）
      if (el.tagName === 'INPUT') return;
      const txt = el.textContent || '';
      const target = parseInt(txt.trim(), 10);
      if (!Number.isFinite(target) || target === 0) {
        // 值为 0 或 NaN：不滚动，直接显示
        _countedElements.add(el);
        return;
      }
      const obj = { val: 0 };
      el.textContent = '0'; // 起点
      _countedElements.add(el);
      gsap.to(obj, {
        val: target,
        duration: 0.8,
        ease: 'power2.out',
        onUpdate() {
          el.textContent = String(Math.round(obj.val));
        },
      });
    });
  }
}

function renderWorldInfo(data:Record<string,any>) {
  const w=getWorld(data);
  const date=esc(w['日期']||''); const time=esc(w['时间']||''); const weather=esc(w['天气']||'');
  let timeIcon='fa-solid fa-clock';
  const hour=parseInt(time.split(':')[0]);
  if(!isNaN(hour)){
    if(hour>=6&&hour<8) timeIcon='fa-solid fa-cloud-sun';
    else if(hour>=8&&hour<18) timeIcon='fa-solid fa-sun';
    else if(hour>=18&&hour<20) timeIcon='fa-solid fa-cloud-moon';
    else timeIcon='fa-solid fa-moon';
  }
  // 需求9：仅更新日期/时间/天气，不覆盖NPC筛选按钮
  setH('.th-world-date', `<i class="fa-solid fa-calendar-days"></i> ${isEditMode?editableInput(w['日期']||'','世界信息.日期'):esc(date)}`);
  setH('.th-world-time', `<i class="${timeIcon}"></i> ${isEditMode?editableInput(w['时间']||'','世界信息.时间'):esc(time)}`);
  setH('.th-world-weather', `<i class="fa-solid fa-cloud-sun"></i> ${isEditMode?editableInput(w['天气']||'','世界信息.天气'):esc(weather)}`);
}

// ================================================================
//  User 面板
// ================================================================
function renderUserPanel(data:Record<string,any>) {
  const u=getUser(data); if(!u) return;
  const uname=getUN(data);
  const ukey=getUserKey(data);
  setH('.th-user-name-display', isEditMode?editableInput(uname,`${ukey}.名称`):esc(uname));
  const world=getWorld(data);
  const locHtml = isEditMode
    ? `${esc(world['当前所处区域名称']||'未知区域')} · ${editableInput(u['位置']||'未知地点',`${ukey}.位置`)}`
    : `${esc(world['当前所处区域名称']||'未知区域')} · ${esc(u['位置']||'未知地点')}`;
  setH('.th-user-hero-info .th-location-text', `<i class="fa-solid fa-map-pin"></i> ${locHtml}`);
  setH('.th-money-text', isEditMode ? editableInput(`${_.get(u,'货币.金钱',0)}`,`${ukey}.货币.金钱`,'number') : esc(`${_.get(u,'货币.金钱',0)}`));
  // 需求1：迷你背包+技能按钮替换好感总览
  renderMiniActions(u);
  renderUserAvatar();
  renderUserPB(u, ukey);
  renderStatusBlocks(u, ukey);
  renderClothingBlocks(u, ukey);
}

function renderUserAvatar() {
  const img=qs<HTMLImageElement>('.th-user-hero .th-avatar-img');
  const ph=qs<HTMLElement>('.th-user-hero .th-avatar-placeholder');
  const btn=qs<HTMLElement>('.th-avatar-btns');
  const url=avatarImages['user']||'';
  if(img&&url){ img.setAttribute('src',url); img.style.display='block'; if(ph)ph.style.display='none'; if(btn)btn.style.display='flex'; }
  else { if(ph)ph.style.display=''; if(img){img.style.display='none';img.removeAttribute('src');} if(btn)btn.style.display='none'; }
}

// ================================================================
//  需求1：迷你背包+技能按钮（替换好感总览）
// ================================================================
function renderMiniActions(user:Record<string,any>) {
  const el=qs('.th-mini-actions'); if(!el) return;
  const items=_.get(user,'拥有物品',{})||{};
  const skills=_.get(user,'拥有技能',{})||{};
  const iCount=Object.keys(items).length;
  const sCount=Object.keys(skills).length;
  el.innerHTML=`
    <button class="th-mini-btn th-mini-bag"><i class="fa-solid fa-box-open"></i> 背包 <span class="th-mini-count">${iCount}</span></button>
    <button class="th-mini-btn th-mini-skill"><i class="fa-solid fa-scroll"></i> 技能 <span class="th-mini-count">${sCount}</span></button>
  `;
  qs('.th-mini-bag')?.addEventListener('click',(e:Event)=>{ e.stopPropagation(); if(currentData) openUserBag(currentData); });
  qs('.th-mini-skill')?.addEventListener('click',(e:Event)=>{ e.stopPropagation(); if(currentData) openUserSkill(currentData); });
  // 需求6：悬停显示全部物品/技能详情（与NPC一致）
  qs('.th-mini-bag')?.addEventListener('mouseenter',(e:Event)=>{
    showItemsHoverTip((e.target as HTMLElement).closest('.th-mini-bag') as HTMLElement, items, '背包');
  });
  qs('.th-mini-bag')?.addEventListener('mouseleave',()=>{ hideHoverTip(); });
  qs('.th-mini-skill')?.addEventListener('mouseenter',(e:Event)=>{
    showSkillsHoverTip((e.target as HTMLElement).closest('.th-mini-skill') as HTMLElement, skills, '技能');
  });
  qs('.th-mini-skill')?.addEventListener('mouseleave',()=>{ hideHoverTip(); });
}

// ================================================================
//  需求4：User 姿态+身体 hover显示+click弹详情
// ================================================================
function renderUserPB(user:Record<string,any>, ukey:string) {
  const posture=user['姿态动作']||'暂无动作';
  const bodyState=user['身体状态']||'暂无描述';
  // 给按钮绑上 data 属性供 hover/click 使用
  const pb=qs('.th-pb-posture'); if(pb) { pb.setAttribute('data-pb-text',escAttr(posture)); pb.setAttribute('data-pb-path',`${ukey}.姿态动作`); }
  const bb=qs('.th-pb-body'); if(bb) { bb.setAttribute('data-pb-text',escAttr(bodyState)); bb.setAttribute('data-pb-path',`${ukey}.身体状态`); }
}

// ================================================================
//  需求3：状态方块（hover浮窗 + click弹详情）
// ================================================================
function renderStatusBlocks(user:Record<string,any>, ukey:string) {
  const c=qs('.th-status-blocks'); if(!c) return;
  const st=_.get(user,'状态',{})||{}; const entries=Object.entries(st);
  setT('.th-section-count',entries.length?`${entries.length}`:'');
  const addBlock=`<span class="th-block th-block-add" data-add-trigger="status" data-add-base="${escAttr(ukey)}.状态" data-add-owner="${escAttr(getUN(currentData||{}))}"><i class="fa-solid fa-plus"></i> 新增状态</span>`;
  c.innerHTML=(entries.length?entries.map(([n,info]:[string,any])=>{
    const eff=info?.['效果']||''; const src=info?.['来源']||''; const dur=info?.['持续时间']||'';
    const dotCls=getDotCls(eff);
    return `<span class="th-block th-block-status" data-btype="status" data-bname="${escAttr(n)}" data-beffect="${escAttr(eff)}" data-bsource="${escAttr(src)}" data-bduration="${escAttr(dur)}" data-bpath="${escAttr(ukey)}.状态.${escAttr(n)}"><span class="th-tag-dot ${dotCls}"></span> ${esc(n)}</span>`;
  }).join(''):'<span class="th-empty" style="padding:8px 0">暂无状态</span>')+addBlock;
  bindBlockHoverAndClick(c, 'status');
}
function bindBlockHoverAndClick(container:HTMLElement, type:string) {
  if (container.dataset.blockEventsBound === 'true') return;
  container.dataset.blockEventsBound = 'true';
  const sel = type==='status' ? '.th-block-status' : '.th-block-clothing';

  // 使用 mouseover/mouseout 委托，避免在方块内部子元素间移动时误触发 mouseleave 导致浮窗闪关
  container.addEventListener('mouseover', (e:MouseEvent) => {
    const el = enteredWithin<HTMLElement>(container,e,sel);
    if (!el) return;
    if(type==='status'){
      showHoverTip(el,'status',{
        name:el.getAttribute('data-bname')||'',
        effect:el.getAttribute('data-beffect')||'',
        source:el.getAttribute('data-bsource')||'',
        duration:el.getAttribute('data-bduration')||'',
      });
    } else {
      showHoverTip(el,'clothing',{
        name:el.getAttribute('data-bname')||'',
        part:el.getAttribute('data-bpart')||'',
        state:el.getAttribute('data-bstate')||'',
        detail:el.getAttribute('data-bdetail')||'',
      });
    }
  });

  container.addEventListener('mouseout', (e:MouseEvent) => {
    if (leftWithin(container,e,sel)) hideHoverTip();
  });

  container.addEventListener('click', (e:Event) => {
    const el = (e.target as HTMLElement).closest(sel) as HTMLElement;
    if (!el || !container.contains(el)) return;
    e.stopPropagation();
    const path=el.getAttribute('data-bpath')||'';
    if(type==='status'){
      const n=el.getAttribute('data-bname')||'';
      const eff=el.getAttribute('data-beffect')||'';
      const src=el.getAttribute('data-bsource')||'';
      const dur=el.getAttribute('data-bduration')||'';
      openStatusDetail(n,eff,src,dur,path);
    } else {
      const n=el.getAttribute('data-bname')||'';
      const part=el.getAttribute('data-bpart')||'';
      const state=el.getAttribute('data-bstate')||'';
      const detail=el.getAttribute('data-bdetail')||'';
      openClothingDetailModal(n,part,state,detail,path);
    }
  });
}

// ================================================================
//  需求3：穿着方块（hover浮窗 + click弹详情）
// ================================================================
function renderClothingBlocks(user:Record<string,any>, ukey:string) {
  const c=qs('.th-clothing-blocks'); if(!c) return;
  const cl=_.get(user,'当前穿着衣物',{})||{}; const entries=Object.entries(cl);
  const addBlock=`<span class="th-block th-block-add" data-add-trigger="clothing" data-add-base="${escAttr(ukey)}.当前穿着衣物" data-add-owner="${escAttr(getUN(currentData||{}))}"><i class="fa-solid fa-plus"></i> 新增衣物</span>`;
  c.innerHTML=(entries.length?entries.map(([n,info]:[string,any])=>{
    const part=info?.['穿着部位']||''; const state=info?.['衣物状态']||'';
    const detail=info?.['外观详情']||'';
    const dotCls=getDotCls(state);
    return `<span class="th-block th-block-clothing" data-btype="clothing" data-bname="${escAttr(n)}" data-bpart="${escAttr(part)}" data-bstate="${escAttr(state)}" data-bdetail="${escAttr(detail)}" data-bpath="${escAttr(ukey)}.当前穿着衣物.${escAttr(n)}"><i class="fa-solid fa-vest"></i> ${esc(n)} · ${esc(part)} <span class="th-tag-dot ${dotCls}"></span></span>`;
  }).join(''):'<span class="th-empty" style="padding:8px 0">暂无穿着</span>')+addBlock;
  bindBlockHoverAndClick(c, 'clothing');
}

// ================================================================
//  悬停浮窗系统
// ================================================================
let hoverTimeout: ReturnType<typeof setTimeout>|null = null;
// 批次2：floating-ui 公共 helper。两个 tip 池（.th-hover-tip / .th-loc-hover-tip）
// 各持一个 cleanup，切换时释放旧的避免多个 autoUpdate 并存。
let activeHoverCleanup: (() => void)|null = null;
let activeLocCleanup: (() => void)|null = null;

// 批次N：§10.4 + §10.2 — .th-hover-tip portal 化到 parent body（z-index 110000 + pointer-events: auto）。
// 模仿 .th-loc-hover-tip 套路：lazy 创建 + __doc.createElement + __body.appendChild。
// 模板里 .th-hover-tip 节点已删除，portal 节点由本函数首次调用时挂载。
// keepalive 监听器在节点创建时一次性挂上（所有 5 个 show 函数共用）：
//   鼠标移入 tip 取消 hideHoverTip 的 140ms 延迟；移出 tip 立即关。
// §10.4 验收回归：portal 化前 CSS pointer-events: auto !important 曾“看起来”让背包/技能可移入，
// 实际是没设 keepalive 导致 140ms 后必关。保持监听器常驻即可（display: none 时不触发）。
let hoverTip: HTMLElement | null = null;
function ensureHoverTip(): HTMLElement {
  if (!hoverTip) {
    hoverTip = __doc.createElement('div');
    hoverTip.className = 'th-hover-tip';
    hoverTip.style.display = 'none';
    hoverTip.onmouseenter = () => { if (hoverTimeout) { clearTimeout(hoverTimeout); hoverTimeout = null; } };
    hoverTip.onmouseleave = () => { hideHoverTipNow(); };
    __body.appendChild(hoverTip);
  }
  return hoverTip;
}

/**
 * 用 @floating-ui/dom 把 tip 定位到 anchor 旁。
 * - strategy:'fixed' → 只写 position:fixed + left/top，不用 transform，
 *   避免与 .th-fab-panel 硬约束（禁止父级 transform/filter/backdrop-filter）冲突，
 *   也避免与 CSS animation: tip-in 的 transform keyframe 打架。
 * - autoUpdate 在 anchor/tip 几何变化（scroll / resize / 面板拖动）时自动重定位。
 */
function positionTipWithFloatingUi(
  tip: HTMLElement,
  anchor: HTMLElement,
  pool: 'hover' | 'loc',
  opts: { placement?: Placement; offset?: number; maxW?: number; show?: boolean } = {}
) {
  const { placement = 'right-start', offset: off = 12, maxW, show = true } = opts;
  if (maxW) tip.style.maxWidth = `${maxW}px`;
  // 释放旧 cleanup
  const prev = pool === 'hover' ? activeHoverCleanup : activeLocCleanup;
  if (prev) { prev(); }
  // 临时隐藏以测量 + 避免首次左上角闪烁
  if (show) {
    tip.style.visibility = 'hidden';
    tip.style.display = 'block';
  }
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    tip.style.display = 'none';
    if (pool === 'hover') { if (activeHoverCleanup === cleanup) activeHoverCleanup = null; }
    else { if (activeLocCleanup === cleanup) activeLocCleanup = null; }
    cleanup();
  };
  const cleanup = autoUpdate(anchor, tip, async () => {
    // anchor 已脱离 DOM（卡片被移除/重渲染）或几何为 0 时，停止定位并隐藏 tip，
    // 避免 computePosition 返回 (0,0) 导致 tip 卡在浏览器左上角。
    if (!anchor.isConnected) { stop(); return; }
    const anchorRect = anchor.getBoundingClientRect();
    if (anchorRect.width === 0 && anchorRect.height === 0) { stop(); return; }
    const { x, y } = await computePosition(anchor, tip, {
      placement,
      strategy: 'fixed',
      middleware: [
        offset(off),
        flip({ padding: 8 }),
        shift({ padding: 8 }),
      ],
    });
    // 二次校验：定位计算期间 anchor 可能已被移除
    if (!anchor.isConnected) { stop(); return; }
    Object.assign(tip.style, { left: `${x}px`, top: `${y}px` });
    if (show) tip.style.visibility = 'visible';
  });
  if (pool === 'hover') activeHoverCleanup = cleanup;
  else activeLocCleanup = cleanup;
}

function showHoverTip(anchor:HTMLElement, type:string, data:Record<string,string>) {
  if(hoverTimeout) clearTimeout(hoverTimeout);
  const tip=ensureHoverTip(); if(!tip) return;
  // 使用 will-change 提示浏览器优化
  (tip as HTMLElement).style.willChange = 'transform, opacity';
  let html='';
  let typeClass = '';
  if(type==='status'){
    typeClass = 'th-hover-tip-gear';
    html=`<div class="th-gear-card"><div class="th-gear-name"><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--lav);font-size:12px"></i> ${esc(data.name)}</div><div class="th-gear-detail">${esc(data.effect)}</div>`;
    if(data.source||data.duration){
      html+=`<div class="th-gear-meta">`;
      if(data.source) html+=`<div style="margin-bottom:3px"><i class="fa-solid fa-tag"></i> 来源: ${esc(data.source)}</div>`;
      if(data.duration) html+=`<div><i class="fa-solid fa-clock"></i> 持续: ${esc(data.duration)}</div>`;
      html+=`</div>`;
    }
    html+=`</div>`;
  } else if(type==='clothing'){
    typeClass = 'th-hover-tip-single-clothing';
    const st=(data.state||'').toLowerCase();
    let stateCls='neutral'; let stateIcon='fa-solid fa-circle';
    if(st.includes('破损')||st.includes('破')||st.includes('撕裂')){ stateCls='bad'; stateIcon='fa-solid fa-triangle-exclamation'; }
    else if(st.includes('湿')||st.includes('脏')||st.includes('乱')){ stateCls='warn'; stateIcon='fa-solid fa-droplet'; }
    else if(st.includes('新')||st.includes('干净')||st.includes('整洁')){ stateCls='good'; stateIcon='fa-solid fa-check'; }
    html=`<div class="th-single-clothing-header"><div class="th-single-clothing-icon"><i class="fa-solid fa-vest"></i></div><div><div class="th-single-clothing-title">${esc(data.name)}</div>`;
    if(data.part) html+=`<div class="th-single-clothing-part"><i class="fa-solid fa-location-dot"></i> ${esc(data.part)}</div>`;
    html+=`</div></div>`;
    if(st) html+=`<span class="th-clothing-state ${stateCls}"><i class="${stateIcon}"></i> ${esc(st)}</span>`;
    if(data.detail) html+=`<div class="th-single-clothing-detail">${esc(data.detail)}</div>`;
  } else if(type==='identity'){
    html=`<div class="th-hover-tip-title"><i class="fa-solid fa-crown"></i> ${esc(data.name)}</div><div>${esc(data.identity)}</div>`;
  } else if(type==='icon'){
    html=`<div class="th-hover-tip-title"><i class="${esc(data.icon||'')}"></i> ${esc(data.label||'')}</div><div>${esc(data.content||'')}</div>`;
  } else if(type==='attr'){
    html=`<div class="th-hover-tip-title"><i class="fa-solid fa-chart-pie"></i> ${esc(data.name)} · 属性</div>${data.html||''}`;
  } else if(type==='pb'){
    html=`<div class="th-hover-tip-title"><i class="${esc(data.icon||'')}"></i> ${esc(data.label||'')}</div><div style="font-size:13px;line-height:1.7">${esc(data.content||'')}</div>`;
  } else if(type==='counts'){
    html=`<div class="th-hover-tip-title"><i class="fa-solid fa-heart-circle-plus"></i> 亲密记录</div><div class="th-hover-tip-row"><i class="fa-solid fa-sparkles"></i> 高潮次数: <b>${esc(data.orgasm||'0')}</b></div><div class="th-hover-tip-row"><i class="fa-solid fa-water"></i> 被内射次数: <b>${esc(data.creampie||'0')}</b></div>`;
  }
  // 批量设置，先内容后定位，最后显示，避免首次显示时在左上角闪现
  const maxW = type==='clothing'?320:(type==='pb'?350:(type==='attr'?420:260));
  tip.className = 'th-hover-tip ' + (typeClass || ('th-hover-tip-'+type));
  tip.innerHTML=html;
  positionTipWithFloatingUi(tip, anchor, 'hover', { maxW });
  // keepalive 监听器在 ensureHoverTip() 创建 portal 节点时已一次性挂上，
  // 此处不再重复设置。portal 节点生命周期 = 整个 status-bar 生命周期，常驻监听器无副作用。
}
function hideHoverTip() {
  if (hoverTimeout) clearTimeout(hoverTimeout);
  hoverTimeout = setTimeout(() => { hideHoverTipNow(); }, 140);
}
function hideHoverTipNow() {
  if(hoverTimeout) { clearTimeout(hoverTimeout); hoverTimeout=null; }
  const tip=ensureHoverTip(); if(!tip) return;
  tip.style.display='none';
  tip.className = 'th-hover-tip';
  // keepalive 监听器在 ensureHoverTip() 一次性挂上后保持常驻，display: none 时不触发，无需清空。
  if (activeHoverCleanup) { activeHoverCleanup(); activeHoverCleanup = null; }
}

// ================================================================
//  需求3：背包全量详情悬停
// ================================================================
function showItemsHoverTip(anchor:HTMLElement, items:Record<string,any>, label:string) {
  if(hoverTimeout) clearTimeout(hoverTimeout);
  const tip=ensureHoverTip(); if(!tip) return;
  const entries=Object.entries(items);
  let html=`<div class="th-hover-tip-title"><i class="fa-solid fa-box-open"></i> ${label} (${entries.length})</div>`;
  if(!entries.length){ html+='<div style="font-size:12px;color:var(--tx3)">空空如也~</div>'; }
  else {
    for(const[n,it] of entries){
      const cnt=it?.['数量']??1;
      const desc=it?.['简介']||'';
      const eff=it?.['效果']||'';
      html+=`<div class="th-hover-item-entry"><div class="th-hover-item-name">${esc(n)} <span style="font-size:11px;color:var(--pink)">x${cnt}</span></div>`;
      if(desc) html+=`<div class="th-hover-item-desc">${esc(desc)}</div>`;
      if(eff) html+=`<div class="th-hover-item-meta"><i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(eff)}</div>`;
      html+=`</div>`;
    }
  }
  tip.innerHTML=html; tip.classList.add('th-hover-tip-full');
  positionTipWithFloatingUi(tip, anchor, 'hover', { maxW: 400 });
}
function showSkillsHoverTip(anchor:HTMLElement, skills:Record<string,any>, label:string) {
  if(hoverTimeout) clearTimeout(hoverTimeout);
  const tip=ensureHoverTip(); if(!tip) return;
  const entries=Object.entries(skills);
  let html=`<div class="th-hover-tip-title"><i class="fa-solid fa-scroll"></i> ${label} (${entries.length})</div>`;
  if(!entries.length){ html+='<div style="font-size:12px;color:var(--tx3)">尚未习得~</div>'; }
  else {
    for(const[n,sk] of entries){
      const lv=sk?.['等级']??1;
      const desc=sk?.['简介']||'';
      const eff=sk?.['效果']||'';
      html+=`<div class="th-hover-item-entry"><div class="th-hover-item-name">${esc(n)} <span style="font-size:11px;color:var(--lav)">Lv${lv}</span></div>`;
      if(desc) html+=`<div class="th-hover-item-desc">${esc(desc)}</div>`;
      if(eff) html+=`<div class="th-hover-item-meta"><i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(eff)}</div>`;
      html+=`</div>`;
    }
  }
  tip.innerHTML=html; tip.classList.add('th-hover-tip-full');
  positionTipWithFloatingUi(tip, anchor, 'hover', { maxW: 400 });
}
// 需求7：衣物全量悬停 — 新设计：甜美糖果衣橱列表
const _clothingHoverCache = new Map<string,string>();
function getClothingCacheKey(clothing:Record<string,any>): string {
  // 用衣物名称+状态拼接做轻量缓存key
  return Object.entries(clothing).map(([n,cl])=>n+':'+(cl as any)?.['衣物状态']).join('|');
}
function showClothingHoverTip(anchor:HTMLElement, clothing:Record<string,any>) {
  if(hoverTimeout) clearTimeout(hoverTimeout);
  const tip=ensureHoverTip(); if(!tip) return;
  // 清理旧类型类
  tip.className = 'th-hover-tip';
  const cacheKey = getClothingCacheKey(clothing);
  let html = _clothingHoverCache.get(cacheKey);
  if(!html){
    html = buildClothingHoverHtml(clothing);
    _clothingHoverCache.set(cacheKey, html);
    // 限制缓存大小
    if(_clothingHoverCache.size > 50) { const first = _clothingHoverCache.keys().next().value; if(first!==undefined) _clothingHoverCache.delete(first); }
  }
  tip.innerHTML=html;
  tip.classList.add('th-hover-tip-clothing-new');
  positionTipWithFloatingUi(tip, anchor, 'hover', { maxW: 620 });
}
function buildClothingHoverHtml(clothing:Record<string,any>): string {
  const entries=Object.entries(clothing);
  let html=`<div class="th-clothing-hover-header"><i class="fa-solid fa-vest"></i> 当前穿着 <span class="th-clothing-hover-count">${entries.length} 件</span></div>`;
  if(!entries.length){ html+='<div style="font-size:12px;color:var(--tx3);text-align:center;padding:16px">暂无穿着 ~</div>'; }
  else {
    html+=`<div class="th-clothing-list">`;
    for(const[n,cl] of entries){
      const c=cl as any;
      const part=c?.['穿着部位']||'';
      const state=(c?.['衣物状态']||'').toLowerCase();
      const detail=c?.['外观详情']||'';
      let stateCls='neutral'; let stateIcon='fa-solid fa-circle';
      if(state.includes('破损')||state.includes('破')||state.includes('撕裂')){ stateCls='bad'; stateIcon='fa-solid fa-triangle-exclamation'; }
      else if(state.includes('湿')||state.includes('脏')||state.includes('乱')){ stateCls='warn'; stateIcon='fa-solid fa-droplet'; }
      else if(state.includes('新')||state.includes('干净')||state.includes('整洁')){ stateCls='good'; stateIcon='fa-solid fa-check'; }
      html+=`<div class="th-clothing-card">`;
      html+=`<div class="th-clothing-icon"><i class="fa-solid fa-vest"></i></div>`;
      html+=`<div class="th-clothing-info">`;
      html+=`<div class="th-clothing-name">${esc(n)}</div>`;
      if(part) html+=`<div class="th-clothing-part"><i class="fa-solid fa-location-dot"></i> ${esc(part)}</div>`;
      if(state) html+=`<span class="th-clothing-state ${stateCls}"><i class="${stateIcon}"></i> ${esc(state)}</span>`;
      if(detail) html+=`<div class="th-clothing-detail">${esc(detail)}</div>`;
      html+=`</div></div>`;
    }
    html+=`</div>`;
  }
  return html;
}
// 需求6：NPC状态悬停（装备卡片风格）
function showNpcStatusHover(anchor:HTMLElement, statuses:Record<string,any>, npcName:string) {
  if(hoverTimeout) clearTimeout(hoverTimeout);
  const tip=ensureHoverTip(); if(!tip) return;
  // 彻底清理旧类型类，避免样式残留
  tip.className = 'th-hover-tip';
  const entries=Object.entries(statuses);
  let html=`<div class="th-hover-tip-title"><i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(npcName)} · 当前状态 (${entries.length})</div>`;
  if(!entries.length){ html+='<div style="font-size:12px;color:var(--tx3);text-align:center;padding:8px">暂无状态</div>'; }
  else {
    for(const[sn,si] of entries){
      const s=si as any;
      const eff=s?.['效果']||''; const src=s?.['来源']||''; const dur=s?.['持续时间']||'';
      html+=`<div class="th-gear-card">`;
      html+=`<div class="th-gear-name"><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--lav);font-size:11px"></i> ${esc(sn)}</div>`;
      if(eff) html+=`<div class="th-gear-detail">${esc(eff)}</div>`;
      if(src||dur){
        html+=`<div class="th-gear-meta">`;
        if(src) html+=`<div style="margin-bottom:3px"><i class="fa-solid fa-tag"></i> 来源: ${esc(src)}</div>`;
        if(dur) html+=`<div><i class="fa-solid fa-clock"></i> 持续: ${esc(dur)}</div>`;
        html+=`</div>`;
      }
      html+=`</div>`;
    }
  }
  tip.innerHTML=html; tip.classList.add('th-hover-tip-gear');
  positionTipWithFloatingUi(tip, anchor, 'hover', { maxW: 400 });
}

// ================================================================
//  需求1修订：NPC 轮盘（头像hover五维 — 使用对象池避免频繁DOM创建）
// ================================================================
let wheelEl: HTMLElement|null = null;
let wheelItems: HTMLElement[] = [];
function ensureWheelPool() {
  if (!wheelEl) {
    wheelEl = __doc.createElement('div');
    wheelEl.className = 'th-npc-metric-wheel';
    for (let i = 0; i < NPC_METRICS.length; i++) {
      const item = __doc.createElement('div');
      item.className = 'th-wheel-item-cascade';
      wheelEl.appendChild(item);
      wheelItems.push(item);
    }
    __body.appendChild(wheelEl);
  }
}
function showMetricWheel(anchor:HTMLElement, npcInfo:Record<string,any>) {
  ensureWheelPool();
  if (!wheelEl) return;

  const rect=anchor.getBoundingClientRect();
  const baseX=rect.right+8;
  const itemHeight=32;
  const totalHeight=(NPC_METRICS.length-1)*itemHeight;
  const baseY=rect.top+rect.height/2-totalHeight/2;
  const barWidth=120;

  NPC_METRICS.forEach((m,i)=>{
    const item = wheelItems[i];
    const v=clamp(Number(npcInfo[m.key])||0,0,100);
    item.innerHTML = `<span style="font-size:11px"><i class="${m.icon}"></i></span><span class="th-wheel-label-cascade">${m.key}</span><div class="th-wheel-bar-cascade"><div class="th-wheel-fill-cascade ${m.cls}" style="width:${v}%"></div></div><span class="th-wheel-val-cascade">${v}</span>`;
    item.style.position='fixed';
    const staggerOffset=i*10;
    item.style.left=(baseX+staggerOffset)+'px';
    item.style.top=(baseY+i*itemHeight)+'px';
    item.style.minWidth=barWidth+'px';
    item.style.display = 'flex';
  });

  wheelEl.style.display = 'block';
}
function hideMetricWheel() {
  if(wheelEl){ wheelEl.style.display = 'none'; }
}

// ================================================================
//  状态详情弹窗（需求3+需求9：编辑支持）
// ================================================================
function openStatusDetail(name:string, effect:string, source:string, duration:string, editPath:string) {
  let h='';
  if(isEditMode){
    h+=`<div class="th-modal-section"><div class="th-modal-label">名称</div>${editableInput(name,editPath+'.名称')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">效果</div>${editableTextarea(effect,editPath+'.效果')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">来源</div>${editableInput(source,editPath+'.来源')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">持续时间</div>${editableInput(duration,editPath+'.持续时间')}</div>`;
  } else {
    h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(name)}</div><div class="th-modal-text">${esc(effect)}</div></div>`;
    if(source) h+=`<div class="th-modal-section"><div class="th-modal-label">来源</div><div class="th-modal-text">${esc(source)}</div></div>`;
    if(duration) h+=`<div class="th-modal-section"><div class="th-modal-label">持续时间</div><div class="th-modal-text">${esc(duration)}</div></div>`;
  }
  // 需求3：堆叠弹窗逻辑
  const o1=qs('.th-modal-overlay');const isModal1Open=o1&&o1.style.display!=='none';
  if(isModal1Open){
    openModal2(`<i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(name)} · 状态详情`,h);
  } else {
    openModal(`<i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(name)} · 状态详情`,h);
  }
}

function openClothingDetailModal(name:string, part:string, state:string, detail:string, editPath:string) {
  let h='';
  if(isEditMode){
    h+=`<div class="th-modal-section"><div class="th-modal-label">名称</div>${editableInput(name,editPath+'.名称')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">穿着部位</div>${editableInput(part,editPath+'.穿着部位')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">衣物状态</div>${editableInput(state,editPath+'.衣物状态')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">外观详情</div>${editableTextarea(detail,editPath+'.外观详情')}</div>`;
  } else {
    h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-vest"></i> ${esc(name)}</div>`;
    h+=`<div style="font-size:13px;color:var(--lav);font-weight:700;margin-bottom:6px">${esc(part)} · <span style="color:var(--pink)">${esc(state)}</span></div>`;
    h+=`<div class="th-modal-text">${esc(detail)}</div></div>`;
  }
  // 需求3：当已有弹窗打开时使用二级弹窗堆叠，否则用一级弹窗
  const o1=qs('.th-modal-overlay');const isModal1Open=o1&&o1.style.display!=='none';
  if(isModal1Open){
    openModal2(`<i class="fa-solid fa-vest"></i> ${esc(name)} · 穿着详情`,h);
  } else {
    openModal(`<i class="fa-solid fa-vest"></i> ${esc(name)} · 穿着详情`,h);
  }
}

// ================================================================
//  需求9：编辑模式辅助函数
// ================================================================
function editableInput(value:string, path:string, type:string='text'): string {
  return `<input class="th-edit-input" type="${type}" value="${escAttr(value)}" data-edit-path="${escAttr(path)}">`;
}
function editableTextarea(value:string, path:string): string {
  return `<textarea class="th-edit-textarea" data-edit-path="${escAttr(path)}" rows="3">${esc(value)}</textarea>`;
}
// ================================================================
//  NPC 卡片
// ================================================================
function renderNPCGrid(data:Record<string,any>) {
  const c=qs('.th-npc-grid'); if(!c) return;
  const allNpcs=getNPCs(data);
  // 需求9：筛选在场/不在场
  let npcs=allNpcs;
  if(npcFilter==='present') npcs=npcs.filter(n=>n.info['是否在场']===true);
  else if(npcFilter==='absent') npcs=npcs.filter(n=>n.info['是否在场']!==true);
  // 批次6：搜索（姓名 + 身份），大小写不敏感
  const q=npcSearchText.trim().toLowerCase();
  if(q){
    npcs=npcs.filter(n=>{
      const name=(n.name||'').toLowerCase();
      const identity=String(n.info['身份']||'').toLowerCase();
      return name.includes(q) || identity.includes(q);
    });
  }
  // 需求7：排序
  npcs=sortNPCs(npcs);
  if(!npcs.length){
    // 批次6：区分"无数据" vs "无匹配"两种空状态
    const hasFilter=npcFilter!=='all' || !!q;
    if(hasFilter){
      c.innerHTML='<div class="th-npc-no-match"><i class="fa-solid fa-magnifying-glass"></i> 无匹配的 NPC</div>';
    } else {
      c.innerHTML='<span class="th-empty">暂无 NPC</span>';
    }
    return;
  }
  c.innerHTML=npcs.map((npc,idx)=>buildNPCCard(npc,idx)).join('');
  bindNPCGridEvents(c);
}

function closestWithin<T extends HTMLElement>(container:HTMLElement, target:EventTarget|null, selector:string): T|null {
  const el=(target as HTMLElement|null)?.closest?.(selector) as T|null;
  return el&&container.contains(el)?el:null;
}
function enteredWithin<T extends HTMLElement>(container:HTMLElement, e:MouseEvent, selector:string): T|null {
  const el=closestWithin<T>(container,e.target,selector);
  if(!el) return null;
  const related=e.relatedTarget as Node|null;
  return related&&el.contains(related)?null:el;
}
function leftWithin<T extends HTMLElement>(container:HTMLElement, e:MouseEvent, selector:string): T|null {
  const el=closestWithin<T>(container,e.target,selector);
  if(!el) return null;
  const related=e.relatedTarget as Node|null;
  return related&&el.contains(related)?null:el;
}
function bindNPCGridEvents(container:HTMLElement) {
  if(container.dataset.npcEventsBound==='true') return;
  container.dataset.npcEventsBound='true';

  container.addEventListener('click',(e:Event)=>{
    const t=e.target as HTMLElement;
    const attr=closestWithin<HTMLElement>(container,t,'.th-npc-attr-corner');
    if(attr){
      e.stopPropagation();
      const nm=attr.getAttribute('data-npc-attr')||'';
      const info=getNPCInfo(currentData,nm);
      if(info) openAttrModal(nm,_.get(info,'属性',{})||{}, `NPC.${nm}.属性`);
      return;
    }
    const avatar=closestWithin<HTMLElement>(container,t,'.th-npc-avatar-wrap');
    if(avatar){
      e.stopPropagation();
      const nm=avatar.getAttribute('data-avatar-target')||'';
      const url=avatarImages['npc:'+nm]||'';
      if(url) showImage(url);
      else { uploadingTarget='npc:'+nm; qs<HTMLInputElement>('.th-avatar-file-input')?.click(); }
      return;
    }
    const bag=closestWithin<HTMLElement>(container,t,'.th-npc-av-icon-bag');
    if(bag){ e.stopPropagation(); openNPCBag(bag.getAttribute('data-npc-bag')||''); return; }
    const skill=closestWithin<HTMLElement>(container,t,'.th-npc-av-icon-skill');
    if(skill){ e.stopPropagation(); openNPCSkill(skill.getAttribute('data-npc-skill')||''); return; }
    const gallery=closestWithin<HTMLElement>(container,t,'.th-npc-gallery-corner');
    if(gallery){ e.stopPropagation(); openGalleryModal(gallery.getAttribute('data-npc-gallery')||''); return; }
    const clothing=closestWithin<HTMLElement>(container,t,'.th-npc-clothing-corner');
    if(clothing){
      e.stopPropagation();
      const nm=clothing.getAttribute('data-npc-clothing')||'';
      const info=getNPCInfo(currentData,nm);
      if(info) openClothingListModal(nm,_.get(info,'当前穿着衣物',{})||{});
      return;
    }
    const card=closestWithin<HTMLElement>(container,t,'.th-npc-card');
    if(!card) return;
    const presence=closestWithin<HTMLElement>(container,t,'.th-npc-presence-toggle');
    if(presence){
      const nm=card.getAttribute('data-npc-name')||'';
      if(nm) toggleNpcPresence(nm);
      return;
    }
    if(t.closest('.th-npc-icon-item')) return;
    const nm=card.getAttribute('data-npc-name')||'';
    if(nm&&currentData) openNPCDetail(nm);
  });

  container.addEventListener('mouseover',(e:MouseEvent)=>{
    const attr=enteredWithin<HTMLElement>(container,e,'.th-npc-attr-corner');
    if(attr){
      const nm=attr.getAttribute('data-npc-attr')||'';
      const info=getNPCInfo(currentData,nm);
      if(info) showHoverTip(attr,'attr',{name:nm,html:buildAttrBarHtml(_.get(info,'属性',{})||{})});
      return;
    }
    const avatar=enteredWithin<HTMLElement>(container,e,'.th-npc-avatar-wrap');
    if(avatar){
      const nm=avatar.getAttribute('data-avatar-target')||'';
      const info=getNPCInfo(currentData,nm);
      if(info) showMetricWheel(avatar,info);
      return;
    }
    const nameEl=enteredWithin<HTMLElement>(container,e,'.th-npc-name');
    if(nameEl){
      const nm=nameEl.getAttribute('data-npcnm')||'';
      const info=getNPCInfo(currentData,nm);
      if(info) showHoverTip(nameEl,'identity',{name:nm,identity:info['身份']||'无'});
      return;
    }
    const status=enteredWithin<HTMLElement>(container,e,'.th-npc-icon-status');
    if(status){
      const nm=status.getAttribute('data-npc-status')||'';
      const info=getNPCInfo(currentData,nm);
      if(info) showNpcStatusHover(status,_.get(info,'状态',{})||{},nm);
      return;
    }
    const counts=enteredWithin<HTMLElement>(container,e,'.th-npc-icon-counts');
    if(counts){
      showHoverTip(counts,'counts',{orgasm:counts.getAttribute('data-orgasm')||'0',creampie:counts.getAttribute('data-creampie')||'0'});
      return;
    }
    const icon=enteredWithin<HTMLElement>(container,e,'.th-npc-icon-item');
    if(icon){
      const key=icon.getAttribute('data-ikey')||'';
      const cfg=NPC_ICON_CFG.find(c=>c.key===key);
      if(cfg) showHoverTip(icon,'icon',{icon:cfg.icon,label:cfg.label,content:icon.getAttribute('data-icontent')||'(暂无)'});
      return;
    }
    const bag=enteredWithin<HTMLElement>(container,e,'.th-npc-av-icon-bag');
    if(bag){
      const nm=bag.getAttribute('data-npc-bag')||'';
      const info=getNPCInfo(currentData,nm);
      if(info) showItemsHoverTip(bag,_.get(info,'拥有物品',{})||{},'背包');
      return;
    }
    const skill=enteredWithin<HTMLElement>(container,e,'.th-npc-av-icon-skill');
    if(skill){
      const nm=skill.getAttribute('data-npc-skill')||'';
      const info=getNPCInfo(currentData,nm);
      if(info) showSkillsHoverTip(skill,_.get(info,'拥有技能',{})||{},'技能');
      return;
    }
    const clothing=enteredWithin<HTMLElement>(container,e,'.th-npc-clothing-corner');
    if(clothing){
      const nm=clothing.getAttribute('data-npc-clothing')||'';
      const info=getNPCInfo(currentData,nm);
      if(info) showClothingHoverTip(clothing,_.get(info,'当前穿着衣物',{})||{});
    }
  });

  container.addEventListener('mouseout',(e:MouseEvent)=>{
    if(leftWithin(container,e,'.th-npc-avatar-wrap')){ hideMetricWheel(); return; }
    if(
      leftWithin(container,e,'.th-npc-attr-corner')||
      leftWithin(container,e,'.th-npc-name')||
      leftWithin(container,e,'.th-npc-icon-item')||
      leftWithin(container,e,'.th-npc-av-icon-bag')||
      leftWithin(container,e,'.th-npc-av-icon-skill')||
      leftWithin(container,e,'.th-npc-clothing-corner')
    ) hideHoverTip();
  });
}

// ================================================================
//  需求: NPC心情拆分为小标签，三列网格
// ================================================================
function buildMoodTags(mood:string): string {
  // 按 / 、 · 空格等分隔
  const tags=mood.split(/[/、·]+/).map(t=>t.trim()).filter(t=>t.length>0);
  if(!tags.length) return esc(mood);
  return tags.map(t=>`<span class="th-mood-tag">${esc(t)}</span>`).join('');
}

// §10.5：悬浮球 hover tip 用的"隐形数据层"。
// 在 NPC 卡片 DOM 内插入 5 数值 / 内心想法 / 本能渴望 / 身份 / 生日 / 属性 的 data-attr，
// 球只读 DOM（沿用 §4 硬约束），不直接读 stat_data。
// 默认 display:none，避免撑开状态栏 NPC 卡片高度；如需在状态栏内可见可单独调整 CSS。
// §10.5 polish round 4：属性可扩展(超过 10 条),用 Object.keys 动态枚举,不 hardcode。
function buildFabNpcData(npc:{name:string;info:Record<string,any>}): string {
  const {info} = npc;
  const metricsHtml = NPC_METRICS.map(m => {
    const v = Number(info[m.key] ?? 0);
    return `<span class="th-npc-fab-metric" data-fab-metric="${escAttr(m.key)}" data-fab-value="${escAttr(String(v))}" data-fab-cls="${escAttr(m.cls)}" title="${escAttr(m.key)}"></span>`;
  }).join('');
  // 属性:动态枚举 info['属性'] 里的所有 key,可超过 10 条
  // ATTR_CLS 里有的属性用对应 cls,未定义的自定义属性 fallback 到 attr-type-default
  const attrsObj = (info['属性'] && typeof info['属性'] === 'object') ? info['属性'] : {};
  const attrsHtml = Object.keys(attrsObj).map(k => {
    const v = Number(attrsObj[k] ?? 0);
    const cls = ATTR_CLS[k] || 'attr-type-default';
    return `<span class="th-npc-fab-attr" data-attr-name="${escAttr(k)}" data-attr-value="${escAttr(String(v))}" data-attr-cls="${escAttr(cls)}"></span>`;
  }).join('');
  const thought = String(info['内心想法'] || '');
  const thoughtShort = thought.length > 75 ? thought.slice(0, 75) + '…' : thought;
  const desire = String(info['当前本能渴望'] || '');
  const identity = String(info['身份'] || '');
  const bdayRaw = String(info['生日日期'] || '');
  const bday = bdayRaw && bdayRaw !== '未知' ? bdayRaw : '';
  return `<div class="th-npc-fab-data" aria-hidden="true">
    ${metricsHtml}
    ${attrsHtml}
    <span class="th-npc-fab-thought" data-fab-thought="${escAttr(thought)}">${esc(thoughtShort)}</span>
    <span class="th-npc-fab-desire" data-fab-desire="${escAttr(desire)}">${esc(desire)}</span>
    <span class="th-npc-fab-identity" data-fab-identity="${escAttr(identity)}">${esc(identity)}</span>
    <span class="th-npc-fab-bday" data-fab-bday="${escAttr(bday)}">${esc(bday)}</span>
  </div>`;
}

function buildNPCCard(npc:{name:string;info:Record<string,any>},idx:number): string {
  const{name,info}=npc;
  const present=info['是否在场']??false;
  const mood=info['当前情绪状态与心情']||'';
  const bdayRaw=info['生日日期'];
  const bday=(bdayRaw&&bdayRaw!=='未知')?String(bdayRaw):'';
  const hasImg=!!avatarImages['npc:'+name];
  const ac=getAvatarColor(name,idx);

  // 头像 HTML
  let av;
  if(hasImg) av=`<div class="th-npc-avatar-ring ${present?'present':'absent'}"><div class="th-npc-avatar-img-wrap"><img class="th-npc-avatar-img" src="${esc(avatarImages['npc:'+name])}" alt=""></div></div>`;
  else av=`<div class="th-npc-avatar-ring ${present?'present':'absent'}"><div class="th-npc-avatar-img-wrap"><span class="th-npc-avatar-placeholder" style="color:${ac}">${esc(name[0]||'?')}</span></div></div>`;

  // 4 图标行
  let icons='';
  for(const cfg of NPC_ICON_CFG){
    const val=info[cfg.key]||'';
    const display=cfg.key==='当前本能渴望'?(val&&val!=='无'):!!val;
    icons+=`<span class="th-npc-icon-item" data-ikey="${escAttr(cfg.key)}" data-icontent="${escAttr(val||'')}" style="opacity:${display?1:0.4}"><i class="${cfg.icon}"></i></span>`;
  }
  // 需求8：第5个图标 — 高潮次数/被内射次数
  const orgasm=info['高潮次数']??0;
  const creampie=info['被内射次数']??0;
  const hasCounts=(Number(orgasm)>0||Number(creampie)>0);
  icons+=`<span class="th-npc-icon-item th-npc-icon-counts" data-orgasm="${orgasm}" data-creampie="${creampie}" style="opacity:${hasCounts?1:0.4}"><i class="fa-solid fa-heart-circle-plus"></i></span>`;
  // 需求6：NPC当前状态图标
  const statuses=info['状态']||{}; const hasStatus=Object.keys(statuses).length>0;
  icons+=`<span class="th-npc-icon-item th-npc-icon-status" data-npc-status="${esc(name)}" style="opacity:${hasStatus?1:0.4}"><i class="fa-solid fa-wand-magic-sparkles"></i></span>`;

  return `<div class="th-npc-card" data-npc-name="${esc(name)}" data-npc-present="${present?'true':'false'}">
    <div class="th-npc-card-inner">
      <div class="th-npc-av-col">
        <div class="th-npc-avatar-wrap" data-avatar-target="${esc(name)}" title="悬停查看数值指标">${av}</div>
        <div class="th-npc-av-icons">
          <span class="th-npc-av-icon th-npc-av-icon-bag" data-npc-bag="${esc(name)}" title="背包"><i class="fa-solid fa-box-open"></i></span>
          <span class="th-npc-av-icon th-npc-av-icon-skill" data-npc-skill="${esc(name)}" title="技能"><i class="fa-solid fa-scroll"></i></span>
        </div>
      </div>
      <div class="th-npc-info">
        <div class="th-npc-name-row">
          <span class="th-npc-name" data-npcnm="${esc(name)}">${esc(name)}</span>
          <span class="th-npc-presence ${present?'present':'absent'} th-npc-presence-toggle" data-npc-presence="${esc(name)}">${present?'<i class="fa-solid fa-circle" style="font-size:6px"></i> 在场':'离场'}</span>
          ${bday?`<span class="th-npc-bday-badge" title="生日"><i class="fa-solid fa-cake-candles"></i> ${esc(bday)}</span>`:''}
        </div>
        ${mood?`<div class="th-npc-mood-tags">${buildMoodTags(mood)}</div>`:''}
        <div class="th-npc-icon-row">${icons}</div>
      </div>
      <span class="th-npc-gallery-corner" data-npc-gallery="${esc(name)}" title="画廊"><i class="fa-solid fa-images"></i></span>
      <span class="th-npc-attr-corner" data-npc-attr="${esc(name)}" title="属性详情"><i class="fa-solid fa-chart-pie"></i></span>
      <span class="th-npc-clothing-corner" data-npc-clothing="${esc(name)}" title="衣物详情"><i class="fa-solid fa-vest"></i></span>
      ${buildFabNpcData(npc)}
    </div>
  </div>`;
}

// ================================================================
//  NPC 详情弹窗（需求9：编辑全覆盖）
// ================================================================
function openNPCDetail(npcName:string) {
  if(!currentData) return;
  const info=getNPCInfo(currentData,npcName); if(!info) return;
  const name=npcName;
  const basePath=`NPC.${name}`;
  const npcIndex=getNPCs(currentData).findIndex(n=>n.name===name);
  let h='';

  // 头像+名称行
  h+=`<div class="th-modal-hero">`;
  const hasImg=!!avatarImages['npc:'+name];
  h+=`<div class="th-modal-avatar-section">`;
  if(hasImg) h+=`<div class="th-modal-avatar-ring"><div class="th-modal-avatar-img-wrap"><img src="${esc(avatarImages['npc:'+name])}" alt="" style="width:100%;height:100%;object-fit:cover;cursor:pointer" onclick="(function(){var o=document.querySelector('.th-image-overlay');var i=document.querySelector('.th-image-full');if(o&&i){i.src='${esc(avatarImages['npc:'+name])}';o.style.display='flex';}})()"></div></div>`;
  else h+=`<div class="th-modal-avatar-ring"><div class="th-modal-avatar-img-wrap"><span style="font-size:30px;color:${getAvatarColor(name,npcIndex>=0?npcIndex:0)}"><i class="fa-solid fa-user-astronaut"></i></span></div></div>`;
  h+=`<div class="th-modal-avatar-btns" style="display:flex;gap:6px;margin-top:4px"><button class="th-avatar-btn th-avatar-btn-upload" onclick="(function(){var t='npc:${esc(name)}';var f=document.querySelector('.th-avatar-file-input');window.__uploadTarget__=t;if(f)f.click();})()"><i class="fa-solid fa-camera"></i></button>${hasImg?`<button class="th-avatar-btn th-avatar-btn-delete" onclick="(function(){window.__deleteAvatar__('npc:${esc(name)}');})()"><i class="fa-solid fa-trash"></i></button>`:''}</div>`;
  h+=`</div>`;
  const bday=info['生日日期']&&info['生日日期']!=='未知'?info['生日日期']:'';
  h+=`<div class="th-modal-hero-info">`;
  if(isEditMode){
    h+=`<div class="th-modal-hero-name">${editableInput(name,basePath+'.名称')} <button class="th-btn-attr-modal" style="display:inline-flex" data-modal-attr="${esc(name)}"><i class="fa-solid fa-chart-pie"></i> 属性</button>${bday?`<span class="th-modal-hero-birthday"><i class="fa-solid fa-cake-candles"></i> ${editableInput(bday,basePath+'.生日日期')}</span>`:''}</div>`;
    h+=`<div class="th-modal-hero-loc"><i class="fa-solid fa-tag"></i> ${editableInput(info['身份']||'',basePath+'.身份')} · ${info['是否在场']?'<i class="fa-solid fa-circle" style="color:var(--mint);font-size:8px"></i> 在场':'离场'}</div>`;
    h+=`<div class="th-modal-hero-mood"><i class="fa-solid fa-face-smile"></i> ${editableInput(info['当前情绪状态与心情']||'',basePath+'.当前情绪状态与心情')}<div class="th-npc-mood-tags">${buildMoodTags(info['当前情绪状态与心情']||'')}</div></div>`;
  } else {
    h+=`<div class="th-modal-hero-name">${esc(name)} <button class="th-btn-attr-modal" style="display:inline-flex" data-modal-attr="${esc(name)}"><i class="fa-solid fa-chart-pie"></i> 属性</button>${bday?`<span class="th-modal-hero-birthday"><i class="fa-solid fa-cake-candles"></i> ${esc(bday)}</span>`:''}</div>`;
    h+=`<div class="th-modal-hero-loc"><i class="fa-solid fa-tag"></i> ${esc(info['身份']||'')} · ${info['是否在场']?'<i class="fa-solid fa-circle" style="color:var(--mint);font-size:8px"></i> 在场':'离场'}</div>`;
    h+=`<div class="th-modal-hero-mood"><i class="fa-solid fa-face-smile"></i> ${esc(info['当前情绪状态与心情']||'—')}<div class="th-npc-mood-tags">${buildMoodTags(info['当前情绪状态与心情']||'')}</div></div>`;
  }
  h+=`</div></div>`;

  // 内心想法
  if(info['内心想法']){
    h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-comment"></i> 内心想法</div>`;
    h+=isEditMode ? editableTextarea(info['内心想法'],basePath+'.内心想法') : `<div class="th-modal-text">${esc(info['内心想法'])}</div>`;
    h+=`</div>`;
  }
  // 本能渴望
  if(info['当前本能渴望']&&info['当前本能渴望']!=='无'){
    h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-crosshairs"></i> 本能渴望</div>`;
    h+=isEditMode ? editableTextarea(info['当前本能渴望'],basePath+'.当前本能渴望') : `<div class="th-modal-text">${esc(info['当前本能渴望'])}</div>`;
    h+=`</div>`;
  }
  // 数值指标
  h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-heart"></i> 数值指标</div><div class="th-modal-metrics">`;
  for(const m of NPC_METRICS){
    const v=clamp(Number(info[m.key])||0,0,100);
    if(isEditMode){
      h+=`<div class="th-npc-metric"><span class="th-npc-metric-icon"><i class="${m.icon}"></i></span><span class="th-npc-metric-label">${m.key}</span>${editableInput(`${v}`,basePath+'.'+m.key,'number')}</div>`;
    } else {
      h+=`<div class="th-npc-metric"><span class="th-npc-metric-icon"><i class="${m.icon}"></i></span><span class="th-npc-metric-label">${m.key}</span><div class="th-npc-metric-bar"><div class="th-npc-metric-fill ${m.cls}" style="width:${v}%"></div></div><span class="th-npc-metric-val">${v}</span></div>`;
    }
  }
  h+=`</div></div>`;
  // 计数（需求9：编辑模式）
  h+=`<div class="th-modal-counts">`;
  for(const c of NPC_COUNTS){
    const cv=Number(info[c.key])||0;
    h+=`<span><i class="${c.icon}"></i> ${c.key}: ${isEditMode?editableInput(`${cv}`,basePath+'.'+c.key,'number'):`<b>${cv}</b>`}</span>`;
  }
  h+=`</div>`;

  // 姿态动作+身体状态
  const posture=info['姿态动作']||'暂无动作';
  const bodyState=info['身体状态']||'暂无描述';
  h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-child-reaching"></i> 姿态动作 & 身体状态</div>`;
  h+=`<div class="th-modal-pb-row">`;
  h+=`<div class="th-modal-pop-card"><div class="th-modal-pop-head"><i class="fa-solid fa-child-reaching"></i> 姿态动作</div><div class="th-modal-pop-body">${isEditMode?editableTextarea(posture,basePath+'.姿态动作'):esc(posture)}</div></div>`;
  h+=`<div class="th-modal-pop-card"><div class="th-modal-pop-head"><i class="fa-solid fa-hand-holding-heart"></i> 身体状态</div><div class="th-modal-pop-body">${isEditMode?editableTextarea(bodyState,basePath+'.身体状态'):esc(bodyState)}</div></div>`;
  h+=`</div></div>`;

  // 状态（需求9：编辑模式）
  const st=_.get(info,'状态',{})||{}; const stE=Object.entries(st);
  h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-wand-magic-sparkles"></i> 状态</div><div class="th-block-row">`;
  if(!stE.length) h+=`<span class="th-empty" style="padding:8px 0">暂无状态</span>`;
  for(const[sn,si] of stE){ const s=si as any;
    const eff=s?.['效果']||''; const src=s?.['来源']||''; const dur=s?.['持续时间']||'';
    h+=`<span class="th-block th-block-status th-modal-block-click" data-btype="status" data-bname="${escAttr(sn)}" data-beffect="${escAttr(eff)}" data-bsource="${escAttr(src)}" data-bduration="${escAttr(dur)}" data-bpath="${escAttr(basePath)}.状态.${escAttr(sn)}"><span class="th-tag-dot neutral"></span> ${esc(sn)}</span>`;
  }
  h+=`<span class="th-block th-block-add" data-add-trigger="status" data-add-base="${escAttr(basePath)}.状态" data-add-owner="${escAttr(name)}"><i class="fa-solid fa-plus"></i> 新增状态</span>`;
  h+=`</div></div>`;

  // 穿着（需求4：上下折叠式，点击衣物方块展开/收起详情）
  const cl=_.get(info,'当前穿着衣物',{})||{}; const clE=Object.entries(cl);
  h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-vest"></i> 当前穿着</div><div class="th-block-row">`;
  if(!clE.length) h+=`<span class="th-empty" style="padding:8px 0">暂无穿着</span>`;
  for(const[cn,ci] of clE){ const c=ci as any;
    const state=c?.['衣物状态']||'';
    const dot=getDotCls(state);
    h+=`<span class="th-block th-block-clothing th-fold-trigger" data-btype="clothing" data-bname="${escAttr(cn)}" data-bpart="${escAttr(c?.['穿着部位']||'')}" data-bstate="${escAttr(state)}" data-bdetail="${escAttr(c?.['外观详情']||'')}" data-bpath="${escAttr(basePath)}.当前穿着衣物.${escAttr(cn)}"><i class="fa-solid fa-vest"></i> ${esc(cn)} · ${esc(c?.['穿着部位']||'')} <span class="th-tag-dot ${dot}"></span><span class="th-fold-arrow" style="margin-left:auto;font-size:10px"><i class="fa-solid fa-chevron-down"></i></span></span>`;
  }
  h+=`<span class="th-block th-block-add" data-add-trigger="clothing" data-add-base="${escAttr(basePath)}.当前穿着衣物" data-add-owner="${escAttr(name)}"><i class="fa-solid fa-plus"></i> 新增衣物</span>`;
  h+=`</div><div class="th-fold-detail" style="display:none"></div></div>`;

  // 基础外貌（需求9：编辑模式）
  if(info['基础外貌']){
    h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-eye"></i> 基础外貌</div>`;
    h+= isEditMode ? editableTextarea(info['基础外貌'],basePath+'.基础外貌') : `<div class="th-modal-text">${esc(info['基础外貌'])}</div>`;
    h+=`</div>`;
  }

  // 背包/技能按钮
  const items=_.get(info,'拥有物品',{})||{}; const itemE=Object.entries(items);
  const skills=_.get(info,'拥有技能',{})||{}; const skillE=Object.entries(skills);
  h+=`<div class="th-modal-section"><div style="display:flex;gap:10px">`;
  h+=`<button class="th-btn-sm-wide" data-npc-item-open="${esc(name)}"><i class="fa-solid fa-box-open"></i> 背包 (${itemE.length})</button>`;
  h+=`<button class="th-btn-sm-wide" data-npc-skill-open="${esc(name)}"><i class="fa-solid fa-scroll"></i> 技能 (${skillE.length})</button>`;
  h+=`</div></div>`;

  openModal(esc(name),h);

  setTimeout(()=>{
    qsa('[data-modal-attr]').forEach(b=>b.addEventListener('click',function(this:HTMLElement){const nm=this.getAttribute('data-modal-attr')||'';const info=getNPCInfo(currentData,nm);if(info)openAttrModal(nm,_.get(info,'属性',{})||{},`NPC.${nm}.属性`);}));
    qsa('[data-npc-item-open]').forEach(b=>b.addEventListener('click',function(this:HTMLElement){const nm=this.getAttribute('data-npc-item-open')||'';if(currentData)openNPCBag(nm);}));
    qsa('[data-npc-skill-open]').forEach(b=>b.addEventListener('click',function(this:HTMLElement){const nm=this.getAttribute('data-npc-skill-open')||'';if(currentData)openNPCSkill(nm);}));
    // 绑定弹窗内状态方块hover+click
    const modalBody=qs('.th-modal-body'); if(modalBody){
      bindBlockHoverAndClick(modalBody,'status');
    }
    // 需求4：衣物方块改为折叠式展开/收起
    bindClothingFoldDown(npcName);
  },40);

  (window as any).__uploadTarget__ = '';
  (window as any).__deleteAvatar__ = (t:string)=>{ deleteAvatar(t); closeModal(); if(currentData) openNPCDetail(npcName); };
}

// ================================================================
//  需求4：衣物折叠式展开/收起（NPC详情弹窗内）
// ================================================================
function bindClothingFoldDown(npcName:string) {
  const modalBody = qs('.th-modal-body');
  const foldTriggers = modalBody ? modalBody.querySelectorAll('.th-fold-trigger') : [];
  if (!foldTriggers.length) return;

  const foldDetail = qs('.th-fold-detail');
  if (!foldDetail) return;

  let activeTrigger: HTMLElement | null = null;

  foldTriggers.forEach((trigger) => {
    const el = trigger as HTMLElement;

    // hover → 显示装备卡片浮窗
    el.addEventListener('mouseenter', function (this: HTMLElement) {
      const name = this.getAttribute('data-bname') || '';
      const part = this.getAttribute('data-bpart') || '';
      const state = this.getAttribute('data-bstate') || '';
      const detail = this.getAttribute('data-bdetail') || '';
      showHoverTip(this, 'clothing', { name, part, state, detail });
    });
    el.addEventListener('mouseleave', () => { hideHoverTip(); });

    // click → 折叠式展开/收起详情
    el.addEventListener('click', function (this: HTMLElement, e: Event) {
      e.stopPropagation();
      const bname = this.getAttribute('data-bname') || '';
      const bpart = this.getAttribute('data-bpart') || '';
      const bstate = this.getAttribute('data-bstate') || '';
      const bdetail = this.getAttribute('data-bdetail') || '';
      const bpath = this.getAttribute('data-bpath') || '';

      // 如果点击同一个方块 → 收起
      if (activeTrigger === this && foldDetail.style.display !== 'none') {
        foldDetail.style.display = 'none';
        foldDetail.innerHTML = '';
        // 恢复箭头方向
        this.querySelector('.th-fold-arrow')!.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
        activeTrigger = null;
        return;
      }

      // 切换另一个方块 → 展开新的
      // 恢复之前活跃的箭头
      if (activeTrigger) {
        activeTrigger.querySelector('.th-fold-arrow')!.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
      }
      activeTrigger = e.currentTarget as HTMLElement;

      // 生成详情HTML
      let detailHtml = '';
      if (isEditMode) {
        detailHtml += `<div class="th-fold-row"><span class="th-fold-label">名称</span>${editableInput(bname, bpath + '.名称')}</div>`;
        detailHtml += `<div class="th-fold-row"><span class="th-fold-label">穿着部位</span>${editableInput(bpart, bpath + '.穿着部位')}</div>`;
        detailHtml += `<div class="th-fold-row"><span class="th-fold-label">衣物状态</span>${editableInput(bstate, bpath + '.衣物状态')}</div>`;
        detailHtml += `<div class="th-fold-row" style="flex-direction:column;align-items:flex-start"><span class="th-fold-label">外观详情</span>${editableTextarea(bdetail, bpath + '.外观详情')}</div>`;
      } else {
        detailHtml += `<div class="th-fold-row"><span class="th-fold-label"><i class="fa-solid fa-tag"></i> 穿着部位</span><span class="th-fold-value">${esc(bpart)}</span></div>`;
        detailHtml += `<div class="th-fold-row"><span class="th-fold-label"><i class="fa-solid fa-circle-info"></i> 衣物状态</span><span class="th-fold-value">${esc(bstate)}</span></div>`;
        if (bdetail) {
          detailHtml += `<div class="th-fold-row" style="flex-direction:column;align-items:flex-start"><span class="th-fold-label"><i class="fa-solid fa-align-left"></i> 外观详情</span><div class="th-fold-desc">${esc(bdetail)}</div></div>`;
        }
      }
      foldDetail.innerHTML = detailHtml;
      foldDetail.style.display = 'block';

      // 更新箭头方向
      this.querySelector('.th-fold-arrow')!.innerHTML = '<i class="fa-solid fa-chevron-up"></i>';

      // 滚动到详情位置
      foldDetail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
}

// ================================================================
//  需求2：背包/技能 → 3列方块网格，点击方块弹出详情
// ================================================================

// --- User 背包 ---
function openUserBag(data:Record<string,any>) {
  const u=getUser(data); const uname=getUN(data); const ukey=getUserKey(data);
  const items=_.get(u,'拥有物品',{})||{}; const entries=Object.entries(items);
  const basePath=ukey+'.拥有物品';
  const h=renderItemGrid(entries,basePath,uname);
  openModal('<i class="fa-solid fa-box-open"></i> 背包',h);
  bindGridItemClicks(uname, entries, basePath, 'user');
}

// --- NPC 背包 ---
function openNPCBag(npcName:string) {
  const info=getNPCInfo(currentData,npcName); if(!info) return;
  const items=_.get(info,'拥有物品',{})||{}; const entries=Object.entries(items);
  const basePath=`NPC.${npcName}.拥有物品`;
  const h=renderItemGrid(entries,basePath,npcName);
  openModal(`<i class="fa-solid fa-box-open"></i> `+esc(npcName)+' · 背包',h);
  bindGridItemClicks(npcName, entries, basePath, 'npc');
}

// --- User 技能 ---
function openUserSkill(data:Record<string,any>) {
  const u=getUser(data); const uname=getUN(data); const ukey=getUserKey(data);
  const skills=_.get(u,'拥有技能',{})||{}; const entries=Object.entries(skills);
  const basePath=ukey+'.拥有技能';
  const h=renderSkillGrid(entries,basePath,uname);
  openModal('<i class="fa-solid fa-scroll"></i> 技能',h);
  bindGridSkillClicks(uname, entries, basePath, 'user');
}

// --- NPC 技能 ---
function openNPCSkill(npcName:string) {
  const info=getNPCInfo(currentData,npcName); if(!info) return;
  const skills=_.get(info,'拥有技能',{})||{}; const entries=Object.entries(skills);
  const basePath=`NPC.${npcName}.拥有技能`;
  const h=renderSkillGrid(entries,basePath,npcName);
  openModal(`<i class="fa-solid fa-scroll"></i> `+esc(npcName)+' · 技能',h);
  bindGridSkillClicks(npcName, entries, basePath, 'npc');
}

// --- 网格渲染 ---
function renderItemGrid(entries:[string,any][], basePath:string, ownerName:string): string {
  let h='';
  if(!entries.length) h+='<div class="th-empty th-grid-empty"><i class="fa-solid fa-box-open"></i> 空空如也~</div>';
  h+='<div class="th-block-grid">';
  h+=entries.map(([n,it]:[string,any])=>{
    const count=it?.['数量']??1;
    const ed=escAttr(n);
    return `<div class="th-block th-block-item th-grid-item-click" data-gname="${ed}" data-gpath="${escAttr(basePath)}" data-owner="${escAttr(ownerName)}" data-gtype="item"><i class="fa-solid fa-gem"></i> ${esc(n)}<span class="th-tag-badge">${count}</span></div>`;
  }).join('');
  h+=`<div class="th-block th-block-add" data-add-trigger="item" data-add-base="${escAttr(basePath)}" data-add-owner="${escAttr(ownerName)}"><i class="fa-solid fa-plus"></i> 添加物品</div>`;
  h+='</div>';
  h+=`<div class="th-grid-detail" id="th-grid-detail" style="display:none"></div>`;
  return h;
}

function renderSkillGrid(entries:[string,any][], basePath:string, ownerName:string): string {
  let h='';
  if(!entries.length) h+='<div class="th-empty th-grid-empty"><i class="fa-solid fa-scroll"></i> 尚未习得~</div>';
  h+='<div class="th-block-grid">';
  h+=entries.map(([n,sk]:[string,any])=>{
    const lv=sk?.['等级']??1;
    const ed=escAttr(n);
    return `<div class="th-block th-block-skill th-grid-item-click" data-gname="${ed}" data-gpath="${escAttr(basePath)}" data-owner="${escAttr(ownerName)}" data-gtype="skill"><i class="fa-solid fa-scroll"></i> ${esc(n)}<span class="th-tag-badge" style="background:var(--lav);font-size:9px">Lv${lv}</span></div>`;
  }).join('');
  h+=`<div class="th-block th-block-add" data-add-trigger="skill" data-add-base="${escAttr(basePath)}" data-add-owner="${escAttr(ownerName)}"><i class="fa-solid fa-plus"></i> 添加技能</div>`;
  h+='</div>';
  h+=`<div class="th-grid-detail" id="th-grid-detail" style="display:none"></div>`;
  return h;
}

// --- 点击方块→显示详情 ---
function bindGridItemClicks(ownerName:string, entries:[string,any][], basePath:string, ownerType:string) {
  setTimeout(()=>{
    qsa('.th-grid-item-click').forEach(el=>el.addEventListener('click',function(this:HTMLElement,e:Event){
      e.stopPropagation();
      const n=this.getAttribute('data-gname')||'';
      const entry=entries.find(([k])=>k===n);
      if(!entry) return;
      const it=entry[1] as any;
      const path=basePath+'.'+n;
      showItemDetail(n,it,path,ownerName,ownerType);
    }));
  },40);
}

function bindGridSkillClicks(ownerName:string, entries:[string,any][], basePath:string, ownerType:string) {
  setTimeout(()=>{
    qsa('.th-grid-item-click').forEach(el=>el.addEventListener('click',function(this:HTMLElement,e:Event){
      e.stopPropagation();
      const n=this.getAttribute('data-gname')||'';
      const entry=entries.find(([k])=>k===n);
      if(!entry) return;
      const sk=entry[1] as any;
      const path=basePath+'.'+n;
      showSkillDetail(n,sk,path,ownerName,ownerType);
    }));
  },40);
}

function showItemDetail(name:string, it:any, editPath:string, ownerName:string, ownerType:string) {
  const detailEl=qs('#th-grid-detail'); if(!detailEl) return;
  const gridEl=detailEl.previousElementSibling as HTMLElement;
  if(gridEl) gridEl.style.display='none';
  let h='';
  if(isEditMode){
    h+=`<div class="th-modal-section"><div class="th-modal-label">名称</div>${editableInput(name,editPath+'.名称')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">数量</div>${editableInput(`${it?.['数量']??1}`,editPath+'.数量','number')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">简介</div>${editableTextarea(it?.['简介']||'',editPath+'.简介')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">效果</div>${editableTextarea(it?.['效果']||'',editPath+'.效果')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">评价</div>${editableTextarea(it?.['评价']||'',editPath+'.评价')}</div>`;
  } else {
    h+=`<div class="th-item-row"><div class="th-item-name">${esc(name)} <span class="th-item-count">x${it?.['数量']??1}</span></div>`;
    if(it?.['简介']) h+=`<div class="th-item-desc">${esc(it['简介'])}</div>`;
    if(it?.['效果']) h+=`<div class="th-item-effect"><i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(it['效果'])}</div>`;
    if(it?.['评价']) h+=`<div class="th-item-comment">${esc(it['评价'])}</div>`;
  }
  h+=`<div class="th-item-actions">`;
  h+=`<button class="th-btn-sm th-btn-use th-btn-use-item" data-owner="${escAttr(ownerName)}" data-item="${escAttr(name)}"><i class="fa-solid fa-wand-magic-sparkles"></i> 使用</button>`;
  h+=`<button class="th-btn-sm th-btn-discard th-btn-discard-item" data-owner="${escAttr(ownerName)}" data-item="${escAttr(name)}" data-owner-type="${ownerType}"><i class="fa-solid fa-trash"></i> 丢弃</button>`;
  h+=`<button class="th-btn-sm th-btn-back-grid" style="background:var(--bg3);color:var(--tx2);border:1px solid var(--dv);margin-left:auto"><i class="fa-solid fa-arrow-left"></i> 返回</button>`;
  h+=`</div>`;
  detailEl.innerHTML=h; detailEl.style.display='block';

  // 使用按钮
  qs('.th-btn-use-item')?.addEventListener('click',function(this:HTMLElement){
    const on=this.getAttribute('data-owner')||''; const it=this.getAttribute('data-item')||'';
    try{safeTriggerSlash('/setinput '+tavernMacro('input')+' <'+on+'使用了'+it+'>')}catch(e){ void e; } closeModal();
  });
  // 丢弃按钮
  qs('.th-btn-discard-item')?.addEventListener('click',function(this:HTMLElement){
    const on=this.getAttribute('data-owner')||''; const it=this.getAttribute('data-item')||'';
    const ot=this.getAttribute('data-owner-type')||'npc';
    if(!currentData) return;
    if(ot==='npc'){
      const nps=_.get(currentData,'NPC',{})||{}; const its=_.get(nps[on],'拥有物品',{})||{}; delete its[it]; _.set(nps[on],'拥有物品',its); _.set(currentData,'NPC',nps);
      saveData(currentData);
      // PROGRESS §7 Step B：本地编辑统一采集
      try { collectStatDataChange(currentData, { snapshot: true, label: 'discardItem:npc' }); } catch(e) { void e; }
      renderCurrent(); openNPCBag(on);
    } else {
      const uu=getUser(currentData); const its=_.get(uu,'拥有物品',{})||{}; delete its[it]; _.set(uu,'拥有物品',its); setUser(currentData,uu);
      saveData(currentData);
      // PROGRESS §7 Step B：本地编辑统一采集
      try { collectStatDataChange(currentData, { snapshot: true, label: 'discardItem:user' }); } catch(e) { void e; }
      renderCurrent(); openUserBag(currentData);
    }
  });
  // 返回按钮
  qs('.th-btn-back-grid')?.addEventListener('click',()=>{
    detailEl.style.display='none'; detailEl.innerHTML='';
    if(gridEl) gridEl.style.display='';
  });
}

function showSkillDetail(name:string, sk:any, editPath:string, ownerName:string, _ownerType:string) {
  const detailEl=qs('#th-grid-detail'); if(!detailEl) return;
  const gridEl=detailEl.previousElementSibling as HTMLElement;
  if(gridEl) gridEl.style.display='none';
  let h='';
  if(isEditMode){
    h+=`<div class="th-modal-section"><div class="th-modal-label">名称</div>${editableInput(name,editPath+'.名称')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">等级</div>${editableInput(`${sk?.['等级']??1}`,editPath+'.等级','number')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">简介</div>${editableTextarea(sk?.['简介']||'',editPath+'.简介')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">效果</div>${editableTextarea(sk?.['效果']||'',editPath+'.效果')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">评价</div>${editableTextarea(sk?.['评价']||'',editPath+'.评价')}</div>`;
  } else {
    h+=`<div class="th-skill-row"><div class="th-skill-name">${esc(name)} <span style="font-size:13px;color:var(--lav);font-weight:700">Lv.${sk?.['等级']??1}</span></div>`;
    if(sk?.['简介']) h+=`<div class="th-skill-desc">${esc(sk['简介'])}</div>`;
    if(sk?.['效果']) h+=`<div class="th-skill-effect"><i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(sk['效果'])}</div>`;
    if(sk?.['评价']) h+=`<div class="th-skill-comment">${esc(sk['评价'])}</div>`;
  }
  h+=`<div class="th-item-actions">`;
  h+=`<button class="th-btn-sm th-btn-use th-btn-use-skill" data-owner="${escAttr(ownerName)}" data-skill="${escAttr(name)}"><i class="fa-solid fa-wand-magic-sparkles"></i> 使用</button>`;
  h+=`<button class="th-btn-sm th-btn-back-grid" style="background:var(--bg3);color:var(--tx2);border:1px solid var(--dv);margin-left:auto"><i class="fa-solid fa-arrow-left"></i> 返回</button>`;
  h+=`</div>`;
  detailEl.innerHTML=h; detailEl.style.display='block';

  qs('.th-btn-use-skill')?.addEventListener('click',function(this:HTMLElement){
    const on=this.getAttribute('data-owner')||''; const sk=this.getAttribute('data-skill')||'';
    try{safeTriggerSlash('/setinput '+tavernMacro('input')+' <'+on+'使用了'+sk+'>')}catch(e){ void e; } closeModal();
  });
  qs('.th-btn-back-grid')?.addEventListener('click',()=>{
    detailEl.style.display='none'; detailEl.innerHTML='';
    if(gridEl) gridEl.style.display='';
  });
}

// ================================================================
//  属性弹窗（需求6 + 需求9）
// ================================================================
// ================================================================
//  需求: 属性悬停浮窗HTML生成（bar图风格，与弹窗一致）
// ================================================================
function buildAttrBarHtml(attrs:Record<string,any>): string {
  let h='<div class="th-attr-grid-modal" style="gap:6px 12px;font-size:12px">';
  for(const k of ATTR_KEYS){
    const v=clamp(Number(attrs[k])||0,0,ATTR_MAX); const p=attrPct(v); const cls=ATTR_CLS[k]||'attr-type-default';
    h+=`<div class="th-attr-item" style="font-size:12px"><span class="th-attr-name" style="font-size:12px;min-width:36px">${k}</span><div class="th-attr-bar-wrap" style="height:7px"><div class="th-attr-bar-fill ${cls}" style="width:${p}%"></div></div><span class="th-attr-val" style="font-size:13px;min-width:28px">${v}</span></div>`;
  }
  let extraIdx=0;
  for(const[k,v]of Object.entries(attrs)){
    if((ATTR_KEYS as readonly string[]).includes(k)) continue;
    const val=clamp(Number(v)||0,0,ATTR_MAX); const p=attrPct(val);
    const color=`background:${pickExtraAttrColor(extraIdx++)};`;
    h+=`<div class="th-attr-item" style="font-size:12px"><span class="th-attr-name" style="font-size:12px;min-width:36px">${k}</span><div class="th-attr-bar-wrap" style="height:7px"><div class="th-attr-bar-fill" style="width:${p}%;${color}"></div></div><span class="th-attr-val" style="font-size:13px;min-width:28px">${val}</span></div>`;
  }
  h+=`</div>`;
  return h;
}

function openAttrModal(name:string,attrs:Record<string,any>, editPath?:string) {
  let extraIdx=0;
  let h='<div class="th-attr-grid-modal">';
  for(const k of ATTR_KEYS){
    const v=clamp(Number(attrs[k])||0,0,ATTR_MAX); const p=attrPct(v); const cls=ATTR_CLS[k]||'attr-type-default';
    const valHtml=isEditMode&&editPath?editableInput(`${v}`,editPath+'.'+k,'number'):`<span class="th-attr-val">${v}</span>`;
    const barHtml=isEditMode?'':`<div class="th-attr-bar-wrap"><div class="th-attr-bar-fill ${cls}" style="width:${p}%"></div></div>`;
    h+=`<div class="th-attr-item"><span class="th-attr-name">${k}</span>${barHtml}${valHtml}</div>`;
  }
  for(const[k,v]of Object.entries(attrs)){
    if((ATTR_KEYS as readonly string[]).includes(k)) continue;
    const val=clamp(Number(v)||0,0,ATTR_MAX); const p=attrPct(val);
    const color=isEditMode?'':`background:${pickExtraAttrColor(extraIdx++)};`;
    const valHtml=isEditMode&&editPath?editableInput(`${val}`,editPath+'.'+k,'number'):`<span class="th-attr-val">${val}</span>`;
    const barHtml=isEditMode?'':`<div class="th-attr-bar-wrap"><div class="th-attr-bar-fill" style="width:${p}%;${color}"></div></div>`;
    h+=`<div class="th-attr-item"><span class="th-attr-name">${k}</span>${barHtml}${valHtml}</div>`;
  }
  h+=`</div>`;
  openModal(`<i class="fa-solid fa-chart-pie"></i> `+esc(name)+' · 属性',h);
}

// ================================================================
//  需求6：画廊弹窗
// ================================================================
function openGalleryModal(npcName:string) {
  const images=getNPCGallery(npcName);
  let h=`<div class="th-gallery-grid">`;
  images.forEach((url,idx)=>{
    h+=`<div class="th-gallery-item" data-gidx="${idx}"><img src="${escAttr(url)}" alt="画廊图片${idx+1}" data-gfull="${escAttr(url)}"><button class="th-gallery-delete" data-gdel="${idx}" data-gnpc="${escAttr(npcName)}"><i class="fa-solid fa-xmark"></i></button></div>`;
  });
  h+=`<div class="th-gallery-add" data-gadd="${escAttr(npcName)}"><i class="fa-solid fa-plus"></i></div>`;
  h+=`</div>`;
  openModal(`<i class="fa-solid fa-images"></i> `+esc(npcName)+' · 画廊',h);
  // 绑定事件
  setTimeout(()=>{
    // 图片点击→大图查看
    qsa('.th-gallery-item img').forEach(img=>img.addEventListener('click',function(this:HTMLElement){
      const full=this.getAttribute('data-gfull')||'';
      if(full) showImage(full);
    }));
    // 删除按钮
    qsa('.th-gallery-delete').forEach(btn=>btn.addEventListener('click',function(this:HTMLElement,e:Event){
      e.stopPropagation();
      const idx=parseInt(this.getAttribute('data-gdel')||'');
      const nm=this.getAttribute('data-gnpc')||'';
      if(!isNaN(idx)){ deleteNPCGalleryImage(nm,idx); closeModal(); openGalleryModal(nm); }
    }));
    // 添加按钮→触发文件选择
    qsa('.th-gallery-add').forEach(btn=>btn.addEventListener('click',function(this:HTMLElement,e:Event){
      e.stopPropagation();
      const nm=this.getAttribute('data-gadd')||'';
      const fi=qs<HTMLInputElement>('.th-avatar-file-input');
      if(fi){ (window as any).__galleryTarget__=nm; fi.setAttribute('multiple','multiple'); fi.click(); fi.removeAttribute('multiple'); }
    }));
  },40);
}
// 需求1：地点/事件总览弹窗
let locHoverTimer: ReturnType<typeof setTimeout>|null = null;
let locHoverTip: HTMLElement|null = null;

function ensureLocHoverTip(): HTMLElement {
  if (!locHoverTip) {
    locHoverTip = __doc.createElement('div');
    locHoverTip.className = 'th-loc-hover-tip';
    locHoverTip.style.display = 'none';
    __body.appendChild(locHoverTip);
  }
  return locHoverTip;
}
function showLocHover(anchor:HTMLElement, name:string, desc:string, kind:ManagedKind='location') {
  if (locHoverTimer) clearTimeout(locHoverTimer);
  const cfg=getStashKindCfg(kind);
  const isStash = kind.startsWith('stash-');
  const tip = ensureLocHoverTip();
  if (isStash) {
    // 储藏间不绑世界书，只显示名称和描述
    const displayDesc = getDisplayDesc(desc);
    tip.innerHTML = `<div class="th-loc-hover-name"><i class="${cfg.icon}"></i> ${esc(name)}</div><div class="th-loc-hover-desc">${esc(displayDesc)}</div>`;
  } else {
    const state=managedEntryStates[kind]?.[name];
    const bindText=state?.bound?`已绑定 ${state.count} 个条目，已开启 ${state.enabledCount} 个`:'未找到对应世界书条目';
    tip.innerHTML = `<div class="th-loc-hover-name"><i class="${cfg.icon}"></i> ${esc(name)}</div><div class="th-loc-hover-desc">${esc(desc)}</div><div class="th-loc-hover-bind ${state?.bound?'bound':'unbound'}"><i class="fa-solid fa-circle-info"></i> ${esc(bindText)}</div>`;
  }
  positionTipWithFloatingUi(tip, anchor, 'loc', { maxW: 400 });
  // 浮窗自身 keepalive：同 .th-hover-tip 模式
  tip.onmouseenter = () => { if (locHoverTimer) { clearTimeout(locHoverTimer); locHoverTimer = null; } };
  tip.onmouseleave = () => { hideLocHoverNow(); };
}
function hideLocHover() {
  if (locHoverTimer) clearTimeout(locHoverTimer);
  locHoverTimer = setTimeout(() => { hideLocHoverNow(); }, 150);
}
function hideLocHoverNow() {
  if (locHoverTimer) { clearTimeout(locHoverTimer); locHoverTimer = null; }
  if (locHoverTip) {
    locHoverTip.style.display = 'none';
    locHoverTip.onmouseenter = null;
    locHoverTip.onmouseleave = null;
  }
  if (activeLocCleanup) { activeLocCleanup(); activeLocCleanup = null; }
}

function getCharWorldbookList(): string[] {
  const books=safeGetCharWorldbookNames('current');
  return [books.primary,...books.additional].filter((name): name is string=>!!name);
}

function parseManagedEntryName(entryName:string): {kind:ManagedKind|null; name:string} {
  for(const kind of Object.keys(MANAGED_CFG) as ManagedKind[]){
    const cfg=MANAGED_CFG[kind];
    if(entryName.startsWith(cfg.prefix)) return {kind,name:entryName.slice(cfg.prefix.length).trim()};
  }
  return {kind:null,name:entryName};
}

function strategyLabel(type:string): string {
  if(type==='constant') return '蓝灯';
  if(type==='selective') return '绿灯';
  if(type==='vectorized') return '向量';
  return type||'未知';
}
function positionLabel(type:string): string {
  const map:Record<string,string>={
    before_character_definition:'角色定义前', after_character_definition:'角色定义后',
    before_example_messages:'示例消息前', after_example_messages:'示例消息后',
    before_author_note:'作者注释前', after_author_note:'作者注释后',
    at_depth:'指定深度', outlet:'出口',
  };
  return map[type]||type||'未知';
}
function keysToText(keys:any[]): string { return (keys||[]).map(k=>String(k)).join('\n'); }
function textToKeys(text:string): string[] { return text.split(/\r?\n|,/).map(s=>s.trim()).filter(Boolean); }
function nullableNumberFromInput(value:string): number|null { const t=value.trim(); if(!t) return null; const n=Number(t); return isNaN(n)?null:n; }
function numberFromInput(value:string, fallback:number): number { const n=Number(value); return isNaN(n)?fallback:n; }
function boolFromSelect(value:string): boolean { return value==='true'; }

async function loadInspectorEntries(): Promise<InspectorEntry[]> {
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

async function updateInspectorEntry(worldbookName:string, uid:number, updater:(entry:WorldbookEntry)=>WorldbookEntry) {
  await safeUpdateWorldbookWith(worldbookName, entries=>entries.map(entry=>entry.uid===uid?updater(entry):entry), {render:'debounced'});
}

function inspectorSortRank(entry:WorldbookEntry): number {
  if(!entry.enabled) return 2;
  return entry.strategy?.type==='selective'?1:0;
}
function sortInspectorEntries(entries:InspectorEntry[]): InspectorEntry[] {
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

async function refreshManagedStatesAfterWorldbookEdit() {
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

async function safeRefreshManagedEntryStates(kind:ManagedKind) {
  try {
    await refreshManagedEntryStates(kind);
  } catch(e) {
    managedEntryStates[kind]={};
    console.warn(`[此间天地] ${MANAGED_CFG[kind].label}世界书绑定状态刷新失败`,e);
    toastr?.warning?.(`${MANAGED_CFG[kind].label}绑定状态刷新失败，请确认当前角色卡已绑定世界书`);
  }
}

async function toggleManagedWorldbookEntry(kind:ManagedKind, name:string, desc:string): Promise<boolean|null> {
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

async function disableAllManagedWorldbookEntries(kind:ManagedKind): Promise<number|null> {
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

async function openManagedModal(kind:ManagedKind, filterTag:string|null=null) {
  const cfg=MANAGED_CFG[kind];
  setCurrentManagedItems(kind,getManagedItems(kind));
  await safeRefreshManagedEntryStates(kind);
  currentFilterTag = filterTag; // 设置当前筛选标签
  currentlyCollapsed = loadBucketCollapsed()[kind] || {}; // 加载桶折叠状态

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
  openModal(`<i class="${titleIcon}"></i> ${cfg.storageName} (${totalCount}) <span class="th-modal-title-actions"><button class="th-title-io-btn" id="${idPrefix}-tags-btn" title="标签管理"><i class="fa-solid fa-tags"></i></button><button class="th-title-io-btn" id="${idPrefix}-refresh-btn" title="刷新绑定状态"><i class="fa-solid fa-rotate"></i></button><button class="th-title-io-btn th-title-danger-btn" id="${idPrefix}-disable-all-btn" title="关闭全部${cfg.label}世界书条目"><i class="fa-solid fa-power-off"></i></button><button class="th-title-io-btn" id="${idPrefix}-scan-btn" title="扫描未绑定世界书条目"><i class="fa-solid fa-magnifying-glass"></i></button><button class="th-title-io-btn" id="${idPrefix}-seed-btn" title="重读初始数据：从世界书 [初始·${cfg.label}] 条目读取初始数据，增量合并到本地（不删除你已有的卡片）"><i class="fa-solid fa-seedling"></i></button><button class="th-title-io-btn" id="${idPrefix}-export-btn" title="导出"><i class="fa-solid fa-download"></i></button><button class="th-title-io-btn" id="${idPrefix}-import-btn" title="导入"><i class="fa-solid fa-upload"></i></button></span>`, h);

  setTimeout(() => { console.log('[openManagedModal] setTimeout fired, kind=' + kind); bindManagedModalEvents(kind,idPrefix); }, 100);
}

function openLocationsModal() { void openManagedModal('location'); }
function openEventsModal() { void openManagedModal('event'); }
function openDlcsModal() { void openManagedModal('dlc'); }

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
            <div style="font-size:12px;color:var(--tx3);margin-top:2px;line-height:1.5;word-break:break-word;">${esc(entry.content.slice(0,100))}${entry.content.length>100?'...':''}</div>
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

// ==================== 储藏间主 Modal（阶段 C）====================
const STASH_FIXED_KINDS: ManagedKind[] = ['stash-item', 'stash-skill', 'stash-status', 'stash-clothing'];
let currentStashTab: ManagedKind = 'stash-item';
let isStashAllTab: boolean = false; // 是否在"全部"tab

let _stashModalBusy = false;
function openStashModal(initialTab?: ManagedKind | 'all') {
  if (_stashModalBusy) { console.warn('[openStashModal] re-entrant call blocked'); return; }
  _stashModalBusy = true;
  try {
  currentStashTab = initialTab === 'all' ? 'stash-item' : (initialTab || 'stash-item');
  isStashAllTab = initialTab === 'all';
  const customKinds = loadStashKinds();
  const allTabs: ManagedKind[] = [...STASH_FIXED_KINDS, ...Object.keys(customKinds).map(k => `stash-custom-${k}` as ManagedKind)];

  // 构建 tab 行
  let tabRow = '<div class="th-stash-kind-tabs">';
  // "全部" tab 放在最前面
  tabRow += `<button class="th-stash-kind-tab ${isStashAllTab ? 'active' : ''}" data-stash-kind="all">
    <i class="fa-solid fa-layer-group"></i> 全部
  </button>`;
  for (const kind of allTabs) {
    const cfg = getStashKindCfg(kind);
    const isActive = !isStashAllTab && kind === currentStashTab;
    const isCustom = kind.startsWith('stash-custom-');
    tabRow += `<button class="th-stash-kind-tab ${isActive ? 'active' : ''}" data-stash-kind="${kind}" ${isCustom ? `data-custom-kind="${kind.replace('stash-custom-', '')}"` : ''}>
      <i class="${cfg.icon}"></i> ${esc(cfg.label)}
      ${isCustom ? `<span class="th-stash-kind-del" data-del-custom="${escAttr(kind.replace('stash-custom-', ''))}" title="删除类别"><i class="fa-solid fa-xmark"></i></span>` : ''}
    </button>`;
  }
  tabRow += `<button class="th-stash-kind-new-btn" title="新建类别"><i class="fa-solid fa-plus"></i></button>`;
  tabRow += '</div>';

  // 构建内容区
  const cfg = isStashAllTab ? { icon: 'fa-solid fa-layer-group', label: '全部', storageName: '储藏间·全部', defaultInject: '' } : getStashKindCfg(currentStashTab);
  if (!isStashAllTab) {
    // 确保自定义 kind 数据被正确加载和初始化
    const items = getManagedItems(currentStashTab);
    setCurrentManagedItems(currentStashTab, items);
    // 加载桶折叠状态
    currentlyCollapsed = loadBucketCollapsed()[currentStashTab] || {};
  }
  const idPrefix = 'th-stash';

  let h = `<div class="th-stash-modal">`;
  h += tabRow;
  h += `<input type="file" id="${idPrefix}-import-file" accept=".json,.txt" style="display:none">`;
  h += `<input class="th-location-search th-edit-input" type="search" id="${idPrefix}-search" placeholder="搜索${cfg.label}...">`;
  if (isStashAllTab) {
    // "全部" tab: 按 kind 分组平铺
    h += `<div class="th-managed-grid" id="${idPrefix}-grid" data-kind="all">`;
    h += renderAllStashCards(allTabs);
    h += `</div>`;
  } else {
    // 标签筛选栏（Phase 2）
    h += renderTagFilterBar(currentStashTab, idPrefix);
    // 按桶渲染
    h += `<div class="th-managed-grid" id="${idPrefix}-grid" data-kind="${currentStashTab}">`;
    h += renderManagedBuckets(currentStashTab, idPrefix);
    h += `</div>`;
  }
  h += `<button class="th-location-add-btn" id="${idPrefix}-add-btn" ${isStashAllTab ? 'style="display:none"' : ''}><i class="fa-solid fa-plus"></i> 新建${cfg.label}</button>`;
  h += `</div>`;

  openModal(`<i class="fa-solid fa-treasure-chest"></i> 储藏间 <span class="th-modal-title-actions"><button class="th-title-io-btn" id="${idPrefix}-tags-btn" title="标签管理"><i class="fa-solid fa-tags"></i></button><button class="th-title-io-btn" id="${idPrefix}-dispatch-tag-btn" title="按标签配发：选择一个标签，将该标签下的所有物品批量配发给多个目标"><i class="fa-solid fa-share"></i></button><button class="th-title-io-btn" id="${idPrefix}-seed-btn" title="重读初始数据：从 [初始·储藏间] 世界书条目增量补入缺失卡片（不覆盖已有、不复活已删）"><i class="fa-solid fa-seedling"></i></button><button class="th-title-io-btn" id="${idPrefix}-runtime-import-btn" title="从角色数据导入：读取当前主角和所有 NPC 的物品/技能/状态/衣物，勾选后导入储藏间并写入 [初始·储藏间] 世界书条目"><i class="fa-solid fa-users"></i></button><button class="th-title-io-btn" id="${idPrefix}-export-btn" title="导出"><i class="fa-solid fa-download"></i></button><button class="th-title-io-btn" id="${idPrefix}-import-btn" title="导入"><i class="fa-solid fa-upload"></i></button></span>`, h);

  _stashModalBusy = false; // DOM 已替换，立即解锁（事件绑定延迟不影响后续 openStashModal 调用）
  setTimeout(() => { bindStashModalEvents(idPrefix, allTabs); }, 100);
  } catch(e) { _stashModalBusy = false; throw e; }
}

function getStashKindCfg(kind: ManagedKind): { icon: string; label: string; storageName: string; storageKey: string; defaultInject: string; prefix: string; bindsWorldbook: boolean } {
  if (kind.startsWith('stash-custom-')) {
    const customName = kind.replace('stash-custom-', '');
    const customKinds = loadStashKinds();
    const meta = customKinds[customName];
    const label = meta?.label || customName;
    return { icon: meta?.icon || 'fa-solid fa-box', label, storageName: `储藏间·${label}`, storageKey: getStashKindStorageKey(customName), defaultInject: `<使用${label}：{{name}}，{{desc}}>`, prefix: '', bindsWorldbook: false };
  }
  const cfg = MANAGED_CFG[kind];
  return { icon: cfg.icon, label: cfg.label, storageName: cfg.storageName, storageKey: cfg.storageKey, defaultInject: cfg.defaultInject, prefix: cfg.prefix, bindsWorldbook: cfg.bindsWorldbook };
}

function bindStashModalEvents(idPrefix: string, allTabs: ManagedKind[]) {
  console.log('[bindStashModalEvents] called');
  try {
    // tab 切换
    qsa('.th-stash-kind-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        // 如果点击的是删除按钮，不切换 tab
        if ((e.target as HTMLElement).closest('.th-stash-kind-del')) return;
        const kind = tab.getAttribute('data-stash-kind');
        if (kind === 'all') {
          openStashModal('all');
        } else if (kind) {
          currentStashTab = kind as ManagedKind;
          openStashModal(kind as ManagedKind);
        }
      });
    });
    // 自定义 kind tab 上的删除按钮（替代右键菜单）— 独立于 tab forEach
    qsa('.th-stash-kind-del').forEach(delBtn => {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const customKind = delBtn.getAttribute('data-del-custom') || '';
        if (!customKind) return;
        const customKinds = loadStashKinds();
        const meta = customKinds[customKind];
        if (confirm(`确定要删除类别「${meta?.label || customKind}」及其所有数据吗？`)) {
          deleteStashKind(customKind);
          currentStashTab = 'stash-item';
          toastr?.success?.(`已删除类别：${meta?.label || customKind}`);
          openStashModal(currentStashTab);
        }
      });
    });

    // 新建类别按钮
    qs('.th-stash-kind-new-btn')?.addEventListener('click', () => {
      showNewStashKindForm();
    });

    // 标签管理按钮
    qs(`#${idPrefix}-tags-btn`)?.addEventListener('click', () => {
      openTagManagerModal(currentStashTab, idPrefix);
    });

    // 按标签配发按钮
    qs(`#${idPrefix}-dispatch-tag-btn`)?.addEventListener('click', () => {
      if (isStashAllTab) { toastr?.warning?.('请先切换到具体的物品/技能 tab'); return; }
      if (!currentData) { toastr?.warning?.('当前没有角色数据'); return; }
      openDispatchByTagModal(currentStashTab, idPrefix);
    });

    // 重读初始数据按钮（反馈7）：从 [初始·储藏间] 世界书条目增量补入全部 stash kind 的缺失卡片
    qs(`#${idPrefix}-seed-btn`)?.addEventListener('click', async () => {
      const btn = qs(`#${idPrefix}-seed-btn`);
      if (btn) btn.setAttribute('disabled', 'true');
      try {
        const parsed = await readInitialDataFromWorldbook();
        // 储藏间条目 [初始·储藏间] 是多 kind，byKind 里含 stash-item/skill/status/clothing
        const stashKinds = ['stash-item','stash-skill','stash-status','stash-clothing'] as ManagedKind[];
        const filteredByKind: Record<string, { name: string; item: ManagedItemV2 }[]> = {};
        let total = 0;
        for (const k of stashKinds) {
          const arr = parsed.byKind[k] || [];
          if (arr.length) { filteredByKind[k] = arr; total += arr.length; }
        }
        if (!total) {
          toastr?.info?.('未找到 [初始·储藏间] 世界书条目，或条目内无数据');
          return;
        }
        const singleParsed: ParsedImport = { byKind: filteredByKind, warnTags: parsed.warnTags };
        const result = await mergeInitialDataIntoLocal(singleParsed);
        // 刷新所有受影响 stash kind 的 currentManagedItems
        for (const k of stashKinds) setCurrentManagedItems(k, getManagedItems(k));
        openStashModal(isStashAllTab ? 'all' : currentStashTab);
        let msg = `已从初始数据补入 ${result.added} 张储藏间卡片`;
        if (result.skipped) msg += `，跳过 ${result.skipped} 张（本地已存在）`;
        toastr?.success?.(msg);
        if (parsed.warnTags.length) {
          toastr?.warning?.(`初始数据含未定义标签（已忽略）：${[...new Set(parsed.warnTags)].slice(0, 5).join('、')}`);
        }
      } catch (e) {
        console.warn('[储藏间重读初始数据] 失败', e);
        toastr?.error?.('重读初始数据失败，请查看控制台');
      } finally {
        if (btn) btn.removeAttribute('disabled');
      }
    });

    // 从角色数据导入按钮(§10.6 Build 2-2/2-3)
    qs(`#${idPrefix}-runtime-import-btn`)?.addEventListener('click', () => {
      if (!currentData) { toastr?.warning?.('当前没有角色数据'); return; }
      const collected = collectRuntimeStashData();
      const totalCount = Object.values(collected).reduce((s, arr) => s + arr.length, 0);
      if (totalCount === 0) { toastr?.info?.('当前主角和 NPC 都没有物品/技能/状态/衣物数据'); return; }
      openRuntimeImportModal(collected, allTabs);
    });

    // 导出按钮
    qs(`#${idPrefix}-export-btn`)?.addEventListener('click', () => {
      if (isStashAllTab) {
        exportAllStashKinds(allTabs);
        return;
      }
      // 有标签时弹出选择菜单
      const allTags = loadTags();
      const kindTags = allTags[currentStashTab] || {};
      if (Object.keys(kindTags).length === 0) {
        exportStashKind(currentStashTab);
        return;
      }
      // 弹出选择
      const html = `<div style="padding:16px;">
        <div style="margin-bottom:12px;font-weight:500;">选择导出方式</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button class="th-btn-sm" id="export-all" style="justify-content:flex-start;"><i class="fa-solid fa-download"></i> 导出全部</button>
          <button class="th-btn-sm" id="export-by-tag" style="justify-content:flex-start;"><i class="fa-solid fa-tags"></i> 按标签导出</button>
        </div>
      </div>`;
      openModal2('导出选项', html, { maxWidth: '300px' });
      qs('#export-all')?.addEventListener('click', () => { closeModal2(); exportStashKind(currentStashTab); });
      qs('#export-by-tag')?.addEventListener('click', () => { closeModal2(); openExportByTagModal(currentStashTab); });
    });

    // 导入按钮
    qs(`#${idPrefix}-import-btn`)?.addEventListener('click', () => {
      const fi = qs<HTMLInputElement>(`#${idPrefix}-import-file`);
      if (fi) fi.click();
    });

    // 导入文件处理
    qs(`#${idPrefix}-import-file`)?.addEventListener('change', function(this: HTMLInputElement) {
      if (!this.files || !this.files.length) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        openImportWithTagModal(isStashAllTab ? '__all__' : currentStashTab, text, allTabs);
      };
      reader.readAsText(this.files[0], 'utf-8');
      this.value = '';
    });

    // 按标签导出按钮（批量模式）
    qs(`#${idPrefix}-export-tag-btn`)?.addEventListener('click', () => {
      if (isStashAllTab) { toastr?.warning?.('请先切换到具体的物品/技能 tab'); return; }
      openExportByTagModal(currentStashTab);
    });

    // 搜索 + 历史下拉（stash）
    const stashSearchInput = qs<HTMLInputElement>(`#${idPrefix}-search`);
    let stashSearchDebounce: number | null = null;
    if (stashSearchInput) {
      stashSearchInput.addEventListener('input', function(this: HTMLInputElement) {
        rerenderManagedGrid(currentStashTab, idPrefix, this.value.trim().toLowerCase());
        if (stashSearchDebounce) clearTimeout(stashSearchDebounce);
        stashSearchDebounce = setTimeout(() => {
          if (this.value.trim()) pushSearchHistory(currentStashTab, this.value.trim());
        }, 1000) as any;
      });
      stashSearchInput.addEventListener('focus', function() {
        const history = loadSearchHistory(currentStashTab);
        if (!history.length) return;
        const oldDrop = qs(`#${idPrefix}-search-history`);
        if (oldDrop) oldDrop.remove();
        const drop = __doc.createElement('div');
        drop.id = `${idPrefix}-search-history`;
        drop.className = 'th-search-history';
        drop.style.cssText = `position:absolute;top:100%;left:0;margin-top:4px;width:100%;z-index:100`;
        drop.innerHTML = history.map(h => `<div class="th-search-history-item" data-term="${escAttr(h)}">${esc(h)}<span class="th-search-history-del">×</span></div>`).join('');
        stashSearchInput.parentElement?.appendChild(drop);
        drop.addEventListener('click', (e) => {
          e.stopPropagation();
          const del = (e.target as HTMLElement).closest('.th-search-history-del');
          const item = (e.target as HTMLElement).closest('.th-search-history-item');
          if (del && item) {
            const term = item.getAttribute('data-term') || '';
            let all = loadSearchHistory(currentStashTab);
            all = all.filter(t => t !== term);
            try {
              const raw = localStorage.getItem('_th_search_history_v1');
              const full: Record<string, string[]> = raw ? JSON.parse(raw) : {};
              full[currentStashTab] = all;
              localStorage.setItem('_th_search_history_v1', JSON.stringify(full));
            } catch { }
            drop.remove();
            if (stashSearchInput.value) stashSearchInput.focus();
            return;
          }
          if (item) {
            const term = item.getAttribute('data-term') || '';
            stashSearchInput.value = term;
            rerenderManagedGrid(currentStashTab, idPrefix, term.trim().toLowerCase());
            drop.remove();
          }
        });
      });
      stashSearchInput.addEventListener('blur', () => {
        setTimeout(() => {
          const drop = qs(`#${idPrefix}-search-history`);
          if (drop) drop.remove();
        }, 150);
      });
    }

    // 储藏间标签筛选栏事件绑定（Phase 2）（仅非"全部"tab）
    if (!isStashAllTab) {
      // 最近10张按钮
      qs('[data-recent-toggle]')?.addEventListener('click', function(this: HTMLElement) {
        showRecentOnly[currentStashTab] = !showRecentOnly[currentStashTab];
        if (showRecentOnly[currentStashTab]) {
          currentFilterTag = null;
          showFavOnly[currentStashTab] = false;
          qsa('.th-tag-filter-btn[data-filter-tag]').forEach(b => b.classList.remove('active'));
          qs('[data-fav-toggle]')?.classList.remove('active');
        }
        this.classList.toggle('active', showRecentOnly[currentStashTab]);
        const grid = qs(`#${idPrefix}-grid`);
        if (grid) grid.innerHTML = renderManagedBuckets(currentStashTab, idPrefix, (qs<HTMLInputElement>(`#${idPrefix}-search`)?.value || '').trim().toLowerCase());
        bindManagedCardEvents(currentStashTab, idPrefix);
      });

      // 只看收藏按钮
      qs('[data-fav-toggle]')?.addEventListener('click', function(this: HTMLElement) {
        showFavOnly[currentStashTab] = !showFavOnly[currentStashTab];
        if (showFavOnly[currentStashTab]) {
          currentFilterTag = null;
          showRecentOnly[currentStashTab] = false;
          qsa('.th-tag-filter-btn[data-filter-tag]').forEach(b => b.classList.remove('active'));
          qs('[data-recent-toggle]')?.classList.remove('active');
        }
        this.classList.toggle('active', showFavOnly[currentStashTab]);
        const grid = qs(`#${idPrefix}-grid`);
        if (grid) grid.innerHTML = renderManagedBuckets(currentStashTab, idPrefix, (qs<HTMLInputElement>(`#${idPrefix}-search`)?.value || '').trim().toLowerCase());
        bindManagedCardEvents(currentStashTab, idPrefix);
      });

      // 标签筛选按钮
      qsa('.th-tag-filter-btn[data-filter-tag]').forEach(btn => {
        btn.addEventListener('click', () => {
          showRecentOnly[currentStashTab] = false;
          showFavOnly[currentStashTab] = false;
          qs('[data-recent-toggle]')?.classList.remove('active');
          qs('[data-fav-toggle]')?.classList.remove('active');
          const filterTag = btn.getAttribute('data-filter-tag') || '__all__';
          if (filterTag === '__all__') currentFilterTag = null;
          else if (filterTag === '__none__') currentFilterTag = '';
          else currentFilterTag = filterTag;
          // 更新 active 状态
          qsa('.th-tag-filter-btn[data-filter-tag]').forEach(b => b.classList.toggle('active', b === btn));
          // 重新渲染桶
          const grid = qs(`#${idPrefix}-grid`);
          if (grid) grid.innerHTML = renderManagedBuckets(currentStashTab, idPrefix, (qs<HTMLInputElement>(`#${idPrefix}-search`)?.value || '').trim().toLowerCase());
          bindManagedCardEvents(currentStashTab, idPrefix);
          bindCollapseToggleEvents(currentStashTab, idPrefix);
        });
      });

      // 排序下拉
      qs<HTMLSelectElement>(`#${idPrefix}-sort`)?.addEventListener('change', function(this: HTMLSelectElement) {
        saveSortMode(currentStashTab, this.value as SortMode);
        rerenderManagedGrid(currentStashTab, idPrefix, (qs<HTMLInputElement>(`#${idPrefix}-search`)?.value || '').trim().toLowerCase());
      });

      // 全部折叠按钮
      qs(`#${idPrefix}-collapse-all`)?.addEventListener('click', () => {
        setAllBucketsCollapsed(currentStashTab, true);
        updateAllBucketVisuals();
      });

      // 全部展开按钮
      qs(`#${idPrefix}-expand-all`)?.addEventListener('click', () => {
        setAllBucketsCollapsed(currentStashTab, false);
        updateAllBucketVisuals();
      });

      // 绑定折叠/展开 toggle 事件
      bindCollapseToggleEvents(currentStashTab, idPrefix);
    }

    // 卡片事件
    bindManagedCardEvents(currentStashTab, idPrefix);

    // 新建按钮 → 打开结构化表单（与背包一致）
    qs(`#${idPrefix}-add-btn`)?.addEventListener('click', () => {
      openStashAddItemForm(currentStashTab);
    });
  } catch(e) { console.error('[bindStashModalEvents] error:', e); }
}

// 储藏间新建物品 — 结构化表单（与背包字段一致）
function openStashAddItemForm(kind: ManagedKind) {
  const cfg = getStashKindCfg(kind);
  const isFixed = STASH_FIXED_KINDS.includes(kind);
  const fieldOrder: Record<string, string[]> = {
    'stash-item': ['名称','数量','简介','效果','评价'],
    'stash-skill': ['名称','等级','简介','效果','评价'],
    'stash-status': ['名称','效果','来源','持续时间'],
    'stash-clothing': ['名称','穿着部位','衣物状态','外观详情'],
  };
  const defaults: Record<string, Record<string, any>> = {
    'stash-item': {数量:1,简介:'',效果:'',评价:''},
    'stash-skill': {等级:1,简介:'',效果:'',评价:''},
    'stash-status': {效果:'',来源:'',持续时间:''},
    'stash-clothing': {穿着部位:'',衣物状态:'',外观详情:''},
  };
  const fields = isFixed ? (fieldOrder[kind] || ['名称','简介']) : ['名称','简介'];
  const defs = isFixed ? (defaults[kind] || {}) : {};
  const longFields = new Set(['简介','效果','评价','外观详情']);

  let h = `<div class="th-add-form">`;
  for (const f of fields) {
    const value = f === '名称' ? '' : (defs[f] ?? '');
    const isNum = (kind === 'stash-item' && f === '数量') || (kind === 'stash-skill' && f === '等级');
    h += `<div class="th-modal-section"><div class="th-modal-label">${esc(f)}</div>`;
    if (longFields.has(f)) h += `<textarea class="th-edit-textarea th-add-field" data-add-field="${escAttr(f)}" rows="3">${esc(value)}</textarea>`;
    else h += `<input class="th-edit-input th-add-field" data-add-field="${escAttr(f)}" type="${isNum ? 'number' : 'text'}" value="${escAttr(value)}">`;
    h += `</div>`;
  }
  h += `<div class="th-edit-actions">
    <button class="th-btn-sm th-btn-add-confirm" type="button"><i class="fa-solid fa-check"></i> 添加</button>
    <button class="th-btn-sm th-btn-add-cancel" type="button" style="margin-left:auto"><i class="fa-solid fa-xmark"></i> 取消</button>
  </div></div>`;

  openModal2(`<i class="${cfg.icon}"></i> 新建${cfg.label}`, h);

  setTimeout(() => {
    const root = qs('.th-modal-body-2'); if (!root) return;
    const getVal = (f: string) => (root.querySelector(`[data-add-field="${f}"]`) as HTMLInputElement | HTMLTextAreaElement | null)?.value || '';

    root.querySelector('.th-btn-add-cancel')?.addEventListener('click', () => { closeModal2(); });

    root.querySelector('.th-btn-add-confirm')?.addEventListener('click', () => {
      const name = getVal('名称').trim();
      if (!name) { toastr?.warning?.('请输入名称'); return; }

      if (isFixed) {
        // 固定 kind: 构建结构化 payload（与背包一致）
        const addKind: AddKind = kind === 'stash-item' ? 'item' : kind === 'stash-skill' ? 'skill' : kind === 'stash-status' ? 'status' : 'clothing';
        const payload: Record<string, any> = { ...getDefaultEntry(addKind) };
        for (const f of fields) {
          if (f === '名称') continue;
          const raw = getVal(f);
          if ((addKind === 'item' && f === '数量') || (addKind === 'skill' && f === '等级')) {
            const n = Number(raw); payload[f] = isNaN(n) ? payload[f] : n;
          } else {
            payload[f] = raw;
          }
        }
        setCurrentManagedItems(kind, getManagedItems(kind));
        // desc 存 JSON 字符串，保持 ManagedItemV2 兼容
        addManagedItem(kind, name, { desc: JSON.stringify(payload), tags: [], inject: cfg.defaultInject });
      } else {
        // 自定义 kind: 简单 name+desc
        const desc = getVal('简介').trim();
        if (!desc) { toastr?.warning?.('请输入简介'); return; }
        setCurrentManagedItems(kind, getManagedItems(kind));
        addManagedItem(kind, name, { desc, tags: [], inject: cfg.defaultInject });
      }

      toastr?.success?.(`已添加：${name}`);
      closeModal2();
      openStashModal(kind);
    });

    (root.querySelector('[data-add-field="名称"]') as HTMLInputElement | null)?.focus();
  }, 60);
}

// 新建自定义 kind inline form
function showNewStashKindForm() {
  // 26+ 常用 icon grid（均已在 lib/icons.ts 的 ICONS 映射中，避免渲染成白色方块）
  const ICON_GRID = [
    'fa-solid fa-box', 'fa-solid fa-trophy', 'fa-solid fa-star', 'fa-solid fa-gem',
    'fa-solid fa-wand-magic-sparkles', 'fa-solid fa-scroll', 'fa-solid fa-book',
    'fa-solid fa-puzzle-piece', 'fa-solid fa-gift', 'fa-solid fa-crown',
    'fa-solid fa-shield-halved', 'fa-solid fa-sword', 'fa-solid fa-bolt',
    'fa-solid fa-heart', 'fa-solid fa-fire', 'fa-solid fa-leaf',
    'fa-solid fa-moon', 'fa-solid fa-sun', 'fa-solid fa-music',
    'fa-solid fa-palette', 'fa-solid fa-feather', 'fa-solid fa-ring',
    'fa-solid fa-hat-wizard', 'fa-solid fa-key', 'fa-solid fa-coins',
    'fa-solid fa-compass', 'fa-solid fa-map',
  ];
  const iconGridHtml = ICON_GRID.map(icon =>
    `<button class="th-icon-grid-item" data-icon="${icon}"><i class="${icon}"></i></button>`
  ).join('');

  const formHtml = `
    <div class="th-stash-new-kind-form">
      <div class="th-modal-section">
        <div class="th-modal-label">类别名称（英文小写+数字+短横线，1-12字符）</div>
        <input class="th-edit-input" id="th-new-kind-name" placeholder="achievement" maxlength="12" pattern="[a-z0-9-]+">
      </div>
      <div class="th-modal-section">
        <div class="th-modal-label">显示名称（可选，默认=类别名称）</div>
        <input class="th-edit-input" id="th-new-kind-label" placeholder="成就">
      </div>
      <div class="th-modal-section">
        <div class="th-modal-label">图标（点击选择）</div>
        <input class="th-edit-input" id="th-new-kind-icon" value="fa-solid fa-box" readonly style="margin-bottom:6px">
        <div class="th-icon-grid">${iconGridHtml}</div>
      </div>
      <div class="th-edit-actions">
        <button class="th-btn-sm th-btn-new-kind-confirm" type="button"><i class="fa-solid fa-check"></i> 创建</button>
        <button class="th-btn-sm th-btn-new-kind-cancel" type="button" style="margin-left:auto"><i class="fa-solid fa-xmark"></i> 取消</button>
      </div>
    </div>
  `;
  openModal2('<i class="fa-solid fa-plus"></i> 新建储藏间类别', formHtml);

  setTimeout(() => {
    qs('.th-btn-new-kind-cancel')?.addEventListener('click', () => { closeModal2(); });
    // Icon grid 点选
    qsa('.th-icon-grid-item').forEach(item => {
      item.addEventListener('click', () => {
        const icon = item.getAttribute('data-icon') || '';
        const iconInput = qs<HTMLInputElement>('#th-new-kind-icon');
        if (iconInput) iconInput.value = icon;
        // 高亮选中态
        qsa('.th-icon-grid-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
      });
    });
    qs('.th-btn-new-kind-confirm')?.addEventListener('click', () => {
      const nameInput = qs<HTMLInputElement>('#th-new-kind-name');
      const labelInput = qs<HTMLInputElement>('#th-new-kind-label');
      const iconInput = qs<HTMLInputElement>('#th-new-kind-icon');
      const kindName = (nameInput?.value || '').trim().toLowerCase();
      const label = (labelInput?.value || '').trim() || kindName;
      const icon = (iconInput?.value || '').trim() || 'fa-solid fa-box';

      // 校验
      if (!kindName) { toastr?.warning?.('请输入类别名称'); return; }
      if (!/^[a-z0-9-]{1,12}$/.test(kindName)) { toastr?.warning?.('类别名称只能包含英文小写、数字和短横线，1-12字符'); return; }
      if (STASH_FIXED_KINDS.includes(`stash-${kindName}` as ManagedKind)) { toastr?.warning?.('类别名称与固定类别冲突'); return; }
      const existing = loadStashKinds();
      if (existing[kindName]) { toastr?.warning?.('已存在同名类别'); return; }

      addStashKind(kindName, { icon, label });
      closeModal2();
      currentStashTab = `stash-custom-${kindName}` as ManagedKind;
      openStashModal(currentStashTab);
      toastr?.success?.(`已创建类别：${label}`);
    });
  }, 100);
}

// 右键菜单（仅删除）
function showStashKindContextMenu(e: MouseEvent, customKind: string) {
  // 移除已有菜单
  const existing = qs('.th-stash-kind-menu-popover');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.className = 'th-stash-kind-menu-popover';
  menu.innerHTML = `<button class="th-stash-kind-menu-item th-stash-kind-delete"><i class="fa-solid fa-trash"></i> 删除类别</button>`;
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  document.body.appendChild(menu);

  const closeMenu = () => { menu.remove(); document.removeEventListener('click', closeMenu); };
  setTimeout(() => document.addEventListener('click', closeMenu), 0);

  menu.querySelector('.th-stash-kind-delete')?.addEventListener('click', () => {
    const customKinds = loadStashKinds();
    const meta = customKinds[customKind];
    if (confirm(`确定要删除类别「${meta?.label || customKind}」及其所有数据吗？`)) {
      deleteStashKind(customKind);
      closeMenu();
      currentStashTab = 'stash-item';
      openStashModal(currentStashTab);
      toastr?.success?.(`已删除类别：${meta?.label || customKind}`);
    }
  });
}

// ==================== 统一导入/导出（JSON 格式 + 旧 TSV 向后兼容）====================
// 导出格式：每张卡片一个 JSON 对象（{name,desc,tags,inject}），多卡组成数组
// 旧 TSV 格式（名称<Tab>简介<Tab>标签|标签<Tab>注入）仍可导入，自动识别

type ManagedExportItem = { name: string; desc: string; tags: string[]; inject?: string; links?: { locations?: string[]; events?: string[]; dlcs?: string[] } };

// 把 items 序列化为 JSON 字符串（单 kind）
function serializeManagedItems(items: Record<string, ManagedItemV2>): string {
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
function downloadText(filename: string, content: string) {
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
function normalizeImportItem(raw: any, kind: string, kindTags: Record<string, Tag>): { name: string; item: ManagedItemV2; newTags: string[] } | null {
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
    if (!tags.includes(ts)) {
      tags.push(ts);
      // 记录不存在的标签，交给调用方按真实 kind 新建
      if (!kindTags[ts]) newTags.push(ts);
    }
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
type ParsedImport = { byKind: Record<string, { name: string; item: ManagedItemV2 }[]>; warnTags: string[] };

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
function parseManagedImport(text: string, kindTagsByKind: Record<string, Record<string, Tag>>, defaultRealKind?: string): ParsedImport {
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
const INITIAL_ENTRY_NAMES = {
  location: '[初始·地点]',
  event: '[初始·事件]',
  dlc: '[初始·DLC]',
  stash: '[初始·储藏间]', // 储藏间 4 个内置 kind 合并到 1 个条目
} as const;

// 初始条目名 → 对应 kind(储藏间条目对应 4 个 kind)
const INITIAL_ENTRY_KINDS: Record<string, ManagedKind[]> = {
  [INITIAL_ENTRY_NAMES.location]: ['location'],
  [INITIAL_ENTRY_NAMES.event]: ['event'],
  [INITIAL_ENTRY_NAMES.dlc]: ['dlc'],
  [INITIAL_ENTRY_NAMES.stash]: ['stash-item', 'stash-skill', 'stash-status', 'stash-clothing'],
};

// 读取所有初始数据条目,解析成 ParsedImport(复用 parseManagedImport 的格式)
// - 地点/事件/DLC 条目 content 是 JSON 数组,用单 kind 解析
// - 储藏间条目 content 是多 kind JSON(th-managed-multi-v1),按 kind 分组解析
async function readInitialDataFromWorldbook(): Promise<ParsedImport> {
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
async function mergeInitialDataIntoLocal(parsed: ParsedImport): Promise<{ added: number; skipped: number; kinds: string[] }> {
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
const STASH_RUNTIME_FIELD: Record<string, string> = {
  'stash-item': '拥有物品',
  'stash-skill': '拥有技能',
  'stash-status': '状态',
  'stash-clothing': '当前穿着衣物',
};

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
function collectRuntimeStashData(): Record<string, RuntimeStashCandidate[]> {
  const result: Record<string, RuntimeStashCandidate[]> = {
    'stash-item': [], 'stash-skill': [], 'stash-status': [], 'stash-clothing': [],
  };
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
      entries.push({
        uid: Date.now(),
        name: targetName,
        enabled: false,
        content: merged,
        strategy: { type: 'constant', keys: [], keys_secondary: { logic: 'and_any', keys: [] }, scan_depth: 'same_as_global' },
        position: { type: 'before_character_definition', role: 'system', depth: 0, order: 100 },
        probability: 100,
        recursion: { prevent_incoming: false, prevent_outgoing: false, delay_until: null },
        effect: { depth: 0 } as any,
      } as WorldbookEntry);
    }
    return entries;
  }, { render: 'debounced' });
  return { created, book: mergedContent.book };
}

// 运行时数据导入复选 modal(§10.6 Build 2-2/2-3)
// collected: collectRuntimeStashData 的返回;allTabs: 储藏间所有 kind(用于刷新)
function openRuntimeImportModal(collected: Record<string, RuntimeStashCandidate[]>, allTabs: ManagedKind[]) {
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
      const key = `${kind}::${it.name}`;
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
        const curTab = currentStashTab;
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
function importStashKind(kind: ManagedKind, text: string, applyTag?: string) {
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
  for (const { name, item } of candidates) {
    try {
      const existing = getManagedItems(kind);
      if (existing[name]) {
        if (!confirm(`已存在同名「${name}」，是否覆盖？\n（取消则跳过该条）`)) { skippedOverwrite++; continue; }
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
  reportImportResult(imported, failed, cfg.label, parsed.warnTags);
  if (skippedOverwrite > 0) toastr?.info?.(`已跳过 ${skippedOverwrite} 条同名卡片`);
}

// 汇报导入结果（统一 toast）
function reportImportResult(imported: number, failed: number, label: string, warnTags: string[]) {
  if (imported > 0) {
    let msg = `成功导入 ${imported} 个${label}${failed > 0 ? `，失败 ${failed} 条` : ''}`;
    if (warnTags.length > 0) {
      msg += `\n警告：以下标签未在标签字典中定义，已跳过：${[...new Set(warnTags)].join(', ')}`;
      toastr?.warning?.(msg);
    } else {
      toastr?.success?.(msg);
    }
  } else {
    toastr?.warning?.(`未识别到有效${label}数据（支持 JSON 格式或旧 TSV 格式）`);
  }
}

// 导出全部 kind（"全部" tab）— JSON 多 kind 格式
function exportAllStashKinds(allTabs: ManagedKind[]) {
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
function exportStashKind(kind: ManagedKind) {
  const cfg = getStashKindCfg(kind);
  const items = getManagedItems(kind);
  if (!Object.keys(items).length) { toastr?.warning?.(`${cfg.label}数据为空`); return; }
  downloadText(cfg.storageName + '_' + new Date().toISOString().slice(0, 10) + '.json', serializeManagedItems(items));
  toastr?.success?.(`已导出 ${Object.keys(items).length} 个${cfg.label}`);
}

// 导入时选择自动打标签 modal（Build 2-10）
function openImportWithTagModal(targetKind: ManagedKind | '__all__', text: string, allTabs: ManagedKind[]) {
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
        saveTag(targetKind, newTagName, { color: '#8884d8', desc: '导入时新建' });
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
function exportStashKindByTag(kind: ManagedKind, tagName: string) {
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
function openExportByTagModal(kind: ManagedKind) {
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
function importAllStashKinds(allTabs: ManagedKind[], text: string, applyTag?: string) {
  const allTags = loadTags();
  const kindTagsByKind: Record<string, Record<string, Tag>> = {};
  for (const kind of allTabs) kindTagsByKind[kind] = allTags[kind] || {};
  const parsed = parseManagedImport(text, kindTagsByKind);
  // 预加载所有 kind 数据
  for (const kind of allTabs) setCurrentManagedItems(kind, getManagedItems(kind));
  let imported = 0;
  let failed = 0;
  let skippedOverwrite = 0;
  const overwriteAll = { value: false as boolean | null }; // null=未决定, true=全部覆盖, false=全部跳过
  const askOverwrite = (name: string): boolean => {
    if (overwriteAll.value === true) return true;
    if (overwriteAll.value === false) return false;
    return confirm(`已存在同名「${name}」，是否覆盖？\n（取消则跳过该条）`);
  };
  for (const kind of allTabs) {
    const candidates = parsed.byKind[kind] || [];
    for (const { name, item } of candidates) {
      try {
        const existing = getManagedItems(kind);
        if (existing[name]) {
          if (!askOverwrite(name)) { skippedOverwrite++; continue; }
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
  }
  // 若只有 __default__ 分组（旧格式无 # [kind] 标记），导入到默认物品
  if (parsed.byKind['__default__']?.length && imported === 0) {
    for (const { name, item } of parsed.byKind['__default__']) {
      try {
        const existing = getManagedItems('stash-item');
        if (existing[name]) {
          if (!askOverwrite(name)) { skippedOverwrite++; continue; }
        }
        addManagedItem('stash-item', name, item); imported++;
      } catch { failed++; }
    }
  }
  reportImportResult(imported, failed, '储藏间', parsed.warnTags);
  if (skippedOverwrite > 0) toastr?.info?.(`已跳过 ${skippedOverwrite} 条同名卡片`);
}

function bindManagedModalEvents(kind:ManagedKind, idPrefix:string) {
  console.log('[bindManagedModalEvents] called for kind=' + kind, 'idPrefix=' + idPrefix);
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
  qs(`#${idPrefix}-seed-btn`)?.addEventListener('click', async () => {
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
  });
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
      for (const { name, item } of candidates) {
        try {
          const existing = getManagedItems(kind);
          if (existing[name]) {
            if (!confirm(`已存在同名「${name}」，是否覆盖？\n（取消则跳过该条）`)) { skippedOverwrite++; continue; }
          }
          addManagedItem(kind, name, item); imported++;
        } catch { failed++; }
      }
      reportImportResult(imported, failed, cfg.label, parsed.warnTags);
      if (skippedOverwrite > 0) toastr?.info?.(`已跳过 ${skippedOverwrite} 条同名卡片`);
      void openManagedModal(kind);
    };
    reader.readAsText(this.files[0],'utf-8');
    this.value='';
  });
  // 搜索框 + 历史下拉
  const searchInput = qs<HTMLInputElement>(`#${idPrefix}-search`);
  let searchDebounce: number | null = null;
  if (searchInput) {
    searchInput.addEventListener('input', function(this: HTMLInputElement) {
      rerenderManagedGrid(kind, idPrefix, this.value.trim().toLowerCase());
      // 延迟记录搜索历史
      if (searchDebounce) clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        if (this.value.trim()) pushSearchHistory(kind, this.value.trim());
      }, 1000) as any;
    });
    searchInput.addEventListener('focus', function() {
      const history = loadSearchHistory(kind);
      if (!history.length) return;
      // 移除旧下拉（如果有）
      const oldDrop = qs(`#${idPrefix}-search-history`);
      if (oldDrop) oldDrop.remove();
      const rect = searchInput.getBoundingClientRect();
      const wrapperRect = searchInput.parentElement?.getBoundingClientRect();
      const drop = __doc.createElement('div');
      drop.id = `${idPrefix}-search-history`;
      drop.className = 'th-search-history';
      drop.style.cssText = `position:absolute;top:${rect.bottom - (wrapperRect?.top||0) + 4}px;left:0;width:100%;z-index:100`;
      drop.innerHTML = history.map(h => `<div class="th-search-history-item" data-term="${escAttr(h)}">${esc(h)}<span class="th-search-history-del">×</span></div>`).join('');
      searchInput.parentElement?.appendChild(drop);
      // 绑定点击
      drop.addEventListener('click', (e) => {
        e.stopPropagation();
        const del = (e.target as HTMLElement).closest('.th-search-history-del');
        const item = (e.target as HTMLElement).closest('.th-search-history-item');
        if (del && item) {
          // 删除单条
          const term = item.getAttribute('data-term') || '';
          let all = loadSearchHistory(kind);
          all = all.filter(t => t !== term);
          try {
            const raw = localStorage.getItem('_th_search_history_v1');
            const full: Record<string, string[]> = raw ? JSON.parse(raw) : {};
            full[kind] = all;
            localStorage.setItem('_th_search_history_v1', JSON.stringify(full));
          } catch { }
          drop.remove();
          if (searchInput.value) searchInput.focus(); // 重新触发 focus 渲染剩下的
          return;
        }
        if (item) {
          const term = item.getAttribute('data-term') || '';
          searchInput.value = term;
          rerenderManagedGrid(kind, idPrefix, term.trim().toLowerCase());
          drop.remove();
        }
      });
    });
    // blur 延迟隐藏
    searchInput.addEventListener('blur', () => {
      setTimeout(() => {
        const drop = qs(`#${idPrefix}-search-history`);
        if (drop) drop.remove();
      }, 150);
    });
  }

  // ==================== 标签筛选栏事件绑定（Phase 2）====================
  // 最近10张按钮
  qs('[data-recent-toggle]')?.addEventListener('click', function(this: HTMLElement) {
    showRecentOnly[kind] = !showRecentOnly[kind];
    if (showRecentOnly[kind]) {
      currentFilterTag = null; // 最近模式下重置筛选
      showFavOnly[kind] = false;
      qsa('.th-tag-filter-btn[data-filter-tag]').forEach(b => b.classList.remove('active'));
      qs('[data-fav-toggle]')?.classList.remove('active');
    }
    this.classList.toggle('active', showRecentOnly[kind]);
    const grid = qs(`#${idPrefix}-grid`);
    if (grid) grid.innerHTML = renderManagedBuckets(kind, idPrefix, (qs<HTMLInputElement>(`#${idPrefix}-search`)?.value || '').trim().toLowerCase());
    bindManagedCardEvents(kind, idPrefix);
  });

  // 只看收藏按钮
  qs('[data-fav-toggle]')?.addEventListener('click', function(this: HTMLElement) {
    showFavOnly[kind] = !showFavOnly[kind];
    if (showFavOnly[kind]) {
      currentFilterTag = null; // 收藏模式下重置筛选
      showRecentOnly[kind] = false;
      qsa('.th-tag-filter-btn[data-filter-tag]').forEach(b => b.classList.remove('active'));
      qs('[data-recent-toggle]')?.classList.remove('active');
    }
    this.classList.toggle('active', showFavOnly[kind]);
    const grid = qs(`#${idPrefix}-grid`);
    if (grid) grid.innerHTML = renderManagedBuckets(kind, idPrefix, (qs<HTMLInputElement>(`#${idPrefix}-search`)?.value || '').trim().toLowerCase());
    bindManagedCardEvents(kind, idPrefix);
  });

  // 标签筛选按钮
  qsa('.th-tag-filter-btn[data-filter-tag]').forEach(btn => {
    btn.addEventListener('click', () => {
      showRecentOnly[kind] = false; // 切到筛选时退出最近模式
      showFavOnly[kind] = false;
      qs('[data-recent-toggle]')?.classList.remove('active');
      qs('[data-fav-toggle]')?.classList.remove('active');
      const filterTag = btn.getAttribute('data-filter-tag') || '__all__';
      if (filterTag === '__all__') currentFilterTag = null;
      else if (filterTag === '__none__') currentFilterTag = '';
      else currentFilterTag = filterTag;
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
          if (currentFilterTag !== null) {
            entries = entries.filter(([, item]) => {
              if (currentFilterTag === '') return !item.tags || item.tags.length === 0;
              return item.tags && item.tags.includes(currentFilterTag);
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
          currentTagManagerKind = kind;
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

function rerenderManagedGrid(kind:ManagedKind, idPrefix:string, query='') {
  const grid=qs(`#${idPrefix}-grid`);
  if(grid) grid.innerHTML=renderManagedBuckets(kind,idPrefix,query);
  bindManagedCardEvents(kind,idPrefix);
  bindCollapseToggleEvents(kind,idPrefix); // 重新绑定折叠事件
}

// ==================== 桶折叠/展开辅助函数（Phase 2）====================
function bindCollapseToggleEvents(kind: ManagedKind, idPrefix: string) {
  qsa('[data-collapse-toggle]').forEach(header => {
    header.addEventListener('click', () => {
      const tagName = header.getAttribute('data-collapse-toggle') || '';
      const isCollapsed = !currentlyCollapsed[tagName];
      // 更新本地状态
      currentlyCollapsed[tagName] = isCollapsed;
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

function setAllBucketsCollapsed(kind: ManagedKind, value: boolean) {
  const allTags = loadTags();
  const kindTags = allTags[kind] || {};
  const collapsed = loadBucketCollapsed();
  if (!collapsed[kind]) collapsed[kind] = {};

  for (const tagName of Object.keys(kindTags)) {
    if (value) collapsed[kind][tagName] = true;
    else delete collapsed[kind][tagName];
    currentlyCollapsed[tagName] = value;
  }
  // 未分类桶
  if (value) collapsed[kind][''] = true;
  else delete collapsed[kind][''];
  currentlyCollapsed[''] = value;

  saveBucketCollapsed(collapsed);
}

function updateBucketVisual(tagName: string) {
  const group = qs(`[data-bucket-tag="${escAttr(tagName)}"]`);
  if (!group) return;
  const header = group.querySelector('.th-tag-group-header') as HTMLElement | null;
  const isCollapsed = !!currentlyCollapsed[tagName];
  if (header) header.dataset.collapsed = String(isCollapsed);
}

function updateAllBucketVisuals() {
  for (const tagName of Object.keys(currentlyCollapsed)) {
    updateBucketVisual(tagName);
  }
}

// 从 desc（可能是 JSON 结构化字符串）中提取显示用文本
function getDisplayDesc(desc: string): string {
  try {
    const parsed = JSON.parse(desc);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed['简介'] || parsed['效果'] || parsed['外观详情'] || desc;
    }
  } catch { /* not JSON */ }
  return desc;
}

// "全部" tab 渲染：按 kind 分组，每组显示 kind 标签头
function renderAllStashCards(allTabs: ManagedKind[]): string {
  let html = '';
  const allTags = loadTags();
  for (const kind of allTabs) {
    const kindCfg = getStashKindCfg(kind);
    const items = getManagedItems(kind);
    const entries = Object.entries(items);
    if (!entries.length) continue;
    const kindTags = allTags[kind] || {};
    html += `<div class="th-stash-all-group">
      <div class="th-stash-all-group-header"><i class="${kindCfg.icon}"></i> ${esc(kindCfg.label)} (${entries.length})</div>`;
    for (const [name, item] of entries) {
      const fullDesc = getDisplayDesc(item.desc);
      const previewText = fullDesc.length > 25 ? fullDesc.slice(0,25) + '…' : fullDesc;
      const hasCustomInject = !!item.inject;
      const isFav = !!item.favorite;
      // 标签色点
      const tagDots = (item.tags || []).filter(t => kindTags[t]).map(tagName => {
        const color = kindTags[tagName].color;
        return `<span class="th-card-tag-dot" data-jump-tag="${escAttr(tagName)}" style="background:var(--${color || 'tx3'})" title="${escAttr(tagName)}"></span>`;
      }).join('');
      // hover 工具栏（反馈7：全部 tab 也要有编辑/收藏/复制/删除按钮）
      let actionsHtml = '';
      actionsHtml += `<button class="th-card-act" data-card-act="edit" title="编辑"><i class="fa-solid fa-pen"></i></button>`;
      actionsHtml += `<button class="th-card-act th-card-act-fav" data-card-act="fav" title="${isFav?'取消收藏':'收藏'}"><i class="fa-solid ${isFav?'fa-star':'fa-star-half-stroke'}"></i></button>`;
      actionsHtml += `<button class="th-card-act" data-card-act="copy" title="复制"><i class="fa-solid fa-copy"></i></button>`;
      actionsHtml += `<button class="th-card-act th-card-act-danger" data-card-act="del" title="删除"><i class="fa-solid fa-xmark"></i></button>`;

      html += `<div class="th-location-card th-managed-card${isFav?' favorite':''}" data-managed-kind="${kind}" data-managed-name="${escAttr(name)}" data-managed-desc="${escAttr(item.desc)}" title="${escAttr(fullDesc)}">
        <i class="${kindCfg.icon}" style="color:var(--gold);font-size:14px"></i>
        <div class="th-managed-card-main" style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14px;line-height:1.3">
            ${esc(name)}${hasCustomInject ? ' <i class="fa-solid fa-pen-fancy th-inject-badge" title="已自定义注入模板" style="font-size:10px;color:var(--mint);margin-left:4px"></i>' : ''}
            ${isFav ? ' <i class="fa-solid fa-star th-fav-star" style="font-size:10px;color:var(--gold);margin-left:4px"></i>' : ''}
          </div>
          <div class="th-managed-card-preview" style="font-size:12px;color:var(--tx3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">${esc(previewText)}</div>
        </div>
        <div class="th-managed-card-tags" style="display:flex;gap:3px;align-items:center;flex-shrink:0;margin:0 6px">${tagDots}</div>
        <div class="th-card-actions">${actionsHtml}</div>
      </div>`;
    }
    html += `</div>`;
  }
  if (!html) html = '<div class="th-empty th-empty-guide" style="padding:40px 20px;text-align:center"><i class="fa-solid fa-box-open" style="font-size:32px;color:var(--tx3);display:block;margin-bottom:12px"></i><br>储藏间空空如也~<br><span class="th-empty-hint" style="font-size:13px;color:var(--tx3);font-style:normal">点右上角 <i class="fa-solid fa-plus" style="font-size:11px;color:var(--pink)"></i> 新建，或 <i class="fa-solid fa-upload" style="font-size:11px;color:var(--pink)"></i> 导入预设</span></div>';
  return html;
}

function renderManagedCards(kind:ManagedKind, entries: [string, ManagedItemV2][]): string {
  // 自定义 stash kind 不在 MANAGED_CFG 里，统一用 getStashKindCfg（返回完整字段）。
  const cfg = getStashKindCfg(kind);
  const isStash = kind.startsWith('stash-');
  const allTags = loadTags();
  const kindTags = allTags[kind] || {};

  return entries.map(([name, item])=>{
    const desc = item.desc;
    const fullDisplayDesc = isStash ? getDisplayDesc(desc) : desc;
    const previewText = fullDisplayDesc.length > 25 ? fullDisplayDesc.slice(0,25) + '…' : fullDisplayDesc;
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
    return `<div class="${cls}" data-managed-kind="${kind}" data-managed-name="${escAttr(name)}" data-managed-desc="${escAttr(desc)}" title="${escAttr(title)}">
      ${batchMode[kind] ? `<input type="checkbox" class="th-card-checkbox" data-card-checkbox-name="${escAttr(name)}" ${isSelected ? 'checked' : ''} style="margin-right:8px;cursor:pointer">` : ''}
      ${isStash ? '' : `<span class="th-bind-dot ${bindCls}"></span>`}
      <i class="${cfg.icon}" style="color:${kind==='location'?'var(--pink)':kind==='event'?'var(--lav)':'var(--gold)'};font-size:14px"></i>
      <div class="th-managed-card-main" style="flex:1;min-width:0">
        <div class="th-managed-card-title" style="font-weight:700;font-size:14px;line-height:1.3">
          ${esc(name)}
          ${hasCustomInject ? ' <i class="fa-solid fa-pen-fancy th-inject-badge" title="已自定义注入模板" style="font-size:10px;color:var(--mint);margin-left:4px"></i>' : ''}
          ${isFav ? ' <i class="fa-solid fa-star th-fav-star" style="font-size:10px;color:var(--gold);margin-left:4px"></i>' : ''}
        </div>
        <div class="th-managed-card-preview" style="font-size:12px;color:var(--tx3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">${esc(previewText)}</div>
      </div>
      <div class="th-managed-card-tags" style="display:flex;gap:3px;align-items:center;flex-shrink:0;margin:0 6px">${tagDots}</div>
      <div class="th-card-actions">${actionsHtml}</div>
    </div>`;
  }).join('');
}

// ==================== 标签管理 Modal（§10.5）====================
let currentSelectedTag: string | null = null;
let currentTagManagerKind: ManagedKind | null = null;

// ==================== 标签筛选与桶分组（§10.5 Phase 2）====================
let currentFilterTag: string | null = null; // null = 显示全部，'' = 未分类，'tagName' = 指定标签
let currentlyCollapsed: Record<string, boolean> = {}; // 缓存当前展开/折叠状态，减少 localStorage 读写

// ==================== 排序 + 最近（§10.6）====================
const SORT_PREFS_KEY = '_th_managed_sort_prefs_v1';
type SortMode = 'az' | 'za' | 'recent' | 'tag';
let currentSortMode: Record<ManagedKind, SortMode> = {} as any;
let showRecentOnly: Record<ManagedKind, boolean> = {} as any; // "最近10张"模式开关
let showFavOnly: Record<ManagedKind, boolean> = {} as any; // "只看收藏"模式开关
let batchMode: Record<ManagedKind, boolean> = {} as any; // "批量操作"模式开关
let batchSelection: Record<ManagedKind, Set<string>> = {} as any; // 批量选中的卡片名称集合

function loadSortMode(kind: ManagedKind): SortMode {
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
function saveSortMode(kind: ManagedKind, mode: SortMode) {
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

// 批量打标选择 modal
function openBatchTagSelectModal(kind: ManagedKind, idPrefix: string, selectedItems: string[]) {
  const allTags = loadTags();
  const kindTags = allTags[kind] || {};
  const tagList = Object.keys(kindTags);

  let h = `<div class="th-batch-tag-modal" style="padding:10px">
    <div style="margin-bottom:16px;font-weight:600">为 ${selectedItems.length} 张卡片选择标签</div>
    <div class="th-batch-tag-list" style="max-height:300px;overflow-y:auto;display:grid;gap:8px">`;
  if (tagList.length === 0) {
    h += `<div style="text-align:center;color:var(--tx3);padding:20px">暂无标签，请先创建标签</div>`;
  } else {
    for (const tagName of tagList) {
      const tag = kindTags[tagName];
      h += `<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg3);border-radius:8px;cursor:pointer">
        <input type="checkbox" data-batch-tag="${escAttr(tagName)}">
        <span class="th-tag-color-swatch" style="background:var(--${tag.color || 'tx3'})"></span>
        <span>${esc(tagName)}</span>
      </label>`;
    }
  }
  h += `</div>
    <div style="display:flex;gap:8px;margin-top:20px;justify-content:flex-end">
      <button class="th-btn" id="th-batch-tag-cancel">取消</button>
      <button class="th-btn th-btn-primary" id="th-batch-tag-confirm">确认打标</button>
    </div>
  </div>`;

  openModal2('批量打标', h);

  setTimeout(() => {
    qs('#th-batch-tag-cancel')?.addEventListener('click', () => closeModal2());
    qs('#th-batch-tag-confirm')?.addEventListener('click', () => {
      const checkedTags: string[] = [];
      qsa('input[data-batch-tag]:checked').forEach(cb => {
        const tagName = cb.getAttribute('data-batch-tag');
        if (tagName) checkedTags.push(tagName);
      });
      if (checkedTags.length === 0) {
        toastr?.warning?.('请至少选择一个标签');
        return;
      }
      // 为每张选中的卡片添加标签
      const items = getCurrentManagedItems(kind);
      for (const itemName of selectedItems) {
        const item = items[itemName];
        if (item) {
          if (!item.tags) item.tags = [];
          for (const tagName of checkedTags) {
            if (!item.tags.includes(tagName)) {
              item.tags.push(tagName);
            }
          }
          addManagedItem(kind, itemName, item); // 保存
        }
      }
      toastr?.success?.(`已为 ${selectedItems.length} 张卡片添加 ${checkedTags.length} 个标签`);
      closeModal2();
      // 清除选中状态并刷新
      if (batchSelection[kind]) batchSelection[kind].clear();
      rerenderManagedGrid(kind, idPrefix, (qs<HTMLInputElement>(`#${idPrefix}-search`)?.value || '').trim().toLowerCase());
    });
  }, 60);
}

function openTagManagerModal(kind: ManagedKind, idPrefix: string) {
  currentTagManagerKind = kind;
  currentSelectedTag = null;
  const cfg = getStashKindCfg(kind); // 统一用这个，支持 stash 和非 stash
  const allTags = loadTags();
  const kindTags = allTags[kind] || {};
  const tagList = Object.entries(kindTags);

  let h = `<div class="th-tag-manager">`;
  // 左半：标签列表
  h += `<div class="th-tag-manager-left">
    <div class="th-tag-manager-header">
      <button class="th-btn-sm" id="th-new-tag-btn"><i class="fa-solid fa-plus"></i> 新建标签</button>
      <input class="th-edit-input" id="th-tag-search" type="search" placeholder="搜索标签...">
    </div>
    <div class="th-tag-manager-stats">${tagList.length} 个标签，共 ${countTaggedItems(kind)} 张卡片已打标</div>
    <div class="th-tag-list" id="th-tag-list">`;
  if (tagList.length === 0) {
    h += `<div class="th-empty" style="padding:20px;text-align:center"><i class="fa-solid fa-tags"></i> 暂无标签，点击上方新建</div>`;
  } else {
    for (const [tagName, tag] of tagList) {
      const itemCount = countItemsWithTag(kind, tagName);
      h += `<div class="th-tag-item" data-tag-name="${escAttr(tagName)}">
        <span class="th-tag-color-swatch" style="background:var(--${tag.color})"></span>
        <div class="th-tag-info">
          <div class="th-tag-name">${esc(tagName)}</div>
          ${tag.desc ? `<div class="th-tag-desc">${esc(tag.desc)}</div>` : ''}
        </div>
        <span class="th-tag-count">${itemCount}</span>
        <div class="th-tag-actions">
          <button class="th-tag-action-btn" data-edit-tag="${escAttr(tagName)}" title="编辑"><i class="fa-solid fa-pen"></i></button>
          <button class="th-tag-action-btn" data-delete-tag="${escAttr(tagName)}" title="删除"><i class="fa-solid fa-trash"></i></button>
          ${!kind.startsWith('stash-') ? `<button class="th-tag-action-btn" data-batch-disable-tag="${escAttr(tagName)}" title="批量关世界书"><i class="fa-solid fa-power-off" style="color:var(--red)"></i></button><button class="th-tag-action-btn" data-batch-enable-tag="${escAttr(tagName)}" title="批量开世界书"><i class="fa-solid fa-power-off" style="color:var(--mint)"></i></button>` : ''}
        </div>
      </div>`;
    }
  }
  h += `</div></div>`; // 左半结束

  // 右半：卡片打标
  h += `<div class="th-tag-manager-right" id="th-tag-manager-right">`;
  h += `<div class="th-empty" style="padding:40px 20px;text-align:center">
    <i class="fa-solid fa-arrow-left" style="font-size:32px;color:var(--tx3);margin-bottom:12px"></i>
    <div>请在左侧选择一个标签进行打标</div>
  </div>`;
  h += `</div>`; // 右半结束

  h += `</div>`; // th-tag-manager 结束

  openModal2(`<i class="fa-solid fa-tags"></i> 标签管理 · ${cfg.label}`, h);

  setTimeout(() => bindTagManagerEvents(kind, idPrefix), 60);
}

function countTaggedItems(kind: ManagedKind): number {
  const items = getManagedItems(kind);
  return Object.values(items).filter(item => item.tags && item.tags.length > 0).length;
}

function countItemsWithTag(kind: ManagedKind, tagName: string): number {
  const items = getManagedItems(kind);
  return Object.values(items).filter(item => item.tags && item.tags.includes(tagName)).length;
}

function bindTagManagerEvents(kind: ManagedKind, idPrefix: string) {
  const root = qs('.th-modal-body-2');
  if (!root) return;

  // 新建标签按钮
  qs('#th-new-tag-btn')?.addEventListener('click', () => showNewTagForm(kind, idPrefix));

  // 标签搜索
  qs('#th-tag-search')?.addEventListener('input', function(this: HTMLInputElement) {
    const q = this.value.trim().toLowerCase();
    filterTagList(q);
  });

  // 标签项点击（选择标签，显示右半打标列表）
  qsa('.th-tag-item').forEach(item => {
    item.addEventListener('click', (e) => {
      // 如果点击的是操作按钮，不选择标签
      if ((e.target as HTMLElement).closest('.th-tag-action-btn')) return;
      const tagName = item.getAttribute('data-tag-name') || '';
      selectTagForItemCheck(kind, tagName, idPrefix);
    });
  });

  // 编辑标签按钮
  qsa('[data-edit-tag]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tagName = btn.getAttribute('data-edit-tag') || '';
      showEditTagForm(kind, tagName, idPrefix);
    });
  });

  // 删除标签按钮
  qsa('[data-delete-tag]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tagName = btn.getAttribute('data-delete-tag') || '';
      if (confirm(`确定要删除标签「${tagName}」吗？\n该标签将从所有已打标的卡片上移除。`)) {
        deleteTag(kind, tagName);
        // 从所有 item 上移除该标签
        const items = getManagedItems(kind);
        for (const [itemName, item] of Object.entries(items)) {
          if (item.tags && item.tags.includes(tagName)) {
            removeItemTag(kind, itemName, tagName);
          }
        }
        toastr?.success?.(`已删除标签：${tagName}`);
        openTagManagerModal(kind, idPrefix); // 刷新
      }
    });
  });

  // 批量关世界书按钮（仅非 stash kind）
  qsa('[data-batch-disable-tag]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tagName = btn.getAttribute('data-batch-disable-tag') || '';
      const count = countItemsWithTag(kind, tagName);
      if (!confirm(`关闭「${tagName}」下 ${count} 个${MANAGED_CFG[kind].label}对应的世界书条目？\n(可重新打开)`)) return;
      void disableManagedByTag(kind, tagName);
    });
  });

  // 批量开世界书按钮（仅非 stash kind）
  qsa('[data-batch-enable-tag]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tagName = btn.getAttribute('data-batch-enable-tag') || '';
      const count = countItemsWithTag(kind, tagName);
      if (!confirm(`开启「${tagName}」下 ${count} 个${MANAGED_CFG[kind].label}对应的世界书条目？\n(可重新关闭)`)) return;
      void enableManagedByTag(kind, tagName);
    });
  });
}

// 按标签批量关闭世界书条目
async function disableManagedByTag(kind: ManagedKind, tagName: string) {
  const items = getManagedItems(kind);
  const taggedItems = Object.entries(items).filter(([_, item]) => item.tags && item.tags.includes(tagName));
  if (!taggedItems.length) { toastr?.warning?.('该标签下没有卡片'); return; }

  toastr?.info?.(`正在关闭... 0/${taggedItems.length}`);

  let success = 0;
  let failed = 0;
  for (const [itemName, item] of taggedItems) {
    try {
      const result = await toggleManagedWorldbookEntry(kind, itemName, item.desc);
      if (result !== null) success++;
      else failed++;
    } catch { failed++; }
  }

  toastr?.success?.(`已关闭 ${success} 个世界书条目${failed > 0 ? `，${failed} 个失败` : ''}`);
}

async function enableManagedByTag(kind: ManagedKind, tagName: string) {
  const items = getManagedItems(kind);
  const taggedItems = Object.entries(items).filter(([_, item]) => item.tags && item.tags.includes(tagName));
  if (!taggedItems.length) { toastr?.warning?.('该标签下没有卡片'); return; }

  toastr?.info?.(`正在开启... 0/${taggedItems.length}`);

  let success = 0;
  let failed = 0;
  for (const [itemName, item] of taggedItems) {
    try {
      const result = await toggleManagedWorldbookEntry(kind, itemName, item.desc);
      if (result !== null) success++;
      else failed++;
    } catch { failed++; }
  }

  toastr?.success?.(`已开启 ${success} 个世界书条目${failed > 0 ? `，${failed} 个失败` : ''}`);
}

function filterTagList(query: string) {
  const items = qsa<HTMLElement>('.th-tag-item');
  items.forEach(item => {
    const name = item.getAttribute('data-tag-name') || '';
    const desc = item.querySelector('.th-tag-desc')?.textContent || '';
    const match = !query || name.toLowerCase().includes(query) || desc.toLowerCase().includes(query);
    item.style.display = match ? '' : 'none';
  });
}

// 选择标签后，右半显示该标签的卡片打标列表
function selectTagForItemCheck(kind: ManagedKind, tagName: string, idPrefix: string) {
  currentSelectedTag = tagName;
  const right = qs('#th-tag-manager-right');
  if (!right) return;

  // 高亮选中的标签
  qsa('.th-tag-item').forEach(el => el.classList.remove('active'));
  qs(`.th-tag-item[data-tag-name="${escAttr(tagName)}"]`)?.classList.add('active');

  const items = getManagedItems(kind);
  const itemList = Object.entries(items);
  if (itemList.length === 0) {
    right.innerHTML = `<div class="th-empty" style="padding:40px 20px;text-align:center">
      <i class="fa-solid fa-box-open" style="font-size:32px;color:var(--tx3);margin-bottom:12px"></i>
      <div>该 kind 下暂无卡片</div>
    </div>`;
    return;
  }

  const allTags = loadTags();
  const tag = allTags[kind]?.[tagName];

  let h = `<div class="th-tag-check-header">
    <div class="th-tag-check-title">
      <span class="th-tag-color-swatch" style="background:var(--${tag?.color || 'pink'})"></span>
      <span>「${esc(tagName)}」打标管理</span>
    </div>
    <input class="th-edit-input" id="th-tag-item-search" type="search" placeholder="搜索卡片...">
    <div class="th-tag-check-actions">
      <button class="th-btn-sm" id="th-select-all-items"><i class="fa-solid fa-check-double"></i> 全选</button>
      <button class="th-btn-sm" id="th-deselect-all-items"><i class="fa-solid fa-times"></i> 全不选</button>
    </div>
  </div>`;

  h += `<div class="th-tag-check-list" id="th-tag-check-list">`;
  for (const [itemName, item] of itemList) {
    const hasTag = item.tags && item.tags.includes(tagName);
    const itemTags = item.tags || [];
    const tagsHtml = itemTags.map(t => {
      const tColor = allTags[kind]?.[t]?.color || 'tx3';
      return `<span class="th-tag-mini-swatch" style="background:var(--${tColor})" title="${escAttr(t)}"></span>`;
    }).join('');
    h += `<label class="th-tag-check-item">
      <input type="checkbox" class="th-tag-item-checkbox" data-item-name="${escAttr(itemName)}" ${hasTag ? 'checked' : ''}>
      <span class="th-tag-check-item-info">
        <span class="th-tag-check-item-name">${esc(itemName)}</span>
        <span class="th-tag-check-item-desc">${esc(getDisplayDesc(item.desc).slice(0, 60))}</span>
      </span>
      <span class="th-tag-check-item-tags">${tagsHtml}</span>
    </label>`;
  }
  h += `</div>`;

  right.innerHTML = h;

  // 绑定事件
  qsa('.th-tag-item-checkbox').forEach(cb => {
    cb.addEventListener('change', function(this: HTMLInputElement) {
      const itemName = this.getAttribute('data-item-name') || '';
      if (this.checked) addItemTag(kind, itemName, tagName);
      else removeItemTag(kind, itemName, tagName);
      // 更新左侧标签计数
      updateTagCount(kind, tagName);
    });
  });

  qs('#th-select-all-items')?.addEventListener('click', () => {
    qsa<HTMLInputElement>('.th-tag-item-checkbox').forEach(cb => {
      if (!cb.checked) { cb.checked = true; const itemName = cb.getAttribute('data-item-name') || ''; addItemTag(kind, itemName, tagName); }
    });
    updateTagCount(kind, tagName);
  });

  qs('#th-deselect-all-items')?.addEventListener('click', () => {
    qsa<HTMLInputElement>('.th-tag-item-checkbox').forEach(cb => {
      if (cb.checked) { cb.checked = false; const itemName = cb.getAttribute('data-item-name') || ''; removeItemTag(kind, itemName, tagName); }
    });
    updateTagCount(kind, tagName);
  });

  qs('#th-tag-item-search')?.addEventListener('input', function(this: HTMLInputElement) {
    const q = this.value.trim().toLowerCase();
    qsa<HTMLElement>('.th-tag-check-item').forEach(item => {
      const name = item.querySelector('.th-tag-check-item-name')?.textContent || '';
      const desc = item.querySelector('.th-tag-check-item-desc')?.textContent || '';
      const match = !q || name.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
      item.style.display = match ? '' : 'none';
    });
  });
}

function updateTagCount(kind: ManagedKind, tagName: string) {
  const item = qs(`.th-tag-item[data-tag-name="${escAttr(tagName)}"] .th-tag-count`);
  if (item) item.textContent = String(countItemsWithTag(kind, tagName));
}

// 新建/编辑标签共用的表单渲染
function renderTagForm(tagName: string = '', tag: Tag = { color: 'pink', desc: '' }, isEdit: boolean = false): string {
  const colorGrid = TAG_COLOR_PALETTE.map(c =>
    `<button class="th-color-swatch ${c === tag.color ? 'active' : ''}" data-color="${c}" style="background:var(--${c})" title="${c}"></button>`
  ).join('');

  const presetBtns = TAG_PRESETS.map(p =>
    `<button class="th-tag-preset-btn" data-preset-name="${p.name}" data-preset-color="${p.color}" data-preset-desc="${p.desc}">
      <span class="th-tag-color-swatch" style="background:var(--${p.color})"></span> ${esc(p.name)}
    </button>`
  ).join('');

  return `<div class="th-tag-form">
    <div class="th-modal-section">
      <div class="th-modal-label">标签名称</div>
      <input class="th-edit-input" id="th-tag-form-name" value="${escAttr(tagName)}" placeholder="输入标签名称" maxlength="12">
    </div>
    <div class="th-modal-section">
      <div class="th-modal-label">颜色</div>
      <input class="th-edit-input" id="th-tag-form-color" value="${escAttr(tag.color)}" readonly style="margin-bottom:6px">
      <div class="th-color-palette">${colorGrid}</div>
    </div>
    <div class="th-modal-section">
      <div class="th-modal-label">快速预设</div>
      <div class="th-tag-presets">${presetBtns}</div>
    </div>
    <div class="th-modal-section">
      <div class="th-modal-label">描述（可选）</div>
      <textarea class="th-edit-textarea" id="th-tag-form-desc" rows="2" placeholder="输入标签描述">${esc(tag.desc)}</textarea>
    </div>
    <div class="th-modal-section">
      <div class="th-modal-label">默认注入模板（可选）</div>
      <textarea class="th-edit-textarea" id="th-tag-form-inject" rows="2" placeholder="给打此标签的卡片自动应用的注入模板，如：{{desc}}">${esc(tag.defaultInject || '')}</textarea>
    </div>
    <div class="th-edit-actions">
      <button class="th-btn-sm th-btn-tag-save" type="button"><i class="fa-solid fa-check"></i> ${isEdit ? '保存' : '创建'}</button>
      <button class="th-btn-sm th-btn-tag-cancel" type="button" style="margin-left:auto"><i class="fa-solid fa-times"></i> 取消</button>
    </div>
  </div>`;
}

function showNewTagForm(kind: ManagedKind, idPrefix: string) {
  const right = qs('#th-tag-manager-right');
  if (!right) return;

  right.innerHTML = renderTagForm('', { color: 'pink', desc: '' }, false);
  bindTagFormEvents(kind, '', idPrefix, false);
}

function showEditTagForm(kind: ManagedKind, tagName: string, idPrefix: string) {
  const allTags = loadTags();
  const tag = allTags[kind]?.[tagName] || { color: 'pink', desc: '' };
  const right = qs('#th-tag-manager-right');
  if (!right) return;

  right.innerHTML = renderTagForm(tagName, tag, true);
  bindTagFormEvents(kind, tagName, idPrefix, true);
}

function bindTagFormEvents(kind: ManagedKind, originalName: string, idPrefix: string, isEdit: boolean) {
  // 颜色点选
  qsa('.th-color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      const color = swatch.getAttribute('data-color') || '';
      const colorInput = qs<HTMLInputElement>('#th-tag-form-color');
      if (colorInput) colorInput.value = color;
      qsa('.th-color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
    });
  });

  // 预设按钮
  qsa('.th-tag-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-preset-name') || '';
      const color = btn.getAttribute('data-preset-color') || '';
      const desc = btn.getAttribute('data-preset-desc') || '';
      const nameInput = qs<HTMLInputElement>('#th-tag-form-name');
      const colorInput = qs<HTMLInputElement>('#th-tag-form-color');
      const descInput = qs<HTMLTextAreaElement>('#th-tag-form-desc');
      if (nameInput) nameInput.value = name;
      if (colorInput) colorInput.value = color;
      if (descInput) descInput.value = desc;
      qsa('.th-color-swatch').forEach(s => s.classList.toggle('active', s.getAttribute('data-color') === color));
    });
  });

  // 取消按钮
  qs('.th-btn-tag-cancel')?.addEventListener('click', () => {
    // 返回右半的空状态或选中状态
    if (currentSelectedTag) selectTagForItemCheck(kind, currentSelectedTag, idPrefix);
    else {
      const right = qs('#th-tag-manager-right');
      if (right) right.innerHTML = `<div class="th-empty" style="padding:40px 20px;text-align:center">
        <i class="fa-solid fa-arrow-left" style="font-size:32px;color:var(--tx3);margin-bottom:12px"></i>
        <div>请在左侧选择一个标签进行打标</div>
      </div>`;
    }
  });

  // 保存按钮
  qs('.th-btn-tag-save')?.addEventListener('click', () => {
    const nameInput = qs<HTMLInputElement>('#th-tag-form-name');
    const colorInput = qs<HTMLInputElement>('#th-tag-form-color');
    const descInput = qs<HTMLTextAreaElement>('#th-tag-form-desc');
    const injectInput = qs<HTMLTextAreaElement>('#th-tag-form-inject');
    const newName = (nameInput?.value || '').trim();
    const color = (colorInput?.value || '').trim() || 'pink';
    const desc = (descInput?.value || '').trim();
    const defaultInject = (injectInput?.value || '').trim();

    if (!newName) { toastr?.warning?.('请输入标签名称'); return; }
    if (newName.length > 12) { toastr?.warning?.('标签名称最多12字'); return; }

    const allTags = loadTags();
    if (!allTags[kind]) allTags[kind] = {};

    if (isEdit) {
      const oldTag = allTags[kind][originalName];
      const hadInject = oldTag?.defaultInject && oldTag.defaultInject.trim();

      // 编辑：如果改名了，需要更新所有 item 的 tags
      if (newName !== originalName) {
        if (allTags[kind][newName]) { toastr?.warning?.('已存在同名标签'); return; }
        // 改名
        allTags[kind][newName] = { color, desc, defaultInject };
        delete allTags[kind][originalName];
        // 更新所有 item tags（必须用 setCurrentManagedItems 写回内存，否则 saveManagedOverrides 存的是未改的旧数据）
        const items = getManagedItems(kind);
        let changed = false;
        const oldInject = hadInject ? oldTag.defaultInject : '';
        for (const [itemName, item] of Object.entries(items)) {
          if (item.tags && item.tags.includes(originalName)) {
            item.tags = item.tags.map(t => t === originalName ? newName : t);
            changed = true;
            // 反馈8：改名时同步 defaultInject 变化（规则同"只改"分支）
            if (hadInject && !defaultInject) {
              if (item.inject === oldInject) item.inject = undefined;
            } else if (!hadInject && defaultInject) {
              if (!item.inject || !item.inject.trim()) item.inject = defaultInject;
            } else if (hadInject && defaultInject && oldInject !== defaultInject) {
              if (item.inject === oldInject) item.inject = defaultInject;
            }
          }
        }
        if (changed) {
          setCurrentManagedItems(kind, items);
          saveManagedOverrides(kind);
        }
      } else {
        // 只改颜色/描述/默认注入
        allTags[kind][newName] = { color, desc, defaultInject };
        // 反馈8：标签默认注入模板改变后，同步所有打此标签卡片的 inject：
        //   - 旧有→新空：卡片 inject 等于旧 defaultInject 的，重置为 undefined（fallback 到 kind 默认）
        //   - 旧空→新有：卡片 inject 为空的，应用新 defaultInject
        //   - 旧有→新有（不同）：卡片 inject 等于旧 defaultInject 的，更新为新 defaultInject
        // 卡片若曾被玩家自定义过 inject（与旧 defaultInject 不同），则不被自动覆盖。
        const items = getManagedItems(kind);
        let changed = false;
        const oldInject = hadInject ? oldTag.defaultInject : '';
        for (const [itemName, item] of Object.entries(items)) {
          if (!item.tags || !item.tags.includes(newName)) continue;
          if (hadInject && !defaultInject) {
            if (item.inject === oldInject) { item.inject = undefined; changed = true; }
          } else if (!hadInject && defaultInject) {
            if (!item.inject || !item.inject.trim()) { item.inject = defaultInject; changed = true; }
          } else if (hadInject && defaultInject && oldInject !== defaultInject) {
            if (item.inject === oldInject) { item.inject = defaultInject; changed = true; }
          }
        }
        if (changed) {
          setCurrentManagedItems(kind, items);
          saveManagedOverrides(kind);
        }
      }
      saveTags(allTags);
      toastr?.success?.(`已更新标签：${newName}`);
    } else {
      // 新建
      if (allTags[kind][newName]) { toastr?.warning?.('已存在同名标签'); return; }
      allTags[kind][newName] = { color, desc, defaultInject };
      saveTags(allTags);
      toastr?.success?.(`已创建标签：${newName}`);
    }

    // 刷新标签管理 modal
    openTagManagerModal(kind, idPrefix);
  });
}

// ==================== 标签筛选栏渲染（Phase 2）====================
function renderTagFilterBar(kind: ManagedKind, idPrefix: string): string {
  const allTags = loadTags();
  const kindTags = allTags[kind] || {};
  const tagNames = Object.keys(kindTags);

  let h = '<div class="th-tag-filter-bar">';
  // 最近10张按钮
  h += `<button class="th-tag-filter-btn ${showRecentOnly[kind] ? 'active' : ''}" data-recent-toggle="1">
    <i class="fa-solid fa-clock-rotate-left"></i> 最近
  </button>`;
  // 只看收藏按钮
  h += `<button class="th-tag-filter-btn ${showFavOnly[kind] ? 'active' : ''}" data-fav-toggle="1">
    <i class="fa-solid fa-star"></i> 收藏
  </button>`;
  // 全部按钮
  h += `<button class="th-tag-filter-btn ${currentFilterTag === null ? 'active' : ''}" data-filter-tag="__all__">
    <i class="fa-solid fa-layer-group"></i> 全部
  </button>`;
  // 未分类按钮
  h += `<button class="th-tag-filter-btn ${currentFilterTag === '' ? 'active' : ''}" data-filter-tag="__none__">
    <i class="fa-solid fa-folder-open"></i> 未分类
  </button>`;
  // 各标签按钮
  for (const tagName of tagNames) {
    const tag = kindTags[tagName];
    h += `<button class="th-tag-filter-btn ${currentFilterTag === tagName ? 'active' : ''}" data-filter-tag="${escAttr(tagName)}">
      <span class="th-tag-color-swatch" style="background:var(--${tag.color})"></span> ${esc(tagName)}
    </button>`;
  }
  // 快捷操作：排序下拉 + 批量按钮 + 全部折叠 / 全部展开
  const sortMode = loadSortMode(kind);
  h += `<div class="th-tag-filter-actions" style="gap:4px">
    <select class="th-edit-input th-sort-select" id="${idPrefix}-sort" style="padding:4px 8px;font-size:12px;border-radius:8px;width:auto">
      <option value="az" ${sortMode==='az'?'selected':''}>名称 A-Z</option>
      <option value="za" ${sortMode==='za'?'selected':''}>名称 Z-A</option>
      <option value="recent" ${sortMode==='recent'?'selected':''}>最近编辑</option>
      <option value="tag" ${sortMode==='tag'?'selected':''}>标签分组</option>
    </select>
    <button class="th-tag-filter-btn ${batchMode[kind] ? 'active' : ''}" data-batch-toggle="1" title="批量操作">
      <i class="fa-solid fa-check-double"></i> 批量
    </button>
    <button class="th-tag-filter-btn" id="${idPrefix}-collapse-all" title="全部折叠">
      <i class="fa-solid fa-chevron-up"></i>
    </button>
    <button class="th-tag-filter-btn" id="${idPrefix}-expand-all" title="全部展开">
      <i class="fa-solid fa-chevron-down"></i>
    </button>
  </div>`;
  // 批量操作栏（仅批量模式下显示）
  const selectionCount = batchSelection[kind]?.size || 0;
  h += `<div class="th-batch-actions" style="display:${batchMode[kind] ? 'flex' : 'none'}">
    <span style="margin-right:auto">已选 ${selectionCount} 张</span>
    <button class="th-btn-sm" data-batch-op="selectAll"><i class="fa-solid fa-check-square"></i> 全选</button>
    <button class="th-btn-sm" data-batch-op="deselectAll"><i class="fa-solid fa-square"></i> 全不选</button>
    <button class="th-btn-sm" data-batch-op="delete" style="color:var(--red)"><i class="fa-solid fa-trash"></i> 删除</button>
    <button class="th-btn-sm" data-batch-op="tag"><i class="fa-solid fa-tags"></i> 打标...</button>
    <button class="th-btn-sm" data-batch-op="export"><i class="fa-solid fa-download"></i> 导出</button>
  </div>`;
  h += '</div>';
  return h;
}

// ==================== 按桶分组渲染卡片（Phase 2）====================
function renderManagedBuckets(kind: ManagedKind, idPrefix: string, query: string = ''): string {
  const allTags = loadTags();
  const kindTags = allTags[kind] || {};
  const items = getCurrentManagedItems(kind);
  const entries = Object.entries(items);

  // 最近10张模式：跨桶平铺显示最近编辑的10张
  if (showRecentOnly[kind]) {
    const recent = entries
      .sort((a, b) => (b[1].lastEdited || 0) - (a[1].lastEdited || 0))
      .slice(0, 10);
    return renderManagedCards(kind, recent);
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
    if (parsed.term) {
      const nameHit = name.toLowerCase().includes(parsed.term);
      const descHit = getDisplayDesc(item.desc).toLowerCase().includes(parsed.term);
      const tagHit = (item.tags || []).some(t => t.toLowerCase().includes(parsed.term));

      if (parsed.mode === 'tag' && !tagHit) continue;
      if (parsed.mode === 'desc' && !descHit) continue;
      if (parsed.mode === 'all' && !nameHit && !descHit && !tagHit) continue;
    }

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
  if (currentFilterTag === null) {
    // 显示全部桶（非空）
    bucketNamesToRender = Object.keys(kindTags).concat(['']).filter(tagName => buckets[tagName]?.length > 0);
  } else {
    // 只显示筛选的桶
    bucketNamesToRender = [currentFilterTag];
  }

  // 渲染桶
  let h = '';
  for (const bucketTag of bucketNamesToRender) {
    const bucketItems = buckets[bucketTag];
    if (!bucketItems || bucketItems.length === 0) continue;

    const isCollapsed = !!currentlyCollapsed[bucketTag];
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
    h += renderManagedCards(kind, sortBucketEntries(kind, bucketItems));
    h += `</div></div>`;
  }

  // 空结果
  if (!h) {
    const total = entries.length;
    const cfg = getStashKindCfg(kind);
    if (total === 0) {
      h = `<div class="th-empty th-empty-guide" style="padding:40px 20px;text-align:center"><i class="fa-solid fa-folder-open" style="font-size:32px;color:var(--tx3);display:block;margin-bottom:12px"></i><br>暂无${cfg.label}内容<br><span class="th-empty-hint" style="font-size:13px;color:var(--tx3);font-style:normal">点右上角 <i class="fa-solid fa-plus" style="font-size:11px;color:var(--pink)"></i> 新建，或 <i class="fa-solid fa-upload" style="font-size:11px;color:var(--pink)"></i> 导入预设</span></div>`;
    } else {
      h = `<div class="th-empty" style="padding:40px 20px;text-align:center"><i class="fa-solid fa-inbox" style="font-size:24px;color:var(--tx3);display:block;margin-bottom:12px"></i><br>没有找到匹配「${parsed.term}」的条目${currentFilterTag?`（标签：${currentFilterTag}）`:''}</div>`;
    }
  }

  return h;
}

// 打开关联面板
function openLinksPanel(kind: ManagedKind, name: string) {
  const items = getCurrentManagedItems(kind);
  const item = items[name];
  if (!item) return;
  const links = item.links || { locations: [], events: [], dlcs: [] };
  const cfg = MANAGED_CFG[kind];

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

  const estimatedTokens = totalEnabled * 50;

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

function bindManagedCardEvents(kind:ManagedKind, idPrefix:string) {
  const cfg = getStashKindCfg(kind);
  const grid=qs<HTMLElement>(`#${idPrefix}-grid`);
  console.log('[bindManagedCardEvents] called for kind=' + kind, 'idPrefix=' + idPrefix, 'grid=', grid, 'alreadyBound=', grid?.dataset?.managedEventsBound);
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
        currentFilterTag = tagName;
        // 同步筛选栏 active 态
        qsa('.th-tag-filter-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.filterTag === tagName || b.dataset.filterTag === '__all__' && currentFilterTag === null);
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
            if(cardKind.startsWith('stash-')) openStashModal(isStashAllTab ? 'all' : cardKind);
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
        if(cardKind.startsWith('stash-')) openStashModal(isStashAllTab ? 'all' : cardKind);
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
function idPrefixForKind(kind: ManagedKind): string {
  if (kind.startsWith('stash-')) return 'th-stash';
  if (kind === 'location') return 'th-loc';
  if (kind === 'event') return 'th-event';
  return 'th-dlc';
}

// ==================== 搜索增强（§10.6）====================
const SEARCH_HISTORY_KEY = '_th_managed_search_history_v1';
type SearchMode = 'all' | 'tag' | 'desc';
function parseSearchQuery(raw: string): { mode: SearchMode; term: string } {
  const r = raw.trim().toLowerCase();
  if (r.startsWith('tag:')) return { mode: 'tag', term: r.slice(4).trim() };
  if (r.startsWith('desc:')) return { mode: 'desc', term: r.slice(5).trim() };
  return { mode: 'all', term: r };
}
function loadSearchHistory(kind: ManagedKind): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (raw) {
      const all = JSON.parse(raw) as Record<ManagedKind, string[]>;
      return all[kind] || [];
    }
  } catch { }
  return [];
}
function pushSearchHistory(kind: ManagedKind, term: string) {
  if (!term.trim()) return;
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    const all: Record<ManagedKind, string[]> = raw ? JSON.parse(raw) : {} as any;
    let list = all[kind] || [];
    list = list.filter(t => t.toLowerCase() !== term.toLowerCase());
    list.unshift(term);
    list = list.slice(0, 5); // 最近5条
    all[kind] = list;
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(all));
  } catch { }
}

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
        const order = entry.position?.order ?? 100;

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
  currentFilterTag = filterTag;
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
    if (ft === '__all__') b.classList.toggle('active', currentFilterTag === null);
    else if (ft === '__none__') b.classList.toggle('active', currentFilterTag === '');
    else b.classList.toggle('active', currentFilterTag === ft);
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
    filterTag: currentFilterTag,
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
      if (kind.startsWith('stash-')) openStashModal(isStashAllTab ? 'all' : kind);
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
      if (kind.startsWith('stash-')) openStashModal(isStashAllTab ? 'all' : kind);
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

      if (!currentData) return;
      const userKey = getUserKey(currentData);
      // 正确变量路径：{userKey}.拥有物品 / {userKey}.拥有技能 / {userKey}.状态 / {userKey}.当前穿着衣物
      let basePath = '';
      if (kind === 'stash-item') basePath = `${userKey}.拥有物品`;
      else if (kind === 'stash-skill') basePath = `${userKey}.拥有技能`;
      else if (kind === 'stash-status') basePath = `${userKey}.状态`;
      else if (kind === 'stash-clothing') basePath = `${userKey}.当前穿着衣物`;
      else return;

      const cfg = getStashKindCfg(kind);
      const injectTemplate = currentInject || cfg.defaultInject;
      // 尝试解析结构化 payload（新格式 desc 是 JSON）
      let payload: Record<string, any>;
      try {
        const parsed = JSON.parse(currentDesc);
        payload = (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) ? { ...parsed } : null;
      } catch { payload = null; }
      if (!payload) {
        // 旧格式 desc 是纯文本，映射到对应字段
        const addKind: AddKind = kind === 'stash-item' ? 'item' : kind === 'stash-skill' ? 'skill' : kind === 'stash-status' ? 'status' : 'clothing';
        payload = { ...getDefaultEntry(addKind) };
        if (addKind === 'item' || addKind === 'skill') payload['简介'] = currentDesc;
        else if (addKind === 'status') payload['效果'] = currentDesc;
        else if (addKind === 'clothing') payload['外观详情'] = currentDesc;
      }
      payload['inject'] = injectTemplate;

      if (commitAdd(basePath, currentName, payload, { onDuplicate: 'overwrite' })) {
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
  // 正确方式：用 getNPCs(currentData) 获取 NPC 列表
  if (!currentData) { toastr?.warning?.('当前没有数据'); return; }
  const allNpcs = getNPCs(currentData);

  // 只显示所有 NPC（不筛选在场，因为用户可能想给不在场 NPC 也配发）
  if (allNpcs.length === 0) {
    toastr?.warning?.('当前没有 NPC');
    return;
  }

  // 构建 NPC 列表
  let listHtml = '<div class="th-add-to-npc-list">';
  for (const npc of allNpcs) {
    const avatarUrl = avatarImages['npc:' + npc.name] || '';
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

        // 正确变量路径：NPC.{npcName}.拥有物品 / 拥有技能 / 状态 / 当前穿着衣物
        let basePath = '';
        if (kind === 'stash-item') basePath = `NPC.${npcName}.拥有物品`;
        else if (kind === 'stash-skill') basePath = `NPC.${npcName}.拥有技能`;
        else if (kind === 'stash-status') basePath = `NPC.${npcName}.状态`;
        else if (kind === 'stash-clothing') basePath = `NPC.${npcName}.当前穿着衣物`;
        else return;

        const cfg = getStashKindCfg(kind);
        const injectTemplate = itemInject || cfg.defaultInject;
        // 尝试解析结构化 payload（新格式 desc 是 JSON）
        let payload: Record<string, any>;
        try {
          const parsed = JSON.parse(itemDesc);
          payload = (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) ? { ...parsed } : null;
        } catch { payload = null; }
        if (!payload) {
          // 旧格式 desc 是纯文本，映射到对应字段
          const addKind: AddKind = kind === 'stash-item' ? 'item' : kind === 'stash-skill' ? 'skill' : kind === 'stash-status' ? 'status' : 'clothing';
          payload = { ...getDefaultEntry(addKind) };
          if (addKind === 'item' || addKind === 'skill') payload['简介'] = itemDesc;
          else if (addKind === 'status') payload['效果'] = itemDesc;
          else if (addKind === 'clothing') payload['外观详情'] = itemDesc;
        }
        payload['inject'] = injectTemplate;

        if (commitAdd(basePath, itemName, payload, { onDuplicate: 'overwrite' })) {
          closeModal2();
          closeModal2(); // 关闭编辑 modal
          toastr?.success?.(`已添加给 ${npcName}：${itemName}`);
        }
      });
    });
  }, 100);
}

// 按标签批量配发 modal
function openDispatchByTagModal(kind: ManagedKind, idPrefix: string) {
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
      if (!currentData) { toastr?.warning?.('当前没有角色数据'); return; }
      const allNpcs = getNPCs(currentData);

      const userKey = getUserKey(currentData);
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
          const userKey = getUserKey(currentData);

          let successCount = 0;
          let totalCount = 0;

          for (const [itemName, item] of taggedItems) {
            for (const target of targets) {
              let basePath = '';
              if (target === 'user') {
                if (kind === 'stash-item') basePath = `${userKey}.拥有物品`;
                else if (kind === 'stash-skill') basePath = `${userKey}.拥有技能`;
                else if (kind === 'stash-status') basePath = `${userKey}.状态`;
                else if (kind === 'stash-clothing') basePath = `${userKey}.当前穿着衣物`;
              } else if (target.startsWith('npc:')) {
                const npcName = target.replace('npc:', '');
                if (kind === 'stash-item') basePath = `NPC.${npcName}.拥有物品`;
                else if (kind === 'stash-skill') basePath = `NPC.${npcName}.拥有技能`;
                else if (kind === 'stash-status') basePath = `NPC.${npcName}.状态`;
                else if (kind === 'stash-clothing') basePath = `NPC.${npcName}.当前穿着衣物`;
              }
              if (!basePath) continue;

              // 解析 payload
              let payload: Record<string, any>;
              try {
                const parsed = JSON.parse(item.desc);
                payload = (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) ? { ...parsed } : null;
              } catch { payload = null; }
              if (!payload) {
                const addKind: AddKind = kind === 'stash-item' ? 'item' : kind === 'stash-skill' ? 'skill' : kind === 'stash-status' ? 'status' : 'clothing';
                payload = { ...getDefaultEntry(addKind) };
                if (addKind === 'item' || addKind === 'skill') payload['简介'] = item.desc;
                else if (addKind === 'status') payload['效果'] = item.desc;
                else if (addKind === 'clothing') payload['外观详情'] = item.desc;
              }
              payload['inject'] = item.inject || cfg.defaultInject;

              if (commitAdd(basePath, itemName, payload, { onDuplicate: 'overwrite' })) {
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

async function openWorldbookInspectorModal(filter='') {
  let entries:InspectorEntry[]=[];
  try { entries=await loadInspectorEntries(); }
  catch(e){ console.warn('[此间天地] 世界书读取失败',e); toastr?.warning?.('世界书读取失败，请确认当前角色卡已绑定世界书'); entries=[]; }
  entries=sortInspectorEntries(entries);
  const q=filter.trim().toLowerCase();
  const filtered=q?entries.filter(item=>`${item.worldbookName} ${item.entry.name} ${item.entry.content}`.toLowerCase().includes(q)):entries;
  let h=`<div class="th-wb-tools"><input class="th-wb-search th-edit-input" id="th-wb-search" placeholder="搜索世界书、条目名或内容..." value="${escAttr(filter)}"><button class="th-wb-refresh" id="th-wb-refresh"><i class="fa-solid fa-rotate"></i> 刷新</button></div>`;
  if(!entries.length) h+=`<div class="th-empty"><i class="fa-solid fa-book-open"></i> 当前角色卡没有可读取的世界书条目</div>`;
  else h+=`<div class="th-wb-summary"><i class="fa-solid fa-book"></i> 已读取 ${entries.length} 个角色卡世界书条目，当前显示 ${filtered.length} 个</div><div class="th-wb-list">${renderWorldbookInspectorList(filtered)}</div>`;
  openModal(`<i class="fa-solid fa-book-open"></i> 世界书识别 <span class="th-modal-title-actions"><button class="th-title-io-btn" id="th-wb-title-refresh" title="刷新"><i class="fa-solid fa-rotate"></i></button></span>`,h);
  setTimeout(()=>bindWorldbookInspectorEvents(filter),60);
}

function renderWorldbookInspectorList(items:InspectorEntry[]): string {
  return items.map(item=>{
    const e=item.entry;
    const managed=item.managedKind?`<span class="th-wb-prefix ${item.managedKind}">${MANAGED_CFG[item.managedKind].prefix}</span>`:'';
    const strategy=e.strategy?.type||'constant';
    const pos=e.position||{} as WorldbookEntry['position'];
    return `<div class="th-wb-row" data-wb="${escAttr(item.worldbookName)}" data-uid="${e.uid}">
      <div class="th-wb-row-main">
        <span class="th-bind-dot ${e.enabled?'bound':'unbound'}"></span>
        <div class="th-wb-row-title"><span class="th-wb-name">${managed}${esc(e.name)}</span><span class="th-wb-book"><i class="fa-solid fa-book"></i> ${esc(item.worldbookName)} · order ${esc(pos.order??0)}</span></div>
      </div>
      <div class="th-wb-row-actions">
        <button class="th-wb-chip th-wb-toggle ${e.enabled?'on':'off'}" data-wb-action="toggle">${e.enabled?'开启':'关闭'}</button>
        <button class="th-wb-chip strategy ${strategy}" data-wb-action="strategy">${strategyLabel(strategy)}</button>
        <span class="th-wb-chip pos">${esc(positionLabel(pos.type))}</span>
        <button class="th-wb-detail-btn" data-wb-action="detail"><i class="fa-solid fa-pen-to-square"></i> 详情</button>
      </div>
    </div>`;
  }).join('');
}

function bindWorldbookInspectorEvents(filter:string) {
  qs('#th-wb-refresh')?.addEventListener('click',()=>{ void openWorldbookInspectorModal((qs<HTMLInputElement>('#th-wb-search')?.value||filter)); });
  qs('#th-wb-title-refresh')?.addEventListener('click',()=>{ void openWorldbookInspectorModal((qs<HTMLInputElement>('#th-wb-search')?.value||filter)); });
  qs('#th-wb-search')?.addEventListener('input',function(this:HTMLInputElement){
    const value=this.value;
    window.clearTimeout((window as any).__wbSearchTimer__);
    (window as any).__wbSearchTimer__=window.setTimeout(()=>void openWorldbookInspectorModal(value),180);
  });
  qsa('.th-wb-row').forEach(row=>row.addEventListener('click',async function(this:HTMLElement,e:Event){
    const action=(e.target as HTMLElement).closest<HTMLElement>('[data-wb-action]')?.getAttribute('data-wb-action')||'';
    if(!action) return;
    e.stopPropagation();
    const worldbookName=this.getAttribute('data-wb')||'';
    const uid=Number(this.getAttribute('data-uid'));
    if(!worldbookName||isNaN(uid)) return;
    if(action==='detail'){ await openWorldbookEntryDetail(worldbookName,uid); return; }
    if(action==='toggle'){
      await updateInspectorEntry(worldbookName,uid,entry=>({...entry,enabled:!entry.enabled}));
    } else if(action==='strategy'){
      await updateInspectorEntry(worldbookName,uid,entry=>{
        const current=entry.strategy?.type||'constant';
        const next=current==='constant'?'selective':'constant';
        const fallback=parseManagedEntryName(entry.name).name||entry.name;
        return {...entry,strategy:{...entry.strategy,type:next,keys:next==='selective'&&(!entry.strategy.keys||!entry.strategy.keys.length)?[fallback]:entry.strategy.keys}};
      });
    }
    await refreshManagedStatesAfterWorldbookEdit();
    void openWorldbookInspectorModal((qs<HTMLInputElement>('#th-wb-search')?.value||filter));
  }));
}

async function openWorldbookEntryDetail(worldbookName:string, uid:number) {
  const entries=await safeGetWorldbook(worldbookName);
  const entry=entries.find(e=>e.uid===uid);
  if(!entry){ toastr?.warning?.('条目不存在，可能已被修改或删除'); return; }
  const h=renderWorldbookEntryEditor(worldbookName,entry);
  openModal2(`<i class="fa-solid fa-pen-to-square"></i> 世界书条目设置`,h);
  setTimeout(()=>bindWorldbookEntryEditor(worldbookName,uid),60);
}

function renderSelect(name:string, value:string, options:[string,string][]): string {
  return `<select class="th-wb-field th-edit-select" data-wb-field="${name}">${options.map(([v,l])=>`<option value="${escAttr(v)}" ${v===value?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
}
function renderInput(name:string,value:any,type='text'): string { return `<input class="th-wb-field th-edit-input" data-wb-field="${name}" type="${type}" value="${escAttr(value??'')}">`; }
function renderTextarea(name:string,value:any,rows=3): string { return `<textarea class="th-wb-field th-edit-textarea" data-wb-field="${name}" rows="${rows}">${esc(value??'')}</textarea>`; }
function renderBool(name:string,value:boolean): string { return renderSelect(name,String(!!value),[['true','是'],['false','否']]); }

function renderWorldbookEntryEditor(worldbookName:string, entry:WorldbookEntry): string {
  const s=entry.strategy||{} as WorldbookEntry['strategy'];
  const p=entry.position||{} as WorldbookEntry['position'];
  const r=entry.recursion||{} as WorldbookEntry['recursion'];
  const ef=entry.effect||{} as WorldbookEntry['effect'];
  return `<div class="th-wb-editor" data-wb="${escAttr(worldbookName)}" data-uid="${entry.uid}">
    <div class="th-wb-editor-meta"><span><i class="fa-solid fa-book"></i> ${esc(worldbookName)}</span><span>order ${esc(entry.position?.order??0)}</span></div>
    <div class="th-wb-form-grid">
      <label>条目名称${renderInput('name',entry.name)}</label>
      <label>启用状态${renderBool('enabled',entry.enabled)}</label>
      <label>激活策略${renderSelect('strategy.type',s.type||'constant', [['constant','蓝灯 / 常量'],['selective','绿灯 / 关键词'],['vectorized','向量化']])}</label>
      <label>激活概率%${renderInput('probability',entry.probability??100,'number')}</label>
      <label>扫描深度${renderInput('strategy.scan_depth',s.scan_depth==='same_as_global'?'':s.scan_depth??'','number')}</label>
      <label>次要逻辑${renderSelect('strategy.keys_secondary.logic',s.keys_secondary?.logic||'and_any', [['and_any','任一满足'],['and_all','全部满足'],['not_all','不全满足'],['not_any','全部不满足']])}</label>
      <label>插入位置${renderSelect('position.type',p.type||'after_character_definition', [['before_character_definition','角色定义前'],['after_character_definition','角色定义后'],['before_example_messages','示例消息前'],['after_example_messages','示例消息后'],['before_author_note','作者注释前'],['after_author_note','作者注释后'],['at_depth','指定深度'],['outlet','出口']])}</label>
      <label>插入身份${renderSelect('position.role',p.role||'system', [['system','system'],['assistant','assistant'],['user','user']])}</label>
      <label>插入深度${renderInput('position.depth',p.depth??4,'number')}</label>
      <label>排序 order${renderInput('position.order',p.order??100,'number')}</label>
      <label>黏性 sticky${renderInput('effect.sticky',ef.sticky??'','number')}</label>
      <label>冷却 cooldown${renderInput('effect.cooldown',ef.cooldown??'','number')}</label>
      <label>延迟 delay${renderInput('effect.delay',ef.delay??'','number')}</label>
      <label>递归延迟${renderInput('recursion.delay_until',r.delay_until??'','number')}</label>
      <label>禁止入递归${renderBool('recursion.prevent_incoming',!!r.prevent_incoming)}</label>
      <label>禁止出递归${renderBool('recursion.prevent_outgoing',!!r.prevent_outgoing)}</label>
    </div>
    <div class="th-wb-form-wide">
      <label>主要关键词（逗号或换行分隔）${renderTextarea('strategy.keys',keysToText(s.keys||[]),3)}</label>
      <label>次要关键词（逗号或换行分隔）${renderTextarea('strategy.keys_secondary.keys',keysToText(s.keys_secondary?.keys||[]),3)}</label>
      <label>条目内容${renderTextarea('content',entry.content||'',8)}</label>
      <label>额外数据 extra（JSON，可留空）${renderTextarea('extra',entry.extra?JSON.stringify(entry.extra,null,2):'',4)}</label>
    </div>
    <div class="th-wb-editor-actions"><button class="th-wb-save" id="th-wb-entry-save"><i class="fa-solid fa-floppy-disk"></i> 保存修改</button><button class="th-wb-cancel" id="th-wb-entry-cancel"><i class="fa-solid fa-xmark"></i> 取消</button></div>
  </div>`;
}

function getWbFieldValue(field:string): string { return (qs<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>(`[data-wb-field="${field}"]`)?.value||''); }
function bindWorldbookEntryEditor(worldbookName:string, uid:number) {
  qs('#th-wb-entry-cancel')?.addEventListener('click',closeModal2);
  qs('#th-wb-entry-save')?.addEventListener('click',async()=>{
    try{
      await updateInspectorEntry(worldbookName,uid,entry=>{
        const extraRaw=getWbFieldValue('extra').trim();
        let extra:any=undefined;
        if(extraRaw) extra=JSON.parse(extraRaw);
        const strategyType=getWbFieldValue('strategy.type') as WorldbookEntry['strategy']['type'];
        const keys=textToKeys(getWbFieldValue('strategy.keys'));
        const fallback=parseManagedEntryName(getWbFieldValue('name')).name||getWbFieldValue('name');
        return {
          ...entry,
          name:getWbFieldValue('name').trim()||entry.name,
          enabled:boolFromSelect(getWbFieldValue('enabled')),
          probability:clamp(numberFromInput(getWbFieldValue('probability'),entry.probability??100),0,100),
          content:getWbFieldValue('content'),
          extra,
          strategy:{
            ...entry.strategy,
            type:strategyType,
            keys:strategyType==='selective'&&!keys.length?[fallback]:keys,
            scan_depth:getWbFieldValue('strategy.scan_depth').trim()?numberFromInput(getWbFieldValue('strategy.scan_depth'),1):'same_as_global',
            keys_secondary:{
              logic:getWbFieldValue('strategy.keys_secondary.logic') as WorldbookEntry['strategy']['keys_secondary']['logic'],
              keys:textToKeys(getWbFieldValue('strategy.keys_secondary.keys')),
            },
          },
          position:{
            ...entry.position,
            type:getWbFieldValue('position.type') as WorldbookEntry['position']['type'],
            role:getWbFieldValue('position.role') as WorldbookEntry['position']['role'],
            depth:numberFromInput(getWbFieldValue('position.depth'),entry.position?.depth??4),
            order:numberFromInput(getWbFieldValue('position.order'),entry.position?.order??100),
          },
          recursion:{
            prevent_incoming:boolFromSelect(getWbFieldValue('recursion.prevent_incoming')),
            prevent_outgoing:boolFromSelect(getWbFieldValue('recursion.prevent_outgoing')),
            delay_until:nullableNumberFromInput(getWbFieldValue('recursion.delay_until')),
          },
          effect:{
            sticky:nullableNumberFromInput(getWbFieldValue('effect.sticky')),
            cooldown:nullableNumberFromInput(getWbFieldValue('effect.cooldown')),
            delay:nullableNumberFromInput(getWbFieldValue('effect.delay')),
          },
        };
      });
      await refreshManagedStatesAfterWorldbookEdit();
      toastr?.success?.('世界书条目已保存');
      closeModal2();
      void openWorldbookInspectorModal((qs<HTMLInputElement>('#th-wb-search')?.value||''));
    }catch(e){ console.warn('[此间天地] 保存世界书条目失败',e); toastr?.error?.('保存失败：请检查 extra JSON 或字段内容'); }
  });
}

// 需求7：衣物列表弹窗
function openClothingListModal(npcName:string, clothing:Record<string,any>) {
  const entries=Object.entries(clothing);
  if(!entries.length){ openModal(esc(npcName)+' · 衣物','<div class="th-empty"><i class="fa-solid fa-vest"></i> 暂无穿着</div>'); return; }
  let h='<div class="th-block-row">';
  for(const[cn,ci] of entries){
    const c=ci as any; const state=c?.['衣物状态']||'';
    const dot=getDotCls(state);
    h+=`<span class="th-block th-block-clothing th-fold-trigger" data-btype="clothing" data-bname="${escAttr(cn)}" data-bpart="${escAttr(c?.['穿着部位']||'')}" data-bstate="${escAttr(state)}" data-bdetail="${escAttr(c?.['外观详情']||'')}" data-bpath="NPC.${escAttr(npcName)}.当前穿着衣物.${escAttr(cn)}"><i class="fa-solid fa-vest"></i> ${esc(cn)} · ${esc(c?.['穿着部位']||'')} <span class="th-tag-dot ${dot}"></span><span class="th-fold-arrow" style="margin-left:auto;font-size:10px"><i class="fa-solid fa-chevron-down"></i></span></span>`;
  }
  h+=`</div><div class="th-fold-detail" style="display:none"></div>`;
  openModal(`<i class="fa-solid fa-vest"></i> `+esc(npcName)+' · 当前穿着',h);
  setTimeout(()=>{
    bindClothingFoldDown(npcName);
  },40);
}

// ================================================================
//  弹窗系统 — 需求3：二级弹窗支持堆叠
// ================================================================
function openModal(t:string,b:string){ hideHoverTipNow(); hideMetricWheel(); setH('.th-modal-title',t); setH('.th-modal-body',b); const o=qs('.th-modal-overlay'); if(o)o.style.display='flex'; }
function closeModal(){ const o=qs('.th-modal-overlay'); if(o)o.style.display='none'; }
function openModal2(t:string,b:string){
  hideHoverTipNow(); hideMetricWheel();
  const overlay=qs('.th-modal-overlay-2'); if(!overlay) return;
  const titleEl=qs('.th-modal-title-2'); if(titleEl) titleEl.innerHTML=t;
  const bodyEl=qs('.th-modal-body-2'); if(bodyEl) bodyEl.innerHTML=b;
  overlay.style.display='flex';
}
function closeModal2(){
  const overlay=qs('.th-modal-overlay-2'); if(overlay) overlay.style.display='none';
  const titleEl=qs('.th-modal-title-2'); if(titleEl) titleEl.innerHTML='';
  const bodyEl=qs('.th-modal-body-2'); if(bodyEl) bodyEl.innerHTML='';
}

// ================================================================
//  需求9：编辑模式 — 全面覆盖
// ================================================================
function toggleEditMode() {
  const w=gw(); if(!w) return;
  isEditMode=!isEditMode;
  if(isEditMode){
    w.classList.add('edit-mode');
  } else {
    w.classList.remove('edit-mode');
  }
  // 完全重新渲染以应用编辑模式
  clearRenderCache();
  renderCurrent();
  const btn=qs<HTMLButtonElement>('.th-btn-edit');
  if(btn) btn.classList.toggle('active',isEditMode);
}

// 全局编辑输入处理（input 和 textarea change 事件）
__doc.addEventListener('change',(e:Event)=>{
  if(!isEditMode||!currentData) return;
  const target=e.target as HTMLElement;
  if(!target.classList.contains('th-edit-input')&&!target.classList.contains('th-edit-textarea')) return;
  const path=target.getAttribute('data-edit-path')||'';
  const val=(target as HTMLInputElement).value;
  applyEdit(path,val);
}, __sigOpt());

__doc.addEventListener('click',(e:Event)=>{
  const target=e.target as HTMLElement;
  const trigger=target.closest('[data-add-trigger]') as HTMLElement|null;
  if(!trigger||!gw()?.contains(trigger)) return;
  e.stopPropagation();
  const kind=trigger.getAttribute('data-add-trigger') as AddKind;
  const basePath=trigger.getAttribute('data-add-base')||'';
  const owner=trigger.getAttribute('data-add-owner')||'';
  if(!currentData||!basePath||!isAddKind(kind)) return;
  let afterCommit=()=>{ renderCurrent(); };
  if(kind==='item'){
    const isUser=!basePath.startsWith('NPC.');
    afterCommit=()=>{ if(!currentData) return; isUser?openUserBag(currentData):openNPCBag(owner); };
  } else if(kind==='skill'){
    const isUser=!basePath.startsWith('NPC.');
    afterCommit=()=>{ if(!currentData) return; isUser?openUserSkill(currentData):openNPCSkill(owner); };
  } else if(basePath.startsWith('NPC.')){
    afterCommit=()=>{ if(currentData) openNPCDetail(owner); };
  }
  openAddDialog(kind,basePath,owner||'添加',afterCommit);
}, __sigOpt());
// 对于 contenteditable span
__doc.addEventListener('blur',(e:Event)=>{
  if(!isEditMode||!currentData) return;
  const target=e.target as HTMLElement;
  if(!target.classList.contains('th-editable')||!target.getAttribute('contenteditable')) return;
  const path=target.getAttribute('data-edit-path')||'';
  const val=target.textContent||'';
  applyEdit(path,val);
}, __sigOptCapture());

function applyEdit(path:string,val:string) {
  if(!currentData||!path) return;
  try {
    // 使用 lodash 通用路径写入
    const ukey=getUserKey(currentData);
    // 将玩家宏替换为实际 user key
    let resolvedPath=path;
    const userMacro=tavernMacro('user');
    if(path.includes(userMacro)) resolvedPath=path.replaceAll(userMacro,ukey);
    // 尝试将数字字符串转为 number
    let parsedVal:any=val;
    const num=Number(val);
    if(!isNaN(num)&&val.trim()!=='') parsedVal=num;
    _.set(currentData,resolvedPath,parsedVal);
    saveData(currentData);
    // PROGRESS §7 Step B：本地编辑统一采集审核变更
    try { collectStatDataChange(currentData, { snapshot: true, label: 'applyEdit' }); } catch(e) { void e; }
    // 延迟重新渲染（避免在 change 事件处理过程中刷新 DOM）
    setTimeout(()=>{ renderCurrent(); },50);
  } catch(e) {
    console.warn('[此间天地] applyEdit failed:',path,val,e);
  }
}

type AddKind='item'|'skill'|'status'|'clothing';
function isAddKind(v:any): v is AddKind { return v==='item'||v==='skill'||v==='status'||v==='clothing'; }
function getDefaultEntry(kind:AddKind): Record<string,any> {
  switch(kind){
    case 'item': return {数量:1,简介:'',效果:'',评价:''};
    case 'skill': return {等级:1,简介:'',效果:'',评价:''};
    case 'status': return {效果:'',来源:'',持续时间:''};
    case 'clothing': return {穿着部位:'',衣物状态:'',外观详情:''};
  }
}
function resolveDataPath(path:string): string {
  if(!currentData) return path;
  const userMacro=tavernMacro('user');
  return path.includes(userMacro)?path.replaceAll(userMacro,getUserKey(currentData)):path;
}
function isNameTaken(basePath:string,name:string): boolean {
  const map=_.get(currentData||{},resolveDataPath(basePath),{})||{};
  return Object.prototype.hasOwnProperty.call(map,name);
}
function commitAdd(basePath:string,name:string,payload:Record<string,any>, opts?:{onDuplicate?:'reject'|'overwrite'}): boolean {
  if(!currentData) return false;
  const trimmed=name.trim();
  if(!trimmed){ toastr?.warning?.('名称不能为空'); return false; }
  const onDuplicate = opts?.onDuplicate || 'reject';
  if(onDuplicate === 'reject' && isNameTaken(basePath,trimmed)){ toastr?.warning?.('已存在同名条目'); return false; }
  try {
    const resolved=resolveDataPath(basePath);
    const map={...(_.get(currentData,resolved,{})||{})};
    map[trimmed]=payload;
    _.set(currentData,resolved,map);
    saveData(currentData);
    // PROGRESS §7 Step B：本地编辑统一采集审核变更
    try { collectStatDataChange(currentData, { snapshot: true, label: 'commitAdd' }); } catch(e) { void e; }
    setTimeout(()=>{ renderCurrent(); },50);
    if(onDuplicate === 'overwrite' && isNameTaken(basePath,trimmed)) toastr?.success?.(`已覆盖：${trimmed}`);
    else toastr?.success?.(`已添加：${trimmed}`);
    return true;
  } catch(e) {
    console.warn('[此间天地] commitAdd failed:',basePath,name,e);
    toastr?.error?.('添加失败');
    return false;
  }
}
function openAddDialog(kind:AddKind,basePath:string,ownerLabel:string,afterCommit:()=>void) {
  const titleMap:Record<AddKind,string>={item:'物品',skill:'技能',status:'状态',clothing:'衣物'};
  const fieldOrder:Record<AddKind,string[]>={
    item:['名称','数量','简介','效果','评价'],
    skill:['名称','等级','简介','效果','评价'],
    status:['名称','效果','来源','持续时间'],
    clothing:['名称','穿着部位','衣物状态','外观详情'],
  };
  const longFields=new Set(['简介','效果','评价','外观详情']);
  const defaults=getDefaultEntry(kind);
  let h=`<div class="th-add-form" data-add-kind="${kind}" data-add-base="${escAttr(basePath)}">`;
  for(const f of fieldOrder[kind]){
    const value=f==='名称'?'':(defaults[f]??'');
    const isNum=(kind==='item'&&f==='数量')||(kind==='skill'&&f==='等级');
    h+=`<div class="th-modal-section"><div class="th-modal-label">${esc(f)}</div>`;
    if(longFields.has(f)) h+=`<textarea class="th-add-field th-edit-textarea" data-add-field="${escAttr(f)}" rows="3">${esc(value)}</textarea>`;
    else h+=`<input class="th-add-field th-edit-input" data-add-field="${escAttr(f)}" type="${isNum?'number':'text'}" value="${escAttr(value)}">`;
    h+=`</div>`;
  }
  h+=`<div class="th-item-actions"><button class="th-btn-sm th-btn-add-confirm"><i class="fa-solid fa-check"></i> 添加</button><button class="th-btn-sm th-btn-add-cancel" style="background:var(--bg3);color:var(--tx2);border:1px solid var(--dv);margin-left:auto"><i class="fa-solid fa-xmark"></i> 取消</button></div></div>`;
  const title=`<i class="fa-solid fa-plus"></i> 新增${titleMap[kind]} · ${esc(ownerLabel)}`;
  const overlay=qs('.th-modal-overlay') as HTMLElement|null;
  const useModal2=!!overlay&&getComputedStyle(overlay).display!=='none';
  if(useModal2) openModal2(title,h); else openModal(title,h);
  setTimeout(()=>{
    const root=qs(useModal2?'.th-modal-body-2':'.th-modal-body'); if(!root) return;
    const getVal=(f:string)=>((root.querySelector(`[data-add-field="${f}"]`) as HTMLInputElement|HTMLTextAreaElement|null)?.value||'');
    root.querySelector('.th-btn-add-confirm')?.addEventListener('click',()=>{
      const payload:Record<string,any>={...getDefaultEntry(kind)};
      for(const f of fieldOrder[kind]){
        if(f==='名称') continue;
        const raw=getVal(f);
        if((kind==='item'&&f==='数量')||(kind==='skill'&&f==='等级')){
          const n=Number(raw); payload[f]=isNaN(n)?payload[f]:n;
        } else payload[f]=raw;
      }
      if(commitAdd(basePath,getVal('名称'),payload)){
        if(useModal2) closeModal2(); else closeModal();
        setTimeout(()=>{ try{ afterCommit(); }catch(e){ console.warn('[此间天地] add afterCommit failed',e); } },60);
      }
    });
    root.querySelector('.th-btn-add-cancel')?.addEventListener('click',()=>{ if(useModal2) closeModal2(); else closeModal(); });
    (root.querySelector('[data-add-field="名称"]') as HTMLInputElement|null)?.focus();
  },40);
}

// ================================================================
//  折叠/展开
// ================================================================
function toggleCollapse() {
  const w=gw(); if(!w) return;
  w.classList.toggle('collapsed');
  // 折叠后 topbar 高度变化，通知审核面板重算顶部偏移
  try { window.dispatchEvent(new CustomEvent('th:topbar-resize')); } catch(e) { void e; }
}

// PROGRESS §7 Step C：把 topbar 底沿高度（含 margin-bottom）写到 wrapper CSS 变量，
// 审核抽屉的 top 用此变量，保证从 topbar 下方滑出、不被 topbar 盖住。
function syncTopbarBottom(): void {
  try {
    const w = gw(); if (!w) return;
    const topbar = w.querySelector('.th-topbar') as HTMLElement | null;
    if (!topbar) return;
    const rect = topbar.getBoundingClientRect();
    const wrapperRect = w.getBoundingClientRect();
    const bottom = rect.bottom - wrapperRect.top;
    w.style.setProperty('--th-topbar-bottom', `${Math.round(bottom)}px`);
  } catch(e) { void e; }
}

// ================================================================
//  工具
// ================================================================
const ESC_MAP: Record<string,string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
function esc(s:any):string { return String(s).replace(/[&<>"']/g,ch=>ESC_MAP[ch]); }
function escAttr(s:any):string { return esc(s); }
function getAvatarColor(name:string,idx:number):string { if(!avatarColorMap[name]) avatarColorMap[name]=AVATAR_COLORS[idx%AVATAR_COLORS.length]; return avatarColorMap[name]; }
function deleteAvatar(t:string){ delete avatarImages[t]; saveImages(); if(t==='user')renderUserAvatar(); else if(currentData)renderNPCGrid(currentData); }
function showImage(u:string){ const o=qs('.th-image-overlay'); const i=qs<HTMLImageElement>('.th-image-full'); if(o&&i){i.setAttribute('src',u);o.style.display='flex';} }
function hideImage(){ const o=qs('.th-image-overlay'); if(o)o.style.display='none'; }
function getDotCls(effectOrState:string):string{
  const s=(effectOrState||'').toLowerCase();
  if(s.includes('debuff')||s.includes('负面')||s.includes('破损')||s.includes('撕裂')) return 'bad';
  if(s.includes('buff')||s.includes('增益')) return 'good';
  if(s.includes('湿')||s.includes('脏')||s.includes('乱')) return 'warn';
  return 'neutral';
}

// ================================================================
//  事件绑定
// ================================================================
function bindEvents() {
  qs('.th-btn-refresh')?.addEventListener('click',()=>{manualRefresh();});
  // 需求1：地点/事件总览按钮
  qs('.th-btn-locations')?.addEventListener('click',()=>{openLocationsModal();});
  qs('.th-btn-events')?.addEventListener('click',()=>{openEventsModal();});
  qs('.th-btn-dlcs')?.addEventListener('click',()=>{openDlcsModal();});
  qs('.th-btn-stash')?.addEventListener('click',()=>{ try { openStashModal(); } catch(e) { console.error('[此间天地] openStashModal error:', e); toastr?.error?.('储藏间打开失败'); } });
  qs('.th-btn-worldbook')?.addEventListener('click',()=>{void openWorldbookInspectorModal();});
  // 需求9：NPC在场筛选按钮（含持久化）
  qsa('.th-npc-filter-btn').forEach(btn=>btn.addEventListener('click',function(this:HTMLElement){
    const f=this.getAttribute('data-filter') as 'all'|'present'|'absent';
    if(!f) return;
    npcFilter=f;
    savePersistedNpcFilter(f);
    qsa('.th-npc-filter-btn').forEach(b=>b.classList.remove('active'));
    this.classList.add('active');
    _renderCache.npc = '';
    renderCurrent();
  }));
  // 批次3.1：NPC 网格列数手动切换（1/2/3），点击循环 + localStorage 持久化
  (function bindColsSwitcher() {
    const COLS_KEY = '_th_npc_cols_v2';
    let cols = parseInt(localStorage.getItem(COLS_KEY) || '2', 10);
    if (![1, 2, 3].includes(cols)) cols = 2;
    function apply() {
      const grid = qs('.th-npc-grid');
      if (grid) grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      const btn = qs('.th-btn-cols-switcher');
      if (btn) { btn.textContent = String(cols); btn.setAttribute('data-cols', String(cols)); }
    }
    apply();
    const btn = qs('.th-btn-cols-switcher');
    btn?.addEventListener('click', () => {
      cols = cols >= 3 ? 1 : cols + 1;
      localStorage.setItem(COLS_KEY, String(cols));
      apply();
    });
  })();
  // 批次3.2：在场/离场切换（合并原"在场"+"不在场"两个按钮为一个，点击循环 present↔absent）
  // 不影响 npcFilter='all' 状态——点"全部"按钮正常切回全显示
  // applyPresenceBtn() 定义在模块顶层，启动时 init 也能同步
  applyPresenceBtn();
  const presenceBtn = qs('.th-btn-presence-switcher');
  presenceBtn?.addEventListener('click', () => {
    // 'all' → 'present'；'present' → 'absent'；'absent' → 'present'
    npcFilter = (npcFilter === 'present') ? 'absent' : 'present';
    savePersistedNpcFilter(npcFilter);
    applyPresenceBtn();
    // 同步 .th-npc-filter-btn（含"全部"）的 active 状态
    qsa('.th-npc-filter-btn[data-filter]').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-filter') === npcFilter);
    });
    _renderCache.npc = '';
    renderCurrent();
  });
  // 批次6：NPC 搜索（姓名 + 身份）—— 实时过滤 + 防抖 150ms + 持久化
  (function bindNpcSearch() {
    const input = qs<HTMLInputElement>('.th-npc-search');
    const clearBtn = qs<HTMLButtonElement>('.th-npc-search-clear');
    if (!input) return;
    // 启动时从 localStorage 恢复（如果 init 还没设值就设上；init 已设就以 init 为准）
    if (!npcSearchText) npcSearchText = loadPersistedNpcSearch();
    input.value = npcSearchText;
    function applyClearVisible() {
      if (!clearBtn) return;
      clearBtn.style.display = input.value ? 'flex' : 'none';
    }
    applyClearVisible();
    let debounceTimer: number | null = null;
    input.addEventListener('input', () => {
      applyClearVisible();
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        npcSearchText = input.value;
        savePersistedNpcSearch(npcSearchText);
        _renderCache.npc = '';
        renderCurrent();
      }, 150);
    });
    // Esc 清空
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && input.value) {
        e.preventDefault();
        input.value = '';
        npcSearchText = '';
        savePersistedNpcSearch('');
        applyClearVisible();
        _renderCache.npc = '';
        renderCurrent();
      }
    });
    // × 按钮清空
    clearBtn?.addEventListener('click', () => {
      input.value = '';
      npcSearchText = '';
      savePersistedNpcSearch('');
      applyClearVisible();
      _renderCache.npc = '';
      renderCurrent();
      input.focus();
    });
  })();
  // 批次7：NPC 卡片 3D tilt —— 鼠标位置驱动 rotateX/Y ±6°，mouseleave 平滑复位
  // 不动 .th-fab-panel（硬约束：transform 都在 .th-npc-card 自身），perspective 内联到 transform
  (function bindNPCCardTilt() {
    const grid = qs('.th-npc-grid');
    if (!grid) return;
    const TILT_MAX = 6;            // ±6°
    const PERSPECTIVE = 800;       // 透视 800px
    // 保留 CSS :hover 的 translateY(-3px) scale(1.01)，让 3D tilt 跟 :hover 视觉叠加
    const HOVER_TRANSFORM = 'translateY(-3px) scale(1.01)';
    const pending = new WeakMap<HTMLElement, number>();
    function applyTilt(card: HTMLElement, e: MouseEvent) {
      const r = card.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const dx = (e.clientX - r.left - r.width / 2) / (r.width / 2);   // -1 ~ 1
      const dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
      card.style.transform =
        `perspective(${PERSPECTIVE}px) ${HOVER_TRANSFORM}` +
        ` rotateX(${-dy * TILT_MAX}deg) rotateY(${dx * TILT_MAX}deg)`;
    }
    grid.addEventListener('mousemove', (e: MouseEvent) => {
      const card = (e.target as HTMLElement | null)?.closest<HTMLElement>('.th-npc-card');
      if (!card) return;
      if (pending.has(card)) return; // rAF 节流：每张卡每帧最多 1 次
      const ev = e; const c = card;
      const id = requestAnimationFrame(() => {
        pending.delete(c);
        applyTilt(c, ev);
      });
      pending.set(card, id);
    });
    grid.addEventListener('mouseout', (e: MouseEvent) => {
      const card = (e.target as HTMLElement | null)?.closest<HTMLElement>('.th-npc-card');
      if (!card) return;
      // 鼠标移到卡内子元素不算离开
      const related = e.relatedTarget as Node | null;
      if (related && card.contains(related)) return;
      const id = pending.get(card);
      if (id !== undefined) { cancelAnimationFrame(id); pending.delete(card); }
      card.style.transform = ''; // 清 inline style，让 CSS :hover transform 接管
    });
  })();
  qs('.th-btn-edit')?.addEventListener('click',()=>{toggleEditMode();});
  let lastReviewPendingCount = getPendingCount();
  function renderActiveReviewTab(): void {
    const tab = qs<HTMLElement>('.th-review-tab.active')?.getAttribute('data-tab') || 'review';
    if (tab === 'snapshot') renderSnapshotList();
    else renderReviewList();
  }
  // 编号15：铃铛按钮 → 切换审核面板显隐 + 首次展开时渲染内容（PROGRESS §7 Step C：抽屉）
  (function bindReviewEvents() {
    const btn = qs('.th-btn-review');
    const panel = qs('.th-review-panel');
    if (!btn || !panel) return;
    // 初始与 resize 时同步 topbar 底沿高度到 wrapper CSS 变量
    syncTopbarBottom();
    window.addEventListener('resize', syncTopbarBottom);
    window.addEventListener('th:topbar-resize', syncTopbarBottom as EventListener);
    const setOpen = (open: boolean) => {
      if (open) {
        // 打开：先把 panel 挂回渲染态（display:flex）作为起点，下一帧再加 .shown 触发滑入动画
        syncTopbarBottom();
        panel.classList.add('open');
        btn.classList.add('active');
        btn.setAttribute('aria-expanded', 'true');
        renderReviewList();
        requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('shown')));
      } else {
        // 关闭：不动画，直接从渲染树移除（CSS display:none），彻底无 transform 残留
        panel.classList.remove('shown', 'open');
        btn.classList.remove('active');
        btn.setAttribute('aria-expanded', 'false');
      }
    };
    btn.addEventListener('click', () => {
      setOpen(!panel.classList.contains('open'));
    });
    // 抽屉关闭：× 按钮 + Esc
    qs('.th-review-panel-close')?.addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && panel.classList.contains('open')) {
        // 优先级：review-edit modal > review panel
        if (document.querySelector('.th-review-edit-modal')) return;
        setOpen(false);
        e.stopPropagation();
      }
    });
    // 步骤5：tab 切换
    qsa('.th-review-tab').forEach(t => {
      t.addEventListener('click', function(this: HTMLElement) {
        const tab = this.getAttribute('data-tab');
        qsa('.th-review-tab').forEach(x => x.classList.remove('active'));
        this.classList.add('active');
        const rl = qs('.th-review-list');
        const sl = qs('.th-snapshot-list');
        if (tab === 'snapshot') { if (rl) rl.style.display = 'none'; if (sl) sl.style.display = ''; renderSnapshotList(); }
        else { if (rl) rl.style.display = ''; if (sl) sl.style.display = 'none'; renderReviewList(); }
      });
    });
    // 步骤4：全部同意 / 全部拒绝
    qs('.th-review-approve-all')?.addEventListener('click', () => { approveAllPending(); renderReviewList(); });
    qs('.th-review-reject-all')?.addEventListener('click', async () => { try { await rejectAllPending(); } catch(e) { void e; } renderReviewList(); });
    qs('.th-review-clear-all')?.addEventListener('click', () => { clearReviewAll(); renderReviewList(); });
    // 步骤3：审核列表事件委托（✓/✗/修改/跳 NPC）
    const list = qs('.th-review-list');
    if (list) {
      list.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const btn = target.closest<HTMLElement>('[data-action]');
        if (!btn) return;
        const itemEl = btn.closest<HTMLElement>('.th-review-item');
        if (!itemEl) return;
        const id = itemEl.getAttribute('data-id') || '';
        const action = btn.getAttribute('data-action') || '';
        const queue = getReviewQueue();
        const item = queue.find(i => i.id === id);
        if (!item) return;
        if (action === 'approve') {
          try { await applyReviewItem(id, 'approve'); } catch(e) { void e; }
        } else if (action === 'reject') {
          try { await applyReviewItem(id, 'reject'); } catch(e) { void e; }
        } else if (action === 'edit') {
          showReviewEditModal(id, item);
          return;
        } else if (action === 'jump-npc') {
          jumpToNpc(btn.getAttribute('data-npc') || '');
          return;
        }
        renderReviewList();
      });
    }
    // 步骤5：快照列表事件委托（覆盖 / 删除）
    const slist = qs('.th-snapshot-list');
    if (slist) {
      slist.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const btn = target.closest<HTMLElement>('[data-snap-action]');
        if (!btn) return;
        const itemEl = btn.closest<HTMLElement>('.th-snapshot-item');
        if (!itemEl) return;
        const id = itemEl.getAttribute('data-id') || '';
        const action = btn.getAttribute('data-snap-action') || '';
        if (action === 'restore') {
          try { await restoreSnapshot(id); } catch(e) { void e; }
        } else if (action === 'delete') {
          deleteSnapshot(id);
        }
        renderSnapshotList();
      });
    }
    // 订阅 review 队列变化 → 实时更新 badge + 当前 tab 内容
    subscribeReview(() => { updateReviewBadge(); if (panel.classList.contains('open')) renderActiveReviewTab(); });
    updateReviewBadge();
  })();
  // 步骤2：更新铃铛 badge（pending 数 + 有 pending 时脉动 + 全部完成态）
  function updateReviewBadge(): void {
    const btn = qs('.th-btn-review');
    const badge = qs('.th-review-badge');
    const count = qs('.th-review-pending-count');
    if (!btn || !badge) return;
    const n = getPendingCount();
    const wasPending = lastReviewPendingCount > 0;
    if (n > 0) {
      badge.style.display = '';
      badge.textContent = String(n);
      btn.classList.add('has-pending');
      btn.classList.remove('reviewed-all');
    } else {
      badge.style.display = 'none';
      btn.classList.remove('has-pending');
      if (wasPending) {
        btn.classList.remove('reviewed-all');
        void btn.offsetWidth;
        btn.classList.add('reviewed-all');
        window.setTimeout(() => btn.classList.remove('reviewed-all'), 1500);
      }
    }
    lastReviewPendingCount = n;
    if (count) count.textContent = n > 0 ? String(n) : '';
  }
  // 步骤3：渲染审核列表（完整版：path + 旧值→新值 + diff 色 + 4 个按钮 + 跳 NPC）
  function renderReviewList(): void {
    const list = qs('.th-review-list');
    const empty = qs('.th-review-empty');
    if (!list || !empty) return;
    const queue = getReviewQueue();
    if (!queue.length) {
      list.innerHTML = '';
      empty.style.display = '';
      empty.textContent = '暂无待审核变量';
      return;
    }
    empty.style.display = 'none';
    const sorted = queue.slice().sort((a, b) => b.timestamp - a.timestamp);
    list.innerHTML = sorted.slice(0, 50).map(item => {
      const path = esc(item.path);
      const oldV = esc(formatReviewVal(item.oldValue));
      const newV = esc(formatReviewVal(item.newValue));
      let diffHtml = '';
      if (typeof item.diff === 'number') {
        const cls = item.diff > 0 ? 'pos' : item.diff < 0 ? 'neg' : 'zero';
        const sign = item.diff > 0 ? '+' : '';
        diffHtml = `<span class="th-review-item-diff ${cls}">${sign}${item.diff}</span>`;
      }
      const npc = parseNpcFromPath(item.path);
      const jumpBtn = npc ? `<button class="th-review-item-btn th-btn-jump-npc" data-action="jump-npc" data-npc="${esc(npc)}" title="查看 ${esc(npc)} 详情">👤</button>` : '';
      return `<div class="th-review-item status-${item.status}" data-id="${item.id}"><span class="th-review-item-path" title="${path}">${path}</span>${diffHtml}<div class="th-review-item-old" title="原值: ${oldV}">${oldV}</div><span class="th-review-item-arrow">→</span><div class="th-review-item-new" title="新值: ${newV}">${newV}</div><div class="th-review-item-actions">${jumpBtn}<button class="th-review-item-btn th-btn-approve" data-action="approve" title="同意">✓</button><button class="th-review-item-btn th-btn-reject" data-action="reject" title="拒绝">✗</button><button class="th-review-item-btn th-btn-edit" data-action="edit" title="修改新值">✎</button></div></div>`;
    }).join('');
  }
  // 步骤5：渲染快照列表
  function renderSnapshotList(): void {
    const list = qs('.th-snapshot-list');
    const empty = qs('.th-review-empty');
    if (!list || !empty) return;
    const snaps = getSnapshots();
    if (!snaps.length) {
      list.innerHTML = '';
      empty.style.display = '';
      empty.textContent = '暂无快照';
      return;
    }
    empty.style.display = 'none';
    empty.textContent = '暂无待审核变量';
    list.innerHTML = snaps.slice().reverse().map(s => {
      const time = new Date(s.timestamp).toLocaleString('zh-CN', { hour12: false });
      return `<div class="th-snapshot-item" data-id="${s.id}"><div class="th-snapshot-item-info"><span class="th-snapshot-item-time">${time}</span><span class="th-snapshot-item-floor">#${s.messageId}</span></div><div class="th-snapshot-item-actions"><button class="th-snapshot-item-btn th-snapshot-btn-restore" data-snap-action="restore" type="button">覆盖</button><button class="th-snapshot-item-btn th-snapshot-btn-delete" data-snap-action="delete" type="button">删除</button></div></div>`;
    }).join('');
  }
  // 编号15：edit modal——点修改按钮时弹出
  function showReviewEditModal(id: string, item: any): void {
    __doc.querySelector('.th-review-edit-modal')?.remove();
    const overlay = __doc.createElement('div');
    overlay.className = 'th-review-edit-modal';
    overlay.innerHTML = `<div class="th-review-edit-modal-content"><div class="th-review-edit-modal-title">修改变量新值</div><div class="th-review-edit-modal-path">${esc(item.path)}</div><div class="th-review-edit-modal-row"><label>原值</label><span class="th-review-edit-old">${esc(formatReviewVal(item.oldValue))}</span></div><div class="th-review-edit-modal-row th-review-edit-modal-row-stack"><label>新值</label><textarea class="th-review-edit-input th-edit-textarea" rows="6">${esc(formatReviewVal(item.newValue))}</textarea></div><div class="th-review-edit-modal-actions"><button class="th-mini-btn th-review-edit-cancel" type="button">取消</button><button class="th-mini-btn th-review-edit-confirm" type="button">确认</button></div></div>`;
    __body.appendChild(overlay);
    const input = qsRoot<HTMLTextAreaElement>('.th-review-edit-input', overlay);
    if (input) { input.focus(); input.setSelectionRange(0, input.value.length); }
    const close = () => { overlay.remove(); renderReviewList(); };
    qsRoot('.th-review-edit-cancel', overlay)?.addEventListener('click', close);
    qsRoot('.th-review-edit-confirm', overlay)?.addEventListener('click', async () => {
      const newValRaw = input?.value ?? '';
      let parsed: any = newValRaw;
      if (typeof item.newValue === 'number') {
        const n = Number(newValRaw);
        if (!Number.isNaN(n)) parsed = n;
      } else if (typeof item.newValue === 'boolean') {
        parsed = newValRaw === 'true';
      }
      try { await applyReviewItem(id, 'edit', parsed); } catch(e) { void e; }
      close();
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }
  // 编号15：跳到状态栏里的 NPC 卡（scrollIntoView + 临时高亮 2s）
  function jumpToNpc(npcName: string): void {
    if (!npcName) return;
    const cards = qsa<HTMLElement>('.th-npc-card');
    let target: HTMLElement | null = null;
    for (const c of cards) {
      const name = c.querySelector('.th-npc-name')?.textContent?.trim() || '';
      if (name === npcName) { target = c; break; }
    }
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('th-npc-card-flash');
    setTimeout(() => target?.classList.remove('th-npc-card-flash'), 2000);
  }
  // 编号15：从 path 解析 NPC 名
  function parseNpcFromPath(path: string): string {
    const parts = path.split('.');
    if (parts.length >= 2 && (parts[0] === '角色' || parts[0] === 'NPC' || parts[0] === '角色卡')) {
      return parts[1];
    }
    return '';
  }
  // 编号15：格式化变量值显示（保留完整内容，CSS 控制截断 + title hover 看完整）
  function formatReviewVal(v: unknown): string {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (typeof v === 'bigint') return `${v}n`;
    if (typeof v === 'symbol') return v.toString();
    if (typeof v === 'function') return '[Function]';
    try {
      return JSON.stringify(v) ?? String(v);
    } catch {
      return Object.prototype.toString.call(v);
    }
  }
  // 标题折叠
  qs('.th-topbar-title')?.addEventListener('click',()=>{toggleCollapse();});

  // 头像
  qs('.th-avatar-upload')?.addEventListener('click',()=>{const u=avatarImages['user']||'';if(u)showImage(u);else{uploadingTarget='user';qs<HTMLInputElement>('.th-avatar-file-input')?.click();}});
  qs('.th-avatar-btn-upload')?.addEventListener('click',(e:Event)=>{e.stopPropagation();uploadingTarget='user';qs<HTMLInputElement>('.th-avatar-file-input')?.click();});
  qs('.th-avatar-btn-delete')?.addEventListener('click',(e:Event)=>{e.stopPropagation();deleteAvatar('user');});

  // 文件上传（支持头像和画廊）
  const fi=qs<HTMLInputElement>('.th-avatar-file-input');
  if(fi) fi.addEventListener('change',function(this:HTMLInputElement){
    if(!this.files||!this.files.length) return;
    const galleryTarget=(window as any).__galleryTarget__||'';
    if(galleryTarget){
      // 需求6：画廊多图上传
      let loaded=0;
      Array.from(this.files).forEach(file=>{
        const r=new FileReader();
        r.onload=()=>{ addNPCGalleryImage(galleryTarget,r.result as string); loaded++; if(loaded===this.files!.length){ closeModal(); openGalleryModal(galleryTarget); (window as any).__galleryTarget__=''; } };
        r.readAsDataURL(file);
      });
    } else {
      const tgt=(window as any).__uploadTarget__||uploadingTarget||'user';
      const r=new FileReader();
      r.onload=()=>{ avatarImages[tgt]=r.result as string; saveImages(); if(tgt==='user')renderUserAvatar(); else if(currentData)renderNPCGrid(currentData); (window as any).__uploadTarget__=''; };
      r.readAsDataURL(this.files[0]);
    }
    this.value='';
  });

  // 属性按钮 click + hover
  qs('.th-btn-attr-modal')?.addEventListener('click',()=>{if(!currentData)return;const u=getUser(currentData);const ukey=getUserKey(currentData);openAttrModal(getUN(currentData),_.get(u,'属性',{})||{},ukey+'.属性');});
  qs('.th-btn-attr-modal')?.addEventListener('mouseenter',function(this:HTMLElement){
    if(!currentData) return;
    const u=getUser(currentData); const attrs=_.get(u,'属性',{})||{};
    const html=buildAttrBarHtml(attrs);
    showHoverTip(this,'attr',{name:getUN(currentData),html:html});
  });
  qs('.th-btn-attr-modal')?.addEventListener('mouseleave',()=>{hideHoverTip();});

  // 需求4：姿态/身体 hover 显示信息 + click 弹详情编辑弹窗
  qs('.th-pb-posture')?.addEventListener('mouseenter',function(this:HTMLElement){
    const text=this.getAttribute('data-pb-text')||'';
    showHoverTip(this,'pb',{icon:'fa-solid fa-child-reaching',label:'姿态动作',content:text});
  });
  qs('.th-pb-posture')?.addEventListener('mouseleave',()=>{hideHoverTip();});
  qs('.th-pb-posture')?.addEventListener('click',function(this:HTMLElement){
    const text=this.getAttribute('data-pb-text')||'';
    const path=this.getAttribute('data-pb-path')||'';
    const h=isEditMode?editableTextarea(text,path):`<div class="th-modal-text">${esc(text)}</div>`;
    openModal('<i class="fa-solid fa-child-reaching"></i> 姿态动作',h);
  });

  qs('.th-pb-body')?.addEventListener('mouseenter',function(this:HTMLElement){
    const text=this.getAttribute('data-pb-text')||'';
    showHoverTip(this,'pb',{icon:'fa-solid fa-hand-holding-heart',label:'身体状态',content:text});
  });
  qs('.th-pb-body')?.addEventListener('mouseleave',()=>{hideHoverTip();});
  qs('.th-pb-body')?.addEventListener('click',function(this:HTMLElement){
    const text=this.getAttribute('data-pb-text')||'';
    const path=this.getAttribute('data-pb-path')||'';
    const h=isEditMode?editableTextarea(text,path):`<div class="th-modal-text">${esc(text)}</div>`;
    openModal('<i class="fa-solid fa-hand-holding-heart"></i> 身体状态',h);
  });

  // 弹窗关闭
  qs('.th-modal-close')?.addEventListener('click',closeModal);
  // 二级弹窗关闭
  qs('.th-modal-close-2')?.addEventListener('click',closeModal2);
  qs('.th-modal-overlay-2')?.addEventListener('click',function(e:Event){ if(e.target===this) closeModal2(); });
  // 需求6：点击遮罩空白处→详情回退到网格，否则关闭弹窗
  qs('.th-modal-overlay')?.addEventListener('click',function(this:HTMLElement,e:Event){
    if(e.target!==this) return;
    const detailEl=qs('#th-grid-detail');
    if(detailEl&&detailEl.style.display!=='none'){
      // 有详情面板打开：回退到网格
      detailEl.style.display='none'; detailEl.innerHTML='';
      const gridEl=detailEl.previousElementSibling as HTMLElement;
      if(gridEl) gridEl.style.display='';
      return;
    }
    // 检查折叠式衣物详情是否打开
    const foldDetail=qs('.th-fold-detail');
    if(foldDetail&&foldDetail.style.display!=='none'){
      foldDetail.style.display='none'; foldDetail.innerHTML='';
      // 恢复箭头
      const trigger=__doc.querySelector('.th-fold-trigger .fa-chevron-up');
      if(trigger) trigger.outerHTML='<i class="fa-solid fa-chevron-down"></i>';
      return;
    }
    closeModal();
  });
  // 需求6：点击弹窗主体空白处（非详情区域）→ 回退到网格
  qs('.th-modal-body')?.addEventListener('click',function(this:HTMLElement,e:Event){
    const target=e.target as HTMLElement;
    // 不干扰按钮、输入框、方块、折叠触发器等控件的点击
    if(target.closest('button')||target.closest('input')||target.closest('textarea')||target.closest('.th-block')||target.closest('.th-fold-trigger')||target.closest('.th-fold-detail')||target.closest('#th-grid-detail')) return;
    const detailEl=qs('#th-grid-detail');
    if(detailEl&&detailEl.style.display!=='none'){
      detailEl.style.display='none'; detailEl.innerHTML='';
      const gridEl=detailEl.previousElementSibling as HTMLElement;
      if(gridEl) gridEl.style.display='';
    }
  });
  qs('.th-image-overlay')?.addEventListener('click',hideImage);
  qs('.th-image-close')?.addEventListener('click',(e:Event)=>{e.stopPropagation();hideImage();});
  __doc.addEventListener('keydown',(e:KeyboardEvent)=>{if(e.key==='Escape'){const o2=qs('.th-modal-overlay-2');if(o2&&o2.style.display!=='none'){closeModal2();return;}closeModal();hideImage();}}, __sigOpt());

  // 全局点击关闭浮动元素
  __doc.addEventListener('click',(e:Event)=>{
    const tip=__doc.querySelector<HTMLElement>('.th-hover-tip'); if(!tip||tip.style.display==='none') return;
    if(!(e.target as HTMLElement).closest('.th-block') && !(e.target as HTMLElement).closest('.th-hover-tip')){
      tip.style.display='none';
    }
  }, __sigOpt());
}

// ================================================================
//  初始化（脚本版本：由外壳 Shell.vue 在 onMounted 时调用 setupStatusBar）
// ================================================================
// PROGRESS §7 Step B 收尾：已迁移到 startPersistentPoll 内部用 __lowPollTimer / __initPollTimer。
// 保留旧声明占位避免外部 grep 误判。
let __pollTimer: number | null = null;
let __mvuOff: { destroy?: () => void } | null = null;
// 编号15：上次成功渲染的 stat_data 快照（用于事件/轮询中作为 oldVars 兜底）
// 实际数据存放在 lib/variable-review 的 __reviewBaseline（深拷贝快照），
// 保留本地指针仅为兼容 __lastStatHash 配套使用。
let __lastRenderedData: Record<string, any> | null = null;
// 编号15：上次轮询时记录的当前消息楼层号（新聊天/新楼层检测用）
let __lastMessageId: number | null = null;
// 编号15：上次轮询 stat_data 哈希（变化检测用）
let __lastStatHash: string | null = null;

function _statDataHash(data: any): string {
  try { return JSON.stringify(data); } catch(e) { void e; return ''; }
}

// 写入基线：薄包装，委托给数据层 setReviewBaseline（深拷贝快照），
// 同时刷新本地 __lastRenderedData 指针，方便 poll/event 兜底读取。
function syncReviewBaseline(data: Record<string, any> | null | undefined): void {
  setReviewBaseline(data);
  __lastRenderedData = getReviewBaseline();
  if (data != null) __lastStatHash = _statDataHash(data);
  else __lastStatHash = null;
}

// PROGRESS §7 Step B 收尾：把 1.5s 长期轮询降级为「初始化高频 + 稳定期低频兜底」。
// 设计：
//   - 初始化阶段（stat_data 尚未读到）每 INIT_POLL_MS 轮询一次，直到拿到数据或 INIT_POLL_TIMEOUT 超时。
//   - 拿到数据后切到低频兜底 LOW_POLL_MS；基线已同步时 collectStatDataChange 会 isEqual 短路，
//     所以低频 poll 在「无外部变化」时基本是 1 次 readData + 1 次 scheduleRender，性能可接受。
//   - event（VARIABLE_UPDATE_ENDED）+ 本地编辑统一采集（Step B 已接入）仍是主路径。
//   - 手动刷新按钮（th-btn-refresh）走 manualRefresh() → readData + collectStatDataChange。
const INIT_POLL_MS = 500;
const INIT_POLL_TIMEOUT_MS = 15000;
const LOW_POLL_MS = 10000; // 10s 兜底

let __lowPollTimer: number | null = null;
let __initPollTimer: number | null = null;
let __initPollStartedAt: number = 0;
let __initPollDone = false;

function startPersistentPoll(): void {
  if (__lowPollTimer !== null || __initPollTimer !== null) return;

  const tick = (label: string) => {
    try {
      if (isReviewWriting()) {
        const guardedData = readData();
        if (guardedData) syncReviewBaseline(guardedData);
        scheduleRender();
        return;
      }
      const data = readData();
      if (!data) return;
      // 楼层号变化 → 新聊天/新楼层 → 清队列 + 自动同意 pending
      const h = _statDataHash(data);
      if (!h) return;
      let curMsgId: number = -1;
      try { curMsgId = (getCurrentMessageId as any)(); } catch(e) { void e; }
      if (__lastMessageId !== null && curMsgId !== __lastMessageId) {
        try { clearReviewAll(); } catch(e) { void e; }
        try { approveAllPending(); } catch(e) { void e; }
      }
      __lastMessageId = curMsgId;
      // hash 变化或基线尚未建立 → 统一采集；基线已同步时 isEqual 短路。
      if (h !== __lastStatHash || !getReviewBaseline()) {
        try { collectStatDataChange(data, { snapshot: true, label }); } catch(e) { void e; }
      }
      scheduleRender();
    } catch(e) { void e; }
  };

  // 立即跑一次不等定时器
  tick('poll:init');
  // 初始化阶段高频轮询
  __initPollStartedAt = Date.now();
  __initPollDone = false;
  const initStep = () => {
    if (__initPollDone) return;
    tick('poll:init');
    const data = (() => { try { return readData(); } catch(e) { void e; return null; } })();
    const elapsed = Date.now() - __initPollStartedAt;
    if (data && getReviewBaseline()) {
      __initPollDone = true;
      if (__initPollTimer !== null) { window.clearInterval(__initPollTimer); __initPollTimer = null; }
      // 切到低频兜底
      __lowPollTimer = window.setInterval(() => tick('poll:low'), LOW_POLL_MS);
      return;
    }
    if (elapsed >= INIT_POLL_TIMEOUT_MS) {
      __initPollDone = true;
      if (__initPollTimer !== null) { window.clearInterval(__initPollTimer); __initPollTimer = null; }
      // 超时也切到低频，避免完全失明
      __lowPollTimer = window.setInterval(() => tick('poll:low'), LOW_POLL_MS);
    }
  };
  __initPollTimer = window.setInterval(initStep, INIT_POLL_MS);
}

/**
 * 由外壳调用，在 wrapper DOM 已挂到酒馆主页面 body 后初始化状态栏行为。
 * 返回 destroy 用于卸载脚本时清理全局监听 / 定时器 / 额外创建的 DOM。
 */
export async function setupStatusBar(): Promise<{ destroy: () => void }> {
  // 重置 AbortController（多次挂载需要新的 controller）
  __abortController = new AbortController();

  // 暴露给 NPC 详情弹窗内联 onclick 调用
  const w_any = window as any;
  const p_any = (() => { try { return window.parent as any; } catch(e){ void e; return null; } })();
  w_any.__uploadTarget__ = '';
  w_any.__deleteAvatar__ = (t:string)=>{ deleteAvatar(t); };
  if (p_any && p_any !== w_any) {
    try {
      p_any.__uploadTarget__ = '';
      p_any.__deleteAvatar__ = (t:string)=>{ deleteAvatar(t); };
      p_any.__galleryTarget__ = '';
    } catch(e){ void e; }
  }

  try {
    // 正则替换环境不一定有 MVU iframe 对象；主数据读取优先依赖酒馆助手变量 API。
    if (!(window as any).Mvu) {
      try { (window as any).Mvu = getRoot().Mvu; } catch(e) { void e; }
    }
    await waitForVariableApi();
    await waitUntil(()=>hasStatData(activeMessageOption),150,15000);
    // 单次读取 {type:'chat'} 变量，同时取回头像与画廊数据
    const chatVars = (() => { try { return safeGetVariables({type:'chat'}); } catch(e){ return {} as Record<string,any>; } })();
    const im = _.get(chatVars, IMG_KEY, {});
    avatarImages = im && typeof im === 'object' ? im : {};
    const g = _.get(chatVars, GALLERY_KEY, {});
    galleryImages = g && typeof g === 'object' ? g : {};
    avatarVersion++;
    avatarColorMap = {};
    const w=gw(); if(!w) throw new Error('[0612悬浮球] th-status-wrapper 未在主页面找到');
    w.setAttribute('data-th-id',_wrapperId);
    // 0612悬浮球：读取上次保存的 NPC 筛选并应用到按钮的 active 状态
    npcFilter = loadPersistedNpcFilter();
    // 批次6：读取上次保存的 NPC 搜索文本（在 refresetH 之前，让首次 render 用正确 searchText）
    npcSearchText = loadPersistedNpcSearch();
    try {
      qsa('.th-npc-filter-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-filter') === npcFilter);
      });
    } catch(e){ void e; }
    // 批次3.2：同步合并后的在场/离场按钮 textContent + active
    try { applyPresenceBtn(); } catch(e){ void e; }
    // 0612悬浮球：不再操作 iframe.frameElement 的 overflow——外壳 Shell.vue 直接挂在 body 上。
    refresetH(); bindEvents();
    // 编号15：注入审核系统依赖（getMvu + getCurrentMessageId + onWriteback 触发 scheduleRender）
    try {
      configureReview({
        getMvu,
        getCurrentMessageId: () => {
          try { return (getCurrentMessageId as any)(); } catch (e) { void e; return -1; }
        },
        onWriteback: () => { scheduleRender(); },
      });
    } catch(e) { void e; }
    // 编号15：兜底轮询（解决 Mvu 事件跨不了 iframe 的问题——脚本运行在酒馆助手 iframe 里，
    // 主页 Mvu 触发的 mag_variable_update_ended / mag_variable_initiailized / message_received
    // 事件不会自动冒泡到 iframe 内 eventOn。0612 原本就走轮询路线，本项目沿用并改进。）
    // 轮询职责：
    //   1. stat_data 顶层 hash 比对，变化 → scheduleRender
    //   2. 新聊天/楼层号变化 → clearReviewAll + approveAllPending
    //   3. 审核/快照：PROGRESS §7 Step B 之后统一走 collectStatDataChange()。
    //      本地编辑保存后基线已同步 → poll 调 helper 时 isEqual 短路，不重复。
    //      外部变量管理器/MVU 事件漏掉时，poll 兜底补一次。
    startPersistentPoll();
    // 编号15：事件监听（若哪天 Mvu 改成跨 iframe 派发，自动启用加速——不影响兜底）
    try{
      const localEventOn = (window as any).eventOn || getRoot().eventOn;
      const localEventOff = (window as any).eventOff || getRoot().eventOff;
      const mvu = getMvu();
      if(typeof localEventOn==='function'&&mvu?.events?.VARIABLE_UPDATE_ENDED){
        // 编号15：handler 扩展——在原 scheduleRender 基础上加入审核队列生成 + 异步快照保存
        // 防递归：isReviewWriting() 为 true 时早返回（replaceMvuData 写回会再次触发）
        const handler = (newVars: any, _oldVars: any) => {
          if (isReviewWriting()) { scheduleRender(); return; }
          try {
            const newData = _.get(newVars, 'stat_data', {});
            if (newData && typeof newData === 'object') {
              // 统一审核采集：helper 内部用基线作 oldData；
              // 本地编辑已同步基线 → 自动 isEqual 短路，不重复生成。
              collectStatDataChange(newData, { snapshot: true, label: 'event' });
            }
          } catch(e) { void e; }
          scheduleRender();
        };
        localEventOn(mvu.events.VARIABLE_UPDATE_ENDED, handler);
        __mvuOff = { destroy: () => {
          try {
            if (typeof localEventOff === 'function') localEventOff(mvu.events.VARIABLE_UPDATE_ENDED, handler);
          } catch(e){ void e; }
        }};
      }
      // 编号15：VARIABLE_INITIALIZED 监听——新聊天初始化时清空旧队列 + 旧快照（避免跨聊天残留）
      if (typeof localEventOn === 'function' && mvu?.events?.VARIABLE_INITIALIZED) {
        const initHandler = () => {
          try { clearReviewAll(); } catch(e) { void e; }
        };
        localEventOn(mvu.events.VARIABLE_INITIALIZED, initHandler);
        const prevDestroy = __mvuOff?.destroy;
        __mvuOff = {
          destroy: () => {
            try { if (typeof localEventOff === 'function') localEventOff(mvu.events.VARIABLE_INITIALIZED, initHandler); } catch(e) { void e; }
            try { prevDestroy?.(); } catch(e) { void e; }
          }
        };
      }
      // 编号15：新楼层自动同意当前所有 pending
      if (typeof localEventOn === 'function') {
        const newMsgHandler = () => {
          try { approveAllPending(); } catch(e) { void e; }
        };
        try { localEventOn('MESSAGE_RECEIVED', newMsgHandler); } catch(e) { void e; }
        const prevDestroy = __mvuOff?.destroy;
        __mvuOff = {
          destroy: () => {
            try { if (typeof localEventOff === 'function') localEventOff('MESSAGE_RECEIVED', newMsgHandler); } catch(e) { void e; }
            try { prevDestroy?.(); } catch(e) { void e; }
          }
        };
      }
    }catch(e){ void e; }
  } catch(e) { throw e; }

  // §10.5 polish round 5:把数据/函数暴露到 parent window，让 Shell.vue 能访问
  getRoot().__thStatusBarData = {
    getCurrentData: () => currentData,
    getAvatarImages: () => avatarImages,
    showItemsHoverTip,
    showSkillsHoverTip,
    showHoverTip,
    hideHoverTip,
    openUserBag,
    openUserSkill,
    openAttrModal,
    openModal,
    getUser,
    getUserKey,
    getUN,
    buildAttrBarHtml,
    isEditMode: () => isEditMode,
    editableTextarea,
    esc,
    bindBlockHoverAndClick
  };

  return {
    destroy: () => {
      try { __abortController.abort(); } catch(e){ void e; }
      if (__lowPollTimer !== null) { try { window.clearInterval(__lowPollTimer); } catch(e){ void e; } __lowPollTimer = null; }
      if (__initPollTimer !== null) { try { window.clearInterval(__initPollTimer); } catch(e){ void e; } __initPollTimer = null; }
      __pollTimer = null;
      try { __mvuOff?.destroy?.(); } catch(e){ void e; }
      __mvuOff = null;
      // 清理 body 上额外创建的浮动元素
      try { if (wheelEl && wheelEl.parentNode) wheelEl.parentNode.removeChild(wheelEl); } catch(e){ void e; }
      wheelEl = null; wheelItems = [];
      try { if (locHoverTip && locHoverTip.parentNode) locHoverTip.parentNode.removeChild(locHoverTip); } catch(e){ void e; }
      locHoverTip = null;
      try { if (hoverTip && hoverTip.parentNode) hoverTip.parentNode.removeChild(hoverTip); } catch(e){ void e; }
      hoverTip = null;
    },
  };
}
