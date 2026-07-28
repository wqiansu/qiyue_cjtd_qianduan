// 世界套件·共享数据底座（world-store）
// 职责：
//   1. `_th_world_*` localStorage 统一读写（iframe 内 plain localStorage，与整包导出口径一致）。
//   2. 套件全局配置（comfyui 后端 / 记忆三层阈值 / 桌面主题），玩家在套件设置面板可改。
//   3. APP 注册表：各 APP 模块自注册到桌面，桌面壳 world-app 只读注册表，不直接 import 各 APP，避免循环依赖。
//   4. 全部 `_th_world_*` key 汇总（getWorldStorageKeys），供整包导出纳入。
// 约束：命令式、纯数据层，不碰 DOM；不引 Vue。

// ==================== localStorage key 登记（全部 _th_world_*）====================
export const WORLD_LS_KEYS = {
  config: '_th_world_config_v1',          // 套件全局配置（本文件）
  contacts: '_th_world_contacts_v1',      // 联系人中心（contacts.ts）
  wechat: '_th_world_wechat_v1',          // 微信
  evolution: '_th_world_evolution_v1',    // 世界演化
  theater: '_th_world_theater_v1',        // 小剧场
  forum: '_th_world_forum_v1',            // 世界论坛
  weibo: '_th_world_weibo_v1',            // 微博
  tangxin: '_th_world_tangxin_v1',              // 蜜语
  mofang: '_th_world_mofang_v1',          // 魔坊
  call: '_th_world_call_v1',              // 通话
  bili: '_th_world_bili_v1',              // B站
  red: '_th_world_red_v1',                // 小红书
  cal: '_th_world_cal_v1',                // 日历
  diary: '_th_world_diary_v1',            // 日记
  browser: '_th_world_browser_v1',        // 浏览器
  taobao: '_th_world_taobao_v1',           // 淘宝
  meituan: '_th_world_meituan_v1',         // 美团
  fanfan: '_th_world_fanfan_v1',           // 饭饭·探店点评
  xmly: '_th_world_xmly_v1',               // 喜马拉雅·听书电台
  zui: '_th_world_zui_v1',                  // 最右·抽象UGC搞笑社区
  wkb: '_th_world_wkb_v1',                   // 工作台·通用AI造物机（模板/产物/设置，纯本地）
  prompts: '_th_world_prompts_v1',        // 各 APP 提示词模板覆盖（world-prompts.ts）
  wstate: '_th_world_wstate_v1',          // 结构化世界态（演化双模式，world-state-store.ts）
  wbsync: '_th_world_wbsync_v1',          // 各 APP 世界书注入配置（wb-sync.ts）
  apiplan: '_th_world_apiplan_v1',        // 各 APP API 利用配置（api-plan.ts）
  api: '_th_world_api_v1',                // 套件独立 API 预设列表（world-api.ts）
  apiActive: '_th_world_api_active_v1',   // 套件活动 API 预设名
  readcfg: '_th_world_read_v1',           // 套件读取管理（全局默认+每app覆盖，read-config.ts）
  injectsel: '_th_world_injectsel_v1',    // 各 app 注入片段选择/方式（inject-plan.ts）
  injectstash: '_th_world_injectstash_v1', // 各 app 注入暂存夹（界面「加入注入」汇总，inject-plan.ts）
  injectcustom: '_th_world_injectcustom_v1', // 各 app 自定义自由注入片段（玩家手写，inject-plan.ts）
  memAppCfg: '_th_world_memappcfg_v1',     // 各 app 记忆总结画像玩家覆盖（memory.ts）
  catwb: '_th_world_catwb_v1',             // 各 app 分类提示词绑定的世界书条目
  // 记忆中心（memory.ts）：会话索引 + 每会话一个记忆 blob（四层）。
  memIndex: '_th_world_mem_index_v1',     // 会话索引（枚举/分组用）
  memPrefix: '_th_world_mem_',            // 每会话记忆 blob：_th_world_mem_<sessionId>（前缀也覆盖 memIndex 本身）
  // 角色记忆池（memory.ts）：按 contactId 的跨 app 共享记忆体 + 池索引。
  poolIndex: '_th_world_pool_index_v1',   // 角色池索引（枚举/分组用）
  poolPrefix: '_th_world_pool_',          // 每角色池 blob：_th_world_pool_<contactId>（前缀也覆盖 poolIndex）
} as const;

