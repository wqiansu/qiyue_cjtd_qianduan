// 批次5 Step4 · 提示词注册中心（registry）
// 统一管理所有提示词来源，供「提示词编辑」设置面板与 AI 总结面板共用：
//   - 内置 6 套：来自 config.AI_SUMMARY_PROMPTS（builtin=true），可编辑（编辑结果存 override，不改源码）。
//   - 自定义：来自 ai-summary-store 的 _th_ai_prompts_v1（builtin=false），可改可删。
//   - override 机制：内置提示词编辑后，把新 template 存到独立 key _th_ai_builtin_overrides_v1
//     的 { [id]: template } 槽；getPrompt(id) 优先返回 override；resetBuiltin(id) 清该 id override。
//   - 接口预留：未来 NPC/角色档案/续写润色等提示词可调 registerExtra() 挂入，设置面板自动渲染。
// 向下兼容（§J.3）：不动 _th_ai_prompts_v1 结构（仍是自定义数组），不破坏 getCustomPrompts/saveCustomPrompt/deleteCustomPrompt。
import { AI_SUMMARY_PROMPTS, INIT_LS_KEYS, type AiSummaryPrompt, type AiSummaryPromptKind } from './config';
import { getCustomPrompts, saveCustomPrompt, deleteCustomPrompt } from './ai-summary-store';

export type PromptEntry = {
  id: string;
  kind: AiSummaryPromptKind;
  label: string;
  template: string;
  builtin: boolean;     // 是否内置（内置不可删，但可编辑=存 override）
  editable: boolean;    // 是否可编辑（目前全部可编辑）
  overridden?: boolean; // 内置且已被 override（设置面板显示「可恢复」）
};

const LS_OVERRIDES = INIT_LS_KEYS.aiBuiltinOverrides; // '_th_ai_builtin_overrides_v1'

// ==================== 内置 override 持久化 ====================

function readOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_OVERRIDES);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === 'object' && !Array.isArray(o) ? o as Record<string, string> : {};
  } catch (e) { console.warn('[prompt-registry] 读内置 override 失败', e); return {}; }
}
function writeOverrides(m: Record<string, string>): void {
  try { localStorage.setItem(LS_OVERRIDES, JSON.stringify(m)); } catch (e) { console.warn('[prompt-registry] 写内置 override 失败', e); }
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

function builtinToEntry(p: AiSummaryPrompt, overrides: Record<string, string>): PromptEntry {
  const ov = overrides[p.id];
  return {
    id: p.id, kind: p.kind, label: p.label,
    template: ov != null ? ov : p.template,
    builtin: true, editable: true, overridden: ov != null,
  };
}
function customToEntry(p: AiSummaryPrompt): PromptEntry {
  return { id: p.id, kind: p.kind, label: p.label, template: p.template, builtin: false, editable: true };
}

// 全部提示词（内置[含 override] + 额外 + 自定义），顺序：内置 → 额外 → 自定义。
export function getAllPrompts(): PromptEntry[] {
  const overrides = readOverrides();
  const builtins = AI_SUMMARY_PROMPTS.map(p => builtinToEntry(p, overrides));
  const extras = extraRegistry.map(e => ({ ...e, template: readOverrides()[e.id] ?? e.template, overridden: readOverrides()[e.id] != null }));
  const customs = getCustomPrompts().map(customToEntry);
  return [...builtins, ...extras, ...customs];
}

// 取单条（内置优先返回 override）。找不到返回 undefined。
export function getPrompt(id: string): PromptEntry | undefined {
  return getAllPrompts().find(p => p.id === id);
}

// 返回兼容 AiSummaryPrompt 形状（供 ai-summarize 的 allPrompts/promptById 复用，保持旧字段名 isBuiltin）。
export function getAllAsSummaryPrompts(): AiSummaryPrompt[] {
  return getAllPrompts().map(p => ({ id: p.id, label: p.label, kind: p.kind, template: p.template, isBuiltin: p.builtin }));
}

// ==================== 写入 ====================

// 保存一条提示词：
//  - 内置（id 以 builtin- 开头或 builtin=true）：把 template 存为 override（不改 label/kind，内置 label/kind 固定）。
//  - 自定义：走 saveCustomPrompt（id 为空则调用方应先生成）。
export function savePrompt(e: { id: string; kind: AiSummaryPromptKind; label: string; template: string; builtin: boolean }): void {
  if (e.builtin) {
    const m = readOverrides();
    m[e.id] = e.template;
    writeOverrides(m);
  } else {
    saveCustomPrompt({ id: e.id, label: e.label, kind: e.kind, template: e.template });
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
