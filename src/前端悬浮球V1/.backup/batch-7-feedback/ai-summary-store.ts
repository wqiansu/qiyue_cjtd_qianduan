// 批次4a · AI 总结 持久化层（任务池 + 自定义提示词）
// 任务池 _th_ai_taskpool_v1：玩家攒的待发送任务，关面板再开还在（§E.5.1 Q6-B）。
// 自定义提示词 _th_ai_prompts_v1：玩家新建/编辑的提示词（内置6套只读，复制后存为自定义，§E.4 #20）。
// 命令式、纯 localStorage，不引 Vue。严格向下兼容：仅新增 key。
import type { AiSummaryPrompt, AiSummaryPromptKind } from './config';

const LS_TASKPOOL = '_th_ai_taskpool_v1';
const LS_PROMPTS = '_th_ai_prompts_v1';
// 4b 第4项：增量模式。记录每条世界书条目上次发送时的内容 hash，下次内容未变更则跳过。
const LS_INCR_MAP = '_th_ai_incr_map_v1';     // { "<book>::<entry>": "<hash>" }
const LS_INCR_ENABLED = '_th_ai_incr_enabled_v1'; // '1' | undefined

// ==================== 任务池 ====================

// 一个任务 = 一条世界书条目 + 选定的提示词（决定输出 kind）+ 可选自定义指令。
// task_id 由本层分配（addTask 时生成），用于统一发送时拼装 user_input 并回拆结果（§E.6）。
export type AiTask = {
  taskId: string;
  kind: AiSummaryPromptKind;        // 输出 kind（由选的提示词决定）
  promptId: string;                 // 用的提示词 id（内置或自定义）
  book: string;                     // 世界书名
  entryName: string;                // 条目名
  content: string;                  // 条目原文（发送时喂给 AI）
  customInstruction: string;        // 玩家给本任务的单条备注指令（可空，§E.5.3 Q2-C）
};

function readTaskpool(): AiTask[] {
  try {
    const raw = localStorage.getItem(LS_TASKPOOL);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr as AiTask[] : [];
  } catch (e) { console.warn('[ai-summary] 读任务池失败', e); return []; }
}
function writeTaskpool(tasks: AiTask[]): void {
  try { localStorage.setItem(LS_TASKPOOL, JSON.stringify(tasks)); } catch (e) { console.warn('[ai-summary] 写任务池失败', e); }
}

