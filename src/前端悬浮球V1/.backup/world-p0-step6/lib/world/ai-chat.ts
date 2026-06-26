// 世界套件 P0 · 通用对话生成流（ai-chat.ts）
// 职责：所有 APP 共用的「组 system（人格+设定+记忆）+ user（历史+新输入+可选正文）→ generate」流。
//   - 复用 resolveGenerateApiConfig（API 预设两维度正交，与 ai-summarize 同口径）。
//   - 复用 generateRaw + ordered_prompts，绕开酒馆 RP 预设/绑定世界书（精确控上下文）。
//   - 提供 makeSummarizer()：给 memory.ts 的注入式 summarize 用（记忆压缩走同一 generate 通道）。
//   - 提供 readTavernFloors()：可选读取酒馆正文最近 N 楼（每 APP 自定义读不读/读几楼）。
import { resolveGenerateApiConfig } from '../preset-env';
import { getRoot } from '../tavern-api';
import { buildMemoryContext, appendTurn, runShortSummary, type MemRole, type MemSummarizer } from './memory';

// 取 generateRaw（window 优先 → getRoot 兜底，§4 跨窗口）
function getGenerateRaw(): ((cfg: any) => Promise<unknown>) | null {
  try {
    const w = window as any;
    if (typeof w.generateRaw === 'function') return w.generateRaw;
    const r = getRoot() as any;
    if (r && typeof r.generateRaw === 'function') return r.generateRaw;
  } catch (e) { void e; }
  return null;
}

function normalizeOut(ret: unknown): string {
  if (typeof ret === 'string') return ret;
  if (ret && typeof ret === 'object' && 'content' in (ret as any)) return String((ret as any).content);
  return ret == null ? '' : JSON.stringify(ret);
}

// 底层一发：自定义 ordered_prompts[system, 'user_input']，可选 json_schema。串行调用方自行保证。
export async function chatGenerate(args: {
  system: string; user: string; jsonSchema?: any; aiPresetName?: string; shouldStream?: boolean;
}): Promise<string> {
  const generateRaw = getGenerateRaw();
  if (!generateRaw) throw new Error('当前环境无 generateRaw 接口');
  const cfg = resolveGenerateApiConfig(args.aiPresetName);
  const genCfg: any = {
    user_input: args.user,
    ordered_prompts: [{ role: 'system', content: args.system }, 'user_input'],
    should_silence: true,
  };
  if (args.jsonSchema) genCfg.json_schema = args.jsonSchema;
  if (args.shouldStream) genCfg.should_stream = true; // 配合 onStreamToken 流式预览
  if (cfg.custom_api) genCfg.custom_api = cfg.custom_api;
  const ret = await generateRaw(genCfg);
  return normalizeOut(ret).trim();
}

// ==================== 流式预览订阅（复用酒馆 STREAM_TOKEN_RECEIVED_FULLY 事件）====================
// 各 APP 在发起 should_stream 生成前调 onStreamToken(cb)，拿到返回的卸载函数；生成结束后调用它停止。
// 无 eventOn 接口时返回 noop（降级，不阻塞）。cb 收到的是「截至目前的完整文本」。
export function onStreamToken(cb: (fullText: string) => void): () => void {
  try {
    const w = window as any;
    const root = getRoot() as any;
    const evOn = (typeof w.eventOn === 'function' ? w.eventOn : null) || (root && typeof root.eventOn === 'function' ? root.eventOn : null);
    const evOff = (typeof w.eventOff === 'function' ? w.eventOff : null) || (root && typeof root.eventOff === 'function' ? root.eventOff : null);
    const events = (w.iframe_events) || (root && root.iframe_events);
    if (typeof evOn !== 'function' || !events?.STREAM_TOKEN_RECEIVED_FULLY) return () => { /* noop */ };
    const handler = (fullText: string) => { try { cb(String(fullText || '')); } catch (e) { void e; } };
    const ret = evOn(events.STREAM_TOKEN_RECEIVED_FULLY, handler);
    return typeof ret === 'function' ? ret : (typeof evOff === 'function' ? () => { try { evOff(events.STREAM_TOKEN_RECEIVED_FULLY, handler); } catch (e) { void e; } } : () => { /* noop */ });
  } catch (e) { void e; return () => { /* noop */ }; }
}

// 给 memory.ts 的注入式 summarizer：把记忆压缩请求走同一 generate 通道。
export function makeSummarizer(aiPresetName?: string): MemSummarizer {
  return ({ system, user }) => chatGenerate({ system, user, aiPresetName });
}

