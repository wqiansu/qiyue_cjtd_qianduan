// 微信数据层：纯数据读写，落 _th_world_wechat_v1（单 blob）。不碰 DOM、不碰 generate。
// 记忆 sessionId 约定：'wx_' + chatId（appId='wechat'），由 wechat.ts 在建会话时 ensureSession。
import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

export type WxMsgKind = 'text' | 'image' | 'sticker' | 'desc' | 'voice' | 'system' | 'transfer' | 'redpacket' | 'location' | 'call';
export type WxMessage = {
  id: string;
  senderId: string;        // 联系人 id；玩家自己用 'me'
  kind: WxMsgKind;
  content: string;         // text：正文；image：图片描述/alt；sticker：表情名；desc：旁白/动作描述；voice：语音转文字；system：系统提示（如拍一拍）；transfer/redpacket：备注/留言；location：地点名；call：通话状态文案
  imageUrl?: string;       // image：comfyui 出图 URL（空=文字描述卡）；sticker：表情图 URL
  ts: number;
  recalled?: boolean;      // 撤回标记（保留占位行）
  voiceSec?: number;       // voice：语音条秒数（降级用文字呈现）
  amount?: number;         // transfer/redpacket：金额（元）
  claimed?: boolean;       // transfer/redpacket：对方是否已收下（点击领取后置 true）
  returned?: boolean;      // transfer/redpacket：对方是否退回（AI [退回转账/红包] 置 true）
  imgTags?: string;        // image：英文 NAI tags（出图用，降级时不显示）
  replyToId?: string;      // 引用回复：被引用消息 id
  replyToText?: string;    // 引用回复：被引用消息摘要（落库快照，避免被删后丢失）
  replyToName?: string;    // 引用回复：被引用消息发送者名
  inner?: string;          // [内心]：未说出口的独白，附在普通消息下方
  locAddr?: string;        // location：详细地址（content 为地点标题）
  callKind?: 'voice' | 'video'; // call：语音/视频
  callInvite?: boolean;    // call：AI 发起的通话邀请（等「我」点接听→跳通话 app）
  callDur?: number;        // call：通话时长秒（0=未接/取消）
  callStatus?: 'answered' | 'missed' | 'canceled' | 'rejected'; // call：通话结果
};

export type WxChatKind = 'single' | 'group';
export type WxChatSettings = {
  readFloors: number;      // 读取酒馆正文楼数（0=不读）
  injectEnabled: boolean;  // 把本次交互摘要注入下次酒馆生成（默认关）
  groupAutoSpeaker: boolean; // 群聊：true=AI 自选发言角色；false=玩家每轮指定
  aiPresetName?: string;   // 可选指定 API 预设（空=跟随全局）
  multiSpeaker?: boolean;  // 群聊：一轮允许多位成员发言（默认 true）
  maxSpeakers?: number;    // 群聊：本轮最多几位发言（默认 3）
  maxBubbles?: number;     // 每位每轮最多几条气泡（默认单聊5/群聊3）
  callMe?: string;         // 角色对「我」的称呼（覆盖，空=按人设自由称呼）
  mood?: string;           // 角色当下心情/处境（注入本会话生成，玩家可临时设定）
  groupVibe?: string;      // 群聊：群氛围/群规设定（如「仙宫日常吐槽群」）
  readReceipt?: boolean;   // 已读回执：开则你发的消息会显示「已读」（制造已读不回张力）
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
  affinity?: number;       // 关系值（单聊：与对方的亲密度 0~100；群聊不用）。影响 AI 回复语气。
  muted?: boolean;         // 消息免打扰（不计入未读红点的强提醒）
};

export type WxMomentComment = { id: string; authorId: string; text: string; ts: number; replyToName?: string };
export type WxMoment = {
  id: string;
  authorId: string;        // 联系人 id 或 'me'
  text: string;
  imageUrl?: string;
  ts: number;
  likes: string[];         // 点赞者 id 列表
  comments: WxMomentComment[];
};

export type WxSticker = { id: string; name: string; url?: string; desc?: string };

// 玩家个人资料：昵称/头像/签名/微信号/形象 tag
export type WxUserInfo = {
  name: string;            // 昵称（空=默认「我」）
  avatar?: string;         // 头像 URL/base64（空=首字占位）
  signature?: string;      // 个性签名
  wxid?: string;           // 微信号（自动生成 wxid_xxx）
  naiTags?: string;        // 用户固定形象 NAI tags（生成「用户照片」时拼前缀）
};

