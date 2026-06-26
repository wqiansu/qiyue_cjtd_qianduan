// 批次4a · AI 总结 schema + 解析容错 + 归一化（§E.6 / §E.7）
// 统一返回形状：{ results: [{ task_id, items: [...] }] }（§E.6 schema 形状统一）
// 解析：generate 传 json_schema 时返回值是 string|object，去 ```json fence → JSON.parse → 失败用 jsonrepair 兜底。
// 归一化：按桶 kind 清洗字段（数字字段、衣物枚举、tags、links 过滤防幻觉），不依赖 AI 返回 kind 字段。
import { jsonrepair } from 'jsonrepair';
import type { AiSummaryPromptKind } from './config';

// ==================== json_schema 定义（按 kind）====================
// generate 的 json_schema 字段接受 JSON Schema 对象（@types/function/generate.d.ts:310）。

type LinksShape = { locations?: string[]; events?: string[]; dlcs?: string[] };

// location/event 卡片结构（含可选 links，注入后联动建关联 §E.7 #26）
const locEventItemSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: '名称' },
    desc: { type: 'string', description: '一句话简介' },
    tags: { type: 'array', items: { type: 'string' }, description: '标签（可选）' },
    links: {
      type: 'object',
      properties: {
        locations: { type: 'array', items: { type: 'string' } },
        events: { type: 'array', items: { type: 'string' } },
        dlcs: { type: 'array', items: { type: 'string' } },
      },
      description: '关联的地点/事件/DLC 名（可选，只填原文明确提到的）',
    },
  },
  required: ['name', 'desc'],
  additionalProperties: false,
};

const itemSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    数量: { type: 'integer', description: '默认1' },
    简介: { type: 'string' },
    效果: { type: 'string' },
    评价: { type: 'string' },
  },
  required: ['name'],
  additionalProperties: false,
};
const skillSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    等级: { type: 'integer', description: '默认1' },
    简介: { type: 'string' },
    效果: { type: 'string' },
    评价: { type: 'string' },
  },
  required: ['name'],
  additionalProperties: false,
};
const statusSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    效果: { type: 'string' },
    来源: { type: 'string' },
    持续时间: { type: 'string' },
  },
  required: ['name'],
  additionalProperties: false,
};
const clothingSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    穿着部位: { type: 'string' },
    穿着情况: { type: 'string', enum: ['穿着', '脱下'] },
    破损状态: { type: 'string', enum: ['完好无缺', '轻微破损', '中度破损', '严重破坏'] },
    外观详情: { type: 'string' },
    衣物状态: { type: 'string' },
    评价: { type: 'string' },
  },
  required: ['name'],
  additionalProperties: false,
};

const ITEM_SCHEMA_BY_KIND: Record<AiSummaryPromptKind, object> = {
  location: locEventItemSchema,
  event: locEventItemSchema,
  'stash-item': itemSchema,
  'stash-skill': skillSchema,
  'stash-status': statusSchema,
  'stash-clothing': clothingSchema,
};

// 统一外层 schema：{ results: [{ task_id, items: [...] }] }
export function buildJsonSchema(kind: AiSummaryPromptKind): object {
  return {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            task_id: { type: 'string' },
            items: { type: 'array', items: ITEM_SCHEMA_BY_KIND[kind] },
          },
          required: ['task_id', 'items'],
          additionalProperties: false,
        },
      },
    },
    required: ['results'],
    additionalProperties: false,
  };
}

// ==================== 解析容错（§E.6 返回值处理 + 优化建议1）====================

export type ParsedAiResult = { results: { task_id: string; items: any[] }[] };

function stripFence(s: string): string {
  let t = s.trim();
  // 去 ```json ... ``` 代码块围栏
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (m) t = m[1].trim();
  return t;
}

