// 世界套件 · 世界论坛数据层（forum-store.ts）
// 世界观内的匿名民间论坛：玩家建板块，角色/NPC/路人匿名发帖回帖盖楼。
// 定位＝民间舆论场：世界演化的回声 + 吃瓜发酵地 + 造梗策源地 + 民间共识→世界书。
// 板块 → 帖子（多类型：普通/投票/悬赏/连载/爆料瓜） → 楼层（盖楼/楼中楼/对线）。
// 含：瓜的生命周期 / 投票 / 悬赏 / 精华墙 / 吧主治理 / 造梗黑话百科 / 生态浓度含网暴阀。
// 数据纯本地 _th_world_forum_v1。
import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

// 立场（盖楼时标注，驱动观点碰撞/对线）
export type ReplyStance = 'support' | 'oppose' | 'tease' | 'info' | 'neutral';

// 楼层（回复）
export type ForumReply = {
  id: string;
  author: string;          // 发言者昵称（角色/路人/匿名）
  authorRef?: string;      // 关联联系人/角色键（可空，路人无）
  anon?: boolean;          // 是否匿名发言
  content: string;
  replyTo?: string;        // 楼中楼：回复某昵称（可空）
  stance?: ReplyStance;    // 立场（对线/盖楼用）
  ts: number;
  likes: number;
  isAi?: boolean;          // 是否 AI 生成
  isMod?: boolean;         // 吧主/官方发言
  reported?: boolean;      // 被举报（挂人/网暴治理）
};

// 帖子类型：普通 / 投票 / 悬赏求助 / 连载楼主 / 爆料瓜（有生命周期）
export type PostType = 'normal' | 'vote' | 'bounty' | 'serial' | 'expose';

// 瓜的生命周期阶段
export type GossipStage = 'seed' | 'ferment' | 'peak' | 'twist' | 'settle';
export const GOSSIP_STAGES: { key: GossipStage; label: string; icon: string }[] = [
  { key: 'seed', label: '爆料', icon: 'fa-seedling' },
  { key: 'ferment', label: '发酵', icon: 'fa-fire' },
  { key: 'peak', label: '高潮', icon: 'fa-fire-flame-curved' },
  { key: 'twist', label: '反转', icon: 'fa-rotate' },
  { key: 'settle', label: '定论', icon: 'fa-gavel' },
];

// 投票选项
export type PollOption = { text: string; votes: number };

// 连载帖·单章
export type SerialChapter = { idx: number; title?: string; content: string; ts: number };

// 主题帖
export type ForumPost = {
  id: string;
  boardId: string;
  title: string;
  author: string;
  authorRef?: string;
  anon?: boolean;          // 楼主是否匿名
  content: string;
  ts: number;
  likes: number;
  userLiked?: boolean;     // 玩家亲手点过赞（区别于 AI 初始随机赞，用于覆盖刷新时保留）
  hot?: boolean;           // 热帖（可触发正文联动）
  essence?: boolean;       // 精华/加精（进精华墙）
  pinned?: boolean;        // 吧主置顶
  locked?: boolean;        // 吧主锁帖（不可再盖楼）
  isAi?: boolean;
  postType?: PostType;     // 帖子类型（默认 normal）
  poll?: { options: PollOption[]; voted?: number };   // 投票帖
  bounty?: { reward: string; solved?: boolean; answer?: string };  // 悬赏帖
  gossip?: { stage: GossipStage; tracking?: boolean };  // 爆料瓜的生命周期
  serial?: { chapters: SerialChapter[]; urge: number; completed?: boolean };  // 连载帖：章节列表 + 催更数 + 是否完结
  replies: ForumReply[];
  metadata?: any;          // 板块类型专属（赛事:比分/MVP/轮次；报纸:期号/栏目文章）
};

// 板块类型：普通论坛 / 赛事战报 / 报纸 / 榜单评分 / 问答知乎体
export type BoardType = 'forum' | 'match' | 'news' | 'rank' | 'qa';

// 板块
export type ForumBoard = {
  id: string;
  name: string;            // 如「八卦茶话室」「偶像打榜区」
  desc?: string;
  icon?: string;           // fa 图标名
  type?: BoardType;        // 默认 forum
  prompt?: string;         // 板块专属补充提示词（可空）
  moderator?: string;      // 吧主昵称（可空）
  rules?: string;          // 版规（可空）
  createdAt: number;
};

