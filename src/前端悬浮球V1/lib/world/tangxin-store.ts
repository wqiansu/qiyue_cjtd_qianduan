import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

// 弹幕/互动消息
export type TangxinMsg = {
  id: string;
  kind: 'danmu' | 'host' | 'gift' | 'sys' | 'enter' | 'bag' | 'pk';  // 观众弹幕/主播发言/礼物/系统/进场/福袋/连麦PK
  author: string;
  authorRef?: string;
  content: string;
  giftName?: string;
  vip?: boolean;       // 贵族/守护进场（飘屏特效）
  ts: number;
  isAi?: boolean;
};

// 榜单条目（贡献榜：按累计金币排名）
export type TangxinRankEntry = { name: string; coins: number };

// 主播资料页（点头像进主页时 AI 一次生成存档，对标真实平台主播页 + 糖心特色）
export type TangxinHostProfile = {
  age?: string;            // 年龄/自报年龄
  height?: string;         // 身高
  figure?: string;         // 三围/身材
  tags?: string[];         // 性癖/风格标签
  priceList?: string;      // 线下/私密价位表（钩子）
  bio?: string;            // 主播简介/履历
  history?: string;        // 过往直播/名场面摘要
  generatedAt?: number;    // 生成时间
};

// 连麦 / PK 状态（好感够高或榜一时主播邀请上麦；或双主播 PK）
export type TangxinLink = {
  name: string;            // 连麦/PK 对象昵称
  mode: 'mic' | 'pk';      // 上麦连线 / 对战 PK
  myScore?: number;        // PK 我方/主播方分
  rivalScore?: number;     // PK 对方分
  active: boolean;
};

// 福袋 / 抽奖（主播发福袋，弹幕扣金币抢，AI 出中奖网名）
export type TangxinLuckyBag = {
  gift: string;            // 福袋奖品
  coin: number;            // 参与门槛
  joined: boolean;         // 我是否已参与
  winner?: string;         // 开奖中奖人
  open: boolean;           // 是否进行中
};

// 粉丝团 / 守护（开通粉丝牌解锁专属待遇、抬高互动优先级）
export type TangxinFanClub = {
  joined: boolean;
  level: number;           // 粉丝团等级
  title?: string;          // 粉丝团称号
};

// 直播间
export type TangxinRoom = {
  id: string;
  hostName: string;            // 主播昵称
  hostRef?: string;            // 关联联系人（contact:<id>）
  title: string;               // 直播间标题
  cover?: string;              // 封面图（可空）
  tags?: string[];             // 标签
  category?: string;           // 分类（单身/情侣/ASMR/角色扮演/自定义）
  followed?: boolean;          // 是否已关注
  isPrivate?: boolean;         // 私密直播（用户自己开播时选私密：进入【私密中】，不要求评论区）
  isMine?: boolean;            // 是否用户自己开的播（走「用户开播」生成引擎）
  online?: number;             // 在线人数（展示用）
  peakOnline?: number;         // 峰值在线（下播结算用）
  fans?: number;               // 粉丝数（展示用）
  notice?: string;             // 房间公告/场景设定
  scene?: string;              // 当前画面英文 NAI tags（仅出图用，连后端才生效）
  sceneDesc?: string;          // 当前画面中文实况描述（给玩家看的画面内容，文生图关闭时占位显示）
  sceneUrl?: string;           // 已出图的画面 URL（连后端时）
  rank?: TangxinRankEntry[];      // 贡献榜（按累计金币倒序）
  favor?: number;              // 好感度 0-100（直播互动结算）
  hostProfile?: TangxinHostProfile;// 主播资料页（懒生成存档）
  link?: TangxinLink;             // 连麦/PK 状态
  luckyBag?: TangxinLuckyBag;     // 福袋/抽奖
  fanClub?: TangxinFanClub;       // 我在本主播的粉丝团
  vipUnlocked?: boolean;       // 私密连线房是否已解锁（累计打赏达阈值）
  ended?: boolean;             // 是否已下播（下播后转「回放」可重看）
  income?: number;             // 本场累计打赏收入（用户开播结算用）
  msgs: TangxinMsg[];
  createdAt: number;
  updatedAt: number;
};

// 糖心「我的/私密」资料。私密界面 = 用户自己的主播中心（个人设置 + 开播设置）。
export type TangxinProfile = {
  nickname: string;          // 观众/用户昵称
  avatar?: string;           // 头像
  coins: number;             // 金币余额
  callMe?: string;           // 主播怎么称呼「我」（注入生成）
  firstRecharged?: boolean;  // 是否已领过首充豪礼
  // —— 用户作为主播的开播资料（私密界面）——
  liveNickname?: string;     // 直播昵称（开播时显示，缺省用 nickname）
  gender?: 'female' | 'male';// 性别 → 决定开播用哪套默认提示词（女向/男向）
  liveTitle?: string;        // 今日直播主题
  intro?: string;            // 直播简介（性癖/性格/线下价位等）
  fans?: number;             // 我的粉丝数（开播波动）
  totalIncome?: number;      // 累计开播收入（主播等级用）
  liveCount?: number;        // 累计开播场次
  hostLevel?: number;        // 主播等级（开播时长/收入解锁）
  certified?: boolean;       // 主播认证标
};

