// 世界套件 · 注入系统（inject-plan.ts）
//   ① 片段化：每 app 声明可注入的「片段类型」（registerInjectPlan），玩家可精准勾选注入哪部分（默认全关）。
//   ② 封套：每片段包成带标签 + 中文说明的封套（who/what/日期/范围/使用须知），封套模板可编辑（prompt-registry）。
//   ③ 两种去向：世界书条目注入 / 注入到玩家即将输入的那一楼（GENERATION_AFTER_COMMANDS 生成前装配）。
//   ④ 注入时机：生成前重新装配持久注入（once 一次性注入时机会错位→看不到，故改为生成前重装配）。
// 默认全部关；不做真宏（仅语义封套）。
// 纯数据/接口层 + 一个全局事件钩子；window→getRoot 兜底，失败一律降级不 throw。
import { getRoot, safeTriggerSlash } from '../tavern-api';
import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';
import { registerPromptTemplate, getPromptText, fillTemplate } from './world-prompts';
import { syncToWorldbook, deleteSyncEntry } from './wb-sync';

// ==================== 片段类型登记 ====================
// kind 决定封套措辞：fact=已发生的事实(可参考勿复述) / state=当前状态(这是现状) / direction=导演指令(按此调性)。
export type SegmentKind = 'fact' | 'state' | 'direction';
// 可选的「注入范围」子项。若片段提供 scope，注入面板会显示子项勾选，
// 玩家可只注入其中一部分（如「只注入这 2 个订单」）。build 会收到选中的 id 列表。
export type InjectScopeItem = { id: string; label: string; hint?: string };
export type InjectSegmentDef = {
  id: string;            // app 内唯一，如 'chat'
  name: string;          // 显示名，如 '聊天记录'
  desc: string;          // 作用说明
  kind: SegmentKind;     // 语义类别（决定默认封套措辞）
  // 封套语义：让 AI 明确「这是什么、属于哪个模块、后文该怎么体现」。
  module?: string;       // 所属模块/界面，如 '我的订单'、'聊天会话'（缺省取片段名）
  what?: string;         // 一句话说明这段内容是什么（缺省按 kind 给通用说明）
  guide?: string;        // 后文应如何体现/呼应这段内容（缺省按 kind 给通用导引）
  // 可选注入范围。提供时面板出现子项勾选；build 收到选中 id 列表（null=全部/未细分）。
  scope?: { label: string; list: () => InjectScopeItem[] };
  // 取该片段当前注入内容（已是正文，不含封套）。返回 null/空=本片段此刻无内容。
  // meta 用于封套占位（对象/日期/范围等）；scopeIds 为玩家在面板里勾选的子项（无 scope 时为 null）。
  build: (scopeIds?: string[] | null) => { body: string; meta?: Record<string, string> } | null;
};
export type InjectPlanDef = {
  appId: string;
  appName: string;
  segments: InjectSegmentDef[];
  // 可选「世界书同步总闸」：返回 false 时，本 app 的所有片段都不写世界书（含手动同步按钮 + 预览的世界书列）。
  //   floor（写输入框）不受此闸影响——它是「注入聊天框」另一条路。用于兑现 app 自己的「启用同步」总开关。
  wbGate?: () => boolean;
};

const _registry = new Map<string, InjectPlanDef>();
export function registerInjectPlan(def: InjectPlanDef): void {
  _registry.set(def.appId, def);
  // 为每个片段登记一条可编辑封套模板（prompt-registry），玩家可改写
  for (const seg of def.segments) ensureEnvelopeTemplate(def, seg);
}
export function getInjectPlan(appId: string): InjectPlanDef | undefined { return _registry.get(appId); }
export function listInjectPlans(): InjectPlanDef[] {
  return [..._registry.values()].sort((a, b) => a.appName.localeCompare(b.appName));
}

