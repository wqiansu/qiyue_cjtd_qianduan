// 匿名、抽象、玩梗、短平快的乐子社区（与 B站视频/糖心直播/微博资讯错开）。
// 多模态铁律（对齐 xmly「用文字表现声音」）：图片/视频/表情包一律用 imageDesc 中文画面描述 + 文字表现，不接文生图。
import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

// ==================== 类型 ====================
export type ZuiCommentPersona = '杠精' | '纯良' | '老抽象' | '潜水党' | '梗小鬼' | '和事佬' | '显眼包' | '';
// 神评（盖楼接龙一层用 replies）
export type ZuiComment = {
  id: string;
  alias: string;              // 马甲昵称
  authorRef?: string;         // 可选关联联系人
  personaTag?: ZuiCommentPersona; // 隐性人设（杠精/纯良/老抽象/潜水党等）
  body: string;
  likes: number;
  isGod?: boolean;            // 封神神评（顶置高亮）
  fishing?: boolean;          // 钓鱼评论（一本正经带节奏）
  homophone?: boolean;        // 谐音/空耳/藏头梗
  stance?: string;            // 对线立场（正方/反方/中立/乐子人）
  floor?: number;             // 楼层号（盖楼接龙）
  replies?: ZuiComment[];     // 盖楼接龙（一层）
  createdTs: number;
  isAi?: boolean;
};
export type ZuiPostKind = 'text' | 'image' | 'video' | 'emoji' | 'comic' | 'story';
// 帖子（一条「右」）
export type ZuiPost = {
  id: string;
  kind: ZuiPostKind;          // 段子/沙雕图/沙雕视频/表情包/灵魂画手/段子接力
  title?: string;
  body: string;               // 正文（段子文字 / 表情包配字 / 接龙累积）
  channel: string;            // 频道(=分类)
  authorAlias: string;        // 作者马甲
  authorId?: string;          // 可选关联联系人
  imageDesc?: string;         // 画面描述（image/video/comic/emoji：用文字表现多模态，对齐 coverDesc）
  videoScript?: string;       // 沙雕视频一句脚本（视频里发生了啥）
  likes: number;
  isHot?: boolean;
  isEssence?: boolean;        // 精华帖
  comments: ZuiComment[];     // 神评区
  createdTs: number;
  isAi?: boolean;
};
// PLACEHOLDER_ZUI_TYPES
export type ZuiMeme = {         // 每日热梗 / 梗百科词条
  id: string;
  term: string;               // 梗
  meaning: string;            // 啥意思
  heat: number;               // 热度
  ts: number;
  isAi?: boolean;
};
export type ZuiUser = {         // 我（乐子人）
  sagaoValue: number;         // 沙雕值（成长值，对标 xmly exp）
  level: number;              // 等级
  badges: string[];           // 徽章（日榜神评/钓鱼执照/接龙祖师）
  persona: string;            // 抽象人格画像（AI 生成：毒舌党/纯爱战神/考古人/表情包仓鼠）
  savedEmojis: { id: string; imageDesc: string; body: string; ts: number }[]; // 收藏表情包
  highlights: { id: string; body: string; likes: number; postTitle?: string; ts: number }[]; // 我的名场面（被顶爆的神评）
  happyToday: number;         // 今日快乐进度（刷够 N 条弹「今日快乐已充值」）
  happyDate: string;          // 今日日期串（跨天清零）
  browsed: number;            // 累计围观数（喂给抽象人格画像）
};
// PLACEHOLDER_ZUI_TYPES_2
// ==================== 设置（对齐全 app 横切）====================
export type ZuiSettings = {
  useFloors: boolean; floorCount: number;
  useWorldbook: boolean; worldbookEntryKeys: string[];
  // 生态浓度（0-200 五档，读设置不写死；色情/肉欲作用全 app 全频道）
  ecoActivity: number;   // 活跃度（上帖/评论热闹度）
  ecoQuality: number;    // 真实度（低=清一色捧场，高=有踩有对线）
  ecoYinyang: number;    // 阴阳怪气度（专属：反讽/夹枪带棒浓度）
  ecoMeme: number;       // 玩梗密度（黑话/热梗/谐音梗堆叠浓度）
  ecoToxic: number;      // 塌房吃瓜/网暴烈度阀（默认低，锁虚构娱乐幸福的烦恼级）
  ecoErotic: number;     // 色情度（擦边梗露骨程度，作用全 app）
  ecoCarnal: number;     // 肉欲度（肉欲擦边表现，作用全 app）
  // 玩法
  godDensity: number;    // 神评密度 1-5（每帖大约配几条神评/封几条神）
  allowFishing: boolean; // 允许钓鱼楼
  allowStack: boolean;   // 允许盖楼接龙
  nightChannel: boolean; // 深夜区（按世界时间/本地判断出现）
  happyGoal: number;     // 今日快乐进度阈值（刷够几条弹「今日快乐已充值」）
  // 联动
  shareToWechat: boolean;
  // 记忆 / 同步 / 自动
  memoryEnabled: boolean; syncEnabled: boolean; autoInterval: number; lastFloor: number;
  // 外观
  theme: string; font: string;
  // 分类管理
  customCats: { name: string }[];
  catPrompts: Record<string, string>;
};
export const DEFAULT_ZUI_SETTINGS: ZuiSettings = {
  useFloors: true, floorCount: 6,
  useWorldbook: true, worldbookEntryKeys: [],
  ecoActivity: 70, ecoQuality: 55, ecoYinyang: 60, ecoMeme: 80, ecoToxic: 25, ecoErotic: 40, ecoCarnal: 40,
  godDensity: 3, allowFishing: true, allowStack: true, nightChannel: true, happyGoal: 10,
  shareToWechat: true,
  memoryEnabled: true, syncEnabled: false, autoInterval: 0, lastFloor: 0,
  theme: 'yellow', font: 'system',
  customCats: [], catPrompts: {},
};

