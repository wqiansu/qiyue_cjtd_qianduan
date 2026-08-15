import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

export type BrwPerson = { name: string; persona: string; greeting: string; gender?: string };
export type BrwEntityRef = { name: string; type: 'person' | 'faction' | 'place' | 'term' };
export type BrwReply = { id: string; author: string; content: string; floor: number; likes: number; ts: number; replyTo?: string; isMine?: boolean };
export type BrwPageExtras = {
  page?: string;
  pageLoaded?: boolean;
  summary?: string;
  qa?: { q: string; a: string }[];
  replies?: BrwReply[];
  entities?: BrwEntityRef[];
  people?: BrwPerson[];
};

export type BrwResultKind = 'web' | 'ad' | 'phishing' | 'forum' | 'site';
export type BrwResult = {
  id: string;
  title: string;
  site: string;
  url: string;
  snippet: string;
  kind?: BrwResultKind;
  suspicious?: boolean;     // 钓鱼/软文可识破标记（生态浓度高时出现）
} & BrwPageExtras;

export type BrwSearch = {
  id: string;
  query: string;
  results: BrwResult[];
  ts: number;
  isDirect?: boolean;       // 地址栏直达（非关键词搜索）
};

export type BrwNews = {
  id: string;
  title: string;
  source: string;
  url: string;
  category: string;
  snippet: string;
  hot?: string;
  coverDesc?: string;
  ts: number;
} & BrwPageExtras;

export type BrwEntity = {
  id: string;
  name: string;
  type: 'person' | 'faction' | 'place' | 'term';
  summary: string;
  sections: { h: string; t: string }[];
  related: string[];
  ts: number;
};

export type BrwHot = { rank: number; term: string; heat: string; tag?: string };

export type BrwNavSite = { id: string; name: string; url: string; desc?: string; builtin?: boolean; cat?: string; adult?: boolean };

export type BrwBookmark = { id: string; title: string; url: string; query: string; refKind: 'result' | 'news'; refId: string; ts: number };

type BrwData = {
  searches: BrwSearch[];
  bookmarks: BrwBookmark[];
  news?: BrwNews[];
  entities?: BrwEntity[];
  hot?: BrwHot[];
  navs?: BrwNavSite[];
  navsV?: number;              // 内置导航并入版本（reconcile 标记）
  settings?: BrowserSettings;
};

export type BrowserSettings = {
  useFloors: boolean;
  floorCount: number;
  useWorldbook: boolean;
  worldbookEntryKeys: string[];
  autoInterval: number;        // 每 N 楼自动刷新资讯，0=关
  lastFloor: number;
  searchEngine: string;
  incognito: boolean;          // 隐身模式：不写历史
  memoryEnabled: boolean;
  syncEnabled: boolean;
  ecoActivity: number;         // 信息活跃度（更新频率/信息量）0-100
  ecoControversy: number;      // 舆论争议度（对立/反转/吵架）0-100
  ecoAd: number;               // 广告/软文浓度（拟真广告·软广·钓鱼站）0-100
  ecoRumor: number;            // 小道消息/未证实传闻浓度 0-100
  blockWords: string[];
  topicPref: string;
  ecoErotic: number;           // 色情度浓度 0-100
  ecoCarnal: number;           // 肉欲度浓度 0-100
  ecoDaily: number;            // 日常度浓度 0-100
  navPrompts: Record<string, string>;
};
export const DEFAULT_BROWSER_SETTINGS: BrowserSettings = {
  useFloors: true, floorCount: 6, useWorldbook: false, worldbookEntryKeys: [],
  autoInterval: 0, lastFloor: 0, searchEngine: '微星搜索', incognito: false,
  memoryEnabled: true, syncEnabled: false,
  ecoActivity: 60, ecoControversy: 40, ecoAd: 45, ecoRumor: 35, blockWords: [],
  topicPref: '',
  ecoErotic: 45, ecoCarnal: 50, ecoDaily: 55, navPrompts: {},
};

