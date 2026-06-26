// 世界套件 P0 · 记忆中心引擎（memory.ts）
// 定位：全套件共享的「记忆设施」。每个 APP 的每条对话线 = 一个独立「会话(session)」，
//       由 appId 标记归属（微信单聊/群聊/世界演化…），会话索引让记忆中心能枚举 + 按 APP 分组
//       —— 解决旧版「记忆给哪个 APP 用」不明确的问题。
//
// 四层记忆（由浅到深，token 由大到小）：
//   1. 待总结缓冲 buffer：最新原始对话，累积到阈值自动触发小结。
//   2. 短期记忆 shortterm：小结（每 shortThreshold 条对话压一条），保留近期细节。
//   3. 长期记忆 longterm：大总结（每 longThreshold 条小结再压一条），保留主线。
//   4. 关键设定 pinned：玩家手动钉住，永不参与压缩，每次注入必带（人物关系/世界观锚点）。
//
// 注入上下文 = 关键设定(全) + 长期(全) + 最近 N 条短期 + 最近 N 条原始，控 token。
// 引擎纯数据 + 注入式 summarize 回调（generate 流由 ai-chat 提供），本文件不直接碰 generate/DOM。
import { WORLD_LS_KEYS, readWorldJson, writeWorldJson, getWorldConfig, type MemoryConfig } from './world-store';

// ==================== 类型 ====================
export type MemRole = 'user' | 'assistant';
export type RawTurn = { id: string; role: MemRole; content: string; ts: number };
export type ShortSummary = { id: string; text: string; ts: number; sourceCount: number };
export type LongSummary = { id: string; text: string; ts: number; sourceCount: number };
export type PinnedNote = { id: string; text: string; ts: number };

export type MemorySession = {
  id: string;
  appId: string;            // 归属 APP，如 'wechat' / 'evolution'
  appName: string;          // APP 显示名（分组用）
  title: string;            // 会话名（联系人/群/角色）
  pinned: PinnedNote[];
  longterm: LongSummary[];
  shortterm: ShortSummary[];
  buffer: RawTurn[];
  overrides?: Partial<MemoryConfig>;  // 每会话阈值覆盖（空=用全局）
  createdAt: number;
  updatedAt: number;
};

export type MemSessionCounts = { pinned: number; long: number; short: number; buffer: number };
export type MemIndexEntry = { id: string; appId: string; appName: string; title: string; updatedAt: number; counts: MemSessionCounts };

// summarize 回调：上层（ai-chat）注入真实 generate 流。入参 system+user，返回纯文本总结。
export type MemSummarizer = (args: { system: string; user: string }) => Promise<string>;

// ==================== 工具 ====================
function uid(p: string): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }
function sessionKey(id: string): string { return WORLD_LS_KEYS.memPrefix + id; }
function now(): number { return Date.now(); }

// 每会话有效配置：全局 memory 配置 ← 会话 overrides 覆盖
export function effectiveMemConfig(s: MemorySession): MemoryConfig {
  const g = getWorldConfig().memory;
  const o = s.overrides || {};
  return {
    shortThreshold: o.shortThreshold ?? g.shortThreshold,
    longThreshold: o.longThreshold ?? g.longThreshold,
    recentRawCount: o.recentRawCount ?? g.recentRawCount,
    recentShortCount: o.recentShortCount ?? g.recentShortCount,
  };
}

// MEM_INDEX_PLACEHOLDER

