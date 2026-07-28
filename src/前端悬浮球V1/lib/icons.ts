// 前端悬浮球V1 — 图标库
// 把原 FontAwesome class 名（fa-X fa-Y）映射到 Lucide 同义 SVG。
// 用法：iconHtml('fa-heart') / iconHtml('fa-solid fa-heart') / iconHtml('heart') 都行
//
// 状态栏内部用 jQuery + innerHTML 拼字符串，必须把 SVG 作为字符串塞进模板；
// lucide-static 的 export 是 named const，每个图标是一个完整 `<svg>...</svg>` 字符串。

import {
  Heart, Flame, Sparkles, Droplets, Droplet,
  MapPin, MapPinOff, MapPinned,
  Compass, Flag, Crown, Gem,
  SlidersHorizontal, RotateCw, RotateCcw,
  CloudMoon, CloudSun, Sun, Moon, Clock, CalendarDays,
  Box, ScrollText, Shirt, WandSparkles, Package,
  TriangleAlert, Check, X, Plus, Search,
  ChartPie, UserRound, Camera, Trash2, Images, Tag,
  HandHeart, Hand, MessageCircle, Crosshair,
  Smile, Cake, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  BookOpen, Book, Info, AlignLeft, ArrowLeft, Eye,
  Power, SquarePen, Save, Download, Upload, HeartPulse, ShieldQuestion,
  Puzzle, FolderPlus,
  ToggleLeft, ToggleRight, Pen, Star, StarHalf, Copy,
  Sprout, Link2, Filter, SquareCheck, Boxes, Tags,
  // 新建储藏间类别图标选择器需要的新增映射
  // 注意：lucide-static 没有 Ring/HatWizard（返回 undefined 会让 inner 崩溃），
  // 用 Disc 代替戒指、GraduationCap 代替巫师帽。
  Trophy, Sword, Zap, ShieldHalf, Music, Palette, Feather,
  Disc, GraduationCap, KeyRound, Coins, Map as MapIcon, Gift,
  Leaf,
  // 储藏间"按标签配发"按钮图标（fa-share）
  Share2, Users,
  // 补全缺失的 fa 图标映射（之前渲染为 th-ico-missing 白色方块）
  // ⚠️ 这里的每个名字都必须是 lucide-static 真实存在的 export，**不能靠 inner() 的 undefined 防御兜底**：
  //    prod 构建（--mode production）开 usedExports，webpack 出的是逐名导入 `import{A as t, B as e, ...}`，
  //    浏览器在模块**解析期**就校验具名 export，缺一个直接 SyntaxError → 整个模块一行都不执行（悬浮球整体消失）。
  //    dev 构建出的是命名空间导入 `import * as NS`，缺名只是 undefined，inner() 才有机会兜底成空串。
  //    也就是说「缺名只掉一个图标」这个结论仅在 dev 成立。改图标名后跑 `npx tsx tmp/check_icons.ts` 或直接 prod 试编。
  Menu, FileInput, CircleCheckBig, CheckSquare, CircleCheck,
  Clipboard, History, FolderOpen, Inbox, Layers,
  Lightbulb, LocateFixed, Send, Square,
  // 全量 Lucide 迁移收尾——补全最后 11 个缺失 fa 图标(消除残留 th-ico-missing 白方块)
  // lucide-static 无 CircleHalf / Stream：前者改用 Contrast(半明半暗圆)，后者复用下方已导入的 Waves。
  Contrast, CircleX, Grip, Cpu, Plug,
  Snowflake, Baseline, Wind,
  // 补全初始化管理/写入写出/激活监控/导出条目/锁定等白方块图标
  ArrowRight, ArrowDownToLine, LogIn, LogOut, ArrowUp,
  CircleDot, CircleArrowDown, CircleAlert, CircleMinus,
  GitCompareArrows, MessageCircleMore, Database, Workflow,
  Eraser, FileOutput, FileArchive, GripHorizontal,
  IdCard, Image as ImageIcon, Lock, PenTool,
  Play, SatelliteDish, LoaderCircle, Stethoscope,
  Syringe, ArchiveRestore, Contact,
  // 世界套件：世界按钮(globe) + 桌面/APP 图标
  Globe, Smartphone, Settings, ArrowRightLeft, MessagesSquare,
  // 世界套件：记忆中心四层图标
  Brain, Pin, StickyNote, Shrink,
  // 微信复刻：补全语音/转账/通话/通讯录/提醒/回复等缺失图标(消除空白方框)
  Phone, Video, Reply, Bell, Mic, Volume2, HandCoins, BookUser,
  // 小剧场/微博 app 图标 + 微博/世界模块剩余白方块
  Drama, RadioTower, ThumbsUp, UserPlus, Repeat2, Forward, PhoneOff, AudioWaveform,
  // 补全 9 个未映射 fa 图标（B站 tab/小红书收藏/演化看板等渲染为 th-ico-missing 白方块）
  // 全部 lucide-static 官方导出名；运行期走 CDN +esm，缺失会被 inner() 安全降级为空串（不崩、不显白块）。
  Bookmark, Clapperboard, Gauge, House, List, Tv, UnlockKeyhole, UserPen, Wallet,
  // B站游戏分区图标（gamepad）
  Gamepad2,
  // 小红书重构——种草好物/商家号/达人认证/催更喇叭/求助等
  ShoppingBag, ShoppingCart, Store, BadgeCheck, Megaphone, CircleHelp, Plane, Dumbbell, PawPrint, Utensils, Sofa,
  // 浏览器重构：资讯/网页正文/网址导航宫格
  Newspaper, FileText, LayoutGrid,
  // 日历/日记重构：日历勾选/纪事流/私密锁开/心情轨迹/咖啡
  CalendarCheck, CalendarClock, LockOpen, TrendingUp, Coffee, NotebookPen,
  // 淘宝：电商分区/规格/物流/钱包/直播等图标
  Truck, Laptop, Cloud, Wine, FlaskConical, Banknote, ShoppingBasket,
  SprayCan, Apple, Cookie, Baby, BriefcaseMedical, Footprints, PersonStanding,
  Shield, Receipt, Heart as HeartIcon, Theater,
  // 美团：碗食/骰子/客服耳机/骑手头盔/电动车/团购券（补全白方块）
  Soup, Dices, Headphones, HardHat, Bike, Ticket,
  // 全局生态分区（性别）
  Venus, VenusAndMars,
  // 美团食材买菜分区（fa-carrot 之前未映射→白方块）
  Carrot,
  // 全量补齐白方块（论坛加精/投票/悬赏/共识入书 + 演化惦记 + 各 app 食材/医疗/匿名等）
  // 全部为 lucide-static 官方导出名；CDN 解析若个别缺失，inner() 会降级为空串（不崩、不白块）。
  Award, Vote, BookPlus, Mail, Fish, Gavel, Scissors, AtSign, VenetianMask,
  Hourglass,
  // 喜马拉雅（听书电台）：音频/播放器/电台图标（全部为 lucide-static 官方导出名；
  // inner() 对缺失导出降级为空串不崩，开工前会跑 scan_icons.py + 目视核对白块）。
  Pause, SkipForward, SkipBack, Radio, Podcast, Repeat, Shuffle, ListMusic,
  AudioLines, Waves, Ear, Timer, Sunrise, MountainSnow, CirclePlay, CirclePause,
  BedDouble, Disc3, Rss, Waypoints, MessageSquareHeart,
  // 工作台（造物机）：新增图标（lucide-static 官方导出名）。
  Hammer, Shapes, Sailboat, Building2,
} from 'lucide-static';

