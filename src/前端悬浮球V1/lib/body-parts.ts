/** 人形图的部位槽位（自上而下，与视觉排布一致） */
export const BODY_SLOTS = [
  'head', 'neck', 'shoulder', 'chest', 'waist', 'hip',
  'groin', 'leg', 'foot', 'hand', 'arm',
] as const;
export type BodySlot = (typeof BODY_SLOTS)[number];

/** 槽位中文名（浮窗标题用） */
export const SLOT_LABEL: Record<BodySlot, string> = {
  head: '头部', neck: '颈部', shoulder: '肩部', chest: '胸部', waist: '腰腹',
  hip: '臀部', groin: '私处', leg: '腿部', foot: '足部', hand: '手部', arm: '手臂',
};

/** 层次：数字越小越外层，用于叠穿排序 */
export const LAYER_ORDER = ['最外层', '外层', '中层', '内层', '贴身'] as const;
export type PartLayer = (typeof LAYER_ORDER)[number];

/** 层次前缀 → 归一层次名。长词优先，避免「最外层」被「外层」抢先匹配 */
const LAYER_PATTERNS: readonly (readonly [string, PartLayer])[] = [
  ['最外层', '最外层'], ['最外', '最外层'],
  ['外层', '外层'], ['中层', '中层'],
  ['内层', '内层'], ['贴身', '贴身'], ['里层', '内层'],
];

/**
 * 部位词素 → 槽位。长词优先（'腰腹' 先于 '腰'、'躯干' 先于 '干'）。
 * 一个词素可映射多槽（跨区词），如 全身 → 胸+腰+腿。
 */
const MORPHEMES: readonly (readonly [string, readonly BodySlot[]])[] = [
  // —— 跨区词（先匹配，避免被单字词素切碎）——
  ['全身', ['chest', 'waist', 'leg']],
  ['身体', ['chest', 'waist', 'leg']],
  ['躯干', ['chest', 'waist']],
  ['上半身', ['chest']],
  ['下半身', ['waist', 'leg']],
  ['上身', ['chest']],
  ['下身', ['waist', 'leg']],
  ['上装', ['chest']],
  ['下装', ['waist', 'leg']],
  // —— 具体部位（长词优先）——
  ['腰腹', ['waist']],
  ['大腿', ['leg']],
  ['小腿', ['leg']],
  ['脚踝', ['foot']],
  ['手臂', ['arm']],
  ['手腕', ['hand']],
  ['头部', ['head']],
  ['面部', ['head']],
  ['耳', ['head']],
  ['头', ['head']],
  ['脸', ['head']],
  ['面', ['head']],
  ['发', ['head']],
  ['颈', ['neck']],
  ['脖', ['neck']],
  ['喉', ['neck']],
  ['肩', ['shoulder']],
  ['胸', ['chest']],
  ['乳', ['chest']],
  ['背', ['chest']],
  ['腹', ['waist']],
  ['腰', ['waist']],
  ['臀', ['hip']],
  ['私处', ['groin']],
  ['裆', ['groin']],
  ['阴', ['groin']],
  ['腿', ['leg']],
  ['膝', ['leg']],
  ['足', ['foot']],
  ['脚', ['foot']],
  ['袜', ['foot']],
  ['手', ['hand']],
  ['指', ['hand']],
  ['臂', ['arm']],
];

/** 复合部位分隔符：腿部与私处 / 腿部至脚部 / 颈部、胸口 */
const SPLIT_RE = /[与至和及、\/+＋]|以及/g;

/** 侧向 */
export type PartSide = 'left' | 'right' | 'both';

export interface ParsedPart {
  /** 归一后的层次，缺省 '贴身' */
  layer: PartLayer;
  /** 层次在 LAYER_ORDER 中的序号，0 最外 */
  layerIdx: number;
  /** 命中的槽位，去重后按 BODY_SLOTS 顺序 */
  slots: BodySlot[];
  /** 侧向，无左右描述时 'both' */
  side: PartSide;
  /** 原文，永远原样保留 */
  raw: string;
  /** 是否一个槽位都没命中 → 进「其他」托盘 */
  unknown: boolean;
}

/** 摘要分组：卡片上不画人形，只按「区域」聚成 chip，槽位太细会挤爆一行 */
export const GROUP_ORDER = ['头面', '颈胸', '腰腹', '私处', '腿足', '手臂', '其他'] as const;
export type PartGroup = (typeof GROUP_ORDER)[number];
const SLOT_GROUP: Record<BodySlot, PartGroup> = {
  head: '头面', neck: '颈胸', shoulder: '颈胸', chest: '颈胸',
  waist: '腰腹', hip: '腰腹', groin: '私处',
  leg: '腿足', foot: '腿足', hand: '手臂', arm: '手臂',
};
/** 取该部位的归属分组；扫不到槽位一律进「其他」，原文照挂不丢件 */
export function partGroup(p: ParsedPart): PartGroup {
  if (p.unknown) return '其他';
  for (const g of GROUP_ORDER) if (p.slots.some(s => SLOT_GROUP[s] === g)) return g;
  return '其他';
}

/** 从单个片段里扫槽位（长词优先，命中后从片段中挖掉避免重复计数） */
function scanSlots(seg: string): BodySlot[] {
  let rest = seg;
  const out: BodySlot[] = [];
  for (const [word, slots] of MORPHEMES) {
    if (!rest.includes(word)) continue;
    out.push(...slots);
    rest = rest.split(word).join('');
  }
  return out;
}

/**
 * 解析「穿着部位」原文 → 结构化槽位信息。
 * 纯函数、无副作用，任何输入都返回可用结果（不抛错、不猜测）。
 */
export function parsePart(raw: unknown): ParsedPart {
  const text = String(raw ?? '').trim();

  // 1. 剥层次前缀（可出现在任意位置，如「腰部外层」）
  let layer: PartLayer = '贴身';
  let body = text;
  for (const [pat, norm] of LAYER_PATTERNS) {
    if (body.includes(pat)) {
      layer = norm;
      body = body.split(pat).join('');
      break;
    }
  }

  // 2. 侧向
  let side: PartSide = 'both';
  if (/左/.test(body)) side = 'left';
  else if (/右/.test(body)) side = 'right';

  // 3. 拆复合 → 逐段扫词素
  const segs = body.split(SPLIT_RE).map(s => s.trim()).filter(Boolean);
  const hit = new Set<BodySlot>();
  for (const seg of (segs.length ? segs : [body])) {
    for (const s of scanSlots(seg)) hit.add(s);
  }

  // 4. 按 BODY_SLOTS 固定顺序输出，便于渲染稳定
  const slots = BODY_SLOTS.filter(s => hit.has(s));

  return {
    layer,
    layerIdx: LAYER_ORDER.indexOf(layer),
    slots,
    side,
    raw: text,
    unknown: slots.length === 0,
  };
}
