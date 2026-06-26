// managed / tag / stash-kind 数据层 + 类型（解耦阶段 0a）。
// 纯数据 CRUD（localStorage 读写）+ 可变全局状态归属 + getStashKindCfg 统一 kind 配置入口。
// 行为与 status-bar-init.ts 原内联实现完全一致。
//
// 可变全局引用安全策略（§4.1/§4.2）：
// - managedEntryStates / currentManagedItems 是“对象引用型”可变全局——
//   全文只有属性读写（[kind]=... / [kind][name]），从未整体重新赋值，
//   故 export let + import {} 保持同一对象引用，安全。
// - 禁止消费者对这两个变量做整体赋值（managedEntryStates = {...}），
//   那会断开引用。若未来确需整体赋值，改 getter/setter（见 §4.2 dom-utils 范式）。
//
// ManagedKind / MANAGED_CFG 从 ./config 单向 import，无循环依赖。
// 类型 ManagedItemV2 / ManagedEntryState / InspectorEntry / StashKindMeta /
// Tag / TagsByKind / CollapsedByKind 随之搬来，主文件改 import type。
// ================================================================
import { type ManagedKind, MANAGED_CFG } from './config';

export type ManagedItemV2 = { desc: string; tags: string[]; order?: number; inject?: string; favorite?: boolean; lastEdited?: number; links?: { locations?: string[]; events?: string[]; dlcs?: string[] } };
export type ManagedEntryState = { bound: boolean; enabled: boolean; count: number; enabledCount: number; worldbookNames: string[] };
export type InspectorEntry = { worldbookName:string; entry:WorldbookEntry; managedKind:ManagedKind|null; managedName:string };

export let managedEntryStates: Record<ManagedKind,Record<string,ManagedEntryState>> = { location:{}, event:{}, dlc:{}, 'stash-item':{}, 'stash-skill':{}, 'stash-status':{}, 'stash-clothing':{}, 'stash-uncategorized':{} };
export let currentManagedItems: Record<ManagedKind,Record<string,ManagedItemV2>> = { location:{}, event:{}, dlc:{}, 'stash-item':{}, 'stash-skill':{}, 'stash-status':{}, 'stash-clothing':{}, 'stash-uncategorized':{} };

// ManagedItemV2 迁移工具：旧 string 格式 → v2 对象格式
export function migrateManagedItem(v: string | ManagedItemV2): ManagedItemV2 {
  if (typeof v === 'string') return { desc: v, tags: [], inject: undefined, favorite: false, lastEdited: 0 };
  return { desc: v.desc, tags: v.tags ?? [], order: v.order, inject: v.inject, favorite: !!v.favorite, lastEdited: v.lastEdited ?? 0, links: v.links };
}

