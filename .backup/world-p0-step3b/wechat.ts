// 世界套件 P0-A · 微信（wechat）
// 定位：和角色聊天互动的核心 APP。视觉仿微信（绿主题，覆盖糖果粉基元）。
//   聊天列表 / 单聊气泡 / 群聊（AI 自选或玩家指定发言）/ 通讯录 / 朋友圈 / 聊天设置。
//   单聊走 ai-chat.sessionReply，群聊走 groupReply；发图走 media.tryGenImage（可降级）；
//   记忆走 memory.ts（每会话 wx_<chatId>），APP 内「记忆」按钮 → openSessionMemory。
//   注入正文 / 读正文 为每会话独立可控开关（默认关）。
// 跨窗口：data 属性 + 委托；命令式 innerHTML + openModal2 replace；AI 调用串行（_busy）。
import { esc, qs } from '../../lib/dom-utils';
import { openModal2 } from '../../status-bar-init';
import { iconHtml } from '../../lib/icons';
import {
  registerWorldApp,
} from '../../lib/world/world-store';
import {
  getContacts, getContact, importPersonaContact, upsertContact, deleteContact, type WorldContact,
} from '../../lib/world/contacts';
import { getPersonaList } from '../../lib/ai-summary-store';
import {
  listChats, getChat, createChat, updateChatSettings, deleteChat,
  getMessages, appendMessage, updateMessage, deleteMessage,
  listMoments, addMoment, deleteMoment, toggleMomentLike, addMomentComment,
  getStickers, addSticker, deleteSticker,
  wxSessionId, type WxChat, type WxMessage,
} from '../../lib/world/wechat-store';
import { ensureSession } from '../../lib/world/memory';
import { sessionReply, groupReply, injectWorldOnce, chatGenerate } from '../../lib/world/ai-chat';
import { tryGenImage, isImageBackendReady } from '../../lib/world/media';
import { openSessionMemory } from './memory-center';

const WX_MODAL_MAXW = 'min(900px,96vw)';
let _busy = false;

function toast(kind: 'success' | 'error' | 'info' | 'warning', msg: string): void {
  try { (window as any).toastr?.[kind]?.(msg); } catch (e) { void e; }
}
function ask(msg: string, def = ''): string | null {
  try { const v = (window as any).prompt?.(msg, def); return v == null ? null : String(v); } catch (e) { void e; return null; }
}
function confirmBox(msg: string): boolean {
  try { return !!(window as any).confirm?.(msg); } catch (e) { void e; return false; }
}

// MARK_HELPERS

// 头像：有 url 用图，无则取昵称首字（玩家用「我」）。
function avatarHtml(name: string, url?: string, cls = ''): string {
  if (url) return `<span class="th-wx-avatar ${cls}" style="background-image:url('${esc(url)}')"></span>`;
  const ch = (name || '?').trim().charAt(0) || '?';
  return `<span class="th-wx-avatar th-wx-avatar-txt ${cls}">${esc(ch)}</span>`;
}
// 联系人显示名
function contactName(id: string): string {
  if (id === 'me') return '我';
  return getContact(id)?.name || '未知';
}
function contactAvatar(id: string): string {
  if (id === 'me') return avatarHtml('我');
  const c = getContact(id);
  return avatarHtml(c?.name || '?', c?.avatar);
}
// 群成员设定（拼 groupReply 用）
function groupMembers(chat: WxChat): { name: string; persona: string }[] {
  return chat.contactIds.map(id => getContact(id)).filter(Boolean).map(c => ({
    name: (c as WorldContact).name,
    persona: (c as WorldContact).persona || (c as WorldContact).name,
  }));
}

// MARK_LIST

// ==================== 聊天列表（首页）====================
function renderListHtml(): string {
  const chats = listChats();
  const rows = chats.length ? chats.map(c => `
    <button class="th-wx-chat-row" data-wx-open="${esc(c.id)}" type="button">
      ${c.kind === 'group' ? avatarHtml(c.name, undefined, 'th-wx-avatar-group') : contactAvatar(c.contactIds[0] || '')}
      <span class="th-wx-chat-mid">
        <span class="th-wx-chat-name">${esc(c.name)} ${c.kind === 'group' ? `<span class="th-wx-chat-tag">群 ${c.contactIds.length}</span>` : ''}</span>
        <span class="th-wx-chat-last">${esc(c.lastText || '')}</span>
      </span>
    </button>`).join('')
    : `<div class="th-wx-empty">${iconHtml('fa-comment-dots')}<div>还没有会话</div>
        <div class="th-wx-empty-sub">点右上「+」发起单聊或群聊</div></div>`;
  return `<div class="th-wx" data-wx-root>
    <div class="th-wx-tabbar">
      <button class="th-wx-tab th-wx-tab-on" data-wx-tab="chats" type="button">${iconHtml('fa-comment-dots')} 聊天</button>
      <button class="th-wx-tab" data-wx-tab="contacts" type="button">${iconHtml('fa-id-card')} 通讯录</button>
      <button class="th-wx-tab" data-wx-tab="moments" type="button">${iconHtml('fa-camera')} 朋友圈</button>
      <button class="th-wx-tab-add" data-wx-new type="button" title="发起会话">${iconHtml('fa-plus')}</button>
    </div>
    <div class="th-wx-list">${rows}</div>
  </div>`;
}

