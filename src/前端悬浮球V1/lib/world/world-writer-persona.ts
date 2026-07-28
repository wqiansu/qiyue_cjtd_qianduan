// ============================================================================
// world-writer-persona.ts — 世界套件全局「写手人格」（可选）
//
// 缘由：主面板破限已改「中性解锁·无人格」；人格锚定版（宅女作家月轻轻）迁到这里，
//   作为「世界」套件的一个全局可选项。开启后，这段人格锚定破限会作为额外前置/追加，
//   拼在每个世界 app 自身破限之前（head 段）/ 用户输入之后（append 段）。
//   默认开（存档未显式设 on 时视为开）；用户显式关过则尊重。
//
// 按 role(system/user/assistant) + 位置(head/append) 分段。
//   存 _th_world_writer_persona_v1：{ on, overrides?: {segId: text} }（overrides 覆盖对应段文本；缺省用默认段）。
//   兼容旧存档：旧的 { on, text } 里的整串 text 若非空，作为 legacy override 落到 h1 段（不丢用户改动）。
//
// 与主面板彻底隔离：本模块只被世界侧 ai-chat 读取；主面板 ai-summarize 不碰。
// ============================================================================
import { readWorldJson, writeWorldJson } from './world-store';
import { GEKKA_WRITER_PERSONA_SEGMENTS, type WriterPersonaSeg } from '../config';

const KEY = '_th_world_writer_persona_v1';
export type { WriterPersonaSeg } from '../config';
export type WriterPersonaCfg = { on: boolean; overrides: Record<string, string>; text?: string };

export const WRITER_PERSONA_DEFAULT_SEGMENTS: WriterPersonaSeg[] = GEKKA_WRITER_PERSONA_SEGMENTS;
export const WRITER_PERSONA_DEFAULT_NAME = '宅女作家月轻轻（人格锚定）';

function readRaw(): WriterPersonaCfg {
  const c = readWorldJson<Partial<WriterPersonaCfg>>(KEY, {});
  const overrides = (c.overrides && typeof c.overrides === 'object') ? { ...c.overrides } : {};
  // 兼容旧存档：旧 { on, text } 整串——若有非空 text 且尚无 overrides，作为 h1 段的 legacy 覆盖保留。
  if (typeof c.text === 'string' && c.text.trim() && !Object.keys(overrides).length) {
    overrides['h1'] = c.text;
  }
  // 默认开：存档里没写过 on 字段时视为开启；用户显式关过（存了 on:false）则尊重其选择。
  const on = typeof c.on === 'boolean' ? c.on : true;
  return { on, overrides };
}

export function getWriterPersonaCfg(): WriterPersonaCfg { return readRaw(); }
export function isWriterPersonaOn(): boolean { return readRaw().on; }

export function setWriterPersonaOn(on: boolean): void {
  const c = readRaw();
  writeWorldJson(KEY, { on, overrides: c.overrides });
}
// 覆盖某段文本（空串=恢复该段默认）。
export function setWriterPersonaSegText(segId: string, text: string): void {
  const c = readRaw();
  const overrides = { ...c.overrides };
  if (text && text.trim()) overrides[segId] = text; else delete overrides[segId];
  writeWorldJson(KEY, { on: c.on, overrides });
}
// 恢复全部段默认。
export function resetWriterPersona(): void {
  const c = readRaw();
  writeWorldJson(KEY, { on: c.on, overrides: {} });
}
// 取一段的当前生效文本（覆盖优先，空则默认）。
export function getWriterPersonaSegText(segId: string): string {
  const c = readRaw();
  if (c.overrides[segId] != null) return c.overrides[segId];
  return WRITER_PERSONA_DEFAULT_SEGMENTS.find(s => s.id === segId)?.text || '';
}
export function isWriterPersonaSegOverridden(segId: string): boolean {
  return readRaw().overrides[segId] != null;
}

// 当前生效的全部分段（覆盖优先，保序）。供设置 UI 列表渲染。
export function getWriterPersonaSegments(): WriterPersonaSeg[] {
  const c = readRaw();
  return WRITER_PERSONA_DEFAULT_SEGMENTS.map(s => ({ ...s, text: c.overrides[s.id] != null ? c.overrides[s.id] : s.text }));
}

// 供 ai-chat：若开启则返回按 role/pos 标注的生效分段（含空文本过滤）；未开启返回空数组（零副作用）。
export function getActiveWriterPersonaSegments(): WriterPersonaSeg[] {
  if (!readRaw().on) return [];
  return getWriterPersonaSegments().filter(s => s.text && s.text.trim());
}