// 频道（中列 catstrip + 生成分布，可绑世界书做设定来源）
export const ZUI_CATS: { name: string; icon: string; night?: boolean; adult?: boolean }[] = [
  { name: '神回复', icon: 'fa-comment-dots' },
  { name: '沙雕日常', icon: 'fa-face-smile' },
  { name: '抽象话', icon: 'fa-bolt' },
  { name: '段子接龙', icon: 'fa-reply' },
  { name: '表情包', icon: 'fa-image' },
  { name: '钓鱼楼', icon: 'fa-fish' },
  { name: '鉴抽象', icon: 'fa-magnifying-glass' },
  { name: 'emo树洞', icon: 'fa-heart-pulse' },
  { name: 'CP嗑糖', icon: 'fa-heart' },
  { name: '地域玩梗', icon: 'fa-earth-asia' },
  { name: '深夜区', icon: 'fa-moon', night: true },
  { name: '名场面', icon: 'fa-crown' },
];

// 热榜类型（接万花镜打榜语义）
export const ZUI_RANK_KINDS: { id: string; title: string; icon: string }[] = [
  { id: 'hot', title: '沙雕热榜', icon: 'fa-fire-flame-curved' },
  { id: 'god', title: '神评榜', icon: 'fa-crown' },
  { id: 'meme', title: '玩梗榜', icon: 'fa-bolt' },
  { id: 'sagao', title: '显眼包榜', icon: 'fa-ranking-star' },
];

