// 世界套件 P0-B · 世界演化（evolution.ts）
// 定位：对「玩家不在场」的角色（离场 NPC / 联系人 / 自定义）做酒馆正文之外的额外演化。
//   玩家点「推进演化」→ generateRaw 组 (角色设定 + 历史演化记忆 + 世界时间 + 玩家方向提示)
//   → 返回演化片段(json_schema:{summary, events[], 变量变化?}) → 存时间线。
//   每条结果可「注入正文」(injectPrompts 持久，可关) + 可选「应用到酒馆变量」(updateVariablesWith，二次确认)。
// 跨窗口：DOM 全走 qs（parent.document），读全局接口 window→getRoot 兜底（§4）。
// 单 modal SPA：openModal2 只调一次（reset+revive），内部视图/sheet 自渲染，绝不堆叠 modal（§10.0）。
import { esc, qs } from '../../lib/dom-utils';
import { openModal2 } from '../../status-bar-init';
import { iconHtml } from '../../lib/icons';
import { getRoot, safeGetVariables, safeUpdateVariablesWith } from '../../lib/tavern-api';
import { registerWorldApp } from '../../lib/world/world-store';
import { registerPromptTemplate, getPromptText, isPromptOverridden, listPromptTemplates, setPromptOverride, resetPrompt } from '../../lib/world/world-prompts';
import { chatGenerate, injectWorldPersistent, uninjectWorld, parseLooseJson, readTavernFloors, onStreamToken } from '../../lib/world/ai-chat';
import { ensureSession, appendTurn, buildMemoryContext, runShortSummary } from '../../lib/world/memory';
import { makeSummarizer } from '../../lib/world/ai-chat';
import { getContacts } from '../../lib/world/contacts';
import { getApiPresetNames } from '../../lib/preset-env';
import { listWorldbookNames, listWorldbookEntries, isWorldbookAvailable } from '../../lib/world/worldbook';
import {
  EvoEntry, EvoVarChange, EvoWbRef,
  getActors, getActor, ensureActor, updateActorConfig, deleteActor, setActorInject,
  addEntry, updateEntry, deleteEntry, buildInjectText,
  getEvoConfig, saveEvoConfig, WORLD_DIMENSIONS,
} from '../../lib/world/evolution-store';

// ==================== 提示词模板注册（#8 可编辑；#6 三套高质量提示词：单人/联合/世界背景）====================
registerPromptTemplate({
  id: 'evolution.advance', appId: 'evolution', appName: '世界演化', name: '单人推演',
  desc: '玩家不在场时，单个角色独自经历了什么。控制演化片段的笔触、密度与产出结构。',
  vars: [
    { key: 'name', desc: '角色昵称' },
    { key: 'span', desc: '这段时间跨度（如「约半天」）' },
    { key: 'worldTime', desc: '当前世界时间锚点' },
    { key: 'direction', desc: '玩家给的方向提示（可空）' },
  ],
  default: '你是一位顶尖的群像叙事作者，专长是「让配角在主角的镜头之外，依然过着自己真实的人生」。\n'
    + '现在镜头不在「{{name}}」身上——主角（玩家）离开了，没人盯着 ta。请你推演：在这段无人注视的时间里，{{name}} 独自经历了什么。\n'
    + '【时间】跨度约 {{span}}；世界此刻是「{{worldTime}}」。请让事件量与时间跨度相称：半天就是一两件事，一个月则可以有起伏和转折。\n'
    + '【写作要求】\n'
    + '· 把 {{name}} 当成一个有欲望、有日程、有情绪惯性的人：ta 会主动做事、会遇见别人、会起心思、会被外界影响而改变，而不是站在原地等主角回来。\n'
    + '· 紧扣 ta 的人设与既往演化记忆，保持连贯；事件要有具体的人、地、动作和因果，能让人脑补出画面，拒绝「ta 度过了平静的一天」这种空话。\n'
    + '· 允许并鼓励真实的变化：处境、关系、心境、身体状态、暗中的盘算、意料之外的插曲都可以发生，符合人设即可，不必事事如意。\n'
    + '· 边界：不要凭空把主角卷进来，不要替主角做决定或描写主角的言行；这是 {{name}} 自己的故事。\n'
    + '· 笔触：第三人称叙事，有细节、有温度、有呼吸感，像小说的一个过场章节，而不是工作汇报。\n'
    + '{{directionBlock}}'
    + '【输出】严格只输出 JSON：{"summary":"这段时间的整体经过，80~180 字的叙事段落","events":["可被后续剧情引用的关键事件（具体、简短）", "..."],'
    + '"变量变化":[{"path":"NPC.{{name}}.某状态","value":"建议的新值"}]}。\n'
    + 'events 给 1~4 条；变量变化是可选项，仅在确有明确、可量化的状态变化时给出（路径用酒馆变量的点路径），否则给空数组 []。不要输出 JSON 以外的任何文字。',
});
registerPromptTemplate({
  id: 'evolution.coadvance', appId: 'evolution', appName: '世界演化', name: '联合推演（多人）',
  desc: '一次推演多个角色在同一段时间里各自的经历，并让他们之间可能产生交集。一次 API 调用产出全部。',
  vars: [
    { key: 'roster', desc: '本轮参与推演的角色及其设定清单' },
    { key: 'names', desc: '参与角色的名字列表' },
    { key: 'span', desc: '这段时间跨度' },
    { key: 'worldTime', desc: '当前世界时间锚点' },
    { key: 'direction', desc: '玩家给的总体方向提示（可空）' },
  ],
  default: '你是一位顶尖的群像叙事作者，擅长同时调度多条人物线，让他们在同一段时间里各自生活、又彼此交织。\n'
    + '主角（玩家）此刻不在场。请你为下面这几位角色，各自推演在这段无人注视的时间里发生了什么：\n{{roster}}\n'
    + '【时间】跨度约 {{span}}；世界此刻是「{{worldTime}}」。\n'
    + '【写作要求】\n'
    + '· 为每位角色都给出独立、贴合其人设的经历，事件具体、有因果、有画面感，拒绝空泛套话。\n'
    + '· 重点用好「群像」的优势：如果剧情合理，让这些角色之间发生交集——相遇、合作、误会、冲突、错过、暗中影响彼此。但交集要自然，不要为凑而凑；没有交集时各自独立发展也完全可以。\n'
    + '· 紧扣各自的既往演化记忆与设定，保持连贯；允许真实的处境/关系/心境变化。\n'
    + '· 边界：不要把主角卷进来、不要替主角做决定；这是这些角色之间的故事。\n'
    + '· 笔触：第三人称叙事，每人 70~150 字，有细节有温度。\n'
    + '{{directionBlock}}'
    + '【输出】严格只输出 JSON：{"actors":[{"name":"角色名（必须是 {{names}} 之一）","summary":"该角色这段时间的经过","events":["关键事件", "..."],'
    + '"变量变化":[{"path":"变量点路径","value":"新值"}]}, ...]}。\n'
    + '必须为每位给定角色都输出一项；events 各 1~4 条；变量变化可选、无则空数组 []。不要输出 JSON 以外的任何文字。',
});
registerPromptTemplate({
  id: 'evolution.world', appId: 'evolution', appName: '世界演化', name: '世界背景推演',
  desc: '推演世界本身（而非具体角色）在这段时间里的变化：势力、民生、天候、暗流、舆论等维度。',
  vars: [
    { key: 'dimension', desc: '本线程关注的世界维度（如「势力动向」）' },
    { key: 'span', desc: '这段时间跨度' },
    { key: 'worldTime', desc: '当前世界时间锚点' },
    { key: 'direction', desc: '玩家给的方向提示（可空）' },
    { key: 'backdrop', desc: '世界观背景设定（玩家在该线程里补充的设定，可空）' },
  ],
  default: '你是一位世界观架构师与编年史作者，擅长推演一个活着的世界如何在幕后自行运转、缓慢改变。\n'
    + '主角（玩家）的故事只是这个世界的一隅。现在请你把视角拉远，推演在主角看不到的地方，这个世界在「{{dimension}}」这个维度上，于这段时间里发生了哪些变化。\n'
    + '【时间】跨度约 {{span}}；世界此刻是「{{worldTime}}」。\n'
    + '{{backdropBlock}}'
    + '【写作要求】\n'
    + '· 聚焦「{{dimension}}」：写宏观的、结构性的、群体层面的变动（局势、风向、资源、人心、环境、隐患的累积或爆发），而不是某个具体角色的私事。\n'
    + '· 让世界显得「自己在动」：事件之间有因果链、有趋势、有未爆的伏笔，像真实历史那样有惯性也有意外。\n'
    + '· 紧扣已有的世界观设定与该线程既往演化记忆，保持连贯，不自相矛盾。\n'
    + '· 这些变化应当能为后续剧情提供土壤与钩子（玩家回到场上时，世界已经不太一样了）。\n'
    + '· 笔触：第三人称编年体叙事，100~180 字，凝练而有信息量。\n'
    + '{{directionBlock}}'
    + '【输出】严格只输出 JSON：{"summary":"该维度这段时间的整体变化","events":["可被剧情引用的具体变动/事件", "..."],'
    + '"变量变化":[{"path":"世界变量点路径","value":"新值"}]}。\n'
    + 'events 给 2~5 条；变量变化可选、无则空数组 []。不要输出 JSON 以外的任何文字。',
});

