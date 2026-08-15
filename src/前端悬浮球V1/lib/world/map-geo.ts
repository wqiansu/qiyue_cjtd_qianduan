// ============================================================================
// map-geo.ts — 版图几何:大陆轮廓 → 加权 Voronoi 细胞 → 节点摆位 → 路网
//
// 全程零随机(栅格抖动走定死 hash),同一份种子表恒出同一张图。纯计算,不碰 DOM。
// ============================================================================
import {
  MAP_SEED, MAP_REGION_LIST, HOME_SEED,
  type MapRegionId, type MapTier,
} from './map-seed';

/* 世界尺寸。⚠ 骨架三张表(J / CJ / BEND)是**世界像素硬坐标**,改这两个数就得同比改它们,
   以及 map-modal 的 MARGIN/pad 与 CSS 的 .thm-brd-gap。 */
export const WORLD_W = 3600;
export const WORLD_H = 1950;
const CX = WORLD_W / 2;
const CY = WORLD_H / 2;
/** 节点圈的竖向压扁系数。比岛台轮廓更扁 ⇒ 点不会从岛沿探头。 */
const YF = 0.62;
/** 岛台轮廓的竖向压扁系数。 */
const IYF = 0.64;

// ---------------------------------------------------------------- 大陆轮廓
/* 7.3:先定"一整片大陆长什么样",再把 Voronoi 裁进它 —— 海岸线要**设计出来**
   (带海湾/岬角的低频起伏),凸包做不出海湾。 */
function terraCX(): number { return WORLD_W / 2; }
function terraCY(): number { return WORLD_H / 2 + 10; }
function terraRX(): number { return WORLD_W * 0.435; }
function terraRY(): number { return WORLD_H * 0.415; }
/* 低频起伏:3 组不同频率/相位的正弦叠加。频率只许取个位数、振幅合计 ≤0.15 ——
   7.3 要的是"海湾 + 岬角"(低频、幅度小),频率一高就成锯齿。 */
function terraUnd(a: number): number {
  return 1 + 0.075 * Math.sin(3 * a + 0.7) + 0.045 * Math.sin(5 * a + 2.1) + 0.030 * Math.sin(2 * a - 1.2);
}
export function terraInside(x: number, y: number): boolean {
  const nx = (x - terraCX()) / terraRX(), ny = (y - terraCY()) / terraRY();
  return Math.hypot(nx, ny) <= terraUnd(Math.atan2(ny, nx));
}
export function terraOutline(n: number): Pt[] {
  const pts: Pt[] = [], cx = terraCX(), cy = terraCY(), rx = terraRX(), ry = terraRY();
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, f = terraUnd(a);
    pts.push([cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f]);
  }
  return pts;
}

// ---------------------------------------------------------------- 类型
export type Pt = [number, number];

export type MapRegionGeo = {
  id: MapRegionId;
  name: string;
  color: string;
  shape: string;
  desc: string;
  cx: number;
  cy: number;
};

export type MapCell = {
  /** 平滑后的外边界环(飞地那圈不含在内)。 */
  ring: Pt[];
  /** 面积质心。hub 级节点直接钉在这上面。 */
  ctr: { x: number; y: number };
  /** 内陆界的 path d(临海段已剪掉,那段归海岸线独占)。 */
  dInland: string;
  /** 内缩一档后的 path d,画双边线的第二条。 */
  dInset: string;
  /** 整环的 path d。 */
  d: string;
};

export type MapNode = {
  /** 节点 id = 种子表的 `w`(世界书条目名),3.1 保证全局唯一。发给模型的文本用 `full`。 */
  id: string;
  full: string;
  short: string;
  rg: MapRegionId;
  alt: string;
  tier: MapTier;
  x: number;
  y: number;
  /** 种子表给的坐标。x/y 会被玩家拖拽覆盖,这两个不动 —— 「重置坐标」要靠它回位。 */
  sx: number;
  sy: number;
  env: string;
  facil: string[];
  rules: string[];
  funcs: string[];
  /** 种子表四相原文(sc)。缺时 L3 用 env 兜底。 */
  sc?: [string, string, string, string];
  /** 主要景观短标签。 */
  sn?: string[];
  /** 独有物物件名。 */
  un?: string;
  aka: string;
  wb: string;
};

export type MapEdge = { a: string; b: string; kind: 'trunk' | 'local' };

