// 多层交互地图:DOM/SVG 节点层 + 相机 + 当前位置。样式在 status-bar.css。
import { esc, qs, qs2, __doc, __win } from '../../lib/dom-utils';
import { openModal2, closeAllModal2, getUserKey, saveData } from '../../status-bar-init';
import {
  openLocationsModal, parseManagedEntryName, safeRefreshManagedEntryStates,
  disableAllManagedWorldbookEntries, loadInspectorEntries,
  updateInspectorEntry, refreshManagedStatesAfterWorldbookEdit,
} from '../managed-modal';
import { managedEntryStates, getManagedItems } from '../../lib/managed-store';
import { thToast, thConfirm, thPrompt, thChoose } from '../../lib/world/ui-kit';
import { dayPhaseOf, getWorldClock, seasonOf, type DayPhase } from '../../lib/world/world-clock';
import { festivalsOn } from '../../lib/world/festival-table';
import {
  WORLD_W, WORLD_H, CELL_SYS, allRegionGeo, regionGeo, shrinkRing, terraOutline,
  mapNodes, mapEdges, nodeById, type MapNode, type Pt,
} from '../../lib/world/map-geo';
import { matchSeed, type MapAlt } from '../../lib/world/map-seed';
import { getMapLayout, saveCam, setPlacePos, clearPlacePos, getMapCfg, setMapCfg, getMapArt, setMapArt, clearMapArt, clearMapLog, artOf, logVisit, getMapLog, type MapCfg } from '../../lib/world/map-store';
import { fpsSample, degradeVerdict, MAX_TIER, STALL_DT } from '../../lib/world/map-degrade';
import { tryGenImage } from '../../lib/world/media';

/* 13.4 文案唯一改口。⚠ 必须声明在所有消费点之前:`var` 提升只给名字不给值。
   表是可信源不是待办单 —— 未接的槽留着,别删。 */
const COPY = {
  here: '❀ 你在此处 ❀',
  noArt: '画卷尚未上色…',
  loading: '搅匀甜蜜中…',
  noResult: '地图上还没找到这个地方呢',
  goOk: '启程啦,风会带你过去',
  noMatch: '这里还没有名字,先记下啦',
  emptyLog: '还没留下足迹呢',
  genFail: '这一帧没画好,稍后再试',
  wipeAsk: '要把这一页轻轻撕掉吗?',
  settings: '把地图调成喜欢的样子',
  alone: '这儿只有你一个人呢',
};

const ALT_CN: Record<string, string> = {
  ground: '常规层', float: '悬浮层', high: '极高空', under: '地下·下层', edge: '边缘·异空间',
};
const MATS: Record<string, string> = {
  high: 'thin', float: 'glass', ground: 'jade', under: 'frost', edge: 'shard',
};
/* 7.6② 剖面序:自上而下 = 真实高度序,不是数量序 */
const ALT_ORDER: MapAlt[] = ['high', 'float', 'ground', 'under', 'edge'];
const ALT_RBC: Record<string, string> = {
  high: '#9fc6ee', float: '#c9d4ea', ground: '#8fc9ac', under: '#9aa6e6', edge: '#b084e8',
};
/* 4.2 奶粉系施工色 —— 覆盖种子表原色(那几个偏荧光) */
const RG_PAINT: Record<string, string> = {
  hub: '#ff92b0', zx: '#ffc0d8', tf: '#aecdf2', yy: '#ffd694', fx: '#b8ead9',
  zh: '#d3b8f5', ns: '#c2dbf5', xj: '#ffdf9e', my: '#dde3ee',
};
/* 7.1④ 细胞明度按该区主高度层微调 */
const ALT_FILL: Record<string, string> = {
  high: 'color-mix(in srgb,#fffdfd 88%,#eaf2ff)',
  float: 'url(#thmIsleFill)',
  ground: 'url(#thmIsleFill)',
  under: 'color-mix(in srgb,#f7ecec 88%,#e4d8e6)',
  edge: 'color-mix(in srgb,#f7eff8 90%,#e6dcf0)',
};

/* 4.4 时相,由 world-clock.dayPhaseOf 驱动 */
type PhaseDef = { n: string; a: string; b: string; sun: string; glow: string; wick: string; rim: string };
const PHASES: Record<DayPhase, PhaseDef> = {
  dawn: { n: '清晨', a: '#cfe0fb', b: '#ffe4d6', sun: 'rgba(255,206,168,.60)', glow: '0.90', wick: '0.70', rim: '#ffd9b0' },
  day: { n: '白昼', a: '#cfe4fd', b: '#ffeef4', sun: 'rgba(255,214,170,.55)', glow: '1.00', wick: '0.55', rim: '#ffe9c9' },
  dusk: { n: '黄昏', a: '#d9c4f0', b: '#ffc9b8', sun: 'rgba(255,168,120,.62)', glow: '0.82', wick: '0.85', rim: '#ffbe92' },
  night: { n: '深夜', a: '#2e2a4a', b: '#4a3d63', sun: 'rgba(150,150,240,.34)', glow: '0.52', wick: '1.00', rim: '#8f86c9' },
};

const SVG_NS = 'http://www.w3.org/2000/svg';
function paintColor(id: string): string { return RG_PAINT[id] || regionGeo(id)?.color || '#ff92b0'; }
function inkColor(id: string): string { return `color-mix(in srgb,${paintColor(id)} 46%,#4a3026)`; }
function mk(tag: string, attrs: Record<string, string | number>): SVGElement {
  const e = __doc.createElementNS(SVG_NS, tag);
  for (const k of Object.keys(attrs)) e.setAttribute(k, String(attrs[k]));
  return e;
}

/* ⚠ 全部运行时状态收在这一个对象里 —— destroyMap 靠它一处清干净(12-16)。 */
type MapRT = {
  root: HTMLElement;
  shell: HTMLElement; view: HTMLElement; world: HTMLElement; nodes: HTMLElement;
  gIsles: SVGElement; gPaths: SVGElement;
  cam: { x: number; y: number; s: number };
  vel: { x: number; y: number };
  nodeEls: Record<string, HTMLElement>;
  /** 三层云,按 c1→c3 存。相机视差要喂,不许在回调里 querySelector。 */
  cloudEls: HTMLElement[];
  clusterEls: Record<string, HTMLElement>;
  plateAt: Record<string, { cx: number; cy: number; w: number }>;
  lblBox: Record<string, { w: number; h: number; top: number }>;
  guideOf: Record<string, SVGElement[]>;
  cur: string;
  /** MVU 写的自由文本匹配不上种子表时的原文(9-B:胶囊显示它、不点亮节点)。 */
  rawLoc: string;
  altFocus: string;
  /** 标签筛选(9 G 36):激活的标签名,'' = 不过滤。和 altFocus 并存、各自压暗,不互斥。 */
  tagFilter: string;
  /** 搜索命中的闪环定时器(flashNode 要撤前一发)。 */
  flashT: number;
  tier: number; lockTier: boolean;
  fpsHist: number[]; lowStreak: number; frames: number; lastDegrade: number; fpsShow: number;
  slowRun: number; perfTxt: string;
  lastT: number; lodAt: number;
  reduceMotion: boolean; lastRaw: DayPhase;
  rafId: number; pollId: number;
  drag: { px: number; py: number; t: number; moved: number } | null;
  /** 已对本次拖拽要过指针捕获(见 pointermove 里那条:捕获会改写 click 目标)。 */
  dragCap: boolean;
  nodeDrag: { id: string; el: HTMLElement } | null;
  camAnim: number;
  ac: AbortController;
  ro: ResizeObserver | null;
  /** view 尺寸缓存:每帧读 clientWidth 会强制 reflow,只在 resize 时刷新。 */
  vwNow: number;
  vhNow: number;
  mo: MutationObserver | null;
  timers: number[];
  onVarUpdate: (() => void) | null;
  l3: HTMLElement;
  /** 设置抽屉容器。 */
  setDrawer: HTMLElement;
  /** 已开世界书总览抽屉。与设置抽屉同一落点,互斥开。 */
  books: HTMLElement;
  /** 标签筛选下拉。topbar 内 #... 挂着,动态 innerHTML。 */
  tagpop: HTMLElement;
  /** 开着的地点卡状态。null = 卡关着。cast = 开卡那一刻的在场角色(数据桥 NPC.*.是否在场)。 */
  card: { id: string; verb: string; obj: string; power: 0 | 1 | 2; typer: number; cast: string[]; custom: boolean } | null;
  /** 等着看会不会来第二击的开卡定时器(见 DBL_WAIT)。 */
  cardWait: number;
  /** 上一次拖拽的位移量。拖完浏览器会补一发 click,靠它把那一发挡掉。 */
  moved: number;
};
let RT: MapRT | null = null;

/* ===================== HTML 骨架 ===================== */
function mapShellHtml(): string {
  return `<div class="thm-shell" data-thm-root="1">
  <div class="thm-topbar">
    <div class="thm-title">☁ 此间天地 · <b>云海之上</b></div>
    <span class="thm-bow" aria-hidden="true"><i></i><i></i><b></b></span>
    <div class="thm-here" data-thm-here="1" title="点击回到当前位置" role="button" tabindex="0">
      <span class="dot"></span>
      <span class="mark" data-thm-here-mark="1">${esc(COPY.here)}</span>
      <span data-thm-here-txt="1"></span>
      <span class="rg" data-thm-here-rg="1"></span>
    </div>
    <label class="thm-find" title="搜索地点,回车飞过去">
      <i class="fa-solid fa-magnifying-glass"></i>
      <input data-thm-search="1" placeholder="搜地点…" />
    </label>
    <div class="thm-tagwrap">
      <button class="thm-btn" data-thm-act="tags" title="按标签筛选" aria-label="标签筛选">
        <i class="fa-solid fa-tags"></i> 标签
      </button>
      <div class="thm-tagpop" data-thm-tagpop="1" hidden></div>
    </div>
    <div class="thm-spacer"></div>
    <div class="thm-perf" data-thm-perf="1">fps <b>--</b>  档 <b>0</b></div>
    <button class="thm-btn" data-thm-act="books" aria-label="已开世界书"><i class="fa-solid fa-book-open"></i> 已开书</button>
    <button class="thm-btn" data-thm-act="edit" aria-label="编辑布局">编辑模式</button>
    <button class="thm-btn" data-thm-act="settings" aria-label="地图设置"><i class="fa-solid fa-gear"></i> 设置</button>
    <button class="thm-btn" data-thm-act="list" aria-label="切换到列表视图">列表视图</button>
  </div>
  <div class="thm-view" data-thm-view="1">
   <div class="thm-scroll">
    <div class="thm-clouds" data-thm-clouds="1">
      <div class="thm-cloud c3" data-thm-cloud="3"></div>
      <div class="thm-cloud c2" data-thm-cloud="2"></div>
      <div class="thm-cloud c1" data-thm-cloud="1"></div>
    </div>
    <div class="thm-stars"></div>
    <div class="thm-cradle" data-thm-cradle="1"></div>
    <div class="thm-aurora"></div>
    <div class="thm-rainbow"></div>
    <div class="thm-wx"></div>
    <div class="thm-grid"></div>
    <div class="thm-world" data-thm-world="1">
      <svg class="thm-svg" width="${WORLD_W}" height="${WORLD_H}">
        <defs>
          <filter id="thmIsleAO" x="-25%" y="-25%" width="150%" height="165%">
            <feDropShadow dx="0" dy="12" stdDeviation="11" flood-color="rgba(150,90,110,.22)"/>
          </filter>
          <linearGradient id="thmIsleFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0"  stop-color="#fffefe" stop-opacity=".97"/>
            <stop offset=".45" stop-color="#fff7f5" stop-opacity=".93"/>
            <stop offset="1"  stop-color="#f0dcdd" stop-opacity=".9"/>
          </linearGradient>
          <linearGradient id="thmScroll" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0"  stop-color="#fffdfd" stop-opacity=".97"/>
            <stop offset=".5" stop-color="#fff4f3" stop-opacity=".95"/>
            <stop offset="1"  stop-color="#f6e3e2" stop-opacity=".95"/>
          </linearGradient>
          <linearGradient id="thmRod" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0"  stop-color="#ffe9e4"/>
            <stop offset=".55" stop-color="#d99a94"/>
            <stop offset="1"  stop-color="#a86a70"/>
          </linearGradient>
        </defs>
        <g data-thm-isles="1"></g>
        <g data-thm-mini="1"></g>
        <g data-thm-paths="1"></g>
      </svg>
      <div class="thm-nodes" data-thm-nodes="1"></div>
    </div>
    <div class="thm-fly" data-thm-fly="1" aria-hidden="true"></div>
   </div>
    <div class="thm-wash"></div>
    <div class="thm-ribbon" data-thm-ribbon="1"></div>
    <div class="thm-zoom">
      <button data-thm-act="zin" aria-label="放大">+</button>
      <div class="lv" data-thm-zlv="1">1.00</div>
      <button data-thm-act="zout" aria-label="缩小">−</button>
      <button data-thm-act="home" title="归位" aria-label="归位" style="font-size:11px">⌾</button>
    </div>
    <div class="thm-editbar">
      <span>编辑模式 · 拖动节点改坐标</span>
      <button class="thm-btn" data-thm-act="edreset">重置回种子</button>
      <button class="thm-btn on" data-thm-act="eddone">完成</button>
    </div>
    <div class="thm-vig"></div>
    <div class="thm-frame">
      <div class="thm-vines" aria-hidden="true"></div>
      <div class="thm-nacre" aria-hidden="true"></div>
      <div class="thm-sheen" aria-hidden="true"><i></i></div>
      <div class="thm-drop l" aria-hidden="true"><i></i><b></b></div>
      <div class="thm-drop r" aria-hidden="true"><i></i><b></b></div>
      ${corners()}
    </div>
  </div>
  <div class="thm-l3" data-thm-l3="1" role="dialog" aria-modal="true" aria-label="地点内部"></div>
  <div class="thm-set" data-thm-set="1" role="dialog" aria-modal="true" aria-label="地图设置" hidden></div>
  <div class="thm-set thm-books" data-thm-books="1" role="dialog" aria-modal="true" aria-label="已开世界书总览" hidden></div>
</div>`;
}
/* 四角花角:第一枚是实体 + defs,另三枚 <use>。
   ⚠ 片段引用 `url(#thmCg)` 在有 <base> 的宿主页会解析到别的文档 —— id 前缀 thm 保唯一,
     真被 <base> 打断时四角只丢金色不影响功能(11.1-a 点验项)。 */
function corners(): string {
  const art = `<path d="M4 4h20M4 4v20" stroke="url(#thmCg)" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M10 26c0-9 7-16 16-16" stroke="url(#thmCg)" stroke-width="1.3" opacity=".85"/>
      <path d="M14 34c8-1 14-7 15-15 3 6 8 9 14 9-6 2-10 7-11 13-2-5-9-8-18-7z" fill="url(#thmCg)" opacity=".55"/>
      <circle cx="30" cy="30" r="2.1" fill="url(#thmCg)"/>`;
  let s = `<svg class="thm-corner tl" viewBox="0 0 60 60" fill="none" aria-hidden="true">${art}
      <defs><linearGradient id="thmCg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffe9e4"/><stop offset=".5" stop-color="#d99a94"/><stop offset="1" stop-color="#a86a70"/>
      </linearGradient><g id="thmCornerArt">${art}</g></defs></svg>`;
  for (const c of ['tr', 'bl', 'br']) {
    s += `<svg class="thm-corner ${c}" viewBox="0 0 60 60" fill="none" aria-hidden="true"><use href="#thmCornerArt"/></svg>`;
  }
  return s;
}

