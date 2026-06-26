// NPC 详情 + 属性 + 画廊（解耦阶段 1f）。
// 从 status-bar-init.ts 纯移动；行为保持一致。
// currentData/isEditMode/avatarImages 为主文件 whole-reassigned 状态，通过 getter 懒读防引用断开（§4.2）。
// uploadingTarget 模块只写，走 setUploadingTarget setter。
// closestWithin/enteredWithin/leftWithin 已并入 lib/dom-utils，与主面板 bindBlockHoverAndClick 共用。
// 1g hover-tip 系列函数已抽至 ./hover-tip，本模块 import 调用（延迟在事件回调内，ESM live binding 安全）。
// ================================================================
import {
  esc,
  escAttr,
  qs,
  qsa,
  clamp,
  editableInput,
  editableTextarea,
  closestWithin,
  enteredWithin,
  leftWithin,
} from '../lib/dom-utils';
import {
  ATTR_KEYS,
  ATTR_MAX,
  ATTR_CLS,
  NPC_METRICS,
  NPC_COUNTS,
  NPC_ICON_CFG,
  pickExtraAttrColor,
} from '../lib/config';
import {
  openNPCBag,
  openNPCSkill,
} from './item-skill-grid';
import {
  getNPCInfo,
  getNPCs,
  getCurrentStatusData,
  getAvatarImages,
  getStatusEditMode,
  setUploadingTarget,
  getAvatarColor,
  deleteAvatar,
  showImage,
  openModal,
  openModal2,
  closeModal,
  closeModal2,
  bindBlockHoverAndClick,
  getNPCGallery,
  deleteNPCGalleryImage,
  toggleNpcPresence,
  toggleClothingField,
  getDotCls,
  attrPct,
  openClothingListModal,
} from '../status-bar-init';
// 1g hover-tip 系列已抽至 ./hover-tip（阶段 1g）
import {
  showHoverTip,
  hideHoverTip,
  showMetricWheel,
  hideMetricWheel,
  showNpcStatusHover,
  showItemsHoverTip,
  showSkillsHoverTip,
  showClothingHoverTip,
} from './hover-tip';

