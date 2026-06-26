//批次2 · 任务2 可视化编辑器（init-visual-editor）。
// 在 init-manager板 5 个条目行各加「可视化编辑」按钮，点击打开 modal，按卡片网格可视化增删改，
// 确认后重新序列化写回世界书条目 content —— 不触碰 localStorage managed 卡片，不污染运行时数据，
// 格式由严格序列化保证合法（用户不会因手写 JSON 出错）。
// 反馈修复（2026-06-24）：
//   ① 储藏间卡片去掉 links 关联字段（储藏间 bindsWorldbook:false、与关联图无关，原为错误耦合）。
//   ② 储藏间4类 desc 实际是结构化 JSON（见 stash-modal addManagedItem / getDefaultEntry），
//      可视化按 kind 把变量字段拆成独立输入框（物品/技能/状态/衣物），未分类走简单 name+flat 文本 desc。
//   ③ 占位字灰白 + 每卡片「复制」按钮（插入同值副本）。
//   location/event/dlc 卡片仍保留 links（这三类有关联是合理的），desc 是纯文本不拆变量。
//   links kind 卡片保持 node 网格（name + 3 CSV）不变。
// 命令式 innerHTML + openModal2 + data 性委托（同 init-manager），不引 Vue。
// 严格向下兼容：不改条目名、不改 localStorage key、不破坏现有函数签名；本编辑器是「编辑」按钮的可视化补充，原 wb-inspector 文本编辑入口保留。
// ================================================================
import {
  INITIAL_ENTRY_NAMES,
  type ManagedKind,
} from '../lib/config';
import { qs, qsa, esc, escAttr, __doc } from '../lib/dom-utils';
import { safeGetWorldbook, safeUpdateWorldbookWith } from '../lib/tavern-api';
import { openModal2, closeModal2 } from '../status-bar-init';
import { getCharWorldbookList } from './managed-modal';
import { createInitialWorldbookEntry } from './stash-io';
import { parseLinksGraph } from './links-init';
import { getManagedItems } from '../lib/managed-store';

type VKey = 'location' | 'event' | 'dlc' | 'stash' | 'links';
const VKEY_LABEL: Record<VKey, string> = {
  location: '地点', event: '事件', dlc: 'DLC', stash: '储藏间', links: '关联图',
};

// 储藏间固定 4 kind + 未分类（与 config/managed-store 一致；uncategorized 无变量绑定，走简单结构）
const STASH_KIND_ORDER: ManagedKind[] = ['stash-item', 'stash-skill', 'stash-status', 'stash-clothing', 'stash-uncategorized'];
const STASH_KIND_LABEL: Record<string, string> = {
  'stash-item': '物品', 'stash-skill': '技能', 'stash-status': '状态', 'stash-clothing': '衣物', 'stash-uncategorized': '未分类',
};

// 储藏间各 fixed kind 的结构化字段口径（与 status-bar-init.getDefaultEntry + MVU schema 脚本一致）
type FieldSpec = {
  order: string[];               // 字段顺序（不含名称）
  num: Set<string>;              // 数字字段
  enum_: Record<string, string[]>; // 下拉枚举字段
  long: Set<string>;             // 长文本（textarea）字段
};
const STASH_FIELD_SPEC: Partial<Record<ManagedKind, FieldSpec>> = {
  'stash-item': { order: ['数量', '简介', '效果', '评价'], num: new Set(['数量']), enum_: {}, long: new Set(['简介', '效果', '评价']) },
  'stash-skill': { order: ['等级', '简介', '效果', '评价'], num: new Set(['等级']), enum_: {}, long: new Set(['简介', '效果', '评价']) },
  'stash-status': { order: ['效果', '来源', '持续时间'], num: new Set(), enum_: {}, long: new Set(['效果']) },
  'stash-clothing': {
    order: ['穿着部位', '穿着情况', '破损状态', '外观详情', '衣物状态', '评价'],
    num: new Set(),
    enum_: { '穿着情况': ['穿着', '脱下'], '破损状态': ['完好无缺', '轻微破损', '中度破损', '严重破坏'] },
    long: new Set(['外观详情', '衣物状态', '评价']),
  },
};

// 是否为"结构化卡片"kind（fixed 四类）；未分类 + 自定义 kind 走 flat。
function isStructuredKind(kind: string): boolean {
  return kind === 'stash-item' || kind === 'stash-skill' || kind === 'stash-status' || kind === 'stash-clothing';
}

