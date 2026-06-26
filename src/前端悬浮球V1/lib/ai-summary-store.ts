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
  { id: 'dark', name: '暗黑', systemSuffix: '\n\n【文风要求】desc/简介/效果/评价等描述性字段一律采用阴郁、压抑、暗黑的笔调：多用冷色调与阴影意象，强调危险、腐朽、未知与不安，句式偏冷峻克制，营造令人脊背发凉的氛围。可点出隐患与代价，但绝不渲染至猎奇。（文风仅作用于描述字段，结构、字段名与原文事实不得改动；不编造原文没有的情节。）', builtin: true },
  { id: 'humor', name: '幽默', systemSuffix: '\n\n【文风要求】desc/简介与评价字段采用轻松幽默、机灵俏皮的笔调：善用反差、吐槽、生活化的比喻和适度的网络梗调侃，读来会心一笑。评价字段可放开玩梗、打破第四面墙，但描述字段在搞笑之余仍要把信息讲清楚。（玩梗须立足原文，不得为了好笑而编造或扭曲事实，结构与字段名不变。）', builtin: true },
  { id: 'serious', name: '严肃', systemSuffix: '\n\n【文风要求】desc/简介采用严肃、正式、考据式的笔调：用词精确克制，逻辑严密，像编写设定集词条或百科条目一样客观陈述，不抒情、不夸张、不卖关子。优先呈现事实与因果关系。（保持冷静中立，不添加主观臆测，结构与字段名及原文事实不变。）', builtin: true },
  { id: 'gentle', name: '温柔治愈', systemSuffix: '\n\n【文风要求】desc/简介与评价采用温柔、治愈、舒缓的笔调：用词柔和亲切，语气温暖体贴，多用明亮温煦的意象，让人读来心安。即便描述冲突或危险，也以平和包容的口吻娓娓道来。（温柔只体现在措辞语气上，不软化或歪曲原文的客观信息，结构与字段名不变。）', builtin: true },
  { id: 'hotblood', name: '热血燃', systemSuffix: '\n\n【文风要求】desc/简介与评价采用热血、激昂、充满张力的笔调：句式短促有力、富有节奏与冲劲，多用动感词汇与递进，点燃斗志与代入感，仿佛少年漫的旁白。（燃归燃，信息要素仍须准确齐全，不得为了气势而夸大或捏造原文没有的设定，结构与字段名不变。）', builtin: true },
  { id: 'poetic', name: '诗意文学', systemSuffix: '\n\n【文风要求】desc/简介采用诗意、文学化、富有意象的笔调：讲究遣词造句的韵律与画面感，善用比喻、通感与留白，文字典雅隽永，如散文诗般耐人寻味。（在追求美感的同时不堆砌辞藻至晦涩，核心信息须清晰可辨，不脱离原文事实，结构与字段名不变。）', builtin: true },
  { id: 'thriller', name: '悬疑惊悚', systemSuffix: '\n\n【文风要求】desc/简介采用悬疑、紧张、惊悚的笔调：留白与暗示并用，制造悬念与不祥的预感，节奏由缓入急，让读者心生警觉与好奇。可埋下伏笔、点到为止。（悬念基于原文已有信息来营造，不得凭空编造谜团或反转，结构与字段名及事实不变。）', builtin: true },
  // 批次8 反馈1：扩充题材风格（修仙/武侠/玄幻/西幻/科幻/赛博/古风/克苏鲁等），按题材调遣词与意象
  { id: 'xianxia', name: '修仙·仙侠', systemSuffix: '\n\n【文风要求】desc/简介与评价采用修仙仙侠的笔调：多用「灵气、道韵、丹符、洞天、渡劫、心魔、机缘、因果」等修真意象，遣词清逸出尘又暗藏锋芒，营造缥缈仙气与大道苍茫之感。评价可带几分世外高人的点拨意味。（仙侠包装只作用于描述措辞，不得改动原文设定的数值、属性、类别与事实，结构与字段名不变。）', builtin: true },
  { id: 'wuxia', name: '武侠·江湖', systemSuffix: '\n\n【文风要求】desc/简介与评价采用武侠江湖的笔调：用词带刀光剑影与侠气，善用「内力、招式、门派、恩怨、快意、江湖」等意象，句式凝练有顿挫，透出古龙式的洒脱或金庸式的厚重。评价可如说书人般点评几句江湖事。（江湖味只体现在文风，不得为渲染而虚构原文没有的招式、势力或情节，结构与字段名及事实不变。）', builtin: true },
  { id: 'xuanhuan', name: '玄幻·东方奇幻', systemSuffix: '\n\n【文风要求】desc/简介采用东方玄幻的恢弘笔调：多用「九天、神魔、血脉、法则、大陆、纪元、禁地、传承」等磅礴意象，气象开阔、想象瑰丽，铺陈出上古洪荒般的宏大世界感。（恢弘只用于描述笔触，不得夸大或编造原文未写明的力量等级与设定，结构与字段名及事实不变。）', builtin: true },
  { id: 'western-fantasy', name: '西幻·剑与魔法', systemSuffix: '\n\n【文风要求】desc/简介采用西方奇幻的笔调：贴合「剑与魔法、龙与地下城、骑士、法师、神祇、王国、符文、秘银」的中世纪幻想语境，措辞带译制文学的典雅腔调与史诗感，像吟游诗人词条或冒险者公会档案。（奇幻包装只作用于文风，不得篡改原文的物品/技能/数值等结构化事实，字段名与枚举值不变。）', builtin: true },
  { id: 'scifi', name: '科幻·未来', systemSuffix: '\n\n【文风要求】desc/简介采用硬核科幻的笔调：善用「星舰、纳米、量子、AI、基因、轨道、纪元、文明」等未来科技意象，遣词冷峻精确、富有理性与疏离的宇宙尺度感，像未来档案库的条目记录。（科技语境只用于措辞，不得把原文的奇幻/现实设定强行改写成科技设定，结构与字段名及事实不变。）', builtin: true },
  { id: 'cyberpunk', name: '赛博朋克', systemSuffix: '\n\n【文风要求】desc/简介与评价采用赛博朋克的笔调：霓虹与酸雨、义体与脑机、巨企与街头、数据洪流与底层挣扎，遣词冷硬、颓废而带电子噪点般的疏离感，营造高科技低生活的反乌托邦氛围。评价可带几分街头黑客式的讥诮。（赛博美学只作用于描述文风，不得编造原文没有的科技设定或势力，结构与字段名及事实不变。）', builtin: true },
  { id: 'guofeng', name: '古风·诗词雅韵', systemSuffix: '\n\n【文风要求】desc/简介采用中国古典古风的笔调：措辞典雅，善用对仗、化用诗词意境与古意词汇（如「月白、霜重、檐角、青灯、故人」），含蓄隽永、余韵悠长，如古卷题跋。（古雅只体现在遣词造句，不堆砌至佶屈聱牙，核心信息须清晰，不脱离原文事实，结构与字段名不变。）', builtin: true },
  { id: 'cthulhu', name: '克苏鲁·诡秘', systemSuffix: '\n\n【文风要求】desc/简介采用克苏鲁神话的诡秘笔调：渲染不可名状的恐惧、理智的消磨与古老存在的窥视，多用「无名、深渊、低语、非欧几何、禁忌、疯狂」等意象，语气阴郁神秘、暗示性强。（诡秘氛围基于原文营造，不得凭空捏造原文没有的邪神、仪式或情节，结构与字段名及事实不变。）', builtin: true },
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