// 充值/消费账单条目（钱包账单页）
export type TangxinBill = {
  id: string;
  kind: 'recharge' | 'gift';  // 充值 / 送礼消费
  amount: number;             // 金币变动（正充值/负消费）
  note: string;               // 摘要（如「火箭×1 给 主播A」）
  ts: number;
};

// 好友申请（看播互动后陌生网友申请加好友）。
export type TangxinFriendReq = {
  id: string;
  name: string;
  avatar?: string;
  source?: string;           // 来源标签（直播间申请/主播申请）
  words: string;             // 申请话术
  hiddenBg?: string;         // 隐藏背景（供后续微信延续人设）
  ts: number;
};
// 已通过的好友（沉淀，后续可联动微信）。
export type TangxinFriend = {
  id: string;
  name: string;
  avatar?: string;
  badge?: string;            // 主播/蜜友
  status?: string;           // 一句状态/最近互动
  hiddenBg?: string;
  addedAt: number;
};
// 糖心设置（上下文/世界书/视频出图/界面配色/楼层自动触发）。
export type TangxinSettings = {
  useFloors: boolean;          // 互动时参考最近正文
  floorCount: number;          // 读几楼
  useWorldbook: boolean;       // 注入酒馆世界书
  worldbookEntryKeys: string[];// 条目级选择（任意书任意条目）
  videoEnabled: boolean;       // 直播画面出图（连 comfyui 才有效，可降级文字）
  coverImage: boolean;         // 封面也出图（无后端则外框占位）
  accent: string;              // 界面配色风格（主题强调色 key）
  bg?: string;                 // 自定义背景图 URL/dataURL
  autoEnabled: boolean;        // 楼层记录触发自动开播/刷新
  autoInterval: number;        // 每隔 N 层
  lastFloor: number;           // 上次记录楼层
  // —— 隐私（对齐微信隐私分类）——
  stealth: boolean;            // 隐身观看（不进观众墙/不被主播扫到）
  showMyGifts: boolean;        // 是否公开我的打赏记录
  acceptFriendReqs: boolean;   // 是否接收陌生网友好友申请
  showRealRank: boolean;       // 是否显示真实贡献榜
  // —— 主动触发（对齐微信 proactive）——
  pushOnLive: boolean;         // 关注主播开播时推送
  hostDmEnabled: boolean;      // 高好感主播下播后私信你（联动微信）
  hostDmFloor: number;         // 主播主动私信频率（每 N 楼）
  hostDmLast: number;          // 上次私信楼层
  // —— 互动风格 / 尺度（玩家自由）——
  danmuSpicy: number;          // 弹幕露骨度 1-5
  hostFlirt: number;           // 主播主动撩你频率 1-5
  favorDifficulty: number;     // 好感攻略难度 1-5（越高越难涨）
  allowNtr: boolean;           // 是否允许 NTR / 极端题材
  // —— 生态浓度（通用化注入，不写死提示词）——
  ecoErotic: number;           // 色情度浓度 0-100（平台情色氛围占比与露骨/直白程度）
  ecoCarnal: number;           // 肉欲度浓度 0-100（主播肉体肉欲与诱惑表现强度）
  ecoDaily: number;            // 日常度浓度 0-100（平淡真实日常内容占比）
  // 玩家自定义分类（追加在内置分类之后）+ 每个分类独立引导提示词（按分类名索引）。
  customCats: { id: string; name: string }[];
  catPrompts: Record<string, string>;
};

type TangxinData = {
  rooms: TangxinRoom[];
  profile?: TangxinProfile;
  settings?: TangxinSettings;
  friendReqs?: TangxinFriendReq[];  // 待处理好友申请
  friends?: TangxinFriend[];        // 已通过好友
  bills?: TangxinBill[];            // 钱包账单（充值/消费）
};

const DEFAULT_PROFILE: TangxinProfile = {
  nickname: '我', coins: 5200, callMe: '', firstRecharged: false,
  liveNickname: '', gender: 'female', liveTitle: '', intro: '', fans: 1280,
  totalIncome: 0, liveCount: 0, hostLevel: 1, certified: false,
};
const DEFAULT_SETTINGS: TangxinSettings = {
  useFloors: false, floorCount: 6, useWorldbook: false, worldbookEntryKeys: [],
  videoEnabled: true, coverImage: false, accent: 'pink', bg: '', autoEnabled: false, autoInterval: 30, lastFloor: 0,
  stealth: false, showMyGifts: true, acceptFriendReqs: true, showRealRank: true,
  pushOnLive: true, hostDmEnabled: true, hostDmFloor: 40, hostDmLast: 0,
  danmuSpicy: 3, hostFlirt: 3, favorDifficulty: 3, allowNtr: true,
  ecoErotic: 55, ecoCarnal: 55, ecoDaily: 45,
  customCats: [], catPrompts: {},
};

