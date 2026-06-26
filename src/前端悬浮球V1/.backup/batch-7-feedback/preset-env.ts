//批次3 · 任务4 酒馆环境预设共享层（preset-env）。
// 把对酒馆 preset / generate 全局接口的访问集中封装，给 api-settings 面板和（批次4）ai-summarize 共用。
// 两维度正交：① API 连接（api-settings 活动预设→custom_api）× ② 提示词预设（选酒馆预设名→preset_name）。
// 全局接口（getPresetNames/getLoadedPresetName/getPreset/loadPreset/generateRaw/generate）在 @types/function ambient 声明，
// 但脚本运行在 iframe，需走 getRoot() 取 parent window 兜底（同 safeGetWorldbook 范式）。
// 命令式 innerHTML + openModal2，不引 Vue。严格向下兼容：不改现有 _th_api_* key、不破坏现有函数签名。
// ================================================================
import { getRoot } from './tavern-api';
import { __doc } from './dom-utils';

// 持久化：选的提示词预设名 + 仅本次有效标志
const LS_PRESETENV = '_th_presetenv_active_v1';

type PresetEnvPersist = {
  presetName: string | '';          // 选的酒馆提示词预设名；'' = 用内置总结提示词（不传 preset_name）
  onceOnly: boolean;                 // true = 仅本次有效（generate 时临时传 preset_name，不 loadPreset）
  aiPresetName: string | '';         // 选的已保存 API 预设名（来自 _th_api_presets_v1）；'' = 用活动预设兜底
};

function loadPresetEnv(): PresetEnvPersist {
  try {
    const raw = localStorage.getItem(LS_PRESETENV);
    if (raw) {
      const p = JSON.parse(raw) as Partial<PresetEnvPersist>;
      return { presetName: p.presetName ?? '', onceOnly: !!p.onceOnly, aiPresetName: p.aiPresetName ?? '' };
    }
  } catch (e) { void e; }
  return { presetName: '', onceOnly: true, aiPresetName: '' };
}
function savePresetEnv(p: PresetEnvPersist): void {
  try { localStorage.setItem(LS_PRESETENV, JSON.stringify(p)); } catch (e) { void e; }
}

// ---- 全局接口兜底取（iframe→parent window）----

function getFn<T = any>(name: string): T | null {
  try {
    const w = window as any;
    if (typeof w[name] === 'function') return w[name] as T;
    const p = getRoot();
    if (p && typeof p[name] === 'function') return p[name] as T;
  } catch (e) { void e; }
  return null;
}

// getPresetNames(): string[]
export function getEnvPresetNames(): { name: string; isLoaded: boolean }[] {
  const fn = getFn<() => string[]>('getPresetNames');
  if (!fn) return [];
  try {
    const names = fn() || [];
    const loaded = getEnvLoadedPresetName();
    return names.filter(n => n && n !== 'in_use').map(n => ({ name: n, isLoaded: n === loaded }));
  } catch (e) { console.warn('[preset-env] getPresetNames 失败', e); return []; }
}

// getLoadedPresetName(): string
export function getEnvLoadedPresetName(): string {
  const fn = getFn<() => string>('getLoadedPresetName');
  if (!fn) return '';
  try { return fn() || ''; } catch (e) { void e; return ''; }
}

// getPreset(name): Preset | null（非法/不存在返回 null）
export function getEnvPresetDetail(name: string): { prompts: any[]; settings: any; promptCount: number } | null {
  const fn = getFn<(n: string) => any>('getPreset');
  if (!fn) return null;
  try {
    const p = fn(name);
    if (!p || typeof p !== 'object') return null;
    const prompts = Array.isArray(p.prompts) ? p.prompts : [];
    return { prompts, settings: p.settings || {}, promptCount: prompts.length };
  } catch (e) { console.warn('[preset-env] getPreset 失败', name, e); return null; }
}

// loadPreset(name): boolean（切换酒馆全局预设，影响正常聊天）
export function envLoadPreset(name: string): boolean {
  const fn = getFn<(n: string) => boolean>('loadPreset');
  if (!fn) return false;
  try { return !!fn(name); } catch (e) { console.warn('[preset-env] loadPreset 失败', name, e); return false; }
}

