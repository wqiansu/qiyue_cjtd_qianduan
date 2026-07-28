import './status-bar.css';

// ================================================================
function getRoot(): any {
  try {
    const parentWindow = window.parent as any;
    if(parentWindow&&parentWindow!==window) return parentWindow;
  } catch(e) { void e; }
  return window as any;
}

function getHelper(): any {
  return (window as any).TavernHelper || getRoot().TavernHelper || {};
}

function getMvu(): any {
  return (window as any).Mvu || getRoot().Mvu;
}

function hasVariableApi(): boolean {
  return typeof (window as any).getVariables === 'function' || typeof getHelper().getVariables === 'function';
}

function safeGetVariables(option: any): Record<string,any> {
  const localGet = (window as any).getVariables;
  if(typeof localGet==='function') return localGet(option);
  const helperGet = getHelper().getVariables;
  if(typeof helperGet==='function') return helperGet(option);
  throw new Error('getVariables is not available');
}

function safeUpdateVariablesWith(updater: (variables: Record<string,any>) => Record<string,any>, option: any) {
  const localUpdate = (window as any).updateVariablesWith;
  if(typeof localUpdate==='function') return localUpdate(updater, option);
  const helperUpdate = getHelper().updateVariablesWith;
  if(typeof helperUpdate==='function') return helperUpdate(updater, option);
  throw new Error('updateVariablesWith is not available');
}

function safeTriggerSlash(command: string) {
  const localTrigger = (window as any).triggerSlash;
  if(typeof localTrigger==='function') return localTrigger(command);
  const helperTrigger = getHelper().triggerSlash;
  if(typeof helperTrigger==='function') return helperTrigger(command);
}

function safeGetCharWorldbookNames(characterName: 'current'): CharWorldbooks {
  const localGet = (window as any).getCharWorldbookNames;
  if(typeof localGet==='function') return localGet(characterName);
  const helperGet = getHelper().getCharWorldbookNames;
  if(typeof helperGet==='function') return helperGet(characterName);
  throw new Error('getCharWorldbookNames is not available');
}

async function safeGetWorldbook(worldbookName: string): Promise<WorldbookEntry[]> {
  const localGet = (window as any).getWorldbook;
  if(typeof localGet==='function') return localGet(worldbookName);
  const helperGet = getHelper().getWorldbook;
  if(typeof helperGet==='function') return helperGet(worldbookName);
  throw new Error('getWorldbook is not available');
}

async function safeUpdateWorldbookWith(worldbookName: string, updater: WorldbookUpdater, options?: ReplaceWorldbookOptions): Promise<WorldbookEntry[]> {
  const localUpdate = (window as any).updateWorldbookWith;
  if(typeof localUpdate==='function') return localUpdate(worldbookName, updater, options);
  const helperUpdate = getHelper().updateWorldbookWith;
  if(typeof helperUpdate==='function') return helperUpdate(worldbookName, updater, options);
  throw new Error('updateWorldbookWith is not available');
}

async function waitForVariableApi() {
  if(hasVariableApi()) return;
  await waitUntil(()=>hasVariableApi(), 150, 15000);
}

function waitUntil(check: () => boolean, interval = 300, timeout = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const t = setInterval(() => {
      try { if (check()) { clearInterval(t); resolve(); } else if (Date.now()-start>timeout) { clearInterval(t); reject(new Error('timeout')); } }
      catch (e) { if (Date.now()-start>timeout) { clearInterval(t); reject(new Error('timeout')); } }
    }, interval);
  });
}

// ================================================================
//  配置
// ================================================================
const ATTR_KEYS = ['实力','魅力','智慧','专注','学识','交流','文艺','经营','手工','家务'] as const;
const ATTR_MAX = 300;
const ATTR_CLS: Record<string,string> = {
  实力:'attr-type-power',魅力:'attr-type-charm',智慧:'attr-type-wisdom',专注:'attr-type-focus',
  学识:'attr-type-knowledge',交流:'attr-type-social',文艺:'attr-type-art',经营:'attr-type-business',
  手工:'attr-type-craft',家务:'attr-type-housework',
};
const NPC_METRICS = [
  {key:'心动值',icon:'fa-solid fa-heart',cls:'heart'},
  {key:'情欲值',icon:'fa-solid fa-fire-flame-curved',cls:'lust'},
  {key:'兴奋值',icon:'fa-solid fa-sparkles',cls:'excite'},
  {key:'敏感值',icon:'fa-solid fa-water',cls:'sense'},
  {key:'羞耻值',icon:'fa-solid fa-face-grin-wide',cls:'shame'},
] as const;
const NPC_COUNTS = [
  {key:'高潮次数',icon:'fa-solid fa-sparkles'},
  {key:'被内射次数',icon:'fa-solid fa-droplet'},
] as const;
const NPC_ICON_CFG = [
  {key:'内心想法',icon:'fa-solid fa-comment',label:'内心想法'},
  {key:'当前本能渴望',icon:'fa-solid fa-crosshairs',label:'本能渴望'},
  {key:'姿态动作',icon:'fa-solid fa-child-reaching',label:'姿态动作'},
  {key:'身体状态',icon:'fa-solid fa-hand-holding-heart',label:'身体状态'},
  {key:'基础外貌',icon:'fa-solid fa-eye',label:'基础外貌'},
] as const;
const AVATAR_COLORS = ['#e891b9','#b89ae0','#8bb8d6','#8ec5a4','#f0b878','#d088a8','#9898d0','#68b0c8','#68b898','#e8a860'];
// 需求6：额外属性颜色集合（淡粉/糖果色系）
const EXTRA_ATTR_COLORS = [
  'linear-gradient(90deg,#f0a0b8,#f5c0d8)',
  'linear-gradient(90deg,#e8a0c0,#f0c8e0)',
  'linear-gradient(90deg,#f5b0c0,#fad0e0)',
  'linear-gradient(90deg,#e898b0,#f5b8d0)',
  'linear-gradient(90deg,#f0a8c8,#f8d0e0)',
  'linear-gradient(90deg,#f2b0c8,#f8d0d8)',
];
function pickExtraAttrColor(idx: number): string {
  return EXTRA_ATTR_COLORS[idx % EXTRA_ATTR_COLORS.length];
}

// ================================================================
//  需求1：地点/事件数据（localStorage 覆盖）
// ================================================================
type ManagedKind = 'location'|'event';
type ManagedEntryState = { bound: boolean; enabled: boolean; count: number; enabledCount: number; worldbookNames: string[] };
type InspectorEntry = { worldbookName:string; entry:WorldbookEntry; managedKind:ManagedKind|null; managedName:string };
const MANAGED_CFG: Record<ManagedKind,{prefix:string;label:string;storageName:string;icon:string;storageKey:string}> = {
  location: { prefix:'[地点]', label:'地点', storageName:'地点总览', icon:'fa-solid fa-map-pin', storageKey:'_th_locations_v2' },
  event: { prefix:'[事件]', label:'事件', storageName:'事件总览', icon:'fa-solid fa-flag', storageKey:'_th_events_v1' },
};
let managedEntryStates: Record<ManagedKind,Record<string,ManagedEntryState>> = { location:{}, event:{} };
let currentManagedItems: Record<ManagedKind,Record<string,string>> = { location:{}, event:{} };

function loadManagedItems(key:string): Record<string,string> {
  const result: Record<string,string> = {};
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const overrides = JSON.parse(raw) as Record<string,any>;
      if (overrides.added && typeof overrides.added === 'object') Object.assign(result, overrides.added);
    }
  } catch(e) { void e; }
  return result;
}
function saveManagedOverrides(kind:ManagedKind) {
  const current = currentManagedItems[kind];
  try { localStorage.setItem(MANAGED_CFG[kind].storageKey, JSON.stringify({ added: current, deleted: [] })); } catch(e) { void e; }
}
function getManagedItems(kind:ManagedKind): Record<string,string> { return loadManagedItems(MANAGED_CFG[kind].storageKey); }
function setCurrentManagedItems(kind:ManagedKind, items:Record<string,string>) { currentManagedItems[kind] = items; }
function addManagedItem(kind:ManagedKind, name:string, desc:string) { currentManagedItems[kind][name] = desc; saveManagedOverrides(kind); }
function deleteManagedItem(kind:ManagedKind, name:string) { delete currentManagedItems[kind][name]; saveManagedOverrides(kind); }
function getCurrentManagedItems(kind:ManagedKind): Record<string,string> { return currentManagedItems[kind]; }

// ================================================================
//  状态
// ================================================================
let currentData: Record<string,any>|null = null;
let avatarColorMap: Record<string,string> = {};
let avatarImages: Record<string,string> = {};
let avatarVersion = 0;
let uploadingTarget = '';
let isDarkMode = false;
let isEditMode = false;
let npcFilter: 'all'|'present'|'absent' = 'all'; // 需求9：NPC在场筛选

const _wrapperId = 'th-status-'+Math.random().toString(36).slice(2,8);
let _wrapperEl: HTMLElement|null = null;
function gw(): HTMLElement|null {
  if(_wrapperEl?.isConnected) return _wrapperEl;
  _wrapperEl = document.querySelector('.th-status-wrapper[data-th-id="'+_wrapperId+'"]')||document.querySelector('.th-status-wrapper');
  return _wrapperEl;
}
function qs<T extends HTMLElement>(s:string): T|null { const w=gw(); return w?w.querySelector<T>(s):null; }
function qsa<T extends HTMLElement>(s:string): NodeListOf<T> { const w=gw(); return w?w.querySelectorAll<T>(s):([] as any); }
function setH(s:string,h:string) { const el=qs(s); if(el)el.innerHTML=h; }
function setT(s:string,t:string) { const el=qs(s); if(el)el.textContent=t; }
function clamp(v:number,a:number,b:number) { return Math.max(a,Math.min(b,v)); }
function attrPct(v:number) { return clamp(Math.round(v*100/ATTR_MAX),0,100); }

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
  return currentData;
}
function saveData(d:Record<string,any>) {
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
function refresetH() { currentData=readData(); if(currentData) render(currentData); }
// 内部状态已被本地修改（保存链路、按钮触发、筛选切换等），直接用 currentData 重新渲染。
// 显式清掉 _renderCache 强制全量重绘，避免在保存链路中再做稳定的 JSON.stringify 比较。
function renderCurrent() { if(currentData) { clearRenderCache(); render(currentData); } }
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
function loadImages(): Record<string,string> { try { const s=safeGetVariables({type:'chat'}); const im=_.get(s,IMG_KEY,{}); return im&&typeof im==='object'?im:{}; } catch(e){ return{}; } }
function saveImages() { try { avatarVersion++; clearRenderCache(); safeUpdateVariablesWith(v=>{_.set(v,IMG_KEY,avatarImages); return v;},{type:'chat'}); } catch(e){ void e; } }
// 需求6：画廊存储
let galleryImages: Record<string,string[]> = {};
function loadGallery(): Record<string,string[]> { try { const s=safeGetVariables({type:'chat'}); const g=_.get(s,GALLERY_KEY,{}); return g&&typeof g==='object'?g:{}; } catch(e){ return{}; } }
function saveGallery() { try { safeUpdateVariablesWith(v=>{_.set(v,GALLERY_KEY,galleryImages); return v;},{type:'chat'}); } catch(e){ void e; } }
function getNPCGallery(npcName:string): string[] { return galleryImages[npcName]||[]; }
function addNPCGalleryImage(npcName:string, dataUrl:string) { if(!galleryImages[npcName]) galleryImages[npcName]=[]; galleryImages[npcName].push(dataUrl); saveGallery(); }
function deleteNPCGalleryImage(npcName:string, idx:number) { if(!galleryImages[npcName]) return; galleryImages[npcName].splice(idx,1); saveGallery(); }

const DOLLAR_KEY = String.fromCharCode(36);
const MACRO_L = String.fromCharCode(123,123);
const MACRO_R = String.fromCharCode(125,125);
const ANGLE_USER_KEY = [60,117,115,101,114,62].map(code=>String.fromCharCode(code)).join('');
function tavernMacro(name:string): string { return MACRO_L+name+MACRO_R; }
const SK=['世界信息','NPC','_',DOLLAR_KEY];
function isUserPlaceholderKey(key:string): boolean {
  return key===tavernMacro('user')||key===ANGLE_USER_KEY||key==='user';
}
function getUserCandidateKeys(d:Record<string,any>): string[] {
  return Object.keys(d).filter(k=>!SK.includes(k)&&!k.startsWith('_')&&!k.startsWith(DOLLAR_KEY)&&d[k]&&typeof d[k]==='object'&&d[k]['属性']);
}
function getUK(d:Record<string,any>): string|null {
  const keys=getUserCandidateKeys(d);
  return keys.find(k=>!isUserPlaceholderKey(k))||keys[0]||null;
}
function getUser(d:Record<string,any>): Record<string,any> { const k=getUK(d); return k?d[k] as Record<string,any>:(_.get(d,tavernMacro('user'),{})||{}); }
function setUser(d:Record<string,any>,ud:Record<string,any>) { const k=getUK(d); if(k)d[k]=ud; else _.set(d,tavernMacro('user'),ud); }
function getNPCs(d:Record<string,any>) { const n=_.get(d,'NPC',{})||{}; return Object.entries(n).map(([k,v])=>({name:k,info:v as Record<string,any>})); }
function getNPCInfo(d:Record<string,any>|null, npcName:string): Record<string,any>|null {
  if(!d||!npcName) return null;
  const npcs=_.get(d,'NPC',{})||{};
  const info=npcs[npcName];
  return info&&typeof info==='object'?info as Record<string,any>:null;
}

// 需求7：NPC排序 — 在场优先，在场内按仙主顺序，不在场内按首字母
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

// 需求7：切换NPC在场状态
function toggleNpcPresence(npcName:string) {
  if(!currentData) return;
  const npcs=_.get(currentData,'NPC',{})||{};
  const npc=npcs[npcName];
  if(!npc) return;
  const current=_.get(npc,'是否在场',false);
  _.set(npc,'是否在场',!current);
  _.set(currentData,'NPC',npcs);
  saveData(currentData);
  renderCurrent();
}
function getWorld(d:Record<string,any>) { return _.get(d,'世界信息',{})||{}; }
function getUN(d:Record<string,any>) { return getUK(d)||'主角'; }
/** 返回玩家数据的实际 key（用于编辑路径构造） */
function getUserKey(d:Record<string,any>): string { return getUK(d)||tavernMacro('user'); }

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

  const npcKey = stableRenderKey({ data:_.get(data,'NPC',{}), filter:npcFilter, avatarVersion });
  if(npcKey!==_renderCache.npc){ _renderCache.npc=npcKey; renderNPCGrid(data); }
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
  // 需求9：仅更新日期/时间/天气，不覆盖NPC筛选按钮
  setH('.th-world-date', `<i class="fa-solid fa-calendar-days"></i> ${isEditMode?editableInput(w['日期']||'','世界信息.日期'):esc(date)}`);
  setH('.th-world-time', `<i class="${timeIcon}"></i> ${isEditMode?editableInput(w['时间']||'','世界信息.时间'):esc(time)}`);
  setH('.th-world-weather', `<i class="fa-solid fa-cloud-sun"></i> ${isEditMode?editableInput(w['天气']||'','世界信息.天气'):esc(weather)}`);
}