// PLACEHOLDER_ZUI_CAT_PROMPTS
// 各频道默认引导提示词（一句话导演式指引：这个频道产出什么调性的帖子+神评）。
// 铁律：图片/视频/表情包用中文画面描述表现，不写画面外的机制黑话。
export const ZUI_DEFAULT_CAT_PROMPTS: Record<string, string> = {
  '神回复': '【神回复】母题：帖子本身平平无奇甚至有点无聊，灵魂全在评论区——一条封神神评把楼给盘活了，一本正经地歪楼、神转折、以毒攻毒。产出重点在神评：要有那种「就这一句封神」的爆梗，其余评论围着神评起哄接梗。帖子给个平淡的引子即可。',
  '沙雕日常': '【沙雕日常】母题：分享生活里那些又蠢又好笑的翻车瞬间——手滑、乌龙、社死、和家里毛孩子斗智斗勇。轻松无害，笑点在真实又离谱。配沙雕图（用画面描述表现）更佳。神评区都是「哈哈哈哈哈」的乐子人和补刀高手。',
  '抽象话': '【抽象话】母题：抽象文化重灾区——不好好说话、火星文、抽象黑话、逻辑鬼才、答非所问的行为艺术。越抽象越好笑，追求「看不懂但大受震撼」。神评比正文更抽象，互相用抽象话对暗号。',
  '段子接龙': '【段子接龙】母题：一个开头，全楼接力续写，越接越离谱、越接越好笑，把一个正经开头带进沟里。正文是接龙引子（一句悬念开头），神评区就是一条条接下去的续写，每条自然衔接上一条并抖个新包袱。',
  '表情包': '【表情包】母题：斗图现场——沙雕表情包、魔性配字、经典梗图二创。每帖是一张表情包：用中文画面描述把这张图长什么样说清楚（谁/什么表情/什么动作），配一句点睛配字放正文。神评区都在斗图接梗、求原图、「这个我保存了」。',
  '钓鱼楼': '【钓鱼楼】母题：一本正经地带节奏、抛出似是而非的观点或假消息，看谁上钩、谁拆穿。正文是钓鱼引子，神评区一半人认真上钩、一半人识破在下面看戏拆台，钓鱼者假装无辜。这是「钓鱼评论」的主场，多标 fishing。',
  '鉴抽象': '【鉴抽象】母题：把外面看到的抽象言行搬进来品鉴、考古、颁奖——「今日最佳抽象」「建议直接进博物馆」。正文是被鉴定的抽象素材转述，神评区是一群鉴抽象专家一本正经地点评打分。',
  'emo树洞': '【emo树洞】母题：深夜情绪树洞——分享一点丧、一点脆弱、一点无人诉说的心事，但底色仍是温柔的乐子人互相取暖。正文走心不卖惨，神评区有人共鸣、有人用笑话轻轻接住、有人递纸巾。氛围克制而温暖。',
  'CP嗑糖': '【CP嗑糖】母题：磕糖现场——分享甜到齁的名场面、发糖细节、脑补小剧场，全员上头。全女性百合向为主。正文是一段糖，神评区都是嗑到升天、催更、脑补后续的糖分中毒选手。甜度暧昧程度跟色情/肉欲阀走。',
  '地域玩梗': '【地域玩梗】母题：南北差异、方言梗、家乡特色的善意自嘲与互相调侃——「你们那也这样吗」。轻松无地图炮恶意，只玩善意的地域刻板笑点。神评区各地网友现身说法接梗、认领。',
  '深夜区': '【深夜区】母题：深夜才敢发的抽象——白天正经人、深夜乐子人，脑子放飞的凌晨产物、越夜越沙雕的胡言乱语。氛围更放飞、更抽象、更暧昧。擦边梗露骨程度跟色情/肉欲阀走，全女百合虚构娱乐。',
  '名场面': '【名场面】母题：封神现场存档——把全站被顶爆的神评、名场面帖子、经典对线做成「名人堂」陈列，配一句颁奖词。正文是名场面转述，神评区都在朝圣、玩「考古成功」、二次封神。',
};
export function defaultZuiCatTemplate(name: string): string {
  return ZUI_DEFAULT_CAT_PROMPTS[name] || `【${name}】母题：围绕「${name}」产出符合抽象搞笑社区调性的短帖+神评（有梗、乐子人语感、神评封神）。图片视频用中文画面描述表现。有设定资料时据此取材。`;
}
// PLACEHOLDER_ZUI_CAT_PROMPTS_2
// PLACEHOLDER_ZUI_DATA_LAYER
// ==================== 数据存取 ====================
type ZuiData = {
  posts: ZuiPost[];
  memes: ZuiMeme[];
  ranks: { id: string; title: string; entries: { name: string; reason: string; postId?: string }[]; note?: string; ts: number }[];
  user: ZuiUser;
  settings: ZuiSettings;
};
function rid(p: string): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }
const ALIAS_ADJ = ['摸鱼的', '划水的', '暴躁的', '快乐的', '沉默的', '抽象的', '显眼的', '端水的', '躺平的', '发癫的'];
const ALIAS_NOUN = ['乐子人', '土豆', '柠檬精', '打工魂', '仓鼠', '咸鱼', '柴犬', '小丑', '菩萨', '梗小鬼'];
function randomAlias(): string { return ALIAS_ADJ[Math.floor(Math.random() * ALIAS_ADJ.length)] + ALIAS_NOUN[Math.floor(Math.random() * ALIAS_NOUN.length)]; }
function blankUser(): ZuiUser {
  return { sagaoValue: 0, level: 1, badges: [], persona: '', savedEmojis: [], highlights: [], happyToday: 0, happyDate: '', browsed: 0 };
}
function blank(): ZuiData {
  return { posts: [], memes: [], ranks: [], user: blankUser(), settings: { ...DEFAULT_ZUI_SETTINGS } };
}
function read(): ZuiData {
  const d = readWorldJson<ZuiData>(WORLD_LS_KEYS.zui, blank());
  if (!d || typeof d !== 'object') return blank();
  d.posts ||= []; d.memes ||= []; d.ranks ||= [];
  d.user = { ...blankUser(), ...(d.user || {}) };
  d.settings = { ...DEFAULT_ZUI_SETTINGS, ...(d.settings || {}) };
  d.settings.catPrompts = { ...ZUI_DEFAULT_CAT_PROMPTS, ...(d.settings.catPrompts || {}) };
  return d;
}
function write(d: ZuiData): void { writeWorldJson(WORLD_LS_KEYS.zui, d); }

