// 世界书「条目级」选择器（任意世界书的任意条目，而非整本绑定）。
// 复用于微信/微博/糖心（及后续 APP）的「上下文注入世界书」设置 sheet，三端统一布局。
// 用法：sheet 内放 wbPickerHtml(selectedKeys)，渲染后调 bindWbPicker(root, getKeys, setKeys)。
//   - 顶部「已注入条目管理」：把已选条目列成可删 chip（直接读 key 解析，无需加载书），空白区不再浪费。
//   - 搜索框：按书名/条目名即时过滤；中文输入法用 compositionstart/end 把关，组合中不过滤、不重渲染、不丢焦点。
//   - 书以可折叠分组呈现，点书头懒加载其条目（loadEntriesCached）。
//   - 勾选/取消条目即时回写 setKeys（无需额外保存动作；外层 sheet 的"保存"只负责关闭/提示）。
import { esc, escAttr } from '../dom-utils';
import {
  listWorldbookNames, loadEntriesCached, wbEntryKey, parseWbEntryKey, normalizeEntryKey,
} from './worldbook';

// 已选条目管理区：把 selectedKeys 解析成「书 › 条目」chip，逐个可删（即时回写）。
function selectedPanelHtml(selectedKeysRaw: string[]): string {
  // 历史损坏的 key（NUL→� 分隔）先规整，避免 chip 名显示成带乱码的整条 key。
  const selectedKeys = (selectedKeysRaw || []).map(normalizeEntryKey);
  if (!selectedKeys.length) {
    return `<div class="th-wbp-sel th-wbp-sel-empty" data-wbp-sel>还没有勾选任何条目，下面挑选后会在这里管理。</div>`;
  }
  const chips = selectedKeys.map(k => {
    const { book, entry } = parseWbEntryKey(k);
    return `<span class="th-wbp-chip" data-wbp-chip="${escAttr(k)}">
      <span class="th-wbp-chip-book">${esc(book)}</span><span class="th-wbp-chip-sep">›</span><span class="th-wbp-chip-entry">${esc(entry || book)}</span>
      <button class="th-wbp-chip-x" type="button" data-wbp-unpick="${escAttr(k)}" title="移除">✕</button>
    </span>`;
  }).join('');
  return `<div class="th-wbp-sel" data-wbp-sel>
    <div class="th-wbp-sel-head"><span>已注入条目 <b data-wbp-sel-cnt>${selectedKeys.length}</b></span>
      <button class="th-wbp-sel-clear" type="button" data-wbp-clear>清空</button></div>
    <div class="th-wbp-sel-chips">${chips}</div>
  </div>`;
}

// 渲染整棵「书 → 条目」树。初始全部折叠；已选条目所属的书默认展开，方便复核。
export function wbPickerHtml(selectedKeysRaw: string[]): string {
  // 渲染前规整历史损坏 key，保证勾选态与树内复选框 key（新分隔符）能对上。
  const selectedKeys = (selectedKeysRaw || []).map(normalizeEntryKey);
  const names = listWorldbookNames();
  if (!names.length) return '<div class="th-wbp-empty">没有可用的世界书</div>';
  const sel = new Set(selectedKeys);
  // 哪些书有已选条目（默认展开）
  const booksWithSel = new Set<string>();
  selectedKeys.forEach(k => { const { book } = parseWbEntryKey(k); if (book) booksWithSel.add(book); });
  const countSelInBook = (book: string) => selectedKeys.filter(k => parseWbEntryKey(k).book === book).length;

  const groups = names.map(book => {
    const open = booksWithSel.has(book);
    const cnt = countSelInBook(book);
    return `<div class="th-wbp-group" data-wbp-book="${escAttr(book)}" data-wbp-bookname="${escAttr(book.toLowerCase())}">
      <button class="th-wbp-bookhead" type="button" data-wbp-toggle="${escAttr(book)}">
        <i class="fa-solid fa-chevron-${open ? 'down' : 'right'} th-wbp-caret"></i>
        <i class="fa-solid fa-book th-wbp-bookico"></i>
        <span class="th-wbp-bookname">${esc(book)}</span>
        <span class="th-wbp-bookcnt"${cnt ? '' : ' style="display:none"'}>${cnt}</span>
      </button>
      <div class="th-wbp-entries" data-wbp-entries="${escAttr(book)}" ${open ? '' : 'hidden'}>
        ${open ? '<div class="th-wbp-loading">展开后加载…</div>' : ''}
      </div>
    </div>`;
  }).join('');
  return `<div class="th-wbp" data-wbp-root>
    ${selectedPanelHtml(selectedKeys)}
    <div class="th-wbp-searchbar">
      <i class="fa-solid fa-magnifying-glass th-wbp-search-ico"></i>
      <input type="text" class="th-wbp-search th-edit-input" placeholder="搜索世界书 / 条目名…" data-wbp-search>
    </div>
    <div class="th-wbp-hint">勾选任意世界书的任意条目，生成时作为上下文注入（可跨多本书混选）。</div>
    <div class="th-wbp-tree" data-wbp-tree>${groups}</div>
  </div>`;
  void sel;
}

