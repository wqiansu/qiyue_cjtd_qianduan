// 快照回滚（AI 注入前自动存被覆盖卡片旧值，可回滚）
// key _th_ai_snapshots_v1 = [{ ts, label, kind, snapshots: [{ name, oldItem|null }] }]，最近 N=20。
// oldItem=null 表示该名注入前本地不存在（回滚=删除该卡片）。
import { INIT_LS_KEYS, type ManagedKind } from './config';
import { getManagedItems, addManagedItem, deleteManagedItem, type ManagedItemV2 } from './managed-store';

const LS_SNAPSHOTS = INIT_LS_KEYS.aiSnapshots;
const MAX_SNAPSHOTS = 20;

export type AiSnapshotItem = { name: string; oldItem: ManagedItemV2 | null };
export type AiSnapshot = { ts: number; label: string; kind: ManagedKind; snapshots: AiSnapshotItem[] };

function read(): AiSnapshot[] {
  try {
    const raw = localStorage.getItem(LS_SNAPSHOTS);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr as AiSnapshot[] : [];
  } catch (e) { console.warn('[ai-snapshots] 读快照失败', e); return []; }
}
function write(list: AiSnapshot[]): void {
  try { localStorage.setItem(LS_SNAPSHOTS, JSON.stringify(list.slice(0, MAX_SNAPSHOTS))); }
  catch (e) { console.warn('[ai-snapshots] 写快照失败', e); }
}

export function getSnapshots(): AiSnapshot[] { return read(); }

// 注入前调用：记录将写入卡片被覆盖前的旧值（不存在记 null）。
export function pushSnapshot(kind: ManagedKind, names: string[], label: string): void {
  if (!names.length) return;
  const items = getManagedItems(kind);
  const snapshots: AiSnapshotItem[] = names.map(name => ({
    name,
    oldItem: items[name] ? JSON.parse(JSON.stringify(items[name])) as ManagedItemV2 : null,
  }));
  const list = read();
  list.unshift({ ts: Date.now(), label, kind, snapshots });
  write(list);
}

export function rollbackSnapshot(ts: number): { restored: number; deleted: number } {
  const list = read();
  const snap = list.find(s => s.ts === ts);
  if (!snap) return { restored: 0, deleted: 0 };
  let restored = 0, deleted = 0;
  for (const s of snap.snapshots) {
    if (s.oldItem) { addManagedItem(snap.kind, s.name, s.oldItem); restored++; }
    else { deleteManagedItem(snap.kind, s.name); deleted++; }
  }
  return { restored, deleted };
}

export function deleteSnapshot(ts: number): void {
  write(read().filter(s => s.ts !== ts));
}
export function clearSnapshots(): void { write([]); }
