// 世界套件 · 记忆（memory-center.ts）
// 定位：全套件唯一的「角色记忆」管理中心 + 记忆总控。每个角色档案(contactId)一个记忆池，跨 app 共享——
//   微信/通话/糖心… 任何以该角色身份的互动，其小结都汇入这里；池即该角色注入进所有 app 的记忆。
//   一处变动、处处同步；角色隔离，绝不互串。（世界演化/小剧场为多角色叙事，独立成「场景记忆」不入池。）
// 三栏 .thw-mem-app2（左：角色池列表 + 独立场景 / 中：五段典藏 + 工具条 + 就地编辑 / 右：注入预览/阈值/提示词/开关）。
// 固定三层压缩：关键设定 pinned（旁路·永不压缩·必带）+ 远期 longterm（主线）+ 中期 mid + 近期 shortterm
//   + 未了之事 unfinished（旁路·永不压缩·直到标已了）。raw 原话留各会话（即时语境不串味）。
import { esc, escAttr, qs } from '../../lib/dom-utils';
import { openModal2 } from '../../status-bar-init';
import { iconHtml } from '../../lib/icons';
import { phoneShellHtml, startPhoneClock } from '../../lib/world/phone-shell';
import { getWorldConfig, saveWorldConfig, getWorldApp, registerWorldApp } from '../../lib/world/world-store';
import { thToast, thConfirm, thPrompt } from '../../lib/world/ui-kit';
import { getContact } from '../../lib/world/contacts';
import { getPromptTemplate, getPromptText, setPromptOverride, resetPrompt, isPromptOverridden } from '../../lib/world/world-prompts';
import { aiPromptEditorHtml, bindAiPromptEditor } from './world-app-settings';
import {
  // 角色池
  listPools, getPool, deletePool, effectivePoolConfig,
  addPoolPinned, pinPoolSummary, editPoolItem, deletePoolItem, addPoolItem, setPoolItemImportance,
  runPoolMidCompress, runPoolLongCompress, manualPoolSummarize, selectiveSummarize, mergePoolItems,
  addPoolUnfinished, togglePoolUnfinished, editPoolUnfinished, deletePoolUnfinished,
  setPoolMuted, setPoolOverrides, previewPoolInjection,
  type CharPool, type MemImportance, type PoolTier,
  // 独立场景记忆（演化/小剧场/群聊等未绑角色的会话）
  listSessions, getSession, deleteSession, type MemIndexEntry,
  estimateTokens,
} from '../../lib/world/memory';
import { makeSummarizer } from '../../lib/world/ai-chat';

const MEM_MODAL_MAXW = 'min(1120px,97vw)';
const RID = 'th-mem-app-root';
const MEM_PROMPT_IDS = ['memory.summarize.short', 'memory.summarize.mid', 'memory.summarize.long', 'memory.summarize.merge'];
let _busy = false;
let _selPool: string | null = null;   // 当前选中的角色池 contactId
let _selSess: string | null = null;   // 当前选中的独立场景会话 id
let _query = '';
let _showPreview = false;
// 跨层多选（供「选择总结」「条目合并」）。key = tier:id
let _picking = false;
const _picks = new Set<string>();
let _memSearchTimer: ReturnType<typeof setTimeout> | null = null;

function rootEl(): HTMLElement | null { return qs<HTMLElement>('#' + RID); }
function pct(n: number, max: number): number { return max <= 0 ? 0 : Math.min(100, Math.round((n / max) * 100)); }
function relTime(ts: number): string {
  if (!ts) return '';
  const d = Date.now() - ts;
  if (d < 60e3) return '刚刚';
  if (d < 3600e3) return Math.floor(d / 60e3) + ' 分钟前';
  if (d < 86400e3) return Math.floor(d / 3600e3) + ' 小时前';
  if (d < 7 * 86400e3) return Math.floor(d / 86400e3) + ' 天前';
  const dt = new Date(ts); return `${dt.getMonth() + 1}/${dt.getDate()}`;
}
function appIcon(appId: string): { icon: string; accent: string } {
  const a = getWorldApp(appId);
  return { icon: a?.icon || 'fa-comment', accent: a?.accent || '#8b5cf6' };
}
function appName(appId: string): string { return getWorldApp(appId)?.name || appId; }
// 角色头像/首字（池展示用）
function poolAvatar(cid: string, name: string): string {
  const c = getContact(cid);
  if (c?.avatar) return `<img src="${escAttr(c.avatar)}" alt="">`;
  return esc((name || '?').slice(0, 1));
}
// 独立场景会话：只列没绑 contactId 的（群聊/演化/小剧场）
function loneSessions(): MemIndexEntry[] { return listSessions().filter(s => !s.contactId); }

// __MEM_SIDEBAR__

