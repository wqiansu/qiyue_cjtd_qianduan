import { WORLD_LS_KEYS, readWorldJson, writeWorldJson, getWorldConfig, type MemoryConfig } from './world-store';
import { registerPromptTemplate, getPromptText } from './world-prompts';

// ==================== 类型 ====================
export type MemRole = 'user' | 'assistant';
export type RawTurn = { id: string; role: MemRole; content: string; ts: number };
// 记忆条目统一带 importance（重要性权重 1~3，压缩时高分上浮）+ source（认知边界：亲历/听说/未知）。
export type MemImportance = 1 | 2 | 3;
export type MemSource = '亲历' | '听说' | '未知';
export type ShortSummary = { id: string; text: string; ts: number; sourceCount: number; importance?: MemImportance; source?: MemSource; appId?: string };
export type LongSummary = { id: string; text: string; ts: number; sourceCount: number; importance?: MemImportance; source?: MemSource; appId?: string };
export type MidSummary = { id: string; text: string; ts: number; sourceCount: number; importance?: MemImportance; source?: MemSource; appId?: string };
export type PinnedNote = { id: string; text: string; ts: number };
// 未了之事：结构化开放事项，永不压缩，直到标「已了」。
export type OpenThread = { id: string; text: string; ts: number; done?: boolean };

export type MemorySession = {
  id: string;
  appId: string;            // 归属 APP，如 'wechat' / 'evolution'
  appName: string;          // APP 显示名（分组用）
  title: string;            // 会话名（联系人/群/角色）
  pinned: PinnedNote[];     // 关键设定（旁路·永不压缩·必带）
  longterm: LongSummary[];  // 远期主线（三层压缩之顶）
  mid: MidSummary[];        // 中期归纳（旧数据迁移后为空起）
  shortterm: ShortSummary[];// 近期小结（细节丰富、最近发生）
  unfinished: OpenThread[]; // 未了之事（旁路·永不压缩·直到标已了）
  buffer: RawTurn[];        // 待总结原始记录
  overrides?: Partial<MemoryConfig>;  // 每会话阈值覆盖（空=用全局）
  muted?: boolean;                    // 静音——该会话记忆不参与注入（buildMemoryContext 返回空）
  // 记忆池分流：绑定了角色档案 id 的会话降级为「纯 raw 暂存器」——只留 buffer，小结成果不落本会话的
  //   shortterm/mid/longterm，而是归档进该角色的记忆池（pool_<contactId>），由池统一做 近期→中期→远期 向上压缩。
  //   注入时 = 池 + 本会话最近原话。未绑 contactId 的会话（群聊/演化/小剧场）记忆仍住在会话里。
  contactId?: string;
  createdAt: number;
  updatedAt: number;
};

// ==================== 角色记忆池 ====================
export type CharPool = {
  contactId: string;
  name: string;                        // 角色显示名（展示用，随档案刷新）
  pinned: PinnedNote[];                // 关键设定（永不压缩，每次注入必带）
  longterm: LongSummary[];             // 远期主线
  mid: MidSummary[];                   // 中期归纳
  shortterm: ShortSummary[];           // 近期经历（含各 app 小结 + noteToPool 轻互动）
  unfinished: OpenThread[];            // 未了之事（旁路·永不压缩·直到标已了）
  sources: Record<string, number>;     // 各 app 贡献的经历条数（appId → 计数，展示「在哪些 app 有交集」）
  muted?: boolean;                     // 静音：该角色记忆不参与任何 app 注入
  overrides?: Partial<MemoryConfig>;   // 池级阈值覆盖（长期压缩节奏/注入近期条数）
  createdAt: number;
  updatedAt: number;
};
export type PoolIndexEntry = {
  contactId: string; name: string; updatedAt: number;
  counts: { pinned: number; long: number; mid: number; short: number; open: number };
  appCount: number;
};

export type MemSessionCounts = { pinned: number; long: number; mid: number; short: number; buffer: number; open: number };
export type MemIndexEntry = { id: string; appId: string; appName: string; title: string; updatedAt: number; counts: MemSessionCounts; contactId?: string };

// summarize 回调：上层（ai-chat）注入真实 generate 流。入参 system+user，返回纯文本总结。
export type MemSummarizer = (args: { system: string; user: string }) => Promise<string>;

// ==================== 工具 ====================
function uid(p: string): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }
function sessionKey(id: string): string { return WORLD_LS_KEYS.memPrefix + id; }
function now(): number { return Date.now(); }

// 触发主尺为「累积字数」（各 app 单条信息量差异极大），条数作保底副尺。
//   每个 app 一套按文本量定制的默认画像；session overrides 仍优先于画像。
export type MemConfigPartial = Partial<MemoryConfig>;
const APP_MEM_PROFILES: Record<string, MemConfigPartial> = {
  // 碎聊/长谈：字数触发放宽到 ~6000，条数保底较高
  wechat:   { charThreshold: 6000, shortThreshold: 30, midThreshold: 5, farThreshold: 4, recentRawCount: 8, recentShortCount: 4 },
  call:     { charThreshold: 6000, shortThreshold: 24, midThreshold: 5, farThreshold: 4, recentRawCount: 6, recentShortCount: 3 },
  // 中长互动：糖心直播
  tangxin:  { charThreshold: 7000, shortThreshold: 12, midThreshold: 5, farThreshold: 4, recentRawCount: 3, recentShortCount: 3 },
  // 中等内容：B站/小红书/微博/浏览器
  bili:     { charThreshold: 5000, shortThreshold: 12, midThreshold: 5, farThreshold: 4, recentRawCount: 2, recentShortCount: 3 },
  red:      { charThreshold: 5000, shortThreshold: 12, midThreshold: 5, farThreshold: 4, recentRawCount: 2, recentShortCount: 3 },
  weibo:    { charThreshold: 5000, shortThreshold: 14, midThreshold: 5, farThreshold: 4, recentRawCount: 3, recentShortCount: 3 },
  browser:  { charThreshold: 5000, shortThreshold: 14, midThreshold: 5, farThreshold: 4, recentRawCount: 2, recentShortCount: 3 },
  // 短评/沙雕：最右
  zui:      { charThreshold: 4000, shortThreshold: 16, midThreshold: 5, farThreshold: 4, recentRawCount: 3, recentShortCount: 3 },
  // 中等：日历/日记
  cal:      { charThreshold: 5500, shortThreshold: 16, midThreshold: 5, farThreshold: 4, recentRawCount: 3, recentShortCount: 3 },
  diary:    { charThreshold: 5500, shortThreshold: 16, midThreshold: 5, farThreshold: 4, recentRawCount: 3, recentShortCount: 3 },
  // 长推演：演化以「推演轮次」为主尺（约3轮），字数为辅
  evolution:{ charThreshold: 9000, shortThreshold: 8, midThreshold: 4, farThreshold: 4, recentRawCount: 2, recentShortCount: 3 },
};
export function getAppMemProfile(appId: string): MemConfigPartial | undefined { return APP_MEM_PROFILES[appId]; }
export function hasAppMemProfile(appId: string): boolean { return !!APP_MEM_PROFILES[appId]; }