// 微信全局设置
export type WxSettings = {
  useWorldbook: boolean;      // 上下文注入世界书总开关
  worldbookIds: string[];     // [兼容旧数据] 整本绑定的世界书名
  worldbookEntryKeys?: string[]; // 条目级选择 `${book} ${entry}`，优先于 worldbookIds
  chatBg?: string;            // 聊天背景：URL 或预设关键字（dream/star/dark…）
  bubbleCss?: string;         // 自定义气泡/头像框 CSS
  // —— 与微博对齐的横切设置 ——
  syncEnabled?: boolean;      // 同步总开关：关闭后任何「同步到世界书」都不发生（含 maybeInject）
  memoryEnabled?: boolean;    // 会话记忆开关：关闭后生成不带历史摘要上下文
  readFloorsGlobal?: number;  // 全局参考正文楼层数（新建会话默认值）
  timelineMode?: 'real' | 'world'; // 时间线：真实时间 / 世界时间
  worldAnchorText?: string;   // 玩家手填/校正的当前世界时间锚点
  worldAnchorTs?: number;     // 设定锚点时的真实时间戳
  affinityAffects?: boolean;  // 关系值是否影响回复语气（默认开）
  // 主动消息
  proactiveEnabled?: boolean; // 角色主动找你总开关
  proactiveLastFloor?: number;// 上次主动触发时的楼层
  // 隐私
  readReceiptDefault?: boolean; // 新会话默认是否开已读回执
  recallVisible?: boolean;    // 对方撤回后，是否仍让你看到被撤回内容（小字）
  momentsVisibleDays?: number;// 我的朋友圈仅最近 N 天可见（0=全部可见）
  injectMsgCount?: number;    // 注入/写世界书时，每个会话取最近多少条消息（默认 12）
  // 自动触发
  autoEnabled?: boolean;      // 楼层自动触发（主动消息/朋友圈刷新）
  autoInterval?: number;      // 间隔层数
  lastFloor?: number;         // 上次记录楼层
};

// 钱包（单卡世界用全局单值，不按会话拆）
export type WxWallet = {
  balance: number;            // 微信零钱余额
  evaluated: boolean;         // 是否已做过 AI 资产评估
  report?: string;            // 最近一次 AI 评估报告文本
};