const EVO_MODAL_MAXW = 'min(880px,96vw)';
const RID = 'th-evo-app-root';
let _opening = false;
let _busy = false;
let _selected = new Set<string>();        // #4 列表多选（批量/联合推演）
let _stream = '';                          // 流式预览文本（推演中实时显示）
let _ceWb: EvoWbRef[] = [];                // charConfig sheet 内编辑中的世界书引用暂存

// ==================== 视图状态机 ====================
type ViewState = { name: 'list' | 'detail'; actorId?: string };
type SheetState =
  | { kind: 'pick' }                                  // 选演化对象（离场 NPC / 联系人 / 世界线程）
  | { kind: 'advance'; actorId: string }              // 单人推进表单
  | { kind: 'coadvance' }                             // #4 联合推进（多选）表单
  | { kind: 'charConfig'; actorId: string }           // #3 角色配置（专属世界书/额外设定/人设）
  | { kind: 'wbPick'; actorId: string }               // #3 给角色选世界书条目
  | { kind: 'settings' }                              // #3 世界演化设置（API/正文/注入）
  | { kind: 'varReview'; actorId: string; entryId: string } // 变量回写确认
  | { kind: 'entryEdit'; actorId: string; entryId: string } // 编辑某条演化
  | { kind: 'prompt'; id: string }                    // 提示词编辑
  | { kind: 'streaming' }                             // 推演流式预览
  | null;
let _view: ViewState = { name: 'list' };
let _sheet: SheetState = null;

function rootEl(): HTMLElement | null { return qs<HTMLElement>('#' + RID); }
function toast(kind: 'success' | 'error' | 'info' | 'warning', msg: string): void {
  try { (window as any).toastr?.[kind]?.(msg); } catch (e) { void e; }
}
function ask(msg: string, def = ''): string | null {
  try { const v = (window as any).prompt?.(msg, def); return v == null ? null : String(v); } catch (e) { void e; return null; }
}
function confirmBox(msg: string): boolean {
  try { return !!(window as any).confirm?.(msg); } catch (e) { void e; return false; }
}
function evoSessionId(actorId: string): string { return 'evo_' + actorId; }

// 流式预览：只更新 <pre data-evo-stream> 文本，避免整树重渲染导致闪烁/滚动跳动。
function pushStream(text: string): void {
  _stream = text;
  const el = rootEl()?.querySelector('[data-evo-stream]') as HTMLElement | null;
  if (el) { el.textContent = text || '……'; el.scrollTop = el.scrollHeight; }
}

// 读酒馆「世界信息」时间（演化锚点）。bridge 优先，跨窗口兜底。
function worldTimeLabel(): string {
  try {
    const bridge = (window as any).__thStatusBarData || (getRoot() as any).__thStatusBarData;
    const d = bridge?.getCurrentData?.();
    const w = (d && typeof d === 'object') ? (d['世界信息'] || {}) : {};
    return [w['日期'], w['时间']].filter(Boolean).join(' ');
  } catch (e) { void e; return ''; }
}

// 读离场 NPC（getCurrentData.NPC 里 是否在场 !== true 的）。返回 {name, persona}。
function offlineNpcs(): { name: string; persona: string }[] {
  try {
    const bridge = (window as any).__thStatusBarData || (getRoot() as any).__thStatusBarData;
    const d = bridge?.getCurrentData?.();
    const npc = (d && typeof d === 'object') ? (d['NPC'] || {}) : {};
    return Object.entries(npc)
      .filter(([, info]: [string, any]) => info && info['是否在场'] !== true)
      .map(([name, info]: [string, any]) => {
        const bits = [info['身份'] ? `身份：${info['身份']}` : '', info['性格'] ? `性格：${info['性格']}` : '', info['简介'] || info['描述'] || ''].filter(Boolean);
        return { name, persona: bits.join('；') };
      });
  } catch (e) { void e; return []; }
}

// MARK_RENDER

// ==================== 中央渲染 ====================
function render(): void {
  const root = rootEl();
  if (!root) {
    if (_opening) return;
    _opening = true;
    try { openApp(); } finally { _opening = false; }
    return;
  }
  root.innerHTML = viewHtml() + sheetHtml();
}
function go(v: ViewState): void { _view = v; _sheet = null; render(); }
function openSheet(s: SheetState): void { _sheet = s; render(); }
function closeSheet(): void { _sheet = null; render(); }

function viewHtml(): string {
  if (_view.name === 'detail' && _view.actorId) return detailHtml(_view.actorId);
  return listHtml();
}

