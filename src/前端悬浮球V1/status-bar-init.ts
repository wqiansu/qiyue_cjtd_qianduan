// 状态栏 DOM 由外壳 Shell.vue 挂载到酒馆主页面 body 上，
// 因此本模块所有 DOM 查询、事件注册都必须作用于 parent.document。
// ================================================================
import { stripFa } from './lib/icons';
import {
  getRoot,
  getMvu,
  safeGetVariables,
  safeUpdateVariablesWith,
  waitForVariableApi,
  waitUntil,
} from './lib/tavern-api';
import {
  __doc,
  __body,
  __win,
  getAbortController,
  resetAbortController,
  __sigOpt,
  __sigOptCapture,
  _wrapperId,
  gw,
  qs,
  qs2,
  qsa,
  portalModal2ToBody,
  removePortaledModal2,
  qsRoot,
  setH,
  setT,
  clamp,
  esc,
  escAttr,
  editableInput,
  editableTextarea,
  enteredWithin,
  leftWithin,
} from './lib/dom-utils';
import {
  type ManagedKind,
  ATTR_KEYS,
  ATTR_MAX,
  ATTR_CLS,
  NPC_METRICS,
  NPC_COUNTS,
  pickExtraAttrColor,
  AVATAR_COLORS,
} from './lib/config';
import { applyPhoneDrag, stopPhoneClock } from './lib/world/phone-shell';
import {
  getManagedItems,
  setCurrentManagedItems,
  addManagedItem,
} from './lib/managed-store';
import {
  openUserBag,
  openNPCBag,
  openUserSkill,
  openNPCSkill,
} from './modules/item-skill-grid';
import { openWorldbookInspectorModal } from './modules/wb-inspector';
import {
  openStashModal,
} from './modules/stash-modal';
import {
  openLocationsModal,
  openEventsModal,
  openDlcsModal,
} from './modules/managed-modal';
import {
  bindNPCGridEvents,
  buildNPCCard,
  buildRosterRow,
  openNPCDetail,
  bindClothingFoldDown,
  buildAttrBarHtml,
  openAttrModal,
  openGalleryModal,
} from './modules/npc-detail';
// 悬停浮窗系统 + metric wheel + 状态/衣物详情弹窗 + 地点/事件 hover 已抽至 ./modules/hover-tip
import {
  showHoverTip,
  hideHoverTip,
  hideHoverTipNow,
  showItemsHoverTip,
  showSkillsHoverTip,
  openStatusDetail,
  openClothingDetailModal,
  destroyHoverTips,
  hideMetricWheel,
} from './modules/hover-tip';
// 外观设置面板(8 项自定义 + data 属性重绑 + 持久化)
import { initAppearance, openAppearanceSettings } from './modules/appearance-settings';
// API 设置面板(配置 + 测试连接 + 预设管理,预留地基)
import { openApiSettings } from './modules/api-settings';
// 世界书关联模板数据层（不挂 UI 入口，仅 import 触发 window.__th_links__ 调试挂载；面板另接入）
import './modules/links-init';
// 初始化管理面板（内容看板 + 格式校验 +健康自检 +备份恢复/恢复出厂 + 关联读写入口收拢）
import { openInitManager } from './modules/init-manager';
import { openAiSummarize } from './modules/ai-summarize';
import { openPromptSettings } from './modules/prompt-settings';
import { openActivationMonitor, startActivationMonitor, stopActivationMonitor } from './modules/activation-monitor';
// 世界套件：「世界」按钮 → 桌面壳。各 APP 模块通过副作用 import 自注册到 world-store 注册表。
import { openWorldApp, disposeWorldAppBridge } from './modules/world/world-app';
import { openWorldMapModal } from './modules/world/map-modal';
// init-visual-editor 由 init-manager 看「可视化」按钮 onClick 调 openVisualEditor（静态 import，无需在此副作用挂载）
// gsap 数值条数字 CountUp 入口动画（数字 0→目标值 0.8s 滚动 + 已有 width CSS transition 配合进度条平滑过渡）
import { gsap } from 'gsap';
// 变量变化审核 + 快照系统（数据层 lib + 防递归 guard）
import {
  configureReview,
  isReviewWriting,
  approveAllPending,
  rejectAllPending,
  clearAll as clearReviewAll,
  getReviewQueue,
  getPendingCount,
  getSnapshots,
  applyReviewItem,
  deleteSnapshot,
  restoreSnapshot,
  subscribeReview,
  // 统一审核变更采集 helper + 共享基线
  setReviewBaseline,
  getReviewBaseline,
  collectStatDataChange,
} from './lib/variable-review';
// 安装 innerHTML setter 拦截：所有赋值自动过 stripFa，把 fa-xxx 换成 lucide SVG。
// 这一行必须在 status-bar-init 内部任何 innerHTML 赃值之前执行。
// 关键：modal/状态栏 DOM 都挂到 parent document，用的是 parent 的 Element.prototype，
// 所以必须在 parent 的原型上装拦截器（iframe 自己的原型管不到 parent 的元素）。
let __faStripRestore: (() => void) | null = null;
function installFaStrip(): void {
  const restorers: Array<() => void> = [];
  function installOnProto(proto: any, realmObject: ObjectConstructor) {
    if (!proto || proto.__thFaOwner === window) return;
    // 原描述符存放在 proto 自身（parent realm 内），iframe 被摘除也不失效。
    // 新 realm 接管时靠它取回原生 setter；否则只能取到上一个已死 realm 的拦截器。
    let orig = proto.__thFaOrig;
    if (!orig) {
      const desc = Object.getOwnPropertyDescriptor(proto, 'innerHTML');
      if (!desc || !desc.set) return;
      orig = realmObject.assign(realmObject.create(null), desc);
      proto.__thFaOrig = orig;
    }
    const originalSet = orig.set as (this: Element, v: string) => void;
    Object.defineProperty(proto, 'innerHTML', {
      configurable: true,
      enumerable: orig.enumerable,
      get: orig.get,
      set(v: string) {
        originalSet.call(this, stripFa(v));
      },
    });
    proto.__thFaOwner = window;
    restorers.push(() => {
      // 已被更新的 realm 接管时不还原，否则会掀掉对方的拦截器
      if (proto.__thFaOwner !== window) return;
      Object.defineProperty(proto, 'innerHTML', orig);
      delete proto.__thFaOwner;
      delete proto.__thFaOrig;
    });
  }
  // 1. iframe 自己的原型（iframe 内元素）
  installOnProto(Element.prototype, Object);
  // 2. parent 的原型（modal/状态栏 DOM 实际所在）— 必须装，否则 fa 图标不被替换
  try {
    const pw = window.parent as (Window & typeof globalThis) | null;
    if (pw && pw !== window) installOnProto(pw.Element.prototype, pw.Object);
  } catch (e) { void e; }
  __faStripRestore = () => {
    for (const r of restorers.splice(0)) { try { r(); } catch (e) { void e; } }
  };
}
installFaStrip();

// ================================================================
//  状态
// ================================================================
let currentData: Record<string,any>|null = null;
let avatarColorMap: Record<string,string> = {};
let avatarImages: Record<string,string> = {};
let avatarVersion = 0;
let uploadingTarget = '';
let isEditMode = false;
let npcFilter: 'all'|'present'|'absent' = 'all'; // NPC在场筛选
let npcSearchText: string = ''; // NPC 搜索（姓名 + 身份），实时过滤
// 名册（离场）显示模式：'row' 极简一行 / 'card' 与在场相同的完整立绘卡
let rosterMode: 'row'|'card' = 'row';

export function getCurrentStatusData(): Record<string,any>|null { return currentData; }
// 角色立绘默认头像：33 名 NPC → GitHub LFS media 直链（public 仓库 iframe 匿名可加载）。
// 中文目录/文件名已 percent 编码；仅 getter 兜底，不写入持久化变量（防 stat_data 膨胀、LFS 失效后卡死自定义头像）。
const ROLE_AVATAR_BASE = 'https://media.githubusercontent.com/media/wqiansu/qiyue_cjtd_qianduan/main/src/%E5%89%8D%E7%AB%AF%E6%82%AC%E6%B5%AE%E7%90%83V1/%E8%A7%92%E8%89%B2%E5%9B%BE/';
const ROLE_AVATAR_NAMES = ['伊蕾娜','叶惊霜','唐紫苏','婉音','师瑄瑄','幻琉璃','幽兰','明月歌','星露','晏舒秋','曹艾青','月曦','柳书意','梦清月','沐清雨','泠幽','清惜','玉含霜','白舞','秦筝','竹清清','红雨叶','绯樱','羽柔子','苏墨墨','虞初见','醉扶摇','钟瑾','陆雪琪','雪千璃','顾漫漫','顾雪酥','颜雪薇'];
function roleAvatarUrl(name: string): string { return ROLE_AVATAR_BASE + encodeURIComponent(name) + '.png'; }
export function getAvatarImages(): Record<string,string> {
  let missing = false;
  for (const n of ROLE_AVATAR_NAMES) { if (!avatarImages['npc:' + n]) { missing = true; break; } }
  if (!missing) return avatarImages;
  const out: Record<string,string> = { ...avatarImages };
  for (const n of ROLE_AVATAR_NAMES) { const k = 'npc:' + n; if (!out[k]) out[k] = roleAvatarUrl(n); }
  return out;
}
export function getStatusEditMode(): boolean { return isEditMode; }
// uploadingTarget 模块只写（NPC 头像点击上传），走 setter 防止 import 侧赋值断开引用
export function setUploadingTarget(t:string): void { uploadingTarget = t; }

// NPC 筛选持久化到 parent localStorage（跨聊天/角色卡保留）
const NPC_FILTER_STORAGE_KEY = '_th_npc_filter_v2';
const NPC_SEARCH_STORAGE_KEY = '_th_npc_search_v2'; // 搜索文本持久化
function __parentStorage(): Storage | null {
  try { return (window.parent as Window).localStorage; } catch(e){ void e; return null; }
}
function loadPersistedNpcFilter(): 'all'|'present'|'absent' {
  try {
    const ls = __parentStorage() || localStorage;
    const v = ls.getItem(NPC_FILTER_STORAGE_KEY);
    if (v === 'all' || v === 'present' || v === 'absent') return v;
  } catch(e){ void e; }
  return 'all';
}
function savePersistedNpcFilter(v: 'all'|'present'|'absent') {
  try {
    const ls = __parentStorage() || localStorage;
    ls.setItem(NPC_FILTER_STORAGE_KEY, v);
  } catch(e){ void e; }
}

// 名册显示模式持久化（跟 npcFilter 同一套 parent localStorage）
const ROSTER_MODE_STORAGE_KEY = '_th_roster_mode_v2';
function loadPersistedRosterMode(): 'row'|'card' {
  try {
    const ls = __parentStorage() || localStorage;
    return ls.getItem(ROSTER_MODE_STORAGE_KEY) === 'card' ? 'card' : 'row';
  } catch(e){ void e; return 'row'; }
}
function savePersistedRosterMode(v: 'row'|'card') {
  try {
    const ls = __parentStorage() || localStorage;
    ls.setItem(ROSTER_MODE_STORAGE_KEY, v);
  } catch(e){ void e; }
}

// NPC 搜索文本持久化（沿用 _v2 后缀，max 200 字符防滥用）
function loadPersistedNpcSearch(): string {
  try {
    const ls = __parentStorage() || localStorage;
    const v = ls.getItem(NPC_SEARCH_STORAGE_KEY) || '';
    return typeof v === 'string' ? v.slice(0, 200) : '';
  } catch(e){ void e; return ''; }
}
function savePersistedNpcSearch(v: string) {
  try {
    const ls = __parentStorage() || localStorage;
    ls.setItem(NPC_SEARCH_STORAGE_KEY, v.slice(0, 200));
  } catch(e){ void e; }
}

// 同步合并后的"在场/离场"按钮 textContent + active（模块顶层，启动时 init 也能调）
function applyPresenceBtn() {
  const btn = qs('.th-btn-presence-switcher');
  if (!btn) return;
  const active = (npcFilter === 'present' || npcFilter === 'absent');
  btn.classList.toggle('active', active);
  btn.textContent = (npcFilter === 'absent') ? '离场' : '在场';
}

// 同步名册显示模式按钮（文案 = 当前模式，active 态标"卡片"这个非默认值）
function applyRosterModeBtn() {
  const btn = qs('.th-btn-roster-mode');
  if (!btn) return;
  btn.textContent = rosterMode === 'card' ? '卡片' : '极简';
  btn.classList.toggle('active', rosterMode === 'card');
}

export function attrPct(v:number) { return clamp(Math.round(v*100/ATTR_MAX),0,100); }

const activeMessageOption: VariableOption = {type:'message', message_id:'latest'};

function readVariables(option: VariableOption): Record<string,any> {
  try { return safeGetVariables(option); }
  catch(e){ void e; }
  try {
    const mvu = getMvu();
    if(mvu?.getMvuData) return mvu.getMvuData(option);
  } catch(e){ void e; }
  throw new Error('No variable reader is available');
}

function hasStatData(option: VariableOption): boolean {
  try { return _.has(readVariables(option),'stat_data'); }
  catch(e){ void e; return false; }
}

function readData(): Record<string,any>|null {
  try {
    const s=_.get(readVariables(activeMessageOption),'stat_data');
    if(s&&typeof s==='object'&&!Array.isArray(s)) return s;
  } catch(e){ void e; }
  // 兜底：部分角色卡把 stat_data 存在「聊天」作用域而非楼层。楼层读不到时回退到 chat。
  try {
    const s=_.get(readVariables({type:'chat'}),'stat_data');
    if(s&&typeof s==='object'&&!Array.isArray(s)) return s;
  } catch(e){ void e; }
  return currentData;
}
export function saveData(d:Record<string,any>) {
  const option=activeMessageOption;
  try {
    safeUpdateVariablesWith(v=>{_.set(v,'stat_data',d);return v;},option);
    return;
  } catch(e){ void e; }
  try {
    const mvu = getMvu();
    if(mvu?.getMvuData&&mvu?.replaceMvuData){
      const data=mvu.getMvuData(option);
      _.set(data,'stat_data',d);
      void mvu.replaceMvuData(data,option);
      return;
    }
  } catch(e){ void e; }
}
function refresetH() { currentData=readData(); if(currentData) { syncReviewBaseline(currentData); render(currentData); } else { render({}); } }
// 手动刷新：用户点 th-btn-refresh 触发。
// 比 refresetH 多走一次 collectStatDataChange：若基线落后（如外部变量管理器改了数据），
// 这里补一次审核采集并同步基线；基线已同步时 isEqual 短路，无副作用。
function manualRefresh() {
  const data = (() => { try { return readData(); } catch(e) { void e; return null; } })();
  if (!data) { refresetH(); return; }
  try { collectStatDataChange(data, { snapshot: false, label: 'manualRefresh' }); } catch(e) { void e; }
  refresetH();
}
// 内部状态已被本地修改（保存链路、按钮触发、筛选切换等），直接用 currentData 重新渲染。
// 显式清掉 _renderCache 强制全量重绘，避免在保存链路中再做稳定的 JSON.stringify 比较。
export function renderCurrent() { if(currentData) { clearRenderCache(); render(currentData); } }
// 使用短延迟合并连续变量更新。MVU 可能在一次输出后连续触发多次事件，rAF 级别重绘仍会造成卡顿。
let _renderScheduled = false;
function scheduleRender() {
  if(_renderScheduled) return;
  _renderScheduled = true;
  setTimeout(()=>{
    _renderScheduled = false;
    refresetH();
  },120);
}

const _renderCache = { world: '', user: '', npc: '' };
function clearRenderCache() {
  _renderCache.world = '';
  _renderCache.user = '';
  _renderCache.npc = '';
}
function stableRenderKey(value:any): string {
  try { return JSON.stringify(value); }
  catch(e) { void e; return String(Date.now()); }
}

const IMG_KEY='_th_avatar_images';
const GALLERY_KEY='_th_npc_gallery';
function saveImages() { try { avatarVersion++; clearRenderCache(); safeUpdateVariablesWith(v=>{_.set(v,IMG_KEY,avatarImages); return v;},{type:'chat'}); } catch(e){ void e; } }
// 画廊存储
let galleryImages: Record<string,string[]> = {};
function saveGallery() { try { safeUpdateVariablesWith(v=>{_.set(v,GALLERY_KEY,galleryImages); return v;},{type:'chat'}); } catch(e){ void e; } }
export function getNPCGallery(npcName:string): string[] { return galleryImages[npcName]||[]; }
function addNPCGalleryImage(npcName:string, dataUrl:string) { if(!galleryImages[npcName]) galleryImages[npcName]=[]; galleryImages[npcName].push(dataUrl); saveGallery(); }
export function deleteNPCGalleryImage(npcName:string, idx:number) { if(!galleryImages[npcName]) return; galleryImages[npcName].splice(idx,1); saveGallery(); }