// ==================== 注入暂存夹（Stash）+ 自定义自由片段 ====================
// 目标：app 独立于正文，玩家把 app 里「喜欢的东西」自由注入世界书/输入框。
//   ① 暂存夹：界面里散落的一次性「注入正文」按钮，改为「加入注入暂存夹」——把这条具体内容
//      （某条微博 / 某出小剧场 / 某段回归简报…）收进本 app 的暂存夹，由注入面板统一决定何时/怎样注入。
//   ② 自定义片段：玩家在注入面板手写任意文本，作为一条常驻自定义片段纳入统一注入。
//   两者都表现为「合成片段」，与内置片段共用同一套 勾选/去向/范围/封套/装配 机制。
export type StashItem = { id: string; title: string; body: string; ts: number };
export type CustomSeg = { id: string; name: string; body: string; kind: SegmentKind; ts: number };
const STASH_KEY = WORLD_LS_KEYS.injectstash;
const CUSTOM_KEY = WORLD_LS_KEYS.injectcustom;
type StashMap = Record<string, StashItem[]>;
type CustomMap = Record<string, CustomSeg[]>;
function readStash(): StashMap { return readWorldJson<StashMap>(STASH_KEY, {}); }
function writeStash(m: StashMap): void { writeWorldJson(STASH_KEY, m); }
function readCustom(): CustomMap { return readWorldJson<CustomMap>(CUSTOM_KEY, {}); }
function writeCustom(m: CustomMap): void { writeWorldJson(CUSTOM_KEY, m); }

// 合成片段 id 前缀（与内置片段 id 隔离，避免撞名）
const STASH_SEG_ID = '__stash__';
const CUSTOM_SEG_PREFIX = '__custom__:';
export function isSyntheticSegId(segId: string): boolean { return segId === STASH_SEG_ID || segId.startsWith(CUSTOM_SEG_PREFIX); }

// —— 暂存夹增删查 ——
export function getStash(appId: string): StashItem[] { return readStash()[appId] || []; }
// 界面「加入注入」调用：把一条具体内容收进暂存夹。去重（同 title+body 不重复入）。返回新条目 id（或已存在的）。
export function addToStash(appId: string, title: string, body: string): string {
  const b = (body || '').trim(); if (!b) return '';
  const m = readStash(); const list = (m[appId] ||= []);
  const exist = list.find(x => x.title === title && x.body === b);
  if (exist) return exist.id;
  const id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  list.unshift({ id, title: (title || '未命名').trim(), body: b, ts: Date.now() });
  if (list.length > 50) list.length = 50;   // 上限保护
  writeStash(m);
  // 收进暂存夹后，默认把「暂存夹」这个合成片段打开（floor 去向），让玩家一眼看到已生效待发
  const sel = getSegSel(appId, STASH_SEG_ID);
  if (!sel.on) setSegSel(appId, STASH_SEG_ID, { on: true });
  return id;
}
export function removeStashItem(appId: string, itemId: string): void {
  const m = readStash(); const list = m[appId]; if (!list) return;
  m[appId] = list.filter(x => x.id !== itemId); writeStash(m);
}
export function clearStash(appId: string): void { const m = readStash(); delete m[appId]; writeStash(m); }

// —— 自定义自由片段增删改查 ——
export function getCustomSegs(appId: string): CustomSeg[] { return readCustom()[appId] || []; }
export function addCustomSeg(appId: string, name: string, body: string, kind: SegmentKind = 'fact'): string {
  const m = readCustom(); const list = (m[appId] ||= []);
  const id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  list.push({ id, name: (name || '自定义片段').trim(), body: (body || '').trim(), kind, ts: Date.now() });
  writeCustom(m);
  return id;
}
export function updateCustomSeg(appId: string, id: string, patch: Partial<Pick<CustomSeg, 'name' | 'body' | 'kind'>>): void {
  const m = readCustom(); const list = m[appId]; if (!list) return;
  const it = list.find(x => x.id === id); if (!it) return;
  if (patch.name != null) it.name = patch.name;
  if (patch.body != null) it.body = patch.body;
  if (patch.kind != null) it.kind = patch.kind;
  writeCustom(m);
}
export function removeCustomSeg(appId: string, id: string): void {
  const m = readCustom(); const list = m[appId]; if (!list) return;
  m[appId] = list.filter(x => x.id !== id); writeCustom(m);
}