const REGIONS: Record<string, MapRegionGeo> = {};
for (const r of MAP_REGION_LIST) {
  REGIONS[r.id] = { id: r.id, name: r.name, color: r.color, shape: r.shape, desc: r.desc, cx: 0, cy: 0 };
}

export function regionGeo(id: string): MapRegionGeo | undefined { return REGIONS[id]; }
export function allRegionGeo(): MapRegionGeo[] { return Object.keys(REGIONS).map(k => REGIONS[k]); }
export { IYF, YF };

// ---------------------------------------------------------------- 8 区块骨架
/* 手写分割:内陆接点给世界像素;海岸接点只给「撞哪条岸、在哪个坐标上」,由 coastAngle
   在轮廓上二分求参数角 ⇒ 严格落在海岸线上。区界一律写成链,相邻两区共用同一条(一正一反),
   双边线两侧口径才能一致。 */
const J: Record<string, Pt> = {
  A: [1330, 582],   // 谪仙|葬花|枢纽
  B: [803, 1000],   // 谪仙|邀月|枢纽
  C: [1239, 1446],  // 邀月|枢纽|凝霜
  D: [2358, 630],   // 葬花|听风|学园
  E: [2643, 1077],  // 听风|飞雪|学园
  F: [2358, 1446],  // 学园|飞雪|凝霜
  G: [1731, 601],   // 葬花|枢纽|学园 —— G/H 的 x 由「中间一格对半开」定
  H: [1731, 1446],  // 枢纽|学园|凝霜
};
/** 海岸接点。南北岸的 at 给 x,东西岸给 y。 */
const CJ: Record<string, { side: 'n' | 's' | 'e' | 'w'; at: number }> = {
  nzx: { side: 'n', at: 1315 }, ntf: { side: 'n', at: 2358 },
  etf: { side: 'e', at: 1058 }, sfx: { side: 's', at: 2358 },
  sns: { side: 's', at: 1239 }, wyy: { side: 'w', at: 1000 },
};
/* 链的弯点(两端接点之外)。一条链最多一个 —— 7.1③ 每段边界只许一处起伏。 */
const BEND: Record<string, Pt> = {
  'A-B': [1083, 812], 'B-C': [1039, 1206], 'A-G': [1535, 576], 'G-D': [2050, 592],
  'G-H': [1769, 1024], 'C-H': [1489, 1426], 'H-F': [2049, 1422], 'D-E': [2472, 1038],
  'E-F': [2515, 1273], 'A-nzx': [1338, 366], 'D-ntf': [2342, 410], 'E-etf': [2996, 1041],
  'F-sfx': [2372, 1598], 'C-sns': [1225, 1618], 'B-wyy': [616, 1015],
};
/* 每区的环 = 按序拼接的链。'~' 反向走,'>' 是海岸段(沿轮廓参数角递减)。
   ⚠ 改骨架先数两件事:每条内陆链在全表里正好两次,每段海岸正好一次。 */
const RINGS: Record<string, string[]> = {
  zx: ['A-nzx', '>nzx-wyy', '~B-wyy', '~A-B'],
  zh: ['~A-nzx', 'A-G', 'G-D', 'D-ntf', '>ntf-nzx'],
  tf: ['~D-ntf', 'D-E', 'E-etf', '>etf-ntf'],
  fx: ['~E-etf', 'E-F', 'F-sfx', '>sfx-etf'],
  ns: ['~F-sfx', '~H-F', '~C-H', 'C-sns', '>sns-sfx'],
  yy: ['~C-sns', '~B-C', 'B-wyy', '>wyy-sns'],
  hub: ['A-G', 'G-H', '~C-H', '~B-C', '~A-B'],
  xj: ['G-D', 'D-E', 'E-F', '~H-F', '~G-H'],
};
function outlineAt(a: number): Pt {
  const f = terraUnd(a);
  return [terraCX() + Math.cos(a) * terraRX() * f, terraCY() + Math.sin(a) * terraRY() * f];
}
/* 海岸接点 → 轮廓参数角。四条岸各取一段单调区间二分:南北岸 x 随 a 单调,东西岸 y 随 a 单调。 */
function coastAngle(side: 'n' | 's' | 'e' | 'w', at: number): number {
  const P = Math.PI;
  const RNG: Record<string, [number, number]> = {
    n: [P, 2 * P], s: [0, P], e: [-P / 2, P / 2], w: [P / 2, 1.5 * P],
  };
  const ax = (side === 'n' || side === 's') ? 0 : 1;
  let [lo, hi] = RNG[side];
  const up = outlineAt(hi)[ax] > outlineAt(lo)[ax];
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if ((outlineAt(m)[ax] < at) === up) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}
const CANG: Record<string, number> = {};
const CPT: Record<string, Pt> = {};
for (const k of Object.keys(CJ)) {
  CANG[k] = coastAngle(CJ[k].side, CJ[k].at);
  CPT[k] = outlineAt(CANG[k]);
}
const PT = (k: string): Pt => J[k] || CPT[k];