// 可视化卡片
// - 结构化（stash 四类）：fields 为变量字段映射（desc 存 JSON.stringify(fields)）
// - 纯文本（location/event/dlc/stash-uncategorized/自定义）：descFlat 为 desc 纯文本
// - location/event/dlc：另含 links（关联）— links kind 用 VLinkNode
type VCard = {
  name: string;
  tags: string[];
  inject?: string;
  descFlat?: string;              // 纯文本 desc（location/event/dlc/uncategorized/自定义）
  fields?: Record<string, string | number>; // 结构化字段（stash 四类）
  links?: { locations?: string[]; events?: string[]; dlcs?: string[] }; // 仅 location/event/dlc
};
type VLinkNode = { name: string; locations: string[]; events: string[]; dlcs: string[] };

type VEntry = { book: string; uid: number; content: string };

type VBuffer = {
  key: VKey;
  entryName: string;
  entry: VEntry;
  groups: Record<string, VCard[]>;
  linkNodes: Record<'location' | 'event' | 'dlc', VLinkNode[]>;
};

// ==================== 入口 ====================

async function locateEntry(entryName: string): Promise<VEntry | null> {
  const books = getCharWorldbookList();
  if (!books.length) return null;
  let fallback: VEntry | null = null;
  for (const book of books) {
    try {
      const es = await safeGetWorldbook(book);
      const f = es.find(e => e && e.name === entryName);
      if (f) {
        const ins: VEntry = { book, uid: Number(f.uid), content: f.content || '' };
        if ((ins.content || '').trim()) return ins;
        if (!fallback) fallback = ins;
      }
    } catch (e) { console.warn('[init-visual-editor] 读取世界书失败', book, e); }
  }
  return fallback;
}

export async function openVisualEditor(key: VKey): Promise<void> {
  const entryName = INITIAL_ENTRY_NAMES[key];
  const entry = await locateEntry(entryName);
  if (!entry) { toastr?.warning?.(`未找到 ${entryName} 条目（可先用「写入」创建）`); return; }
  const buf = parseBuffer(key, entryName, entry);
  if (!buf) { toastr?.error?.(`${entryName} 内容解析失败，无法可视化编辑（请用「编辑」文本模式修正格式）`); return; }
  openVisualModal(buf);
}

// ==================== 解析 ====================

function parseBuffer(key: VKey, entryName: string, entry: VEntry): VBuffer | null {
  const buf: VBuffer = { key, entryName, entry, groups: {}, linkNodes: { location: [], event: [], dlc: [] } };
  if (key === 'links') {
    const g = parseLinksGraph(entry.content);
    if (!g) return null;
    for (const k of ['location', 'event', 'dlc'] as const) {
      const nodes = g.links[k] || {};
      buf.linkNodes[k] = Object.entries(nodes).map(([name, n]) => ({
        name,
        locations: [...(n.locations || [])],
        events: [...(n.events || [])],
        dlcs: [...(n.dlcs || [])],
      }));
    }
    return buf;
  }
  let parsed: any = null;
  try { parsed = JSON.parse(entry.content || '[]'); } catch { return null; }
  if (key === 'stash') {
    const groups = (parsed && parsed.groups && typeof parsed.groups === 'object') ? parsed.groups : {};
    for (const kind of STASH_KIND_ORDER) buf.groups[kind] = [];
    for (const [kind, arr] of Object.entries(groups)) {
      if (!Array.isArray(arr)) continue;
      const k = STASH_KIND_ORDER.includes(kind as ManagedKind) ? kind : (kind || '__orphan__');
      buf.groups[k] = (arr as any[]).map(toVCard).filter(Boolean) as VCard[];
    }
    return buf;
  }
  // location/event/dlc：单 kind JSON 数组
  if (!Array.isArray(parsed)) return null;
  buf.groups['__default__'] = parsed.map(toVCard).filter(Boolean) as VCard[];
  return buf;
}

