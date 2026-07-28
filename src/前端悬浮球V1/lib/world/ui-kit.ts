// ============================================================================
// ui-kit.ts — 悬浮球内置 UI 组件库
//
// 目标：用 in-iframe（实为 parent.document，挂在 .th-status-wrapper 内）玻璃拟态组件
// 替换外部 toastr / window.confirm / window.prompt / window.alert。
//   · thToast(msg, type?)            队列化通知，自动消失 + 退场动画
//   · thConfirm({...}): Promise<bool> 玻璃确认框（两等分按钮，危险态红）
//   · thPrompt({...}): Promise<string|null>  内嵌输入弹窗（input/textarea）
//   · thAlert({...}): Promise<void>   单按钮提示
//
// 设计：所有组件渲染进 wrapper（gw()）内，自动继承 status-bar.css 的作用域样式
// 与输入框白底兜底；XSS 一律 esc()；Promise 化可 await；ESC/背景点击取消。
// 视觉 token 与动画在 status-bar.css 的「ui-kit」段定义。
// ============================================================================
import { __doc, __body, gw, esc } from '../dom-utils';

export type ToastType = 'info' | 'success' | 'warn' | 'error';

const TOAST_ICON: Record<ToastType, string> = {
  info: 'M12 16v-4M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  success: 'M20 6 9 17l-5-5',
  warn: 'M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z',
  error: 'M18 6 6 18M6 6l12 12',
};

function svgIcon(path: string): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

// ---- Toast 队列 ----------------------------------------------------------
type ToastJob = { msg: string; type: ToastType };
let _toastHost: HTMLElement | null = null;
const _toastQueue: ToastJob[] = [];
let _toastShowing = 0;
const TOAST_MAX = 3; // 同时最多 3 条

function ensureToastHost(): HTMLElement | null {
  if (_toastHost?.isConnected) return _toastHost;
  // 挂到 body(而非 wrapper):wrapper 有 position:relative;z-index:0 会建立层叠上下文,
  // 世界 overlay portal 到 body(z 100300) 后会盖住 wrapper 内的一切(无论子 z 多高);
  // 且世界打开时 body.th-world-active .th-fab-panel{pointer-events:none} 会波及 wrapper 内弹窗。
  // 直接挂 body 根级 → toast z 110200 / dialog z 110100 真正压过世界,且不被 pointer-events 拦。
  const host = _toastHost && _toastHost.isConnected ? _toastHost : __body.querySelector<HTMLElement>('.th-toast-host');
  if (host) { _toastHost = host; return host; }
  const el = __doc.createElement('div');
  el.className = 'th-toast-host';
  el.setAttribute('data-th-portal', '1');
  __body.appendChild(el);
  _toastHost = el;
  return el;
}

function pumpToast(): void {
  if (_toastShowing >= TOAST_MAX) return;
  const job = _toastQueue.shift();
  if (!job) return;
  const host = ensureToastHost();
  if (!host) return;
  _toastShowing++;
  const el = __doc.createElement('div');
  el.className = `th-toast th-toast-${job.type}`;
  el.innerHTML = `<span class="th-toast-ico">${svgIcon(TOAST_ICON[job.type])}</span><span class="th-toast-msg">${esc(job.msg)}</span>`;
  host.appendChild(el);
  // 入场
  requestAnimationFrame(() => el.classList.add('th-toast-in'));
  const dismiss = () => {
    if (el.classList.contains('th-toast-out')) return;
    el.classList.add('th-toast-out');
    setTimeout(() => {
      el.remove();
      _toastShowing--;
      pumpToast();
    }, 320);
  };
  el.addEventListener('click', dismiss);
  setTimeout(dismiss, job.type === 'error' ? 5200 : 3600);
  // 还有余位则继续放下一条
  if (_toastShowing < TOAST_MAX) pumpToast();
}

