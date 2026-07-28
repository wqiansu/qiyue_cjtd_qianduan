// 微博数据层（weibo-store.ts）
// 世界观内的微博：角色当博主发动态，玩家浏览/点赞/评论/转发；可生成热搜。
// 数据纯本地 _th_world_weibo_v1。
import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

// 评论
export type WeiboComment = {
  id: string;
  author: string;
  authorRef?: string;
  content: string;
  ts: number;
  likes: number;
  ip?: string;             // IP 属地（如 北京 / 浙江），网感用
  replyTo?: string;        // 楼中楼：回复的昵称（可空）
  isAi?: boolean;
  toMe?: boolean;          // 该评论是否回应「我」的评论/博文（评论回响闭环用，触发通知）
  liked?: boolean;         // 我是否点过赞（可撤销、防重复累加）
};

// 投票博文的单个选项
export type WeiboPollOption = {
  text: string;
  votes: number;
};

// 微博动态
export type WeiboPost = {
  id: string;
  author: string;          // 博主昵称
  authorRef?: string;      // 关联联系人（contact:<id>）
  content: string;
  image?: string;          // 配图 URL（comfyui 出图，可空）
  imgDesc?: string;        // 配图中文描述（无后端时文字占位）
  imgTags?: string;        // 配图英文 NAI tags（出图用）
  imgList?: { desc: string; tags?: string }[]; // 多图（九宫格）的「外框+文字描述」组
  ts: number;
  likes: number;
  liked?: boolean;         // 我是否点过赞（防重复+高亮）
  reposts: number;
  fans?: string;           // 博主粉丝数展示（如 12.3万 / 1.2w）
  verified?: string;       // 认证标签（如 知名博主 / 演员 / 官方，空=无认证）
  ip?: string;             // IP 属地
  device?: string;         // 来自（如 iPhone 客户端）
  repostOf?: string;       // 转发的原微博 id（可空）
  quoteOf?: string;        // 引用转发(带评)的原微博 id（quote，区别于纯转发）
  topic?: string;          // 所属话题/超话（可空）
  poll?: { question?: string; options: WeiboPollOption[]; myVote?: number; endsLabel?: string }; // 投票博文
  isAi?: boolean;
  comments: WeiboComment[];
};

// 热搜条目
export type WeiboHot = {
  id: string;
  keyword: string;
  heat: number;            // 热度值（展示用）
  tag?: string;            // 热/爆/新
  ts: number;
  desc?: string;           // 热搜词条的一句话引导语（聚合页顶部用，可空）
};

// 通知中心条目
export type WeiboNotifyKind = 'like' | 'comment' | 'at' | 'follow' | 'repost' | 'system';
export type WeiboNotify = {
  id: string;
  kind: WeiboNotifyKind;
  actor: string;           // 触发者昵称
  actorRef?: string;
  text: string;            // 通知文案（如「赞了你的微博」「评论：…」）
  postId?: string;         // 关联微博（可跳转）
  ts: number;
  read: boolean;
};

// 关注关系（按博主昵称/authorRef 记一份）
export type WeiboFollow = {
  name: string;            // 博主昵称
  ref?: string;            // contact:<id>（可空）
  ts: number;
};

// 超话/CP 话题
export type WeiboSuperTopic = {
  id: string;
  name: string;            // 超话名（如 「师瑄瑄」超话 / 「清惜x师瑄瑄」CP超话）
  kind: 'star' | 'cp' | 'topic'; // 个人超话 / CP超话 / 普通话题
  desc?: string;           // 简介
  followed?: boolean;      // 我是否关注
  posts?: number;          // 帖量（展示用）
  ts: number;
};

// 个人资料（昵称/头像/背景/简介/关注/粉丝/IP/认证）。头像背景全局级，其余随档。
export type WeiboProfile = {
  nickname: string;
  avatar?: string;         // 头像（dataURL/URL/空=首字）
  banner?: string;         // 个人主页顶部背景图
  bio?: string;            // 简介/签名
  following: number;       // 关注数
  followers: number;       // 粉丝数（AI 生成时可回写）
  ipLocation?: string;     // IP 属地
  verifyText?: string;     // 认证文案
  level?: number;          // 玩家等级（按粉丝/互动成长）
  verified?: string;       // 玩家加V认证（够粉丝解锁，空=无）
};

