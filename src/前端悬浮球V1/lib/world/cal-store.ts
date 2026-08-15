import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

export const CAL_MEMO_TYPES: { id: string; label: string; color: string }[] = [
  { id: 'daily', label: '日常', color: 'sky' },
  { id: 'work', label: '工作', color: 'lav' },
  { id: 'date', label: '约会', color: 'pink' },
  { id: 'tryst', label: '约局', color: 'rose' },
  { id: 'birthday', label: '生日', color: 'gold' },
  { id: 'anniversary', label: '纪念日', color: 'rose' },
  { id: 'festival', label: '节日', color: 'gold' },
  { id: 'world', label: '世界事件', color: 'lav' },
  { id: 'study', label: '学习', color: 'mint' },
  { id: 'travel', label: '出行', color: 'sky' },
  { id: 'health', label: '健康', color: 'mint' },
  { id: 'money', label: '账单', color: 'gold' },
  { id: 'event', label: '活动', color: 'lav' },
];
export function memoTypeLabel(id: string): string { return CAL_MEMO_TYPES.find(t => t.id === id)?.label || '日常'; }
export function memoTypeColor(id: string): string { return CAL_MEMO_TYPES.find(t => t.id === id)?.color || 'sky'; }
export function memoTypeByLabel(label: string): string { return CAL_MEMO_TYPES.find(t => t.label === label)?.id || 'daily'; }

export type CalMemo = {
  id: string;
  dateKey: string;          // YYYY-MM-DD
  time: string;             // HH:mm（可空）
  title: string;
  type: string;             // CAL_MEMO_TYPES 之一的 id
  done?: boolean;
  source: 'manual' | 'ai' | 'external';   // external=其它 app 推来的约局/事件
  sourceApp?: string;
  sourceLabel?: string;
  note?: string;
  createdAt: number;
};

export type CalSettings = {
  useFloors: boolean;
  floorCount: number;
  useWorldbook: boolean;
  worldbookEntryKeys: string[];
  autoInterval: number;        // 每 N 楼自动规划一次，0=关
  lastFloor: number;
  weekStart: number;           // 周起始日：0=周日 / 1=周一
  ecoErotic: number;           // 色情度浓度 0-200（100-200 为加强区）
  ecoCarnal: number;           // 肉欲度浓度 0-200（100-200 为加强区）
  ecoDaily: number;            // 日常度浓度 0-200（100-200 为加强区）
  festivalFromWb: boolean;     // 节日纪元从绑定世界书提取
  aggregateExternal: boolean;  // 聚合其它 app 推来的约局/事件
  memoryEnabled: boolean;
  syncEnabled: boolean;
};
export const DEFAULT_CAL_SETTINGS: CalSettings = {
  useFloors: true, floorCount: 8, useWorldbook: false, worldbookEntryKeys: [],
  autoInterval: 0, lastFloor: 0, weekStart: 0,
  ecoErotic: 50, ecoCarnal: 50, ecoDaily: 50, festivalFromWb: true, aggregateExternal: true,
  memoryEnabled: true, syncEnabled: false,
};

type CalData = { memos: CalMemo[]; settings?: CalSettings };

function rid(p: string): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }
function pad2(n: number): string { return n < 10 ? '0' + n : String(n); }

function read(): CalData {
  const d = readWorldJson<CalData>(WORLD_LS_KEYS.cal, { memos: [] });
  if (!d || typeof d !== 'object') return { memos: [] };
  if (!Array.isArray(d.memos)) d.memos = [];
  return d;
}
function write(d: CalData): void { writeWorldJson(WORLD_LS_KEYS.cal, d); }

export function getMemos(): CalMemo[] { return read().memos; }
export function getMemosByDate(dateKey: string): CalMemo[] {
  return read().memos.filter(m => m.dateKey === dateKey).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
}
export function getDatesWithMemos(): Set<string> { return new Set(read().memos.map(m => m.dateKey)); }