/** 队列化玻璃通知。替换 toastr.*。 */
export function thToast(msg: string, type: ToastType = 'info'): void {
  if (!msg) return;
  // 同源合并：队列里已有完全相同的就不重复堆
  if (_toastQueue.some(j => j.msg === msg && j.type === type)) return;
  _toastQueue.push({ msg, type });
  pumpToast();
}

// toastr 兼容别名，便于逐步替换：thToastr.success('x') 等
export const thToastr = {
  info: (m: string) => thToast(m, 'info'),
  success: (m: string) => thToast(m, 'success'),
  warning: (m: string) => thToast(m, 'warn'),
  error: (m: string) => thToast(m, 'error'),
};

// ---- Dialog（confirm / prompt / alert 共用底座）---------------------------
type DialogResolve = (v: any) => void;

function buildDialog(innerHtml: string, onMount: (overlay: HTMLElement, close: DialogResolve) => void): void {
  if (!gw()) return; // wrapper 不存在=UI 未加载,不弹
  const overlay = __doc.createElement('div');
  overlay.className = 'th-dlg-overlay';
  overlay.setAttribute('data-th-portal', '1');
  overlay.innerHTML = `<div class="th-dlg" role="dialog" aria-modal="true">${innerHtml}</div>`;
  // 挂 body(见 ensureToastHost 同理):逃出 wrapper 层叠上下文 + pointer-events 陷阱,
  // 使世界内(portal 到 body)弹出的确认框真正压在世界之上且可点。
  __body.appendChild(overlay);
  const dlg = overlay.querySelector<HTMLElement>('.th-dlg')!;
  requestAnimationFrame(() => { overlay.classList.add('th-dlg-show'); });
  const close = (v: any, resolve: DialogResolve) => {
    overlay.classList.remove('th-dlg-show');
    overlay.classList.add('th-dlg-hide');
    setTimeout(() => overlay.remove(), 240);
    resolve(v);
  };
  // onMount 负责绑按钮 + 决定 resolve 值；这里把 close 透传
  onMount(overlay, (v) => close(v, (overlay as any).__resolve));
  void dlg;
}

