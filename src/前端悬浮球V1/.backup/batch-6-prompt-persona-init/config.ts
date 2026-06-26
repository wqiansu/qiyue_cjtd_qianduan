// 纯常量配置（解耦阶段 0d）。
// 全部为初始化后不变的 const 数据 + 一个纯函数 pickExtraAttrColor，
// 无模块级可变状态、无 DOM、无副作用。
// 行为与 status-bar-init.ts 原内联定义完全一致。
//
// ManagedKind 类型原在主文件 147 行定义，因 MANAGED_CFG / INITIAL_ENTRY_KINDS
// 的类型注解依赖它，连同搬到此处（纯类型，无运行时）。主文件改为 import type。
// ================================================================

export type ManagedKind = 'location'|'event'|'dlc'|'stash-item'|'stash-skill'|'stash-status'|'stash-clothing'|'stash-uncategorized'|`stash-custom-${string}`;

export const ATTR_KEYS = ['实力','魅力','智慧','专注','学识','交流','文艺','经营','手工','家务'] as const;
export const ATTR_MAX = 300;
export const ATTR_CLS: Record<string,string> = {
  实力:'attr-type-power',魅力:'attr-type-charm',智慧:'attr-type-wisdom',专注:'attr-type-focus',
  学识:'attr-type-knowledge',交流:'attr-type-social',文艺:'attr-type-art',经营:'attr-type-business',
  手工:'attr-type-craft',家务:'attr-type-housework',
};
export const NPC_METRICS = [
  {key:'心动值',icon:'fa-solid fa-heart',cls:'heart'},
  {key:'情欲值',icon:'fa-solid fa-fire-flame-curved',cls:'lust'},
  {key:'兴奋值',icon:'fa-solid fa-sparkles',cls:'excite'},
  {key:'敏感值',icon:'fa-solid fa-water',cls:'sense'},
  {key:'羞耻值',icon:'fa-solid fa-face-grin-wide',cls:'shame'},
] as const;
export const NPC_COUNTS = [
  {key:'高潮次数',icon:'fa-solid fa-sparkles'},
  {key:'被内射次数',icon:'fa-solid fa-droplet'},
] as const;
export const NPC_ICON_CFG = [
  {key:'内心想法',icon:'fa-solid fa-comment',label:'内心想法'},
  {key:'当前本能渴望',icon:'fa-solid fa-crosshairs',label:'本能渴望'},
  {key:'姿态动作',icon:'fa-solid fa-child-reaching',label:'姿态动作'},
  {key:'身体状态',icon:'fa-solid fa-hand-holding-heart',label:'身体状态'},
  {key:'基础外貌',icon:'fa-solid fa-eye',label:'基础外貌'},
] as const;
export const AVATAR_COLORS = ['#e891b9','#b89ae0','#8bb8d6','#8ec5a4','#f0b878','#d088a8','#9898d0','#68b0c8','#68b898','#e8a860'];
// 需求6：额外属性颜色集合（淡粉/糖果色系）
export const EXTRA_ATTR_COLORS = [
  'linear-gradient(90deg,#f0a0b8,#f5c0d8)',
  'linear-gradient(90deg,#e8a0c0,#f0c8e0)',
  'linear-gradient(90deg,#f5b0c0,#fad0e0)',
  'linear-gradient(90deg,#e898b0,#f5b8d0)',
  'linear-gradient(90deg,#f0a8c8,#f8d0e0)',
  'linear-gradient(90deg,#f2b0c8,#f8d0d8)',
];
export function pickExtraAttrColor(idx: number): string {
  return EXTRA_ATTR_COLORS[idx % EXTRA_ATTR_COLORS.length];
}

