// 批次5 Step4 / 批次6 · 提示词编辑设置面板（三段式：头部人格 + 提取风格 + 提取提示词）
// 入口：状态栏设置区「提示词编辑」按钮；AI 总结面板「管理提示词」也跳到这里。
// 命令式 innerHTML + openModal2 + data 属性委托（§4.2），不引 Vue。
// 内置可编辑（存 override）+「恢复内置」；自定义可新建/编辑/删除/复制。
// 批次6：① 头部人格（身份赋予，置于全部提示词最前）+ CRUD；② 提取风格扩到 8 内置 + CRUD；
//        ③ 提示词编辑器底部加「提取约束」旋钮（字数/条目数/总分上限）。
import { esc, escAttr, qs } from '../lib/dom-utils';
import { openModal2, closeModal2 } from '../status-bar-init';
import { MANAGED_CFG, type ManagedKind, type AiSummaryPromptKind, type AiPromptConstraints } from '../lib/config';
import { getAllPrompts, getPrompt, savePrompt, deletePrompt, resetBuiltin, type PromptEntry } from '../lib/prompt-registry';
import {
  getAiStyleList, getAiStyleId, setAiStyleId, saveAiStyle, deleteAiStyle, resetAiStyle, isBuiltinStyle, type AiStyle,
  getPersonaList, getActivePersonaId, setActivePersonaId, savePersona, deletePersona, resetPersona, isBuiltinPersona, type AiPersona,
} from '../lib/ai-summary-store';

// 占位符帮助（编辑器提示）
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
function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

// ==================== 列表面板（三段）====================

export function openPromptSettings(): void {
  renderListPanel();
}


