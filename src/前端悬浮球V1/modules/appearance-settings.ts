import { esc, qs, qsa, gw } from '../lib/dom-utils';
import { openModal2, closeModal2 } from '../status-bar-init';

const LS_KEY = '_th_appearance_v1';

type AccentKey = 'pink'|'lav'|'mint'|'sky'|'gold';
const ACCENTS: Record<AccentKey,{label:string;swatch:string;vars:Record<string,string>}> = {
  pink: { label:'糖果粉', swatch:'#ff7b9d', vars:{ '--pink':'#ff7b9d','--pink2':'#ff9eb8','--pink3':'#ffe0ec','--pink4':'#fff0f6','--accent-pink':'#ff6090' } },
  lav:  { label:'薰衣草', swatch:'#c88aff', vars:{ '--pink':'#c88aff','--pink2':'#ddb8ff','--pink3':'#f0e0ff','--pink4':'#f8f0ff','--accent-pink':'#b060ff' } },
  mint: { label:'薄荷绿', swatch:'#5cd4a8', vars:{ '--pink':'#5cd4a8','--pink2':'#82e0b8','--pink3':'#e0f5ec','--pink4':'#f0fbf7','--accent-pink':'#3ab896' } },
  sky:  { label:'天蓝', swatch:'#5ad0ee', vars:{ '--pink':'#5ad0ee','--pink2':'#96e4f5','--pink3':'#e0f7fc','--pink4':'#f0fbfd','--accent-pink':'#30d8f0' } },
  gold: { label:'蜜糖金', swatch:'#ffaa2b', vars:{ '--pink':'#ffaa2b','--pink2':'#ffc966','--pink3':'#fff0d8','--pink4':'#fff8ec','--accent-pink':'#ff9500' } },
};

export interface AppearanceSettings {
  accent: AccentKey;
  fontScale: 's'|'m'|'l';
  density: 'compact'|'normal'|'loose';
  motion: 'off'|'light'|'normal'|'strong';
  glass: boolean;
  mist: boolean;
  ring: 'breath'|'static';
  radius: 'soft'|'normal'|'sharp';
  bg: 'dream'|'pure'|'star'|'sakura';
  shadow: 'flat'|'soft'|'deep';
  sat: 'pastel'|'normal'|'vivid';
  lh: 'tight'|'normal'|'airy';
  glassBlur: number;
}

const DEFAULTS: AppearanceSettings = {
  accent:'pink', fontScale:'m', density:'normal', motion:'normal',
  glass:true, mist:true, ring:'breath', radius:'normal',
  bg:'dream', shadow:'soft', sat:'normal', lh:'normal', glassBlur:12,
};

const FONT_SIZE: Record<AppearanceSettings['fontScale'],string> = { s:'15px', m:'17px', l:'19px' };
const RADIUS: Record<AppearanceSettings['radius'],{r:string;rs:string;rx:string;rl:string}> = {
  soft:  { r:'26px', rs:'18px', rx:'14px', rl:'30px' },
  normal:{ r:'20px', rs:'14px', rx:'10px', rl:'24px' },
  sharp: { r:'12px', rs:'9px',  rx:'6px',  rl:'16px' },
};
const DENSITY: Record<AppearanceSettings['density'],string> = {
  compact:'6px 10px', normal:'8px 12px', loose:'12px 16px',
};
const DENSITY_GAP: Record<AppearanceSettings['density'],string> = {
  compact:'6px', normal:'8px', loose:'12px',
};
const MOTION_DUR: Record<AppearanceSettings['motion'],string> = {
  off:'0s', light:'0.12s', normal:'0.22s', strong:'0.38s',
};
const MOTION_ENV_DUR: Record<AppearanceSettings['motion'],string> = {
  off:'0s', light:'30s', normal:'20s', strong:'12s',
};
const SHADOW: Record<AppearanceSettings['shadow'],{s1:string;s2:string;s3:string}> = {
  flat: { s1:'none', s2:'0 2px 8px rgba(160,100,140,0.06)', s3:'0 4px 16px rgba(160,100,140,0.1)' },
  soft: { s1:'0 4px 16px rgba(160,100,140,0.08), inset 0 1px 1px rgba(255,255,255,0.55)', s2:'0 12px 32px rgba(160,100,140,0.16), inset 0 1px 1px rgba(255,255,255,0.65)', s3:'0 24px 64px rgba(160,100,140,0.24), inset 0 1px 1px rgba(255,255,255,0.7)' },
  deep: { s1:'0 8px 24px rgba(160,100,140,0.16), inset 0 1px 1px rgba(255,255,255,0.5)', s2:'0 20px 48px rgba(160,100,140,0.28), inset 0 1px 1px rgba(255,255,255,0.6)', s3:'0 36px 80px rgba(160,100,140,0.4), inset 0 1px 1px rgba(255,255,255,0.65)' },
};
const SAT: Record<AppearanceSettings['sat'],{filter:string;pinkShift:number}> = {
  pastel: { filter:'saturate(0.78) brightness(1.05)', pinkShift:-12 },
  normal: { filter:'none', pinkShift:0 },
  vivid:  { filter:'saturate(1.25) brightness(0.98)', pinkShift:8 },
};
const LINE_HEIGHT: Record<AppearanceSettings['lh'],string> = {
  tight:'1.45', normal:'1.6', airy:'1.85',
};
function glassAlpha(blur:number): string {
  const a = blur<=0 ? 0.96 : Math.max(0.5, 0.92 - blur*0.025);
  return `rgba(255,255,255,${a.toFixed(2)})`;
}

