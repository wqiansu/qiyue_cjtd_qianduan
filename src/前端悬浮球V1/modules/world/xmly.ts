// 世界套件·喜马拉雅（xmly.ts）UI 模块
// PC 三栏「仙宫版听书电台」，电台暖紫(#a855f7→#c084fc)。**纯音频**：有声书/广播剧/国风/ASMR/电台/知识/夜话。
//   左栏(thw-xmly-side)：品牌+在听节拍 / 逛(推荐·分类·直播电台·声音榜) / 我的(收听追更·歌单·成长) / 设置。
//   中栏(thw-xmly-content)：四 tab（推荐瀑布流 / 分类聚合 / 直播电台 / 我听的）+ 分类快筛(顶栏下方) + 覆盖/增量刷新养库。
//   右栏(thw-xmly-inspector)：专辑详情（封面/单集列表/声控弹幕/操作）或直播间详情——打开时变主阅读区。
//   底部：常驻播放条(thw-xmly-player)——当前音频/进度/倍速/循环/定时，播放态存 store，切 tab 不中断。
// 玩家＝纯听众（不开台不录书）。破限进 ordered_prompts[0]；注入走 inject-plan；设置 master-detail 局部刷新；全女性百合。
import { esc, escAttr, qs } from '../../lib/dom-utils';
import { openModal2 } from '../../status-bar-init';
import { phoneShellHtml, startPhoneClock } from '../../lib/world/phone-shell';
import { iconHtml } from '../../lib/icons';
import { registerWorldApp } from '../../lib/world/world-store';
import { registerAutoAgent, shouldAutoTrigger } from '../../lib/world/auto-registry';
import { listContactsForApp } from '../../lib/world/contacts';
import { chatGenerate, readTavernFloors, parseLooseJson, getTavernFloorCount } from '../../lib/world/ai-chat';
import { thToast, thConfirm, thPrompt } from '../../lib/world/ui-kit';
import { getPromptText, listPromptTemplates, isPromptOverridden, buildCatWbContext, setPromptOverride, resetPrompt } from '../../lib/world/world-prompts';
import { registerApiPlan, planCount, isFeatureOn } from '../../lib/world/api-plan';
import { registerInjectPlan, addToStash } from '../../lib/world/inject-plan';
import {
  bindWbSyncPanel, bindWbSyncPanelChange,
  apiPlanPanelHtml, bindApiPlanPanel, bindApiPlanPanelChange,
  injectPlanPanelHtml, bindInjectPlanPanel, bindInjectPlanPanelChange,
  aiPromptEditorHtml, bindAiPromptEditor,
  catWbBindHtml, bindCatWbHost,
  appMemPanelHtml, bindAppMemPanel,
  promptWbBindHtml, bindPromptWbHost,
  patchSettingsDetail,
} from './world-app-settings';
import { scaffoldNavHtml, normalizeScaffoldCats, type ScaffoldCatDef } from './settings-scaffold';
import { isWorldbookAvailable, buildInjectFromKeys } from '../../lib/world/worldbook';
import { wbPickerHtml, bindWbPicker } from '../../lib/world/wb-picker';
import { getWorldState } from '../../lib/world/world-state-store';
import '../../lib/world/xmly-prompts';   // 注册 xmly.* 提示词
import {
  getXmSettings, updateXmSettings, XmSettings,
  XM_CATS, XM_RANK_KINDS, getCategories, addCustomCat, deleteCustomCat, getCatPrompt, setCatPrompt,
  getAlbums, getAlbum, getEpisode, nextEpisodeOf, addAlbums, setAlbumEpisodes, setEpisodeContent, appendEpisodeContent, deleteAlbum, clearAiAlbums, XmAlbum, XmEpisode,
  getComments, addComments, likeComment, deleteComment, clearAiComments, XmComment,
  getLiveRooms, getRoom, addRooms, updateRoom, toggleRoomFollow, addRoomMsg, endRoom, deleteRoom, clearAiRooms, XmLiveRoom,
  getRank, upsertRank,
  getPlayer, setPlayer, playEpisode, togglePlay, XmPlayer,
  getUser, toggleSubscribe, toggleCollectAlbum, levelTitle, expToNext, addExp, setTasteTags, setSleepWith,
  getPlaylists, addPlaylist, removePlaylist,
  clearAll,
} from '../../lib/world/xmly-store';

const RID = 'th-xmly-root';
const XM_MODAL_MAXW = 'min(1120px,97vw)';
function rootEl(): HTMLElement | null { return qs<HTMLElement>('#' + RID); }

// ==================== 主题 / 字体 ====================
export const XM_THEMES = [
  { key: 'purple', name: '电台暖紫（默认）' },
  { key: 'night', name: '深夜墨紫' },
  { key: 'cyan', name: '声波青蓝' },
  { key: 'rose', name: '晚樱粉' },
  { key: 'jade', name: '青竹国风' },
  { key: 'amber', name: '暖橘电台' },
];
export const XM_FONTS = [
  { key: 'system', name: '系统默认' },
  { key: 'rounded', name: '圆润可爱' },
  { key: 'serif', name: '雅致宋体' },
];

// ==================== 视图状态 ====================
type Tab = 'recommend' | 'cats' | 'live' | 'mine';
type View =
  | { name: 'tab'; tab: Tab }
  | { name: 'album'; id: string }
  | { name: 'room'; id: string }
  | { name: 'settings' };
let _view: View = { name: 'tab', tab: 'recommend' };
let _cat = '';                 // 当前分类快筛（空=全部）
let _busy = false;
let _setCat = 'context';
let _promptEditId: string | null = null;
let _openEp: string | null = null;   // 当前展开「播讲正文」的单集 id
let _lastXmAuto = 20;                 // 记住上次的自动间隔，开关重开时复用
// PLACEHOLDER_XM_HELPERS
// ==================== 生态 / 世界信息 ====================
function xmJailbreak(): string { return (getPromptText('xmly.jailbreak') || '').trim(); }

function ecoDirective(): string {
  const s = getXmSettings();
  const lvl = (n: number, v0: string, v1: string, v2: string, v3: string, v4: string) =>
    n < 40 ? v0 : n < 80 ? v1 : n < 120 ? v2 : n < 160 ? v3 : v4;
  const lines = [
    `· 平台活跃度：${lvl(s.ecoActivity, '冷清，节目少、评论少、没什么人气', '正常，常见节目与听众都有', '热闹，上新与开台不少、评论活跃', '相当热闹，新节目频出、连麦点歌刷屏', '非常热闹：上新潮+连麦爆满+榜单频繁刷新')}`,
    `· 内容质量真实度：${lvl(s.ecoQuality, '清一色彩虹屁好评，几乎无差评（水军感）', '好评为主，偶有理性中评', '好评差评混杂、比较真实', '相当真实，弃坑/挑刺/理性差评不少', '极真实：翻车/弃坑/理性长评频出，口碑两极')}`,
    `· 顶流炒作度：${lvl(s.ecoHype, '朴实无顶流、数据平实', '偶有人气主播', '顶流主播常见、打赏榜活跃', '炒作浓：顶流扎堆、数据夸张、榜单打投激烈', '炒作爆表：处处顶流、播放量注水感、打投与真实落差大')}`,
    `· 塌房黑红度（声控瓜烈度 ⚠）：${lvl(s.ecoToxic, '零恶意，最多温和吐槽', '偶有避雷/弃坑提醒', '有塌房小瓜与开撕', '黑红明显：塌房瓜/人设崩/开撕帖常见', '黑红拉满：塌房大瓜、网暴对线激烈（仍锁虚构娱乐、幸福的烦恼级，不致郁）')}`,
    `· 色情度（露骨程度，作用于全 app 所有分类与内容——节目简介/声音标签/单集梗概/弹幕/主播口播皆吃此阀，儿歌/新闻等清水分类除外，不局限成人专区）：${lvl(s.ecoErotic, '整体清水，最多暧昧双关，不出露骨表述', '偶有情趣/暧昧向的节目与文案，含蓄点到', '情趣/声控福利向内容稳定存在，适度直白', '露骨内容活跃：声控福利/夜谈/双修引导与相关弹幕直白大胆', '露骨爆表：全分类可带情色浓度，成人专区尺度顶满（全女百合、虚构表演，且只以听感侧写不写视觉）')}`,
    `· 肉欲度（肉体诱惑表现，作用于全 app——主播声线的气息喘息、贴耳媚态、暧昧氛围统一吃此阀，只借声音侧写不写视觉，不局限某一类）：${lvl(s.ecoCarnal, '克制点到为止，声线少诱惑', '略带气息，偶有撩拨语气', '适度气息媚态，声线有撩拨', '肉欲张力强：喘息/贴耳/媚态语气浓墨重彩（纯听感）', '肉欲拉满：极致气息喘息与暧昧声线层层堆叠（纯听感、虚构表演）')}`,
    `· 主播/连麦主动撩你频率：${['几乎不主动撩你，保持节目本分', '偶尔顺势撩你一两句', '正常热络，来往有暧昧火花', '经常主动撩你、连麦黏人', '高频热烈地撩你，连麦满是暧昧勾引（尺度仍受上面色情/肉欲阀约束）'][Math.max(0, Math.min(4, (s.hostFlirt || 3) - 1))]}`,
  ];
  const tpl = getPromptText('xmly.frag.eco');
  return (tpl && tpl.indexOf('{{lines}}') >= 0) ? tpl.replace('{{lines}}', lines.join('\n')) : lines.join('\n');
}

// 世界信息块（最近正文 + 世界态当季/榜单，供生成对齐）
function worldBlock(extra?: string): string {
  const s = getXmSettings();
  const parts: string[] = [];
  if (s.useFloors && s.floorCount > 0) { try { const fl = readTavernFloors(s.floorCount); if (fl && fl.trim()) parts.push('【最近剧情】\n' + fl.trim()); } catch (e) { void e; } }
  try {
    const ws = getWorldState();
    if (ws.calendar && (ws.calendar.season || ws.calendar.festival)) parts.push(`【当季时令】${[ws.calendar.season, ws.calendar.festival].filter(Boolean).join('·')}${ws.calendar.daysToNext ? '（' + ws.calendar.daysToNext + '）' : ''}`);
    const seasonOn = ws.season.filter(x => x.status !== '已落幕').map(x => x.name);
    if (seasonOn.length) parts.push(`【当季大事】${seasonOn.join('、')}（可衍生节令特别节目/夜话主题）`);
    const rk = (ws.ranking?.entries || []).slice(0, 5).map(x => x.name).filter(Boolean);
    if (rk.length) parts.push(`【万花镜当红】${rk.join('、')}（声音榜/顶流主播可呼应）`);
  } catch (e) { void e; }
  if (extra && extra.trim()) parts.push(extra.trim());
  return parts.length ? parts.join('\n\n') : '（暂无额外世界信息，按本卡世界观与常识发挥）';
}

// 绑定世界书条目内容（作为设定来源）
async function boundWbText(): Promise<string> {
  const s = getXmSettings();
  if (!(s.worldbookEntryKeys || []).length) return '';   // 勾了条目就注入
  try { return await buildInjectFromKeys(s.worldbookEntryKeys); } catch (e) { void e; return ''; }
}
// 某分类的引导
function catGuide(cat: string): string {
  if (!cat) return '综合各分类，混出一条风格各异的听单流（有声书/广播剧/国风/电台/ASMR/知识/夜话等都可有）。';
  return getCatPrompt(cat) || `围绕「${cat}」分类出节目。`;
}
// 具名主播/听众池（读通讯录）
function castLine(): string {
  try {
    const cs = listContactsForApp('xmly');
    const names = cs.filter(c => !c.isUser).map(c => c.name).filter(Boolean).slice(0, 24);
    return names.length ? names.join('、') : '（通讯录为空，用贴合世界观的化名）';
  } catch (e) { void e; return '（用贴合世界观的化名）'; }
}
// 时长格式化 秒 → mm:ss / hh:mm:ss
function fmtDur(sec: number): string {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
function fmtPlays(n: number): string { return n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, '') + '万' : String(n); }
// 注入用的完整节目档案行（注入必带完整字段，避免正文 AI 瞎编）
function xmAlbumInjectLine(a: XmAlbum): string {
  const bits = [
    `《${a.title}》（${a.cat}${a.voiceTone ? '·' + a.voiceTone : ''}）`,
    `主播${a.host}`,
    a.updatedEp ? `更新至${a.updatedEp}集${a.finished ? '·完结' : '·连载中'}` : '',
    `▶${fmtPlays(a.plays)}播`,
    a.subs ? `${fmtPlays(a.subs)}订阅` : '',
    a.live ? '直播中' : '',
    a.intro ? `简介：${a.intro}` : '',
  ].filter(Boolean);
  return '· ' + bits.join('；');
}
// PLACEHOLDER_XM_GEN
// ==================== AI 生成 ====================
// 铺节目：mode 增量/覆盖。cat 空=综合。
async function aiPopulate(cat: string, mode: 'incremental' | 'overwrite'): Promise<void> {
  if (_busy) { thToast('正在生成，请稍候', 'warn'); return; }
  if (!isFeatureOn('xmly', 'populate')) { thToast('「铺节目」产出项已在设置·API利用里关闭', 'warn'); return; }
  if (mode === 'overwrite') {
    const ok = await thConfirm({ title: '覆盖刷新', message: `清掉${cat ? '「' + cat + '」' : ''}AI 铺的路人节目后重新铺一批？（保留你收藏/追更/绑定角色/直播中的）`, confirmText: '覆盖刷新', danger: true });
    if (!ok) return;
  }
  _busy = true; render();
  try {
    const count = planCount('xmly', 'albumCount') || 10;
    const catWb = cat ? await buildCatWbContext('xmly', cat) : (await boundWbText());
    const system = getPromptText('xmly.populate')
      .replace(/\{\{\s*worldBlock\s*\}\}/g, worldBlock())
      .replace(/\{\{\s*cat\s*\}\}/g, cat || '综合')
      .replace(/\{\{\s*catGuide\s*\}\}/g, catGuide(cat))
      .replace(/\{\{\s*catWb\s*\}\}/g, catWb || '（未绑定专属设定，按世界观常识发挥）')
      .replace(/\{\{\s*cast\s*\}\}/g, castLine())
      .replace(/\{\{\s*eco\s*\}\}/g, ecoDirective())
      .replace(/\{\{\s*count\s*\}\}/g, String(count));
    const raw = await chatGenerate({ system, user: `请刷新「${cat || '综合'}」的听单流，只输出 JSON 数组。`, aiPresetName: undefined, shouldStream: false, jailbreak: xmJailbreak(), appId: 'xmly' });
    const arr = parseLooseJson(raw);
    if (!Array.isArray(arr) || !arr.length) { thToast('没有生成有效节目', 'error'); return; }
    if (mode === 'overwrite') clearAiAlbums(cat || undefined);
    addAlbums(arr as Partial<XmAlbum>[], cat || (arr[0]?.cat || '有声书'), { isAi: true });
    thToast(`已铺 ${arr.length} 档节目`, 'success');
  } catch (err) { thToast('铺节目失败：' + (err instanceof Error ? err.message : String(err)), 'error'); }
  finally { _busy = false; render(); }
}

