// world-state-store.ts — 结构化「世界态」存储。
// 维护一份「霜月仙宫」全局世界态，由 LLM 每轮（或手动）推演更新，再翻译成散文注入正文。
// 全部维度以喜剧日常基调建模：无骰子、无严肃终局。
import { readWorldJson, writeWorldJson, WORLD_LS_KEYS } from './world-store';

// ---- 枚举（全部喜剧日常基调，无严肃终局）----
export const THREAD_STAGES = ['苗头', '发酵', '高潮', '圆满收尾'] as const; // 单元剧节奏，最终都甜蜜收场
export type ThreadStage = (typeof THREAD_STAGES)[number];

export const PALACES = ['谪仙宫', '听风宫', '邀月宫', '飞雪宫', '葬花宫', '凝霜宫'] as const;
export type PalaceName = (typeof PALACES)[number];

export const RIVALRY_STAGES = ['暗自较劲', '明面过招', '结盟瓜分', '一笑泯恩仇'] as const;
export type RivalryStage = (typeof RIVALRY_STAGES)[number];

export const VIBE_MOODS = ['热闹', '慵懒', '甜腻', '鸡飞狗跳', '备战中', '微醺'] as const;
export type VibeMood = (typeof VIBE_MOODS)[number];

export const BUZZ_KINDS = ['官宣', '小道消息', '匿名爆料', '吃瓜围观'] as const;
export type BuzzKind = (typeof BUZZ_KINDS)[number];

// ---- 各实体 ----
export type WThread = {        // 日常单元剧线索
  name: string;
  stage: ThreadStage;
  heat: 1 | 2 | 3;             // 话题热度（1=小打小闹 3=全宫围观），不带失控含义
  desc: string;
  stall?: boolean;            // 暂时搁置（仍可恢复）
};
export type WPalace = {        // 六大宫殿动态
  name: PalaceName;
  busy: string;               // 最近在忙什么（企划/八卦/后勤/研发/风纪/教务）
  mood: string;               // 氛围标签
  toward: string;             // 该宫对 {{user}} 的态度（友好打趣/暗中关照/想拉去帮忙…）
};
export type WBuzz = {          // 仙宫八卦/小道消息
  topic: string;
  kind: BuzzKind;
  spread: 1 | 2 | 3 | 4;      // 传到哪了：1=小圈子 2=一个宫 3=半个仙宫 4=全宫+学园
  content: string;
  source: string;             // 传播链（谁说的→传到谁）
  quiet?: number;             // 内部：连续未更新轮数（用于自然消散），禁输出
};
export type WCharm = {         // 万花镜人气
  beauty: string;             // 形体之美评价（五档：路人/小有名气/受瞩目/人气担当/顶流仙子）
  soul: string;               // 心灵之美评价
  rank: string;               // 当前打榜位次描述（如"本周榜 Top3""新晋黑马"）
  topic: string;              // 话题度（最近因什么上热搜）
  lastChange: string;         // 本轮变化简述
};
export type WSignal = { summary: string; scope: string };
export type WVibe = {          // 仙宫今日氛围
  mood: VibeMood;
  signals: WSignal[];         // 小事信号（外卖爆单/快递阵法堵了/新番更新/某宫在赶工）
};
export type WRivalry = {       // 争宠修罗场（绝不真敌对）
  who: string;                // 谁和谁（如"清惜 × 陆雪琪"）
  over: string;               // 在争 {{user}} 的什么份额（早餐投喂权/同桌位/周末约会…）
  stage: RivalryStage;
  desc: string;
};
export type WSeason = {        // 当季大事件（节日历/总选举/学园祭）
  name: string;
  scope: string;
  status: '筹备中' | '进行中' | '已落幕';
  desc: string;
};
export type WSecret = {        // 私房悄悄话（保留"无目击→不外传"机制）
  what: string;               // 悄悄发生的事（独处/私密互动/还没被发现的黑历史）
  witnesses: string;          // "无" / "仅XX"
  exposure: number;           // 0-100 被发现风险
};
export type WPlace = {         // 地点动态（绑定地点世界书条目后推演其日常）
  name: string;               // 地点名（对应世界书地点条目名）
  busy: string;               // 这地方最近在发生什么/谁常来
  mood: string;               // 此处的氛围
  wbKey?: string;             // 绑定的世界书条目 key（book::entry），推演时注入该地点设定
};

