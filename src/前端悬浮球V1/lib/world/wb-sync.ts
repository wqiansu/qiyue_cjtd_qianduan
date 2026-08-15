import { getRoot, safeGetCharWorldbookNames } from '../tavern-api';
import { clearEntryCache } from './worldbook';
import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';
import { injectWorldOnce } from './ai-chat';

function getFn<T = any>(name: string): T | null {
  try {
    const w = window as any;
    if (typeof w[name] === 'function') return w[name] as T;
    const r = getRoot() as any;
    if (r && typeof r[name] === 'function') return r[name] as T;
  } catch (e) { void e; }
  return null;
}

// ==================== 配置模型 ====================
export type WbInjectMode = 'worldbook' | 'inject' | 'both' | 'off';
export type WbPositionType =
  | 'before_character_definition'
  | 'after_character_definition'
  | 'before_author_note'
  | 'after_author_note'
  | 'at_depth';
export type WbStrategyType = 'constant' | 'selective';

export type AppWbConfig = {
  mode: WbInjectMode;            // 默认 worldbook
  strategy: WbStrategyType;      // 蓝灯 constant / 绿灯 selective，默认 constant
  positionType: WbPositionType;  // 默认 before_character_definition
  depth: number;                 // at_depth 时有效，默认 4
  order: number;                 // 插入顺序，默认 100
  scanDepth: number;             // 绿灯扫描楼层数，默认 2（0=跟随全局）
};

// 默认「绿灯·关键字 + 角色定义之前（无深度）+ 顺序200」。
// 绿灯按关键字激活更省 token、更贴合「按需调用」；顺序 200 让套件条目排在角色卡常规条目之后。
export const DEFAULT_APP_WB_CONFIG: AppWbConfig = {
  mode: 'worldbook',
  strategy: 'selective',
  positionType: 'before_character_definition',
  depth: 4,
  order: 200,
  scanDepth: 2,
};

const LS_KEY = WORLD_LS_KEYS.wbsync;
type ConfigMap = Record<string, Partial<AppWbConfig>>;

function readCfgMap(): ConfigMap { return readWorldJson<ConfigMap>(LS_KEY, {}); }
function writeCfgMap(m: ConfigMap): void { writeWorldJson(LS_KEY, m); }

export function getAppWbConfig(appId: string): AppWbConfig {
  const raw = readCfgMap()[appId] || {};
  return { ...DEFAULT_APP_WB_CONFIG, ...raw };
}
export function setAppWbConfig(appId: string, patch: Partial<AppWbConfig>): AppWbConfig {
  const m = readCfgMap();
  m[appId] = { ...(m[appId] || {}), ...patch };
  writeCfgMap(m);
  return getAppWbConfig(appId);
}
export function resetAppWbConfig(appId: string): void {
  const m = readCfgMap(); delete m[appId]; writeCfgMap(m);
}

// ==================== 目标世界书解析 ====================
// 取角色卡 primary 世界书；无则新建 `<角色名>-世界套件记忆` 并绑为 primary。失败返回 null（降级）。
export async function resolvePrimaryWorldbook(create = true): Promise<string | null> {
  let cw: { primary: string | null; additional: string[] } | null = null;
  try { cw = safeGetCharWorldbookNames('current'); } catch (e) { void e; }
  if (cw?.primary) return cw.primary;
  if (!create) return null;
  // 新建并绑定为 primary
  const createBook = getFn<(n: string, wb?: any[]) => Promise<boolean>>('createWorldbook');
  const rebind = getFn<(c: 'current', wb: { primary: string | null; additional: string[] }) => Promise<void>>('rebindCharWorldbooks');
  if (!createBook || !rebind) return cw?.primary || null;
  let charName = 'character';
  try {
    const getChar = getFn<() => any>('getCharData') || getFn<() => any>('getCurrentCharacter');
    const c = getChar?.(); if (c?.name) charName = String(c.name);
  } catch (e) { void e; }
  const bookName = `${charName}-世界套件记忆`;
  try {
    await createBook(bookName);
    await rebind('current', { primary: bookName, additional: cw?.additional || [] });
    return bookName;
  } catch (e) { void e; return cw?.primary || null; }
}

