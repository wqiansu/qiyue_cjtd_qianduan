// 世界套件 P1-B · 世界论坛（forum）— 单 modal SPA
// 世界观内的论坛/贴吧：玩家建板块，玩家或 AI 以角色身份发帖；AI 自动生成楼中楼回帖。
// 架构同微信/演化/小剧场：openModal2 仅调一次（reset+revive），常驻根容器 + _view 状态机，
//   事件委托绑根容器；子面板=app 内底部 sheet，不堆叠 modal。
import { esc, qs } from '../../lib/dom-utils';
import { getRoot } from '../../lib/tavern-api';
import { openModal2 } from '../../status-bar-init';
import { iconHtml } from '../../lib/icons';
import { registerWorldApp } from '../../lib/world/world-store';
import { getContacts } from '../../lib/world/contacts';
import { chatGenerate, readTavernFloors, parseLooseJson, injectWorldOnce } from '../../lib/world/ai-chat';
import { registerPromptTemplate, getPromptText } from '../../lib/world/world-prompts';
import {
  getBoards, getBoard, createBoard, deleteBoard,
  getPosts, getPost, createPost, updatePost, deletePost, togglePostLike,
  addReply, deleteReply, toggleReplyLike,
} from '../../lib/world/forum-store';

const FRM_MODAL_MAXW = 'min(900px,96vw)';
const RID = 'th-frm-app-root';
let _busy = false;

// ==================== 提示词模板注册 ====================
registerPromptTemplate({
  id: 'forum.post', appId: 'forum', appName: '世界论坛', name: '角色发帖',
  desc: 'AI 以某角色身份发一个主题帖。控制帖子的口吻、信息量与世界感。',
  vars: [
    { key: 'author', desc: '发帖角色昵称' },
    { key: 'persona', desc: '发帖角色设定' },
    { key: 'board', desc: '所在板块（名称+简介）' },
    { key: 'worldBlock', desc: '世界信息（时间/地点/正文参考）' },
    { key: 'topic', desc: '玩家给的发帖方向（可空）' },
  ],
  default: '你是「{{author}}」，此刻正坐在这个世界的某块屏幕/某张符纸/某面传讯镜前，要往论坛「{{board}}」板块里发一个主题帖。\n\n'
    + '【你是谁】\n{{persona}}\n\n'
    + '【此刻的世界】\n{{worldBlock}}\n\n'
    + '【想发点什么】{{topic}}\n\n'
    + '【怎么发】\n'
    + '· 用「{{author}}」会有的口吻和立场写：他的身份、性格、利害关系都会决定他说什么、藏什么、为什么发这帖。\n'
    + '· 像真实论坛的帖子：可以是爆料、求助、安利、吐槽、约伴、辟谣、阴阳怪气……贴合板块氛围与世界设定，带一点「网感」和烟火气，而不是公告腔。\n'
    + '· 信息落到实处：提到具体的人/事/地/物，让看帖的人能接话、能起哄、能追问，而不是空泛感慨。\n'
    + '· 标题要有点击欲，正文 2~5 句，别写成长篇大论。\n\n'
    + '【输出】严格只输出 JSON：{"title":"帖子标题","content":"帖子正文"}，不要任何额外文字。',
});
registerPromptTemplate({
  id: 'forum.replies', appId: 'forum', appName: '世界论坛', name: '楼中楼回帖',
  desc: '针对一个主题帖，生成一批不同身份「路人/角色」的回帖，模拟论坛盖楼。',
  vars: [
    { key: 'post', desc: '主题帖（标题+正文）' },
    { key: 'board', desc: '所在板块' },
    { key: 'cast', desc: '可调用的具名角色（可空，其余用路人）' },
    { key: 'worldBlock', desc: '世界信息' },
    { key: 'count', desc: '本轮生成几条回帖' },
  ],
  default: '下面是这个世界论坛「{{board}}」板块里的一个帖子，请你扮演「围观群众」给它盖楼，一口气生成 {{count}} 条风格各异的回帖。\n\n'
    + '【原帖】\n{{post}}\n\n'
    + '【此刻的世界】\n{{worldBlock}}\n\n'
    + '【可点名的熟人】（出现时用其本名，符合其设定；没有合适的就用路人）\n{{cast}}\n\n'
    + '【盖楼要求】\n'
    + '· 每条回帖来自不同的「人」：有人附和、有人抬杠、有人玩梗、有人提供新情报、有人歪楼、有人理性分析、有人纯路过吃瓜——像真实论坛那样众生相。\n'
    + '· 回帖者昵称要有网感（可以是网名、诨号、身份代称），具名熟人则用其本名。\n'
    + '· 每条 1~3 句，短促、口语、有情绪，能彼此呼应（比如回应楼上）。\n'
    + '· 不偏离世界设定，不强行现代化（除非世界本就现代）。\n\n'
    + '【输出】严格只输出 JSON 数组：[{"author":"昵称","content":"回帖内容"}, ...]，共 {{count}} 条，不要任何额外文字。',
});