// ---- 人气榜单 / 企划 / 社团 / 时令 等维度 ----
export type RankTrend = '↑' | '↓' | '→' | 'NEW';
export type WRankEntry = {     // 万花镜人气榜单条目
  name: string;               // 上榜者（仙主/弟子名，取自花名册）
  rank: number;               // 名次（1=No.1）
  trend: RankTrend;           // 较上轮涨跌
  reason: string;             // 因何在此位（近期作品/综艺/热搜/黑料）
};
export type WRanking = {       // 本周万花镜打榜快照
  title: string;              // 榜单名（如「本周万花镜周榜」「总选举中期速报」）
  entries: WRankEntry[];      // 前若干名
  note: string;               // 打榜大环境一句话（拉票白热化/黑马杀出/官方限流…）
};
export type WVariety = {       // 偶像企划 / 自制综艺动态
  name: string;               // 节目/企划名
  kind: '综艺' | '打歌舞台' | '总选举' | '对抗赛' | 'MV拍摄' | '直播' | '握手会';
  stage: '企划中' | '录制中' | '后期剪辑' | '待播' | '播出中' | '已收官';
  hook: string;               // 本期最大看点/名场面/名梗
  host: string;               // 主办/出镜的宫或社团
};
export type WClub = {          // 星见丘学园社团动态（电竞社/天文社/调酒社/躺平部/放送部…）
  name: string;               // 社团名
  lead: string;               // 社长/负责人（取自设定）
  doing: string;              // 最近在忙的活动/闹剧/招新
  mood: string;               // 社团此刻的气氛
};
export type WCalendar = {      // 时令节气（学期制 + 日式节日历，与 season 呼应、可喂日历 app）
  season: string;             // 当前季节/学期阶段（樱花季/初夏/期中周/暑假/文化祭季…）
  festival: string;           // 临近或进行中的节日/校园大事（夏日祭/学园祭/圣诞/情人节/修学旅行…）
  daysToNext: string;         // 距下一个大事的体感（如「文化祭还有约两周」，非精确日期）
  ambiance: string;           // 物候与街景氛围（樱花坡/蝉鸣/初雪/暖炉…绑定海边小镇景观）
};

// 氛围 3 维：每维 AI 现生成三个氛围词 + 一句具体描述（不从固定词库选）。normalize 兼容旧单值。
export type WAmbienceDim = { words: string[]; line: string };
export type WAmbience3 = {
  palace: WAmbienceDim;   // 仙宫内氛围
  academy: WAmbienceDim;  // 星见丘学院氛围
  public: WAmbienceDim;   // 对外舆论氛围
};
// 身份双轨：同一角色的「学院身份 + 宫殿归属」双标签（如 清惜=文艺委员+谪仙宫）。
export type WIdentity = { name: string; academy: string; palace: string };
// 六大宫殿实体（左栏·固定6）：职能 + 近况 + 氛围
export type WPalaceEntity = { name: PalaceName; duty: string; recent: string; mood: string; wbKey?: string };
// 突发事件（AI 加权·去骰子·带冷却）：从现有维度长出的应景突发
export type WIncident = { text: string; from: string; cooldown: number }; // cooldown=剩余冷却轮数

export type WorldState = {
  round: number;
  digest: string;             // 本轮后台叙事（150-200字，不提 {{user}}）
  threads: WThread[];
  palaces: WPalace[];
  buzz: WBuzz[];
  charm: WCharm;
  vibe: WVibe;
  rivalries: WRivalry[];
  season: WSeason[];
  secrets: WSecret[];
  places: WPlace[];
  ranking: WRanking | null;   // 万花镜打榜快照（主榜）
  variety: WVariety[];        // 偶像企划/综艺
  clubs: WClub[];             // 学园社团动态
  calendar: WCalendar | null; // 时令节气
  // 以下维度全部可选·向后兼容
  ambience3?: WAmbience3 | null;      // 氛围 3 维（仙宫内/学院/对外）
  subRankings?: WRanking[];           // 万花镜多子榜（10 子榜，每榜 entries）
  identities?: WIdentity[];           // 身份双轨花名册
  palaceEntities?: WPalaceEntity[];   // 六大宫殿实体（左栏·固定6）
  incidents?: WIncident[];            // 突发事件
  lastResult: any;
  updatedAt: number;
};

