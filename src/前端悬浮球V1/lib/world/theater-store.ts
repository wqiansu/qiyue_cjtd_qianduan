// 世界套件 P1-A · 小剧场数据层（theater-store.ts）
// 选角色 + 地点等设定，参考最新楼层正文，生成番外片段。
// 一个「剧本」= 一组选材 + 风格 + 若干「幕」（每幕一段生成文本）。
// 数据纯本地 _th_world_theater_v1。
import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

// 单幕：一次生成的片段
export type TheaterScene = {
  id: string;
  text: string;            // 本幕正文（旁白 + 对话混排）
  ts: number;
  injected?: boolean;      // 是否已作为「已发生剧情」注入正文（临时世界书条目）
};

// 选材中的一个角色/地点引用
export type TheaterRef = {
  kind: 'char' | 'place';  // 角色 / 地点
  key: string;             // 唯一键（contact:id / npc:name / wb:book#uid）
  name: string;
  setting?: string;        // 设定文本（角色人设 / 地点描述）
};

export type TheaterScript = {
  id: string;
  title: string;
  refs: TheaterRef[];      // 选中的角色 + 地点
  topic?: string;          // 主题/桥段提示
  styleId?: string;        // 复用 AI_STYLES 的风格 id
  mode: 'single' | 'multi';// 单次短片 / 连续多幕
  useFloors: boolean;      // 是否参考最近楼层正文
  floorCount: number;      // 参考楼数
  scenes: TheaterScene[];
  createdAt: number;
  updatedAt: number;
};

function rid(p: string): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

export function getScripts(): TheaterScript[] {
  const list = readWorldJson<TheaterScript[]>(WORLD_LS_KEYS.theater, []);
  return Array.isArray(list) ? list : [];
}
function saveScripts(list: TheaterScript[]): void { writeWorldJson(WORLD_LS_KEYS.theater, list); }

export function getScript(id: string): TheaterScript | undefined {
  return getScripts().find(s => s.id === id);
}

export function createScript(p: Partial<TheaterScript> & { title: string }): TheaterScript {
  const t = Date.now();
  const s: TheaterScript = {
    id: p.id || rid('thr'),
    title: p.title,
    refs: p.refs || [],
    topic: p.topic || '',
    styleId: p.styleId || 'default',
    mode: p.mode || 'single',
    useFloors: p.useFloors !== false,
    floorCount: p.floorCount || 6,
    scenes: p.scenes || [],
    createdAt: t, updatedAt: t,
  };
  const list = getScripts();
  list.unshift(s);
  saveScripts(list);
  return s;
}

export function updateScript(id: string, patch: Partial<Omit<TheaterScript, 'id' | 'createdAt'>>): TheaterScript | undefined {
  const list = getScripts();
  const i = list.findIndex(s => s.id === id);
  if (i < 0) return undefined;
  list[i] = { ...list[i], ...patch, updatedAt: Date.now() } as TheaterScript;
  saveScripts(list);
  return list[i];
}

export function deleteScript(id: string): void {
  saveScripts(getScripts().filter(s => s.id !== id));
}

export function addScene(scriptId: string, text: string): TheaterScene | undefined {
  const list = getScripts();
  const i = list.findIndex(s => s.id === scriptId);
  if (i < 0) return undefined;
  const sc: TheaterScene = { id: rid('sc'), text, ts: Date.now() };
  list[i].scenes.push(sc);
  list[i].updatedAt = Date.now();
  saveScripts(list);
  return sc;
}

export function updateScene(scriptId: string, sceneId: string, patch: Partial<TheaterScene>): void {
  const list = getScripts();
  const i = list.findIndex(s => s.id === scriptId);
  if (i < 0) return;
  const j = list[i].scenes.findIndex(c => c.id === sceneId);
  if (j < 0) return;
  list[i].scenes[j] = { ...list[i].scenes[j], ...patch };
  list[i].updatedAt = Date.now();
  saveScripts(list);
}

export function deleteScene(scriptId: string, sceneId: string): void {
  const list = getScripts();
  const i = list.findIndex(s => s.id === scriptId);
  if (i < 0) return;
  list[i].scenes = list[i].scenes.filter(c => c.id !== sceneId);
  list[i].updatedAt = Date.now();
  saveScripts(list);
}