// 微博设置（注入/世界书/楼层自动触发）。
export type WeiboSettings = {
  useWorldbook: boolean;
  worldbookIds: string[];
  worldbookEntryKeys?: string[]; // 条目级选择 `${book} ${entry}`，优先于 worldbookIds
  autoEnabled: boolean;    // 楼层记录触发自动生成
  autoInterval: number;    // 每隔 N 层触发一次
  lastFloor: number;       // 上次记录到的正文楼层
  // 玩家自由度 / 生态浓度
  feedScope?: 'recommend' | 'following' | 'local'; // 默认推荐流；关注流只看已关注
  timelineMode?: 'world' | 'real';  // 时间线排序：世界时间 / 真实时间
  ecoActivity?: number;    // 角色活跃度 0-100（影响一屏多少条、谁发）
  ecoControl?: number;     // 控评/水军浓度 0-100
  ecoSnark?: number;       // 毒舌/阴阳程度 0-100
  ecoErotic?: number;      // 色情度浓度 0-100（露骨/直白程度）
  ecoCarnal?: number;      // 肉欲度浓度 0-100（肉体肉欲与诱惑表现强度）
  blockWords?: string[];   // 屏蔽词
  antiSpoiler?: boolean;   // 防剧透：过滤未发生剧情
  echoEnabled?: boolean;   // 评论回响：我发声后 AI 自动接话
  // 记忆与同步的总开关（玩家可一键关停，不必逐项调 wbSync）
  syncEnabled?: boolean;   // 是否允许「同步到角色卡世界书」（关=任何同步都不发生）
  memoryEnabled?: boolean; // 是否启用「会话记忆」（关=不读写微博会话记忆）
  useFloors?: boolean;     // 生成时是否参考最近正文
  floorCount?: number;     // 参考最近正文时读几楼
  // 时间线手动同步/校正
  worldAnchorText?: string; // 玩家手填/校正的「当前世界时间」锚点文案（空=自动读世界信息）
  worldAnchorTs?: number;   // 设定该锚点时的真实时间戳（用于换算世界流逝，0=未设）
};

type WeiboData = {
  posts: WeiboPost[]; hots: WeiboHot[]; profile?: WeiboProfile; settings?: WeiboSettings;
  notifies?: WeiboNotify[]; follows?: WeiboFollow[]; supers?: WeiboSuperTopic[];
};

const DEFAULT_PROFILE: WeiboProfile = {
  nickname: '我', following: 0, followers: 0, ipLocation: 'IP属地：未知', verifyText: '微博个人认证', level: 1,
};
const DEFAULT_SETTINGS: WeiboSettings = {
  useWorldbook: false, worldbookIds: [], autoEnabled: false, autoInterval: 20, lastFloor: 0,
  feedScope: 'recommend', timelineMode: 'world',
  ecoActivity: 60, ecoControl: 40, ecoSnark: 50, ecoErotic: 30, ecoCarnal: 40, blockWords: [], antiSpoiler: true, echoEnabled: true,
  syncEnabled: false, memoryEnabled: true, worldAnchorText: '', worldAnchorTs: 0,   // 世界书同步默认关
  useFloors: true, floorCount: 6,
};

function rid(p: string): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

function read(): WeiboData {
  const d = readWorldJson<WeiboData>(WORLD_LS_KEYS.weibo, { posts: [], hots: [] });
  if (!d || typeof d !== 'object') return { posts: [], hots: [], notifies: [], follows: [], supers: [] };
  if (!Array.isArray(d.posts)) d.posts = [];
  if (!Array.isArray(d.hots)) d.hots = [];
  if (!Array.isArray(d.notifies)) d.notifies = [];
  if (!Array.isArray(d.follows)) d.follows = [];
  if (!Array.isArray(d.supers)) d.supers = [];
  d.profile = { ...DEFAULT_PROFILE, ...(d.profile || {}) };
  d.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  return d;
}
function write(d: WeiboData): void { writeWorldJson(WORLD_LS_KEYS.weibo, d); }

