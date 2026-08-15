import { esc, escAttr, qs, qs2 } from '../../lib/dom-utils';
import { openModal2 } from '../../status-bar-init';
import { phoneShellHtml, startPhoneClock, pickImageFile } from '../../lib/world/phone-shell';
import { iconHtml } from '../../lib/icons';
import { registerWorldApp, getWorldConfig, saveWorldConfig, getWorldApp, type GenderMode } from '../../lib/world/world-store';
import { thToast, thConfirm } from '../../lib/world/ui-kit';
import { getTavernUserPersona } from '../../lib/tavern-api';
import {
  getWorldApiPresets, getActiveWorldApiName, setActiveWorldApiName, getWorldApiPreset,
  upsertWorldApiPreset, deleteWorldApiPreset, addWorldApiPreset, isWorldApiConfigured,
  importFromStatusBar, listStatusBarApiPresets, fetchWorldApiModels, testWorldApi,
  type WorldApiPreset, type SamplingVal,
} from '../../lib/world/world-api';
import {
  getGlobalReadConfig, setGlobalReadConfig, DEFAULT_EXCLUDE_TAGS, DEFAULT_EXTRACT_TAGS, type ExcludeTag, type ExtractTag,
} from '../../lib/world/read-config';
import { wbPickerHtml, bindWbPicker } from '../../lib/world/wb-picker';
import { getTavernFloorCount } from '../../lib/world/ai-chat';
import { isWorldbookAvailable } from '../../lib/world/worldbook';
import {
  getContacts, getContact, upsertContact, deleteContact, getUserContact,
  DEFAULT_APPEARANCE, type WorldContact,
} from '../../lib/world/contacts';
import {
  qualityHubListHtml, bindQualityHubToggle, promptEditPanelHtml, bindPromptPanelClick,
} from './world-app-settings';
import { QUALITY_APP_ID, getCustomQualityBlocks, addCustomQualityBlock, updateCustomQualityBlock, deleteCustomQualityBlock } from '../../lib/world/world-prompts';
import { getWriterPersonaCfg, setWriterPersonaOn, setWriterPersonaSegText, resetWriterPersona, getWriterPersonaSegments, isWriterPersonaSegOverridden, WRITER_PERSONA_DEFAULT_NAME } from '../../lib/world/world-writer-persona';
import { getAutoAgents, isAutoStopped, setAutoStopped, getAutoAgent } from '../../lib/world/auto-registry';

const SET_MODAL_MAXW = 'min(1040px,97vw)';
const RID = 'th-settings-app-root';
let _busy = false;
// 清空数据——按 app 复选清理。每个 app 声明其「内容数据」LS key（不含接口/读取/提示词等共享配置）。
//   记忆会话/角色池是跨 app 的（按会话/联系人 id 存），不随单 app 清；各 app 自己的「数据管理」页可清自身。
//   图标不写死——用各 app 在注册表里的真实图标（保证已在 icons.ts 登记、桌面同款渲染）；缺失兜底通用图标。
const APP_DATA_KEYS: { id: string; name: string; keys: string[] }[] = [
  { id: 'wechat', name: '微信', keys: ['_th_world_wechat_v1'] },
  { id: 'weibo', name: '微博', keys: ['_th_world_weibo_v1'] },
  { id: 'forum', name: '世界论坛', keys: ['_th_world_forum_v1'] },
  { id: 'zui', name: '最右', keys: ['_th_world_zui_v1'] },
  { id: 'call', name: '通话', keys: ['_th_world_call_v1'] },
  { id: 'tangxin', name: '糖心直播', keys: ['_th_world_tangxin_v1'] },
  { id: 'bili', name: 'B站', keys: ['_th_world_bili_v1'] },
  { id: 'xmly', name: '喜马拉雅', keys: ['_th_world_xmly_v1'] },
  { id: 'red', name: '小红书', keys: ['_th_world_red_v1'] },
  { id: 'taobao', name: '淘宝', keys: ['_th_world_taobao_v1'] },
  { id: 'meituan', name: '美团', keys: ['_th_world_meituan_v1'] },
  { id: 'fanfan', name: '饭饭', keys: ['_th_world_fanfan_v1'] },
  { id: 'browser', name: '浏览器', keys: ['_th_world_browser_v1'] },
  { id: 'cal', name: '日历', keys: ['_th_world_cal_v1'] },
  { id: 'diary', name: '日记', keys: ['_th_world_diary_v1'] },
  { id: 'theater', name: '小剧场', keys: ['_th_world_theater_v1'] },
  { id: 'wkb', name: '工作台', keys: ['_th_world_wkb_v1'] },
  { id: 'evolution', name: '世界演化', keys: ['_th_world_evolution_v1', '_th_world_wstate_v1', '_th_world_places_v1'] },
];
function wipeAppIcon(id: string): string { return getWorldApp(id)?.icon || 'fa-cube'; }
const _wipeSel = new Set<string>();  // 勾选待清空的 app id

type Cat = 'api' | 'read' | 'contacts' | 'world' | 'auto' | 'quality' | 'image' | 'theme' | 'data' | 'about';
const CATS: { id: Cat; icon: string; label: string; sub: string }[] = [
  { id: 'api', icon: 'fa-plug', label: 'API 接口', sub: '套件专用连接' },
  { id: 'read', icon: 'fa-book-open', label: '读取管理', sub: '字数上限 / 排除标签 / 世界书' },
  { id: 'contacts', icon: 'fa-address-book', label: '通讯录', sub: '全套件人物档案' },
  { id: 'world', icon: 'fa-venus', label: '全局生态', sub: '性别 / 图片字数' },
  { id: 'auto', icon: 'fa-bolt', label: '自动触发', sub: '各 app 楼层自动 / 急停总闸' },
  { id: 'quality', icon: 'fa-feather', label: '写作质感', sub: '去 AI 腔·全局共享' },
  { id: 'image', icon: 'fa-image', label: '文生图', sub: 'comfyui 后端' },
  { id: 'theme', icon: 'fa-palette', label: '主题外观', sub: '桌面皮肤' },
  { id: 'data', icon: 'fa-database', label: '数据管理', sub: '导出 / 清理' },
  { id: 'about', icon: 'fa-circle-info', label: '关于', sub: '版本与说明' },
];

let _cat: Cat = 'api';
// 写作质感二级状态：null=列表 / {id}=编辑已登记块（复用 promptEditPanelHtml） / {custom:id}=编辑自定义块
let _qualityEdit: { id: string } | null = null;
let _qualityCustomEdit: { id: string } | null = null;
// 通讯录二级状态：列表 / 编辑某人（id 为空=新建）
let _contactEdit: { id: string | null } | null = null;
let _ctWbKeys: string[] = [];   // 当前编辑人物绑定的世界书条目（随表单临时态，保存时落库）
// API 编辑选中的预设名
let _apiSel = '';
let _modelCache: string[] = [];

function rootEl(): HTMLElement | null { return qs<HTMLElement>('#' + RID); }

// ==================== 共享小组件 ====================
function switchRow(label: string, hint: string, cls: string, on: boolean, disabled = false): string {
  return `<label class="thw-switchrow"><span class="thw-switchrow-main"><b>${label}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</span>
    <span class="thw-switch"><input type="checkbox" class="${cls}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="thw-switch-track"></span></span></label>`;
}

// __SETTINGS_PANELS__

