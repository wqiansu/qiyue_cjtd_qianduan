// 世界套件 P0 · 记忆中心 UI（memory-center.ts）
// 定位：记忆「设施」的可视化界面。从套件设置进入，或各 APP 内「记忆」按钮带 sessionId 进入。
//   - 总览：会话按 APP 分组列出（数量徽标），点进单会话。
//   - 单会话：四层（关键设定/长期/短期/待总结缓冲）可视化堆叠 + 进度条 +
//     立即小结 / 压缩长期 / 钉住 / 编辑 / 删除 / 清空 + 每会话阈值覆盖。
// 跨窗口：data 属性 + 委托；命令式 innerHTML + openModal2 reset/replace。
import { esc, qs } from '../../lib/dom-utils';
import { openModal2 } from '../../status-bar-init';
import { iconHtml } from '../../lib/icons';
import { getWorldConfig } from '../../lib/world/world-store';
import {
  listSessionsByApp, getSession, deleteSession, effectiveMemConfig,
  addPinned, removePinned, pinSummary, editMemItem, deleteMemItem,
  manualSummarize, runLongCompress, setSessionOverrides,
} from '../../lib/world/memory';
import { makeSummarizer } from '../../lib/world/ai-chat';

const MEM_MODAL_MAXW = 'min(880px,96vw)';
let _busy = false;

function toast(kind: 'success' | 'error' | 'info' | 'warning', msg: string): void {
  try { (window as any).toastr?.[kind]?.(msg); } catch (e) { void e; }
}

// MEM_UI_OVERVIEW

// ==================== 总览：按 APP 分组列出会话 ====================
function renderOverviewHtml(): string {
  const groups = listSessionsByApp();
  const g = getWorldConfig().memory;
  const head = `<div class="th-mem-head">
    <span class="th-mem-title">${iconHtml('fa-brain')} 记忆中心</span>
    <span class="th-mem-sub">全局阈值：小结每 ${esc(String(g.shortThreshold))} 条 · 长期每 ${esc(String(g.longThreshold))} 条小结</span>
  </div>`;
  if (!groups.length) {
    return `<div class="th-mem-center">${head}
      <div class="th-mem-empty">${iconHtml('fa-brain')}
        <div>还没有任何记忆</div>
        <div class="th-mem-empty-sub">和 APP 里的角色互动后，对话会自动在这里沉淀为四层记忆</div>
      </div></div>`;
  }
  const body = groups.map(grp => `
    <div class="th-mem-group">
      <div class="th-mem-group-label">${esc(grp.appName)} <span class="th-mem-group-count">${grp.sessions.length}</span></div>
      <div class="th-mem-sess-list">
        ${grp.sessions.map(s => `
          <button class="th-mem-sess-row" data-mem-open="${esc(s.id)}" type="button">
            <span class="th-mem-sess-name">${esc(s.title)}</span>
            <span class="th-mem-sess-badges">
              ${s.counts.pinned ? `<span class="th-mem-badge th-mem-badge-pin" title="关键设定">${iconHtml('fa-thumbtack')} ${s.counts.pinned}</span>` : ''}
              ${s.counts.long ? `<span class="th-mem-badge th-mem-badge-long" title="长期记忆">${s.counts.long}</span>` : ''}
              ${s.counts.short ? `<span class="th-mem-badge th-mem-badge-short" title="短期记忆">${s.counts.short}</span>` : ''}
              ${s.counts.buffer ? `<span class="th-mem-badge th-mem-badge-buf" title="待总结">${s.counts.buffer}</span>` : ''}
            </span>
          </button>`).join('')}
      </div>
    </div>`).join('');
  return `<div class="th-mem-center" data-mem-overview-root>${head}${body}</div>`;
}

function showOverview(): void {
  openModal2(`${iconHtml('fa-brain')} 记忆中心`, renderOverviewHtml(), {
    maxWidth: MEM_MODAL_MAXW, reset: true, revive: showOverview,
  });
  const root = qs('[data-mem-overview-root]');
  root?.addEventListener('click', (e: Event) => {
    const btn = (e.target as HTMLElement).closest('[data-mem-open]') as HTMLElement | null;
    if (btn) showSession(btn.getAttribute('data-mem-open') || '');
  });
}

