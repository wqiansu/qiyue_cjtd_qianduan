// ============================================================================
// world-state-ui.ts — 结构化「世界态」子视图（演化双模式之「世界态」tab）
//
// 由 evolution.ts 以「双模式」方式宿主：evolution 在 _mode==='wstate' 时把内层 HTML 全权交给
// 本模块（wstateInnerHtml），点击/change 先交本模块处理（wstateClick/wstateChange，返回 true 即已处理）。
// 本模块维护自己的 sheet 状态，处理后由 evolution 统一 render()。
//
// 提示词/存储见 world-state-prompts.ts / world-state-store.ts。基调=霜月仙宫日常喜剧，
// 设定靠绑定世界书供给。地点演化复用 100+ 地点世界书条目。
// ============================================================================
import { esc } from '../../lib/dom-utils';
import { iconHtml } from '../../lib/icons';
import { thToast, thConfirm, thPrompt } from '../../lib/world/ui-kit';
import { getWorldApiPresetNames as getApiPresetNames } from '../../lib/world/world-api';
import { chatGenerate, readTavernFloors, parseLooseJson, injectWorldPersistent, uninjectWorld } from '../../lib/world/ai-chat';
import { getPromptText } from '../../lib/world/world-prompts';
import { isWorldbookAvailable, buildInjectFromKeys, parseWbEntryKey } from '../../lib/world/worldbook';
import { wbPickerHtml, bindWbPicker } from '../../lib/world/wb-picker';
import { buildWorldStateSummary } from '../../lib/world/world-state-prompts';
import { QUALITY_EVOLUTION } from '../../lib/world/prompt-kit';
import { registerInjectPlan } from '../../lib/world/inject-plan';
import { registerAutoAgent, shouldAutoTrigger } from '../../lib/world/auto-registry';
import { formatWorldClock } from '../../lib/world/world-clock';
import { getChronicle, addChronicle, getActors as getEvoActors } from '../../lib/world/evolution-store';
import {
  getWorldState, saveWorldState, resetWorldState, mergeWorldUpdate,
  getWStateConfig, saveWStateConfig,
  seedPalaceEntities,
  deleteWsItem, editWsItem, deleteSubRankEntry, deleteSubRank, editWsScalar,
  THREAD_STAGES, RIVALRY_STAGES,
} from '../../lib/world/world-state-store';

const WS_INJECT_ID = 'th_world_wstate';

// 本模块自有 sheet 状态（地点已拆出，此处仅留推演流式）
type WSheet =
  | { kind: 'streaming' }
  | null;
let _wsheet: WSheet = null;
let _wbusy = false;
let _wsPickSel: string[] = [];          // 设置里锚点复选器选中条目 key
// 设置内联锚点复选器的展开态 + 仪表盘分区筛选
let _wsAnchorOpen = false;
let _wsSection = 'all';                  // 仪表盘分区筛选
let _dimCfgOpen = false;                 // 维度显示/隐藏配置面板展开态

// evolution 注入的重渲染回调（避免循环依赖）
let _requestRender: () => void = () => {};
export function wstateSetRender(fn: () => void): void { _requestRender = fn; }

function wsJailbreak(): string { return (getPromptText('wstate.jailbreak') || '').trim(); }

// 互喂：拼一段「角色线最近动态 + 近期编年史」，供世界态推演对齐（消除世界态与角色线的孤岛/矛盾）。
function buildEvoContextForWState(): string {
  try {
    const lines: string[] = [];
    const actors = (getEvoActors() || []).filter((a: any) => a && a.name && a.source !== 'world');
    // 每条具体角色线取最新一条 summary（最多 8 位，避免撑爆）
    const recent = actors
      .map((a: any) => {
        const last = Array.isArray(a.timeline) && a.timeline.length ? a.timeline[a.timeline.length - 1] : null;
        return last?.summary ? `- ${a.name}：${String(last.summary).slice(0, 100)}` : '';
      })
      .filter(Boolean)
      .slice(0, 8);
    if (recent.length) lines.push('【角色线最近动态】\n' + recent.join('\n'));
    const chron = (getChronicle() || []).slice(0, 10).map((c: any) => `- ${c.actorName ? c.actorName + '：' : ''}${c.text}`).filter(Boolean);
    if (chron.length) lines.push('【近期大事记】\n' + chron.join('\n'));
    return lines.join('\n\n');
  } catch (e) { void e; return ''; }
}

// ---- 推演：调 LLM 推进一轮世界态 ----
async function runWorldAdvance(): Promise<void> {
  if (_wbusy) { thToast('正在推演，请稍候', 'warn'); return; }
  _wbusy = true; _wsheet = { kind: 'streaming' }; _requestRender();
  try {
    const cfg = getWStateConfig();
    const state = getWorldState();
    // 拼绑定世界书设定（全局锚点）——地点已拆到「地点」tab 独立演化
    const wbKeys = [...(cfg.globalWbKeys || [])];
    const wbText = wbKeys.length ? await buildInjectFromKeys(Array.from(new Set(wbKeys))) : '';
    const floors = cfg.readFloors > 0 ? readTavernFloors(cfg.readFloors) : '';

    const stateJson = JSON.stringify({
      round: state.round, threads: state.threads, palaces: state.palaces, buzz: state.buzz.map(({ quiet, ...w }) => { void quiet; return w; }),
      charm: state.charm, vibe: state.vibe, rivalries: state.rivalries, season: state.season,
      secrets: state.secrets,
      ambience3: state.ambience3, subRankings: state.subRankings,
      palaceEntities: state.palaceEntities, identities: state.identities, incidents: state.incidents,
    }, null, 0);

    const tpl = getPromptText('wstate.advance');
    const toneBlock = cfg.tonePrompt && cfg.tonePrompt.trim() ? `\n【笔调要求】${cfg.tonePrompt.trim()}` : '';
    // 互喂上下文：把角色线最近动态 + 编年史喂进来，让世界态与具体角色线不打架（同一仙主别说两套近况）。
    const evoCtx = buildEvoContextForWState();
    const system = (wbText ? `【绑定设定（世界观与地点的唯一事实来源，务必遵守）】\n${wbText}\n\n` : '') +
      (evoCtx ? `【角色线近况与近期大事（供对齐，勿直接复述，别与之矛盾）】\n${evoCtx}\n\n` : '') +
      tpl.replace(/\{\{\s*state\s*\}\}/g, stateJson)
        .replace(/\{\{\s*dialogue\s*\}\}/g, floors || '（未读取正文）')
        .replace(/\{\{\s*tone\s*\}\}/g, toneBlock);
    const user = '请推进霜月仙宫后台日常一小步，只输出 JSON。';

    const raw = await chatGenerate({ system, user, aiPresetName: cfg.aiPresetName || undefined, shouldStream: false, jailbreak: wsJailbreak(), qualityBlocks: QUALITY_EVOLUTION });
    const obj = parseLooseJson(raw);
    if (!obj || typeof obj !== 'object') { thToast('推演没有返回有效 JSON', 'error'); return; }
    const next = mergeWorldUpdate(state, obj);
    next.round = state.round + 1;
    saveWorldState(next);
    // 编年史补全：世界态推进也沉淀一条「仙宫大事」进共享编年史（供回归简报/跨源时间线聚合）。
    try {
      const gist = (Array.isArray(obj.incidents) && obj.incidents[0]?.text)
        || (Array.isArray(obj.threads) && obj.threads[0]?.desc)
        || (obj.vibe?.mood ? `仙宫氛围：${obj.vibe.mood}` : '');
      if (gist) addChronicle({ text: String(gist).slice(0, 120), actorName: '仙宫后台' });
    } catch (e) { void e; }
    // 若注入开启，刷新注入
    if (cfg.injectOn) refreshWorldInject();
    thToast('世界态已推进一轮', 'success');
    _wsheet = null;
  } catch (err) {
    thToast('推演失败：' + (err instanceof Error ? err.message : String(err)), 'error');
    _wsheet = null;
  } finally {
    _wbusy = false; _requestRender();
  }
}