// 糖心内置分类（推荐页顶部 tab）。前段是通用类，后段是贴合本卡情色基调的 R18 向类别。
// 每个内置 R18 类配一段默认引导提示词（注入该分类刷新生成），玩家可在设置里改写。
export const TANGXIN_BUILTIN_CATS = ['才艺', 'ASMR', '角色扮演', '深夜电台', '户外', '情侣', '单身', '私密',
  '调教SM', '足控丝足', '人妻熟女', '制服诱惑', '露出户外', '双修慾仙',
  '处女初恋', '御姐女王', '百合GL', '群P多人', '醉酒迷情', '校园师生', '风尘青楼', '主仆侍女'];
export const TANGXIN_DEFAULT_CAT_PROMPTS: Record<string, string> = {
  '才艺': '【才艺区】内容母题：唱歌/跳舞/乐器/绘画/游戏等正经才艺直播，但糖心生态里才艺是「钩子+暧昧」并存——表演间隙撩拨、点歌点舞要打赏、跳到激动处走光擦边、连麦合唱调情。主播画像：声音甜/身材好的才艺主播，靠才艺引流靠暧昧留人。标题/卖点套路：「点歌台｜今晚唱到你心动」「跳一支撩你的舞」，突出才艺水准+福利预告。招牌元素：弹幕「再来一首」「跳那个」「老板点歌了」夹杂荤段子；打赏触发才艺+福利。尺度按设置走，才艺为表暧昧为里。',
  'ASMR': '【ASMR区】内容母题：耳语、掏耳、敲击、咀嚼音、助眠、角色扮演耳搔，糖心生态里走「酥麻+情欲」路线——气音喘息、贴耳低语、湿润音效、暧昧台词哄睡。主播画像：声控福利型，靠声音和喘息勾人。标题/卖点套路：「3D耳语助眠｜小心上头」「贴耳哄睡的姐姐」，强调声音质感+酥麻体感。招牌元素：弹幕「左耳再说一次」「酥了」「戴耳机危险」，打赏解锁更私密的气音/台词。强调声音的暧昧暗示，画面可虚化只闻其声。',
  '角色扮演': '【角色扮演区】内容母题：女仆/护士/老师/猫娘/女友/秘书等角色cos直播，糖心生态里强调「角色代入+剧情调情」——主播全程不出戏，用角色身份和你互动、撒娇、服务、演剧本。主播画像：演技/cos到位、擅长沉浸式角色扮演。标题/卖点套路：「专属女仆为您服务」「病娇女友的一天」，点明角色+情境剧本。招牌元素：弹幕入戏喊「主人」「老师」配合演，打赏推进剧情/解锁角色专属互动。强调代入感与反差，cos服化道是卖点。',
  '深夜电台': '【深夜电台区】内容母题：深夜情感连线、树洞倾诉、低声陪聊、点歌寄语，糖心生态里走「孤独经济+暧昧陪伴」——深夜放下防备、声音温柔、私密话题、一对一氛围。主播画像：声音治愈/会聊天的陪伴型主播。标题/卖点套路：「深夜电台｜陪你到天亮」「失眠的来连麦」，强调陪伴感+私密暧昧。招牌元素：弹幕深夜emo倾诉，连麦诉苦被温柔安慰，打赏点歌/私聊连线。氛围私密走心，暧昧藏在温柔陪伴里。',
  '户外': '【户外区】内容母题：户外探店/逛街/旅行/夜市边播，糖心生态里强调「真实感+偶遇刺激+半公开暧昧」——边走边播与路人互动、被搭讪、衣着清凉、刺激任务。主播画像：高颜值户外主播，靠真实场景和突发互动留人。标题/卖点套路：「户外｜今天穿这件出门」「夜市逛吃偶遇」，强调真实出镜+尺度试探。招牌元素：弹幕「后面有人看你」「这件太透了」「做个任务」，打赏触发户外挑战/换装。突出真实街景与暴露的紧张感（虚构表演）。',
  '情侣': '【情侣区】内容母题：情侣/夫妻同播、秀恩爱、互动游戏、日常相处、暧昧打闹，糖心生态里走「真人情侣+尺度互动」——双人连麦撒糖、惩罚游戏、亲密互动、被起哄。主播画像：颜值情侣档，靠CP感和双人福利吸引。标题/卖点套路：「情侣play｜输了就亲」「我家那位今天上线」，强调双人互动+甜蜜尺度。招牌元素：弹幕「发糖」「亲一个」「惩罚他」，打赏触发情侣游戏/亲密互动。CP张力是核心，单身观众边吃糖边起哄。',
  '单身': '【单身区】内容母题：单身主播日常、寻找另一半、情感连线相亲、撒娇求安慰，糖心生态里走「单身经济+专属暧昧」——营造「主播单身只对你心动」的恋爱感，连麦相亲、被表白、吃醋。主播画像：单身人设、给观众恋爱幻觉的甜妹/帅哥。标题/卖点套路：「单身的我在等你连麦」「今晚找对象」，强调可攻略感+专属暧昧。招牌元素：弹幕争风吃醋「我才是榜一」「别理他」，打赏争夺主播注意/连麦表白。核心是恋爱代入与排他性暧昧。',
  '私密': '【私密区】内容母题：高门槛私密房、付费解锁、一对一/小房间、专属福利，糖心生态里是尺度最大的区——VIP才进、深度暧昧露骨互动、专属点单、私密连麦。主播画像：头部福利主播，靠私密尺度和稀缺感变现。标题/卖点套路：「私密房｜懂的进」「VIP专属福利」，强调门槛+尺度+稀缺。招牌元素：弹幕刷礼物求解锁/求进房，打赏开通VIP/解锁私密内容/一对一。尺度按设置上限走，强调私密感、专属感与付费门槛（虚构表演）。',
  '调教SM': '【调教SM区】内容母题：调教/支配主题，主播以 S 或 M 一方呈现，强调权力拉扯、道具(绳/蜡/项圈/口塞)、规则与惩罚奖励、服从与反抗的张力。主播画像：擅长气场掌控或娇弱承受的调教向主播。标题/卖点套路：「女王调教时间」「今晚谁是我的奴隶」，突出主奴关系与调教进度。招牌元素：弹幕「女王踩我」「求惩罚」「下一个指令」，打赏触发调教指令/道具惩罚/奖励解锁。强调权力张力与规则感，尺度按设置走（虚构表演）。',
  '足控丝足': '【足控丝足区】内容母题：足部/丝袜恋物，主播展示足部特写、丝袜/高跟/油亮、踩踏/足交挑逗等，围绕足控癖好做钩子。主播画像：腿脚条件好、懂足控审美的恋物向主播。标题/卖点套路：「丝足专场｜舔屏警告」「今天黑丝还是肉丝」，点明丝袜款式/玩法。招牌元素：弹幕「换肉丝」「特写脚趾」「踩我」，打赏解锁特写/换袜/踩踏互动。强调足部细节、丝袜质感与恋物代入，尺度按设置走（虚构表演）。',
  '人妻熟女': '【人妻熟女区】内容母题：成熟风韵向，主播呈现人妻/熟女/邻家少妇/出轨/寂寞设定，强调反差与禁忌感，口吻老练带勾引。主播画像：成熟韵味、会撩会演的熟女向主播。标题/卖点套路：「独守空房的少妇」「邻居家的姐姐」，钩子落在熟女特有情境与禁忌感。招牌元素：弹幕「姐姐好成熟」「老公不在吧」，打赏触发情境剧本/暧昧倾诉/角色代入。强调成熟反差、禁忌张力与老练撩拨，尺度按设置走（虚构表演）。',
  '制服诱惑': '【制服诱惑区】内容母题：护士/女仆/教师/JK/警花/空姐/OL等制服扮演，强调制服反差与角色代入。主播画像：身材气质适配制服、擅长角色演绎的主播。标题/卖点套路：「护士小姐姐查房」「JK放学后」，点明制服类型+对应情境剧本。招牌元素：弹幕「老师罚我」「护士打针」配合角色，打赏推进制服剧情/解锁专属互动。强调制服带来的身份反差与情境沉浸，cos服化道是卖点，尺度按设置走（虚构表演）。',
  '露出户外': '【露出户外区】内容母题：露出/户外刺激向，主播在半公开或户外场景挑战露出尺度，强调被发现的紧张刺激与心跳感。主播画像：胆大会玩、擅长营造紧张感的刺激向主播。标题/卖点套路：「户外露出挑战」「敢不敢更刺激」，钩子落在地点风险与暴露程度递进。招牌元素：弹幕「有人来了」「再大胆点」「会被发现」，打赏推进露出任务/升级地点风险。强调半公开场景的心跳刺激与暴露递进（注意仍是虚构表演，把握真实感与安全感平衡）。',
  '双修慾仙': '【双修慾仙区】内容母题：修仙/玄幻情色向，把双修/采补/渡劫/欲望试炼等玄幻设定与情色结合，主播以仙子/魔女/道修身份呈现，台词带古风仙侠味。主播画像：古风扮相、会演玄幻情境的主播，契合本卡跨现实世界观。标题/卖点套路：「仙子双修渡劫」「魔女的欲望试炼」，点明玄幻身份+双修情境。招牌元素：弹幕入戏喊「道友」「仙子」配合，打赏推进双修剧情/渡劫试炼/法力情境。台词古风仙侠味，把玄幻设定与情色巧妙融合，尺度按设置走（虚构表演）。',
  '处女初恋': '【处女初恋区】内容母题：青涩初体验向，主播以初恋/纯情/第一次的人设呈现，强调懵懂羞怯、心跳脸红、笨拙试探与被引导的张力，主打「纯」与「欲」的反差钩子。主播画像：声音清甜、表演带羞涩感的新人系或装嫩系主播（按本卡世界书设定的性别生态，默认全为女性）。标题/卖点套路：「第一次直播好紧张」「教教我好不好」，钩子落在青涩感与初次的稀缺感。招牌元素：弹幕「太纯了」「别紧张」「想保护」「手把手教」，打赏触发循序渐进的引导剧情/解锁更进一步互动。强调懵懂与被开发的递进张力，纯欲反差是核心，尺度按设置走（虚构表演）。',
  '御姐女王': '【御姐女王区】内容母题：强势支配向，主播以御姐/女王/总裁/上位者身份呈现，强调气场压制、语言调教、命令与服从、被踩在脚下的快感，与「调教SM」相比更重气场与言语支配而非道具。主播画像：成熟强势、声线低冷有压迫感、擅长气场掌控的御姐系主播。标题/卖点套路：「女王的训诫时间」「跪下，叫主人」，钩子落在压制感与臣服欲。招牌元素：弹幕「女王踩我」「求训诫」「我是您的奴」，打赏触发命令/羞辱式调教/奖惩。强调权力位差与言语支配的张力，气场是卖点，尺度按设置走（虚构表演）。',
  '百合GL': '【百合GL区】内容母题：女女亲密向，双人或多人女主播同播，强调姐妹/恋人/暧昧拉扯、互动撩拨、CP张力，契合本卡无雄性的世界观，是平台双人情色的主力区。主播画像：颜值CP档、有化学反应的女主播组合，靠 GL CP 感和双人福利吸引。标题/卖点套路：「她是我女朋友」「姐妹同播play」，强调女女互动+甜蜜尺度。招牌元素：弹幕「磕到了」「发糖」「亲一个」「在一起」，打赏触发情侣游戏/亲密互动/CP剧情。GL CP 张力是核心，观众边磕糖边起哄，尺度按设置走（虚构表演）。',
  '群P多人': '【群P多人区】内容母题：多人同框向，三人及以上女主播连麦/同房间互动，强调多人调情、轮流互动、群体游戏与暧昧网状关系，热闹喧腾、信息量大。主播画像：会带节奏的多人主播团，靠人数与互动密度制造看点。标题/卖点套路：「四美同播」「多人游戏谁先认输」，钩子落在多人组合与热闹尺度。招牌元素：弹幕「全都要」「左边那个」「一起」「队形刷起来」，打赏触发多人游戏/指定互动/团体惩罚。强调多人网状关系与互动密度，热闹是卖点，尺度按设置走（虚构表演）。',
  '醉酒迷情': '【醉酒迷情区】内容母题：微醺氛围向，主播以小酌/微醺/卸下防备的状态呈现，强调醉后的真情流露、脸红耳热、放飞与失态边缘的暧昧，主打松弛与失控的张力。主播画像：会演微醺感、酒后更撩更真的氛围系主播。标题/卖点套路：「喝醉了就什么都敢说」「微醺的夜陪你」，钩子落在醉后失防与真心话。招牌元素：弹幕「她醉了」「再喝一杯」「说真心话」「脸好红」，打赏触发真心话/醉后剧情/陪饮连麦。强调微醺氛围与卸防后的暧昧递进，氛围是核心（强调仍是虚构表演，把握安全与真实感平衡），尺度按设置走。',
  '校园师生': '【校园师生区】内容母题：校园情境向，主播以学姐/老师/同学/家教等校园身份cos呈现，强调青春情境、师生/同窗的禁忌反差与角色代入，cos服化道（JK/教师装）是卖点。主播画像：适配校园身份、擅长情境演绎的cos系主播（按本卡世界书设定的性别生态，默认全为女性）。标题/卖点套路：「放学后留下来」「学姐补习时间」，点明校园身份+对应情境剧本。招牌元素：弹幕「老师罚我」「学姐教教我」配合角色，打赏推进校园剧情/解锁专属互动。强调校园身份反差与情境沉浸，cos代入是核心，尺度按设置走（虚构表演）。',
  '风尘青楼': '【风尘青楼区】内容母题：古风风月向，主播以花魁/名妓/青楼女子身份呈现，把古风楼阁、卖艺不卖身的暧昧、才情与风月结合，台词婉转带古韵，契合本卡跨现实世界观。主播画像：古风扮相、会演风月情境、能歌善舞的古风系主播。标题/卖点套路：「花魁夜宴」「为君抚琴一曲」，点明古风身份+风月情境。招牌元素：弹幕入戏喊「姑娘」「头牌」「赎身」配合，打赏推进风月剧情/点曲点舞/解锁专属相会。台词古风婉约，把楼阁风月与情色含蓄融合，尺度按设置走（虚构表演）。',
  '主仆侍女': '【主仆侍女区】内容母题：主仆服侍向，主播以侍女/女仆/婢女/管家等服侍者身份呈现，强调绝对服从、贴身伺候、主仆位差与被支配/支配的代入，与「御姐女王」互为镜像（此区主播多为「仆」一方）。主播画像：擅长演绎温顺服侍、声音恭谨乖巧的主仆系主播。标题/卖点套路：「专属侍女听候差遣」「小的伺候主子」，点明主仆身份+服侍情境。招牌元素：弹幕入戏喊「主子」「赏」「过来伺候」，打赏推进服侍剧情/解锁专属差遣/主仆互动。强调主仆位差与服从代入，服侍感是卖点，尺度按设置走（虚构表演）。',
};

