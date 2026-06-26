<template>
  <!-- 悬浮球：折叠态 -->
  <Transition name="th-fab-ball">
    <button
      v-show="!panelOpen"
      class="th-fab-ball"
      :class="{ dragging: ballDragging }"
      :style="ballStyle"
      title="此间天地 · 点击展开 / 拖动可移动"
      @pointerdown="onBallPointerDown"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 3l2.5 5.5L20 9.5l-4 4 1 5.5-5-3-5 3 1-5.5-4-4 5.5-1z" />
      </svg>
    </button>
  </Transition>

  <!-- 展开窗口：状态栏外壳 -->
  <div
    v-show="panelOpen"
    ref="panelRef"
    class="th-fab-panel"
    :class="{ dragging: panelDragging, maximized, resizing: !!resizeDir }"
    :style="panelStyle"
  >
    <!-- 顶部窄条：拖动 + 最大化/还原 + 收起为球 -->
    <div class="th-fab-panel-header" @pointerdown="onPanelPointerDown">
      <span class="th-fab-panel-grip" aria-hidden="true"></span>
      <span class="th-fab-panel-title">此间天地</span>
      <button class="th-fab-panel-btn" :title="maximized ? '还原' : '最大化'" @click="toggleMaximize" @pointerdown.stop>
        <svg v-if="!maximized" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <line x1="21" y1="3" x2="14" y2="10" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="4 14 10 14 10 20" />
          <polyline points="20 10 14 10 14 4" />
          <line x1="14" y1="10" x2="21" y2="3" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      </button>
      <button class="th-fab-panel-btn" title="收起为悬浮球" @click="collapseToBall" @pointerdown.stop>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>

    <!-- 状态栏宿主：HTML 在 onMounted 后注入 -->
    <div ref="bodyRef" class="th-fab-panel-body"></div>

    <!-- 8 个缩放控制点（边 + 角） -->
    <template v-if="!maximized">
      <span class="th-fab-resize n"  @pointerdown.stop="onResizeStart($event,'n')"></span>
      <span class="th-fab-resize s"  @pointerdown.stop="onResizeStart($event,'s')"></span>
      <span class="th-fab-resize e"  @pointerdown.stop="onResizeStart($event,'e')"></span>
      <span class="th-fab-resize w"  @pointerdown.stop="onResizeStart($event,'w')"></span>
      <span class="th-fab-resize ne" @pointerdown.stop="onResizeStart($event,'ne')"></span>
      <span class="th-fab-resize nw" @pointerdown.stop="onResizeStart($event,'nw')"></span>
      <span class="th-fab-resize se" @pointerdown.stop="onResizeStart($event,'se')"></span>
      <span class="th-fab-resize sw" @pointerdown.stop="onResizeStart($event,'sw')"></span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { setupStatusBar } from './status-bar-init';
import statusBarRawHtml from './status-bar.html?raw';

// ─── 宿主 window（脚本运行在后台 iframe，必须用 parent） ───
const hostWindow: Window = (() => {
  try { const w = window.parent as Window; if (w) return w; } catch (e) { void e; }
  return window;
})();
const hostDoc: Document = hostWindow.document;
const hostStorage: Storage | null = (() => {
  try { return hostWindow.localStorage; } catch (e) { void e; return null; }
})();

// ─── 常量 ───
// 注意：key 末尾 _v2 防止和其他悬浮球脚本共享 localStorage（避免两边互相覆盖状态）
const STORAGE_KEY = '_th_fab_state_v2';
const EDGE_GAP = 8;       // 距视口边缘最小距离
const BALL_SIZE = 48;
const PANEL_MIN_W = 360;
const PANEL_MIN_H = 420;
const DEFAULT_W = 880;
const DEFAULT_H = 640;
const DRAG_THRESHOLD = 3;

// ─── 视口尺寸（监听 resize 保持边界 clamp） ───
const winW = ref(hostWindow.innerWidth);
const winH = ref(hostWindow.innerHeight);
function syncWinSize() {
  winW.value = hostWindow.innerWidth;
  winH.value = hostWindow.innerHeight;
  clampAll();
}

