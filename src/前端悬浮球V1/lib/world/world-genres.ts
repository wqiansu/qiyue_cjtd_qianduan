// 世界线题材通用化（world-genres.ts）
// 12 通用题材，适配不同角色卡。切题材＝「一键换装」：世界态维度的命名/氛围/榜单类别套用该题材预设，
//   别的卡开箱即用。本卡默认「仙侠+校园混合」（本表 key='xianxia_campus'）。
// 纯数据。各字段是「命名/称谓的换装」，不写死具体角色/地名（那些仍读绑定世界书）。
export type WorldGenre = {
  key: string;
  name: string;        // 题材名
  emoji: string;
  blurb: string;       // 一句话定位（选择器展示）
  // 换装词表：世界态各维度在该题材下的称谓（注入推演 system，让 AI 用对味的词）
  orgLabel: string;    // 「势力/组织」这一层叫什么（仙宫→宗门/避难所/贵族院…）
  orgExamples: string; // 该题材下组织的典型形态（提示 AI，不写死本卡专名）
  venueLabel: string;  // 「场所/据点」叫什么（宫殿/教室/据点/庄园…）
  rankLabel: string;   // 「榜单/评价体系」叫什么（万花镜打榜/战力榜/门第…）
  festivalFlavor: string; // 节庆/时令的风味（校园祭/秘境开启/宫廷宴…）
  toneHint: string;    // 该题材推演基调补充（拼进 system）
};

