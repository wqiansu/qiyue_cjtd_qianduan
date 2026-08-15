# 前端悬浮球V1 · 开发说明（README）

> 面向**开发者 / AI 接手者**的架构说明。给玩家看的使用指南见同目录 [使用文档.md](使用文档.md)。
> 逐轮实施日志与「下一步」不在这里 —— 单一可信源是 [PROGRESS.md](PROGRESS.md) + git log。本文件只讲**长期不变的架构与约定**。

## 这是什么

「此间天地」酒馆助手悬浮球 —— 一个挂在 SillyTavern 主页面上的**状态栏 + 平板世界套件**前端。

- **世界观**：现代仙侠 × 高维仙宫 × 日式校园恋爱喜剧的全女性百合日常单元剧（设定原文在 `角色卡工作室/此间天地/世界书/`，非本目录）。
- **两大部件**：
  1. **状态栏**（悬浮球展开的窗口）—— 读角色卡 MVU 变量，可视化主角/NPC 的属性、状态、穿着、物品、技能、世界信息；带就地编辑 + 变量审核 + 世界书资产管理。
  2. **世界套件**（顶栏「世界」按钮 → 平板桌面）—— 20 个自注册 app（微信/微博/糖心/演化/论坛…），各自用 AI 生成内容，走注入/世界书回写反哺正文。

## 工程类型（重要）

本目录**只有 `index.ts`，没有顶层 `index.html`** —— 按项目规则（`.cursor/rules/脚本.mdc`）它是**脚本项目**，不是前端界面项目。

- 状态栏 DOM 不在脚本自己的 iframe 里，而是由 `index.ts` 用 jQuery 挂到**酒馆主页面 `window.parent.document.body`** 上（`.cursor/rules/脚本.mdc`「组件是对酒馆网页的补充」模式）。
- 样式靠 `@util/script` 的 `teleportStyle()` 把本 iframe `<head>` 的 webpack 注入样式复制到主页面 `<head>`。
- `status-bar.html` 用 `?raw` 导入成字符串，运行时抽 `<body>` 注入面板；它**不是**打包入口 HTML。

## 构建与验证

在**项目根**执行（不是本目录）：

```bash
pnpm build         # 生产打包（production，压缩）——★ 交付产物用这个，与上游教程和 CI 一致
pnpm build:dev     # = webpack --mode development，未压缩，仅本地调试用
pnpm watch         # 开发监听
npx tsc --noEmit -p tsconfig.json   # 类型检查（0 容忍）
pnpm check:cdn     # 校验 prod 产物里的 CDN 具名导入在 CDN 上真实存在（build 之后跑）
```

- **交付产物一律 `pnpm build`（production）**，与上游教程和 CI 一致。
- **两种 mode 对「导入名写错」的容错完全不同，这是 prod 唯一需要提防的地方**：prod 开 `usedExports` → 逐名导入 `import{A as t,…}` → 浏览器在**模块解析期**校验具名 export，缺一个直接 SyntaxError，**整个模块一行都不执行**；dev 出命名空间导入 `import * as NS`，缺名只是 `undefined`，运行时防御能兜住。所以「缺个图标只掉一个图标」只在 dev 成立，**改 CDN 外部依赖的导入名后必须跑一次 `pnpm build` + `pnpm check:cdn` 并实测导入**。
- **两种 mode 都走 transpileOnly，不报「漏 export」类错误**；抽取模块 / 改 export 后**必须**另跑 `tsc --noEmit` 查 TS2305/TS2306。
- 产物是单个 `dist/前端悬浮球V1/index.js`（prod ~4.8MB；dev ~24MB 未压缩）。**AI 无法代为导入酒馆**，UI 行为改动需用户手动导入产物实测。
- 远程导入（需先 `git push` 触发 CI 重打包，仓库 `wqiansu/qiyue_cjtd_qianduan`）：
  ```js
  import 'https://testingcf.jsdelivr.net/gh/wqiansu/qiyue_cjtd_qianduan@main/dist/%E5%89%8D%E7%AB%AF%E6%82%AC%E6%B5%AE%E7%90%83V1/index.js';
  ```

## 依赖打包策略（time-bomb 警告）