// ==================== API 接口分区 ====================
function samplingInput(label: string, cls: string, val: SamplingVal): string {
  const isNum = typeof val === 'number';
  return `<label class="thw-field thw-set-sampling"><div class="thw-flabel">${esc(label)}</div>
    <div class="thw-set-samprow">
      <select class="thw-input thw-set-sampmode" data-samp-for="${cls}">
        <option value="same_as_preset" ${val === 'same_as_preset' ? 'selected' : ''}>预设默认</option>
        <option value="unset" ${val === 'unset' ? 'selected' : ''}>不设置</option>
        <option value="custom" ${isNum ? 'selected' : ''}>自定义</option>
      </select>
      <input type="number" step="0.01" class="thw-input ${cls}" value="${isNum ? esc(String(val)) : ''}" ${isNum ? '' : 'disabled'} style="width:100px">
    </div></label>`;
}
// API 编辑区（预设列表 + 编辑表单）。拆出来便于「切预设/拉模型/保存」只局部替换，避免整页重渲染闪烁。
function apiLayoutHtml(): string {
  const presets = getWorldApiPresets();
  if (!_apiSel || !presets.some(p => p.name === _apiSel)) _apiSel = getActiveWorldApiName();
  const p = getWorldApiPreset(_apiSel) || presets[0];
  const active = getActiveWorldApiName();
  const sbList = listStatusBarApiPresets();
  const presetRows = presets.map(x => `<button class="thw-set-apipreset${x.name === _apiSel ? ' on' : ''}" data-api-sel="${escAttr(x.name)}" type="button">
    <span class="thw-set-apidot${x.name === active ? ' active' : ''}"></span>
    <span class="thw-set-apiname">${esc(x.name)}</span>
    ${x.apiurl ? '' : `<span class="thw-tag thw-set-warn">未配置</span>`}
  </button>`).join('');
  const modelOpts = _modelCache.length
    ? `<datalist id="th-set-models">${_modelCache.map(m => `<option value="${escAttr(m)}">`).join('')}</datalist>` : '';
  return `<div class="thw-set-apilayout">
        <div class="thw-set-apilist">
          <div class="thw-set-subhead">连接预设</div>
          ${presetRows}
          <div class="thw-set-apilist-acts">
            <button class="thw-btn thw-btn-mini" data-api-add type="button">${iconHtml('fa-plus')} 新建</button>
            ${sbList.length ? `<button class="thw-btn thw-btn-mini" data-api-import type="button" title="复制状态栏已有的 ${sbList.length} 套预设过来">${iconHtml('fa-download')} 从状态栏导入</button>` : ''}
          </div>
        </div>

        <div class="thw-set-apiedit">
          <div class="thw-set-apiedit-head">
            <input type="text" class="thw-input thw-set-api-name" value="${escAttr(p.name)}" placeholder="预设名">
            <button class="thw-btn thw-btn-mini ${p.name === active ? 'thw-btn-primary' : ''}" data-api-activate type="button">${p.name === active ? iconHtml('fa-check') + ' 当前活动' : '设为活动'}</button>
            <button class="thw-iconbtn thw-set-api-del" data-api-del type="button" title="删除此预设">${iconHtml('fa-trash')}</button>
          </div>
          <div class="thw-set-grid2">
            <label class="thw-field"><div class="thw-flabel">API 源</div><input type="text" class="thw-input thw-set-api-source" value="${escAttr(p.source)}" placeholder="openai"></label>
            <label class="thw-field"><div class="thw-flabel">Base URL</div><input type="text" class="thw-input thw-set-api-url" value="${escAttr(p.apiurl)}" placeholder="https://api.example.com/v1"></label>
          </div>
          <label class="thw-field"><div class="thw-flabel">API Key</div><input type="password" class="thw-input thw-set-api-key" value="${escAttr(p.key)}" placeholder="sk-…" autocomplete="off"></label>
          <label class="thw-field"><div class="thw-flabel">模型 <button class="thw-btn thw-btn-mini thw-set-inlinebtn" data-api-models type="button">${iconHtml('fa-rotate')} 拉取列表</button></div>
            <input type="text" class="thw-input thw-set-api-model" value="${escAttr(p.model)}" placeholder="gpt-4o / claude-… " list="th-set-models">${modelOpts}</label>
          <details class="thw-set-advanced"><summary>采样参数（高级）</summary>
            <div class="thw-set-grid2">
              ${samplingInput('温度 temperature', 'thw-set-api-temp', p.temperature)}
              ${samplingInput('最大 tokens', 'thw-set-api-maxtok', p.max_tokens)}
              ${samplingInput('top_p', 'thw-set-api-topp', p.top_p)}
              ${samplingInput('top_k', 'thw-set-api-topk', p.top_k)}
              ${samplingInput('频率惩罚', 'thw-set-api-freq', p.frequency_penalty)}
              ${samplingInput('存在惩罚', 'thw-set-api-pres', p.presence_penalty)}
            </div>
          </details>
          <div class="thw-set-apiedit-foot">
            <button class="thw-btn" data-api-test type="button">${iconHtml('fa-paper-plane')} 连接测试</button>
            <button class="thw-btn-primary" data-api-save type="button">${iconHtml('fa-check')} 保存预设</button>
          </div>
        </div>
      </div>`;
}
// 只刷新 API 编辑区（切预设/拉模型/保存不整页重渲染，去除闪烁）。
function refreshApiLayout(): void {
  const host = rootEl()?.querySelector('[data-api-host]') as HTMLElement | null;
  if (host) host.innerHTML = apiLayoutHtml();
  const chip = rootEl()?.querySelector('[data-api-statuschip]') as HTMLElement | null;
  if (chip) { const ok = isWorldApiConfigured(); chip.className = `thw-set-statuschip ${ok ? 'ok' : 'bad'}`; chip.innerHTML = `${iconHtml(ok ? 'fa-circle-check' : 'fa-triangle-exclamation')} ${ok ? '已就绪' : '未配置'}`; }
}
function apiPanel(): string {
  const configured = isWorldApiConfigured();
  return `<div class="thw-content thw-set-content">
    <div class="thw-topbar"><span class="thw-eyebrow">${iconHtml('fa-plug')} API 接口</span>
      <span class="thw-set-statuschip ${configured ? 'ok' : 'bad'}" data-api-statuschip>${iconHtml(configured ? 'fa-circle-check' : 'fa-triangle-exclamation')} ${configured ? '已就绪' : '未配置'}</span></div>
    <div class="thw-content-pad thw-view-in">
      <div class="thw-set-hint">${iconHtml('fa-shield-halved')} 套件 API 与外部状态栏 API <b>完全独立</b>：所有 app 的生成只走这里配置的接口，互不影响。</div>
      <div data-api-host>${apiLayoutHtml()}</div>
    </div>
  </div>`;
}

// __SETTINGS_PANELS_2__

// ==================== 读取管理分区 ====================
// 排除标签行（每行一对 head/tail，可删；可直接改 head/tail 输入框即时落库）。
function excludeTagsRows(tags: ExcludeTag[]): string {
  if (!tags || !tags.length) return `<div class="thw-set-extags-empty">未设置排除标签（读取正文时不剔除任何结构）。</div>`;
  return tags.map((tg, i) => `<div class="thw-set-extag-row" data-extag-i="${i}">
    <input type="text" class="thw-input thw-set-extag-h" data-extag-edit="head" value="${escAttr(tg.head)}" placeholder="&lt;XXX&gt;">
    <span class="thw-set-extag-dots">…</span>
    <input type="text" class="thw-input thw-set-extag-t" data-extag-edit="tail" value="${escAttr(tg.tail)}" placeholder="&lt;/XXX&gt;">
    <button class="thw-iconbtn thw-set-extag-del" data-extag-del="${i}" type="button" title="删除">${iconHtml('fa-trash')}</button>
  </div>`).join('');
}
function refreshExcludeTags(): void {
  const host = rootEl()?.querySelector('[data-set-extags]') as HTMLElement | null;
  if (host) host.innerHTML = excludeTagsRows(getGlobalReadConfig().excludeTags || []);
}
// 提取标签行（双保险·先跑）：每行一对 head/tail，必须成对；可删、可即时改。
function extractTagsRows(tags: ExtractTag[]): string {
  if (!tags || !tags.length) return `<div class="thw-set-extags-empty">未设置提取标签（不启用提取，直接走下方排除规则）。</div>`;
  return tags.map((tg, i) => `<div class="thw-set-extag-row" data-xtag-i="${i}">
    <input type="text" class="thw-input thw-set-extag-h" data-xtag-edit="head" value="${escAttr(tg.head)}" placeholder="&lt;content&gt;">
    <span class="thw-set-extag-dots">…</span>
    <input type="text" class="thw-input thw-set-extag-t" data-xtag-edit="tail" value="${escAttr(tg.tail)}" placeholder="&lt;/content&gt;">
    <button class="thw-iconbtn thw-set-extag-del" data-xtag-del="${i}" type="button" title="删除">${iconHtml('fa-trash')}</button>
  </div>`).join('');
}
function refreshExtractTags(): void {
  const host = rootEl()?.querySelector('[data-set-xtags]') as HTMLElement | null;
  if (host) host.innerHTML = extractTagsRows(getGlobalReadConfig().extractTags || []);
}
function readPanel(): string {
  const c = getGlobalReadConfig();
  const wbReady = isWorldbookAvailable();
  return `<div class="thw-content thw-set-content">
    <div class="thw-topbar"><span class="thw-eyebrow">${iconHtml('fa-book-open')} 读取管理</span></div>
    <div class="thw-content-pad thw-view-in">
      <div class="thw-set-hint">${iconHtml('fa-circle-info')} <b>读不读正文、读最近几楼，由各 app 在自己的设置里决定。</b>这里只管全局的读取<b>裁剪</b>：字数上限 + 结构标签剔除，对所有 app 统一生效。</div>
      <div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-align-left')} 读取裁剪（全局）</span></div>
        <div class="thw-field"><div class="thw-flabel">最大读取字数 <small>0=不限；防止把状态栏 JSON 等长文塞爆</small></div>
          <input type="number" min="0" max="20000" step="500" class="thw-input thw-set-read-maxchars" value="${esc(String(c.maxChars))}"></div>
      </div>
      <div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-crop-simple')} 提取标签 <small>双保险·先跑：只保留这些标签内的正文</small></span></div>
        <div class="thw-set-hint">若正文正常包在某对标签里（默认 <code>&lt;content&gt;</code>），这里配上它，读取时<b>只提取标签内的内容</b>，标签外的结构块（状态栏/推演/JSON 等）天然被挡在外面——比逐个排除更保险。<b>必须成对闭合</b>；找不到闭合尾标签则不生效，自动退回下方排除规则。没被任何提取标签包裹的楼层（如你的输入）会原样保留、再走排除。</div>
        <div class="thw-set-extags" data-set-xtags>${extractTagsRows(c.extractTags || [])}</div>
        <div class="thw-set-extags-add">
          <input type="text" class="thw-input thw-set-xtag-head" placeholder="头标签，如 &lt;content&gt;">
          <input type="text" class="thw-input thw-set-xtag-tail" placeholder="尾标签，如 &lt;/content&gt;">
          <button class="thw-btn thw-btn-mini thw-btn-primary" data-xtag-add type="button">${iconHtml('fa-plus')} 添加</button>
          <button class="thw-btn thw-btn-mini" data-xtag-reset type="button" title="恢复默认提取标签">${iconHtml('fa-rotate-left')} 默认</button>
        </div>
      </div>
      <div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-scissors')} 排除标签 <small>后跑：从读取的正文里剔除这些结构块，防止撑爆字数</small></span></div>
        <div class="thw-set-hint">读取正文时，下列「头标签 … 尾标签」之间的内容会被整段抠掉（不计入字数、不喂给 AI）。常见如 <code>&lt;think&gt;</code>、<code>&lt;summary&gt;</code>、状态栏结构等。含孤儿闭合标签兜底（开标签丢失的畸形块也能清）。</div>
        <div class="thw-set-extags" data-set-extags>${excludeTagsRows(c.excludeTags)}</div>
        <div class="thw-set-extags-add">
          <input type="text" class="thw-input thw-set-extag-head" placeholder="头标签，如 &lt;think&gt;">
          <input type="text" class="thw-input thw-set-extag-tail" placeholder="尾标签，如 &lt;/think&gt;">
          <button class="thw-btn thw-btn-mini thw-btn-primary" data-extag-add type="button">${iconHtml('fa-plus')} 添加</button>
          <button class="thw-btn thw-btn-mini" data-extag-reset type="button" title="恢复默认排除标签">${iconHtml('fa-rotate-left')} 默认</button>
        </div>
      </div>
      <div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-book')} 世界书条目作为上下文</span></div>
        <div class="thw-set-hint">${wbReady ? '勾选的世界书条目会作为全局上下文供各 app 生成参考（可跨多本书混选）。' : '当前环境无世界书接口。'}</div>
        <div class="thw-set-wbpick" data-set-wbpick-host>${wbReady ? wbPickerHtml(c.ctxWbKeys || []) : ''}</div>
      </div>
    </div>
  </div>`;
}

