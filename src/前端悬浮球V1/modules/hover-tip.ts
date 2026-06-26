// 悬停浮窗系统 + metric wheel + 状态/衣物详情弹窗 + 地点/事件 hover（解耦阶段 1g）。
// 从 status-bar-init.ts 纯移动；行为保持一致。
// 放 modules/（非原计划 lib/）：showLocHover 依赖 managed-modal.getDisplayDesc、
// openStatusDetail/openClothingDetailModal 依赖主文件 openModal/openModal2 + isEditMode，
// 依赖指向上层，故归 modules 而非 lib 叶子层（原 §7.2 假设为叶子组件，实际不是）。
// isEditMode 是主文件 whole-reassigned 状态，模块只读 → 懒读 getter getStatusEditMode（§4.2）。
// ================================================================
import { esc, escAttr, qs, clamp, editableInput, editableTextarea, __doc, __body, __win } from '../lib/dom-utils';
import { type ManagedKind, NPC_METRICS } from '../lib/config';
import { getStashKindCfg, managedEntryStates } from '../lib/managed-store';
import { getDisplayDesc } from './managed-modal';
import { openModal, openModal2, getStatusEditMode, toggleClothingField, getCurrentStatusData } from '../status-bar-init';
import { computePosition, flip, shift, offset, autoUpdate, type Placement } from '@floating-ui/dom';

let hoverTimeout: ReturnType<typeof setTimeout>|null = null;
// 批次2：floating-ui 公共 helper。两个 tip 池（.th-hover-tip / .th-loc-hover-tip）
// 各持一个 cleanup，切换时释放旧的避免多个 autoUpdate 并存。
let activeHoverCleanup: (() => void)|null = null;
let activeLocCleanup: (() => void)|null = null;

// 批次N：§10.4 + §10.2 — .th-hover-tip portal 化到 parent body（z-index 110000 + pointer-events: auto）。
// 模仿 .th-loc-hover-tip 套路：lazy 创建 + __doc.createElement + __body.appendChild。
// 模板里 .th-hover-tip 节点已删除，portal 节点由本函数首次调用时挂载。
// keepalive 监听器在节点创建时一次性挂上（所有 5 个 show 函数共用）：
//   鼠标移入 tip 取消 hideHoverTip 的 140ms 延迟；移出 tip 立即关。
// §10.4 验收回归：portal 化前 CSS pointer-events: auto !important 曾“看起来”让背包/技能可移入，
// 实际是没设 keepalive 导致 140ms 后必关。保持监听器常驻即可（display: none 时不触发）。
let hoverTip: HTMLElement | null = null;
function ensureHoverTip(): HTMLElement {
  if (!hoverTip) {
    hoverTip = __doc.createElement('div');
    hoverTip.className = 'th-hover-tip';
    hoverTip.style.display = 'none';
    hoverTip.onmouseenter = () => { if (hoverTimeout) { clearTimeout(hoverTimeout); hoverTimeout = null; } };
    // 批次0 补丁：onmouseleave 用 140ms 宽容而非立即 hideHoverTipNow，
    // 避免浮窗定位微调/锚点 hover-transform 抖动瞬间触发 mouseleave 导致「立刻闪关」。
    hoverTip.onmouseleave = () => { hideHoverTip(); };
    // 批次0 补丁：浮窗内衣物 chip 点击切换（data 属性委托，§4.2）。
    // 列表浮窗(showClothingHoverTip)的 chip 可切换；切换后 skipRender 就地刷新浮窗内容，
    // 不重绘状态栏（避免 grid 角标锚点重建导致浮窗闪退）。
    hoverTip.addEventListener('click', (e:MouseEvent) => {
      const chip = (e.target as HTMLElement).closest('[data-clothing-toggle]') as HTMLElement | null;
      if (!chip) return;
      e.stopPropagation();
      const fld = chip.getAttribute('data-clothing-toggle') as '穿着情况'|'破损状态';
      const owner = chip.getAttribute('data-clothing-owner') || '';
      const cname = chip.getAttribute('data-clothing-name') || '';
      if (!owner || !cname) return;
      toggleClothingField(owner, cname, fld, { skipRender: true });
      // 就地刷新当前列表浮窗：清缓存 + 重新读 currentData 重建 HTML
      _clothingHoverCache.clear();
      if (__activeClothingListHover && hoverTip) {
        const cd = getCurrentStatusData();
        const fresh = cd ? (_.get(cd, `${__activeClothingListHover.ownerPath}.当前穿着衣物`, {}) || {}) : {};
        hoverTip.innerHTML = buildClothingHoverHtml(fresh, __activeClothingListHover.ownerPath);
      }
    });
    __body.appendChild(hoverTip);
  }
  return hoverTip;
}