// 各维度条数上限（控 token）
const CAP = { threads: 12, palaces: 6, buzz: 12, signals: 6, rivalries: 8, season: 4, secrets: 10, places: 16, rankEntries: 10, variety: 6, clubs: 8, subRankings: 10, identities: 40, palaceEntities: 6, incidents: 6 };
// 万花镜 10 子榜标准分类（前5常显，后5可切）
export const MIRROR_SUBRANK_TITLES = ['形体之美', '心灵之美', '人气总选举', '本周打歌', '综艺话题', 'CP人气', '小卡销量', '学园人气', '黑红塌房', '新秀黑马'];

export const DEFAULT_CHARM: WCharm = { beauty: '小有名气', soul: '小有名气', rank: '榜单中游', topic: '暂无热搜', lastChange: '无变化' };
export const DEFAULT_VIBE: WVibe = { mood: '热闹', signals: [] };

function blank(): WorldState {
  return { round: 0, digest: '', threads: [], palaces: [], buzz: [], charm: { ...DEFAULT_CHARM }, vibe: { ...DEFAULT_VIBE }, rivalries: [], season: [], secrets: [], places: [], ranking: null, variety: [], clubs: [], calendar: null, ambience3: null, subRankings: [], identities: [], palaceEntities: [], incidents: [], lastResult: null, updatedAt: 0 };
}

// ---- 配置 ----
export type WStateConfig = {
  aiPresetName: string;
  readFloors: number;       // 推演读取正文楼层
  injectOn: boolean;        // 是否把世界态注入正文
  tonePrompt: string;       // 语气/笔调预设
  globalWbKeys: string[];   // 绑定世界书条目（世界观锚点）
  autoInterval: number;     // 每 N 楼自动推演（0=关）
  lastFloor: number;
  hiddenDims?: string[];    // 隐藏的维度 id（仪表盘不显示、也不注入），如 ['clubs','buzz']
};
export const DEFAULT_WSTATE_CONFIG: WStateConfig = { aiPresetName: '', readFloors: 4, injectOn: false, tonePrompt: '', globalWbKeys: [], autoInterval: 0, lastFloor: 0, hiddenDims: [] };
const WCFG_KEY = '_th_world_wstate_config_v1';
let _wcfg: WStateConfig | null = null;
export function getWStateConfig(): WStateConfig {
  if (_wcfg) return _wcfg;
  const raw = readWorldJson<Partial<WStateConfig>>(WCFG_KEY, {});
  _wcfg = { ...DEFAULT_WSTATE_CONFIG, ...(raw || {}) };
  if (!Array.isArray(_wcfg.globalWbKeys)) _wcfg.globalWbKeys = [];
  if (!Array.isArray(_wcfg.hiddenDims)) _wcfg.hiddenDims = [];
  return _wcfg;
}
export function saveWStateConfig(patch: Partial<WStateConfig>): WStateConfig {
  const next = { ...getWStateConfig(), ...patch };
  _wcfg = next; writeWorldJson(WCFG_KEY, next);
  return next;
}

