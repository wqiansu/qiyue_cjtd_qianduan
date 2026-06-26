// 世界套件 P0 · 桌面壳 + APP 路由 + 套件设置（world-app）
// 入口：顶栏「世界」按钮 → openWorldApp() 打开全屏「手机桌面」大 modal。
// 桌面：读 world-store 的 APP 注册表渲染图标网格（按批次自注册，做到哪显示哪）；
//       顶部状态条显示酒馆「世界信息」的日期/时间/天气（呼应沉浸感）。
// 路由：桌面 ↔ APP 视图 ↔ 套件设置 全部用 openModal2 的 reset/replace 在同一 modal 内切换，
//       不堆叠多层（§10.0 / §10.10）。APP 内部子弹窗才 push。
// 跨窗口：所有交互用 data 属性 + addEventListener 委托（不用 inline onclick）；
//         读全局接口 window 优先 → getRoot() 兜底（§4 跨窗口陷阱）。
import { esc, qs } from '../../lib/dom-utils';
import { openModal2, closeModal2 } from '../../status-bar-init';
import { getRoot } from '../../lib/tavern-api';
import { iconHtml } from '../../lib/icons';
import {
  getWorldApps,
  getWorldConfig,
  saveWorldConfig,
} from '../../lib/world/world-store';
import { openMemoryCenter } from './memory-center';
// APP 自注册：import 即触发各 APP 模块底部的 registerWorldApp（桌面壳只读注册表，不直接调用）。
import './wechat';
import './evolution';
import './theater';
import './forum';

const WORLD_MODAL_MAXW = 'min(960px,96vw)';

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
function renderDesktopHtml(): string {
  const info = getWorldInfo();
  const apps = getWorldApps();
  const statusBar = `<div class="th-world-statusbar">
    <span class="th-world-sb-left"><i class="fa-solid fa-globe"></i> 世界</span>
    <span class="th-world-island"><i class="fa-solid fa-circle"></i></span>
    <span class="th-world-sb-right">
      ${info.date ? `<span><i class="fa-solid fa-calendar-days"></i> ${esc(info.date)}</span>` : ''}
      ${info.time ? `<span><i class="fa-solid fa-clock"></i> ${esc(info.time)}</span>` : ''}
      ${info.weather ? `<span><i class="fa-solid fa-cloud-sun"></i> ${esc(info.weather)}</span>` : ''}
    </span>
  </div>`;
  const grid = apps.length
    ? `<div class="th-world-grid">${apps.map(a => `
        <button class="th-world-app-icon" data-world-open="${esc(a.id)}" type="button" title="${esc(a.name)}">
          <span class="th-world-app-badge" style="${a.accent ? `background:${esc(a.accent)}` : ''}">${iconHtml(a.icon)}</span>
          <span class="th-world-app-name">${esc(a.name)}</span>
        </button>`).join('')}</div>`
    : `<div class="th-world-empty">
        <i class="fa-solid fa-mobile-screen"></i>
        <div>暂无可用 APP</div>
        <div class="th-world-empty-sub">APP 将随版本批次逐个上线（微信 / 世界演化 …）</div>
      </div>`;
  return `<div class="th-world-desktop" data-world-root>
    ${statusBar}
    ${grid}
    <div class="th-world-dock">
      <button class="th-world-dock-btn" data-world-settings type="button"><i class="fa-solid fa-gear"></i> 套件设置</button>
    </div>
  </div>`;
}

function showDesktop(): void {
  openModal2('<i class="fa-solid fa-globe"></i> 世界', renderDesktopHtml(), {
    maxWidth: WORLD_MODAL_MAXW,
    reset: true,        // 桌面是基线视图，清栈
    revive: showDesktop,
  });
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
    if ((e.target as HTMLElement).closest('[data-world-settings]')) {
      showSettings();
    }
  });
}

// PLACEHOLDER_SETTINGS

