// 纯音频世界（与糖心视觉直播、B站视频错开）：玩家是听众，不开台不录有声书。
// 核心差异化＝常驻底部播放条：播放态存 XmPlayer store，切 tab/切专辑不中断。
import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

// ==================== 类型 ====================
export type XmEpisode = {
  id: string;
  no: number;               // 集号（追更连载感）
  title: string;            // 单集标题
  durationSec: number;      // 时长（秒）
  synopsis?: string;        // 一句梗概（听感/剧情钩子）
  hot?: boolean;            // 热门单集
  playedSec?: number;       // 已听进度（秒）
  coverDesc?: string;       // 可选单集情境画面描述（点缀，主体仍是声音）
  content?: string;         // 本集「播讲正文」——酒馆环境下用文字表现的实际音频内容（可 AI 无限续写累积）
  contentComplete?: boolean;// 正文是否已讲完（false=还能继续续写下去）
};
export type XmAlbum = {
  id: string;
  title: string;            // 专辑/节目名
  host: string;             // 主播/播音
  hostRef?: string;         // 关联联系人
  cat: string;              // 分类
  voiceTone?: string;       // 声音标签（治愈系/沙哑系/清冷/软糯/国风等，声控向卖点）
  coverDesc?: string;       // 封面画面中文描述（唯一的画面例外）
  intro?: string;           // 简介
  episodes: XmEpisode[];    // 单集列表
  plays: number;            // 播放量
  subs: number;             // 订阅数
  updatedEp?: number;       // 更新至第几集
  finished?: boolean;       // 已完结
  live?: boolean;           // 直播中（关联直播电台）
  isAdult?: boolean;        // 成人专区（夜谈/双修引导），吃全局阀
  collected?: boolean;      // 我收藏
  subscribed?: boolean;     // 我追更
  isAi?: boolean;
  ts: number;
};
export type XmComment = {   // 声控向弹幕/评论
  id: string; albumId: string; epId?: string;
  author: string; authorRef?: string;
  content: string; likes: number;
  isDanmu?: boolean;        // true=飘过弹幕 / false=评论区
  isAi?: boolean; ts: number;
};
export type XmLiveMsg = {   // 直播电台间互动
  id: string;
  kind: 'danmu' | 'host' | 'call' | 'gift' | 'song' | 'enter' | 'sys';  // 弹幕/主播口播/连麦/礼物/点歌/进场/系统
  author: string; authorRef?: string;
  content: string;
  ts: number; isAi?: boolean;
};
export type XmLiveRoom = {  // 直播电台间（纯声音）
  id: string;
  host: string; hostRef?: string;
  topic: string;            // 节目主题（深夜情感热线/点歌台/连麦夜话）
  cat: string;              // 分类
  voiceTone?: string;       // 声音标签
  listeners: number;        // 在线收听数
  nowSong?: string;         // 点歌台当前曲目
  notice?: string;          // 节目预告/场设
  followed?: boolean;       // 关注电台
  isAdult?: boolean;        // 成人向电台（夜谈），吃全局阀
  msgs: XmLiveMsg[];
  ended?: boolean;          // 已下播（可转回放）
  isAi?: boolean;
  createdAt: number; updatedAt: number;
};
export type XmHistoryEntry = { albumId: string; albumTitle: string; epId?: string; epTitle?: string; ts: number };
export type XmPlaylist = { id: string; name: string; epRefs: { albumId: string; epId: string }[]; ts: number };  // 声音歌单
export type XmUser = {
  subscriptions: string[];  // 追更 albumId
  collects: string[];       // 收藏 albumId
  history: XmHistoryEntry[]; // 播放历史时间线
  playlists: XmPlaylist[];  // 自建声音歌单（睡前歌单/运功BGM）
  listenSec: number;        // 累计收听时长（秒）
  level: number;            // 声控等级（听龄）
  exp: number;
  badges: string[];         // 收听勋章
  tasteTags: string[];      // 声音口味（治愈系/沙哑系/国风/剧情控）
  lastSleepWith?: string;   // 昨晚听着谁的声音睡着（哄睡陪听回写）
};
// 常驻底部播放条的核心播放态（存 store，切 tab 不中断）
export type XmPlayer = {
  albumId?: string;         // 当前专辑
  epId?: string;            // 当前单集
  playing: boolean;         // 播放中
  positionSec: number;      // 当前进度（秒）
  rate: number;             // 倍速（0.75/1/1.25/1.5/2）
  loop: 'none' | 'one' | 'list';  // 循环模式
  sleepTimerMin: number;    // 定时关闭（分钟，0=关）
};
// PLACEHOLDER_XM_TYPES_2

