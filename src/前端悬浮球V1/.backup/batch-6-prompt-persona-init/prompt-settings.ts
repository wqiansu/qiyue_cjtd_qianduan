// 批次5 Step4 · 提示词编辑设置面板（统一编辑所有内置 + 自定义提示词）
// 入口：状态栏设置区「提示词编辑」按钮；AI 总结面板「管理提示词」也跳到这里。
// 命令式 innerHTML + openModal2 + data 属性委托（§4.2），不引 Vue。
// 内置可编辑（存 override）+「恢复内置」；自定义可新建/编辑/删除/复制。
import { esc, escAttr, qs } from '../lib/dom-utils';
import { openModal2, closeModal2 } from '../status-bar-init';
import { MANAGED_CFG, type ManagedKind, type AiSummaryPromptKind } from '../lib/config';
import { getAllPrompts, getPrompt, savePrompt, deletePrompt, resetBuiltin, type PromptEntry } from '../lib/prompt-registry';
import { AI_STYLES, getAiStyleId, setAiStyleId } from '../lib/ai-summary-store';

// 占位符帮助（Step5 变量扩展会补充更多，这里集中列出供编辑器提示）
const PLACEHOLDER_HELP = [
  '{{条目原文}} — 必填，被选中世界书条目的正文',
  '{{自定义指令}} — 任务池里单任务的备注指令',
  '{{当前卡片名列表}} — 该类别本地已有卡片名',
  '{{角色名}} — 酒馆当前角色名',
  '{{最近剧情}} — 最近若干条聊天摘要',
];

const KINDS: AiSummaryPromptKind[] = ['location', 'event', 'stash-item', 'stash-skill', 'stash-status', 'stash-clothing'];

function kindLabel(k: AiSummaryPromptKind): string {
  try { return MANAGED_CFG[k as ManagedKind].label; } catch { return k; }
}
function kindIcon(k: AiSummaryPromptKind): string {
  try { return MANAGED_CFG[k as ManagedKind].icon; } catch { return 'fa-solid fa-tag'; }
}

// ==================== 列表面板 ====================

export function openPromptSettings(): void {
  renderListPanel();
}