function showList(): void {
  openModal2(`${iconHtml('fa-comment-dots')} 微信`, renderListHtml(), {
    maxWidth: WX_MODAL_MAXW, reset: true, revive: showList,
  });
  const root = qs('[data-wx-root]');
  root?.addEventListener('click', (e: Event) => {
    const t = e.target as HTMLElement;
    const openBtn = t.closest('[data-wx-open]') as HTMLElement | null;
    if (openBtn) { showChat(openBtn.getAttribute('data-wx-open') || ''); return; }
    if (t.closest('[data-wx-new]')) { showNewChat(); return; }
    const tab = t.closest('[data-wx-tab]') as HTMLElement | null;
    if (tab) {
      const k = tab.getAttribute('data-wx-tab');
      if (k === 'contacts') showContacts();
      else if (k === 'moments') showMoments();
      return;
    }
  });
}

// MARK_NEWCHAT

// ==================== 发起会话（选联系人 → 单聊/群聊）====================
function renderNewChatHtml(): string {
  const contacts = getContacts();
  const list = contacts.length ? contacts.map(c => `
    <label class="th-wx-pick-row">
      <input type="checkbox" class="th-wx-pick" value="${esc(c.id)}">
      ${avatarHtml(c.name, c.avatar)}
      <span class="th-wx-pick-name">${esc(c.name)}</span>
      <span class="th-wx-pick-src">${c.source === 'persona' ? '人格' : c.source === 'charcard' ? '角色卡' : '自定义'}</span>
    </label>`).join('')
    : `<div class="th-wx-empty-sub" style="padding:16px">通讯录还没有联系人，先去「通讯录」添加。</div>`;
  return `<div class="th-wx-sub" data-wx-newchat-root>
    <div class="th-wx-subhead">
      <button class="th-wx-back" data-wx-back type="button">${iconHtml('fa-arrow-left')} 聊天</button>
      <span class="th-wx-subtitle">发起会话</span>
    </div>
    <div class="th-wx-newchat-hint">勾选 1 人发起单聊；勾选多人发起群聊。</div>
    <div class="th-wx-pick-list">${list}</div>
    <div class="th-wx-newchat-foot">
      <input type="text" class="th-wx-group-name" placeholder="群名（多选时填，可留空自动取名）">
      <button class="th-wx-primary" data-wx-create type="button">${iconHtml('fa-check')} 创建会话</button>
    </div>
  </div>`;
}

function showNewChat(): void {
  openModal2(`${iconHtml('fa-plus')} 发起会话`, renderNewChatHtml(), { maxWidth: WX_MODAL_MAXW, replace: true });
  const root = qs('[data-wx-newchat-root]') as HTMLElement | null;
  if (!root) return;
  root.addEventListener('click', (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-wx-back]')) { showList(); return; }
    if (t.closest('[data-wx-create]')) {
      const picks = [...root.querySelectorAll('.th-wx-pick:checked')].map(el => (el as HTMLInputElement).value);
      if (!picks.length) { toast('warning', '请至少选择一个联系人'); return; }
      if (picks.length === 1) {
        const c = getContact(picks[0]); if (!c) return;
        const chat = createChat({ kind: 'single', name: c.name, contactIds: picks });
        showChat(chat.id);
      } else {
        const nameInput = (root.querySelector('.th-wx-group-name') as HTMLInputElement | null)?.value.trim() || '';
        const auto = picks.map(id => getContact(id)?.name || '').filter(Boolean).slice(0, 3).join('、');
        const chat = createChat({ kind: 'group', name: nameInput || `${auto}${picks.length > 3 ? ' 等' : ''}的群聊`, contactIds: picks });
        showChat(chat.id);
      }
      return;
    }
  });
}

// MARK_CHAT

// ==================== 单聊 / 群聊 对话视图 ====================
function bubbleHtml(chat: WxChat, m: WxMessage): string {
  const mine = m.senderId === 'me';
  const side = mine ? 'th-wx-b-me' : 'th-wx-b-other';
  if (m.recalled) {
    return `<div class="th-wx-bubble-row ${side}"><div class="th-wx-recalled">${esc(mine ? '你' : contactName(m.senderId))}撤回了一条消息</div></div>`;
  }
  let inner = '';
  if (m.kind === 'image') {
    inner = m.imageUrl
      ? `<img class="th-wx-img" src="${esc(m.imageUrl)}" alt="${esc(m.content)}">`
      : `<div class="th-wx-img-ph">${iconHtml('fa-image')}<span>${esc(m.content || '图片')}</span></div>`;
  } else if (m.kind === 'sticker') {
    inner = `<div class="th-wx-sticker">${esc(m.content)}</div>`;
  } else {
    inner = `<div class="th-wx-text">${esc(m.content)}</div>`;
  }
  // 群聊里他人气泡显示发言人名
  const nameLine = (chat.kind === 'group' && !mine) ? `<div class="th-wx-sender">${esc(contactName(m.senderId))}</div>` : '';
  const ops = `<div class="th-wx-msg-ops">
    ${!mine ? `<button data-wx-reroll title="重 roll">${iconHtml('fa-rotate')}</button>` : ''}
    <button data-wx-edit title="编辑">${iconHtml('fa-pen')}</button>
    <button data-wx-recall title="撤回">${iconHtml('fa-arrow-left')}</button>
    <button data-wx-delmsg title="删除">${iconHtml('fa-xmark')}</button>
  </div>`;
  return `<div class="th-wx-bubble-row ${side}" data-wx-msg="${esc(m.id)}">
    ${mine ? '' : contactAvatar(m.senderId)}
    <div class="th-wx-bubble-wrap">
      ${nameLine}
      <div class="th-wx-bubble">${inner}</div>
      ${ops}
    </div>
    ${mine ? contactAvatar('me') : ''}
  </div>`;
}