// ==================== 全局生态分区（性别 / 图片字数，全 app 同步）====================
function worldPanel(): string {
  const c = getWorldConfig();
  const g = c.gender;
  const d = c.imageDesc;
  const modeOpt = (v: GenderMode, label: string) => `<option value="${v}" ${g.mode === v ? 'selected' : ''}>${label}</option>`;
  const male = Math.max(0, Math.min(100, g.malePercent));
  const chipLabel = g.mode === 'allFemale' ? '全女性（默认）'
    : g.mode === 'ratio' ? `女${100 - male}% / 男${male}%`
    : g.mode === 'custom' ? '自定义'
    : '全女性（默认）';
  return `<div class="thw-content thw-set-content">
    <div class="thw-topbar"><span class="thw-eyebrow">${iconHtml('fa-venus')} 全局生态</span>
      <span class="thw-set-statuschip ${g.mode === 'allFemale' ? 'ok' : ''}">${chipLabel}</span></div>
    <div class="thw-content-pad thw-view-in">
      <div class="thw-set-hint">${iconHtml('fa-circle-info')} 这里的设置<b>全局生效、同步到所有 app</b>（含浏览器）。改完下一轮 AI 生成即按新设置走，无需逐 app 调整。</div>

      <div class="thw-sec">
        <div class="thw-sec-title">${iconHtml('fa-venus-mars')} 互动用户性别</div>
        <div class="thw-set-hint">本卡世界观默认<b>全女性（百合GL）</b>。如需让互动人物/路人混入男性，选「男女按比例混合」并拖动滑条；要更精细的设定可用「自定义」。</div>
        <label class="thw-field"><div class="thw-flabel">性别模式 <small>选哪个模式，下方就只有该模式的设置生效</small></div>
          <select class="thw-select thw-set-gender-mode">
            ${modeOpt('allFemale', '全女性（默认·百合GL）')}
            ${modeOpt('ratio', '男女按比例混合')}
            ${modeOpt('custom', '自定义性别生态')}
          </select></label>
        <div class="thw-field" data-set-gender-ratio ${g.mode === 'ratio' ? '' : 'hidden'}>
          <div class="thw-flabel">男女比例 <small>本模式下，全 app 的人物/路人就按这根滑条的比例生成</small></div>
          <div class="thw-set-gender-scale"><span class="thw-set-gender-scale-f">♀ 女 <b class="thw-set-gender-fempct-lbl">${100 - male}%</b></span><span class="thw-set-gender-scale-m"><b class="thw-set-gender-pct-lbl">${male}%</b> 男 ♂</span></div>
          <input type="range" min="0" max="100" step="5" class="thw-range thw-set-gender-pct" value="${male}">
          <div class="thw-set-hint thw-set-gender-preview">${iconHtml('fa-circle-info')} 0% = 等同全女性；100% = 全为男性；中间则按比例混合出场。</div>
        </div>
        <label class="thw-field" data-set-gender-custom ${g.mode === 'custom' ? '' : 'hidden'}>
          <div class="thw-flabel">自定义性别生态 <small>直接写进各 app 提示词，如「以女性为主，偶有少量男性配角」</small></div>
          <textarea class="thw-textarea thw-set-gender-custom-txt" rows="3" placeholder="描述你想要的性别构成…">${esc(g.customText)}</textarea>
        </label>
        <div class="thw-set-foot"><button class="thw-btn-primary" data-set-gender-save type="button">${iconHtml('fa-check')} 保存性别设置</button></div>
      </div>

      <div class="thw-sec">
        <div class="thw-sec-title">${iconHtml('fa-image')} 图片描述字数</div>
        <div class="thw-set-hint">各 app 的图片（糖心画面/封面、B站/小红书封面、淘宝/美团商品图等）在未接文生图时以<b>中文画面描述</b>呈现。在此自定义描述篇幅，全 app 统一生效。</div>
        <div class="thw-set-imgwords-row">
          <label class="thw-field"><div class="thw-flabel">最少字数</div><input type="number" min="1" max="400" class="thw-input thw-set-imgwords-min" value="${esc(String(d.minWords))}"></label>
          <label class="thw-field"><div class="thw-flabel">最多字数</div><input type="number" min="1" max="400" class="thw-input thw-set-imgwords-max" value="${esc(String(d.maxWords))}"></label>
        </div>
        <div class="thw-set-foot"><button class="thw-btn-primary" data-set-imgwords-save type="button">${iconHtml('fa-check')} 保存图片字数</button></div>
      </div>
    </div>
  </div>`;
}
// 世界全局「写手人格」——可选的人格锚定破限，开启后按 role/位置拼进所有世界 app 生成。展示于「写作质感」顶部。
// 按 role(system/user/assistant)+位置(头部/尾部追加) 分段列表编辑。
const _WP_ROLE_LABEL: Record<string, string> = { system: '系统', user: '用户', assistant: '助手' };
const _WP_POS_LABEL: Record<string, string> = { head: '头部', append: '尾部追加' };
function writerPersonaSecHtml(): string {
  const cfg = getWriterPersonaCfg();
  const on = cfg.on;
  const segs = getWriterPersonaSegments();
  const anyCustom = segs.some(s => isWriterPersonaSegOverridden(s.id));
  const segRow = (s: { id: string; role: string; pos: string; name: string; text: string }) => {
    const ov = isWriterPersonaSegOverridden(s.id);
    return `<details class="thw-set-wpseg" data-wpseg="${escAttr(s.id)}">
      <summary><span class="thw-set-wpseg-role thw-set-wpseg-role-${s.role}">${_WP_ROLE_LABEL[s.role] || s.role}</span>
        <span class="thw-set-wpseg-pos">${_WP_POS_LABEL[s.pos] || s.pos}</span>
        <span class="thw-set-wpseg-name">${esc(s.name)}</span>
        ${ov ? '<span class="thw-set-wpseg-ov">已改</span>' : ''}</summary>
      <textarea class="thw-textarea thw-set-wpseg-text" data-wpseg-text="${escAttr(s.id)}" rows="5" placeholder="留空＝恢复本段默认">${esc(s.text)}</textarea>
      <div class="thw-set-foot">
        <button class="thw-btn thw-btn-mini" data-wpseg-reset="${escAttr(s.id)}" type="button">${iconHtml('fa-rotate-left')} 本段默认</button>
        <button class="thw-btn thw-btn-mini thw-btn-primary" data-wpseg-save="${escAttr(s.id)}" type="button">${iconHtml('fa-check')} 保存本段</button>
      </div>
    </details>`;
  };
  return `<div class="thw-sec thw-set-wp">
    <div class="thw-set-wp-head">
      <div class="thw-sec-title">${iconHtml('fa-feather-pointed')} 写手人格（可选）</div>
      <span class="thw-set-statuschip${on ? ' ok' : ''}">${on ? '已启用' : '默认关'}</span>
      <button class="th-wapp-ql-sw${on ? ' on' : ''}" role="switch" aria-checked="${on}" data-set-wp-toggle type="button" title="启用写手人格锚定"><i></i></button>
    </div>
    <div class="thw-set-hint">开启后，一套<b>「${esc(WRITER_PERSONA_DEFAULT_NAME)}」</b>人格锚定会按 system / 用户 / 助手 分段拼进所有世界 app 的生成：<b>头部</b>段在各 app 破限之前，<b>尾部追加</b>段在你的输入之后。与各 app 自带破限、主面板破限彼此独立。支持 {{user}}/{{random::a,b}} 本地展开。</div>
    <details class="thw-set-wp-adv" data-set-wp-editwrap ${on ? '' : 'hidden'}>
      <summary>${iconHtml('fa-pen')} 分段编辑（${segs.length} 段）· <span>${anyCustom ? '已自定义' : '全部默认'}</span></summary>
      <div class="thw-set-wpsegs">${segs.map(segRow).join('')}</div>
      <div class="thw-set-foot" style="justify-content:flex-start">
        <button class="thw-btn thw-btn-mini" data-set-wp-resetall type="button">${iconHtml('fa-rotate-left')} 全部恢复默认</button>
      </div>
    </details>
  </div>`;
}

// ==================== 写作质感块分区（全局共享块）====================
function qualityPanel(): string {
  if (_qualityCustomEdit) {
    const c = getCustomQualityBlocks().find(x => x.id === _qualityCustomEdit!.id);
    const name = c?.name || '';
    const text = c?.text || '';
    return `<div class="thw-content thw-set-content">
      <div class="thw-topbar"><button class="thw-iconbtn" data-quality-cback type="button">${iconHtml('fa-arrow-left')}</button><span class="thw-eyebrow">${iconHtml('fa-feather')} 自定义质感块 · 编辑</span></div>
      <div class="thw-content-pad thw-view-in" data-quality-cedit>
        <div class="thw-field"><label class="thw-flabel">块名称</label>
          <input class="thw-input" data-qc-name value="${escAttr(name)}" placeholder="给这条约束起个名，如「多用短句」"></div>
        <div class="thw-field"><label class="thw-flabel">约束内容（发给 AI 的正文）</label>
          <textarea class="thw-input thw-textarea" data-qc-text rows="10" placeholder="用正向指引写清你要 AI 怎么写，可仿照已有块：【标题】原则… ❌反例 ✅正例 自检：…">${esc(text)}</textarea></div>
        <div class="thw-set-hint">开启后，这段会附加到所有剧情类 app（对话/散文/演化）的生成里。不含 {{占位符}}。</div>
        <div class="thw-btn-row"><button class="thw-btn-primary" data-qc-save type="button">${iconHtml('fa-check')} 保存</button></div>
      </div>
    </div>`;
  }
  if (_qualityEdit) {
    return `<div class="thw-content thw-set-content">
      <div class="thw-topbar"><span class="thw-eyebrow">${iconHtml('fa-feather')} 写作质感 · 编辑</span></div>
      <div class="thw-content-pad thw-view-in" data-quality-edit>${promptEditPanelHtml(QUALITY_APP_ID, _qualityEdit.id)}</div>
    </div>`;
  }
  return `<div class="thw-content thw-set-content">
    <div class="thw-topbar"><span class="thw-eyebrow">${iconHtml('fa-feather')} 写作质感</span>
      <span class="thw-set-statuschip">全局共享</span></div>
    <div class="thw-content-pad thw-view-in">
      ${writerPersonaSecHtml()}
      <div data-quality-host>${qualityHubListHtml()}</div>
    </div>
  </div>`;
}

