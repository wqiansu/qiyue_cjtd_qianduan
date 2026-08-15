// 设计理念：
//   预设只声明「这出戏怎么玩」（剧种特色 + 默认基调 + 放飞度 + 选角策略），具体世界观/人物/地点等硬设定
//   一律靠「绑定世界书」在生成时供给（buildInjectFromKeys）——改设定只改世界书、不动这里的 prompt。
//   promptExtra 注入到 {{playRule}} 占位，作为该剧种对 theater.play/continue 的补充导演笔记。
//
// 基调铁律（全卡通用）：现代仙侠 × 高维仙宫 × 日式校园恋爱喜剧；全女性百合 GL（可被全局性别覆盖）；
//   明亮轻松甜蜜搞笑，无阴暗面。小剧场比正文更「放飞」：允许打破第四面墙、平行宇宙、if 线、玩梗，
//   但身份严格锁定（角色说话腔调/性格贴合其设定，不串角色）。涩涩番外（r18）受全局色情度/肉欲度联动。
//   纯数据，不碰 DOM、不碰 generate。
import { registerPromptTemplate, getPromptText } from './world-prompts';

// 一出戏的类型标签（影响提示词导引与卡片配色）
export type PlayType =
  | 'extend'    // 从正文延伸（缝隙番外/白日梦/预演）
  | 'parallel'  // 平行世界 / AU（架空设定）
  | 'whatif'    // 如果线（改一个正文节点会怎样）
  | 'timeline'  // 时间线脑洞（穿越/重生/未来/童年）
  | 'variety'   // 综艺伪节目（伪纪录片/访谈/真人秀）
  | 'sidestory' // 纯番外日常（与正文无关的独立小品）
  | 'r18'       // 涩涩番外
  | 'moe';      // 萌系轻松（幼态/日常治愈/沙雕）

// 选角策略：进戏时如何默认拉演员（可在选角面板改）
//   onScene = 在场仙主 + 主角；pick = 让玩家挑；pair = 挑 2 人演对手戏；harem = 尽量多拉在场者群像；
//   auto = 读最近正文识别在场者；main = 以主角为中心
export type CastStrategy = 'onScene' | 'pick' | 'pair' | 'harem' | 'auto' | 'main';

export type PlayPreset = {
  key: string;          // 唯一标识
  name: string;         // 剧种名
  group: string;        // 八大类分组（宫格折叠）
  icon: string;         // lucide 图标名（缺名会补，防白块）
  blurb: string;        // 一句话卖点
  type: PlayType;
  defaultTone: string;  // 默认基调透镜 key（见 THEATER_TONES）
  defaultRiot: number;  // 默认放飞度 0-100（越高越破格/OOC/玩梗）
  r18?: boolean;        // 是否涩涩番外（受全局色情度联动，默认关时不影响）
  castStrategy: CastStrategy;
  promptExtra: string;  // 注入 {{playRule}}：该剧种的特色导演笔记（不写死世界观事实）
};

// ============ 基调透镜（罩住整出戏的色彩与节奏；供给制，不写死设定） ============
export type TheaterTone = { key: string; emoji: string; name: string; hint: string; inject: string };
export const THEATER_TONES: TheaterTone[] = [
  { key: 'sweet', emoji: '🍬', name: '甜蜜恋爱', hint: '心动、暧昧、糖分拉满', inject: '整体基调：甜蜜恋爱番，心动与暧昧拉满，节奏轻快，处处是糖，让人看了会心一笑或脸红心跳。' },
  { key: 'comedy', emoji: '😂', name: '无厘头搞笑', hint: '沙雕、玩梗、节奏快', inject: '整体基调：无厘头爆笑喜剧，节奏飞快、脑洞大开、玩梗不停，怎么好笑怎么来，允许夸张与吐槽。' },
  { key: 'heal', emoji: '🌿', name: '治愈日常', hint: '温柔、慢节奏、暖意', inject: '整体基调：温柔治愈的日常番，慢节奏、有生活气与暖意，把小事写得动人，余味悠长。' },
  { key: 'drama', emoji: '🎭', name: '狗血修罗', hint: '争宠、反转、戏剧张力', inject: '整体基调：狗血又好看的争宠修罗场，戏剧张力拉满、反转不断、火药味十足，但底色仍是甜蜜玩闹，不致郁。' },
  { key: 'dream', emoji: '💫', name: '梦幻脑洞', hint: '天马行空、超现实', inject: '整体基调：天马行空的梦幻脑洞，超现实、无逻辑约束、想象力优先，像做了一个瑰丽荒诞的梦。' },
  { key: 'spicy', emoji: '🔥', name: '暧昧撩人', hint: '心跳、张力、情欲暗涌', inject: '整体基调：暧昧撩人、情欲暗涌，肢体与眼神的张力拉满，暧昧到呼吸急促，尺度随放飞度与全局色情度浮动。' },
  { key: 'bittersweet', emoji: '🥀', name: '微虐be美学', hint: '揪心、遗憾、但不致郁', inject: '整体基调：微虐 be 美学，有揪心、遗憾、意难平的情绪张力，把「差一点」的酸楚写得很美——但只是「微虐」，最后要留一丝暖光或和解余地，绝不真正致郁或写死。' },
  { key: 'mystery', emoji: '🕵️', name: '悬疑惊悚', hint: '悬念、反转、无血腥', inject: '整体基调：悬疑惊悚，靠悬念、伏笔、心理张力与反转推进，气氛紧绷、抽丝剥茧——但保持轻惊悚，不写血腥暴力与真正的死亡，谜底揭晓要有智性快感。' },
  { key: 'heroic', emoji: '⚡', name: '热血燃向', hint: '燃、成长、并肩作战', inject: '整体基调：热血燃向，节奏昂扬、情绪high点密集，强调信念、成长与并肩作战的羁绊，让人看了想握拳；甜是并肩战斗里迸出的火花。' },
  { key: 'gufeng', emoji: '🏮', name: '古风雅致', hint: '古典、留白、诗意', inject: '整体基调：古风雅致，遣词造句古典含蓄、讲究意境留白与诗意，情感克制而绵长，一颦一笑皆有韵味。' },
  { key: 'cyber', emoji: '🌃', name: '赛博未来', hint: '霓虹、科技、疏离感', inject: '整体基调：赛博未来，霓虹与雨夜、义体与代码交织的近未来都市感，带点疏离与孤独，却在冰冷科技里生出滚烫的情。' },
];
export function getTheaterTone(key: string): TheaterTone {
  return THEATER_TONES.find(t => t.key === key) || THEATER_TONES[0];
}