const DOLLAR_KEY = String.fromCharCode(36);
const MACRO_L = String.fromCharCode(123,123);
const MACRO_R = String.fromCharCode(125,125);
const ANGLE_USER_KEY = [60,117,115,101,114,62].map(code=>String.fromCharCode(code)).join('');
export function tavernMacro(name:string): string { return MACRO_L+name+MACRO_R; }
const SK=['世界信息','NPC','_',DOLLAR_KEY];
function isUserPlaceholderKey(key:string): boolean {
  return key===tavernMacro('user')||key===ANGLE_USER_KEY||key==='user';
}
// 主角候选键。要求 d[k]['属性'] 会漏掉「只有物品/技能/衣物、没有属性栏」的主角卡（表现为状态栏空白）。
//   放宽为：有 属性 或 任一公认角色数据栏（拥有物品/拥有技能/当前穿着衣物/状态）即算候选；打分再从候选里挑真主角。
const USER_DATA_FIELDS=['属性','拥有物品','拥有技能','当前穿着衣物','状态'];
function looksLikeCharacter(o:any): boolean {
  return !!o && typeof o==='object' && !Array.isArray(o) && USER_DATA_FIELDS.some(f=>o[f]!=null);
}
function getUserCandidateKeys(d:Record<string,any>): string[] {
  return Object.keys(d).filter(k=>!SK.includes(k)&&!k.startsWith('_')&&!k.startsWith(DOLLAR_KEY)&&looksLikeCharacter(d[k]));
}
// 打分：候选玩家键里「真的装了数据」的分量（物品/技能/衣物条数 + 非零属性数）。
// 背景：MVU 在 message 作用域常会写一个空壳 `{{user}}`（有「属性」但全 0、无物品/技能/衣物）。
// 「取第一个非占位符键」会在「真数据在 {{user}} 下、另有一个空壳非占位键」时选错空壳，
// 表现为「状态栏读不到变量」。故按真实数据量选主角，占位符只作同分时的降序偏好（重命名过的键更可能是真主角）。
function userKeyDataScore(o:any): number {
  if(!o||typeof o!=='object') return -1;
  const cnt=(x:any)=> x==null?0:(Array.isArray(x)?x.length:(typeof x==='object'?Object.keys(x).length:0));
  let attrNonZero=0;
  const attr=o['属性'];
  if(attr&&typeof attr==='object'){ for(const v of Object.values(attr)){ if(v&&v!=='0'&&v!==0) attrNonZero++; } }
  return cnt(o['拥有物品'])*3 + cnt(o['拥有技能'])*3 + cnt(o['当前穿着衣物'])*2 + cnt(o['状态']) + attrNonZero;
}
function getUK(d:Record<string,any>): string|null {
  const keys=getUserCandidateKeys(d);
  if(!keys.length) return null;
  // 选真实数据量最高的候选；同分时优先非占位符键（重命名过的更像真主角），再退回原顺序。
  let best=keys[0], bestScore=userKeyDataScore(d[best]), bestPlaceholder=isUserPlaceholderKey(best);
  for(let i=1;i<keys.length;i++){
    const k=keys[i], s=userKeyDataScore(d[k]), ph=isUserPlaceholderKey(k);
    if(s>bestScore || (s===bestScore && bestPlaceholder && !ph)){ best=k; bestScore=s; bestPlaceholder=ph; }
  }
  return best;
}
export function getUser(d:Record<string,any>): Record<string,any> { const k=getUK(d); return k?d[k] as Record<string,any>:(_.get(d,tavernMacro('user'),{})||{}); }
export function setUser(d:Record<string,any>,ud:Record<string,any>) { const k=getUK(d); if(k)d[k]=ud; else _.set(d,tavernMacro('user'),ud); }
export function getNPCs(d:Record<string,any>) { const n=_.get(d,'NPC',{})||{}; return Object.entries(n).map(([k,v])=>({name:k,info:v as Record<string,any>})); }
export function getNPCInfo(d:Record<string,any>|null, npcName:string): Record<string,any>|null {
  if(!d||!npcName) return null;
  const npcs=_.get(d,'NPC',{})||{};
  const info=npcs[npcName];
  return info&&typeof info==='object'?info as Record<string,any>:null;
}

// NPC排序 — 在场优先，在场内按仙主顺序，不在场内按首字母
function extractXianzhuOrder(identity:string): number {
  const m=identity.match(/第([一二三四五六七八九十百千]+)仙主/);
  if(!m) return Infinity;
  const map:Record<string,number>={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'十一':11,'十二':12,'十三':13,'十四':14,'十五':15,'十六':16,'十七':17,'十八':18,'十九':19,'二十':20};
  return map[m[1]]||Infinity;
}
function sortNPCs(npcs:{name:string;info:Record<string,any>}[]): {name:string;info:Record<string,any>}[] {
  const present=npcs.filter(n=>n.info['是否在场']===true);
  const absent=npcs.filter(n=>n.info['是否在场']!==true);
  // 在场内排序：按仙主顺序，若都没有仙主则按名称首字母
  present.sort((a,b)=>{
    const oa=extractXianzhuOrder(a.info['身份']||'');
    const ob=extractXianzhuOrder(b.info['身份']||'');
    if(oa!==ob) return oa-ob;
    return a.name.localeCompare(b.name,'zh');
  });
  // 不在场内按名称首字母排序
  absent.sort((a,b)=>a.name.localeCompare(b.name,'zh'));
  return [...present,...absent];
}

// 切换NPC在场状态
export function toggleNpcPresence(npcName:string) {
  if(!currentData) return;
  const npcs=_.get(currentData,'NPC',{})||{};
  const npc=npcs[npcName];
  if(!npc) return;
  const current=_.get(npc,'是否在场',false);
  _.set(npc,'是否在场',!current);
  _.set(currentData,'NPC',npcs);
  saveData(currentData);
  // 本地编辑保存后统一采集审核变更
  try { collectStatDataChange(currentData, { snapshot: true, label: 'toggleNpcPresence' }); } catch(e) { void e; }
  renderCurrent();
}

// 衣物「穿着情况/破损状态」循环切换（镜像 toggleNpcPresence）。
// ownerPath = 主角 userKey 或 `NPC.{npcName}`；读当前值 → 切到 enum 下一个 → _.set 回当前穿着衣物.{name}.{field} → saveData → collectStatDataChange → renderCurrent。
const CLOTHING_WEAR_ORDER: readonly string[] = ['穿着', '脱下'];
const CLOTHING_DMG_ORDER: readonly string[] = ['完好无缺', '轻微破损', '中度破损', '严重破坏'];
export function toggleClothingField(ownerPath:string, clothingName:string, field:'穿着情况'|'破损状态', opts?:{skipRender?:boolean}) {
  if(!currentData || !ownerPath || !clothingName) return;
  const mapPath = `${ownerPath}.当前穿着衣物`;
  const clothingMap = _.get(currentData, mapPath, {}) || {};
  const c = clothingMap[clothingName];
  if(!c) return;
  const order = field === '穿着情况' ? CLOTHING_WEAR_ORDER : CLOTHING_DMG_ORDER;
  const current = _.get(c, field, order[0]);
  let idx = order.indexOf(current);
  if(idx < 0) idx = -1;
  const next = order[(idx + 1) % order.length];
  _.set(c, field, next);
  clothingMap[clothingName] = c;
  _.set(currentData, mapPath, clothingMap);
  saveData(currentData);
  try { collectStatDataChange(currentData, { snapshot: true, label: 'toggleClothingField' }); } catch(e) { void e; }
  // 浮窗/modal 内切换传 skipRender，由调用方就地刷新该处 UI，
  // 避免 renderCurrent 重绘整个状态栏导致 hover 浮窗锚点被移除而闪退。
  if(!opts?.skipRender) renderCurrent();
}
function getWorld(d:Record<string,any>) { return _.get(d,'世界信息',{})||{}; }
export function getUN(d:Record<string,any>) { return getUK(d)||'主角'; }
/** 返回玩家数据的实际 key（用于编辑路径构造） */
export function getUserKey(d:Record<string,any>): string { return getUK(d)||tavernMacro('user'); }

// ================================================================
//  世界速览快照（悬浮球 hover 卡用）
//  读实时 stat_data，拼成结构化对象：世界信息 + user 状态 + 在场角色全量字段。
//  Shell.vue 直接 import 调用；纯读，不触发渲染。
// ================================================================
export type SnapStatus = { name: string; effect: string; source: string; duration: string }; // 状态：名称 + 效果 + 来源 + 持续时间（零截断全展开）
export type SnapClothing = { name: string; part: string; wear: string; dmg: string; state: string }; // 衣物：名称 + 部位 + 穿着情况 + 破损状态 + 衣物状态
export type SnapAttr = { name: string; value: number; pct: number; cls: string };             // 属性：名称 + 数值 + 百分比 + 色类（额外键 cls 为空走渐变）
export type SnapMetric = { key: string; label: string; value: number; cls: string };          // 情感值：心动/情欲/兴奋/敏感/羞耻（0-100）
export type SnapCount = { label: string; value: number };                                     // 亲密记录：高潮/被内射次数
export type SnapActor = {
  name: string;
  avatar: string;                                // 头像图片 URL（空=用占位）
  initial: string;                               // 占位首字
  color: string;                                 // 占位底色
  headline: { label: string; value: string }[];  // 头部右侧短字段（身份/生日/位置…紧贴头像不闲置）
  moodTags: string[];                            // 心情浮帖（按 / 、· 拆分，仅 NPC）
  fields: { label: string; value: string }[];    // 下方长文本字段（本能渴望/姿态动作/内心想法/身体状态…靠 CSS 平铺不截断）
  attrs: SnapAttr[];                              // 属性（仅主角，遍历非 0 项）
  metrics: SnapMetric[];                          // 情感值（仅 NPC）
  counts: SnapCount[];                            // 亲密记录（仅 NPC，有值才列）
  status: SnapStatus[];                           // 状态卡片
  clothing: SnapClothing[];                       // 衣物卡片
  galleryCount: number;                           // 画廊图片数（仅 NPC，用于速览卡画廊入口）
  money: number;                                  // 货币.金钱（仅主角，与状态栏 .th-money-text 同口径）
  itemCount: number;                              // 拥有物品条数（仅主角，明细走 hover 浮窗）
  skillCount: number;                             // 拥有技能条数（仅主角，明细走 hover 浮窗）
};
export type WorldSnapshot = {
  world: { label: string; value: string }[];        // 世界信息（日期/时间/天气/区域）
  user: SnapActor;                                   // 主角状态
  present: SnapActor[];                              // 在场角色
  hasData: boolean;
};
// 速览卡文本字段（顺序即展示顺序）。keys=多个别名，取第一个有值的（应对角色卡字段命名差异）。
// 注意：状态/当前穿着衣物 不在此列——它们是 map 结构，单独走 extractStatus/extractClothing 渲染成卡片。
// headline=短字段（贴头像右侧，不闲置留白）；body=长文本（下方整行平铺，零截断）。
// NPC 心情单独走 moodTags（浮帖），不进 headline/body；不含「基础外貌」（用户指定不展示）。
const SNAP_NPC_HEADLINE: { keys: string[]; label: string }[] = [
  { keys: ['身份'], label: '身份' },
  { keys: ['生日日期', '生日', '生辰', '出生日期'], label: '生日' },
];
const SNAP_NPC_BODY: { keys: string[]; label: string }[] = [
  { keys: ['当前本能渴望', '本能渴望'], label: '本能渴望' },
  { keys: ['姿态动作'], label: '姿态动作' },
  { keys: ['内心想法'], label: '内心想法' },
  { keys: ['身体状态'], label: '身体状态' },
];
// NPC 心情键：真实字段名「当前情绪状态与心情」（旧别名命不中，放首位）。
const SNAP_MOOD_KEYS = ['当前情绪状态与心情', '心情', '当前心情', '情绪'];
// 主角：无情绪字段（schema 未定义）。位置=短字段贴头像；姿态动作/身体状态全文平铺。
const SNAP_USER_HEADLINE: { keys: string[]; label: string }[] = [
  { keys: ['位置'], label: '位置' },
];
const SNAP_USER_BODY: { keys: string[]; label: string }[] = [
  { keys: ['姿态动作'], label: '姿态动作' },
  { keys: ['身体状态'], label: '身体状态' },
];
function snapVal(v: any): string {
  if (v == null) return '';
  if (typeof v === 'object') { const e = v['效果'] ?? v['名称'] ?? ''; return String(e || JSON.stringify(v)); }
  return String(v);
}
// 从 info 里按别名取第一个有值的文本字段。
function pickVal(info: Record<string, any>, keys: string[]): string {
  for (const k of keys) { const v = snapVal(info[k]).trim(); if (v) return v; }
  return '';
}
// 「状态」是 { 名称: {效果,来源,持续时间} } 的 map — 拆成 [{name, effect, source, duration}]，全字段供全展开（不截断）。
function extractStatus(info: Record<string, any>): SnapStatus[] {
  const st = info['状态'];
  if (!st || typeof st !== 'object') return [];
  return Object.entries(st)
    .map(([name, v]) => {
      const o = (v && typeof v === 'object') ? v as any : null;
      return {
        name,
        effect: o ? String(o['效果'] ?? '') : String(v ?? ''),
        source: o ? String(o['来源'] ?? '') : '',
        duration: o ? String(o['持续时间'] ?? '') : '',
      };
    })
    .filter(s => s.name);
}
// 「当前穿着衣物」是 { 名称: {穿着部位,穿着情况,破损状态,衣物状态,…} } 的 map — 拆成 [{name, part, wear, dmg, state}]。
// 衣物状态是短文本（湿透/凌乱/整洁…），进快照直接上卡；外观详情/评价 是长文，仍留给 hover 浮窗现读。
function extractClothing(info: Record<string, any>): SnapClothing[] {
  const cl = info['当前穿着衣物'];
  if (!cl || typeof cl !== 'object') return [];
  return Object.entries(cl)
    .map(([name, v]) => ({
      name,
      part: String((v as any)?.['穿着部位'] || ''),
      wear: String((v as any)?.['穿着情况'] || ''),
      dmg: String((v as any)?.['破损状态'] || ''),
      state: String((v as any)?.['衣物状态'] || ''),
    }))
    .filter(c => c.name);
}
// 「属性」遍历（与 buildAttrBarHtml 同口径）：先 ATTR_KEYS 固定 10 项，再额外自定义键；非 0 才列，pct/cls 复用现成常量。
function extractAttrs(info: Record<string, any>): SnapAttr[] {
  const attrs = _.get(info, '属性', {}) || {};
  const out: SnapAttr[] = [];
  for (const k of ATTR_KEYS) {
    const v = clamp(Number(attrs[k]) || 0, 0, ATTR_MAX);
    if (v > 0) out.push({ name: k, value: v, pct: attrPct(v), cls: ATTR_CLS[k] || 'attr-type-default' });
  }
  let extraIdx = 0;
  for (const [k, raw] of Object.entries(attrs)) {
    if ((ATTR_KEYS as readonly string[]).includes(k)) continue;
    const v = clamp(Number(raw) || 0, 0, ATTR_MAX);
    if (v > 0) out.push({ name: k, value: v, pct: attrPct(v), cls: '' }); // cls 空 → 渲染侧走 pickExtraAttrColor
    extraIdx++;
  }
  void extraIdx;
  // 速览卡按值降序：一眼看出擅长什么（渲染侧给前三加冕）。
  out.sort((a, b) => b.value - a.value);
  return out;
}
// NPC 情感值（与 buildNPCCard 同口径）：NPC_METRICS 五项，0-100。
function extractMetrics(info: Record<string, any>): SnapMetric[] {
  return NPC_METRICS.map(m => ({
    key: m.key,
    label: m.key.replace('值', ''),
    value: clamp(Number(info[m.key]) || 0, 0, 100),
    cls: m.cls,
  }));
}
// NPC 亲密记录（与 buildNPCCard 同口径）：高潮次数/被内射次数，有值才列。
function extractCounts(info: Record<string, any>): SnapCount[] {
  return NPC_COUNTS
    .map(c => ({ label: c.key, value: Number(info[c.key]) || 0 }))
    .filter(c => c.value > 0);
}
// 额外属性色（cls 为空的自定义属性用）：Vue 侧按 index 调用，复用 config 现成调色板。
export function snapExtraAttrColor(idx: number): string { return pickExtraAttrColor(idx); }
function buildActorFields(info: Record<string, any>, defs: { keys: string[]; label: string }[]): { label: string; value: string }[] {
  return defs.map(f => ({ label: f.label, value: pickVal(info, f.keys) })).filter(f => f.value);
}
// 心情浮帖：取心情字段后按 / 、· 拆分（与 npc-detail 的 buildMoodTags 同口径），去空。
function extractMoodTags(info: Record<string, any>): string[] {
  const mood = pickVal(info, SNAP_MOOD_KEYS);
  if (!mood) return [];
  return mood.split(/[/、·]+/).map(t => t.trim()).filter(t => t.length > 0);
}
function emptyActor(): SnapActor {
  return { name: '', avatar: '', initial: '', color: '', headline: [], moodTags: [], fields: [], attrs: [], metrics: [], counts: [], status: [], clothing: [], galleryCount: 0, money: 0, itemCount: 0, skillCount: 0 };
}
export function getWorldSnapshot(): WorldSnapshot {
  const empty: WorldSnapshot = { world: [], user: emptyActor(), present: [], hasData: false };
  let data: Record<string,any> | null = null;
  try { data = readData(); } catch (e) { void e; data = null; }
  if (!data) return empty;
  const imgs = getAvatarImages();
  const w = getWorld(data);
  const worldRows: { label: string; value: string }[] = [];
  const pushW = (label: string, key: string) => { const v = snapVal(w[key]).trim(); if (v) worldRows.push({ label, value: v }); };
  pushW('日期', '日期'); pushW('时间', '时间'); pushW('天气', '天气'); pushW('所处区域', '当前所处区域名称'); pushW('具体位置', '具体位置');
  // 主角（头像 key='user'，属性遍历；无情感/亲密）
  const user = getUser(data) || {};
  const uname = getUN(data);
  const uActor: SnapActor = {
    name: uname,
    avatar: imgs['user'] || '',
    initial: (uname || '?').charAt(0),
    color: getAvatarColor(uname || 'user', 0),
    headline: buildActorFields(user, SNAP_USER_HEADLINE),
    moodTags: [],
    fields: buildActorFields(user, SNAP_USER_BODY),
    attrs: extractAttrs(user),
    metrics: [],
    counts: [],
    status: extractStatus(user),
    clothing: extractClothing(user),
    galleryCount: 0,
    // 金钱/背包/技能：与 renderUserPanel / renderMiniActions 同口径（明细不进快照，靠 hover 浮窗现读）
    money: Number(_.get(user, '货币.金钱', 0)) || 0,
    itemCount: Object.keys(_.get(user, '拥有物品', {}) || {}).length,
    skillCount: Object.keys(_.get(user, '拥有技能', {}) || {}).length,
  };
  // 在场角色（是否在场===true），沿用主状态栏排序；头像 key='npc:'+name，情感/亲密复用现成常量口径
  const present: SnapActor[] = sortNPCs(getNPCs(data)).filter(n => n.info['是否在场'] === true).map((n, idx) => ({
    name: n.name,
    avatar: imgs['npc:' + n.name] || '',
    initial: (n.name || '?').charAt(0),
    color: getAvatarColor(n.name, idx),
    headline: buildActorFields(n.info, SNAP_NPC_HEADLINE),
    moodTags: extractMoodTags(n.info),
    fields: buildActorFields(n.info, SNAP_NPC_BODY),
    attrs: [],
    metrics: extractMetrics(n.info),
    counts: extractCounts(n.info),
    status: extractStatus(n.info),
    clothing: extractClothing(n.info),
    galleryCount: getNPCGallery(n.name).length,
    money: 0, itemCount: 0, skillCount: 0,   // 金钱/背包/技能只给主角
  }));
  const hasData = worldRows.length > 0 || uActor.headline.length > 0 || uActor.fields.length > 0 || uActor.status.length > 0 || uActor.clothing.length > 0 || present.length > 0;
  return { world: worldRows, user: uActor, present, hasData };
}
// 从速览卡点角色名 → 打开该 NPC 详情（复用状态栏现成弹窗）。
export function openNpcFromSnapshot(name: string): void {
  try { openNPCDetail(name); } catch (e) { void e; }
}
// 从速览卡打开该 NPC 画廊（复用状态栏现成画廊弹窗）。
export function openGalleryFromSnapshot(name: string): void {
  try { openGalleryModal(name); } catch (e) { void e; }
}
// 速览卡主角「背包 / 技能」悬停明细：复用状态栏 renderMiniActions 的同两个浮窗，现读变量不进快照。
export function snapUserBagHover(anchor: HTMLElement, kind: 'item' | 'skill'): void {
  try {
    const data = readData(); if (!data) return;
    const u = getUser(data) || {};
    if (kind === 'item') showItemsHoverTip(anchor, _.get(u, '拥有物品', {}) || {}, '背包');
    else showSkillsHoverTip(anchor, _.get(u, '拥有技能', {}) || {}, '技能');
  } catch (e) { void e; }
}
export function snapHoverTipHide(): void { try { hideHoverTip(); } catch (e) { void e; } }
// 速览卡衣物卡片悬停明细：复用状态栏 showHoverTip('clothing') 那一份浮窗。
// 外观详情/衣物状态/评价 是长文，不进快照——悬停时按 owner 现读 stat_data（npcName 空串=主角）。
export function snapClothingHover(anchor: HTMLElement, npcName: string, clothingName: string): void {
  try {
    const data = readData(); if (!data || !clothingName) return;
    const info = npcName ? getNPCInfo(data, npcName) : getUser(data);
    const c = _.get(info || {}, ['当前穿着衣物', clothingName], null) as Record<string, any> | null;
    if (!c) return;
    showHoverTip(anchor, 'clothing', {
      name: clothingName,
      part: String(c['穿着部位'] || ''),
      state: String(c['衣物状态'] || ''),
      detail: String(c['外观详情'] || ''),
      wear: String(c['穿着情况'] || '穿着'),
      dmg: String(c['破损状态'] || '完好无缺'),
      eval: String(c['评价'] || ''),
    });
  } catch (e) { void e; }
}
// 速览卡点立绘 → 复用现成大图查看器（不再跳详情，详情走旁边的按钮）。
export function snapViewImage(url: string): void { if (url) { try { showImage(url); } catch (e) { void e; } } }

