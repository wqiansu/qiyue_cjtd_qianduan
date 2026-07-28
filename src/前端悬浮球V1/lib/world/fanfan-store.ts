// 饭饭（fanfan）数据层（fanfan-store.ts）
// 仙宫版「大众点评」：探店种草 + 排队打卡 + 榜单口碑 的本地生活社区。与美团(交易)错开——
//   饭饭 = 去哪吃/好不好吃/别人怎么评（决策 + 内容 + 口碑生态），详情「去美团下单」互链，交易闭环交美团。
// 四 tab：附近好店 / 口碑榜单 / 探店笔记(社区) / 我的。全女性百合世界观，设定读绑定世界书。
// 数据纯本地 _th_world_fanfan_v1。
// 功能字段：食客成长(level/exp/badges/tasteTags)、口碑生态(kind/certified/reply/toxic/queue/heatTrend)、
//   社交联动(buddies/quests)、仙宫餐饮世界观(wbKey/season/hiddenMenu)。
import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

// ==================== 类型 ====================
export type FanDish = { name: string; price: number; signature?: boolean; spicy?: number; imgDesc?: string; hidden?: boolean };
export type FanShop = {
  id: string;
  name: string;
  cat: string;              // 品类（如「仙膳」「甜点」）
  district: string;         // 商圈/地段
  perCap: number;           // 人均 ¥
  rating: number;           // ⭐ 总评 0~5
  env: number; taste: number; service: number;   // 三维评分 0~5（环境/口味/服务）
  hot?: boolean;            // 爆店
  heatTrend?: '升' | '降' | '稳';   // 热度趋势（排队热力）
  queue?: number;           // 排队桌数（排队热力）
  blurb?: string;           // 一句话招牌评价
  coverDesc?: string;       // 门店封面画面中文描述
  dishes: FanDish[];        // 招牌菜单
  wbKey?: string;           // 绑定世界书地点条目（店即地点）
  season?: boolean;         // 节令限定店（接世界态 season）
  hiddenMenu?: string;      // 熟客暗号解锁的隐藏菜（可含双修向，受生态阀调控）
  collected?: boolean;      // 我收藏
  wantTo?: boolean;         // 想吃
  checkedIn?: boolean;      // 已打卡
  isAi?: boolean;           // AI 铺的店
  ownerRef?: string;        // 关联角色（角色开的店）
  ts: number;
};
export type FanReview = {
  id: string; shopId: string; author: string; authorRef?: string;
  rating: number; env?: number; taste?: number; service?: number;
  content: string; imgDesc?: string; likes: number;
  kind: 'short' | 'long';   // 短评/长测双形态
  certified?: boolean;      // 探店达人认证（加权）
  reply?: string;           // 店家回评
  toxic?: boolean;          // 负面/挂店（受 ecoToxic 调控）
  isAi?: boolean; ts: number;
};
export type FanNote = {     // 探店笔记（社区 feed，对标小红书但聚焦吃）
  id: string; author: string; authorRef?: string;
  title: string; content: string; coverDesc?: string;
  shopId?: string; shopName?: string;
  rating?: number; likes: number; collects: number;
  tags?: string[];          // 种草标签
  isAi?: boolean; ts: number;
};
export type FanRankEntry = { shopId: string; shopName: string; reason: string };
export type FanRank = {      // 榜单（必吃/新店/人气）
  id: string; kind: string; title: string; entries: FanRankEntry[]; note?: string; ts: number;
};
export type FanCheckin = { shopId: string; shopName: string; ts: number; note?: string };
export type FanBuddy = { id: string; name: string; ref?: string; taste?: string; pitch?: string; ts: number };  // 饭搭子
export type FanQuest = {     // 霸王餐试吃任务
  id: string; shopId?: string; shopName: string; task: string; reward: string;
  status: 'open' | 'doing' | 'done'; ts: number;
};
export type FanUser = {
  collects: string[];        // 收藏 shopId
  wantList: string[];        // 想吃 shopId
  checkins: FanCheckin[];    // 打卡足迹
  // 食客成长线
  level: number; exp: number; badges: string[]; tasteTags: string[];
  // 社交
  buddies: FanBuddy[]; quests: FanQuest[];
};