/**
 * 用 @floating-ui/dom 把 tip 定位到 anchor 旁。
 * - strategy:'fixed' → 只写 position:fixed + left/top，不用 transform，
 *   避免与 .th-fab-panel 硬约束（禁止父级 transform/filter/backdrop-filter）冲突，
 *   也避免与 CSS animation: tip-in 的 transform keyframe 打架。
 * - autoUpdate 在 anchor/tip 几何变化（scroll / resize / 面板拖动）时自动重定位。
 */
function positionTipWithFloatingUi(
  tip: HTMLElement,
  anchor: HTMLElement,
  pool: 'hover' | 'loc',
  opts: { placement?: Placement; offset?: number; maxW?: number; show?: boolean } = {}
) {
  const { placement = 'right-start', offset: off = 12, maxW, show = true } = opts;
  if (maxW) tip.style.maxWidth = `${maxW}px`;
  // 释放旧 cleanup
  const prev = pool === 'hover' ? activeHoverCleanup : activeLocCleanup;
  if (prev) { prev(); }
  // 清残留：定位前重置 left/top，避免显示瞬间闪上次的旧位置（批次0 反馈1）
  tip.style.left = '0px';
  tip.style.top = '0px';
  // 临时隐藏以测量 + 避免首次左上角闪烁
  if (show) {
    tip.style.visibility = 'hidden';
    tip.style.display = 'block';
  }
  let stopped = false;

  // 实测根因（批次0 反馈1 MCP 诊断）：autoUpdate 会在 anchor :hover transform 每帧变化时
  // 持续重定位 tip（22 次 rAF/单次 hover），导致浮窗在旧位置↔新位置间抖动 + 残留旧位置闪现。
  // hover 类浮窗改「拍一次 anchor 几何快照 → 单次 computePosition」，并只在 scroll/resize 时
  // 用新快照重定位（不再每帧跟 transform）。loc 类仍用 autoUpdate（长留态需跟滚动）。
  const runLocate = async () => {
    if (!anchor.isConnected) { stop(); return; }
    const anchorRect = anchor.getBoundingClientRect();
    if (anchorRect.width === 0 && anchorRect.height === 0) { return; }
    // floating-ui 需要实时 rect 计算 flip/shift；用当前快照构造一个伪元素几何接受 computePosition
    const { x, y } = await computePosition(anchor, tip, {
      placement,
      strategy: 'fixed',
      middleware: [offset(off), flip({ padding: 8 }), shift({ padding: 8 })],
    });
    if (!anchor.isConnected) { stop(); return; }
    Object.assign(tip.style, { left: `${x}px`, top: `${y}px` });
    if (show) tip.style.visibility = 'visible';
  };

  let cleanup: () => void;
  let scrollRaf = 0;
  if (pool === 'hover') {
    const onScrollResize = () => {
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      scrollRaf = __win.requestAnimationFrame(runLocate);
    };
    // 状态栏 DOM 在 parent.document，scroll/resize 挂 parent window（capture:true 捕获各滚动容器）
    __win.addEventListener('scroll', onScrollResize, true);
    __win.addEventListener('resize', onScrollResize);
    requestAnimationFrame(runLocate); // 首帧定位一次（rAF 等布局稳定）
    cleanup = () => {
      __win.removeEventListener('scroll', onScrollResize, true);
      __win.removeEventListener('resize', onScrollResize);
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
    };
  } else {
    cleanup = autoUpdate(anchor, tip, async () => {
      if (!anchor.isConnected) { stop(); return; }
      const anchorRect = anchor.getBoundingClientRect();
      if (anchorRect.width === 0 && anchorRect.height === 0) { return; }
      const { x, y } = await computePosition(anchor, tip, {
        placement,
        strategy: 'fixed',
        middleware: [offset(off), flip({ padding: 8 }), shift({ padding: 8 })],
      });
      if (!anchor.isConnected) { stop(); return; }
      Object.assign(tip.style, { left: `${x}px`, top: `${y}px` });
      if (show) tip.style.visibility = 'visible';
    });
  }
  const stop = () => {
    if (stopped) return;
    stopped = true;
    tip.style.display = 'none';
    if (pool === 'hover') { if (activeHoverCleanup === cleanup) activeHoverCleanup = null; }
    else { if (activeLocCleanup === cleanup) activeLocCleanup = null; }
    cleanup();
  };
  if (pool === 'hover') activeHoverCleanup = cleanup;
  else activeLocCleanup = cleanup;
}

