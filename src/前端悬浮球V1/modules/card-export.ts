// 批次5 Step7 · F 反向导出：把 managed 卡片写成世界书条目（玩家可见常亮条目，区别于 [初始·xxx]）。
// 选目标世界书 + 条目名前缀 → createWorldbookEntries 写入。走二次确认。
import { esc, escAttr, qs } from '../lib/dom-utils';
import { openModal2, closeModal2 } from '../status-bar-init';
import { getRoot, safeGetCharWorldbookNames } from '../lib/tavern-api';
import { getManagedItems } from '../lib/managed-store';
import { MANAGED_CFG, type ManagedKind } from '../lib/config';

function getFn(name: string): any {
  try {
    const w = window as any;
    if (typeof w[name] === 'function') return w[name];
    const p = getRoot();
    if (p && typeof p[name] === 'function') return p[name];
  } catch (e) { void e; }
  return null;
}

// 列出可写世界书（角色卡绑定 + 全局），去重
function listWritableBooks(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (n: string) => { if (n && !seen.has(n)) { seen.add(n); out.push(n); } };
  try {
    const cw = safeGetCharWorldbookNames('current');
    if (cw?.primary) push(cw.primary);
    (cw?.additional || []).forEach(push);
  } catch (e) { void e; }
  try {
    const fn = getFn('getGlobalWorldbookNames');
    if (fn) (fn() as string[]).forEach(push);
  } catch (e) { void e; }
  try {
    const fn = getFn('getWorldbookNames');
    if (fn) (fn() as string[]).forEach(push);
  } catch (e) { void e; }
  return out;
}

// 入口：导出选中卡片为世界书条目
export function openExportToWorldbookModal(kind: ManagedKind, names: string[]): void {
  if (!names.length) { toastr?.warning?.('未选择卡片'); return; }
  const books = listWritableBooks();
  const cfg = MANAGED_CFG[kind] || { label: kind, prefix: '' };
  const bookOpts = books.length
    ? books.map(b => `<option value="${escAttr(b)}">${esc(b)}</option>`).join('')
    : '';
  const html = `<div class="th-cardexp" style="padding:14px;display:flex;flex-direction:column;gap:10px">
    <div style="font-size:13px;color:var(--tx2);line-height:1.6">把 ${names.length} 张「${esc(cfg.label)}」卡片导出为世界书条目（常亮可见条目，区别于 [初始·xxx]）。</div>
    <label style="display:grid;gap:4px"><span style="font-size:13px">目标世界书</span>
      ${books.length ? `<select id="th-cardexp-book" class="th-edit-select">${bookOpts}</select>`
        : '<span style="font-size:12px;color:var(--gold)">未找到可写世界书（请先在酒馆绑定角色卡世界书）</span>'}
    </label>
    <label style="display:grid;gap:4px"><span style="font-size:13px">条目名前缀</span>
      <input id="th-cardexp-prefix" class="th-edit-input" value="[${esc(cfg.label)}]" placeholder="如 [地点]"></label>
    <label style="display:flex;gap:6px;align-items:center;font-size:12px;color:var(--tx2);cursor:pointer">
      <input type="checkbox" id="th-cardexp-constant"> 设为常亮（蓝灯 constant，始终进上下文）
    </label>
    <div style="font-size:11px;color:var(--tx3)">条目名 = 前缀 + 卡片名；同名条目会新增（酒馆允许重名条目，建议前缀区分）。</div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="th-btn" id="th-cardexp-cancel">取消</button>
      <button class="th-btn th-btn-primary" id="th-cardexp-go" ${books.length ? '' : 'disabled'}><i class="fa-solid fa-file-export"></i> 导出</button>
    </div>
  </div>`;
  openModal2('<i class="fa-solid fa-file-export"></i> 导出为世界书条目', html, { maxWidth: 'min(560px,94vw)' });
  qs('#th-cardexp-cancel')?.addEventListener('click', closeModal2);
  qs('#th-cardexp-go')?.addEventListener('click', () => { void doExport(kind, names); });
}

async function doExport(kind: ManagedKind, names: string[]): Promise<void> {
  const book = qs<HTMLSelectElement>('#th-cardexp-book')?.value || '';
  const prefix = (qs<HTMLInputElement>('#th-cardexp-prefix')?.value || '').trim();
  const constant = !!qs<HTMLInputElement>('#th-cardexp-constant')?.checked;
  if (!book) { toastr?.warning?.('请选择目标世界书'); return; }
  const createFn = getFn('createWorldbookEntries');
  if (!createFn) { toastr?.error?.('当前环境无 createWorldbookEntries 接口'); return; }
  const items = getManagedItems(kind);
  const isStash = kind.startsWith('stash-');
  const newEntries = names.map(name => {
    const it = items[name];
    const content = it ? (isStash ? it.desc : it.desc) : '';
    return {
      name: `${prefix}${name}`,
      enabled: true,
      content: content || '',
      strategy: { type: constant ? 'constant' : 'selective', keys: constant ? [] : [name] },
    };
  });
  const goBtn = qs<HTMLButtonElement>('#th-cardexp-go');
  if (goBtn) { goBtn.disabled = true; goBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 导出中…'; }
  try {
    await createFn(book, newEntries);
    toastr?.success?.(`已导出 ${newEntries.length} 个条目到「${book}」`);
    closeModal2();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    toastr?.error?.(`导出失败：${msg}`);
    if (goBtn) { goBtn.disabled = false; goBtn.innerHTML = '<i class="fa-solid fa-file-export"></i> 导出'; }
  }
}
