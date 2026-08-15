import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

// ==================== 类型 ====================
export type MtDish = { name: string; price: number; desc?: string; imgDesc?: string; cat?: string; hot?: boolean; spicy?: number };
export type MtShop = {
  id: string;
  name: string;
  section: string;          // 分区 id
  cat: string;              // 分类名（如「川菜」「奶茶」）
  rating: number;           // 评分 0~5
  monthSold: string;        // 月售文字（"3000+"）
  deliverFee: number;       // 配送费
  deliverMin: number;       // 起送价
  deliverTime: string;      // 预计送达（"30分钟"）
  distance: string;         // 距离（"1.2km"）
  notice?: string;          // 商家公告
  promo?: string[];         // 优惠标签（满30减5/首单立减/第二份半价）
  coverDesc?: string;       // 门店招牌画面中文描述
  dishes: MtDish[];         // 菜单
  isMine?: boolean;         // 玩家/角色开的店
  ownerRef?: string;        // 关联角色键
  open?: boolean;           // 是否营业（按世界时间）
  adult?: boolean;          // 私密配送（成人向，吃双滑块）
  ts: number;
};
export type MtReview = {
  id: string; shopId: string; author: string; authorRef?: string;
  rating: number; content: string; showImgDesc?: string; reply?: string; isBad?: boolean; ts: number;
};
export type MtCartItem = { shopId: string; dishName: string; price: number; qty: number };
export type MtOrderItem = { dishName: string; price: number; qty: number };
export type MtOrderStatus = 'pending' | 'accepted' | 'cooking' | 'delivering' | 'arrived' | 'done' | 'refunding' | 'closed';
export type MtRider = { name: string; gender?: string; phone?: string; descDesc?: string };  // 骑手（可对话的女性角色）
export type MtOrder = {
  id: string;
  shopId: string; shopName: string;
  items: MtOrderItem[];
  goods: number;            // 商品金额
  packFee: number;          // 打包费
  deliverFee: number;       // 配送费
  discount: number;         // 优惠减免（红包/神券）
  total: number;            // 实付
  status: MtOrderStatus;
  addrSnapshot: string;     // 收货地址快照
  forWhom?: string;         // 投喂对象名（空=给自己）
  forContactRef?: string;   // 投喂对象联系人 id
  rider?: MtRider;          // 接单骑手
  track: { ts: number; text: string }[];   // 配送轨迹
  riderChat?: { who: 'me' | 'rider'; text: string; ts: number }[];  // 与骑手的对话
  createdAt: number;
  reviewed?: boolean;
};
export type MtCoupon = {        // 到店团购券
  id: string; shopId: string; shopName: string; title: string;
  price: number; oldPrice?: number; desc?: string; section: string;
  status: 'unused' | 'used' | 'expired'; boughtAt: number; usedAt?: number;
};
export type MtTxn = { id: string; ts: number; amount: number; balanceAfter: number; label: string; kind: 'spend' | 'recharge' | 'refund' | 'income' };
export type MtAddress = { name: string; phone: string; region: string; detail: string };
export type MtNotice = { id: string; ts: number; kind: 'delivery' | 'service' | 'refund' | 'order' | 'reward' | 'system'; title: string; body: string; orderId?: string; read?: boolean };
// 会员/签到
export type MtMember = { signedDays: number; lastSignTs: number; points: number; lotteryLeft: number };

// ==================== 设置 ====================
export type MtSettings = {
  useFloors: boolean; floorCount: number;
  useWorldbook: boolean; worldbookEntryKeys: string[];
  // 生态浓度
  ecoCity: number;       // 城市烟火气（冷清↔繁华夜经济）
  ecoFlavor: number;     // 口味重口度（清淡养生↔重油重辣新奇特色）
  ecoSpeed: number;      // 配送时效（慢↔极速达）
  ecoActivity: number;   // 商家活跃度（店少↔海量新店促销）
  ecoErotic: number;     // 色情度（私密配送露骨程度）
  ecoCarnal: number;     // 肉欲度（肉体肉欲与诱惑表现程度）
  // 钱包
  balance: number;
  // 记忆 / 同步 / 自动
  memoryEnabled: boolean; syncEnabled: boolean; autoInterval: number; lastFloor: number;
  // 收货地址
  address: MtAddress;
  // 分类管理
  customCats: { section: string; name: string }[];
  catPrompts: Record<string, string>;
};
export const DEFAULT_MT_ADDRESS: MtAddress = { name: '', phone: '', region: '', detail: '' };
export const DEFAULT_MT_SETTINGS: MtSettings = {
  useFloors: true, floorCount: 6,
  useWorldbook: true, worldbookEntryKeys: [],
  ecoCity: 60, ecoFlavor: 50, ecoSpeed: 55, ecoActivity: 55, ecoErotic: 20, ecoCarnal: 30,
  balance: 5200,
  memoryEnabled: true, syncEnabled: false, autoInterval: 0, lastFloor: 0,
  address: { ...DEFAULT_MT_ADDRESS },
  customCats: [], catPrompts: {},
};

// 分区（顶层导航）
export const MT_SECTIONS: { id: string; name: string; icon: string }[] = [
  { id: 'nearby', name: '附近', icon: 'fa-location-dot' },
  { id: 'food', name: '美食', icon: 'fa-bowl-food' },
  { id: 'drink', name: '奶茶甜点', icon: 'fa-mug-hot' },
  { id: 'grocery', name: '食材买菜', icon: 'fa-carrot' },
  { id: 'medicine', name: '买药', icon: 'fa-kit-medical' },
  { id: 'group', name: '到店团购', icon: 'fa-ticket' },
  { id: 'private', name: '私密配送', icon: 'fa-heart' },
];