/* ===================== 云与云托 ===================== */
function cloudBg(op: number, h: number, seed: number): string {
  let s = '';
  for (let i = 0; i < 7; i++) {
    const x = 60 + i * 190 + ((seed * 37) % 90);
    const y = h * 0.5 + Math.sin(i + seed) * h * 0.22;
    const rx = 120 + (i % 3) * 46, ry = 26 + (i % 2) * 12;
    s += `<ellipse cx='${x}' cy='${y.toFixed(0)}' rx='${rx}' ry='${ry}' fill='white' opacity='${op}'/>`;
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1400' height='${h}'>` +
    `<filter id='b'><feGaussianBlur stdDeviation='18'/></filter><g filter='url(#b)'>${s}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
function buildClouds(rt: MapRT): void {
  const spec: [number, number, number][] = [[0.95, 300, 1], [0.7, 260, 2], [0.5, 220, 3]];
  rt.cloudEls = [];
  spec.forEach(([op, h, n]) => {
    const el = rt.root.querySelector<HTMLElement>(`[data-thm-cloud="${n}"]`);
    if (!el) return;
    el.style.backgroundImage = cloudBg(op, h, n);
    rt.cloudEls[n - 1] = el;
  });
}
function buildCradle(rt: MapRT): void {
  const host = rt.root.querySelector<HTMLElement>('[data-thm-cradle="1"]');
  if (!host) return;
  // [left%, top%, w%, h%, 色偏] —— 云絮无硬边,靠 blur + 半透明叠
  const blobs: number[][] = [
    [6, 26, 26, 34, 0], [24, 34, 30, 40, 1], [44, 22, 34, 46, 0], [64, 32, 28, 38, 1], [82, 26, 24, 34, 0],
  ];
  for (const b of blobs) {
    const s = __doc.createElement('span');
    s.style.left = `${b[0]}%`; s.style.top = `${b[1]}%`;
    s.style.width = `${b[2]}%`; s.style.height = `${b[3]}%`;
    s.style.setProperty('--crf', b[4] ? 'rgba(255,244,248,.95)' : 'rgba(255,255,255,.95)');
    host.appendChild(s);
  }
}
/* ===================== 7.1 版图细胞 + 7.2 双边线 + 7.3 海岸线 ===================== */
function renderIsles(rt: MapRT): void {
  const cells = CELL_SYS.cells;
  /* 次序按面积从大到小:枢纽的环含飞地那块,必须先画、飞地后画盖上去。
     Object.keys 是种子表次序,不保证这一点。 */
  const keys = Object.keys(cells).sort((a, b) => cells[b].area - cells[a].area);
  // 飞地不参与合并:它在版图内部,并进去会在中央凭空多一圈内影
  const terraD = keys.filter(k => k !== 'xj').map(k => cells[k].d).join('');
  rt.gIsles.appendChild(mk('path', { class: 'thm-terra-ao', d: terraD, 'fill-rule': 'evenodd', filter: 'url(#thmIsleAO)' }));
  const rgAlt = mainAltByRegion();
  for (const k of keys) {
    const cell = cells[k];
    const g = mk('g', {}) as SVGGElement;
    g.style.setProperty('--rg', paintColor(k));
    const face = mk('path', { class: 'thm-cell', d: cell.d }) as SVGPathElement;
    face.style.fill = ALT_FILL[rgAlt[k] || 'ground'] || ALT_FILL.ground;
    g.appendChild(face);
    // 内圈按细胞**面积质心**缩:六宫的区心在内环上,按它缩会把内圈拽偏
    g.appendChild(mk('path', { class: 'thm-isle-inner', d: CELL_SYS.smoothPath(shrinkRing(cell.ring, 0.66, cell.ctr)) }));
    rt.gIsles.appendChild(g);
  }
  /* ⚠ 双边线只许画 dInland:临海那段归海岸线独占,两条线抢同一条边会糊成脏边。 */
  for (const k of keys) rt.gIsles.appendChild(mk('path', { class: 'thm-brd thm-brd-gap', d: cells[k].dInland }));
  for (const k of keys) {
    const cell = cells[k];
    const gl = mk('path', { class: 'thm-brd thm-brd-l', d: cell.dInset }) as SVGPathElement;
    gl.style.stroke = inkColor(k);
    rt.gIsles.appendChild(gl);
  }
  const outlineD = CELL_SYS.smoothPath(terraOutline(96));
  rt.gIsles.appendChild(mk('path', { class: 'thm-shore', d: outlineD }));
  rt.gIsles.appendChild(mk('path', { class: 'thm-terra-rim', d: outlineD }));
  // 卷轴铭牌:锚点跟细胞面积质心,下沉量按细胞自己的纵向半高(不许用区半径,那与细胞真实大小无关)
  for (const k of keys) {
    const r = regionGeo(k); const cell = cells[k];
    if (!r) continue;
    const ax = cell.ctr.x, ay = cell.ctr.y;
    let down = 0;
    for (const p of cell.ring) if (p[1] > ay) down = Math.max(down, p[1] - ay);
    const g = mk('g', {}) as SVGGElement;
    g.style.setProperty('--rg', paintColor(k));
    const ly = ay + down * 0.62;
    const w = r.name.length * 20 + 26, hh = 28;
    const gp = mk('g', { class: 'thm-isle-nameplate', 'data-rg': k });
    gp.appendChild(mk('rect', { class: 'thm-isle-plate', x: ax - w / 2, y: ly - hh / 2, width: w, height: hh, rx: 3 }));
    gp.appendChild(mk('path', {
      class: 'thm-isle-plate-line',
      d: `M${ax - w / 2 + 4} ${ly - hh / 2 + 4}h${w - 8}M${ax - w / 2 + 4} ${ly + hh / 2 - 4}h${w - 8}`,
    }));
    for (const sd of [-1, 1]) {
      const rx = ax + sd * (w / 2 + 3);
      gp.appendChild(mk('rect', { class: 'thm-isle-rod', x: rx - 3.5, y: ly - hh / 2 - 3, width: 7, height: hh + 6, rx: 3.5 }));
      gp.appendChild(mk('circle', { class: 'thm-isle-rod-cap', cx: rx, cy: ly, r: 2 }));
    }
    const t = mk('text', { class: 'thm-isle-label', x: ax, y: ly });
    t.textContent = r.name;
    gp.appendChild(t);
    g.appendChild(gp);
    rt.plateAt[k] = { cx: ax, cy: ly, w: w + 14 };
    rt.gIsles.appendChild(g);
  }
}
/* 每区的主高度层 = 该区地点数最多的那层。⚠ 按数据数出来,不写死。 */
function mainAltByRegion(): Record<string, string> {
  const tally: Record<string, Record<string, number>> = {};
  for (const p of mapNodes()) {
    const t = (tally[p.rg] = tally[p.rg] || {});
    t[p.alt] = (t[p.alt] || 0) + 1;
  }
  const out: Record<string, string> = {};
  for (const k of Object.keys(tally)) {
    out[k] = Object.keys(tally[k]).sort((a, b) => tally[k][b] - tally[k][a])[0] || 'ground';
  }
  return out;
}

/* ===================== 7.5 路网 ===================== */
function renderPaths(rt: MapRT): void {
  const K1 = 0.18, K2 = 0.26;
  const CXW = WORLD_W / 2, CYW = WORLD_H / 2, IYF = 0.64;
  const drawn: Pt[][] = [];
  /* 弧度统一朝云海侧(外侧)鼓:中垂线两侧取离版图中心更远的那个控制点。 */
  function ctrl(a: MapNode, b: MapNode, kk: number): { x: number; y: number } {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const off = len * kk;
    const c1 = { x: mx - (dy / len) * off, y: my + (dx / len) * off };
    const c2 = { x: mx + (dy / len) * off, y: my - (dx / len) * off };
    const d1 = Math.hypot(c1.x - CXW, (c1.y - CYW) / IYF);
    const d2 = Math.hypot(c2.x - CXW, (c2.y - CYW) / IYF);
    return d1 >= d2 ? c1 : c2;
  }
  function sampleQ(a: MapNode, q: { x: number; y: number }, b: MapNode, n: number): Pt[] {
    const out: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push([u * u * a.x + 2 * u * t * q.x + t * t * b.x, u * u * a.y + 2 * u * t * q.y + t * t * b.y]);
    }
    return out;
  }
  function segX(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
    const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
    if (Math.abs(d) < 1e-9) return false;
    const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
    const s = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
    // 端点邻域不算交叉:共享节点的边天然在端点相接
    return t > 0.04 && t < 0.96 && s > 0.04 && s < 0.96;
  }
  function crosses(poly: Pt[]): boolean {
    for (const q of drawn) {
      for (let m = 0; m < poly.length - 1; m++) {
        for (let n = 0; n < q.length - 1; n++) if (segX(poly[m], poly[m + 1], q[n], q[n + 1])) return true;
      }
    }
    return false;
  }
  mapEdges().forEach(e => {
    const a = nodeById(e.a), b = nodeById(e.b);
    if (!a || !b) return;
    if (a.rg === b.rg) {
      // 区内只画极淡引路线,不参与交叉检测:淡到 .15 的素线彼此叠一下读不出来
      const qi = ctrl(a, b, K1);
      const di = `M${a.x},${a.y}Q${qi.x.toFixed(1)},${qi.y.toFixed(1)} ${b.x},${b.y}`;
      const gi = mk('path', { class: 'thm-guide', d: di }) as SVGPathElement;
      gi.style.setProperty('--rg', paintColor(a.rg));
      rt.gPaths.appendChild(gi);
      (rt.guideOf[a.id] = rt.guideOf[a.id] || []).push(gi);
      (rt.guideOf[b.id] = rt.guideOf[b.id] || []).push(gi);
      return;
    }
    /* 采样密度 40:折线近似太粗会漏掉两条弧"擦着过"的相交。改小这个数会漏检。 */
    const SEG = 40;
    let q = ctrl(a, b, K1), poly = sampleQ(a, q, b, SEG), bumped = false;
    if (crosses(poly)) { q = ctrl(a, b, K2); poly = sampleQ(a, q, b, SEG); bumped = crosses(poly); }
    drawn.push(poly);
    const d = `M${a.x},${a.y}Q${q.x.toFixed(1)},${q.y.toFixed(1)} ${b.x},${b.y}`;
    const g = mk('g', {}) as SVGGElement;
    g.style.setProperty('--rg', paintColor(a.rg));
    g.appendChild(mk('path', { class: 'thm-path dash', d }));
    g.appendChild(mk('path', { class: 'thm-path-ink', d }));
    if (bumped) rt.gPaths.insertBefore(g, rt.gPaths.firstChild); else rt.gPaths.appendChild(g);
  });
}

/* 辖区顶饰:轮廓线稿 × 层位基线气质,一枚内联 SVG。
   ⚠ 玫瑰金 currentColor + fill:none —— 辖区色只许待在灯芯里(4.1 面积律)。 */
const CROWN_P: Record<string, string> = {
  hub: '<circle cx="12" cy="11" r="5"/><circle cx="12" cy="11" r="1.1" fill="currentColor" stroke="none"/>',
  zx: '<path d="M12 4c1.6 2.3 3.1 3.3 3.1 5.6a3.1 3.1 0 1 1 -6.2 0C8.9 7.3 10.4 6.3 12 4z"/>',
  tf: '<path d="M12 12L9.6 6.4M12 12l-4.8 1.4M12 12l6 2.6M12 12l-1.2-5.6"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>',
  yy: '<path d="M15.5 5.5a8 8 0 1 0 0 13"/><path d="M12.5 9.5a4.8 4.8 0 0 0 0 9"/>',
  fx: '<path d="M12 4v9M9.8 6.7l4.4 3.6M14.2 6.7l-4.4 3.6"/>',
  zh: '<path d="M5 19c.6-5.5 4.5-10.2 14-12.4"/><path d="M9 16.4c2.6-3.6 5.6-6.2 9-7.8"/>',
  ns: '<path d="M12 4l7 7-7 7-7-7z"/><path d="M6.5 11h11"/>',
  xj: '<path d="M12 4.5l2 4.2 4.6.6-3.3 3.2.8 4.5-4.1-2.2-4.1 2.2.8-4.5-3.3-3.2 4.6-.6z"/>',
  my: '<path d="M12 4l1.5 6 6 2-6 2-1.5 6-1.5-6-6-2 6-2z"/>',
};
/* 五种层位的基线/拱线/位移。w = SVG 线宽(SVG 即节点主体)。 */
const CROWN_ALT: Record<string, { base: string; dy: number; w: number; dash?: string }> = {
  high: { base: '', dy: -2, w: 1.1 },
  float: { base: '<path d="M6.5 20.5h3M14.5 20.5h3" opacity=".75"/>', dy: -0.5, w: 1.3 },
  ground: { base: '<path d="M6 20.5h12" opacity=".9"/>', dy: 0, w: 1.6 },
  under: { base: '<path d="M6.5 6q5.5-4.5 11 0" opacity=".8"/><path d="M6.5 20.5h11" opacity=".8"/>', dy: 1.5, w: 1.6 },
  edge: { base: '', dy: 0, w: 1.4, dash: '3 2.5' },
};
function crownSvg(rg: string, alt: string): string {
  const a = CROWN_ALT[alt] || CROWN_ALT.ground;
  const p = CROWN_P[rg] || '';
  const dash = a.dash ? ` stroke-dasharray="${a.dash}"` : '';
  const g = a.dy ? `<g transform="translate(0 ${a.dy})">${p}</g>` : p;
  return `<svg class="thm-crown-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="${a.w}" stroke-linecap="round" stroke-linejoin="round"${dash} aria-hidden="true">${g}${a.base}</svg>`;
}

/* ===================== 11.1 节点 + 11.2 书签光片 ===================== */
/* 11.2 书签三态唯一判定口,接真实世界书绑定态(managedEntryStates.location)。
   ⚠ 刷新只会在 mountMap 里发起一次,首帧必是「未刷新」⇒ loc 空桶时回落老判法,
     否则开局那一下所有光片会全灭一帧。非【地点】条目(home)同走回落。 */
function bmState(p: MapNode): 'on' | 'part' | 'off' {
  const loc = managedEntryStates.location;
  if (!loc || !Object.keys(loc).length) return p.wb ? 'on' : 'off';
  const { kind, name } = parseManagedEntryName(p.wb);
  if (kind !== 'location' || !name) return p.wb ? 'on' : 'off';
  /* 真实态优先:注册表没登记的地点在这儿会判成 off,而卡上开关已按真实态显示"已开",
     两个指示物就会互相打脸。 */
  const real = wbReal[name];
  if (real) return real.on ? 'on' : 'part';
  const s = loc[name];
  if (!s) return 'off';
  return s.enabled ? 'on' : s.bound ? 'part' : 'off';
}
/* 地点卡上的世界书开关要的三样:条目名、开关态、命中份数。
   ⚠ 注册表(managedEntryStates)只装 localStorage 登记过的地点 ⇒ 查不到时给 unknown 而非
     "没有绑定":真实存在但未登记的条目照样能开,判死会让开关白白禁掉。 */
const wbReal: Record<string, { on: boolean; count: number }> = {};
function wbInfoOf(p: MapNode): { name: string; state: 'on' | 'off' | 'unknown'; count: number } | null {
  const { kind, name } = parseManagedEntryName(p.wb);
  if (kind !== 'location' || !name) return null;
  const real = wbReal[name];
  if (real) return { name, state: real.on ? 'on' : 'off', count: real.count };
  const s = managedEntryStates.location?.[name];
  if (!s) return { name, state: 'unknown', count: 0 };
  return { name, state: s.enabled ? 'on' : 'off', count: s.count };
}
function wbSwitchHtml(p: MapNode): string {
  const info = wbInfoOf(p);
  if (!info) return '';
  const label = info.state === 'on' ? '世界书已开' : info.state === 'off' ? '世界书未开' : '世界书';
  const cnt = info.count > 1 ? `<b>${info.count}</b>` : '';
  return `<button class="thm-wbsw" data-l3-wb="1" data-st="${info.state}" type="button"
    aria-pressed="${info.state === 'on'}" title="${esc(info.name)} · 点击开关该地点世界书条目">
    <i class="fa-solid fa-book-open"></i><span>${label}</span>${cnt}</button>`;
}
/* 世界书刷新是异步的,扫完就地改光片三态,不重排整图(12-16)。 */
function applyBookmarkStates(rt: MapRT): void {
  for (const p of mapNodes()) {
    const el = rt.nodeEls[p.id]; if (!el) continue;
    const st = bmState(p);
    const pin = el.querySelector('.thm-pin');
    const old = el.querySelector<HTMLElement>('.thm-bm');
    if (st === 'off') { old?.remove(); continue; }
    if (old) { old.dataset.st = st; continue; }
    const bm = __doc.createElement('span');
    bm.className = 'thm-bm'; bm.dataset.st = st;
    pin?.appendChild(bm);
  }
}
function renderNodes(rt: MapRT): void {
  const order = allRegionGeo().map(r => r.id);
  const layout = getMapLayout();
  for (const p of mapNodes()) {
    /* 玩家拖过的坐标覆盖种子:落回 MapNode 上,摆位以后一切消费都按它。
       ⚠ 没覆盖时必须显式写回 sx/sy,不能"保持原样":x/y 是上一次渲染留下的可变量,
         「重置坐标」清掉存储后若不写回,节点会停在拖走的位置上还报成功。 */
    const ov = layout.pos?.[p.full];
    const has = !!ov && typeof ov.x === 'number' && typeof ov.y === 'number';
    p.x = has ? (ov as { x: number }).x : p.sx;
    p.y = has ? (ov as { y: number }).y : p.sy;
    const el = __doc.createElement('div');
    el.className = 'thm-node';
    el.dataset.id = p.id; el.dataset.tier = p.tier; el.dataset.rg = p.rg;
    el.dataset.alt = p.alt;                      // 丝带筛选按这个选,别去读 pin 的 data-mat
    el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
    el.style.setProperty('--rg', paintColor(p.rg));
    el.style.transitionDelay = `${order.indexOf(p.rg) * 40 + 120}ms`;
    const pin = __doc.createElement('div');
    pin.className = 'thm-pin'; pin.dataset.mat = MATS[p.alt] || 'glass';
    // 灯芯 + 顶饰(SVG 主体):SVG 就是节点本身,珐琅圆饼已由 CSS 移除
    pin.innerHTML = '<span class="thm-dot"></span>';
    const cr = __doc.createElement('span');
    cr.className = 'thm-crown';
    cr.innerHTML = crownSvg(p.rg, p.alt);
    pin.appendChild(cr);
    const st = bmState(p);
    if (st !== 'off') {
      const bm = __doc.createElement('span');
      bm.className = 'thm-bm'; bm.dataset.st = st;
      pin.appendChild(bm);
    }
    el.appendChild(pin);
    const lb = __doc.createElement('div');
    lb.className = 'thm-label';
    // 只写短名:高度层由 pin 材质 + 图例表达,写进标签会让每条宽出四成、挤掉别人
    lb.textContent = p.short;
    el.appendChild(lb);
    rt.nodes.appendChild(el);
    rt.nodeEls[p.id] = el;
  }
}
/* hover 飞出卡:轻卡浮节点旁,一句 env。屏幕层,相机移动由 applyCam 同步。 */
let flyNode: string | null = null;
function showFly(rt: MapRT, p: MapNode): void {
  flyNode = p.id;
  placeFly(rt);
}
function hideFly(rt: MapRT): void {
  flyNode = null;
  rt.root.querySelector<HTMLElement>('[data-thm-fly="1"]')?.classList.remove('show');
}
/* world·cam → view 屏幕坐标;卡挂 view 层,文字不随相机缩放。 */
function placeFly(rt: MapRT): void {
  if (!flyNode) return;
  const p = nodeById(flyNode);
  const fly = rt.root.querySelector<HTMLElement>('[data-thm-fly="1"]');
  if (!p || !fly) return;
  fly.innerHTML =
    `<span class="thm-fly-name">${esc(p.short)}</span>` +
    `<span class="thm-fly-env">${esc(p.env)}</span>`;
  fly.style.left = `${(p.x * rt.cam.s + rt.cam.x).toFixed(1)}px`;
  fly.style.top = `${(p.y * rt.cam.s + rt.cam.y).toFixed(1)}px`;
  fly.classList.add('show');
}
/* 9.3 把一枚呼吸件对齐到全局 4s 绝对时钟。
⚠ CSS 动画的起点是**元素创建时刻**,而节点按 MVU 增量重建 ⇒ 不锁相则各自带一个随机相位。
     负 delay 把动画倒推到已跑过 `(now + phase·周期)` 的位置,谁在什么时候建都落同一条钟上。 */
const BREATH_MS = 4000;
function phaseLock(el: HTMLElement, phase: number): void {
  el.style.animationDelay = `${-((performance.now() + phase * BREATH_MS) % BREATH_MS)}ms`;
}
/* `.thm-cradle` 与 `.thm-sheen i` 建在静态模板里,只在挂载时锁一次。 */
function lockStaticBreath(rt: MapRT): void {
  const cr = rt.root.querySelector<HTMLElement>('.thm-cradle');
  if (cr) phaseLock(cr, 0.15);
  const sh = rt.root.querySelector<HTMLElement>('.thm-sheen i');
  if (sh) phaseLock(sh, 0.50);
  const cl = rt.root.querySelector<HTMLElement>('[data-thm-clouds="1"]');
  if (cl) phaseLock(cl, 0);
}
function decorateCurrent(rt: MapRT): void {
  for (const id of Object.keys(rt.nodeEls)) {
    const el = rt.nodeEls[id];
    el.classList.toggle('cur', id === rt.cur);
    el.querySelectorAll('.thm-beam,.thm-halo,.thm-mote,.thm-vine').forEach(n => n.remove());
    if (id !== rt.cur) continue;
    const beam = __doc.createElement('div'); beam.className = 'thm-beam';
    phaseLock(beam, 0.30); el.appendChild(beam);
    const h1 = __doc.createElement('div'); h1.className = 'thm-halo'; el.appendChild(h1);
    const h2 = __doc.createElement('div'); h2.className = 'thm-halo d2'; el.appendChild(h2);
    for (let i = 0; i < 4; i++) {
      const m = __doc.createElement('div'); m.className = 'thm-mote';
      m.style.setProperty('--dx', `${(i % 2 ? 1 : -1) * (5 + i * 3)}px`);
      m.style.animationDelay = `${i}s`;
      el.appendChild(m);
    }
    /* 12.2 花柱 = 光柱**缠**花藤,摆位是螺旋:x 走正弦、y 匀速升。
       ⚠ 相位取整圈 + 半步 —— 一圈半正好采到 0/±90°/180°/270°,x 退化成"柱边一排花"。
       ⚠ 深度感给字号不给 scale:scale 已被呼吸 keyframe 占用。 */
    const VN = 6, VR = 13, VH = 96;
    for (let v = 0; v < VN; v++) {
      const t = ((v + 0.5) / VN) * Math.PI * 2;
      const depth = Math.cos(t);
      const fl = __doc.createElement('div'); fl.className = 'thm-vine';
      fl.style.setProperty('--vx', `${(Math.sin(t) * VR).toFixed(1)}px`);
      fl.style.setProperty('--vy', `${-(10 + (v / (VN - 1)) * VH).toFixed(1)}px`);
      fl.style.fontSize = `${(6 + (depth + 1) * 1.6).toFixed(1)}px`;
      fl.style.setProperty('--vo', (0.55 + (depth + 1) * 0.2).toFixed(2));
      phaseLock(fl, 0.30 + (v / VN) * 0.5);   // 基相 .30 上再错半圈
      el.appendChild(fl);
    }
  }
  syncHere(rt);
}
/* 「你在这里」胶囊(9-B)。匹配不到 ⇒ 显示原文 + 不点亮任何节点 + 不报错。 */
function syncHere(rt: MapRT): void {
  const txt = rt.root.querySelector<HTMLElement>('[data-thm-here-txt="1"]');
  const mark = rt.root.querySelector<HTMLElement>('[data-thm-here-mark="1"]');
  const rgEl = rt.root.querySelector<HTMLElement>('[data-thm-here-rg="1"]');
  const p = nodeById(rt.cur);
  if (!p) {
    if (txt) txt.textContent = rt.rawLoc || '';
    if (mark) mark.textContent = COPY.noMatch;
    if (rgEl) rgEl.textContent = '';
    return;
  }
  if (txt) txt.textContent = p.short;
  if (mark) mark.textContent = COPY.here;
  if (rgEl) rgEl.textContent = `${regionGeo(p.rg)?.name || ''} · ${ALT_CN[p.alt] || p.alt}`;
}

/* ===================== 9.9 相机 ===================== */
const MIN_S = 0.18, MAX_S = 2.6, ZSTEP = 1.25, MARGIN = 260;
const DRAG_MIN = 4;          // 超过它才算拖拽(而不是点击):同时是要指针捕获的门限
const DBL_WAIT = 200;        // 单击开卡前等第二击的窗口。取 200:低于常见双击间隔,高于误触
/* 8.13 聚合阈值。⚠ 它必须低于**最小视口**的真实 fit,因为 fitScale 的下限钉在 AGG_AT+0.02:
   取大了那个下限会顶过真实 fit,进图直接溢出视口。节点 bbox 2896×1504 + pad 108
   ⇒ 900×520 视口的真实 fit 0.289,所以这个数不许超过 0.27。 */
const AGG_AT = 0.26;
const LBL_DENSITY = 0.6, PAR = 0.55;
const CAP = 190;              // 9.10 视差软饱和上限

function vw(rt: MapRT): number { return rt.vwNow || rt.view.clientWidth; }
function vh_(rt: MapRT): number { return rt.vhNow || rt.view.clientHeight; }
function camBounds(rt: MapRT) {
  return {
    minX: vw(rt) - (WORLD_W + MARGIN) * rt.cam.s, maxX: MARGIN * rt.cam.s,
    minY: vh_(rt) - (WORLD_H + MARGIN) * rt.cam.s, maxY: MARGIN * rt.cam.s,
  };
}
function clampCam(rt: MapRT, soft?: boolean): void {
  if (soft) return;   // 橡皮筋:soft 时允许越界,由主循环慢慢拉回
  const b = camBounds(rt);
  rt.cam.x = Math.min(b.maxX, Math.max(b.minX, rt.cam.x));
  rt.cam.y = Math.min(b.maxY, Math.max(b.minY, rt.cam.y));
}
function overflow(rt: MapRT): { x: number; y: number } {
  const b = camBounds(rt);
  return {
    x: rt.cam.x > b.maxX ? rt.cam.x - b.maxX : (rt.cam.x < b.minX ? rt.cam.x - b.minX : 0),
    y: rt.cam.y > b.maxY ? rt.cam.y - b.maxY : (rt.cam.y < b.minY ? rt.cam.y - b.minY : 0),
  };
}
function applyCam(rt: MapRT): void {
  rt.world.style.transform =
    `translate3d(${rt.cam.x.toFixed(2)}px,${rt.cam.y.toFixed(2)}px,0) scale(${rt.cam.s.toFixed(4)})`;
  applyClouds(rt);
  if (flyNode) placeFly(rt);
  const lv = rt.root.querySelector<HTMLElement>('[data-thm-zlv="1"]');
  if (lv) lv.textContent = rt.cam.s.toFixed(2);
  refreshLOD(rt);
}
/* 三层云各自的 transform 只有这一个写入方(9.10),**纯相机视差,只在相机变时调**。
   呼吸的 y 归容器上那条 CSS 动画 —— 同一属性两个写入方,后写的会静默顶掉前一个。
   ⚠ 越界用软饱和 tanh 不用硬 clamp:硬 clamp 一饱和各层撞同一上限,层间速度差消失、纵深没了。 */
function soft(v: number): number { return CAP * Math.tanh(v / CAP); }
function applyClouds(rt: MapRT): void {
  const k = PAR;
  const set = (n: number, fx: number, fy: number) => {
    const el = rt.cloudEls[n - 1];
    if (el) {
      el.style.transform =
        `translate3d(${soft(rt.cam.x * fx * k).toFixed(1)}px,${soft(rt.cam.y * fy * k).toFixed(1)}px,0)`;
    }
  };
  set(1, 0.16, 0.10); set(2, 0.09, 0.06); set(3, 0.04, 0.03);
}
function zoomAt(rt: MapRT, px: number, py: number, mul: number): void {
  const ns = Math.min(MAX_S, Math.max(MIN_S, rt.cam.s * mul));
  if (ns === rt.cam.s) return;
  // 保持鼠标下的世界点不动(9.9 锚鼠标)
  const wx = (px - rt.cam.x) / rt.cam.s, wy = (py - rt.cam.y) / rt.cam.s;
  rt.cam.s = ns; rt.cam.x = px - wx * ns; rt.cam.y = py - wy * ns;
  clampCam(rt); applyCam(rt);
}
function animCam(rt: MapRT, tx: number, ty: number, ts: number, ms: number): void {
  const t0 = performance.now();
  const x0 = rt.cam.x, y0 = rt.cam.y, s0 = rt.cam.s;
  if (rt.camAnim) cancelAnimationFrame(rt.camAnim);
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    rt.cam.x = x0 + (tx - x0) * e; rt.cam.y = y0 + (ty - y0) * e; rt.cam.s = s0 + (ts - s0) * e;
    applyCam(rt);
    if (k < 1) rt.camAnim = requestAnimationFrame(step); else rt.camAnim = 0;
  };
  rt.camAnim = requestAnimationFrame(step);
}
function centerOn(rt: MapRT, wx: number, wy: number, s: number, ms: number): void {
  const ts = Math.min(MAX_S, Math.max(MIN_S, s));
  animCam(rt, vw(rt) / 2 - wx * ts, vh_(rt) / 2 - wy * ts, ts, ms);
}
function focusRegion(rt: MapRT, k: string): void {
  const r = regionGeo(k); if (!r) return;
  centerOn(rt, r.cx, r.cy, 1.15, 520);
}
function focusCur(rt: MapRT): void {
  const p = nodeById(rt.cur); if (!p) return;
  centerOn(rt, p.x, p.y, Math.max(rt.cam.s, 1.1), 520);
}
function bbox(): { x0: number; x1: number; y0: number; y1: number; cx: number; cy: number } {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of mapNodes()) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  return { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
function fitScale(rt: MapRT): number {
  const b = bbox(), pad = 108;
  const s = Math.min(vw(rt) / (b.x1 - b.x0 + pad * 2), vh_(rt) / (b.y1 - b.y0 + pad * 2));
  // 下限必须 ≥ AGG_AT:否则一进图就掉进聚合带,看到的是几颗球不是地图
  return Math.max(AGG_AT + 0.02, Math.min(1.05, s));
}
// 9.9 Home 归位:与入场终态同一口算法,两处不许各算一遍
function goHome(rt: MapRT): void {
  const b = bbox(), ts = fitScale(rt);
  animCam(rt, vw(rt) / 2 - b.cx * ts, vh_(rt) / 2 - b.cy * ts, ts, 480);
}

/* ===================== 8.13 星团聚合 + 8.5 标签抢位 ===================== */
function lblScale(rt: MapRT): number {
  return Math.min(1.55, Math.max(0.86, 1 / Math.max(0.35, rt.cam.s)));
}
function refreshLOD(rt: MapRT, force?: boolean): void {
  // 平移不改变谁挡谁(碰撞在世界坐标里算),只有缩放变了才值得重算这趟 O(n²)
  if (!force && Math.abs(rt.cam.s - rt.lodAt) < 0.004) return;
  rt.lodAt = rt.cam.s;
  rt.nodes.style.setProperty('--lblk', lblScale(rt).toFixed(3));
  const agg = rt.cam.s < AGG_AT;
  const all = mapNodes();
  /* ⚠ 泛区不许聚合:它的点撒满整张图,聚成一颗球会压在枢纽头上,
     且"这么多地点都在这一处"是假信息。泛区只留 hub/main 当地标。 */
  for (const r of allRegionGeo()) {
    const k = r.id;
    const members = all.filter(p => p.rg === k);
    const should = agg && k !== 'my' && members.length >= 4;
    let ce = rt.clusterEls[k];
    if (should && !ce) {
      ce = __doc.createElement('div');
      ce.className = 'thm-cluster';
      ce.style.setProperty('--rg', paintColor(k));
      ce.style.left = `${r.cx}px`; ce.style.top = `${r.cy}px`;
      ce.innerHTML = `<div class="thm-cluster-bub">${members.length}</div>` +
        `<div class="thm-cluster-cap">${esc(r.name)}</div>`;
      ce.dataset.thmCluster = k;
      rt.world.appendChild(ce);
      rt.clusterEls[k] = ce;
    } else if (!should && ce) { ce.remove(); delete rt.clusterEls[k]; }
    for (const p of members) {
      const el = rt.nodeEls[p.id]; if (!el) continue;
      const hide = should || (agg && k === 'my' && p.tier === 'sub' && p.id !== rt.cur);
      el.style.visibility = hide ? 'hidden' : '';
      el.style.pointerEvents = hide ? 'none' : '';
    }
  }
  syncPlates(rt);   // 要等 clusterEls 更新完再同步名牌(聚合了就收起)
  // 粗筛只在缩得很远时砍级别;正常缩放交给下面的真碰撞,免得白空着地方还藏字
  const showSub = rt.cam.s >= 0.92 - LBL_DENSITY * 0.5;
  const showMain = rt.cam.s >= 0.70 - LBL_DENSITY * 0.5;
  const cp = nodeById(rt.cur) || all[0];
  const rank: Record<string, number> = { hub: 1, main: 2, sub: 3 };
  const cands = all.filter(p => {
    if (rt.clusterEls[p.rg]) return false;
    if (rt.nodeEls[p.id] && rt.nodeEls[p.id].style.visibility === 'hidden') return false;
    return p.id === rt.cur || p.tier === 'hub' || (p.tier === 'main' && showMain) || (p.tier === 'sub' && showSub);
  }).sort((a, b) => {
    if (a.id === rt.cur) return -1;
    if (b.id === rt.cur) return 1;
    const d = rank[a.tier] - rank[b.tier]; if (d) return d;
    const da = (a.x - cp.x) ** 2 + (a.y - cp.y) ** 2;
    const db = (b.x - cp.x) ** 2 + (b.y - cp.y) ** 2;
    return da - db;
  });
  const kk = lblScale(rt), gap = 3 / Math.max(0.35, rt.cam.s);
  const keep: Record<string, 1> = {};
  const placed = plateBoxes(rt);   // 岛名牌先占位:地名是导航锚,不能被地点标签压掉
  for (const p of cands) {
    const m = rt.lblBox[p.id];
    if (!m) { keep[p.id] = 1; continue; }
    // 反缩放后的实际占位:宽高 ×kk,顶边不动(transform-origin: top center)
    const w = m.w * kk, h = m.h * kk;
    const x0 = p.x - w / 2 - gap, x1 = x0 + w + gap * 2;
    const y0 = p.y + m.top - gap, y1 = y0 + h + gap * 2;
    let hit = false;
    for (const q of placed) if (x0 < q.x1 && q.x0 < x1 && y0 < q.y1 && q.y0 < y1) { hit = true; break; }
    if (hit) continue;
    placed.push({ x0, x1, y0, y1 }); keep[p.id] = 1;
  }
  for (const p of all) {
    const el = rt.nodeEls[p.id]; if (!el) continue;
    el.classList.toggle('lbl-hide', !keep[p.id]);
  }
}
/* 岛名牌:反缩放(绕自己的锚点缩)+ 给标签排版当占位盒 */
function syncPlates(rt: MapRT): void {
  const kk = lblScale(rt);
  for (const k of Object.keys(rt.plateAt)) {
    const g = rt.gIsles.querySelector<SVGGElement>(`.thm-isle-nameplate[data-rg="${k}"]`);
    if (!g) continue;
    const a = rt.plateAt[k];
    g.setAttribute('transform', `translate(${a.cx},${a.cy}) scale(${kk.toFixed(3)}) translate(${-a.cx},${-a.cy})`);
    g.style.display = rt.clusterEls[k] ? 'none' : '';   // 聚合档星团自己写着区名,名牌收起
  }
}
function plateBoxes(rt: MapRT): { x0: number; x1: number; y0: number; y1: number }[] {
  const out: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const kk = lblScale(rt);
  for (const k of Object.keys(rt.plateAt)) {
    if (rt.clusterEls[k]) continue;
    const a = rt.plateAt[k], w = (a.w * kk) / 2 + 6, h = 15 * kk + 4;
    out.push({ x0: a.cx - w, x1: a.cx + w, y0: a.cy - h, y1: a.cy + h });
  }
  return out;
}
/* 标签自然尺寸(CSS px,与缩放无关):只量一次。
   反缩放让标签在屏上恒 ~11.5px,碰撞盒要一起算。 */
function measureLabels(rt: MapRT): void {
  const prev = rt.nodes.style.getPropertyValue('--lblk');
  rt.nodes.style.setProperty('--lblk', '1');            // 量的时候先取消反缩放
  const s = rt.cam.s || 1;
  for (const p of mapNodes()) {
    const el = rt.nodeEls[p.id]; if (!el) continue;
    const lb = el.querySelector<HTMLElement>('.thm-label'); if (!lb) continue;
    const a = el.getBoundingClientRect(), b = lb.getBoundingClientRect();
    if (!b.width) continue;
    rt.lblBox[p.id] = {
      w: b.width / s, h: b.height / s,
      top: (b.top - (a.top + a.height / 2)) / s,        // 顶边相对节点中心(未缩放)
    };
  }
  rt.nodes.style.setProperty('--lblk', prev || '1');
}

/* ===================== 7.6② 左侧竖切面丝带 + 图例 ===================== */
/* 段高按该层地点数占比分,**禁写死**;数量为 0 的层仍留最小段,免得图例与丝带对不上。 */
function paintRibbon(rt: MapRT): void {
  const box = rt.root.querySelector<HTMLElement>('[data-thm-ribbon="1"]');
  if (!box) return;
  const cnt: Record<string, number> = {};
  let tot = 0;
  for (const p of mapNodes()) { cnt[p.alt] = (cnt[p.alt] || 0) + 1; tot++; }
  box.innerHTML = '<div class="rbt">层</div>';
  for (const a of ALT_ORDER) {
    const n = cnt[a] || 0;
    const b = __doc.createElement('div');
    b.className = 'rbb'; b.dataset.alt = a;
    b.style.setProperty('--rbc', ALT_RBC[a]);
    b.style.flexBasis = `${((100 * n) / (tot || 1)).toFixed(2)}%`;   // 按百分比分,容器高度变了不用改
    b.title = `${ALT_CN[a]} · ${n} 处(点击只看这一层)`;
    b.setAttribute('role', 'button');
    b.tabIndex = 0;
    b.innerHTML = `<span class="rbn">${n}</span>`;
    box.appendChild(b);
  }
}
/* 三档筛选态机:hover 预览 → 点击锁定 → 再点同带解锁。
   ⚠ 节点带着入场 stagger 的 inline transition-delay,切带前必须显式归零,否则每次切带先卡一下。 */
function setAltFocus(rt: MapRT, a: string, preview?: boolean): void {
  for (const id of Object.keys(rt.nodeEls)) rt.nodeEls[id].style.transitionDelay = '0s';
  if (a) rt.nodes.dataset.altFocus = a; else delete rt.nodes.dataset.altFocus;
  if (preview) return;
  const box = rt.root.querySelector<HTMLElement>('[data-thm-ribbon="1"]');
  box?.querySelectorAll<HTMLElement>('.rbb').forEach(e => {
    e.classList.toggle('on', e.dataset.alt === rt.altFocus);
  });
}

function setTier(rt: MapRT, t: number): void {
  rt.tier = t;
  rt.shell.classList.toggle('thm-tier1', t >= 1);
}
/* 10 三个氛围/画质开关的统一落地:intro auto 时交给 8.12 自动降级。 */
function applyPerfTier(rt: MapRT): void {
  /* reduceMotion 优先于手动高画质:系统级可及性约束。 */
  if (rt.reduceMotion) { rt.lockTier = true; setTier(rt, MAX_TIER); return; }
  /* 存储里可能是字符串旧值(JSON.parse),统一 Number() 归一。 */
  const n = Number(getMapCfg().perfTier);
  if (Number.isNaN(n)) { rt.lockTier = false; return; }   // auto
  /* 中/低(0/1)同落满档,高(2)归 0。 */
  rt.lockTier = true; setTier(rt, n >= 2 ? 0 : MAX_TIER);
}
function applyVisualCfg(rt: MapRT): void {
  rt.shell.classList.toggle('thm-nb', !getMapCfg().breath);
  applyPerfTier(rt);
  applyPhase(rt);
  refreshAtmosphere(rt);
  rt.lastRaw = dayPhaseOf(getWorldClock().hour);
}

/* ===================== 主循环 ===================== */
function loop(rt: MapRT, now: number): void {
  const dt = now - rt.lastT;
  rt.lastT = now;
  const fps = 1000 / Math.max(1, dt);
  rt.frames++;
  const sm = fpsSample(
    { hist: rt.fpsHist, streak: rt.lowStreak, frames: rt.frames, slowRun: rt.slowRun }, dt, fps);
  rt.fpsHist = sm.hist; rt.lowStreak = sm.streak; rt.slowRun = sm.slowRun;
  // 惯性
  if (!rt.drag && (Math.abs(rt.vel.x) > 0.05 || Math.abs(rt.vel.y) > 0.05)) {
    rt.cam.x += rt.vel.x; rt.cam.y += rt.vel.y;
    rt.vel.x *= 0.92; rt.vel.y *= 0.92;
    clampCam(rt, true); applyCam(rt);
  }
  // 橡皮筋回弹
  if (!rt.drag) {
    const o = overflow(rt);
    if (Math.abs(o.x) > 0.4 || Math.abs(o.y) > 0.4) {
      rt.cam.x -= o.x * 0.16; rt.cam.y -= o.y * 0.16;
      applyCam(rt);
    }
  }
  const vd = degradeVerdict({
    hist: rt.fpsHist, streak: rt.lowStreak, frames: rt.frames,
    tier: rt.tier, locked: rt.lockTier, lastAt: rt.lastDegrade,
  }, now);
  rt.lowStreak = vd.streak;
  if (vd.act) { setTier(rt, rt.tier + 1); rt.lastDegrade = now; }
  if (vd.full) rt.fpsHist = [];   // 窗口离散,判完即清
  /* 读数走独立 EMA,判定窗每满窗清空,借它显示会闪空白。
     ⚠ 门限取 STALL_DT 不取 LONG_DT:后者会把真卡的每一帧挡掉,读数冻在开局那帧。 */
  if (dt <= STALL_DT) rt.fpsShow = rt.fpsShow ? rt.fpsShow + (fps - rt.fpsShow) * 0.08 : fps;
  if (rt.fpsShow) {
    const txt = `fps <b>${rt.fpsShow.toFixed(0)}</b>  档 <b>${rt.tier}</b>${rt.lockTier ? ' 锁' : ''}`;
    if (txt !== rt.perfTxt) {          // 每帧重写 innerHTML 会白付一次解析 + 重排
      rt.perfTxt = txt;
      const pe = rt.root.querySelector<HTMLElement>('[data-thm-perf="1"]');
      if (pe) {
        pe.innerHTML = txt;
        pe.classList.toggle('warn', rt.tier > 0);
      }
    }
  }
  rt.rafId = requestAnimationFrame(t => loop(rt, t));
}

/* ===================== 4.4 时相 ===================== */
/* ⚠ 各量全落 .thm-shell,不落 document.body:纸底与字色写 body 会重染整个状态栏 */
function applyPhase(rt: MapRT): DayPhase {
  /* 时辰皮肤关 = 定格白昼,不做夜间转色。 */
  const ph = getMapCfg().phaseSkin ? dayPhaseOf(getWorldClock().hour) : 'day';
  const q = PHASES[ph];
  const ss = rt.shell.style;
  ss.setProperty('--thm-sky-1', q.a);
  ss.setProperty('--thm-sky-2', q.b);
  ss.setProperty('--thm-sun', q.sun);
  ss.setProperty('--thm-cloud-rim', q.rim);
  ss.setProperty('--thm-glow-lv', q.glow);
  ss.setProperty('--thm-wick-lv', q.wick);
  rt.shell.classList.toggle('night', ph === 'night');
  /* 深夜的字色:token 已声明在 .thm-shell 上,覆盖它只影响地图子树。
     ⚠ 不许给 .thm-dot 逐节点写行内 box-shadow:行内优先级最高,会顶掉跟灯芯量联动的那两层发光。 */
  ss.setProperty('--thw-text', ph === 'night' ? '#f2ecf8' : '#1b1620');
  return ph;
}

/* ===================== 12.5 氛围 ===================== */
/* 季节 → 伪天气雨雪薄纱。只有两档 CSS,秋(晴)留空。 */
const SEASON_WX: Record<string, string> = { 春: 'rain', 夏: 'rain', 秋: '', 冬: 'snow' };
/* 节庆类别 → 张灯辖区。一条类别串可命中多区;有节必挂 hub(万花广场)兜底。 */
const FEST_RG: Array<[RegExp, string[]]> = [
  [/院/, ['xj', 'ns']],
  [/宫/, ['hub']],
  [/中/, ['yy', 'hub']],
  [/西/, ['hub', 'yy']],
  [/物/, ['my']],
];
/* 键=两开关+月日,变了才重算 ⇒ 常态轮询零开销。 */
let atmoKey = '';
function refreshAtmosphere(rt: MapRT): void {
  const clk = getWorldClock(), cfg = getMapCfg();
  const key = `${cfg.weather}-${clk.month}-${cfg.festival}-${clk.day}`;
  if (key === atmoKey) return;
  atmoKey = key;
  /* 关开关即清 dataset,否则伪天气定格不褪。 */
  rt.shell.dataset.weather = cfg.weather ? (SEASON_WX[seasonOf(clk.month)] || '') : '';
  const want = cfg.festival ? festivalRegions(clk.month, clk.day) : null;
  for (const id of Object.keys(rt.nodeEls)) {
    const p = nodeById(id), pin = rt.nodeEls[id].querySelector<HTMLElement>('.thm-pin');
    if (!p || !pin) continue;
    const old = pin.querySelector('.thm-fest');
    if (want?.has(p.rg)) {
      if (!old) { const f = __doc.createElement('span'); f.className = 'thm-fest'; pin.appendChild(f); }
    } else if (old) old.remove();
  }
}
function festivalRegions(mo: number, da: number): Set<string> {
  const out = new Set<string>(['hub']);
  for (const f of festivalsOn(mo, da))
    for (const [re, rgs] of FEST_RG) if (re.test(f.category)) rgs.forEach(r => out.add(r));
  return out;
}

/* ===================== 9-B MVU 当前位置 ===================== */
/* 轮询是主力、事件是加速:Mvu 事件跨不了 iframe(precedent: status-bar-init 双通道)。 */
function readMvuLoc(): string {
  try {
    const d = (__win as unknown as { __thStatusBarData?: { getCurrentData?: () => unknown } })
      .__thStatusBarData?.getCurrentData?.() as Record<string, unknown> | undefined;
    const w = d?.['世界信息'] as Record<string, unknown> | undefined;
    const v = w?.['具体位置'];
    // MVU 叶子可能是 [值, 说明] 形态,取首项
    const s = Array.isArray(v) ? v[0] : v;
    return typeof s === 'string' ? s.trim() : '';
  } catch { return ''; }
}
/* 12-20 定向更新:比签名,未变则跳过 —— 轮询不许踩掉相机位/缩放档/筛选态。 */
function syncCurrentFromMvu(rt: MapRT): void {
  /* 时辰皮肤实时跟相:只在相位翻转时写一次。 */
  const ph = dayPhaseOf(getWorldClock().hour);
  if (ph !== rt.lastRaw) { rt.lastRaw = ph; applyPhase(rt); }
  const loc = readMvuLoc();
  if (!loc || loc === rt.rawLoc) return;
  rt.rawLoc = loc;
  const seed = matchSeed(loc);
  /* ⚠ 存 wb 不存 full:节点 id 是种子表的 `w`(3.1 那个全局唯一的字段),
     而 rt.cur 的每一个消费点都拿它当 id 用。存 full 会全线对不上、静默不点亮。
     发给模型的文本另取 node.full(8.5)。 */
  const next = seed ? seed.wb : '';
  if (next === rt.cur) { syncHere(rt); return; }
  rt.cur = next;          // 匹配不到 ⇒ '' ⇒ decorateCurrent 不点亮任何节点、胶囊显示原文
  decorateCurrent(rt);
  refreshLOD(rt, true);
}

/* ===================== 编辑模式(拖拽微调) ===================== */
function startNodeDrag(rt: MapRT, e: PointerEvent, el: HTMLElement): void {
  const id = el.dataset.id || '';
  if (!id) return;
  rt.nodeDrag = { id, el };
  try { rt.view.setPointerCapture(e.pointerId); } catch { /* 捕获失败退回普通事件流 */ }
}
function moveNodeDrag(rt: MapRT, e: PointerEvent): void {
  if (!rt.nodeDrag) return;
  const r = rt.view.getBoundingClientRect();
  const wx = (e.clientX - r.left - rt.cam.x) / rt.cam.s;
  const wy = (e.clientY - r.top - rt.cam.y) / rt.cam.s;
  const p = nodeById(rt.nodeDrag.id);
  if (!p) return;
  p.x = Math.round(wx); p.y = Math.round(wy);
  rt.nodeDrag.el.style.left = `${p.x}px`;
  rt.nodeDrag.el.style.top = `${p.y}px`;
}
function endNodeDrag(rt: MapRT): void {
  if (!rt.nodeDrag) return;
  const p = nodeById(rt.nodeDrag.id);
  if (p) setPlacePos(p.full, p.x, p.y);
  rt.nodeDrag = null;
  refreshLOD(rt, true);
}

/* ===================== L3 地点卡(11.9 / 计划 9-D) ===================== */
/* 十一类主要功能 → 动词,一类对一个,查表不猜关键词(计划 9-D)。
   funcs 的形状是「类名 + 末尾一条自由描述」⇒ 认不出的静默跳过,不报错也不漏发别的。 */
const FN_VERB: Record<string, string[]> = {
  汤泉净体: ['沐浴'], 宴饮甜点: ['用膳'], 闲谈八卦: ['交谈'], 采买交易: ['交易', '委托'],
  妆造试衣: ['试穿'], 演艺展台: ['演出'], 竞技游戏: ['挑战'], 修行课业: ['修炼'],
  疗养憩眠: ['休息'], 观景游历: ['闲逛'], 亲密独处: ['亲近'],
};
const VERB_ALL = ['观察', '使用', '记录', '闲逛', '休息', '独处'];
/** 对象是人不是设施 ⇒ 在场条上没人就不许亮,否则造出对空气说话的句子。 */
const VERB_NEEDS_CAST = new Set(['交谈', '亲近']);
const POWER = ['轻', '常', '大胆'];
const POWER_ADV = ['稍稍', '', '尽兴地'];
/* 玩家行动指令壳(世界书先例格式):注入一律包这层壳,模型当作行动指令驱动而非文本 */
const CMD_OPEN = '[玩家行动指令：';
const CMD_CLOSE = ']';

function verbsOf(p: MapNode): string[] {
  const out = [...VERB_ALL];
  for (const f of p.funcs) for (const v of FN_VERB[f] || []) if (!out.includes(v)) out.push(v);
  return out;
}
/** 造句:动词 × 对象 × 力度 → 一句话。对象是人时宾语换「对」。 */
function sentenceOf(p: MapNode, verb: string, obj: string, power: number): string {
  if (!verb) return '';
  const adv = POWER_ADV[power] || '';
  let s: string;
  if (!obj) s = `在${p.full}${adv}${verb}`;
  else {
    const isThing = p.facil.includes(obj) || (p.sn || []).includes(obj) || p.un === obj;
    s = isThing ? `在${p.full}的${obj}${adv}${verb}` : `在${p.full}对${obj}${adv}${verb}`;
  }
  return `${CMD_OPEN}${s}${CMD_CLOSE}`;
}
/* 在场角色:数据桥 NPC.*.是否在场(与 MVU 当前位置同一份 stat_data)。 */
function presentCast(): string[] {
  try {
    const d = (__win as unknown as { __thStatusBarData?: { getCurrentData?: () => unknown } })
      .__thStatusBarData?.getCurrentData?.() as Record<string, unknown> | undefined;
    const npc = d?.['NPC'] as Record<string, { 是否在场?: unknown }> | undefined;
    if (!npc) return [];
    return Object.keys(npc).filter(k => npc[k]?.['是否在场'] === true);
  } catch { return []; }
}
/* 路网邻点(8.7 那套 EDGES),卡片里可直接跳到邻座。 */
function adjacentOf(p: MapNode): MapNode[] {
  const out: MapNode[] = [];
  for (const e of mapEdges()) {
    const o = e.a === p.id ? nodeById(e.b) : e.b === p.id ? nodeById(e.a) : undefined;
    if (o) out.push(o);
  }
  return out;
}
/* 最近去过地点:注入过句子的才记数(日志是唯一数据,9-E)。 */
function recentPlaces(n: number): MapNode[] {
  return Object.entries(getMapLog())
    .filter(([, e]) => e.lastAt > 0)
    .sort((a, b) => b[1].lastAt - a[1].lastAt)
    .slice(0, n)
    .map(([full]) => mapNodes().find(x => x.full === full))
    .filter((x): x is MapNode => !!x);
}
/* 写酒馆输入框尾部。⚠ 宿主 textarea 在**父文档**,不在本 iframe;
   写完必须派 input 事件,否则酒馆不同步内部状态与自适应高度。 */
function toInputBox(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  try {
    const doc = (__win.parent?.document || __doc) as Document;
    const ta = doc.querySelector('#send_textarea') as HTMLTextAreaElement | null;
    if (!ta) return false;
    const cur = (ta.value || '').replace(/\s+$/, '');
    ta.value = cur ? `${cur}\n\n${t}` : t;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    try { ta.focus(); } catch { /* 聚焦失败不影响已写入的文本 */ }
    return true;
  } catch { return false; }
}

/* 13.3 瞌睡小猫。耳朵并进同一条 body 轮廓,不另画两枚三角(26px 高下会读成飘在头边的两块)。 */
function thmCat(): string {
  return `<svg class="thm-cat" viewBox="0 0 34 26" aria-hidden="true">
    <path class="body" d="M7 21c-2 0-3-1.4-3-3.4 0-3 2.2-5.4 5.2-5.8l-.8-3.4 3 2.2c1-.5 2.2-.8 3.4-.8s2.4.3 3.4.8l3-2.2-.8 3.4c3 .4 5.2 2.8 5.2 5.8 0 2-1 3.4-3 3.4z"/>
    <path class="line" d="M12 17.2c.6.5 1.4.5 2 0M18 17.2c.6.5 1.4.5 2 0"/>
    <text class="z z1" x="25" y="11">z</text><text class="z z2" x="27" y="8">z</text><text class="z z3" x="29" y="5">z</text>
  </svg>`;
}

/* 在场角色条:有人渲染头像钉,没人回落瞌睡猫。`data-cast` 可作动词对象。 */
function castHtml(cast: string[]): string {
  if (!cast.length) return `<span class="thm-castnone">${thmCat()}${esc(COPY.alone)}</span>`;
  return cast.map(n =>
    `<button class="thm-cast" data-cast="${esc(n)}" type="button" title="${esc(n)}">
      <span class="thm-av" style="background:var(--rg,#ff92b0)">${esc(n.slice(0, 1))}</span>
      <span class="thm-castname">${esc(n)}</span>
    </button>`).join('');
}
/* 卡片内快移条:路网邻点 + 最近去过(日志),点了直接换卡,不用退回地图。 */
function navHtml(p: MapNode): string {
  const chip = (id: string, short: string, kind: string) =>
    `<button class="thm-navchip" data-nav="${kind}" data-id="${esc(id)}" type="button">${esc(short)}</button>`;
  const adj = adjacentOf(p);
  const recent = recentPlaces(5).filter(r => r.id !== p.id);
  if (!adj.length && !recent.length) return '';
  return `<div class="thm-navrow">
    ${adj.length ? `<span class="thm-nav-lbl">附近</span>${adj.map(a => chip(a.id, a.short, 'adj')).join('')}` : ''}
    ${recent.length ? `<span class="thm-nav-lbl">最近去过</span>${recent.map(r => chip(r.id, r.short, 'recent')).join('')}` : ''}
  </div>`;
}

function cardHtml(p: MapNode, cast: string[]): string {
  const ph = dayPhaseOf(getWorldClock().hour);
  const art = artOf(p.full);
  const rg = regionGeo(p.rg)?.name || '';
  const seals = p.rules.map((r, i) =>
    `<button class="thm-seal" data-l3-seal="${i}" type="button" aria-expanded="false">${esc(r)}</button>`).join('');
  /* 「用」带 = 固定设施 + 「看」组(主要景观)+ 独有物,三带都走同一个 data-l3-obj 契约:
     点谁都能当动词宾语。景观(.thm-look)故意不画成按钮样,免得玩家点出「使用池心白汽柱」。
     独有物(.thm-hot-only)是该地唯一物件,玫瑰金那枚压不带。 */
  const hots = p.facil.map(f =>
    `<button class="thm-hot" data-l3-obj="${esc(f)}" type="button"><i></i>${esc(f)}</button>`).join('');
  /* 「看」组(主要景观)单独成行排在前 9 枚(独有物+设施)之下,免得和可用的一股脑挤在同一行。 */
  const looksArr = (p.sn || []).map(s =>
    `<button class="thm-look" data-l3-obj="${esc(s)}" type="button">${esc(s)}</button>`);
  const looks = looksArr.length ? `<span class="thm-looks">${looksArr.join('')}</span>` : '';
  const un = p.un ? `<button class="thm-hot thm-hot-only" data-l3-obj="${esc(p.un)}" type="button"><i></i>${esc(p.un)}</button>` : '';
  const kw = p.short || p.full;
  return `<div class="thm-l3-card" data-l3-card="1" style="--rg:${paintColor(p.rg)}">
  <div class="thm-l3-art">${art ? `<img src="${esc(art)}" alt="">` : ''}</div>
  ${art ? '' : `<div class="thm-l3-artnote">${esc(COPY.noArt)}</div>`}
  <div class="thm-l3-head">
    <h3>${esc(p.full)}${p.aka ? `<span class="path"> 「${esc(p.aka)}」</span>` : ''}</h3>
    <span class="path">${esc(rg)} · ${esc(ALT_CN[p.alt] || p.alt)} · ${esc(PHASES[ph].n)}</span>
    <div class="thm-seals">${seals}</div>
    <div class="thm-spacer"></div>
    ${wbSwitchHtml(p)}
    <button class="thm-btn" data-l3-act="close" aria-label="关闭">✕</button>
  </div>
  <div class="thm-ruletext" data-l3-ruletext="1"></div>
  <div class="thm-stage">
    ${art ? '' : `<div class="thm-l3-kw">${esc(kw)}</div>`}
    <div class="thm-band">${un}${hots}${looks}</div>
    <div class="thm-castrow">${castHtml(cast)}</div>
  </div>
  ${navHtml(p)}
  <div class="thm-rail">
    <div class="thm-verbs" data-l3-verbs="1"></div>
  </div>
  <div class="thm-l3-foot">
    <div class="thm-l3-talk">
      <div class="thm-l3-scene" data-l3-scene="1" role="button" tabindex="0" title="点一下跳过"></div>
      <div class="thm-l3-skip">点一下跳过</div>
      <div class="thm-prevwrap">
        <span class="thm-prev-hint" data-l3-prev-reset="1" role="button" tabindex="0" title="点此重新拼接">将注入的玩家指令 · 可直接改</span>
        <div class="thm-prev" data-l3-prev="1" contenteditable="true" role="textbox" aria-label="将注入的玩家指令" spellcheck="false"></div>
      </div>
    </div>
    <div class="thm-l3-side">
      <div class="thm-int" data-l3-int="1">${POWER.map((t, i) =>
    `<button data-l3-pw="${i}" type="button"${i === 1 ? ' class="on"' : ''}>${t}</button>`).join('')}</div>
      <button class="thm-primary" data-l3-act="go" type="button">前往此地</button>
      <button class="thm-star" data-l3-act="send" type="button">注入输入框</button>
    </div>
  </div>
  <div class="thm-flash" data-l3-flash="1"></div>
</div>`;
}

function cardQ<T extends Element>(rt: MapRT, sel: string): T | null {
  return rt.l3.querySelector<T>(sel);
}
/** 重画动词带 + 预览条。选中态与「没人时不许亮」都在这儿一处判。 */
function syncCard(rt: MapRT): void {
  const c = rt.card;
  const p = c ? nodeById(c.id) : null;
  if (!c || !p) return;
  const box = cardQ<HTMLElement>(rt, '[data-l3-verbs="1"]');
  if (box) {
    box.innerHTML = verbsOf(p).map(v => {
      /* 对人的动词:在场没人则画 .off(仍可点,点了提示要先有人)。 */
      const dead = VERB_NEEDS_CAST.has(v) && c.cast.length === 0;
      const on = c.verb === v;
      const cls = `thm-verb${on ? ' on' : ''}${dead ? ' off' : ''}`;
      return `<button class="${cls}" data-l3-verb="${esc(v)}" type="button">${esc(v)}</button>`;
    }).join('');
  }
  for (const el of rt.l3.querySelectorAll<HTMLElement>('[data-l3-obj]')) {
    el.classList.toggle('on', el.dataset.l3Obj === c.obj);
  }
  for (const el of rt.l3.querySelectorAll<HTMLElement>('[data-cast]')) {
    el.classList.toggle('on', el.dataset.cast === c.obj);
  }
  for (const el of rt.l3.querySelectorAll<HTMLElement>('[data-l3-pw]')) {
    el.classList.toggle('on', Number(el.dataset.l3Pw) === c.power);
  }
  const prev = cardQ<HTMLElement>(rt, '[data-l3-prev="1"]');
  /* ⚠ 只在组件态才覆写预览条:玩家一落字即自定义锁定(custom),之后再点动词/
     对象/力度都不碰他的手写,得点「✎ 已手写」回组件态才重拼。否则改字必丢。 */
  if (prev && !c.custom) prev.textContent = sentenceOf(p, c.verb, c.obj, c.power);
  const hint = cardQ<HTMLElement>(rt, '[data-l3-prev-reset="1"]');
  if (hint) {
    hint.textContent = c.custom ? '✎ 可改 · 点此重拼' : '将注入的玩家指令 · 可直接改';
    hint.classList.toggle('warn', !!c.custom);
  }
  if (prev) prev.classList.toggle('custom', !!c.custom);
}
function flashCard(rt: MapRT, msg: string): void {
  const el = cardQ<HTMLElement>(rt, '[data-l3-flash="1"]');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  rt.timers.push(__win.setTimeout(() => el.classList.remove('show'), 2600));
}
/* 打字机。只动 textContent 不动布局(容器已按两行占住 min-height)。
   ⚠ 进度按**墙钟**算,不按 tick 数累加:定时器一旦被宿主节流(隐藏页/后台标签),
     按 tick 累加会把整段拖长数倍,按墙钟算则只是变粗,总时长不变。 */
const TYPE_CPS = 48;
function typeScene(rt: MapRT, text: string): void {
  const el = cardQ<HTMLElement>(rt, '[data-l3-scene="1"]');
  if (!el) return;
  if (rt.card) { clearInterval(rt.card.typer); rt.card.typer = 0; }
  el.textContent = '';
  el.classList.add('typing');
  const t0 = performance.now();
  const id = __win.setInterval(() => {
    if (!rt.card || RT !== rt) { clearInterval(id); return; }
    const n = Math.floor((performance.now() - t0) / 1000 * TYPE_CPS);
    el.textContent = text.slice(0, n);
    if (n >= text.length) { clearInterval(id); rt.card.typer = 0; el.classList.remove('typing'); }
  }, 42);
  if (rt.card) rt.card.typer = id;
}
function skipType(rt: MapRT, text: string): void {
  const el = cardQ<HTMLElement>(rt, '[data-l3-scene="1"]');
  if (!rt.card?.typer || !el) return;
  clearInterval(rt.card.typer); rt.card.typer = 0;
  el.textContent = text; el.classList.remove('typing');
}

/* 场景文本。优先读种子表「时段景象」四相原文(p.sc,晨昼昏夜与 PHASES 同序);
   缺字段的地点(如云顶仙居)落回 env 前缀兜底。 */
const PHASE_ORDER: Record<DayPhase, 0 | 1 | 2 | 3> = { dawn: 0, day: 1, dusk: 2, night: 3 };
function sceneText(p: MapNode): string {
  const ph = dayPhaseOf(getWorldClock().hour);
  const raw = p.sc?.[PHASE_ORDER[ph]]?.trim();
  return raw ? raw : `${PHASES[ph].n}。${p.env}`;
}
function openPlaceCard(rt: MapRT, p: MapNode): void {
  const cast = presentCast();
  rt.card = { id: p.id, verb: '', obj: '', power: 1, typer: 0, cast, custom: false };
  rt.l3.innerHTML = cardHtml(p, cast);
  /* 先 offsetWidth 逼出 style resolve 再加类:地图跑在常 0 尺寸的 iframe,
     rAF 被暂停时挂 rAF 的写法会让卡停在 opacity:0(同 seatCamera 那条)。 */
  void rt.l3.offsetWidth;
  rt.l3.classList.add('show');
  syncCard(rt);
  typeScene(rt, sceneText(p));
  cardQ<HTMLElement>(rt, '[data-l3-act="close"]')?.focus();
}
function closePlaceCard(rt: MapRT): void {
  if (!rt.card) return;
  if (rt.card.typer) clearInterval(rt.card.typer);
  rt.card = null;
  rt.l3.classList.remove('show');
  rt.l3.innerHTML = '';
  try { rt.shell.focus(); } catch { /* 焦点回不去不影响关闭 */ }
}
/** 卡内一处委托。返回 true = 已消费,别让外层再当地图操作处理。 */
function onCardClick(rt: MapRT, t: HTMLElement): boolean {
  const c = rt.card;
  const p = c ? nodeById(c.id) : null;
  if (!c || !p) return false;
  if (t.closest('[data-l3-act="close"]')) { closePlaceCard(rt); return true; }
  if (t.closest('[data-l3-wb="1"]')) { void toggleCardWb(rt, p); return true; }
  if (t.closest('[data-l3-prev-reset="1"]')) {
    if (c.custom) { c.custom = false; syncCard(rt); }
    return true;
  }
  const seal = t.closest<HTMLElement>('[data-l3-seal]');
  if (seal) {
    const i = Number(seal.dataset.l3Seal);
    const box = cardQ<HTMLElement>(rt, '[data-l3-ruletext="1"]');
    const open = seal.classList.contains('open');
    for (const s of rt.l3.querySelectorAll<HTMLElement>('[data-l3-seal]')) {
      s.classList.remove('open'); s.setAttribute('aria-expanded', 'false');
    }
    if (box) {
      if (open) box.classList.remove('show');
      else {
        box.textContent = p.rules[i] || '';
        box.classList.add('show');
        seal.classList.add('open'); seal.setAttribute('aria-expanded', 'true');
      }
    }
    return true;
  }
  const cst = t.closest<HTMLElement>('[data-cast]');
  if (cst) {
    const n = cst.dataset.cast || '';
    c.obj = c.obj === n ? '' : n;
    if (!c.verb) c.verb = '交谈';
    syncCard(rt); return true;
  }
  const obj = t.closest<HTMLElement>('[data-l3-obj]');
  if (obj) {
    const v = obj.dataset.l3Obj || '';
    c.obj = c.obj === v ? '' : v;
    if (!c.verb) c.verb = obj.classList.contains('thm-look') ? '观察' : '使用';
    syncCard(rt); return true;
  }
  const vb = t.closest<HTMLElement>('[data-l3-verb]');
  if (vb) {
    const v = vb.dataset.l3Verb || '';
    if (VERB_NEEDS_CAST.has(v)) {
      if (!c.cast.length) { flashCard(rt, `${COPY.alone}——「${v}」得先有人在场`); return true; }
      if (!c.cast.includes(c.obj)) { flashCard(rt, `「${v}」对谁——先点一位在场的人`); return true; }
    }
    c.verb = c.verb === v ? '' : v;
    syncCard(rt); return true;
  }
  const pw = t.closest<HTMLElement>('[data-l3-pw]');
  if (pw) { c.power = Number(pw.dataset.l3Pw) as 0 | 1 | 2; syncCard(rt); return true; }
  const nav = t.closest<HTMLElement>('[data-nav]');
  if (nav) {
    const np = nodeById(nav.dataset.id || '');
    if (np && np.id !== rt.card?.id) openPlaceCard(rt, np);
    return true;
  }
  if (t.closest('[data-l3-scene="1"]')) { skipType(rt, sceneText(p)); return true; }
  if (t.closest('[data-l3-act="send"]')) {
    const txt = cardQ<HTMLElement>(rt, '[data-l3-prev="1"]')?.textContent || '';
    if (!txt.trim()) { flashCard(rt, '先挑一个动词'); return true; }
    if (toInputBox(txt)) { logVisit(p.full, txt.trim()); thToast('已写进输入框', 'success'); closePlaceCard(rt); }
    else thToast('没找到酒馆输入框', 'warn');
    return true;
  }
  if (t.closest('[data-l3-act="go"]')) { void goPlace(rt, p); return true; }
  return !!t.closest('[data-l3-card="1"]');   // 卡面空白处吃掉点击,不穿透到地图
}

/** 只换卡头那一枚开关,不走 syncCard —— 动词带与预览条的选中态不该被世界书操作重置。 */
function syncWbSwitch(rt: MapRT, p: MapNode): void {
  const old = cardQ<HTMLElement>(rt, '[data-l3-wb="1"]');
  if (!old) return;
  const html = wbSwitchHtml(p);
  if (!html) { old.remove(); return; }
  old.outerHTML = html;
}
/* ⚠ 方向必须由**真实世界书**定,不能用注册表算 `!enabled`:种子表里有、注册表没登记的
   地点会被算成"当前未开"⇒ 已经开着的从卡上永远关不掉。同名多份一起翻。 */
async function toggleCardWb(rt: MapRT, p: MapNode): Promise<void> {
  const info = wbInfoOf(p);
  if (!info) { flashCard(rt, '此地没有对应的世界书条目'); return; }
  let rows: LocEntry[];
  try { rows = (await scanLocEntries()).filter(r => r.name === info.name); }
  catch (e) { void e; flashCard(rt, '读不到世界书,确认角色卡已绑定'); return; }
  if (RT !== rt) return;
  if (!rows.length) { syncWbSwitch(rt, p); flashCard(rt, `未找到世界书条目:${info.name}`); return; }
  const next = !rows.some(r => r.enabled);
  try {
    for (const r of rows) await updateInspectorEntry(r.book, r.uid, en => ({ ...en, enabled: next }));
  } catch (e) { void e; flashCard(rt, '写入世界书失败'); return; }
  await refreshManagedStatesAfterWorldbookEdit();
  await scanLocEntries();       // 刷缓存,开关与光片都读它
  if (RT !== rt) return;
  syncWbSwitch(rt, p);
  applyBookmarkStates(rt);
  flashCard(rt, next ? `已开启世界书:${info.name}` : `已关闭世界书:${info.name}`);
  if (!rt.books.hidden) void refreshBooks(rt);
}

/* ⚠ MVU 叶子可能是 `[值, 说明]` 形态(readMvuLoc 就按这个读)⇒ 写回必须保住原形状,
   直接赋字符串会把说明那一项抹掉。 */
function setLeaf(host: Record<string, unknown>, key: string, val: string): void {
  const cur = host[key];
  if (Array.isArray(cur)) { (cur as unknown[])[0] = val; return; }
  host[key] = val;
}
async function goPlace(rt: MapRT, p: MapNode): Promise<void> {
  const c = rt.card;
  if (!c) return;
  const cfg = getMapCfg();
  /* 前往细分:移动(改 MVU 位置/刷地图) × 下发「前往指令」两正交效应,玩家三选一。
     confirmGo 关 = 默认两者兼顾,不弹。 */
  let mode = 'both';
  if (cfg.confirmGo) {
    const m = await thChoose({
      title: '前往 ' + (p.short || p.full),
      options: [
        { value: 'move', label: '只修改变量', desc: '角色移动,不向模型下发指令', primary: true },
        { value: 'both', label: '两者兼顾', desc: '移动 + 生成「前往」指令' },
        { value: 'cmd', label: '只注入指令', desc: '生成「前往」指令,位置不变' },
      ],
    });
    if (!m) return;
    mode = m;
  }
  const move = mode !== 'cmd';
  const cmd = mode !== 'move';
  if (move) {
    const rg = regionGeo(p.rg)?.name || '';
    try {
      const d = (__win as unknown as { __thStatusBarData?: { getCurrentData?: () => unknown } })
        .__thStatusBarData?.getCurrentData?.() as Record<string, unknown> | undefined;
      if (d) {
        const w = d['世界信息'] as Record<string, unknown> | undefined;
        if (w) { if (rg) setLeaf(w, '当前所处区域名称', rg); setLeaf(w, '具体位置', p.full); }
        const uk = getUserKey(d as Record<string, any>);
        const u = d[uk] as Record<string, unknown> | undefined;
        if (u) setLeaf(u, '位置', p.full);
        saveData(d as Record<string, any>);
      }
    } catch (e) { void e; thToast('位置没写进变量,只记了日志', 'warn'); }
    logVisit(p.full);
    rt.rawLoc = p.full; rt.cur = p.id;
    decorateCurrent(rt); syncHere(rt); refreshLOD(rt, true);
    centerOn(rt, p.x, p.y, rt.cam.s, 420);
  }
  if (cmd) {
    /* 不下发自动注入:把「前往指令」填进预览条,玩家确认/改后再点注入。
       ⚠ custom 锁住,否则再点动词会把这份待确认指令冲掉。 */
    c.custom = true;
    const prev = cardQ<HTMLElement>(rt, '[data-l3-prev="1"]');
    if (prev) prev.textContent = `${CMD_OPEN}前往${p.full}${CMD_CLOSE}`;
    syncCard(rt);   // custom 态同步 hint/边框,不覆写预览条
    cardQ<HTMLElement>(rt, '[data-l3-act="send"]')?.focus();
  } else {
    closePlaceCard(rt);
  }
  thToast(cmd && !move ? `已生成「前往${p.full}」指令,待注入` : COPY.goOk, 'success');
}

/* ===================== 事件绑定 ===================== */
/* 12-1 禁 inline onclick:一律 data 属性 + iframe 内 addEventListener 委托。
   全部监听吃同一个 AbortController,destroyMap 一次 abort 收干净(12-16)。 */
function bindEvents(rt: MapRT): void {
  const sig = { signal: rt.ac.signal };
  rt.view.addEventListener('wheel', e => {
    e.preventDefault();
    const r = rt.view.getBoundingClientRect();
    zoomAt(rt, e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? ZSTEP : 1 / ZSTEP);
  }, { passive: false, signal: rt.ac.signal });

  rt.view.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const node = (e.target as HTMLElement).closest?.('.thm-node') as HTMLElement | null;
    if (node && rt.view.classList.contains('edit')) { startNodeDrag(rt, e, node); return; }
    rt.drag = { px: e.clientX, py: e.clientY, t: performance.now(), moved: 0 };
    rt.moved = 0;                        // 位移量的寿命是一次手势,不许跨手势留到下一发 click
    rt.vel.x = rt.vel.y = 0;
    rt.view.classList.add('dragging');
  }, sig);
  rt.view.addEventListener('pointermove', e => {
    if (rt.nodeDrag) { moveNodeDrag(rt, e); return; }
    if (!rt.drag) return;
    const dx = e.clientX - rt.drag.px, dy = e.clientY - rt.drag.py;
    rt.drag.px = e.clientX; rt.drag.py = e.clientY;
    rt.drag.moved += Math.abs(dx) + Math.abs(dy);
    /* 指针捕获必须**等真拖起来**才要,不能在 pointerdown 就要:
       捕获会把随后的 click 目标改写成捕获元素本身 ⇒ view 内一切按钮
       (缩放条 / 归位 / 编辑条 / 丝带)的 [data-thm-act] 委托全部失配,静默失效。
       DRAG_MIN 之后才捕获:纯点击一路不捕获,拖拽照旧拿得到越界后的 move。 */
    if (rt.drag.moved > DRAG_MIN && !rt.dragCap) {
      rt.dragCap = true;
      try { rt.view.setPointerCapture(e.pointerId); } catch { /* 捕获失败退回普通事件流 */ }
    }
    const now = performance.now(), dt = Math.max(1, now - rt.drag.t);
    rt.drag.t = now;
    const o = overflow(rt);
    rt.cam.x += dx * (o.x ? 0.34 : 1);   // 越界时位移打三折 = 橡皮筋阻尼
    rt.cam.y += dy * (o.y ? 0.34 : 1);
    rt.vel.x = (dx / dt) * 16; rt.vel.y = (dy / dt) * 16;
    clampCam(rt, true); applyCam(rt);
  }, sig);
  const endDrag = (e?: PointerEvent) => {
    if (rt.nodeDrag) { endNodeDrag(rt); return; }
    if (!rt.drag) return;
    const moved = rt.drag.moved;
    rt.drag = null;
    rt.view.classList.remove('dragging');
    if (e && rt.dragCap) { try { rt.view.releasePointerCapture(e.pointerId); } catch { /* 已释放 */ } }
    rt.dragCap = false;
    rt.moved = moved;                    // 紧随其后那一发 click 靠它判是拖是点
    if (moved <= DRAG_MIN) { rt.vel.x = rt.vel.y = 0; }
    saveCam(rt.cam.x, rt.cam.y, rt.cam.s);   // 12-20 相机位跨刷新保留
  };
  rt.view.addEventListener('pointerup', endDrag, sig);
  rt.view.addEventListener('pointercancel', endDrag, sig);

  // 双击节点 = 居中 + 轻推近(9.9)
  rt.view.addEventListener('dblclick', e => {
    const node = (e.target as HTMLElement).closest?.('.thm-node') as HTMLElement | null;
    if (!node) return;
    /* 第二击到了 ⇒ 撤掉单击排的开卡,双击只居中。两者共用同一个目标,
       不撤就会既居中又开卡,而开的那张还盖住刚居中的画面。 */
    if (rt.cardWait) { clearTimeout(rt.cardWait); rt.cardWait = 0; }
    const p = nodeById(node.dataset.id || '');
    if (p) centerOn(rt, p.x, p.y, Math.min(MAX_S, rt.cam.s * 1.5), 420);
  }, sig);

  // 预览条落字 → 自定义锁定。contenteditable 键入冒泡 input;程序 textContent 覆写不冒泡,不会误锁
  rt.root.addEventListener('input', e => {
    if (!rt.card || rt.card.custom) return;
    if (!(e.target as HTMLElement).closest?.('[data-l3-prev="1"]')) return;
    rt.card.custom = true;
    syncCard(rt);
  }, sig);

  // 顶栏 / 缩放条 / 编辑条:一处委托,按 data-thm-act 分派
  rt.root.addEventListener('click', e => {
    /* 抽屉开着、点的是抽屉外 → 先关抽屉,不落到地图操作。 */
    const dd = rt.setDrawer;
    if (!dd.hidden && !dd.contains(e.target as Node)) { closeSettings(rt); return; }
    if (!rt.books.hidden && !rt.books.contains(e.target as Node)) { closeBooks(rt); return; }
    /* 卡内点击最先判:卡是 root 的后代,事件会冒到这儿,不先吃掉就会被
       下面几条当成地图操作(如卡面落在某个 cluster 上就跳去聚焦那个辖区)。 */
    if (rt.card && onCardClick(rt, e.target as HTMLElement)) return;
    const chip = (e.target as HTMLElement).closest?.('.thm-tagchip') as HTMLElement | null;
    if (chip && !chip.classList.contains('empty')) { pickTag(rt, chip.dataset.tagVal || ''); return; }
    const t = (e.target as HTMLElement).closest?.('[data-thm-act]') as HTMLElement | null;
    if (t) { void onAct(rt, t.dataset.thmAct || ''); return; }
    const node = (e.target as HTMLElement).closest?.('.thm-node') as HTMLElement | null;
    if (node && !rt.view.classList.contains('edit')) {
      /* 拖完浏览器会补一发 click,落点还在节点上 ⇒ 一拖就开卡。按位移量挡掉。 */
      if (rt.moved > DRAG_MIN) { rt.moved = 0; return; }
      const p = nodeById(node.dataset.id || '');
      /* 单击开卡与双击居中抢同一个目标:先等 DBL_WAIT,没等到第二击才开。
         直接开的话第一击就把卡铺上来,第二击落在卡上,dblclick 永远凑不齐。 */
      if (p) {
        if (rt.cardWait) clearTimeout(rt.cardWait);
        rt.cardWait = __win.setTimeout(() => { rt.cardWait = 0; if (RT === rt) openPlaceCard(rt, p); }, DBL_WAIT);
      }
      return;
    }
    const cl = (e.target as HTMLElement).closest?.('[data-thm-cluster]') as HTMLElement | null;
    if (cl) { focusRegion(rt, cl.dataset.thmCluster || ''); return; }
    const here = (e.target as HTMLElement).closest?.('[data-thm-here="1"]');
    if (here) focusCur(rt);
  }, sig);
  rt.root.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const here = (e.target as HTMLElement).closest?.('[data-thm-here="1"]');
    if (here) { e.preventDefault(); focusCur(rt); return; }
    const rb = (e.target as HTMLElement).closest?.('.rbb') as HTMLElement | null;
    if (rb) { e.preventDefault(); toggleAlt(rt, rb.dataset.alt || ''); }
  }, sig);

  /* 设置抽屉:容器级委托,内层 innerHTML 每次重渲染,监听只绑一次。 */
  bindSettings(rt);
  bindBooks(rt);

  /* 顶栏搜索(9 G 36):回车飞到首个命中的节点,清掉标签/高度过滤让他们现行。 */
  rt.root.querySelector<HTMLInputElement>('[data-thm-search="1"]')?.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const v = (e.target as HTMLInputElement).value.trim();
    if (!v) return;
    const p = matchNode(v);
    if (!p) { thToast(COPY.noResult, 'warn'); return; }
    if (rt.tagFilter) { rt.tagFilter = ''; applyFilter(rt); }
    const act = rt.altFocus; if (act) setAltFocus(rt, '', false);
    flashNode(rt, p.id);
    centerOn(rt, p.x, p.y, Math.max(rt.cam.s, 1.25), 520);
    refreshTagPop(rt);
  }, sig);

  /* 标签下拉按视野外的点关闭(9 G 36)。 */
  rt.root.addEventListener('click', e => {
    if (rt.tagpop.hidden) return;
    if (rt.tagpop.contains(e.target as Node) || (e.target as HTMLElement).closest?.('[data-thm-act="tags"]')) return;
    rt.tagpop.hidden = true;
  }, sig);

  // 丝带三档态机
  const ribbon = rt.root.querySelector<HTMLElement>('[data-thm-ribbon="1"]');
  if (ribbon) {
    ribbon.addEventListener('mouseover', e => {
      const b = (e.target as HTMLElement).closest?.('.rbb') as HTMLElement | null;
      if (b) setAltFocus(rt, b.dataset.alt || '', true);
    }, sig);
    ribbon.addEventListener('mouseleave', () => setAltFocus(rt, rt.altFocus, true), sig);
    ribbon.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest?.('.rbb') as HTMLElement | null;
      if (b) toggleAlt(rt, b.dataset.alt || '');
    }, sig);
  }

  /* hover 飞出卡:按住/拖拽时不出卡。 */
  rt.nodes.addEventListener('mouseover', e => {
    if (rt.drag || rt.nodeDrag || rt.view.classList.contains('dragging')) return;
    const node = (e.target as HTMLElement).closest?.('.thm-node') as HTMLElement | null;
    if (!node) { hideFly(rt); return; }
    const p = nodeById(node.dataset.id || '');
    if (!p) { hideFly(rt); return; }
    showFly(rt, p);
  }, sig);
  rt.nodes.addEventListener('mouseout', e => {
    const node = (e.target as HTMLElement).closest?.('.thm-node') as HTMLElement | null;
    if (node) hideFly(rt);
  }, sig);

  /* 键盘(PC 专属,9.9)。⚠ 绑在 shell 上不绑 window:地图是 modal 里的一块,
     绑 window 会在地图关掉后仍然吃掉宿主页的方向键。 */
  rt.shell.setAttribute('tabindex', '-1');
  rt.shell.addEventListener('keydown', e => {
    /* 抽屉开着时只接 Esc,方向键不推相机。 */
    if (!rt.setDrawer.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSettings(rt); }
      return;
    }
    if (!rt.books.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeBooks(rt); }
      return;
    }
    /* 卡开着时先接 Esc 并 stopPropagation:宿主 modal 的 Esc 监听在更外层,
       不截住就会连地图那层 modal 一起关掉。方向键同样不许漏下去推相机。 */
    if (rt.card) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePlaceCard(rt); }
      return;
    }
    const step = 90;
    if (e.key === 'ArrowLeft') { rt.cam.x += step; clampCam(rt); applyCam(rt); }
    else if (e.key === 'ArrowRight') { rt.cam.x -= step; clampCam(rt); applyCam(rt); }
    else if (e.key === 'ArrowUp') { rt.cam.y += step; clampCam(rt); applyCam(rt); }
    else if (e.key === 'ArrowDown') { rt.cam.y -= step; clampCam(rt); applyCam(rt); }
    else if (e.key === '+' || e.key === '=') zoomAt(rt, vw(rt) / 2, vh_(rt) / 2, ZSTEP);
    else if (e.key === '-' || e.key === '_') zoomAt(rt, vw(rt) / 2, vh_(rt) / 2, 1 / ZSTEP);
    else if (e.key === 'Home') { e.preventDefault(); goHome(rt); }
    else return;
    e.preventDefault();
  }, sig);

  /* 12-21 prefers-reduced-motion 直接落最低档并锁档,不另写一套关动画的规则。 */
  const rm = __win.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (rm) {
    rt.reduceMotion = !!rm.matches;
    if (rt.reduceMotion) applyPerfTier(rt);
    rm.addEventListener?.('change', ev => {
      rt.reduceMotion = !!ev.matches;
      applyPerfTier(rt);
    }, sig);
  }

  /* 用 ResizeObserver 而不是 window.resize:modal 宽度会因内容变化改,而视口没动。
     回调里连同尺寸缓存一起刷。 */
  if (typeof ResizeObserver !== 'undefined') {
    rt.ro = new ResizeObserver(() => {
      rt.vwNow = rt.view.clientWidth; rt.vhNow = rt.view.clientHeight;
      clampCam(rt); applyCam(rt);
    });
    rt.ro.observe(rt.view);
  } else {
    __win.addEventListener('resize', () => {
      rt.vwNow = rt.view.clientWidth; rt.vhNow = rt.view.clientHeight;
      clampCam(rt); applyCam(rt);
    }, sig);
  }
}
function toggleAlt(rt: MapRT, a: string): void {
  rt.altFocus = rt.altFocus === a ? '' : a;   // 再点同一带 = 解锁
  setAltFocus(rt, rt.altFocus);
}
async function onAct(rt: MapRT, act: string): Promise<void> {
  if (act === 'zin') { zoomAt(rt, vw(rt) / 2, vh_(rt) / 2, ZSTEP); return; }
  if (act === 'zout') { zoomAt(rt, vw(rt) / 2, vh_(rt) / 2, 1 / ZSTEP); return; }
  if (act === 'home') { goHome(rt); return; }
  if (act === 'list') {
    /* 列表视图 = 现有 modal 原样。⚠ 它走**一级** modal 而地图在二级 ——
       不先退二级,列表会开在地图那层遮罩底下(看着像"渲染在地图下方")。
       退二级会连带触发 destroyMap:观察器盯的就是壳被摘走或被藏。 */
    closeAllModal2();
    openLocationsModal();
    return;
  }
  if (act === 'settings') { toggleSettings(rt); return; }
  if (act === 'books') { toggleBooks(rt); return; }
  if (act === 'tags') { toggleTagPop(rt); return; }
  if (act === 'edit') { closeSettings(rt); rt.view.classList.add('edit'); return; }
  if (act === 'eddone') { rt.view.classList.remove('edit'); return; }
  if (act === 'edreset') {
    const { thConfirm } = await import('../../lib/world/ui-kit');
    const ok = await thConfirm({ title: '重置坐标', message: '把所有地点的位置放回种子表?拖过的微调会丢。' });
    if (!ok) return;
    clearPlacePos();
    thToast('坐标已回到种子', 'success');
    remount();
  }
}