// 各 app 设置内可直接调本 app 的记忆总结画像（玩家覆盖内置画像），不必逐会话进记忆中心改。
// 优先级：会话 overrides > app 玩家覆盖 > 内置画像 > 全局。
// 存 _th_world_memappcfg_v1 = { [appId]: Partial<MemoryConfig> & { enabled?: boolean } }
type AppMemOverride = MemConfigPartial & { enabled?: boolean };
const APP_MEM_LS = WORLD_LS_KEYS.memAppCfg;
function readAppMemMap(): Record<string, AppMemOverride> { return readWorldJson<Record<string, AppMemOverride>>(APP_MEM_LS, {}); }
export function getAppMemOverride(appId: string): AppMemOverride { return readAppMemMap()[appId] || {}; }
export function setAppMemOverride(appId: string, patch: AppMemOverride): void {
  const m = readAppMemMap(); m[appId] = { ...(m[appId] || {}), ...patch }; writeWorldJson(APP_MEM_LS, m);
}
export function clearAppMemOverride(appId: string): void {
  const m = readAppMemMap(); delete m[appId]; writeWorldJson(APP_MEM_LS, m);
}
// 本 app 当前生效的默认阈值（app 玩家覆盖 ← 内置画像 ← 全局），供设置面板占位/展示
export function effectiveAppMemDefaults(appId: string): MemoryConfig {
  const g = getWorldConfig().memory;
  const p = APP_MEM_PROFILES[appId] || {};
  const o = getAppMemOverride(appId);
  const pick = (k: keyof MemoryConfig): number => (o[k] ?? p[k] ?? g[k]) as number;
  return {
    charThreshold: pick('charThreshold'), shortThreshold: pick('shortThreshold'),
    midThreshold: pick('midThreshold'), farThreshold: pick('farThreshold'), longThreshold: pick('longThreshold'),
    recentRawCount: pick('recentRawCount'), recentShortCount: pick('recentShortCount'),
    recentCap: pick('recentCap'), midCap: pick('midCap'), farCap: pick('farCap'),
  };
}

// 每会话有效配置：全局 memory ← app 画像默认 ← app 玩家覆盖 ← 会话 overrides（后者优先）
export function effectiveMemConfig(s: MemorySession): MemoryConfig {
  const g = getWorldConfig().memory;
  const p = APP_MEM_PROFILES[s.appId] || {};
  const ao = getAppMemOverride(s.appId);
  const o = s.overrides || {};
  const pick = (k: keyof MemoryConfig): number =>
    (o[k] ?? ao[k] ?? p[k] ?? g[k]) as number;
  return {
    charThreshold: pick('charThreshold'), shortThreshold: pick('shortThreshold'),
    midThreshold: pick('midThreshold'), farThreshold: pick('farThreshold'), longThreshold: pick('longThreshold'),
    recentRawCount: pick('recentRawCount'), recentShortCount: pick('recentShortCount'),
    recentCap: pick('recentCap'), midCap: pick('midCap'), farCap: pick('farCap'),
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
  return { pinned: s.pinned.length, long: s.longterm.length, mid: (s.mid || []).length, short: s.shortterm.length, buffer: s.buffer.length, open: (s.unfinished || []).filter(x => !x.done).length };
}
function syncIndex(s: MemorySession): void {
  const list = readIndex();
  const entry: MemIndexEntry = { id: s.id, appId: s.appId, appName: s.appName, title: s.title, updatedAt: s.updatedAt, counts: countsOf(s), contactId: s.contactId };
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
  return { id, appId, appName, title, pinned: [], longterm: [], mid: [], shortterm: [], unfinished: [], buffer: [], createdAt: t, updatedAt: t };
}
// 迁移愈合：旧会话 blob 无 mid/unfinished 等字段时补齐。
function normalizeSession(s: MemorySession): MemorySession {
  if (!Array.isArray(s.mid)) s.mid = [];
  if (!Array.isArray(s.unfinished)) s.unfinished = [];
  if (!Array.isArray(s.longterm)) s.longterm = [];
  if (!Array.isArray(s.shortterm)) s.shortterm = [];
  if (!Array.isArray(s.pinned)) s.pinned = [];
  if (!Array.isArray(s.buffer)) s.buffer = [];
  return s;
}
export function getSession(id: string): MemorySession | null {
  const s = readWorldJson<MemorySession | null>(sessionKey(id), null);
  return s ? normalizeSession(s) : null;
}
function saveSession(s: MemorySession): void {
  s.updatedAt = now();
  writeWorldJson(sessionKey(s.id), s);
  syncIndex(s);
}
// 取或建会话。appId/appName/title 用于建立时写入（已存在则按需更新 title/appName）。
// contactId 绑定角色档案——传了则该会话降级为「纯 raw 暂存器」，小结归档进该角色池。
export function ensureSession(opts: { id?: string; appId: string; appName: string; title: string; contactId?: string }): MemorySession {
  const id = opts.id || uid('s');
  let s = getSession(id);
  if (!s) {
    s = blankSession(id, opts.appId, opts.appName, opts.title);
    if (opts.contactId) s.contactId = opts.contactId;
    saveSession(s);
    return s;
  }
  // 已存在：刷新展示用元信息（不动记忆内容）
  let dirty = false;
  if (s.title !== opts.title || s.appName !== opts.appName) { s.title = opts.title; s.appName = opts.appName; dirty = true; }
  if (opts.contactId && s.contactId !== opts.contactId) { s.contactId = opts.contactId; dirty = true; }
  if (dirty) saveSession(s);
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
// 静音开关（该会话记忆不参与注入正文，避免污染体验）
export function setSessionMuted(id: string, muted: boolean): void {
  const s = getSession(id); if (!s) return;
  s.muted = muted || undefined; saveSession(s);
}
// 粗略 token 估算（中文≈1字1token，英文按 1/4 词，够用即可，不引真 tokenizer）
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(/[一-鿿　-〿＀-￯]/g) || []).length;
  const rest = text.length - cjk;
  return Math.ceil(cjk + rest / 4);
}

// MEM_OPS_PLACEHOLDER