webpack 把大部分包**外部化到未锁版本的 CDN**（`webpack.config.ts` 的 externals）：`https://testingcf.jsdelivr.net/npm/${request}/+esm`。名字含 `vue`/`pixi`/`react` 的包才进 bundle（DefinePlugin 能剥掉 Vue 编译期 flag），其余走裸 CDN。

- **后果**：代码没动却「突然报错」时，先怀疑某个外部化依赖的 CDN 无锁版本更新了。历史事故：`createApp(Shell).use(createPinia())` 把 pinia 外部化到 CDN，其 `+esm` 构建带裸 `__VUE_PROD_DEVTOOLS__` → 浏览器直接 `ReferenceError` → 整个悬浮球加载失败。修复=删掉未使用的 pinia（详见下「踩坑档案」）。
- **推论**：本项目**不用 pinia**（`index.ts` 只 `createApp(Shell)`，无 `.use()`），尽管项目规则模板推荐 pinia。状态一律走自研 localStorage store（见下）。

## 目录结构

```text
src/前端悬浮球V1/
├── index.ts               # 脚本入口：$(()=>{ createApp(Shell) 挂到 parent.body + teleportStyle })
├── Shell.vue              # 悬浮球 + 可拖拽缩放窗口外壳（唯一的 Vue 组件）；内部宿主一个 div 交给命令式状态栏
├── status-bar.html        # 状态栏静态骨架（?raw 导入，抽 <body> 注入）
├── status-bar.css         # 单主题「糖果粉」全量 CSS（全 .th-* / .thw-* 前缀，逾万行）
├── status-bar-init.ts     # 状态栏主调度：渲染主角/NPC/世界信息 + 编辑模式 + 弹窗系统 openModal/openModal2 + 顶层 export
├── lib/                   # 数据层 / 工具（不碰 DOM 的纯逻辑优先放这）
│   ├── tavern-api.ts      # 酒馆助手 API 封装：window 优先 → getRoot()(=parent) 兜底；getMvu/safeGetVariables/世界书…
│   ├── dom-utils.ts       # DOM 工具 + 环境单例（__doc/__body/qs/qs2/portal…）；作用于 parent.document
│   ├── icons.ts           # FontAwesome 类名 → Lucide SVG 字符串映射（innerHTML setter 拦截自动替换）
│   ├── config.ts          # 纯常量：属性表/NPC 指标/头像色/managed 类别/主面板破限默认词
│   ├── managed-store.ts   # 地点/事件/DLC/储藏间 数据层（三层：实时卡片 ⟷ 初始卡片 ⟷ 世界书）
│   ├── variable-review.ts # 变量变化审核 + 快照系统（防递归 guard）
│   └── world/             # ★ 世界套件共享底座（见下「世界套件」）
└── modules/               # 状态栏各弹窗 / 面板（命令式，挂 parent.document）
    ├── npc-detail.ts hover-tip.ts managed-modal.ts stash-modal.ts tag-manager.ts …
    ├── api-settings.ts appearance-settings.ts prompt-settings.ts init-manager.ts …
    └── world/             # ★ 20 个世界 app（各自 registerWorldApp 自注册）
```

## 两套彼此隔离的体系（改一边别碰另一边）

项目里有**两套独立的 API / 破限 / 提示词**，长期反复强调不要交叉：

| | 主面板（状态栏工具） | 世界套件（平板 app） |
|---|---|---|
| API 预设 | `_th_api_presets_v1`（api-settings.ts） | `_th_world_api_*`（world-api.ts） |
| 破限 | `config.AI_JAILBREAK_DEFAULT`（只 ai-summarize 用） | 每 app 自己的 `<app>.jailbreak`（ai-chat 用） |
| 生成入口 | ai-summarize 等 | `lib/world/ai-chat.ts` 的 `chatGenerate` |

`ai-chat.ts` **从不 import** `config` 的破限。改主面板 AI 总结时别动世界，反之亦然。

## 状态栏（读角色卡变量 → 可视化）

数据源是角色卡的 **MVU `stat_data`**（`Mvu` 框架，见 `.cursor/rules/mvu变量框架.mdc`）。关键路径与代码里不显然的坑：

