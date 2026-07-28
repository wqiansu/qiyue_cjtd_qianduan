// 世界套件 —— 小红书（red）数据层（red-store.ts）
// PC 端生活分享社区：笔记（图文卡）+ 博主生态分层 + 关注关系 + 我发笔记 + 收藏夹灵感板 +
//   种草好物卡 + 商单联动 + 薯条投流 + 话题活动挑战。数据纯本地 _th_world_red_v1。
import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

export type RedComment = { id: string; author: string; content: string; likes: number; ts: number; replyTo?: string };
// 种草好物卡：笔记里挂的「同款好物」。
export type RedGoods = { name: string; price: string; point: string };
// 博主类型：素人 / 达人KOL / 商家号。
export type RedAuthorType = 'normal' | 'kol' | 'merchant';

export type RedNote = {
  id: string;
  author: string;           // 笔记作者昵称
  authorRef?: string;       // 关联联系人/角色键（可空）
  authorType: RedAuthorType;// 博主生态分层
  title: string;            // 笔记标题
  body: string;             // 正文
  topics: string[];         // 话题标签（不带#）
  category: string;         // 分类（穿搭/美妆/美食…）
  imgTag?: string;          // 封面英文 NAI tags（可空，出图用）
  coverDesc?: string;       // 封面/图集画面的中文描述（可空，无后端出图时给玩家看「图里有什么」）
  img?: string;             // 已生成封面 URL（可空）
  imgCount: number;         // 图集张数（图文 1~9，纯文字 0）
  likes: string;            // 点赞数 文字（量级感）
  collects: string;         // 收藏数 文字
  location?: string;        // 地点（附近 tab 用）
  channel: 'recommend' | 'follow' | 'nearby';
  goods?: RedGoods[];       // 种草好物卡
  isAd?: boolean;           // 软广/恰饭笔记（识别软广）
  sponsor?: string;         // 商单品牌名（商单联动）
  activityTag?: string;     // 参与的平台活动话题
  isHelp?: boolean;         // 避雷求助帖
  collected?: boolean;
  liked?: boolean;
  comments: RedComment[];
  ts: number;
  isMine?: boolean;         // 玩家自己发的笔记
  detailLoaded?: boolean;
};

// 博主名片（生态分层 + 关注 + 商单阈值）。由笔记里的 author 聚合 + AI 开号时补全。
export type RedBlogger = {
  name: string;             // 昵称（唯一键）
  ref?: string;             // 关联角色键
  identity?: string;        // 真实身份（指定角色开号时记录：这个号其实是世界里的谁）
  type: RedAuthorType;      // 素人/达人/商家
  verified?: string;        // 认证文字（如「美妆博主」「XX品牌官方」，空=未认证）
  avatar?: string;
  fansNum: number;          // 粉丝数（数字，用于阈值/涨粉掉粉与排序）
  bio?: string;
  followed?: boolean;
};

// 玩家个人主页。
export type RedProfile = {
  nickname: string;
  avatar?: string;
  banner?: string;
  bio?: string;
  level: string;            // 等级文字（如「薯队长 Lv.5」）
  fansNum: number;          // 我的粉丝数（达阈值收商单私信）
  following: number;
  brandDealsTaken: string[];// 已接过商单的品牌（去重，避免重复推私信）
};
export const DEFAULT_RED_PROFILE: RedProfile = {
  nickname: '我', level: '薯薯生 Lv.1', fansNum: 0, following: 0, brandDealsTaken: [],
};

// 收藏夹灵感板。
export type RedBoard = { id: string; name: string; noteIds: string[] };

// 平台活动·话题挑战：玩家发起/平台征集的话题挑战，笔记可参与冲榜。
export type RedActivity = { id: string; topic: string; desc: string; ts: number };

type RedData = {
  notes: RedNote[];
  bloggers?: RedBlogger[];
  profile?: RedProfile;
  boards?: RedBoard[];
  activities?: RedActivity[];
  settings?: RedSettings;
};

