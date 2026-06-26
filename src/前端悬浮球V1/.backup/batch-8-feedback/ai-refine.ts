// 批次5 Step7 · G AI 润色/续写
// 对已存在的 managed 卡片单独调 AI 重写 desc（可选结合最近剧情 + 玩家自定义润色要求）。
// 命令式 + openModal2 + generateRaw（绕开 RP 预设）。kind 适配：储藏间结构化 JSON 仍保持合法。
import { esc, qs } from '../lib/dom-utils';
import { openModal2, closeModal2 } from '../status-bar-init';
import { getRoot } from '../lib/tavern-api';
import { getManagedItems, addManagedItem, type ManagedItemV2 } from '../lib/managed-store';
import { MANAGED_CFG, type ManagedKind } from '../lib/config';
import { getActivePersonaText, getAiStyleSuffix } from '../lib/ai-summary-store';

// 内置润色提示词（registry 接口预留：未来可经 registerExtra 暴露到提示词编辑面板）
// 反馈4：拼接顺序与 AI 总结一致 = 头部人格 + 本系统提示词 + 风格后缀，让卡片润色也跟随玩家选的人格/风格。
const REFINE_SYSTEM = `你是一名游戏设定润色助手。玩家会给你一张卡片的当前内容、可选的最近剧情、以及润色要求。请据此改写卡片描述。
【硬性约束】
1. 只输出改写后的卡片描述正文，不要输出任何解释、寒暄、前后缀，不要用代码块标记包裹。
2. 若卡片是结构化字段（会以 JSON 给出），请输出同结构的 JSON（字段名不变），仅改写字段值。
3. 忠于设定，不要凭空捏造与原意冲突的硬事实；润色侧重文风与细节丰富度。`;

// 组装润色系统提示词：人格在前、风格后缀在后（与 ai-summarize.sendOneBucket 同口径）。
function buildRefineSystem(): string {
  return getActivePersonaText() + REFINE_SYSTEM + getAiStyleSuffix();
}

function getGenerateRaw(): ((cfg: any) => Promise<unknown>) | null {
  try {
    const w = window as any;
    if (typeof w.generateRaw === 'function') return w.generateRaw;
    const p = getRoot();
    if (p && typeof p.generateRaw === 'function') return p.generateRaw;
  } catch (e) { void e; }
  return null;
}
function getFn(name: string): any {
  try {
    const w = window as any;
    if (typeof w[name] === 'function') return w[name];
    const p = getRoot();
    if (p && typeof p[name] === 'function') return p[name];
  } catch (e) { void e; }
  return null;
}
function getRecentChatSummary(n = 5): string {
  try {
    const fn = getFn('getChatMessages');
    const lastIdFn = getFn('getLastMessageId');
    if (!fn) return '';
    const last = typeof lastIdFn === 'function' ? Number(lastIdFn()) : -1;
    const range = (last >= 0) ? `${Math.max(0, last - n + 1)}-${last}` : -1;
    const msgs = fn(range) as Array<{ name?: string; role?: string; message?: string }>;
    if (!Array.isArray(msgs)) return '';
    return msgs.map(m => { const who = m.name || m.role || '?'; const t = (m.message || '').replace(/\s+/g, ' ').trim(); return t ? `${who}：${t.slice(0, 200)}` : ''; }).filter(Boolean).join('\n');
  } catch (e) { void e; }
  return '';
}

