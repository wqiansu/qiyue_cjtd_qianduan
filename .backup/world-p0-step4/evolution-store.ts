// 世界套件 P0 · 世界演化数据层（evolution-store）
// 职责：世界演化 APP 的纯数据读写，落 _th_world_evolution_v1（单 blob）。不碰 DOM、不碰 generate。
//   - 演化对象 EvoActor：来自离场 NPC / 联系人 / 自定义；每个对象一条独立演化时间线。
//   - 演化条目 EvoEntry：一次「推进」的产出（摘要 + 关键事件 + 可选变量变化 + 注入状态）。
// 记忆 sessionId 约定：'evo_' + actorId（appId='evolution'），由 evolution.ts 建会话时 ensureSession。
import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

export type EvoSource = 'npc' | 'contact' | 'custom';
export type EvoVarChange = { path: string; value: string }; // 变量路径（如 NPC.林小满.心情）+ 新值（文本，回写时尝试解析）
export type EvoEntry = {
  id: string;
  ts: number;
  worldTime?: string;        // 演化锚定的世界时间（如「第三日 黄昏」），玩家给或读世界信息
  span?: string;             // 这段时间跨度的人类描述（如「约半天」）
  summary: string;           // 这段离场期间发生了什么（主文本）
  events: string[];          // 关键事件点
  varChanges?: EvoVarChange[]; // 可选：模型建议的变量变化（玩家确认后才回写）
  injected: boolean;         // 本条是否已纳入注入（持久注入取最近若干条）
};
export type EvoActor = {
  id: string;
  source: EvoSource;
  sourceRef?: string;        // npc: NPC 名；contact: 联系人 id；custom: 空
  name: string;
  persona?: string;          // 角色设定（注入演化 system 的身份依据）
  injectEnabled: boolean;    // 是否把该角色的演化结果持续注入酒馆正文生成
  timeline: EvoEntry[];      // 演化时间线（旧→新）
  createdAt: number;
  updatedAt: number;
};
export type EvolutionData = { actors: EvoActor[] };

const BLANK: EvolutionData = { actors: [] };

function uid(p = 'e'): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

function read(): EvolutionData {
  const d = readWorldJson<EvolutionData>(WORLD_LS_KEYS.evolution, BLANK);
  if (!d || !Array.isArray(d.actors)) return { actors: [] };
  return d;
}
function write(d: EvolutionData): void { writeWorldJson(WORLD_LS_KEYS.evolution, d); }

export function getActors(): EvoActor[] {
  return read().actors.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}
export function getActor(id: string): EvoActor | undefined {
  return read().actors.find(a => a.id === id);
}

// 新增/复用演化对象。同源（source+sourceRef）已存在则复用，不重复建。
export function ensureActor(a: { source: EvoSource; sourceRef?: string; name: string; persona?: string }): EvoActor {
  const d = read();
  const exist = d.actors.find(x => x.source === a.source && (a.sourceRef ? x.sourceRef === a.sourceRef : x.name === a.name));
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
    persona: a.persona, injectEnabled: false, timeline: [], createdAt: t, updatedAt: t,
  };
  d.actors.push(created);
  write(d);
  return created;
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
    worldTime: e.worldTime, span: e.span, summary: e.summary, events: e.events || [], varChanges: e.varChanges,
  };
  a.timeline.push(entry);
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
export function buildInjectText(actorId: string, recent = 3): string {
  const a = getActor(actorId);
  if (!a || !a.timeline.length) return '';
  const items = a.timeline.slice(-Math.max(1, recent));
  const lines = items.map(e => {
    const head = e.worldTime ? `（${e.worldTime}）` : '';
    return `${head}${e.summary}`;
  });
  return `【世界演化·${a.name}】玩家不在场期间，${a.name} 经历了：\n${lines.join('\n')}`;
}

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_evolution_store__ = { getActors, getActor, ensureActor, deleteActor, setActorInject, addEntry, updateEntry, deleteEntry, buildInjectText };
} catch (e) { void e; }