// 设置：上下文+世界书 / API 利用 / 功能提示词 / 生态浓度 / 分类与玩法 / 自动触发 / 记忆与数据。
export type RedSettings = {
  useFloors: boolean;
  floorCount: number;
  useWorldbook: boolean;
  worldbookEntryKeys: string[];
  autoInterval: number;
  lastFloor: number;
  noteTypePref: string;        // 笔记类型偏好（空=不限）
  filterStyle: string;         // 滤镜风格文字档
  nearbyPlace: string;         // 附近默认地点
  coverOn: boolean;            // 封面出图（可降级）
  memoryEnabled: boolean;
  syncEnabled: boolean;
  // 生态浓度（通用化注入提示词，不写死）
  ecoActivity: number;         // 出片活跃度 0-100
  ecoCommerce: number;         // 恰饭软广浓度 0-100
  ecoSnark: number;            // 酸/对线/翻车浓度 0-100
  ecoMeme: number;             // 网感玩梗浓度 0-100
  ecoErotic: number;           // 色情度浓度 0-100（情色向笔记占比与露骨/直白程度）
  ecoCarnal: number;           // 肉欲度浓度 0-100（肉体肉欲与诱惑表现强度）
  ecoDaily: number;            // 日常度浓度 0-100（平淡真实日常占比）
  blockWords: string[];
  brandDealOn: boolean;        // 商单联动总开关
  brandDealThreshold: number;  // 涨到多少粉丝触发品牌私信
  // 自定义分类 + 每分类独立引导提示词（key 用分类名，内置与自定义统一按 name 索引）
  customCats: { id: string; name: string; icon: string }[];
  catPrompts: Record<string, string>;
};
export const DEFAULT_RED_SETTINGS: RedSettings = {
  useFloors: true, floorCount: 6, useWorldbook: false, worldbookEntryKeys: [],
  autoInterval: 0, lastFloor: 0, noteTypePref: '', filterStyle: '清新', nearbyPlace: '',
  coverOn: false, memoryEnabled: true, syncEnabled: false,
  ecoActivity: 60, ecoCommerce: 45, ecoSnark: 40, ecoMeme: 60, blockWords: [],
  ecoErotic: 50, ecoCarnal: 50, ecoDaily: 50,
  brandDealOn: true, brandDealThreshold: 5000,
  customCats: [], catPrompts: {},
};

// 内置分类（参考真实小红书一级分类；首项 rec=推荐不入分区铁律）。
export const RED_CATEGORIES: { id: string; name: string; icon: string }[] = [
  { id: 'rec', name: '推荐', icon: 'fa-compass' },
  { id: 'fashion', name: '穿搭', icon: 'fa-shirt' },
  { id: 'beauty', name: '美妆', icon: 'fa-sparkles' },
  { id: 'food', name: '美食', icon: 'fa-utensils' },
  { id: 'travel', name: '旅行', icon: 'fa-plane' },
  { id: 'goods', name: '好物', icon: 'fa-bag-shopping' },
  { id: 'home', name: '家居', icon: 'fa-couch' },
  { id: 'emotion', name: '情感', icon: 'fa-heart' },
  { id: 'fitness', name: '健身', icon: 'fa-dumbbell' },
  { id: 'pet', name: '萌宠', icon: 'fa-paw' },
  // 成人向分类（R18，创作者与出镜者按本卡世界书设定的性别生态默认全为女性）
  { id: 'r18body', name: '身材管理', icon: 'fa-fire' },
  { id: 'r18lingerie', name: '私服内搭', icon: 'fa-heart' },
  { id: 'r18emotion', name: '私密情感', icon: 'fa-moon' },
  { id: 'r18gl', name: '姬圈日常', icon: 'fa-sparkles' },
  { id: 'r18cos', name: '媚态写真', icon: 'fa-crown' },
  { id: 'r18toy', name: '悦己好物', icon: 'fa-gem' },
];