function toVCard(raw: any): VCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name ?? '').trim();
  if (!name) return null;
  const tags = Array.isArray(raw.tags) ? raw.tags.map((t: any) => String(t).trim()).filter(Boolean) : [];
  const inject = (typeof raw.inject === 'string' && raw.inject.trim()) ? raw.inject.trim() : undefined;
  const card: VCard = { name, tags, inject };
  const desc = String(raw.desc ?? '');
  // 结构化？尝试解析为 fields
  if (desc.trim().startsWith('{')) {
    try {
      const obj = JSON.parse(desc);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        card.fields = {};
        for (const [k, v] of Object.entries(obj)) card.fields[k] = (typeof v === 'number') ? v : String(v ?? '');
        return card;
      }
    } catch { /* 非法 JSON：降级为纯文本 */ }
  }
  card.descFlat = desc;
  // location/event/dlc 才有 links
  let links: VCard['links'];
  if (raw.links && typeof raw.links === 'object') {
    links = {};
    if (Array.isArray(raw.links.locations)) links.locations = raw.links.locations.map(String).filter(Boolean);
    if (Array.isArray(raw.links.events)) links.events = raw.links.events.map(String).filter(Boolean);
    if (Array.isArray(raw.links.dlcs)) links.dlcs = raw.links.dlcs.map(String).filter(Boolean);
    if (!links.locations && !links.events && !links.dlcs) links = undefined;
    card.links = links;
  }
  return card;
}

// ==================== 序列化写回 ====================

function serializeBuffer(buf: VBuffer): string {
  if (buf.key === 'links') {
    const links: any = { location: {}, event: {}, dlc: {} };
    for (const k of ['location', 'event', 'dlc'] as const) {
      for (const node of buf.linkNodes[k]) {
        if (!node.name.trim()) continue;
        const n: any = {};
        if (node.locations.length) n.locations = node.locations;
        if (node.events.length) n.events = node.events;
        if (node.dlcs.length) n.dlcs = node.dlcs;
        if (n.locations || n.events || n.dlcs) links[k][node.name.trim()] = n;
      }
    }
    return JSON.stringify({ format: 'th-links-graph-v1', links }, null, 2);
  }
  if (buf.key === 'stash') {
    const groups: Record<string, any[]> = {};
    for (const kind of STASH_KIND_ORDER) {
      const arr = (buf.groups[kind] || []).map(serVCard).filter(Boolean);
      if (arr.length) groups[kind] = arr;
    }
    // 保留非内置 kind 分组（孤儿/自定义）
    for (const [kind, arr] of Object.entries(buf.groups)) {
      if (STASH_KIND_ORDER.includes(kind as ManagedKind)) continue;
      const out = arr.map(serVCard).filter(Boolean);
      if (out.length) groups[kind] = out;
    }
    return JSON.stringify({ format: 'th-managed-multi-v1', groups }, null, 2);
  }
  const arr = (buf.groups['__default__'] || []).map(serVCard).filter(Boolean);
  return JSON.stringify(arr, null, 2);
}

// kind 上下文（serialize 时需知道该卡片属哪个分组，决定 desc 是结构化 JSON 还是纯文本）
function serVCard(c: VCard): any {
  const out: any = { name: c.name.trim() };
  // desc 决策：有 fields 则结构化 JSON；否则纯文本
  if (c.fields && Object.keys(c.fields).length) out.desc = JSON.stringify(c.fields);
  else out.desc = c.descFlat ?? '';
  out.tags = c.tags ?? [];
  if (c.inject) out.inject = c.inject;
  if (c.links) {
    const l: any = {};
    if (c.links.locations?.length) l.locations = c.links.locations;
    if (c.links.events?.length) l.events = c.links.events;
    if (c.links.dlcs?.length) l.dlcs = c.links.dlcs;
    out.links = l;
  }
  return out;
}

// ==================== 渲染 modal ====================

function openVisualModal(buf: VBuffer): void {
  const title = `<i class="fa-solid fa-pen-ruler"></i> 可视化编辑 · ${VKEY_LABEL[buf.key]}（${esc(buf.entryName)}）`;
  openModal2(title, renderVModalBody(buf), { maxWidth: 'min(920px,94vw)' });
  setTimeout(() => bindVModalEvents(buf), 50);
}

function renderVModalBody(buf: VBuffer): string {
  return `<div class="th-init-ved">
    <div class="th-init-ved-tip">直接编辑世界书条目 content（不触碰本地卡片）。增删改/复制卡片后点「保存写回」序列化覆盖该条目；格式由编辑器保证合法。</div>
    <div class="th-init-ved-toolbar">
      <span class="th-init-ved-src"><i class="fa-solid fa-book"></i> 世界书：${esc(buf.entry.book)}</span>
    </div>
    ${buf.key === 'links' ? renderLinksBody(buf) : renderCardsBody(buf)}
    <div class="th-init-ved-footer">
      <button class="th-btn" id="th-ved-cancel" type="button"><i class="fa-solid fa-xmark"></i> 取消</button>
      <button class="th-btn th-btn-primary" id="th-ved-save" type="button"><i class="fa-solid fa-floppy-disk"></i> 保存写回条目</button>
    </div>
  </div>`;
}

