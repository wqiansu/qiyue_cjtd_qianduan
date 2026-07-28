// 淘宝（taobao）数据层（taobao-store.ts）
// PC 端网购平台：商品流（猜你喜欢/分类/搜索）+ 商品详情（主图描述/规格/价/评分/月销）+ 店铺 +
//   购物车 + 下单/物流 + 评价(买家秀图描述) + 「我的」订单 + 独立余额钱包(流水) + 促销节日 + 直播带货 +
//   差评/客服/退货。数据纯本地 _th_world_taobao_v1。
// 分区(section)：首页 / 服装(10 类·可绑定设定资料风格指南) / 日用百货 / 成人情趣(10 类) / 世界观特产(读绑定设定资料) / 购物车 / 订单 / 钱包 / 直播。
// 生态：消费水平 / 审美 / 趣味度 / 色情度(露骨程度) / 肉欲度(肉体肉欲与诱惑表现程度)。
import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

// ==================== 类型 ====================
export type TbSku = { name: string; price: number; stock?: string };       // 规格（颜色/尺码…）
export type TbProduct = {
  id: string;
  title: string;            // 商品标题（淘宝味：关键词堆叠）
  shopId: string;           // 所属店铺
  shopName: string;
  cat: string;              // 分类名
  section: string;          // 分区 id（clothing/daily/adult/specialty/home）
  price: number;            // 现价（元）
  oldPrice?: number;        // 划线原价
  desc: string;             // 商品详情文案
  mainImgDesc: string;      // 主图中文画面描述（无后端出图时给玩家看）
  imgTag?: string;          // 主图英文 NAI tag（出图用，可空）
  img?: string;             // 已生成主图 URL
  skus: TbSku[];            // 规格
  sales: string;            // 月销文字（"2.3万"）
  rating: number;           // 评分 0~5（一位小数）
  ratingCount: string;      // 评价数文字
  tags: string[];           // 卖点标签（包邮/七天无理由/旗舰…）
  isAdult?: boolean;        // 成人/情趣商品（吃色情度/肉欲度）
  liveOnly?: boolean;       // 直播专享价
  ts: number;
};
export type TbShop = {
  id: string;
  name: string;
  type: string;             // 旗舰店/专卖店/集市店/海外店…
  logoDesc?: string;        // 店招画面描述
  desc?: string;            // 店铺简介
  rating: number;           // 店铺评分（描述/物流/服务三项平均，简化为一个）
  fans: string;             // 粉丝数文字
  isMine?: boolean;         // 玩家/角色开的店
  ownerRef?: string;        // 关联角色键
};
export type TbReview = {
  id: string;
  productId: string;
  author: string;           // 买家昵称
  authorRef?: string;
  rating: number;           // 1~5
  content: string;          // 评价正文
  showImgDesc?: string;     // 买家秀图片中文描述（可空）
  sku?: string;             // 购买规格
  reply?: string;           // 商家回复（可空）
  isBad?: boolean;          // 差评
  ts: number;
};
export type TbCartItem = { productId: string; title: string; price: number; sku: string; qty: number; img?: string; mainImgDesc?: string };
export type TbOrderItem = { productId: string; title: string; price: number; sku: string; qty: number; mainImgDesc?: string };
export type TbOrderStatus = 'pending' | 'shipped' | 'delivered' | 'done' | 'refunding' | 'closed';
export type TbOrder = {
  id: string;
  items: TbOrderItem[];
  total: number;
  status: TbOrderStatus;
  addrSnapshot: string;     // 下单时收货地址快照
  logistics: { ts: number; text: string }[];  // 物流轨迹
  createdAt: number;
  reviewed?: boolean;
};
export type TbTxn = { id: string; ts: number; amount: number; balanceAfter: number; label: string; kind: 'spend' | 'recharge' | 'refund' | 'income' };
export type TbAddress = { name: string; phone: string; region: string; detail: string };
export type TbLiveRoom = {
  id: string; title: string; hostName: string; hostRef?: string;
  coverDesc?: string; viewers: string; productIds: string[]; running?: boolean;
};
// app 内通知（物流/客服/退款等）——纯 app 内通知中心，不再外推微信。
export type TbNotice = { id: string; ts: number; kind: 'logistics' | 'service' | 'refund' | 'order' | 'system'; title: string; body: string; orderId?: string; read?: boolean };

// ==================== 设置 ====================
export type TbSettings = {
  // 上下文
  useFloors: boolean; floorCount: number;
  useWorldbook: boolean; worldbookEntryKeys: string[];
  // 生态浓度
  ecoConsume: number;    // 消费水平（地摊价↔奢侈品）
  ecoAesthetic: number;  // 审美调性（朴素实用↔精致网红）
  ecoCurio: number;      // 趣味度（常规↔新奇有趣/世界观奇物）
  ecoErotic: number;     // 色情度（露骨程度控制）
  ecoCarnal: number;     // 肉欲度（肉体肉欲与诱惑表现程度控制）
  // 钱包
  balance: number;       // 独立余额（元）
  // 偏好 / 屏蔽
  pricePref: string;     // 价位偏好（留空=不限）
  blockWords: string[];
  // 记忆 / 同步
  memoryEnabled: boolean; syncEnabled: boolean;
  // 自动触发
  autoInterval: number;  // 0=关
  lastFloor: number;
  // 收货地址
  address: TbAddress;
  // 分类管理
  customCats: { section: string; name: string }[];
  catPrompts: Record<string, string>;
  // 联动
  pushLogisticsToWechat: boolean;   // 字段保留兼容，不再使用（通知改为 app 内通知中心）
};
export const DEFAULT_TB_ADDRESS: TbAddress = { name: '', phone: '', region: '', detail: '' };
export const DEFAULT_TB_SETTINGS: TbSettings = {
  useFloors: true, floorCount: 6,
  useWorldbook: true, worldbookEntryKeys: [],
  ecoConsume: 50, ecoAesthetic: 50, ecoCurio: 30, ecoErotic: 20, ecoCarnal: 30,
  balance: 8888,
  pricePref: '', blockWords: [],
  memoryEnabled: true, syncEnabled: false,
  autoInterval: 0, lastFloor: 0,
  address: { ...DEFAULT_TB_ADDRESS },
  customCats: [], catPrompts: {},
  pushLogisticsToWechat: true,
};

