import { esc, escAttr, qs, qsa, __doc } from '../lib/dom-utils';
import { openModal2, closeModal2 } from '../status-bar-init';
import { thConfirm, thPrompt } from '../lib/world/ui-kit';
import {
  getEnvPresetNames, getEnvPresetDetail,
  getPresetEnvPersist, setPresetEnvPersist, resolveGenerateApiConfig,
  previewGeneratePayload, getEnvLoadedPresetName, getApiPresetNames,
  envLoadPreset, exportEnvPresetSnapshot, envTestPing,
} from '../lib/preset-env';

export { resolveGenerateApiConfig };

const LS_PRESETS = '_th_api_presets_v1';
const LS_ACTIVE = '_th_api_active_v1';

export interface ApiPreset {
  name: string;
  source: string;
  apiurl: string;
  key: string;
  model: string;
  should_stream: boolean;
  temperature: 'same_as_preset'|'unset'|number;
  max_tokens: 'same_as_preset'|'unset'|number;
  top_p: 'same_as_preset'|'unset'|number;
  frequency_penalty: 'same_as_preset'|'unset'|number;
  presence_penalty: 'same_as_preset'|'unset'|number;
  top_k: 'same_as_preset'|'unset'|number;
}

const DEFAULT_PRESET: ApiPreset = {
  name:'默认', source:'openai', apiurl:'', key:'', model:'', should_stream:false,
  temperature:'same_as_preset', max_tokens:'same_as_preset', top_p:'same_as_preset',
  frequency_penalty:'same_as_preset', presence_penalty:'same_as_preset', top_k:'same_as_preset',
};

function loadPresets(): ApiPreset[] {
  try {
    const raw = localStorage.getItem(LS_PRESETS);
    if(!raw) return [ { ...DEFAULT_PRESET } ];
    const arr = JSON.parse(raw);
    if(!Array.isArray(arr)||!arr.length) return [ { ...DEFAULT_PRESET } ];
    return arr;
  } catch(e){ void e; return [ { ...DEFAULT_PRESET } ]; }
}
function savePresets(arr: ApiPreset[]): void {
  try { localStorage.setItem(LS_PRESETS, JSON.stringify(arr)); } catch(e){ void e; }
}
function loadActive(): string {
  try { return localStorage.getItem(LS_ACTIVE) || loadPresets()[0].name; } catch(e){ void e; return '默认'; }
}
function saveActive(name: string): void {
  try { localStorage.setItem(LS_ACTIVE, name); } catch(e){ void e; }
}

function getGetModelList(): ((cfg:{apiurl:string;key?:string})=>Promise<string[]>)|null {
  try {
    const w = window as any;
    if(typeof w.getModelList==='function') return w.getModelList.bind(w);
    const p = window.parent as any;
    if(p && typeof p.getModelList==='function') return p.getModelList.bind(p);
  } catch(e){ void e; }
  return null;
}

interface PanelState {
  presets: ApiPreset[];
  active: string;
  editing: string;
  showKey: boolean;
  models: string[];
  testing: boolean;
  aiPresetName: string;
  selPreset: string;
  onceOnly: boolean;
}
let st: PanelState|null = null;

export function openApiSettings(): void {
  const presets = loadPresets();
  const active = loadActive();
  const pe = getPresetEnvPersist();
  st = { presets, active, editing: active, showKey:false, models:[], testing:false, aiPresetName: pe.aiPresetName, selPreset: pe.presetName, onceOnly: pe.onceOnly };
  const cur = presets.find(p=>p.name===active) || presets[0];
  st.editing = cur.name;
  openModal2(`<i class="fa-solid fa-key"></i> API 设置`, renderApiPanel(), { maxWidth:'min(680px,94vw)', reset: true, revive: openApiSettings });
  setTimeout(()=>bindApiEvents(), 60);
}

function curPreset(): ApiPreset|null {
  if(!st) return null;
  return st.presets.find(p=>p.name===st!.editing) || null;
}