// 卡片网格（location/event/dlc/stash）
function renderCardsBody(buf: VBuffer): string {
  const isStash = buf.key === 'stash';
  const kindKeys = isStash
    ? [...STASH_KIND_ORDER, ...Object.keys(buf.groups).filter(k => !STASH_KIND_ORDER.includes(k as ManagedKind))]
    : ['__default__'];
  const sections = kindKeys.map(kk => {
    const cards = buf.groups[kk] || [];
    const head = isStash
      ? `<div class="th-init-ved-grp-head"><i class="fa-solid fa-layer-group"></i> ${esc(STASH_KIND_LABEL[kk] || kk)} <span class="th-init-ved-grp-cnt">${cards.length} 张</span></div>`
      : '';
    const cardsHtml = cards.map((c, i) => renderVCard(c, kk, i)).join('');
    return `<div class="th-init-ved-grp" data-ved-grp="${escAttr(kk)}">${head}<div class="th-init-ved-cards">${cardsHtml}</div>
      <button class="th-btn-sm th-init-ved-add" data-ved-grp="${escAttr(kk)}" type="button"><i class="fa-solid fa-plus"></i> 新增卡片</button>
    </div>`;
  }).join('');
  return `<div class="th-init-ved-grps">${sections}</div>`;
}

// 头部（名称 + 复制 + 删除）
function renderCardHead(name: string): string {
  return `<div class="th-init-ved-card-head">
    <input class="th-edit-input th-init-ved-name" type="text" value="${escAttr(name)}" placeholder="卡片名（必填）" data-vf="name">
    <button class="th-icon-btn th-init-ved-copy" type="button" title="复制该卡片（插入同值副本）" data-ved-act="copy"><i class="fa-solid fa-copy"></i></button>
    <button class="th-icon-btn th-init-ved-del" type="button" title="删除该卡片" data-ved-act="del"><i class="fa-solid fa-trash"></i></button>
  </div>`;
}

// 通用 footer（标签 + 注入）— location/event/dlc/stash 卡片都用
function renderCardFooter(c: VCard): string {
  const tagsStr = (c.tags || []).join(', ');
  return `<div class="th-init-ved-row">
      <span class="th-init-ved-lbl"><i class="fa-solid fa-tags"></i> 标签</span>
      <input class="th-edit-input th-init-ved-tags" type="text" value="${escAttr(tagsStr)}" placeholder="逗号分隔，留空则无标签" data-vf="tags">
    </div>
    <div class="th-init-ved-row">
      <span class="th-init-ved-lbl"><i class="fa-solid fa-syringe"></i> 注入</span>
      <input class="th-edit-input th-init-ved-inject" type="text" value="${escAttr(c.inject || '')}" placeholder="可选注入模板（留空则用类别默认）" data-vf="inject">
    </div>`;
}

// 单卡片渲染（按 kind 区分结构化 / 纯文本 / 关联）
function renderVCard(c: VCard, grp: string, _idx: number): string {
  const common = `class="th-init-ved-card" data-ved-grp="${escAttr(grp)}"`;
  // 结构化四类
  if (isStructuredKind(grp)) {
    const spec = STASH_FIELD_SPEC[grp as ManagedKind]!;
    const fieldsHtml = spec.order.map(f => renderStructField(f, c.fields?.[f], spec, grp)).join('');
    return `<div ${common}>
      ${renderCardHead(c.name)}
      <div class="th-init-ved-fields" data-vf-group>${fieldsHtml}</div>
      ${renderCardFooter(c)}
    </div>`;
  }
  // 未分类 / 自定义 kind：纯文本 desc
  if (grp === 'stash-uncategorized' || (grp !== '__default__' && !STASH_KIND_ORDER.includes(grp as ManagedKind))) {
    return `<div ${common}>
      ${renderCardHead(c.name)}
      <div class="th-init-ved-row">
        <span class="th-init-ved-lbl"><i class="fa-solid fa-align-left"></i> 简介</span>
      </div>
      <textarea class="th-edit-textarea th-init-ved-desc-flat" placeholder="简介（普通文本，可直接输入）" data-vf="desc-flat" rows="2">${esc(c.descFlat ?? '')}</textarea>
      ${renderCardFooter(c)}
    </div>`;
  }
  // location/event/dlc（__default__）：纯文本 desc + links
  const ll = c.links || {};
  return `<div ${common}>
    ${renderCardHead(c.name)}
    <div class="th-init-ved-row">
      <span class="th-init-ved-lbl"><i class="fa-solid fa-align-left"></i> 简介</span>
    </div>
    <textarea class="th-edit-textarea th-init-ved-desc-flat" placeholder="简介（必填，普通文本）" data-vf="desc-flat" rows="2">${esc(c.descFlat ?? '')}</textarea>
    ${renderCardFooter(c)}
    ${renderLinksInputs(ll)}
  </div>`;
}