// 一键「建立开局世界态」——据 canon+绑定世界书+正文，一次铺满所有维度的丰满开局。
async function runWorldSeed(): Promise<void> {
  if (_wbusy) { thToast('正在处理，请稍候', 'warn'); return; }
  const cur = getWorldState();
  const doSeed = async () => {
    _wbusy = true; _wsheet = { kind: 'streaming' }; _requestRender();
    try {
      const cfg = getWStateConfig();
      const wbKeys = [...(cfg.globalWbKeys || [])];
      const wbText = wbKeys.length ? await buildInjectFromKeys(Array.from(new Set(wbKeys))) : '';
      const floors = cfg.readFloors > 0 ? readTavernFloors(cfg.readFloors) : '';
      const tpl = getPromptText('wstate.seed');
      const toneBlock = cfg.tonePrompt && cfg.tonePrompt.trim() ? `\n【笔调要求】${cfg.tonePrompt.trim()}` : '';
      const system = (wbText ? `【绑定设定（世界观与地点的唯一事实来源，务必遵守）】\n${wbText}\n\n` : '') +
        tpl.replace(/\{\{\s*dialogue\s*\}\}/g, floors || '（未读取正文）').replace(/\{\{\s*tone\s*\}\}/g, toneBlock);
      const user = '请为霜月仙宫建立一份丰满的开局世界态快照，只输出 JSON。';
      const raw = await chatGenerate({ system, user, aiPresetName: cfg.aiPresetName || undefined, shouldStream: false, jailbreak: wsJailbreak(), qualityBlocks: QUALITY_EVOLUTION });
      const obj = parseLooseJson(raw);
      if (!obj || typeof obj !== 'object') { thToast('建档没有返回有效 JSON', 'error'); return; }
      // 建档＝重建：从空态合并
      resetWorldState();
      let next = mergeWorldUpdate(getWorldState(), obj);
      next.round = 1;
      saveWorldState(next);
      if (cfg.injectOn) refreshWorldInject();
      thToast('开局世界态已建立', 'success');
      _wsheet = null;
    } catch (err) {
      thToast('建档失败：' + (err instanceof Error ? err.message : String(err)), 'error');
      _wsheet = null;
    } finally {
      _wbusy = false; _requestRender();
    }
  };
  if (cur.round > 0 || cur.threads.length || cur.digest) {
    const ok = await thConfirm({ title: '重建开局世界态', message: '已有世界态数据。重新建档会用 AI 生成的丰满开局覆盖当前推演结果（已绑定的地点保留）。继续？', confirmText: '重新建档', danger: true });
    if (!ok) return;
  }
  void doSeed();
}

// 分组统一演化——只推「六宫」或「万花镜(10子榜)」一个维度组，一次 API，聚焦省 token。
async function runGroupAdvance(group: 'palaces' | 'mirror'): Promise<void> {
  if (_wbusy) { thToast('正在推演，请稍候', 'warn'); return; }
  _wbusy = true; _wsheet = { kind: 'streaming' }; _requestRender();
  try {
    const cfg = getWStateConfig();
    const s = getWorldState();
    const wbKeys = [...(cfg.globalWbKeys || [])];
    // 六宫若绑了世界书条目，一并带上
    if (group === 'palaces') for (const p of (s.palaceEntities || [])) if (p.wbKey) wbKeys.push(p.wbKey);
    const wbText = wbKeys.length ? await buildInjectFromKeys(Array.from(new Set(wbKeys))) : '';
    const floors = cfg.readFloors > 0 ? readTavernFloors(cfg.readFloors) : '';
    const promptId = group === 'palaces' ? 'wstate.advance.palaces' : 'wstate.advance.mirror';
    const toneBlock = cfg.tonePrompt && cfg.tonePrompt.trim() ? cfg.tonePrompt.trim() : '明亮轻松的日常喜剧基调，跟随绑定世界书设定。';
    const curJson = group === 'palaces'
      ? JSON.stringify({ palaces: s.palaces, palaceEntities: s.palaceEntities }, null, 0)
      : JSON.stringify({ ranking: s.ranking, subRankings: s.subRankings, charm: s.charm }, null, 0);
    const tpl = getPromptText(promptId)
      .replace(/\{\{\s*state\s*\}\}/g, curJson)
      .replace(/\{\{\s*dialogue\s*\}\}/g, floors || '（未读取正文）')
      .replace(/\{\{\s*tone\s*\}\}/g, toneBlock);
    const system = (wbText ? `【绑定设定（唯一事实来源，务必遵守）】\n${wbText}\n\n` : '') + tpl;
    const user = group === 'palaces' ? '请统一推进六大宫殿的最新动态，只输出 JSON。' : '请统一推进万花镜各子榜，只输出 JSON。';
    const raw = await chatGenerate({ system, user, aiPresetName: cfg.aiPresetName || undefined, shouldStream: false, jailbreak: wsJailbreak(), qualityBlocks: QUALITY_EVOLUTION });
    const obj = parseLooseJson(raw);
    if (!obj || typeof obj !== 'object') { thToast('推演没有返回有效 JSON', 'error'); return; }
    const next = mergeWorldUpdate(s, obj);
    saveWorldState(next);
    if (cfg.injectOn) refreshWorldInject();
    thToast(group === 'palaces' ? '六宫已统一推进' : '万花镜已统一推进', 'success');
    _wsheet = null;
  } catch (err) {
    thToast('推演失败：' + (err instanceof Error ? err.message : String(err)), 'error');
    _wsheet = null;
  } finally {
    _wbusy = false; _requestRender();
  }
}