function rid(p: string): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

function read(): TangxinData {
  const d = readWorldJson<TangxinData>(WORLD_LS_KEYS.tangxin, { rooms: [] });
  if (!d || typeof d !== 'object') return { rooms: [], profile: { ...DEFAULT_PROFILE }, settings: { ...DEFAULT_SETTINGS } };
  if (!Array.isArray(d.rooms)) d.rooms = [];
  d.profile = { ...DEFAULT_PROFILE, ...(d.profile || {}) };
  d.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  // R18 内置类的默认引导提示词——只为「玩家还没自定义过」的键补默认，玩家清空/改写后不再回填。
  d.settings.catPrompts = { ...TANGXIN_DEFAULT_CAT_PROMPTS, ...(d.settings.catPrompts || {}) };
  if (!Array.isArray(d.settings.customCats)) d.settings.customCats = [];
  if (!Array.isArray(d.friendReqs)) d.friendReqs = [];
  if (!Array.isArray(d.friends)) d.friends = [];
  if (!Array.isArray(d.bills)) d.bills = [];
  return d;
}
function write(d: TangxinData): void { writeWorldJson(WORLD_LS_KEYS.tangxin, d); }

// ---------- 直播间 ----------
export function getRooms(): TangxinRoom[] {
  // 关注优先，其次按更新时间倒序
  return read().rooms.slice().sort((a, b) => (b.followed ? 1 : 0) - (a.followed ? 1 : 0) || b.updatedAt - a.updatedAt);
}
export function getRoom(id: string): TangxinRoom | undefined { return read().rooms.find(r => r.id === id); }