// ==================== 设置（对齐全 app 横切，对标糖心/B站）====================
export type XmSettings = {
  useFloors: boolean; floorCount: number;
  useWorldbook: boolean; worldbookEntryKeys: string[];
  // 生态浓度（0-200 五档，读设置不写死；色情/肉欲作用于全 app 全分类）
  ecoActivity: number;   // 上新/开台热闹度
  ecoQuality: number;    // 内容质量·好评真实度（低=清一色彩虹屁，高=有真实差评/弃坑）
  ecoHype: number;       // 顶流主播/榜单炒作/打赏氛围
  ecoToxic: number;      // 黑红/塌房声控瓜烈度（默认低）
  ecoErotic: number;     // 色情度（ASMR耳语/情感夜话/双修引导露骨程度，作用全 app）
  ecoCarnal: number;     // 肉欲度（声线媚态/喘息/贴耳氛围浓度，作用全 app）
  // 播放/陪伴偏好
  sleepDefaultMin: number;  // 哄睡默认定时（分钟）
  hostFlirt: number;        // 主播/连麦主动撩你频率 1-5
  // 联动
  pushOnLive: boolean;      // 关注主播开台推送（微信）
  shareToWechat: boolean;   // 允许分享节目到微信
  // 记忆 / 同步 / 自动
  memoryEnabled: boolean; syncEnabled: boolean; autoInterval: number; lastFloor?: number;   // 每 N 楼自动铺一批，lastFloor 记上次触发楼层
  // 外观
  theme: string; font: string;
  // 分类管理
  customCats: { name: string }[];
  catPrompts: Record<string, string>;
};
export const DEFAULT_XM_SETTINGS: XmSettings = {
  useFloors: true, floorCount: 6,
  useWorldbook: true, worldbookEntryKeys: [],
  ecoActivity: 60, ecoQuality: 55, ecoHype: 55, ecoToxic: 25, ecoErotic: 45, ecoCarnal: 45,
  sleepDefaultMin: 30, hostFlirt: 3,
  pushOnLive: true, shareToWechat: true,
  memoryEnabled: true, syncEnabled: false, autoInterval: 0, lastFloor: 0,
  theme: 'purple', font: 'system',
  customCats: [], catPrompts: {},
};

// 分类（中列顶栏 catstrip + 生成分布，可绑世界书做设定来源）。尽量多、尽量丰富——覆盖有声/音乐/电台/助眠/知识/成人各面。
export const XM_CATS: { name: string; icon: string; adult?: boolean }[] = [
  { name: '有声书', icon: 'fa-book-bookmark' },
  { name: '广播剧', icon: 'fa-masks-theater' },
  { name: '国风音乐', icon: 'fa-music' },
  { name: '古风戏腔', icon: 'fa-feather' },
  { name: '电台夜话', icon: 'fa-radio' },
  { name: 'ASMR助眠', icon: 'fa-ear-listen' },
  { name: '白噪陪睡', icon: 'fa-bed' },
  { name: '修真引导音', icon: 'fa-mountain-sun' },
  { name: '知识播客', icon: 'fa-podcast' },
  { name: '情感夜话', icon: 'fa-comments' },
  { name: '相声评书', icon: 'fa-microphone' },
  { name: '新闻资讯', icon: 'fa-newspaper' },
  { name: '有声漫画', icon: 'fa-book-open' },
  { name: '诗词朗诵', icon: 'fa-feather-pointed' },
  { name: '脱口秀', icon: 'fa-microphone-lines' },
  { name: '悬疑推理', icon: 'fa-magnifying-glass' },
  { name: '影视原声', icon: 'fa-clapperboard' },
  { name: '冥想正念', icon: 'fa-spa' },
  { name: '声控福利', icon: 'fa-heart' },          // 声控向擦边，吃双滑块
  { name: '夜谈私语', icon: 'fa-moon', adult: true }, // 成人专区
  { name: '双修引导', icon: 'fa-sparkles', adult: true }, // 成人专区
];

// 声音榜类型（接万花镜打榜语义）
export const XM_RANK_KINDS: { id: string; title: string; icon: string }[] = [
  { id: 'host', title: '主播人气榜', icon: 'fa-crown' },
  { id: 'rising', title: '新星榜', icon: 'fa-seedling' },
  { id: 'cry', title: '催泪榜', icon: 'fa-droplet' },
  { id: 'sleep', title: '助眠榜', icon: 'fa-moon' },
];