// 为某节目（重）生成/续更单集
async function aiEpisodes(albumId: string): Promise<void> {
  if (_busy) { thToast('正在生成，请稍候', 'warn'); return; }
  if (!isFeatureOn('xmly', 'episodes')) { thToast('「单集」产出项已在设置里关闭', 'warn'); return; }
  const a = getAlbum(albumId); if (!a) return;
  _busy = true; render();
  try {
    const count = planCount('xmly', 'episodeCount') || 12;
    const catWb = await buildCatWbContext('xmly', a.cat);
    const system = getPromptText('xmly.episodes')
      .replace(/\{\{\s*album\s*\}\}/g, `《${a.title}》（${a.cat}，主播${a.host}${a.voiceTone ? '，' + a.voiceTone : ''}${a.intro ? '，简介：' + a.intro : ''}）`)
      .replace(/\{\{\s*catWb\s*\}\}/g, catWb || '（无专属设定，按世界观发挥）')
      .replace(/\{\{\s*eco\s*\}\}/g, ecoDirective())
      .replace(/\{\{\s*count\s*\}\}/g, String(count));
    const raw = await chatGenerate({ system, user: `为《${a.title}》配 ${count} 集单集列表，只输出 JSON 数组。`, aiPresetName: undefined, shouldStream: false, jailbreak: xmJailbreak(), appId: 'xmly' });
    const arr = parseLooseJson(raw);
    if (!Array.isArray(arr) || !arr.length) { thToast('没有生成有效单集', 'error'); return; }
    setAlbumEpisodes(albumId, arr as Partial<XmEpisode>[]);
    thToast(`单集列表已更新（${arr.length} 集）`, 'success');
  } catch (err) { thToast('生成单集失败：' + (err instanceof Error ? err.message : String(err)), 'error'); }
  finally { _busy = false; render(); }
}

// 生成/续写某单集的「播讲正文」（酒馆用文字表现音频；mode 首播/续播，支持超长无限续写）
async function aiEpisodeContent(albumId: string, epId: string, mode: 'fresh' | 'continue'): Promise<void> {
  if (_busy) { thToast('正在生成，请稍候', 'warn'); return; }
  const a = getAlbum(albumId); const ep = a?.episodes.find(e => e.id === epId);
  if (!a || !ep) return;
  _busy = true; render();
  try {
    const catWb = await buildCatWbContext('xmly', a.cat);
    const prev = (mode === 'continue' && ep.content) ? ep.content : '';
    const words = mode === 'continue' ? '400~700' : '500~800';
    const system = getPromptText('xmly.epcontent')
      .replace(/\{\{\s*album\s*\}\}/g, `《${a.title}》（${a.cat}，主播${a.host}${a.voiceTone ? '，' + a.voiceTone : ''}${a.intro ? '，简介：' + a.intro : ''}）`)
      .replace(/\{\{\s*ep\s*\}\}/g, `第${ep.no}集「${ep.title}」${ep.synopsis ? '，梗概：' + ep.synopsis : ''}，时长约${fmtDur(ep.durationSec)}`)
      .replace(/\{\{\s*catWb\s*\}\}/g, catWb || '（无专属设定资料，按背景常识发挥）')
      .replace(/\{\{\s*prev\s*\}\}/g, prev ? prev.slice(-1600) : '（无，从本集开头播起）')
      .replace(/\{\{\s*mode\s*\}\}/g, mode === 'continue' ? '续播（接着上面已播的往下）' : '首播（从本集开头写起）')
      .replace(/\{\{\s*eco\s*\}\}/g, ecoDirective())
      .replace(/\{\{\s*words\s*\}\}/g, words);
    const raw = await chatGenerate({ system, user: `${mode === 'continue' ? '接着往下播' : '开始播'}《${a.title}》第${ep.no}集，只输出播讲正文。`, aiPresetName: undefined, shouldStream: false, jailbreak: xmJailbreak(), appId: 'xmly' });
    let text = (raw || '').trim();
    if (!text) { thToast('没有生成内容', 'error'); return; }
    const complete = /\[本集完\]\s*$/.test(text);
    if (complete) text = text.replace(/\s*\[本集完\]\s*$/, '');
    if (mode === 'continue') appendEpisodeContent(albumId, epId, text, complete);
    else setEpisodeContent(albumId, epId, text, complete);
    thToast(complete ? '本集已播完' : (mode === 'continue' ? '续播了一段' : '开始播了，可继续续播'), 'success');
  } catch (err) { thToast('生成播讲正文失败：' + (err instanceof Error ? err.message : String(err)), 'error'); }
  finally { _busy = false; render(); }
}

// 为某节目生成声控弹幕/评论：mode 覆盖/增量
async function aiComments(albumId: string, mode: 'incremental' | 'overwrite'): Promise<void> {
  if (_busy) { thToast('正在生成，请稍候', 'warn'); return; }
  if (!isFeatureOn('xmly', 'comment')) { thToast('「弹幕评论」产出项已在设置里关闭', 'warn'); return; }
  const a = getAlbum(albumId); if (!a) return;
  _busy = true; render();
  try {
    const count = planCount('xmly', 'commentCount') || 10;
    const system = getPromptText('xmly.comments')
      .replace(/\{\{\s*album\s*\}\}/g, `《${a.title}》（${a.cat}，主播${a.host}${a.voiceTone ? '，' + a.voiceTone : ''}）`)
      .replace(/\{\{\s*cast\s*\}\}/g, castLine())
      .replace(/\{\{\s*eco\s*\}\}/g, ecoDirective())
      .replace(/\{\{\s*count\s*\}\}/g, String(count));
    const raw = await chatGenerate({ system, user: `为《${a.title}》生成 ${count} 条声控弹幕评论，只输出 JSON 数组。`, aiPresetName: undefined, shouldStream: false, jailbreak: xmJailbreak(), appId: 'xmly' });
    const arr = parseLooseJson(raw);
    if (!Array.isArray(arr) || !arr.length) { thToast('没有生成有效弹幕', 'error'); return; }
    if (mode === 'overwrite') clearAiComments(albumId);
    addComments(albumId, arr as Partial<XmComment>[], { isAi: true });
    thToast(`已生成 ${arr.length} 条`, 'success');
  } catch (err) { thToast('生成弹幕失败：' + (err instanceof Error ? err.message : String(err)), 'error'); }
  finally { _busy = false; render(); }
}
// PLACEHOLDER_XM_GEN_2
// 开一批电台
async function aiLiveRooms(mode: 'incremental' | 'overwrite'): Promise<void> {
  if (_busy) { thToast('正在生成，请稍候', 'warn'); return; }
  if (!isFeatureOn('xmly', 'live')) { thToast('「电台」产出项已在设置里关闭', 'warn'); return; }
  if (mode === 'overwrite') {
    const ok = await thConfirm({ title: '覆盖刷新', message: '清掉 AI 铺的路人电台后重开一批？（保留已关注的）', confirmText: '覆盖刷新', danger: true });
    if (!ok) return;
  }
  _busy = true; render();
  try {
    const count = Math.max(4, Math.min(10, planCount('xmly', 'albumCount') || 8));
    const system = getPromptText('xmly.live')
      .replace(/\{\{\s*mode\s*\}\}/g, 'open')
      .replace(/\{\{\s*room\s*\}\}/g, '（无）')
      .replace(/\{\{\s*input\s*\}\}/g, '（无）')
      .replace(/\{\{\s*cast\s*\}\}/g, castLine())
      .replace(/\{\{\s*worldBlock\s*\}\}/g, worldBlock())
      .replace(/\{\{\s*eco\s*\}\}/g, ecoDirective())
      .replace(/\{\{\s*count\s*\}\}/g, String(count));
    const raw = await chatGenerate({ system, user: `开 ${count} 间正在直播的声音电台，只输出 JSON 数组。`, aiPresetName: undefined, shouldStream: false, jailbreak: xmJailbreak(), appId: 'xmly' });
    const arr = parseLooseJson(raw);
    if (!Array.isArray(arr) || !arr.length) { thToast('没有生成有效电台', 'error'); return; }
    if (mode === 'overwrite') clearAiRooms();
    addRooms(arr as Partial<XmLiveRoom>[], { isAi: true });
    thToast(`已开 ${arr.length} 间电台`, 'success');
  } catch (err) { thToast('开电台失败：' + (err instanceof Error ? err.message : String(err)), 'error'); }
  finally { _busy = false; render(); }
}

// 推进某电台互动（听众弹幕 + 主播口播 + 连麦/点歌）；input 为玩家连麦/点歌/弹幕
async function aiLiveInteract(roomId: string, input?: string): Promise<void> {
  if (_busy) { thToast('正在生成，请稍候', 'warn'); return; }
  const r = getRoom(roomId); if (!r || r.ended) return;
  _busy = true; render();
  try {
    const count = 4;
    const recent = r.msgs.slice(-8).map(m => `${m.author}：${m.content}`).join('\n') || '（刚开播）';
    const system = getPromptText('xmly.live')
      .replace(/\{\{\s*mode\s*\}\}/g, 'interact')
      .replace(/\{\{\s*room\s*\}\}/g, `${r.host} 的电台《${r.topic}》（${r.cat}${r.voiceTone ? '·' + r.voiceTone : ''}，在线${r.listeners}）\n最近互动：\n${recent}`)
      .replace(/\{\{\s*input\s*\}\}/g, input && input.trim() ? input.trim() : '（玩家未发言，让节目自然推进）')
      .replace(/\{\{\s*cast\s*\}\}/g, castLine())
      .replace(/\{\{\s*worldBlock\s*\}\}/g, worldBlock())
      .replace(/\{\{\s*eco\s*\}\}/g, ecoDirective())
      .replace(/\{\{\s*count\s*\}\}/g, String(count));
    const raw = await chatGenerate({ system, user: `推进这间电台，生成 ${count} 条互动，只输出 JSON 数组。`, aiPresetName: undefined, shouldStream: false, jailbreak: xmJailbreak(), appId: 'xmly' });
    const arr = parseLooseJson(raw);
    if (!Array.isArray(arr) || !arr.length) { thToast('主播没有回应', 'warn'); return; }
    (arr as any[]).forEach(m => addRoomMsg(roomId, { kind: (['danmu', 'host', 'call', 'gift', 'song', 'enter'].includes(m.kind) ? m.kind : 'danmu') as any, author: m.author || '听友', authorRef: m.authorRef, content: m.content || '', isAi: true }));
    thToast('电台更新了', 'success');
  } catch (err) { thToast('互动失败：' + (err instanceof Error ? err.message : String(err)), 'error'); }
  finally { _busy = false; render(); }
}

// 生成/刷新某声音榜
async function aiRank(kindId: string): Promise<void> {
  if (_busy) { thToast('正在生成，请稍候', 'warn'); return; }
  if (!isFeatureOn('xmly', 'rank')) { thToast('「声音榜」产出项已在设置里关闭', 'warn'); return; }
  const meta = XM_RANK_KINDS.find(k => k.id === kindId); if (!meta) return;
  const albums = getAlbums();
  if (albums.length < 3) { thToast('节目太少，先去「推荐」刷几档再评榜', 'warn'); return; }
  _busy = true; render();
  try {
    const lines = albums.slice(0, 30).map(a => `《${a.title}》｜${a.cat}｜主播${a.host}｜▶${fmtPlays(a.plays)}｜${fmtPlays(a.subs)}订`).join('\n');
    const count = Math.min(10, Math.max(5, Math.floor(albums.length / 2)));
    const system = getPromptText('xmly.rank')
      .replace(/\{\{\s*rankTitle\s*\}\}/g, meta.title)
      .replace(/\{\{\s*albums\s*\}\}/g, lines)
      .replace(/\{\{\s*worldBlock\s*\}\}/g, worldBlock())
      .replace(/\{\{\s*count\s*\}\}/g, String(count));
    const raw = await chatGenerate({ system, user: `评出「${meta.title}」，只输出 JSON 对象。`, aiPresetName: undefined, shouldStream: false, jailbreak: xmJailbreak(), appId: 'xmly' });
    const obj = parseLooseJson(raw);
    const entries = Array.isArray(obj?.entries) ? obj.entries : [];
    if (!entries.length) { thToast('没有生成有效榜单', 'error'); return; }
    const mapped = entries.map((e: any) => {
      const hit = albums.find(a => a.title === e.name || a.host === e.name) || albums.find(a => (e.name || '').includes(a.title));
      return { name: e.name || hit?.title || '', reason: e.reason || '', albumId: hit?.id };
    }).filter((e: any) => e.name);
    upsertRank(kindId, meta.title, mapped, obj?.note);
    thToast(`已更新「${meta.title}」`, 'success');
  } catch (err) { thToast('生成榜单失败：' + (err instanceof Error ? err.message : String(err)), 'error'); }
  finally { _busy = false; render(); }
}