- **变量读取**：`readData()` 先读 message 作用域 `stat_data`，读不到回退 chat 作用域。走 `safeGetVariables` / `Mvu.getMvuData` 双兜底（`tavern-api.ts`）。
- **主角键选取**（`getUK`，`status-bar-init.ts`）：主角 key **不是固定 `user`**。MVU 常在 message 作用域写一个空壳 `{{user}}`（有属性但全 0），若「取第一个非占位符键」会选错空壳 → 表现为「状态栏读不到变量」。故按**真实数据量打分**选主角（物品/技能/衣物条数 + 非零属性）。改这里前先 MCP 实测 `stat_data` 形状，别猜（详见下「踩坑档案」）。
- **NPC**：`getNPCs(d)` 读 `d.NPC` → `[{name,info}]`；字段 `是否在场 / 状态 / 当前穿着衣物 / 拥有物品 / 拥有技能`。
- **就地编辑**：编辑模式下写回走 `saveData` → `collectStatDataChange`（进变量审核队列，用户可同意/拒绝）。
- **渲染**：`render()` 用 `stableRenderKey`（JSON.stringify 比对）分 world/user/npc 三段缓存，避免全量重绘；数字用 gsap CountUp 滚动。

## 世界套件（`lib/world/` + `modules/world/`）

### app 自注册

各 app 模块底部 `registerWorldApp({ id, name, icon, accent, order, open, unread?, wbKeys? })`（`world-store.ts`）。桌面壳 `world-app.ts` 只**副作用 import** 各 app + 读注册表渲染图标网格，**不直接调用**各 app（避免循环依赖）。当前注册 20 个（19 功能 app + settings）：

```text
微信10 演化20 小剧场30 论坛40 微博50 糖心60 通话80 B站90
淘宝/小红书100 美团/日历110 饭饭/日记120 浏览器/喜马130 最右140 记忆150 工作台160 设置999
```
> 注：淘宝/小红书、美团/日历等同 order 是历史遗留，桌面用 order 升序排列，同值按插入序。

### 共享底座（`lib/world/`）

| 文件 | 职责 |
|---|---|
| `world-store.ts` | 所有 `_th_world_*` localStorage 读写 + 套件全局配置（comfyui/记忆阈值/性别/主题）+ app 注册表 + 整包导出 key 汇总 |
| `ai-chat.ts` | **所有 app 共用的生成流** `chatGenerate({system,user,jsonSchema?,jailbreak?,qualityBlocks?})`；底层 `generateRaw` + `ordered_prompts`，绕开 RP 预设 |
| `world-prompts.ts` | 可编辑提示词模板注册中心 `registerPromptTemplate`/`renderPrompt`；自研模板引擎 `fillTemplate`（`{{key}}` 正则替换）+ 本地宏展开 `expandLocalMacros` |
| `prompt-kit.ts` | 共享破限工厂 `buildJailbreak()` + 写作质感块 + 场景尾组合 |
| `worldbook.ts` | 世界书读写 `listWorldbookEntries`/`buildInjectFromKeys`/`resolveWbRefsByName`；条目 key = `book::entry` |
| `wb-picker.ts` | 世界书条目**复选**器（长期要求：一律复选，不单选） |
| `inject-plan.ts` | 注入系统：片段化 `registerInjectPlan` + 封套 + 两种去向（写世界书 / 注入输入框） |
| `wb-sync.ts` | app 信息回写角色卡主世界书（强制禁递归 prevent_incoming/outgoing） |
| `api-plan.ts` / `world-api.ts` | 套件独立 API 预设 + 每 app 批量额度 |
| `memory.ts` | 三层压缩记忆 + 角色记忆池（按 contactId 跨 app 共享） |
| `auto-registry.ts` | 「每 N 楼自动…」统一注册表 + 全局急停 autoStop |
| `ui-kit.ts` | 内置玻璃弹窗 `thToast/thConfirm/thPrompt/thAlert`（**禁**浏览器原生 alert/confirm/prompt 与 toastr） |
| `phone-shell.ts` | 平板机身外壳 + 可拖拽 |

### 两条世界书注入链路（都要做，别只做一半）

1. **世界书条目 → app**（喂设定进生成）：`wb-picker` 复选 → app 的 `wbKeys()` 取值器 → `chatGenerate` 集中 `buildInjectFromKeys` 注入 system。
2. **app → 角色卡世界书**（沉淀信息，正文可读）：`wb-sync` 把产出写成世界书条目。