// ================================================================
//  User 面板
// ================================================================
function renderUserPanel(data:Record<string,any>) {
  const u=getUser(data); if(!u) return;
  const uname=getUN(data);
  const ukey=getUserKey(data);
  setH('.th-user-name-display', isEditMode?editableInput(uname,`${ukey}.名称`):esc(uname));
  const world=getWorld(data);
  const locHtml = isEditMode
    ? `${esc(world['当前所处区域名称']||'未知区域')} · ${editableInput(u['位置']||'未知地点',`${ukey}.位置`)}`
    : `${esc(world['当前所处区域名称']||'未知区域')} · ${esc(u['位置']||'未知地点')}`;
  setH('.th-user-hero-info .th-location-text', `<i class="fa-solid fa-map-pin"></i> ${locHtml}`);
  setH('.th-money-text', isEditMode ? editableInput(`${_.get(u,'货币.金钱',0)}`,`${ukey}.货币.金钱`,'number') : esc(`${_.get(u,'货币.金钱',0)}`));
  // 需求1：迷你背包+技能按钮替换好感总览
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
//  需求1：迷你背包+技能按钮（替换好感总览）
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
  // 需求6：悬停显示全部物品/技能详情（与NPC一致）
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
//  需求4：User 姿态+身体 hover显示+click弹详情
// ================================================================
function renderUserPB(user:Record<string,any>, ukey:string) {
  const posture=user['姿态动作']||'暂无动作';
  const bodyState=user['身体状态']||'暂无描述';
  // 给按钮绑上 data 属性供 hover/click 使用
  const pb=qs('.th-pb-posture'); if(pb) { pb.setAttribute('data-pb-text',escAttr(posture)); pb.setAttribute('data-pb-path',`${ukey}.姿态动作`); }
  const bb=qs('.th-pb-body'); if(bb) { bb.setAttribute('data-pb-text',escAttr(bodyState)); bb.setAttribute('data-pb-path',`${ukey}.身体状态`); }
}

// ================================================================
//  需求3：状态方块（hover浮窗 + click弹详情）
// ================================================================
function renderStatusBlocks(user:Record<string,any>, ukey:string) {
  const c=qs('.th-status-blocks'); if(!c) return;
  const st=_.get(user,'状态',{})||{}; const entries=Object.entries(st);
  setT('.th-section-count',entries.length?`${entries.length}`:'');
  const addBlock=`<span class="th-block th-block-add" data-add-trigger="status" data-add-base="${escAttr(ukey)}.状态" data-add-owner="${escAttr(getUN(currentData||{}))}"><i class="fa-solid fa-plus"></i> 新增状态</span>`;
  c.innerHTML=(entries.length?entries.map(([n,info]:[string,any])=>{
    const eff=info?.['效果']||''; const src=info?.['来源']||''; const dur=info?.['持续时间']||'';
    const dotCls=getDotCls(eff);
    return `<span class="th-block th-block-status" data-btype="status" data-bname="${escAttr(n)}" data-beffect="${escAttr(eff)}" data-bsource="${escAttr(src)}" data-bduration="${escAttr(dur)}" data-bpath="${escAttr(ukey)}.状态.${escAttr(n)}"><span class="th-tag-dot ${dotCls}"></span> ${esc(n)}</span>`;
  }).join(''):'<span class="th-empty" style="padding:8px 0">暂无状态</span>')+addBlock;
  bindBlockHoverAndClick(c, 'status');
}
function bindBlockHoverAndClick(container:HTMLElement, type:string) {
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
      openClothingDetailModal(n,part,state,detail,path);
    }
  });
}

// ================================================================
//  需求3：穿着方块（hover浮窗 + click弹详情）
// ================================================================
function renderClothingBlocks(user:Record<string,any>, ukey:string) {
  const c=qs('.th-clothing-blocks'); if(!c) return;
  const cl=_.get(user,'当前穿着衣物',{})||{}; const entries=Object.entries(cl);
  const addBlock=`<span class="th-block th-block-add" data-add-trigger="clothing" data-add-base="${escAttr(ukey)}.当前穿着衣物" data-add-owner="${escAttr(getUN(currentData||{}))}"><i class="fa-solid fa-plus"></i> 新增衣物</span>`;
  c.innerHTML=(entries.length?entries.map(([n,info]:[string,any])=>{
    const part=info?.['穿着部位']||''; const state=info?.['衣物状态']||'';
    const detail=info?.['外观详情']||'';
    const dotCls=getDotCls(state);
    return `<span class="th-block th-block-clothing" data-btype="clothing" data-bname="${escAttr(n)}" data-bpart="${escAttr(part)}" data-bstate="${escAttr(state)}" data-bdetail="${escAttr(detail)}" data-bpath="${escAttr(ukey)}.当前穿着衣物.${escAttr(n)}"><i class="fa-solid fa-vest"></i> ${esc(n)} · ${esc(part)} <span class="th-tag-dot ${dotCls}"></span></span>`;
  }).join(''):'<span class="th-empty" style="padding:8px 0">暂无穿着</span>')+addBlock;
  bindBlockHoverAndClick(c, 'clothing');
}

// ================================================================
//  悬停浮窗系统
// ================================================================
let hoverTimeout: ReturnType<typeof setTimeout>|null = null;
function showHoverTip(anchor:HTMLElement, type:string, data:Record<string,string>) {
  if(hoverTimeout) clearTimeout(hoverTimeout);
  const tip=qs('.th-hover-tip'); if(!tip) return;
  // 使用 will-change 提示浏览器优化
  (tip as HTMLElement).style.willChange = 'transform, opacity';
  let html='';
  let typeClass = '';
  if(type==='status'){
    typeClass = 'th-hover-tip-gear';
    html=`<div class="th-gear-card"><div class="th-gear-name"><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--lav);font-size:12px"></i> ${esc(data.name)}</div><div class="th-gear-detail">${esc(data.effect)}</div>`;
    if(data.source||data.duration){
      html+=`<div class="th-gear-meta">`;
      if(data.source) html+=`<div style="margin-bottom:3px"><i class="fa-solid fa-tag"></i> 来源: ${esc(data.source)}</div>`;
      if(data.duration) html+=`<div><i class="fa-solid fa-clock"></i> 持续: ${esc(data.duration)}</div>`;
      html+=`</div>`;
    }
    html+=`</div>`;
  } else if(type==='clothing'){
    typeClass = 'th-hover-tip-single-clothing';
    const st=(data.state||'').toLowerCase();
    let stateCls='neutral'; let stateIcon='fa-solid fa-circle';
    if(st.includes('破损')||st.includes('破')||st.includes('撕裂')){ stateCls='bad'; stateIcon='fa-solid fa-triangle-exclamation'; }
    else if(st.includes('湿')||st.includes('脏')||st.includes('乱')){ stateCls='warn'; stateIcon='fa-solid fa-droplet'; }
    else if(st.includes('新')||st.includes('干净')||st.includes('整洁')){ stateCls='good'; stateIcon='fa-solid fa-check'; }
    html=`<div class="th-single-clothing-header"><div class="th-single-clothing-icon"><i class="fa-solid fa-vest"></i></div><div><div class="th-single-clothing-title">${esc(data.name)}</div>`;
    if(data.part) html+=`<div class="th-single-clothing-part"><i class="fa-solid fa-location-dot"></i> ${esc(data.part)}</div>`;
    html+=`</div></div>`;
    if(st) html+=`<span class="th-clothing-state ${stateCls}"><i class="${stateIcon}"></i> ${esc(st)}</span>`;
    if(data.detail) html+=`<div class="th-single-clothing-detail">${esc(data.detail)}</div>`;
  } else if(type==='identity'){
    html=`<div class="th-hover-tip-title"><i class="fa-solid fa-crown"></i> ${esc(data.name)}</div><div>${esc(data.identity)}</div>`;
  } else if(type==='icon'){
    html=`<div class="th-hover-tip-title"><i class="${esc(data.icon||'')}"></i> ${esc(data.label||'')}</div><div>${esc(data.content||'')}</div>`;
  } else if(type==='attr'){
    html=`<div class="th-hover-tip-title"><i class="fa-solid fa-chart-pie"></i> ${esc(data.name)} · 属性</div>${data.html||''}`;
  } else if(type==='pb'){
    html=`<div class="th-hover-tip-title"><i class="${esc(data.icon||'')}"></i> ${esc(data.label||'')}</div><div style="font-size:13px;line-height:1.7">${esc(data.content||'')}</div>`;
  } else if(type==='counts'){
    html=`<div class="th-hover-tip-title"><i class="fa-solid fa-heart-circle-plus"></i> 亲密记录</div><div class="th-hover-tip-row"><i class="fa-solid fa-sparkles"></i> 高潮次数: <b>${esc(data.orgasm||'0')}</b></div><div class="th-hover-tip-row"><i class="fa-solid fa-water"></i> 被内射次数: <b>${esc(data.creampie||'0')}</b></div>`;
  }
  // 批量设置，先内容后定位，最后显示，避免首次显示时在左上角闪现
  const maxW = type==='clothing'?320:(type==='pb'?350:(type==='attr'?420:260));
  tip.className = 'th-hover-tip ' + (typeClass || ('th-hover-tip-'+type));
  tip.innerHTML=html;
  positionHoverTip(tip,anchor,maxW);
}
function hideHoverTip() {
  hoverTimeout=setTimeout(()=>{
    hideHoverTipNow();
  },140);
}
function hideHoverTipNow() {
  if(hoverTimeout) { clearTimeout(hoverTimeout); hoverTimeout=null; }
  const tip=qs('.th-hover-tip'); if(!tip) return;
  tip.style.display='none';
  tip.className = 'th-hover-tip';
  (tip as HTMLElement).style.willChange = '';
}
// 浮窗自身保持
document.addEventListener('mouseover',(e:Event)=>{
  const tip=qs('.th-hover-tip'); if(!tip||tip.style.display==='none') return;
  if((e.target as HTMLElement).closest('.th-hover-tip')){
    if(hoverTimeout) clearTimeout(hoverTimeout);
  }
});

// ================================================================
//  需求3：背包全量详情悬停
// ================================================================
function showItemsHoverTip(anchor:HTMLElement, items:Record<string,any>, label:string) {
  if(hoverTimeout) clearTimeout(hoverTimeout);
  const tip=qs('.th-hover-tip'); if(!tip) return;
  const entries=Object.entries(items);
  let html=`<div class="th-hover-tip-title"><i class="fa-solid fa-box-open"></i> ${label} (${entries.length})</div>`;
  if(!entries.length){ html+='<div style="font-size:12px;color:var(--tx3)">空空如也~</div>'; }
  else {
    for(const[n,it] of entries){
      const cnt=it?.['数量']??1;
      const desc=it?.['简介']||'';
      const eff=it?.['效果']||'';
      html+=`<div class="th-hover-item-entry"><div class="th-hover-item-name">${esc(n)} <span style="font-size:11px;color:var(--pink)">x${cnt}</span></div>`;
      if(desc) html+=`<div class="th-hover-item-desc">${esc(desc)}</div>`;
      if(eff) html+=`<div class="th-hover-item-meta"><i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(eff)}</div>`;
      html+=`</div>`;
    }
  }
  tip.innerHTML=html; tip.classList.add('th-hover-tip-full');
  positionHoverTip(tip,anchor,400);
}
function showSkillsHoverTip(anchor:HTMLElement, skills:Record<string,any>, label:string) {
  if(hoverTimeout) clearTimeout(hoverTimeout);
  const tip=qs('.th-hover-tip'); if(!tip) return;
  const entries=Object.entries(skills);
  let html=`<div class="th-hover-tip-title"><i class="fa-solid fa-scroll"></i> ${label} (${entries.length})</div>`;
  if(!entries.length){ html+='<div style="font-size:12px;color:var(--tx3)">尚未习得~</div>'; }
  else {
    for(const[n,sk] of entries){
      const lv=sk?.['等级']??1;
      const desc=sk?.['简介']||'';
      const eff=sk?.['效果']||'';
      html+=`<div class="th-hover-item-entry"><div class="th-hover-item-name">${esc(n)} <span style="font-size:11px;color:var(--lav)">Lv${lv}</span></div>`;
      if(desc) html+=`<div class="th-hover-item-desc">${esc(desc)}</div>`;
      if(eff) html+=`<div class="th-hover-item-meta"><i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(eff)}</div>`;
      html+=`</div>`;
    }
  }
  tip.innerHTML=html; tip.classList.add('th-hover-tip-full');
  positionHoverTip(tip,anchor,400);
}
// 需求7：衣物全量悬停 — 新设计：甜美糖果衣橱列表
const _clothingHoverCache = new Map<string,string>();
function getClothingCacheKey(clothing:Record<string,any>): string {
  // 用衣物名称+状态拼接做轻量缓存key
  return Object.entries(clothing).map(([n,cl])=>n+':'+(cl as any)?.['衣物状态']).join('|');
}
function showClothingHoverTip(anchor:HTMLElement, clothing:Record<string,any>) {
  if(hoverTimeout) clearTimeout(hoverTimeout);
  const tip=qs('.th-hover-tip'); if(!tip) return;
  // 清理旧类型类
  tip.className = 'th-hover-tip';
  const cacheKey = getClothingCacheKey(clothing);
  let html = _clothingHoverCache.get(cacheKey);
  if(!html){
    html = buildClothingHoverHtml(clothing);
    _clothingHoverCache.set(cacheKey, html);
    // 限制缓存大小
    if(_clothingHoverCache.size > 50) { const first = _clothingHoverCache.keys().next().value; if(first!==undefined) _clothingHoverCache.delete(first); }
  }
  tip.innerHTML=html;
  tip.classList.add('th-hover-tip-clothing-new');
  positionHoverTip(tip,anchor,620);
}
function buildClothingHoverHtml(clothing:Record<string,any>): string {
  const entries=Object.entries(clothing);
  let html=`<div class="th-clothing-hover-header"><i class="fa-solid fa-vest"></i> 当前穿着 <span class="th-clothing-hover-count">${entries.length} 件</span></div>`;
  if(!entries.length){ html+='<div style="font-size:12px;color:var(--tx3);text-align:center;padding:16px">暂无穿着 ~</div>'; }
  else {
    html+=`<div class="th-clothing-list">`;
    for(const[n,cl] of entries){
      const c=cl as any;
      const part=c?.['穿着部位']||'';
      const state=(c?.['衣物状态']||'').toLowerCase();
      const detail=c?.['外观详情']||'';
      let stateCls='neutral'; let stateIcon='fa-solid fa-circle';
      if(state.includes('破损')||state.includes('破')||state.includes('撕裂')){ stateCls='bad'; stateIcon='fa-solid fa-triangle-exclamation'; }
      else if(state.includes('湿')||state.includes('脏')||state.includes('乱')){ stateCls='warn'; stateIcon='fa-solid fa-droplet'; }
      else if(state.includes('新')||state.includes('干净')||state.includes('整洁')){ stateCls='good'; stateIcon='fa-solid fa-check'; }
      html+=`<div class="th-clothing-card">`;
      html+=`<div class="th-clothing-icon"><i class="fa-solid fa-vest"></i></div>`;
      html+=`<div class="th-clothing-info">`;
      html+=`<div class="th-clothing-name">${esc(n)}</div>`;
      if(part) html+=`<div class="th-clothing-part"><i class="fa-solid fa-location-dot"></i> ${esc(part)}</div>`;
      if(state) html+=`<span class="th-clothing-state ${stateCls}"><i class="${stateIcon}"></i> ${esc(state)}</span>`;
      if(detail) html+=`<div class="th-clothing-detail">${esc(detail)}</div>`;
      html+=`</div></div>`;
    }
    html+=`</div>`;
  }
  return html;
}
// 需求6：NPC状态悬停（装备卡片风格）
function showNpcStatusHover(anchor:HTMLElement, statuses:Record<string,any>, npcName:string) {
  if(hoverTimeout) clearTimeout(hoverTimeout);
  const tip=qs('.th-hover-tip'); if(!tip) return;
  // 彻底清理旧类型类，避免样式残留
  tip.className = 'th-hover-tip';
  const entries=Object.entries(statuses);
  let html=`<div class="th-hover-tip-title"><i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(npcName)} · 当前状态 (${entries.length})</div>`;
  if(!entries.length){ html+='<div style="font-size:12px;color:var(--tx3);text-align:center;padding:8px">暂无状态</div>'; }
  else {
    for(const[sn,si] of entries){
      const s=si as any;
      const eff=s?.['效果']||''; const src=s?.['来源']||''; const dur=s?.['持续时间']||'';
      html+=`<div class="th-gear-card">`;
      html+=`<div class="th-gear-name"><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--lav);font-size:11px"></i> ${esc(sn)}</div>`;
      if(eff) html+=`<div class="th-gear-detail">${esc(eff)}</div>`;
      if(src||dur){
        html+=`<div class="th-gear-meta">`;
        if(src) html+=`<div style="margin-bottom:3px"><i class="fa-solid fa-tag"></i> 来源: ${esc(src)}</div>`;
        if(dur) html+=`<div><i class="fa-solid fa-clock"></i> 持续: ${esc(dur)}</div>`;
        html+=`</div>`;
      }
      html+=`</div>`;
    }
  }
  tip.innerHTML=html; tip.classList.add('th-hover-tip-gear');
  positionHoverTip(tip,anchor,400);
}