// 分区（顶层导航）。specialty 的分类默认值会读绑定设定资料自适应。
export const TB_SECTIONS: { id: string; name: string; icon: string }[] = [
  { id: 'home', name: '首页', icon: 'fa-house' },
  { id: 'clothing', name: '服装', icon: 'fa-shirt' },
  { id: 'daily', name: '日用百货', icon: 'fa-basket-shopping' },
  { id: 'adult', name: '成人情趣', icon: 'fa-heart' },
  { id: 'specialty', name: '特产', icon: 'fa-gem' },
];

// 各分区的内置分类（足够多且全面）。服装单独成区(10类·可绑风格指南)，
// 成人情趣 10 类（吃色情度/肉欲度），日用百货覆盖现代日用，特产读绑定设定资料。
export const TB_CATEGORIES: Record<string, { name: string; icon: string }[]> = {
  clothing: [
    { name: '女装上衣', icon: 'fa-shirt' },
    { name: '连衣裙', icon: 'fa-person-dress' },
    { name: '裤装', icon: 'fa-socks' },
    { name: '外套大衣', icon: 'fa-vest' },
    { name: '内衣家居服', icon: 'fa-bed' },
    { name: '鞋靴', icon: 'fa-shoe-prints' },
    { name: '箱包', icon: 'fa-bag-shopping' },
    { name: '配饰珠宝', icon: 'fa-gem' },
    { name: '汉服古风', icon: 'fa-feather' },
    { name: '半身裙', icon: 'fa-person-dress' },
    { name: '毛衣针织', icon: 'fa-vest' },
    { name: '泳装度假', icon: 'fa-umbrella-beach' },
    { name: 'JK制服', icon: 'fa-graduation-cap' },
    { name: '世界观服饰', icon: 'fa-wand-sparkles' },
  ],
  daily: [
    { name: '美妆护肤', icon: 'fa-sparkles' },
    { name: '香氛个护', icon: 'fa-spray-can-sparkles' },
    { name: '数码电器', icon: 'fa-laptop' },
    { name: '家居家纺', icon: 'fa-couch' },
    { name: '食品生鲜', icon: 'fa-apple-whole' },
    { name: '美食零食', icon: 'fa-cookie-bite' },
    { name: '母婴用品', icon: 'fa-baby' },
    { name: '文具书籍', icon: 'fa-book' },
    { name: '运动户外', icon: 'fa-dumbbell' },
    { name: '宠物用品', icon: 'fa-paw' },
    { name: '医药保健', icon: 'fa-kit-medical' },
    { name: '厨房餐厨', icon: 'fa-utensils' },
    { name: '家装建材', icon: 'fa-screwdriver-wrench' },
    { name: '汽车用品', icon: 'fa-car' },
    { name: '珠宝手表', icon: 'fa-gem' },
    { name: '虚拟服务', icon: 'fa-cloud' },
  ],
  adult: [
    { name: '情趣内衣', icon: 'fa-heart' },
    { name: '诱惑制服', icon: 'fa-crown' },
    { name: '睡衣丝袜', icon: 'fa-socks' },
    { name: '悦己玩具', icon: 'fa-gem' },
    { name: '情趣道具', icon: 'fa-handcuffs' },
    { name: '私密护理', icon: 'fa-pump-soap' },
    { name: '氛围助兴', icon: 'fa-wine-glass' },
    { name: 'cos写真服', icon: 'fa-masks-theater' },
    { name: '香氛媚药', icon: 'fa-flask' },
    { name: '两性情趣礼盒', icon: 'fa-gift' },
    { name: '成人漫画写真', icon: 'fa-book-open' },
    { name: '润滑清洁', icon: 'fa-droplet' },
    { name: '束缚调教', icon: 'fa-handcuffs' },
    { name: '角色扮演', icon: 'fa-masks-theater' },
  ],
  specialty: [
    { name: '灵材丹药', icon: 'fa-flask' },
    { name: '法器灵器', icon: 'fa-wand-sparkles' },
    { name: '符箓阵盘', icon: 'fa-scroll' },
    { name: '灵植种子', icon: 'fa-seedling' },
    { name: '秘籍功法', icon: 'fa-book-open' },
    { name: '灵宠妖兽', icon: 'fa-dragon' },
    { name: '仙家服饰', icon: 'fa-feather' },
    { name: '奇珍异宝', icon: 'fa-gem' },
    { name: '灵茶灵酒', icon: 'fa-wine-bottle' },
    { name: '矿石灵石', icon: 'fa-gem' },
    { name: '古董字画', icon: 'fa-scroll' },
    { name: '手作文创', icon: 'fa-palette' },
  ],
};

