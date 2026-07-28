// 各 APP 通用设置面板（world-app-settings.ts）
// 给每个 APP 一套统一可嵌入的「世界书注入设置 + API 利用设置 + 已注入条目管理」UI。
//   各 APP 在自己的设置 sheet 里调用 wbSyncPanelHtml(appId) / apiPlanPanelHtml(appId) 取 HTML，
//   并在事件委托里调用 bindWbSyncPanel / bindApiPlanPanel 绑定交互。纯 UI 层，命令式 innerHTML。
import { esc, escAttr } from '../../lib/dom-utils';
import { iconHtml } from '../../lib/icons';
import {
  getAppWbConfig, setAppWbConfig, resetAppWbConfig, listSyncEntries, deleteSyncEntry, setSyncEntryEnabled,
  getSyncEntryContent, updateSyncEntryContent,
  type WbInjectMode, type WbPositionType, type WbStrategyType,
} from '../../lib/world/wb-sync';
import {
  getApiPlanDef, isFeatureOn, setFeatureOn, planCount, setPlanCount, resetApiPlan, isFeatureOverridden, COUNT_HARD_CAP,
  type ApiFeature, type ApiCountField,
} from '../../lib/world/api-plan';
import { listPromptTemplates, getPromptText, setPromptOverride, resetPrompt, isPromptOverridden, promptHasWb, getPromptWbKeys, setPromptWbKeys, getCatWbKeys, setCatWbKeys, catHasWb, getPromptTemplate,
  QUALITY_APP_ID, QUALITY_SCOPE_HINT, isPromptBlockEnabled, setPromptBlockEnabled,
  getCustomQualityBlocks, updateCustomQualityBlock } from '../../lib/world/world-prompts';
import { QUALITY_BLOCK_DEFS, QUALITY_EXTRA_DEFS } from '../../lib/world/prompt-kit';
import { chatGenerate, makeSummarizer } from '../../lib/world/ai-chat';
import { wbPickerHtml, bindWbPicker } from '../../lib/world/wb-picker';
import { isWorldbookAvailable } from '../../lib/world/worldbook';
import { effectiveAppMemDefaults, getAppMemOverride, setAppMemOverride, clearAppMemOverride, hasAppMemProfile, listPools, cascadePoolCompress } from '../../lib/world/memory';
import { thPrompt } from '../../lib/world/ui-kit';
import {
  getInjectPlan, getSegSel, setSegSel, previewInjection,
  syncAppWorldbookSegments, removeWorldbookSegment, flushFloorInjection, hasActiveFloorSeg, type InjectMode,
  getSegScopeItems, getSegScopeLabel, getSegScopeSel, setSegScopeSel, getEnvelopeTemplateId,
  effectiveSegments, isSyntheticSegId, getCustomSegs, addCustomSeg, updateCustomSeg, removeCustomSeg, clearStash,
  type SegmentKind,
} from '../../lib/world/inject-plan';

function toast(kind: 'success' | 'error' | 'info' | 'warning', msg: string): void {
  try { (window as any).toastr?.[kind]?.(msg); } catch (e) { void e; }
}

// 就地编辑某条已写入世界书条目的正文（两处「管理已写入条目」共用）。
async function editSyncEntry(key: string, entryEl: HTMLElement): Promise<void> {
  const cur = await getSyncEntryContent(key);
  if (cur == null) { toast('error', '读取条目内容失败'); return; }
  const name = entryEl.querySelector('.th-wbsync-en-name')?.textContent || '条目';
  const txt = await thPrompt({ title: `编辑「${name}」`, message: '修改后保存会直接写回角色卡世界书该条目。', value: cur, multiline: true, rows: 14 });
  if (txt == null) return;
  const ok = await updateSyncEntryContent(key, String(txt));
  if (ok) {
    const meta = entryEl.querySelector('.th-wbsync-en-meta');
    if (meta) meta.textContent = (meta.textContent || '').replace(/·\s*\d+字/, `· ${String(txt).length}字`);
    toast('success', '已保存条目');
  } else toast('error', '保存失败');
}

// ==================== 设置子页「局部刷新」====================
// 各 app 切换设置左侧分类时，只替换右侧 detail 面板 innerHTML + 切换 nav 高亮，事件走根委托
// 不受影响；detail 内的命令式绑定（世界书复选器/分类绑定/提示词host）由 rebind 回调按需重跑。
export function patchSettingsDetail(opts: {
  root: HTMLElement | null;
  detailSel: string;    // 右侧详情容器选择器（其 innerHTML 被替换）
  navSel: string;       // 左侧分类按钮选择器
  navAttr: string;      // 分类按钮上存 cat id 的属性名，如 'data-wb-setcat'
  navOnClass: string;   // 分类按钮激活态类名，如 'thw-nav-on' / 'on'
  cat: string;          // 当前分类 id
  html: string;         // 新的详情 HTML
  rebind?: (detail: HTMLElement) => void;
}): boolean {
  const root = opts.root;
  if (!root) return false;
  const detail = root.querySelector(opts.detailSel) as HTMLElement | null;
  if (!detail) return false;
  detail.innerHTML = opts.html;
  root.querySelectorAll(opts.navSel).forEach(b => {
    b.classList.toggle(opts.navOnClass, b.getAttribute(opts.navAttr) === opts.cat);
  });
  try { opts.rebind?.(detail); } catch (e) { void e; }
  return true;
}

// ==================== 世界书注入设置面板 ====================
const MODE_OPTS: { v: WbInjectMode; label: string; hint: string }[] = [
  { v: 'worldbook', label: '写入世界书', hint: '记忆写进角色卡主世界书，正文也能读到（推荐）' },
  { v: 'inject', label: '注入正文楼层', hint: '仅本次生成临时注入，不落世界书' },
  { v: 'both', label: '两者都开', hint: '既写世界书又临时注入' },
  { v: 'off', label: '关闭', hint: '不向正文同步任何记忆' },
];
const POS_OPTS: { v: WbPositionType; label: string }[] = [
  { v: 'before_character_definition', label: '角色定义之前' },
  { v: 'after_character_definition', label: '角色定义之后' },
  { v: 'before_author_note', label: '作者注释之前' },
  { v: 'after_author_note', label: '作者注释之后' },
  { v: 'at_depth', label: '按深度插入' },
];
const STRAT_OPTS: { v: WbStrategyType; label: string }[] = [
  { v: 'constant', label: '蓝灯·常驻' },
  { v: 'selective', label: '绿灯·关键字' },
];

export function wbSyncPanelHtml(appId: string): string {
  const c = getAppWbConfig(appId);
  const sel = (opts: { v: string; label: string }[], cur: string, cls: string) =>
    `<select class="th-edit-select ${cls}" style="font-size:12px">` +
    opts.map(o => `<option value="${escAttr(o.v)}" ${o.v === cur ? 'selected' : ''}>${esc(o.label)}</option>`).join('') + '</select>';
  const atDepth = c.positionType === 'at_depth';
  return `<div class="th-wbsync" data-wbsync-app="${escAttr(appId)}">
    <div class="th-wbsync-row">
      <span class="th-wbsync-lab">同步方式</span>
      ${sel(MODE_OPTS as any, c.mode, 'th-wbsync-mode')}
    </div>
    <div class="th-wbsync-hint">${esc(MODE_OPTS.find(o => o.v === c.mode)?.hint || '')}</div>
    <div class="th-wbsync-grid" ${c.mode === 'inject' || c.mode === 'off' ? 'hidden' : ''}>
      <label><span>激活策略</span>${sel(STRAT_OPTS as any, c.strategy, 'th-wbsync-strat')}</label>
      <label><span>插入位置</span>${sel(POS_OPTS as any, c.positionType, 'th-wbsync-pos')}</label>
      <label ${atDepth ? '' : 'hidden'} class="th-wbsync-depthwrap"><span>深度</span>
        <input type="number" min="0" class="th-edit-input th-wbsync-depth" value="${esc(String(c.depth))}" style="width:70px"></label>
      <label><span>顺序</span><input type="number" class="th-edit-input th-wbsync-order" value="${esc(String(c.order))}" style="width:70px"></label>
      <label><span>绿灯扫描楼数</span><input type="number" min="0" class="th-edit-input th-wbsync-scan" value="${esc(String(c.scanDepth))}" style="width:70px"></label>
    </div>
    <div class="th-wbsync-note">${iconHtml('fa-shield-halved')} 同步条目已内置禁止递归。</div>
    <div class="th-wbsync-acts">
      <button class="th-btn th-btn-mini" data-wbsync-reset>${iconHtml('fa-rotate-left')} 恢复默认</button>
      <button class="th-btn th-btn-mini" data-wbsync-manage>${iconHtml('fa-list')} 管理已写入条目</button>
    </div>
    <div class="th-wbsync-entries" data-wbsync-entries hidden></div>
  </div>`;
}