// 各分区内置分类
export const MT_CATEGORIES: Record<string, { name: string; icon: string }[]> = {
  food: [
    { name: '快餐便当', icon: 'fa-bowl-rice' },
    { name: '川湘菜', icon: 'fa-pepper-hot' },
    { name: '火锅烧烤', icon: 'fa-fire' },
    { name: '日料寿司', icon: 'fa-fish' },
    { name: '面食粉馆', icon: 'fa-bowl-food' },
    { name: '地方小吃', icon: 'fa-drumstick-bite' },
    { name: '轻食沙拉', icon: 'fa-leaf' },
    { name: '夜宵大排档', icon: 'fa-moon' },
    { name: '粤菜港式', icon: 'fa-shrimp' },
    { name: '西北菜', icon: 'fa-drumstick-bite' },
    { name: '韩餐料理', icon: 'fa-bowl-food' },
    { name: '披萨西餐', icon: 'fa-pizza-slice' },
    { name: '世界观风味', icon: 'fa-wand-sparkles' },
  ],
  drink: [
    { name: '奶茶果茶', icon: 'fa-mug-hot' },
    { name: '咖啡', icon: 'fa-mug-saucer' },
    { name: '蛋糕烘焙', icon: 'fa-cake-candles' },
    { name: '冰淇淋甜品', icon: 'fa-ice-cream' },
    { name: '鲜榨饮品', icon: 'fa-wine-bottle' },
    { name: '港式糖水', icon: 'fa-mug-saucer' },
    { name: '手打柠檬茶', icon: 'fa-mug-hot' },
    { name: '养生茶饮', icon: 'fa-mug-hot' },
  ],
  grocery: [
    { name: '蔬菜水果', icon: 'fa-carrot' },
    { name: '肉禽蛋', icon: 'fa-drumstick-bite' },
    { name: '水产海鲜', icon: 'fa-fish' },
    { name: '米面粮油', icon: 'fa-wheat-awn' },
    { name: '日用调料', icon: 'fa-bottle-droplet' },
    { name: '熟食卤味', icon: 'fa-drumstick-bite' },
    { name: '进口零食', icon: 'fa-cookie-bite' },
    { name: '世界观食材', icon: 'fa-seedling' },
  ],
  medicine: [
    { name: '感冒发热', icon: 'fa-temperature-high' },
    { name: '肠胃用药', icon: 'fa-pills' },
    { name: '外用消炎', icon: 'fa-bandage' },
    { name: '保健营养', icon: 'fa-heart-pulse' },
    { name: '计生情趣', icon: 'fa-shield-heart' },
    { name: '妇科私护', icon: 'fa-venus' },
    { name: '医疗器械', icon: 'fa-stethoscope' },
    { name: '世界观丹药', icon: 'fa-flask' },
  ],
  group: [
    { name: '餐饮代金券', icon: 'fa-utensils' },
    { name: 'KTV酒吧', icon: 'fa-microphone' },
    { name: '丽人SPA', icon: 'fa-spa' },
    { name: '密室剧本杀', icon: 'fa-masks-theater' },
    { name: '电影演出', icon: 'fa-film' },
    { name: '足疗按摩', icon: 'fa-hand-sparkles' },
    { name: '健身运动', icon: 'fa-dumbbell' },
    { name: '洗浴汗蒸', icon: 'fa-hot-tub-person' },
    { name: '亲子游乐', icon: 'fa-child-reaching' },
    { name: '美容美发', icon: 'fa-scissors' },
  ],
  private: [
    { name: '上门按摩', icon: 'fa-hand-sparkles' },
    { name: '陪伴服务', icon: 'fa-user-group' },
    { name: '情趣到家', icon: 'fa-heart' },
    { name: '深夜special', icon: 'fa-moon' },
    { name: '贴身女仆', icon: 'fa-broom' },
  ],
};