// ==================== 文生图分区 ====================
function imagePanel(): string {
  const cfg = getWorldConfig().comfyui;
  return `<div class="thw-content thw-set-content">
    <div class="thw-topbar"><span class="thw-eyebrow">${iconHtml('fa-image')} 文生图后端</span>
      <span class="thw-set-statuschip ${cfg.enabled && cfg.url && cfg.workflowJson.trim() ? 'ok' : 'bad'}">${cfg.enabled ? '已启用' : '未启用'}</span></div>
    <div class="thw-content-pad thw-view-in">
      <div class="thw-set-hint">${iconHtml('fa-circle-info')} 未启用 / 未配置 / 连不上时，各 app 的图片会以<b>中文画面描述卡</b>呈现，不阻塞主流程。</div>
      <div class="thw-sec">
        ${switchRow('启用文生图', '接入本地 comfyui 出图', 'thw-set-img-enabled', cfg.enabled)}
        <label class="thw-field"><div class="thw-flabel">comfyui 地址</div><input type="text" class="thw-input thw-set-img-url" value="${escAttr(cfg.url)}" placeholder="http://127.0.0.1:8188"></label>
        <label class="thw-field"><div class="thw-flabel">工作流模板 JSON <small>含占位符 {{prompt}}；留空则不出图</small></div>
          <textarea class="thw-textarea thw-set-img-wf" rows="6" placeholder='粘贴 comfyui 工作流 JSON…'>${esc(cfg.workflowJson)}</textarea></label>
        <div class="thw-set-foot"><button class="thw-btn-primary" data-set-img-save type="button">${iconHtml('fa-check')} 保存</button></div>
      </div>
    </div>
  </div>`;
}

// ==================== 主题分区 ====================
const SHELL_THEMES = [
  { id: 'candy', name: '糖果粉', desc: '默认甜美粉调', sw: 'linear-gradient(135deg,#fb7185,#f9a8d4)' },
  { id: 'ink', name: '墨玉', desc: '冷调深色沉稳', sw: 'linear-gradient(135deg,#334155,#0f172a)' },
  { id: 'jade', name: '青瓷', desc: '清雅青绿', sw: 'linear-gradient(135deg,#34d399,#10b981)' },
  { id: 'dawn', name: '晨曦', desc: '暖橙日出', sw: 'linear-gradient(135deg,#fbbf24,#fb923c)' },
  { id: 'aurora', name: '极光', desc: '深蓝青紫极光', sw: 'linear-gradient(135deg,#22d3ee,#818cf8)' },
  { id: 'sakura', name: '夜樱', desc: '暗紫夜樱', sw: 'linear-gradient(135deg,#f472b6,#7c3aed)' },
];
const BALL_SKINS = [
  { id: 'crystal', name: '星梦水晶', desc: '磨砂渐变·柔光高光环', sw: 'radial-gradient(circle at 35% 28%,#ffd6e8,#ff7b9d 52%,#c88aff)' },
  { id: 'ink', name: '墨玉极简', desc: '深色球身·细亮描边', sw: 'radial-gradient(circle at 35% 28%,#4a4560,#241f38 60%,#0f0d18)' },
  { id: 'glass', name: '琉璃玻璃', desc: '半透玻璃·流光描边', sw: 'linear-gradient(135deg,rgba(255,180,220,0.7),rgba(150,200,255,0.55))' },
];
const _sectLabel = 'font-size:13px;font-weight:800;color:var(--tx);margin:16px 2px 2px;display:flex;align-items:center;gap:6px;';
function themePanel(): string {
  const cfg = getWorldConfig();
  const cur = cfg.theme;
  const curSkin = cfg.ballSkin;
  const card = (list: { id: string; name: string; desc: string; sw: string }[], sel: string, attr: string) =>
    `<div class="thw-set-themes">${list.map(t => `<button class="thw-set-theme${sel === t.id ? ' on' : ''}" ${attr}="${t.id}" type="button">
      <span class="thw-set-theme-sw" style="background:${t.sw}"></span>
      <span class="thw-set-theme-name">${esc(t.name)}</span><span class="thw-set-theme-desc">${esc(t.desc)}</span>
      ${sel === t.id ? `<span class="thw-set-theme-on">${iconHtml('fa-circle-check')}</span>` : ''}
    </button>`).join('')}</div>`;
  return `<div class="thw-content thw-set-content">
    <div class="thw-topbar"><span class="thw-eyebrow">${iconHtml('fa-palette')} 主题外观</span></div>
    <div class="thw-content-pad thw-view-in">
      <div style="${_sectLabel}margin-top:2px;">${iconHtml('fa-tablet-screen-button')} 外壳主题</div>
      <div class="thw-set-hint">${iconHtml('fa-circle-info')} 换的是平板机身、背景光晕与桌面壁纸；各 app 仍保留自身专属配色。</div>
      ${card(SHELL_THEMES, cur, 'data-set-theme')}
      <div style="${_sectLabel}">${iconHtml('fa-circle-dot')} 桌面悬浮球皮肤</div>
      <div class="thw-set-hint">${iconHtml('fa-circle-info')} 桌面那颗悬浮球的外观；悬停球体会下滑出「世界」入口，一键进入世界套件。</div>
      ${card(BALL_SKINS, curSkin, 'data-set-ballskin')}
    </div>
  </div>`;
}
// 换肤后实时作用于当前打开的外壳 + 通知悬浮球（Shell.vue 监听同名事件换皮肤）
function applyAppearanceLive(): void {
  const cfg = getWorldConfig();
  const phone = qs2<HTMLElement>('.th-phone');
  if (phone) {
    phone.className = phone.className.replace(/\s*th-wtheme-\S+/g, '').trim();
    phone.classList.add(`th-wtheme-${cfg.theme}`);
  }
  const ov = qs2<HTMLElement>('.th-modal-overlay-2');
  if (ov) ov.setAttribute('data-wtheme', cfg.theme);
  try { window.dispatchEvent(new CustomEvent('th-appearance-change')); } catch (e) { void e; }
}

// __SETTINGS_PANELS_3__

// ==================== 自动触发总览 ====================
function autoPanel(): string {
  const stopped = isAutoStopped();
  const agents = getAutoAgents().slice().sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  const rows = agents.length ? agents.map(a => {
    const iv = (() => { try { return a.getInterval(); } catch (e) { void e; return 0; } })();
    const on = iv > 0;
    const last = a.getLastFloor ? (() => { try { return a.getLastFloor!(); } catch (e) { void e; return 0; } })() : null;
    return `<div class="thw-auto-row${on ? ' on' : ''}" data-auto-id="${escAttr(a.id)}">
      <span class="thw-auto-ico">${iconHtml(a.icon || 'fa-cube')}</span>
      <span class="thw-auto-meta">
        <b>${esc(a.name)}</b>
        <small>${esc(a.desc || '')}${last != null && on ? ` · 上次楼层 ${last}` : ''}</small>
      </span>
      <label class="thw-auto-ivwrap"><span>每</span>
        <input type="number" min="0" max="200" class="thw-edit-input thw-auto-iv" data-auto-iv="${escAttr(a.id)}" value="${esc(String(iv))}" style="width:64px">
        <span>楼</span></label>
      ${a.fireNow ? `<button class="thw-btn thw-btn-mini" data-auto-fire="${escAttr(a.id)}" type="button" title="不等楼数，立刻自动跑一次">${iconHtml('fa-bolt')} 立即</button>` : ''}
    </div>`;
  }).join('') : `<div class="thw-set-hint">暂无已注册的自动触发项。打开各 app 后即会登记。</div>`;
  return `<div class="thw-content thw-set-content">
    <div class="thw-topbar"><span class="thw-eyebrow">${iconHtml('fa-bolt')} 自动触发总览</span></div>
    <div class="thw-content-pad thw-view-in">
      <div class="thw-auto-stopbar${stopped ? ' on' : ''}">
        <label class="thw-set-switch">
          <input type="checkbox" class="thw-auto-stopcb" data-auto-stop ${stopped ? 'checked' : ''}>
          <span><b>${iconHtml('fa-hand')} 全局急停</b><small>打开后，所有 app 的「每 N 楼自动…」一律不触发（各自间隔设置保留）。</small></span>
        </label>
      </div>
      <div class="thw-set-hint">${iconHtml('fa-circle-info')} 这里统一管每个 app 的「正文每推进 N 楼自动铺一批内容」。改数字＝改间隔（0＝关该 app）；「立即」＝不等楼数手动跑一次。</div>
      <div class="thw-auto-list${stopped ? ' dimmed' : ''}">${rows}</div>
    </div>
  </div>`;
}

// ==================== 一键体检 ====================
function healthPanel(): string {
  const okIco = iconHtml('fa-circle-check'); const badIco = iconHtml('fa-circle-xmark'); const infoIco = iconHtml('fa-circle-info'); const warnIco = iconHtml('fa-triangle-exclamation');
  const apiOk = (() => { try { return isWorldApiConfigured(); } catch (e) { void e; return false; } })();
  const apiName = (() => { try { return getActiveWorldApiName() || '（未选）'; } catch (e) { void e; return '（未知）'; } })();
  const wbOk = (() => { try { return isWorldbookAvailable(); } catch (e) { void e; return false; } })();
  const floor = (() => { try { return getTavernFloorCount(); } catch (e) { void e; return 0; } })();
  const autoCount = (() => { try { return getAutoAgents().filter(a => { try { return a.getInterval() > 0; } catch (e) { void e; return false; } }).length; } catch (e) { void e; return 0; } })();
  const stopped = isAutoStopped();
  // 每项一张卡：左侧彩色徽章图标 + 名称 + 状态值；卡片左边缘按状态染色（绿/黄/红）。
  const card = (cls: 'ok' | 'bad' | 'warn', ico: string, label: string, val: string) =>
    `<div class="thw-health-card ${cls}"><span class="thw-health-badge">${ico}</span>` +
    `<div class="thw-health-body"><div class="thw-health-lab">${esc(label)}</div><div class="thw-health-val">${val}</div></div></div>`;
  return `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-stethoscope')} 一键体检</span>
      <span class="thw-set-statuschip ${apiOk ? 'ok' : 'bad'}">${apiOk ? '核心就绪' : '待配置'}</span></div>
    <div class="thw-set-hint">${infoIco} 快速查看套件当前是否就绪、能读到什么。</div>
    <div class="thw-health-grid">
      ${card(apiOk ? 'ok' : 'bad', apiOk ? okIco : badIco, '套件 API 接口', apiOk ? `已配置 · ${esc(apiName)}` : '未配置（去「API 接口」填 URL/Key）')}
      ${card(wbOk ? 'ok' : 'warn', wbOk ? okIco : infoIco, '世界书接口', wbOk ? '可用' : '当前环境不可用（绑书类功能降级）')}
      ${card(floor > 0 ? 'ok' : 'warn', floor > 0 ? okIco : infoIco, '当前正文楼层', floor > 0 ? `${floor} 楼` : '读不到（未在酒馆内 / 尚无对话）')}
      ${card(stopped ? 'warn' : 'ok', stopped ? warnIco : okIco, '自动触发', stopped ? '已全局急停' : `${autoCount} 个 app 开启楼层自动`)}
    </div>
    <div class="thw-set-foot" style="justify-content:flex-start;margin-top:12px">
      <button class="thw-btn thw-btn-mini" data-health-refresh type="button">${iconHtml('fa-rotate')} 重新体检</button>
    </div>
  </div>`;
}