function loadSettings(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw);
    const merged = { ...DEFAULTS, ...p };
    const gb = Number(merged.glassBlur);
    merged.glassBlur = (Number.isFinite(gb) ? Math.max(0, Math.min(16, gb)) : 12);
    return merged;
  } catch(e){ void e; return { ...DEFAULTS }; }
}
function saveSettings(s: AppearanceSettings): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch(e){ void e; }
}

export function applyAppearance(s: AppearanceSettings): void {
  const w = gw();
  if(!w) return;
  w.setAttribute('data-accent', s.accent);
  w.setAttribute('data-fontscale', s.fontScale);
  w.setAttribute('data-density', s.density);
  w.setAttribute('data-motion', s.motion);
  const glassOn = s.glass && s.glassBlur > 0;
  w.setAttribute('data-glass', glassOn ? 'on' : 'off');
  w.setAttribute('data-mist', s.mist?'on':'off');
  w.setAttribute('data-ring', s.ring);
  w.setAttribute('data-radius', s.radius);
  w.setAttribute('data-bg', s.bg);
  w.setAttribute('data-shadow', s.shadow);
  w.setAttribute('data-sat', s.sat);
  w.setAttribute('data-lh', s.lh);
  const accent = ACCENTS[s.accent] || ACCENTS.pink;
  const radius = RADIUS[s.radius] || RADIUS.normal;
  const shadow = SHADOW[s.shadow] || SHADOW.soft;
  const vars: Record<string,string> = {
    ...accent.vars,
    '--r': radius.r, '--rs': radius.rs, '--rx': radius.rx, '--rl': radius.rl,
    '--card-pad': DENSITY[s.density] || DENSITY.normal,
    '--card-gap': DENSITY_GAP[s.density] || DENSITY_GAP.normal,
    '--ui-dur': MOTION_DUR[s.motion] || MOTION_DUR.normal,
    '--env-dur': MOTION_ENV_DUR[s.motion] || MOTION_ENV_DUR.normal,
    '--sh-1': shadow.s1, '--sh-2': shadow.s2, '--sh-3': shadow.s3,
    '--glass': glassAlpha(s.glassBlur),
    '--glass-blur': (glassOn ? s.glassBlur : 0) + 'px',
  };
  for(const [k,v] of Object.entries(vars)) w.style.setProperty(k, v);
  w.style.fontSize = FONT_SIZE[s.fontScale] || FONT_SIZE.m;
  w.style.lineHeight = LINE_HEIGHT[s.lh] || LINE_HEIGHT.normal;
  w.style.filter = SAT[s.sat]?.filter || 'none';
}

export function initAppearance(): void {
  applyAppearance(loadSettings());
}

export function openAppearanceSettings(): void {
  const s = loadSettings();
  const h = renderAppearancePanel(s);
  openModal2(`<i class="fa-solid fa-palette"></i> 外观设置`, h, { maxWidth:'min(600px,94vw)' });
  setTimeout(()=>bindAppearanceEvents(s), 60);
}