function renderListPanel(): void {
  const all = getAllPrompts();
  const builtins = all.filter(p => p.builtin);
  const customs = all.filter(p => !p.builtin);
  const row = (p: PromptEntry) => `<div class="th-ps-row" data-id="${escAttr(p.id)}">
    <i class="${kindIcon(p.kind)}" style="color:var(--pink)"></i>
    <span class="th-ps-label">${esc(p.label)}</span>
    <span class="th-ps-tag">${p.builtin ? (p.overridden ? '内置·已改' : '内置') : '自定义'}</span>
    <span class="th-ps-kind">${esc(kindLabel(p.kind))}</span>
    <span class="th-ps-acts">
      <button class="th-btn th-btn-mini" data-ps-act="edit" data-id="${escAttr(p.id)}">编辑</button>
      <button class="th-btn th-btn-mini" data-ps-act="copy" data-id="${escAttr(p.id)}">复制</button>
      ${p.builtin
        ? (p.overridden ? `<button class="th-btn th-btn-mini" data-ps-act="reset" data-id="${escAttr(p.id)}">恢复内置</button>` : '')
        : `<button class="th-btn th-btn-mini" data-ps-act="del" data-id="${escAttr(p.id)}">删除</button>`}
    </span>
  </div>`;
  const html = `<div class="th-ps" style="padding:14px;display:flex;flex-direction:column;gap:10px;max-height:74vh">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-weight:700;color:var(--pink)">提示词编辑</span>
      <span style="font-size:12px;color:var(--tx3)">内置 ${builtins.length} 套（可编辑，可恢复）· 自定义 ${customs.length} 套</span>
      <button class="th-btn th-btn-mini th-btn-primary" data-ps-act="new" style="margin-left:auto"><i class="fa-solid fa-plus"></i> 新建</button>
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;background:var(--bg3);border-radius:8px;padding:8px 10px">
      <span style="color:var(--tx2)"><i class="fa-solid fa-wand-sparkles" style="color:var(--pink)"></i> 提取风格</span>
      <select id="th-ps-style" class="th-edit-select" style="max-width:220px;font-size:12px">
        ${AI_STYLES.map(s => `<option value="${s.id}"${s.id === getAiStyleId() ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select>
      <span style="font-size:11px;color:var(--tx3)">影响 AI 总结的文风（拼到系统提示词）</span>
    </div>
    <div class="th-ps-list" style="display:flex;flex-direction:column;gap:6px;overflow:auto;padding-right:4px">
      <div style="font-size:12px;color:var(--tx3);margin-top:2px">内置提示词</div>
      ${builtins.map(row).join('')}
      <div style="font-size:12px;color:var(--tx3);margin-top:8px">自定义提示词</div>
      ${customs.length ? customs.map(row).join('') : '<div style="font-size:12px;color:var(--tx3);padding:6px 8px">（暂无，可从内置「复制」或点「新建」）</div>'}
    </div>
    <div style="display:flex;justify-content:flex-end">
      <button class="th-btn" data-ps-act="close">关闭</button>
    </div>
  </div>`;
  openModal2('<i class="fa-solid fa-pen-to-square"></i> 提示词编辑', html, { maxWidth: 'min(720px,94vw)', reset: true, revive: renderListPanel });
  bindListEvents();
}

function bindListEvents(): void {
  qs<HTMLSelectElement>('#th-ps-style')?.addEventListener('change', function (this: HTMLSelectElement) {
    setAiStyleId(this.value);
    toastr?.success?.('已切换提取风格');
  });
  qs('.th-ps')?.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const btn = t.closest('[data-ps-act]') as HTMLElement | null;
    if (!btn) return;
    const act = btn.getAttribute('data-ps-act');
    const id = btn.getAttribute('data-id') || '';
    if (act === 'close') { closeModal2(); return; }
    if (act === 'new') { openEditor(null); return; }
    if (act === 'edit' && id) { openEditor(id); return; }
    if (act === 'copy' && id) { openEditor(id, true); return; }
    if (act === 'del' && id) {
      deletePrompt(id);
      toastr?.success?.('已删除自定义提示词');
      renderListPanel();
      return;
    }
    if (act === 'reset' && id) {
      resetBuiltin(id);
      toastr?.success?.('已恢复内置默认');
      renderListPanel();
      return;
    }
  });
}

// ==================== 编辑器（嵌套在列表之上，走 modal 栈，关闭弹回列表）====================

// seed: null=新建；id=编辑现有；copyFrom=复制现有为新自定义
function openEditor(id: string | null, copyFrom = false): void {
  const src = id ? getPrompt(id) : null;
  const isBuiltinEdit = !!src && src.builtin && !copyFrom;
  // 复制：从源拷模板，生成新自定义；新建：空白
  const editId = (src && !copyFrom) ? src.id : '';
  const label = src ? (copyFrom ? src.label + ' 副本' : src.label) : '';
  const kind = src ? src.kind : 'location';
  const template = src ? src.template : '';
  const title = id && !copyFrom ? '编辑提示词' : (copyFrom ? '复制为自定义' : '新建提示词');

  const kindOpts = KINDS.map(k => `<option value="${k}"${k === kind ? ' selected' : ''}>${esc(kindLabel(k))}</option>`).join('');
  const helpHtml = PLACEHOLDER_HELP.map(h => `<div style="font-size:11px;color:var(--tx3)">${esc(h)}</div>`).join('');
  // 内置编辑时，label/kind 锁定（只可改 template）
  const lockMeta = isBuiltinEdit;
  const html = `<div class="th-pe2" style="padding:14px;display:flex;flex-direction:column;gap:10px;max-height:80vh">
    <div style="display:flex;align-items:center;gap:8px">
      <span style="font-weight:700;color:var(--pink)">${esc(title)}</span>
      ${lockMeta ? '<span style="font-size:11px;color:var(--tx3)">（内置：名称/类别固定，仅可改模板内容，保存为 override，可随时恢复）</span>' : ''}
    </div>
    <label style="display:grid;gap:4px"><span style="font-size:13px">名称</span>
      <input id="th-pe2-label" class="th-edit-input" value="${escAttr(label)}" placeholder="如：暗黑风格地点提取" ${lockMeta ? 'disabled' : ''}></label>
    <label style="display:grid;gap:4px"><span style="font-size:13px">输出类别</span>
      <select id="th-pe2-kind" class="th-edit-select" ${lockMeta ? 'disabled' : ''}>${kindOpts}</select></label>
    <label style="display:grid;gap:4px"><span style="font-size:13px">模板</span>
      <textarea id="th-pe2-template" class="th-edit-textarea" rows="12" style="font-family:monospace;font-size:12px;line-height:1.5">${esc(template)}</textarea></label>
    <div style="display:flex;flex-direction:column;gap:2px;background:var(--bg3);border-radius:8px;padding:8px 10px">
      <div style="font-size:12px;color:var(--tx2);font-weight:600">可用占位符</div>
      ${helpHtml}
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="th-btn" id="th-pe2-cancel">取消</button>
      <button class="th-btn th-btn-primary" id="th-pe2-save"><i class="fa-solid fa-floppy-disk"></i> 保存</button>
    </div>
  </div>`;
  openModal2(esc(title), html, { maxWidth: 'min(720px,94vw)' });

  qs('#th-pe2-cancel')?.addEventListener('click', closeModal2);
  qs('#th-pe2-save')?.addEventListener('click', () => {
    const newLabel = lockMeta ? label : (qs<HTMLInputElement>('#th-pe2-label')?.value || '').trim();
    const newKind = (lockMeta ? kind : (qs<HTMLSelectElement>('#th-pe2-kind')?.value as AiSummaryPromptKind)) || 'location';
    const newTemplate = qs<HTMLTextAreaElement>('#th-pe2-template')?.value || '';
    if (!newLabel) { toastr?.warning?.('请填名称'); return; }
    if (!newTemplate.includes('{{条目原文}}')) { toastr?.warning?.('模板必须含 {{条目原文}} 占位符'); return; }
    if (isBuiltinEdit) {
      savePrompt({ id: editId, kind: newKind, label: newLabel, template: newTemplate, builtin: true });
    } else {
      const cid = editId || `custom-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
      savePrompt({ id: cid, kind: newKind, label: newLabel, template: newTemplate, builtin: false });
    }
    toastr?.success?.('已保存');
    closeModal2(); // 弹栈回列表（revive=renderListPanel 重渲染，反映改动）
  });
}

// 供其它模块/控制台调试
try {
  const w = (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {})) as any;
  w.__th_prompt_settings__ = { openPromptSettings };
} catch (e) { void e; }