// 沉浸播放稿（哄睡/ASMR/引导/夜话）——生成后加入注入暂存夹 + 弹出预览
async function aiImmersive(albumId: string, scene: string): Promise<void> {
  if (_busy) { thToast('正在生成，请稍候', 'warn'); return; }
  const a = getAlbum(albumId); if (!a) return;
  _busy = true; render();
  try {
    const system = getPromptText('xmly.asmr')
      .replace(/\{\{\s*album\s*\}\}/g, `《${a.title}》（${a.cat}，主播${a.host}${a.voiceTone ? '，' + a.voiceTone : ''}）`)
      .replace(/\{\{\s*scene\s*\}\}/g, scene)
      .replace(/\{\{\s*worldBlock\s*\}\}/g, worldBlock())
      .replace(/\{\{\s*eco\s*\}\}/g, ecoDirective());
    const raw = await chatGenerate({ system, user: `生成一段《${a.title}》的${scene}播放稿，只输出正文。`, aiPresetName: undefined, shouldStream: false, jailbreak: xmJailbreak(), appId: 'xmly' });
    const text = (raw || '').trim();
    if (!text) { thToast('没有生成内容', 'error'); return; }
    addToStash('xmly', `${scene}·${a.host}《${a.title}》`, text);
    await thConfirm({ title: `${scene}·正在播放`, message: text, confirmText: '好', cancelText: '' });
    thToast('这段声音已加入注入暂存夹', 'success');
  } catch (err) { thToast('生成失败：' + (err instanceof Error ? err.message : String(err)), 'error'); }
  finally { _busy = false; render(); }
}

// PLACEHOLDER_XM_VIEWS
// ==================== 视图 HTML ====================
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'recommend', icon: 'fa-headphones', label: '推荐' },
  { id: 'cats', icon: 'fa-list-music', label: '分类' },
  { id: 'live', icon: 'fa-tower-broadcast', label: '直播电台' },
  { id: 'mine', icon: 'fa-user', label: '我听的' },
];
function curTab(): Tab | '' { return _view.name === 'tab' ? _view.tab : ''; }

function sidebarHtml(): string {
  const u = getUser();
  const player = getPlayer();
  const nowAlbum = player.albumId ? getAlbum(player.albumId) : undefined;
  const nowEp = (player.albumId && player.epId) ? getEpisode(player.albumId, player.epId) : undefined;
  const beat = nowAlbum
    ? `${iconHtml('fa-headphones')} 在听:《${esc(nowAlbum.title.slice(0, 10))}》${nowEp ? 'Ep.' + nowEp.no : ''}`
    : `${iconHtml('fa-clock')} 今日已听 ${Math.round(u.listenSec / 60)} 分钟`;
  const liveN = getLiveRooms().length;
  const subUpdN = u.subscriptions.length;
  const navBtn = (tab: Tab, icon: string, label: string, badge?: string, live = false) => {
    const on = curTab() === tab;
    return `<button class="thw-xmly-nav${on ? ' on' : ''}" data-xm-tab="${tab}" type="button"><span class="thw-xmly-nav-ico">${iconHtml(icon)}</span><span class="thw-xmly-nav-lbl">${esc(label)}</span>${live ? '<span class="thw-xmly-live-dot"></span>' : ''}${badge ? `<span class="thw-xmly-nav-badge">${badge}</span>` : ''}</button>`;
  };
  const setOn = _view.name === 'settings';
  return `<aside class="thw-sidebar thw-xmly-side">
    <div class="thw-xmly-brand">${iconHtml('fa-headphones')} <b>喜马</b></div>
    <div class="thw-xmly-beat">${beat}</div>
    <div class="thw-xmly-navsec">逛</div>
    <nav class="thw-xmly-navs">
      ${navBtn('recommend', 'fa-headphones', '推荐')}
      ${navBtn('cats', 'fa-list-music', '分类')}
      ${navBtn('live', 'fa-tower-broadcast', '直播电台', liveN ? String(liveN) : '', liveN > 0)}
    </nav>
    <div class="thw-xmly-navsec">我的</div>
    <nav class="thw-xmly-navs">
      ${navBtn('mine', 'fa-rss', '我听的', subUpdN ? String(subUpdN) : '')}
    </nav>
    <span class="thw-xmly-side-grow"></span>
    <button class="thw-xmly-nav thw-xmly-nav-set${setOn ? ' on' : ''}" data-xm-settings type="button"><span class="thw-xmly-nav-ico">${iconHtml('fa-gear')}</span><span class="thw-xmly-nav-lbl">设置</span></button>
  </aside>`;
}

// 专辑卡（中列瀑布流）
function albumCardHtml(a: XmAlbum): string {
  const sel = _view.name === 'album' && _view.id === a.id;
  const badges = [
    a.live ? `<span class="thw-xmly-badge live">${iconHtml('fa-tower-broadcast')}直播</span>` : '',
    a.finished ? `<span class="thw-xmly-badge fin">完结</span>` : '',
    a.isAdult ? `<span class="thw-xmly-badge adult">18+</span>` : '',
    a.subscribed ? `<span class="thw-xmly-badge sub">${iconHtml('fa-rss')}追更</span>` : '',
  ].filter(Boolean).join('');
  return `<button class="thw-xmly-acard${sel ? ' on' : ''}" data-xm-album="${esc(a.id)}" type="button">
    <div class="thw-xmly-acard-cover">${iconHtml('fa-compact-disc')}${a.coverDesc ? `<span class="thw-xmly-cover-desc">${esc(a.coverDesc)}</span>` : ''}<span class="thw-xmly-acard-play">${iconHtml('fa-circle-play')}</span></div>
    <div class="thw-xmly-acard-body">
      <div class="thw-xmly-acard-top"><span class="thw-xmly-acard-name">${esc(a.title)}</span>${badges}</div>
      <div class="thw-xmly-acard-host">${iconHtml('fa-microphone')} ${esc(a.host)}${a.voiceTone ? ` · <span class="thw-xmly-tone">${esc(a.voiceTone)}</span>` : ''}</div>
      <div class="thw-xmly-acard-meta">${esc(a.cat)}${a.updatedEp ? ` · 更新至 ${a.updatedEp} 集` : ''} · ▶${fmtPlays(a.plays)}</div>
      ${a.intro ? `<div class="thw-xmly-acard-intro">${esc(a.intro)}</div>` : ''}
    </div>
  </button>`;
}
// PLACEHOLDER_XM_VIEWS_2
// 中列顶栏：分类快筛(中间上方) + 覆盖/增量刷新
function tabTopbar(tab: Tab, showCatStrip: boolean): string {
  const title = TABS.find(t => t.id === tab)?.label || '';
  let ops = '';
  if (tab === 'recommend' || tab === 'cats') {
    ops = `<button class="thw-btn thw-btn-mini" data-xm-refresh type="button" ${_busy ? 'disabled' : ''} title="增量铺一批新节目${_cat ? '（' + _cat + '）' : ''}">${_busy ? iconHtml('fa-spinner') : iconHtml('fa-rotate')} 刷新${_cat ? esc(_cat) : ''}</button>
      <button class="thw-btn thw-btn-mini" data-xm-refresh-ow type="button" ${_busy ? 'disabled' : ''} title="清路人节目后重铺（保留收藏/追更/角色/直播的）">${iconHtml('fa-eraser')} 覆盖刷新</button>`;
  } else if (tab === 'live') {
    ops = `<button class="thw-btn thw-btn-mini" data-xm-live-refresh type="button" ${_busy ? 'disabled' : ''} title="开一批正在直播的声音电台">${_busy ? iconHtml('fa-spinner') : iconHtml('fa-rotate')} 开台刷新</button>
      <button class="thw-btn thw-btn-mini" data-xm-live-refresh-ow type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-eraser')} 覆盖</button>`;
  }
  const catStrip = showCatStrip ? (() => {
    const cats = getCategories();
    const chips = `<button class="thw-xmly-catchip${_cat === '' ? ' on' : ''}" data-xm-cat="" type="button">全部</button>` +
      cats.map(c => `<button class="thw-xmly-catchip${_cat === c.name ? ' on' : ''}${(c as any).adult ? ' adult' : ''}" data-xm-cat="${escAttr(c.name)}" type="button">${iconHtml(c.icon)} ${esc(c.name)}</button>`).join('');
    return `<div class="thw-xmly-catstrip">${chips}</div>`;
  })() : '';
  return `<div class="thw-topbar">
    <span class="thw-topbar-title">${iconHtml(TABS.find(t => t.id === tab)?.icon || 'fa-headphones')} ${esc(title)}${_cat && showCatStrip ? ` · ${esc(_cat)}` : ''}</span>
    <span class="thw-topbar-spacer"></span>${ops}
  </div>${catStrip}`;
}

function recommendTabHtml(): string {
  const list = getAlbums(_cat || undefined);
  const cards = list.length ? list.map(albumCardHtml).join('')
    : `<div class="thw-empty"><div class="thw-empty-t">${_cat ? '「' + esc(_cat) + '」还没有节目' : '还没有声音节目'}</div><div class="thw-empty-d">点右上「刷新${_cat ? esc(_cat) : ''}」让主播们上架有声书、开电台，把听单养起来。</div></div>`;
  return `<div class="thw-content thw-xmly-content">${tabTopbar('recommend', true)}<div class="thw-content-pad thw-xmly-feed">${cards}</div></div>`;
}

// 分类 tab：按分类聚合，每类一栏横滑
function catsTabHtml(): string {
  const cats = getCategories();
  const all = getAlbums();
  if (_cat) {
    // 选中某类 → 复用推荐流布局
    const list = all.filter(a => a.cat === _cat);
    const cards = list.length ? list.map(albumCardHtml).join('')
      : `<div class="thw-empty"><div class="thw-empty-t">「${esc(_cat)}」还没有节目</div><div class="thw-empty-d">点右上「刷新${esc(_cat)}」铺这一类。</div></div>`;
    return `<div class="thw-content thw-xmly-content">${tabTopbar('cats', true)}<div class="thw-content-pad thw-xmly-feed">${cards}</div></div>`;
  }
  const blocks = cats.map(c => {
    const list = all.filter(a => a.cat === c.name).slice(0, 8);
    if (!list.length) return '';
    const cards = list.map(a => `<button class="thw-xmly-hcard" data-xm-album="${esc(a.id)}" type="button">
      <div class="thw-xmly-hcard-cover">${iconHtml('fa-compact-disc')}${a.isAdult ? '<span class="thw-xmly-badge adult">18+</span>' : ''}</div>
      <div class="thw-xmly-hcard-name">${esc(a.title)}</div>
      <div class="thw-xmly-hcard-host">${esc(a.host)}</div>
    </button>`).join('');
    return `<div class="thw-xmly-catsec"><div class="thw-xmly-catsec-h"><span class="thw-xmly-catsec-t">${iconHtml(c.icon)} ${esc(c.name)}${(c as any).adult ? ' <em class="thw-xmly-adulttag">成人专区</em>' : ''}</span><button class="thw-xmly-catsec-more" data-xm-cat="${escAttr(c.name)}" type="button">全部 ${iconHtml('fa-chevron-right')}</button></div><div class="thw-xmly-hscroll">${cards}</div></div>`;
  }).filter(Boolean).join('');
  const body = blocks || `<div class="thw-empty"><div class="thw-empty-t">分类里还没有节目</div><div class="thw-empty-d">去「推荐」刷新，或点某个分类单独铺。</div></div>`;
  return `<div class="thw-content thw-xmly-content">${tabTopbar('cats', true)}<div class="thw-content-pad thw-xmly-cats">${body}</div></div>`;
}

// 直播电台 tab
function liveTabHtml(): string {
  const rooms = getLiveRooms();
  const cards = rooms.length ? rooms.map(r => {
    const sel = _view.name === 'room' && _view.id === r.id;
    return `<button class="thw-xmly-lcard${sel ? ' on' : ''}" data-xm-room="${esc(r.id)}" type="button">
      <div class="thw-xmly-lcard-wave">${iconHtml('fa-tower-broadcast')}<span class="thw-xmly-onair">ON AIR</span></div>
      <div class="thw-xmly-lcard-body">
        <div class="thw-xmly-lcard-top"><span class="thw-xmly-lcard-topic">${esc(r.topic)}</span>${r.isAdult ? '<span class="thw-xmly-badge adult">18+</span>' : ''}</div>
        <div class="thw-xmly-lcard-host">${iconHtml('fa-microphone')} ${esc(r.host)}${r.voiceTone ? ` · ${esc(r.voiceTone)}` : ''}</div>
        <div class="thw-xmly-lcard-meta">${esc(r.cat)} · ${iconHtml('fa-ear-listen')} ${fmtPlays(r.listeners)}人在听${r.nowSong ? ` · ♪ ${esc(r.nowSong)}` : ''}</div>
        ${r.notice ? `<div class="thw-xmly-lcard-notice">${esc(r.notice)}</div>` : ''}
      </div>
    </button>`;
  }).join('') : `<div class="thw-empty"><div class="thw-empty-t">此刻没有电台开播</div><div class="thw-empty-d">点右上「开台刷新」，让主播们上线开深夜电台/点歌台/情感热线。</div></div>`;
  return `<div class="thw-content thw-xmly-content">${tabTopbar('live', false)}<div class="thw-content-pad thw-xmly-lives">${cards}</div></div>`;
}
// PLACEHOLDER_XM_VIEWS_3
// 「我听的」tab：收听成长看板 + 追更 + 收藏 + 播放历史 + 声音歌单
function mineTabHtml(): string {
  const u = getUser();
  const prog = expToNext(u.exp);
  const hrs = (u.listenSec / 3600);
  const badges = u.badges.length ? u.badges.map(b => `<span class="thw-xmly-badge2">${iconHtml('fa-medal')} ${esc(b)}</span>`).join('') : '<span class="thw-xmly-dim">多听多追更，解锁勋章</span>';
  const tasteTags = u.tasteTags.length ? u.tasteTags.map(t => `<span class="thw-xmly-taste">${esc(t)}</span>`).join('') : '<span class="thw-xmly-dim">听多了会长出声音口味画像</span>';
  const subs = u.subscriptions.map(id => getAlbum(id)).filter(Boolean) as XmAlbum[];
  const collects = u.collects.map(id => getAlbum(id)).filter(Boolean) as XmAlbum[];
  const albMini = (a: XmAlbum) => `<button class="thw-xmly-mini-alb" data-xm-album="${esc(a.id)}" type="button">${iconHtml('fa-compact-disc')} ${esc(a.title)} <small>${esc(a.host)}</small></button>`;
  const history = u.history.slice(0, 20).map(h => `<div class="thw-xmly-hist"><span class="thw-xmly-hist-dot"></span><div><b>${esc(h.albumTitle)}</b>${h.epTitle ? ` — ${esc(h.epTitle)}` : ''}<small>${new Date(h.ts).toLocaleString()}</small></div></div>`).join('') || '<div class="thw-xmly-dim">还没有收听记录，去听一集吧</div>';
  const playlists = getPlaylists();
  const plList = playlists.length ? playlists.map(p => `<div class="thw-xmly-pl"><div class="thw-xmly-pl-mid"><b>${iconHtml('fa-list-music')} ${esc(p.name)}</b><small>${p.epRefs.length} 首</small></div><button class="thw-iconbtn" data-xm-pl-del="${esc(p.id)}" type="button">${iconHtml('fa-xmark')}</button></div>`).join('') : '<div class="thw-xmly-dim">还没有歌单，建一个「睡前歌单」吧</div>';
  const sleepLine = u.lastSleepWith ? `<div class="thw-xmly-sleepwith">${iconHtml('fa-bed')} 昨晚你听着 <b>${esc(u.lastSleepWith)}</b> 的声音睡着了</div>` : '';
  return `<div class="thw-content thw-xmly-content">
    <div class="thw-topbar"><span class="thw-topbar-title">${iconHtml('fa-rss')} 我听的</span></div>
    <div class="thw-content-pad thw-xmly-mine">
      <div class="thw-xmly-lvcard">
        <div class="thw-xmly-lv-top"><span class="thw-xmly-lv-title">${iconHtml('fa-headphones')} Lv.${u.level} ${esc(levelTitle(u.level))}</span><span class="thw-xmly-lv-exp">${prog.cur}/${prog.need}</span></div>
        <div class="thw-xmly-lv-bar"><span style="width:${prog.pct}%"></span></div>
        <div class="thw-xmly-lv-stat">累计收听 ${hrs.toFixed(1)} 小时 · 追更 ${subs.length} · 收藏 ${collects.length}</div>
      </div>
      ${sleepLine}
      <div class="thw-xmly-mine-sec">${iconHtml('fa-medal')} 收听勋章</div>
      <div class="thw-xmly-badges">${badges}</div>
      <div class="thw-xmly-mine-sec">${iconHtml('fa-heart')} 声音口味 <button class="thw-btn thw-btn-mini" data-xm-taste-edit type="button">${iconHtml('fa-pen')} 编辑</button></div>
      <div class="thw-xmly-tastes">${tasteTags}</div>
      <div class="thw-xmly-mine-sec">${iconHtml('fa-rss')} 追更中 (${subs.length})</div>
      <div class="thw-xmly-mini-albs">${subs.length ? subs.map(albMini).join('') : '<span class="thw-xmly-dim">还没追更的节目</span>'}</div>
      <div class="thw-xmly-mine-sec">${iconHtml('fa-bookmark')} 收藏 (${collects.length})</div>
      <div class="thw-xmly-mini-albs">${collects.length ? collects.map(albMini).join('') : '<span class="thw-xmly-dim">还没收藏</span>'}</div>
      <div class="thw-xmly-mine-sec">${iconHtml('fa-list-music')} 声音歌单 <button class="thw-btn thw-btn-mini" data-xm-pl-new type="button">${iconHtml('fa-plus')} 新建</button></div>
      <div class="thw-xmly-pls">${plList}</div>
      <div class="thw-xmly-mine-sec">${iconHtml('fa-clock')} 播放历史</div>
      <div class="thw-xmly-hists">${history}</div>
    </div>
  </div>`;
}