export type WechatData = {
  chats: WxChat[];
  messages: Record<string, WxMessage[]>; // chatId -> 消息列表
  moments: WxMoment[];
  stickers: WxSticker[];
  userInfo: WxUserInfo;
  settings: WxSettings;
  wallet: WxWallet;
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

export const DEFAULT_USER_INFO: WxUserInfo = { name: '', avatar: '', signature: '', wxid: '', naiTags: '' };
export const DEFAULT_WX_SETTINGS: WxSettings = {
  useWorldbook: false, worldbookIds: [], chatBg: '', bubbleCss: '',
  syncEnabled: false, memoryEnabled: true, readFloorsGlobal: 0,   // 世界书同步默认关，防止玩家不知情时往角色卡世界书注入大量 token
  timelineMode: 'world', worldAnchorText: '', worldAnchorTs: 0, affinityAffects: true,
  proactiveEnabled: true, proactiveLastFloor: 0,
  readReceiptDefault: true, recallVisible: false, momentsVisibleDays: 0, injectMsgCount: 12,
  autoEnabled: false, autoInterval: 20, lastFloor: 0,
};
export const DEFAULT_WALLET: WxWallet = { balance: 0, evaluated: false, report: '' };

// MARK_STORE_IO

export function getWechatData(): WechatData {
  const raw = readWorldJson<Partial<WechatData>>(WORLD_LS_KEYS.wechat, {});
  const ui = (raw.userInfo && typeof raw.userInfo === 'object') ? raw.userInfo : {};
  const st = (raw.settings && typeof raw.settings === 'object') ? raw.settings : {};
  const wl = (raw.wallet && typeof raw.wallet === 'object') ? raw.wallet : {};
  return {
    chats: Array.isArray(raw.chats) ? raw.chats : [],
    messages: raw.messages && typeof raw.messages === 'object' ? raw.messages : {},
    moments: Array.isArray(raw.moments) ? raw.moments : [],
    stickers: Array.isArray(raw.stickers) && raw.stickers.length ? raw.stickers : BUILTIN_STICKERS.slice(),
    userInfo: { ...DEFAULT_USER_INFO, ...ui },
    settings: { ...DEFAULT_WX_SETTINGS, ...st },
    wallet: { ...DEFAULT_WALLET, ...wl },
  };
}
function saveWechatData(d: WechatData): void {
  writeWorldJson(WORLD_LS_KEYS.wechat, d);
}

export const DEFAULT_CHAT_SETTINGS: WxChatSettings = {
  readFloors: 0, injectEnabled: false, groupAutoSpeaker: true,
  multiSpeaker: true, maxSpeakers: 3, maxBubbles: 5, readReceipt: true,
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
  const g = d.settings || {};
  // 新会话默认值：读取全局「默认参考楼层 / 默认已读回执」（兑现设置项）
  const seeded: WxChatSettings = {
    ...DEFAULT_CHAT_SETTINGS,
    readFloors: typeof g.readFloorsGlobal === 'number' ? g.readFloorsGlobal : DEFAULT_CHAT_SETTINGS.readFloors,
    readReceipt: typeof g.readReceiptDefault === 'boolean' ? g.readReceiptDefault : DEFAULT_CHAT_SETTINGS.readReceipt,
  };
  const chat: WxChat = {
    id: wxChatId(), kind: opts.kind, name: opts.name, contactIds: opts.contactIds.slice(),
    settings: seeded, lastAt: t, createdAt: t,
  };
  d.chats.push(chat);
  d.messages[chat.id] = [];
  saveWechatData(d);
  return chat;
}
export function updateChat(chatId: string, patch: Partial<Pick<WxChat, 'name' | 'contactIds' | 'affinity' | 'muted'>>): void {
  const d = getWechatData();
  const c = d.chats.find(x => x.id === chatId); if (!c) return;
  if (patch.name != null) c.name = patch.name;
  if (patch.contactIds) c.contactIds = patch.contactIds.slice();
  if (patch.affinity != null) c.affinity = Math.max(0, Math.min(100, patch.affinity));
  if (patch.muted != null) c.muted = patch.muted;
  saveWechatData(d);
}
// 关系值增减（夹在 0~100）。AI 回复后按互动语气微调。
export function bumpAffinity(chatId: string, delta: number): number {
  const d = getWechatData();
  const c = d.chats.find(x => x.id === chatId); if (!c) return 0;
  c.affinity = Math.max(0, Math.min(100, (c.affinity ?? 50) + delta));
  saveWechatData(d);
  return c.affinity;
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
    c.lastText = msg.kind === 'text' ? msg.content
      : msg.kind === 'image' ? '[图片]'
      : msg.kind === 'desc' ? '[描述]'
      : msg.kind === 'voice' ? '[语音]'
      : msg.kind === 'transfer' ? '[转账]'
      : msg.kind === 'redpacket' ? '[红包]'
      : msg.kind === 'location' ? '[位置]'
      : msg.kind === 'call' ? '[通话]'
      : msg.kind === 'system' ? msg.content
      : '[表情]';
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
export function addMomentComment(momentId: string, authorId: string, text: string, replyToName?: string): void {
  const d = getWechatData();
  const mo = d.moments.find(x => x.id === momentId); if (!mo || !text.trim()) return;
  mo.comments.push({ id: uid('cm'), authorId, text: text.trim(), ts: Date.now(), replyToName: replyToName?.trim() || undefined });
  saveWechatData(d);
}

// ==================== 表情 ====================
export function getStickers(): WxSticker[] { return getWechatData().stickers; }
export function addSticker(name: string, url?: string, desc?: string): void {
  const d = getWechatData();
  d.stickers.push({ id: uid('st'), name: name.trim() || '表情', url, desc });
  saveWechatData(d);
}
export function deleteSticker(id: string): void {
  const d = getWechatData();
  d.stickers = d.stickers.filter(s => s.id !== id);
  saveWechatData(d);
}

// ==================== 个人资料 / 设置 / 钱包 ====================
export function getUserInfo(): WxUserInfo {
  const ui = getWechatData().userInfo;
  // 微信号缺省自动生成一次（落库）
  if (!ui.wxid) {
    const wxid = 'wxid_' + Math.random().toString(36).slice(2, 10);
    updateUserInfo({ wxid });
    return { ...ui, wxid };
  }
  return ui;
}
export function userDisplayName(): string {
  return getWechatData().userInfo.name?.trim() || '我';
}
export function updateUserInfo(patch: Partial<WxUserInfo>): void {
  const d = getWechatData();
  d.userInfo = { ...d.userInfo, ...patch };
  saveWechatData(d);
}
export function getWxSettings(): WxSettings {
  return getWechatData().settings;
}
export function updateWxSettings(patch: Partial<WxSettings>): void {
  const d = getWechatData();
  d.settings = { ...d.settings, ...patch };
  saveWechatData(d);
}
export function getWallet(): WxWallet {
  return getWechatData().wallet;
}
export function updateWallet(patch: Partial<WxWallet>): void {
  const d = getWechatData();
  d.wallet = { ...d.wallet, ...patch };
  saveWechatData(d);
}

// ==================== 数据管理 ====================
export function clearAllChats(): void {
  const d = getWechatData();
  d.chats = []; d.messages = {};
  saveWechatData(d);
}
export function clearAllMoments(): void {
  const d = getWechatData();
  d.moments = [];
  saveWechatData(d);
}
export function resetAllWechat(): void {
  writeWorldJson(WORLD_LS_KEYS.wechat, {
    chats: [], messages: {}, moments: [], stickers: BUILTIN_STICKERS.slice(),
    userInfo: { ...DEFAULT_USER_INFO }, settings: { ...DEFAULT_WX_SETTINGS }, wallet: { ...DEFAULT_WALLET },
  });
}

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_wechat_store__ = {
    listChats, getChat, createChat, updateChat, updateChatSettings, deleteChat,
    getMessages, appendMessage, listMoments, addMoment, getStickers,
  };
} catch (e) { void e; }