export function bindNPCGridEvents(container:HTMLElement) {
  if(container.dataset.npcEventsBound==='true') return;
  container.dataset.npcEventsBound='true';

  container.addEventListener('click',(e:Event)=>{
    const t=e.target as HTMLElement;
    const attr=closestWithin<HTMLElement>(container,t,'.th-npc-attr-corner');
    if(attr){
      e.stopPropagation();
      const nm=attr.getAttribute('data-npc-attr')||'';
      const info=getNPCInfo(getCurrentStatusData(),nm);
      if(info) openAttrModal(nm,_.get(info,'属性',{})||{}, `NPC.${nm}.属性`);
      return;
    }
    const avatar=closestWithin<HTMLElement>(container,t,'.th-npc-avatar-wrap');
    if(avatar){
      e.stopPropagation();
      const nm=avatar.getAttribute('data-avatar-target')||'';
      const url=getAvatarImages()['npc:'+nm]||'';
      if(url) showImage(url);
      else { setUploadingTarget('npc:'+nm); qs<HTMLInputElement>('.th-avatar-file-input')?.click(); }
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
      const info=getNPCInfo(getCurrentStatusData(),nm);
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
    if(nm&&getCurrentStatusData()) openNPCDetail(nm);
  });

  container.addEventListener('mouseover',(e:MouseEvent)=>{
    const attr=enteredWithin<HTMLElement>(container,e,'.th-npc-attr-corner');
    if(attr){
      const nm=attr.getAttribute('data-npc-attr')||'';
      const info=getNPCInfo(getCurrentStatusData(),nm);
      if(info) showHoverTip(attr,'attr',{name:nm,html:buildAttrBarHtml(_.get(info,'属性',{})||{})});
      return;
    }
    const avatar=enteredWithin<HTMLElement>(container,e,'.th-npc-avatar-wrap');
    if(avatar){
      const nm=avatar.getAttribute('data-avatar-target')||'';
      const info=getNPCInfo(getCurrentStatusData(),nm);
      if(info) showMetricWheel(avatar,info);
      return;
    }
    const nameEl=enteredWithin<HTMLElement>(container,e,'.th-npc-name');
    if(nameEl){
      const nm=nameEl.getAttribute('data-npcnm')||'';
      const info=getNPCInfo(getCurrentStatusData(),nm);
      if(info) showHoverTip(nameEl,'identity',{name:nm,identity:info['身份']||'无'});
      return;
    }
    const status=enteredWithin<HTMLElement>(container,e,'.th-npc-icon-status');
    if(status){
      const nm=status.getAttribute('data-npc-status')||'';
      const info=getNPCInfo(getCurrentStatusData(),nm);
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
      const info=getNPCInfo(getCurrentStatusData(),nm);
      if(info) showItemsHoverTip(bag,_.get(info,'拥有物品',{})||{},'背包');
      return;
    }
    const skill=enteredWithin<HTMLElement>(container,e,'.th-npc-av-icon-skill');
    if(skill){
      const nm=skill.getAttribute('data-npc-skill')||'';
      const info=getNPCInfo(getCurrentStatusData(),nm);
      if(info) showSkillsHoverTip(skill,_.get(info,'拥有技能',{})||{},'技能');
      return;
    }
    const clothing=enteredWithin<HTMLElement>(container,e,'.th-npc-clothing-corner');
    if(clothing){
      const nm=clothing.getAttribute('data-npc-clothing')||'';
      const info=getNPCInfo(getCurrentStatusData(),nm);
      if(info) showClothingHoverTip(clothing,_.get(info,'当前穿着衣物',{})||{},`NPC.${nm}`);
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

// §10.5：悬浮球 hover tip 用的"隐形数据层"。
// 在 NPC 卡片 DOM 内插入 5 数值 / 内心想法 / 本能渴望 / 身份 / 生日 / 属性 的 data-attr，
// 球只读 DOM（沿用 §4 硬约束），不直接读 stat_data。
// 默认 display:none，避免撑开状态栏 NPC 卡片高度；如需在状态栏内可见可单独调整 CSS。
// §10.5 polish round 4：属性可扩展(超过 10 条),用 Object.keys 动态枚举,不 hardcode。
function buildFabNpcData(npc:{name:string;info:Record<string,any>}): string {
  const {info} = npc;
  const metricsHtml = NPC_METRICS.map(m => {
    const v = Number(info[m.key] ?? 0);
    return `<span class="th-npc-fab-metric" data-fab-metric="${escAttr(m.key)}" data-fab-value="${escAttr(String(v))}" data-fab-cls="${escAttr(m.cls)}" title="${escAttr(m.key)}"></span>`;
  }).join('');
  // 属性:动态枚举 info['属性'] 里的所有 key,可超过 10 条
  // ATTR_CLS 里有的属性用对应 cls,未定义的自定义属性 fallback 到 attr-type-default
  const attrsObj = (info['属性'] && typeof info['属性'] === 'object') ? info['属性'] : {};
  const attrsHtml = Object.keys(attrsObj).map(k => {
    const v = Number(attrsObj[k] ?? 0);
    const cls = ATTR_CLS[k] || 'attr-type-default';
    return `<span class="th-npc-fab-attr" data-attr-name="${escAttr(k)}" data-attr-value="${escAttr(String(v))}" data-attr-cls="${escAttr(cls)}"></span>`;
  }).join('');
  const thought = String(info['内心想法'] || '');
  const thoughtShort = thought.length > 75 ? thought.slice(0, 75) + '…' : thought;
  const desire = String(info['当前本能渴望'] || '');
  const identity = String(info['身份'] || '');
  const bdayRaw = String(info['生日日期'] || '');
  const bday = bdayRaw && bdayRaw !== '未知' ? bdayRaw : '';
  return `<div class="th-npc-fab-data" aria-hidden="true">
    ${metricsHtml}
    ${attrsHtml}
    <span class="th-npc-fab-thought" data-fab-thought="${escAttr(thought)}">${esc(thoughtShort)}</span>
    <span class="th-npc-fab-desire" data-fab-desire="${escAttr(desire)}">${esc(desire)}</span>
    <span class="th-npc-fab-identity" data-fab-identity="${escAttr(identity)}">${esc(identity)}</span>
    <span class="th-npc-fab-bday" data-fab-bday="${escAttr(bday)}">${esc(bday)}</span>
  </div>`;
}

export function buildNPCCard(npc:{name:string;info:Record<string,any>},idx:number): string {
  const{name,info}=npc;
  const present=info['是否在场']??false;
  const mood=info['当前情绪状态与心情']||'';
  const bdayRaw=info['生日日期'];
  const bday=(bdayRaw&&bdayRaw!=='未知')?String(bdayRaw):'';
  const hasImg=!!getAvatarImages()['npc:'+name];
  const ac=getAvatarColor(name,idx);

  // 头像 HTML
  let av;
  if(hasImg) av=`<div class="th-npc-avatar-ring ${present?'present':'absent'}"><div class="th-npc-avatar-img-wrap"><img class="th-npc-avatar-img" src="${esc(getAvatarImages()['npc:'+name])}" alt=""></div></div>`;
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
          ${bday?`<span class="th-npc-bday-badge" title="生日"><i class="fa-solid fa-cake-candles"></i> ${esc(bday)}</span>`:''}
        </div>
        ${mood?`<div class="th-npc-mood-tags">${buildMoodTags(mood)}</div>`:''}
        <div class="th-npc-icon-row">${icons}</div>
      </div>
      <span class="th-npc-gallery-corner" data-npc-gallery="${esc(name)}" title="画廊"><i class="fa-solid fa-images"></i></span>
      <span class="th-npc-attr-corner" data-npc-attr="${esc(name)}" title="属性详情"><i class="fa-solid fa-chart-pie"></i></span>
      <span class="th-npc-clothing-corner" data-npc-clothing="${esc(name)}" title="衣物详情"><i class="fa-solid fa-vest"></i></span>
      ${buildFabNpcData(npc)}
    </div>
  </div>`;
}

// ================================================================
//  NPC 详情弹窗（需求9：编辑全覆盖）
// ================================================================
export function openNPCDetail(npcName:string) {
  const cd=getCurrentStatusData();
  if(!cd) return;
  const info=getNPCInfo(cd,npcName); if(!info) return;
  const name=npcName;
  const basePath=`NPC.${name}`;
  const npcIndex=getNPCs(cd).findIndex(n=>n.name===name);
  let h='';

  // 头像+名称行
  h+=`<div class="th-modal-hero">`;
  const hasImg=!!getAvatarImages()['npc:'+name];
  h+=`<div class="th-modal-avatar-section">`;
  if(hasImg) h+=`<div class="th-modal-avatar-ring"><div class="th-modal-avatar-img-wrap"><img src="${esc(getAvatarImages()['npc:'+name])}" alt="" style="width:100%;height:100%;object-fit:cover;cursor:pointer" data-view-avatar="npc:${escAttr(name)}"></div></div>`;
  else h+=`<div class="th-modal-avatar-ring"><div class="th-modal-avatar-img-wrap"><span style="font-size:30px;color:${getAvatarColor(name,npcIndex>=0?npcIndex:0)}"><i class="fa-solid fa-user-astronaut"></i></span></div></div>`;
  h+=`<div class="th-modal-avatar-btns" style="display:flex;gap:6px;margin-top:4px"><button class="th-avatar-btn th-avatar-btn-upload" data-upload-avatar="npc:${escAttr(name)}"><i class="fa-solid fa-camera"></i></button>${hasImg?`<button class="th-avatar-btn th-avatar-btn-delete" data-delete-avatar="npc:${escAttr(name)}"><i class="fa-solid fa-trash"></i></button>`:''}</div>`;
  h+=`</div>`;
  const bday=info['生日日期']&&info['生日日期']!=='未知'?info['生日日期']:'';
  // §10.11 ⑤:操作栏小图标(属性/背包/技能/画廊)— 收进 hero 头像右侧空白处,不再独占一行
  const items=_.get(info,'拥有物品',{})||{}; const itemE=Object.entries(items);
  const skills=_.get(info,'拥有技能',{})||{}; const skillE=Object.entries(skills);
  const galleryCount=getNPCGallery(name).length;
  const actBarHtml=`<div class="th-modal-act-icons">
    <button class="th-modal-act-ico" data-modal-attr="${esc(name)}" title="属性"><i class="fa-solid fa-chart-pie"></i></button>
    <button class="th-modal-act-ico" data-npc-item-open="${esc(name)}" title="背包 (${itemE.length})"><i class="fa-solid fa-box-open"></i><span class="th-modal-act-cnt">${itemE.length}</span></button>
    <button class="th-modal-act-ico" data-npc-skill-open="${esc(name)}" title="技能 (${skillE.length})"><i class="fa-solid fa-scroll"></i><span class="th-modal-act-cnt">${skillE.length}</span></button>
    <button class="th-modal-act-ico" data-npc-gallery-open="${esc(name)}" title="画廊 (${galleryCount})"><i class="fa-solid fa-images"></i><span class="th-modal-act-cnt">${galleryCount}</span></button>
  </div>`;
  h+=`<div class="th-modal-hero-info">`;
  h+=`<div class="th-modal-hero-text">`;
  if(getStatusEditMode()){
    h+=`<div class="th-modal-hero-name">${editableInput(name,basePath+'.名称')} ${bday?`<span class="th-modal-hero-birthday"><i class="fa-solid fa-cake-candles"></i> ${editableInput(bday,basePath+'.生日日期')}</span>`:''}</div>`;
    h+=`<div class="th-modal-hero-loc"><i class="fa-solid fa-tag"></i> ${editableInput(info['身份']||'',basePath+'.身份')} · ${info['是否在场']?'<i class="fa-solid fa-circle" style="color:var(--mint);font-size:8px"></i> 在场':'离场'}</div>`;
    // P4fix3 反馈3：心情删笑脸独占行；编辑态 input + 标签紧凑同行
    const moodTags=buildMoodTags(info['当前情绪状态与心情']||'');
    h+=`<div class="th-modal-hero-mood">${editableInput(info['当前情绪状态与心情']||'',basePath+'.当前情绪状态与心情')}${moodTags?`<div class="th-npc-mood-tags">${moodTags}</div>`:''}</div>`;
  } else {
    h+=`<div class="th-modal-hero-name">${esc(name)} ${bday?`<span class="th-modal-hero-birthday"><i class="fa-solid fa-cake-candles"></i> ${esc(bday)}</span>`:''}</div>`;
    h+=`<div class="th-modal-hero-loc"><i class="fa-solid fa-tag"></i> ${esc(info['身份']||'')} · ${info['是否在场']?'<i class="fa-solid fa-circle" style="color:var(--mint);font-size:8px"></i> 在场':'离场'}</div>`;
    // P4fix3 反馈3：心情删笑脸图标(原独占一行),只保留标签;无标签则不渲染该行
    const moodTags=buildMoodTags(info['当前情绪状态与心情']||'');
    if(moodTags) h+=`<div class="th-modal-hero-mood"><div class="th-npc-mood-tags">${moodTags}</div></div>`;
  }
  h+=`</div>`;
  h+=actBarHtml;
  h+=`</div></div>`;

  // 内心想法
  if(info['内心想法']){
    h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-comment"></i> 内心想法</div>`;
    h+=getStatusEditMode() ? editableTextarea(info['内心想法'],basePath+'.内心想法') : `<div class="th-modal-text">${esc(info['内心想法'])}</div>`;
    h+=`</div>`;
  }
  // 本能渴望
  if(info['当前本能渴望']&&info['当前本能渴望']!=='无'){
    h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-crosshairs"></i> 本能渴望</div>`;
    h+=getStatusEditMode() ? editableTextarea(info['当前本能渴望'],basePath+'.当前本能渴望') : `<div class="th-modal-text">${esc(info['当前本能渴望'])}</div>`;
    h+=`</div>`;
  }
  // 数值指标
  h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-heart"></i> 数值指标</div><div class="th-modal-metrics">`;
  for(const m of NPC_METRICS){
    const v=clamp(Number(info[m.key])||0,0,100);
    if(getStatusEditMode()){
      h+=`<div class="th-npc-metric"><span class="th-npc-metric-icon"><i class="${m.icon}"></i></span><span class="th-npc-metric-label">${m.key}</span>${editableInput(`${v}`,basePath+'.'+m.key,'number')}</div>`;
    } else {
      h+=`<div class="th-npc-metric"><span class="th-npc-metric-icon"><i class="${m.icon}"></i></span><span class="th-npc-metric-label">${m.key}</span><div class="th-npc-metric-bar"><div class="th-npc-metric-fill ${m.cls}" style="width:${v}%"></div></div><span class="th-npc-metric-val">${v}</span></div>`;
    }
  }
  h+=`</div>`;
  // §10.11 ⑤:计数归位 — 并入数值指标 section 末尾(原独立块夹在数值与姿态间无 section 包裹)
  h+=`<div class="th-modal-counts">`;
  for(const c of NPC_COUNTS){
    const cv=Number(info[c.key])||0;
    h+=`<span><i class="${c.icon}"></i> ${c.key}: ${getStatusEditMode()?editableInput(`${cv}`,basePath+'.'+c.key,'number'):`<b>${cv}</b>`}</span>`;
  }
  h+=`</div></div>`;

  // 姿态动作+身体状态
  const posture=info['姿态动作']||'暂无动作';
  const bodyState=info['身体状态']||'暂无描述';
  h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-child-reaching"></i> 姿态动作 & 身体状态</div>`;
  h+=`<div class="th-modal-pb-row">`;
  h+=`<div class="th-modal-pop-card"><div class="th-modal-pop-head"><i class="fa-solid fa-child-reaching"></i> 姿态动作</div><div class="th-modal-pop-body">${getStatusEditMode()?editableTextarea(posture,basePath+'.姿态动作'):esc(posture)}</div></div>`;
  h+=`<div class="th-modal-pop-card"><div class="th-modal-pop-head"><i class="fa-solid fa-hand-holding-heart"></i> 身体状态</div><div class="th-modal-pop-body">${getStatusEditMode()?editableTextarea(bodyState,basePath+'.身体状态'):esc(bodyState)}</div></div>`;
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

  // 穿着（§10.11 ⑤:每行独立 detail,可同时展开多件;原全局单 detail 同时只能展开一件）
  const cl=_.get(info,'当前穿着衣物',{})||{}; const clE=Object.entries(cl);
  h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-vest"></i> 当前穿着</div><div class="th-fold-list">`;
  if(!clE.length) h+=`<span class="th-empty" style="padding:8px 0">暂无穿着</span>`;
  for(const[cn,ci] of clE){ const c=ci as any;
    const state=c?.['衣物状态']||'';
    const wear=c?.['穿着情况']||'穿着';
    const dmg=c?.['破损状态']||'完好无缺';
    const evalTxt=c?.['评价']||'';
    const dot=getDotCls(state);
    const offCls = wear==='脱下' ? ' is-off' : '';
    const dmgIdx = Math.max(0,['完好无缺','轻微破损','中度破损','严重破坏'].indexOf(dmg));
    // 批次0：穿着情况/破损状态 chip（点击循环切换，data 属性委托，§4.2）
    const wearChip=`<span class="th-clothing-chip th-clothing-chip-wear${wear==='脱下'?' is-off':''}" data-clothing-toggle="穿着情况" data-clothing-owner="${escAttr(basePath)}" data-clothing-name="${escAttr(cn)}" title="点击切换穿着情况">${esc(wear)}</span>`;
    const dmgChip=`<span class="th-clothing-chip th-clothing-chip-dmg dmg-${dmgIdx}" data-clothing-toggle="破损状态" data-clothing-owner="${escAttr(basePath)}" data-clothing-name="${escAttr(cn)}" title="点击切换破损状态">${esc(dmg)}</span>`;
    const head=`<span class="th-clothing-block-head"><i class="fa-solid fa-vest"></i><span class="th-clothing-block-name">${esc(cn)}</span>${c?.['穿着部位']?`<span class="th-clothing-block-part">${esc(c?.['穿着部位'])}</span>`:''}</span>`;
    const foot=`<span class="th-clothing-block-foot">${wearChip}${dmgChip}<span class="th-tag-dot ${dot}"></span><span class="th-fold-arrow" style="margin-left:auto;font-size:10px"><i class="fa-solid fa-chevron-down"></i></span></span>`;
    h+=`<div class="th-fold-item">`;
    h+=`<span class="th-block th-block-clothing th-fold-trigger${offCls}" data-btype="clothing" data-bname="${escAttr(cn)}" data-bpart="${escAttr(c?.['穿着部位']||'')}" data-bstate="${escAttr(state)}" data-bdetail="${escAttr(c?.['外观详情']||'')}" data-bwear="${escAttr(wear)}" data-bdmg="${escAttr(dmg)}" data-beval="${escAttr(evalTxt)}" data-bpath="${escAttr(basePath)}.当前穿着衣物.${escAttr(cn)}">${head}${foot}</span>`;
    h+=`<div class="th-fold-detail" style="display:none"></div>`;
    h+=`</div>`;
  }
  h+=`<span class="th-block th-block-add" data-add-trigger="clothing" data-add-base="${escAttr(basePath)}.当前穿着衣物" data-add-owner="${escAttr(name)}"><i class="fa-solid fa-plus"></i> 新增衣物</span>`;
  h+=`</div></div>`;

  // 基础外貌（需求9：编辑模式）
  if(info['基础外貌']){
    h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-eye"></i> 基础外貌</div>`;
    h+= getStatusEditMode() ? editableTextarea(info['基础外貌'],basePath+'.基础外貌') : `<div class="th-modal-text">${esc(info['基础外貌'])}</div>`;
    h+=`</div>`;
  }

  // §10.11 ⑤:背包/技能/画廊入口已移至 hero 下方统一操作栏,此处不再重复

  // §10.11 ⑤:外层包 .th-npc-detail-wrap 供宽屏双栏 CSS 定位
  openModal(esc(name),`<div class="th-npc-detail-wrap">${h}</div>`);

  setTimeout(()=>{
    qsa('[data-modal-attr]').forEach(b=>b.addEventListener('click',function(this:HTMLElement){const nm=this.getAttribute('data-modal-attr')||'';const info=getNPCInfo(getCurrentStatusData(),nm);if(info)openAttrModal(nm,_.get(info,'属性',{})||{},`NPC.${nm}.属性`);}));
    qsa('[data-npc-item-open]').forEach(b=>b.addEventListener('click',function(this:HTMLElement){const nm=this.getAttribute('data-npc-item-open')||'';if(getCurrentStatusData())openNPCBag(nm);}));
    qsa('[data-npc-skill-open]').forEach(b=>b.addEventListener('click',function(this:HTMLElement){const nm=this.getAttribute('data-npc-skill-open')||'';if(getCurrentStatusData())openNPCSkill(nm);}));
    // §10.11 ⑤:统一操作栏画廊按钮(原只在 NPC 卡片角标)
    qsa('[data-npc-gallery-open]').forEach(b=>b.addEventListener('click',function(this:HTMLElement){const nm=this.getAttribute('data-npc-gallery-open')||'';openGalleryModal(nm);}));
    // 头像三键事件委托（替代原 inline onclick）：inline onclick 在 parent 文档上下文执行，
    //   window.__uploadTarget__ 落到 parent 窗口，iframe 内 change 处理器读不到 → NPC 上传错塞 user 头像。
    //   改委托后直接在 iframe 上下文调 setUploadingTarget/deleteAvatar/showImage，与 user 上传同链路。
    qsa('[data-view-avatar]').forEach(el=>el.addEventListener('click',function(this:HTMLElement){const key=this.getAttribute('data-view-avatar')||'';const url=getAvatarImages()[key];if(url)showImage(url);}));
    qsa('[data-upload-avatar]').forEach(btn=>btn.addEventListener('click',function(this:HTMLElement,e:Event){e.stopPropagation();const key=this.getAttribute('data-upload-avatar')||'';setUploadingTarget(key);qs<HTMLInputElement>('.th-avatar-file-input')?.click();}));
    qsa('[data-delete-avatar]').forEach(btn=>btn.addEventListener('click',function(this:HTMLElement){const key=this.getAttribute('data-delete-avatar')||'';deleteAvatar(key);closeModal();if(getCurrentStatusData())openNPCDetail(npcName);}));
    // 绑定弹窗内状态方块hover+click
    const modalBody=qs('.th-modal-body'); if(modalBody){
      bindBlockHoverAndClick(modalBody,'status');
    }
    // 需求4：衣物方块改为折叠式展开/收起
    bindClothingFoldDown(npcName);
  },40);
}

// ================================================================
//  需求4：衣物折叠式展开/收起（NPC详情弹窗内）
// ================================================================
// 批次0：modal 内衣物方块 chip 切换后就地刷新该方块（modal 不被 renderCurrent 重绘）。
// 更新 data 属性 + is-off + head/foot（含新 chip）；若 fold 展开则收起（值已变，避免显示旧详情）。
function refreshClothingFoldBlock(el:HTMLElement, owner:string, cname:string) {
  const cd=getCurrentStatusData(); if(!cd) return;
  const c=_.get(cd,`${owner}.当前穿着衣物.${cname}`,{})||{};
  const wear=c['穿着情况']||'穿着';
  const dmg=c['破损状态']||'完好无缺';
  const evalTxt=c['评价']||'';
  const state=c['衣物状态']||'';
  const part=c['穿着部位']||'';
  const detail=c['外观详情']||'';
  const dot=getDotCls(state);
  const dmgIdx=Math.max(0,['完好无缺','轻微破损','中度破损','严重破坏'].indexOf(dmg));
  el.setAttribute('data-bwear',wear);
  el.setAttribute('data-bdmg',dmg);
  el.setAttribute('data-beval',evalTxt);
  el.setAttribute('data-bpart',part);
  el.setAttribute('data-bstate',state);
  el.setAttribute('data-bdetail',detail);
  el.classList.toggle('is-off',wear==='脱下');
  const wearChip=`<span class="th-clothing-chip th-clothing-chip-wear${wear==='脱下'?' is-off':''}" data-clothing-toggle="穿着情况" data-clothing-owner="${escAttr(owner)}" data-clothing-name="${escAttr(cname)}" title="点击切换穿着情况">${esc(wear)}</span>`;
  const dmgChip=`<span class="th-clothing-chip th-clothing-chip-dmg dmg-${dmgIdx}" data-clothing-toggle="破损状态" data-clothing-owner="${escAttr(owner)}" data-clothing-name="${escAttr(cname)}" title="点击切换破损状态">${esc(dmg)}</span>`;
  const head=`<span class="th-clothing-block-head"><i class="fa-solid fa-vest"></i><span class="th-clothing-block-name">${esc(cname)}</span>${part?`<span class="th-clothing-block-part">${esc(part)}</span>`:''}</span>`;
  const foot=`<span class="th-clothing-block-foot">${wearChip}${dmgChip}<span class="th-tag-dot ${dot}"></span><span class="th-fold-arrow" style="margin-left:auto;font-size:10px"><i class="fa-solid fa-chevron-down"></i></span></span>`;
  el.innerHTML=head+foot;
  // 若该方块 fold 详情正展开，收起（值已变，旧详情作废）
  const myDetail=el.nextElementSibling as HTMLElement|null;
  if(myDetail && myDetail.classList.contains('th-fold-detail') && myDetail.style.display!=='none'){
    myDetail.style.display='none';
    myDetail.innerHTML='';
  }
}

export function bindClothingFoldDown(_npcName:string) {
  const modalBody = qs('.th-modal-body');
  const foldTriggers = modalBody ? modalBody.querySelectorAll('.th-fold-trigger') : [];
  if (!foldTriggers.length) return;

  // §10.11 ⑤:每行独立 detail — trigger 的下一个兄弟即自己的 .th-fold-detail
  // 可同时展开多件;点击已展开的同一件则收起。原全局单 detail 同时只能展开一件。
  foldTriggers.forEach((trigger) => {
    const el = trigger as HTMLElement;

    // hover → 显示装备卡片浮窗
    el.addEventListener('mouseenter', function (this: HTMLElement) {
      const name = this.getAttribute('data-bname') || '';
      const part = this.getAttribute('data-bpart') || '';
      const state = this.getAttribute('data-bstate') || '';
      const detail = this.getAttribute('data-bdetail') || '';
      const wear = this.getAttribute('data-bwear') || '穿着';
      const dmg = this.getAttribute('data-bdmg') || '完好无缺';
      const evalTxt = this.getAttribute('data-beval') || '';
      showHoverTip(this, 'clothing', { name, part, state, detail, wear, dmg, eval: evalTxt });
    });
    el.addEventListener('mouseleave', () => { hideHoverTip(); });

    // click → 折叠式展开/收起本行详情
    el.addEventListener('click', function (this: HTMLElement, e: Event) {
      e.stopPropagation();
      // 批次0：衣物 chip 切换按钮点击 — 拦截，不展开/收起详情（§4.2 data 属性委托）
      const chip = (e.target as HTMLElement).closest('[data-clothing-toggle]') as HTMLElement | null;
      if (chip) {
        e.stopPropagation();
        const fld = chip.getAttribute('data-clothing-toggle') as '穿着情况'|'破损状态';
        const owner = chip.getAttribute('data-clothing-owner') || '';
        const cname = chip.getAttribute('data-clothing-name') || '';
        // skipRender：modal 不被 renderCurrent 重绘，由 refreshClothingFoldBlock 就地刷新该方块
        toggleClothingField(owner, cname, fld, { skipRender: true });
        refreshClothingFoldBlock(this, owner, cname);
        return;
      }
      const bname = this.getAttribute('data-bname') || '';
      const bpart = this.getAttribute('data-bpart') || '';
      const bstate = this.getAttribute('data-bstate') || '';
      const bdetail = this.getAttribute('data-bdetail') || '';
      const bwear = this.getAttribute('data-bwear') || '穿着';
      const bdmg = this.getAttribute('data-bdmg') || '完好无缺';
      const beval = this.getAttribute('data-beval') || '';
      const bpath = this.getAttribute('data-bpath') || '';
      const bdmgIdx = Math.max(0, ['完好无缺', '轻微破损', '中度破损', '严重破坏'].indexOf(bdmg));

      // 本行自己的 detail 元素
      const myDetail = this.nextElementSibling as HTMLElement | null;
      if (!myDetail || !myDetail.classList.contains('th-fold-detail')) return;

      // 已展开 → 收起
      if (myDetail.style.display !== 'none') {
        myDetail.style.display = 'none';
        myDetail.innerHTML = '';
        this.querySelector('.th-fold-arrow')!.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
        return;
      }

      // 生成详情HTML
      let detailHtml = '';
      if (getStatusEditMode()) {
        detailHtml += `<div class="th-fold-row"><span class="th-fold-label">名称</span>${editableInput(bname, bpath + '.名称')}</div>`;
        detailHtml += `<div class="th-fold-row"><span class="th-fold-label">穿着部位</span>${editableInput(bpart, bpath + '.穿着部位')}</div>`;
        // 批次0：穿着情况 / 破损状态 enum 下拉编辑（select 复用 .th-edit-input → applyEdit）
        detailHtml += `<div class="th-fold-row"><span class="th-fold-label">穿着情况</span><select class="th-edit-input th-edit-select" data-edit-path="${escAttr(bpath)}.穿着情况"><option value="穿着"${bwear === '穿着' ? ' selected' : ''}>穿着</option><option value="脱下"${bwear === '脱下' ? ' selected' : ''}>脱下</option></select></div>`;
        detailHtml += `<div class="th-fold-row"><span class="th-fold-label">破损状态</span><select class="th-edit-input th-edit-select" data-edit-path="${escAttr(bpath)}.破损状态">${['完好无缺', '轻微破损', '中度破损', '严重破坏'].map((o, i) => `<option value="${o}"${i === bdmgIdx ? ' selected' : ''}>${o}</option>`).join('')}</select></div>`;
        detailHtml += `<div class="th-fold-row"><span class="th-fold-label">衣物状态</span>${editableInput(bstate, bpath + '.衣物状态')}</div>`;
        detailHtml += `<div class="th-fold-row" style="flex-direction:column;align-items:flex-start"><span class="th-fold-label">外观详情</span>${editableTextarea(bdetail, bpath + '.外观详情')}</div>`;
        detailHtml += `<div class="th-fold-row" style="flex-direction:column;align-items:flex-start"><span class="th-fold-label">评价</span>${editableTextarea(beval, bpath + '.评价')}</div>`;
      } else {
        detailHtml += `<div class="th-fold-row"><span class="th-fold-label"><i class="fa-solid fa-tag"></i> 穿着部位</span><span class="th-fold-value">${esc(bpart)}</span></div>`;
        detailHtml += `<div class="th-fold-row"><span class="th-fold-label"><i class="fa-solid fa-shirt"></i> 穿着情况</span><span class="th-fold-value">${esc(bwear)}</span></div>`;
        detailHtml += `<div class="th-fold-row"><span class="th-fold-label"><i class="fa-solid fa-bolt"></i> 破损状态</span><span class="th-fold-value">${esc(bdmg)}</span></div>`;
        detailHtml += `<div class="th-fold-row"><span class="th-fold-label"><i class="fa-solid fa-circle-info"></i> 衣物状态</span><span class="th-fold-value">${esc(bstate)}</span></div>`;
        if (bdetail) {
          detailHtml += `<div class="th-fold-row" style="flex-direction:column;align-items:flex-start"><span class="th-fold-label"><i class="fa-solid fa-align-left"></i> 外观详情</span><div class="th-fold-desc">${esc(bdetail)}</div></div>`;
        }
        if (beval) {
          detailHtml += `<div class="th-fold-row" style="flex-direction:column;align-items:flex-start"><span class="th-fold-label"><i class="fa-solid fa-comment"></i> 评价</span><div class="th-fold-desc">${esc(beval)}</div></div>`;
        }
      }
      myDetail.innerHTML = detailHtml;
      myDetail.style.display = 'block';

      // 更新箭头方向
      this.querySelector('.th-fold-arrow')!.innerHTML = '<i class="fa-solid fa-chevron-up"></i>';

      // 滚动到详情位置
      myDetail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
}

// ================================================================
//  需求2：背包/技能 → 3列方块网格，点击方块弹出详情
// ================================================================
// 背包/技能网格 + 详情弹窗已抽至 ./modules/item-skill-grid.ts

// ================================================================
//  属性弹窗（需求6 + 需求9）
// ================================================================
// ================================================================
//  需求: 属性悬停浮窗HTML生成（bar图风格，与弹窗一致）
// ================================================================
export function buildAttrBarHtml(attrs:Record<string,any>): string {
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

export function openAttrModal(name:string,attrs:Record<string,any>, editPath?:string) {
  let extraIdx=0;
  let h='<div class="th-attr-grid-modal">';
  for(const k of ATTR_KEYS){
    const v=clamp(Number(attrs[k])||0,0,ATTR_MAX); const p=attrPct(v); const cls=ATTR_CLS[k]||'attr-type-default';
    const valHtml=getStatusEditMode()&&editPath?editableInput(`${v}`,editPath+'.'+k,'number'):`<span class="th-attr-val">${v}</span>`;
    // §10.11 ⑤:编辑态保留灰化 bar(视觉反馈不丢)+ 数字 input 叠加
    const barEditStyle=getStatusEditMode()?'opacity:0.35;':'';
    const barHtml=`<div class="th-attr-bar-wrap" style="${barEditStyle}"><div class="th-attr-bar-fill ${cls}" style="width:${p}%"></div></div>`;
    h+=`<div class="th-attr-item"><span class="th-attr-name">${k}</span>${barHtml}${valHtml}</div>`;
  }
  for(const[k,v]of Object.entries(attrs)){
    if((ATTR_KEYS as readonly string[]).includes(k)) continue;
    const val=clamp(Number(v)||0,0,ATTR_MAX); const p=attrPct(val);
    const color=getStatusEditMode()?'':`background:${pickExtraAttrColor(extraIdx++)};`;
    const valHtml=getStatusEditMode()&&editPath?editableInput(`${val}`,editPath+'.'+k,'number'):`<span class="th-attr-val">${val}</span>`;
    const barEditStyle=getStatusEditMode()?'opacity:0.35;':'';
    const barHtml=`<div class="th-attr-bar-wrap" style="${barEditStyle}"><div class="th-attr-bar-fill" style="width:${p}%;${color}"></div></div>`;
    h+=`<div class="th-attr-item"><span class="th-attr-name">${k}</span>${barHtml}${valHtml}</div>`;
  }
  h+=`</div>`;
  // §10.11 ⑤:改 openModal2 叠加,关闭后回 NPC 详情而非回状态栏
  openModal2(`<i class="fa-solid fa-chart-pie"></i> `+esc(name)+' · 属性',h);
}

// ================================================================
//  需求6：画廊弹窗
// ================================================================
export function openGalleryModal(npcName:string) {
  const images=getNPCGallery(npcName);
  let h=`<div class="th-gallery-grid">`;
  if(!images.length) h+=`<div class="th-empty" style="grid-column:1/-1"><i class="fa-solid fa-images"></i> 暂无图片,点击 + 添加</div>`;
  images.forEach((url,idx)=>{
    h+=`<div class="th-gallery-item" data-gidx="${idx}"><img src="${escAttr(url)}" alt="画廊图片${idx+1}" data-gfull="${escAttr(url)}"><button class="th-gallery-delete" data-gdel="${idx}" data-gnpc="${escAttr(npcName)}"><i class="fa-solid fa-xmark"></i></button></div>`;
  });
  h+=`<div class="th-gallery-add" data-gadd="${escAttr(npcName)}"><i class="fa-solid fa-plus"></i></div>`;
  h+=`</div>`;
  // §10.11 ⑤:改 openModal2 叠加,关闭后回 NPC 详情
  openModal2(`<i class="fa-solid fa-images"></i> `+esc(npcName)+' · 画廊',h);
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
      if(!isNaN(idx)){ deleteNPCGalleryImage(nm,idx); closeModal2(); openGalleryModal(nm); }
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
