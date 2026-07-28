// 套件独立 API 管理（world-api.ts）
// 套件 API 与外部状态栏 API **完全独立隔离**。各 app 生成一律走套件自有预设，
//   未配置时明确提示去「设置→API」配，不静默回退状态栏。
// 保留「从状态栏一键导入预设」便捷入口（仅复制，不联动）。
// 预设结构与状态栏 ApiPreset 同构（modules/api-settings.ts），保证导入是直接复制。
// 纯数据层，不碰 DOM。key：_th_world_api_v1（预设列表）/ _th_world_api_active_v1（活动预设名）。
import { readWorldJson, writeWorldJson } from './world-store';
import { getRoot } from '../tavern-api';

export type SamplingVal = 'same_as_preset' | 'unset' | number;
export type WorldApiPreset = {
  name: string;
  source: string;          // API 源，默认 openai
  apiurl: string;
  key: string;
  model: string;
  temperature: SamplingVal;
  max_tokens: SamplingVal;
  top_p: SamplingVal;
  frequency_penalty: SamplingVal;
  presence_penalty: SamplingVal;
  top_k: SamplingVal;
};

const LS_PRESETS = '_th_world_api_v1';
const LS_ACTIVE = '_th_world_api_active_v1';

export const DEFAULT_WORLD_API_PRESET: WorldApiPreset = {
  name: '默认', source: 'openai', apiurl: '', key: '', model: '',
  temperature: 'same_as_preset', max_tokens: 'same_as_preset', top_p: 'same_as_preset',
  frequency_penalty: 'same_as_preset', presence_penalty: 'same_as_preset', top_k: 'same_as_preset',
};

// ==================== 持久化 ====================
export function getWorldApiPresets(): WorldApiPreset[] {
  const arr = readWorldJson<WorldApiPreset[]>(LS_PRESETS, []);
  if (!Array.isArray(arr) || !arr.length) return [{ ...DEFAULT_WORLD_API_PRESET }];
  return arr;
}
export function saveWorldApiPresets(arr: WorldApiPreset[]): void {
  writeWorldJson(LS_PRESETS, arr.length ? arr : [{ ...DEFAULT_WORLD_API_PRESET }]);
}
export function getActiveWorldApiName(): string {
  const raw = readWorldJson<string>(LS_ACTIVE, '');
  const list = getWorldApiPresets();
  if (raw && list.some(p => p.name === raw)) return raw;
  return list[0]?.name || '默认';
}
export function setActiveWorldApiName(name: string): void {
  writeWorldJson(LS_ACTIVE, name);
}
export function getActiveWorldApiPreset(): WorldApiPreset | null {
  const list = getWorldApiPresets();
  return list.find(p => p.name === getActiveWorldApiName()) || list[0] || null;
}
export function getWorldApiPreset(name: string): WorldApiPreset | null {
  return getWorldApiPresets().find(p => p.name === name) || null;
}
// 套件预设名列表（供各 app 的 API 下拉用，取代旧的状态栏 getApiPresetNames）
export function getWorldApiPresetNames(): string[] {
  return getWorldApiPresets().map(p => p.name);
}

// 增/删/重命名/更新单条（UI 用）。返回最新列表。
export function upsertWorldApiPreset(p: WorldApiPreset, originalName?: string): WorldApiPreset[] {
  const list = getWorldApiPresets();
  const key = originalName || p.name;
  const i = list.findIndex(x => x.name === key);
  if (i >= 0) list[i] = p; else list.push(p);
  saveWorldApiPresets(list);
  return list;
}
export function deleteWorldApiPreset(name: string): WorldApiPreset[] {
  let list = getWorldApiPresets().filter(p => p.name !== name);
  if (!list.length) list = [{ ...DEFAULT_WORLD_API_PRESET }];
  saveWorldApiPresets(list);
  if (getActiveWorldApiName() === name) setActiveWorldApiName(list[0].name);
  return list;
}
export function addWorldApiPreset(name: string): WorldApiPreset[] {
  const list = getWorldApiPresets();
  let n = name.trim() || '新预设';
  let i = 1; const base = n;
  while (list.some(p => p.name === n)) { n = `${base}${i++}`; }
  list.push({ ...DEFAULT_WORLD_API_PRESET, name: n });
  saveWorldApiPresets(list);
  return list;
}

// ==================== 是否已配置（UI 据此提示）====================
export function isWorldApiConfigured(): boolean {
  const p = getActiveWorldApiPreset();
  return !!(p && p.apiurl && p.apiurl.trim());
}

