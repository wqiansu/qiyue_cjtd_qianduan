// 批次6 反馈5 · 角色卡内嵌世界书（character_book）读写封装。
// 现状：初始数据写进「角色卡绑定的独立世界书」（getCharWorldbookList），随卡分享时独立世界书不一定跟着走。
// 新载体：把 [初始·xxx] 条目读写进角色卡自身的 data.character_book.entries（v2 卡内嵌世界书），随卡走。
// 经 getCharData('current') 读、updateCharacterWith('current', ...) 写。跨窗口走 getRoot() 兜底。
// 内嵌条目结构对齐 WorldbookEntry 子集（name/content/enabled/constant 语义），但实际是酒馆 character_book entry 形状。
import { getRoot } from './tavern-api';

function getFn(name: string): any {
  try {
    const w = window as any;
    if (typeof w[name] === 'function') return w[name];
    const p = getRoot();
    if (p && typeof p[name] === 'function') return p[name];
  } catch (e) { void e; }
  return null;
}

// 内嵌世界书条目（最小可用形状）：与状态栏只关心 name/content/enabled。
export type CharBookEntry = { name: string; content: string; enabled: boolean };

// 取当前角色卡的 character_book entries 原始数组（未做形状归一）。无则返回空数组。
function rawCharBookEntries(): any[] {
  const getCharData = getFn('getCharData');
  if (!getCharData) return [];
  let data: any = null;
  try { data = getCharData('current'); } catch (e) { void e; return []; }
  const book = data && data.data && data.data.character_book;
  const entries = book && Array.isArray(book.entries) ? book.entries : [];
  return entries;
}

// 角色卡是否可用内嵌世界书（有 getCharData 且能读到当前卡）。
export function hasCharBook(): boolean {
  const getCharData = getFn('getCharData');
  if (!getCharData) return false;
  try { return !!getCharData('current'); } catch { return false; }
}

// 读全部内嵌条目（归一为 CharBookEntry）。
export function readCharBookEntries(): CharBookEntry[] {
  return rawCharBookEntries().map((e: any) => ({
    name: String((e && (e.comment ?? e.name)) || ''),  // ST 内嵌条目用 comment 作名称
    content: String((e && e.content) || ''),
    enabled: !(e && e.enabled === false),
  })).filter(e => e.name);
}

// 按名取内嵌条目 content（多条同名取第一条）。无返回 null。
export function getCharBookEntryByName(name: string): string | null {
  for (const e of rawCharBookEntries()) {
    const n = (e && (e.comment ?? e.name)) || '';
    if (n === name) return String(e.content || '');
  }
  return null;
}

// 写入/覆盖一条内嵌条目（name 匹配则覆盖 content，否则新建蓝灯禁用条目）。
// 经 updateCharacterWith 改卡——破坏性操作，调用方应先二次确认。
export async function writeCharBookEntry(name: string, content: string): Promise<void> {
  const updateCharacterWith = getFn('updateCharacterWith');
  if (!updateCharacterWith) throw new Error('当前环境无 updateCharacterWith 接口');
  await updateCharacterWith('current', (character: any) => {
    if (!character.data) character.data = {};
    if (!character.data.character_book) character.data.character_book = { entries: [] };
    if (!Array.isArray(character.data.character_book.entries)) character.data.character_book.entries = [];
    const entries: any[] = character.data.character_book.entries;
    const idx = entries.findIndex(e => ((e && (e.comment ?? e.name)) || '') === name);
    if (idx >= 0) {
      entries[idx] = { ...entries[idx], content };
    } else {
      // 新建内嵌条目：蓝灯 constant + 禁用（数据源不需激活注入），keys 空，comment 作名称。
      entries.push({
        keys: [], content, comment: name, name,
        enabled: false, constant: true,
        insertion_order: 100, selective: false, position: 0,
        extensions: {},
      });
    }
    return character;
  });
}