// ==================== 底部常驻播放条 ====================
function playerBarHtml(): string {
  const p = getPlayer();
  const a = p.albumId ? getAlbum(p.albumId) : undefined;
  const ep = (p.albumId && p.epId) ? getEpisode(p.albumId, p.epId) : undefined;
  if (!a || !ep) {
    return `<div class="thw-xmly-player empty"><span class="thw-xmly-player-empty">${iconHtml('fa-headphones')} 还没在听——挑一集，开始闭眼听</span></div>`;
  }
  const dur = ep.durationSec || 1;
  const pct = Math.min(100, Math.round((p.positionSec / dur) * 100));
  const loopIcon = p.loop === 'one' ? 'fa-repeat' : p.loop === 'list' ? 'fa-list-music' : 'fa-repeat';
  const loopTitle = p.loop === 'one' ? '单集循环' : p.loop === 'list' ? '列表循环' : '不循环';
  return `<div class="thw-xmly-player">
    <div class="thw-xmly-player-cover">${iconHtml('fa-compact-disc')}</div>
    <div class="thw-xmly-player-mid">
      <div class="thw-xmly-player-top"><span class="thw-xmly-player-title">${esc(a.title)} · ${esc(ep.title)}</span><span class="thw-xmly-player-host">${esc(a.host)}</span></div>
      <div class="thw-xmly-player-bar" data-xm-seek title="点击跳转进度"><span class="thw-xmly-player-fill" style="width:${pct}%"></span></div>
      <div class="thw-xmly-player-time"><span>${fmtDur(p.positionSec)}</span><span class="thw-xmly-wave${p.playing ? ' on' : ''}">${iconHtml('fa-waveform')}</span><span>${fmtDur(dur)}</span></div>
    </div>
    <div class="thw-xmly-player-ctrls">
      <button class="thw-xmly-pctrl" data-xm-prev type="button" title="上一首">${iconHtml('fa-backward-step')}</button>
      <button class="thw-xmly-pctrl big" data-xm-toggle type="button" title="${p.playing ? '暂停' : '播放'}">${iconHtml(p.playing ? 'fa-circle-pause' : 'fa-circle-play')}</button>
      <button class="thw-xmly-pctrl" data-xm-next type="button" title="下一首">${iconHtml('fa-forward-step')}</button>
      <button class="thw-xmly-pctrl rate" data-xm-rate type="button" title="倍速">${p.rate}×</button>
      <button class="thw-xmly-pctrl${p.loop !== 'none' ? ' on' : ''}" data-xm-loop type="button" title="${loopTitle}">${iconHtml(loopIcon)}</button>
      <button class="thw-xmly-pctrl${p.sleepTimerMin ? ' on' : ''}" data-xm-sleep type="button" title="定时关闭">${iconHtml('fa-moon')}${p.sleepTimerMin ? `<span class="thw-xmly-sleep-min">${p.sleepTimerMin}</span>` : ''}</button>
    </div>
  </div>`;
}
// PLACEHOLDER_XM_DETAIL
// 右列：专辑详情
function commentCardHtml(c: XmComment): string {
  return `<div class="thw-xmly-cm${c.isDanmu ? ' danmu' : ''}">
    <div class="thw-xmly-cm-head"><span class="thw-xmly-cm-author">${esc(c.author)}</span>${c.isDanmu ? '<span class="thw-xmly-cm-tag">弹幕</span>' : ''}</div>
    <div class="thw-xmly-cm-body">${esc(c.content).replace(/\n/g, '<br>')}</div>
    <div class="thw-xmly-cm-ops"><button class="thw-xmly-cm-like" data-xm-cm-like="${esc(c.id)}" type="button">${iconHtml('fa-heart')} ${c.likes}</button><button class="thw-xmly-cm-del" data-xm-cm-del="${esc(c.id)}" type="button">${iconHtml('fa-trash')}</button></div>
  </div>`;
}
function epRowHtml(a: XmAlbum, ep: XmEpisode): string {
  const p = getPlayer();
  const playing = p.albumId === a.id && p.epId === ep.id;
  const played = ep.playedSec && ep.durationSec ? Math.round((ep.playedSec / ep.durationSec) * 100) : 0;
  const expanded = _openEp === ep.id;
  const hasContent = !!(ep.content && ep.content.trim());
  const row = `<button class="thw-xmly-eprow${playing ? ' playing' : ''}${expanded ? ' expanded' : ''}" data-xm-play="${esc(a.id)}|${esc(ep.id)}" type="button">
    <span class="thw-xmly-ep-no">${playing && p.playing ? iconHtml('fa-circle-pause') : iconHtml('fa-circle-play')}</span>
    <span class="thw-xmly-ep-mid"><span class="thw-xmly-ep-title">${ep.no}. ${esc(ep.title)}${ep.hot ? ' <span class="thw-xmly-ep-hot">🔥</span>' : ''}${hasContent ? ` <span class="thw-xmly-ep-hastext" title="已有播讲正文">${iconHtml('fa-align-left')}</span>` : ''}</span>${ep.synopsis ? `<span class="thw-xmly-ep-syn">${esc(ep.synopsis)}</span>` : ''}</span>
    <span class="thw-xmly-ep-dur">${fmtDur(ep.durationSec)}${played > 0 && played < 100 ? `<small>听过${played}%</small>` : ''}</span>
    <span class="thw-xmly-ep-fold" data-xm-ep-toggle="${esc(ep.id)}" title="展开听正文">${iconHtml(expanded ? 'fa-chevron-up' : 'fa-chevron-down')}</span>
  </button>`;
  if (!expanded) return row;
  // 展开：播讲正文阅读面板（酒馆用文字表现音频）
  const done = ep.contentComplete;
  const bodyHtml = hasContent
    ? `<div class="thw-xmly-eptext">${esc(ep.content!).replace(/\n/g, '<br>')}</div>${done ? '<div class="thw-xmly-eptext-end">— 本集完 —</div>' : ''}`
    : `<div class="thw-xmly-dim" style="padding:6px 2px">这一集还没开始播。点「开始播」，AI 会把这一集的声音用文字播出来（超长内容可一直续播下去）。</div>`;
  const ops = !hasContent
    ? `<button class="thw-btn-primary thw-btn-mini" data-xm-epgen="${esc(a.id)}|${esc(ep.id)}" type="button" ${_busy ? 'disabled' : ''}>${_busy ? iconHtml('fa-spinner') : iconHtml('fa-wand-magic-sparkles')} 开始播</button>`
    : `${done ? '' : `<button class="thw-btn-primary thw-btn-mini" data-xm-epmore="${esc(a.id)}|${esc(ep.id)}" type="button" ${_busy ? 'disabled' : ''}>${_busy ? iconHtml('fa-spinner') : iconHtml('fa-forward-step')} 继续播（续写）</button>`}
       <button class="thw-btn thw-btn-mini" data-xm-epredo="${esc(a.id)}|${esc(ep.id)}" type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-rotate')} 重播</button>
       <button class="thw-btn thw-btn-mini" data-xm-epinject="${esc(a.id)}|${esc(ep.id)}" type="button" title="把这段播讲加入注入暂存夹">${iconHtml('fa-syringe')} 加注入</button>`;
  return row + `<div class="thw-xmly-eppanel"><div class="thw-xmly-eppanel-scroll">${bodyHtml}</div><div class="thw-xmly-eppanel-ops">${ops}</div></div>`;
}
function albumDetailHtml(id: string): string {
  const a = getAlbum(id);
  if (!a) return `<div class="thw-inspector thw-xmly-inspector"><div class="thw-inspector-empty">${iconHtml('fa-compact-disc')}<div>节目不存在</div></div></div>`;
  const comments = getComments(id);
  const eps = a.episodes.length ? a.episodes.map(ep => epRowHtml(a, ep)).join('') : `<div class="thw-xmly-dim">还没有单集，点下方「AI 排单集」。</div>`;
  const cmBody = comments.length ? comments.map(commentCardHtml).join('') : `<div class="thw-xmly-dim" style="padding:8px">还没有弹幕评论，点「生成」让听众来夸声音。</div>`;
  const isImmersive = ['ASMR助眠', '白噪陪睡', '修真引导音', '情感夜话', '夜谈私语', '双修引导', '声控福利', '冥想正念'].includes(a.cat);
  const immScene = a.cat === '修真引导音' ? '修真引导' : a.cat === '双修引导' ? '双修引导' : (a.cat === '情感夜话' || a.cat === '夜谈私语') ? '情感夜话' : a.cat === '白噪陪睡' ? '哄睡' : a.cat === '冥想正念' ? '冥想引导' : 'ASMR耳语';
  return `<div class="thw-inspector thw-xmly-inspector">
    <div class="thw-inspector-head">
      <button class="thw-iconbtn" data-xm-detail-back type="button" title="返回列表">${iconHtml('fa-arrow-left')}</button>
      <span class="thw-inspector-title">${esc(a.title)}</span>
      <span class="thw-topbar-spacer"></span>
      <button class="thw-iconbtn${a.collected ? ' on' : ''}" data-xm-collect="${esc(a.id)}" type="button" title="${a.collected ? '取消收藏' : '收藏'}">${iconHtml('fa-bookmark')}</button>
      <button class="thw-iconbtn${a.subscribed ? ' on' : ''}" data-xm-sub="${esc(a.id)}" type="button" title="${a.subscribed ? '取消追更' : '追更'}">${iconHtml('fa-rss')}</button>
      <button class="thw-iconbtn" data-xm-album-del="${esc(a.id)}" type="button" title="删除节目">${iconHtml('fa-trash')}</button>
    </div>
    <div class="thw-xmly-detail-scroll">
      <div class="thw-xmly-ahead">
        <div class="thw-xmly-ahead-cover">${iconHtml('fa-compact-disc')}${a.coverDesc ? `<span class="thw-xmly-cover-desc">${esc(a.coverDesc)}</span>` : ''}</div>
        <div class="thw-xmly-ahead-mid">
          <div class="thw-xmly-ahead-name">${esc(a.title)}${a.isAdult ? ' <span class="thw-xmly-badge adult">18+</span>' : ''}</div>
          <div class="thw-xmly-ahead-host">${iconHtml('fa-microphone')} ${esc(a.host)}${a.voiceTone ? ` · <span class="thw-xmly-tone">${esc(a.voiceTone)}</span>` : ''}</div>
          <div class="thw-xmly-ahead-meta">${esc(a.cat)} · ${a.updatedEp ? `更新至 ${a.updatedEp} 集${a.finished ? '·完结' : '·连载中'}` : `${a.episodes.length} 集`} · ▶${fmtPlays(a.plays)} · ${fmtPlays(a.subs)}订阅</div>
        </div>
      </div>
      ${a.intro ? `<div class="thw-xmly-ahead-intro">${esc(a.intro)}</div>` : ''}
      <div class="thw-xmly-dsec">${iconHtml('fa-list-music')} 声音单集 (${a.episodes.length}) <button class="thw-btn thw-btn-mini" data-xm-eps="${esc(a.id)}" type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-wand-magic-sparkles')} AI 排单集</button></div>
      <div class="thw-xmly-eps">${eps}</div>
      <div class="thw-xmly-dsec">${iconHtml('fa-comments')} 声控弹幕/评论 (${comments.length}) <span class="thw-xmly-cmgen"><button class="thw-btn thw-btn-mini" data-xm-cm-gen="${esc(a.id)}" type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-rotate')} 生成</button><button class="thw-btn thw-btn-mini" data-xm-cm-gen-ow="${esc(a.id)}" type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-eraser')} 覆盖</button></span></div>
      <div class="thw-xmly-cms">${cmBody}</div>
    </div>
    <div class="thw-xmly-detail-ops">
      <button class="thw-btn-primary thw-btn-mini" data-xm-playfirst="${esc(a.id)}" type="button">${iconHtml('fa-circle-play')} 播放</button>
      ${isImmersive ? `<button class="thw-btn thw-btn-mini" data-xm-immersive="${esc(a.id)}|${escAttr(immScene)}" type="button" title="生成一段沉浸播放稿并加入注入">${iconHtml('fa-ear-listen')} ${esc(immScene)}</button>` : ''}
      ${(a.cat === 'ASMR助眠' || a.cat === '白噪陪睡' || a.cat === '情感夜话' || a.cat === '冥想正念') ? `<button class="thw-btn thw-btn-mini" data-xm-sleepwith="${esc(a.id)}" type="button" title="哄睡陪听：定时关闭 + 记录听着谁睡着">${iconHtml('fa-bed')} 哄睡陪听</button>` : ''}
      <button class="thw-btn thw-btn-mini" data-xm-cm-mine="${esc(a.id)}" type="button">${iconHtml('fa-pen')} 写评论</button>
      <button class="thw-btn thw-btn-mini" data-xm-inject-album="${esc(a.id)}" type="button" title="加入注入暂存夹">${iconHtml('fa-syringe')} 加注入</button>
    </div>
  </div>`;
}