function positionHoverTip(tip:HTMLElement, anchor:HTMLElement, maxW:number) {
  const rect=anchor.getBoundingClientRect();
  const pad=12;
  let left=rect.right+pad; let top=rect.top;
  // 水平边界：优先右侧，放不下则左侧，左侧也放不下则贴右边缘
  if(left+maxW>window.innerWidth-pad){
    left=rect.left-(maxW+pad);
    if(left<pad){
      left=Math.max(pad,window.innerWidth-maxW-pad);
    }
  }
  tip.style.visibility='hidden';
  tip.style.display='block';
  tip.style.left='0';
  tip.style.top='0';
  tip.style.maxWidth=maxW+'px';
  tip.style.transform=`translate3d(${left}px, ${top}px, 0)`;
  const tipRect=tip.getBoundingClientRect();
  const tipHeight=tipRect.height;
  if(top+tipHeight>window.innerHeight-pad){
    top=Math.max(pad,window.innerHeight-tipHeight-pad);
  }
  const aboveTop=rect.top-tipHeight-pad;
  if(top+tipHeight>rect.top && rect.top-top<tipHeight && aboveTop>=pad){
    top=aboveTop;
  }
  tip.style.transform=`translate3d(${left}px, ${top}px, 0)`;
  tip.style.visibility='visible';
}

// ================================================================
//  需求1修订：NPC 轮盘（头像hover五维 — 使用对象池避免频繁DOM创建）
// ================================================================
let wheelEl: HTMLElement|null = null;
let wheelItems: HTMLElement[] = [];
function ensureWheelPool() {
  if (!wheelEl) {
    wheelEl = document.createElement('div');
    wheelEl.className = 'th-npc-metric-wheel';
    for (let i = 0; i < NPC_METRICS.length; i++) {
      const item = document.createElement('div');
      item.className = 'th-wheel-item-cascade';
      wheelEl.appendChild(item);
      wheelItems.push(item);
    }
    document.body.appendChild(wheelEl);
  }
}
function showMetricWheel(anchor:HTMLElement, npcInfo:Record<string,any>) {
  ensureWheelPool();
  if (!wheelEl) return;

  const rect=anchor.getBoundingClientRect();
  const baseX=rect.right+8;
  const itemHeight=32;
  const totalHeight=(NPC_METRICS.length-1)*itemHeight;
  const baseY=rect.top+rect.height/2-totalHeight/2;
  const barWidth=120;

  NPC_METRICS.forEach((m,i)=>{
    const item = wheelItems[i];
    const v=clamp(Number(npcInfo[m.key])||0,0,100);
    item.innerHTML = `<span style="font-size:11px"><i class="${m.icon}"></i></span><span class="th-wheel-label-cascade">${m.key}</span><div class="th-wheel-bar-cascade"><div class="th-wheel-fill-cascade ${m.cls}" style="width:${v}%"></div></div><span class="th-wheel-val-cascade">${v}</span>`;
    item.style.position='fixed';
    const staggerOffset=i*10;
    item.style.left=(baseX+staggerOffset)+'px';
    item.style.top=(baseY+i*itemHeight)+'px';
    item.style.minWidth=barWidth+'px';
    item.style.display = 'flex';
  });

  wheelEl.style.display = 'block';
}
function hideMetricWheel() {
  if(wheelEl){ wheelEl.style.display = 'none'; }
}

// ================================================================
//  状态详情弹窗（需求3+需求9：编辑支持）
// ================================================================
function openStatusDetail(name:string, effect:string, source:string, duration:string, editPath:string) {
  let h='';
  if(isEditMode){
    h+=`<div class="th-modal-section"><div class="th-modal-label">名称</div>${editableInput(name,editPath+'.名称')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">效果</div>${editableTextarea(effect,editPath+'.效果')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">来源</div>${editableInput(source,editPath+'.来源')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">持续时间</div>${editableInput(duration,editPath+'.持续时间')}</div>`;
  } else {
    h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(name)}</div><div class="th-modal-text">${esc(effect)}</div></div>`;
    if(source) h+=`<div class="th-modal-section"><div class="th-modal-label">来源</div><div class="th-modal-text">${esc(source)}</div></div>`;
    if(duration) h+=`<div class="th-modal-section"><div class="th-modal-label">持续时间</div><div class="th-modal-text">${esc(duration)}</div></div>`;
  }
  // 需求3：堆叠弹窗逻辑
  const o1=qs('.th-modal-overlay');const isModal1Open=o1&&o1.style.display!=='none';
  if(isModal1Open){
    openModal2(`<i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(name)} · 状态详情`,h);
  } else {
    openModal(`<i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(name)} · 状态详情`,h);
  }
}

function openClothingDetailModal(name:string, part:string, state:string, detail:string, editPath:string) {
  let h='';
  if(isEditMode){
    h+=`<div class="th-modal-section"><div class="th-modal-label">名称</div>${editableInput(name,editPath+'.名称')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">穿着部位</div>${editableInput(part,editPath+'.穿着部位')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">衣物状态</div>${editableInput(state,editPath+'.衣物状态')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">外观详情</div>${editableTextarea(detail,editPath+'.外观详情')}</div>`;
  } else {
    h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-vest"></i> ${esc(name)}</div>`;
    h+=`<div style="font-size:13px;color:var(--lav);font-weight:700;margin-bottom:6px">${esc(part)} · <span style="color:var(--pink)">${esc(state)}</span></div>`;
    h+=`<div class="th-modal-text">${esc(detail)}</div></div>`;
  }
  // 需求3：当已有弹窗打开时使用二级弹窗堆叠，否则用一级弹窗
  const o1=qs('.th-modal-overlay');const isModal1Open=o1&&o1.style.display!=='none';
  if(isModal1Open){
    openModal2(`<i class="fa-solid fa-vest"></i> ${esc(name)} · 穿着详情`,h);
  } else {
    openModal(`<i class="fa-solid fa-vest"></i> ${esc(name)} · 穿着详情`,h);
  }
}

// ================================================================
//  需求9：编辑模式辅助函数
// ================================================================
function editableInput(value:string, path:string, type:string='text'): string {
  return `<input class="th-edit-input" type="${type}" value="${escAttr(value)}" data-edit-path="${escAttr(path)}">`;
}
function editableTextarea(value:string, path:string): string {
  return `<textarea class="th-edit-textarea" data-edit-path="${escAttr(path)}" rows="3">${esc(value)}</textarea>`;
}
// ================================================================
//  NPC 卡片
// ================================================================
function renderNPCGrid(data:Record<string,any>) {
  const c=qs('.th-npc-grid'); if(!c) return;
  let npcs=getNPCs(data);
  // 需求9：筛选在场/不在场
  if(npcFilter==='present') npcs=npcs.filter(n=>n.info['是否在场']===true);
  else if(npcFilter==='absent') npcs=npcs.filter(n=>n.info['是否在场']!==true);
  // 需求7：排序
  npcs=sortNPCs(npcs);
  if(!npcs.length){ c.innerHTML='<span class="th-empty">暂无 NPC</span>'; return; }
  c.innerHTML=npcs.map((npc,idx)=>buildNPCCard(npc,idx)).join('');
  bindNPCGridEvents(c);
}

function closestWithin<T extends HTMLElement>(container:HTMLElement, target:EventTarget|null, selector:string): T|null {
  const el=(target as HTMLElement|null)?.closest?.(selector) as T|null;
  return el&&container.contains(el)?el:null;
}
function enteredWithin<T extends HTMLElement>(container:HTMLElement, e:MouseEvent, selector:string): T|null {
  const el=closestWithin<T>(container,e.target,selector);
  if(!el) return null;
  const related=e.relatedTarget as Node|null;
  return related&&el.contains(related)?null:el;
}
function leftWithin<T extends HTMLElement>(container:HTMLElement, e:MouseEvent, selector:string): T|null {
  const el=closestWithin<T>(container,e.target,selector);
  if(!el) return null;
  const related=e.relatedTarget as Node|null;
  return related&&el.contains(related)?null:el;
}
function bindNPCGridEvents(container:HTMLElement) {
  if(container.dataset.npcEventsBound==='true') return;
  container.dataset.npcEventsBound='true';

  container.addEventListener('click',(e:Event)=>{
    const t=e.target as HTMLElement;
    const attr=closestWithin<HTMLElement>(container,t,'.th-npc-attr-corner');
    if(attr){
      e.stopPropagation();
      const nm=attr.getAttribute('data-npc-attr')||'';
      const info=getNPCInfo(currentData,nm);
      if(info) openAttrModal(nm,_.get(info,'属性',{})||{}, `NPC.${nm}.属性`);
      return;
    }
    const avatar=closestWithin<HTMLElement>(container,t,'.th-npc-avatar-wrap');
    if(avatar){
      e.stopPropagation();
      const nm=avatar.getAttribute('data-avatar-target')||'';
      const url=avatarImages['npc:'+nm]||'';
      if(url) showImage(url);
      else { uploadingTarget='npc:'+nm; qs<HTMLInputElement>('.th-avatar-file-input')?.click(); }
      return;
    }
    const bag=closestWithin<HTMLElement>(container,t,'.th-npc-av-icon-bag');
    if(bag){ e.stopPropagation(); openNPCBag(bag.getAttribute('data-npc-bag')||''); return; }
    const skill=closestWithin<HTMLElement>(container,t,'.th-npc-av-icon-skill');
    if(skill){ e.stopPropagation(); openNPCSkill(skill.getAttribute('data-npc-skill')||''); return; }
    const gallery=closestWithin<HTMLElement>(container,t,'.th-npc-gallery-corner');
    if(gallery){ e.stopPropagation(); openGalleryModal(gallery.getAttribute('data-npc-gallery')||''); return; }
    const clothing=closestWithin<HTMLElement>(container,t,'.th-npc-clothing-corner');
    if(clothing){
      e.stopPropagation();
      const nm=clothing.getAttribute('data-npc-clothing')||'';
      const info=getNPCInfo(currentData,nm);
      if(info) openClothingListModal(nm,_.get(info,'当前穿着衣物',{})||{});
      return;
    }
    const card=closestWithin<HTMLElement>(container,t,'.th-npc-card');
    if(!card) return;
    const presence=closestWithin<HTMLElement>(container,t,'.th-npc-presence-toggle');
    if(presence){
      const nm=card.getAttribute('data-npc-name')||'';
      if(nm) toggleNpcPresence(nm);
      return;
    }
    if(t.closest('.th-npc-icon-item')) return;
    const nm=card.getAttribute('data-npc-name')||'';
    if(nm&&currentData) openNPCDetail(nm);
  });

  container.addEventListener('mouseover',(e:MouseEvent)=>{
    const attr=enteredWithin<HTMLElement>(container,e,'.th-npc-attr-corner');
    if(attr){
      const nm=attr.getAttribute('data-npc-attr')||'';
      const info=getNPCInfo(currentData,nm);
      if(info) showHoverTip(attr,'attr',{name:nm,html:buildAttrBarHtml(_.get(info,'属性',{})||{})});
      return;
    }
    const avatar=enteredWithin<HTMLElement>(container,e,'.th-npc-avatar-wrap');
    if(avatar){
      const nm=avatar.getAttribute('data-avatar-target')||'';
      const info=getNPCInfo(currentData,nm);
      if(info) showMetricWheel(avatar,info);
      return;
    }
    const nameEl=enteredWithin<HTMLElement>(container,e,'.th-npc-name');
    if(nameEl){
      const nm=nameEl.getAttribute('data-npcnm')||'';
      const info=getNPCInfo(currentData,nm);
      if(info) showHoverTip(nameEl,'identity',{name:nm,identity:info['身份']||'无'});
      return;
    }
    const status=enteredWithin<HTMLElement>(container,e,'.th-npc-icon-status');
    if(status){
      const nm=status.getAttribute('data-npc-status')||'';
      const info=getNPCInfo(currentData,nm);
      if(info) showNpcStatusHover(status,_.get(info,'状态',{})||{},nm);
      return;
    }
    const counts=enteredWithin<HTMLElement>(container,e,'.th-npc-icon-counts');
    if(counts){
      showHoverTip(counts,'counts',{orgasm:counts.getAttribute('data-orgasm')||'0',creampie:counts.getAttribute('data-creampie')||'0'});
      return;
    }
    const icon=enteredWithin<HTMLElement>(container,e,'.th-npc-icon-item');
    if(icon){
      const key=icon.getAttribute('data-ikey')||'';
      const cfg=NPC_ICON_CFG.find(c=>c.key===key);
      if(cfg) showHoverTip(icon,'icon',{icon:cfg.icon,label:cfg.label,content:icon.getAttribute('data-icontent')||'(暂无)'});
      return;
    }
    const bag=enteredWithin<HTMLElement>(container,e,'.th-npc-av-icon-bag');
    if(bag){
      const nm=bag.getAttribute('data-npc-bag')||'';
      const info=getNPCInfo(currentData,nm);
      if(info) showItemsHoverTip(bag,_.get(info,'拥有物品',{})||{},'背包');
      return;
    }
    const skill=enteredWithin<HTMLElement>(container,e,'.th-npc-av-icon-skill');
    if(skill){
      const nm=skill.getAttribute('data-npc-skill')||'';
      const info=getNPCInfo(currentData,nm);
      if(info) showSkillsHoverTip(skill,_.get(info,'拥有技能',{})||{},'技能');
      return;
    }
    const clothing=enteredWithin<HTMLElement>(container,e,'.th-npc-clothing-corner');
    if(clothing){
      const nm=clothing.getAttribute('data-npc-clothing')||'';
      const info=getNPCInfo(currentData,nm);
      if(info) showClothingHoverTip(clothing,_.get(info,'当前穿着衣物',{})||{});
    }
  });

  container.addEventListener('mouseout',(e:MouseEvent)=>{
    if(leftWithin(container,e,'.th-npc-avatar-wrap')){ hideMetricWheel(); return; }
    if(
      leftWithin(container,e,'.th-npc-attr-corner')||
      leftWithin(container,e,'.th-npc-name')||
      leftWithin(container,e,'.th-npc-icon-item')||
      leftWithin(container,e,'.th-npc-av-icon-bag')||
      leftWithin(container,e,'.th-npc-av-icon-skill')||
      leftWithin(container,e,'.th-npc-clothing-corner')
    ) hideHoverTip();
  });
}

// ================================================================
//  需求: NPC心情拆分为小标签，三列网格
// ================================================================
function buildMoodTags(mood:string): string {
  // 按 / 、 · 空格等分隔
  const tags=mood.split(/[/、·]+/).map(t=>t.trim()).filter(t=>t.length>0);
  if(!tags.length) return esc(mood);
  return tags.map(t=>`<span class="th-mood-tag">${esc(t)}</span>`).join('');
}

function buildNPCCard(npc:{name:string;info:Record<string,any>},idx:number): string {
  const{name,info}=npc;
  const present=info['是否在场']??false;
  const mood=info['当前情绪状态与心情']||'';
  const hasImg=!!avatarImages['npc:'+name];
  const ac=getAvatarColor(name,idx);

  // 头像 HTML
  let av;
  if(hasImg) av=`<div class="th-npc-avatar-ring ${present?'present':'absent'}"><div class="th-npc-avatar-img-wrap"><img class="th-npc-avatar-img" src="${esc(avatarImages['npc:'+name])}" alt=""></div></div>`;
  else av=`<div class="th-npc-avatar-ring ${present?'present':'absent'}"><div class="th-npc-avatar-img-wrap"><span class="th-npc-avatar-placeholder" style="color:${ac}">${esc(name[0]||'?')}</span></div></div>`;

  // 4 图标行
  let icons='';
  for(const cfg of NPC_ICON_CFG){
    const val=info[cfg.key]||'';
    const display=cfg.key==='当前本能渴望'?(val&&val!=='无'):!!val;
    icons+=`<span class="th-npc-icon-item" data-ikey="${escAttr(cfg.key)}" data-icontent="${escAttr(val||'')}" style="opacity:${display?1:0.4}"><i class="${cfg.icon}"></i></span>`;
  }
  // 需求8：第5个图标 — 高潮次数/被内射次数
  const orgasm=info['高潮次数']??0;
  const creampie=info['被内射次数']??0;
  const hasCounts=(Number(orgasm)>0||Number(creampie)>0);
  icons+=`<span class="th-npc-icon-item th-npc-icon-counts" data-orgasm="${orgasm}" data-creampie="${creampie}" style="opacity:${hasCounts?1:0.4}"><i class="fa-solid fa-heart-circle-plus"></i></span>`;
  // 需求6：NPC当前状态图标
  const statuses=info['状态']||{}; const hasStatus=Object.keys(statuses).length>0;
  icons+=`<span class="th-npc-icon-item th-npc-icon-status" data-npc-status="${esc(name)}" style="opacity:${hasStatus?1:0.4}"><i class="fa-solid fa-wand-magic-sparkles"></i></span>`;

  return `<div class="th-npc-card" data-npc-name="${esc(name)}" data-npc-present="${present?'true':'false'}">
    <div class="th-npc-card-inner">
      <div class="th-npc-av-col">
        <div class="th-npc-avatar-wrap" data-avatar-target="${esc(name)}" title="悬停查看数值指标">${av}</div>
        <div class="th-npc-av-icons">
          <span class="th-npc-av-icon th-npc-av-icon-bag" data-npc-bag="${esc(name)}" title="背包"><i class="fa-solid fa-box-open"></i></span>
          <span class="th-npc-av-icon th-npc-av-icon-skill" data-npc-skill="${esc(name)}" title="技能"><i class="fa-solid fa-scroll"></i></span>
        </div>
      </div>
      <div class="th-npc-info">
        <div class="th-npc-name-row">
          <span class="th-npc-name" data-npcnm="${esc(name)}">${esc(name)}</span>
          <span class="th-npc-presence ${present?'present':'absent'} th-npc-presence-toggle" data-npc-presence="${esc(name)}">${present?'<i class="fa-solid fa-circle" style="font-size:6px"></i> 在场':'离场'}</span>
        </div>
        ${mood?`<div class="th-npc-mood-tags">${buildMoodTags(mood)}</div>`:''}
        <div class="th-npc-icon-row">${icons}</div>
      </div>
      <span class="th-npc-gallery-corner" data-npc-gallery="${esc(name)}" title="画廊"><i class="fa-solid fa-images"></i></span>
      <span class="th-npc-attr-corner" data-npc-attr="${esc(name)}" title="属性详情"><i class="fa-solid fa-chart-pie"></i></span>
      <span class="th-npc-clothing-corner" data-npc-clothing="${esc(name)}" title="衣物详情"><i class="fa-solid fa-vest"></i></span>
    </div>
  </div>`;
}

