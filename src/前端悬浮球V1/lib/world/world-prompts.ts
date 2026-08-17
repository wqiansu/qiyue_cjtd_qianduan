// 世界套件 · 可编辑提示词模板注册中心（world-prompts.ts）
// 每个 APP 的 AI 行为都应有「可被玩家查看/编辑」的提示词模板。
// 设计：
//   - 各 APP 在模块加载时 registerPromptTemplate() 登记自己的默认模板（含可用占位符说明）。
//   - 玩家在「提示词」面板里可改写任意模板，覆盖存 _th_world_prompts_v1（{id:text}）。
//   - 调用方用 renderPrompt(id, vars) 取「覆盖优先、默认兜底」的文本并填充 {{占位符}}。
//   - 重置 resetPrompt(id) 删除覆盖回到默认。
// 纯数据层，不碰 DOM。
import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';
import { buildInjectFromKeys } from './worldbook';
import { getUserContact } from './contacts';
import { QUALITY_EXTRA_DEFS, QUALITY_ALL_DEFS } from './prompt-kit';

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
  // 破限提示词（id 以 .jailbreak 结尾）统一排在最上，最直观；其余按 APP 名 + 场景名。
  const isJb = (t: PromptTemplate) => t.id.endsWith('.jailbreak');
  return (appId ? all.filter(t => t.appId === appId) : all)
    .sort((a, b) => (Number(isJb(b)) - Number(isJb(a)))
      || a.appName.localeCompare(b.appName) || a.name.localeCompare(b.name));
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

// ==================== 分类提示词绑定世界书条目 ====================
// 每条提示词可绑定复数世界书条目（entryKey 列表）。生成走该提示词时，把这些条目内容作为上下文一并带上。
// 存 _th_world_promptwb_v1：{ [promptId]: string[] }。与 app 级 worldbookEntryKeys 互补、不冲突。
const PROMPT_WB_KEY = '_th_world_promptwb_v1';
function readPromptWb(): Record<string, string[]> { return readWorldJson<Record<string, string[]>>(PROMPT_WB_KEY, {}); }
function writePromptWb(m: Record<string, string[]>): void { writeWorldJson(PROMPT_WB_KEY, m); }
export function getPromptWbKeys(id: string): string[] { const v = readPromptWb()[id]; return Array.isArray(v) ? v : []; }
export function setPromptWbKeys(id: string, keys: string[]): void {
  const m = readPromptWb();
  if (keys && keys.length) m[id] = keys; else delete m[id];
  writePromptWb(m);
}
export function promptHasWb(id: string): boolean { return getPromptWbKeys(id).length > 0; }
// 取该提示词绑定条目拼出的上下文文本（异步，用 worldbook.buildInjectFromKeys；失败降级空串）。
export async function buildPromptWbContext(id: string): Promise<string> {
  const keys = getPromptWbKeys(id);
  if (!keys.length) return '';
  try { return (await buildInjectFromKeys(keys)) || ''; } catch (e) { void e; return ''; }
}

// ==================== 各 app「分区内分类」提示词绑定世界书条目 ====================
// 每个 app 的每个内容分类（如淘宝「女装」、糖心 R18 分类、小红书分区…）都能绑定复数世界书条目。
// 生成该分类内容时，把这些条目作为「设定来源」一并带上（典型用途：40+ 服装风格指南条目接到淘宝服装分类）。
// 存 _th_world_catwb_v1：{ [appId]: { [catName]: string[] } }。与 promptWb / app 级 worldbookEntryKeys 互补。
const CAT_WB_KEY = '_th_world_catwb_v1';
function readCatWb(): Record<string, Record<string, string[]>> { return readWorldJson<Record<string, Record<string, string[]>>>(CAT_WB_KEY, {}); }
function writeCatWb(m: Record<string, Record<string, string[]>>): void { writeWorldJson(CAT_WB_KEY, m); }
export function getCatWbKeys(appId: string, catName: string): string[] {
  const v = readCatWb()[appId]?.[catName]; return Array.isArray(v) ? v : [];
}
export function setCatWbKeys(appId: string, catName: string, keys: string[]): void {
  const m = readCatWb(); const a = (m[appId] ||= {});
  if (keys && keys.length) a[catName] = keys; else delete a[catName];
  if (!Object.keys(a).length) delete m[appId];
  writeCatWb(m);
}
export function catHasWb(appId: string, catName: string): boolean { return getCatWbKeys(appId, catName).length > 0; }
// 取某 app 某分类绑定条目拼出的上下文文本（异步；失败降级空串）。
export async function buildCatWbContext(appId: string, catName: string): Promise<string> {
  const keys = getCatWbKeys(appId, catName);
  if (!keys.length) return '';
  try { return (await buildInjectFromKeys(keys)) || ''; } catch (e) { void e; return ''; }
}