// ==================== 角色记忆池：存储 / 索引 / 生命周期 ====================
function poolKey(cid: string): string { return WORLD_LS_KEYS.poolPrefix + cid; }
function readPoolIndex(): PoolIndexEntry[] { return readWorldJson<PoolIndexEntry[]>(WORLD_LS_KEYS.poolIndex, []); }
function writePoolIndex(list: PoolIndexEntry[]): void { writeWorldJson(WORLD_LS_KEYS.poolIndex, list); }
function poolEntryOf(p: CharPool): PoolIndexEntry {
  return {
    contactId: p.contactId, name: p.name, updatedAt: p.updatedAt,
    counts: { pinned: p.pinned.length, long: p.longterm.length, mid: (p.mid || []).length, short: p.shortterm.length, open: (p.unfinished || []).filter(x => !x.done).length },
    appCount: Object.keys(p.sources || {}).length,
  };
}
function syncPoolIndex(p: CharPool): void {
  const list = readPoolIndex();
  const i = list.findIndex(e => e.contactId === p.contactId);
  if (i >= 0) list[i] = poolEntryOf(p); else list.push(poolEntryOf(p));
  writePoolIndex(list);
}
function dropPoolIndex(cid: string): void { writePoolIndex(readPoolIndex().filter(e => e.contactId !== cid)); }

export function getPool(cid: string): CharPool | null {
  const p = readWorldJson<CharPool | null>(poolKey(cid), null);
  return p ? normalizePool(p) : null;
}
// 迁移愈合：旧池 blob 补齐 mid/unfinished 等字段。
function normalizePool(p: CharPool): CharPool {
  if (!Array.isArray(p.mid)) p.mid = [];
  if (!Array.isArray(p.unfinished)) p.unfinished = [];
  if (!Array.isArray(p.longterm)) p.longterm = [];
  if (!Array.isArray(p.shortterm)) p.shortterm = [];
  if (!Array.isArray(p.pinned)) p.pinned = [];
  if (!p.sources) p.sources = {};
  return p;
}
function savePool(p: CharPool): void { p.updatedAt = now(); writeWorldJson(poolKey(p.contactId), p); syncPoolIndex(p); }
function blankPool(cid: string, name: string): CharPool {
  const t = now();
  return { contactId: cid, name: name || '角色', pinned: [], longterm: [], mid: [], shortterm: [], unfinished: [], sources: {}, createdAt: t, updatedAt: t };
}
// 取或建角色池；name 用于建立/刷新展示名（不动记忆内容）。
export function ensurePool(cid: string, name?: string): CharPool {
  let p = getPool(cid);
  if (!p) { p = blankPool(cid, name || ''); savePool(p); return p; }
  if (name && p.name !== name) { p.name = name; savePool(p); }
  return p;
}
export function deletePool(cid: string): void {
  try { localStorage.removeItem(poolKey(cid)); } catch (e) { void e; }
  dropPoolIndex(cid);
}
// 全部角色池（最近更新在前）
export function listPools(): PoolIndexEntry[] { return readPoolIndex().slice().sort((a, b) => b.updatedAt - a.updatedAt); }
// 池级有效阈值：全局 memory ← 池 overrides（后者优先）。charThreshold 在池里不用（池不攒 raw）。
export function effectivePoolConfig(p: CharPool): MemoryConfig {
  const g = getWorldConfig().memory; const o = p.overrides || {};
  const pick = (k: keyof MemoryConfig): number => (o[k] ?? g[k]) as number;
  return {
    charThreshold: pick('charThreshold'), shortThreshold: pick('shortThreshold'),
    midThreshold: pick('midThreshold'), farThreshold: pick('farThreshold'), longThreshold: pick('longThreshold'),
    recentRawCount: pick('recentRawCount'), recentShortCount: pick('recentShortCount'),
    recentCap: pick('recentCap'), midCap: pick('midCap'), farCap: pick('farCap'),
  };
}
export function setPoolMuted(cid: string, muted: boolean): void { const p = getPool(cid); if (!p) return; p.muted = muted || undefined; savePool(p); }
export function setPoolOverrides(cid: string, overrides: Partial<MemoryConfig> | undefined): void {
  const p = getPool(cid); if (!p) return;
  p.overrides = overrides && Object.keys(overrides).length ? overrides : undefined; savePool(p);
}

// POOL_OPS_PLACEHOLDER

