import { esc, escAttr, qs } from '../../lib/dom-utils';
import { openModal2 } from '../../status-bar-init';
import { phoneShellHtml, startPhoneClock } from '../../lib/world/phone-shell';
import { iconHtml } from '../../lib/icons';
import { registerWorldApp } from '../../lib/world/world-store';
import { registerAutoAgent, shouldAutoTrigger } from '../../lib/world/auto-registry';
import { listContactsForApp, getContact } from '../../lib/world/contacts';
import { chatGenerate, readTavernFloors, parseLooseJson, getTavernFloorCount } from '../../lib/world/ai-chat';
import { thToast, thConfirm, thPrompt } from '../../lib/world/ui-kit';
import { getPromptText, listPromptTemplates, isPromptOverridden, buildCatWbContext, setPromptOverride, resetPrompt } from '../../lib/world/world-prompts';
import { registerApiPlan, planCount, isFeatureOn } from '../../lib/world/api-plan';
import { registerInjectPlan, addToStash } from '../../lib/world/inject-plan';
import { noteToPool } from '../../lib/world/memory';
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
import '../../lib/world/zui-prompts';   // 注册 zui.* 提示词
import {
  getZuiSettings, updateZuiSettings, ZuiSettings,
  ZUI_CATS, ZUI_RANK_KINDS, getCategories, addCustomCat, deleteCustomCat, getCatPrompt, setCatPrompt, isNightCat,
  getPosts, getOldestPosts, getPost, randomPost, addPosts, updatePost, likePost, deletePost, clearAiPosts, ZuiPost, ZuiPostKind,
  addComments, likeComment, deleteComment, toggleGod, addReply, clearAiComments, ZuiComment,
  getMemes, addMemes, deleteMeme, clearAiMemes, ZuiMeme,
  getRank, upsertRank,
  getUser, addSagao, grantBadge, setPersona, addHighlight, removeHighlight, saveEmoji, removeEmoji, bumpHappy,
  levelTitle, sagaoToNext,
  clearAll,
} from '../../lib/world/zui-store';

const RID = 'th-zui-root';
const ZUI_MODAL_MAXW = 'min(1120px,97vw)';
function rootEl(): HTMLElement | null { return qs<HTMLElement>('#' + RID); }
// PLACEHOLDER_ZUI_STATE
// ==================== 主题 / 字体 ====================
export const ZUI_THEMES = [
  { key: 'yellow', name: '抽象黄（默认）' },
  { key: 'night', name: '深夜放飞黑' },
  { key: 'meme', name: '梗图荧光' },
  { key: 'rose', name: '嗑糖粉' },
  { key: 'mint', name: '摸鱼薄荷' },
  { key: 'orange', name: '暖橙乐子' },
];
export const ZUI_FONTS = [
  { key: 'system', name: '系统默认' },
  { key: 'rounded', name: '圆润可爱' },
  { key: 'marker', name: '手写马克笔' },
];

// ==================== 视图状态 ====================
type Tab = 'feed' | 'cats' | 'memes' | 'mine';
type View =
  | { name: 'tab'; tab: Tab }
  | { name: 'post'; id: string }
  | { name: 'settings' };
let _view: View = { name: 'tab', tab: 'feed' };
let _cat = '';                 // 当前频道快筛（空=全部）
let _busy = false;
let _setCat = 'context';
let _promptEditId: string | null = null;
let _lastZuiAuto = 20;         // 记住上次自动间隔，开关重开时复用
let _battle: { a?: string; b?: string } = {};   // 神评 battle 选中的两条
let _archae = false;             // 考古模式：最早帖子优先

// 帖子形态元数据
const KIND_META: Record<ZuiPostKind, { icon: string; label: string }> = {
  text: { icon: 'fa-comment', label: '段子' },
  image: { icon: 'fa-image', label: '沙雕图' },
  video: { icon: 'fa-video', label: '沙雕视频' },
  emoji: { icon: 'fa-face-smile', label: '表情包' },
  comic: { icon: 'fa-pen-fancy', label: '灵魂画手' },
  story: { icon: 'fa-reply', label: '段子接龙' },
};
// PLACEHOLDER_ZUI_HELPERS
// ==================== 生态 / 世界信息 ====================
function zuiJailbreak(): string { return (getPromptText('zui.jailbreak') || '').trim(); }

function ecoDirective(): string {
  const s = getZuiSettings();
  const lvl = (n: number, v0: string, v1: string, v2: string, v3: string, v4: string) =>
    n < 40 ? v0 : n < 80 ? v1 : n < 120 ? v2 : n < 160 ? v3 : v4;
  const lines = [
    `· 社区活跃度：${lvl(s.ecoActivity, '冷清，帖子少、评论稀', '正常，常见帖子与神评都有', '热闹，上帖与神评活跃', '相当热闹，热帖频出、评论区盖楼刷屏', '非常热闹：热帖霸屏+神评封神不断+对线连场')}`,
    `· 内容真实度：${lvl(s.ecoQuality, '清一色捧场叫好，几乎无踩（水军感）', '捧场为主，偶有理性吐槽', '捧踩混杂、比较真实', '相当真实，拆台/挑刺/对线不少', '极真实：翻车/拆穿/理性长评频出，评价两极')}`,
    `· 阴阳怪气度：${lvl(s.ecoYinyang, '基本直球，少反讽', '偶带阴阳怪气', '反讽夹枪带棒常见', '阴阳味浓：句句反话、皮里阳秋', '阴阳拉满：全程反讽、字缝里都是戏（仍是善意乐子，不真恶意）')}`,
    `· 玩梗密度：${lvl(s.ecoMeme, '朴实说话，少玩梗', '偶尔玩个热梗', '热梗黑话常见', '梗密度高：黑话/谐音/热梗堆叠', '玩梗爆表：满屏抽象黑话、懂的都懂、看不懂但大受震撼')}`,
    `· 塌房吃瓜/网暴烈度（⚠）：${lvl(s.ecoToxic, '零恶意，最多温和吐槽', '偶有避雷/吃瓜', '有塌房小瓜与对线', '吃瓜明显：塌房瓜/人设崩/对线常见', '烈度拉满：塌房大瓜、网暴对线激烈（仍锁虚构娱乐、幸福的烦恼级，不致郁不搞真恶意）')}`,
    `· 色情度（露骨程度，作用于全 app 所有频道与内容——帖子/配字/画面描述/神评皆吃此阀，emo树洞/沙雕日常等天然清水内容除外）：${lvl(s.ecoErotic, '整体清水，最多暧昧双关，不出露骨表述', '偶有擦边/暧昧向的梗与文案，含蓄点到', '擦边梗稳定存在，适度直白', '露骨内容活跃：擦边梗/嗑糖/深夜区直白大胆', '露骨爆表：全频道可带情色浓度，深夜区尺度顶满（全女百合、虚构娱乐）')}`,
    `· 肉欲度（肉体诱惑表现，作用于全 app——擦边梗里的肉欲暗示、嗑糖的暧昧氛围统一吃此阀）：${lvl(s.ecoCarnal, '克制点到为止，少肉欲暗示', '略带暧昧，偶有撩拨', '适度肉欲暗示，氛围有撩拨', '肉欲张力强：暧昧撩拨浓墨重彩', '肉欲拉满：极致暧昧撩拨层层堆叠（虚构娱乐）')}`,
  ];
  const tpl = getPromptText('zui.frag.eco');
  return (tpl && tpl.indexOf('{{lines}}') >= 0) ? tpl.replace('{{lines}}', lines.join('\n')) : lines.join('\n');
}

// 世界信息块（最近正文 + 世界态当季/榜单，供生成对齐）
function worldBlock(extra?: string): string {
  const s = getZuiSettings();
  const parts: string[] = [];
  if (s.useFloors && s.floorCount > 0) { try { const fl = readTavernFloors(s.floorCount); if (fl && fl.trim()) parts.push('【最近剧情】\n' + fl.trim()); } catch (e) { void e; } }
  try {
    const ws = getWorldState();
    if (ws.calendar && (ws.calendar.season || ws.calendar.festival)) parts.push(`【当季时令】${[ws.calendar.season, ws.calendar.festival].filter(Boolean).join('·')}${ws.calendar.daysToNext ? '（' + ws.calendar.daysToNext + '）' : ''}`);
    const seasonOn = ws.season.filter(x => x.status !== '已落幕').map(x => x.name);
    if (seasonOn.length) parts.push(`【当季大事】${seasonOn.join('、')}（可衍生相关话题梗与热帖）`);
    const rk = (ws.ranking?.entries || []).slice(0, 5).map(x => x.name).filter(Boolean);
    if (rk.length) parts.push(`【万花镜当红】${rk.join('、')}（热榜/显眼包可呼应）`);
  } catch (e) { void e; }
  if (extra && extra.trim()) parts.push(extra.trim());
  return parts.length ? parts.join('\n\n') : '（暂无额外世界信息，按本卡世界观与常识发挥）';
}

// 绑定世界书条目内容（作为设定来源）
async function boundWbText(): Promise<string> {
  const s = getZuiSettings();
  if (!(s.worldbookEntryKeys || []).length) return '';   // 勾了条目就注入
  try { return await buildInjectFromKeys(s.worldbookEntryKeys); } catch (e) { void e; return ''; }
}
// 某频道的引导
function catGuide(cat: string): string {
  if (!cat) return '综合各频道，混出一条风格各异的乐子流（段子/沙雕图/抽象话/表情包/接龙等都可有）。';
  return getCatPrompt(cat) || `围绕「${cat}」频道产出短帖。`;
}
// 具名马甲池（读通讯录，偶尔具名用）
function castLine(): string {
  try {
    const cs = listContactsForApp('zui');
    const names = cs.filter(c => !c.isUser).map(c => c.name).filter(Boolean).slice(0, 24);
    return names.length ? names.join('、') : '（通讯录为空，全用匿名马甲）';
  } catch (e) { void e; return '（全用匿名马甲）'; }
}
// 本站热梗行（喂生成）
function memesLine(): string {
  const ms = getMemes().slice(0, 8);
  return ms.length ? ms.map(m => `${m.term}：${m.meaning}`).join('\n') : '（暂无热梗，可顺手造几个新梗）';
}
function fmtLikes(n: number): string { return n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, '') + '万' : String(n); }
// 帖子注入行（注入必带完整字段，避免正文 AI 瞎编）
function zuiPostInjectLine(p: ZuiPost): string {
  const bits = [
    `【${KIND_META[p.kind]?.label || '帖'}·${p.channel}】${p.title ? '《' + p.title + '》' : ''}`,
    p.body ? p.body.slice(0, 60) : '',
    p.imageDesc ? `（画面：${p.imageDesc}）` : '',
    p.videoScript ? `（视频：${p.videoScript}）` : '',
    `by ${p.authorAlias}`,
    `👍${fmtLikes(p.likes)}`,
  ].filter(Boolean);
  return '· ' + bits.join('；');
}
// 记忆池：能识别到具体联系人时写一条轻互动（匿名马甲不写）
function notePoolIfIdentified(contactId: string | undefined, action: string): void {
  if (!contactId) return;
  try { const c = getContact(contactId); if (c && !c.isUser) noteToPool(contactId, c.name, 'zui', '最右', action); } catch (e) { void e; }
}
// PLACEHOLDER_ZUI_GEN
// ==================== AI 生成 ====================
// 铺帖子流：mode 增量/覆盖。cat 空=综合。
async function aiFeed(cat: string, mode: 'incremental' | 'overwrite'): Promise<void> {
  if (_busy) { thToast('正在生成，请稍候', 'warn'); return; }
  if (!isFeatureOn('zui', 'feed')) { thToast('「铺帖子」产出项已在设置·API利用里关闭', 'warn'); return; }
  if (mode === 'overwrite') {
    const ok = await thConfirm({ title: '覆盖刷新', message: `清掉${cat ? '「' + cat + '」' : ''}AI 铺的路人帖后重新铺一批？（保留你发的/精华/关联角色的）`, confirmText: '覆盖刷新', danger: true });
    if (!ok) return;
  }
  _busy = true; render();
  try {
    const count = planCount('zui', 'postCount') || 10;
    const catWb = cat ? await buildCatWbContext('zui', cat) : (await boundWbText());
    const system = getPromptText('zui.feed')
      .replace(/\{\{\s*worldBlock\s*\}\}/g, worldBlock())
      .replace(/\{\{\s*cat\s*\}\}/g, cat || '综合')
      .replace(/\{\{\s*catGuide\s*\}\}/g, catGuide(cat))
      .replace(/\{\{\s*catWb\s*\}\}/g, catWb || '（未绑定专属设定，按世界观常识发挥）')
      .replace(/\{\{\s*cast\s*\}\}/g, castLine())
      .replace(/\{\{\s*memes\s*\}\}/g, memesLine())
      .replace(/\{\{\s*eco\s*\}\}/g, ecoDirective())
      .replace(/\{\{\s*count\s*\}\}/g, String(count));
    const raw = await chatGenerate({ system, user: `请刷新「${cat || '综合'}」的乐子流，只输出 JSON 数组。`, aiPresetName: undefined, shouldStream: false, jailbreak: zuiJailbreak(), appId: 'zui' });
    const arr = parseLooseJson(raw);
    if (!Array.isArray(arr) || !arr.length) { thToast('没有生成有效帖子', 'error'); return; }
    if (mode === 'overwrite') clearAiPosts(cat || undefined);
    addPosts(arr as Partial<ZuiPost>[], cat || (arr[0]?.channel || '沙雕日常'), { isAi: true });
    thToast(`已铺 ${arr.length} 条帖`, 'success');
  } catch (err) { thToast('铺帖子失败：' + (err instanceof Error ? err.message : String(err)), 'error'); }
  finally { _busy = false; render(); }
}