// ---------- 微博 ----------
export function getPosts(): WeiboPost[] {
  return read().posts.slice().sort((a, b) => b.ts - a.ts);
}
export function getPostsByAuthorRef(ref: string): WeiboPost[] {
  return getPosts().filter(p => p.authorRef === ref);
}
export function getPost(id: string): WeiboPost | undefined { return read().posts.find(p => p.id === id); }

export function createPost(p: Partial<WeiboPost> & { author: string; content: string }): WeiboPost {
  const d = read();
  const post: WeiboPost = {
    id: p.id || rid('wb'),
    author: p.author, authorRef: p.authorRef, content: p.content,
    image: p.image, imgDesc: p.imgDesc, imgTags: p.imgTags, imgList: p.imgList,
    ts: Date.now(), likes: p.likes ?? 0, liked: p.liked, reposts: p.reposts ?? 0,
    fans: p.fans, verified: p.verified, ip: p.ip, device: p.device,
    repostOf: p.repostOf, quoteOf: p.quoteOf, topic: p.topic, poll: p.poll,
    isAi: !!p.isAi, comments: [],
  };
  d.posts.push(post);
  write(d);
  return post;
}
export function deletePost(id: string): void {
  const d = read();
  d.posts = d.posts.filter(p => p.id !== id);
  write(d);
}
export function updatePost(id: string, patch: Partial<WeiboPost>): void {
  const d = read();
  const p = d.posts.find(x => x.id === id);
  if (!p) return;
  Object.assign(p, patch);
  write(d);
}
export function togglePostLike(id: string): void {
  const d = read();
  const p = d.posts.find(x => x.id === id);
  if (!p) return;
  if (p.liked) { p.liked = false; p.likes = Math.max(0, (p.likes || 0) - 1); }
  else { p.liked = true; p.likes = (p.likes || 0) + 1; }
  write(d);
}
// 给投票博文投一票（idx=选项下标）。已投过则改投。
export function votePoll(postId: string, idx: number): void {
  const d = read();
  const p = d.posts.find(x => x.id === postId);
  if (!p || !p.poll || !p.poll.options[idx]) return;
  const prev = p.poll.myVote;
  if (prev === idx) return;
  if (typeof prev === 'number' && p.poll.options[prev]) p.poll.options[prev].votes = Math.max(0, (p.poll.options[prev].votes || 0) - 1);
  p.poll.options[idx].votes = (p.poll.options[idx].votes || 0) + 1;
  p.poll.myVote = idx;
  write(d);
}
export function repost(id: string, byAuthor: string, comment?: string): WeiboPost | undefined {
  const d = read();
  const src = d.posts.find(x => x.id === id);
  if (!src) return undefined;
  src.reposts = (src.reposts || 0) + 1;
  const rp: WeiboPost = {
    id: rid('wb'), author: byAuthor, content: comment || '转发微博',
    ts: Date.now(), likes: 0, reposts: 0, repostOf: id, comments: [],
  };
  d.posts.push(rp);
  write(d);
  return rp;
}