// MEM_UI_SESSION

// ==================== 单会话：四层可视化 ====================
function pct(n: number, max: number): number { return max <= 0 ? 0 : Math.min(100, Math.round((n / max) * 100)); }

function renderSessionHtml(id: string): string {
  const s = getSession(id);
  if (!s) return `<div class="th-mem-center"><div class="th-mem-empty">会话不存在或已删除</div></div>`;
  const cfg = effectiveMemConfig(s);
  const ov = s.overrides || {};

  const head = `<div class="th-mem-head">
    <button class="th-mem-back" data-mem-back type="button">${iconHtml('fa-arrow-left')} 记忆中心</button>
    <span class="th-mem-title">${esc(s.title)}</span>
    <span class="th-mem-sub">${esc(s.appName)}</span>
  </div>`;

  const pinned = `<div class="th-mem-tier th-mem-tier-pin">
    <div class="th-mem-tier-head">${iconHtml('fa-thumbtack')} 关键设定 <span class="th-mem-tier-n">${s.pinned.length}</span>
      <span class="th-mem-tier-hint">永不压缩，每次必带</span></div>
    <div class="th-mem-tier-body">
      ${s.pinned.length ? s.pinned.map(p => `
        <div class="th-mem-item" data-mem-item="${esc(p.id)}" data-mem-tier="pinned">
          <div class="th-mem-item-text">${esc(p.text)}</div>
          <div class="th-mem-item-ops">
            <button data-mem-edit type="button" title="编辑">${iconHtml('fa-pen')}</button>
            <button data-mem-del type="button" title="移除">${iconHtml('fa-xmark')}</button>
          </div>
        </div>`).join('') : '<div class="th-mem-tier-empty">无（可把重要设定钉在这里）</div>'}
      <div class="th-mem-addpin"><input type="text" class="th-mem-pin-input" placeholder="新增关键设定…（人物关系/世界观锚点）">
        <button data-mem-addpin type="button">${iconHtml('fa-plus')} 钉住</button></div>
    </div>
  </div>`;

  const longt = `<div class="th-mem-tier th-mem-tier-long">
    <div class="th-mem-tier-head">${iconHtml('fa-layer-group')} 长期记忆 <span class="th-mem-tier-n">${s.longterm.length}</span>
      <span class="th-mem-tier-hint">主线大总结</span></div>
    <div class="th-mem-tier-body">
      ${s.longterm.length ? s.longterm.map(l => `
        <div class="th-mem-item" data-mem-item="${esc(l.id)}" data-mem-tier="long">
          <div class="th-mem-item-text">${esc(l.text)}</div>
          <div class="th-mem-item-ops">
            <button data-mem-pin type="button" title="升为关键设定">${iconHtml('fa-thumbtack')}</button>
            <button data-mem-edit type="button" title="编辑">${iconHtml('fa-pen')}</button>
            <button data-mem-del type="button" title="删除">${iconHtml('fa-xmark')}</button>
          </div>
        </div>`).join('') : '<div class="th-mem-tier-empty">短期记忆累积到阈值后自动压缩到这里</div>'}
    </div>
  </div>`;

  const shortBar = `<div class="th-mem-progress"><div class="th-mem-progress-bar" style="width:${pct(s.shortterm.length, cfg.longThreshold)}%"></div>
    <span class="th-mem-progress-label">${s.shortterm.length}/${cfg.longThreshold} 条后压缩长期</span></div>`;
  const shortt = `<div class="th-mem-tier th-mem-tier-short">
    <div class="th-mem-tier-head">${iconHtml('fa-note-sticky')} 短期记忆 <span class="th-mem-tier-n">${s.shortterm.length}</span>
      <span class="th-mem-tier-hint">小结</span>
      ${s.shortterm.length ? `<button class="th-mem-tier-act" data-mem-compress type="button">${iconHtml('fa-compress')} 压缩长期</button>` : ''}</div>
    ${shortBar}
    <div class="th-mem-tier-body">
      ${s.shortterm.length ? s.shortterm.map(x => `
        <div class="th-mem-item" data-mem-item="${esc(x.id)}" data-mem-tier="short">
          <div class="th-mem-item-text">${esc(x.text)}</div>
          <div class="th-mem-item-ops">
            <button data-mem-pin type="button" title="升为关键设定">${iconHtml('fa-thumbtack')}</button>
            <button data-mem-edit type="button" title="编辑">${iconHtml('fa-pen')}</button>
            <button data-mem-del type="button" title="删除">${iconHtml('fa-xmark')}</button>
          </div>
        </div>`).join('') : '<div class="th-mem-tier-empty">待总结对话累积到阈值后自动小结到这里</div>'}
    </div>
  </div>`;

  const bufBar = `<div class="th-mem-progress"><div class="th-mem-progress-bar" style="width:${pct(s.buffer.length, cfg.shortThreshold)}%"></div>
    <span class="th-mem-progress-label">${s.buffer.length}/${cfg.shortThreshold} 条后自动小结</span></div>`;
  const buffer = `<div class="th-mem-tier th-mem-tier-buf">
    <div class="th-mem-tier-head">${iconHtml('fa-comments')} 待总结对话 <span class="th-mem-tier-n">${s.buffer.length}</span>
      <span class="th-mem-tier-hint">最新原始对话</span>
      ${s.buffer.length ? `<button class="th-mem-tier-act" data-mem-summarize type="button">${iconHtml('fa-wand-magic-sparkles')} 立即小结</button>` : ''}</div>
    ${bufBar}
    <div class="th-mem-tier-body">
      ${s.buffer.length ? s.buffer.map(t => `
        <div class="th-mem-item th-mem-raw th-mem-raw-${t.role}" data-mem-item="${esc(t.id)}" data-mem-tier="buffer">
          <div class="th-mem-item-text"><b>${t.role === 'user' ? '我' : '对方'}：</b>${esc(t.content)}</div>
          <div class="th-mem-item-ops">
            <button data-mem-edit type="button" title="编辑">${iconHtml('fa-pen')}</button>
            <button data-mem-del type="button" title="删除">${iconHtml('fa-xmark')}</button>
          </div>
        </div>`).join('') : '<div class="th-mem-tier-empty">暂无待总结对话</div>'}
    </div>
  </div>`;

  const overrides = `<div class="th-mem-tier th-mem-tier-cfg">
    <div class="th-mem-tier-head">${iconHtml('fa-sliders')} 本会话阈值<span class="th-mem-tier-hint">留空=用全局</span></div>
    <div class="th-mem-cfg-grid">
      <label>小结阈值<input type="number" min="1" class="th-mem-ov-short" value="${ov.shortThreshold != null ? esc(String(ov.shortThreshold)) : ''}" placeholder="${esc(String(getWorldConfig().memory.shortThreshold))}"></label>
      <label>长期阈值<input type="number" min="1" class="th-mem-ov-long" value="${ov.longThreshold != null ? esc(String(ov.longThreshold)) : ''}" placeholder="${esc(String(getWorldConfig().memory.longThreshold))}"></label>
      <label>注入原始条数<input type="number" min="0" class="th-mem-ov-raw" value="${ov.recentRawCount != null ? esc(String(ov.recentRawCount)) : ''}" placeholder="${esc(String(getWorldConfig().memory.recentRawCount))}"></label>
      <label>注入小结条数<input type="number" min="0" class="th-mem-ov-sshort" value="${ov.recentShortCount != null ? esc(String(ov.recentShortCount)) : ''}" placeholder="${esc(String(getWorldConfig().memory.recentShortCount))}"></label>
      <button class="th-mem-ov-save" data-mem-ovsave type="button">${iconHtml('fa-check')} 应用</button>
    </div>
  </div>`;

  const footer = `<div class="th-mem-sess-footer">
    <button class="th-mem-danger" data-mem-delsess type="button">${iconHtml('fa-trash')} 删除整个会话记忆</button>
  </div>`;

  return `<div class="th-mem-center th-mem-session" data-mem-session-root data-mem-sid="${esc(s.id)}">
    ${head}${pinned}${longt}${shortt}${buffer}${overrides}${footer}
  </div>`;
}