// ---- 设置 ----
export function getZuiSettings(): ZuiSettings { return read().settings; }
export function updateZuiSettings(patch: Partial<ZuiSettings>): ZuiSettings { const d = read(); d.settings = { ...d.settings, ...patch }; write(d); return d.settings; }

// ---- 频道管理 ----
export function getCategories(): { name: string; icon: string; night?: boolean; adult?: boolean }[] {
  const s = read().settings;
  let base = ZUI_CATS.slice();
  if (!s.nightChannel) base = base.filter(c => !c.night);   // 深夜区开关
  const custom = s.customCats.map(c => ({ name: c.name, icon: 'fa-hashtag' }));
  return [...base, ...custom];
}
export function isNightCat(name: string): boolean { return !!ZUI_CATS.find(c => c.name === name)?.night; }
export function addCustomCat(name: string): void {
  const d = read(); const nm = name.trim(); if (!nm) return;
  if (d.settings.customCats.some(c => c.name === nm) || ZUI_CATS.some(c => c.name === nm)) return;
  d.settings.customCats.push({ name: nm });
  if (!d.settings.catPrompts[nm]) d.settings.catPrompts[nm] = defaultZuiCatTemplate(nm);
  write(d);
}
export function deleteCustomCat(name: string): void {
  const d = read(); d.settings.customCats = d.settings.customCats.filter(c => c.name !== name);
  delete d.settings.catPrompts[name]; write(d);
}
export function getCatPrompt(name: string): string { return read().settings.catPrompts[name] || ''; }
export function setCatPrompt(name: string, text: string): void { const d = read(); if (text.trim()) d.settings.catPrompts[name] = text; else delete d.settings.catPrompts[name]; write(d); }