// ================================================================
//  需求1：地点/事件数据（localStorage 覆盖）
// ================================================================
export const MANAGED_CFG: Record<ManagedKind,{prefix:string;label:string;storageName:string;icon:string;storageKey:string;bindsWorldbook:boolean;defaultInject:string}> = {
  location: { prefix:'[地点]', label:'地点', storageName:'地点总览', icon:'fa-solid fa-map-pin', storageKey:'_th_locations_v2', bindsWorldbook:true, defaultInject:'<前往{{name}}，该地点简介：{{desc}}>' },
  event: { prefix:'[事件]', label:'事件', storageName:'事件总览', icon:'fa-solid fa-flag', storageKey:'_th_events_v1', bindsWorldbook:true, defaultInject:'<已开启事件：{{name}}，{{desc}}>' },
  dlc: { prefix:'[DLC]', label:'DLC', storageName:'DLC补充', icon:'fa-solid fa-folder-plus', storageKey:'_th_dlcs_v1', bindsWorldbook:true, defaultInject:'<已激活DLC：{{name}}，{{desc}}>' },
  'stash-item': { prefix:'', label:'物品', storageName:'储藏间·物品', icon:'fa-solid fa-box-open', storageKey:'_th_stash_items_v1', bindsWorldbook:false, defaultInject:'<使用物品：{{name}}，{{desc}}>' },
  'stash-skill': { prefix:'', label:'技能', storageName:'储藏间·技能', icon:'fa-solid fa-book', storageKey:'_th_stash_skills_v1', bindsWorldbook:false, defaultInject:'<使用技能：{{name}}，{{desc}}>' },
  'stash-status': { prefix:'', label:'状态', storageName:'储藏间·状态', icon:'fa-solid fa-sparkles', storageKey:'_th_stash_statuses_v1', bindsWorldbook:false, defaultInject:'<触发状态：{{name}}，{{desc}}>' },
  'stash-clothing': { prefix:'', label:'衣物', storageName:'储藏间·衣物', icon:'fa-solid fa-shirt', storageKey:'_th_stash_clothing_v1', bindsWorldbook:false, defaultInject:'<更换衣物：{{name}}，{{desc}}>' },
  // 未分类：固定 kind，用于接收删除自定义类别时的卡片（反馈1），不参与初始数据/运行时导入/配发
  'stash-uncategorized': { prefix:'', label:'未分类', storageName:'储藏间·未分类', icon:'fa-solid fa-box', storageKey:'_th_stash_uncategorized_v1', bindsWorldbook:false, defaultInject:'<使用{{name}}：{{desc}}>' },
};

// ==================== 标签颜色调色板（§10.5）====================
// 只保留鲜艳的主题色，移除接近白色的文本色和背景色
export const TAG_COLOR_PALETTE = [
  'pink', 'pink2',
  'lav', 'lav2',
  'gold', 'gold2',
  'mint', 'mint2',
  'sky', 'sky2',
  'rose', 'rose2',
  'blue', 'blue2',
];

// 标签预设（新建标签时快速选择）
export const TAG_PRESETS = [
  { name: '主线', color: 'pink', desc: '推动剧情发展的关键内容' },
  { name: '支线', color: 'lav', desc: '可选的分支任务' },
  { name: '战斗', color: 'gold', desc: '战斗相关场景' },
  { name: '日常', color: 'mint', desc: '日常生活互动' },
  { name: '隐藏', color: 'sky', desc: '隐藏内容/彩蛋' },
];

// ==================== 初始数据世界书种子（§10.6 Build 2）====================
// 玩家在角色卡世界书里建固定名称的条目,作为初始数据源。脚本读取这些条目增量合并到本地。
// 名称精确匹配,不用前缀 startsWith,避免误匹配现有 [地点]xxx/[事件]xxx/[DLC]xxx 绑定条目。
export const INITIAL_ENTRY_NAMES = {
  location: '[初始·地点]',
  event: '[初始·事件]',
  dlc: '[初始·DLC]',
  stash: '[初始·储藏间]', // 储藏间 4 个内置 kind 合并到 1 个条目
  links: '[初始·关联]', // 批次1：location/event/dlc 三类卡片的双向 links 关联图
} as const;