// 黑话/梗百科条目（造梗沉淀）
export type ForumMeme = {
  id: string;
  word: string;            // 热词/梗
  meaning: string;         // 含义/出处
  heat: number;            // 热度
  ts: number;
};

// 论坛设置（对标其他 app：上下文/世界书/注入/生态浓度含网暴阀/自动触发/主题字体）
export type ForumSettings = {
  useFloors: boolean;
  floorCount: number;
  useWorldbook: boolean;
  worldbookEntryKeys: string[];
  autoInterval: number;        // 每 N 楼自动生成一批新帖，0=关
  lastFloor: number;           // 上次自动触发时的楼层
  injectToChat: boolean;       // 把热帖注入正文（带 <luntan> 隔离标签）
  decentralized: boolean;      // 去中心化模式（大部分帖子与主角无关）
  theme: string;               // 视觉主题 key
  font: string;                // 字体 key
  // —— 生态浓度（0-200 五档，通用化读取，不写死提示词）——
  ecoActivity: number;         // 论坛活跃度（一批发几帖、盖几楼的热闹程度）
  ecoGossip: number;           // 吃瓜/八卦浓度（爆料/暧昧/争宠瓜的密度）
  ecoToxic: number;            // 网暴/挂人/对线烈度（★可调阀：默认低=良性玩闹，拉高=真实修罗场）
  ecoMeme: number;             // 玩梗/造梗浓度（黑话/抽象话/梗的密度）
  ecoErotic: number;           // 色情度（露骨擦边程度）
  ecoCarnal: number;           // 肉欲度（肉体诱惑表现强度）
  antiSpoiler: boolean;        // 防剧透
  blockWords: string[];        // 屏蔽词
  // —— 造梗沉淀开关 ——
  autoMeme: boolean;           // 盖楼时自动沉淀热词到黑话百科
};
export const DEFAULT_FORUM_SETTINGS: ForumSettings = {
  useFloors: true, floorCount: 6, useWorldbook: true, worldbookEntryKeys: [],
  autoInterval: 0, lastFloor: 0,
  injectToChat: false, decentralized: true, theme: 'fairy', font: 'system',
  ecoActivity: 60, ecoGossip: 70, ecoToxic: 25, ecoMeme: 55, ecoErotic: 30, ecoCarnal: 35,
  antiSpoiler: true, blockWords: [], autoMeme: true,
};

type ForumData = {
  boards: ForumBoard[];
  posts: ForumPost[];
  memes?: ForumMeme[];
  settings?: ForumSettings;
};

function rid(p: string): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

function read(): ForumData {
  const d = readWorldJson<ForumData>(WORLD_LS_KEYS.forum, { boards: [], posts: [] });
  if (!d || typeof d !== 'object') return { boards: [], posts: [], memes: [] };
  if (!Array.isArray(d.boards)) d.boards = [];
  if (!Array.isArray(d.posts)) d.posts = [];
  if (!Array.isArray(d.memes)) d.memes = [];
  return d;
}
function write(d: ForumData): void { writeWorldJson(WORLD_LS_KEYS.forum, d); }

// ---------- 板块 ----------
export function getBoards(): ForumBoard[] { return read().boards; }
export function getBoard(id: string): ForumBoard | undefined { return read().boards.find(b => b.id === id); }

export function createBoard(p: { name: string; desc?: string; icon?: string; type?: BoardType; prompt?: string; moderator?: string; rules?: string }): ForumBoard {
  const d = read();
  const b: ForumBoard = {
    id: rid('bd'), name: p.name, desc: p.desc || '', icon: p.icon || 'fa-comments',
    type: p.type || 'forum', prompt: p.prompt || '', moderator: p.moderator || '', rules: p.rules || '', createdAt: Date.now(),
  };
  d.boards.push(b);
  write(d);
  return b;
}
export function updateBoard(id: string, patch: Partial<Omit<ForumBoard, 'id' | 'createdAt'>>): void {
  const d = read();
  const i = d.boards.findIndex(b => b.id === id);
  if (i < 0) return;
  d.boards[i] = { ...d.boards[i], ...patch };
  write(d);
}
export function deleteBoard(id: string): void {
  const d = read();
  d.boards = d.boards.filter(b => b.id !== id);
  d.posts = d.posts.filter(p => p.boardId !== id);  // 连带删帖
  write(d);
}