/* 链 → 采样点(约每 60px 一个)。带弯点的走二次贝塞尔,并让曲线**过**弯点
   (控制点取 2M − 两端中点)⇒ BEND 里写的位移就是真实振幅,不用再折半心算。 */
function chainPts(name: string): Pt[] {
  const [k0, k1] = name.split('-');
  const p0 = PT(k0), p1 = PT(k1), m = BEND[name];
  const n = Math.max(4, Math.round(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 60));
  const qx = m ? 2 * m[0] - (p0[0] + p1[0]) / 2 : 0;
  const qy = m ? 2 * m[1] - (p0[1] + p1[1]) / 2 : 0;
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    if (!m) { out.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t]); continue; }
    out.push([u * u * p0[0] + 2 * u * t * qx + t * t * p1[0], u * u * p0[1] + 2 * u * t * qy + t * t * p1[1]]);
  }
  return out;
}
/* 海岸段:沿轮廓从 a0 走到 a1,一律**参数角递减** ⇒ 八个环同一旋向。 */
function coastArc(k0: string, k1: string): Pt[] {
  const a0 = CANG[k0];
  let a1 = CANG[k1];
  if (a1 > a0) a1 -= Math.PI * 2;
  const n = Math.max(6, Math.round((a0 - a1) / (Math.PI * 2) * 360));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) out.push(outlineAt(a0 + (a1 - a0) * (i / n)));
  return out;
}
/* 环 = 按 RINGS 的次序拼链。'~' 反向,'>' 海岸段。 */
function assembleRing(steps: string[]): { pts: Pt[]; coastal: boolean[] } {
  const pts: Pt[] = [], coastal: boolean[] = [];
  for (const s of steps) {
    let seg: Pt[], sea = false;
    if (s[0] === '>') { const [a, b] = s.slice(1).split('-'); seg = coastArc(a, b); sea = true; }
    else if (s[0] === '~') seg = chainPts(s.slice(1)).reverse();
    else seg = chainPts(s);
    /* 接点只留一次:后一段跳首点 ⇒ 接点的 coastal 归**前**一段。内陆链在前时接点算内陆,
       双边线因此画到岸边才收,不会提前断在接点前一个采样点上。 */
    for (let i = pts.length ? 1 : 0; i < seg.length; i++) { pts.push(seg[i]); coastal.push(sea); }
  }
  if (pts.length > 1) {
    const a = pts[0], b = pts[pts.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1) { pts.pop(); coastal.pop(); }
  }
  return { pts, coastal };
}
/** 点到环的最短距离。ownerKeyAt 在海岸采样误差带上的兜底判据。 */
function distToRing(px: number, py: number, ring: Pt[]): number {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = ring[j][0], ay = ring[j][1];
    const dx = ring[i][0] - ax, dy = ring[i][1] - ay, L2 = dx * dx + dy * dy || 1;
    let t = ((px - ax) * dx + (py - ay) * dy) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    best = Math.min(best, Math.hypot(px - (ax + dx * t), py - (ay + dy * t)));
  }
  return best;
}
/** 各环包围盒。ownerKeyAt 先按它排除,不然每次判点都是 8×环长次乘加。 */
const BB: Record<string, [number, number, number, number]> = {};

/** 点是否在环内(射线法):7.4 铁规"任何点不出自己细胞边界"的判定器。 */
export function ptInRing(x: number, y: number, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

/* 细胞环按给定中心点缩放到 f(0~1):给"内圈草地"用,保持有机轮廓只缩不变形。
   ctr 传细胞面积质心;别传区心 —— 六宫的区心在内环上,不是细胞中心。 */
export function shrinkRing(ring: Pt[], f: number, ctr: { x: number; y: number }): Pt[] {
  const cx = ctr.x, cy = ctr.y;
  return ring.map(p => [cx + (p[0] - cx) * f, cy + (p[1] - cy) * f] as Pt);
}

/* Catmull-Rom(张力 0.5,7.1③ 写死)折线→闭合平滑 path,直角变舒缓曲线 */
function smoothPath(pts: Pt[]): string {
  const n = pts.length; if (n < 3) return '';
  let d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += 'C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
  }
  return d + 'Z';
}

