//批次2 · 任务2 可视化编辑器（init-visual-editor）。
// 在 init-manager板 5 个条目行各加「可视化编辑」按钮，点击打开 modal，按卡片网格可视化增删改，
// 确认后重新序列化写回世界书条目 content —— 不触碰 localStorage managed 卡片，不污染运行时数据，
// 格式由严格序列化保证合法（用户不会因手写 JSON 出错）。
// 直接改条目内容回路（用户选定）：扫码读条目 → 编辑缓冲 → 重新序列化 → safeUpdateWith 写回。
// 储藏间走 {format,groups} 多 kind 结构；location/event/dlc 走单 kind JSON 数组；
// 关联图走 {format,links} node 网格（name → {locations?,events?,dlcs?}）。
// 命令式 innerHTML + openModal2 + data 性委托（同 init-manager），不引 Vue。
// 严格向下兼容：不改条目名、不改 localStorage key、不破坏现有函数签名；本编辑器是「编辑」按钮的可视化补充，原 wb-inspector 文本编辑入口保留。
// ================================================================
import {
  INITIAL_ENTRY_NAMES,
  type ManagedKind,
} from '../lib/config';
import { getManagedItems } from '../lib/managed-store';
import { qs, qsa, esc, escAttr, __doc } from '../lib/dom-utils';
import { safeGetWorldbook, safeUpdateWorldbookWith } from '../lib/tavern-api';
import { openModal2, closeModal2 } from '../status-bar-init';
import { getCharWorldbookList } from './managed-modal';
import { createInitialWorldbookEntry } from './stash-io';
import { parseLinksGraph } from './links-init';

type VKey = 'location' | 'event' | 'dlc' | 'stash' | 'links';
const VKEY_LABEL: Record<VKey, string> = {
  location: '地点', event: '事件', dlc: 'DLC', stash: '储藏间', links: '关联图',
};
// 储藏间内置 4 kind 顺序（groups 顺序稳定，避免写回时乱序）
const STASH_KIND_ORDER: ManagedKind[] = ['stash-item', 'stash-skill', 'stash-status', 'stash-clothing'];
const STASH_KIND_LABEL: Record<string, string> = {
  'stash-item': '物品', 'stash-skill': '技能', 'stash-status': '状态', 'stash-clothing': '衣物',
};

// 可视化卡片（location/event/dlc/stash 各 kind 内单条；links 用 VLinkNode）
type VCard = { name: string; desc: string; tags: string[]; inject?: string; links?: { locations?: string[]; events?: string[]; dlcs?: string[] } };
type VLinkNode = { name: string; locations: string[]; events: string[]; dlcs: string[] };

// 条目实例（多本同名只取第一本编辑；写回该同本）
type VEntry = { book: string; uid: number; content: string };

// 编辑缓冲：cards 按 kind 分组（单 kind → ['__default__']）；links → nodes 按 kind 分组
type VBuffer = {
  key: VKey;
  entryName: string;
  entry: VEntry;
  groups: Record<string, VCard[]>; // 各 kind 卡片；location/event/dlc 用 '__default__'
  linkNodes: Record<'location' | 'event' | 'dlc', VLinkNode[]>; // links 专用
};

// ==================== 入口 ====================

// 找条目第一本实例（多本同名取有内容的；visual 编辑只编第一本，写回同一本）
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

// 要导出给 init-manager 看板「可视化编辑」按钮调
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
  // 非链接
  let parsed: any = null;
  try { parsed = JSON.parse(entry.content || '[]'); } catch { return null; }
  if (key === 'stash') {
    // {format, groups:{kind:[...]}}；非法降级空
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
  const desc = String(raw.desc ?? '').trim();
  const tags = Array.isArray(raw.tags) ? raw.tags.map((t: any) => String(t).trim()).filter(Boolean) : [];
  const inject = (typeof raw.inject === 'string' && raw.inject.trim()) ? raw.inject.trim() : undefined;
  let links: VCard['links'];
  if (raw.links && typeof raw.links === 'object') {
    links = {};
    if (Array.isArray(raw.links.locations)) links.locations = raw.links.locations.map(String).filter(Boolean);
    if (Array.isArray(raw.links.events)) links.events = raw.links.events.map(String).filter(Boolean);
    if (Array.isArray(raw.links.dlcs)) links.dlcs = raw.links.dlcs.map(String).filter(Boolean);
    if (!links.locations && !links.events && !links.dlcs) links = undefined;
  }
  return { name, desc, tags, inject, links };
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
    // 保留非内置 kind 分组（孤儿/自定义）——原样保留其卡片
    for (const [kind, arr] of Object.entries(buf.groups)) {
      if (STASH_KIND_ORDER.includes(kind as ManagedKind)) continue;
      const out = arr.map(serVCard).filter(Boolean);
      if (out.length) groups[kind] = out;
    }
    return JSON.stringify({ format: 'th-managed-multi-v1', groups }, null, 2);
  }
  // location/event/dlc：单 kind 数组
  const arr = (buf.groups['__default__'] || []).map(serVCard).filter(Boolean);
  return JSON.stringify(arr, null, 2);
}

