// 世界套件 —— 饭饭（fanfan.ts）UI 模块
// PC 三栏「仙宫版大众点评」，番茄红橙(#f97316→#fb7185)。探店种草 + 排队打卡 + 榜单口碑 的本地生活社区。
//   左栏(thw-fan-side)：品牌+节拍 / 逛(附近好店·口碑榜单·探店笔记) / 我的 / 设置。
//   中栏(thw-fan-content)：四 tab（附近好店瀑布流 / 口碑榜单 / 探店笔记社区 / 我的）+ 品类快筛(顶栏下方，照抄美团) + 覆盖/增量刷新养店。
//   右栏(thw-fan-inspector)：店铺详情（店头/招牌菜/三维评分/评价卡/操作条）——详情打开时变主阅读区。
// 与美团错开：饭饭管决策+内容+口碑，详情「去美团下单」互链交易闭环。
// 注入走 inject-plan（片段化）；破限进 ordered_prompts[0]；设置 master-detail 局部刷新；全女性百合生态。
import { esc, escAttr, qs } from '../../lib/dom-utils';
import { openModal2 } from '../../status-bar-init';
import { phoneShellHtml, startPhoneClock } from '../../lib/world/phone-shell';
import { iconHtml } from '../../lib/icons';
import { registerWorldApp } from '../../lib/world/world-store';
import { registerAutoAgent, shouldAutoTrigger } from '../../lib/world/auto-registry';
import { getContact, listContactsForApp } from '../../lib/world/contacts';
import { chatGenerate, readTavernFloors, parseLooseJson, getTavernFloorCount } from '../../lib/world/ai-chat';
import { thToast, thConfirm, thPrompt, thChoose } from '../../lib/world/ui-kit';
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
import '../../lib/world/fanfan-prompts';   // 注册 fanfan.* 提示词
import {
  getFanSettings, updateFanSettings, FanSettings,
  FAN_CATS, FAN_RANK_KINDS, getCategories, addCustomCat, deleteCustomCat, getCatPrompt, setCatPrompt,
  getShops, getShop, addShops, updateShop, deleteShop, clearAiShops, FanShop,
  getReviews, addReviews, likeReview, deleteReview, clearAiReviews, recalcShopRating, FanReview,
  getNotes, getNote, addNotes, likeNote, deleteNote, clearAiNotes, FanNote,
  getRank, upsertRank,
  getUser, toggleCollect, toggleWant, checkIn, levelTitle, expToNext, addExp, setTasteTags,
  getBuddies, addBuddy, removeBuddy, getQuests, addQuest, setQuestStatus, removeQuest,
  clearAll,
} from '../../lib/world/fanfan-store';

const RID = 'th-fan-root';
const FAN_MODAL_MAXW = 'min(1120px,97vw)';
function rootEl(): HTMLElement | null { return qs<HTMLElement>('#' + RID); }

// ==================== 主题 / 字体 ====================
export const FAN_THEMES = [
  { key: 'tomato', name: '番茄食欲（默认）' },
  { key: 'peach', name: '蜜桃甜' },
  { key: 'matcha', name: '抹茶清新' },
  { key: 'grape', name: '葡萄气泡' },
  { key: 'cocoa', name: '可可暖' },
  { key: 'ink', name: '墨夜食堂' },
];
export const FAN_FONTS = [
  { key: 'system', name: '系统默认' },
  { key: 'rounded', name: '圆润可爱' },
  { key: 'serif', name: '雅致宋体' },
];

// ==================== 视图状态 ====================
type Tab = 'shops' | 'ranks' | 'notes' | 'mine';
type View =
  | { name: 'tab'; tab: Tab }
  | { name: 'shop'; id: string }
  | { name: 'note'; id: string }
  | { name: 'settings' };
let _view: View = { name: 'tab', tab: 'shops' };
let _cat = '';                 // 当前品类快筛（空=全部）
let _buddyPick = false;        // 「我的」里是否展开饭搭子通讯录选人
let _busy = false;
let _setCat = 'context';
let _promptEditId: string | null = null;
let _lastFanAuto = 20;                 // 记住上次的自动间隔，开关重开时复用
// PLACEHOLDER_FAN_HELPERS
// ==================== 生态 / 世界信息 ====================
function fanJailbreak(): string { return (getPromptText('fanfan.jailbreak') || '').trim(); }

function ecoDirective(): string {
  const s = getFanSettings();
  const lvl = (n: number, v0: string, v1: string, v2: string, v3: string, v4: string) =>
    n < 40 ? v0 : n < 80 ? v1 : n < 120 ? v2 : n < 160 ? v3 : v4;
  const lines = [
    `· 探店活跃度：${lvl(s.ecoActivity, '冷清，店少笔记少、社区没什么人气', '正常，常见店与笔记都有', '热闹，新店与探店笔记不少', '相当热闹，新店频出、探店笔记刷屏', '非常热闹，开店潮+笔记刷屏+榜单频繁更新')}`,
    `· 口碑真实度：${lvl(s.ecoTaste, '一片彩虹屁好评，几乎无差评（水军感）', '好评为主，偶有中评', '好评差评混杂，比较真实', '相当真实，踩雷差评不少、评分两极', '极真实，差评/翻车/踩雷频出，评分残酷两极分化')}`,
    `· 网红炒作度：${lvl(s.ecoHype, '朴实无网红店、不排队', '偶有网红店', '网红打卡店常见、开始要排队', '炒作浓，网红店扎堆、排队夸张、滤镜感重', '炒作爆表：处处网红店、排队两小时、黄牛代排、滤镜与真实落差大')}`,
    `· 口碑黑红度（避雷/挂店烈度 ⚠）：${lvl(s.ecoToxic, '零恶意，最多温和吐槽', '偶有避雷提醒', '有避雷帖与差评开撕', '黑红明显：挂店/塌房瓜/卫生翻车帖常见', '黑红拉满：挂店网暴、塌房大瓜、开撕对线激烈（仍锁在虚构娱乐、幸福的烦恼级，不致郁）')}`,
    `· 色情度（露骨程度，作用于全 app 所有品类与内容——店铺/招牌菜/评价/探店笔记/榜单文案皆吃此阀，不局限于某一类）：${lvl(s.ecoErotic, '整体清水，最多暧昧双关，不出露骨表述', '偶有情趣/暧昧向的店与文案，含蓄点到', '情趣/双修向内容稳定存在，适度直白', '露骨内容活跃：情趣店/隐藏菜/包厢局与相关评价笔记直白大胆', '露骨爆表：全品类都可带情色浓度，情趣店铺满、菜品与文案极尽直白，尺度顶满（全女百合、虚构表演）')}`,
    `· 肉欲度（肉体诱惑表现，作用于全 app——服务者/食客/探店博主的身材媚态、氛围笔触统一吃此阀，不局限于某一类）：${lvl(s.ecoCarnal, '克制点到为止，少身材诱惑', '略带肉感，偶有诱惑笔触', '适度肉感诱惑，身材姿态有撩拨', '肉欲张力强，身材曲线/媚态/氛围浓墨重彩', '肉欲拉满：极致身材呈现、诱惑姿态与暧昧氛围层层堆叠')}`,
  ];
  const tpl = getPromptText('fanfan.frag.eco');
  return (tpl && tpl.indexOf('{{lines}}') >= 0) ? tpl.replace('{{lines}}', lines.join('\n')) : lines.join('\n');
}

// 世界信息块（最近正文 + 世界态当季，供生成对齐时节）
function worldBlock(extra?: string): string {
  const s = getFanSettings();
  const parts: string[] = [];
  if (s.useFloors && s.floorCount > 0) { try { const fl = readTavernFloors(s.floorCount); if (fl && fl.trim()) parts.push('【最近剧情】\n' + fl.trim()); } catch (e) { void e; } }
  try {
    const ws = getWorldState();
    if (ws.calendar && (ws.calendar.season || ws.calendar.festival)) parts.push(`【当季时令】${[ws.calendar.season, ws.calendar.festival].filter(Boolean).join('·')}${ws.calendar.daysToNext ? '（' + ws.calendar.daysToNext + '）' : ''}`);
    const seasonOn = ws.season.filter(x => x.status !== '已落幕').map(x => x.name);
    if (seasonOn.length) parts.push(`【当季大事】${seasonOn.join('、')}（可衍生节令限定店/菜）`);
  } catch (e) { void e; }
  if (extra && extra.trim()) parts.push(extra.trim());
  return parts.length ? parts.join('\n\n') : '（暂无额外世界信息，按本卡世界观与常识发挥）';
}

// 绑定世界书条目内容（作为设定来源）
async function boundWbText(): Promise<string> {
  const s = getFanSettings();
  if (!(s.worldbookEntryKeys || []).length) return '';   // 勾了条目就注入
  try { return await buildInjectFromKeys(s.worldbookEntryKeys); } catch (e) { void e; return ''; }
}
// 注入用的完整店铺档案行（注入不能只给店名，要把品类/商圈/评分/人均/三维/招牌菜/口碑/排队都带上，
// 否则正文 AI 会自行脑补出与 app 内不一致的细节）。
function fanShopInjectLine(s: FanShop): string {
  const sig = s.dishes.filter(d => d.signature).map(d => `${d.name}¥${d.price}`).slice(0, 4);
  const anyDish = sig.length ? sig : s.dishes.slice(0, 4).map(d => `${d.name}¥${d.price}`);
  const dims = [s.env ? `环境${s.env}` : '', s.taste ? `口味${s.taste}` : '', s.service ? `服务${s.service}` : ''].filter(Boolean).join('/');
  const bits = [
    `${s.name}（${s.cat}·${s.district}）`,
    `⭐${s.rating.toFixed(1)}${dims ? `[${dims}]` : ''} 人均¥${s.perCap}`,
    s.hot ? '🔥爆店' : '',
    s.queue ? `排队${s.queue}桌` : '',
    s.season ? '节令限定' : '',
    anyDish.length ? `招牌：${anyDish.join('、')}` : '',
    s.hiddenMenu ? `隐藏菜：${s.hiddenMenu}` : '',
    s.blurb ? `口碑：${s.blurb}` : '',
  ].filter(Boolean);
  return '· ' + bits.join('；');
}
// 某品类的引导（玩家自定义 catPrompt + 默认）
function catGuide(cat: string): string {
  if (!cat) return '综合各品类，混出一条风格各异的探店流（正餐/甜点/小馆/小吃/深夜食堂等都可有）。';
  return getCatPrompt(cat) || `围绕「${cat}」品类出店。`;
}