// ==================== 套件设置视图 ====================
function renderSettingsHtml(): string {
  const cfg = getWorldConfig();
  return `<div class="th-world-settings" data-world-settings-root>
    <div class="th-world-set-head">
      <button class="th-world-back" data-world-back type="button"><i class="fa-solid fa-arrow-left"></i> 桌面</button>
      <span class="th-world-set-title"><i class="fa-solid fa-gear"></i> 套件设置</span>
    </div>

    <div class="th-world-set-group">
      <div class="th-world-set-glabel"><i class="fa-solid fa-image"></i> 文生图后端（comfyui）</div>
      <label class="th-world-set-row">
        <span>启用文生图</span>
        <input type="checkbox" class="th-world-set-comfy-enabled" ${cfg.comfyui.enabled ? 'checked' : ''}>
      </label>
      <label class="th-world-set-row th-world-set-row-stack">
        <span>comfyui 地址</span>
        <input type="text" class="th-world-set-comfy-url" value="${esc(cfg.comfyui.url)}" placeholder="http://127.0.0.1:8188">
      </label>
      <label class="th-world-set-row th-world-set-row-stack">
        <span>工作流模板（JSON，含占位符 {{prompt}}；留空则不出图）</span>
        <textarea class="th-world-set-comfy-wf" rows="4" placeholder='粘贴 comfyui 工作流 JSON…'>${esc(cfg.comfyui.workflowJson)}</textarea>
      </label>
      <div class="th-world-set-hint">未启用 / 未配置 / 连不上时，APP 内图片会以文字占位，不阻塞主流程。</div>
    </div>

    <div class="th-world-set-group">
      <div class="th-world-set-glabel"><i class="fa-solid fa-brain"></i> 记忆中心</div>
      <div class="th-world-set-hint">所有 APP 的对话会自动沉淀为四层记忆（关键设定 / 长期 / 短期 / 待总结）。下面是全局默认阈值，每个会话可在记忆中心内单独覆盖。</div>
      <label class="th-world-set-row">
        <span>短期：每 N 条对话触发小结</span>
        <input type="number" min="1" class="th-world-set-mem-short" value="${esc(String(cfg.memory.shortThreshold))}">
      </label>
      <label class="th-world-set-row">
        <span>长期：每 N 条小结压缩为大总结</span>
        <input type="number" min="1" class="th-world-set-mem-long" value="${esc(String(cfg.memory.longThreshold))}">
      </label>
      <label class="th-world-set-row">
        <span>注入时附带的最近原始对话条数</span>
        <input type="number" min="0" class="th-world-set-mem-raw" value="${esc(String(cfg.memory.recentRawCount))}">
      </label>
      <label class="th-world-set-row">
        <span>注入时附带的最近小结条数</span>
        <input type="number" min="0" class="th-world-set-mem-sshort" value="${esc(String(cfg.memory.recentShortCount))}">
      </label>
      <div class="th-world-set-actions" style="justify-content:flex-start">
        <button class="th-world-set-memcenter" data-world-memcenter type="button"><i class="fa-solid fa-brain"></i> 打开记忆中心</button>
      </div>
    </div>

    <div class="th-world-set-actions">
      <button class="th-world-set-save" data-world-save type="button"><i class="fa-solid fa-check"></i> 保存</button>
    </div>
  </div>`;
}

function showSettings(): void {
  // 套件设置是桌面下钻的二级视图，用 replace 原地覆盖（不堆叠），返回桌面走 data-world-back。
  openModal2('<i class="fa-solid fa-gear"></i> 套件设置', renderSettingsHtml(), {
    maxWidth: WORLD_MODAL_MAXW,
    replace: true,
  });
  const root = qs('[data-world-settings-root]');
  if (!root) return;
  root.addEventListener('click', (e: Event) => {
    if ((e.target as HTMLElement).closest('[data-world-back]')) { showDesktop(); return; }
    if ((e.target as HTMLElement).closest('[data-world-memcenter]')) { saveSettingsFromForm(root as HTMLElement, { silent: true }); openMemoryCenter(); return; }
    if ((e.target as HTMLElement).closest('[data-world-save]')) { saveSettingsFromForm(root as HTMLElement); }
  });
}

function saveSettingsFromForm(root: HTMLElement, opts?: { silent?: boolean }): void {
  const enabled = (root.querySelector('.th-world-set-comfy-enabled') as HTMLInputElement | null)?.checked ?? false;
  const url = (root.querySelector('.th-world-set-comfy-url') as HTMLInputElement | null)?.value.trim() || '';
  const wf = (root.querySelector('.th-world-set-comfy-wf') as HTMLTextAreaElement | null)?.value || '';
  const cur = getWorldConfig().memory;
  const intOr = (sel: string, fallback: number, min: number): number => {
    const raw = Number((root.querySelector(sel) as HTMLInputElement | null)?.value);
    return Number.isFinite(raw) && raw >= min ? Math.floor(raw) : fallback;
  };
  const shortThreshold = intOr('.th-world-set-mem-short', cur.shortThreshold, 1);
  const longThreshold = intOr('.th-world-set-mem-long', cur.longThreshold, 1);
  const recentRawCount = intOr('.th-world-set-mem-raw', cur.recentRawCount, 0);
  const recentShortCount = intOr('.th-world-set-mem-sshort', cur.recentShortCount, 0);
  saveWorldConfig({
    comfyui: { enabled, url: url || 'http://127.0.0.1:8188', workflowJson: wf },
    memory: { shortThreshold, longThreshold, recentRawCount, recentShortCount },
  });
  if (opts?.silent) return;
  try { (window as any).toastr?.success?.('已保存套件设置'); } catch (e) { void e; }
  showDesktop();
}

// ==================== 公开入口 ====================
export function openWorldApp(): void {
  showDesktop();
}
// 关闭整个世界 modal（供 APP 内「退出」用）
export function closeWorldApp(): void {
  closeModal2();
}

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_app__ = { openWorldApp, closeWorldApp };
} catch (e) { void e; }