// PLACEHOLDER_XM_CAT_PROMPTS
// 各分类默认引导提示词（高信息密度；设定资料写「有什么声音内容」，本引导包装成「怎么生成一档可听的节目」）。
// 铁律：只写「听感」——音色/语气/配乐/音效/剧情梗概，不写视觉画面（coverDesc 例外给一句画面感）。
export const XM_DEFAULT_CAT_PROMPTS: Record<string, string> = {
  '有声书': '【有声书】节目母题：连载有声小说——言情/仙侠/校园/悬疑等题材的原著改编。主播＝播音，卖点在「声音的塑造力」：多角色一人分饰、旁白娓娓道来、情绪拿捏。单集是「第N章」的连载感，标题带章节钩子。声音标签：温润播音腔/少年音/清冷女声。听众爱催更、夸「声音自带画面」。有原著设定资料就据此取材。',
  '广播剧': '【广播剧】节目母题：多人有声剧——全阵容配音+音效+配乐，沉浸式演一段剧情。卖点是「闭眼看戏」：脚步声/开门声/雨声等音效，CV 情绪炸裂的名场面。单集＝第几期/某一幕。声音标签：CV阵容豪华/音效电影感。听众磕CP、夸「耳朵怀孕」、剪名场面。',
  '国风音乐': '【国风音乐】节目母题：国风歌单/器乐——古筝/琵琶/笛箫演奏、国风翻唱、纯音乐BGM。单集＝一首曲子或一张歌单。卖点是「听感与意境」：曲风(空灵/激昂/婉转)、适用场景(练功/品茶/入眠)。声音标签：清冷古韵/大气磅礴。听众收藏进歌单、循环、求谱。',
  '古风戏腔': '【古风戏腔】节目母题：戏腔翻唱/古风填词/念白——戏曲美学音频化，一开嗓惊艳。卖点是「戏腔的转音与气韵」。单集＝一支戏腔作品。声音标签：戏腔婉转/雌雄难辨。听众循环「这一句转音」、催更、跪求专辑。',
  '电台夜话': '【电台夜话】节目母题：主播开的常规电台节目——读信/闲聊/陪伴/点歌寄语。卖点是「声音的陪伴感」，像深夜有人陪你说话。单集＝某一期节目。声音标签：治愈系/会聊天。听众留言倾诉、点歌、把主播当树洞。',
  'ASMR助眠': '【ASMR助眠】节目母题：耳语/掏耳/敲击/咀嚼音/贴耳低语/角色扮演耳搔，走「酥麻+私密陪伴」路线。卖点是「声音的体感」：3D环绕、气音、贴耳。单集＝某个ASMR触发音主题。声音标签：气音软糯/酥麻。听众「戴耳机上头」「左耳再说一次」。露骨与肉欲严格跟色情度/肉欲度阀（低＝纯净助眠，高＝暧昧耳语），全女百合虚构表演。',
  '白噪陪睡': '【白噪陪睡】节目母题：雨声/篝火/海浪/山寺钟声/流水声等自然白噪 + 纯陪睡长音频。卖点是「无人声的纯净陪伴」与助眠功效。单集＝某个白噪场景(8小时/循环)。声音标签：自然疗愈/无人声。听众定时关闭、常年循环、当睡眠仪式。',
  '修真引导音': '【修真引导音】节目母题：引导式冥想/运功导引——「跟着我的声音，吐纳……观想灵力沿经脉运转……」，把修真设定做成能跟练的引导音频。卖点是「跟着练」的沉浸引导。单集＝某个功法/冥想主题(凝神/周天/入定)。声音标签：清冷出尘/引导感强。听众反馈「真的静下来了」「跟着运功睡着」。有功法设定资料就据此取材。',
  '知识播客': '【知识播客】节目母题：聊天式知识分享——世界百科/修真常识/历史八卦/情感成长，两三人对谈或单口。卖点是「有料又好听」。单集＝某个话题。声音标签：声音有梗/干货密集。听众「通勤下饭」「学到了」、催更某话题。',
  '情感夜话': '【情感夜话】节目母题：情感连线/树洞倾诉/深夜陪聊——孤独经济+走心陪伴，比电台夜话更聚焦情感私密话题。卖点是「深夜卸下防备的共鸣」。单集＝某个情感主题(暗恋/失恋/和解)。声音标签：温柔走心/共情力强。听众深夜emo倾诉、被治愈、感谢陪伴。氛围私密而克制，露骨与暧昧浓度跟色情度阀走。',
  '相声评书': '【相声评书】节目母题：传统曲艺——评书连播(话本连载)、相声段子、贯口。卖点是「说学逗唱的语言魅力」与包袱节奏。单集＝一回书/一段相声。声音标签：字正腔圆/包袱脆。听众「过瘾」「这个包袱绝」、追更下一回。',
  '新闻资讯': '【新闻资讯】节目母题：新闻早晚报/资讯速览——播报体，接当下时事。卖点是「听着了解世界发生了什么」。单集＝某期早报/晚报。声音标签：播报专业/条理清。可取当下大事作素材。听众通勤听、当背景音。',
  '有声漫画': '【有声漫画】节目母题：漫画/条漫的有声化演绎——分格旁白+角色配音+拟声词音效(〔咚！〕〔哗啦〕)，把画面用声音"读"出来。卖点是「不用看图也能追漫」。单集＝某一话。声音标签：配音活泼/音效带感。听众追更催更、磕CP、笑点整齐。',
  '诗词朗诵': '【诗词朗诵】节目母题：诗词歌赋/散文美文朗诵——配乐诵读、气韵与停顿讲究，主打「声音的美感与意境」。单集＝一首诗/一篇美文。声音标签：字正腔圆/情感饱满/配乐雅致。听众循环、摘抄、当学习或助眠背景音。',
  '脱口秀': '【脱口秀】节目母题：单口喜剧/吐槽电台——生活观察、犀利吐槽、段子密集，主打「好笑又解压」。单集＝一期主题脱口秀。声音标签：节奏快/梗密/会抖包袱。听众笑到打鸣、二刷记金句、催更主题。烈度跟黑红度阀(低=温和吐槽)。',
  '悬疑推理': '【悬疑推理】节目母题：悬疑/推理有声剧或播讲——案件推演、氛围音效(〔滴水〕〔脚步渐近〕)、层层反转，主打「毛骨悚然又上头」。单集＝一个案子/一章。声音标签：低沉悬疑/音效惊悚。听众追更破案、戴耳机后背发凉、讨论凶手。惊悚停在娱乐向、不致郁。',
  '影视原声': '【影视原声】节目母题：影视/动画/游戏的原声碟与配乐歌单——BGM/主题曲/角色歌，配报幕与听感解说。单集＝一张原声或一支曲子。声音标签：气势磅礴/情绪拉满/名场面BGM。听众循环入坑曲、收藏进歌单、被回忆杀。',
  '冥想正念': '【冥想正念】节目母题：正念冥想/呼吸引导/减压放松——温柔引导语+自然白噪，主打「跟着做真的能静下来」。单集＝某个冥想主题(睡前/减压/专注/晨起)。声音标签：温柔平缓/引导感强。听众反馈「睡着了」「焦虑缓解」。与修真引导音区别在更贴现代减压、不涉功法。',
  '声控福利': '【声控福利】节目母题：声控向福利音频——撩人台词/情话/角色扮演对话(女友/学姐/主人向)，走「声音撩拨」路线。卖点是「被声音撩到心跳」。单集＝某个撩人主题/角色。声音标签：磁性撩人/宠溺。露骨直白程度跟色情度、身材媚态氛围跟肉欲度（低＝甜宠暧昧，高＝大胆撩拨），全女百合虚构表演。',
  '夜谈私语': '【夜谈私语·成人专区】节目母题：深夜成人向声音节目——露骨情话/情境语音/私密夜谈，进专区才有。卖点是「私密尺度」。单集＝某个私密主题/情境。声音标签：气息撩人/私密。露骨与肉欲按色情度/肉欲度顶格调控，阀低时保持含蓄暗示，全女百合、皆为虚构表演。',
  '双修引导': '【双修引导·成人专区】节目母题：把「修真引导音」推到成人向——引导式的双人玄修音频，「跟着我的呼吸，感受灵力在双人之间流转……」，玄幻情色与引导感结合。卖点是仙侠味的成人引导。单集＝某个双修功法/情境。声音标签：古风仙侠味/引导感。露骨与肉欲严格跟色情度/肉欲度阀，全女百合、皆为虚构表演。',
};
export function defaultXmCatTemplate(name: string): string {
  return XM_DEFAULT_CAT_PROMPTS[name] || `【${name}】节目母题：围绕「${name}」生成符合听书电台调性的纯音频节目（主播/声音标签/单集连载/听感梗概+声控向口碑）。只写听感不写画面。有设定资料时据此取材。`;
}