// PLACEHOLDER_STATE_IO
// ---- 状态读写 + 规范化 ----
function clampEnum<T>(v: any, allowed: readonly T[], def: T): T {
  return (allowed as readonly any[]).includes(v) ? v : def;
}
function normalize(s: any): WorldState {
  const b = blank();
  if (!s || typeof s !== 'object') return b;
  b.round = typeof s.round === 'number' ? s.round : 0;
  b.digest = typeof s.digest === 'string' ? s.digest : '';
  b.threads = (Array.isArray(s.threads) ? s.threads : []).slice(0, CAP.threads).map((t: any) => ({
    name: String(t?.name || ''), stage: clampEnum(t?.stage, THREAD_STAGES, '苗头'),
    heat: clampEnum(t?.heat, [1, 2, 3] as const, 1), desc: String(t?.desc || ''), stall: !!t?.stall,
  })).filter((t: WThread) => t.name);
  b.palaces = (Array.isArray(s.palaces) ? s.palaces : []).slice(0, CAP.palaces).map((p: any) => ({
    name: clampEnum(p?.name, PALACES, '谪仙宫'), busy: String(p?.busy || ''), mood: String(p?.mood || ''), toward: String(p?.toward || ''),
  })).filter((p: WPalace) => p.name);
  b.buzz = (Array.isArray(s.buzz) ? s.buzz : []).slice(0, CAP.buzz).map((w: any) => ({
    topic: String(w?.topic || ''), kind: clampEnum(w?.kind, BUZZ_KINDS, '小道消息'),
    spread: clampEnum(w?.spread, [1, 2, 3, 4] as const, 1), content: String(w?.content || ''),
    source: String(w?.source || ''), quiet: typeof w?.quiet === 'number' ? w.quiet : 0,
  })).filter((w: WBuzz) => w.topic);
  const c = s.charm || {};
  b.charm = { beauty: String(c.beauty || DEFAULT_CHARM.beauty), soul: String(c.soul || DEFAULT_CHARM.soul), rank: String(c.rank || DEFAULT_CHARM.rank), topic: String(c.topic || DEFAULT_CHARM.topic), lastChange: String(c.lastChange || '无变化') };
  const v = s.vibe || {};
  b.vibe = { mood: clampEnum(v.mood, VIBE_MOODS, '热闹'), signals: (Array.isArray(v.signals) ? v.signals : []).slice(0, CAP.signals).map((x: any) => ({ summary: String(x?.summary || ''), scope: String(x?.scope || '') })).filter((x: WSignal) => x.summary) };
  b.rivalries = (Array.isArray(s.rivalries) ? s.rivalries : []).slice(0, CAP.rivalries).map((r: any) => ({
    who: String(r?.who || ''), over: String(r?.over || ''), stage: clampEnum(r?.stage, RIVALRY_STAGES, '暗自较劲'), desc: String(r?.desc || ''),
  })).filter((r: WRivalry) => r.who);
  b.season = (Array.isArray(s.season) ? s.season : []).slice(0, CAP.season).map((x: any) => ({
    name: String(x?.name || ''), scope: String(x?.scope || '仙宫'), status: clampEnum(x?.status, ['筹备中', '进行中', '已落幕'] as const, '进行中'), desc: String(x?.desc || ''),
  })).filter((x: WSeason) => x.name);
  b.secrets = (Array.isArray(s.secrets) ? s.secrets : []).slice(0, CAP.secrets).map((x: any) => ({
    what: String(x?.what || ''), witnesses: String(x?.witnesses || '无'), exposure: Math.max(0, Math.min(100, Number(x?.exposure) || 0)),
  })).filter((x: WSecret) => x.what);
  b.places = (Array.isArray(s.places) ? s.places : []).slice(0, CAP.places).map((x: any) => ({
    name: String(x?.name || ''), busy: String(x?.busy || ''), mood: String(x?.mood || ''), wbKey: x?.wbKey ? String(x.wbKey) : undefined,
  })).filter((x: WPlace) => x.name);
  if (s.ranking && typeof s.ranking === 'object') {
    const entries = (Array.isArray(s.ranking.entries) ? s.ranking.entries : []).slice(0, CAP.rankEntries).map((e: any, i: number) => ({
      name: String(e?.name || ''), rank: Number(e?.rank) > 0 ? Math.floor(Number(e.rank)) : i + 1,
      trend: clampEnum(e?.trend, ['↑', '↓', '→', 'NEW'] as const, '→'), reason: String(e?.reason || ''),
    })).filter((e: WRankEntry) => e.name).sort((a: WRankEntry, b2: WRankEntry) => a.rank - b2.rank);
    b.ranking = entries.length ? { title: String(s.ranking.title || '本周万花镜周榜'), entries, note: String(s.ranking.note || '') } : null;
  } else b.ranking = null;
  b.variety = (Array.isArray(s.variety) ? s.variety : []).slice(0, CAP.variety).map((x: any) => ({
    name: String(x?.name || ''), kind: clampEnum(x?.kind, ['综艺', '打歌舞台', '总选举', '对抗赛', 'MV拍摄', '直播', '握手会'] as const, '综艺'),
    stage: clampEnum(x?.stage, ['企划中', '录制中', '后期剪辑', '待播', '播出中', '已收官'] as const, '录制中'),
    hook: String(x?.hook || ''), host: String(x?.host || ''),
  })).filter((x: WVariety) => x.name);
  b.clubs = (Array.isArray(s.clubs) ? s.clubs : []).slice(0, CAP.clubs).map((x: any) => ({
    name: String(x?.name || ''), lead: String(x?.lead || ''), doing: String(x?.doing || ''), mood: String(x?.mood || ''),
  })).filter((x: WClub) => x.name);
  if (s.calendar && typeof s.calendar === 'object' && (s.calendar.season || s.calendar.festival)) {
    b.calendar = { season: String(s.calendar.season || ''), festival: String(s.calendar.festival || ''), daysToNext: String(s.calendar.daysToNext || ''), ambiance: String(s.calendar.ambiance || '') };
  } else b.calendar = null;
  const dim = (d2: any): WAmbienceDim => {
    // 兼容旧 {word,line}（单词）→ words[]；新 {words:[],line}
    let words: string[] = [];
    if (Array.isArray(d2?.words)) words = d2.words.map((x: any) => String(x || '')).filter(Boolean);
    else if (d2?.word) words = String(d2.word).split(/[、,，\s]+/).filter(Boolean);
    return { words: words.slice(0, 3), line: String(d2?.line || '') };
  };
  if (s.ambience3 && typeof s.ambience3 === 'object') {
    const a = s.ambience3;
    b.ambience3 = { palace: dim(a.palace), academy: dim(a.academy), public: dim(a.public) };
  } else b.ambience3 = null;
  b.subRankings = (Array.isArray(s.subRankings) ? s.subRankings : []).slice(0, CAP.subRankings).map((rk: any) => {
    const entries = (Array.isArray(rk?.entries) ? rk.entries : []).slice(0, CAP.rankEntries).map((e: any, i: number) => ({
      name: String(e?.name || ''), rank: Number(e?.rank) > 0 ? Math.floor(Number(e.rank)) : i + 1,
      trend: clampEnum(e?.trend, ['↑', '↓', '→', 'NEW'] as const, '→'), reason: String(e?.reason || ''),
    })).filter((e: WRankEntry) => e.name).sort((a: WRankEntry, b2: WRankEntry) => a.rank - b2.rank);
    return { title: String(rk?.title || ''), entries, note: String(rk?.note || '') };
  }).filter((rk: WRanking) => rk.title && rk.entries.length);
  b.identities = (Array.isArray(s.identities) ? s.identities : []).slice(0, CAP.identities).map((x: any) => ({
    name: String(x?.name || ''), academy: String(x?.academy || ''), palace: String(x?.palace || ''),
  })).filter((x: WIdentity) => x.name);
  b.palaceEntities = (Array.isArray(s.palaceEntities) ? s.palaceEntities : []).slice(0, CAP.palaceEntities).map((x: any) => ({
    name: clampEnum(x?.name, PALACES, '谪仙宫'), duty: String(x?.duty || ''), recent: String(x?.recent || ''), mood: String(x?.mood || ''), wbKey: x?.wbKey ? String(x.wbKey) : undefined,
  })).filter((x: WPalaceEntity) => x.name);
  b.incidents = (Array.isArray(s.incidents) ? s.incidents : []).slice(0, CAP.incidents).map((x: any) => ({
    text: String(x?.text || ''), from: String(x?.from || ''), cooldown: Math.max(0, Number(x?.cooldown) || 0),
  })).filter((x: WIncident) => x.text);
  b.lastResult = s.lastResult ?? null;
  b.updatedAt = typeof s.updatedAt === 'number' ? s.updatedAt : 0;
  return b;
}