function rootEl(): HTMLElement | null { return qs<HTMLElement>('#' + RID); }

// 世界信息块（时间/地点 + 可选正文参考）
function worldInfoBlock(useFloors: boolean, floorCount: number): string {
  let s = '';
  try {
    const bridge = (window as any).__thStatusBarData || (getRoot() as any).__thStatusBarData;
    const d = bridge?.getCurrentData?.();
    const w = (d && typeof d === 'object') ? (d['世界信息'] || {}) : {};
    const bits = [w?.['日期'] ? `日期：${w['日期']}` : '', w?.['时间'] ? `时间：${w['时间']}` : '', w?.['天气'] ? `天气：${w['天气']}` : ''].filter(Boolean);
    if (bits.length) s += bits.join('　') + '\n';
  } catch (e) { void e; }
  if (useFloors && floorCount > 0) {
    const floors = readTavernFloors(floorCount);
    if (floors.trim()) s += `【最近剧情参考】\n${floors}`;
  }
  return s.trim() || '（无特别的世界信息，按板块与设定自由发挥。）';
}

// ==================== 状态机 ====================
type ViewState = { name: 'boards' } | { name: 'board'; boardId: string } | { name: 'post'; postId: string };
type SheetState =
  | { kind: 'newBoard' }
  | { kind: 'newPost'; boardId: string }          // 玩家发帖 / AI 代角色发帖
  | { kind: 'reply'; postId: string };            // 玩家回帖

let _view: ViewState = { name: 'boards' };
let _sheet: SheetState | null = null;
let _useFloors = true;   // 发帖/回帖是否参考正文（会话级，默认开）
const FLOOR_COUNT = 6;

