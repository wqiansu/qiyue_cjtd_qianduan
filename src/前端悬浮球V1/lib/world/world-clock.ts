// 世界日历系统（world-clock.ts）
// 定位：全套件共享的「结构化世界时间」。风格化统一历（12 月 × 每月 30 天 = 360 天/年，24 小时制），
//   节日按名义月日落位、不与地球公历/农历对齐。世界演化与日历 app 都调这里，时间口径统一。
// 三种授时：① 从剧情自动读日期（cnToNum + 正则窗口）；② 手动拨钟；③ 随推演自动前进。
// 数据落 _th_world_clock_v1（纳入 _th_world_ 前缀整包导出）。纯数据 + 纯函数，不碰 DOM/generate。
import { readWorldJson, writeWorldJson } from './world-store';

export const CLOCK_LS_KEY = '_th_world_clock_v1';
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR; // 360

// 纯 24 小时制。SHICHEN 表保留仅为兼容旧引用（不再对外展示）。
export const SHICHEN = ['子时', '丑时', '寅时', '卯时', '辰时', '巳时', '午时', '未时', '申时', '酉时', '戌时', '亥时'];
// 粗时段（清晨/白昼/黄昏/深夜）——供「时段影响基调」，与时辰制无关，保留。
export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';
export const DAY_PHASE_LABEL: Record<DayPhase, string> = { dawn: '清晨', day: '白昼', dusk: '黄昏', night: '深夜' };

export type WorldClock = {
  era: string;              // 纪元/年号名，可空（如「景元」）
  year: number;             // 年
  month: number;            // 月 1..12
  day: number;              // 日 1..30
  hour: number;             // 0..23
  minute: number;           // 0..59
  useShichen: boolean;      // 保留字段仅兼容旧存档，恒当作纯 24 小时数字处理
  autoAdvance: boolean;     // 随推演自动走时间
  perRoundMinutes: number;  // 每推演一轮前进多少分钟
  autoReadFloor: boolean;   // 从剧情自动读日期
  injectDate: boolean;      // 把「今天是什么日子」自动注入正文（角色能主动提及）
  semester?: string;        // 当前学期阶段（学期制）
  initialized?: boolean;    // 是否已由玩家设过起点（否则展示「未设定」引导）
};

export const DEFAULT_CLOCK: WorldClock = {
  era: '景元', year: 3, month: 4, day: 8, hour: 8, minute: 0,
  useShichen: false, autoAdvance: false, perRoundMinutes: 240, autoReadFloor: true, injectDate: false,
  semester: '一学期', initialized: false,
};

let _cache: WorldClock | null = null;
let _clockRaw: string | null = null;
export function getWorldClock(): WorldClock {
  const raw = localStorage.getItem(CLOCK_LS_KEY);
  if (_cache && raw === _clockRaw) return _cache;
  _clockRaw = raw;
  const parsed = readWorldJson<Partial<WorldClock>>(CLOCK_LS_KEY, {});
  _cache = { ...DEFAULT_CLOCK, ...(parsed || {}) };
  return _cache;
}
export function setWorldClock(patch: Partial<WorldClock>): WorldClock {
  const next = { ...getWorldClock(), ...patch };
  next.year = Math.max(1, Math.floor(next.year || 1));
  next.month = clampWrap(next.month, 1, MONTHS_PER_YEAR);
  next.day = clampWrap(next.day, 1, DAYS_PER_MONTH);
  next.hour = ((Math.floor(next.hour) % 24) + 24) % 24;
  next.minute = ((Math.floor(next.minute) % 60) + 60) % 60;
  _cache = next; writeWorldJson(CLOCK_LS_KEY, next);
  _clockRaw = localStorage.getItem(CLOCK_LS_KEY);
  return next;
}
function clampWrap(v: number, lo: number, hi: number): number {
  const n = Math.floor(v || lo);
  if (n < lo) return lo; if (n > hi) return hi; return n;
}