// 各分类默认引导提示词（高信息密度；设定资料可能只写「服装怎么设计」，提示词补「怎么生成商品」）。
// 写法：商品母题 + 标题套路 + 详情维度(卖点/规格/材质/适用) + 评价生态 + 价位口味。
export const TB_DEFAULT_CAT_PROMPTS: Record<string, string> = {
  '女装上衣': '【女装上衣】商品母题：T恤/衬衫/针织/卫衣/雪纺衫等上装。标题套路：风格词+版型+卖点堆叠（"法式复古泡泡袖衬衫显瘦遮肉小个子"）。详情维度：面料成分+克重+版型(修身/oversize)+尺码表(S-XL对应身高体重)+模特试穿数据+搭配建议+洗涤说明。卖点标签：包邮/七天无理由/现货速发/赠运费险。评价生态：买家秀晒上身效果、问尺码偏大偏小、面料是否起球、和图片色差。价位口味：随消费水平从9.9平价到设计师款数百元。若绑定了服装风格指南设定资料，严格按指南的风格/版型/材质设定来生成款式。',
  '连衣裙': '【连衣裙】商品母题：碎花裙/针织裙/吊带裙/通勤裙/小黑裙/度假长裙。标题套路：场景+风格+身材福利（"显瘦气质碎花连衣裙夏季法式茶歇裙"）。详情维度：裙长(及膝/过膝/超长)+腰型+里衬+面料垂坠感+尺码表+模特身高体重参考+适用场景(约会/通勤/度假)。评价生态：晒身高体重穿搭、问透不透、有没有内衬、显不显黑。价位随消费水平浮动。绑定风格指南时按其设定出款。',
  '裤装': '【裤装】商品母题：牛仔裤/西装裤/阔腿裤/打底裤/休闲裤。标题套路：显高显瘦+版型（"高腰显瘦阔腿裤垂感拖地裤"）。详情维度：裤型+腰高+面料+弹力+尺码(腰围/臀围/裤长)+身高建议。评价：问长度要不要剪、弹力如何、显不显腿粗。',
  '外套大衣': '【外套大衣】商品母题：风衣/羽绒服/大衣/夹克/西装外套。标题：保暖/版型/通勤（"赫本风双面呢大衣中长款过膝"）。详情：填充物/克重/面料/版型/内搭建议/保暖等级。评价：保不保暖、版型挺不挺、掉不掉毛。价位偏高。',
  '内衣家居服': '【内衣家居服】商品母题：无钢圈内衣/文胸/睡衣/家居服套装（日常款，非情趣）。标题：舒适/无痕/聚拢（"无痛感无钢圈内衣大杯收副乳"）。详情：罩杯/尺码对照/面料/功能(聚拢/承托)+套装件数。评价：问尺码、舒不舒服、是否显形。注意这是日常内衣区，性感露骨内容归「成人情趣」分区。',
  '鞋靴': '【鞋靴】商品母题：小白鞋/高跟鞋/靴子/凉鞋/乐福鞋。标题：百搭/显高/舒适（"真皮乐福鞋厚底显高百搭"）。详情：鞋型+鞋跟高度+材质+鞋码对照+脚宽建议+软硬。评价：码数偏大偏小、磨不磨脚、显脚大吗。',
  '箱包': '【箱包】商品母题：托特包/腋下包/双肩包/行李箱/钱包。标题：通勤/容量/质感（"大容量托特包通勤百搭软皮"）。详情：尺寸+容量(能装下什么)+材质+内隔+背法+五金。评价：质感如何、容量够不够、肩带舒服吗。',
  '配饰珠宝': '【配饰珠宝】商品母题：项链/耳饰/戒指/手链/发饰/丝巾。标题：轻奢/气质/叠戴（"轻奢锁骨链小众设计感"）。详情：材质(银/钢/合金/天然石)+尺寸+是否抗过敏+保养。评价：会不会掉色、过敏吗、和图片一样吗。',
  '汉服古风': '【汉服古风】商品母题：齐胸襦裙/马面裙/宋制汉服/改良国风。标题：形制+绣花+仙气（"重工刺绣马面裙宋锦改良"）。详情：形制+面料+绣工+裙长+腰围+穿着层数+配饰。评价：形制正不正、做工绣花、仙不仙。价位随做工从平价到重工数百上千。',
  '世界观服饰': '【世界观服饰】商品母题：契合本作世界观的服饰（仙门道袍/灵纹长裙/秘境战衣等），现实电商语气包装的异世界服装。标题：世界观元素+卖点（按设定资料命名）。详情：材质(灵丝/妖兽皮等可奇幻)+形制+附带效果(若世界观允许，作为卖点文案)+尺码。若绑定了服装风格指南设定资料，严格据其款式/风格/材质设定生成。评价生态结合世界观(修士/同好的真实反馈)。',
  // 成人情趣（吃色情度=露骨程度、肉欲度=肉体肉欲与诱惑表现程度）
  '情趣内衣': '【情趣内衣】商品母题：成人向情趣内衣/诱惑套装（蕾丝/镂空/绑带/开襟）。标题：诱惑+场景（按色情度调直白程度："蕾丝诱惑情趣套装"↔更露骨表述）。详情：款式+材质(蕾丝/网纱)+尺码+遮蔽度+穿着场景+搭配。买家秀与卖点的肉体/诱惑表现强度跟随**肉欲度**，露骨直白程度跟随**色情度**。评价生态：晒上身诱惑效果(按两滑块调浓度)、问尺码遮蔽度、伴侣反应。全女性世界观，出镜与买家皆女性。',
  '诱惑制服': '【诱惑制服】商品母题：制服诱惑(女仆/护士/学生/兔女郎/秘书等角色扮演服)。标题：角色+诱惑钩子。详情：套装件数+材质+尺码+配饰(领结/头饰/丝袜)+诱惑设计点。肉欲表现(身材呈现/姿态诱惑)跟随肉欲度，露骨程度跟随色情度。评价：晒角色扮演效果、问质感、情趣氛围。',
  '睡衣丝袜': '【睡衣丝袜】商品母题：性感睡衣/吊带睡裙/丝袜美腿(成人向，区别于日常家居服)。标题：性感/诱惑/真丝。详情：款式+材质(真丝/冰丝/网袜)+透视度+尺码+丝袜D数。诱惑与肉体表现跟随肉欲度，露骨跟随色情度。评价：晒上身/美腿、问透不透、丝滑度。',
  '悦己玩具': '【悦己玩具】商品母题：女性悦己情趣玩具(含蓄电商化表述)。标题：悦己/解压/私密好物。详情：功能+材质(医用硅胶)+静音+充电+清洁+私密包装。文案含蓄专业，露骨程度严格跟随色情度(低则极含蓄、高则直接)，肉欲度影响诱惑氛围渲染。评价：私密好物的真实测评(含蓄)、问包装隐蔽吗、噪音。全女性世界观。',
  '情趣道具': '【情趣道具】商品母题：情趣道具/助兴小物(绑缚/眼罩/羽毛/口塞等，含蓄电商化)。标题：情趣/氛围/二人世界。详情：材质+套装+玩法场景(含蓄)+安全提示+私密包装。露骨跟色情度、诱惑氛围跟肉欲度。评价：氛围营造、问材质安全、隐私包装。',
  '私密护理': '【私密护理】商品母题：女性私密护理/清洁/保养用品。标题：私密/温和/呵护。详情：成分+温和度+使用方法+功效。文案偏健康向，露骨度低，肉欲度仅影响很轻的氛围词。评价：温和吗、有没有不适、回购。',
  '氛围助兴': '【氛围助兴】商品母题：情趣氛围用品(香薰/暖光/助兴饮品/玫瑰花瓣等)。标题：氛围/浪漫/二人世界。详情：营造的氛围+用法+搭配。露骨度低，主打浪漫诱惑氛围(跟肉欲度)。评价：氛围感、浪漫、伴侣反应。',
  'cos写真服': '【cos写真服】商品母题：成人向cos/写真服装(角色还原+诱惑改良)。标题：角色+写真+诱惑。详情：还原角色+套装+材质+配饰+诱惑改良点。肉体诱惑表现跟肉欲度，露骨跟色情度。评价：晒cos写真效果、还原度、出片。',
  '香氛媚药': '【香氛媚药】商品母题：虚构的情趣香氛/费洛蒙香水/助兴香薰(世界观可含奇幻"媚药"设定)。标题：诱惑/费洛蒙/氛围。详情：香调+功效(诱惑氛围向，世界观允许时可奇幻)+用法。露骨跟色情度、诱惑渲染跟肉欲度。评价：氛围效果、味道、伴侣反应。全女性百合向。',
  '两性情趣礼盒': '【两性情趣礼盒】商品母题：情侣/伴侣情趣礼盒(组合装，百合向)。标题：情侣/礼盒/二人世界。详情：礼盒包含的组合+适用场景+私密包装+送礼场景(纪念日/告白)。露骨跟色情度、诱惑/肉欲氛围跟肉欲度。评价：送女友反应、组合实不实用、包装。',
  // 特产（读绑定设定资料自适应）
  '灵材丹药': '【灵材丹药·世界观特产】商品母题：本作世界观里的修炼资源(灵药/丹药/灵材/补品)。用现实电商语气包装：标题给名称+品阶+功效钩子。详情：品阶/产地/功效/服用方式/适用境界(按设定资料)，附带「修士实测」式卖点。有设定资料时据此取材。评价：修士买家的真实反馈(功效/品质/有无副作用)，结合世界观。价位随品阶差异极大。',
  '法器灵器': '【法器灵器·世界观特产】商品母题：法器/灵器/本命物。标题：器名+品阶+威能钩子。详情：材质(灵金/妖骨等)+品阶+附带阵法/效果+适配境界+炼制工艺(按设定资料)。卖点像数码测评一样讲「参数」。评价：修士实战反馈。',
  '符箓阵盘': '【符箓阵盘·世界观特产】商品母题：符箓/阵盘/阵旗。标题：符名+品阶+用途。详情：绘制材料+威力+一次性/可重复+布阵难度。评价：阵法师/修士的实用反馈。',
  '灵植种子': '【灵植种子·世界观特产】商品母题：灵植/灵草/灵果种子苗木。标题：名称+品阶+培育难度。详情：习性+培育周期+产出+所需灵气环境。像种花种菜一样的电商化。评价：药园主/散修反馈成活率与产出。',
  '秘籍功法': '【秘籍功法·世界观特产】商品母题：功法/秘籍/心法残卷。标题：功法名+品阶+属性。详情：属性/适配根骨/修炼难度/上限境界/有无副作用(按设定资料)。卖点强调「正版残卷/孤本」。评价：修士反馈契合度与进境。注意虚构功法。',
  '灵宠妖兽': '【灵宠妖兽·世界观特产】商品母题：灵宠/妖兽幼崽/坐骑。标题：种类+品阶+萌点/威能。详情：习性+成长性+战斗/辅助能力+喂养。像宠物店一样电商化。评价：养主反馈灵性与战力。',
  '仙家服饰': '【仙家服饰·世界观特产】商品母题：修士/仙门服饰(道袍/灵纹长裙/法衣)。标题：形制+灵纹+品阶。详情：材质(灵丝/妖兽皮)+灵纹效果(防御/敛息等卖点)+形制+尺码。若绑定了服装风格指南设定资料，据其款式设定生成。评价：修士的真实穿着反馈。',
  '奇珍异宝': '【奇珍异宝·世界观特产】商品母题：杂项奇物/秘境产出/拍卖品。标题：宝名+稀有度+卖点。详情：来历+功效/收藏价值+真伪鉴定。像古玩拍卖电商化。评价：藏家/修士反馈真伪与价值。有设定资料时据此取材。',
  // —— 新增分类默认提示词 ——
  '半身裙': '【半身裙】商品母题：A字裙/百褶裙/包臀裙/牛仔裙等半身裙。标题：版型+风格+显瘦点（"高腰A字裙显瘦遮胯梨形救星"）。详情：版型/长度/面料/腰围尺码对照+搭配建议。评价：问显不显瘦、长度、起球。有服装风格指南设定资料时据此出款。',
  '毛衣针织': '【毛衣针织】商品母题：套头毛衣/开衫/针织裙。标题：材质+版型+保暖/不扎（"半高领山羊绒毛衣软糯不扎慵懒风"）。详情：材质(羊绒/羊毛/混纺)+克重+版型+尺码。评价：问扎不扎、起球、保暖。',
  '泳装度假': '【泳装度假】商品母题：连体/分体泳衣/度假比基尼/沙滩裙。标题：版型+遮肉/显身材点+度假风。详情：版型/胸垫/尺码/面料速干。露骨与身材诱惑程度轻度跟色情度/肉欲度(仍是正规泳装区，露骨款归成人情趣)。评价：问显不显身材、透不透、尺码。全女性向。',
  'JK制服': '【JK制服】商品母题：JK制服/学院风套装(格裙/水手服/西式制服)。标题：形制+格纹+正统/日常。详情：形制(关西/关东)+格纹配色+褶裙工艺+尺码。评价：问正不正、褶保持、面料。清爽学院风为主，越界写真归成人情趣。',
  '厨房餐厨': '【厨房餐厨·日用】商品母题：锅具/刀具/餐具/厨房小家电/收纳。标题：材质+功能卖点（"麦饭石不粘锅不沾少油烟"）。详情：材质/规格/是否适用电磁炉+套装件数。评价：问粘不粘、耐用、划算。',
  '家装建材': '【家装建材·日用】商品母题：灯具/五金/墙纸/收纳/软装。标题：风格+安装/效果卖点。详情：尺寸/材质/安装方式+适用空间。评价：问好不好装、效果、质量。',
  '汽车用品': '【汽车用品·日用】商品母题：车载用品/清洁/装饰/安全。标题：适配+功能卖点。详情：适配车型/材质/安装。评价：问适不适配、实不实用。',
  '珠宝手表': '【珠宝手表·日用】商品母题：饰品/手表/轻奢珠宝。标题：材质+设计+送礼/自戴钩子。详情：材质(925银/18K/钢)+工艺+尺寸+是否附证书礼盒。评价：问掉不掉色、正不正、送礼有没有面儿。',
  '成人漫画写真': '【成人漫画写真·成人情趣】商品母题：成人向漫画/写真集/画册（虚拟或实体，皆为虚构作品）。标题：题材+尺度钩子。详情：题材/页数/尺度分级。露骨直白程度严格跟随**色情度**、肉体表现跟随**肉欲度**。评价：读者对尺度与质量的反馈(按双滑块调浓度)。全女性百合、皆为虚构。',
  '润滑清洁': '【润滑清洁·成人情趣】商品母题：人体润滑/私密清洁/情趣护理（含蓄电商化健康向）。标题：功效+安全成分（"水溶性润滑温和不刺激"）。详情：成分/用途/安全提示+私密包装。露骨轻度跟色情度、其余偏健康向。评价：私密好物含蓄测评+隐私包装。全女性世界观。',
  '束缚调教': '【束缚调教·成人情趣】商品母题：束缚/调教/情趣道具（皆为成人虚构表演用品）。标题：道具+玩法钩子。详情：材质/安全设计/玩法+私密包装。露骨直白程度严格跟随**色情度**，诱惑氛围跟随**肉欲度**，由暧昧到大胆。评价：按双滑块调浓度的体验反馈。全女性百合、皆为虚构表演。',
  '角色扮演': '【角色扮演·成人情趣】商品母题：情趣cos服/角色扮演套装（护士/女仆/学姐/兔女郎等，成人向）。标题：角色+诱惑点。详情：套装件数/材质/尺码+氛围描述。露骨与身材诱惑严格跟色情度/肉欲度，由甜美到大胆。评价：按双滑块调浓度。全女性百合、皆为虚构表演。',
  '灵茶灵酒': '【灵茶灵酒·世界观特产】商品母题：灵茶/灵酒/养生饮的世界观特产。标题：名品+功效/口感钩子。详情：产地/年份/功效(灵气/滋补)+饮法。像高端茶酒电商化。评价：修士/食客反馈口感与功效。有设定资料时据此取材。',
  '矿石灵石': '【矿石灵石·世界观特产】商品母题：灵石/矿料/晶石(修炼资源或收藏)。标题：品类+品阶+纯度。详情：品阶/灵气纯度/用途(修炼/炼器/收藏)+真伪鉴定。像玉石原石电商化。评价：藏家/修士反馈成色与价值。',
  '古董字画': '【古董字画·世界观特产】商品母题：古董/字画/拓本(收藏拍卖向)。标题：品名+年代+来历钩子。详情：年代/作者/来历+真伪鉴定+收藏价值。像古玩拍卖电商化。评价：藏家反馈真伪与价值。',
  '手作文创': '【手作文创·世界观特产】商品母题：手作/文创周边/定制小物。标题：品类+设计+手作温度。详情：材质/工艺/是否可定制+设计理念。像文创小店电商化。评价：买家反馈质感与心意。',
};