export function loadManagedItems(key:string): Record<string,ManagedItemV2> {
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
export function saveManagedOverrides(kind:ManagedKind) {
  const current = currentManagedItems[kind];
  const storageKey = kind.startsWith('stash-custom-') ? getStashKindStorageKey(kind.replace('stash-custom-', '')) : MANAGED_CFG[kind].storageKey;
  try { localStorage.setItem(storageKey, JSON.stringify({ added: current, deleted: [] })); } catch(e) { void e; }
}
export function getManagedItems(kind:ManagedKind): Record<string,ManagedItemV2> {
  const storageKey = kind.startsWith('stash-custom-') ? getStashKindStorageKey(kind.replace('stash-custom-', '')) : MANAGED_CFG[kind].storageKey;
  return loadManagedItems(storageKey);
}
export function ensureManagedKindInitialized(kind: ManagedKind) {
  if (!currentManagedItems[kind]) {
    currentManagedItems[kind] = {};
  }
}
export function setCurrentManagedItems(kind:ManagedKind, items:Record<string,ManagedItemV2>) {
  ensureManagedKindInitialized(kind);
  currentManagedItems[kind] = items;
}
export function addManagedItem(kind:ManagedKind, name:string, item:ManagedItemV2|string) {
  ensureManagedKindInitialized(kind);
  const migrated = migrateManagedItem(item);
  migrated.lastEdited = Date.now(); // 新建/更新时自动更新时间戳
  currentManagedItems[kind][name] = migrated;
  saveManagedOverrides(kind);
}
export function deleteManagedItem(kind:ManagedKind, name:string) {
  ensureManagedKindInitialized(kind);
  delete currentManagedItems[kind][name];
  saveManagedOverrides(kind);
}
export function toggleFavorite(kind:ManagedKind, name:string): boolean {
  ensureManagedKindInitialized(kind);
  const item = currentManagedItems[kind][name];
  if (!item) return false;
  item.favorite = !item.favorite;
  item.lastEdited = Date.now();
  saveManagedOverrides(kind);
  return !!item.favorite;
}
export function copyManagedItem(kind:ManagedKind, name:string): string|null {
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
export function getCurrentManagedItems(kind:ManagedKind): Record<string,ManagedItemV2> {
  ensureManagedKindInitialized(kind);
  return currentManagedItems[kind];
}

// ==================== 储藏间自定义 kind 字典 ====================
export const STASH_KINDS_STORAGE_KEY = '_th_stash_kinds_v1';
export type StashKindMeta = { icon: string; label: string; order?: number };

export function loadStashKinds(): Record<string, StashKindMeta> {
  try {
    const raw = localStorage.getItem(STASH_KINDS_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, StashKindMeta>;
  } catch(e) { void e; }
  return {};
}
export function saveStashKinds(kinds: Record<string, StashKindMeta>) {
  try { localStorage.setItem(STASH_KINDS_STORAGE_KEY, JSON.stringify(kinds)); } catch(e) { void e; }
}
export function addStashKind(kindName: string, meta: StashKindMeta) {
  const kinds = loadStashKinds();
  kinds[kindName] = meta;
  saveStashKinds(kinds);
  // 确保 currentManagedItems 中有该 kind 的空对象
  const kindKey = `stash-custom-${kindName}` as ManagedKind;
  if (!currentManagedItems[kindKey]) {
    currentManagedItems[kindKey] = {};
  }
}
export function deleteStashKind(kindName: string): number {
  const oldKind = `stash-custom-${kindName}` as ManagedKind;
  // 反馈1：删除自定义类别时不丢数据——把卡片和标签定义迁移到固定 kind 'stash-uncategorized'
  ensureManagedKindInitialized('stash-uncategorized');
  setCurrentManagedItems('stash-uncategorized', getManagedItems('stash-uncategorized'));
  const oldItems = getManagedItems(oldKind);
  let moved = 0;
  for (const [name, item] of Object.entries(oldItems)) {
    let nm = name;
    let i = 0;
    while (currentManagedItems['stash-uncategorized'][nm]) { i++; nm = `${name} (${i})`; }
    addManagedItem('stash-uncategorized', nm, { desc: item.desc, tags: item.tags ?? [], inject: item.inject, favorite: item.favorite, links: item.links });
    moved++;
  }
  // 标签定义迁移到未分类的标签命名空间（已存在则保留原定义）
  const tags = loadTags();
  const oldKindTags = tags[oldKind];
  if (oldKindTags && Object.keys(oldKindTags).length) {
    if (!tags['stash-uncategorized']) tags['stash-uncategorized'] = {};
    for (const [tagName, tag] of Object.entries(oldKindTags)) {
      if (!tags['stash-uncategorized'][tagName]) tags['stash-uncategorized'][tagName] = tag;
    }
  }
  // 删除类别定义
  const kinds = loadStashKinds();
  delete kinds[kindName];
  saveStashKinds(kinds);
  // 删除旧 kind 的数据与标签命名空间
  const storageKey = getStashKindStorageKey(kindName);
  try { localStorage.removeItem(storageKey); } catch(e) { void e; }
  if (tags[oldKind]) delete tags[oldKind];
  saveTags(tags);
  return moved;
}
export function getStashKindStorageKey(kindName: string): string {
  return `_th_stash_custom_${kindName}_v1`;
}

// ==================== 标签字典 CRUD（A 段只做数据层，UI B 段做）====================
export const TAGS_STORAGE_KEY = '_th_tags_v1';
export const GROUP_COLLAPSED_STORAGE_KEY = '_th_group_collapsed_v1';

export type Tag = { color: string; desc: string; defaultInject?: string };
export type TagsByKind = Record<ManagedKind, Record<string, Tag>>;
export type CollapsedByKind = Record<ManagedKind, Record<string, true>>;

export function loadTags(): TagsByKind {
  try {
    const raw = localStorage.getItem(TAGS_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as TagsByKind;
  } catch(e) { void e; }
  return { location: {}, event: {}, dlc: {}, 'stash-item': {}, 'stash-skill': {}, 'stash-status': {}, 'stash-clothing': {}, 'stash-uncategorized': {} };
}
export function saveTags(tags: TagsByKind) {
  try { localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(tags)); } catch(e) { void e; }
}
export function addTag(kind: ManagedKind, tagName: string, tag: Tag) {
  const tags = loadTags();
  if (!tags[kind]) tags[kind] = {};
  tags[kind][tagName] = tag;
  saveTags(tags);
}
export function deleteTag(kind: ManagedKind, tagName: string) {
  const tags = loadTags();
  if (tags[kind]) delete tags[kind][tagName];
  saveTags(tags);
}
export function renameTag(kind: ManagedKind, oldName: string, newName: string) {
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
export function editTagMeta(kind: ManagedKind, tagName: string, meta: Partial<Tag>) {
  const tags = loadTags();
  if (!tags[kind]) tags[kind] = {};
  tags[kind][tagName] = { ...tags[kind][tagName], ...meta };
  saveTags(tags);
}

// ==================== 物品打标 ====================
export function setItemTags(kind: ManagedKind, itemName: string, tags: string[]) {
  const items = getManagedItems(kind);
  if (items[itemName]) {
    items[itemName].tags = tags.slice(0, 1);
    setCurrentManagedItems(kind, items);
    saveManagedOverrides(kind);
  }
}
export function addItemTag(kind: ManagedKind, itemName: string, tagName: string) {
  const items = getManagedItems(kind);
  if (items[itemName]) {
    items[itemName].tags = tagName ? [tagName] : [];
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
export function removeItemTag(kind: ManagedKind, itemName: string, tagName: string) {
  const items = getManagedItems(kind);
  if (items[itemName] && items[itemName].tags) {
    items[itemName].tags = items[itemName].tags.filter(t => t !== tagName);
    setCurrentManagedItems(kind, items);
    saveManagedOverrides(kind);
  }
}

// ==================== 桶折叠状态 ====================
export function loadBucketCollapsed(): CollapsedByKind {
  try {
    const raw = localStorage.getItem(GROUP_COLLAPSED_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CollapsedByKind;
  } catch(e) { void e; }
  return { location: {}, event: {}, dlc: {}, 'stash-item': {}, 'stash-skill': {}, 'stash-status': {}, 'stash-clothing': {}, 'stash-uncategorized': {} };
}
export function saveBucketCollapsed(collapsed: CollapsedByKind) {
  try { localStorage.setItem(GROUP_COLLAPSED_STORAGE_KEY, JSON.stringify(collapsed)); } catch(e) { void e; }
}
export function getBucketCollapsed(kind: ManagedKind, tagName: string): boolean {
  const collapsed = loadBucketCollapsed();
  return !!collapsed[kind]?.[tagName];
}
export function setBucketCollapsed(kind: ManagedKind, tagName: string, value: boolean) {
  const collapsed = loadBucketCollapsed();
  if (!collapsed[kind]) collapsed[kind] = {};
  if (value) collapsed[kind][tagName] = true;
  else delete collapsed[kind][tagName];
  saveBucketCollapsed(collapsed);
}

// ==================== 统一 kind 配置获取（含自定义 kind 兜底）====================
export function getStashKindCfg(kind: ManagedKind): { icon: string; label: string; storageName: string; storageKey: string; defaultInject: string; prefix: string; bindsWorldbook: boolean } {
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