/* ===================== 9 G 36 顶栏搜索 + 标签筛选 ===================== */
function matchNode(q: string): MapNode | undefined {
  const s = q.toLowerCase();
  for (const p of mapNodes()) {
    if (p.short.toLowerCase().includes(s) || p.full.toLowerCase().includes(s) ||
        (p.aka && p.aka.toLowerCase().includes(s)) || p.wb.toLowerCase().includes(s)) return p;
  }
  return undefined;
}
function flashNode(rt: MapRT, id: string): void {
  for (const k of Object.keys(rt.nodeEls)) rt.nodeEls[k].classList.remove('flash');
  const el = rt.nodeEls[id]; if (!el) return;
  el.classList.add('flash');
  clearTimeout(rt.flashT);
  rt.flashT = __win.setTimeout(() => { if (RT === rt) el.classList.remove('flash'); }, 900);
}
/* 全部地点标签的并集,只读 item.tags —— 标签字典 location 桶是空的。 */
function allTags(): string[] {
  const items = getManagedItems('location');
  const seen: string[] = [];
  for (const k of Object.keys(items)) for (const t of items[k].tags || []) if (!seen.includes(t)) seen.push(t);
  return seen;
}
function toggleTagPop(rt: MapRT): void {
  if (!rt.tagpop.hidden) { rt.tagpop.hidden = true; return; }
  refreshTagPop(rt);
  rt.tagpop.hidden = false;
}
function refreshTagPop(rt: MapRT): void {
  const tags = allTags();
  const clear = rt.tagFilter ? `<button class="thm-tagchip on" data-tag-val="">清除</button>` : '';
  const chips = tags.map(t =>
    `<button class="thm-tagchip${rt.tagFilter === t ? ' on' : ''}" data-tag-val="${esc(t)}">${esc(t)}</button>`).join('');
  rt.tagpop.innerHTML = clear + (tags.length ? chips : '<span class="thm-tagchip empty">暂无标签</span>');
}
function pickTag(rt: MapRT, tag: string): void {
  rt.tagFilter = rt.tagFilter === tag ? '' : tag;
  applyFilter(rt);
  rt.tagpop.hidden = true;
}
/* 压暗不带该标签的节点。只用 class 改 opacity,节点仍可点(dim 不改只读)。 */
function applyFilter(rt: MapRT): void {
  const tf = rt.tagFilter;
  // 按节点取一次会把 localStorage 读 + v2 迁移映射跑 ~202 遍
  const items = tf ? getManagedItems('location') : null;
  for (const id of Object.keys(rt.nodeEls)) {
    const p = nodeById(id);
    let on = true;
    if (tf && p) {
      const { kind, name } = parseManagedEntryName(p.wb);
      const tags = kind === 'location' && name ? (items![name]?.tags || []) : [];
      on = tags.includes(tf);
    }
    rt.nodeEls[id].classList.toggle('thm-off', !on);
  }
}