// ================================================================
//  NPC 详情弹窗（需求9：编辑全覆盖）
// ================================================================
function openNPCDetail(npcName:string) {
  if(!currentData) return;
  const info=getNPCInfo(currentData,npcName); if(!info) return;
  const name=npcName;
  const basePath=`NPC.${name}`;
  const npcIndex=getNPCs(currentData).findIndex(n=>n.name===name);
  let h='';

  // 头像+名称行
  h+=`<div class="th-modal-hero">`;
  const hasImg=!!avatarImages['npc:'+name];
  h+=`<div class="th-modal-avatar-section">`;
  if(hasImg) h+=`<div class="th-modal-avatar-ring"><div class="th-modal-avatar-img-wrap"><img src="${esc(avatarImages['npc:'+name])}" alt="" style="width:100%;height:100%;object-fit:cover;cursor:pointer" onclick="(function(){var o=document.querySelector('.th-image-overlay');var i=document.querySelector('.th-image-full');if(o&&i){i.src='${esc(avatarImages['npc:'+name])}';o.style.display='flex';}})()"></div></div>`;
  else h+=`<div class="th-modal-avatar-ring"><div class="th-modal-avatar-img-wrap"><span style="font-size:30px;color:${getAvatarColor(name,npcIndex>=0?npcIndex:0)}"><i class="fa-solid fa-user-astronaut"></i></span></div></div>`;
  h+=`<div class="th-modal-avatar-btns" style="display:flex;gap:6px;margin-top:4px"><button class="th-avatar-btn th-avatar-btn-upload" onclick="(function(){var t='npc:${esc(name)}';var f=document.querySelector('.th-avatar-file-input');window.__uploadTarget__=t;if(f)f.click();})()"><i class="fa-solid fa-camera"></i></button>${hasImg?`<button class="th-avatar-btn th-avatar-btn-delete" onclick="(function(){window.__deleteAvatar__('npc:${esc(name)}');})()"><i class="fa-solid fa-trash"></i></button>`:''}</div>`;
  h+=`</div>`;
  const bday=info['生日日期']&&info['生日日期']!=='未知'?info['生日日期']:'';
  h+=`<div class="th-modal-hero-info">`;
  if(isEditMode){
    h+=`<div class="th-modal-hero-name">${editableInput(name,basePath+'.名称')} <button class="th-btn-attr-modal" style="display:inline-flex" data-modal-attr="${esc(name)}"><i class="fa-solid fa-chart-pie"></i> 属性</button>${bday?`<span class="th-modal-hero-birthday"><i class="fa-solid fa-cake-candles"></i> ${editableInput(bday,basePath+'.生日日期')}</span>`:''}</div>`;
    h+=`<div class="th-modal-hero-loc"><i class="fa-solid fa-tag"></i> ${editableInput(info['身份']||'',basePath+'.身份')} · ${info['是否在场']?'<i class="fa-solid fa-circle" style="color:var(--mint);font-size:8px"></i> 在场':'离场'}</div>`;
    h+=`<div class="th-modal-hero-mood"><i class="fa-solid fa-face-smile"></i> ${editableInput(info['当前情绪状态与心情']||'',basePath+'.当前情绪状态与心情')}<div class="th-npc-mood-tags">${buildMoodTags(info['当前情绪状态与心情']||'')}</div></div>`;
  } else {
    h+=`<div class="th-modal-hero-name">${esc(name)} <button class="th-btn-attr-modal" style="display:inline-flex" data-modal-attr="${esc(name)}"><i class="fa-solid fa-chart-pie"></i> 属性</button>${bday?`<span class="th-modal-hero-birthday"><i class="fa-solid fa-cake-candles"></i> ${esc(bday)}</span>`:''}</div>`;
    h+=`<div class="th-modal-hero-loc"><i class="fa-solid fa-tag"></i> ${esc(info['身份']||'')} · ${info['是否在场']?'<i class="fa-solid fa-circle" style="color:var(--mint);font-size:8px"></i> 在场':'离场'}</div>`;
    h+=`<div class="th-modal-hero-mood"><i class="fa-solid fa-face-smile"></i> ${esc(info['当前情绪状态与心情']||'—')}<div class="th-npc-mood-tags">${buildMoodTags(info['当前情绪状态与心情']||'')}</div></div>`;
  }
  h+=`</div></div>`;

  // 内心想法
  if(info['内心想法']){
    h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-comment"></i> 内心想法</div>`;
    h+=isEditMode ? editableTextarea(info['内心想法'],basePath+'.内心想法') : `<div class="th-modal-text">${esc(info['内心想法'])}</div>`;
    h+=`</div>`;
  }
  // 本能渴望
  if(info['当前本能渴望']&&info['当前本能渴望']!=='无'){
    h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-crosshairs"></i> 本能渴望</div>`;
    h+=isEditMode ? editableTextarea(info['当前本能渴望'],basePath+'.当前本能渴望') : `<div class="th-modal-text">${esc(info['当前本能渴望'])}</div>`;
    h+=`</div>`;
  }
  // 数值指标
  h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-heart"></i> 数值指标</div><div class="th-modal-metrics">`;
  for(const m of NPC_METRICS){
    const v=clamp(Number(info[m.key])||0,0,100);
    if(isEditMode){
      h+=`<div class="th-npc-metric"><span class="th-npc-metric-icon"><i class="${m.icon}"></i></span><span class="th-npc-metric-label">${m.key}</span>${editableInput(`${v}`,basePath+'.'+m.key,'number')}</div>`;
    } else {
      h+=`<div class="th-npc-metric"><span class="th-npc-metric-icon"><i class="${m.icon}"></i></span><span class="th-npc-metric-label">${m.key}</span><div class="th-npc-metric-bar"><div class="th-npc-metric-fill ${m.cls}" style="width:${v}%"></div></div><span class="th-npc-metric-val">${v}</span></div>`;
    }
  }
  h+=`</div></div>`;
  // 计数（需求9：编辑模式）
  h+=`<div class="th-modal-counts">`;
  for(const c of NPC_COUNTS){
    const cv=Number(info[c.key])||0;
    h+=`<span><i class="${c.icon}"></i> ${c.key}: ${isEditMode?editableInput(`${cv}`,basePath+'.'+c.key,'number'):`<b>${cv}</b>`}</span>`;
  }
  h+=`</div>`;

  // 姿态动作+身体状态
  const posture=info['姿态动作']||'暂无动作';
  const bodyState=info['身体状态']||'暂无描述';
  h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-child-reaching"></i> 姿态动作 & 身体状态</div>`;
  h+=`<div class="th-modal-pb-row">`;
  h+=`<div class="th-modal-pop-card"><div class="th-modal-pop-head"><i class="fa-solid fa-child-reaching"></i> 姿态动作</div><div class="th-modal-pop-body">${isEditMode?editableTextarea(posture,basePath+'.姿态动作'):esc(posture)}</div></div>`;
  h+=`<div class="th-modal-pop-card"><div class="th-modal-pop-head"><i class="fa-solid fa-hand-holding-heart"></i> 身体状态</div><div class="th-modal-pop-body">${isEditMode?editableTextarea(bodyState,basePath+'.身体状态'):esc(bodyState)}</div></div>`;
  h+=`</div></div>`;

  // 状态（需求9：编辑模式）
  const st=_.get(info,'状态',{})||{}; const stE=Object.entries(st);
  h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-wand-magic-sparkles"></i> 状态</div><div class="th-block-row">`;
  if(!stE.length) h+=`<span class="th-empty" style="padding:8px 0">暂无状态</span>`;
  for(const[sn,si] of stE){ const s=si as any;
    const eff=s?.['效果']||''; const src=s?.['来源']||''; const dur=s?.['持续时间']||'';
    h+=`<span class="th-block th-block-status th-modal-block-click" data-btype="status" data-bname="${escAttr(sn)}" data-beffect="${escAttr(eff)}" data-bsource="${escAttr(src)}" data-bduration="${escAttr(dur)}" data-bpath="${escAttr(basePath)}.状态.${escAttr(sn)}"><span class="th-tag-dot neutral"></span> ${esc(sn)}</span>`;
  }
  h+=`<span class="th-block th-block-add" data-add-trigger="status" data-add-base="${escAttr(basePath)}.状态" data-add-owner="${escAttr(name)}"><i class="fa-solid fa-plus"></i> 新增状态</span>`;
  h+=`</div></div>`;

  // 穿着（需求4：上下折叠式，点击衣物方块展开/收起详情）
  const cl=_.get(info,'当前穿着衣物',{})||{}; const clE=Object.entries(cl);
  h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-vest"></i> 当前穿着</div><div class="th-block-row">`;
  if(!clE.length) h+=`<span class="th-empty" style="padding:8px 0">暂无穿着</span>`;
  for(const[cn,ci] of clE){ const c=ci as any;
    const state=c?.['衣物状态']||'';
    const dot=getDotCls(state);
    h+=`<span class="th-block th-block-clothing th-fold-trigger" data-btype="clothing" data-bname="${escAttr(cn)}" data-bpart="${escAttr(c?.['穿着部位']||'')}" data-bstate="${escAttr(state)}" data-bdetail="${escAttr(c?.['外观详情']||'')}" data-bpath="${escAttr(basePath)}.当前穿着衣物.${escAttr(cn)}"><i class="fa-solid fa-vest"></i> ${esc(cn)} · ${esc(c?.['穿着部位']||'')} <span class="th-tag-dot ${dot}"></span><span class="th-fold-arrow" style="margin-left:auto;font-size:10px"><i class="fa-solid fa-chevron-down"></i></span></span>`;
  }
  h+=`<span class="th-block th-block-add" data-add-trigger="clothing" data-add-base="${escAttr(basePath)}.当前穿着衣物" data-add-owner="${escAttr(name)}"><i class="fa-solid fa-plus"></i> 新增衣物</span>`;
  h+=`</div><div class="th-fold-detail" style="display:none"></div></div>`;

  // 基础外貌（需求9：编辑模式）
  if(info['基础外貌']){
    h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-eye"></i> 基础外貌</div>`;
    h+= isEditMode ? editableTextarea(info['基础外貌'],basePath+'.基础外貌') : `<div class="th-modal-text">${esc(info['基础外貌'])}</div>`;
    h+=`</div>`;
  }

  // 背包/技能按钮
  const items=_.get(info,'拥有物品',{})||{}; const itemE=Object.entries(items);
  const skills=_.get(info,'拥有技能',{})||{}; const skillE=Object.entries(skills);
  h+=`<div class="th-modal-section"><div style="display:flex;gap:10px">`;
  h+=`<button class="th-btn-sm-wide" data-npc-item-open="${esc(name)}"><i class="fa-solid fa-box-open"></i> 背包 (${itemE.length})</button>`;
  h+=`<button class="th-btn-sm-wide" data-npc-skill-open="${esc(name)}"><i class="fa-solid fa-scroll"></i> 技能 (${skillE.length})</button>`;
  h+=`</div></div>`;

  openModal(esc(name),h);

  setTimeout(()=>{
    qsa('[data-modal-attr]').forEach(b=>b.addEventListener('click',function(this:HTMLElement){const nm=this.getAttribute('data-modal-attr')||'';const info=getNPCInfo(currentData,nm);if(info)openAttrModal(nm,_.get(info,'属性',{})||{},`NPC.${nm}.属性`);}));
    qsa('[data-npc-item-open]').forEach(b=>b.addEventListener('click',function(this:HTMLElement){const nm=this.getAttribute('data-npc-item-open')||'';if(currentData)openNPCBag(nm);}));
    qsa('[data-npc-skill-open]').forEach(b=>b.addEventListener('click',function(this:HTMLElement){const nm=this.getAttribute('data-npc-skill-open')||'';if(currentData)openNPCSkill(nm);}));
    // 绑定弹窗内状态方块hover+click
    const modalBody=qs('.th-modal-body'); if(modalBody){
      bindBlockHoverAndClick(modalBody,'status');
    }
    // 需求4：衣物方块改为折叠式展开/收起
    bindClothingFoldDown(npcName);
  },40);

  (window as any).__uploadTarget__ = '';
  (window as any).__deleteAvatar__ = (t:string)=>{ deleteAvatar(t); closeModal(); if(currentData) openNPCDetail(npcName); };
}