// PLACEHOLDER_ZUI_DATA_LAYER_2
// ---- 帖子 ----
// 排序：热帖>精华>时间倒序（挖坟按需另取）
export function getPosts(channel?: string): ZuiPost[] {
  let list = read().posts.slice().sort((a, b) => (b.isHot ? 1 : 0) - (a.isHot ? 1 : 0) || (b.isEssence ? 1 : 0) - (a.isEssence ? 1 : 0) || b.createdTs - a.createdTs);
  if (channel) list = list.filter(p => p.channel === channel);
  return list;
}
// 挖坟：按时间正序（最老在前），用于「考古现场」
export function getOldestPosts(n = 20): ZuiPost[] {
  return read().posts.slice().sort((a, b) => a.createdTs - b.createdTs).slice(0, n);
}
export function getPost(id: string): ZuiPost | undefined { return read().posts.find(p => p.id === id); }
export function randomPost(): ZuiPost | undefined { const ps = read().posts; return ps.length ? ps[Math.floor(Math.random() * ps.length)] : undefined; }
function normComment(x: Partial<ZuiComment>, floor: number): ZuiComment {
  return {
    id: x.id || rid('cm'), alias: x.alias || randomAlias(), authorRef: x.authorRef,
    personaTag: (x.personaTag as ZuiCommentPersona) || '', body: x.body || '',
    likes: typeof x.likes === 'number' ? x.likes : Math.floor(Math.random() * 400),
    isGod: x.isGod, fishing: x.fishing, homophone: x.homophone, stance: x.stance,
    floor, replies: Array.isArray(x.replies) ? x.replies.map((r, i) => normComment(r, i + 1)) : [],
    createdTs: x.createdTs || (Date.now() - Math.floor(Math.random() * 86400000 * 5)), isAi: x.isAi,
  };
}
export function addPosts(list: Partial<ZuiPost>[], channel: string, opts?: { isAi?: boolean }): ZuiPost[] {
  const d = read(); const added: ZuiPost[] = [];
  for (const p of list) {
    const cms = Array.isArray(p.comments) ? p.comments.map((c, i) => normComment(c, i + 1)) : [];
    const post: ZuiPost = {
      id: p.id || rid('rt'), kind: (['text', 'image', 'video', 'emoji', 'comic', 'story'].includes(p.kind as string) ? p.kind : 'text') as ZuiPostKind,
      title: p.title, body: p.body || '', channel: p.channel || channel,
      authorAlias: p.authorAlias || randomAlias(), authorId: p.authorId,
      imageDesc: p.imageDesc, videoScript: p.videoScript,
      likes: typeof p.likes === 'number' ? p.likes : Math.floor(Math.random() * 5000),
      isHot: p.isHot, isEssence: p.isEssence, comments: cms,
      createdTs: p.createdTs || (Date.now() - Math.floor(Math.random() * 86400000 * 7)),
      isAi: opts?.isAi ?? p.isAi,
    };
    d.posts.unshift(post); added.push(post);
  }
  if (d.posts.length > 300) d.posts = d.posts.slice(0, 300);
  write(d); return added;
}
export function updatePost(id: string, patch: Partial<ZuiPost>): void { const d = read(); const p = d.posts.find(x => x.id === id); if (p) { Object.assign(p, patch); write(d); } }
export function likePost(id: string): void { const d = read(); const p = d.posts.find(x => x.id === id); if (p) { p.likes += 1; write(d); } }
export function deletePost(id: string): void { const d = read(); d.posts = d.posts.filter(p => p.id !== id); write(d); }
// 覆盖刷新：清 AI 铺的路人帖（保留精华/玩家自己发的/关联角色的）。返回清掉数。
export function clearAiPosts(channel?: string): number {
  const d = read(); const before = d.posts.length;
  const keep = (p: ZuiPost) => !p.isAi || p.isEssence || p.authorAlias === '我' || p.authorId;
  d.posts = d.posts.filter(p => keep(p) || (channel && p.channel !== channel));
  write(d); return before - d.posts.length;
}

