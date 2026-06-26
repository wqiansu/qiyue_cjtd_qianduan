// 世界套件 P0 · 微信数据层（wechat-store）
// 职责：微信 APP 的纯数据读写，落 _th_world_wechat_v1（单 blob）。不碰 DOM、不碰 generate。
//   - 会话 Chat：单聊(single)/群聊(group)，关联 contacts.ts 的联系人；每个 Chat 绑一条记忆会话(memory.ts)。
//   - 消息 Message：文本/图片/表情，发送方=联系人 id 或 'me'。
//   - 朋友圈 Moment：时间线动态 + 点赞 + 评论。
//   - 每会话设置 ChatSettings：读正文楼数 / 注入正文开关 / 群聊 AI 自选发言。
// 记忆 sessionId 约定：'wx_' + chatId（appId='wechat'），由 wechat.ts 在建会话时 ensureSession。
import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

export type WxMsgKind = 'text' | 'image' | 'sticker' | 'desc' | 'voice' | 'system';
export type WxMessage = {
  id: string;
  senderId: string;        // 联系人 id；玩家自己用 'me'
  kind: WxMsgKind;
  content: string;         // text：正文；image：图片描述/alt；sticker：表情名；desc：旁白/动作描述；voice：语音转文字；system：系统提示（如拍一拍）
  imageUrl?: string;       // image：comfyui 出图 URL（空=文字描述卡）；sticker：表情图 URL
  ts: number;
  recalled?: boolean;      // 撤回标记（保留占位行）
  voiceSec?: number;       // voice：语音条秒数（降级用文字呈现）
  replyToId?: string;      // 引用回复：被引用消息 id
  replyToText?: string;    // 引用回复：被引用消息摘要（落库快照，避免被删后丢失）
  replyToName?: string;    // 引用回复：被引用消息发送者名
};

export type WxChatKind = 'single' | 'group';
export type WxChatSettings = {
  readFloors: number;      // 读取酒馆正文楼数（0=不读）
  injectEnabled: boolean;  // 把本次交互摘要注入下次酒馆生成（默认关）
  groupAutoSpeaker: boolean; // 群聊：true=AI 自选发言角色；false=玩家每轮指定
  aiPresetName?: string;   // 可选指定 API 预设（空=跟随全局）
  multiSpeaker?: boolean;  // #9 群聊：一轮允许多位成员发言（默认 true）
  maxSpeakers?: number;    // #9 群聊：本轮最多几位发言（默认 3）
  maxBubbles?: number;     // #6 每位每轮最多几条气泡（默认单聊5/群聊3）
};
export type WxChat = {
  id: string;
  kind: WxChatKind;
  name: string;            // 单聊=联系人昵称；群聊=群名
  contactIds: string[];    // 参与的联系人（单聊 1 个；群聊多个）
  settings: WxChatSettings;
  lastText?: string;       // 列表预览
  lastAt: number;
  createdAt: number;
  unread?: number;         // 未读数（角色主动发来 / 玩家未进会话时累计；进会话清零）
  pinned?: boolean;        // 置顶
};

export type WxMomentComment = { id: string; authorId: string; text: string; ts: number };
export type WxMoment = {
  id: string;
  authorId: string;        // 联系人 id 或 'me'
  text: string;
  imageUrl?: string;
  ts: number;
  likes: string[];         // 点赞者 id 列表
  comments: WxMomentComment[];
};

export type WxSticker = { id: string; name: string; url?: string };

export type WechatData = {
  chats: WxChat[];
  messages: Record<string, WxMessage[]>; // chatId -> 消息列表
  moments: WxMoment[];
  stickers: WxSticker[];
};

// 预置表情（emoji 文本占位，玩家可加自定义图）
const BUILTIN_STICKERS: WxSticker[] = [
  { id: 'st_smile', name: '😊 微笑' }, { id: 'st_laugh', name: '😂 大笑' },
  { id: 'st_love', name: '😍 喜欢' }, { id: 'st_cry', name: '😭 大哭' },
  { id: 'st_shy', name: '😳 害羞' }, { id: 'st_angry', name: '😠 生气' },
  { id: 'st_ok', name: '👌 好的' }, { id: 'st_heart', name: '❤️ 爱心' },
];

function uid(p: string): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }
export function wxChatId(): string { return uid('wx'); }
export function wxSessionId(chatId: string): string { return 'wx_' + chatId; }

// MARK_STORE_IO

export function getWechatData(): WechatData {
  const raw = readWorldJson<Partial<WechatData>>(WORLD_LS_KEYS.wechat, {});
  return {
    chats: Array.isArray(raw.chats) ? raw.chats : [],
    messages: raw.messages && typeof raw.messages === 'object' ? raw.messages : {},
    moments: Array.isArray(raw.moments) ? raw.moments : [],
    stickers: Array.isArray(raw.stickers) && raw.stickers.length ? raw.stickers : BUILTIN_STICKERS.slice(),
  };
}
function saveWechatData(d: WechatData): void {
  writeWorldJson(WORLD_LS_KEYS.wechat, d);
}

export const DEFAULT_CHAT_SETTINGS: WxChatSettings = {
  readFloors: 0, injectEnabled: false, groupAutoSpeaker: true,
  multiSpeaker: true, maxSpeakers: 3, maxBubbles: 5,
};

