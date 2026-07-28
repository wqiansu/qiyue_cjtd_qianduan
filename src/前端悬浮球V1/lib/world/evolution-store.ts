// 世界演化数据层（evolution-store）
// 世界演化 APP 的纯数据读写，落 _th_world_evolution_v1（单 blob）。不碰 DOM、不碰 generate。
//   - 演化对象 EvoActor：来自离场 NPC / 联系人 / 自定义；每个对象一条独立演化时间线。
//   - 演化条目 EvoEntry：一次「推进」的产出（摘要 + 关键事件 + 可选变量变化 + 注入状态）。
// 记忆 sessionId 约定：'evo_' + actorId（appId='evolution'），由 evolution.ts 建会话时 ensureSession。
import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

export type EvoSource = 'npc' | 'contact' | 'custom' | 'world'; // world=世界背景演化线程（按维度推演，非具体角色）
// 角色独有世界书条目引用（推演时拼进该角色的设定，让 ta 的演化贴合专属设定）
export type EvoWbRef = { book: string; uid: number; name: string };

// 开放式自主目标（火候链）
//   每个对象可持有若干「盘算 / 心愿 / 正在张罗的事」，由 AI 自主生成与推进，玩家不写死方向。
//   stage 是火候阶段：0 起念 → 1 张罗中 → 2 临门一脚 → 3 已办成 → 4 余韵收尾。
export const GOAL_STAGES = ['起念', '张罗中', '临门一脚', '已办成', '余韵'] as const;
export type EvoGoal = {
  id: string;
  text: string;          // 这桩盘算/心愿是什么（AI 自主拟定，开放式）
  stage: number;         // 0-4 火候阶段（见 GOAL_STAGES）
  secret?: boolean;      // 私密盘算（无目击不外泄，回流时默认压制）
  updatedAt: number;
  resolved?: boolean;    // 已收尾/作罢
};
// 三档回流：背景（只做设定不打扰）/ 传闻（可被他人提及）/ 闯入（可主动找上主角）
export type EvoReflow = 'background' | 'rumor' | 'intrude';
export const REFLOW_LABEL: Record<EvoReflow, string> = { background: '纯背景', rumor: '可成传闻', intrude: '可闯入' };