// ==================== 条目读写 ====================
const ENTRY_PREFIX = '世界';
function entryName(appName: string, memType: string, title: string): string {
  const t = title ? ` ${title}` : '';
  return `[${ENTRY_PREFIX}·${appName}·${memType}]${t}`;
}

// 把一段 APP 记忆写入/更新到主世界书的一个条目（按 extra 标记 key 去重，存在则更新内容）。
// memKey：同一条记忆的稳定标识（如 `wechat:chat:<chatId>`），用于 upsert。返回是否成功。
export async function syncToWorldbook(args: {
  appId: string; appName: string; memType: string; memKey: string;
  title: string; content: string;
}): Promise<boolean> {
  const { appId, appName, memType, memKey, title, content } = args;
  if (!content.trim()) return false;
  const cfg = getAppWbConfig(appId);
  const book = await resolvePrimaryWorldbook(true);
  if (!book) return false;
  const update = getFn<(b: string, updater: (wb: any[]) => any[], o?: any) => Promise<any[]>>('updateWorldbookWith');
  if (!update) return false;

  const name = entryName(appName, memType, title);
  const position: any = cfg.positionType === 'at_depth'
    ? { type: 'at_depth', role: 'system', depth: cfg.depth, order: cfg.order }
    : { type: cfg.positionType, order: cfg.order };
  const strategy: any = {
    type: cfg.strategy,
    keys: cfg.strategy === 'selective' ? buildKeys(title, appName) : [],
    keys_secondary: { logic: 'and_any', keys: [] },
    scan_depth: cfg.scanDepth > 0 ? cfg.scanDepth : 'same_as_global',
  };
  const recursion = { prevent_incoming: true, prevent_outgoing: true, delay_until: null };

  try {
    await update(book, (wb: any[]) => {
      const idx = wb.findIndex(e => e?.extra?.thWorldSync?.key === memKey);
      const patch = {
        name, enabled: true, content,
        strategy, position, recursion,
        extra: { ...(idx >= 0 ? wb[idx]?.extra : {}), thWorldSync: { appId, memType, key: memKey } },
      };
      if (idx >= 0) { wb[idx] = { ...wb[idx], ...patch }; return wb; }
      return [...wb, patch];
    }, { render: 'debounced' });
    clearEntryCache();
    return true;
  } catch (e) { void e; return false; }
}

// 绿灯关键字：标题里的词 + APP 名，去重去空。
function buildKeys(title: string, appName: string): string[] {
  const set = new Set<string>();
  (title || '').split(/[\s·、，,]+/).map(s => s.trim()).filter(s => s.length >= 2).forEach(s => set.add(s));
  if (appName) set.add(appName);
  return [...set];
}

// 统一入口：按 APP 的 mode 决定写世界书 / inject 正文 / 两者 / 关闭。
// injectId/injectContent 用于「inject 正文楼层」那一路（保留旧机制作为可选项）。
export async function runMemorySync(args: {
  appId: string; appName: string; memType: string; memKey: string;
  title: string; content: string;
  injectId?: string; injectContent?: string;
}): Promise<void> {
  const mode = getAppWbConfig(args.appId).mode;
  if (mode === 'off') return;
  if (mode === 'worldbook' || mode === 'both') {
    try { await syncToWorldbook(args); } catch (e) { void e; }
  }
  if (mode === 'inject' || mode === 'both') {
    const id = args.injectId || `th_world_${args.appId}_${args.memKey}`;
    const body = args.injectContent || args.content;
    try { injectWorldOnce(id, body); } catch (e) { void e; }
  }
}