// 每个内置分区的默认引导提示词（高信息密度、各分区独有），
// 作为 catRule 的「本分类额外要求」注入该分区 feed 生成。玩家可在「分类管理」里改写/清空，清空后不回填。
// 写法对标 red.feed 主提示词的思考维度：内容母题 + 创作者画像 + 标题套路 + 招牌钩子/元素 + 拟真元数据口味 + 该区特有生态。
export const RED_DEFAULT_CAT_PROMPTS: Record<string, string> = {
  '穿搭': '【穿搭区】内容母题：今日 OOTD、身高体重穿搭参考、显瘦/显高/遮肉技巧、风格定义（老钱风/美拉德/多巴胺/辣妹/通勤/山系/clean fit）、单品测评、平价替代、改造旧衣、明星同款拆解。创作者画像：素人晒身材管理型穿搭、达人讲版型与配色公式、商家/买手店上新带货。标题套路：「155小个子显高15cm的秘诀」「这条裤子让我月瘦体感」「被夸爆的xx风穿搭公式」，常带身高体重/身材焦点。招牌元素：正文必给身高体重+具体单品名+品牌+价位，分点列「上衣/下装/鞋/包/配饰」，强调可复制；topics 多用「#OOTD #穿搭公式 #小个子穿搭 #xx风」。好物卡 goods 优先挂关键单品。生态：评论区高频「求链接/求尺码/有没有平替/链接挂了」，恰饭软广里穿插真心安利。',
  '美妆': '【美妆区】内容母题：空瓶记/红黑榜、新品测评、妆容教程（伪素颜/欧美浓妆/伪骨相/通勤妆/野生眉）、成分党护肤、油皮干皮敏感肌对症、平价彩妆挖宝、专柜小样薅羊毛、医美/护肤科普。创作者画像：素人记录踩雷与回购、达人出教程与成分分析、品牌官方号上新种草。标题套路：「烂脸三年终于稳了的护肤流程」「黄黑皮一擦显白的口红」「学生党平价彩妆闭眼入」。招牌元素：正文给肤质前提+具体产品全名+色号/规格+使用感+价位，护肤强调「成分/浓度/早C晚A」，彩妆强调「色号/质地/持妆」，可引用「图3是上脸效果」；topics「#空瓶记 #成分党 #黄黑皮自救 #平价彩妆」。生态：评论区追问「色号？肤质？混油能用吗」，软广易被识破「这不是恰饭吗」。',
  '美食': '【美食区】内容母题：探店打卡、家常菜/烘焙菜谱、减脂餐、地方小吃地图、隐藏菜单、空气炸锅/预制菜测评、咖啡/奶茶测评、深夜放毒。创作者画像：素人晒自己做的饭/探店实录、美食达人出教程与测评、餐厅商家官方号引流。标题套路：「这家苍蝇馆子绝了人均30」「零失败！新手也能做的xx」「减脂期也能炫的高蛋白餐」。招牌元素：探店给店名+人均+地址/商圈+招牌菜+踩雷提醒；菜谱给食材克数+步骤分点+关键火候，强调「零失败/手残党友好」；topics「#探店 #减脂餐 #隐藏美食 #美食教程」，附近频道必给 location。生态：评论「求地址/求菜谱/踩雷过别去」，本地网友补充情报。',
  '旅行': '【旅行区】内容母题：城市citywalk路线、小众目的地、攻略避坑、住宿民宿测评、机酒薅羊毛、特种兵/穷游/松弛感旅行、出片机位、签证/交通干货。创作者画像：素人晒旅行vlog与真实体验、旅行达人出保姆级攻略、民宿/景区/OTA商家引流。标题套路：「3天2夜xx保姆级攻略（含避坑）」「人均500玩转xx」「这个机位出片绝了」。招牌元素：攻略给天数+预算+逐日行程+交通+住宿+人均，避坑帖直白点名「别去/被宰/排雷」，出片帖给具体机位与时段；topics「#旅行攻略 #小众旅行 #citywalk #出片机位」，必给 location。生态：评论「蹲攻略/求民宿/这季节合适吗」，本地人补冷门点。',
  '好物': '【好物区】内容母题：好物分享/开箱、平价替代、生活神器、收纳整理、数码外设、家电测评、清单合集（学生党/租房/通勤必备）、踩雷红黑榜。创作者画像：素人真实开箱与回购、测评达人横评、品牌/店铺官方号种草带货——这是恰饭软广浓度最高的区之一。标题套路：「相见恨晚的xx好物」「9.9包邮的神仙好物」「劝你别买的踩雷清单」。招牌元素：每篇主推 1~3 件，goods 同款好物卡是核心（name 商品名+price 价位+point 种草点必给），正文讲使用场景+体感+性价比，红黑榜要黑白分明；topics「#好物分享 #平价好物 #踩雷预警 #生活神器」。生态：评论「求链接（高频）/智商税吧/我也买了真香」，识破软广与真心安利并存，商单痕迹要自然。',
  '家居': '【家居区】内容母题：租房/出租屋改造、全屋装修避坑、软装搭配、好物收纳、爆改出租屋、ins风/侘寂/奶油风/复古风布置、家电选购、装修血泪史。创作者画像：素人晒自己的小窝与改造前后、家居达人出装修干货、家具/家电/软装商家引流。标题套路：「3000块爆改出租屋」「装修踩过的10个坑」「租来的房子也要好好住」。招牌元素：改造帖给「改造前→改造后」对比+预算+清单，装修帖给避坑要点+材料+报价，强调「房东看了都想涨租/可拆卸不破坏」；topics「#出租屋改造 #装修避坑 #家居好物 #软装搭配」，好物卡挂关键家居单品。生态：评论「求清单/链接/房东同意吗/预算超了吗」。',
  '情感': '【情感区】内容母题：恋爱碎碎念、情感语录、分手/复合/暗恋/异地、亲密关系沟通、原生家庭、独处与自洽、emo文学、树洞、男女视角对线。创作者画像：素人深夜emo与真实情感记录、情感博主输出观点/语录/方法论、偶有情感咨询商家引流。标题套路：「成年人的崩溃都是静音的」「分手后才懂的3件事」「不联系=不爱了吗」。招牌元素：以纯文字或一张氛围图为主（imgCount 常 0~1），正文走第一人称碎碎念/语录/小作文，有情绪有共鸣有金句，可分点输出观点；topics「#情感 #emo #恋爱碎碎念 #成年人的世界」。生态：评论区是大型共鸣/树洞现场「狠狠共情了/抱抱/说的就是我」，也有理性党泼冷水、男女视角对线，慎用软广。',
  '健身': '【健身区】内容母题：减脂增肌计划、徒手/器械动作教程、跟练打卡、饮食搭配、体态矫正（含胸/假胯宽/圆肩）、瑜伽普拉提、跑步、身材管理对比。创作者画像：素人晒减脂/增肌对比与跟练打卡、健身达人/教练出计划与动作讲解、健身房/器材/代餐商家引流。标题套路：「30天练出马甲线（附计划）」「假胯宽矫正一个月对比」「在家徒手虐腹跟练」。招牌元素：给周期+频率+动作组数次数+饮食热量缺口，强调「亲测有效/新手友好/不伤膝盖」，对比帖给「before→after」数据（体重/体脂/围度）；topics「#健身打卡 #减脂 #体态矫正 #跟练」。生态：评论「跟练ing/平台期咋办/教练这样对吗」，专业党纠错动作。',
  '萌宠': '【萌宠区】内容母题：晒猫晒狗日常、云吸宠、新手养宠攻略、宠物用品测评、救助流浪/领养代替购买、宠物医疗科普、奇趣行为吐槽、品种科普。创作者画像：素人铲屎官晒自家主子日常、养宠达人出科普攻略、宠物食品/用品/医院商家引流。标题套路：「我家猫又干坏事了」「新手养猫必备清单」「领养三个月的狗子变化」。招牌元素：正文走宠物拟人化吐槽+真情流露，攻略给「口粮/猫砂/疫苗/驱虫」清单与避坑，科普给症状与就医提醒，倡导「领养代替购买」；topics「#萌宠 #云吸猫 #养猫日常 #宠物好物」，好物卡挂宠物用品。生态：评论「太可爱了吧/同款铲屎官/求口粮链接」，养宠党交流经验。',
  // 成人向分类默认引导（R18，创作者与出镜者按本卡世界书设定的性别生态默认全为女性；露骨度按生态色情度上限走，皆为虚构表演与分享）。
  '身材管理': '【身材管理区】内容母题：成人向身材展示/管理分享——好身材打卡、马甲线/腰臀比/胸型管理、性感体态训练、身材自信vlog，借「健身/身材管理」之名行身材展示之实，主打「身材焦虑+悦己」的钩子。创作者画像：身材出众的素人晒对比与打卡、达人出「练出好身材」方法论，封面多定格身材帧。标题套路：「练出这个腰臀比的秘诀」「身材管理打卡第30天」「自律才有好身材」，常带身材数据/对比。招牌元素：正文给围度/体脂/训练计划+大量身材描述与体感，强调「自律/悦己/被夸」，配图定格诱惑帧；topics「#身材管理 #马甲线 #好身材 #身材自信」。生态：评论「姐姐好飒/求计划/这身材绝了/慕了」，专业党与颜狗并存，软广（健身/塑身/代餐）易识破。',
  '私服内搭': '【私服内搭区】内容母题：成人向内衣/睡衣/泳装/私服内搭种草测评，强调版型、材质、上身效果与身材呈现，是「穿搭区」的成人镜像，主打「好看+性感+悦己」。创作者画像：身材好的素人晒上身、内衣/睡衣品牌商家号种草带货——恰饭浓度偏高。标题套路：「显身材的内衣终于找到了」「这套睡衣谁看了不迷糊」「夏日泳装种草」，钩子落在上身效果与性感。招牌元素：正文给身高体重罩杯+具体单品名+材质+上身体感，分点列尺码/版型/显瘦点，配图上身展示；goods 好物卡挂内衣/睡衣单品；topics「#内衣种草 #睡衣 #泳装 #私服分享」。生态：评论「求链接/求尺码/平替有吗/身材绝了」，真心安利与软广掺半。',
  '私密情感': '【私密情感区】内容母题：成人向私密情感分享——亲密关系心得、性教育/悦己科普、情趣氛围营造、深夜私密话题、女性身体自我认知，比「情感区」更直接地谈亲密与欲望，走「真诚+私密」路线。创作者画像：素人深夜私密碎碎念、情感/两性博主输出科普与观点，偶有相关商家引流。标题套路：「成年人才懂的亲密小事」「女生一定要了解的身体知识」「深夜聊点私密的」，钩子落在私密话题与共鸣。招牌元素：以文字或氛围图为主（imgCount 常 0~1），正文第一人称私密碎碎念/科普小作文，有共鸣有金句有干货，含蓄而真诚；topics「#私密 #两性 #悦己 #女性成长」。生态：评论区是私密树洞「狠狠共情/学到了/原来不止我这样」，慎用软广，氛围真诚走心。',
  '姬圈日常': '【姬圈日常区】内容母题：成人向百合/GL情侣日常分享——女女情侣的相处vlog、纪念日、撒糖日常、双人穿搭、姬圈梗与文化，契合本卡无雄性世界观，是平台双人甜/欲内容的主力区。创作者画像：女女情侣档晒真实相处、姬圈博主输出文化与梗。标题套路：「和女朋友的第100天」「姬圈日常撒糖」「我们的双人穿搭」，钩子落在CP感与甜度。招牌元素：正文第一人称情侣视角，给相处细节/纪念日/双人好物，甜中带暧昧，配图情侣同框；topics「#百合 #les #姬圈日常 #女女情侣」，好物卡可挂情侣/双人单品。生态：评论「磕到了/好甜/在一起多久了/姐姐们好配」，姬圈姐妹抱团互动。',
  '媚态写真': '【媚态写真区】内容母题：成人向写真/氛围大片分享——私房写真、cos写真、氛围感美图、妆造+场景的媚态呈现，是「美妆/cos」的成人写真镜像，主打「氛围+媚态+审美」。创作者画像：会拍会摆的素人晒写真、写真/cos达人出大片与花絮，重妆造与场景。标题套路：「私房写真出片了」「这组氛围感绝了」「媚态cos写真」，点明写真主题+氛围。招牌元素：以多图美图为主（imgCount 偏多），正文给妆造/场景/机位/出片心得，强调氛围/审美/媚态，可挂妆造好物；topics「#写真 #氛围感 #私房 #cos写真」。生态：评论「绝美/姐姐好媚/求妆容/求机位/老婆」，审美党与颜狗刷屏。',
  '悦己好物': '【悦己好物区】内容母题：成人向悦己/情趣好物种草测评——女性悦己单品、氛围助眠/香氛、私密护理、情趣氛围好物等的分享测评，是「好物区」的成人镜像，主打「悦己+种草+真实测评」。创作者画像：素人真实开箱与回购、测评达人横评、相关品牌商家号种草——恰饭软广浓度高。标题套路：「悦己好物分享」「一个人也要对自己好」「私密护理避雷红黑榜」，钩子落在悦己与种草。招牌元素：每篇主推1~3件，goods 好物卡是核心（name 商品名+price 价位+point 种草点必给），正文讲使用场景+体感+性价比，含蓄而专业，红黑榜黑白分明；topics「#悦己好物 #种草 #私密护理 #氛围好物」。生态：评论「求链接（高频）/智商税吗/我也买了真香/姐妹真实」，软广与真心安利并存，商单痕迹要自然。',
};

