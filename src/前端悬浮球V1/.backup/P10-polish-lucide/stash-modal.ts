// 储藏间 modal + 自定义 kind + add form（解耦阶段 1b）。
// 从 status-bar-init.ts 纯移动；行为保持一致。
// currentStashTab / isStashAllTab / _stashModalBusy 为本模块私有 whole-reassigned 状态，移入此处；
//   getCurrentStashTab / getStatusStashAllTab getter 随之搬来（stash-io 已改为从本模块 import）。
// currentFilterTag / currentlyCollapsed 为主文件 whole-reassigned 状态，本模块只写，通过 setCurrentFilterTag() / setCurrentlyCollapsed() setter 防 §4.2 引用断开。
// currentData 为主文件 whole-reassigned，本模块只读，通过 getCurrentStatusData() getter 懒读。
// showRecentOnly / showFavOnly 为对象引用型全局，仅属性读写，import 同一引用即可（§4.1）。
// ================================================================
import { esc, escAttr, qs, qsa, __doc } from '../lib/dom-utils';
import { type ManagedKind } from '../lib/config';
import {
  type ManagedItemV2,
  loadStashKinds,
  getStashKindCfg,
  getManagedItems,
  setCurrentManagedItems,
  loadBucketCollapsed,
  loadTags,
  deleteStashKind,
  addStashKind,
  addManagedItem,
} from '../lib/managed-store';
import { renderTagFilterBar, openTagManagerModal } from './tag-manager';
import {
  type ParsedImport,
  openReadInitialConfirmModal,
  readInitialDataFromWorldbook,
  mergeInitialDataIntoLocal,
  openWriteInitialDataModal,
  collectRuntimeStashData,
  openRuntimeImportModal,
  exportAllStashKinds,
  exportStashKind,
  openExportByTagModal,
  openImportWithTagModal,
} from './stash-io';
import {
  openModal,
  openModal2,
  closeModal2,
  getDefaultEntry,
  getCurrentStatusData,
  setCurrentlyCollapsed,
  setCurrentFilterTag,
  showRecentOnly,
  showFavOnly,
  type AddKind,
} from '../status-bar-init';
import {
  type SortMode,
  renderManagedBuckets,
  bindCollapseToggleEvents,
  setAllBucketsCollapsed,
  updateAllBucketVisuals,
  rerenderManagedGrid,
  saveSortMode,
  getDisplayDesc,
  bindManagedCardEvents,
  openDispatchByTagModal,
} from './managed-modal';

// 储藏间 4 个固定 kind（原主文件 STASH_FIXED_KINDS；主文件 openManagedEditModal 仍在用，故 export）。
export const STASH_FIXED_KINDS: ManagedKind[] = ['stash-item', 'stash-skill', 'stash-status', 'stash-clothing'];
// 未分类：固定 kind（反馈1），作为删除自定义类别时卡片的归档目标；不参与初始数据/运行时导入/配发。
export const STASH_UNCATEGORIZED_KIND: ManagedKind = 'stash-uncategorized';

// 本模块私有 whole-reassigned 状态（原主文件 currentStashTab / isStashAllTab / _stashModalBusy）。
let currentStashTab: ManagedKind = 'stash-item';
let isStashAllTab: boolean = false; // 是否在"全部"tab
let _stashModalBusy = false;

export function getCurrentStashTab(): ManagedKind { return currentStashTab; }
export function getStatusStashAllTab(): boolean { return isStashAllTab; }

