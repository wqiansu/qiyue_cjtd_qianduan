// ============================================================================
// place-store.ts — 地点演化独立存储
//
// 地点是世界演化里与对象/世界态/订阅/节拍 并列的独立 tab。每个地点绑定一条「地点」
// 世界书条目，推演该地点镜头外正在发生什么（谁常来、氛围如何），绝不把正文主角拉进来演戏。
//
// 数据落 _th_world_places_v1（纳入 _th_world_ 前缀整包导出）。纯数据 + 纯函数。
// 历史迁移：首次读取时，把旧 _th_world_wstate_v1.places 搬过来（一次性），之后世界态不再存 places。
// ============================================================================
import { readWorldJson, writeWorldJson, WORLD_LS_KEYS } from './world-store';

export const PLACES_LS_KEY = '_th_world_places_v1';
const CAP_PLACES = 24;

export type WPlace = {
  name: string;               // 地点名（对应世界书地点条目名）
  busy: string;               // 这地方最近在发生什么/谁常来
  mood: string;               // 此处的氛围
  who?: string;               // 常驻/近来出没的人（取自设定花名册，非正文主角）
  wbKey?: string;             // 绑定的世界书条目 key（book␟entry），推演时注入该地点设定
  updatedAt?: number;
};

export type PlacesState = {
  places: WPlace[];
  round: number;              // 地点整体推演轮次
  migrated?: boolean;         // 是否已从旧 wstate.places 迁移过
  updatedAt: number;
};

function blank(): PlacesState { return { places: [], round: 0, migrated: false, updatedAt: 0 }; }

function normPlace(x: any): WPlace {
  return {
    name: String(x?.name || ''), busy: String(x?.busy || ''), mood: String(x?.mood || ''),
    who: x?.who ? String(x.who) : undefined,
    wbKey: x?.wbKey ? String(x.wbKey) : undefined,
    updatedAt: typeof x?.updatedAt === 'number' ? x.updatedAt : undefined,
  };
}
function normalize(s: any): PlacesState {
  const b = blank();
  if (!s || typeof s !== 'object') return b;
  b.places = (Array.isArray(s.places) ? s.places : []).slice(0, CAP_PLACES).map(normPlace).filter((p: WPlace) => p.name);
  b.round = typeof s.round === 'number' ? s.round : 0;
  b.migrated = !!s.migrated;
  b.updatedAt = typeof s.updatedAt === 'number' ? s.updatedAt : 0;
  return b;
}

let _cache: PlacesState | null = null;
let _placesRaw: string | null = null;

// 历史迁移：把旧世界态里的 places 搬到独立存储（只做一次）。
function migrateFromWstate(cur: PlacesState): PlacesState {
  if (cur.migrated) return cur;
  try {
    const ws = readWorldJson<any>(WORLD_LS_KEYS.wstate, null);
    const old = ws && Array.isArray(ws.places) ? ws.places : [];
    if (old.length) {
      const have = new Set(cur.places.map(p => p.name));
      for (const p of old) { const np = normPlace(p); if (np.name && !have.has(np.name)) { cur.places.push(np); have.add(np.name); } }
    }
  } catch (e) { void e; }
  cur.migrated = true;
  cur.places = cur.places.slice(0, CAP_PLACES);
  return cur;
}

export function getPlacesState(): PlacesState {
  const raw = localStorage.getItem(PLACES_LS_KEY);
  if (_cache && raw === _placesRaw) return _cache;
  _placesRaw = raw;
  let s = normalize(readWorldJson<any>(PLACES_LS_KEY, null));
  s = migrateFromWstate(s);
  _cache = s;
  // 迁移后落盘，标记 migrated，避免每次都读旧 wstate
  writeWorldJson(PLACES_LS_KEY, s);
  _placesRaw = localStorage.getItem(PLACES_LS_KEY);
  return s;
}
export function savePlacesState(s: PlacesState): void {
  s.updatedAt = Date.now();
  const n = normalize({ ...s, migrated: true });
  _cache = n; writeWorldJson(PLACES_LS_KEY, n);
  _placesRaw = localStorage.getItem(PLACES_LS_KEY);
}
export function getPlaces(): WPlace[] { return getPlacesState().places; }

// ---- 手动管理 ----
export function addPlace(name: string, wbKey?: string): void {
  const s = getPlacesState();
  const hit = s.places.find(p => p.name === name);
  if (hit) { if (wbKey) hit.wbKey = wbKey; savePlacesState(s); return; }
  s.places = [...s.places, { name, busy: '', mood: '', wbKey }].slice(0, CAP_PLACES);
  savePlacesState(s);
}
export function removePlace(name: string): void {
  const s = getPlacesState();
  s.places = s.places.filter(p => p.name !== name);
  savePlacesState(s);
}
export function editPlace(name: string, patch: Partial<WPlace>): void {
  const s = getPlacesState();
  const hit = s.places.find(p => p.name === name);
  if (hit) { Object.assign(hit, patch); hit.updatedAt = Date.now(); savePlacesState(s); }
}

// ---- 合并 AI 推演结果（同名覆盖 busy/mood/who，保留 wbKey）----
export function mergePlacesUpdate(update: any): WPlace[] {
  const s = getPlacesState();
  const incoming = Array.isArray(update?.places) ? update.places : (Array.isArray(update) ? update : []);
  for (const raw of incoming) {
    const np = normPlace(raw);
    if (!np.name) continue;
    const hit = s.places.find(p => p.name === np.name);
    if (hit) {
      if (np.busy) hit.busy = np.busy;
      if (np.mood) hit.mood = np.mood;
      if (np.who) hit.who = np.who;
      hit.updatedAt = Date.now();
    } else {
      // 允许 AI 补充未绑定的场景地点
      s.places.push({ ...np, updatedAt: Date.now() });
    }
  }
  s.places = s.places.slice(0, CAP_PLACES);
  savePlacesState(s);
  return s.places;
}

export function hasPlaces(): boolean { return getPlaces().length > 0; }
export function resetPlaces(): void { savePlacesState(blank()); }

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_places__ = { getPlaces, addPlace, removePlace, editPlace, mergePlacesUpdate };
} catch (e) { void e; }