function rid(p: string): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

function read(): RedData {
  const d = readWorldJson<RedData>(WORLD_LS_KEYS.red, { notes: [] });
  if (!d || typeof d !== 'object') return { notes: [] };
  if (!Array.isArray(d.notes)) d.notes = [];
  // 为「玩家还没自定义过」的内置分区补默认引导提示词，玩家清空/改写后不再回填。
  if (!d.settings) d.settings = { ...DEFAULT_RED_SETTINGS };
  d.settings.catPrompts = { ...RED_DEFAULT_CAT_PROMPTS, ...(d.settings.catPrompts || {}) };
  return d;
}
function write(d: RedData): void { writeWorldJson(WORLD_LS_KEYS.red, d); }

// ---- 笔记 ----
export function getNotes(channel?: RedNote['channel']): RedNote[] {
  const all = read().notes.slice().sort((a, b) => b.ts - a.ts);
  return channel ? all.filter(n => n.channel === channel) : all;
}
export function getNote(id: string): RedNote | undefined { return read().notes.find(n => n.id === id); }
export function getCollected(): RedNote[] { return getNotes().filter(n => n.collected); }
export function getNotesByAuthor(name: string): RedNote[] { return getNotes().filter(n => n.author === name); }
export function getMyNotes(): RedNote[] { return getNotes().filter(n => n.isMine); }

