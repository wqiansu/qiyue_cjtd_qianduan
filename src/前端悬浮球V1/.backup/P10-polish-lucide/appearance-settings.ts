// 外观设置面板(P7)。
// 8 项外观自定义 + data 属性重绑 + localStorage 持久化 + 平滑过渡。
// 默认值 = 维持现状(糖果粉主题/标准字号/标准密度/标准动效/玻璃开/流光开/光环呼吸/标准圆角)。
// 实现:给 wrapper 加 data-accent/data-density/data-motion/data-glass/data-mist/data-ring/data-radius/data-fontsize
//      属性,CSS 用属性选择器重绑变量;换值时 wrapper 已有 transition 平滑过渡。
// ================================================================
import { esc, qs, qsa, gw } from '../lib/dom-utils';
import { openModal2, closeModal2 } from '../status-bar-init';

const LS_KEY = '_th_appearance_v1';

// 强调色调色板(糖果系,只换 --pink 系,不引入 dark)
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
  fontScale: 's'|'m'|'l';       // 字号 小/标准/大
  density: 'compact'|'normal'|'loose'; // 卡片密度
  motion: 'off'|'light'|'normal'|'strong'; // 动效强度
  glass: boolean;               // 玻璃模糊
  mist: boolean;                // 背景流光薄雾
  ring: 'breath'|'static';      // 头像光环
  radius: 'soft'|'normal'|'sharp'; // 圆角风格
}

// 默认值 = 维持现状(P7 前的 CSS 原值)
const DEFAULTS: AppearanceSettings = {
  accent:'pink', fontScale:'m', density:'normal', motion:'normal',
  glass:true, mist:true, ring:'breath', radius:'normal',
};

// 字号 → 根 font-size(px)
const FONT_SIZE: Record<AppearanceSettings['fontScale'],string> = { s:'15px', m:'17px', l:'19px' };
// 圆角风格 → --r/--rs/--rx(柔=更大,利=更小)
const RADIUS: Record<AppearanceSettings['radius'],{r:string;rs:string;rx:string;rl:string}> = {
  soft:  { r:'26px', rs:'18px', rx:'14px', rl:'30px' },
  normal:{ r:'20px', rs:'14px', rx:'10px', rl:'24px' },
  sharp: { r:'12px', rs:'9px',  rx:'6px',  rl:'16px' },
};
// 密度 → 卡片 padding/gap
const DENSITY: Record<AppearanceSettings['density'],string> = {
  compact:'6px 10px', normal:'8px 12px', loose:'12px 16px',
};
const DENSITY_GAP: Record<AppearanceSettings['density'],string> = {
  compact:'6px', normal:'8px', loose:'12px',
};
// 动效强度 → 时长缩放
const MOTION_DUR: Record<AppearanceSettings['motion'],string> = {
  off:'0s', light:'0.12s', normal:'0.22s', strong:'0.38s',
};
const MOTION_ENV_DUR: Record<AppearanceSettings['motion'],string> = {
  off:'0s', light:'30s', normal:'20s', strong:'12s',
};

// ---- 持久化 ----
function loadSettings(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw);
    return { ...DEFAULTS, ...p };
  } catch(e){ void e; return { ...DEFAULTS }; }
}
function saveSettings(s: AppearanceSettings): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch(e){ void e; }
}

// ---- 应用到 wrapper ----
// 给 wrapper 设置 data-* 属性 + inline CSS 变量,CSS 属性选择器据此重绑。
export function applyAppearance(s: AppearanceSettings): void {
  const w = gw();
  if(!w) return;
  w.setAttribute('data-accent', s.accent);
  w.setAttribute('data-fontscale', s.fontScale);
  w.setAttribute('data-density', s.density);
  w.setAttribute('data-motion', s.motion);
  w.setAttribute('data-glass', s.glass?'on':'off');
  w.setAttribute('data-mist', s.mist?'on':'off');
  w.setAttribute('data-ring', s.ring);
  w.setAttribute('data-radius', s.radius);
  // inline 变量(覆盖 :root 默认)
  const accent = ACCENTS[s.accent] || ACCENTS.pink;
  const radius = RADIUS[s.radius] || RADIUS.normal;
  const vars: Record<string,string> = {
    ...accent.vars,
    '--r': radius.r, '--rs': radius.rs, '--rx': radius.rx, '--rl': radius.rl,
    '--card-pad': DENSITY[s.density] || DENSITY.normal,
    '--card-gap': DENSITY_GAP[s.density] || DENSITY_GAP.normal,
    '--ui-dur': MOTION_DUR[s.motion] || MOTION_DUR.normal,
    '--env-dur': MOTION_ENV_DUR[s.motion] || MOTION_ENV_DUR.normal,
  };
  for(const [k,v] of Object.entries(vars)) w.style.setProperty(k, v);
  w.style.fontSize = FONT_SIZE[s.fontScale] || FONT_SIZE.m;
}