// ==================== 数据存取 ====================
type TbData = {
  products: TbProduct[];
  shops: TbShop[];
  reviews: TbReview[];
  cart: TbCartItem[];
  orders: TbOrder[];
  txns: TbTxn[];
  live: TbLiveRoom[];
  notices: TbNotice[];
  settings: TbSettings;
};
function rid(p: string): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }
function blank(): TbData {
  return { products: [], shops: [], reviews: [], cart: [], orders: [], txns: [], live: [], notices: [], settings: { ...DEFAULT_TB_SETTINGS } };
}
function read(): TbData {
  const d = readWorldJson<TbData>(WORLD_LS_KEYS.taobao, blank());
  if (!d || typeof d !== 'object') return blank();
  d.products ||= []; d.shops ||= []; d.reviews ||= []; d.cart ||= []; d.orders ||= []; d.txns ||= []; d.live ||= []; d.notices ||= [];
  d.settings = { ...DEFAULT_TB_SETTINGS, ...(d.settings || {}) };
  d.settings.address = { ...DEFAULT_TB_ADDRESS, ...(d.settings.address || {}) };
  d.settings.catPrompts = { ...TB_DEFAULT_CAT_PROMPTS, ...(d.settings.catPrompts || {}) };
  return d;
}
function write(d: TbData): void { writeWorldJson(WORLD_LS_KEYS.taobao, d); }