export function refreshWorldInject(): void {
  const cfg = getWStateConfig();
  if (!cfg.injectOn) { uninjectWorld(WS_INJECT_ID); return; }
  const s = getWorldState();
  const summary = buildWorldStateSummary(s);
  const tpl = getPromptText('wstate.inject').replace(/\{\{\s*summary\s*\}\}/g, summary);
  injectWorldPersistent(WS_INJECT_ID, tpl);
}

// PLACEHOLDER_WS_VIEW
// ---- 视图 HTML（单栏仪表盘）----
function sectionCard(title: string, ico: string, bodyHtml: string, extra = ''): string {
  return `<div class="th-ws-card"><div class="th-ws-card-h"><span class="th-ws-card-ttl">${iconHtml(ico)} ${esc(title)}</span>${extra}</div><div class="th-ws-card-b">${bodyHtml || '<div class="th-ws-empty">暂无</div>'}</div></div>`;
}
// 条目行右上角的 编辑/删除 小按钮（data-ws-item-edit/del + field + index，编辑字段名以逗号分隔）
function itemOps(field: string, index: number, editFields: string): string {
  return `<span class="th-ws-itemops"><button class="th-ws-iop" data-ws-item-edit="${field}:${index}:${editFields}" type="button" title="编辑">${iconHtml('fa-pen')}</button><button class="th-ws-iop th-ws-iop-del" data-ws-item-del="${field}:${index}" type="button" title="删除">${iconHtml('fa-trash')}</button></span>`;
}
function worldClockLabel(): string { try { return formatWorldClock(); } catch (e) { void e; return ''; } }
// __WS_DASH_MARKER__