// ─── 持久化的状态 ───
interface PersistState {
  ballX: number;
  ballY: number;
  panelX: number;
  panelY: number;
  panelW: number;
  panelH: number;
  panelOpen: boolean;
  maximized: boolean;
  lastNormalRect?: { x: number; y: number; w: number; h: number } | null;
}
function defaultState(): PersistState {
  const w = Math.min(DEFAULT_W, Math.max(PANEL_MIN_W, hostWindow.innerWidth - 80));
  const h = Math.min(DEFAULT_H, Math.max(PANEL_MIN_H, hostWindow.innerHeight - 80));
  return {
    ballX: Math.max(EDGE_GAP, hostWindow.innerWidth - BALL_SIZE - 20),
    ballY: Math.max(EDGE_GAP, Math.round(hostWindow.innerHeight * 0.35)),
    panelX: Math.max(EDGE_GAP, Math.round((hostWindow.innerWidth - w) / 2)),
    panelY: Math.max(EDGE_GAP, Math.round((hostWindow.innerHeight - h) / 2)),
    panelW: w,
    panelH: h,
    panelOpen: false,
    maximized: false,
    lastNormalRect: null,
  };
}
function loadState(): PersistState {
  const def = defaultState();
  if (!hostStorage) return def;
  try {
    const raw = hostStorage.getItem(STORAGE_KEY);
    if (!raw) return def;
    const obj = JSON.parse(raw) as Partial<PersistState>;
    return {
      ballX: Number.isFinite(obj.ballX) ? (obj.ballX as number) : def.ballX,
      ballY: Number.isFinite(obj.ballY) ? (obj.ballY as number) : def.ballY,
      panelX: Number.isFinite(obj.panelX) ? (obj.panelX as number) : def.panelX,
      panelY: Number.isFinite(obj.panelY) ? (obj.panelY as number) : def.panelY,
      panelW: Number.isFinite(obj.panelW) ? (obj.panelW as number) : def.panelW,
      panelH: Number.isFinite(obj.panelH) ? (obj.panelH as number) : def.panelH,
      panelOpen: !!obj.panelOpen,
      maximized: !!obj.maximized,
      lastNormalRect: (obj.lastNormalRect && typeof obj.lastNormalRect === 'object') ? obj.lastNormalRect as PersistState['lastNormalRect'] : null,
    };
  } catch (e) { void e; return def; }
}
let __saveTimer: number | null = null;
function saveState() {
  if (!hostStorage) return;
  if (__saveTimer !== null) { try { hostWindow.clearTimeout(__saveTimer); } catch(e){ void e; } }
  __saveTimer = hostWindow.setTimeout(() => {
    try {
      hostStorage.setItem(STORAGE_KEY, JSON.stringify({
        ballX: ballX.value, ballY: ballY.value,
        panelX: panelX.value, panelY: panelY.value,
        panelW: panelW.value, panelH: panelH.value,
        panelOpen: panelOpen.value,
        maximized: maximized.value,
        lastNormalRect: lastNormalRect.value,
      }));
    } catch (e) { void e; }
    __saveTimer = null;
  }, 200);
}

// ─── 响应式状态 ───
const init = loadState();
const ballX = ref(init.ballX);
const ballY = ref(init.ballY);
const panelX = ref(init.panelX);
const panelY = ref(init.panelY);
const panelW = ref(init.panelW);
const panelH = ref(init.panelH);
const panelOpen = ref(init.panelOpen);
const maximized = ref(init.maximized);
const lastNormalRect = ref<PersistState['lastNormalRect']>(init.lastNormalRect);

