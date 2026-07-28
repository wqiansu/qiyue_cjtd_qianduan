// DOM 查询/工具 + 环境单例。
// 状态栏 DOM 挂在酒馆主页面 parent.document 上（脚本运行在无沙盒 iframe），
// 因此 __doc/__body 取 window.parent.document，所有 qs/qsa 查询都限定在 wrapper 内。
//
// 可变单例引用安全策略（避免“引用断开”）：
// - __abortController / _wrapperEl 用模块级 let 持有，不直接 export 绑定；
//   外部一律通过函数访问（__sigOpt/__sigOptCapture/gw/qs/qsa 闭包内读最新值，
//   setupStatusBar 通过 resetAbortController() 重置）。
// - __doc / __body / _wrapperId 是初始化后不变的 const，直接 export 绑定。
// ================================================================

export const __doc: Document = (() => {
  try {
    const d = (window.parent as Window | null)?.document;
    if (d) return d;
  } catch (e) { void e; }
  return document;
})();
export const __body: HTMLElement = __doc.body || (document.body as HTMLElement);
// 状态栏 DOM 在 parent.document，事件/scroll 需挂在 parent window，供 hover-tip 滚动重定位
export const __win: Window = (() => {
  try {
    const w = window.parent as Window | null;
    if (w) return w;
  } catch (e) { void e; }
  return window;
})();

let __abortController = new AbortController();
export function getAbortController(): AbortController { return __abortController; }
export function resetAbortController(): AbortController { __abortController = new AbortController(); return __abortController; }
export function __sigOpt(): AddEventListenerOptions { return { signal: __abortController.signal }; }
export function __sigOptCapture(): AddEventListenerOptions { return { signal: __abortController.signal, capture: true }; }