export function wstateInnerHtml(): string {
  const s = getWorldState();

  const wc = worldClockLabel();
  const head = `<div class="th-ws-head">
    <span class="th-ws-round">${iconHtml('fa-earth-asia')} 仙宫后台 · 第 ${s.round} 轮</span>
    <span class="th-ws-clockline">${iconHtml('fa-clock')} ${esc(wc)}</span>
    <span class="th-ws-head-ops">
      <button class="th-ws-chipbtn" data-ws-goset type="button" title="世界态设置已并入「世界演化 设置」">${iconHtml('fa-gear')} 设置</button>
      <button class="th-ws-chipbtn" data-ws-seed type="button" ${_wbusy ? 'disabled' : ''} title="据角色卡设定一键铺出丰满的开局世界态（省去从零一轮轮攒）">${iconHtml('fa-wand-magic-sparkles')} 建立开局</button>
      <button class="th-ws-primary" data-ws-advance type="button" ${_wbusy ? 'disabled' : ''}>${iconHtml('fa-gauge-high')} 推进一轮</button>
    </span>
  </div>`;

  // 分区筛选（地点已拆出，去掉 place 分区）
  const SECTIONS: { id: string; label: string; ico: string }[] = [
    { id: 'all', label: '全部', ico: 'fa-layer-group' },
    { id: 'threads', label: '单元剧', ico: 'fa-clapperboard' },
    { id: 'ranking', label: '万花镜', ico: 'fa-ranking-star' },
    { id: 'palaces', label: '六宫', ico: 'fa-crown' },
    { id: 'amb', label: '氛围', ico: 'fa-wind' },
    { id: 'variety', label: '综艺企划', ico: 'fa-clapperboard' },
    { id: 'clubs', label: '社团', ico: 'fa-people-group' },
    { id: 'buzz', label: '八卦', ico: 'fa-comments' },
    { id: 'riv', label: '修罗场', ico: 'fa-fire' },
    { id: 'season', label: '当季', ico: 'fa-calendar-days' },
    { id: 'incident', label: '突发', ico: 'fa-bolt' },
    { id: 'identity', label: '身份双轨', ico: 'fa-id-badge' },
    { id: 'secret', label: '悄悄话', ico: 'fa-lock' },
  ];
  // 隐藏的维度既不出现在筛选条、也不显示卡片、也不注入。仅「全部」恒显。
  const hidden = new Set(getWStateConfig().hiddenDims || []);
  const filterBar = `<div class="th-ws-filter">${SECTIONS.filter(x => x.id === 'all' || !hidden.has(x.id)).map(x => `<button class="th-ws-fchip${_wsSection === x.id ? ' on' : ''}" data-ws-section="${x.id}" type="button">${iconHtml(x.ico)} ${esc(x.label)}</button>`).join('')}
    <button class="th-ws-fchip th-ws-fchip-cfg${_dimCfgOpen ? ' on' : ''}" data-ws-dimcfg type="button" title="选择要显示/隐藏哪些维度">${iconHtml('fa-sliders')} 维度</button></div>${
    _dimCfgOpen ? `<div class="th-ws-dimcfg">
      <div class="th-ws-dimcfg-hint">${iconHtml('fa-circle-info')} 取消勾选＝该维度不显示、也不注入正文。「全部」不可隐藏。</div>
      <div class="th-ws-dimcfg-grid">${SECTIONS.filter(x => x.id !== 'all').map(x => `<label class="th-ws-dimcfg-chip${hidden.has(x.id) ? '' : ' on'}"><input type="checkbox" data-ws-dimtoggle="${x.id}" ${hidden.has(x.id) ? '' : 'checked'}>${iconHtml(x.ico)} ${esc(x.label)}</label>`).join('')}</div>
    </div>` : ''}`;
  const showSec = (id: string) => !hidden.has(id) && (_wsSection === 'all' || _wsSection === id);

  // digest
  const digest = s.digest ? `<div class="th-ws-digest">${iconHtml('fa-feather')} ${esc(s.digest)}</div>` : '';

  // threads（每条可编辑/删除）
  const threadsBody = s.threads.map((t, i) => `<div class="th-ws-thread">
    <span class="th-ws-th-stage th-ws-stage-${THREAD_STAGES.indexOf(t.stage)}">${esc(t.stage)}</span>
    <div class="th-ws-th-mid"><div class="th-ws-th-name">${esc(t.name)}${t.stall ? ' <span class="th-ws-tag">搁置</span>' : ''}</div><div class="th-ws-th-desc">${esc(t.desc)}</div></div>
    <span class="th-ws-th-heat">${'🔥'.repeat(t.heat)}</span>${itemOps('threads', i, 'name,desc')}
  </div>`).join('');

  // buzz（可一键「引到论坛」+ 编辑/删除）
  const spreadLabel = ['', '小圈子', '一个宫', '半个仙宫', '全宫'];
  const buzzBody = s.buzz.map((w, i) => `<div class="th-ws-buzz"><span class="th-ws-buzz-kind">${esc(w.kind)}</span><div class="th-ws-buzz-mid"><div class="th-ws-buzz-c">${esc(w.content)}</div><div class="th-ws-buzz-s">传到${esc(spreadLabel[w.spread] || '')} · ${esc(w.source)}</div></div><button class="th-ws-buzz-echo" data-ws-buzz-echo="${i}" type="button" title="引到世界论坛让网友吃瓜盖楼">${iconHtml('fa-comments')}</button>${itemOps('buzz', i, 'content,source')}</div>`).join('');

  // rivalries
  const rivBody = s.rivalries.map((r, i) => `<div class="th-ws-riv"><span class="th-ws-riv-stage th-ws-rstage-${RIVALRY_STAGES.indexOf(r.stage)}">${esc(r.stage)}</span><div class="th-ws-riv-mid"><div class="th-ws-riv-who">${esc(r.who)}</div><div class="th-ws-riv-over">为「${esc(r.over)}」· ${esc(r.desc)}</div></div>${itemOps('rivalries', i, 'who,over,desc')}</div>`).join('');

  // season
  const seasonBody = s.season.map((x, i) => `<div class="th-ws-season"><span class="th-ws-season-st">${esc(x.status)}</span><div class="th-ws-season-mid"><div class="th-ws-season-n">${esc(x.name)}</div><div class="th-ws-season-d">${esc(x.desc)}</div></div>${itemOps('season', i, 'name,desc')}</div>`).join('');

  // secrets
  const secBody = s.secrets.map((x, i) => `<div class="th-ws-secret">${iconHtml('fa-lock')} <span class="th-ws-secret-w">${esc(x.what)}</span> <span class="th-ws-secret-m">目击:${esc(x.witnesses)} · 暴露${x.exposure}%</span>${itemOps('secrets', i, 'what,witnesses')}</div>`).join('');

  // 六宫大区（常规可编辑卡 + 「统一演化六宫」钮）
  const palEnts = (s.palaceEntities && s.palaceEntities.length) ? s.palaceEntities : [];
  const palaceBody = palEnts.length ? palEnts.map((p, i) => `<div class="th-ws-palrow">
    <div class="th-ws-palrow-h"><b>${iconHtml('fa-crown')} ${esc(p.name)}</b>${p.wbKey ? ' <em class="th-ws-tag th-ws-tag-wb">设定</em>' : ''}${itemOps('palaceEntities', i, 'duty,recent,mood')}</div>
    <div class="th-ws-palrow-b"><span>${esc(p.recent || p.duty || '——')}</span>${p.mood ? `<em class="th-ws-palrow-mood">${esc(p.mood)}</em>` : ''}</div>
  </div>`).join('') : '<div class="th-ws-empty">还没铺六宫。点右上「铺入六宫骨架」或「统一演化六宫」。</div>';
  const palaceExtra = `<button class="th-ws-cardbtn" data-ws-seed-palaces type="button" title="据设定铺入六大宫殿骨架">${iconHtml('fa-wand-magic-sparkles')}</button><button class="th-ws-cardbtn th-ws-cardbtn-go" data-ws-group-advance="palaces" type="button" ${_wbusy ? 'disabled' : ''} title="一次API只推六宫">${iconHtml('fa-gauge-high')} 统一演化</button>`;

  // 万花镜大区（10子榜全部展开 + 「统一演化万花镜」钮）
  const rankRow = (e: any, field: string, ri: number, ei: number) => `<div class="th-ws-rank-row"><span class="th-ws-rank-no th-ws-rank-no-${e.rank <= 3 ? e.rank : 'n'}">${e.rank}</span><span class="th-ws-rank-name">${esc(e.name)}</span><span class="th-ws-rank-trend th-ws-trend-${e.trend === '↑' ? 'up' : e.trend === '↓' ? 'down' : e.trend === 'NEW' ? 'new' : 'flat'}">${esc(e.trend)}</span><span class="th-ws-rank-reason">${esc(e.reason)}</span>${field === 'sub' ? `<button class="th-ws-iop th-ws-iop-del" data-ws-subrank-del="${ri}:${ei}" type="button" title="删除">${iconHtml('fa-xmark')}</button>` : ''}</div>`;
  const mainRankHtml = s.ranking && s.ranking.entries.length ? `<div class="th-ws-subrank"><div class="th-ws-subrank-h">${iconHtml('fa-ranking-star')} ${esc(s.ranking.title || '主榜')}${s.ranking.note ? ` <em>${esc(s.ranking.note)}</em>` : ''}</div>${s.ranking.entries.map((e, ei) => rankRow(e, 'main', -1, ei)).join('')}</div>` : '';
  const subRankHtml = (s.subRankings && s.subRankings.length) ? s.subRankings.map((rk, ri) => `<div class="th-ws-subrank">
    <div class="th-ws-subrank-h">${iconHtml('fa-ranking-star')} ${esc(rk.title)}${rk.note ? ` <em>${esc(rk.note)}</em>` : ''}<button class="th-ws-iop th-ws-iop-del" data-ws-subrank-clr="${ri}" type="button" title="删整个子榜">${iconHtml('fa-trash')}</button></div>
    ${rk.entries.map((e, ei) => rankRow(e, 'sub', ri, ei)).join('')}
  </div>`).join('') : '';
  const mirrorBody = (mainRankHtml || subRankHtml) ? `${mainRankHtml}${subRankHtml}` : `<div class="th-ws-empty">还没有打榜数据。「建立开局」或点右上「统一演化万花镜」。</div>`;
  const mirrorExtra = `<button class="th-ws-cardbtn th-ws-cardbtn-go" data-ws-group-advance="mirror" type="button" ${_wbusy ? 'disabled' : ''} title="一次API只推万花镜10子榜">${iconHtml('fa-gauge-high')} 统一演化</button>`;

  // 综艺/企划
  const varBody = s.variety.map((v, i) => `<div class="th-ws-var"><span class="th-ws-var-kind">${esc(v.kind)}</span><div class="th-ws-var-mid"><div class="th-ws-var-n">《${esc(v.name)}》<span class="th-ws-var-stage">${esc(v.stage)}</span></div><div class="th-ws-var-hook">${esc(v.hook)}</div>${v.host ? `<div class="th-ws-var-host">${iconHtml('fa-crown')} ${esc(v.host)}</div>` : ''}</div>${itemOps('variety', i, 'name,hook,host')}</div>`).join('');

  // 社团（独立分区，可编辑/删除）
  const clubBody = s.clubs.map((c, i) => `<div class="th-ws-club"><b>${iconHtml('fa-people-group')} ${esc(c.name)}</b><span class="th-ws-club-lead">${esc(c.lead || '')}</span><div class="th-ws-club-doing">${esc(c.doing || '——')}</div>${c.mood ? `<em class="th-ws-club-mood">${esc(c.mood)}</em>` : ''}${itemOps('clubs', i, 'name,lead,doing,mood')}</div>`).join('');

  // 时令节气
  const calBody = s.calendar ? `<div class="th-ws-cal">
    <div class="th-ws-cal-main"><span class="th-ws-cal-season">${esc(s.calendar.season || '—')}</span>${s.calendar.festival ? `<span class="th-ws-cal-fest">${iconHtml('fa-star')} ${esc(s.calendar.festival)}</span>` : ''}</div>
    ${s.calendar.daysToNext ? `<div class="th-ws-cal-days">${iconHtml('fa-hourglass-half')} ${esc(s.calendar.daysToNext)}</div>` : ''}
    ${s.calendar.ambiance ? `<div class="th-ws-cal-amb">${esc(s.calendar.ambiance)}</div>` : ''}
  </div>` : '';

  // 氛围 3 维（每维三个词 + 一句；单独存在，不与顶部重复）
  const amb = s.ambience3;
  const ambBody = amb ? `<div class="th-ws-amb3">
    ${[['palace', '仙宫内'], ['academy', '学院'], ['public', '对外舆论']].map(([k, lbl]) => {
      const d = (amb as any)[k]; const words = (d?.words && d.words.length) ? d.words : [];
      return `<div class="th-ws-amb-dim"><div class="th-ws-amb-head"><span class="th-ws-amb-lbl">${esc(lbl as string)}</span><div class="th-ws-amb-words">${words.length ? words.map((w: string) => `<em class="th-ws-amb-word">${esc(w)}</em>`).join('') : '<em class="th-ws-amb-word th-ws-dim">—</em>'}</div><button class="th-ws-iop" data-ws-amb-edit="${k}" type="button" title="编辑">${iconHtml('fa-pen')}</button></div><span class="th-ws-amb-line">${esc(d?.line || '')}</span></div>`;
    }).join('')}
  </div>` : '';

  // 突发事件
  const incBody = (s.incidents && s.incidents.length) ? s.incidents.map((x, i) => `<div class="th-ws-inc">${iconHtml('fa-bolt')} <span class="th-ws-inc-t">${esc(x.text)}</span>${x.from ? `<span class="th-ws-inc-from">起于${esc(x.from)}</span>` : ''}${itemOps('incidents', i, 'text,from')}</div>`).join('') : '';

  // 身份双轨花名册
  const idBody = (s.identities && s.identities.length) ? s.identities.map((x, i) => `<div class="th-ws-idrow"><b>${esc(x.name)}</b><span class="th-ws-id-aca">${iconHtml('fa-school')} ${esc(x.academy || '—')}</span><span class="th-ws-id-pal">${iconHtml('fa-crown')} ${esc(x.palace || '—')}</span>${itemOps('identities', i, 'name,academy,palace')}</div>`).join('') : '';

  const empty = !s.round && !s.threads.length && !s.palaces.length && !(s.palaceEntities && s.palaceEntities.length);
  const emptyHint = empty ? `<div class="th-ws-firsthint">${iconHtml('fa-earth-asia')}<div>这里是霜月仙宫的「后台日常」。先点<b>「建立开局」</b>铺一盘，再用<b>「推进一轮」</b>让它生长；也可用各区的「统一演化」只推某一块。</div></div>` : '';

  const dash = `<div class="th-ws-wrap">${digest}${emptyHint}${filterBar}
    ${showSec('all') && calBody ? sectionCard('时令节气', 'fa-calendar-days', calBody) : ''}
    ${showSec('threads') ? sectionCard('日常单元剧', 'fa-clapperboard', threadsBody) : ''}
    ${showSec('ranking') ? sectionCard('万花镜打榜（全部子榜）', 'fa-ranking-star', mirrorBody, mirrorExtra) : ''}
    ${showSec('palaces') ? sectionCard('六大宫殿', 'fa-crown', palaceBody, palaceExtra) : ''}
    ${showSec('amb') && ambBody ? sectionCard('氛围·三维（每维三词）', 'fa-wind', ambBody) : ''}
    ${showSec('variety') ? sectionCard('偶像企划 / 综艺', 'fa-clapperboard', varBody) : ''}
    ${showSec('clubs') ? sectionCard('学园社团', 'fa-people-group', clubBody) : ''}
    ${showSec('buzz') ? sectionCard('仙宫八卦', 'fa-comments', buzzBody) : ''}
    ${showSec('riv') ? sectionCard('争宠修罗场', 'fa-fire', rivBody) : ''}
    ${showSec('season') ? sectionCard('当季大事件', 'fa-star', seasonBody) : ''}
    ${showSec('incident') && incBody ? sectionCard('突发事件', 'fa-bolt', incBody) : ''}
    ${showSec('identity') && idBody ? sectionCard('身份双轨', 'fa-id-badge', idBody) : ''}
    ${showSec('secret') ? sectionCard('私房悄悄话', 'fa-lock', secBody) : ''}
  </div>`;

  // 单栏仪表盘
  return `<div class="th-ws-outer">${head}<div class="th-ws-single">${dash}</div></div>${wstateSheetHtml()}`;
}
// PLACEHOLDER_WS_SHEET
// ---- Sheet HTML（地点已拆出，仅保留推演流式）----
function wstateSheetHtml(): string {
  if (!_wsheet) return '';
  let title = ''; let inner = '';
  if (_wsheet.kind === 'streaming') { title = '正在推演…'; inner = `<div class="th-ws-streaming">${iconHtml('fa-gauge-high')}<div class="th-ws-streaming-t">霜月仙宫后台推演中…</div></div>`; }
  return `<div class="th-ws-sheet-mask" data-ws-sheet-close><div class="th-ws-sheet" data-ws-sheet-stop>

    <div class="th-ws-sheet-h"><span>${esc(title)}</span><button class="th-ws-sheet-x" data-ws-sheet-close type="button">${iconHtml('fa-xmark')}</button></div>
    <div class="th-ws-sheet-b">${inner}</div>
  </div></div>`;
}