// ==================== 左栏：记忆书架（角色池 + 独立场景）====================
function poolRowHtml(p: { contactId: string; name: string; updatedAt: number; counts: { pinned: number; long: number; mid: number; short: number; open: number }; appCount: number }): string {
  const total = p.counts.pinned + p.counts.long + p.counts.mid + p.counts.short;
  return `<button class="thw-mem-sess${_selPool === p.contactId ? ' on' : ''}" data-mem-pool="${escAttr(p.contactId)}" type="button" title="${escAttr(p.name)}">
    <span class="thw-mem-sess-av thw-mem-pool-av">${poolAvatar(p.contactId, p.name)}</span>
    <span class="thw-mem-sess-main">
      <span class="thw-mem-sess-name">${esc(p.name)}</span>
      <span class="thw-mem-sess-sub">${total} 条 · ${p.appCount} 个 app · ${esc(relTime(p.updatedAt))}</span>
    </span>
    <span class="thw-mem-sess-badges">
      ${p.counts.pinned ? `<i class="thw-mem-b thw-mem-b-pin" title="关键设定">${iconHtml('fa-thumbtack')}${p.counts.pinned}</i>` : ''}
      ${p.counts.open ? `<i class="thw-mem-b thw-mem-b-open" title="未了之事">${iconHtml('fa-hourglass-half')}${p.counts.open}</i>` : ''}
      ${p.counts.long ? `<i class="thw-mem-b thw-mem-b-long" title="远期">${p.counts.long}</i>` : ''}
      ${p.counts.mid ? `<i class="thw-mem-b thw-mem-b-mid" title="中期">${p.counts.mid}</i>` : ''}
      ${p.counts.short ? `<i class="thw-mem-b thw-mem-b-short" title="近期">${p.counts.short}</i>` : ''}
    </span>
  </button>`;
}
function sidebarHtml(): string {
  const q = _query.trim().toLowerCase();
  const pools = listPools().filter(p => !q || p.name.toLowerCase().includes(q));
  const lones = loneSessions().filter(s => !q || s.title.toLowerCase().includes(q) || s.appName.toLowerCase().includes(q));
  const poolList = pools.length ? pools.map(poolRowHtml).join('')
    : `<div class="thw-empty thw-mem-side-empty">${q ? '没有匹配的角色' : '还没有角色记忆'}</div>`;
  const loneList = lones.length ? lones.map(s => {
    const ic = appIcon(s.appId);
    const tot = (s.counts.pinned || 0) + (s.counts.long || 0) + (s.counts.mid || 0) + (s.counts.short || 0) + (s.counts.buffer || 0);
    return `<button class="thw-mem-sess${_selSess === s.id ? ' on' : ''}" data-mem-sess="${escAttr(s.id)}" type="button" title="${escAttr(s.title)}">
      <span class="thw-mem-sess-av" style="background:${escAttr(ic.accent)}">${iconHtml(ic.icon)}</span>
      <span class="thw-mem-sess-main"><span class="thw-mem-sess-name">${esc(s.title)}</span>
        <span class="thw-mem-sess-sub">${esc(s.appName)} · ${tot} 条 · ${esc(relTime(s.updatedAt))}</span></span>
    </button>`;
  }).join('') : '';
  const loneSec = lones.length ? `<div class="thw-mem-grp">
      <div class="thw-mem-grp-h"><span class="thw-mem-grp-ico" style="background:#64748b">${iconHtml('fa-masks-theater')}</span><span class="thw-mem-grp-name">独立场景记忆</span> <span class="thw-mem-grp-n">${lones.length}</span></div>
      ${loneList}
    </div>` : '';
  const poolTot = listPools().length;
  const loneTot = loneSessions().length;
  return `<div class="thw-sidebar thw-mem-side">
    <div class="thw-sidebar-brand">${iconHtml('fa-book-bookmark')} 记忆书架</div>
    <div class="thw-mem-search"><span class="thw-mem-search-ico">${iconHtml('fa-magnifying-glass')}</span>
      <input type="text" class="thw-input thw-mem-search-in" placeholder="搜索角色 / 场景…" value="${escAttr(_query)}"></div>
    <div class="thw-mem-grp-list">
      <button class="thw-mem-sess thw-mem-home${!_selPool && !_selSess ? ' on' : ''}" data-mem-home type="button">
        <span class="thw-mem-sess-av" style="background:linear-gradient(135deg,#c06fb0,#8e3f7e)">${iconHtml('fa-gauge-high')}</span>
        <span class="thw-mem-sess-main"><span class="thw-mem-sess-name">记忆总览</span><span class="thw-mem-sess-sub">仪表盘 · 全局设置</span></span>
      </button>
      <div class="thw-mem-grp">
        <div class="thw-mem-grp-h"><span class="thw-mem-grp-ico" style="background:linear-gradient(135deg,#c06fb0,#8e3f7e)">${iconHtml('fa-users')}</span><span class="thw-mem-grp-name">角色</span> <span class="thw-mem-grp-n">${pools.length}</span></div>
        ${poolList}
      </div>
      ${loneSec}
    </div>
    <div class="thw-mem-side-foot">${poolTot} 位角色 · ${loneTot} 个独立场景</div>
  </div>`;
}


// __MEM_CENTER__