export type EvoEntry = {
  id: string;
  ts: number;
  worldTime?: string;        // 演化锚定的世界时间（如「第三日 黄昏」），玩家给或读世界信息
  span?: string;             // 这段时间跨度的人类描述（如「约半天」）
  summary: string;           // 这段离场期间发生了什么（主文本）
  events: string[];          // 关键事件点
  injected: boolean;         // 本条是否已纳入注入（持久注入取最近若干条）
  batchId?: string;          // 同一次「批量/联合推演」产出的条目共享一个 batchId（便于关联展示）
  mood?: string;             // 该对象此刻的心境/状态一句话（驱动卡片火候条与关系网）
  goalsTouched?: string[];   // 本轮推进了哪些目标（目标文本快照，供时间线展示）
  rumor?: string;            // 传闻档：若本轮产生了「可外传的风声」，这里是其一句话版本（可空）
  reflow?: EvoReflow;        // 本条产出时的回流档（继承对象的 reflowDefault）
  collided?: string[];       // 本轮与谁产生了交集（对象名，联合推演时填）
};
export type EvoActor = {
  id: string;
  source: EvoSource;
  sourceRef?: string;        // npc: NPC 名；contact: 联系人 id；custom/world: 空
  name: string;
  persona?: string;          // 角色设定（注入演化 system 的身份依据）
  worldbookRefs?: EvoWbRef[];// 该角色专属世界书条目（推演时附加进设定）
  extraNote?: string;        // 玩家补充的额外设定/约束（推演时附加）
  dimension?: string;        // world 线程的演化维度（如「势力动向」「民生舆论」「天候环境」）
  presetKey?: string;        // 内置预设来源 key（如 'sxtd.worldview'），用于去重/标识
  customPrompt?: string;     // 该对象专属内置提示词文本（覆盖默认 advance/world 模板）
  useCustomPrompt?: boolean; // 勾选=用 customPrompt；不勾=用默认模板
  injectEnabled: boolean;    // 是否把该角色的演化结果持续注入酒馆正文生成
  timeline: EvoEntry[];      // 演化时间线（旧→新）
  createdAt: number;
  updatedAt: number;
  goals?: EvoGoal[];         // 该对象的开放式目标/盘算（AI 自主拟定与推进）
  reflowDefault?: EvoReflow; // 该对象新演化默认回流档（默认 background 纯背景）
  relations?: { to: string; tie: string }[]; // 与其他对象的关系（to=对象名，tie=一句话关系；AI 可更新）
  growth?: EvoGrowth[];      // 成长轴：随时间累积的长期变化里程碑（技艺/境界/心结/黑历史，区别于瞬时 mood）
  pinned?: boolean;          // 置顶（节拍/世界线列表优先展示）
};
// 成长里程碑：角色在漫长演化里沉淀下来的「可见变化」。
export type EvoGrowth = { ts: number; worldTime?: string; kind: EvoGrowthKind; text: string };
export type EvoGrowthKind = 'skill' | 'realm' | 'knot' | 'past' | 'bond';
export const GROWTH_KIND_LABEL: Record<EvoGrowthKind, string> = {
  skill: '技艺', realm: '境界', knot: '心结', past: '过往', bond: '羁绊',
};
// 演化订阅组：固定一组对象（角色组或地点组），正文每推进 N 楼自动推进一次。
//   mode='packed' 拼推（一次 API 推全组）/'fine' 精推（逐个单独 API，质量优先）。
export type EvoSubMode = 'packed' | 'fine';
export type EvoSubscription = {
  id: string;
  name: string;             // 订阅组名（玩家命名，如「学园三人组」「西街一带」）
  actorIds: string[];       // 组内对象 id
  everyFloors: number;      // 正文每推进 N 楼自动推进一次（0=仅手动）
  mode: EvoSubMode;         // 拼推 / 精推
  span: string;             // 每次自动推进的时间跨度描述
  enabled: boolean;
  lastFloor: number;        // 上次触发时的楼层
  createdAt: number;
};
// 世界事件/历法：跨对象的「全世界都受影响」的节庆/大事（学园祭、总选举、节气）。
// 事件阶段机——kind 决定阶段链，stage 是链上的索引。
//   冲突型：萌芽→发酵→逼近→已爆发；进展型：筹备→执行→关键→已完成。
//   festive 三态：预热→当天→余韵（节日驱动事件用）。
//   relationship 关系链：暧昧→捅破→在一起/闹掰（两个对象之间的感情线）。
//   mystery 悬念线：伏笔→线索→揭晓（埋钩子的谜题线）。fromFestival 记来源节日名。
export type EvoEventKind = 'conflict' | 'progress' | 'festive' | 'relationship' | 'mystery';
export const EVENT_STAGES: Record<EvoEventKind, string[]> = {
  conflict: ['萌芽', '发酵', '逼近', '已爆发'],
  progress: ['筹备', '执行', '关键', '已完成'],
  festive: ['预热', '当天', '余韵'],
  relationship: ['暧昧', '试探', '捅破', '尘埃落定'],
  mystery: ['伏笔', '线索浮现', '逼近真相', '揭晓'],
};
export type EvoWorldEvent = {
  id: string;
  name: string;            // 事件名
  phase: string;           // 兼容旧字段：当前阶段文字（与 stage 同步维护）
  desc: string;            // 一句话描述
  kind?: EvoEventKind;     // 事件类型（决定阶段链）
  stage?: number;          // 阶段链索引
  fromFestival?: string;   // 由哪个节日驱动而来（可空）
  updatedAt: number;
};
// 突发事件（AI 加权·去骰子·带冷却）：从现有维度长出的应景突发。
export type WIncidentSeed = { hint: string; cooldownTurn: number };
// 编年史：把里程碑级的演化沉淀成「全世界大事记」，供回归简报与长期连贯。
export type EvoChronicle = {
  id: string;
  ts: number;
  worldTime?: string;
  text: string;            // 一句话编年（如「学园祭筹备启动」「A 与 B 冰释前嫌」）
  actorName?: string;      // 归属对象（可空=世界级）
};
export type EvolutionData = {
  actors: EvoActor[];
  subscriptions?: EvoSubscription[];   // 订阅组
  worldEvents?: EvoWorldEvent[];       // 世界事件/历法
  chronicle?: EvoChronicle[];          // 编年史/大事记
  clockTurn?: number;                  // 统一世界时钟（演化轮次累计，跨对象共享的「时间刻度」）
  lastReturnFloor?: number;            // 上次生成回归简报时的正文楼层
};