// 初始条目名 → 对应 kind(储藏间条目对应 4 个 kind)
export const INITIAL_ENTRY_KINDS: Record<string, ManagedKind[]> = {
  [INITIAL_ENTRY_NAMES.location]: ['location'],
  [INITIAL_ENTRY_NAMES.event]: ['event'],
  [INITIAL_ENTRY_NAMES.dlc]: ['dlc'],
  [INITIAL_ENTRY_NAMES.stash]: ['stash-item', 'stash-skill', 'stash-status', 'stash-clothing'],
  // 批次1：[初始·关联] 条目对应 location/event/dlc 三类，但关联图有自己的解析逻辑（links-init 独立读取，不走 readInitialDataFromWorldbook 的 byKind 分组）
  [INITIAL_ENTRY_NAMES.links]: ['location', 'event', 'dlc'],
};

// 批次1：关联图序列化格式版本号（v1 占位，结构变化时能识别旧数据迁移）
export const LINKS_GRAPH_FORMAT = 'th-links-graph-v1';
// 批次1：kind ↔ links 字段映射（双向同步/合并复用）
export const LINKS_KIND_FIELDS: Record<'location' | 'event' | 'dlc', 'locations' | 'events' | 'dlcs'> = {
  location: 'locations',
  event: 'events',
  dlc: 'dlcs',
};

// 批次2 §G.1：统一 localStorage key 字典——集中登记所有初始化相关 _th_* key，
// 供任务2 备份枚举（exportInitBackup）按图索骥，不漏不 hardcode。
// 头像/画廊/fab 状态/外观等非“初始化数据”不在备份范围（§C.4 只备份 5 条目+managed+标签+关联图）。
export const INIT_LS_KEYS = {
  // managed 卡片覆盖（location/event/dlc/stash-*），对应 MANAGED_CFG[*].storageKey
  managed: ['_th_locations_v2', '_th_events_v1', '_th_dlcs_v1', '_th_stash_items_v1', '_th_stash_skills_v1', '_th_stash_statuses_v1', '_th_stash_clothing_v1', '_th_stash_uncategorized_v1'] as string[],
  // 自定义 stash kind 卡片（动态 key 前缀，备份时按前缀扫 localStorage）
  customStashPrefix: '_th_stash_custom_',
  tags: '_th_tags_v1',
  stashKinds: '_th_stash_kinds_v1',
  groupCollapsed: '_th_group_collapsed_v1',
  aiPrompts: '_th_ai_prompts_v1',
  aiBuiltinOverrides: '_th_ai_builtin_overrides_v1',
  aiTaskpool: '_th_ai_taskpool_v1',
  aiSnapshots: '_th_ai_snapshots_v1',
  aiPlans: '_th_ai_plans_v1',
  aiStyle: '_th_ai_style_v1',
  presetenvActive: '_th_presetenv_active_v1',
  // 预留（批次3/4）：aiPrompts '_th_ai_prompts_v1'，aiTaskpool '_th_ai_taskpool_v1'，presetenvActive '_th_presetenv_active_v1'
};
// 备份快照格式版本号
export const INIT_BACKUP_FORMAT = 'th-init-backup-v1';

// ==================== 运行时数据导入储藏间 + 写入初始世界书（§10.6 Build 2-2/2-3）====================
// 储藏间 kind → 对应变量路径字段名
export const STASH_RUNTIME_FIELD: Record<string, string> = {
  'stash-item': '拥有物品',
  'stash-skill': '拥有技能',
  'stash-status': '状态',
  'stash-clothing': '当前穿着衣物',
};

// ==================== 批次4a · AI 总结内置提示词（§E.3，6 套，砍掉 character）====================
// 每套提示词绑定一个输出 kind。模板用占位符 {{条目原文}} {{自定义指令}}，发送时由 ai-summarize 替换。
// 储藏间4类的输出字段写死（与 getDefaultEntry 口径一致），不让 AI 自由发挥结构（§E.3 变量格式遵守）。
// location/event 可选返回 links（关联），由归一化层过滤「只留已存在卡片名」防 AI 幻觉（§E.7 #26）。
export type AiSummaryPromptKind = 'location' | 'event' | 'stash-item' | 'stash-skill' | 'stash-status' | 'stash-clothing';

