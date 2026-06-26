// 世界套件 P0 · 世界书访问层（worldbook.ts）
// 反馈#10：新建联系人时可直接选「某本世界书的某条目」注入到角色设定。
// 职责：列世界书名、列某本书的条目（名/uid/内容预览）。全部 window→getRoot 兜底（§4 跨窗口）。
// 只读为主；不在此做写入（避免误改玩家世界书）。失败一律降级为空数组，绝不 throw。
import { getRoot } from '../tavern-api';

function getFn<T = any>(name: string): T | null {
  try {
    const w = window as any;
    if (typeof w[name] === 'function') return w[name] as T;
    const r = getRoot() as any;
    if (r && typeof r[name] === 'function') return r[name] as T;
  } catch (e) { void e; }
  return null;
}

export type WbEntryLite = { uid: number; name: string; content: string; enabled: boolean };

// 所有世界书名（含全局/角色卡/聊天绑定的并集，去重）。
export function listWorldbookNames(): string[] {
  const names = new Set<string>();
  try {
    const all = getFn<() => string[]>('getWorldbookNames')?.() || [];
    all.forEach(n => n && names.add(n));
  } catch (e) { void e; }
  // 兜底：把当前角色卡/全局绑定的也并进来（有些环境 getWorldbookNames 只回已加载的）
  try {
    const g = getFn<() => string[]>('getGlobalWorldbookNames')?.() || [];
    g.forEach(n => n && names.add(n));
  } catch (e) { void e; }
  try {
    const cw = getFn<(c: string) => { primary: string | null; additional: string[] }>('getCharWorldbookNames')?.('current');
    if (cw) { if (cw.primary) names.add(cw.primary); (cw.additional || []).forEach(n => n && names.add(n)); }
  } catch (e) { void e; }
  return [...names];
}

// 某本世界书的条目（轻量）。异步：getWorldbook 返回 Promise。
export async function listWorldbookEntries(book: string): Promise<WbEntryLite[]> {
  const fn = getFn<(b: string) => Promise<any[]>>('getWorldbook');
  if (!fn || !book) return [];
  try {
    const entries = await fn(book);
    if (!Array.isArray(entries)) return [];
    return entries.map((e: any) => ({
      uid: Number(e?.uid ?? -1),
      name: String(e?.name ?? '') || `条目#${e?.uid ?? '?'}`,
      content: String(e?.content ?? ''),
      enabled: !!e?.enabled,
    }));
  } catch (e) { void e; return []; }
}

export function isWorldbookAvailable(): boolean {
  return !!getFn('getWorldbookNames') || !!getFn('getWorldbook');
}

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_worldbook__ = { listWorldbookNames, listWorldbookEntries, isWorldbookAvailable };
} catch (e) { void e; }
