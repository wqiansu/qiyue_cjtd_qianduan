// 读全局接口 window 优先 → getRoot() 兜底（跨窗口陷阱）。
import { esc, qs } from '../../lib/dom-utils';
import { openModal2, closeModal2 } from '../../status-bar-init';
import { getRoot } from '../../lib/tavern-api';
import { iconHtml } from '../../lib/icons';
import { phoneShellHtml, startPhoneClock, stopPhoneClock, resetPhoneDrag, setPhoneHomeHandler } from '../../lib/world/phone-shell';
import {
  getWorldApps,
} from '../../lib/world/world-store';
import './settings-app';   // 副作用导入：触发 settings-app 自注册桌面「设置」app
import { startInjectionBus } from '../../lib/world/inject-plan';
// APP 自注册：import 即触发各 APP 模块底部的 registerWorldApp（桌面壳只读注册表，不直接调用）。
import './wechat';
import './evolution';
import './theater';
import './forum';
import './weibo';
import './tangxin';
import './call';
import './bili';
import './red';
import './cal';
import './diary';
import './browser';
import './taobao';
import './meituan';
import './fanfan';
import './xmly';
import './zui';
import './memory-center';
import './wkb';
import { maybeAutoEvolve, setEvoBackgroundMode } from './evolution';
import { maybeAutoWorldAdvance } from './world-state-ui';

const WORLD_MODAL_MAXW = 'min(960px,96vw)';
const WORLD_RID = 'th-world-screen';

// 模块加载即挂注入总线（生成前装配楼层注入），不依赖打开桌面，保证任意 app 注入都生效。
try { startInjectionBus(); } catch (e) { void e; }

// ==================== 真·后台自动推进 ====================
// 模块加载即监听酒馆「正文生成结束」事件，节流后在后台推进（够格的订阅组/世界背景线/世界态）。
// 铁律：① 只在 GENERATION_ENDED 之后触发（此刻生成锁已释放，不撞正文生成）；② 全局节流闸 _bgBusy
//   + 两次触发最小间隔，避免连撞；③ 演化与世界态串行（先演化、再世界态），各自内部已有「一次只推一个」的智能节拍；
//   ④ 任何异常静默吞掉，绝不影响正文。降级：无 eventOn 接口时不挂（仍保留开 app 补算的老路径）。
let _bgAutoBound = false;
let _bgBusy = false;
let _bgLastRun = 0;
function bgFloorCount(): number {
  try { const a = (getRoot() as any)?.getChatMessages?.(); return Array.isArray(a) ? a.length : 0; } catch (e) { void e; return 0; }
}
function startBackgroundAutoAdvance(): void {
  if (_bgAutoBound) return;
  try {
    const w = window as any;
    const evOn = (typeof w.eventOn === 'function' ? w.eventOn : null) || ((getRoot() as any)?.eventOn);
    const events = w.tavern_events || (getRoot() as any)?.tavern_events || null;
    if (typeof evOn !== 'function') return; // 环境不支持则降级（保留开 app 补算）
    const evtName = events?.GENERATION_ENDED || 'generation_ended';
    evOn(evtName, () => {
      // 生成刚结束，延后一拍再跑（让酒馆把新楼落库、释放锁）。
      setTimeout(() => { void runBackgroundTick(); }, 1500);
    });
    _bgAutoBound = true;
  } catch (e) { void e; }
}
async function runBackgroundTick(): Promise<void> {
  if (_bgBusy) return;
  const now = Date.now();
  if (now - _bgLastRun < 8000) return; // 最小间隔 8s，防连触
  _bgBusy = true; _bgLastRun = now;
  try {
    // 后台模式：render() 遇到「app 未打开」时静默返回，绝不自动把演化 app 弹出来打断玩家。
    // 注意：内部推进是 fire-and-forget 异步（void runSubscription/runWorldAdvance），render() 会在本函数
    //   返回后才被调用，所以这里 setEvoBackgroundMode(true) 后【不】在 finally 里复位——由 openApp() 在
    //   玩家真正打开演化 app 时复位（见 evolution.setEvoBackgroundMode(false)）。
    setEvoBackgroundMode(true);
    // 先演化（订阅组/世界背景线，内部「一次只推一个」）——串行等它跑完，避免与世界态撞生成锁。
    try { maybeAutoEvolve(); } catch (e) { void e; }
    // 世界态自动推进（内部按 autoInterval 判据；与演化各自独立节拍）。
    try { maybeAutoWorldAdvance(bgFloorCount); } catch (e) { void e; }
  } finally { _bgBusy = false; }
}
try { startBackgroundAutoAdvance(); } catch (e) { void e; }

// issue 2：各 app 底部 Home 条「返回桌面」→ 回世界桌面（不关整个世界，可连续切 app）。
// 走 openModal2 的 reset(清栈) + revive(showDesktop)，与顶栏进桌面同一路径。
try { setPhoneHomeHandler(() => { try { showDesktop(); } catch (e) { void e; } }); } catch (e) { void e; }

