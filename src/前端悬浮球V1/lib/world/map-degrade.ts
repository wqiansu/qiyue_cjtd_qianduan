// 性能降级判定的纯函数。
// 本文件不 import 任何带 DOM/宿主副作用的模块 —— 能在 node 里直接跑。

export const FPS_FLOOR = 45, WIN = 30, LONG_DT = 100, COOLDOWN = 3000, WARMUP = 120;
/* 最低档 = 全静。 */
export const MAX_TIER = 1;
/* 停顿与真卡的区别在连不连续:rAF 节流是一两次大跳,真卡是连着几十帧都慢 */
export const STALL_DT = 700, SLOW_RUN = WIN;

export type FpsState = { hist: number[]; streak: number; frames: number; slowRun?: number };

export function fpsSample(
  st: FpsState, dt: number, fps: number,
): { hist: number[]; streak: number; dropped: boolean; slowRun: number } {
  const run = st.slowRun ?? 0;
  /* 长停顿(标签隐藏 / iframe rAF 被节流)不算卡:丢弃并清窗,否则必误降级 */
  if (dt > STALL_DT) return { hist: [], streak: 0, dropped: true, slowRun: 0 };
  if (dt > LONG_DT) {
    // 连续慢帧攒满一窗 ⇒ 按地板值记进去,让判定得以进行
    if (run + 1 >= SLOW_RUN) {
      return { hist: new Array(WIN).fill(fps), streak: st.streak, dropped: false, slowRun: run + 1 };
    }
    return { hist: [], streak: 0, dropped: true, slowRun: run + 1 };
  }
  if (st.frames <= WARMUP) return { hist: st.hist, streak: st.streak, dropped: false, slowRun: 0 };
  let h = st.hist.concat(fps);
  if (h.length > WIN) h = h.slice(h.length - WIN);
  return { hist: h, streak: st.streak, dropped: false, slowRun: 0 };
}

/* ⚠ 窗口必须离散,满 WIN 帧判一次、判完清窗:滚动窗把一次抖动数成两次,
   而降级静默且不自动升回。 */
export function degradeVerdict(
  st: FpsState & { tier: number; locked: boolean; lastAt: number },
  now: number,
): { act: boolean; streak: number; avg?: number; full: boolean } {
  if (st.locked || st.hist.length < WIN || st.frames <= WARMUP + WIN) {
    return { act: false, streak: st.streak, full: false };
  }
  const avg = st.hist.reduce((a, b) => a + b, 0) / st.hist.length;
  const streak = avg < FPS_FLOOR ? st.streak + 1 : 0;
  const act = streak >= 2 && st.tier < MAX_TIER && now - st.lastAt > COOLDOWN;
  return { act, streak: act ? 0 : streak, avg, full: true };
}