// ==================== 套件全局配置 ====================
export type ComfyUiConfig = {
  enabled: boolean;        // 是否启用文生图（默认关，降级占位）
  url: string;             // comfyui 地址，默认 http://127.0.0.1:8188
  workflowJson: string;    // 工作流模板（JSON 文本，占位符 {{prompt}}），空则不出图
};
// 固定三层压缩（近期→中期→远期）。触发主尺为「累积字数」，条数作保底副尺（先到为准），
//   因不同 app 单条信息量差异极大（微信一句 vs 糖心一大段）。
export type MemoryConfig = {
  // —— 小结触发（原始 raw → 近期）：字数为主尺 + 条数保底，先到为准 ——
  charThreshold: number;   // 累积字数触发一次小结（新主尺，各 app 按体量定制，默认 5000）
  shortThreshold: number;  // 条数保底副尺：攒够 N 条也触发（默认 30；仍兼容旧字段名）
  // —— 逐层归纳阈值 ——
  midThreshold: number;    // 近期→中期：每 N 条近期归纳为一条中期（默认 5，兼容旧 longThreshold）
  farThreshold: number;    // 中期→远期：每 N 条中期并入远期主线（默认 4）
  longThreshold: number;   // 【兼容保留】旧「短期→长期」阈值；迁移后等同 midThreshold，勿再直接用
  // —— 注入携带 ——
  recentRawCount: number;  // 注入时附带的「最近原始对话」条数（默认 6）
  recentShortCount: number;// 【兼容保留】三层全带后仅作软上限参考（默认 3）
  // —— 三层压缩产物字数上限（写进三条压缩提示词，玩家可改）——
  recentCap: number;       // 近期小结 ≤ 字数（默认 400，细节丰富）
  midCap: number;          // 中期归纳 ≤ 字数（默认 600，脉络）
  farCap: number;          // 远期主线 ≤ 字数（默认 1000，只留经久事实与走向）
};
// 全局图片描述字数范围（玩家自定义 sceneDesc/coverDesc 等图片中文描述的篇幅）。
export type ImageDescConfig = {
  minWords: number;        // 图片描述下限字数（默认 20）
  maxWords: number;        // 图片描述上限字数（默认 60）
};
// 全局互动用户性别设置（同步到全部 app 的人物/路人生成）。本卡世界观默认全女性（百合GL），但玩家可全局覆盖。
export type GenderMode = 'allFemale' | 'allMale' | 'ratio' | 'custom';
export type GenderConfig = {
  mode: GenderMode;        // 全女 / 全男 / 男女比例 / 自定义
  malePercent: number;     // mode='ratio' 时男性占比 0-100（女性=100-该值）
  customText: string;      // mode='custom' 时玩家自定义的性别生态描述（直接进提示词）
};
export type WorldConfig = {
  comfyui: ComfyUiConfig;
  memory: MemoryConfig;
  imageDesc: ImageDescConfig;
  gender: GenderConfig;
  theme: string;           // 外壳主题（平板机身 + 背景 + 桌面壁纸），默认 'candy'
  ballSkin: string;        // 桌面悬浮球皮肤（crystal/ink/glass），默认 'crystal'
  autoStop: boolean;       // 全局急停：为 true 时所有 app 的「每 N 楼自动…」一律不触发（总闸）
};

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  comfyui: { enabled: false, url: 'http://127.0.0.1:8188', workflowJson: '' },
  memory: {
    charThreshold: 5000, shortThreshold: 30,
    midThreshold: 5, farThreshold: 4, longThreshold: 5,
    recentRawCount: 6, recentShortCount: 3,
    recentCap: 400, midCap: 600, farCap: 1000,
  },
  imageDesc: { minWords: 20, maxWords: 60 },
  gender: { mode: 'allFemale', malePercent: 50, customText: '' },
  theme: 'candy',
  ballSkin: 'crystal',
  autoStop: false,
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
    imageDesc: { ...DEFAULT_WORLD_CONFIG.imageDesc, ...(raw.imageDesc || {}) },
    gender: { ...DEFAULT_WORLD_CONFIG.gender, ...(raw.gender || {}) },
    theme: raw.theme || DEFAULT_WORLD_CONFIG.theme,
    ballSkin: raw.ballSkin || DEFAULT_WORLD_CONFIG.ballSkin,
    autoStop: raw.autoStop ?? DEFAULT_WORLD_CONFIG.autoStop,
  };
  return _configCache;
}
export function saveWorldConfig(patch: Partial<WorldConfig>): WorldConfig {
  const cur = getWorldConfig();
  const next: WorldConfig = {
    comfyui: { ...cur.comfyui, ...(patch.comfyui || {}) },
    memory: { ...cur.memory, ...(patch.memory || {}) },
    imageDesc: { ...cur.imageDesc, ...(patch.imageDesc || {}) },
    gender: { ...cur.gender, ...(patch.gender || {}) },
    theme: patch.theme ?? cur.theme,
    ballSkin: patch.ballSkin ?? cur.ballSkin,
    autoStop: patch.autoStop ?? cur.autoStop,
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
  unread?: () => number;   // 可选：返回该 app 的未读数（桌面图标红点 + 状态栏聚合用）；0/缺省=无红点
  wbKeys?: () => string[]; // 可选，返回本 app 当前绑定的世界书条目 key 列表；提供后 chatGenerate 会集中注入
};
const _appRegistry = new Map<string, WorldAppDef>();
// 绑定世界书取值器待转交缓冲——若 registerWorldApp 早于 ai-chat 的 window 桥挂载，先缓冲，稍后 flush。
const _pendingWbKeyGetters: { id: string; getter: () => string[] }[] = [];
function flushWbKeyGetters(): void {
  try {
    const bridge = (window as any).__th_world_ai_chat__;
    if (!bridge?.registerAppWbKeys) return;
    while (_pendingWbKeyGetters.length) { const g = _pendingWbKeyGetters.shift()!; try { bridge.registerAppWbKeys(g.id, g.getter); } catch (e) { void e; } }
  } catch (e) { void e; }
}
export function registerWorldApp(def: WorldAppDef): void {
  _appRegistry.set(def.id, def);
  // 把本 app 的「绑定世界书条目取值器」转交给 ai-chat 的集中注入登记（window 桥，避免与 ai-chat 循环 import）。
  if (def.wbKeys) {
    _pendingWbKeyGetters.push({ id: def.id, getter: def.wbKeys });
    flushWbKeyGetters();
    // 桥尚未挂载则下一 tick 再试（ai-chat 模块 eval 完就会有）。
    if (_pendingWbKeyGetters.length) { try { setTimeout(flushWbKeyGetters, 0); } catch (e) { void e; } }
  }
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
  const keys: string[] = [WORLD_LS_KEYS.config, WORLD_LS_KEYS.contacts, WORLD_LS_KEYS.wechat, WORLD_LS_KEYS.evolution, WORLD_LS_KEYS.theater, WORLD_LS_KEYS.forum, WORLD_LS_KEYS.weibo, WORLD_LS_KEYS.tangxin, WORLD_LS_KEYS.mofang, WORLD_LS_KEYS.call, WORLD_LS_KEYS.bili, WORLD_LS_KEYS.red, WORLD_LS_KEYS.cal, WORLD_LS_KEYS.diary, WORLD_LS_KEYS.browser, WORLD_LS_KEYS.taobao, WORLD_LS_KEYS.meituan, WORLD_LS_KEYS.fanfan, WORLD_LS_KEYS.xmly, WORLD_LS_KEYS.prompts, WORLD_LS_KEYS.wbsync, WORLD_LS_KEYS.apiplan, WORLD_LS_KEYS.api, WORLD_LS_KEYS.apiActive, WORLD_LS_KEYS.readcfg, WORLD_LS_KEYS.injectsel, WORLD_LS_KEYS.injectstash, WORLD_LS_KEYS.injectcustom, WORLD_LS_KEYS.memAppCfg, WORLD_LS_KEYS.catwb, WORLD_LS_KEYS.wkb, '_th_world_promptwb_v1', '_th_world_promptflags_v1', '_th_world_qualitycustom_v1', '_th_world_writer_persona_v1', '_th_world_evo_config_v1', '_th_world_clock_v1'];
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