// __XM_DATA_LAYER__
// ==================== 数据存取 ====================
type XmData = {
  albums: XmAlbum[];
  comments: XmComment[];
  rooms: XmLiveRoom[];
  ranks: { id: string; title: string; entries: { name: string; reason: string; albumId?: string }[]; note?: string; ts: number }[];
  user: XmUser;
  player: XmPlayer;
  settings: XmSettings;
};
function rid(p: string): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }
function blankUser(): XmUser {
  return { subscriptions: [], collects: [], history: [], playlists: [], listenSec: 0, level: 1, exp: 0, badges: [], tasteTags: [] };
}
function blankPlayer(): XmPlayer {
  return { playing: false, positionSec: 0, rate: 1, loop: 'none', sleepTimerMin: 0 };
}
function blank(): XmData {
  return { albums: [], comments: [], rooms: [], ranks: [], user: blankUser(), player: blankPlayer(), settings: { ...DEFAULT_XM_SETTINGS } };
}
function read(): XmData {
  const d = readWorldJson<XmData>(WORLD_LS_KEYS.xmly, blank());
  if (!d || typeof d !== 'object') return blank();
  d.albums ||= []; d.comments ||= []; d.rooms ||= []; d.ranks ||= [];
  d.user = { ...blankUser(), ...(d.user || {}) };
  d.player = { ...blankPlayer(), ...(d.player || {}) };
  d.settings = { ...DEFAULT_XM_SETTINGS, ...(d.settings || {}) };
  d.settings.catPrompts = { ...XM_DEFAULT_CAT_PROMPTS, ...(d.settings.catPrompts || {}) };
  return d;
}
function write(d: XmData): void { writeWorldJson(WORLD_LS_KEYS.xmly, d); }