// —— 写入：归档一条经历进池（核心同步入口）——
// 各 app 的小结成果、内容类 app 的轻互动，统一走这里落到角色池的 shortterm（带 app 来源标签）。
// 三层链：近期攒够 midThreshold → 归纳中期；中期攒够 farThreshold → 并入远期主线。
//   summarize 可选：给了才在归纳/主线压缩时调 AI，没给则跳过压缩（纯记不压）。
export async function archiveToPool(
  cid: string, name: string, appId: string, appName: string, text: string, summarize?: MemSummarizer,
): Promise<CharPool | null> {
  const t = (text || '').trim(); if (!cid || !t) return getPool(cid);
  const p = ensurePool(cid, name);
  const tagged = appName ? `〔${appName}〕${t}` : t;
  p.shortterm.push({ id: uid('ps'), text: tagged, ts: now(), sourceCount: 1, importance: 2, source: '亲历', appId });
  p.sources[appId] = (p.sources[appId] || 0) + 1;
  savePool(p);
  if (summarize) await cascadePoolCompress(cid, summarize);
  return getPool(cid);
}
// 内容类 app 的轻互动直接补一条经历（不调 AI、不重复），如「在 B 站给 ta 的视频点了赞并投币」。
export function noteToPool(cid: string, name: string, appId: string, appName: string, text: string): CharPool | null {
  const t = (text || '').trim(); if (!cid || !t) return getPool(cid);
  const p = ensurePool(cid, name);
  const tagged = appName ? `〔${appName}〕${t}` : t;
  p.shortterm.push({ id: uid('pn'), text: tagged, ts: now(), sourceCount: 1, importance: 2, source: '亲历', appId });
  p.sources[appId] = (p.sources[appId] || 0) + 1;
  savePool(p);
  return getPool(cid);
}
// 级联压缩：近期→中期→远期，逐层判阈值自动向上归纳（每层达阈值就压一次）。
export async function cascadePoolCompress(cid: string, summarize: MemSummarizer): Promise<CharPool | null> {
  let p = getPool(cid); if (!p) return p;
  const cfg = effectivePoolConfig(p);
  // 近期 → 中期
  if (p.shortterm.length >= cfg.midThreshold) { p = await runPoolMidCompress(cid, summarize) || p; }
  // 中期 → 远期
  if (p && (p.mid || []).length >= cfg.farThreshold) { p = await runPoolLongCompress(cid, summarize) || p; }
  return getPool(cid);
}
// 池·近期→中期归纳：把 shortterm 归纳成一条 mid，清空 shortterm。达阈值自动 + 面板手动均调这里。
export async function runPoolMidCompress(cid: string, summarize: MemSummarizer): Promise<CharPool | null> {
  const p = getPool(cid); if (!p || !p.shortterm.length) return p;
  const cfg = effectivePoolConfig(p);
  const prevMid = p.mid.map(m => m.text).join('\n');
  const shorts = p.shortterm.map((x, i) => `${i + 1}. ${x.text}`).join('\n');
  const sys = renderTierPrompt(MID_PROMPT_ID, prevMid, shorts, cfg.midCap);
  const user = `${prevMid ? `已有中期记忆：\n${prevMid}\n\n` : ''}待归纳的近期记忆：\n${shorts}`;
  let text = ''; try { text = (await summarize({ system: sys, user })).trim(); } catch (e) { void e; return p; }
  if (!text) return p;
  p.mid.push({ id: uid('pm'), text, ts: now(), sourceCount: p.shortterm.length, importance: 2, source: '亲历' });
  p.shortterm = [];
  savePool(p);
  return getPool(cid);
}
// 池·中期→远期主线：把 mid 合并进一条 longterm 主线，清空 mid。达阈值自动 + 面板手动均调这里。
export async function runPoolLongCompress(cid: string, summarize: MemSummarizer): Promise<CharPool | null> {
  const p = getPool(cid); if (!p) return p;
  if (!p.mid.length && p.shortterm.length) { await runPoolMidCompress(cid, summarize); }
  const p2 = getPool(cid); if (!p2 || !p2.mid.length) return p2;
  const cfg = effectivePoolConfig(p2);
  const prevLong = p2.longterm.map(l => l.text).join('\n');
  const mids = p2.mid.map((x, i) => `${i + 1}. ${x.text}`).join('\n');
  const sys = renderTierPrompt(LONG_PROMPT_ID, prevLong, mids, cfg.farCap);
  const user = `${prevLong ? `已有远期主线：\n${prevLong}\n\n` : ''}待并入主线的中期记忆：\n${mids}`;
  let text = ''; try { text = (await summarize({ system: sys, user })).trim(); } catch (e) { void e; return p2; }
  if (!text) return p2;
  p2.longterm.push({ id: uid('pl'), text, ts: now(), sourceCount: p2.mid.length, importance: 3, source: '亲历' });
  p2.mid = [];
  savePool(p2);
  return getPool(cid);
}
// 关键设定（钉住）/ 编辑 / 删除 / 清层——对标三层记忆的手动管理，供记忆池面板用。
export type PoolTier = 'pinned' | 'short' | 'mid' | 'long';
function poolArr(p: CharPool, tier: PoolTier): { id: string; text: string; importance?: MemImportance }[] {
  return (tier === 'pinned' ? p.pinned : tier === 'short' ? p.shortterm : tier === 'mid' ? p.mid : p.longterm) as any;
}
export function addPoolPinned(cid: string, text: string): void {
  const p = getPool(cid); if (!p || !text.trim()) return;
  p.pinned.push({ id: uid('pp'), text: text.trim(), ts: now() }); savePool(p);
}
export function pinPoolSummary(cid: string, tier: 'short' | 'mid' | 'long', itemId: string): void {
  const p = getPool(cid); if (!p) return;
  const src = poolArr(p, tier).find(x => x.id === itemId);
  if (!src) return;
  p.pinned.push({ id: uid('pp'), text: src.text, ts: now() }); savePool(p);
}
export function editPoolItem(cid: string, tier: PoolTier, itemId: string, text: string): void {
  const p = getPool(cid); if (!p) return;
  const it = poolArr(p, tier).find(x => x.id === itemId); if (!it) return;
  (it as { text: string }).text = text; savePool(p);
}
export function deletePoolItem(cid: string, tier: PoolTier, itemId: string): void {
  const p = getPool(cid); if (!p) return;
  if (tier === 'pinned') p.pinned = p.pinned.filter(x => x.id !== itemId);
  else if (tier === 'short') p.shortterm = p.shortterm.filter(x => x.id !== itemId);
  else if (tier === 'mid') p.mid = p.mid.filter(x => x.id !== itemId);
  else p.longterm = p.longterm.filter(x => x.id !== itemId);
  savePool(p);
}
export function clearPoolTier(cid: string, tier: PoolTier): void {
  const p = getPool(cid); if (!p) return;
  if (tier === 'pinned') p.pinned = []; else if (tier === 'short') p.shortterm = [];
  else if (tier === 'mid') p.mid = []; else p.longterm = [];
  savePool(p);
}
// 手动改某条的重要性权重 importance（1~3）。
export function setPoolItemImportance(cid: string, tier: 'short' | 'mid' | 'long', itemId: string, imp: MemImportance): void {
  const p = getPool(cid); if (!p) return;
  const it = poolArr(p, tier).find(x => x.id === itemId); if (!it) return;
  (it as { importance?: MemImportance }).importance = imp; savePool(p);
}
// 手动新增条目：任意层直接手写种入一条（开档垫底 / 纠错）。
export function addPoolItem(cid: string, tier: 'short' | 'mid' | 'long', text: string): void {
  const p = getPool(cid); const t = (text || '').trim(); if (!p || !t) return;
  const item = { id: uid('pi'), text: t, ts: now(), sourceCount: 0, importance: 2 as MemImportance, source: '亲历' as MemSource };
  if (tier === 'short') p.shortterm.push(item); else if (tier === 'mid') p.mid.push(item); else p.longterm.push(item);
  savePool(p);
}

// ==================== 未了之事（旁路·永不压缩）====================
export function addPoolUnfinished(cid: string, text: string): void {
  const p = getPool(cid); const t = (text || '').trim(); if (!p || !t) return;
  p.unfinished.push({ id: uid('pu'), text: t, ts: now() }); savePool(p);
}
export function togglePoolUnfinished(cid: string, itemId: string): void {
  const p = getPool(cid); if (!p) return;
  const it = p.unfinished.find(x => x.id === itemId); if (!it) return;
  it.done = !it.done; savePool(p);
}
export function editPoolUnfinished(cid: string, itemId: string, text: string): void {
  const p = getPool(cid); if (!p) return;
  const it = p.unfinished.find(x => x.id === itemId); if (!it) return;
  it.text = text; savePool(p);
}
export function deletePoolUnfinished(cid: string, itemId: string): void {
  const p = getPool(cid); if (!p) return;
  p.unfinished = p.unfinished.filter(x => x.id !== itemId); savePool(p);
}