/* ===================== 设置抽屉 ===================== */
function toggleSettings(rt: MapRT): void {
  if (rt.setDrawer.hidden) { closeBooks(rt); renderSettingsInto(rt); rt.setDrawer.hidden = false; }
  else closeSettings(rt);
}
function closeSettings(rt: MapRT): void { rt.setDrawer.hidden = true; }
function renderSettingsInto(rt: MapRT): void { rt.setDrawer.innerHTML = renderSettings(); }

function renderSettings(): string {
  const cfg = getMapCfg();
  const art = getMapArt();
  const on = (v: boolean) => (v ? 'checked' : '');
  const tierOpt = (v: MapCfg['perfTier'], label: string) =>
    `<option value="${v}"${String(cfg.perfTier) === String(v) ? ' selected' : ''}>${label}</option>`;
  const artRows = mapNodes().map(p => {
    const u = art[p.full] || '';
    const thumb = u
      ? `<img class="thm-set-thumb" src="${esc(u)}" alt="" onerror="this.className='thm-set-thumb thm-set-none'">`
      : `<span class="thm-set-thumb thm-set-none">未上色</span>`;
    const del = u ? `<button class="thm-set-btn danger" data-art="del" title="清空这张">清空</button>` : '';
    return `<div class="thm-set-art" data-art-key="${esc(p.full)}">
      ${thumb}<span class="thm-set-art-name" title="${esc(p.full)}">${esc(p.short)}</span>
      <button class="thm-set-btn" data-art="url" title="贴图片 URL">贴图</button>
      <button class="thm-set-btn" data-art="gen" title="AI 生成立绘">生成</button>${del}</div>`;
  }).join('');
  return `<div class="thm-set-head"><b>地图设置</b><button class="thm-set-btn" data-cfg-act="close" title="关闭">✕</button></div>
  <div class="thm-set-body">
    <div class="thm-set-sec">
      <div class="thm-set-label">世界</div>
      <div class="thm-set-row"><span>位置同步</span><em>移动即自动写「当前所处区域/具体位置/主角.位置」</em></div>
      <label class="thm-set-row"><input type="checkbox" data-cfg="confirmGo" ${on(cfg.confirmGo)}><span>前往细分</span><em>点前往弹「只改变量/兼顾/只注入」,关则默认兼顾</em></label>
    </div>
    <div class="thm-set-sec">
      <div class="thm-set-label">氛围</div>
      <label class="thm-set-row"><input type="checkbox" data-cfg="phaseSkin" ${on(cfg.phaseSkin)}><span>时辰皮肤</span><em>昼夜四相接色,关则定格白昼</em></label>
      <label class="thm-set-row"><input type="checkbox" data-cfg="breath" ${on(cfg.breath)}><span>呼吸</span><em>节点与云海的轻浮动画</em></label>
      <label class="thm-set-row"><input type="checkbox" data-cfg="weather" ${on(cfg.weather)}><span>天气层</span><em>按季节落雨雪薄纱</em></label>
      <label class="thm-set-row"><input type="checkbox" data-cfg="festival" ${on(cfg.festival)}><span>节庆挂彩</span><em>当日有节时相关地点挂灯笼</em></label>
    </div>
    <div class="thm-set-sec">
      <div class="thm-set-label">画质</div>
      <label class="thm-set-row"><span>地图档位</span><select data-cfg="perfTier">${tierOpt('auto', '自动')}${tierOpt(2, '高画质')}${tierOpt(1, '节能')}</select><em>手动选档锁定,节能关云海等重特效</em></label>
    </div>
    <div class="thm-set-sec">
      <div class="thm-set-label">布局</div>
      <div class="thm-set-actbar">
        <button class="thm-set-btn" data-cfg-act="edit">进入编辑模式</button>
        <button class="thm-set-btn" data-cfg-act="reset">重置坐标回种子</button>
      </div>
    </div>
    <div class="thm-set-sec">
      <div class="thm-set-label">立绘管理</div>
      <div class="thm-set-artlist">${artRows}</div>
    </div>
    <div class="thm-set-sec">
      <div class="thm-set-label">清空地图数据</div>
      <div class="thm-set-actbar thm-set-actbar-col">
        <button class="thm-set-btn danger" data-cfg-act="wipe-layout" title="保存的拖拽坐标">清空布局(坐标)</button>
        <button class="thm-set-btn danger" data-cfg-act="wipe-log">清空日志</button>
        <button class="thm-set-btn danger" data-cfg-act="wipe-art">清空立绘</button>
      </div>
    </div>
  </div>`;
}