// 右列：直播间详情（纯声音）
function liveMsgHtml(m: XmLiveRoom['msgs'][number]): string {
  const cls = m.kind === 'host' ? 'host' : m.kind === 'call' ? 'call' : m.kind === 'gift' ? 'gift' : m.kind === 'song' ? 'song' : m.kind === 'enter' ? 'enter' : 'danmu';
  const ico = m.kind === 'host' ? 'fa-microphone' : m.kind === 'call' ? 'fa-microphone-lines' : m.kind === 'gift' ? 'fa-gift' : m.kind === 'song' ? 'fa-music' : m.kind === 'enter' ? 'fa-door-open' : '';
  return `<div class="thw-xmly-lm ${cls}">${ico ? iconHtml(ico) + ' ' : ''}<b>${esc(m.author)}</b>${m.kind === 'host' ? '（主播）' : ''}：${esc(m.content)}</div>`;
}
function roomDetailHtml(id: string): string {
  const r = getRoom(id);
  if (!r) return `<div class="thw-inspector thw-xmly-inspector"><div class="thw-inspector-empty">${iconHtml('fa-tower-broadcast')}<div>电台不存在</div></div></div>`;
  const msgs = r.msgs.length ? r.msgs.slice(-40).map(liveMsgHtml).join('') : `<div class="thw-xmly-dim" style="padding:8px">电台刚开播，点下方「催更互动」让节目动起来，或连麦/点歌打进去。</div>`;
  const ended = r.ended;
  return `<div class="thw-inspector thw-xmly-inspector">
    <div class="thw-inspector-head">
      <button class="thw-iconbtn" data-xm-detail-back type="button" title="返回列表">${iconHtml('fa-arrow-left')}</button>
      <span class="thw-inspector-title">${iconHtml('fa-tower-broadcast')} ${esc(r.topic)}</span>
      <span class="thw-topbar-spacer"></span>
      <button class="thw-iconbtn${r.followed ? ' on' : ''}" data-xm-room-follow="${esc(r.id)}" type="button" title="${r.followed ? '取关电台' : '关注电台'}">${iconHtml('fa-heart')}</button>
      <button class="thw-iconbtn" data-xm-room-del="${esc(r.id)}" type="button" title="移除">${iconHtml('fa-trash')}</button>
    </div>
    <div class="thw-xmly-live-stage">
      <div class="thw-xmly-live-wave${ended ? '' : ' on'}">${iconHtml('fa-waveform')}</div>
      <div class="thw-xmly-live-host">${esc(r.host)}${r.voiceTone ? ` · ${esc(r.voiceTone)}` : ''}</div>
      <div class="thw-xmly-live-meta">${esc(r.cat)} · ${ended ? '已下播' : `${iconHtml('fa-ear-listen')} ${fmtPlays(r.listeners)}人在听`}${r.nowSong ? ` · ♪ ${esc(r.nowSong)}` : ''}</div>
      ${r.notice ? `<div class="thw-xmly-live-notice">${esc(r.notice)}</div>` : ''}
    </div>
    <div class="thw-xmly-lms">${msgs}</div>
    <div class="thw-xmly-detail-ops">
      ${ended ? '<span class="thw-xmly-dim">这场已下播</span>' : `
      <button class="thw-btn thw-btn-mini" data-xm-live-more="${esc(r.id)}" type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-comments')} 催更互动</button>
      <button class="thw-btn thw-btn-mini" data-xm-live-call="${esc(r.id)}" type="button">${iconHtml('fa-microphone-lines')} 连麦</button>
      <button class="thw-btn thw-btn-mini" data-xm-live-song="${esc(r.id)}" type="button">${iconHtml('fa-music')} 点歌</button>
      <button class="thw-btn thw-btn-mini" data-xm-live-danmu="${esc(r.id)}" type="button">${iconHtml('fa-comment')} 发弹幕</button>
      <button class="thw-btn thw-btn-mini" data-xm-inject-room="${esc(r.id)}" type="button" title="加入注入">${iconHtml('fa-syringe')} 加注入</button>
      <button class="thw-btn thw-btn-mini" data-xm-live-end="${esc(r.id)}" type="button">${iconHtml('fa-circle-stop')} 下播</button>`}
    </div>
  </div>`;
}
// PLACEHOLDER_XM_RANK_VIEW
// 右列默认态：声音榜（万花镜打榜语义）+ 继续收听。未选专辑/电台时显示。
function rankInspectorHtml(): string {
  const player = getPlayer();
  const nowA = player.albumId ? getAlbum(player.albumId) : undefined;
  const resume = nowA ? `<button class="thw-xmly-resume" data-xm-album="${esc(nowA.id)}" type="button">${iconHtml('fa-circle-play')} 继续收听《${esc(nowA.title)}》</button>` : '';
  const blocks = XM_RANK_KINDS.map(k => {
    const r = getRank(k.id);
    const body = r && r.entries.length
      ? `${r.note ? `<div class="thw-xmly-rank-note">${iconHtml('fa-bullhorn')} ${esc(r.note)}</div>` : ''}` +
        r.entries.map((e, i) => `<button class="thw-xmly-rank-row" data-xm-album="${esc(e.albumId || '')}" type="button" ${e.albumId ? '' : 'disabled'}>
          <span class="thw-xmly-rank-no th-rank-${i < 3 ? i + 1 : 'n'}">${i + 1}</span>
          <span class="thw-xmly-rank-mid"><span class="thw-xmly-rank-name">${esc(e.name)}</span><span class="thw-xmly-rank-reason">${esc(e.reason)}</span></span>
        </button>`).join('')
      : `<div class="thw-xmly-dim" style="padding:8px 10px">还没生成，点右侧刷新。</div>`;
    return `<div class="thw-xmly-rankcard"><div class="thw-xmly-rankcard-h"><span class="thw-xmly-rankcard-t">${iconHtml(k.icon)} ${esc(k.title)}</span><button class="thw-btn thw-btn-mini" data-xm-rank="${k.id}" type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-rotate')} 刷新</button></div>${body}</div>`;
  }).join('');
  return `<div class="thw-inspector thw-xmly-inspector">
    <div class="thw-inspector-head"><span class="thw-inspector-title">${iconHtml('fa-crown')} 声音榜</span><span class="thw-topbar-spacer"></span><button class="thw-btn thw-btn-mini" data-xm-rank-all type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-rotate')} 全刷</button></div>
    <div class="thw-xmly-detail-scroll">
      ${resume}
      <div class="thw-xmly-ranks">${blocks}</div>
    </div>
  </div>`;
}
// PLACEHOLDER_XM_SETTINGS
// ==================== 设置（master-detail）====================
const XM_SET_CATS: ScaffoldCatDef[] = [
  { id: 'context', canon: 'read' },
  { id: 'inject', canon: 'write' },
  'auto',
  { id: 'play', icon: 'fa-headphones', label: '播放与陪伴' },
  { id: 'cats', icon: 'fa-tags', label: '分类管理' },
  'prompts',
  'api',
  'eco',
  { id: 'appear', canon: 'appearance', icon: 'fa-palette' },
  { id: 'data', canon: 'data' },
];
function switchRow(label: string, hint: string, cls: string, on: boolean, disabled = false): string {
  return `<label class="thw-switchrow"><span class="thw-switchrow-main"><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</span>
    <span class="thw-switch"><input type="checkbox" class="${cls}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="thw-switch-track"></span></span></label>`;
}
function sliderRow(label: string, hint: string, cls: string, val: number, max = 200): string {
  return `<div class="thw-field"><div class="thw-flabel">${label} <b class="thw-xmly-slider-val">${val}</b></div>
    <input type="range" min="0" max="${max}" step="5" class="thw-xmly-slider ${cls}" value="${val}">
    ${hint ? `<div class="thw-set-hint">${hint}</div>` : ''}</div>`;
}
function settingsHtml(): string {
  const navs = scaffoldNavHtml('xm', normalizeScaffoldCats(XM_SET_CATS), _setCat);
  return `<div class="thw-content thw-xmly-content thw-xmly-settings">
    <div class="thw-topbar"><span class="thw-topbar-title">${iconHtml('fa-gear')} 喜马拉雅设置</span></div>
    <div class="thw-xmly-set-body"><nav class="thw-xmly-set-nav">${navs}</nav><div class="thw-xmly-set-detail thw-content-pad thw-view-in">${settingsDetailHtml()}</div></div>
  </div>`;
}
function settingsDetailHtml(): string {
  const s = getXmSettings();
  if (_setCat === 'context') {
    const wbReady = isWorldbookAvailable();
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">生成上下文</span></div>
      ${switchRow('参考最近正文', '铺节目/弹幕/电台时读取最近几楼正文，贴合当前剧情与时节', 'thw-xmly-cfg-floors', s.useFloors)}
      <div class="thw-field"><div class="thw-flabel">读取楼层数</div><input type="number" min="0" max="30" class="thw-input thw-xmly-cfg-floorcount" value="${s.floorCount}"></div>
      <div class="thw-set-hint">还会自动读「世界态·当季/万花镜榜」来生成节令特别节目、呼应声音榜（在世界演化里推进世界态即可）。</div>
    </div>
    <div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-book')} 注入酒馆世界书（设定来源）</span></div>
      <div class="thw-set-hint">${wbReady ? '勾选要用的世界书条目即生效（作为节目/主播/世界的权威设定），可跨多本书混选。改设定改世界书即可，不必动提示词。分类还能各自绑条目（见「分类管理」）。' : '当前环境无世界书接口。'}</div>
      <div class="thw-xmly-set-wbpick" data-xm-wbpick-host>${wbReady ? wbPickerHtml(s.worldbookEntryKeys || []) : ''}</div>
    </div>`;
  }
  if (_setCat === 'inject') {
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-syringe')} 注入正文</span></div>
      <div class="thw-set-hint">喜马独立于正文，但可把「我正在听的」「我追更的节目」「当前热门声音」切片自由注入世界书或输入框，实现联动。默认全关，按需勾选去向。</div>
      ${injectPlanPanelHtml('xmly')}</div>`;
  }
  if (_setCat === 'api') {
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">API 利用</span></div>
      <div class="thw-set-hint">每个产出项一张卡：勾选它这次产出什么、各自批量额度，省 token。</div>${apiPlanPanelHtml('xmly')}</div>`;
  }
  if (_setCat === 'eco') {
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">听书电台生态浓度</span></div>
      <div class="thw-set-hint">调节平台的「气氛」，生成时通用化读取（不写死提示词）。0-100 常规，100-200 逐档加码。</div>
      ${sliderRow('平台活跃度', '越高越多上新/开台/连麦点歌', 'thw-xmly-eco-activity', s.ecoActivity)}
      ${sliderRow('内容质量真实度', '越高弃坑/挑刺/理性差评越真实（低=清一色好评水军感）', 'thw-xmly-eco-quality', s.ecoQuality)}
      ${sliderRow('顶流炒作度', '越高顶流扎堆/数据注水/打投氛围越夸张', 'thw-xmly-eco-hype', s.ecoHype)}
      ${sliderRow('塌房黑红度（声控瓜烈度 ⚠）', '基调阀：低=温和吐槽零恶意；越高塌房/人设崩/开撕越激烈（仍锁虚构娱乐、幸福的烦恼级）', 'thw-xmly-eco-toxic', s.ecoToxic)}
      ${sliderRow('色情度（露骨程度）', '作用于全 app 所有分类与内容（节目/声音标签/单集/弹幕/口播）——越高越直白露骨（全女百合GL，纯听感不写画面）', 'thw-xmly-eco-erotic', s.ecoErotic)}
      ${sliderRow('肉欲度（声线诱惑表现）', '作用于全 app——越高气息/喘息/贴耳媚态越浓（只借声音侧写，不写视觉）', 'thw-xmly-eco-carnal', s.ecoCarnal)}
    </div>`;
  }
  if (_setCat === 'play') {
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">播放与陪伴</span></div>
      <div class="thw-field"><div class="thw-flabel">哄睡默认定时（分钟）</div><input type="number" min="0" max="180" step="5" class="thw-input thw-xmly-cfg-sleep" value="${s.sleepDefaultMin}"></div>
      ${sliderRow('主播/连麦主动撩你频率', '越高电台主播越主动撩你、连麦越暧昧（尺度仍受生态色情/肉欲阀约束）', 'thw-xmly-cfg-flirt', s.hostFlirt, 5)}
      ${switchRow('关注主播开台推送', '关注的电台主播开播时，走微信给你推一条提醒', 'thw-xmly-cfg-pushlive', s.pushOnLive)}
    </div>`;
  }
  if (_setCat === 'auto') {
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-bolt')} 楼层自动触发</span></div>
      ${switchRow('每 N 楼自动铺一批听单', '正文每推进设定楼数，打开喜马时自动刷一批新听单（0=关）', 'thw-xmly-cfg-autoen', (s.autoInterval || 0) > 0)}
      ${(s.autoInterval || 0) > 0 ? `<div class="thw-field"><div class="thw-flabel">每隔 N 楼<small>正文每推进 N 楼，下次打开喜马时自动刷一批「综合」听单</small></div>
        <input type="number" min="1" max="200" class="thw-input thw-xmly-cfg-auto" value="${s.autoInterval}"></div>` : ''}
    </div>`;
  }
  // PLACEHOLDER_XM_SETTINGS_DETAIL_2
  return settingsDetailHtml2();
}
// PLACEHOLDER_XM_SETTINGS_2
function settingsDetailHtml2(): string {
  const s = getXmSettings();
  if (_setCat === 'cats') {
    const cats = getCategories();
    const rows = cats.map(c => {
      const custom = !XM_CATS.some(x => x.name === c.name);
      const adult = (c as any).adult;
      return `<div class="thw-xmly-catrow">
        <div class="thw-xmly-catrow-h"><span>${iconHtml(c.icon)} ${esc(c.name)}${adult ? ' <em class="thw-tag">成人专区</em>' : ''}${custom ? ' <em class="thw-tag">自定义</em>' : ''}</span>${custom ? `<button class="thw-iconbtn" data-xm-cat-del="${escAttr(c.name)}" type="button">${iconHtml('fa-trash')}</button>` : ''}</div>
        <textarea class="thw-input thw-xmly-catprompt" data-xm-catprompt="${escAttr(c.name)}" rows="3" placeholder="本分类的生成引导（节目母题/声音标签/单集套路/听感口碑）">${esc(getCatPrompt(c.name))}</textarea>
        <div class="thw-xmly-catwb" data-xm-catwb-host="${escAttr(c.name)}">${catWbBindHtml('xmly', c.name)}</div>
      </div>`;
    }).join('');
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">分类管理</span><button class="thw-btn thw-btn-mini" data-xm-cat-add type="button">${iconHtml('fa-plus')} 新分类</button></div>
      <div class="thw-set-hint">每个分类的生成引导可改；还能给分类绑世界书条目作专属设定来源（改设定不改 prompt）。铁律：只写听感、不写画面。</div>${rows}</div>`;
  }
  if (_setCat === 'prompts') {
    const tpls = listPromptTemplates('xmly').filter(t => !t.id.startsWith('inject.envelope.') && t.id !== 'xmly.frag.eco');
    const rows = tpls.map(t => `<button class="thw-card thw-card-hover thw-xmly-pl-row" data-xm-pl-edit="${esc(t.id)}" type="button">
      <span class="thw-xmly-pl-mid"><span class="thw-xmly-pl-ttl">${esc(t.name)}${t.id.endsWith('.jailbreak') ? ` <span class="thw-tag">${iconHtml('fa-unlock-keyhole')}破限</span>` : ''}${isPromptOverridden(t.id) ? ' <span class="thw-tag">已改</span>' : ''}</span><span class="thw-xmly-pl-desc">${esc(t.desc || '')}</span></span>
      <span class="thw-xmly-pl-arrow">${iconHtml('fa-chevron-right')}</span></button>`).join('');
    const frag = listPromptTemplates('xmly').find(t => t.id === 'xmly.frag.eco');
    const fragRow = frag ? `<button class="thw-card thw-card-hover thw-xmly-pl-row" data-xm-pl-edit="${esc(frag.id)}" type="button"><span class="thw-xmly-pl-mid"><span class="thw-xmly-pl-ttl">${esc(frag.name)}${isPromptOverridden(frag.id) ? ' <span class="thw-tag">已改</span>' : ''}</span><span class="thw-xmly-pl-desc">${esc(frag.desc || '')}</span></span><span class="thw-xmly-pl-arrow">${iconHtml('fa-chevron-right')}</span></button>` : '';
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">功能提示词</span></div>
      <div class="thw-set-hint">${tpls.length} 项主提示词 · 破限已置顶，点开就地编辑或 AI 重写。所有提示词强约束「只写听感不写画面」。</div>${rows}</div>
      <details class="thw-xmly-fragsec"><summary>${iconHtml('fa-puzzle-piece')} 小片段（生态包装语）</summary>${fragRow}</details>`;
  }
  if (_setCat === 'appear') {
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">外观</span></div>
      <div class="thw-field"><div class="thw-flabel">主题皮肤</div><select class="thw-select thw-xmly-cfg-theme">${XM_THEMES.map(t => `<option value="${t.key}" ${s.theme === t.key ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
      <div class="thw-field"><div class="thw-flabel">字体</div><select class="thw-select thw-xmly-cfg-font">${XM_FONTS.map(f => `<option value="${f.key}" ${s.font === f.key ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></div>
    </div>`;
  }
  // data
  return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">记忆</span></div>
    <div class="thw-set-hint">收听焦点/追更足迹可同步进世界书；这里管理本 APP 的记忆沉淀。</div>${appMemPanelHtml('xmly')}</div>
    <div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">数据管理</span></div>
    <button class="thw-btn thw-btn-danger thw-btn-mini" data-xm-clear type="button">${iconHtml('fa-trash')} 清空节目/弹幕/电台/榜单（保留设置与我的收听）</button></div>`;
}
// 提示词编辑页（页内视图，占中列）
function promptEditViewHtml(id: string): string {
  const t = listPromptTemplates('xmly').find(x => x.id === id);
  return `<div class="thw-content thw-xmly-content">
    <div class="thw-topbar"><button class="thw-iconbtn" data-xm-pe-close type="button">${iconHtml('fa-arrow-left')}</button><span class="thw-topbar-title">${esc(t?.name || '提示词')}</span>
      <span class="thw-topbar-spacer"></span><button class="thw-btn thw-btn-mini" data-xm-pe-reset type="button">${iconHtml('fa-rotate-left')} 恢复默认</button><button class="thw-btn-primary thw-btn-mini" data-xm-pe-save type="button">${iconHtml('fa-check')} 保存</button></div>
    <div class="thw-content-pad thw-view-in">
      <div class="thw-set-hint">${esc(t?.desc || '')}</div>
      <textarea class="thw-input thw-xmly-pe-text" rows="16">${esc(getPromptText(id))}</textarea>
      ${aiPromptEditorHtml(id)}
      ${id.endsWith('.jailbreak') || id === 'xmly.frag.eco' ? '' : promptWbBindHtml(id)}
    </div>
  </div>`;
}
// PLACEHOLDER_XM_RENDER
// ==================== 渲染 ====================
function render(): void {
  const root = rootEl(); if (!root) return;
  const s = getXmSettings();
  let content = ''; let inspector = '';
  if (_promptEditId) { content = promptEditViewHtml(_promptEditId); }
  else if (_view.name === 'settings') { content = settingsHtml(); }
  else if (_view.name === 'album') {
    const a = getAlbum(_view.id);
    content = recommendTabHtml();
    inspector = a ? albumDetailHtml(_view.id) : rankInspectorHtml();
  }
  else if (_view.name === 'room') {
    content = liveTabHtml();
    inspector = getRoom(_view.id) ? roomDetailHtml(_view.id) : rankInspectorHtml();
  }
  else {
    const tab = _view.tab;
    content = tab === 'recommend' ? recommendTabHtml() : tab === 'cats' ? catsTabHtml() : tab === 'live' ? liveTabHtml() : mineTabHtml();
    // 推荐/分类/我听的：右栏默认展示声音榜；直播 tab 无详情时也给榜
    if (tab !== 'mine') inspector = rankInspectorHtml();
  }
  const hasDetail = (_view.name === 'album' || _view.name === 'room' || (_view.name === 'tab' && _view.tab !== 'mine')) ? ' thw-xmly-hasinspector' : '';
  // 真正打开专辑/电台详情时隐藏浏览列、详情独占（榜单默认态保持三栏）
  const detailOpen = ((_view.name === 'album' && getAlbum(_view.id)) || (_view.name === 'room' && getRoom(_view.id))) ? ' thw-xmly-detailopen' : '';
  const showPlayer = !_promptEditId && _view.name !== 'settings';
  const themeCls = `thw-xmly-theme-${s.theme || 'purple'} thw-xmly-font-${s.font || 'system'}`;
  root.innerHTML = `<div class="thw-app thw-xmly-app2 ${themeCls}${hasDetail}${detailOpen}${showPlayer ? ' thw-xmly-hasplayer' : ''}">
    <div class="thw-body">${sidebarHtml()}${content}${inspector}</div>
    ${showPlayer ? playerBarHtml() : ''}
  </div>`;
  // 绑定命令式子组件
  if (_view.name === 'settings' && !_promptEditId) {
    if (_setCat === 'context' && isWorldbookAvailable()) {
      const host = root.querySelector('[data-xm-wbpick-host]') as HTMLElement | null;
      if (host) bindWbPicker(host, () => getXmSettings().worldbookEntryKeys || [], (keys) => updateXmSettings({ worldbookEntryKeys: keys }));
    }
    if (_setCat === 'cats') { root.querySelectorAll('[data-xm-catwb-host]').forEach(h => bindCatWbHost(h as HTMLElement)); }
  }
  if (_promptEditId) { const scope = root.querySelector('.thw-content') as HTMLElement | null; if (scope) bindPromptWbHost(scope); }
  // 直播间/弹幕流自动滚到底
  const lms = root.querySelector('.thw-xmly-lms') as HTMLElement | null; if (lms) lms.scrollTop = lms.scrollHeight;
}

function goTab(tab: Tab): void { _view = { name: 'tab', tab }; _promptEditId = null; render(); }

// 播放进度模拟：播放中每秒推进 positionSec（纯前端体验，不出声）
let _tick: ReturnType<typeof setInterval> | null = null;
function startTick(): void {
  if (_tick) return;
  _tick = setInterval(() => {
    const root = rootEl(); if (!root) { stopTick(); return; }
    const p = getPlayer();
    if (!p.playing || !p.albumId || !p.epId) return;
    const ep = getEpisode(p.albumId, p.epId); if (!ep) return;
    // 定时关闭：按秒倒数，到点停播清零。
    if (p.sleepTimerMin && p.sleepTimerMin > 0) {
      const leftSec = Math.max(0, p.sleepTimerMin * 60 - p.rate);
      if (leftSec <= 0) { setPlayer({ playing: false, sleepTimerMin: 0 }); thToast('定时已到，已停止播放', 'info'); const bar0 = root.querySelector('.thw-xmly-player'); if (bar0) bar0.outerHTML = playerBarHtml(); return; }
      // 用整分钟粒度回写，避免每秒写盘：仅在跨过整分钟边界时更新显示值。
      const newMin = Math.ceil(leftSec / 60);
      if (newMin !== p.sleepTimerMin) setPlayer({ sleepTimerMin: newMin });
    }
    const next = p.positionSec + p.rate;
    if (next >= ep.durationSec) {
      // 循环模式：单集循环重头播；列表循环跳下一集；不循环则停。
      if (p.loop === 'one') { setPlayer({ positionSec: 0, playing: true }); }
      else if (p.loop === 'list') {
        const nextEp = nextEpisodeOf(p.albumId, p.epId);
        if (nextEp) setPlayer({ albumId: p.albumId, epId: nextEp.id, positionSec: 0, playing: true });
        else setPlayer({ positionSec: ep.durationSec, playing: false });
      } else { setPlayer({ positionSec: ep.durationSec, playing: false }); }
    }
    else setPlayer({ positionSec: next });
    // 只刷播放条，避免整树重渲染打断交互
    const bar = root.querySelector('.thw-xmly-player'); if (bar) bar.outerHTML = playerBarHtml();
  }, 1000);
}
function stopTick(): void { if (_tick) { clearInterval(_tick); _tick = null; } }
// PLACEHOLDER_XM_EVENTS
// ==================== 事件 ====================
function bindRoot(): void {
  const root = rootEl(); if (!root || (root as any)._xmBound) return;
  (root as any)._xmBound = true;
  root.addEventListener('click', (e) => { void onClick(e); });
  root.addEventListener('change', (e) => onChange(e));
}

async function onClick(e: Event): Promise<void> {
  const t = e.target as HTMLElement;
  // 导航
  const tabBtn = t.closest('[data-xm-tab]') as HTMLElement | null;
  if (tabBtn) { goTab(tabBtn.getAttribute('data-xm-tab') as Tab); return; }
  if (t.closest('[data-xm-detail-back]')) { goTab(_view.name === 'room' ? 'live' : 'recommend'); return; }
  if (t.closest('[data-xm-settings]')) { _view = { name: 'settings' }; _setCat = 'context'; _promptEditId = null; render(); return; }
  const catChip = t.closest('[data-xm-cat]') as HTMLElement | null;
  if (catChip && catChip.hasAttribute('data-xm-cat')) {
    _cat = catChip.getAttribute('data-xm-cat') || '';
    if (_view.name !== 'tab' || (_view.tab !== 'recommend' && _view.tab !== 'cats')) _view = { name: 'tab', tab: 'recommend' };
    render(); return;
  }
  // 刷新
  if (t.closest('[data-xm-refresh-ow]')) { void aiPopulate(_cat, 'overwrite'); return; }
  if (t.closest('[data-xm-refresh]')) { void aiPopulate(_cat, 'incremental'); return; }
  if (t.closest('[data-xm-live-refresh-ow]')) { void aiLiveRooms('overwrite'); return; }
  if (t.closest('[data-xm-live-refresh]')) { void aiLiveRooms('incremental'); return; }
  // 声音榜
  const rk = t.closest('[data-xm-rank]') as HTMLElement | null;
  if (rk) { void aiRank(rk.getAttribute('data-xm-rank') || ''); return; }
  if (t.closest('[data-xm-rank-all]')) { for (const k of XM_RANK_KINDS) { await aiRank(k.id); } return; }
  // 播放条
  if (await onPlayerClick(t, e)) return;
  // 专辑
  if (await onAlbumClick(t)) return;
  // 直播间
  if (await onRoomClick(t)) return;
  // 我的
  if (await onMineClick(t)) return;
  // 设置
  if (await onSettingsClick(t)) return;
}

// ---- 播放条 ----
async function onPlayerClick(t: HTMLElement, ev: Event): Promise<boolean> {
  if (t.closest('[data-xm-toggle]')) { togglePlay(); if (getPlayer().playing) startTick(); render(); return true; }
  if (t.closest('[data-xm-prev]') || t.closest('[data-xm-next]')) {
    const dir = t.closest('[data-xm-next]') ? 1 : -1;
    const p = getPlayer(); if (!p.albumId || !p.epId) { thToast('先挑一集播放', 'info'); return true; }
    const a = getAlbum(p.albumId); if (!a) return true;
    const idx = a.episodes.findIndex(x => x.id === p.epId);
    const nxt = a.episodes[idx + dir];
    if (nxt) { playEpisode(a.id, nxt.id); startTick(); render(); }
    else thToast(dir > 0 ? '已是最后一集' : '已是第一集', 'info');
    return true;
  }
  if (t.closest('[data-xm-rate]')) {
    const rates = [1, 1.25, 1.5, 2, 0.75]; const cur = getPlayer().rate;
    const next = rates[(rates.indexOf(cur) + 1) % rates.length] ?? 1;
    setPlayer({ rate: next }); render(); return true;
  }
  if (t.closest('[data-xm-loop]')) {
    const order: XmPlayer['loop'][] = ['none', 'one', 'list']; const cur = getPlayer().loop;
    setPlayer({ loop: order[(order.indexOf(cur) + 1) % order.length] }); render(); return true;
  }
  if (t.closest('[data-xm-sleep]')) {
    const cur = getPlayer().sleepTimerMin;
    const opts = [0, 15, 30, 60, 90]; const next = opts[(opts.indexOf(cur) + 1) % opts.length] ?? 0;
    setPlayer({ sleepTimerMin: next }); thToast(next ? `定时 ${next} 分钟后关闭` : '已取消定时', 'info'); render(); return true;
  }
  const seek = t.closest('[data-xm-seek]') as HTMLElement | null;
  if (seek) {
    const p = getPlayer(); if (!p.albumId || !p.epId) return true;
    const ep = getEpisode(p.albumId, p.epId); if (!ep) return true;
    const rect = seek.getBoundingClientRect();
    const clientX = (ev as MouseEvent).clientX || rect.left;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setPlayer({ positionSec: Math.round(ep.durationSec * ratio) }); render(); return true;
  }
  return false;
}
// PLACEHOLDER_XM_CLICK2
// ---- 专辑 ----
async function onAlbumClick(t: HTMLElement): Promise<boolean> {
  // 单集展开/折叠「播讲正文」（在播放按钮之前拦截）
  const epTog = t.closest('[data-xm-ep-toggle]') as HTMLElement | null;
  if (epTog) { const id = epTog.getAttribute('data-xm-ep-toggle') || ''; _openEp = _openEp === id ? null : id; render(); return true; }
  const epGen = t.closest('[data-xm-epgen]') as HTMLElement | null;
  if (epGen) { const [aid, eid] = (epGen.getAttribute('data-xm-epgen') || '').split('|'); if (aid && eid) { _openEp = eid; void aiEpisodeContent(aid, eid, 'fresh'); } return true; }
  const epMore = t.closest('[data-xm-epmore]') as HTMLElement | null;
  if (epMore) { const [aid, eid] = (epMore.getAttribute('data-xm-epmore') || '').split('|'); if (aid && eid) { _openEp = eid; void aiEpisodeContent(aid, eid, 'continue'); } return true; }
  const epRedo = t.closest('[data-xm-epredo]') as HTMLElement | null;
  if (epRedo) {
    const [aid, eid] = (epRedo.getAttribute('data-xm-epredo') || '').split('|');
    if (aid && eid) { const ok = await thConfirm({ title: '重播本集', message: '重新从头播这一集？已生成的播讲正文会被覆盖。', confirmText: '重播', danger: true }); if (ok) { _openEp = eid; void aiEpisodeContent(aid, eid, 'fresh'); } }
    return true;
  }
  const epInj = t.closest('[data-xm-epinject]') as HTMLElement | null;
  if (epInj) {
    const [aid, eid] = (epInj.getAttribute('data-xm-epinject') || '').split('|');
    const a = getAlbum(aid || ''); const ep = a?.episodes.find(e => e.id === eid);
    if (a && ep && ep.content) { addToStash('xmly', `播讲·${a.host}《${a.title}》第${ep.no}集`, `〔${a.cat}·${a.host}播讲《${a.title}》第${ep.no}集「${ep.title}」〕\n${ep.content}`); thToast('这段播讲已加入注入暂存夹', 'success'); }
    else thToast('这一集还没有播讲正文', 'warn');
    return true;
  }
  // 播放某单集
  const play = t.closest('[data-xm-play]') as HTMLElement | null;
  if (play) {
    const [aid, eid] = (play.getAttribute('data-xm-play') || '').split('|');
    if (aid && eid) {
      const p = getPlayer();
      if (p.albumId === aid && p.epId === eid) { togglePlay(); }
      else { _openEp = eid; const r = playEpisode(aid, eid); if (r.leveledUp) thToast(`听龄升级到 Lv.${getUser().level} ${levelTitle(getUser().level)}！`, 'success'); if (r.newBadges.length) thToast('解锁勋章：' + r.newBadges.join('、'), 'success'); }
      if (getPlayer().playing) startTick();
      render();
    }
    return true;
  }
  // 从详情「播放」＝播第一集/续听
  const pf = t.closest('[data-xm-playfirst]') as HTMLElement | null;
  if (pf) {
    const a = getAlbum(pf.getAttribute('data-xm-playfirst') || ''); if (!a || !a.episodes.length) { thToast('还没有单集，先 AI 排单集', 'warn'); return true; }
    const p = getPlayer(); const resume = (p.albumId === a.id && p.epId) ? a.episodes.find(e => e.id === p.epId) : undefined;
    const ep = resume || a.episodes[0];
    playEpisode(a.id, ep.id); startTick(); render(); return true;
  }
  // 打开专辑
  const open = t.closest('[data-xm-album]') as HTMLElement | null;
  if (open && !t.closest('button[data-xm-collect],button[data-xm-sub]')) {
    const id = open.getAttribute('data-xm-album') || ''; if (!id) return true;
    _view = { name: 'album', id }; _promptEditId = null; render(); return true;
  }
  const col = t.closest('[data-xm-collect]') as HTMLElement | null;
  if (col) { toggleCollectAlbum(col.getAttribute('data-xm-collect') || ''); render(); return true; }
  const sub = t.closest('[data-xm-sub]') as HTMLElement | null;
  if (sub) { const on = toggleSubscribe(sub.getAttribute('data-xm-sub') || ''); thToast(on ? '已追更，有更新会红点提醒' : '已取消追更', 'info'); render(); return true; }
  const del = t.closest('[data-xm-album-del]') as HTMLElement | null;
  if (del) { const ok = await thConfirm({ title: '删除节目', message: '删除这档节目及其弹幕？', confirmText: '删除', danger: true }); if (ok) { deleteAlbum(del.getAttribute('data-xm-album-del') || ''); _view = { name: 'tab', tab: 'recommend' }; render(); } return true; }
  const eps = t.closest('[data-xm-eps]') as HTMLElement | null;
  if (eps) { void aiEpisodes(eps.getAttribute('data-xm-eps') || ''); return true; }
  const cmGenOw = t.closest('[data-xm-cm-gen-ow]') as HTMLElement | null;
  if (cmGenOw) { void aiComments(cmGenOw.getAttribute('data-xm-cm-gen-ow') || '', 'overwrite'); return true; }
  const cmGen = t.closest('[data-xm-cm-gen]') as HTMLElement | null;
  if (cmGen) { void aiComments(cmGen.getAttribute('data-xm-cm-gen') || '', 'incremental'); return true; }
  const cmLike = t.closest('[data-xm-cm-like]') as HTMLElement | null;
  if (cmLike) { likeComment(cmLike.getAttribute('data-xm-cm-like') || ''); render(); return true; }
  const cmDel = t.closest('[data-xm-cm-del]') as HTMLElement | null;
  if (cmDel) { deleteComment(cmDel.getAttribute('data-xm-cm-del') || ''); render(); return true; }
  const cmMine = t.closest('[data-xm-cm-mine]') as HTMLElement | null;
  if (cmMine) {
    const id = cmMine.getAttribute('data-xm-cm-mine') || '';
    const txt = await thPrompt({ title: '写评论', message: '你对这档节目的评论：', value: '', multiline: true });
    if (txt != null) { addComments(id, [{ author: '我', content: String(txt).trim() || '声音真好听', likes: 0 }]); const up = addExp(6); render(); thToast(up ? '评论成功，升级啦！' : '评论成功 +6', 'success'); }
    return true;
  }
  const imm = t.closest('[data-xm-immersive]') as HTMLElement | null;
  if (imm) { const [aid, scene] = (imm.getAttribute('data-xm-immersive') || '').split('|'); if (aid) void aiImmersive(aid, scene || 'ASMR耳语'); return true; }
  const sw = t.closest('[data-xm-sleepwith]') as HTMLElement | null;
  if (sw) {
    const a = getAlbum(sw.getAttribute('data-xm-sleepwith') || ''); if (!a) return true;
    const min = getXmSettings().sleepDefaultMin || 30;
    if (a.episodes[0]) { playEpisode(a.id, a.episodes[0].id); startTick(); }
    setPlayer({ sleepTimerMin: min, playing: true });
    setSleepWith(a.host);
    thToast(`哄睡陪听已开：${a.host} 陪你，${min} 分钟后关闭`, 'success');
    render(); return true;
  }
  const inj = t.closest('[data-xm-inject-album]') as HTMLElement | null;
  if (inj) { const a = getAlbum(inj.getAttribute('data-xm-inject-album') || ''); if (a) { addToStash('xmly', `节目·${a.title}`, xmAlbumInjectLine(a).replace(/^·\s*/, '')); thToast('已加入注入暂存夹', 'success'); } return true; }
  return false;
}
// PLACEHOLDER_XM_CLICK3
// ---- 直播间 ----
async function onRoomClick(t: HTMLElement): Promise<boolean> {
  const open = t.closest('[data-xm-room]') as HTMLElement | null;
  if (open && !t.closest('button[data-xm-room-follow],button[data-xm-room-del]')) {
    const id = open.getAttribute('data-xm-room') || ''; if (!id) return true;
    _view = { name: 'room', id }; _promptEditId = null; render(); return true;
  }
  const fol = t.closest('[data-xm-room-follow]') as HTMLElement | null;
  if (fol) { const on = toggleRoomFollow(fol.getAttribute('data-xm-room-follow') || ''); thToast(on ? '已关注电台，开播会推送' : '已取关', 'info'); render(); return true; }
  const rdel = t.closest('[data-xm-room-del]') as HTMLElement | null;
  if (rdel) { deleteRoom(rdel.getAttribute('data-xm-room-del') || ''); _view = { name: 'tab', tab: 'live' }; render(); return true; }
  const more = t.closest('[data-xm-live-more]') as HTMLElement | null;
  if (more) { void aiLiveInteract(more.getAttribute('data-xm-live-more') || ''); return true; }
  const call = t.closest('[data-xm-live-call]') as HTMLElement | null;
  if (call) {
    const id = call.getAttribute('data-xm-live-call') || '';
    const txt = await thPrompt({ title: '连麦打进热线', message: '你想对主播说（连麦口播，纯声音）：', value: '', multiline: true });
    if (txt != null && String(txt).trim()) { addRoomMsg(id, { kind: 'call', author: '我', content: String(txt).trim() }); render(); void aiLiveInteract(id, '（听众"我"连麦说）' + String(txt).trim()); }
    return true;
  }
  const song = t.closest('[data-xm-live-song]') as HTMLElement | null;
  if (song) {
    const id = song.getAttribute('data-xm-live-song') || '';
    const txt = await thPrompt({ title: '点歌台', message: '点一首歌 + 一句留言：', value: '' });
    if (txt != null && String(txt).trim()) { updateRoom(id, { nowSong: String(txt).trim() }); addRoomMsg(id, { kind: 'song', author: '我', content: `点歌：${String(txt).trim()}` }); render(); void aiLiveInteract(id, '（听众"我"点歌）' + String(txt).trim()); }
    return true;
  }
  const danmu = t.closest('[data-xm-live-danmu]') as HTMLElement | null;
  if (danmu) {
    const id = danmu.getAttribute('data-xm-live-danmu') || '';
    const txt = await thPrompt({ title: '发弹幕', message: '发条弹幕：', value: '' });
    if (txt != null && String(txt).trim()) { addRoomMsg(id, { kind: 'danmu', author: '我', content: String(txt).trim() }); render(); }
    return true;
  }
  const rinj = t.closest('[data-xm-inject-room]') as HTMLElement | null;
  if (rinj) { const r = getRoom(rinj.getAttribute('data-xm-inject-room') || ''); if (r) { addToStash('xmly', `电台·${r.host}《${r.topic}》`, `${r.host} 正在开${r.cat}电台《${r.topic}》，${r.listeners}人在听${r.nowSong ? '，正放《' + r.nowSong + '》' : ''}${r.notice ? '。' + r.notice : ''}`); thToast('已加入注入暂存夹', 'success'); } return true; }
  const rend = t.closest('[data-xm-live-end]') as HTMLElement | null;
  if (rend) { const ok = await thConfirm({ title: '下播', message: '让这场电台下播？', confirmText: '下播' }); if (ok) { endRoom(rend.getAttribute('data-xm-live-end') || ''); render(); } return true; }
  return false;
}

// ---- 我听的 ----
async function onMineClick(t: HTMLElement): Promise<boolean> {
  if (t.closest('[data-xm-taste-edit]')) {
    const cur = getUser().tasteTags.join('、');
    const v = await thPrompt({ title: '声音口味', message: '用「、」分隔你的声音口味（如 治愈系、沙哑系、国风、剧情控）：', value: cur });
    if (v != null) { setTasteTags(String(v).split(/[、,，]/).map(x => x.trim()).filter(Boolean)); render(); }
    return true;
  }
  if (t.closest('[data-xm-pl-new]')) {
    const v = await thPrompt({ title: '新建声音歌单', message: '歌单名（如「睡前歌单」「运功BGM」）：', value: '' });
    if (v != null && String(v).trim()) { addPlaylist(String(v).trim()); render(); }
    return true;
  }
  const pld = t.closest('[data-xm-pl-del]') as HTMLElement | null;
  if (pld) { removePlaylist(pld.getAttribute('data-xm-pl-del') || ''); render(); return true; }
  return false;
}
// PLACEHOLDER_XM_CLICK4
// ---- 设置 ----
async function onSettingsClick(t: HTMLElement): Promise<boolean> {
  if (t.closest('[data-xm-pe-close]')) { _promptEditId = null; render(); return true; }
  if (t.closest('[data-xm-pe-save]')) {
    const ta = rootEl()?.querySelector('.thw-xmly-pe-text') as HTMLTextAreaElement | null;
    if (ta && _promptEditId) { setPromptOverride(_promptEditId, ta.value); thToast('已保存', 'success'); _promptEditId = null; render(); }
    return true;
  }
  if (t.closest('[data-xm-pe-reset]')) { if (_promptEditId) { resetPrompt(_promptEditId); thToast('已恢复默认', 'success'); render(); } return true; }
  if (_promptEditId && bindAiPromptEditor({ target: t } as unknown as Event, () => (rootEl()?.querySelector('.thw-xmly-pe-text') as HTMLTextAreaElement)?.value || '', (txt) => { const ta = rootEl()?.querySelector('.thw-xmly-pe-text') as HTMLTextAreaElement | null; if (ta) ta.value = txt; })) return true;
  // 设置分类切换（局部刷新右侧 detail）
  const setcat = t.closest('[data-xm-setcat]') as HTMLElement | null;
  if (setcat) {
    _setCat = setcat.getAttribute('data-xm-setcat') || 'context';
    patchSettingsDetail({ root: rootEl(), detailSel: '.thw-xmly-set-detail', navSel: '[data-xm-setcat]', navAttr: 'data-xm-setcat', navOnClass: 'thw-nav-on', cat: _setCat, html: settingsDetailHtml() });
    const root = rootEl();
    if (root) {
      if (_setCat === 'context' && isWorldbookAvailable()) { const host = root.querySelector('[data-xm-wbpick-host]') as HTMLElement | null; if (host) bindWbPicker(host, () => getXmSettings().worldbookEntryKeys || [], (keys) => updateXmSettings({ worldbookEntryKeys: keys })); }
      if (_setCat === 'cats') root.querySelectorAll('[data-xm-catwb-host]').forEach(h => bindCatWbHost(h as HTMLElement));
    }
    return true;
  }
  // 共享面板点击
  if (t.closest('[data-inj-app]') && bindInjectPlanPanel({ target: t } as unknown as Event)) return true;
  if (t.closest('[data-apiplan-app]') && bindApiPlanPanel({ target: t } as unknown as Event)) return true;
  if (t.closest('[data-amem-app]') && bindAppMemPanel({ target: t } as unknown as Event)) return true;
  if (t.closest('[data-wbsync-app]') && bindWbSyncPanel({ target: t } as unknown as Event)) return true;
  // 提示词进编辑
  const plEdit = t.closest('[data-xm-pl-edit]') as HTMLElement | null;
  if (plEdit) { _promptEditId = plEdit.getAttribute('data-xm-pl-edit') || ''; render(); return true; }
  // 分类管理
  if (t.closest('[data-xm-cat-add]')) {
    const v = await thPrompt({ title: '新分类', message: '分类名（如「有声漫画」）：', value: '' });
    if (v != null && String(v).trim()) { addCustomCat(String(v).trim()); render(); }
    return true;
  }
  const catDel = t.closest('[data-xm-cat-del]') as HTMLElement | null;
  if (catDel) { deleteCustomCat(catDel.getAttribute('data-xm-cat-del') || ''); render(); return true; }
  // 数据清空
  if (t.closest('[data-xm-clear]')) {
    const ok = await thConfirm({ title: '清空数据', message: '清空所有节目/弹幕/电台/榜单？（设置与我的收听保留）', confirmText: '清空', danger: true });
    if (ok) { clearAll(); _view = { name: 'tab', tab: 'recommend' }; render(); thToast('已清空', 'success'); }
    return true;
  }
  return false;
}

function onChange(e: Event): void {
  const t = e.target as HTMLElement;
  if (t.closest('[data-inj-app]') && bindInjectPlanPanelChange(e)) return;
  if (t.closest('[data-apiplan-app]') && bindApiPlanPanelChange(e)) return;
  if (t.closest('[data-amem-app]') && bindAppMemPanel(e)) return;
  if (t.closest('[data-wbsync-app]') && bindWbSyncPanelChange(e)) return;
  // 生态/撩你滑块实时标签 + 存
  if (t.classList.contains('thw-xmly-slider')) {
    const val = Number((t as HTMLInputElement).value);
    const lbl = t.parentElement?.querySelector('.thw-xmly-slider-val'); if (lbl) lbl.textContent = String(val);
    const map: Record<string, keyof XmSettings> = { 'thw-xmly-eco-activity': 'ecoActivity', 'thw-xmly-eco-quality': 'ecoQuality', 'thw-xmly-eco-hype': 'ecoHype', 'thw-xmly-eco-toxic': 'ecoToxic', 'thw-xmly-eco-erotic': 'ecoErotic', 'thw-xmly-eco-carnal': 'ecoCarnal', 'thw-xmly-cfg-flirt': 'hostFlirt' };
    for (const cls of Object.keys(map)) if (t.classList.contains(cls)) { updateXmSettings({ [map[cls]]: val } as Partial<XmSettings>); return; }
    return;
  }
  if (t.classList.contains('thw-xmly-cfg-floors')) { updateXmSettings({ useFloors: (t as HTMLInputElement).checked }); return; }
  if (t.classList.contains('thw-xmly-cfg-floorcount')) { updateXmSettings({ floorCount: Math.max(0, Number((t as HTMLInputElement).value) || 0) }); return; }  if (t.classList.contains('thw-xmly-cfg-sleep')) { updateXmSettings({ sleepDefaultMin: Math.max(0, Number((t as HTMLInputElement).value) || 0) }); return; }
  if (t.classList.contains('thw-xmly-cfg-pushlive')) { updateXmSettings({ pushOnLive: (t as HTMLInputElement).checked }); return; }
  // 自动触发开关/间隔
  if (t.classList.contains('thw-xmly-cfg-autoen')) { const on = (t as HTMLInputElement).checked; updateXmSettings({ autoInterval: on ? (_lastXmAuto > 0 ? _lastXmAuto : 20) : 0 }); render(); return; }
  if (t.classList.contains('thw-xmly-cfg-auto')) { const n = Math.max(1, Math.min(200, Number((t as HTMLInputElement).value) || 1)); _lastXmAuto = n; updateXmSettings({ autoInterval: n }); return; }
  if (t.classList.contains('thw-xmly-cfg-theme')) { updateXmSettings({ theme: (t as HTMLSelectElement).value }); render(); return; }
  if (t.classList.contains('thw-xmly-cfg-font')) { updateXmSettings({ font: (t as HTMLSelectElement).value }); render(); return; }
  // 分类提示词就地存
  const catPrompt = t.closest('[data-xm-catprompt]') as HTMLElement | null;
  if (catPrompt && t.classList.contains('thw-xmly-catprompt')) { setCatPrompt(catPrompt.getAttribute('data-xm-catprompt') || '', (t as HTMLTextAreaElement).value); return; }
}
// PLACEHOLDER_XM_REGISTER
// ==================== 打开 / 注册 ====================
// 楼层自动触发——打开喜马时若正文比上次触发多推进了 autoInterval 楼，自动刷一批「综合」听单。
function maybeAutoTrigger(): void {
  if (!shouldAutoTrigger('xmly')) return;   // 全局急停
  const s = getXmSettings();
  if (!s.autoInterval || s.autoInterval <= 0) return;
  const cur = getTavernFloorCount();
  const last = s.lastFloor || 0;
  if (cur - last >= s.autoInterval) { updateXmSettings({ lastFloor: cur }); void aiPopulate('', 'incremental'); }
}
function openApp(): void {
  openModal2(`${iconHtml('fa-headphones')} 喜马拉雅`, phoneShellHtml({ rid: RID, appClass: 'th-xmly' }), {
    maxWidth: XM_MODAL_MAXW, reset: true, revive: openApp, phone: true,
  });
  startPhoneClock();
  bindRoot();
  render();
  if (getPlayer().playing) startTick();
  maybeAutoTrigger();
}
export function openXmly(): void { _view = { name: 'tab', tab: 'recommend' }; _promptEditId = null; openApp(); }

registerWorldApp({
  id: 'xmly', name: '喜马拉雅', icon: 'fa-headphones',
  accent: 'linear-gradient(135deg,#a855f7,#c084fc)', order: 130, open: openXmly,
  wbKeys: () => { try { return getXmSettings().worldbookEntryKeys || []; } catch (e) { void e; return []; } },
});

// 自动触发登记
registerAutoAgent({
  id: 'xmly', name: '喜马拉雅', icon: 'fa-headphones', desc: '每 N 楼自动铺一批听单',
  getInterval: () => { try { return getXmSettings().autoInterval || 0; } catch (e) { void e; return 0; } },
  setInterval: (n) => { if (n > 0) _lastXmAuto = n; updateXmSettings({ autoInterval: n }); },
  getLastFloor: () => { try { return getXmSettings().lastFloor || 0; } catch (e) { void e; return 0; } },
  fireNow: () => { void aiPopulate('', 'incremental'); },
});

// API 利用（对齐其它 app）
registerApiPlan({
  appId: 'xmly', appName: '喜马拉雅',
  features: [
    { id: 'populate', name: '铺节目（听单流）', desc: '刷新时一口气生成一批声音节目，养出听书电台生态。', defaultOn: true, standalone: false },
    { id: 'episodes', name: '排单集列表', desc: '为节目生成/续更单集（追更连载）。', defaultOn: true, standalone: false },
    { id: 'comment', name: '生成声控弹幕/评论', desc: '为节目生成夸音色/催更/理性混杂的评论。', defaultOn: true, standalone: false },
    { id: 'live', name: '开电台/连麦', desc: '开一批直播电台并推进连麦/点歌/弹幕互动。', defaultOn: true, standalone: false },
    { id: 'rank', name: '生成声音榜', desc: '据现有节目评主播人气/新星/催泪/助眠榜。', defaultOn: true, standalone: false },
    { id: 'syncWb', name: '声音同步世界书', desc: '把收听焦点/追更足迹写进角色卡世界书，正文可读。', defaultOn: false, standalone: false },
  ],
  counts: [
    { key: 'albumCount', name: '铺节目数', desc: '点刷新一次铺几档节目（也用于开电台间数）', def: 12, min: 4, max: 30 },
    { key: 'episodeCount', name: '单集数', desc: '为节目排单集时出几集', def: 12, min: 4, max: 40 },
    { key: 'commentCount', name: '弹幕评论数', desc: '生成几条声控弹幕/评论', def: 10, min: 3, max: 30 },
  ],
});

// 注入片段（默认全关，封套包裹，按需勾选；注入必带完整字段）
registerInjectPlan({
  appId: 'xmly', appName: '喜马拉雅',
  wbGate: () => getXmSettings().syncEnabled === true,   // 世界书注入总闸（=设置里「同步到世界书」，默认关）
  segments: [
    {
      id: 'nowplaying', name: '我耳机里正放着', kind: 'state',
      desc: '把「我」当前正在听的节目与进度注入正文，让剧情知道我耳机里放着什么（尤其 ASMR/情感夜话的暧昧场景，角色可撞破/递一只耳机一起听）。',
      module: '播放器', what: '玩家此刻正在听的节目/主播/当前单集/进度/分类',
      guide: '后文怎么体现：可让角色注意到「我」戴着耳机在听什么，据此调侃、好奇、要一起听，或撞破我在听私密内容的尴尬暧昧。节目信息已给全，请严格照此，别新编。',
      build: () => {
        const p = getPlayer(); if (!p.albumId || !p.epId) return null;
        const a = getAlbum(p.albumId); const ep = getEpisode(p.albumId, p.epId); if (!a || !ep) return null;
        const body = `· 正在听：《${a.title}》（${a.cat}${a.voiceTone ? '·' + a.voiceTone : ''}）主播${a.host}\n· 当前：第${ep.no}集「${ep.title}」 ${fmtDur(p.positionSec)}/${fmtDur(ep.durationSec)}${p.playing ? '（播放中）' : '（暂停）'}`;
        return { body, meta: { 分类: a.cat } };
      },
    },
    {
      id: 'subs', name: '我追更的节目', kind: 'state',
      desc: '把「我」追更/收藏的节目注入正文，让角色知道我最近在追哪些声音。',
      module: '我听的', what: '玩家追更中与收藏的声音节目清单（含主播/分类/进度）',
      guide: '后文怎么体现：让角色知道「我」的听单口味与在追的节目，可据此安利、调侃或投其所好。',
      build: () => {
        const u = getUser();
        const subs = u.subscriptions.map(id => getAlbum(id)).filter(Boolean).slice(0, 6) as XmAlbum[];
        if (!subs.length) return null;
        const body = subs.map(a => `· 《${a.title}》（${a.cat}·主播${a.host}${a.updatedEp ? '·更新至' + a.updatedEp + '集' : ''}）`).join('\n');
        return { body, meta: { 等级: `Lv.${u.level} ${levelTitle(u.level)}`, 听龄: `${(u.listenSec / 3600).toFixed(1)}h` } };
      },
    },
    {
      id: 'hotcast', name: '当前热门声音/顶流', kind: 'fact',
      desc: '把平台当前热门节目/顶流主播注入正文，作为「最近大家都在听什么」的背景（含主播/播放量/一句简介，信息完整避免正文瞎编）。',
      module: '推荐/声音榜', what: '喜马上当前最火的几档节目与完整档案',
      guide: '后文怎么体现：当剧情触及听广播/追剧/闲聊时，可让角色提及这些正当红的节目与主播作为生活背景。节目信息已给全，请严格照此描述，别新编节目名。',
      build: () => {
        const hot = getAlbums().filter(a => a.plays > 0).slice(0, 6);
        const list = hot.length ? hot : getAlbums().slice(0, 6);
        if (!list.length) return null;
        return { body: list.map(a => xmAlbumInjectLine(a)).join('\n'), meta: { 条数: String(list.length) } };
      },
    },
  ],
});

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_xmly__ = { openXmly };
} catch (e) { void e; }
