// 具名食客池（读通讯录，让评价/笔记/饭搭子有真人）
function castLine(): string {
  try {
    const cs = listContactsForApp('fanfan');
    const names = cs.map(c => c.name).filter(Boolean).slice(0, 24);
    return names.length ? names.join('、') : '（通讯录为空，用贴合世界观的化名）';
  } catch (e) { void e; return '（用贴合世界观的化名）'; }
}
// PLACEHOLDER_FAN_GEN
// ==================== AI 生成 ====================
// 铺店：mode 增量/覆盖。cat 空=综合。
async function aiPopulate(cat: string, mode: 'incremental' | 'overwrite'): Promise<void> {
  if (_busy) { thToast('正在生成，请稍候', 'warn'); return; }
  if (!isFeatureOn('fanfan', 'populate')) { thToast('「铺店」产出项已在设置·API利用里关闭', 'warn'); return; }
  if (mode === 'overwrite') {
    const ok = await thConfirm({ title: '覆盖刷新', message: `清掉${cat ? '「' + cat + '」' : ''}AI 铺的路人店后重新铺一批？（保留你收藏/想吃/打卡过的、角色开的、绑世界书的店）`, confirmText: '覆盖刷新', danger: true });
    if (!ok) return;
  }
  _busy = true; render();
  try {
    const count = planCount('fanfan', 'populateCount') || 6;
    const catWb = cat ? await buildCatWbContext('fanfan', cat) : (await boundWbText());
    const system = getPromptText('fanfan.populate')
      .replace(/\{\{\s*worldBlock\s*\}\}/g, worldBlock())
      .replace(/\{\{\s*cat\s*\}\}/g, cat || '综合')
      .replace(/\{\{\s*catGuide\s*\}\}/g, catGuide(cat))
      .replace(/\{\{\s*catWb\s*\}\}/g, catWb || '（未绑定专属设定，按世界观常识发挥）')
      .replace(/\{\{\s*eco\s*\}\}/g, ecoDirective())
      .replace(/\{\{\s*count\s*\}\}/g, String(count));
    const raw = await chatGenerate({ system, user: `请刷新「${cat || '综合'}」的探店流，只输出 JSON 数组。`, aiPresetName: undefined, shouldStream: false, jailbreak: fanJailbreak(), appId: 'fanfan', promptId: 'fanfan.populate' });
    const arr = parseLooseJson(raw);
    if (!Array.isArray(arr) || !arr.length) { thToast('没有生成有效店铺', 'error'); return; }
    if (mode === 'overwrite') clearAiShops(cat || undefined);
    addShops(arr as Partial<FanShop>[], cat || (arr[0]?.cat || '仙膳正餐'), { isAi: true });
    thToast(`已铺 ${arr.length} 家店`, 'success');
  } catch (err) { thToast('铺店失败：' + (err instanceof Error ? err.message : String(err)), 'error'); }
  finally { _busy = false; render(); }
}

// 为某店生成评价：mode 覆盖/增量
async function aiReviews(shopId: string, mode: 'incremental' | 'overwrite'): Promise<void> {
  if (_busy) { thToast('正在生成，请稍候', 'warn'); return; }
  if (!isFeatureOn('fanfan', 'reviews')) { thToast('「评价」产出项已在设置里关闭', 'warn'); return; }
  const s = getShop(shopId); if (!s) return;
  _busy = true; render();
  try {
    const count = planCount('fanfan', 'reviewCount') || 6;
    const system = getPromptText('fanfan.reviews')
      .replace(/\{\{\s*shop\s*\}\}/g, `${s.name}（${s.cat}，人均¥${s.perCap}，现评分${s.rating}；食客池可选：${castLine()}）`)
      .replace(/\{\{\s*worldBlock\s*\}\}/g, worldBlock())
      .replace(/\{\{\s*eco\s*\}\}/g, ecoDirective())
      .replace(/\{\{\s*count\s*\}\}/g, String(count));
    const raw = await chatGenerate({ system, user: `为「${s.name}」生成 ${count} 条评价，只输出 JSON 数组。`, aiPresetName: undefined, shouldStream: false, jailbreak: fanJailbreak(), appId: 'fanfan', promptId: 'fanfan.reviews' });
    const arr = parseLooseJson(raw);
    if (!Array.isArray(arr) || !arr.length) { thToast('没有生成有效评价', 'error'); return; }
    if (mode === 'overwrite') clearAiReviews(shopId);
    addReviews(shopId, arr as Partial<FanReview>[], { isAi: true });
    recalcShopRating(shopId);
    thToast(`已生成 ${arr.length} 条评价`, 'success');
  } catch (err) { thToast('生成评价失败：' + (err instanceof Error ? err.message : String(err)), 'error'); }
  finally { _busy = false; render(); }
}

// 生成探店笔记：mode 覆盖/增量
async function aiNotes(mode: 'incremental' | 'overwrite'): Promise<void> {
  if (_busy) { thToast('正在生成，请稍候', 'warn'); return; }
  if (!isFeatureOn('fanfan', 'note')) { thToast('「笔记」产出项已在设置里关闭', 'warn'); return; }
  _busy = true; render();
  try {
    const count = planCount('fanfan', 'noteCount') || 5;
    const shopList = getShops().slice(0, 20).map(x => `${x.name}(${x.cat})`).join('、') || '（暂无店，可自由发挥店名）';
    const system = getPromptText('fanfan.note')
      .replace(/\{\{\s*worldBlock\s*\}\}/g, worldBlock('【可关联的店】' + shopList + '\n【探店博主可用真名】' + castLine()))
      .replace(/\{\{\s*eco\s*\}\}/g, ecoDirective())
      .replace(/\{\{\s*count\s*\}\}/g, String(count));
    const raw = await chatGenerate({ system, user: `生成 ${count} 篇探店笔记，只输出 JSON 数组。`, aiPresetName: undefined, shouldStream: false, jailbreak: fanJailbreak(), appId: 'fanfan', promptId: 'fanfan.note' });
    const arr = parseLooseJson(raw);
    if (!Array.isArray(arr) || !arr.length) { thToast('没有生成有效笔记', 'error'); return; }
    if (mode === 'overwrite') clearAiNotes();
    addNotes(arr as Partial<FanNote>[], { isAi: true });
    thToast(`已生成 ${arr.length} 篇探店笔记`, 'success');
  } catch (err) { thToast('生成笔记失败：' + (err instanceof Error ? err.message : String(err)), 'error'); }
  finally { _busy = false; render(); }
}
// PLACEHOLDER_FAN_GEN_2
// 生成/刷新某榜单
async function aiRank(kind: string): Promise<void> {
  if (_busy) { thToast('正在生成，请稍候', 'warn'); return; }
  if (!isFeatureOn('fanfan', 'rank')) { thToast('「榜单」产出项已在设置里关闭', 'warn'); return; }
  const meta = FAN_RANK_KINDS.find(k => k.id === kind); if (!meta) return;
  const shops = getShops();
  if (shops.length < 3) { thToast('店太少，先去「附近好店」刷几家再评榜', 'warn'); return; }
  _busy = true; render();
  try {
    const shopLines = shops.slice(0, 30).map(s => `${s.name}｜${s.cat}｜⭐${s.rating}｜人均¥${s.perCap}｜${s.hot ? '爆店' : ''}排队${s.queue || 0}桌`).join('\n');
    const count = Math.min(10, Math.max(5, Math.floor(shops.length / 2)));
    const system = getPromptText('fanfan.rank')
      .replace(/\{\{\s*rankTitle\s*\}\}/g, meta.title)
      .replace(/\{\{\s*shops\s*\}\}/g, shopLines)
      .replace(/\{\{\s*worldBlock\s*\}\}/g, worldBlock())
      .replace(/\{\{\s*count\s*\}\}/g, String(count));
    const raw = await chatGenerate({ system, user: `评出「${meta.title}」，只输出 JSON 对象。`, aiPresetName: undefined, shouldStream: false, jailbreak: fanJailbreak(), appId: 'fanfan', promptId: 'fanfan.rank' });
    const obj = parseLooseJson(raw);
    const entries = Array.isArray(obj?.entries) ? obj.entries : [];
    if (!entries.length) { thToast('没有生成有效榜单', 'error'); return; }
    const mapped = entries.map((e: any) => {
      const hit = shops.find(s => s.name === e.shopName) || shops.find(s => (e.shopName || '').includes(s.name));
      return { shopId: hit?.id || '', shopName: e.shopName || hit?.name || '', reason: e.reason || '' };
    }).filter((e: any) => e.shopName);
    upsertRank(kind, meta.title, mapped, obj?.note);
    thToast(`已更新「${meta.title}」`, 'success');
  } catch (err) { thToast('生成榜单失败：' + (err instanceof Error ? err.message : String(err)), 'error'); }
  finally { _busy = false; render(); }
}

// 为某店（重）生成菜单
async function aiMenu(shopId: string): Promise<void> {
  if (_busy) { thToast('正在生成，请稍候', 'warn'); return; }
  if (!isFeatureOn('fanfan', 'menu')) { thToast('「菜单」产出项已在设置里关闭', 'warn'); return; }
  const s = getShop(shopId); if (!s) return;
  _busy = true; render();
  try {
    const dishCount = planCount('fanfan', 'dishCount') || 10;
    const catWb = await buildCatWbContext('fanfan', s.cat);
    const system = getPromptText('fanfan.menu')
      .replace(/\{\{\s*shop\s*\}\}/g, `${s.name}（${s.cat}，人均¥${s.perCap}，${s.district}）`)
      .replace(/\{\{\s*catWb\s*\}\}/g, catWb || '（无专属设定，按世界观发挥）')
      .replace(/\{\{\s*count\s*\}\}/g, String(dishCount))
      .replace(/\{\{\s*eco\s*\}\}/g, ecoDirective());
    const raw = await chatGenerate({ system, user: `为「${s.name}」配招牌菜单（约 ${dishCount} 道），只输出 JSON 数组。`, aiPresetName: undefined, shouldStream: false, jailbreak: fanJailbreak(), appId: 'fanfan', promptId: 'fanfan.menu' });
    const arr = parseLooseJson(raw);
    if (!Array.isArray(arr) || !arr.length) { thToast('没有生成有效菜单', 'error'); return; }
    updateShop(shopId, { dishes: arr.map((d: any) => ({ name: d.name || '菜', price: typeof d.price === 'number' ? d.price : 38, signature: d.signature, spicy: d.spicy, imgDesc: d.imgDesc })) });
    thToast('招牌菜单已更新', 'success');
  } catch (err) { thToast('生成菜单失败：' + (err instanceof Error ? err.message : String(err)), 'error'); }
  finally { _busy = false; render(); }
}

// C·饭搭子：从通讯录选人添加（不再 AI 自动生成路人——避免凭空造人、串窗口）
// 内联展开于「我的」tab，点通讯录里的人即加为饭搭子。
function buddyPickerHtml(): string {
  const existing = new Set(getBuddies().map(b => b.ref).filter(Boolean));
  const contacts = listContactsForApp('fanfan').filter(c => !c.isUser);
  const pickable = contacts.filter(c => !existing.has(c.id));
  if (!contacts.length) return `<div class="thw-fan-ctpicker"><div class="thw-fan-dim" style="padding:12px">通讯录还没有人。去「设置 App」的通讯录里添加角色，再来这里约饭。</div></div>`;
  if (!pickable.length) return `<div class="thw-fan-ctpicker"><div class="thw-fan-dim" style="padding:12px">通讯录里的人都已加为饭搭子了。</div></div>`;
  return `<div class="thw-fan-ctpicker">${pickable.map(c => `<button class="thw-fan-ctpick" data-fan-ct-pick="${escAttr(c.id)}" type="button">
    <span class="thw-fan-ctpick-av">${c.avatar ? `<img src="${escAttr(c.avatar)}" alt="">` : esc((c.name || '?').slice(0, 1))}</span>
    <span class="thw-fan-ctpick-mid"><b>${esc(c.name)}</b>${c.relationship ? `<small>${esc(c.relationship)}</small>` : ''}${c.persona ? `<span class="thw-fan-ctpick-p">${esc(c.persona.slice(0, 44))}</span>` : ''}</span>
    <span class="thw-fan-ctpick-add">${iconHtml('fa-plus')} 约</span>
  </button>`).join('')}</div>`;
}
function addBuddyFromContact(contactId: string): void {
  const c = getContact(contactId); if (!c) return;
  addBuddy({
    name: c.name, ref: c.id,
    taste: c.tags && c.tags.length ? c.tags.join('·') : (c.relationship || ''),
    pitch: '哪天一起探个店？',
  });
  thToast(`已把 ${c.name} 加为饭搭子`, 'success');
  render();
}

