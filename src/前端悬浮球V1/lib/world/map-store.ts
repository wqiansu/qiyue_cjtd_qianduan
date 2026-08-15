// ============================================================================
// map-store.ts — 地图的四份本地存储。
// 四个 key 都以 _th_map_ 开头，登记进 config.INIT_LS_KEYS.mapKeys 才会进整包导出。
// ============================================================================

export const MAP_LS_KEYS = {
  /* v2:v1 是旧世界单位(2400×1300),改尺寸后坐标会落错位。 */
  layout: '_th_map_layout_v2',
  log: '_th_map_log_v1',
  art: '_th_map_art_v1',
  cfg: '_th_map_cfg_v1',
} as const;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch (e) { void e; return fallback; }
}
function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { void e; }
}

// ---------------------------------------------------------------- layout
/** 玩家拖拽后的坐标覆盖。键是地点全名，缺键就用种子推导值。 */
export type MapLayout = {
  pos: Record<string, { x: number; y: number }>;
  cam?: { x: number; y: number; s: number };
  updatedAt: number;
};

let _layout: MapLayout | null = null;

function normLayout(s: any): MapLayout {
  const out: MapLayout = { pos: {}, updatedAt: 0 };
  if (!s || typeof s !== 'object') return out;
  const p = s.pos;
  if (p && typeof p === 'object') {
    for (const k of Object.keys(p)) {
      const v = p[k];
      if (v && typeof v.x === 'number' && typeof v.y === 'number') out.pos[k] = { x: v.x, y: v.y };
    }
  }
  const c = s.cam;
  if (c && typeof c.x === 'number' && typeof c.y === 'number' && typeof c.s === 'number') {
    out.cam = { x: c.x, y: c.y, s: c.s };
  }
  out.updatedAt = typeof s.updatedAt === 'number' ? s.updatedAt : 0;
  return out;
}

export function getMapLayout(): MapLayout {
  if (!_layout) _layout = normLayout(readJson<any>(MAP_LS_KEYS.layout, null));
  return _layout;
}
export function saveMapLayout(s: MapLayout): void {
  s.updatedAt = Date.now();
  _layout = normLayout(s);
  writeJson(MAP_LS_KEYS.layout, _layout);
}
/** 拖拽落点。full = 地点全名。 */
export function setPlacePos(full: string, x: number, y: number): void {
  const s = getMapLayout();
  s.pos[full] = { x: Math.round(x), y: Math.round(y) };
  saveMapLayout(s);
}
export function clearPlacePos(full?: string): void {
  const s = getMapLayout();
  if (full) delete s.pos[full]; else s.pos = {};
  saveMapLayout(s);
}
export function saveCam(x: number, y: number, s: number): void {
  const st = getMapLayout();
  st.cam = { x: Math.round(x), y: Math.round(y), s: +s.toFixed(4) };
  saveMapLayout(st);
}

// ------------------------------------------------------------------- log
/** 地点日志。徽章由它投影出来，不另存徽章。 */
export type MapLogEntry = { visits: number; lastAt: number; events: string[] };
export type MapLog = Record<string, MapLogEntry>;

const CAP_EVENTS = 20;
let _log: MapLog | null = null;

export function getMapLog(): MapLog {
  if (!_log) {
    const raw = readJson<any>(MAP_LS_KEYS.log, null);
    const out: MapLog = {};
    if (raw && typeof raw === 'object') {
      for (const k of Object.keys(raw)) {
        const v = raw[k];
        if (!v || typeof v !== 'object') continue;
        out[k] = {
          visits: typeof v.visits === 'number' ? v.visits : 0,
          lastAt: typeof v.lastAt === 'number' ? v.lastAt : 0,
          events: Array.isArray(v.events) ? v.events.map(String).slice(-CAP_EVENTS) : [],
        };
      }
    }
    _log = out;
  }
  return _log;
}
export function saveMapLog(s: MapLog): void { _log = s; writeJson(MAP_LS_KEYS.log, s); }
export function logVisit(full: string, event?: string): void {
  const s = getMapLog();
  const e = s[full] || (s[full] = { visits: 0, lastAt: 0, events: [] });
  e.visits++; e.lastAt = Date.now();
  if (event) e.events = [...e.events, event].slice(-CAP_EVENTS);
  saveMapLog(s);
}
export function logOf(full: string): MapLogEntry | undefined { return getMapLog()[full]; }

// ------------------------------------------------------------------- art
export type MapArt = Record<string, string>;
let _art: MapArt | null = null;

export function getMapArt(): MapArt {
  if (!_art) {
    const raw = readJson<any>(MAP_LS_KEYS.art, null);
    const out: MapArt = {};
    if (raw && typeof raw === 'object') for (const k of Object.keys(raw)) if (raw[k]) out[k] = String(raw[k]);
    _art = out;
  }
  return _art;
}
export function setMapArt(full: string, url: string): void {
  const s = getMapArt();
  if (url) s[full] = url; else delete s[full];
  _art = s; writeJson(MAP_LS_KEYS.art, s);
}
export function artOf(full: string): string { return getMapArt()[full] || ''; }
export function clearMapArt(): void { _art = {}; writeJson(MAP_LS_KEYS.art, {}); }
export function clearMapLog(): void { _log = {}; writeJson(MAP_LS_KEYS.log, {}); }

// ------------------------------------------------------------------- cfg
export type MapCfg = {
  perfTier: 0 | 1 | 2 | 'auto';
  showLabels: boolean;
  breath: boolean;
  weather: boolean;
  confirmGo: boolean;
  /** 时辰皮肤。 */
  phaseSkin: boolean;
  /** 节庆挂彩。 */
  festival: boolean;
};

const CFG_DEFAULT: MapCfg = {
  perfTier: 'auto', showLabels: true,
  breath: true, weather: true, confirmGo: true,
  phaseSkin: true, festival: true,
};

let _cfg: MapCfg | null = null;

export function getMapCfg(): MapCfg {
  if (!_cfg) {
    const raw = readJson<Partial<MapCfg>>(MAP_LS_KEYS.cfg, {});
    _cfg = { ...CFG_DEFAULT, ...(raw && typeof raw === 'object' ? raw : {}) };
  }
  return _cfg;
}
export function setMapCfg(patch: Partial<MapCfg>): MapCfg {
  const next = { ...getMapCfg(), ...patch };
  _cfg = next; writeJson(MAP_LS_KEYS.cfg, next);
  return next;
}

/** 测试与「重置」入口用：清掉本模块的所有缓存，下次读盘。 */
export function resetMapStoreCache(): void { _layout = null; _log = null; _art = null; _cfg = null; }

try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_map_store__ = {
    getMapLayout, setPlacePos, clearPlacePos, saveCam,
    getMapLog, logVisit, getMapArt, setMapArt, clearMapArt, clearMapLog,
    getMapCfg, setMapCfg,
  };
} catch (e) { void e; }