// 为某帖生成神评区：mode 覆盖/增量
async function aiComments(postId: string, mode: 'incremental' | 'overwrite'): Promise<void> {
  if (_busy) { thToast('正在生成，请稍候', 'warn'); return; }
  if (!isFeatureOn('zui', 'comment')) { thToast('「神评」产出项已在设置里关闭', 'warn'); return; }
  const p = getPost(postId); if (!p) return;
  _busy = true; render();
  try {
    const count = planCount('zui', 'commentCount') || 8;
    const system = getPromptText('zui.comments')
      .replace(/\{\{\s*post\s*\}\}/g, postBrief(p))
      .replace(/\{\{\s*cast\s*\}\}/g, castLine())
      .replace(/\{\{\s*eco\s*\}\}/g, ecoDirective())
      .replace(/\{\{\s*count\s*\}\}/g, String(count));
    const raw = await chatGenerate({ system, user: `为这条帖生成 ${count} 条神评，只输出 JSON 数组。`, aiPresetName: undefined, shouldStream: false, jailbreak: zuiJailbreak(), appId: 'zui' });
    const arr = parseLooseJson(raw);
    if (!Array.isArray(arr) || !arr.length) { thToast('没有生成有效神评', 'error'); return; }
    if (mode === 'overwrite') clearAiComments(postId);
    addComments(postId, (arr as Partial<ZuiComment>[]).map(c => ({ ...c, isAi: true })));
    thToast(`已生成 ${arr.length} 条神评`, 'success');
  } catch (err) { thToast('生成神评失败：' + (err instanceof Error ? err.message : String(err)), 'error'); }
  finally { _busy = false; render(); }
}

// 挖坟考古 / 普通封神：给某帖来一条封神神评
async function aiGodReply(postId: string, archaeology = false): Promise<void> {
  if (_busy) { thToast('正在生成，请稍候', 'warn'); return; }
  if (!isFeatureOn('zui', 'comment')) { thToast('「神评」产出项已在设置里关闭', 'warn'); return; }
  const p = getPost(postId); if (!p) return;
  _busy = true; render();
  try {
    const system = getPromptText('zui.godreply')
      .replace(/\{\{\s*post\s*\}\}/g, postBrief(p))
      .replace(/\{\{\s*mode\s*\}\}/g, archaeology ? 'archaeology' : 'normal')
      .replace(/\{\{\s*eco\s*\}\}/g, ecoDirective());
    const raw = await chatGenerate({ system, user: archaeology ? '来一条考古现场式封神神评，只输出 JSON 对象。' : '来一条封神神评，只输出 JSON 对象。', aiPresetName: undefined, shouldStream: false, jailbreak: zuiJailbreak(), appId: 'zui' });
    const obj = parseLooseJson(raw);
    if (!obj || !obj.body) { thToast('没有生成有效神评', 'error'); return; }
    addComments(postId, [{ alias: obj.alias || '匿名乐子人', body: obj.body, likes: typeof obj.likes === 'number' ? obj.likes : (500 + Math.floor(Math.random() * 1500)), personaTag: obj.personaTag, homophone: obj.homophone, isGod: true, isAi: true }]);
    thToast(archaeology ? '考古成功，一条神评封神' : '一条神评封神了', 'success');
  } catch (err) { thToast('封神失败：' + (err instanceof Error ? err.message : String(err)), 'error'); }
  finally { _busy = false; render(); }
}

// 玩家发帖后 AI 造神评区
async function aiPlayerPostReplies(postId: string): Promise<void> {
  if (_busy) return;
  const p = getPost(postId); if (!p) return;
  _busy = true; render();
  try {
    const count = planCount('zui', 'commentCount') || 8;
    const system = getPromptText('zui.playerpost')
      .replace(/\{\{\s*post\s*\}\}/g, postBrief(p))
      .replace(/\{\{\s*cast\s*\}\}/g, castLine())
      .replace(/\{\{\s*eco\s*\}\}/g, ecoDirective())
      .replace(/\{\{\s*count\s*\}\}/g, String(count));
    const raw = await chatGenerate({ system, user: `为「我」发的这条帖造 ${count} 条神评区反应，只输出 JSON 数组。`, aiPresetName: undefined, shouldStream: false, jailbreak: zuiJailbreak(), appId: 'zui' });
    const arr = parseLooseJson(raw);
    if (Array.isArray(arr) && arr.length) {
      addComments(postId, (arr as Partial<ZuiComment>[]).map(c => ({ ...c, isAi: true })));
      thToast(`评论区来了 ${arr.length} 条反应`, 'success');
    }
  } catch (err) { thToast('生成神评区失败：' + (err instanceof Error ? err.message : String(err)), 'error'); }
  finally { _busy = false; render(); }
}

// 造本站热梗
async function aiMemes(mode: 'incremental' | 'overwrite'): Promise<void> {
  if (_busy) { thToast('正在生成，请稍候', 'warn'); return; }
  if (!isFeatureOn('zui', 'meme')) { thToast('「热梗」产出项已在设置里关闭', 'warn'); return; }
  _busy = true; render();
  try {
    const count = Math.max(3, Math.min(10, planCount('zui', 'memeCount') || 6));
    const system = getPromptText('zui.meme')
      .replace(/\{\{\s*worldBlock\s*\}\}/g, worldBlock())
      .replace(/\{\{\s*eco\s*\}\}/g, ecoDirective())
      .replace(/\{\{\s*count\s*\}\}/g, String(count));
    const raw = await chatGenerate({ system, user: `造 ${count} 个本站热梗，只输出 JSON 数组。`, aiPresetName: undefined, shouldStream: false, jailbreak: zuiJailbreak(), appId: 'zui' });
    const arr = parseLooseJson(raw);
    if (!Array.isArray(arr) || !arr.length) { thToast('没有生成有效热梗', 'error'); return; }
    if (mode === 'overwrite') clearAiMemes();
    addMemes(arr as Partial<ZuiMeme>[], { isAi: true });
    thToast(`已造 ${arr.length} 个热梗`, 'success');
  } catch (err) { thToast('造梗失败：' + (err instanceof Error ? err.message : String(err)), 'error'); }
  finally { _busy = false; render(); }
}

// 抽象人格画像
async function aiPersona(): Promise<void> {
  if (_busy) { thToast('正在生成，请稍候', 'warn'); return; }
  _busy = true; render();
  try {
    const u = getUser();
    const chFreq: Record<string, number> = {};
    getPosts().forEach(p => { if (p.authorAlias === '我') chFreq[p.channel] = (chFreq[p.channel] || 0) + 1; });
    const topCh = Object.entries(chFreq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]).join('、') || '（还没常逛的频道）';
    const stats = `围观 ${u.browsed} 条；我发过 ${getPosts().filter(p => p.authorAlias === '我').length} 帖；收藏表情包 ${u.savedEmojis.length} 个；名场面 ${u.highlights.length} 条；常逛频道：${topCh}；当前 Lv.${u.level} ${levelTitle(u.level)}`;
    const system = getPromptText('zui.persona')
      .replace(/\{\{\s*stats\s*\}\}/g, stats)
      .replace(/\{\{\s*eco\s*\}\}/g, ecoDirective());
    const raw = await chatGenerate({ system, user: '给我生成一段抽象人格画像，只输出正文。', aiPresetName: undefined, shouldStream: false, jailbreak: zuiJailbreak(), appId: 'zui' });
    const text = (raw || '').trim();
    if (!text) { thToast('没有生成内容', 'error'); return; }
    setPersona(text); thToast('抽象人格画像已生成', 'success');
  } catch (err) { thToast('生成画像失败：' + (err instanceof Error ? err.message : String(err)), 'error'); }
  finally { _busy = false; render(); }
}

// 生成/刷新某热榜
async function aiRank(kindId: string): Promise<void> {
  if (_busy) { thToast('正在生成，请稍候', 'warn'); return; }
  if (!isFeatureOn('zui', 'rank')) { thToast('「热榜」产出项已在设置里关闭', 'warn'); return; }
  const meta = ZUI_RANK_KINDS.find(k => k.id === kindId); if (!meta) return;
  const posts = getPosts();
  if (posts.length < 3) { thToast('帖子太少，先去「乐子流」刷几条再评榜', 'warn'); return; }
  _busy = true; render();
  try {
    const lines = posts.slice(0, 30).map(p => {
      const god = p.comments.find(c => c.isGod);
      return `《${p.title || p.body.slice(0, 12)}》｜${p.channel}｜by ${p.authorAlias}｜👍${fmtLikes(p.likes)}${god ? `｜神评「${god.body.slice(0, 20)}」` : ''}`;
    }).join('\n');
    const count = Math.min(10, Math.max(5, Math.floor(posts.length / 2)));
    const system = getPromptText('zui.rank')
      .replace(/\{\{\s*rankTitle\s*\}\}/g, meta.title)
      .replace(/\{\{\s*posts\s*\}\}/g, lines)
      .replace(/\{\{\s*worldBlock\s*\}\}/g, worldBlock())
      .replace(/\{\{\s*count\s*\}\}/g, String(count));
    const raw = await chatGenerate({ system, user: `评出「${meta.title}」，只输出 JSON 对象。`, aiPresetName: undefined, shouldStream: false, jailbreak: zuiJailbreak(), appId: 'zui' });
    const obj = parseLooseJson(raw);
    const entries = Array.isArray(obj?.entries) ? obj.entries : [];
    if (!entries.length) { thToast('没有生成有效榜单', 'error'); return; }
    const mapped = entries.map((e: any) => {
      const hit = posts.find(p => (p.title && p.title === e.name) || p.authorAlias === e.name) || posts.find(p => (e.name || '').includes((p.title || '').slice(0, 6)));
      return { name: e.name || '', reason: e.reason || '', postId: hit?.id };
    }).filter((e: any) => e.name);
    upsertRank(kindId, meta.title, mapped, obj?.note);
    thToast(`已更新「${meta.title}」`, 'success');
  } catch (err) { thToast('生成榜单失败：' + (err instanceof Error ? err.message : String(err)), 'error'); }
  finally { _busy = false; render(); }
}
function postBrief(p: ZuiPost): string {
  return `【${KIND_META[p.kind]?.label}·${p.channel}】${p.title ? '标题《' + p.title + '》，' : ''}正文：${p.body || '（无正文）'}${p.imageDesc ? `，画面：${p.imageDesc}` : ''}${p.videoScript ? `，视频：${p.videoScript}` : ''}`;
}
// PLACEHOLDER_ZUI_VIEWS
// ==================== 视图 HTML ====================
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'feed', icon: 'fa-fire-flame-curved', label: '乐子流' },
  { id: 'cats', icon: 'fa-hashtag', label: '频道' },
  { id: 'memes', icon: 'fa-bolt', label: '梗百科' },
  { id: 'mine', icon: 'fa-user', label: '我的' },
];
function curTab(): Tab | '' { return _view.name === 'tab' ? _view.tab : ''; }