export const BRW_DEFAULT_NAVS: BrwNavSite[] = [
  { id: 'nav_baike', name: '百科', url: 'baike.world', desc: '这个世界的百科全书', builtin: true, cat: '综合' },
  { id: 'nav_news', name: '头条新闻', url: 'news.world', desc: '要闻头条聚合', builtin: true, cat: '综合' },
  { id: 'nav_forum', name: '论坛社区', url: 'bbs.world', desc: '热帖与讨论区', builtin: true, cat: '综合' },
  { id: 'nav_ask', name: '问答', url: 'ask.world', desc: '有问必答社区', builtin: true, cat: '综合' },
  { id: 'nav_shop', name: '购物', url: 'mall.world', desc: '商品与比价', builtin: true, cat: '综合' },
  { id: 'nav_video', name: '影音', url: 'video.world', desc: '视频与直播', builtin: true, cat: '综合' },
  { id: 'nav_mail', name: '邮箱', url: 'mail.world', desc: '收发信件与通知', builtin: true, cat: '日常' },
  { id: 'nav_map', name: '地图', url: 'map.world', desc: '地点导航与周边', builtin: true, cat: '日常' },
  { id: 'nav_weather', name: '天气', url: 'weather.world', desc: '天象与黄历', builtin: true, cat: '日常' },
  { id: 'nav_music', name: '音乐', url: 'music.world', desc: '听歌与歌单电台', builtin: true, cat: '日常' },
  { id: 'nav_pan', name: '云盘', url: 'pan.world', desc: '文件存储与分享', builtin: true, cat: '日常' },
  { id: 'nav_doc', name: '文库', url: 'doc.world', desc: '文档资料与典籍', builtin: true, cat: '日常' },
  // 6 个成人向（R18，内容与出镜者按本卡世界书设定的性别生态默认全为女性）
  { id: 'nav_r18hub', name: '蜜窟', url: 'mihub.world', desc: '成人内容聚合站', builtin: true, cat: '成人', adult: true },
  { id: 'nav_r18live', name: '私播', url: 'silive.world', desc: '成人直播聚合', builtin: true, cat: '成人', adult: true },
  { id: 'nav_r18novel', name: '绮文', url: 'qiwen.world', desc: '情色小说连载站', builtin: true, cat: '成人', adult: true },
  { id: 'nav_r18bbs', name: '欢愉论坛', url: 'huanyu.world', desc: '成人交流社区', builtin: true, cat: '成人', adult: true },
  { id: 'nav_r18gl', name: '姬阁', url: 'jige.world', desc: '百合GL专站', builtin: true, cat: '成人', adult: true },
  { id: 'nav_r18shop', name: '悦己阁', url: 'yueji.world', desc: '成人好物商城', builtin: true, cat: '成人', adult: true },
];