export function openStashModal(initialTab?: ManagedKind | 'all') {
  if (_stashModalBusy) { console.warn('[openStashModal] re-entrant call blocked'); return; }
  _stashModalBusy = true;
  try {
  currentStashTab = initialTab === 'all' ? 'stash-item' : (initialTab || 'stash-item');
  isStashAllTab = initialTab === 'all';
  const customKinds = loadStashKinds();
  const allTabs: ManagedKind[] = [...STASH_FIXED_KINDS, STASH_UNCATEGORIZED_KIND, ...Object.keys(customKinds).map(k => `stash-custom-${k}` as ManagedKind)];

  // 构建 tab 行
  let tabRow = '<div class="th-stash-kind-tabs">';
  // "全部" tab 放在最前面
  tabRow += `<button class="th-stash-kind-tab ${isStashAllTab ? 'active' : ''}" data-stash-kind="all">
    <i class="fa-solid fa-layer-group"></i> 全部
  </button>`;
  for (const kind of allTabs) {
    const cfg = getStashKindCfg(kind);
    const isActive = !isStashAllTab && kind === currentStashTab;
    const isCustom = kind.startsWith('stash-custom-');
    tabRow += `<button class="th-stash-kind-tab ${isActive ? 'active' : ''}" data-stash-kind="${kind}" ${isCustom ? `data-custom-kind="${kind.replace('stash-custom-', '')}"` : ''}>
      <i class="${cfg.icon}"></i> ${esc(cfg.label)}
      ${isCustom ? `<span class="th-stash-kind-del" data-del-custom="${escAttr(kind.replace('stash-custom-', ''))}" title="删除类别"><i class="fa-solid fa-xmark"></i></span>` : ''}
    </button>`;
  }
  tabRow += `<button class="th-stash-kind-new-btn" title="新建类别"><i class="fa-solid fa-plus"></i></button>`;
  tabRow += '</div>';

  // 构建内容区
  const cfg = isStashAllTab ? { icon: 'fa-solid fa-layer-group', label: '全部', storageName: '储藏间·全部', defaultInject: '' } : getStashKindCfg(currentStashTab);
  if (!isStashAllTab) {
    // 确保自定义 kind 数据被正确加载和初始化
    const items = getManagedItems(currentStashTab);
    setCurrentManagedItems(currentStashTab, items);
    // 加载桶折叠状态
    setCurrentlyCollapsed(loadBucketCollapsed()[currentStashTab] || {});
  }
  const idPrefix = 'th-stash';

  let h = `<div class="th-stash-modal">`;
  h += tabRow;
  h += `<input type="file" id="${idPrefix}-import-file" accept=".json,.txt" style="display:none">`;
  h += `<input class="th-location-search th-edit-input" type="search" id="${idPrefix}-search" placeholder="搜索${cfg.label}...">`;
  if (isStashAllTab) {
    // "全部" tab: 按 kind 分组平铺
    h += `<div class="th-managed-grid" id="${idPrefix}-grid" data-kind="all">`;
    h += renderAllStashCards(allTabs);
    h += `</div>`;
  } else {
    // 标签筛选栏（Phase 2）
    h += renderTagFilterBar(currentStashTab, idPrefix);
    // 按桶渲染
    h += `<div class="th-managed-grid" id="${idPrefix}-grid" data-kind="${currentStashTab}">`;
    h += renderManagedBuckets(currentStashTab, idPrefix);
    h += `</div>`;
  }
  h += `<button class="th-location-add-btn" id="${idPrefix}-add-btn" ${isStashAllTab ? 'style="display:none"' : ''}><i class="fa-solid fa-plus"></i> 新建${cfg.label}</button>`;
  h += `</div>`;

  openModal(`<i class="fa-solid fa-treasure-chest"></i> 储藏间 <span class="th-modal-title-actions"><button class="th-title-io-btn" id="${idPrefix}-tags-btn" title="标签管理"><i class="fa-solid fa-tags"></i></button><button class="th-title-io-btn" id="${idPrefix}-dispatch-tag-btn" title="按标签配发：选择一个标签，将该标签下的所有物品批量配发给多个目标"><i class="fa-solid fa-share"></i></button><button class="th-title-io-btn" id="${idPrefix}-seed-btn" title="重读初始数据：从 [初始·储藏间] 世界书条目增量补入缺失卡片（不覆盖已有、不复活已删）"><i class="fa-solid fa-seedling"></i></button><button class="th-title-io-btn" id="${idPrefix}-write-initial-btn" title="写入初始数据：将当前储藏间按类别/标签写入 [初始·储藏间]"><i class="fa-solid fa-file-import"></i></button><button class="th-title-io-btn" id="${idPrefix}-runtime-import-btn" title="从角色数据导入：读取当前主角和所有 NPC 的物品/技能/状态/衣物，勾选后导入储藏间并写入 [初始·储藏间] 世界书条目"><i class="fa-solid fa-users"></i></button><button class="th-title-io-btn" id="${idPrefix}-export-btn" title="导出"><i class="fa-solid fa-download"></i></button><button class="th-title-io-btn" id="${idPrefix}-import-btn" title="导入"><i class="fa-solid fa-upload"></i></button></span>`, h);

  _stashModalBusy = false; // DOM 已替换，立即解锁（事件绑定延迟不影响后续 openStashModal 调用）
  setTimeout(() => { bindStashModalEvents(idPrefix, allTabs); }, 100);
  } catch(e) { _stashModalBusy = false; throw e; }
}