// ─── clamp 工具 ───
function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function clampBall() {
  const maxX = Math.max(EDGE_GAP, winW.value - BALL_SIZE - EDGE_GAP);
  const maxY = Math.max(EDGE_GAP, winH.value - BALL_SIZE - EDGE_GAP);
  ballX.value = clamp(ballX.value, EDGE_GAP, maxX);
  ballY.value = clamp(ballY.value, EDGE_GAP, maxY);
}
function clampPanelSize() {
  panelW.value = clamp(panelW.value, PANEL_MIN_W, Math.max(PANEL_MIN_W, winW.value - EDGE_GAP * 2));
  panelH.value = clamp(panelH.value, PANEL_MIN_H, Math.max(PANEL_MIN_H, winH.value - EDGE_GAP * 2));
}
function clampPanelPos() {
  const maxX = Math.max(EDGE_GAP, winW.value - panelW.value - EDGE_GAP);
  const maxY = Math.max(EDGE_GAP, winH.value - panelH.value - EDGE_GAP);
  panelX.value = clamp(panelX.value, EDGE_GAP, maxX);
  panelY.value = clamp(panelY.value, EDGE_GAP, maxY);
}
function clampAll() {
  clampBall();
  if (maximized.value) {
    panelX.value = EDGE_GAP; panelY.value = EDGE_GAP;
    panelW.value = Math.max(PANEL_MIN_W, winW.value - EDGE_GAP * 2);
    panelH.value = Math.max(PANEL_MIN_H, winH.value - EDGE_GAP * 2);
  } else {
    clampPanelSize();
    clampPanelPos();
  }
}

// ─── 样式 ───
const ballStyle = computed(() => ({ left: `${ballX.value}px`, top: `${ballY.value}px`, width: `${BALL_SIZE}px`, height: `${BALL_SIZE}px` }));
const panelStyle = computed(() => ({
  left: `${panelX.value}px`,
  top: `${panelY.value}px`,
  width: `${panelW.value}px`,
  height: `${panelH.value}px`,
}));

// ─── 悬浮球：拖动 + 点击展开 ───
const ballDragging = ref(false);
let ballDragStart = { x: 0, y: 0 };
let ballDragBase = { x: 0, y: 0 };
let ballMoved = false;
function onBallPointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  e.preventDefault();
  ballMoved = false;
  ballDragStart = { x: e.clientX, y: e.clientY };
  ballDragBase = { x: ballX.value, y: ballY.value };
  hostWindow.addEventListener('pointermove', onBallPointerMove);
  hostWindow.addEventListener('pointerup', onBallPointerUp, { once: true });
}
function onBallPointerMove(e: PointerEvent) {
  const dx = e.clientX - ballDragStart.x;
  const dy = e.clientY - ballDragStart.y;
  if (!ballMoved && Math.abs(dx) <= DRAG_THRESHOLD && Math.abs(dy) <= DRAG_THRESHOLD) return;
  ballMoved = true;
  ballDragging.value = true;
  ballX.value = ballDragBase.x + dx;
  ballY.value = ballDragBase.y + dy;
  clampBall();
}
function onBallPointerUp() {
  hostWindow.removeEventListener('pointermove', onBallPointerMove);
  ballDragging.value = false;
  if (!ballMoved) {
    panelOpen.value = true;
  }
  saveState();
}


// ─── 面板：标题栏拖动 ───
const panelDragging = ref(false);
let panelDragStart = { x: 0, y: 0 };
let panelDragBase = { x: 0, y: 0 };
let panelMoved = false;
function onPanelPointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  if (maximized.value) return; // 最大化时禁止拖动
  // 标题栏内按钮 / 控件不触发拖动
  const target = e.target as HTMLElement;
  if (target.closest('.th-fab-panel-btn')) return;
  e.preventDefault();
  panelMoved = false;
  panelDragStart = { x: e.clientX, y: e.clientY };
  panelDragBase = { x: panelX.value, y: panelY.value };
  hostWindow.addEventListener('pointermove', onPanelPointerMove);
  hostWindow.addEventListener('pointerup', onPanelPointerUp, { once: true });
}
function onPanelPointerMove(e: PointerEvent) {
  const dx = e.clientX - panelDragStart.x;
  const dy = e.clientY - panelDragStart.y;
  if (!panelMoved && Math.abs(dx) <= DRAG_THRESHOLD && Math.abs(dy) <= DRAG_THRESHOLD) return;
  panelMoved = true;
  panelDragging.value = true;
  panelX.value = panelDragBase.x + dx;
  panelY.value = panelDragBase.y + dy;
  clampPanelPos();
}
function onPanelPointerUp() {
  hostWindow.removeEventListener('pointermove', onPanelPointerMove);
  panelDragging.value = false;
  saveState();
}