// ---- 设置 ----
export function getXmSettings(): XmSettings { return read().settings; }
export function updateXmSettings(patch: Partial<XmSettings>): XmSettings { const d = read(); d.settings = { ...d.settings, ...patch }; write(d); return d.settings; }

// ---- 分类管理 ----
export function getCategories(): { name: string; icon: string; adult?: boolean }[] {
  const custom = read().settings.customCats.map(c => ({ name: c.name, icon: 'fa-tag' }));
  return [...XM_CATS, ...custom];
}
export function isAdultCat(name: string): boolean { return !!XM_CATS.find(c => c.name === name)?.adult; }
export function addCustomCat(name: string): void {
  const d = read(); const nm = name.trim(); if (!nm) return;
  if (d.settings.customCats.some(c => c.name === nm) || XM_CATS.some(c => c.name === nm)) return;
  d.settings.customCats.push({ name: nm });
  if (!d.settings.catPrompts[nm]) d.settings.catPrompts[nm] = defaultXmCatTemplate(nm);
  write(d);
}
export function deleteCustomCat(name: string): void {
  const d = read(); d.settings.customCats = d.settings.customCats.filter(c => c.name !== name);
  delete d.settings.catPrompts[name]; write(d);
}
export function getCatPrompt(name: string): string { return read().settings.catPrompts[name] || ''; }
export function setCatPrompt(name: string, text: string): void { const d = read(); if (text.trim()) d.settings.catPrompts[name] = text; else delete d.settings.catPrompts[name]; write(d); }