export function showHoverTip(anchor:HTMLElement, type:string, data:Record<string,string>) {
  if(hoverTimeout) clearTimeout(hoverTimeout);
  const tip=ensureHoverTip(); if(!tip) return;
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
    // 批次0：穿着情况 / 破损状态 chip（只读展示）
    const wear=data.wear||'穿着'; const dmg=data.dmg||'完好无缺';
    const dmgIdx=Math.max(0,['完好无缺','轻微破损','中度破损','严重破坏'].indexOf(dmg));
    html+=`<div class="th-single-clothing-chips">`;
    html+=`<span class="th-clothing-chip th-clothing-chip-wear${wear==='脱下'?' is-off':''}">${esc(wear)}</span>`;
    html+=`<span class="th-clothing-chip th-clothing-chip-dmg dmg-${dmgIdx}">${esc(dmg)}</span>`;
    html+=`</div>`;
    if(st) html+=`<span class="th-clothing-state ${stateCls}"><i class="${stateIcon}"></i> ${esc(st)}</span>`;
    if(data.detail) html+=`<div class="th-single-clothing-detail">${esc(data.detail)}</div>`;
    if(data.eval) html+=`<div class="th-hover-item-meta"><i class="fa-solid fa-comment"></i> ${esc(data.eval)}</div>`;
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
  positionTipWithFloatingUi(tip, anchor, 'hover', { maxW });
  // keepalive 监听器在 ensureHoverTip() 创建 portal 节点时已一次性挂上，
  // 此处不再重复设置。portal 节点生命周期 = 整个 status-bar 生命周期，常驻监听器无副作用。
}
export function hideHoverTip() {
  if (hoverTimeout) clearTimeout(hoverTimeout);
  hoverTimeout = setTimeout(() => { hideHoverTipNow(); }, 140);
}
export function hideHoverTipNow() {
  if(hoverTimeout) { clearTimeout(hoverTimeout); hoverTimeout=null; }
  const tip=ensureHoverTip(); if(!tip) return;
  tip.style.display='none';
  tip.className = 'th-hover-tip';
  __activeClothingListHover = null;
  // keepalive 监听器在 ensureHoverTip() 一次性挂上后保持常驻，display: none 时不触发，无需清空。
  if (activeHoverCleanup) { activeHoverCleanup(); activeHoverCleanup = null; }
}

