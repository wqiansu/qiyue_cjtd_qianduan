import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

export type DiaryEntry = {
  id: string;
  title: string;
  body: string;
  author: string;           // 落款（玩家名 / 角色名）
  pov: 'player' | 'char';
  dateLabel: string;        // 文字日期，如「2026年6月27日 星期五」
  weather?: string;
  mood?: string;
  locked?: boolean;         // 私密锁：锁定的日记永不进世界书注入/同步
  summary?: string;
  book?: string;
  tags: string[];
  ts: number;
};

export const DIARY_MOODS: { id: string; label: string; emoji: string; color: string }[] = [
  { id: 'happy', label: '愉悦', emoji: '🥰', color: 'pink' },
  { id: 'calm', label: '平静', emoji: '😌', color: 'sky' },
  { id: 'meh', label: '一般', emoji: '😐', color: 'lav' },
  { id: 'down', label: '低落', emoji: '😔', color: 'mint' },
  { id: 'cry', label: '难过', emoji: '😢', color: 'rose' },
  { id: 'anxious', label: '焦灼', emoji: '😣', color: 'amber' },
  { id: 'longing', label: '思念', emoji: '🥺', color: 'pink' },
  { id: 'shy', label: '羞赧', emoji: '😳', color: 'rose' },
  { id: 'angry', label: '愤懑', emoji: '😠', color: 'amber' },
  { id: 'relieved', label: '释然', emoji: '😮‍💨', color: 'sky' },
];
export function moodOf(id?: string): { id: string; label: string; emoji: string; color: string } | undefined {
  return id ? DIARY_MOODS.find(m => m.id === id) : undefined;
}

export type DiarySettings = {
  useFloors: boolean;
  floorCount: number;
  useWorldbook: boolean;
  worldbookEntryKeys: string[];
  autoInterval: number;        // 每 N 楼自动写一篇角色日记，0=关
  lastFloor: number;
  wordTarget: number;
  defaultPov: string;
  ecoErotic: number;           // 色情度浓度 0-100
  ecoCarnal: number;           // 肉欲度浓度 0-100
  ecoDaily: number;            // 日常度浓度 0-100
  lockExcludeSync: boolean;    // 私密锁日记不进世界书注入/同步（默认开）
  syncEnabled: boolean;
};
export const DEFAULT_DIARY_SETTINGS: DiarySettings = {
  useFloors: true, floorCount: 8, useWorldbook: false, worldbookEntryKeys: [],
  autoInterval: 0, lastFloor: 0, wordTarget: 1000, defaultPov: 'char',
  ecoErotic: 50, ecoCarnal: 50, ecoDaily: 50, lockExcludeSync: true, syncEnabled: false,
};

type DiaryData = { entries: DiaryEntry[]; settings?: DiarySettings };

function rid(p: string): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

function read(): DiaryData {
  const d = readWorldJson<DiaryData>(WORLD_LS_KEYS.diary, { entries: [] });
  if (!d || typeof d !== 'object') return { entries: [] };
  if (!Array.isArray(d.entries)) d.entries = [];
  return d;
}
function write(d: DiaryData): void { writeWorldJson(WORLD_LS_KEYS.diary, d); }

export function getEntries(): DiaryEntry[] { return read().entries.slice().sort((a, b) => b.ts - a.ts); }
export function getEntry(id: string): DiaryEntry | undefined { return read().entries.find(e => e.id === id); }

export function getAllTags(): string[] {
  const s = new Set<string>();
  read().entries.forEach(e => e.tags.forEach(t => s.add(t)));
  return [...s];
}
export function getAllAuthors(): string[] {
  const s = new Set<string>();
  read().entries.forEach(e => s.add(e.author));
  return [...s];
}
export function getAllBooks(): string[] {
  const s = new Set<string>();
  read().entries.forEach(e => { if (e.book && e.book.trim()) s.add(e.book.trim()); });
  return [...s];
}
export function randomEntry(includeLocked = false): DiaryEntry | undefined {
  const list = read().entries.filter(e => includeLocked || !e.locked);
  return list.length ? list[Math.floor(Math.random() * list.length)] : undefined;
}

export function addEntry(p: { title: string; body: string; author: string; pov: 'player' | 'char'; dateLabel?: string; weather?: string; mood?: string; locked?: boolean; tags?: string[]; book?: string }): DiaryEntry {
  const d = read();
  const e: DiaryEntry = {
    id: rid('dy'), title: p.title.slice(0, 80) || '（无题）', body: p.body, author: p.author || '我',
    pov: p.pov, dateLabel: p.dateLabel || new Date().toLocaleDateString('zh-CN'), weather: p.weather,
    mood: p.mood, locked: !!p.locked, book: p.book?.trim() || undefined,
    tags: Array.isArray(p.tags) ? p.tags : [], ts: Date.now(),
  };
  d.entries.unshift(e);
  write(d);
  return e;
}
export function toggleLock(id: string): boolean {
  const d = read();
  const e = d.entries.find(x => x.id === id);
  if (!e) return false;
  e.locked = !e.locked;
  write(d);
  return !!e.locked;
}
export function getMoodTrail(limit = 12): { mood: string; ts: number }[] {
  return read().entries.filter(e => e.mood).slice(0, limit).reverse().map(e => ({ mood: e.mood!, ts: e.ts }));
}
export function getTagCloud(): { tag: string; n: number }[] {
  const m = new Map<string, number>();
  read().entries.forEach(e => e.tags.forEach(t => m.set(t, (m.get(t) || 0) + 1)));
  return [...m.entries()].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n);
}
export function updateEntry(id: string, patch: Partial<DiaryEntry>): void {
  const d = read();
  const i = d.entries.findIndex(e => e.id === id);
  if (i < 0) return;
  d.entries[i] = { ...d.entries[i], ...patch };
  write(d);
}
export function deleteEntry(id: string): void {
  const d = read();
  d.entries = d.entries.filter(e => e.id !== id);
  write(d);
}
export function clearAll(): void { const d = read(); write({ entries: [], settings: d.settings }); }

export function getDiarySettings(): DiarySettings {
  const d = read();
  return { ...DEFAULT_DIARY_SETTINGS, ...(d.settings || {}) };
}
export function updateDiarySettings(patch: Partial<DiarySettings>): DiarySettings {
  const d = read();
  d.settings = { ...DEFAULT_DIARY_SETTINGS, ...(d.settings || {}), ...patch };
  write(d);
  return d.settings;
}