// ---- 设置 ----
export function getTbSettings(): TbSettings { return read().settings; }
export function updateTbSettings(patch: Partial<TbSettings>): TbSettings {
  const d = read(); d.settings = { ...d.settings, ...patch }; write(d); return d.settings;
}

// ---- 商品 ----
export function getProducts(section?: string, cat?: string): TbProduct[] {
  let list = read().products.slice().sort((a, b) => b.ts - a.ts);
  if (section && section !== 'home') list = list.filter(p => p.section === section);
  if (cat) list = list.filter(p => p.cat === cat);
  return list;
}
export function getProduct(id: string): TbProduct | undefined { return read().products.find(p => p.id === id); }
export function searchProducts(q: string): TbProduct[] {
  const k = q.trim().toLowerCase(); if (!k) return [];
  return read().products.filter(p => p.title.toLowerCase().includes(k) || p.cat.toLowerCase().includes(k) || p.tags.some(t => t.toLowerCase().includes(k)));
}
export function addProducts(list: Partial<TbProduct>[], section: string, cat: string): TbProduct[] {
  const d = read(); const added: TbProduct[] = [];
  for (const p of list) {
    const shopName = p.shopName || '臻选旗舰店';
    const shopId = p.shopId || ensureShop(d, shopName, p.shopId);
    const prod: TbProduct = {
      id: p.id || rid('tp'), title: p.title || '商品', shopId, shopName,
      cat: p.cat || cat, section: p.section || section,
      price: typeof p.price === 'number' ? p.price : 99, oldPrice: p.oldPrice,
      desc: p.desc || '', mainImgDesc: p.mainImgDesc || '', imgTag: p.imgTag, img: p.img,
      skus: Array.isArray(p.skus) && p.skus.length ? p.skus : [{ name: '默认', price: typeof p.price === 'number' ? p.price : 99 }],
      sales: p.sales || '0', rating: typeof p.rating === 'number' ? p.rating : 4.8,
      ratingCount: p.ratingCount || '0', tags: Array.isArray(p.tags) ? p.tags : ['包邮', '七天无理由'],
      isAdult: p.isAdult ?? (section === 'adult'), liveOnly: p.liveOnly, ts: Date.now(),
    };
    d.products.unshift(prod); added.push(prod);
  }
  if (d.products.length > 240) d.products = d.products.slice(0, 240);
  write(d); return added;
}
export function updateProduct(id: string, patch: Partial<TbProduct>): void {
  const d = read(); const p = d.products.find(x => x.id === id); if (!p) return;
  Object.assign(p, patch); write(d);
}