function renderListPanel(): void {
  const all = getAllPrompts();
  const builtins = all.filter(p => p.builtin);
  const customs = all.filter(p => !p.builtin);
  const personas = getPersonaList();
  const styles = getAiStyleList();
  const activePid = getActivePersonaId();
  const activeSid = getAiStyleId();

  const promptRow = (p: PromptEntry) => `<div class="th-ps-row" data-id="${escAttr(p.id)}">
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

  const personaOpts = `<option value="">（不启用人格）</option>` + personas.map(p =>
    `<option value="${escAttr(p.id)}"${p.id === activePid ? ' selected' : ''}>${esc(p.name)}${p.builtin ? (p.overridden ? '（内置·已改）' : '') : '（自定义）'}</option>`).join('');
  const styleOpts = styles.map(s =>
    `<option value="${escAttr(s.id)}"${s.id === activeSid ? ' selected' : ''}>${esc(s.name)}${s.builtin ? (s.overridden ? '（已改）' : '') : '（自定义）'}</option>`).join('');

  const html = `<div class="th-ps" style="padding:14px;display:flex;flex-direction:column;gap:12px;max-height:78vh;overflow:auto">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-weight:700;color:var(--pink)">提示词编辑</span>
      <span style="font-size:12px;color:var(--tx3)">人格 + 风格 + 提取提示词，三段拼接后发给 AI</span>
    </div>

    <!-- 段① 头部人格 -->
    <div class="th-ps-sec">
      <div class="th-ps-sec-h"><i class="fa-solid fa-user-tie" style="color:var(--pink)"></i> 头部人格<span class="th-ps-sec-sub">为 AI 赋予身份/人格，置于全部提示词最前（只影响语气，不影响提取格式）</span></div>
      <div class="th-ps-sec-row">
        <select id="th-ps-persona" class="th-edit-select" style="flex:1;min-width:160px;max-width:280px;font-size:12px">${personaOpts}</select>
        <button class="th-btn th-btn-mini th-btn-primary" data-ps-act="persona-new"><i class="fa-solid fa-plus"></i> 新建</button>
        <button class="th-btn th-btn-mini" data-ps-act="persona-edit">编辑</button>
        <button class="th-btn th-btn-mini" data-ps-act="persona-del">删除</button>
        <button class="th-btn th-btn-mini" data-ps-act="persona-reset">恢复内置</button>
      </div>
    </div>

    <!-- 段② 提取风格 -->
    <div class="th-ps-sec">
      <div class="th-ps-sec-h"><i class="fa-solid fa-wand-sparkles" style="color:var(--pink)"></i> 提取风格<span class="th-ps-sec-sub">影响 AI 总结的文风（拼到系统提示词后缀）</span></div>
      <div class="th-ps-sec-row">
        <select id="th-ps-style" class="th-edit-select" style="flex:1;min-width:160px;max-width:280px;font-size:12px">${styleOpts}</select>
        <button class="th-btn th-btn-mini th-btn-primary" data-ps-act="style-new"><i class="fa-solid fa-plus"></i> 新建</button>
        <button class="th-btn th-btn-mini" data-ps-act="style-edit">编辑</button>
        <button class="th-btn th-btn-mini" data-ps-act="style-del">删除</button>
        <button class="th-btn th-btn-mini" data-ps-act="style-reset">恢复内置</button>
      </div>
    </div>

    <!-- 段③ 提取提示词 -->
    <div class="th-ps-sec">
      <div class="th-ps-sec-h"><i class="fa-solid fa-pen-to-square" style="color:var(--pink)"></i> 提取提示词<span class="th-ps-sec-sub">内置 ${builtins.length} 套（可编辑/恢复）· 自定义 ${customs.length} 套</span>
        <button class="th-btn th-btn-mini th-btn-primary" data-ps-act="new" style="margin-left:auto"><i class="fa-solid fa-plus"></i> 新建</button>
      </div>
      <div class="th-ps-list" style="display:flex;flex-direction:column;gap:6px">
        <div style="font-size:12px;color:var(--tx3);margin-top:2px">内置提示词</div>
        ${builtins.map(promptRow).join('')}
        <div style="font-size:12px;color:var(--tx3);margin-top:8px">自定义提示词</div>
        ${customs.length ? customs.map(promptRow).join('') : '<div style="font-size:12px;color:var(--tx3);padding:6px 8px">（暂无，可从内置「复制」或点「新建」）</div>'}
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end">
      <button class="th-btn" data-ps-act="close">关闭</button>
    </div>
  </div>`;
  openModal2('<i class="fa-solid fa-pen-to-square"></i> 提示词编辑', html, { maxWidth: 'min(760px,94vw)', reset: true, revive: renderListPanel });
  bindListEvents();
}

function selVal(id: string): string { return qs<HTMLSelectElement>(id)?.value || ''; }

function bindListEvents(): void {
  // 人格/风格选择即生效（设为当前）
  qs<HTMLSelectElement>('#th-ps-persona')?.addEventListener('change', function (this: HTMLSelectElement) {
    setActivePersonaId(this.value);
    toastr?.success?.(this.value ? '已启用头部人格' : '已关闭头部人格');
  });
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
    switch (act) {
      case 'close': closeModal2(); return;
      // 提示词
      case 'new': openEditor(null); return;
      case 'edit': if (id) openEditor(id); return;
      case 'copy': if (id) openEditor(id, true); return;
      case 'del': if (id) { deletePrompt(id); toastr?.success?.('已删除自定义提示词'); renderListPanel(); } return;
      case 'reset': if (id) { resetBuiltin(id); toastr?.success?.('已恢复内置默认'); renderListPanel(); } return;
      // 人格
      case 'persona-new': openPersonaEditor(null); return;
      case 'persona-edit': { const pid = selVal('#th-ps-persona'); if (!pid) { toastr?.warning?.('请先在下拉里选择一个人格'); return; } openPersonaEditor(pid); return; }
      case 'persona-del': { const pid = selVal('#th-ps-persona'); if (!pid) { toastr?.warning?.('请先选择人格'); return; } if (isBuiltinPersona(pid)) { toastr?.warning?.('内置人格不可删除，可「恢复内置」还原'); return; } confirmDanger('删除人格', '确定删除该自定义人格？', () => { deletePersona(pid); toastr?.success?.('已删除人格'); renderListPanel(); }); return; }
      case 'persona-reset': { const pid = selVal('#th-ps-persona'); if (!pid || !isBuiltinPersona(pid)) { toastr?.warning?.('请选择一个内置人格'); return; } resetPersona(pid); toastr?.success?.('已恢复内置人格'); renderListPanel(); return; }
      // 风格
      case 'style-new': openStyleEditor(null); return;
      case 'style-edit': { const sid = selVal('#th-ps-style'); if (!sid) { toastr?.warning?.('请先选择风格'); return; } openStyleEditor(sid); return; }
      case 'style-del': { const sid = selVal('#th-ps-style'); if (!sid) { toastr?.warning?.('请先选择风格'); return; } if (isBuiltinStyle(sid)) { toastr?.warning?.('内置风格不可删除，可「恢复内置」还原'); return; } confirmDanger('删除风格', '确定删除该自定义风格？', () => { deleteAiStyle(sid); toastr?.success?.('已删除风格'); renderListPanel(); }); return; }
      case 'style-reset': { const sid = selVal('#th-ps-style'); if (!sid || !isBuiltinStyle(sid)) { toastr?.warning?.('请选择一个内置风格'); return; } resetAiStyle(sid); toastr?.success?.('已恢复内置风格'); renderListPanel(); return; }
    }
  });
}

// 轻量二次确认（删除人格/风格）
function confirmDanger(title: string, msg: string, onYes: () => void): void {
  const html = `<div style="padding:16px;display:flex;flex-direction:column;gap:14px">
    <div style="font-size:13px;color:var(--tx2);line-height:1.7">${esc(msg)}</div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="th-btn" id="th-ps-cd-no">取消</button>
      <button class="th-btn th-btn-primary" id="th-ps-cd-yes">确定</button>
    </div>
  </div>`;
  openModal2(esc(title), html, { maxWidth: 'min(420px,92vw)' });
  qs('#th-ps-cd-no')?.addEventListener('click', closeModal2);
  qs('#th-ps-cd-yes')?.addEventListener('click', () => { onYes(); closeModal2(); });
}

// ==================== 提示词编辑器（含提取约束旋钮）====================
// seed: null=新建；id=编辑现有；copyFrom=复制现有为新自定义
function openEditor(id: string | null, copyFrom = false): void {
  const src = id ? getPrompt(id) : null;
  const isBuiltinEdit = !!src && src.builtin && !copyFrom;
  const editId = (src && !copyFrom) ? src.id : '';
  const label = src ? (copyFrom ? src.label + ' 副本' : src.label) : '';
  const kind = src ? src.kind : 'location';
  const template = src ? src.template : '';
  const c: AiPromptConstraints = src?.constraints ? { ...src.constraints } : {};
  const title = id && !copyFrom ? '编辑提示词' : (copyFrom ? '复制为自定义' : '新建提示词');

  const kindOpts = KINDS.map(k => `<option value="${k}"${k === kind ? ' selected' : ''}>${esc(kindLabel(k))}</option>`).join('');
  const helpHtml = PLACEHOLDER_HELP.map(h => `<div style="font-size:11px;color:var(--tx3)">${esc(h)}</div>`).join('');
  const lockMeta = isBuiltinEdit;
  const html = `<div class="th-pe2" style="padding:14px;display:flex;flex-direction:column;gap:10px;max-height:80vh;overflow:auto">
    <div style="display:flex;align-items:center;gap:8px">
      <span style="font-weight:700;color:var(--pink)">${esc(title)}</span>
      ${lockMeta ? '<span style="font-size:11px;color:var(--tx3)">（内置：名称/类别固定，仅可改模板内容与约束，保存为 override，可随时恢复）</span>' : ''}
    </div>
    <label style="display:grid;gap:4px"><span style="font-size:13px">名称</span>
      <input id="th-pe2-label" class="th-edit-input" value="${escAttr(label)}" placeholder="如：暗黑风格地点提取" ${lockMeta ? 'disabled' : ''}></label>
    <label style="display:grid;gap:4px"><span style="font-size:13px">输出类别</span>
      <select id="th-pe2-kind" class="th-edit-select" ${lockMeta ? 'disabled' : ''}>${kindOpts}</select></label>
    <label style="display:grid;gap:4px"><span style="font-size:13px">模板</span>
      <textarea id="th-pe2-template" class="th-edit-textarea" rows="11" style="font-family:monospace;font-size:12px;line-height:1.5">${esc(template)}</textarea></label>
    <div class="th-pe2-cons" style="display:flex;flex-direction:column;gap:6px;background:var(--bg3);border-radius:8px;padding:10px">
      <div style="font-size:12px;color:var(--tx2);font-weight:600"><i class="fa-solid fa-sliders" style="color:var(--pink)"></i> 提取约束（0 或留空 = 不限制，发送时拼进提示词）</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:5px;font-size:12px">desc 字数上限
          <input id="th-pe2-c-desc" class="th-edit-input" type="number" min="0" value="${c.descMaxChars || ''}" style="width:80px"></label>
        <label style="display:flex;align-items:center;gap:5px;font-size:12px">最多条目数
          <input id="th-pe2-c-items" class="th-edit-input" type="number" min="0" value="${c.maxItems || ''}" style="width:80px"></label>
        <label style="display:flex;align-items:center;gap:5px;font-size:12px">数值总分上限
          <input id="th-pe2-c-attr" class="th-edit-input" type="number" min="0" value="${c.attrTotalCap || ''}" style="width:80px"></label>
      </div>
    </div>
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
    const numOf = (sel: string): number | undefined => { const v = parseInt(qs<HTMLInputElement>(sel)?.value || '', 10); return (Number.isFinite(v) && v > 0) ? v : undefined; };
    const constraints: AiPromptConstraints = { descMaxChars: numOf('#th-pe2-c-desc'), maxItems: numOf('#th-pe2-c-items'), attrTotalCap: numOf('#th-pe2-c-attr') };
    const hasCons = constraints.descMaxChars || constraints.maxItems || constraints.attrTotalCap;
    if (isBuiltinEdit) {
      savePrompt({ id: editId, kind: newKind, label: newLabel, template: newTemplate, builtin: true, constraints: hasCons ? constraints : undefined });
    } else {
      const cid = editId || genId('custom');
      savePrompt({ id: cid, kind: newKind, label: newLabel, template: newTemplate, builtin: false, constraints: hasCons ? constraints : undefined });
    }
    toastr?.success?.('已保存');
    closeModal2();
  });
}

