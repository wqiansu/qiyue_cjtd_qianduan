// 自动触发统一注册表（auto-registry.ts）
// 目的：把散落各 app 的「每 N 楼自动…」收拢成一份可总览、可统一操作、可全局急停的注册表。
//   - 各 app 在自己模块里 registerAutoAgent({...}) 声明：怎么读间隔/上次楼层、怎么写、怎么「立即触发一次」。
//   - 设置 App 的「自动触发总览」页遍历本注册表出 UI（改间隔 / 立即触发 / 看上次楼层）。
//   - shouldAutoTrigger(id) 是各 app maybeAutoTrigger 开头统一要过的闸：全局急停开着 → 一律 false。
//
// 铁律：本注册表只做「协调 + 总览 + 急停」，不改各 app 既有的落库/触发逻辑（各 app 仍自己 openApp 时 maybeAutoTrigger）。
//   字段差异（autoInterval vs everyFloors、有无 autoEnabled）全部在各 app 的 getInterval/setInterval 适配器里吸收。
import { getWorldConfig, saveWorldConfig } from './world-store';

export type AutoAgent = {
  id: string;                       // 唯一 id（多为 app id；evolution/world-state 用各自 id）
  name: string;                     // 显示名（中文）
  icon: string;                     // fa 图标（不带 fa- 前缀也可，iconHtml 会处理）
  desc?: string;                    // 一句话说明「自动触发会做什么」
  getInterval: () => number;        // 读当前间隔（0 或 <=0 = 关）
  setInterval: (n: number) => void; // 写间隔（各 app 自己处理 autoEnabled/记忆上次非零值等）
  getLastFloor?: () => number;      // 读上次已处理楼层（总览展示用，可选）
  fireNow?: () => void | Promise<void>; // 「立即触发一次」（不等楼数，手动跑一次自动内容）
};

const _agents = new Map<string, AutoAgent>();

// 各 app 在模块加载时调用（幂等：同 id 覆盖，热重载安全）。
export function registerAutoAgent(a: AutoAgent): void {
  _agents.set(a.id, a);
}
export function getAutoAgents(): AutoAgent[] {
  return [..._agents.values()];
}
export function getAutoAgent(id: string): AutoAgent | undefined {
  return _agents.get(id);
}

// ==================== 全局急停 ====================
export function isAutoStopped(): boolean {
  try { return getWorldConfig().autoStop === true; } catch (e) { void e; return false; }
}
export function setAutoStopped(on: boolean): void {
  try { saveWorldConfig({ autoStop: on }); } catch (e) { void e; }
}

// 各 app 的 maybeAutoTrigger 开头统一调用：返回 false 表示「本次不要自动触发」。
//   目前唯一否决条件＝全局急停；未来可加更多集中判断（如夜间免打扰）。
export function shouldAutoTrigger(_id?: string): boolean {
  return !isAutoStopped();
}

// window 桥：Shell / 其它非 import 场景可读急停态（如需要）。
try {
  const w = (typeof window !== 'undefined' ? (window as any) : null);
  if (w) w.__th_auto_registry__ = { getAutoAgents, isAutoStopped, setAutoStopped };
} catch (e) { void e; }