// getStashKindCfg（统一 kind 配置获取，含自定义 kind 兜底）已抽至 ./lib/managed-store.ts

function bindStashModalEvents(idPrefix: string, allTabs: ManagedKind[]) {
  try {
    // tab 切换
    qsa('.th-stash-kind-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        // 如果点击的是删除按钮，不切换 tab
        if ((e.target as HTMLElement).closest('.th-stash-kind-del')) return;
        const kind = tab.getAttribute('data-stash-kind');
        if (kind === 'all') {
          openStashModal('all');
        } else if (kind) {
          currentStashTab = kind as ManagedKind;
          openStashModal(kind as ManagedKind);
        }
      });
    });
    // 自定义 kind tab 上的删除按钮（替代右键菜单）— 独立于 tab forEach
    qsa('.th-stash-kind-del').forEach(delBtn => {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const customKind = delBtn.getAttribute('data-del-custom') || '';
        if (!customKind) return;
        const customKinds = loadStashKinds();
        const meta = customKinds[customKind];
        if (confirm(`确定要删除类别「${meta?.label || customKind}」吗？\n该类别下的卡片将移动到「未分类」。`)) {
          const moved = deleteStashKind(customKind);
          currentStashTab = 'stash-item';
          toastr?.success?.(`已删除类别：${meta?.label || customKind}${moved ? `，${moved} 张卡片已移至未分类` : ''}`);
          openStashModal(currentStashTab);
        }
      });
    });

    // 新建类别按钮
    qs('.th-stash-kind-new-btn')?.addEventListener('click', () => {
      showNewStashKindForm();
    });

    // 标签管理按钮
    qs(`#${idPrefix}-tags-btn`)?.addEventListener('click', () => {
      openTagManagerModal(currentStashTab, idPrefix);
    });

    // 按标签配发按钮
    qs(`#${idPrefix}-dispatch-tag-btn`)?.addEventListener('click', () => {
      if (isStashAllTab) { toastr?.warning?.('请先切换到具体的物品/技能 tab'); return; }
      if (!getCurrentStatusData()) { toastr?.warning?.('当前没有角色数据'); return; }
      openDispatchByTagModal(currentStashTab, idPrefix);
    });

    // 重读初始数据按钮（反馈7）：从 [初始·储藏间] 世界书条目增量补入全部 stash kind 的缺失卡片
    qs(`#${idPrefix}-seed-btn`)?.addEventListener('click', () => openReadInitialConfirmModal('储藏间', async () => {
      const btn = qs(`#${idPrefix}-seed-btn`);
      if (btn) btn.setAttribute('disabled', 'true');
      try {
        const parsed = await readInitialDataFromWorldbook();
        // 储藏间条目 [初始·储藏间] 是多 kind，byKind 里含 stash-item/skill/status/clothing
        const stashKinds = ['stash-item','stash-skill','stash-status','stash-clothing'] as ManagedKind[];
        const filteredByKind: Record<string, { name: string; item: ManagedItemV2 }[]> = {};
        let total = 0;
        for (const k of stashKinds) {
          const arr = parsed.byKind[k] || [];
          if (arr.length) { filteredByKind[k] = arr; total += arr.length; }
        }
        if (!total) {
          toastr?.info?.('未找到 [初始·储藏间] 世界书条目，或条目内无数据');
          return;
        }
        const singleParsed: ParsedImport = { byKind: filteredByKind, warnTags: parsed.warnTags };
        const result = await mergeInitialDataIntoLocal(singleParsed);
        // 刷新所有受影响 stash kind 的 currentManagedItems
        for (const k of stashKinds) setCurrentManagedItems(k, getManagedItems(k));
        openStashModal(isStashAllTab ? 'all' : currentStashTab);
        let msg = `已从初始数据补入 ${result.added} 张储藏间卡片`;
        if (result.skipped) msg += `，跳过 ${result.skipped} 张（本地已存在）`;
        toastr?.success?.(msg);
        if (parsed.warnTags.length) {
          toastr?.warning?.(`初始数据含未定义标签（已忽略）：${[...new Set(parsed.warnTags)].slice(0, 5).join('、')}`);
        }
      } catch (e) {
        console.warn('[储藏间重读初始数据] 失败', e);
        toastr?.error?.('重读初始数据失败，请查看控制台');
      } finally {
        if (btn) btn.removeAttribute('disabled');
      }
    }));
    qs(`#${idPrefix}-write-initial-btn`)?.addEventListener('click', () => openWriteInitialDataModal(['stash-item','stash-skill','stash-status','stash-clothing']));

    // 从角色数据导入按钮(§10.6 Build 2-2/2-3)
    qs(`#${idPrefix}-runtime-import-btn`)?.addEventListener('click', () => {
      if (!getCurrentStatusData()) { toastr?.warning?.('当前没有角色数据'); return; }
      const collected = collectRuntimeStashData();
      const totalCount = Object.values(collected).reduce((s, arr) => s + arr.length, 0);
      if (totalCount === 0) { toastr?.info?.('当前主角和 NPC 都没有物品/技能/状态/衣物数据'); return; }
      openRuntimeImportModal(collected, allTabs);
    });

    // 导出按钮
    qs(`#${idPrefix}-export-btn`)?.addEventListener('click', () => {
      if (isStashAllTab) {
        exportAllStashKinds(allTabs);
        return;
      }
      // 有标签时弹出选择菜单
      const allTags = loadTags();
      const kindTags = allTags[currentStashTab] || {};
      if (Object.keys(kindTags).length === 0) {
        exportStashKind(currentStashTab);
        return;
      }
      // 弹出选择
      const html = `<div style="padding:16px;">
        <div style="margin-bottom:12px;font-weight:500;">选择导出方式</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button class="th-btn-sm" id="export-all" style="justify-content:flex-start;"><i class="fa-solid fa-download"></i> 导出全部</button>
          <button class="th-btn-sm" id="export-by-tag" style="justify-content:flex-start;"><i class="fa-solid fa-tags"></i> 按标签导出</button>
        </div>
      </div>`;
      openModal2('导出选项', html, { maxWidth: '300px' });
      qs('#export-all')?.addEventListener('click', () => { closeModal2(); exportStashKind(currentStashTab); });
      qs('#export-by-tag')?.addEventListener('click', () => { closeModal2(); openExportByTagModal(currentStashTab); });
    });

    // 导入按钮
    qs(`#${idPrefix}-import-btn`)?.addEventListener('click', () => {
      const fi = qs<HTMLInputElement>(`#${idPrefix}-import-file`);
      if (fi) fi.click();
    });

    // 导入文件处理
    qs(`#${idPrefix}-import-file`)?.addEventListener('change', function(this: HTMLInputElement) {
      if (!this.files || !this.files.length) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        openImportWithTagModal(isStashAllTab ? '__all__' : currentStashTab, text, allTabs);
      };
      reader.readAsText(this.files[0], 'utf-8');
      this.value = '';
    });

    // 按标签导出按钮（批量模式）
    qs(`#${idPrefix}-export-tag-btn`)?.addEventListener('click', () => {
      if (isStashAllTab) { toastr?.warning?.('请先切换到具体的物品/技能 tab'); return; }
      openExportByTagModal(currentStashTab);
    });

    // 搜索框（stash）
    const stashSearchInput = qs<HTMLInputElement>(`#${idPrefix}-search`);
    if (stashSearchInput) {
      stashSearchInput.addEventListener('input', function(this: HTMLInputElement) {
        rerenderManagedGrid(currentStashTab, idPrefix, this.value.trim().toLowerCase());
      });
    }

    // 储藏间标签筛选栏事件绑定（Phase 2）（仅非"全部"tab）
    if (!isStashAllTab) {
      // 最近10张按钮
      qs('[data-recent-toggle]')?.addEventListener('click', function(this: HTMLElement) {
        showRecentOnly[currentStashTab] = !showRecentOnly[currentStashTab];
        if (showRecentOnly[currentStashTab]) {
          setCurrentFilterTag(null);
          showFavOnly[currentStashTab] = false;
          qsa('.th-tag-filter-btn[data-filter-tag]').forEach(b => b.classList.remove('active'));
          qs('[data-fav-toggle]')?.classList.remove('active');
        }
        this.classList.toggle('active', showRecentOnly[currentStashTab]);
        const grid = qs(`#${idPrefix}-grid`);
        if (grid) grid.innerHTML = renderManagedBuckets(currentStashTab, idPrefix, (qs<HTMLInputElement>(`#${idPrefix}-search`)?.value || '').trim().toLowerCase());
        bindManagedCardEvents(currentStashTab, idPrefix);
      });

      // 只看收藏按钮
      qs('[data-fav-toggle]')?.addEventListener('click', function(this: HTMLElement) {
        showFavOnly[currentStashTab] = !showFavOnly[currentStashTab];
        if (showFavOnly[currentStashTab]) {
          setCurrentFilterTag(null);
          showRecentOnly[currentStashTab] = false;
          qsa('.th-tag-filter-btn[data-filter-tag]').forEach(b => b.classList.remove('active'));
          qs('[data-recent-toggle]')?.classList.remove('active');
        }
        this.classList.toggle('active', showFavOnly[currentStashTab]);
        const grid = qs(`#${idPrefix}-grid`);
        if (grid) grid.innerHTML = renderManagedBuckets(currentStashTab, idPrefix, (qs<HTMLInputElement>(`#${idPrefix}-search`)?.value || '').trim().toLowerCase());
        bindManagedCardEvents(currentStashTab, idPrefix);
      });

      // 标签筛选按钮
      qsa('.th-tag-filter-btn[data-filter-tag]').forEach(btn => {
        btn.addEventListener('click', () => {
          showRecentOnly[currentStashTab] = false;
          showFavOnly[currentStashTab] = false;
          qs('[data-recent-toggle]')?.classList.remove('active');
          qs('[data-fav-toggle]')?.classList.remove('active');
          const filterTag = btn.getAttribute('data-filter-tag') || '__all__';
          if (filterTag === '__all__') setCurrentFilterTag(null);
          else if (filterTag === '__none__') setCurrentFilterTag('');
          else setCurrentFilterTag(filterTag);
          // 更新 active 状态
          qsa('.th-tag-filter-btn[data-filter-tag]').forEach(b => b.classList.toggle('active', b === btn));
          // 重新渲染桶
          const grid = qs(`#${idPrefix}-grid`);
          if (grid) grid.innerHTML = renderManagedBuckets(currentStashTab, idPrefix, (qs<HTMLInputElement>(`#${idPrefix}-search`)?.value || '').trim().toLowerCase());
          bindManagedCardEvents(currentStashTab, idPrefix);
          bindCollapseToggleEvents(currentStashTab, idPrefix);
        });
      });

      // 排序下拉
      qs<HTMLSelectElement>(`#${idPrefix}-sort`)?.addEventListener('change', function(this: HTMLSelectElement) {
        saveSortMode(currentStashTab, this.value as SortMode);
        rerenderManagedGrid(currentStashTab, idPrefix, (qs<HTMLInputElement>(`#${idPrefix}-search`)?.value || '').trim().toLowerCase());
      });

      // 全部折叠按钮
      qs(`#${idPrefix}-collapse-all`)?.addEventListener('click', () => {
        setAllBucketsCollapsed(currentStashTab, true);
        updateAllBucketVisuals();
      });

      // 全部展开按钮
      qs(`#${idPrefix}-expand-all`)?.addEventListener('click', () => {
        setAllBucketsCollapsed(currentStashTab, false);
        updateAllBucketVisuals();
      });

      // 绑定折叠/展开 toggle 事件
      bindCollapseToggleEvents(currentStashTab, idPrefix);
    }

    // 卡片事件
    bindManagedCardEvents(currentStashTab, idPrefix);

    // 新建按钮 → 打开结构化表单（与背包一致）
    qs(`#${idPrefix}-add-btn`)?.addEventListener('click', () => {
      openStashAddItemForm(currentStashTab);
    });
  } catch(e) { console.error('[bindStashModalEvents] error:', e); }
}