// 把暂存夹 + 自定义片段合成为 InjectSegmentDef，追加到内置片段后面，供面板/装配统一处理。
function syntheticSegments(appId: string): InjectSegmentDef[] {
  const out: InjectSegmentDef[] = [];
  const stash = getStash(appId);
  if (stash.length) {
    out.push({
      id: STASH_SEG_ID, name: '注入暂存夹', kind: 'fact',
      desc: `你从各处「加入注入」的 ${stash.length} 条内容。可只勾其中几条注入。`,
      module: '注入暂存夹',
      what: '玩家在本 app 各界面手动挑出、想让正文知道的若干条具体内容（某条动态/某出戏/某段简报等）。',
      guide: '后文怎么体现：把这些内容当作玩家确实经历/看到/在意的事，自然融入后续剧情或让角色据此回应，不必逐条复述。',
      scope: { label: '选择要注入的条目', list: () => stash.map(s => ({ id: s.id, label: s.title, hint: s.body.slice(0, 24) })) },
      build: (scopeIds) => {
        const picked = (scopeIds == null) ? stash : stash.filter(s => scopeIds.includes(s.id));
        if (!picked.length) return null;
        const body = picked.map(s => `【${s.title}】${s.body}`).join('\n\n');
        return { body, meta: { 条数: String(picked.length) } };
      },
    });
  }
  for (const cs of getCustomSegs(appId)) {
    out.push({
      id: CUSTOM_SEG_PREFIX + cs.id, name: cs.name || '自定义片段', kind: cs.kind,
      desc: '你手写的一条自定义注入内容。',
      module: '自定义片段',
      what: '玩家自行撰写、希望注入正文/世界书的一段内容。',
      build: () => { const b = (cs.body || '').trim(); return b ? { body: b } : null; },
    });
  }
  // 为合成片段确保封套模板存在（可编辑）
  const plan = _registry.get(appId);
  const appName = plan?.appName || appId;
  for (const seg of out) ensureEnvelopeFor(appId, appName, seg);
  return out;
}

// 面板/装配统一入口：内置片段 + 合成片段（暂存夹/自定义）。
export function effectiveSegments(appId: string): InjectSegmentDef[] {
  const plan = _registry.get(appId);
  const builtin = plan ? plan.segments : [];
  return [...builtin, ...syntheticSegments(appId)];
}
// 按 id 取有效片段（含合成）。装配/范围查询用。
function findSeg(appId: string, segId: string): InjectSegmentDef | undefined {
  return effectiveSegments(appId).find(s => s.id === segId);
}

// ==================== 玩家选择（默认全关）====================
// 存储：{ [appId]: { [segId]: { on:bool, mode:'worldbook'|'floor', scope?:string[] } } }
// scope 为玩家勾选的子项 id 列表；undefined=全部（未细分），[]=一个都不选（视为无内容）。
export type InjectMode = 'worldbook' | 'floor';
type SegSel = { on: boolean; mode: InjectMode; scope?: string[] };
type SelMap = Record<string, Record<string, SegSel>>;
const LS_KEY = WORLD_LS_KEYS.injectsel;
function readSel(): SelMap { return readWorldJson<SelMap>(LS_KEY, {}); }
function writeSel(m: SelMap): void { writeWorldJson(LS_KEY, m); }

export function getSegSel(appId: string, segId: string): SegSel {
  const s = readSel()[appId]?.[segId];
  return { on: s?.on ?? false, mode: s?.mode ?? 'floor', scope: s?.scope };   // 默认关、默认楼层注入、范围默认全选
}
export function setSegSel(appId: string, segId: string, patch: Partial<SegSel>): void {
  const m = readSel(); const a = (m[appId] ||= {}); const cur = a[segId] || { on: false, mode: 'floor' as InjectMode };
  a[segId] = { ...cur, ...patch }; writeSel(m);
}
// 某 app 是否有任何片段开启
export function appHasActiveSeg(appId: string): boolean {
  const a = readSel()[appId]; if (!a) return false;
  return Object.values(a).some(s => s.on);
}