export function createRoom(p: Partial<TangxinRoom> & { hostName: string; title: string }): TangxinRoom {
  const d = read();
  const t = Date.now();
  const room: TangxinRoom = {
    id: p.id || rid('rm'),
    hostName: p.hostName, hostRef: p.hostRef, title: p.title,
    cover: p.cover, tags: p.tags || [], category: p.category, followed: !!p.followed, isPrivate: !!p.isPrivate, isMine: !!p.isMine,
    online: p.online ?? (200 + Math.floor(Math.random() * 4000)),
    fans: p.fans ?? (1000 + Math.floor(Math.random() * 90000)),
    notice: p.notice || '', scene: p.scene, sceneDesc: p.sceneDesc, sceneUrl: p.sceneUrl,
    rank: p.rank || [], msgs: [], createdAt: t, updatedAt: t,
  };
  d.rooms.push(room);
  write(d);
  return room;
}
export function updateRoom(id: string, patch: Partial<Omit<TangxinRoom, 'id' | 'msgs' | 'createdAt'>>): void {
  const d = read();
  const i = d.rooms.findIndex(r => r.id === id);
  if (i < 0) return;
  d.rooms[i] = { ...d.rooms[i], ...patch, updatedAt: Date.now() };
  write(d);
}
export function deleteRoom(id: string): void {
  const d = read();
  d.rooms = d.rooms.filter(r => r.id !== id);
  write(d);
}
export function toggleFollow(id: string): void {
  const d = read();
  const r = d.rooms.find(x => x.id === id);
  if (!r) return;
  r.followed = !r.followed;
  write(d);
}