// ==================== 手动总结 / 选择总结 / 跨层合并 ====================
// 手动立即归档：不等阈值，立刻把当前 shortterm 归纳一条中期（跨过触发量）。
export async function manualPoolSummarize(cid: string, summarize: MemSummarizer): Promise<CharPool | null> {
  return runPoolMidCompress(cid, summarize);
}
// 手动选择总结：勾选某一层里任意几条 → AI 只把这几条压成一条（落回同层或上一层）。
//   dest: 'same' 落回本层 / 'up' 落到上一层（short→mid / mid→long）。
export async function selectiveSummarize(
  cid: string, tier: 'short' | 'mid' | 'long', itemIds: string[], dest: 'same' | 'up', summarize: MemSummarizer,
): Promise<CharPool | null> {
  const p = getPool(cid); if (!p || !itemIds.length) return p;
  const arr = poolArr(p, tier);
  const picked = arr.filter(x => itemIds.includes(x.id)); if (!picked.length) return p;
  const cfg = effectivePoolConfig(p);
  const cap = tier === 'short' ? (dest === 'up' ? cfg.midCap : cfg.recentCap) : tier === 'mid' ? (dest === 'up' ? cfg.farCap : cfg.midCap) : cfg.farCap;
  const body = picked.map((x, i) => `${i + 1}. ${x.text}`).join('\n');
  const sys = renderMergePrompt(body, cap);
  let text = ''; try { text = (await summarize({ system: sys, user: body })).trim(); } catch (e) { void e; return p; }
  if (!text) return p;
  // 从原层移除被选中的
  const rest = arr.filter(x => !itemIds.includes(x.id));
  const merged = { id: uid('pms'), text, ts: now(), sourceCount: picked.length, importance: 2 as MemImportance, source: '亲历' as MemSource };
  const destTier: PoolTier = dest === 'up' ? (tier === 'short' ? 'mid' : 'long') : tier;
  if (tier === 'short') p.shortterm = rest as ShortSummary[];
  else if (tier === 'mid') p.mid = rest as MidSummary[];
  else p.longterm = rest as LongSummary[];
  if (destTier === 'short') p.shortterm.push(merged);
  else if (destTier === 'mid') p.mid.push(merged);
  else p.longterm.push(merged);
  savePool(p);
  return getPool(cid);
}
// 跨层条目合并：自定义跨层勾选任意条（远/中/近混选）→ 合并成一条，落到最高被选层（远>中>近）。
export async function mergePoolItems(
  cid: string, picks: { tier: 'short' | 'mid' | 'long'; id: string }[], summarize: MemSummarizer,
): Promise<CharPool | null> {
  const p = getPool(cid); if (!p || picks.length < 1) return p;
  const rank = { short: 1, mid: 2, long: 3 } as const;
  let topTier: 'short' | 'mid' | 'long' = 'short';
  const texts: string[] = [];
  for (const pk of picks) {
    const it = poolArr(p, pk.tier).find(x => x.id === pk.id); if (!it) continue;
    texts.push(it.text);
    if (rank[pk.tier] > rank[topTier]) topTier = pk.tier;
  }
  if (!texts.length) return p;
  const cfg = effectivePoolConfig(p);
  const cap = topTier === 'long' ? cfg.farCap : topTier === 'mid' ? cfg.midCap : cfg.recentCap;
  const body = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const sys = renderMergePrompt(body, cap);
  let text = ''; try { text = (await summarize({ system: sys, user: body })).trim(); } catch (e) { void e; return p; }
  if (!text) return p;
  // 移除全部被选中的条目
  const pickSet = new Set(picks.map(x => x.tier + ':' + x.id));
  p.shortterm = p.shortterm.filter(x => !pickSet.has('short:' + x.id));
  p.mid = p.mid.filter(x => !pickSet.has('mid:' + x.id));
  p.longterm = p.longterm.filter(x => !pickSet.has('long:' + x.id));
  const merged = { id: uid('pmg'), text, ts: now(), sourceCount: texts.length, importance: 3 as MemImportance, source: '亲历' as MemSource };
  if (topTier === 'short') p.shortterm.push(merged); else if (topTier === 'mid') p.mid.push(merged); else p.longterm.push(merged);
  savePool(p);
  return getPool(cid);
}

// —— 读取：组装该角色的池记忆块（关键设定 + 远/中/近 全带 + 未了之事 + 认知边界）——
// 三层是压缩递进关系、层间零重复，故远/中/近全部带（不「只带最近 N 条」）。
// 供任何「以该角色身份」生成的 app 注入为记忆块。静音则返回空。不含 raw（raw 由会话侧就近提供）。
export function buildPoolContext(cid: string): string {
  const p = getPool(cid);
  if (!p || p.muted) return '';
  const parts: string[] = [];
  if (p.pinned.length) parts.push('【关键设定】\n' + p.pinned.map(x => `· ${x.text}`).join('\n'));
  if (p.longterm.length) parts.push('【她记得的过往主线】\n' + p.longterm.map(x => x.text).join('\n'));
  if (p.mid.length) parts.push('【近来这段】\n' + p.mid.map(x => x.text).join('\n'));
  if (p.shortterm.length) parts.push('【最近发生】\n' + p.shortterm.map(x => `· ${x.text}`).join('\n'));
  const open = (p.unfinished || []).filter(x => !x.done);
  if (open.length) parts.push('【还没了结的事】\n' + open.map(x => `· ${x.text}`).join('\n'));
  if (parts.length) parts.push('（以上是她所知的全部；未记录的事，她并不知情。）');
  return parts.join('\n\n');
}
// 池注入预览（全文 + token 估算 + 静音态），供记忆池面板与各 app 设置预览。
export function previewPoolInjection(cid: string): { text: string; tokens: number; muted: boolean } {
  const p = getPool(cid);
  if (!p) return { text: '', tokens: 0, muted: false };
  if (p.muted) return { text: '', tokens: 0, muted: true };
  const text = buildPoolContext(cid);
  return { text, tokens: estimateTokens(text), muted: false };
}