// 取某片段的「注入范围」子项列表（无 scope 返回 null）。（含合成片段）
export function getSegScopeItems(appId: string, segId: string): InjectScopeItem[] | null {
  const seg = findSeg(appId, segId);
  if (!seg || !seg.scope) return null;
  try { return seg.scope.list() || []; } catch (e) { void e; return []; }
}
export function getSegScopeLabel(appId: string, segId: string): string {
  const seg = findSeg(appId, segId);
  return seg?.scope?.label || '注入范围';
}
// 当前勾选的子项 id（undefined=全部）；读取面板用，渲染勾选态。
export function getSegScopeSel(appId: string, segId: string): string[] | undefined {
  return getSegSel(appId, segId).scope;
}
export function setSegScopeSel(appId: string, segId: string, ids: string[] | undefined): void {
  setSegSel(appId, segId, { scope: ids });
}

// ==================== 封套模板 ====================
// 封套给 AI 的「元信息 + 内容」：
//   - 标签头：<世界套件·app·片段 module=… kind=…> 让 AI 一眼知道来源/模块/性质。
//   - 「这是什么」：本段内容是什么、属于哪个 app 的哪个模块。
//   - 正文本体。
// 去冗余：同类片段字字相同的「怎么用/后文怎么体现」不再逐条重复，改由装配时按 kind
//   发一次共享前言（KIND_PREAMBLE）。玩家若把封套模板改回含 {{usage}}/{{guide}} 的完整格式，仍照旧渲染。
// 模板 id：inject.envelope.<appId>.<segId>。占位符：{{app}} {{seg}} {{module}} {{kind}} {{meta}} {{what}} {{usage}} {{guide}} {{body}}。
function envTemplateId(appId: string, segId: string): string { return `inject.envelope.${appId}.${segId}`; }
// 供设置面板就地编辑某片段封套模板用（封套也是 prompt-registry 模板）。
export function getEnvelopeTemplateId(appId: string, segId: string): string { return envTemplateId(appId, segId); }
const KIND_USAGE: Record<SegmentKind, string> = {
  fact: '【性质：已发生的既定事实】把以下内容当作此前真实发生过、已经写定的前情来对待。它是背景与依据，不是此刻正在进行的对话或事件，请勿原样复述、勿当作刚刚发生来重写。',
  state: '【性质：当前状态与设定现状】把以下内容当作此刻成立的事实状态。后续正文要与它保持一致，不要写出与之矛盾的设定、数值或关系。',
  direction: '【性质：创作基调与导演指令】以下是对氛围、尺度、方向的指示，请据此把握续写的调性，但不要把这段指令本身或其措辞写进正文。',
};
const KIND_GUIDE: Record<SegmentKind, string> = {
  fact: '后文怎么体现：当剧情自然触及时，可以让角色基于这些既成事实去回应、回忆或被影响（如提到、暗示、受其牵动），无需刻意复述全部细节，重在保持前后连贯。',
  state: '后文怎么体现：让这些状态在正文中持续生效——角色的处境、关系、持有物、数值等都应与之吻合，必要时顺势体现，但不要生硬罗列。',
  direction: '后文怎么体现：按这里给定的基调与尺度来组织接下来的描写，把指令消化成具体的情节、对白与画面，而不是把要求本身说出来。',
};
const KIND_NAME: Record<SegmentKind, string> = { fact: '事实', state: '现状', direction: '导演' };
// 楼层注入时，同一 kind 的多个片段共享一段前言（怎么用 + 后文怎么体现），只发一次。
const KIND_PREAMBLE: Record<SegmentKind, string> = {
  fact: `【以下均为“已发生的既定事实”】把它们当作此前真实发生过、已写定的前情：是背景与依据，不是此刻正在进行的对话或事件，勿原样复述、勿当作刚发生来重写。后文自然触及时，可让角色基于这些事实去回应/回忆/被牵动，重在前后连贯，不必复述全部细节。`,
  state: `【以下均为“当前状态与设定现状”】把它们当作此刻成立的事实状态：后续正文要与之一致，不要写出矛盾的设定、数值或关系。让这些状态在正文里持续生效（处境/关系/持有物/数值等顺势体现），不要生硬罗列。`,
  direction: `【以下均为“创作基调与导演指令”】是对氛围、尺度、方向的指示：据此把握续写调性，把指令消化成具体情节、对白与画面，但不要把这些指令本身或其措辞写进正文。`,
};