export function getWorldState(): WorldState {
  return normalize(readWorldJson<any>(WORLD_LS_KEYS.wstate, null));
}
export function saveWorldState(s: WorldState): void {
  s.updatedAt = Date.now();
  writeWorldJson(WORLD_LS_KEYS.wstate, normalize(s));
}
export function resetWorldState(): void {
  writeWorldJson(WORLD_LS_KEYS.wstate, blank());
}
export function hasWorldState(): boolean {
  const s = getWorldState();
  return !!(s.digest || s.threads.length || s.palaces.length || s.buzz.length || s.rivalries.length || s.season.length || s.places.length || s.ranking || s.variety.length || s.clubs.length || s.calendar);
}

// ---- 地点管理（玩家手动绑定地点世界书条目）----
export function addPlace(name: string, wbKey?: string): void {
  const s = getWorldState();
  if (s.places.some(p => p.name === name)) { if (wbKey) { s.places = s.places.map(p => p.name === name ? { ...p, wbKey } : p); saveWorldState(s); } return; }
  s.places = [...s.places, { name, busy: '', mood: '', wbKey }].slice(-CAP.places);
  saveWorldState(s);
}
export function removePlace(name: string): void {
  const s = getWorldState();
  s.places = s.places.filter(p => p.name !== name);
  saveWorldState(s);
}
// 六大宫殿实体（左栏固定6）：绑定世界书条目 / 手动补齐。
export function ensurePalaceEntity(name: PalaceName, wbKey?: string): void {
  const s = getWorldState();
  s.palaceEntities ||= [];
  const hit = s.palaceEntities.find(p => p.name === name);
  if (hit) { if (wbKey) hit.wbKey = wbKey; saveWorldState(s); return; }
  s.palaceEntities.push({ name, duty: '', recent: '', mood: '', wbKey });
  saveWorldState(s);
}
export function setPalaceWbKey(name: PalaceName, wbKey: string | undefined): void {
  const s = getWorldState(); s.palaceEntities ||= [];
  const hit = s.palaceEntities.find(p => p.name === name);
  if (hit) { hit.wbKey = wbKey; saveWorldState(s); }
}
// 一键铺入六大宫殿骨架（据设定固定 6 宫）
export function seedPalaceEntities(): void {
  const s = getWorldState(); s.palaceEntities ||= [];
  for (const name of PALACES) { if (!s.palaceEntities.find(p => p.name === name)) s.palaceEntities.push({ name, duty: '', recent: '', mood: '' }); }
  saveWorldState(s);
}