// ==================== 人格编辑器 ====================
function openPersonaEditor(id: string | null): void {
  const src = id ? getPersonaList().find(p => p.id === id) || null : null;
  const isBuiltinEdit = !!src && src.builtin;
  const name = src ? src.name : '';
  const persona = src ? src.persona : '';
  const title = id ? '编辑人格' : '新建人格';
  const html = `<div class="th-pe2" style="padding:14px;display:flex;flex-direction:column;gap:10px;max-height:80vh;overflow:auto">
    <div style="display:flex;align-items:center;gap:8px">
      <span style="font-weight:700;color:var(--pink)">${esc(title)}</span>
      ${isBuiltinEdit ? '<span style="font-size:11px;color:var(--tx3)">（内置：名称固定，仅可改人格文本，存 override 可恢复）</span>' : ''}
    </div>
    <label style="display:grid;gap:4px"><span style="font-size:13px">人格名称</span>
      <input id="th-pe2-pname" class="th-edit-input" value="${escAttr(name)}" placeholder="如：温柔助手小樱" ${isBuiltinEdit ? 'disabled' : ''}></label>
    <label style="display:grid;gap:4px"><span style="font-size:13px">人格设定（拼在全部提示词最前，为 AI 赋予身份）</span>
      <textarea id="th-pe2-ptext" class="th-edit-textarea" rows="9" style="font-size:12px;line-height:1.6" placeholder="你将扮演……作为玩家的助手，帮助玩家完成世界书设定整理工作。性格……说话风格……">${esc(persona)}</textarea></label>
    <div style="font-size:11px;color:var(--tx3);background:var(--bg3);border-radius:8px;padding:8px 10px;line-height:1.6">提示：人格只影响语气与风趣点评，不会改变提取格式。建议在文本里声明「不因扮演而编造或偏离原文事实」以确保提取可靠。</div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="th-btn" id="th-pe2-pcancel">取消</button>
      <button class="th-btn th-btn-primary" id="th-pe2-psave"><i class="fa-solid fa-floppy-disk"></i> 保存</button>
    </div>
  </div>`;
  openModal2(esc(title), html, { maxWidth: 'min(640px,94vw)' });
  qs('#th-pe2-pcancel')?.addEventListener('click', closeModal2);
  qs('#th-pe2-psave')?.addEventListener('click', () => {
    const newName = isBuiltinEdit ? name : (qs<HTMLInputElement>('#th-pe2-pname')?.value || '').trim();
    const newText = (qs<HTMLTextAreaElement>('#th-pe2-ptext')?.value || '').trim();
    if (!newName) { toastr?.warning?.('请填人格名称'); return; }
    if (!newText) { toastr?.warning?.('请填人格设定文本'); return; }
    const pid = isBuiltinEdit ? src!.id : (src?.id || genId('persona'));
    const entry: AiPersona = { id: pid, name: newName, persona: newText, builtin: isBuiltinEdit };
    savePersona(entry);
    if (!isBuiltinEdit) setActivePersonaId(pid); // 新建/编辑自定义后顺手设为当前
    toastr?.success?.('已保存人格');
    closeModal2();
  });
}