// ==================== 设置（对齐全 app 横切）====================
export type FanSettings = {
  useFloors: boolean; floorCount: number;
  useWorldbook: boolean; worldbookEntryKeys: string[];
  // 生态浓度（0-200 五档，读设置不写死）
  ecoActivity: number;   // 开店/发笔记热闹度
  ecoTaste: number;      // 好评水平（真实黑红——低=水军满分，高=真实有踩雷）
  ecoHype: number;       // 网红店/排队炒作度
  ecoToxic: number;      // 黑红/挂店烈度（对齐论坛网暴阀，默认低）
  ecoErotic: number;     // 色情度（隐藏菜/私密向露骨程度）
  ecoCarnal: number;     // 肉欲度（肉体诱惑表现程度）
  // 联动
  buddyPushWechat: boolean;   // 找饭搭子转微信约局（默认开）
  // 记忆 / 同步 / 自动
  memoryEnabled: boolean; syncEnabled: boolean; autoInterval: number; lastFloor?: number;   // 每 N 楼自动铺一批，lastFloor 记上次触发楼层
  // 外观
  theme: string; font: string;
  // 分类管理
  customCats: { name: string }[];
  catPrompts: Record<string, string>;
};
export const DEFAULT_FAN_SETTINGS: FanSettings = {
  useFloors: true, floorCount: 6,
  useWorldbook: true, worldbookEntryKeys: [],
  ecoActivity: 60, ecoTaste: 55, ecoHype: 50, ecoToxic: 25, ecoErotic: 20, ecoCarnal: 30,
  buddyPushWechat: true,
  memoryEnabled: true, syncEnabled: false, autoInterval: 0, lastFloor: 0,
  theme: 'tomato', font: 'system',
  customCats: [], catPrompts: {},
};

// 品类（左轨快筛 + 生成分布，可绑设定资料）
export const FAN_CATS: { name: string; icon: string }[] = [
  { name: '仙膳正餐', icon: 'fa-bowl-rice' },
  { name: '灵茶甜点', icon: 'fa-mug-saucer' },
  { name: '斗酒小馆', icon: 'fa-wine-bottle' },
  { name: '异域风味', icon: 'fa-pepper-hot' },
  { name: '深夜食堂', icon: 'fa-moon' },
  { name: '药膳滋补', icon: 'fa-mortar-pestle' },
  { name: '街头小吃', icon: 'fa-drumstick-bite' },
  // —— 更多品类 ——
  { name: '灵鲜火锅', icon: 'fa-fire-burner' },
  { name: '炙味烧烤', icon: 'fa-drumstick-bite' },
  { name: '汤面粉铺', icon: 'fa-bowl-food' },
  { name: '江河海鲜', icon: 'fa-fish' },
  { name: '素斋轻食', icon: 'fa-seedling' },
  { name: '烘焙西点', icon: 'fa-cake-candles' },
  { name: '咖啡馆', icon: 'fa-mug-hot' },
  { name: '早茶点心', icon: 'fa-shrimp' },
  { name: '私房菜', icon: 'fa-utensils' },
  { name: '自助盛宴', icon: 'fa-plate-wheat' },
  { name: '双修膳房', icon: 'fa-heart' },   // 成人向，吃双滑块
];

// 榜单类型
export const FAN_RANK_KINDS: { id: string; title: string; icon: string }[] = [
  { id: 'must', title: '必吃榜', icon: 'fa-trophy' },
  { id: 'new', title: '新店榜', icon: 'fa-seedling' },
  { id: 'hot', title: '人气榜', icon: 'fa-fire' },
];