// 返回 true 表示已处理该事件，调用方应停止后续派发。
export function bindWbSyncPanel(e: Event): boolean {
  const t = e.target as HTMLElement;
  const panel = t.closest('[data-wbsync-app]') as HTMLElement | null;
  if (!panel) return false;
  const appId = panel.getAttribute('data-wbsync-app') || '';

  if (t.closest('[data-wbsync-reset]')) {
    resetAppWbConfig(appId);
    panel.outerHTML = wbSyncPanelHtml(appId);
    toast('success', '已恢复默认世界书注入设置');
    return true;
  }
  if (t.closest('[data-wbsync-manage]')) {
    const box = panel.querySelector('[data-wbsync-entries]') as HTMLElement | null;
    if (box) {
      if (!box.hidden) { box.hidden = true; return true; }
      box.hidden = false; box.innerHTML = `<div class="th-wbsync-loading">${iconHtml('fa-spinner')} 读取中…</div>`;
      void listSyncEntries(appId).then(list => {
        if (!list.length) { box.innerHTML = '<div class="th-wbsync-empty">还没有写入任何世界书条目</div>'; return; }
        box.innerHTML = list.map(en => `
          <div class="th-wbsync-entry" data-wbsync-key="${escAttr(en.memKey)}">
            <label class="th-wbsync-en-toggle"><input type="checkbox" class="th-wbsync-en-cb" ${en.enabled ? 'checked' : ''}></label>
            <span class="th-wbsync-en-name" title="${escAttr(en.name)}">${esc(en.name)}</span>
            <span class="th-wbsync-en-meta">${esc(en.memType)} · ${en.chars}字</span>
            <button class="th-wbsync-en-edit" data-wbsync-edit title="编辑条目内容">${iconHtml('fa-pen')}</button>
            <button class="th-wbsync-en-del" data-wbsync-del title="删除条目">${iconHtml('fa-trash')}</button>
          </div>`).join('');
      });
    }
    return true;
  }
  // 条目级：删除 / 启停
  const entryEl = t.closest('[data-wbsync-key]') as HTMLElement | null;
  if (entryEl) {
    const key = entryEl.getAttribute('data-wbsync-key') || '';
    if (t.closest('[data-wbsync-edit]')) { void editSyncEntry(key, entryEl); return true; }
    if (t.closest('[data-wbsync-del]')) {
      void deleteSyncEntry(key).then(ok => { if (ok) { entryEl.remove(); toast('success', '已删除条目'); } else toast('error', '删除失败'); });
      return true;
    }
    if (t.closest('.th-wbsync-en-cb')) {
      const cb = t as HTMLInputElement;
      void setSyncEntryEnabled(key, cb.checked);
      return true;
    }
  }
  return false;
}

// change 事件（select/number 改值即存；位置切到 at_depth 时显示深度框）
export function bindWbSyncPanelChange(e: Event): boolean {
  const t = e.target as HTMLElement;
  const panel = t.closest('[data-wbsync-app]') as HTMLElement | null;
  if (!panel) return false;
  const appId = panel.getAttribute('data-wbsync-app') || '';
  const get = (cls: string) => (panel.querySelector('.' + cls) as HTMLInputElement | HTMLSelectElement | null)?.value;
  setAppWbConfig(appId, {
    mode: (get('th-wbsync-mode') as WbInjectMode) || 'worldbook',
    strategy: (get('th-wbsync-strat') as WbStrategyType) || 'constant',
    positionType: (get('th-wbsync-pos') as WbPositionType) || 'before_character_definition',
    depth: Math.max(0, Math.floor(Number(get('th-wbsync-depth')) || 4)),
    order: Math.floor(Number(get('th-wbsync-order')) || 100),
    scanDepth: Math.max(0, Math.floor(Number(get('th-wbsync-scan')) || 0)),
  });
  // 重渲染以反映 mode/position 联动的显隐
  if (t.closest('.th-wbsync-mode') || t.closest('.th-wbsync-pos')) {
    panel.outerHTML = wbSyncPanelHtml(appId);
  }
  return true;
}

// ==================== API 利用设置面板 ====================
// 每个按钮一张卡，卡内直接勾选/调数量：玩家看着「这个按钮」就能调「它这次产出什么、出几条」。
export function apiPlanPanelHtml(appId: string): string {
  const def = getApiPlanDef(appId);
  if (!def) return '<div class="th-apiplan-empty">该 APP 暂无可配置的 API 项</div>';

  const featCheckbox = (f: ApiFeature) => `
    <label class="th-apiplan-feat">
      <input type="checkbox" class="th-apiplan-cb" data-apiplan-feat="${escAttr(f.id)}" ${isFeatureOn(appId, f.id) ? 'checked' : ''}>
      <span class="th-apiplan-fname">${esc(f.name)}${f.standalone ? ` <em class="th-apiplan-solo">${iconHtml('fa-bolt')}可单独生成</em>` : ''}</span>
      <span class="th-apiplan-fdesc">${esc(f.desc)}</span>
    </label>`;
  // 上限放开——输入框 max 走全局硬顶（不再被各字段 max 卡死），c.max 降级为「建议值」提示。
  const countRow = (c: ApiCountField) => `
    <label class="th-apiplan-count">
      <span>${esc(c.name)}<em>${esc(c.desc)}（建议 ${c.min}~${c.max}）</em></span>
      <input type="number" min="${c.min}" max="${COUNT_HARD_CAP}" class="th-edit-input th-apiplan-num" data-apiplan-count="${escAttr(c.key)}" value="${esc(String(planCount(appId, c.key)))}" style="width:80px">
    </label>`;

  let body: string;
  if (def.triggers && def.triggers.length) {
    // 按钮分组卡片视图
    const fById = new Map(def.features.map(f => [f.id, f]));
    const cById = new Map(def.counts.map(c => [c.key, c]));
    body = `<div class="th-apiplan-trigs">` + def.triggers.map(tg => {
      const feats = (tg.feats || []).map(id => fById.get(id)).filter(Boolean) as ApiFeature[];
      const counts = (tg.counts || []).map(k => cById.get(k)).filter(Boolean) as ApiCountField[];
      const always = tg.always || [];
      const featHtml = feats.map(featCheckbox).join('');
      const countHtml = counts.map(countRow).join('');
      const alwaysHtml = always.length
        ? `<div class="th-apiplan-always">${always.map(a => `<span class="th-apiplan-alwtag">${iconHtml('fa-circle-check')} ${esc(a)}</span>`).join('')}</div>` : '';
      // 额度可视化：这一按钮点一次 = 1 次 API 调用，约产出「其名下各数量项之和」条内容。
      const onFeats = feats.filter(f => isFeatureOn(appId, f.id)).length;
      const items = counts.reduce((sum, c) => sum + Math.max(0, planCount(appId, c.key) || 0), 0);
      const estParts: string[] = [];
      if (items > 0) estParts.push(`约 ${items} 条`);
      if (onFeats > 0 || items > 0) estParts.push(`${onFeats > 0 ? onFeats + ' 项一并 · ' : ''}1 次调用`);
      const estHtml = estParts.length ? `<span class="th-apiplan-trig-est" title="点这个按钮一次的大致开销">${iconHtml('fa-gauge-high')} ${estParts.join(' · ')}</span>` : '';
      return `<div class="th-apiplan-trig">
        <div class="th-apiplan-trig-head"><span class="th-apiplan-trig-btn">${iconHtml(tg.icon)} ${esc(tg.btn)}</span>${estHtml}</div>
        ${alwaysHtml}
        ${featHtml ? `<div class="th-apiplan-trig-feats">${featHtml}</div>` : ''}
        ${countHtml ? `<div class="th-apiplan-trig-counts">${countHtml}</div>` : ''}
      </div>`;
    }).join('') + `</div>`;
  } else {
    // 兜底：平铺（无 triggers 的 APP）
    body = `<div class="th-apiplan-feats">${def.features.map(featCheckbox).join('')}</div>`
      + (def.counts.length ? `<div class="th-apiplan-counts">${def.counts.map(countRow).join('')}</div>` : '');
  }
  return `<div class="th-apiplan" data-apiplan-app="${escAttr(appId)}">
    <div class="th-apiplan-intro">${iconHtml('fa-gauge-high')} 每个按钮一张卡：勾上的会在点这个按钮时一次 API 一起产出（更省调用）；带${iconHtml('fa-bolt')}的也可在界面里单独生成；数字＝该按钮一次出几条。</div>
    ${body}
    <div class="th-apiplan-acts">
      <button class="th-btn th-btn-mini" data-apiplan-reset>${iconHtml('fa-rotate-left')} 恢复默认</button>
      ${isFeatureOverridden(appId) ? `<span class="th-apiplan-ov">${iconHtml('fa-pen')} 已自定义</span>` : ''}
    </div>
  </div>`;
}

