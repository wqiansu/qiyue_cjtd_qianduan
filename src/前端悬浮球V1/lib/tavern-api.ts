// 酒馆助手 API 封装层。
// 把对 window / TavernHelper / Mvu / getVariables / 世界书 API 的访问集中封装，
// 统一走“window 优先，回退 TavernHelper”的双路兜底。
// 全部为纯函数，无模块级可变状态。
// 类型 CharWorldbooks / WorldbookEntry / WorldbookUpdater / ReplaceWorldbookOptions
// 来自 @types/function/worldbook.d.ts（全局 ambient，无需 import）。
// ================================================================

export function getRoot(): any {
  try {
    const parentWindow = window.parent as any;
    if(parentWindow&&parentWindow!==window) return parentWindow;
  } catch(e) { void e; }
  return window as any;
}

export function getHelper(): any {
  return (window as any).TavernHelper || getRoot().TavernHelper || {};
}

export function getMvu(): any {
  return (window as any).Mvu || getRoot().Mvu;
}

export function hasVariableApi(): boolean {
  return typeof (window as any).getVariables === 'function' || typeof getHelper().getVariables === 'function';
}

export function safeGetVariables(option: any): Record<string,any> {
  const localGet = (window as any).getVariables;
  if(typeof localGet==='function') return localGet(option);
  const helperGet = getHelper().getVariables;
  if(typeof helperGet==='function') return helperGet(option);
  throw new Error('getVariables is not available');
}

export function safeUpdateVariablesWith(updater: (variables: Record<string,any>) => Record<string,any>, option: any) {
  const localUpdate = (window as any).updateVariablesWith;
  if(typeof localUpdate==='function') return localUpdate(updater, option);
  const helperUpdate = getHelper().updateVariablesWith;
  if(typeof helperUpdate==='function') return helperUpdate(updater, option);
  throw new Error('updateVariablesWith is not available');
}

export function safeTriggerSlash(command: string) {
  const localTrigger = (window as any).triggerSlash;
  if(typeof localTrigger==='function') return localTrigger(command);
  const helperTrigger = getHelper().triggerSlash;
  if(typeof helperTrigger==='function') return helperTrigger(command);
}

export function safeGetCharWorldbookNames(characterName: 'current'): CharWorldbooks {
  const localGet = (window as any).getCharWorldbookNames;
  if(typeof localGet==='function') return localGet(characterName);
  const helperGet = getHelper().getCharWorldbookNames;
  if(typeof helperGet==='function') return helperGet(characterName);
  throw new Error('getCharWorldbookNames is not available');
}

export async function safeGetWorldbook(worldbookName: string): Promise<WorldbookEntry[]> {
  const localGet = (window as any).getWorldbook;
  if(typeof localGet==='function') return localGet(worldbookName);
  const helperGet = getHelper().getWorldbook;
  if(typeof helperGet==='function') return helperGet(worldbookName);
  throw new Error('getWorldbook is not available');
}

export async function safeUpdateWorldbookWith(worldbookName: string, updater: WorldbookUpdater, options?: ReplaceWorldbookOptions): Promise<WorldbookEntry[]> {
  const localUpdate = (window as any).updateWorldbookWith;
  if(typeof localUpdate==='function') return localUpdate(worldbookName, updater, options);
  const helperUpdate = getHelper().updateWorldbookWith;
  if(typeof helperUpdate==='function') return helperUpdate(worldbookName, updater, options);
  throw new Error('updateWorldbookWith is not available');
}

// 读取酒馆当前「玩家角色(persona)」名字与描述。通讯录「我」可一键读取酒馆 user 设置。
// 走 SillyTavern.getContext() / SillyTavern.name1 / power_user.persona_description，全部 window→getRoot 兜底，失败返回空。
export function getTavernUserPersona(): { name: string; description: string } {
  const out = { name: '', description: '' };
  const tryCtx = (st: any) => {
    if (!st) return;
    try { if (!out.name && typeof st.name1 === 'string') out.name = st.name1.trim(); } catch (e) { void e; }
    try {
      const ctx = typeof st.getContext === 'function' ? st.getContext() : null;
      if (ctx) {
        if (!out.name && typeof ctx.name1 === 'string') out.name = ctx.name1.trim();
        const pu = ctx.powerUserSettings || ctx.power_user;
        if (!out.description && pu && typeof pu.persona_description === 'string') out.description = pu.persona_description.trim();
      }
    } catch (e) { void e; }
  };
  try { tryCtx((window as any).SillyTavern); } catch (e) { void e; }
  try { const r = getRoot(); tryCtx(r?.SillyTavern); } catch (e) { void e; }
  // 兜底：power_user 直挂
  try {
    const pu = (window as any).power_user || (getRoot() as any)?.power_user;
    if (!out.description && pu && typeof pu.persona_description === 'string') out.description = pu.persona_description.trim();
  } catch (e) { void e; }
  return out;
}

export async function waitForVariableApi() {
  if(hasVariableApi()) return;
  await waitUntil(()=>hasVariableApi(), 150, 15000);
}

export function waitUntil(check: () => boolean, interval = 300, timeout = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const t = setInterval(() => {
      try { if (check()) { clearInterval(t); resolve(); } else if (Date.now()-start>timeout) { clearInterval(t); reject(new Error('timeout')); } }
      catch (e) { if (Date.now()-start>timeout) { clearInterval(t); reject(new Error('timeout')); } }
    }, interval);
  });
}
