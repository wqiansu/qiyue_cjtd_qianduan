// 世界套件 P0 · 共享数据底座（world-store）
// 职责：
//   1. `_th_world_*` localStorage 统一读写（与 managed-store 同口径：iframe 内 plain localStorage，
//      整包导出 exportFullPack 也读 plain localStorage，保持一致）。
//   2. 套件全局配置（comfyui 后端 / 记忆三层阈值 / 桌面主题），玩家在套件设置面板可改。
//   3. APP 注册表：各 APP 模块（微信/世界演化/...）自注册到桌面，桌面壳 world-app 只读注册表，
//      不直接 import 各 APP，避免循环依赖 + 实现「按批次逐个出现」（§10.11 决策3）。
//   4. 全部 `_th_world_*` key 汇总（getWorldStorageKeys），供整包导出 PACK_EXTRA_KEYS 纳入。
// 约束：命令式、纯数据层，不碰 DOM；不引 Vue。

// ==================== localStorage key 登记（全部 _th_world_*）====================
export const WORLD_LS_KEYS = {
  config: '_th_world_config_v1',          // 套件全局配置（本文件）
  contacts: '_th_world_contacts_v1',      // 联系人中心（contacts.ts）
  wechat: '_th_world_wechat_v1',          // 微信（Step3）
  evolution: '_th_world_evolution_v1',    // 世界演化（Step4）
  theater: '_th_world_theater_v1',        // 小剧场（P1-A）
  forum: '_th_world_forum_v1',            // 世界论坛（P1-B）
  prompts: '_th_world_prompts_v1',        // 各 APP 提示词模板覆盖（world-prompts.ts，#8）
  // 记忆中心（memory.ts）：会话索引 + 每会话一个记忆 blob（四层）。
  memIndex: '_th_world_mem_index_v1',     // 会话索引（枚举/分组用）
  memPrefix: '_th_world_mem_',            // 每会话记忆 blob：_th_world_mem_<sessionId>（前缀也覆盖 memIndex 本身）
} as const;

// ==================== 套件全局配置 ====================
export type ComfyUiConfig = {
  enabled: boolean;        // 是否启用文生图（默认关，降级占位）
  url: string;             // comfyui 地址，默认 http://127.0.0.1:8188
  workflowJson: string;    // 工作流模板（JSON 文本，占位符 {{prompt}}），空则不出图
};
export type MemoryConfig = {
  shortThreshold: number;  // 短期：每 N 条对话（user+ai 算 N 条）触发一次小结（默认 20，玩家可改）
  longThreshold: number;   // 长期：每 N 条小结压缩为一条长期大总结（默认 5，玩家可改）
  recentRawCount: number;  // 注入时附带的「最近原始对话」条数（默认 6）
  recentShortCount: number;// 注入时附带的「最近小结」条数（默认 3，长期大总结始终全带）
};
export type WorldConfig = {
  comfyui: ComfyUiConfig;
  memory: MemoryConfig;
  theme: string;           // 桌面主题（默认 'candy' 糖果粉；各 APP 仿真皮肤后续扩展）
};

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  comfyui: { enabled: false, url: 'http://127.0.0.1:8188', workflowJson: '' },
  memory: { shortThreshold: 20, longThreshold: 5, recentRawCount: 6, recentShortCount: 3 },
  theme: 'candy',
};

// ==================== 通用 JSON 读写（_th_world_*）====================
export function readWorldJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch (e) { void e; return fallback; }
}
export function writeWorldJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { void e; }
}

// ==================== 套件配置读写 ====================
let _configCache: WorldConfig | null = null;
export function getWorldConfig(): WorldConfig {
  if (_configCache) return _configCache;
  const raw = readWorldJson<Partial<WorldConfig>>(WORLD_LS_KEYS.config, {});
  // 与默认值深合并，缺字段用默认补齐（向后兼容新增字段）
  _configCache = {
    comfyui: { ...DEFAULT_WORLD_CONFIG.comfyui, ...(raw.comfyui || {}) },
    memory: { ...DEFAULT_WORLD_CONFIG.memory, ...(raw.memory || {}) },
    theme: raw.theme || DEFAULT_WORLD_CONFIG.theme,
  };
  return _configCache;
}
export function saveWorldConfig(patch: Partial<WorldConfig>): WorldConfig {
  const cur = getWorldConfig();
  const next: WorldConfig = {
    comfyui: { ...cur.comfyui, ...(patch.comfyui || {}) },
    memory: { ...cur.memory, ...(patch.memory || {}) },
    theme: patch.theme ?? cur.theme,
  };
  _configCache = next;
  writeWorldJson(WORLD_LS_KEYS.config, next);
  return next;
}

// ==================== APP 注册表（自注册，桌面壳只读）====================
export type WorldAppDef = {
  id: string;              // 唯一 id，如 'wechat'
  name: string;            // 桌面显示名
  icon: string;            // fa 类名（经 stripFa → lucide）
  accent?: string;         // 图标底色（CSS 颜色/渐变），默认糖果粉
  order?: number;          // 桌面排序（小在前），默认 100
  open: () => void;        // 进入 APP 视图（桌面用 replace 切换，不堆叠 modal）
};
const _appRegistry = new Map<string, WorldAppDef>();
export function registerWorldApp(def: WorldAppDef): void {
  _appRegistry.set(def.id, def);
}
export function getWorldApps(): WorldAppDef[] {
  return [..._appRegistry.values()].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}
export function getWorldApp(id: string): WorldAppDef | undefined {
  return _appRegistry.get(id);
}

// ==================== 整包导出 key 汇总 ====================
// 返回所有应纳入整包导出的 _th_world_* key（固定 key + 按前缀扫描出的记忆 key）。
export function getWorldStorageKeys(): string[] {
  const keys: string[] = [WORLD_LS_KEYS.config, WORLD_LS_KEYS.contacts, WORLD_LS_KEYS.wechat, WORLD_LS_KEYS.evolution, WORLD_LS_KEYS.theater, WORLD_LS_KEYS.forum, WORLD_LS_KEYS.prompts, '_th_world_evo_config_v1'];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      // 记忆中心：会话索引 + 每会话 blob 都以 memPrefix 开头，一并纳入
      if (k.startsWith(WORLD_LS_KEYS.memPrefix)) keys.push(k);
    }
  } catch (e) { void e; }
  return keys;
}

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_store__ = { getWorldConfig, saveWorldConfig, getWorldApps, getWorldStorageKeys, WORLD_LS_KEYS };
} catch (e) { void e; }