// ---------- 帖子 ----------
export function getPosts(boardId?: string): ForumPost[] {
  const posts = read().posts;
  const list = boardId ? posts.filter(p => p.boardId === boardId) : posts;
  // 置顶 > 热帖 > 时间倒序
  return list.slice().sort((a, b) =>
    (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.hot ? 1 : 0) - (a.hot ? 1 : 0) || b.ts - a.ts);
}
export function getPost(id: string): ForumPost | undefined { return read().posts.find(p => p.id === id); }
// 精华墙：全站或某板块的加精帖
export function getEssencePosts(boardId?: string): ForumPost[] {
  return getPosts(boardId).filter(p => p.essence);
}
// 追瓜列表：正在追踪的爆料瓜
export function getTrackingGossip(): ForumPost[] {
  return read().posts.filter(p => p.postType === 'expose' && p.gossip?.tracking).sort((a, b) => b.ts - a.ts);
}

export function createPost(p: Partial<ForumPost> & { boardId: string; title: string; author: string; content: string }): ForumPost {
  const d = read();
  const post: ForumPost = {
    id: p.id || rid('po'),
    boardId: p.boardId, title: p.title, author: p.author, authorRef: p.authorRef, anon: !!p.anon,
    // 允许铺帖时带入初始点赞数与自定义时间戳（营造已有热度的论坛氛围）
    content: p.content, ts: typeof p.ts === 'number' ? p.ts : Date.now(), likes: typeof p.likes === 'number' ? p.likes : 0, hot: !!p.hot, essence: !!p.essence,
    pinned: !!p.pinned, locked: !!p.locked, isAi: !!p.isAi,
    postType: p.postType || 'normal', poll: p.poll, bounty: p.bounty, gossip: p.gossip,
    replies: [], metadata: p.metadata,
  };
  d.posts.push(post);
  write(d);
  return post;
}
// 覆盖刷新——清掉某板块（或全部）AI 生成的路人帖，保留玩家自己发的/点过赞/加过精/置顶的帖。
export function clearBoardAiPosts(boardId?: string): number {
  const d = read();
  const before = d.posts.length;
  d.posts = d.posts.filter(p => {
    const inScope = !boardId || p.boardId === boardId;
    if (!inScope) return true;
    // 保留：非 AI 帖、玩家加精/置顶的、被追的瓜、有玩家互动痕迹（亲手点赞 / 亲自回过帖）
    if (!p.isAi) return true;
    if (p.essence || p.pinned) return true;
    if (p.gossip?.tracking) return true;
    if (p.userLiked) return true;
    if (p.replies?.some(r => !r.isAi)) return true;
    return false;
  });
  write(d);
  return before - d.posts.length;
}
export function updatePost(id: string, patch: Partial<Omit<ForumPost, 'id' | 'replies'>>): void {
  const d = read();
  const i = d.posts.findIndex(p => p.id === id);
  if (i < 0) return;
  d.posts[i] = { ...d.posts[i], ...patch } as ForumPost;
  write(d);
}
export function deletePost(id: string): void {
  const d = read();
  d.posts = d.posts.filter(p => p.id !== id);
  write(d);
}
export function togglePostLike(id: string): void {
  const d = read();
  const p = d.posts.find(x => x.id === id);
  if (!p) return;
  p.likes = (p.likes || 0) + 1;
  p.userLiked = true;
  write(d);
}
// 连载帖：追加一章（返回新章序号；玩家更新时也算「玩家互动」，避免被覆盖刷新清掉）
export function addSerialChapter(id: string, ch: { title?: string; content: string }): number {
  const d = read();
  const p = d.posts.find(x => x.id === id); if (!p) return 0;
  p.serial ||= { chapters: [], urge: 0 };
  const idx = p.serial.chapters.length + 1;
  p.serial.chapters.push({ idx, title: ch.title, content: ch.content, ts: Date.now() });
  p.userLiked = true;
  write(d);
  return idx;
}
// 连载帖：催更 +1（玩家动作）
export function urgeSerial(id: string): void {
  const d = read();
  const p = d.posts.find(x => x.id === id); if (!p) return;
  p.serial ||= { chapters: [], urge: 0 };
  p.serial.urge = (p.serial.urge || 0) + 1;
  p.userLiked = true;
  write(d);
}
// 连载帖：切换完结状态
export function toggleSerialComplete(id: string): void {
  const d = read();
  const p = d.posts.find(x => x.id === id); if (!p || !p.serial) return;
  p.serial.completed = !p.serial.completed;
  write(d);
}
// 投票
export function votePoll(postId: string, optIndex: number): void {
  const d = read();
  const p = d.posts.find(x => x.id === postId);
  if (!p || !p.poll || !p.poll.options[optIndex]) return;
  if (typeof p.poll.voted === 'number') return;  // 已投过
  p.poll.options[optIndex].votes = (p.poll.options[optIndex].votes || 0) + 1;
  p.poll.voted = optIndex;
  write(d);
}
// 推进瓜的生命周期阶段
export function advanceGossip(postId: string, stage: GossipStage): void {
  const d = read();
  const p = d.posts.find(x => x.id === postId);
  if (!p) return;
  p.gossip = { ...(p.gossip || { tracking: true }), stage };
  write(d);
}
export function toggleGossipTracking(postId: string): void {
  const d = read();
  const p = d.posts.find(x => x.id === postId);
  if (!p) return;
  p.gossip = { stage: p.gossip?.stage || 'seed', tracking: !p.gossip?.tracking };
  write(d);
}