const BLANK: EvolutionData = { actors: [], subscriptions: [], worldEvents: [], chronicle: [], clockTurn: 0, lastReturnFloor: 0 };

// ==================== 世界演化全局配置 ====================
// 落 _th_world_evo_config_v1（已纳入 _th_world_ 前缀整包导出）。
export type EvoConfig = {
  aiPresetName: string;     // 推演用 API 预设（空=跟随当前/默认）
  readFloors: number;       // 推演时附带的酒馆正文楼层数（0=不读）
  injectRecent: number;     // 持久注入时附带的最近演化条数（默认 3）
  maxBatch: number;         // 单次批量/联合推演最多角色数（默认 6）
  globalWbRefs: EvoWbRef[]; // 默认绑定的世界书条目（全局，所有推演都附带——世界观锚点）
  tonePrompt?: string;      // 语气/笔调预设，附加到每次推演 system 末尾
  personaId?: string;       // 复用 API 设置里的人格库（空=不启用），拼到推演 system 笔调块
  styleId?: string;         // 复用 API 设置里的风格库（空/default=不启用），拼到推演 system 笔调块
  autoInterval?: number;    // 正文每推进 N 楼自动推进一次世界背景演化（0=关）
  lastFloor?: number;       // 上次自动触发时的楼层
  toneKey?: string;         // 基调透镜预设 key（默认 'youth' 青春喜剧）
  defaultReflow?: EvoReflow;// 新建对象/新演化的默认回流档（默认 background 纯背景）
  defaultSubMode?: EvoSubMode; // 订阅组默认推演模式（默认 packed 拼推）
  rippleEnabled?: boolean;  // 全 app 涟漪总开关：把够格的演化外溢到微博/微信等（默认开）
  rippleWeibo?: boolean;    // 涟漪·微博公域讨论分档（默认开；可传闻/可闯入都会发一条微博）
  rippleWechat?: boolean;   // 涟漪·微信私聊闯入分档（默认开；仅可闯入且是通讯录里的具体角色）
  rippleNotify?: boolean;   // 涟漪发生时给一条轻 toast 回执（默认开，便于知道额度花在哪）
  returnBriefOn?: boolean;  // 回归简报：玩家久离后自动汇总「你不在时世界发生了什么」（默认开）
  returnEveryFloors?: number; // 回归简报轻提示阈值：正文比上次简报多推进 N 楼后，在演化首页给一条软提示（0=关，默认 30）
  intensity?: number;       // 演化烈度阀 0-100：越高事件越大、转折越多（默认 45 偏日常）
  genreKey?: string;        // 世界线题材（一键换装，默认本卡的仙侠+校园混合）
};
export const DEFAULT_EVO_CONFIG: EvoConfig = {
  aiPresetName: '', readFloors: 0, injectRecent: 3, maxBatch: 6, globalWbRefs: [], tonePrompt: '', personaId: '', styleId: '', autoInterval: 0, lastFloor: 0,
  toneKey: 'youth', defaultReflow: 'background', defaultSubMode: 'packed', rippleEnabled: true, rippleWeibo: true, rippleWechat: true, rippleNotify: true, returnBriefOn: true, returnEveryFloors: 30, intensity: 45, genreKey: 'xianxia_campus',
};
const EVO_CFG_KEY = '_th_world_evo_config_v1';
let _cfgCache: EvoConfig | null = null;
export function getEvoConfig(): EvoConfig {
  if (_cfgCache) return _cfgCache;
  const raw = readWorldJson<Partial<EvoConfig>>(EVO_CFG_KEY, {});
  _cfgCache = { ...DEFAULT_EVO_CONFIG, ...(raw || {}) };
  if (!Array.isArray(_cfgCache.globalWbRefs)) _cfgCache.globalWbRefs = [];
  return _cfgCache;
}
export function saveEvoConfig(patch: Partial<EvoConfig>): EvoConfig {
  const next = { ...getEvoConfig(), ...patch };
  _cfgCache = next;
  writeWorldJson(EVO_CFG_KEY, next);
  return next;
}

