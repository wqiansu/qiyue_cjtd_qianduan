// 批次 9 / 编号 15：变量变化审核 + 快照系统（数据层）
// 不依赖 status-bar-init.ts 内部函数，通过 configureReview() 注入依赖
// ================================================================
// 关键设计：
// - 事后回滚：审核拒绝/修改 → Mvu.replaceMvuData 显式写回
// - 防递归：replaceMvuData 会再次触发 VARIABLE_UPDATE_ENDED 引起无限循环
//   → 用 withReviewGuard(fn) 包裹写回逻辑，flag=true 时宿主 handler 早返回
// - 依赖注入：Mvu API + currentMessageId 通过 configureReview() 注入
//   （不直接 import Mvu，避免与 status-bar-init.ts 内部循环依赖）

import { get as _get, set as _set, isEqual as _isEqual } from 'lodash';

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'edited';

export interface ReviewItem {
  id: string;
  path: string;
  oldValue: any;
  newValue: any;
  diff: any;
  timestamp: number;
  messageId: number;
  status: ReviewStatus;
  editedValue?: any;
}

export interface SnapshotItem {
  id: string;
  stat_data: any;
  messageId: number;
  timestamp: number;
}

// ============ 内部状态 ============
let reviewQueue: ReviewItem[] = [];
let snapshotQueue: SnapshotItem[] = [];
const listeners: Set<() => void> = new Set();

let __reviewWriteGuard = false;
// 批次 9/Step B：审核基线（深拷贝快照，外部禁止 mutate）。
// 用途：collectStatDataChange() 拿它当 oldData；poll/event handler 拿它做 isEqual 短路防重复。
let __reviewBaseline: Record<string, any> | null = null;

// 批次 9/Step E：唯一版本，key 不带 _v2 后缀（PROGRESS §7 Step E）。
// 旧 localStorage 中的 _v2 数据用户清空即可（首次构建时如果有，重置为初始空队列，
// 数据量 <100 条审核 + 10 快照，可接受丢失）。
const LS_REVIEW_KEY = '_th_review_queue';
const LS_SNAPSHOT_KEY = '_th_snapshot';
const REVIEW_QUEUE_MAX = 100;
const REVIEW_PERSIST_MAX = 50;
const SNAPSHOT_MAX = 10;

// ============ 依赖注入 ============
let getMvu: () => any = () => null;
let getCurrentMessageId: () => number = () => -1;
let onWriteback: () => void = () => {};

export function configureReview(opts: {
  getMvu: () => any;
  getCurrentMessageId: () => number;
  onWriteback?: () => void;
}): void {
  getMvu = opts.getMvu;
  getCurrentMessageId = opts.getCurrentMessageId;
  if (opts.onWriteback) onWriteback = opts.onWriteback;
  loadFromStorage();
}

// ============ 持久化 ============
function loadFromStorage(): void {
  try {
    const r = localStorage.getItem(LS_REVIEW_KEY);
    if (r) reviewQueue = JSON.parse(r);
    if (!Array.isArray(reviewQueue)) reviewQueue = [];
  } catch (e) { void e; reviewQueue = []; }
  try {
    const s = localStorage.getItem(LS_SNAPSHOT_KEY);
    if (s) snapshotQueue = JSON.parse(s);
    if (!Array.isArray(snapshotQueue)) snapshotQueue = [];
  } catch (e) { void e; snapshotQueue = []; }
}

function saveReviewToStorage(): void {
  try {
    const persisted = reviewQueue.slice(-REVIEW_PERSIST_MAX);
    localStorage.setItem(LS_REVIEW_KEY, JSON.stringify(persisted));
  } catch (e) { void e; }
}

function saveSnapshotToStorage(): void {
  try {
    localStorage.setItem(LS_SNAPSHOT_KEY, JSON.stringify(snapshotQueue));
  } catch (e) { void e; }
}