// 结构化单字段（input/textarea/select 三态，按 spec）
function renderStructField(f: string, val: string | number | undefined, spec: FieldSpec, _kind: string): string {
  const raw = val === undefined || val === null ? '' : String(val);
  if (spec.enum_[f]) {
    const opts = spec.enum_[f].map(o => `<option value="${escAttr(o)}" ${o === raw ? 'selected' : ''}>${esc(o)}</option>`).join('');
    return `<div class="th-init-ved-row"><span class="th-init-ved-lbl">${esc(f)}</span><select class="th-edit-select th-init-ved-field" data-vf-field="${escAttr(f)}">${opts}</select></div>`;
  }
  if (spec.long.has(f)) {
    return `<div class="th-init-ved-row"><span class="th-init-ved-lbl">${esc(f)}</span></div>
      <textarea class="th-edit-textarea th-init-ved-field" placeholder="${escAttr(f)}（可直接输入）" data-vf-field="${escAttr(f)}" rows="2">${esc(raw)}</textarea>`;
  }
  const t = spec.num.has(f) ? 'number' : 'text';
  return `<div class="th-init-ved-row"><span class="th-init-ved-lbl">${esc(f)}</span><input class="th-edit-input th-init-ved-field" type="${t}" value="${escAttr(raw)}" placeholder="${escAttr(f)}" data-vf-field="${escAttr(f)}"></div>`;
}

// links 字段 3 输入（CSV），仅 location/event/dlc 卡片用
function renderLinksInputs(ll: { locations?: string[]; events?: string[]; dlcs?: string[] }): string {
  return `<div class="th-init-ved-links">
    <div class="th-init-ved-row"><span class="th-init-ved-lbl"><i class="fa-solid fa-map-pin"></i> 关联地点</span><input class="th-edit-input" type="text" value="${escAttr((ll.locations || []).join(', '))}" placeholder="逗号分隔的地点名（可空）" data-vf="links.locations"></div>
    <div class="th-init-ved-row"><span class="th-init-ved-lbl"><i class="fa-solid fa-flag"></i> 关联事件</span><input class="th-edit-input" type="text" value="${escAttr((ll.events || []).join(', '))}" placeholder="逗号分隔的事件名（可空）" data-vf="links.events"></div>
    <div class="th-init-ved-row"><span class="th-init-ved-lbl"><i class="fa-solid fa-folder-plus"></i> 关联DLC</span><input class="th-edit-input" type="text" value="${escAttr((ll.dlcs || []).join(', '))}" placeholder="逗号分隔的DLC名（可空）" data-vf="links.dlcs"></div>
  </div>`;
}