function renderApiPanel(): string {
  if(!st) return '';
  const p = curPreset();
  if(!p) return '';
  return `<div class="th-api">
    <div class="th-api-preset-bar">
      <select class="th-api-preset-select th-edit-select" id="th-api-preset">
        ${st.presets.map(pp=>`<option value="${escAttr(pp.name)}" ${pp.name===st!.editing?'selected':''}>${esc(pp.name)}${pp.name===st!.active?' (活动)':''}</option>`).join('')}
      </select>
      <button class="th-btn-sm th-api-preset-new" type="button" title="新建预设"><i class="fa-solid fa-plus"></i></button>
      <button class="th-btn-sm th-api-preset-rename" type="button" title="重命名"><i class="fa-solid fa-pen"></i></button>
      <button class="th-btn-sm th-api-preset-del" type="button" title="删除预设" ${st.presets.length<=1?'disabled':''}><i class="fa-solid fa-trash"></i></button>
      <button class="th-btn-sm th-btn-primary th-api-preset-activate" type="button" ${p.name===st.active?'disabled':''}>设为活动</button>
    </div>

    <div class="th-api-group">
      <div class="th-api-group-label"><i class="fa-solid fa-plug"></i> 连接</div>
      <div class="th-api-form-grid">
        <label class="th-api-field">API 源<input class="th-edit-input" id="th-api-source" value="${escAttr(p.source)}" placeholder="openai"></label>
        <label class="th-api-field">Base URL<input class="th-edit-input" id="th-api-apiurl" value="${escAttr(p.apiurl)}" placeholder="https://api.example.com/v1"></label>
        <label class="th-api-field th-api-field-key">API Key
          <div class="th-api-key-row">
            <input class="th-edit-input" id="th-api-key" type="${st.showKey?'text':'password'}" value="${escAttr(p.key)}" placeholder="sk-...">
            <button class="th-icon-btn th-api-key-toggle" type="button" title="${st.showKey?'隐藏':'显示'}"><i class="fa-solid fa-eye${st.showKey?'-slash':''}"></i></button>
          </div>
        </label>
      </div>
      <div class="th-api-test-row">
        <button class="th-btn-sm th-api-test" type="button" ${st.testing?'disabled':''}><i class="fa-solid ${st.testing?'fa-spinner fa-spin':'fa-plug-circle-check'}"></i> ${st.testing?'获取中…':'获取模型'}</button>
        <span class="th-api-test-result" id="th-api-test-result"></span>
      </div>
    </div>

    <div class="th-api-group">
      <div class="th-api-group-label"><i class="fa-solid fa-microchip"></i> 模型</div>
      <div class="th-api-model-row">
        ${st.models.length
          ? `<select class="th-edit-select th-api-model-select" id="th-api-model-sel">${st.models.map(m=>`<option value="${escAttr(m)}" ${m===p.model?'selected':''}>${esc(m)}</option>`).join('')}</select>`
          : `<input class="th-edit-input" id="th-api-model-manual" value="${escAttr(p.model)}" placeholder="手填模型名,如 gpt-4o">`}
      </div>
    </div>

    <div class="th-api-group">
      <div class="th-api-group-label"><i class="fa-solid fa-sliders"></i> 采样参数</div>
      <div class="th-api-sampling">
        ${samplingRow('temperature','温度',p.temperature,0,2,0.1)}
        ${samplingRow('max_tokens','最大 tokens',p.max_tokens,0,32000,100)}
        ${samplingRow('top_p','top_p',p.top_p,0,1,0.05)}
        ${samplingRow('frequency_penalty','频率惩罚',p.frequency_penalty,-2,2,0.1)}
        ${samplingRow('presence_penalty','存在惩罚',p.presence_penalty,-2,2,0.1)}
        ${samplingRow('top_k','top_k',p.top_k,0,100,1)}
      </div>
    </div>

    <div class="th-api-group">
      <div class="th-api-group-label"><i class="fa-solid fa-stream"></i> 流式</div>
      <label class="th-api-stream-row">
        <span>should_stream(流式传输)</span>
        <label class="th-appearance-switch"><input type="checkbox" id="th-api-stream" ${p.should_stream?'checked':''}><span class="th-appearance-switch-track"><span class="th-appearance-switch-thumb"></span></span></label>
      </label>
    </div>

    <div class="th-api-group th-api-group-ai">
      <div class="th-api-group-label"><i class="fa-solid fa-diagram-project"></i> AI 总结来源</div>
      <div class="th-api-ai-api">
        <span class="th-api-ai-mode-lbl">① 使用哪个 API 预设</span>
        <select class="th-edit-select" id="th-api-aipreset">
          <option value="" ${st.aiPresetName===''?'selected':''}>用活动预设（${esc(st.active)}）</option>
          ${getApiPresetNames().map(n=>`<option value="${escAttr(n)}" ${n===st!.aiPresetName?'selected':''}>${esc(n)}</option>`).join('')}
        </select>
        <button class="th-btn-sm th-api-env-detail" type="button" title="查看提示词预设详情"><i class="fa-solid fa-circle-info"></i> 详情</button>
        <button class="th-btn-sm th-api-env-preview" type="button" title="预览将发给 AI 的提示词"><i class="fa-solid fa-eye"></i> 预览</button>
      </div>
      <div class="th-api-preset-env">
        <span class="th-api-ai-mode-lbl">② 提示词预设</span>
        <select class="th-edit-select th-api-env-sel" id="th-api-env-preset">
          <option value="" ${st.selPreset===''?'selected':''}>用 AI 总结内置提示词（不传预设）</option>
          ${getEnvPresetNames().map(p=>`<option value="${escAttr(p.name)}" ${p.name===st!.selPreset?'selected':''}>${esc(p.name)}${p.isLoaded?' (当前加载)':''}</option>`).join('')}
        </select>
        <div class="th-api-env-btns" style="display:flex;gap:4px;justify-content:flex-end">
          <button class="th-btn-sm th-api-env-activate" type="button" title="加载酒馆全局预设（影响正常聊天）"><i class="fa-solid fa-bolt"></i> 启用</button>
          <button class="th-btn-sm th-api-env-test" type="button" title="发送 ping 测试当前 AI 环境可用性"><i class="fa-solid fa-flask"></i> 测试</button>
          <button class="th-btn-sm th-api-env-export" type="button" title="导出该预设为 JSON"><i class="fa-solid fa-download"></i> 导出</button>
        </div>
        <label class="th-api-env-once" title="勾选=仅在 AI 调用时临时传该预设，不影响酒馆全局；不勾=切换酒馆全局预设"><input type="checkbox" id="th-api-env-once" ${st.onceOnly?'checked':''}> 仅本次有效</label>
      </div>
      <div class="th-api-ai-saved-snapshot" id="th-api-ai-snapshot">${renderSavedSnapshot()}</div>
      <div class="th-api-ai-actions">
        <button class="th-btn-sm th-btn-primary th-api-ai-save" type="button"><i class="fa-solid fa-floppy-disk"></i> 保存</button>
        <button class="th-btn-sm th-api-ai-clear" type="button"><i class="fa-solid fa-eraser"></i> 清除选择</button>
      </div>
    </div>

    <div class="th-api-actions">
      <span class="th-api-active-hint">活动预设:<b>${esc(st.active)}</b></span>
      <button class="th-btn-sm th-btn-primary th-api-done" type="button"><i class="fa-solid fa-check"></i> 完成</button>
    </div>
    <div class="th-api-hint"><i class="fa-solid fa-circle-info"></i> API 连接 + 获取模型已可用；AI 总结来源（选择 API 预设 × 提示词预设）可保存，AI 总结据此调用。</div>
  </div>`;
}