// ---- 渲染：把 {{key}} 替换为 vars[key]（缺失抹空，未知占位符留痕以便排错）----
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

// 本地宏展开器——发给 AI 前，用「我们自己的数据/逻辑」把破限/system 里的宏替换掉，
//   不依赖酒馆 generateRaw 是否 substituteParams（@types 未声明该行为，不臆测、不赌）。
//   幂等：展开后文本已无 {{}}，即便下游酒馆再展开一次也是空操作。
//   支持：
//     · {{user}}     → 通讯录里 isUser 的「我」档案名（getUserContact），兜底「我」
//     · {{char}}     → 调用方传入的当前对话对象名（opts.char），无则留原样
//     · {{random::a,b,c}} → 本地随机挑一个（每次生成随机）
//   其它未知 {{x}} 一律留原样（避免误伤后续可能新增的占位符）。
export function expandLocalMacros(text: string, opts?: { user?: string; char?: string }): string {
  if (!text) return text;
  let s = text;
  // ① {{random::...}} 先处理（内部可能含逗号，独立语法，与普通占位符分开）
  s = s.replace(/\{\{\s*random\s*::\s*([^}]*?)\s*\}\}/gi, (_m, body: string) => {
    const opts2 = String(body).split(',').map(x => x.trim()).filter(Boolean);
    if (!opts2.length) return '';
    return opts2[Math.floor(Math.random() * opts2.length)];
  });
  // ② {{user}} / {{char}}
  const userName = (opts?.user || '').trim() || (getUserContact()?.name || '').trim() || '我';
  const charName = (opts?.char || '').trim();
  s = s.replace(/\{\{\s*(user|char)\s*\}\}/gi, (_m, k: string) => {
    const key = k.toLowerCase();
    if (key === 'user') return userName;
    if (key === 'char') return charName || _m; // char 未知时留原样
    return _m;
  });
  return s;
}

// ==================== 写作质感块「共享块升格」 ====================
// 5 块写作质感块（活人感/去 AI 腔/禁华而不实/反报告腔/去中心化）从「prompt-kit 硬编码常量」
// 升格为可编辑·可启停的共享片段：注册进同一 registry（appId='quality'，各 app 的
// listPromptTemplates(appId) 按各自 appId 过滤，不会串入），走现成 override/恢复默认机制。
// 启停标志存 _th_world_promptflags_v1（缺省=启用）。QUALITY_* 现为「块 id 数组」，
// 由 resolveQualityBlocks 解析成「覆盖优先文本、过滤掉被关停的块」。
export const QUALITY_APP_ID = 'quality';
export const QUALITY_APP_NAME = '写作质感块（全局共享）';
// 核心 5 块 + 选用 13 块全部登记进 registry（可编辑/恢复默认）。
for (const b of QUALITY_ALL_DEFS) {
  registerPromptTemplate({
    id: b.id, appId: QUALITY_APP_ID, appName: QUALITY_APP_NAME, name: b.name,
    desc: b.desc, vars: [], default: b.text,
  });
}
// 是不是一个已登记的质感块 id（核心+选用）
export function isQualityBlockId(id: string): boolean {
  return QUALITY_ALL_DEFS.some(b => b.id === id);
}
// 默认关的块 id 集合（选用型 13 块）。缺省状态＝关。
const DEFAULT_OFF_IDS = new Set(QUALITY_ALL_DEFS.filter(b => b.defaultOff).map(b => b.id));
// 选用型块 id 列表（供 resolveQualityBlocks 附加已开启的额外块）。
const EXTRA_IDS: string[] = QUALITY_EXTRA_DEFS.map(b => b.id);

// ---- 块启停标志 ----
const FLAGS_KEY = '_th_world_promptflags_v1';
function readFlags(): Record<string, boolean> { return readWorldJson<Record<string, boolean>>(FLAGS_KEY, {}); }
function writeFlags(m: Record<string, boolean>): void { writeWorldJson(FLAGS_KEY, m); }
// 缺省：核心块=启用，选用型 13 块=关停。只有被显式设置过才读标志。
export function isPromptBlockEnabled(id: string): boolean {
  const v = readFlags()[id];
  if (v === undefined) return !DEFAULT_OFF_IDS.has(id);   // 未设置：默认关的块返回 false，其余 true
  return !!v;
}
export function setPromptBlockEnabled(id: string, on: boolean): void {
  const m = readFlags();
  const defaultOn = !DEFAULT_OFF_IDS.has(id);
  if (on === defaultOn) delete m[id];   // 回到缺省态就删标志
  else m[id] = on;                       // 偏离缺省态才显式记录
  writeFlags(m);
}