// C·派探店试吃任务
async function aiQuests(): Promise<void> {
  if (_busy) { thToast('正在生成，请稍候', 'warn'); return; }
  _busy = true; render();
  try {
    const shopLines = getShops().slice(0, 20).map(s => `${s.name}(${s.cat})`).join('、') || '（不限店）';
    const system = getPromptText('fanfan.quest')
      .replace(/\{\{\s*shops\s*\}\}/g, shopLines)
      .replace(/\{\{\s*worldBlock\s*\}\}/g, worldBlock())
      .replace(/\{\{\s*count\s*\}\}/g, '3');
    const raw = await chatGenerate({ system, user: '派 3 个探店试吃任务，只输出 JSON 数组。', aiPresetName: undefined, shouldStream: false, jailbreak: fanJailbreak(), appId: 'fanfan', promptId: 'fanfan.quest' });
    const arr = parseLooseJson(raw);
    if (!Array.isArray(arr) || !arr.length) { thToast('没有派出任务', 'error'); return; }
    arr.slice(0, 5).forEach((q: any) => { const hit = getShops().find(s => s.name === q.shopName); addQuest({ shopId: hit?.id, shopName: q.shopName || '不限店', task: q.task || '去探店', reward: q.reward || '探店经验' }); });
    thToast(`派了 ${Math.min(arr.length, 5)} 个试吃任务`, 'success');
  } catch (err) { thToast('派任务失败：' + (err instanceof Error ? err.message : String(err)), 'error'); }
  finally { _busy = false; render(); }
}

// ---- 跨 app 联动 ----
// 去美团下单：把这家店塞进美团（复用美团开单）。美团 store 用 addShops，这里通过 window 桥调用。
function goMeituan(shopId: string): void {
  const s = getShop(shopId); if (!s) return;
  try {
    const api = (window as any).__th_world_meituan__;
    if (api && typeof api.openMeituan === 'function') {
      api.openMeituan();
      thToast(`已跳转美团，去下单「${s.name}」`, 'success');
    } else { thToast('美团未就绪', 'warn'); }
  } catch (e) { void e; thToast('跳转美团失败', 'error'); }
}
// PLACEHOLDER_FAN_VIEWS
// ==================== 视图 HTML ====================
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'shops', icon: 'fa-store', label: '附近好店' },
  { id: 'ranks', icon: 'fa-trophy', label: '口碑榜单' },
  { id: 'notes', icon: 'fa-images', label: '探店笔记' },
  { id: 'mine', icon: 'fa-user', label: '我的' },
];
function curTab(): Tab | '' { return _view.name === 'tab' ? _view.tab : ''; }
function stars(n: number): string { const full = Math.round(n); return '★'.repeat(Math.max(0, Math.min(5, full))) + '☆'.repeat(Math.max(0, 5 - full)); }

function sidebarHtml(): string {
  const u = getUser();
  const noteCount = getNotes().length;
  const navBtn = (tab: Tab, icon: string, label: string, badge?: string) => {
    const on = curTab() === tab;
    return `<button class="thw-fan-nav${on ? ' on' : ''}" data-fan-tab="${tab}" type="button"><span class="thw-fan-nav-ico">${iconHtml(icon)}</span><span class="thw-fan-nav-lbl">${esc(label)}</span>${badge ? `<span class="thw-fan-nav-badge">${badge}</span>` : ''}</button>`;
  };
  const mineN = u.collects.length + u.wantList.length;
  const setOn = _view.name === 'settings';
  return `<aside class="thw-sidebar thw-fan-side">
    <div class="thw-fan-brand">${iconHtml('fa-bowl-rice')} <b>饭饭</b></div>
    <div class="thw-fan-beat">${iconHtml('fa-utensils')} Lv.${u.level} ${esc(levelTitle(u.level))} · 探店笔记 ${noteCount}</div>
    <div class="thw-fan-navsec">逛</div>
    <nav class="thw-fan-navs">
      ${navBtn('shops', 'fa-store', '附近好店')}
      ${navBtn('ranks', 'fa-trophy', '口碑榜单')}
      ${navBtn('notes', 'fa-images', '探店笔记', noteCount ? String(noteCount) : '')}
      ${navBtn('mine', 'fa-user', '我的', mineN ? String(mineN) : '')}
    </nav>
    <span class="thw-fan-side-grow"></span>
    <button class="thw-fan-nav thw-fan-nav-set${setOn ? ' on' : ''}" data-fan-settings type="button"><span class="thw-fan-nav-ico">${iconHtml('fa-gear')}</span><span class="thw-fan-nav-lbl">设置</span></button>
  </aside>`;
}

// 店卡（中列瀑布流）
function shopCardHtml(s: FanShop): string {
  const sel = _view.name === 'shop' && _view.id === s.id;
  const badges = [
    s.hot ? `<span class="thw-fan-badge hot">${iconHtml('fa-fire')}爆店</span>` : '',
    s.season ? `<span class="thw-fan-badge season">${iconHtml('fa-star')}限定</span>` : '',
    s.collected ? `<span class="thw-fan-badge col">${iconHtml('fa-bookmark')}收藏</span>` : '',
    s.checkedIn ? `<span class="thw-fan-badge chk">${iconHtml('fa-circle-check')}打卡</span>` : '',
  ].filter(Boolean).join('');
  const queue = s.queue ? `<span class="thw-fan-queue">${iconHtml('fa-hourglass-half')} 排队${s.queue}桌${s.heatTrend && s.heatTrend !== '稳' ? '·热度' + s.heatTrend : ''}</span>` : '';
  return `<button class="thw-fan-scard${sel ? ' on' : ''}" data-fan-shop="${esc(s.id)}" type="button">
    <div class="thw-fan-scard-cover">${iconHtml('fa-utensils')}${s.coverDesc ? `<span class="thw-fan-cover-desc">${esc(s.coverDesc)}</span>` : ''}</div>
    <div class="thw-fan-scard-body">
      <div class="thw-fan-scard-top"><span class="thw-fan-scard-name">${esc(s.name)}</span>${badges}</div>
      <div class="thw-fan-scard-rate"><span class="thw-fan-stars">${stars(s.rating)}</span> <b>${s.rating.toFixed(1)}</b> · 人均¥${s.perCap}</div>
      <div class="thw-fan-scard-meta">${esc(s.cat)} · ${esc(s.district)}</div>
      ${s.blurb ? `<div class="thw-fan-scard-blurb">「${esc(s.blurb)}」</div>` : ''}
      ${queue}
    </div>
  </button>`;
}
// PLACEHOLDER_FAN_VIEWS_2
// 中列顶栏：品类筛选(中间上方，照抄美团) + 覆盖/增量刷新
function tabTopbar(tab: Tab): string {
  const title = TABS.find(t => t.id === tab)?.label || '';
  let ops = '';
  if (tab === 'shops') {
    ops = `<button class="thw-btn thw-btn-mini" data-fan-refresh type="button" ${_busy ? 'disabled' : ''} title="增量刷一批新店${_cat ? '（' + _cat + '）' : ''}">${_busy ? iconHtml('fa-spinner') : iconHtml('fa-rotate')} 刷新${_cat ? esc(_cat) : ''}</button>
      <button class="thw-btn thw-btn-mini" data-fan-refresh-ow type="button" ${_busy ? 'disabled' : ''} title="清路人店后重铺（保留收藏/打卡/角色/绑书的）">${iconHtml('fa-eraser')} 覆盖刷新</button>`;
  } else if (tab === 'ranks') {
    ops = `<button class="thw-btn thw-btn-mini" data-fan-rank-all type="button" ${_busy ? 'disabled' : ''} title="一键刷新必吃/新店/人气三榜">${_busy ? iconHtml('fa-spinner') : iconHtml('fa-rotate')} 刷新全部榜单</button>`;
  } else if (tab === 'notes') {
    ops = `<button class="thw-btn thw-btn-mini" data-fan-note-refresh type="button" ${_busy ? 'disabled' : ''} title="AI 铺一批探店笔记养社区">${_busy ? iconHtml('fa-spinner') : iconHtml('fa-rotate')} 刷新</button>
      <button class="thw-btn thw-btn-mini" data-fan-note-refresh-ow type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-eraser')} 覆盖刷新</button>
      <button class="thw-btn-primary thw-btn-mini" data-fan-note-new type="button">${iconHtml('fa-pen')} 写笔记</button>`;
  }
  // 品类快筛：只在「附近好店」tab 出现，横排于顶栏下方（点分类→只看该类，再点刷新→铺该类的店）
  const catStrip = (tab === 'shops') ? (() => {
    const cats = getCategories();
    const chips = `<button class="thw-fan-catchip${_cat === '' ? ' on' : ''}" data-fan-cat="" type="button">全部</button>` +
      cats.map(c => `<button class="thw-fan-catchip${_cat === c.name ? ' on' : ''}" data-fan-cat="${escAttr(c.name)}" type="button">${iconHtml(c.icon)} ${esc(c.name)}</button>`).join('');
    return `<div class="thw-fan-catstrip">${chips}</div>`;
  })() : '';
  return `<div class="thw-topbar">
    <span class="thw-topbar-title">${iconHtml(TABS.find(t => t.id === tab)?.icon || 'fa-store')} ${esc(title)}${_cat && tab === 'shops' ? ` · ${esc(_cat)}` : ''}</span>
    <span class="thw-topbar-spacer"></span>${ops}
  </div>${catStrip}`;
}

function shopsTabHtml(): string {
  const list = getShops(_cat || undefined);
  const cards = list.length ? list.map(shopCardHtml).join('')
    : `<div class="thw-empty"><div class="thw-empty-t">${_cat ? '「' + esc(_cat) + '」还没有店' : '这一带还没有店'}</div><div class="thw-empty-d">点右上「刷新${_cat ? esc(_cat) : ''}」让本地食客涌进来开店写评，把探店生态养起来。</div></div>`;
  return `<div class="thw-content thw-fan-content">${tabTopbar('shops')}<div class="thw-content-pad thw-fan-feed">${cards}</div></div>`;
}