// ==================== 基调透镜预设 ====================
// 每个基调给一段「定调指令」，拼进推演 system（玩家可换、可叠加自定义 tonePrompt）。
// 默认 youth=青春喜剧。所有预设都守「明亮无阴暗底线」，但风味各异。
export type EvoTone = { key: string; name: string; emoji: string; directive: string };
export const EVO_TONES: EvoTone[] = [
  {
    key: 'youth', name: '青春喜剧', emoji: '🌸',
    directive: '【基调·青春喜剧】明亮、轻松、甜，带点无厘头与吐槽。冲突都是「幸福的烦恼」，一顿饭一个拥抱就能化解；人物心理年龄都停在十几二十几岁，会青涩、会笨拙、会争风吃醋。没有阴暗面——不致郁、不虐、不写外部反派与沉重代价。',
  },
  {
    key: 'healing', name: '温柔治愈', emoji: '🍃',
    directive: '【基调·温柔治愈】舒缓、温暖、细腻，像午后的光。事件不求戏剧性，重在情绪的微妙流动与彼此的善意；节奏慢、留白多，让人读完心里软软的。仍然明亮无阴暗，不制造焦虑与冲突升级。',
  },
  {
    key: 'sweet', name: '甜宠暧昧', emoji: '💗',
    directive: '【基调·甜宠暧昧】围绕情感张力与暧昧拉扯，心动、吃醋、试探、靠近的小动作密集而细腻，甜度拉满。可有情趣氛围（本卡无外审、不中性化），但落点是「心动与亲昵」的甜，而非沉重。',
  },
  {
    key: 'sitcom', name: '欢乐情景剧', emoji: '🎭',
    directive: '【基调·欢乐情景剧】节奏快、梗密、群像热闹，像一集情景喜剧：误会、巧合、整活、互相拆台又一笑泯恩仇。每段都要有笑点和反转的小钩子，气氛闹哄哄但温暖。',
  },
  {
    key: 'slowlife', name: '悠闲日常', emoji: '☕',
    directive: '【基调·悠闲日常】慢生活流，聚焦柴米油盐、街角小店、四季流转里的小确幸。事件琐碎而真实，靠生活质感与烟火气取胜，不追求戏剧冲突，读来松弛惬意。',
  },
  {
    key: 'mystery', name: '轻悬念探秘', emoji: '🔍',
    directive: '【基调·轻悬念探秘】在明亮日常里埋一点好奇心驱动的小谜题、小线索、欲言又止的伏笔，让人想往下追。悬念是「下一集预告」式的甜钩子，不制造真正的危险与黑暗，最终都温柔收束。',
  },
];
export function getEvoTone(key?: string): EvoTone {
  return EVO_TONES.find(t => t.key === key) || EVO_TONES[0];
}

// 世界背景演化的默认维度（玩家添加 world 线程时可选/自定义）
export const WORLD_DIMENSIONS = ['势力动向', '民生经济', '天候环境', '暗流事件', '传闻舆论'] as const;

function uid(p = 'e'): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

function read(): EvolutionData {
  const d = readWorldJson<EvolutionData>(WORLD_LS_KEYS.evolution, BLANK);
  if (!d || !Array.isArray(d.actors)) return { actors: [], subscriptions: [], worldEvents: [], chronicle: [], clockTurn: 0, lastReturnFloor: 0 };
  // 向后兼容：补全可能缺失的集合字段
  if (!Array.isArray(d.subscriptions)) d.subscriptions = [];
  if (!Array.isArray(d.worldEvents)) d.worldEvents = [];
  if (!Array.isArray(d.chronicle)) d.chronicle = [];
  if (typeof d.clockTurn !== 'number') d.clockTurn = 0;
  return d;
}
function write(d: EvolutionData): void { writeWorldJson(WORLD_LS_KEYS.evolution, d); }

export function getActors(): EvoActor[] {
  return read().actors.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);
}
export function getActor(id: string): EvoActor | undefined {
  return read().actors.find(a => a.id === id);
}

// 新增/复用演化对象。同源（source+sourceRef）或同 presetKey 已存在则复用，不重复建。
export function ensureActor(a: { source: EvoSource; sourceRef?: string; name: string; persona?: string; dimension?: string; presetKey?: string; customPrompt?: string; worldbookRefs?: EvoWbRef[] }): EvoActor {
  const d = read();
  const exist = a.presetKey
    ? d.actors.find(x => x.presetKey === a.presetKey)
    : d.actors.find(x => x.source === a.source && (a.sourceRef ? x.sourceRef === a.sourceRef : x.name === a.name));
  if (exist) {
    // 刷新人设/昵称（不动时间线）
    let changed = false;
    if (a.persona && a.persona !== exist.persona) { exist.persona = a.persona; changed = true; }
    if (a.name && a.name !== exist.name) { exist.name = a.name; changed = true; }
    if (changed) { exist.updatedAt = Date.now(); write(d); }
    return exist;
  }
  const t = Date.now();
  const created: EvoActor = {
    id: uid('a'), source: a.source, sourceRef: a.sourceRef, name: a.name,
    persona: a.persona, dimension: a.dimension, presetKey: a.presetKey,
    customPrompt: a.customPrompt, useCustomPrompt: !!a.customPrompt,
    worldbookRefs: a.worldbookRefs, injectEnabled: false, timeline: [], createdAt: t, updatedAt: t,
    goals: [], reflowDefault: getEvoConfig().defaultReflow || 'background', relations: [],
  };
  d.actors.push(created);
  write(d);
  return created;
}