// ================================================================
//  渲染总入口
// ================================================================
function render(data: Record<string,any>) {
  // 一次性取出三个顶层子结构，避免 stableRenderKey / 子渲染函数重复调用 getWorld / getUser
  const world = getWorld(data);
  const user = getUser(data);
  const uname = getUN(data);

  const worldKey = stableRenderKey({ data:world, edit:isEditMode });
  if(worldKey!==_renderCache.world){ _renderCache.world=worldKey; renderWorldInfo(data); }

  const userKey = stableRenderKey({ data:user, uname, area:world['当前所处区域名称'], edit:isEditMode, avatarVersion });
  if(userKey!==_renderCache.user){ _renderCache.user=userKey; renderUserPanel(data); }

  const npcKey = stableRenderKey({ data:_.get(data,'NPC',{}), filter:npcFilter, search:npcSearchText, avatarVersion });
  if(npcKey!==_renderCache.npc){ _renderCache.npc=npcKey; renderNPCGrid(data); }

  // 数值条数字 CountUp 入口动画（gsap 0→目标值 滚动 + 已有 width CSS transition 配合）
  // 限制：jQuery 每次 render 重建元素，无 from value，每次 render 数字都从 0 涨——视觉是"看到数据变化"，可接受
  countUpNumericValues();
}

// 找所有数值类数字元素（.th-attr-val / .th-npc-metric-val），gsap 从 0 滚到目标值
const _countedElements = new WeakSet<HTMLElement>();
function countUpNumericValues() {
  // 只对当前可见的数字做（按父元素可见性）
  const w = gw();
  if (!w) return;
  const sels = ['.th-attr-val', '.th-npc-metric-val', '.th-wheel-val-cascade'];
  for (const sel of sels) {
    qsa<HTMLElement>(sel).forEach(el => {
      if (_countedElements.has(el)) return;
      // 跳过编辑模式（input 元素，不是 span）
      if (el.tagName === 'INPUT') return;
      const txt = el.textContent || '';
      const target = parseInt(txt.trim(), 10);
      if (!Number.isFinite(target) || target === 0) {
        // 值为 0 或 NaN：不滚动，直接显示
        _countedElements.add(el);
        return;
      }
      const obj = { val: 0 };
      el.textContent = '0'; // 起点
      _countedElements.add(el);
      gsap.to(obj, {
        val: target,
        duration: 0.8,
        ease: 'power2.out',
        onUpdate() {
          el.textContent = String(Math.round(obj.val));
        },
      });
    });
  }
}

function renderWorldInfo(data:Record<string,any>) {
  const w=getWorld(data);
  const date=esc(w['日期']||''); const time=esc(w['时间']||''); const weather=esc(w['天气']||'');
  let timeIcon='fa-solid fa-clock';
  const hour=parseInt(time.split(':')[0]);
  if(!isNaN(hour)){
    if(hour>=6&&hour<8) timeIcon='fa-solid fa-cloud-sun';
    else if(hour>=8&&hour<18) timeIcon='fa-solid fa-sun';
    else if(hour>=18&&hour<20) timeIcon='fa-solid fa-cloud-moon';
    else timeIcon='fa-solid fa-moon';
  }
  // 仅更新日期/时间/天气，不覆盖NPC筛选按钮
  setH('.th-world-date', `<i class="fa-solid fa-calendar-days"></i> ${isEditMode?editableInput(w['日期']||'','世界信息.日期'):esc(date)}`);
  setH('.th-world-time', `<i class="${timeIcon}"></i> ${isEditMode?editableInput(w['时间']||'','世界信息.时间'):esc(time)}`);
  setH('.th-world-weather', `<i class="fa-solid fa-cloud-sun"></i> ${isEditMode?editableInput(w['天气']||'','世界信息.天气'):esc(weather)}`);
}

// ================================================================
//  User 面板
// ================================================================
function renderUserPanel(data:Record<string,any>) {
  const u=getUser(data); if(!u) return;
  const ukey=getUserKey(data);
  const world=getWorld(data);
  const locHtml = isEditMode
    ? `${esc(world['当前所处区域名称']||'未知区域')} · ${editableInput(u['位置']||'未知地点',`${ukey}.位置`)}`
    : `${esc(world['当前所处区域名称']||'未知区域')} · ${esc(u['位置']||'未知地点')}`;
  setH('.th-user-hero-info .th-location-text', `<i class="fa-solid fa-map-pin"></i> ${locHtml}`);
  setH('.th-money-text', isEditMode ? editableInput(`${_.get(u,'货币.金钱',0)}`,`${ukey}.货币.金钱`,'number') : esc(`${_.get(u,'货币.金钱',0)}`));
  // 迷你背包+技能按钮替换好感总览
  renderMiniActions(u);
  renderUserAvatar();
  renderUserPB(u, ukey);
  renderStatusBlocks(u, ukey);
  renderClothingBlocks(u, ukey);
}

function renderUserAvatar() {
  const img=qs<HTMLImageElement>('.th-user-hero .th-avatar-img');
  const ph=qs<HTMLElement>('.th-user-hero .th-avatar-placeholder');
  const btn=qs<HTMLElement>('.th-avatar-btns');
  const url=avatarImages['user']||'';
  if(img&&url){ img.setAttribute('src',url); img.style.display='block'; if(ph)ph.style.display='none'; if(btn)btn.style.display='flex'; }
  else { if(ph)ph.style.display=''; if(img){img.style.display='none';img.removeAttribute('src');} if(btn)btn.style.display='none'; }
}

// ================================================================
//  迷你背包+技能按钮（替换好感总览）
// ================================================================
function renderMiniActions(user:Record<string,any>) {
  const el=qs('.th-mini-actions'); if(!el) return;
  const items=_.get(user,'拥有物品',{})||{};
  const skills=_.get(user,'拥有技能',{})||{};
  const iCount=Object.keys(items).length;
  const sCount=Object.keys(skills).length;
  el.innerHTML=`
    <button class="th-mini-btn th-mini-bag"><i class="fa-solid fa-box-open"></i> 背包 <span class="th-mini-count">${iCount}</span></button>
    <button class="th-mini-btn th-mini-skill"><i class="fa-solid fa-scroll"></i> 技能 <span class="th-mini-count">${sCount}</span></button>
  `;
  qs('.th-mini-bag')?.addEventListener('click',(e:Event)=>{ e.stopPropagation(); if(currentData) openUserBag(currentData); });
  qs('.th-mini-skill')?.addEventListener('click',(e:Event)=>{ e.stopPropagation(); if(currentData) openUserSkill(currentData); });
  // 悬停显示全部物品/技能详情（与NPC一致）
  qs('.th-mini-bag')?.addEventListener('mouseenter',(e:Event)=>{
    showItemsHoverTip((e.target as HTMLElement).closest('.th-mini-bag') as HTMLElement, items, '背包');
  });
  qs('.th-mini-bag')?.addEventListener('mouseleave',()=>{ hideHoverTip(); });
  qs('.th-mini-skill')?.addEventListener('mouseenter',(e:Event)=>{
    showSkillsHoverTip((e.target as HTMLElement).closest('.th-mini-skill') as HTMLElement, skills, '技能');
  });
  qs('.th-mini-skill')?.addEventListener('mouseleave',()=>{ hideHoverTip(); });
}

// ================================================================
//  User 姿态+身体 hover显示+click弹详情
// ================================================================
function renderUserPB(user:Record<string,any>, ukey:string) {
  const posture=user['姿态动作']||'暂无动作';
  const bodyState=user['身体状态']||'暂无描述';
  // 给按钮绑上 data 属性供 hover/click 使用
  const pb=qs('.th-pb-posture'); if(pb) { pb.setAttribute('data-pb-text',escAttr(posture)); pb.setAttribute('data-pb-path',`${ukey}.姿态动作`); }
  const bb=qs('.th-pb-body'); if(bb) { bb.setAttribute('data-pb-text',escAttr(bodyState)); bb.setAttribute('data-pb-path',`${ukey}.身体状态`); }
}

// ================================================================
//  状态方块（hover浮窗 + click弹详情）
// ================================================================
function renderStatusBlocks(user:Record<string,any>, ukey:string) {
  const c=qs('.th-status-blocks'); if(!c) return;
  const st=_.get(user,'状态',{})||{}; const entries=Object.entries(st);
  // 计数选专属类：面板里现在有 4 个 .th-section-count（状态/穿着/在场/名册），qs 取首个会串
  setT('.th-status-count',entries.length?`${entries.length}`:'');
  const addBlock=`<span class="th-block th-block-add" data-add-trigger="status" data-add-base="${escAttr(ukey)}.状态" data-add-owner="${escAttr(getUN(currentData||{}))}"><i class="fa-solid fa-plus"></i> 新增状态</span>`;
  c.innerHTML=(entries.length?entries.map(([n,info]:[string,any])=>{
    const eff=info?.['效果']||''; const src=info?.['来源']||''; const dur=info?.['持续时间']||'';
    const dotCls=getDotCls(eff);
    return `<span class="th-block th-block-status" data-btype="status" data-bname="${escAttr(n)}" data-beffect="${escAttr(eff)}" data-bsource="${escAttr(src)}" data-bduration="${escAttr(dur)}" data-bpath="${escAttr(ukey)}.状态.${escAttr(n)}"><span class="th-tag-dot ${dotCls}"></span> ${esc(n)}</span>`;
  }).join(''):'<span class="th-empty" style="padding:8px 0">暂无状态</span>')+addBlock;
  bindBlockHoverAndClick(c, 'status');
}
export function bindBlockHoverAndClick(container:HTMLElement, type:string) {
  if (container.dataset.blockEventsBound === 'true') return;
  container.dataset.blockEventsBound = 'true';
  const sel = type==='status' ? '.th-block-status' : '.th-block-clothing';

  // 使用 mouseover/mouseout 委托，避免在方块内部子元素间移动时误触发 mouseleave 导致浮窗闪关
  container.addEventListener('mouseover', (e:MouseEvent) => {
    const el = enteredWithin<HTMLElement>(container,e,sel);
    if (!el) return;
    if(type==='status'){
      showHoverTip(el,'status',{
        name:el.getAttribute('data-bname')||'',
        effect:el.getAttribute('data-beffect')||'',
        source:el.getAttribute('data-bsource')||'',
        duration:el.getAttribute('data-bduration')||'',
      });
    } else {
      showHoverTip(el,'clothing',{
        name:el.getAttribute('data-bname')||'',
        part:el.getAttribute('data-bpart')||'',
        state:el.getAttribute('data-bstate')||'',
        detail:el.getAttribute('data-bdetail')||'',
        wear:el.getAttribute('data-bwear')||'穿着',
        dmg:el.getAttribute('data-bdmg')||'完好无缺',
        eval:el.getAttribute('data-beval')||'',
      });
    }
  });

  container.addEventListener('mouseout', (e:MouseEvent) => {
    if (leftWithin(container,e,sel)) hideHoverTip();
  });

  container.addEventListener('click', (e:Event) => {
    const el = (e.target as HTMLElement).closest(sel) as HTMLElement;
    if (!el || !container.contains(el)) return;
    e.stopPropagation();
    // 衣物 chip 切换按钮点击 — 拦截，不走详情弹窗（data 属性委托）
    if(type==='clothing'){
      const chip=(e.target as HTMLElement).closest('[data-clothing-toggle]') as HTMLElement|null;
      if(chip){
        e.stopPropagation();
        const fld=chip.getAttribute('data-clothing-toggle') as '穿着情况'|'破损状态';
        const owner=chip.getAttribute('data-clothing-owner')||'';
        const cname=chip.getAttribute('data-clothing-name')||'';
        toggleClothingField(owner,cname,fld);
        return;
      }
    }
    const path=el.getAttribute('data-bpath')||'';
    if(type==='status'){
      const n=el.getAttribute('data-bname')||'';
      const eff=el.getAttribute('data-beffect')||'';
      const src=el.getAttribute('data-bsource')||'';
      const dur=el.getAttribute('data-bduration')||'';
      openStatusDetail(n,eff,src,dur,path);
    } else {
      const n=el.getAttribute('data-bname')||'';
      const part=el.getAttribute('data-bpart')||'';
      const state=el.getAttribute('data-bstate')||'';
      const detail=el.getAttribute('data-bdetail')||'';
      const wear=el.getAttribute('data-bwear')||'穿着';
      const dmg=el.getAttribute('data-bdmg')||'完好无缺';
      const evalTxt=el.getAttribute('data-beval')||'';
      openClothingDetailModal(n,part,state,detail,path,wear,dmg,evalTxt);
    }
  });
}

