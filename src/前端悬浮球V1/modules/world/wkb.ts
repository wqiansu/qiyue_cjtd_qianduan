// 世界套件 —— 工作台（wkb.ts）UI 模块
// PC 三栏「通用 AI 造物机」，仙宫粉黛。玩家选模板 + 描述 → AI 造出结构化产物 → 唯一出口＝拼进玩家聊天输入框。
//   左栏(thw-wkb-side)：品牌 / 模板库（常用内置 + 自定义 + 新建）/ 产物库入口 / 设置。
//   中栏(thw-wkb-forge)：生成台（要造什么 + 语气 + 参考三档 + 临时情境 + 数量 → 生成/手气不错/再来一个）+ 字段编辑器(折叠) + 结果预览。
//   右栏(thw-wkb-out)：选中产物卡（可就地改字段/锁定重roll）+ 投递区（人称切换 + 呈现体 + 预览 + 塞进输入框/复制/暂存/撤销）+ 暂存篮。
// **全程不碰 MVU/世界书写入、不动角色卡变量**——纯生成 + 拼进输入框。破限进 ordered_prompts[0]；设置 master-detail 局部刷新。
// 关键 CSS 类名（供补样式）：
//   .thw-wkb-app2 .thw-wkb-side .thw-wkb-brand .thw-wkb-nav(.on) .thw-wkb-tpl(.on) .thw-wkb-forge .thw-wkb-out
//   .thw-wkb-descbox .thw-wkb-toolrow .thw-wkb-fields .thw-wkb-field-edit .thw-wkb-preview .thw-wkb-prod .thw-wkb-prodcard
//   .thw-wkb-fieldrow .thw-wkb-deliver .thw-wkb-person .thw-wkb-present .thw-wkb-delivbox .thw-wkb-stash .thw-wkb-lib
//   .thw-wkb-set-body .thw-wkb-set-nav .thw-wkb-set-detail
import { esc, escAttr, qs } from '../../lib/dom-utils';
import { openModal2 } from '../../status-bar-init';
import { phoneShellHtml, startPhoneClock } from '../../lib/world/phone-shell';
import { iconHtml } from '../../lib/icons';
import { registerWorldApp } from '../../lib/world/world-store';
import { listContactsForApp } from '../../lib/world/contacts';
import { chatGenerate, readTavernFloors } from '../../lib/world/ai-chat';
import { thToast, thConfirm, thPrompt } from '../../lib/world/ui-kit';
import { getPromptText, renderPrompt, listPromptTemplates, setPromptOverride, resetPrompt } from '../../lib/world/world-prompts';
import { addToStash, getStash, removeStashItem, clearStash } from '../../lib/world/inject-plan';
import { registerApiPlan } from '../../lib/world/api-plan';
import {
  apiPlanPanelHtml, bindApiPlanPanel, bindApiPlanPanelChange,
  aiPromptEditorHtml, bindAiPromptEditor,
  patchSettingsDetail,
} from './world-app-settings';
import { isWorldbookAvailable, buildInjectFromKeys } from '../../lib/world/worldbook';
import { wbPickerHtml, bindWbPicker } from '../../lib/world/wb-picker';
import '../../lib/world/wkb-prompts';   // 注册 wkb.* 提示词
import {
  getWkbSettings, updateWkbSettings, WkbSettings,
  listTemplates, getTemplate, WkbTemplate, WKB_BUILTIN_TEMPLATES,
  setTemplateFields, resetTemplateFields, isBuiltinDisabled, setBuiltinEnabled,
  addCustomTemplate, updateCustomTemplate, deleteCustomTemplate,
  listProducts, getProduct, addProduct, updateProduct, deleteProduct, toggleProductFav, clearProducts, allProductTags,
  readCandidates, writeCandidates, clearCandidates, packageText,
  WkbProduct, WkbPerson, WkbPresent,
  renderDelivery, deliverToInputBox, undoDelivery,
} from '../../lib/world/wkb-store';

const RID = 'th-wkb-root';
const WKB_MODAL_MAXW = 'min(1200px,97vw)';
function rootEl(): HTMLElement | null { return qs<HTMLElement>('#' + RID); }
// PLACEHOLDER_WKB_STATE
// ==================== 视图状态 ====================
type View =
  | { name: 'forge' }              // 生成台（默认）
  | { name: 'lib' }                // 产物库
  | { name: 'settings' };
let _view: View = { name: 'forge' };
let _tplId = 'wkb.item';           // 当前选中模板
let _desc = '';                    // 要造什么（草稿）
let _sceneNote = '';               // 临时情境（本次生成用）
let _refMode: 'off' | 'story' | 'full' = 'off';  // 参考三档（生成台顶部快切，默认不读）
let _fieldEditOpen = false;        // 字段编辑器折叠态
let _candidates: WkbProduct[] = []; // 本次生成的候选（未入库前）
let _selProd: string | null = null; // 右栏选中产物 id（候选或库产物）
let _deliverPerson: WkbPerson | null = null; // 投递人称临时覆盖（null=用设置默认）
let _deliverPresent: WkbPresent | null = null;
let _lastAppended = '';            // 上次投递追加的文本（供撤销）
let _lockedFields: Set<string> = new Set(); // 锁定字段（重roll保留）
let _busy = false;
let _promptEditId: string | null = null;
let _setCat: SetCat = 'gen';
let _libQuery = '';
let _libTag = '';

type SetCat = 'gen' | 'deliver' | 'pkg' | 'ref' | 'tpl' | 'api' | 'prompt' | 'theme' | 'data';

// 候选持久化：改动候选/选中后落地，退出重开不丢。
function persistCands(): void { writeCandidates(_candidates, _selProd); }

// ==================== 主题 / 字体 ====================
const THEMES: { id: string; name: string; sw: string }[] = [
  { id: 'pink', name: '仙宫粉黛', sw: 'linear-gradient(135deg,#c06fb0,#8e3f7e)' },
  { id: 'jade', name: '碧霄青', sw: 'linear-gradient(135deg,#5eb89a,#2f8f74)' },
  { id: 'steel', name: '工业蓝钢', sw: 'linear-gradient(135deg,#5b7fa6,#37516e)' },
  { id: 'gold', name: '流金', sw: 'linear-gradient(135deg,#d4a24e,#a97c28)' },
];
const FONTS: { id: string; name: string }[] = [
  { id: 'system', name: '默认' }, { id: 'song', name: '宋体' }, { id: 'kai', name: '楷体' }, { id: 'round', name: '圆体' },
];
const TONES = ['正经', '沙雕', '香艳', '中二', '古风', '温柔', '冷峻', '俏皮'];
// PLACEHOLDER_WKB_HELPERS
function curTpl(): WkbTemplate { return getTemplate(_tplId) || listTemplates()[0]; }
function WKB_BUILTIN_LIST(): WkbTemplate[] { return WKB_BUILTIN_TEMPLATES; }