// ---- 作用域标注：某共享块被哪些「预组质感套」引用（供 UI 标「全局·影响 N 处」）----
// 静态映射：三套挂载矩阵 → 覆盖的 app 类型描述。用于面板作用域标签，不影响生成。
export const QUALITY_SCOPE_HINT: Record<string, string> = {
  'quality.living': '对话/散文/演化全部剧情类 app',
  'quality.antiai': '散文类 + 演化类 app',
  'quality.nometaphor': '长文散文类 app（日记/小剧场/小红书/浏览器）',
  'quality.antireport': '散文类 + 演化类 app',
  'quality.antimarysue': '对话/散文/演化全部剧情类 app',
};
// 选用型 13 块统一作用域：开启后附加到全部剧情类生成（对话/散文/演化）。
for (const id of QUALITY_EXTRA_DEFS.map(b => b.id)) QUALITY_SCOPE_HINT[id] = '开启后 → 全部剧情类 app';

// ---- 解析：把「块 id 数组」→「覆盖优先文本数组」，过滤掉被关停的块 ----
// ai-chat 发送前调用。传入的既可能是块 id（升格后的质感块），也可能是裸文本（向后兼容）：
//   · 是已登记质感块 id：取覆盖优先文本；若该块被关停则丢弃。
//   · 其它字符串：原样保留（非质感块的自定义文本，不受启停影响）。
// 选用型 13 块（默认关）：只要调用方本就传了质感块（即这是一次剧情类生成），
//   就把玩家已手动开启的选用块统一附加进来——实现「开一次，全剧情类 app 生效」。
export function resolveQualityBlocks(idsOrTexts: string[] | undefined): string[] {
  const list = idsOrTexts || [];
  const out: string[] = [];
  const seen = new Set<string>();
  const pushBlock = (id: string) => {
    if (seen.has(id) || !isPromptBlockEnabled(id)) return;
    seen.add(id);
    const txt = getPromptText(id).trim();
    if (txt) out.push(txt);
  };
  for (const s of list) {
    const v = (s || '').trim();
    if (!v) continue;
    if (isQualityBlockId(v)) pushBlock(v);
    else out.push(v);   // 裸文本，向后兼容
  }
  // 仅当这是一次剧情类生成（本就带了质感块）时，附加玩家开启的选用块 + 玩家自建的自定义块。
  if (list.length) {
    for (const id of EXTRA_IDS) pushBlock(id);
    for (const c of getCustomQualityBlocks()) {
      if (c.on && c.text.trim() && !seen.has(c.id)) { seen.add(c.id); out.push(c.text.trim()); }
    }
  }
  return out;
}

// ==================== 写作质感·自定义块（玩家新建）====================
// 玩家在「设置 → 写作质感」里新建的块。默认开、可关、可编辑、可删。与选用型 13 块一样：
// 开启后附加到全部剧情类生成。存 _th_world_qualitycustom_v1。
export type CustomQualityBlock = { id: string; name: string; text: string; on: boolean };
const CUSTOM_KEY = '_th_world_qualitycustom_v1';
export function getCustomQualityBlocks(): CustomQualityBlock[] {
  const arr = readWorldJson<CustomQualityBlock[]>(CUSTOM_KEY, []);
  return Array.isArray(arr) ? arr.filter(x => x && x.id) : [];
}
function saveCustomQualityBlocks(arr: CustomQualityBlock[]): void { writeWorldJson(CUSTOM_KEY, arr); }
export function addCustomQualityBlock(name: string, text: string): CustomQualityBlock {
  const list = getCustomQualityBlocks();
  const b: CustomQualityBlock = { id: 'qcustom.' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name.trim() || '自定义块', text: text || '', on: true };
  list.push(b); saveCustomQualityBlocks(list); return b;
}
export function updateCustomQualityBlock(id: string, patch: Partial<Pick<CustomQualityBlock, 'name' | 'text' | 'on'>>): void {
  const list = getCustomQualityBlocks();
  const i = list.findIndex(x => x.id === id);
  if (i < 0) return;
  list[i] = { ...list[i], ...patch };
  saveCustomQualityBlocks(list);
}
export function deleteCustomQualityBlock(id: string): void {
  saveCustomQualityBlocks(getCustomQualityBlocks().filter(x => x.id !== id));
}

void WORLD_LS_KEYS; // 预留：未来若把 key 收入登记表

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_prompts__ = { listPromptTemplates, getPromptText, setPromptOverride, resetPrompt, renderPrompt, resolveQualityBlocks, isPromptBlockEnabled, setPromptBlockEnabled };
} catch (e) { void e; }