// ==================== 数据管理分区 ====================
function dataPanel(): string {  return `<div class="thw-content thw-set-content">
    <div class="thw-topbar"><span class="thw-eyebrow">${iconHtml('fa-database')} 数据管理</span></div>
    <div class="thw-content-pad thw-view-in">
      <div class="thw-set-hint">${iconHtml('fa-circle-info')} 世界套件的全部数据存于本地（_th_world_*）。建议定期导出备份。</div>
      <div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-file-export')} 备份与恢复</span></div>
        <div class="thw-set-foot" style="justify-content:flex-start">
          <button class="thw-btn" data-set-export type="button">${iconHtml('fa-download')} 导出套件数据</button>
          <button class="thw-btn" data-set-import type="button">${iconHtml('fa-upload')} 导入套件数据</button>
        </div>
      </div>
      <div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-broom')} 清理</span></div>
        <div class="thw-set-hint">勾选要清空的 app，只删这些 app 的内容数据，不影响接口/读取等设置偏好。不可恢复。</div>
        <div class="thw-set-wipe-acts">
          <button class="thw-btn thw-btn-mini" data-set-wipe-all type="button">${iconHtml('fa-check-double')} 全选</button>
          <button class="thw-btn thw-btn-mini" data-set-wipe-none type="button">${iconHtml('fa-xmark')} 反选/清空</button>
        </div>
        <div class="thw-set-wipe-grid">${APP_DATA_KEYS.map(a => `
          <label class="thw-set-wipe-item${_wipeSel.has(a.id) ? ' on' : ''}">
            <input type="checkbox" class="thw-set-wipe-cb" data-set-wipe-app="${escAttr(a.id)}" ${_wipeSel.has(a.id) ? 'checked' : ''}>
            <span class="thw-set-wipe-ico">${iconHtml(wipeAppIcon(a.id))}</span>
            <span class="thw-set-wipe-name">${esc(a.name)}</span>
          </label>`).join('')}</div>
        <button class="thw-btn thw-btn-danger" data-set-wipe type="button" style="margin-top:12px">${iconHtml('fa-trash')} 清空选中的 app 数据（${_wipeSel.size}）</button>
      </div>
    </div>
  </div>`;
}

// ==================== 关于分区 ====================
function aboutPanel(): string {
  const n = getContacts().length;
  return `<div class="thw-content thw-set-content">
    <div class="thw-topbar"><span class="thw-eyebrow">${iconHtml('fa-circle-info')} 关于</span></div>
    <div class="thw-content-pad thw-view-in">
      <div class="thw-set-about">
        <div class="thw-set-about-logo">${iconHtml('fa-mobile-screen-button')}</div>
        <div class="thw-set-about-title">世界套件</div>
        <div class="thw-set-about-sub">沉浸式世界模拟 · 独立于角色卡的配件系统</div>
      </div>
      <div class="thw-sec">
        <div class="thw-set-kv"><span>API 状态</span><b>${isWorldApiConfigured() ? '已配置' : '未配置'}</b></div>
        <div class="thw-set-kv"><span>通讯录人数</span><b>${n}</b></div>
        <div class="thw-set-kv"><span>数据位置</span><b>本地 localStorage（_th_world_*）</b></div>
      </div>
      ${healthPanel()}
      <div class="thw-set-hint">${iconHtml('fa-triangle-exclamation')} 本套件内容均为虚构创作，仅用于角色扮演演绎。</div>
    </div>
  </div>`;
}

// ==================== 通讯录分区 ====================
function avatarChip(c: WorldContact, big = false): string {
  const cls = big ? 'thw-set-ct-av thw-set-ct-av-lg' : 'thw-set-ct-av';
  if (c.avatar) return `<span class="${cls}" style="background-image:url('${escAttr(c.avatar)}')"></span>`;
  const ch = (c.name || '?').slice(0, 1);
  return `<span class="${cls} thw-set-ct-av-ph">${esc(ch)}</span>`;
}
function contactsPanel(): string {
  if (_contactEdit) return contactEditPanel();
  const all = getContacts();
  const user = getUserContact();
  const others = all.filter(c => !c.isUser);
  const srcLabel = (s: string) => ({ persona: '人格', charcard: '角色卡', worldbook: '世界书', custom: '自建' } as any)[s] || s;
  const row = (c: WorldContact) => `<button class="thw-set-ct-row" data-ct-edit="${escAttr(c.id)}" type="button">
    ${avatarChip(c)}
    <span class="thw-set-ct-mid"><span class="thw-set-ct-name">${esc(c.name)}${c.archived ? ' <span class="thw-tag">归档</span>' : ''}</span>
      <span class="thw-set-ct-meta">${esc(srcLabel(c.source))}${c.relationship ? ' · ' + esc(c.relationship) : ''}${c.gender ? ' · ' + esc(c.gender) : ''}</span></span>
    <span class="thw-set-ct-arrow">${iconHtml('fa-chevron-right')}</span>
  </button>`;
  return `<div class="thw-content thw-set-content">
    <div class="thw-topbar"><span class="thw-eyebrow">${iconHtml('fa-address-book')} 通讯录</span>
      <button class="thw-btn thw-btn-mini thw-btn-primary" data-ct-new type="button">${iconHtml('fa-user-plus')} 新建人物</button></div>
    <div class="thw-content-pad thw-view-in">
      <div class="thw-set-hint">${iconHtml('fa-circle-info')} 全套件共享的人物档案。各 app 选人都从这里读；app 内新建的成员会自动回流到此。</div>
      <div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-user')} 我（{{user}}）</span></div>
        ${user ? row(user) : `<button class="thw-set-ct-row thw-set-ct-adduser" data-ct-newuser type="button">${iconHtml('fa-user-plus')} 设置「我」的档案<small>各 app 中「我」的昵称/头像/形象统一取这里</small></button>`}
      </div>
      <div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-users')} 全部联系人 <span class="thw-set-cnt">${others.length}</span></span></div>
        ${others.length ? others.map(row).join('') : `<div class="thw-empty">${iconHtml('fa-user-slash')} 还没有联系人，点右上角新建，或在各 app 里添加。</div>`}
      </div>
    </div>
  </div>`;
}
function contactEditPanel(): string {
  const id = _contactEdit?.id || null;
  const c = id ? getContact(id) : null;
  const isUser = c?.isUser || (_contactEdit as any)?.asUser || false;
  const v = (x?: string) => escAttr(x || '');
  return `<div class="thw-content thw-set-content">
    <div class="thw-topbar"><button class="thw-iconbtn" data-ct-back type="button">${iconHtml('fa-arrow-left')}</button>
      <span class="thw-eyebrow">${c ? '编辑' : '新建'}${isUser ? '「我」的档案' : '人物'}</span>
      ${c && !c.isUser ? `<button class="thw-iconbtn thw-set-ct-del" data-ct-del="${escAttr(c.id)}" type="button" title="删除">${iconHtml('fa-trash')}</button>` : ''}</div>
    <div class="thw-content-pad thw-view-in thw-set-ct-form" data-ct-form data-ct-id="${escAttr(id || '')}" data-ct-isuser="${isUser ? '1' : '0'}">
      <div class="thw-set-ct-avrow">${avatarChip(c || ({ name: '新' } as any), true)}
        <div class="thw-set-ct-avfields"><label class="thw-field"><div class="thw-flabel">头像（URL 或上传，留空用首字）</div>
          <div class="thw-set-ct-uprow"><input type="text" class="thw-input thw-set-ct-avatar" value="${v(c?.avatar)}" placeholder="https://… 或 data:image…"><button class="thw-btn thw-btn-mini" data-ct-upload="thw-set-ct-avatar" type="button">${iconHtml('fa-image')} 上传</button></div></label>
          ${isUser ? `<button class="thw-btn thw-btn-mini" data-ct-readtavern type="button" title="读取酒馆当前玩家角色(persona)的昵称与描述">${iconHtml('fa-download')} 读取酒馆角色</button>` : ''}
        </div>
      </div>
      <div class="thw-set-grid2">
        <label class="thw-field"><div class="thw-flabel">昵称</div><input type="text" class="thw-input thw-set-ct-name" value="${v(c?.name)}" maxlength="24" placeholder="${isUser ? '我的昵称' : '人物名'}"></label>
        <label class="thw-field"><div class="thw-flabel">性别</div><input type="text" class="thw-input thw-set-ct-gender" value="${v(c?.gender || '女')}" placeholder="女"></label>
      </div>
      ${isUser ? '' : `<div class="thw-set-grid2">
        <label class="thw-field"><div class="thw-flabel">与「我」的关系</div><input type="text" class="thw-input thw-set-ct-rel" value="${v(c?.relationship)}" placeholder="如：恋人/挚友/师尊"></label>
        <label class="thw-field"><div class="thw-flabel">生日（可空，联动日历）</div><input type="text" class="thw-input thw-set-ct-bday" value="${v(c?.birthday)}" placeholder="如：03-15 或 孟春初七"></label>
      </div>`}
      <label class="thw-field"><div class="thw-flabel">外观 / 形象描述</div><textarea class="thw-textarea thw-set-ct-appear" rows="3" placeholder="身材、长相、气质、惯常穿着…">${esc(c?.appearance || (c ? '' : DEFAULT_APPEARANCE))}</textarea></label>
      <label class="thw-field"><div class="thw-flabel">${isUser ? '我的人设（可空）' : '角色设定 / 人设'}</div><textarea class="thw-textarea thw-set-ct-persona" rows="4" placeholder="性格、说话方式、背景故事、与「我」的过往…">${esc(c?.persona || '')}</textarea></label>
      <label class="thw-field"><div class="thw-flabel">固定形象 Tag（出图保持一致，可空）</div><input type="text" class="thw-input thw-set-ct-imgtag" value="${v(c?.imageTag)}" placeholder="1girl, silver hair, …"></label>
      ${isUser ? '' : `<label class="thw-field"><div class="thw-flabel">标签（空格分隔）</div><input type="text" class="thw-input thw-set-ct-tags" value="${v((c?.tags || []).join(' '))}" placeholder="仙宫 同门 暧昧"></label>
      ${switchRow('归档', '归档后不在各 app 选人列表默认出现', 'thw-set-ct-archived', !!c?.archived)}`}
      <label class="thw-field"><div class="thw-flabel">备注（可空）</div><textarea class="thw-textarea thw-set-ct-note" rows="2">${esc(c?.note || '')}</textarea></label>
      ${isWorldbookAvailable() ? `<div class="thw-sec"><div class="thw-sec-head"><span class="thw-sec-title">${iconHtml('fa-link')} 绑定世界书条目 <small>作为这个人物的额外设定，各 app 用到 TA 时一并参考</small></span></div>
        <div class="thw-set-ct-wbpick" data-ct-wbpick-host>${wbPickerHtml(c?.wbKeys || [])}</div></div>` : ''}
      <div class="thw-set-foot"><button class="thw-btn-primary" data-ct-save type="button">${iconHtml('fa-check')} 保存</button></div>
    </div>
  </div>`;
}