// 渲染某本书的条目复选行。data-wbp-entryname 供搜索过滤用（小写）。
function entriesRowsHtml(book: string, entries: { name: string; content: string; enabled: boolean }[], selectedKeys: string[]): string {
  if (!entries.length) return '<div class="th-wbp-empty-sub">这本世界书没有条目</div>';
  const sel = new Set(selectedKeys);
  return entries.map(e => {
    const key = wbEntryKey(book, e.name);
    const checked = sel.has(key) ? 'checked' : '';
    return `<label class="th-wbp-row${e.enabled ? '' : ' th-wbp-row-off'}" data-wbp-entryname="${escAttr((e.name || '').toLowerCase())}">
      <input type="checkbox" class="th-wbp-cb" data-wbp-key="${escAttr(key)}" ${checked}>
      <span class="th-wbp-rowname">${esc(e.name)}${e.enabled ? '' : ' <small>(禁用)</small>'}</span>
      <span class="th-wbp-rowlen">${e.content.length}字</span>
    </label>`;
  }).join('');
}

// 绑定交互。getKeys/setKeys 读写外层的已选 key 数组（直接落到 APP 设置）。
export function bindWbPicker(
  root: HTMLElement,
  getKeys: () => string[],
  setKeys: (keys: string[]) => void,
): void {
  const rootEl = root.querySelector('[data-wbp-root]') as HTMLElement | null;
  if (!rootEl || (rootEl as any)._wbpBound) return;
  (rootEl as any)._wbpBound = true;

  // 把历史损坏的 key（NUL 往返损坏成 �）就地规整成新分隔符并回写存储，彻底愈合旧数据。
  try {
    const cur = getKeys();
    const fixed = cur.map(normalizeEntryKey);
    if (fixed.some((k, i) => k !== cur[i])) setKeys(fixed);
  } catch (e) { void e; }

  // 已展开的书初次渲染条目
  rootEl.querySelectorAll<HTMLElement>('.th-wbp-entries:not([hidden])').forEach(box => {
    const book = box.getAttribute('data-wbp-entries') || '';
    if (book) void fillEntries(book, box, getKeys);
  });

  // 重建「已注入条目管理」面板 + 所有书计数徽标（勾选/删除/清空后调用；不动搜索框与树，保焦点）。
  const refreshSelected = () => {
    const keys = getKeys();
    const sel = rootEl.querySelector('[data-wbp-sel]') as HTMLElement | null;
    if (sel) sel.outerHTML = selectedPanelHtml(keys);
    rootEl.querySelectorAll<HTMLElement>('[data-wbp-toggle]').forEach(head => {
      const book = head.getAttribute('data-wbp-toggle') || '';
      const cnt = head.querySelector('.th-wbp-bookcnt') as HTMLElement | null;
      if (!cnt) return;
      const n = keys.filter(k => parseWbEntryKey(k).book === book).length;
      cnt.textContent = String(n);
      cnt.style.display = n ? '' : 'none';
    });
  };

  // 同步某 key 对应复选框的勾选态（删除 chip 后，若该书已展开，取消其勾选）。
  const syncCheckbox = (key: string, checked: boolean) => {
    const cb = rootEl.querySelector(`.th-wbp-cb[data-wbp-key="${cssEsc(key)}"]`) as HTMLInputElement | null;
    if (cb) cb.checked = checked;
  };

  rootEl.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement;
    // 移除单个已选 chip
    const unpick = target.closest('[data-wbp-unpick]') as HTMLElement | null;
    if (unpick) {
      const key = unpick.getAttribute('data-wbp-unpick') || '';
      const cur = new Set(getKeys()); cur.delete(key); setKeys([...cur]);
      syncCheckbox(key, false); refreshSelected();
      return;
    }
    // 清空全部已选
    if (target.closest('[data-wbp-clear]')) {
      getKeys().forEach(k => syncCheckbox(k, false));
      setKeys([]); refreshSelected();
      return;
    }
    const toggle = target.closest('[data-wbp-toggle]') as HTMLElement | null;
    if (toggle) {
      const book = toggle.getAttribute('data-wbp-toggle') || '';
      const box = rootEl.querySelector(`.th-wbp-entries[data-wbp-entries="${cssEsc(book)}"]`) as HTMLElement | null;
      const caret = toggle.querySelector('.th-wbp-caret');
      if (!box) return;
      const willOpen = box.hasAttribute('hidden');
      if (willOpen) {
        box.removeAttribute('hidden');
        caret?.classList.remove('fa-chevron-right'); caret?.classList.add('fa-chevron-down');
        if (!box.getAttribute('data-loaded')) void fillEntries(book, box, getKeys);
      } else {
        box.setAttribute('hidden', '');
        caret?.classList.remove('fa-chevron-down'); caret?.classList.add('fa-chevron-right');
      }
      return;
    }
  });

  rootEl.addEventListener('change', (ev) => {
    const cb = ev.target as HTMLElement;
    if (!cb.classList?.contains('th-wbp-cb')) return;
    const key = cb.getAttribute('data-wbp-key') || '';
    if (!key) return;
    const cur = new Set(getKeys());
    if ((cb as HTMLInputElement).checked) cur.add(key); else cur.delete(key);
    setKeys([...cur]);
    refreshSelected();
  });

  // 搜索过滤。中文输入法组合期间(composition)不过滤、不重渲染，避免失焦/吞字。
  const searchEl = rootEl.querySelector('[data-wbp-search]') as HTMLInputElement | null;
  if (searchEl) {
    let composing = false;
    const applyFilter = () => {
      const q = (searchEl.value || '').trim().toLowerCase();
      rootEl.querySelectorAll<HTMLElement>('.th-wbp-group').forEach(grp => {
        const bookName = grp.getAttribute('data-wbp-bookname') || '';
        const bookHit = !q || bookName.includes(q);
        const entriesBox = grp.querySelector('.th-wbp-entries') as HTMLElement | null;
        let entryHit = false;
        if (entriesBox) {
          entriesBox.querySelectorAll<HTMLElement>('.th-wbp-row').forEach(row => {
            const nm = row.getAttribute('data-wbp-entryname') || '';
            const hit = !q || nm.includes(q);
            row.style.display = hit ? '' : 'none';
            if (hit) entryHit = true;
          });
          // 搜索词命中条目时，自动展开该书并懒加载（让结果可见）
          if (q && (entryHit || bookHit) && entriesBox.hasAttribute('hidden')) {
            entriesBox.removeAttribute('hidden');
            const caret = grp.querySelector('.th-wbp-caret');
            caret?.classList.remove('fa-chevron-right'); caret?.classList.add('fa-chevron-down');
            if (!entriesBox.getAttribute('data-loaded')) {
              const bk = entriesBox.getAttribute('data-wbp-entries') || '';
              if (bk) void fillEntries(bk, entriesBox, getKeys).then(() => applyFilter());
            }
          }
        }
        grp.style.display = (bookHit || entryHit) ? '' : 'none';
      });
    };
    searchEl.addEventListener('compositionstart', () => { composing = true; });
    searchEl.addEventListener('compositionend', () => { composing = false; applyFilter(); });
    searchEl.addEventListener('input', () => { if (!composing) applyFilter(); });
  }
}

async function fillEntries(book: string, box: HTMLElement, getKeys: () => string[]): Promise<void> {
  box.setAttribute('data-loaded', '1');
  box.innerHTML = '<div class="th-wbp-loading">加载中…</div>';
  try {
    const entries = await loadEntriesCached(book);
    box.innerHTML = entriesRowsHtml(book, entries, getKeys());
  } catch (e) { void e; box.innerHTML = '<div class="th-wbp-empty-sub">加载失败</div>'; }
}

// CSS.escape 兜底（部分环境无 CSS.escape）
function cssEsc(s: string): string {
  try { return (window as any).CSS?.escape ? (window as any).CSS.escape(s) : s.replace(/["\\\]]/g, '\\$&'); }
  catch { return s.replace(/["\\\]]/g, '\\$&'); }
}
