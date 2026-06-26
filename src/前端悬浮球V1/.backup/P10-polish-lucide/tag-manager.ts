// 标签管理 modal + 批量打标（解耦阶段 1d）。
// 从 status-bar-init.ts 纯移动；行为保持一致。
// currentSelectedTag / currentTagManagerKind 为本模块私有 whole-reassigned 状态，移入此处；
// currentFilterTag 为主文件 whole-reassigned 状态，模块只读，通过 getCurrentFilterTag() getter 懒读以防引用断开（§4.2）。
// showRecentOnly/showFavOnly/batchMode/batchSelection 为对象引用型全局，仅属性读写，import 同一引用即可（§4.1）。
// ================================================================
import { esc, escAttr, qs, qsa } from '../lib/dom-utils';
import {
  type ManagedKind,
  MANAGED_CFG,
  TAG_COLOR_PALETTE,
  TAG_PRESETS,
} from '../lib/config';
import {
  type Tag,
  loadTags,
  saveTags,
  deleteTag,
  addItemTag,
  removeItemTag,
  getManagedItems,
  getCurrentManagedItems,
  addManagedItem,
  setCurrentManagedItems,
  saveManagedOverrides,
  getStashKindCfg,
} from '../lib/managed-store';
import {
  openModal2,
  closeModal2,
  getCurrentFilterTag,
  showRecentOnly,
  showFavOnly,
  batchMode,
  batchSelection,
} from '../status-bar-init';
import {
  getDisplayDesc,
  rerenderManagedGrid,
  toggleManagedWorldbookEntry,
  loadSortMode,
} from './managed-modal';

// 本模块私有 whole-reassigned 状态（原主文件 currentSelectedTag）。
// currentTagManagerKind 原也在此，但经 grep 确认全文从未被读取（仅 setCurrentTagManagerKind 写入），
// 已连同 setter、调用方一并移除（死写入清理）。
let currentSelectedTag: string | null = null;

export function openBatchTagSelectModal(kind: ManagedKind, idPrefix: string, selectedItems: string[]) {
  const allTags = loadTags();
  const kindTags = allTags[kind] || {};
  const tagList = Object.keys(kindTags);

  let h = `<div class="th-batch-tag-modal" style="padding:10px">
    <div style="margin-bottom:16px;font-weight:600">为 ${selectedItems.length} 张卡片选择标签</div>
    <div class="th-batch-tag-list" style="max-height:300px;overflow-y:auto;display:grid;gap:8px">`;
  if (tagList.length === 0) {
    h += `<div style="text-align:center;color:var(--tx3);padding:20px">暂无标签，请先创建标签</div>`;
  } else {
    for (const tagName of tagList) {
      const tag = kindTags[tagName];
      h += `<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg3);border-radius:8px;cursor:pointer">
        <input type="checkbox" data-batch-tag="${escAttr(tagName)}">
        <span class="th-tag-color-swatch" style="background:var(--${tag.color || 'tx3'})"></span>
        <span>${esc(tagName)}</span>
      </label>`;
    }
  }
  h += `</div>
    <div style="display:flex;gap:8px;margin-top:20px;justify-content:flex-end">
      <button class="th-btn" id="th-batch-tag-cancel">取消</button>
      <button class="th-btn th-btn-primary" id="th-batch-tag-confirm">确认打标</button>
    </div>
  </div>`;

  openModal2('批量打标', h);

  setTimeout(() => {
    qs('#th-batch-tag-cancel')?.addEventListener('click', () => closeModal2());
    qs('#th-batch-tag-confirm')?.addEventListener('click', () => {
      const checkedTags: string[] = [];
      qsa('input[data-batch-tag]:checked').forEach(cb => {
        const tagName = cb.getAttribute('data-batch-tag');
        if (tagName) checkedTags.push(tagName);
      });
      if (checkedTags.length === 0) {
        toastr?.warning?.('请至少选择一个标签');
        return;
      }
      const selectedTag = checkedTags[0];
      // 为每张选中的卡片设置单一标签
      const items = getCurrentManagedItems(kind);
      for (const itemName of selectedItems) {
        const item = items[itemName];
        if (item) {
          item.tags = [selectedTag];
          addManagedItem(kind, itemName, item); // 保存
        }
      }
      toastr?.success?.(`已为 ${selectedItems.length} 张卡片设置标签「${selectedTag}」`);
      closeModal2();
      // 清除选中状态并刷新
      if (batchSelection[kind]) batchSelection[kind].clear();
      rerenderManagedGrid(kind, idPrefix, (qs<HTMLInputElement>(`#${idPrefix}-search`)?.value || '').trim().toLowerCase());
    });
  }, 60);
}