// ---------- 消息 ----------
export function addMsg(roomId: string, m: { kind: TangxinMsg['kind']; author: string; authorRef?: string; content: string; giftName?: string; vip?: boolean; isAi?: boolean }): TangxinMsg | undefined {
  const d = read();
  const r = d.rooms.find(x => x.id === roomId);
  if (!r) return undefined;
  const msg: TangxinMsg = { id: rid('mm'), kind: m.kind, author: m.author, authorRef: m.authorRef, content: m.content, giftName: m.giftName, vip: m.vip, ts: Date.now(), isAi: !!m.isAi };
  r.msgs.push(msg);
  r.updatedAt = Date.now();
  write(d);
  return msg;
}
export function clearMsgs(roomId: string): void {
  const d = read();
  const r = d.rooms.find(x => x.id === roomId);
  if (!r) return;
  r.msgs = [];
  write(d);
}

// 送礼累计到贡献榜（按累计金币倒序，保留前 20）
export function addGiftToRank(roomId: string, name: string, coins: number): TangxinRankEntry[] {
  const d = read();
  const r = d.rooms.find(x => x.id === roomId);
  if (!r) return [];
  if (!Array.isArray(r.rank)) r.rank = [];
  const e = r.rank.find(x => x.name === name);
  if (e) e.coins += coins; else r.rank.push({ name, coins });
  r.rank.sort((a, b) => b.coins - a.coins);
  r.rank = r.rank.slice(0, 20);
  r.updatedAt = Date.now();
  write(d);
  return r.rank;
}
export function clearAll(): void { const d = read(); write({ rooms: [], profile: d.profile, settings: d.settings, friendReqs: d.friendReqs, friends: d.friends, bills: d.bills }); }

// ---------- 资料 / 设置 / 数据管理 ----------
export function getProfile(): TangxinProfile { return read().profile || { ...DEFAULT_PROFILE }; }
export function updateProfile(patch: Partial<TangxinProfile>): void {
  const d = read(); d.profile = { ...DEFAULT_PROFILE, ...(d.profile || {}), ...patch }; write(d);
}
// 金币增减（送礼扣、充值加）。返回新余额，余额不足返回 -1（不扣）。
export function spendCoins(n: number): number {
  const d = read(); const p = d.profile || { ...DEFAULT_PROFILE };
  if (p.coins < n) return -1;
  p.coins -= n; d.profile = p; write(d); return p.coins;
}
export function addCoins(n: number): number {
  const d = read(); const p = d.profile || { ...DEFAULT_PROFILE };
  p.coins += n; d.profile = p; write(d); return p.coins;
}