function sidebarHtml(): string {
  const u = getUser();
  const s = getZuiSettings();
  const goal = s.happyGoal || 10;
  const today = new Date().toDateString();
  const happy = u.happyDate === today ? u.happyToday : 0;
  const happyPct = Math.min(100, Math.round(happy / goal * 100));
  const navBtn = (tab: Tab, icon: string, label: string, badge?: string) => {
    const on = curTab() === tab;
    return `<button class="thw-zui-nav${on ? ' on' : ''}" data-zui-tab="${tab}" type="button"><span class="thw-zui-nav-ico">${iconHtml(icon)}</span><span class="thw-zui-nav-lbl">${esc(label)}</span>${badge ? `<span class="thw-zui-nav-badge">${badge}</span>` : ''}</button>`;
  };
  const setOn = _view.name === 'settings';
  return `<aside class="thw-sidebar thw-zui-side">
    <div class="thw-zui-brand">${iconHtml('fa-face-smile')} <b>最右</b></div>
    <div class="thw-zui-happy" title="今日快乐进度">
      <div class="thw-zui-happy-top">${iconHtml('fa-face-smile')} 今日快乐 ${happy}/${goal}</div>
      <div class="thw-zui-happy-bar"><span style="width:${happyPct}%"></span></div>
    </div>
    <div class="thw-zui-navsec">逛</div>
    <nav class="thw-zui-navs">
      ${navBtn('feed', 'fa-fire-flame-curved', '乐子流')}
      ${navBtn('cats', 'fa-hashtag', '频道')}
      ${navBtn('memes', 'fa-bolt', '梗百科', getMemes().length ? String(getMemes().length) : '')}
      <button class="thw-zui-nav thw-zui-nav-night${_cat === '深夜区' ? ' on' : ''}" data-zui-night type="button"><span class="thw-zui-nav-ico">${iconHtml('fa-moon')}</span><span class="thw-zui-nav-lbl">深夜区</span><span class="thw-zui-nav-badge thw-zui-night-badge">18+</span></button>
    </nav>
    <div class="thw-zui-navsec">我的</div>
    <nav class="thw-zui-navs">
      ${navBtn('mine', 'fa-user', '我的', u.highlights.length ? String(u.highlights.length) : '')}
    </nav>
    <button class="thw-zui-nav thw-zui-nav-lucky" data-zui-lucky type="button"><span class="thw-zui-nav-ico">${iconHtml('fa-dice')}</span><span class="thw-zui-nav-lbl">随机一发</span></button>
    <button class="thw-zui-nav thw-zui-nav-post" data-zui-post-new type="button"><span class="thw-zui-nav-ico">${iconHtml('fa-pen-fancy')}</span><span class="thw-zui-nav-lbl">发条右</span></button>
    <span class="thw-zui-side-grow"></span>
    <button class="thw-zui-nav thw-zui-nav-set${setOn ? ' on' : ''}" data-zui-settings type="button"><span class="thw-zui-nav-ico">${iconHtml('fa-gear')}</span><span class="thw-zui-nav-lbl">设置</span></button>
  </aside>`;
}

// 帖子卡（中列乐子流）——神评顶置高亮
function postCardHtml(p: ZuiPost): string {
  const sel = _view.name === 'post' && _view.id === p.id;
  const km = KIND_META[p.kind] || KIND_META.text;
  const badges = [
    p.isHot ? `<span class="thw-zui-badge hot">${iconHtml('fa-fire-flame-curved')}热</span>` : '',
    p.isEssence ? `<span class="thw-zui-badge essence">${iconHtml('fa-crown')}精华</span>` : '',
    isNightCat(p.channel) ? `<span class="thw-zui-badge night">${iconHtml('fa-moon')}深夜</span>` : '',
  ].filter(Boolean).join('');
  const god = p.comments.find(c => c.isGod);
  const godLine = god ? `<div class="thw-zui-godline">${iconHtml('fa-crown')}<span class="thw-zui-god-badge">神评已封神</span> <b>${esc(god.alias)}</b>：${esc(god.body)} <span class="thw-zui-god-like">${iconHtml('fa-thumbs-up')}${fmtLikes(god.likes)}</span></div>` : '';
  const media = mediaHtml(p, false);
  return `<div class="thw-zui-pcard${sel ? ' on' : ''}${p.isEssence ? ' essence' : ''}" data-zui-post="${esc(p.id)}">
    <div class="thw-zui-pcard-head">
      <span class="thw-zui-pcard-kind">${iconHtml(km.icon)} ${esc(km.label)}</span>
      <span class="thw-zui-pcard-alias">${iconHtml('fa-user-secret')} ${esc(p.authorAlias)}</span>
      <span class="thw-zui-pcard-ch">#${esc(p.channel)}</span>
      ${badges}
    </div>
    ${p.title ? `<div class="thw-zui-pcard-title">${esc(p.title)}</div>` : ''}
    ${p.body ? `<div class="thw-zui-pcard-body">${esc(p.body).replace(/\n/g, '<br>')}</div>` : ''}
    ${media}
    ${godLine}
    <div class="thw-zui-pcard-meta">
      <button class="thw-zui-pcard-like" data-zui-like="${esc(p.id)}" type="button">${iconHtml('fa-thumbs-up')} ${fmtLikes(p.likes)}</button>
      <span class="thw-zui-pcard-cmn">${iconHtml('fa-comment-dots')} ${p.comments.length}</span>
    </div>
  </div>`;
}
// 多模态：用画面描述表现图片/视频/表情包/灵魂画手
function mediaHtml(p: ZuiPost, big: boolean): string {
  if (p.kind === 'text' || p.kind === 'story') return '';
  if (!p.imageDesc && !p.videoScript) return '';
  const km = KIND_META[p.kind];
  const cls = p.kind === 'emoji' ? 'emoji' : p.kind === 'video' ? 'video' : p.kind === 'comic' ? 'comic' : 'image';
  return `<div class="thw-zui-img ${cls}${big ? ' big' : ''}">
    <span class="thw-zui-img-ico">${iconHtml(km.icon)}</span>
    ${p.imageDesc ? `<span class="thw-zui-img-desc">${esc(p.imageDesc)}</span>` : ''}
    ${p.videoScript ? `<span class="thw-zui-video-script">${iconHtml('fa-video')} ${esc(p.videoScript)}</span>` : ''}
  </div>`;
}
// PLACEHOLDER_ZUI_VIEWS_2
// 中列顶栏：频道快筛 + 覆盖/增量刷新
function tabTopbar(tab: Tab, showCatStrip: boolean): string {
  const title = TABS.find(t => t.id === tab)?.label || '';
  let ops = '';
  if (tab === 'feed') {
    ops = `<button class="thw-btn thw-btn-mini${_archae ? ' on' : ''}" data-zui-archae type="button" title="考古模式：跳过新鲜，最先发帖的老帖排前${_cat ? '（忽略当前频道筛选）' : ''}">${iconHtml('fa-magnifying-glass')} 考古</button>`;
  }
  if (tab === 'feed' || tab === 'cats') {
    ops += `<button class="thw-btn thw-btn-mini" data-zui-refresh type="button" ${_busy ? 'disabled' : ''} title="增量铺一批新帖${_cat ? '（' + _cat + '）' : ''}">${_busy ? iconHtml('fa-spinner') : iconHtml('fa-rotate')} 刷新${_cat ? esc(_cat) : ''}</button>
      <button class="thw-btn thw-btn-mini" data-zui-refresh-ow type="button" ${_busy ? 'disabled' : ''} title="清路人帖后重铺（保留你发的/精华/角色的）">${iconHtml('fa-eraser')} 覆盖刷新</button>`;
  } else if (tab === 'memes') {
    ops = `<button class="thw-btn thw-btn-mini" data-zui-meme-refresh type="button" ${_busy ? 'disabled' : ''} title="造一批本站热梗">${_busy ? iconHtml('fa-spinner') : iconHtml('fa-rotate')} 造梗</button>
      <button class="thw-btn thw-btn-mini" data-zui-meme-refresh-ow type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-eraser')} 覆盖</button>`;
  }
  const catStrip = showCatStrip ? (() => {
    const cats = getCategories();
    const chips = `<button class="thw-zui-catchip${_cat === '' ? ' on' : ''}" data-zui-cat="" type="button">全部</button>` +
      cats.map(c => `<button class="thw-zui-catchip${_cat === c.name ? ' on' : ''}${(c as any).night ? ' night' : ''}" data-zui-cat="${escAttr(c.name)}" type="button">${iconHtml(c.icon)} ${esc(c.name)}</button>`).join('');
    return `<div class="thw-zui-catstrip">${chips}</div>`;
  })() : '';
  return `<div class="thw-topbar">
    <span class="thw-topbar-title">${iconHtml(TABS.find(t => t.id === tab)?.icon || 'fa-fire-flame-curved')} ${esc(title)}${_cat && showCatStrip ? ` · ${esc(_cat)}` : ''}</span>
    <span class="thw-topbar-spacer"></span>${ops}
  </div>${catStrip}`;
}

function feedTabHtml(): string {
  const list = _archae ? getOldestPosts(50) : getPosts(_cat || undefined);
  const cards = list.length ? list.map(postCardHtml).join('')
    : `<div class="thw-empty"><div class="thw-empty-t">${_cat ? '「' + esc(_cat) + '」还没有帖子' : '还没有帖子'}</div><div class="thw-empty-d">点右上「刷新${_cat ? esc(_cat) : ''}」让乐子人们上帖、封神，把社区养起来。</div></div>`;
  return `<div class="thw-content thw-zui-content">${tabTopbar('feed', true)}<div class="thw-content-pad thw-zui-feed">${cards}</div></div>`;
}

// 频道 tab：按频道聚合，每类一栏横滑
function catsTabHtml(): string {
  const cats = getCategories();
  const all = getPosts();
  if (_cat) {
    const list = all.filter(p => p.channel === _cat);
    const cards = list.length ? list.map(postCardHtml).join('')
      : `<div class="thw-empty"><div class="thw-empty-t">「${esc(_cat)}」还没有帖子</div><div class="thw-empty-d">点右上「刷新${esc(_cat)}」铺这一频道。</div></div>`;
    return `<div class="thw-content thw-zui-content">${tabTopbar('cats', true)}<div class="thw-content-pad thw-zui-feed">${cards}</div></div>`;
  }
  const blocks = cats.map(c => {
    const list = all.filter(p => p.channel === c.name).slice(0, 8);
    if (!list.length) return '';
    const cards = list.map(p => `<button class="thw-zui-hcard" data-zui-post="${esc(p.id)}" type="button">
      <div class="thw-zui-hcard-kind">${iconHtml((KIND_META[p.kind] || KIND_META.text).icon)}</div>
      <div class="thw-zui-hcard-body">${esc((p.title || p.body || '（图）').slice(0, 22))}</div>
      <div class="thw-zui-hcard-meta">${iconHtml('fa-thumbs-up')}${fmtLikes(p.likes)} · ${p.comments.length}评</div>
    </button>`).join('');
    return `<div class="thw-zui-catsec"><div class="thw-zui-catsec-h"><span class="thw-zui-catsec-t">${iconHtml(c.icon)} ${esc(c.name)}${(c as any).night ? ' <em class="thw-zui-nighttag">深夜区</em>' : ''}</span><button class="thw-zui-catsec-more" data-zui-cat="${escAttr(c.name)}" type="button">全部 ${iconHtml('fa-chevron-right')}</button></div><div class="thw-zui-hscroll">${cards}</div></div>`;
  }).filter(Boolean).join('');
  const body = blocks || `<div class="thw-empty"><div class="thw-empty-t">频道里还没有帖子</div><div class="thw-empty-d">去「乐子流」刷新，或点某个频道单独铺。</div></div>`;
  return `<div class="thw-content thw-zui-content">${tabTopbar('cats', true)}<div class="thw-content-pad thw-zui-cats">${body}</div></div>`;
}