// 读酒馆「世界信息」（日期/时间/天气），用于桌面顶部状态条。
// 优先走状态栏暴露的 bridge（getCurrentData），跨窗口兜底 getRoot()。
function getWorldInfo(): { date: string; time: string; weather: string } {
  let data: Record<string, any> | null = null;
  try {
    const bridge = (window as any).__thStatusBarData || (getRoot() as any).__thStatusBarData;
    if (bridge?.getCurrentData) data = bridge.getCurrentData();
  } catch (e) { void e; }
  const w = (data && typeof data === 'object') ? (data['世界信息'] || {}) : {};
  return {
    date: String(w?.['日期'] || ''),
    time: String(w?.['时间'] || ''),
    weather: String(w?.['天气'] || ''),
  };
}

// PLACEHOLDER_RENDER

// ==================== 桌面视图 ====================
// 桌面渲染在手机屏幕（#WORLD_RID）内：顶部一张时间/天气 widget 卡（呼应锁屏时钟），
// 下方 APP 图标网格，底部 dock。机身状态栏(墙上时钟/信号/电池)由 phone-shell 提供。
function renderDesktopHtml(): string {
  const info = getWorldInfo();
  const apps = getWorldApps();
  const widget = `<div class="th-world-clockcard">
    <div class="th-world-cc-time">${info.time ? esc(info.time) : '<span class="th-world-cc-dim">世界时间未知</span>'}</div>
    <div class="th-world-cc-sub">
      ${info.date ? `<span><i class="fa-solid fa-calendar-days"></i> ${esc(info.date)}</span>` : ''}
      ${info.weather ? `<span><i class="fa-solid fa-cloud-sun"></i> ${esc(info.weather)}</span>` : ''}
    </div>
  </div>`;
  const grid = apps.length
    ? `<div class="th-world-grid">${apps.map(a => {
        return `<button class="th-world-app-icon" data-world-open="${esc(a.id)}" type="button" title="${esc(a.name)}">
          <span class="th-world-app-badge" style="${a.accent ? `background:${esc(a.accent)}` : ''}">${iconHtml(a.icon)}</span>
          <span class="th-world-app-name">${esc(a.name)}</span>
        </button>`;
      }).join('')}</div>`
    : `<div class="th-world-empty">
        <i class="fa-solid fa-mobile-screen"></i>
        <div>暂无可用 APP</div>
        <div class="th-world-empty-sub">敬请期待更多 APP</div>
      </div>`;
  return `<div class="th-world-desktop" data-world-root>
    ${widget}
    ${grid}
    <div class="th-world-dock">
      <button class="th-world-dock-btn th-world-exit-btn" data-world-exit type="button" title="退出世界" aria-label="退出世界"><i class="fa-solid fa-xmark"></i></button>
    </div>
  </div>`;
}

function showDesktop(): void {
  openModal2('世界', phoneShellHtml({ rid: WORLD_RID, appClass: 'th-world-host' }), {
    maxWidth: WORLD_MODAL_MAXW,
    reset: true,        // 桌面是基线视图，清栈
    revive: showDesktop,
    phone: true,
  });
  startPhoneClock();
  const screen = qs('#' + WORLD_RID);
  if (screen) screen.innerHTML = renderDesktopHtml();
  bindDesktopEvents();
}

function bindDesktopEvents(): void {
  const root = qs('[data-world-root]');
  if (!root) return;
  root.addEventListener('click', (e: Event) => {
    const openBtn = (e.target as HTMLElement).closest('[data-world-open]') as HTMLElement | null;
    if (openBtn) {
      const id = openBtn.getAttribute('data-world-open') || '';
      const apps = getWorldApps();
      const app = apps.find(a => a.id === id);
      if (app) { try { app.open(); } catch (err) { console.error('[world-app] open', id, err); (window as any).toastr?.error?.('打开失败'); } }
      return;
    }
    if ((e.target as HTMLElement).closest('[data-world-exit]')) {
      closeWorldApp();
      return;
    }
  });
}

// PLACEHOLDER_SETTINGS


// ==================== 公开入口 ====================
export function openWorldApp(): void {
  startInjectionBus();   // 确保注入总线已挂载（生成前装配楼层注入）
  showDesktop();
}
// 关闭整个世界 modal（供 APP 内「退出」用）
export function closeWorldApp(): void {
  stopPhoneClock();
  resetPhoneDrag();   // 世界完全关闭 → 拖拽偏移归零，下次全新打开回居中
  closeModal2();
}

// 各 app 未读聚合（供顶栏「世界」按钮红点用）。任一 app 抛错按 0 计。
export function getWorldUnreadTotal(): number {
  let n = 0;
  for (const a of getWorldApps()) { try { n += a.unread ? (a.unread() || 0) : 0; } catch (e) { void e; } }
  return n;
}

export function refreshWorldUnread(): void { /* no-op：兼容仍在调用的 refreshWorldUnread */ }

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_app__ = { openWorldApp, closeWorldApp, getWorldUnreadTotal, refreshWorldUnread };
} catch (e) { void e; }

// 桥持有本模块闭包，拆卸时必须撤，否则宿主页留住整个 iframe 模块图
export function disposeWorldAppBridge(): void {
  try {
    const w = (typeof window !== 'undefined' ? window : globalThis) as any;
    delete w.__th_world_app__;
  } catch (e) { void e; }
}