export function addNotes(list: Partial<RedNote>[], channel: RedNote['channel']): RedNote[] {
  const d = read();
  const added: RedNote[] = [];
  for (const p of list) {
    const n: RedNote = {
      id: p.id || rid('rn'),
      author: p.author || '路人', authorRef: p.authorRef,
      authorType: p.authorType || 'normal',
      title: p.title || '（无标题）', body: p.body || '',
      topics: Array.isArray(p.topics) ? p.topics : [],
      category: p.category || '推荐',
      imgTag: p.imgTag, coverDesc: p.coverDesc, img: p.img, imgCount: typeof p.imgCount === 'number' ? p.imgCount : 1,
      likes: p.likes || '0', collects: p.collects || '0',
      location: p.location, channel,
      goods: p.goods, isAd: p.isAd, sponsor: p.sponsor, activityTag: p.activityTag, isHelp: p.isHelp,
      collected: false, liked: false, comments: [], ts: Date.now(),
      isMine: p.isMine, detailLoaded: false,
    };
    d.notes.unshift(n);
    added.push(n);
    // 聚合作者名片：补建/同步类型
    syncBlogger(d, n.author, { type: n.authorType, ref: n.authorRef });
  }
  if (d.notes.length > 160) d.notes = d.notes.slice(0, 160);
  write(d);
  return added;
}
// 我发笔记（isMine，直接成片）。
export function addMyNote(p: Partial<RedNote>): RedNote {
  const d = read();
  const n: RedNote = {
    id: p.id || rid('rn'),
    author: p.author || (d.profile?.nickname || '我'),
    authorType: 'normal',
    title: p.title || '（无标题）', body: p.body || '',
    topics: Array.isArray(p.topics) ? p.topics : [],
    category: p.category || '推荐',
    imgTag: p.imgTag, coverDesc: p.coverDesc, img: p.img, imgCount: typeof p.imgCount === 'number' ? p.imgCount : 1,
    likes: p.likes || '0', collects: p.collects || '0',
    location: p.location, channel: 'recommend',
    goods: p.goods, activityTag: p.activityTag,
    collected: false, liked: false, comments: [], ts: Date.now(),
    isMine: true, detailLoaded: true,
  };
  d.notes.unshift(n);
  if (d.notes.length > 160) d.notes = d.notes.slice(0, 160);
  write(d);
  return n;
}
// 把「新增赞」累加到笔记原点赞量级（累加而非覆盖，避免投流一次就把总赞冲掉）。
export function addNoteLikes(id: string, delta: number | string): void {
  const inc = typeof delta === 'number' ? delta : likesToNum(delta);
  if (!inc) return;
  const d = read(); const n = d.notes.find(x => x.id === id); if (!n) return;
  const total = Math.max(0, likesToNum(n.likes) + inc);
  n.likes = fmtLikes(total);
  write(d);
}
export function updateNote(id: string, patch: Partial<RedNote>): void {
  const d = read();
  const i = d.notes.findIndex(n => n.id === id);
  if (i < 0) return;
  d.notes[i] = { ...d.notes[i], ...patch };
  write(d);
}
export function deleteNote(id: string): void {
  const d = read();
  d.notes = d.notes.filter(n => n.id !== id);
  if (Array.isArray(d.boards)) for (const b of d.boards) b.noteIds = b.noteIds.filter(x => x !== id);
  write(d);
}
export function toggleCollect(id: string): void {
  const d = read(); const n = d.notes.find(x => x.id === id); if (!n) return;
  n.collected = !n.collected; write(d);
}
export function toggleLike(id: string): void {
  const d = read(); const n = d.notes.find(x => x.id === id); if (!n) return;
  n.liked = !n.liked; write(d);
}
export function setComments(id: string, comments: Partial<RedComment>[]): void {
  const d = read(); const n = d.notes.find(x => x.id === id); if (!n) return;
  n.comments = comments.map(c => ({ id: c.id || rid('rc'), author: String(c.author || '路人'), content: String(c.content || ''), likes: Number(c.likes) || 0, ts: Date.now(), replyTo: c.replyTo }));
  n.detailLoaded = true;
  write(d);
}
export function addComment(id: string, c: { author: string; content: string; likes?: number; replyTo?: string }): void {
  const d = read(); const n = d.notes.find(x => x.id === id); if (!n) return;
  n.comments.push({ id: rid('rc'), author: c.author, content: c.content, likes: c.likes || 0, ts: Date.now(), replyTo: c.replyTo });
  write(d);
}
export function appendComments(id: string, list: { author: string; content: string; likes?: number; replyTo?: string }[]): void {
  const d = read(); const n = d.notes.find(x => x.id === id); if (!n) return;
  for (const c of list) n.comments.push({ id: rid('rc'), author: c.author, content: c.content, likes: c.likes || 0, ts: Date.now(), replyTo: c.replyTo });
  write(d);
}
export function clearAll(): void {
  const d = read();
  write({ notes: [], bloggers: [], boards: d.boards, activities: d.activities, profile: d.profile, settings: d.settings });
}
// 覆盖刷新：清掉路人 AI 笔记，保留我的笔记/已收藏/已赞。cat 给定时仅清该分类。
export function clearRecommendNotes(cat?: string): number {
  const d = read();
  const before = d.notes.length;
  d.notes = d.notes.filter(n => {
    const keep = n.isMine || n.collected || n.liked;
    if (keep) return true;
    if (cat && cat !== '推荐') return n.category !== cat;
    return false;
  });
  if (Array.isArray(d.boards)) { const ids = new Set(d.notes.map(n => n.id)); for (const b of d.boards) b.noteIds = b.noteIds.filter(x => ids.has(x)); }
  write(d);
  return before - d.notes.length;
}

