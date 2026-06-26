// 批次7 反馈6a · 世界书激活监控
// 监听 tavern_events.WORLD_INFO_ACTIVATED，记录每轮 AI 请求激活了哪些世界书条目，
// 在面板里实时列出（条目名 / 所属世界书 / 触发关键词）。调试绿灯关键词时能看见到底喂了什么给 AI。
// 命令式 innerHTML + openModal2 + getRoot 跨窗口兜底，不引 Vue。
import { esc, qs } from '../lib/dom-utils';
import { openModal2, closeModal2 } from '../status-bar-init';
import { getRoot } from '../lib/tavern-api';

type ActivatedEntry = { world?: string; comment?: string; key?: string[]; keys?: string[]; uid?: number | string };
type ActivationRecord = { ts: number; entries: ActivatedEntry[] };

const MAX_RECORDS = 20;
let _records: ActivationRecord[] = [];
let _listening = false;
let _off: (() => void) | null = null;

function getFn(name: string): any {
  try {
    const w = window as any;
    if (typeof w[name] === 'function') return w[name];
    const p = getRoot();
    if (p && typeof p[name] === 'function') return p[name];
  } catch (e) { void e; }
  return null;
}
function getEvents(): any {
  try {
    const w = window as any;
    return w.tavern_events || (getRoot() && getRoot().tavern_events) || null;
  } catch { return null; }
}

// 在模块加载后即开始监听（不依赖面板打开），把激活记录攒进环形缓冲。
export function startActivationMonitor(): void {
  if (_listening) return;
  const evOn = getFn('eventOn');
  const events = getEvents();
  const evtName = events?.WORLD_INFO_ACTIVATED || 'world_info_activated';
  if (typeof evOn !== 'function') return;
  const handler = (entries: ActivatedEntry[]) => {
    try {
      const arr = Array.isArray(entries) ? entries : [];
      _records.unshift({ ts: Date.now(), entries: arr.map(e => ({ world: e?.world, comment: e?.comment, key: e?.key, keys: (e as any)?.keys, uid: e?.uid })) });
      if (_records.length > MAX_RECORDS) _records = _records.slice(0, MAX_RECORDS);
      refreshMonitorBody();
    } catch (e) { console.warn('[activation-monitor] handler', e); }
  };
  try {
    const ret = evOn(evtName, handler);
    _off = typeof ret === 'function' ? ret : (() => { try { const evOff = getFn('eventOff'); evOff?.(evtName, handler); } catch (e) { void e; } });
    _listening = true;
  } catch (e) { console.warn('[activation-monitor] 监听启动失败', e); }
}

export function stopActivationMonitor(): void {
  try { if (_off) { _off(); _off = null; } } catch (e) { void e; }
  _listening = false;
}

function entryKeys(e: ActivatedEntry): string {
  const ks = e.key || e.keys || [];
  return Array.isArray(ks) && ks.length ? ks.join(' / ') : '';
}

function renderRecords(): string {
  if (!_records.length) {
    return `<div style="padding:18px;color:var(--tx3);font-size:13px;text-align:center;line-height:1.8">
      暂无激活记录。<br>发起一次 AI 对话后，这里会实时列出本轮激活的世界书条目（绿灯/蓝灯触发）。
    </div>`;
  }
  return _records.map((rec, i) => {
    const time = new Date(rec.ts).toLocaleTimeString();
    const rows = rec.entries.length ? rec.entries.map(e => {
      const ks = entryKeys(e);
      return `<div class="th-am-entry">
        <i class="fa-solid fa-circle-dot" style="color:var(--mint);font-size:9px"></i>
        <span class="th-am-name">${esc(e.comment || '(无名条目)')}</span>
        <span class="th-am-world"><i class="fa-solid fa-book"></i> ${esc(e.world || '?')}</span>
        ${ks ? `<span class="th-am-keys" title="触发关键词">🔑 ${esc(ks.slice(0, 60))}</span>` : ''}
      </div>`;
    }).join('') : '<div style="font-size:12px;color:var(--tx3);padding:4px 8px">本轮无条目激活</div>';
    return `<div class="th-am-rec">
      <div class="th-am-rec-head">${i === 0 ? '<span class="th-am-latest">最新</span> ' : ''}${esc(time)} · 激活 ${rec.entries.length} 条</div>
      <div class="th-am-rec-body">${rows}</div>
    </div>`;
  }).join('');
}

function refreshMonitorBody(): void {
  const body = qs('#th-am-body');
  if (body) body.innerHTML = renderRecords();
}

export function openActivationMonitor(): void {
  startActivationMonitor(); // 打开即确保在监听
  const supported = typeof getFn('eventOn') === 'function';
  const html = `<div class="th-am" style="padding:14px;display:flex;flex-direction:column;gap:10px;max-height:80vh">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-weight:700;color:var(--pink)"><i class="fa-solid fa-satellite-dish"></i> 世界书激活监控</span>
      <span style="font-size:12px;color:var(--tx3)">监听 WORLD_INFO_ACTIVATED · 最近 ${MAX_RECORDS} 轮</span>
      <span style="margin-left:auto;display:flex;gap:6px">
        <button class="th-btn th-btn-mini" id="th-am-refresh" title="手动刷新激活列表"><i class="fa-solid fa-rotate"></i> 刷新</button>
        <button class="th-btn th-btn-mini" id="th-am-clear">清空</button>
        <button class="th-btn" id="th-am-close">关闭</button>
      </span>
    </div>
    ${supported ? '' : '<div style="font-size:12px;color:var(--gold);background:var(--bg3);border-radius:8px;padding:8px 10px">当前环境未提供 eventOn 接口，无法监听激活事件。</div>'}
    <div style="font-size:12px;color:var(--tx2);line-height:1.6">发起 AI 对话后，下方实时列出本轮激活的世界书条目。可用于调试绿灯关键词、确认到底喂了什么给 AI。</div>
    <div id="th-am-body" class="th-am-body" style="flex:1;overflow:auto;display:flex;flex-direction:column;gap:8px;padding-right:4px">${renderRecords()}</div>
  </div>`;
  openModal2('<i class="fa-solid fa-satellite-dish"></i> 激活监控', html, { maxWidth: 'min(640px,94vw)', reset: true, revive: openActivationMonitor });
  qs('#th-am-close')?.addEventListener('click', () => { closeModal2(); });
  qs('#th-am-clear')?.addEventListener('click', () => { _records = []; refreshMonitorBody(); });
  qs('#th-am-refresh')?.addEventListener('click', () => {
    startActivationMonitor(); // 确保监听仍在（环境重载后可能掉线）
    refreshMonitorBody();
    try { (window as any).toastr?.info?.(`已刷新 · 当前 ${_records.length} 轮记录`); } catch { /* noop */ }
  });
}

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {})) as any;
  w.__th_activation__ = { openActivationMonitor, startActivationMonitor, stopActivationMonitor };
} catch (e) { void e; }