// ==================== 风格编辑器 ====================
function openStyleEditor(id: string | null): void {
  const src = id ? getAiStyleList().find(s => s.id === id) || null : null;
  const isBuiltinEdit = !!src && src.builtin;
  const name = src ? src.name : '';
  const suffix = src ? src.systemSuffix : '';
  const title = id ? '编辑风格' : '新建风格';
  const html = `<div class="th-pe2" style="padding:14px;display:flex;flex-direction:column;gap:10px;max-height:80vh;overflow:auto">
    <div style="display:flex;align-items:center;gap:8px">
      <span style="font-weight:700;color:var(--pink)">${esc(title)}</span>
      ${isBuiltinEdit ? '<span style="font-size:11px;color:var(--tx3)">（内置：名称固定，仅可改文风后缀，存 override 可恢复）</span>' : ''}
    </div>
    <label style="display:grid;gap:4px"><span style="font-size:13px">风格名称</span>
      <input id="th-pe2-sname" class="th-edit-input" value="${escAttr(name)}" placeholder="如：古风雅致" ${isBuiltinEdit ? 'disabled' : ''}></label>
    <label style="display:grid;gap:4px"><span style="font-size:13px">文风后缀（拼到系统提示词末尾，描述 desc/简介/评价的笔调要求）</span>
      <textarea id="th-pe2-ssuffix" class="th-edit-textarea" rows="6" style="font-size:12px;line-height:1.6" placeholder="【文风要求】提取的 desc/简介采用……的笔调（但仍须基于原文事实，不编造情节）。">${esc(suffix)}</textarea></label>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="th-btn" id="th-pe2-scancel">取消</button>
      <button class="th-btn th-btn-primary" id="th-pe2-ssave"><i class="fa-solid fa-floppy-disk"></i> 保存</button>
    </div>
  </div>`;
  openModal2(esc(title), html, { maxWidth: 'min(640px,94vw)' });
  qs('#th-pe2-scancel')?.addEventListener('click', closeModal2);
  qs('#th-pe2-ssave')?.addEventListener('click', () => {
    const newName = isBuiltinEdit ? name : (qs<HTMLInputElement>('#th-pe2-sname')?.value || '').trim();
    const newSuffix = qs<HTMLTextAreaElement>('#th-pe2-ssuffix')?.value || '';
    if (!newName) { toastr?.warning?.('请填风格名称'); return; }
    const sid = isBuiltinEdit ? src!.id : (src?.id || genId('style'));
    const entry: AiStyle = { id: sid, name: newName, systemSuffix: newSuffix, builtin: isBuiltinEdit };
    saveAiStyle(entry);
    if (!isBuiltinEdit) setAiStyleId(sid);
    toastr?.success?.('已保存风格');
    closeModal2();
  });
}

// 供其它模块/控制台调试
try {
  const w = (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {})) as any;
  w.__th_prompt_settings__ = { openPromptSettings };
} catch (e) { void e; }