// 世界态设置面板 —— 供「世界演化 → 设置 → 世界态」内联嵌入（不再走独立 sheet）。
// 锚点世界书改用内联展开的共享复选器（wbPicker），与演化其它分类一致；地点绑定仍走 sheet。
export function wstateSettingsPanelHtml(): string {
  const cfg = getWStateConfig();
  const presets = (() => { try { return getApiPresetNames(); } catch (e) { void e; return []; } })();
  const presetOpts = ['<option value="">（跟随当前 / 默认）</option>']
    .concat(presets.map(p => `<option value="${esc(p)}" ${cfg.aiPresetName === p ? 'selected' : ''}>${esc(p)}</option>`)).join('');
  const boundList = (cfg.globalWbKeys || []).map(k => `<span class="th-ws-wbtag" title="${esc(parseWbEntryKey(k).book)}">${esc(parseWbEntryKey(k).entry || k)}<button data-ws-gwb-del="${esc(k)}" type="button">${iconHtml('fa-xmark')}</button></span>`).join('') || '<span class="th-ws-dim">未绑定（建议绑定「世界观」「叙事指南」「霜月仙宗设定」等条目作为锚点）</span>';
  const anchorPicker = _wsAnchorOpen
    ? `<div class="th-ws-wbpick-host" data-ws-pick="anchor"><div class="th-ws-wbadd" style="margin:6px 0"><button class="th-ws-primary" data-ws-anchor-done type="button">${iconHtml('fa-check')} 完成绑定</button></div>${wbPickerHtml(_wsPickSel)}</div>`
    : `<button class="th-ws-mini" data-ws-anchor-open type="button" ${isWorldbookAvailable() ? '' : 'disabled'}>${iconHtml('fa-plus')} 从世界书勾选锚点（多选）</button>`;

  return `<div class="th-ws-form th-ws-form-embed">
    <div class="th-ws-set-g">${iconHtml('fa-plug')} 推演 API</div>
    <label class="th-ws-frow"><span>推演使用的 API 预设</span><select class="th-ws-field th-ws-s-preset">${presetOpts}</select></label>

    <div class="th-ws-set-g">${iconHtml('fa-book-open')} 世界观锚点（绑定世界书条目）</div>
    <div class="th-ws-set-hint">绑定的条目内容会作为「唯一事实来源」注入每次推演——设定改了只改世界书、不动提示词。可跨多本书勾选多个条目。</div>
    <div class="th-ws-wbbound">${boundList}</div>
    ${anchorPicker}

    <div class="th-ws-set-hint">${iconHtml('fa-circle-info')} 地点演化已挪到「世界演化 → 地点」独立 tab；这里绑定的世界观锚点会同时供世界态与地点演化使用。</div>

    <div class="th-ws-set-g">${iconHtml('fa-book-open')} 正文参考</div>
    <label class="th-ws-frow"><span>推演时附带最近几楼正文（0=不读）</span><input type="number" min="0" class="th-ws-field th-ws-s-floors" value="${esc(String(cfg.readFloors))}"></label>

    <div class="th-ws-set-g">${iconHtml('fa-feather')} 语气 / 笔调预设（可选）</div>
    <label class="th-ws-frow th-ws-frow-stack"><span>附加到每次推演，统一笔调</span><textarea class="th-ws-field th-ws-s-tone" rows="2" placeholder="如：多写吐槽与玩梗，网感拉满，甜度再高一点。">${esc(cfg.tonePrompt || '')}</textarea></label>

    <div class="th-ws-set-g">${iconHtml('fa-bolt')} 楼层自动推进</div>
    <label class="th-ws-frow"><span>正文每推进 N 楼自动推演一次（0=关）</span><input type="number" min="0" max="200" class="th-ws-field th-ws-s-auto" value="${esc(String(cfg.autoInterval || 0))}"></label>

    <div class="th-ws-set-g">${iconHtml('fa-database')} 数据</div>
    <button class="th-ws-danger" data-ws-reset type="button">${iconHtml('fa-trash')} 清空世界态（设置保留）</button>
  </div>`;
}