// 线性日序号：0..359（(月-1)*30 + (日-1)）。用于 ±N 天窗口计算（取模绕年）。
export function dayIndexOf(month: number, day: number): number {
  return ((clampWrap(month, 1, MONTHS_PER_YEAR) - 1) * DAYS_PER_MONTH) + (clampWrap(day, 1, DAYS_PER_MONTH) - 1);
}
export function currentDayIndex(): number { const c = getWorldClock(); return dayIndexOf(c.month, c.day); }
// 由线性日序号反解月/日
export function monthDayOf(dayIndex: number): { month: number; day: number } {
  const di = ((dayIndex % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  return { month: Math.floor(di / DAYS_PER_MONTH) + 1, day: (di % DAYS_PER_MONTH) + 1 };
}
// 绕年的最短天数距离（0..180）
export function ringDistance(a: number, b: number): number {
  const d = Math.abs(((a - b) % DAYS_PER_YEAR + DAYS_PER_YEAR) % DAYS_PER_YEAR);
  return Math.min(d, DAYS_PER_YEAR - d);
}

// 时段（粗）
export function dayPhaseOf(hour: number): DayPhase {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 5 && h < 9) return 'dawn';
  if (h >= 9 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'dusk';
  return 'night';
}
function pad2(n: number): string { return n < 10 ? '0' + n : String(n); }

// 季节（据月份，风格化统一历：春3-5 夏6-8 秋9-11 冬12-2）
export function seasonOf(month: number): string {
  const m = clampWrap(month, 1, 12);
  if (m >= 3 && m <= 5) return '春';
  if (m >= 6 && m <= 8) return '夏';
  if (m >= 9 && m <= 11) return '秋';
  return '冬';
}

// ==================== 推进 ====================
// 前进分钟数，带日/月/年进位（等长历）。返回新钟。
export function advanceClock(minutes: number): WorldClock {
  const c = getWorldClock();
  let total = c.hour * 60 + c.minute + Math.max(0, Math.floor(minutes));
  let addDays = Math.floor(total / (24 * 60));
  total = total % (24 * 60);
  const hour = Math.floor(total / 60), minute = total % 60;
  // 日序号推进（绕年时年+1）
  let year = c.year;
  let di = dayIndexOf(c.month, c.day) + addDays;
  while (di >= DAYS_PER_YEAR) { di -= DAYS_PER_YEAR; year += 1; }
  const md = monthDayOf(di);
  void addDays;
  return setWorldClock({ year, month: md.month, day: md.day, hour, minute });
}
// 快捷拨钟
export function advanceHours(h: number): WorldClock { return advanceClock(Math.round(h * 60)); }
export function advanceDays(d: number): WorldClock { return advanceClock(d * 24 * 60); }
// 到次日清晨（次日 06:00）
export function jumpToNextMorning(): WorldClock {
  const c = getWorldClock();
  const cur = c.hour * 60 + c.minute;
  const target = 6 * 60;
  const mins = (24 * 60 - cur) + target;
  return advanceClock(mins);
}

// ==================== 格式化 ====================
const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
export function numToCn(n: number): string {
  if (n <= 10) return CN_NUM[n] || String(n);
  if (n < 20) return '十' + (n % 10 === 0 ? '' : CN_NUM[n % 10]);
  if (n < 100) { const t = Math.floor(n / 10), o = n % 10; return CN_NUM[t] + '十' + (o === 0 ? '' : CN_NUM[o]); }
  return String(n);
}
// 统一产出：「景元三年·五月十六 · 黄昏 18:00」（纯 24 小时，粗时段仅作氛围提示）
export function formatWorldClock(c?: WorldClock): string {
  const k = c || getWorldClock();
  const eraYear = k.era ? `${k.era}${numToCn(k.year)}年` : `${numToCn(k.year)}年`;
  const md = `${numToCn(k.month)}月${numToCn(k.day)}`;
  const phase = DAY_PHASE_LABEL[dayPhaseOf(k.hour)];
  const clock = `${pad2(k.hour)}:${pad2(k.minute)}`;
  return `${eraYear}·${md} · ${phase} ${clock}`;
}
// 短格式：「五月十六 黄昏」
export function formatClockShort(c?: WorldClock): string {
  const k = c || getWorldClock();
  return `${numToCn(k.month)}月${numToCn(k.day)} ${DAY_PHASE_LABEL[dayPhaseOf(k.hour)]}`;
}

// ==================== 从剧情自动读日期 ====================
// 中文数字转阿拉伯（支持 一~三十、十X、二十X 等常见表达）。
export function cnToNum(s: string): number | null {
  if (!s) return null;
  const t = s.trim();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const map: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  if (t.length === 1) return map[t] ?? null;
  // 十X / X十 / X十Y
  if (t.includes('十')) {
    const [a, b] = t.split('十');
    const tens = a === '' ? 1 : (map[a] ?? null);
    const ones = b === '' ? 0 : (map[b] ?? null);
    if (tens == null || ones == null) return null;
    return tens * 10 + ones;
  }
  return map[t] ?? null;
}
// 从一段正文里抽取「月/日/时」线索，回填一个部分钟。命中才返回，未命中返回 null。
export function parseStoryTime(text: string): Partial<WorldClock> | null {
  if (!text) return null;
  const out: Partial<WorldClock> = {};
  let hit = false;
  const mMonth = text.match(/([一二三四五六七八九十\d]{1,3})月/);
  if (mMonth) { const n = cnToNum(mMonth[1]); if (n && n >= 1 && n <= 12) { out.month = n; hit = true; } }
  const mDay = text.match(/([一二三四五六七八九十\d]{1,3})[日号]/);
  if (mDay) { const n = cnToNum(mDay[1]); if (n && n >= 1 && n <= 30) { out.day = n; hit = true; } }
  const mHour = text.match(/([一二三四五六七八九十\d]{1,3})[点時时]/);
  if (mHour) { const n = cnToNum(mHour[1]); if (n != null && n >= 0 && n <= 23) { out.hour = n; hit = true; } }
  // 时段词兜底（无精确小时时）
  if (out.hour == null) {
    if (/清晨|拂晓|破晓|一早|早晨/.test(text)) { out.hour = 6; hit = true; }
    else if (/正午|中午|晌午/.test(text)) { out.hour = 12; hit = true; }
    else if (/黄昏|傍晚|日暮|夕阳/.test(text)) { out.hour = 18; hit = true; }
    else if (/深夜|午夜|夜半|三更/.test(text)) { out.hour = 0; hit = true; }
    else if (/夜里|晚上|入夜/.test(text)) { out.hour = 21; hit = true; }
  }
  return hit ? out : null;
}

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_clock__ = { getWorldClock, setWorldClock, advanceClock, formatWorldClock, parseStoryTime, cnToNum, currentDayIndex, dayIndexOf, ringDistance };
} catch (e) { void e; }