function renderChatHtml(chatId: string): string {
  const chat = getChat(chatId);
  if (!chat) return `<div class="th-wx-sub"><div class="th-wx-empty">会话不存在</div></div>`;
  const msgs = getMessages(chatId);
  const body = msgs.length
    ? msgs.map(m => bubbleHtml(chat, m)).join('')
    : `<div class="th-wx-empty-sub" style="padding:24px;text-align:center">还没有消息，打个招呼吧～</div>`;

  // 群聊发言人选择器（仅群聊且非自选时显示）
  const groupBar = (chat.kind === 'group' && !chat.settings.groupAutoSpeaker) ? `
    <div class="th-wx-groupbar">指定发言：
      <select class="th-wx-speaker">
        <option value="">（本轮 AI 自选）</option>
        ${chat.contactIds.map(id => `<option value="${esc(contactName(id))}">${esc(contactName(id))}</option>`).join('')}
      </select>
    </div>` : '';

  const imgReady = isImageBackendReady();
  return `<div class="th-wx-sub th-wx-chat" data-wx-chat-root data-wx-cid="${esc(chat.id)}">
    <div class="th-wx-subhead">
      <button class="th-wx-back" data-wx-back type="button">${iconHtml('fa-arrow-left')}</button>
      <span class="th-wx-subtitle">${esc(chat.name)}${chat.kind === 'group' ? ` <span class="th-wx-chat-tag">群 ${chat.contactIds.length}</span>` : ''}</span>
      <span class="th-wx-head-ops">
        <button data-wx-memory type="button" title="记忆">${iconHtml('fa-brain')}</button>
        <button data-wx-chatset type="button" title="设置">${iconHtml('fa-gear')}</button>
      </span>
    </div>
    ${chat.settings.injectEnabled ? `<div class="th-wx-inject-flag">${iconHtml('fa-syringe')} 注入正文已开：本会话摘要会喂给下次酒馆生成</div>` : ''}
    <div class="th-wx-msgs">${body}</div>
    ${groupBar}
    <div class="th-wx-inputbar">
      <button class="th-wx-tool" data-wx-sticker type="button" title="表情">${iconHtml('fa-face-smile')}</button>
      <button class="th-wx-tool" data-wx-image type="button" title="${imgReady ? '发图（AI 生成）' : '发图（未配置后端，将文字占位）'}">${iconHtml('fa-image')}</button>
      <textarea class="th-wx-input" rows="1" placeholder="说点什么…"></textarea>
      <button class="th-wx-send" data-wx-send type="button">${iconHtml('fa-paper-plane')}</button>
    </div>
  </div>`;
}

function showChat(chatId: string): void {
  openModal2(`${iconHtml('fa-comment-dots')} ${esc(getChat(chatId)?.name || '会话')}`, renderChatHtml(chatId), {
    maxWidth: WX_MODAL_MAXW, replace: true,
  });
  // 确保记忆会话存在
  const chat = getChat(chatId);
  if (chat) ensureSession({ id: wxSessionId(chatId), appId: 'wechat', appName: '微信', title: chat.name });
  bindChatEvents(chatId);
  scrollMsgsBottom();
}

function scrollMsgsBottom(): void {
  try { const box = qs('.th-wx-msgs') as HTMLElement | null; if (box) box.scrollTop = box.scrollHeight; } catch (e) { void e; }
}

// MARK_CHAT_EVENTS

// 触发一次 AI 回复（单聊/群聊统一入口）。串行锁防撞生成锁。
async function doAiReply(chatId: string): Promise<void> {
  if (_busy) { toast('warning', '正在生成，请稍候'); return; }
  const chat = getChat(chatId); if (!chat) return;
  const sid = wxSessionId(chatId);
  _busy = true; toast('info', '对方正在输入…');
  try {
    if (chat.kind === 'group') {
      const forced = (qs('.th-wx-speaker') as HTMLSelectElement | null)?.value || '';
      const r = await groupReply({
        sessionId: sid, members: groupMembers(chat), userText: lastUserText(chatId),
        forcedSpeaker: forced || undefined, readFloors: chat.settings.readFloors, aiPresetName: chat.settings.aiPresetName,
      });
      const senderId = chat.contactIds.find(id => contactName(id) === r.speaker) || chat.contactIds[0] || '';
      appendMessage(chatId, { senderId, kind: 'text', content: r.content });
    } else {
      const c = getContact(chat.contactIds[0]);
      const reply = await sessionReply({
        sessionId: sid, persona: c?.persona || c?.name || '一位朋友', userText: lastUserText(chatId),
        readFloors: chat.settings.readFloors, aiPresetName: chat.settings.aiPresetName,
      });
      appendMessage(chatId, { senderId: chat.contactIds[0] || '', kind: 'text', content: reply });
    }
    maybeInject(chatId);
  } catch (err) {
    toast('error', '生成失败：' + (err instanceof Error ? err.message : String(err)));
  } finally {
    _busy = false; refreshChat(chatId);
  }
}

// 取最近一条玩家文本（doAiReply 用：玩家消息已先 append 进 store + 已入记忆 buffer 由 sessionReply 处理，
// 这里只取文本喂给生成；记忆 buffer 的 user turn 由 sessionReply/groupReply 内部 appendTurn 负责）。
let _pendingUserText = '';
function lastUserText(_chatId: string): string { return _pendingUserText; }