// ================================================================
//  穿着方块（hover浮窗 + click弹详情）
// ================================================================
function renderClothingBlocks(user:Record<string,any>, ukey:string) {
  const c=qs('.th-clothing-blocks'); if(!c) return;
  const cl=_.get(user,'当前穿着衣物',{})||{}; const entries=Object.entries(cl);
  setT('.th-cloth-count',entries.length?`${entries.length}`:'');
  const addBlock=`<span class="th-block th-block-add" data-add-trigger="clothing" data-add-base="${escAttr(ukey)}.当前穿着衣物" data-add-owner="${escAttr(getUN(currentData||{}))}"><i class="fa-solid fa-plus"></i> 新增衣物</span>`;
  c.innerHTML=(entries.length?entries.map(([n,info]:[string,any])=>{
    const part=info?.['穿着部位']||''; const state=info?.['衣物状态']||'';
    const detail=info?.['外观详情']||'';
    const wear=info?.['穿着情况']||'穿着';
    const dmg=info?.['破损状态']||'完好无缺';
    const evalTxt=info?.['评价']||'';
    const dotCls=getDotCls(state);
    const offCls = wear==='脱下' ? ' is-off' : '';
    const dmgIdx = Math.max(0, CLOTHING_DMG_ORDER.indexOf(dmg)); // 0..3
    // 两行布局——第一行 图标+名称+部位，第二行 穿着/破损 chip+状态点（紧凑不撑开）
    const wearChip=`<span class="th-clothing-chip th-clothing-chip-wear${wear==='脱下'?' is-off':''}" data-clothing-toggle="穿着情况" data-clothing-owner="${escAttr(ukey)}" data-clothing-name="${escAttr(n)}" title="点击切换穿着情况">${esc(wear)}</span>`;
    const dmgChip=`<span class="th-clothing-chip th-clothing-chip-dmg dmg-${dmgIdx}" data-clothing-toggle="破损状态" data-clothing-owner="${escAttr(ukey)}" data-clothing-name="${escAttr(n)}" title="点击切换破损状态">${esc(dmg)}</span>`;
    const head=`<span class="th-clothing-block-head"><i class="fa-solid fa-vest"></i><span class="th-clothing-block-name">${esc(n)}</span>${part?`<span class="th-clothing-block-part">${esc(part)}</span>`:''}</span>`;
    const foot=`<span class="th-clothing-block-foot">${wearChip}${dmgChip}<span class="th-tag-dot ${dotCls}"></span></span>`;
    return `<span class="th-block th-block-clothing${offCls}" data-btype="clothing" data-bname="${escAttr(n)}" data-bpart="${escAttr(part)}" data-bstate="${escAttr(state)}" data-bdetail="${escAttr(detail)}" data-bwear="${escAttr(wear)}" data-bdmg="${escAttr(dmg)}" data-beval="${escAttr(evalTxt)}" data-bpath="${escAttr(ukey)}.当前穿着衣物.${escAttr(n)}">${head}${foot}</span>`;
  }).join(''):'<span class="th-empty" style="padding:8px 0">暂无穿着</span>')+addBlock;
  bindBlockHoverAndClick(c, 'clothing');
}

// ================================================================
//  NPC 卡片
// ================================================================
// 舞台（在场，大立绘卡）+ 名册（离场，紧凑一行）分层渲染。
// 顶栏 npcFilter/搜索仍是唯一过滤源：present/absent 只是隐掉对应分区，不改数据流。
function renderNPCGrid(data:Record<string,any>) {
  const c=qs('.th-npc-grid'); if(!c) return;
  const roster=qs('.th-roster-list');
  const stageSec=qs<HTMLElement>('.th-stage-sec');
  const rosterSec=qs<HTMLElement>('.th-roster-sec');
  const allNpcs=getNPCs(data);
  // 搜索（姓名 + 身份），大小写不敏感
  const q=npcSearchText.trim().toLowerCase();
  let npcs=allNpcs;
  if(q){
    npcs=npcs.filter(n=>{
      const name=(n.name||'').toLowerCase();
      const identity=String(n.info['身份']||'').toLowerCase();
      return name.includes(q) || identity.includes(q);
    });
  }
  const present=sortNPCs(npcs.filter(n=>n.info['是否在场']===true));
  const absent=sortNPCs(npcs.filter(n=>n.info['是否在场']!==true));
  // 顶栏在场/离场过滤 → 只显对应分区
  const showStage=npcFilter!=='absent';
  const showRoster=npcFilter!=='present';
  if(stageSec) stageSec.style.display=showStage?'':'none';
  if(rosterSec) rosterSec.style.display=showRoster?'':'none';
  setT('.th-stage-count',present.length?`${present.length}`:'');
  setT('.th-roster-count',absent.length?`${absent.length}`:'');

  const total=(showStage?present.length:0)+(showRoster?absent.length:0);
  if(!total){
    // 区分"无数据" vs "无匹配"两种空状态
    const hasFilter=npcFilter!=='all' || !!q;
    if(stageSec) stageSec.style.display='';
    if(rosterSec) rosterSec.style.display='none';
    c.innerHTML=hasFilter
      ?'<div class="th-npc-no-match"><i class="fa-solid fa-magnifying-glass"></i> 无匹配的 NPC</div>'
      :'<span class="th-empty">暂无 NPC</span>';
    if(roster) roster.innerHTML='';
    return;
  }
  c.innerHTML=present.length
    ?present.map((npc,idx)=>buildNPCCard(npc,idx)).join('')
    :'<div class="th-npc-no-match"><i class="fa-solid fa-masks-theater"></i> 当前无人在场</div>';
  if(roster){
    // 名册两种渲染：'row' 极简一行 / 'card' 与在场完全相同的立绘大卡（复用 buildNPCCard，
    // 卡内 presence 徽章会自己显示"离场"）。卡片态给容器加 .is-card 走网格布局。
    const asCard=rosterMode==='card';
    roster.classList.toggle('is-card',asCard);
    roster.innerHTML=absent.length
      ?absent.map((npc,idx)=>asCard?buildNPCCard(npc,idx):buildRosterRow(npc,idx)).join('')
      :'<div class="th-roster-empty">全员在场 ~</div>';
    // 卡片态跟随顶栏列数切换（列数写在 .th-npc-grid 的 inline style 上，这里同步一份）
    if(asCard){
      const cols=qs('.th-btn-cols-switcher')?.getAttribute('data-cols')||'2';
      roster.style.gridTemplateColumns=`repeat(${cols}, 1fr)`;
    } else {
      roster.style.gridTemplateColumns='';
    }
    bindNPCGridEvents(roster);
  }
  bindNPCGridEvents(c);
}

export function getCurrentFilterTag(): string | null { return currentFilterTag; }
export function setCurrentFilterTag(v: string | null): void { currentFilterTag = v; }

// ==================== 标签筛选与桶分组 ====================
let currentFilterTag: string | null = null; // null = 显示全部，'' = 未分类，'tagName' = 指定标签
let currentlyCollapsed: Record<string, boolean> = {}; // 缓存当前展开/折叠状态，减少 localStorage 读写
export function setCurrentlyCollapsed(v: Record<string, boolean>): void { currentlyCollapsed = v; }
export function getCurrentlyCollapsed(): Record<string, boolean> { return currentlyCollapsed; }

// ==================== 排序 + 最近 ====================
export let showRecentOnly: Record<ManagedKind, boolean> = {} as any; // "最近10张"模式开关
export let showFavOnly: Record<ManagedKind, boolean> = {} as any; // "只看收藏"模式开关

// 衣物列表弹窗
export function openClothingListModal(npcName:string, clothing:Record<string,any>) {
  const entries=Object.entries(clothing);
  if(!entries.length){ openModal(esc(npcName)+' · 衣物','<div class="th-empty"><i class="fa-solid fa-vest"></i> 暂无穿着</div>'); return; }
  const ownerPath=`NPC.${npcName}`;
  // 每件衣物独立 .th-fold-item（trigger + 紧邻 .th-fold-detail 兄弟），
  // 与 npc-detail 衣物方块结构一致，满足 bindClothingFoldDown「nextElementSibling 须为 .th-fold-detail」。
  // 含穿着情况/破损状态 chip（点击切换）+ 两行布局 + 评价。
  let h='<div class="th-fold-list">';
  for(const[cn,ci] of entries){
    const c=ci as any;
    const state=c?.['衣物状态']||'';
    const wear=c?.['穿着情况']||'穿着';
    const dmg=c?.['破损状态']||'完好无缺';
    const evalTxt=c?.['评价']||'';
    const dot=getDotCls(state);
    const offCls = wear==='脱下' ? ' is-off' : '';
    const dmgIdx = Math.max(0, CLOTHING_DMG_ORDER.indexOf(dmg));
    const wearChip=`<span class="th-clothing-chip th-clothing-chip-wear${wear==='脱下'?' is-off':''}" data-clothing-toggle="穿着情况" data-clothing-owner="${escAttr(ownerPath)}" data-clothing-name="${escAttr(cn)}" title="点击切换穿着情况">${esc(wear)}</span>`;
    const dmgChip=`<span class="th-clothing-chip th-clothing-chip-dmg dmg-${dmgIdx}" data-clothing-toggle="破损状态" data-clothing-owner="${escAttr(ownerPath)}" data-clothing-name="${escAttr(cn)}" title="点击切换破损状态">${esc(dmg)}</span>`;
    const head=`<span class="th-clothing-block-head"><i class="fa-solid fa-vest"></i><span class="th-clothing-block-name">${esc(cn)}</span>${c?.['穿着部位']?`<span class="th-clothing-block-part">${esc(c?.['穿着部位'])}</span>`:''}</span>`;
    const foot=`<span class="th-clothing-block-foot">${wearChip}${dmgChip}<span class="th-tag-dot ${dot}"></span><span class="th-fold-arrow" style="margin-left:auto;font-size:10px"><i class="fa-solid fa-chevron-down"></i></span></span>`;
    h+=`<div class="th-fold-item">`;
    h+=`<span class="th-block th-block-clothing th-fold-trigger${offCls}" data-btype="clothing" data-bname="${escAttr(cn)}" data-bpart="${escAttr(c?.['穿着部位']||'')}" data-bstate="${escAttr(state)}" data-bdetail="${escAttr(c?.['外观详情']||'')}" data-bwear="${escAttr(wear)}" data-bdmg="${escAttr(dmg)}" data-beval="${escAttr(evalTxt)}" data-bpath="${escAttr(ownerPath)}.当前穿着衣物.${escAttr(cn)}">${head}${foot}</span>`;
    h+=`<div class="th-fold-detail" style="display:none"></div>`;
    h+=`</div>`;
  }
  h+=`</div>`;
  openModal(`<i class="fa-solid fa-vest"></i> `+esc(npcName)+' · 当前穿着',h);
  setTimeout(()=>{
    bindClothingFoldDown(npcName);
  },40);
}

// ================================================================
//  弹窗系统 — 二级弹窗支持堆叠
// ================================================================
export function openModal(t:string,b:string){ hideHoverTipNow(); hideMetricWheel(); setH('.th-modal-title',t); setH('.th-modal-body',b); const o=qs('.th-modal-overlay'); if(o)o.style.display='flex'; }
export function closeModal(){ const o=qs('.th-modal-overlay'); if(o)o.style.display='none'; }

// 二级弹窗堆栈：解决嵌套 modal 关闭后父级丢失。
// 项目事件绑在 modal body 子元素上（非容器委托），innerHTML 快照恢复会丢事件；
// 故采用 revive 回调：每个面板打开时登记自己的重渲染函数，closeModal2 弹栈时调父级 revive() 原地重渲染+重绑。
// - revive：本面板的重渲染函数（供子级关闭后恢复本面板用）。
// - replace：瞬态 modal（进度/预览/注入）不入栈，覆盖当前；X 关=中止（同旧行为）。
// - reset：显式回到基线面板时清栈（如「返回」主面板）。
type Modal2StackEntry = { revive?: () => void };
let _modal2Stack: Modal2StackEntry[] = [];
let _modal2CurrentRevive: (() => void) | undefined;
let _modal2Restoring = false;
function _modal2OverlayVisible(): boolean {
  const o = qs2('.th-modal-overlay-2'); return !!o && o.style.display !== 'none';
}
export function openModal2(t:string,b:string,opts?:{maxWidth?:string;revive?:()=>void;replace?:boolean;reset?:boolean;phone?:boolean}){
  hideHoverTipNow();
  const overlay=qs2('.th-modal-overlay-2'); if(!overlay) return;
  if (_modal2Restoring) {
    // revive 恢复路径：原地替换当前层，不动栈（保留祖父级）。
  } else if (opts?.reset) {
    _modal2Stack = [];
  } else if (opts?.replace) {
    // 瞬态 modal：覆盖当前，不入栈。
  } else if (_modal2OverlayVisible()) {
    _modal2Stack.push({ revive: _modal2CurrentRevive });
  } else {
    _modal2Stack = []; // 从隐藏态打开 = 新基线
  }
  const titleEl=qs2('.th-modal-title-2'); if(titleEl) titleEl.innerHTML=t;
  const bodyEl=qs2('.th-modal-body-2'); if(bodyEl) bodyEl.innerHTML=b;
  // maxWidth：覆盖 .th-modal-2 默认 max-width:min(920px,96vw)。不传时置空，避免上一次弹窗的宽度泄漏到下一个。
  const modal2=qs2<HTMLElement>('.th-modal-2');
  if(modal2) modal2.style.maxWidth=opts?.maxWidth||'';
  // phone：真·独立小手机模式 —— 给 modal 容器加 th-phone-host，CSS 把粉框透明化、只露中央一台手机。
  // 每次 open 都按 opts 显式同步（含 revive 恢复链），避免上一次的手机模式泄漏到普通弹窗。
  const overlay2El=qs2<HTMLElement>('.th-modal-overlay-2');
  if(modal2) modal2.classList.toggle('th-phone-host', !!opts?.phone);
  if(overlay2El) {
    overlay2El.classList.toggle('th-phone-overlay', !!opts?.phone);
    // 背景遮罩按外壳主题着色（配合 .th-phone 的 th-wtheme-* 一起换肤）
    if(opts?.phone){
      let th='candy';
      try{ th=(window as any).__th_world_store__?.getWorldConfig?.().theme||'candy'; }catch(e){ void e; }
      overlay2El.setAttribute('data-wtheme', th);
    } else overlay2El.removeAttribute('data-wtheme');
  }
  overlay.style.display='flex';
  // 世界外壳可拖动：每次 phone 模式重渲染后重挂拖拽 + 复用持久偏移（切 app 不跳位）。
  if(opts?.phone){ try{ applyPhoneDrag(); }catch(e){ void e; } }
  // 世界(phone)打开时：中和主面板的绘制/拦截，避免面板玻璃从透明遮罩后透出（「动态玻璃」）、
  // 也让点机身以外空白能穿透到背后聊天。普通二级弹窗(非 phone)有自带暗色遮罩，无需中和。
  try { __body.classList.toggle('th-world-active', !!opts?.phone); } catch(e){ void e; }
  _modal2CurrentRevive = opts?.revive;
}
export function closeModal2(){
  const overlay=qs2('.th-modal-overlay-2');
  if (_modal2Stack.length) {
    const top = _modal2Stack.pop()!;
    if (top.revive) {
      // 原地恢复父级：置 restoring 标志，让 revive 里的 openModal2 只替换当前层不 push/不清栈。
      _modal2Restoring = true;
      _modal2CurrentRevive = undefined;
      try { top.revive(); }
      finally { _modal2Restoring = false; }
    } else {
      // 父级未登记 revive（旧模块）：无法恢复，按旧行为隐藏+清栈。
      if(overlay) overlay.style.display='none';
      _modal2Stack = [];
      _modal2CurrentRevive = undefined;
    }
    return;
  }
  if(overlay) overlay.style.display='none';
  const titleEl=qs2('.th-modal-title-2'); if(titleEl) titleEl.innerHTML='';
  const bodyEl=qs2('.th-modal-body-2'); if(bodyEl) bodyEl.innerHTML='';
  // 复位宽度，确保下次 openModal2 不带 opts 时回到默认宽度
  const modal2=qs2<HTMLElement>('.th-modal-2'); if(modal2) { modal2.style.maxWidth=''; modal2.classList.remove('th-phone-host'); }
  const ov2=qs2<HTMLElement>('.th-modal-overlay-2'); if(ov2) ov2.classList.remove('th-phone-overlay');
  try { __body.classList.remove('th-world-active'); } catch(e){ void e; }
  _modal2CurrentRevive = undefined;
}
// 清空整个堆栈并隐藏（显式「返回基线」用，配合后续 openModal2 重开）。
export function closeAllModal2(){
  const overlay=qs2('.th-modal-overlay-2'); if(overlay) overlay.style.display='none';
  const modal2=qs2<HTMLElement>('.th-modal-2'); if(modal2) modal2.classList.remove('th-phone-host');
  if(overlay) overlay.classList.remove('th-phone-overlay');
  try { __body.classList.remove('th-world-active'); } catch(e){ void e; }
  _modal2Stack = [];
  _modal2CurrentRevive = undefined;
}