// ---- 博主名片 + 关注 + 生态分层 ----
function syncBlogger(d: RedData, name: string, patch: Partial<RedBlogger>): void {
  if (!Array.isArray(d.bloggers)) d.bloggers = [];
  const i = d.bloggers.findIndex(b => b.name === name);
  if (i < 0) { d.bloggers.push({ name, type: patch.type || 'normal', fansNum: patch.fansNum ?? Math.floor(Math.random() * 8000), followed: false, ...patch }); return; }
  // 仅补空，不覆盖已存（避免刷新把已关注/认证抹掉）
  const cur = d.bloggers[i];
  d.bloggers[i] = { ...cur, type: patch.type && cur.type === 'normal' ? patch.type : cur.type, ref: cur.ref || patch.ref };
}
export function getBloggers(): RedBlogger[] {
  const d = read();
  const stored = Array.isArray(d.bloggers) ? d.bloggers : [];
  const byName = new Map<string, RedBlogger>();
  for (const b of stored) byName.set(b.name, b);
  for (const n of d.notes) {
    if (n.author && !byName.has(n.author)) byName.set(n.author, { name: n.author, type: n.authorType, ref: n.authorRef, fansNum: 0, followed: false });
  }
  return [...byName.values()];
}
export function getBlogger(name: string): RedBlogger | undefined { return getBloggers().find(b => b.name === name); }
export function upsertBlogger(name: string, patch: Partial<RedBlogger>): RedBlogger {
  const d = read();
  if (!Array.isArray(d.bloggers)) d.bloggers = [];
  const i = d.bloggers.findIndex(b => b.name === name);
  if (i < 0) { const b: RedBlogger = { name, type: 'normal', fansNum: 0, followed: false, ...patch }; d.bloggers.push(b); write(d); return b; }
  d.bloggers[i] = { ...d.bloggers[i], ...patch, name };
  write(d);
  return d.bloggers[i];
}
export function toggleFollow(name: string): boolean {
  const cur = getBlogger(name);
  const next = !(cur?.followed);
  upsertBlogger(name, { followed: next });
  return next;
}
export function getFollowed(): RedBlogger[] { return getBloggers().filter(b => b.followed); }
export function getFollowNotes(): RedNote[] {
  const set = new Set(getFollowed().map(b => b.name));
  return getNotes().filter(n => set.has(n.author));
}