// 注入开关开启时，把本次交互末尾摘要喂下次酒馆生成。
function maybeInject(chatId: string): void {
  const chat = getChat(chatId); if (!chat || !chat.settings.injectEnabled) return;
  const msgs = getMessages(chatId).slice(-6).filter(m => !m.recalled);
  const text = msgs.map(m => `${m.senderId === 'me' ? '我' : contactName(m.senderId)}：${m.kind === 'text' ? m.content : m.kind === 'image' ? '[图片]' : m.content}`).join('\n');
  const ok = injectWorldOnce('th_world_wechat_' + chatId, `【微信·${chat.name}】玩家刚在微信里的对话（供参考，勿复述）：\n${text}`);
  if (ok) toast('info', '本次微信对话已注入下次正文生成');
}

function refreshChat(chatId: string): void { showChat(chatId); }

function bindChatEvents(chatId: string): void {
  const root = qs('[data-wx-chat-root]') as HTMLElement | null;
  if (!root) return;

  const sendText = () => {
    if (_busy) { toast('warning', '正在生成，请稍候'); return; }
    const ta = root.querySelector('.th-wx-input') as HTMLTextAreaElement | null;
    const v = ta?.value.trim() || '';
    if (!v) return;
    _pendingUserText = v;
    appendMessage(chatId, { senderId: 'me', kind: 'text', content: v });
    if (ta) ta.value = '';
    refreshChat(chatId);
    void doAiReply(chatId);
  };

  root.addEventListener('click', async (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-wx-back]')) { showList(); return; }
    if (t.closest('[data-wx-memory]')) { openSessionMemory(wxSessionId(chatId)); return; }
    if (t.closest('[data-wx-chatset]')) { showChatSettings(chatId); return; }
    if (t.closest('[data-wx-send]')) { sendText(); return; }
    if (t.closest('[data-wx-sticker]')) { showStickerPicker(chatId); return; }
    if (t.closest('[data-wx-image]')) { void sendImage(chatId); return; }
    // MARK_MSG_OPS
    await handleMsgOp(chatId, t);
  });

  // Enter 发送（Shift+Enter 换行）
  const ta = root.querySelector('.th-wx-input') as HTMLTextAreaElement | null;
  ta?.addEventListener('keydown', (ev: KeyboardEvent) => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); sendText(); }
  });
}

// MARK_MSGOP_FN

// 单条消息操作：重 roll（仅他人消息，重新生成）/ 编辑 / 撤回 / 删除。
async function handleMsgOp(chatId: string, t: HTMLElement): Promise<void> {
  const row = t.closest('[data-wx-msg]') as HTMLElement | null;
  if (!row) return;
  const msgId = row.getAttribute('data-wx-msg') || '';
  const msgs = getMessages(chatId);
  const m = msgs.find(x => x.id === msgId); if (!m) return;

  if (t.closest('[data-wx-edit]')) {
    const next = ask('编辑内容：', m.content);
    if (next != null && next.trim()) { updateMessage(chatId, msgId, { content: next.trim() }); refreshChat(chatId); }
    return;
  }
  if (t.closest('[data-wx-recall]')) {
    updateMessage(chatId, msgId, { recalled: true });
    refreshChat(chatId);
    return;
  }
  if (t.closest('[data-wx-delmsg]')) {
    if (confirmBox('删除这条消息？')) { deleteMessage(chatId, msgId); refreshChat(chatId); }
    return;
  }
  if (t.closest('[data-wx-reroll]')) {
    if (_busy) { toast('warning', '正在生成，请稍候'); return; }
    const chat = getChat(chatId); if (!chat) return;
    // 找到这条 AI 消息之前最近一条玩家文本作为重 roll 输入
    const idx = msgs.findIndex(x => x.id === msgId);
    const prevUser = [...msgs.slice(0, idx)].reverse().find(x => x.senderId === 'me' && x.kind === 'text');
    if (!prevUser) { toast('warning', '没有可重 roll 的上文'); return; }
    deleteMessage(chatId, msgId); // 删旧回复后重新生成
    _pendingUserText = prevUser.content;
    refreshChat(chatId);
    await doAiReply(chatId);
    return;
  }
}

// 发图：玩家给描述 → tryGenImage（comfyui，可降级为文字占位）。
async function sendImage(chatId: string): Promise<void> {
  const desc = ask('描述要发送的图片：');
  if (desc == null || !desc.trim()) return;
  const prompt = desc.trim();
  // 先占位入库，出图后回填 url
  const placed = appendMessage(chatId, { senderId: 'me', kind: 'image', content: prompt });
  refreshChat(chatId);
  if (!isImageBackendReady()) { toast('info', '未配置图片后端，已用文字占位'); return; }
  toast('info', '正在生成图片…');
  try {
    const r = await tryGenImage(prompt);
    if (r) { updateMessage(chatId, placed.id, { imageUrl: r.url }); toast('success', '图片已生成'); }
    else toast('warning', '出图失败，保留文字占位');
  } catch (e) { void e; toast('warning', '出图失败，保留文字占位'); }
  finally { refreshChat(chatId); }
}

// MARK_STICKER