// PLACEHOLDER_CAT_PROMPTS
// 各品类默认引导提示词（高信息密度；设定资料写「有什么吃食」，本引导包装成「怎么生成一家可探的店」）。
export const FAN_DEFAULT_CAT_PROMPTS: Record<string, string> = {
  '仙膳正餐': '【仙膳正餐】店家母题：正经吃饭的地方——把当地招牌食材做成日常正餐的家常馆子。招牌菜：招牌煲/小炒/时鲜蔬/一锅出的家常硬菜，标出招牌与辣度。人均中档。口碑生态：好评夸镬气足有妈妈味；踩雷吐槽等位久/服务慢/某道菜翻车。有吃食设定资料时按其命名描述。',
  '灵茶甜点': '【灵茶甜点】店家母题：网红茶饮甜品店——奶盖果茶/双皮奶/和菓子/节令同款松饼。招牌：季节限定+颜值单品+小料自选。人均偏低。口碑：好评夸好喝好看出片，踩雷嫌甜腻踩雷智商税。适合出探店笔记种草。',
  '斗酒小馆': '【斗酒小馆】店家母题：小酒馆——特调/花酒/微醺套餐，配下酒小食。招牌：招牌特调+度数标注+微醺氛围。口碑：好评夸氛围绝、调酒师手法好、适合姐妹小酌，踩雷嫌兑水贵吵。夜里更热闹。',
  '异域风味': '【异域风味】店家母题：远方传进来的异域菜——重辣重香/猎奇食材/异国香料，反差新奇。招牌：特色硬菜+辣度分级+猎奇招牌。口碑：好评夸够味开眼界，踩雷嫌不正宗踩雷太怪。',
  '深夜食堂': '【深夜食堂】店家母题：深夜才亮灯的小馆——烧烤/关东煮/热汤面/夜宵拼盘，抚慰emo与加班。深夜才热闹。招牌：深夜限定+暖心一碗+老板娘人情味。口碑：好评夸深夜的慰藉治愈，踩雷嫌等太久凉了。适合承接情绪向探店笔记。',
  '药膳滋补': '【药膳滋补】店家母题：药膳养生馆——炖盅/滋补汤/古方甜品，把滋补设定做成能吃的养生餐。招牌：滋补招牌+功效钩子(养生话术)+温和克制。口碑：好评夸温补有效不苦口，踩雷嫌智商税一股药味。有滋补设定资料时据此取材。',
  '街头小吃': '【街头小吃】店家母题：街边摊与苍蝇小馆——煎饼/炸串/糖水/卤味，接地气烟火气。招牌：地道小吃+现做现炸+分量足。人均最低。口碑：好评夸地道解馋便宜大碗，踩雷嫌油凉了不卫生（黑红瓜可从这里长）。',
  '灵鲜火锅': '【灵鲜火锅】店家母题：火锅店——鸳鸯锅/清汤/麻辣，招牌锅底+新鲜涮品+自助小料台。招牌：招牌锅底+现切鲜货拼盘+秘制蘸料。人均中偏高、适合聚餐。口碑：好评夸锅底鲜辣、涮品新鲜、气氛热闹；踩雷嫌等位久、小料收费、味精重。',
  '炙味烧烤': '【炙味烧烤】店家母题：烧烤摊/铁板烤肉店——炭火撸串/烤肉/生蚝，烟火气与深夜续摊气质。招牌：招牌串+镇店大菜+冰啤配套。口碑：好评夸炭火香、分量足、越喝越上头；踩雷嫌烟大油腻、上菜慢。',
  '汤面粉铺': '【汤面粉铺】店家母题：一碗面/一碗粉的快食小铺——汤头熬得足、浇头讲究，主打快与暖。招牌：招牌面/粉+浇头+加料自选。人均低。口碑：好评夸汤鲜面劲道一个人也能安心吃，踩雷嫌分量少涨价。',
  '江河海鲜': '【江河海鲜】店家母题：河鲜海味馆——现捞现做/清蒸白灼，主打一个「鲜」。招牌：时令海河鲜+做法可选+称重明码。人均偏高。口碑：好评夸食材鲜活火候到位，踩雷嫌宰客缺斤两、不新鲜。',
  '素斋轻食': '【素斋轻食】店家母题：素食馆/轻食沙拉店——净素斋菜/低卡轻食/健身餐，清爽无负担。招牌：招牌素菜/沙拉碗+热量标注+自选搭配。口碑：好评夸清爽健康有心思，踩雷嫌吃不饱寡淡贵。',
  '烘焙西点': '【烘焙西点】店家母题：面包房/西点烘焙店——现烤欧包/蛋糕/挞派，香气与颜值双杀。招牌：现烤招牌+季节限定+镇店蛋糕。口碑：好评夸新鲜好吃出片，踩雷嫌甜腻贵、款式少。适合出探店笔记。',
  '咖啡馆': '【咖啡馆】店家母题：精品咖啡馆/氛围小馆——手冲/意式/创意特调，配简餐甜点与好座位。招牌：招牌豆/创意咖啡+氛围环境+插座WiFi。口碑：好评夸出品稳氛围好适合坐一下午，踩雷嫌贵、座位挤、服务冷。',
  '早茶点心': '【早茶点心】店家母题：早茶茶楼/点心铺——虾饺/烧卖/肠粉/一盅两件，慢悠悠的晨间仪式。招牌：招牌点心+一盅茶+推车现点。口碑：好评夸地道现蒸皮薄馅足，踩雷嫌等位久、翻台催。',
  '私房菜': '【私房菜】店家母题：预约制私房菜/家宴——主厨拿手、限量供应、需提前订，主打私密与用心。招牌：主厨招牌+当日限定+定制菜单。人均偏高。口碑：好评夸有主人待客的用心、菜有惊喜，踩雷嫌贵、需等、量少。',
  '自助盛宴': '【自助盛宴】店家母题：自助餐厅——海鲜/烤肉/甜品无限畅吃，主打丰盛与回本快感。招牌：招牌自助档口+现做区+甜品塔。人均中高。口碑：好评夸种类多划算吃到扶墙，踩雷嫌品质一般、抢位、浪费收费。',
  '双修膳房': '【双修膳房·成人向】店家母题：带情趣/双修意味的私密膳房——主题餐/包厢暧昧局，皆为虚构表演。招牌：主题套餐+氛围描述+熟客暗号隐藏菜。露骨直白程度严格跟随**色情度**(低则极含蓄只暧昧氛围)，肉体诱惑与氛围(身材/姿态/贴贴)跟随**肉欲度**。隐藏菜/包厢局跟双滑块由暧昧到大胆。全女性百合、皆为虚构表演。有设定资料时据此取材。',
};
export function defaultFanCatTemplate(name: string): string {
  return FAN_DEFAULT_CAT_PROMPTS[name] || `【${name}】店家母题：围绕「${name}」生成符合本地探店点评调性的店（招牌菜+人均+商圈+一句话招牌评+真实口碑生态：真香/踩雷/阴阳混杂）。有吃食/地点设定资料时据此取材。`;
}