// 更新某对象的「角色配置」（专属世界书条目 / 额外设定 / 人设 / 维度 / 内置提示词 / 提示词开关 / 回流档 / 置顶）。不动时间线。
export function updateActorConfig(id: string, patch: Partial<Pick<EvoActor, 'persona' | 'worldbookRefs' | 'extraNote' | 'dimension' | 'name' | 'customPrompt' | 'useCustomPrompt' | 'reflowDefault' | 'pinned' | 'goals' | 'relations'>>): void {
  const d = read();
  const a = d.actors.find(x => x.id === id); if (!a) return;
  Object.assign(a, patch);
  a.updatedAt = Date.now();
  write(d);
}

export function deleteActor(id: string): void {
  const d = read();
  d.actors = d.actors.filter(a => a.id !== id);
  write(d);
}

export function setActorInject(id: string, on: boolean): void {
  const d = read();
  const a = d.actors.find(x => x.id === id); if (!a) return;
  a.injectEnabled = on; a.updatedAt = Date.now(); write(d);
}

export function addEntry(actorId: string, e: Omit<EvoEntry, 'id' | 'ts' | 'injected'> & { injected?: boolean }): EvoEntry | null {
  const d = read();
  const a = d.actors.find(x => x.id === actorId); if (!a) return null;
  const entry: EvoEntry = {
    id: uid('t'), ts: Date.now(), injected: e.injected ?? a.injectEnabled,
    worldTime: e.worldTime, span: e.span, summary: e.summary, events: e.events || [],
    batchId: e.batchId,
    mood: e.mood, goalsTouched: e.goalsTouched, rumor: e.rumor,
    reflow: e.reflow || a.reflowDefault || 'background', collided: e.collided,
  };
  a.timeline.push(entry);
  if (entry.mood) a.updatedAt = Date.now();
  a.updatedAt = Date.now();
  write(d);
  return entry;
}

export function updateEntry(actorId: string, entryId: string, patch: Partial<EvoEntry>): void {
  const d = read();
  const a = d.actors.find(x => x.id === actorId); if (!a) return;
  const i = a.timeline.findIndex(t => t.id === entryId); if (i < 0) return;
  a.timeline[i] = { ...a.timeline[i], ...patch };
  a.updatedAt = Date.now();
  write(d);
}

export function deleteEntry(actorId: string, entryId: string): void {
  const d = read();
  const a = d.actors.find(x => x.id === actorId); if (!a) return;
  a.timeline = a.timeline.filter(t => t.id !== entryId);
  a.updatedAt = Date.now();
  write(d);
}

// 取该角色「最近 N 条」演化摘要，拼成注入文本（持久注入用）。
// 回流分档：reflow='background' 的条目只作背景设定（仍注入，让正文知道"这件事发生过"），
//   'rumor'/'intrude' 在注入文案里给出更强的可见度提示（可被提及 / 可主动找上主角）。
export function buildInjectText(actorId: string, recent = 3): string {
  const a = getActor(actorId);
  if (!a || !a.timeline.length) return '';
  const items = a.timeline.slice(-Math.max(1, recent));
  const lines = items.map(e => {
    const head = e.worldTime ? `（${e.worldTime}）` : '';
    const tier = e.reflow === 'intrude' ? '〔可主动找上主角〕' : e.reflow === 'rumor' ? '〔可作传闻被旁人提及〕' : '';
    return `${head}${e.summary}${tier}`;
  });
  const tail = a.goals && a.goals.filter(g => !g.resolved).length
    ? `\n（${a.name} 心里还惦记着：${a.goals.filter(g => !g.resolved).map(g => g.text).join('；')}）`
    : '';
  return `【世界演化·${a.name}】玩家不在场期间，${a.name} 经历了：\n${lines.join('\n')}${tail}`;
}