// __SETTINGS_PANELS_END__

// ==================== 左导航 + 外壳 ====================
function sidebarHtml(): string {
  const configured = isWorldApiConfigured();
  const nav = (c: { id: Cat; icon: string; label: string; sub: string }) =>
    `<button class="thw-nav${_cat === c.id ? ' thw-nav-on' : ''}" data-set-cat="${c.id}" type="button">
      <span class="thw-nav-ico">${iconHtml(c.icon)}</span>
      <span class="thw-nav-lbl">${esc(c.label)}</span>
      ${c.id === 'api' && !configured ? `<span class="thw-nav-badge thw-set-warn">!</span>` : ''}
    </button>`;
  return `<div class="thw-sidebar thw-set-side">
    <div class="thw-sidebar-brand">${iconHtml('fa-gear')} 设置</div>
    <nav class="thw-nav-list">${CATS.map(nav).join('')}</nav>
  </div>`;
}

// __SETTINGS_RENDER__

function render(): void {
  const root = rootEl();
  if (!root) { openApp(); return; }
  let content = '';
  if (_cat === 'api') content = apiPanel();
  else if (_cat === 'read') content = readPanel();
  else if (_cat === 'contacts') content = contactsPanel();
  else if (_cat === 'world') content = worldPanel();
  else if (_cat === 'auto') content = autoPanel();
  else if (_cat === 'quality') content = qualityPanel();
  else if (_cat === 'image') content = imagePanel();
  else if (_cat === 'theme') content = themePanel();
  else if (_cat === 'data') content = dataPanel();
  else content = aboutPanel();
  root.innerHTML = `<div class="thw-app thw-settings-app2">
    <div class="thw-body">${sidebarHtml()}${content}</div>
  </div>`;
  // 读取分区：世界书条目选择器
  if (_cat === 'read' && isWorldbookAvailable()) {
    const host = root.querySelector('[data-set-wbpick-host]') as HTMLElement | null;
    if (host) bindWbPicker(host, () => getGlobalReadConfig().ctxWbKeys || [], (keys) => setGlobalReadConfig({ ctxWbKeys: keys }));
  }
  // 通讯录编辑：人物绑定世界书条目选择器（临时态 _ctWbKeys，保存时落库）
  if (_cat === 'contacts' && _contactEdit && isWorldbookAvailable()) {
    const host = root.querySelector('[data-ct-wbpick-host]') as HTMLElement | null;
    if (host) bindWbPicker(host, () => _ctWbKeys, (keys) => { _ctWbKeys = keys; });
  }
}

// __SETTINGS_BIND__

function fieldVal(cls: string): string {
  const el = rootEl()?.querySelector('.' + cls) as HTMLInputElement | HTMLTextAreaElement | null;
  return el ? el.value.trim() : '';
}
function fieldChecked(cls: string): boolean {
  const el = rootEl()?.querySelector('.' + cls) as HTMLInputElement | null;
  return !!el?.checked;
}
function numVal(cls: string, def: number, min: number, max: number): number {
  const raw = Number((rootEl()?.querySelector('.' + cls) as HTMLInputElement | null)?.value);
  if (!Number.isFinite(raw)) return def;
  return Math.max(min, Math.min(max, Math.floor(raw)));
}

// 从编辑区读出一条 API 预设
function readApiForm(): WorldApiPreset {
  const samp = (cls: string): SamplingVal => {
    const mode = (rootEl()?.querySelector(`[data-samp-for="${cls}"]`) as HTMLSelectElement | null)?.value || 'same_as_preset';
    if (mode === 'custom') { const n = Number(fieldVal(cls)); return Number.isFinite(n) ? n : 'same_as_preset'; }
    return mode as SamplingVal;
  };
  return {
    name: fieldVal('thw-set-api-name') || '预设',
    source: fieldVal('thw-set-api-source') || 'openai',
    apiurl: fieldVal('thw-set-api-url'),
    key: (rootEl()?.querySelector('.thw-set-api-key') as HTMLInputElement | null)?.value || '',
    model: fieldVal('thw-set-api-model'),
    temperature: samp('thw-set-api-temp'), max_tokens: samp('thw-set-api-maxtok'),
    top_p: samp('thw-set-api-topp'), top_k: samp('thw-set-api-topk'),
    frequency_penalty: samp('thw-set-api-freq'), presence_penalty: samp('thw-set-api-pres'),
  };
}

function saveContactForm(): void {
  const form = rootEl()?.querySelector('[data-ct-form]') as HTMLElement | null;
  if (!form) return;
  const id = form.getAttribute('data-ct-id') || '';
  const isUser = form.getAttribute('data-ct-isuser') === '1';
  const name = fieldVal('thw-set-ct-name');
  if (!name) { thToast('请填昵称', 'warn'); return; }
  const tags = fieldVal('thw-set-ct-tags').split(/\s+/).map(s => s.trim()).filter(Boolean);
  const patch: any = {
    source: id ? (getContact(id)?.source || 'custom') : 'custom',
    name, gender: fieldVal('thw-set-ct-gender') || '女',
    avatar: fieldVal('thw-set-ct-avatar') || undefined,
    appearance: fieldVal('thw-set-ct-appear') || undefined,
    persona: fieldVal('thw-set-ct-persona') || undefined,
    imageTag: fieldVal('thw-set-ct-imgtag') || undefined,
    note: fieldVal('thw-set-ct-note') || undefined,
    wbKeys: _ctWbKeys.length ? _ctWbKeys.slice() : undefined,
    isUser,
  };
  if (id) patch.id = id;
  if (!isUser) {
    patch.relationship = fieldVal('thw-set-ct-rel') || undefined;
    patch.birthday = fieldVal('thw-set-ct-bday') || undefined;
    patch.tags = tags.length ? tags : undefined;
    patch.archived = fieldChecked('thw-set-ct-archived');
  }
  // 保证只有一个 isUser
  if (isUser) { const prev = getUserContact(); if (prev && prev.id !== id) upsertContact({ ...prev, isUser: false }); }
  upsertContact(patch);
  _contactEdit = null; render(); thToast('已保存', 'success');
}