// ─── 面板：8 方向缩放 ───
type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const resizeDir = ref<ResizeDir | ''>('');
let resizeStart = { x: 0, y: 0 };
let resizeBase = { x: 0, y: 0, w: 0, h: 0 };
function onResizeStart(e: PointerEvent, dir: ResizeDir) {
  if (e.button !== 0) return;
  if (maximized.value) return;
  e.preventDefault();
  resizeDir.value = dir;
  resizeStart = { x: e.clientX, y: e.clientY };
  resizeBase = { x: panelX.value, y: panelY.value, w: panelW.value, h: panelH.value };
  hostWindow.addEventListener('pointermove', onResizeMove);
  hostWindow.addEventListener('pointerup', onResizeEnd, { once: true });
}
function onResizeMove(e: PointerEvent) {
  if (!resizeDir.value) return;
  const dx = e.clientX - resizeStart.x;
  const dy = e.clientY - resizeStart.y;
  let nx = resizeBase.x, ny = resizeBase.y, nw = resizeBase.w, nh = resizeBase.h;
  const d = resizeDir.value;
  if (d.includes('e')) nw = resizeBase.w + dx;
  if (d.includes('s')) nh = resizeBase.h + dy;
  if (d.includes('w')) { nw = resizeBase.w - dx; nx = resizeBase.x + dx; }
  if (d.includes('n')) { nh = resizeBase.h - dy; ny = resizeBase.y + dy; }
  // 处理最小尺寸时位置不能继续往里走
  const maxW = Math.max(PANEL_MIN_W, winW.value - EDGE_GAP * 2);
  const maxH = Math.max(PANEL_MIN_H, winH.value - EDGE_GAP * 2);
  if (nw < PANEL_MIN_W) {
    if (d.includes('w')) nx = resizeBase.x + (resizeBase.w - PANEL_MIN_W);
    nw = PANEL_MIN_W;
  }
  if (nw > maxW) {
    if (d.includes('w')) nx = resizeBase.x + (resizeBase.w - maxW);
    nw = maxW;
  }
  if (nh < PANEL_MIN_H) {
    if (d.includes('n')) ny = resizeBase.y + (resizeBase.h - PANEL_MIN_H);
    nh = PANEL_MIN_H;
  }
  if (nh > maxH) {
    if (d.includes('n')) ny = resizeBase.y + (resizeBase.h - maxH);
    nh = maxH;
  }
  // 边界 clamp
  nx = clamp(nx, EDGE_GAP, Math.max(EDGE_GAP, winW.value - nw - EDGE_GAP));
  ny = clamp(ny, EDGE_GAP, Math.max(EDGE_GAP, winH.value - nh - EDGE_GAP));
  panelX.value = nx; panelY.value = ny;
  panelW.value = nw; panelH.value = nh;
}
function onResizeEnd() {
  hostWindow.removeEventListener('pointermove', onResizeMove);
  resizeDir.value = '';
  saveState();
}

// ─── 最大化 / 还原 ───
function toggleMaximize() {
  if (!maximized.value) {
    lastNormalRect.value = { x: panelX.value, y: panelY.value, w: panelW.value, h: panelH.value };
    maximized.value = true;
    panelX.value = EDGE_GAP; panelY.value = EDGE_GAP;
    panelW.value = Math.max(PANEL_MIN_W, winW.value - EDGE_GAP * 2);
    panelH.value = Math.max(PANEL_MIN_H, winH.value - EDGE_GAP * 2);
  } else {
    maximized.value = false;
    const r = lastNormalRect.value;
    if (r) {
      panelX.value = r.x; panelY.value = r.y;
      panelW.value = r.w; panelH.value = r.h;
    }
    clampPanelSize(); clampPanelPos();
  }
  saveState();
}

function collapseToBall() {
  panelOpen.value = false;
  saveState();
}

// ─── 状态栏挂载 ───
const panelRef = ref<HTMLElement | null>(null);
const bodyRef = ref<HTMLElement | null>(null);
let statusBarDestroy: (() => void) | null = null;
let statusBarMounted = false;