function ensureEnvelopeTemplate(plan: InjectPlanDef, seg: InjectSegmentDef): void {
  ensureEnvelopeFor(plan.appId, plan.appName, seg);
}
// 合成片段（暂存夹/自定义）也需要可编辑封套——用轻量入口按 appId/appName 登记。
function ensureEnvelopeFor(appId: string, appName: string, seg: InjectSegmentDef): void {
  const id = envTemplateId(appId, seg.id);
  registerPromptTemplate({
    id, appId, appName,
    name: `注入封套 · ${seg.name}`,
    desc: `${appName}「${seg.name}」注入正文/世界书时的封套包裹格式（${KIND_NAME[seg.kind]}类）。决定 AI 如何理解这段被注入的内容（是什么/属于哪个模块/怎么用/后文如何体现）。占位符见下方。`,
    vars: [
      { key: 'app', desc: 'app 名（如 微信）' },
      { key: 'seg', desc: '片段名（如 聊天记录）' },
      { key: 'module', desc: '所属模块/界面（如 我的订单）' },
      { key: 'kind', desc: '性质标记（事实/现状/导演）' },
      { key: 'meta', desc: '元信息行（对象/日期/范围等，自动拼装）' },
      { key: 'what', desc: '这段内容是什么（一句话说明，自动给定可改写）' },
      { key: 'usage', desc: '处理原则（按事实/现状/导演自动给定）' },
      { key: 'guide', desc: '后文应如何体现（按事实/现状/导演自动给定）' },
      { key: 'body', desc: '片段正文内容（自动填入）' },
    ],
    // 去冗余：默认封套只保留「标签头 + 是什么 + 正文」，把「怎么用/后文怎么体现」这段
    //   同类片段字字相同的说明，提到装配时按 kind 只发一次共享前言（省 token）。仍可就地改写恢复完整格式。
    default:
      `<世界套件·{{app}}·{{seg}} module="{{module}}" kind="{{kind}}" {{meta}}>\n`
      + `· 这是什么：{{what}}\n`
      + `{{body}}\n`
      + `</世界套件·{{app}}·{{seg}}>`,
  });
}

// 把一个片段渲染成封套文本（取玩家可能改写过的模板）。
export function renderEnvelope(appId: string, seg: InjectSegmentDef, built: { body: string; meta?: Record<string, string> }): string {
  const id = envTemplateId(appId, seg.id);
  const plan = _registry.get(appId);
  const appName = plan?.appName || appId;
  const metaPairs = built.meta || {};
  const metaStr = Object.entries(metaPairs).map(([k, v]) => `${k}="${String(v).replace(/"/g, '＂')}"`).join(' ');
  const module = seg.module || seg.name;
  const what = seg.what || `${appName}「${module}」模块中的「${seg.name}」内容`;
  return fillTemplate(getPromptText(id), {
    app: appName,
    seg: seg.name,
    module,
    kind: KIND_NAME[seg.kind],
    meta: metaStr,
    what,
    usage: KIND_USAGE[seg.kind],
    guide: seg.guide || KIND_GUIDE[seg.kind],
    body: built.body,
  });
}