// ==================== 中栏：五段典藏 + 工具条 + 就地编辑 ====================
const IMP_DOT: Record<number, string> = { 1: '低', 2: '中', 3: '高' };
// 单条记忆（可勾选 / 编辑 / 删除 / 钉 / 改权重）
function tierItem(id: string, tier: PoolTier, text: string, imp: MemImportance | undefined, ops: string[]): string {
  const opBtns = ops.map(o =>
    o === 'pin' ? `<button class="thw-iconbtn" data-mem-pin type="button" title="升为关键设定">${iconHtml('fa-thumbtack')}</button>`
      : o === 'imp' ? `<button class="thw-iconbtn thw-mem-impbtn" data-mem-imp type="button" title="重要性权重（点击切换 低/中/高）">${esc(IMP_DOT[imp || 2])}</button>`
        : o === 'edit' ? `<button class="thw-iconbtn" data-mem-edit type="button" title="编辑">${iconHtml('fa-pen')}</button>`
          : `<button class="thw-iconbtn" data-mem-del type="button" title="删除">${iconHtml('fa-xmark')}</button>`).join('');
  const pk = tier + ':' + id;
  const checkbox = _picking && tier !== 'pinned'
    ? `<label class="thw-mem-pickbox"><input type="checkbox" class="thw-mem-pickcb" data-mem-pick="${escAttr(pk)}" ${_picks.has(pk) ? 'checked' : ''}></label>` : '';
  return `<div class="thw-mem-item${imp === 3 ? ' imp-hi' : imp === 1 ? ' imp-lo' : ''}${_picks.has(pk) ? ' picked' : ''}" data-mem-item="${escAttr(id)}" data-mem-tier="${esc(tier)}">
    ${checkbox}<div class="thw-mem-item-text">${esc(text)}</div>
    <div class="thw-mem-item-ops">${opBtns}</div>
  </div>`;
}
// 空态 / 总览仪表盘
function dashboardHtml(): string {
  const pools = listPools();
  const agg = pools.reduce((a, p) => { a.pinned += p.counts.pinned; a.long += p.counts.long; a.mid += p.counts.mid; a.short += p.counts.short; a.open += p.counts.open; return a; }, { pinned: 0, long: 0, mid: 0, short: 0, open: 0 });
  const statCard = (icon: string, label: string, n: number, cls: string) =>
    `<div class="thw-mem-stat ${cls}"><span class="thw-mem-stat-ico">${iconHtml(icon)}</span><span class="thw-mem-stat-n">${n}</span><span class="thw-mem-stat-lbl">${label}</span></div>`;
  const cardsOrEmpty = pools.length ? pools.map(p => {
    const tot = p.counts.pinned + p.counts.long + p.counts.mid + p.counts.short;
    return `<button class="thw-mem-appcard" data-mem-pool="${escAttr(p.contactId)}" type="button">
      <span class="thw-mem-appcard-ico thw-mem-pool-av" style="background:linear-gradient(135deg,#c06fb0,#8e3f7e)">${poolAvatar(p.contactId, p.name)}</span>
      <span class="thw-mem-appcard-body"><span class="thw-mem-appcard-name">${esc(p.name)}</span>
        <span class="thw-mem-appcard-sub">${tot} 条经历 · 出没于 ${p.appCount} 个 app${p.counts.open ? ` · ${p.counts.open} 件未了` : ''}</span></span>
      <span class="thw-mem-appcard-arrow">${iconHtml('fa-chevron-right')}</span></button>`;
  }).join('') : `<div class="thw-empty thw-mem-pick-empty">${iconHtml('fa-hand-pointer')}<div>还没有角色记忆</div><div class="thw-empty-sub">与各 app 里的角色互动后，对话会自动沉淀为该角色的三层记忆，并在所有 app 中共享。</div></div>`;
  return `<div class="thw-content thw-mem-center">
    <div class="thw-topbar"><span class="thw-eyebrow">${iconHtml('fa-chart-pie')} 记忆总览</span><span class="thw-mem-app-tag">${pools.length} 位角色</span></div>
    <div class="thw-content-pad">
      <div class="thw-mem-hero">
        <div class="thw-mem-hero-ico">${iconHtml('fa-book-bookmark')}</div>
        <div class="thw-mem-hero-txt"><b>记忆典藏</b><span>你与每位角色共同经历的一切，都在这里静静沉淀、跨 app 相认。选一位角色，翻开你们的过往。</span></div>
      </div>
      <div class="thw-mem-stats">
        ${statCard('fa-thumbtack', '关键设定', agg.pinned, 'thw-mem-stat-pin')}
        ${statCard('fa-layer-group', '远期主线', agg.long, 'thw-mem-stat-long')}
        ${statCard('fa-water', '中期脉络', agg.mid, 'thw-mem-stat-mid')}
        ${statCard('fa-note-sticky', '近期发生', agg.short, 'thw-mem-stat-short')}
        ${statCard('fa-hourglass-half', '未了之事', agg.open, 'thw-mem-stat-open')}
      </div>
      <div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-users')} 角色记忆</span></div>
      <div class="thw-mem-appcards">${cardsOrEmpty}</div>
    </div>
  </div>`;
}
// 五段典藏视图
function poolCenterHtml(p: CharPool): string {
  const cfg = effectivePoolConfig(p);
  const srcChips = Object.keys(p.sources || {}).map(aid =>
    `<span class="thw-mem-srcchip"><i class="thw-mem-srcchip-ic" style="background:${escAttr(appIcon(aid).accent)}">${iconHtml(appIcon(aid).icon)}</i>${esc(appName(aid))} <em>${p.sources[aid]}</em></span>`).join('');
  const srcBlk = srcChips ? `<div class="thw-mem-srcbar">${iconHtml('fa-diagram-project')} 记忆来源：${srcChips}</div>` : '';
  // 工具条（勾选态时切换为「合并/选择总结/取消」）
  const toolbar = _picking
    ? `<div class="thw-mem-toolbar picking">
        <span class="thw-mem-tool-hint">${iconHtml('fa-check-double')} 已勾选 <b>${_picks.size}</b> 条</span>
        <button class="thw-btn thw-btn-mini thw-btn-primary" data-mem-merge type="button">${iconHtml('fa-object-group')} 合并成一条</button>
        <button class="thw-btn thw-btn-mini" data-mem-selsum type="button">${iconHtml('fa-compress')} 归纳到上层</button>
        <button class="thw-btn thw-btn-mini" data-mem-pickcancel type="button">${iconHtml('fa-xmark')} 取消</button>
      </div>`
    : `<div class="thw-mem-toolbar">
        <button class="thw-btn thw-btn-mini" data-mem-nowsum type="button" title="不等阈值，立刻把近期归纳一条中期">${iconHtml('fa-bolt')} 立即总结</button>
        <button class="thw-btn thw-btn-mini" data-mem-pickstart type="button" title="勾选任意条做选择总结或跨层合并">${iconHtml('fa-check-double')} 选择/合并</button>
        <button class="thw-btn thw-btn-mini" data-mem-additem type="button" title="手写种入一条记忆">${iconHtml('fa-plus')} 新增条目</button>
      </div>`;
  // 关键设定（旁路）
  const pinned = `<div class="thw-mem-tier thw-mem-t-pin">
    <div class="thw-mem-tier-h">${iconHtml('fa-thumbtack')} 关键设定 <span class="thw-mem-tier-n">${p.pinned.length}</span><em>永不压缩，每次必带</em></div>
    <div class="thw-mem-tier-body">
      ${p.pinned.length ? p.pinned.map(x => tierItem(x.id, 'pinned', x.text, undefined, ['edit', 'del'])).join('') : '<div class="thw-mem-tier-empty">把人物关系/身份/底色钉在这里</div>'}
      <div class="thw-mem-addpin"><input type="text" class="thw-input thw-mem-pin-in" placeholder="新增关键设定…"><button class="thw-btn thw-btn-mini" data-mem-addpin type="button">${iconHtml('fa-plus')} 钉住</button></div>
    </div></div>`;
  // 未了之事（旁路）
  const open = (p.unfinished || []);
  const unfin = `<div class="thw-mem-tier thw-mem-t-open">
    <div class="thw-mem-tier-h">${iconHtml('fa-hourglass-half')} 未了之事 <span class="thw-mem-tier-n">${open.filter(x => !x.done).length}</span><em>约定/伏笔，永不压缩直到了结</em></div>
    <div class="thw-mem-tier-body">
      ${open.length ? open.map(x => `<div class="thw-mem-item thw-mem-open-item${x.done ? ' done' : ''}" data-mem-open="${escAttr(x.id)}">
        <button class="thw-iconbtn thw-mem-open-check" data-mem-open-toggle type="button" title="${x.done ? '标为未了' : '标为已了'}">${iconHtml(x.done ? 'fa-square-check' : 'fa-square')}</button>
        <div class="thw-mem-item-text">${esc(x.text)}</div>
        <div class="thw-mem-item-ops"><button class="thw-iconbtn" data-mem-open-edit type="button" title="编辑">${iconHtml('fa-pen')}</button><button class="thw-iconbtn" data-mem-open-del type="button" title="删除">${iconHtml('fa-xmark')}</button></div>
      </div>`).join('') : '<div class="thw-mem-tier-empty">记下还没兑现的约定、目标、伏笔</div>'}
      <div class="thw-mem-addpin"><input type="text" class="thw-input thw-mem-open-in" placeholder="新增一件未了之事…"><button class="thw-btn thw-btn-mini" data-mem-addopen type="button">${iconHtml('fa-plus')} 添加</button></div>
    </div></div>`;
  // 远期主线
  const longt = `<div class="thw-mem-tier thw-mem-t-long">
    <div class="thw-mem-tier-h">${iconHtml('fa-layer-group')} 远期主线 <span class="thw-mem-tier-n">${p.longterm.length}</span><em>经久的事实与走向</em></div>
    <div class="thw-mem-tier-body">${p.longterm.length ? p.longterm.map(l => tierItem(l.id, 'long', l.text, l.importance, ['pin', 'imp', 'edit', 'del'])).join('') : '<div class="thw-mem-tier-empty">中期记忆累积到阈值后并入这里</div>'}</div></div>`;
  // 中期脉络
  const midt = `<div class="thw-mem-tier thw-mem-t-mid">
    <div class="thw-mem-tier-h">${iconHtml('fa-water')} 中期脉络 <span class="thw-mem-tier-n">${p.mid.length}</span><em>这段时间的脉络</em>
      ${p.mid.length ? `<button class="thw-btn thw-btn-mini thw-mem-tier-act" data-mem-mid2long type="button">${iconHtml('fa-arrow-up')} 并入主线</button>` : ''}</div>
    <div class="thw-mem-progress"><div class="thw-mem-progress-bar" style="width:${pct(p.mid.length, cfg.farThreshold)}%"></div><span>${p.mid.length}/${cfg.farThreshold} 后并入主线</span></div>
    <div class="thw-mem-tier-body">${p.mid.length ? p.mid.map(m => tierItem(m.id, 'mid', m.text, m.importance, ['pin', 'imp', 'edit', 'del'])).join('') : '<div class="thw-mem-tier-empty">近期记忆累积到阈值后归纳到这里</div>'}</div></div>`;
  // 近期发生
  const shortt = `<div class="thw-mem-tier thw-mem-t-short">
    <div class="thw-mem-tier-h">${iconHtml('fa-note-sticky')} 近期发生 <span class="thw-mem-tier-n">${p.shortterm.length}</span><em>最近发生 · 细节丰富</em>
      ${p.shortterm.length ? `<button class="thw-btn thw-btn-mini thw-mem-tier-act" data-mem-short2mid type="button">${iconHtml('fa-compress')} 归纳中期</button>` : ''}</div>
    <div class="thw-mem-progress"><div class="thw-mem-progress-bar" style="width:${pct(p.shortterm.length, cfg.midThreshold)}%"></div><span>${p.shortterm.length}/${cfg.midThreshold} 后归纳中期</span></div>
    <div class="thw-mem-tier-body">${p.shortterm.length ? p.shortterm.map(x => tierItem(x.id, 'short', x.text, x.importance, ['pin', 'imp', 'edit', 'del'])).join('') : '<div class="thw-mem-tier-empty">该角色在各 app 的经历会汇聚到这里</div>'}</div></div>`;
  return `<div class="thw-content thw-mem-center" data-mem-center-root data-mem-cid="${escAttr(p.contactId)}">
    <div class="thw-topbar"><span class="thw-eyebrow">${iconHtml('fa-user')} ${esc(p.name)}</span><span class="thw-mem-app-tag">跨 ${Object.keys(p.sources || {}).length} 个 app 共享</span></div>
    <div class="thw-content-pad thw-mem-tiers">${srcBlk}${toolbar}${pinned}${unfin}${longt}${midt}${shortt}</div>
  </div>`;
}
function centerHtml(): string {
  if (_selPool) {
    const p = getPool(_selPool);
    if (!p) return `<div class="thw-content thw-mem-center"><div class="thw-empty">角色记忆不存在或已删除</div></div>`;
    return poolCenterHtml(p);
  }
  if (_selSess) return loneCenterHtml();
  return dashboardHtml();
}
// 独立场景会话视图（只读概览 + 删除；不参与池）
function loneCenterHtml(): string {
  const s = _selSess ? getSession(_selSess) : null;
  if (!s) return `<div class="thw-content thw-mem-center"><div class="thw-empty">场景记忆不存在或已删除</div></div>`;
  const line = (label: string, arr: { text?: string; content?: string }[]) => arr.length
    ? `<div class="thw-mem-tier"><div class="thw-mem-tier-h">${esc(label)} <span class="thw-mem-tier-n">${arr.length}</span></div>
       <div class="thw-mem-tier-body">${arr.map(x => `<div class="thw-mem-item"><div class="thw-mem-item-text">${esc(x.text || x.content || '')}</div></div>`).join('')}</div></div>` : '';
  return `<div class="thw-content thw-mem-center" data-mem-center-root data-mem-sid="${escAttr(s.id)}">
    <div class="thw-topbar"><span class="thw-eyebrow">${iconHtml('fa-masks-theater')} ${esc(s.title)}</span><span class="thw-mem-app-tag">${esc(s.appName)}·独立场景</span></div>
    <div class="thw-content-pad thw-mem-tiers">
      <div class="thw-mem-srcbar">${iconHtml('fa-circle-info')} 多角色叙事场景（演化/小剧场/群聊）不并入角色池，独立留存以免记忆串人。</div>
      ${line('关键设定', s.pinned)}${line('远期主线', s.longterm)}${line('中期脉络', s.mid)}${line('近期发生', s.shortterm)}${line('待总结', s.buffer)}
    </div>
  </div>`;
}