// __MT_DEFAULT_CAT_PROMPTS__
// 各分类默认引导提示词（高信息密度；设定资料可能只写「世界观有什么吃食」，提示词补「怎么生成外卖商家」）。
// 写法：商家母题 + 招牌菜套路 + 菜单维度(招牌/特色/套餐/小吃饮品) + 评价生态 + 价位/配送口味。
export const MT_DEFAULT_CAT_PROMPTS: Record<string, string> = {
  '快餐便当': '【快餐便当】商家母题：黄焖鸡/盖浇饭/麻辣烫/汉堡炸鸡/轻食简餐等出餐快的连锁或夫妻店。菜单套路：招牌主食+配菜+套餐组合+加料(加饭/加蛋/加肠)+饮品。详情维度：分量(大份/小份)+辣度可选+米饭管够+出餐速度卖点。评价生态：好评夸性价比量大出餐快，中差评有送错漏餐凉了汤洒了。价位随城市烟火气，多为平价。',
  '川湘菜': '【川湘菜】商家母题：水煮鱼/辣子鸡/小炒肉/毛血旺等重口下饭菜。菜单：招牌硬菜+家常小炒+凉菜+米饭+解辣饮品。详情：辣度分级(微辣/中辣/变态辣，吃口味重口度)+分量+下饭程度。评价：好评夸够味够辣下饭，差评嫌油腻太咸或不正宗。',
  '火锅烧烤': '【火锅烧烤】商家母题：火锅食材外送/烤串/烧烤拼盘/小龙虾。菜单：锅底+荤素拼盘+串串+蘸料+酒水饮料。详情：是否送锅/电磁炉、食材新鲜度、份量。重口度高时主打重油重辣大份豪横。评价：好评夸食材新鲜分量足适合聚餐，差评嫌缺斤少两不新鲜。',
  '日料寿司': '【日料寿司】商家母题：寿司拼盘/刺身/丼饭/日式简餐。菜单：刺身/握寿司/卷物/丼饭/小食/清酒饮品。详情：食材新鲜度+摆盘精致度+冷链配送。价位偏中高。评价：好评夸新鲜摆盘好看，差评嫌不新鲜量少价高。',
  '面食粉馆': '【面食粉馆】商家母题：兰州拉面/螺蛳粉/重庆小面/馄饨水饺等地方面食。菜单：招牌面/粉+浇头/加码+小菜+卤味。详情：汤头+辣度+加面加料+地道程度。评价：好评夸地道汤鲜，差评嫌坨了没味。平价为主。',
  '地方小吃': '【地方小吃】商家母题：煎饼/肉夹馍/炸物/卤味/糖水等街头小吃。菜单：招牌小吃+组合套餐+小份拼盘。详情：现做现炸+地方特色+分量。评价：好评夸地道解馋，差评嫌油凉了。',
  '轻食沙拉': '【轻食沙拉】商家母题：低卡沙拉/三明治/健身餐/果蔬汁。菜单：沙拉碗+主食选择(鸡胸/牛肉)+酱料+饮品。详情：热量标注+食材新鲜+健身友好。评价：好评夸新鲜健康有饱腹感，差评嫌寡淡量少贵。',
  '夜宵大排档': '【夜宵大排档】商家母题：深夜烧烤/小龙虾/炒田螺/卤味啤酒。菜单：烧烤拼盘+夜宵硬菜+酒水。详情：深夜营业(按世界时间，深夜才热闹)+烟火气+重口。城市烟火气高时夜经济火爆。评价：好评夸深夜的慰藉够味，差评嫌等太久凉了。',
  '世界观风味': '【世界观风味·特色】商家母题：贴合本作世界观的吃食（仙家斋膳/灵兽肉串/秘境药膳/异域风味等），用现代外卖语气包装。菜单：世界观招牌菜+特色食材+灵酒灵茶。详情：按设定资料命名与描述，附「食客实测」式卖点。有设定资料时据此取材。评价结合世界观（修士/食客真实反馈）。',
  '奶茶果茶': '【奶茶果茶】商家母题：珍珠奶茶/水果茶/奶盖/气泡茶等网红茶饮。菜单：招牌奶茶+季节限定+小料(珍珠/椰果/布丁)+甜度冰量选择。详情：甜度(三分/七分/全糖)+冰量+小料+杯型。评价：好评夸好喝料足，差评嫌甜腻没料洒了。',
  '咖啡': '【咖啡】商家母题：美式/拿铁/特调/手冲。菜单：经典咖啡+创意特调+季节限定+轻食搭配。详情：豆子/奶选择+冰热+糖度。评价：好评夸醇香提神，差评嫌寡淡或太苦。',
  '蛋糕烘焙': '【蛋糕烘焙】商家母题：生日蛋糕/面包/甜点/下午茶。菜单：蛋糕(可订制)+面包+甜点+伴手礼。详情：尺寸+口味+是否需预订+配送保护。评价：好评夸好看好吃新鲜，差评嫌挤压变形不新鲜。',
  '冰淇淋甜品': '【冰淇淋甜品】商家母题：冰淇淋/糖水/钵仔糕/双皮奶等甜品。菜单：招牌甜品+冰品+组合。详情：冷链配送+甜度+分量。评价：好评夸丝滑解暑，差评嫌化了量少。',
  '鲜榨饮品': '【鲜榨饮品】商家母题：鲜榨果汁/养生饮/椰子水。菜单：鲜榨单品+混搭+养生组合。详情：是否加糖加冰+现榨。评价：好评夸新鲜养生，差评嫌兑水寡淡。',
  '蔬菜水果': '【蔬菜水果·买菜】商家母题：社区生鲜店的时令蔬果。菜单：按斤/份的蔬菜水果+净菜搭配。详情：产地+新鲜度+净重+当日达。评价：好评夸新鲜便宜送得快，差评嫌不新鲜缺斤短两。',
  '肉禽蛋': '【肉禽蛋·买菜】商家母题：生鲜猪牛羊禽蛋。菜单：分割肉品+禽类+蛋类+净菜。详情：冷链+新鲜+净重。评价：好评夸新鲜分量足，差评嫌不新鲜。',
  '水产海鲜': '【水产海鲜·买菜】商家母题：活鲜虾蟹贝鱼。菜单：活鲜+冰鲜+加工净菜。详情：活鲜锁氧配送+新鲜度。评价：好评夸活蹦乱跳新鲜，差评嫌死货不新鲜。',
  '米面粮油': '【米面粮油·买菜】商家母题：米面粮油等主食干货。菜单：大米/面粉/食用油/杂粮。详情：规格+品牌+保质期。评价：好评夸正品实惠，差评嫌临期。',
  '日用调料': '【日用调料·买菜】商家母题：厨房调味与日用消耗。菜单：调味料+厨房日用+纸品清洁。详情：规格+品牌。评价：好评夸方便齐全，差评嫌贵漏发。',
  '世界观食材': '【世界观食材·特色】商家母题：本作世界观里的特殊食材（灵米/妖兽肉/灵泉水/药草等），现代买菜语气包装。菜单：世界观食材+品阶+用途。详情：按设定资料描述品阶/产地/功效。评价结合世界观。',
  '感冒发热': '【感冒发热·买药】商家母题：24h药房的感冒退热常用药。菜单：感冒药+退热+止咳+口罩体温计。详情：成分+适用症状+用法用量+OTC标识+用药提示。文案专业克制(健康向)。评价：好评夸送得快应急救命，差评嫌缺货送错。',
  '肠胃用药': '【肠胃用药·买药】商家母题：肠胃不适常用药。菜单：肠胃药+益生菌+解暑。详情：适用症状+用法+提示就医。专业克制。评价：好评夸应急方便，差评嫌没效果。',
  '外用消炎': '【外用消炎·买药】商家母题：外伤消炎与护理。菜单：碘伏/创可贴/消炎药膏/纱布。详情：用途+用法+提示。专业克制。',
  '保健营养': '【保健营养·买药】商家母题：保健品营养补充。菜单：维生素/钙片/护肝/养生。详情：成分+适用人群+非药品提示。',
  '计生情趣': '【计生情趣·买药】商家母题：成人计生与私密健康用品（避孕/私护/情趣周边，电商化含蓄）。菜单：计生用品+私密护理+情趣周边。详情：含蓄专业+私密包装+24h应急配送(深夜可达)。露骨程度严格跟随**色情度**(低则极含蓄健康向)，肉欲度仅影响很轻的氛围。评价：私密好物的含蓄测评+隐私包装+应急及时。全女性世界观。',
  '世界观丹药': '【世界观丹药·特色】商家母题：本作世界观的疗伤/养生丹药，现代买药语气包装。菜单：丹药+灵药+功效钩子。详情：按设定资料描述品阶/功效/服法。评价结合世界观（修士实测）。',
  '餐饮代金券': '【餐饮代金券·到店团购】商家母题：到店餐饮的代金券/套餐券（火锅/烤肉/自助/正餐）。券面：套餐内容(几人份/含什么菜)+原价划线+团购价+有效期+使用规则(避开节假日/需预约)。详情：到店核销、适用门店、套餐明细。评价：好评夸划算菜品足，差评嫌限制多缺斤少两。买券后进「我的券」，到店核销 AI 生成到店体验。',
  'KTV酒吧': '【KTV酒吧·到店团购】商家母题：KTV欢唱套餐/酒吧畅饮券。券面：时段+包厢档次+酒水套餐+欢唱时长。详情：适用时段、是否含酒水、最低消费。评价：好评夸划算嗨，差评嫌限制时段加收费。',
  '丽人SPA': '【丽人SPA·到店团购】商家母题：美容美甲/SPA水疗/美发的丽人套餐券。券面：项目内容+时长+技师档次+原价团购价。详情：适用项目、是否需预约、办卡推销。评价：好评夸手法好环境舒服，差评嫌推销凶。全女性向。私密/暧昧氛围跟随双滑块（仍是正规丽人项目，越界部分归「私密配送」）。',
  '密室剧本杀': '【密室剧本杀·到店团购】商家母题：密室逃脱/剧本杀场次券。券面：主题+人数+时长+难度+恐怖/情感向。详情：适用场次、是否需组队、剧本简介。评价：好评夸沉浸刺激NPC给力，差评嫌剧情拉胯。',
  '电影演出': '【电影演出·到店团购】商家母题：电影票/演出/展览门票。券面：影片/演出+场次+座位档次。详情：适用影院、兑换方式。评价：好评夸方便实惠，差评嫌场次少。',
  '足疗按摩': '【足疗按摩·到店团购】商家母题：正规足疗/推拿/采耳的到店套餐券。券面：项目+时长+技师。详情：适用门店、是否需预约。评价：好评夸解乏手法好，差评嫌环境一般推销。',
  '上门按摩': '【上门按摩·私密配送】商家母题：上门按摩/推拿/SPA（成人向氛围，全女性百合世界观）。卡片：技师昵称+项目+时长+上门费+技师形象描述。露骨直白程度严格跟随**色情度**，肉体诱惑/氛围(身材/姿态/暧昧)跟随**肉欲度**。详情：上门流程+私密+技师形象(吃双滑块)。评价：含蓄到大胆按色情度调，技师服务体验。皆为虚构表演。',
  '陪伴服务': '【陪伴服务·私密配送】商家母题：上门陪伴/陪聊陪玩（成人向暧昧氛围，全女性向）。卡片：陪伴者昵称+服务内容+时长+形象描述。诱惑/肉欲表现跟肉欲度，露骨跟色情度。详情：服务内容(吃双滑块由暧昧到露骨)+上门+形象。评价：体验反馈按双滑块调浓度。皆为虚构。',
  '情趣到家': '【情趣到家·私密配送】商家母题：情趣用品/成人玩具的即时配送（30分钟达，深夜应急）。卡片：商品+私密包装+极速达。露骨跟色情度、诱惑氛围跟肉欲度。详情：私密包装+骑手不知情+深夜可达。评价：应急及时、隐私包装、商品体验(按双滑块)。全女性世界观。',
  '深夜special': '【深夜special·私密配送】商家母题：深夜限定的成人向上门/配送服务（深夜才出现）。卡片：限定服务+深夜钩子+形象/内容描述。露骨跟色情度、肉欲表现跟肉欲度，可拉到上限。详情：深夜限定+私密+上门或配送。评价：按双滑块调浓度。皆为虚构表演，全女性百合向。',
  // —— 新增分类默认提示词 ——
  '粤菜港式': '【粤菜港式】商家母题：茶餐厅/烧腊/煲仔饭/港式点心的粤味外卖。菜单：招牌烧腊双拼+煲仔饭+丝袜奶茶+菠萝油+例汤。详情：镬气/是否现烧/配送保温。评价：好评夸地道够镬气，差评嫌肉柴凉了油腻。',
  '西北菜': '【西北菜】商家母题：面食/牛羊肉/馍馍的西北风味。菜单：招牌拉面/揪面片+手抓羊肉+肉夹馍+胡辣汤。详情：分量足/辣度/面劲道。评价：好评夸量大实在够劲，差评嫌咸腻膻味重。',
  '韩餐料理': '【韩餐料理】商家母题：炸鸡/部队锅/石锅拌饭/烤肉的韩式外卖。菜单：招牌炸鸡+部队锅+拌饭+泡菜小菜+米酒。详情：辣度/份量/配送保温。评价：好评夸够味氛围足，差评嫌贵量少不正宗。',
  '披萨西餐': '【披萨西餐】商家母题：披萨/意面/牛排/汉堡的西式简餐。菜单：招牌披萨(尺寸可选)+意面+牛排+沙拉+饮品。详情：尺寸/几分熟/配送保温。评价：好评夸芝士拉丝分量足，差评嫌凉了坨了贵。',
  '港式糖水': '【港式糖水】商家母题：杨枝甘露/双皮奶/龟苓膏/芒果班戟的糖水铺。菜单：招牌糖水+甜品+组合。详情：冷热/甜度/冷链配送。评价：好评夸丝滑清甜料足，差评嫌化了甜腻量少。',
  '手打柠檬茶': '【手打柠檬茶】商家母题：手打鸭屎香柠檬茶/百香果茶等现打茶饮。菜单：招牌手打柠檬茶+果茶+加料。详情：捶打现做/冰量/加料。评价：好评夸够香够解腻现打新鲜，差评嫌酸涩兑水。',
  '养生茶饮': '【养生茶饮】商家母题：桃胶银耳羹/五红汤/中式养生茶的养生饮品。菜单：招牌养生饮+滋补组合+四季限定。详情：功效钩子(养生话术)/温和克制/温热配送。评价：好评夸温润养人不甜腻，差评嫌寡淡智商税。',
  '熟食卤味': '【熟食卤味·买菜】商家母题：卤味/酱货/凉拌熟食的即食熟食店。菜单：招牌卤味拼盘+酱货+凉菜+可称重。详情：现卤/份量/真空配送。评价：好评夸入味下酒解馋，差评嫌咸柴不新鲜。',
  '进口零食': '【进口零食·买菜】商家母题：进口/网红零食饮料的零食铺。菜单：网红零食+进口饮料+组合装。详情：品牌/保质期/组合优惠。评价：好评夸嘴巴不寂寞种草成功，差评嫌临期贵踩雷。',
  '妇科私护': '【妇科私护·买药】商家母题：女性私密护理与妇科常用健康用品（含蓄专业健康向）。菜单：私护洗液+护理用品+健康检测。详情：成分+适用+私密包装+用药提示。文案专业克制。全女性世界观。评价：好评夸贴心私密送得快，差评嫌缺货。',
  '医疗器械': '【医疗器械·买药】商家母题：体温计/血压计/护理器械等家用医疗器械。菜单：常用器械+护理耗材。详情：品牌/用途/使用说明。专业克制。评价：好评夸应急实用，差评嫌不准贵。',
  '健身运动': '【健身运动·到店团购】商家母题：健身房/瑜伽/普拉提的体验课与私教团购券。券面：课程内容+次数+时长+适用门店。详情：预约/私教推销/环境。评价：好评夸教练专业环境好，差评嫌推销凶器械旧。全女性向。',
  '洗浴汗蒸': '【洗浴汗蒸·到店团购】商家母题：温泉/汗蒸/洗浴中心的到店套餐券。券面：项目+时长+含餐/搓澡+档次。详情：适用时段/是否需预约/环境。评价：好评夸解乏舒服环境好，差评嫌人多推销。正规向，越界归私密配送。',
  '亲子游乐': '【亲子游乐·到店团购】商家母题：儿童乐园/亲子手工/游泳馆的亲子套餐券。券面：项目+适用年龄+人数+时长。详情：适用场次/是否需陪同。评价：好评夸孩子玩疯了值，差评嫌人挤设施旧。清水向。',
  '美容美发': '【美容美发·到店团购】商家母题：美发/美甲/皮肤管理的丽人到店券。券面：项目+时长+技师档次+原价团购价。详情：预约/是否含产品/办卡推销。评价：好评夸手法好出片，差评嫌推销凶效果一般。全女性向。',
  '贴身女仆': '【贴身女仆·私密配送】商家母题：上门家政/贴身陪侍（成人向暧昧氛围，全女性百合世界观，皆为虚构表演）。卡片：女仆昵称+服务内容+时长+形象描述。露骨直白程度严格跟随**色情度**，肉体诱惑与氛围(身材/姿态/暧昧)跟随**肉欲度**，深夜可达。详情：上门流程+私密+形象(吃双滑块)。评价：体验反馈按双滑块调浓度。皆为虚构表演。',
};