// ================================================================
//  需求4：衣物折叠式展开/收起（NPC详情弹窗内）
// ================================================================
function bindClothingFoldDown(npcName:string) {
  const modalBody = qs('.th-modal-body');
  const foldTriggers = modalBody ? modalBody.querySelectorAll('.th-fold-trigger') : [];
  if (!foldTriggers.length) return;

  const foldDetail = qs('.th-fold-detail');
  if (!foldDetail) return;

  let activeTrigger: HTMLElement | null = null;

  foldTriggers.forEach((trigger) => {
    const el = trigger as HTMLElement;

    // hover → 显示装备卡片浮窗
    el.addEventListener('mouseenter', function (this: HTMLElement) {
      const name = this.getAttribute('data-bname') || '';
      const part = this.getAttribute('data-bpart') || '';
      const state = this.getAttribute('data-bstate') || '';
      const detail = this.getAttribute('data-bdetail') || '';
      showHoverTip(this, 'clothing', { name, part, state, detail });
    });
    el.addEventListener('mouseleave', () => { hideHoverTip(); });

    // click → 折叠式展开/收起详情
    el.addEventListener('click', function (this: HTMLElement, e: Event) {
      e.stopPropagation();
      const bname = this.getAttribute('data-bname') || '';
      const bpart = this.getAttribute('data-bpart') || '';
      const bstate = this.getAttribute('data-bstate') || '';
      const bdetail = this.getAttribute('data-bdetail') || '';
      const bpath = this.getAttribute('data-bpath') || '';

      // 如果点击同一个方块 → 收起
      if (activeTrigger === this && foldDetail.style.display !== 'none') {
        foldDetail.style.display = 'none';
        foldDetail.innerHTML = '';
        // 恢复箭头方向
        this.querySelector('.th-fold-arrow')!.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
        activeTrigger = null;
        return;
      }

      // 切换另一个方块 → 展开新的
      // 恢复之前活跃的箭头
      if (activeTrigger) {
        activeTrigger.querySelector('.th-fold-arrow')!.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
      }
      activeTrigger = e.currentTarget as HTMLElement;

      // 生成详情HTML
      let detailHtml = '';
      if (isEditMode) {
        detailHtml += `<div class="th-fold-row"><span class="th-fold-label">名称</span>${editableInput(bname, bpath + '.名称')}</div>`;
        detailHtml += `<div class="th-fold-row"><span class="th-fold-label">穿着部位</span>${editableInput(bpart, bpath + '.穿着部位')}</div>`;
        detailHtml += `<div class="th-fold-row"><span class="th-fold-label">衣物状态</span>${editableInput(bstate, bpath + '.衣物状态')}</div>`;
        detailHtml += `<div class="th-fold-row" style="flex-direction:column;align-items:flex-start"><span class="th-fold-label">外观详情</span>${editableTextarea(bdetail, bpath + '.外观详情')}</div>`;
      } else {
        detailHtml += `<div class="th-fold-row"><span class="th-fold-label"><i class="fa-solid fa-tag"></i> 穿着部位</span><span class="th-fold-value">${esc(bpart)}</span></div>`;
        detailHtml += `<div class="th-fold-row"><span class="th-fold-label"><i class="fa-solid fa-circle-info"></i> 衣物状态</span><span class="th-fold-value">${esc(bstate)}</span></div>`;
        if (bdetail) {
          detailHtml += `<div class="th-fold-row" style="flex-direction:column;align-items:flex-start"><span class="th-fold-label"><i class="fa-solid fa-align-left"></i> 外观详情</span><div class="th-fold-desc">${esc(bdetail)}</div></div>`;
        }
      }
      foldDetail.innerHTML = detailHtml;
      foldDetail.style.display = 'block';

      // 更新箭头方向
      this.querySelector('.th-fold-arrow')!.innerHTML = '<i class="fa-solid fa-chevron-up"></i>';

      // 滚动到详情位置
      foldDetail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
}

// ================================================================
//  需求2：背包/技能 → 3列方块网格，点击方块弹出详情
// ================================================================

// --- User 背包 ---
function openUserBag(data:Record<string,any>) {
  const u=getUser(data); const uname=getUN(data); const ukey=getUserKey(data);
  const items=_.get(u,'拥有物品',{})||{}; const entries=Object.entries(items);
  const basePath=ukey+'.拥有物品';
  const h=renderItemGrid(entries,basePath,uname);
  openModal('<i class="fa-solid fa-box-open"></i> 背包',h);
  bindGridItemClicks(uname, entries, basePath, 'user');
}

// --- NPC 背包 ---
function openNPCBag(npcName:string) {
  const info=getNPCInfo(currentData,npcName); if(!info) return;
  const items=_.get(info,'拥有物品',{})||{}; const entries=Object.entries(items);
  const basePath=`NPC.${npcName}.拥有物品`;
  const h=renderItemGrid(entries,basePath,npcName);
  openModal(`<i class="fa-solid fa-box-open"></i> `+esc(npcName)+' · 背包',h);
  bindGridItemClicks(npcName, entries, basePath, 'npc');
}

// --- User 技能 ---
function openUserSkill(data:Record<string,any>) {
  const u=getUser(data); const uname=getUN(data); const ukey=getUserKey(data);
  const skills=_.get(u,'拥有技能',{})||{}; const entries=Object.entries(skills);
  const basePath=ukey+'.拥有技能';
  const h=renderSkillGrid(entries,basePath,uname);
  openModal('<i class="fa-solid fa-scroll"></i> 技能',h);
  bindGridSkillClicks(uname, entries, basePath, 'user');
}

// --- NPC 技能 ---
function openNPCSkill(npcName:string) {
  const info=getNPCInfo(currentData,npcName); if(!info) return;
  const skills=_.get(info,'拥有技能',{})||{}; const entries=Object.entries(skills);
  const basePath=`NPC.${npcName}.拥有技能`;
  const h=renderSkillGrid(entries,basePath,npcName);
  openModal(`<i class="fa-solid fa-scroll"></i> `+esc(npcName)+' · 技能',h);
  bindGridSkillClicks(npcName, entries, basePath, 'npc');
}

// --- 网格渲染 ---
function renderItemGrid(entries:[string,any][], basePath:string, ownerName:string): string {
  let h='';
  if(!entries.length) h+='<div class="th-empty th-grid-empty"><i class="fa-solid fa-box-open"></i> 空空如也~</div>';
  h+='<div class="th-block-grid">';
  h+=entries.map(([n,it]:[string,any])=>{
    const count=it?.['数量']??1;
    const ed=escAttr(n);
    return `<div class="th-block th-block-item th-grid-item-click" data-gname="${ed}" data-gpath="${escAttr(basePath)}" data-owner="${escAttr(ownerName)}" data-gtype="item"><i class="fa-solid fa-gem"></i> ${esc(n)}<span class="th-tag-badge">${count}</span></div>`;
  }).join('');
  h+=`<div class="th-block th-block-add" data-add-trigger="item" data-add-base="${escAttr(basePath)}" data-add-owner="${escAttr(ownerName)}"><i class="fa-solid fa-plus"></i> 添加物品</div>`;
  h+='</div>';
  h+=`<div class="th-grid-detail" id="th-grid-detail" style="display:none"></div>`;
  return h;
}

function renderSkillGrid(entries:[string,any][], basePath:string, ownerName:string): string {
  let h='';
  if(!entries.length) h+='<div class="th-empty th-grid-empty"><i class="fa-solid fa-scroll"></i> 尚未习得~</div>';
  h+='<div class="th-block-grid">';
  h+=entries.map(([n,sk]:[string,any])=>{
    const lv=sk?.['等级']??1;
    const ed=escAttr(n);
    return `<div class="th-block th-block-skill th-grid-item-click" data-gname="${ed}" data-gpath="${escAttr(basePath)}" data-owner="${escAttr(ownerName)}" data-gtype="skill"><i class="fa-solid fa-scroll"></i> ${esc(n)}<span class="th-tag-badge" style="background:var(--lav);font-size:9px">Lv${lv}</span></div>`;
  }).join('');
  h+=`<div class="th-block th-block-add" data-add-trigger="skill" data-add-base="${escAttr(basePath)}" data-add-owner="${escAttr(ownerName)}"><i class="fa-solid fa-plus"></i> 添加技能</div>`;
  h+='</div>';
  h+=`<div class="th-grid-detail" id="th-grid-detail" style="display:none"></div>`;
  return h;
}

// --- 点击方块→显示详情 ---
function bindGridItemClicks(ownerName:string, entries:[string,any][], basePath:string, ownerType:string) {
  setTimeout(()=>{
    qsa('.th-grid-item-click').forEach(el=>el.addEventListener('click',function(this:HTMLElement,e:Event){
      e.stopPropagation();
      const n=this.getAttribute('data-gname')||'';
      const entry=entries.find(([k])=>k===n);
      if(!entry) return;
      const it=entry[1] as any;
      const path=basePath+'.'+n;
      showItemDetail(n,it,path,ownerName,ownerType);
    }));
  },40);
}

function bindGridSkillClicks(ownerName:string, entries:[string,any][], basePath:string, ownerType:string) {
  setTimeout(()=>{
    qsa('.th-grid-item-click').forEach(el=>el.addEventListener('click',function(this:HTMLElement,e:Event){
      e.stopPropagation();
      const n=this.getAttribute('data-gname')||'';
      const entry=entries.find(([k])=>k===n);
      if(!entry) return;
      const sk=entry[1] as any;
      const path=basePath+'.'+n;
      showSkillDetail(n,sk,path,ownerName,ownerType);
    }));
  },40);
}

function showItemDetail(name:string, it:any, editPath:string, ownerName:string, ownerType:string) {
  const detailEl=qs('#th-grid-detail'); if(!detailEl) return;
  const gridEl=detailEl.previousElementSibling as HTMLElement;
  if(gridEl) gridEl.style.display='none';
  let h='';
  if(isEditMode){
    h+=`<div class="th-modal-section"><div class="th-modal-label">名称</div>${editableInput(name,editPath+'.名称')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">数量</div>${editableInput(`${it?.['数量']??1}`,editPath+'.数量','number')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">简介</div>${editableTextarea(it?.['简介']||'',editPath+'.简介')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">效果</div>${editableTextarea(it?.['效果']||'',editPath+'.效果')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">评价</div>${editableTextarea(it?.['评价']||'',editPath+'.评价')}</div>`;
  } else {
    h+=`<div class="th-item-row"><div class="th-item-name">${esc(name)} <span class="th-item-count">x${it?.['数量']??1}</span></div>`;
    if(it?.['简介']) h+=`<div class="th-item-desc">${esc(it['简介'])}</div>`;
    if(it?.['效果']) h+=`<div class="th-item-effect"><i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(it['效果'])}</div>`;
    if(it?.['评价']) h+=`<div class="th-item-comment">${esc(it['评价'])}</div>`;
  }
  h+=`<div class="th-item-actions">`;
  h+=`<button class="th-btn-sm th-btn-use th-btn-use-item" data-owner="${escAttr(ownerName)}" data-item="${escAttr(name)}"><i class="fa-solid fa-wand-magic-sparkles"></i> 使用</button>`;
  h+=`<button class="th-btn-sm th-btn-discard th-btn-discard-item" data-owner="${escAttr(ownerName)}" data-item="${escAttr(name)}" data-owner-type="${ownerType}"><i class="fa-solid fa-trash"></i> 丢弃</button>`;
  h+=`<button class="th-btn-sm th-btn-back-grid" style="background:var(--bg3);color:var(--tx2);border:1px solid var(--dv);margin-left:auto"><i class="fa-solid fa-arrow-left"></i> 返回</button>`;
  h+=`</div>`;
  detailEl.innerHTML=h; detailEl.style.display='block';

  // 使用按钮
  qs('.th-btn-use-item')?.addEventListener('click',function(this:HTMLElement){
    const on=this.getAttribute('data-owner')||''; const it=this.getAttribute('data-item')||'';
    try{safeTriggerSlash('/setinput '+tavernMacro('input')+' <'+on+'使用了'+it+'>')}catch(e){ void e; } closeModal();
  });
  // 丢弃按钮
  qs('.th-btn-discard-item')?.addEventListener('click',function(this:HTMLElement){
    const on=this.getAttribute('data-owner')||''; const it=this.getAttribute('data-item')||'';
    const ot=this.getAttribute('data-owner-type')||'npc';
    if(!currentData) return;
    if(ot==='npc'){
      const nps=_.get(currentData,'NPC',{})||{}; const its=_.get(nps[on],'拥有物品',{})||{}; delete its[it]; _.set(nps[on],'拥有物品',its); _.set(currentData,'NPC',nps);
      saveData(currentData); renderCurrent(); openNPCBag(on);
    } else {
      const uu=getUser(currentData); const its=_.get(uu,'拥有物品',{})||{}; delete its[it]; _.set(uu,'拥有物品',its); setUser(currentData,uu);
      saveData(currentData); renderCurrent(); openUserBag(currentData);
    }
  });
  // 返回按钮
  qs('.th-btn-back-grid')?.addEventListener('click',()=>{
    detailEl.style.display='none'; detailEl.innerHTML='';
    if(gridEl) gridEl.style.display='';
  });
}

function showSkillDetail(name:string, sk:any, editPath:string, ownerName:string, _ownerType:string) {
  const detailEl=qs('#th-grid-detail'); if(!detailEl) return;
  const gridEl=detailEl.previousElementSibling as HTMLElement;
  if(gridEl) gridEl.style.display='none';
  let h='';
  if(isEditMode){
    h+=`<div class="th-modal-section"><div class="th-modal-label">名称</div>${editableInput(name,editPath+'.名称')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">等级</div>${editableInput(`${sk?.['等级']??1}`,editPath+'.等级','number')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">简介</div>${editableTextarea(sk?.['简介']||'',editPath+'.简介')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">效果</div>${editableTextarea(sk?.['效果']||'',editPath+'.效果')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">评价</div>${editableTextarea(sk?.['评价']||'',editPath+'.评价')}</div>`;
  } else {
    h+=`<div class="th-skill-row"><div class="th-skill-name">${esc(name)} <span style="font-size:13px;color:var(--lav);font-weight:700">Lv.${sk?.['等级']??1}</span></div>`;
    if(sk?.['简介']) h+=`<div class="th-skill-desc">${esc(sk['简介'])}</div>`;
    if(sk?.['效果']) h+=`<div class="th-skill-effect"><i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(sk['效果'])}</div>`;
    if(sk?.['评价']) h+=`<div class="th-skill-comment">${esc(sk['评价'])}</div>`;
  }
  h+=`<div class="th-item-actions">`;
  h+=`<button class="th-btn-sm th-btn-use th-btn-use-skill" data-owner="${escAttr(ownerName)}" data-skill="${escAttr(name)}"><i class="fa-solid fa-wand-magic-sparkles"></i> 使用</button>`;
  h+=`<button class="th-btn-sm th-btn-back-grid" style="background:var(--bg3);color:var(--tx2);border:1px solid var(--dv);margin-left:auto"><i class="fa-solid fa-arrow-left"></i> 返回</button>`;
  h+=`</div>`;
  detailEl.innerHTML=h; detailEl.style.display='block';

  qs('.th-btn-use-skill')?.addEventListener('click',function(this:HTMLElement){
    const on=this.getAttribute('data-owner')||''; const sk=this.getAttribute('data-skill')||'';
    try{safeTriggerSlash('/setinput '+tavernMacro('input')+' <'+on+'使用了'+sk+'>')}catch(e){ void e; } closeModal();
  });
  qs('.th-btn-back-grid')?.addEventListener('click',()=>{
    detailEl.style.display='none'; detailEl.innerHTML='';
    if(gridEl) gridEl.style.display='';
  });
}

// ================================================================
//  属性弹窗（需求6 + 需求9）
// ================================================================
// ================================================================
//  需求: 属性悬停浮窗HTML生成（bar图风格，与弹窗一致）
// ================================================================
function buildAttrBarHtml(attrs:Record<string,any>): string {
  let h='<div class="th-attr-grid-modal" style="gap:6px 12px;font-size:12px">';
  for(const k of ATTR_KEYS){
    const v=clamp(Number(attrs[k])||0,0,ATTR_MAX); const p=attrPct(v); const cls=ATTR_CLS[k]||'attr-type-default';
    h+=`<div class="th-attr-item" style="font-size:12px"><span class="th-attr-name" style="font-size:12px;min-width:36px">${k}</span><div class="th-attr-bar-wrap" style="height:7px"><div class="th-attr-bar-fill ${cls}" style="width:${p}%"></div></div><span class="th-attr-val" style="font-size:13px;min-width:28px">${v}</span></div>`;
  }
  let extraIdx=0;
  for(const[k,v]of Object.entries(attrs)){
    if((ATTR_KEYS as readonly string[]).includes(k)) continue;
    const val=clamp(Number(v)||0,0,ATTR_MAX); const p=attrPct(val);
    const color=`background:${pickExtraAttrColor(extraIdx++)};`;
    h+=`<div class="th-attr-item" style="font-size:12px"><span class="th-attr-name" style="font-size:12px;min-width:36px">${k}</span><div class="th-attr-bar-wrap" style="height:7px"><div class="th-attr-bar-fill" style="width:${p}%;${color}"></div></div><span class="th-attr-val" style="font-size:13px;min-width:28px">${val}</span></div>`;
  }
  h+=`</div>`;
  return h;
}

function openAttrModal(name:string,attrs:Record<string,any>, editPath?:string) {
  let extraIdx=0;
  let h='<div class="th-attr-grid-modal">';
  for(const k of ATTR_KEYS){
    const v=clamp(Number(attrs[k])||0,0,ATTR_MAX); const p=attrPct(v); const cls=ATTR_CLS[k]||'attr-type-default';
    const valHtml=isEditMode&&editPath?editableInput(`${v}`,editPath+'.'+k,'number'):`<span class="th-attr-val">${v}</span>`;
    const barHtml=isEditMode?'':`<div class="th-attr-bar-wrap"><div class="th-attr-bar-fill ${cls}" style="width:${p}%"></div></div>`;
    h+=`<div class="th-attr-item"><span class="th-attr-name">${k}</span>${barHtml}${valHtml}</div>`;
  }
  for(const[k,v]of Object.entries(attrs)){
    if((ATTR_KEYS as readonly string[]).includes(k)) continue;
    const val=clamp(Number(v)||0,0,ATTR_MAX); const p=attrPct(val);
    const color=isEditMode?'':`background:${pickExtraAttrColor(extraIdx++)};`;
    const valHtml=isEditMode&&editPath?editableInput(`${val}`,editPath+'.'+k,'number'):`<span class="th-attr-val">${val}</span>`;
    const barHtml=isEditMode?'':`<div class="th-attr-bar-wrap"><div class="th-attr-bar-fill" style="width:${p}%;${color}"></div></div>`;
    h+=`<div class="th-attr-item"><span class="th-attr-name">${k}</span>${barHtml}${valHtml}</div>`;
  }
  h+=`</div>`;
  openModal(`<i class="fa-solid fa-chart-pie"></i> `+esc(name)+' · 属性',h);
}

// ================================================================
//  需求6：画廊弹窗
// ================================================================
function openGalleryModal(npcName:string) {
  const images=getNPCGallery(npcName);
  let h=`<div class="th-gallery-grid">`;
  images.forEach((url,idx)=>{
    h+=`<div class="th-gallery-item" data-gidx="${idx}"><img src="${escAttr(url)}" alt="画廊图片${idx+1}" data-gfull="${escAttr(url)}"><button class="th-gallery-delete" data-gdel="${idx}" data-gnpc="${escAttr(npcName)}"><i class="fa-solid fa-xmark"></i></button></div>`;
  });
  h+=`<div class="th-gallery-add" data-gadd="${escAttr(npcName)}"><i class="fa-solid fa-plus"></i></div>`;
  h+=`</div>`;
  openModal(`<i class="fa-solid fa-images"></i> `+esc(npcName)+' · 画廊',h);
  // 绑定事件
  setTimeout(()=>{
    // 图片点击→大图查看
    qsa('.th-gallery-item img').forEach(img=>img.addEventListener('click',function(this:HTMLElement){
      const full=this.getAttribute('data-gfull')||'';
      if(full) showImage(full);
    }));
    // 删除按钮
    qsa('.th-gallery-delete').forEach(btn=>btn.addEventListener('click',function(this:HTMLElement,e:Event){
      e.stopPropagation();
      const idx=parseInt(this.getAttribute('data-gdel')||'');
      const nm=this.getAttribute('data-gnpc')||'';
      if(!isNaN(idx)){ deleteNPCGalleryImage(nm,idx); closeModal(); openGalleryModal(nm); }
    }));
    // 添加按钮→触发文件选择
    qsa('.th-gallery-add').forEach(btn=>btn.addEventListener('click',function(this:HTMLElement,e:Event){
      e.stopPropagation();
      const nm=this.getAttribute('data-gadd')||'';
      const fi=qs<HTMLInputElement>('.th-avatar-file-input');
      if(fi){ (window as any).__galleryTarget__=nm; fi.setAttribute('multiple','multiple'); fi.click(); fi.removeAttribute('multiple'); }
    }));
  },40);
}
// 需求1：地点/事件总览弹窗
let locHoverTimer: ReturnType<typeof setTimeout>|null = null;
let locHoverTip: HTMLElement|null = null;

function ensureLocHoverTip(): HTMLElement {
  if (!locHoverTip) {
    locHoverTip = document.createElement('div');
    locHoverTip.className = 'th-loc-hover-tip';
    locHoverTip.style.display = 'none';
    document.body.appendChild(locHoverTip);
  }
  return locHoverTip;
}
function showLocHover(anchor:HTMLElement, name:string, desc:string, kind:ManagedKind='location') {
  if (locHoverTimer) clearTimeout(locHoverTimer);
  const cfg=MANAGED_CFG[kind];
  const state=managedEntryStates[kind][name];
  const bindText=state?.bound?`已绑定 ${state.count} 个条目，已开启 ${state.enabledCount} 个`:'未找到对应世界书条目';
  const tip = ensureLocHoverTip();
  tip.innerHTML = `<div class="th-loc-hover-name"><i class="${cfg.icon}"></i> ${esc(name)}</div><div class="th-loc-hover-desc">${esc(desc)}</div><div class="th-loc-hover-bind ${state?.bound?'bound':'unbound'}"><i class="fa-solid fa-circle-info"></i> ${esc(bindText)}</div>`;
  positionHoverTip(tip,anchor,400);
}
function hideLocHover() {
  locHoverTimer = setTimeout(() => {
    if (locHoverTip) locHoverTip.style.display = 'none';
  }, 150);
}
// 保持浮窗自身
document.addEventListener('mouseover', (e: Event) => {
  if (!locHoverTip || locHoverTip.style.display === 'none') return;
  if ((e.target as HTMLElement).closest('.th-loc-hover-tip')) {
    if (locHoverTimer) clearTimeout(locHoverTimer);
  }
});

function getCharWorldbookList(): string[] {
  const books=safeGetCharWorldbookNames('current');
  return [books.primary,...books.additional].filter((name): name is string=>!!name);
}

function parseManagedEntryName(entryName:string): {kind:ManagedKind|null; name:string} {
  for(const kind of Object.keys(MANAGED_CFG) as ManagedKind[]){
    const cfg=MANAGED_CFG[kind];
    if(entryName.startsWith(cfg.prefix)) return {kind,name:entryName.slice(cfg.prefix.length).trim()};
  }
  return {kind:null,name:entryName};
}

function strategyLabel(type:string): string {
  if(type==='constant') return '蓝灯';
  if(type==='selective') return '绿灯';
  if(type==='vectorized') return '向量';
  return type||'未知';
}
function positionLabel(type:string): string {
  const map:Record<string,string>={
    before_character_definition:'角色定义前', after_character_definition:'角色定义后',
    before_example_messages:'示例消息前', after_example_messages:'示例消息后',
    before_author_note:'作者注释前', after_author_note:'作者注释后',
    at_depth:'指定深度', outlet:'出口',
  };
  return map[type]||type||'未知';
}
function keysToText(keys:any[]): string { return (keys||[]).map(k=>String(k)).join('\n'); }
function textToKeys(text:string): string[] { return text.split(/\r?\n|,/).map(s=>s.trim()).filter(Boolean); }
function nullableNumberFromInput(value:string): number|null { const t=value.trim(); if(!t) return null; const n=Number(t); return isNaN(n)?null:n; }
function numberFromInput(value:string, fallback:number): number { const n=Number(value); return isNaN(n)?fallback:n; }
function boolFromSelect(value:string): boolean { return value==='true'; }

async function loadInspectorEntries(): Promise<InspectorEntry[]> {
  const books=getCharWorldbookList();
  const result:InspectorEntry[]=[];
  for(const book of books){
    const entries=await safeGetWorldbook(book);
    for(const entry of entries){
      const managed=parseManagedEntryName(entry.name);
      result.push({worldbookName:book,entry,managedKind:managed.kind,managedName:managed.name});
    }
  }
  return result;
}

async function updateInspectorEntry(worldbookName:string, uid:number, updater:(entry:WorldbookEntry)=>WorldbookEntry) {
  await safeUpdateWorldbookWith(worldbookName, entries=>entries.map(entry=>entry.uid===uid?updater(entry):entry), {render:'debounced'});
}

function inspectorSortRank(entry:WorldbookEntry): number {
  if(!entry.enabled) return 2;
  return entry.strategy?.type==='selective'?1:0;
}
function sortInspectorEntries(entries:InspectorEntry[]): InspectorEntry[] {
  return [...entries].sort((a,b)=>{
    const ra=inspectorSortRank(a.entry);
    const rb=inspectorSortRank(b.entry);
    if(ra!==rb) return ra-rb;
    const oa=a.entry.position?.order??0;
    const ob=b.entry.position?.order??0;
    if(oa!==ob) return ob-oa;
    return b.entry.name.localeCompare(a.entry.name,'zh-Hans-CN');
  });
}

async function refreshManagedStatesAfterWorldbookEdit() {
  await safeRefreshManagedEntryStates('location');
  await safeRefreshManagedEntryStates('event');
}

async function refreshManagedEntryStates(kind:ManagedKind): Promise<Record<string,ManagedEntryState>> {
  const cfg=MANAGED_CFG[kind];
  const names=Object.keys(getManagedItems(kind));
  const states: Record<string,ManagedEntryState> = {};
  for(const name of names) states[name]={bound:false,enabled:false,count:0,enabledCount:0,worldbookNames:[]};
  const books=getCharWorldbookList();
  for(const book of books){
    const entries=await safeGetWorldbook(book);
    for(const entry of entries){
      if(!entry.name.startsWith(cfg.prefix)) continue;
      const itemName=entry.name.slice(cfg.prefix.length).trim();
      if(!(itemName in states)) continue;
      const state=states[itemName];
      state.bound=true;
      state.count++;
      if(entry.enabled){ state.enabled=true; state.enabledCount++; }
      if(!state.worldbookNames.includes(book)) state.worldbookNames.push(book);
    }
  }
  managedEntryStates[kind]=states;
  return states;
}

async function safeRefreshManagedEntryStates(kind:ManagedKind) {
  try {
    await refreshManagedEntryStates(kind);
  } catch(e) {
    managedEntryStates[kind]={};
    console.warn(`[此间天地] ${MANAGED_CFG[kind].label}世界书绑定状态刷新失败`,e);
    toastr?.warning?.(`${MANAGED_CFG[kind].label}绑定状态刷新失败，请确认当前角色卡已绑定世界书`);
  }
}

async function toggleManagedWorldbookEntry(kind:ManagedKind, name:string, desc:string): Promise<boolean|null> {
  const cfg=MANAGED_CFG[kind];
  const targetName=cfg.prefix+name;
  const books=getCharWorldbookList();
  if(!books.length){ toastr?.warning?.('当前角色卡没有绑定世界书'); return null; }
  const currentState=managedEntryStates[kind][name];
  const nextEnabled=!currentState?.enabled;
  let touched=0;
  for(const book of books){
    await safeUpdateWorldbookWith(book, entries=>entries.map(entry=>{
      const matched=entry.name.startsWith(cfg.prefix)&&entry.name.slice(cfg.prefix.length).trim()===name;
      if(!matched) return entry;
      touched++;
      return {...entry, enabled:nextEnabled};
    }), {render:'debounced'});
  }
  if(!touched){
    toastr?.warning?.(`未找到世界书条目：${targetName}`);
    await safeRefreshManagedEntryStates(kind);
    return null;
  }
  await safeRefreshManagedEntryStates(kind);
  toastr?.success?.(`${nextEnabled?'已开启':'已关闭'}${cfg.label}：${name}`);
  if(nextEnabled){
    const text=kind==='location'
      ? `<前往${name}，该地点简介：${desc}>`
      : `<已开启事件：${name}，${desc}>`;
    try { safeTriggerSlash('/setinput '+tavernMacro('input')+' '+text); } catch(e) { void e; }
  }
  return nextEnabled;
}

async function disableAllManagedWorldbookEntries(kind:ManagedKind): Promise<number|null> {
  const cfg=MANAGED_CFG[kind];
  const books=getCharWorldbookList();
  if(!books.length){ toastr?.warning?.('当前角色卡没有绑定世界书'); return null; }
  let touched=0;
  let changed=0;
  try {
    for(const book of books){
      await safeUpdateWorldbookWith(book, entries=>entries.map(entry=>{
        if(!entry.name.startsWith(cfg.prefix)) return entry;
        touched++;
        if(entry.enabled) changed++;
        return {...entry, enabled:false};
      }), {render:'debounced'});
    }
    await safeRefreshManagedEntryStates(kind);
    if(!touched){ toastr?.info?.(`没有找到${cfg.label}世界书条目`); return 0; }
    if(!changed){ toastr?.info?.(`所有${cfg.label}条目已经处于关闭状态`); return 0; }
    toastr?.success?.(`已关闭 ${changed} 个${cfg.label}世界书条目`);
    return changed;
  } catch(e) {
    console.warn(`[此间天地] 批量关闭${cfg.label}世界书条目失败`,e);
    toastr?.error?.(`批量关闭${cfg.label}失败`);
    return null;
  }
}

async function openManagedModal(kind:ManagedKind) {
  const cfg=MANAGED_CFG[kind];
  setCurrentManagedItems(kind,getManagedItems(kind));
  await safeRefreshManagedEntryStates(kind);
  const entries = Object.entries(getCurrentManagedItems(kind));
  const idPrefix=kind==='location'?'th-loc':'th-event';
  let h = '';
  h += `<input type="file" id="${idPrefix}-import-file" accept=".txt" style="display:none">`;
  h += `<input class="th-location-search" id="${idPrefix}-search" placeholder="搜索${cfg.label}...">`;
  h += `<div class="th-location-grid th-managed-grid" id="${idPrefix}-grid" data-kind="${kind}">`;
  h += renderManagedCards(kind,entries);
  h += `</div>`;
  h += `<button class="th-location-add-btn" id="${idPrefix}-add-btn"><i class="fa-solid fa-plus"></i> 新建${cfg.label}</button>`;
  h += `<div class="th-location-add-form" id="${idPrefix}-add-form">
    <input id="${idPrefix}-new-name" placeholder="${cfg.label}名称" maxlength="50">
    <textarea id="${idPrefix}-new-desc" placeholder="${cfg.label}简介" rows="3"></textarea>
    <div class="th-loc-form-btns">
      <button class="th-loc-form-btn th-loc-form-btn-save" id="${idPrefix}-save-btn"><i class="fa-solid fa-check"></i> 保存</button>
      <button class="th-loc-form-btn th-loc-form-btn-cancel" id="${idPrefix}-cancel-btn"><i class="fa-solid fa-xmark"></i> 取消</button>
    </div>
  </div>`;

  const titleIcon=kind==='location'?'fa-solid fa-compass':'fa-solid fa-flag';
  openModal(`<i class="${titleIcon}"></i> ${cfg.storageName} (${entries.length}) <span class="th-modal-title-actions"><button class="th-title-io-btn" id="${idPrefix}-refresh-btn" title="刷新绑定状态"><i class="fa-solid fa-rotate"></i></button><button class="th-title-io-btn th-title-danger-btn" id="${idPrefix}-disable-all-btn" title="关闭全部${cfg.label}世界书条目"><i class="fa-solid fa-power-off"></i></button><button class="th-title-io-btn" id="${idPrefix}-export-btn" title="导出"><i class="fa-solid fa-download"></i></button><button class="th-title-io-btn" id="${idPrefix}-import-btn" title="导入"><i class="fa-solid fa-upload"></i></button></span>`, h);

  setTimeout(() => bindManagedModalEvents(kind,idPrefix), 100);
}

function openLocationsModal() { void openManagedModal('location'); }
function openEventsModal() { void openManagedModal('event'); }

function bindManagedModalEvents(kind:ManagedKind, idPrefix:string) {
  const cfg=MANAGED_CFG[kind];
  qs(`#${idPrefix}-refresh-btn`)?.addEventListener('click',async()=>{
    await safeRefreshManagedEntryStates(kind);
    rerenderManagedGrid(kind,idPrefix);
    toastr?.success?.(`${cfg.label}绑定状态已刷新`);
  });
  qs(`#${idPrefix}-disable-all-btn`)?.addEventListener('click',async()=>{
    if(!confirm(`确定要关闭所有已绑定的${cfg.label}世界书条目吗？`)) return;
    const result=await disableAllManagedWorldbookEntries(kind);
    if(result!==null) rerenderManagedGrid(kind,idPrefix,(qs<HTMLInputElement>(`#${idPrefix}-search`)?.value||'').trim().toLowerCase());
  });
  qs(`#${idPrefix}-export-btn`)?.addEventListener('click', () => {
    const items=getManagedItems(kind);
    let txt='';
    for(const [name,desc] of Object.entries(items)) txt+=name+'\t'+desc+'\n';
    const blob=new Blob([txt],{type:'text/plain;charset=utf-8'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=cfg.storageName+'_'+new Date().toISOString().slice(0,10)+'.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  qs(`#${idPrefix}-import-btn`)?.addEventListener('click', () => {
    const fi=qs<HTMLInputElement>(`#${idPrefix}-import-file`);
    if(fi) fi.click();
  });
  qs(`#${idPrefix}-import-file`)?.addEventListener('change', function(this:HTMLInputElement){
    if(!this.files||!this.files.length) return;
    const reader=new FileReader();
    reader.onload=()=>{
      const text=reader.result as string;
      const lines=text.split(/\r?\n/).filter(l=>l.trim());
      let imported=0;
      setCurrentManagedItems(kind,getManagedItems(kind));
      for(const line of lines){
        const idx=line.indexOf('\t');
        if(idx<=0) continue;
        const name=line.substring(0,idx).trim();
        const desc=line.substring(idx+1).trim();
        if(name&&desc){ addManagedItem(kind,name,desc); imported++; }
      }
      if(imported>0){ toastr?.success?.('成功导入'+imported+'个'+cfg.label); }
      else { toastr?.warning?.(`未识别到有效${cfg.label}数据（格式：名称<Tab>简介）`); }
      void openManagedModal(kind);
    };
    reader.readAsText(this.files[0],'utf-8');
    this.value='';
  });
  qs(`#${idPrefix}-search`)?.addEventListener('input', function(this: HTMLInputElement) {
    rerenderManagedGrid(kind,idPrefix,this.value.trim().toLowerCase());
  });
  bindManagedCardEvents(kind,idPrefix);

  qs(`#${idPrefix}-add-btn`)?.addEventListener('click', () => {
    const form = qs(`#${idPrefix}-add-form`); if (form) form.style.display = 'block';
    const btn = qs(`#${idPrefix}-add-btn`); if (btn) btn.style.display = 'none';
  });
  qs(`#${idPrefix}-cancel-btn`)?.addEventListener('click', () => {
    const form = qs(`#${idPrefix}-add-form`); if (form) form.style.display = 'none';
    const btn = qs(`#${idPrefix}-add-btn`); if (btn) btn.style.display = '';
    const nameInput = qs<HTMLInputElement>(`#${idPrefix}-new-name`); if (nameInput) nameInput.value = '';
    const descTextarea = qs<HTMLTextAreaElement>(`#${idPrefix}-new-desc`); if (descTextarea) descTextarea.value = '';
  });
  qs(`#${idPrefix}-save-btn`)?.addEventListener('click', () => {
    const nameInput = qs<HTMLInputElement>(`#${idPrefix}-new-name`);
    const descTextarea = qs<HTMLTextAreaElement>(`#${idPrefix}-new-desc`);
    const name = (nameInput?.value || '').trim();
    const desc = (descTextarea?.value || '').trim();
    if (!name) { toastr?.warning?.(`请输入${cfg.label}名称`); return; }
    if (!desc) { toastr?.warning?.(`请输入${cfg.label}简介`); return; }
    setCurrentManagedItems(kind,getManagedItems(kind));
    addManagedItem(kind, name, desc);
    void openManagedModal(kind);
  });
}

function rerenderManagedGrid(kind:ManagedKind, idPrefix:string, query='') {
  const items=getCurrentManagedItems(kind);
  const allEntries=Object.entries(items);
  const filtered=query ? allEntries.filter(([n,d])=>n.toLowerCase().includes(query)||d.toLowerCase().includes(query)) : allEntries;
  const grid=qs(`#${idPrefix}-grid`);
  if(grid) grid.innerHTML=renderManagedCards(kind,filtered);
  bindManagedCardEvents(kind,idPrefix);
}

function renderManagedCards(kind:ManagedKind, entries: [string, string][]): string {
  const cfg=MANAGED_CFG[kind];
  return entries.map(([name, desc])=>{
    const state=managedEntryStates[kind][name];
    const bound=!!state?.bound;
    const enabled=!!state?.enabled;
    const cls=`th-location-card th-managed-card ${kind==='event'?'th-event-card':''} ${bound?'bound':'unbound'} ${enabled?'enabled':''}`;
    const title=bound?`已绑定 ${state.count} 个条目，已开启 ${state.enabledCount} 个`:`未找到世界书条目：${cfg.prefix}${name}`;
    return `<div class="${cls}" data-managed-kind="${kind}" data-managed-name="${escAttr(name)}" data-managed-desc="${escAttr(desc)}" title="${escAttr(title)}">
      <span class="th-bind-dot ${bound?'bound':'unbound'}"></span>
      <i class="${cfg.icon}" style="color:${kind==='location'?'var(--pink)':'var(--lav)'};font-size:14px"></i>
      <span style="flex:1">${esc(name)}</span>
      <button class="th-managed-state" data-managed-toggle="${escAttr(name)}" title="点击${enabled?'关闭':'开启'}对应世界书条目">${enabled?'开启':'关闭'}</button>
      <button class="th-loc-delete" data-managed-del="${escAttr(name)}" title="删除${cfg.label}"><i class="fa-solid fa-xmark"></i></button>
    </div>`;
  }).join('');
}

function bindManagedCardEvents(kind:ManagedKind, idPrefix:string) {
  const cfg=MANAGED_CFG[kind];
  const grid=qs<HTMLElement>(`#${idPrefix}-grid`);
  if(!grid||grid.dataset.managedEventsBound==='true') return;
  grid.dataset.managedEventsBound='true';
  grid.addEventListener('click',async(e:Event)=>{
    const toggle=closestWithin<HTMLElement>(grid,e.target,'.th-managed-state');
    if(toggle){
      e.stopPropagation();
      const name=toggle.getAttribute('data-managed-toggle')||'';
      const card=toggle.closest('.th-managed-card') as HTMLElement|null;
      const desc=card?.getAttribute('data-managed-desc')||'';
      if(name){
        const result=await toggleManagedWorldbookEntry(kind,name,desc);
        if(result!==null) rerenderManagedGrid(kind,idPrefix,(qs<HTMLInputElement>(`#${idPrefix}-search`)?.value||'').trim().toLowerCase());
      }
      return;
    }
    const del=closestWithin<HTMLElement>(grid,e.target,'.th-loc-delete');
    if(del){
      e.stopPropagation();
      const name=del.getAttribute('data-managed-del')||'';
      if(name&&confirm(`确定要删除${cfg.label}「${name}」吗？`)){
        setCurrentManagedItems(kind,getManagedItems(kind));
        deleteManagedItem(kind,name);
        void openManagedModal(kind);
      }
      return;
    }
    const card=closestWithin<HTMLElement>(grid,e.target,'.th-managed-card');
    if(!card) return;
    const name=card.getAttribute('data-managed-name')||'';
    const desc=card.getAttribute('data-managed-desc')||'';
    if(!name) return;
    const text=kind==='location'
      ? `<前往${name}，该地点简介：${desc}>`
      : `<已开启事件：${name}，${desc}>`;
    try { safeTriggerSlash('/setinput '+tavernMacro('input')+' '+text); } catch(err) { void err; }
    closeModal();
  });
  grid.addEventListener('mouseover',(e:MouseEvent)=>{
    const card=enteredWithin<HTMLElement>(grid,e,'.th-managed-card');
    if(!card) return;
    showLocHover(card,card.getAttribute('data-managed-name')||'',card.getAttribute('data-managed-desc')||'',kind);
  });
  grid.addEventListener('mouseout',(e:MouseEvent)=>{
    if(leftWithin(grid,e,'.th-managed-card')) hideLocHover();
  });
}

// ================================================================
//  世界书识别 / 编辑器
// ================================================================
async function openWorldbookInspectorModal(filter='') {
  let entries:InspectorEntry[]=[];
  try { entries=await loadInspectorEntries(); }
  catch(e){ console.warn('[此间天地] 世界书读取失败',e); toastr?.warning?.('世界书读取失败，请确认当前角色卡已绑定世界书'); entries=[]; }
  entries=sortInspectorEntries(entries);
  const q=filter.trim().toLowerCase();
  const filtered=q?entries.filter(item=>`${item.worldbookName} ${item.entry.name} ${item.entry.content}`.toLowerCase().includes(q)):entries;
  let h=`<div class="th-wb-tools"><input class="th-wb-search" id="th-wb-search" placeholder="搜索世界书、条目名或内容..." value="${escAttr(filter)}"><button class="th-wb-refresh" id="th-wb-refresh"><i class="fa-solid fa-rotate"></i> 刷新</button></div>`;
  if(!entries.length) h+=`<div class="th-empty"><i class="fa-solid fa-book-open"></i> 当前角色卡没有可读取的世界书条目</div>`;
  else h+=`<div class="th-wb-summary"><i class="fa-solid fa-book"></i> 已读取 ${entries.length} 个角色卡世界书条目，当前显示 ${filtered.length} 个</div><div class="th-wb-list">${renderWorldbookInspectorList(filtered)}</div>`;
  openModal(`<i class="fa-solid fa-book-open"></i> 世界书识别 <span class="th-modal-title-actions"><button class="th-title-io-btn" id="th-wb-title-refresh" title="刷新"><i class="fa-solid fa-rotate"></i></button></span>`,h);
  setTimeout(()=>bindWorldbookInspectorEvents(filter),60);
}

function renderWorldbookInspectorList(items:InspectorEntry[]): string {
  return items.map(item=>{
    const e=item.entry;
    const managed=item.managedKind?`<span class="th-wb-prefix ${item.managedKind}">${MANAGED_CFG[item.managedKind].prefix}</span>`:'';
    const strategy=e.strategy?.type||'constant';
    const pos=e.position||{} as WorldbookEntry['position'];
    return `<div class="th-wb-row" data-wb="${escAttr(item.worldbookName)}" data-uid="${e.uid}">
      <div class="th-wb-row-main">
        <span class="th-bind-dot ${e.enabled?'bound':'unbound'}"></span>
        <div class="th-wb-row-title"><span class="th-wb-name">${managed}${esc(e.name)}</span><span class="th-wb-book"><i class="fa-solid fa-book"></i> ${esc(item.worldbookName)} · order ${esc(pos.order??0)}</span></div>
      </div>
      <div class="th-wb-row-actions">
        <button class="th-wb-chip th-wb-toggle ${e.enabled?'on':'off'}" data-wb-action="toggle">${e.enabled?'开启':'关闭'}</button>
        <button class="th-wb-chip strategy ${strategy}" data-wb-action="strategy">${strategyLabel(strategy)}</button>
        <span class="th-wb-chip pos">${esc(positionLabel(pos.type))}</span>
        <button class="th-wb-detail-btn" data-wb-action="detail"><i class="fa-solid fa-pen-to-square"></i> 详情</button>
      </div>
    </div>`;
  }).join('');
}

function bindWorldbookInspectorEvents(filter:string) {
  qs('#th-wb-refresh')?.addEventListener('click',()=>{ void openWorldbookInspectorModal((qs<HTMLInputElement>('#th-wb-search')?.value||filter)); });
  qs('#th-wb-title-refresh')?.addEventListener('click',()=>{ void openWorldbookInspectorModal((qs<HTMLInputElement>('#th-wb-search')?.value||filter)); });
  qs('#th-wb-search')?.addEventListener('input',function(this:HTMLInputElement){
    const value=this.value;
    window.clearTimeout((window as any).__wbSearchTimer__);
    (window as any).__wbSearchTimer__=window.setTimeout(()=>void openWorldbookInspectorModal(value),180);
  });
  qsa('.th-wb-row').forEach(row=>row.addEventListener('click',async function(this:HTMLElement,e:Event){
    const action=(e.target as HTMLElement).closest<HTMLElement>('[data-wb-action]')?.getAttribute('data-wb-action')||'';
    if(!action) return;
    e.stopPropagation();
    const worldbookName=this.getAttribute('data-wb')||'';
    const uid=Number(this.getAttribute('data-uid'));
    if(!worldbookName||isNaN(uid)) return;
    if(action==='detail'){ await openWorldbookEntryDetail(worldbookName,uid); return; }
    if(action==='toggle'){
      await updateInspectorEntry(worldbookName,uid,entry=>({...entry,enabled:!entry.enabled}));
    } else if(action==='strategy'){
      await updateInspectorEntry(worldbookName,uid,entry=>{
        const current=entry.strategy?.type||'constant';
        const next=current==='constant'?'selective':'constant';
        const fallback=parseManagedEntryName(entry.name).name||entry.name;
        return {...entry,strategy:{...entry.strategy,type:next,keys:next==='selective'&&(!entry.strategy.keys||!entry.strategy.keys.length)?[fallback]:entry.strategy.keys}};
      });
    }
    await refreshManagedStatesAfterWorldbookEdit();
    void openWorldbookInspectorModal((qs<HTMLInputElement>('#th-wb-search')?.value||filter));
  }));
}

async function openWorldbookEntryDetail(worldbookName:string, uid:number) {
  const entries=await safeGetWorldbook(worldbookName);
  const entry=entries.find(e=>e.uid===uid);
  if(!entry){ toastr?.warning?.('条目不存在，可能已被修改或删除'); return; }
  const h=renderWorldbookEntryEditor(worldbookName,entry);
  openModal2(`<i class="fa-solid fa-pen-to-square"></i> 世界书条目设置`,h);
  setTimeout(()=>bindWorldbookEntryEditor(worldbookName,uid),60);
}

function renderSelect(name:string, value:string, options:[string,string][]): string {
  return `<select class="th-wb-field" data-wb-field="${name}">${options.map(([v,l])=>`<option value="${escAttr(v)}" ${v===value?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
}
function renderInput(name:string,value:any,type='text'): string { return `<input class="th-wb-field" data-wb-field="${name}" type="${type}" value="${escAttr(value??'')}">`; }
function renderTextarea(name:string,value:any,rows=3): string { return `<textarea class="th-wb-field" data-wb-field="${name}" rows="${rows}">${esc(value??'')}</textarea>`; }
function renderBool(name:string,value:boolean): string { return renderSelect(name,String(!!value),[['true','是'],['false','否']]); }

function renderWorldbookEntryEditor(worldbookName:string, entry:WorldbookEntry): string {
  const s=entry.strategy||{} as WorldbookEntry['strategy'];
  const p=entry.position||{} as WorldbookEntry['position'];
  const r=entry.recursion||{} as WorldbookEntry['recursion'];
  const ef=entry.effect||{} as WorldbookEntry['effect'];
  return `<div class="th-wb-editor" data-wb="${escAttr(worldbookName)}" data-uid="${entry.uid}">
    <div class="th-wb-editor-meta"><span><i class="fa-solid fa-book"></i> ${esc(worldbookName)}</span><span>order ${esc(entry.position?.order??0)}</span></div>
    <div class="th-wb-form-grid">
      <label>条目名称${renderInput('name',entry.name)}</label>
      <label>启用状态${renderBool('enabled',entry.enabled)}</label>
      <label>激活策略${renderSelect('strategy.type',s.type||'constant', [['constant','蓝灯 / 常量'],['selective','绿灯 / 关键词'],['vectorized','向量化']])}</label>
      <label>激活概率%${renderInput('probability',entry.probability??100,'number')}</label>
      <label>扫描深度${renderInput('strategy.scan_depth',s.scan_depth==='same_as_global'?'':s.scan_depth??'','number')}</label>
      <label>次要逻辑${renderSelect('strategy.keys_secondary.logic',s.keys_secondary?.logic||'and_any', [['and_any','任一满足'],['and_all','全部满足'],['not_all','不全满足'],['not_any','全部不满足']])}</label>
      <label>插入位置${renderSelect('position.type',p.type||'after_character_definition', [['before_character_definition','角色定义前'],['after_character_definition','角色定义后'],['before_example_messages','示例消息前'],['after_example_messages','示例消息后'],['before_author_note','作者注释前'],['after_author_note','作者注释后'],['at_depth','指定深度'],['outlet','出口']])}</label>
      <label>插入身份${renderSelect('position.role',p.role||'system', [['system','system'],['assistant','assistant'],['user','user']])}</label>
      <label>插入深度${renderInput('position.depth',p.depth??4,'number')}</label>
      <label>排序 order${renderInput('position.order',p.order??100,'number')}</label>
      <label>黏性 sticky${renderInput('effect.sticky',ef.sticky??'','number')}</label>
      <label>冷却 cooldown${renderInput('effect.cooldown',ef.cooldown??'','number')}</label>
      <label>延迟 delay${renderInput('effect.delay',ef.delay??'','number')}</label>
      <label>递归延迟${renderInput('recursion.delay_until',r.delay_until??'','number')}</label>
      <label>禁止入递归${renderBool('recursion.prevent_incoming',!!r.prevent_incoming)}</label>
      <label>禁止出递归${renderBool('recursion.prevent_outgoing',!!r.prevent_outgoing)}</label>
    </div>
    <div class="th-wb-form-wide">
      <label>主要关键词（逗号或换行分隔）${renderTextarea('strategy.keys',keysToText(s.keys||[]),3)}</label>
      <label>次要关键词（逗号或换行分隔）${renderTextarea('strategy.keys_secondary.keys',keysToText(s.keys_secondary?.keys||[]),3)}</label>
      <label>条目内容${renderTextarea('content',entry.content||'',8)}</label>
      <label>额外数据 extra（JSON，可留空）${renderTextarea('extra',entry.extra?JSON.stringify(entry.extra,null,2):'',4)}</label>
    </div>
    <div class="th-wb-editor-actions"><button class="th-wb-save" id="th-wb-entry-save"><i class="fa-solid fa-floppy-disk"></i> 保存修改</button><button class="th-wb-cancel" id="th-wb-entry-cancel"><i class="fa-solid fa-xmark"></i> 取消</button></div>
  </div>`;
}

function getWbFieldValue(field:string): string { return (qs<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>(`[data-wb-field="${field}"]`)?.value||''); }
function bindWorldbookEntryEditor(worldbookName:string, uid:number) {
  qs('#th-wb-entry-cancel')?.addEventListener('click',closeModal2);
  qs('#th-wb-entry-save')?.addEventListener('click',async()=>{
    try{
      await updateInspectorEntry(worldbookName,uid,entry=>{
        const extraRaw=getWbFieldValue('extra').trim();
        let extra:any=undefined;
        if(extraRaw) extra=JSON.parse(extraRaw);
        const strategyType=getWbFieldValue('strategy.type') as WorldbookEntry['strategy']['type'];
        const keys=textToKeys(getWbFieldValue('strategy.keys'));
        const fallback=parseManagedEntryName(getWbFieldValue('name')).name||getWbFieldValue('name');
        return {
          ...entry,
          name:getWbFieldValue('name').trim()||entry.name,
          enabled:boolFromSelect(getWbFieldValue('enabled')),
          probability:clamp(numberFromInput(getWbFieldValue('probability'),entry.probability??100),0,100),
          content:getWbFieldValue('content'),
          extra,
          strategy:{
            ...entry.strategy,
            type:strategyType,
            keys:strategyType==='selective'&&!keys.length?[fallback]:keys,
            scan_depth:getWbFieldValue('strategy.scan_depth').trim()?numberFromInput(getWbFieldValue('strategy.scan_depth'),1):'same_as_global',
            keys_secondary:{
              logic:getWbFieldValue('strategy.keys_secondary.logic') as WorldbookEntry['strategy']['keys_secondary']['logic'],
              keys:textToKeys(getWbFieldValue('strategy.keys_secondary.keys')),
            },
          },
          position:{
            ...entry.position,
            type:getWbFieldValue('position.type') as WorldbookEntry['position']['type'],
            role:getWbFieldValue('position.role') as WorldbookEntry['position']['role'],
            depth:numberFromInput(getWbFieldValue('position.depth'),entry.position?.depth??4),
            order:numberFromInput(getWbFieldValue('position.order'),entry.position?.order??100),
          },
          recursion:{
            prevent_incoming:boolFromSelect(getWbFieldValue('recursion.prevent_incoming')),
            prevent_outgoing:boolFromSelect(getWbFieldValue('recursion.prevent_outgoing')),
            delay_until:nullableNumberFromInput(getWbFieldValue('recursion.delay_until')),
          },
          effect:{
            sticky:nullableNumberFromInput(getWbFieldValue('effect.sticky')),
            cooldown:nullableNumberFromInput(getWbFieldValue('effect.cooldown')),
            delay:nullableNumberFromInput(getWbFieldValue('effect.delay')),
          },
        };
      });
      await refreshManagedStatesAfterWorldbookEdit();
      toastr?.success?.('世界书条目已保存');
      closeModal2();
      void openWorldbookInspectorModal((qs<HTMLInputElement>('#th-wb-search')?.value||''));
    }catch(e){ console.warn('[此间天地] 保存世界书条目失败',e); toastr?.error?.('保存失败：请检查 extra JSON 或字段内容'); }
  });
}

// 需求7：衣物列表弹窗
function openClothingListModal(npcName:string, clothing:Record<string,any>) {
  const entries=Object.entries(clothing);
  if(!entries.length){ openModal(esc(npcName)+' · 衣物','<div class="th-empty"><i class="fa-solid fa-vest"></i> 暂无穿着</div>'); return; }
  let h='<div class="th-block-row">';
  for(const[cn,ci] of entries){
    const c=ci as any; const state=c?.['衣物状态']||'';
    const dot=getDotCls(state);
    h+=`<span class="th-block th-block-clothing th-fold-trigger" data-btype="clothing" data-bname="${escAttr(cn)}" data-bpart="${escAttr(c?.['穿着部位']||'')}" data-bstate="${escAttr(state)}" data-bdetail="${escAttr(c?.['外观详情']||'')}" data-bpath="NPC.${escAttr(npcName)}.当前穿着衣物.${escAttr(cn)}"><i class="fa-solid fa-vest"></i> ${esc(cn)} · ${esc(c?.['穿着部位']||'')} <span class="th-tag-dot ${dot}"></span><span class="th-fold-arrow" style="margin-left:auto;font-size:10px"><i class="fa-solid fa-chevron-down"></i></span></span>`;
  }
  h+=`</div><div class="th-fold-detail" style="display:none"></div>`;
  openModal(`<i class="fa-solid fa-vest"></i> `+esc(npcName)+' · 当前穿着',h);
  setTimeout(()=>{
    bindClothingFoldDown(npcName);
  },40);
}

// ================================================================
//  弹窗系统 — 需求3：二级弹窗支持堆叠
// ================================================================
function openModal(t:string,b:string){ hideHoverTipNow(); hideMetricWheel(); setH('.th-modal-title',t); setH('.th-modal-body',b); const o=qs('.th-modal-overlay'); if(o)o.style.display='flex'; }
function closeModal(){ const o=qs('.th-modal-overlay'); if(o)o.style.display='none'; }
function openModal2(t:string,b:string){
  hideHoverTipNow(); hideMetricWheel();
  const overlay=qs('.th-modal-overlay-2'); if(!overlay) return;
  setH('.th-modal-title-2',t); setH('.th-modal-body-2',b);
  overlay.style.display='flex';
}
function closeModal2(){
  const overlay=qs('.th-modal-overlay-2'); if(overlay) overlay.style.display='none';
  setH('.th-modal-title-2',''); setH('.th-modal-body-2','');
}

// ================================================================
//  需求9：编辑模式 — 全面覆盖
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
document.addEventListener('change',(e:Event)=>{
  if(!isEditMode||!currentData) return;
  const target=e.target as HTMLElement;
  if(!target.classList.contains('th-edit-input')&&!target.classList.contains('th-edit-textarea')) return;
  const path=target.getAttribute('data-edit-path')||'';
  const val=(target as HTMLInputElement).value;
  applyEdit(path,val);
});

document.addEventListener('click',(e:Event)=>{
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
});
// 对于 contenteditable span
document.addEventListener('blur',(e:Event)=>{
  if(!isEditMode||!currentData) return;
  const target=e.target as HTMLElement;
  if(!target.classList.contains('th-editable')||!target.getAttribute('contenteditable')) return;
  const path=target.getAttribute('data-edit-path')||'';
  const val=target.textContent||'';
  applyEdit(path,val);
},true);

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
    // 延迟重新渲染（避免在 change 事件处理过程中刷新 DOM）
    setTimeout(()=>{ renderCurrent(); },50);
  } catch(e) {
    console.warn('[此间天地] applyEdit failed:',path,val,e);
  }
}

type AddKind='item'|'skill'|'status'|'clothing';
function isAddKind(v:any): v is AddKind { return v==='item'||v==='skill'||v==='status'||v==='clothing'; }
function getDefaultEntry(kind:AddKind): Record<string,any> {
  switch(kind){
    case 'item': return {数量:1,简介:'',效果:'',评价:''};
    case 'skill': return {等级:1,简介:'',效果:'',评价:''};
    case 'status': return {效果:'',来源:'',持续时间:''};
    case 'clothing': return {穿着部位:'',衣物状态:'',外观详情:''};
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
function commitAdd(basePath:string,name:string,payload:Record<string,any>): boolean {
  if(!currentData) return false;
  const trimmed=name.trim();
  if(!trimmed){ toastr?.warning?.('名称不能为空'); return false; }
  if(isNameTaken(basePath,trimmed)){ toastr?.warning?.('已存在同名条目'); return false; }
  try {
    const resolved=resolveDataPath(basePath);
    const map={...(_.get(currentData,resolved,{})||{})};
    map[trimmed]=payload;
    _.set(currentData,resolved,map);
    saveData(currentData);
    setTimeout(()=>{ renderCurrent(); },50);
    toastr?.success?.(`已添加：${trimmed}`);
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
    clothing:['名称','穿着部位','衣物状态','外观详情'],
  };
  const longFields=new Set(['简介','效果','评价','外观详情']);
  const defaults=getDefaultEntry(kind);
  let h=`<div class="th-add-form" data-add-kind="${kind}" data-add-base="${escAttr(basePath)}">`;
  for(const f of fieldOrder[kind]){
    const value=f==='名称'?'':(defaults[f]??'');
    const isNum=(kind==='item'&&f==='数量')||(kind==='skill'&&f==='等级');
    h+=`<div class="th-modal-section"><div class="th-modal-label">${esc(f)}</div>`;
    if(longFields.has(f)) h+=`<textarea class="th-add-field" data-add-field="${escAttr(f)}" rows="3">${esc(value)}</textarea>`;
    else h+=`<input class="th-add-field" data-add-field="${escAttr(f)}" type="${isNum?'number':'text'}" value="${escAttr(value)}">`;
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
  w.classList.toggle('collapsed');
}

// ================================================================
//  工具
// ================================================================
const HTML_ENTITY_PREFIX = String.fromCharCode(38);
const ESC_MAP: Record<string,string> = {
  '&': HTML_ENTITY_PREFIX+'amp;',
  '<': HTML_ENTITY_PREFIX+'lt;',
  '>': HTML_ENTITY_PREFIX+'gt;',
  '"': HTML_ENTITY_PREFIX+'quot;',
  "'": HTML_ENTITY_PREFIX+'#39;',
};
function esc(s:any):string { return String(s).replace(/[&<>"']/g,ch=>ESC_MAP[ch]); }
function escAttr(s:any):string { return esc(s); }
function getAvatarColor(name:string,idx:number):string { if(!avatarColorMap[name]) avatarColorMap[name]=AVATAR_COLORS[idx%AVATAR_COLORS.length]; return avatarColorMap[name]; }
function deleteAvatar(t:string){ delete avatarImages[t]; saveImages(); if(t==='user')renderUserAvatar(); else if(currentData)renderNPCGrid(currentData); }
function showImage(u:string){ const o=qs('.th-image-overlay'); const i=qs<HTMLImageElement>('.th-image-full'); if(o&&i){i.setAttribute('src',u);o.style.display='flex';} }
function hideImage(){ const o=qs('.th-image-overlay'); if(o)o.style.display='none'; }
function getDotCls(effectOrState:string):string{
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
  qs('.th-btn-refresh')?.addEventListener('click',()=>{refresetH();});
  qs('.th-btn-darkmode')?.addEventListener('click',()=>{
    const w=gw(); if(!w) return;
    w.classList.toggle('dark'); isDarkMode=w.classList.contains('dark');
    const btn=qs<HTMLButtonElement>('.th-btn-darkmode');
    if(btn) btn.innerHTML=isDarkMode?'<i class="fa-solid fa-sun"></i>':'<i class="fa-solid fa-moon"></i>';
  });
  qs('.th-btn-fullscreen')?.addEventListener('click',()=>{const w=gw();if(!w)return;if(document.fullscreenElement){void document.exitFullscreen();}else{void w.requestFullscreen().catch(()=>undefined);}});
  // 需求1：地点/事件总览按钮
  qs('.th-btn-locations')?.addEventListener('click',()=>{openLocationsModal();});
  qs('.th-btn-events')?.addEventListener('click',()=>{openEventsModal();});
  qs('.th-btn-worldbook')?.addEventListener('click',()=>{void openWorldbookInspectorModal();});
  // 需求9：NPC在场筛选按钮
  qsa('.th-npc-filter-btn').forEach(btn=>btn.addEventListener('click',function(this:HTMLElement){
    const f=this.getAttribute('data-filter') as 'all'|'present'|'absent';
    if(!f) return;
    npcFilter=f;
    qsa('.th-npc-filter-btn').forEach(b=>b.classList.remove('active'));
    this.classList.add('active');
    _renderCache.npc = '';
    renderCurrent();
  }));
  // 编辑按钮
  qs('.th-btn-edit')?.addEventListener('click',()=>{toggleEditMode();});
  // 标题折叠
  qs('.th-topbar-title')?.addEventListener('click',()=>{toggleCollapse();});

  // 头像
  qs('.th-avatar-upload')?.addEventListener('click',()=>{const u=avatarImages['user']||'';if(u)showImage(u);else{uploadingTarget='user';qs<HTMLInputElement>('.th-avatar-file-input')?.click();}});
  qs('.th-avatar-btn-upload')?.addEventListener('click',(e:Event)=>{e.stopPropagation();uploadingTarget='user';qs<HTMLInputElement>('.th-avatar-file-input')?.click();});
  qs('.th-avatar-btn-delete')?.addEventListener('click',(e:Event)=>{e.stopPropagation();deleteAvatar('user');});

  // 文件上传（支持头像和画廊）
  const fi=qs<HTMLInputElement>('.th-avatar-file-input');
  if(fi) fi.addEventListener('change',function(this:HTMLInputElement){
    if(!this.files||!this.files.length) return;
    const galleryTarget=(window as any).__galleryTarget__||'';
    if(galleryTarget){
      // 需求6：画廊多图上传
      let loaded=0;
      Array.from(this.files).forEach(file=>{
        const r=new FileReader();
        r.onload=()=>{ addNPCGalleryImage(galleryTarget,r.result as string); loaded++; if(loaded===this.files!.length){ closeModal(); openGalleryModal(galleryTarget); (window as any).__galleryTarget__=''; } };
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

  // 需求4：姿态/身体 hover 显示信息 + click 弹详情编辑弹窗
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
  // 二级弹窗关闭
  qs('.th-modal-close-2')?.addEventListener('click',closeModal2);
  qs('.th-modal-overlay-2')?.addEventListener('click',function(e:Event){ if(e.target===this) closeModal2(); });
  // 需求6：点击遮罩空白处→详情回退到网格，否则关闭弹窗
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
      const trigger=document.querySelector('.th-fold-trigger .fa-chevron-up');
      if(trigger) trigger.outerHTML='<i class="fa-solid fa-chevron-down"></i>';
      return;
    }
    closeModal();
  });
  // 需求6：点击弹窗主体空白处（非详情区域）→ 回退到网格
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
  document.addEventListener('keydown',(e:KeyboardEvent)=>{if(e.key==='Escape'){const o2=qs('.th-modal-overlay-2');if(o2&&o2.style.display!=='none'){closeModal2();return;}closeModal();hideImage();}});

  // 全局点击关闭浮动元素
  document.addEventListener('click',(e:Event)=>{
    const tip=qs('.th-hover-tip'); if(!tip||tip.style.display==='none') return;
    if(!(e.target as HTMLElement).closest('.th-block') && !(e.target as HTMLElement).closest('.th-hover-tip')){
      tip.style.display='none';
    }
  });
}

// ================================================================
//  初始化
// ================================================================
$(async()=>{
  try {
    // 正则替换环境不一定有 MVU iframe 对象；主数据读取优先依赖酒馆助手变量 API。
    if (!(window as any).Mvu) {
      try { (window as any).Mvu = getRoot().Mvu; } catch(e) { void e; }
    }
    await waitForVariableApi();
    await waitUntil(()=>hasStatData(activeMessageOption),150,15000);
    // 单次读取 {type:'chat'} 变量，同时取回头像与画廊数据
    const chatVars = (() => { try { return safeGetVariables({type:'chat'}); } catch(e){ return {} as Record<string,any>; } })();
    const im = _.get(chatVars, IMG_KEY, {});
    avatarImages = im && typeof im === 'object' ? im : {};
    const g = _.get(chatVars, GALLERY_KEY, {});
    galleryImages = g && typeof g === 'object' ? g : {};
    avatarVersion++;
    avatarColorMap = {};
    const w=gw(); if(!w) return; w.setAttribute('data-th-id',_wrapperId);
    // 需求8：解除iframe裁剪限制
    try {
      const iframe=window.frameElement as HTMLElement;
      if(iframe){
        iframe.style.overflow='visible';
        let parent=iframe.parentElement;
        while(parent){
          const ov=getComputedStyle(parent).overflow;
          if(ov==='hidden'||ov==='clip'){ (parent as HTMLElement).style.overflow='visible'; }
          parent=parent.parentElement;
        }
      }
    } catch(e){ void e; }
    refresetH(); bindEvents();
    try{
      const localEventOn = (window as any).eventOn || getRoot().eventOn;
      const mvu = getMvu();
      if(typeof localEventOn==='function'&&mvu?.events?.VARIABLE_UPDATE_ENDED){
        localEventOn(mvu.events.VARIABLE_UPDATE_ENDED,()=>{scheduleRender();});
      }
    }catch(e){ void e; }
    if(!currentData){
      const deadline=Date.now()+15000;
      const timer=window.setInterval(()=>{
        const data=readData();
        if(data){
          currentData=data;
          render(data);
          window.clearInterval(timer);
        } else if(Date.now()>deadline){
          window.clearInterval(timer);
          console.warn('[此间天地] 未在最新楼层读取到 stat_data，请确认酒馆助手变量 API 可用或手动刷新');
        }
      },300);
    }
  } catch(e) { console.error('[此间天地]init fail:',e); }
});

(window as any).__uploadTarget__ = '';
(window as any).__deleteAvatar__ = (t:string)=>{ deleteAvatar(t); };