export function getSettings(): TangxinSettings { return read().settings || { ...DEFAULT_SETTINGS }; }
export function updateSettings(patch: Partial<TangxinSettings>): void {
  const d = read(); d.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}), ...patch }; write(d);
}
// 仅清直播间（保留资料/设置）
export function clearRooms(): void { const d = read(); write({ rooms: [], profile: d.profile, settings: d.settings, friendReqs: d.friendReqs, friends: d.friends, bills: d.bills }); }
// 覆盖刷新——清掉推荐页的「路人」直播间（保留我开的 isMine、已关注 followed、回放 ended）。
// 传 cat 时只清该分类的路人直播间，不传则清全部路人在播间。返回清掉的条数。
export function clearRecommendRooms(cat?: string): number {
  const d = read();
  const before = d.rooms.length;
  d.rooms = d.rooms.filter(r => {
    if (r.isMine || r.followed || r.ended) return true;          // 保留我的/已关注/回放
    if (cat && cat !== '推荐' && !(r.category || '').includes(cat)) return true; // 指定分类时，别的分类保留
    return false;                                                 // 其余路人在播间清掉
  });
  write(d);
  return before - d.rooms.length;
}
// 彻底清空（含资料/设置回默认）
export function clearAllData(): void { write({ rooms: [], profile: { ...DEFAULT_PROFILE }, settings: { ...DEFAULT_SETTINGS }, friendReqs: [], friends: [], bills: [] }); }

// ---------- 好友申请 / 好友列表 ----------
export function getFriendReqs(): TangxinFriendReq[] { return read().friendReqs || []; }
export function getFriends(): TangxinFriend[] { return read().friends || []; }

// 批量添加好友申请（AI 生成的「好友申请」区块），按昵称去重（已申请/已好友的不重复加）
export function addFriendReqs(reqs: { name: string; words: string; source?: string; hiddenBg?: string; avatar?: string }[]): number {
  const d = read();
  const existReq = new Set((d.friendReqs || []).map(r => r.name));
  const existFr = new Set((d.friends || []).map(f => f.name));
  let n = 0;
  reqs.forEach(r => {
    const name = (r.name || '').trim();
    if (!name || existReq.has(name) || existFr.has(name)) return;
    existReq.add(name);
    (d.friendReqs ||= []).push({ id: rid('fq'), name, avatar: r.avatar, source: r.source, words: r.words || '想加你好友~', hiddenBg: r.hiddenBg, ts: Date.now() });
    n++;
  });
  if (n) write(d);
  return n;
}
// 同意申请 → 落到好友列表，返回新好友（供外层联动微信）
export function acceptFriendReq(reqId: string): TangxinFriend | undefined {
  const d = read();
  const i = (d.friendReqs || []).findIndex(r => r.id === reqId);
  if (i < 0) return undefined;
  const r = d.friendReqs![i];
  d.friendReqs!.splice(i, 1);
  const fr: TangxinFriend = { id: rid('fr'), name: r.name, avatar: r.avatar, badge: '蜜友', status: r.words?.slice(0, 24) || '', hiddenBg: r.hiddenBg, addedAt: Date.now() };
  (d.friends ||= []).push(fr);
  write(d);
  return fr;
}
export function rejectFriendReq(reqId: string): void {
  const d = read();
  d.friendReqs = (d.friendReqs || []).filter(r => r.id !== reqId);
  write(d);
}
export function removeFriend(friendId: string): void {
  const d = read();
  d.friends = (d.friends || []).filter(f => f.id !== friendId);
  write(d);
}

// ---------- 钱包账单（充值 / 送礼消费） ----------
export function getBills(): TangxinBill[] { return (read().bills || []).slice().sort((a, b) => b.ts - a.ts); }
export function addBill(kind: TangxinBill['kind'], amount: number, note: string): void {
  const d = read();
  (d.bills ||= []).unshift({ id: rid('bl'), kind, amount, note, ts: Date.now() });
  d.bills = d.bills.slice(0, 200);
  write(d);
}