// ---------- 评论 ----------
export function addComment(postId: string, c: { author: string; authorRef?: string; content: string; ip?: string; replyTo?: string; isAi?: boolean; toMe?: boolean }): WeiboComment | undefined {
  const d = read();
  const p = d.posts.find(x => x.id === postId);
  if (!p) return undefined;
  const cm: WeiboComment = { id: rid('cm'), author: c.author, authorRef: c.authorRef, content: c.content, ts: Date.now(), likes: 0, ip: c.ip, replyTo: c.replyTo, isAi: !!c.isAi, toMe: c.toMe };
  p.comments.push(cm);
  write(d);
  return cm;
}
export function deleteComment(postId: string, commentId: string): void {
  const d = read();
  const p = d.posts.find(x => x.id === postId);
  if (!p) return;
  p.comments = p.comments.filter(c => c.id !== commentId);
  write(d);
}
export function toggleCommentLike(postId: string, commentId: string): void {
  const d = read();
  const p = d.posts.find(x => x.id === postId);
  if (!p) return;
  const c = p.comments.find(x => x.id === commentId);
  if (!c) return;
  if (c.liked) { c.liked = false; c.likes = Math.max(0, (c.likes || 0) - 1); }
  else { c.liked = true; c.likes = (c.likes || 0) + 1; }
  write(d);
}

// ---------- 热搜 ----------
export function getHots(): WeiboHot[] {
  return read().hots.slice().sort((a, b) => b.heat - a.heat);
}
export function setHots(items: { keyword: string; heat?: number; tag?: string; desc?: string }[]): void {
  const d = read();
  d.hots = items.filter(x => x.keyword && x.keyword.trim()).map((x, i) => ({
    id: rid('ht'), keyword: x.keyword.trim(),
    heat: x.heat ?? (1000000 - i * 50000 + Math.floor(Math.random() * 30000)),
    tag: x.tag, desc: x.desc, ts: Date.now(),
  }));
  write(d);
}
export function clearAll(): void {
  const d = read();
  // 保留个人资料/设置/关注/超话（偏好类），只清内容流与通知
  write({ posts: [], hots: [], profile: d.profile, settings: d.settings, follows: d.follows, supers: d.supers, notifies: [] });
}

// 覆盖刷新：清掉 AI 路人博文后再生成。保留「我」发的、点过赞的、有评论的，避免丢数据。
export function clearFeedPosts(): void {
  const d = read();
  d.posts = d.posts.filter(p => !p.isAi || p.liked || (Array.isArray(p.comments) && p.comments.length > 0));
  write(d);
}

// ---------- 我的动态 / 个人资料 / 设置 ----------
// 「我」发布的微博（author 非 AI）。
export function getMyPosts(): WeiboPost[] { return getPosts().filter(p => !p.isAi); }

export function getProfile(): WeiboProfile {
  const d = read();
  const p = d.profile || DEFAULT_PROFILE;
  // 关注数以真实关注名单为唯一事实来源，避免「显示 25 但名单为空」的脱节。
  const following = (d.follows || []).length;
  return { ...p, following };
}
export function updateProfile(patch: Partial<WeiboProfile>): void {
  const d = read();
  d.profile = { ...DEFAULT_PROFILE, ...(d.profile || {}), ...patch };
  write(d);
}
export function getMyPostCount(): number { return getMyPosts().length; }

// 粉丝/等级成长：按互动量（发博、被评论/被@）真实回写 profile.followers/level/verified。
//   兑现「粉丝数会在 AI 生成时按剧情自动浮动」的承诺——只加不减、带随机波动，避免机械。
//   verified：粉丝破阈值自动解锁一档认证文案（玩家已手填则不覆盖）。
export function bumpFollowers(delta: number, reason?: 'post' | 'echo'): void {
  if (!delta) return;
  const d = read();
  const p = { ...DEFAULT_PROFILE, ...(d.profile || {}) };
  const jitter = reason === 'post' ? Math.floor(Math.random() * 60) : Math.floor(Math.random() * 20);
  p.followers = Math.max(0, (p.followers || 0) + Math.max(0, delta) + jitter);
  // 等级：按粉丝对数增长，1~10 档
  p.level = Math.max(1, Math.min(10, Math.floor(Math.log10(Math.max(1, p.followers)) * 1.6) + 1));
  // 认证：粉丝破线自动解锁（玩家未手填时）
  if (!p.verified) {
    if (p.followers >= 100000) p.verified = '知名博主';
    else if (p.followers >= 10000) p.verified = '微博原创作者';
  }
  d.profile = p;
  write(d);
}