export function openTagManagerModal(kind: ManagedKind, idPrefix: string) {
  currentSelectedTag = null;
  const cfg = getStashKindCfg(kind); // 统一用这个，支持 stash 和非 stash
  const allTags = loadTags();
  const kindTags = allTags[kind] || {};
  const tagList = Object.entries(kindTags);

  let h = `<div class="th-tag-manager">`;
  // 左半：标签列表
  h += `<div class="th-tag-manager-left">
    <div class="th-tag-manager-header">
      <button class="th-btn-sm" id="th-new-tag-btn"><i class="fa-solid fa-plus"></i> 新建标签</button>
      <input class="th-edit-input" id="th-tag-search" type="search" placeholder="搜索标签...">
    </div>
    <div class="th-tag-manager-stats">${tagList.length} 个标签，共 ${countTaggedItems(kind)} 张卡片已打标</div>
    <div class="th-tag-list" id="th-tag-list">`;
  if (tagList.length === 0) {
    h += `<div class="th-empty" style="padding:20px;text-align:center"><i class="fa-solid fa-tags"></i> 暂无标签，点击上方新建</div>`;
  } else {
    for (const [tagName, tag] of tagList) {
      const itemCount = countItemsWithTag(kind, tagName);
      h += `<div class="th-tag-item" data-tag-name="${escAttr(tagName)}">
        <span class="th-tag-color-swatch" style="background:var(--${tag.color})"></span>
        <div class="th-tag-info">
          <div class="th-tag-name">${esc(tagName)}</div>
          ${tag.desc ? `<div class="th-tag-desc">${esc(tag.desc)}</div>` : ''}
        </div>
        <span class="th-tag-count">${itemCount}</span>
        <div class="th-tag-actions">
          <button class="th-tag-action-btn" data-edit-tag="${escAttr(tagName)}" title="编辑"><i class="fa-solid fa-pen"></i></button>
          <button class="th-tag-action-btn" data-delete-tag="${escAttr(tagName)}" title="删除"><i class="fa-solid fa-trash"></i></button>
          ${!kind.startsWith('stash-') ? `<button class="th-tag-action-btn" data-batch-disable-tag="${escAttr(tagName)}" title="批量关世界书"><i class="fa-solid fa-power-off" style="color:var(--red)"></i></button><button class="th-tag-action-btn" data-batch-enable-tag="${escAttr(tagName)}" title="批量开世界书"><i class="fa-solid fa-power-off" style="color:var(--mint)"></i></button>` : ''}
        </div>
      </div>`;
    }
  }
  h += `</div></div>`; // 左半结束

  // 右半：卡片打标
  h += `<div class="th-tag-manager-right" id="th-tag-manager-right">`;
  h += `<div class="th-empty" style="padding:40px 20px;text-align:center">
    <i class="fa-solid fa-arrow-left" style="font-size:32px;color:var(--tx3);margin-bottom:12px"></i>
    <div>请在左侧选择一个标签进行打标</div>
  </div>`;
  h += `</div>`; // 右半结束

  h += `</div>`; // th-tag-manager 结束

  openModal2(`<i class="fa-solid fa-tags"></i> 标签管理 · ${cfg.label}`, h);

  setTimeout(() => bindTagManagerEvents(kind, idPrefix), 60);
}