// ---------- 楼层 ----------
export function addReply(postId: string, r: { author: string; authorRef?: string; anon?: boolean; content: string; replyTo?: string; stance?: ReplyStance; isAi?: boolean; isMod?: boolean }): ForumReply | undefined {
  const d = read();
  const p = d.posts.find(x => x.id === postId);
  if (!p) return undefined;
  if (p.locked) return undefined;  // 锁帖不可盖楼
  const reply: ForumReply = {
    id: rid('rp'), author: r.author, authorRef: r.authorRef, anon: !!r.anon, content: r.content,
    replyTo: r.replyTo, stance: r.stance, ts: Date.now(), likes: 0, isAi: !!r.isAi, isMod: !!r.isMod,
  };
  p.replies.push(reply);
  write(d);
  return reply;
}
export function deleteReply(postId: string, replyId: string): void {
  const d = read();
  const p = d.posts.find(x => x.id === postId);
  if (!p) return;
  p.replies = p.replies.filter(r => r.id !== replyId);
  write(d);
}
export function toggleReplyLike(postId: string, replyId: string): void {
  const d = read();
  const p = d.posts.find(x => x.id === postId);
  if (!p) return;
  const r = p.replies.find(x => x.id === replyId);
  if (!r) return;
  r.likes = (r.likes || 0) + 1;
  write(d);
}
export function toggleReplyReported(postId: string, replyId: string): void {
  const d = read();
  const p = d.posts.find(x => x.id === postId);
  if (!p) return;
  const r = p.replies.find(x => x.id === replyId);
  if (!r) return;
  r.reported = !r.reported;
  write(d);
}

// ---------- 黑话/梗百科 ----------
export function getMemes(): ForumMeme[] { return (read().memes || []).slice().sort((a, b) => b.heat - a.heat || b.ts - a.ts); }
export function addMeme(word: string, meaning: string): ForumMeme | undefined {
  const w = (word || '').trim();
  if (!w) return undefined;
  const d = read();
  const existing = (d.memes || []).find(m => m.word === w);
  if (existing) { existing.heat = (existing.heat || 0) + 1; if (meaning) existing.meaning = meaning; write(d); return existing; }
  const meme: ForumMeme = { id: rid('mm'), word: w, meaning: (meaning || '').trim(), heat: 1, ts: Date.now() };
  (d.memes ||= []).unshift(meme);
  if (d.memes.length > 200) d.memes = d.memes.slice(0, 200);
  write(d);
  return meme;
}
export function deleteMeme(id: string): void {
  const d = read();
  d.memes = (d.memes || []).filter(m => m.id !== id);
  write(d);
}

// ---------- 设置 / 数据管理 ----------
export function getForumSettings(): ForumSettings {
  const d = read();
  return { ...DEFAULT_FORUM_SETTINGS, ...(d.settings || {}) };
}
export function updateForumSettings(patch: Partial<ForumSettings>): ForumSettings {
  const d = read();
  d.settings = { ...DEFAULT_FORUM_SETTINGS, ...(d.settings || {}), ...patch };
  write(d);
  return d.settings;
}
// 清空板块与帖子，但保留设置/梗百科
export function clearAll(): void {
  const d = read();
  write({ boards: [], posts: [], memes: d.memes, settings: d.settings });
}