// 由演化 render() 后调用：若锚点复选器展开，绑定它（内联在设置分类里）
export function wstateBindSettingsPicker(root: HTMLElement): void {
  if (!_wsAnchorOpen) return;
  const host = root.querySelector('.th-ws-wbpick-host[data-ws-pick="anchor"]') as HTMLElement | null;
  if (host) bindWbPicker(host, () => _wsPickSel, (keys) => { _wsPickSel = keys; });
}

// 由 evolution render() 后调用：世界态视图当前无内嵌复选器（地点已拆出），保留空实现兼容调用点。
export function wstateBindPickers(_root: HTMLElement): void { /* no-op：地点复选已移到 places-ui */ }
// PLACEHOLDER_WS_HANDLERS
// 仪表盘「设置」按钮 → 跳到「世界演化 设置 · 世界态」分类（由 evolution 注入回调）
let _gotoSettings: () => void = () => {};
export function wstateSetGotoSettings(fn: () => void): void { _gotoSettings = fn; }

// 条目编辑——弹表单改指定字段（field:index:字段名逗号分隔）。
async function handleItemEdit(spec: string): Promise<void> {
  const parts = spec.split(':');
  const field = parts[0]; const index = Number(parts[1]); const fieldNames = (parts[2] || '').split(',').filter(Boolean);
  const s = getWorldState();
  const arr = (s as any)[field] as any[];
  if (!Array.isArray(arr) || !arr[index]) return;
  const item = arr[index];
  const patch: Record<string, any> = {};
  for (const fn of fieldNames) {
    const cur = item[fn] != null ? String(item[fn]) : '';
    const v = await thPrompt({ title: `编辑 ${fn}`, value: cur, multiline: (cur.length > 20) });
    if (v == null) return; // 取消
    patch[fn] = v;
  }
  editWsItem(field as any, index, patch);
  _requestRender();
}
// 氛围某维编辑（三词 + 一句）
async function handleAmbEdit(dimKey: string): Promise<void> {
  const s = getWorldState();
  const amb: any = s.ambience3 || { palace: { words: [], line: '' }, academy: { words: [], line: '' }, public: { words: [], line: '' } };
  const cur = amb[dimKey] || { words: [], line: '' };
  const wordsStr = await thPrompt({ title: `编辑此维「三个氛围词」（顿号/逗号分隔）`, value: (cur.words || []).join('、') });
  if (wordsStr == null) return;
  const line = await thPrompt({ title: '编辑此维的一句描述', value: String(cur.line || ''), multiline: true });
  if (line == null) return;
  amb[dimKey] = { words: wordsStr.split(/[、,，\s]+/).filter(Boolean).slice(0, 3), line };
  editWsScalar({ ambience3: amb });
  _requestRender();
}