// __MT_SECTION_CAT_TEMPLATES__
// 各分区新建分类时的「通用默认提示词」母版——玩家只绑设定资料就能直接用。
export const MT_SECTION_CAT_TEMPLATES: Record<string, (name: string) => string> = {
  food: (n) => `【${n}·美食外卖】商家母题：围绕「${n}」的外卖餐饮商家（连锁/夫妻店/网红店）。菜单套路：招牌菜+特色菜+套餐组合+小吃+饮品，价位随城市烟火气与口味重口度。详情维度：分量+辣度/口味可选+出餐速度+配送费起送价+优惠标签(满减/首单立减/第二份半价)。评价生态：好评夸味道分量性价比，中差评有送错漏餐凉了不新鲜，别千篇一律。**绑定设定资料时按其设定生成吃食**。`,
  drink: (n) => `【${n}·饮品甜点】商家母题：围绕「${n}」的茶饮/甜品商家。菜单：招牌单品+季节限定+小料/口味/甜度冰量选择+组合套餐。详情：甜度冰量小料选项+杯型+保温配送。评价：好评夸好喝料足好看，差评嫌甜腻没料化了洒了。价位随烟火气。`,
  grocery: (n) => `【${n}·买菜生鲜】商家母题：社区生鲜店围绕「${n}」的生鲜食材。菜单：按斤/份的食材+净菜搭配。详情：产地+新鲜度+净重+当日/极速达。评价：好评夸新鲜便宜送得快，差评嫌不新鲜缺斤短两。绑定设定资料时按设定生成特色食材。`,
  medicine: (n) => `【${n}·买药】商家母题：24h药房围绕「${n}」的药品/健康用品。菜单：对应症状的常用药+健康用品。详情：成分+适用症状+用法用量+OTC标识+用药提示，文案专业克制(健康向)+应急配送。评价：好评夸送得快应急，差评嫌缺货送错。`,
  group: (n) => `【${n}·到店团购】商家母题：围绕「${n}」的到店消费团购券/套餐券。券面：套餐内容+原价划线+团购价+有效期+使用规则(预约/避高峰)。详情：到店核销、适用门店、套餐明细。评价：好评夸划算，差评嫌限制多。买券进「我的券」，到店核销时 AI 生成到店体验。`,
  private: (n) => `【${n}·私密配送】商家母题：围绕「${n}」的成人向上门/配送服务（全女性百合世界观，皆为虚构表演）。卡片：服务者昵称/商品+服务内容+时长/规格+形象描述。露骨直白程度严格跟随**色情度**，肉体诱惑与氛围(身材/姿态/暧昧)跟随**肉欲度**，深夜可达。详情：上门或极速配送+私密+形象(吃双滑块)。评价：体验反馈按双滑块调浓度。绑设定资料作设定来源。`,
};
export function defaultMtCatTemplate(section: string, name: string): string {
  const f = MT_SECTION_CAT_TEMPLATES[section];
  return f ? f(name) : `【${name}】商家母题：围绕「${name}」生成符合美团调性的本地生活商家（招牌+菜单/套餐+优惠标签+配送信息+真实评价生态）。绑定设定资料时按其设定作为来源生成。`;
}