export type ConfirmOpts = {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

/** 玻璃确认框。替换 window.confirm。 */
export function thConfirm(opts: ConfirmOpts = {}): Promise<boolean> {
  const { title = '确认', message = '', confirmText = '确定', cancelText = '取消', danger = false } = opts;
  return new Promise<boolean>(resolve => {
    const html =
      `<div class="th-dlg-head">${esc(title)}</div>` +
      (message ? `<div class="th-dlg-body">${esc(message)}</div>` : '') +
      `<div class="th-dlg-acts th-dlg-acts-2">` +
        `<button class="th-dlg-btn th-dlg-cancel" type="button">${esc(cancelText)}</button>` +
        `<button class="th-dlg-btn th-dlg-ok${danger ? ' th-dlg-danger' : ''}" type="button">${esc(confirmText)}</button>` +
      `</div>`;
    buildDialog(html, (overlay, close) => {
      (overlay as any).__resolve = resolve;
      overlay.querySelector('.th-dlg-ok')!.addEventListener('click', () => close(true));
      overlay.querySelector('.th-dlg-cancel')!.addEventListener('click', () => close(false));
      overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
    });
  });
}

export type PromptOpts = {
  title?: string;
  message?: string;
  placeholder?: string;
  value?: string;
  confirmText?: string;
  cancelText?: string;
  multiline?: boolean;
  rows?: number;   // 多行时文本域行数（默认 4；编辑长文如世界书条目可调大）
};

/** 内嵌输入弹窗。替换 window.prompt。resolve(null) 表示取消。 */
export function thPrompt(opts: PromptOpts = {}): Promise<string | null> {
  const { title = '请输入', message = '', placeholder = '', value = '', confirmText = '确定', cancelText = '取消', multiline = false, rows } = opts;
  return new Promise<string | null>(resolve => {
    const field = multiline
      ? `<textarea class="th-dlg-input th-dlg-textarea" rows="${Math.max(2, rows || 4)}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
      : `<input class="th-dlg-input" type="text" placeholder="${esc(placeholder)}" value="${esc(value)}">`;
    const html =
      `<div class="th-dlg-head">${esc(title)}</div>` +
      (message ? `<div class="th-dlg-body">${esc(message)}</div>` : '') +
      `<div class="th-dlg-field">${field}</div>` +
      `<div class="th-dlg-acts th-dlg-acts-2">` +
        `<button class="th-dlg-btn th-dlg-cancel" type="button">${esc(cancelText)}</button>` +
        `<button class="th-dlg-btn th-dlg-ok" type="button">${esc(confirmText)}</button>` +
      `</div>`;
    buildDialog(html, (overlay, close) => {
      (overlay as any).__resolve = resolve;
      const input = overlay.querySelector<HTMLInputElement | HTMLTextAreaElement>('.th-dlg-input')!;
      setTimeout(() => { input.focus(); input.select?.(); }, 60);
      const submit = () => close(input.value);
      overlay.querySelector('.th-dlg-ok')!.addEventListener('click', submit);
      overlay.querySelector('.th-dlg-cancel')!.addEventListener('click', () => close(null));
      overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
      if (!multiline) {
        input.addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); submit(); } });
      }
    });
  });
}

/** 单按钮提示。替换 window.alert。 */
export function thAlert(opts: { title?: string; message?: string; okText?: string } = {}): Promise<void> {
  const { title = '提示', message = '', okText = '知道了' } = opts;
  return new Promise<void>(resolve => {
    const html =
      `<div class="th-dlg-head">${esc(title)}</div>` +
      (message ? `<div class="th-dlg-body">${esc(message)}</div>` : '') +
      `<div class="th-dlg-acts"><button class="th-dlg-btn th-dlg-ok" type="button">${esc(okText)}</button></div>`;
    buildDialog(html, (overlay, close) => {
      (overlay as any).__resolve = resolve;
      overlay.querySelector('.th-dlg-ok')!.addEventListener('click', () => close(undefined));
      overlay.addEventListener('click', e => { if (e.target === overlay) close(undefined); });
    });
  });
}

// ---- 多选项弹窗（如：增量刷新 / 覆盖刷新 / 取消）-----------------------------
export type ChooseOption = { value: string; label: string; desc?: string; primary?: boolean; danger?: boolean };
export type ChooseOpts = { title?: string; message?: string; options: ChooseOption[]; cancelText?: string };
/** 玻璃多选项弹窗。点选项→resolve(value)，背景/ESC/取消→resolve(null)。 */
export function thChoose(opts: ChooseOpts): Promise<string | null> {
  const { title = '请选择', message = '', options, cancelText = '取消' } = opts;
  return new Promise<string | null>(resolve => {
    const btns = options.map((o, i) =>
      `<button class="th-dlg-choice${o.primary ? ' th-dlg-choice-primary' : ''}${o.danger ? ' th-dlg-choice-danger' : ''}" data-choice="${i}" type="button">` +
        `<span class="th-dlg-choice-label">${esc(o.label)}</span>` +
        (o.desc ? `<span class="th-dlg-choice-desc">${esc(o.desc)}</span>` : '') +
      `</button>`).join('');
    const html =
      `<div class="th-dlg-head">${esc(title)}</div>` +
      (message ? `<div class="th-dlg-body">${esc(message)}</div>` : '') +
      `<div class="th-dlg-choices">${btns}</div>` +
      `<div class="th-dlg-acts"><button class="th-dlg-btn th-dlg-cancel" type="button">${esc(cancelText)}</button></div>`;
    buildDialog(html, (overlay, close) => {
      (overlay as any).__resolve = resolve;
      overlay.querySelectorAll('.th-dlg-choice').forEach(b => b.addEventListener('click', () => {
        const idx = Number((b as HTMLElement).getAttribute('data-choice'));
        close(options[idx]?.value ?? null);
      }));
      overlay.querySelector('.th-dlg-cancel')!.addEventListener('click', () => close(null));
      overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
    });
  });
}