// __XM_DATA_LAYER_2__
// ---- 专辑 ----
export function getAlbums(cat?: string): XmAlbum[] {
  let list = read().albums.slice().sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || b.plays - a.plays || b.ts - a.ts);
  if (cat) list = list.filter(a => a.cat === cat);
  return list;
}
export function getAlbum(id: string): XmAlbum | undefined { return read().albums.find(a => a.id === id); }
export function getEpisode(albumId: string, epId: string): XmEpisode | undefined { return getAlbum(albumId)?.episodes.find(e => e.id === epId); }
// 列表循环用：取同专辑里当前单集的下一集（到底返回 undefined）。
export function nextEpisodeOf(albumId: string, epId: string): XmEpisode | undefined {
  const eps = getAlbum(albumId)?.episodes || [];
  const i = eps.findIndex(e => e.id === epId);
  return (i >= 0 && i + 1 < eps.length) ? eps[i + 1] : undefined;
}
function normEp(x: Partial<XmEpisode>, i: number): XmEpisode {
  return {
    id: x.id || rid('ep'), no: typeof x.no === 'number' ? x.no : i + 1,
    title: x.title || `第${i + 1}集`, durationSec: typeof x.durationSec === 'number' ? x.durationSec : (600 + Math.floor(Math.random() * 2400)),
    synopsis: x.synopsis, hot: x.hot, playedSec: x.playedSec || 0, coverDesc: x.coverDesc,
    content: x.content, contentComplete: x.contentComplete,
  };
}
export function addAlbums(list: Partial<XmAlbum>[], cat: string, opts?: { isAi?: boolean }): XmAlbum[] {
  const d = read(); const added: XmAlbum[] = [];
  for (const a of list) {
    const eps = Array.isArray(a.episodes) ? a.episodes.map((e, i) => normEp(e, i)) : [];
    const album: XmAlbum = {
      id: a.id || rid('al'), title: a.title || '无名节目', host: a.host || '匿名主播', hostRef: a.hostRef,
      cat: a.cat || cat, voiceTone: a.voiceTone, coverDesc: a.coverDesc, intro: a.intro,
      episodes: eps,
      plays: typeof a.plays === 'number' ? a.plays : Math.floor(Math.random() * 120000),
      subs: typeof a.subs === 'number' ? a.subs : Math.floor(Math.random() * 20000),
      updatedEp: typeof a.updatedEp === 'number' ? a.updatedEp : (eps.length || undefined),
      finished: a.finished, live: a.live,
      isAdult: a.isAdult ?? isAdultCat(a.cat || cat),
      collected: a.collected, subscribed: a.subscribed,
      isAi: opts?.isAi ?? a.isAi, ts: Date.now() - Math.floor(Math.random() * 3600000),
    };
    d.albums.unshift(album); added.push(album);
  }
  if (d.albums.length > 200) d.albums = d.albums.slice(0, 200);
  write(d); return added;
}
export function setAlbumEpisodes(albumId: string, eps: Partial<XmEpisode>[]): void {
  const d = read(); const a = d.albums.find(x => x.id === albumId); if (!a) return;
  a.episodes = eps.map((e, i) => normEp(e, i));
  a.updatedEp = a.episodes.length; write(d);
}
// 单集播讲正文：首段（覆盖写）
export function setEpisodeContent(albumId: string, epId: string, text: string, complete?: boolean): void {
  const d = read(); const a = d.albums.find(x => x.id === albumId); const ep = a?.episodes.find(e => e.id === epId); if (!ep) return;
  ep.content = (text || '').trim(); ep.contentComplete = !!complete; write(d);
}
// 单集播讲正文：续写（追加到已有正文之后，支持超长无限续写）
export function appendEpisodeContent(albumId: string, epId: string, text: string, complete?: boolean): void {
  const d = read(); const a = d.albums.find(x => x.id === albumId); const ep = a?.episodes.find(e => e.id === epId); if (!ep) return;
  const add = (text || '').trim(); if (!add) return;
  ep.content = ep.content ? (ep.content.replace(/\s+$/, '') + '\n\n' + add) : add;
  ep.contentComplete = !!complete; write(d);
}
export function updateAlbum(id: string, patch: Partial<XmAlbum>): void { const d = read(); const a = d.albums.find(x => x.id === id); if (a) { Object.assign(a, patch); write(d); } }
export function deleteAlbum(id: string): void {
  const d = read(); d.albums = d.albums.filter(a => a.id !== id); d.comments = d.comments.filter(c => c.albumId !== id); write(d);
}
// 覆盖刷新：清 AI 铺的路人专辑（保留收藏/追更/绑定角色的、直播中的）。返回清掉数。
export function clearAiAlbums(cat?: string): number {
  const d = read(); const before = d.albums.length;
  const keep = (a: XmAlbum) => !a.isAi || a.collected || a.subscribed || a.hostRef || a.live;
  const removed = new Set(d.albums.filter(a => !keep(a) && (!cat || a.cat === cat)).map(a => a.id));
  d.albums = d.albums.filter(a => !removed.has(a.id));
  d.comments = d.comments.filter(c => !removed.has(c.albumId));
  write(d); return before - d.albums.length;
}

// ---- 评论/弹幕 ----
export function getComments(albumId: string): XmComment[] {
  return read().comments.filter(c => c.albumId === albumId).sort((a, b) => b.ts - a.ts);
}
export function addComments(albumId: string, list: Partial<XmComment>[], opts?: { isAi?: boolean }): XmComment[] {
  const d = read(); const added: XmComment[] = [];
  for (const c of list) {
    const cm: XmComment = {
      id: c.id || rid('cm'), albumId, epId: c.epId,
      author: c.author || '听友', authorRef: c.authorRef, content: c.content || '',
      likes: typeof c.likes === 'number' ? c.likes : Math.floor(Math.random() * 300),
      isDanmu: c.isDanmu, isAi: opts?.isAi ?? c.isAi, ts: Date.now() - Math.floor(Math.random() * 86400000 * 10),
    };
    d.comments.push(cm); added.push(cm);
  }
  write(d); return added;
}
export function likeComment(id: string): void { const d = read(); const c = d.comments.find(x => x.id === id); if (c) { c.likes += 1; write(d); } }
export function deleteComment(id: string): void { const d = read(); d.comments = d.comments.filter(c => c.id !== id); write(d); }
export function clearAiComments(albumId: string): number {
  const d = read(); const before = d.comments.length;
  d.comments = d.comments.filter(c => c.albumId !== albumId || !c.isAi || c.author === '我');
  write(d); return before - d.comments.length;
}