// ================================================================
//  需求3：背包全量详情悬停
// ================================================================
export function showItemsHoverTip(anchor:HTMLElement, items:Record<string,any>, label:string) {
  if(hoverTimeout) clearTimeout(hoverTimeout);
  const tip=ensureHoverTip(); if(!tip) return;
  const entries=Object.entries(items);
  let html=`<div class="th-hover-tip-title"><i class="fa-solid fa-box-open"></i> ${label} (${entries.length})</div>`;
  if(!entries.length){ html+='<div style="font-size:12px;color:var(--tx3)">空空如也~</div>'; }
  else {
    for(const[n,it] of entries){
      const cnt=it?.['数量']??1;
      const desc=it?.['简介']||'';
      const eff=it?.['效果']||'';
      const ev=it?.['评价']||'';
      html+=`<div class="th-hover-item-entry"><div class="th-hover-item-name">${esc(n)} <span style="font-size:11px;color:var(--pink)">x${cnt}</span></div>`;
      if(desc) html+=`<div class="th-hover-item-desc">${esc(desc)}</div>`;
      if(eff) html+=`<div class="th-hover-item-meta"><i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(eff)}</div>`;
      if(ev) html+=`<div class="th-hover-item-meta"><i class="fa-solid fa-comment"></i> ${esc(ev)}</div>`;
      html+=`</div>`;
    }
  }
  tip.innerHTML=html; tip.classList.add('th-hover-tip-full');
  positionTipWithFloatingUi(tip, anchor, 'hover', { maxW: 400 });
}
export function showSkillsHoverTip(anchor:HTMLElement, skills:Record<string,any>, label:string) {
  if(hoverTimeout) clearTimeout(hoverTimeout);
  const tip=ensureHoverTip(); if(!tip) return;
  const entries=Object.entries(skills);
  let html=`<div class="th-hover-tip-title"><i class="fa-solid fa-scroll"></i> ${label} (${entries.length})</div>`;
  if(!entries.length){ html+='<div style="font-size:12px;color:var(--tx3)">尚未习得~</div>'; }
  else {
    for(const[n,sk] of entries){
      const lv=sk?.['等级']??1;
      const desc=sk?.['简介']||'';
      const eff=sk?.['效果']||'';
      const ev=sk?.['评价']||'';
      html+=`<div class="th-hover-item-entry"><div class="th-hover-item-name">${esc(n)} <span style="font-size:11px;color:var(--lav)">Lv${lv}</span></div>`;
      if(desc) html+=`<div class="th-hover-item-desc">${esc(desc)}</div>`;
      if(eff) html+=`<div class="th-hover-item-meta"><i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(eff)}</div>`;
      if(ev) html+=`<div class="th-hover-item-meta"><i class="fa-solid fa-comment"></i> ${esc(ev)}</div>`;
      html+=`</div>`;
    }
  }
  tip.innerHTML=html; tip.classList.add('th-hover-tip-full');
  positionTipWithFloatingUi(tip, anchor, 'hover', { maxW: 400 });
}
// 需求7：衣物全量悬停 — 新设计：甜美糖果衣橱列表
const _clothingHoverCache = new Map<string,string>();
// 批次0：跟踪当前列表浮窗的锚点+owner，供浮窗内 chip 切换后就地刷新
let __activeClothingListHover: { anchor: HTMLElement; ownerPath: string } | null = null;
function getClothingCacheKey(clothing:Record<string,any>, ownerPath:string): string {
  // 批次0：缓存 key 加入穿着情况/破损状态/评价 + ownerPath，改值/换 owner 后 hover 不显示旧缓存
  const body = Object.entries(clothing).map(([n,cl])=>{
    const c=cl as any;
    return n+':'+c?.['衣物状态']+':'+c?.['穿着情况']+':'+c?.['破损状态']+':'+c?.['评价'];
  }).join('|');
  return ownerPath + '::' + body;
}
export function showClothingHoverTip(anchor:HTMLElement, clothing:Record<string,any>, ownerPath:string='') {
  if(hoverTimeout) clearTimeout(hoverTimeout);
  const tip=ensureHoverTip(); if(!tip) return;
  // 清理旧类型类
  tip.className = 'th-hover-tip';
  __activeClothingListHover = { anchor, ownerPath };
  const cacheKey = getClothingCacheKey(clothing, ownerPath);
  let html = _clothingHoverCache.get(cacheKey);
  if(!html){
    html = buildClothingHoverHtml(clothing, ownerPath);
    _clothingHoverCache.set(cacheKey, html);
    // 限制缓存大小
    if(_clothingHoverCache.size > 50) { const first = _clothingHoverCache.keys().next().value; if(first!==undefined) _clothingHoverCache.delete(first); }
  }
  tip.innerHTML=html;
  tip.classList.add('th-hover-tip-clothing-new');
  positionTipWithFloatingUi(tip, anchor, 'hover', { maxW: 620 });
}
function buildClothingHoverHtml(clothing:Record<string,any>, ownerPath:string=''): string {
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
      const wear=c?.['穿着情况']||'穿着';
      const dmg=c?.['破损状态']||'完好无缺';
      const ev=c?.['评价']||'';
      const dmgIdx=Math.max(0,['完好无缺','轻微破损','中度破损','严重破坏'].indexOf(dmg));
      let stateCls='neutral'; let stateIcon='fa-solid fa-circle';
      if(state.includes('破损')||state.includes('破')||state.includes('撕裂')){ stateCls='bad'; stateIcon='fa-solid fa-triangle-exclamation'; }
      else if(state.includes('湿')||state.includes('脏')||state.includes('乱')){ stateCls='warn'; stateIcon='fa-solid fa-droplet'; }
      else if(state.includes('新')||state.includes('干净')||state.includes('整洁')){ stateCls='good'; stateIcon='fa-solid fa-check'; }
      html+=`<div class="th-clothing-card${wear==='脱下'?' is-off':''}">`;
      html+=`<div class="th-clothing-icon"><i class="fa-solid fa-vest"></i></div>`;
      html+=`<div class="th-clothing-info">`;
      html+=`<div class="th-clothing-name">${esc(n)}</div>`;
      if(part) html+=`<div class="th-clothing-part"><i class="fa-solid fa-location-dot"></i> ${esc(part)}</div>`;
      // 批次0：穿着情况/破损状态 chip——列表浮窗内可点击切换（ownerPath 非空时带 data 委托）
      const toggleAttr = ownerPath ? ` data-clothing-toggle="穿着情况" data-clothing-owner="${escAttr(ownerPath)}" data-clothing-name="${escAttr(n)}" title="点击切换穿着情况"` : '';
      const toggleAttrDmg = ownerPath ? ` data-clothing-toggle="破损状态" data-clothing-owner="${escAttr(ownerPath)}" data-clothing-name="${escAttr(n)}" title="点击切换破损状态"` : '';
      html+=`<div class="th-clothing-card-chips">`;
      html+=`<span class="th-clothing-chip th-clothing-chip-wear${wear==='脱下'?' is-off':''}"${toggleAttr}>${esc(wear)}</span>`;
      html+=`<span class="th-clothing-chip th-clothing-chip-dmg dmg-${dmgIdx}"${toggleAttrDmg}>${esc(dmg)}</span>`;
      html+=`</div>`;
      if(state) html+=`<span class="th-clothing-state ${stateCls}"><i class="${stateIcon}"></i> ${esc(state)}</span>`;
      if(detail) html+=`<div class="th-clothing-detail">${esc(detail)}</div>`;
      if(ev) html+=`<div class="th-hover-item-meta"><i class="fa-solid fa-comment"></i> ${esc(ev)}</div>`;
      html+=`</div></div>`;
    }
    html+=`</div>`;
  }
  return html;
}
// 需求6：NPC状态悬停（装备卡片风格）
export function showNpcStatusHover(anchor:HTMLElement, statuses:Record<string,any>, npcName:string) {
  if(hoverTimeout) clearTimeout(hoverTimeout);
  const tip=ensureHoverTip(); if(!tip) return;
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
  positionTipWithFloatingUi(tip, anchor, 'hover', { maxW: 400 });
}