function renderAppearancePanel(s: AppearanceSettings): string {
  return `<div class="th-appearance">
    <div class="th-appearance-group">
      <div class="th-appearance-label"><i class="fa-solid fa-droplet"></i> 主题强调色</div>
      <div class="th-appearance-accent-row">
        ${(Object.keys(ACCENTS) as AccentKey[]).map(k=>{
          const a = ACCENTS[k];
          return `<button class="th-appearance-swatch ${s.accent===k?'active':''}" data-acc-set="${k}" title="${esc(a.label)}" style="background:${a.swatch}"></button>`;
        }).join('')}
      </div>
    </div>

    <div class="th-appearance-group">
      <div class="th-appearance-label"><i class="fa-solid fa-circle-half-stroke"></i> 饱和度</div>
      <div class="th-appearance-seg">
        ${segBtn('sat','pastel','淡雅',s.sat==='pastel')}
        ${segBtn('sat','normal','标准',s.sat==='normal')}
        ${segBtn('sat','vivid','浓烈',s.sat==='vivid')}
      </div>
    </div>

    <div class="th-appearance-group">
      <div class="th-appearance-label"><i class="fa-solid fa-image"></i> 背景主题</div>
      <div class="th-appearance-seg th-appearance-seg-4">
        ${segBtn('bg','dream','梦幻',s.bg==='dream')}
        ${segBtn('bg','pure','纯净',s.bg==='pure')}
        ${segBtn('bg','star','星河',s.bg==='star')}
        ${segBtn('bg','sakura','樱花',s.bg==='sakura')}
      </div>
    </div>

    <div class="th-appearance-group">
      <div class="th-appearance-label"><i class="fa-solid fa-text-height"></i> 字号</div>
      <div class="th-appearance-seg">
        ${segBtn('fontscale','s','小',s.fontScale==='s')}
        ${segBtn('fontscale','m','标准',s.fontScale==='m')}
        ${segBtn('fontscale','l','大',s.fontScale==='l')}
      </div>
    </div>

    <div class="th-appearance-group">
      <div class="th-appearance-label"><i class="fa-solid fa-grip-lines"></i> 行间距</div>
      <div class="th-appearance-seg">
        ${segBtn('lh','tight','紧凑',s.lh==='tight')}
        ${segBtn('lh','normal','标准',s.lh==='normal')}
        ${segBtn('lh','airy','舒展',s.lh==='airy')}
      </div>
    </div>

    <div class="th-appearance-group">
      <div class="th-appearance-label"><i class="fa-solid fa-grip"></i> 卡片密度</div>
      <div class="th-appearance-seg">
        ${segBtn('density','compact','紧凑',s.density==='compact')}
        ${segBtn('density','normal','标准',s.density==='normal')}
        ${segBtn('density','loose','宽松',s.density==='loose')}
      </div>
    </div>

    <div class="th-appearance-group">
      <div class="th-appearance-label"><i class="fa-solid fa-circle-half-stroke"></i> 圆角风格</div>
      <div class="th-appearance-seg">
        ${segBtn('radius','soft','柔',s.radius==='soft')}
        ${segBtn('radius','normal','标准',s.radius==='normal')}
        ${segBtn('radius','sharp','利',s.radius==='sharp')}
      </div>
    </div>

    <div class="th-appearance-group">
      <div class="th-appearance-label"><i class="fa-solid fa-layer-group"></i> 阴影深度</div>
      <div class="th-appearance-seg">
        ${segBtn('shadow','flat','扁平',s.shadow==='flat')}
        ${segBtn('shadow','soft','柔和',s.shadow==='soft')}
        ${segBtn('shadow','deep','立体',s.shadow==='deep')}
      </div>
    </div>

    <div class="th-appearance-group">
      <div class="th-appearance-label"><i class="fa-solid fa-bolt"></i> 动效强度</div>
      <div class="th-appearance-seg th-appearance-seg-4">
        ${segBtn('motion','off','关',s.motion==='off')}
        ${segBtn('motion','light','轻',s.motion==='light')}
        ${segBtn('motion','normal','标准',s.motion==='normal')}
        ${segBtn('motion','strong','强',s.motion==='strong')}
      </div>
    </div>

    <div class="th-appearance-group th-appearance-toggles">
      ${toggleRow('mist','背景流光薄雾',s.mist,'fa-solid fa-wind')}
      <div class="th-appearance-toggle-row">
        <span class="th-appearance-toggle-text"><i class="fa-solid fa-ring"></i> 头像光环</span>
        <div class="th-appearance-seg th-appearance-seg-mini">
          ${segBtn('ring','breath','呼吸',s.ring==='breath')}
          ${segBtn('ring','static','静态',s.ring==='static')}
        </div>
      </div>
    </div>

    <div class="th-appearance-group">
      <div class="th-appearance-label"><i class="fa-regular fa-snowflake"></i> 玻璃强度 <span class="th-appearance-val" id="th-glass-val">${s.glassBlur}</span></div>
      <input type="range" min="0" max="16" step="1" value="${s.glassBlur}" class="th-appearance-slider" data-acc-slider="glassBlur">
      <div class="th-appearance-slider-hint">0 = 实色清晰 · 16 = 强玻璃朦胧</div>
    </div>

    <div class="th-appearance-actions">
      <button class="th-btn-sm th-appearance-reset" type="button"><i class="fa-solid fa-rotate-left"></i> 恢复默认</button>
      <button class="th-btn-sm th-btn-primary th-appearance-done" type="button"><i class="fa-solid fa-check"></i> 完成</button>
    </div>
    <div class="th-appearance-hint"><i class="fa-solid fa-circle-info"></i> 设置实时生效并自动保存,关闭面板即保留。</div>
  </div>`;
}

