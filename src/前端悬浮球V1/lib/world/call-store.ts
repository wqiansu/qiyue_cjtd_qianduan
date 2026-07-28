// 世界套件 · 通话数据层（call-store.ts）
// 模拟电话：通话记录列表 + 单次通话的逐句文字对话（无 TTS，纯文字剧情形态）。
// 每个角色一条「通话会话」，复用记忆引擎（sessionReply）保持连贯。数据纯本地 _th_world_call_v1。
import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

// 一句对话
export type CallLine = {
  id: string;
  who: 'me' | 'peer';      // 我 / 对方
  text: string;
  ts: number;
};

// 通话记录（每个角色一条，含历史对话）
export type CallRecord = {
  id: string;
  contactId?: string;      // 关联联系人
  peerName: string;        // 对方昵称
  lastTs: number;          // 最近通话时间
  duration?: number;       // 最近通话时长（秒，展示用）
  missed?: boolean;        // 未接（角色主动来电未接听）
  lines: CallLine[];       // 历史对话（跨多次通话累积）
};

// 通话设置。
export type CallSettings = {
  useFloors: boolean;          // 通话生成时参考最近正文
  floorCount: number;          // 参考正文读几楼
  maxBubbles: number;          // 对方一次最多说几句
  memoryEnabled: boolean;      // 是否启用通话会话记忆
  worldbookEntryKeys: string[];// 绑定世界书条目（作为设定来源并入生成）
};
const CALL_SET_DEFAULT: CallSettings = {
  useFloors: false, floorCount: 6, maxBubbles: 4, memoryEnabled: true, worldbookEntryKeys: [],
};

type CallData = { records: CallRecord[]; settings?: Partial<CallSettings> };

function rid(p: string): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

function read(): CallData {
  const d = readWorldJson<CallData>(WORLD_LS_KEYS.call, { records: [] });
  if (!d || typeof d !== 'object') return { records: [] };
  if (!Array.isArray(d.records)) d.records = [];
  return d;
}
function write(d: CallData): void { writeWorldJson(WORLD_LS_KEYS.call, d); }

export function getCallSettings(): CallSettings {
  return { ...CALL_SET_DEFAULT, ...(read().settings || {}) };
}
export function updateCallSettings(patch: Partial<CallSettings>): void {
  const d = read(); d.settings = { ...CALL_SET_DEFAULT, ...(d.settings || {}), ...patch }; write(d);
}

export function getRecords(): CallRecord[] {
  return read().records.slice().sort((a, b) => b.lastTs - a.lastTs);
}
export function getRecord(id: string): CallRecord | undefined { return read().records.find(r => r.id === id); }
export function getRecordByContact(contactId: string): CallRecord | undefined {
  return read().records.find(r => r.contactId === contactId);
}

// 确保某角色有一条通话记录（没有则建），返回记录 id。
export function ensureRecord(p: { contactId?: string; peerName: string }): CallRecord {
  const d = read();
  let r = p.contactId ? d.records.find(x => x.contactId === p.contactId) : d.records.find(x => x.peerName === p.peerName);
  if (!r) {
    r = { id: rid('call'), contactId: p.contactId, peerName: p.peerName, lastTs: Date.now(), lines: [] };
    d.records.push(r);
    write(d);
  }
  return r;
}

export function addLine(recordId: string, who: 'me' | 'peer', text: string): CallLine | undefined {
  const d = read();
  const r = d.records.find(x => x.id === recordId);
  if (!r) return undefined;
  const line: CallLine = { id: rid('ln'), who, text, ts: Date.now() };
  r.lines.push(line);
  r.lastTs = Date.now();
  r.missed = false;
  write(d);
  return line;
}

// 标记一次通话结束（记时长，用于通话记录展示）
export function markCallEnd(recordId: string, duration: number): void {
  const d = read();
  const r = d.records.find(x => x.id === recordId);
  if (!r) return;
  r.lastTs = Date.now();
  r.duration = duration;
  write(d);
}
export function markMissed(recordId: string): void {
  const d = read();
  const r = d.records.find(x => x.id === recordId);
  if (!r) return;
  r.missed = true;
  r.lastTs = Date.now();
  write(d);
}
export function deleteRecord(id: string): void {
  const d = read();
  d.records = d.records.filter(r => r.id !== id);
  write(d);
}
export function clearAll(): void { const d = read(); write({ records: [], settings: d.settings }); }