// 关联图编辑：node 网格（name + 3 CSV）
function renderLinksBody(buf: VBuffer): string {
  const sections = (['location', 'event', 'dlc'] as const).map(kk => {
    const label = VKEY_LABEL[kk];
    const nodes = buf.linkNodes[kk];
    const rows = nodes.map((n) => `<div class="th-init-ved-card th-init-ved-link" data-ved-linkkind="${escAttr(kk)}">
      <div class="th-init-ved-card-head">
        <input class="th-edit-input th-init-ved-name" type="text" value="${escAttr(n.name)}" placeholder="卡片名（必填）" data-vf="name">
        <button class="th-icon-btn th-init-ved-copy" type="button" title="复制该节点（插入同值副本）" data-ved-act="copy"><i class="fa-solid fa-copy"></i></button>
        <button class="th-icon-btn th-init-ved-del" type="button" title="删除该节点" data-ved-act="del"><i class="fa-solid fa-trash"></i></button>
      </div>
      <div class="th-init-ved-row"><span class="th-init-ved-lbl"><i class="fa-solid fa-map-pin"></i> 地点</span><input class="th-edit-input" type="text" value="${escAttr(n.locations.join(', '))}" placeholder="逗号分隔" data-vf="locations"></div>
      <div class="th-init-ved-row"><span class="th-init-ved-lbl"><i class="fa-solid fa-flag"></i> 事件</span><input class="th-edit-input" type="text" value="${escAttr(n.events.join(', '))}" placeholder="逗号分隔" data-vf="events"></div>
      <div class="th-init-ved-row"><span class="th-init-ved-lbl"><i class="fa-solid fa-folder-plus"></i> DLC</span><input class="th-edit-input" type="text" value="${escAttr(n.dlcs.join(', '))}" placeholder="逗号分隔" data-vf="dlcs"></div>
    </div>`).join('');
    return `<div class="th-init-ved-grp" data-ved-linkkind="${escAttr(kk)}">
      <div class="th-init-ved-grp-head"><i class="fa-solid fa-layer-group"></i> ${label} <span class="th-init-ved-grp-cnt">${nodes.length} 节点</span></div>
      <div class="th-init-ved-cards">${rows}</div>
      <button class="th-btn-sm th-init-ved-add" data-ved-linkkind="${escAttr(kk)}" type="button"><i class="fa-solid fa-plus"></i> 新增节点</button>
    </div>`;
  }).join('');
  return `<div class="th-init-ved-grps">${sections}</div>`;
}

// ==================== 事件绑定 ====================

// 给单个 card 元素上的 复制/删除 按钮绑定
function bindCardActs(cardEl: HTMLElement): void {
  const del = cardEl.querySelector('.th-init-ved-del');
  const copy = cardEl.querySelector('.th-init-ved-copy');
  del?.addEventListener('click', () => cardEl.remove());
  copy?.addEventListener('click', () => {
    // 深克隆当前 card（含输入值快照），插入其后
    const clone = cardEl.cloneNode(true) as HTMLElement;
    cardEl.parentNode?.insertBefore(clone, cardEl.nextSibling);
    bindCardActs(clone);
  });
}

function bindVModalEvents(buf: VBuffer): void {
  qs('#th-ved-cancel')?.addEventListener('click', closeModal2);
  qs('#th-ved-save')?.addEventListener('click', () => { void saveBuffer(buf); });

  // 删除/复制（初始化）
  qsa('.th-init-ved-card').forEach(cardEl => bindCardActs(cardEl as HTMLElement));

  // 新增卡片（单 kind）
  qsa('.th-init-ved-add[data-ved-grp]').forEach(btn => {
    btn.addEventListener('click', () => {
      const grp = btn.getAttribute('data-ved-grp') || '__default__';
      const grpEl = btn.closest('.th-init-ved-grp');
      const cardsWrap = grpEl?.querySelector('.th-init-ved-cards');
      if (!cardsWrap) return;
      const newCard: VCard = emptyCardFor(grp);
      const div = __doc.createElement('div');
      div.innerHTML = renderVCard(newCard, grp, 0);
      const cardEl = div.firstElementChild as HTMLElement;
      if (cardEl) { cardsWrap.appendChild(cardEl); bindCardActs(cardEl); }
    });
  });

  // 新增节点（links）
  qsa('.th-init-ved-add[data-ved-linkkind]').forEach(btn => {
    btn.addEventListener('click', () => {
      const kk = (btn.getAttribute('data-ved-linkkind') || 'location') as 'location' | 'event' | 'dlc';
      const grpEl = btn.closest('.th-init-ved-grp');
      const cardsWrap = grpEl?.querySelector('.th-init-ved-cards');
      if (!cardsWrap) return;
      const div = __doc.createElement('div');
      div.innerHTML = `<div class="th-init-ved-card th-init-ved-link" data-ved-linkkind="${escAttr(kk)}">
        <div class="th-init-ved-card-head">
          <input class="th-edit-input th-init-ved-name" type="text" value="" placeholder="卡片名（必填）" data-vf="name">
          <button class="th-icon-btn th-init-ved-copy" type="button" title="复制该节点（插入同值副本）" data-ved-act="copy"><i class="fa-solid fa-copy"></i></button>
          <button class="th-icon-btn th-init-ved-del" type="button" title="删除该节点" data-ved-act="del"><i class="fa-solid fa-trash"></i></button>
        </div>
        <div class="th-init-ved-row"><span class="th-init-ved-lbl"><i class="fa-solid fa-map-pin"></i> 地点</span><input class="th-edit-input" type="text" value="" placeholder="逗号分隔" data-vf="locations"></div>
        <div class="th-init-ved-row"><span class="th-init-ved-lbl"><i class="fa-solid fa-flag"></i> 事件</span><input class="th-edit-input" type="text" value="" placeholder="逗号分隔" data-vf="events"></div>
        <div class="th-init-ved-row"><span class="th-init-ved-lbl"><i class="fa-solid fa-folder-plus"></i> DLC</span><input class="th-edit-input" type="text" value="" placeholder="逗号分隔" data-vf="dlcs"></div>
      </div>`;
      const cardEl = div.firstElementChild as HTMLElement;
      if (cardEl) { cardsWrap.appendChild(cardEl); bindCardActs(cardEl); }
    });
  });
}