// ==================== 装配：收集所有「开启」的片段，按方式分两路 ====================
type Assembled = { floorText: string; worldbook: { appId: string; appName: string; segId: string; segName: string; content: string }[] };
// onlyAppId：仅汇集该 app 的片段（按钮触发的「写入输入框」按 app 隔离，避免串台到其他 app）。
//   不传＝全局（仅「预览」用，玩家明确想看全部时）。
function assemble(onlyAppId?: string): Assembled {
  const out: Assembled = { floorText: '', worldbook: [] };
  // 楼层片段按 kind 分组，每组共享一段前言只发一次；worldbook 仍逐条独立（含各自完整封套）。
  const floorByKind: Record<SegmentKind, string[]> = { fact: [], state: [], direction: [] };
  for (const plan of _registry.values()) {
    if (onlyAppId && plan.appId !== onlyAppId) continue;
    const wbAllowed = plan.wbGate ? !!plan.wbGate() : true;   // 世界书同步总闸（floor 不受影响）
    // 含合成片段（暂存夹/自定义）
    for (const seg of effectiveSegments(plan.appId)) {
      const sel = getSegSel(plan.appId, seg.id);
      if (!sel.on) continue;
      // 有 scope 且玩家勾了空集 → 视为不注入
      const scopeIds = seg.scope ? (sel.scope ?? null) : null;
      if (seg.scope && Array.isArray(scopeIds) && scopeIds.length === 0) continue;
      if (sel.mode !== 'floor' && !wbAllowed) continue;   // 世界书去向被总闸关掉
      let built: { body: string; meta?: Record<string, string> } | null = null;
      try { built = seg.build(scopeIds); } catch (e) { void e; built = null; }
      if (!built || !built.body || !built.body.trim()) continue;
      const env = renderEnvelope(plan.appId, seg, built);
      if (sel.mode === 'floor') floorByKind[seg.kind].push(env);
      // worldbook 条目各自独立存在，前置该 kind 的说明前言，保证单条自解释。
      else out.worldbook.push({ appId: plan.appId, appName: plan.appName, segId: seg.id, segName: seg.name, content: KIND_PREAMBLE[seg.kind] + '\n' + env });
    }
  }
  // 按 事实→现状→导演 顺序拼装；每组前置一次共享前言，组内片段之间空行分隔。
  const groups: string[] = [];
  (['fact', 'state', 'direction'] as SegmentKind[]).forEach(k => {
    const chunks = floorByKind[k];
    if (!chunks.length) return;
    groups.push(KIND_PREAMBLE[k] + '\n\n' + chunks.join('\n\n'));
  });
  out.floorText = groups.join('\n\n');
  return out;
}

// 预览：玩家在设置里查看「此刻将注入给酒馆的完整文本」（两路分别展示）。
// appId：仅预览该 app 的片段（与「写入输入框」按 app 隔离一致，避免在糖心面板看到 B 站内容）。
export function previewInjection(appId?: string): { floorText: string; worldbookList: { appName: string; segName: string; content: string }[] } {
  const a = assemble(appId);
  return { floorText: a.floorText, worldbookList: a.worldbook.map(w => ({ appName: w.appName, segName: w.segName, content: w.content })) };
}