// ==================== 管理界面用：列举/删除我们写入的同步条目 ====================
export type WbSyncEntryLite = { book: string; uid: number; name: string; appId: string; memType: string; memKey: string; enabled: boolean; chars: number };

export async function listSyncEntries(appId?: string): Promise<WbSyncEntryLite[]> {
  const book = await resolvePrimaryWorldbook(false);
  if (!book) return [];
  const getWb = getFn<(b: string) => Promise<any[]>>('getWorldbook');
  if (!getWb) return [];
  let entries: any[] = [];
  try { entries = await getWb(book) || []; } catch (e) { void e; return []; }
  const out: WbSyncEntryLite[] = [];
  for (const e of entries) {
    const ws = e?.extra?.thWorldSync;
    if (!ws) continue;
    if (appId && ws.appId !== appId) continue;
    out.push({
      book, uid: Number(e?.uid ?? -1), name: String(e?.name ?? ''),
      appId: String(ws.appId || ''), memType: String(ws.memType || ''), memKey: String(ws.key || ''),
      enabled: e?.enabled !== false, chars: String(e?.content || '').length,
    });
  }
  return out;
}

export async function deleteSyncEntry(memKey: string): Promise<boolean> {
  const book = await resolvePrimaryWorldbook(false);
  if (!book) return false;
  const del = getFn<(b: string, pred: (e: any) => boolean, o?: any) => Promise<any>>('deleteWorldbookEntries');
  if (!del) return false;
  try { await del(book, (e: any) => e?.extra?.thWorldSync?.key === memKey, { render: 'debounced' }); return true; }
  catch (e) { void e; return false; }
}

export async function setSyncEntryEnabled(memKey: string, enabled: boolean): Promise<boolean> {
  const book = await resolvePrimaryWorldbook(false);
  if (!book) return false;
  const update = getFn<(b: string, updater: (wb: any[]) => any[], o?: any) => Promise<any[]>>('updateWorldbookWith');
  if (!update) return false;
  try {
    await update(book, (wb: any[]) => {
      const idx = wb.findIndex(e => e?.extra?.thWorldSync?.key === memKey);
      if (idx >= 0) wb[idx] = { ...wb[idx], enabled };
      return wb;
    }, { render: 'debounced' });
    clearEntryCache();
    return true;
  } catch (e) { void e; return false; }
}

// 读取某条已写入条目的正文内容（供「管理已写入条目」就地编辑）。找不到返回 null。
export async function getSyncEntryContent(memKey: string): Promise<string | null> {
  const book = await resolvePrimaryWorldbook(false);
  if (!book) return null;
  const getWb = getFn<(b: string) => Promise<any[]>>('getWorldbook');
  if (!getWb) return null;
  try {
    const entries = await getWb(book) || [];
    const hit = entries.find(e => e?.extra?.thWorldSync?.key === memKey);
    return hit ? String(hit.content || '') : null;
  } catch (e) { void e; return null; }
}

// 更新某条已写入条目的正文内容（玩家在「管理已写入条目」里手改后保存）。
export async function updateSyncEntryContent(memKey: string, content: string): Promise<boolean> {
  const book = await resolvePrimaryWorldbook(false);
  if (!book) return false;
  const update = getFn<(b: string, updater: (wb: any[]) => any[], o?: any) => Promise<any[]>>('updateWorldbookWith');
  if (!update) return false;
  try {
    await update(book, (wb: any[]) => {
      const idx = wb.findIndex(e => e?.extra?.thWorldSync?.key === memKey);
      if (idx >= 0) wb[idx] = { ...wb[idx], content };
      return wb;
    }, { render: 'debounced' });
    clearEntryCache();
    return true;
  } catch (e) { void e; return false; }
}

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_wbsync__ = { getAppWbConfig, setAppWbConfig, resolvePrimaryWorldbook, syncToWorldbook, runMemorySync, listSyncEntries, deleteSyncEntry };
} catch (e) { void e; }