// __FAN_DATA_LAYER__
// ==================== 数据存取 ====================
type FanData = {
  shops: FanShop[];
  reviews: FanReview[];
  notes: FanNote[];
  ranks: FanRank[];
  user: FanUser;
  settings: FanSettings;
};
function rid(p: string): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }
function blankUser(): FanUser {
  return { collects: [], wantList: [], checkins: [], level: 1, exp: 0, badges: [], tasteTags: [], buddies: [], quests: [] };
}
function blank(): FanData {
  return { shops: [], reviews: [], notes: [], ranks: [], user: blankUser(), settings: { ...DEFAULT_FAN_SETTINGS } };
}
function read(): FanData {
  const d = readWorldJson<FanData>(WORLD_LS_KEYS.fanfan, blank());
  if (!d || typeof d !== 'object') return blank();
  d.shops ||= []; d.reviews ||= []; d.notes ||= []; d.ranks ||= [];
  d.user = { ...blankUser(), ...(d.user || {}) };
  d.settings = { ...DEFAULT_FAN_SETTINGS, ...(d.settings || {}) };
  d.settings.catPrompts = { ...FAN_DEFAULT_CAT_PROMPTS, ...(d.settings.catPrompts || {}) };
  return d;
}
function write(d: FanData): void { writeWorldJson(WORLD_LS_KEYS.fanfan, d); }