// ==================== 会话 CRUD ====================
export function listChats(): WxChat[] {
  // 置顶优先，其余按最近活动倒序
  return getWechatData().chats.slice().sort((a, b) => {
    const pa = a.pinned ? 1 : 0, pb = b.pinned ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return b.lastAt - a.lastAt;
  });
}
export function getChat(chatId: string): WxChat | undefined {
  return getWechatData().chats.find(c => c.id === chatId);
}
export function createChat(opts: { kind: WxChatKind; name: string; contactIds: string[] }): WxChat {
  const d = getWechatData();
  const t = Date.now();
  const chat: WxChat = {
    id: wxChatId(), kind: opts.kind, name: opts.name, contactIds: opts.contactIds.slice(),
    settings: { ...DEFAULT_CHAT_SETTINGS }, lastAt: t, createdAt: t,
  };
  d.chats.push(chat);
  d.messages[chat.id] = [];
  saveWechatData(d);
  return chat;
}
export function updateChat(chatId: string, patch: Partial<Pick<WxChat, 'name' | 'contactIds'>>): void {
  const d = getWechatData();
  const c = d.chats.find(x => x.id === chatId); if (!c) return;
  if (patch.name != null) c.name = patch.name;
  if (patch.contactIds) c.contactIds = patch.contactIds.slice();
  saveWechatData(d);
}
export function updateChatSettings(chatId: string, patch: Partial<WxChatSettings>): void {
  const d = getWechatData();
  const c = d.chats.find(x => x.id === chatId); if (!c) return;
  c.settings = { ...c.settings, ...patch };
  saveWechatData(d);
}
export function deleteChat(chatId: string): void {
  const d = getWechatData();
  d.chats = d.chats.filter(c => c.id !== chatId);
  delete d.messages[chatId];
  saveWechatData(d);
}

// #未读红点：标记会话已读（进会话调用）；累加未读（角色主动发来时）；置顶切换；全部未读合计。
export function markChatRead(chatId: string): void {
  const d = getWechatData();
  const c = d.chats.find(x => x.id === chatId); if (!c || !c.unread) return;
  c.unread = 0; saveWechatData(d);
}
export function incChatUnread(chatId: string, n = 1): void {
  const d = getWechatData();
  const c = d.chats.find(x => x.id === chatId); if (!c) return;
  c.unread = (c.unread || 0) + n; saveWechatData(d);
}
export function toggleChatPin(chatId: string): void {
  const d = getWechatData();
  const c = d.chats.find(x => x.id === chatId); if (!c) return;
  c.pinned = !c.pinned; saveWechatData(d);
}
export function totalUnread(): number {
  return getWechatData().chats.reduce((s, c) => s + (c.unread || 0), 0);
}

// ==================== 消息 ====================
export function getMessages(chatId: string): WxMessage[] {
  return getWechatData().messages[chatId] || [];
}
export function appendMessage(chatId: string, msg: Omit<WxMessage, 'id' | 'ts'> & { ts?: number }): WxMessage {
  const d = getWechatData();
  if (!d.messages[chatId]) d.messages[chatId] = [];
  const full: WxMessage = { id: uid('m'), ts: msg.ts ?? Date.now(), ...msg };
  d.messages[chatId].push(full);
  const c = d.chats.find(x => x.id === chatId);
  if (c) {
    c.lastAt = full.ts;
    c.lastText = msg.kind === 'text' ? msg.content : msg.kind === 'image' ? '[图片]' : msg.kind === 'desc' ? '[描述]' : '[表情]';
  }
  saveWechatData(d);
  return full;
}
export function updateMessage(chatId: string, msgId: string, patch: Partial<WxMessage>): void {
  const d = getWechatData();
  const arr = d.messages[chatId]; if (!arr) return;
  const m = arr.find(x => x.id === msgId); if (!m) return;
  Object.assign(m, patch);
  saveWechatData(d);
}
export function deleteMessage(chatId: string, msgId: string): void {
  const d = getWechatData();
  const arr = d.messages[chatId]; if (!arr) return;
  d.messages[chatId] = arr.filter(x => x.id !== msgId);
  saveWechatData(d);
}

// ==================== 朋友圈 ====================
export function listMoments(): WxMoment[] {
  return getWechatData().moments.slice().sort((a, b) => b.ts - a.ts);
}
export function addMoment(m: Omit<WxMoment, 'id' | 'ts' | 'likes' | 'comments'> & { ts?: number }): WxMoment {
  const d = getWechatData();
  const full: WxMoment = { id: uid('mo'), ts: m.ts ?? Date.now(), likes: [], comments: [], authorId: m.authorId, text: m.text, imageUrl: m.imageUrl };
  d.moments.push(full);
  saveWechatData(d);
  return full;
}
export function deleteMoment(momentId: string): void {
  const d = getWechatData();
  d.moments = d.moments.filter(x => x.id !== momentId);
  saveWechatData(d);
}
export function toggleMomentLike(momentId: string, who: string): void {
  const d = getWechatData();
  const mo = d.moments.find(x => x.id === momentId); if (!mo) return;
  mo.likes = mo.likes.includes(who) ? mo.likes.filter(w => w !== who) : [...mo.likes, who];
  saveWechatData(d);
}
export function addMomentComment(momentId: string, authorId: string, text: string): void {
  const d = getWechatData();
  const mo = d.moments.find(x => x.id === momentId); if (!mo || !text.trim()) return;
  mo.comments.push({ id: uid('cm'), authorId, text: text.trim(), ts: Date.now() });
  saveWechatData(d);
}

// ==================== 表情 ====================
export function getStickers(): WxSticker[] { return getWechatData().stickers; }
export function addSticker(name: string, url?: string): void {
  const d = getWechatData();
  d.stickers.push({ id: uid('st'), name: name.trim() || '表情', url });
  saveWechatData(d);
}
export function deleteSticker(id: string): void {
  const d = getWechatData();
  d.stickers = d.stickers.filter(s => s.id !== id);
  saveWechatData(d);
}

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_wechat_store__ = {
    listChats, getChat, createChat, updateChat, updateChatSettings, deleteChat,
    getMessages, appendMessage, listMoments, addMoment, getStickers,
  };
} catch (e) { void e; }