/* 开口折线的 Catmull-Rom(不闭合,不带 Z):海岸段被剪掉后剩下的是若干段内陆界 */
function smoothOpen(pts: Pt[]): string {
  const n = pts.length; if (n < 2) return '';
  if (n === 2) return 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1) + 'L' + pts[1][0].toFixed(1) + ' ' + pts[1][1].toFixed(1);
  let d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += 'C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
  }
  return d;
}

/* 多边形的面积与面积加权质心(带符号,绕向无关)。
   7.4① 的"hub 级摆在细胞几何中心"要的是这个,不是种子 —— 六宫的种子在内环上,
   细胞却朝海岸长,两者能差出一两百 px。 */
function ringArea(ring: Pt[]): number {
  let a = 0;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return a / 2;
}
function ringCentroid(ring: Pt[]): { x: number; y: number } {
  let a = 0, cx3 = 0, cy3 = 0;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f; cx3 += (ring[j][0] + ring[i][0]) * f; cy3 += (ring[j][1] + ring[i][1]) * f;
  }
  if (Math.abs(a) < 1e-9) return { x: ring[0][0], y: ring[0][1] };
  return { x: cx3 / (3 * a), y: cy3 / (3 * a) };
}

export type CellSystem = {
  cells: Record<string, MapCell & { coastal: boolean[]; area: number }>;
  smoothPath: (pts: Pt[]) => string;
  centroidOf: (k: string) => { x: number; y: number };
  ptInRing: (x: number, y: number, ring: Pt[]) => boolean;
  /** 真归属查询。环判定对嵌套不够 —— 飞地里的点同时也在枢纽外边界之内。 */
  ownerKeyAt: (x: number, y: number) => string | null;
};