> **MVU 铁律**（用户定案）：世界套件**不写 MVU 变量**。沉淀只走「写世界书条目」或「注入聊天框」两种。读变量（`getVariables` 读 `NPC.是否在场` 等）不受影响，只禁「写」。

### 设置 / 世界书写入 / 自动触发（各 app 统一）

- **设置骨架**：16 app 设置接入 `modules/world/settings-scaffold.ts`，命名/图标/顺序在 `SEG_META` 单点定义。规范段序：读取上下文 → 写入管理 → 自动触发 →〔内容玩法段〕→ 功能提示词 → 生成额度 → 生态浓度 → 外观 → 记忆与数据。两种形态：全 `scaffoldViewHtml`（标准三栏）/ hybrid（保留各自 topbar，只用 `scaffoldNavHtml`）。
- **世界书写入入口已合并到一处**：各 app 设置「注入正文」的 `injectPlanPanelHtml(appId)`（每片段选去向 floor/worldbook + 立即同步 + 管理已写条目）；激活策略/位置/深度折叠进它底部。`bindWbSyncPanel`/`bindWbSyncPanelChange` 仍必须每 app 派发（别因移除独立面板就删）。
- **自动触发统一注册表**：`auto-registry.ts` 收拢各 app「每 N 楼自动…」；各 app 模块末尾 `registerAutoAgent({...})`，`maybeAutoTrigger` 开头统一过 `shouldAutoTrigger()` 全局急停闸（`WorldConfig.autoStop`）。

## 硬约束（改代码前必读，违反=白屏/丢事件/裁剪）

- **跨窗口陷阱**：脚本跑在无沙盒 iframe，但状态栏 DOM 挂在 **parent 窗口**。inline `onclick` 在 parent 执行、模块 `addEventListener` 在 iframe 执行 → **所有交互必须用 data 属性 + iframe 内事件委托**，不用 inline onclick。读全局接口一律 `window` 优先 → `getRoot()`（=parent）兜底。
- **命令式 innerHTML + 弹窗 `openModal2`，不引 Vue**（唯一 Vue 是 `Shell.vue` 外壳）。弹窗堆叠用 **revive 回调重渲染**（innerHTML 快照会丢事件监听）。
- **二级弹窗 portal 到 body**：世界壳等 `.th-modal-overlay-2` 在 setup 时被移出 wrapper、挂到 parent body，以逃出层叠上下文。查壳自身用 `qs2()`，查壳内内容用 `qs()`。细节见 PROGRESS.md §4。
- **图标**：新增 `fa-*` 类名要在 `icons.ts` 登记（import Lucide PascalCase 名 + ICONS 表加 kebab key），否则渲染成白方块。交付前跑图标自检 `python scripts/scan_icons.py`（项目根执行）。
- **单主题**：只有「糖果粉」，**不加 dark mode**。**PC 端设计，不做移动端/响应式**。
- **CJK 在 Edit 工具里匹配脆弱** → 用 ASCII 锚点编辑；Write/Edit 超 50 行分段写。

## 提示词长期要求（每个 app 都要遵守）

详见 PROGRESS.md §6。要点：

- 每个 app 必有 `<app>.jailbreak`，拼在该 app 所有 AI 生成的 system 最前。
- **提示词通用化**：具体设定（宫名/角色名/地点）不写死进 prompt，从**绑定世界书**读取注入。除世界演化族外**不得出现卡专名**。
- **只做正向指引**，不写负面禁令（「没绑定就退回中性发挥」而非「禁止套用某卡设定」）。
- **禁酒馆黑话进提示词正文**（世界书/角色卡/楼层/破限这些是机制内部称呼，AI 收不到）；**禁 AI 痕迹写法**（别把给开发者的说明当注释塞进发给 AI 的正文）。
- 输出走**严格 JSON 契约**（本项目 JSON 解析，不抄 `<tag>` 文本格式）。

## 写手人格「月轻轻」（可选破限，默认开）