// ---- 合并 LLM 推演结果（同名/同主题覆盖更新，其余新增；自然消散八卦）----
function upsertBy<T>(list: T[], incoming: T[], keyOf: (x: T) => string, cap: number): T[] {
  const map = new Map<string, T>();
  for (const x of list) map.set(keyOf(x), x);
  for (const x of incoming) { const k = keyOf(x); if (k) map.set(k, { ...(map.get(k) || {} as T), ...x }); }
  return Array.from(map.values()).slice(-cap);
}

/** 把一轮 LLM 推演（已 parse 的对象，字段可缺）合并进当前世界态，返回新状态。 */
export function mergeWorldUpdate(prev: WorldState, update: any): WorldState {
  const cur = normalize(prev);
  if (!update || typeof update !== 'object') return cur;
  const u = normalize({ ...update, round: cur.round, charm: update.charm, vibe: update.vibe, lastResult: null });

  if (Array.isArray(update.threads)) cur.threads = upsertBy(cur.threads, u.threads, t => t.name, CAP.threads);
  if (Array.isArray(update.palaces)) cur.palaces = upsertBy(cur.palaces, u.palaces, p => p.name, CAP.palaces);
  if (Array.isArray(update.season)) cur.season = upsertBy(cur.season, u.season, x => x.name, CAP.season);
  if (Array.isArray(update.rivalries)) cur.rivalries = upsertBy(cur.rivalries, u.rivalries, r => r.who, CAP.rivalries);

  // buzz：同 topic 覆盖并重置 quiet；未更新的 quiet+1，连续 3 轮没动静则消散
  if (Array.isArray(update.buzz)) {
    const incomingTopics = new Set(u.buzz.map(w => w.topic));
    cur.buzz = cur.buzz.map(w => incomingTopics.has(w.topic) ? w : { ...w, quiet: (w.quiet || 0) + 1 })
      .filter(w => (w.quiet || 0) < 3);
    cur.buzz = upsertBy(cur.buzz, u.buzz.map(w => ({ ...w, quiet: 0 })), w => w.topic, CAP.buzz);
  }
  // secrets：整体替换（私密黑箱由 LLM 当轮重算），保留上限
  if (Array.isArray(update.secrets)) cur.secrets = u.secrets.slice(-CAP.secrets);
  // places：同名覆盖更新（保留已绑定的 wbKey 不被清空）
  if (Array.isArray(update.places)) {
    const merged = upsertBy(cur.places, u.places, p => p.name, CAP.places);
    cur.places = merged.map(p => {
      if (p.wbKey) return p;
      const prevP = cur.places.find(x => x.name === p.name);
      return prevP?.wbKey ? { ...p, wbKey: prevP.wbKey } : p;
    });
  }

  if (update.charm && typeof update.charm === 'object') cur.charm = u.charm;
  if (update.vibe && typeof update.vibe === 'object') cur.vibe = u.vibe;
  if (typeof update.digest === 'string' && update.digest.trim()) cur.digest = update.digest.trim();

  // ranking/calendar 整体替换（当轮快照）；variety/clubs 同名覆盖更新
  if (update.ranking && typeof update.ranking === 'object') cur.ranking = u.ranking;
  if (update.calendar && typeof update.calendar === 'object') cur.calendar = u.calendar;
  if (Array.isArray(update.variety)) cur.variety = upsertBy(cur.variety, u.variety, x => x.name, CAP.variety);
  if (Array.isArray(update.clubs)) cur.clubs = upsertBy(cur.clubs, u.clubs, x => x.name, CAP.clubs);

  // ambience3 整体替换（当轮快照）；subRankings 按 title 覆盖；identities 按 name 覆盖；
  //   palaceEntities 同名覆盖并保留已绑 wbKey；incidents 整体替换（当轮蹦出的突发）。
  if (update.ambience3 && typeof update.ambience3 === 'object') cur.ambience3 = u.ambience3;
  if (Array.isArray(update.subRankings)) cur.subRankings = upsertBy(cur.subRankings || [], u.subRankings || [], x => x.title, CAP.subRankings);
  if (Array.isArray(update.identities)) cur.identities = upsertBy(cur.identities || [], u.identities || [], x => x.name, CAP.identities);
  if (Array.isArray(update.palaceEntities)) {
    const merged = upsertBy(cur.palaceEntities || [], u.palaceEntities || [], p => p.name, CAP.palaceEntities);
    cur.palaceEntities = merged.map(p => {
      if (p.wbKey) return p;
      const prevP = (cur.palaceEntities || []).find(x => x.name === p.name);
      return prevP?.wbKey ? { ...p, wbKey: prevP.wbKey } : p;
    });
  }
  if (Array.isArray(update.incidents)) cur.incidents = (u.incidents || []).slice(-CAP.incidents);

  cur.lastResult = update;
  return cur;
}