function inner(svg: string | undefined): string {
  // 防御：若某个 lucide 图标名拼错/不存在（返回 undefined），不要让整个模块加载崩溃
  // （历史上 Ring/HatWizard 就因不存在导致悬浮球整体消失）。返回空串 → 渲染为缺失占位。
  if (!svg || typeof svg !== 'string') return '';
  const m = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  return m ? m[1].trim() : '';
}

// fa → lucide 映射
const ICONS: Record<string, string> = {
  // 数值 / 状态
  heart:                      inner(Heart),
  'fire-flame-curved':        inner(Flame),
  sparkles:                   inner(Sparkles),
  water:                      inner(Droplets),
  droplet:                    inner(Droplet),
  droplets:                   inner(Droplets),
  'face-grin-wide':           inner(Smile),
  'face-smile':               inner(Smile),
  'triangle-exclamation':     inner(TriangleAlert),
  check:                      inner(Check),
  circle:                     '',                       // fa-circle 多用于点缀，渲染空
  'heart-circle-plus':        inner(HeartPulse),

  // 位置 / 场景
  'map-pin':                  inner(MapPin),
  'location-dot':             inner(MapPinned),
  compass:                    inner(Compass),
  'wand-magic-sparkles':      inner(WandSparkles),
  'wand-magic':               inner(WandSparkles),
  crown:                      inner(Crown),
  gem:                        inner(Gem),
  flag:                       inner(Flag),
  'flag-checkered':           inner(Flag),                  // 连续剧标记完结
  'hand-point-up':            inner(Hand),                  // 论坛催更
  'puzzle-piece':             inner(Puzzle),
  puzzle:                     inner(Puzzle),
  'treasure-chest':           inner(Package),
  box:                        inner(Box),
  'folder-plus':              inner(FolderPlus),

  // 衣物
  vest:                       inner(Shirt),
  shirt:                      inner(Shirt),
  'hand-holding-heart':       inner(HandHeart),
  'child-reaching':           inner(Hand),

  // 物品 / 技能
  'box-open':                 inner(Box),
  scroll:                     inner(ScrollText),
  'scroll-text':              inner(ScrollText),
  bag:                        inner(Box),

  // 头像 / 身份
  'user-astronaut':           inner(UserRound),
  user:                       inner(UserRound),
  'camera-retro':             inner(Camera),
  camera:                     inner(Camera),
  trash:                      inner(Trash2),
  'trash-2':                  inner(Trash2),

  // 世界 / 时间
  clock:                      inner(Clock),
  'calendar-days':            inner(CalendarDays),
  'calendar-plus':            inner(CalendarDays),         // 铺入节日历
  school:                     inner(GraduationCap),        // 学院身份
  mask:                       inner(VenetianMask),         // 声望暗巷
  sun:                        inner(Sun),
  moon:                       inner(Moon),
  'cloud-sun':                inner(CloudSun),
  'cloud-moon':               inner(CloudMoon),

  // 动作按钮
  sliders:                    inner(SlidersHorizontal),
  'sliders-horizontal':       inner(SlidersHorizontal),
  'rotate-right':             inner(RotateCw),
  'rotate-cw':                inner(RotateCw),
  rotate:                     inner(RotateCcw),
  'rotate-ccw':               inner(RotateCcw),
  'arrow-left':               inner(ArrowLeft),
  alignleft:                  inner(AlignLeft),
  'align-left':               inner(AlignLeft),
  comment:                    inner(MessageCircle),
  'message-circle':           inner(MessageCircle),
  'message-square':           inner(MessageCircle),
  'circle-info':              inner(Info),
  info:                       inner(Info),
  eye:                        inner(Eye),
  crosshairs:                 inner(Crosshair),
  target:                     inner(Crosshair),
  tag:                        inner(Tag),
  question:                   inner(ShieldQuestion),
  'shield-question':          inner(ShieldQuestion),
  cake:                       inner(Cake),
  'cake-candles':             inner(Cake),
  'pen-to-square':            inner(SquarePen),
  'pen-square':               inner(SquarePen),
  edit:                       inner(SquarePen),
  'floppy-disk':              inner(Save),
  save:                       inner(Save),
  download:                   inner(Download),
  upload:                     inner(Upload),
  power:                      inner(Power),
  'power-off':                inner(Power),
  images:                     inner(Images),
  'map-pin-off':              inner(MapPinOff),

  // 卡片工具栏
  'toggle-on':                inner(ToggleRight),
  'toggle-off':               inner(ToggleLeft),
  toggle:                     inner(ToggleRight),
  'toggle-right':             inner(ToggleRight),
  'toggle-left':              inner(ToggleLeft),
  pen:                        inner(Pen),
  'pen-nib':                  inner(Pen),
  'pen-fancy':                inner(Pen),
  star:                       inner(Star),
  'star-half':                inner(StarHalf),
  'star-half-stroke':         inner(StarHalf),
  copy:                       inner(Copy),

  // 初始数据 / 关联 / 批量
  seedling:                   inner(Sprout),
  sprout:                     inner(Sprout),
  link:                       inner(Link2),
  'link-2':                   inner(Link2),
  'link-simple':              inner(Link2),
  filter:                     inner(Filter),
  'square-check':             inner(SquareCheck),
  'check-double':             inner(SquareCheck),
  boxes:                      inner(Boxes),
  'box-archive':              inner(Boxes),
  tags:                       inner(Tags),

  // 运行时导入
  'cloud-arrow-down':         inner(Download),
  'cloud-download':           inner(Download),

  // 箭头 / 折叠
  'chevron-down':             inner(ChevronDown),
  'chevron-up':               inner(ChevronUp),
  'chevron-left':             inner(ChevronLeft),
  'chevron-right':            inner(ChevronRight),

  // 关闭 / 添加
  xmark:                      inner(X),
  x:                          inner(X),
  close:                      inner(X),
  plus:                       inner(Plus),

  // 搜索
  search:                     inner(Search),
  'magnifying-glass':         inner(Search),

  // 统计
  'chart-pie':                inner(ChartPie),

  // 世界书
  'book-open':                inner(BookOpen),
  book:                       inner(Book),

  // 新建储藏间类别图标选择器（fa → lucide）
  trophy:                     inner(Trophy),
  // 补全 API 按钮分组 + 主播徽章用到的缺失图标（复用已导入 lucide，避免白方块）
  medal:                      inner(Trophy),                // 徽章/勋章
  'heart-circle-bolt':        inner(HeartPulse),            // 万粉徽章
  'money-bill-trend-up':      inner(Coins),                 // 吸金徽章
  hashtag:                    inner(Tag),                   // 超话广场
  'reply-all':                inner(Forward),               // 微博回响
  sword:                      inner(Sword),
  bolt:                       inner(Zap),
  zap:                        inner(Zap),
  'shield-halved':            inner(ShieldHalf),
  shield:                     inner(ShieldHalf),
  music:                      inner(Music),
  palette:                    inner(Palette),
  feather:                    inner(Feather),
  'feather-pointed':          inner(Feather),               // 诗词朗诵(喜马分类)
  ring:                       inner(Disc),
  'hat-wizard':               inner(GraduationCap),
  key:                        inner(KeyRound),
  'key-round':                inner(KeyRound),
  coins:                      inner(Coins),
  map:                        inner(MapIcon),
  gift:                       inner(Gift),
  leaf:                       inner(Leaf),

  // 储藏间"按标签配发"按钮（fa-share）
  share:                      inner(Share2),
  'share-nodes':              inner(Share2),
  users:                      inner(Users),
  'user-group':               inner(Users),

  // 补全缺失 fa 图标（原 th-ico-missing 白色方块）
  bars:                       inner(Menu),
  menu:                       inner(Menu),
  'file-import':              inner(FileInput),
  'file-down':                inner(FileInput),
  'file-up':                  inner(FileInput),
  'arrows-to-dot':            inner(LocateFixed),   // lucide 无同名，用定位十字近似
  fire:                       inner(Flame),
  'check-circle':             inner(CircleCheckBig),
  'circle-check':             inner(CircleCheck),
  'check-square':             inner(CheckSquare),
  clipboard:                  inner(Clipboard),
  'clock-rotate-left':        inner(History),
  'folder-open':              inner(FolderOpen),
  inbox:                      inner(Inbox),
  'info-circle':              inner(Info),
  'layer-group':              inner(Layers),
  lightbulb:                  inner(Lightbulb),
  'location-crosshairs':      inner(LocateFixed),
  'paper-plane':              inner(Send),
  square:                     inner(Square),
  times:                      inner(X),
  'trash-can':                inner(Trash2),

  // 全量 Lucide 迁移收尾——最后 11 个 fa 图标(消除残留 th-ico-missing 白方块)
  'circle-half-stroke':       inner(Contrast),      // 外观设置圆角风格图标(lucide 无 CircleHalf, 用 Contrast 半明半暗圆)
  'circle-xmark':             inner(CircleX),       // 圆中叉(关闭/移除)
  grip:                       inner(Grip),          // 拖拽手柄
  microchip:                  inner(Cpu),           // 芯片(API 源等)
  plug:                       inner(Plug),          // 插头(连接)
  'rotate-left':              inner(RotateCcw),     // 逆时针旋转(与 rotate 同义)
  snowflake:                  inner(Snowflake),     // 雪花(玻璃模糊)
  stream:                     inner(Waves),         // 流(流式开关)(lucide 无 Stream, 用 Waves)
  'text-height':              inner(Baseline),      // 字号(外观设置)
  wind:                       inner(Wind),          // 风(背景流光薄雾)

  // 补全初始化管理/写入写出/激活监控/卡片导出·锁定 等白方块图标
  'arrow-right':              inner(ArrowRight),            // 写出/初始→实时 箭头
  'arrow-up':                 inner(ArrowUp),               // 记忆：中期并入主线
  'object-group':             inner(Boxes),                 // 记忆：条目合并
  'text-width':               inner(Baseline),              // 记忆：字数上限
  'arrow-down-to-line':       inner(ArrowDownToLine),       // 读入/下载到本地
  'arrow-right-to-bracket':   inner(LogIn),                 // 进入/导入
  'arrow-right-from-bracket': inner(LogOut),                // 退出/导出
  'circle-dot':               inner(CircleDot),             // 单选/状态点
  'circle-down':              inner(CircleArrowDown),       // 下载/收起
  'circle-exclamation':       inner(CircleAlert),           // 警告/差异
  'circle-minus':             inner(CircleMinus),           // 移除/仅一侧
  'code-compare':             inner(GitCompareArrows),      // 双向同步检测
  'comment-dots':             inner(MessageCircleMore),     // 聊天/对话
  database:                   inner(Database),              // 初始化管理 菜单图标
  'diagram-project':          inner(Workflow),              // 关联图/演化
  eraser:                     inner(Eraser),                // 清除
  'file-export':              inner(FileOutput),            // 卡片导出条目
  'file-zipper':              inner(FileArchive),           // 整包导出导入
  'grip-lines':               inner(GripHorizontal),        // 拖拽手柄(横)
  'id-card':                  inner(IdCard),                // 角色档案/联系人
  image:                      inner(ImageIcon),             // 图片生成
  lock:                       inner(Lock),                  // 锁定卡片
  'pen-ruler':                inner(PenTool),               // 编辑初始卡片(可视化)
  play:                       inner(Play),                  // 执行/运行
  'satellite-dish':           inner(SatelliteDish),         // 激活监控
  spinner:                    inner(LoaderCircle),          // 加载中(配 fa-spin 旋转)
  stethoscope:                inner(Stethoscope),           // 诊断/体检
  syringe:                    inner(Syringe),               // 注入
  'trash-can-arrow-up':       inner(ArchiveRestore),        // 备份恢复
  'user-tie':                 inner(Contact),               // 人格/联系人
  // 世界套件
  globe:                      inner(Globe),                 // 「世界」按钮 + 论坛/世界
  'globe-asia':               inner(Globe),
  mobile:                     inner(Smartphone),            // 手机桌面
  'mobile-screen':            inner(Smartphone),
  'mobile-screen-button':     inner(Smartphone),
  'tablet-screen-button':     inner(Smartphone),            // 平板外壳主题（复用手机图标）
  tablet:                     inner(Smartphone),
  gear:                       inner(Settings),              // 套件设置
  gears:                      inner(Settings),
  'arrow-right-arrow-left':   inner(ArrowRightLeft),        // APP 间跳转/双向
  'right-left':               inner(ArrowRightLeft),
  comments:                   inner(MessagesSquare),        // 群聊/多人对话
  // 世界套件：记忆中心
  brain:                      inner(Brain),                 // 记忆中心
  thumbtack:                  inner(Pin),                   // 关键设定（钉住）
  'note-sticky':              inner(StickyNote),            // 短期记忆/小结
  compress:                   inner(Shrink),                // 压缩长期
  // 微信复刻：补全缺失图标映射（之前渲染为空白方框 th-ico-missing）
  microphone:                 inner(Mic),                   // 发语音
  'volume-high':              inner(Volume2),               // 语音条播放
  'money-bill-transfer':      inner(HandCoins),             // 转账
  phone:                      inner(Phone),                 // 语音通话
  video:                      inner(Video),                 // 视频通话
  reply:                      inner(Reply),                 // 引用回复
  bell:                       inner(Bell),                  // 提醒
  'address-book':             inner(BookUser),              // 通讯录
  hand:                       inner(Hand),                  // 拍一拍
  // 小剧场/微博 app 图标 + 剩余白方框补全
  'masks-theater':            inner(Drama),                 // 小剧场 app 图标
  'tower-broadcast':          inner(RadioTower),            // 微博 app 图标
  weibo:                      inner(RadioTower),            // 微博 brand
  'earth-asia':               inner(Globe),                 // 世界
  'book-bookmark':            inner(Book),                  // 书签
  'people-group':             inner(Users),                 // 群组
  'user-plus':                inner(UserPlus),              // 加好友/关注
  'user-slash':               inner(ArchiveRestore),        // 无联系人占位（设置）
  'hand-pointer':             inner(Hand),                  // 请选择占位（记忆中心）
  'up-right-from-square':     inner(Forward),               // 打开外部/跳转（设置）
  'thumbs-up':                inner(ThumbsUp),              // 点赞
  retweet:                    inner(Repeat2),               // 转发
  forward:                    inner(Forward),               // 转发/前进
  'phone-slash':              inner(PhoneOff),              // 挂断
  'wave-square':              inner(AudioWaveform),         // 语音波形
  // 补全 9 个未映射 fa 图标
  bookmark:                   inner(Bookmark),              // 小红书收藏 tab
  clapperboard:               inner(Clapperboard),          // B站空态/视频
  'gauge-high':               inner(Gauge),                 // 演化推演速度/看板
  house:                      inner(House),                 // B站首页 tab
  list:                       inner(List),                  // 列表
  tv:                         inner(Tv),                    // B站 app 图标
  gamepad:                    inner(Gamepad2),              // B站游戏分区
  'unlock-keyhole':           inner(UnlockKeyhole),         // 破限/解锁
  'user-pen':                 inner(UserPen),               // 编辑资料/角色
  wallet:                     inner(Wallet),                // 蜜语钱包/充值
  // 微信重构：补全缺失映射（避免渲染白方块）
  ellipsis:                   inner(Menu),                  // 更多/聊天信息
  'bell-slash':               inner(Bell),                  // 消息免打扰
  'user-shield':              inner(ShieldHalf),            // 隐私
  'users-gear':               inner(Users),                 // 群成员管理
  'list-check':               inner(SquareCheck),           // 选择条目
  'user-minus':               inner(UserPlus),              // 移出群聊
  'id-badge':                 inner(IdCard),                // 个人主页
  'arrow-right-long':         inner(ArrowRight),            // 触发对照箭头
  // 糖心重构：补全缺失映射（避免渲染白方块）
  broom:                      inner(Eraser),                // 清空直播间
  'circle-stop':              inner(Square),                // 下播
  'door-open':                inner(LogIn),                 // 进场
  film:                       inner(Tv),                    // 画面出图
  'quote-left':               inner(MessageCircle),         // 下播寄语引用
  receipt:                    inner(Clipboard),             // 消费账单
  'shield-heart':             inner(ShieldHalf),            // 粉丝团/守护
  // 小红书重构图标（种草经济/生态分层/商单/活动/分区）
  'bag-shopping':             inner(ShoppingBag),           // 种草好物卡/收藏夹灵感板
  'cart-shopping':            inner(ShoppingCart),          // 求链接/加购
  'cart-plus':                inner(ShoppingCart),
  shop:                       inner(Store),                 // 商家号
  store:                      inner(Store),
  'circle-check-big':         inner(BadgeCheck),            // 达人/认证标
  'badge-check':              inner(BadgeCheck),            // 蓝V/认证
  certificate:                inner(BadgeCheck),            // 品牌认证
  bullhorn:                   inner(Megaphone),             // 催更/薯条投流
  megaphone:                  inner(Megaphone),
  'circle-question':          inner(CircleHelp),            // 避雷求助帖
  'circle-help':              inner(CircleHelp),
  plane:                      inner(Plane),                 // 旅行分区
  'plane-departure':          inner(Plane),
  dumbbell:                   inner(Dumbbell),              // 健身分区
  'paw':                      inner(PawPrint),              // 萌宠分区
  paws:                       inner(PawPrint),
  // 工作台（造物机）模板/工具图标 + 记忆节奏仪表
  hammer:                     inner(Hammer),                // 工作台品牌
  shapes:                     inner(Shapes),                // 模板管理
  sailboat:                   inner(Sailboat),              // 载具/舟车
  'tower-observation':        inner(Building2),             // 组织/门派
  cube:                       inner(Box),                   // 自定义模板兜底
  'dice-three':               inner(Dices),                 // 重roll
  'envelope-open-text':       inner(Mail),                  // 信件/文书
  'house-chimney':            inner(House),                 // 建筑/居所
  gauge:                      inner(Gauge),                 // 记忆节奏
  utensils:                   inner(Utensils),              // 美食分区
  'fork-knife':               inner(Utensils),
  couch:                      inner(Sofa),                  // 家居分区
  sofa:                       inner(Sofa),
  // 浏览器重构：补全浏览器特有图标（防白方块）
  newspaper:                  inner(Newspaper),             // 世界资讯 tab
  'file-lines':               inner(FileText),              // 网页正文/点开网页
  'file-text':                inner(FileText),
  'table-cells-large':        inner(LayoutGrid),            // 网址导航宫格
  'table-cells':              inner(LayoutGrid),
  // 日历/日记重构
  calendar:                   inner(CalendarDays),
  'calendar-day':             inner(CalendarCheck),
  'calendar-check':           inner(CalendarCheck),
  'calendar-clock':           inner(CalendarClock),
  'lock-open':                inner(LockOpen),
  'chart-line':               inner(TrendingUp),
  'trending-up':              inner(TrendingUp),
  'mug-hot':                  inner(Coffee),
  coffee:                     inner(Coffee),
  'notebook-pen':             inner(NotebookPen),
  // 淘宝
  truck:                      inner(Truck),
  laptop:                     inner(Laptop),
  cloud:                      inner(Cloud),
  'wine-glass':               inner(Wine),
  flask:                      inner(FlaskConical),
  'money-bill-wave':          inner(Banknote),
  'basket-shopping':          inner(ShoppingBasket),
  'spray-can-sparkles':       inner(SprayCan),
  'apple-whole':              inner(Apple),
  'cookie-bite':              inner(Cookie),
  baby:                       inner(Baby),
  'kit-medical':              inner(BriefcaseMedical),
  'shoe-prints':              inner(Footprints),
  socks:                      inner(Footprints),
  'person-dress':             inner(PersonStanding),
  'wand-sparkles':            inner(WandSparkles),
  handcuffs:                  inner(Link2),
  'pump-soap':                inner(Droplets),
  dragon:                     inner(Flame),
  // 美团
  'bowl-food':                inner(Soup),
  dice:                       inner(Dices),
  headset:                    inner(Headphones),
  'helmet-safety':            inner(HardHat),
  motorcycle:                 inner(Bike),
  ticket:                     inner(Ticket),
  venus:                      inner(Venus),
  'venus-mars':               inner(VenusAndMars),
  carrot:                     inner(Carrot),
  // 全量补齐白方块（新导入 + 复用近义）
  award:                      inner(Award),                 // 论坛加精/精华墙
  // 世界态新维度
  'ranking-star':             inner(Trophy),                // 万花镜打榜榜单
  'hourglass-half':           inner(Hourglass),             // 时令倒计时
  'square-poll-vertical':     inner(Vote),                  // 投票帖
  'hand-holding-dollar':      inner(HandCoins),             // 悬赏求助
  'book-medical':             inner(BookPlus),              // 共识入书/同步世界书
  bullseye:                   inner(Crosshair),             // ta 惦记的事/目标
  at:                         inner(AtSign),                // @提及
  envelope:                   inner(Mail),                  // 私信/邮件
  fish:                       inner(Fish),                  // 海鲜/分区
  gavel:                      inner(Gavel),                 // 吧主治理/裁决
  scissors:                   inner(Scissors),              // 裁剪/编辑
  'user-secret':              inner(VenetianMask),          // 马甲/匿名身份
  'users-slash':              inner(Users),                 // 无成员/拉黑
  'comment-slash':            inner(MessageCircle),         // 禁言/关评
  'people-arrows':            inner(ArrowRightLeft),        // 换位/对线
  'arrows-turn-to-dots':      inner(LocateFixed),           // 汇聚/定位
  'hand-sparkles':            inner(Sparkles),              // 净手/仙气
  'heart-pulse':              inner(HeartPulse),            // 心率/健康
  spa:                        inner(Leaf),                  // 养生/SPA
  bandage:                    inner(BriefcaseMedical),      // 创可贴/医疗
  pills:                      inner(BriefcaseMedical),      // 药丸/医疗
  'temperature-high':         inner(Gauge),                 // 高温/热度
  'bottle-droplet':           inner(Droplet),               // 瓶装液体
  'wine-bottle':              inner(Wine),                  // 酒瓶
  'mug-saucer':               inner(Coffee),                // 咖啡/茶
  'ice-cream':                inner(Cake),                  // 冰淇淋/甜品
  'bowl-rice':                inner(Soup),                  // 米饭/主食
  'drumstick-bite':           inner(Utensils),              // 鸡腿/荤食
  'pepper-hot':               inner(Flame),                 // 辣椒/川菜
  'wheat-awn':                inner(Sprout),                // 麦子/农产
  'mortar-pestle':            inner(FlaskConical),          // 药膳滋补/丹方(饭饭品类)
  // 饭饭新增品类图标（复用已导入的安全图标，避免白块）
  'fire-burner':              inner(Flame),                 // 火锅
  'shrimp':                   inner(Fish),                  // 早茶点心/海鲜
  'plate-wheat':              inner(Utensils),              // 自助盛宴
  'pizza-slice':              inner(Utensils),              // 披萨西餐(美团分类)
  'hot-tub-person':           inner(Droplets),              // 洗浴汗蒸(美团分类)
  'umbrella-beach':           inner(Sun),                   // 泳装度假(淘宝分类)
  'graduation-cap':           inner(GraduationCap),         // JK制服(淘宝分类)
  'screwdriver-wrench':       inner(Package),               // 家装建材(淘宝分类)
  'car':                      inner(Package),               // 汽车用品(淘宝分类)
  // 喜马拉雅（听书电台）音频图标
  headphones:                 inner(Headphones),            // 喜马品牌/听
  'headphones-simple':        inner(Headphones),
  podcast:                    inner(Podcast),               // 播客/电台
  pause:                      inner(Pause),                 // 暂停
  'circle-play':              inner(CirclePlay),            // 播放
  'circle-pause':             inner(CirclePause),           // 暂停(圆)
  'forward-step':             inner(SkipForward),           // 下一首
  'backward-step':            inner(SkipBack),              // 上一首
  'forward-fast':             inner(SkipForward),
  'backward-fast':            inner(SkipBack),
  repeat:                     inner(Repeat),                // 循环
  shuffle:                    inner(Shuffle),               // 随机/调频盲盒
  'list-music':               inner(ListMusic),             // 声音歌单/播放列表
  radio:                      inner(Radio),                 // 电台/收音机
  'record-vinyl':             inner(Disc3),                 // 唱片/专辑
  'compact-disc':             inner(Disc3),                 // 专辑封面/播放器碟片
  disc:                       inner(Disc3),
  waveform:                   inner(AudioLines),            // 声波
  'wave-sine':                inner(Waves),
  'ear-listen':               inner(Ear),                   // ASMR/耳语/贴耳
  ear:                        inner(Ear),
  stopwatch:                  inner(Timer),                 // 定时关闭/计时
  'timer':                    inner(Timer),
  'mountain-sun':             inner(MountainSnow),          // 修真引导音/冥想
  sunrise:                    inner(Sunrise),               // 晨间电台
  bed:                        inner(BedDouble),             // 哄睡陪听（覆盖旧 Sofa 映射为更贴切的床）
  rss:                        inner(Rss),                   // 追更订阅
  'microphone-lines':         inner(Mic),                   // 连麦热线/主播口播
  waypoints:                  inner(Waypoints),             // 声音树洞/漂流
  'message-heart':            inner(MessageSquareHeart),    // 点歌留言/声音礼物
  'boxes-stacked':            inner(Boxes),                 // 堆叠箱/库存
  'plug-circle-check':        inner(Plug),                  // 插头已连
};
void HeartIcon; void ShoppingCart; void MessageCircle; void Theater; void Receipt; void Shield;

