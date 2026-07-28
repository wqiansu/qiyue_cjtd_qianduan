// 世界套件 · 联系人中心（contacts.ts）
// 全套件共享的「人物档案」。微信/世界演化/微博/蜜语/通话都从这里取对象。
// 来源三类：① 已有人格(AI_PERSONAS) ② 世界书角色档案条目(<char_xxx>) ③ 自定义。
// 数据纯本地 _th_world_contacts_v1。
import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';
import { buildInjectFromKeys } from './worldbook';

export type ContactSource = 'persona' | 'charcard' | 'worldbook' | 'custom';
export type WorldContact = {
  id: string;
  source: ContactSource;
  sourceRef?: string;      // persona: personaId；charcard/worldbook: 条目名/世界书名#uid；custom: 空
  name: string;            // 昵称
  avatar?: string;         // 头像 URL/base64（空=用首字占位）
  persona?: string;        // 角色设定文本（注入 system，组对话身份）
  appearance?: string;     // 外观/形象描述（性别、身材、长相、气质——独立于性格人设）
  gender?: string;         // 性别（默认「女」）
  imageTag?: string;       // 固定形象 tag（comfyui 出图保持一致）
  note?: string;           // 备注
  // —— 通讯录管理扩充 ——
  isUser?: boolean;        // 是否为「我」({{user}})——各 app「我」的身份统一取这条
  relationship?: string;   // 与「我」的关系（如：恋人/挚友/师尊/同门）
  birthday?: string;       // 生日（可联动日历，如 03-15 或 327年孟春）
  tags?: string[];         // 标签分组（如：仙宫/同门/暧昧）
  apps?: string[];         // 可见于哪些 app（空=全部可见）
  aliases?: Record<string, string>;  // 每 app 别名/昵称（appId → 该 app 里的名字）
  wbKeys?: string[];       // 绑定的世界书条目（entryKey 列表），作为该人物的额外设定上下文
  archived?: boolean;      // 归档（不在选人列表默认出现）
  createdAt: number;
  updatedAt: number;
};

function uid(): string { return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

export function getContacts(): WorldContact[] {
  return readWorldJson<WorldContact[]>(WORLD_LS_KEYS.contacts, []);
}
function saveContacts(list: WorldContact[]): void {
  writeWorldJson(WORLD_LS_KEYS.contacts, list);
}
export function getContact(id: string): WorldContact | undefined {
  return getContacts().find(c => c.id === id);
}
export function upsertContact(c: Partial<WorldContact> & { name: string; source: ContactSource }): WorldContact {
  const list = getContacts();
  const t = Date.now();
  if (c.id) {
    const i = list.findIndex(x => x.id === c.id);
    if (i >= 0) {
      list[i] = { ...list[i], ...c, updatedAt: t } as WorldContact;
      saveContacts(list);
      return list[i];
    }
  }
  const created: WorldContact = {
    id: c.id || uid(), source: c.source, sourceRef: c.sourceRef,
    name: c.name, avatar: c.avatar, persona: c.persona,
    appearance: c.appearance, gender: c.gender, imageTag: c.imageTag, note: c.note,
    isUser: c.isUser, relationship: c.relationship, birthday: c.birthday,
    tags: c.tags, apps: c.apps, aliases: c.aliases, wbKeys: c.wbKeys, archived: c.archived,
    createdAt: t, updatedAt: t,
  };
  list.push(created);
  saveContacts(list);
  return created;
}
export function deleteContact(id: string): void {
  saveContacts(getContacts().filter(c => c.id !== id));
}

// 「我」({{user}}) 档案：通讯录里 isUser 的那条（对标 ST Persona）。无则返回 undefined。
export function getUserContact(): WorldContact | undefined {
  return getContacts().find(c => c.isUser);
}

// 取某人物绑定世界书条目拼出的上下文（异步；失败降级空串）。各 app 拼该人物设定时可一并带上。
export async function buildContactWbContext(id: string): Promise<string> {
  const c = getContact(id);
  const keys = c?.wbKeys || [];
  if (!keys.length) return '';
  try { return (await buildInjectFromKeys(keys)) || ''; } catch (e) { void e; return ''; }
}

// 各 app 选人用：默认排除归档；可按 app 过滤（apps 为空=全部可见）。
export function listContactsForApp(appId?: string, includeArchived = false): WorldContact[] {
  return getContacts().filter(c => {
    if (c.isUser) return false;
    if (!includeArchived && c.archived) return false;
    if (appId && c.apps && c.apps.length && !c.apps.includes(appId)) return false;
    return true;
  });
}

// 自动回流：app 内新建的成员同步进通讯录（按 source+sourceRef 去重，已存在则补全空字段不覆盖已有）。
// sourceApp 记到 apps，便于「可见于哪些 app」。返回该联系人。
export function reflowContact(p: {
  sourceApp: string; sourceKey: string; name: string;
  avatar?: string; persona?: string; appearance?: string; gender?: string; imageTag?: string;
}): WorldContact {
  const ref = `${p.sourceApp}:${p.sourceKey}`;
  const list = getContacts();
  const exist = list.find(c => c.source === 'custom' && c.sourceRef === ref);
  if (exist) {
    // 补全空字段，不覆盖玩家已编辑内容
    const patch: Partial<WorldContact> = { id: exist.id, source: 'custom', sourceRef: ref, name: exist.name };
    if (!exist.avatar && p.avatar) patch.avatar = p.avatar;
    if (!exist.persona && p.persona) patch.persona = p.persona;
    if (!exist.appearance && p.appearance) patch.appearance = p.appearance;
    if (Object.keys(patch).length > 4) return upsertContact(patch as any);
    return exist;
  }
  return upsertContact({
    source: 'custom', sourceRef: ref, name: p.name || '联系人',
    avatar: p.avatar, persona: p.persona,
    appearance: p.appearance || DEFAULT_APPEARANCE, gender: p.gender || '女', imageTag: p.imageTag,
    apps: [p.sourceApp],
  });
}

// 从已有 AI 人格导入为联系人（来源 persona，sourceRef=人格 id）。已导入过的同源人格直接复用，不重复建。
export function importPersonaContact(p: { id: string; name: string; persona: string }): WorldContact {
  const exist = getContacts().find(c => c.source === 'persona' && c.sourceRef === p.id);
  if (exist) return exist;
  return upsertContact({
    source: 'persona', sourceRef: p.id, name: p.name, persona: p.persona,
    gender: '女', appearance: DEFAULT_APPEARANCE,
  });
}

// 默认外观：未填写时给一份「高挑御姐火爆身材」的女性形象兜底（玩家可在联系人编辑里改）。
export const DEFAULT_APPEARANCE =
  '女性。身材高挑、曲线丰腴而傲人（火辣御姐身材），五官明艳动人、气质成熟妩媚，举手投足间自带从容与魅力。';

// 从世界书条目导入为联系人。sourceRef = '世界书名#uid'，已导入同源条目则复用。
export function importWorldbookContact(p: { book: string; uid: number; name: string; content: string }): WorldContact {
  const ref = `${p.book}#${p.uid}`;
  const exist = getContacts().find(c => c.source === 'worldbook' && c.sourceRef === ref);
  const patch = {
    source: 'worldbook' as ContactSource, sourceRef: ref,
    name: p.name || '世界书角色', persona: p.content,
    gender: '女', appearance: DEFAULT_APPEARANCE,
  };
  if (exist) return upsertContact({ ...patch, id: exist.id });
  return upsertContact(patch);
}

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_contacts__ = { getContacts, getContact, upsertContact, deleteContact, getUserContact, listContactsForApp, reflowContact };
} catch (e) { void e; }