function extractStatusBarBody(): string {
  const m = statusBarRawHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return m ? m[1] : statusBarRawHtml;
}

async function mountStatusBar() {
  if (statusBarMounted) return;
  if (!bodyRef.value) return;
  bodyRef.value.innerHTML = extractStatusBarBody();
  statusBarMounted = true;
  try {
    const { destroy } = await setupStatusBar();
    statusBarDestroy = destroy;
  } catch (e) {
    console.error('[前端悬浮球V1] 状态栏初始化失败:', e);
  }
}

// 视口大小变化
onMounted(async () => {
  hostWindow.addEventListener('resize', syncWinSize);
  clampAll();
  await nextTick();
  // 状态栏一次性挂载（之后通过 v-show 切换显示，DOM 不销毁）
  await mountStatusBar();
});

onUnmounted(() => {
  hostWindow.removeEventListener('resize', syncWinSize);
  hostWindow.removeEventListener('pointermove', onBallPointerMove);
  hostWindow.removeEventListener('pointermove', onPanelPointerMove);
  hostWindow.removeEventListener('pointermove', onResizeMove);
  try { statusBarDestroy?.(); } catch(e){ void e; }
});

watch([panelOpen, maximized, ballX, ballY, panelX, panelY, panelW, panelH], saveState);
</script>