// ---- 设置 ----
export function getFanSettings(): FanSettings { return read().settings; }
export function updateFanSettings(patch: Partial<FanSettings>): FanSettings { const d = read(); d.settings = { ...d.settings, ...patch }; write(d); return d.settings; }

// ---- 店铺 ----
export function getShops(cat?: string): FanShop[] {
  let list = read().shops.slice().sort((a, b) => (b.hot ? 1 : 0) - (a.hot ? 1 : 0) || b.ts - a.ts);
  if (cat) list = list.filter(s => s.cat === cat);
  return list;
}
export function getShop(id: string): FanShop | undefined { return read().shops.find(s => s.id === id); }
export function searchShops(q: string): FanShop[] {
  const k = q.trim().toLowerCase(); if (!k) return [];
  return read().shops.filter(s => s.name.toLowerCase().includes(k) || s.cat.toLowerCase().includes(k) || (s.district || '').toLowerCase().includes(k) || s.dishes.some(d => d.name.toLowerCase().includes(k)));
}
function normDish(x: Partial<FanDish>): FanDish {
  return { name: x.name || '招牌菜', price: typeof x.price === 'number' ? x.price : 38, signature: x.signature, spicy: x.spicy, imgDesc: x.imgDesc, hidden: x.hidden };
}
export function addShops(list: Partial<FanShop>[], cat: string, opts?: { isAi?: boolean }): FanShop[] {
  const d = read(); const added: FanShop[] = [];
  for (const s of list) {
    const shop: FanShop = {
      id: s.id || rid('fs'), name: s.name || '小店', cat: s.cat || cat, district: s.district || '仙宫商圈',
      perCap: typeof s.perCap === 'number' ? s.perCap : 60,
      rating: typeof s.rating === 'number' ? s.rating : 4.6,
      env: typeof s.env === 'number' ? s.env : 4.5, taste: typeof s.taste === 'number' ? s.taste : 4.7, service: typeof s.service === 'number' ? s.service : 4.5,
      hot: s.hot, heatTrend: s.heatTrend || '稳', queue: typeof s.queue === 'number' ? s.queue : 0,
      blurb: s.blurb, coverDesc: s.coverDesc,
      dishes: Array.isArray(s.dishes) ? s.dishes.map(normDish) : [],
      wbKey: s.wbKey, season: s.season, hiddenMenu: s.hiddenMenu,
      collected: s.collected, wantTo: s.wantTo, checkedIn: s.checkedIn,
      isAi: opts?.isAi ?? s.isAi, ownerRef: s.ownerRef, ts: Date.now() - Math.floor(Math.random() * 3600000),
    };
    d.shops.unshift(shop); added.push(shop);
  }
  if (d.shops.length > 200) d.shops = d.shops.slice(0, 200);
  write(d); return added;
}
export function updateShop(id: string, patch: Partial<FanShop>): void { const d = read(); const s = d.shops.find(x => x.id === id); if (s) { Object.assign(s, patch); write(d); } }
export function deleteShop(id: string): void { const d = read(); d.shops = d.shops.filter(s => s.id !== id); d.reviews = d.reviews.filter(r => r.shopId !== id); write(d); }
// 覆盖刷新：清掉 AI 铺的店（保留玩家收藏/想吃/打卡过的、角色开的、绑了世界书的）。返回清掉数。
export function clearAiShops(cat?: string): number {
  const d = read(); const before = d.shops.length;
  const keep = (s: FanShop) => !s.isAi || s.collected || s.wantTo || s.checkedIn || s.ownerRef || s.wbKey;
  const removedIds = new Set(d.shops.filter(s => !keep(s) && (!cat || s.cat === cat)).map(s => s.id));
  d.shops = d.shops.filter(s => !removedIds.has(s.id));
  d.reviews = d.reviews.filter(r => !removedIds.has(r.shopId));
  write(d); return before - d.shops.length;
}