// 新增卡片时根据 kind 给空结构（结构化带空字段、纯文本带空 desc）
function emptyCardFor(grp: string): VCard {
  if (isStructuredKind(grp)) {
    const spec = STASH_FIELD_SPEC[grp as ManagedKind]!;
    const fields: Record<string, string | number> = {};
    for (const f of spec.order) {
      fields[f] = spec.num.has(f) ? 0 : '';
    }
    return { name: '', tags: [], inject: undefined, fields };
  }
  // 纯文本 / 关联
  const c: VCard = { name: '', tags: [], inject: undefined, descFlat: '' };
  if (grp === '__default__') c.links = undefined;
  return c;
}

// ==================== 保存：DOM 回读 → 序列化 → 写回条目 ====================

function parseCsv(str: string): string[] {
  return str.split(/[,，]/).map(s => s.trim()).filter(Boolean);
}

// 从 modal DOM 回读编辑缓冲（按当前 DOM 顺序，名称空跳过）
function collectFromDom(buf: VBuffer): VBuffer {
  const out: VBuffer = { ...buf, groups: {}, linkNodes: { location: [], event: [], dlc: [] } };
  if (buf.key === 'links') {
    for (const kk of ['location', 'event', 'dlc'] as const) {
      qsa(`.th-init-ved-link[data-ved-linkkind="${kk}"]`).forEach(el => {
        const name = (el.querySelector<HTMLInputElement>('.th-init-ved-name')?.value || '').trim();
        if (!name) return;
        const locations = parseCsv(el.querySelector<HTMLInputElement>('[data-vf="locations"]')?.value || '');
        const events = parseCsv(el.querySelector<HTMLInputElement>('[data-vf="events"]')?.value || '');
        const dlcs = parseCsv(el.querySelector<HTMLInputElement>('[data-vf="dlcs"]')?.value || '');
        out.linkNodes[kk].push({ name, locations, events, dlcs });
      });
    }
    return out;
  }
  // 卡片（单 kind / 多 kind）
  qsa('.th-init-ved-grp').forEach(grpEl => {
    const grp = grpEl.getAttribute('data-ved-grp') || '__default__';
    out.groups[grp] = [];
    (grpEl.querySelectorAll('.th-init-ved-card') as NodeListOf<HTMLElement>).forEach(el => {
      const name = (el.querySelector<HTMLInputElement>('.th-init-ved-name')?.value || '').trim();
      if (!name) return;
      const tags = parseCsv(el.querySelector<HTMLInputElement>('.th-init-ved-tags')?.value || '');
      const tag1 = tags.length ? [tags[0]] : [];
      const inject = (el.querySelector<HTMLInputElement>('.th-init-ved-inject')?.value || '').trim() || undefined;
      const card: VCard = { name, tags: tag1, inject };

      // 结构化四类：收集各字段
      if (isStructuredKind(grp)) {
        const spec = STASH_FIELD_SPEC[grp as ManagedKind]!;
        const fields: Record<string, string | number> = {};
        el.querySelectorAll('[data-vf-field]').forEach(inp => {
          const f = inp.getAttribute('data-vf-field') || '';
          const v = (inp as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
          fields[f] = spec.num.has(f) ? (Number(v) || 0) : v;
        });
        card.fields = fields;
      } else {
        // 纯文本 desc
        card.descFlat = (el.querySelector<HTMLTextAreaElement>('[data-vf="desc-flat"]')?.value || '').trim();
        // location/event/dlc 仍有 links
        const ll = el.querySelector('.th-init-ved-links');
        if (ll) {
          const locations = parseCsv(ll.querySelector<HTMLInputElement>('[data-vf="links.locations"]')?.value || '');
          const events = parseCsv(ll.querySelector<HTMLInputElement>('[data-vf="links.events"]')?.value || '');
          const dlcs = parseCsv(ll.querySelector<HTMLInputElement>('[data-vf="links.dlcs"]')?.value || '');
          if (locations.length || events.length || dlcs.length) card.links = { locations, events, dlcs };
        }
      }
      out.groups[grp].push(card);
    });
  });
  return out;
}

// links 合法名校验：引用的卡片名是否本地存在（仅警告，不阻断——允许占位）
function warnOrphanLinks(buf: VBuffer): string[] {
  // 卡片里的 links（location/event/dlc）
  const warn: string[] = [];
  const FIELD_KIND: Record<'locations' | 'events' | 'dlcs', ManagedKind> = { locations: 'location', events: 'event', dlcs: 'dlc' };
  for (const [, arr] of Object.entries(buf.groups)) {
    for (const c of arr) {
      if (!c.links) continue;
      for (const f of ['locations', 'events', 'dlcs'] as const) {
        const targetKind = FIELD_KIND[f];
        const targetItems = getManagedItemsLite(targetKind);
        for (const t of c.links[f] || []) {
          if (!targetItems[t]) warn.push(`卡片「${c.name}」→ ${f}：「${t}」本地无此卡`);
        }
      }
    }
  }
  // links kind node 里的引用
  for (const kk of ['location', 'event', 'dlc'] as const) {
    for (const node of buf.linkNodes[kk]) {
      for (const f of ['locations', 'events', 'dlcs'] as const) {
        const targetKind = FIELD_KIND[f];
        const targetItems = getManagedItemsLite(targetKind);
        for (const t of node[f]) {
          if (!targetItems[t]) warn.push(`${VKEY_LABEL[kk]}「${node.name}」→ ${f}：「${t}」本地无此卡`);
        }
      }
    }
  }
  return warn;
}

// 轻量读本地 kind 卡片名集合（孤儿关联校验用）
function getManagedItemsLite(kind: ManagedKind): Record<string, any> {
  try { return getManagedItems(kind) || {}; } catch { return {}; }
}

async function saveBuffer(buf: VBuffer): Promise<void> {
  const collected = collectFromDom(buf);
  if (buf.key === 'links') {
    for (const kk of ['location', 'event', 'dlc'] as const) {
      for (const n of collected.linkNodes[kk]) {
        if (!n.name) { toastr?.error?.('存在空名称节点，请修正'); return; }
      }
    }
  } else {
    for (const [, arr] of Object.entries(collected.groups)) {
      for (const c of arr) {
        if (!c.name) { toastr?.error?.('存在空名称卡片，请修正'); return; }
      }
    }
  }
  // location/event/dlc 才检查关联孤儿
  if (buf.key !== 'stash' && buf.key !== 'links') {
    const orphans = warnOrphanLinks(collected);
    if (orphans.length && !confirm(`检测到 ${orphans.length} 条关联引用了本地不存在的卡片（前3条：${orphans.slice(0, 3).join('；')}）。\n仍要写回吗？（点「确定」写回，点「取消」回去修正）`)) return;
  }
  if (buf.key === 'links') {
    const orphans = warnOrphanLinks(collected);
    if (orphans.length && !confirm(`检测到 ${orphans.length} 条关联引用了本地不存在的卡片（前3条：${orphans.slice(0, 3).join('；')}）。\n仍要写回吗？（点「确定」写回，点「取消」回去修正）`)) return;
  }
  const content = serializeBuffer(collected);
  try {
    let created = false;
    await safeUpdateWorldbookWith(buf.entry.book, entries => {
      const idx = entries.findIndex(e => Number(e.uid) === buf.entry.uid);
      if (idx >= 0) entries[idx] = { ...entries[idx], content };
      else { created = true; entries.push(createInitialWorldbookEntry(buf.entryName, content)); }
      return entries;
    }, { render: 'debounced' });
    toastr?.success?.(`已写回 ${buf.entryName}${created ? '（新建）' : ''}（世界书：${buf.entry.book}）`);
    closeModal2();
  } catch (e) {
    console.warn('[init-visual-editor] save 失败', e);
    toastr?.error?.('保存写回失败：' + (e as Error).message);
  }
}