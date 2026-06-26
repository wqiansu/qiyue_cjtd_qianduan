// 世界套件 P1-B · 世界论坛数据层（forum-store.ts）
// 世界观内的论坛/贴吧：玩家建板块，角色/NPC 发帖回帖。
// 板块 → 帖子 → 楼层（回复）。数据纯本地 _th_world_forum_v1。
import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

// 楼层（回复）
export type ForumReply = {
  id: string;
  author: string;          // 发言者昵称（角色/NPC/玩家/路人）
  authorRef?: string;      // 关联联系人/角色键（可空，路人无）
  content: string;
  ts: number;
  likes: number;
  isAi?: boolean;          // 是否 AI 生成
};

// 主题帖
export type ForumPost = {
  id: string;
  boardId: string;
  title: string;
  author: string;
  authorRef?: string;
  content: string;
  ts: number;
  likes: number;
  hot?: boolean;           // 热帖（可触发正文联动）
  isAi?: boolean;
  replies: ForumReply[];
};

// 板块
export type ForumBoard = {
  id: string;
  name: string;            // 如「江湖传闻」「坊市交易」
  desc?: string;
  icon?: string;           // fa 图标名
  createdAt: number;
};

type ForumData = { boards: ForumBoard[]; posts: ForumPost[] };

function rid(p: string): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

function read(): ForumData {
  const d = readWorldJson<ForumData>(WORLD_LS_KEYS.forum, { boards: [], posts: [] });
  if (!d || typeof d !== 'object') return { boards: [], posts: [] };
  if (!Array.isArray(d.boards)) d.boards = [];
  if (!Array.isArray(d.posts)) d.posts = [];
  return d;
}
function write(d: ForumData): void { writeWorldJson(WORLD_LS_KEYS.forum, d); }

// ---------- 板块 ----------
export function getBoards(): ForumBoard[] { return read().boards; }
export function getBoard(id: string): ForumBoard | undefined { return read().boards.find(b => b.id === id); }

export function createBoard(p: { name: string; desc?: string; icon?: string }): ForumBoard {
  const d = read();
  const b: ForumBoard = { id: rid('bd'), name: p.name, desc: p.desc || '', icon: p.icon || 'fa-comments', createdAt: Date.now() };
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
  // 热帖优先，其次按时间倒序
  return list.slice().sort((a, b) => (b.hot ? 1 : 0) - (a.hot ? 1 : 0) || b.ts - a.ts);
}
export function getPost(id: string): ForumPost | undefined { return read().posts.find(p => p.id === id); }

export function createPost(p: Partial<ForumPost> & { boardId: string; title: string; author: string; content: string }): ForumPost {
  const d = read();
  const post: ForumPost = {
    id: p.id || rid('po'),
    boardId: p.boardId, title: p.title, author: p.author, authorRef: p.authorRef,
    content: p.content, ts: Date.now(), likes: 0, hot: !!p.hot, isAi: !!p.isAi, replies: [],
  };
  d.posts.push(post);
  write(d);
  return post;
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
  write(d);
}

// ---------- 楼层 ----------
export function addReply(postId: string, r: { author: string; authorRef?: string; content: string; isAi?: boolean }): ForumReply | undefined {
  const d = read();
  const p = d.posts.find(x => x.id === postId);
  if (!p) return undefined;
  const reply: ForumReply = { id: rid('rp'), author: r.author, authorRef: r.authorRef, content: r.content, ts: Date.now(), likes: 0, isAi: !!r.isAi };
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
