import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

export type ExcludeTag = { head: string; tail: string };  // 头部标签 <XXX> / 尾部标签 </XXX>，连同包裹内容一起从读取正文中剔除
export type ExtractTag = { head: string; tail: string };  // 提取标签：只保留 head…tail 之间的内容（必须成对闭合），其余整段丢弃
export type ReadConfig = {
  maxChars: number;           // 读取文本最大字数（0=不限），防止把状态栏 JSON 等塞爆
  extractTags: ExtractTag[];  // 提取规则（双保险·先跑）：只保留这些成对标签内的内容；配了就以「提取」为准，正文外的结构一律不进
  excludeTags: ExcludeTag[];  // 结构标签剔除（后跑）：把这些标签对（及其包裹内容）从读取正文里抠掉，防止结构撑爆字数
  ctxWbKeys: string[];        // 勾选的世界书条目（作为全局上下文注入），entryKey 列表
};

// 默认排除标签：常见会撑爆字数的结构块。head=<XXX>，tail=</XXX>。
//   konatan_planning~ 带波浪号（对齐实际卡片输出）；supplement 补充信息块。
export const DEFAULT_EXCLUDE_TAGS: ExcludeTag[] = [
  { head: '<html>', tail: '</html>' },
  { head: '<roleplay_options>', tail: '</roleplay_options>' },
  { head: '<refine>', tail: '</refine>' },
  { head: '<review>', tail: '</review>' },
  { head: '<think>', tail: '</think>' },
  { head: '<thinking>', tail: '</thinking>' },
  { head: '<options>', tail: '</options>' },
  { head: '<summary>', tail: '</summary>' },
  { head: '<StatusPlaceHolderImpl>', tail: '</StatusPlaceHolderImpl>' },
  { head: '<tucao>', tail: '</tucao>' },
  { head: '<UpdateVariable>', tail: '</UpdateVariable>' },
  { head: '<Analysis>', tail: '</Analysis>' },
  { head: '<JSONPatch>', tail: '</JSONPatch>' },
  { head: '<disclaimer>', tail: '</disclaimer>' },
  { head: '<konatan_planning~>', tail: '</konatan_planning~>' },
  { head: '<supplement>', tail: '</supplement>' },
];

// 默认提取标签（双保险）：正文正常包在 <content>…</content> 里，只提取它即可把所有结构块一次性挡在外面。
export const DEFAULT_EXTRACT_TAGS: ExtractTag[] = [
  { head: '<content>', tail: '</content>' },
];

export const DEFAULT_READ_CONFIG: ReadConfig = {
  maxChars: 20000,            // 最大读取字数 20000
  extractTags: DEFAULT_EXTRACT_TAGS,
  excludeTags: DEFAULT_EXCLUDE_TAGS,
  ctxWbKeys: [],
};

// 提取规则（双保险·先跑）：只保留 head…tail（不含标签自身）之间的内容，其余全部丢弃。
//   必须成对闭合——找不到闭合 tail 的 head 不算命中（避免把半截结构当正文提出来）。
//   同一对标签可在文本里出现多次（多段正文），全部按出现顺序提取拼接。
//   大小写不敏感、跨行、非贪婪到最近的 tail。任一标签配置命中即以「提取结果」为准；
//   全部未命中（正文没被任何提取标签包裹）则返回 null，交回调用方走排除规则兜底。
export function extractByTags(text: string, tags: ExtractTag[]): string | null {
  if (!text || !tags || !tags.length) return null;
  const picked: string[] = [];
  for (const tg of tags) {
    const head = (tg.head || '').trim();
    const tail = (tg.tail || '').trim();
    if (!head || !tail) continue;  // 提取必须成对，缺一不跑
    try {
      const re = new RegExp(escapeRe(head) + '([\\s\\S]*?)' + escapeRe(tail), 'gi');
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const inner = (m[1] || '').trim();
        if (inner) picked.push(inner);
      }
    } catch (e) { void e; }
  }
  if (!picked.length) return null;
  return picked.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

// 用一组标签对剥离文本：移除 head…tail（含标签自身）之间的内容。head/tail 任一为空则跳过。
// 大小写不敏感、跨行、贪婪到最近的 tail；tail 缺失时退化为「移除 head 之后到文末」防残留。
export function stripExcludeTags(text: string, tags: ExcludeTag[]): string {
  if (!text || !tags || !tags.length) return text;
  let out = text;
  for (const tg of tags) {
    const head = (tg.head || '').trim();
    if (!head) continue;
    const tail = (tg.tail || '').trim();
    const h = escapeRe(head);
    try {
      if (tail) {
        const t = escapeRe(tail);
        // ① 正常成对剥离：head…tail 连标签一起删
        out = out.replace(new RegExp(h + '[\\s\\S]*?' + t, 'gi'), '');
        // ② 孤儿闭合标签兜底：若仍残留一个 tail 且其前不再有对应 head（畸形消息：开标签丢失、
        //    只剩闭合），说明有半截结构漏了——把「文首(或上一个已删区)～该孤儿 tail」连同标签删掉，
        //    避免那段无主结构污染正文。只在「有 tail 无 head」时触发，不误伤正常正文。
        if (new RegExp(t, 'i').test(out) && !new RegExp(h, 'i').test(out)) {
          out = out.replace(new RegExp('^[\\s\\S]*?' + t, 'i'), '');
        }
      } else {
        // 只给了头标签：连同其后整段剔除（保守，避免半截结构残留）
        out = out.replace(new RegExp(h + '[\\s\\S]*', 'gi'), '');
      }
    } catch (e) { void e; }
  }
  // 清理因剔除留下的多余空行
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// 存储：{ global: ReadConfig }
type ReadStore = { global: Partial<ReadConfig> };
const LS_KEY = WORLD_LS_KEYS.readcfg;

function readStore(): ReadStore {
  const s = readWorldJson<ReadStore>(LS_KEY, { global: {} });
  return { global: s.global || {} };
}
function writeStore(s: ReadStore): void { writeWorldJson(LS_KEY, s); }

// 全局默认配置（DEFAULT ←玩家全局覆盖）
export function getGlobalReadConfig(): ReadConfig {
  return { ...DEFAULT_READ_CONFIG, ...readStore().global };
}
export function setGlobalReadConfig(patch: Partial<ReadConfig>): void {
  const s = readStore(); s.global = { ...s.global, ...patch }; writeStore(s);
}

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_readcfg__ = { getGlobalReadConfig, setGlobalReadConfig, stripExcludeTags, extractByTags };
} catch (e) { void e; }