// ==================== 表情选择器（子弹窗 push）====================
function showStickerPicker(chatId: string): void {
  const stickers = getStickers();
  const grid = stickers.map(s => `
    <button class="th-wx-st-cell" data-wx-st="${esc(s.id)}" type="button" title="${esc(s.name)}">
      ${s.url ? `<img src="${esc(s.url)}" alt="${esc(s.name)}">` : `<span class="th-wx-st-emoji">${esc(s.name)}</span>`}
      <button class="th-wx-st-del" data-wx-st-del="${esc(s.id)}" type="button" title="删除">${iconHtml('fa-xmark')}</button>
    </button>`).join('');
  const html = `<div class="th-wx-stpick" data-wx-stpick-root>
    <div class="th-wx-st-grid">${grid || '<div class="th-wx-empty-sub">暂无表情</div>'}</div>
    <div class="th-wx-st-add">
      <input type="text" class="th-wx-st-name" placeholder="表情文字（emoji 或文字）">
      <input type="text" class="th-wx-st-url" placeholder="图片 URL（可选）">
      <button class="th-wx-primary" data-wx-st-add type="button">${iconHtml('fa-plus')} 添加</button>
    </div>
  </div>`;
  openModal2(`${iconHtml('fa-face-smile')} 表情`, html, { maxWidth: 'min(560px,94vw)' });
  const root = qs('[data-wx-stpick-root]') as HTMLElement | null;
  root?.addEventListener('click', (e: Event) => {
    const t = e.target as HTMLElement;
    const delBtn = t.closest('[data-wx-st-del]') as HTMLElement | null;
    if (delBtn) { e.stopPropagation(); deleteSticker(delBtn.getAttribute('data-wx-st-del') || ''); showStickerPicker(chatId); return; }
    if (t.closest('[data-wx-st-add]')) {
      const name = (root.querySelector('.th-wx-st-name') as HTMLInputElement | null)?.value.trim() || '';
      const url = (root.querySelector('.th-wx-st-url') as HTMLInputElement | null)?.value.trim() || '';
      if (!name && !url) { toast('warning', '填表情文字或图片 URL'); return; }
      addSticker(name || '表情', url || undefined);
      showStickerPicker(chatId);
      return;
    }
    const cell = t.closest('[data-wx-st]') as HTMLElement | null;
    if (cell) {
      const s = getStickers().find(x => x.id === cell.getAttribute('data-wx-st'));
      if (s) { appendMessage(chatId, { senderId: 'me', kind: 'sticker', content: s.name, imageUrl: s.url }); }
      showChat(chatId);
      return;
    }
  });
}

// MARK_CHATSET

// ==================== 单会话设置 ====================
function renderChatSettingsHtml(chatId: string): string {
  const chat = getChat(chatId);
  if (!chat) return `<div class="th-wx-sub"><div class="th-wx-empty">会话不存在</div></div>`;
  const s = chat.settings;
  const groupRow = chat.kind === 'group' ? `
    <label class="th-wx-set-row">
      <span>群聊发言：AI 自选发言角色<br><small>关闭则每轮由你在聊天界面指定谁说话</small></span>
      <input type="checkbox" class="th-wx-set-autospk" ${s.groupAutoSpeaker ? 'checked' : ''}>
    </label>` : '';
  return `<div class="th-wx-sub" data-wx-chatset-root data-wx-cid="${esc(chat.id)}">
    <div class="th-wx-subhead">
      <button class="th-wx-back" data-wx-back type="button">${iconHtml('fa-arrow-left')}</button>
      <span class="th-wx-subtitle">${esc(chat.name)} · 设置</span>
    </div>
    <div class="th-wx-set-group">
      <label class="th-wx-set-row">
        <span>读取酒馆正文楼层数<br><small>0=不读；>0 则把最近 N 楼正文作参考喂给对方</small></span>
        <input type="number" min="0" class="th-wx-set-floors" value="${esc(String(s.readFloors))}">
      </label>
      <label class="th-wx-set-row">
        <span>注入正文（默认关）<br><small>开启后本会话对话摘要会喂给下次酒馆生成，让正文知道你刚聊了什么。走 injectPrompts，不改聊天楼层</small></span>
        <input type="checkbox" class="th-wx-set-inject" ${s.injectEnabled ? 'checked' : ''}>
      </label>
      ${groupRow}
      <label class="th-wx-set-row th-wx-set-row-stack">
        <span>指定 API 预设（可选，留空跟随全局）</span>
        <input type="text" class="th-wx-set-preset" value="${esc(s.aiPresetName || '')}" placeholder="预设名">
      </label>
    </div>
    <div class="th-wx-set-actions">
      <button class="th-wx-primary" data-wx-set-save type="button">${iconHtml('fa-check')} 保存</button>
      <button class="th-wx-danger" data-wx-set-del type="button">${iconHtml('fa-trash')} 删除会话</button>
    </div>
  </div>`;
}

function showChatSettings(chatId: string): void {
  openModal2(`${iconHtml('fa-gear')} 会话设置`, renderChatSettingsHtml(chatId), { maxWidth: WX_MODAL_MAXW, replace: true });
  const root = qs('[data-wx-chatset-root]') as HTMLElement | null;
  if (!root) return;
  root.addEventListener('click', (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-wx-back]')) { showChat(chatId); return; }
    if (t.closest('[data-wx-set-save]')) {
      const floorsRaw = Number((root.querySelector('.th-wx-set-floors') as HTMLInputElement | null)?.value);
      const readFloors = Number.isFinite(floorsRaw) && floorsRaw >= 0 ? Math.floor(floorsRaw) : 0;
      const injectEnabled = (root.querySelector('.th-wx-set-inject') as HTMLInputElement | null)?.checked ?? false;
      const autoEl = root.querySelector('.th-wx-set-autospk') as HTMLInputElement | null;
      const groupAutoSpeaker = autoEl ? autoEl.checked : getChat(chatId)?.settings.groupAutoSpeaker ?? true;
      const aiPresetName = (root.querySelector('.th-wx-set-preset') as HTMLInputElement | null)?.value.trim() || undefined;
      updateChatSettings(chatId, { readFloors, injectEnabled, groupAutoSpeaker, aiPresetName });
      toast('success', '已保存会话设置');
      showChat(chatId);
      return;
    }
    if (t.closest('[data-wx-set-del]')) {
      if (confirmBox('删除整个会话（含消息）？记忆需在记忆中心单独删除。')) { deleteChat(chatId); showList(); }
      return;
    }
  });
}