// ==================== 会话索引（枚举 + 分组）====================
function readIndex(): MemIndexEntry[] {
  return readWorldJson<MemIndexEntry[]>(WORLD_LS_KEYS.memIndex, []);
}
function writeIndex(list: MemIndexEntry[]): void {
  writeWorldJson(WORLD_LS_KEYS.memIndex, list);
}
function countsOf(s: MemorySession): MemSessionCounts {
  return { pinned: s.pinned.length, long: s.longterm.length, short: s.shortterm.length, buffer: s.buffer.length };
}
function syncIndex(s: MemorySession): void {
  const list = readIndex();
  const entry: MemIndexEntry = { id: s.id, appId: s.appId, appName: s.appName, title: s.title, updatedAt: s.updatedAt, counts: countsOf(s) };
  const i = list.findIndex(e => e.id === s.id);
  if (i >= 0) list[i] = entry; else list.push(entry);
  writeIndex(list);
}
function dropIndex(id: string): void {
  writeIndex(readIndex().filter(e => e.id !== id));
}

// 全部会话索引（最近更新在前）
export function listSessions(): MemIndexEntry[] {
  return readIndex().slice().sort((a, b) => b.updatedAt - a.updatedAt);
}
// 按 APP 分组：{ appId, appName, sessions[] }
export function listSessionsByApp(): { appId: string; appName: string; sessions: MemIndexEntry[] }[] {
  const groups = new Map<string, { appId: string; appName: string; sessions: MemIndexEntry[] }>();
  for (const e of listSessions()) {
    let g = groups.get(e.appId);
    if (!g) { g = { appId: e.appId, appName: e.appName, sessions: [] }; groups.set(e.appId, g); }
    g.sessions.push(e);
  }
  return [...groups.values()];
}

// MEM_SESSION_PLACEHOLDER

// ==================== 会话读写 / 生命周期 ====================
function blankSession(id: string, appId: string, appName: string, title: string): MemorySession {
  const t = now();
  return { id, appId, appName, title, pinned: [], longterm: [], shortterm: [], buffer: [], createdAt: t, updatedAt: t };
}
export function getSession(id: string): MemorySession | null {
  return readWorldJson<MemorySession | null>(sessionKey(id), null);
}
function saveSession(s: MemorySession): void {
  s.updatedAt = now();
  writeWorldJson(sessionKey(s.id), s);
  syncIndex(s);
}
// 取或建会话。appId/appName/title 用于建立时写入（已存在则按需更新 title/appName）。
export function ensureSession(opts: { id?: string; appId: string; appName: string; title: string }): MemorySession {
  const id = opts.id || uid('s');
  let s = getSession(id);
  if (!s) {
    s = blankSession(id, opts.appId, opts.appName, opts.title);
    saveSession(s);
    return s;
  }
  // 已存在：刷新展示用元信息（不动记忆内容）
  if (s.title !== opts.title || s.appName !== opts.appName) {
    s.title = opts.title; s.appName = opts.appName;
    saveSession(s);
  }
  return s;
}
export function deleteSession(id: string): void {
  try { localStorage.removeItem(sessionKey(id)); } catch (e) { void e; }
  dropIndex(id);
}
export function setSessionOverrides(id: string, overrides: Partial<MemoryConfig> | undefined): void {
  const s = getSession(id); if (!s) return;
  s.overrides = overrides && Object.keys(overrides).length ? overrides : undefined;
  saveSession(s);
}

// MEM_OPS_PLACEHOLDER