export const BRW_DEFAULT_NAV_PROMPTS: Record<string, string> = {
  nav_baike: '【百科·baike.world】定位：这个世界的百科全书，权威中立的词条聚合。落地页栏目：今日词条/热门条目/分类导航(人物·地理·历史·势力·物产)/随机词条/编辑近况。内容口味：条目式客观陈述，带摘要+分节+相关条目，信息分层、不臆造主角私域。拟真元素：编辑/讨论/引用来源/词条争议标注。生态：严肃考据氛围，偶有编辑战与词条锁定提示。',
  nav_news: '【头条新闻·news.world】定位：要闻头条聚合门户。落地页栏目：头条轮播/要闻/本地/财经/社会/八卦花边/滚动快讯。内容口味：标题党与正经报道并存，按生态争议度调浓淡，配来源媒体名+时间。拟真元素：滚动时间戳、记者署名、相关报道、读者评论入口。生态：热点扎堆、媒体抢发、辟谣与谣言齐飞（按小道消息浓度）。',
  nav_forum: '【论坛社区·bbs.world】定位：综合性热帖讨论区。落地页栏目：今日热帖/版块导航/精华置顶/新帖速递/水区。内容口味：楼主开帖+盖楼跟帖文体，标题口语化带钩子，按争议度决定对线浓度。拟真元素：版块名、楼层、点赞/回复数、神回复加精。生态：盖楼、抬杠、玩梗、坐等后续，潜水党与杠精并存。',
  nav_ask: '【问答·ask.world】定位：有问必答知识社区。落地页栏目：热门问题/待解答/高赞回答/领域分类/今日精选。内容口味：一问多答，高赞答主长文+干货，也有抖机灵短答。拟真元素：答主认证、赞同/感谢数、评论追问、利益相关声明。生态：认真答主与「谢邀人在…」式抖机灵并存，偶有营销号软广答案。',
  nav_shop: '【购物·mall.world】定位：商品与比价商城。落地页栏目：今日推荐/分类货架/秒杀/销量榜/店铺/比价。内容口味：商品卡(名称+价位+卖点+评分+销量)，按广告浓度决定推广位多少。拟真元素：店铺评级、买家评价、问大家、比价曲线。生态：好评返现、刷单嫌疑、避雷帖与真实测评并存。',
  nav_video: '【影音·video.world】定位：视频与直播聚合站。落地页栏目：推荐/分区/直播中/排行榜/追剧/我的订阅。内容口味：视频卡(标题+UP+时长+播放量+封面描述)，直播卡(主播+在线数+标题)。拟真元素：分区标签、弹幕预览、热度榜、追番表。生态：标题党、催更、二创衍生、直播间打赏氛围。',
  nav_mail: '【邮箱·mail.world】定位：收发信件与系统通知。落地页栏目：收件箱/星标/草稿/已发送/订阅推送/系统通知。内容口味：邮件列表(发件人+主题+摘要+时间+未读点)，混杂正经往来、订阅推送、营销邮件与可疑钓鱼邮件(按广告/小道浓度)。拟真元素：未读红点、附件夹、垃圾箱、退订链接。生态：正经信件与垃圾营销/钓鱼并存，钓鱼邮件可被识破。',
  nav_map: '【地图·map.world】定位：地点导航与周边探索。落地页栏目：搜索地点/附近(餐饮·住宿·景点·医馆)/路线规划/收藏地点/实时路况。内容口味：地点卡(名称+类别+评分+地址+一句点评)，贴合世界观地名。拟真元素：评分星级、营业时间、用户点评、路线时长。生态：探店点评、避雷提醒、本地人补充冷门点。',
  nav_weather: '【天气·weather.world】定位：天象预报与黄历。落地页栏目：今日天气/未来七日/逐时/生活指数/预警/黄历宜忌。内容口味：贴合世界观的天象描述(可含玄幻天象)，配温度/风力/穿衣建议。拟真元素：天气图标描述、预警等级、宜忌事项。生态：天象异动提示、节气物候，玄幻世界可有灵气/法象天气。',
  nav_music: '【音乐·music.world】定位：听歌、歌单与电台。落地页栏目：每日推荐/排行榜/歌单广场/电台/分类(古风·治愈·情歌)/我的收藏。内容口味：歌曲卡(曲名+歌手+专辑+热度)、歌单卡(名称+简介+收藏数)，贴合世界观曲风。拟真元素：评论区热评、播放量、歌单标签。生态：热评点赞、歌单安利、循环上头，情歌评论区故事多。',
  nav_pan: '【云盘·pan.world】定位：文件存储与分享。落地页栏目：我的文件/最近/分享中/收到的分享/回收站/存储空间。内容口味：文件列表(名称+类型+大小+时间)，分享链接卡(含提取码)，混入可疑分享(按小道/广告浓度)。拟真元素：容量进度条、分享有效期、提取码、限速提示。生态：资源分享、求种、链接失效、可疑分享可识破。',
  nav_doc: '【文库·doc.world】定位：文档资料与典籍库。落地页栏目：热门文档/分类(典籍·教程·报告·模板)/我的上传/收藏/最近浏览。内容口味：文档卡(标题+格式+页数+下载量+上传者)，贴合世界观的资料/功法/典籍。拟真元素：预览页、下载券、评分、举报。生态：干货分享、伸手党、付费下载、版权争议。',
  nav_r18hub: '【蜜窟·mihub.world】定位：成人内容聚合门户（R18，内容与出镜者按本卡世界书设定的性别生态默认全为女性）。落地页栏目：今日推荐/分类(写真·影音·小说·音声)/热门榜/新作/我的收藏。内容口味：内容卡含标题+作者+类别+热度+一句简介，含蓄而有钩子，露骨度按生态色情度上限走（皆为虚构）。拟真元素：年龄确认提示、分区标签、收藏/点赞数、付费解锁。生态：聚合各类成人内容入口，提供分类检索与榜单，强调虚构与自愿。',
  nav_r18live: '【私播·silive.world】定位：成人直播聚合（R18，主播按本卡世界书设定默认全为女性）。落地页栏目：正在直播/分类(才艺·私密·百合·cos)/人气榜/新主播/我的关注。内容口味：直播间卡(主播+标题+在线数+分类+场景一句话)，与糖心生态呼应。拟真元素：在线人数、弹幕预览、打赏氛围、开播提醒。生态：直播间引流、打赏起哄、关注追播，尺度按设置走（虚构表演）。',
  nav_r18novel: '【绮文·qiwen.world】定位：情色小说连载站（R18）。落地页栏目：编辑推荐/分类(言情·百合·古风·现代)/排行榜/新书/连载追更/我的书架。内容口味：书目卡(书名+作者+标签+简介+字数+追更数)，简介有钩子不展开露骨细节。拟真元素：章节目录、追更/收藏数、书评区、月票榜。生态：追更催更、书评安利、太监预警，情节向与情色向并存（虚构创作）。',
  nav_r18bbs: '【欢愉论坛·huanyu.world】定位：成人交流社区（R18）。落地页栏目：今日热帖/版块(经验交流·资源·测评·树洞)/精华/新帖。内容口味：楼主开帖+盖楼文体，话题围绕成人内容讨论/资源/经验分享，含蓄表达。拟真元素：版块、楼层、加精、匿名马甲。生态：盖楼讨论、资源互助、避雷测评、树洞倾诉，强调虚构与自愿。',
  nav_r18gl: '【姬阁·jige.world】定位：百合GL专站（R18，契合本卡无雄性世界观）。落地页栏目：今日推荐/分类(写真·短剧·小说·音声)/CP榜/新作/姬圈话题。内容口味：女女CP向内容卡，甜/欲并存，简介有CP张力，露骨度按生态走（虚构）。拟真元素：CP标签、磕糖弹幕、收藏数、姬圈黑话。生态：磕CP、安利、姬圈文化梗，氛围甜而暧昧（虚构创作）。',
  nav_r18shop: '【悦己阁·yueji.world】定位：成人好物商城（R18，与小红书悦己好物呼应）。落地页栏目：今日推荐/分类(悦己·氛围·私密护理·情趣)/销量榜/新品/评价。内容口味：商品卡(名称+价位+卖点+评分+销量)，含蓄专业地种草，强调悦己与自愿。拟真元素：买家评价、问大家、隐私包装提示、复购率。生态：种草测评、真实反馈、避雷红黑榜，商单痕迹自然（虚构）。',
};

