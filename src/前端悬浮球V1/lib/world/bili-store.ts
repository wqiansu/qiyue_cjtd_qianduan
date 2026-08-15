import { WORLD_LS_KEYS, readWorldJson, writeWorldJson } from './world-store';

export type BiliDanmu = { id: string; text: string; color?: string };
export type BiliComment = {
  id: string; author: string; content: string; likes: number; ts: number;
  replyTo?: string;
};
export type BiliVideo = {
  id: string;
  title: string;
  up: string;
  upRef?: string;
  duration: string;
  views: string;
  partition: string;
  coverTag?: string;
  coverDesc?: string;
  cover?: string;
  desc?: string;
  danmus: BiliDanmu[];
  comments: BiliComment[];
  favorited?: boolean;
  liked?: boolean;
  coined?: boolean;
  isMine?: boolean;
  derivedFrom?: string;
  ts: number;
  detailLoaded?: boolean;
};

export type BiliUp = {
  name: string;
  ref?: string;
  identity?: string;
  avatar?: string;
  fans: string;
  bio?: string;
  followed?: boolean;
};

export type BiliProfile = {
  nickname: string;
  avatar?: string;
  banner?: string;
  bio?: string;
  level: number;
  fans: string;
  following: number;
};
export const DEFAULT_BILI_PROFILE: BiliProfile = {
  nickname: '我', level: 1, fans: '0', following: 0,
};

type BiliData = {
  videos: BiliVideo[]; history: string[]; ups?: BiliUp[];
  profile?: BiliProfile; settings?: BiliSettings;
};

export type BiliSettings = {
  useFloors: boolean;
  floorCount: number;
  useWorldbook: boolean;
  worldbookEntryKeys: string[];
  autoInterval: number;        // 每 N 楼自动刷一批视频，0=关
  lastFloor: number;
  partitionPref: string;
  danmuOn: boolean;
  quality: string;
  derivativeOn: boolean;       // 二创/鬼畜衍生链开关
  memoryEnabled: boolean;
  syncEnabled: boolean;
  ecoActivity: number;         // UP 活跃度/出片量 0-100
  ecoDanmu: number;            // 弹幕密度/刷屏感 0-100
  ecoSnark: number;            // 对线/阴阳/毒舌浓度 0-100
  ecoMeme: number;             // 玩梗/鬼畜整活浓度 0-100
  ecoErotic: number;           // 色情度浓度 0-100
  ecoCarnal: number;           // 肉欲度浓度 0-100
  ecoDaily: number;            // 日常度浓度 0-100
  blockWords: string[];
  customCats: { id: string; name: string; icon: string }[];
  catPrompts: Record<string, string>;
};
export const DEFAULT_BILI_SETTINGS: BiliSettings = {
  useFloors: true, floorCount: 6, useWorldbook: false, worldbookEntryKeys: [],
  autoInterval: 0, lastFloor: 0, partitionPref: '', danmuOn: true, quality: '高清',
  derivativeOn: true, memoryEnabled: true, syncEnabled: false,
  ecoActivity: 60, ecoDanmu: 65, ecoSnark: 45, ecoMeme: 60, blockWords: [],
  ecoErotic: 50, ecoCarnal: 50, ecoDaily: 50,
  customCats: [], catPrompts: {},
};