function renderSavedSnapshot(): string {
  const pe = getPresetEnvPersist();
  const api = pe.aiPresetName || '(活动预设)';
  const prompt = pe.presetName || '(内置提示词)';
  const once = pe.onceOnly ? '仅本次有效' : '切全局';
  return `<span class="th-api-ai-snap-lbl">当前已保存：</span><b>API=${esc(api)}</b> · <b>提示词=${esc(prompt)}</b> · <b>${once}</b>`;
}

function samplingRow(field:string, label:string, val:'same_as_preset'|'unset'|number, min:number, max:number, step:number): string {
  const isNum = typeof val === 'number';
  const mode = isNum ? 'custom' : (val as string);
  const num = isNum ? (val as number) : min;
  return `<div class="th-api-sample-row" data-sample="${field}">
    <span class="th-api-sample-label">${esc(label)}</span>
    <select class="th-edit-select th-api-sample-mode" data-sample-mode="${field}">
      <option value="same_as_preset" ${mode==='same_as_preset'?'selected':''}>同预设</option>
      <option value="unset" ${mode==='unset'?'selected':''}>不设置</option>
      <option value="custom" ${mode==='custom'?'selected':''}>自定义</option>
    </select>
    <input class="th-edit-input th-api-sample-num" type="number" data-sample-num="${field}" min="${min}" max="${max}" step="${step}" value="${num}" ${isNum?'':'style="display:none"'}>
  </div>`;
}