function serVCard(c: VCard): any {
  const out: any = { name: c.name.trim(), desc: c.desc ?? '', tags: c.tags ?? [] };
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
    <div class="th-init-ved-tip">直接编辑世界书条目 content（不触碰本地卡片）。增删改卡片后点「保存写回」序列化覆盖该条目；格式由编辑器保证合法。</div>
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

// 单卡片（name/desc/tags/inject/links 字段）
function renderVCard(c: VCard, grp: string, idx: number): string {
  const tagsStr = (c.tags || []).join(', ');
  const ll = c.links || {};
  return `<div class="th-init-ved-card" data-ved-grp="${escAttr(grp)}" data-ved-idx="${idx}">
    <div class="th-init-ved-card-head">
      <input class="th-edit-input th-init-ved-name" type="text" value="${escAttr(c.name)}" placeholder="卡片名（必填）" data-vf="name">
      <button class="th-icon-btn th-init-ved-del" type="button" title="删除该卡片" data-ved-act="del"><i class="fa-solid fa-trash"></i></button>
    </div>
    <textarea class="th-edit-textarea th-init-ved-desc" placeholder="简介（必填）" data-vf="desc" rows="2">${esc(c.desc)}</textarea>
    <div class="th-init-ved-row">
      <span class="th-init-ved-lbl"><i class="fa-solid fa-tags"></i> 标签</span>
      <input class="th-edit-input th-init-ved-tags" type="text" value="${escAttr(tagsStr)}" placeholder="逗号分隔，留空则无标签" data-vf="tags">
    </div>
    <div class="th-init-ved-row">
      <span class="th-init-ved-lbl"><i class="fa-solid fa-syringe"></i> 注入</span>
      <input class="th-edit-input th-init-ved-inject" type="text" value="${escAttr(c.inject || '')}" placeholder="可选注入模板（留空则用类别默认）" data-vf="inject">
    </div>
    ${renderLinksInputs(ll)}
  </div>`;
}

// links 字段 3 输入（CSV），仅 location/event/dlc/stash 卡片用
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
    const rows = nodes.map((n, i) => `<div class="th-init-ved-card th-init-ved-link" data-ved-linkkind="${escAttr(kk)}" data-ved-idx="${i}">
      <div class="th-init-ved-card-head">
        <input class="th-edit-input th-init-ved-name" type="text" value="${escAttr(n.name)}" placeholder="卡片名（必填）" data-vf="name">
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

function bindVModalEvents(buf: VBuffer): void {
  qs('#th-ved-cancel')?.addEventListener('click', closeModal2);
  qs('#th-ved-save')?.addEventListener('click', () => { void saveBuffer(buf); });

  // 删除卡片/节点
  qsa('.th-init-ved-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.th-init-ved-card') as HTMLElement | null;
      if (card) card.remove();
    });
  });

  // 新增卡片（单 kind）
  qsa('.th-init-ved-add[data-ved-grp]').forEach(btn => {
    btn.addEventListener('click', () => {
      const grp = btn.getAttribute('data-ved-grp') || '__default__';
      const grpEl = btn.closest('.th-init-ved-grp');
      const cardsWrap = grpEl?.querySelector('.th-init-ved-cards');
      if (!cardsWrap) return;
      const newCard: VCard = { name: '', desc: '', tags: [], inject: undefined, links: undefined };
      // 插入当前 length 作为 idx（保存时按 DOM 顺序重读，idx 仅占位）
      const idx = (buf.groups[grp] || []).length;
      const div = __doc.createElement('div');
      div.innerHTML = renderVCard(newCard, grp, idx);
      cardsWrap.appendChild(div.firstElementChild as HTMLElement);
    });
  });

  // 新增节点（links）
  qsa('.th-init-ved-add[data-ved-linkkind]').forEach(btn => {
    btn.addEventListener('click', () => {
      const kk = (btn.getAttribute('data-ved-linkkind') || 'location') as 'location' | 'event' | 'dlc';
      const grpEl = btn.closest('.th-init-ved-grp');
      const cardsWrap = grpEl?.querySelector('.th-init-ved-cards');
      if (!cardsWrap) return;
      const idx = (buf.linkNodes[kk] || []).length;
      const div = __doc.createElement('div');
      div.innerHTML = `<div class="th-init-ved-card th-init-ved-link" data-ved-linkkind="${escAttr(kk)}" data-ved-idx="${idx}">
        <div class="th-init-ved-card-head">
          <input class="th-edit-input th-init-ved-name" type="text" value="" placeholder="卡片名（必填）" data-vf="name">
          <button class="th-icon-btn th-init-ved-del" type="button" title="删除该节点" data-ved-act="del"><i class="fa-solid fa-trash"></i></button>
        </div>
        <div class="th-init-ved-row"><span class="th-init-ved-lbl"><i class="fa-solid fa-map-pin"></i> 地点</span><input class="th-edit-input" type="text" value="" placeholder="逗号分隔" data-vf="locations"></div>
        <div class="th-init-ved-row"><span class="th-init-ved-lbl"><i class="fa-solid fa-flag"></i> 事件</span><input class="th-edit-input" type="text" value="" placeholder="逗号分隔" data-vf="events"></div>
        <div class="th-init-ved-row"><span class="th-init-ved-lbl"><i class="fa-solid fa-folder-plus"></i> DLC</span><input class="th-edit-input" type="text" value="" placeholder="逗号分隔" data-vf="dlcs"></div>
      </div>`;
      cardsWrap.appendChild(div.firstElementChild as HTMLElement);
      // 新节点的删除按钮需绑一次（上面 forEach 已绑全量，但此节点是后加）
      const del = cardsWrap.lastElementChild?.querySelector('.th-init-ved-del');
      del?.addEventListener('click', () => { (del.closest('.th-init-ved-card') as HTMLElement | null)?.remove(); });
    });
  });
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
      const desc = (el.querySelector<HTMLTextAreaElement>('.th-init-ved-desc')?.value || '').trim();
      const tags = parseCsv(el.querySelector<HTMLInputElement>('.th-init-ved-tags')?.value || '');
      // 标签只取第一个（与现有初始数据写入一致：toInitialWriteItem tags.slice(0,1)）
      const tag1 = tags.length ? [tags[0]] : [];
      const inject = (el.querySelector<HTMLInputElement>('.th-init-ved-inject')?.value || '').trim() || undefined;
      const locations = parseCsv(el.querySelector<HTMLInputElement>('[data-vf="links.locations"]')?.value || '');
      const events = parseCsv(el.querySelector<HTMLInputElement>('[data-vf="links.events"]')?.value || '');
      const dlcs = parseCsv(el.querySelector<HTMLInputElement>('[data-vf="links.dlcs"]')?.value || '');
      let links: VCard['links'] | undefined;
      if (locations.length || events.length || dlcs.length) links = { locations, events, dlcs };
      out.groups[grp].push({ name, desc, tags: tag1, inject, links });
    });
  });
  return out;
}

// links 合法名校验：引用的卡片名是否本地存在（仅警告，不阻断——允许占位）
function warnOrphanLinks(buf: VBuffer): string[] {
  const warn: string[] = [];
  const FIELD_KIND: Record<'locations' | 'events' | 'dlcs', ManagedKind> = { locations: 'location', events: 'event', dlcs: 'dlc' };
  for (const kk of ['location', 'event', 'dlc'] as const) {
    for (const node of buf.linkNodes[kk]) {
      for (const f of ['locations', 'events', 'dlcs'] as const) {
        const targetKind = FIELD_KIND[f];
        const targetItems = getManagedItems(targetKind);
        for (const t of node[f]) {
          if (!targetItems[t]) warn.push(`${VKEY_LABEL[kk]}「${node.name}」→ ${f}：「${t}」(${VKEY_LABEL[targetKind as VKey]})本地无此卡`);
        }
      }
    }
  }
  return warn;
}

async function saveBuffer(buf: VBuffer): Promise<void> {
  const collected = collectFromDom(buf);
  // 基本校验：名称/简介非空
  if (buf.key === 'links') {
    for (const kk of ['location', 'event', 'dlc'] as const) {
      for (const n of collected.linkNodes[kk]) {
        if (!n.name) { toastr?.error?.('存在空名称节点，请修正'); return; }
      }
    }
    const orphans = warnOrphanLinks(collected);
    if (orphans.length && !confirm(`检测到 ${orphans.length} 条关联引用了本地不存在的卡片（前3条：${orphans.slice(0, 3).join('；')}）。\n仍要写回吗？（点「确定」写回，点「取消」回去修正）`)) return;
  } else {
    for (const [, arr] of Object.entries(collected.groups)) {
      for (const c of arr) {
        if (!c.name) { toastr?.error?.('存在空名称卡片，请修正'); return; }
        if (!c.desc) { toastr?.warning?.(`卡片「${c.name}」简介为空，已保留（建议填写）`); }
      }
    }
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