// MARK_CONTACTS

// ==================== 通讯录 ====================
function renderContactsHtml(): string {
  const contacts = getContacts();
  const rows = contacts.length ? contacts.map(c => `
    <div class="th-wx-ct-row" data-wx-ct="${esc(c.id)}">
      ${avatarHtml(c.name, c.avatar)}
      <span class="th-wx-ct-mid">
        <span class="th-wx-ct-name">${esc(c.name)}</span>
        <span class="th-wx-ct-note">${esc(c.note || (c.source === 'persona' ? '来自人格' : c.source === 'charcard' ? '来自角色卡' : '自定义'))}</span>
      </span>
      <span class="th-wx-ct-ops">
        <button data-wx-ct-edit type="button" title="编辑">${iconHtml('fa-pen')}</button>
        <button data-wx-ct-del type="button" title="删除">${iconHtml('fa-xmark')}</button>
      </span>
    </div>`).join('')
    : `<div class="th-wx-empty">${iconHtml('fa-id-card')}<div>通讯录还是空的</div>
        <div class="th-wx-empty-sub">从已有人格导入，或新建自定义联系人</div></div>`;
  return `<div class="th-wx-sub" data-wx-contacts-root>
    <div class="th-wx-subhead">
      <button class="th-wx-back" data-wx-back type="button">${iconHtml('fa-arrow-left')} 聊天</button>
      <span class="th-wx-subtitle">通讯录</span>
    </div>
    <div class="th-wx-ct-toolbar">
      <button class="th-wx-chip" data-wx-ct-import type="button">${iconHtml('fa-user-tie')} 从人格导入</button>
      <button class="th-wx-chip" data-wx-ct-new type="button">${iconHtml('fa-plus')} 新建联系人</button>
    </div>
    <div class="th-wx-ct-list">${rows}</div>
  </div>`;
}

function showContacts(): void {
  openModal2(`${iconHtml('fa-id-card')} 通讯录`, renderContactsHtml(), { maxWidth: WX_MODAL_MAXW, replace: true });
  const root = qs('[data-wx-contacts-root]') as HTMLElement | null;
  if (!root) return;
  root.addEventListener('click', (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-wx-back]')) { showList(); return; }
    if (t.closest('[data-wx-ct-import]')) { showPersonaImport(); return; }
    if (t.closest('[data-wx-ct-new]')) { showContactEdit(null); return; }
    const row = t.closest('[data-wx-ct]') as HTMLElement | null;
    if (!row) return;
    const id = row.getAttribute('data-wx-ct') || '';
    if (t.closest('[data-wx-ct-edit]')) { showContactEdit(id); return; }
    if (t.closest('[data-wx-ct-del]')) {
      if (confirmBox('删除该联系人？（已建会话不受影响）')) { deleteContact(id); showContacts(); }
      return;
    }
  });
}

// 从已有 AI 人格导入联系人
function showPersonaImport(): void {
  const personas = getPersonaList();
  const rows = personas.map(p => `
    <button class="th-wx-pick-row" data-wx-imp="${esc(p.id)}" type="button">
      ${avatarHtml(p.name)}
      <span class="th-wx-pick-name">${esc(p.name)}</span>
      <span class="th-wx-pick-src">${p.builtin ? '内置' : '自定义'}</span>
    </button>`).join('');
  openModal2(`${iconHtml('fa-user-tie')} 从人格导入`, `<div class="th-wx-sub" data-wx-imp-root>
    <div class="th-wx-newchat-hint">点击导入为联系人（已导入的会自动复用）。</div>
    <div class="th-wx-pick-list">${rows || '<div class="th-wx-empty-sub" style="padding:16px">暂无人格</div>'}</div>
  </div>`, { maxWidth: WX_MODAL_MAXW });
  const root = qs('[data-wx-imp-root]') as HTMLElement | null;
  root?.addEventListener('click', (e: Event) => {
    const btn = (e.target as HTMLElement).closest('[data-wx-imp]') as HTMLElement | null;
    if (!btn) return;
    const p = getPersonaList().find(x => x.id === btn.getAttribute('data-wx-imp'));
    if (p) { importPersonaContact({ id: p.id, name: p.name, persona: p.persona }); toast('success', `已导入 ${p.name}`); }
    showContacts();
  });
}

// MARK_CONTACT_EDIT

