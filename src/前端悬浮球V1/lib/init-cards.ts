// 批次7 · 反馈5：初始卡片中间层（独立 localStorage，介于「实时卡片」与「世界书 [初始] 条目」之间）。
// 三层存储模型：
//   实时卡片(managed-store) ⟷ 初始卡片(本模块) ⟷ 世界书[初始·xxx]
// 初始卡片是一份独立的基线快照，玩家可在初始化管理里单独编辑、与上下两层各自读/写，互不串味。
// 严格向下兼容：仅新增 key _th_init_cards_v1，不动现有 managed/[初始·xxx]。
import type { ManagedItemV2, LinksGraph } from './managed-store';

const LS_INIT_CARDS = '_th_init_cards_v1';

// 初始卡片层覆盖的 7 个卡片 kind（与世界书 5 条目一一对应：地点/事件/DLC + 储藏间4子类）。
// 未分类 stash-uncategorized 与自定义 stash-custom-* 不进初始流（运行时桶，见 config 注释）。
export type InitCardKind = 'location' | 'event' | 'dlc' | 'stash-item' | 'stash-skill' | 'stash-status' | 'stash-clothing';
export const INIT_CARD_KINDS: InitCardKind[] = ['location', 'event', 'dlc', 'stash-item', 'stash-skill', 'stash-status', 'stash-clothing'];

// 整个初始卡片层：每 kind 一个 name→item 字典 + 关联图。
type InitCardsStore = {
  cards: Record<string, Record<string, ManagedItemV2>>;
  links: LinksGraph | null;
};

function emptyStore(): InitCardsStore {
  const cards: Record<string, Record<string, ManagedItemV2>> = {};
  for (const k of INIT_CARD_KINDS) cards[k] = {};
  return { cards, links: null };
}

function readStore(): InitCardsStore {
  try {
    const raw = localStorage.getItem(LS_INIT_CARDS);
    if (!raw) return emptyStore();
    const o = JSON.parse(raw);
    const base = emptyStore();
    if (o && typeof o === 'object') {
      if (o.cards && typeof o.cards === 'object') {
        for (const k of INIT_CARD_KINDS) if (o.cards[k] && typeof o.cards[k] === 'object') base.cards[k] = o.cards[k];
      }
      if (o.links && typeof o.links === 'object') base.links = o.links;
    }
    return base;
  } catch (e) { console.warn('[init-cards] 读取失败', e); return emptyStore(); }
}

function writeStore(s: InitCardsStore): void {
  try { localStorage.setItem(LS_INIT_CARDS, JSON.stringify(s)); } catch (e) { console.warn('[init-cards] 写入失败', e); }
}

// ==================== 卡片读写 ====================

export function getInitCards(kind: InitCardKind): Record<string, ManagedItemV2> {
  return readStore().cards[kind] || {};
}

export function getInitCardCount(kind: InitCardKind): number {
  return Object.keys(getInitCards(kind)).length;
}

// 整层替换某 kind 的初始卡片（用于「世界书→初始」「实时→初始(覆盖)」等场景）
export function setInitCards(kind: InitCardKind, map: Record<string, ManagedItemV2>): void {
  const s = readStore();
  s.cards[kind] = map;
  writeStore(s);
}

// 合并写入某 kind：同名覆盖，保留初始层独有的；返回 {added, updated}
export function mergeInitCards(kind: InitCardKind, map: Record<string, ManagedItemV2>): { added: number; updated: number } {
  const s = readStore();
  const cur = s.cards[kind] || {};
  let added = 0, updated = 0;
  for (const [name, item] of Object.entries(map)) {
    if (cur[name]) updated++; else added++;
    cur[name] = item;
  }
  s.cards[kind] = cur;
  writeStore(s);
  return { added, updated };
}

// 增量补入（同名跳过，保护初始层已有）；返回 {added, skipped}
export function fillInitCards(kind: InitCardKind, map: Record<string, ManagedItemV2>): { added: number; skipped: number } {
  const s = readStore();
  const cur = s.cards[kind] || {};
  let added = 0, skipped = 0;
  for (const [name, item] of Object.entries(map)) {
    if (cur[name]) { skipped++; continue; }
    cur[name] = item; added++;
  }
  s.cards[kind] = cur;
  writeStore(s);
  return { added, skipped };
}

export function deleteInitCard(kind: InitCardKind, name: string): void {
  const s = readStore();
  if (s.cards[kind]) { delete s.cards[kind][name]; writeStore(s); }
}

export function upsertInitCard(kind: InitCardKind, name: string, item: ManagedItemV2): void {
  const s = readStore();
  if (!s.cards[kind]) s.cards[kind] = {};
  s.cards[kind][name] = item;
  writeStore(s);
}

export function clearInitKind(kind: InitCardKind): void {
  setInitCards(kind, {});
}

// ==================== 关联图 ====================

export function getInitLinks(): LinksGraph | null {
  return readStore().links;
}
export function getInitLinksCount(): number {
  const g = readStore().links;
  if (!g) return 0;
  return Object.values(g.links).reduce((s, m) => s + Object.keys(m).length, 0);
}
export function setInitLinks(graph: LinksGraph | null): void {
  const s = readStore();
  s.links = graph;
  writeStore(s);
}

// ==================== 整包 ====================

// 整包导出/导入（反馈6d）用：拿到全部初始卡片层快照。
export function exportInitCardsSnapshot(): InitCardsStore {
  return readStore();
}
export function importInitCardsSnapshot(snap: Partial<InitCardsStore>): void {
  const base = emptyStore();
  if (snap && snap.cards) for (const k of INIT_CARD_KINDS) if (snap.cards[k]) base.cards[k] = snap.cards[k];
  if (snap && snap.links) base.links = snap.links;
  writeStore(base);
}

export const INIT_CARDS_LS_KEY = LS_INIT_CARDS;