// ==================== 4b-fix · 内置完善系统提示词（generateRaw 的 ordered_prompts[0]）===================
// 反馈2：generate 带酒馆 RP 预设会触发 [Start a new chat] + 绑定世界书全发，挤掉我们的 user_input。
// 改用 generateRaw + ordered_prompts:[本系统提示词, 'user_input']，不带酒馆预设/世界书/聊天历史，
// 内容精确进入 user_input 位。本提示词即"内置一套基础的完善预设提示词"，默认即可完整使用。
// 作为专业提示词工程：交代角色、卡片体系与各 kind 字段、JSON 输出契约、纯 JSON 约束。
// 反馈3：不生成 confidence / tags / links —— 这些留给玩家在卡片编辑里手填，AI 只管 name + desc（+储藏间结构化字段）。
export const AI_SUMMARY_SYSTEM_PROMPT = `你是一名专业的游戏设定提取助手，服务于一个酒馆状态栏卡片管理系统。你的任务是从玩家给出的世界书条目原文中，按指定类别提取设定要素，并以严格 JSON 返回，供系统解析后生成为状态栏卡片。

【卡片体系】系统有以下类别，每类的字段固定，你必须严格按对应字段输出，不得增删字段、不得改变字段名：
- 地点(location)/事件(event)：name（名称）、desc（一句话简介，客观简明，≤40字）
- 物品(stash-item)：name、数量（整数，默认1）、简介、效果、评价
- 技能(stash-skill)：name、等级（整数，默认1）、简介、效果、评价
- 状态(stash-status)：name、效果、来源、持续时间
- 衣物(stash-clothing)：name、穿着部位、穿着情况（仅"穿着"或"脱下"）、破损状态（仅"完好无缺"/"轻微破损"/"中度破损"/"严重破坏"之一）、外观详情、衣物状态、评价

【提取规则】
1. 只提取原文明确出现的要素；原文未提及的字段留空字符串或默认值（数量/等级默认1，穿着情况默认"穿着"，破损状态默认"完好无缺"），不要编造。
2. desc/简介等文字字段要精炼客观，不要夹带主观臆测；评价字段可适度风趣但需基于原文。
3. 不要输出 tags（标签）和 links（关联）字段——标签与关联由玩家在卡片编辑里手动填写，AI 不负责。只输出上面对应类别列出的字段。

【输出契约】无论本次含 1 个还是多个任务，都统一返回：{"results":[{"task_id":"<任务id>","items":[<该任务的提取项>]}]}。每个任务块在用户输入中会以 "--- task_id: xxx ---" 标注，你需把对应结果放进同 task_id 的 items 数组。若某任务原文中确实没有可提取的该类要素，items 返回空数组 []。

【硬性约束】只输出上述 JSON 本身，不要输出任何解释、寒暄、前言、后记，不要用 \`\`\`json 或任何代码块标记包裹。`;

export type AiSummaryPrompt = {
  id: string;            // 内置 id 固定 'builtin-<kind>'；自定义用 'custom-<timestamp>'
  label: string;         // 显示名
  kind: AiSummaryPromptKind;
  template: string;      // 含 {{条目原文}} {{自定义指令}} 占位符
  isBuiltin: boolean;
};