// 储藏间新建物品 — 结构化表单（与背包字段一致）
function openStashAddItemForm(kind: ManagedKind) {
  const cfg = getStashKindCfg(kind);
  const isFixed = STASH_FIXED_KINDS.includes(kind);
  const fieldOrder: Record<string, string[]> = {
    'stash-item': ['名称','数量','简介','效果','评价'],
    'stash-skill': ['名称','等级','简介','效果','评价'],
    'stash-status': ['名称','效果','来源','持续时间'],
    'stash-clothing': ['名称','穿着部位','衣物状态','外观详情'],
  };
  const defaults: Record<string, Record<string, any>> = {
    'stash-item': {数量:1,简介:'',效果:'',评价:''},
    'stash-skill': {等级:1,简介:'',效果:'',评价:''},
    'stash-status': {效果:'',来源:'',持续时间:''},
    'stash-clothing': {穿着部位:'',衣物状态:'',外观详情:''},
  };
  const fields = isFixed ? (fieldOrder[kind] || ['名称','简介']) : ['名称','简介'];
  const defs = isFixed ? (defaults[kind] || {}) : {};
  const longFields = new Set(['简介','效果','评价','外观详情']);

  let h = `<div class="th-add-form">`;
  for (const f of fields) {
    const value = f === '名称' ? '' : (defs[f] ?? '');
    const isNum = (kind === 'stash-item' && f === '数量') || (kind === 'stash-skill' && f === '等级');
    h += `<div class="th-modal-section"><div class="th-modal-label">${esc(f)}</div>`;
    if (longFields.has(f)) h += `<textarea class="th-edit-textarea th-add-field" data-add-field="${escAttr(f)}" rows="3">${esc(value)}</textarea>`;
    else h += `<input class="th-edit-input th-add-field" data-add-field="${escAttr(f)}" type="${isNum ? 'number' : 'text'}" value="${escAttr(value)}">`;
    h += `</div>`;
  }
  h += `<div class="th-edit-actions">
    <button class="th-btn-sm th-btn-add-confirm" type="button"><i class="fa-solid fa-check"></i> 添加</button>
    <button class="th-btn-sm th-btn-add-cancel" type="button" style="margin-left:auto"><i class="fa-solid fa-xmark"></i> 取消</button>
  </div></div>`;

  openModal2(`<i class="${cfg.icon}"></i> 新建${cfg.label}`, h);

  setTimeout(() => {
    const root = qs('.th-modal-body-2'); if (!root) return;
    const getVal = (f: string) => (root.querySelector(`[data-add-field="${f}"]`) as HTMLInputElement | HTMLTextAreaElement | null)?.value || '';

    root.querySelector('.th-btn-add-cancel')?.addEventListener('click', () => { closeModal2(); });

    root.querySelector('.th-btn-add-confirm')?.addEventListener('click', () => {
      const name = getVal('名称').trim();
      if (!name) { toastr?.warning?.('请输入名称'); return; }

      if (isFixed) {
        // 固定 kind: 构建结构化 payload（与背包一致）
        const addKind: AddKind = kind === 'stash-item' ? 'item' : kind === 'stash-skill' ? 'skill' : kind === 'stash-status' ? 'status' : 'clothing';
        const payload: Record<string, any> = { ...getDefaultEntry(addKind) };
        for (const f of fields) {
          if (f === '名称') continue;
          const raw = getVal(f);
          if ((addKind === 'item' && f === '数量') || (addKind === 'skill' && f === '等级')) {
            const n = Number(raw); payload[f] = isNaN(n) ? payload[f] : n;
          } else {
            payload[f] = raw;
          }
        }
        setCurrentManagedItems(kind, getManagedItems(kind));
        // desc 存 JSON 字符串，保持 ManagedItemV2 兼容
        addManagedItem(kind, name, { desc: JSON.stringify(payload), tags: [], inject: cfg.defaultInject });
      } else {
        // 自定义 kind: 简单 name+desc
        const desc = getVal('简介').trim();
        if (!desc) { toastr?.warning?.('请输入简介'); return; }
        setCurrentManagedItems(kind, getManagedItems(kind));
        addManagedItem(kind, name, { desc, tags: [], inject: cfg.defaultInject });
      }

      toastr?.success?.(`已添加：${name}`);
      closeModal2();
      openStashModal(kind);
    });

    (root.querySelector('[data-add-field="名称"]') as HTMLInputElement | null)?.focus();
  }, 60);
}