function bindRoot(): void {
  const root = rootEl();
  if (!root || (root as any)._setBound) return;
  (root as any)._setBound = true;

  root.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    if (!t) return;
    // 左导航
    const navBtn = t.closest('[data-set-cat]') as HTMLElement | null;
    if (navBtn) { _cat = (navBtn.getAttribute('data-set-cat') as Cat) || 'api'; _contactEdit = null; _qualityEdit = null; _qualityCustomEdit = null; render(); return; }

    // ---- 写作质感：列表↔编辑 ----
    if (_cat === 'quality') {
      // 自定义块：新建 / 编辑 / 删除 / 返回 / 保存
      if (t.closest('[data-wapp-qc-new]')) { const b = addCustomQualityBlock('', ''); _qualityCustomEdit = { id: b.id }; render(); return; }
      const qcEdit = t.closest('[data-wapp-qc-edit]') as HTMLElement | null;
      if (qcEdit) { _qualityCustomEdit = { id: qcEdit.getAttribute('data-wapp-qc-edit') || '' }; render(); return; }
      const qcDel = t.closest('[data-wapp-qc-del]') as HTMLElement | null;
      if (qcDel) {
        const id = qcDel.getAttribute('data-wapp-qc-del') || '';
        void thConfirm({ title: '删除自定义块', message: '删除后不可恢复。确定？', confirmText: '删除', danger: true }).then(ok => {
          if (ok) { deleteCustomQualityBlock(id); const host = rootEl()?.querySelector('[data-quality-host]') as HTMLElement | null; if (host) host.innerHTML = qualityHubListHtml(); }
        });
        return;
      }
      if (t.closest('[data-quality-cback]')) { _qualityCustomEdit = null; render(); return; }
      if (t.closest('[data-qc-save]')) {
        const host = rootEl();
        const nameEl = host?.querySelector('[data-qc-name]') as HTMLInputElement | null;
        const textEl = host?.querySelector('[data-qc-text]') as HTMLTextAreaElement | null;
        if (_qualityCustomEdit) updateCustomQualityBlock(_qualityCustomEdit.id, { name: (nameEl?.value || '').trim() || '自定义块', text: textEl?.value || '' });
        _qualityCustomEdit = null; render(); thToast('已保存自定义块', 'success'); return;
      }
      if (_qualityCustomEdit && t.closest('[data-quality-cedit]')) return;
      // 启用开关（核心/选用/自定义块，极简按钮式）
      if (!_qualityEdit && !_qualityCustomEdit && bindQualityHubToggle(ev)) {
        const host = rootEl()?.querySelector('[data-quality-host]') as HTMLElement | null;
        if (host) host.innerHTML = qualityHubListHtml();
        return;
      }
      // 已登记块：列表↔编辑（复用共享 bindPromptPanelClick）
      const r = bindPromptPanelClick(ev);
      if (r) {
        if (r.action === 'edit') { _qualityEdit = { id: r.id }; render(); return; }
        if (r.action === 'back') { _qualityEdit = null; render(); return; }
        if (r.action === 'saved' || r.action === 'reset') { render(); return; }
        return;
      }
      if (_qualityEdit && t.closest('[data-quality-edit]')) return;
    }

    // ---- API ----
    const apiSel = t.closest('[data-api-sel]') as HTMLElement | null;
    if (apiSel) { _apiSel = apiSel.getAttribute('data-api-sel') || ''; _modelCache = []; refreshApiLayout(); return; }
    if (t.closest('[data-api-add]')) { const list = addWorldApiPreset('新预设'); _apiSel = list[list.length - 1].name; refreshApiLayout(); return; }
    if (t.closest('[data-api-import]')) {
      const n = importFromStatusBar(false);
      thToast(n ? `已从状态栏导入 ${n} 套预设` : '没有可导入的预设（或都已存在）', n ? 'success' : 'info');
      _apiSel = getActiveWorldApiName(); refreshApiLayout(); return;
    }
    if (t.closest('[data-api-activate]')) { const p = readApiForm(); upsertWorldApiPreset(p, _apiSel); setActiveWorldApiName(p.name); _apiSel = p.name; refreshApiLayout(); thToast(`已设为活动预设：${p.name}`, 'success'); return; }
    if (t.closest('[data-api-del]')) {
      void thConfirm({ title: '删除预设', message: `删除「${_apiSel}」？`, danger: true, confirmText: '删除' }).then(ok => { if (ok) { const list = deleteWorldApiPreset(_apiSel); _apiSel = list[0].name; refreshApiLayout(); thToast('已删除', 'success'); } });
      return;
    }
    if (t.closest('[data-api-save]')) { const p = readApiForm(); upsertWorldApiPreset(p, _apiSel); _apiSel = p.name; refreshApiLayout(); thToast('已保存预设', 'success'); return; }
    if (t.closest('[data-api-models]')) {
      if (_busy) return; _busy = true; const p = readApiForm();
      void fetchWorldApiModels(p).then(list => {
        _modelCache = list; _busy = false;
        // 只更新模型 datalist，不重渲染整个表单（保留焦点/滚动）
        const inp = rootEl()?.querySelector('.thw-set-api-model') as HTMLInputElement | null;
        const old = rootEl()?.querySelector('#th-set-models'); if (old) old.remove();
        if (inp && list.length) { const dl = document.createElement('datalist'); dl.id = 'th-set-models'; dl.innerHTML = list.map(m => `<option value="${escAttr(m)}">`).join(''); inp.insertAdjacentElement('afterend', dl); }
        thToast(list.length ? `拉取到 ${list.length} 个模型` : '未拉取到模型（检查地址/Key）', list.length ? 'success' : 'warn');
      }).catch(() => { _busy = false; thToast('拉取失败', 'error'); });
      return;
    }
    if (t.closest('[data-api-test]')) {
      if (_busy) return; _busy = true; const p = readApiForm(); thToast('正在测试…', 'info');
      void testWorldApi(p).then(r => { _busy = false; thToast('连接成功：' + String(r).slice(0, 40), 'success'); }).catch(e => { _busy = false; thToast('连接失败：' + (e instanceof Error ? e.message : String(e)), 'error'); });
      return;
    }

    // ---- 读取管理：排除标签 ----
    if (t.closest('[data-extag-add]')) {
      const head = fieldVal('thw-set-extag-head'); const tail = fieldVal('thw-set-extag-tail');
      if (!head) { thToast('请填头标签', 'warn'); return; }
      const tags = (getGlobalReadConfig().excludeTags || []).slice();
      tags.push({ head, tail }); setGlobalReadConfig({ excludeTags: tags });
      const hi = rootEl()?.querySelector('.thw-set-extag-head') as HTMLInputElement | null; if (hi) hi.value = '';
      const ti = rootEl()?.querySelector('.thw-set-extag-tail') as HTMLInputElement | null; if (ti) ti.value = '';
      refreshExcludeTags(); thToast('已添加排除标签', 'success'); return;
    }
    if (t.closest('[data-extag-reset]')) {
      void thConfirm({ title: '恢复默认排除标签', message: '用内置默认标签覆盖当前列表？', confirmText: '恢复' }).then(ok => { if (ok) { setGlobalReadConfig({ excludeTags: DEFAULT_EXCLUDE_TAGS.slice() }); refreshExcludeTags(); thToast('已恢复默认', 'success'); } });
      return;
    }
    const exDel = t.closest('[data-extag-del]') as HTMLElement | null;
    if (exDel) {
      const i = Number(exDel.getAttribute('data-extag-del'));
      const tags = (getGlobalReadConfig().excludeTags || []).slice();
      if (i >= 0 && i < tags.length) { tags.splice(i, 1); setGlobalReadConfig({ excludeTags: tags }); refreshExcludeTags(); }
      return;
    }

    // ---- 读取管理：提取标签（双保险·先跑）----
    if (t.closest('[data-xtag-add]')) {
      const head = fieldVal('thw-set-xtag-head'); const tail = fieldVal('thw-set-xtag-tail');
      if (!head || !tail) { thToast('提取标签必须成对：头/尾都要填', 'warn'); return; }
      const tags = (getGlobalReadConfig().extractTags || []).slice();
      tags.push({ head, tail }); setGlobalReadConfig({ extractTags: tags });
      const hi = rootEl()?.querySelector('.thw-set-xtag-head') as HTMLInputElement | null; if (hi) hi.value = '';
      const ti = rootEl()?.querySelector('.thw-set-xtag-tail') as HTMLInputElement | null; if (ti) ti.value = '';
      refreshExtractTags(); thToast('已添加提取标签', 'success'); return;
    }
    if (t.closest('[data-xtag-reset]')) {
      void thConfirm({ title: '恢复默认提取标签', message: '用内置默认标签（<content>）覆盖当前列表？', confirmText: '恢复' }).then(ok => { if (ok) { setGlobalReadConfig({ extractTags: DEFAULT_EXTRACT_TAGS.slice() }); refreshExtractTags(); thToast('已恢复默认', 'success'); } });
      return;
    }
    const xDel = t.closest('[data-xtag-del]') as HTMLElement | null;
    if (xDel) {
      const i = Number(xDel.getAttribute('data-xtag-del'));
      const tags = (getGlobalReadConfig().extractTags || []).slice();
      if (i >= 0 && i < tags.length) { tags.splice(i, 1); setGlobalReadConfig({ extractTags: tags }); refreshExtractTags(); }
      return;
    }

    // ---- 全局生态 ----
    if (t.closest('[data-set-gender-save]')) {
      const sel = rootEl()?.querySelector('.thw-set-gender-mode') as HTMLSelectElement | null;
      const mode = (sel?.value as GenderMode) || 'allFemale';
      const pct = numVal('thw-set-gender-pct', getWorldConfig().gender.malePercent, 0, 100);
      const customTxt = (rootEl()?.querySelector('.thw-set-gender-custom-txt') as HTMLTextAreaElement | null)?.value || '';
      saveWorldConfig({ gender: { mode, malePercent: pct, customText: customTxt } });
      render(); thToast('已保存性别设置，已对全部 app 生效', 'success'); return;
    }
    if (t.closest('[data-set-imgwords-save]')) {
      let mn = numVal('thw-set-imgwords-min', getWorldConfig().imageDesc.minWords, 1, 400);
      let mx = numVal('thw-set-imgwords-max', getWorldConfig().imageDesc.maxWords, 1, 400);
      if (mn > mx) { const t2 = mn; mn = mx; mx = t2; }
      saveWorldConfig({ imageDesc: { minWords: mn, maxWords: mx } });
      render(); thToast('已保存图片字数，已对全部 app 生效', 'success'); return;
    }
    // ---- 写手人格 ----
    if (t.closest('[data-set-wp-toggle]')) {
      const next = !getWriterPersonaCfg().on;
      setWriterPersonaOn(next);
      render(); thToast(next ? '已启用写手人格锚定' : '已关闭写手人格锚定', 'success'); return;
    }
    const wpSegSave = t.closest('[data-wpseg-save]') as HTMLElement | null;
    if (wpSegSave) {
      const id = wpSegSave.getAttribute('data-wpseg-save') || '';
      const txt = (rootEl()?.querySelector(`[data-wpseg-text="${id}"]`) as HTMLTextAreaElement | null)?.value || '';
      setWriterPersonaSegText(id, txt);
      thToast(txt.trim() ? '已保存本段' : '本段已清空，将用默认', 'success'); return;
    }
    const wpSegReset = t.closest('[data-wpseg-reset]') as HTMLElement | null;
    if (wpSegReset) {
      const id = wpSegReset.getAttribute('data-wpseg-reset') || '';
      setWriterPersonaSegText(id, '');
      render(); thToast('已恢复本段默认', 'success'); return;
    }
    if (t.closest('[data-set-wp-resetall]')) {
      resetWriterPersona();
      render(); thToast('已全部恢复默认人格文本', 'success'); return;
    }

    // ---- 文生图 ----
    if (t.closest('[data-set-img-save]')) {
      saveWorldConfig({ comfyui: { enabled: fieldChecked('thw-set-img-enabled'), url: fieldVal('thw-set-img-url') || 'http://127.0.0.1:8188', workflowJson: (rootEl()?.querySelector('.thw-set-img-wf') as HTMLTextAreaElement | null)?.value || '' } });
      render(); thToast('已保存文生图设置', 'success'); return;
    }

    // ---- 主题 ----
    const themeBtn = t.closest('[data-set-theme]') as HTMLElement | null;
    if (themeBtn) { saveWorldConfig({ theme: themeBtn.getAttribute('data-set-theme') || 'candy' }); applyAppearanceLive(); render(); thToast('已切换外壳主题', 'success'); return; }
    const skinBtn = t.closest('[data-set-ballskin]') as HTMLElement | null;
    if (skinBtn) { saveWorldConfig({ ballSkin: skinBtn.getAttribute('data-set-ballskin') || 'crystal' }); applyAppearanceLive(); render(); thToast('已切换悬浮球皮肤', 'success'); return; }

    // ---- 数据 ----
    if (t.closest('[data-set-export]')) { exportWorldData(); return; }
    if (t.closest('[data-set-import]')) { importWorldData(); return; }
    if (t.closest('[data-set-wipe-all]')) { APP_DATA_KEYS.forEach(a => _wipeSel.add(a.id)); render(); return; }
    if (t.closest('[data-set-wipe-none]')) { _wipeSel.clear(); render(); return; }
    if (t.closest('[data-set-wipe]')) {
      if (!_wipeSel.size) { thToast('先勾选要清空的 app', 'warn'); return; }
      const names = APP_DATA_KEYS.filter(a => _wipeSel.has(a.id)).map(a => a.name).join('、');
      void thConfirm({ title: '清空选中的 app 数据', message: `将删除这些 app 的内容数据：${names}。保留接口与读取等设置。不可恢复。`, danger: true, confirmText: '清空' }).then(ok => {
        if (ok) { const n = wipeAppData([..._wipeSel]); _wipeSel.clear(); render(); thToast(`已清空 ${n} 个 app 的数据`, 'success'); }
      });
      return;
    }

    // ---- 自动触发总览 ----
    const fireBtn = t.closest('[data-auto-fire]') as HTMLElement | null;
    if (fireBtn) {
      const id = fireBtn.getAttribute('data-auto-fire') || '';
      const ag = getAutoAgent(id);
      if (ag?.fireNow) {
        if (isAutoStopped()) { thToast('已全局急停，先关掉急停再手动触发', 'warn'); return; }
        try { void Promise.resolve(ag.fireNow()).catch(() => {}); thToast(`已请求「${ag.name}」立即触发一次`, 'success'); } catch (e) { void e; thToast('触发失败', 'error'); }
      }
      return;
    }
    // ---- 体检 ----
    if (t.closest('[data-health-refresh]')) { render(); thToast('已重新体检', 'success'); return; }

    // ---- 通讯录 ----
    const ctEdit = t.closest('[data-ct-edit]') as HTMLElement | null;
    if (ctEdit) { const cid = ctEdit.getAttribute('data-ct-edit'); _contactEdit = { id: cid }; _ctWbKeys = (cid ? getContact(cid)?.wbKeys : []) || []; render(); return; }
    if (t.closest('[data-ct-new]')) { _contactEdit = { id: null }; _ctWbKeys = []; render(); return; }
    if (t.closest('[data-ct-newuser]')) { _contactEdit = { id: null } as any; (_contactEdit as any).asUser = true; _ctWbKeys = []; render(); return; }
    if (t.closest('[data-ct-back]')) { _contactEdit = null; render(); return; }
    if (t.closest('[data-ct-save]')) { saveContactForm(); return; }
    // 头像上传
    const ctUp = t.closest('[data-ct-upload]') as HTMLElement | null;
    if (ctUp) {
      const cls = ctUp.getAttribute('data-ct-upload') || '';
      void pickImageFile().then(dataUrl => { if (dataUrl) { const inp = rootEl()?.querySelector('.' + cls) as HTMLInputElement | null; if (inp) inp.value = dataUrl; } });
      return;
    }
    // 「我」一键读取酒馆玩家角色
    if (t.closest('[data-ct-readtavern]')) {
      const p = getTavernUserPersona();
      if (!p.name && !p.description) { thToast('未读到酒馆玩家角色（请确认已设置 persona）', 'warn'); return; }
      const nameInp = rootEl()?.querySelector('.thw-set-ct-name') as HTMLInputElement | null;
      const perInp = rootEl()?.querySelector('.thw-set-ct-persona') as HTMLTextAreaElement | null;
      if (nameInp && p.name) nameInp.value = p.name;
      if (perInp && p.description) perInp.value = p.description;
      thToast(`已读取酒馆角色${p.name ? '：' + p.name : ''}`, 'success');
      return;
    }
    const ctDel = t.closest('[data-ct-del]') as HTMLElement | null;
    if (ctDel) { const id = ctDel.getAttribute('data-ct-del') || ''; void thConfirm({ title: '删除人物', message: '从通讯录删除这个人？各 app 已建立的会话不受影响。', danger: true, confirmText: '删除' }).then(ok => { if (ok) { deleteContact(id); _contactEdit = null; render(); thToast('已删除', 'success'); } }); return; }
  });

  root.addEventListener('change', (ev) => {
    const t = ev.target as HTMLElement;
    if (!t) return;
    // ---- 全局急停总闸 ----
    if (t.closest('[data-auto-stop]')) {
      setAutoStopped((t as HTMLInputElement).checked);
      render();
      thToast((t as HTMLInputElement).checked ? '已全局急停：所有自动触发暂停' : '已解除急停', 'success');
      return;
    }
    // ---- 各 app 自动触发间隔 ----
    const ivInp = t.closest('[data-auto-iv]') as HTMLInputElement | null;
    if (ivInp) {
      const id = ivInp.getAttribute('data-auto-iv') || '';
      const ag = getAutoAgent(id);
      if (ag) { const n = Math.max(0, Math.min(200, Math.floor(Number(ivInp.value) || 0))); try { ag.setInterval(n); } catch (e) { void e; } render(); }
      return;
    }
    // 清空数据 app 复选
    const wipeCb = t.closest('[data-set-wipe-app]') as HTMLInputElement | null;
    if (wipeCb) {
      const id = wipeCb.getAttribute('data-set-wipe-app') || '';
      if (wipeCb.checked) _wipeSel.add(id); else _wipeSel.delete(id);
      render();
      return;
    }
    // API 采样模式切换：custom 时启用数字框
    const sampMode = t.closest('.thw-set-sampmode') as HTMLSelectElement | null;
    if (sampMode) {
      const cls = sampMode.getAttribute('data-samp-for') || '';
      const inp = rootEl()?.querySelector('.' + cls) as HTMLInputElement | null;
      if (inp) { if (sampMode.value === 'custom') { inp.disabled = false; if (!inp.value) inp.value = '1'; } else inp.disabled = true; }
      return;
    }
    // 全局生态：性别模式切换 → 显隐比例滑块 / 自定义框
    if (t.classList.contains('thw-set-gender-mode')) {
      const mode = (t as HTMLSelectElement).value;
      const ratioEl = rootEl()?.querySelector('[data-set-gender-ratio]') as HTMLElement | null;
      const customEl = rootEl()?.querySelector('[data-set-gender-custom]') as HTMLElement | null;
      if (ratioEl) ratioEl.hidden = mode !== 'ratio';
      if (customEl) customEl.hidden = mode !== 'custom';
      return;
    }
    // 全局生态：比例滑块 → 实时更新男/女百分比标签
    if (t.classList.contains('thw-set-gender-pct')) {
      const male = Math.max(0, Math.min(100, Number((t as HTMLInputElement).value) || 0));
      const ml = rootEl()?.querySelector('.thw-set-gender-pct-lbl');
      const fl = rootEl()?.querySelector('.thw-set-gender-fempct-lbl');
      if (ml) ml.textContent = `${male}%`;
      if (fl) fl.textContent = `${100 - male}%`;
      return;
    }
    // 读取管理：即时落库（只保留真正全局生效的「最大字数」；读不读/读几楼归各 app 自己设）
    if (t.classList.contains('thw-set-read-maxchars')) { setGlobalReadConfig({ maxChars: Math.max(0, Number((t as HTMLInputElement).value) || 0) }); return; }
    // 排除标签：直接改 head/tail 输入框即时落库
    const exEdit = t.closest('[data-extag-edit]') as HTMLInputElement | null;
    if (exEdit) {
      const row = exEdit.closest('[data-extag-i]') as HTMLElement | null;
      const i = Number(row?.getAttribute('data-extag-i'));
      const tags = (getGlobalReadConfig().excludeTags || []).slice();
      if (i >= 0 && i < tags.length) {
        const which = exEdit.getAttribute('data-extag-edit');
        if (which === 'head') tags[i] = { ...tags[i], head: exEdit.value.trim() };
        else tags[i] = { ...tags[i], tail: exEdit.value.trim() };
        setGlobalReadConfig({ excludeTags: tags });
      }
      return;
    }
    // 提取标签：直接改 head/tail 输入框即时落库
    const xEdit = t.closest('[data-xtag-edit]') as HTMLInputElement | null;
    if (xEdit) {
      const row = xEdit.closest('[data-xtag-i]') as HTMLElement | null;
      const i = Number(row?.getAttribute('data-xtag-i'));
      const tags = (getGlobalReadConfig().extractTags || []).slice();
      if (i >= 0 && i < tags.length) {
        const which = xEdit.getAttribute('data-xtag-edit');
        if (which === 'head') tags[i] = { ...tags[i], head: xEdit.value.trim() };
        else tags[i] = { ...tags[i], tail: xEdit.value.trim() };
        setGlobalReadConfig({ extractTags: tags });
      }
      return;
    }
  });
}