export function bindApiPlanPanel(e: Event): boolean {
  const t = e.target as HTMLElement;
  const panel = t.closest('[data-apiplan-app]') as HTMLElement | null;
  if (!panel) return false;
  const appId = panel.getAttribute('data-apiplan-app') || '';
  if (t.closest('[data-apiplan-reset]')) {
    resetApiPlan(appId);
    panel.outerHTML = apiPlanPanelHtml(appId);
    toast('success', '已恢复默认 API 设置');
    return true;
  }
  const cb = t.closest('[data-apiplan-feat]') as HTMLInputElement | null;
  if (cb) { setFeatureOn(appId, cb.getAttribute('data-apiplan-feat') || '', cb.checked); return true; }
  return false;
}

export function bindApiPlanPanelChange(e: Event): boolean {
  const t = e.target as HTMLElement;
  const panel = t.closest('[data-apiplan-app]') as HTMLElement | null;
  if (!panel) return false;
  const appId = panel.getAttribute('data-apiplan-app') || '';
  // feature 复选框也会触发 change（内联面板只挂 change 时靠这里落库）
  const cb = t.closest('[data-apiplan-feat]') as HTMLInputElement | null;
  if (cb) { setFeatureOn(appId, cb.getAttribute('data-apiplan-feat') || '', cb.checked); panel.outerHTML = apiPlanPanelHtml(appId); return true; }   // 重渲染刷新额度估算
  const num = t.closest('[data-apiplan-count]') as HTMLInputElement | null;
  if (num) { setPlanCount(appId, num.getAttribute('data-apiplan-count') || '', Number(num.value)); panel.outerHTML = apiPlanPanelHtml(appId); return true; }   // 重渲染刷新额度估算
  return false;
}

// ==================== 共享「功能提示词」面板（列表 + 编辑 + 恢复，含破限）====================
// 任意 APP 在自己的设置 sheet 调用 promptListPanelHtml(appId) 取列表 HTML，点某条调 promptEditPanelHtml(appId,id) 切到编辑。
// 状态由调用方在自己的 _sheet 里维护（如 {kind:'prompts'} / {kind:'prompt', id}）。bindPromptPanelClick 处理保存/恢复。
export function promptListPanelHtml(appId: string): string {
  const tpls = listPromptTemplates(appId);
  if (!tpls.length) return '<div class="th-apiplan-empty">该 APP 暂无可编辑提示词</div>';
  const rows = tpls.map(t => `<button class="th-wapp-pl-row" data-wapp-pl-edit="${escAttr(t.id)}" type="button">
    <span class="th-wapp-pl-mid">
      <span class="th-wapp-pl-ttl">${esc(t.name)}${t.id.endsWith('.jailbreak') ? ` <em class="th-wapp-pl-jb">${iconHtml('fa-unlock-keyhole')}破限</em>` : ''}${promptHasWb(t.id) ? ` <em class="th-wapp-pl-wb">${iconHtml('fa-link')}绑书</em>` : ''}${isPromptOverridden(t.id) ? ` <em class="th-wapp-pl-ov">已改</em>` : ''}</span>
      <span class="th-wapp-pl-desc">${esc(t.desc || '')}</span>
    </span>
    <span class="th-wapp-pl-arrow">${iconHtml('fa-chevron-right')}</span>
  </button>`).join('');
  return `<div class="th-wapp-pl" data-wapp-pl-app="${escAttr(appId)}">
    <div class="th-wapp-pl-intro">${iconHtml('fa-feather')} 本 APP 全部 AI 行为的提示词都可在此查看/改写/恢复。带${iconHtml('fa-unlock-keyhole')}的是破限（系统预设），是该 APP 一切生成的最前置越狱词。</div>
    <div class="th-wapp-pl-list">${rows}</div>
  </div>`;
}

export function promptEditPanelHtml(appId: string, id: string): string {
  const tpl = listPromptTemplates(appId).find(t => t.id === id);
  if (!tpl) return '<div class="th-apiplan-empty">提示词不存在</div>';
  const varsHtml = (tpl.vars || []).map(v => `<code>{{${esc(v.key)}}}</code> ${esc(v.desc)}`).join('　');
  // 写作质感是全局纯文风约束，不绑世界书；其余 app 提示词保留绑书。
  const wbHtml = appId === QUALITY_APP_ID ? '' : promptWbBindHtml(id);
  return `<div class="th-wapp-pe" data-wapp-pe-app="${escAttr(appId)}" data-wapp-pe-id="${escAttr(id)}">
    <button class="th-wapp-pe-back" data-wapp-pe-back type="button">${iconHtml('fa-arrow-left')} 返回提示词列表</button>
    <div class="th-wapp-pe-name">${esc(tpl.name)}</div>
    <div class="th-wapp-pe-hint">${esc(tpl.desc || '')}</div>
    ${varsHtml ? `<div class="th-wapp-pe-vars">可用占位符：${varsHtml}</div>` : ''}
    <textarea class="th-wapp-pe-text" rows="12">${esc(getPromptText(id))}</textarea>
    ${wbHtml}
    ${aiPromptEditorHtml(id)}
    <div class="th-wapp-pe-acts">
      <button class="th-btn th-btn-mini" data-wapp-pe-reset type="button">${iconHtml('fa-rotate-left')} 恢复默认</button>
      <button class="th-btn th-btn-mini th-btn-primary" data-wapp-pe-save type="button">${iconHtml('fa-check')} 保存</button>
    </div>
  </div>`;
}

// 点击处理。返回 'list'|'edit:<id>'|'saved'|'reset'|null —— 调用方据此切 sheet/重渲染。
export function bindPromptPanelClick(e: Event): { action: 'edit'; id: string } | { action: 'back' } | { action: 'saved' } | { action: 'reset'; id: string } | null {
  const t = e.target as HTMLElement;
  const editBtn = t.closest('[data-wapp-pl-edit]') as HTMLElement | null;
  if (editBtn) return { action: 'edit', id: editBtn.getAttribute('data-wapp-pl-edit') || '' };
  if (t.closest('[data-wapp-pe-back]')) return { action: 'back' };
  const pe = t.closest('[data-wapp-pe-app]') as HTMLElement | null;
  if (pe) {
    const id = pe.getAttribute('data-wapp-pe-id') || '';
    // AI 重写提示词（填回本面板的 textarea）
    const ta0 = pe.querySelector('.th-wapp-pe-text') as HTMLTextAreaElement | null;
    if (ta0 && bindAiPromptEditor(e, () => ta0.value, (text) => { ta0.value = text; })) return null;
    if (t.closest('[data-wapp-pe-save]')) {
      const ta = pe.querySelector('.th-wapp-pe-text') as HTMLTextAreaElement | null;
      if (ta) { setPromptOverride(id, ta.value); toast('success', '已保存提示词'); }
      return { action: 'saved' };
    }
    if (t.closest('[data-wapp-pe-reset]')) {
      resetPrompt(id); toast('success', '已恢复默认'); return { action: 'reset', id };
    }
  }
  return null;
}