/**
 * 返回一个 Lucide SVG 字符串。
 * @param name 接受 'fa-heart' / 'fa-solid fa-heart' / 'heart' / 'fa-xxx fa-heart' 等
 * @param size 像素，缺省 1em（与原 <i> 等大）
 */
export function iconHtml(name: string, size: number | string = '1em'): string {
  if (!name) return '';
  // 取最后一段作为 key
  const parts = name.trim().split(/\s+/);
  let key = parts[parts.length - 1] || '';
  if (key.startsWith('fa-')) key = key.slice(3);
  const body = ICONS[key];
  if (body === undefined) {
    return `<svg class="th-ico th-ico-missing" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>`;
  }
  if (body === '') return ''; // circle 之类刻意不渲染
  return `<svg class="th-ico th-ico-${key}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/**
 * 字符串后处理：把所有 `<i class="fa-X fa-Y"></i>` 自动换成 lucide SVG。
 * 状态栏里所有 innerHTML 模板字面量都过一遍。
 */
export function stripFa(s: unknown): string {
  if (typeof s !== 'string' || !s) return s as string;
  return s.replace(
    /<i\s+class="(fa-(?:solid|regular|brands|light|thin)\s+fa-[a-z0-9-]+)"\s*><\/i>/gi,
    (_, cls) => iconHtml(cls),
  );
}