// 导出预设快照 JSON
export function exportEnvPresetSnapshot(name: string): void {
  const detail = getEnvPresetDetail(name);
  if (!detail) { toastr?.error?.('读取预设失败（可能不存在或环境无 getPreset）'); return; }
  // 完整 Preset 对象再取一次（含 extensions/prompts_unused）
  const fn = getFn<(n: string) => any>('getPreset');
  const full = fn ? (() => { try { return fn(name); } catch { return null; } })() : null;
  const payload = full || { name, settings: detail.settings, prompts: detail.prompts };
  // 下载（内联，避免 lib→modules 反向依赖 downloadText）
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const a = __doc.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `提示词预设_${name}_${new Date().toISOString().slice(0, 10)}.json`;
  __doc.body.appendChild(a); a.click(); __doc.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  toastr?.success?.(`已导出预设「${name}」（${detail.promptCount} 条提示词）`);
}

// ==================== resolveGenerateApiConfig（D.2/D.3 核心）====================
// 读 api-settings 活动预设 → custom_api；读面板选的提示词预设 → preset_name。组装 generate 调用配置。
// - aiMode: 'custom'(用 api-settings 活动预设建 custom_api) | 'tavern'(用酒馆当前源，不传 custom_api)
// - presetName: 选的酒馆提示词预设名（''=不传 preset_name，用 generate 内置提示词）
// 调用方（ai-summarize）可选 onceOnly：true=只在 generate 调用里临时传 preset_name，不 loadPreset。

type CustomApiFromPreset = {
  source?: string; apiurl?: string; key?: string; model?: string;
  temperature?: 'same_as_preset' | 'unset' | number; max_tokens?: 'same_as_preset' | 'unset' | number;
  top_p?: 'same_as_preset' | 'unset' | number; frequency_penalty?: 'same_as_preset' | 'unset' | number;
  presence_penalty?: 'same_as_preset' | 'unset' | number; top_k?: 'same_as_preset' | 'unset' | number;
};

// 读 api-settings 活动预设内容（仿 api-settings：直接读 localStorage，避免跨模块状态）
function readApiActivePreset(): { source: string; apiurl: string; key: string; model: string;
  temperature: 'same_as_preset' | 'unset' | number; max_tokens: 'same_as_preset' | 'unset' | number;
  top_p: 'same_as_preset' | 'unset' | number; frequency_penalty: 'same_as_preset' | 'unset' | number;
  presence_penalty: 'same_as_preset' | 'unset' | number; top_k: 'same_as_preset' | 'unset' | number; } | null {
  try {
    const presetsRaw = localStorage.getItem('_th_api_presets_v1');
    if (!presetsRaw) return null;
    const arr = JSON.parse(presetsRaw);
    if (!Array.isArray(arr) || !arr.length) return null;
    const activeName = localStorage.getItem('_th_api_active_v1') || arr[0].name;
    const p = arr.find((x: any) => x.name === activeName) || arr[0];
    return apiPresetToConfig(p);
  } catch (e) { console.warn('[preset-env] 读 api 活动预设失败', e); return null; }
}

// 按名读已保存的 API 预设（来自 _th_api_presets_v1）。找不到返回 null。
function readApiPresetByName(name: string): { source: string; apiurl: string; key: string; model: string;
  temperature: 'same_as_preset' | 'unset' | number; max_tokens: 'same_as_preset' | 'unset' | number;
  top_p: 'same_as_preset' | 'unset' | number; frequency_penalty: 'same_as_preset' | 'unset' | number;
  presence_penalty: 'same_as_preset' | 'unset' | number; top_k: 'same_as_preset' | 'unset' | number; } | null {
  try {
    const presetsRaw = localStorage.getItem('_th_api_presets_v1');
    if (!presetsRaw) return null;
    const arr = JSON.parse(presetsRaw);
    if (!Array.isArray(arr) || !arr.length) return null;
    const p = arr.find((x: any) => x.name === name);
    if (!p) return null;
    return apiPresetToConfig(p);
  } catch (e) { console.warn('[preset-env] 读 api 预设失败', name, e); return null; }
}

// 复用：把 _th_api_presets_v1 里的一条原始对象转成 resolve 用的配置形状
function apiPresetToConfig(p: any) {
  return {
    source: p.source || 'openai', apiurl: p.apiurl || '', key: p.key || '', model: p.model || '',
    temperature: p.temperature ?? 'same_as_preset', max_tokens: p.max_tokens ?? 'same_as_preset',
    top_p: p.top_p ?? 'same_as_preset', frequency_penalty: p.frequency_penalty ?? 'same_as_preset',
    presence_penalty: p.presence_penalty ?? 'same_as_preset', top_k: p.top_k ?? 'same_as_preset',
  };
}

// 列出已保存的 API 预设名（给 api-settings AI 区块下拉用）
export function getApiPresetNames(): string[] {
  try {
    const raw = localStorage.getItem('_th_api_presets_v1');
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((x: any) => String(x?.name ?? '').trim()).filter(Boolean);
  } catch { return []; }
}