// ==================== 写作质感块「全局共享块」面板（设置 App 内）====================
// 5 块写作质感块（活人感/去 AI 腔/…）是可编辑·可启停的共享片段，改一处 → 所有挂载的剧情类 app 一起生效。
// 面板结构：列表（每块带 作用域标签 + 启用开关 + 已改标记）→ 点某块进 promptEditPanelHtml 编辑（复用现成编辑器）。
// 供设置 App 的「写作质感块」分类调用；状态由调用方维护（列表 / 编辑某块）。
// 单块行（已登记的核心/选用块）：极简开关 + 点标题进编辑。
function qualityRow(id: string, name: string, desc: string): string {
  const on = isPromptBlockEnabled(id);
  const scope = QUALITY_SCOPE_HINT[id] || '剧情类 app';
  return `<div class="th-wapp-ql-row${on ? ' on' : ''}">
    <button class="th-wapp-ql-main" data-wapp-pl-edit="${escAttr(id)}" type="button">
      <span class="th-wapp-ql-ttl">${esc(name)}${isPromptOverridden(id) ? ` <em class="th-wapp-pl-ov">已改</em>` : ''}</span>
      <span class="th-wapp-ql-sub">${esc(desc || '')}</span>
      <span class="th-wapp-ql-scope">${esc(scope)}</span>
    </button>
    <button class="th-wapp-ql-sw${on ? ' on' : ''}" role="switch" aria-checked="${on}" data-wapp-ql-toggle="${escAttr(id)}" type="button" title="${on ? '点击关停' : '点击启用'}"><i></i></button>
  </div>`;
}
// 自定义块行：极简开关 + 编辑 + 删除。
function qualityCustomRow(c: { id: string; name: string; text: string; on: boolean }): string {
  return `<div class="th-wapp-ql-row${c.on ? ' on' : ''}">
    <button class="th-wapp-ql-main" data-wapp-qc-edit="${escAttr(c.id)}" type="button">
      <span class="th-wapp-ql-ttl">${esc(c.name)} <em class="th-wapp-pl-wb">自建</em></span>
      <span class="th-wapp-ql-sub">${esc((c.text || '').slice(0, 42) || '（空块，点开编辑）')}</span>
      <span class="th-wapp-ql-scope">开启后 → 全部剧情类 app</span>
    </button>
    <button class="th-wapp-ql-del" data-wapp-qc-del="${escAttr(c.id)}" type="button" title="删除">${iconHtml('fa-trash-can')}</button>
    <button class="th-wapp-ql-sw${c.on ? ' on' : ''}" role="switch" aria-checked="${c.on}" data-wapp-qc-toggle="${escAttr(c.id)}" type="button" title="${c.on ? '点击关停' : '点击启用'}"><i></i></button>
  </div>`;
}
export function qualityHubListHtml(): string {
  const core = QUALITY_BLOCK_DEFS.map(b => qualityRow(b.id, b.name, b.desc)).join('');
  const extra = QUALITY_EXTRA_DEFS.map(b => qualityRow(b.id, b.name, b.desc)).join('');
  const customs = getCustomQualityBlocks();
  const customRows = customs.length ? customs.map(qualityCustomRow).join('') : '<div class="th-wapp-ql-empty">还没有自定义块。点上方「新建」加一条你自己的写作约束。</div>';
  return `<div class="th-wapp-pl" data-wapp-pl-app="${escAttr(QUALITY_APP_ID)}">
    <div class="th-wapp-pl-intro">${iconHtml('fa-feather')} <b>全局共享</b>的写作质感约束，改一处 → 所有剧情类 app（对话/散文/演化）<b>一起生效</b>；社区/结构类 app 不挂。点标题可改写/恢复默认，右侧开关控制是否附加。</div>
    <div class="th-wapp-ql-sec"><span class="th-wapp-ql-sectitle">核心块 · 默认开</span><span class="th-wapp-ql-sechint">去 AI 腔的地基，按 app 类型自动挂</span></div>
    <div class="th-wapp-ql-list">${core}</div>
    <div class="th-wapp-ql-sec"><span class="th-wapp-ql-sectitle">选用块 · 默认关</span><span class="th-wapp-ql-sechint">迁移自成熟预设，按需开；开一个 → 全剧情类生效</span></div>
    <div class="th-wapp-ql-list">${extra}</div>
    <div class="th-wapp-ql-sec"><span class="th-wapp-ql-sectitle">我的自定义块</span><button class="thw-btn thw-btn-mini" data-wapp-qc-new type="button">${iconHtml('fa-plus')} 新建</button></div>
    <div class="th-wapp-ql-list">${customRows}</div>
  </div>`;
}
// 处理质感块列表里的「启用开关」等点击。返回 true=已消费（需要重渲染列表）。
export function bindQualityHubToggle(e: Event): boolean {
  const t = e.target as HTMLElement;
  // 已登记块：开关
  const sw = t.closest('[data-wapp-ql-toggle]') as HTMLElement | null;
  if (sw) {
    const id = sw.getAttribute('data-wapp-ql-toggle') || '';
    const next = !isPromptBlockEnabled(id);
    setPromptBlockEnabled(id, next);
    toast('success', next ? '已启用' : '已关停');
    return true;
  }
  // 自定义块：开关
  const csw = t.closest('[data-wapp-qc-toggle]') as HTMLElement | null;
  if (csw) {
    const id = csw.getAttribute('data-wapp-qc-toggle') || '';
    const cur = getCustomQualityBlocks().find(x => x.id === id);
    const next = !(cur?.on);
    updateCustomQualityBlock(id, { on: next });
    toast('success', next ? '已启用' : '已关停');
    return true;
  }
  return false;
}

// ==================== 分类提示词绑定世界书条目（可复用）====================
// 任意 app 的「提示词编辑」界面里放 promptWbBindHtml(id) 取 HTML，渲染后调 bindPromptWbHost(host) 绑交互。
// 走通用 wbPicker（与 app 级一致），勾选即时落库到 promptWb（setPromptWbKeys）。
export function promptWbBindHtml(id: string): string {
  if (!isWorldbookAvailable()) return '';
  const keys = getPromptWbKeys(id);
  return `<details class="th-wapp-pe-wb" data-pwb-id="${escAttr(id)}" ${keys.length ? 'open' : ''}>
    <summary>${iconHtml('fa-link')} 绑定世界书条目 <em>${keys.length ? `已绑 ${keys.length}` : '可选'}</em></summary>
    <div class="th-wapp-pe-wb-hint">${iconHtml('fa-circle-info')} 走这条提示词生成时，把勾选的条目内容作为上下文一并带上（可跨多本书混选）。</div>
    <div class="th-wapp-pe-wb-host" data-pwb-host>${wbPickerHtml(keys)}</div>
  </details>`;
}
export function bindPromptWbHost(scope: HTMLElement): void {
  const det = scope.querySelector('[data-pwb-id]') as HTMLElement | null;
  if (!det) return;
  const id = det.getAttribute('data-pwb-id') || '';
  const host = det.querySelector('[data-pwb-host]') as HTMLElement | null;
  if (host && id) bindWbPicker(host, () => getPromptWbKeys(id), (keys) => setPromptWbKeys(id, keys));
}