// ==================== 统一世界时钟 ====================
export function getClockTurn(): number { return read().clockTurn || 0; }
export function tickClock(by = 1): number { const d = read(); d.clockTurn = (d.clockTurn || 0) + by; write(d); return d.clockTurn; }

// ==================== 目标/盘算 ====================
export function setActorGoals(actorId: string, goals: EvoGoal[]): void {
  const d = read(); const a = d.actors.find(x => x.id === actorId); if (!a) return;
  a.goals = goals; a.updatedAt = Date.now(); write(d);
}
// 合并 AI 返回的目标更新：按 text 模糊匹配既有目标→更新 stage/resolved；新目标追加。
export function mergeActorGoals(actorId: string, incoming: { text: string; stage?: number; secret?: boolean; resolved?: boolean }[]): void {
  if (!incoming || !incoming.length) return;
  const d = read(); const a = d.actors.find(x => x.id === actorId); if (!a) return;
  const cur = a.goals || [];
  for (const g of incoming) {
    const text = String(g.text || '').trim(); if (!text) continue;
    const hit = cur.find(x => x.text === text || (x.text.length > 4 && text.includes(x.text.slice(0, 6))));
    if (hit) {
      if (typeof g.stage === 'number' && Number.isFinite(g.stage)) hit.stage = Math.max(0, Math.min(4, g.stage));
      if (typeof g.resolved === 'boolean') hit.resolved = g.resolved;
      if (typeof g.secret === 'boolean') hit.secret = g.secret;
      hit.updatedAt = Date.now();
    } else {
      cur.push({ id: uid('g'), text, stage: Number.isFinite(g.stage as number) ? Math.max(0, Math.min(4, g.stage as number)) : 0, secret: !!g.secret, resolved: !!g.resolved, updatedAt: Date.now() });
    }
  }
  // 收尾的目标保留但下沉；活跃目标上限 8 条，超出按更新时间裁剪（保留未收尾）
  a.goals = cur.sort((x, y) => (x.resolved ? 1 : 0) - (y.resolved ? 1 : 0) || y.updatedAt - x.updatedAt).slice(0, 12);
  a.updatedAt = Date.now(); write(d);
}

// ==================== 关系网 ====================
export function mergeActorRelations(actorId: string, rels: { to: string; tie: string }[]): void {
  if (!rels || !rels.length) return;
  const d = read(); const a = d.actors.find(x => x.id === actorId); if (!a) return;
  const cur = a.relations || [];
  for (const r of rels) {
    const to = String(r.to || '').trim(), tie = String(r.tie || '').trim();
    if (!to || !tie) continue;
    const hit = cur.find(x => x.to === to);
    if (hit) hit.tie = tie; else cur.push({ to, tie });
  }
  a.relations = cur.slice(0, 16); a.updatedAt = Date.now(); write(d);
}
// 成长轴：把本轮产出的长期变化里程碑并入（按文本去重，最多留 30 条，新→旧靠后）
export function mergeActorGrowth(actorId: string, items: { kind?: string; text: string; worldTime?: string }[]): void {
  if (!items || !items.length) return;
  const d = read(); const a = d.actors.find(x => x.id === actorId); if (!a) return;
  const cur = a.growth || [];
  const seen = new Set(cur.map(g => g.text.trim()));
  for (const it of items) {
    const text = String(it.text || '').trim();
    if (!text || seen.has(text)) continue;
    const kind = (['skill', 'realm', 'knot', 'past', 'bond'].includes(it.kind || '') ? it.kind : 'skill') as EvoGrowthKind;
    cur.push({ ts: Date.now(), worldTime: it.worldTime, kind, text });
    seen.add(text);
  }
  a.growth = cur.slice(-30); a.updatedAt = Date.now(); write(d);
}

// ==================== 订阅组 ====================
export function getSubscriptions(): EvoSubscription[] { return (read().subscriptions || []).slice(); }
export function addSubscription(s: Omit<EvoSubscription, 'id' | 'createdAt' | 'lastFloor'>): EvoSubscription {
  const d = read();
  const sub: EvoSubscription = { ...s, id: uid('sub'), createdAt: Date.now(), lastFloor: 0 };
  (d.subscriptions ||= []).push(sub); write(d); return sub;
}
export function updateSubscription(id: string, patch: Partial<EvoSubscription>): void {
  const d = read(); const s = (d.subscriptions || []).find(x => x.id === id); if (!s) return;
  Object.assign(s, patch); write(d);
}
export function deleteSubscription(id: string): void {
  const d = read(); d.subscriptions = (d.subscriptions || []).filter(x => x.id !== id); write(d);
}