function countTaggedItems(kind: ManagedKind): number {
  const items = getManagedItems(kind);
  return Object.values(items).filter(item => item.tags && item.tags.length > 0).length;
}

function countItemsWithTag(kind: ManagedKind, tagName: string): number {
  const items = getManagedItems(kind);
  return Object.values(items).filter(item => item.tags && item.tags.includes(tagName)).length;
}

function bindTagManagerEvents(kind: ManagedKind, idPrefix: string) {
  const root = qs('.th-modal-body-2');
  if (!root) return;

  // 新建标签按钮
  qs('#th-new-tag-btn')?.addEventListener('click', () => showNewTagForm(kind, idPrefix));

  // 标签搜索
  qs('#th-tag-search')?.addEventListener('input', function(this: HTMLInputElement) {
    const q = this.value.trim().toLowerCase();
    filterTagList(q);
  });

  // 标签项点击（选择标签，显示右半打标列表）
  qsa('.th-tag-item').forEach(item => {
    item.addEventListener('click', (e) => {
      // 如果点击的是操作按钮，不选择标签
      if ((e.target as HTMLElement).closest('.th-tag-action-btn')) return;
      const tagName = item.getAttribute('data-tag-name') || '';
      selectTagForItemCheck(kind, tagName, idPrefix);
    });
  });

  // 编辑标签按钮
  qsa('[data-edit-tag]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tagName = btn.getAttribute('data-edit-tag') || '';
      showEditTagForm(kind, tagName, idPrefix);
    });
  });

  // 删除标签按钮
  qsa('[data-delete-tag]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tagName = btn.getAttribute('data-delete-tag') || '';
      if (confirm(`确定要删除标签「${tagName}」吗？\n该标签将从所有已打标的卡片上移除。`)) {
        deleteTag(kind, tagName);
        // 从所有 item 上移除该标签
        const items = getManagedItems(kind);
        for (const [itemName, item] of Object.entries(items)) {
          if (item.tags && item.tags.includes(tagName)) {
            removeItemTag(kind, itemName, tagName);
          }
        }
        toastr?.success?.(`已删除标签：${tagName}`);
        openTagManagerModal(kind, idPrefix); // 刷新
      }
    });
  });

  // 批量关世界书按钮（仅非 stash kind）
  qsa('[data-batch-disable-tag]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tagName = btn.getAttribute('data-batch-disable-tag') || '';
      const count = countItemsWithTag(kind, tagName);
      if (!confirm(`关闭「${tagName}」下 ${count} 个${MANAGED_CFG[kind].label}对应的世界书条目？\n(可重新打开)`)) return;
      void disableManagedByTag(kind, tagName);
    });
  });

  // 批量开世界书按钮（仅非 stash kind）
  qsa('[data-batch-enable-tag]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tagName = btn.getAttribute('data-batch-enable-tag') || '';
      const count = countItemsWithTag(kind, tagName);
      if (!confirm(`开启「${tagName}」下 ${count} 个${MANAGED_CFG[kind].label}对应的世界书条目？\n(可重新关闭)`)) return;
      void enableManagedByTag(kind, tagName);
    });
  });
}

// 按标签批量关闭世界书条目
async function disableManagedByTag(kind: ManagedKind, tagName: string) {
  const items = getManagedItems(kind);
  const taggedItems = Object.entries(items).filter(([_, item]) => item.tags && item.tags.includes(tagName));
  if (!taggedItems.length) { toastr?.warning?.('该标签下没有卡片'); return; }

  toastr?.info?.(`正在关闭... 0/${taggedItems.length}`);

  let success = 0;
  let failed = 0;
  for (const [itemName, item] of taggedItems) {
    try {
      const result = await toggleManagedWorldbookEntry(kind, itemName, item.desc);
      if (result !== null) success++;
      else failed++;
    } catch { failed++; }
  }

  toastr?.success?.(`已关闭 ${success} 个世界书条目${failed > 0 ? `，${failed} 个失败` : ''}`);
}