// ---- 神评 ----
export function addComments(postId: string, list: Partial<ZuiComment>[]): ZuiComment[] {
  const d = read(); const p = d.posts.find(x => x.id === postId); if (!p) return [];
  const base = p.comments.length; const added: ZuiComment[] = [];
  for (let i = 0; i < list.length; i++) { const cm = normComment(list[i], base + i + 1); p.comments.push(cm); added.push(cm); }
  write(d); return added;
}
export function likeComment(postId: string, commentId: string): void {
  const d = read(); const p = d.posts.find(x => x.id === postId); if (!p) return;
  const c = findComment(p.comments, commentId); if (c) { c.likes += 1; write(d); }
}
export function deleteComment(postId: string, commentId: string): void {
  const d = read(); const p = d.posts.find(x => x.id === postId); if (!p) return;
  // 递归删除任意层级的神评/楼中楼。
  const prune = (list: ZuiComment[]): ZuiComment[] => {
    return list.filter(c => c.id !== commentId).map(c => {
      if (c.replies && c.replies.length) c.replies = prune(c.replies);
      return c;
    });
  };
  p.comments = prune(p.comments);
  write(d);
}
// 顶置封神：把某条神评标记为神评
export function toggleGod(postId: string, commentId: string): boolean {
  const d = read(); const p = d.posts.find(x => x.id === postId); if (!p) return false;
  const c = findComment(p.comments, commentId); if (!c) return false;
  c.isGod = !c.isGod; write(d); return !!c.isGod;
}
// 盖楼接龙：给某条神评（任意层级）接一楼。用 findComment 递归定位，支持楼中楼多层盖楼。
export function addReply(postId: string, commentId: string, reply: Partial<ZuiComment>): ZuiComment | undefined {
  const d = read(); const p = d.posts.find(x => x.id === postId); if (!p) return undefined;
  const c = findComment(p.comments, commentId); if (!c) return undefined;
  c.replies ||= []; const floor = c.replies.length + 1;
  const r = normComment(reply, floor); c.replies.push(r); write(d); return r;
}
// 递归查找任意层级的神评/楼中楼。
function findComment(list: ZuiComment[], id: string): ZuiComment | undefined {
  for (const c of list) {
    if (c.id === id) return c;
    if (c.replies && c.replies.length) { const f = findComment(c.replies, id); if (f) return f; }
  }
  return undefined;
}
export function clearAiComments(postId: string): number {
  const d = read(); const p = d.posts.find(x => x.id === postId); if (!p) return 0;
  const before = p.comments.length;
  p.comments = p.comments.filter(c => !c.isAi || c.alias === '我' || c.isGod);
  write(d); return before - p.comments.length;
}
// PLACEHOLDER_ZUI_DATA_LAYER_3
// ---- 每日热梗 / 梗百科 ----
export function getMemes(): ZuiMeme[] { return read().memes.slice().sort((a, b) => b.heat - a.heat); }
export function getMeme(term: string): ZuiMeme | undefined { return read().memes.find(m => m.term === term); }
export function addMemes(list: Partial<ZuiMeme>[], opts?: { isAi?: boolean }): ZuiMeme[] {
  const d = read(); const added: ZuiMeme[] = [];
  for (const m of list) {
    if (!m.term) continue;
    const existing = d.memes.find(x => x.term === m.term);
    if (existing) { existing.meaning = m.meaning || existing.meaning; existing.heat = typeof m.heat === 'number' ? m.heat : existing.heat; continue; }
    const meme: ZuiMeme = { id: m.id || rid('mm'), term: m.term, meaning: m.meaning || '', heat: typeof m.heat === 'number' ? m.heat : Math.floor(Math.random() * 9000), ts: Date.now(), isAi: opts?.isAi ?? m.isAi };
    d.memes.unshift(meme); added.push(meme);
  }
  if (d.memes.length > 60) d.memes = d.memes.slice(0, 60);
  write(d); return added;
}
export function deleteMeme(id: string): void { const d = read(); d.memes = d.memes.filter(m => m.id !== id); write(d); }
export function clearAiMemes(): number { const d = read(); const before = d.memes.length; d.memes = d.memes.filter(m => !m.isAi); write(d); return before - d.memes.length; }

// ---- 热榜 ----
export function getRanks(): ZuiData['ranks'] { return read().ranks.slice().sort((a, b) => b.ts - a.ts); }
export function getRank(id: string): ZuiData['ranks'][number] | undefined { return read().ranks.find(r => r.id === id); }
export function upsertRank(id: string, title: string, entries: { name: string; reason: string; postId?: string }[], note?: string): void {
  const d = read();
  d.ranks = [{ id, title, entries, note, ts: Date.now() }, ...d.ranks.filter(r => r.id !== id)];
  write(d);
}