function showSession(id: string): void {
  openModal2(`${iconHtml('fa-brain')} 会话记忆`, renderSessionHtml(id), {
    maxWidth: MEM_MODAL_MAXW, replace: true,
  });
  bindSessionEvents(id);
}

// MEM_UI_EVENTS

// ==================== 单会话事件委托 ====================
function bindSessionEvents(id: string): void {
  const root = qs('[data-mem-session-root]') as HTMLElement | null;
  if (!root) return;
  const refresh = () => showSession(id);

  root.addEventListener('click', async (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-mem-back]')) { showOverview(); return; }

    // 新增关键设定
    if (t.closest('[data-mem-addpin]')) {
      const input = root.querySelector('.th-mem-pin-input') as HTMLInputElement | null;
      const v = input?.value.trim() || '';
      if (v) { addPinned(id, v); refresh(); }
      return;
    }
    // 删除整个会话
    if (t.closest('[data-mem-delsess]')) {
      if ((window as any).confirm?.('确定删除整个会话的全部记忆？不可恢复。')) { deleteSession(id); showOverview(); }
      return;
    }
    // 应用阈值覆盖
    if (t.closest('[data-mem-ovsave]')) {
      const num = (sel: string) => { const el = root.querySelector(sel) as HTMLInputElement | null; const n = Number(el?.value); return el && el.value.trim() !== '' && Number.isFinite(n) ? Math.floor(n) : undefined; };
      const ov: any = {};
      const sShort = num('.th-mem-ov-short'); if (sShort != null && sShort >= 1) ov.shortThreshold = sShort;
      const sLong = num('.th-mem-ov-long'); if (sLong != null && sLong >= 1) ov.longThreshold = sLong;
      const sRaw = num('.th-mem-ov-raw'); if (sRaw != null && sRaw >= 0) ov.recentRawCount = sRaw;
      const sSS = num('.th-mem-ov-sshort'); if (sSS != null && sSS >= 0) ov.recentShortCount = sSS;
      setSessionOverrides(id, ov);
      toast('success', '已应用本会话阈值'); refresh();
      return;
    }
    // 立即小结 / 压缩长期（异步，需 AI）
    if (t.closest('[data-mem-summarize]') || t.closest('[data-mem-compress]')) {
      if (_busy) return; _busy = true;
      const isCompress = !!t.closest('[data-mem-compress]');
      toast('info', isCompress ? '正在压缩长期记忆…' : '正在小结…');
      try {
        const sum = makeSummarizer();
        if (isCompress) await runLongCompress(id, sum); else await manualSummarize(id, sum);
        toast('success', '完成');
      } catch (err) { toast('error', '生成失败：' + (err instanceof Error ? err.message : String(err))); }
      finally { _busy = false; refresh(); }
      return;
    }

    // 条目级操作：钉住/编辑/删除
    const itemEl = t.closest('[data-mem-item]') as HTMLElement | null;
    if (!itemEl) return;
    const itemId = itemEl.getAttribute('data-mem-item') || '';
    const tier = (itemEl.getAttribute('data-mem-tier') || '') as 'pinned' | 'short' | 'long' | 'buffer';
    if (t.closest('[data-mem-pin]') && (tier === 'short' || tier === 'long')) { pinSummary(id, tier, itemId); refresh(); return; }
    if (t.closest('[data-mem-del]')) {
      if (tier === 'pinned') removePinned(id, itemId); else deleteMemItem(id, tier, itemId);
      refresh(); return;
    }
    if (t.closest('[data-mem-edit]')) {
      const cur = (itemEl.querySelector('.th-mem-item-text') as HTMLElement | null)?.textContent || '';
      const next = (window as any).prompt?.('编辑内容：', tier === 'buffer' ? cur.replace(/^(我|对方)：/, '') : cur);
      if (next != null && String(next).trim()) { editMemItem(id, tier, itemId, String(next).trim()); refresh(); }
      return;
    }
  });
}

// MEM_UI_ENTRY

// ==================== 公开入口 ====================
// 从套件设置/桌面进入总览
export function openMemoryCenter(): void { showOverview(); }
// 从某 APP 内带 sessionId 直接打开该会话记忆
export function openSessionMemory(sessionId: string): void { showSession(sessionId); }

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_memory_center__ = { openMemoryCenter, openSessionMemory };
} catch (e) { void e; }
