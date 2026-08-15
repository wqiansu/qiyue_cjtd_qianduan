// 全局横切设置的提示词指令生成（图片字数范围 + 互动用户性别）。
//   所有 app 的「图片描述篇幅」与「人物/路人性别生态」统一读这里，玩家在总体设置里改一次、全 app 生效。
//   约束：纯数据/文本层，不碰 DOM。
import { getWorldConfig } from './world-store';

// 图片描述字数约束（一句话指令，拼进各 app 的 sceneDesc/coverDesc 提示词）。
export function imageWordsDirective(): string {
  const { minWords, maxWords } = getWorldConfig().imageDesc;
  const lo = Math.max(1, Math.min(minWords, maxWords));
  const hi = Math.max(lo, Math.max(minWords, maxWords));
  return `（图片中文描述请控制在 ${lo}-${hi} 字之间，画面信息密度匹配该篇幅：字数少则只点核心看点，字数多则把姿态/穿着/光线/氛围铺开写细）`;
}
// 给 build 时直接取数值的场景。
export function imageWordsRange(): { min: number; max: number } {
  const { minWords, maxWords } = getWorldConfig().imageDesc;
  const lo = Math.max(1, Math.min(minWords, maxWords));
  return { min: lo, max: Math.max(lo, Math.max(minWords, maxWords)) };
}

// 性别生态指令。本卡默认全女性（百合GL），玩家可全局覆盖为全男/男女比例/自定义。
//   各 app 把原本写死的「全女性世界观…」整段替换为本函数返回值。
//   subjectHint：可选，点明本 app 出镜者的范畴（如「商家老板娘、食客、骑手、客服、上门服务者」），
//   让指令更贴合该 app，不传则用通用「出场人物与路人」。
export function genderDirective(subjectHint?: string): string {
  const g = getWorldConfig().gender;
  const who = subjectHint && subjectHint.trim() ? subjectHint.trim() : '出场人物与路人';
  switch (g.mode) {
    case 'allMale':
      return `· 性别生态（全局设置）：${who}默认全部为男性；涉及亲密/情欲时为虚构的男性向/耽美向表演与服务，皆为虚构。`;
    case 'ratio': {
      const male = Math.max(0, Math.min(100, g.malePercent));
      const female = 100 - male;
      return `· 性别生态（全局设置）：${who}按「男性约${male}% / 女性约${female}%」的比例自然混合出现，不要全员同一性别；亲密/情欲关系按出场者实际性别自然展开，皆为虚构。`;
    }
    case 'custom': {
      const txt = (g.customText || '').trim();
      return txt
        ? `· 性别生态（全局设置·自定义）：${who}遵循以下性别设定——${txt}（皆为虚构）。`
        : `· 性别生态（全局设置）：${who}默认全部为女性；涉及亲密/情欲时为虚构的女性向/百合向表演与服务，皆为虚构。`;
    }
    case 'allFemale':
    default:
      return `· 性别生态（全局设置）：${who}默认全部为女性；涉及亲密/情欲时为虚构的女性向/百合向表演与服务，皆为虚构。`;
  }
}

// 单值版：给只需要「默认性别词」的场景（如联系人 gender 默认值、单人描述）。
export function defaultGenderWord(): string {
  const g = getWorldConfig().gender;
  if (g.mode === 'allMale') return '男';
  if (g.mode === 'ratio') return g.malePercent >= 50 ? '男' : '女';
  if (g.mode === 'custom') return '';   // 自定义时不强制单值
  return '女';
}

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_globals__ = { imageWordsDirective, imageWordsRange, genderDirective, defaultGenderWord };
} catch (e) { void e; }
