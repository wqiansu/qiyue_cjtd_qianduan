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
  system: string; user: string; jsonSchema?: any; aiPresetName?: string;
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
  if (cfg.custom_api) genCfg.custom_api = cfg.custom_api;
  const ret = await generateRaw(genCfg);
  return normalizeOut(ret).trim();
}

// 给 memory.ts 的注入式 summarizer：把记忆压缩请求走同一 generate 通道。
export function makeSummarizer(aiPresetName?: string): MemSummarizer {
  return ({ system, user }) => chatGenerate({ system, user, aiPresetName });
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

// 高层便捷：一次「会话发言」。组装记忆上下文 + 可选正文 → 生成 → 落库（user+ai 入 buffer，达阈值自动小结）。
// 返回 AI 回复文本。会话 token 由四层记忆控制。
export async function sessionReply(args: {
  sessionId: string;
  persona: string;          // 角色设定（身份）
  userText: string;         // 玩家新消息
  readFloors?: number;      // 可选读取正文楼层数（0/未传=不读）
  aiPresetName?: string;
}): Promise<string> {
  const { sessionId, persona, userText } = args;
  const mem = buildMemoryContext(sessionId);
  const floors = args.readFloors ? readTavernFloors(args.readFloors) : '';

  const systemParts = [persona];
  if (mem.memoryText) systemParts.push('以下是你与对方的记忆，请保持连贯：\n' + mem.memoryText);
  if (floors) systemParts.push('当前剧情正文（参考，勿复述）：\n' + floors);
  const system = systemParts.filter(Boolean).join('\n\n');

  const history = mem.recentTurns.map(t => `${t.role === 'user' ? '我' : '你'}：${t.content}`).join('\n');
  const user = (history ? history + '\n' : '') + '我：' + userText;

  // 先记玩家消息
  appendTurn(sessionId, 'user' as MemRole, userText);
  const reply = await chatGenerate({ system, user, aiPresetName: args.aiPresetName });
  // 记 AI 回复；达阈值自动小结（summarize 走同通道）
  const after = appendTurn(sessionId, 'assistant' as MemRole, reply);
  if (after.reachedThreshold) {
    try { await runShortSummary(sessionId, makeSummarizer(args.aiPresetName)); } catch (e) { void e; }
  }
  return reply;
}

// 群聊一发：多成员共享一条群记忆。auto=AI 自选发言角色；指定 forcedSpeaker=某成员名。
// 返回 { speaker, content }。落库时 user 记玩家、assistant 记「成员名：内容」（区分谁说的）。
export async function groupReply(args: {
  sessionId: string;
  members: { name: string; persona: string }[];
  userText: string;
  forcedSpeaker?: string;   // 指定发言成员名（空=AI 自选）
  readFloors?: number;
  aiPresetName?: string;
}): Promise<{ speaker: string; content: string }> {
  const { sessionId, members, userText } = args;
  const mem = buildMemoryContext(sessionId);
  const floors = args.readFloors ? readTavernFloors(args.readFloors) : '';

  const roster = members.map(m => `【${m.name}】${m.persona}`).join('\n\n');
  const speakRule = args.forcedSpeaker
    ? `本轮必须以「${args.forcedSpeaker}」的身份回复。`
    : '请你从群成员中挑选此刻最合适发言的一位，以其身份回复（speaker 必须是上面成员之一的名字）。';
  const systemParts = [
    `这是一个群聊，群成员及各自人设如下：\n${roster}`,
    speakRule,
    '只输出一位成员的一条发言。',
  ];
  if (mem.memoryText) systemParts.push('群聊记忆（保持连贯）：\n' + mem.memoryText);
  if (floors) systemParts.push('当前剧情正文（参考，勿复述）：\n' + floors);
  const system = systemParts.filter(Boolean).join('\n\n');

  const history = mem.recentTurns.map(t => `${t.role === 'user' ? '我' : ''}${t.content}`).join('\n');
  const user = (history ? history + '\n' : '') + '我：' + userText;

  appendTurn(sessionId, 'user' as MemRole, userText);
  const schema = {
    type: 'object',
    properties: { speaker: { type: 'string' }, content: { type: 'string' } },
    required: ['speaker', 'content'],
  };
  const raw = await chatGenerate({ system, user, jsonSchema: schema, aiPresetName: args.aiPresetName });
  let speaker = args.forcedSpeaker || (members[0]?.name || '');
  let content = raw;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') {
      if (obj.speaker) speaker = String(obj.speaker);
      if (obj.content) content = String(obj.content);
    }
  } catch (e) { void e; /* 非 JSON：整段作内容，speaker 用兜底 */ }

  const after = appendTurn(sessionId, 'assistant' as MemRole, `${speaker}：${content}`);
  if (after.reachedThreshold) {
    try { await runShortSummary(sessionId, makeSummarizer(args.aiPresetName)); } catch (e) { void e; }
  }
  return { speaker, content };
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

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_ai_chat__ = { chatGenerate, makeSummarizer, readTavernFloors, sessionReply, groupReply, injectWorldOnce };
} catch (e) { void e; }