function rid(p: string): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

function read(): BrwData {
  const d = readWorldJson<BrwData>(WORLD_LS_KEYS.browser, { searches: [], bookmarks: [] });
  if (!d || typeof d !== 'object') return { searches: [], bookmarks: [] };
  if (!Array.isArray(d.searches)) d.searches = [];
  if (!Array.isArray(d.bookmarks)) d.bookmarks = [];
  if (!Array.isArray(d.news)) d.news = [];
  if (!Array.isArray(d.entities)) d.entities = [];
  if (!Array.isArray(d.hot)) d.hot = [];
  // 网址导航：首次为空时灌入内置宫格（玩家删改后不回填）。
  if (!Array.isArray(d.navs)) d.navs = BRW_DEFAULT_NAVS.map(n => ({ ...n }));
  // 一次性把新增内置站点(日常/成人)并入老用户的导航（按 id 去重，仅运行一次，不重复回填已删项）。
  if ((d.navsV || 0) < 13) {
    const have = new Set(d.navs.map(n => n.id));
    for (const n of BRW_DEFAULT_NAVS) if (!have.has(n.id)) d.navs.push({ ...n });
    d.navsV = 13;
  }
  return d;
}
function write(d: BrwData): void { writeWorldJson(WORLD_LS_KEYS.browser, d); }

function cleanExtras(r: any): BrwResult {
  return {
    id: r.id, title: r.title, site: r.site, url: r.url, snippet: r.snippet,
    kind: r.kind, suspicious: r.suspicious,
    page: r.page, pageLoaded: r.pageLoaded, summary: r.summary, qa: r.qa,
    replies: r.replies, entities: r.entities, people: r.people,
  };
}

export function getSearches(): BrwSearch[] { return read().searches.slice().sort((a, b) => b.ts - a.ts); }
export function getSearch(id: string): BrwSearch | undefined { return read().searches.find(s => s.id === id); }