async function enableManagedByTag(kind: ManagedKind, tagName: string) {
  const items = getManagedItems(kind);
  const taggedItems = Object.entries(items).filter(([_, item]) => item.tags && item.tags.includes(tagName));
  if (!taggedItems.length) { toastr?.warning?.('该标签下没有卡片'); return; }

  toastr?.info?.(`正在开启... 0/${taggedItems.length}`);

  let success = 0;
  let failed = 0;
  for (const [itemName, item] of taggedItems) {
    try {
      const result = await toggleManagedWorldbookEntry(kind, itemName, item.desc);
      if (result !== null) success++;
      else failed++;
    } catch { failed++; }
  }

  toastr?.success?.(`已开启 ${success} 个世界书条目${failed > 0 ? `，${failed} 个失败` : ''}`);
}

function filterTagList(query: string) {
  const items = qsa<HTMLElement>('.th-tag-item');
  items.forEach(item => {
    const name = item.getAttribute('data-tag-name') || '';
    const desc = item.querySelector('.th-tag-desc')?.textContent || '';
    const match = !query || name.toLowerCase().includes(query) || desc.toLowerCase().includes(query);
    item.style.display = match ? '' : 'none';
  });
}

// 选择标签后，右半显示该标签的卡片打标列表
function selectTagForItemCheck(kind: ManagedKind, tagName: string, _idPrefix: string) {
  currentSelectedTag = tagName;
  const right = qs('#th-tag-manager-right');
  if (!right) return;

  // 高亮选中的标签
  qsa('.th-tag-item').forEach(el => el.classList.remove('active'));
  qs(`.th-tag-item[data-tag-name="${escAttr(tagName)}"]`)?.classList.add('active');

  const items = getManagedItems(kind);
  const itemList = Object.entries(items);
  if (itemList.length === 0) {
    right.innerHTML = `<div class="th-empty" style="padding:40px 20px;text-align:center">
      <i class="fa-solid fa-box-open" style="font-size:32px;color:var(--tx3);margin-bottom:12px"></i>
      <div>该 kind 下暂无卡片</div>
    </div>`;
    return;
  }

  const allTags = loadTags();
  const tag = allTags[kind]?.[tagName];

  let h = `<div class="th-tag-check-header">
    <div class="th-tag-check-title">
      <span class="th-tag-color-swatch" style="background:var(--${tag?.color || 'pink'})"></span>
      <span>「${esc(tagName)}」打标管理</span>
    </div>
    <input class="th-edit-input" id="th-tag-item-search" type="search" placeholder="搜索卡片...">
    <div class="th-tag-check-actions">
      <button class="th-btn-sm" id="th-select-all-items"><i class="fa-solid fa-check-double"></i> 全选</button>
      <button class="th-btn-sm" id="th-deselect-all-items"><i class="fa-solid fa-times"></i> 全不选</button>
    </div>
  </div>`;

  h += `<div class="th-tag-check-list" id="th-tag-check-list">`;
  for (const [itemName, item] of itemList) {
    const hasTag = item.tags && item.tags.includes(tagName);
    const itemTags = item.tags || [];
    const tagsHtml = itemTags.map(t => {
      const tColor = allTags[kind]?.[t]?.color || 'tx3';
      return `<span class="th-tag-mini-swatch" style="background:var(--${tColor})" title="${escAttr(t)}"></span>`;
    }).join('');
    h += `<label class="th-tag-check-item">
      <input type="checkbox" class="th-tag-item-checkbox" data-item-name="${escAttr(itemName)}" ${hasTag ? 'checked' : ''}>
      <span class="th-tag-check-item-info">
        <span class="th-tag-check-item-name">${esc(itemName)}</span>
        <span class="th-tag-check-item-desc">${esc(getDisplayDesc(item.desc).slice(0, 60))}</span>
      </span>
      <span class="th-tag-check-item-tags">${tagsHtml}</span>
    </label>`;
  }
  h += `</div>`;

  right.innerHTML = h;

  // 绑定事件
  qsa('.th-tag-item-checkbox').forEach(cb => {
    cb.addEventListener('change', function(this: HTMLInputElement) {
      const itemName = this.getAttribute('data-item-name') || '';
      if (this.checked) addItemTag(kind, itemName, tagName);
      else removeItemTag(kind, itemName, tagName);
      // 更新左侧标签计数
      updateTagCount(kind, tagName);
    });
  });

  qs('#th-select-all-items')?.addEventListener('click', () => {
    qsa<HTMLInputElement>('.th-tag-item-checkbox').forEach(cb => {
      if (!cb.checked) { cb.checked = true; const itemName = cb.getAttribute('data-item-name') || ''; addItemTag(kind, itemName, tagName); }
    });
    updateTagCount(kind, tagName);
  });

  qs('#th-deselect-all-items')?.addEventListener('click', () => {
    qsa<HTMLInputElement>('.th-tag-item-checkbox').forEach(cb => {
      if (cb.checked) { cb.checked = false; const itemName = cb.getAttribute('data-item-name') || ''; removeItemTag(kind, itemName, tagName); }
    });
    updateTagCount(kind, tagName);
  });

  qs('#th-tag-item-search')?.addEventListener('input', function(this: HTMLInputElement) {
    const q = this.value.trim().toLowerCase();
    qsa<HTMLElement>('.th-tag-check-item').forEach(item => {
      const name = item.querySelector('.th-tag-check-item-name')?.textContent || '';
      const desc = item.querySelector('.th-tag-check-item-desc')?.textContent || '';
      const match = !q || name.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
      item.style.display = match ? '' : 'none';
    });
  });
}