// ---- 点击处理（返回 true 表示已处理）----
export function wstateClick(t: HTMLElement): boolean {
  // sheet 关闭
  if (t.closest('[data-ws-sheet-close]') && !t.closest('[data-ws-sheet-stop]')) { _wsheet = null; _requestRender(); return true; }
  if (t.closest('[data-ws-advance]')) { void runWorldAdvance(); return true; }
  if (t.closest('[data-ws-seed]')) { void runWorldSeed(); return true; }
  if (t.closest('[data-ws-goset]')) { _gotoSettings(); return true; }
  if (t.closest('[data-ws-seed-palaces]')) { seedPalaceEntities(); thToast('已铺入六宫骨架', 'success'); _requestRender(); return true; }
  // 六宫/万花镜统一演化
  const grpBtn = t.closest('[data-ws-group-advance]') as HTMLElement | null;
  if (grpBtn) { void runGroupAdvance((grpBtn.getAttribute('data-ws-group-advance') as any) || 'palaces'); return true; }
  // 条目编辑/删除
  const iEdit = t.closest('[data-ws-item-edit]') as HTMLElement | null;
  if (iEdit) { void handleItemEdit(iEdit.getAttribute('data-ws-item-edit') || ''); return true; }
  const iDel = t.closest('[data-ws-item-del]') as HTMLElement | null;
  if (iDel) {
    const [field, idxStr] = (iDel.getAttribute('data-ws-item-del') || '').split(':');
    thConfirm({ title: '删除这条', message: '删除后不可恢复。', confirmText: '删除', danger: true }).then(ok => { if (ok) { deleteWsItem(field as any, Number(idxStr)); _requestRender(); } });
    return true;
  }
  // 万花镜子榜：删单条 / 删整榜
  const srDel = t.closest('[data-ws-subrank-del]') as HTMLElement | null;
  if (srDel) { const [ri, ei] = (srDel.getAttribute('data-ws-subrank-del') || '').split(':').map(Number); deleteSubRankEntry(ri, ei); _requestRender(); return true; }
  const srClr = t.closest('[data-ws-subrank-clr]') as HTMLElement | null;
  if (srClr) {
    const ri = Number(srClr.getAttribute('data-ws-subrank-clr'));
    thConfirm({ title: '删整个子榜', message: '删除这个子榜的全部名次？', confirmText: '删除', danger: true }).then(ok => { if (ok) { deleteSubRank(ri); _requestRender(); } });
    return true;
  }
  // 氛围某维 编辑
  const ambEdit = t.closest('[data-ws-amb-edit]') as HTMLElement | null;
  if (ambEdit) { void handleAmbEdit(ambEdit.getAttribute('data-ws-amb-edit') || ''); return true; }
  // 分区筛选切换
  const secBtn = t.closest('[data-ws-section]') as HTMLElement | null;
  if (secBtn) { _wsSection = secBtn.getAttribute('data-ws-section') || 'all'; _requestRender(); return true; }
  // 维度显示/隐藏配置面板开合
  if (t.closest('[data-ws-dimcfg]')) { _dimCfgOpen = !_dimCfgOpen; _requestRender(); return true; }
  // 八卦引到论坛（世界态生态联动，与演化世界大事同款）
  const buzzEcho = t.closest('[data-ws-buzz-echo]') as HTMLElement | null;
  if (buzzEcho) {
    const idx = Number(buzzEcho.getAttribute('data-ws-buzz-echo') || '-1');
    const w = getWorldState().buzz[idx];
    if (w) {
      try {
        const fn = (window as any).__th_world_forum__?.forumEchoEvent;
        if (typeof fn === 'function') fn(`【仙宫八卦·${w.kind}】${w.content}（传播：${w.source}）`);
        else thToast('世界论坛未就绪', 'warn');
      } catch (e) { void e; thToast('引流到论坛失败', 'error'); }
    }
    return true;
  }
  if (t.closest('[data-ws-reset]')) {
    thConfirm({ title: '清空世界态', message: '清空所有后台日常推演结果？设置保留，不可恢复。', confirmText: '清空', danger: true }).then(ok => {
      if (ok) { resetWorldState(); uninjectWorld(WS_INJECT_ID); _wsheet = null; thToast('世界态已清空', 'success'); _requestRender(); }
    });
    return true;
  }
  // 世界观锚点改内联展开复选器（在演化设置分类里，不再走 sheet）
  if (t.closest('[data-ws-anchor-open]')) {
    _wsPickSel = [...(getWStateConfig().globalWbKeys || [])];
    _wsAnchorOpen = true; _requestRender(); return true;
  }
  if (t.closest('[data-ws-anchor-done]')) {
    saveWStateConfig({ globalWbKeys: _wsPickSel.slice() });
    _wsAnchorOpen = false; thToast(`已绑定 ${_wsPickSel.length} 个锚点`, 'success'); _requestRender(); return true;
  }
  // 删全局世界书锚点
  const gwbDel = t.closest('[data-ws-gwb-del]') as HTMLElement | null;
  if (gwbDel) {
    const key = gwbDel.getAttribute('data-ws-gwb-del') || '';
    const cfg = getWStateConfig();
    saveWStateConfig({ globalWbKeys: (cfg.globalWbKeys || []).filter(k => k !== key) });
    _requestRender(); return true;
  }
  return false;
}

// ---- change 处理（返回 true 表示已处理）----
// 设置字段已内联到「演化设置·世界态」分类（无 sheet），故不再要求 _wsheet 存在。
export function wstateChange(t: HTMLElement): boolean {
  if (t.classList.contains('th-ws-s-preset')) { saveWStateConfig({ aiPresetName: (t as HTMLSelectElement).value }); return true; }
  if (t.classList.contains('th-ws-s-floors')) { saveWStateConfig({ readFloors: Math.max(0, Number((t as HTMLInputElement).value) || 0) }); return true; }
  if (t.classList.contains('th-ws-s-inject')) { const on = (t as HTMLInputElement).checked; saveWStateConfig({ injectOn: on }); refreshWorldInject(); thToast(on ? '已开启世界态注入正文' : '已关闭注入', 'info'); return true; }
  if (t.classList.contains('th-ws-s-tone')) { saveWStateConfig({ tonePrompt: (t as HTMLTextAreaElement).value }); return true; }
  if (t.classList.contains('th-ws-s-auto')) { saveWStateConfig({ autoInterval: Math.max(0, Number((t as HTMLInputElement).value) || 0) }); return true; }
  // 维度显示/隐藏勾选（勾=显示，取消=隐藏）
  const dimTog = t.closest('[data-ws-dimtoggle]') as HTMLElement | null;
  if (dimTog) {
    const id = dimTog.getAttribute('data-ws-dimtoggle') || '';
    const on = (t as HTMLInputElement).checked;
    const hid = new Set(getWStateConfig().hiddenDims || []);
    if (on) hid.delete(id); else hid.add(id);
    saveWStateConfig({ hiddenDims: Array.from(hid) });
    refreshWorldInject();   // 隐藏维度也从注入里剔除
    _requestRender(); return true;
  }
  // 世界书选择已改为共享复选器 wbPicker（自管展开/勾选/加载），settings/addPlace 不再有级联 select。
  return false;
}