// ==================== 数据导出/导入/清理 ====================
function collectWorldKeys(): string[] {
  const keys: string[] = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('_th_world_')) keys.push(k); } } catch (e) { void e; }
  return keys;
}
function exportWorldData(): void {
  try {
    const data: Record<string, string> = {};
    for (const k of collectWorldKeys()) { const v = localStorage.getItem(k); if (v != null) data[k] = v; }
    const blob = new Blob([JSON.stringify({ _kind: 'th_world_pack', _ts: Date.now(), data }, null, 2)], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `世界套件数据_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
    thToast('已导出套件数据', 'success');
  } catch (e) { void e; thToast('导出失败', 'error'); }
}
function importWorldData(): void {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = () => {
    const f = inp.files?.[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const obj = JSON.parse(String(fr.result || '{}'));
        const data = obj?.data && typeof obj.data === 'object' ? obj.data : (obj && obj._kind ? {} : obj);
        void thConfirm({ title: '导入套件数据', message: '将用文件中的数据覆盖当前套件数据。建议先导出备份。继续？', danger: true, confirmText: '导入覆盖' }).then(ok => {
          if (!ok) return;
          let n = 0;
          for (const k of Object.keys(data)) { if (k.startsWith('_th_world_')) { try { localStorage.setItem(k, String(data[k])); n++; } catch (e) { void e; } } }
          thToast(`已导入 ${n} 项，刷新各 app 生效`, 'success'); render();
        });
      } catch (e) { void e; thToast('文件解析失败', 'error'); }
    };
    fr.readAsText(f);
  };
  inp.click();
}
function wipeAppData(ids: string[]): number {
  // 只清选中 app 的内容数据 key，保留接口/读取/提示词/通讯录等共享配置。
  let n = 0;
  for (const id of ids) {
    const def = APP_DATA_KEYS.find(a => a.id === id);
    if (!def) continue;
    for (const k of def.keys) { try { localStorage.removeItem(k); } catch (e) { void e; } }
    n++;
  }
  render();
  return n;
}

// ==================== 入口 ====================
function openApp(): void {
  openModal2(`${iconHtml('fa-gear')} 设置`, phoneShellHtml({ rid: RID, appClass: 'th-settings' }), {
    maxWidth: SET_MODAL_MAXW, reset: true, revive: openApp, phone: true,
  });
  startPhoneClock();
  bindRoot();
  render();
}
export function openSettingsApp(cat?: Cat): void {
  _cat = cat || 'api'; _contactEdit = null; _apiSel = getActiveWorldApiName(); _modelCache = [];
  openApp();
}

registerWorldApp({
  id: 'settings', name: '设置', icon: 'fa-gear',
  accent: 'linear-gradient(135deg,#64748b,#94a3b8)', order: 999, open: () => openSettingsApp(),
});

try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_settings_app__ = { openSettingsApp };
} catch (e) { void e; }