// ---- 店铺 ----
function ensureShop(d: TbData, name: string, id?: string): string {
  let s = d.shops.find(x => (id && x.id === id) || x.name === name);
  if (!s) { s = { id: id || rid('ts'), name, type: '旗舰店', rating: 4.9, fans: '0' }; d.shops.push(s); }
  return s.id;
}
export function getShop(id: string): TbShop | undefined { return read().shops.find(s => s.id === id); }
export function getShopByName(name: string): TbShop | undefined { return read().shops.find(s => s.name === name); }
export function upsertShop(p: Partial<TbShop>): TbShop {
  const d = read(); let s = p.id ? d.shops.find(x => x.id === p.id) : d.shops.find(x => x.name === p.name);
  if (!s) { s = { id: p.id || rid('ts'), name: p.name || '店铺', type: p.type || '旗舰店', rating: p.rating ?? 4.9, fans: p.fans || '0' }; d.shops.push(s); }
  Object.assign(s, p); write(d); return s;
}
export function getShopProducts(shopId: string): TbProduct[] { return read().products.filter(p => p.shopId === shopId).sort((a, b) => b.ts - a.ts); }

// ---- 评价 ----
export function getReviews(productId: string): TbReview[] { return read().reviews.filter(r => r.productId === productId).sort((a, b) => b.ts - a.ts); }
export function addReviews(productId: string, list: Partial<TbReview>[]): TbReview[] {
  const d = read(); const added: TbReview[] = [];
  for (const r of list) {
    const rv: TbReview = {
      id: r.id || rid('tr'), productId, author: r.author || '匿名买家', authorRef: r.authorRef,
      rating: typeof r.rating === 'number' ? r.rating : 5, content: r.content || '',
      showImgDesc: r.showImgDesc, sku: r.sku, reply: r.reply, isBad: r.isBad ?? ((r.rating ?? 5) <= 2), ts: Date.now() - Math.floor(Math.random() * 86400000 * 30),
    };
    d.reviews.push(rv); added.push(rv);
  }
  write(d); return added;
}
export function setReviewReply(reviewId: string, reply: string): void {
  const d = read(); const r = d.reviews.find(x => x.id === reviewId); if (r) { r.reply = reply; write(d); }
}

// ---- 购物车 ----
export function getCart(): TbCartItem[] { return read().cart; }
export function addToCart(p: TbProduct, sku: string, qty = 1): void {
  const d = read(); const price = p.skus.find(s => s.name === sku)?.price ?? p.price;
  const ex = d.cart.find(c => c.productId === p.id && c.sku === sku);
  if (ex) ex.qty += qty; else d.cart.push({ productId: p.id, title: p.title, price, sku, qty, img: p.img, mainImgDesc: p.mainImgDesc });
  write(d);
}
export function setCartQty(productId: string, sku: string, qty: number): void {
  const d = read(); const c = d.cart.find(x => x.productId === productId && x.sku === sku); if (!c) return;
  if (qty <= 0) d.cart = d.cart.filter(x => !(x.productId === productId && x.sku === sku)); else c.qty = qty;
  write(d);
}
export function removeFromCart(productId: string, sku: string): void {
  const d = read(); d.cart = d.cart.filter(x => !(x.productId === productId && x.sku === sku)); write(d);
}
export function clearCart(): void { const d = read(); d.cart = []; write(d); }