// ---- 排序/热榜（话题热榜：聚合 topics 出现频次 + 笔记热度）----
function likesToNum(s: string): number {
  if (!s) return 0;
  const m = String(s).match(/([\d.]+)\s*([万wW]?)/);
  if (!m) return 0;
  const n = parseFloat(m[1]) || 0;
  return (m[2] === '万' || m[2] === 'w' || m[2] === 'W') ? n * 10000 : n;
}
// 数字回写成量级文字（≥1万用「万」，保留一位小数去尾零）。
function fmtLikes(n: number): string {
  if (n >= 10000) { const w = n / 10000; return (w >= 10 ? Math.round(w).toString() : (Math.round(w * 10) / 10).toString().replace(/\.0$/, '')) + '万'; }
  return String(Math.round(n));
}
export function getTopicRanking(limit = 12, cat?: string): { topic: string; heat: number; count: number }[] {
  let notes = getNotes();
  if (cat && cat !== '推荐') notes = notes.filter(n => n.category === cat);
  const map = new Map<string, { heat: number; count: number }>();
  for (const n of notes) {
    const h = likesToNum(n.likes) + likesToNum(n.collects);
    const tags = [...(n.topics || []), ...(n.activityTag ? [n.activityTag] : [])];
    for (const t of tags) {
      if (!t) continue;
      const cur = map.get(t) || { heat: 0, count: 0 };
      cur.heat += h + 1; cur.count += 1; map.set(t, cur);
    }
  }
  return [...map.entries()].map(([topic, v]) => ({ topic, ...v })).sort((a, b) => b.heat - a.heat).slice(0, limit);
}