/* 7.1 版图细胞化。必须排在 layout 之前:缺坐标的点回落到细胞质心。 */
function buildCells(): CellSystem {
  const owners = Object.keys(REGIONS).filter(k => k !== 'my');
  /* 世界坐标 → 辖区 id(海/界外返回 null)。八个环拼满大陆 ⇒ 命中哪个环就属哪个区。
     ⚠ 先按包围盒排除再做射线判定:审计每点要探 17 次,不排除就是 8×环长次乘加。
     大陆内却落不进任何环的点只出在海岸采样误差带(链的柔化与轮廓差半个采样步),
     兜底取"环离得最近"那个,不许返回 null —— 那会把沿海节点判成落在海里。 */
  function ownerKeyAt(x: number, y: number): string | null {
    if (!terraInside(x, y)) return null;
    for (const k of owners) {
      const b = BB[k];
      if (!b || x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (ptInRing(x, y, cells[k].ring)) return k;
    }
    let bk: string | null = null, bd = Infinity;
    for (const k of owners) {
      const d = distToRing(x, y, cells[k].ring);
      if (d < bd) { bd = d; bk = k; }
    }
    return bk;
  }
  function centroidOf(k: string): { x: number; y: number } { return { x: REGIONS[k].cx, y: REGIONS[k].cy }; }
  /* 环上取出"连续非海岸"的几段,各自平滑成开口 path。环是首尾相接的,
     所以从第一个海岸点起绕一圈切分;整环无海岸(内陆区)则直接给闭合环。 */
  function inlandPath(ring: Pt[], coastal: boolean[]): string {
    const n = ring.length;
    let start = -1;
    for (let i = 0; i < n; i++) if (coastal[i]) { start = i; break; }
    if (start < 0) return smoothPath(ring);
    let d = '', run: Pt[] = [];
    for (let j = 1; j <= n; j++) {
      const idx = (start + j) % n;
      if (coastal[idx]) {
        if (run.length >= 2) d += smoothOpen(run);
        run = [];
      } else run.push(ring[idx]);
    }
    if (run.length >= 2) d += smoothOpen(run);
    return d;
  }
  /* 环整体向内缩 t 像素(沿各点局部法线,不是"朝质心缩") —— 7.2 双边线的关键:
     相邻两细胞共用同一条界,各自沿整环画色线的话两条线严丝合缝地重合,
     中间那道糖霜白缝就无从可夹。各自缩进自己领地 t 像素,两条色线才真正分开 2t。
     ⚠ 必须走法线:"朝质心缩"在细长细胞的两端会几乎不动。 */
  function insetRing(ring: Pt[], t: number): Pt[] {
    const n = ring.length;
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { cx += ring[i][0]; cy += ring[i][1]; }
    cx /= n; cy /= n;
    const out: Pt[] = [];
    for (let j = 0; j < n; j++) {
      const p = ring[j], a = ring[(j - 1 + n) % n], b = ring[(j + 1) % n];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L, ny = dx / L;
      /* 定向必须自证(两个方向都试,取真正落在环内的那个),不许只靠"和质心的点积":
         极角排序出来的环局部次序带噪,切线近乎沿半径的点会让点积接近 0 ⇒ 判向翻错,
         那些点会被推到自己细胞外面。 */
      const p1: Pt = [p[0] + nx * t, p[1] + ny * t], p2: Pt = [p[0] - nx * t, p[1] - ny * t];
      const in1 = ptInRing(p1[0], p1[1], ring), in2 = ptInRing(p2[0], p2[1], ring);
      if (in1 && !in2) out.push(p1);
      else if (in2 && !in1) out.push(p2);
      else {
        // 两边都在(极窄处)或都不在(退化角):退回朝质心收,再不行就原地不动
        const rx2 = cx - p[0], ry2 = cy - p[1], rl = Math.hypot(rx2, ry2) || 1;
        const p3: Pt = [p[0] + rx2 / rl * t, p[1] + ry2 / rl * t];
        out.push(ptInRing(p3[0], p3[1], ring) ? p3 : p);
      }
    }
    return out;
  }

  const cells: Record<string, MapCell & { coastal: boolean[]; area: number }> = {};
  owners.forEach(k => {
    const ring = assembleRing(RINGS[k]);
    /* d = 闭合环(填色/AO/内圈用);dInland = 只剩内陆界的开口段(7.2 白缝走这条);
       dInset = 向内缩后的内陆界(色线走这条,和邻区的色线隔开一道缝)。
       临海那一段两者都剪掉,留给 7.3 的海岸线独占。
       内缩 3.0 ⇒ 两区色线心距 6.0,改它就得同步 .thm-brd-gap 的 8.25。 */
    const inset = insetRing(ring.pts, 3.0);
    const ctr = ringCentroid(ring.pts);
    REGIONS[k].cx = Math.round(ctr.x); REGIONS[k].cy = Math.round(ctr.y);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of ring.pts) {
      x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    }
    BB[k] = [x0, y0, x1, y1];
    cells[k] = {
      ring: ring.pts,
      coastal: ring.coastal,
      ctr,
      area: Math.abs(ringArea(ring.pts)),
      d: smoothPath(ring.pts),
      dInland: inlandPath(ring.pts, ring.coastal),
      dInset: inlandPath(inset, ring.coastal),
    };
  });
  REGIONS.my.cx = CX; REGIONS.my.cy = CY;
  return { cells, smoothPath, centroidOf, ptInRing, ownerKeyAt };
}

export const CELL_SYS: CellSystem = buildCells();

// ---------------------------------------------------------------- 节点摆位
/* 坐标一律由种子表 MAP_POS 手工给定,这里只落点。
   缺坐标的点落在本区细胞面积质心,由 audit:geo 报出来补数据,不在这儿算。 */
const PLACES: MapNode[] = [];

(function layout() {
  /* 泛区排在各宫之后入表:渲染层按数组序作画,泛区点该压在宫内点之上(7.4④)。 */
  const ordered = [...MAP_SEED].sort((a, b) => (a.region === 'my' ? 1 : 0) - (b.region === 'my' ? 1 : 0));
  for (const p of ordered) {
    const cell = CELL_SYS.cells[p.region];
    const fb = cell ? cell.ctr : { x: REGIONS[p.region].cx, y: REGIONS[p.region].cy };
    const x = Math.round(typeof p.px === 'number' ? p.px : fb.x);
    const y = Math.round(typeof p.py === 'number' ? p.py : fb.y);
    PLACES.push({
      id: p.wb, full: p.full, short: p.short, rg: p.region, alt: p.alt, tier: p.tier,
      x, y, sx: x, sy: y, env: p.env, facil: p.facil, rules: p.rules, funcs: p.funcs,
      sc: p.sc, sn: p.sn, un: p.un,
      aka: p.aka || '', wb: p.wb,
    });
  }
})();