// ============ 40+ 套预设 · 八大类 ============
export const THEATER_PRESETS: PlayPreset[] = [
  // ========== A. 争宠修罗场（onScene/harem，狗血甜） ==========
  { key: 'a.jealous', name: '醋意大爆发', group: 'A · 争宠修罗场', icon: 'fire', blurb: '谁多看了主角一眼，全场炸锅', type: 'sidestory', defaultTone: 'drama', defaultRiot: 55, castStrategy: 'harem',
    promptExtra: '这是一场围绕主角的争宠大戏：在场的仙主们因为一点小事（主角多夸了谁一句、给谁夹了菜）集体吃醋、明争暗斗、彼此拆台又互相试探。火药味拉满但都是可爱的醋意，最后往甜里收。' },
  { key: 'a.confess_war', name: '表白抢跑赛', group: 'A · 争宠修罗场', icon: 'heart', blurb: '谁先跟主角告白就赢了', type: 'sidestory', defaultTone: 'drama', defaultRiot: 55, castStrategy: 'harem',
    promptExtra: '在场角色为了抢先向主角表白展开一场荒诞竞速：有人写情书、有人搞浪漫突袭、有人临阵怯场。互相使绊子、抢时机，笑料百出，甜度爆表。' },
  { key: 'a.midnight_raid', name: '深夜爬床大战', group: 'A · 争宠修罗场', icon: 'moon', blurb: '半夜三更，谁都想溜进主角房间', type: 'r18', defaultTone: 'spicy', defaultRiot: 65, r18: true, castStrategy: 'harem',
    promptExtra: '深夜，好几位仙主都想偷偷溜进主角的房间，却在走廊/门口撞个正着，于是上演一场心照不宣又互不相让的暗夜攻防。暧昧、争抢、脸红心跳，尺度随放飞度与全局色情度浮动。' },
  { key: 'a.who_cooks', name: '投喂争夺战', group: 'A · 争宠修罗场', icon: 'utensils', blurb: '「今天由我来照顾主角！」', type: 'sidestory', defaultTone: 'comedy', defaultRiot: 45, castStrategy: 'harem',
    promptExtra: '为了争夺「今天谁来照顾主角起居/做饭/送早餐」的资格，众仙主展开一场生活流的可爱竞争，各显神通又频频翻车，日常烟火气里全是爱意。' },
  { key: 'a.exposed_diary', name: '恋爱日记曝光', group: 'A · 争宠修罗场', icon: 'notebook-pen', blurb: '不小心翻到了谁的私密小本本', type: 'sidestory', defaultTone: 'drama', defaultRiot: 50, castStrategy: 'pick',
    promptExtra: '某位仙主写满对主角心事的私密日记/手账不慎被众人翻到，当事人当场社死、其他人起哄或吃醋，一场羞耻又甜蜜的围观大戏。' },

  // ========== B. 校园喜剧（校园降维反差，甜闹） ==========
  { key: 'b.classroom', name: '课堂突发事件', group: 'B · 校园喜剧', icon: 'graduation-cap', blurb: '把修仙大能塞进普通教室会怎样', type: 'sidestory', defaultTone: 'comedy', defaultRiot: 45, castStrategy: 'onScene',
    promptExtra: '把角色降维成一所普通学园的学生，演一段课堂上的突发喜剧：抽背翻车、传纸条被抓、打瞌睡被点名、用术法作弊穿帮……修仙大能被降维成高中生的反差感是灵魂。具体校园设定读绑定的设定资料。' },
  { key: 'b.festival', name: '学园祭筹备', group: 'B · 校园喜剧', icon: 'flag', blurb: '女仆咖啡厅还是鬼屋？吵起来了', type: 'sidestory', defaultTone: 'sweet', defaultRiot: 40, castStrategy: 'onScene',
    promptExtra: '学园祭/文化祭筹备现场：为了班级要开女仆咖啡厅还是鬼屋、谁穿女仆装、谁负责宣传吵成一团，青春热血又甜蜜的经典校园动漫桥段。' },
  { key: 'b.rooftop', name: '天台的午休', group: 'B · 校园喜剧', icon: 'cloud-sun', blurb: '便当、告白、和一整个下午的风', type: 'extend', defaultTone: 'heal', defaultRiot: 30, castStrategy: 'pair',
    promptExtra: '午休的天台，两个人分享一份便当，有一搭没一搭地聊天，风很软、气氛微妙，暧昧在空气里发酵。经典日系校园治愈名场面。' },
  { key: 'b.club_recruit', name: '社团招新混战', group: 'B · 校园喜剧', icon: 'people-group', blurb: '「加入我们社团吧！」拉客大战', type: 'sidestory', defaultTone: 'comedy', defaultRiot: 45, castStrategy: 'onScene',
    promptExtra: '社团招新日，各路社团（电竞社/天文社/躺平部……以绑定设定为准）为抢新生使出浑身解数，摆摊、cosplay、才艺展示、互相抢人，热闹又沙雕。' },
  { key: 'b.rain_umbrella', name: '放学后的一把伞', group: 'B · 校园喜剧', icon: 'droplets', blurb: '突然下雨，只有一把伞', type: 'extend', defaultTone: 'sweet', defaultRiot: 30, castStrategy: 'pair',
    promptExtra: '放学突降大雨，两人只有一把伞（或一个没带伞），于是共撑一把伞回家，肩膀挨着肩膀，谁都不说话却心跳如鼓。少女漫经典心动名场面。' },
  { key: 'b.exam_panic', name: '考前突击夜', group: 'B · 校园喜剧', icon: 'clock', blurb: '临时抱佛脚，抱到一起去了', type: 'sidestory', defaultTone: 'comedy', defaultRiot: 40, castStrategy: 'onScene',
    promptExtra: '大考前夜的临时抱佛脚：有人焦头烂额、有人淡定得欠揍、有人偷偷用术法投机取巧，凑在一起复习结果全程跑题打闹。' },

  // ========== C. AU 平行世界（架空设定，反差萌） ==========
  { key: 'c.modern_office', name: 'AU · 现代职场', group: 'C · AU平行世界', icon: 'laptop', blurb: '仙主们变成了写字楼社畜', type: 'parallel', defaultTone: 'comedy', defaultRiot: 60, castStrategy: 'pick',
    promptExtra: 'AU 架空：把这些角色搬进现代都市写字楼，演成上司/下属/同事的职场恋爱喜剧。保留她们的性格内核，但身份、场景全部现代职场化，反差萌是看点。' },
  { key: 'c.cafe', name: 'AU · 街角咖啡馆', group: 'C · AU平行世界', icon: 'coffee', blurb: '老板娘与常客的温柔日常', type: 'parallel', defaultTone: 'heal', defaultRiot: 45, castStrategy: 'pair',
    promptExtra: 'AU 架空：一间街角小咖啡馆，某位角色是老板娘、另一位是每天来点同一杯的熟客，温柔缱绻的都市治愈恋爱。角色性格照旧，身份重设。' },
  { key: 'c.band', name: 'AU · 女子乐队', group: 'C · AU平行世界', icon: 'music', blurb: '地下livehouse的青春与热血', type: 'parallel', defaultTone: 'sweet', defaultRiot: 55, castStrategy: 'harem',
    promptExtra: 'AU 架空：一支为梦想挣扎的女子地下乐队，排练、演出、吵架又和好，青春热血摇滚番。角色成为主唱/吉他/鼓手等，性格内核不变。' },
  { key: 'c.royal', name: 'AU · 宫廷贵族', group: 'C · AU平行世界', icon: 'crown', blurb: '女王、骑士与深宫里的情愫', type: 'parallel', defaultTone: 'drama', defaultRiot: 55, castStrategy: 'pair',
    promptExtra: 'AU 架空：架空的西式宫廷，角色成为女王/公主/近卫骑士/女官，演一段深宫权谋掩不住的禁忌情愫。华丽、戏剧、张力十足。' },
  { key: 'c.apocalypse', name: 'AU · 末世求生', group: 'C · AU平行世界', icon: 'shield-half', blurb: '丧尸横行，但主角舍不得放手', type: 'parallel', defaultTone: 'drama', defaultRiot: 60, castStrategy: 'pick',
    promptExtra: 'AU 架空：末世丧尸/灾变背景，一群人相互扶持求生，患难中滋生的深刻羁绊与守护。紧张刺激但底色仍是「守护你」的温柔，不写致郁与真正的死亡。' },
  { key: 'c.fantasy_rpg', name: 'AU · 剑与魔法', group: 'C · AU平行世界', icon: 'gem', blurb: '勇者、魔王与开挂的冒险队', type: 'parallel', defaultTone: 'comedy', defaultRiot: 60, castStrategy: 'harem',
    promptExtra: 'AU 架空：西幻剑与魔法世界，角色成为勇者/魔王/法师/圣骑士，组队打怪、互相拆台、边冒险边谈恋爱的欢乐 RPG 番。' },
  { key: 'c.idol_stage', name: 'AU · 顶流偶像', group: 'C · AU平行世界', icon: 'star', blurb: '出道、打榜、和禁忌的团内恋', type: 'parallel', defaultTone: 'sweet', defaultRiot: 55, castStrategy: 'harem',
    promptExtra: 'AU 架空：现代偶像工业，角色成为同团/对家的顶流偶像，演绎舞台高光、打榜厮杀与不能被拍到的团内/对家恋爱。' },
  { key: 'c.highschool_au', name: 'AU · 不良与优等生', group: 'C · AU平行世界', icon: 'graduation-cap', blurb: '差生与学霸的青春反差恋', type: 'parallel', defaultTone: 'sweet', defaultRiot: 50, castStrategy: 'pair',
    promptExtra: 'AU 架空：现代校园，一个是人人怕的不良少女、一个是全校第一的优等生，反差拉满的青春校园恋。性格内核保留、身份重设。' },
  { key: 'c.wuxia', name: 'AU · 江湖武侠', group: 'C · AU平行世界', icon: 'sword', blurb: '快意恩仇，剑气里藏着情丝', type: 'parallel', defaultTone: 'drama', defaultRiot: 55, castStrategy: 'pair',
    promptExtra: 'AU 架空：古典武侠江湖，角色成为侠女/门派掌门/杀手，快意恩仇的刀光剑影里藏着欲说还休的情丝。' },
  { key: 'c.deep_sea', name: 'AU · 人鱼与灯塔', group: 'C · AU平行世界', icon: 'droplet', blurb: '海妖的歌声与守灯人的孤独', type: 'parallel', defaultTone: 'dream', defaultRiot: 55, castStrategy: 'pair',
    promptExtra: 'AU 架空：奇幻童话，一位是深海人鱼/海妖、一位是孤岛守灯人，跨越种族的浪漫与温柔的救赎。梦幻唯美。' },
  { key: 'c.detective', name: 'AU · 名侦探事务所', group: 'C · AU平行世界', icon: 'magnifying-glass', blurb: '侦探与助手的推理日常', type: 'parallel', defaultTone: 'comedy', defaultRiot: 50, castStrategy: 'pair',
    promptExtra: 'AU 架空：现代侦探事务所，一位毒舌天才侦探 + 一位吐槽役助手，破案之余斗嘴拌爱的推理喜剧番（案件轻松无血腥）。' },
  { key: 'c.gender_swap', name: 'AU · 性转一日', group: 'C · AU平行世界', icon: 'venus-mars', blurb: '一觉醒来大家都换了个模样', type: 'parallel', defaultTone: 'comedy', defaultRiot: 65, castStrategy: 'onScene',
    promptExtra: 'AU 脑洞：某个魔法/丹药事故让在场角色一觉醒来性别/身份互换（或全员变成某种反差形象），围绕这个荒诞设定展开的爆笑一日。' },

  // ========== D. 如果线 What-if（改一个正文节点） ==========
  { key: 'd.if_confessed', name: '如果那天说出口', group: 'D · 如果线', icon: 'heart', blurb: '那句没说的话，如果说了呢', type: 'whatif', defaultTone: 'sweet', defaultRiot: 45, castStrategy: 'auto',
    promptExtra: '基于正文，挑一个「有人差点表白/差点说出真心话却咽了回去」的节点，推演「如果当时真的说了」会怎样。读最近正文识别那个欲言又止的瞬间作分岔点。' },
  { key: 'd.if_stayed', name: '如果没有离开', group: 'D · 如果线', icon: 'door-open', blurb: '如果那次没有转身走掉', type: 'whatif', defaultTone: 'drama', defaultRiot: 45, castStrategy: 'auto',
    promptExtra: '基于正文，挑一个「有人转身离开/错过」的节点，推演「如果她没走、留了下来」的平行发展。分岔点从最近正文里识别。' },
  { key: 'd.if_caught', name: '如果被当场撞破', group: 'D · 如果线', icon: 'eye', blurb: '那点小秘密要是被看见了', type: 'whatif', defaultTone: 'drama', defaultRiot: 55, castStrategy: 'auto',
    promptExtra: '基于正文，挑一个「差点被撞破/差点暴露秘密」的节点，推演「如果真的被当场看见了」的连锁反应，慌乱、社死、又意外推进关系。' },
  { key: 'd.if_swap', name: '如果立场互换', group: 'D · 如果线', icon: 'arrow-right-left', blurb: '追的人被追、强的人变弱', type: 'whatif', defaultTone: 'comedy', defaultRiot: 55, castStrategy: 'pick',
    promptExtra: '取正文里一段关系，把两人的立场/攻守/强弱彻底调转，推演这个「镜像版本」会碰撞出怎样的新火花与笑料。' },
  { key: 'd.if_reject', name: '如果拒绝了主角', group: 'D · 如果线', icon: 'x', blurb: '要是当初没有答应呢', type: 'whatif', defaultTone: 'drama', defaultRiot: 50, castStrategy: 'auto',
    promptExtra: '基于正文，挑一个角色答应/接纳主角的节点，推演「如果她当初拒绝/傲娇地推开了」的欲擒故纵发展，别扭又心动。' },
  { key: 'd.if_firstmeet', name: '如果初遇换个方式', group: 'D · 如果线', icon: 'sparkles', blurb: '换一种相遇，故事会怎样', type: 'whatif', defaultTone: 'sweet', defaultRiot: 50, castStrategy: 'pair',
    promptExtra: '取两个角色，把她们「第一次相遇」的方式换成一个全新的、更有戏剧性或更浪漫的版本，重演这段命运的开场。' },
  { key: 'd.if_body_swap', name: '如果灵魂互换', group: 'D · 如果线', icon: 'repeat', blurb: '你变成我，我变成你', type: 'whatif', defaultTone: 'comedy', defaultRiot: 60, castStrategy: 'pair',
    promptExtra: '脑洞：某个契机让两个角色灵魂互换身体，被迫体验对方的生活与心事，笑料频出之余也读懂了彼此。经典身体互换番。' },

  // ========== E. 时间线脑洞（穿越/重生/未来/童年） ==========
  { key: 'e.childhood', name: '童年时光机', group: 'E · 时间线脑洞', icon: 'baby', blurb: '如果她们还是小豆丁', type: 'timeline', defaultTone: 'heal', defaultRiot: 50, castStrategy: 'pick',
    promptExtra: '时间线脑洞：把角色们变回小时候（幼态化），演一段奶凶奶甜的童年往事，性格雏形已现却软萌可爱，治愈满分。' },
  { key: 'e.future_family', name: '未来·如果成家了', group: 'E · 时间线脑洞', icon: 'house', blurb: '若干年后的同居生活', type: 'timeline', defaultTone: 'sweet', defaultRiot: 45, castStrategy: 'pair',
    promptExtra: '时间线脑洞：跳到若干年后，两人已修成正果、同居/成家，演一段柴米油盐里依旧甜到发腻的未来日常。' },
  { key: 'e.rebirth', name: '重生·带着记忆回来', group: 'E · 时间线脑洞', icon: 'rotate', blurb: '如果带着这段记忆重来一次', type: 'timeline', defaultTone: 'drama', defaultRiot: 50, castStrategy: 'auto',
    promptExtra: '时间线脑洞：某角色带着现有记忆重生回到过去某个节点，于是这一次，她要更勇敢地抓住想要的人和事。基于正文取「重来点」。' },
  { key: 'e.timeloop', name: '时间循环·同一天', group: 'E · 时间线脑洞', icon: 'clock-rotate-left', blurb: '被困在同一天，反复重来', type: 'timeline', defaultTone: 'comedy', defaultRiot: 55, castStrategy: 'pick',
    promptExtra: '时间循环脑洞：角色被困在同一天不断重来，一次次尝试不同选择去打破循环（或去接近某个人），既搞笑又暗藏深情。' },
  { key: 'e.old_ladies', name: '若干年后·老太太版', group: 'E · 时间线脑洞', icon: 'clock', blurb: '白发苍苍还在斗嘴的她们', type: 'timeline', defaultTone: 'heal', defaultRiot: 45, castStrategy: 'pair',
    promptExtra: '时间线脑洞：跳到很多很多年后，角色们已是白发苍苍的老太太，坐在院子里晒太阳、拌嘴、回忆年轻时的荒唐，温情又好笑。' },

  // ========== F. 综艺伪节目（伪纪录片/访谈/真人秀） ==========
  { key: 'f.reality_show', name: '恋爱观察真人秀', group: 'F · 综艺伪节目', icon: 'tv', blurb: '演播室嘉宾锐评她们的恋爱', type: 'variety', defaultTone: 'comedy', defaultRiot: 55, castStrategy: 'harem',
    promptExtra: '伪综艺：模仿恋爱观察真人秀的形式——一边是角色们在「节目」里的互动 VCR，一边穿插演播室嘉宾（可由旁观角色扮演）的实时锐评、磕 CP、毒奶。综艺花字感拉满。' },
  { key: 'f.interview', name: '深夜访谈节目', group: 'F · 综艺伪节目', icon: 'mic', blurb: '主持人问出了那个尖锐问题', type: 'variety', defaultTone: 'comedy', defaultRiot: 50, castStrategy: 'pick',
    promptExtra: '伪综艺：一档深夜访谈节目，主持人（可由某角色扮演）逐个采访嘉宾，抛出犀利/八卦/让人社死的问题，被访者花式招架，爆料不断。' },
  { key: 'f.documentary', name: '伪·自然纪录片', group: 'F · 综艺伪节目', icon: 'clapperboard', blurb: '「让我们观察她的野生习性」', type: 'variety', defaultTone: 'comedy', defaultRiot: 60, castStrategy: 'pick',
    promptExtra: '伪综艺：用一本正经的自然纪录片解说腔（旁白）去「观察记录」某位角色的日常「野生习性」，反差爆笑。旁白越煞有介事越好笑。' },
  { key: 'f.cooking_show', name: '地狱厨房挑战', group: 'F · 综艺伪节目', icon: 'utensils', blurb: '修仙大能下厨，厨房要塌了', type: 'variety', defaultTone: 'comedy', defaultRiot: 55, castStrategy: 'harem',
    promptExtra: '伪综艺：一档厨艺竞赛节目，角色们下厨大翻车/暗黑料理，评委（可由角色扮演）痛苦品尝并毒舌点评。烟火气与灾难现场并存。' },
  { key: 'f.debate', name: '奇葩说·爆笑辩论', group: 'F · 综艺伪节目', icon: 'comments', blurb: '「该不该主动倒追」吵翻天', type: 'variety', defaultTone: 'comedy', defaultRiot: 55, castStrategy: 'harem',
    promptExtra: '伪综艺：模仿辩论综艺，就一个恋爱/生活辩题（如「暗恋要不要说出口」）分正反方激辩，金句频出、跑题不断、越辩越暴露私心。' },
  { key: 'f.travel', name: '花样旅行团', group: 'F · 综艺伪节目', icon: 'plane', blurb: '一起出去玩，笑料在路上', type: 'variety', defaultTone: 'sweet', defaultRiot: 45, castStrategy: 'harem',
    promptExtra: '伪综艺：一档结伴出游的旅行真人秀，角色们一起赶路、迷路、抢房间、拍照，旅途中的小意外与升温的关系。' },
  { key: 'f.talent', name: '达人秀·才艺翻车', group: 'F · 综艺伪节目', icon: 'star', blurb: '「这就是我的绝活！」（并不是）', type: 'variety', defaultTone: 'comedy', defaultRiot: 55, castStrategy: 'harem',
    promptExtra: '伪综艺：达人秀舞台，角色们轮番上台表演「绝活」（用错地方的术法、迷之才艺），评委按铃吐槽，翻车与高光齐飞。' },

  // ========== G. 涩涩番外（r18，受全局色情度联动） ==========
  { key: 'g.after_dark', name: '入夜之后', group: 'G · 涩涩番外', icon: 'moon', blurb: '关上门，只剩两个人的夜', type: 'r18', defaultTone: 'spicy', defaultRiot: 75, r18: true, castStrategy: 'pair',
    promptExtra: '涩涩番外：夜深人静，两人独处一室，暧昧升温、水到渠成的亲密。尺度随放飞度与全局色情度/肉欲度联动，全女百合 GL，皆为虚构。' },
  { key: 'g.hotspring', name: '温泉里的坦诚', group: 'G · 涩涩番外', icon: 'droplets', blurb: '雾气氤氲，坦诚相见', type: 'r18', defaultTone: 'spicy', defaultRiot: 65, r18: true, castStrategy: 'harem',
    promptExtra: '涩涩番外：温泉/浴场，雾气氤氲、坦诚相见，从打闹戏水到暧昧暗涌。身材曲线与媚态的描写随全局肉欲度浮动，全女百合 GL，皆为虚构。' },
  { key: 'g.aphrodisiac', name: '误服了什么', group: 'G · 涩涩番外', icon: 'flask', blurb: '飞雪宫的丹药又出岔子了', type: 'r18', defaultTone: 'spicy', defaultRiot: 80, r18: true, castStrategy: 'pair',
    promptExtra: '涩涩番外经典桥段：某人误服了催情丹药/道具（具体来源读绑定的设定资料），身体燥热失控，只能向身边人求助，欲拒还迎的失控之夜。尺度随全局色情度联动，皆为虚构。' },
  { key: 'g.roleplay', name: '角色扮演play', group: 'G · 涩涩番外', icon: 'masks-theater', blurb: '「今晚你当主人吧」', type: 'r18', defaultTone: 'spicy', defaultRiot: 80, r18: true, castStrategy: 'pair',
    promptExtra: '涩涩番外：两人玩起情趣角色扮演（主仆/师生/猫娘等设定），在扮演的张力里升温。尺度随放飞度与全局色情度/肉欲度联动，全女百合 GL，皆为虚构。' },
  { key: 'g.teasing', name: '一整天的挑逗', group: 'G · 涩涩番外', icon: 'fire', blurb: '从早到晚，欲擒故纵', type: 'r18', defaultTone: 'spicy', defaultRiot: 70, r18: true, castStrategy: 'pair',
    promptExtra: '涩涩番外：某人一整天用若有似无的小动作、暧昧的话撩拨另一个人，一点点把张力堆到临界点，直到夜晚彻底引爆。尺度随全局色情度联动，皆为虚构。' },
  { key: 'g.morning_after', name: '事后的清晨', group: 'G · 涩涩番外', icon: 'cloud-sun', blurb: '醒来发现枕边多了个人', type: 'r18', defaultTone: 'sweet', defaultRiot: 55, r18: true, castStrategy: 'pair',
    promptExtra: '涩涩番外（偏甜）：昨夜之后的清晨，两人在同一张床上醒来，慵懒、害羞、缠绵的清晨氛围与藏不住的甜。含蓄留白，尺度随全局设置浮动，皆为虚构。' },

  // ========== H. 萌系轻松（幼态/日常治愈/沙雕） ==========
  { key: 'h.pet_day', name: '如果她是只猫', group: 'H · 萌系轻松', icon: 'paw', blurb: '猫化的仙主，又软又欠揍', type: 'moe', defaultTone: 'heal', defaultRiot: 55, castStrategy: 'pick',
    promptExtra: '萌系脑洞：某位角色变成了猫/小动物（或有了兽耳尾巴），保留性格却多了动物习性，又软又粘人又欠揘，主角被萌到融化。' },
  { key: 'h.tiny', name: '缩小的一天', group: 'H · 萌系轻松', icon: 'shrink', blurb: '巴掌大的仙主装进口袋', type: 'moe', defaultTone: 'comedy', defaultRiot: 55, castStrategy: 'pick',
    promptExtra: '萌系脑洞：某个术法事故让角色缩小成巴掌大，被主角小心翼翼揣在口袋/放在手心，迷你视角的爆笑与心动日常。' },
  { key: 'h.lazy_sunday', name: '什么都不做的周末', group: 'H · 萌系轻松', icon: 'coffee', blurb: '赖床、发呆、蹭来蹭去', type: 'sidestory', defaultTone: 'heal', defaultRiot: 30, castStrategy: 'pair',
    promptExtra: '治愈日常：一个什么正事都不用做的慵懒周末，两人赖床、发呆、有一搭没一搭地聊天、蹭来蹭去，把「无聊」过成了幸福。' },
  { key: 'h.snack_war', name: '零食争夺战', group: 'H · 萌系轻松', icon: 'cookie-bite', blurb: '「最后一块布丁是我的！」', type: 'sidestory', defaultTone: 'comedy', defaultRiot: 40, castStrategy: 'onScene',
    promptExtra: '沙雕日常：为了冰箱里最后一块布丁/一包零食，几个人展开幼稚又可爱的争夺战，斗智斗勇、耍赖卖萌，鸡毛蒜皮里全是爱。' },
  { key: 'h.plushie', name: '玩偶总动员', group: 'H · 萌系轻松', icon: 'gift', blurb: '深夜，玩偶们开始说话了', type: 'moe', defaultTone: 'dream', defaultRiot: 55, castStrategy: 'pick',
    promptExtra: '萌系童话脑洞：深夜无人时，房间里以角色为原型的玩偶们活了过来，偷偷讨论各自的主人、密谋撮合主角的恋爱，天真又温馨。' },

  // ========== I · 群像与点播（多人同台 / 玩家出题即兴） ==========
  { key: 'i.all_star', name: '群像大乱斗', group: 'I · 群像与点播', icon: 'people-group', blurb: '一次把所有人拉上台飙戏', type: 'sidestory', defaultTone: 'comedy', defaultRiot: 60, castStrategy: 'harem',
    promptExtra: '群像大乱斗：尽量多地把在场角色一次全拉上同一舞台，一个共同事件（聚会/出游/危机/团建）把所有人卷进来，让每个人的性格在你来我往的群戏里互相碰撞、抢戏、拆台又补位。重点是热闹的多人化学反应，别让任何一个人成背景板。' },
  { key: 'i.ensemble_crisis', name: '全员危机合作', group: 'I · 群像与点播', icon: 'shield-half', blurb: '大事临头，众人被迫拧成一股绳', type: 'sidestory', defaultTone: 'heroic', defaultRiot: 55, castStrategy: 'harem',
    promptExtra: '群像燃向：一个突发大事件（禁制失控/强敌来袭/时限任务）逼着平时各有心思的众人放下分歧、分工协作。在配合与摩擦里迸出信任与热血，收尾留一个并肩后的温情瞬间。' },
  { key: 'i.request_stage', name: '观众点播台', group: 'I · 群像与点播', icon: 'mic', blurb: '你出一句命题，全员即兴演', type: 'variety', defaultTone: 'comedy', defaultRiot: 60, castStrategy: 'onScene',
    promptExtra: '观众点播即兴：把玩家在「命题/方向」里给出的一句话当作现场点播的题目，让在场角色即兴演绎这个命题（像即兴喜剧的「观众出题」环节）。紧扣玩家给的题眼发挥，越应题越好；玩家没给题时，自己抛一个刁钻有趣的命题来演。' },

  // ========== J · 特别企划（节日/深夜食堂/双向暗恋/宿命） ==========
  { key: 'j.festival_limited', name: '节日限定特番', group: 'J · 特别企划', icon: 'gift', blurb: '情人节/圣诞/守岁的限定甜', type: 'sidestory', defaultTone: 'sweet', defaultRiot: 45, castStrategy: 'onScene',
    promptExtra: '节日限定番：围绕一个具体节日（情人节/圣诞/新年守岁/七夕，具体可读世界钟或由命题指定）展开的应景小剧场——节日特有的仪式、礼物、氛围与专属的心动名场面。把节日的仪式感和甜度拉满。' },
  { key: 'j.midnight_diner', name: '深夜食堂', group: 'J · 特别企划', icon: 'utensils', blurb: '一盏灯，一道菜，一段心事', type: 'sidestory', defaultTone: 'heal', defaultRiot: 35, castStrategy: 'pair',
    promptExtra: '深夜食堂 AU/番外：打烊时分的小食堂，某人端上一道有故事的菜，客人就着这道菜说出藏了很久的心事。慢节奏、烟火气、疗愈感，一菜一心事，温柔收束。' },
  { key: 'j.mutual_pining', name: '就差一层窗户纸', group: 'J · 特别企划', icon: 'heart', blurb: '明明互相喜欢却都不敢说', type: 'sidestory', defaultTone: 'sweet', defaultRiot: 50, castStrategy: 'pair',
    promptExtra: '双向暗恋番：两人明明都喜欢对方，却都以为是单相思，于是小心翼翼试探、旁敲侧击、患得患失，观众急得跳脚。把「就差一层窗户纸」的甜蜜煎熬写足，结尾可捅破也可继续拉扯。' },
  { key: 'j.fated_cycle', name: '宿命轮回·再遇你', group: 'J · 特别企划', icon: 'repeat', blurb: '生生世世，总会再遇见', type: 'timeline', defaultTone: 'bittersweet', defaultRiot: 55, castStrategy: 'pair',
    promptExtra: '宿命轮回番：两人跨越前世今生一次次相遇又错过，带着若有似无的既视感重逢。微虐美学基调，把「命运兜兜转转还是你」的宿命感与意难平写美，最后一世留一个圆满或释然的余光。' },
];

