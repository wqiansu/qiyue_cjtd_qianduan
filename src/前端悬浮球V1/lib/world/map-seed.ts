// ============================================================================
// map-seed.ts — 地图种子表的类型层与索引（数据本体在 map-seed.data.js）
//
// 数据本体是 .js：这里只套类型 + 建索引，不复制任何文本。
//
// 纪律：
//   - 注入与匹配一律用 full（全名）。short 只画在节点上，不参与任何比较。
//   - 长文只留在世界书，代码里只有短标签 + 一句 env。
//   - 坐标不在种子表里，由 map-layout 依 region/tier 排布 + 拖拽微调后落 localStorage。
// ============================================================================
import { MAP_PLACES, MAP_POS, MAP_REGIONS } from './map-seed.data.js';

/** 层级：常规层 / 悬浮层 / 极高空 / 地下·下层 / 边缘·异空间。 */
export type MapAlt = 'ground' | 'float' | 'high' | 'under' | 'edge';
/** 节点档位：枢纽 / 宫殿主场 / 普通。决定节点大小与标签抢位优先级（8.5）。 */
export type MapTier = 'hub' | 'main' | 'sub';
export type MapRegionId = 'hub' | 'zx' | 'tf' | 'yy' | 'fx' | 'zh' | 'ns' | 'xj' | 'my';
/** 方位锚的取值。参照系是世界心，不是本宫（宫内相对方位见 MapLocalDir）。 */
export type MapDir = 'C' | 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW';
/** 宫内相对方位锚。参照系是**本宫细胞的面积质心**。没有 C —— 居中由 rd:'in' 表达。 */
export type MapLocalDir = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW';
/** 径向深浅锚：质心→细胞边界这条轴上的三档。与 dl 正交（「东侧」和「最深处」是两回事）。 */
export type MapRadial = 'in' | 'mid' | 'out';

export type MapRegion = {
  id: MapRegionId;
  name: string;
  /** 辖区色。只允许出现在节点小色标与浮岛描边（1~2px）上（8.1a）。 */
  color: string;
  cx: number;
  cy: number;
  shape: string;
  desc: string;
};

export type MapPlaceSeed = {
  /** 全名。注入 MVU、匹配当前位置、开世界书条目，全都用这个。 */
  full: string;
  /** 节点显示用短名（2~5 字）。纯展示，绝不参与匹配。 */
  short: string;
  region: MapRegionId;
  alt: MapAlt;
  tier: MapTier;
  /** 一句环境定场，由世界书的「位置 + 主要景观」压出来。 */
  env: string;
  facil: string[];
  rules: string[];
  funcs: string[];
  /** 时段景象四相(晨昼昏夜)。缺时 L3 用 env 兜底。 */
  sc?: [string, string, string, string];
  /** 主要景观短标签。舞台带「看」,只配观察动词。 */
  sn?: string[];
  /** 独有物物件名。舞台带最重那一枚。 */
  un?: string;
  /** 世界书条目名，前往此地时开这条。 */
  wb: string;
  /** 别名/副标题，可选。 */
  aka?: string;
  /** 泛区地点压在哪两个辖区的共边线上（3.1 可选字段）。不填则按几何就近 + 容量配额分配。 */
  lk?: [MapRegionId, MapRegionId];
  /** 方位锚，参照系是世界心。只有 env 给了世界级方位说法的点才有（口径见 .data.js 头部）。 */
  dir?: MapDir;
  /** 宫内方位锚，参照系是本宫细胞质心。与 dir 是两个参照系，可同时存在。 */
  ldir?: MapLocalDir;
  /** 径向深浅锚。与 ldir 正交。 */
  radial?: MapRadial;
  /** 手工定位坐标（世界像素）。来自 MAP_POS，填了就直接用：不进挑点、不进松弛。 */
  px?: number;
  py?: number;
};

const RAW_PLACES = MAP_PLACES as ReadonlyArray<{
  n: string; s: string; r: string; a: string; t: string; e: string;
  f: string[]; u: string[]; c: string[]; w: string; k?: string;
  lk?: [string, string]; d?: string; dl?: string; rd?: string;
  sc?: string[]; sn?: string[]; un?: string;
}>;

const POS = MAP_POS as Readonly<Record<string, number[]>>;

export const MAP_REGION_LIST: ReadonlyArray<MapRegion> = MAP_REGIONS as ReadonlyArray<MapRegion>;