/* ===================== 已开世界书总览 ===================== */
/* 只列**已开**的条目:未开的不显示(要开新的走地点卡上的开关)。
   ⚠ 列表扫真实世界书而不读 managedEntryStates —— 注册表只装 localStorage 登记过的地点,
     真实开着但未登记的条目不能从总览里漏掉。 */
type LocEntry = { book: string; uid: number; name: string; enabled: boolean };
async function scanLocEntries(): Promise<LocEntry[]> {
  const all = await loadInspectorEntries();
  const rows = all
    .filter(e => e.managedKind === 'location' && e.managedName)
    .map(e => ({ book: e.worldbookName, uid: e.entry.uid, name: e.managedName, enabled: !!e.entry.enabled }));
  /* 扫到的真实态回填缓存:注册表(localStorage)没登记的地点靠它才能显示对
     并被关掉。整表重建,陈旧名字要落回注册表判定。 */
  for (const k of Object.keys(wbReal)) delete wbReal[k];
  for (const r of rows) {
    const c = wbReal[r.name] || (wbReal[r.name] = { on: false, count: 0 });
    c.count++;
    if (r.enabled) c.on = true;
  }
  return rows;
}
async function scanOpenBooks(): Promise<LocEntry[]> {
  return (await scanLocEntries())
    .filter(e => e.enabled)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
}
/** 条目名(去前缀)→ 节点。节点 id 是**带前缀**的原条目名,不能直接拿 managedName 查。 */
function nodeByManagedName(): Record<string, MapNode> {
  const m: Record<string, MapNode> = {};
  for (const p of mapNodes()) {
    const { kind, name } = parseManagedEntryName(p.wb);
    if (kind === 'location' && name) m[name] = p;
  }
  return m;
}
function booksHtml(rows: LocEntry[]): string {
  const idx = nodeByManagedName();
  const list = rows.map(r => {
    const p = idx[r.name];
    const fly = p ? `<button class="thm-set-btn" data-bk="fly" title="在地图上定位">定位</button>` : '';
    return `<div class="thm-books-row" data-bk-book="${esc(r.book)}" data-bk-uid="${r.uid}" data-bk-name="${esc(r.name)}">
      <span class="thm-bm" data-st="on" aria-hidden="true"></span>
      <span class="thm-books-name" title="${esc(r.name)}">${esc(r.name)}</span>
      ${fly}<button class="thm-set-btn danger" data-bk="off" title="关闭这条世界书">关闭</button>
    </div>`;
  }).join('');
  const body = rows.length
    ? `<div class="thm-books-list">${list}</div>`
    : `<div class="thm-books-empty">还没有开着的地点世界书。<br>在地点卡右上角点「世界书」即可开启。</div>`;
  return `<div class="thm-set-head"><b>已开世界书 · ${rows.length}</b>
    <span class="thm-books-headbtns">
      ${rows.length ? `<button class="thm-set-btn danger" data-bk="offall" title="关闭全部地点世界书">全部关闭</button>` : ''}
      <button class="thm-set-btn" data-bk="close" title="关闭">✕</button>
    </span></div>
  <div class="thm-set-body">${body}</div>`;
}
function closeBooks(rt: MapRT): void { rt.books.hidden = true; }
function toggleBooks(rt: MapRT): void {
  if (!rt.books.hidden) { closeBooks(rt); return; }
  closeSettings(rt);
  rt.books.innerHTML = `<div class="thm-set-head"><b>已开世界书</b></div>
    <div class="thm-set-body"><div class="thm-books-empty">正在扫描世界书…</div></div>`;
  rt.books.hidden = false;
  void refreshBooks(rt);
}
async function refreshBooks(rt: MapRT): Promise<void> {
  let rows: LocEntry[];
  try { rows = await scanOpenBooks(); }
  catch (e) {
    void e;
    if (RT === rt) rt.books.innerHTML = `<div class="thm-set-head"><b>已开世界书</b>
      <span class="thm-books-headbtns"><button class="thm-set-btn" data-bk="close">✕</button></span></div>
      <div class="thm-set-body"><div class="thm-books-empty">读不到世界书,确认角色卡已绑定。</div></div>`;
    return;
  }
  if (RT !== rt || rt.books.hidden) return;
  rt.books.innerHTML = booksHtml(rows);
}
/* 容器级委托:内层 innerHTML 每次重渲染,监听只绑一次。 */
function bindBooks(rt: MapRT): void {
  rt.books.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest?.('[data-bk]') as HTMLElement | null;
    if (!btn) return;
    const act = btn.dataset.bk || '';
    if (act === 'close') { closeBooks(rt); return; }
    const row = btn.closest<HTMLElement>('.thm-books-row');
    if (act === 'fly' && row) {
      const p = nodeByManagedName()[row.dataset.bkName || ''];
      if (!p) { thToast('这条世界书在地图上没有对应地点', 'warn'); return; }
      closeBooks(rt);
      flashNode(rt, p.id);
      centerOn(rt, p.x, p.y, Math.max(rt.cam.s, 1.25), 520);
      return;
    }
    if (act === 'off' && row) {
      const book = row.dataset.bkBook || '';
      const uid = Number(row.dataset.bkUid);
      const name = row.dataset.bkName || '';
      /* 直接按 uid 落 enabled:false,不走 toggle —— toggle 读注册表算下一态,
         注册表漏登记这条时会把它反手开开。 */
      void (async () => {
        try { await updateInspectorEntry(book, uid, en => ({ ...en, enabled: false })); }
        catch (err) { void err; thToast('关闭失败', 'warn'); return; }
        await refreshManagedStatesAfterWorldbookEdit();
        await scanLocEntries();   // 先刷 wbReal:下面重画开关读的是它
        if (RT !== rt) return;
        thToast(`已关闭世界书:${name}`, 'success');
        applyBookmarkStates(rt);
        const cur = rt.card ? nodeById(rt.card.id) : null;
        if (cur) syncWbSwitch(rt, cur);
        void refreshBooks(rt);
      })();
      return;
    }
    if (act === 'offall') {
      void (async () => {
        const ok = await thConfirm({ title: '全部关闭', message: '关闭所有地点世界书条目?' });
        if (!ok || RT !== rt) return;
        await disableAllManagedWorldbookEntries('location');
        await scanLocEntries();   // 同上:先刷 wbReal 再重画
        if (RT !== rt) return;
        applyBookmarkStates(rt);
        const cur = rt.card ? nodeById(rt.card.id) : null;
        if (cur) syncWbSwitch(rt, cur);
        void refreshBooks(rt);
      })();
    }
  }, { signal: rt.ac.signal });
}