// __MEM_INSPECTOR__

// ==================== 右栏：注入预览 / 静音 / 阈值 / 提示词 / 数据 ====================
function switchRow(label: string, hint: string, cls: string, on: boolean): string {
  return `<label class="thw-switchrow"><span class="thw-switchrow-main"><b>${label}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</span>
    <span class="thw-switch"><input type="checkbox" class="${cls}" ${on ? 'checked' : ''}><span class="thw-switch-track"></span></span></label>`;
}
// 三条总结提示词就地编辑器（复用 aiPromptEditor）
function memPromptEditorsHtml(): string {
  const block = (id: string) => {
    const tpl = getPromptTemplate(id); if (!tpl) return '';
    return `<details class="th-amem-pe" data-mem-pe-id="${escAttr(id)}">
      <summary>${iconHtml('fa-feather')} ${esc(tpl.name)}${isPromptOverridden(id) ? ' <em class="thw-mem-ov">已改</em>' : ''}</summary>
      <div class="thw-set-hint">${esc(tpl.desc || '')}</div>
      <textarea class="th-amem-pe-text thw-input" rows="8">${esc(getPromptText(id))}</textarea>
      ${aiPromptEditorHtml(id)}
      <div class="thw-mem-pe-acts">
        <button class="thw-btn thw-btn-mini" data-mem-pe-reset type="button">${iconHtml('fa-rotate-left')} 恢复默认</button>
        <button class="thw-btn thw-btn-mini thw-btn-primary" data-mem-pe-save type="button">${iconHtml('fa-check')} 保存</button>
      </div>
    </details>`;
  };
  return `<div class="thw-mem-prompts">
    <div class="thw-set-hint">${iconHtml('fa-feather')} 三层压缩用的提示词（近期小结 / 中期归纳 / 远期主线）+ 手动合并——全 app 通用，可改写或用 AI 重写。字数上限会自动带入 <code>{{cap}}</code>。</div>
    ${MEM_PROMPT_IDS.map(block).join('')}
  </div>`;
}
// 总览态右栏：全局记忆节奏 + 字数上限 + 三提示词
function globalSettingsInspector(): string {
  const m = getWorldConfig().memory;
  return `<div class="thw-inspector thw-mem-insp" data-mem-insp-root>
    <div class="thw-inspector-head"><span class="thw-inspector-title">${iconHtml('fa-sliders')} 记忆总控</span></div>
    <div class="thw-inspector-body">
      <div class="thw-sec">
        <div class="thw-set-hint">${iconHtml('fa-circle-info')} 每位角色的经历自动沉淀为<b>三层记忆</b>（近期→中期→远期）。这里是<b>全局默认</b>；各 app 按自身文本量另有专属节奏，单个角色还能在其池内单独覆盖。<br><small>优先级：角色覆盖 &gt; app 画像 &gt; 全局默认。</small></div>
      </div>
      <div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-gauge')} 沉淀节奏</span></div>
        <div class="thw-field"><div class="thw-flabel">小结触发·字数（主尺，攒够多少字压一条近期）</div><input type="number" min="200" class="thw-input thw-mem-g-char" value="${esc(String(m.charThreshold))}"></div>
        <div class="thw-field"><div class="thw-flabel">小结触发·条数保底（先到为准）</div><input type="number" min="1" class="thw-input thw-mem-g-short" value="${esc(String(m.shortThreshold))}"></div>
        <div class="thw-field"><div class="thw-flabel">归纳阈值：每 N 条近期 → 一条中期</div><input type="number" min="1" class="thw-input thw-mem-g-mid" value="${esc(String(m.midThreshold))}"></div>
        <div class="thw-field"><div class="thw-flabel">主线阈值：每 N 条中期 → 并入远期</div><input type="number" min="1" class="thw-input thw-mem-g-far" value="${esc(String(m.farThreshold))}"></div>
      </div>
      <div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-text-width')} 三层字数上限</span></div>
        <div class="thw-field"><div class="thw-flabel">近期小结 ≤ 字数</div><input type="number" min="50" class="thw-input thw-mem-g-rcap" value="${esc(String(m.recentCap))}"></div>
        <div class="thw-field"><div class="thw-flabel">中期归纳 ≤ 字数</div><input type="number" min="50" class="thw-input thw-mem-g-mcap" value="${esc(String(m.midCap))}"></div>
        <div class="thw-field"><div class="thw-flabel">远期主线 ≤ 字数</div><input type="number" min="50" class="thw-input thw-mem-g-fcap" value="${esc(String(m.farCap))}"></div>
      </div>
      <div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-syringe')} 注入携带</span></div>
        <div class="thw-set-hint">三层压缩层间零重复，注入时<b>远/中/近全带</b>，不做「只带最近 N 条」。这里只调附带的最近原始对话条数。</div>
        <div class="thw-field"><div class="thw-flabel">附带最近原始对话条数</div><input type="number" min="0" class="thw-input thw-mem-g-raw" value="${esc(String(m.recentRawCount))}"></div>
        <button class="thw-btn-primary thw-btn-mini" data-mem-gsave type="button">${iconHtml('fa-check')} 保存全局设置</button>
      </div>
      <div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-feather')} 总结提示词</span></div>
        ${memPromptEditorsHtml()}
      </div>
    </div>
  </div>`;
}
function inspectorHtml(): string {
  // 独立场景仅给删除
  if (_selSess && !_selPool) {
    return `<div class="thw-inspector thw-mem-insp" data-mem-insp-root>
      <div class="thw-inspector-head"><span class="thw-inspector-title">${iconHtml('fa-database')} 数据</span></div>
      <div class="thw-inspector-body"><div class="thw-sec">
        <button class="thw-btn thw-btn-mini thw-btn-danger" data-mem-delsess type="button">${iconHtml('fa-trash')} 删除此场景记忆</button>
      </div></div></div>`;
  }
  if (!_selPool) return globalSettingsInspector();
  const p = getPool(_selPool);
  if (!p) return `<div class="thw-inspector thw-mem-insp"></div>`;
  const ov = p.overrides || {};
  const g = getWorldConfig().memory;
  const prev = previewPoolInjection(p.contactId);
  const previewBlk = _showPreview ? `<pre class="thw-mem-pv-pre">${esc(prev.text || '（此刻无可注入记忆）')}</pre>` : '';
  return `<div class="thw-inspector thw-mem-insp" data-mem-insp-root>
    <div class="thw-inspector-head"><span class="thw-inspector-title">${iconHtml('fa-syringe')} 注入与共享</span></div>
    <div class="thw-inspector-body">
      <div class="thw-sec">
        <div class="thw-set-hint">这份记忆会作为记忆块注入到所有以 <b>${esc(p.name)}</b> 身份进行的 app 对话里（远/中/近全带）。</div>
        ${switchRow('静音此角色', '开启后该角色记忆不注入任何 app（数据保留、继续沉淀，只是这阵不喂 AI）', 'thw-mem-mute', !!p.muted)}
        <div class="thw-mem-tokrow ${prev.muted ? 'muted' : ''}">
          <span>${iconHtml('fa-coins')} 注入约 <b>${prev.muted ? 0 : prev.tokens}</b> tokens</span>
          <button class="thw-btn thw-btn-mini" data-mem-preview type="button">${iconHtml('fa-eye')} ${_showPreview ? '收起' : '预览'}</button>
        </div>
        ${previewBlk}
      </div>
      <div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-sliders')} 单角色记忆节奏</span></div>
        <div class="thw-set-hint">留空＝用全局/画像默认。下方灰字即当前生效默认值。</div>
        <div class="thw-field"><div class="thw-flabel">归纳阈值（近期→中期）</div><input type="number" min="1" class="thw-input thw-mem-ov-mid" value="${ov.midThreshold != null ? esc(String(ov.midThreshold)) : ''}" placeholder="${esc(String(g.midThreshold))}"></div>
        <div class="thw-field"><div class="thw-flabel">主线阈值（中期→远期）</div><input type="number" min="1" class="thw-input thw-mem-ov-far" value="${ov.farThreshold != null ? esc(String(ov.farThreshold)) : ''}" placeholder="${esc(String(g.farThreshold))}"></div>
        <button class="thw-btn thw-btn-mini thw-btn-primary" data-mem-ovsave type="button">${iconHtml('fa-check')} 应用</button>
      </div>
      <div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-database')} 数据</span></div>
        <button class="thw-btn thw-btn-mini" data-mem-export type="button">${iconHtml('fa-download')} 导出此角色记忆</button>
        <button class="thw-btn thw-btn-mini thw-btn-danger" data-mem-delpool type="button">${iconHtml('fa-trash')} 清空此角色记忆池</button>
      </div>
    </div>
  </div>`;
}