// 解析 generate 返回值（string | object）。失败 throw Error（含中文提示）。
export function parseAiResult(raw: unknown): ParsedAiResult {
  let obj: any;
  if (raw && typeof raw === 'object') {
    obj = raw;
  } else if (typeof raw === 'string') {
    const text = stripFence(raw);
    try {
      obj = JSON.parse(text);
    } catch {
      // jsonrepair 兜底（AI 可能返回半截 JSON 或尾随逗号）
      try { obj = JSON.parse(jsonrepair(text)); } catch (e) {
        throw new Error('AI 返回无法解析为 JSON（jsonrepair 也未能修复）');
      }
    }
  } else {
    throw new Error('AI 返回为空');
  }
  // 兼容三种形状：{results:[...]} / [{task_id,items}] / {items:[...]}
  let results: any[] = [];
  if (Array.isArray(obj)) results = obj;
  else if (Array.isArray(obj?.results)) results = obj.results;
  else if (Array.isArray(obj?.items)) results = [{ task_id: '', items: obj.items }];
  else if (obj?.name) results = [{ task_id: '', items: [obj] }]; // 单对象兜底
  else throw new Error('AI 返回结构不含 results/items');
  return { results };
}

// ==================== 归一化（§E.7 #22）====================
// 按桶 kind 清洗。返回 { items, links } — items 是该桶所有任务的 items 合并；links 按 task/name 收集（仅 location/event）。

const CLOTHING_WEAR = ['穿着', '脱下'];
const CLOTHING_DAMAGE = ['完好无缺', '轻微破损', '中度破损', '严重破坏'];

export type NormalizedItem = {
  name: string;
  desc?: string;
  tags?: string[];
  fields?: Record<string, string | number>;  // 储藏间4类的结构化字段
  links?: LinksShape;                          // 仅 location/event
};

export type NormalizeOutput = {
  items: NormalizedItem[];
  // links 收集：按「卡片名」→ links，供注入后调 syncBidirLink（仅 location/event 有值）
  linksByName: Record<string, LinksShape>;
};

function toStrArr(v: any): string[] {
  if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
  return [];
}

export function normalizeItems(kind: AiSummaryPromptKind, rawItems: any[]): NormalizeOutput {
  const items: NormalizedItem[] = [];
  const linksByName: Record<string, LinksShape> = {};
  for (const it of rawItems) {
    if (!it || typeof it !== 'object') continue;
    const name = String(it.name ?? '').trim();
    if (!name) continue;
    if (kind === 'location' || kind === 'event') {
      const item: NormalizedItem = { name, desc: String(it.desc ?? '').trim() };
      const tags = toStrArr(it.tags);
      if (tags.length) item.tags = tags;
      const links: LinksShape = {};
      const locs = toStrArr(it?.links?.locations);
      const evs = toStrArr(it?.links?.events);
      const dlcs = toStrArr(it?.links?.dlcs);
      if (locs.length) links.locations = locs;
      if (evs.length) links.events = evs;
      if (dlcs.length) links.dlcs = dlcs;
      if (Object.keys(links).length) { item.links = links; linksByName[name] = links; }
      items.push(item);
    } else if (kind === 'stash-item') {
      items.push({ name, fields: { 数量: num(it.数量, 1), 简介: str(it.简介), 效果: str(it.效果), 评价: str(it.评价) } });
    } else if (kind === 'stash-skill') {
      items.push({ name, fields: { 等级: num(it.等级, 1), 简介: str(it.简介), 效果: str(it.效果), 评价: str(it.评价) } });
    } else if (kind === 'stash-status') {
      items.push({ name, fields: { 效果: str(it.效果), 来源: str(it.来源), 持续时间: str(it.持续时间) } });
    } else if (kind === 'stash-clothing') {
      const wear = CLOTHING_WEAR.includes(it.穿着情况) ? it.穿着情况 : '穿着';
      const dmg = CLOTHING_DAMAGE.includes(it.破损状态) ? it.破损状态 : '完好无缺';
      items.push({ name, fields: { 穿着部位: str(it.穿着部位), 穿着情况: wear, 破损状态: dmg, 外观详情: str(it.外观详情), 衣物状态: str(it.衣物状态), 评价: str(it.评价) } });
    }
  }
  return { items, linksByName };
}

function num(v: any, dft: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : dft;
}
function str(v: any): string { return v == null ? '' : String(v).trim(); }