function timeLabel(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function avatarChip(name: string): string {
  return `<span class="th-frm-av">${esc((name || '?').slice(0, 1))}</span>`;
}

// ==================== 板块列表视图 ====================
function boardsHtml(): string {
  const boards = getBoards();
  const cards = boards.length
    ? boards.map(b => {
        const cnt = getPosts(b.id).length;
        return `<button class="th-frm-board" data-frm-board="${esc(b.id)}" type="button">
          <span class="th-frm-board-icon">${iconHtml(b.icon || 'fa-comments')}</span>
          <span class="th-frm-board-body">
            <span class="th-frm-board-name">${esc(b.name)}</span>
            <span class="th-frm-board-desc">${esc(b.desc || '')}</span>
          </span>
          <span class="th-frm-board-cnt">${cnt} 帖</span>
          <span class="th-frm-board-del" data-frm-board-del="${esc(b.id)}" title="删除板块">${iconHtml('fa-trash')}</span>
        </button>`;
      }).join('')
    : `<div class="th-frm-empty">
        <i class="fa-solid fa-comments"></i>
        <div>还没有板块</div>
        <div class="th-frm-empty-sub">建一个板块（如「江湖传闻」「坊市交易」「霜月仙宗·内门」），让这个世界的人在里面发帖、盖楼、吵架。</div>
      </div>`;
  return `<div class="th-frm-app">
    <div class="th-frm-topbar">
      <span class="th-frm-title">${iconHtml('fa-globe')} 世界论坛</span>
      <button class="th-frm-primary" data-frm-new-board type="button">${iconHtml('fa-plus')} 新板块</button>
    </div>
    <div class="th-frm-boards">${cards}</div>
  </div>`;
}

// ==================== 板块内帖子列表 ====================
function boardHtml(boardId: string): string {
  const b = getBoard(boardId);
  if (!b) return backOnly('板块不存在');
  const posts = getPosts(boardId);
  const list = posts.length
    ? posts.map(p => `<button class="th-frm-post-row" data-frm-post="${esc(p.id)}" type="button">
        ${p.hot ? `<span class="th-frm-hot">${iconHtml('fa-fire')} 热</span>` : ''}
        <span class="th-frm-post-main">
          <span class="th-frm-post-title">${esc(p.title)}</span>
          <span class="th-frm-post-sub">${avatarChip(p.author)}${esc(p.author)} · ${p.replies.length} 回复 · ${timeLabel(p.ts)}</span>
        </span>
        <span class="th-frm-post-likes">${iconHtml('fa-thumbs-up')} ${p.likes}</span>
      </button>`).join('')
    : `<div class="th-frm-empty-sub" style="padding:16px">这个板块还没有帖子。发一帖，或让某个角色来开个楼。</div>`;
  return `<div class="th-frm-app">
    <div class="th-frm-topbar">
      <button class="th-frm-back" data-frm-back="boards" type="button">${iconHtml('fa-arrow-left')}</button>
      <span class="th-frm-title">${esc(b.name)}</span>
      <button class="th-frm-primary" data-frm-new-post="${esc(b.id)}" type="button">${iconHtml('fa-pen')} 发帖</button>
    </div>
    ${b.desc ? `<div class="th-frm-board-banner">${esc(b.desc)}</div>` : ''}
    <div class="th-frm-postlist">${list}</div>
  </div>`;
}

// ==================== 帖子详情（楼层） ====================
function postHtml(postId: string): string {
  const p = getPost(postId);
  if (!p) return backOnly('帖子不存在');
  const b = getBoard(p.boardId);
  const replies = p.replies.length
    ? p.replies.map((r, i) => `<div class="th-frm-floor" data-frm-floor="${esc(r.id)}">
        <div class="th-frm-floor-head">
          ${avatarChip(r.author)}
          <span class="th-frm-floor-author">${esc(r.author)}${r.isAi ? '' : ' <span class="th-frm-me">我</span>'}</span>
          <span class="th-frm-floor-no">${i + 2}楼</span>
          <span class="th-frm-floor-time">${timeLabel(r.ts)}</span>
        </div>
        <div class="th-frm-floor-body">${esc(r.content).replace(/\n/g, '<br>')}</div>
        <div class="th-frm-floor-ops">
          <button class="th-frm-floor-like" data-frm-reply-like="${esc(r.id)}" type="button">${iconHtml('fa-thumbs-up')} ${r.likes || 0}</button>
          <button class="th-frm-floor-del" data-frm-reply-del="${esc(r.id)}" type="button">${iconHtml('fa-trash')}</button>
        </div>
      </div>`).join('')
    : `<div class="th-frm-empty-sub" style="padding:12px">还没有人回帖。让 AI 来盖个楼，或自己回一句。</div>`;
  return `<div class="th-frm-app">
    <div class="th-frm-topbar">
      <button class="th-frm-back" data-frm-back="board:${esc(p.boardId)}" type="button">${iconHtml('fa-arrow-left')}</button>
      <span class="th-frm-title">${esc(b?.name || '帖子')}</span>
      <button class="th-frm-icon-btn" data-frm-post-del="${esc(p.id)}" type="button" title="删除帖子">${iconHtml('fa-trash')}</button>
    </div>
    <div class="th-frm-thread">
      <div class="th-frm-op">
        <div class="th-frm-op-title">${p.hot ? `<span class="th-frm-hot">${iconHtml('fa-fire')} 热帖</span> ` : ''}${esc(p.title)}</div>
        <div class="th-frm-op-meta">${avatarChip(p.author)}<span class="th-frm-op-author">${esc(p.author)}</span> · 楼主 · ${timeLabel(p.ts)}</div>
        <div class="th-frm-op-body">${esc(p.content).replace(/\n/g, '<br>')}</div>
        <div class="th-frm-op-ops">
          <button class="th-frm-floor-like" data-frm-post-like="${esc(p.id)}" type="button">${iconHtml('fa-thumbs-up')} ${p.likes}</button>
          <button class="th-frm-op-hot" data-frm-post-hot="${esc(p.id)}" type="button">${iconHtml('fa-fire')} ${p.hot ? '取消热帖' : '设为热帖'}</button>
          <button class="th-frm-op-inject" data-frm-post-inject="${esc(p.id)}" type="button" title="把本帖作为世界动态注入下次正文">${iconHtml('fa-syringe')} 联动正文</button>
        </div>
      </div>
      <div class="th-frm-floors">${replies}</div>
    </div>
    <div class="th-frm-genbar">
      <button class="th-frm-ai" data-frm-ai-reply="${esc(p.id)}" type="button" ${_busy ? 'disabled' : ''}>${_busy ? iconHtml('fa-spinner') + ' 盖楼中…' : iconHtml('fa-comments') + ' AI 盖楼'}</button>
      <button class="th-frm-primary" data-frm-reply="${esc(p.id)}" type="button">${iconHtml('fa-pen')} 我要回帖</button>
    </div>
  </div>`;
}

function backOnly(msg: string): string {
  return `<div class="th-frm-app"><div class="th-frm-topbar"><button class="th-frm-back" data-frm-back="boards" type="button">${iconHtml('fa-arrow-left')}</button><span class="th-frm-title">${esc(msg)}</span></div></div>`;
}

// ==================== 底部 sheet ====================
function newPostInnerHtml(boardId: string): string {
  const b = getBoard(boardId);
  const contacts = getContacts();
  const authorOpts = ['<option value="">我（玩家）</option>']
    .concat(contacts.map(c => `<option value="${esc(c.id)}">${esc(c.name)}（AI 代发）</option>`)).join('');
  return `<div class="th-frm-form">
    <div class="th-frm-set-hint">在「${esc(b?.name || '板块')}」发帖。选「我」就是自己写；选某个角色则由 AI 以其身份生成一帖。</div>
    <label class="th-frm-frow th-frm-frow-stack"><span>发帖身份</span><select class="th-frm-field th-frm-np-author">${authorOpts}</select></label>
    <label class="th-frm-frow th-frm-frow-stack th-frm-np-manual"><span>标题</span><input type="text" class="th-frm-field th-frm-np-title" placeholder="帖子标题"></label>
    <label class="th-frm-frow th-frm-frow-stack th-frm-np-manual"><span>正文</span><textarea class="th-frm-field th-frm-np-content" rows="4" placeholder="说点什么…"></textarea></label>
    <label class="th-frm-frow th-frm-frow-stack th-frm-np-ai" style="display:none"><span>发帖方向（给 AI 的提示，可空）</span><textarea class="th-frm-field th-frm-np-topic" rows="2" placeholder="如：吐槽最近坊市的灵石涨价 / 求问某人下落…"></textarea></label>
    <label class="th-frm-frow"><span>参考最近正文</span><input type="checkbox" class="th-frm-np-floors" ${_useFloors ? 'checked' : ''}></label>
    <div class="th-frm-form-actions"><button class="th-frm-primary" data-frm-np-submit="${esc(boardId)}" type="button" ${_busy ? 'disabled' : ''}>${iconHtml('fa-paper-plane')} 发布</button></div>
  </div>`;
}

function replyInnerHtml(postId: string): string {
  return `<div class="th-frm-form">
    <label class="th-frm-frow th-frm-frow-stack"><span>回帖昵称</span><input type="text" class="th-frm-field th-frm-rp-name" value="我" placeholder="你的昵称"></label>
    <label class="th-frm-frow th-frm-frow-stack"><span>内容</span><textarea class="th-frm-field th-frm-rp-content" rows="3" placeholder="回点什么…" autofocus></textarea></label>
    <div class="th-frm-form-actions"><button class="th-frm-primary" data-frm-rp-submit="${esc(postId)}" type="button">${iconHtml('fa-paper-plane')} 回帖</button></div>
  </div>`;
}

function sheetHtml(): string {
  if (!_sheet) return '';
  let title = ''; let inner = '';
  if (_sheet.kind === 'newBoard') {
    title = '新建板块';
    inner = `<div class="th-frm-form">
      <label class="th-frm-frow th-frm-frow-stack"><span>板块名称</span><input type="text" class="th-frm-field th-frm-nb-name" placeholder="如：江湖传闻" autofocus></label>
      <label class="th-frm-frow th-frm-frow-stack"><span>板块简介（可空）</span><input type="text" class="th-frm-field th-frm-nb-desc" placeholder="这个板块聊些什么"></label>
      <div class="th-frm-form-actions"><button class="th-frm-primary" data-frm-nb-create type="button">${iconHtml('fa-check')} 创建</button></div>
    </div>`;
  } else if (_sheet.kind === 'newPost') {
    title = '发帖';
    inner = newPostInnerHtml(_sheet.boardId);
  } else if (_sheet.kind === 'reply') {
    title = '回帖';
    inner = replyInnerHtml(_sheet.postId);
  }
  return `<div class="th-frm-sheet-mask" data-frm-sheet-close>
    <div class="th-frm-sheet" data-frm-sheet-body>
      <div class="th-frm-sheet-head"><span>${title}</span><button class="th-frm-sheet-x" data-frm-sheet-close type="button">${iconHtml('fa-xmark')}</button></div>
      <div class="th-frm-sheet-content">${inner}</div>
    </div>
  </div>`;
}

// ==================== 渲染 ====================
function render(): void {
  const root = rootEl();
  if (!root) { openApp(); return; }
  let view = '';
  if (_view.name === 'board') view = boardHtml(_view.boardId);
  else if (_view.name === 'post') view = postHtml(_view.postId);
  else view = boardsHtml();
  root.innerHTML = view + sheetHtml();
}
function go(v: ViewState): void { _view = v; _sheet = null; render(); }
function openSheet(s: SheetState): void { _sheet = s; render(); }
function closeSheet(): void { _sheet = null; render(); }

// ==================== AI 生成 ====================
function castBlock(): string {
  const cs = getContacts();
  if (!cs.length) return '（暂无具名熟人，全部用路人。）';
  return cs.slice(0, 12).map(c => `● ${c.name}${c.persona ? `：${c.persona.slice(0, 60)}` : ''}`).join('\n');
}

// AI 以某角色身份发主题帖
async function aiPost(boardId: string, authorContactId: string, topic: string, useFloors: boolean): Promise<void> {
  if (_busy) return;
  const b = getBoard(boardId);
  const c = getContacts().find(x => x.id === authorContactId);
  if (!b || !c) return;
  _busy = true; render();
  try {
    const system = getPromptText('forum.post')
      .replace(/\{\{author\}\}/g, c.name)
      .replace('{{persona}}', c.persona || '（无详细设定，按其名字与板块氛围合理发挥。）')
      .replace('{{board}}', `${b.name}${b.desc ? '（' + b.desc + '）' : ''}`)
      .replace('{{worldBlock}}', worldInfoBlock(useFloors, FLOOR_COUNT))
      .replace('{{topic}}', topic.trim() || '（自由发挥，发一个符合你身份与当下处境的帖子。）');
    const out = await chatGenerate({ system, user: '请发这个帖子。', shouldStream: false });
    const obj = parseLooseJson(out);
    const title = (obj?.title || '').toString().trim() || '（无标题）';
    const content = (obj?.content || '').toString().trim() || out.trim();
    createPost({ boardId, title, author: c.name, authorRef: 'contact:' + c.id, content, isAi: true });
  } catch (e) {
    console.error('[forum] aiPost failed', e);
    try { (getRoot() as any)?.toastr?.error?.('发帖生成失败，请检查 API 设置'); } catch (err) { void err; }
  } finally { _busy = false; render(); }
}

// AI 盖楼：针对某帖生成一批回帖
async function aiReplies(postId: string, count = 4): Promise<void> {
  if (_busy) return;
  const p = getPost(postId);
  if (!p) return;
  const b = getBoard(p.boardId);
  _busy = true; render();
  try {
    const system = getPromptText('forum.replies')
      .replace('{{post}}', `${p.title}\n${p.content}`)
      .replace('{{board}}', `${b?.name || ''}${b?.desc ? '（' + b.desc + '）' : ''}`)
      .replace('{{cast}}', castBlock())
      .replace('{{worldBlock}}', worldInfoBlock(_useFloors, FLOOR_COUNT))
      .replace(/\{\{count\}\}/g, String(count));
    const out = await chatGenerate({ system, user: '请盖楼。', shouldStream: false });
    const arr = parseLooseJson(out);
    if (Array.isArray(arr)) {
      arr.slice(0, count + 2).forEach((r: any) => {
        const author = (r?.author || '路人').toString().trim();
        const content = (r?.content || '').toString().trim();
        if (content) addReply(postId, { author, content, isAi: true });
      });
    }
  } catch (e) {
    console.error('[forum] aiReplies failed', e);
    try { (getRoot() as any)?.toastr?.error?.('盖楼生成失败，请检查 API 设置'); } catch (err) { void err; }
  } finally { _busy = false; render(); }
}

// ==================== 事件委托 ====================
function bindRoot(): void {
  const root = rootEl();
  if (!root || (root as any)._frmBound) return;
  (root as any)._frmBound = true;

  root.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    if (!t) return;
    if (_sheet && onSheetClick(t)) return;

    // 返回
    const back = t.closest('[data-frm-back]') as HTMLElement | null;
    if (back) {
      const to = back.getAttribute('data-frm-back') || 'boards';
      if (to.startsWith('board:')) go({ name: 'board', boardId: to.slice(6) });
      else go({ name: 'boards' });
      return;
    }
    // 板块列表
    const boardDel = t.closest('[data-frm-board-del]') as HTMLElement | null;
    if (boardDel) {
      ev.stopPropagation();
      const id = boardDel.getAttribute('data-frm-board-del') || '';
      const b = getBoard(id);
      if (b && confirmDel(`删除板块「${b.name}」及其下所有帖子？`)) { deleteBoard(id); render(); }
      return;
    }
    const board = t.closest('[data-frm-board]') as HTMLElement | null;
    if (board) { go({ name: 'board', boardId: board.getAttribute('data-frm-board') || '' }); return; }
    if (t.closest('[data-frm-new-board]')) { openSheet({ kind: 'newBoard' }); return; }

    // 板块内
    const newPost = t.closest('[data-frm-new-post]') as HTMLElement | null;
    if (newPost) { openSheet({ kind: 'newPost', boardId: newPost.getAttribute('data-frm-new-post') || '' }); return; }
    const post = t.closest('[data-frm-post]') as HTMLElement | null;
    if (post) { go({ name: 'post', postId: post.getAttribute('data-frm-post') || '' }); return; }

    // 帖子详情
    const aiReply = t.closest('[data-frm-ai-reply]') as HTMLElement | null;
    if (aiReply) { aiReplies(aiReply.getAttribute('data-frm-ai-reply') || ''); return; }
    const reply = t.closest('[data-frm-reply]') as HTMLElement | null;
    if (reply) { openSheet({ kind: 'reply', postId: reply.getAttribute('data-frm-reply') || '' }); return; }
    const postLike = t.closest('[data-frm-post-like]') as HTMLElement | null;
    if (postLike) { togglePostLike(postLike.getAttribute('data-frm-post-like') || ''); render(); return; }
    const postHot = t.closest('[data-frm-post-hot]') as HTMLElement | null;
    if (postHot) {
      const id = postHot.getAttribute('data-frm-post-hot') || '';
      const p = getPost(id);
      if (p) { updatePost(id, { hot: !p.hot }); render(); }
      return;
    }
    const postInject = t.closest('[data-frm-post-inject]') as HTMLElement | null;
    if (postInject) {
      const id = postInject.getAttribute('data-frm-post-inject') || '';
      const p = getPost(id);
      if (p) {
        const top = p.replies.slice(0, 3).map(r => `${r.author}：${r.content}`).join('\n');
        const ok = injectWorldOnce('th_forum_' + id, `【世界论坛热帖】「${p.title}」\n${p.author}：${p.content}${top ? '\n' + top : ''}`);
        try { (getRoot() as any)?.toastr?.[ok ? 'success' : 'info']?.(ok ? '已注入下次正文生成（生效一次）' : '当前环境无注入接口'); } catch (e) { void e; }
      }
      return;
    }
    const postDel = t.closest('[data-frm-post-del]') as HTMLElement | null;
    if (postDel) {
      const id = postDel.getAttribute('data-frm-post-del') || '';
      const p = getPost(id);
      if (p && confirmDel('删除这个帖子？')) { const bid = p.boardId; deletePost(id); go({ name: 'board', boardId: bid }); }
      return;
    }
    const rpLike = t.closest('[data-frm-reply-like]') as HTMLElement | null;
    if (rpLike && _view.name === 'post') { toggleReplyLike(_view.postId, rpLike.getAttribute('data-frm-reply-like') || ''); render(); return; }
    const rpDel = t.closest('[data-frm-reply-del]') as HTMLElement | null;
    if (rpDel && _view.name === 'post') {
      if (confirmDel('删除这条回帖？')) { deleteReply(_view.postId, rpDel.getAttribute('data-frm-reply-del') || ''); render(); }
      return;
    }
  });

  root.addEventListener('change', (ev) => {
    const t = ev.target as HTMLElement;
    if (!t) return;
    if (t.classList.contains('th-frm-np-author')) {
      // 切换发帖身份：我=手动输入，角色=AI 方向提示
      const isAi = !!(t as HTMLSelectElement).value;
      const root2 = rootEl();
      root2?.querySelectorAll('.th-frm-np-manual').forEach(el => { (el as HTMLElement).style.display = isAi ? 'none' : ''; });
      root2?.querySelectorAll('.th-frm-np-ai').forEach(el => { (el as HTMLElement).style.display = isAi ? '' : 'none'; });
    }
    if (t.classList.contains('th-frm-np-floors')) _useFloors = (t as HTMLInputElement).checked;
  });
}

