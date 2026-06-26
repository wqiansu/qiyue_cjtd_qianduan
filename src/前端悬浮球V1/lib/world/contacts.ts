// 世界套件 P0 · 联系人中心（contacts.ts）
// 全套件共享的「人物档案」。微信/世界演化/（后续微博/蜜语/通话）都从这里取对象。
// 来源三类：① 已有人格(AI_PERSONAS) ② 世界书角色档案条目(<char_xxx>) ③ 自定义。
// 数据纯本地 _th_world_contacts_v1（§10.11 决策7）。
import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

export type ContactSource = 'persona' | 'charcard' | 'worldbook' | 'custom';
export type WorldContact = {
  id: string;
  source: ContactSource;
  sourceRef?: string;      // persona: personaId；charcard/worldbook: 条目名/世界书名#uid；custom: 空
  name: string;            // 昵称
  avatar?: string;         // 头像 URL/base64（空=用首字占位）
  persona?: string;        // 角色设定文本（注入 system，组对话身份）
  appearance?: string;     // 外观/形象描述（#5：性别、身材、长相、气质——独立于性格人设）
  gender?: string;         // 性别（#5 默认「女」）
  imageTag?: string;       // 固定形象 tag（comfyui 出图保持一致）
  note?: string;           // 备注
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
    createdAt: t, updatedAt: t,
  };
  list.push(created);
  saveContacts(list);
  return created;
}
export function deleteContact(id: string): void {
  saveContacts(getContacts().filter(c => c.id !== id));
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

// #5 默认外观：未填写时给一份「高挑御姐火爆身材」的女性形象兜底（玩家可在联系人编辑里改）。
export const DEFAULT_APPEARANCE =
  '女性。身材高挑、曲线丰腴而傲人（火辣御姐身材），五官明艳动人、气质成熟妩媚，举手投足间自带从容与魅力。';

// 从世界书条目导入为联系人（#10）。sourceRef = '世界书名#uid'，已导入同源条目则复用。
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
  w.__th_world_contacts__ = { getContacts, getContact, upsertContact, deleteContact };
} catch (e) { void e; }