`lib/world/world-writer-persona.ts`（存 `_th_world_writer_persona_v1 = {on, overrides}`）。**默认开**（存档没写过 `on` 就视为开；用户显式关过才尊重）。开启后把「宅女作家月轻轻」人格锚定破限拼进**每个世界 app 生成之前/之后**。

- **分段结构**（`config.GEKKA_WRITER_PERSONA_SEGMENTS`，按 `role`×`pos` 分段）：
  - head 段（拼在 app 破限之前，伪造「已入戏」的角色轮替）：h1 身份锚定(system) → h2 甲方确认(user) → h3 身份自证(assistant) → h5 魔法情书含 `{{random}}`(system) → h6 情书回信(assistant)。
  - append 段（拼在 `user_input` 之后，靠 recency 压审查）：ta1 抗干扰执行铁律(system) → ta3 抗注入宣言(system) → ta2 起笔确认(assistant)。
- **对标月轻轻 SD 预设的破甲**：预设是绕**真实 chat history** 前后的角色三明治（main/nsfw/甲方/身份自证 在前，jailbreak/多渠道增强/起笔 在后，`squash_system_messages:false`）。我们用 `generateRaw.ordered_prompts` 复刻同样的角色/格式/头尾语义，但**锚点是 `user_input` 而非 chat_history**（世界 app 单发、不带 RP 楼层），这是刻意取舍。
- **⚠️ append 段兼容 JSON 铁律**：世界 app 大量走 `json_schema`。append 段只能用 system/assistant **伪造「已答应工作」的上下文**，**绝不要求模型往输出里额外吐内容**（预设那套逼输出「无欲无求」口号 + 强制 `<thinking>` 会破 JSON，故 ta3 已改成内化守约、不外吐）。
- **破限措辞一律正向**（世界套件全 app 通用，用户强反馈）：绝不写「你不是 AI／卸载 AI 身份／扮演／严禁输出『作为AI…』」这类负向句——会强化 AI 自我认知、削弱人格锚定、出戏。只做正向身份肯定（「你此刻就是〔某身份〕本人，稳稳待在情境里」）。
- **身份锚互斥**：开写手人格时，app 破限里「你就是角色本人」的第二重身份宣告被 `downgradeJailbreakForPersona` 降级为「服从上位写手人格」，避免两个身份锚打架。
- **⚠️ 语境隔离**：以上正向原则只管**世界套件 app 破限**。`预设工作室/月轻轻生图SD*.json` 是独立导入酒馆的生图预设（另一条工作线），用户明确要那边照抄 Izumi 的硬/负向措辞——**别拿这套改那些 json**。

## 踩坑档案（历史真实事故，改前必看）

这些是反复踩过、定位成本高的坑，浓缩自历史反馈。改到相关处先读对应条。