// ==================== AI 提示词编辑器（可复用，任意 app 提示词编辑界面内嵌）====================
// 在提示词编辑界面里放 aiPromptEditorHtml(id) 取 HTML（一个可折叠的「让 AI 帮我改这条提示词」块），
// 渲染后在 click 委托里调 bindAiPromptEditor(e, getCurrentText, applyText)：
//   - getCurrentText(): 取编辑器里当前 textarea 的文本（让 AI 在玩家可能已改过的基础上再生成）
//   - applyText(text): 把 AI 产出的新提示词写回 textarea（不直接落库，玩家可再改再保存）
// AI 会被严格要求：保留全部 {{占位符}}、只输出提示词正文、保持「导演笔记式高信息密度」的写法。
export function aiPromptEditorHtml(id: string): string {
  const tpl = getPromptTemplate(id);
  const varList = (tpl?.vars || []).map(v => `{{${v.key}}}`).join(' ');
  return aiPromptEditorBlock(id, varList, '');
}
// 无 registry id 的通用变体——给「分类提示词」等自由文本提示词用。
// 元信息（名称/用途/必须保留的占位符）随 DOM 属性带上，bindAiPromptEditor 优先读 registry，缺失则回退这些属性。
export function aiPromptEditorHtmlEx(key: string, meta: { name: string; desc?: string; vars?: string[] }): string {
  const varList = (meta.vars || []).join(' ');
  const attrs = ` data-aipe-name="${escAttr(meta.name)}" data-aipe-desc="${escAttr(meta.desc || '')}" data-aipe-vars="${escAttr((meta.vars || []).join(','))}"`;
  return aiPromptEditorBlock(key, varList, attrs);
}
function aiPromptEditorBlock(id: string, varList: string, extraAttrs: string): string {
  return `<details class="th-wapp-pe-ai" data-aipe-id="${escAttr(id)}"${extraAttrs}>
    <summary>${iconHtml('fa-wand-magic-sparkles')} 用 AI 重写这条提示词 <em>说需求，自动生成</em></summary>
    <div class="th-wapp-pe-ai-hint">${iconHtml('fa-circle-info')} 描述你想要的效果（如「更露骨大胆」「更口语化」「侧重战斗描写」「加入对节日促销的考虑」），AI 会在当前提示词基础上重写一版，自动保留占位符${varList ? `（${esc(varList)}）` : ''}。生成后填入上方文本框，你可再改再保存。</div>
    <textarea class="th-wapp-pe-ai-req" rows="2" placeholder="想让这条提示词变成什么样？例：更高信息密度、补充对买家秀的细节要求、语气更俏皮…"></textarea>
    <div class="th-wapp-pe-ai-acts">
      <button class="th-btn th-btn-mini th-btn-primary" data-aipe-gen type="button">${iconHtml('fa-wand-magic-sparkles')} 生成新版</button>
      <span class="th-wapp-pe-ai-status" data-aipe-status></span>
    </div>
  </details>`;
}
// 返回 true=已消费该 click。getCurrentText/applyText 由调用方提供（与各 app 自己的 textarea 对接）。
export function bindAiPromptEditor(e: Event, getCurrentText: () => string, applyText: (text: string) => void): boolean {
  const t = e.target as HTMLElement;
  const box = t.closest('[data-aipe-id]') as HTMLElement | null;
  if (!box || !t.closest('[data-aipe-gen]')) return false;
  const id = box.getAttribute('data-aipe-id') || '';
  const tpl = getPromptTemplate(id);
  // registry 缺失（如分类提示词）时回退读 DOM 属性带来的元信息
  const metaName = tpl?.name || box.getAttribute('data-aipe-name') || id;
  const metaDesc = tpl?.desc || box.getAttribute('data-aipe-desc') || '';
  const attrVars = (box.getAttribute('data-aipe-vars') || '').split(',').map(s => s.trim()).filter(Boolean);
  const reqEl = box.querySelector('.th-wapp-pe-ai-req') as HTMLTextAreaElement | null;
  const statusEl = box.querySelector('[data-aipe-status]') as HTMLElement | null;
  const genBtn = box.querySelector('[data-aipe-gen]') as HTMLButtonElement | null;
  const req = (reqEl?.value || '').trim();
  if (!req) { toast('info', '先写一句你想要的效果'); return true; }
  const cur = getCurrentText() || '';
  const varNames = (tpl?.vars || []).map(v => `{{${v.key}}}`).concat(attrVars);
  const sys = '你是一名提示词工程师，专为「角色扮演世界套件」里的各个 app 编写 AI 行为提示词。\n'
    + '这些提示词是「导演笔记式」的生成指引：信息密度高、覆盖面全、考虑各种细节与边界情况，但本身是给 AI 的指令而非要写进正文的内容。\n'
    + '现在请根据玩家的修改要求，在「现有提示词」的基础上重写出一版新的提示词。\n'
    + '硬性要求：\n'
    + '① 必须原样保留所有占位符（形如 {{xxx}}），一个都不能删、不能改名、不能新增没有的占位符。\n'
    + '② 只输出重写后的提示词正文本身，不要任何解释、标题、引号、代码围栏。\n'
    + '③ 保持高信息密度的导演笔记风格：具体、可执行、考虑周全，而不是泛泛而谈或精简成几句口号。\n'
    + '④ 紧扣这条提示词原本的用途，不要跑题成别的功能。';
  const user = `【这条提示词的用途】${metaName}：${metaDesc}\n`
    + (varNames.length ? `【必须保留的占位符】${varNames.join(' ')}\n` : '')
    + `【现有提示词】\n${cur}\n\n【玩家的修改要求】\n${req}\n\n请据此重写，直接输出新的提示词正文：`;
  if (statusEl) statusEl.textContent = '生成中…';
  if (genBtn) genBtn.disabled = true;
  void chatGenerate({ system: sys, user })
    .then(out => {
      const text = (out || '').trim();
      if (!text) { if (statusEl) statusEl.textContent = '生成失败，请重试'; return; }
      // 占位符完整性校验：缺失则提示但仍填入（玩家可补）
      const missing = varNames.filter(v => !text.includes(v));
      applyText(text);
      if (statusEl) statusEl.textContent = missing.length ? `已生成（注意：缺少占位符 ${missing.join(' ')}，请检查）` : '已生成并填入上方文本框';
      toast('success', '已生成新版提示词，请检查后保存');
    })
    .catch(err => { if (statusEl) statusEl.textContent = '生成失败：' + (err?.message || '未知错误'); })
    .finally(() => { if (genBtn) genBtn.disabled = false; });
  return true;
}

// ==================== 分区内「分类」绑定世界书条目（可复用）====================
// 任意 app 的分类编辑/详情界面里放 catWbBindHtml(appId, catName) 取 HTML，渲染后调 bindCatWbHost(scope) 绑交互。
// 典型：淘宝服装分类绑定 40+ 服装风格指南条目；糖心/小红书 R18 分类绑定特化设定条目。
export function catWbBindHtml(appId: string, catName: string): string {
  if (!isWorldbookAvailable()) return '';
  const keys = getCatWbKeys(appId, catName);
  return `<details class="th-wapp-pe-wb th-wapp-cat-wb" data-cwb-app="${escAttr(appId)}" data-cwb-cat="${escAttr(catName)}" ${keys.length ? 'open' : ''}>
    <summary>${iconHtml('fa-link')} 绑定世界书条目 <em>${keys.length ? `已绑 ${keys.length}` : '可选'}</em></summary>
    <div class="th-wapp-pe-wb-hint">${iconHtml('fa-circle-info')} 生成「${esc(catName)}」分类内容时，把勾选的条目（如服装风格指南）作为设定来源一并带上（可跨多本书混选）。</div>
    <div class="th-wapp-pe-wb-host" data-cwb-host>${wbPickerHtml(keys)}</div>
  </details>`;
}
export function bindCatWbHost(scope: HTMLElement): void {
  scope.querySelectorAll('[data-cwb-app]').forEach(detEl => {
    const det = detEl as HTMLElement;
    const appId = det.getAttribute('data-cwb-app') || '';
    const catName = det.getAttribute('data-cwb-cat') || '';
    const host = det.querySelector('[data-cwb-host]') as HTMLElement | null;
    if (host && appId && catName) bindWbPicker(host, () => getCatWbKeys(appId, catName), (keys) => setCatWbKeys(appId, catName, keys));
  });
}
export { catHasWb };

