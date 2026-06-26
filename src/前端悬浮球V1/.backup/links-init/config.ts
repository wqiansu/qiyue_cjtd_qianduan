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
} as const;

// 初始条目名 → 对应 kind(储藏间条目对应 4 个 kind)
export const INITIAL_ENTRY_KINDS: Record<string, ManagedKind[]> = {
  [INITIAL_ENTRY_NAMES.location]: ['location'],
  [INITIAL_ENTRY_NAMES.event]: ['event'],
  [INITIAL_ENTRY_NAMES.dlc]: ['dlc'],
  [INITIAL_ENTRY_NAMES.stash]: ['stash-item', 'stash-skill', 'stash-status', 'stash-clothing'],
};

// ==================== 运行时数据导入储藏间 + 写入初始世界书（§10.6 Build 2-2/2-3）====================
// 储藏间 kind → 对应变量路径字段名
export const STASH_RUNTIME_FIELD: Record<string, string> = {
  'stash-item': '拥有物品',
  'stash-skill': '拥有技能',
  'stash-status': '状态',
  'stash-clothing': '当前穿着衣物',
};