- **依赖突然报错先查 CDN**：代码没动却报错，先怀疑外部化到无锁 CDN 的依赖版本变了（pinia 的裸 `__VUE_PROD_DEVTOOLS__` 事故）。非你的产物。
- **状态栏读不到变量 → 是 `getUK` 选错主角键**：MVU 在 message 作用域常写空壳 `{{user}}`（属性全 0）。`getUK` 按真实数据量打分选主角，不是「取第一个非占位符键」。变量类 bug **先 MCP 实测 `stat_data` 形状再下结论，别读代码猜**（历史误判多次）。
- **app 绑定世界书「不生效」不是注入时序问题**：真因是 builder 没接到每一条生成路径（另有一个默认关的独立总闸 `useWorldbook`，现已废除，改 key 驱动：勾了条目就注入）。**断言注入生效前，确认它真的接到了「每一条」`chatGenerate` 调用点**，别只看机制对不对。现方案是 `registerAppWbKeys` + `chatGenerate` 集中无条件注入。
- **死开关成片**：世界套件历史遗留大量「UI 有开关、store 也存、但生成路径从不读」的死配置（误导玩家+开发）。断言某开关生效前，grep 它的 `data-*` / store key，确认**写入点↔消费点都连通**。死配置要么接线、要么删，别留着误导。
- **注入片段默认去向是 floor（写输入框）不是 worldbook**：「同步世界书写 0 条但预览有内容」不是坏了——是勾了片段没改去向，停在 floor。先确认去向 mode。
- **变量审核只记叶子**：`variable-review.ts` 的 `walk()` 任一侧是容器就下钻，只有两侧都是基元才记一条 diff（否则容器整块被当一条 diff、双计数）。
- **不赌酒馆宏替换**：状态栏未完全挂载酒馆，`generateRaw` 是否对 `ordered_prompts` 做 substituteParams 无文档。破限/system 里的 `{{user}}`/`{{random::}}` 一律用自研 `expandLocalMacros` 发送前本地展开。
- **prod 打包整体不显示 = CDN 外部依赖的具名导入写错了（不是 mode 本身的问题）**：报 `SyntaxError: … does not provide an export named 'X'` 时，`X` 在那个包里根本不存在。prod 开 `usedExports` → 逐名导入 → 浏览器在**模块解析期**校验每个具名 export，缺一个直接 SyntaxError，**整个模块一行都不执行**（所以是整体消失，不是掉一个图标）；dev 的命名空间导入让缺名只是 `undefined`，被运行时防御吞掉。**别把「dev 能跑」当成导入名正确的证据**——假名字能潜伏很久，一换 prod 就炸。
  - **自动防线**：[`scripts/check_cdn_imports.mjs`](../../scripts/check_cdn_imports.mjs)（`pnpm check:cdn`）从 prod 产物正则抓出所有 `import{…}from'https://…'`，fetch 各 CDN 的 `+esm` 解析其 `export{…}` 逐一比对，缺名报错退出 1。基线：4 个依赖 263 个导入名全部存在（lucide-static 256、@floating-ui/dom 5、jsonrepair 1、gsap 1）。**`pnpm build` 之后跑一次**，别靠肉眼。（Node 默认 ESM loader 不能 `import 'https://…'`，故走 fetch + 解析。）
  - mode 差异（`webpack.config.ts` minimizer 分支）：prod = terser 压缩 + `mangle`（仅保留 `_`/`toastr`/`YAML`/`$`/`z`）+ `devtool:'source-map'`（额外产出 `.map`）；dev = `beautify` + `compress:false` + `mangle:false` + `eval-source-map`（内联，不出 `.map`）。
- **CI 会把仓库里的 dist 重打包覆盖掉**：[bundle.yaml](../../.github/workflows/bundle.yaml) 在 push 到 `main` 且改动不只 dist（`paths-ignore: dist/**`）时触发，先 `rm -rf dist` 再 `pnpm install && pnpm build`，然后 `[bot] bundle` 提交回仓库。所以**仓库/jsdelivr 上的 dist 恒为 CI 的 prod 产物**，本地提交的那份 push 后保不住（本地文件不受影响）。本地也用 prod 后两边一致，不再有差异。
- **抽取模块后必跑 `tsc --noEmit`**：两种 mode 都走 transpileOnly，漏 `export` 不报错（运行时变 `undefined` 崩溃）。tsc 现在 0 容忍。
- **「丰富化所有提示词」先只读审计**：本项目绝大多数提示词已是 gold standard，盲改会劣化。很多看似 THIN 的「无契约」其实是按设计的注入片段（一行壳，体在代码里拼）。派子代理审计定位真 THIN 再精准补。

## 接手一个新会话时

1. 读 [PROGRESS.md](PROGRESS.md)（单一可信源，尤其 §4 硬约束 + §6 长期要求）。
   - **若这轮涉及地图功能**，直接读 `src/前端悬浮球V1/lib/world/map-*.ts` 与 `modules/world/map-modal.ts`（地图唯一的正文注释在代码里，无独立设计文档）。
2. 读 `@types/function/{generate,inject,worldbook,variables,chat_message}.d.ts` + `@types/iframe/exported.mvu.d.ts`；用某接口前先 grep 它的签名，别凭记忆。
3. `ls src/前端悬浮球V1/{lib,modules}/{,world/}` 确认结构。
4. 改完 `npx tsc --noEmit`（0 容忍）+ `pnpm build`（production，交付产物）；UI 行为让用户导入 `dist/前端悬浮球V1/index.js` 实测；回滚走 git。
5. 上面的「踩坑档案」是历史高成本 bug 的浓缩，改到相关处先看对应条。

> `预设工作室/` 下的生图 SD 提示词预设是**另一条工作线**，与本前端无关，不在此文档范围。