// ==================== 原始对话写入 + 钉住/编辑/删除 ====================
// 追加一条对话到缓冲。返回是否「已达小结阈值」（上层据此决定是否调 runShortSummary）。
export function appendTurn(id: string, role: MemRole, content: string): { session: MemorySession; reachedThreshold: boolean } {
  const s = getSession(id) || blankSession(id, 'unknown', '未知', id);
  s.buffer.push({ id: uid('t'), role, content, ts: now() });
  saveSession(s);
  const cfg = effectiveMemConfig(s);
  return { session: s, reachedThreshold: s.buffer.length >= cfg.shortThreshold };
}
export function addPinned(id: string, text: string): void {
  const s = getSession(id); if (!s || !text.trim()) return;
  s.pinned.push({ id: uid('p'), text: text.trim(), ts: now() });
  saveSession(s);
}
export function removePinned(id: string, pinId: string): void {
  const s = getSession(id); if (!s) return;
  s.pinned = s.pinned.filter(p => p.id !== pinId); saveSession(s);
}
// 把某条小结/长期总结提升为关键设定（钉住）
export function pinSummary(id: string, tier: 'short' | 'long', itemId: string): void {
  const s = getSession(id); if (!s) return;
  const src = tier === 'short' ? s.shortterm.find(x => x.id === itemId) : s.longterm.find(x => x.id === itemId);
  if (!src) return;
  s.pinned.push({ id: uid('p'), text: src.text, ts: now() }); saveSession(s);
}
// 编辑任意层条目文本
export function editMemItem(id: string, tier: 'pinned' | 'short' | 'long' | 'buffer', itemId: string, text: string): void {
  const s = getSession(id); if (!s) return;
  const arr: { id: string; text?: string; content?: string }[] =
    tier === 'pinned' ? s.pinned : tier === 'short' ? s.shortterm : tier === 'long' ? s.longterm : s.buffer;
  const it = arr.find(x => x.id === itemId); if (!it) return;
  if (tier === 'buffer') (it as RawTurn).content = text; else (it as { text: string }).text = text;
  saveSession(s);
}
export function deleteMemItem(id: string, tier: 'pinned' | 'short' | 'long' | 'buffer', itemId: string): void {
  const s = getSession(id); if (!s) return;
  if (tier === 'pinned') s.pinned = s.pinned.filter(x => x.id !== itemId);
  else if (tier === 'short') s.shortterm = s.shortterm.filter(x => x.id !== itemId);
  else if (tier === 'long') s.longterm = s.longterm.filter(x => x.id !== itemId);
  else s.buffer = s.buffer.filter(x => x.id !== itemId);
  saveSession(s);
}
// 清空某层（pinned 一般不清）
export function clearTier(id: string, tier: 'pinned' | 'short' | 'long' | 'buffer'): void {
  const s = getSession(id); if (!s) return;
  if (tier === 'pinned') s.pinned = []; else if (tier === 'short') s.shortterm = [];
  else if (tier === 'long') s.longterm = []; else s.buffer = [];
  saveSession(s);
}

// MEM_SUMMARY_PLACEHOLDER

// ==================== 小结 / 长期压缩 引擎（注入式 summarize）====================
const SHORT_SYS = '你是一名专业的「角色记忆官」，专为长程角色扮演维护一条连贯、可被后续生成直接复用的记忆。\n'
  + '现在请把下面这段角色与「我」的对话，提炼成一条紧凑的【短期记忆】。\n'
  + '请优先保留这些信息（按重要性）：①真正发生的关键事件与转折；②任何承诺、约定、计划、未兑现的伏笔；③人物关系/态度/情感的变化（谁对谁，怎么变的）；④暴露出来的新设定、新身份、新秘密；⑤强烈或反常的情绪。\n'
  + '请丢弃：寒暄、重复、语气词、纯氛围描写、无信息量的闲聊。\n'
  + '写法：第三人称客观陈述，点名具体的人和事（不要用「对方」「ta」这种模糊指代），按发生顺序串成 2~4 句话，150 字以内。只输出这段记忆文本本身，不要标题、不要列表符号、不要任何解释。';
const LONG_SYS = '你是一名专业的「角色记忆官」，负责把零散的短期记忆归档为一条贯穿全局的主线长期记忆。\n'
  + '现在请把下面多条【短期记忆】合并、去重、压缩成一条【长期记忆】主线。\n'
  + '请着重提炼：①关系的整体走向与当前所处的阶段（从哪里来、到了哪一步）；②反复出现或影响深远的重大事件；③仍然悬而未决的线索、约定与目标；④已被确立为既定事实的关键设定与人物底色。\n'
  + '请舍弃：只在某一次出现、对后续无影响的细枝末节。\n'
  + '写法：第三人称客观陈述，点名具体的人与事，按时间或因果脉络组织成连贯段落，250 字以内。只输出这段记忆文本本身，不要标题、不要列表符号、不要任何解释。';