// ---------- 主播等级体系 + 徽章体系 ----------
// 主播等级：按「累计收入(金币) + 累计开播场次」综合经验值升级，10 级封顶，每级有称号。
export type TangxinLevel = { level: number; name: string; exp: number; cur: number; next: number; pct: number };
const HOST_LEVEL_NAMES = ['新人主播', '崭露头角', '人气新星', '小有名气', '当红主播', '台柱主播', '镇站之宝', '顶流主播', '殿堂巨星', '传奇主播'];
// 每级所需累计经验（经验 = 累计收入 + 场次×200）。索引 i = 升到 i+2 级所需。
const HOST_LEVEL_REQ = [500, 2000, 6000, 15000, 35000, 70000, 130000, 230000, 400000];
export function hostExp(p: TangxinProfile): number { return Math.max(0, (p.totalIncome || 0) + (p.liveCount || 0) * 200); }
export function hostLevelInfo(p?: TangxinProfile): TangxinLevel {
  const prof = p || getProfile();
  const exp = hostExp(prof);
  let level = 1;
  for (let i = 0; i < HOST_LEVEL_REQ.length; i++) { if (exp >= HOST_LEVEL_REQ[i]) level = i + 2; else break; }
  level = Math.min(level, 10);
  const curBase = level >= 2 ? HOST_LEVEL_REQ[level - 2] : 0;
  const nextReq = level <= HOST_LEVEL_REQ.length ? HOST_LEVEL_REQ[level - 1] : curBase;
  const span = Math.max(1, nextReq - curBase);
  const cur = exp - curBase;
  return {
    level, name: HOST_LEVEL_NAMES[level - 1] || '主播', exp,
    cur, next: level >= 10 ? 0 : (nextReq - exp),
    pct: level >= 10 ? 100 : Math.max(0, Math.min(100, Math.round((cur / span) * 100))),
  };
}
// 把当前等级回写 profile.hostLevel（开播/结算后调用，便于他处直接读）。
export function syncHostLevel(): number { const lv = hostLevelInfo().level; updateProfile({ hostLevel: lv }); return lv; }

// 徽章体系：按成就解锁（认证/等级/收入/场次/粉丝/首充）。
export type TangxinBadge = { id: string; name: string; icon: string; desc: string; owned: boolean };
export function getBadges(p?: TangxinProfile): TangxinBadge[] {
  const prof = p || getProfile();
  const lv = hostLevelInfo(prof).level;
  const fans = prof.fans || 0;
  const income = prof.totalIncome || 0;
  const live = prof.liveCount || 0;
  return [
    { id: 'newcomer', name: '初登场', icon: 'fa-seedling', desc: '完成第一场直播', owned: live >= 1 },
    { id: 'certified', name: '认证主播', icon: 'fa-circle-check', desc: '通过主播认证', owned: !!prof.certified },
    { id: 'firstpay', name: '首充贵宾', icon: 'fa-gem', desc: '完成首充', owned: !!prof.firstRecharged },
    { id: 'rising', name: '人气新星', icon: 'fa-star', desc: '主播等级达到 3 级', owned: lv >= 3 },
    { id: 'hot', name: '当红主播', icon: 'fa-fire', desc: '主播等级达到 5 级', owned: lv >= 5 },
    { id: 'top', name: '顶流主播', icon: 'fa-crown', desc: '主播等级达到 8 级', owned: lv >= 8 },
    { id: 'fans1k', name: '千粉达成', icon: 'fa-heart', desc: '粉丝数突破 1000', owned: fans >= 1000 },
    { id: 'fans1w', name: '万粉主播', icon: 'fa-heart-circle-bolt', desc: '粉丝数突破 1 万', owned: fans >= 10000 },
    { id: 'rich', name: '吸金主播', icon: 'fa-money-bill-trend-up', desc: '累计收入突破 10 万金币', owned: income >= 100000 },
    { id: 'veteran', name: '资深主播', icon: 'fa-medal', desc: '累计开播 30 场', owned: live >= 30 },
  ];
}

// ---------- 主播资料页（懒生成存档） ----------
export function setHostProfile(roomId: string, hp: TangxinHostProfile): void {
  updateRoom(roomId, { hostProfile: { ...hp, generatedAt: Date.now() } });
}

// ---------- 连麦 / PK ----------
export function setLink(roomId: string, link: TangxinLink | undefined): void { updateRoom(roomId, { link }); }

// ---------- 福袋 / 抽奖 ----------
export function setLuckyBag(roomId: string, bag: TangxinLuckyBag | undefined): void { updateRoom(roomId, { luckyBag: bag }); }

// ---------- 粉丝团 ----------
export function joinFanClub(roomId: string, title?: string): TangxinFanClub | undefined {
  const r = getRoom(roomId);
  if (!r) return undefined;
  const fc: TangxinFanClub = { joined: true, level: (r.fanClub?.level || 0) + 1, title: title || r.fanClub?.title || `${r.hostName}的真爱粉` };
  updateRoom(roomId, { fanClub: fc });
  return fc;
}

// ---------- 主播专属称呼/累计打赏 → 私密房解锁 ----------
// 累计打赏达阈值则解锁 VIP 私密连线房
export function bumpRoomGiftTotal(roomId: string, coin: number, vipThreshold = 1000): boolean {
  const r = getRoom(roomId);
  if (!r) return false;
  const myTotal = (r.rank || []).reduce((s, e) => s + (e.coins || 0), 0);
  const unlocked = myTotal + coin >= vipThreshold;
  if (unlocked && !r.vipUnlocked) { updateRoom(roomId, { vipUnlocked: true }); return true; }
  return false;
}

// ---------- 下播 / 回放 ----------
export function endRoom(roomId: string): void { updateRoom(roomId, { ended: true }); }
export function getReplays(): TangxinRoom[] { return read().rooms.filter(r => r.ended).sort((a, b) => b.updatedAt - a.updatedAt); }
export function getLiveRooms(): TangxinRoom[] { return getRooms().filter(r => !r.ended); }