// ==================== 世界事件/历法（事件阶段机）====================
export function getWorldEvents(): EvoWorldEvent[] { return (read().worldEvents || []).slice(); }
export function upsertWorldEvent(e: { id?: string; name: string; phase?: string; desc: string; kind?: EvoEventKind; stage?: number; fromFestival?: string }): void {
  const d = read(); d.worldEvents ||= [];
  const kind = e.kind || 'progress';
  const stages = EVENT_STAGES[kind];
  const stage = typeof e.stage === 'number' ? Math.max(0, Math.min(stages.length - 1, e.stage)) : 0;
  const phase = e.phase || stages[stage];
  const hit = e.id ? d.worldEvents.find(x => x.id === e.id) : d.worldEvents.find(x => x.name === e.name);
  if (hit) {
    hit.phase = phase; hit.desc = e.desc; hit.name = e.name;
    if (e.kind) hit.kind = e.kind;
    if (typeof e.stage === 'number') hit.stage = stage;
    if (e.fromFestival) hit.fromFestival = e.fromFestival;
    hit.updatedAt = Date.now();
  } else {
    d.worldEvents.push({ id: uid('we'), name: e.name, phase, desc: e.desc, kind, stage, fromFestival: e.fromFestival, updatedAt: Date.now() });
  }
  write(d);
}
// 推进某事件到下一阶段（到链尾则保持）。返回新阶段名。
export function advanceEventStage(id: string): string | null {
  const d = read(); const ev = (d.worldEvents || []).find(x => x.id === id); if (!ev) return null;
  const kind = ev.kind || 'progress'; const stages = EVENT_STAGES[kind];
  const next = Math.min(stages.length - 1, (ev.stage ?? 0) + 1);
  ev.stage = next; ev.phase = stages[next]; ev.updatedAt = Date.now(); write(d);
  return stages[next];
}
export function deleteWorldEvent(id: string): void {
  const d = read(); d.worldEvents = (d.worldEvents || []).filter(x => x.id !== id); write(d);
}

// ==================== 编年史 / 大事记 ====================
export function getChronicle(): EvoChronicle[] { return (read().chronicle || []).slice().sort((a, b) => b.ts - a.ts); }
export function addChronicle(c: { text: string; worldTime?: string; actorName?: string }): void {
  const text = String(c.text || '').trim(); if (!text) return;
  const d = read(); d.chronicle ||= [];
  d.chronicle.push({ id: uid('ch'), ts: Date.now(), text, worldTime: c.worldTime, actorName: c.actorName });
  if (d.chronicle.length > 200) d.chronicle = d.chronicle.slice(-200);
  write(d);
}
export function deleteChronicle(id: string): void {
  const d = read(); d.chronicle = (d.chronicle || []).filter(x => x.id !== id); write(d);
}
// 一键清空编年史（大事记），保留演化对象与时间线。
export function clearChronicle(): void { const d = read(); d.chronicle = []; write(d); }
// 一键清空全部演化数据（对象/时间线/订阅/世界事件/编年史/世界钟），设置偏好不动（存于 EvoConfig，另一 blob）。
export function clearAllEvolution(): void {
  const d = read();
  d.actors = []; d.subscriptions = []; d.worldEvents = []; d.chronicle = []; d.clockTurn = 0; d.lastReturnFloor = 0;
  write(d);
}
export function getReturnFloor(): number { return read().lastReturnFloor || 0; }
export function setReturnFloor(n: number): void { const d = read(); d.lastReturnFloor = n; write(d); }

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_evolution_store__ = {
    getActors, getActor, ensureActor, updateActorConfig, deleteActor, setActorInject, addEntry, updateEntry, deleteEntry, buildInjectText, getEvoConfig, saveEvoConfig,
    getClockTurn, tickClock, setActorGoals, mergeActorGoals, mergeActorRelations,
    getSubscriptions, addSubscription, updateSubscription, deleteSubscription,
    getWorldEvents, upsertWorldEvent, deleteWorldEvent, getChronicle, addChronicle, deleteChronicle,
  };
} catch (e) { void e; }
