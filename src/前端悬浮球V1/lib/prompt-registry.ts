// 提示词注册中心（registry）：统一管理内置/自定义/额外提示词，供「提示词编辑」与 AI 总结面板共用。
// 内置提示词编辑后存 override（_th_ai_builtin_overrides_v1），不改源码；自定义存 _th_ai_prompts_v1。
import { AI_SUMMARY_PROMPTS, INIT_LS_KEYS, type AiSummaryPrompt, type AiSummaryPromptKind, type AiPromptConstraints } from './config';
import { getCustomPrompts, saveCustomPrompt, deleteCustomPrompt } from './ai-summary-store';

export type PromptEntry = {
  id: string;
  kind: AiSummaryPromptKind;
  label: string;
  template: string;
  builtin: boolean;     // 是否内置（内置不可删，但可编辑=存 override）
  editable: boolean;
  overridden?: boolean; // 内置且已被 override（设置面板显示「可恢复」）
  constraints?: AiPromptConstraints; // 提取约束（字数/条目数/总分上限）
};

const LS_OVERRIDES = INIT_LS_KEYS.aiBuiltinOverrides;

// ==================== 内置 override 持久化 ====================
// 向下兼容：读到旧的纯字符串时，按 { template: <string> } 解释。
type OverrideVal = { template: string; constraints?: AiPromptConstraints };
type OverrideMap = Record<string, string | OverrideVal>;

function readOverrides(): OverrideMap {
  try {
    const raw = localStorage.getItem(LS_OVERRIDES);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === 'object' && !Array.isArray(o) ? o as OverrideMap : {};
  } catch (e) { console.warn('[prompt-registry] 读内置 override 失败', e); return {}; }
}
function writeOverrides(m: OverrideMap): void {
  try { localStorage.setItem(LS_OVERRIDES, JSON.stringify(m)); } catch (e) { console.warn('[prompt-registry] 写内置 override 失败', e); }
}
function normOverride(v: string | OverrideVal | undefined): OverrideVal | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') return { template: v };
  return v;
}

// ==================== 额外注册（接口预留）====================
// 未来其它功能（NPC 档案/润色/续写）可在模块初始化时 registerExtra 挂入一条提示词，
// 设置面板与查询接口会自动包含它。extra 默认不持久化（重新注册即可），编辑走 override 同内置。
const extraRegistry: PromptEntry[] = [];
export function registerExtra(e: Omit<PromptEntry, 'overridden'>): void {
  const idx = extraRegistry.findIndex(x => x.id === e.id);
  const entry: PromptEntry = { ...e };
  if (idx >= 0) extraRegistry[idx] = entry; else extraRegistry.push(entry);
}

// ==================== 查询 ====================

function builtinToEntry(p: AiSummaryPrompt, overrides: OverrideMap): PromptEntry {
  const ov = normOverride(overrides[p.id]);
  return {
    id: p.id, kind: p.kind, label: p.label,
    template: ov ? ov.template : p.template,
    builtin: true, editable: true, overridden: ov != null,
    constraints: ov?.constraints ?? p.constraints,
  };
}
function customToEntry(p: AiSummaryPrompt): PromptEntry {
  return { id: p.id, kind: p.kind, label: p.label, template: p.template, builtin: false, editable: true, constraints: p.constraints };
}

export function getAllPrompts(): PromptEntry[] {
  const overrides = readOverrides();
  const builtins = AI_SUMMARY_PROMPTS.map(p => builtinToEntry(p, overrides));
  const extras = extraRegistry.map(e => {
    const ov = normOverride(overrides[e.id]);
    return { ...e, template: ov ? ov.template : e.template, overridden: ov != null, constraints: ov?.constraints ?? e.constraints };
  });
  const customs = getCustomPrompts().map(customToEntry);
  return [...builtins, ...extras, ...customs];
}

export function getPrompt(id: string): PromptEntry | undefined {
  return getAllPrompts().find(p => p.id === id);
}

// 返回兼容 AiSummaryPrompt 形状（供 ai-summarize 的 allPrompts/promptById 复用，保持旧字段名 isBuiltin）。
export function getAllAsSummaryPrompts(): AiSummaryPrompt[] {
  return getAllPrompts().map(p => ({ id: p.id, label: p.label, kind: p.kind, template: p.template, isBuiltin: p.builtin, constraints: p.constraints }));
}

// ==================== 写入 ====================

export function savePrompt(e: { id: string; kind: AiSummaryPromptKind; label: string; template: string; builtin: boolean; constraints?: AiPromptConstraints }): void {
  if (e.builtin) {
    const m = readOverrides();
    m[e.id] = { template: e.template, constraints: e.constraints };
    writeOverrides(m);
  } else {
    saveCustomPrompt({ id: e.id, label: e.label, kind: e.kind, template: e.template, constraints: e.constraints });
  }
}

// 删除一条提示词：内置不可删（应调 resetBuiltin 恢复），仅删自定义。
export function deletePrompt(id: string): void {
  deleteCustomPrompt(id);
}

// 恢复内置：清该 id 的 override（回到 config 源码默认 template）。
export function resetBuiltin(id: string): void {
  const m = readOverrides();
  if (id in m) { delete m[id]; writeOverrides(m); }
}

// 是否内置 id（label/kind 不可改，只可改 template）。
export function isBuiltinId(id: string): boolean {
  return AI_SUMMARY_PROMPTS.some(p => p.id === id) || extraRegistry.some(e => e.id === id);
}