// ==================== 联系人编辑（新建/编辑）====================
function renderContactEditHtml(id: string | null): string {
  const c = id ? getContact(id) : null;
  return `<div class="th-wx-sub" data-wx-ctedit-root data-wx-ctid="${esc(id || '')}">
    <div class="th-wx-subhead">
      <button class="th-wx-back" data-wx-back type="button">${iconHtml('fa-arrow-left')} 通讯录</button>
      <span class="th-wx-subtitle">${c ? '编辑联系人' : '新建联系人'}</span>
    </div>
    <div class="th-wx-set-group">
      <label class="th-wx-set-row th-wx-set-row-stack"><span>昵称</span>
        <input type="text" class="th-wx-ce-name" value="${esc(c?.name || '')}" placeholder="联系人昵称"></label>
      <label class="th-wx-set-row th-wx-set-row-stack"><span>头像 URL（可选，留空用首字）</span>
        <input type="text" class="th-wx-ce-avatar" value="${esc(c?.avatar || '')}" placeholder="http://… 或留空"></label>
      <label class="th-wx-set-row th-wx-set-row-stack"><span>角色设定（注入对方身份，组对话用）</span>
        <textarea class="th-wx-ce-persona" rows="5" placeholder="这位联系人是谁、性格、说话风格…">${esc(c?.persona || '')}</textarea></label>
      <label class="th-wx-set-row th-wx-set-row-stack"><span>固定形象 tag（可选，comfyui 出图保持一致）</span>
        <input type="text" class="th-wx-ce-imgtag" value="${esc(c?.imageTag || '')}" placeholder="如 1girl, silver hair, …"></label>
      <label class="th-wx-set-row th-wx-set-row-stack"><span>备注（可选）</span>
        <input type="text" class="th-wx-ce-note" value="${esc(c?.note || '')}" placeholder="备注"></label>
    </div>
    <div class="th-wx-set-actions">
      <button class="th-wx-chip" data-wx-ce-genavatar type="button" title="${isImageBackendReady() ? '用形象 tag 生成头像' : '未配置图片后端'}">${iconHtml('fa-image')} 生成头像</button>
      <button class="th-wx-primary" data-wx-ce-save type="button">${iconHtml('fa-check')} 保存</button>
    </div>
  </div>`;
}

function showContactEdit(id: string | null): void {
  openModal2(`${iconHtml('fa-id-card')} 联系人`, renderContactEditHtml(id), { maxWidth: WX_MODAL_MAXW, replace: true });
  const root = qs('[data-wx-ctedit-root]') as HTMLElement | null;
  if (!root) return;
  const readForm = () => ({
    name: (root.querySelector('.th-wx-ce-name') as HTMLInputElement | null)?.value.trim() || '',
    avatar: (root.querySelector('.th-wx-ce-avatar') as HTMLInputElement | null)?.value.trim() || '',
    persona: (root.querySelector('.th-wx-ce-persona') as HTMLTextAreaElement | null)?.value || '',
    imageTag: (root.querySelector('.th-wx-ce-imgtag') as HTMLInputElement | null)?.value.trim() || '',
    note: (root.querySelector('.th-wx-ce-note') as HTMLInputElement | null)?.value.trim() || '',
  });
  root.addEventListener('click', async (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-wx-back]')) { showContacts(); return; }
    if (t.closest('[data-wx-ce-genavatar]')) {
      if (_busy) return;
      const f = readForm();
      if (!isImageBackendReady()) { toast('warning', '未配置图片后端'); return; }
      _busy = true; toast('info', '正在生成头像…');
      try {
        const r = await tryGenImage(f.imageTag || f.name || 'portrait, avatar');
        if (r) { const inp = root.querySelector('.th-wx-ce-avatar') as HTMLInputElement | null; if (inp) inp.value = r.url; toast('success', '头像已生成，记得保存'); }
        else toast('warning', '出图失败');
      } catch (err) { void err; toast('warning', '出图失败'); }
      finally { _busy = false; }
      return;
    }
    if (t.closest('[data-wx-ce-save]')) {
      const f = readForm();
      if (!f.name) { toast('warning', '请填昵称'); return; }
      const existing = id ? getContact(id) : null;
      upsertContact({
        id: id || undefined, source: existing?.source || 'custom', sourceRef: existing?.sourceRef,
        name: f.name, avatar: f.avatar || undefined, persona: f.persona, imageTag: f.imageTag || undefined, note: f.note || undefined,
      });
      toast('success', '已保存联系人');
      showContacts();
      return;
    }
  });
}

// MARK_MOMENTS

// ==================== 朋友圈 ====================
function momentHtml(moId: string): string {
  const mo = listMoments().find(x => x.id === moId);
  if (!mo) return '';
  const likeNames = mo.likes.map(contactName).join('、');
  const comments = mo.comments.map(cm => `<div class="th-wx-mo-cm"><b>${esc(contactName(cm.authorId))}：</b>${esc(cm.text)}</div>`).join('');
  return `<div class="th-wx-mo" data-wx-mo="${esc(mo.id)}">
    <div class="th-wx-mo-head">${contactAvatar(mo.authorId)}<span class="th-wx-mo-author">${esc(contactName(mo.authorId))}</span></div>
    <div class="th-wx-mo-text">${esc(mo.text)}</div>
    ${mo.imageUrl ? `<img class="th-wx-mo-img" src="${esc(mo.imageUrl)}" alt="配图">` : ''}
    <div class="th-wx-mo-ops">
      <button data-wx-mo-like type="button">${iconHtml('fa-heart')} ${mo.likes.length || ''}</button>
      <button data-wx-mo-cm type="button">${iconHtml('fa-comment')} 评论</button>
      <button data-wx-mo-aicm type="button" title="让一位角色评论">${iconHtml('fa-comment-dots')} AI评论</button>
      <button data-wx-mo-del type="button">${iconHtml('fa-xmark')}</button>
    </div>
    ${likeNames ? `<div class="th-wx-mo-likes">${iconHtml('fa-heart')} ${esc(likeNames)}</div>` : ''}
    ${comments ? `<div class="th-wx-mo-cms">${comments}</div>` : ''}
  </div>`;
}