// ================================================================
//  需求1修订：NPC 轮盘（头像hover五维 — 使用对象池避免频繁DOM创建）
// ================================================================
let wheelEl: HTMLElement|null = null;
let wheelItems: HTMLElement[] = [];
function ensureWheelPool() {
  if (!wheelEl) {
    wheelEl = __doc.createElement('div');
    wheelEl.className = 'th-npc-metric-wheel';
    for (let i = 0; i < NPC_METRICS.length; i++) {
      const item = __doc.createElement('div');
      item.className = 'th-wheel-item-cascade';
      wheelEl.appendChild(item);
      wheelItems.push(item);
    }
    __body.appendChild(wheelEl);
  }
}
export function showMetricWheel(anchor:HTMLElement, npcInfo:Record<string,any>) {
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
export function hideMetricWheel() {
  if(wheelEl){ wheelEl.style.display = 'none'; }
}

// ================================================================
//  状态详情弹窗（需求3+需求9：编辑支持）
// ================================================================
export function openStatusDetail(name:string, effect:string, source:string, duration:string, editPath:string) {
  let h='';
  if(getStatusEditMode()){
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

export function openClothingDetailModal(name:string, part:string, state:string, detail:string, editPath:string, wear:string='穿着', dmg:string='完好无缺', evalTxt:string='') {
  const dmgIdx=Math.max(0,['完好无缺','轻微破损','中度破损','严重破坏'].indexOf(dmg));
  let h='';
  if(getStatusEditMode()){
    h+=`<div class="th-modal-section"><div class="th-modal-label">名称</div>${editableInput(name,editPath+'.名称')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">穿着部位</div>${editableInput(part,editPath+'.穿着部位')}</div>`;
    // 批次0：穿着情况 / 破损状态 enum 下拉编辑（select 复用 .th-edit-input → applyEdit）
    h+=`<div class="th-modal-section"><div class="th-modal-label">穿着情况</div><select class="th-edit-input th-edit-select" data-edit-path="${escAttr(editPath)}.穿着情况"><option value="穿着"${wear==='穿着'?' selected':''}>穿着</option><option value="脱下"${wear==='脱下'?' selected':''}>脱下</option></select></div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">破损状态</div><select class="th-edit-input th-edit-select" data-edit-path="${escAttr(editPath)}.破损状态">${['完好无缺','轻微破损','中度破损','严重破坏'].map((o,i)=>`<option value="${o}"${i===dmgIdx?' selected':''}>${o}</option>`).join('')}</select></div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">衣物状态</div>${editableInput(state,editPath+'.衣物状态')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">外观详情</div>${editableTextarea(detail,editPath+'.外观详情')}</div>`;
    h+=`<div class="th-modal-section"><div class="th-modal-label">评价</div>${editableTextarea(evalTxt,editPath+'.评价')}</div>`;
  } else {
    h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-vest"></i> ${esc(name)}</div>`;
    h+=`<div style="font-size:13px;color:var(--lav);font-weight:700;margin-bottom:6px">${esc(part)} · <span style="color:var(--pink)">${esc(state)}</span></div>`;
    h+=`<div class="th-clothing-card-chips" style="margin-bottom:8px">`;
    h+=`<span class="th-clothing-chip th-clothing-chip-wear${wear==='脱下'?' is-off':''}">${esc(wear)}</span>`;
    h+=`<span class="th-clothing-chip th-clothing-chip-dmg dmg-${dmgIdx}">${esc(dmg)}</span>`;
    h+=`</div>`;
    h+=`<div class="th-modal-text">${esc(detail)}</div>`;
    if(evalTxt) h+=`<div class="th-modal-section"><div class="th-modal-label"><i class="fa-solid fa-comment"></i> 评价</div><div class="th-modal-text">${esc(evalTxt)}</div></div>`;
    h+=`</div>`;
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
//  地点/事件总览 hover tip（需求1）
// ================================================================
// 需求1：地点/事件总览弹窗
let locHoverTimer: ReturnType<typeof setTimeout>|null = null;
let locHoverTip: HTMLElement|null = null;

function ensureLocHoverTip(): HTMLElement {
  if (!locHoverTip) {
    locHoverTip = __doc.createElement('div');
    locHoverTip.className = 'th-loc-hover-tip';
    locHoverTip.style.display = 'none';
    __body.appendChild(locHoverTip);
  }
  return locHoverTip;
}
export function showLocHover(anchor:HTMLElement, name:string, desc:string, kind:ManagedKind='location') {
  if (locHoverTimer) clearTimeout(locHoverTimer);
  const cfg=getStashKindCfg(kind);
  const isStash = kind.startsWith('stash-');
  const tip = ensureLocHoverTip();
  if (isStash) {
    // 储藏间不绑世界书，只显示名称和描述
    const displayDesc = getDisplayDesc(desc);
    tip.innerHTML = `<div class="th-loc-hover-name"><i class="${cfg.icon}"></i> ${esc(name)}</div><div class="th-loc-hover-desc">${esc(displayDesc)}</div>`;
  } else {
    const state=managedEntryStates[kind]?.[name];
    const bindText=state?.bound?`已绑定 ${state.count} 个条目，已开启 ${state.enabledCount} 个`:'未找到对应世界书条目';
    tip.innerHTML = `<div class="th-loc-hover-name"><i class="${cfg.icon}"></i> ${esc(name)}</div><div class="th-loc-hover-desc">${esc(desc)}</div><div class="th-loc-hover-bind ${state?.bound?'bound':'unbound'}"><i class="fa-solid fa-circle-info"></i> ${esc(bindText)}</div>`;
  }
  positionTipWithFloatingUi(tip, anchor, 'loc', { maxW: 400 });
  // 浮窗自身 keepalive：同 .th-hover-tip 模式
  tip.onmouseenter = () => { if (locHoverTimer) { clearTimeout(locHoverTimer); locHoverTimer = null; } };
  tip.onmouseleave = () => { hideLocHoverNow(); };
}
export function hideLocHover() {
  if (locHoverTimer) clearTimeout(locHoverTimer);
  locHoverTimer = setTimeout(() => { hideLocHoverNow(); }, 150);
}
function hideLocHoverNow() {
  if (locHoverTimer) { clearTimeout(locHoverTimer); locHoverTimer = null; }
  if (locHoverTip) {
    locHoverTip.style.display = 'none';
    locHoverTip.onmouseenter = null;
    locHoverTip.onmouseleave = null;
  }
  if (activeLocCleanup) { activeLocCleanup(); activeLocCleanup = null; }
}

// 销毁：移除 portal 到 __body 的浮动元素 + 清定时器/cleanup（由主文件 destroy 调用）。
// 这些元素在 hover-tip 模块私有作用域内 lazy 创建，故由本模块负责回收。
export function destroyHoverTips() {
  try { if (hoverTimeout) { clearTimeout(hoverTimeout); hoverTimeout = null; } } catch(e){ void e; }
  try { if (locHoverTimer) { clearTimeout(locHoverTimer); locHoverTimer = null; } } catch(e){ void e; }
  try { if (activeHoverCleanup) { activeHoverCleanup(); activeHoverCleanup = null; } } catch(e){ void e; }
  try { if (activeLocCleanup) { activeLocCleanup(); activeLocCleanup = null; } } catch(e){ void e; }
  try { if (wheelEl && wheelEl.parentNode) wheelEl.parentNode.removeChild(wheelEl); } catch(e){ void e; }
  wheelEl = null; wheelItems = [];
  try { if (locHoverTip && locHoverTip.parentNode) locHoverTip.parentNode.removeChild(locHoverTip); } catch(e){ void e; }
  locHoverTip = null;
  try { if (hoverTip && hoverTip.parentNode) hoverTip.parentNode.removeChild(hoverTip); } catch(e){ void e; }
  hoverTip = null;
}