// ================================================================
//  编辑模式 — 全面覆盖
// ================================================================
function toggleEditMode() {
  const w=gw(); if(!w) return;
  isEditMode=!isEditMode;
  if(isEditMode){
    w.classList.add('edit-mode');
  } else {
    w.classList.remove('edit-mode');
  }
  // 完全重新渲染以应用编辑模式
  clearRenderCache();
  renderCurrent();
  const btn=qs<HTMLButtonElement>('.th-btn-edit');
  if(btn) btn.classList.toggle('active',isEditMode);
}

// 全局编辑输入处理（input 和 textarea change 事件）
__doc.addEventListener('change',(e:Event)=>{
  if(!isEditMode||!currentData) return;
  const target=e.target as HTMLElement;
  if(!target.classList.contains('th-edit-input')&&!target.classList.contains('th-edit-textarea')) return;
  const path=target.getAttribute('data-edit-path')||'';
  const val=(target as HTMLInputElement).value;
  applyEdit(path,val);
}, __sigOpt());

__doc.addEventListener('click',(e:Event)=>{
  const target=e.target as HTMLElement;
  const trigger=target.closest('[data-add-trigger]') as HTMLElement|null;
  if(!trigger||!gw()?.contains(trigger)) return;
  e.stopPropagation();
  const kind=trigger.getAttribute('data-add-trigger') as AddKind;
  const basePath=trigger.getAttribute('data-add-base')||'';
  const owner=trigger.getAttribute('data-add-owner')||'';
  if(!currentData||!basePath||!isAddKind(kind)) return;
  let afterCommit=()=>{ renderCurrent(); };
  if(kind==='item'){
    const isUser=!basePath.startsWith('NPC.');
    afterCommit=()=>{ if(!currentData) return; isUser?openUserBag(currentData):openNPCBag(owner); };
  } else if(kind==='skill'){
    const isUser=!basePath.startsWith('NPC.');
    afterCommit=()=>{ if(!currentData) return; isUser?openUserSkill(currentData):openNPCSkill(owner); };
  } else if(basePath.startsWith('NPC.')){
    afterCommit=()=>{ if(currentData) openNPCDetail(owner); };
  }
  openAddDialog(kind,basePath,owner||'添加',afterCommit);
}, __sigOpt());
// 对于 contenteditable span
__doc.addEventListener('blur',(e:Event)=>{
  if(!isEditMode||!currentData) return;
  const target=e.target as HTMLElement;
  if(!target.classList.contains('th-editable')||!target.getAttribute('contenteditable')) return;
  const path=target.getAttribute('data-edit-path')||'';
  const val=target.textContent||'';
  applyEdit(path,val);
}, __sigOptCapture());

function applyEdit(path:string,val:string) {
  if(!currentData||!path) return;
  try {
    // 使用 lodash 通用路径写入
    const ukey=getUserKey(currentData);
    // 将玩家宏替换为实际 user key
    let resolvedPath=path;
    const userMacro=tavernMacro('user');
    if(path.includes(userMacro)) resolvedPath=path.replaceAll(userMacro,ukey);
    // 尝试将数字字符串转为 number
    let parsedVal:any=val;
    const num=Number(val);
    if(!isNaN(num)&&val.trim()!=='') parsedVal=num;
    _.set(currentData,resolvedPath,parsedVal);
    saveData(currentData);
    // 本地编辑统一采集审核变更
    try { collectStatDataChange(currentData, { snapshot: true, label: 'applyEdit' }); } catch(e) { void e; }
    // 延迟重新渲染（避免在 change 事件处理过程中刷新 DOM）
    setTimeout(()=>{ renderCurrent(); },50);
  } catch(e) {
    console.warn('[此间天地] applyEdit failed:',path,val,e);
  }
}

export type AddKind='item'|'skill'|'status'|'clothing';
function isAddKind(v:any): v is AddKind { return v==='item'||v==='skill'||v==='status'||v==='clothing'; }
export function getDefaultEntry(kind:AddKind): Record<string,any> {
  switch(kind){
    case 'item': return {数量:1,简介:'',效果:'',评价:''};
    case 'skill': return {等级:1,简介:'',效果:'',评价:''};
    case 'status': return {效果:'',来源:'',持续时间:''};
    case 'clothing': return {穿着部位:'',穿着情况:'穿着',破损状态:'完好无缺',衣物状态:'',外观详情:'',评价:''};
  }
}
function resolveDataPath(path:string): string {
  if(!currentData) return path;
  const userMacro=tavernMacro('user');
  return path.includes(userMacro)?path.replaceAll(userMacro,getUserKey(currentData)):path;
}
function isNameTaken(basePath:string,name:string): boolean {
  const map=_.get(currentData||{},resolveDataPath(basePath),{})||{};
  return Object.prototype.hasOwnProperty.call(map,name);
}
export function commitAdd(basePath:string,name:string,payload:Record<string,any>, opts?:{onDuplicate?:'reject'|'overwrite'|'stack-qty'}): boolean {
  if(!currentData) return false;
  const trimmed=name.trim();
  if(!trimmed){ toastr?.warning?.('名称不能为空'); return false; }
  const onDuplicate = opts?.onDuplicate || 'reject';
  const taken = isNameTaken(basePath,trimmed);
  if(onDuplicate === 'reject' && taken){ toastr?.warning?.('已存在同名条目'); return false; }
  try {
    const resolved=resolveDataPath(basePath);
    const map={...(_.get(currentData,resolved,{})||{})};
    // stash-item 重复添加：数量叠加（existing + new），其余字段以新 payload 刷新。仅 stash-item 使用 stack-qty。
    let finalPayload: Record<string, any> = payload;
    let stackQty: number | null = null;
    if(onDuplicate === 'stack-qty' && taken){
      const existing = map[trimmed] || {};
      const eq = Number(existing?.['数量']);
      const nq = Number(payload['数量']);
      // 缺省数量按 1 计（一件物品默认数量为 1）。
      stackQty = (isNaN(eq) ? 1 : eq) + (isNaN(nq) ? 1 : nq);
      finalPayload = { ...existing, ...payload, 数量: stackQty };
    }
    map[trimmed]=finalPayload;
    _.set(currentData,resolved,map);
    saveData(currentData);
    // 本地编辑统一采集审核变更
    try { collectStatDataChange(currentData, { snapshot: true, label: 'commitAdd' }); } catch(e) { void e; }
    setTimeout(()=>{ renderCurrent(); },50);
    if(stackQty !== null) toastr?.success?.(`已叠加：${trimmed}（数量 ${stackQty}）`);
    else if(onDuplicate === 'overwrite' && taken) toastr?.success?.(`已覆盖：${trimmed}`);
    else toastr?.success?.(`已添加：${trimmed}`);
    return true;
  } catch(e) {
    console.warn('[此间天地] commitAdd failed:',basePath,name,e);
    toastr?.error?.('添加失败');
    return false;
  }
}
function openAddDialog(kind:AddKind,basePath:string,ownerLabel:string,afterCommit:()=>void) {
  const titleMap:Record<AddKind,string>={item:'物品',skill:'技能',status:'状态',clothing:'衣物'};
  const fieldOrder:Record<AddKind,string[]>={
    item:['名称','数量','简介','效果','评价'],
    skill:['名称','等级','简介','效果','评价'],
    status:['名称','效果','来源','持续时间'],
    clothing:['名称','穿着部位','穿着情况','破损状态','衣物状态','外观详情','评价'],
  };
  const longFields=new Set(['简介','效果','评价','外观详情']);
  const defaults=getDefaultEntry(kind);
  let h=`<div class="th-add-form" data-add-kind="${kind}" data-add-base="${escAttr(basePath)}">`;
  for(const f of fieldOrder[kind]){
    const value=f==='名称'?'':(defaults[f]??'');
    const isNum=(kind==='item'&&f==='数量')||(kind==='skill'&&f==='等级');
    h+=`<div class="th-modal-section"><div class="th-modal-label">${esc(f)}</div>`;
    if(longFields.has(f)) h+=`<textarea class="th-add-field th-edit-textarea" data-add-field="${escAttr(f)}" rows="3">${esc(value)}</textarea>`;
    else h+=`<input class="th-add-field th-edit-input" data-add-field="${escAttr(f)}" type="${isNum?'number':'text'}" value="${escAttr(value)}">`;
    h+=`</div>`;
  }
  h+=`<div class="th-item-actions"><button class="th-btn-sm th-btn-add-confirm"><i class="fa-solid fa-check"></i> 添加</button><button class="th-btn-sm th-btn-add-cancel" style="background:var(--bg3);color:var(--tx2);border:1px solid var(--dv);margin-left:auto"><i class="fa-solid fa-xmark"></i> 取消</button></div></div>`;
  const title=`<i class="fa-solid fa-plus"></i> 新增${titleMap[kind]} · ${esc(ownerLabel)}`;
  const overlay=qs('.th-modal-overlay') as HTMLElement|null;
  const useModal2=!!overlay&&getComputedStyle(overlay).display!=='none';
  if(useModal2) openModal2(title,h); else openModal(title,h);
  setTimeout(()=>{
    const root=qs(useModal2?'.th-modal-body-2':'.th-modal-body'); if(!root) return;
    const getVal=(f:string)=>((root.querySelector(`[data-add-field="${f}"]`) as HTMLInputElement|HTMLTextAreaElement|null)?.value||'');
    root.querySelector('.th-btn-add-confirm')?.addEventListener('click',()=>{
      const payload:Record<string,any>={...getDefaultEntry(kind)};
      for(const f of fieldOrder[kind]){
        if(f==='名称') continue;
        const raw=getVal(f);
        if((kind==='item'&&f==='数量')||(kind==='skill'&&f==='等级')){
          const n=Number(raw); payload[f]=isNaN(n)?payload[f]:n;
        } else payload[f]=raw;
      }
      if(commitAdd(basePath,getVal('名称'),payload)){
        if(useModal2) closeModal2(); else closeModal();
        setTimeout(()=>{ try{ afterCommit(); }catch(e){ console.warn('[此间天地] add afterCommit failed',e); } },60);
      }
    });
    root.querySelector('.th-btn-add-cancel')?.addEventListener('click',()=>{ if(useModal2) closeModal2(); else closeModal(); });
    (root.querySelector('[data-add-field="名称"]') as HTMLInputElement|null)?.focus();
  },40);
}

// ================================================================
//  折叠/展开
// ================================================================
function toggleCollapse() {
  const w=gw(); if(!w) return;
  const folded=w.classList.toggle('collapsed');
  // 折叠后 topbar 高度变化，通知审核面板重算顶部偏移
  try { window.dispatchEvent(new CustomEvent('th:topbar-resize')); } catch(e) { void e; }
  // 外壳同步：正文收起后窗口高度也要跟着缩到只剩顶栏，否则留一大块空粉框
  try { window.dispatchEvent(new CustomEvent('th:panel-fold',{detail:{folded}})); } catch(e) { void e; }
}

// 把 topbar 底沿高度（含 margin-bottom）写到 wrapper CSS 变量，
// 审核抽屉的 top 用此变量，保证从 topbar 下方滑出、不被 topbar 盖住。
function syncTopbarBottom(): void {
  try {
    const w = gw(); if (!w) return;
    const topbar = w.querySelector('.th-topbar') as HTMLElement | null;
    if (!topbar) return;
    const rect = topbar.getBoundingClientRect();
    const wrapperRect = w.getBoundingClientRect();
    const bottom = rect.bottom - wrapperRect.top;
    w.style.setProperty('--th-topbar-bottom', `${Math.round(bottom)}px`);
  } catch(e) { void e; }
}

// ================================================================
//  工具
// ================================================================
// HTML 转义（ESC_MAP/esc/escAttr）已抽至 ./lib/dom-utils.ts
export function getAvatarColor(name:string,idx:number):string { if(!avatarColorMap[name]) avatarColorMap[name]=AVATAR_COLORS[idx%AVATAR_COLORS.length]; return avatarColorMap[name]; }
export function deleteAvatar(t:string){ delete avatarImages[t]; saveImages(); if(t==='user')renderUserAvatar(); else if(currentData)renderNPCGrid(currentData); }
export function showImage(u:string){ const o=qs('.th-image-overlay'); const i=qs<HTMLImageElement>('.th-image-full'); if(o&&i){i.setAttribute('src',u);o.style.display='flex';} }
function hideImage(){ const o=qs('.th-image-overlay'); if(o)o.style.display='none'; }
export function getDotCls(effectOrState:string):string{
  const s=(effectOrState||'').toLowerCase();
  if(s.includes('debuff')||s.includes('负面')||s.includes('破损')||s.includes('撕裂')) return 'bad';
  if(s.includes('buff')||s.includes('增益')) return 'good';
  if(s.includes('湿')||s.includes('脏')||s.includes('乱')) return 'warn';
  return 'neutral';
}