export const MAP_SEED: ReadonlyArray<MapPlaceSeed> = RAW_PLACES.map(p => ({
  full: p.n,
  short: p.s,
  region: p.r as MapRegionId,
  alt: p.a as MapAlt,
  tier: p.t as MapTier,
  env: p.e,
  facil: p.f,
  rules: p.u,
  funcs: p.c,
  sc: p.sc && p.sc.length === 4 ? (p.sc as [string, string, string, string]) : undefined,
  sn: p.sn,
  un: p.un,
  wb: p.w,
  aka: p.k,
  lk: p.lk ? [p.lk[0] as MapRegionId, p.lk[1] as MapRegionId] : undefined,
  dir: p.d as MapDir | undefined,
  ldir: p.dl as MapLocalDir | undefined,
  radial: p.rd as MapRadial | undefined,
  px: POS[p.n]?.[0],
  py: POS[p.n]?.[1],
}));

/** MAP_POS 里对不上任何全名的键。审计用:改名会让坐标静默失效。 */
export function orphanPosKeys(): string[] {
  const names = new Set(RAW_PLACES.map(p => p.n));
  return Object.keys(POS).filter(k => !names.has(k));
}

/**
 * 主角家。**不在种子表之列**，单列在这而不并入 `.data.js` 的 MAP_PLACES。
 * `r:'my'` 是因为它不归任何宫管，且九款顶饰按九个辖区键一对一画，加第十个键会画不出顶饰。
 * 五个内部房间留待室内平面，这层只要这一枚。
 */
export const HOME_SEED: MapPlaceSeed = {
  full: '云顶仙居', short: '云顶仙居', region: 'my', alt: 'float', tier: 'hub',
  env: '云海之上的多层错落宅邸，通体暖白玉石与单向透视水晶，屋顶是流线型空中花园。',
  facil: ['顶层主卧', '下沉式连廊客厅', '开放式厨房与长桌餐厅', '衣帽间', '云雾汤池'],
  rules: ['单向结界隔绝外界视线', '无围墙', '主卧无房门与隔断', '全屋云绒地毯'],
  funcs: ['疗养憩眠', '汤泉净体', '宴饮甜点', '妆造试衣', '亲密独处'],
  wb: '[DLC]云顶仙居_家', aka: '家',
};

const BY_FULL = new Map<string, MapPlaceSeed>(MAP_SEED.map(p => [p.full, p]));
const BY_REGION = new Map<MapRegionId, MapPlaceSeed[]>();
for (const p of MAP_SEED) {
  const arr = BY_REGION.get(p.region);
  if (arr) arr.push(p);
  else BY_REGION.set(p.region, [p]);
}

export function regionOf(id: string): MapRegion | undefined {
  return MAP_REGION_LIST.find(r => r.id === id);
}

export function placesOfRegion(id: MapRegionId): ReadonlyArray<MapPlaceSeed> {
  return BY_REGION.get(id) ?? [];
}

/** 精确取地点。只认全名。 */
export function seedOf(full: string): MapPlaceSeed | undefined {
  const s = String(full || '').trim();
  return s === HOME_SEED.full ? HOME_SEED : BY_FULL.get(s);
}

/**
 * 从 MVU 写下的位置串里认地点。MVU 里可能是「星见丘学园海滨浴场」这类带前缀的写法，
 * 也可能只是短名，所以做三级回退：全名精确 → 全名被包含 → 短名精确。
 * 一律返回种子（含全名），调用方拿到后仍用 full 去注入，不要拿 MVU 原串（8.5）。
 */
export function matchSeed(loc: string): MapPlaceSeed | undefined {
  const s = String(loc || '').trim();
  if (!s) return undefined;
  if (s === HOME_SEED.full) return HOME_SEED;
  const hit = BY_FULL.get(s);
  if (hit) return hit;
  /* home 一起参与"被包含"这级:MVU 初始值是「云顶仙居顶层主卧」,
     全名精确对不上,靠这一级才认得出。 */
  let best: MapPlaceSeed | undefined;
  for (const p of MAP_SEED) {
    if (s.includes(p.full) && (!best || p.full.length > best.full.length)) best = p;
  }
  if (s.includes(HOME_SEED.full) && (!best || HOME_SEED.full.length > best.full.length)) best = HOME_SEED;
  if (best) return best;
  return s === HOME_SEED.short ? HOME_SEED : MAP_SEED.find(p => p.short === s);
}