// __FAN_DATA_LAYER_2__
// ---- 评价 ----
export function getReviews(shopId: string): FanReview[] {
  return read().reviews.filter(r => r.shopId === shopId).sort((a, b) => (b.certified ? 1 : 0) - (a.certified ? 1 : 0) || b.ts - a.ts);
}
export function addReviews(shopId: string, list: Partial<FanReview>[], opts?: { isAi?: boolean }): FanReview[] {
  const d = read(); const added: FanReview[] = [];
  for (const r of list) {
    const rating = typeof r.rating === 'number' ? r.rating : 5;
    const rv: FanReview = {
      id: r.id || rid('fr'), shopId, author: r.author || '匿名食客', authorRef: r.authorRef,
      rating, env: r.env, taste: r.taste, service: r.service,
      content: r.content || '', imgDesc: r.imgDesc, likes: typeof r.likes === 'number' ? r.likes : Math.floor(Math.random() * 30),
      kind: r.kind === 'long' ? 'long' : 'short', certified: r.certified, reply: r.reply,
      toxic: r.toxic ?? (rating <= 2), isAi: opts?.isAi ?? r.isAi,
      ts: Date.now() - Math.floor(Math.random() * 86400000 * 20),
    };
    d.reviews.push(rv); added.push(rv);
  }
  write(d); return added;
}
export function likeReview(id: string): void { const d = read(); const r = d.reviews.find(x => x.id === id); if (r) { r.likes += 1; write(d); } }
export function replyReview(id: string, reply: string): void { const d = read(); const r = d.reviews.find(x => x.id === id); if (r) { r.reply = reply; write(d); } }
export function deleteReview(id: string): void { const d = read(); d.reviews = d.reviews.filter(r => r.id !== id); write(d); }
export function clearAiReviews(shopId: string): number {
  const d = read(); const before = d.reviews.length;
  d.reviews = d.reviews.filter(r => r.shopId !== shopId || !r.isAi || r.author === '我');
  write(d); return before - d.reviews.length;
}
// 重算店铺三维/总评（据现有评价均值，无评价则保留原值）
export function recalcShopRating(shopId: string): void {
  const d = read(); const s = d.shops.find(x => x.id === shopId); if (!s) return;
  const rs = d.reviews.filter(r => r.shopId === shopId);
  if (!rs.length) { write(d); return; }
  const avg = (f: (r: FanReview) => number | undefined) => { const xs = rs.map(f).filter((v): v is number => typeof v === 'number'); return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 10) / 10 : undefined; };
  s.rating = avg(r => r.rating) ?? s.rating;
  s.env = avg(r => r.env) ?? s.env; s.taste = avg(r => r.taste) ?? s.taste; s.service = avg(r => r.service) ?? s.service;
  write(d);
}

// ---- 探店笔记（社区）----
export function getNotes(): FanNote[] { return read().notes.slice().sort((a, b) => b.ts - a.ts); }
export function getNote(id: string): FanNote | undefined { return read().notes.find(n => n.id === id); }
export function addNotes(list: Partial<FanNote>[], opts?: { isAi?: boolean }): FanNote[] {
  const d = read(); const added: FanNote[] = [];
  for (const n of list) {
    const note: FanNote = {
      id: n.id || rid('fn'), author: n.author || '探店食客', authorRef: n.authorRef,
      title: n.title || '探店', content: n.content || '', coverDesc: n.coverDesc,
      shopId: n.shopId, shopName: n.shopName,
      rating: n.rating, likes: typeof n.likes === 'number' ? n.likes : Math.floor(Math.random() * 200),
      collects: typeof n.collects === 'number' ? n.collects : Math.floor(Math.random() * 60),
      tags: Array.isArray(n.tags) ? n.tags : [], isAi: opts?.isAi ?? n.isAi,
      ts: Date.now() - Math.floor(Math.random() * 86400000 * 15),
    };
    d.notes.unshift(note); added.push(note);
  }
  if (d.notes.length > 200) d.notes = d.notes.slice(0, 200);
  write(d); return added;
}
export function likeNote(id: string): void { const d = read(); const n = d.notes.find(x => x.id === id); if (n) { n.likes += 1; write(d); } }
export function deleteNote(id: string): void { const d = read(); d.notes = d.notes.filter(n => n.id !== id); write(d); }
export function clearAiNotes(): number {
  const d = read(); const before = d.notes.length;
  d.notes = d.notes.filter(n => !n.isAi || n.author === '我');
  write(d); return before - d.notes.length;
}

