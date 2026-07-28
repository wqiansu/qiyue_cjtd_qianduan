// 世界历节日与活动总表（festival-table.ts）
// 唯一数据源：世界演化与日历 app 都读这份。风格化统一历（12 月 × 30 天），节日按名义月日落位。
// 类别 category：中=中国传统 · 西=西方/现代 · 节=二十四节气 · 院=星见丘学院(日式校历) · 宫=霜月仙宫 · 物=物候。
//   允许同日多节重合；多天节日 duration>1。ambience=该日世界会发生什么（供 AI 当天带出节日感）。
export type Festival = {
  month: number;      // 1..12（名义月）
  day: number;        // 1..30（名义日）
  title: string;
  category: string;   // 原始类别串，如 '中' / '中·院' / '西趣'
  duration?: number;  // 持续天数（>1 为多天节日）
  ambience: string;   // 当天详细剧情氛围描述
};

// 学院校历总纲（日式·三学期制）——供学期制/注入参考
export const SCHOOL_CALENDAR = [
  '一学期：4月始业·入学式 → 7月中旬结业 → 暑假(7下~8月)',
  '二学期：9月始业 → 10月学园祭/体育祭 → 12月下旬结业 → 寒假',
  '三学期：1月始业 → 3月毕业式·结业 → 春假',
  '考试：中间考(学期中) · 期末考(学期末)',
];
// 学期阶段（按名义月推断）
export function semesterOf(month: number): string {
  if (month >= 4 && month <= 7) return '一学期';
  if (month === 8) return '暑假';
  if (month >= 9 && month <= 12) return '二学期';
  return '三学期'; // 1~3
}
// 物候年轮（喂季节氛围）
export const PHENOLOGY: Record<string, string> = {
  春: '樱花坡、海风回暖、新生气象',
  夏: '蝉鸣、灵泉浴、夏日祭、情欲同涨',
  秋: '红叶、学园祭、榜单征战',
  冬: '初雪、暖炉、围炉、年节将近',
};