// 新建自定义 kind inline form
function showNewStashKindForm() {
  // 26+ 常用 icon grid（均已在 lib/icons.ts 的 ICONS 映射中，避免渲染成白色方块）
  const ICON_GRID = [
    'fa-solid fa-box', 'fa-solid fa-trophy', 'fa-solid fa-star', 'fa-solid fa-gem',
    'fa-solid fa-wand-magic-sparkles', 'fa-solid fa-scroll', 'fa-solid fa-book',
    'fa-solid fa-puzzle-piece', 'fa-solid fa-gift', 'fa-solid fa-crown',
    'fa-solid fa-shield-halved', 'fa-solid fa-sword', 'fa-solid fa-bolt',
    'fa-solid fa-heart', 'fa-solid fa-fire', 'fa-solid fa-leaf',
    'fa-solid fa-moon', 'fa-solid fa-sun', 'fa-solid fa-music',
    'fa-solid fa-palette', 'fa-solid fa-feather', 'fa-solid fa-ring',
    'fa-solid fa-hat-wizard', 'fa-solid fa-key', 'fa-solid fa-coins',
    'fa-solid fa-compass', 'fa-solid fa-map',
  ];
  const iconGridHtml = ICON_GRID.map(icon =>
    `<button class="th-icon-grid-item" data-icon="${icon}"><i class="${icon}"></i></button>`
  ).join('');

  const formHtml = `
    <div class="th-stash-new-kind-form">
      <div class="th-modal-section">
        <div class="th-modal-label">类别名称（英文小写+数字+短横线，1-12字符）</div>
        <input class="th-edit-input" id="th-new-kind-name" placeholder="achievement" maxlength="12" pattern="[a-z0-9-]+">
      </div>
      <div class="th-modal-section">
        <div class="th-modal-label">显示名称（可选，默认=类别名称）</div>
        <input class="th-edit-input" id="th-new-kind-label" placeholder="成就">
      </div>
      <div class="th-modal-section">
        <div class="th-modal-label">图标（点击选择）</div>
        <input class="th-edit-input" id="th-new-kind-icon" value="fa-solid fa-box" readonly style="margin-bottom:6px">
        <div class="th-icon-grid">${iconGridHtml}</div>
      </div>
      <div class="th-edit-actions">
        <button class="th-btn-sm th-btn-new-kind-confirm" type="button"><i class="fa-solid fa-check"></i> 创建</button>
        <button class="th-btn-sm th-btn-new-kind-cancel" type="button" style="margin-left:auto"><i class="fa-solid fa-xmark"></i> 取消</button>
      </div>
    </div>
  `;
  openModal2('<i class="fa-solid fa-plus"></i> 新建储藏间类别', formHtml);

  setTimeout(() => {
    qs('.th-btn-new-kind-cancel')?.addEventListener('click', () => { closeModal2(); });
    // Icon grid 点选
    qsa('.th-icon-grid-item').forEach(item => {
      item.addEventListener('click', () => {
        const icon = item.getAttribute('data-icon') || '';
        const iconInput = qs<HTMLInputElement>('#th-new-kind-icon');
        if (iconInput) iconInput.value = icon;
        // 高亮选中态
        qsa('.th-icon-grid-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
      });
    });
    qs('.th-btn-new-kind-confirm')?.addEventListener('click', () => {
      const nameInput = qs<HTMLInputElement>('#th-new-kind-name');
      const labelInput = qs<HTMLInputElement>('#th-new-kind-label');
      const iconInput = qs<HTMLInputElement>('#th-new-kind-icon');
      const kindName = (nameInput?.value || '').trim().toLowerCase();
      const label = (labelInput?.value || '').trim() || kindName;
      const icon = (iconInput?.value || '').trim() || 'fa-solid fa-box';

      // 校验
      if (!kindName) { toastr?.warning?.('请输入类别名称'); return; }
      if (!/^[a-z0-9-]{1,12}$/.test(kindName)) { toastr?.warning?.('类别名称只能包含英文小写、数字和短横线，1-12字符'); return; }
      if (STASH_FIXED_KINDS.includes(`stash-${kindName}` as ManagedKind) || kindName === 'uncategorized') { toastr?.warning?.('类别名称与固定类别冲突'); return; }
      const existing = loadStashKinds();
      if (existing[kindName]) { toastr?.warning?.('已存在同名类别'); return; }

      addStashKind(kindName, { icon, label });
      closeModal2();
      currentStashTab = `stash-custom-${kindName}` as ManagedKind;
      openStashModal(currentStashTab);
      toastr?.success?.(`已创建类别：${label}`);
    });
  }, 100);
}

// "全部" tab: 按 kind 分组平铺渲染所有储藏间卡片
function renderAllStashCards(allTabs: ManagedKind[]): string {
  let html = '';
  const allTags = loadTags();
  for (const kind of allTabs) {
    const kindCfg = getStashKindCfg(kind);
    const items = getManagedItems(kind);
    const entries = Object.entries(items);
    if (!entries.length) continue;
    const kindTags = allTags[kind] || {};
    html += `<div class="th-stash-all-group">
      <div class="th-stash-all-group-header"><i class="${kindCfg.icon}"></i> ${esc(kindCfg.label)} (${entries.length})</div>`;
    for (const [name, item] of entries) {
      const fullDesc = getDisplayDesc(item.desc);
      const hasCustomInject = !!item.inject;
      const isFav = !!item.favorite;
      // 标签色点
      const tagDots = (item.tags || []).filter(t => kindTags[t]).map(tagName => {
        const color = kindTags[tagName].color;
        return `<span class="th-card-tag-dot" data-jump-tag="${escAttr(tagName)}" style="background:var(--${color || 'tx3'})" title="${escAttr(tagName)}"></span>`;
      }).join('');
      // hover 工具栏（反馈7：全部 tab 也要有编辑/收藏/复制/删除按钮）
      let actionsHtml = '';
      actionsHtml += `<button class="th-card-act" data-card-act="edit" title="编辑"><i class="fa-solid fa-pen"></i></button>`;
      actionsHtml += `<button class="th-card-act th-card-act-fav" data-card-act="fav" title="${isFav?'取消收藏':'收藏'}"><i class="fa-solid ${isFav?'fa-star':'fa-star-half-stroke'}"></i></button>`;
      actionsHtml += `<button class="th-card-act" data-card-act="copy" title="复制"><i class="fa-solid fa-copy"></i></button>`;
      actionsHtml += `<button class="th-card-act th-card-act-danger" data-card-act="del" title="删除"><i class="fa-solid fa-xmark"></i></button>`;

      html += `<div class="th-location-card th-managed-card${isFav?' favorite':''}" data-managed-kind="${kind}" data-managed-name="${escAttr(name)}" data-managed-desc="${escAttr(item.desc)}" title="${escAttr(fullDesc)}">
        <i class="${kindCfg.icon}" style="color:var(--gold);font-size:14px"></i>
        <div class="th-managed-card-main" style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14px;line-height:1.3">
            ${esc(name)}${hasCustomInject ? ' <i class="fa-solid fa-pen-fancy th-inject-badge" title="已自定义注入模板" style="font-size:10px;color:var(--mint);margin-left:4px"></i>' : ''}
            ${isFav ? ' <i class="fa-solid fa-star th-fav-star" style="font-size:10px;color:var(--gold);margin-left:4px"></i>' : ''}
          </div>
          <div class="th-managed-card-preview" style="margin-top:2px">${esc(fullDesc)}</div>
        </div>
        <div class="th-managed-card-tags" style="display:flex;gap:3px;align-items:center;flex-shrink:0;margin:0 6px">${tagDots}</div>
        <div class="th-card-actions">${actionsHtml}</div>
      </div>`;
    }
    html += `</div>`;
  }
  if (!html) html = '<div class="th-empty th-empty-guide" style="padding:40px 20px;text-align:center"><i class="fa-solid fa-box-open" style="font-size:32px;color:var(--tx3);display:block;margin-bottom:12px"></i><br>储藏间空空如也~<br><span class="th-empty-hint" style="font-size:13px;color:var(--tx3);font-style:normal">点右上角 <i class="fa-solid fa-plus" style="font-size:11px;color:var(--pink)"></i> 新建，或 <i class="fa-solid fa-upload" style="font-size:11px;color:var(--pink)"></i> 导入预设</span></div>';
  return html;
}