/* 抽屉内点按/变更统一委托:监听绑在容器上,innerHTML 每次重渲染也不丢。 */
function bindSettings(rt: MapRT): void {
  rt.setDrawer.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const artBtn = t.closest?.('[data-art]') as HTMLElement | null;
    if (artBtn) {
      const key = artBtn.parentElement?.dataset.artKey || '';
      if (!key) return;
      const act = artBtn.dataset.art || '';
      if (act === 'url') void (async () => {
        const url = await thPrompt({ title: '贴立绘 URL', value: artOf(key) || '' });
        if (url != null) { const v = url.trim(); if (v) setMapArt(key, v); }
        renderSettingsInto(rt);
      })();
      else if (act === 'gen') void (async () => {
        const seed = mapNodes().find(x => x.full === key);
        const prompt = seed ? `${seed.short}，${seed.env}` : key;
        thToast('生成中…', 'info');
        const r = await tryGenImage(prompt);
        if (r?.url) { setMapArt(key, r.url); thToast('已生成立绘', 'success'); }
        else thToast('没能生成(未配置或后端未就绪)', 'warn');
        renderSettingsInto(rt);
      })();
      else if (act === 'del') void (async () => {
        if (await thConfirm({ title: '清空立绘', message: `清空「${key}」的立绘?`, confirmText: '清空', danger: true })) setMapArt(key, '');
        renderSettingsInto(rt);
      })();
      return;
    }
    const actEl = t.closest?.('[data-cfg-act]') as HTMLElement | null;
    if (actEl) {
      switch (actEl.dataset.cfgAct) {
        case 'close': closeSettings(rt); break;
        case 'edit': closeSettings(rt); rt.view.classList.add('edit'); break;
        case 'reset': void (async () => {
          if (await thConfirm({ title: '重置坐标', message: '把所有地点的位置放回种子表?拖过的微调会丢。' })) {
            clearPlacePos(); thToast('坐标已回到种子', 'success'); closeSettings(rt); remount();
          }
        })(); break;
        case 'wipe-layout': void (async () => {
          if (await thConfirm({ title: '清空布局', message: '清空所有地点的拖拽坐标?', confirmText: '清空', danger: true })) {
            clearPlacePos(); thToast('布局(坐标)已清空', 'success'); closeSettings(rt); remount();
          }
        })(); break;
        case 'wipe-log': void (async () => {
          if (await thConfirm({ title: '清空日志', message: '清空全部地点日志?', confirmText: '清空', danger: true })) {
            clearMapLog(); thToast('日志已清空', 'success');
          }
        })(); break;
        case 'wipe-art': void (async () => {
          if (await thConfirm({ title: '清空立绘', message: '清空全部地点立绘?', confirmText: '清空', danger: true })) {
            clearMapArt(); renderSettingsInto(rt); thToast('立绘已清空', 'success');
          }
        })(); break;
      }
      return;
    }
  }, { signal: rt.ac.signal });
  rt.setDrawer.addEventListener('change', e => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const k = el.dataset.cfg;
    if (!k) return;
    const patch: Partial<MapCfg> = {};
    /* 模块跑 iframe、面板 DOM 落父页:instanceof 跨 window 恒 false,用 tagName 判型。 */
    if (el.tagName === 'SELECT') {
      const v = el.value;
      (patch as any)[k] = v === 'auto' ? 'auto' : Number(v);   // 存数字,避免与画质档比较反复踩串/数
    }
    else (patch as any)[k] = (el as HTMLInputElement).checked;
    setMapCfg(patch);
    if (k === 'perfTier' || k === 'phaseSkin' || k === 'breath' || k === 'weather' || k === 'festival') applyVisualCfg(rt);
  }, { signal: rt.ac.signal });
}