export function addSearch(query: string, results: Partial<BrwResult>[], isDirect = false): BrwSearch {
  const d = read();
  const s: BrwSearch = {
    id: rid('bs'), query, ts: Date.now(), isDirect,
    results: results.map(r => ({
      id: rid('br'), title: String(r.title || '无标题'), site: String(r.site || '网页'),
      url: String(r.url || 'www.example.com'), snippet: String(r.snippet || ''),
      kind: (r.kind as BrwResultKind) || 'web', suspicious: !!r.suspicious,
      page: r.page ? String(r.page) : undefined, pageLoaded: !!r.page,
    })),
  };
  d.searches.unshift(s);
  if (d.searches.length > 60) d.searches = d.searches.slice(0, 60);
  write(d);
  return s;
}
export function patchResult(searchId: string, resultId: string, patch: Partial<BrwResult>): void {
  const d = read();
  const s = d.searches.find(x => x.id === searchId);
  const r = s?.results.find(x => x.id === resultId);
  if (!r) return;
  Object.assign(r, patch);
  write(d);
}
export function deleteSearch(id: string): void {
  const d = read();
  d.searches = d.searches.filter(s => s.id !== id);
  write(d);
}

export function getNews(): BrwNews[] { return (read().news || []).slice().sort((a, b) => b.ts - a.ts); }
export function getNewsItem(id: string): BrwNews | undefined { return (read().news || []).find(n => n.id === id); }
export function addNews(list: Partial<BrwNews>[]): BrwNews[] {
  const d = read();
  if (!Array.isArray(d.news)) d.news = [];
  const added: BrwNews[] = [];
  for (const p of list) {
    const n: BrwNews = {
      id: rid('bn'), title: String(p.title || '无标题'), source: String(p.source || '快讯'),
      url: String(p.url || 'news.world'), category: String(p.category || '要闻'),
      snippet: String(p.snippet || ''), hot: p.hot ? String(p.hot) : undefined,
      coverDesc: p.coverDesc ? String(p.coverDesc) : undefined, ts: Date.now(),
    };
    d.news.unshift(n); added.push(n);
  }
  if (d.news.length > 120) d.news = d.news.slice(0, 120);
  write(d);
  return added;
}
export function clearNews(): void { const d = read(); d.news = []; write(d); }
export function patchNews(id: string, patch: Partial<BrwNews>): void {
  const d = read();
  const n = (d.news || []).find(x => x.id === id);
  if (!n) return;
  Object.assign(n, patch);
  write(d);
}

export function getEntities(): BrwEntity[] { return (read().entities || []).slice().sort((a, b) => b.ts - a.ts); }
export function getEntityByName(name: string): BrwEntity | undefined { return (read().entities || []).find(e => e.name === name); }
export function upsertEntity(p: Partial<BrwEntity> & { name: string; type: BrwEntity['type'] }): BrwEntity {
  const d = read();
  if (!Array.isArray(d.entities)) d.entities = [];
  const i = d.entities.findIndex(e => e.name === p.name);
  const e: BrwEntity = {
    id: (i >= 0 ? d.entities[i].id : rid('be')), name: p.name, type: p.type,
    summary: String(p.summary || ''), sections: Array.isArray(p.sections) ? p.sections : [],
    related: Array.isArray(p.related) ? p.related : [], ts: Date.now(),
  };
  if (i >= 0) d.entities[i] = e; else d.entities.unshift(e);
  if (d.entities.length > 80) d.entities = d.entities.slice(0, 80);
  write(d);
  return e;
}

export function getHot(): BrwHot[] { return (read().hot || []).slice().sort((a, b) => a.rank - b.rank); }
export function setHot(list: Partial<BrwHot>[]): void {
  const d = read();
  d.hot = list.map((h, i) => ({ rank: typeof h.rank === 'number' ? h.rank : i + 1, term: String(h.term || ''), heat: String(h.heat || ''), tag: h.tag ? String(h.tag) : undefined })).filter(h => h.term);
  write(d);
}