// __MT_DATA_LAYER__
// ==================== 数据存取 ====================
type MtData = {
  shops: MtShop[];
  reviews: MtReview[];
  cart: MtCartItem[];
  orders: MtOrder[];
  coupons: MtCoupon[];
  txns: MtTxn[];
  notices: MtNotice[];
  member: MtMember;
  settings: MtSettings;
};
function rid(p: string): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }
function blank(): MtData {
  return { shops: [], reviews: [], cart: [], orders: [], coupons: [], txns: [], notices: [], member: { signedDays: 0, lastSignTs: 0, points: 0, lotteryLeft: 1 }, settings: { ...DEFAULT_MT_SETTINGS } };
}
function read(): MtData {
  const d = readWorldJson<MtData>(WORLD_LS_KEYS.meituan, blank());
  if (!d || typeof d !== 'object') return blank();
  d.shops ||= []; d.reviews ||= []; d.cart ||= []; d.orders ||= []; d.coupons ||= []; d.txns ||= []; d.notices ||= [];
  d.member = { ...{ signedDays: 0, lastSignTs: 0, points: 0, lotteryLeft: 1 }, ...(d.member || {}) };
  d.settings = { ...DEFAULT_MT_SETTINGS, ...(d.settings || {}) };
  d.settings.address = { ...DEFAULT_MT_ADDRESS, ...(d.settings.address || {}) };
  d.settings.catPrompts = { ...MT_DEFAULT_CAT_PROMPTS, ...(d.settings.catPrompts || {}) };
  return d;
}
function write(d: MtData): void { writeWorldJson(WORLD_LS_KEYS.meituan, d); }