// FESTIVAL_TABLE_PLACEHOLDER
export const FESTIVALS: Festival[] = [
  // ===== 1 月（隆冬·三学期始）=====
  { month: 1, day: 1, title: '岁首·新年', category: '中西', duration: 3, ambience: '爆竹与烟花在云海仙宫上空炸开，各殿门前红灯高挂、桃符换新；天地灵网全程直播跨年倒数，弹幕如潮；弟子们成群互道贺岁、发红包抢红包，邀月宫备下年夜灵宴，整座仙宫从深夜狂欢到天明' },
  { month: 1, day: 1, title: '元旦', category: '西', ambience: '新历第一日，微博与灵网被"新年flag"刷屏，人人立誓今年要变强/变美/脱单，躺平部却发起"反flag宣言"' },
  { month: 1, day: 3, title: '初三·赤口', category: '中', ambience: '传说易生口角，风纪委员这天格外忙；弟子多宅家守着年节余韵、补觉刷剧点外卖' },
  { month: 1, day: 5, title: '小寒', category: '节', ambience: '寒气渐盛，灵泉浴池成了最抢手的去处，玉桌上堆满自热火锅与热奶茶，凉亭围炉煮茶' },
  { month: 1, day: 7, title: '人日·七草', category: '中·院', ambience: '家政社煮七草粥分予众人祈一年安康，凝霜宫讲解人日典故，学院食堂限定七草膳' },
  { month: 1, day: 8, title: '始业式·三学期', category: '院', ambience: '久别的二年A班重聚，晒黑晒白的寒假见闻满天飞，寒假作业没写完的哀嚎此起彼伏，月曦老师点名收作业' },
  { month: 1, day: 11, title: '镜开·汤圆祭', category: '院', ambience: '开镜饼、吃善哉红豆汤圆祈健康，甜品与乳汁品鉴会趁机开新品试吃会' },
  { month: 1, day: 13, title: '腊祭·祭灶', category: '中', ambience: '送灶王上天言好事，各殿大扫除迎新，邀月宫核账封库' },
  { month: 1, day: 15, title: '元宵·上元灯节', category: '中', ambience: '仙宫广场架起巨型花灯阵，猜灯谜赢周边，汤圆灵宴管够；玉桥花廊挂满灯笼，倒映在云海如星河' },
  { month: 1, day: 15, title: '成人式', category: '院', ambience: '及龄弟子身着华丽振袖盛装，在樱花坡合影留念，学姐们红着眼眶送祝福' },
  { month: 1, day: 17, title: '防灾之日', category: '院', ambience: '全校避难演练，葬花宫弟子挂袖标维持秩序，趁乱偷用缩地术抢先到集合点的被抓包' },
  { month: 1, day: 20, title: '大寒', category: '节', ambience: '一年最冷之日，灵泉浴池边泡澡边看新番成了标配，互相涂抹润滑灵液暖身' },
  { month: 1, day: 22, title: '万花镜·冬季总选举速报', category: '宫', duration: 2, ambience: '广场LED屏名次疯狂刷新，拉票白热化，听风宫剪辑的宣传直拍霸屏灵网，几家欢喜几家愁' },
  { month: 1, day: 25, title: '文殊·学问祈愿', category: '院', ambience: '考前祈学业，凝霜宫开占星阵为弟子卜考运，藏经阁挤满临时抱佛脚的身影' },
  { month: 1, day: 28, title: '腊味集市', category: '中·宫', ambience: '百味集市年货专场，腊味干货香飘满街，弟子们提着灵兽拖车扫货囤年货' },
  // FEST_FEB
  // ===== 2 月（残冬转初春·期末临近）=====
  { month: 2, day: 2, title: '土用·换季', category: '节', ambience: '季节交替、气血易乱，飞雪宫派发调理软糖，保健室排起长队' },
  { month: 2, day: 3, title: '节分·撒豆', category: '院', ambience: '"鬼在外，福在内"，弟子戴鬼面撒炒豆驱邪，输了的要戴鬼面接受敏感带责弄式惩罚小游戏，满校园的笑闹尖叫' },
  { month: 2, day: 4, title: '立春', category: '节', ambience: '料峭春寒里透出第一缕暖意，梅枝初绽，摄影部外出捕捉早春' },
  { month: 2, day: 8, title: '针供养', category: '院', ambience: '家政社与制服研究社谢旧针、供豆腐，感恩一年缝纫，顺便展示新缝的情趣制服' },
  { month: 2, day: 11, title: '建国祭', category: '院', ambience: '校园放假一日，弟子们各自出游或宅家，仙宫难得清静' },
  { month: 2, day: 14, title: '情人节', category: '西', ambience: '巧克力攻防战全面开打，本命巧克力与义理巧克力之争暗流涌动，百合CP当众互赠甜到齁，暗恋者鼓起勇气递出手作，谪仙宫教做巧克力的课爆满' },
  { month: 2, day: 17, title: '祈年祭', category: '中', ambience: '祈一年丰稔，凝霜宫主持祭仪，邀月宫祈物资供应链顺遂' },
  { month: 2, day: 19, title: '雨水', category: '节', ambience: '春雨绵绵不绝，樱花含苞待放，空气湿润里带着花讯' },
  { month: 2, day: 22, title: '猫之日', category: '西趣', ambience: '撸猫日，饲育委员顾雪酥的高光时刻，灵兽们被撸得咕噜作响，全宫晒猫刷屏' },
  { month: 2, day: 23, title: '天长节', category: '院', ambience: '庆典放假，学院张灯结彩' },
  { month: 2, day: 25, title: '三学期期末考', category: '院', duration: 3, ambience: '通宵苦读的哀鸿遍野，保健室备足提神灵茶，透视眼看牌式作弊法术在考场暗涌，风纪委员严阵以待' },
  { month: 2, day: 28, title: '万花镜·心灵之美榜改选', category: '宫', ambience: '才情、人缘、品性的较量，会长泠幽领衔评议，与形体之美榜的粉丝隔空互掐' },
  // FEST_MAR
  // ===== 3 月（初春·毕业季）=====
  { month: 3, day: 1, title: '早春花信', category: '物', ambience: '梅樱交替，暗香浮动，海边小镇的风开始变软，樱花坡萌出星点粉白' },
  { month: 3, day: 3, title: '上巳·女儿节(雏祭)', category: '中·院', ambience: '曲水流觞叠上日式雏人形摆坛，少女们着华服祈福，桃花酒微醺，甜品与乳汁品鉴会推桃花限定' },
  { month: 3, day: 5, title: '惊蛰', category: '节', ambience: '春雷惊百虫，万物复苏，灵田里的灵植抽芽' },
  { month: 3, day: 8, title: '妇女节', category: '西', ambience: '全女性女儿国最盛大的节日之一，全宫同庆，各殿互赠礼物，邀月宫大摆宴席，处处是姐妹情深的贴贴' },
  { month: 3, day: 12, title: '植树·花祭', category: '院', ambience: '校园植樱绿化日，弟子们合力栽下新樱，许下"来年花开再相见"' },
  { month: 3, day: 14, title: '白色情人节', category: '西', ambience: '回礼日，情人节收到心意的这天要加倍还礼，谁回了谁、回了什么成了全宫八卦焦点' },
  { month: 3, day: 15, title: '毕业式', category: '院', ambience: '樱吹雪中的郑重告别，"第二颗纽扣"的传说让学妹们争抢，学姐的振袖与泪水，放送部含泪直播毕业典礼' },
  { month: 3, day: 17, title: '彼岸·春分前', category: '中', duration: 7, ambience: '扫墓踏青、思念先人的一周，弟子们供花祭祖，也踏青赏初春' },
  { month: 3, day: 20, title: '春分', category: '节', ambience: '昼夜均分，正是踏青赏樱的好时节，樱花坡渐入盛期' },
  { month: 3, day: 23, title: '霜月赏樱会', category: '宫', duration: 3, ambience: '樱花坡下摆开盛大宴饮，纱裙广袖沾满花瓣，微醺的仙子们贴贴嬉闹，谪仙宫布置的花灯与舞台在夜里点亮，是一年最唯美的三天' },
  { month: 3, day: 25, title: '春假', category: '院', duration: 6, ambience: '新旧学年之交的长假，弟子们预备修学旅行、抢订温泉旅馆，也有人窝家里补番囤零食' },
  { month: 3, day: 29, title: '结业·送别会', category: '院', ambience: '学年落幕，学妹为学姐办送别会，社团交接印信，几多不舍几多期待' },
  // FEST_APR
  // ===== 4 月（仲春·新学年）=====
  { month: 4, day: 1, title: '愚人节', category: '西', ambience: '整蛊横行的一天，假表白、假八卦、假通知满天飞，风纪委员防不胜防，被整哭的和整人的最后一起笑作一团' },
  { month: 4, day: 3, title: '清明前·寒食', category: '中', ambience: '冷食一日不动烟火，家政社备下各式冷馔，弟子踏青插柳' },
  { month: 4, day: 5, title: '清明', category: '中·节', ambience: '祭扫踏青，柳色青青，弟子供花缅怀，也趁春光郊游放纸鸢' },
  { month: 4, day: 8, title: '入学式·始业式·一学期', category: '院', ambience: '新生怀着忐忑走进樱花坡下的校门，盛大的开学典礼，二年A班重新编班，班主任月曦致辞，新面孔与老同学的相认' },
  { month: 4, day: 8, title: '花祭·浴佛', category: '中', ambience: '以甘茶浴佛祈福，藏经阁开放供弟子借阅古籍，凝霜宫讲经' },
  { month: 4, day: 12, title: '社团招新周', category: '院', duration: 5, ambience: '各社团摆摊使出浑身解数抢新人，制服研究社与双修体式开发部为抢生源明争暗斗，电竞社现场开赛拉人，躺平部只摆张沙发"欢迎躺平"' },
  { month: 4, day: 17, title: '春季健康诊断', category: '院', ambience: '保健室校医叶惊霜的忙季，全校排队体检，量三围也成了万花镜形体榜的隐形前哨' },
  { month: 4, day: 20, title: '谷雨', category: '节', ambience: '雨生百谷，海边小镇烟雨朦胧，灵田灌溉，茶社采新茶' },
  { month: 4, day: 22, title: '地球日', category: '西', ambience: '环保主题日，放送部做减塑企划，弟子们减少快递阵法使用（收效甚微）' },
  { month: 4, day: 25, title: '新生欢迎会', category: '院', ambience: '前辈后辈联谊，各社团展演招牌节目，新生才艺初亮相，学姐们物色可爱学妹' },
  { month: 4, day: 29, title: '黄金周', category: '院·西', duration: 7, ambience: '连休长假，仙宫分成两派：出游党包下海滨温泉狂欢，宅家党囤满零食刷剧打游戏足不出户' },
  // FEST_MAY
  // ===== 5 月（暮春初夏）=====
  { month: 5, day: 1, title: '劳动节', category: '西', ambience: '黄金周高潮，百味集市热闹摆摊，弟子们体验"劳动"摆摊卖手作，邀月宫核算集市流水' },
  { month: 5, day: 3, title: '宪法·新绿', category: '院', ambience: '连休中段，新绿满山，弟子郊游野餐，摄影部外拍' },
  { month: 5, day: 5, title: '端午', category: '中', ambience: '龙舟粽子艾草齐上，云海上摆开赛舟，雄黄灵酒微醺，家政社包各式灵粽，门前挂艾草菖蒲驱邪' },
  { month: 5, day: 5, title: '儿童节(こどもの日)', category: '院', ambience: '鲤鱼旗高高挂起，童心大爆发，躺平部与饲育委员的欢乐日，弟子们重拾童趣游戏' },
  { month: 5, day: 8, title: '世界微笑日', category: '西', ambience: '放送部发起正能量企划，全宫比谁的笑容最治愈，怼脸拍笑容上传灵网' },
  { month: 5, day: 11, title: '母亲节', category: '西', ambience: '康乃馨与感恩，弟子慰问敬爱的师长（月曦、梦清月等），家政老师沐清雨收到满屋鲜花' },
  { month: 5, day: 15, title: '葵祭', category: '院', ambience: '古典祭典巡游，弟子着古装列队，谪仙宫全力操办舞美与服饰，是视觉盛宴' },
  { month: 5, day: 21, title: '小满', category: '节', ambience: '麦粒渐满，初夏微热，灵泉浴池重新热门起来' },
  { month: 5, day: 25, title: '一学期中间考', category: '院', duration: 2, ambience: '考前突击，天台午休成了便当情报交换所，谁的笔记好谁被围，缩地成寸抢座位的暗戏又起' },
  { month: 5, day: 28, title: '万花镜·形体之美榜改选', category: '宫', ambience: '身材塑造军备竞赛，弟子们用霜花雪月华裳精修体态，飞雪宫的丰胸软糖脱销，与心灵之美榜粉丝的隔空互掐再起' },
  { month: 5, day: 30, title: '灵泉同修节', category: '宫', ambience: '浴池边互相涂抹润滑灵液，边泡澡边看新番，体液流转修行的日常在这天格外热烈' },
  // FEST_JUN
  // ===== 6 月（初夏·梅雨）=====
  { month: 6, day: 1, title: '国际儿童节', category: '中·西', ambience: '童趣主题，躺平部顾漫漫的主场，弟子们办怀旧游戏会、吃儿时零食，甜品会推童年限定' },
  { month: 6, day: 6, title: '芒种', category: '节', ambience: '梅雨将至，空气开始黏腻，衣衫贴身，灵泉浴与凉亭成避暑首选' },
  { month: 6, day: 10, title: '时之纪念日', category: '院', ambience: '守时主题日，风纪委员长雪千璃严查迟到早退，迟到者要接受罚站或情色小惩罚' },
  { month: 6, day: 15, title: '父亲节·恩师日', category: '西', ambience: '全女性女儿国无父亲，转为敬长/恩师日，弟子们感念传功授业的仙主与老师' },
  { month: 6, day: 16, title: '修学旅行', category: '院', duration: 4, ambience: '全班包下海滨浴场或温泉旅馆，泳装亮相，夜里挤在一间和室夜谈说心里话，"两人三足""夹水球"等充满肢体摩擦的运动会，温泉里的坦诚相见' },
  { month: 6, day: 20, title: '夏越祓·茅轮', category: '院', ambience: '穿过茅草大轮除去半年积秽，凝霜宫主持净化仪式' },
  { month: 6, day: 21, title: '夏至', category: '节', ambience: '白昼最长的一天，蝉鸣初起，夜晚格外短暂，适合彻夜长谈或狂欢' },
  { month: 6, day: 24, title: '梅雨氛围', category: '物', duration: 3, ambience: '连绵阴雨，弟子们泡在灵泉浴池边看新番边贴贴，湿热的空气里情欲也格外躁动' },
  { month: 6, day: 28, title: '绣球花祭', category: '物', ambience: '雨中绣球盛放，蓝紫成片，摄影部幽兰带队外拍，撑着油纸伞的少女成了最美的画' },
  // FEST_JUL
  // ===== 7 月（盛夏·结业与暑假）=====
  { month: 7, day: 1, title: '半年结·灵网年中榜', category: '宫', ambience: '上半年万花镜总榜盘点，听风宫发布中期战报，谁是上半年顶流一目了然，粉丝为偶像冲榜刷屏' },
  { month: 7, day: 2, title: '半夏生', category: '节', ambience: '农事节点，家政社备时令补膳，弟子进补消暑' },
  { month: 7, day: 7, title: '七夕·星祭', category: '中·院', ambience: '鹊桥相会叠上日式短册许愿，天文社虞初见带队观星的高光之夜，竹枝挂满写着心愿的彩笺，牛郎织女被改编成百合版在放送部上演' },
  { month: 7, day: 13, title: '盂兰盆·迎火', category: '中·院', duration: 3, ambience: '点迎火祭祖普渡，盆舞在广场跳起，夜里办试胆大会，胆小的弟子吓得扑进同伴怀里' },
  { month: 7, day: 15, title: '中元', category: '中', ambience: '普渡孤魂的一夜，讲鬼故事、放河灯，飞雪宫暗房测试道具时的怪声被传成闹鬼' },
  { month: 7, day: 17, title: '海之日·祗园', category: '院', ambience: '向海祈福，星见丘校园处处能望见海，弟子们到海边净手祈愿，夏日祭氛围渐浓' },
  { month: 7, day: 18, title: '一学期结业式', category: '院', ambience: '成绩单的审判日，几家欢喜几家愁，随即是暑假的自由号角，欢呼声响彻校园' },
  { month: 7, day: 20, title: '暑假开始', category: '院', duration: 5, ambience: '漫长暑假拉开，作业与放纵并存，有人立志逆袭有人开摆，海滨与泳池成了主场' },
  { month: 7, day: 23, title: '大暑', category: '节', ambience: '一年最热之时，冷饮泳池灵泉浴齐上阵，弟子们能不动就不动，凉亭里堆满快乐水' },
  { month: 7, day: 24, title: '土用丑·鳗鱼日', category: '院', ambience: '吃鳗鱼进补消暑，家政社大摆鳗鱼宴，据说能补充"体力"' },
  { month: 7, day: 28, title: '夏日祭·花火大会', category: '院·宫', duration: 2, ambience: '弟子们身着浴衣，捞金鱼、吃屋台小吃、套圈游戏，夜空绽放绚烂烟花，无数告白与初吻发生在花火之下，仙宫也在云海办起盛大夏夜宴' },
  // FEST_AUG
  // ===== 8 月（酷暑·暑假）=====
  { month: 8, day: 1, title: '八朔·夏之感恩', category: '院', ambience: '谢恩访问日，弟子拜访恩师故旧，表达感激' },
  { month: 8, day: 3, title: '灵网夏日直拍季', category: '宫', duration: 3, ambience: '泳装打歌舞台连番上演，听风宫拍摄的滤镜直拍向外输出擦边清凉福利，粉丝经济火爆，小卡与周边热销' },
  { month: 8, day: 7, title: '立秋', category: '节', ambience: '暑气未消而秋意暗生，早晚微凉，蝉鸣里透出一丝萧瑟' },
  { month: 8, day: 11, title: '山之日', category: '院', ambience: '登高避暑，弟子结伴上灵峰，俯瞰云海花海' },
  { month: 8, day: 13, title: '盂兰盆连休', category: '院', duration: 4, ambience: '返乡省亲的长假，弟子多离宫探亲，宫内一时清冷，留守者反而享受难得的独处与幽会' },
  { month: 8, day: 15, title: '中秋', category: '中', ambience: '赏月吃月饼，仙宫在云海之上摆开赏月宴，月色倾泻，"月宫仙子"的对外人设在这夜达到巅峰，对外直播赏月引万人围观' },
  { month: 8, day: 16, title: '五山送火', category: '院', ambience: '点送火送别盆灵，夏之尾声的仪式感，弟子们目送火光心有戚戚' },
  { month: 8, day: 23, title: '处暑', category: '节', ambience: '暑气渐退，昼夜温差拉大，秋的脚步近了' },
  { month: 8, day: 26, title: '残暑见舞', category: '院', ambience: '暑期问候，互寄明信片报平安，也顺便约开学后的玩耍' },
  { month: 8, day: 28, title: '暑假作业地狱', category: '院', duration: 3, ambience: 'deadline临近的集体哀嚎，教室与灵网群里满是互相抄袭、跪求答案的惨状，学霸被团团围住' },
  // FEST_SEP
  // ===== 9 月（初秋·二学期始）=====
  { month: 9, day: 1, title: '始业式·二学期', category: '院', ambience: '晒黑晒白的重逢，暑假回忆分享大会，谁去了哪、谁和谁一起玩成了新八卦，二学期的紧张与期待交织' },
  { month: 9, day: 1, title: '防灾之日', category: '院', ambience: '大型避难演练，葬花宫全员出动维持秩序，认真演练的和趁乱摸鱼的形成对比' },
  { month: 9, day: 8, title: '白露', category: '节', ambience: '露凝而白，秋高气爽，最舒服的时节，弟子们户外活动增多' },
  { month: 9, day: 9, title: '重阳·菊之节', category: '中·院', ambience: '登高赏菊插茱萸，敬老敬长，凝霜宫办菊花宴，弟子为师长祝寿' },
  { month: 9, day: 13, title: '十五夜·观月', category: '院', ambience: '赏月供团子与芒草，与中秋呼应的日式赏月，弟子们对月许愿说悄悄话' },
  { month: 9, day: 15, title: '敬老之日', category: '院', ambience: '敬重长者，弟子们探望资历最老的仙主，听她们讲宗门旧事' },
  { month: 9, day: 19, title: '万花镜·秋季总选举开幕', category: '宫', duration: 5, ambience: '年度最大规模打榜战正式开战，拉票、爆黑料、结盟、反目轮番上演，听风宫的匿名论坛推波助澜，全宫为各自支持的偶像疯狂应援' },
  { month: 9, day: 20, title: '彼岸·秋分前', category: '中', duration: 7, ambience: '扫墓思亲的一周，供彼岸花与牡丹饼，弟子们缅怀之余也赏秋' },
  { month: 9, day: 23, title: '秋分', category: '节', ambience: '昼夜再度均分，彼岸花开成红色的海，秋意正浓' },
  { month: 9, day: 28, title: '体育祭筹备', category: '院', duration: 3, ambience: '穿着体操服的训练如火如荼，各班组建应援团、编排应援舞，暗中较劲，谁的体操服更凸显身材也成了看点' },
  // FEST_OCT
  // ===== 10 月（金秋·校园祭季）=====
  { month: 10, day: 1, title: '国庆·仙宫大庆', category: '中', duration: 3, ambience: '举宫同庆的盛大节日，各殿张灯结彩，邀月宫大摆流水灵宴，长假里出游党与留守党各得其乐，对外直播庆典引灵网围观' },
  { month: 10, day: 8, title: '寒露', category: '节', ambience: '露气转寒，添衣进补，灵泉浴池又成热门，红叶初染' },
  { month: 10, day: 10, title: '体育祭', category: '院', ambience: '万众瞩目的运动盛会，夹水球、两人三足、骑马战轮番上演，体操服下的肢体摩擦与娇喘让看台沸腾，应援团嘶吼助威，胜负之外更多是青春的热汗与贴贴' },
  { month: 10, day: 13, title: '秋收·味觉之秋', category: '物·院', ambience: '丰收时节，家政社沐清雨带队做时令料理，栗子红薯南瓜齐上，"贴秋膘"的甜蜜负担' },
  { month: 10, day: 15, title: '学园祭/文化祭', category: '院·宫', duration: 3, ambience: '全校最盛大的三天，二年A班开女仆咖啡厅、隔壁班办鬼屋，谪仙宫倾力操办舞台演出与舞美，各社团摆摊献艺，对外开放日引来无数目光，是一年中最喧闹绚烂的校园盛典' },
  { month: 10, day: 20, title: '惠比寿·商売繁盛', category: '中', ambience: '财运祭，邀月宫盘点账目祈生意兴隆，周边店与外卖阵法生意火爆' },
  { month: 10, day: 23, title: '霜降', category: '节', ambience: '霜始降，红叶满山，海边小镇层林尽染，摄影部的黄金外拍季' },
  { month: 10, day: 25, title: '万花镜·总选举决选之夜', category: '宫', ambience: '年度C位加冕的巅峰之夜，广场LED屏揭晓最终排名，胜者热泪盈眶登顶获定制MV拍摄权，败者不甘落泪，粉丝彻夜狂欢或痛哭，全宫为之沸腾' },
  { month: 10, day: 28, title: '读书之秋·书展', category: '院', ambience: '图书委员竹清清与轻小说同好会苏墨墨联办作品展，藏经阁电子古籍开放借阅，二创同人本暗中流通' },
  { month: 10, day: 31, title: '万圣节', category: '西·院', duration: 2, ambience: 'cosplay盛装与"不给糖就捣蛋"，鬼屋二度营业，制服研究社的情趣扮装大赏惊艳全场，弟子们扮成女巫、恶魔、猫娘穿梭讨糖' },
  // FEST_NOV
  // ===== 11 月（深秋转初冬）=====
  { month: 11, day: 1, title: '寒衣节', category: '中', ambience: '送寒衣祭先人，弟子们焚寄冬衣缅怀，添置冬装迎寒' },
  { month: 11, day: 3, title: '文化之日', category: '院', ambience: '表彰文艺，摄影部幽兰与轻小说同好会办作品展，颁发学园文艺奖，才女们的高光时刻' },
  { month: 11, day: 7, title: '立冬', category: '节', ambience: '冬之始，进补养生，围炉煮茶开季，灵泉浴池蒸腾起白雾' },
  { month: 11, day: 11, title: '光棍·购物节', category: '西·中', ambience: '剁手狂欢日，快递阵法彻底爆仓，官方周边店大促（带体香护手霜、复刻衣物秒空），弟子们疯狂囤货晒单' },
  { month: 11, day: 13, title: '漆祭·工艺日', category: '院', ambience: '手作工艺展示，家政社与制服研究社秀绝活，弟子体验漆器彩绘' },
  { month: 11, day: 15, title: '七五三', category: '院', ambience: '着和服祈成长（宗门转为纪念新入门弟子），学姐带着可爱的新入门弟子参拜合影' },
  { month: 11, day: 22, title: '小雪', category: '节', ambience: '初雪将至，暖炉登场，凉亭里自热火锅飘香，弟子们裹着厚衣贴贴取暖' },
  { month: 11, day: 23, title: '勤劳感恩·丰收祭', category: '院·西', ambience: '感恩收获（对标感恩节），家政社大摆丰收盛宴，火鸡与时蔬满桌，弟子们互道感谢' },
  { month: 11, day: 26, title: '二学期中间考', category: '院', duration: 2, ambience: '寒意里的考场苦战，考后集体放纵，约着去吃火锅泡温泉犒劳自己' },
  { month: 11, day: 28, title: '围炉·锅物开季', category: '物·宫', ambience: '火锅与自热锅正式登场，凉亭玉桌上支起锅子涮起来，弟子们围炉夜话，热气与笑语驱散寒意' },
  // FEST_DEC
  // ===== 12 月（隆冬·年末）=====
  { month: 12, day: 1, title: '岁末灵网大赏筹备', category: '宫', duration: 3, ambience: '年度盘点企划启动，听风宫剪辑年度名场面合集，各殿为年终颁奖预热，回顾这一年的高光与糗事' },
  { month: 12, day: 7, title: '大雪', category: '节', ambience: '大雪纷飞，灵泉浴池热气蒸腾成仙境，弟子们赏雪煮酒，堆雪人打雪仗' },
  { month: 12, day: 8, title: '腊八', category: '中', ambience: '熬腊八粥暖身祈福，家政社大锅熬粥分予全宫，甜咸之争照例上演' },
  { month: 12, day: 13, title: '正月事始·大扫除', category: '院', ambience: '辞旧迎新的大扫除，各殿与教室全员出动除尘，翻出一堆被遗忘的旧物与黑历史' },
  { month: 12, day: 14, title: '义士祭', category: '院', ambience: '忠义主题日，葬花宫弟子演武纪念，风纪委员们的高光' },
  { month: 12, day: 17, title: '羽子板市', category: '院', ambience: '年市摆摊，年货采购季开启，弟子们提着灵兽拖车扫购新年装饰与礼物' },
  { month: 12, day: 21, title: '冬至·柚子浴', category: '中·院', ambience: '数九寒天，吃饺子汤圆围坐取暖，灵泉浴池撒满柚子驱寒养颜，一年中黑夜最长的一晚适合彻夜贴贴' },
  { month: 12, day: 23, title: '二学期结业式', category: '院', ambience: '寒假前最后一日，成绩单发放后便是盼望已久的寒假，教室里响起欢呼' },
  { month: 12, day: 24, title: '平安夜', category: '西', ambience: '烛光与期待交织的一夜，弟子们布置圣诞树、备好礼物，情侣们约定平安夜的浪漫，单身者相约热闹取暖' },
  { month: 12, day: 25, title: '圣诞节·圣诞会', category: '西·院', ambience: '圣诞树下交换礼物，班级派对热闹非凡，谁抽到谁的礼物、谁向谁表白，情侣圣诞的甜与单身圣诞的酸同时上演，家政社的圣诞大餐管够' },
  { month: 12, day: 28, title: '岁末灵网大赏', category: '宫', ambience: '年度万花镜总榜盖棺定论，年度顶流加冕，"年度名场面""年度CP""年度黑马"逐一颁奖，全宫盛装出席这场年终盛典' },
  { month: 12, day: 29, title: '御用纳·封印', category: '院', ambience: '年终封笔，各社团停止活动进入休整，风纪委员也难得松弛' },
  { month: 12, day: 30, title: '除夕·大晦日', category: '中·院', ambience: '守岁到天明，邀月宫备下丰盛年夜饭，全宫围坐辞旧岁，跨年钟声在云海回荡，一年最后的团圆与狂欢，烟花预备迎接新岁' },
];