export type GenerateApiConfig = {
  custom_api?: CustomApiFromPreset;
  preset_name?: string;
  /** 提示词预设是否仅本次有效：true=generate 临时传不切全局；false=调用方需先 loadPreset 切酒馆全局预设 */
  onceOnly?: boolean;
  /** 实际使用的 API 预设名（优先指定名，否则活动预设）— 供调用方记录/提示 */
  usedApiPresetName?: string;
};

// 主组装函数：给 ai-summarize 调。
// - aiPresetNameOverride: 指定用哪个已保存 API 预设；'' 或 undefined = 用活动预设兜底
// - presetNameOverride / onceOnlyOverride: 覆盖提示词预设选择
// 反馈修复（2026-06-24）：废弃 aiMode(custom/tavern) 概念，改为"选哪个已保存的 API 预设"；custom_api 一律从 _th_api_presets_v1 取
export function resolveGenerateApiConfig(aiPresetNameOverride?: string, presetNameOverride?: string, onceOnlyOverride?: boolean): GenerateApiConfig {
  const cfg: GenerateApiConfig = {};
  const aiName = aiPresetNameOverride !== undefined ? aiPresetNameOverride : loadPresetEnv().aiPresetName;
  // 优先取指定名预设，找不到则活动预设兜底
  const p = (aiName ? readApiPresetByName(aiName) : null) || readApiActivePreset();
  if (p && p.apiurl) {
    const c: CustomApiFromPreset = { source: p.source, apiurl: p.apiurl, model: p.model };
    if (p.key) c.key = p.key;
    c.temperature = p.temperature; c.max_tokens = p.max_tokens; c.top_p = p.top_p;
    c.frequency_penalty = p.frequency_penalty; c.presence_penalty = p.presence_penalty; c.top_k = p.top_k;
    cfg.custom_api = c;
    cfg.usedApiPresetName = aiName || (localStorage.getItem('_th_api_active_v1') || '');
  }
  const pe = loadPresetEnv();
  const presetName = presetNameOverride !== undefined ? presetNameOverride : pe.presetName;
  if (presetName && presetName !== 'in_use') {
    cfg.preset_name = presetName;
    cfg.onceOnly = onceOnlyOverride !== undefined ? onceOnlyOverride : pe.onceOnly;
  }
  return cfg;
}

// ==================== 给 api-settings 面板用的 getter/setter ====================

export function getPresetEnvPersist(): PresetEnvPersist { return loadPresetEnv(); }
export function setPresetEnvPersist(p: PresetEnvPersist): void { savePresetEnv(p); }

// ==================== 连接测试：发 ping ====================

// 酒馆当前源/环境预设测试：发一句 ping。成功返回回复文本，失败 throw。
export async function envTestPing(): Promise<string> {
  const fn = getFn<(cfg: any) => Promise<string>>('generateRaw');
  if (!fn) throw new Error('当前环境无 generateRaw 接口');
  try {
    const result = await fn({ ordered_prompts: [{ role: 'user', content: 'ping' }], should_silence: true });
    return typeof result === 'string' ? result : JSON.stringify(result);
  } catch (e) { throw e instanceof Error ? e : new Error(String(e)); }
}

// ==================== 发送前预览（D.8，#41）====================
// 读选中提示词预设的 prompts + 拼 user_input → 展示将发给 AI 的提示词文本（不实际发送）
export function previewGeneratePayload(presetName: string, userInput: string): string {
  const detail = getEnvPresetDetail(presetName || getEnvLoadedPresetName() || 'in_use');
  const lines: string[] = [];
  lines.push(`【提示词预设】${presetName || '酒馆当前加载预设'}\n`);
  if (detail && detail.prompts.length) {
    detail.prompts.forEach((pr: any, i: number) => {
      const enable = pr && pr.enabled === false ? '（禁用）' : '';
      const role = pr && pr.role ? pr.role : (pr && pr.system ? 'system' : 'user');
      const name = pr && pr.name ? pr.name : `#${i}`;
      const content = pr && pr.content != null ? String(pr.content) : '';
      lines.push(`--- [${role}] ${name}${enable} (pos:${pr?.position ?? '-'}) ---`);
      lines.push(content || '(空)');
      lines.push('');
    });
  } else {
    lines.push('(无提示词或读取失败)');
  }
  lines.push('==================== 用户输入 ====================');
  lines.push(userInput || '(空)');
  return lines.join('\n');
}