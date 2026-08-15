import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';
import type { PlayType } from './theater-presets';

// 一幕的类型（决定气泡样式与导引）
export type ActKind = '旁白' | '台词' | '舞台提示' | '弹幕' | 'NG' | '彩蛋' | '分支';
export type Act = {
  id: string;
  kind: ActKind;
  speaker?: string;         // 台词/舞台提示的主体（角色名）
  text: string;
  branchOptions?: string[]; // kind='分支' 时的可选走向
  chosen?: number;          // 已选的分支序号
  ts: number;
};

// 演员：只从现有角色派生（不做原创角色库）
export type ActorSource = 'contact' | 'npc' | 'world' | 'main' | 'custom';
export type PlayActor = {
  source: ActorSource;
  ref: string;              // contact:id / npc:name / world:actorId / main / custom:name
  name: string;
  persona?: string;         // 人设摘要（供给制，随选角带上）
  role?: string;            // 本剧中的临时身份（AU 用，如「咖啡馆老板娘」）
};

export type PlayMode = 'director' | 'immersive';  // 导演逐幕 / 沉浸连演
export type ExtendMode = 'none' | 'from' | 'branch' | 'after'; // 正文延伸：无 / 从此刻延伸 / 岔出去 / 续正文之后

export type Play = {
  id: string;
  title: string;
  tagline?: string;         // AI 起的标语
  presetKey?: string;       // 来源预设 key（自定义为空）
  type: PlayType;
  toneKey: string;          // 基调透镜
  riot: number;             // 放飞度 0-100
  r18: boolean;             // 涩涩番外
  actors: PlayActor[];
  acts: Act[];
  mode: PlayMode;
  actsPerRun: number;       // 沉浸模式一次演几幕（1-6）
  useFloors: boolean;       // 是否参考正文
  floorCount: number;       // 参考楼数
  extendMode: ExtendMode;   // 正文延伸方式
  posterDesc?: string;      // 海报/剧照中文描述
  castNote?: string;        // 演员表说明
  rating?: number;          // 观后感打分 1-5
  review?: string;          // 短评
  highlights?: string[];    // 名场面（act id）
  seriesId?: string;        // 连续剧追番：同系列共享 id
  episode?: number;         // 第几集
  favorite?: boolean;
  pinned?: boolean;
  injectOn?: boolean;       // 是否注入正文（默认关）
  createdAt: number;
  updatedAt: number;
};

// 全局配置（新建戏时的默认值 + API/记忆等）
export type TheaterConfig = {
  defaultTone: string;
  defaultRiot: number;
  r18On: boolean;           // 涩涩番外总开关（关则 r18 预设降级为暧昧）
  defaultMode: PlayMode;
  actsPerRun: number;
  readFloors: number;       // 正文延伸默认参考楼数
  injectDefault: boolean;   // 新戏默认是否开注入
  aiPresetName?: string;
  styleId?: string;
  personaId?: string;
  tonePrompt?: string;      // 自定义笔调（叠加）
  worldbookEntryKeys?: string[];  // 绑定世界书条目（作为剧本设定来源，注入生成 system）
  autoInterval?: number;    // 正文每推进 N 楼自动起一场戏（0=关）
  lastFloor?: number;
};
const CFG_DEFAULT: TheaterConfig = {
  defaultTone: 'sweet', defaultRiot: 50, r18On: false,
  defaultMode: 'director', actsPerRun: 3, readFloors: 6, injectDefault: false,
  aiPresetName: '', styleId: 'default', personaId: '', tonePrompt: '',
  worldbookEntryKeys: [], autoInterval: 0, lastFloor: 0,
};
const CFG_KEY = '_th_world_theater_cfg_v1';
export function getTheaterConfig(): TheaterConfig {
  return { ...CFG_DEFAULT, ...readWorldJson<Partial<TheaterConfig>>(CFG_KEY, {}) };
}
export function saveTheaterConfig(patch: Partial<TheaterConfig>): TheaterConfig {
  const next = { ...getTheaterConfig(), ...patch };
  writeWorldJson(CFG_KEY, next);
  return next;
}

function rid(p: string): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

// ==================== 读取 + 迁移 ====================
// 旧结构 → Play（refs.char→actor，refs.place 并入 castNote，scenes→acts 旁白）
function migrate(raw: any): Play {
  if (raw && Array.isArray(raw.acts) && typeof raw.riot === 'number') return raw as Play; // 已是新结构
  const t = Date.now();
  const refs = Array.isArray(raw?.refs) ? raw.refs : [];
  const actors: PlayActor[] = refs.filter((r: any) => r?.kind === 'char').map((r: any) => ({
    source: (String(r.key || '').split(':')[0] as ActorSource) || 'custom',
    ref: String(r.key || r.name || ''), name: String(r.name || ''), persona: r.setting || '',
  }));
  const placeNote = refs.filter((r: any) => r?.kind === 'place').map((r: any) => r.name).join('、');
  const acts: Act[] = Array.isArray(raw?.scenes) ? raw.scenes.map((s: any) => ({
    id: s.id || rid('act'), kind: '旁白' as ActKind, text: String(s.text || ''), ts: s.ts || t,
  })) : [];
  return {
    id: raw?.id || rid('play'), title: raw?.title || '未命名小剧场', tagline: '',
    presetKey: '', type: 'sidestory', toneKey: 'sweet', riot: 50, r18: false,
    actors, acts, mode: raw?.mode === 'multi' ? 'immersive' : 'director', actsPerRun: 3,
    useFloors: raw?.useFloors !== false, floorCount: raw?.floorCount || 6, extendMode: 'none',
    castNote: placeNote ? `场景：${placeNote}` : '', createdAt: raw?.createdAt || t, updatedAt: raw?.updatedAt || t,
  };
}