// ==================== 各 app 设置内的「记忆」分区 ====================
// 记忆设置全部收口到「记忆」app。各 app 设置里只留一句跳转提示 + 一个「本 app 沉淀节奏」
//   的折叠微调（各 app 按文本量定制，仍可就地覆盖）。
// 三层阈值：小结触发字数 charThreshold（主尺）+ 条数保底 shortThreshold + 归纳 midThreshold + 主线 farThreshold。
const MEM_FIELDS: { k: 'charThreshold' | 'shortThreshold' | 'midThreshold' | 'farThreshold' | 'recentRawCount'; label: string; hint: string; min: number }[] = [
  { k: 'charThreshold', label: '小结触发·字数', hint: '攒够多少字（主尺）自动压一条近期记忆（长文本 app 可调大）', min: 200 },
  { k: 'shortThreshold', label: '小结触发·条数保底', hint: '攒够 N 条也触发（与字数先到为准）', min: 1 },
  { k: 'midThreshold', label: '归纳阈值', hint: '每 N 条近期归纳为一条中期', min: 1 },
  { k: 'farThreshold', label: '主线阈值', hint: '每 N 条中期并入远期主线', min: 1 },
  { k: 'recentRawCount', label: '注入原始条数', hint: '每次注入带几条最近原始记录（token 大的 app 调小）', min: 0 },
];
export function appMemPanelHtml(appId: string): string {
  const def = effectiveAppMemDefaults(appId);
  const ov = getAppMemOverride(appId);
  const rows = MEM_FIELDS.map(f => {
    const cur = (ov as any)[f.k];
    return `<label class="th-amem-row">
      <span class="th-amem-lab">${esc(f.label)}<small>${esc(f.hint)}</small></span>
      <input type="number" min="${f.min}" class="th-amem-in" data-amem-k="${f.k}" value="${cur != null ? esc(String(cur)) : ''}" placeholder="${esc(String((def as any)[f.k]))}">
    </label>`;
  }).join('');
  // 手动总结：统计当前有多少角色池「近期」有待归纳内容（>0 才值得点）。
  const pending = (() => { try { return listPools().reduce((n, pe) => n + ((pe.counts?.short || 0) > 0 ? 1 : 0), 0); } catch (e) { void e; return 0; } })();
  return `<div class="th-amem" data-amem-app="${escAttr(appId)}">
    <div class="th-wbsync-note">${iconHtml('fa-brain')} 记忆采用<b>固定三层</b>（近期→中期→远期）自动沉淀，与角色的对话会汇入其「角色记忆池」，跨全部 app 共享。<b>阈值/字数上限/总结提示词/静音等全部设置，统一在「记忆」app 管理。</b>
      <div class="th-amem-note-acts" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="th-btn th-btn-mini th-btn-primary" data-amem-open type="button">${iconHtml('fa-brain')} 打开「记忆」App</button>
        <button class="th-btn th-btn-mini" data-amem-sumall type="button" title="不等阈值，立刻把所有角色记忆池的『近期』各归纳成一条中期">${iconHtml('fa-bolt')} 立即总结全部角色记忆${pending ? `（${pending}）` : ''}</button>
      </div></div>
    <div class="th-amem-adv th-amem-adv-open">
      <div class="th-amem-adv-head">${iconHtml('fa-sliders')} 仅调「本 app 沉淀节奏」<small>可选，留空＝跟随${hasAppMemProfile(appId) ? '本 app 内置画像' : '全局默认'}</small></div>
      <div class="th-amem-rows">${rows}</div>
      <div class="th-amem-acts">
        <button class="th-btn th-btn-mini th-btn-primary" data-amem-save type="button">${iconHtml('fa-check')} 应用到本 app</button>
        <button class="th-btn th-btn-mini" data-amem-reset type="button">${iconHtml('fa-rotate-left')} 恢复默认</button>
      </div>
    </div>
  </div>`;
}
// 返回 true=已消费（click 或 change 都走它）
export function bindAppMemPanel(e: Event): boolean {
  const t = e.target as HTMLElement;
  const panel = t.closest('[data-amem-app]') as HTMLElement | null;
  if (!panel) return false;
  const appId = panel.getAttribute('data-amem-app') || '';
  // 跳转到「记忆」app（用 window 全局避免与 memory-center 循环 import）
  if (t.closest('[data-amem-open]')) {
    try { (window as any).__th_world_memory_center__?.openMemoryCenter?.(); } catch (err) { void err; }
    return true;
  }
  // 立即总结全部角色记忆池：逐池 cascadePoolCompress（近期→中期，够则中期→远期）。
  if (t.closest('[data-amem-sumall]')) {
    const btn = t.closest('[data-amem-sumall]') as HTMLButtonElement | null;
    void (async () => {
      if (btn) { btn.disabled = true; btn.innerHTML = `${iconHtml('fa-spinner')} 正在总结…`; }
      let done = 0;
      try {
        const summarize = makeSummarizer();
        const pools = listPools();
        for (const pe of pools) {
          if (!(pe.counts?.short > 0)) continue;
          try { await cascadePoolCompress(pe.contactId, summarize); done++; } catch (e) { void e; }
        }
        toast(done ? 'success' : 'info', done ? `已总结 ${done} 个角色的记忆` : '没有需要总结的角色记忆');
      } catch (e) { void e; toast('error', '总结失败'); }
      // 重渲染刷新「待总结」计数
      try { const pn = panel.closest('[data-amem-app]') as HTMLElement | null; if (pn) pn.outerHTML = appMemPanelHtml(appId); } catch (e) { void e; }
    })();
    return true;
  }
  if (t.closest('[data-amem-save]')) {
    const patch: any = {};
    panel.querySelectorAll('[data-amem-k]').forEach(elx => {
      const el = elx as HTMLInputElement; const k = el.getAttribute('data-amem-k') || '';
      const raw = el.value.trim();
      if (raw === '') { patch[k] = undefined; return; }
      const n = Math.floor(Number(raw)); if (Number.isFinite(n) && n >= 0) patch[k] = n;
    });
    // undefined 字段要从覆盖里抹掉：先清后写非空
    clearAppMemOverride(appId);
    const nonEmpty: any = {}; Object.keys(patch).forEach(k => { if (patch[k] != null) nonEmpty[k] = patch[k]; });
    if (Object.keys(nonEmpty).length) setAppMemOverride(appId, nonEmpty);
    toast('success', '已应用本 app 记忆设置');
    return true;
  }
  if (t.closest('[data-amem-reset]')) {
    clearAppMemOverride(appId);
    panel.querySelectorAll('[data-amem-k]').forEach(elx => { (elx as HTMLInputElement).value = ''; });
    toast('success', '已恢复本 app 记忆默认');
    return true;
  }
  return false;
}


// 封套模板编辑复用本文件的 promptListPanelHtml/promptEditPanelHtml（封套也是 prompt-registry 模板）。
const KIND_BADGE: Record<string, string> = { fact: '事实', state: '现状', direction: '导演' };
// 单个片段（内置/暂存夹/自定义）渲染。segId 是合成片段时右上角给「删除」（仅自定义）。
function injectSegHtml(appId: string, seg: { id: string; name: string; desc: string; kind: string }): string {
  const sel = getSegSel(appId, seg.id);
  const synthetic = isSyntheticSegId(seg.id);
  const isCustom = seg.id.startsWith('__custom__:');
  // 有 scope 的片段，开启后展示「注入范围」子项勾选
  const scopeItems = sel.on ? getSegScopeItems(appId, seg.id) : null;
  let scopeHtml = '';
  if (scopeItems) {
    const curSel = getSegScopeSel(appId, seg.id);   // undefined=全部
    const label = getSegScopeLabel(appId, seg.id);
    if (!scopeItems.length) {
      scopeHtml = `<div class="th-inj-scope" data-inj-scope="${escAttr(seg.id)}"><div class="th-inj-scope-empty">${iconHtml('fa-circle-info')} ${esc(label)}：当前没有可选项（暂无内容）。</div></div>`;
    } else {
      const allOn = curSel == null;
      const rows = scopeItems.map(it => {
        const checked = allOn || (curSel as string[]).includes(it.id);
        return `<label class="th-inj-scope-item"><input type="checkbox" class="th-inj-scope-cb" data-inj-scope-id="${escAttr(it.id)}" ${checked ? 'checked' : ''}>
          <span class="th-inj-scope-name">${esc(it.label)}${it.hint ? ` <em>${esc(it.hint)}</em>` : ''}</span></label>`;
      }).join('');
      scopeHtml = `<div class="th-inj-scope" data-inj-scope="${escAttr(seg.id)}">
        <div class="th-inj-scope-head"><span>${iconHtml('fa-filter')} ${esc(label)}</span>
          <label class="th-inj-scope-all"><input type="checkbox" class="th-inj-scope-allcb" ${allOn ? 'checked' : ''}> 全部</label></div>
        <div class="th-inj-scope-list">${rows}</div>
      </div>`;
    }
  }
  const delBtn = isCustom ? `<button class="th-inj-seg-del" data-inj-custom-del="${escAttr(seg.id)}" type="button" title="删除这条自定义片段">${iconHtml('fa-trash')}</button>` : '';
  const synTag = synthetic ? ` <em class="th-inj-syn">${seg.id === '__stash__' ? '暂存夹' : '自定义'}</em>` : '';
  // 自定义片段可就地改内容
  const customBody = getCustomSegs(appId).find(c => '__custom__:' + c.id === seg.id);
  const customEditor = isCustom && customBody ? `<details class="th-inj-cedit" data-inj-cedit="${escAttr(seg.id)}">
    <summary>${iconHtml('fa-pen')} 编辑这条内容</summary>
    <textarea class="th-inj-cedit-t" rows="4">${esc(customBody.body)}</textarea>
    <button class="th-btn th-btn-mini th-btn-primary" data-inj-cedit-save type="button">${iconHtml('fa-check')} 保存内容</button>
  </details>` : '';
  return `<div class="th-inj-seg${synthetic ? ' th-inj-seg-syn' : ''}" data-inj-seg="${escAttr(seg.id)}">
    <label class="th-inj-seg-head">
      <input type="checkbox" class="th-inj-on" data-inj-on="${escAttr(seg.id)}" ${sel.on ? 'checked' : ''}>
      <span class="th-inj-seg-name">${esc(seg.name)} <em class="th-inj-kind th-inj-kind-${esc(seg.kind)}">${esc(KIND_BADGE[seg.kind] || '')}</em>${synTag}</span>
      ${delBtn}
    </label>
    <div class="th-inj-seg-desc">${esc(seg.desc)}</div>
    <div class="th-inj-seg-ctl" ${sel.on ? '' : 'hidden'}>
      <select class="th-edit-select th-inj-mode" data-inj-mode="${escAttr(seg.id)}" style="font-size:12px">
        <option value="floor" ${sel.mode === 'floor' ? 'selected' : ''}>写入输入框（追加到输入框尾，随下一楼一起发）</option>
        <option value="worldbook" ${sel.mode === 'worldbook' ? 'selected' : ''}>写入角色卡世界书（持久，正文也读得到）</option>
      </select>
    </div>
    ${customEditor}
    ${scopeHtml}
    ${sel.on ? envEditorHtml(appId, seg.id, seg.name) : ''}
  </div>`;
}
export function injectPlanPanelHtml(appId: string): string {
  const plan = getInjectPlan(appId);
  const segs = effectiveSegments(appId);
  if (!plan && !segs.length) return '<div class="th-apiplan-empty">该 APP 暂无可注入片段</div>';
  const builtin = plan ? plan.segments : [];
  const customs = getCustomSegs(appId);
  const stashOn = segs.some(s => s.id === '__stash__');
  const builtinHtml = builtin.map(seg => injectSegHtml(appId, seg)).join('');
  const stashSeg = segs.find(s => s.id === '__stash__');
  const stashHtml = stashSeg ? injectSegHtml(appId, stashSeg) : '';
  const customHtml = segs.filter(s => s.id.startsWith('__custom__:')).map(seg => injectSegHtml(appId, seg)).join('');
  return `<div class="th-inj" data-inj-app="${escAttr(appId)}">
    <div class="th-wbsync-note">${iconHtml('fa-syringe')} 把这个 app 的内容注入酒馆正文，实现联动。勾选片段后选去向：<b>写入输入框</b>（随下一楼发出）或<b>写入角色卡世界书</b>（持久）。勾选只表态，点下方按钮才真正写入。</div>
    <div class="th-inj-sech">${iconHtml('fa-boxes-stacked')} 内置片段 <em>本 app 自动汇总的内容</em></div>
    <div class="th-inj-segs">${builtinHtml || `<div class="th-inj-scope-empty">${iconHtml('fa-circle-info')} 本 app 暂无内置片段。</div>`}</div>
    <div class="th-inj-sech">${iconHtml('fa-inbox')} 注入暂存夹 <em>你从各处「加入注入」收藏的具体内容</em></div>
    <div class="th-inj-segs">${stashHtml || `<div class="th-inj-scope-empty">${iconHtml('fa-circle-info')} 暂存夹是空的。在 ${esc(plan?.appName || '本 app')} 界面里点某条内容的「加入注入」，它就会进这里，供你统一注入。</div>`}${stashOn ? `<div class="th-inj-stash-acts"><button class="th-btn th-btn-mini" data-inj-stash-clear type="button">${iconHtml('fa-broom')} 清空暂存夹</button></div>` : ''}</div>
    <div class="th-inj-sech">${iconHtml('fa-pen-nib')} 自定义片段 <em>你手写的常驻注入内容（${customs.length}）</em></div>
    <div class="th-inj-segs">${customHtml}</div>
    <details class="th-inj-addcustom">
      <summary>${iconHtml('fa-plus')} 新建自定义注入片段</summary>
      <div class="th-inj-addc-body">
        <label class="th-inj-addc-row"><span>片段名</span><input type="text" class="th-edit-input th-inj-addc-name" placeholder="如：我今天的心情 / 某个设定补充"></label>
        <label class="th-inj-addc-row"><span>性质</span><select class="th-edit-select th-inj-addc-kind">
          <option value="fact">事实（已发生的前情）</option><option value="state">现状（当前成立的状态）</option><option value="direction">导演（创作基调/指令）</option></select></label>
        <textarea class="th-inj-addc-body-t" rows="4" placeholder="写下你想注入正文/世界书的任意内容…"></textarea>
        <button class="th-btn th-btn-mini th-btn-primary" data-inj-custom-add type="button">${iconHtml('fa-check')} 添加为片段</button>
      </div>
    </details>
    <div class="th-inj-acts">
      <button class="th-btn th-btn-mini th-btn-primary" data-inj-flush type="button" title="把已开启「写入输入框」的片段追加到酒馆输入框尾部">${iconHtml('fa-pen-to-square')} 写入输入框</button>
      <button class="th-btn th-btn-mini" data-inj-preview type="button">${iconHtml('fa-eye')} 预览注入内容</button>
      <button class="th-btn th-btn-mini" data-inj-sync type="button">${iconHtml('fa-book')} 立即同步世界书片段</button>
      <button class="th-btn th-btn-mini" data-inj-manage type="button">${iconHtml('fa-list')} 管理已写入条目</button>
    </div>
    <div class="th-inj-preview" data-inj-preview-box hidden></div>
    <div class="th-inj-entries" data-inj-entries-box hidden></div>
    <div class="th-inj-wbadv th-inj-wbadv-open">
      <div class="th-inj-sech">${iconHtml('fa-sliders')} 世界书写入设置 <em>激活策略 / 插入位置 / 深度</em></div>
      <div class="th-inj-wbadv-body">
        <div class="th-wbsync-hint">${iconHtml('fa-circle-info')} 上面「写入角色卡世界书」的片段，写进世界书时用下面这套参数（激活策略/插入位置/顺序）。改一处对本 app 所有写入世界书的片段生效。</div>
        ${wbSyncPanelHtml(appId)}
      </div>
    </div>
  </div>`;
}