function renderMomentsHtml(): string {
  const moments = listMoments();
  const body = moments.length ? moments.map(m => momentHtml(m.id)).join('')
    : `<div class="th-wx-empty">${iconHtml('fa-camera')}<div>朋友圈还没有动态</div>
        <div class="th-wx-empty-sub">发条动态，或让角色发一条</div></div>`;
  return `<div class="th-wx-sub" data-wx-moments-root>
    <div class="th-wx-subhead">
      <button class="th-wx-back" data-wx-back type="button">${iconHtml('fa-arrow-left')} 聊天</button>
      <span class="th-wx-subtitle">朋友圈</span>
    </div>
    <div class="th-wx-mo-toolbar">
      <button class="th-wx-chip" data-wx-mo-post type="button">${iconHtml('fa-plus')} 我发一条</button>
      <button class="th-wx-chip" data-wx-mo-aipost type="button">${iconHtml('fa-user-tie')} 角色发一条</button>
    </div>
    <div class="th-wx-mo-list">${body}</div>
  </div>`;
}

function showMoments(): void {
  openModal2(`${iconHtml('fa-camera')} 朋友圈`, renderMomentsHtml(), { maxWidth: WX_MODAL_MAXW, replace: true });
  bindMomentsEvents();
}

// MARK_MOMENTS_EVENTS

// 选一个联系人（弹 prompt 选名 → 返回 id）。简单实现：列出名字让玩家输入序号。
function pickContactId(): string | null {
  const cs = getContacts();
  if (!cs.length) { toast('warning', '通讯录还没有联系人'); return null; }
  const menu = cs.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
  const v = ask(`选择角色（输入序号）：\n${menu}`, '1');
  if (v == null) return null;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1 || n > cs.length) { toast('warning', '序号无效'); return null; }
  return cs[n - 1].id;
}

function bindMomentsEvents(): void {
  const root = qs('[data-wx-moments-root]') as HTMLElement | null;
  if (!root) return;
  root.addEventListener('click', async (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-wx-back]')) { showList(); return; }

    // 我发一条
    if (t.closest('[data-wx-mo-post]')) {
      const text = ask('发什么动态？');
      if (text != null && text.trim()) { addMoment({ authorId: 'me', text: text.trim() }); showMoments(); }
      return;
    }
    // 角色发一条（AI 生成）
    if (t.closest('[data-wx-mo-aipost]')) {
      if (_busy) { toast('warning', '正在生成，请稍候'); return; }
      const cid = pickContactId(); if (!cid) return;
      const c = getContact(cid); if (!c) return;
      _busy = true; toast('info', `${c.name} 正在发动态…`);
      try {
        const text = await chatGenerate({
          system: `你将扮演「${c.name}」。${c.persona || ''}\n请以第一人称发一条朋友圈动态，符合人设语气，60 字以内，直接给正文，不要引号、不要解释。`,
          user: '发一条此刻心情的朋友圈。', aiPresetName: undefined,
        });
        if (text.trim()) addMoment({ authorId: cid, text: text.trim() });
        toast('success', '已发布');
      } catch (err) { toast('error', '生成失败：' + (err instanceof Error ? err.message : String(err))); }
      finally { _busy = false; showMoments(); }
      return;
    }

    const moEl = t.closest('[data-wx-mo]') as HTMLElement | null;
    if (!moEl) return;
    const moId = moEl.getAttribute('data-wx-mo') || '';

    if (t.closest('[data-wx-mo-like]')) { toggleMomentLike(moId, 'me'); showMoments(); return; }
    if (t.closest('[data-wx-mo-del]')) { if (confirmBox('删除这条动态？')) { deleteMoment(moId); showMoments(); } return; }
    if (t.closest('[data-wx-mo-cm]')) {
      const text = ask('评论：');
      if (text != null && text.trim()) { addMomentComment(moId, 'me', text.trim()); showMoments(); }
      return;
    }
    // AI 评论：选一个角色，让其针对动态评论
    if (t.closest('[data-wx-mo-aicm]')) {
      if (_busy) { toast('warning', '正在生成，请稍候'); return; }
      const mo = listMoments().find(x => x.id === moId); if (!mo) return;
      const cid = pickContactId(); if (!cid) return;
      const c = getContact(cid); if (!c) return;
      _busy = true; toast('info', `${c.name} 正在评论…`);
      try {
        const text = await chatGenerate({
          system: `你将扮演「${c.name}」。${c.persona || ''}\n请针对下面这条朋友圈写一句简短评论，符合人设语气，30 字以内，直接给评论，不要引号。`,
          user: `${contactName(mo.authorId)} 的动态：${mo.text}`,
        });
        if (text.trim()) addMomentComment(moId, cid, text.trim());
        toast('success', '已评论');
      } catch (err) { toast('error', '生成失败：' + (err instanceof Error ? err.message : String(err))); }
      finally { _busy = false; showMoments(); }
      return;
    }
  });
}

// MARK_REGISTER

// ==================== 公开入口 + 注册 ====================
export function openWechat(): void { showList(); }

// 自注册到世界桌面（微信绿）。import 本模块即生效（status-bar-init 侧 side-effect import 触发）。
registerWorldApp({
  id: 'wechat', name: '微信', icon: 'fa-comment-dots', accent: 'linear-gradient(135deg,#07c160,#10b981)', order: 10,
  open: openWechat,
});

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_wechat__ = { openWechat };
} catch (e) { void e; }












