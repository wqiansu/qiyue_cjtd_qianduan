// 工作台（wkb）数据层（wkb-store.ts）
// 定位：通用 AI 造物机。玩家选模板 + 描述 → AI 生成结构化产物（文本卡）→ 唯一出口＝拼进玩家聊天输入框。
//   **不写任何变量、不绑角色卡结构、不碰 MVU/世界书**。模板只是「给 AI 的输出提纲」，字段可增删改，纯本地。
// 数据：模板库（内置只读定义 + 玩家自定义/覆盖）、产物库（历史造物，可复用/再投递）、设置（口吻/参考/风格/外观）。
//   全部落 _th_world_wkb_v1，绝不进存档、绝不动其他 app。
import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';
import { getRoot, safeTriggerSlash } from '../tavern-api';

// ==================== 类型 ====================
// 字段定义：只是产物提纲的一行，desc 是「给 AI 的字段提示」。type 纯为 UI 呈现，非校验。
export type WkbFieldType = 'text' | 'longtext' | 'enum' | 'tags' | 'defer';
export type WkbField = { key: string; label: string; desc?: string; type?: WkbFieldType; options?: string[] };
// 模板：一组字段脚手架 + 一条造物引导（引导走 world-prompts registry，这里只存 id）。
export type WkbTemplate = {
  id: string;                 // 内置 'wkb.item' 等；自定义 'wkbc_xxx'
  name: string;
  icon: string;               // 无 fa- 前缀
  builtin: boolean;
  fields: WkbField[];
  guideId?: string;           // 造物引导提示词 id（内置模板才有）
  desc?: string;
};
// 产物：一次造物结果。fields 为 {label:value} 有序对，body 为 AI 兜底散文（无字段时）。
export type WkbProduct = {
  id: string;
  templateId: string;
  templateName: string;
  title: string;              // 产物名（取「名称」类字段或首行）
  fields: { label: string; value: string }[];
  extra?: string;             // 台词/画面描述等附加块
  note?: string;              // 玩家私记（不进投递）
  tags: string[];
  fav?: boolean;
  ts: number;
};
// 投递口吻：人称 + 呈现体。
export type WkbPerson = 'first' | 'second' | 'third';
export type WkbPresent = 'narrate' | 'action' | 'panel' | 'setting' | 'raw';
// PLACEHOLDER_WKB_TYPES