// ---- 榜单 ----
export function getRanks(): FanRank[] { return read().ranks.slice().sort((a, b) => b.ts - a.ts); }
export function getRank(kind: string): FanRank | undefined { return read().ranks.find(r => r.kind === kind); }
export function upsertRank(kind: string, title: string, entries: FanRankEntry[], note?: string): FanRank {
  const d = read(); const existing = d.ranks.find(r => r.kind === kind);
  const rank: FanRank = { id: existing?.id || rid('frk'), kind, title, entries, note, ts: Date.now() };
  d.ranks = [rank, ...d.ranks.filter(r => r.kind !== kind)];
  write(d); return rank;
}
// __FAN_DATA_LAYER_3__
// ---- 我的：收藏 / 想吃 / 打卡 / 成长 ----
export function getUser(): FanUser { return read().user; }
export function toggleCollect(shopId: string): boolean {
  const d = read(); const has = d.user.collects.includes(shopId);
  d.user.collects = has ? d.user.collects.filter(x => x !== shopId) : [shopId, ...d.user.collects];
  const s = d.shops.find(x => x.id === shopId); if (s) s.collected = !has;
  write(d); return !has;
}
export function toggleWant(shopId: string): boolean {
  const d = read(); const has = d.user.wantList.includes(shopId);
  d.user.wantList = has ? d.user.wantList.filter(x => x !== shopId) : [shopId, ...d.user.wantList];
  const s = d.shops.find(x => x.id === shopId); if (s) s.wantTo = !has;
  write(d); return !has;
}
// 打卡：记足迹 + 加经验 + 可能升级 + 自动解锁勋章
export function checkIn(shopId: string, note?: string): { leveledUp: boolean; newBadges: string[] } {
  const d = read(); const s = d.shops.find(x => x.id === shopId);
  if (s) s.checkedIn = true;
  d.user.checkins = [{ shopId, shopName: s?.name || '某店', ts: Date.now(), note }, ...d.user.checkins].slice(0, 300);
  const leveledUp = grantExp(d, 15);
  const newBadges = refreshBadges(d);
  write(d); return { leveledUp, newBadges };
}
export const FAN_LEVEL_TITLES = ['吃货萌新', '扫街学徒', '资深饕客', '探店达人', '八方食神', '仙膳品鉴官'];
function levelOfExp(exp: number): number { return Math.min(FAN_LEVEL_TITLES.length, Math.max(1, Math.floor(exp / 100) + 1)); }
export function levelTitle(level: number): string { return FAN_LEVEL_TITLES[Math.min(FAN_LEVEL_TITLES.length - 1, Math.max(0, level - 1))]; }
export function expToNext(exp: number): { cur: number; need: number; pct: number } {
  const lvl = levelOfExp(exp); const base = (lvl - 1) * 100; const cur = exp - base; const need = 100;
  return { cur, need, pct: Math.min(100, Math.round(cur / need * 100)) };
}
function grantExp(d: FanData, n: number): boolean {
  const before = d.user.level; d.user.exp += n; d.user.level = levelOfExp(d.user.exp);
  return d.user.level > before;
}
export function addExp(n: number): boolean { const d = read(); const up = grantExp(d, n); refreshBadges(d); write(d); return up; }
// 勋章：据打卡足迹/评价/收藏自动解锁
function refreshBadges(d: FanData): string[] {
  const have = new Set(d.user.badges);
  const add: string[] = [];
  const give = (b: string) => { if (!have.has(b)) { have.add(b); add.push(b); } };
  const chk = d.user.checkins.length;
  if (chk >= 1) give('初次探店');
  if (chk >= 10) give('扫街十家');
  if (chk >= 50) give('百店打卡·美食地图');
  const myReviews = d.reviews.filter(r => r.author === '我');
  if (myReviews.length >= 5) give('点评达人');
  if (myReviews.some(r => r.toxic)) give('踩雷勇士');
  const cats = new Set(d.user.checkins.map(c => d.shops.find(s => s.id === c.shopId)?.cat).filter(Boolean));
  if (cats.has('灵茶甜点')) give('甜品猎人');
  if (cats.has('深夜食堂')) give('深夜食堂常客');
  if (cats.has('双修膳房')) give('双修膳房熟客');
  d.user.badges = Array.from(have);
  return add;
}
export function setTasteTags(tags: string[]): void { const d = read(); d.user.tasteTags = tags.slice(0, 8); write(d); }