export const WORLD_GENRES: WorldGenre[] = [
  {
    key: 'xianxia_campus', name: '仙侠×校园（本卡默认）', emoji: '🌸',
    blurb: '现代仙宫 + 日式校园，明亮甜蜜女儿国日常',
    orgLabel: '宫殿 / 社团', orgExamples: '掌管不同事务的仙宫、学院里的委员会与社团',
    venueLabel: '宫殿 / 教室 / 灵地', rankLabel: '万花镜打榜（形体之美 / 心灵之美 / 总选举）',
    festivalFlavor: '校园祭 / 体育祭 / 总选举 / 节气灵宴 / 修学旅行',
    toneHint: '现代仙侠×日式校园恋爱喜剧，修仙服务于生活情趣与笑点，全员年轻女孩，明亮无阴暗。',
  },
  {
    key: 'xianxia', name: '仙侠修真', emoji: '⚔️',
    blurb: '洞天福地、宗门传承、御剑飞行的修真世界',
    orgLabel: '宗门 / 仙府', orgExamples: '各大修真宗门、散修联盟、灵植/炼器/丹道世家',
    venueLabel: '洞府 / 灵峰 / 秘境', rankLabel: '天骄榜 / 宗门贡献 / 丹会名次',
    festivalFlavor: '宗门大比 / 秘境开启 / 灵物拍卖会 / 论道大会',
    toneHint: '修真日常与人情，可甜可燃但守明亮基调，不写血腥灭门。',
  },
  {
    key: 'modern', name: '现代都市', emoji: '🏙️',
    blurb: '写字楼、咖啡馆、社交网络的当代都市生活',
    orgLabel: '公司 / 圈子', orgExamples: '公司部门、行业圈子、兴趣社群、朋友圈',
    venueLabel: '写字楼 / 街区 / 店铺', rankLabel: '热搜 / 业绩榜 / 人气博主',
    festivalFlavor: '节假日 / 行业峰会 / 演唱会 / 打折季',
    toneHint: '当代都市生活流，职场与情感交织，轻松不狗血。',
  },
  {
    key: 'jp_campus', name: '日式校园', emoji: '🎒',
    blurb: '樱花、社团、文化祭的青春校园',
    orgLabel: '班级 / 社团', orgExamples: '各年级班级、体育社与文化社、学生会',
    venueLabel: '教室 / 部室 / 天台', rankLabel: '社团人气 / 校内偶像 / 成绩排名',
    festivalFlavor: '入学式 / 文化祭 / 体育祭 / 修学旅行 / 毕业式',
    toneHint: '青春校园群像，社团活动与朦胧心动，明亮治愈。',
  },
  {
    key: 'west_fantasy', name: '西幻魔法', emoji: '🧙',
    blurb: '魔法学院、公会、龙与冒险者的西方奇幻',
    orgLabel: '公会 / 学派', orgExamples: '冒险者公会、魔法学派、骑士团、商会',
    venueLabel: '学院 / 酒馆 / 迷宫', rankLabel: '冒险者等级 / 魔法评级 / 悬赏榜',
    festivalFlavor: '收获祭 / 魔法竞技会 / 迷宫开放日 / 建国庆典',
    toneHint: '剑与魔法的奇幻日常，冒险与伙伴羁绊，热闹明快。',
  },
  {
    key: 'apocalypse', name: '末世废土', emoji: '☢️',
    blurb: '避难所、物资、变异威胁下的求生',
    orgLabel: '避难所 / 势力', orgExamples: '幸存者营地、拾荒团、避难所派系',
    venueLabel: '避难所 / 废墟 / 据点', rankLabel: '贡献值 / 战力评级 / 悬赏',
    festivalFlavor: '物资集市 / 幸存者纪念日 / 据点联防',
    toneHint: '废土求生的坚韧与温情，苦中有乐，守住希望与羁绊，不渲染绝望。',
  },
  {
    key: 'palace', name: '宫廷权谋', emoji: '👑',
    blurb: '深宫、朝堂、位分与恩宠的权谋',
    orgLabel: '宫苑 / 派系', orgExamples: '各宫娘娘、朝堂党派、世家门阀',
    venueLabel: '宫苑 / 朝堂 / 御花园', rankLabel: '位分 / 恩宠 / 门第声望',
    festivalFlavor: '选秀 / 千秋节 / 宫宴 / 祭天大典',
    toneHint: '宫廷日常与机锋，暗涌但不血腥，可甜可智斗，明亮收束。',
  },
  {
    key: 'wuxia', name: '武侠江湖', emoji: '🗡️',
    blurb: '门派、镖局、恩怨情仇的武林',
    orgLabel: '门派 / 帮会', orgExamples: '名门大派、镖局、丐帮、山寨',
    venueLabel: '客栈 / 山门 / 江湖', rankLabel: '兵器谱 / 侠名榜 / 悬赏',
    festivalFlavor: '武林大会 / 华山论剑 / 镖会 / 庙会',
    toneHint: '快意江湖与儿女情长，重情重义，热血明快不惨烈。',
  },
  {
    key: 'scifi', name: '星际科幻', emoji: '🚀',
    blurb: '星舰、殖民星、AI 与星际文明',
    orgLabel: '舰队 / 阵营', orgExamples: '星际舰队、殖民议会、企业财团、AI 集群',
    venueLabel: '星舰 / 空间站 / 殖民星', rankLabel: '军衔 / 贡献点 / 名望榜',
    festivalFlavor: '建国日 / 星际博览 / 舰队阅兵 / 殖民纪念',
    toneHint: '星海探索与科技日常，未来感与人情并存，明亮乐观。',
  },
  {
    key: 'cthulhu', name: '克苏鲁诡秘', emoji: '🐙',
    blurb: '古神、禁忌知识、调查员的诡秘世界',
    orgLabel: '结社 / 调查组', orgExamples: '神秘学结社、调查员小队、教会、学会',
    venueLabel: '古宅 / 图书馆 / 港镇', rankLabel: '声望 / 理智档 / 知识层级',
    festivalFlavor: '祭典夜 / 古物展 / 学会年会 / 港镇集市',
    toneHint: '诡秘氛围与探秘好奇，悬疑气氛为主，克制惊悚、留温情微光。',
  },
  {
    key: 'pastoral', name: '田园经营', emoji: '🌾',
    blurb: '农场、小镇、四季耕作的慢生活',
    orgLabel: '村落 / 商会', orgExamples: '小镇居民、农会、手工艺作坊、集市摊主',
    venueLabel: '农场 / 小镇 / 集市', rankLabel: '丰收评比 / 人气小店 / 手艺榜',
    festivalFlavor: '春耕祭 / 丰收节 / 集市大集 / 四季庆典',
    toneHint: '田园慢生活与邻里温情，柴米油盐的小确幸，松弛治愈。',
  },
  {
    key: 'mystery', name: '悬疑推理', emoji: '🔍',
    blurb: '事务所、案件、线索与推理',
    orgLabel: '事务所 / 警局', orgExamples: '侦探事务所、警局、报社、律所',
    venueLabel: '事务所 / 案发地 / 街区', rankLabel: '破案率 / 名侦探榜 / 声望',
    festivalFlavor: '推理大赛 / 城市庆典 / 展会 / 悬案纪念',
    toneHint: '推理探案的机敏与好奇，悬念为钩，明快不血腥，温情收尾。',
  },
  {
    key: 'ancient', name: '历史古代', emoji: '🏯',
    blurb: '市井、书院、节令的古代生活',
    orgLabel: '书院 / 行会', orgExamples: '书院同窗、行会商帮、乡绅、官府',
    venueLabel: '书院 / 市井 / 府邸', rankLabel: '科举名次 / 才名榜 / 行会声望',
    festivalFlavor: '上元灯节 / 科举放榜 / 庙会 / 节气宴',
    toneHint: '古代市井与人情烟火，诗酒趁年华，明亮雅致。',
  },
];

export function getWorldGenre(key?: string): WorldGenre {
  return WORLD_GENRES.find(g => g.key === key) || WORLD_GENRES[0];
}
// 换装块：拼进推演 system，让 AI 用该题材对味的称谓与风味（不写死具体专名，专名仍读绑定世界书）。
export function buildGenreBlock(key?: string): string {
  const g = getWorldGenre(key);
  return `【世界线题材·${g.name}】${g.toneHint}\n`
    + `· 组织层称「${g.orgLabel}」（如：${g.orgExamples}）；场所称「${g.venueLabel}」；评价体系用「${g.rankLabel}」；节庆时令偏「${g.festivalFlavor}」。\n`
    + `· 以上是命名与风味的换装参考；具体的组织名/地名/人名/职能一律以绑定设定为准，勿套用别卡的专名。`;
}