/* ===================== 取景 ===================== */
/* 开图直接落座,不演入场。有存档用存档(12-20 跨刷新保留),
   没有就按包围盒取景 —— 与 Home 归位同一口算法,两处不许各算一遍。 */
function seatCamera(rt: MapRT, cam?: { x: number; y: number; s: number }): void {
  if (cam && typeof cam.s === 'number') {
    rt.cam.x = cam.x; rt.cam.y = cam.y; rt.cam.s = cam.s;
  } else {
    const b = bbox(), ts = fitScale(rt);
    rt.cam.s = ts;
    rt.cam.x = vw(rt) / 2 - b.cx * ts;
    rt.cam.y = vh_(rt) / 2 - b.cy * ts;
  }
  clampCam(rt); applyCam(rt);
  /* ⚠ `.ready` 是节点可见性总闸,**不许挂 rAF**:地图跑在常 0 尺寸/隐藏的 iframe,
     rAF 被暂停 ⇒ 节点全停在 opacity:0,开图只剩天幕和云。
     先 offsetWidth 逼出 style resolve 给过渡一个起点,再**同步**加类。 */
  void rt.shell.offsetWidth;
  rt.shell.classList.add('ready');
}

/* ===================== 单一拆卸口 + 幂等挂载 ===================== */
/* 本项目 modal 是"关了不卸",反复开关会泄漏 —— rAF / 监听 / RO / 轮询 / 定时器
   全部收在这一个函数里。 */