// ---- 饭搭子 / 试吃任务 ----
export function getBuddies(): FanBuddy[] { return read().user.buddies.slice().sort((a, b) => b.ts - a.ts); }
export function addBuddy(b: Omit<FanBuddy, 'id' | 'ts'>): FanBuddy { const d = read(); const bud: FanBuddy = { id: rid('fb'), ts: Date.now(), ...b }; d.user.buddies.unshift(bud); write(d); return bud; }
export function removeBuddy(id: string): void { const d = read(); d.user.buddies = d.user.buddies.filter(x => x.id !== id); write(d); }
export function getQuests(): FanQuest[] { return read().user.quests.slice().sort((a, b) => b.ts - a.ts); }
export function addQuest(q: Omit<FanQuest, 'id' | 'ts' | 'status'> & { status?: FanQuest['status'] }): FanQuest {
  const d = read(); const quest: FanQuest = { id: rid('fq'), ts: Date.now(), status: q.status || 'open', shopId: q.shopId, shopName: q.shopName, task: q.task, reward: q.reward };
  d.user.quests.unshift(quest); write(d); return quest;
}
export function setQuestStatus(id: string, status: FanQuest['status']): void { const d = read(); const q = d.user.quests.find(x => x.id === id); if (q) { q.status = status; write(d); } }
export function removeQuest(id: string): void { const d = read(); d.user.quests = d.user.quests.filter(x => x.id !== id); write(d); }

// ---- 分类管理 ----
export function getCategories(): { name: string; icon: string }[] {
  const custom = read().settings.customCats.map(c => ({ name: c.name, icon: 'fa-tag' }));
  return [...FAN_CATS, ...custom];
}
export function addCustomCat(name: string): void {
  const d = read(); const nm = name.trim(); if (!nm) return;
  if (d.settings.customCats.some(c => c.name === nm) || FAN_CATS.some(c => c.name === nm)) return;
  d.settings.customCats.push({ name: nm });
  if (!d.settings.catPrompts[nm]) d.settings.catPrompts[nm] = defaultFanCatTemplate(nm);
  write(d);
}
export function deleteCustomCat(name: string): void {
  const d = read(); d.settings.customCats = d.settings.customCats.filter(c => c.name !== name);
  delete d.settings.catPrompts[name]; write(d);
}
export function getCatPrompt(name: string): string { return read().settings.catPrompts[name] || ''; }
export function setCatPrompt(name: string, text: string): void { const d = read(); if (text.trim()) d.settings.catPrompts[name] = text; else delete d.settings.catPrompts[name]; write(d); }

// 清空业务数据（店铺/评价/笔记/榜单），但保留设置与「我的成长」（等级/经验/徽章/饭搭子/收藏）。
export function clearAll(): void {
  const d = read();
  write({ shops: [], reviews: [], notes: [], ranks: [], user: d.user, settings: d.settings });
}