// ---------------------------------------------------------------- 路网
/* 枢纽→各区主节点 + 六宫成环 + 区内最近邻树(7.5),全算出来,不手写。 */
const EDGES: MapEdge[] = [];

(function wire() {
  const rank: Record<string, number> = { hub: 0, main: 1, sub: 2 };
  function primary(k: string): MapNode | undefined {
    const list = PLACES.filter(p => p.rg === k);
    list.sort((a, b) => rank[a.tier] - rank[b.tier]);
    return list[0];
  }
  const hubP = primary('hub');
  Object.keys(REGIONS).forEach(k => {
    if (k === 'hub') return;
    const p = primary(k);
    if (hubP && p) EDGES.push({ a: hubP.id, b: p.id, kind: 'trunk' });
  });
  /* 六宫成环,让外圈也有横向路。顺序 = 外环上的实际相邻次序,照方位连,
     不能照字典序 —— 否则环线会横穿中央公共区。
     学园不在这个环里:它是嵌在公共区内部的飞地,对外只有"接枢纽"这一条。 */
  const ring: MapRegionId[] = ['fx', 'ns', 'yy', 'zx', 'zh', 'tf'];
  for (let i = 0; i < ring.length; i++) {
    const a = primary(ring[i]), b = primary(ring[(i + 1) % ring.length]);
    if (a && b) EDGES.push({ a: a.id, b: b.id, kind: 'trunk' });
  }
  // 区内:每个非主节点接到"已连通里最近的那个"= 最小生成树的贪心近似
  Object.keys(REGIONS).forEach(k => {
    const list = PLACES.filter(p => p.rg === k);
    if (list.length < 2) return;
    list.sort((a2, b2) => rank[a2.tier] - rank[b2.tier]);
    const done: MapNode[] = [list[0]];
    for (let j = 1; j < list.length; j++) {
      const p = list[j];
      let best = done[0], bd = Infinity;
      done.forEach(q => {
        const d = (p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y);
        if (d < bd) { bd = d; best = q; }
      });
      EDGES.push({ a: best.id, b: p.id, kind: 'local' });
      done.push(p);
    }
  });
})();

/* ---------------------------------------------------------------- home
   坐标在大陆外 75px 的东北海湾云海里。
   ⚠ x 不许超过节点 bbox 的东界:bbox 驱动入场取景与 Home 归位。
   ⚠ 必须排在 wire() 之后:进 wire 会因 tier:'hub' 抢走 primary('my')。 */
const HOME_XY = { x: 3093, y: 539 };
PLACES.push({
  id: HOME_SEED.wb, full: HOME_SEED.full, short: HOME_SEED.short,
  rg: HOME_SEED.region, alt: HOME_SEED.alt, tier: HOME_SEED.tier,
  x: HOME_XY.x, y: HOME_XY.y, sx: HOME_XY.x, sy: HOME_XY.y, env: HOME_SEED.env,
  facil: HOME_SEED.facil, rules: HOME_SEED.rules, funcs: HOME_SEED.funcs,
  aka: HOME_SEED.aka || '', wb: HOME_SEED.wb,
});
{
  /* 回家那条路。取枢纽档位最高的点当岸侧端点,和 wire() 的 primary 同一口径。 */
  const rank: Record<string, number> = { hub: 0, main: 1, sub: 2 };
  const hubP = PLACES.filter(p => p.rg === 'hub').sort((a, b) => rank[a.tier] - rank[b.tier])[0];
  if (hubP) EDGES.push({ a: hubP.id, b: HOME_SEED.wb, kind: 'trunk' });
}

/**
 * 全部节点。坐标已过 7.4 铁规校验。
 * ⚠ 返回的是内部数组本身,渲染层可以读、可以在拖拽时改 x/y,但**不要重排或增删**：
 *   EDGES 里存的是 id,顺序无关;而 7.4 的校验只在建表时跑过一次。
 */
export function mapNodes(): MapNode[] { return PLACES; }
export function mapEdges(): MapEdge[] { return EDGES; }
// 索引建一次：成员在建表后固定（见上「不要重排或增删」），存的是对象引用，
// 所以拖拽改 x/y 仍从索引里看得到。
const BY_ID = new Map<string, MapNode>(PLACES.map(p => [p.id, p]));
export function nodeById(id: string): MapNode | undefined { return BY_ID.get(id); }
export function nodesOfRegion(rg: string): MapNode[] { return PLACES.filter(p => p.rg === rg); }