// ---- 钱包 / 流水 ----
export function getBalance(): number { return read().settings.balance; }
export function getTxns(): TbTxn[] { return read().txns.slice().sort((a, b) => b.ts - a.ts); }
function pushTxn(d: TbData, amount: number, label: string, kind: TbTxn['kind']): void {
  d.settings.balance = Math.max(0, Math.round((d.settings.balance + amount) * 100) / 100);
  d.txns.unshift({ id: rid('tx'), ts: Date.now(), amount, balanceAfter: d.settings.balance, label, kind });
  if (d.txns.length > 200) d.txns = d.txns.slice(0, 200);
}
export function recharge(amount: number): void { const d = read(); pushTxn(d, Math.abs(amount), '充值', 'recharge'); write(d); }

// ---- 订单 ----
export function getOrders(): TbOrder[] { return read().orders.slice().sort((a, b) => b.createdAt - a.createdAt); }
export function getOrder(id: string): TbOrder | undefined { return read().orders.find(o => o.id === id); }
// 结算购物车（指定项或全部）。返回订单或 null（余额不足）。
export function checkout(items: TbCartItem[]): { ok: boolean; order?: TbOrder; reason?: string } {
  const d = read();
  const total = items.reduce((n, i) => n + i.price * i.qty, 0);
  if (total > d.settings.balance) return { ok: false, reason: '余额不足' };
  const a = d.settings.address;
  const order: TbOrder = {
    id: rid('to'),
    items: items.map(i => ({ productId: i.productId, title: i.title, price: i.price, sku: i.sku, qty: i.qty, mainImgDesc: i.mainImgDesc })),
    total, status: 'pending',
    addrSnapshot: a.name ? `${a.name} ${a.phone} ${a.region}${a.detail}` : '默认地址',
    logistics: [{ ts: Date.now(), text: '订单已提交，等待商家发货' }],
    createdAt: Date.now(),
  };
  d.orders.unshift(order);
  pushTxn(d, -total, `下单 ${items.map(i => i.title).join('、').slice(0, 20)}`, 'spend');
  // 从购物车移除已购项
  for (const it of items) d.cart = d.cart.filter(c => !(c.productId === it.productId && c.sku === it.sku));
  write(d);
  return { ok: true, order };
}
export function setOrderStatus(id: string, status: TbOrderStatus): void {
  const d = read(); const o = d.orders.find(x => x.id === id); if (o) { o.status = status; write(d); }
}
export function addLogistics(id: string, text: string): void {
  const d = read(); const o = d.orders.find(x => x.id === id); if (o) { o.logistics.unshift({ ts: Date.now(), text }); write(d); }
}
export function refundOrder(id: string): void {
  const d = read(); const o = d.orders.find(x => x.id === id); if (!o || o.status === 'refunding' || o.status === 'closed') return;
  o.status = 'refunding'; o.logistics.unshift({ ts: Date.now(), text: '退款申请已提交，等待商家处理' }); write(d);
}
export function confirmRefund(id: string): void {
  const d = read(); const o = d.orders.find(x => x.id === id); if (!o) return;
  o.status = 'closed'; pushTxn(d, o.total, `退款 ${o.items.map(i => i.title).join('、').slice(0, 20)}`, 'refund');
  o.logistics.unshift({ ts: Date.now(), text: '退款成功，金额已退回余额' }); write(d);
}
export function markReviewed(id: string): void { const d = read(); const o = d.orders.find(x => x.id === id); if (o) { o.reviewed = true; write(d); } }

// ---- 订单编辑 ----
// 重算订单实付（按当前明细）。退款/已关闭订单不动钱包，仅修正展示金额。
function recalcOrderTotal(o: TbOrder): void { o.total = o.items.reduce((n, i) => n + i.price * i.qty, 0); }
// 改某明细数量（<=0 视为删除该明细）。仅在「待发货」可改，避免与已发货物流矛盾。
export function editOrderItemQty(id: string, productId: string, sku: string, qty: number): void {
  const d = read(); const o = d.orders.find(x => x.id === id); if (!o) return;
  const it = o.items.find(i => i.productId === productId && i.sku === sku); if (!it) return;
  if (qty <= 0) o.items = o.items.filter(i => !(i.productId === productId && i.sku === sku));
  else it.qty = qty;
  recalcOrderTotal(o); write(d);
}
export function removeOrderItem(id: string, productId: string, sku: string): void { editOrderItemQty(id, productId, sku, 0); }
// 改收货地址快照
export function editOrderAddr(id: string, addr: string): void {
  const d = read(); const o = d.orders.find(x => x.id === id); if (o) { o.addrSnapshot = addr; write(d); }
}
// 手动改订单状态（玩家纠正/编辑用）
export function editOrderStatus(id: string, status: TbOrderStatus): void { setOrderStatus(id, status); }
// 编辑某条物流轨迹文字
export function editLogistics(id: string, idx: number, text: string): void {
  const d = read(); const o = d.orders.find(x => x.id === id); if (!o) return;
  if (o.logistics[idx]) { o.logistics[idx].text = text; write(d); }
}
export function deleteLogistics(id: string, idx: number): void {
  const d = read(); const o = d.orders.find(x => x.id === id); if (!o) return;
  if (o.logistics[idx]) { o.logistics.splice(idx, 1); write(d); }
}
// 删除整个订单（不退钱，仅清记录；退款请走 refund 流程）
export function deleteOrder(id: string): void { const d = read(); d.orders = d.orders.filter(o => o.id !== id); write(d); }