// ============ 查询工具 ============
export function getTheaterPreset(key: string): PlayPreset | undefined {
  return THEATER_PRESETS.find(p => p.key === key);
}
// 按分组聚合（宫格渲染用）；保持 THEATER_PRESETS 里的出现顺序。
export function theaterPresetGroups(): { group: string; presets: PlayPreset[] }[] {
  const order: string[] = [];
  const map = new Map<string, PlayPreset[]>();
  for (const p of THEATER_PRESETS) {
    if (!map.has(p.group)) { map.set(p.group, []); order.push(p.group); }
    map.get(p.group)!.push(p);
  }
  return order.map(g => ({ group: g, presets: map.get(g)! }));
}

// ============ 小片段提示词登记（基调透镜 + 每个剧种规则可玩家编辑）============
// 把 THEATER_TONES 的 inject、每个预设的 promptExtra 登记进 prompt-registry，
// 玩家可在「设置→功能提示词→小片段」里改写；builders 通过下面的 override-aware getter 读取。
export const TONE_FRAG_PREFIX = 'theater.frag.tone.';
export const RULE_FRAG_PREFIX = 'theater.frag.rule.';
export function registerTheaterFragments(): void {
  for (const t of THEATER_TONES) {
    registerPromptTemplate({
      id: TONE_FRAG_PREFIX + t.key, appId: 'theater', appName: '小剧场',
      name: `基调透镜 · ${t.emoji}${t.name}`,
      desc: `选此基调透镜时罩住整出戏的色彩/节奏/尺度描述（${t.hint}）。`,
      vars: [], default: t.inject,
    });
  }
  for (const p of THEATER_PRESETS) {
    registerPromptTemplate({
      id: RULE_FRAG_PREFIX + p.key, appId: 'theater', appName: '小剧场',
      name: `剧种规则 · ${p.name}`,
      desc: `「${p.group}」${p.blurb}——这出戏怎么演的导演笔记（注入开场/续演的 {{playRule}}）。改设定请改绑定世界书，这里只写玩法基调。`,
      vars: [], default: p.promptExtra,
    });
  }
}
// override-aware getters（覆盖优先，默认兜底）
export function getToneInject(key: string): string {
  const t = getTheaterTone(key);
  const ov = getPromptText(TONE_FRAG_PREFIX + t.key);
  return (ov && ov.trim()) ? ov : t.inject;
}
export function getPresetRule(key: string): string {
  const p = getTheaterPreset(key);
  if (!p) return '';
  const ov = getPromptText(RULE_FRAG_PREFIX + p.key);
  return (ov && ov.trim()) ? ov : p.promptExtra;
}
// 供设置面板列出「小片段」提示词 id（基调 + 剧种规则）
export function theaterFragmentIds(): { toneIds: string[]; ruleIds: string[] } {
  return {
    toneIds: THEATER_TONES.map(t => TONE_FRAG_PREFIX + t.key),
    ruleIds: THEATER_PRESETS.map(p => RULE_FRAG_PREFIX + p.key),
  };
}
registerTheaterFragments();

// 调试挂载
try {
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  w.__th_world_theater_presets__ = { THEATER_PRESETS, THEATER_TONES, getTheaterPreset, theaterPresetGroups, getTheaterTone };
} catch (e) { void e; }