function segBtn(group:string, val:string, label:string, active:boolean): string {
  return `<button class="th-appearance-seg-btn ${active?'active':''}" data-acc-${group}="${val}" type="button">${esc(label)}</button>`;
}
function toggleRow(key:string, label:string, on:boolean, icon:string): string {
  return `<div class="th-appearance-toggle-row">
    <span class="th-appearance-toggle-text"><i class="${icon}"></i> ${esc(label)}</span>
    <label class="th-appearance-switch"><input type="checkbox" data-acc-toggle="${key}" ${on?'checked':''}><span class="th-appearance-switch-track"><span class="th-appearance-switch-thumb"></span></span></label>
  </div>`;
}

function bindAppearanceEvents(s: AppearanceSettings): void {
  qsa('[data-acc-set]').forEach(btn=>btn.addEventListener('click',function(this:HTMLElement){
    const k = this.getAttribute('data-acc-set') as AccentKey;
    if(!k || !ACCENTS[k]) return;
    s.accent = k;
    qsa('[data-acc-set]').forEach(b=>b.classList.toggle('active', b===this));
    applyAppearance(s); saveSettings(s);
  }));
  const segGroups: [keyof AppearanceSettings, string][] = [
    ['fontScale','fontscale'], ['density','density'], ['motion','motion'], ['radius','radius'],
    ['sat','sat'], ['bg','bg'], ['lh','lh'], ['shadow','shadow'],
  ];
  for(const [field, attr] of segGroups){
    qsa(`[data-acc-${attr}]`).forEach(btn=>btn.addEventListener('click',function(this:HTMLElement){
      const v = this.getAttribute(`data-acc-${attr}`) as any;
      if(!v) return;
      (s as any)[field] = v;
      qsa(`[data-acc-${attr}]`).forEach(b=>b.classList.toggle('active', b===this));
      applyAppearance(s); saveSettings(s);
    }));
  }
  qsa('[data-acc-ring]').forEach(btn=>btn.addEventListener('click',function(this:HTMLElement){
    const v = this.getAttribute('data-acc-ring') as AppearanceSettings['ring'];
    if(!v) return;
    s.ring = v;
    qsa('[data-acc-ring]').forEach(b=>b.classList.toggle('active', b===this));
    applyAppearance(s); saveSettings(s);
  }));
  qsa('[data-acc-toggle]').forEach(inp=>inp.addEventListener('change',function(this:HTMLInputElement){
    const k = this.getAttribute('data-acc-toggle') as 'mist';
    if(!k) return;
    (s as any)[k] = this.checked;
    applyAppearance(s); saveSettings(s);
  }));
  const slider = qs<HTMLInputElement>('[data-acc-slider="glassBlur"]');
  const valEl = qs('#th-glass-val');
  slider?.addEventListener('input',function(this:HTMLInputElement){
    const v = Number(this.value);
    if(!Number.isFinite(v)) return;
    s.glassBlur = Math.max(0, Math.min(16, v));
    s.glass = s.glassBlur > 0;
    if(valEl) valEl.textContent = String(s.glassBlur);
    applyAppearance(s); saveSettings(s);
  });
  qs('.th-appearance-reset')?.addEventListener('click',()=>{
    Object.assign(s, DEFAULTS);
    applyAppearance(s); saveSettings(s);
    toastr?.success?.('换回最初的样子啦');
    const body = qs('.th-modal-body-2');
    if(body){ body.innerHTML = renderAppearancePanel(s); setTimeout(()=>bindAppearanceEvents(s), 40); }
  });
  qs('.th-appearance-done')?.addEventListener('click',()=>{ closeModal2(); });
}