export function getPlays(): Play[] {
  const list = readWorldJson<any[]>(WORLD_LS_KEYS.theater, []);
  if (!Array.isArray(list)) return [];
  const migrated = list.map(migrate);
  // 置顶优先，其次按更新时间倒序
  return migrated.sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (b.updatedAt - a.updatedAt));
}
function savePlays(list: Play[]): void { writeWorldJson(WORLD_LS_KEYS.theater, list); }
export function getPlay(id: string): Play | undefined { return getPlays().find(p => p.id === id); }

export function createPlay(p: Partial<Play> & { title: string }): Play {
  const t = Date.now();
  const cfg = getTheaterConfig();
  const play: Play = {
    id: p.id || rid('play'), title: p.title, tagline: p.tagline || '',
    presetKey: p.presetKey || '', type: p.type || 'sidestory',
    toneKey: p.toneKey || cfg.defaultTone, riot: p.riot ?? cfg.defaultRiot, r18: p.r18 ?? false,
    actors: p.actors || [], acts: p.acts || [],
    mode: p.mode || cfg.defaultMode, actsPerRun: p.actsPerRun ?? cfg.actsPerRun,
    useFloors: p.useFloors ?? (!!p.extendMode && p.extendMode !== 'none'),
    floorCount: p.floorCount ?? cfg.readFloors, extendMode: p.extendMode || 'none',
    posterDesc: p.posterDesc || '', castNote: p.castNote || '',
    seriesId: p.seriesId, episode: p.episode,
    favorite: p.favorite, pinned: p.pinned, injectOn: p.injectOn ?? cfg.injectDefault,
    createdAt: t, updatedAt: t,
  } as Play;
  const list = getPlays(); list.unshift(play); savePlays(list);
  return play;
}

export function updatePlay(id: string, patch: Partial<Omit<Play, 'id' | 'createdAt'>>): Play | undefined {
  const list = getPlays(); const i = list.findIndex(p => p.id === id);
  if (i < 0) return undefined;
  list[i] = { ...list[i], ...patch, updatedAt: Date.now() } as Play;
  savePlays(list); return list[i];
}
export function deletePlay(id: string): void { savePlays(getPlays().filter(p => p.id !== id)); }

// ==================== 幕操作 ====================
export function addAct(playId: string, act: Omit<Act, 'id' | 'ts'> & { id?: string; ts?: number }): Act | undefined {
  const list = getPlays(); const i = list.findIndex(p => p.id === playId);
  if (i < 0) return undefined;
  const a: Act = { id: act.id || rid('act'), kind: act.kind, speaker: act.speaker, text: act.text, branchOptions: act.branchOptions, ts: act.ts || Date.now() };
  list[i].acts.push(a); list[i].updatedAt = Date.now(); savePlays(list);
  return a;
}
// 批量追加（沉浸模式一次多幕）
export function addActs(playId: string, acts: Array<Omit<Act, 'id' | 'ts'>>): void {
  const list = getPlays(); const i = list.findIndex(p => p.id === playId);
  if (i < 0) return;
  const t = Date.now();
  for (const a of acts) list[i].acts.push({ id: rid('act'), ts: t, ...a } as Act);
  list[i].updatedAt = t; savePlays(list);
}
export function updateAct(playId: string, actId: string, patch: Partial<Act>): void {
  const list = getPlays(); const i = list.findIndex(p => p.id === playId); if (i < 0) return;
  const j = list[i].acts.findIndex(a => a.id === actId); if (j < 0) return;
  list[i].acts[j] = { ...list[i].acts[j], ...patch }; list[i].updatedAt = Date.now(); savePlays(list);
}
export function deleteAct(playId: string, actId: string): void {
  const list = getPlays(); const i = list.findIndex(p => p.id === playId); if (i < 0) return;
  list[i].acts = list[i].acts.filter(a => a.id !== actId); list[i].updatedAt = Date.now(); savePlays(list);
}
// 截断到某幕之后（分支选择后清掉后续，重演）
export function truncateAfter(playId: string, actId: string): void {
  const list = getPlays(); const i = list.findIndex(p => p.id === playId); if (i < 0) return;
  const j = list[i].acts.findIndex(a => a.id === actId); if (j < 0) return;
  list[i].acts = list[i].acts.slice(0, j + 1); list[i].updatedAt = Date.now(); savePlays(list);
}

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_theater_store__ = { getPlays, getPlay, createPlay, updatePlay, deletePlay, addAct, addActs, updateAct, deleteAct, getTheaterConfig, saveTheaterConfig };
} catch (e) { void e; }