function rid(p: string): string { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

function read(): BiliData {
  const d = readWorldJson<BiliData>(WORLD_LS_KEYS.bili, { videos: [], history: [] });
  if (!d || typeof d !== 'object') return { videos: [], history: [] };
  if (!Array.isArray(d.videos)) d.videos = [];
  if (!Array.isArray(d.history)) d.history = [];
  if (!d.settings) d.settings = { ...DEFAULT_BILI_SETTINGS };
  d.settings.catPrompts = { ...BILI_DEFAULT_CAT_PROMPTS, ...(d.settings.catPrompts || {}) };
  return d;
}
function write(d: BiliData): void { writeWorldJson(WORLD_LS_KEYS.bili, d); }

export function getVideos(): BiliVideo[] { return read().videos.slice().sort((a, b) => b.ts - a.ts); }
export function getVideo(id: string): BiliVideo | undefined { return read().videos.find(v => v.id === id); }
export function getFavorites(): BiliVideo[] { return getVideos().filter(v => v.favorited); }
export function getHistory(): BiliVideo[] {
  const d = read();
  return d.history.map(id => d.videos.find(v => v.id === id)).filter(Boolean) as BiliVideo[];
}

export function addVideos(list: Partial<BiliVideo>[]): BiliVideo[] {
  const d = read();
  const added: BiliVideo[] = [];
  for (const p of list) {
    const v: BiliVideo = {
      id: p.id || rid('bv'),
      title: p.title || '（无标题）', up: p.up || '路人up', upRef: p.upRef,
      duration: p.duration || '00:00', views: p.views || '0', partition: p.partition || '综合',
      coverTag: p.coverTag, coverDesc: p.coverDesc, cover: p.cover, desc: p.desc,
      danmus: [], comments: [], favorited: false, derivedFrom: p.derivedFrom, ts: Date.now(), detailLoaded: false,
    };
    d.videos.unshift(v);
    added.push(v);
  }
  // 上限：保留最近 120 条，避免无限膨胀
  if (d.videos.length > 120) d.videos = d.videos.slice(0, 120);
  write(d);
  return added;
}

export function updateVideo(id: string, patch: Partial<BiliVideo>): void {
  const d = read();
  const i = d.videos.findIndex(v => v.id === id);
  if (i < 0) return;
  d.videos[i] = { ...d.videos[i], ...patch };
  write(d);
}
export function deleteVideo(id: string): void {
  const d = read();
  d.videos = d.videos.filter(v => v.id !== id);
  d.history = d.history.filter(h => h !== id);
  write(d);
}
export function toggleFavorite(id: string): void {
  const d = read();
  const v = d.videos.find(x => x.id === id);
  if (!v) return;
  v.favorited = !v.favorited;
  write(d);
}
export function toggleLike(id: string): void {
  const d = read(); const v = d.videos.find(x => x.id === id); if (!v) return;
  v.liked = !v.liked; write(d);
}
export function toggleCoin(id: string): void {
  const d = read(); const v = d.videos.find(x => x.id === id); if (!v) return;
  v.coined = !v.coined; write(d);
}
export function tripleAction(id: string): void {
  const d = read(); const v = d.videos.find(x => x.id === id); if (!v) return;
  v.liked = true; v.coined = true; v.favorited = true; write(d);
}
export function markWatched(id: string): void {
  const d = read();
  d.history = [id, ...d.history.filter(h => h !== id)].slice(0, 60);
  write(d);
}

export function setDetail(id: string, p: { desc?: string; danmus?: BiliDanmu[]; comments?: BiliComment[] }): void {
  const d = read();
  const v = d.videos.find(x => x.id === id);
  if (!v) return;
  if (p.desc != null) v.desc = p.desc;
  if (p.danmus) v.danmus = p.danmus.map(x => ({ id: x.id || rid('dm'), text: x.text, color: x.color }));
  if (p.comments) v.comments = p.comments.map(x => ({ id: x.id || rid('cm'), author: x.author, content: x.content, likes: x.likes || 0, ts: Date.now(), replyTo: x.replyTo }));
  v.detailLoaded = true;
  write(d);
}
export function clearAll(): void { const d = read(); write({ videos: [], history: [], ups: [], profile: d.profile, settings: d.settings }); }

export function clearFeedVideos(partName?: string): void {
  const d = read();
  d.videos = d.videos.filter(v => {
    const keep = v.isMine || v.favorited || v.liked || v.coined;
    if (keep) return true;
    if (partName) return !(v.partition.includes(partName) || v.partition === partName);
    return false;
  });
  const ids = new Set(d.videos.map(v => v.id));
  d.history = d.history.filter(h => ids.has(h));
  write(d);
}

// UP 列表：已存档的名片优先，缺失的从视频里的 up 聚合补全
export function getUps(): BiliUp[] {
  const d = read();
  const stored = Array.isArray(d.ups) ? d.ups : [];
  const byName = new Map<string, BiliUp>();
  for (const u of stored) byName.set(u.name, u);
  for (const v of d.videos) {
    if (v.up && !byName.has(v.up)) byName.set(v.up, { name: v.up, ref: v.upRef, fans: '', followed: false });
  }
  return [...byName.values()];
}
export function getUp(name: string): BiliUp | undefined {
  return getUps().find(u => u.name === name);
}
export function upsertUp(name: string, patch: Partial<BiliUp>): BiliUp {
  const d = read();
  if (!Array.isArray(d.ups)) d.ups = [];
  const i = d.ups.findIndex(u => u.name === name);
  if (i < 0) { const u: BiliUp = { name, fans: '', followed: false, ...patch }; d.ups.push(u); write(d); return u; }
  d.ups[i] = { ...d.ups[i], ...patch, name };
  write(d);
  return d.ups[i];
}
export function toggleFollowUp(name: string): boolean {
  const cur = getUp(name);
  const next = !(cur?.followed);
  upsertUp(name, { followed: next });
  return next;
}
export function getFollowedUps(): BiliUp[] { return getUps().filter(u => u.followed); }
export function getDynamicVideos(): BiliVideo[] {
  const followed = new Set(getFollowedUps().map(u => u.name));
  return getVideos().filter(v => followed.has(v.up));
}
export function getVideosByUp(name: string): BiliVideo[] { return getVideos().filter(v => v.up === name); }

// 默认分区（进 app 即可见的常驻分类）
export const BILI_PARTITIONS: { id: string; name: string; icon: string }[] = [
  { id: 'rec', name: '推荐', icon: 'fa-house' },
  { id: 'douga', name: '动画', icon: 'fa-clapperboard' },
  { id: 'game', name: '游戏', icon: 'fa-gamepad' },
  { id: 'guichu', name: '鬼畜', icon: 'fa-face-grin-wide' },
  { id: 'music', name: '音乐', icon: 'fa-music' },
  { id: 'dance', name: '舞蹈', icon: 'fa-music' },
  { id: 'knowledge', name: '知识', icon: 'fa-lightbulb' },
  { id: 'tech', name: '科技', icon: 'fa-microchip' },
  { id: 'life', name: '生活', icon: 'fa-leaf' },
  { id: 'food', name: '美食', icon: 'fa-gift' },
  { id: 'fashion', name: '时尚', icon: 'fa-shirt' },
  { id: 'cinema', name: '影视', icon: 'fa-film' },
  // 成人向分区（R18，按本卡世界书设定的性别生态，默认全为女性 UP）
  { id: 'r18asmr', name: '私语ASMR', icon: 'fa-moon' },
  { id: 'r18dance', name: '热舞诱惑', icon: 'fa-fire' },
  { id: 'r18cos', name: '媚惑Cos', icon: 'fa-sparkles' },
  { id: 'r18gl', name: '百合美番', icon: 'fa-heart' },
  { id: 'r18asmrstory', name: '声色剧场', icon: 'fa-crown' },
  { id: 'r18vlog', name: '私房vlog', icon: 'fa-gem' },
];

export const BILI_DEFAULT_CAT_PROMPTS: Record<string, string> = {
  '动画': '【动画区】内容母题：新番追番/吐槽/速看、国创/日漫/番剧解说、AMV燃向混剪、手书/同人动画、声优与配音、动画考据与彩蛋盘点、催更与意难平。UP主画像：追番党出锐评与排行、剪刀手出燃向AMV、同人作者发手书、考据党扒设定。标题套路：「这部新番封神了」「3分钟看懂xx」「当xx名场面配上这首歌」「【手书】xx」。招牌格式：解说视频时长偏长，混剪偏短而燃；配齐时长/播放量/分区=动画。弹幕生态：高能预警、名场面刷屏「name刷屏」、空降坐标、催更下一集、整齐排比刷梗。',
  '游戏': '【游戏区】内容母题：实况/攻略/速通、新游试玩、单机剧情流程、电竞赛事/操作集锦、整活/搞笑名场面、云玩家、回锅肉考古、外设评测。UP主画像：主播切片整活、攻略UP出保姆教程、电竞剪辑混剪高光、单机剧情党配解说。标题套路：「这波操作教科书」「全成就攻略（保姆级）」「当我把xx玩成了xx」「速通xx分钟」。招牌格式：攻略给步骤/配装/路线，实况偏长，集锦偏短燃；配齐时长/播放量（爆款可破百万）/分区=游戏。弹幕生态：「针不戳」「6666」「名场面」「云玩家路过」「指挥操作」「前方高能」。',
  '鬼畜': '【鬼畜区】内容母题：鬼畜调教、音MAD、人力VOCALOID、空耳、表情包素材、对线名场面再创作、洗脑循环。UP主画像：鬼畜区老UP整活、调教大师卡点、空耳鬼才。标题套路：「【鬼畜】xx」「当xx开始鬼畜」「循环100遍的快乐」「【音MAD】」。招牌格式：时长偏短，强调卡点/洗脑/魔性；标题必带浓浓整活味，正文玩梗；配齐时长/播放量/分区=鬼畜。弹幕生态：满屏「哈哈哈」「这就是鬼畜区」「根本停不下来」「鬼畜全明星」「名场面收藏」「+1s」。',
  '音乐': '【音乐区】内容母题：原创音乐/翻唱、cover、乐器演奏、电音/说唱、音乐MV、扒谱教学、歌单分享、live现场。UP主画像：唱见发翻唱、乐手晒演奏、词曲人发原创、电音up出remix。标题套路：「【翻唱】xx」「单曲循环了一周的歌」「吉他指弹xx」「原创｜xx」。招牌格式：演奏/翻唱偏完整时长，强调音质/编曲/和声；配齐时长/播放量/分区=音乐。弹幕生态：「单曲循环」「天籁」「DNA动了」「awsl」「这编曲绝了」，副歌处弹幕齐刷歌词。',
  '舞蹈': '【舞蹈区】内容母题：宅舞/翻跳、街舞/编舞、国风舞、舞蹈教程分解、cos翻跳、唯美/性感向（健康尺度）。UP主画像：舞见翻跳、编舞师出原创、教程UP做分解。标题套路：「【翻跳】xx」「这个编舞绝了」「xx舞蹈分解教学」「cos+翻跳」。招牌格式：翻跳给完整成品，教程给分解；强调还原度/编舞/服化道；配齐时长/播放量/分区=舞蹈。弹幕生态：「跳得真好」「awsl」「这身材」「求BGM」「分解蹲一个」，卡点处刷「舞蹈区还是你们厉害」。',
  '知识': '【知识区】内容母题：科普/泛知识、硬核拆解、历史/人文/财经/法律科普、纪录片解说、技能教学、答疑辟谣。UP主画像：专业UP出硬核科普、泛知识UP做选题讲解、纪录片搬运配解说。标题套路：「3分钟讲清xx」「为什么xx？」「冷知识：xx」「硬核拆解xx」。招牌格式：解说时长偏长有逻辑，分点讲清；强调干货/有理有据/通俗易懂；配齐时长/播放量/分区=知识。弹幕生态：「学到了」「涨知识了」「up讲得真清楚」「考研/考试前来复习」「这就去查」，纠错党补充。',
  '科技': '【科技区】内容母题：数码评测、手机/电脑/外设开箱、装机教程、软件/效率工具、AI前沿、极客折腾、性价比推荐。UP主画像：评测UP横评、装机UP出教程、极客折腾向、数码博主恰饭软广（高频）。标题套路：「xx深度评测」「装机保姆级教程」「这个神器相见恨晚」「xx值不值得买」。招牌格式：评测给参数对比/跑分/使用体验，强调客观/性价比/避坑；恰饭痕迹要自然；配齐时长/播放量/分区=科技。弹幕生态：「参数党」「恰饭实锤」「等等党永远不亏」「求配置单」「这价格真香」。',
  '生活': '【生活区】内容母题：vlog日常、好物/家居、手工DIY、宠物、母婴亲子、记录生活、治愈系、搞笑日常。UP主画像：vlogger记录日常、生活UP分享好物、手工耿式整活、铲屎官晒宠物。标题套路：「我的一天vlog」「这个好物绝了」「记录普通又幸福的一天」「沙雕日常」。招牌格式：vlog偏完整时长，节奏松弛治愈；好物可挂软广；配齐时长/播放量/分区=生活。弹幕生态：「治愈了」「up好温柔」「同款生活」「awsl」「求链接」，氛围轻松。',
  '美食': '【美食区】内容母题：探店、家常菜/烘焙教程、吃播、地方小吃、深夜放毒、测评、野食/硬核做饭。UP主画像：美食UP出教程、吃播主播炫饭、探店UP实录、硬核野食流。标题套路：「这道菜零失败」「人均xx的宝藏小店」「深夜放毒慎入」「挑战xx」。招牌格式：教程给食材步骤火候，探店给店名人均地址，吃播强调声音/食量；配齐时长/播放量/分区=美食。弹幕生态：「深夜报复社会」「口水流下来了」「求菜谱」「这家在哪」「up快吃我馋了」。',
  '时尚': '【时尚区】内容母题：穿搭OOTD、美妆教程、发型、变装、好物种草、风格改造、时尚资讯。UP主画像：穿搭博主出公式、美妆UP做教程、变装up整活、买手恰饭带货。标题套路：「显瘦显高穿搭公式」「变装xx」「这个妆容绝了」「平价好物种草」。招牌格式：穿搭给身高体重单品，美妆给产品色号，变装强调反差；可挂软广；配齐时长/播放量/分区=时尚。弹幕生态：「awsl」「求链接」「这也太好看了」「学到了」「钱包警告」。',
  '影视': '【影视区】内容母题：电影/剧解说、混剪/cut、影评锐评、考据彩蛋、预告速看、经典重温、烂片吐槽。UP主画像：解说UP「几分钟看完」、混剪剪刀手、影评人锐评、考据党扒细节。标题套路：「x分钟看完xx」「这部封神了」「当xx名场面」「烂到笑的xx」。招牌格式：解说有节奏带剧透提醒，混剪燃/虐向卡点；强调高能/名场面/意难平；配齐时长/播放量/分区=影视。弹幕生态：「名场面」「DNA动了」「爷青回」「前方高能」「这剪辑绝了」，经典处刷台词。',
  // 成人向分区默认引导（R18，UP 主与出镜者按本卡世界书设定的性别生态默认全为女性；露骨度按生态色情度上限走，皆为虚构表演）。
  '私语ASMR': '【私语ASMR区】内容母题：成人向耳搔/气音/助眠ASMR视频，主打贴耳低语、湿润口腔音、喘息气声、暧昧台词哄睡、角色扮演耳语，走「酥麻+情欲」路线。UP主画像：声控向女声优UP，靠声音质感与气息勾人，封面多戴耳机/暗光氛围。标题套路：「3D耳语｜戴耳机危险」「贴耳哄睡的姐姐」「酥到脚趾蜷缩」，标题强调声音体感与上头预警。招牌格式：视频偏长（沉浸式），强调「左右耳/3D/无人声纯音效」标签，简介提示佩戴耳机、深夜慎看；配齐时长/播放量/分区=私语ASMR。弹幕生态：「左耳再说一次」「酥了」「DNA动了」「这谁顶得住」「耳朵怀孕」，高能气音处弹幕成片预警。',
  '热舞诱惑': '【热舞诱惑区】内容母题：成人向宅舞/热舞/钢管舞/抖臀向翻跳，强调身材线条、镜头特写、性感编舞与卡点诱惑，是「舞蹈区」的成人镜像。UP主画像：身材出众、舞感好的女UP，靠服化道（紧身/JK/丝袜）与镜头语言制造看点。标题套路：「这身材跳这支舞犯规了」「深夜热舞慎点」「卡点到腿软」，标题落在身材与尺度试探。招牌格式：翻跳给完整成品，强调还原度/镜头/服化道，封面定格诱惑帧；配齐时长/播放量/分区=热舞诱惑。弹幕生态：「awsl」「这身材」「卡点绝了」「求BGM」「鼻血预警」「舞蹈区还是你们厉害」，副歌处刷屏。',
  '媚惑Cos': '【媚惑Cos区】内容母题：成人向角色cosplay短片/写真向视频，女仆/护士/兔女郎/JK/古风等媚惑系cos，强调还原度、反差与角色代入的情色张力，是「时尚/cos」的成人镜像。UP主画像：cos到位、会摆pose会演的coser女UP，重服化道与场景布置。标题套路：「兔女郎下班了来看你」「病娇女友cos」「这套谁顶得住」，点明角色+媚惑情境。招牌格式：写真向给定格美图+花絮，剧情向给角色短剧；强调还原/反差/服化道，简介挂角色出处；配齐时长/播放量/分区=媚惑Cos。弹幕生态：「还原度满分」「awsl」「老婆」「这腿」「钱包警告」，名场面定格刷屏。',
  '百合美番': '【百合美番区】内容母题：成人向百合/GL向内容——女女CP混剪、原创百合短剧、GL同人手书与AMV、姬情向二创，契合本卡无雄性世界观，是平台双人情色的主力区。UP主画像：剪刀手做CP混剪、原创作者出百合短剧、同人画师发GL手书。标题套路：「她和她的故事」「这对姬情拉满」「百合花开」「磕到上头的GL」，钩子落在CP张力与甜/欲。招牌格式：混剪卡点燃/甜向，短剧给完整剧情，手书标原创；强调CP化学反应与暧昧递进；配齐时长/播放量/分区=百合美番。弹幕生态：「磕到了」「在一起」「这对真的绝」「DNA动了」「我可以」，告白名场面刷屏。',
  '声色剧场': '【声色剧场区】内容母题：成人向广播剧/有声剧场/情景音声，以剧情+声音演绎为主，暧昧台词、情境对白、角色独白构成的「声音剧」，比私语ASMR更重剧情线。UP主画像：会演会配的女声优UP，单人多角或多人剧组，重剧本与情绪。标题套路：「广播剧｜她的独占欲」「情景音声·深夜来电」，点明剧情设定+情境。招牌格式：分集/单本剧形式，简介给剧情简介+CV表+食用指北（戴耳机），强调剧本与演技；配齐时长/播放量/分区=声色剧场。弹幕生态：「CV绝了」「这段封神」「入戏了」「下一集呢」「耳朵爽了」，高潮剧情处弹幕刷台词。',
  '私房vlog': '【私房vlog区】内容母题：成人向私房/日常vlog——居家独处、睡前日常、浴后、健身私拍等带暧昧氛围的生活记录，主打「真实私密感+若隐若现的福利」，是「生活区」的成人镜像。UP主画像：颜值身材在线的女UP，靠真实私密感与亲近距离留人，镜头随性家居。标题套路：「睡前陪你说说话」「居家的一天vlog」「浴后碎碎念」，钩子落在私密日常与亲近感。招牌格式：vlog偏完整时长，节奏松弛暧昧，简介像写给「你」的私语；强调真实/私密/陪伴；配齐时长/播放量/分区=私房vlog。弹幕生态：「好近的感觉」「像女朋友」「treasure」「这也太私密了」「awsl」，氛围私密走心。',
};

function viewsToNum(s: string): number {
  if (!s) return 0;
  const m = String(s).match(/([\d.]+)\s*([万wW亿]?)/);
  if (!m) return 0;
  const n = parseFloat(m[1]) || 0;
  const unit = m[2];
  if (unit === '万' || unit === 'w' || unit === 'W') return n * 10000;
  if (unit === '亿') return n * 100000000;
  return n;
}
// 传 partName 时只统计该分区的视频（分区排行榜）。
export function getRanking(limit = 10, partName?: string): BiliVideo[] {
  let list = getVideos();
  if (partName) list = list.filter(v => v.partition.includes(partName) || v.partition === partName);
  return list.slice().sort((a, b) => viewsToNum(b.views) - viewsToNum(a.views)).slice(0, limit);
}

export function addMyVideo(p: Partial<BiliVideo>): BiliVideo {
  const d = read();
  const v: BiliVideo = {
    id: p.id || rid('bv'),
    title: p.title || '（无标题）', up: p.up || (d.profile?.nickname || '我'), upRef: p.upRef,
    duration: p.duration || '00:00', views: p.views || '0', partition: p.partition || '生活',
    coverTag: p.coverTag, coverDesc: p.coverDesc, cover: p.cover, desc: p.desc,
    danmus: [], comments: [], favorited: false, isMine: true,
    ts: Date.now(), detailLoaded: true,
  };
  d.videos.unshift(v);
  if (d.videos.length > 120) d.videos = d.videos.slice(0, 120);
  write(d);
  return v;
}
export function getMyVideos(): BiliVideo[] { return getVideos().filter(v => v.isMine); }

export function addDanmu(id: string, text: string, color?: string): void {
  const d = read(); const v = d.videos.find(x => x.id === id); if (!v) return;
  v.danmus.push({ id: rid('dm'), text, color });
  write(d);
}
export function addComment(id: string, c: { author: string; content: string; likes?: number; replyTo?: string }): void {
  const d = read(); const v = d.videos.find(x => x.id === id); if (!v) return;
  v.comments.push({ id: rid('cm'), author: c.author, content: c.content, likes: c.likes || 0, ts: Date.now(), replyTo: c.replyTo });
  write(d);
}
export function appendComments(id: string, list: { author: string; content: string; likes?: number; replyTo?: string }[]): void {
  const d = read(); const v = d.videos.find(x => x.id === id); if (!v) return;
  for (const c of list) v.comments.push({ id: rid('cm'), author: c.author, content: c.content, likes: c.likes || 0, ts: Date.now(), replyTo: c.replyTo });
  write(d);
}

export function getProfile(): BiliProfile {
  const d = read();
  return { ...DEFAULT_BILI_PROFILE, ...(d.profile || {}) };
}
export function updateProfile(patch: Partial<BiliProfile>): BiliProfile {
  const d = read();
  d.profile = { ...DEFAULT_BILI_PROFILE, ...(d.profile || {}), ...patch };
  write(d);
  return d.profile;
}

export function getBiliSettings(): BiliSettings {
  const d = read();
  return { ...DEFAULT_BILI_SETTINGS, ...(d.settings || {}) };
}
export function updateBiliSettings(patch: Partial<BiliSettings>): BiliSettings {
  const d = read();
  d.settings = { ...DEFAULT_BILI_SETTINGS, ...(d.settings || {}), ...patch };
  write(d);
  return d.settings;
}