function onSheetClick(t: HTMLElement): boolean {
  if ((t.classList?.contains('th-frm-sheet-mask')) || t.closest('.th-frm-sheet-x')) { closeSheet(); return true; }
  if (!_sheet) return false;

  if (_sheet.kind === 'newBoard' && t.closest('[data-frm-nb-create]')) {
    const name = (qs<HTMLInputElement>('.th-frm-nb-name')?.value || '').trim();
    if (!name) return true;
    const desc = (qs<HTMLInputElement>('.th-frm-nb-desc')?.value || '').trim();
    const b = createBoard({ name, desc });
    go({ name: 'board', boardId: b.id });
    return true;
  }

  const npSubmit = t.closest('[data-frm-np-submit]') as HTMLElement | null;
  if (npSubmit) {
    const boardId = npSubmit.getAttribute('data-frm-np-submit') || '';
    const authorId = qs<HTMLSelectElement>('.th-frm-np-author')?.value || '';
    const useFloors = !!qs<HTMLInputElement>('.th-frm-np-floors')?.checked;
    _useFloors = useFloors;
    if (authorId) {
      // AI 代角色发帖
      const topic = qs<HTMLTextAreaElement>('.th-frm-np-topic')?.value || '';
      closeSheet();
      go({ name: 'board', boardId });
      aiPost(boardId, authorId, topic, useFloors);
    } else {
      const title = (qs<HTMLInputElement>('.th-frm-np-title')?.value || '').trim() || '（无标题）';
      const content = (qs<HTMLTextAreaElement>('.th-frm-np-content')?.value || '').trim();
      if (!content) return true;
      createPost({ boardId, title, author: '我', content });
      closeSheet();
      go({ name: 'board', boardId });
    }
    return true;
  }

  const rpSubmit = t.closest('[data-frm-rp-submit]') as HTMLElement | null;
  if (rpSubmit) {
    const postId = rpSubmit.getAttribute('data-frm-rp-submit') || '';
    const name = (qs<HTMLInputElement>('.th-frm-rp-name')?.value || '我').trim() || '我';
    const content = (qs<HTMLTextAreaElement>('.th-frm-rp-content')?.value || '').trim();
    if (!content) return true;
    addReply(postId, { author: name, content });
    closeSheet();
    return true;
  }
  return false;
}

function confirmDel(msg: string): boolean {
  try { return (getRoot() as any)?.confirm ? (getRoot() as any).confirm(msg) : confirm(msg); } catch (e) { void e; return confirm(msg); }
}

// ==================== 入口 ====================
function openApp(): void {
  openModal2(`${iconHtml('fa-globe')} 世界论坛`, `<div class="th-frm th-phone"><div class="th-phone-island"><span class="th-phone-cam"></span></div><div id="${RID}" class="th-phone-screen"></div></div>`, {
    maxWidth: FRM_MODAL_MAXW, reset: true, revive: openApp,
  });
  bindRoot();
  render();
}

export function openForum(): void {
  _view = { name: 'boards' }; _sheet = null;
  openApp();
}

registerWorldApp({
  id: 'forum', name: '世界论坛', icon: 'fa-comments',
  accent: 'linear-gradient(135deg,#10b981,#0ea5e9)', order: 40, open: openForum,
});

try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_forum__ = { openForum };
} catch (e) { void e; }