function ranksTabHtml(): string {
  const blocks = FAN_RANK_KINDS.map(k => {
    const r = getRank(k.id);
    const body = r && r.entries.length
      ? `${r.note ? `<div class="thw-fan-rank-note">${iconHtml('fa-bullhorn')} ${esc(r.note)}</div>` : ''}` +
        r.entries.map((e, i) => `<button class="thw-fan-rank-row" data-fan-shop="${esc(e.shopId)}" type="button" ${e.shopId ? '' : 'disabled'}>
          <span class="thw-fan-rank-no th-rank-${i < 3 ? i + 1 : 'n'}">${i + 1}</span>
          <span class="thw-fan-rank-mid"><span class="thw-fan-rank-shop">${esc(e.shopName)}</span><span class="thw-fan-rank-reason">${esc(e.reason)}</span></span>
        </button>`).join('')
      : `<div class="thw-empty-d" style="padding:10px">还没生成，点右侧刷新。</div>`;
    return `<div class="thw-fan-rankcard"><div class="thw-fan-rankcard-h"><span class="thw-fan-rankcard-t">${iconHtml(k.icon)} ${esc(k.title)}</span><button class="thw-btn thw-btn-mini" data-fan-rank="${k.id}" type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-rotate')} 刷新</button></div>${body}</div>`;
  }).join('');
  return `<div class="thw-content thw-fan-content">${tabTopbar('ranks')}<div class="thw-content-pad thw-fan-ranks">${blocks}</div></div>`;
}