// 入口：对某卡片打开润色 modal。onDone 回调用于刷新调用方（写回后重渲染卡片/编辑弹窗）。
export function openRefineModal(kind: ManagedKind, name: string, onDone?: () => void): void {
  const item = getManagedItems(kind)[name];
  if (!item) { toastr?.warning?.('未找到该卡片'); return; }
  const cfg = MANAGED_CFG[kind] || { label: kind, icon: 'fa-solid fa-wand-magic-sparkles' };
  const isStash = kind.startsWith('stash-');
  const html = `<div class="th-refine" style="padding:14px;display:flex;flex-direction:column;gap:10px;max-height:80vh">
    <div style="font-size:13px;color:var(--tx2)">对卡片「<b>${esc(name)}</b>」（${esc(cfg.label)}）调 AI 润色当前内容。</div>
    <div style="font-size:12px;color:var(--tx3)">当前内容</div>
    <pre class="th-refine-cur" style="white-space:pre-wrap;word-break:break-word;font-size:12px;background:var(--bg2);border-radius:8px;padding:8px 10px;max-height:150px;overflow:auto;margin:0">${esc(item.desc || '(空)')}</pre>
    <label style="display:flex;gap:6px;align-items:center;font-size:12px;color:var(--tx2);cursor:pointer">
      <input type="checkbox" id="th-refine-recent"> 结合最近剧情（最近 5 楼）
    </label>
    <label style="display:grid;gap:4px"><span style="font-size:13px">润色要求</span>
      <textarea id="th-refine-req" class="th-edit-textarea" rows="3" placeholder="如：把这个地点描述改得更阴暗 / 补充更多感官细节 / 精简到 50 字"></textarea></label>
    <div class="th-refine-result-wrap" style="display:none;gap:4px;flex-direction:column">
      <span style="font-size:12px;color:var(--tx3)">润色结果（可编辑后写回）</span>
      <textarea id="th-refine-result" class="th-edit-textarea" rows="5" style="font-size:12px"></textarea>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap">
      <button class="th-btn" id="th-refine-cancel">取消</button>
      <button class="th-btn th-btn-primary" id="th-refine-go"><i class="fa-solid fa-wand-magic-sparkles"></i> 润色</button>
      <button class="th-btn th-btn-primary" id="th-refine-apply" style="display:none"><i class="fa-solid fa-check"></i> 写回卡片</button>
    </div>
  </div>`;
  openModal2(`<i class="${cfg.icon}"></i> AI 润色 · ${esc(name)}`, html, { maxWidth: 'min(680px,94vw)' });

  qs('#th-refine-cancel')?.addEventListener('click', closeModal2);
  qs('#th-refine-go')?.addEventListener('click', () => { void runRefine(kind, name, isStash); });
  qs('#th-refine-apply')?.addEventListener('click', () => {
    const val = (qs<HTMLTextAreaElement>('#th-refine-result')?.value || '').trim();
    if (!val) { toastr?.warning?.('润色结果为空'); return; }
    const cur = getManagedItems(kind)[name];
    const patch: ManagedItemV2 = { ...(cur || { desc: '', tags: [] }), desc: val };
    addManagedItem(kind, name, patch);
    toastr?.success?.('已写回卡片');
    closeModal2();
    onDone?.();
  });
}

async function runRefine(kind: ManagedKind, name: string, isStash: boolean): Promise<void> {
  const generateRaw = getGenerateRaw();
  if (!generateRaw) { toastr?.error?.('当前环境无 generateRaw 接口'); return; }
  const item = getManagedItems(kind)[name];
  if (!item) return;
  const req = (qs<HTMLTextAreaElement>('#th-refine-req')?.value || '').trim();
  const withRecent = !!qs<HTMLInputElement>('#th-refine-recent')?.checked;
  const recent = withRecent ? getRecentChatSummary(5) : '';
  const goBtn = qs<HTMLButtonElement>('#th-refine-go');
  if (goBtn) { goBtn.disabled = true; goBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 润色中…'; }
  const userInput = [
    `【卡片类别】${MANAGED_CFG[kind]?.label || kind}${isStash ? '（结构化 JSON，请输出同结构 JSON）' : ''}`,
    `【卡片名】${name}`,
    `【当前内容】\n${item.desc || '(空)'}`,
    recent ? `【最近剧情】\n${recent}` : '',
    `【润色要求】${req || '（无特别要求，整体润色提升细节与文采）'}`,
  ].filter(Boolean).join('\n\n');
  try {
    const ret = await generateRaw({
      user_input: userInput,
      ordered_prompts: [{ role: 'system', content: buildRefineSystem() }, 'user_input'],
      should_silence: true,
    });
    const text = typeof ret === 'string' ? ret : '';
    if (!text || !text.trim()) { toastr?.warning?.('AI 返回为空'); return; }
    const wrap = qs<HTMLElement>('.th-refine-result-wrap');
    const resEl = qs<HTMLTextAreaElement>('#th-refine-result');
    if (wrap) wrap.style.display = 'flex';
    if (resEl) resEl.value = text.trim();
    const applyBtn = qs<HTMLElement>('#th-refine-apply');
    if (applyBtn) applyBtn.style.display = '';
    toastr?.success?.('润色完成，可编辑后写回');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    toastr?.error?.(`润色失败：${msg}`);
  } finally {
    if (goBtn) { goBtn.disabled = false; goBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> 重新润色'; }
  }
}