function updateTagCount(kind: ManagedKind, tagName: string) {
  const item = qs(`.th-tag-item[data-tag-name="${escAttr(tagName)}"] .th-tag-count`);
  if (item) item.textContent = String(countItemsWithTag(kind, tagName));
}

// 新建/编辑标签共用的表单渲染
function renderTagForm(tagName: string = '', tag: Tag = { color: 'pink', desc: '' }, isEdit: boolean = false): string {
  const colorGrid = TAG_COLOR_PALETTE.map(c =>
    `<button class="th-color-swatch ${c === tag.color ? 'active' : ''}" data-color="${c}" style="background:var(--${c})" title="${c}"></button>`
  ).join('');

  const presetBtns = TAG_PRESETS.map(p =>
    `<button class="th-tag-preset-btn" data-preset-name="${p.name}" data-preset-color="${p.color}" data-preset-desc="${p.desc}">
      <span class="th-tag-color-swatch" style="background:var(--${p.color})"></span> ${esc(p.name)}
    </button>`
  ).join('');

  return `<div class="th-tag-form">
    <div class="th-modal-section">
      <div class="th-modal-label">标签名称</div>
      <input class="th-edit-input" id="th-tag-form-name" value="${escAttr(tagName)}" placeholder="输入标签名称" maxlength="12">
    </div>
    <div class="th-modal-section">
      <div class="th-modal-label">颜色</div>
      <input class="th-edit-input" id="th-tag-form-color" value="${escAttr(tag.color)}" readonly style="margin-bottom:6px">
      <div class="th-color-palette">${colorGrid}</div>
    </div>
    <div class="th-modal-section">
      <div class="th-modal-label">快速预设</div>
      <div class="th-tag-presets">${presetBtns}</div>
    </div>
    <div class="th-modal-section">
      <div class="th-modal-label">描述（可选）</div>
      <textarea class="th-edit-textarea" id="th-tag-form-desc" rows="2" placeholder="输入标签描述">${esc(tag.desc)}</textarea>
    </div>
    <div class="th-modal-section">
      <div class="th-modal-label">默认注入模板（可选）</div>
      <textarea class="th-edit-textarea" id="th-tag-form-inject" rows="2" placeholder="给打此标签的卡片自动应用的注入模板，如：{{desc}}">${esc(tag.defaultInject || '')}</textarea>
    </div>
    <div class="th-edit-actions">
      <button class="th-btn-sm th-btn-tag-save" type="button"><i class="fa-solid fa-check"></i> ${isEdit ? '保存' : '创建'}</button>
      <button class="th-btn-sm th-btn-tag-cancel" type="button" style="margin-left:auto"><i class="fa-solid fa-times"></i> 取消</button>
    </div>
  </div>`;
}