function turnsToText(turns: RawTurn[]): string {
  return turns.map(t => `${t.role === 'user' ? '我' : '对方'}：${t.content}`).join('\n');
}

// 触发短期小结：把 buffer 压成一条 short，清空 buffer。达长期阈值则连带压缩长期。
// summarize 由上层注入（ai-chat 提供真实 generate；记忆中心面板可注入轻量 generateRaw 包装）。
export async function runShortSummary(id: string, summarize: MemSummarizer): Promise<MemorySession | null> {
  const s = getSession(id); if (!s || !s.buffer.length) return s;
  const user = turnsToText(s.buffer);
  let text = '';
  try { text = (await summarize({ system: SHORT_SYS, user })).trim(); } catch (e) { void e; return s; }
  if (!text) return s;
  s.shortterm.push({ id: uid('ss'), text, ts: now(), sourceCount: s.buffer.length });
  s.buffer = [];
  saveSession(s);
  const cfg = effectiveMemConfig(s);
  if (s.shortterm.length >= cfg.longThreshold) {
    await runLongCompress(id, summarize);
    return getSession(id);
  }
  return s;
}

// 长期压缩：把现有 short 合并成一条 long，清空 short。手动按钮也调这里。
export async function runLongCompress(id: string, summarize: MemSummarizer): Promise<MemorySession | null> {
  const s = getSession(id); if (!s || !s.shortterm.length) return s;
  const prevLong = s.longterm.map(l => l.text).join('\n');
  const shorts = s.shortterm.map((x, i) => `${i + 1}. ${x.text}`).join('\n');
  const user = `${prevLong ? `已有长期记忆：\n${prevLong}\n\n` : ''}待合并的短期记忆：\n${shorts}`;
  let text = '';
  try { text = (await summarize({ system: LONG_SYS, user })).trim(); } catch (e) { void e; return s; }
  if (!text) return s;
  s.longterm.push({ id: uid('ls'), text, ts: now(), sourceCount: s.shortterm.length });
  s.shortterm = [];
  saveSession(s);
  return getSession(id);
}

// 手动把 buffer 立即小结（即使未达阈值）
export async function manualSummarize(id: string, summarize: MemSummarizer): Promise<MemorySession | null> {
  return runShortSummary(id, summarize);
}

// MEM_CONTEXT_PLACEHOLDER

// ==================== 注入上下文构建 ====================
// 组装喂给 AI 的记忆块：关键设定(全) + 长期(全) + 最近 N 条短期 + 最近 N 条原始。
// 返回 { memoryText, recentTurns }：memoryText 进 system，recentTurns 由上层拼进对话历史。
export function buildMemoryContext(id: string): { memoryText: string; recentTurns: RawTurn[] } {
  const s = getSession(id);
  if (!s) return { memoryText: '', recentTurns: [] };
  const cfg = effectiveMemConfig(s);
  const parts: string[] = [];
  if (s.pinned.length) parts.push('【关键设定】\n' + s.pinned.map(p => `· ${p.text}`).join('\n'));
  if (s.longterm.length) parts.push('【长期记忆】\n' + s.longterm.map(l => l.text).join('\n'));
  if (s.shortterm.length) {
    const recent = s.shortterm.slice(-Math.max(0, cfg.recentShortCount));
    if (recent.length) parts.push('【近期记忆】\n' + recent.map(x => `· ${x.text}`).join('\n'));
  }
  const recentTurns = s.buffer.slice(-Math.max(0, cfg.recentRawCount));
  return { memoryText: parts.join('\n\n'), recentTurns };
}

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_memory__ = {
    listSessions, listSessionsByApp, getSession, ensureSession, deleteSession,
    appendTurn, buildMemoryContext, effectiveMemConfig,
  };
} catch (e) { void e; }