// ================================================================
//  事件绑定
// ================================================================
function bindEvents() {
  qs('.th-btn-refresh')?.addEventListener('click',()=>{manualRefresh();});
  // 地点总览 → 多层交互地图（D7：地图顶栏「列表视图」切回 openLocationsModal，功能一条不少）
  qs('.th-btn-locations')?.addEventListener('click',()=>{
    try { openWorldMapModal(); }
    catch(e){ console.error('[此间天地] openWorldMapModal error:',e); openLocationsModal(); }
  });
  qs('.th-btn-events')?.addEventListener('click',()=>{openEventsModal();});
  qs('.th-btn-dlcs')?.addEventListener('click',()=>{openDlcsModal();});
  qs('.th-btn-stash')?.addEventListener('click',()=>{ try { openStashModal(); } catch(e) { console.error('[此间天地] openStashModal error:', e); toastr?.error?.('储藏间打开失败'); } });
  qs('.th-btn-worldbook')?.addEventListener('click',()=>{void openWorldbookInspectorModal();});
  // 顶栏「世界」按钮（审核↔菜单之间）→ 手机桌面壳
  qs('.th-btn-world')?.addEventListener('click',()=>{ try { openWorldApp(); } catch(e){ console.error('[此间天地] openWorldApp error:',e); toastr?.error?.('世界打开失败'); } });
  // 移除「世界」按钮聚合红点——所有 app 在 AI 生成时玩家正开着对应界面，未读产生即被清零，
  //   红点从不出现、聚合无意义；桥函数留一个空壳给旧调用方（各 app 调 refreshWorldUnread 时不报错）。
  try { (window as any).__th_world_syncdot__ = () => { /* no-op：聚合红点已移除 */ }; } catch (e) { void e; }
  // 右侧菜单按钮 — 点击展开/收起 popover;点外部或选中项后收起
  const menuBtn=qs('.th-btn-menu');
  const menuPopover=qs('.th-menu-popover');
  if(menuBtn && menuPopover){
    menuBtn.addEventListener('click',(e:MouseEvent)=>{
      e.stopPropagation();
      const open=menuPopover.style.display==='block';
      menuPopover.style.display=open?'none':'block';
      menuBtn.classList.toggle('active',!open);
    });
    // 点菜单项后收起（编辑/刷新/世界书）
    menuPopover.querySelectorAll('.th-menu-item').forEach(it=>it.addEventListener('click',()=>{
      if((it as HTMLButtonElement).disabled) return;
      menuPopover.style.display='none';
      menuBtn.classList.remove('active');
    }));
    // 点外部收起
    __doc.addEventListener('click',(e:MouseEvent)=>{
      if(menuPopover.style.display!=='block') return;
      const t=e.target as HTMLElement;
      if(!menuPopover.contains(t) && t!==menuBtn) {
        menuPopover.style.display='none';
        menuBtn.classList.remove('active');
      }
    }, __sigOpt());
  }
  // 外观设置 + API 设置（移除 disabled 占位并启用）
  qs('.th-btn-appearance')?.removeAttribute('disabled');
  qs('.th-btn-api-settings')?.removeAttribute('disabled');
  qs('.th-btn-appearance')?.addEventListener('click',()=>{ try { openAppearanceSettings(); } catch(e){ console.error('[此间天地] openAppearanceSettings error:',e); toastr?.error?.('外观设置打开失败'); } });
  qs('.th-btn-api-settings')?.addEventListener('click',()=>{ try { openApiSettings(); } catch(e){ console.error('[此间天地] openApiSettings error:',e); toastr?.error?.('API 设置打开失败'); } });
  qs('.th-btn-init-manager')?.removeAttribute('disabled');
  qs('.th-btn-init-manager')?.addEventListener('click',()=>{ try { void openInitManager(); } catch(e){ console.error('[此间天地] openInitManager error:',e); toastr?.error?.('初始化管理打开失败'); } });
  // AI 总结注入
  qs('.th-btn-ai-summarize')?.removeAttribute('disabled');
  qs('.th-btn-ai-summarize')?.addEventListener('click',()=>{ try { openAiSummarize(); } catch(e){ console.error('[此间天地] openAiSummarize error:',e); toastr?.error?.('AI 总结注入打开失败'); } });
  qs('.th-btn-prompt-settings')?.removeAttribute('disabled');
  qs('.th-btn-prompt-settings')?.addEventListener('click',()=>{ try { openPromptSettings(); } catch(e){ console.error('[此间天地] openPromptSettings error:',e); toastr?.error?.('提示词编辑打开失败'); } });
  // 激活监控
  qs('.th-btn-activation-monitor')?.removeAttribute('disabled');
  qs('.th-btn-activation-monitor')?.addEventListener('click',()=>{ try { openActivationMonitor(); } catch(e){ console.error('[此间天地] openActivationMonitor error:',e); toastr?.error?.('激活监控打开失败'); } });
  // NPC在场筛选按钮（含持久化）
  qsa('.th-npc-filter-btn').forEach(btn=>btn.addEventListener('click',function(this:HTMLElement){
    const f=this.getAttribute('data-filter') as 'all'|'present'|'absent';
    if(!f) return;
    npcFilter=f;
    savePersistedNpcFilter(f);
    qsa('.th-npc-filter-btn').forEach(b=>b.classList.remove('active'));
    this.classList.add('active');
    _renderCache.npc = '';
    renderCurrent();
  }));
  // NPC 网格列数手动切换（1/2/3），点击循环 + localStorage 持久化
  (function bindColsSwitcher() {
    const COLS_KEY = '_th_npc_cols_v2';
    let cols = parseInt(localStorage.getItem(COLS_KEY) || '2', 10);
    if (![1, 2, 3].includes(cols)) cols = 2;
    function apply() {
      const grid = qs('.th-npc-grid');
      if (grid) grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      const btn = qs('.th-btn-cols-switcher');
      if (btn) { btn.textContent = String(cols); btn.setAttribute('data-cols', String(cols)); }
      // 名册卡片态也是网格 → 跟着一起切列数（极简行态不受影响，inline 已清空）
      const roster = qs<HTMLElement>('.th-roster-list');
      if (roster && roster.classList.contains('is-card')) {
        roster.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      }
    }
    apply();
    const btn = qs('.th-btn-cols-switcher');
    btn?.addEventListener('click', () => {
      cols = cols >= 3 ? 1 : cols + 1;
      localStorage.setItem(COLS_KEY, String(cols));
      apply();
    });
  })();
  // 名册（离场）分区折叠 —— 只切 class，不动数据，localStorage 记住状态
  (function bindRosterFold() {
    const FOLD_KEY = '_th_roster_folded_v2';
    const sec = qs<HTMLElement>('.th-roster-sec');
    if (!sec) return;
    if (localStorage.getItem(FOLD_KEY) === '1') sec.classList.add('is-folded');
    qs('.th-roster-toggle')?.addEventListener('click', (e: Event) => {
      // 模式切换按钮长在 header 里，点它不该顺手把整个分区折起来
      if ((e.target as HTMLElement)?.closest('.th-btn-roster-mode')) return;
      const folded = sec.classList.toggle('is-folded');
      localStorage.setItem(FOLD_KEY, folded ? '1' : '0');
    });
  })();
  // 名册显示模式切换：极简一行 ↔ 与在场相同的完整卡片（离场角色也能看全卡）
  (function bindRosterMode() {
    rosterMode = loadPersistedRosterMode();
    applyRosterModeBtn();
    qs('.th-btn-roster-mode')?.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      rosterMode = rosterMode === 'card' ? 'row' : 'card';
      savePersistedRosterMode(rosterMode);
      applyRosterModeBtn();
      // 名册折叠时切模式看不到效果 → 顺手展开
      const sec = qs<HTMLElement>('.th-roster-sec');
      if (sec?.classList.contains('is-folded')) {
        sec.classList.remove('is-folded');
        localStorage.setItem('_th_roster_folded_v2', '0');
      }
      _renderCache.npc = '';
      renderCurrent();
    });
  })();
  // 在场/离场切换（合并"在场"+"不在场"两个按钮为一个，点击循环 present↔absent）
  // 不影响 npcFilter='all' 状态——点"全部"按钮正常切回全显示
  // applyPresenceBtn() 定义在模块顶层，启动时 init 也能同步
  applyPresenceBtn();
  const presenceBtn = qs('.th-btn-presence-switcher');
  presenceBtn?.addEventListener('click', () => {
    // 'all' → 'present'；'present' → 'absent'；'absent' → 'present'
    npcFilter = (npcFilter === 'present') ? 'absent' : 'present';
    savePersistedNpcFilter(npcFilter);
    applyPresenceBtn();
    // 同步 .th-npc-filter-btn（含"全部"）的 active 状态
    qsa('.th-npc-filter-btn[data-filter]').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-filter') === npcFilter);
    });
    _renderCache.npc = '';
    renderCurrent();
  });
  // NPC 搜索（姓名 + 身份）—— 实时过滤 + 防抖 150ms + 持久化
  (function bindNpcSearch() {
    const input = qs<HTMLInputElement>('.th-npc-search');
    const clearBtn = qs<HTMLButtonElement>('.th-npc-search-clear');
    if (!input) return;
    // 启动时从 localStorage 恢复（如果 init 还没设值就设上；init 已设就以 init 为准）
    if (!npcSearchText) npcSearchText = loadPersistedNpcSearch();
    input.value = npcSearchText;
    function applyClearVisible() {
      if (!clearBtn) return;
      clearBtn.style.display = input && input.value ? 'flex' : 'none';
    }
    applyClearVisible();
    let debounceTimer: number | null = null;
    input.addEventListener('input', () => {
      applyClearVisible();
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        npcSearchText = input.value;
        savePersistedNpcSearch(npcSearchText);
        _renderCache.npc = '';
        renderCurrent();
      }, 150);
    });
    // Esc 清空
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && input.value) {
        e.preventDefault();
        input.value = '';
        npcSearchText = '';
        savePersistedNpcSearch('');
        applyClearVisible();
        _renderCache.npc = '';
        renderCurrent();
      }
    });
    // × 按钮清空
    clearBtn?.addEventListener('click', () => {
      input.value = '';
      npcSearchText = '';
      savePersistedNpcSearch('');
      applyClearVisible();
      _renderCache.npc = '';
      renderCurrent();
      input.focus();
    });
  })();
  // NPC 卡片 3D tilt —— 鼠标位置驱动 rotateX/Y ±6°，mouseleave 平滑复位
  // 不动 .th-fab-panel（硬约束：transform 都在 .th-npc-card 自身），perspective 内联到 transform
  (function bindNPCCardTilt() {
    const grid = qs('.th-npc-grid');
    if (!grid) return;
    // v2：卡片从 ~120px 变成 ~640px 高，同样角度的位移被高度放大数倍 →
    // 角度 6°→2°、透视 800→1600（越大越平），位移收到肉眼可辨但不晃的程度
    const TILT_MAX = 2;            // ±2°
    const PERSPECTIVE = 1600;      // 透视 1600px
    // 与 CSS :hover 的 transform 保持一致（v2 块里同步收成 -2px / 1.004）
    const HOVER_TRANSFORM = 'translateY(-2px) scale(1.004)';
    const pending = new WeakMap<HTMLElement, number>();
    function applyTilt(card: HTMLElement, e: MouseEvent) {
      const r = card.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const dx = (e.clientX - r.left - r.width / 2) / (r.width / 2);   // -1 ~ 1
      const dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
      card.style.transform =
        `perspective(${PERSPECTIVE}px) ${HOVER_TRANSFORM}` +
        ` rotateX(${-dy * TILT_MAX}deg) rotateY(${dx * TILT_MAX}deg)`;
    }
    grid.addEventListener('mousemove', (e: MouseEvent) => {
      const card = (e.target as HTMLElement | null)?.closest<HTMLElement>('.th-npc-card');
      if (!card) return;
      if (pending.has(card)) return; // rAF 节流：每张卡每帧最多 1 次
      const ev = e; const c = card;
      const id = requestAnimationFrame(() => {
        pending.delete(c);
        applyTilt(c, ev);
      });
      pending.set(card, id);
    });
    grid.addEventListener('mouseout', (e: MouseEvent) => {
      const card = (e.target as HTMLElement | null)?.closest<HTMLElement>('.th-npc-card');
      if (!card) return;
      // 鼠标移到卡内子元素不算离开
      const related = e.relatedTarget as Node | null;
      if (related && card.contains(related)) return;
      const id = pending.get(card);
      if (id !== undefined) { cancelAnimationFrame(id); pending.delete(card); }
      card.style.transform = ''; // 清 inline style，让 CSS :hover transform 接管
    });
  })();
  qs('.th-btn-edit')?.addEventListener('click',()=>{toggleEditMode();});
  let lastReviewPendingCount = getPendingCount();
  // 审核来源筛选当前值（'all' 或具体 source key）
  let reviewSourceFilter = 'all';
  function renderActiveReviewTab(): void {
    const tab = qs<HTMLElement>('.th-review-tab.active')?.getAttribute('data-tab') || 'review';
    if (tab === 'snapshot') renderSnapshotList();
    else renderReviewList();
  }
  // 铃铛按钮 → 切换审核面板显隐 + 首次展开时渲染内容（抽屉）
  (function bindReviewEvents() {
    const btn = qs('.th-btn-review');
    const panel = qs('.th-review-panel');
    if (!btn || !panel) return;
    // 初始与 resize 时同步 topbar 底沿高度到 wrapper CSS 变量
    syncTopbarBottom();
    // resize 必须挂父页 window：状态栏 DOM 在父页，iframe 收不到父页视口缩放
    __win.addEventListener('resize', syncTopbarBottom, __sigOpt());
    window.addEventListener('th:topbar-resize', syncTopbarBottom as EventListener, __sigOpt());
    const setOpen = (open: boolean) => {
      if (open) {
        // 打开：先把 panel 挂回渲染态（display:flex）作为起点，下一帧再加 .shown 触发滑入动画
        syncTopbarBottom();
        panel.classList.add('open');
        btn.classList.add('active');
        btn.setAttribute('aria-expanded', 'true');
        renderReviewList();
        requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('shown')));
      } else {
        // 关闭：不动画，直接从渲染树移除（CSS display:none），彻底无 transform 残留
        panel.classList.remove('shown', 'open');
        btn.classList.remove('active');
        btn.setAttribute('aria-expanded', 'false');
      }
    };
    btn.addEventListener('click', () => {
      setOpen(!panel.classList.contains('open'));
    });
    // 抽屉关闭：× 按钮 + Esc
    qs('.th-review-panel-close')?.addEventListener('click', () => setOpen(false));
    __doc.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && panel.classList.contains('open')) {
        // 优先级：review-edit modal > review panel
        if (__doc.querySelector('.th-review-edit-modal')) return;
        setOpen(false);
        e.stopPropagation();
      }
    }, __sigOpt());
    // tab 切换
    qsa('.th-review-tab').forEach(t => {
      t.addEventListener('click', function(this: HTMLElement) {
        const tab = this.getAttribute('data-tab');
        qsa('.th-review-tab').forEach(x => x.classList.remove('active'));
        this.classList.add('active');
        const rl = qs('.th-review-list');
        const sl = qs('.th-snapshot-list');
        const sf = qs('.th-review-source-filter');
        if (tab === 'snapshot') { if (rl) rl.style.display = 'none'; if (sl) sl.style.display = ''; if (sf) sf.style.display = 'none'; renderSnapshotList(); }
        else { if (rl) rl.style.display = ''; if (sl) sl.style.display = 'none'; renderReviewList(); }
      });
    });
    // 全部同意 / 全部拒绝
    qs('.th-review-approve-all')?.addEventListener('click', () => { approveAllPending(); renderReviewList(); });
    qs('.th-review-reject-all')?.addEventListener('click', async () => { try { await rejectAllPending(); } catch(e) { void e; } renderReviewList(); });
    qs('.th-review-clear-all')?.addEventListener('click', () => { clearReviewAll(); renderReviewList(); });
    // 审核列表事件委托（✓/✗/修改/跳 NPC）
    const list = qs('.th-review-list');
    if (list) {
      list.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const btn = target.closest<HTMLElement>('[data-action]');
        if (!btn) return;
        const itemEl = btn.closest<HTMLElement>('.th-review-item');
        if (!itemEl) return;
        const id = itemEl.getAttribute('data-id') || '';
        const action = btn.getAttribute('data-action') || '';
        const queue = getReviewQueue();
        const item = queue.find(i => i.id === id);
        if (!item) return;
        if (action === 'approve') {
          try { await applyReviewItem(id, 'approve'); } catch(e) { void e; }
        } else if (action === 'reject') {
          try { await applyReviewItem(id, 'reject'); } catch(e) { void e; }
        } else if (action === 'edit') {
          showReviewEditModal(id, item);
          return;
        } else if (action === 'jump-npc') {
          jumpToNpc(btn.getAttribute('data-npc') || '');
          return;
        }
        renderReviewList();
      });
    }
    // 快照列表事件委托（覆盖 / 删除）
    const slist = qs('.th-snapshot-list');
    if (slist) {
      slist.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const btn = target.closest<HTMLElement>('[data-snap-action]');
        if (!btn) return;
        const itemEl = btn.closest<HTMLElement>('.th-snapshot-item');
        if (!itemEl) return;
        const id = itemEl.getAttribute('data-id') || '';
        const action = btn.getAttribute('data-snap-action') || '';
        if (action === 'restore') {
          try { await restoreSnapshot(id); } catch(e) { void e; }
        } else if (action === 'delete') {
          deleteSnapshot(id);
        }
        renderSnapshotList();
      });
    }
    // 订阅 review 队列变化 → 实时更新 badge + 当前 tab 内容
    subscribeReview(() => { updateReviewBadge(); if (panel.classList.contains('open')) renderActiveReviewTab(); });
    updateReviewBadge();
  })();
  // 更新铃铛 badge（pending 数 + 有 pending 时脉动 + 全部完成态）
  function updateReviewBadge(): void {
    const btn = qs('.th-btn-review');
    const badge = qs('.th-review-badge');
    const count = qs('.th-review-pending-count');
    if (!btn || !badge) return;
    const n = getPendingCount();
    const wasPending = lastReviewPendingCount > 0;
    if (n > 0) {
      badge.style.display = '';
      badge.textContent = String(n);
      btn.classList.add('has-pending');
      btn.classList.remove('reviewed-all');
    } else {
      badge.style.display = 'none';
      btn.classList.remove('has-pending');
      if (wasPending) {
        btn.classList.remove('reviewed-all');
        void btn.offsetWidth;
        btn.classList.add('reviewed-all');
        window.setTimeout(() => btn.classList.remove('reviewed-all'), 1500);
      }
    }
    lastReviewPendingCount = n;
    if (count) count.textContent = n > 0 ? String(n) : '';
  }
  // 渲染审核列表（path + 旧值→新值 + diff 色 + 4 个按钮 + 跳 NPC）
  function renderReviewList(): void {
    const list = qs('.th-review-list');
    const empty = qs('.th-review-empty');
    if (!list || !empty) return;
    // 先渲染来源筛选条（动态显示有审核项的来源）
    renderReviewSourceFilter();
    const queue = getReviewQueue();
    if (!queue.length) {
      list.innerHTML = '';
      empty.style.display = '';
      empty.textContent = '都批完啦，好乖';
      return;
    }
    // 按当前来源筛选过滤
    const filtered = reviewSourceFilter === 'all' ? queue : queue.filter(it => getReviewSource(it.path) === reviewSourceFilter);
    if (!filtered.length) {
      list.innerHTML = '';
      empty.style.display = '';
      empty.textContent = `「${reviewSourceLabel(reviewSourceFilter)}」都批完啦，好乖`;
      return;
    }
    empty.style.display = 'none';
    const sorted = filtered.slice().sort((a, b) => b.timestamp - a.timestamp);
    list.innerHTML = sorted.slice(0, 50).map(item => {
      const path = esc(item.path);
      const oldV = esc(formatReviewVal(item.oldValue));
      const newV = esc(formatReviewVal(item.newValue));
      let diffHtml = '';
      if (typeof item.diff === 'number') {
        const cls = item.diff > 0 ? 'pos' : item.diff < 0 ? 'neg' : 'zero';
        const sign = item.diff > 0 ? '+' : '';
        diffHtml = `<span class="th-review-item-diff ${cls}">${sign}${item.diff}</span>`;
      }
      const npc = parseNpcFromPath(item.path);
      const jumpBtn = npc ? `<button class="th-review-item-btn th-btn-jump-npc" data-action="jump-npc" data-npc="${esc(npc)}" title="查看 ${esc(npc)} 详情">👤</button>` : '';
      return `<div class="th-review-item status-${item.status}" data-id="${item.id}"><span class="th-review-item-path" title="${path}">${path}</span>${diffHtml}<div class="th-review-item-old" title="原值: ${oldV}">${oldV}</div><span class="th-review-item-arrow">→</span><div class="th-review-item-new" title="新值: ${newV}">${newV}</div><div class="th-review-item-actions">${jumpBtn}<button class="th-review-item-btn th-btn-approve" data-action="approve" title="同意"><svg class="th-rr-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></button><button class="th-review-item-btn th-btn-reject" data-action="reject" title="拒绝"><svg class="th-rr-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.5 6.5l-11 11M6.5 6.5l11 11"/></svg></button><button class="th-review-item-btn th-btn-edit" data-action="edit" title="修改新值"><svg class="th-rr-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button></div></div>`;
    }).join('');
  }
  // 渲染来源筛选条 — 全部/世界信息/主角/各NPC(动态)/其他
  function renderReviewSourceFilter(): void {
    const bar = qs('.th-review-source-filter');
    if (!bar) return;
    const queue = getReviewQueue();
    if (!queue.length) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
    // 统计各来源条目数(保留顺序:世界信息/主角/各NPC按出现顺序/其他)
    const counts = new Map<string, number>();
    const npcOrder: string[] = [];
    for (const it of queue) {
      const src = getReviewSource(it.path);
      counts.set(src, (counts.get(src) || 0) + 1);
      if (src.startsWith('npc:') && !npcOrder.includes(src)) npcOrder.push(src);
    }
    const chips: {key:string;label:string}[] = [{key:'all',label:'全部'}];
    if (counts.has('world')) chips.push({key:'world',label:'世界信息'});
    if (counts.has('user')) chips.push({key:'user',label:'主角'});
    for (const nk of npcOrder) chips.push({key:nk,label:reviewSourceLabel(nk)});
    if (counts.has('other')) chips.push({key:'other',label:'其他'});
    bar.style.display = '';
    bar.innerHTML = chips.map(c => {
      const cnt = c.key === 'all' ? queue.length : (counts.get(c.key) || 0);
      const active = c.key === reviewSourceFilter ? ' active' : '';
      return `<button class="th-review-src-chip${active}" data-src="${escAttr(c.key)}" type="button">${esc(c.label)}<span class="th-review-src-cnt">${cnt}</span></button>`;
    }).join('');
    // 绑定点击(每次渲染重绑,条目少无性能问题)
    qsa('.th-review-src-chip').forEach(chip => chip.addEventListener('click', function(this:HTMLElement){
      reviewSourceFilter = this.getAttribute('data-src') || 'all';
      renderReviewList();
    }));
  }
  // 渲染快照列表
  function renderSnapshotList(): void {
    const list = qs('.th-snapshot-list');
    const empty = qs('.th-review-empty');
    if (!list || !empty) return;
    const snaps = getSnapshots();
    if (!snaps.length) {
      list.innerHTML = '';
      empty.style.display = '';
      empty.textContent = '还没封存时光呢';
      return;
    }
    empty.style.display = 'none';
    empty.textContent = '都批完啦，好乖';
    list.innerHTML = snaps.slice().reverse().map(s => {
      const time = new Date(s.timestamp).toLocaleString('zh-CN', { hour12: false });
      return `<div class="th-snapshot-item" data-id="${s.id}"><div class="th-snapshot-item-info"><span class="th-snapshot-item-time">${time}</span><span class="th-snapshot-item-floor">#${s.messageId}</span></div><div class="th-snapshot-item-actions"><button class="th-snapshot-item-btn th-snapshot-btn-restore" data-snap-action="restore" type="button">覆盖</button><button class="th-snapshot-item-btn th-snapshot-btn-delete" data-snap-action="delete" type="button">删除</button></div></div>`;
    }).join('');
  }
  // edit modal——点修改按钮时弹出
  function showReviewEditModal(id: string, item: any): void {
    __doc.querySelector('.th-review-edit-modal')?.remove();
    const overlay = __doc.createElement('div');
    overlay.className = 'th-review-edit-modal';
    overlay.innerHTML = `<div class="th-review-edit-modal-content"><div class="th-review-edit-modal-title">修改变量新值</div><div class="th-review-edit-modal-path">${esc(item.path)}</div><div class="th-review-edit-modal-row"><label>原值</label><span class="th-review-edit-old">${esc(formatReviewVal(item.oldValue))}</span></div><div class="th-review-edit-modal-row th-review-edit-modal-row-stack"><label>新值</label><textarea class="th-review-edit-input th-edit-textarea" rows="6">${esc(formatReviewVal(item.newValue))}</textarea></div><div class="th-review-edit-modal-actions"><button class="th-mini-btn th-review-edit-cancel" type="button">取消</button><button class="th-mini-btn th-review-edit-confirm" type="button">确认</button></div></div>`;
    __body.appendChild(overlay);
    const input = qsRoot<HTMLTextAreaElement>('.th-review-edit-input', overlay);
    if (input) { input.focus(); input.setSelectionRange(0, input.value.length); }
    const close = () => { overlay.remove(); renderReviewList(); };
    qsRoot('.th-review-edit-cancel', overlay)?.addEventListener('click', close);
    qsRoot('.th-review-edit-confirm', overlay)?.addEventListener('click', async () => {
      const newValRaw = input?.value ?? '';
      let parsed: any = newValRaw;
      if (typeof item.newValue === 'number') {
        const n = Number(newValRaw);
        if (!Number.isNaN(n)) parsed = n;
      } else if (typeof item.newValue === 'boolean') {
        parsed = newValRaw === 'true';
      }
      try { await applyReviewItem(id, 'edit', parsed); } catch(e) { void e; }
      close();
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }
  // 跳到状态栏里的 NPC 卡（scrollIntoView + 临时高亮 2s）
  function jumpToNpc(npcName: string): void {
    if (!npcName) return;
    const cards = qsa<HTMLElement>('.th-npc-card');
    let target: HTMLElement | null = null;
    for (const c of cards) {
      const name = c.querySelector('.th-npc-name')?.textContent?.trim() || '';
      if (name === npcName) { target = c; break; }
    }
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('th-npc-card-flash');
    setTimeout(() => target?.classList.remove('th-npc-card-flash'), 2000);
  }
  // 从 path 解析 NPC 名
  function parseNpcFromPath(path: string): string {
    const parts = path.split('.');
    if (parts.length >= 2 && (parts[0] === '角色' || parts[0] === 'NPC' || parts[0] === '角色卡')) {
      return parts[1];
    }
    return '';
  }
  // 从 path 推断审核变量来源分类
  // 返回 source key：'world'(世界信息) / 'user'(主角) / `npc:<名>`(某NPC) / 'other'(其他)
  function getReviewSource(path: string): string {
    if (!path) return 'other';
    const parts = path.split('.');
    const head = parts[0];
    if (head === '世界信息') return 'world';
    if (head === '角色' || head === 'NPC' || head === '角色卡') {
      return parts[1] ? `npc:${parts[1]}` : 'other';
    }
    // 主角键：当前数据 userKey 开头
    const cd = getCurrentStatusData();
    if (cd) {
      const uk = getUserKey(cd);
      if (uk && (head === uk || path.startsWith(uk + '.'))) return 'user';
    }
    return 'other';
  }
  // source key → 显示标签
  function reviewSourceLabel(key: string): string {
    if (key === 'world') return '世界信息';
    if (key === 'user') return '主角';
    if (key === 'other') return '其他';
    if (key.startsWith('npc:')) return key.slice(4);
    return key;
  }
  // 格式化变量值显示（保留完整内容，CSS 控制截断 + title hover 看完整）
  function formatReviewVal(v: unknown): string {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (typeof v === 'bigint') return `${v}n`;
    if (typeof v === 'symbol') return v.toString();
    if (typeof v === 'function') return '[Function]';
    try {
      return JSON.stringify(v) ?? String(v);
    } catch {
      return Object.prototype.toString.call(v);
    }
  }
  // 标题区两枚皇冠分工（外框窄条删除后，三件事全在顶栏上）：
  //   左皇冠 = 全屏/还原（Shell.vue 绑，本文件不管）
  //   右皇冠 = 折叠正文只留顶栏（原来标题自己的功能，让位给"收起为球"后搬到这里）
  //   标题文字 = 收起为悬浮球（Shell.vue 绑）
  qs('.th-title-crown-r')?.addEventListener('click',(e:Event)=>{ e.stopPropagation(); toggleCollapse(); });

  // 头像
  qs('.th-avatar-upload')?.addEventListener('click',()=>{const u=avatarImages['user']||'';if(u)showImage(u);else{uploadingTarget='user';qs<HTMLInputElement>('.th-avatar-file-input')?.click();}});
  qs('.th-avatar-btn-upload')?.addEventListener('click',(e:Event)=>{e.stopPropagation();uploadingTarget='user';qs<HTMLInputElement>('.th-avatar-file-input')?.click();});
  qs('.th-avatar-btn-delete')?.addEventListener('click',(e:Event)=>{e.stopPropagation();deleteAvatar('user');});
  qs('.th-avatar-btn-gallery')?.addEventListener('click',(e:Event)=>{e.stopPropagation();openGalleryModal('user',getUN(currentData||{}));});

  // 文件上传（支持头像和画廊）
  const fi=qs<HTMLInputElement>('.th-avatar-file-input');
  if(fi) fi.addEventListener('change',function(this:HTMLInputElement){
    if(!this.files||!this.files.length) return;
    const galleryTarget=(window as any).__galleryTarget__||'';
    if(galleryTarget){
      // 画廊多图上传
      let loaded=0;
      Array.from(this.files).forEach(file=>{
        const r=new FileReader();
        r.onload=()=>{ addNPCGalleryImage(galleryTarget,r.result as string); loaded++; if(loaded===this.files!.length){ const gd=(window as any).__galleryDisplay__||''; closeModal(); openGalleryModal(galleryTarget,gd||undefined); (window as any).__galleryTarget__=''; (window as any).__galleryDisplay__=''; } };
        r.readAsDataURL(file);
      });
    } else {
      const tgt=(window as any).__uploadTarget__||uploadingTarget||'user';
      const r=new FileReader();
      r.onload=()=>{ avatarImages[tgt]=r.result as string; saveImages(); if(tgt==='user')renderUserAvatar(); else if(currentData)renderNPCGrid(currentData); (window as any).__uploadTarget__=''; };
      r.readAsDataURL(this.files[0]);
    }
    this.value='';
  });

  // 属性按钮 click + hover
  qs('.th-btn-attr-modal')?.addEventListener('click',()=>{if(!currentData)return;const u=getUser(currentData);const ukey=getUserKey(currentData);openAttrModal(getUN(currentData),_.get(u,'属性',{})||{},ukey+'.属性');});
  qs('.th-btn-attr-modal')?.addEventListener('mouseenter',function(this:HTMLElement){
    if(!currentData) return;
    const u=getUser(currentData); const attrs=_.get(u,'属性',{})||{};
    const html=buildAttrBarHtml(attrs);
    showHoverTip(this,'attr',{name:getUN(currentData),html:html});
  });
  qs('.th-btn-attr-modal')?.addEventListener('mouseleave',()=>{hideHoverTip();});

  // 姿态/身体 hover 显示信息 + click 弹详情编辑弹窗
  qs('.th-pb-posture')?.addEventListener('mouseenter',function(this:HTMLElement){
    const text=this.getAttribute('data-pb-text')||'';
    showHoverTip(this,'pb',{icon:'fa-solid fa-child-reaching',label:'姿态动作',content:text});
  });
  qs('.th-pb-posture')?.addEventListener('mouseleave',()=>{hideHoverTip();});
  qs('.th-pb-posture')?.addEventListener('click',function(this:HTMLElement){
    const text=this.getAttribute('data-pb-text')||'';
    const path=this.getAttribute('data-pb-path')||'';
    const h=isEditMode?editableTextarea(text,path):`<div class="th-modal-text">${esc(text)}</div>`;
    openModal('<i class="fa-solid fa-child-reaching"></i> 姿态动作',h);
  });

  qs('.th-pb-body')?.addEventListener('mouseenter',function(this:HTMLElement){
    const text=this.getAttribute('data-pb-text')||'';
    showHoverTip(this,'pb',{icon:'fa-solid fa-hand-holding-heart',label:'身体状态',content:text});
  });
  qs('.th-pb-body')?.addEventListener('mouseleave',()=>{hideHoverTip();});
  qs('.th-pb-body')?.addEventListener('click',function(this:HTMLElement){
    const text=this.getAttribute('data-pb-text')||'';
    const path=this.getAttribute('data-pb-path')||'';
    const h=isEditMode?editableTextarea(text,path):`<div class="th-modal-text">${esc(text)}</div>`;
    openModal('<i class="fa-solid fa-hand-holding-heart"></i> 身体状态',h);
  });

  // 弹窗关闭
  qs('.th-modal-close')?.addEventListener('click',closeModal);
  // 二级弹窗关闭（overlay-2 已 portal 到父页 body，用 qs2 命中）
  qs2('.th-modal-close-2')?.addEventListener('click',closeModal2);
  // 世界(phone)模式不走点空白关闭（有右上角×/极简退出钮即可）；仅普通二级弹窗保留。
  qs2('.th-modal-overlay-2')?.addEventListener('click',function(this:HTMLElement,e:Event){ if(e.target===this && !this.classList.contains('th-phone-overlay')) closeModal2(); });
  // 点击遮罩空白处→详情回退到网格，否则关闭弹窗
  qs('.th-modal-overlay')?.addEventListener('click',function(this:HTMLElement,e:Event){
    if(e.target!==this) return;
    const detailEl=qs('#th-grid-detail');
    if(detailEl&&detailEl.style.display!=='none'){
      // 有详情面板打开：回退到网格
      detailEl.style.display='none'; detailEl.innerHTML='';
      const gridEl=detailEl.previousElementSibling as HTMLElement;
      if(gridEl) gridEl.style.display='';
      return;
    }
    // 检查折叠式衣物详情是否打开
    const foldDetail=qs('.th-fold-detail');
    if(foldDetail&&foldDetail.style.display!=='none'){
      foldDetail.style.display='none'; foldDetail.innerHTML='';
      // 恢复箭头
      const trigger=__doc.querySelector('.th-fold-trigger .fa-chevron-up');
      if(trigger) trigger.outerHTML='<i class="fa-solid fa-chevron-down"></i>';
      return;
    }
    closeModal();
  });
  // 点击弹窗主体空白处（非详情区域）→ 回退到网格
  qs('.th-modal-body')?.addEventListener('click',function(this:HTMLElement,e:Event){
    const target=e.target as HTMLElement;
    // 不干扰按钮、输入框、方块、折叠触发器等控件的点击
    if(target.closest('button')||target.closest('input')||target.closest('textarea')||target.closest('.th-block')||target.closest('.th-fold-trigger')||target.closest('.th-fold-detail')||target.closest('#th-grid-detail')) return;
    const detailEl=qs('#th-grid-detail');
    if(detailEl&&detailEl.style.display!=='none'){
      detailEl.style.display='none'; detailEl.innerHTML='';
      const gridEl=detailEl.previousElementSibling as HTMLElement;
      if(gridEl) gridEl.style.display='';
    }
  });
  qs('.th-image-overlay')?.addEventListener('click',hideImage);
  qs('.th-image-close')?.addEventListener('click',(e:Event)=>{e.stopPropagation();hideImage();});
  __doc.addEventListener('keydown',(e:KeyboardEvent)=>{if(e.key==='Escape'){const o2=qs2('.th-modal-overlay-2');if(o2&&o2.style.display!=='none'){closeModal2();return;}closeModal();hideImage();}}, __sigOpt());

  // 全局点击关闭浮动元素
  __doc.addEventListener('click',(e:Event)=>{
    const tip=__doc.querySelector<HTMLElement>('.th-hover-tip'); if(!tip||tip.style.display==='none') return;
    if(!(e.target as HTMLElement).closest('.th-block') && !(e.target as HTMLElement).closest('.th-hover-tip')){
      tip.style.display='none';
    }
  }, __sigOpt());
}

// ================================================================
//  初始化（脚本版本：由外壳 Shell.vue 在 onMounted 时调用 setupStatusBar）
// ================================================================
// 一次性迁移：补全历史单向关联数据（A→B 存在但 B→A 缺失）。flag 防重复。
// 在 setupStatusBar 启动时调用一次。
const BIDIR_LINKS_MIGRATED_KEY = '_th_bidir_links_migrated_v1';
function migrateBidirectionalLinks(): void {
  try {
    if (localStorage.getItem(BIDIR_LINKS_MIGRATED_KEY)) return;
  } catch { return; }
  const KIND_FIELD: Record<string, 'locations'|'events'|'dlcs'> = { location:'locations', event:'events', dlc:'dlcs' };
  const TARGET_KIND: Record<string, ManagedKind> = { locations:'location', events:'event', dlcs:'dlc' };
  const managedKinds: ManagedKind[] = ['location','event','dlc'];
  // 先把三个 kind 的数据全载入内存
  for (const k of managedKinds) setCurrentManagedItems(k, getManagedItems(k));
  let changed = false;
  for (const k of managedKinds) {
    const selfField = KIND_FIELD[k];
    const items = getManagedItems(k);
    for (const [name, item] of Object.entries(items)) {
      const links = item.links || { locations:[], events:[], dlcs:[] };
      for (const field of ['locations','events','dlcs'] as const) {
        const targetKind = TARGET_KIND[field];
        const arr = links[field] || [];
        for (const targetName of arr) {
          if (targetName === name && k === targetKind) continue; // 自关联跳过
          const targetItems = getManagedItems(targetKind);
          const target = targetItems[targetName];
          if (!target) continue;
          const targetLinks = target.links || { locations:[], events:[], dlcs:[] };
          const targetArr = targetLinks[selfField] || [];
          if (!targetArr.includes(name)) {
            targetArr.push(name);
            targetLinks[selfField] = targetArr;
            addManagedItem(targetKind, targetName, { ...target, links: targetLinks });
            changed = true;
          }
        }
      }
    }
  }
  try { localStorage.setItem(BIDIR_LINKS_MIGRATED_KEY, '1'); } catch { }
  if (changed) { /* 已通过 addManagedItem 持久化 */ }
}

// 轮询定时器：startPersistentPoll 内部用 __lowPollTimer / __initPollTimer。
let __mvuOff: { destroy?: () => void } | null = null;
// 上次轮询时记录的当前消息楼层号（新聊天/新楼层检测用）
let __lastMessageId: number | null = null;
// 上次轮询 stat_data 哈希（变化检测用）
// 实际 stat_data 快照存放在 lib/variable-review 的 __reviewBaseline（深拷贝），本地只保留 hash。
let __lastStatHash: string | null = null;

function _statDataHash(data: any): string {
  try { return JSON.stringify(data); } catch(e) { void e; return ''; }
}

// 写入基线：薄包装，委托给数据层 setReviewBaseline（深拷贝快照），
// 同时刷新本地 __lastStatHash 供 poll/event 变化检测短路用。
function syncReviewBaseline(data: Record<string, any> | null | undefined): void {
  setReviewBaseline(data);
  if (data != null) __lastStatHash = _statDataHash(data);
  else __lastStatHash = null;
}

// 轮询策略：「初始化高频 + 稳定期低频兜底」。
// 设计：
//   - 初始化阶段（stat_data 尚未读到）每 INIT_POLL_MS 轮询一次，直到拿到数据或 INIT_POLL_TIMEOUT 超时。
//   - 拿到数据后切到低频兜底 LOW_POLL_MS；基线已同步时 collectStatDataChange 会 isEqual 短路，
//     所以低频 poll 在「无外部变化」时基本是 1 次 readData + 1 次 scheduleRender，性能可接受。
//   - event（VARIABLE_UPDATE_ENDED）+ 本地编辑统一采集仍是主路径。
//   - 手动刷新按钮（th-btn-refresh）走 manualRefresh() → readData + collectStatDataChange。
const INIT_POLL_MS = 500;
const INIT_POLL_TIMEOUT_MS = 15000;
const LOW_POLL_MS = 10000; // 10s 兜底

let __lowPollTimer: number | null = null;
let __initPollTimer: number | null = null;
let __initPollStartedAt: number = 0;
let __initPollDone = false;

function startPersistentPoll(): void {
  if (__lowPollTimer !== null || __initPollTimer !== null) return;

  const tick = (label: string) => {
    try {
      if (isReviewWriting()) {
        const guardedData = readData();
        if (guardedData) syncReviewBaseline(guardedData);
        scheduleRender();
        return;
      }
      const data = readData();
      if (!data) return;
      // 楼层号变化 → 新聊天/新楼层 → 清队列 + 自动同意 pending
      const h = _statDataHash(data);
      if (!h) return;
      let curMsgId: number = -1;
      try { curMsgId = (getCurrentMessageId as any)(); } catch(e) { void e; }
      if (__lastMessageId !== null && curMsgId !== __lastMessageId) {
        try { clearReviewAll(); } catch(e) { void e; }
        try { approveAllPending(); } catch(e) { void e; }
      }
      __lastMessageId = curMsgId;
      // hash 变化或基线尚未建立 → 统一采集；基线已同步时 isEqual 短路。
      if (h !== __lastStatHash || !getReviewBaseline()) {
        try { collectStatDataChange(data, { snapshot: true, label }); } catch(e) { void e; }
      }
      scheduleRender();
    } catch(e) { void e; }
  };

  // 立即跑一次不等定时器
  tick('poll:init');
  // 初始化阶段高频轮询
  __initPollStartedAt = Date.now();
  __initPollDone = false;
  const initStep = () => {
    if (__initPollDone) return;
    tick('poll:init');
    const data = (() => { try { return readData(); } catch(e) { void e; return null; } })();
    const elapsed = Date.now() - __initPollStartedAt;
    if (data && getReviewBaseline()) {
      __initPollDone = true;
      if (__initPollTimer !== null) { window.clearInterval(__initPollTimer); __initPollTimer = null; }
      // 切到低频兜底
      __lowPollTimer = window.setInterval(() => tick('poll:low'), LOW_POLL_MS);
      return;
    }
    if (elapsed >= INIT_POLL_TIMEOUT_MS) {
      __initPollDone = true;
      if (__initPollTimer !== null) { window.clearInterval(__initPollTimer); __initPollTimer = null; }
      // 超时也切到低频，避免完全失明
      __lowPollTimer = window.setInterval(() => tick('poll:low'), LOW_POLL_MS);
    }
  };
  __initPollTimer = window.setInterval(initStep, INIT_POLL_MS);
}

/**
 * 由外壳调用，在 wrapper DOM 已挂到酒馆主页面 body 后初始化状态栏行为。
 * 返回 destroy 用于卸载脚本时清理全局监听 / 定时器 / 额外创建的 DOM。
 */
export async function setupStatusBar(): Promise<{ destroy: () => void }> {
  // 重置 AbortController（多次挂载需要新的 controller）
  resetAbortController();

  // 一次性迁移：补全历史单向关联数据（flag 防重复）
  migrateBidirectionalLinks();

  // 开机即挂世界书激活监听（面板未开也持续记录最近若干轮激活）
  try { startActivationMonitor(); } catch (e) { void e; }

  // 暴露给 NPC 详情弹窗内联 onclick 调用
  const w_any = window as any;
  const p_any = (() => { try { return window.parent as any; } catch(e){ void e; return null; } })();
  w_any.__uploadTarget__ = '';
  w_any.__deleteAvatar__ = (t:string)=>{ deleteAvatar(t); };
  if (p_any && p_any !== w_any) {
    try {
      p_any.__uploadTarget__ = '';
      p_any.__deleteAvatar__ = (t:string)=>{ deleteAvatar(t); };
      p_any.__galleryTarget__ = '';
    } catch(e){ void e; }
  }

  try {
    // 正则替换环境不一定有 MVU iframe 对象；主数据读取优先依赖酒馆助手变量 API。
    if (!(window as any).Mvu) {
      try { (window as any).Mvu = getRoot().Mvu; } catch(e) { void e; }
    }
    await waitForVariableApi();
    // 解绑角色卡：不再死等本卡 stat_data（旧行为超时会 reject → 整个初始化抛错，
    // 导致换到无本卡变量的角色卡后 bindEvents/世界按钮/数据 bridge 全不挂载）。
    // 改非致命 + 短超时：给数据一点加载余地，超时也照常降级渲染，功能与世界app在任何卡都可用。
    try { await waitUntil(()=>hasStatData(activeMessageOption),150,3500); }
    catch(e){ void e; }
    // 单次读取 {type:'chat'} 变量，同时取回头像与画廊数据
    const chatVars = (() => { try { return safeGetVariables({type:'chat'}); } catch(e){ return {} as Record<string,any>; } })();
    const im = _.get(chatVars, IMG_KEY, {});
    avatarImages = im && typeof im === 'object' ? im : {};
    const g = _.get(chatVars, GALLERY_KEY, {});
    galleryImages = g && typeof g === 'object' ? g : {};
    avatarVersion++;
    avatarColorMap = {};
    const w=gw(); if(!w) throw new Error('[前端悬浮球V1] th-status-wrapper 未在主页面找到');
    w.setAttribute('data-th-id',_wrapperId);
    // 世界壳/二级弹窗脱离主面板容器：把 .th-modal-overlay-2 从 wrapper 移到父页 body，
    // 使其 position:fixed 相对视口、不被主面板的 containing block(玻璃/transform)/stacking-context 囚住裁剪。
    // 必须在 bindEvents() 之前，让关闭钮/点空白/Esc 监听绑到已 portal 的节点。
    try { portalModal2ToBody(); } catch(e){ void e; }
    // 前端悬浮球V1：读取上次保存的 NPC 筛选并应用到按钮的 active 状态
    npcFilter = loadPersistedNpcFilter();
    // 读取上次保存的 NPC 搜索文本（在 refresetH 之前，让首次 render 用正确 searchText）
    npcSearchText = loadPersistedNpcSearch();
    // 名册显示模式同样要在首次 render 前就位，否则第一帧总是极简行再被 bindEvents 改
    rosterMode = loadPersistedRosterMode();
    try {
      qsa('.th-npc-filter-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-filter') === npcFilter);
      });
    } catch(e){ void e; }
    // 同步合并后的在场/离场按钮 textContent + active
    try { applyPresenceBtn(); } catch(e){ void e; }
    // 不操作 iframe.frameElement 的 overflow——外壳 Shell.vue 直接挂在 body 上。
    // 启动时应用上次保存的外观设置(给 wrapper 加 data-* + 变量,在 render 前生效)
    try { initAppearance(); } catch(e){ console.warn('[此间天地] 外观设置应用失败',e); }
    refresetH(); bindEvents();
    // 注入审核系统依赖（getMvu + getCurrentMessageId + onWriteback 触发 scheduleRender）
    try {
      configureReview({
        getMvu,
        getCurrentMessageId: () => {
          try { return (getCurrentMessageId as any)(); } catch (e) { void e; return -1; }
        },
        onWriteback: () => { scheduleRender(); },
      });
    } catch(e) { void e; }
    // 兜底轮询（解决 Mvu 事件跨不了 iframe 的问题——脚本运行在酒馆助手 iframe 里，
    // 主页 Mvu 触发的 mag_variable_update_ended / mag_variable_initiailized / message_received
    // 事件不会自动冒泡到 iframe 内 eventOn）。
    // 轮询职责：
    //   1. stat_data 顶层 hash 比对，变化 → scheduleRender
    //   2. 新聊天/楼层号变化 → clearReviewAll + approveAllPending
    //   3. 审核/快照：统一走 collectStatDataChange()。
    //      本地编辑保存后基线已同步 → poll 调 helper 时 isEqual 短路，不重复。
    //      外部变量管理器/MVU 事件漏掉时，poll 兜底补一次。
    startPersistentPoll();
    // 事件监听（若哪天 Mvu 改成跨 iframe 派发，自动启用加速——不影响兜底）
    try{
      const localEventOn = (window as any).eventOn || getRoot().eventOn;
      const localEventOff = (window as any).eventOff || getRoot().eventOff;
      const mvu = getMvu();
      if(typeof localEventOn==='function'&&mvu?.events?.VARIABLE_UPDATE_ENDED){
        // handler 扩展——在 scheduleRender 基础上加入审核队列生成 + 异步快照保存
        // 防递归：isReviewWriting() 为 true 时早返回（replaceMvuData 写回会再次触发）
        const handler = (newVars: any, _oldVars: any) => {
          if (isReviewWriting()) { scheduleRender(); return; }
          try {
            const newData = _.get(newVars, 'stat_data', {});
            if (newData && typeof newData === 'object') {
              // 统一审核采集：helper 内部用基线作 oldData；
              // 本地编辑已同步基线 → 自动 isEqual 短路，不重复生成。
              collectStatDataChange(newData, { snapshot: true, label: 'event' });
            }
          } catch(e) { void e; }
          scheduleRender();
        };
        localEventOn(mvu.events.VARIABLE_UPDATE_ENDED, handler);
        __mvuOff = { destroy: () => {
          try {
            if (typeof localEventOff === 'function') localEventOff(mvu.events.VARIABLE_UPDATE_ENDED, handler);
          } catch(e){ void e; }
        }};
      }
      // VARIABLE_INITIALIZED 监听——新聊天初始化时清空旧队列 + 旧快照（避免跨聊天残留）
      if (typeof localEventOn === 'function' && mvu?.events?.VARIABLE_INITIALIZED) {
        const initHandler = () => {
          try { clearReviewAll(); } catch(e) { void e; }
        };
        localEventOn(mvu.events.VARIABLE_INITIALIZED, initHandler);
        const prevDestroy = __mvuOff?.destroy;
        __mvuOff = {
          destroy: () => {
            try { if (typeof localEventOff === 'function') localEventOff(mvu.events.VARIABLE_INITIALIZED, initHandler); } catch(e) { void e; }
            try { prevDestroy?.(); } catch(e) { void e; }
          }
        };
      }
      // 新楼层自动同意当前所有 pending
      if (typeof localEventOn === 'function') {
        const newMsgHandler = () => {
          try { approveAllPending(); } catch(e) { void e; }
        };
        try { localEventOn('MESSAGE_RECEIVED', newMsgHandler); } catch(e) { void e; }
        const prevDestroy = __mvuOff?.destroy;
        __mvuOff = {
          destroy: () => {
            try { if (typeof localEventOff === 'function') localEventOff('MESSAGE_RECEIVED', newMsgHandler); } catch(e) { void e; }
            try { prevDestroy?.(); } catch(e) { void e; }
          }
        };
      }
    }catch(e){ void e; }
  } catch(e) { throw e; }

  // 把数据/函数暴露到 parent window，让 Shell.vue 能访问
  getRoot().__thStatusBarData = {
    getCurrentData: () => currentData,
    getAvatarImages: () => avatarImages,
    showItemsHoverTip,
    showSkillsHoverTip,
    showHoverTip,
    hideHoverTip,
    openUserBag,
    openUserSkill,
    openAttrModal,
    openModal,
    getUser,
    getUserKey,
    getUN,
    buildAttrBarHtml,
    isEditMode: () => isEditMode,
    editableTextarea,
    esc,
    bindBlockHoverAndClick
  };

  return {
    destroy: () => {
      try { getAbortController().abort(); } catch(e){ void e; }
      if (__lowPollTimer !== null) { try { window.clearInterval(__lowPollTimer); } catch(e){ void e; } __lowPollTimer = null; }
      if (__initPollTimer !== null) { try { window.clearInterval(__initPollTimer); } catch(e){ void e; } __initPollTimer = null; }
      try { __mvuOff?.destroy?.(); } catch(e){ void e; }
      __mvuOff = null;
      // 清理 body 上额外创建的浮动元素（已抽至 hover-tip，由模块自回收）
      try { destroyHoverTips(); } catch(e){ void e; }
      // 回收 portal 到父页 body 的世界壳/二级 modal overlay（按 _wrapperId 归属，避免多次挂载堆叠）
      try { removePortaledModal2(); } catch(e){ void e; }
      try { stopActivationMonitor(); } catch(e){ void e; }
      try { stopPhoneClock(); } catch(e){ void e; }
      // 父页上的桥与原型拦截器必须撤掉：留着会让父页持有整个 iframe 模块图
      try { delete (getRoot() as any).__thStatusBarData; } catch(e){ void e; }
      try { disposeWorldAppBridge(); } catch(e){ void e; }
      try {
        const pw = (() => { try { return window.parent as any; } catch(e){ void e; return null; } })();
        for (const w of [window as any, pw]) {
          if (!w) continue;
          try { delete w.__deleteAvatar__; delete w.__uploadTarget__; delete w.__galleryTarget__; delete w.__galleryDisplay__; } catch(e){ void e; }
        }
      } catch(e){ void e; }
      try { __faStripRestore?.(); } catch(e){ void e; }
    },
  };
}