// 世界态维度条目「可编辑/删除」——按维度名+索引直接改数组。
// 供仪表盘每张卡的 ✎/🗑 小按钮调用。维度名对齐 WorldState 的数组字段。
export type WsArrayField = 'threads' | 'palaces' | 'buzz' | 'rivalries' | 'season' | 'secrets' | 'variety' | 'clubs' | 'incidents' | 'identities' | 'palaceEntities' | 'subRankings';

function wsArr(s: WorldState, field: WsArrayField): any[] {
  const v = (s as any)[field];
  if (!Array.isArray(v)) { (s as any)[field] = []; }
  return (s as any)[field];
}

/** 删除某维度里第 index 条。 */
export function deleteWsItem(field: WsArrayField, index: number): void {
  const s = getWorldState();
  const arr = wsArr(s, field);
  if (index >= 0 && index < arr.length) { arr.splice(index, 1); saveWorldState(s); }
}
/** 编辑某维度第 index 条的若干字段（浅合并）。 */
export function editWsItem(field: WsArrayField, index: number, patch: Record<string, any>): void {
  const s = getWorldState();
  const arr = wsArr(s, field);
  if (index >= 0 && index < arr.length) { arr[index] = { ...arr[index], ...patch }; saveWorldState(s); }
}
/** 编辑万花镜子榜第 rankIdx 榜、第 entryIdx 条的字段。 */
export function editSubRankEntry(rankIdx: number, entryIdx: number, patch: Record<string, any>): void {
  const s = getWorldState();
  const rk = (s.subRankings || [])[rankIdx];
  if (rk && rk.entries[entryIdx]) { rk.entries[entryIdx] = { ...rk.entries[entryIdx], ...patch }; saveWorldState(s); }
}
/** 删除万花镜子榜第 rankIdx 榜、第 entryIdx 条。 */
export function deleteSubRankEntry(rankIdx: number, entryIdx: number): void {
  const s = getWorldState();
  const rk = (s.subRankings || [])[rankIdx];
  if (rk && rk.entries[entryIdx]) { rk.entries.splice(entryIdx, 1); if (!rk.entries.length) (s.subRankings || []).splice(rankIdx, 1); saveWorldState(s); }
}
/** 删除整个万花镜子榜。 */
export function deleteSubRank(rankIdx: number): void {
  const s = getWorldState();
  if (s.subRankings && s.subRankings[rankIdx]) { s.subRankings.splice(rankIdx, 1); saveWorldState(s); }
}
/** 编辑六宫实体第 index 条。 */
export function editPalaceEntity(index: number, patch: Record<string, any>): void {
  editWsItem('palaceEntities', index, patch);
}
/** 编辑声望某轴 / 氛围某维 / digest 等单值字段。 */
export function editWsScalar(patch: Partial<WorldState>): void {
  const s = getWorldState();
  Object.assign(s, patch);
  saveWorldState(s);
}