function showNewTagForm(kind: ManagedKind, idPrefix: string) {
  const right = qs('#th-tag-manager-right');
  if (!right) return;

  right.innerHTML = renderTagForm('', { color: 'pink', desc: '' }, false);
  bindTagFormEvents(kind, '', idPrefix, false);
}

function showEditTagForm(kind: ManagedKind, tagName: string, idPrefix: string) {
  const allTags = loadTags();
  const tag = allTags[kind]?.[tagName] || { color: 'pink', desc: '' };
  const right = qs('#th-tag-manager-right');
  if (!right) return;

  right.innerHTML = renderTagForm(tagName, tag, true);
  bindTagFormEvents(kind, tagName, idPrefix, true);
}

function bindTagFormEvents(kind: ManagedKind, originalName: string, idPrefix: string, isEdit: boolean) {
  // 颜色点选
  qsa('.th-color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      const color = swatch.getAttribute('data-color') || '';
      const colorInput = qs<HTMLInputElement>('#th-tag-form-color');
      if (colorInput) colorInput.value = color;
      qsa('.th-color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
    });
  });

  // 预设按钮
  qsa('.th-tag-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-preset-name') || '';
      const color = btn.getAttribute('data-preset-color') || '';
      const desc = btn.getAttribute('data-preset-desc') || '';
      const nameInput = qs<HTMLInputElement>('#th-tag-form-name');
      const colorInput = qs<HTMLInputElement>('#th-tag-form-color');
      const descInput = qs<HTMLTextAreaElement>('#th-tag-form-desc');
      if (nameInput) nameInput.value = name;
      if (colorInput) colorInput.value = color;
      if (descInput) descInput.value = desc;
      qsa('.th-color-swatch').forEach(s => s.classList.toggle('active', s.getAttribute('data-color') === color));
    });
  });

  // 取消按钮
  qs('.th-btn-tag-cancel')?.addEventListener('click', () => {
    // 返回右半的空状态或选中状态
    if (currentSelectedTag) selectTagForItemCheck(kind, currentSelectedTag, idPrefix);
    else {
      const right = qs('#th-tag-manager-right');
      if (right) right.innerHTML = `<div class="th-empty" style="padding:40px 20px;text-align:center">
        <i class="fa-solid fa-arrow-left" style="font-size:32px;color:var(--tx3);margin-bottom:12px"></i>
        <div>请在左侧选择一个标签进行打标</div>
      </div>`;
    }
  });

  // 保存按钮
  qs('.th-btn-tag-save')?.addEventListener('click', () => {
    const nameInput = qs<HTMLInputElement>('#th-tag-form-name');
    const colorInput = qs<HTMLInputElement>('#th-tag-form-color');
    const descInput = qs<HTMLTextAreaElement>('#th-tag-form-desc');
    const injectInput = qs<HTMLTextAreaElement>('#th-tag-form-inject');
    const newName = (nameInput?.value || '').trim();
    const color = (colorInput?.value || '').trim() || 'pink';
    const desc = (descInput?.value || '').trim();
    const defaultInject = (injectInput?.value || '').trim();

    if (!newName) { toastr?.warning?.('请输入标签名称'); return; }
    if (newName.length > 12) { toastr?.warning?.('标签名称最多12字'); return; }

    const allTags = loadTags();
    if (!allTags[kind]) allTags[kind] = {};

    if (isEdit) {
      const oldTag = allTags[kind][originalName];
      const hadInject = oldTag?.defaultInject && oldTag.defaultInject.trim();

      // 编辑：如果改名了，需要更新所有 item 的 tags
      if (newName !== originalName) {
        if (allTags[kind][newName]) { toastr?.warning?.('已存在同名标签'); return; }
        // 改名
        allTags[kind][newName] = { color, desc, defaultInject };
        delete allTags[kind][originalName];
        // 更新所有 item tags（必须用 setCurrentManagedItems 写回内存，否则 saveManagedOverrides 存的是未改的旧数据）
        const items = getManagedItems(kind);
        let changed = false;
        const oldInject = hadInject ? oldTag.defaultInject : '';
        for (const [itemName, item] of Object.entries(items)) {
          if (item.tags && item.tags.includes(originalName)) {
            item.tags = item.tags.map(t => t === originalName ? newName : t);
            changed = true;
            // 反馈8：改名时同步 defaultInject 变化（规则同"只改"分支）
            if (hadInject && !defaultInject) {
              if (item.inject === oldInject) item.inject = undefined;
            } else if (!hadInject && defaultInject) {
              if (!item.inject || !item.inject.trim()) item.inject = defaultInject;
            } else if (hadInject && defaultInject && oldInject !== defaultInject) {
              if (item.inject === oldInject) item.inject = defaultInject;
            }
          }
        }
        if (changed) {
          setCurrentManagedItems(kind, items);
          saveManagedOverrides(kind);
        }
      } else {
        // 只改颜色/描述/默认注入
        allTags[kind][newName] = { color, desc, defaultInject };
        // 反馈8：标签默认注入模板改变后，同步所有打此标签卡片的 inject：
        //   - 旧有→新空：卡片 inject 等于旧 defaultInject 的，重置为 undefined（fallback 到 kind 默认）
        //   - 旧空→新有：卡片 inject 为空的，应用新 defaultInject
        //   - 旧有→新有（不同）：卡片 inject 等于旧 defaultInject 的，更新为新 defaultInject
        // 卡片若曾被玩家自定义过 inject（与旧 defaultInject 不同），则不被自动覆盖。
        const items = getManagedItems(kind);
        let changed = false;
        const oldInject = hadInject ? oldTag.defaultInject : '';
        for (const [itemName, item] of Object.entries(items)) {
          if (!item.tags || !item.tags.includes(newName)) continue;
          if (hadInject && !defaultInject) {
            if (item.inject === oldInject) { item.inject = undefined; changed = true; }
          } else if (!hadInject && defaultInject) {
            if (!item.inject || !item.inject.trim()) { item.inject = defaultInject; changed = true; }
          } else if (hadInject && defaultInject && oldInject !== defaultInject) {
            if (item.inject === oldInject) { item.inject = defaultInject; changed = true; }
          }
        }
        if (changed) {
          setCurrentManagedItems(kind, items);
          saveManagedOverrides(kind);
        }
      }
      saveTags(allTags);
      toastr?.success?.(`已更新标签：${newName}`);
    } else {
      // 新建
      if (allTags[kind][newName]) { toastr?.warning?.('已存在同名标签'); return; }
      allTags[kind][newName] = { color, desc, defaultInject };
      saveTags(allTags);
      toastr?.success?.(`已创建标签：${newName}`);
    }

    // 刷新标签管理 modal
    openTagManagerModal(kind, idPrefix);
  });
}

