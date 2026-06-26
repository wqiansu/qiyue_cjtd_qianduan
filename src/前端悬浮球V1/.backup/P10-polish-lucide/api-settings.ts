// API 设置面板(P8,预留地基)。
// 连接(source/apiurl/key) + 测试连接(getModelList) + 模型 + 采样参数 + 流式 + 预设管理。
// 持久化:_th_api_presets_v1(预设列表) / _th_api_active_v1(活动预设名)。
// 定位:本期预留地基——面板能存配置 + 测试连接,实际接入 generate 流是以后的事。
// ================================================================
import { esc, escAttr, qs, qsa } from '../lib/dom-utils';
import { openModal2, closeModal2 } from '../status-bar-init';

const LS_PRESETS = '_th_api_presets_v1';
const LS_ACTIVE = '_th_api_active_v1';

export interface ApiPreset {
  name: string;
  source: string;          // API 源,默认 openai
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

// ---- 持久化 ----
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

// getModelList 在酒馆助手全局;iframe 内可能没有,走 getRoot
function getGetModelList(): ((cfg:{apiurl:string;key?:string})=>Promise<string[]>)|null {
  try {
    const w = window as any;
    if(typeof w.getModelList==='function') return w.getModelList.bind(w);
    const p = window.parent as any;
    if(p && typeof p.getModelList==='function') return p.getModelList.bind(p);
  } catch(e){ void e; }
  return null;
}

// ---- 面板状态(单实例,面板开期间持有) ----
interface PanelState {
  presets: ApiPreset[];
  active: string;          // 当前活动预设名
  editing: string;         // 当前编辑的预设名
  showKey: boolean;        // key 显隐
  models: string[];        // 测试连接拉到的模型列表
  testing: boolean;
}
let st: PanelState|null = null;

export function openApiSettings(): void {
  const presets = loadPresets();
  const active = loadActive();
  st = { presets, active, editing: active, showKey:false, models:[], testing:false };
  // 编辑态取活动预设的副本
  const cur = presets.find(p=>p.name===active) || presets[0];
  st.editing = cur.name;
  openModal2(`<i class="fa-solid fa-key"></i> API 设置`, renderApiPanel(), { maxWidth:'min(680px,94vw)' });
  setTimeout(()=>bindApiEvents(), 60);
}

// 当前编辑中的预设对象(引用,直接改即持久化源)
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
        <button class="th-btn-sm th-api-test" type="button" ${st.testing?'disabled':''}><i class="fa-solid ${st.testing?'fa-spinner fa-spin':'fa-plug-circle-check'}"></i> ${st.testing?'测试中…':'测试连接'}</button>
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

