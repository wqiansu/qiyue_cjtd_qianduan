import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

export type CallLine = {
  id: string;
  who: 'me' | 'peer';
  text: string;
  ts: number;
};

export type CallRecord = {
  id: string;
  contactId?: string;
  peerName: string;
  lastTs: number;
  duration?: number;
  missed?: boolean;
  lines: CallLine[];
};

export type CallSettings = {
  useFloors: boolean;
  floorCount: number;
  maxBubbles: number;          // 对方一次最多说几句
  memoryEnabled: boolean;
  worldbookEntryKeys: string[];
  autoInterval: number;        // 每 N 楼自动来一通未接来电（0=关）
  lastFloor: number;           // 上次自动触发楼层
};
const CALL_SET_DEFAULT: CallSettings = {
  useFloors: false, floorCount: 6, maxBubbles: 4, memoryEnabled: true, worldbookEntryKeys: [], autoInterval: 0, lastFloor: 0,
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