// ============ 监听器订阅 ============
export function subscribeReview(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function notify(): void {
  listeners.forEach(fn => { try { fn(); } catch (e) { void e; } });
}

// ============ 防递归 ============
export function withReviewGuard<T>(fn: () => T | Promise<T>): T | Promise<T> {
  if (__reviewWriteGuard) {
    return fn();
  }
  __reviewWriteGuard = true;
  try {
    const result = fn();
    if (result && typeof (result as any).then === 'function') {
      return (result as Promise<T>).finally(() => { __reviewWriteGuard = false; });
    }
    __reviewWriteGuard = false;
    return result;
  } catch (e) {
    __reviewWriteGuard = false;
    throw e;
  }
}

export function isReviewWriting(): boolean {
  return __reviewWriteGuard;
}

// ============ 审核基线（深拷贝快照） ============
// 写入基线：用于下次 diff 的 oldData，以及防 poll/event 重复采集。
// 必须是深拷贝快照：本地编辑会原地 mutate currentData，引用基线会被污染（PROGRESS 5.7）。
export function setReviewBaseline(data: Record<string, any> | null | undefined): void {
  if (data == null) { __reviewBaseline = null; return; }
  try { __reviewBaseline = JSON.parse(JSON.stringify(data)); }
  catch (e) { void e; try { __reviewBaseline = _.cloneDeep(data); } catch (e2) { void e2; __reviewBaseline = data as any; } }
}

export function getReviewBaseline(): Record<string, any> | null {
  return __reviewBaseline;
}

if (typeof window !== 'undefined') {
  (window as any).__isReviewWriting = () => __reviewWriteGuard;
}

// ============ 队列操作 ============
export function addReviewItems(items: ReviewItem[]): void {
  if (!items.length) return;
  reviewQueue.push(...items);
  if (reviewQueue.length > REVIEW_QUEUE_MAX) {
    reviewQueue = reviewQueue.slice(-REVIEW_QUEUE_MAX);
  }
  saveReviewToStorage();
  notify();
}

export function removeItemFromQueue(id: string): void {
  const before = reviewQueue.length;
  reviewQueue = reviewQueue.filter(i => i.id !== id);
  if (reviewQueue.length !== before) {
    saveReviewToStorage();
    notify();
  }
}

export function getReviewQueue(): ReviewItem[] {
  return reviewQueue.slice();
}

export function getPendingItems(): ReviewItem[] {
  return reviewQueue.filter(i => i.status === 'pending');
}

export function getPendingCount(): number {
  return getPendingItems().length;
}

// ============ 批量操作 ============
export function approveAllPending(): void {
  const pending = getPendingItems();
  if (!pending.length) return;
  const ids = new Set(pending.map(i => i.id));
  pending.forEach(i => { i.status = 'approved'; });
  reviewQueue = reviewQueue.filter(i => !ids.has(i.id));
  saveReviewToStorage();
  notify();
}

export async function rejectAllPending(): Promise<void> {
  const pending = getPendingItems();
  if (!pending.length) return;
  const ids = new Set(pending.map(i => i.id));
  const mvu = getMvu();
  const msgId = getCurrentMessageId();
  pending.forEach(i => { i.status = 'rejected'; });
  if (!mvu?.getMvuData || !mvu?.replaceMvuData) {
    reviewQueue = reviewQueue.filter(i => !ids.has(i.id));
    saveReviewToStorage();
    notify();
    return;
  }
  await withReviewGuard(async () => {
    const currentData = mvu.getMvuData({ type: 'message', message_id: msgId });
    const statData = _get(currentData, 'stat_data', {});
    pending.forEach(i => { _set(statData, i.path, i.oldValue); });
    await mvu.replaceMvuData(currentData, { type: 'message', message_id: msgId });
    onWriteback();
  });
  reviewQueue = reviewQueue.filter(i => !ids.has(i.id));
  saveReviewToStorage();
  notify();
}

// ============ 单条操作 ============
export async function applyReviewItem(
  id: string,
  action: 'approve' | 'reject' | 'edit',
  editedValue?: any
): Promise<void> {
  const item = reviewQueue.find(i => i.id === id);
  if (!item) return;
  if (action === 'approve') {
    item.status = 'approved';
    saveReviewToStorage();
    notify();
    removeItemFromQueue(id);
    return;
  }
  const mvu = getMvu();
  const msgId = getCurrentMessageId();
  if (!mvu?.getMvuData || !mvu?.replaceMvuData) {
    item.status = action === 'reject' ? 'rejected' : 'edited';
    if (action === 'edit') item.editedValue = editedValue;
    saveReviewToStorage();
    notify();
    removeItemFromQueue(id);
    return;
  }
  await withReviewGuard(async () => {
    const currentData = mvu.getMvuData({ type: 'message', message_id: msgId });
    const statData = _get(currentData, 'stat_data', {});
    const newValue = action === 'reject' ? item.oldValue : editedValue;
    _set(statData, item.path, newValue);
    await mvu.replaceMvuData(currentData, { type: 'message', message_id: msgId });
    item.status = action === 'reject' ? 'rejected' : 'edited';
    if (action === 'edit') item.editedValue = editedValue;
    onWriteback();
  });
  saveReviewToStorage();
  notify();
  removeItemFromQueue(id);
}

// ============ 快照 ============
export function addSnapshot(statData: any, messageId: number, timestamp: number): void {
  const snapshot: SnapshotItem = {
    id: `s_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
    stat_data: JSON.parse(JSON.stringify(statData)),
    messageId,
    timestamp,
  };
  snapshotQueue.push(snapshot);
  if (snapshotQueue.length > SNAPSHOT_MAX) {
    snapshotQueue = snapshotQueue.slice(-SNAPSHOT_MAX);
  }
  saveSnapshotToStorage();
  notify();
}

export function getSnapshots(): SnapshotItem[] {
  return snapshotQueue.slice();
}

export function deleteSnapshot(id: string): void {
  const before = snapshotQueue.length;
  snapshotQueue = snapshotQueue.filter(s => s.id !== id);
  if (snapshotQueue.length !== before) {
    saveSnapshotToStorage();
    notify();
  }
}

export async function restoreSnapshot(id: string): Promise<void> {
  const snap = snapshotQueue.find(s => s.id === id);
  if (!snap) return;
  const mvu = getMvu();
  const msgId = getCurrentMessageId();
  if (!mvu?.replaceMvuData) return;
  await withReviewGuard(async () => {
    const currentData = mvu.getMvuData({ type: 'message', message_id: msgId });
    const newData = { ...currentData, stat_data: JSON.parse(JSON.stringify(snap.stat_data)) };
    await mvu.replaceMvuData(newData, { type: 'message', message_id: msgId });
    onWriteback();
  });
}

// ============ 清空 ============
export function clearAll(): void {
  reviewQueue = [];
  snapshotQueue = [];
  saveReviewToStorage();
  saveSnapshotToStorage();
  notify();
}

// ============ 工具：diff statData ============
export function diffStatData(newData: any, oldData: any, messageId: number): ReviewItem[] {
  const items: ReviewItem[] = [];
  const timestamp = Date.now();
  walk(newData, oldData, '', items, timestamp, messageId);
  return items;
}

// ============ 统一审核变更采集（PROGRESS §7 Step B 核心） ============
// 用 setReviewBaseline() 写入的深拷贝快照作 oldData，与 newData 比对后入队。
// 然后视情况追加异步快照，最后把基线同步到 newData —— 后续 poll/event
// 因为基线已等于 newData 会自动 isEqual 短路，不再重复生成条目。
//
// 调用方：
//   - 本地编辑保存（applyEdit / commitAdd / 丢弃物品 / 在场切换）后，
//     在 saveData(currentData) 之后立刻调用一次。
//   - poll tick / event handler（保留为兜底）直接调用同一 helper，
//     不会因为基线已同步而重复。
//
// opts.snapshot: 是否异步追加快照（默认 true 与既有行为一致；批量编辑可传 false 抑制刷屏）。
// opts.label:    调试用来源标签（不影响逻辑，可选）。
export interface CollectOptions {
  snapshot?: boolean;
  label?: string;
}
export function collectStatDataChange(newData: any, opts: CollectOptions = {}): number {
  const oldData = __reviewBaseline;
  if (newData == null) { setReviewBaseline(null); return 0; }
  const snapshot = opts.snapshot !== false;
  const label = opts.label;
  let msgId = -1;
  try { msgId = getCurrentMessageId(); } catch (e) { void e; }
  let count = 0;
  try {
    if (oldData && !_isEqual(newData, oldData)) {
      const items = diffStatData(newData, oldData, msgId);
      if (items.length) {
        addReviewItems(items);
        count = items.length;
        if (label) { try { console.debug('[review] collect', label, items.length, 'items'); } catch (e) { void e; } }
      }
    }
  } catch (e) { void e; }
  if (snapshot && count > 0) {
    try {
      const snapMsgId = msgId;
      setTimeout(() => { try { addSnapshot(newData, snapMsgId, Date.now()); } catch (e) { void e; } }, 0);
    } catch (e) { void e; }
  }
  setReviewBaseline(newData);
  return count;
}

function walk(newObj: any, oldObj: any, prefix: string, out: ReviewItem[], ts: number, msgId: number): void {
  if (_isEqual(newObj, oldObj)) return;
  if (isPlainObject(newObj) && isPlainObject(oldObj)) {
    const allKeys = new Set([...Object.keys(newObj), ...Object.keys(oldObj)]);
    allKeys.forEach(k => {
      const childPath = prefix ? `${prefix}.${k}` : k;
      walk(_get(newObj, k), _get(oldObj, k), childPath, out, ts, msgId);
    });
    return;
  }
  if (Array.isArray(newObj) && Array.isArray(oldObj)) {
    const maxLen = Math.max(newObj.length, oldObj.length);
    for (let i = 0; i < maxLen; i++) {
      const childPath = `${prefix}.${i}`;
      walk(newObj[i], oldObj[i], childPath, out, ts, msgId);
    }
    return;
  }
  const id = `r_${ts}_${Math.random().toString(36).slice(2, 10)}`;
  const diff = (typeof newObj === 'number' && typeof oldObj === 'number') ? newObj - oldObj : undefined;
  out.push({
    id,
    path: prefix,
    oldValue: oldObj,
    newValue: newObj,
    diff,
    timestamp: ts,
    messageId: msgId,
    status: 'pending',
  });
}

function isPlainObject(v: any): boolean {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
}