function bindApiEvents(): void {
  if(!st) return;
  const refresh = ()=>{ const body=qs('.th-modal-body-2'); if(body){ body.innerHTML=renderApiPanel(); setTimeout(()=>bindApiEvents(),40); } };

  qs('#th-api-preset')?.addEventListener('change',function(this:HTMLSelectElement){
    if(!st) return; st.editing = this.value; refresh();
  });
  qs('.th-api-preset-new')?.addEventListener('click',()=>{
    if(!st) return;
    let n='预设'+(st.presets.length+1);
    while(st.presets.some(p=>p.name===n)) n='预设'+(Math.floor(Math.random()*9000)+1000);
    st.presets.push({ ...DEFAULT_PRESET, name:n });
    st.editing=n; savePresets(st.presets); refresh();
  });
  qs('.th-api-preset-rename')?.addEventListener('click',async()=>{
    if(!st) return; const p=curPreset(); if(!p) return;
    const n=(await thPrompt({title:'重命名预设',value:p.name,placeholder:'新名称'})||'').trim(); if(!n||n===p.name) return;
    if(st.presets.some(x=>x.name===n)){ toastr?.warning?.('该名称已存在'); return; }
    const old=p.name; p.name=n;
    if(st.active===old) { st.active=n; saveActive(n); }
    st.editing=n; savePresets(st.presets); refresh();
  });
  qs('.th-api-preset-del')?.addEventListener('click',async function(this:HTMLButtonElement){
    if(!st||this.disabled) return; if(st.presets.length<=1) return;
    const p=curPreset(); if(!p) return;
    if(!await thConfirm({title:'删除预设',message:`确定要删除预设「${p.name}」吗？`,confirmText:'删除',danger:true})) return;
    st.presets = st.presets.filter(x=>x.name!==p.name);
    if(st.active===p.name){ st.active=st.presets[0].name; saveActive(st.active); }
    st.editing=st.presets[0].name; savePresets(st.presets); refresh();
  });
  qs('.th-api-preset-activate')?.addEventListener('click',function(this:HTMLButtonElement){
    if(!st||this.disabled) return; const p=curPreset(); if(!p) return;
    collectFormToPreset(p);
    st.active=p.name; saveActive(p.name); savePresets(st.presets);
    toastr?.success?.(`已设「${p.name}」为活动预设`);
    refresh();
  });

  bindInput('#th-api-source', v=>{ const p=curPreset(); if(p){ p.source=v; savePresets(st!.presets); } });
  bindInput('#th-api-apiurl', v=>{ const p=curPreset(); if(p){ p.apiurl=v; savePresets(st!.presets); } });
  bindInput('#th-api-key', v=>{ const p=curPreset(); if(p){ p.key=v; savePresets(st!.presets); } });
  qs('.th-api-key-toggle')?.addEventListener('click',()=>{ if(st){ st.showKey=!st.showKey; refresh(); } });
  bindInput('#th-api-model-manual', v=>{ const p=curPreset(); if(p){ p.model=v; savePresets(st!.presets); } });
  qs('#th-api-model-sel')?.addEventListener('change',function(this:HTMLSelectElement){
    const p=curPreset(); if(p){ p.model=this.value; savePresets(st!.presets); }
  });
  qs('#th-api-stream')?.addEventListener('change',function(this:HTMLInputElement){
    const p=curPreset(); if(p){ p.should_stream=this.checked; savePresets(st!.presets); }
  });
  qsa('[data-sample-mode]').forEach(sel=>sel.addEventListener('change',function(this:HTMLSelectElement){
    if(!st) return; const field=this.getAttribute('data-sample-mode') as keyof ApiPreset;
    const p=curPreset(); if(!p) return;
    const numInput = qs<HTMLInputElement>(`[data-sample-num="${field}"]`);
    if(this.value==='custom'){
      if(numInput){ numInput.style.display=''; const cur=(p as any)[field]; numInput.value = typeof cur==='number'?String(cur):'0'; }
      (p as any)[field] = Number(numInput?.value||0);
    } else {
      if(numInput) numInput.style.display='none';
      (p as any)[field] = this.value as any;
    }
    savePresets(st.presets);
  }));
  qsa('[data-sample-num]').forEach(inp=>inp.addEventListener('change',function(this:HTMLInputElement){
    if(!st) return; const field=this.getAttribute('data-sample-num') as keyof ApiPreset;
    const p=curPreset(); if(!p) return;
    (p as any)[field] = Number(this.value)||0; savePresets(st.presets);
  }));

  qs('.th-api-test')?.addEventListener('click', async function(this:HTMLButtonElement){
    if(!st||this.disabled) return;
    const p=curPreset(); if(!p) return;
    collectFormToPreset(p);
    if(!p.apiurl){ toastr?.warning?.('请先填写 Base URL'); return; }
    const btn=this; btn.disabled=true; const ico=btn.querySelector('i');
    if(ico){ ico.className='fa-solid fa-spinner fa-spin'; } const oldHtml=btn.innerHTML; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> 获取中…';
    const fn=getGetModelList();
    const resultEl=qs('#th-api-test-result');
    const refreshModelGroup = ()=>{
      const row=qs('.th-api-model-row');
      if(row){ row.innerHTML = st!.models.length
        ? `<select class="th-edit-select th-api-model-select" id="th-api-model-sel">${st!.models.map(m=>`<option value="${escAttr(m)}" ${m===p.model?'selected':''}>${esc(m)}</option>`).join('')}</select>`
        : `<input class="th-edit-input" id="th-api-model-manual" value="${escAttr(p.model)}" placeholder="手填模型名,如 gpt-4o">`;
        qs('#th-api-model-manual')?.addEventListener('input',function(this:HTMLInputElement){ const pp=curPreset(); if(pp){ pp.model=this.value; savePresets(st!.presets); } });
        qs('#th-api-model-sel')?.addEventListener('change',function(this:HTMLSelectElement){ const pp=curPreset(); if(pp){ pp.model=this.value; savePresets(st!.presets); } });
      }
    };
    if(!fn){
      btn.disabled=false; btn.innerHTML=oldHtml;
      if(resultEl) resultEl.innerHTML='<span class="th-api-fail">当前环境无 getModelList 接口</span>';
      return;
    }
    try{
      const models=await fn({ apiurl:p.apiurl, key:p.key||undefined });
      st.models=Array.isArray(models)?models:[];
      btn.disabled=false; btn.innerHTML=oldHtml;
      if(resultEl) resultEl.innerHTML=`<span class="th-api-ok"><i class="fa-solid fa-circle-check"></i> 成功,${st.models.length} 个模型</span>`;
      toastr?.success?.(`连接成功,获取到 ${st.models.length} 个模型`);
      refreshModelGroup();
    }catch(e){
      st.models=[];
      btn.disabled=false; btn.innerHTML=oldHtml;
      const msg=(e as Error)?.message||String(e);
      if(resultEl) resultEl.innerHTML=`<span class="th-api-fail"><i class="fa-solid fa-circle-xmark"></i> ${esc(msg)}</span>`;
      toastr?.error?.('连接失败: '+msg);
    }
  });

  qs('#th-api-aipreset')?.addEventListener('change',function(this:HTMLSelectElement){
    if(!st) return; st.aiPresetName = this.value;
  });
  qs('#th-api-env-preset')?.addEventListener('change',function(this:HTMLSelectElement){
    if(!st) return; st.selPreset = this.value;
  });
  qs('#th-api-env-once')?.addEventListener('change',function(this:HTMLInputElement){
    if(!st) return; st.onceOnly = this.checked;
  });
  qs('.th-api-env-detail')?.addEventListener('click',()=>{
    if(!st) return;
    openEnvDetailModal(st.selPreset || getEnvLoadedPresetName() || '');
  });
  qs('.th-api-env-preview')?.addEventListener('click',()=>{
    if(!st) return;
    void openEnvPreviewModal(st.selPreset);
  });
  qs('.th-api-env-activate')?.addEventListener('click',()=>{
    if(!st) return;
    const name = st.selPreset;
    if(!name){ toastr?.warning?.('请先选择提示词预设'); return; }
    const ok = envLoadPreset(name);
    toastr?.[ok?'success':'error']?.(ok?`已加载全局预设「${name}」`:`加载预设「${name}」失败`);
  });
  qs('.th-api-env-test')?.addEventListener('click',()=>{
    if(!st) return;
    const btn = qs<HTMLButtonElement>('.th-api-env-test');
    const old = btn?.innerHTML;
    if(btn){ btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> 测试中'; }
    envTestPing().then(t=>{
      toastr?.success?.('连接正常：'+String(t).slice(0,80));
    }).catch(e=>{
      toastr?.error?.('测试失败：'+(e instanceof Error?e.message:String(e)));
    }).finally(()=>{
      if(btn){ btn.disabled=false; btn.innerHTML=old||''; }
    });
  });
  qs('.th-api-env-export')?.addEventListener('click',()=>{
    if(!st) return;
    exportEnvPresetSnapshot(st.selPreset || getEnvLoadedPresetName() || '');
  });
  qs('.th-api-ai-save')?.addEventListener('click',()=>{
    if(!st) return;
    setPresetEnvPersist({ presetName: st.selPreset, onceOnly: st.onceOnly, aiPresetName: st.aiPresetName });
    const snap = qs('#th-api-ai-snapshot'); if(snap) snap.innerHTML = renderSavedSnapshot();
    toastr?.success?.('已保存 AI 总结来源设置');
  });
  qs('.th-api-ai-clear')?.addEventListener('click',()=>{
    if(!st) return;
    st.aiPresetName=''; st.selPreset=''; st.onceOnly=true;
    setPresetEnvPersist({ presetName: '', onceOnly: true, aiPresetName: '' });
    const sel = qs<HTMLSelectElement>('#th-api-aipreset'); if(sel) sel.value='';
    const ps = qs<HTMLSelectElement>('#th-api-env-preset'); if(ps) ps.value='';
    const oc = qs<HTMLInputElement>('#th-api-env-once'); if(oc) oc.checked=true;
    const snap = qs('#th-api-ai-snapshot'); if(snap) snap.innerHTML = renderSavedSnapshot();
    toastr?.info?.('已清除 AI 总结来源选择');
  });

  qs('.th-api-done')?.addEventListener('click',()=>{
    const p=curPreset(); if(p){ collectFormToPreset(p); savePresets(st!.presets); }
    setPresetEnvPersist({ presetName: st!.selPreset, onceOnly: st!.onceOnly, aiPresetName: st!.aiPresetName });
    closeModal2();
  });
}

function collectFormToPreset(p: ApiPreset): void {
  const g = (id:string)=>{ const el=qs<HTMLInputElement|HTMLSelectElement>(id); return el?el.value:''; };
  p.source=g('#th-api-source'); p.apiurl=g('#th-api-apiurl'); p.key=g('#th-api-key');
  const modelSel=qs<HTMLSelectElement>('#th-api-model-sel');
  const modelInp=qs<HTMLInputElement>('#th-api-model-manual');
  p.model = modelSel?modelSel.value:(modelInp?modelInp.value:p.model);
  const stream=qs<HTMLInputElement>('#th-api-stream'); if(stream) p.should_stream=stream.checked;
}

function bindInput(sel:string, cb:(v:string)=>void): void {
  qs(sel)?.addEventListener('change',function(this:HTMLInputElement){ cb(this.value); });
  qs(sel)?.addEventListener('input',function(this:HTMLInputElement){ cb(this.value); });
}

function openEnvDetailModal(name: string): void {
  if(!name){ toastr?.warning?.('未选择提示词预设（当前酒馆未加载预设时无法查看）'); return; }
  const detail = getEnvPresetDetail(name);
  if(!detail){ toastr?.error?.('读取预设失败（getPreset 不可用或预设不存在）'); return; }
  const s = detail.settings || {};
  const promptRows = detail.prompts.map((pr:any,i:number)=>{
    const en = pr && pr.enabled===false ? '<span class="th-api-env-disabled">禁用</span>' : '';
    const role = pr?.role || (pr?.system?'system':'user');
    const nm = pr?.name || `#${i}`;
    return `<div class="th-api-env-prompt-row"><span class="th-api-env-prompt-role">${esc(role)}</span><span class="th-api-env-prompt-name">${esc(nm)}</span>${en}</div>`;
  }).join('') || '<div style="color:var(--tx3)">无提示词</div>';
  const h = `<div class="th-api-env-detail" style="padding:12px">
    <div class="th-api-env-detail-head">预设「${esc(name)}」—— ${detail.promptCount} 条提示词</div>
    <div class="th-api-env-detail-params">
      <span>温度: ${(s.temperature ?? '-')}</span><span>top_p: ${(s.top_p ?? '-')}</span>
      <span>max_context: ${(s.max_context ?? '-')}</span><span>流式: ${(!!s.should_stream)}</span>
      <span>top_k: ${(s.top_k ?? '-')}</span>
    </div>
    <div class="th-api-env-detail-list" style="max-height:360px;overflow-y:auto;display:grid;gap:4px;margin-top:10px">${promptRows}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="th-btn" id="th-env-detail-close"><i class="fa-solid fa-xmark"></i> 关闭</button>
    </div>
  </div>`;
  openModal2('提示词预设详情', h, { maxWidth:'min(640px,92vw)' });
  setTimeout(()=>qs('#th-env-detail-close')?.addEventListener('click',closeModal2),40);
}

async function openEnvPreviewModal(presetName: string): Promise<void> {
  const userInput = (await thPrompt({title:'预览发送内容',message:'输入 user_input（留空用空）'}) ?? '');
  const text = previewGeneratePayload(presetName || getEnvLoadedPresetName() || '', userInput);
  const h = `<div class="th-api-env-preview" style="padding:12px">
    <div style="color:var(--tx2);font-size:12px;margin-bottom:8px;line-height:1.6">以下是将拼装发给 AI 的提示词（仅预览，不实际发送）。提示词预设为 <b>${esc(presetName||'酒馆当前加载预设')}</b>。</div>
    <textarea class="th-edit-textarea" readonly style="min-height:320px;width:100%;font-family:ui-monospace,monospace;font-size:12px;resize:vertical">${esc(text)}</textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
      <button class="th-btn" id="th-env-preview-copy" type="button"><i class="fa-solid fa-copy"></i> 复制</button>
      <button class="th-btn" id="th-env-preview-close" type="button">关闭</button>
    </div>
  </div>`;
  openModal2('发送前预览', h, { maxWidth:'min(720px,94vw)' });
  setTimeout(()=>{
    qs('#th-env-preview-close')?.addEventListener('click',closeModal2);
    qs('#th-env-preview-copy')?.addEventListener('click',()=>{
      const ta=qs<HTMLTextAreaElement>('.th-api-env-preview textarea'); if(!ta) return;
      try{ navigator.clipboard?.writeText(ta.value); toastr?.success?.('已复制到剪贴板'); }
      catch(e){ ta.select(); __doc.execCommand?.('copy'); toastr?.info?.('已选中，Ctrl+C 复制'); }
    });
  },40);
}