// ==================== 标签筛选栏渲染（Phase 2）====================
export function renderTagFilterBar(kind: ManagedKind, idPrefix: string): string {
  const allTags = loadTags();
  const kindTags = allTags[kind] || {};
  const tagNames = Object.keys(kindTags);
  const currentFilterTag = getCurrentFilterTag();

  let h = '<div class="th-tag-filter-bar">';
  // 最近10张按钮
  h += `<button class="th-tag-filter-btn ${showRecentOnly[kind] ? 'active' : ''}" data-recent-toggle="1">
    <i class="fa-solid fa-clock-rotate-left"></i> 最近
  </button>`;
  // 只看收藏按钮
  h += `<button class="th-tag-filter-btn ${showFavOnly[kind] ? 'active' : ''}" data-fav-toggle="1">
    <i class="fa-solid fa-star"></i> 收藏
  </button>`;
  // 全部按钮
  h += `<button class="th-tag-filter-btn ${currentFilterTag === null ? 'active' : ''}" data-filter-tag="__all__">
    <i class="fa-solid fa-layer-group"></i> 全部
  </button>`;
  // 未分类按钮
  h += `<button class="th-tag-filter-btn ${currentFilterTag === '' ? 'active' : ''}" data-filter-tag="__none__">
    <i class="fa-solid fa-folder-open"></i> 未分类
  </button>`;
  // 各标签按钮
  for (const tagName of tagNames) {
    const tag = kindTags[tagName];
    h += `<button class="th-tag-filter-btn ${currentFilterTag === tagName ? 'active' : ''}" data-filter-tag="${escAttr(tagName)}">
      <span class="th-tag-color-swatch" style="background:var(--${tag.color})"></span> ${esc(tagName)}
    </button>`;
  }
  // 快捷操作：排序下拉 + 批量按钮 + 全部折叠 / 全部展开
  const sortMode = loadSortMode(kind);
  h += `<div class="th-tag-filter-actions" style="gap:4px">
    <select class="th-edit-input th-sort-select" id="${idPrefix}-sort" style="padding:4px 8px;font-size:12px;border-radius:8px;width:auto">
      <option value="az" ${sortMode==='az'?'selected':''}>名称 A-Z</option>
      <option value="za" ${sortMode==='za'?'selected':''}>名称 Z-A</option>
      <option value="recent" ${sortMode==='recent'?'selected':''}>最近编辑</option>
      <option value="tag" ${sortMode==='tag'?'selected':''}>标签分组</option>
    </select>
    <button class="th-tag-filter-btn ${batchMode[kind] ? 'active' : ''}" data-batch-toggle="1" title="批量操作">
      <i class="fa-solid fa-check-double"></i> 批量
    </button>
    <button class="th-tag-filter-btn" id="${idPrefix}-collapse-all" title="全部折叠">
      <i class="fa-solid fa-chevron-up"></i>
    </button>
    <button class="th-tag-filter-btn" id="${idPrefix}-expand-all" title="全部展开">
      <i class="fa-solid fa-chevron-down"></i>
    </button>
  </div>`;
  // 批量操作栏（仅批量模式下显示）— §10.11 ② P3fix2:移出 filter-bar,放其下方独立底栏
  // (原在 filter-bar flex 行内导致与标签右侧竖排,改独立行做真正 sticky 底栏)
  const selectionCount = batchSelection[kind]?.size || 0;
  h += `</div>`; // 关闭 .th-tag-filter-bar
  h += `<div class="th-batch-actions" style="display:${batchMode[kind] ? 'flex' : 'none'}">
    <span class="th-batch-count">已选 ${selectionCount} 张</span>
    <button class="th-btn-sm" data-batch-op="selectAll"><i class="fa-solid fa-check-square"></i> 全选</button>
    <button class="th-btn-sm" data-batch-op="deselectAll"><i class="fa-solid fa-square"></i> 全不选</button>
    <button class="th-btn-sm" data-batch-op="delete" style="color:var(--red)"><i class="fa-solid fa-trash"></i> 删除</button>
    <button class="th-btn-sm" data-batch-op="tag"><i class="fa-solid fa-tags"></i> 打标...</button>
    <button class="th-btn-sm" data-batch-op="export"><i class="fa-solid fa-download"></i> 导出</button>
  </div>`;
  return h;
}