// ==================== 原始对话写入 + 钉住/编辑/删除 ====================
// 追加一条对话到缓冲。返回是否「已达小结触发量」——字数为主尺 + 条数保底，先到为准。
export function appendTurn(id: string, role: MemRole, content: string): { session: MemorySession; reachedThreshold: boolean } {
  const s = getSession(id) || blankSession(id, 'unknown', '未知', id);
  s.buffer.push({ id: uid('t'), role, content, ts: now() });
  saveSession(s);
  const cfg = effectiveMemConfig(s);
  const chars = s.buffer.reduce((n, t) => n + (t.content ? t.content.length : 0), 0);
  const reached = chars >= cfg.charThreshold || s.buffer.length >= cfg.shortThreshold;
  return { session: s, reachedThreshold: reached };
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
// 把某条小结/中期/远期总结提升为关键设定（钉住）
export function pinSummary(id: string, tier: 'short' | 'mid' | 'long', itemId: string): void {
  const s = getSession(id); if (!s) return;
  const src = (tier === 'short' ? s.shortterm : tier === 'mid' ? s.mid : s.longterm).find(x => x.id === itemId);
  if (!src) return;
  s.pinned.push({ id: uid('p'), text: src.text, ts: now() }); saveSession(s);
}
// 编辑任意层条目文本
export function editMemItem(id: string, tier: 'pinned' | 'short' | 'mid' | 'long' | 'buffer', itemId: string, text: string): void {
  const s = getSession(id); if (!s) return;
  const arr: { id: string; text?: string; content?: string }[] =
    tier === 'pinned' ? s.pinned : tier === 'short' ? s.shortterm : tier === 'mid' ? s.mid : tier === 'long' ? s.longterm : s.buffer;
  const it = arr.find(x => x.id === itemId); if (!it) return;
  if (tier === 'buffer') (it as RawTurn).content = text; else (it as { text: string }).text = text;
  saveSession(s);
}
export function deleteMemItem(id: string, tier: 'pinned' | 'short' | 'mid' | 'long' | 'buffer', itemId: string): void {
  const s = getSession(id); if (!s) return;
  if (tier === 'pinned') s.pinned = s.pinned.filter(x => x.id !== itemId);
  else if (tier === 'short') s.shortterm = s.shortterm.filter(x => x.id !== itemId);
  else if (tier === 'mid') s.mid = s.mid.filter(x => x.id !== itemId);
  else if (tier === 'long') s.longterm = s.longterm.filter(x => x.id !== itemId);
  else s.buffer = s.buffer.filter(x => x.id !== itemId);
  saveSession(s);
}
// 按内容从 raw buffer 移除匹配的对话轮次（显示层删/撤回消息时，同步清提示词记忆，避免残留）。
//   assistant 轮次可能是多条气泡用 \n 合并的一条 turn——删单条气泡时按「整行包含」剔除该行；整轮空了就删掉这条 turn。
//   role 可选：只在该角色的轮次里匹配（'user'/'assistant'），避免误删对面同文。返回实际改动的 turn 数。
export function dropBufferByContent(id: string, content: string, role?: MemRole): number {
  const s = getSession(id); if (!s) return 0;
  const needle = (content || '').trim();
  if (!needle) return 0;
  let changed = 0;
  const kept: RawTurn[] = [];
  for (const t of s.buffer) {
    if (role && t.role !== role) { kept.push(t); continue; }
    if (t.content === needle) { changed++; continue; }               // 整条 turn 就是这条消息 → 删
    if (t.content.includes(needle)) {                                 // 多气泡合并的 turn → 剔掉匹配行
      const lines = t.content.split('\n').filter(ln => ln.trim() !== needle);
      const rebuilt = lines.join('\n').trim();
      changed++;
      if (rebuilt) { t.content = rebuilt; kept.push(t); }             // 还剩别的气泡 → 保留改写后的
      continue;                                                        // 剔空 → 丢弃整条 turn
    }
    kept.push(t);
  }
  if (changed) { s.buffer = kept; saveSession(s); }
  return changed;
}
// 清空某层（pinned 一般不清）
export function clearTier(id: string, tier: 'pinned' | 'short' | 'mid' | 'long' | 'buffer'): void {
  const s = getSession(id); if (!s) return;
  if (tier === 'pinned') s.pinned = []; else if (tier === 'short') s.shortterm = [];
  else if (tier === 'mid') s.mid = []; else if (tier === 'long') s.longterm = []; else s.buffer = [];
  saveSession(s);
}

// MEM_SUMMARY_PLACEHOLDER

// ==================== 小结 / 归纳 / 主线 压缩 引擎（注入式 summarize）====================
// 三层压缩：记忆总结提示词分三条（近期小结 / 中期归纳 / 远期主线），均可编辑（进 prompt-registry）。
//   - 「对话」用中性的「记录」——很多 app（小红书/B站/日历/淘宝…）没有对话，是动态/条目/行为流。
//   - 模板 id：memory.summarize.short / .mid / .long，可在「记忆」app 的设置里编辑。
//   - 占位符：{{content}}=待压缩文本；{{prev}}=已有上层记忆（mid/long 用）；{{cap}}=字数上限（自动填当前配置）。
const SHORT_PROMPT_ID = 'memory.summarize.short';
const MID_PROMPT_ID = 'memory.summarize.mid';
const LONG_PROMPT_ID = 'memory.summarize.long';
const MERGE_PROMPT_ID = 'memory.summarize.merge';
const SHORT_SYS_DEFAULT =
  '你是一名专业的「角色记忆官」，为长程角色扮演维护一条连贯、可被后续生成直接复用的近期记忆。\n'
  + '下面是一段最近发生的记录（可能是对话，也可能是动态、互动、行为或事件流）。请把它提炼成一条紧凑而细节丰富的【近期记忆】。\n'
  + '优先保留（按重要性）：①真正发生的关键事件、行为与转折；②任何承诺、约定、计划、约定时间地点、未兑现的伏笔；③人物关系/态度/情感/亲密度的变化（谁对谁，怎么变的）；④暴露出来的新设定、新身份、新秘密、新偏好；⑤强烈或反常的情绪与态度。\n'
  + '丢弃：寒暄、重复、语气词、纯氛围铺陈、无信息量的闲聊与套话。\n'
  + '写法：第三人称客观陈述，点名具体的人与事（不要用「对方」「ta」这类模糊指代），按发生顺序串成连贯记忆，不超过 {{cap}} 字。只输出这段记忆文本本身，不要标题、不要列表符号、不要任何解释。\n'
  + '【待提炼的记录】\n{{content}}';
const MID_SYS_DEFAULT =
  '你是一名专业的「角色记忆官」，负责把多条【近期记忆】归纳为一条中等粒度的【中期记忆】，承接近期与远期主线。\n'
  + '请把下面多条近期记忆合并、去重、归纳成一条中期记忆（若已有中期记忆，则在其基础上更新脉络，而非另起）。\n'
  + '着重提炼：①这段时间的整体脉络与阶段性进展（发生了哪些相互关联的事，走到了哪一步）；②反复出现或有后续影响的事件、关系变化；③仍悬而未决的线索、约定、目标与伏笔；④这段时间新确立的设定或事实。\n'
  + '舍弃：仅出现一次、对后续无影响的琐碎细节；但不要过度压缩以致丢失脉络。\n'
  + '写法：第三人称客观陈述，点名具体的人与事，按时间或因果脉络组织成连贯段落，不超过 {{cap}} 字。只输出这段记忆文本本身，不要标题、不要列表符号、不要任何解释。\n'
  + '{{prev}}【待归纳的近期记忆】\n{{content}}';
const LONG_SYS_DEFAULT =
  '你是一名专业的「角色记忆官」，负责把多条【中期记忆】并入一条贯穿全局的【远期主线】记忆。\n'
  + '请把下面多条中期记忆合并、去重、高度压缩进主线（若已有远期主线，则在其基础上更新，而非另起）。\n'
  + '着重提炼：①关系/剧情的整体走向与当前所处阶段（从哪里来、到了哪一步）；②影响深远的重大事件与转折；③至今仍未了结的核心线索、约定、目标；④已被确立为既定事实的关键设定与人物底色。\n'
  + '舍弃：阶段性的、已被后续覆盖或已了结的细节——远期主线只留经久的事实与走向。\n'
  + '写法：第三人称客观陈述，点名具体的人与事，按时间或因果脉络组织成连贯段落，不超过 {{cap}} 字。只输出这段记忆文本本身，不要标题、不要列表符号、不要任何解释。\n'
  + '{{prev}}【待并入主线的中期记忆】\n{{content}}';
const MERGE_SYS_DEFAULT =
  '你是一名专业的「角色记忆官」。玩家手动挑选了下面这几条记忆，希望你把它们合并成一条更凝练的记忆。\n'
  + '请把它们合并、去重、压缩成一条连贯的记忆，保留其中真正重要的事件、关系变化、承诺与设定，剔除重复与冗余。\n'
  + '写法：第三人称客观陈述，点名具体的人与事，组织成连贯段落，不超过 {{cap}} 字。只输出这段记忆文本本身，不要标题、不要列表符号、不要任何解释。\n'
  + '【待合并的记忆】\n{{content}}';
let _memPromptsRegistered = false;
function ensureMemPrompts(): void {
  if (_memPromptsRegistered) return;
  _memPromptsRegistered = true;
  registerPromptTemplate({
    id: SHORT_PROMPT_ID, appId: 'memory', appName: '记忆',
    name: '近期记忆·小结', desc: '攒够一批原始记录后，压成一条近期记忆时用的提示词（全 app 通用）。',
    vars: [{ key: 'content', desc: '待提炼的原始记录文本（自动填入）' }, { key: 'cap', desc: '字数上限（自动填入）' }],
    default: SHORT_SYS_DEFAULT,
  });
  registerPromptTemplate({
    id: MID_PROMPT_ID, appId: 'memory', appName: '记忆',
    name: '中期记忆·归纳', desc: '攒够多条近期记忆后，归纳成一条中期记忆时用的提示词（全 app 通用）。',
    vars: [{ key: 'content', desc: '待归纳的近期记忆列表（自动填入）' }, { key: 'prev', desc: '已有中期记忆（自动填入，可能为空）' }, { key: 'cap', desc: '字数上限（自动填入）' }],
    default: MID_SYS_DEFAULT,
  });
  registerPromptTemplate({
    id: LONG_PROMPT_ID, appId: 'memory', appName: '记忆',
    name: '远期主线·归档', desc: '攒够多条中期记忆后，并入远期主线时用的提示词（全 app 通用）。',
    vars: [{ key: 'content', desc: '待并入主线的中期记忆列表（自动填入）' }, { key: 'prev', desc: '已有远期主线（自动填入，可能为空）' }, { key: 'cap', desc: '字数上限（自动填入）' }],
    default: LONG_SYS_DEFAULT,
  });
  registerPromptTemplate({
    id: MERGE_PROMPT_ID, appId: 'memory', appName: '记忆',
    name: '手动合并·压缩', desc: '玩家手动勾选若干条记忆合并成一条时用的提示词。',
    vars: [{ key: 'content', desc: '待合并的记忆列表（自动填入）' }, { key: 'cap', desc: '字数上限（自动填入）' }],
    default: MERGE_SYS_DEFAULT,
  });
}
ensureMemPrompts();

// 渲染分层压缩提示词：{{prev}} 已有上层记忆（可空）、{{content}} 待压缩、{{cap}} 字数上限。
function renderTierPrompt(promptId: string, prev: string, content: string, cap: number): string {
  return getPromptText(promptId)
    .replace(/\{\{\s*prev\s*\}\}/g, prev ? `【已有记忆】\n${prev}\n\n` : '')
    .replace(/\{\{\s*prevLong\s*\}\}/g, prev ? `【已有记忆】\n${prev}\n\n` : '')  // 兼容旧模板占位
    .replace(/\{\{\s*content\s*\}\}/g, content)
    .replace(/\{\{\s*cap\s*\}\}/g, String(cap));
}
function renderMergePrompt(content: string, cap: number): string {
  return getPromptText(MERGE_PROMPT_ID)
    .replace(/\{\{\s*content\s*\}\}/g, content)
    .replace(/\{\{\s*cap\s*\}\}/g, String(cap));
}

function turnsToText(turns: RawTurn[]): string {
  return turns.map(t => `${t.role === 'user' ? '我' : '对方'}：${t.content}`).join('\n');
}

// 触发近期小结：把 buffer 压成一条近期记忆，清空 buffer。达阈值则级联向上归纳（近期→中期→远期）。
// summarize 由上层注入（ai-chat 提供真实 generate；记忆面板可注入轻量 generateRaw 包装）。
// 分流：若会话绑定了 contactId，则小结成果不落本会话，而是归档进该角色的记忆池
//   （zero-dup：raw 在 buffer→小结前只此一份，小结后只在池一份）；未绑定则维持会话三层。
// 手动把 buffer 立即小结（即使未达阈值）
export async function manualSummarize(id: string, summarize: MemSummarizer): Promise<MemorySession | null> {
  return runShortSummary(id, summarize);
}

export async function runShortSummary(id: string, summarize: MemSummarizer): Promise<MemorySession | null> {
  const s = getSession(id); if (!s || !s.buffer.length) return s;
  const cfg = effectiveMemConfig(s);
  const content = turnsToText(s.buffer);
  const sys = renderTierPrompt(SHORT_PROMPT_ID, '', content, cfg.recentCap);
  let text = '';
  try { text = (await summarize({ system: sys, user: content })).trim(); } catch (e) { void e; return s; }
  if (!text) return s;
  s.buffer = [];
  saveSession(s);
  if (s.contactId) {
    // 归档进角色池（含级联向上压缩），本会话只清 buffer。
    await archiveToPool(s.contactId, s.title, s.appId, s.appName, text, summarize);
    return getSession(id);
  }
  s.shortterm.push({ id: uid('ss'), text, ts: now(), sourceCount: 0, importance: 2, source: '亲历', appId: s.appId });
  saveSession(s);
  // 级联：近期→中期→远期
  if (s.shortterm.length >= cfg.midThreshold) { await runMidCompress(id, summarize); }
  const s2 = getSession(id);
  if (s2 && s2.mid.length >= cfg.farThreshold) { await runLongCompress(id, summarize); }
  return getSession(id);
}

// 会话·近期→中期归纳：把 short 归纳成一条 mid，清空 short。手动按钮也调这里。
export async function runMidCompress(id: string, summarize: MemSummarizer): Promise<MemorySession | null> {
  const s = getSession(id); if (!s || !s.shortterm.length) return s;
  const cfg = effectiveMemConfig(s);
  const prevMid = s.mid.map(m => m.text).join('\n');
  const shorts = s.shortterm.map((x, i) => `${i + 1}. ${x.text}`).join('\n');
  const sys = renderTierPrompt(MID_PROMPT_ID, prevMid, shorts, cfg.midCap);
  const user = `${prevMid ? `已有中期记忆：\n${prevMid}\n\n` : ''}待归纳的近期记忆：\n${shorts}`;
  let text = ''; try { text = (await summarize({ system: sys, user })).trim(); } catch (e) { void e; return s; }
  if (!text) return s;
  s.mid.push({ id: uid('ms'), text, ts: now(), sourceCount: s.shortterm.length, importance: 2, source: '亲历' });
  s.shortterm = [];
  saveSession(s);
  return getSession(id);
}

// 会话·中期→远期主线：把 mid 合并成一条 long，清空 mid。手动按钮也调这里。
export async function runLongCompress(id: string, summarize: MemSummarizer): Promise<MemorySession | null> {
  let s = getSession(id); if (!s) return s;
  if (!s.mid.length && s.shortterm.length) { await runMidCompress(id, summarize); s = getSession(id); }
  if (!s || !s.mid.length) return s;
  const cfg = effectiveMemConfig(s);
  const prevLong = s.longterm.map(l => l.text).join('\n');
  const mids = s.mid.map((x, i) => `${i + 1}. ${x.text}`).join('\n');
  const sys = renderTierPrompt(LONG_PROMPT_ID, prevLong, mids, cfg.farCap);
  const user = `${prevLong ? `已有远期主线：\n${prevLong}\n\n` : ''}待并入主线的中期记忆：\n${mids}`;
  let text = ''; try { text = (await summarize({ system: sys, user })).trim(); } catch (e) { void e; return s; }
  if (!text) return s;
  s.longterm.push({ id: uid('ls'), text, ts: now(), sourceCount: s.mid.length, importance: 3, source: '亲历' });
  s.mid = [];
  saveSession(s);
  return getSession(id);
}

// MEM_CONTEXT_PLACEHOLDER

// ==================== 注入上下文构建 ====================
// 组装喂给 AI 的记忆块：关键设定(全) + 长期(全) + 最近 N 条短期 + 最近 N 条原始。
// 返回 { memoryText, recentTurns }：memoryText 进 system，recentTurns 由上层拼进对话历史。
export function buildMemoryContext(id: string): { memoryText: string; recentTurns: RawTurn[] } {
  const s = getSession(id);
  if (!s) return { memoryText: '', recentTurns: [] };
  if (s.muted) return { memoryText: '', recentTurns: [] };   // 静音会话不注入
  const cfg = effectiveMemConfig(s);
  // 分流：绑定角色的会话——记忆块 = 该角色池（全局共享）+ 本会话最近原话（即时语境，不串味）。
  if (s.contactId) {
    const poolText = buildPoolContext(s.contactId);
    const recentTurns = s.buffer.slice(-Math.max(0, cfg.recentRawCount));
    return { memoryText: poolText, recentTurns };
  }
  const parts: string[] = [];
  if (s.pinned.length) parts.push('【关键设定】\n' + s.pinned.map(p => `· ${p.text}`).join('\n'));
  if (s.longterm.length) parts.push('【她记得的过往主线】\n' + s.longterm.map(l => l.text).join('\n'));
  if (s.mid.length) parts.push('【近来这段】\n' + s.mid.map(m => m.text).join('\n'));
  if (s.shortterm.length) parts.push('【最近发生】\n' + s.shortterm.map(x => `· ${x.text}`).join('\n'));
  const open = (s.unfinished || []).filter(x => !x.done);
  if (open.length) parts.push('【还没了结的事】\n' + open.map(x => `· ${x.text}`).join('\n'));
  if (parts.length) parts.push('（以上是所知的全部；未记录的事，并不知情。）');
  const recentTurns = s.buffer.slice(-Math.max(0, cfg.recentRawCount));
  return { memoryText: parts.join('\n\n'), recentTurns };
}

// 注入预览——返回该会话此刻将注入的记忆全文 + 粗略 token 估算（静音则为空）。
export function previewMemoryInjection(id: string): { text: string; tokens: number; muted: boolean } {
  const s = getSession(id);
  if (!s) return { text: '', tokens: 0, muted: false };
  if (s.muted) return { text: '', tokens: 0, muted: true };
  const ctx = buildMemoryContext(id);
  const turnsText = ctx.recentTurns.map(t => `${t.role === 'user' ? '我' : '对方'}：${t.content}`).join('\n');
  const full = [ctx.memoryText, turnsText ? '【最近对话】\n' + turnsText : ''].filter(Boolean).join('\n\n');
  return { text: full, tokens: estimateTokens(full), muted: false };
}

// 迁移：把一个「旧会话」已存的记忆并入某角色池（一次性，绑定时调用）。
// 关键设定→池 pinned；远期→池 longterm；中期→池 mid；近期→池 shortterm（打 app 标签）；raw buffer 留会话不动。
// 迁移后清空会话的 pinned/long/mid/short（避免双份注入），buffer 保留继续就近提供最近原话。
export function migrateSessionToPool(id: string, contactId: string): void {
  const s = getSession(id); if (!s || !contactId) return;
  const hasOld = s.pinned.length || s.longterm.length || s.mid.length || s.shortterm.length;
  if (!hasOld) return;
  const p = ensurePool(contactId, s.title);
  for (const x of s.pinned) p.pinned.push({ id: uid('pp'), text: x.text, ts: x.ts });
  for (const x of s.longterm) p.longterm.push({ id: uid('pl'), text: x.text, ts: x.ts, sourceCount: x.sourceCount });
  for (const x of s.mid) p.mid.push({ id: uid('pm'), text: x.text, ts: x.ts, sourceCount: x.sourceCount });
  for (const x of s.shortterm) {
    const tagged = s.appName ? `〔${s.appName}〕${x.text}` : x.text;
    p.shortterm.push({ id: uid('ps'), text: tagged, ts: x.ts, sourceCount: x.sourceCount });
  }
  const moved = s.shortterm.length + s.mid.length;
  if (moved) p.sources[s.appId] = (p.sources[s.appId] || 0) + moved;
  savePool(p);
  s.pinned = []; s.longterm = []; s.mid = []; s.shortterm = [];
  saveSession(s);
}

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_memory__ = {
    listSessions, listSessionsByApp, getSession, ensureSession, deleteSession,
    appendTurn, buildMemoryContext, effectiveMemConfig,
    // 角色记忆池
    listPools, getPool, ensurePool, deletePool, archiveToPool, noteToPool,
    buildPoolContext, previewPoolInjection, migrateSessionToPool,
  };
} catch (e) { void e; }