// ==================== 从状态栏导入（便捷复制，非联动）====================
export function listStatusBarApiPresets(): { name: string }[] {
  try {
    const raw = localStorage.getItem('_th_api_presets_v1');
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((x: any) => ({ name: String(x?.name ?? '').trim() })).filter(x => x.name);
  } catch (e) { void e; return []; }
}
// 导入全部状态栏预设（同名跳过/覆盖由 overwrite 决定）。返回导入条数。
export function importFromStatusBar(overwrite = false): number {
  let src: any[] = [];
  try {
    const raw = localStorage.getItem('_th_api_presets_v1');
    src = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(src)) src = [];
  } catch (e) { void e; return 0; }
  if (!src.length) return 0;
  const list = getWorldApiPresets();
  // 若当前只有一个空默认，导入时清掉它
  const onlyEmptyDefault = list.length === 1 && !list[0].apiurl && list[0].name === '默认';
  const base = onlyEmptyDefault ? [] : list;
  let n = 0;
  for (const s of src) {
    const p: WorldApiPreset = {
      name: String(s?.name ?? '').trim() || '导入预设',
      source: s?.source || 'openai', apiurl: s?.apiurl || '', key: s?.key || '', model: s?.model || '',
      temperature: s?.temperature ?? 'same_as_preset', max_tokens: s?.max_tokens ?? 'same_as_preset',
      top_p: s?.top_p ?? 'same_as_preset', frequency_penalty: s?.frequency_penalty ?? 'same_as_preset',
      presence_penalty: s?.presence_penalty ?? 'same_as_preset', top_k: s?.top_k ?? 'same_as_preset',
    };
    const i = base.findIndex(x => x.name === p.name);
    if (i >= 0) { if (overwrite) { base[i] = p; n++; } }
    else { base.push(p); n++; }
  }
  saveWorldApiPresets(base);
  if (!getActiveWorldApiPreset()?.apiurl && base[0]) setActiveWorldApiName(base[0].name);
  return n;
}

// ==================== generate 配置组装（供 ai-chat 调用）====================
export type WorldCustomApi = {
  source?: string; apiurl?: string; key?: string; model?: string;
  temperature?: SamplingVal; max_tokens?: SamplingVal; top_p?: SamplingVal;
  frequency_penalty?: SamplingVal; presence_penalty?: SamplingVal; top_k?: SamplingVal;
};
export type WorldGenConfig = { custom_api?: WorldCustomApi; usedPresetName?: string; configured: boolean };

// 只读套件 store；aiPresetNameOverride 指定用哪条套件预设，缺省用活动预设。
export function resolveWorldApiConfig(aiPresetNameOverride?: string): WorldGenConfig {
  const p = (aiPresetNameOverride ? getWorldApiPreset(aiPresetNameOverride) : null) || getActiveWorldApiPreset();
  if (!p || !p.apiurl || !p.apiurl.trim()) return { configured: false };
  const c: WorldCustomApi = { source: p.source, apiurl: p.apiurl, model: p.model };
  if (p.key) c.key = p.key;
  c.temperature = p.temperature; c.max_tokens = p.max_tokens; c.top_p = p.top_p;
  c.frequency_penalty = p.frequency_penalty; c.presence_penalty = p.presence_penalty; c.top_k = p.top_k;
  return { custom_api: c, usedPresetName: p.name, configured: true };
}

// ==================== 模型列表拉取 / 连接测试 ====================
function getFn<T = any>(name: string): T | null {
  try {
    const w = window as any;
    if (typeof w[name] === 'function') return w[name] as T;
    const r = getRoot() as any;
    if (r && typeof r[name] === 'function') return r[name] as T;
  } catch (e) { void e; }
  return null;
}
export async function fetchWorldApiModels(preset: WorldApiPreset): Promise<string[]> {
  const fn = getFn<(cfg: { apiurl: string; key?: string }) => Promise<string[]>>('getModelList');
  if (!fn || !preset.apiurl) return [];
  try { return (await fn({ apiurl: preset.apiurl, key: preset.key || undefined })) || []; }
  catch (e) { void e; return []; }
}
// 连接测试：用指定预设发一句 ping。成功返回回复文本，失败 throw。
export async function testWorldApi(preset: WorldApiPreset): Promise<string> {
  const gen = getFn<(cfg: any) => Promise<unknown>>('generateRaw');
  if (!gen) throw new Error('当前环境无 generateRaw 接口');
  if (!preset.apiurl) throw new Error('请先填写 Base URL');
  const c: WorldCustomApi = { source: preset.source, apiurl: preset.apiurl, model: preset.model };
  if (preset.key) c.key = preset.key;
  const ret = await gen({ ordered_prompts: [{ role: 'user', content: 'ping' }], should_silence: true, custom_api: c });
  return typeof ret === 'string' ? ret : JSON.stringify(ret);
}

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_api__ = { getWorldApiPresets, getActiveWorldApiPreset, resolveWorldApiConfig, isWorldApiConfigured, importFromStatusBar };
} catch (e) { void e; }