// ---- 设置 ----
export function getMtSettings(): MtSettings { return read().settings; }
export function updateMtSettings(patch: Partial<MtSettings>): MtSettings { const d = read(); d.settings = { ...d.settings, ...patch }; write(d); return d.settings; }

// ---- 商家 ----
export function getShops(section?: string, cat?: string): MtShop[] {
  let list = read().shops.slice().sort((a, b) => b.ts - a.ts);
  if (section && section !== 'nearby') list = list.filter(s => s.section === section);
  if (cat) list = list.filter(s => s.cat === cat);
  return list;
}
export function getShop(id: string): MtShop | undefined { return read().shops.find(s => s.id === id); }
export function searchShops(q: string): MtShop[] {
  const k = q.trim().toLowerCase(); if (!k) return [];
  return read().shops.filter(s => s.name.toLowerCase().includes(k) || s.cat.toLowerCase().includes(k) || s.dishes.some(d => d.name.toLowerCase().includes(k)));
}
export function addShops(list: Partial<MtShop>[], section: string, cat: string): MtShop[] {
  const d = read(); const added: MtShop[] = [];
  for (const s of list) {
    const shop: MtShop = {
      id: s.id || rid('ms'), name: s.name || '商家', section: s.section || section, cat: s.cat || cat,
      rating: typeof s.rating === 'number' ? s.rating : 4.7, monthSold: s.monthSold || '0',
      deliverFee: typeof s.deliverFee === 'number' ? s.deliverFee : 3, deliverMin: typeof s.deliverMin === 'number' ? s.deliverMin : 20,
      deliverTime: s.deliverTime || '30分钟', distance: s.distance || '1.5km', notice: s.notice,
      promo: Array.isArray(s.promo) ? s.promo : [], coverDesc: s.coverDesc,
      dishes: Array.isArray(s.dishes) && s.dishes.length ? s.dishes.map(normDish) : [],
      isMine: s.isMine, ownerRef: s.ownerRef, open: s.open ?? true, adult: s.adult ?? (section === 'private'), ts: Date.now(),
    };
    d.shops.unshift(shop); added.push(shop);
  }
  if (d.shops.length > 200) d.shops = d.shops.slice(0, 200);
  write(d); return added;
}
function normDish(x: Partial<MtDish>): MtDish {
  return { name: x.name || '菜品', price: typeof x.price === 'number' ? x.price : 20, desc: x.desc, imgDesc: x.imgDesc, cat: x.cat, hot: x.hot, spicy: x.spicy };
}
export function updateShop(id: string, patch: Partial<MtShop>): void { const d = read(); const s = d.shops.find(x => x.id === id); if (s) { Object.assign(s, patch); write(d); } }

// ---- 评价 ----
export function getReviews(shopId: string): MtReview[] { return read().reviews.filter(r => r.shopId === shopId).sort((a, b) => b.ts - a.ts); }
export function addReviews(shopId: string, list: Partial<MtReview>[]): MtReview[] {
  const d = read(); const added: MtReview[] = [];
  for (const r of list) {
    const rv: MtReview = { id: r.id || rid('mr'), shopId, author: r.author || '匿名食客', authorRef: r.authorRef, rating: typeof r.rating === 'number' ? r.rating : 5, content: r.content || '', showImgDesc: r.showImgDesc, reply: r.reply, isBad: r.isBad ?? ((r.rating ?? 5) <= 2), ts: Date.now() - Math.floor(Math.random() * 86400000 * 20) };
    d.reviews.push(rv); added.push(rv);
  }
  write(d); return added;
}