// ---- 楼层自动推进（evolution 打开 app 时调一次）----
export function maybeAutoWorldAdvance(getFloorCount: () => number): void {
  if (!shouldAutoTrigger('wstate')) return;   // 全局急停
  const cfg = getWStateConfig();
  if (!cfg.autoInterval || cfg.autoInterval <= 0) return;
  const cur = getFloorCount();
  if (cur - (cfg.lastFloor || 0) < cfg.autoInterval) return;
  saveWStateConfig({ lastFloor: cur });
  void runWorldAdvance();
}

// 自动触发登记（世界态推演；本模块是 evolution 的子视图，故在模块加载末尾登记）
registerAutoAgent({
  id: 'wstate', name: '世界态推演', icon: 'fa-earth-asia', desc: '每 N 楼自动推演一次世界态',
  getInterval: () => { try { return getWStateConfig().autoInterval || 0; } catch (e) { void e; return 0; } },
  setInterval: (n) => { saveWStateConfig({ autoInterval: n }); },
  getLastFloor: () => { try { return getWStateConfig().lastFloor || 0; } catch (e) { void e; return 0; } },
  fireNow: () => { void runWorldAdvance(); },
});

// ============================================================================
// 世界态注入片段化——玩家可精准勾选注入哪部分世界态，
// 选「写入输入框」或「写入角色卡世界书」，套统一封套、可编辑，默认全关。
// 「把世界态注入正文」的单一 toggle（injectOn，走 injectWorldPersistent 持久注入）保留兼容，
// 但设置面板改为展示这套片段面板（injectPlanPanelHtml('wstate')），与微信/糖心/演化等一致。
// ============================================================================
function segBody(kind: 'all' | 'ambiance' | 'ranking' | 'gossip' | 'threads'): string | null {
  const s = getWorldState();
  if (!s.round && !s.threads.length && !s.digest) return null;
  if (kind === 'all') return buildWorldStateSummary(s);
  if (kind === 'ambiance') {
    const parts: string[] = [];
    if (s.calendar && (s.calendar.season || s.calendar.festival)) parts.push(`时令：${[s.calendar.season, s.calendar.festival].filter(Boolean).join('·')}${s.calendar.ambiance ? '；' + s.calendar.ambiance : ''}`);
    if (s.vibe?.mood) parts.push(`今日氛围：${s.vibe.mood}${(s.vibe.signals || []).map(x => '；' + x.summary).join('')}`);
    const seasonOn = s.season.filter(x => x.status !== '已落幕');
    if (seasonOn.length) parts.push(`当季大事：${seasonOn.map(x => `${x.name}(${x.status})`).join('、')}`);
    return parts.length ? parts.map(p => '· ' + p).join('\n') : null;
  }
  if (kind === 'ranking') {
    const out: string[] = [];
    if (s.ranking?.entries?.length) out.push(`· 万花镜${s.ranking.title ? '·' + s.ranking.title : ''}：${s.ranking.entries.slice(0, 6).map(e => `${e.rank}.${e.name}${e.trend && e.trend !== '→' ? e.trend : ''}`).join('　')}${s.ranking.note ? `（${s.ranking.note}）` : ''}`);
    s.variety.filter(v => v.stage !== '已收官').slice(0, 3).forEach(v => out.push(`· 企划[${v.kind}·${v.stage}]：《${v.name}》${v.hook ? '——' + v.hook : ''}`));
    s.clubs.filter(c => c.doing).slice(0, 4).forEach(c => out.push(`· 社团[${c.name}]：${c.doing}`));
    return out.length ? out.join('\n') : null;
  }
  if (kind === 'gossip') {
    const out: string[] = [];
    s.buzz.filter(w => w.spread >= 2).slice(0, 5).forEach(w => out.push(`· 八卦[${w.kind}]：${w.content}（传播：${w.source}）`));
    s.rivalries.slice(0, 4).forEach(r => out.push(`· 修罗场：${r.who} 正为「${r.over}」${r.stage}`));
    return out.length ? out.join('\n') : null;
  }
  // threads
  const th = s.threads.filter(t => !t.stall).sort((a, b) => b.heat - a.heat).slice(0, 6);
  if (!th.length) return null;
  return th.map(t => `· 「${t.name}」(${t.stage}) ${t.desc}`).join('\n');
}
registerInjectPlan({
  appId: 'wstate', appName: '世界态',
  segments: [
    { id: 'all', name: '仙宫后台·全景', kind: 'state', desc: '把当前世界态摘要（时令/氛围/打榜/综艺/社团/八卦/地点…）整体注入，让正文知道镜头外仙宫此刻在发生什么。', module: '世界态仪表盘', what: '霜月仙宫此刻在主角视线之外正发生的后台日常全景摘要', guide: '后文怎么体现：把这些当作正在流转的世界背景，让它们自然渗进叙事边角（路过对话/手机弹窗/远处喧闹），聚焦点仍是主角当下剧情，不必逐条复述。', build: () => { const b = segBody('all'); return b ? { body: b, meta: { 范围: '全景' } } : null; } },
    { id: 'ambiance', name: '时令·氛围·当季', kind: 'state', desc: '只注入当前节令、今日氛围与当季大事，作为场景底色。', module: '世界态', what: '仙宫当前的时令节气、今日整体氛围与进行中的当季大事', guide: '后文怎么体现：作为场景与季节底色，让天气物候、节日气氛、当季忙碌自然透出。', build: () => { const b = segBody('ambiance'); return b ? { body: b } : null; } },
    { id: 'ranking', name: '万花镜·综艺·社团', kind: 'fact', desc: '注入偶像打榜/自制综艺/学园社团的近况，让娱乐工业与校园线可被提及。', module: '世界态', what: '万花镜打榜名次、进行中的综艺企划、学园社团动态', guide: '后文怎么体现：角色可自然提及榜单涨跌、某期综艺名梗、社团活动，作为这座偶像女儿国的日常空气。', build: () => { const b = segBody('ranking'); return b ? { body: b } : null; } },
    { id: 'gossip', name: '八卦·修罗场', kind: 'fact', desc: '注入已传开的仙宫八卦与争宠修罗场，供角色吃瓜、被牵动。', module: '世界态', what: '已经传开的仙宫八卦小道消息与正在上演的甜蜜争宠修罗场', guide: '后文怎么体现：知情的角色可据此调侃、试探、结盟或吃醋，永远停在甜蜜打闹、绝不真敌对。', build: () => { const b = segBody('gossip'); return b ? { body: b } : null; } },
    { id: 'threads', name: '进行中的单元剧', kind: 'fact', desc: '注入正在发酵/高潮的日常单元剧线索，作为可随时展开的引子。', module: '世界态', what: '仙宫后台正在发酵或临近高潮的若干条日常单元剧线索', guide: '后文怎么体现：当剧情自然触及时，可让相关角色把这些线索带进主线，或作为背景持续发酵。', build: () => { const b = segBody('threads'); return b ? { body: b } : null; } },
  ],
});