// 梗百科 tab
function memesTabHtml(): string {
  const ms = getMemes();
  const cards = ms.length ? ms.map(m => `<div class="thw-zui-memecard" data-zui-meme="${esc(m.term)}">
    <div class="thw-zui-memecard-h"><span class="thw-zui-meme-term">${iconHtml('fa-bolt')} ${esc(m.term)}</span><span class="thw-zui-meme-heat">${iconHtml('fa-fire-flame-curved')} ${fmtLikes(m.heat)}</span></div>
    <div class="thw-zui-meme-mean">${esc(m.meaning)}</div>
    <button class="thw-iconbtn thw-zui-meme-del" data-zui-meme-del="${esc(m.id)}" type="button" title="删除">${iconHtml('fa-trash')}</button>
  </div>`).join('')
    : `<div class="thw-empty"><div class="thw-empty-t">还没有热梗</div><div class="thw-empty-d">点右上「造梗」，让本站长出一批当下正流行的黑话热梗。</div></div>`;
  return `<div class="thw-content thw-zui-content">${tabTopbar('memes', false)}<div class="thw-content-pad thw-zui-memes">${cards}</div></div>`;
}
// PLACEHOLDER_ZUI_VIEWS_3
// 「我的」tab：成长看板 + 抽象人格画像 + 名场面 + 收藏表情库
function mineTabHtml(): string {
  const u = getUser();
  const prog = sagaoToNext(u.sagaoValue);
  const badges = u.badges.length ? u.badges.map(b => `<span class="thw-zui-badge2">${iconHtml('fa-crown')} ${esc(b)}</span>`).join('') : '<span class="thw-zui-dim">发帖、被顶神评、收藏表情包，解锁徽章</span>';
  const persona = u.persona
    ? `<div class="thw-zui-persona">${iconHtml('fa-user-secret')} ${esc(u.persona)}</div>`
    : '<div class="thw-zui-dim">还没有画像——多围观多发帖，让本站看穿你是个什么乐子人</div>';
  const highlights = u.highlights.length
    ? u.highlights.map(h => `<div class="thw-zui-hl"><div class="thw-zui-hl-body">${esc(h.body)}</div><div class="thw-zui-hl-meta">${iconHtml('fa-thumbs-up')} ${fmtLikes(h.likes)}${h.postTitle ? ` · 于《${esc(h.postTitle)}》` : ''}<button class="thw-iconbtn" data-zui-hl-del="${esc(h.id)}" type="button">${iconHtml('fa-xmark')}</button></div></div>`).join('')
    : '<div class="thw-zui-dim">被顶爆的神评会存进这里成为你的名场面</div>';
  const emojis = u.savedEmojis.length
    ? u.savedEmojis.map(e => `<div class="thw-zui-emoji" title="${escAttr(e.imageDesc)}"><span class="thw-zui-emoji-ico">${iconHtml('fa-face-smile')}</span><span class="thw-zui-emoji-body">${esc(e.body || e.imageDesc.slice(0, 12))}</span><button class="thw-iconbtn" data-zui-emoji-del="${esc(e.id)}" type="button">${iconHtml('fa-xmark')}</button></div>`).join('')
    : '<div class="thw-zui-dim">在表情包帖里点「收藏进表情库」攒表情包</div>';
  return `<div class="thw-content thw-zui-content">
    <div class="thw-topbar"><span class="thw-topbar-title">${iconHtml('fa-user')} 我的</span></div>
    <div class="thw-content-pad thw-zui-mine">
      <div class="thw-zui-lvcard">
        <div class="thw-zui-lv-top"><span class="thw-zui-lv-title">${iconHtml('fa-face-smile')} Lv.${u.level} ${esc(levelTitle(u.level))}</span><span class="thw-zui-lv-exp">沙雕值 ${prog.cur}/${prog.need}</span></div>
        <div class="thw-zui-lv-bar"><span style="width:${prog.pct}%"></span></div>
        <div class="thw-zui-lv-stat">围观 ${u.browsed} · 名场面 ${u.highlights.length} · 表情库 ${u.savedEmojis.length}</div>
      </div>
      <div class="thw-zui-mine-sec">${iconHtml('fa-user-secret')} 抽象人格画像 <button class="thw-btn thw-btn-mini" data-zui-persona-gen type="button" ${_busy ? 'disabled' : ''}>${_busy ? iconHtml('fa-spinner') : iconHtml('fa-wand-magic-sparkles')} AI 生成</button></div>
      ${persona}
      <div class="thw-zui-mine-sec">${iconHtml('fa-crown')} 我的徽章</div>
      <div class="thw-zui-badges">${badges}</div>
      <div class="thw-zui-mine-sec">${iconHtml('fa-star')} 我的名场面 (${u.highlights.length})</div>
      <div class="thw-zui-highlights">${highlights}</div>
      <div class="thw-zui-mine-sec">${iconHtml('fa-image')} 收藏表情库 (${u.savedEmojis.length})</div>
      <div class="thw-zui-emojis">${emojis}</div>
    </div>
  </div>`;
}
// PLACEHOLDER_ZUI_DETAIL
// 楼中楼：递归渲染某条盖楼回复（自身可再挂子回复），每层都带「接一楼」按钮支持多层盖楼。
function replyCardHtml(p: ZuiPost, r: ZuiComment): string {
  const sub = (r.replies && r.replies.length)
    ? `<div class="thw-zui-replies">${r.replies.map(rr => replyCardHtml(p, rr)).join('')}</div>`
    : '';
  return `<div class="thw-zui-cm reply">
    <div class="thw-zui-cm-head"><span class="thw-zui-cm-floor">${r.floor}L</span><span class="thw-zui-cm-alias">${esc(r.alias)}</span>${r.personaTag ? `<span class="thw-zui-cm-persona">${esc(r.personaTag)}</span>` : ''}</div>
    <div class="thw-zui-cm-body">${esc(r.body).replace(/\n/g, '<br>')}</div>
    <div class="thw-zui-cm-ops">
      <button class="thw-zui-cm-like" data-zui-cm-like="${esc(p.id)}|${esc(r.id)}" type="button">${iconHtml('fa-thumbs-up')} ${fmtLikes(r.likes)}</button>
      <button class="thw-zui-cm-stack" data-zui-cm-reply="${esc(p.id)}|${esc(r.id)}" type="button" title="盖楼接龙">${iconHtml('fa-reply')}</button>
      <button class="thw-zui-cm-del" data-zui-cm-del="${esc(p.id)}|${esc(r.id)}" type="button">${iconHtml('fa-trash')}</button>
    </div>
    ${sub}
  </div>`;
}
// 右列：帖子详情（正文 + 画面 + 神评区 + 盖楼 + battle）
function commentCardHtml(p: ZuiPost, c: ZuiComment): string {
  const tags = [
    c.isGod ? `<span class="thw-zui-cm-god">${iconHtml('fa-crown')}封神</span>` : '',
    c.fishing ? `<span class="thw-zui-cm-fish">${iconHtml('fa-fish')}钓鱼</span>` : '',
    c.homophone ? `<span class="thw-zui-cm-homo">${iconHtml('fa-bolt')}谐音梗</span>` : '',
    c.personaTag ? `<span class="thw-zui-cm-persona">${esc(c.personaTag)}</span>` : '',
  ].filter(Boolean).join('');
  const inB = _battle.a === c.id || _battle.b === c.id;
  const replies = (c.replies && c.replies.length)
    ? `<div class="thw-zui-replies">${c.replies.map(r => replyCardHtml(p, r)).join('')}</div>`
    : '';
  return `<div class="thw-zui-cm${c.isGod ? ' god' : ''}${c.fishing ? ' fishing' : ''}${inB ? ' inbattle' : ''}" data-zui-cm-wrap="${esc(c.id)}">
    <div class="thw-zui-cm-head"><span class="thw-zui-cm-floor">${c.floor || ''}L</span><span class="thw-zui-cm-alias">${iconHtml('fa-user-secret')} ${esc(c.alias)}</span>${tags}</div>
    <div class="thw-zui-cm-body">${esc(c.body).replace(/\n/g, '<br>')}</div>
    <div class="thw-zui-cm-ops">
      <button class="thw-zui-cm-like" data-zui-cm-like="${esc(p.id)}|${esc(c.id)}" type="button">${iconHtml('fa-thumbs-up')} ${fmtLikes(c.likes)}</button>
      <button class="thw-zui-cm-god-btn${c.isGod ? ' on' : ''}" data-zui-cm-god="${esc(p.id)}|${esc(c.id)}" type="button" title="${c.isGod ? '取消封神' : '封神顶置'}">${iconHtml('fa-crown')}</button>
      <button class="thw-zui-cm-stack" data-zui-cm-reply="${esc(p.id)}|${esc(c.id)}" type="button" title="盖楼接龙">${iconHtml('fa-reply')}</button>
      <button class="thw-zui-cm-bt${inB ? ' on' : ''}" data-zui-cm-battle="${esc(c.id)}" type="button" title="加入神评 battle">${iconHtml('fa-bolt')}</button>
      <button class="thw-zui-cm-del" data-zui-cm-del="${esc(p.id)}|${esc(c.id)}" type="button">${iconHtml('fa-trash')}</button>
    </div>
    ${replies}
  </div>`;
}
// 神评 battle 并排投票面板
function battleHtml(p: ZuiPost): string {
  if (!_battle.a || !_battle.b) return '';
  const findC = (id?: string) => p.comments.find(c => c.id === id);
  const ca = findC(_battle.a); const cb = findC(_battle.b);
  if (!ca || !cb) return '';
  const col = (c: ZuiComment) => `<div class="thw-zui-battle-col">
    <div class="thw-zui-battle-body">${esc(c.body)}</div>
    <div class="thw-zui-battle-alias">${esc(c.alias)}</div>
    <button class="thw-btn-primary thw-btn-mini" data-zui-battle-vote="${esc(p.id)}|${esc(c.id)}" type="button">${iconHtml('fa-thumbs-up')} 投它（${fmtLikes(c.likes)}）</button>
  </div>`;
  return `<div class="thw-zui-battle">
    <div class="thw-zui-battle-h">${iconHtml('fa-bolt')} 神评 Battle <button class="thw-iconbtn" data-zui-battle-clear type="button">${iconHtml('fa-xmark')}</button></div>
    <div class="thw-zui-battle-row">${col(ca)}<span class="thw-zui-battle-vs">VS</span>${col(cb)}</div>
  </div>`;
}
function postDetailHtml(id: string): string {
  const p = getPost(id);
  if (!p) return `<div class="thw-inspector thw-zui-inspector"><div class="thw-inspector-empty">${iconHtml('fa-comment-dots')}<div>帖子不存在</div></div></div>`;
  const km = KIND_META[p.kind] || KIND_META.text;
  // 神评顶置：isGod 排前，其余按点赞
  const sorted = p.comments.slice().sort((a, b) => (b.isGod ? 1 : 0) - (a.isGod ? 1 : 0) || b.likes - a.likes);
  const cms = sorted.length ? sorted.map(c => commentCardHtml(p, c)).join('') : `<div class="thw-zui-dim" style="padding:8px">还没有神评，点「生成神评」让乐子人们来盘活评论区。</div>`;
  const isStory = p.kind === 'story';
  const isEmoji = p.kind === 'emoji';
  return `<div class="thw-inspector thw-zui-inspector">
    <div class="thw-inspector-head">
      <button class="thw-iconbtn" data-zui-post-back type="button" title="返回列表">${iconHtml('fa-arrow-left')}</button>
      <span class="thw-inspector-title">${iconHtml(km.icon)} ${esc(p.title || km.label)}</span>
      <span class="thw-topbar-spacer"></span>
      <button class="thw-iconbtn${p.isEssence ? ' on' : ''}" data-zui-essence="${esc(p.id)}" type="button" title="${p.isEssence ? '取消精华' : '设为精华'}">${iconHtml('fa-crown')}</button>
      <button class="thw-iconbtn" data-zui-post-del="${esc(p.id)}" type="button" title="删除帖子">${iconHtml('fa-trash')}</button>
    </div>
    <div class="thw-zui-detail-scroll">
      <div class="thw-zui-post-full">
        <div class="thw-zui-post-head"><span class="thw-zui-pcard-alias">${iconHtml('fa-user-secret')} ${esc(p.authorAlias)}</span><span class="thw-zui-pcard-ch">#${esc(p.channel)}</span><span class="thw-zui-post-time">${new Date(p.createdTs).toLocaleString()}</span></div>
        ${p.body ? `<div class="thw-zui-post-body">${esc(p.body).replace(/\n/g, '<br>')}</div>` : ''}
        ${mediaHtml(p, true)}
        <div class="thw-zui-post-meta"><button class="thw-zui-pcard-like" data-zui-like="${esc(p.id)}" type="button">${iconHtml('fa-thumbs-up')} ${fmtLikes(p.likes)}</button> · ${iconHtml('fa-comment-dots')} ${p.comments.length} 神评</div>
      </div>
      ${battleHtml(p)}
      <div class="thw-zui-dsec">${iconHtml('fa-comment-dots')} 神评区 (${p.comments.length}) <span class="thw-zui-cmgen"><button class="thw-btn thw-btn-mini" data-zui-cm-gen="${esc(p.id)}" type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-rotate')} 生成神评</button><button class="thw-btn thw-btn-mini" data-zui-cm-gen-ow="${esc(p.id)}" type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-eraser')} 覆盖</button></span></div>
      <div class="thw-zui-cms">${cms}</div>
    </div>
    <div class="thw-zui-detail-ops">
      <button class="thw-btn-primary thw-btn-mini" data-zui-god="${esc(p.id)}" type="button" ${_busy ? 'disabled' : ''} title="来一条封神级神评">${iconHtml('fa-crown')} 封神</button>
      <button class="thw-btn thw-btn-mini" data-zui-dig="${esc(p.id)}" type="button" ${_busy ? 'disabled' : ''} title="考古现场：给这条老帖来条考古神评">${iconHtml('fa-magnifying-glass')} 考古</button>
      ${isStory ? `<button class="thw-btn thw-btn-mini" data-zui-story-add="${esc(p.id)}" type="button" title="接一句">${iconHtml('fa-reply')} 接一句</button>` : ''}
      ${isEmoji ? `<button class="thw-btn thw-btn-mini" data-zui-emoji-save="${esc(p.id)}" type="button" title="收藏进表情库">${iconHtml('fa-image')} 收藏表情</button>` : ''}
      <button class="thw-btn thw-btn-mini" data-zui-cm-mine="${esc(p.id)}" type="button">${iconHtml('fa-pen')} 神评一条</button>
      <button class="thw-btn thw-btn-mini" data-zui-report="${esc(p.id)}" type="button" title="反手举报">${iconHtml('fa-flag')} 举报</button>
      <button class="thw-btn thw-btn-mini" data-zui-inject-post="${esc(p.id)}" type="button" title="加入注入暂存夹">${iconHtml('fa-syringe')} 加注入</button>
    </div>
  </div>`;
}
// PLACEHOLDER_ZUI_RANK_VIEW
// 右列默认态：热榜（万花镜打榜语义）。未选帖子时显示。
function rankInspectorHtml(): string {
  const blocks = ZUI_RANK_KINDS.map(k => {
    const r = getRank(k.id);
    const body = r && r.entries.length
      ? `${r.note ? `<div class="thw-zui-rank-note">${iconHtml('fa-bullhorn')} ${esc(r.note)}</div>` : ''}` +
        r.entries.map((e, i) => `<button class="thw-zui-rank-row" data-zui-post="${esc(e.postId || '')}" type="button" ${e.postId ? '' : 'disabled'}>
          <span class="thw-zui-rank-no th-rank-${i < 3 ? i + 1 : 'n'}">${i + 1}</span>
          <span class="thw-zui-rank-mid"><span class="thw-zui-rank-name">${esc(e.name)}</span><span class="thw-zui-rank-reason">${esc(e.reason)}</span></span>
        </button>`).join('')
      : `<div class="thw-zui-dim" style="padding:8px 10px">还没生成，点右侧刷新。</div>`;
    return `<div class="thw-zui-rankcard"><div class="thw-zui-rankcard-h"><span class="thw-zui-rankcard-t">${iconHtml(k.icon)} ${esc(k.title)}</span><button class="thw-btn thw-btn-mini" data-zui-rank="${k.id}" type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-rotate')} 刷新</button></div>${body}</div>`;
  }).join('');
  return `<div class="thw-inspector thw-zui-inspector">
    <div class="thw-inspector-head"><span class="thw-inspector-title">${iconHtml('fa-fire-flame-curved')} 沙雕热榜</span><span class="thw-topbar-spacer"></span><button class="thw-btn thw-btn-mini" data-zui-rank-all type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-rotate')} 全刷</button></div>
    <div class="thw-zui-detail-scroll">
      <div class="thw-zui-ranks">${blocks}</div>
    </div>
  </div>`;
}
// PLACEHOLDER_ZUI_SETTINGS
// ==================== 设置（master-detail）====================
const ZUI_SET_CATS: ScaffoldCatDef[] = [
  { id: 'context', canon: 'read' },
  { id: 'inject', canon: 'write' },
  'auto',
  { id: 'play', icon: 'fa-face-smile', label: '玩法' },
  { id: 'cats', icon: 'fa-tags', label: '频道管理' },
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
  return `<div class="thw-field"><div class="thw-flabel">${label} <b class="thw-zui-slider-val">${val}</b></div>
    <input type="range" min="0" max="${max}" step="5" class="thw-zui-slider ${cls}" value="${val}">
    ${hint ? `<div class="thw-set-hint">${hint}</div>` : ''}</div>`;
}
function settingsHtml(): string {
  const navs = scaffoldNavHtml('zui', normalizeScaffoldCats(ZUI_SET_CATS), _setCat);
  return `<div class="thw-content thw-zui-content thw-zui-settings">
    <div class="thw-topbar"><span class="thw-topbar-title">${iconHtml('fa-gear')} 最右设置</span></div>
    <div class="thw-zui-set-body"><nav class="thw-zui-set-nav">${navs}</nav><div class="thw-zui-set-detail thw-content-pad thw-view-in">${settingsDetailHtml()}</div></div>
  </div>`;
}
function settingsDetailHtml(): string {
  const s = getZuiSettings();
  if (_setCat === 'context') {
    const wbReady = isWorldbookAvailable();
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">生成上下文</span></div>
      ${switchRow('参考最近正文', '铺帖子/神评/热梗时读取最近几楼正文，贴合当前剧情与时节', 'thw-zui-cfg-floors', s.useFloors)}
      <div class="thw-field"><div class="thw-flabel">读取楼层数</div><input type="number" min="0" max="30" class="thw-input thw-zui-cfg-floorcount" value="${s.floorCount}"></div>
      <div class="thw-set-hint">还会自动读「世界态·当季/万花镜榜」来生成节令话题梗、呼应热榜（在世界演化里推进世界态即可）。</div>
    </div>
    <div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-book-medical')} 注入酒馆世界书（设定来源）</span></div>
      <div class="thw-set-hint">${wbReady ? '勾选要用的世界书条目即生效（作为话题/人物/世界的权威设定），可跨多本书混选。改设定改世界书即可，不必动提示词。频道还能各自绑条目（见「频道管理」）。' : '当前环境无世界书接口。'}</div>
      <div class="thw-zui-set-wbpick" data-zui-wbpick-host>${wbReady ? wbPickerHtml(s.worldbookEntryKeys || []) : ''}</div>
    </div>`;
  }
  if (_setCat === 'inject') {
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-syringe')} 注入正文</span></div>
      <div class="thw-set-hint">最右独立于正文，但可把「我刚发的帖」「本站正流行的梗」「当前热帖」切片自由注入世界书或输入框，实现联动。默认全关，按需勾选去向。</div>
      ${injectPlanPanelHtml('zui')}</div>`;
  }
  if (_setCat === 'auto') {
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-bolt')} 楼层自动触发</span></div>
      ${switchRow('每 N 楼自动铺一批帖', '正文每推进设定楼数，打开最右时自动刷一批新帖流（0=关）', 'thw-zui-cfg-autoen', (s.autoInterval || 0) > 0)}
      ${(s.autoInterval || 0) > 0 ? `<div class="thw-field"><div class="thw-flabel">每隔 N 楼<small>正文每推进 N 楼，下次打开最右时自动刷一批新帖</small></div>
        <input type="number" min="1" max="200" class="thw-input thw-zui-cfg-auto" value="${s.autoInterval}"></div>` : ''}
    </div>`;
  }
  if (_setCat === 'api') {
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">API 利用</span></div>
      <div class="thw-set-hint">每个产出项一张卡：勾选它这次产出什么、各自批量额度，省 token。</div>${apiPlanPanelHtml('zui')}</div>`;
  }
  if (_setCat === 'eco') {
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">抽象社区生态浓度</span></div>
      <div class="thw-set-hint">调节社区的「气氛」，生成时通用化读取（不写死提示词）。0-100 常规，100-200 逐档加码。</div>
      ${sliderRow('社区活跃度', '越高越多上帖/神评/盖楼', 'thw-zui-eco-activity', s.ecoActivity)}
      ${sliderRow('内容真实度', '越高拆台/挑刺/对线越真实（低=清一色捧场水军感）', 'thw-zui-eco-quality', s.ecoQuality)}
      ${sliderRow('阴阳怪气度', '越高反讽夹枪带棒越浓（仍是善意乐子，不真恶意）', 'thw-zui-eco-yinyang', s.ecoYinyang)}
      ${sliderRow('玩梗密度', '越高黑话/谐音/热梗堆叠越抽象（懂的都懂）', 'thw-zui-eco-meme', s.ecoMeme)}
      ${sliderRow('塌房吃瓜/网暴烈度（⚠）', '基调阀：低=温和吐槽零恶意；越高塌房/对线越激烈（仍锁虚构娱乐、幸福的烦恼级）', 'thw-zui-eco-toxic', s.ecoToxic)}
      ${sliderRow('色情度（露骨程度）', '作用于全 app 所有频道与内容（帖子/配字/画面/神评）——越高越直白露骨（全女百合GL，虚构娱乐）', 'thw-zui-eco-erotic', s.ecoErotic)}
      ${sliderRow('肉欲度（肉欲表现）', '作用于全 app——越高擦边梗的肉欲暗示/嗑糖暧昧越浓', 'thw-zui-eco-carnal', s.ecoCarnal)}
    </div>`;
  }
  if (_setCat === 'play') {
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">玩法</span></div>
      ${sliderRow('神评密度', '每帖大约配几条神评、封几条神（越高评论区越热闹）', 'thw-zui-cfg-goddensity', s.godDensity, 5)}
      ${switchRow('允许钓鱼楼', '神评区可出现一本正经带节奏的钓鱼评论', 'thw-zui-cfg-fishing', s.allowFishing)}
      ${switchRow('允许盖楼接龙', '神评下可无限接龙盖楼', 'thw-zui-cfg-stack', s.allowStack)}
      ${switchRow('深夜区', '开启后频道列表出现「深夜区」（越夜越放飞越抽象）', 'thw-zui-cfg-night', s.nightChannel)}
      <div class="thw-field"><div class="thw-flabel">今日快乐进度阈值</div><input type="number" min="1" max="100" class="thw-input thw-zui-cfg-happygoal" value="${s.happyGoal}"></div>
      <div class="thw-set-hint">围观够这么多条帖，弹「今日快乐已充值」。</div>
    </div>`;
  }
  // PLACEHOLDER_ZUI_SETTINGS_DETAIL_2
  return settingsDetailHtml2();
}
// PLACEHOLDER_ZUI_SETTINGS_2
function settingsDetailHtml2(): string {
  const s = getZuiSettings();
  if (_setCat === 'cats') {
    const cats = getCategories();
    const rows = cats.map(c => {
      const custom = !ZUI_CATS.some(x => x.name === c.name);
      const night = (c as any).night;
      return `<div class="thw-zui-catrow">
        <div class="thw-zui-catrow-h"><span>${iconHtml(c.icon)} ${esc(c.name)}${night ? ' <em class="thw-tag">深夜区</em>' : ''}${custom ? ' <em class="thw-tag">自定义</em>' : ''}</span>${custom ? `<button class="thw-iconbtn" data-zui-cat-del="${escAttr(c.name)}" type="button">${iconHtml('fa-trash')}</button>` : ''}</div>
        <textarea class="thw-input thw-zui-catprompt" data-zui-catprompt="${escAttr(c.name)}" rows="3" placeholder="本频道的生成引导（帖子调性/神评套路/玩梗方向）">${esc(getCatPrompt(c.name))}</textarea>
        <div class="thw-zui-catwb" data-zui-catwb-host="${escAttr(c.name)}">${catWbBindHtml('zui', c.name)}</div>
      </div>`;
    }).join('');
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">频道管理</span><button class="thw-btn thw-btn-mini" data-zui-cat-add type="button">${iconHtml('fa-plus')} 新频道</button></div>
      <div class="thw-set-hint">每个频道的生成引导可改；还能给频道绑世界书条目作专属设定来源（改设定不改 prompt）。多模态用画面描述表现。</div>${rows}</div>`;
  }
  if (_setCat === 'prompts') {
    const tpls = listPromptTemplates('zui').filter(t => !t.id.startsWith('inject.envelope.') && t.id !== 'zui.frag.eco');
    const rows = tpls.map(t => `<button class="thw-card thw-card-hover thw-zui-pl-row" data-zui-pl-edit="${esc(t.id)}" type="button">
      <span class="thw-zui-pl-mid"><span class="thw-zui-pl-ttl">${esc(t.name)}${t.id.endsWith('.jailbreak') ? ` <span class="thw-tag">${iconHtml('fa-unlock-keyhole')}破限</span>` : ''}${isPromptOverridden(t.id) ? ' <span class="thw-tag">已改</span>' : ''}</span><span class="thw-zui-pl-desc">${esc(t.desc || '')}</span></span>
      <span class="thw-zui-pl-arrow">${iconHtml('fa-chevron-right')}</span></button>`).join('');
    const frag = listPromptTemplates('zui').find(t => t.id === 'zui.frag.eco');
    const fragRow = frag ? `<button class="thw-card thw-card-hover thw-zui-pl-row" data-zui-pl-edit="${esc(frag.id)}" type="button"><span class="thw-zui-pl-mid"><span class="thw-zui-pl-ttl">${esc(frag.name)}${isPromptOverridden(frag.id) ? ' <span class="thw-tag">已改</span>' : ''}</span><span class="thw-zui-pl-desc">${esc(frag.desc || '')}</span></span><span class="thw-zui-pl-arrow">${iconHtml('fa-chevron-right')}</span></button>` : '';
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">功能提示词</span></div>
      <div class="thw-set-hint">${tpls.length} 项主提示词 · 破限已置顶，点开就地编辑或 AI 重写。所有提示词强约束「神评是灵魂、多模态用画面描述」。</div>${rows}</div>
      <details class="thw-zui-fragsec"><summary>${iconHtml('fa-puzzle-piece')} 小片段（生态包装语）</summary>${fragRow}</details>`;
  }
  if (_setCat === 'appear') {
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">外观</span></div>
      <div class="thw-field"><div class="thw-flabel">主题皮肤</div><select class="thw-select thw-zui-cfg-theme">${ZUI_THEMES.map(t => `<option value="${t.key}" ${s.theme === t.key ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
      <div class="thw-field"><div class="thw-flabel">字体</div><select class="thw-select thw-zui-cfg-font">${ZUI_FONTS.map(f => `<option value="${f.key}" ${s.font === f.key ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></div>
    </div>`;
  }
  // data
  return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">记忆</span></div>
    <div class="thw-set-hint">发帖足迹/围观焦点可同步进世界书；这里管理本 APP 的记忆沉淀。</div>${appMemPanelHtml('zui')}</div>
    <div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">数据管理</span></div>
    <button class="thw-btn thw-btn-danger thw-btn-mini" data-zui-clear type="button">${iconHtml('fa-trash')} 清空帖子/神评/热梗/榜单（保留设置与我的成长）</button></div>`;
}
// 提示词编辑页（页内视图，占中列）
function promptEditViewHtml(id: string): string {
  const t = listPromptTemplates('zui').find(x => x.id === id);
  return `<div class="thw-content thw-zui-content">
    <div class="thw-topbar"><button class="thw-iconbtn" data-zui-pe-close type="button">${iconHtml('fa-arrow-left')}</button><span class="thw-topbar-title">${esc(t?.name || '提示词')}</span>
      <span class="thw-topbar-spacer"></span><button class="thw-btn thw-btn-mini" data-zui-pe-reset type="button">${iconHtml('fa-rotate-left')} 恢复默认</button><button class="thw-btn-primary thw-btn-mini" data-zui-pe-save type="button">${iconHtml('fa-check')} 保存</button></div>
    <div class="thw-content-pad thw-view-in">
      <div class="thw-set-hint">${esc(t?.desc || '')}</div>
      <textarea class="thw-input thw-zui-pe-text" rows="16">${esc(getPromptText(id))}</textarea>
      ${aiPromptEditorHtml(id)}
      ${id.endsWith('.jailbreak') || id === 'zui.frag.eco' ? '' : promptWbBindHtml(id)}
    </div>
  </div>`;
}
// PLACEHOLDER_ZUI_RENDER
// ==================== 渲染 ====================
function render(): void {
  const root = rootEl(); if (!root) return;
  const s = getZuiSettings();
  let content = ''; let inspector = '';
  if (_promptEditId) { content = promptEditViewHtml(_promptEditId); }
  else if (_view.name === 'settings') { content = settingsHtml(); }
  else if (_view.name === 'post') {
    const p = getPost(_view.id);
    content = feedTabHtml();
    inspector = p ? postDetailHtml(_view.id) : rankInspectorHtml();
  }
  else {
    const tab = _view.tab;
    content = tab === 'feed' ? feedTabHtml() : tab === 'cats' ? catsTabHtml() : tab === 'memes' ? memesTabHtml() : mineTabHtml();
    // 乐子流/频道/梗百科：右栏默认展示热榜；我的不给
    if (tab !== 'mine') inspector = rankInspectorHtml();
  }
  const hasDetail = (_view.name === 'post' || (_view.name === 'tab' && _view.tab !== 'mine')) ? ' thw-zui-hasinspector' : '';
  // 帖子详情态：让详情列占主宽、中列收窄（热榜默认态保持中列为主）
  const postOpen = (_view.name === 'post' && getPost(_view.id)) ? ' thw-zui-postopen' : '';
  const themeCls = `thw-zui-theme-${s.theme || 'yellow'} thw-zui-font-${s.font || 'system'}`;
  root.innerHTML = `<div class="thw-app thw-zui-app2 ${themeCls}${hasDetail}${postOpen}">
    <div class="thw-body">${sidebarHtml()}${content}${inspector}</div>
  </div>`;
  // 绑定命令式子组件
  if (_view.name === 'settings' && !_promptEditId) {
    if (_setCat === 'context' && isWorldbookAvailable()) {
      const host = root.querySelector('[data-zui-wbpick-host]') as HTMLElement | null;
      if (host) bindWbPicker(host, () => getZuiSettings().worldbookEntryKeys || [], (keys) => updateZuiSettings({ worldbookEntryKeys: keys }));
    }
    if (_setCat === 'cats') { root.querySelectorAll('[data-zui-catwb-host]').forEach(h => bindCatWbHost(h as HTMLElement)); }
  }
  if (_promptEditId) { const scope = root.querySelector('.thw-content') as HTMLElement | null; if (scope) bindPromptWbHost(scope); }
  // 神评区滚动位置保持在顶
  const cms = root.querySelector('.thw-zui-cms') as HTMLElement | null; void cms;
}

function goTab(tab: Tab): void { _view = { name: 'tab', tab }; _promptEditId = null; render(); }
// PLACEHOLDER_ZUI_EVENTS
// ==================== 事件 ====================
function bindRoot(): void {
  const root = rootEl(); if (!root || (root as any)._zuiBound) return;
  (root as any)._zuiBound = true;
  root.addEventListener('click', (e) => { void onClick(e); });
  root.addEventListener('change', (e) => onChange(e));
}

async function onClick(e: Event): Promise<void> {
  const t = e.target as HTMLElement;
  // 导航
  const tabBtn = t.closest('[data-zui-tab]') as HTMLElement | null;
  if (tabBtn) { goTab(tabBtn.getAttribute('data-zui-tab') as Tab); return; }
  if (t.closest('[data-zui-settings]')) { _view = { name: 'settings' }; _setCat = 'context'; _promptEditId = null; render(); return; }
  // 随机一发
  if (t.closest('[data-zui-lucky]')) {
    const p = randomPost();
    if (!p) { thToast('还没有帖子，先刷一批', 'info'); return; }
    _view = { name: 'post', id: p.id }; _promptEditId = null;
    const hit = bumpHappy(); if (hit.justHit) thToast('今日快乐已充值满！', 'success');
    render(); return;
  }
  // 发条右
  if (t.closest('[data-zui-post-new]')) { void openComposer(); return; }
  // 考古模式开关
  if (t.closest('[data-zui-archae]')) {
    _archae = !_archae;
    if (_view.name !== 'tab' || _view.tab !== 'feed') _view = { name: 'tab', tab: 'feed' };
    thToast(_archae ? '考古模式开启：最早的老帖排在最前' : '考古模式关闭，回到新鲜榜', 'info');
    render(); return;
  }
  // 深夜区入口：确保开启并跳到该频道
  if (t.closest('[data-zui-night]')) {
    if (!getZuiSettings().nightChannel) { updateZuiSettings({ nightChannel: true }); thToast('已开启深夜区', 'info'); }
    _cat = '深夜区'; _view = { name: 'tab', tab: 'feed' }; _promptEditId = null;
    render();
    if (!getPosts('深夜区').length) thToast('点右上「刷新深夜区」，让越夜越放飞的抽象长出来', 'info');
    return;
  }
  const catChip = t.closest('[data-zui-cat]') as HTMLElement | null;
  if (catChip && catChip.hasAttribute('data-zui-cat')) {
    _cat = catChip.getAttribute('data-zui-cat') || '';
    if (_view.name !== 'tab' || (_view.tab !== 'feed' && _view.tab !== 'cats')) _view = { name: 'tab', tab: 'feed' };
    render(); return;
  }
  // 刷新
  if (t.closest('[data-zui-refresh-ow]')) { void aiFeed(_cat, 'overwrite'); return; }
  if (t.closest('[data-zui-refresh]')) { void aiFeed(_cat, 'incremental'); return; }
  if (t.closest('[data-zui-meme-refresh-ow]')) { void aiMemes('overwrite'); return; }
  if (t.closest('[data-zui-meme-refresh]')) { void aiMemes('incremental'); return; }
  const memeDel = t.closest('[data-zui-meme-del]') as HTMLElement | null;
  if (memeDel) { deleteMeme(memeDel.getAttribute('data-zui-meme-del') || ''); render(); return; }
  // 热榜
  const rk = t.closest('[data-zui-rank]') as HTMLElement | null;
  if (rk) { void aiRank(rk.getAttribute('data-zui-rank') || ''); return; }
  if (t.closest('[data-zui-rank-all]')) { for (const k of ZUI_RANK_KINDS) { await aiRank(k.id); } return; }
  // 帖子/神评
  if (await onPostClick(t)) return;
  // 我的
  if (await onMineClick(t)) return;
  // 设置
  if (await onSettingsClick(t)) return;
}
// PLACEHOLDER_ZUI_CLICK2
// ---- 帖子 / 神评 ----
async function onPostClick(t: HTMLElement): Promise<boolean> {
  // 点赞帖子（在打开之前拦截）
  const like = t.closest('[data-zui-like]') as HTMLElement | null;
  if (like) { likePost(like.getAttribute('data-zui-like') || ''); render(); return true; }
  // 神评点赞（被顶爆存名场面）
  const cmLike = t.closest('[data-zui-cm-like]') as HTMLElement | null;
  if (cmLike) {
    const [pid, cid] = (cmLike.getAttribute('data-zui-cm-like') || '').split('|');
    likeComment(pid, cid);
    const p = getPost(pid); const c = p?.comments.find(x => x.id === cid);
    if (c && c.alias === '我' && c.likes >= 500 && !getUser().highlights.some(h => h.body === c.body)) { addHighlight(c.body, c.likes, p?.title); thToast('你的神评被顶爆，进名场面了！', 'success'); }
    render(); return true;
  }
  // 封神顶置
  const cmGod = t.closest('[data-zui-cm-god]') as HTMLElement | null;
  if (cmGod) { const [pid, cid] = (cmGod.getAttribute('data-zui-cm-god') || '').split('|'); const on = toggleGod(pid, cid); thToast(on ? '已封神顶置' : '已取消封神', 'info'); render(); return true; }
  // 盖楼接龙
  const cmReply = t.closest('[data-zui-cm-reply]') as HTMLElement | null;
  if (cmReply) {
    const [pid, cid] = (cmReply.getAttribute('data-zui-cm-reply') || '').split('|');
    if (!getZuiSettings().allowStack) { thToast('盖楼接龙已在设置里关闭', 'warn'); return true; }
    const txt = await thPrompt({ title: '盖楼接龙', message: '接一楼（顺着上面的梗往下接）：', value: '', multiline: true });
    if (txt != null && String(txt).trim()) {
      addReply(pid, cid, { alias: '我', body: String(txt).trim(), likes: 0 });
      grantBadge('接龙祖师'); addSagao(4); render(); thToast('已接一楼 +4 沙雕值', 'success');
    }
    return true;
  }
  // 神评 battle 选择
  const cmBt = t.closest('[data-zui-cm-battle]') as HTMLElement | null;
  if (cmBt) {
    const cid = cmBt.getAttribute('data-zui-cm-battle') || '';
    if (_battle.a === cid) _battle.a = undefined;
    else if (_battle.b === cid) _battle.b = undefined;
    else if (!_battle.a) _battle.a = cid;
    else if (!_battle.b) _battle.b = cid;
    else { _battle.a = cid; _battle.b = undefined; }
    render(); return true;
  }
  if (t.closest('[data-zui-battle-clear]')) { _battle = {}; render(); return true; }
  const btVote = t.closest('[data-zui-battle-vote]') as HTMLElement | null;
  if (btVote) { const [pid, cid] = (btVote.getAttribute('data-zui-battle-vote') || '').split('|'); likeComment(pid, cid); thToast('投票 +1', 'success'); render(); return true; }
  // 神评删除
  const cmDel = t.closest('[data-zui-cm-del]') as HTMLElement | null;
  if (cmDel) { const [pid, cid] = (cmDel.getAttribute('data-zui-cm-del') || '').split('|'); deleteComment(pid, cid); render(); return true; }
  // 打开帖子（+ 快乐进度 + 记忆池）
  const open = t.closest('[data-zui-post]') as HTMLElement | null;
  if (open) {
    const id = open.getAttribute('data-zui-post') || ''; if (!id) return true;
    _view = { name: 'post', id }; _battle = {}; _promptEditId = null;
    const p = getPost(id);
    const hit = bumpHappy(); if (hit.justHit) thToast('今日快乐已充值满！', 'success');
    if (p && p.authorId) notePoolIfIdentified(p.authorId, `你在最右发的${KIND_META[p.kind]?.label || '帖'}被我翻到围观了`);
    render(); return true;
  }
  // 帖子详情返回列表
  if (t.closest('[data-zui-post-back]')) { _view = { name: 'tab', tab: 'feed' }; _battle = {}; render(); return true; }
  // 设/取消精华
  const ess = t.closest('[data-zui-essence]') as HTMLElement | null;
  if (ess) { const p = getPost(ess.getAttribute('data-zui-essence') || ''); if (p) { updatePost(p.id, { isEssence: !p.isEssence }); thToast(p.isEssence ? '已取消精华' : '已设为精华', 'info'); render(); } return true; }
  // 删帖
  const pdel = t.closest('[data-zui-post-del]') as HTMLElement | null;
  if (pdel) { const ok = await thConfirm({ title: '删除帖子', message: '删除这条帖及其神评？', confirmText: '删除', danger: true }); if (ok) { deletePost(pdel.getAttribute('data-zui-post-del') || ''); _view = { name: 'tab', tab: 'feed' }; render(); } return true; }
  // 生成神评
  const cmGenOw = t.closest('[data-zui-cm-gen-ow]') as HTMLElement | null;
  if (cmGenOw) { void aiComments(cmGenOw.getAttribute('data-zui-cm-gen-ow') || '', 'overwrite'); return true; }
  const cmGen = t.closest('[data-zui-cm-gen]') as HTMLElement | null;
  if (cmGen) { void aiComments(cmGen.getAttribute('data-zui-cm-gen') || '', 'incremental'); return true; }
  // 封神一条
  const god = t.closest('[data-zui-god]') as HTMLElement | null;
  if (god) { void aiGodReply(god.getAttribute('data-zui-god') || '', false); return true; }
  // 挖坟考古
  const dig = t.closest('[data-zui-dig]') as HTMLElement | null;
  if (dig) { void aiGodReply(dig.getAttribute('data-zui-dig') || '', true); return true; }
  // 段子接龙：接一句
  const storyAdd = t.closest('[data-zui-story-add]') as HTMLElement | null;
  if (storyAdd) {
    const p = getPost(storyAdd.getAttribute('data-zui-story-add') || ''); if (!p) return true;
    const txt = await thPrompt({ title: '接一句', message: '顺着上面的接力往下接（越离谱越好）：', value: '', multiline: true });
    if (txt != null && String(txt).trim()) { updatePost(p.id, { body: p.body.replace(/\s+$/, '') + '\n→ ' + String(txt).trim() }); addSagao(4); render(); thToast('已接龙 +4 沙雕值', 'success'); }
    return true;
  }
  // 收藏表情包进表情库
  const emSave = t.closest('[data-zui-emoji-save]') as HTMLElement | null;
  if (emSave) { const p = getPost(emSave.getAttribute('data-zui-emoji-save') || ''); if (p) { saveEmoji(p.imageDesc || '', p.body || ''); addSagao(2); thToast('已收藏进表情库 +2 沙雕值', 'success'); render(); } return true; }
  // 玩家自己写一条神评
  const cmMine = t.closest('[data-zui-cm-mine]') as HTMLElement | null;
  if (cmMine) {
    const id = cmMine.getAttribute('data-zui-cm-mine') || '';
    const txt = await thPrompt({ title: '神评一条', message: '来一条你的神评：', value: '', multiline: true });
    if (txt != null && String(txt).trim()) {
      addComments(id, [{ alias: '我', body: String(txt).trim(), likes: 0 }]);
      const up = addSagao(5); const p = getPost(id);
      if (p && p.authorId) notePoolIfIdentified(p.authorId, `在最右给你的帖发了神评：${String(txt).trim().slice(0, 20)}`);
      render(); thToast(up.leveledUp ? '神评成功，升级啦！' : '神评成功 +5 沙雕值', 'success');
    }
    return true;
  }
  // 反手举报（整活）
  const rep = t.closest('[data-zui-report]') as HTMLElement | null;
  if (rep) {
    const jokes = ['举报成功，该帖已被送去抽象博物馆展览', '举报已收到，处理结果：给你也整乐了，各打五十大板', '举报失败，因为管理员也在下面哈哈哈', '举报成功，奖励你「反手举报」成就一枚', '系统判定：这么好笑不许举报，驳回'];
    thToast(jokes[Math.floor(Math.random() * jokes.length)], 'info'); return true;
  }
  // 加注入
  const inj = t.closest('[data-zui-inject-post]') as HTMLElement | null;
  if (inj) { const p = getPost(inj.getAttribute('data-zui-inject-post') || ''); if (p) { addToStash('zui', `最右·${p.title || p.body.slice(0, 12)}`, zuiPostInjectLine(p).replace(/^·\s*/, '')); thToast('已加入注入暂存夹', 'success'); } return true; }
  return false;
}
// PLACEHOLDER_ZUI_CLICK3
// 发条右：玩家发帖 → AI 造神评区
async function openComposer(): Promise<void> {
  const cats = getCategories();
  const ch = _cat || cats[0]?.name || '沙雕日常';
  const body = await thPrompt({ title: '发条右', message: `发到 #${ch}（在频道快筛里先选好频道）。写下你的段子/沙雕/抽象话（表情包可直接描述画面）：`, value: '', multiline: true });
  if (body == null || !String(body).trim()) return;
  const text = String(body).trim();
  // 简单判断形态：含「图/表情」字样归 image，否则 text
  const kind: ZuiPostKind = /表情包|表情/.test(text.slice(0, 8)) ? 'emoji' : 'text';
  const added = addPosts([{ kind, body: text, channel: ch, authorAlias: '我', likes: 0 }], ch);
  const post = added[0];
  addSagao(8);
  _view = { name: 'post', id: post.id }; render();
  thToast('已发布 +8 沙雕值，评论区马上来', 'success');
  void aiPlayerPostReplies(post.id);
}

// ---- 我的 ----
async function onMineClick(t: HTMLElement): Promise<boolean> {
  if (t.closest('[data-zui-persona-gen]')) { void aiPersona(); return true; }
  const hlDel = t.closest('[data-zui-hl-del]') as HTMLElement | null;
  if (hlDel) { removeHighlight(hlDel.getAttribute('data-zui-hl-del') || ''); render(); return true; }
  const emDel = t.closest('[data-zui-emoji-del]') as HTMLElement | null;
  if (emDel) { removeEmoji(emDel.getAttribute('data-zui-emoji-del') || ''); render(); return true; }
  return false;
}
// PLACEHOLDER_ZUI_CLICK4
// ---- 设置 ----
async function onSettingsClick(t: HTMLElement): Promise<boolean> {
  if (t.closest('[data-zui-pe-close]')) { _promptEditId = null; render(); return true; }
  if (t.closest('[data-zui-pe-save]')) {
    const ta = rootEl()?.querySelector('.thw-zui-pe-text') as HTMLTextAreaElement | null;
    if (ta && _promptEditId) { setPromptOverride(_promptEditId, ta.value); thToast('已保存', 'success'); _promptEditId = null; render(); }
    return true;
  }
  if (t.closest('[data-zui-pe-reset]')) { if (_promptEditId) { resetPrompt(_promptEditId); thToast('已恢复默认', 'success'); render(); } return true; }
  if (_promptEditId && bindAiPromptEditor({ target: t } as unknown as Event, () => (rootEl()?.querySelector('.thw-zui-pe-text') as HTMLTextAreaElement)?.value || '', (txt) => { const ta = rootEl()?.querySelector('.thw-zui-pe-text') as HTMLTextAreaElement | null; if (ta) ta.value = txt; })) return true;
  // 设置分类切换（局部刷新右侧 detail）
  const setcat = t.closest('[data-zui-setcat]') as HTMLElement | null;
  if (setcat) {
    _setCat = setcat.getAttribute('data-zui-setcat') || 'context';
    patchSettingsDetail({ root: rootEl(), detailSel: '.thw-zui-set-detail', navSel: '[data-zui-setcat]', navAttr: 'data-zui-setcat', navOnClass: 'thw-nav-on', cat: _setCat, html: settingsDetailHtml() });
    const root = rootEl();
    if (root) {
      if (_setCat === 'context' && isWorldbookAvailable()) { const host = root.querySelector('[data-zui-wbpick-host]') as HTMLElement | null; if (host) bindWbPicker(host, () => getZuiSettings().worldbookEntryKeys || [], (keys) => updateZuiSettings({ worldbookEntryKeys: keys })); }
      if (_setCat === 'cats') root.querySelectorAll('[data-zui-catwb-host]').forEach(h => bindCatWbHost(h as HTMLElement));
    }
    return true;
  }
  // 共享面板点击
  if (t.closest('[data-inj-app]') && bindInjectPlanPanel({ target: t } as unknown as Event)) return true;
  if (t.closest('[data-apiplan-app]') && bindApiPlanPanel({ target: t } as unknown as Event)) return true;
  if (t.closest('[data-amem-app]') && bindAppMemPanel({ target: t } as unknown as Event)) return true;
  if (t.closest('[data-wbsync-app]') && bindWbSyncPanel({ target: t } as unknown as Event)) return true;
  // 提示词进编辑
  const plEdit = t.closest('[data-zui-pl-edit]') as HTMLElement | null;
  if (plEdit) { _promptEditId = plEdit.getAttribute('data-zui-pl-edit') || ''; render(); return true; }
  // 频道管理
  if (t.closest('[data-zui-cat-add]')) {
    const v = await thPrompt({ title: '新频道', message: '频道名（如「一句话总结」）：', value: '' });
    if (v != null && String(v).trim()) { addCustomCat(String(v).trim()); render(); }
    return true;
  }
  const catDel = t.closest('[data-zui-cat-del]') as HTMLElement | null;
  if (catDel) { deleteCustomCat(catDel.getAttribute('data-zui-cat-del') || ''); render(); return true; }
  // 数据清空
  if (t.closest('[data-zui-clear]')) {
    const ok = await thConfirm({ title: '清空数据', message: '清空所有帖子/神评/热梗/榜单？（设置与我的成长保留）', confirmText: '清空', danger: true });
    if (ok) { clearAll(); _view = { name: 'tab', tab: 'feed' }; render(); thToast('已清空', 'success'); }
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
  // 生态/神评密度滑块实时标签 + 存
  if (t.classList.contains('thw-zui-slider')) {
    const val = Number((t as HTMLInputElement).value);
    const lbl = t.parentElement?.querySelector('.thw-zui-slider-val'); if (lbl) lbl.textContent = String(val);
    const map: Record<string, keyof ZuiSettings> = { 'thw-zui-eco-activity': 'ecoActivity', 'thw-zui-eco-quality': 'ecoQuality', 'thw-zui-eco-yinyang': 'ecoYinyang', 'thw-zui-eco-meme': 'ecoMeme', 'thw-zui-eco-toxic': 'ecoToxic', 'thw-zui-eco-erotic': 'ecoErotic', 'thw-zui-eco-carnal': 'ecoCarnal', 'thw-zui-cfg-goddensity': 'godDensity' };
    for (const cls of Object.keys(map)) if (t.classList.contains(cls)) { updateZuiSettings({ [map[cls]]: val } as Partial<ZuiSettings>); return; }
    return;
  }
  if (t.classList.contains('thw-zui-cfg-floors')) { updateZuiSettings({ useFloors: (t as HTMLInputElement).checked }); return; }
  if (t.classList.contains('thw-zui-cfg-floorcount')) { updateZuiSettings({ floorCount: Math.max(0, Number((t as HTMLInputElement).value) || 0) }); return; }  if (t.classList.contains('thw-zui-cfg-fishing')) { updateZuiSettings({ allowFishing: (t as HTMLInputElement).checked }); return; }
  if (t.classList.contains('thw-zui-cfg-stack')) { updateZuiSettings({ allowStack: (t as HTMLInputElement).checked }); return; }
  if (t.classList.contains('thw-zui-cfg-autoen')) { const on = (t as HTMLInputElement).checked; updateZuiSettings({ autoInterval: on ? (_lastZuiAuto > 0 ? _lastZuiAuto : 20) : 0 }); render(); return; }
  if (t.classList.contains('thw-zui-cfg-auto')) { const n = Math.max(1, Math.min(200, Number((t as HTMLInputElement).value) || 1)); _lastZuiAuto = n; updateZuiSettings({ autoInterval: n }); return; }
  if (t.classList.contains('thw-zui-cfg-night')) { updateZuiSettings({ nightChannel: (t as HTMLInputElement).checked }); render(); return; }
  if (t.classList.contains('thw-zui-cfg-happygoal')) { updateZuiSettings({ happyGoal: Math.max(1, Number((t as HTMLInputElement).value) || 10) }); return; }
  if (t.classList.contains('thw-zui-cfg-theme')) { updateZuiSettings({ theme: (t as HTMLSelectElement).value }); render(); return; }
  if (t.classList.contains('thw-zui-cfg-font')) { updateZuiSettings({ font: (t as HTMLSelectElement).value }); render(); return; }
  // 频道提示词就地存
  const catPrompt = t.closest('[data-zui-catprompt]') as HTMLElement | null;
  if (catPrompt && t.classList.contains('thw-zui-catprompt')) { setCatPrompt(catPrompt.getAttribute('data-zui-catprompt') || '', (t as HTMLTextAreaElement).value); return; }
}
// PLACEHOLDER_ZUI_REGISTER
// ==================== 打开 / 注册 ====================
// 楼层自动触发——打开最右时若正文比上次触发多推进了 autoInterval 楼，自动刷一批新帖。
function maybeAutoTrigger(): void {
  if (!shouldAutoTrigger('zui')) return;   // 全局急停
  const s = getZuiSettings();
  if (!s.autoInterval || s.autoInterval <= 0) return;
  const cur = getTavernFloorCount();
  const last = s.lastFloor || 0;
  if (cur - last >= s.autoInterval) { updateZuiSettings({ lastFloor: cur }); void aiFeed(_cat, 'incremental'); }
}
function openApp(): void {
  openModal2(`${iconHtml('fa-face-smile')} 最右`, phoneShellHtml({ rid: RID, appClass: 'th-zui' }), {
    maxWidth: ZUI_MODAL_MAXW, reset: true, revive: openApp, phone: true,
  });
  startPhoneClock();
  bindRoot();
  render();
  maybeAutoTrigger();
}
export function openZui(): void { _view = { name: 'tab', tab: 'feed' }; _promptEditId = null; openApp(); }

registerWorldApp({
  id: 'zui', name: '最右', icon: 'fa-face-smile',
  accent: 'linear-gradient(135deg,#ffe411,#f59e0b)', order: 140, open: openZui,
  wbKeys: () => { try { return getZuiSettings().worldbookEntryKeys || []; } catch (e) { void e; return []; } },
});

// 自动触发登记
registerAutoAgent({
  id: 'zui', name: '最右', icon: 'fa-face-smile', desc: '每 N 楼自动铺一批乐子帖',
  getInterval: () => { try { return getZuiSettings().autoInterval || 0; } catch (e) { void e; return 0; } },
  setInterval: (n) => { if (n > 0) _lastZuiAuto = n; updateZuiSettings({ autoInterval: n }); },
  getLastFloor: () => { try { return getZuiSettings().lastFloor || 0; } catch (e) { void e; return 0; } },
  fireNow: () => { void aiFeed(_cat, 'incremental'); },
});

// API 利用（对齐其它 app）
registerApiPlan({
  appId: 'zui', appName: '最右',
  features: [
    { id: 'feed', name: '铺帖子（乐子流）', desc: '刷新时一口气生成一批短帖，养出抽象搞笑社区生态。', defaultOn: true, standalone: false },
    { id: 'comment', name: '生成神评', desc: '为帖子生成封神/钓鱼/盖楼/谐音的神评区（含单条封神与考古）。', defaultOn: true, standalone: false },
    { id: 'meme', name: '造本站热梗', desc: '生成本站正流行的黑话热梗，供全站生成带上、供梗百科查。', defaultOn: true, standalone: false },
    { id: 'rank', name: '生成热榜', desc: '据现有帖子/神评评沙雕/神评/玩梗/显眼包榜。', defaultOn: true, standalone: false },
    { id: 'syncWb', name: '足迹同步世界书', desc: '把发帖足迹/围观焦点写进角色卡世界书，正文可读。', defaultOn: false, standalone: false },
  ],
  counts: [
    { key: 'postCount', name: '铺帖数', desc: '点刷新一次铺几条帖', def: 12, min: 4, max: 30 },
    { key: 'commentCount', name: '神评数', desc: '为帖子生成几条神评', def: 8, min: 3, max: 30 },
    { key: 'memeCount', name: '造梗数', desc: '造几个本站热梗', def: 6, min: 3, max: 15 },
  ],
});

// 注入片段（默认全关，封套包裹，按需勾选；注入必带完整字段）
registerInjectPlan({
  appId: 'zui', appName: '最右',
  wbGate: () => getZuiSettings().syncEnabled === true,   // 世界书注入总闸（=设置里「同步到世界书」，默认关）
  segments: [
    {
      id: 'myrights', name: '我刚发的右', kind: 'state',
      desc: '把「我」最近在最右发的帖注入正文，让剧情知道我在社区里整了什么活。',
      module: '发条右', what: '玩家最近发的帖（形态/频道/正文/画面/点赞）',
      guide: '后文怎么体现：可让角色刷到「我」发的帖，据此调侃、点赞、玩梗互动。帖子信息已给全，请严格照此，别新编。',
      build: () => {
        const mine = getPosts().filter(p => p.authorAlias === '我').slice(0, 5);
        if (!mine.length) return null;
        return { body: mine.map(p => zuiPostInjectLine(p)).join('\n') };
      },
    },
    {
      id: 'hotmemes', name: '本站正流行的梗', kind: 'fact',
      desc: '把社区当前热梗注入正文，作为「最近大家都在玩什么梗」的背景（含梗词与含义）。',
      module: '梗百科', what: '最右当前最火的几个梗与含义',
      guide: '后文怎么体现：当剧情触及闲聊/玩梗时，可让角色自然玩这些正当红的梗。梗信息已给全，请严格照此使用，别新编梗。',
      build: () => {
        const ms = getMemes().slice(0, 8);
        if (!ms.length) return null;
        return { body: ms.map(m => `· 「${m.term}」：${m.meaning}`).join('\n'), meta: { 条数: String(ms.length) } };
      },
    },
    {
      id: 'hotposts', name: '当前热帖/名场面', kind: 'fact',
      desc: '把平台当前热帖/封神神评注入正文，作为「最近社区在笑什么」的背景（信息完整避免正文瞎编）。',
      module: '乐子流/热榜', what: '最右上当前最火的几条帖与封神神评',
      guide: '后文怎么体现：当剧情触及刷手机/闲聊时，可让角色提及这些正当红的沙雕帖与神评作为生活背景。信息已给全，请严格照此，别新编。',
      build: () => {
        const hot = getPosts().filter(p => p.isHot || p.isEssence).slice(0, 6);
        const list = hot.length ? hot : getPosts().slice(0, 6);
        if (!list.length) return null;
        const body = list.map(p => { const god = p.comments.find(c => c.isGod); return zuiPostInjectLine(p) + (god ? `（神评「${god.body.slice(0, 24)}」）` : ''); }).join('\n');
        return { body, meta: { 条数: String(list.length) } };
      },
    },
  ],
});

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_zui__ = { openZui };
} catch (e) { void e; }