// 设置：口吻默认（第一人称）、参考默认（全不读）、风格、称谓词库、外观。
export type WkbSettings = {
  // 投递口吻默认
  person: WkbPerson;              // 默认第一人称
  present: WkbPresent;            // 默认呈现体
  selfName: string;               // 自称（我/吾/本座…）；空=用「我」
  otherName: string;              // 对方称谓（你/她/{{对方}}）；空=用「你」
  alwaysPreview: boolean;         // 投递前是否总弹预览
  allowBeyondInput: boolean;      // 是否允许投递到输入框以外（默认关，保持纯粹）
  // 生成风格
  tone: string;                   // 语气默认档（正经/沙雕/香艳/中二/古风…）
  detail: 'brief' | 'card' | 'rich'; // 产物详略：一句话/精简卡/详尽卡
  withQuip: boolean;              // 是否带「一句点评」式吐槽
  genMode: 'replace' | 'append';  // 生成时：覆盖本次候选 / 增量追加到候选区
  // 投递封装（把产物文本装进输入框前的最后一道包装；默认全空＝不改动）
  pkgLabel: string;               // 前置标签，如「设定」→ 输出「【设定】…」；空=不加
  pkgPrefix: string;              // 整体前缀（如「（」「[OOC] 」）
  pkgSuffix: string;              // 整体后缀（如「）」）
  pkgSep: 'blank' | 'single' | 'space'; // 追加到输入框已有文字时的分隔（空行/单换行/空格）
  // 参考上下文（默认全关）
  readStory: boolean;             // 读最近剧情楼层
  storyFloors: number;            // 楼数
  worldbookEntryKeys: string[];   // 可选绑定世界书条目作素材
  // API
  aiPresetName?: string;          // 空=用套件活动预设
  batchCount: number;             // 一次出几个候选
  // 外观
  theme: string;                  // 主题皮肤
  font: string;
  // 内置模板启用开关（关掉的内置模板不在库里显示）
  disabledBuiltins: string[];
};
export const WKB_DEFAULT_SETTINGS: WkbSettings = {
  person: 'first', present: 'narrate', selfName: '', otherName: '',
  alwaysPreview: true, allowBeyondInput: false,
  tone: '正经', detail: 'card', withQuip: false, genMode: 'replace',
  pkgLabel: '', pkgPrefix: '', pkgSuffix: '', pkgSep: 'blank',
  readStory: false, storyFloors: 4, worldbookEntryKeys: [],
  aiPresetName: '', batchCount: 1,
  theme: 'pink', font: 'system', disabledBuiltins: [],
};
type WkbData = {
  settings: WkbSettings;
  customTemplates: WkbTemplate[];       // 玩家自定义模板
  fieldOverrides: Record<string, WkbField[]>; // 对内置模板的字段覆盖（key=模板id）
  products: WkbProduct[];               // 产物库（历史造物）
  candidates?: WkbProduct[];            // 本次候选（持久化：退出/重开不丢）
  selProd?: string | null;              // 上次选中的产物 id
};
function readData(): WkbData {
  const d = readWorldJson<Partial<WkbData>>(WORLD_LS_KEYS.wkb, {});
  return {
    settings: { ...WKB_DEFAULT_SETTINGS, ...(d.settings || {}) },
    customTemplates: Array.isArray(d.customTemplates) ? d.customTemplates : [],
    fieldOverrides: d.fieldOverrides && typeof d.fieldOverrides === 'object' ? d.fieldOverrides : {},
    products: Array.isArray(d.products) ? d.products : [],
    candidates: Array.isArray(d.candidates) ? d.candidates : [],
    selProd: typeof d.selProd === 'string' ? d.selProd : null,
  };
}
function writeData(d: WkbData): void { writeWorldJson(WORLD_LS_KEYS.wkb, d); }
function uid(p: string): string { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
// PLACEHOLDER_WKB_DATA

// ==================== 内置模板（21 个 + 自定义）====================
// 字段是「给 AI 的输出提纲」，纯为产物条理清晰；玩家可增删改，删光=让 AI 自由发挥一段散文。
const F = (key: string, label: string, desc?: string): WkbField => ({ key, label, desc });
export const WKB_BUILTIN_TEMPLATES: WkbTemplate[] = [
  { id: 'wkb.item', name: '物品/道具', icon: 'fa-gem', builtin: true, guideId: 'wkb.g.item',
    fields: [F('name', '名称'), F('look', '外观'), F('effect', '效果'), F('origin', '来历'), F('quip', '一句点评', '打破第四面墙式的幽默吐槽')] },
  { id: 'wkb.skill', name: '技能/功法', icon: 'fa-hand-sparkles', builtin: true, guideId: 'wkb.g.skill',
    fields: [F('name', '名称'), F('move', '招式表现'), F('power', '威力'), F('cond', '修习条件'), F('side', '副作用')] },
  { id: 'wkb.state', name: '状态/buff', icon: 'fa-wand-magic-sparkles', builtin: true, guideId: 'wkb.g.state',
    fields: [F('name', '名称'), F('feel', '体感表现'), F('cause', '起因'), F('dur', '持续多久'), F('clear', '解除方式')] },
  { id: 'wkb.cloth', name: '衣物/装扮', icon: 'fa-shirt', builtin: true, guideId: 'wkb.g.cloth',
    fields: [F('name', '名称'), F('style', '款式材质'), F('part', '穿着部位'), F('effect', '上身效果'), F('scene', '场合')] },
  { id: 'wkb.food', name: '料理/饮品', icon: 'fa-bowl-food', builtin: true, guideId: 'wkb.g.food',
    fields: [F('name', '名称'), F('look', '卖相'), F('taste', '味道口感'), F('after', '食用后'), F('plate', '摆盘')] },
  { id: 'wkb.scene', name: '场景/地点', icon: 'fa-mountain-sun', builtin: true, guideId: 'wkb.g.scene',
    fields: [F('name', '名称'), F('mood', '环境氛围'), F('sense', '感官细节'), F('hide', '藏着什么'), F('fit', '适合发生什么')] },
  { id: 'wkb.event', name: '事件/桥段', icon: 'fa-bolt', builtin: true, guideId: 'wkb.g.event',
    fields: [F('hook', '一句话钩子'), F('cause', '起因'), F('pass', '经过'), F('turn', '可能的走向'), F('choice', '留给玩家的选择')] },
  { id: 'wkb.npc', name: 'NPC/路人', icon: 'fa-user-tie', builtin: true, guideId: 'wkb.g.npc',
    fields: [F('name', '名字'), F('look', '外貌'), F('char', '性格'), F('tone', '说话腔调'), F('want', '想干嘛')] },
  { id: 'wkb.line', name: '台词/对白', icon: 'fa-comment-dots', builtin: true, guideId: 'wkb.g.line',
    fields: [F('who', '谁说的'), F('tone', '语气'), F('text', '台词正文'), F('sub', '潜台词')] },
  // PLACEHOLDER_WKB_BUILTIN
  { id: 'wkb.mount', name: '坐骑/灵宠', icon: 'fa-paw', builtin: true, guideId: 'wkb.g.mount',
    fields: [F('name', '名称'), F('kind', '种类外形'), F('char', '习性性格'), F('bond', '与主人的羁绊'), F('skill', '拿手本事')] },
  { id: 'wkb.house', name: '建筑/居所', icon: 'fa-house-chimney', builtin: true, guideId: 'wkb.g.house',
    fields: [F('name', '名称'), F('scale', '规模格局'), F('inner', '内部陈设'), F('loc', '环境位置'), F('feel', '住起来的感觉')] },
  { id: 'wkb.vehicle', name: '载具/舟车', icon: 'fa-sailboat', builtin: true, guideId: 'wkb.g.vehicle',
    fields: [F('name', '名称'), F('look', '外形样式'), F('power', '动力方式'), F('ride', '乘坐体验'), F('speed', '速度航程')] },
  { id: 'wkb.letter', name: '信件/文书', icon: 'fa-envelope-open-text', builtin: true, guideId: 'wkb.g.letter',
    fields: [F('from', '寄件人'), F('to', '收件人'), F('body', '正文内容'), F('tone', '语气措辞'), F('attach', '随信附物')] },
  { id: 'wkb.book', name: '书籍/典籍', icon: 'fa-book', builtin: true, guideId: 'wkb.g.book',
    fields: [F('name', '书名'), F('cat', '类别'), F('content', '主要内容'), F('style', '文风'), F('gain', '阅后收获')] },
  { id: 'wkb.music', name: '音乐/曲艺', icon: 'fa-music', builtin: true, guideId: 'wkb.g.music',
    fields: [F('name', '曲名'), F('style', '曲风乐器'), F('mood', '旋律氛围'), F('lyric', '歌词或意境'), F('scene', '适合的场合')] },
  { id: 'wkb.gift', name: '礼物/心意', icon: 'fa-gift', builtin: true, guideId: 'wkb.g.gift',
    fields: [F('name', '名称'), F('pack', '外观包装'), F('mean', '寓意心意'), F('why', '挑选缘由'), F('scene', '送出的场合')] },
  { id: 'wkb.quest', name: '任务/委托', icon: 'fa-scroll', builtin: true, guideId: 'wkb.g.quest',
    fields: [F('name', '委托名'), F('client', '委托人'), F('goal', '目标要求'), F('reward', '报酬'), F('limit', '时限与难点')] },
  { id: 'wkb.org', name: '组织/门派', icon: 'fa-tower-observation', builtin: true, guideId: 'wkb.g.org',
    fields: [F('name', '名称'), F('aim', '宗旨定位'), F('scale', '规模构成'), F('style', '特色作风'), F('rel', '与外界关系')] },
  { id: 'wkb.festival', name: '节日/习俗', icon: 'fa-star', builtin: true, guideId: 'wkb.g.festival',
    fields: [F('name', '名称'), F('origin', '由来'), F('how', '庆祝方式'), F('food', '应景饮食装扮'), F('mood', '氛围与讲究')] },
  { id: 'wkb.weather', name: '天气/时令', icon: 'fa-cloud-sun', builtin: true, guideId: 'wkb.g.weather',
    fields: [F('name', '名称'), F('sky', '天象表现'), F('feel', '体感'), F('affect', '对环境的影响'), F('fit', '适合做什么')] },
  { id: 'wkb.plant', name: '植物/花木', icon: 'fa-seedling', builtin: true, guideId: 'wkb.g.plant',
    fields: [F('name', '名称'), F('form', '形态花色'), F('grow', '生长习性'), F('use', '用途功效'), F('lang', '花语寓意')] },

];

// ==================== 设置 API ====================
export function getWkbSettings(): WkbSettings { return readData().settings; }
export function updateWkbSettings(patch: Partial<WkbSettings>): WkbSettings {
  const d = readData(); d.settings = { ...d.settings, ...patch }; writeData(d); return d.settings;
}

// ==================== 模板 API ====================
// 有效模板列表 = 未禁用的内置（含字段覆盖）+ 自定义。
export function listTemplates(): WkbTemplate[] {
  const d = readData();
  const dis = new Set(d.settings.disabledBuiltins || []);
  const builtins = WKB_BUILTIN_TEMPLATES.filter(t => !dis.has(t.id)).map(t => ({
    ...t, fields: d.fieldOverrides[t.id] ? d.fieldOverrides[t.id] : t.fields,
  }));
  return [...builtins, ...d.customTemplates];
}
export function getTemplate(id: string): WkbTemplate | undefined { return listTemplates().find(t => t.id === id); }
// 字段增删改：内置模板落 fieldOverrides，自定义模板直接改本体。
export function setTemplateFields(id: string, fields: WkbField[]): void {
  const d = readData();
  const custom = d.customTemplates.find(t => t.id === id);
  if (custom) { custom.fields = fields; }
  else { d.fieldOverrides[id] = fields; }
  writeData(d);
}
export function resetTemplateFields(id: string): void { const d = readData(); delete d.fieldOverrides[id]; writeData(d); }
export function isBuiltinDisabled(id: string): boolean { return (readData().settings.disabledBuiltins || []).includes(id); }
export function setBuiltinEnabled(id: string, on: boolean): void {
  const d = readData(); const set = new Set(d.settings.disabledBuiltins || []);
  if (on) set.delete(id); else set.add(id);
  d.settings.disabledBuiltins = [...set]; writeData(d);
}
// 自定义模板 CRUD
export function addCustomTemplate(name: string, icon = 'fa-cube', fields: WkbField[] = []): WkbTemplate {
  const d = readData();
  const t: WkbTemplate = { id: uid('wkbc_'), name: name || '自定义模板', icon, builtin: false, fields };
  d.customTemplates.push(t); writeData(d); return t;
}
export function updateCustomTemplate(id: string, patch: Partial<Pick<WkbTemplate, 'name' | 'icon' | 'fields' | 'desc'>>): void {
  const d = readData(); const t = d.customTemplates.find(x => x.id === id); if (!t) return;
  Object.assign(t, patch); writeData(d);
}
export function deleteCustomTemplate(id: string): void {
  const d = readData(); d.customTemplates = d.customTemplates.filter(t => t.id !== id); writeData(d);
}
// PLACEHOLDER_WKB_TEMPLATE_API

// ==================== 产物库 API ====================
export function listProducts(): WkbProduct[] { return readData().products.slice().sort((a, b) => b.ts - a.ts); }
export function getProduct(id: string): WkbProduct | undefined { return readData().products.find(p => p.id === id); }
export function addProduct(p: Omit<WkbProduct, 'id' | 'ts'>): WkbProduct {
  const d = readData();
  const prod: WkbProduct = { ...p, id: uid('wkbp_'), ts: Date.now() };
  d.products.unshift(prod);
  if (d.products.length > 300) d.products = d.products.slice(0, 300); // 本地库上限，防膨胀
  writeData(d); return prod;
}
export function updateProduct(id: string, patch: Partial<WkbProduct>): void {
  const d = readData(); const p = d.products.find(x => x.id === id); if (!p) return;
  Object.assign(p, patch); writeData(d);
}
export function deleteProduct(id: string): void {
  const d = readData(); d.products = d.products.filter(p => p.id !== id); writeData(d);
}
export function toggleProductFav(id: string): void {
  const d = readData(); const p = d.products.find(x => x.id === id); if (!p) return;
  p.fav = !p.fav; writeData(d);
}
export function clearProducts(): void { const d = readData(); d.products = []; writeData(d); }
// 产物库全部标签（去重）
export function allProductTags(): string[] {
  const set = new Set<string>();
  readData().products.forEach(p => (p.tags || []).forEach(t => set.add(t)));
  return [...set];
}
// PLACEHOLDER_WKB_PRODUCT_API

// ==================== 候选持久化（退出/重开不丢）====================
// 本次生成的候选（未入库前）也落地，避免退出即删除。selProd 记住上次选中。
export function readCandidates(): { candidates: WkbProduct[]; selProd: string | null } {
  const d = readData();
  return { candidates: d.candidates || [], selProd: d.selProd ?? null };
}
export function writeCandidates(candidates: WkbProduct[], selProd: string | null): void {
  const d = readData();
  d.candidates = candidates.slice(0, 30); // 上限防膨胀
  d.selProd = selProd;
  writeData(d);
}
export function clearCandidates(): void {
  const d = readData(); d.candidates = []; d.selProd = null; writeData(d);
}

// ==================== 投递渲染（核心：产物 → 给 AI 读的自然语言）====================
// 按人称 + 呈现体 + 称谓词库，把结构化产物组织成一段自然语言。纯字符串，无副作用。
function productLines(p: WkbProduct): string {
  const parts: string[] = [];
  p.fields.forEach(f => { if (f.value && f.value.trim()) parts.push(`${f.label}：${f.value.trim()}`); });
  return parts.join('；');
}
export function renderDelivery(p: WkbProduct, s: WkbSettings, over?: { person?: WkbPerson; present?: WkbPresent }): string {
  const person = over?.person || s.person;
  const present = over?.present || s.present;
  const self = (s.selfName || '我').trim();
  const other = (s.otherName || '你').trim();
  const title = p.title || p.templateName;
  const detail = productLines(p);
  const extra = p.extra && p.extra.trim() ? p.extra.trim() : '';
  // 呈现体：面板体/设定体/原文体不吃人称，直接成型
  if (present === 'panel') {
    return `【${p.templateName}·${title}】\n${p.fields.map(f => f.value?.trim() ? `· ${f.label}：${f.value.trim()}` : '').filter(Boolean).join('\n')}${extra ? '\n' + extra : ''}`;
  }
  if (present === 'setting') {
    return `（补充设定：出现了「${title}」。${detail}）${extra ? '\n' + extra : ''}`;
  }
  if (present === 'raw') {
    return `${title}\n${detail}${extra ? '\n' + extra : ''}`;
  }
  // narrate / action 吃人称
  const body = detail ? `${title}——${detail}` : title;
  let sent = '';
  if (person === 'first') {
    sent = present === 'action'
      ? `${self}取出了${title}。${detail ? detail + '。' : ''}`
      : `${self}这边有一样东西：${body}。`;
  } else if (person === 'second') {
    sent = present === 'action'
      ? `${self}把${title}递到${other}面前。${detail ? detail + '。' : ''}`
      : `${other}看——${body}。`;
  } else {
    sent = present === 'action'
      ? `${self === '我' ? '她' : self}取出了${title}。${detail ? detail + '。' : ''}`
      : `（场上出现了${title}：${detail || title}。）`;
  }
  return extra ? sent + '\n' + extra : sent;
}
// PLACEHOLDER_WKB_DELIVERY

// 投递封装：给最终文本套上「标签/前缀/后缀」（设置里的 pkg* 字段；默认全空＝原样）。
export function packageText(text: string, s: WkbSettings): string {
  let t = (text || '').trim();
  if (!t) return t;
  if (s.pkgLabel && s.pkgLabel.trim()) t = `【${s.pkgLabel.trim()}】` + t;
  if (s.pkgPrefix) t = s.pkgPrefix + t;
  if (s.pkgSuffix) t = t + s.pkgSuffix;
  return t;
}

// ==================== 投递到输入框（唯一出口）====================
// 追加文本到酒馆输入框尾部，保留玩家已打的字。返回 { ok, chars, appended }（appended 供撤销）。
const INPUT_MACRO = String.fromCharCode(123, 123) + 'input' + String.fromCharCode(125, 125);
function findTavernInputBox(): HTMLTextAreaElement | null {
  try {
    const doc = (getRoot() as any)?.document || document;
    const ta = (doc.querySelector('#send_textarea') || doc.querySelector('textarea#send_textarea')) as HTMLTextAreaElement | null;
    if (ta) return ta;
  } catch (e) { void e; }
  return null;
}
export function deliverToInputBox(text: string, sep: 'blank' | 'single' | 'space' = 'blank'): { ok: boolean; chars: number; appended: string } {
  const t = (text || '').trim();
  if (!t) return { ok: false, chars: 0, appended: '' };
  const joiner = sep === 'space' ? ' ' : sep === 'single' ? '\n' : '\n\n';
  const ta = findTavernInputBox();
  if (ta) {
    try {
      const cur = (ta.value || '').replace(/\s+$/, '');
      const appended = cur ? joiner + t : t;
      ta.value = cur + appended;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      try { ta.focus(); } catch (e) { void e; }
      return { ok: true, chars: t.length, appended };
    } catch (e) { void e; }
  }
  try { safeTriggerSlash('/setinput ' + INPUT_MACRO + ' ' + t); return { ok: true, chars: t.length, appended: t }; } catch (e) { void e; }
  return { ok: false, chars: 0, appended: '' };
}
// 撤销：从输入框尾部移除刚追加的那段（appended 由 deliver 返回）。
export function undoDelivery(appended: string): boolean {
  if (!appended) return false;
  const ta = findTavernInputBox();
  if (!ta) return false;
  try {
    if (ta.value.endsWith(appended)) {
      ta.value = ta.value.slice(0, ta.value.length - appended.length);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
  } catch (e) { void e; }
  return false;
}
// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_wkb_store__ = { listTemplates, listProducts, getWkbSettings };
} catch (e) { void e; }