// 启动时调用一次(由 setupStatusBar 调)
export function initAppearance(): void {
  applyAppearance(loadSettings());
}

// ---- 面板 ----
export function openAppearanceSettings(): void {
  const s = loadSettings();
  const h = renderAppearancePanel(s);
  openModal2(`<i class="fa-solid fa-palette"></i> 外观设置`, h, { maxWidth:'min(560px,94vw)' });
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
      <div class="th-appearance-label"><i class="fa-solid fa-text-height"></i> 字号</div>
      <div class="th-appearance-seg">
        ${segBtn('fontscale','s','小',s.fontScale==='s')}
        ${segBtn('fontscale','m','标准',s.fontScale==='m')}
        ${segBtn('fontscale','l','大',s.fontScale==='l')}
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
      <div class="th-appearance-label"><i class="fa-solid fa-bolt"></i> 动效强度</div>
      <div class="th-appearance-seg th-appearance-seg-4">
        ${segBtn('motion','off','关',s.motion==='off')}
        ${segBtn('motion','light','轻',s.motion==='light')}
        ${segBtn('motion','normal','标准',s.motion==='normal')}
        ${segBtn('motion','strong','强',s.motion==='strong')}
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

    <div class="th-appearance-group th-appearance-toggles">
      ${toggleRow('glass','玻璃模糊',s.glass,'fa-regular fa-snowflake')}
      ${toggleRow('mist','背景流光薄雾',s.mist,'fa-solid fa-wind')}
      <div class="th-appearance-toggle-row">
        <span class="th-appearance-toggle-text"><i class="fa-solid fa-ring"></i> 头像光环</span>
        <div class="th-appearance-seg th-appearance-seg-mini">
          ${segBtn('ring','breath','呼吸',s.ring==='breath')}
          ${segBtn('ring','static','静态',s.ring==='static')}
        </div>
      </div>
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
  // 强调色
  qsa('[data-acc-set]').forEach(btn=>btn.addEventListener('click',function(this:HTMLElement){
    const k = this.getAttribute('data-acc-set') as AccentKey;
    if(!k || !ACCENTS[k]) return;
    s.accent = k;
    qsa('[data-acc-set]').forEach(b=>b.classList.toggle('active', b===this));
    applyAppearance(s); saveSettings(s);
  }));
  // 分段按钮组(fontscale/density/motion/radius)
  const segGroups: [keyof AppearanceSettings, string][] = [
    ['fontScale','fontscale'], ['density','density'], ['motion','motion'], ['radius','radius'],
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
  // 头像光环(也是分段,attr=ring)
  qsa('[data-acc-ring]').forEach(btn=>btn.addEventListener('click',function(this:HTMLElement){
    const v = this.getAttribute('data-acc-ring') as AppearanceSettings['ring'];
    if(!v) return;
    s.ring = v;
    qsa('[data-acc-ring]').forEach(b=>b.classList.toggle('active', b===this));
    applyAppearance(s); saveSettings(s);
  }));
  // 开关(glass/mist)
  qsa('[data-acc-toggle]').forEach(inp=>inp.addEventListener('change',function(this:HTMLInputElement){
    const k = this.getAttribute('data-acc-toggle') as 'glass'|'mist';
    if(!k) return;
    s[k] = this.checked;
    applyAppearance(s); saveSettings(s);
  }));
  // 恢复默认
  qs('.th-appearance-reset')?.addEventListener('click',()=>{
    Object.assign(s, DEFAULTS);
    applyAppearance(s); saveSettings(s);
    // 重渲染面板以同步所有控件态
    const body = qs('.th-modal-body-2');
    if(body){ body.innerHTML = renderAppearancePanel(s); setTimeout(()=>bindAppearanceEvents(s), 40); }
  });
  // 完成
  qs('.th-appearance-done')?.addEventListener('click',()=>{ closeModal2(); });
}