// __MEM_RENDER__

function render(): void {
  const root = rootEl();
  if (!root) { openApp(); return; }
  root.innerHTML = `<div class="thw-app thw-mem-app2">
    <div class="thw-body">${sidebarHtml()}${centerHtml()}${inspectorHtml()}</div>
  </div>`;
}
function refreshSidebar(): void {
  const root = rootEl(); if (!root) return;
  const side = root.querySelector('.thw-mem-side') as HTMLElement | null;
  if (!side) return;
  const inp = side.querySelector('.thw-mem-search-in') as HTMLInputElement | null;
  const caret = inp?.selectionStart ?? null;
  side.outerHTML = sidebarHtml();
  const inp2 = root.querySelector('.thw-mem-search-in') as HTMLInputElement | null;
  if (inp2) { inp2.focus(); if (caret != null) try { inp2.setSelectionRange(caret, caret); } catch (e) { void e; } }
}


// __MEM_EVENTS__

function exportPool(p: CharPool): void {
  try {
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `角色记忆_${p.name}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
    thToast('已导出此角色记忆', 'success');
  } catch (e) { void e; thToast('导出失败', 'error'); }
}
// 异步跑一个池操作 + 忙态 + 刷新
function runBusy(label: string, fn: () => Promise<unknown>): void {
  if (_busy) return; _busy = true; thToast(label, 'info');
  void (async () => {
    try { await fn(); thToast('完成', 'success'); }
    catch (err) { thToast('生成失败：' + (err instanceof Error ? err.message : String(err)), 'error'); }
    finally { _busy = false; render(); }
  })();
}

function bindRoot(): void {
  const root = rootEl();
  if (!root || (root as any)._memBound) return;
  (root as any)._memBound = true;

  root.addEventListener('click', (e: Event) => {
    const t = e.target as HTMLElement;
    if (!t) return;
    // 提示词编辑器 AI 重写（先拦截）
    const peBox = t.closest('[data-mem-pe-id]') as HTMLElement | null;
    if (peBox) {
      const pid = peBox.getAttribute('data-mem-pe-id') || '';
      const ta = peBox.querySelector('.th-amem-pe-text') as HTMLTextAreaElement | null;
      if (ta && bindAiPromptEditor(e, () => ta.value, (text) => { ta.value = text; })) return;
      if (t.closest('[data-mem-pe-save]')) { if (ta) { setPromptOverride(pid, ta.value); thToast('已保存', 'success'); } return; }
      if (t.closest('[data-mem-pe-reset]')) { resetPrompt(pid); if (ta) ta.value = getPromptText(pid); thToast('已恢复默认', 'success'); return; }
    }
    // 总览 / 选择角色 / 独立场景
    if (t.closest('[data-mem-home]')) { _selPool = null; _selSess = null; _picking = false; _picks.clear(); _showPreview = false; render(); return; }
    const poolBtn = t.closest('[data-mem-pool]') as HTMLElement | null;
    if (poolBtn) { _selPool = poolBtn.getAttribute('data-mem-pool'); _selSess = null; _picking = false; _picks.clear(); _showPreview = false; render(); return; }
    const sessBtn = t.closest('[data-mem-sess]') as HTMLElement | null;
    if (sessBtn) { _selSess = sessBtn.getAttribute('data-mem-sess'); _selPool = null; _picking = false; _picks.clear(); _showPreview = false; render(); return; }

    // 总览态：保存全局记忆设置
    if (t.closest('[data-mem-gsave]')) {
      const num = (sel: string, def: number, lo: number, hi: number) => { const el = root.querySelector(sel) as HTMLInputElement | null; const n = Number(el?.value); return el && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.floor(n))) : def; };
      const cur = getWorldConfig().memory;
      saveWorldConfig({ memory: {
        ...cur,
        charThreshold: num('.thw-mem-g-char', cur.charThreshold, 200, 99999),
        shortThreshold: num('.thw-mem-g-short', cur.shortThreshold, 1, 999),
        midThreshold: num('.thw-mem-g-mid', cur.midThreshold, 1, 999),
        farThreshold: num('.thw-mem-g-far', cur.farThreshold, 1, 999),
        recentCap: num('.thw-mem-g-rcap', cur.recentCap, 50, 99999),
        midCap: num('.thw-mem-g-mcap', cur.midCap, 50, 99999),
        farCap: num('.thw-mem-g-fcap', cur.farCap, 50, 99999),
        recentRawCount: num('.thw-mem-g-raw', cur.recentRawCount, 0, 99),
      } });
      thToast('已保存全局设置', 'success'); return;
    }

    // 独立场景：仅删除
    if (_selSess && !_selPool) {
      if (t.closest('[data-mem-delsess]')) {
        const sid = _selSess;
        void thConfirm({ title: '删除场景记忆', message: '删除整个场景的记忆？不可恢复。', danger: true, confirmText: '删除' }).then(ok => { if (ok) { deleteSession(sid); _selSess = null; render(); thToast('已删除', 'success'); } });
      }
      return;
    }
    if (!_selPool) return;
    const cid = _selPool;

    // 右栏
    if (t.closest('[data-mem-preview]')) { _showPreview = !_showPreview; render(); return; }
    if (t.closest('[data-mem-export]')) { const p = getPool(cid); if (p) exportPool(p); return; }
    if (t.closest('[data-mem-delpool]')) {
      void thConfirm({ title: '清空角色记忆池', message: '清空该角色的全部记忆池？不可恢复。（不影响各 app 的对话记录本身）', danger: true, confirmText: '清空' }).then(ok => { if (ok) { deletePool(cid); _selPool = null; render(); thToast('已清空', 'success'); } });
      return;
    }
    if (t.closest('[data-mem-ovsave]')) {
      const num = (sel: string) => { const el = root.querySelector(sel) as HTMLInputElement | null; const n = Number(el?.value); return el && el.value.trim() !== '' && Number.isFinite(n) ? Math.floor(n) : undefined; };
      const ov: any = {};
      const mi = num('.thw-mem-ov-mid'); if (mi != null && mi >= 1) ov.midThreshold = mi;
      const fa = num('.thw-mem-ov-far'); if (fa != null && fa >= 1) ov.farThreshold = fa;
      setPoolOverrides(cid, ov); thToast('已应用', 'success'); render(); return;
    }

    // 工具条：立即总结 / 开始勾选 / 新增条目
    if (t.closest('[data-mem-nowsum]')) { runBusy('正在归纳近期记忆…', () => manualPoolSummarize(cid, makeSummarizer())); return; }
    if (t.closest('[data-mem-pickstart]')) { _picking = true; _picks.clear(); render(); return; }
    if (t.closest('[data-mem-pickcancel]')) { _picking = false; _picks.clear(); render(); return; }
    if (t.closest('[data-mem-additem]')) {
      void thPrompt({ title: '新增记忆条目', message: '手写一条记忆，会种入「近期发生」：', value: '', multiline: true }).then(v => {
        if (v != null && String(v).trim()) { addPoolItem(cid, 'short', String(v).trim()); render(); }
      });
      return;
    }
    // 归档按钮
    if (t.closest('[data-mem-short2mid]')) { runBusy('正在归纳中期…', () => runPoolMidCompress(cid, makeSummarizer())); return; }
    if (t.closest('[data-mem-mid2long]')) { runBusy('正在并入主线…', () => runPoolLongCompress(cid, makeSummarizer())); return; }

    // 勾选态：合并 / 归纳到上层
    if (t.closest('[data-mem-merge]')) {
      const picks = [..._picks].map(k => { const [tier, id] = k.split(':'); return { tier: tier as 'short' | 'mid' | 'long', id }; }).filter(x => x.tier !== ('pinned' as any));
      if (picks.length < 2) { thToast('至少勾选 2 条再合并', 'info'); return; }
      _picking = false; const list = picks.slice(); _picks.clear();
      runBusy('正在合并所选记忆…', () => mergePoolItems(cid, list, makeSummarizer()));
      return;
    }
    if (t.closest('[data-mem-selsum]')) {
      // 选择总结：要求同层勾选（跨层用合并）
      const picks = [..._picks].map(k => { const [tier, id] = k.split(':'); return { tier, id }; });
      const tiers = new Set(picks.map(x => x.tier));
      if (picks.length < 2) { thToast('至少勾选 2 条', 'info'); return; }
      if (tiers.size > 1) { thToast('「归纳到上层」需同层勾选；跨层请用「合并成一条」', 'info'); return; }
      const tier = picks[0].tier as 'short' | 'mid' | 'long';
      if (tier === 'long') { thToast('远期已是最高层，跨层合并请用「合并成一条」', 'info'); return; }
      _picking = false; const ids = picks.map(x => x.id); _picks.clear();
      runBusy('正在归纳所选…', () => selectiveSummarize(cid, tier, ids, 'up', makeSummarizer()));
      return;
    }

    // 关键设定新增
    if (t.closest('[data-mem-addpin]')) {
      const inp = root.querySelector('.thw-mem-pin-in') as HTMLInputElement | null;
      const v = inp?.value.trim() || ''; if (v) { addPoolPinned(cid, v); render(); } return;
    }
    // 未了之事
    if (t.closest('[data-mem-addopen]')) {
      const inp = root.querySelector('.thw-mem-open-in') as HTMLInputElement | null;
      const v = inp?.value.trim() || ''; if (v) { addPoolUnfinished(cid, v); render(); } return;
    }
    const openEl = t.closest('[data-mem-open]') as HTMLElement | null;
    if (openEl) {
      const oid = openEl.getAttribute('data-mem-open') || '';
      if (t.closest('[data-mem-open-toggle]')) { togglePoolUnfinished(cid, oid); render(); return; }
      if (t.closest('[data-mem-open-del]')) { deletePoolUnfinished(cid, oid); render(); return; }
      if (t.closest('[data-mem-open-edit]')) {
        const cur = (openEl.querySelector('.thw-mem-item-text') as HTMLElement | null)?.textContent || '';
        void thPrompt({ title: '编辑未了之事', message: '修改内容：', value: cur, multiline: true }).then(v => { if (v != null && String(v).trim()) { editPoolUnfinished(cid, oid, String(v).trim()); render(); } });
        return;
      }
    }

    // 条目操作（编辑/删除/钉/权重）
    const itemEl = t.closest('[data-mem-item]') as HTMLElement | null;
    if (!itemEl) return;
    const itemId = itemEl.getAttribute('data-mem-item') || '';
    const tier = (itemEl.getAttribute('data-mem-tier') || '') as PoolTier;
    if (!tier) return;
    if (t.closest('[data-mem-pin]') && (tier === 'short' || tier === 'mid' || tier === 'long')) { pinPoolSummary(cid, tier, itemId); render(); return; }
    if (t.closest('[data-mem-imp]') && (tier === 'short' || tier === 'mid' || tier === 'long')) {
      const p = getPool(cid); if (!p) return;
      const arr = tier === 'short' ? p.shortterm : tier === 'mid' ? p.mid : p.longterm;
      const it = arr.find(x => x.id === itemId); const cur = (it?.importance || 2);
      const next = (cur >= 3 ? 1 : cur + 1) as MemImportance;
      setPoolItemImportance(cid, tier, itemId, next); render(); return;
    }
    if (t.closest('[data-mem-del]')) { deletePoolItem(cid, tier, itemId); render(); return; }
    if (t.closest('[data-mem-edit]')) {
      const cur = (itemEl.querySelector('.thw-mem-item-text') as HTMLElement | null)?.textContent || '';
      void thPrompt({ title: '编辑记忆', message: '修改这条记忆内容：', value: cur, multiline: true }).then(next => {
        if (next != null && String(next).trim()) { editPoolItem(cid, tier, itemId, String(next).trim()); render(); }
      });
      return;
    }
  });

  root.addEventListener('input', (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.classList.contains('thw-mem-search-in')) {
      _query = (t as HTMLInputElement).value;
      if (_memSearchTimer) clearTimeout(_memSearchTimer);
      _memSearchTimer = setTimeout(() => refreshSidebar(), 220);
      return;
    }
  });
  root.addEventListener('change', (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.classList.contains('thw-mem-mute') && _selPool) { setPoolMuted(_selPool, (t as HTMLInputElement).checked); render(); return; }
    // 勾选条目
    if (t.classList.contains('thw-mem-pickcb')) {
      const k = t.getAttribute('data-mem-pick') || ''; if (!k) return;
      if ((t as HTMLInputElement).checked) _picks.add(k); else _picks.delete(k);
      // 只更新工具条计数与该条高亮，避免整页重渲丢焦点：轻量重渲中区
      render();
      return;
    }
  });
}


// __MEM_ENTRY__

function openApp(): void {
  openModal2(`${iconHtml('fa-brain')} 记忆`, phoneShellHtml({ rid: RID, appClass: 'th-mem' }), {
    maxWidth: MEM_MODAL_MAXW, reset: true, revive: openApp, phone: true,
  });
  startPhoneClock();
  bindRoot();
  render();
}
// 总览入口
export function openMemoryCenter(): void { _selPool = null; _selSess = null; _query = ''; _showPreview = false; _picking = false; _picks.clear(); openApp(); }
// 带 contactId 直接定位某角色池
export function openCharMemory(contactId: string): void { _selPool = contactId; _selSess = null; _query = ''; _showPreview = false; _picking = false; _picks.clear(); openApp(); }
// 兼容旧入口：打开总览
export function openSessionMemory(_sessionId?: string): void { openMemoryCenter(); }

// 注册为独立 app（悬浮球桌面出图标可点开）。记忆是全套件的记忆中枢。
registerWorldApp({
  id: 'memory', name: '记忆', icon: 'fa-brain',
  accent: 'linear-gradient(135deg,#c06fb0,#8e3f7e)', order: 150, open: openMemoryCenter,
});

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_memory_center__ = { openMemoryCenter, openCharMemory, openSessionMemory };
} catch (e) { void e; }
void estimateTokens;