export function getSettings(): WeiboSettings {
  return read().settings || DEFAULT_SETTINGS;
}
export function updateSettings(patch: Partial<WeiboSettings>): void {
  const d = read();
  d.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}), ...patch };
  write(d);
}
export function clearAllData(): void { const d = read(); write({ posts: [], hots: [], profile: d.profile, settings: d.settings }); }

// ==================== 通知中心 ====================
export function getNotifies(): WeiboNotify[] { return (read().notifies || []).slice().sort((a, b) => b.ts - a.ts); }
export function getUnreadNotifyCount(): number { return (read().notifies || []).filter(n => !n.read).length; }
export function addNotify(n: { kind: WeiboNotifyKind; actor: string; actorRef?: string; text: string; postId?: string }): void {
  const d = read();
  (d.notifies ||= []).push({ id: rid('nt'), kind: n.kind, actor: n.actor, actorRef: n.actorRef, text: n.text, postId: n.postId, ts: Date.now(), read: false });
  if (d.notifies.length > 200) d.notifies = d.notifies.slice(-200);
  write(d);
}
export function markAllNotifyRead(): void {
  const d = read();
  (d.notifies || []).forEach(n => { n.read = true; });
  write(d);
}
export function clearNotifies(): void { const d = read(); d.notifies = []; write(d); }

// ==================== 关注关系 + 关注流 ====================
export function getFollows(): WeiboFollow[] { return (read().follows || []).slice(); }
export function isFollowing(name: string): boolean { return (read().follows || []).some(f => f.name === name); }
export function toggleFollow(name: string, ref?: string): boolean {
  const d = read();
  const list = (d.follows ||= []);
  const i = list.findIndex(f => f.name === name);
  let nowFollowing: boolean;
  if (i >= 0) { list.splice(i, 1); nowFollowing = false; }
  else { list.push({ name, ref, ts: Date.now() }); nowFollowing = true; }
  // 关注数由 getProfile 从 follows.length 实时派生，这里不再手动加减（避免双计/脱节）。
  write(d);
  return nowFollowing;
}
// 某博主的全部博文（主页用）
export function getPostsByAuthor(name: string): WeiboPost[] { return getPosts().filter(p => p.author === name); }

// ==================== 超话 / CP 超话 ====================
export function getSupers(): WeiboSuperTopic[] { return (read().supers || []).slice().sort((a, b) => (b.posts || 0) - (a.posts || 0)); }
export function getSuper(id: string): WeiboSuperTopic | undefined { return (read().supers || []).find(s => s.id === id); }
export function upsertSupers(items: { name: string; kind?: 'star' | 'cp' | 'topic'; desc?: string; posts?: number }[]): void {
  const d = read();
  const list = (d.supers ||= []);
  for (const it of items) {
    if (!it.name || !it.name.trim()) continue;
    const name = it.name.trim();
    const ex = list.find(s => s.name === name);
    if (ex) { ex.kind = it.kind || ex.kind; ex.desc = it.desc ?? ex.desc; ex.posts = it.posts ?? ex.posts; }
    else list.push({ id: rid('sup'), name, kind: it.kind || 'topic', desc: it.desc, posts: it.posts ?? 0, followed: false, ts: Date.now() });
  }
  write(d);
}
export function toggleSuperFollow(id: string): boolean {
  const d = read();
  const s = (d.supers || []).find(x => x.id === id);
  if (!s) return false;
  s.followed = !s.followed;
  write(d);
  return !!s.followed;
}
// 生成本超话讨论后，把展示帖量往上抬（真实感：讨论越多帖量越大）。
export function bumpSuperPosts(id: string, delta: number): void {
  const d = read();
  const s = (d.supers || []).find(x => x.id === id);
  if (!s) return;
  s.posts = Math.max(0, (s.posts || 0) + delta);
  write(d);
}
export function deleteSuper(id: string): void {
  const d = read();
  d.supers = (d.supers || []).filter(s => s.id !== id);
  write(d);
}