// 容错 JSON 解析：剥 ```json 围栏、找首个 { 或 [，解析失败返回 null。
function parseJsonLoose(raw: string): any {
  if (!raw) return null;
  let s = raw.trim();
  // 去 markdown 围栏
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(s); } catch (e) { void e; }
  // 截取首个 JSON 对象/数组
  const first = s.search(/[[{]/);
  const lastObj = s.lastIndexOf('}');
  const lastArr = s.lastIndexOf(']');
  const last = Math.max(lastObj, lastArr);
  if (first >= 0 && last > first) {
    try { return JSON.parse(s.slice(first, last + 1)); } catch (e) { void e; }
  }
  return null;
}

// 把任意原始输出切成多条「气泡」文本（兜底：模型没按 JSON 输出时，用换行/句末拆分成几条短消息）。
function splitToBubbles(text: string): string[] {
  const t = (text || '').trim();
  if (!t) return [];
  // 优先按显式换行/分隔符
  const byLine = t.split(/\n{1,}/).map(x => x.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine.slice(0, 6);
  return [t];
}

// 可选读取酒馆正文最近 N 楼（去隐藏），拼成文本。读不读/读几楼由 APP 设置决定，这里只取数。
export function readTavernFloors(count: number): string {
  if (!count || count <= 0) return '';
  try {
    const w = window as any;
    const fn = (typeof w.getChatMessages === 'function' ? w.getChatMessages : (getRoot() as any)?.getChatMessages) as
      | ((range: string | number) => any[]) | undefined;
    const lastFn = (typeof w.getLastMessageId === 'function' ? w.getLastMessageId : (getRoot() as any)?.getLastMessageId) as
      | (() => number) | undefined;
    if (!fn || !lastFn) return '';
    const last = lastFn();
    if (typeof last !== 'number' || last < 0) return '';
    const start = Math.max(0, last - count + 1);
    const msgs = fn(`${start}-${last}`) || [];
    return msgs
      .filter((m: any) => m && !m.is_hidden && m.message)
      .map((m: any) => `${m.name || m.role}：${m.message}`)
      .join('\n');
  } catch (e) { void e; return ''; }
}

// 内置兜底输出规则（调用方未传 instruction 时用）。#6：像真人发微信一样，一次回好几条短消息。
const DEFAULT_SINGLE_INSTRUCTION =
  '现在的你正握着手机，和「我」用微信一来一回地聊——你不是在表演，而是真的在过自己的生活。\n'
  + '把此刻的身份、心情和你我之间的关系都代入进去：今天的累、开心、心事，都会渗进你打字的语气里。\n'
  + '像真人发微信那样回：想到哪说到哪，把话拆成 1~{{maxBubbles}} 条短消息，一条一句、有先有后，可以有口头禅、语气词、临时改口、突然补一句的真实感。\n'
  + '该热情就热情、该敷衍就敷衍、该撒娇/吐槽/沉默就照你的性子来——别讨好、别端着、别像客服。\n'
  + '微信里只有你打出来的字：不要旁白、不要动作神态、不要括号里的心理活动、不要写成一大段长文。\n'
  + '严格只输出 JSON：{"messages":["第一条","第二条", ...]}，除此之外不要任何文字。';

const DEFAULT_GROUP_INSTRUCTION =
  '这是一个微信群，群里的人都是活生生、各有脾气的朋友，此刻都在线、都瞥着手机。\n'
  + '请让他们像真人在群里那样自然接话：本轮可由 1~{{maxSpeakers}} 个人冒泡，性子急的先抢话、慢热的后补刀；每人发 1~{{maxBubbles}} 条短消息，一条一句、口语化。\n'
  + '群聊的灵魂是「互相」：接梗、起哄、拌嘴、@对方、跑题、玩梗、突然安静又突然炸出来——让对话有来有回、有节奏、有温度，而不是各说各的轮流播报。\n'
  + '每个人说的话都贴死自己的人设和当下心情，关系好的损得亲、关系生的客气些。\n'
  + '不要长文、不要旁白动作、不要括号心理。严格只输出 JSON：'
  + '{"replies":[{"speaker":"成员名","messages":["第一条","第二条"]}, ...]}，speaker 必须是给定成员之一，按真实发言先后排列，不要任何额外文字。';

// 高层便捷：一次「单聊发言」。组装记忆上下文 + 可选正文 → 生成 → 落库（user+ai 入 buffer，达阈值自动小结）。
// #6：返回多条气泡（string[]），调用方逐条 append 成 bot 式消息。会话 token 由四层记忆控制。
export async function sessionReply(args: {
  sessionId: string;
  persona: string;            // 角色完整设定（人设+外观，调用方拼好）
  userText: string;           // 玩家新消息
  instruction?: string;       // 行为/输出规则（来自可编辑提示词模板 #8）；空=内置兜底
  readFloors?: number;        // 可选读取正文楼层数（0/未传=不读）
  aiPresetName?: string;
  maxBubbles?: number;        // 最多拆几条气泡（默认 5）
}): Promise<string[]> {
  const { sessionId, persona, userText } = args;
  const maxBubbles = Math.max(1, Math.min(8, args.maxBubbles ?? 5));
  const mem = buildMemoryContext(sessionId);
  const floors = args.readFloors ? readTavernFloors(args.readFloors) : '';
  const instruction = (args.instruction || DEFAULT_SINGLE_INSTRUCTION)
    .replace(/\{\{\s*maxBubbles\s*\}\}/g, String(maxBubbles));

  const systemParts = [persona, instruction];
  if (mem.memoryText) systemParts.push('以下是你与对方的记忆，请保持连贯：\n' + mem.memoryText);
  if (floors) systemParts.push('当前剧情正文（参考，勿复述）：\n' + floors);
  const system = systemParts.filter(Boolean).join('\n\n');

  const history = mem.recentTurns.map(t => `${t.role === 'user' ? '我' : '你'}：${t.content}`).join('\n');
  const user = (history ? history + '\n' : '') + '我：' + userText;

  const schema = {
    type: 'object',
    properties: { messages: { type: 'array', items: { type: 'string' } } },
    required: ['messages'],
  };

  appendTurn(sessionId, 'user' as MemRole, userText);
  const raw = await chatGenerate({ system, user, jsonSchema: schema, aiPresetName: args.aiPresetName });

  // 解析多条气泡：JSON {messages:[]} 优先；失败按换行兜底拆分。
  let bubbles: string[] = [];
  const obj = parseJsonLoose(raw);
  if (obj && Array.isArray(obj.messages)) {
    bubbles = obj.messages.map((x: any) => String(x).trim()).filter(Boolean);
  } else if (obj && Array.isArray(obj)) {
    bubbles = obj.map((x: any) => String(x).trim()).filter(Boolean);
  }
  if (!bubbles.length) bubbles = splitToBubbles(raw);
  bubbles = bubbles.slice(0, maxBubbles);
  if (!bubbles.length) bubbles = ['……'];

  // 落库：多条合并为一条 assistant turn（记忆连贯），达阈值自动小结。
  const after = appendTurn(sessionId, 'assistant' as MemRole, bubbles.join('\n'));
  if (after.reachedThreshold) {
    try { await runShortSummary(sessionId, makeSummarizer(args.aiPresetName)); } catch (e) { void e; }
  }
  return bubbles;
}

// 群聊一发：多成员共享一条群记忆。#9：默认一次生成多位成员的多段发言（省 API 调用）。
// forcedSpeaker 指定单人发言；返回扁平的 {speaker, content}[]（按发言顺序，每条 = 一个气泡）。
export async function groupReply(args: {
  sessionId: string;
  members: { name: string; persona: string }[];
  userText: string;
  instruction?: string;       // 行为/输出规则（可编辑模板 #8）；空=内置兜底
  forcedSpeaker?: string;     // 指定发言成员名（空=多人自动）
  multiSpeaker?: boolean;     // #9 默认 true：允许多位成员发言
  maxSpeakers?: number;       // 本轮最多几位发言（默认 3）
  maxBubbles?: number;        // 每人最多几条气泡（默认 3）
  readFloors?: number;
  aiPresetName?: string;
}): Promise<{ speaker: string; content: string }[]> {
  const { sessionId, members, userText } = args;
  const maxSpeakers = Math.max(1, Math.min(members.length || 1, args.maxSpeakers ?? 3));
  const maxBubbles = Math.max(1, Math.min(6, args.maxBubbles ?? 3));
  const mem = buildMemoryContext(sessionId);
  const floors = args.readFloors ? readTavernFloors(args.readFloors) : '';

  const roster = members.map(m => `【${m.name}】${m.persona}`).join('\n\n');
  const baseInstruction = (args.instruction || DEFAULT_GROUP_INSTRUCTION)
    .replace(/\{\{\s*maxSpeakers\s*\}\}/g, String(maxSpeakers))
    .replace(/\{\{\s*maxBubbles\s*\}\}/g, String(maxBubbles));
  const speakRule = args.forcedSpeaker
    ? `本轮只由「${args.forcedSpeaker}」一位发言（messages 里给它的多条消息）。`
    : (args.multiSpeaker === false
        ? '本轮只挑一位最合适的成员发言。'
        : `本轮请安排 1~${maxSpeakers} 位成员发言，让群聊更热闹自然。`);
  const systemParts = [
    `这是一个微信群聊，群成员及各自人设如下：\n${roster}`,
    baseInstruction,
    speakRule,
  ];
  if (mem.memoryText) systemParts.push('群聊记忆（保持连贯）：\n' + mem.memoryText);
  if (floors) systemParts.push('当前剧情正文（参考，勿复述）：\n' + floors);
  const system = systemParts.filter(Boolean).join('\n\n');

  const history = mem.recentTurns.map(t => `${t.role === 'user' ? '我：' : ''}${t.content}`).join('\n');
  const user = (history ? history + '\n' : '') + '我：' + userText;

  const schema = {
    type: 'object',
    properties: {
      replies: {
        type: 'array',
        items: {
          type: 'object',
          properties: { speaker: { type: 'string' }, messages: { type: 'array', items: { type: 'string' } } },
          required: ['speaker', 'messages'],
        },
      },
    },
    required: ['replies'],
  };

  appendTurn(sessionId, 'user' as MemRole, userText);
  const raw = await chatGenerate({ system, user, jsonSchema: schema, aiPresetName: args.aiPresetName });

  const validNames = new Set(members.map(m => m.name));
  const out: { speaker: string; content: string }[] = [];
  const obj = parseJsonLoose(raw);
  const replies = obj && Array.isArray(obj.replies) ? obj.replies : (Array.isArray(obj) ? obj : null);
  if (replies) {
    for (const r of replies) {
      let speaker = String(r?.speaker ?? '').trim();
      if (!validNames.has(speaker)) speaker = args.forcedSpeaker && validNames.has(args.forcedSpeaker) ? args.forcedSpeaker : (members[0]?.name || speaker);
      const msgs = Array.isArray(r?.messages) ? r.messages : (r?.content != null ? [r.content] : []);
      for (const mtext of msgs) {
        const c = String(mtext).trim();
        if (c) out.push({ speaker, content: c });
      }
    }
  }
  // 兜底：没解析出结构，整段当一位发言
  if (!out.length) {
    const speaker = (args.forcedSpeaker && validNames.has(args.forcedSpeaker)) ? args.forcedSpeaker : (members[0]?.name || '群友');
    splitToBubbles(raw).forEach(c => out.push({ speaker, content: c }));
  }
  if (!out.length) out.push({ speaker: members[0]?.name || '群友', content: '……' });

  // 落库：把本轮所有发言合并为一条 assistant turn，区分谁说的。
  const merged = out.map(o => `${o.speaker}：${o.content}`).join('\n');
  const after = appendTurn(sessionId, 'assistant' as MemRole, merged);
  if (after.reachedThreshold) {
    try { await runShortSummary(sessionId, makeSummarizer(args.aiPresetName)); } catch (e) { void e; }
  }
  return out;
}

// 把一段「世界套件交互摘要」注入下次酒馆生成（injectPrompts + once，仅本次有效，绝不改聊天楼层）。
// 各 APP 的「注入正文」开关开启时调用。无接口/失败 → 返回 false（降级，不阻塞）。
function getInjectPrompts(): ((p: any[], opts?: any) => unknown) | null {
  try {
    const w = window as any;
    if (typeof w.injectPrompts === 'function') return w.injectPrompts;
    const r = getRoot() as any;
    if (r && typeof r.injectPrompts === 'function') return r.injectPrompts;
  } catch (e) { void e; }
  return null;
}
export function injectWorldOnce(id: string, content: string): boolean {
  const fn = getInjectPrompts();
  if (!fn || !content.trim()) return false;
  try {
    fn([{ id, position: 'in_chat', depth: 0, role: 'system', content, should_scan: true }], { once: true });
    return true;
  } catch (e) { void e; return false; }
}

// 持久注入（非 once）：内容会一直随后续每次酒馆生成发送，直到 uninjectWorld(id) 移除。
// 世界演化等「长期生效」的注入用这个；返回 false=无接口（降级）。
export function injectWorldPersistent(id: string, content: string): boolean {
  const fn = getInjectPrompts();
  if (!fn || !content.trim()) return false;
  try {
    fn([{ id, position: 'in_chat', depth: 0, role: 'system', content, should_scan: true }]);
    return true;
  } catch (e) { void e; return false; }
}
// 移除一条持久注入（按 id）。window 优先 → getRoot 兜底。
export function uninjectWorld(id: string): boolean {
  try {
    const w = window as any;
    const fn = (typeof w.uninjectPrompts === 'function' ? w.uninjectPrompts : (getRoot() as any)?.uninjectPrompts) as
      | ((ids: string[]) => void) | undefined;
    if (!fn) return false;
    fn([id]);
    return true;
  } catch (e) { void e; return false; }
}

// 给调用方用的容错 JSON 解析（朋友圈多人评论等场景解析模型输出）。
export function parseLooseJson(raw: string): any { return parseJsonLoose(raw); }

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_ai_chat__ = { chatGenerate, makeSummarizer, readTavernFloors, sessionReply, groupReply, injectWorldOnce, injectWorldPersistent, uninjectWorld, parseLooseJson, onStreamToken };
} catch (e) { void e; }