export function addMemo(p: { dateKey: string; time?: string; title: string; type?: string; source?: 'manual' | 'ai'; note?: string }): CalMemo {
  const d = read();
  const m: CalMemo = {
    id: rid('cm'), dateKey: p.dateKey, time: (p.time || '').slice(0, 5), title: p.title.slice(0, 160),
    type: p.type || 'daily', done: false, source: p.source || 'manual', note: p.note, createdAt: Date.now(),
  };
  d.memos.push(m);
  write(d);
  return m;
}
// 批量新增（AI），去重：同 日期+时间+标题 视为重复
export function addMemosBulk(list: { dateKey: string; time?: string; title: string; type?: string; note?: string }[]): number {
  const d = read();
  let added = 0;
  for (const p of list) {
    if (!p.title || !p.dateKey) continue;
    const dup = d.memos.some(m => m.dateKey === p.dateKey && m.time === (p.time || '').slice(0, 5) && m.title === p.title.slice(0, 160));
    if (dup) continue;
    d.memos.push({ id: rid('cm'), dateKey: p.dateKey, time: (p.time || '').slice(0, 5), title: p.title.slice(0, 160), type: p.type || 'daily', done: false, source: 'ai', note: p.note, createdAt: Date.now() });
    added++;
  }
  write(d);
  return added;
}
// 约局提醒聚合——其它 app 把事件推进日历。去重：同 来源app+日期+标题 视为重复
export function pushCalendarEvent(p: {
  dateKey: string; time?: string; title: string; type?: string;
  sourceApp: string; sourceLabel?: string; note?: string;
}): CalMemo | null {
  if (!p.title || !p.dateKey) return null;
  const d = read();
  const time = (p.time || '').slice(0, 5);
  const title = p.title.slice(0, 160);
  const dup = d.memos.some(m => m.sourceApp === p.sourceApp && m.dateKey === p.dateKey && m.title === title);
  if (dup) return null;
  const m: CalMemo = {
    id: rid('cm'), dateKey: p.dateKey, time, title,
    type: p.type || 'tryst', done: false, source: 'external',
    sourceApp: p.sourceApp, sourceLabel: p.sourceLabel, note: p.note,
    createdAt: Date.now(),
  };
  d.memos.push(m);
  write(d);
  return m;
}
export function getMemosOfMonth(year: number, month: number): CalMemo[] {
  const pre = `${year}-${pad2(month)}-`;
  return read().memos.filter(m => m.dateKey.startsWith(pre))
    .sort((a, b) => (a.dateKey + (a.time || '99:99')).localeCompare(b.dateKey + (b.time || '99:99')));
}
export function getUpcomingMemos(fromDateKey: string, limit = 60): CalMemo[] {
  return read().memos.filter(m => m.dateKey >= fromDateKey)
    .sort((a, b) => (a.dateKey + (a.time || '99:99')).localeCompare(b.dateKey + (b.time || '99:99')))
    .slice(0, limit);
}

export function updateMemo(id: string, patch: Partial<CalMemo>): void {
  const d = read();
  const i = d.memos.findIndex(m => m.id === id);
  if (i < 0) return;
  d.memos[i] = { ...d.memos[i], ...patch };
  write(d);
}
export function deleteMemo(id: string): void {
  const d = read();
  d.memos = d.memos.filter(m => m.id !== id);
  write(d);
}
export function toggleDone(id: string): void {
  const d = read(); const m = d.memos.find(x => x.id === id); if (!m) return;
  m.done = !m.done; write(d);
}
export function clearAll(): void { const d = read(); write({ memos: [], settings: d.settings }); }

export function getCalSettings(): CalSettings {
  const d = read();
  return { ...DEFAULT_CAL_SETTINGS, ...(d.settings || {}) };
}
export function updateCalSettings(patch: Partial<CalSettings>): CalSettings {
  const d = read();
  d.settings = { ...DEFAULT_CAL_SETTINGS, ...(d.settings || {}), ...patch };
  write(d);
  return d.settings;
}

// 内置节日唯一数据源为 festival-table.ts（世界演化与日历 app 共读同一份）
import { FESTIVALS, festivalsOn, festivalTitleOn } from './festival-table';
export const CAL_HOLIDAYS: { month: number; day: number; title: string }[] =
  FESTIVALS.map(f => ({ month: f.month, day: f.day, title: f.title }));
export function holidayOf(month: number, day: number): string | undefined {
  return festivalTitleOn(month, day);
}
export function holidaysOf(month: number, day: number): { title: string; category: string; ambience: string; duration?: number }[] {
  return festivalsOn(month, day).map(f => ({ title: f.title, category: f.category, ambience: f.ambience, duration: f.duration }));
}