// ---- 直播 ----
export function getLiveRooms(): TbLiveRoom[] { return read().live.slice().sort((a, b) => (b.running ? 1 : 0) - (a.running ? 1 : 0)); }
export function getLiveRoom(id: string): TbLiveRoom | undefined { return read().live.find(l => l.id === id); }
export function addLiveRooms(list: Partial<TbLiveRoom>[]): TbLiveRoom[] {
  const d = read(); const added: TbLiveRoom[] = [];
  for (const l of list) {
    const room: TbLiveRoom = { id: l.id || rid('tl'), title: l.title || '直播间', hostName: l.hostName || '主播', hostRef: l.hostRef, coverDesc: l.coverDesc, viewers: l.viewers || '0', productIds: l.productIds || [], running: l.running };
    d.live.unshift(room); added.push(room);
  }
  if (d.live.length > 40) d.live = d.live.slice(0, 40);
  write(d); return added;
}

// 各分区新建分类时的「通用默认提示词」母版——让玩家只绑设定资料就能直接用，
// 不必自己从零写引导。新分类自动套上对应分区的母版（含分区特色 + 占位的分类名），可再改。
export const TB_SECTION_CAT_TEMPLATES: Record<string, (name: string) => string> = {
  clothing: (n) => `【${n}·服装】商品母题：围绕「${n}」这一品类的服装单品。标题套路：风格词+版型+卖点堆叠（淘宝味关键词长标题）。详情维度：面料/材质+版型+尺码表(对应身高体重)+模特试穿数据+搭配建议+洗护说明+卖点标签(包邮/七天无理由/现货)。评价生态：买家秀晒上身、问尺码偏大偏小、面料做工、色差。价位随消费水平浮动。若绑定了服装风格指南设定资料，严格据其风格/版型/材质设定生成款式。`,
  daily: (n) => `【${n}·日用百货】商品母题：围绕「${n}」的日用/百货商品。标题：功能+卖点+适用场景（淘宝味长标题）。详情维度：材质/成分+规格参数+功能卖点+适用人群/场景+使用与保养+套装件数。评价生态：好评晒实物+追评耐用度，中差评有质量/物流/客服问题，别千篇一律。价位随消费水平。绑定设定资料时按其设定生成。`,
  adult: (n) => `【${n}·成人情趣】商品母题：围绕「${n}」的成人向情趣商品（全女性百合世界观，出镜与买家皆女性）。标题：诱惑钩子+场景（露骨直白程度严格跟随**色情度**，含蓄↔直白）。详情维度：款式/材质+尺码/规格+遮蔽度或玩法场景(含蓄电商化)+私密包装+安全提示。买家秀与卖点的肉体/诱惑表现强度跟随**肉欲度**（身材曲线/姿态/氛围）。评价生态：晒诱惑效果(按两滑块调浓度)、问尺码/材质/隐私包装、伴侣反应。绑定设定资料作设定来源。`,
  specialty: (n) => `【${n}·世界观特产】商品母题：本作世界观里与「${n}」相关的特产/资源/奇物，用现实电商语气包装。标题：名称+品阶/稀有度+功效或卖点钩子。详情维度：品阶/产地/材质+功效或用途+适用境界/人群+真伪鉴定或工艺(按设定资料)，附「修士/同好实测」式卖点。有设定资料时据此取材。评价生态结合世界观（真实买家反馈，价位随品阶差异极大）。`,
};
export function defaultCatTemplate(section: string, name: string): string {
  const f = TB_SECTION_CAT_TEMPLATES[section];
  return f ? f(name) : `【${name}】商品母题：围绕「${name}」生成符合淘宝调性的商品（关键词长标题+划线价+卖点标签+详情维度+真实评价生态）。绑定设定资料时按其设定作为款式/设定来源生成。`;
}

// ---- 分类管理 ----
export function getSectionCategories(section: string): { name: string; icon: string }[] {
  const base = TB_CATEGORIES[section] ? TB_CATEGORIES[section].slice() : [];
  const custom = read().settings.customCats.filter(c => c.section === section).map(c => ({ name: c.name, icon: 'fa-tag' }));
  return [...base, ...custom];
}
export function addCustomCat(section: string, name: string): void {
  const d = read(); const nm = name.trim(); if (!nm) return;
  if (d.settings.customCats.some(c => c.section === section && c.name === nm) || (TB_CATEGORIES[section] || []).some(c => c.name === nm)) return;
  d.settings.customCats.push({ section, name: nm });
  // 新分类自动套上分区特色默认提示词（玩家未写时），绑定设定资料即可直接用
  if (!d.settings.catPrompts[nm]) d.settings.catPrompts[nm] = defaultCatTemplate(section, nm);
  write(d);
}
export function deleteCustomCat(section: string, name: string): void {
  const d = read();
  d.settings.customCats = d.settings.customCats.filter(c => !(c.section === section && c.name === name));
  delete d.settings.catPrompts[name];   // 连带清掉它的提示词
  write(d);
}
export function getCatPrompt(name: string): string { return read().settings.catPrompts[name] || ''; }
export function setCatPrompt(name: string, text: string): void {
  const d = read(); if (text.trim()) d.settings.catPrompts[name] = text; else delete d.settings.catPrompts[name]; write(d);
}

// ---- 通知中心（app 内通知，不外推）----
export function getNotices(): TbNotice[] { return read().notices.slice().sort((a, b) => b.ts - a.ts); }
export function unreadNoticeCount(): number { return read().notices.filter(n => !n.read).length; }
export function addNotice(n: Omit<TbNotice, 'id' | 'ts' | 'read'>): TbNotice {
  const d = read(); const notice: TbNotice = { id: rid('ntc'), ts: Date.now(), read: false, ...n };
  d.notices.unshift(notice); if (d.notices.length > 200) d.notices = d.notices.slice(0, 200); write(d); return notice;
}
export function markNoticeRead(id: string): void { const d = read(); const n = d.notices.find(x => x.id === id); if (n) { n.read = true; write(d); } }
export function markAllNoticesRead(): void { const d = read(); d.notices.forEach(n => n.read = true); write(d); }
export function clearNotices(): void { const d = read(); d.notices = []; write(d); }

export function clearAll(): void { write(blank()); }