export function destroyMap(): void {
  const rt = RT;
  if (!rt) return;
  RT = null;
  if (rt.rafId) cancelAnimationFrame(rt.rafId);
  if (rt.camAnim) cancelAnimationFrame(rt.camAnim);
  if (rt.pollId) clearInterval(rt.pollId);
  if (rt.cardWait) clearTimeout(rt.cardWait);
  if (rt.card?.typer) clearInterval(rt.card.typer);   // 打字机是 setInterval,不在 timers 里
  for (const t of rt.timers) clearTimeout(t);
  rt.ro?.disconnect();
  rt.mo?.disconnect();
  rt.ac.abort();                       // 一次收掉全部 addEventListener
  if (rt.onVarUpdate) {
    try {
      (__win as unknown as { eventRemoveListener?: (n: string, f: () => void) => void })
        .eventRemoveListener?.('VARIABLE_UPDATE_ENDED', rt.onVarUpdate);
    } catch { /* 宿主没这个接口就只剩轮询,轮询本来是主力 */ }
  }
  rt.root.remove();
}
/* 幂等挂载:已有实例 —— 宿主同一份 DOM 还在就复用,否则先 destroy 再建。 */
function mountMap(host: HTMLElement): MapRT {
  if (RT && host.contains(RT.root)) return RT;
  destroyMap();
  flyNode = null;
  atmoKey = '';
  host.innerHTML = mapShellHtml();
  const root = host.querySelector<HTMLElement>('[data-thm-root="1"]');
  if (!root) throw new Error('[地图] 外壳挂载失败');
  const q = <T extends Element>(s: string): T => {
    const el = root.querySelector<T>(s);
    if (!el) throw new Error(`[地图] 缺少 ${s}`);
    return el;
  };
  const layout = getMapLayout();
  const rt: MapRT = {
    root,
    shell: root,
    view: q<HTMLElement>('[data-thm-view="1"]'),
    world: q<HTMLElement>('[data-thm-world="1"]'),
    nodes: q<HTMLElement>('[data-thm-nodes="1"]'),
    gIsles: q<SVGElement>('[data-thm-isles="1"]'),
    gPaths: q<SVGElement>('[data-thm-paths="1"]'),
    cam: { x: 0, y: 0, s: 1 },
    vel: { x: 0, y: 0 },
    nodeEls: {}, cloudEls: [], clusterEls: {}, plateAt: {}, lblBox: {}, guideOf: {},
    cur: '', rawLoc: '', altFocus: '', tagFilter: '', flashT: 0,
    tier: 0, lockTier: false,
    fpsHist: [], lowStreak: 0, frames: 0, lastDegrade: 0, fpsShow: 0,
    slowRun: 0, perfTxt: '',
    lastT: performance.now(), lodAt: -1, reduceMotion: false, lastRaw: 'day',
    rafId: 0, pollId: 0, drag: null, dragCap: false, nodeDrag: null, camAnim: 0,
    ac: new AbortController(), ro: null, mo: null, timers: [], onVarUpdate: null,
    vwNow: 0, vhNow: 0,
    l3: q<HTMLElement>('[data-thm-l3="1"]'),
    setDrawer: q<HTMLElement>('[data-thm-set="1"]'),
    books: q<HTMLElement>('[data-thm-books="1"]'),
    tagpop: q<HTMLElement>('[data-thm-tagpop="1"]'),
    card: null, cardWait: 0, moved: 0,
  };
  RT = rt;
  rt.vwNow = rt.view.clientWidth; rt.vhNow = rt.view.clientHeight;
  /* 关闭有三条路(X / 点遮罩 / Esc)且都只是 display:none + 清 body,谁也不会通知我们;
     openModal2 换面板同样是直接换 innerHTML。所以盯"根被摘出文档"这一个共同结果。
     ⚠ 必须比 RT === rt:子弹窗关闭走 revive 会重建一个新实例,陈旧观察器不许拆掉新的那个。 */
  if (typeof MutationObserver !== 'undefined') {
    rt.mo = new MutationObserver(() => {
      if (RT !== rt) return;
      /* 两种"已经不在场"都要拆:根被摘走(清 body / 换面板),或壳只是被藏起来
         (closeAllModal2 只 display:none 不清 body)。rAF 是 per-document 的,
         藏起来照跑 ⇒ 只判 isConnected 会漏掉后者。 */
      const ovEl = rt.root.closest('.th-modal-overlay-2') as HTMLElement | null;
      if (!rt.root.isConnected || (ovEl && ovEl.style.display === 'none')) destroyMap();
    });
    rt.mo.observe(host, { childList: true });
    const ov = host.closest('.th-modal-overlay-2');
    if (ov) rt.mo.observe(ov, { attributes: true, attributeFilter: ['style'] });
  }
  /* 当前位置:先读 MVU,匹配不上就落到枢纽心(万花广场)当取景锚,胶囊仍显示原文。 */
  rt.rawLoc = readMvuLoc();
  const seed = rt.rawLoc ? matchSeed(rt.rawLoc) : undefined;
  rt.cur = seed ? seed.wb : '';    // 同上:节点 id 是 `w`
  buildClouds(rt);
  buildCradle(rt);
  lockStaticBreath(rt);
  renderIsles(rt);
  renderPaths(rt);
  renderNodes(rt);
  decorateCurrent(rt);
  paintRibbon(rt);
  bindEvents(rt);
  applyVisualCfg(rt);   // 10 画质/呼吸/时辰皮肤;reduceMotion 已在 bindEvents 里读好
  /* 书签绑定态靠世界书异步扫描好,先按回落画、扫完就地更新(9 G 35)。 */
  void safeRefreshManagedEntryStates('location').then(() => { if (RT === rt) applyBookmarkStates(rt); });
  measureLabels(rt);
  refreshLOD(rt, true);
  seatCamera(rt, layout.cam);
  /* 字体是本地字体,加载完宽度会变 ⇒ 重量一次再重排标签 */
  if (__doc.fonts?.ready) {
    void __doc.fonts.ready.then(() => {
      if (RT !== rt) return;                 // 已被 destroy,别对着卸掉的 DOM 排版
      measureLabels(rt); refreshLOD(rt, true);
    });
  }
  /* 9-B 双通道:轮询主力 + VARIABLE_UPDATE_ENDED 加速(事件跨不了 iframe,不能只靠它)。 */
  rt.pollId = __win.setInterval(() => syncCurrentFromMvu(rt), 1500);
  rt.onVarUpdate = () => { if (RT === rt) syncCurrentFromMvu(rt); };
  try {
    (__win as unknown as { eventOn?: (n: string, f: () => void) => void })
      .eventOn?.('VARIABLE_UPDATE_ENDED', rt.onVarUpdate);
  } catch { rt.onVarUpdate = null; }
  rt.rafId = requestAnimationFrame(t => loop(rt, t));
  return rt;
}

/* ===================== 入口 ===================== */
/* 顶栏「地点总览」的新落点。原 openLocationsModal 保留作列表视图与兜底。 */
export function openWorldMapModal(): void {
  openModal2('☁ 云海之上 · 地图', '<div class="th-map-stage" data-thm-host="1"></div>', {
    maxWidth: 'min(1420px,96vw)',
    revive: () => openWorldMapModal(),
  });
  const modal2 = qs2<HTMLElement>('.th-modal-2');
  modal2?.classList.add('th-map-host');
  const host = qs2<HTMLElement>('[data-thm-host="1"]') || qs<HTMLElement>('[data-thm-host="1"]');
  if (!host) { thToast('地图打开失败', 'error'); return; }
  try {
    mountMap(host);
  } catch (e) {
    console.error('[此间天地] mountMap error:', e);
    destroyMap();
    thToast('地图打开失败,已退回列表视图', 'error');
    openLocationsModal();
  }
}
/* 编辑模式重置坐标后原地重建:坐标改了,细胞/路网/标签全要重算。 */
function remount(): void {
  const host = RT?.root.parentElement;
  if (!host) return;
  destroyMap();
  try { mountMap(host); } catch (e) { console.error('[此间天地] remount error:', e); }
}
