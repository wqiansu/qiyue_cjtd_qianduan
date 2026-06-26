// 世界套件 P0 · 可编辑提示词模板注册中心（world-prompts.ts）
// 反馈#8：每个 APP 的 AI 行为都应有「可被玩家查看/编辑」的提示词模板，后续每个 APP 同此机制。
// 设计：
//   - 各 APP 在模块加载时 registerPromptTemplate() 登记自己的默认模板（含可用占位符说明）。
//   - 玩家在「提示词」面板里可改写任意模板，覆盖存 _th_world_prompts_v1（{id:text}）。
//   - 调用方用 renderPrompt(id, vars) 取「覆盖优先、默认兜底」的文本并填充 {{占位符}}。
//   - 重置 resetPrompt(id) 删除覆盖回到默认。
// 纯数据层，不碰 DOM。
import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

export type PromptVar = { key: string; desc: string };
export type PromptTemplate = {
  id: string;        // 全局唯一，建议 '<appId>.<场景>'，如 'wechat.single'
  appId: string;     // 所属 APP
  appName: string;   // APP 显示名（分组用）
  name: string;      // 场景显示名
  desc: string;      // 这条提示词的作用说明
  vars: PromptVar[]; // 模板内可用的 {{占位符}} 及含义
  default: string;   // 默认模板文本
};

const LS_KEY = '_th_world_prompts_v1';
const _registry = new Map<string, PromptTemplate>();

// 注册（重复 id 以最后一次为准；默认文本变更不影响已存在的玩家覆盖）。
export function registerPromptTemplate(t: PromptTemplate): void {
  _registry.set(t.id, t);
}
export function getPromptTemplate(id: string): PromptTemplate | undefined {
  return _registry.get(id);
}
export function listPromptTemplates(appId?: string): PromptTemplate[] {
  const all = [..._registry.values()];
  return (appId ? all.filter(t => t.appId === appId) : all)
    .sort((a, b) => a.appName.localeCompare(b.appName) || a.name.localeCompare(b.name));
}
// 已登记的 APP 分组（提示词面板按 APP 折叠）
export function listPromptApps(): { appId: string; appName: string; count: number }[] {
  const m = new Map<string, { appId: string; appName: string; count: number }>();
  for (const t of _registry.values()) {
    const e = m.get(t.appId) || { appId: t.appId, appName: t.appName, count: 0 };
    e.count++; m.set(t.appId, e);
  }
  return [...m.values()].sort((a, b) => a.appName.localeCompare(b.appName));
}

// ---- 覆盖读写 ----
function readOverrides(): Record<string, string> {
  return readWorldJson<Record<string, string>>(LS_KEY, {});
}
function writeOverrides(m: Record<string, string>): void {
  writeWorldJson(LS_KEY, m);
}
export function getPromptText(id: string): string {
  const ov = readOverrides();
  if (typeof ov[id] === 'string') return ov[id];
  return _registry.get(id)?.default ?? '';
}
export function isPromptOverridden(id: string): boolean {
  return typeof readOverrides()[id] === 'string';
}
export function setPromptOverride(id: string, text: string): void {
  const m = readOverrides(); m[id] = text; writeOverrides(m);
}
export function resetPrompt(id: string): void {
  const m = readOverrides(); delete m[id]; writeOverrides(m);
}

// ---- 渲染：把 {{key}} 替换为 vars[key]（缺失留空，未知占位符原样保留以便排错）----
export function renderPrompt(id: string, vars: Record<string, string | number | undefined>): string {
  const tpl = getPromptText(id);
  return fillTemplate(tpl, vars);
}
export function fillTemplate(tpl: string, vars: Record<string, string | number | undefined>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => {
    const v = vars[k];
    return v == null ? '' : String(v);
  });
}

void WORLD_LS_KEYS; // 预留：未来若把 key 收入登记表

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_prompts__ = { listPromptTemplates, getPromptText, setPromptOverride, resetPrompt, renderPrompt };
} catch (e) { void e; }