export function addReplyToResult(searchId: string, resultId: string, reply: { author: string; content: string; likes?: number; replyTo?: string; isMine?: boolean }): void {
  const d = read();
  const s = d.searches.find(x => x.id === searchId);
  const r = s?.results.find(x => x.id === resultId);
  if (!r) return;
  if (!Array.isArray(r.replies)) r.replies = [];
  r.replies.push({ id: rid('rp'), author: reply.author, content: reply.content, floor: r.replies.length + 1, likes: reply.likes || 0, ts: Date.now(), replyTo: reply.replyTo, isMine: reply.isMine });
  write(d);
}
export function appendRepliesToResult(searchId: string, resultId: string, list: { author: string; content: string; likes?: number; replyTo?: string }[]): void {
  const d = read();
  const s = d.searches.find(x => x.id === searchId);
  const r = s?.results.find(x => x.id === resultId);
  if (!r) return;
  if (!Array.isArray(r.replies)) r.replies = [];
  for (const c of list) { if (!c.content) continue; r.replies.push({ id: rid('rp'), author: String(c.author || '路人'), content: String(c.content), floor: r.replies.length + 1, likes: c.likes || 0, ts: Date.now(), replyTo: c.replyTo }); }
  write(d);
}
export function addReplyToNews(newsId: string, reply: { author: string; content: string; likes?: number; replyTo?: string; isMine?: boolean }): void {
  const d = read();
  const n = (d.news || []).find(x => x.id === newsId);
  if (!n) return;
  if (!Array.isArray(n.replies)) n.replies = [];
  n.replies.push({ id: rid('rp'), author: reply.author, content: reply.content, floor: n.replies.length + 1, likes: reply.likes || 0, ts: Date.now(), replyTo: reply.replyTo, isMine: reply.isMine });
  write(d);
}
export function appendRepliesToNews(newsId: string, list: { author: string; content: string; likes?: number; replyTo?: string }[]): void {
  const d = read();
  const n = (d.news || []).find(x => x.id === newsId);
  if (!n) return;
  if (!Array.isArray(n.replies)) n.replies = [];
  for (const c of list) { if (!c.content) continue; n.replies.push({ id: rid('rp'), author: String(c.author || '路人'), content: String(c.content), floor: n.replies.length + 1, likes: c.likes || 0, ts: Date.now(), replyTo: c.replyTo }); }
  write(d);
}

export function getBookmarks(): BrwBookmark[] { return read().bookmarks.slice().sort((a, b) => b.ts - a.ts); }
export function addBookmark(p: { title: string; url: string; query: string; refKind: 'result' | 'news'; refId: string }): void {
  const d = read();
  if (d.bookmarks.some(b => b.refId === p.refId)) return;
  d.bookmarks.unshift({ id: rid('bk'), title: p.title, url: p.url, query: p.query, refKind: p.refKind, refId: p.refId, ts: Date.now() });
  write(d);
}
export function removeBookmark(id: string): void {
  const d = read();
  d.bookmarks = d.bookmarks.filter(b => b.id !== id);
  write(d);
}
export function isBookmarked(refId: string): boolean { return read().bookmarks.some(b => b.refId === refId); }

export function getNavs(): BrwNavSite[] { return (read().navs || []).slice(); }
export function addNav(p: { name: string; url: string; desc?: string; cat?: string; adult?: boolean }): BrwNavSite {
  const d = read();
  if (!Array.isArray(d.navs)) d.navs = [];
  const n: BrwNavSite = { id: rid('nv'), name: p.name, url: p.url, desc: p.desc, cat: p.cat || '综合', adult: !!p.adult };
  d.navs.push(n); write(d); return n;
}
export function removeNav(id: string): void {
  const d = read();
  if (!Array.isArray(d.navs)) return;
  d.navs = d.navs.filter(n => n.id !== id); write(d);
}

export function clearAll(): void { const d = read(); write({ searches: [], bookmarks: [], news: [], entities: [], hot: [], navs: d.navs, settings: d.settings }); }

export function getBrowserSettings(): BrowserSettings {
  const d = read();
  const s = { ...DEFAULT_BROWSER_SETTINGS, ...(d.settings || {}) };
  s.navPrompts = { ...BRW_DEFAULT_NAV_PROMPTS, ...(d.settings?.navPrompts || {}) };
  return s;
}
export function updateBrowserSettings(patch: Partial<BrowserSettings>): BrowserSettings {
  const d = read();
  d.settings = { ...DEFAULT_BROWSER_SETTINGS, ...(d.settings || {}), ...patch };
  write(d);
  return d.settings;
}
export function getNavPrompt(navId: string): string {
  const s = getBrowserSettings();
  return (s.navPrompts && s.navPrompts[navId]) || BRW_DEFAULT_NAV_PROMPTS[navId] || '';
}
export function setNavPrompt(navId: string, text: string): void {
  const d = read();
  const cur = { ...BRW_DEFAULT_NAV_PROMPTS, ...(d.settings?.navPrompts || {}) };
  cur[navId] = text;
  d.settings = { ...DEFAULT_BROWSER_SETTINGS, ...(d.settings || {}), navPrompts: cur };
  write(d);
}

void cleanExtras; // 预留：净化外部导入结果