// 单片段封套就地编辑器（封套＝prompt-registry 模板 inject.envelope.<app>.<seg>）。
// 直接在注入面板里改这段内容怎么被包裹解释给 AI，并可 AI 重写。
function envEditorHtml(appId: string, segId: string, segName: string): string {
  const id = getEnvelopeTemplateId(appId, segId);
  const tpl = getPromptTemplate(id);
  if (!tpl) return '';
  const varsHtml = (tpl.vars || []).map(v => `<code>{{${esc(v.key)}}}</code>`).join(' ');
  return `<details class="th-inj-env" data-inj-env-id="${escAttr(id)}">
    <summary>${iconHtml('fa-box-open')} 编辑「${esc(segName)}」的注入封套${isPromptOverridden(id) ? ' <em class="th-wapp-pl-ov">已改</em>' : ''}</summary>
    <div class="th-wapp-pe-hint">${iconHtml('fa-circle-info')} 封套决定这段内容注入时如何向 AI 解释。占位符：${varsHtml}。</div>
    <textarea class="th-inj-env-text" rows="8">${esc(getPromptText(id))}</textarea>
    ${aiPromptEditorHtml(id)}
    <div class="th-wapp-pe-acts">
      <button class="th-btn th-btn-mini" data-inj-env-reset type="button">${iconHtml('fa-rotate-left')} 恢复默认</button>
      <button class="th-btn th-btn-mini th-btn-primary" data-inj-env-save type="button">${iconHtml('fa-check')} 保存封套</button>
    </div>
  </details>`;
}