// ==================== 输入框注入：写入酒馆输入框尾部（与地点卡片「发送」一致）====================
// 「floor」模式＝与状态栏地点 modal 卡片「发送」一致的逻辑：把封套文本追加到酒馆输入框
//   （#send_textarea）尾部，玩家能直接看到、可再编辑、随下一楼正文一起发出。
//   （改用输入框而非 GENERATION_AFTER_COMMANDS 持久注入：后者不可见、时机易错位。
//    mode 存储键仍沿用 'floor' 以兼容旧数据，但语义＝写入输入框。）
const INPUT_MACRO = String.fromCharCode(123, 123) + 'input' + String.fromCharCode(125, 125);
function findTavernInputBox(): HTMLTextAreaElement | null {
  try {
    const doc = (getRoot() as any)?.document || document;
    const ta = (doc.querySelector('#send_textarea') || doc.querySelector('textarea#send_textarea')) as HTMLTextAreaElement | null;
    if (ta) return ta;
  } catch (e) { void e; }
  return null;
}
// 把当前开启的「输入框」模式片段写入酒馆输入框尾部。返回写入的字符数（0=无内容/失败）。
// appId：仅写该 app 的片段（按 app 隔离，防止糖心面板点击却把 B 站等其他 app 的片段也写进去）。
function writeFloorToInputBox(appId?: string): number {
  const { floorText } = assemble(appId);
  const text = floorText.trim();
  if (!text) return 0;
  // 优先直接写 textarea（多行封套更稳，不受 slash 解析换行影响）；失败回退 /setinput（与地点卡一致）。
  const ta = findTavernInputBox();
  if (ta) {
    try {
      const cur = (ta.value || '').replace(/\s+$/, '');
      ta.value = cur ? cur + '\n\n' + text : text;
      ta.dispatchEvent(new Event('input', { bubbles: true }));   // 让酒馆同步内部状态/自适应高度
      try { ta.focus(); } catch (e) { void e; }
      return text.length;
    } catch (e) { void e; }
  }
  try { safeTriggerSlash('/setinput ' + INPUT_MACRO + ' ' + text); return text.length; } catch (e) { void e; }
  return 0;
}

// 兼容旧调用：注入总线现在是空操作（输入框注入改为按钮触发，不需要生成前钩子）。
export function startInjectionBus(): void { /* no-op：改为输入框注入，无需 GENERATION 钩子 */ }

// 手动「写入输入框」——把当前开启的「输入框」模式片段追加到酒馆输入框尾部。
// appId：按 app 隔离（糖心点击只写糖心片段，不再串到 B 站等其他 app）。
// 返回写入字符数（0=该 app 当前没有开启任何「输入框」模式片段或写入失败）。
export function flushFloorInjection(appId?: string): number {
  try { return writeFloorToInputBox(appId); } catch (e) { void e; return 0; }
}
// 当前 app 是否有「输入框」模式的开启片段（供 UI 区分提示）。
export function hasActiveFloorSeg(appId?: string): boolean {
  try { return assemble(appId).floorText.trim().length > 0; } catch (e) { void e; return false; }
}

// ==================== 世界书注入：玩家手动「同步现在」/片段开关切换时调用 ====================
// 把某 app 当前所有「worldbook 模式且开启」的片段写入角色卡主世界书（封套已含）。
export async function syncAppWorldbookSegments(appId: string): Promise<number> {
  const plan = _registry.get(appId); if (!plan) return 0;
  if (plan.wbGate && !plan.wbGate()) return 0;   // 世界书同步总闸：关闭时手动同步也不写
  let n = 0;
  for (const seg of effectiveSegments(appId)) {   // 含合成片段
    const sel = getSegSel(appId, seg.id);
    if (!sel.on || sel.mode !== 'worldbook') continue;
    const scopeIds = seg.scope ? (sel.scope ?? null) : null;
    if (seg.scope && Array.isArray(scopeIds) && scopeIds.length === 0) continue;
    let built: { body: string; meta?: Record<string, string> } | null = null;
    try { built = seg.build(scopeIds); } catch (e) { void e; built = null; }
    if (!built || !built.body || !built.body.trim()) continue;
    const content = renderEnvelope(appId, seg, built);
    const ok = await syncToWorldbook({
      appId, appName: plan.appName, memType: seg.name,
      memKey: `inject:${appId}:${seg.id}`, title: seg.name, content,
    });
    if (ok) n++;
  }
  return n;
}
// 关闭某片段的世界书注入时，移除其已写入条目。
export async function removeWorldbookSegment(appId: string, segId: string): Promise<void> {
  try { await deleteSyncEntry(`inject:${appId}:${segId}`); } catch (e) { void e; }
}

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_inject__ = { registerInjectPlan, listInjectPlans, getSegSel, setSegSel, previewInjection, startInjectionBus, syncAppWorldbookSegments, addToStash, getStash, getCustomSegs };
} catch (e) { void e; }
