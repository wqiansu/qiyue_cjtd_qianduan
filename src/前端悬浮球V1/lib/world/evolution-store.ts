import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

export type EvoSource = 'npc' | 'contact' | 'custom' | 'world';
export type EvoWbRef = { book: string; uid: number; name: string };

// 每个对象可持有若干开放式目标（盘算/心愿/正在张罗的事），由 AI 自主生成与推进
export const GOAL_STAGES = ['起念', '张罗中', '临门一脚', '已办成', '余韵'] as const;
export type EvoGoal = {
  id: string;
  text: string;
  stage: number;         // 0-4 火候阶段（GOAL_STAGES）
  secret?: boolean;
  updatedAt: number;
  resolved?: boolean;
};
export type EvoReflow = 'background' | 'rumor' | 'intrude';
export const REFLOW_LABEL: Record<EvoReflow, string> = { background: '纯背景', rumor: '可成传闻', intrude: '可闯入' };

export type EvoEntry = {
  id: string;
  ts: number;
  worldTime?: string;
  span?: string;
  summary: string;
  events: string[];
  injected: boolean;         // 持久注入取最近若干条
  batchId?: string;
  mood?: string;
  goalsTouched?: string[];
  rumor?: string;
  reflow?: EvoReflow;
  collided?: string[];
};
export type EvoActor = {
  id: string;
  source: EvoSource;
  sourceRef?: string;
  name: string;
  persona?: string;
  worldbookRefs?: EvoWbRef[];
  extraNote?: string;
  dimension?: string;
  presetKey?: string;
  customPrompt?: string;
  useCustomPrompt?: boolean;
  injectEnabled: boolean;
  timeline: EvoEntry[];
  createdAt: number;
  updatedAt: number;
  goals?: EvoGoal[];
  reflowDefault?: EvoReflow;
  relations?: { to: string; tie: string }[];
  growth?: EvoGrowth[];
  pinned?: boolean;
};
export type EvoGrowth = { ts: number; worldTime?: string; kind: EvoGrowthKind; text: string };
export type EvoGrowthKind = 'skill' | 'realm' | 'knot' | 'past' | 'bond';
export const GROWTH_KIND_LABEL: Record<EvoGrowthKind, string> = {
  skill: '技艺', realm: '境界', knot: '心结', past: '过往', bond: '羁绊',
};
export type EvoSubMode = 'packed' | 'fine';
export type EvoSubscription = {
  id: string;
  name: string;
  actorIds: string[];
  everyFloors: number;      // 正文每推进 N 楼自动推进一次（0=仅手动）
  mode: EvoSubMode;
  span: string;
  enabled: boolean;
  lastFloor: number;
  createdAt: number;
};
// 事件阶段机：kind 决定阶段链，stage 是链上的索引。
// 冲突型 萌芽→发酵→逼近→已爆发；进展型 筹备→执行→关键→已完成；festive 预热→当天→余韵；
// relationship 暧昧→试探→捅破→尘埃落定；mystery 伏笔→线索浮现→逼近真相→揭晓。fromFestival 记来源节日名
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
  name: string;
  phase: string;           // 当前阶段文字（与 stage 同步维护）
  desc: string;
  kind?: EvoEventKind;
  stage?: number;
  fromFestival?: string;
  updatedAt: number;
};
// 突发（AI 加权·去骰子·带冷却）
export type WIncidentSeed = { hint: string; cooldownTurn: number };
export type EvoChronicle = {
  id: string;
  ts: number;
  worldTime?: string;
  text: string;
  actorName?: string;
};
export type EvolutionData = {
  actors: EvoActor[];
  subscriptions?: EvoSubscription[];
  worldEvents?: EvoWorldEvent[];
  chronicle?: EvoChronicle[];
  clockTurn?: number;
  lastReturnFloor?: number;
};

const BLANK: EvolutionData = { actors: [], subscriptions: [], worldEvents: [], chronicle: [], clockTurn: 0, lastReturnFloor: 0 };

export type EvoConfig = {
  aiPresetName: string;
  readFloors: number;
  injectRecent: number;
  maxBatch: number;
  globalWbRefs: EvoWbRef[];
  tonePrompt?: string;
  personaId?: string;
  styleId?: string;
  autoInterval?: number;    // 正文每推进 N 楼自动推进一次世界背景演化（0=关）
  lastFloor?: number;
  toneKey?: string;
  defaultReflow?: EvoReflow;
  defaultSubMode?: EvoSubMode;
  rippleEnabled?: boolean;
  rippleWeibo?: boolean;
  rippleWechat?: boolean;
  rippleNotify?: boolean;
  returnBriefOn?: boolean;
  returnEveryFloors?: number;
  intensity?: number;
  genreKey?: string;
};
export const DEFAULT_EVO_CONFIG: EvoConfig = {
  aiPresetName: '', readFloors: 0, injectRecent: 3, maxBatch: 6, globalWbRefs: [], tonePrompt: '', personaId: '', styleId: '', autoInterval: 0, lastFloor: 0,
  toneKey: 'youth', defaultReflow: 'background', defaultSubMode: 'packed', rippleEnabled: true, rippleWeibo: true, rippleWechat: true, rippleNotify: true, returnBriefOn: true, returnEveryFloors: 30, intensity: 45, genreKey: 'xianxia_campus',
};
const EVO_CFG_KEY = '_th_world_evo_config_v1';
let _cfgCache: EvoConfig | null = null;
let _cfgRaw: string | null = null;
export function getEvoConfig(): EvoConfig {
  const raw = localStorage.getItem(EVO_CFG_KEY);
  if (_cfgCache && raw === _cfgRaw) return _cfgCache;
  _cfgRaw = raw;
  const parsed = readWorldJson<Partial<EvoConfig>>(EVO_CFG_KEY, {});
  _cfgCache = { ...DEFAULT_EVO_CONFIG, ...(parsed || {}) };
  if (!Array.isArray(_cfgCache.globalWbRefs)) _cfgCache.globalWbRefs = [];
  return _cfgCache;
}
export function saveEvoConfig(patch: Partial<EvoConfig>): EvoConfig {
  const next = { ...getEvoConfig(), ...patch };
  _cfgCache = next;
  writeWorldJson(EVO_CFG_KEY, next);
  _cfgRaw = localStorage.getItem(EVO_CFG_KEY);
  return next;
}

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

export const WORLD_DIMENSIONS = ['势力动向', '民生经济', '天候环境', '暗流事件', '传闻舆论'] as const;

function uid(p = 'e'): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

function read(): EvolutionData {
  const d = readWorldJson<EvolutionData>(WORLD_LS_KEYS.evolution, BLANK);
  if (!d || !Array.isArray(d.actors)) return { actors: [], subscriptions: [], worldEvents: [], chronicle: [], clockTurn: 0, lastReturnFloor: 0 };
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

export function getClockTurn(): number { return read().clockTurn || 0; }
export function tickClock(by = 1): number { const d = read(); d.clockTurn = (d.clockTurn || 0) + by; write(d); return d.clockTurn; }

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
// 成长轴：把本轮产出的长期变化里程碑并入（按文本去重，最多留 30 条）
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