export const _wrapperId = 'th-status-'+Math.random().toString(36).slice(2,8);
let _wrapperEl: HTMLElement|null = null;
export function gw(): HTMLElement|null {
  if(_wrapperEl?.isConnected) return _wrapperEl;
  const owned = __doc.querySelector<HTMLElement>('.th-status-wrapper[data-th-id="'+_wrapperId+'"]');
  if (owned) { _wrapperEl = owned; return _wrapperEl; }
  const wrappers = Array.from(__doc.querySelectorAll<HTMLElement>('.th-status-wrapper'));
  const unclaimed = wrappers.filter(w => !w.hasAttribute('data-th-id'));
  _wrapperEl = unclaimed[unclaimed.length - 1] || wrappers[wrappers.length - 1] || null;
  return _wrapperEl;
}
export function qs<T extends HTMLElement>(s:string): T|null {
  const w=gw();
  const hit = w ? w.querySelector<T>(s) : null;
  if (hit) return hit;
  // 兜底：世界壳(.th-modal-overlay-2 子树)已 portal 到父页 body、脱离 wrapper 作用域，
  // wrapper 内未命中时到 portal 宿主里补查一次（对 20 个世界 app 的 qs('#'+RID) 及壳内查询透明生效）。
  const host = modal2PortalHost();
  return host ? host.querySelector<T>(s) : null;
}
export function qsa<T extends HTMLElement>(s:string): NodeListOf<T> {
  const w=gw();
  const inW = w ? w.querySelectorAll<T>(s) : null;
  if (inW && inW.length) return inW;
  const host = modal2PortalHost();
  return (host ? host.querySelectorAll<T>(s) : (inW || ([] as any)));
}
// —— 世界壳 portal 宿主 —— //
// 世界(及所有二级弹窗)的 .th-modal-overlay-2 在 setup 时被移到父页 body（脱离主面板的
// containing block / stacking context，使其 position:fixed 真正相对视口、可拖到任意位置不被囚/裁剪）。
// portal 后它不再是 wrapper 的后代，需单独解析。带 data-th-portal="1" 标记，未迁移时回退 wrapper 内。
let _modal2Host: HTMLElement | null = null;
function modal2PortalHost(): HTMLElement | null {
  if (_modal2Host?.isConnected) return _modal2Host;
  _modal2Host = __doc.querySelector<HTMLElement>('.th-modal-overlay-2[data-th-portal="1"]');
  return _modal2Host;
}
// 世界壳内查询（overlay-2/modal-2/body-2/#RID/.th-phone…）：先查 portal 宿主，找不到再退回 qs()。
export function qs2<T extends HTMLElement>(s:string): T|null {
  const host = modal2PortalHost();
  if (host) { const hit = host.matches(s) ? (host as unknown as T) : host.querySelector<T>(s); if (hit) return hit; }
  return qs<T>(s);
}
// 把 wrapper 内的 .th-modal-overlay-2 迁移到父页 body（一次性；带归属标记，幂等）。
export function portalModal2ToBody(): void {
  try {
    const w = gw();
    const ov = w?.querySelector<HTMLElement>('.th-modal-overlay-2');
    if (ov && ov.parentElement !== __body) {
      ov.setAttribute('data-th-portal', '1');
      ov.setAttribute('data-th-owner', _wrapperId);
      __body.appendChild(ov);
      _modal2Host = ov;
    } else if (ov) {
      ov.setAttribute('data-th-portal', '1');
      ov.setAttribute('data-th-owner', _wrapperId);
      _modal2Host = ov;
    }
  } catch (e) { void e; }
}
// 卸载时清理 portal 出去的 overlay（按 _wrapperId 归属，避免多次挂载/换聊天在 body 上堆叠）。
export function removePortaledModal2(): void {
  try {
    __doc.querySelectorAll<HTMLElement>('.th-modal-overlay-2[data-th-portal="1"]').forEach(el => {
      if (el.getAttribute('data-th-owner') === _wrapperId) el.remove();
    });
  } catch (e) { void e; }
  _modal2Host = null;
}
// 在指定 root 下查（仅用于已脱离 wrapper 的独立 portal 元素，如审核编辑 overlay 直接 append 到 __body）
// 注意：root 必须是 parent document 下的元素；不传 root 时默认 document 是 iframe doc，会查不到东西。
// wrapper 内的 modal 元素一律用 qs()/qsa()，不要用 qsRoot。
export function qsRoot<T extends HTMLElement>(s:string, root: ParentNode): T|null { return root.querySelector<T>(s); }
export function qsaRoot<T extends HTMLElement>(s:string, root: ParentNode): NodeListOf<T> { return root.querySelectorAll<T>(s); }
export function setH(s:string,h:string) { const el=qs(s); if(el)el.innerHTML=h; }
export function setT(s:string,t:string) { const el=qs(s); if(el)el.textContent=t; }
export function clamp(v:number,a:number,b:number) { return Math.max(a,Math.min(b,v)); }

export const ESC_MAP: Record<string,string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
export function esc(s:any):string { return String(s).replace(/[&<>"']/g,ch=>ESC_MAP[ch]); }
export function escAttr(s:any):string { return esc(s); }

export function editableInput(value:string, path:string, type:string='text'): string {
  return `<input class="th-edit-input" type="${type}" value="${escAttr(value)}" data-edit-path="${escAttr(path)}">`;
}
export function editableTextarea(value:string, path:string): string {
  return `<textarea class="th-edit-textarea" data-edit-path="${escAttr(path)}" rows="3">${esc(value)}</textarea>`;
}

// 事件委托 helper：判定 mouseover/mouseout 是否真正进入/离开指定 selector 元素。
// 依赖 relatedTarget 排除子元素间冒泡造成的伪进出。npc-detail 与主面板 bindBlockHoverAndClick 共用。
export function closestWithin<T extends HTMLElement>(container:HTMLElement, target:EventTarget|null, selector:string): T|null {
  const el=(target as HTMLElement|null)?.closest?.(selector) as T|null;
  return el&&container.contains(el)?el:null;
}
export function enteredWithin<T extends HTMLElement>(container:HTMLElement, e:MouseEvent, selector:string): T|null {
  const el=closestWithin<T>(container,e.target,selector);
  if(!el) return null;
  const related=e.relatedTarget as Node|null;
  return related&&el.contains(related)?null:el;
}
export function leftWithin<T extends HTMLElement>(container:HTMLElement, e:MouseEvent, selector:string): T|null {
  const el=closestWithin<T>(container,e.target,selector);
  if(!el) return null;
  const related=e.relatedTarget as Node|null;
  return related&&el.contains(related)?null:el;
}