function noteCardHtml(n: FanNote): string {
  return `<div class="thw-fan-ncard" data-fan-note="${esc(n.id)}">
    <div class="thw-fan-ncard-cover">${iconHtml('fa-image')}${n.coverDesc ? `<span class="thw-fan-cover-desc">${esc(n.coverDesc)}</span>` : ''}</div>
    <div class="thw-fan-ncard-body">
      <div class="thw-fan-ncard-title">${esc(n.title)}</div>
      <div class="thw-fan-ncard-sub">${esc(n.author)}${n.shopName ? ` · ${esc(n.shopName)}` : ''}${n.rating ? ` · ${stars(n.rating)}` : ''}</div>
      ${(n.tags && n.tags.length) ? `<div class="thw-fan-ncard-tags">${n.tags.slice(0, 4).map(t => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="thw-fan-ncard-ops"><button class="thw-fan-nlike" data-fan-note-like="${esc(n.id)}" type="button">${iconHtml('fa-heart')} ${n.likes}</button><span>${iconHtml('fa-bookmark')} ${n.collects}</span></div>
    </div>
  </div>`;
}
function notesTabHtml(): string {
  const list = getNotes();
  const cards = list.length ? `<div class="thw-fan-ngrid">${list.map(noteCardHtml).join('')}</div>`
    : `<div class="thw-empty"><div class="thw-empty-t">探店社区还很安静</div><div class="thw-empty-d">点「刷新」让探店博主来发一批种草笔记，或自己「写笔记」。</div></div>`;
  return `<div class="thw-content thw-fan-content">${tabTopbar('notes')}<div class="thw-content-pad">${cards}</div></div>`;
}
// PLACEHOLDER_FAN_VIEWS_3
// 「我的」tab：食客成长看板(A) + 收藏想吃 + 打卡足迹 + 饭搭子/试吃任务(C)
function mineTabHtml(): string {
  const u = getUser();
  const prog = expToNext(u.exp);
  const badges = u.badges.length ? u.badges.map(b => `<span class="thw-fan-badge2">${iconHtml('fa-medal')} ${esc(b)}</span>`).join('') : '<span class="thw-fan-dim">多探店多写评，解锁勋章</span>';
  const tasteTags = u.tasteTags.length ? u.tasteTags.map(t => `<span class="thw-fan-taste">${esc(t)}</span>`).join('') : '<span class="thw-fan-dim">探店多了会长出口味画像</span>';
  const collects = u.collects.map(id => getShop(id)).filter(Boolean) as FanShop[];
  const wants = u.wantList.map(id => getShop(id)).filter(Boolean) as FanShop[];
  const shopMini = (s: FanShop) => `<button class="thw-fan-mini-shop" data-fan-shop="${esc(s.id)}" type="button">${iconHtml('fa-utensils')} ${esc(s.name)} <small>${stars(s.rating)}</small></button>`;
  const checkins = u.checkins.slice(0, 20).map(c => `<div class="thw-fan-checkin"><span class="thw-fan-checkin-dot"></span><div><b>${esc(c.shopName)}</b>${c.note ? ` — ${esc(c.note)}` : ''}<small>${new Date(c.ts).toLocaleDateString()}</small></div></div>`).join('') || '<div class="thw-fan-dim">还没有打卡足迹，去店里「打卡」吧</div>';
  const buddies = getBuddies();
  const buddyList = buddies.length ? buddies.map(b => `<div class="thw-fan-buddy"><div class="thw-fan-buddy-mid"><b>${esc(b.name)}</b>${b.taste ? `<small>${esc(b.taste)}</small>` : ''}${b.pitch ? `<div class="thw-fan-buddy-pitch">「${esc(b.pitch)}」</div>` : ''}</div><div class="thw-fan-buddy-ops"><button class="thw-iconbtn" data-fan-buddy-del="${esc(b.id)}" type="button">${iconHtml('fa-xmark')}</button></div></div>`).join('') : '<div class="thw-fan-dim">点下方找几位饭搭子</div>';
  const quests = getQuests();
  const questList = quests.length ? quests.map(q => `<div class="thw-fan-quest th-q-${q.status}"><div class="thw-fan-quest-mid"><b>${esc(q.shopName)}</b><small>${esc(q.task)}</small><span class="thw-fan-quest-reward">${iconHtml('fa-gift')} ${esc(q.reward)}</span></div><div class="thw-fan-quest-ops">${q.status !== 'done' ? `<button class="thw-btn thw-btn-mini" data-fan-quest-done="${esc(q.id)}" type="button">${iconHtml('fa-check')}完成</button>` : `<span class="thw-fan-quest-tag">已完成</span>`}<button class="thw-iconbtn" data-fan-quest-del="${esc(q.id)}" type="button">${iconHtml('fa-xmark')}</button></div></div>`).join('') : '<div class="thw-fan-dim">点下方派探店试吃任务</div>';
  return `<div class="thw-content thw-fan-content">
    <div class="thw-topbar"><span class="thw-topbar-title">${iconHtml('fa-user')} 我的</span></div>
    <div class="thw-content-pad thw-fan-mine">
      <div class="thw-fan-lvcard">
        <div class="thw-fan-lv-top"><span class="thw-fan-lv-title">${iconHtml('fa-utensils')} Lv.${u.level} ${esc(levelTitle(u.level))}</span><span class="thw-fan-lv-exp">${prog.cur}/${prog.need} 经验</span></div>
        <div class="thw-fan-lv-bar"><span style="width:${prog.pct}%"></span></div>
        <div class="thw-fan-lv-stat">打卡 ${u.checkins.length} · 收藏 ${u.collects.length} · 想吃 ${u.wantList.length}</div>
      </div>
      <div class="thw-fan-mine-sec">${iconHtml('fa-medal')} 探店勋章</div>
      <div class="thw-fan-badges">${badges}</div>
      <div class="thw-fan-mine-sec">${iconHtml('fa-heart')} 口味画像 <button class="thw-btn thw-btn-mini" data-fan-taste-edit type="button">${iconHtml('fa-pen')} 编辑</button></div>
      <div class="thw-fan-tastes">${tasteTags}</div>
      <div class="thw-fan-mine-sec">${iconHtml('fa-bookmark')} 收藏 (${collects.length})</div>
      <div class="thw-fan-mini-shops">${collects.length ? collects.map(shopMini).join('') : '<span class="thw-fan-dim">还没收藏</span>'}</div>
      <div class="thw-fan-mine-sec">${iconHtml('fa-clock')} 想吃清单 (${wants.length})</div>
      <div class="thw-fan-mini-shops">${wants.length ? wants.map(shopMini).join('') : '<span class="thw-fan-dim">还没想吃的店</span>'}</div>
      <div class="thw-fan-mine-sec">${iconHtml('fa-user-group')} 饭搭子 <button class="thw-btn thw-btn-mini${_buddyPick ? ' on' : ''}" data-fan-buddy-find type="button">${iconHtml('fa-address-book')} ${_buddyPick ? '收起' : '从通讯录添加'}</button></div>
      ${_buddyPick ? buddyPickerHtml() : ''}
      <div class="thw-fan-buddies">${buddyList}</div>
      <div class="thw-fan-mine-sec">${iconHtml('fa-ticket')} 探店试吃任务 <button class="thw-btn thw-btn-mini" data-fan-quest-find type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-dice')} 派任务</button></div>
      <div class="thw-fan-quests">${questList}</div>
      <div class="thw-fan-mine-sec">${iconHtml('fa-shoe-prints')} 打卡足迹</div>
      <div class="thw-fan-checkins">${checkins}</div>
    </div>
  </div>`;
}
// PLACEHOLDER_FAN_DETAIL
// 右列：店铺详情
function dimBar(label: string, v: number): string {
  return `<div class="thw-fan-dim-row"><span>${label}</span><span class="thw-fan-dim-bar"><span style="width:${Math.min(100, v / 5 * 100)}%"></span></span><b>${v.toFixed(1)}</b></div>`;
}
function reviewCardHtml(r: FanReview): string {
  const tri = (r.env || r.taste || r.service) ? `<span class="thw-fan-rv-tri">环境${r.env ?? '-'}·口味${r.taste ?? '-'}·服务${r.service ?? '-'}</span>` : '';
  return `<div class="thw-fan-rv${r.toxic ? ' toxic' : ''}">
    <div class="thw-fan-rv-head"><span class="thw-fan-rv-author">${esc(r.author)}${r.certified ? ` <span class="thw-fan-cert">${iconHtml('fa-certificate')}达人</span>` : ''}</span><span class="thw-fan-rv-rate">${stars(r.rating)}</span></div>
    ${tri}
    <div class="thw-fan-rv-body">${esc(r.content).replace(/\n/g, '<br>')}</div>
    ${r.imgDesc ? `<div class="thw-fan-rv-img">${iconHtml('fa-image')} ${esc(r.imgDesc)}</div>` : ''}
    ${r.reply ? `<div class="thw-fan-rv-reply">${iconHtml('fa-reply')} 店家：${esc(r.reply)}</div>` : ''}
    <div class="thw-fan-rv-ops"><button class="thw-fan-rv-like" data-fan-rv-like="${esc(r.id)}" type="button">${iconHtml('fa-thumbs-up')} ${r.likes}</button><button class="thw-fan-rv-del" data-fan-rv-del="${esc(r.id)}" type="button">${iconHtml('fa-trash')}</button></div>
  </div>`;
}
function shopDetailHtml(id: string): string {
  const s = getShop(id);
  if (!s) return `<div class="thw-inspector thw-fan-inspector"><div class="thw-inspector-empty">${iconHtml('fa-store')}<div>店铺不存在</div></div></div>`;
  const reviews = getReviews(id);
  const dishes = s.dishes.length ? `<div class="thw-fan-dishgrid">${s.dishes.map(d => `<div class="thw-fan-dish${d.signature ? ' sig' : ''}">
    <div class="thw-fan-dish-row"><span class="thw-fan-dish-n">${d.signature ? iconHtml('fa-star') + ' ' : ''}${esc(d.name)}${d.spicy ? ' ' + '🌶️'.repeat(Math.min(3, d.spicy)) : ''}</span><span class="thw-fan-dish-p">¥${d.price}</span></div>
    ${d.imgDesc ? `<span class="thw-fan-dish-desc">${esc(d.imgDesc)}</span>` : ''}</div>`).join('')}</div>` : `<div class="thw-fan-dim">还没有菜单，点下方「AI 配菜单」。</div>`;
  const revBody = reviews.length ? reviews.map(reviewCardHtml).join('') : `<div class="thw-fan-dim" style="padding:8px">还没有评价，点「AI 生成评价」让食客来打分。</div>`;
  return `<div class="thw-inspector thw-fan-inspector">
    <div class="thw-inspector-head">
      <button class="thw-iconbtn" data-fan-detail-back type="button" title="返回列表">${iconHtml('fa-arrow-left')}</button>
      <span class="thw-inspector-title">${esc(s.name)}</span>
      <span class="thw-topbar-spacer"></span>
      <button class="thw-iconbtn${s.collected ? ' on' : ''}" data-fan-collect="${esc(s.id)}" type="button" title="${s.collected ? '取消收藏' : '收藏'}">${iconHtml('fa-bookmark')}</button>
      <button class="thw-iconbtn${s.wantTo ? ' on' : ''}" data-fan-want="${esc(s.id)}" type="button" title="${s.wantTo ? '移出想吃' : '加入想吃'}">${iconHtml('fa-clock')}</button>
      <button class="thw-iconbtn" data-fan-shop-del="${esc(s.id)}" type="button" title="删除店铺">${iconHtml('fa-trash')}</button>
    </div>
    <div class="thw-fan-detail-scroll">
      <div class="thw-fan-shead">
        <div class="thw-fan-shead-cover">${iconHtml('fa-utensils')}${s.coverDesc ? `<span class="thw-fan-cover-desc">${esc(s.coverDesc)}</span>` : ''}</div>
        <div class="thw-fan-shead-rate"><b class="thw-fan-shead-score">${s.rating.toFixed(1)}</b><span class="thw-fan-stars">${stars(s.rating)}</span><span class="thw-fan-shead-per">人均 ¥${s.perCap}</span></div>
        <div class="thw-fan-shead-meta">${esc(s.cat)} · ${esc(s.district)}${s.hot ? ' · <b class="thw-fan-hot">🔥爆店</b>' : ''}${s.queue ? ` · 排队${s.queue}桌` : ''}</div>
        ${s.blurb ? `<div class="thw-fan-shead-blurb">「${esc(s.blurb)}」</div>` : ''}
      </div>
      <div class="thw-fan-dsec">${iconHtml('fa-utensils')} 招牌菜 <button class="thw-btn thw-btn-mini" data-fan-menu="${esc(s.id)}" type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-wand-magic-sparkles')} AI 配菜单</button></div>
      <div class="thw-fan-dishes">${dishes}</div>
      ${s.hiddenMenu ? `<div class="thw-fan-hidden">${iconHtml('fa-key')} 熟客暗号隐藏菜：${esc(s.hiddenMenu)}</div>` : ''}
      <div class="thw-fan-dsec">${iconHtml('fa-star-half-stroke')} 评分分布</div>
      <div class="thw-fan-dims">${dimBar('环境', s.env)}${dimBar('口味', s.taste)}${dimBar('服务', s.service)}</div>
      <div class="thw-fan-dsec">${iconHtml('fa-comments')} 评价 (${reviews.length}) <span class="thw-fan-rvgen"><button class="thw-btn thw-btn-mini" data-fan-rv-gen="${esc(s.id)}" type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-rotate')} 生成</button><button class="thw-btn thw-btn-mini" data-fan-rv-gen-ow="${esc(s.id)}" type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-eraser')} 覆盖</button></span></div>
      <div class="thw-fan-reviews">${revBody}</div>
    </div>
    <div class="thw-fan-detail-ops">
      <button class="thw-btn thw-btn-mini" data-fan-review-mine="${esc(s.id)}" type="button">${iconHtml('fa-pen')} 写点评</button>
      <button class="thw-btn thw-btn-mini" data-fan-note-shop="${esc(s.id)}" type="button">${iconHtml('fa-camera')} 发探店</button>
      <button class="thw-btn thw-btn-mini${s.checkedIn ? ' on' : ''}" data-fan-checkin="${esc(s.id)}" type="button">${iconHtml('fa-location-crosshairs')} 打卡</button>
      <button class="thw-btn thw-btn-mini" data-fan-inject-shop="${esc(s.id)}" type="button" title="加入注入暂存夹">${iconHtml('fa-syringe')} 加注入</button>
      <button class="thw-btn-primary thw-btn-mini" data-fan-meituan="${esc(s.id)}" type="button" title="去美团下单（交易闭环交给美团）">${iconHtml('fa-bowl-food')} 去美团下单</button>
    </div>
  </div>`;
}

// 笔记详情（作为 inspector）
function noteDetailHtml(id: string): string {
  const n = getNote(id);
  if (!n) return `<div class="thw-inspector thw-fan-inspector"><div class="thw-inspector-empty">${iconHtml('fa-image')}<div>笔记不存在</div></div></div>`;
  return `<div class="thw-inspector thw-fan-inspector">
    <div class="thw-inspector-head"><button class="thw-iconbtn" data-fan-detail-back type="button" title="返回列表">${iconHtml('fa-arrow-left')}</button><span class="thw-inspector-title">探店笔记</span><span class="thw-topbar-spacer"></span>
      <button class="thw-iconbtn" data-fan-note-inject="${esc(n.id)}" type="button" title="加入注入暂存夹">${iconHtml('fa-syringe')}</button>
      <button class="thw-iconbtn" data-fan-note-del="${esc(n.id)}" type="button">${iconHtml('fa-trash')}</button>
    </div>
    <div class="thw-fan-detail-scroll">
      <div class="thw-fan-note-cover">${iconHtml('fa-image')}${n.coverDesc ? `<span class="thw-fan-cover-desc">${esc(n.coverDesc)}</span>` : ''}</div>
      <div class="thw-fan-note-title">${esc(n.title)}</div>
      <div class="thw-fan-note-sub">${esc(n.author)}${n.shopName ? ` · 探店 ${esc(n.shopName)}` : ''}${n.rating ? ` · ${stars(n.rating)}` : ''}</div>
      <div class="thw-fan-note-body">${esc(n.content).replace(/\n/g, '<br>')}</div>
      ${(n.tags && n.tags.length) ? `<div class="thw-fan-ncard-tags">${n.tags.map(t => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="thw-fan-note-ops"><button class="thw-fan-nlike" data-fan-note-like="${esc(n.id)}" type="button">${iconHtml('fa-heart')} ${n.likes}</button><span>${iconHtml('fa-bookmark')} ${n.collects}</span></div>
    </div>
  </div>`;
}
// PLACEHOLDER_FAN_SETTINGS
// ==================== 设置（master-detail，对齐其它 app）====================
const FAN_SET_CATS: ScaffoldCatDef[] = [
  { id: 'context', canon: 'read' },
  { id: 'inject', canon: 'write' },
  'auto',
  { id: 'cats', icon: 'fa-tags', label: '品类管理' },
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
function sliderRow(label: string, hint: string, cls: string, val: number): string {
  return `<div class="thw-field"><div class="thw-flabel">${label} <b class="thw-fan-slider-val">${val}</b></div>
    <input type="range" min="0" max="200" step="5" class="thw-fan-slider ${cls}" value="${val}">
    ${hint ? `<div class="thw-set-hint">${hint}</div>` : ''}</div>`;
}
function settingsHtml(): string {
  const navs = scaffoldNavHtml('fan', normalizeScaffoldCats(FAN_SET_CATS), _setCat);
  return `<div class="thw-content thw-fan-content thw-fan-settings">
    <div class="thw-topbar"><span class="thw-topbar-title">${iconHtml('fa-gear')} 饭饭设置</span></div>
    <div class="thw-fan-set-body"><nav class="thw-fan-set-nav">${navs}</nav><div class="thw-fan-set-detail thw-content-pad thw-view-in">${settingsDetailHtml()}</div></div>
  </div>`;
}
function settingsDetailHtml(): string {
  const s = getFanSettings();
  if (_setCat === 'context') {
    const wbReady = isWorldbookAvailable();
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">生成上下文</span></div>
      ${switchRow('参考最近正文', '铺店/评价/笔记时读取最近几楼正文，贴合当前剧情与时节', 'thw-fan-cfg-floors', s.useFloors)}
      <div class="thw-field"><div class="thw-flabel">读取楼层数</div><input type="number" min="0" max="30" class="thw-input thw-fan-cfg-floorcount" value="${s.floorCount}"></div>
      <div class="thw-set-hint">饭饭还会自动读「世界态·当季时令」来生成节令限定店/菜（在世界演化里推进世界态即可）。</div>
    </div>
    <div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-book')} 注入酒馆世界书（设定来源）</span></div>
      <div class="thw-set-hint">${wbReady ? '勾选要用的世界书条目即生效（作为吃食/店铺/地点的权威设定），可跨多本书混选。改设定改世界书即可，不必动提示词。品类还能各自绑条目（见「品类管理」）。' : '当前环境无世界书接口。'}</div>
      <div class="thw-fan-set-wbpick" data-fan-wbpick-host>${wbReady ? wbPickerHtml(s.worldbookEntryKeys || []) : ''}</div>
    </div>`;
  }
  if (_setCat === 'auto') {
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-bolt')} 楼层自动触发</span></div>
      ${switchRow('每 N 楼自动铺一批店', '正文每推进设定楼数，打开饭饭时自动刷一批新探店流（0=关）', 'thw-fan-cfg-autoen', (s.autoInterval || 0) > 0)}
      ${(s.autoInterval || 0) > 0 ? `<div class="thw-field"><div class="thw-flabel">每隔 N 楼<small>正文每推进 N 楼，下次打开饭饭时自动刷一批「综合」探店流</small></div>
        <input type="number" min="1" max="200" class="thw-input thw-fan-cfg-auto" value="${s.autoInterval}"></div>` : ''}
    </div>`;
  }
  if (_setCat === 'inject') {
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-syringe')} 注入正文</span></div>
      <div class="thw-set-hint">饭饭独立于正文，但可把口碑焦点店/我的探店足迹/某店评价切片自由注入世界书或输入框，实现联动。默认全关，按需勾选去向。</div>
      ${injectPlanPanelHtml('fanfan')}</div>`;
  }
  if (_setCat === 'api') {
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">API 利用</span></div>
      <div class="thw-set-hint">每个产出项一张卡：勾选它这次产出什么、各自批量额度，省 token。</div>${apiPlanPanelHtml('fanfan')}</div>`;
  }
  if (_setCat === 'eco') {
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">探店生态浓度</span></div>
      <div class="thw-set-hint">调节饭饭本地生态的「气氛」，生成时通用化读取（不写死提示词）。0-100 常规，100-200 逐档加码。</div>
      ${sliderRow('探店活跃度', '越高越多新店/笔记/榜单刷新', 'thw-fan-eco-activity', s.ecoActivity)}
      ${sliderRow('口碑真实度', '越高差评/踩雷/翻车越真实（低=一片好评水军感）', 'thw-fan-eco-taste', s.ecoTaste)}
      ${sliderRow('网红炒作度', '越高网红店/排队/滤镜落差越夸张', 'thw-fan-eco-hype', s.ecoHype)}
      ${sliderRow('口碑黑红度（避雷/挂店烈度 ⚠）', '基调阀：低=温和吐槽零恶意；越高挂店/塌房瓜/开撕越激烈（仍锁虚构娱乐、幸福的烦恼级）', 'thw-fan-eco-toxic', s.ecoToxic)}
      ${sliderRow('色情度（露骨程度）', '作用于全 app 所有品类与内容（店/菜/评价/笔记/榜单文案）——越高越直白露骨（全女百合GL）', 'thw-fan-eco-erotic', s.ecoErotic)}
      ${sliderRow('肉欲度（肉体诱惑表现）', '作用于全 app——越高身材/媚态/暧昧氛围越浓', 'thw-fan-eco-carnal', s.ecoCarnal)}
    </div>`;
  }
  if (_setCat === 'cats') {
    const cats = getCategories();
    const rows = cats.map(c => {
      const custom = !FAN_CATS.some(x => x.name === c.name);
      return `<div class="thw-fan-catrow">
        <div class="thw-fan-catrow-h"><span>${iconHtml(c.icon)} ${esc(c.name)}${custom ? ' <em class="thw-tag">自定义</em>' : ''}</span>${custom ? `<button class="thw-iconbtn" data-fan-cat-del="${escAttr(c.name)}" type="button">${iconHtml('fa-trash')}</button>` : ''}</div>
        <textarea class="thw-input thw-fan-catprompt" data-fan-catprompt="${escAttr(c.name)}" rows="3" placeholder="本品类的生成引导（母题/招牌菜套路/口碑生态）">${esc(getCatPrompt(c.name))}</textarea>
        <div class="thw-fan-catwb" data-fan-catwb-host="${escAttr(c.name)}">${catWbBindHtml('fanfan', c.name)}</div>
      </div>`;
    }).join('');
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">品类管理</span><button class="thw-btn thw-btn-mini" data-fan-cat-add type="button">${iconHtml('fa-plus')} 新品类</button></div>
      <div class="thw-set-hint">每个品类的生成引导可改；还能给品类绑世界书条目作专属设定来源（改设定不改 prompt）。</div>${rows}</div>`;
  }
  if (_setCat === 'prompts') {
    const tpls = listPromptTemplates('fanfan').filter(t => !t.id.startsWith('inject.envelope.') && t.id !== 'fanfan.frag.eco');
    const rows = tpls.map(t => `<button class="thw-card thw-card-hover thw-fan-pl-row" data-fan-pl-edit="${esc(t.id)}" type="button">
      <span class="thw-fan-pl-mid"><span class="thw-fan-pl-ttl">${esc(t.name)}${t.id.endsWith('.jailbreak') ? ` <span class="thw-tag">${iconHtml('fa-unlock-keyhole')}破限</span>` : ''}${isPromptOverridden(t.id) ? ' <span class="thw-tag">已改</span>' : ''}</span><span class="thw-fan-pl-desc">${esc(t.desc || '')}</span></span>
      <span class="thw-fan-pl-arrow">${iconHtml('fa-chevron-right')}</span></button>`).join('');
    const frag = listPromptTemplates('fanfan').find(t => t.id === 'fanfan.frag.eco');
    const fragRow = frag ? `<button class="thw-card thw-card-hover thw-fan-pl-row" data-fan-pl-edit="${esc(frag.id)}" type="button"><span class="thw-fan-pl-mid"><span class="thw-fan-pl-ttl">${esc(frag.name)}${isPromptOverridden(frag.id) ? ' <span class="thw-tag">已改</span>' : ''}</span><span class="thw-fan-pl-desc">${esc(frag.desc || '')}</span></span><span class="thw-fan-pl-arrow">${iconHtml('fa-chevron-right')}</span></button>` : '';
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">功能提示词</span></div>
      <div class="thw-set-hint">${tpls.length} 项主提示词 · 破限已置顶，点开就地编辑或 AI 重写。改提示词不必改世界书。</div>${rows}</div>
      <details class="thw-fan-fragsec"><summary>${iconHtml('fa-puzzle-piece')} 小片段（生态包装语）</summary>${fragRow}</details>`;
  }
  if (_setCat === 'appear') {
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">外观</span></div>
      <div class="thw-field"><div class="thw-flabel">主题皮肤</div><select class="thw-select thw-fan-cfg-theme">${FAN_THEMES.map(t => `<option value="${t.key}" ${s.theme === t.key ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
      <div class="thw-field"><div class="thw-flabel">字体</div><select class="thw-select thw-fan-cfg-font">${FAN_FONTS.map(f => `<option value="${f.key}" ${s.font === f.key ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></div>
    </div>`;
  }
  // data
  return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">记忆</span></div>
    <div class="thw-set-hint">口碑焦点/探店足迹可同步进世界书；这里管理本 APP 的记忆沉淀。</div>${appMemPanelHtml('fanfan')}</div>
    <div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">数据管理</span></div>
    <button class="thw-btn thw-btn-danger thw-btn-mini" data-fan-clear type="button">${iconHtml('fa-trash')} 清空店铺/评价/笔记/榜单（保留设置）</button></div>`;
}
// 提示词编辑页（页内视图，占中列）
function promptEditViewHtml(id: string): string {
  const t = listPromptTemplates('fanfan').find(x => x.id === id);
  return `<div class="thw-content thw-fan-content">
    <div class="thw-topbar"><button class="thw-iconbtn" data-fan-pe-close type="button">${iconHtml('fa-arrow-left')}</button><span class="thw-topbar-title">${esc(t?.name || '提示词')}</span>
      <span class="thw-topbar-spacer"></span><button class="thw-btn thw-btn-mini" data-fan-pe-reset type="button">${iconHtml('fa-rotate-left')} 恢复默认</button><button class="thw-btn-primary thw-btn-mini" data-fan-pe-save type="button">${iconHtml('fa-check')} 保存</button></div>
    <div class="thw-content-pad thw-view-in">
      <div class="thw-set-hint">${esc(t?.desc || '')}</div>
      <textarea class="thw-input thw-fan-pe-text" rows="16">${esc(getPromptText(id))}</textarea>
      ${aiPromptEditorHtml(id)}
      ${id.endsWith('.jailbreak') || id === 'fanfan.frag.eco' ? '' : promptWbBindHtml(id)}
    </div>
  </div>`;
}
// PLACEHOLDER_FAN_RENDER
// ==================== 渲染 ====================
function render(): void {
  const root = rootEl(); if (!root) return;
  const s = getFanSettings();
  let content = ''; let inspector = '';
  if (_promptEditId) { content = promptEditViewHtml(_promptEditId); }
  else if (_view.name === 'settings') { content = settingsHtml(); }
  else if (_view.name === 'shop') {
    const sh = getShop(_view.id);
    content = shopsTabHtml();
    inspector = sh ? shopDetailHtml(_view.id) : '';
  }
  else if (_view.name === 'note') {
    content = notesTabHtml();
    inspector = noteDetailHtml(_view.id);
  }
  else {
    const tab = _view.tab;
    content = tab === 'shops' ? shopsTabHtml() : tab === 'ranks' ? ranksTabHtml() : tab === 'notes' ? notesTabHtml() : mineTabHtml();
  }
  const hasDetail = (_view.name === 'shop' || _view.name === 'note') ? ' thw-fan-hasdetail' : '';
  const themeCls = `thw-fan-theme-${s.theme || 'tomato'} thw-fan-font-${s.font || 'system'}`;
  root.innerHTML = `<div class="thw-app thw-fan-app2 ${themeCls}${hasDetail}">
    <div class="thw-body">${sidebarHtml()}${content}${inspector}</div>
  </div>`;
  // 绑定命令式子组件
  if (_view.name === 'settings' && !_promptEditId) {
    if (_setCat === 'context' && isWorldbookAvailable()) {
      const host = root.querySelector('[data-fan-wbpick-host]') as HTMLElement | null;
      if (host) bindWbPicker(host, () => getFanSettings().worldbookEntryKeys || [], (keys) => updateFanSettings({ worldbookEntryKeys: keys }));
    }
    if (_setCat === 'cats') { root.querySelectorAll('[data-fan-catwb-host]').forEach(h => bindCatWbHost(h as HTMLElement)); }
  }
  if (_promptEditId) { const scope = root.querySelector('.thw-content') as HTMLElement | null; if (scope) bindPromptWbHost(scope); }
}

function goTab(tab: Tab): void { _view = { name: 'tab', tab }; _promptEditId = null; render(); }

// ==================== 事件 ====================
function bindRoot(): void {
  const root = rootEl(); if (!root || (root as any)._fanBound) return;
  (root as any)._fanBound = true;
  root.addEventListener('click', (e) => { void onClick(e); });
  root.addEventListener('change', (e) => onChange(e));
}

async function onClick(e: Event): Promise<void> {
  const t = e.target as HTMLElement;
  // 导航
  const tabBtn = t.closest('[data-fan-tab]') as HTMLElement | null;
  if (tabBtn) { goTab(tabBtn.getAttribute('data-fan-tab') as Tab); return; }
  if (t.closest('[data-fan-settings]')) { _view = { name: 'settings' }; _setCat = 'context'; _promptEditId = null; render(); return; }
  const catChip = t.closest('[data-fan-cat]') as HTMLElement | null;
  if (catChip && catChip.hasAttribute('data-fan-cat')) { _cat = catChip.getAttribute('data-fan-cat') || ''; _view = { name: 'tab', tab: 'shops' }; render(); return; }
  // 店铺流刷新（跟随当前品类）
  if (t.closest('[data-fan-refresh-ow]')) { void aiPopulate(_cat, 'overwrite'); return; }
  if (t.closest('[data-fan-refresh]')) { void aiPopulate(_cat, 'incremental'); return; }
  // 榜单
  const rk = t.closest('[data-fan-rank]') as HTMLElement | null;
  if (rk) { void aiRank(rk.getAttribute('data-fan-rank') || ''); return; }
  if (t.closest('[data-fan-rank-all]')) { for (const k of FAN_RANK_KINDS) { await aiRank(k.id); } return; }
  // 笔记
  if (t.closest('[data-fan-note-refresh-ow]')) { void aiNotes('overwrite'); return; }
  if (t.closest('[data-fan-detail-back]')) { _view = { name: 'tab', tab: _view.name === 'note' ? 'notes' : 'shops' }; render(); return; }
  if (t.closest('[data-fan-note-refresh]')) { void aiNotes('incremental'); return; }
  if (t.closest('[data-fan-note-new]')) { void writeNote(); return; }
  const noteLike = t.closest('[data-fan-note-like]') as HTMLElement | null;
  if (noteLike) { likeNote(noteLike.getAttribute('data-fan-note-like') || ''); render(); return; }
  const noteOpen = t.closest('[data-fan-note]') as HTMLElement | null;
  if (noteOpen && !t.closest('[data-fan-note-like]')) { _view = { name: 'note', id: noteOpen.getAttribute('data-fan-note') || '' }; render(); return; }
  if (t.closest('[data-fan-note-del]')) { const id = (t.closest('[data-fan-note-del]') as HTMLElement).getAttribute('data-fan-note-del') || ''; deleteNote(id); _view = { name: 'tab', tab: 'notes' }; render(); return; }
  const noteInj = t.closest('[data-fan-note-inject]') as HTMLElement | null;
  if (noteInj) { const n = getNote(noteInj.getAttribute('data-fan-note-inject') || ''); if (n) { addToStash('fanfan', `探店笔记·${n.title}`, `${n.author}：${n.content}`); thToast('已加入注入暂存夹', 'success'); } return; }
  if (await onShopClick(t)) return;
  if (await onMineClick(t)) return;
  if (await onSettingsClick(t)) return;
}
// PLACEHOLDER_FAN_CLICK2
async function onShopClick(t: HTMLElement): Promise<boolean> {
  const open = t.closest('[data-fan-shop]') as HTMLElement | null;
  if (open && !t.closest('button[data-fan-collect],button[data-fan-want]')) {
    const id = open.getAttribute('data-fan-shop') || ''; if (!id) return true;
    _view = { name: 'shop', id }; _promptEditId = null; render(); return true;
  }
  const col = t.closest('[data-fan-collect]') as HTMLElement | null;
  if (col) { toggleCollect(col.getAttribute('data-fan-collect') || ''); render(); return true; }
  const want = t.closest('[data-fan-want]') as HTMLElement | null;
  if (want) { toggleWant(want.getAttribute('data-fan-want') || ''); render(); return true; }
  const del = t.closest('[data-fan-shop-del]') as HTMLElement | null;
  if (del) { const id = del.getAttribute('data-fan-shop-del') || ''; const ok = await thConfirm({ title: '删除店铺', message: '删除这家店及其评价？', confirmText: '删除', danger: true }); if (ok) { deleteShop(id); _view = { name: 'tab', tab: 'shops' }; render(); } return true; }
  const menu = t.closest('[data-fan-menu]') as HTMLElement | null;
  if (menu) { void aiMenu(menu.getAttribute('data-fan-menu') || ''); return true; }
  const rvGenOw = t.closest('[data-fan-rv-gen-ow]') as HTMLElement | null;
  if (rvGenOw) { void aiReviews(rvGenOw.getAttribute('data-fan-rv-gen-ow') || '', 'overwrite'); return true; }
  const rvGen = t.closest('[data-fan-rv-gen]') as HTMLElement | null;
  if (rvGen) { void aiReviews(rvGen.getAttribute('data-fan-rv-gen') || '', 'incremental'); return true; }
  const rvLike = t.closest('[data-fan-rv-like]') as HTMLElement | null;
  if (rvLike) { likeReview(rvLike.getAttribute('data-fan-rv-like') || ''); render(); return true; }
  const rvDel = t.closest('[data-fan-rv-del]') as HTMLElement | null;
  if (rvDel) { deleteReview(rvDel.getAttribute('data-fan-rv-del') || ''); render(); return true; }
  const chk = t.closest('[data-fan-checkin]') as HTMLElement | null;
  if (chk) {
    const id = chk.getAttribute('data-fan-checkin') || '';
    const r = checkIn(id); render();
    let msg = '打卡成功 +15 探店经验';
    if (r.leveledUp) msg += `，升级到 Lv.${getUser().level} ${levelTitle(getUser().level)}！`;
    if (r.newBadges.length) msg += ` 解锁勋章：${r.newBadges.join('、')}`;
    thToast(msg, 'success'); return true;
  }
  const rvMine = t.closest('[data-fan-review-mine]') as HTMLElement | null;
  if (rvMine) {
    const id = rvMine.getAttribute('data-fan-review-mine') || '';
    const ratingStr = await thChoose({
      title: '打几分？', message: '给这家店的综合评分',
      options: [
        { value: '5', label: '★★★★★ 5 分', desc: '强推，好吃到跺脚', primary: true },
        { value: '4', label: '★★★★☆ 4 分', desc: '不错，会再来' },
        { value: '3', label: '★★★☆☆ 3 分', desc: '一般，中规中矩' },
        { value: '2', label: '★★☆☆☆ 2 分', desc: '踩雷，不太行' },
        { value: '1', label: '★☆☆☆☆ 1 分', desc: '避雷，别来了', danger: true },
      ],
    });
    if (ratingStr == null) return true;
    const rating = Math.max(1, Math.min(5, Number(ratingStr) || 5));
    const txt = await thPrompt({ title: '写点评', message: '你对这家店的评价：', value: '', multiline: true });
    if (txt != null) { addReviews(id, [{ author: '我', rating, content: String(txt).trim() || (rating >= 4 ? '好吃，推荐！' : rating <= 2 ? '踩雷了，不推荐。' : '一般般吧。'), kind: 'short' }]); recalcShopRating(id); const up = addExp(8); render(); thToast(up ? '点评成功，升级啦！' : '点评成功 +8 经验', 'success'); }
    return true;
  }
  const noteShop = t.closest('[data-fan-note-shop]') as HTMLElement | null;
  if (noteShop) { const s = getShop(noteShop.getAttribute('data-fan-note-shop') || ''); void writeNote(s); return true; }
  const inj = t.closest('[data-fan-inject-shop]') as HTMLElement | null;
  if (inj) { const s = getShop(inj.getAttribute('data-fan-inject-shop') || ''); if (s) { addToStash('fanfan', `探店·${s.name}`, fanShopInjectLine(s).replace(/^·\s*/, '')); thToast('已加入注入暂存夹', 'success'); } return true; }
  const mt = t.closest('[data-fan-meituan]') as HTMLElement | null;
  if (mt) { goMeituan(mt.getAttribute('data-fan-meituan') || ''); return true; }
  return false;
}

async function onMineClick(t: HTMLElement): Promise<boolean> {
  if (t.closest('[data-fan-buddy-find]')) { _buddyPick = !_buddyPick; render(); return true; }
  if (t.closest('[data-fan-quest-find]')) { void aiQuests(); return true; }
  const ctPick = t.closest('[data-fan-ct-pick]') as HTMLElement | null;
  if (ctPick) { addBuddyFromContact(ctPick.getAttribute('data-fan-ct-pick') || ''); return true; }
  const bd = t.closest('[data-fan-buddy-del]') as HTMLElement | null;
  if (bd) { removeBuddy(bd.getAttribute('data-fan-buddy-del') || ''); render(); return true; }
  const qDone = t.closest('[data-fan-quest-done]') as HTMLElement | null;
  if (qDone) { setQuestStatus(qDone.getAttribute('data-fan-quest-done') || '', 'done'); addExp(20); render(); thToast('任务完成 +20 经验', 'success'); return true; }
  const qDel = t.closest('[data-fan-quest-del]') as HTMLElement | null;
  if (qDel) { removeQuest(qDel.getAttribute('data-fan-quest-del') || ''); render(); return true; }
  if (t.closest('[data-fan-taste-edit]')) {
    const cur = getUser().tasteTags.join('、');
    const v = await thPrompt({ title: '口味画像', message: '用「、」分隔你的口味标签（如 嗜辣、甜党、猎奇）：', value: cur });
    if (v != null) { setTasteTags(String(v).split(/[、,，]/).map(x => x.trim()).filter(Boolean)); render(); }
    return true;
  }
  return false;
}
// PLACEHOLDER_FAN_CLICK3
async function onSettingsClick(t: HTMLElement): Promise<boolean> {
  // 提示词编辑页
  if (t.closest('[data-fan-pe-close]')) { _promptEditId = null; render(); return true; }
  if (t.closest('[data-fan-pe-save]')) {
    const ta = rootEl()?.querySelector('.thw-fan-pe-text') as HTMLTextAreaElement | null;
    if (ta && _promptEditId) { setPromptOverride(_promptEditId, ta.value); thToast('已保存', 'success'); _promptEditId = null; render(); }
    return true;
  }
  if (t.closest('[data-fan-pe-reset]')) { if (_promptEditId) { resetPrompt(_promptEditId); thToast('已恢复默认', 'success'); render(); } return true; }
  if (_promptEditId && bindAiPromptEditor({ target: t } as unknown as Event, () => (rootEl()?.querySelector('.thw-fan-pe-text') as HTMLTextAreaElement)?.value || '', (txt) => { const ta = rootEl()?.querySelector('.thw-fan-pe-text') as HTMLTextAreaElement | null; if (ta) ta.value = txt; })) return true;
  // 设置分类切换（局部刷新右侧 detail）
  const setcat = t.closest('[data-fan-setcat]') as HTMLElement | null;
  if (setcat) {
    _setCat = setcat.getAttribute('data-fan-setcat') || 'context';
    patchSettingsDetail({ root: rootEl(), detailSel: '.thw-fan-set-detail', navSel: '[data-fan-setcat]', navAttr: 'data-fan-setcat', navOnClass: 'thw-nav-on', cat: _setCat, html: settingsDetailHtml() });
    // 重绑命令式子组件
    const root = rootEl();
    if (root) {
      if (_setCat === 'context' && isWorldbookAvailable()) { const host = root.querySelector('[data-fan-wbpick-host]') as HTMLElement | null; if (host) bindWbPicker(host, () => getFanSettings().worldbookEntryKeys || [], (keys) => updateFanSettings({ worldbookEntryKeys: keys })); }
      if (_setCat === 'cats') root.querySelectorAll('[data-fan-catwb-host]').forEach(h => bindCatWbHost(h as HTMLElement));
    }
    return true;
  }
  // 共享面板点击
  if (t.closest('[data-inj-app]') && bindInjectPlanPanel({ target: t } as unknown as Event)) return true;
  if (t.closest('[data-apiplan-app]') && bindApiPlanPanel({ target: t } as unknown as Event)) return true;
  if (t.closest('[data-amem-app]') && bindAppMemPanel({ target: t } as unknown as Event)) return true;
  if (t.closest('[data-wbsync-app]') && bindWbSyncPanel({ target: t } as unknown as Event)) return true;
  // 提示词进编辑
  const plEdit = t.closest('[data-fan-pl-edit]') as HTMLElement | null;
  if (plEdit) { _promptEditId = plEdit.getAttribute('data-fan-pl-edit') || ''; render(); return true; }
  // 品类管理
  if (t.closest('[data-fan-cat-add]')) {
    const v = await thPrompt({ title: '新品类', message: '品类名（如「烧烤大排档」）：', value: '' });
    if (v != null && String(v).trim()) { addCustomCat(String(v).trim()); render(); }
    return true;
  }
  const catDel = t.closest('[data-fan-cat-del]') as HTMLElement | null;
  if (catDel) { deleteCustomCat(catDel.getAttribute('data-fan-cat-del') || ''); render(); return true; }
  // 数据清空
  if (t.closest('[data-fan-clear]')) {
    const ok = await thConfirm({ title: '清空数据', message: '清空所有店铺/评价/笔记/榜单？（设置与「我的成长」等级徽章会保留）确认清空？', confirmText: '清空', danger: true });
    if (ok) { clearAll(); _view = { name: 'tab', tab: 'shops' }; render(); thToast('已清空', 'success'); }
    return true;
  }
  return false;
}

// 写探店笔记（玩家自己发）
async function writeNote(shop?: FanShop): Promise<void> {
  const title = await thPrompt({ title: '写探店笔记', message: '标题：', value: shop ? `打卡${shop.name}` : '' });
  if (title == null) return;
  const content = await thPrompt({ title: '写探店笔记', message: '正文（种草/避雷都行）：', value: '', multiline: true });
  if (content == null) return;
  addNotes([{ author: '我', title: String(title).trim() || '探店', content: String(content).trim(), shopId: shop?.id, shopName: shop?.name, rating: shop?.rating }]);
  const up = addExp(12); goTab('notes');
  thToast(up ? '笔记发布，升级啦！' : '笔记发布 +12 经验', 'success');
}

function onChange(e: Event): void {
  const t = e.target as HTMLElement;
  if (t.closest('[data-inj-app]') && bindInjectPlanPanelChange(e)) return;
  if (t.closest('[data-apiplan-app]') && bindApiPlanPanelChange(e)) return;
  if (t.closest('[data-amem-app]') && bindAppMemPanel(e)) return;
  if (t.closest('[data-wbsync-app]') && bindWbSyncPanelChange(e)) return;
  // 生态滑块实时标签 + 存
  if (t.classList.contains('thw-fan-slider')) {
    const val = Number((t as HTMLInputElement).value);
    const lbl = t.parentElement?.querySelector('.thw-fan-slider-val'); if (lbl) lbl.textContent = String(val);
    const map: Record<string, keyof FanSettings> = { 'thw-fan-eco-activity': 'ecoActivity', 'thw-fan-eco-taste': 'ecoTaste', 'thw-fan-eco-hype': 'ecoHype', 'thw-fan-eco-toxic': 'ecoToxic', 'thw-fan-eco-erotic': 'ecoErotic', 'thw-fan-eco-carnal': 'ecoCarnal' };
    for (const cls of Object.keys(map)) if (t.classList.contains(cls)) { updateFanSettings({ [map[cls]]: val } as Partial<FanSettings>); return; }
    return;
  }
  if (t.classList.contains('thw-fan-cfg-floors')) { updateFanSettings({ useFloors: (t as HTMLInputElement).checked }); return; }
  if (t.classList.contains('thw-fan-cfg-floorcount')) { updateFanSettings({ floorCount: Math.max(0, Number((t as HTMLInputElement).value) || 0) }); return; }
  // 自动触发开关/间隔
  if (t.classList.contains('thw-fan-cfg-autoen')) { const on = (t as HTMLInputElement).checked; updateFanSettings({ autoInterval: on ? (_lastFanAuto > 0 ? _lastFanAuto : 20) : 0 }); render(); return; }
  if (t.classList.contains('thw-fan-cfg-auto')) { const n = Math.max(1, Math.min(200, Number((t as HTMLInputElement).value) || 1)); _lastFanAuto = n; updateFanSettings({ autoInterval: n }); return; }
  if (t.classList.contains('thw-fan-cfg-theme')) { updateFanSettings({ theme: (t as HTMLSelectElement).value }); render(); return; }
  if (t.classList.contains('thw-fan-cfg-font')) { updateFanSettings({ font: (t as HTMLSelectElement).value }); render(); return; }
  // 品类提示词就地存
  const catPrompt = t.closest('[data-fan-catprompt]') as HTMLElement | null;
  if (catPrompt && t.classList.contains('thw-fan-catprompt')) { setCatPrompt(catPrompt.getAttribute('data-fan-catprompt') || '', (t as HTMLTextAreaElement).value); return; }
}
// PLACEHOLDER_FAN_REGISTER
// ==================== 打开 / 注册 ====================
// 楼层自动触发——打开饭饭时若正文比上次触发多推进了 autoInterval 楼，自动刷一批「综合」探店流。
function maybeAutoTrigger(): void {
  if (!shouldAutoTrigger('fanfan')) return;   // 全局急停
  const s = getFanSettings();
  if (!s.autoInterval || s.autoInterval <= 0) return;
  const cur = getTavernFloorCount();
  const last = s.lastFloor || 0;
  if (cur - last >= s.autoInterval) { updateFanSettings({ lastFloor: cur }); void aiPopulate('', 'incremental'); }
}
function openApp(): void {
  openModal2(`${iconHtml('fa-bowl-rice')} 饭饭`, phoneShellHtml({ rid: RID, appClass: 'th-fan' }), {
    maxWidth: FAN_MODAL_MAXW, reset: true, revive: openApp, phone: true,
  });
  startPhoneClock();
  bindRoot();
  render();
  maybeAutoTrigger();
}
export function openFanfan(): void { _view = { name: 'tab', tab: 'shops' }; _promptEditId = null; openApp(); }

registerWorldApp({
  id: 'fanfan', name: '饭饭', icon: 'fa-bowl-rice',
  accent: 'linear-gradient(135deg,#f97316,#fb7185)', order: 120, open: openFanfan,
  wbKeys: () => { try { return getFanSettings().worldbookEntryKeys || []; } catch (e) { void e; return []; } },
});

// 自动触发登记
registerAutoAgent({
  id: 'fanfan', name: '饭饭', icon: 'fa-bowl-rice', desc: '每 N 楼自动铺一批店',
  getInterval: () => { try { return getFanSettings().autoInterval || 0; } catch (e) { void e; return 0; } },
  setInterval: (n) => { if (n > 0) _lastFanAuto = n; updateFanSettings({ autoInterval: n }); },
  getLastFloor: () => { try { return getFanSettings().lastFloor || 0; } catch (e) { void e; return 0; } },
  fireNow: () => { void aiPopulate('', 'incremental'); },
});

// API 利用
registerApiPlan({
  appId: 'fanfan', appName: '饭饭',
  features: [
    { id: 'populate', name: '铺店（探店流）', desc: '刷新时一口气生成一批店，养出本地探店生态。', defaultOn: true, standalone: false },
    { id: 'reviews', name: '生成食客评价', desc: '为店生成三维评分 + 立场混杂的评价。', defaultOn: true, standalone: false },
    { id: 'note', name: '生成探店笔记', desc: '铺一批种草/避雷图文笔记养社区。', defaultOn: true, standalone: false },
    { id: 'rank', name: '生成榜单', desc: '据现有店评出必吃/新店/人气榜。', defaultOn: true, standalone: false },
    { id: 'menu', name: '生成店铺菜单', desc: '为店（重）配一份招牌菜单。', defaultOn: true, standalone: false },
    { id: 'syncWb', name: '口碑同步世界书', desc: '把口碑焦点/探店足迹写进角色卡世界书，正文可读。', defaultOn: false, standalone: false },
  ],
  counts: [
    { key: 'populateCount', name: '铺店数', desc: '点刷新一次铺几家店', def: 10, min: 3, max: 30 },
    { key: 'reviewCount', name: '评价数', desc: '点开店铺生成几条评价', def: 10, min: 3, max: 30 },
    { key: 'noteCount', name: '笔记数', desc: '刷新探店社区一次铺几篇笔记', def: 8, min: 3, max: 24 },
    { key: 'dishCount', name: '菜单菜数', desc: '生成/重配店铺招牌菜单时出几道菜', def: 12, min: 4, max: 30 },
  ],
});

// 注入片段（默认全关，封套包裹，按需勾选）
registerInjectPlan({
  appId: 'fanfan', appName: '饭饭',
  wbGate: () => getFanSettings().syncEnabled === true,   // 世界书注入总闸（=设置里「同步到世界书」，默认关）
  segments: [
    {
      id: 'hotshops', name: '本地口碑焦点店', kind: 'fact',
      desc: '把当前榜单/爆店的口碑焦点注入正文，作为「这一带最近在火什么店」的背景（含品类/商圈/评分/人均/招牌菜/口碑/排队，信息完整避免正文再瞎编）。',
      module: '口碑榜单', what: '饭饭上当前最火/最能打的几家店与其完整口碑档案',
      guide: '后文怎么体现：当剧情自然触及吃饭/约饭时，可让角色提及这些正当红的店与口碑，作为本地生活背景。店的品类/招牌菜/人均/口碑已给全，请严格照此描述，别新编店名或菜。',
      build: () => {
        const hot = getShops().filter(s => s.hot).slice(0, 6);
        const list = hot.length ? hot : getShops().slice(0, 6);
        if (!list.length) return null;
        const body = list.map(s => fanShopInjectLine(s)).join('\n');
        return { body, meta: { 条数: String(list.length) } };
      },
    },
    {
      id: 'mynotes', name: '我的探店足迹/想吃', kind: 'state',
      desc: '把「我」当下的收藏/想吃/最近打卡注入正文，让角色知道我最近惦记着哪些店。',
      module: '我的', what: '玩家在饭饭里的收藏、想吃清单与最近打卡足迹',
      guide: '后文怎么体现：让角色知道「我」最近对哪些店感兴趣、去过哪，可据此邀约、调侃或投其所好。',
      build: () => {
        const u = getUser();
        const wants = u.wantList.map(id => getShop(id)?.name).filter(Boolean).slice(0, 6);
        const recent = u.checkins.slice(0, 5).map(c => c.shopName);
        const parts: string[] = [];
        if (wants.length) parts.push('想吃：' + wants.join('、'));
        if (recent.length) parts.push('最近打卡：' + recent.join('、'));
        if (!parts.length) return null;
        return { body: parts.map(p => '· ' + p).join('\n'), meta: { 等级: `Lv.${u.level} ${levelTitle(u.level)}` } };
      },
    },
    {
      id: 'reviews', name: '某店的民间口碑', kind: 'fact',
      desc: '把当前查看的店的食客评价切片注入正文，作为这家店的民间口碑。',
      module: '店铺详情', what: '当前打开的店铺的若干条食客真实评价（口碑切片）',
      guide: '后文怎么体现：把这些当作这家店在食客间的真实口碑，角色去吃或提起时可与之呼应。',
      scope: { label: '选择要注入口碑的店', list: () => getShops().filter(s => getReviews(s.id).length).slice(0, 20).map(s => ({ id: s.id, label: s.name, hint: `${getReviews(s.id).length}条评价` })) },
      build: (scopeIds) => {
        const shops = getShops().filter(s => getReviews(s.id).length);
        const picked = (scopeIds && scopeIds.length) ? shops.filter(s => scopeIds.includes(s.id)) : shops.slice(0, 1);
        if (!picked.length) return null;
        const body = picked.map(s => `【${s.name}·口碑】` + getReviews(s.id).slice(0, 5).map(r => `${r.author}(${r.rating}星)：${r.content}`).join('；')).join('\n\n');
        return { body, meta: { 店数: String(picked.length) } };
      },
    },
  ],
});

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_fanfan__ = { openFanfan };
} catch (e) { void e; }












