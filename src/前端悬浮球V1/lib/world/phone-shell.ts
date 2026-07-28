// 世界套件 · 共享外壳（横版平板 / 电脑屏）
// 目标：点开「世界」后，桌面与每个 APP 都渲染在一台居中悬浮的横版平板里——
//   薄边框机身 + 顶部实时状态栏(墙上时钟 HH:MM + 信号格 + wifi + 电池) + 宽屏壁纸 + 居中内容列(stage) + 底部 Home 条。
//   各 APP 的布局直接放进中央 stage 内容列(显著加宽)，两侧留白展示壁纸渐变，无需逐 APP 返工。
// 用法：openModal2(title, phoneShellHtml({ rid, appClass }), { maxWidth, phone:true, revive });
//   - rid：内容列(stage)容器 id（各 APP 自己的 RID），APP 在此 id 下渲染/委托事件。
//   - appClass：附加在 .th-phone 上的 APP 主题类（如 'th-wx'），驱动各 APP 的 CSS 变量。
// 配套 startPhoneClock()/stopPhoneClock() 在开/关时起停墙上时钟。
import { qs2, qsa } from '../dom-utils';
import { getWorldConfig } from './world-store';

export interface PhoneShellOpts {
  rid: string;            // 内容列(stage)容器 id
  appClass?: string;      // 附加在机身上的 APP 主题类
  noScreenScroll?: boolean; // 内容列是否不自管滚动（默认 stage flex 列，由内层滚）
}

// 当前墙上时间 HH:MM（状态栏时钟，跟现实时间走，纯装饰沉浸用）
function wallClock(): string {
  try {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch (e) { void e; return '12:00'; }
}

// 顶部状态栏（左：时钟；右：信号格 + wifi + 电池）。pointer-events:none，纯展示，不挡交互。
function statusBarHtml(): string {
  return `<div class="th-phone-statusbar">
    <span class="th-phone-sb-time" data-phone-clock>${wallClock()}</span>
    <span class="th-phone-sb-right">
      <span class="th-phone-signal"><i></i><i></i><i></i><i></i></span>
      <span class="th-phone-wifi"></span>
      <span class="th-phone-battery"><span class="th-phone-battery-lv"></span></span>
    </span>
  </div>`;
}

// 完整机身 HTML。屏幕内容容器 #rid（stage 内容列）由各 APP 在其后 render()。
export function phoneShellHtml(opts: PhoneShellOpts): string {
  const theme = getWorldConfig().theme || 'candy';
  const cls = ['th-phone', 'th-phone-pad', `th-wtheme-${theme}`, opts.appClass || ''].filter(Boolean).join(' ');
  return `<div class="${cls}">
    <div class="th-phone-frame">
      ${statusBarHtml()}
      <div class="th-phone-screen">
        <div id="${opts.rid}" class="th-phone-stage"></div>
      </div>
      <button class="th-phone-home" data-phone-home type="button" title="返回桌面" aria-label="返回桌面"></button>
    </div>
  </div>`;
}

// Home 条「返回桌面」：各 app 共用底部 Home 条，点它回到世界桌面（不关整个世界，
// 避免「进一个 app 后必须整个关掉世界再重开才能进下一个」）。
// world-app 在模块加载时 setPhoneHomeHandler(showDesktop) 注册，phone-shell 不反向依赖 world-app。
let _onHome: (() => void) | null = null;
export function setPhoneHomeHandler(fn: (() => void) | null): void { _onHome = fn; }

// ===== 世界外壳可拖动（把居中悬浮的平板拖到视口任意位置）=====
// 偏移是模块级、跨 app 重渲染持久（切 app 不跳位）；世界完全关闭时 resetPhoneDrag() 回居中。
let _phoneDX = 0, _phoneDY = 0;
export function resetPhoneDrag(): void { _phoneDX = 0; _phoneDY = 0; }
// 拖拽手柄 = 机身边框/状态栏条/Home 条（.th-phone-frame 上、屏幕 .th-phone-screen 以外的区域），
// app 内容点击/滚动与右上角关闭钮不触发拖动。每次 openModal2(phone) 重渲染后调用一次即可。
export function applyPhoneDrag(): void {
  const phone = qs2<HTMLElement>('.th-phone');
  const frame = qs2<HTMLElement>('.th-phone-frame');
  if (!phone || !frame) return;
  phone.style.transform = `translate(${_phoneDX}px,${_phoneDY}px)`;
  if (frame.dataset.thDragBound === '1') return;
  frame.dataset.thDragBound = '1';
  const host: Window = (() => { try { return window.parent || window; } catch (e) { void e; return window; } })();
  // Home 条「返回桌面」：委托到 frame，点 Home 回桌面（不进入拖拽）。
  frame.addEventListener('click', (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-phone-home]')) {
      e.preventDefault();
      e.stopPropagation();
      if (_onHome) { try { _onHome(); } catch (err) { void err; } }
    }
  });
  frame.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('.th-phone-screen') || t.closest('.th-modal-close-2') || t.closest('[data-phone-home]')) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, bx = _phoneDX, by = _phoneDY;
    frame.style.cursor = 'grabbing';
    const mv = (ev: PointerEvent) => {
      let nx = bx + (ev.clientX - sx), ny = by + (ev.clientY - sy);
      // clamp：保证机身至少留一部分在视口内（用机身实际尺寸做半宽/半高兜底）
      const vw = host.innerWidth || 1280, vh = host.innerHeight || 720;
      const fw = frame.offsetWidth || 900, fh = frame.offsetHeight || 640;
      const marginX = Math.max(120, fw / 2), marginY = Math.max(80, fh / 2);
      nx = Math.max(-(vw / 2 + fw / 2 - marginX), Math.min(vw / 2 + fw / 2 - marginX, nx));
      ny = Math.max(-(vh / 2 + fh / 2 - marginY), Math.min(vh / 2 + fh / 2 - marginY, ny));
      _phoneDX = nx; _phoneDY = ny;
      phone.style.transform = `translate(${_phoneDX}px,${_phoneDY}px)`;
    };
    const up = () => {
      host.removeEventListener('pointermove', mv);
      try { frame.style.cursor = ''; } catch (er) { void er; }
    };
    host.addEventListener('pointermove', mv);
    host.addEventListener('pointerup', up, { once: true });
  });
}