export const AI_SUMMARY_PROMPTS: AiSummaryPrompt[] = [
  {
    id: 'builtin-location', label: '地点提取', kind: 'location', isBuiltin: true,
    template: `【提取任务·地点】从下方条目原文中提取所有「地点」要素。{{自定义指令}}
字段要求：
- name：地点名称（原文出现的专有名词，保留原措辞）。
- desc：一句话客观简介，概括该地点的特质与氛围，≤40字。

注：不要输出 tags、links 字段（标签与关联由玩家在卡片编辑里手填）。

【条目原文】
{{条目原文}}

【输出格式】严格按下方 JSON 输出，不要任何多余文字或代码块标记（不要用 \`\`\`json 包裹）。
单条示例：
{"results":[{"task_id":"task-1","items":[{"name":"黑森林","desc":"终年不见阳光的密林"}]}]}
多条示例（items 放多个元素，task_id 对应用户输入中的任务块）：
{"results":[{"task_id":"task-1","items":[{"name":"黑森林","desc":"终年不见阳光的密林"},{"name":"王都","desc":"王国的政治中心"}]}]}`,
  },
  {
    id: 'builtin-event', label: '事件提取', kind: 'event', isBuiltin: true,
    template: `【提取任务·事件】从下方条目原文中提取所有「事件」要素。{{自定义指令}}
字段要求：
- name：事件名称（保留原文措辞）。
- desc：一句话客观简介，说明事件发生的时间/地点/起因/性质，≤40字。

注：不要输出 tags、links 字段（标签与关联由玩家在卡片编辑里手填）。

【条目原文】
{{条目原文}}

【输出格式】严格按下方 JSON 输出，不要任何多余文字或代码块标记（不要用 \`\`\`json 包裹）。
单条示例：
{"results":[{"task_id":"task-1","items":[{"name":"森林遇袭","desc":"主角在黑森林遭遇狼群"}]}]}
多条示例（items 放多个元素，task_id 对应用户输入中的任务块）：
{"results":[{"task_id":"task-1","items":[{"name":"森林遇袭","desc":"主角在黑森林遭遇狼群"},{"name":"王都夜宴","desc":"国王举办的盛大晚宴"}]}]}`,
  },
  {
    id: 'builtin-stash-item', label: '物品提取', kind: 'stash-item', isBuiltin: true,
    template: `【提取任务·物品】从下方条目原文中提取所有「物品」要素。{{自定义指令}}
字段要求：
- name：物品名称（保留原文措辞）。
- 数量：整数，原文未提及则默认1。
- 简介：客观说明物品是什么，≤30字。
- 效果：物品的作用/功效，基于原文，没有则留空。
- 评价：可适度风趣地点评（打破第四面墙），基于原文，没有则留空。

注：不要输出 tags、links 字段（标签与关联由玩家在卡片编辑里手填）。

【条目原文】
{{条目原文}}

【输出格式】严格按下方 JSON 输出，不要任何多余文字或代码块标记（不要用 \`\`\`json 包裹）。
单条示例：
{"results":[{"task_id":"task-1","items":[{"name":"治疗药水","数量":2,"简介":"恢复体力的红色药水","效果":"恢复50点体力","评价":"常见消耗品"}]}]}
多条示例（items 放多个元素，task_id 对应用户输入中的任务块）：
{"results":[{"task_id":"task-1","items":[{"name":"治疗药水","数量":2,"简介":"恢复体力的红色药水","效果":"恢复50点体力","评价":"常见消耗品"},{"name":"铁剑","数量":1,"简介":"制式铁剑","效果":"造成20点伤害","评价":"基础武器"}]}]}`,
  },
  {
    id: 'builtin-stash-skill', label: '技能提取', kind: 'stash-skill', isBuiltin: true,
    template: `【提取任务·技能】从下方条目原文中提取所有「技能」要素。{{自定义指令}}
字段要求：
- name：技能名称（保留原文措辞）。
- 等级：整数，原文未提及则默认1。
- 简介：客观说明技能是什么，≤30字。
- 效果：技能的作用/威力，基于原文，没有则留空。
- 评价：可适度风趣地点评（打破第四面墙），基于原文，没有则留空。

注：不要输出 tags、links 字段（标签与关联由玩家在卡片编辑里手填）。

【条目原文】
{{条目原文}}

【输出格式】严格按下方 JSON 输出，不要任何多余文字或代码块标记（不要用 \`\`\`json 包裹）。
单条示例：
{"results":[{"task_id":"task-1","items":[{"name":"火球术","等级":3,"简介":"释放火球的初级法术","效果":"造成80点火焰伤害","评价":"输出主力"}]}]}
多条示例（items 放多个元素，task_id 对应用户输入中的任务块）：
{"results":[{"task_id":"task-1","items":[{"name":"火球术","等级":3,"简介":"释放火球的初级法术","效果":"造成80点火焰伤害","评价":"输出主力"},{"name":"治愈术","等级":2,"简介":"恢复生命的法术","效果":"恢复40点生命","评价":"续航技能"}]}]}`,
  },
  {
    id: 'builtin-stash-status', label: '状态提取', kind: 'stash-status', isBuiltin: true,
    template: `【提取任务·状态】从下方条目原文中提取所有「状态」要素（buff/debuff/异常等）。{{自定义指令}}
字段要求：
- name：状态名称（保留原文措辞）。
- 效果：该状态对角色的影响，基于原文，没有则留空。
- 来源：状态的成因/施加者，基于原文，没有则留空。
- 持续时间：状态的持续时长/条件，基于原文，没有则留空。

注：不要输出 tags、links 字段（标签与关联由玩家在卡片编辑里手填）。

【条目原文】
{{条目原文}}

【输出格式】严格按下方 JSON 输出，不要任何多余文字或代码块标记（不要用 \`\`\`json 包裹）。
单条示例：
{"results":[{"task_id":"task-1","items":[{"name":"中毒","效果":"每回合扣除10点生命","来源":"毒蛇咬击","持续时间":"3回合"}]}]}
多条示例（items 放多个元素，task_id 对应用户输入中的任务块）：
{"results":[{"task_id":"task-1","items":[{"name":"中毒","效果":"每回合扣除10点生命","来源":"毒蛇咬击","持续时间":"3回合"},{"name":"兴奋","效果":"攻击力提升20%","来源":"勇气药水","持续时间":"5回合"}]}]}`,
  },
  {
    id: 'builtin-stash-clothing', label: '衣物提取', kind: 'stash-clothing', isBuiltin: true,
    template: `【提取任务·衣物】从下方条目原文中提取所有「衣物」要素。{{自定义指令}}
字段要求：
- name：衣物名称（保留原文措辞）。
- 穿着部位：如 上身/下身/头部/足部/手部 等。
- 穿着情况：仅"穿着"或"脱下"（原文未说明默认"穿着"）。
- 破损状态：仅"完好无缺"/"轻微破损"/"中度破损"/"严重破坏"之一（默认"完好无缺"）。
- 外观详情：客观描述衣物整体外观与细节，尽量≥20字。
- 衣物状态：当前衣物状态（如 整洁如新/打湿紧贴/大面积破损），基于原文。
- 评价：可适度风趣地点评（打破第四面墙），基于原文，没有则留空。

注：不要输出 tags、links 字段（标签与关联由玩家在卡片编辑里手填）。

【条目原文】
{{条目原文}}

【输出格式】严格按下方 JSON 输出，不要任何多余文字或代码块标记（不要用 \`\`\`json 包裹）。
单条示例：
{"results":[{"task_id":"task-1","items":[{"name":"丝绸长裙","穿着部位":"下身","穿着情况":"穿着","破损状态":"完好无缺","外观详情":"白色丝绸长裙","衣物状态":"洁净","评价":"优雅"}]}]}
多条示例（items 放多个元素，task_id 对应用户输入中的任务块）：
{"results":[{"task_id":"task-1","items":[{"name":"丝绸长裙","穿着部位":"下身","穿着情况":"穿着","破损状态":"完好无缺","外观详情":"白色丝绸长裙","衣物状态":"洁净","评价":"优雅"},{"name":"皮靴","穿着部位":"足部","穿着情况":"脱下","破损状态":"轻微破损","外观详情":"棕色皮靴","衣物状态":"沾泥","评价":"耐穿"}]}]}`,
  },
];