// ==================== 左栏：模板库 ====================
function sidebarHtml(): string {
  const tpls = listTemplates();
  const builtins = tpls.filter(t => t.builtin);
  const customs = tpls.filter(t => !t.builtin);
  const tplBtn = (t: WkbTemplate) => `<button class="thw-wkb-tpl${_tplId === t.id && _view.name === 'forge' ? ' on' : ''}" data-wkb-tpl="${escAttr(t.id)}" type="button" title="${escAttr(t.name)}">
    <span class="thw-wkb-tpl-ico">${iconHtml(t.icon)}</span><span class="thw-wkb-tpl-name">${esc(t.name)}</span></button>`;
  return `<div class="thw-sidebar thw-wkb-side">
    <div class="thw-wkb-brand">${iconHtml('fa-hammer')} 工作台</div>
    <div class="thw-wkb-navsec">造物模板</div>
    <div class="thw-wkb-tpls">${builtins.map(tplBtn).join('')}</div>
    ${customs.length ? `<div class="thw-wkb-navsec">我的模板</div><div class="thw-wkb-tpls">${customs.map(tplBtn).join('')}</div>` : ''}
    <button class="thw-wkb-nav thw-wkb-nav-add" data-wkb-tpl-new type="button">${iconHtml('fa-plus')} 新建模板</button>
    <div class="thw-wkb-side-grow"></div>
    <button class="thw-wkb-nav${_view.name === 'lib' ? ' on' : ''}" data-wkb-lib type="button">${iconHtml('fa-box-archive')} 产物库 <span class="thw-wkb-nav-n">${listProducts().length}</span></button>
    <button class="thw-wkb-nav${_view.name === 'settings' ? ' on' : ''}" data-wkb-settings type="button">${iconHtml('fa-gear')} 设置</button>
  </div>`;
}
// PLACEHOLDER_WKB_SIDEBAR
// ==================== 中栏：生成台 ====================
function forgeHtml(): string {
  const t = curTpl();
  const s = getWkbSettings();
  const toneOpts = TONES.map(x => `<option value="${escAttr(x)}"${s.tone === x ? ' selected' : ''}>${esc(x)}</option>`).join('');
  const refLabel = { off: '不读剧情（默认）', story: `只读最近 ${s.storyFloors} 楼`, full: '读楼层 + 绑定世界书' };
  return `<div class="thw-content thw-wkb-forge">
    <div class="thw-topbar"><span class="thw-eyebrow">${iconHtml(t.icon)} 造「${esc(t.name)}」</span>
      <span class="thw-topbar-spacer"></span>
      <select class="thw-input thw-wkb-refsel" data-wkb-ref>
        <option value="off"${_refMode === 'off' ? ' selected' : ''}>${esc(refLabel.off)}</option>
        <option value="story"${_refMode === 'story' ? ' selected' : ''}>${esc(refLabel.story)}</option>
        <option value="full"${_refMode === 'full' ? ' selected' : ''}>${esc(refLabel.full)}</option>
      </select>
    </div>
    <div class="thw-content-pad">
      <div class="thw-wkb-descbox">
        <textarea class="thw-input thw-wkb-desc" rows="3" placeholder="要造什么？一句话或几个关键词，比如「一柄会认主的赤色长剑」「一间藏在竹林里的茶寮」…" data-wkb-desc>${esc(_desc)}</textarea>
        <input type="text" class="thw-input thw-wkb-scene" placeholder="（可选）此刻场景是…只这一次生成用，比不读整段剧情更精准" value="${escAttr(_sceneNote)}" data-wkb-scene>
      </div>
      <div class="thw-wkb-toolrow">
        <label class="thw-wkb-tool"><span>语气</span><select class="thw-input thw-wkb-tone" data-wkb-tone>${toneOpts}</select></label>
        <label class="thw-wkb-tool"><span>数量</span><select class="thw-input thw-wkb-count" data-wkb-count>
          ${[1, 2, 3, 4, 5].map(n => `<option value="${n}"${s.batchCount === n ? ' selected' : ''}>x${n}</option>`).join('')}</select></label>
        <button class="thw-btn thw-btn-mini" data-wkb-fieldedit type="button">${iconHtml('fa-sliders')} 字段${_fieldEditOpen ? '（收起）' : ''}</button>
        <span class="thw-wkb-tool-grow"></span>
        <button class="thw-btn thw-btn-mini" data-wkb-lucky type="button" title="不填描述，按当下随机蹦一个应景的">${iconHtml('fa-dice')} 手气不错</button>
        <button class="thw-btn-primary" data-wkb-gen type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-wand-magic-sparkles')} ${_busy ? '锻造中…' : '生成'}</button>
      </div>
      ${_fieldEditOpen ? fieldEditorHtml(t) : ''}
      ${candidatesHtml()}
    </div>
  </div>`;
}
// PLACEHOLDER_WKB_FORGE
// 字段编辑器（改产物提纲；内置模板落覆盖，自定义直接改）
function fieldEditorHtml(t: WkbTemplate): string {
  const rows = t.fields.map((f, i) => `<div class="thw-wkb-fe-row" data-wkb-fe-idx="${i}">
    <input type="text" class="thw-input thw-wkb-fe-label" value="${escAttr(f.label)}" placeholder="字段名" data-wkb-fe-label="${i}">
    <input type="text" class="thw-input thw-wkb-fe-desc" value="${escAttr(f.desc || '')}" placeholder="给 AI 的提示（可空）" data-wkb-fe-desc="${i}">
    <button class="thw-iconbtn" data-wkb-fe-del="${i}" type="button" title="删除字段">${iconHtml('fa-xmark')}</button>
  </div>`).join('');
  return `<div class="thw-wkb-fields">
    <div class="thw-wkb-fields-h">${iconHtml('fa-list-check')} 字段提纲 <em>删光＝让 AI 自由写一段散文</em>
      <span class="thw-topbar-spacer"></span>
      ${t.builtin ? `<button class="thw-btn thw-btn-mini" data-wkb-fe-reset type="button">${iconHtml('fa-rotate-left')} 恢复默认</button>` : ''}
    </div>
    <div class="thw-wkb-fe-list">${rows || '<div class="thw-wkb-dim">无字段：AI 将自由发挥。</div>'}</div>
    <div class="thw-wkb-fe-add"><input type="text" class="thw-input thw-wkb-fe-newlabel" placeholder="新字段名…"><button class="thw-btn thw-btn-mini" data-wkb-fe-add type="button">${iconHtml('fa-plus')} 加字段</button></div>
  </div>`;
}
// 候选区（本次生成、未入库）
function candidatesHtml(): string {
  if (!_candidates.length) {
    return `<div class="thw-wkb-empty">${iconHtml('fa-wand-magic-sparkles')}<div>还没有造出东西</div>
      <div class="thw-wkb-empty-sub">选个模板、写句想法，点「生成」。造好的东西会出现在这里，选中后可在右侧改字段、换口吻，再塞进聊天输入框。</div>
      <div class="thw-wkb-egs">试试：<button class="thw-wkb-eg" data-wkb-eg="一柄会认主的赤色长剑">造件宝物</button><button class="thw-wkb-eg" data-wkb-eg="藏在竹林深处的一间茶寮，适合密谈">开个场景</button><button class="thw-wkb-eg" data-wkb-eg="一个让人忍不住笑场的沙雕道具">整个活</button></div></div>`;
  }
  return `<div class="thw-wkb-cands"><div class="thw-wkb-cands-h">${iconHtml('fa-sparkles')} 本次候选 <em>点一个在右侧细看/投递</em>
    <span class="thw-topbar-spacer"></span>
    <span class="thw-wkb-cands-mode" title="生成时新结果的处理方式，可在设置·生成风格里改">${getWkbSettings().genMode === 'append' ? '增量' : '覆盖'}</span>
    <button class="thw-iconbtn" data-wkb-cands-clear type="button" title="清空候选">${iconHtml('fa-trash')}</button></div>
    ${_candidates.map(p => candCardHtml(p)).join('')}</div>`;
}
function candCardHtml(p: WkbProduct): string {
  const sel = _selProd === p.id;
  const preview = p.fields.slice(0, 3).map(f => f.value ? `${esc(f.label)}：${esc(f.value.slice(0, 24))}` : '').filter(Boolean).join(' · ');
  return `<button class="thw-wkb-cand${sel ? ' on' : ''}" data-wkb-cand="${escAttr(p.id)}" type="button">
    <span class="thw-wkb-cand-name">${esc(p.title || p.templateName)}</span>
    <span class="thw-wkb-cand-prev">${esc(preview) || '（散文）'}</span></button>`;
}
// PLACEHOLDER_WKB_CANDS
// ==================== 右栏：产物 + 投递区 + 暂存篮 ====================
function curProduct(): WkbProduct | null {
  if (!_selProd) return null;
  return _candidates.find(p => p.id === _selProd) || getProduct(_selProd) || null;
}
function outHtml(): string {
  const p = curProduct();
  if (!p) return `<div class="thw-inspector thw-wkb-out">
    <div class="thw-inspector-head"><span class="thw-inspector-title">${iconHtml('fa-box-open')} 产物 · 投递</span></div>
    <div class="thw-inspector-body"><div class="thw-wkb-out-empty">${iconHtml('fa-hand-pointer')}<div>选一件造好的东西</div><div class="thw-wkb-empty-sub">选中后在这里改字段、换投递口吻，把它塞进聊天输入框，和你自己的话一起发出去。</div></div>
    ${stashHtml()}</div></div>`;
  const inLib = !!getProduct(p.id);
  const fieldRows = p.fields.map((f, i) => `<div class="thw-wkb-fieldrow${_lockedFields.has(f.label) ? ' locked' : ''}">
    <button class="thw-wkb-lockbtn" data-wkb-lock="${escAttr(f.label)}" type="button" title="${_lockedFields.has(f.label) ? '已锁定（重roll保留）' : '锁定此字段'}">${iconHtml(_lockedFields.has(f.label) ? 'fa-lock' : 'fa-lock-open')}</button>
    <span class="thw-wkb-flabel">${esc(f.label)}</span>
    <textarea class="thw-input thw-wkb-fval" rows="1" data-wkb-fval="${i}">${esc(f.value)}</textarea>
  </div>`).join('');
  return `<div class="thw-inspector thw-wkb-out">
    <div class="thw-inspector-head">
      <button class="thw-iconbtn thw-wkb-detback" data-wkb-detback type="button" title="返回列表">${iconHtml('fa-arrow-left')}</button>
      <span class="thw-inspector-title">${iconHtml('fa-box-open')} ${esc(p.title || p.templateName)}</span>
      <span class="thw-topbar-spacer"></span>
      <button class="thw-iconbtn${p.fav ? ' on' : ''}" data-wkb-fav="${escAttr(p.id)}" type="button" title="收藏">${iconHtml('fa-star')}</button>
      <button class="thw-iconbtn" data-wkb-reroll type="button" title="锁定满意字段，重roll其余" ${_busy ? 'disabled' : ''}>${iconHtml('fa-dice-three')}</button>
    </div>
    <div class="thw-inspector-body">
      <div class="thw-wkb-prodcard">
        <div class="thw-wkb-prod-tpl">${iconHtml(curTpl().icon)} ${esc(p.templateName)}</div>
        <div class="thw-wkb-fieldlist">${fieldRows || `<div class="thw-wkb-prod-body">${esc(p.extra || '（散文产物，见下方投递预览）')}</div>`}</div>
        ${p.extra && p.fields.length ? `<div class="thw-wkb-prod-extra">${esc(p.extra)}</div>` : ''}
      </div>
      ${deliverHtml(p)}
      <div class="thw-wkb-prod-ops">
        ${inLib ? '' : `<button class="thw-btn thw-btn-mini" data-wkb-save type="button">${iconHtml('fa-box-archive')} 存入产物库</button>`}
        <button class="thw-btn thw-btn-mini" data-wkb-note type="button">${iconHtml('fa-pen')} 私记</button>
        <button class="thw-btn thw-btn-mini thw-btn-danger" data-wkb-discard type="button">${iconHtml('fa-trash')} 丢弃</button>
      </div>
      ${stashHtml()}
    </div></div>`;
}
// PLACEHOLDER_WKB_OUT
// 投递区：人称切换 + 呈现体 + 所见即所得预览 + 塞进输入框/复制/暂存/撤销
const PERSONS: { id: WkbPerson; label: string }[] = [{ id: 'first', label: '我' }, { id: 'second', label: '你' }, { id: 'third', label: 'TA' }];
const PRESENTS: { id: WkbPresent; label: string }[] = [
  { id: 'narrate', label: '旁白' }, { id: 'action', label: '动作' }, { id: 'panel', label: '面板' }, { id: 'setting', label: '设定' }, { id: 'raw', label: '原文' },
];
function effPerson(): WkbPerson { return _deliverPerson || getWkbSettings().person; }
function effPresent(): WkbPresent { return _deliverPresent || getWkbSettings().present; }
function deliverText(p: WkbProduct): string {
  const raw = renderDelivery(p, getWkbSettings(), { person: effPerson(), present: effPresent() });
  return packageText(raw, getWkbSettings());
}
function deliverHtml(p: WkbProduct): string {
  const person = effPerson(), present = effPresent();
  const preview = deliverText(p);
  return `<div class="thw-wkb-deliver">
    <div class="thw-wkb-deliver-h">${iconHtml('fa-paper-plane')} 投递 <em>拼进你的聊天输入框，和你的话一起发</em></div>
    <div class="thw-wkb-person">${PERSONS.map(x => `<button class="thw-wkb-pbtn${person === x.id ? ' on' : ''}" data-wkb-person="${x.id}" type="button">${esc(x.label)}</button>`).join('')}</div>
    <div class="thw-wkb-present">${PRESENTS.map(x => `<button class="thw-wkb-prbtn${present === x.id ? ' on' : ''}" data-wkb-present="${x.id}" type="button">${esc(x.label)}</button>`).join('')}</div>
    <div class="thw-wkb-delivbox" data-wkb-delivbox>${esc(preview)}</div>
    <div class="thw-wkb-deliver-ops">
      <button class="thw-btn-primary thw-wkb-deliver-main" data-wkb-deliver type="button">${iconHtml('fa-arrow-right-to-bracket')} 塞进输入框</button>
      <div class="thw-wkb-deliver-sub">
        <button class="thw-btn thw-btn-mini" data-wkb-copy type="button">${iconHtml('fa-copy')} 复制</button>
        <button class="thw-btn thw-btn-mini" data-wkb-stash type="button">${iconHtml('fa-layer-group')} 暂存</button>
        ${_lastAppended ? `<button class="thw-btn thw-btn-mini" data-wkb-undo type="button">${iconHtml('fa-rotate-left')} 撤销上次</button>` : ''}
      </div>
    </div>
  </div>`;
}
// 暂存篮：攒多件一次性投递
function stashHtml(): string {
  const items = getStash('wkb');
  if (!items.length) return '';
  return `<div class="thw-wkb-stash">
    <div class="thw-wkb-stash-h">${iconHtml('fa-basket-shopping')} 暂存篮 <span class="thw-wkb-nav-n">${items.length}</span>
      <span class="thw-topbar-spacer"></span>
      <button class="thw-btn thw-btn-mini" data-wkb-stash-deliver type="button">${iconHtml('fa-paper-plane')} 全部投递</button>
      <button class="thw-iconbtn" data-wkb-stash-clear type="button" title="清空">${iconHtml('fa-trash')}</button></div>
    ${items.map(it => `<div class="thw-wkb-stash-item"><span>${esc(it.title)}</span><button class="thw-iconbtn" data-wkb-stash-del="${escAttr(it.id)}" type="button">${iconHtml('fa-xmark')}</button></div>`).join('')}
  </div>`;
}
// PLACEHOLDER_WKB_DELIVER
// ==================== 产物库视图（中栏）====================
function libHtml(): string {
  let list = listProducts();
  if (_libTag) list = list.filter(p => (p.tags || []).includes(_libTag));
  if (_libQuery.trim()) {
    const q = _libQuery.trim().toLowerCase();
    list = list.filter(p => (p.title + ' ' + p.fields.map(f => f.value).join(' ')).toLowerCase().includes(q));
  }
  const tags = allProductTags();
  const cards = list.map(p => {
    const sel = _selProd === p.id;
    const prev = p.fields.slice(0, 2).map(f => f.value ? esc(f.value.slice(0, 30)) : '').filter(Boolean).join(' · ');
    return `<button class="thw-wkb-libcard${sel ? ' on' : ''}" data-wkb-cand="${escAttr(p.id)}" type="button">
      <span class="thw-wkb-libcard-top"><span class="thw-wkb-libcard-ico">${iconHtml((getTemplate(p.templateId) || { icon: 'fa-cube' }).icon)}</span>
        <span class="thw-wkb-libcard-name">${esc(p.title || p.templateName)}</span>${p.fav ? iconHtml('fa-star') : ''}</span>
      <span class="thw-wkb-libcard-prev">${prev || '（散文）'}</span>
      <span class="thw-wkb-libcard-meta">${esc(p.templateName)} · ${new Date(p.ts).toLocaleDateString()}</span></button>`;
  }).join('');
  return `<div class="thw-content thw-wkb-lib">
    <div class="thw-topbar"><span class="thw-eyebrow">${iconHtml('fa-box-archive')} 产物库</span><span class="thw-mem-app-tag">${list.length} 件</span>
      <span class="thw-topbar-spacer"></span>${list.length ? `<button class="thw-btn thw-btn-mini thw-btn-danger" data-wkb-lib-clear type="button">${iconHtml('fa-trash')} 清空</button>` : ''}</div>
    <div class="thw-content-pad">
      <div class="thw-wkb-lib-tools">
        <input type="text" class="thw-input thw-wkb-lib-search" placeholder="搜索造过的东西…" value="${escAttr(_libQuery)}" data-wkb-lib-search>
      </div>
      ${tags.length ? `<div class="thw-wkb-lib-tags"><button class="thw-wkb-tag${!_libTag ? ' on' : ''}" data-wkb-lib-tag="" type="button">全部</button>${tags.map(t => `<button class="thw-wkb-tag${_libTag === t ? ' on' : ''}" data-wkb-lib-tag="${escAttr(t)}" type="button">${esc(t)}</button>`).join('')}</div>` : ''}
      <div class="thw-wkb-libgrid">${cards || `<div class="thw-wkb-empty">${iconHtml('fa-box-open')}<div>产物库还是空的</div><div class="thw-wkb-empty-sub">在生成台造点东西，存进来随时复用、再投递。</div></div>`}</div>
    </div>
  </div>`;
}
// PLACEHOLDER_WKB_LIB
// ==================== 设置（master-detail）====================
const WKB_SET_CATS: { id: SetCat; icon: string; label: string }[] = [
  { id: 'gen', icon: 'fa-wand-magic-sparkles', label: '生成风格' },
  { id: 'deliver', icon: 'fa-paper-plane', label: '投递口吻' },
  { id: 'pkg', icon: 'fa-box-open', label: '投递封装' },
  { id: 'ref', icon: 'fa-book-open', label: '参考上下文' },
  { id: 'tpl', icon: 'fa-shapes', label: '模板管理' },
  { id: 'api', icon: 'fa-plug', label: 'API 利用' },
  { id: 'prompt', icon: 'fa-scroll', label: '功能提示词' },
  { id: 'theme', icon: 'fa-palette', label: '外观' },
  { id: 'data', icon: 'fa-database', label: '数据' },
];
function swRow(label: string, hint: string, cls: string, on: boolean): string {
  return `<label class="thw-switchrow"><span class="thw-switchrow-main"><b>${label}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</span>
    <span class="thw-switch"><input type="checkbox" class="${cls}" ${on ? 'checked' : ''}><span class="thw-switch-track"></span></span></label>`;
}
function settingsHtml(): string {
  const navs = WKB_SET_CATS.map(c => `<button class="thw-nav${_setCat === c.id ? ' thw-nav-on' : ''}" data-wkb-setcat="${c.id}" type="button"><span class="thw-nav-ico">${iconHtml(c.icon)}</span><span class="thw-nav-lbl">${c.label}</span></button>`).join('');
  return `<div class="thw-content thw-wkb-forge thw-wkb-settings">
    <div class="thw-topbar"><span class="thw-topbar-title">${iconHtml('fa-gear')} 工作台设置</span></div>
    <div class="thw-wkb-set-body"><nav class="thw-wkb-set-nav">${navs}</nav><div class="thw-wkb-set-detail thw-content-pad thw-view-in">${settingsDetailHtml()}</div></div>
  </div>`;
}
// PLACEHOLDER_WKB_SETTINGS
function settingsDetailHtml(): string {
  const s = getWkbSettings();
  if (_setCat === 'gen') {
    const detailOpts = [['brief', '一句话'], ['card', '精简卡'], ['rich', '详尽卡']].map(([v, l]) => `<option value="${v}"${s.detail === v ? ' selected' : ''}>${l}</option>`).join('');
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">生成风格</span></div>
      <div class="thw-set-hint">造物的默认腔调与详略。生成台顶部也能临时改语气/数量。</div>
      <div class="thw-field"><div class="thw-flabel">默认语气</div><select class="thw-input thw-wkb-s-tone">${TONES.map(x => `<option value="${escAttr(x)}"${s.tone === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="thw-field"><div class="thw-flabel">产物详略</div><select class="thw-input thw-wkb-s-detail">${detailOpts}</select></div>
      ${swRow('附一句点评/吐槽', '产物末尾带一句打破第四面墙的俏皮吐槽', 'thw-wkb-s-quip', s.withQuip)}
      <div class="thw-field"><div class="thw-flabel">再次生成时</div><select class="thw-input thw-wkb-s-genmode">
        <option value="replace"${s.genMode === 'replace' ? ' selected' : ''}>覆盖——用新结果替换本次候选</option>
        <option value="append"${s.genMode === 'append' ? ' selected' : ''}>增量——新结果追加到候选区，旧的保留</option>
      </select></div>
      <div class="thw-field"><div class="thw-flabel">默认候选数量</div><input type="number" min="1" max="5" class="thw-input thw-wkb-s-batch" value="${s.batchCount}"></div>
      <button class="thw-btn-primary thw-btn-mini" data-wkb-s-save type="button">${iconHtml('fa-check')} 保存</button>
    </div>`;
  }
  if (_setCat === 'deliver') {
    const personOpts = PERSONS.map(x => `<option value="${x.id}"${s.person === x.id ? ' selected' : ''}>${esc(x.label)}（${x.id === 'first' ? '第一人称' : x.id === 'second' ? '第二人称' : '第三人称'}）</option>`).join('');
    const presentOpts = PRESENTS.map(x => `<option value="${x.id}"${s.present === x.id ? ' selected' : ''}>${esc(x.label)}</option>`).join('');
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">投递默认口吻</span></div>
      <div class="thw-set-hint">产物拼进输入框时用的默认人称与呈现体。投递时右栏还能临时切换、所见即所得。</div>
      <div class="thw-field"><div class="thw-flabel">默认人称</div><select class="thw-input thw-wkb-s-person">${personOpts}</select></div>
      <div class="thw-field"><div class="thw-flabel">默认呈现体</div><select class="thw-input thw-wkb-s-present">${presentOpts}</select></div>
      <div class="thw-field"><div class="thw-flabel">自称（我/吾/本座…）</div><input type="text" class="thw-input thw-wkb-s-self" value="${escAttr(s.selfName)}" placeholder="留空＝「我」"></div>
      <div class="thw-field"><div class="thw-flabel">对方称谓（你/她/昵称）</div><input type="text" class="thw-input thw-wkb-s-other" value="${escAttr(s.otherName)}" placeholder="留空＝「你」"></div>
      ${swRow('投递前总弹预览', '关＝直接塞进输入框；开＝先看最终文本再确认', 'thw-wkb-s-preview', s.alwaysPreview)}
      ${swRow('允许投递到输入框以外', '默认关——保持「和玩家的话一起发」的纯粹形态', 'thw-wkb-s-beyond', s.allowBeyondInput)}
      <button class="thw-btn-primary thw-btn-mini" data-wkb-s-save type="button">${iconHtml('fa-check')} 保存</button>
    </div>`;
  }
  // PLACEHOLDER_WKB_SETTINGS_2
  if (_setCat === 'pkg') {
    const sepOpts = [['blank', '空行（隔开一段，最醒目）'], ['single', '单换行（另起一行）'], ['space', '空格（接在同一行）']]
      .map(([v, l]) => `<option value="${v}"${s.pkgSep === v ? ' selected' : ''}>${l}</option>`).join('');
    const sampleRaw = s.person === 'first' ? '我这边有一样东西：赤霄剑——一柄会认主的赤色长剑。' : '你看——赤霄剑，一柄会认主的赤色长剑。';
    const sample = (() => { let x = sampleRaw; if (s.pkgLabel.trim()) x = `【${s.pkgLabel.trim()}】` + x; if (s.pkgPrefix) x = s.pkgPrefix + x; if (s.pkgSuffix) x = x + s.pkgSuffix; return x; })();
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">投递封装</span></div>
      <div class="thw-set-hint">投递前给最终文本套一层「包装」再拼进输入框（如标成设定/旁白、或用括号包成 OOC）。留空＝原样投递。</div>
      <div class="thw-field"><div class="thw-flabel">前置标签</div><input type="text" class="thw-input thw-wkb-s-pkglabel" value="${escAttr(s.pkgLabel)}" placeholder="留空＝不加；如「设定」→ 输出「【设定】…」"></div>
      <div class="thw-field"><div class="thw-flabel">整体前缀</div><input type="text" class="thw-input thw-wkb-s-pkgprefix" value="${escAttr(s.pkgPrefix)}" placeholder="留空＝不加；如「（」「[OOC] 」"></div>
      <div class="thw-field"><div class="thw-flabel">整体后缀</div><input type="text" class="thw-input thw-wkb-s-pkgsuffix" value="${escAttr(s.pkgSuffix)}" placeholder="留空＝不加；如「）」"></div>
      <div class="thw-field"><div class="thw-flabel">与输入框已有文字的分隔</div><select class="thw-input thw-wkb-s-pkgsep">${sepOpts}</select></div>
      <div class="thw-field"><div class="thw-flabel">效果预览</div><div class="thw-wkb-pkg-sample">${esc(sample)}</div></div>
      <button class="thw-btn-primary thw-btn-mini" data-wkb-s-save type="button">${iconHtml('fa-check')} 保存</button>
    </div>`;
  }
  return settingsDetailHtml2();
}
// PLACEHOLDER_WKB_SETTINGS_MID
function settingsDetailHtml2(): string {
  const s = getWkbSettings();
  if (_setCat === 'ref') {
    const wbReady = isWorldbookAvailable();
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">参考上下文（默认全关）</span></div>
      <div class="thw-set-hint">默认不读任何剧情/世界书——更省 token、更通用，产物不被当前剧情带跑。想贴合当前情境/世界观时才开。生成台顶部也有「参考三档」快切。</div>
      ${swRow('读最近剧情楼层', '生成时把最近几楼正文作参考，让产物贴合当前情境', 'thw-wkb-s-readstory', s.readStory)}
      <div class="thw-field"><div class="thw-flabel">读取楼层数</div><input type="number" min="1" max="30" class="thw-input thw-wkb-s-floors" value="${s.storyFloors}"></div>
    </div>
    <div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-book-medical')} 绑定世界书条目（可选素材）</span></div>
      <div class="thw-set-hint">${wbReady ? '选中的条目作为世界观素材参考（仅「读楼层+世界书」档生效）。改设定改世界书即可。' : '当前环境无世界书接口。'}</div>
      <div data-wkb-wbpick-host>${wbReady ? wbPickerHtml(s.worldbookEntryKeys || []) : ''}</div>
    </div>`;
  }
  if (_setCat === 'tpl') {
    const rows = WKB_BUILTIN_LIST().map(t => `<label class="thw-switchrow"><span class="thw-switchrow-main"><b>${iconHtml(t.icon)} ${esc(t.name)}</b></span>
      <span class="thw-switch"><input type="checkbox" class="thw-wkb-s-builtin" data-wkb-builtin="${escAttr(t.id)}" ${isBuiltinDisabled(t.id) ? '' : 'checked'}><span class="thw-switch-track"></span></span></label>`).join('');
    const customs = listTemplates().filter(t => !t.builtin);
    const cusRows = customs.map(t => `<div class="thw-wkb-cusrow"><span>${iconHtml(t.icon)} ${esc(t.name)}</span>
      <button class="thw-iconbtn" data-wkb-cus-ren="${escAttr(t.id)}" type="button" title="改名">${iconHtml('fa-pen')}</button>
      <button class="thw-iconbtn thw-btn-danger" data-wkb-cus-del="${escAttr(t.id)}" type="button" title="删除">${iconHtml('fa-trash')}</button></div>`).join('');
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">内置模板开关</span></div>
      <div class="thw-set-hint">关掉不用的内置模板，让模板库更清爽。字段在生成台的「字段」编辑器里改。</div>${rows}</div>
      <div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">自定义模板</span></div>
      ${cusRows || '<div class="thw-wkb-dim">还没有自定义模板。左栏「新建模板」创建。</div>'}</div>`;
  }
  if (_setCat === 'api') {
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">API 利用</span></div>
      <div class="thw-set-hint">工作台只有「造物」一种生成。设定每次生成的候选批量额度。</div>${apiPlanPanelHtml('wkb')}</div>`;
  }
  // PLACEHOLDER_WKB_SETTINGS_3
  return settingsDetailHtml3();
}
// PLACEHOLDER_WKB_SETTINGS_MID2
function settingsDetailHtml3(): string {
  const s = getWkbSettings();
  if (_setCat === 'prompt') {
    const tpls = listPromptTemplates('wkb');
    const rows = tpls.map(t => `<button class="thw-wkb-prow" data-wkb-pe="${escAttr(t.id)}" type="button">
      <span class="thw-wkb-prow-name">${esc(t.name)}</span><span class="thw-wkb-prow-arrow">${iconHtml('fa-chevron-right')}</span></button>`).join('');
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-scroll')} 功能提示词</span></div>
      <div class="thw-set-hint">破限置顶 + 通用造物骨架 + 每模板补充引导，都可就地编辑 / AI 重写 / 恢复默认。</div>
      <div class="thw-wkb-prows">${rows}</div></div>`;
  }
  if (_setCat === 'theme') {
    const themeCards = THEMES.map(t => `<button class="thw-wkb-themecard${s.theme === t.id ? ' on' : ''}" data-wkb-theme="${t.id}" type="button">
      <span class="thw-wkb-theme-sw" style="background:${t.sw}"></span><span>${esc(t.name)}</span></button>`).join('');
    const fontOpts = FONTS.map(f => `<option value="${f.id}"${s.font === f.id ? ' selected' : ''}>${esc(f.name)}</option>`).join('');
    return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">主题皮肤</span></div>
      <div class="thw-wkb-themes">${themeCards}</div>
      <div class="thw-field"><div class="thw-flabel">字体</div><select class="thw-input thw-wkb-s-font">${fontOpts}</select></div>
    </div>`;
  }
  // data
  return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-database')} 数据（纯本地，不进存档）</span></div>
    <div class="thw-set-hint">产物库与自定义模板都只存在你本地浏览器，绝不写入任何存档/变量/世界书。</div>
    <button class="thw-btn thw-btn-mini" data-wkb-export type="button">${iconHtml('fa-download')} 导出产物库</button>
    <button class="thw-btn thw-btn-mini thw-btn-danger" data-wkb-lib-clear type="button">${iconHtml('fa-trash')} 清空产物库</button>
  </div>`;
}
// PLACEHOLDER_WKB_SETTINGS_END
// 提示词编辑视图
function promptEditViewHtml(id: string): string {
  const t = listPromptTemplates('wkb').find(x => x.id === id);
  return `<div class="thw-content thw-wkb-forge">
    <div class="thw-topbar"><button class="thw-iconbtn" data-wkb-pe-close type="button">${iconHtml('fa-arrow-left')}</button><span class="thw-topbar-title">${esc(t?.name || '提示词')}</span>
      <span class="thw-topbar-spacer"></span><button class="thw-btn thw-btn-mini" data-wkb-pe-reset type="button">${iconHtml('fa-rotate-left')} 恢复默认</button><button class="thw-btn-primary thw-btn-mini" data-wkb-pe-save type="button">${iconHtml('fa-check')} 保存</button></div>
    <div class="thw-content-pad thw-view-in">
      <div class="thw-set-hint">${esc(t?.desc || '')}</div>
      <textarea class="thw-input thw-wkb-pe-text" rows="16">${esc(getPromptText(id))}</textarea>
      ${aiPromptEditorHtml(id)}
    </div>
  </div>`;
}
// ==================== 渲染 ====================
function render(): void {
  const root = rootEl(); if (!root) return;
  const s = getWkbSettings();
  let content = '';
  if (_promptEditId) content = promptEditViewHtml(_promptEditId);
  else if (_view.name === 'settings') content = settingsHtml();
  else if (_view.name === 'lib') content = libHtml();
  else content = forgeHtml();
  const showOut = _view.name === 'forge' || _view.name === 'lib';
  // 选中产物 → 右栏「投递台」升为全宽详情页（隐藏左中栏），点开即展开。
  const hasDetail = showOut && !!curProduct();
  const themeCls = `thw-wkb-theme-${s.theme || 'pink'} thw-wkb-font-${s.font || 'system'}${hasDetail ? ' thw-wkb-hasdetail' : ''}`;
  root.innerHTML = `<div class="thw-app thw-wkb-app2 ${themeCls}">
    <div class="thw-body">${sidebarHtml()}${content}${showOut ? outHtml() : ''}</div>
  </div>`;
  // 参考设置里的世界书选择器
  if (_view.name === 'settings' && _setCat === 'ref' && isWorldbookAvailable()) {
    const host = root.querySelector('[data-wkb-wbpick-host]') as HTMLElement | null;
    if (host) bindWbPicker(host, () => getWkbSettings().worldbookEntryKeys || [], (keys) => updateWkbSettings({ worldbookEntryKeys: keys }));
  }
}
// PLACEHOLDER_WKB_RENDER
// ==================== 生成（造物）====================
// 把 AI 文本解析成产物：按「字段名：内容」逐行匹配模板字段；未匹配的堆进 extra。
function parseProduct(raw: string, t: WkbTemplate): WkbProduct {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const fieldByLabel = new Map(t.fields.map(f => [f.label, ''] as [string, string]));
  const extras: string[] = [];
  for (const line of lines) {
    const m = line.match(/^[·\-*\s]*([^：:]{1,12})[：:]\s*(.+)$/);
    if (m && fieldByLabel.has(m[1].trim())) { fieldByLabel.set(m[1].trim(), m[2].trim()); }
    else extras.push(line);
  }
  const fields = t.fields.map(f => ({ label: f.label, value: fieldByLabel.get(f.label) || '' }));
  // 取名：首个「名称/名字/曲名/书名/委托名/曲名」类字段，或首行
  const nameField = fields.find(f => /名|题|钩子/.test(f.label) && f.value);
  const title = (nameField?.value || (fields[0]?.value) || extras[0] || t.name).slice(0, 40);
  return {
    id: 'tmp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    templateId: t.id, templateName: t.name, title,
    fields: t.fields.length ? fields : [],
    extra: t.fields.length ? (extras.join('\n') || undefined) : raw.trim(),
    tags: [], ts: Date.now(),
  };
}
function splitCandidates(raw: string): string[] {
  const parts = raw.split(/\n?[—\-─=]{3,}\n?/).map(p => p.trim()).filter(Boolean);
  return parts.length ? parts : [raw.trim()];
}
// PLACEHOLDER_WKB_GEN
// 组装参考块（默认空；按 _refMode 读楼层 / 世界书）
async function buildRefBlock(): Promise<string> {
  const s = getWkbSettings();
  if (_refMode === 'off') return '';
  const parts: string[] = [];
  try {
    const floors = readTavernFloors(s.storyFloors || 4);
    if (floors && floors.trim()) parts.push('【最近剧情（仅供贴合情境，勿复述）】\n' + floors.trim());
  } catch (e) { void e; }
  if (_refMode === 'full' && (s.worldbookEntryKeys || []).length) {
    try {
      const wb = await buildInjectFromKeys(s.worldbookEntryKeys);
      if (wb && wb.trim()) parts.push('【世界设定素材（背景参考，勿复述）】\n' + wb.trim());
    } catch (e) { void e; }
  }
  return parts.length ? parts.join('\n\n') + '\n' : '';
}
async function doGenerate(opts: { count?: number; lucky?: boolean; reroll?: boolean } = {}): Promise<void> {
  if (_busy) return;
  const t = curTpl();
  const s = getWkbSettings();
  const desc = opts.lucky ? '（不限定，按当下情境或凭空蹦一个应景、有意思的即可）' : _desc.trim();
  if (!desc && !opts.lucky) { thToast('先写一句「要造什么」', 'warn'); return; }
  const count = Math.max(1, Math.min(5, opts.count ?? s.batchCount));
  _busy = true; render();
  try {
    const tpl = getTemplate(_tplId) || t;
    const outline = tpl.fields.length ? tpl.fields.map(f => `· ${f.label}${f.desc ? `（${f.desc}）` : ''}`).join('\n') : '（无字段，自由写一段凝练散文）';
    const detailLabel = s.detail === 'brief' ? '一句话带过' : s.detail === 'rich' ? '详尽丰满' : '精简成卡';
    const refBlock = await buildRefBlock();
    // reroll：锁定字段的值作为「保留」提示
    let lockNote = '';
    if (opts.reroll && _lockedFields.size) {
      const p = curProduct();
      if (p) lockNote = '\n【必须原样保留的字段（不要改）】\n' + p.fields.filter(f => _lockedFields.has(f.label) && f.value).map(f => `· ${f.label}：${f.value}`).join('\n') + '\n其余字段请重新构思。\n';
    }
    const user = renderPrompt('wkb.craft', {
      tplName: tpl.name, fieldOutline: outline,
      tplGuide: tpl.guideId ? getPromptText(tpl.guideId) : '',
      desc, tone: s.tone, detail: detailLabel,
      withQuip: s.withQuip ? '产物末尾额外附一句打破第四面墙的俏皮吐槽点评。' : '不用额外加吐槽点评。',
      count: String(count), refBlock,
      sceneNote: _sceneNote.trim() ? '【本次临时情境】\n' + _sceneNote.trim() + '\n' : '',
    }) + lockNote;
    const out = await chatGenerate({
      system: user, user: desc || '（随机造一个）',
      jailbreak: getPromptText('wkb.jailbreak'),
      aiPresetName: s.aiPresetName || undefined,
    });
    const cands = splitCandidates(out).slice(0, count).map(c => parseProduct(c, tpl));
    if (opts.reroll) {
      // 重roll：替换当前候选（保留锁定字段值）
      const cur = curProduct();
      if (cur && cands[0]) {
        cands[0].fields.forEach(f => { if (_lockedFields.has(f.label)) { const old = cur.fields.find(x => x.label === f.label); if (old) f.value = old.value; } });
        // 用重roll结果替换列表中的那一项，保留其余候选
        _candidates = _candidates.map(x => x.id === cur.id ? cands[0] : x);
        _selProd = cands[0].id;
      }
    } else if (s.genMode === 'append') {
      // 增量：新候选追加到既有候选之后
      _candidates = [..._candidates, ...cands];
      _selProd = cands[0]?.id || _selProd;
    } else {
      // 覆盖：替换本次候选
      _candidates = cands;
      _selProd = cands[0]?.id || null;
    }
    persistCands();
    if (!cands.length) thToast('这次没造出东西，换个说法再试', 'warn');
  } catch (err) {
    thToast('造物失败：' + (err instanceof Error ? err.message : String(err)), 'error');
  } finally { _busy = false; render(); }
}
// PLACEHOLDER_WKB_GEN2
// ==================== 导航 helper ====================
function goForge(): void { _view = { name: 'forge' }; _promptEditId = null; render(); }
function patchSetCat(cat: SetCat): void {
  _setCat = cat;
  patchSettingsDetail({
    root: rootEl(), detailSel: '.thw-wkb-set-detail', navSel: '.thw-wkb-set-nav .thw-nav',
    navAttr: 'data-wkb-setcat', navOnClass: 'thw-nav-on', cat, html: settingsDetailHtml(),
    rebind: (detail) => {
      if (cat === 'ref' && isWorldbookAvailable()) { const h = detail.querySelector('[data-wkb-wbpick-host]') as HTMLElement | null; if (h) bindWbPicker(h, () => getWkbSettings().worldbookEntryKeys || [], (keys) => updateWkbSettings({ worldbookEntryKeys: keys })); }
    },
  });
}
// PLACEHOLDER_WKB_NAV
// ==================== 事件绑定 ====================
function bindRoot(): void {
  const root = rootEl();
  if (!root || (root as any)._wkbBound) return;
  (root as any)._wkbBound = true;
  root.addEventListener('click', (e) => { void onClick(e); });
  root.addEventListener('input', (e) => onInput(e));
  root.addEventListener('change', (e) => onChange(e));
}
async function onClick(e: Event): Promise<void> {
  const t = e.target as HTMLElement; if (!t) return;
  // —— 左栏导航 ——
  const tplBtn = t.closest('[data-wkb-tpl]') as HTMLElement | null;
  if (tplBtn) { _tplId = tplBtn.getAttribute('data-wkb-tpl') || _tplId; _view = { name: 'forge' }; _promptEditId = null; render(); return; }
  if (t.closest('[data-wkb-tpl-new]')) { await newTemplate(); return; }
  if (t.closest('[data-wkb-lib]')) { _view = { name: 'lib' }; _promptEditId = null; render(); return; }
  if (t.closest('[data-wkb-settings]')) { _view = { name: 'settings' }; _setCat = 'gen'; _promptEditId = null; render(); return; }
  // —— 设置分类切换（局部刷新）——
  const setcat = t.closest('[data-wkb-setcat]') as HTMLElement | null;
  if (setcat) { patchSetCat(setcat.getAttribute('data-wkb-setcat') as SetCat); return; }
  // —— 生成台 ——
  if (t.closest('[data-wkb-fieldedit]')) { _fieldEditOpen = !_fieldEditOpen; render(); return; }
  if (t.closest('[data-wkb-gen]')) { void doGenerate(); return; }
  if (t.closest('[data-wkb-lucky]')) { void doGenerate({ lucky: true }); return; }
  const eg = t.closest('[data-wkb-eg]') as HTMLElement | null;
  if (eg) { _desc = eg.getAttribute('data-wkb-eg') || ''; render(); return; }
  if (t.closest('[data-wkb-cands-clear]')) { _candidates = []; _selProd = null; clearCandidates(); render(); return; }
  const cand = t.closest('[data-wkb-cand]') as HTMLElement | null;
  if (cand) { _selProd = cand.getAttribute('data-wkb-cand'); _deliverPerson = null; _deliverPresent = null; _lockedFields.clear(); persistCands(); render(); return; }
  // —— 字段编辑器 ——
  if (await onFieldEditClick(t)) return;
  // —— 右栏产物 / 投递 ——
  if (await onOutClick(t)) return;
  // —— 产物库 ——
  if (await onLibClick(t)) return;
  // —— 设置内操作 ——
  if (await onSettingsClick(t)) return;
}
// PLACEHOLDER_WKB_CLICK
async function newTemplate(): Promise<void> {
  const name = await thPrompt({ title: '新建模板', message: '模板名称：', value: '' });
  if (name == null || !String(name).trim()) return;
  const t = addCustomTemplate(String(name).trim());
  _tplId = t.id; _view = { name: 'forge' }; _fieldEditOpen = true; render();
  thToast('已创建，去下方字段编辑器加字段', 'success');
}
async function onFieldEditClick(t: HTMLElement): Promise<boolean> {
  const tpl = curTpl();
  const delBtn = t.closest('[data-wkb-fe-del]') as HTMLElement | null;
  if (delBtn) { const i = Number(delBtn.getAttribute('data-wkb-fe-del')); const fs = tpl.fields.slice(); fs.splice(i, 1); setTemplateFields(tpl.id, fs); render(); return true; }
  if (t.closest('[data-wkb-fe-add]')) {
    const root = rootEl(); const inp = root?.querySelector('.thw-wkb-fe-newlabel') as HTMLInputElement | null;
    const label = inp?.value.trim() || ''; if (!label) { thToast('先填字段名', 'warn'); return true; }
    const key = 'f' + Date.now().toString(36);
    setTemplateFields(tpl.id, [...tpl.fields, { key, label }]); render(); return true;
  }
  if (t.closest('[data-wkb-fe-reset]')) { resetTemplateFields(tpl.id); render(); return true; }
  return false;
}
// PLACEHOLDER_WKB_FE_CLICK
async function onOutClick(t: HTMLElement): Promise<boolean> {
  // 返回：取消选中 → 回到三栏列表视图（在取 curProduct 之前处理）
  if (t.closest('[data-wkb-detback]')) { _selProd = null; persistCands(); render(); return true; }
  const p = curProduct(); if (!p) return false;
  // 人称 / 呈现体切换
  const pb = t.closest('[data-wkb-person]') as HTMLElement | null;
  if (pb) { _deliverPerson = pb.getAttribute('data-wkb-person') as WkbPerson; render(); return true; }
  const prb = t.closest('[data-wkb-present]') as HTMLElement | null;
  if (prb) { _deliverPresent = prb.getAttribute('data-wkb-present') as WkbPresent; render(); return true; }
  // 锁定字段
  const lk = t.closest('[data-wkb-lock]') as HTMLElement | null;
  if (lk) { const lbl = lk.getAttribute('data-wkb-lock') || ''; if (_lockedFields.has(lbl)) _lockedFields.delete(lbl); else _lockedFields.add(lbl); render(); return true; }
  // 收藏
  const fav = t.closest('[data-wkb-fav]') as HTMLElement | null;
  if (fav) { const id = fav.getAttribute('data-wkb-fav') || ''; if (getProduct(id)) toggleProductFav(id); else { doSave(p); toggleProductFav(_selProd || ''); } render(); return true; }
  // reroll
  if (t.closest('[data-wkb-reroll]')) { void doGenerate({ reroll: true, count: 1 }); return true; }
  // 投递
  if (t.closest('[data-wkb-deliver]')) { doDeliver(deliverText(p)); return true; }
  if (t.closest('[data-wkb-copy]')) { try { await navigator.clipboard.writeText(deliverText(p)); thToast('已复制', 'success'); } catch (e) { void e; thToast('复制失败', 'error'); } return true; }
  if (t.closest('[data-wkb-stash]')) { addToStash('wkb', p.title || p.templateName, deliverText(p)); thToast('已加入暂存篮', 'success'); render(); return true; }
  if (t.closest('[data-wkb-undo]')) { if (undoDelivery(_lastAppended)) { _lastAppended = ''; thToast('已撤销上次追加', 'info'); } else thToast('输入框已改动，无法撤销', 'warn'); render(); return true; }
  // 存库 / 私记 / 丢弃
  if (t.closest('[data-wkb-save]')) { doSave(p); thToast('已存入产物库', 'success'); render(); return true; }
  if (t.closest('[data-wkb-note]')) { const note = await thPrompt({ title: '私记', message: '只自己看的备注（不进投递）：', value: p.note || '', multiline: true }); if (note != null) { const id = getProduct(p.id) ? p.id : doSave(p); updateProduct(id, { note: String(note) }); render(); } return true; }
  if (t.closest('[data-wkb-discard]')) { _candidates = _candidates.filter(x => x.id !== p.id); if (getProduct(p.id)) deleteProduct(p.id); _selProd = null; persistCands(); render(); return true; }
  // 暂存篮
  if (t.closest('[data-wkb-stash-deliver]')) { const items = getStash('wkb'); if (items.length) { doDeliver(items.map(i => i.body).join('\n\n')); } return true; }
  if (t.closest('[data-wkb-stash-clear]')) { clearStash('wkb'); render(); return true; }
  const sd = t.closest('[data-wkb-stash-del]') as HTMLElement | null;
  if (sd) { removeStashItem('wkb', sd.getAttribute('data-wkb-stash-del') || ''); render(); return true; }
  return false;
}
// 存库：把临时候选写入产物库，返回正式 id 并更新选中
function doSave(p: WkbProduct): string {
  if (getProduct(p.id)) return p.id;
  const saved = addProduct({ templateId: p.templateId, templateName: p.templateName, title: p.title, fields: p.fields, extra: p.extra, note: p.note, tags: p.tags || [], fav: p.fav });
  _candidates = _candidates.map(x => x.id === p.id ? saved : x);
  if (_selProd === p.id) _selProd = saved.id;
  persistCands();
  return saved.id;
}
function doDeliver(text: string): void {
  const r = deliverToInputBox(text, getWkbSettings().pkgSep);
  if (r.ok) { _lastAppended = r.appended; thToast(`已塞进输入框（${r.chars} 字）`, 'success'); render(); }
  else thToast('未找到输入框，已尝试复制', 'warn');
}
// PLACEHOLDER_WKB_OUT_CLICK
async function onLibClick(t: HTMLElement): Promise<boolean> {
  const tag = t.closest('[data-wkb-lib-tag]') as HTMLElement | null;
  if (tag) { _libTag = tag.getAttribute('data-wkb-lib-tag') || ''; render(); return true; }
  if (t.closest('[data-wkb-lib-clear]')) {
    const ok = await thConfirm({ title: '清空产物库', message: '清空所有造过的东西？不可恢复。', danger: true, confirmText: '清空' });
    if (ok) { clearProducts(); _selProd = null; thToast('已清空', 'success'); render(); }
    return true;
  }
  return false;
}
async function onSettingsClick(t: HTMLElement): Promise<boolean> {
  // 提示词编辑
  const pe = t.closest('[data-wkb-pe]') as HTMLElement | null;
  if (pe) { _promptEditId = pe.getAttribute('data-wkb-pe'); render(); return true; }
  if (t.closest('[data-wkb-pe-close]')) { _promptEditId = null; _view = { name: 'settings' }; _setCat = 'prompt'; render(); return true; }
  if (t.closest('[data-wkb-pe-save]')) {
    const root = rootEl(); const ta = root?.querySelector('.thw-wkb-pe-text') as HTMLTextAreaElement | null;
    if (_promptEditId && ta) { setPromptOverride(_promptEditId, ta.value); thToast('已保存', 'success'); }
    return true;
  }
  if (t.closest('[data-wkb-pe-reset]')) {
    if (_promptEditId) { resetPrompt(_promptEditId); render(); thToast('已恢复默认', 'info'); }
    return true;
  }
  // 主题 / 字体
  const th = t.closest('[data-wkb-theme]') as HTMLElement | null;
  if (th) { updateWkbSettings({ theme: th.getAttribute('data-wkb-theme') || 'pink' }); render(); return true; }
  // 内置模板开关
  const bt = t.closest('[data-wkb-builtin]') as HTMLElement | null;
  if (bt) { const id = bt.getAttribute('data-wkb-builtin') || ''; setBuiltinEnabled(id, (bt as HTMLInputElement).checked); return true; }
  // 自定义模板改名/删
  const ren = t.closest('[data-wkb-cus-ren]') as HTMLElement | null;
  if (ren) { const id = ren.getAttribute('data-wkb-cus-ren') || ''; const cur = getTemplate(id); const name = await thPrompt({ title: '模板改名', message: '新名称：', value: cur?.name || '' }); if (name != null && String(name).trim()) { updateCustomTemplate(id, { name: String(name).trim() }); patchSetCat('tpl'); } return true; }
  const cdel = t.closest('[data-wkb-cus-del]') as HTMLElement | null;
  if (cdel) { const id = cdel.getAttribute('data-wkb-cus-del') || ''; const ok = await thConfirm({ title: '删除模板', message: '删除这个自定义模板？', danger: true, confirmText: '删除' }); if (ok) { deleteCustomTemplate(id); if (_tplId === id) _tplId = 'wkb.item'; patchSetCat('tpl'); } return true; }
  // 保存设置（gen/deliver）
  if (t.closest('[data-wkb-s-save]')) { saveGenDeliverSettings(); thToast('已保存', 'success'); return true; }
  // 导出产物库
  if (t.closest('[data-wkb-export]')) { exportLib(); return true; }
  // API 利用面板（委托）
  if (t.closest('[data-apiplan-app]') && bindApiPlanPanel({ target: t } as unknown as Event)) return true;
  // AI 重写提示词（data-aipe-gen）
  if (_promptEditId && bindAiPromptEditor({ target: t } as unknown as Event, () => (rootEl()?.querySelector('.thw-wkb-pe-text') as HTMLTextAreaElement)?.value || '', (txt) => { const ta = rootEl()?.querySelector('.thw-wkb-pe-text') as HTMLTextAreaElement | null; if (ta) ta.value = txt; })) return true;
  return false;
}
// PLACEHOLDER_WKB_SET_CLICK
function saveGenDeliverSettings(): void {
  const root = rootEl(); if (!root) return;
  const val = (sel: string): string | null => { const el = root.querySelector(sel) as HTMLInputElement | HTMLSelectElement | null; return el ? el.value : null; };
  const chk = (sel: string): boolean | null => { const el = root.querySelector(sel) as HTMLInputElement | null; return el ? el.checked : null; };
  const patch: Partial<WkbSettings> = {};
  const tone = val('.thw-wkb-s-tone'); if (tone != null) patch.tone = tone;
  const detail = val('.thw-wkb-s-detail'); if (detail != null) patch.detail = detail as WkbSettings['detail'];
  const quip = chk('.thw-wkb-s-quip'); if (quip != null) patch.withQuip = quip;
  const genmode = val('.thw-wkb-s-genmode'); if (genmode != null) patch.genMode = genmode as WkbSettings['genMode'];
  const batch = val('.thw-wkb-s-batch'); if (batch != null) { const n = Number(batch); if (Number.isFinite(n)) patch.batchCount = Math.min(5, Math.max(1, Math.floor(n))); }
  const person = val('.thw-wkb-s-person'); if (person != null) patch.person = person as WkbPerson;
  const present = val('.thw-wkb-s-present'); if (present != null) patch.present = present as WkbPresent;
  const self = val('.thw-wkb-s-self'); if (self != null) patch.selfName = self.trim();
  const other = val('.thw-wkb-s-other'); if (other != null) patch.otherName = other.trim();
  const prev = chk('.thw-wkb-s-preview'); if (prev != null) patch.alwaysPreview = prev;
  const beyond = chk('.thw-wkb-s-beyond'); if (beyond != null) patch.allowBeyondInput = beyond;
  const pkgLabel = val('.thw-wkb-s-pkglabel'); if (pkgLabel != null) patch.pkgLabel = pkgLabel;
  const pkgPrefix = val('.thw-wkb-s-pkgprefix'); if (pkgPrefix != null) patch.pkgPrefix = pkgPrefix;
  const pkgSuffix = val('.thw-wkb-s-pkgsuffix'); if (pkgSuffix != null) patch.pkgSuffix = pkgSuffix;
  const pkgSep = val('.thw-wkb-s-pkgsep'); if (pkgSep != null) patch.pkgSep = pkgSep as WkbSettings['pkgSep'];
  updateWkbSettings(patch);
}
function exportLib(): void {
  try {
    const blob = new Blob([JSON.stringify(listProducts(), null, 2)], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `工作台产物库_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
    thToast('已导出产物库', 'success');
  } catch (e) { void e; thToast('导出失败', 'error'); }
}
// PLACEHOLDER_WKB_SAVE
function onInput(e: Event): void {
  const t = e.target as HTMLElement; if (!t) return;
  // 生成台草稿（不 render，避免失焦）
  if (t.classList.contains('thw-wkb-desc')) { _desc = (t as HTMLTextAreaElement).value; return; }
  if (t.classList.contains('thw-wkb-scene')) { _sceneNote = (t as HTMLInputElement).value; return; }
  // 产物字段就地改（写候选/库产物，不 render，实时反映到投递预览）
  const fv = t.closest('[data-wkb-fval]') as HTMLTextAreaElement | null;
  if (fv) {
    const i = Number(fv.getAttribute('data-wkb-fval')); const p = curProduct();
    if (p && p.fields[i]) {
      p.fields[i].value = fv.value;
      if (getProduct(p.id)) updateProduct(p.id, { fields: p.fields });
      else persistCands();
      // 更新投递预览框（不整树重渲）
      const box = rootEl()?.querySelector('[data-wkb-delivbox]') as HTMLElement | null;
      if (box) box.textContent = deliverText(p);
    }
    return;
  }
  // 字段编辑器 label/desc（写模板，不 render）
  const feLabel = t.closest('[data-wkb-fe-label]') as HTMLInputElement | null;
  const feDesc = t.closest('[data-wkb-fe-desc]') as HTMLInputElement | null;
  if (feLabel || feDesc) {
    const tpl = curTpl(); const fs = tpl.fields.slice();
    if (feLabel) { const i = Number(feLabel.getAttribute('data-wkb-fe-label')); if (fs[i]) fs[i] = { ...fs[i], label: feLabel.value }; }
    if (feDesc) { const i = Number(feDesc.getAttribute('data-wkb-fe-desc')); if (fs[i]) fs[i] = { ...fs[i], desc: feDesc.value }; }
    setTemplateFields(tpl.id, fs); return;
  }
  // 产物库搜索
  if (t.classList.contains('thw-wkb-lib-search')) { _libQuery = (t as HTMLInputElement).value; const grid = rootEl()?.querySelector('.thw-wkb-libgrid'); if (grid) render(); return; }
}
function onChange(e: Event): void {
  const t = e.target as HTMLElement; if (!t) return;
  if (t.getAttribute('data-wkb-ref') != null) { _refMode = (t as HTMLSelectElement).value as typeof _refMode; return; }
  if (t.classList.contains('thw-wkb-tone')) { updateWkbSettings({ tone: (t as HTMLSelectElement).value }); return; }
  if (t.classList.contains('thw-wkb-count')) { updateWkbSettings({ batchCount: Number((t as HTMLSelectElement).value) || 1 }); return; }
  if (t.classList.contains('thw-wkb-s-font')) { updateWkbSettings({ font: (t as HTMLSelectElement).value }); render(); return; }
  if (t.classList.contains('thw-wkb-s-builtin')) { const id = t.getAttribute('data-wkb-builtin') || ''; setBuiltinEnabled(id, (t as HTMLInputElement).checked); return; }
  if (_view.name === 'settings' && _setCat === 'api') { bindApiPlanPanelChange(e); return; }
}
// PLACEHOLDER_WKB_INPUT
// ==================== API 利用登记 ====================
registerApiPlan({
  appId: 'wkb', appName: '工作台',
  features: [
    { id: 'craft', name: '造物生成', desc: '按模板+描述生成结构化产物（工作台唯一的生成动作）', defaultOn: true, standalone: true },
  ],
  counts: [
    { key: 'batch', name: '候选数量', desc: '一次生成几个候选供挑选', def: 1, min: 1, max: 5 },
  ],
  triggers: [
    { btn: '生成 / 手气不错 / 再来一个', icon: 'fa-wand-magic-sparkles', feats: ['craft'], counts: ['batch'] },
  ],
});

// ==================== 入口 ====================
function openApp(): void {
  openModal2(`${iconHtml('fa-hammer')} 工作台`, phoneShellHtml({ rid: RID, appClass: 'th-wkb' }), {
    maxWidth: WKB_MODAL_MAXW, reset: true, revive: openApp, phone: true,
  });
  startPhoneClock();
  bindRoot();
  render();
}
export function openWorkbench(): void {
  _view = { name: 'forge' }; _tplId = 'wkb.item';
  const restored = readCandidates();
  _candidates = restored.candidates || [];
  _selProd = restored.selProd || null;
  _desc = ''; _sceneNote = ''; _refMode = 'off'; _fieldEditOpen = false; _promptEditId = null;
  _deliverPerson = null; _deliverPresent = null; _lockedFields.clear();
  openApp();
}
// 注册为独立 app（悬浮球桌面出图标）。order 160，记忆(150) 之后。
registerWorldApp({
  id: 'wkb', name: '工作台', icon: 'fa-hammer',
  accent: 'linear-gradient(135deg,#c06fb0,#8e3f7e)', order: 160, open: openWorkbench,
});
// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_wkb__ = { openWorkbench };
} catch (e) { void e; }
// 抑制未使用告警（保留给后续扩展）
void updateProduct; void goForge; void listContactsForApp;






