// ---- 我（乐子人）成长 ----
export function getUser(): ZuiUser { return read().user; }
export const ZUI_LEVEL_TITLES = ['潜水员', '机友', '显眼包', '抽象艺术家', '本站活菩萨'];
function levelOfSagao(v: number): number { return Math.min(ZUI_LEVEL_TITLES.length, Math.max(1, Math.floor(v / 100) + 1)); }
export function levelTitle(level: number): string { return ZUI_LEVEL_TITLES[Math.min(ZUI_LEVEL_TITLES.length - 1, Math.max(0, level - 1))]; }
export function sagaoToNext(v: number): { cur: number; need: number; pct: number } {
  const lvl = levelOfSagao(v); const base = (lvl - 1) * 100; const cur = v - base; const need = 100;
  return { cur, need, pct: Math.min(100, Math.round(cur / need * 100)) };
}
// 沙雕值：发帖/被顶神评/收藏涨值
export function addSagao(n: number): { leveledUp: boolean; newBadges: string[] } {
  const d = read(); const before = d.user.level; d.user.sagaoValue += n; d.user.level = levelOfSagao(d.user.sagaoValue);
  const newBadges = refreshBadges(d); write(d);
  return { leveledUp: d.user.level > before, newBadges };
}
// 徽章
function refreshBadges(d: ZuiData): string[] {
  const have = new Set(d.user.badges); const add: string[] = [];
  const give = (b: string) => { if (!have.has(b)) { have.add(b); add.push(b); } };
  const myPosts = d.posts.filter(p => p.authorAlias === '我').length;
  if (myPosts >= 1) give('首发选手');
  if (d.user.highlights.length >= 1) give('日榜神评');
  if (d.user.highlights.some(h => h.likes >= 500)) give('封神选手');
  if (d.user.savedEmojis.length >= 5) give('表情包仓鼠');
  if (d.user.browsed >= 50) give('资深乐子人');
  // 有钓鱼/接龙类互动可解相应徽章（由调用点通过 markBadge 补）
  d.user.badges = Array.from(have); return add;
}
// 手动授予徽章（钓鱼执照/接龙祖师，由 UI 在对应互动时调用）
export function grantBadge(b: string): boolean { const d = read(); if (d.user.badges.includes(b)) return false; d.user.badges.push(b); write(d); return true; }
// 抽象人格画像
export function setPersona(text: string): void { const d = read(); d.user.persona = (text || '').trim(); write(d); }
// 我的名场面
export function addHighlight(body: string, likes: number, postTitle?: string): void {
  const d = read();
  d.user.highlights = [{ id: rid('hl'), body: (body || '').trim(), likes, postTitle, ts: Date.now() }, ...d.user.highlights].slice(0, 40);
  refreshBadges(d); write(d);
}
export function removeHighlight(id: string): void { const d = read(); d.user.highlights = d.user.highlights.filter(h => h.id !== id); write(d); }
// 收藏表情包进表情库
export function saveEmoji(imageDesc: string, body: string): void {
  const d = read();
  d.user.savedEmojis = [{ id: rid('em'), imageDesc: (imageDesc || '').trim(), body: (body || '').trim(), ts: Date.now() }, ...d.user.savedEmojis].slice(0, 100);
  refreshBadges(d); write(d);
}
export function removeEmoji(id: string): void { const d = read(); d.user.savedEmojis = d.user.savedEmojis.filter(e => e.id !== id); write(d); }
// 今日快乐进度：围观一条 +1，返回是否刚好达标
export function bumpHappy(): { count: number; goal: number; justHit: boolean } {
  const d = read(); const today = new Date().toDateString();
  if (d.user.happyDate !== today) { d.user.happyDate = today; d.user.happyToday = 0; }
  const before = d.user.happyToday; d.user.happyToday += 1; d.user.browsed += 1;
  const goal = d.settings.happyGoal || 10;
  const justHit = before < goal && d.user.happyToday >= goal;
  refreshBadges(d); write(d);
  return { count: d.user.happyToday, goal, justHit };
}

export function clearAll(): void { const d = read(); write({ ...blank(), user: d.user, settings: d.settings }); }
export function clearAllData(): void { write(blank()); }

