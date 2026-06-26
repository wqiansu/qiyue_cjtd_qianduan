// 世界套件 P0 · 联系人中心（contacts.ts）
// 全套件共享的「人物档案」。微信/世界演化/（后续微博/蜜语/通话）都从这里取对象。
// 来源三类：① 已有人格(AI_PERSONAS) ② 世界书角色档案条目(<char_xxx>) ③ 自定义。
// 数据纯本地 _th_world_contacts_v1（§10.11 决策7）。
import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

export type ContactSource = 'persona' | 'charcard' | 'custom';
export type WorldContact = {
  id: string;
  source: ContactSource;
  sourceRef?: string;      // persona: personaId；charcard: 条目名；custom: 空
  name: string;            // 昵称
  avatar?: string;         // 头像 URL/base64（空=用首字占位）
  persona?: string;        // 角色设定文本（注入 system，组对话身份）
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
    name: c.name, avatar: c.avatar, persona: c.persona, imageTag: c.imageTag, note: c.note,
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
  return upsertContact({ source: 'persona', sourceRef: p.id, name: p.name, persona: p.persona });
}

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_contacts__ = { getContacts, getContact, upsertContact, deleteContact };
} catch (e) { void e; }