// __XM_DATA_LAYER_3__
// ---- 直播电台间 ----
export function getRooms(): XmLiveRoom[] {
  return read().rooms.slice().sort((a, b) => (a.ended ? 1 : 0) - (b.ended ? 1 : 0) || (b.followed ? 1 : 0) - (a.followed ? 1 : 0) || b.updatedAt - a.updatedAt);
}
export function getLiveRooms(): XmLiveRoom[] { return getRooms().filter(r => !r.ended); }
export function getRoom(id: string): XmLiveRoom | undefined { return read().rooms.find(r => r.id === id); }
export function addRooms(list: Partial<XmLiveRoom>[], opts?: { isAi?: boolean }): XmLiveRoom[] {
  const d = read(); const added: XmLiveRoom[] = [];
  for (const r of list) {
    const room: XmLiveRoom = {
      id: r.id || rid('rm'), host: r.host || '电台主播', hostRef: r.hostRef,
      topic: r.topic || '深夜电台', cat: r.cat || '电台夜话', voiceTone: r.voiceTone,
      listeners: typeof r.listeners === 'number' ? r.listeners : (50 + Math.floor(Math.random() * 3000)),
      nowSong: r.nowSong, notice: r.notice, followed: r.followed,
      isAdult: r.isAdult ?? isAdultCat(r.cat || ''),
      msgs: Array.isArray(r.msgs) ? r.msgs as XmLiveMsg[] : [], ended: r.ended,
      isAi: opts?.isAi ?? r.isAi, createdAt: Date.now(), updatedAt: Date.now(),
    };
    d.rooms.unshift(room); added.push(room);
  }
  if (d.rooms.length > 100) d.rooms = d.rooms.slice(0, 100);
  write(d); return added;
}
export function updateRoom(id: string, patch: Partial<Omit<XmLiveRoom, 'id' | 'msgs' | 'createdAt'>>): void {
  const d = read(); const i = d.rooms.findIndex(r => r.id === id); if (i < 0) return;
  d.rooms[i] = { ...d.rooms[i], ...patch, updatedAt: Date.now() }; write(d);
}
export function toggleRoomFollow(id: string): boolean { const d = read(); const r = d.rooms.find(x => x.id === id); if (!r) return false; r.followed = !r.followed; write(d); return r.followed; }
export function addRoomMsg(roomId: string, m: Omit<XmLiveMsg, 'id' | 'ts'>): XmLiveMsg | undefined {
  const d = read(); const r = d.rooms.find(x => x.id === roomId); if (!r) return undefined;
  const msg: XmLiveMsg = { id: rid('lm'), ts: Date.now(), ...m };
  r.msgs.push(msg); if (r.msgs.length > 200) r.msgs = r.msgs.slice(-200); r.updatedAt = Date.now(); write(d); return msg;
}
export function endRoom(id: string): void { updateRoom(id, { ended: true, listeners: 0 }); }
export function deleteRoom(id: string): void { const d = read(); d.rooms = d.rooms.filter(r => r.id !== id); write(d); }
export function clearAiRooms(): number {
  const d = read(); const before = d.rooms.length;
  d.rooms = d.rooms.filter(r => !r.isAi || r.followed);
  write(d); return before - d.rooms.length;
}

// ---- 声音榜 ----
export function getRanks(): XmData['ranks'] { return read().ranks.slice().sort((a, b) => b.ts - a.ts); }
export function getRank(id: string): XmData['ranks'][number] | undefined { return read().ranks.find(r => r.id === id); }
export function upsertRank(id: string, title: string, entries: { name: string; reason: string; albumId?: string }[], note?: string): void {
  const d = read();
  d.ranks = [{ id, title, entries, note, ts: Date.now() }, ...d.ranks.filter(r => r.id !== id)];
  write(d);
}

// ---- 播放态（常驻底部播放条）----
export function getPlayer(): XmPlayer { return read().player; }
export function setPlayer(patch: Partial<XmPlayer>): XmPlayer { const d = read(); d.player = { ...d.player, ...patch }; write(d); return d.player; }
// 播放某单集：写播放态 + 记历史 + 加收听经验（按时长折算），并把该集标记为已听一部分。
export function playEpisode(albumId: string, epId: string): { leveledUp: boolean; newBadges: string[] } {
  const d = read();
  const a = d.albums.find(x => x.id === albumId); const ep = a?.episodes.find(e => e.id === epId);
  d.player = { ...d.player, albumId, epId, playing: true, positionSec: ep?.playedSec || 0 };
  if (a) {
    d.user.history = [{ albumId, albumTitle: a.title, epId, epTitle: ep?.title, ts: Date.now() }, ...d.user.history.filter(h => !(h.albumId === albumId && h.epId === epId))].slice(0, 100);
    const gain = Math.min(30, Math.max(5, Math.round((ep?.durationSec || 600) / 120)));
    d.user.listenSec += (ep?.durationSec || 600);
    const beforeLv = d.user.level; d.user.exp += gain; d.user.level = levelOfExp(d.user.exp);
    const newBadges = refreshBadges(d);
    write(d);
    return { leveledUp: d.user.level > beforeLv, newBadges };
  }
  write(d); return { leveledUp: false, newBadges: [] };
}
export function togglePlay(): boolean { const d = read(); d.player.playing = !d.player.playing; write(d); return d.player.playing; }
export function stopPlayer(): void { setPlayer({ playing: false }); }