function timeLabel(ts: number): string {
  try {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch (e) { void e; return ''; }
}
function avatarChip(name: string): string {
  const ch = (name || '?').slice(0, 1);
  return `<span class="th-evo-av">${esc(ch)}</span>`;
}

// MARK_LIST

// ==================== 列表视图：演化对象 ====================
function listHtml(): string {
  const actors = getActors();
  const head = `<div class="th-evo-head">
    <span class="th-evo-title">${iconHtml('fa-seedling')} 世界演化</span>
    <span class="th-evo-head-ops">
      <button class="th-evo-chip" data-evo-settings type="button" title="设置">${iconHtml('fa-gear')} 设置</button>
      <button class="th-evo-chip" data-evo-prompts type="button" title="提示词">${iconHtml('fa-pen')} 提示词</button>
      <button class="th-evo-primary" data-evo-pick type="button">${iconHtml('fa-plus')} 添加对象</button>
    </span>
  </div>`;
  const intro = `<div class="th-evo-intro">推进「玩家不在场」的角色、甚至整个世界背景独自演化；可多选一次联合推演，结果可注入正文、可回写变量。</div>`;
  if (!actors.length) {
    return `<div class="th-evo-app" data-evo-view="list">${head}${intro}
      <div class="th-evo-empty">${iconHtml('fa-seedling')}
        <div>还没有演化对象</div>
        <div class="th-evo-empty-sub">点「添加对象」，从离场 NPC、联系人里挑一个，或开一条「世界背景」演化线，让你不在场的时候世界也在悄悄转动。</div>
        <button class="th-evo-primary" data-evo-pick type="button" style="margin-top:12px">${iconHtml('fa-plus')} 添加第一个对象</button>
      </div></div>`;
  }
  // #4 批量工具条（有选中时出现）
  const selN = actors.filter(a => _selected.has(a.id)).length;
  const batchBar = selN > 0
    ? `<div class="th-evo-batchbar">
        <span class="th-evo-batch-info">已选 ${selN} 个对象</span>
        <span class="th-evo-batch-ops">
          <button class="th-evo-chip" data-evo-selclear type="button">取消选择</button>
          <button class="th-evo-primary" data-evo-coadvance type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-forward')} 联合推演（${selN}人一次）</button>
        </span>
      </div>`
    : '';
  const rows = actors.map(a => {
    const last = a.timeline[a.timeline.length - 1];
    const preview = last ? esc(last.summary.slice(0, 48)) : '尚未推进演化';
    const isWorld = a.source === 'world';
    const checked = _selected.has(a.id) ? 'checked' : '';
    const tag = isWorld ? `<span class="th-evo-actor-tag th-evo-tag-world">${esc(a.dimension || '世界')}</span>` : '';
    return `<div class="th-evo-actor-row${_selected.has(a.id) ? ' th-evo-actor-sel' : ''}${isWorld ? ' th-evo-actor-world' : ''}">
      <label class="th-evo-actor-ck" title="选中以联合推演">
        <input type="checkbox" data-evo-sel="${esc(a.id)}" ${checked}>
      </label>
      <button class="th-evo-actor-main-btn" data-evo-open="${esc(a.id)}" type="button">
        ${isWorld ? `<span class="th-evo-av th-evo-av-world">${iconHtml('fa-globe')}</span>` : avatarChip(a.name)}
        <span class="th-evo-actor-main">
          <span class="th-evo-actor-name">${esc(a.name)} ${tag}
            ${a.injectEnabled ? `<span class="th-evo-flag" title="演化注入正文已开">${iconHtml('fa-syringe')}</span>` : ''}
            <span class="th-evo-actor-count">${a.timeline.length} 段</span>
          </span>
          <span class="th-evo-actor-preview">${preview}</span>
        </span>
        <span class="th-evo-actor-time">${last ? timeLabel(last.ts) : ''}</span>
      </button>
    </div>`;
  }).join('');
  return `<div class="th-evo-app" data-evo-view="list">${head}${intro}${batchBar}
    <div class="th-evo-actor-list">${rows}</div></div>`;
}

// MARK_DETAIL

// ==================== 详情视图：单角色时间线 ====================
function detailHtml(actorId: string): string {
  const a = getActor(actorId);
  if (!a) return `<div class="th-evo-app">${backHead('对象不存在')}</div>`;
  const head = `<div class="th-evo-subhead">
    <button class="th-evo-back" data-evo-back type="button">${iconHtml('fa-arrow-left')}</button>
    ${a.source === 'world' ? `<span class="th-evo-av th-evo-av-world">${iconHtml('fa-globe')}</span>` : avatarChip(a.name)}
    <span class="th-evo-subtitle">${esc(a.name)}${a.source === 'world' && a.dimension ? ` · ${esc(a.dimension)}` : ''}</span>
    <span class="th-evo-head-ops">
      <label class="th-evo-inject-toggle" title="把该对象最近的演化持续注入酒馆正文生成">
        <input type="checkbox" data-evo-inject ${a.injectEnabled ? 'checked' : ''}> ${iconHtml('fa-syringe')} 注入正文
      </label>
      <button class="th-evo-icon-btn" data-evo-charcfg type="button" title="角色/线程配置">${iconHtml('fa-id-card')}</button>
      <button class="th-evo-del" data-evo-actor-del type="button" title="删除对象">${iconHtml('fa-trash')}</button>
    </span>
  </div>`;
  const cfgInfo: string[] = [];
  if (a.worldbookRefs?.length) cfgInfo.push(`${iconHtml('fa-book')} 专属设定 ${a.worldbookRefs.length} 条`);
  if (a.extraNote) cfgInfo.push(`${iconHtml('fa-note-sticky')} 额外设定`);
  const persona = (a.persona || cfgInfo.length)
    ? `<div class="th-evo-persona">${a.persona ? `${iconHtml('fa-id-card')} ${esc(a.persona.slice(0, 120))}` : ''}${cfgInfo.length ? `<span class="th-evo-persona-cfg">${cfgInfo.join('　')}</span>` : ''}</div>`
    : '';
  const advanceBar = `<div class="th-evo-advancebar">
    <button class="th-evo-primary th-evo-advance-btn" data-evo-advance type="button" ${_busy ? 'disabled' : ''}>
      ${iconHtml('fa-forward')} ${_busy ? '推演中…' : '推进演化'}
    </button>
  </div>`;

  const timeline = a.timeline.length
    ? a.timeline.slice().reverse().map(e => entryCardHtml(e)).join('')
    : `<div class="th-evo-empty-sub" style="padding:20px;text-align:center">还没有演化。点「推进演化」让 ${esc(a.name)} 动起来。</div>`;

  return `<div class="th-evo-app" data-evo-view="detail" data-evo-aid="${esc(a.id)}">
    ${head}${persona}${advanceBar}
    <div class="th-evo-timeline">${timeline}</div></div>`;
}

function entryCardHtml(e: EvoEntry): string {
  const events = e.events && e.events.length
    ? `<ul class="th-evo-events">${e.events.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  const vc = e.varChanges && e.varChanges.length
    ? `<div class="th-evo-varhint">${iconHtml('fa-database')} ${e.varChanges.length} 项变量变化建议
        <button class="th-evo-chip th-evo-chip-sm" data-evo-varreview="${esc(e.id)}" type="button">查看/应用</button></div>` : '';
  return `<div class="th-evo-entry" data-evo-entry="${esc(e.id)}">
    <div class="th-evo-entry-top">
      <span class="th-evo-entry-when">${e.worldTime ? esc(e.worldTime) + ' · ' : ''}${e.span ? esc(e.span) : timeLabel(e.ts)}</span>
      <span class="th-evo-entry-ops">
        <button data-evo-entry-edit="${esc(e.id)}" title="编辑">${iconHtml('fa-pen')}</button>
        <button data-evo-entry-del="${esc(e.id)}" title="删除">${iconHtml('fa-xmark')}</button>
      </span>
    </div>
    <div class="th-evo-entry-summary">${esc(e.summary)}</div>
    ${events}${vc}
  </div>`;
}

function backHead(title: string): string {
  return `<div class="th-evo-subhead"><button class="th-evo-back" data-evo-back type="button">${iconHtml('fa-arrow-left')}</button><span class="th-evo-subtitle">${esc(title)}</span></div>`;
}

// ==================== #3 设置 sheet 内容 ====================
function settingsInnerHtml(): string {
  const cfg = getEvoConfig();
  const presets = (() => { try { return getApiPresetNames(); } catch (e) { void e; return []; } })();
  const presetOpts = ['<option value="">（跟随当前 / 默认）</option>']
    .concat(presets.map(p => `<option value="${esc(p)}" ${cfg.aiPresetName === p ? 'selected' : ''}>${esc(p)}</option>`))
    .join('');
  return `<div class="th-evo-form">
    <div class="th-evo-set-glabel">${iconHtml('fa-plug')} API 设置</div>
    <label class="th-evo-frow th-evo-frow-stack"><span>推演使用的 API 预设</span>
      <select class="th-evo-field th-evo-s-preset">${presetOpts}</select></label>
    <div class="th-evo-set-hint">指定一个已保存的 API 预设来跑推演（与正文用的可以不同）；留空则跟随酒馆当前设置。</div>

    <div class="th-evo-set-glabel">${iconHtml('fa-book-open')} 正文参考</div>
    <label class="th-evo-frow th-evo-frow-stack"><span>推演时附带最近几楼酒馆正文（0=不读）</span>
      <input type="number" min="0" class="th-evo-field th-evo-s-floors" value="${esc(String(cfg.readFloors))}"></label>
    <div class="th-evo-set-hint">让推演衔接当前剧情。0 表示纯凭角色设定与演化记忆推演，不读正文。</div>

    <div class="th-evo-set-glabel">${iconHtml('fa-syringe')} 注入</div>
    <label class="th-evo-frow th-evo-frow-stack"><span>注入正文时附带最近几条演化</span>
      <input type="number" min="1" class="th-evo-field th-evo-s-inject" value="${esc(String(cfg.injectRecent))}"></label>
    <label class="th-evo-frow th-evo-frow-stack"><span>单次联合推演最多角色数</span>
      <input type="number" min="2" class="th-evo-field th-evo-s-batch" value="${esc(String(cfg.maxBatch))}"></label>
    <div class="th-evo-form-actions"><button class="th-evo-primary" data-evo-settings-save type="button">${iconHtml('fa-check')} 保存设置</button></div>
  </div>`;
}

// ==================== #3 世界书条目选择 sheet ====================
let _wbBook = '';                      // 当前选中的世界书名
let _wbEntries: { uid: number; name: string; content: string }[] = [];
function wbPickInnerHtml(): string {
  const books = (() => { try { return listWorldbookNames(); } catch (e) { void e; return []; } })();
  const bookOpts = ['<option value="">选择世界书…</option>']
    .concat(books.map(b => `<option value="${esc(b)}" ${_wbBook === b ? 'selected' : ''}>${esc(b)}</option>`)).join('');
  const entryList = _wbBook
    ? (_wbEntries.length
        ? _wbEntries.map(e => `<button class="th-evo-pick-item" data-evo-wbentry="${e.uid}" type="button">
            <span class="th-evo-pick-name">${esc(e.name)}</span>
            <span class="th-evo-pick-tag">${esc(e.content.slice(0, 24))}…</span></button>`).join('')
        : `<div class="th-evo-empty-sub" style="padding:10px">这本世界书暂无可读条目（或正在加载）。</div>`)
    : `<div class="th-evo-empty-sub" style="padding:10px">先选一本世界书。</div>`;
  return `<div class="th-evo-form">
    <label class="th-evo-frow th-evo-frow-stack"><span>世界书</span>
      <select class="th-evo-field th-evo-wb-book">${bookOpts}</select></label>
    <div class="th-evo-pick">${entryList}</div>
  </div>`;
}

// MARK_SHEET

// ==================== app 内底部 sheet（不堆叠 modal）====================
function sheetHtml(): string {
  if (!_sheet) return '';
  let title = ''; let inner = '';
  if (_sheet.kind === 'pick') {
    title = '添加演化对象';
    const npcs = offlineNpcs();
    const existRefs = new Set(getActors().map(a => `${a.source}:${a.sourceRef || a.name}`));
    const npcList = npcs.length
      ? npcs.map(n => `<button class="th-evo-pick-item${existRefs.has('npc:' + n.name) ? ' th-evo-pick-done' : ''}" data-evo-pick-npc="${esc(n.name)}" data-evo-persona="${esc(n.persona)}" type="button">
          ${avatarChip(n.name)}<span class="th-evo-pick-name">${esc(n.name)}</span>
          <span class="th-evo-pick-tag">离场 NPC${existRefs.has('npc:' + n.name) ? ' · 已添加' : ''}</span></button>`).join('')
      : `<div class="th-evo-empty-sub" style="padding:12px">当前没有离场 NPC（NPC.是否在场=false）。</div>`;
    const contacts = getContacts();
    const ctList = contacts.length
      ? contacts.map(c => `<button class="th-evo-pick-item${existRefs.has('contact:' + c.id) ? ' th-evo-pick-done' : ''}" data-evo-pick-contact="${esc(c.id)}" type="button">
          ${avatarChip(c.name)}<span class="th-evo-pick-name">${esc(c.name)}</span>
          <span class="th-evo-pick-tag">联系人${existRefs.has('contact:' + c.id) ? ' · 已添加' : ''}</span></button>`).join('')
      : `<div class="th-evo-empty-sub" style="padding:12px">还没有联系人。</div>`;
    inner = `<div class="th-evo-pick">
      <div class="th-evo-pick-group"><div class="th-evo-pick-glabel">离场 NPC</div>${npcList}</div>
      <div class="th-evo-pick-group"><div class="th-evo-pick-glabel">联系人</div>${ctList}</div>
      <div class="th-evo-pick-group">
        <div class="th-evo-pick-glabel">世界背景演化线</div>
        <div class="th-evo-pick-dims">
          ${WORLD_DIMENSIONS.map(dm => `<button class="th-evo-chip" data-evo-pick-world="${esc(dm)}" type="button">${iconHtml('fa-globe')} ${esc(dm)}</button>`).join('')}
          <button class="th-evo-chip" data-evo-pick-world="" type="button">${iconHtml('fa-plus')} 自定义维度</button>
        </div>
      </div>
      <div class="th-evo-pick-group">
        <button class="th-evo-chip" data-evo-pick-custom type="button">${iconHtml('fa-user-plus')} 自定义一个角色</button>
      </div>
    </div>`;
  } else if (_sheet.kind === 'coadvance') {
    const sel = getActors().filter(a => _selected.has(a.id));
    title = `联合推演 · ${sel.length} 个对象`;
    inner = `<div class="th-evo-form">
      <div class="th-evo-co-roster">${sel.map(a => `<span class="th-evo-co-chip">${a.source === 'world' ? iconHtml('fa-globe') : avatarChip(a.name)}${esc(a.name)}</span>`).join('')}</div>
      <div class="th-evo-set-hint">这些对象将在同一段时间里各自演化，并可能彼此产生交集——只消耗一次 API 调用。</div>
      <label class="th-evo-frow th-evo-frow-stack">
        <span>时间跨度</span>
        <input type="text" class="th-evo-field th-evo-f-span" value="约半天" placeholder="如：约半天 / 三天 / 一个月">
      </label>
      <label class="th-evo-frow th-evo-frow-stack">
        <span>世界时间锚点（可选）</span>
        <input type="text" class="th-evo-field th-evo-f-worldtime" value="${esc(worldTimeLabel())}" placeholder="如：第三日 黄昏">
      </label>
      <label class="th-evo-frow th-evo-frow-stack">
        <span>总体方向提示（可选，作用于全体）</span>
        <textarea class="th-evo-field th-evo-f-dir" rows="2" placeholder="如：城里出了件大事，让他们各自被卷入…"></textarea>
      </label>
      <div class="th-evo-form-actions">
        <button class="th-evo-primary" data-evo-coadvance-run type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-forward')} 开始联合推演</button>
      </div>
    </div>`;
  } else if (_sheet.kind === 'charConfig') {
    const a = getActor(_sheet.actorId);
    title = (a?.source === 'world' ? '线程配置 · ' : '角色配置 · ') + (a?.name || '');
    const isWorld = a?.source === 'world';
    const wbList = _ceWb.length
      ? _ceWb.map((r, i) => `<span class="th-evo-wbref">${iconHtml('fa-book')} ${esc(r.name)}<button class="th-evo-wbref-x" data-evo-wbref-del="${i}" type="button">${iconHtml('fa-xmark')}</button></span>`).join('')
      : `<span class="th-evo-empty-sub">未关联任何世界书条目</span>`;
    inner = `<div class="th-evo-form">
      <label class="th-evo-frow th-evo-frow-stack"><span>名称</span>
        <input type="text" class="th-evo-field th-evo-c-name" value="${esc(a?.name || '')}"></label>
      ${isWorld ? `<label class="th-evo-frow th-evo-frow-stack"><span>演化维度（如：势力动向 / 民生经济）</span>
        <input type="text" class="th-evo-field th-evo-c-dim" value="${esc(a?.dimension || '')}"></label>` : ''}
      <label class="th-evo-frow th-evo-frow-stack"><span>${isWorld ? '世界观背景设定' : '角色设定'}</span>
        <textarea class="th-evo-field th-evo-c-persona" rows="4" placeholder="${isWorld ? '这条世界线的背景、格局、已知态势…' : '这个角色的身份、性格、处境…'}">${esc(a?.persona || '')}</textarea></label>
      <div class="th-evo-frow th-evo-frow-stack">
        <span>专属世界书条目（推演时附加进设定）</span>
        <div class="th-evo-wbrefs">${wbList}</div>
        <button class="th-evo-chip" data-evo-wb-add type="button" ${isWorldbookAvailable() ? '' : 'disabled'}>${iconHtml('fa-plus')} ${isWorldbookAvailable() ? '从世界书添加' : '当前环境无世界书接口'}</button>
      </div>
      <label class="th-evo-frow th-evo-frow-stack"><span>额外设定/约束（可选）</span>
        <textarea class="th-evo-field th-evo-c-note" rows="2" placeholder="如：固定口癖 / 不可发生的事 / 当前隐藏目标…">${esc(a?.extraNote || '')}</textarea></label>
      <div class="th-evo-form-actions"><button class="th-evo-primary" data-evo-charcfg-save type="button">${iconHtml('fa-check')} 保存配置</button></div>
    </div>`;
  } else if (_sheet.kind === 'wbPick') {
    title = '选世界书条目';
    inner = wbPickInnerHtml();
  } else if (_sheet.kind === 'settings') {
    title = '世界演化设置';
    inner = settingsInnerHtml();
  } else if (_sheet.kind === 'streaming') {
    title = '推演中…';
    inner = `<div class="th-evo-streaming">
      <div class="th-evo-stream-spin">${iconHtml('fa-spinner')} 正在推演，AI 生成的内容会实时显示在下方</div>
      <pre class="th-evo-stream-text" data-evo-stream>${esc(_stream || '……')}</pre>
    </div>`;
  } else if (_sheet.kind === 'advance') {
    const a = getActor(_sheet.actorId);
    title = '推进演化 · ' + (a?.name || '');
    inner = `<div class="th-evo-form">
      <label class="th-evo-frow th-evo-frow-stack">
        <span>时间跨度（这段不在场过了多久）</span>
        <input type="text" class="th-evo-field th-evo-f-span" value="约半天" placeholder="如：约半天 / 三天 / 一个月">
      </label>
      <label class="th-evo-frow th-evo-frow-stack">
        <span>世界时间锚点（可选，留空自动读世界信息）</span>
        <input type="text" class="th-evo-field th-evo-f-worldtime" value="${esc(worldTimeLabel())}" placeholder="如：第三日 黄昏">
      </label>
      <label class="th-evo-frow th-evo-frow-stack">
        <span>方向提示（可选，给个走向/侧重）</span>
        <textarea class="th-evo-field th-evo-f-dir" rows="2" placeholder="如：让她在这段时间里筹备一件事 / 遇到旧识 / 心境转变…"></textarea>
      </label>
      <div class="th-evo-form-actions">
        <button class="th-evo-primary" data-evo-advance-run type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-forward')} 开始推演</button>
      </div>
    </div>`;
  } else if (_sheet.kind === 'varReview') {
    const eid = _sheet.entryId;
    const a = getActor(_sheet.actorId);
    const entry = a?.timeline.find(x => x.id === eid);
    title = '变量回写确认';
    const list = (entry?.varChanges || []).map((v, i) => `
      <label class="th-evo-varrow">
        <input type="checkbox" class="th-evo-varck" data-evo-var-idx="${i}" checked>
        <span class="th-evo-var-path">${esc(v.path)}</span>
        <span class="th-evo-var-arrow">→</span>
        <input type="text" class="th-evo-field th-evo-varval" data-evo-var-idx="${i}" value="${esc(v.value)}">
      </label>`).join('');
    inner = `<div class="th-evo-varreview">
      <div class="th-evo-warn">${iconHtml('fa-triangle-exclamation')} 这会改写酒馆变量，操作不可自动撤销。仅勾选你确认无误的项。</div>
      ${list || '<div class="th-evo-empty-sub">没有可应用的变量变化。</div>'}
      ${entry?.varChanges?.length ? `<div class="th-evo-form-actions"><button class="th-evo-primary" data-evo-var-apply type="button">${iconHtml('fa-check')} 应用所选</button></div>` : ''}
    </div>`;
  } else if (_sheet.kind === 'entryEdit') {
    const a = getActor(_sheet.actorId);
    const entry = a?.timeline.find(x => x.id === (_sheet as any).entryId);
    title = '编辑这段演化';
    inner = `<div class="th-evo-form">
      <label class="th-evo-frow th-evo-frow-stack"><span>世界时间</span>
        <input type="text" class="th-evo-field th-evo-e-worldtime" value="${esc(entry?.worldTime || '')}"></label>
      <label class="th-evo-frow th-evo-frow-stack"><span>摘要</span>
        <textarea class="th-evo-field th-evo-e-summary" rows="5">${esc(entry?.summary || '')}</textarea></label>
      <label class="th-evo-frow th-evo-frow-stack"><span>关键事件（每行一条）</span>
        <textarea class="th-evo-field th-evo-e-events" rows="3">${esc((entry?.events || []).join('\n'))}</textarea></label>
      <div class="th-evo-form-actions"><button class="th-evo-primary" data-evo-entry-save type="button">${iconHtml('fa-check')} 保存</button></div>
    </div>`;
  } else if (_sheet.kind === 'prompt') {
    const tpls = listPromptTemplates('evolution');
    const cur = tpls.find(t => t.id === (_sheet as any).id) || tpls[0];
    title = '提示词 · ' + (cur?.name || '');
    const tabs = tpls.map(t => `<button class="th-evo-ptab${t.id === cur?.id ? ' th-evo-ptab-on' : ''}" data-evo-prompt-tab="${esc(t.id)}" type="button">${esc(t.name)}${isPromptOverridden(t.id) ? ' ·改' : ''}</button>`).join('');
    const varsHtml = (cur?.vars || []).map(v => `<code>{{${esc(v.key)}}}</code> ${esc(v.desc)}`).join('　');
    inner = `<div class="th-evo-form">
      <div class="th-evo-ptabs">${tabs}</div>
      ${cur?.desc ? `<div class="th-evo-set-hint">${esc(cur.desc)}</div>` : ''}
      ${varsHtml ? `<div class="th-evo-prompt-vars">可用占位符：${varsHtml}</div>` : ''}
      <textarea class="th-evo-field th-evo-prompt-text" rows="11">${esc(getPromptText(cur?.id || ''))}</textarea>
      <div class="th-evo-form-actions">
        <button class="th-evo-chip" data-evo-prompt-reset type="button">${iconHtml('fa-rotate-left')} 恢复默认</button>
        <button class="th-evo-primary" data-evo-prompt-save type="button">${iconHtml('fa-check')} 保存</button>
      </div>
    </div>`;
  }
  return `<div class="th-evo-sheet-mask" data-evo-sheet-close>
    <div class="th-evo-sheet" role="dialog">
      <div class="th-evo-sheet-head"><span>${esc(title)}</span>
        <button class="th-evo-sheet-x" data-evo-sheet-close type="button">${iconHtml('fa-xmark')}</button></div>
      <div class="th-evo-sheet-body">${inner}</div>
    </div>
  </div>`;
}

// MARK_PROMPTS_LIST

// 提示词列表 sheet（从「提示词」按钮进；进第一个模板，sheet 内 tab 可切换三套）
function openPromptsList(): void {
  const tpls = listPromptTemplates('evolution');
  if (tpls.length) openSheet({ kind: 'prompt', id: tpls[0].id });
}

// MARK_EVT

// ==================== 事件绑定（一次性委托）====================
function bindRoot(): void {
  const root = rootEl();
  if (!root || (root as any)._evoBound) return;
  (root as any)._evoBound = true;
  root.addEventListener('click', (e: Event) => { void onClick(e); });
  root.addEventListener('change', (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-evo-inject]') && _view.name === 'detail' && _view.actorId) {
      const on = (t as HTMLInputElement).checked;
      setActorInject(_view.actorId, on);
      syncInject(_view.actorId, on);
      toast('info', on ? '已开启：演化将注入正文' : '已关闭演化注入');
      return;
    }
    // #4 列表多选 checkbox
    const sel = t.closest('[data-evo-sel]') as HTMLInputElement | null;
    if (sel) {
      const id = sel.getAttribute('data-evo-sel') || '';
      if (sel.checked) _selected.add(id); else _selected.delete(id);
      render();
      return;
    }
    // #3 世界书选择：切换世界书 → 异步拉条目
    const wbBook = t.closest('.th-evo-wb-book') as HTMLSelectElement | null;
    if (wbBook && _sheet?.kind === 'wbPick') {
      _wbBook = wbBook.value; _wbEntries = [];
      render();
      if (_wbBook) {
        listWorldbookEntries(_wbBook).then(list => { _wbEntries = list; if (_sheet?.kind === 'wbPick') render(); }).catch(() => { /* 降级空 */ });
      }
      return;
    }
  });
}

async function onClick(e: Event): Promise<void> {
  const t = e.target as HTMLElement;
  // sheet 关闭
  if (t.closest('[data-evo-sheet-close]')) {
    const onMask = (t as HTMLElement).classList?.contains('th-evo-sheet-mask');
    const onX = !!t.closest('.th-evo-sheet-x');
    if (onMask || onX) { closeSheet(); return; }
  }
  if (t.closest('[data-evo-back]')) { go({ name: 'list' }); return; }
  if (t.closest('[data-evo-prompts]')) { openPromptsList(); return; }
  if (t.closest('[data-evo-settings]')) { openSheet({ kind: 'settings' }); return; }
  if (t.closest('[data-evo-pick]')) { openSheet({ kind: 'pick' }); return; }
  if (t.closest('[data-evo-selclear]')) { _selected.clear(); render(); return; }
  if (t.closest('[data-evo-coadvance]')) { if (_selected.size >= 2) { openSheet({ kind: 'coadvance' }); } else { toast('warning', '至少选 2 个对象再联合推演'); } return; }

  const openBtn = t.closest('[data-evo-open]') as HTMLElement | null;
  if (openBtn) { go({ name: 'detail', actorId: openBtn.getAttribute('data-evo-open') || '' }); return; }

  if (await onSheetClick(t)) return;
  if (onDetailClick(t)) return;
}

// 详情视图点击
function onDetailClick(t: HTMLElement): boolean {
  if (_view.name !== 'detail' || !_view.actorId) return false;
  const aid = _view.actorId;
  if (t.closest('[data-evo-advance]')) { openSheet({ kind: 'advance', actorId: aid }); return true; }
  if (t.closest('[data-evo-charcfg]')) { const a = getActor(aid); _ceWb = (a?.worldbookRefs || []).slice(); openSheet({ kind: 'charConfig', actorId: aid }); return true; }
  if (t.closest('[data-evo-actor-del]')) {
    if (confirmBox('删除这个演化对象及其全部时间线？')) { uninjectWorld('th_world_evo_' + aid); deleteActor(aid); go({ name: 'list' }); }
    return true;
  }
  const vr = t.closest('[data-evo-varreview]') as HTMLElement | null;
  if (vr) { openSheet({ kind: 'varReview', actorId: aid, entryId: vr.getAttribute('data-evo-varreview') || '' }); return true; }
  const ee = t.closest('[data-evo-entry-edit]') as HTMLElement | null;
  if (ee) { openSheet({ kind: 'entryEdit', actorId: aid, entryId: ee.getAttribute('data-evo-entry-edit') || '' }); return true; }
  const ed = t.closest('[data-evo-entry-del]') as HTMLElement | null;
  if (ed) { if (confirmBox('删除这段演化？')) { deleteEntry(aid, ed.getAttribute('data-evo-entry-del') || ''); refreshInject(aid); render(); } return true; }
  return false;
}

// MARK_EVT_SHEET

function fieldVal(sel: string): string {
  const el = rootEl()?.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null;
  return el ? el.value.trim() : '';
}

// sheet 点击。返回 true=已处理。
async function onSheetClick(t: HTMLElement): Promise<boolean> {
  if (!_sheet) return false;
  // ---- 选对象 ----
  if (_sheet.kind === 'pick') {
    const npc = t.closest('[data-evo-pick-npc]') as HTMLElement | null;
    if (npc) {
      const name = npc.getAttribute('data-evo-pick-npc') || '';
      const persona = npc.getAttribute('data-evo-persona') || '';
      const a = ensureActor({ source: 'npc', sourceRef: name, name, persona });
      go({ name: 'detail', actorId: a.id }); return true;
    }
    const ct = t.closest('[data-evo-pick-contact]') as HTMLElement | null;
    if (ct) {
      const id = ct.getAttribute('data-evo-pick-contact') || '';
      const c = getContacts().find(x => x.id === id);
      if (c) { const a = ensureActor({ source: 'contact', sourceRef: c.id, name: c.name, persona: c.persona }); go({ name: 'detail', actorId: a.id }); }
      return true;
    }
    if (t.closest('[data-evo-pick-custom]')) {
      const name = ask('对象名称：'); if (name == null || !name.trim()) return true;
      const persona = ask('角色设定（可空）：', '') || '';
      const a = ensureActor({ source: 'custom', name: name.trim(), persona: persona.trim() });
      go({ name: 'detail', actorId: a.id }); return true;
    }
    // #5 世界背景演化线
    const wbtn = t.closest('[data-evo-pick-world]') as HTMLElement | null;
    if (wbtn) {
      let dim = wbtn.getAttribute('data-evo-pick-world') || '';
      if (!dim) { const v = ask('自定义世界演化维度（如：宫廷权斗 / 灵气复苏）：'); if (v == null || !v.trim()) return true; dim = v.trim(); }
      const a = ensureActor({ source: 'world', name: '世界·' + dim, dimension: dim });
      go({ name: 'detail', actorId: a.id }); return true;
    }
    return true;
  }
  // ---- 推进演化 ----
  if (_sheet.kind === 'advance') {
    if (t.closest('[data-evo-advance-run]')) {
      const aid = _sheet.actorId;
      const span = fieldVal('.th-evo-f-span') || '一段时间';
      const worldTime = fieldVal('.th-evo-f-worldtime') || worldTimeLabel();
      const dir = fieldVal('.th-evo-f-dir');
      await runAdvance(aid, { span, worldTime, direction: dir });
      return true;
    }
    return true;
  }
  // ---- 联合推演（#4 多选一次 API）----
  if (_sheet.kind === 'coadvance') {
    if (t.closest('[data-evo-coadvance-run]')) {
      const span = fieldVal('.th-evo-f-span') || '一段时间';
      const worldTime = fieldVal('.th-evo-f-worldtime') || worldTimeLabel();
      const dir = fieldVal('.th-evo-f-dir');
      await runCoAdvance({ span, worldTime, direction: dir });
      return true;
    }
    return true;
  }
  // ---- 角色/线程配置（#3）----
  if (_sheet.kind === 'charConfig') {
    const aid = _sheet.actorId;
    if (t.closest('[data-evo-wb-add]')) { _wbBook = ''; _wbEntries = []; openSheet({ kind: 'wbPick', actorId: aid }); return true; }
    const wbDel = t.closest('[data-evo-wbref-del]') as HTMLElement | null;
    if (wbDel) { _ceWb.splice(Number(wbDel.getAttribute('data-evo-wbref-del')), 1); render(); return true; }
    if (t.closest('[data-evo-charcfg-save]')) {
      const name = fieldVal('.th-evo-c-name');
      const persona = (rootEl()?.querySelector('.th-evo-c-persona') as HTMLTextAreaElement | null)?.value.trim() || '';
      const note = (rootEl()?.querySelector('.th-evo-c-note') as HTMLTextAreaElement | null)?.value.trim() || '';
      const dim = fieldVal('.th-evo-c-dim');
      updateActorConfig(aid, { name: name || undefined, persona, extraNote: note, worldbookRefs: _ceWb.slice(), dimension: dim || undefined });
      toast('success', '已保存配置'); closeSheet(); return true;
    }
    return true;
  }
  // ---- 世界书条目选择（#3）----
  if (_sheet.kind === 'wbPick') {
    const ent = t.closest('[data-evo-wbentry]') as HTMLElement | null;
    if (ent) {
      const uid = Number(ent.getAttribute('data-evo-wbentry'));
      const e = _wbEntries.find(x => x.uid === uid);
      if (e && !_ceWb.some(r => r.book === _wbBook && r.uid === uid)) _ceWb.push({ book: _wbBook, uid, name: e.name });
      openSheet({ kind: 'charConfig', actorId: _sheet.actorId }); // 回到配置（_ceWb 已更新）
      return true;
    }
    return true;
  }
  // ---- 设置（#3）----
  if (_sheet.kind === 'settings') {
    if (t.closest('[data-evo-settings-save]')) {
      const root = rootEl();
      const preset = (root?.querySelector('.th-evo-s-preset') as HTMLSelectElement | null)?.value || '';
      const numOf = (sel: string, def: number, min: number): number => {
        const v = Number((root?.querySelector(sel) as HTMLInputElement | null)?.value);
        return Number.isFinite(v) && v >= min ? Math.floor(v) : def;
      };
      const cur = getEvoConfig();
      saveEvoConfig({
        aiPresetName: preset,
        readFloors: numOf('.th-evo-s-floors', cur.readFloors, 0),
        injectRecent: numOf('.th-evo-s-inject', cur.injectRecent, 1),
        maxBatch: numOf('.th-evo-s-batch', cur.maxBatch, 2),
      });
      toast('success', '已保存设置'); closeSheet(); return true;
    }
    return true;
  }
  // ---- 变量回写 ----
  if (_sheet.kind === 'varReview') {
    if (t.closest('[data-evo-var-apply]')) { applyVarChanges(_sheet.actorId, _sheet.entryId); return true; }
    return true;
  }
  // ---- 编辑条目 ----
  if (_sheet.kind === 'entryEdit') {
    if (t.closest('[data-evo-entry-save]')) {
      const aid = _sheet.actorId; const eid = _sheet.entryId;
      const summary = fieldVal('.th-evo-e-summary');
      const worldTime = fieldVal('.th-evo-e-worldtime');
      const events = (rootEl()?.querySelector('.th-evo-e-events') as HTMLTextAreaElement | null)?.value
        .split('\n').map(s => s.trim()).filter(Boolean) || [];
      updateEntry(aid, eid, { summary, worldTime, events });
      refreshInject(aid);
      toast('success', '已保存'); closeSheet(); return true;
    }
    return true;
  }
  // ---- 提示词编辑 ----
  if (_sheet.kind === 'prompt') {
    const id = _sheet.id;
    const tab = t.closest('[data-evo-prompt-tab]') as HTMLElement | null;
    if (tab) { openSheet({ kind: 'prompt', id: tab.getAttribute('data-evo-prompt-tab') || id }); return true; }
    if (t.closest('[data-evo-prompt-save]')) {
      const txt = (rootEl()?.querySelector('.th-evo-prompt-text') as HTMLTextAreaElement | null)?.value ?? '';
      setPromptOverride(id, txt);
      toast('success', '已保存提示词'); closeSheet(); return true;
    }
    if (t.closest('[data-evo-prompt-reset]')) {
      resetPrompt(id);
      toast('success', '已恢复默认'); render(); return true;
    }
    return true;
  }
  return false;
}

// MARK_AI

// ==================== 推进演化（AI 一发）====================
async function runAdvance(actorId: string, opts: { span: string; worldTime: string; direction: string }): Promise<void> {
  if (_busy) { toast('warning', '正在推演，请稍候'); return; }
  const a = getActor(actorId); if (!a) return;
  const sid = evoSessionId(actorId);
  ensureSession({ id: sid, appId: 'evolution', appName: '世界演化', title: a.name });
  const cfg = getEvoConfig();

  _busy = true; _stream = ''; openSheet({ kind: 'streaming' }); // 显示流式预览 sheet
  try {
    const mem = buildMemoryContext(sid);
    const isWorld = a.source === 'world';
    const dirBlock = opts.direction ? `【方向提示】玩家希望这段演化朝这个方向走：${opts.direction}\n` : '';
    const tplId = isWorld ? 'evolution.world' : 'evolution.advance';
    let instruction = getPromptText(tplId)
      .replace(/\{\{\s*name\s*\}\}/g, a.name)
      .replace(/\{\{\s*dimension\s*\}\}/g, a.dimension || a.name)
      .replace(/\{\{\s*span\s*\}\}/g, opts.span)
      .replace(/\{\{\s*worldTime\s*\}\}/g, opts.worldTime || '未知')
      .replace(/\{\{\s*direction\s*\}\}/g, opts.direction || '（无）')
      .replace(/\{\{\s*directionBlock\s*\}\}/g, dirBlock)
      .replace(/\{\{\s*backdropBlock\s*\}\}/g, a.persona ? `【世界观背景】${a.persona}\n` : '')
      .replace(/\{\{\s*backdrop\s*\}\}/g, a.persona || '');

    const settingText = await buildActorSetting(a);
    const floors = cfg.readFloors > 0 ? readTavernFloors(cfg.readFloors) : '';
    const systemParts = [settingText, instruction];
    if (mem.memoryText) systemParts.push('【既有的演化记忆，请保持连贯】\n' + mem.memoryText);
    if (floors) systemParts.push('【当前剧情正文（参考，勿复述）】\n' + floors);
    const system = systemParts.filter(Boolean).join('\n\n');
    const history = mem.recentTurns.map(t => `${t.role === 'user' ? '推进' : '经历'}：${t.content}`).join('\n');
    const user = (history ? '此前演化：\n' + history + '\n\n' : '') + `请推演 ${a.name} 在这段「${opts.span}」里${isWorld ? '于该维度上的变化' : '独自经历了什么'}。`;

    const off = onStreamToken(pushStream);
    let raw = '';
    try { raw = await chatGenerate({ system, user, jsonSchema: ENTRY_SCHEMA, aiPresetName: cfg.aiPresetName || undefined, shouldStream: true }); }
    finally { off(); }
    const obj = parseLooseJson(raw) || {};
    const summary = String(obj.summary || raw || '').trim();
    if (!summary) { toast('error', '推演没有返回有效内容'); return; }
    const events = parseEvents(obj);
    const varChanges = parseVarChanges(obj);

    addEntry(actorId, { summary, events, varChanges, worldTime: opts.worldTime, span: opts.span });
    appendTurn(sid, 'user', `推进演化（${opts.span}${opts.direction ? '，方向：' + opts.direction : ''}）`);
    const after = appendTurn(sid, 'assistant', summary + (events.length ? '\n关键事件：' + events.join('；') : ''));
    if (after.reachedThreshold) { try { await runShortSummary(sid, makeSummarizer(cfg.aiPresetName || undefined)); } catch (e) { void e; } }
    refreshInject(actorId);
    toast('success', `${a.name} 的演化已生成`);
    closeSheet();
  } catch (err) {
    toast('error', '推演失败：' + (err instanceof Error ? err.message : String(err)));
    closeSheet();
  } finally {
    _busy = false; render();
  }
}

// 演化产出的统一 json_schema
const ENTRY_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    events: { type: 'array', items: { type: 'string' } },
    变量变化: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, value: { type: 'string' } }, required: ['path', 'value'] } },
  },
  required: ['summary'],
};
function parseEvents(obj: any): string[] {
  return Array.isArray(obj?.events) ? obj.events.map((x: any) => String(x).trim()).filter(Boolean) : [];
}
function parseVarChanges(obj: any): EvoVarChange[] {
  return Array.isArray(obj?.['变量变化'])
    ? obj['变量变化'].map((v: any) => ({ path: String(v?.path || '').trim(), value: String(v?.value ?? '').trim() })).filter((v: EvoVarChange) => v.path)
    : [];
}
// #3 拼一个对象的完整设定文本（人设 + 专属世界书条目 + 额外设定）。世界书条目异步取内容。
async function buildActorSetting(a: { name: string; persona?: string; worldbookRefs?: EvoWbRef[]; extraNote?: string; source?: string }): Promise<string> {
  const parts: string[] = [];
  parts.push(a.persona ? `【${a.source === 'world' ? '世界观背景' : '角色设定'}】${a.name}：${a.persona}` : `${a.source === 'world' ? '世界线' : '角色'}：${a.name}`);
  if (a.worldbookRefs?.length) {
    for (const ref of a.worldbookRefs) {
      try {
        const list = await listWorldbookEntries(ref.book);
        const hit = list.find(x => x.uid === ref.uid);
        if (hit?.content) parts.push(`【专属设定·${ref.name}】\n${hit.content}`);
      } catch (e) { void e; }
    }
  }
  if (a.extraNote) parts.push(`【额外设定/约束】${a.extraNote}`);
  return parts.join('\n\n');
}

// ==================== #4 联合推演（多对象，一次 API 调用）====================
async function runCoAdvance(opts: { span: string; worldTime: string; direction: string }): Promise<void> {
  if (_busy) { toast('warning', '正在推演，请稍候'); return; }
  const cfg = getEvoConfig();
  let actors = getActors().filter(a => _selected.has(a.id));
  if (actors.length < 2) { toast('warning', '至少选 2 个对象'); return; }
  if (actors.length > cfg.maxBatch) { actors = actors.slice(0, cfg.maxBatch); toast('info', `单次最多 ${cfg.maxBatch} 个，已取前 ${cfg.maxBatch} 个`); }

  _busy = true; _stream = ''; openSheet({ kind: 'streaming' });
  try {
    // 为每位角色拼设定 + 既有记忆，组成 roster
    const rosterParts: string[] = [];
    for (const a of actors) {
      const sid = evoSessionId(a.id);
      ensureSession({ id: sid, appId: 'evolution', appName: '世界演化', title: a.name });
      const setting = await buildActorSetting(a);
      const mem = buildMemoryContext(sid);
      rosterParts.push(`▼ ${a.name}\n${setting}${mem.memoryText ? '\n【既往演化记忆】' + mem.memoryText : ''}`);
    }
    const names = actors.map(a => a.name);
    const dirBlock = opts.direction ? `【总体方向提示】${opts.direction}\n` : '';
    const instruction = getPromptText('evolution.coadvance')
      .replace(/\{\{\s*roster\s*\}\}/g, rosterParts.join('\n\n'))
      .replace(/\{\{\s*names\s*\}\}/g, names.join('、'))
      .replace(/\{\{\s*span\s*\}\}/g, opts.span)
      .replace(/\{\{\s*worldTime\s*\}\}/g, opts.worldTime || '未知')
      .replace(/\{\{\s*direction\s*\}\}/g, opts.direction || '（无）')
      .replace(/\{\{\s*directionBlock\s*\}\}/g, dirBlock);
    const floors = cfg.readFloors > 0 ? readTavernFloors(cfg.readFloors) : '';
    const system = [instruction, floors ? '【当前剧情正文（参考，勿复述）】\n' + floors : ''].filter(Boolean).join('\n\n');
    const user = `请为这 ${actors.length} 位（${names.join('、')}）各自推演在「${opts.span}」里的经历，注意他们之间可能产生的交集。`;

    const schema = {
      type: 'object',
      properties: {
        actors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              summary: { type: 'string' },
              events: { type: 'array', items: { type: 'string' } },
              变量变化: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, value: { type: 'string' } }, required: ['path', 'value'] } },
            },
            required: ['name', 'summary'],
          },
        },
      },
      required: ['actors'],
    };
    const off = onStreamToken(pushStream);
    let raw = '';
    try { raw = await chatGenerate({ system, user, jsonSchema: schema, aiPresetName: cfg.aiPresetName || undefined, shouldStream: true }); }
    finally { off(); }
    const obj = parseLooseJson(raw) || {};
    const results: any[] = Array.isArray(obj.actors) ? obj.actors : (Array.isArray(obj) ? obj : []);
    if (!results.length) { toast('error', '联合推演没有返回有效内容'); return; }

    const batchId = 'b_' + Date.now().toString(36);
    let ok = 0;
    for (const a of actors) {
      const r = results.find(x => String(x?.name || '').trim() === a.name) || (results.length === actors.length ? results[actors.indexOf(a)] : null);
      const summary = String(r?.summary || '').trim();
      if (!summary) continue;
      const events = parseEvents(r);
      const varChanges = parseVarChanges(r);
      addEntry(a.id, { summary, events, varChanges, worldTime: opts.worldTime, span: opts.span, batchId });
      const sid = evoSessionId(a.id);
      appendTurn(sid, 'user', `联合推演（${opts.span}${opts.direction ? '，方向：' + opts.direction : ''}）`);
      const after = appendTurn(sid, 'assistant', summary + (events.length ? '\n关键事件：' + events.join('；') : ''));
      if (after.reachedThreshold) { try { await runShortSummary(sid, makeSummarizer(cfg.aiPresetName || undefined)); } catch (e) { void e; } }
      refreshInject(a.id);
      ok++;
    }
    toast('success', `联合推演完成：${ok}/${actors.length} 个对象已更新`);
    _selected.clear();
    closeSheet();
  } catch (err) {
    toast('error', '联合推演失败：' + (err instanceof Error ? err.message : String(err)));
    closeSheet();
  } finally {
    _busy = false; render();
  }
}

// ==================== 变量回写（二次确认后写）====================
function applyVarChanges(actorId: string, entryId: string): void {
  const a = getActor(actorId); if (!a) return;
  const entry = a.timeline.find(x => x.id === entryId); if (!entry || !entry.varChanges?.length) return;
  const root = rootEl(); if (!root) return;
  // 收集勾选项 + 当前输入框值
  const picks: EvoVarChange[] = [];
  entry.varChanges.forEach((v, i) => {
    const ck = root.querySelector(`.th-evo-varck[data-evo-var-idx="${i}"]`) as HTMLInputElement | null;
    const val = root.querySelector(`.th-evo-varval[data-evo-var-idx="${i}"]`) as HTMLInputElement | null;
    if (ck?.checked) picks.push({ path: v.path, value: (val?.value ?? v.value).trim() });
  });
  if (!picks.length) { toast('warning', '没有勾选任何变量'); return; }
  if (!confirmBox(`确认把 ${picks.length} 项变量写入酒馆？此操作不可自动撤销。`)) return;
  try {
    safeUpdateVariablesWith((vars: Record<string, any>) => {
      for (const p of picks) setByPath(vars, p.path, coerce(p.value));
      return vars;
    }, { type: 'message' });
    toast('success', `已写入 ${picks.length} 项变量`);
    closeSheet();
  } catch (e) {
    toast('error', '写入失败：' + (e instanceof Error ? e.message : String(e)));
  }
}

// 把字符串值尝试转成更合适的类型（数字/布尔/原样）
function coerce(v: string): any {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}
// 按点路径写入对象（不依赖 lodash，简单实现）
function setByPath(obj: Record<string, any>, path: string, value: any): void {
  const keys = path.split('.').map(s => s.trim()).filter(Boolean);
  if (!keys.length) return;
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (typeof cur[k] !== 'object' || cur[k] == null) cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}
void safeGetVariables; // 预留：未来读取现值做 diff 展示

// ==================== 注入正文（持久，可控开关）====================
function injectId(actorId: string): string { return 'th_world_evo_' + actorId; }
// 开关切换时：on→重建注入；off→撤销
function syncInject(actorId: string, on: boolean): void {
  if (on) refreshInject(actorId);
  else uninjectWorld(injectId(actorId));
}
// 内容变化（新增/编辑/删除条目）后，若该对象注入开着，用最新文本重建注入
function refreshInject(actorId: string): void {
  const a = getActor(actorId); if (!a) return;
  if (!a.injectEnabled) return;
  const text = buildInjectText(actorId, getEvoConfig().injectRecent);
  if (text) injectWorldPersistent(injectId(actorId), text);
  else uninjectWorld(injectId(actorId));
}

// 启动时把所有「注入开启」的对象重新注入一次（脚本重载/换聊天后恢复）
function reviveAllInjects(): void {
  try { for (const a of getActors()) { if (a.injectEnabled) refreshInject(a.id); } } catch (e) { void e; }
}

// MARK_REGISTER

// ==================== 公开入口 + 注册 ====================
function openApp(): void {
  openModal2(`${iconHtml('fa-seedling')} 世界演化`, `<div id="${RID}" class="th-evo"></div>`, {
    maxWidth: EVO_MODAL_MAXW, reset: true, revive: openApp,
  });
  bindRoot();
  render();
}

export function openEvolution(): void {
  _view = { name: 'list' }; _sheet = null; _selected = new Set<string>();
  openApp();
}

registerWorldApp({
  id: 'evolution', name: '世界演化', icon: 'fa-seedling',
  accent: 'linear-gradient(135deg,#0ea5e9,#6366f1)', order: 20, open: openEvolution,
});

// 模块加载即恢复已开启的持久注入（脚本重载后不丢）
reviveAllInjects();

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_evolution__ = { openEvolution };
} catch (e) { void e; }