    <div class="th-api-actions">
      <span class="th-api-active-hint">活动预设:<b>${esc(st.active)}</b></span>
      <button class="th-btn-sm th-btn-primary th-api-done" type="button"><i class="fa-solid fa-check"></i> 完成</button>
    </div>
    <div class="th-api-hint"><i class="fa-solid fa-circle-info"></i> 本期为预留地基:可保存配置并测试连接,实际接入生成流后续再做。</div>
  </div>`;
}

// 采样行:模式下拉(same_as_preset/unset/自定义) + 自定义时滑块+数值
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

  // 预设切换
  qs('#th-api-preset')?.addEventListener('change',function(this:HTMLSelectElement){
    if(!st) return; st.editing = this.value; refresh();
  });
  // 新建预设
  qs('.th-api-preset-new')?.addEventListener('click',()=>{
    if(!st) return;
    let n='预设'+(st.presets.length+1);
    while(st.presets.some(p=>p.name===n)) n='预设'+(Math.floor(Math.random()*9000)+1000);
    st.presets.push({ ...DEFAULT_PRESET, name:n });
    st.editing=n; savePresets(st.presets); refresh();
  });
  // 重命名
  qs('.th-api-preset-rename')?.addEventListener('click',()=>{
    if(!st) return; const p=curPreset(); if(!p) return;
    const n=(prompt('预设新名称:',p.name)||'').trim(); if(!n||n===p.name) return;
    if(st.presets.some(x=>x.name===n)){ toastr?.warning?.('该名称已存在'); return; }
    const old=p.name; p.name=n;
    if(st.active===old) { st.active=n; saveActive(n); }
    st.editing=n; savePresets(st.presets); refresh();
  });
  // 删除预设
  qs('.th-api-preset-del')?.addEventListener('click',function(this:HTMLButtonElement){
    if(!st||this.disabled) return; if(st.presets.length<=1) return;
    const p=curPreset(); if(!p) return;
    if(!confirm(`删除预设「${p.name}」?`)) return;
    st.presets = st.presets.filter(x=>x.name!==p.name);
    if(st.active===p.name){ st.active=st.presets[0].name; saveActive(st.active); }
    st.editing=st.presets[0].name; savePresets(st.presets); refresh();
  });
  // 设为活动
  qs('.th-api-preset-activate')?.addEventListener('click',function(this:HTMLButtonElement){
    if(!st||this.disabled) return; const p=curPreset(); if(!p) return;
    collectFormToPreset(p);
    st.active=p.name; saveActive(p.name); savePresets(st.presets);
    toastr?.success?.(`已设「${p.name}」为活动预设`);
    refresh();
  });

  // 连接字段(实时存)
  bindInput('#th-api-source', v=>{ const p=curPreset(); if(p){ p.source=v; savePresets(st!.presets); } });
  bindInput('#th-api-apiurl', v=>{ const p=curPreset(); if(p){ p.apiurl=v; savePresets(st!.presets); } });
  bindInput('#th-api-key', v=>{ const p=curPreset(); if(p){ p.key=v; savePresets(st!.presets); } });
  // key 显隐
  qs('.th-api-key-toggle')?.addEventListener('click',()=>{ if(st){ st.showKey=!st.showKey; refresh(); } });
  // 模型(手填或下拉)
  bindInput('#th-api-model-manual', v=>{ const p=curPreset(); if(p){ p.model=v; savePresets(st!.presets); } });
  qs('#th-api-model-sel')?.addEventListener('change',function(this:HTMLSelectElement){
    const p=curPreset(); if(p){ p.model=this.value; savePresets(st!.presets); }
  });
  // 流式
  qs('#th-api-stream')?.addEventListener('change',function(this:HTMLInputElement){
    const p=curPreset(); if(p){ p.should_stream=this.checked; savePresets(st!.presets); }
  });
  // 采样
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

  // 测试连接
  qs('.th-api-test')?.addEventListener('click', async function(this:HTMLButtonElement){
    if(!st||this.disabled) return;
    const p=curPreset(); if(!p) return;
    collectFormToPreset(p);
    if(!p.apiurl){ toastr?.warning?.('请先填写 Base URL'); return; }
    st.testing=true; refresh();
    const fn=getGetModelList();
    const resultEl=qs('#th-api-test-result');
    if(!fn){
      st.testing=false;
      if(resultEl) resultEl.innerHTML='<span class="th-api-fail">当前环境无 getModelList 接口</span>';
      refresh(); return;
    }
    try{
      const models=await fn({ apiurl:p.apiurl, key:p.key||undefined });
      st.testing=false; st.models=Array.isArray(models)?models:[];
      if(resultEl) resultEl.innerHTML=`<span class="th-api-ok"><i class="fa-solid fa-circle-check"></i> 成功,${st.models.length} 个模型</span>`;
      toastr?.success?.(`连接成功,获取到 ${st.models.length} 个模型`);
      refresh();
    }catch(e){
      st.testing=false;
      const msg=(e as Error)?.message||String(e);
      if(resultEl) resultEl.innerHTML=`<span class="th-api-fail"><i class="fa-solid fa-circle-xmark"></i> ${esc(msg)}</span>`;
      toastr?.error?.('连接失败: '+msg);
      refresh();
    }
  });

  // 完成
  qs('.th-api-done')?.addEventListener('click',()=>{
    const p=curPreset(); if(p){ collectFormToPreset(p); savePresets(st!.presets); }
    closeModal2();
  });
}

// 把表单当前值收集回预设对象(切预设/设活动/测试前调用,防丢输入)
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