// ===== 墙上时钟定时器：开手机时 start、关手机时 stop（跨 APP 共用单例）=====
let _clockTimer: number | null = null;
function tickClock(): void {
  try {
    const label = wallClock();
    qsa<HTMLElement>('[data-phone-clock]').forEach(el => { el.textContent = label; });
  } catch (e) { void e; }
}
export function startPhoneClock(): void {
  tickClock();
  if (_clockTimer != null) return;
  try {
    _clockTimer = (setInterval(tickClock, 30000) as unknown) as number;
  } catch (e) { void e; }
}
export function stopPhoneClock(): void {
  if (_clockTimer != null) {
    try { clearInterval(_clockTimer as unknown as number); } catch (e) { void e; }
    _clockTimer = null;
  }
}

// ===== 统一图片上传（与状态栏头像/画廊同链路：点击→弹文件框→选图→FileReader 转 dataURL）=====
// 世界套件各 APP（微信头像/图片/表情包、微博头像/背景/配图）共用。返回 dataURL；取消或失败返回 null。
// 在 parent.document 上临时建 <input type=file>（iframe 的 file input 在部分宿主下点不开），用完即弃。
function getDocW(): Document {
  try { return (window.parent || window).document; } catch (e) { void e; return document; }
}
export function pickImageFile(opts?: { maxBytes?: number }): Promise<string | null> {
  const maxBytes = opts?.maxBytes ?? 3 * 1024 * 1024; // 默认 3MB 上限，超限提示压缩
  return new Promise(resolve => {
    let settled = false;
    const done = (v: string | null) => { if (!settled) { settled = true; resolve(v); } };
    try {
      const doc = getDocW();
      const input = doc.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      input.addEventListener('change', () => {
        const f = input.files && input.files[0];
        try { input.remove(); } catch (e) { void e; }
        if (!f) { done(null); return; }
        if (f.size > maxBytes) {
          try { (window as any).toastr?.warning?.(`图片过大（${(f.size / 1048576).toFixed(1)}MB），请压缩到 ${(maxBytes / 1048576).toFixed(0)}MB 内`); } catch (e) { void e; }
          done(null); return;
        }
        const r = new FileReader();
        r.onload = () => done(typeof r.result === 'string' ? r.result : null);
        r.onerror = () => done(null);
        r.readAsDataURL(f);
      }, { once: true });
      // 取消文件框时 change 不触发——用 window focus 兜底，宽限后若未选则视为取消。
      const onFocus = () => {
        setTimeout(() => { if (!settled && (!input.files || !input.files.length)) { try { input.remove(); } catch (e) { void e; } done(null); } }, 400);
        window.removeEventListener('focus', onFocus);
      };
      window.addEventListener('focus', onFocus);
      doc.body.appendChild(input);
      input.click();
    } catch (e) { void e; done(null); }
  });
}

