import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

export type ApiFeature = {
  id: string;            // APP 内唯一，如 'danmu'
  name: string;          // 显示名，如 '弹幕'
  desc: string;          // 作用说明
  defaultOn: boolean;    // 默认是否纳入每次生成
  standalone: boolean;   // 是否允许玩家单独生成这一项
};
export type ApiCountField = {
  key: string;           // APP 内唯一，如 'recommendCount'
  name: string;          // 显示名
  desc: string;
  def: number;           // 默认值
  min: number; max: number;
};
// 按「触发按钮」分组的 API 利用视图。每个按钮一张卡：标题=按钮，卡内直接列它产出的
// 可勾选项(feats)/数量项(counts)/恒定产出(always 仅展示)。
export type ApiTrigger = {
  btn: string;           // 按钮名（如「直播间·发言/送礼」）
  icon: string;          // 图标
  feats?: string[];      // 此按钮下可勾选的 feature id（须存在于 features）
  counts?: string[];     // 此按钮下的数量项 key（须存在于 counts）
  always?: string[];     // 恒定产出（不可关，仅展示文案）
};
export type ApiPlanDef = {
  appId: string;
  appName: string;
  features: ApiFeature[];
  counts: ApiCountField[];
  triggers?: ApiTrigger[];   // 提供则按钮分组渲染；缺省走平铺兜底
};

const _registry = new Map<string, ApiPlanDef>();
export function registerApiPlan(def: ApiPlanDef): void { _registry.set(def.appId, def); }
export function getApiPlanDef(appId: string): ApiPlanDef | undefined { return _registry.get(appId); }
export function listApiPlanApps(): ApiPlanDef[] {
  return [..._registry.values()].sort((a, b) => a.appName.localeCompare(b.appName));
}

// ---- 覆盖读写：{ [appId]: { features: {id:bool}, counts: {key:number} } } ----
type AppOverride = { features?: Record<string, boolean>; counts?: Record<string, number> };
type OverrideMap = Record<string, AppOverride>;
const LS_KEY = WORLD_LS_KEYS.apiplan;
function readOv(): OverrideMap { return readWorldJson<OverrideMap>(LS_KEY, {}); }
function writeOv(m: OverrideMap): void { writeWorldJson(LS_KEY, m); }

// 某 feature 本次是否纳入生成（覆盖优先，默认 defaultOn）。
export function isFeatureOn(appId: string, featureId: string): boolean {
  const ov = readOv()[appId]?.features?.[featureId];
  if (typeof ov === 'boolean') return ov;
  const f = _registry.get(appId)?.features.find(x => x.id === featureId);
  return f ? f.defaultOn : true;
}
export function setFeatureOn(appId: string, featureId: string, on: boolean): void {
  const m = readOv(); const a = (m[appId] ||= {}); (a.features ||= {})[featureId] = on; writeOv(m);
}
// 返回本次应生成的 feature id 列表（已开的）。
export function activeFeatures(appId: string): string[] {
  const def = _registry.get(appId); if (!def) return [];
  return def.features.filter(f => isFeatureOn(appId, f.id)).map(f => f.id);
}

// 生成条数上限放开：只用 min 兜底、上限走全局宽松硬顶 COUNT_HARD_CAP（防止手滑输 99999 冻住客户端），
//   各字段的 max 退化为「建议值」（仅在渲染时作为 UI 提示，不再强制夹取）。
export const COUNT_HARD_CAP = 500;
// 数量项取值（覆盖优先，min 兜底、上限走全局硬顶）。
export function planCount(appId: string, key: string): number {
  const def = _registry.get(appId);
  const field = def?.counts.find(c => c.key === key);
  const def0 = field ? field.def : 0;
  const ov = readOv()[appId]?.counts?.[key];
  const v = typeof ov === 'number' && Number.isFinite(ov) ? ov : def0;
  if (!field) return v;
  return Math.max(field.min, Math.min(COUNT_HARD_CAP, Math.floor(v)));
}
export function setPlanCount(appId: string, key: string, v: number): void {
  const m = readOv(); const a = (m[appId] ||= {}); (a.counts ||= {})[key] = v; writeOv(m);
}
export function resetApiPlan(appId: string): void { const m = readOv(); delete m[appId]; writeOv(m); }

export function isFeatureOverridden(appId: string): boolean {
  const a = readOv()[appId];
  if (!a) return false;
  const hasF = !!a.features && Object.keys(a.features).length > 0;
  const hasC = !!a.counts && Object.keys(a.counts).length > 0;
  return hasF || hasC;
}

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_apiplan__ = { listApiPlanApps, isFeatureOn, activeFeatures, planCount, registerApiPlan };
} catch (e) { void e; }