// ---- 收藏夹灵感板（①）----
export function getBoards(): RedBoard[] { return read().boards || []; }
export function addBoard(name: string): RedBoard {
  const d = read(); if (!Array.isArray(d.boards)) d.boards = [];
  const b: RedBoard = { id: rid('bd'), name: name || '新灵感板', noteIds: [] };
  d.boards.push(b); write(d); return b;
}
export function deleteBoard(id: string): void {
  const d = read(); if (!Array.isArray(d.boards)) return;
  d.boards = d.boards.filter(b => b.id !== id); write(d);
}
export function toggleNoteInBoard(boardId: string, noteId: string): void {
  const d = read(); const b = (d.boards || []).find(x => x.id === boardId); if (!b) return;
  b.noteIds = b.noteIds.includes(noteId) ? b.noteIds.filter(x => x !== noteId) : [...b.noteIds, noteId];
  write(d);
}

// ---- 平台活动（④）----
export function getActivities(): RedActivity[] { return (read().activities || []).slice().sort((a, b) => b.ts - a.ts); }
export function addActivity(topic: string, desc: string): RedActivity {
  const d = read(); if (!Array.isArray(d.activities)) d.activities = [];
  const a: RedActivity = { id: rid('act'), topic, desc, ts: Date.now() };
  d.activities.unshift(a); write(d); return a;
}
export function deleteActivity(id: string): void {
  const d = read(); if (!Array.isArray(d.activities)) return;
  d.activities = d.activities.filter(a => a.id !== id); write(d);
}

// ---- 个人主页（③涨粉/商单）----
export function getProfile(): RedProfile {
  const d = read();
  return { ...DEFAULT_RED_PROFILE, ...(d.profile || {}) };
}
export function updateProfile(patch: Partial<RedProfile>): RedProfile {
  const d = read();
  d.profile = { ...DEFAULT_RED_PROFILE, ...(d.profile || {}), ...patch };
  write(d);
  return d.profile;
}
export function addFans(n: number): number {
  const d = read();
  const cur = { ...DEFAULT_RED_PROFILE, ...(d.profile || {}) };
  cur.fansNum = Math.max(0, cur.fansNum + n);
  d.profile = cur; write(d);
  return cur.fansNum;
}
export function markBrandDealTaken(brand: string): void {
  const d = read();
  const cur = { ...DEFAULT_RED_PROFILE, ...(d.profile || {}) };
  if (!cur.brandDealsTaken.includes(brand)) cur.brandDealsTaken.push(brand);
  d.profile = cur; write(d);
}

// ---- 设置 ----
export function getRedSettings(): RedSettings {
  const d = read();
  return { ...DEFAULT_RED_SETTINGS, ...(d.settings || {}) };
}
export function updateRedSettings(patch: Partial<RedSettings>): RedSettings {
  const d = read();
  d.settings = { ...DEFAULT_RED_SETTINGS, ...(d.settings || {}), ...patch };
  write(d);
  return d.settings;
}
