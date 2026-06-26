// DOM 查询/工具 + 环境单例（解耦阶段 0c）。
// 状态栏 DOM 挂在酒馆主页面 parent.document 上（脚本运行在无沙盒 iframe），
// 因此 __doc/__body 取 window.parent.document，所有 qs/qsa 查询都限定在 wrapper 内。
//
// 可变单例引用安全策略（避免“引用断开”）：
// - __abortController / _wrapperEl 用模块级 let 持有，不直接 export 绑定；
//   外部一律通过函数访问（__sigOpt/__sigOptCapture/gw/qs/qsa 闭包内读最新值，
//   setupStatusBar 通过 resetAbortController() 重置）。
// - __doc / __body / _wrapperId 是初始化后不变的 const，直接 export 绑定。
// 行为与 status-bar-init.ts 原内联实现完全一致。
// ================================================================

export const __doc: Document = (() => {
  try {
    const d = (window.parent as Window | null)?.document;
    if (d) return d;
  } catch (e) { void e; }
  return document;
})();
export const __body: HTMLElement = __doc.body || (document.body as HTMLElement);
// 批次0 反馈1：状态栏 DOM 在 parent.document，事件/scroll 需挂在 parent window，供 hover-tip 滚动重定位
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
export function qs<T extends HTMLElement>(s:string): T|null { const w=gw(); return w?w.querySelector<T>(s):null; }
export function qsa<T extends HTMLElement>(s:string): NodeListOf<T> { const w=gw(); return w?w.querySelectorAll<T>(s):([] as any); }
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
// 依赖 relatedTarget 排除子元素间冒泡造成的伪进出。1f npc-detail 与主面板 bindBlockHoverAndClick 共用。
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