// ==================== 查询 API ====================
// 某名义月日当天生效的节日（含跨多天覆盖到的）。
export function festivalsOn(month: number, day: number): Festival[] {
  const out: Festival[] = [];
  for (const f of FESTIVALS) {
    const dur = f.duration || 1;
    if (f.month === month && f.day <= day && day < f.day + dur) { out.push(f); continue; }
    // 跨月覆盖（如 duration 让节日延伸到下月）——按线性日序号判断
    if (dur > 1) {
      const start = (f.month - 1) * 30 + (f.day - 1);
      const cur = (month - 1) * 30 + (day - 1);
      const rel = ((cur - start) % 360 + 360) % 360;
      if (rel > 0 && rel < dur) out.push(f);
    }
  }
  return out;
}
export function festivalTitleOn(month: number, day: number): string | undefined {
  return festivalsOn(month, day)[0]?.title;
}
// ±N 天窗口（token 隔离）：以当前线性日序号为中心，取前后 N 天内的节日（取模绕年）。
//   当天/进行中的给全详情；窗口内其余只给名称+日期。返回结构化，供注入组装。
export function festivalsInWindow(curMonth: number, curDay: number, radius = 30): {
  today: Festival[];
  windowed: { month: number; day: number; title: string; category: string; offset: number }[];
} {
  const cur = (curMonth - 1) * 30 + (curDay - 1);
  const today = festivalsOn(curMonth, curDay);
  const todaySet = new Set(today.map(f => f.title));
  const windowed: { month: number; day: number; title: string; category: string; offset: number }[] = [];
  for (const f of FESTIVALS) {
    if (todaySet.has(f.title)) continue;
    const start = (f.month - 1) * 30 + (f.day - 1);
    // 绕年最短带符号距离
    let diff = ((start - cur) % 360 + 360) % 360;
    if (diff > 180) diff -= 360;
    if (Math.abs(diff) <= radius) windowed.push({ month: f.month, day: f.day, title: f.title, category: f.category, offset: diff });
  }
  windowed.sort((a, b) => a.offset - b.offset);
  return { today, windowed };
}