// ---- 购物车（单商家）----
export function getCart(): MtCartItem[] { return read().cart; }
export function cartShopId(): string | null { const c = read().cart; return c.length ? c[0].shopId : null; }
export function addToCart(shopId: string, dish: MtDish, qty = 1): { ok: boolean; reason?: string } {
  const d = read();
  if (d.cart.length && d.cart[0].shopId !== shopId) return { ok: false, reason: '购物车里已有其他商家的商品，请先清空' };
  const ex = d.cart.find(c => c.shopId === shopId && c.dishName === dish.name);
  if (ex) ex.qty += qty; else d.cart.push({ shopId, dishName: dish.name, price: dish.price, qty });
  write(d); return { ok: true };
}
export function setCartQty(shopId: string, dishName: string, qty: number): void {
  const d = read(); const c = d.cart.find(x => x.shopId === shopId && x.dishName === dishName); if (!c) return;
  if (qty <= 0) d.cart = d.cart.filter(x => !(x.shopId === shopId && x.dishName === dishName)); else c.qty = qty;
  write(d);
}
export function clearCart(): void { const d = read(); d.cart = []; write(d); }
export function cartTotal(): number { return read().cart.reduce((n, i) => n + i.price * i.qty, 0); }

// __MT_DATA_LAYER_2__
// ---- 钱包 / 流水 ----
export function getBalance(): number { return read().settings.balance; }
export function getTxns(): MtTxn[] { return read().txns.slice().sort((a, b) => b.ts - a.ts); }
function pushTxn(d: MtData, amount: number, label: string, kind: MtTxn['kind']): void {
  d.settings.balance = Math.max(0, Math.round((d.settings.balance + amount) * 100) / 100);
  d.txns.unshift({ id: rid('mtx'), ts: Date.now(), amount, balanceAfter: d.settings.balance, label, kind });
  if (d.txns.length > 200) d.txns = d.txns.slice(0, 200);
}
export function recharge(amount: number): void { const d = read(); pushTxn(d, Math.abs(amount), '充值', 'recharge'); write(d); }

// ---- 订单（外卖）----
export function getOrders(): MtOrder[] { return read().orders.slice().sort((a, b) => b.createdAt - a.createdAt); }
export function getOrder(id: string): MtOrder | undefined { return read().orders.find(o => o.id === id); }
// 下单：items 来自购物车快照；discount 为红包/神券减免；forWhom/forContactRef 用于投喂。
export function placeOrder(opts: {
  shopId: string; shopName: string; items: MtOrderItem[]; packFee: number; deliverFee: number; discount: number;
  forWhom?: string; forContactRef?: string; addr?: string;
}): { ok: boolean; order?: MtOrder; reason?: string } {
  const d = read();
  const goods = opts.items.reduce((n, i) => n + i.price * i.qty, 0);
  const total = Math.max(0, Math.round((goods + opts.packFee + opts.deliverFee - opts.discount) * 100) / 100);
  if (total > d.settings.balance) return { ok: false, reason: '余额不足，请先充值' };
  const a = d.settings.address;
  const order: MtOrder = {
    id: rid('mo'), shopId: opts.shopId, shopName: opts.shopName, items: opts.items.slice(),
    goods, packFee: opts.packFee, deliverFee: opts.deliverFee, discount: opts.discount, total, status: 'pending',
    addrSnapshot: opts.addr || (a.name ? `${a.name} ${a.phone} ${a.region}${a.detail}` : '默认地址'),
    forWhom: opts.forWhom, forContactRef: opts.forContactRef,
    track: [{ ts: Date.now(), text: '订单已提交，等待商家接单' }],
    createdAt: Date.now(),
  };
  d.orders.unshift(order);
  pushTxn(d, -total, `${opts.forWhom ? '投喂' + opts.forWhom + '·' : ''}${opts.shopName}`, 'spend');
  d.cart = d.cart.filter(c => c.shopId !== opts.shopId);
  write(d); return { ok: true, order };
}
export function setOrderStatus(id: string, status: MtOrderStatus): void { const d = read(); const o = d.orders.find(x => x.id === id); if (o) { o.status = status; write(d); } }
export function setOrderRider(id: string, rider: MtRider): void { const d = read(); const o = d.orders.find(x => x.id === id); if (o) { o.rider = rider; write(d); } }
export function addTrack(id: string, text: string): void { const d = read(); const o = d.orders.find(x => x.id === id); if (o) { o.track.unshift({ ts: Date.now(), text }); write(d); } }
export function addRiderChat(id: string, who: 'me' | 'rider', text: string): void {
  const d = read(); const o = d.orders.find(x => x.id === id); if (!o) return;
  (o.riderChat ||= []).push({ who, text, ts: Date.now() }); write(d);
}
export function refundOrder(id: string): void {
  const d = read(); const o = d.orders.find(x => x.id === id); if (!o || o.status === 'refunding' || o.status === 'closed') return;
  o.status = 'refunding'; o.track.unshift({ ts: Date.now(), text: '退款申请已提交，等待商家处理' }); write(d);
}
export function confirmRefund(id: string): void {
  const d = read(); const o = d.orders.find(x => x.id === id); if (!o) return;
  o.status = 'closed'; pushTxn(d, o.total, `退款 ${o.shopName}`, 'refund'); o.track.unshift({ ts: Date.now(), text: '退款成功，金额已退回余额' }); write(d);
}
export function markReviewed(id: string): void { const d = read(); const o = d.orders.find(x => x.id === id); if (o) { o.reviewed = true; write(d); } }

