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
  // 反馈9：新建储藏间类别图标选择器需要的新增映射
  // 注意：lucide-static 没有 Ring/HatWizard（返回 undefined 会让 inner 崩溃），
  // 用 Disc 代替戒指、GraduationCap 代替巫师帽。
  Trophy, Sword, Zap, ShieldHalf, Music, Palette, Feather,
  Disc, GraduationCap, KeyRound, Coins, Map as MapIcon, Gift,
  Leaf,
  // 反馈7：储藏间"按标签配发"按钮图标（fa-share）
  Share2, Users,
  // P4fix3 反馈2：补全缺失的 fa 图标映射（之前渲染为 th-ico-missing 白色方块）
  // 全部为 lucide-static 官方命名；若个别版本无该 export，inner() 的 undefined 防御会返回空串（不会崩、不显示白方块）
  Menu, FileInput, CircleCheckBig, CheckSquare, CircleCheck,
  Clipboard, History, FolderOpen, Inbox, Layers,
  Lightbulb, LocateFixed, Send, Square,
  // P10 §10.8:全量 Lucide 迁移收尾——补全最后 11 个缺失 fa 图标(消除残留 th-ico-missing 白方块)
  CircleHalf, CircleX, Grip, Cpu, Plug,
  Snowflake, Stream, Baseline, Wind,
  // 批次8 反馈2：补全初始化管理/写入写出/激活监控/导出条目/锁定等白方块图标
  ArrowRight, ArrowDownToLine, LogIn, LogOut,
  CircleDot, CircleArrowDown, CircleAlert, CircleMinus,
  GitCompareArrows, MessageCircleMore, Database, Workflow,
  Eraser, FileOutput, FileArchive, GripHorizontal,
  IdCard, Image as ImageIcon, Lock, PenTool,
  Play, SatelliteDish, LoaderCircle, Stethoscope,
  Syringe, ArchiveRestore, Contact,
  // 世界套件 P0：世界按钮(globe) + 桌面/APP 图标
  Globe, Smartphone, Settings, ArrowRightLeft, MessagesSquare,
  // 世界套件 P0 Step2：记忆中心四层图标
  Brain, Pin, StickyNote, Shrink,
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

  // 卡片工具栏（§10.6）
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

  // 初始数据 / 关联 / 批量（§10.6 Build 2）
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

  // 运行时导入(§10.6 Build 2)
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

  // 反馈9：新建储藏间类别图标选择器（fa → lucide）
  trophy:                     inner(Trophy),
  sword:                      inner(Sword),
  bolt:                       inner(Zap),
  zap:                        inner(Zap),
  'shield-halved':            inner(ShieldHalf),
  shield:                     inner(ShieldHalf),
  music:                      inner(Music),
  palette:                    inner(Palette),
  feather:                    inner(Feather),
  ring:                       inner(Disc),
  'hat-wizard':               inner(GraduationCap),
  key:                        inner(KeyRound),
  'key-round':                inner(KeyRound),
  coins:                      inner(Coins),
  map:                        inner(MapIcon),
  gift:                       inner(Gift),
  leaf:                       inner(Leaf),

  // 反馈7：储藏间"按标签配发"按钮（fa-share）
  share:                      inner(Share2),
  'share-nodes':              inner(Share2),
  users:                      inner(Users),
  'user-group':               inner(Users),

  // P4fix3 反馈2：补全缺失 fa 图标（原 th-ico-missing 白色方块）
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

  // P10 §10.8:全量 Lucide 迁移收尾——最后 11 个 fa 图标(消除残留 th-ico-missing 白方块)
  'circle-half-stroke':       inner(CircleHalf),   // 外观设置圆角风格图标
  'circle-xmark':             inner(CircleX),       // 圆中叉(关闭/移除)
  grip:                       inner(Grip),          // 拖拽手柄
  microchip:                  inner(Cpu),           // 芯片(API 源等)
  plug:                       inner(Plug),          // 插头(连接)
  'rotate-left':              inner(RotateCcw),     // 逆时针旋转(与 rotate 同义)
  snowflake:                  inner(Snowflake),     // 雪花(玻璃模糊)
  stream:                     inner(Stream),        // 流(流式开关)
  'text-height':              inner(Baseline),      // 字号(外观设置)
  wind:                       inner(Wind),          // 风(背景流光薄雾)

  // 批次8 反馈2：补全初始化管理/写入写出/激活监控/卡片导出·锁定 等白方块图标
  'arrow-right':              inner(ArrowRight),            // 写出/初始→实时 箭头
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
  // 世界套件 P0
  globe:                      inner(Globe),                 // 「世界」按钮 + 论坛/世界
  'globe-asia':               inner(Globe),
  mobile:                     inner(Smartphone),            // 手机桌面
  'mobile-screen':            inner(Smartphone),
  'mobile-screen-button':     inner(Smartphone),
  gear:                       inner(Settings),              // 套件设置
  gears:                      inner(Settings),
  'arrow-right-arrow-left':   inner(ArrowRightLeft),        // APP 间跳转/双向
  'right-left':               inner(ArrowRightLeft),
  comments:                   inner(MessagesSquare),        // 群聊/多人对话
  // 世界套件 P0 Step2：记忆中心
  brain:                      inner(Brain),                 // 记忆中心
  thumbtack:                  inner(Pin),                   // 关键设定（钉住）
  'note-sticky':              inner(StickyNote),            // 短期记忆/小结
  compress:                   inner(Shrink),                // 压缩长期
};

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