<style scoped lang="scss">
/* 悬浮球 */
.th-fab-ball {
  position: fixed;
  z-index: 99999;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: linear-gradient(135deg, var(--th-ball-a, #ff7b9d), var(--th-ball-b, #c88aff));
  backdrop-filter: blur(8px);
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 22px var(--th-ball-shadow, rgba(160, 100, 140, 0.35)), 0 0 0 1px rgba(255,255,255,0.08) inset;
  color: #fff;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  padding: 0;
  transition: box-shadow .18s, transform .14s, background .3s;
}
.th-fab-ball:hover { box-shadow: 0 10px 28px var(--th-ball-shadow, rgba(160, 100, 140, 0.5)); transform: scale(1.05); }
.th-fab-ball:active,
.th-fab-ball.dragging { cursor: grabbing; transform: scale(0.96); }

/* 主题变量：糖果粉（单一主题，不再支持暗色切换） */
.th-fab-panel,
.th-fab-ball {
  --th-bg:        #fff8fc;
  --th-fg:        #2d1b2e;
  --th-fg-soft:   rgba(80, 50, 70, 0.65);
  --th-fg-mute:   rgba(80, 50, 70, 0.55);
  --th-accent:    #ff5a8a;
  --th-accent-2:  #c88aff;
  --th-surface:   rgba(255, 224, 236, 0.5);
  --th-surface-2: rgba(255, 240, 246, 0.2);
  --th-divider:   rgba(212, 165, 116, 0.18);
  --th-btn-hover: rgba(255, 123, 157, 0.18);
  /* 阴影：近（贴着边框的薄阴影）+ 远（大范围散射），双层更立体 */
  --th-shadow-near: 0 2px 8px rgba(80, 30, 60, 0.12);
  --th-shadow-far:  0 18px 60px rgba(80, 30, 60, 0.28);
  --th-shadow:      var(--th-shadow-near), var(--th-shadow-far);
  /* 描边：内层白边（模拟高光）+ 外层金色雾边（暖色延伸） */
  --th-stroke-inner: 1px solid rgba(255, 255, 255, 0.55);
  --th-stroke-outer: 1px solid rgba(212, 165, 116, 0.18);
  /* 圆角分级：panel 24 / section 18 / block 14 / chip 10 */
  --th-radius-panel:   24px;
  --th-radius-section: 18px;
  --th-radius-block:   14px;
  --th-radius-chip:    10px;
  --th-ball-a:    #ff7b9d;
  --th-ball-b:    #c88aff;
  --th-ball-shadow: rgba(160, 100, 140, 0.35);
  transition: background .3s, color .3s, box-shadow .3s;
}

/* 主面板 */
.th-fab-panel {
  position: fixed;
  z-index: 99999;
  /* 圆角分级：panel 用最大档 */
  border-radius: var(--th-radius-panel);
  /* 双层描边：内白边 + 外金雾边（box-sizing: border-box 让 border 算入 width，不撑破布局） */
  border:  var(--th-stroke-inner);
  outline: var(--th-stroke-outer);
  box-sizing: border-box;
  /* 注意：不使用 backdrop-filter / transform / filter / perspective，否则会成为面板内 position:fixed
     子元素的 containing block，导致弹窗 / 悬停提示 / 大图覆盖层定位错乱。 */
  background: var(--th-bg);
  box-shadow: var(--th-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--th-fg);
  font-family: 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
}
.th-fab-panel.maximized {
  border-radius: 10px;
}
.th-fab-panel.dragging,
.th-fab-panel.resizing { user-select: none; }

/* 顶部窄条：拖动区 */
.th-fab-panel-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 8px 0 12px;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  background: linear-gradient(180deg, var(--th-surface), var(--th-surface-2));
  border-bottom: 1px solid var(--th-divider);
}
.th-fab-panel.maximized .th-fab-panel-header { cursor: default; }
.th-fab-panel-header.dragging,
.th-fab-panel.dragging .th-fab-panel-header { cursor: grabbing; }
.th-fab-panel-grip {
  width: 34px;
  height: 4px;
  border-radius: 4px;
  background: rgba(160, 100, 140, 0.28);
  flex-shrink: 0;
}
.th-fab-panel-title {
  font-size: 12px;
  color: var(--th-fg-soft);
  font-weight: 600;
  letter-spacing: 0.5px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.th-fab-panel-btn {
  width: 24px;
  height: 22px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--th-fg-mute);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background .15s, color .15s;
  padding: 0;
}
.th-fab-panel-btn:hover {
  background: var(--th-btn-hover);
  color: var(--th-accent);
}

/* 状态栏宿主 */
.th-fab-panel-body {
  flex: 1;
  overflow: auto;
  position: relative;
  /* 让原本基于 max-height: 820px 的 .th-status-wrapper 在面板内自适应整个剩余高度 */
  display: flex;
  flex-direction: column;
}
/* 由于 .th-status-wrapper 自己有 padding/border-radius，这里给 body 透明背景由 wrapper 负责视觉 */
.th-fab-panel-body :deep(.th-status-wrapper) {
  max-height: none !important;
  width: 100% !important;
  flex: 1 1 auto;
  border-radius: 0;
  border: none;
  box-shadow: none;
}
.th-fab-panel-body :deep(.th-topbar-corner-br) { display: none; }

/* 8 方向缩放手柄 */
.th-fab-resize {
  position: absolute;
  z-index: 1;
  background: transparent;
  touch-action: none;
}
.th-fab-resize.n { left: 8px; right: 8px; top: 0; height: 6px; cursor: ns-resize; }
.th-fab-resize.s { left: 8px; right: 8px; bottom: 0; height: 6px; cursor: ns-resize; }
.th-fab-resize.e { top: 8px; bottom: 8px; right: 0; width: 6px; cursor: ew-resize; }
.th-fab-resize.w { top: 8px; bottom: 8px; left: 0; width: 6px; cursor: ew-resize; }
.th-fab-resize.ne { top: 0; right: 0; width: 12px; height: 12px; cursor: nesw-resize; }
.th-fab-resize.nw { top: 0; left: 0; width: 12px; height: 12px; cursor: nwse-resize; }
.th-fab-resize.se { bottom: 0; right: 0; width: 14px; height: 14px; cursor: nwse-resize; }
.th-fab-resize.sw { bottom: 0; left: 0; width: 12px; height: 12px; cursor: nesw-resize; }
.th-fab-resize.se::after {
  content: '';
  position: absolute;
  right: 3px; bottom: 3px;
  width: 8px; height: 8px;
  border-right: 2px solid rgba(160, 100, 140, 0.45);
  border-bottom: 2px solid rgba(160, 100, 140, 0.45);
  border-bottom-right-radius: 4px;
}

/* 过渡动画 */
.th-fab-ball-enter-active,
.th-fab-ball-leave-active { transition: opacity .18s, transform .18s; }
.th-fab-ball-enter-from,
.th-fab-ball-leave-to { opacity: 0; transform: scale(0.7); }
</style>