// ---- 订单编辑 ----
function recalcTotal(o: MtOrder): void { o.goods = o.items.reduce((n, i) => n + i.price * i.qty, 0); o.total = Math.max(0, Math.round((o.goods + o.packFee + o.deliverFee - o.discount) * 100) / 100); }
export function editOrderItemQty(id: string, dishName: string, qty: number): void {
  const d = read(); const o = d.orders.find(x => x.id === id); if (!o) return;
  const it = o.items.find(i => i.dishName === dishName); if (!it) return;
  if (qty <= 0) o.items = o.items.filter(i => i.dishName !== dishName); else it.qty = qty;
  recalcTotal(o); write(d);
}
export function editOrderAddr(id: string, addr: string): void { const d = read(); const o = d.orders.find(x => x.id === id); if (o) { o.addrSnapshot = addr; write(d); } }
export function editOrderStatus(id: string, status: MtOrderStatus): void { setOrderStatus(id, status); }
export function editTrack(id: string, idx: number, text: string): void { const d = read(); const o = d.orders.find(x => x.id === id); if (o && o.track[idx]) { o.track[idx].text = text; write(d); } }
export function deleteTrack(id: string, idx: number): void { const d = read(); const o = d.orders.find(x => x.id === id); if (o && o.track[idx]) { o.track.splice(idx, 1); write(d); } }
export function deleteOrder(id: string): void { const d = read(); d.orders = d.orders.filter(o => o.id !== id); write(d); }

// ---- 团购券 ----
export function getCoupons(): MtCoupon[] { return read().coupons.slice().sort((a, b) => b.boughtAt - a.boughtAt); }
export function buyCoupon(c: Omit<MtCoupon, 'id' | 'status' | 'boughtAt'>): { ok: boolean; coupon?: MtCoupon; reason?: string } {
  const d = read();
  if (c.price > d.settings.balance) return { ok: false, reason: '余额不足' };
  const coupon: MtCoupon = { id: rid('mc'), status: 'unused', boughtAt: Date.now(), ...c };
  d.coupons.unshift(coupon); pushTxn(d, -c.price, `团购 ${c.title}`, 'spend'); write(d); return { ok: true, coupon };
}
export function useCoupon(id: string): void { const d = read(); const c = d.coupons.find(x => x.id === id); if (c && c.status === 'unused') { c.status = 'used'; c.usedAt = Date.now(); write(d); } }

// __MT_DATA_LAYER_3__
// ---- 会员 / 签到 / 抽奖（霸王餐）----
export function getMember(): MtMember { return read().member; }
// 每日签到（同一天只算一次）。返回本次获得积分（0=今日已签）。
export function signIn(): number {
  const d = read(); const now = Date.now();
  const sameDay = (a: number, b: number) => { const da = new Date(a), db = new Date(b); return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate(); };
  if (d.member.lastSignTs && sameDay(d.member.lastSignTs, now)) return 0;
  const continuous = d.member.lastSignTs && (now - d.member.lastSignTs) < 86400000 * 2;
  d.member.signedDays = continuous ? d.member.signedDays + 1 : 1;
  const gain = 10 + Math.min(d.member.signedDays, 7) * 2;   // 连签加成
  d.member.points += gain; d.member.lastSignTs = now;
  d.member.lotteryLeft = (d.member.lotteryLeft || 0) + 1;   // 签到送一次抽奖
  write(d); return gain;
}
export function spendPoints(n: number): boolean { const d = read(); if (d.member.points < n) return false; d.member.points -= n; write(d); return true; }
export function consumeLottery(): boolean { const d = read(); if ((d.member.lotteryLeft || 0) <= 0) return false; d.member.lotteryLeft -= 1; write(d); return true; }
export function addMemberPoints(n: number): void { const d = read(); d.member.points += n; write(d); }

// ---- 通知中心（app 内，不外推；投喂推微信另走 wechat.pushExternalContact）----
export function getNotices(): MtNotice[] { return read().notices.slice().sort((a, b) => b.ts - a.ts); }
export function unreadNoticeCount(): number { return read().notices.filter(n => !n.read).length; }
export function addNotice(n: Omit<MtNotice, 'id' | 'ts' | 'read'>): MtNotice {
  const d = read(); const notice: MtNotice = { id: rid('mn'), ts: Date.now(), read: false, ...n };
  d.notices.unshift(notice); if (d.notices.length > 200) d.notices = d.notices.slice(0, 200); write(d); return notice;
}
export function markNoticeRead(id: string): void { const d = read(); const n = d.notices.find(x => x.id === id); if (n) { n.read = true; write(d); } }
export function markAllNoticesRead(): void { const d = read(); d.notices.forEach(n => n.read = true); write(d); }
export function clearNotices(): void { const d = read(); d.notices = []; write(d); }

// ---- 分类管理 ----
export function getSectionCategories(section: string): { name: string; icon: string }[] {
  const base = MT_CATEGORIES[section] ? MT_CATEGORIES[section].slice() : [];
  const custom = read().settings.customCats.filter(c => c.section === section).map(c => ({ name: c.name, icon: 'fa-tag' }));
  return [...base, ...custom];
}
export function addCustomCat(section: string, name: string): void {
  const d = read(); const nm = name.trim(); if (!nm) return;
  if (d.settings.customCats.some(c => c.section === section && c.name === nm) || (MT_CATEGORIES[section] || []).some(c => c.name === nm)) return;
  d.settings.customCats.push({ section, name: nm });
  if (!d.settings.catPrompts[nm]) d.settings.catPrompts[nm] = defaultMtCatTemplate(section, nm);
  write(d);
}
export function deleteCustomCat(section: string, name: string): void {
  const d = read();
  d.settings.customCats = d.settings.customCats.filter(c => !(c.section === section && c.name === name));
  delete d.settings.catPrompts[name];
  write(d);
}
export function getCatPrompt(name: string): string { return read().settings.catPrompts[name] || ''; }
export function setCatPrompt(name: string, text: string): void { const d = read(); if (text.trim()) d.settings.catPrompts[name] = text; else delete d.settings.catPrompts[name]; write(d); }

export function clearAll(): void { write(blank()); }