let _taskSeq = 0;
function nextTaskId(): string {
  // 任务内自增序号 + 随机后缀，避免同会话重复；不依赖 Date.now（脚本环境受限时仍可用）
  _taskSeq += 1;
  return `t_${_taskSeq}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function getTasks(): AiTask[] { return readTaskpool(); }

export function addTask(task: Omit<AiTask, 'taskId'>): AiTask {
  const tasks = readTaskpool();
  const full: AiTask = { ...task, taskId: nextTaskId() };
  tasks.push(full);
  writeTaskpool(tasks);
  return full;
}

export function updateTask(taskId: string, patch: Partial<Omit<AiTask, 'taskId'>>): void {
  const tasks = readTaskpool();
  const idx = tasks.findIndex(t => t.taskId === taskId);
  if (idx >= 0) { tasks[idx] = { ...tasks[idx], ...patch }; writeTaskpool(tasks); }
}

export function removeTask(taskId: string): void {
  writeTaskpool(readTaskpool().filter(t => t.taskId !== taskId));
}

export function moveTask(taskId: string, dir: -1 | 1): void {
  const tasks = readTaskpool();
  const idx = tasks.findIndex(t => t.taskId === taskId);
  const j = idx + dir;
  if (idx < 0 || j < 0 || j >= tasks.length) return;
  [tasks[idx], tasks[j]] = [tasks[j], tasks[idx]];
  writeTaskpool(tasks);
}

export function clearTasks(): void { writeTaskpool([]); }

// ==================== 批次5 Step7 · E 提取方案（存/载任务池预设）====================
const LS_PLANS = '_th_ai_plans_v1';
export type AiPlanTask = Omit<AiTask, 'taskId'>;
export type AiPlan = { id: string; name: string; tasks: AiPlanTask[] };

export function getPlans(): AiPlan[] {
  try {
    const raw = localStorage.getItem(LS_PLANS);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr as AiPlan[] : [];
  } catch (e) { console.warn('[ai-summary] 读方案失败', e); return []; }
}
function writePlans(list: AiPlan[]): void {
  try { localStorage.setItem(LS_PLANS, JSON.stringify(list)); } catch (e) { console.warn('[ai-summary] 写方案失败', e); }
}
export function savePlan(name: string, tasks: AiPlanTask[]): AiPlan {
  const list = getPlans();
  const plan: AiPlan = { id: `plan-${Date.now().toString(36)}`, name, tasks };
  const idx = list.findIndex(p => p.name === name);
  if (idx >= 0) list[idx] = plan; else list.push(plan);
  writePlans(list);
  return plan;
}
export function deletePlan(id: string): void {
  writePlans(getPlans().filter(p => p.id !== id));
}

// ==================== 自定义提示词 ====================

function readCustomPrompts(): AiSummaryPrompt[] {
  try {
    const raw = localStorage.getItem(LS_PROMPTS);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr as AiSummaryPrompt[] : [];
  } catch (e) { console.warn('[ai-summary] 读自定义提示词失败', e); return []; }
}
function writeCustomPrompts(p: AiSummaryPrompt[]): void {
  try { localStorage.setItem(LS_PROMPTS, JSON.stringify(p)); } catch (e) { console.warn('[ai-summary] 写自定义提示词失败', e); }
}

export function getCustomPrompts(): AiSummaryPrompt[] { return readCustomPrompts(); }

export function saveCustomPrompt(p: Omit<AiSummaryPrompt, 'isBuiltin'> & { isBuiltin?: boolean }): AiSummaryPrompt {
  const list = readCustomPrompts();
  const full: AiSummaryPrompt = { ...p, isBuiltin: false } as AiSummaryPrompt;
  const idx = list.findIndex(x => x.id === full.id);
  if (idx >= 0) list[idx] = full; else list.push(full);
  writeCustomPrompts(list);
  return full;
}

export function deleteCustomPrompt(id: string): void {
  writeCustomPrompts(readCustomPrompts().filter(p => p.id !== id));
}

// ==================== 4b 第4项：增量模式（内容 hash 持久化）====================
// 简易 djb2 字符串 hash（无需密码学强度，仅用于判断内容是否变更）。脚本环境无 crypto，自实现。
export function contentHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0; // djb2，|0 保 32 位
  }
  return (h >>> 0).toString(36);
}

function readIncrMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_INCR_MAP);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o as Record<string, string> : {};
  } catch (e) { console.warn('[ai-summary] 读增量记录失败', e); return {}; }
}
function writeIncrMap(m: Record<string, string>): void {
  try { localStorage.setItem(LS_INCR_MAP, JSON.stringify(m)); } catch (e) { console.warn('[ai-summary] 写增量记录失败', e); }
}

export function getIncrEnabled(): boolean { return localStorage.getItem(LS_INCR_ENABLED) === '1'; }
export function setIncrEnabled(on: boolean): void {
  if (on) localStorage.setItem(LS_INCR_ENABLED, '1'); else localStorage.removeItem(LS_INCR_ENABLED);
}

// 判断该条目相对上次发送是否变更（无记录视为变更，需发送）
export function isIncrChanged(book: string, entryName: string, content: string): boolean {
  const m = readIncrMap();
  const key = `${book}::${entryName}`;
  return m[key] !== contentHash(content);
}

// 记录条目本次发送的 hash（发送成功后调用）
export function recordIncrSent(book: string, entryName: string, content: string): void {
  const m = readIncrMap();
  m[`${book}::${entryName}`] = contentHash(content);
  writeIncrMap(m);
}

export function clearIncrMap(): void { writeIncrMap({}); }

// ==================== 批次5 Step7 / 批次6 · I 风格预设（8 内置 + 自定义 + override）====================
// 风格 = 给系统提示词追加的一段「文风/侧重」后缀。当前选中风格 id 存 _th_ai_style_v1。
// 批次6：内置扩到 8 种 + 支持自定义风格 CRUD + 内置 override（编辑内置存 override，可恢复）。
const LS_STYLE = '_th_ai_style_v1';
const LS_STYLES_CUSTOM = '_th_ai_styles_custom_v1';
const LS_STYLE_OVERRIDES = '_th_ai_style_overrides_v1';
export type AiStyle = { id: string; name: string; systemSuffix: string; builtin?: boolean };
export const AI_STYLES_BUILTIN: AiStyle[] = [
  { id: 'default', name: '默认（中性客观）', systemSuffix: '', builtin: true },
  { id: 'dark', name: '暗黑', systemSuffix: '\n\n【文风要求】提取的 desc/简介等文字采用阴郁、压抑、暗黑的笔调，强调危险、未知与不安氛围（但仍须基于原文事实，不编造情节）。', builtin: true },
  { id: 'humor', name: '幽默', systemSuffix: '\n\n【文风要求】提取的 desc/简介与评价字段采用轻松幽默、略带调侃的笔调，可适度玩梗（但仍须基于原文事实，不编造情节）。', builtin: true },
  { id: 'serious', name: '严肃', systemSuffix: '\n\n【文风要求】提取的 desc/简介采用严肃、正式、考据式的笔调，用词精确克制（但仍须基于原文事实，不编造情节）。', builtin: true },
  { id: 'gentle', name: '温柔治愈', systemSuffix: '\n\n【文风要求】提取的 desc/简介与评价采用温柔、治愈、舒缓的笔调，用词柔和亲切，营造温暖安心的氛围（但仍须基于原文事实，不编造情节）。', builtin: true },
  { id: 'hotblood', name: '热血燃', systemSuffix: '\n\n【文风要求】提取的 desc/简介与评价采用热血、激昂、充满张力的笔调，强调气势与冲劲（但仍须基于原文事实，不编造情节）。', builtin: true },
  { id: 'poetic', name: '诗意文学', systemSuffix: '\n\n【文风要求】提取的 desc/简介采用诗意、文学化、富有意象的笔调，讲究遣词造句的美感（但仍须基于原文事实，不编造情节）。', builtin: true },
  { id: 'thriller', name: '悬疑惊悚', systemSuffix: '\n\n【文风要求】提取的 desc/简介采用悬疑、紧张、惊悚的笔调，留白与暗示并用，渲染不安与未知（但仍须基于原文事实，不编造情节）。', builtin: true },
];
// 兼容旧引用名 AI_STYLES（prompt-settings 旧代码 import 过）。
export const AI_STYLES = AI_STYLES_BUILTIN;

function readStyleOverrides(): Record<string, string> {
  try { const o = JSON.parse(localStorage.getItem(LS_STYLE_OVERRIDES) || '{}'); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; } catch { return {}; }
}
function writeStyleOverrides(m: Record<string, string>): void {
  try { localStorage.setItem(LS_STYLE_OVERRIDES, JSON.stringify(m)); } catch (e) { void e; }
}
function readCustomStyles(): AiStyle[] {
  try { const a = JSON.parse(localStorage.getItem(LS_STYLES_CUSTOM) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
function writeCustomStyles(a: AiStyle[]): void {
  try { localStorage.setItem(LS_STYLES_CUSTOM, JSON.stringify(a)); } catch (e) { void e; }
}

// 合并后的全部风格（内置[含 override 后缀] + 自定义）。
export function getAiStyleList(): (AiStyle & { overridden?: boolean })[] {
  const ov = readStyleOverrides();
  const builtins = AI_STYLES_BUILTIN.map(s => ({ ...s, systemSuffix: ov[s.id] != null ? ov[s.id] : s.systemSuffix, overridden: ov[s.id] != null }));
  const customs = readCustomStyles().map(s => ({ ...s, builtin: false }));
  return [...builtins, ...customs];
}
export function getAiStyleId(): string {
  try { return localStorage.getItem(LS_STYLE) || 'default'; } catch { return 'default'; }
}
export function setAiStyleId(id: string): void {
  try { if (id && id !== 'default') localStorage.setItem(LS_STYLE, id); else localStorage.removeItem(LS_STYLE); } catch (e) { void e; }
}
export function getAiStyleSuffix(): string {
  const id = getAiStyleId();
  return getAiStyleList().find(s => s.id === id)?.systemSuffix || '';
}
// 保存风格：内置（id 在 AI_STYLES_BUILTIN）存 override；自定义写入自定义数组（同 id 覆盖）。
export function saveAiStyle(s: AiStyle): void {
  if (AI_STYLES_BUILTIN.some(b => b.id === s.id)) {
    const m = readStyleOverrides(); m[s.id] = s.systemSuffix; writeStyleOverrides(m);
  } else {
    const list = readCustomStyles(); const idx = list.findIndex(x => x.id === s.id);
    if (idx >= 0) list[idx] = s; else list.push(s); writeCustomStyles(list);
  }
}
export function deleteAiStyle(id: string): void {
  writeCustomStyles(readCustomStyles().filter(s => s.id !== id));
  if (getAiStyleId() === id) setAiStyleId('default');
}
export function resetAiStyle(id: string): void {
  const m = readStyleOverrides(); if (id in m) { delete m[id]; writeStyleOverrides(m); }
}
export function isBuiltinStyle(id: string): boolean { return AI_STYLES_BUILTIN.some(s => s.id === id); }

// ==================== 批次6 · 头部人格（身份赋予，置于全部提示词最前）====================
// 人格只影响语气与风趣点评，结构化字段仍须严格遵守格式契约（AiPersona.persona 文本内已声明）。
// 内置来自 config.AI_PERSONAS；自定义存 _th_ai_personas_v1；内置编辑存 override _th_ai_persona_overrides_v1。
// 当前选中人格 id 存 _th_ai_persona_active_v1（空 = 不启用人格）。
import { AI_PERSONAS, type AiPersona } from './config';
export type { AiPersona } from './config';
const LS_PERSONAS_CUSTOM = '_th_ai_personas_v1';
const LS_PERSONA_OVERRIDES = '_th_ai_persona_overrides_v1';
const LS_PERSONA_ACTIVE = '_th_ai_persona_active_v1';

function readPersonaOverrides(): Record<string, string> {
  try { const o = JSON.parse(localStorage.getItem(LS_PERSONA_OVERRIDES) || '{}'); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; } catch { return {}; }
}
function writePersonaOverrides(m: Record<string, string>): void {
  try { localStorage.setItem(LS_PERSONA_OVERRIDES, JSON.stringify(m)); } catch (e) { void e; }
}
function readCustomPersonas(): AiPersona[] {
  try { const a = JSON.parse(localStorage.getItem(LS_PERSONAS_CUSTOM) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
function writeCustomPersonas(a: AiPersona[]): void {
  try { localStorage.setItem(LS_PERSONAS_CUSTOM, JSON.stringify(a)); } catch (e) { void e; }
}

export function getPersonaList(): (AiPersona & { overridden?: boolean })[] {
  const ov = readPersonaOverrides();
  const builtins = AI_PERSONAS.map(p => ({ ...p, persona: ov[p.id] != null ? ov[p.id] : p.persona, overridden: ov[p.id] != null }));
  const customs = readCustomPersonas().map(p => ({ ...p, builtin: false }));
  return [...builtins, ...customs];
}
export function getActivePersonaId(): string {
  try { return localStorage.getItem(LS_PERSONA_ACTIVE) || ''; } catch { return ''; }
}
export function setActivePersonaId(id: string): void {
  try { if (id) localStorage.setItem(LS_PERSONA_ACTIVE, id); else localStorage.removeItem(LS_PERSONA_ACTIVE); } catch (e) { void e; }
}
// 当前人格的 persona 文本（拼到 ordered_prompts[0] 最前）；未启用返回空串。
export function getActivePersonaText(): string {
  const id = getActivePersonaId();
  if (!id) return '';
  const p = getPersonaList().find(x => x.id === id);
  return p ? p.persona + '\n\n' : '';
}
export function savePersona(p: AiPersona): void {
  if (AI_PERSONAS.some(b => b.id === p.id)) {
    const m = readPersonaOverrides(); m[p.id] = p.persona; writePersonaOverrides(m);
  } else {
    const list = readCustomPersonas(); const idx = list.findIndex(x => x.id === p.id);
    if (idx >= 0) list[idx] = p; else list.push(p); writeCustomPersonas(list);
  }
}
export function deletePersona(id: string): void {
  writeCustomPersonas(readCustomPersonas().filter(p => p.id !== id));
  if (getActivePersonaId() === id) setActivePersonaId('');
}
export function resetPersona(id: string): void {
  const m = readPersonaOverrides(); if (id in m) { delete m[id]; writePersonaOverrides(m); }
}
export function isBuiltinPersona(id: string): boolean { return AI_PERSONAS.some(p => p.id === id); }


