import { esc, escAttr } from '../../lib/dom-utils';
import { iconHtml } from '../../lib/icons';
import { patchSettingsDetail } from './world-app-settings';

// 规范段 id（固定类；内容玩法段由各 app 自定义，不在此列）
export type CanonSegId = 'read' | 'write' | 'auto' | 'prompts' | 'api' | 'eco' | 'appearance' | 'data';
// 规范段元信息：图标 + 名称 + 排序权重（单点定义）
const SEG_META: Record<CanonSegId, { icon: string; label: string; order: number }> = {
  read:       { icon: 'fa-book-open', label: '读取上下文', order: 10 },
  write:      { icon: 'fa-syringe',   label: '写入管理',   order: 20 },
  auto:       { icon: 'fa-bolt',      label: '自动触发',     order: 30 },
  // 内容与玩法段 order = 40 + 声明序（见下）
  prompts:    { icon: 'fa-feather',   label: '功能提示词',   order: 50 },
  api:        { icon: 'fa-gauge-high', label: '生成额度',    order: 55 },
  eco:        { icon: 'fa-fire',      label: '生态浓度',     order: 60 },
  appearance: { icon: 'fa-image',     label: '外观',         order: 70 },
  data:       { icon: 'fa-database',  label: '记忆与数据',   order: 80 },
};
const CONTENT_ORDER_BASE = 40;

// app 声明一个段，三种写法：
//   1) 规范段 id 字符串（如 'auto'）——内部 cat id 与规范段同名，直接用规范图标/名称/顺序。
//   2) { id, canon }——内部 cat id 保留 app 既有值（如 'context'），但按规范段 canon 出图标/名称/顺序。
//      这样各 app 现有的 `_setCat === 'context'` 详情分发无需改名，只是导航的排序/命名/图标统一。
//   3) { id, icon, label }——自定义「内容与玩法」段，落在 auto 之后、prompts 之前，按声明顺序排。
//   规范段可覆盖 label（默认应沿用规范名以保持全 app 统一）：给 1)/2) 传 label 即可。
export type ScaffoldCatDef =
  | CanonSegId
  | { id: string; canon: CanonSegId; label?: string; icon?: string }
  | { id: string; icon: string; label: string };
// 归一化后的分类项（含最终 icon/label/order）
export type ScaffoldCat = { id: string; icon: string; label: string; order: number };

function isCanonId(s: string): s is CanonSegId { return Object.prototype.hasOwnProperty.call(SEG_META, s); }

// 把 app 声明的段列表归一化为「规范顺序」的分类项数组。
export function normalizeScaffoldCats(defs: ScaffoldCatDef[]): ScaffoldCat[] {
  let contentSeq = 0;
  const cats: ScaffoldCat[] = defs.map(d => {
    if (typeof d === 'string') {
      const m = SEG_META[d];
      return { id: d, icon: m.icon, label: m.label, order: m.order };
    }
    if ('canon' in d) {
      const m = SEG_META[d.canon];
      return { id: d.id, icon: d.icon || m.icon, label: d.label || m.label, order: m.order };
    }
    // 自定义内容段：落在 auto 之后、prompts 之前，按声明顺序排
    return { id: d.id, icon: d.icon, label: d.label, order: CONTENT_ORDER_BASE + (contentSeq++) };
  });
  return cats.sort((a, b) => a.order - b.order);
}
export { isCanonId };

// 渲染左侧分类导航（统一 .thw-nav 结构 + 统一 data 属性）。
//   attrPrefix 让每个 app 的 setcat 属性隔离（如 'bili' → data-bili-setcat），沿用各 app 既有 click 路由。
export function scaffoldNavHtml(attrPrefix: string, cats: ScaffoldCat[], active: string): string {
  return cats.map(c =>
    `<button class="thw-nav${active === c.id ? ' thw-nav-on' : ''}" data-${attrPrefix}-setcat="${escAttr(c.id)}" type="button">` +
    `<span class="thw-nav-ico">${iconHtml(c.icon)}</span><span class="thw-nav-lbl">${esc(c.label)}</span></button>`
  ).join('');
}

// 渲染整个设置视图外壳（topbar + 左导航 + 右详情容器）。详情正文由 renderDetail(active) 产出。
export function scaffoldViewHtml(opts: {
  attrPrefix: string;
  title: string;
  titleIcon?: string;
  cats: ScaffoldCat[];
  active: string;
  detailHtml: string;      // = renderDetail(active)
  rootClass?: string;      // 追加到 .thw-content 的额外类（各 app 若有专属滚动/宽度样式）
}): string {
  return `<div class="thw-content thw-set2${opts.rootClass ? ' ' + opts.rootClass : ''}">
    <div class="thw-topbar"><span class="thw-eyebrow">${iconHtml(opts.titleIcon || 'fa-gear')} ${esc(opts.title)}</span></div>
    <div class="thw-set2-body">
      <nav class="thw-set2-nav" data-set2-nav="${escAttr(opts.attrPrefix)}">${scaffoldNavHtml(opts.attrPrefix, opts.cats, opts.active)}</nav>
      <div class="thw-set2-detail thw-content-pad thw-view-in" data-set2-detail="${escAttr(opts.attrPrefix)}">${opts.detailHtml}</div>
    </div>
  </div>`;
}

// 统一处理左导航点击：切分类 + 局部刷新右详情（复用 patchSettingsDetail，不重建整根）。
//   返回 true=已消费（是本 app 的 setcat 点击）。
export function scaffoldHandleNav(t: HTMLElement, opts: {
  attrPrefix: string;
  root: HTMLElement | null;
  getActive: () => string;
  setActive: (id: string) => void;
  renderDetail: (catId: string) => string;
  rebind?: (detail: HTMLElement) => void;
}): boolean {
  const btn = t.closest(`[data-${opts.attrPrefix}-setcat]`) as HTMLElement | null;
  if (!btn) return false;
  const cat = btn.getAttribute(`data-${opts.attrPrefix}-setcat`) || '';
  if (!cat) return false;
  opts.setActive(cat);
  patchSettingsDetail({
    root: opts.root,
    detailSel: `.thw-set2-detail[data-set2-detail="${opts.attrPrefix}"]`,
    navSel: `[data-${opts.attrPrefix}-setcat]`,
    navAttr: `data-${opts.attrPrefix}-setcat`,
    navOnClass: 'thw-nav-on',
    cat,
    html: opts.renderDetail(cat),
    rebind: opts.rebind,
  });
  return true;
}