// __XM_DATA_LAYER_4__
// ---- 我的：追更 / 收藏 / 成长 / 歌单 ----
export function getUser(): XmUser { return read().user; }
export function toggleSubscribe(albumId: string): boolean {
  const d = read(); const has = d.user.subscriptions.includes(albumId);
  d.user.subscriptions = has ? d.user.subscriptions.filter(x => x !== albumId) : [albumId, ...d.user.subscriptions];
  const a = d.albums.find(x => x.id === albumId); if (a) a.subscribed = !has;
  write(d); return !has;
}
export function toggleCollectAlbum(albumId: string): boolean {
  const d = read(); const has = d.user.collects.includes(albumId);
  d.user.collects = has ? d.user.collects.filter(x => x !== albumId) : [albumId, ...d.user.collects];
  const a = d.albums.find(x => x.id === albumId); if (a) a.collected = !has;
  write(d); return !has;
}
export const XM_LEVEL_TITLES = ['初听', '耳机新人', '资深听友', '声控达人', '金耳朵', '仙音鉴赏家'];
function levelOfExp(exp: number): number { return Math.min(XM_LEVEL_TITLES.length, Math.max(1, Math.floor(exp / 100) + 1)); }
export function levelTitle(level: number): string { return XM_LEVEL_TITLES[Math.min(XM_LEVEL_TITLES.length - 1, Math.max(0, level - 1))]; }
export function expToNext(exp: number): { cur: number; need: number; pct: number } {
  const lvl = levelOfExp(exp); const base = (lvl - 1) * 100; const cur = exp - base; const need = 100;
  return { cur, need, pct: Math.min(100, Math.round(cur / need * 100)) };
}
export function addExp(n: number): boolean {
  const d = read(); const before = d.user.level; d.user.exp += n; d.user.level = levelOfExp(d.user.exp);
  refreshBadges(d); write(d); return d.user.level > before;
}
function refreshBadges(d: XmData): string[] {
  const have = new Set(d.user.badges); const add: string[] = [];
  const give = (b: string) => { if (!have.has(b)) { have.add(b); add.push(b); } };
  const hrs = d.user.listenSec / 3600;
  if (d.user.history.length >= 1) give('初次收听');
  if (hrs >= 10) give('十小时听龄');
  if (hrs >= 100) give('百时金耳朵');
  if (d.user.subscriptions.length >= 5) give('追更狂魔');
  const cats = new Set(d.user.history.map(h => d.albums.find(a => a.id === h.albumId)?.cat).filter(Boolean));
  if (cats.has('ASMR助眠') || cats.has('白噪陪睡')) give('助眠常客');
  if (cats.has('修真引导音')) give('入定听友');
  if (d.user.lastSleepWith) give('听声入眠');
  d.user.badges = Array.from(have); return add;
}
export function setTasteTags(tags: string[]): void { const d = read(); d.user.tasteTags = tags.slice(0, 8); write(d); }
// 哄睡陪听结算：记录「昨晚听着谁的声音睡着」，回写
export function setSleepWith(hostName: string): void { const d = read(); d.user.lastSleepWith = hostName; refreshBadges(d); write(d); }
// 歌单
export function getPlaylists(): XmPlaylist[] { return read().user.playlists.slice().sort((a, b) => b.ts - a.ts); }
export function addPlaylist(name: string): XmPlaylist { const d = read(); const p: XmPlaylist = { id: rid('pl'), name: name.trim() || '我的歌单', epRefs: [], ts: Date.now() }; d.user.playlists.unshift(p); write(d); return p; }
export function addToPlaylist(playlistId: string, albumId: string, epId: string): void {
  const d = read(); const p = d.user.playlists.find(x => x.id === playlistId); if (!p) return;
  if (!p.epRefs.some(r => r.albumId === albumId && r.epId === epId)) p.epRefs.push({ albumId, epId });
  write(d);
}
export function removePlaylist(id: string): void { const d = read(); d.user.playlists = d.user.playlists.filter(p => p.id !== id); write(d); }

export function clearAll(): void {
  const d = read();
  write({ ...blank(), user: d.user, player: blankPlayer(), settings: d.settings });
}
export function clearAllData(): void { write(blank()); }