export function bindInjectPlanPanel(e: Event): boolean {
  const t = e.target as HTMLElement;
  const panel = t.closest('[data-inj-app]') as HTMLElement | null;
  if (!panel) return false;
  const appId = panel.getAttribute('data-inj-app') || '';
  // 新建自定义注入片段
  if (t.closest('[data-inj-custom-add]')) {
    const nameEl = panel.querySelector('.th-inj-addc-name') as HTMLInputElement | null;
    const bodyEl = panel.querySelector('.th-inj-addc-body-t') as HTMLTextAreaElement | null;
    const kindEl = panel.querySelector('.th-inj-addc-kind') as HTMLSelectElement | null;
    const body = (bodyEl?.value || '').trim();
    if (!body) { toast('info', '先写点要注入的内容'); return true; }
    addCustomSeg(appId, nameEl?.value || '自定义片段', body, (kindEl?.value as SegmentKind) || 'fact');
    panel.outerHTML = injectPlanPanelHtml(appId);
    toast('success', '已添加自定义片段（勾选它并点写入/同步即可注入）');
    return true;
  }
  // 保存自定义片段内容
  const ceditBox = t.closest('[data-inj-cedit]') as HTMLElement | null;
  if (ceditBox && t.closest('[data-inj-cedit-save]')) {
    const fullId = ceditBox.getAttribute('data-inj-cedit') || '';
    const ta = ceditBox.querySelector('.th-inj-cedit-t') as HTMLTextAreaElement | null;
    if (ta) { updateCustomSeg(appId, fullId.replace('__custom__:', ''), { body: ta.value }); toast('success', '已保存内容'); }
    return true;
  }
  // 删除自定义片段
  const cDel = t.closest('[data-inj-custom-del]') as HTMLElement | null;
  if (cDel) {
    const fullId = cDel.getAttribute('data-inj-custom-del') || '';
    removeCustomSeg(appId, fullId.replace('__custom__:', ''));
    panel.outerHTML = injectPlanPanelHtml(appId);
    toast('success', '已删除自定义片段');
    return true;
  }
  // 清空暂存夹
  if (t.closest('[data-inj-stash-clear]')) {
    clearStash(appId);
    panel.outerHTML = injectPlanPanelHtml(appId);
    toast('success', '已清空暂存夹');
    return true;
  }
  // 单片段封套就地编辑（AI 重写 / 保存 / 恢复）
  const envBox = t.closest('[data-inj-env-id]') as HTMLElement | null;
  if (envBox) {
    const eid = envBox.getAttribute('data-inj-env-id') || '';
    const ta = envBox.querySelector('.th-inj-env-text') as HTMLTextAreaElement | null;
    if (ta && bindAiPromptEditor(e, () => ta.value, (text) => { ta.value = text; })) return true;
    if (t.closest('[data-inj-env-save]')) { if (ta) { setPromptOverride(eid, ta.value); toast('success', '已保存封套'); } return true; }
    if (t.closest('[data-inj-env-reset]')) { resetPrompt(eid); if (ta) ta.value = getPromptText(eid); toast('success', '已恢复默认封套'); return true; }
  }
  if (t.closest('[data-inj-flush]')) {
    // 写入输入框模式 → 追加到酒馆输入框尾部。按当前面板 appId 隔离，只写本 app 的片段。
    if (hasActiveFloorSeg(appId)) {
      const n = flushFloorInjection(appId);
      toast(n ? 'success' : 'info', n ? '已写入酒馆输入框尾部，可再编辑后随下一楼发出' : '写入失败：没找到酒馆输入框');
    } else {
      // 没有「写入输入框」片段，但可能开了世界书片段——给出准确指引而非误导
      toast('info', '当前没有「写入输入框」模式的开启片段；若选的是「写入世界书」，点右侧「立即同步世界书片段」即可。');
    }
    return true;
  }
  if (t.closest('[data-inj-preview]')) {
    const box = panel.querySelector('[data-inj-preview-box]') as HTMLElement | null;
    if (box) {
      if (!box.hidden) { box.hidden = true; return true; }
      box.hidden = false;
      const pv = previewInjection(appId);
      const wb = pv.worldbookList.length ? pv.worldbookList.map(w => `<div class="th-inj-pv-blk"><div class="th-inj-pv-h">${iconHtml('fa-book')} ${esc(w.appName)}·${esc(w.segName)}（写入世界书）</div><pre class="th-inj-pv-pre">${esc(w.content)}</pre></div>`).join('') : '';
      const fl = pv.floorText.trim() ? `<div class="th-inj-pv-blk"><div class="th-inj-pv-h">${iconHtml('fa-layer-group')} 写入输入框（随下一楼发出，不进世界书）</div><pre class="th-inj-pv-pre">${esc(pv.floorText)}</pre></div>` : '';
      // 若只有输入框那路有内容、世界书那路为空，明确提示——避免把输入框预览误当成「世界书注入生效了」。
      const hint = (pv.floorText.trim() && !pv.worldbookList.length)
        ? `<div class="th-wbsync-note">${iconHtml('fa-circle-info')} 下面这些是「写入输入框」的内容。<b>它不会写进世界书</b>；如需写世界书，请把片段去向改成「写入角色卡世界书」，再点「立即同步世界书片段」。</div>`
        : '';
      box.innerHTML = (hint + fl + wb) || `<div class="th-wbsync-empty">当前没有开启任何注入片段。</div>`;
    }
    return true;
  }
  if (t.closest('[data-inj-sync]')) {
    // 写 0 条时区分两种情形——真没开片段 vs 开了但去向都停在「写入输入框」（默认值）。
    //   后者正是「预览有内容、同步却说没有」的根因：预览显示的是输入框那路，同步只认世界书那路。
    void syncAppWorldbookSegments(appId).then(n => {
      if (n) { toast('success', `已同步 ${n} 个片段到世界书`); return; }
      if (hasActiveFloorSeg(appId)) {
        toast('info', '你开启的片段去向都是「写入输入框」，不会写世界书。把片段的去向改成「写入角色卡世界书」再点这里即可。');
      } else {
        toast('info', '还没有开启任何片段。先勾选片段并把去向选为「写入角色卡世界书」。');
      }
    });
    return true;
  }
  // 管理已写入世界书的条目（列出/启停/删除）
  if (t.closest('[data-inj-manage]')) {
    const box = panel.querySelector('[data-inj-entries-box]') as HTMLElement | null;
    if (box) {
      if (!box.hidden) { box.hidden = true; return true; }
      box.hidden = false; box.innerHTML = `<div class="th-wbsync-loading">${iconHtml('fa-spinner')} 读取中…</div>`;
      void listSyncEntries(appId).then(list => {
        if (!list.length) { box.innerHTML = '<div class="th-wbsync-empty">本 app 还没有写入任何世界书条目</div>'; return; }
        box.innerHTML = list.map(en => `
          <div class="th-wbsync-entry" data-wbsync-key="${escAttr(en.memKey)}">
            <label class="th-wbsync-en-toggle"><input type="checkbox" class="th-wbsync-en-cb" ${en.enabled ? 'checked' : ''}></label>
            <span class="th-wbsync-en-name" title="${escAttr(en.name)}">${esc(en.name)}</span>
            <span class="th-wbsync-en-meta">${esc(en.memType)} · ${en.chars}字</span>
            <button class="th-wbsync-en-edit" data-wbsync-edit title="编辑条目内容">${iconHtml('fa-pen')}</button>
            <button class="th-wbsync-en-del" data-wbsync-del title="删除条目">${iconHtml('fa-trash')}</button>
          </div>`).join('');
      });
    }
    return true;
  }
  // 条目级：删除 / 启停（复用 wb-sync 的 key 标记）
  const entryEl = t.closest('[data-wbsync-key]') as HTMLElement | null;
  if (entryEl && panel.querySelector('[data-inj-entries-box]')) {
    const key = entryEl.getAttribute('data-wbsync-key') || '';
    if (t.closest('[data-wbsync-edit]')) { void editSyncEntry(key, entryEl); return true; }
    if (t.closest('[data-wbsync-del]')) {
      void deleteSyncEntry(key).then(ok => { if (ok) { entryEl.remove(); toast('success', '已删除条目'); } else toast('error', '删除失败'); });
      return true;
    }
    if (t.closest('.th-wbsync-en-cb')) { void setSyncEntryEnabled(key, (t as HTMLInputElement).checked); return true; }
  }
  return false;
}

// change：片段开关 / 方式切换即时落库；关闭世界书模式时移除已写入条目。
export function bindInjectPlanPanelChange(e: Event): boolean {
  const t = e.target as HTMLElement;
  const panel = t.closest('[data-inj-app]') as HTMLElement | null;
  if (!panel) return false;
  const appId = panel.getAttribute('data-inj-app') || '';
  const onCb = t.closest('[data-inj-on]') as HTMLInputElement | null;
  if (onCb) {
    const segId = onCb.getAttribute('data-inj-on') || '';
    const on = onCb.checked;
    const prev = getSegSel(appId, segId);
    setSegSel(appId, segId, { on });
    // 勾选/开启不自动写入世界书；写入由玩家显式点「立即同步世界书片段」按钮触发（勾选只表态）。
    //   关闭一个原本是世界书模式的片段时，仍移除其已写入条目。
    if (!on && prev.mode === 'worldbook') { void removeWorldbookSegment(appId, segId); }
    // 开/关后重渲染，让「注入范围」子项与封套编辑器随之出现/隐藏
    panel.outerHTML = injectPlanPanelHtml(appId);
    return true;
  }
  const modeSel = t.closest('[data-inj-mode]') as HTMLSelectElement | null;
  if (modeSel) {
    const segId = modeSel.getAttribute('data-inj-mode') || '';
    const prev = getSegSel(appId, segId);
    const mode = modeSel.value as InjectMode;
    if (prev.mode === 'worldbook' && mode !== 'worldbook') void removeWorldbookSegment(appId, segId);
    setSegSel(appId, segId, { mode });
    // 切到世界书不立即写入——等玩家点「立即同步世界书片段」按钮。切走世界书模式已移除旧条目（上面处理）。
    return true;
  }
  // 注入范围子项勾选 / 全部
  const scopeBox = t.closest('[data-inj-scope]') as HTMLElement | null;
  if (scopeBox) {
    const segId = scopeBox.getAttribute('data-inj-scope') || '';
    const items = getSegScopeItems(appId, segId) || [];
    const allCb = t.closest('.th-inj-scope-allcb') as HTMLInputElement | null;
    if (allCb) {
      // 勾「全部」=清空具体选择（undefined 表示全选）；取消「全部」=改为逐项（默认全留）
      if (allCb.checked) setSegScopeSel(appId, segId, undefined);
      else setSegScopeSel(appId, segId, items.map(i => i.id));
    } else if (t.closest('.th-inj-scope-cb')) {
      const checked = Array.from(scopeBox.querySelectorAll('.th-inj-scope-cb')).filter(cb => (cb as HTMLInputElement).checked).map(cb => (cb as HTMLElement).getAttribute('data-inj-scope-id') || '');
      // 全勾=回到 undefined（全部）；否则记具体集合
      setSegScopeSel(appId, segId, checked.length === items.length ? undefined : checked);
    } else return false;
    // 范围变更不自动重写世界书条目——等玩家点「立即同步世界书片段」。
    // 重渲染该片段的范围块以同步「全部」与逐项的勾选态
    const panel2 = scopeBox.closest('[data-inj-app]') as HTMLElement | null;
    if (panel2) { panel2.outerHTML = injectPlanPanelHtml(appId); }
    return true;
  }
  return false;
}
