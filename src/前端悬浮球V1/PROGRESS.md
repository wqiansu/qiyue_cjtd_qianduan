# 前端悬浮球V1 · 状态与下一步

> **单一可信源**。新会话接手先读完本文件 → 读 `@types/` 关键类型 → `ls src/前端悬浮球V1/{lib,modules}/` 确认结构,再动手。
> 本文件只保留「必需的地基 + 已实现功能清单 + 接下来要做的『世界』按钮计划」。历史批次的详细规格/实施日志已清理(代码即真相;批次摘要在 memory)。

---

## 0. 当前结论(新会话先看)

| 维度 | 信息 |
|---|---|
| **项目** | `src/前端悬浮球V1/` — 此间天地酒馆助手悬浮球状态栏 |
| **来源** | 从 `src/0615悬浮球/`(已验收稳定版)复制;两项目独立 webpack 入口,互不影响,0615 不动 |
| **打包** | `pnpm build:dev`(项目根目录执行) |
| **产物** | `dist/前端悬浮球V1/index.js`(用户手动导入酒馆;AI 无法代为导入) |
| **核心约束** | 行为/布局变化需用户拍板;每批 `build` + 用户导入验收 + 可回滚 |
| **回滚** | 无 git(V1 源码 0 文件被跟踪),只能文件备份到 `.backup/<批次>/`(见 §6) |
| **下一步** | 反馈 11/12「世界」按钮 APP 套件 —— 分 P0/P1/P2 三批做(见 §10);**计划 + 7 项决策已固化(§10.11),新会话直接开做 P0** |

### 0.1 正确的变量路径(关键,代码里不显然)
**User 玩家**(userKey 由 `getUserKey(data)` 取,不是固定 'user'):`{userKey}.拥有物品 / 拥有技能 / 状态 / 当前穿着衣物`。
**NPC**(`getNPCs(data)` 返回 `[{name,info}]`):`NPC.{npcName}.拥有物品 / 拥有技能 / 状态 / 当前穿着衣物 / 是否在场`。
主角名提取:第一个非 `user/{{user}}/<user>` 占位符 key 为主角。不要随意重写。

### 0.2 敏感词状态(不要再次中性化)
NPC 数值指标已从外审中性词**还原为原始词**(与 MVU 角色卡变量同名):情欲值/敏感值/羞耻值/高潮次数/被内射次数;hover 标题「亲密记录」;局部变量 orgasm/creampie。当前渠道无外审,**保持原始词,不要中性化**。

---

## 1. 新会话开场清单(按顺序)
1. 全文读本文件。
2. 读酒馆助手类型:`@types/function/{variables,generate,worldbook,inject,chat_message}.d.ts`、`@types/iframe/exported.mvu.d.ts`。用到哪个接口先 grep 它的签名,别凭记忆。
3. `ls src/前端悬浮球V1/{lib,modules}/` 确认结构(见 §3)。
4. 改代码后必跑 `pnpm build:dev`;抽取/改 export 后必跑 `npx tsc --noEmit -p tsconfig.json` 查 TS2304/2305/2306/2459(build:dev 走 transpileOnly **不报漏 export**)。UI 行为需用户重新导入产物实测。
5. 动手前备份到 `.backup/<批次>/`(无 git,§6)。

---

## 2. 数据模型(现有,新功能复用)
```ts
type ManagedItemV2 = {
  desc: string; tags: string[]; order?: number; inject?: string;
  favorite?: boolean; lastEdited?: number; locked?: boolean;
  links?: { locations?: string[]; events?: string[]; dlcs?: string[] };
};
type Tag = { color: string; desc: string; defaultInject?: string };
type ManagedKind = 'location'|'event'|'dlc'
  |'stash-item'|'stash-skill'|'stash-status'|'stash-clothing'
  |'stash-uncategorized'|`stash-custom-${string}`;
// 统一配置用 getStashKindCfg(kind),不要直接 MANAGED_CFG[kind]
type AiPersona = { id: string; name: string; persona: string; builtin: boolean }; // 拼 system 最前,赋 AI 身份
type AiStyle   = { id: string; name: string; systemSuffix: string; builtin?: boolean };
```
- 初始数据条目:`[初始·地点]`/`[初始·事件]`/`[初始·DLC]`/`[初始·储藏间]`/`[初始·关联]`(蓝灯 constant+禁用,避免入上下文)。
- 三层存储(批次7):**实时卡片**(managed-store `_th_*_v2`) ⟷ **初始卡片**(init-cards `_th_init_cards_v1`) ⟷ **世界书 [初始·xxx]**。

---

## 3. 当前文件结构
```text
src/前端悬浮球V1/
├── index.ts / Shell.vue          # webpack 入口 + 悬浮球外壳(球折叠/拖拽/缩放/最大化)
├── status-bar.html               # 状态栏静态模板(?raw 导入)
├── status-bar.css                # 单主题糖果粉,全 .th-* 前缀(~5000 行)
├── status-bar-init.ts            # 主调度 + bindEvents + 轮询 + openModal2/closeModal2 + 顶层全局 export
├── lib/
│   ├── icons.ts                  # Lucide SVG 映射 + stripFa 拦截器(fa→lucide;缺失→白方框)
│   ├── dom-utils.ts              # DOM 工具 + 环境单例(__doc/getter-setter)
│   ├── tavern-api.ts             # 酒馆助手 API 封装层(safeGetWorldbook 等)
│   ├── managed-store.ts          # 实时卡片/tag/stash-kind 数据层 + toggleLock
│   ├── init-cards.ts             # 初始卡片中间层 `_th_init_cards_v1`(7 kind + 关联图)
│   ├── char-book.ts              # 角色卡内嵌世界书读写(getCharData/updateCharacterWith)
│   ├── config.ts                 # 常量:NPC_METRICS/AI_PERSONAS(9)/AI_SUMMARY_PROMPTS/INIT_LS_KEYS
│   ├── preset-env.ts             # 酒馆预设/generate 接口兜底封装 + resolveGenerateApiConfig
│   ├── prompt-registry.ts        # 提示词注册表(内置 override + registerExtra 接口预留)
│   ├── ai-summary-schema.ts      # AI 总结 json_schema 构造 + normalizeItems
│   ├── ai-summary-store.ts       # 风格(16)/人格 CRUD + 任务方案 + 风格激活
│   ├── ai-snapshots.ts           # AI 注入快照回滚 `_th_ai_snapshots_v1`
│   └── variable-review.ts        # 变量审核/快照数据层
├── modules/
│   ├── managed-modal.ts          # location/event/dlc 总览+编辑+关联(最大)
│   ├── stash-modal.ts / stash-io.ts   # 储藏间 modal / 导入导出+初始数据
│   ├── tag-manager.ts / wb-inspector.ts / npc-detail.ts / hover-tip.ts / item-skill-grid.ts
│   ├── appearance-settings.ts / api-settings.ts       # 外观 / API+预设设置面板
│   ├── init-manager.ts / init-visual-editor.ts        # 初始化管理三层看板 / 卡片可视化编辑
│   ├── links-init.ts             # 关联图 [初始·关联] 读写
│   ├── ai-summarize.ts           # AI 总结注入主面板(任务池/分桶/重roll/流式)
│   ├── ai-refine.ts              # 卡片 AI 重写/润色(弹 modal,跟随人格+风格)
│   ├── card-export.ts            # 卡片反向导出为世界书条目
│   ├── prompt-settings.ts        # 提示词编辑面板(人格/风格/提取提示词 三段)
│   └── activation-monitor.ts     # 世界书激活态实时监控
└── PROGRESS.md
```

---

## 4. 不要破坏的约束(硬规则)
- 单主题糖果粉;**不加 dark mode / 主题切换**(外观设置只在糖果调色板内换强调色/背景)。
- 图标优先 Lucide SVG(经 stripFa 拦截器);**新增 lucide 导入前先确认 named export 存在**;`icons.ts` 的 `inner()` 必须保留 undefined 防御;新增 fa 类名要在 icons.ts 映射表登记,否则白方框。lucide-static 经 webpack externals 走 jsdelivr CDN(`webpack.config.ts:575`),node_modules 里没有。
- **跨窗口陷阱(必读)**:脚本跑在 unsandboxed iframe;inline `onclick` 在 **parent 窗口**执行,模块/`addEventListener` 在 **iframe 窗口**。所有按钮交互**必须用 data 属性 + iframe 内 addEventListener 委托**,不用 inline onclick;读全局接口走 `window` 优先 → `getRoot()` 兜底(同 safeGetWorldbook 范式)。
- localStorage key:`_th_*` + `_vN` 版本号;全部登记到 `lib/config.ts` 的 `INIT_LS_KEYS`(便于备份枚举/整包导出)。
- 储藏间永不绑世界书:`bindsWorldbook:false`。
- **输入框黑底坑(反复踩,反馈2 已记)**:酒馆有全局 `input/textarea/select` 暗色 UA + 长形式规则,会把 modal 内任何**没硬压**的输入框染成灰黑底。**新加任何输入框必须套统一范式**:`background:#fff!important` + `background-color:#fff!important` + `background-image:none!important` + `color:var(--tx)!important` + `-webkit-text-fill-color:var(--tx)!important` + `color-scheme:light!important` + `appearance:none` + `::placeholder` 也压。参照 `.th-wx-field`(§5313)/`.th-evo-field`/`.th-world-set-row input`。select 要自绘 svg 箭头(`background-image` data-uri)。漏 `!important` 或 `color-scheme` = 必黑底。
- 不引 jQuery / UI 框架之外的 DOM 库;不长期跑 `pnpm watch`;不在 `.th-fab-panel` 上加 transform/filter/perspective/backdrop-filter。
- **命令式 innerHTML + openModal2 + data 属性委托,不引 Vue**(复杂交互用命令式 + 轮询兜底)。
- **可变全局**:对象引用型(managedEntryStates 等)`export let` + 只读写属性,禁整体赋值;会被重新赋值的(currentData/isEditMode 等)走 getter/setter,禁 import 侧直接赋值(会断引用)。
- **CJK 在 Edit 工具里匹配脆弱 → 用 ASCII 锚点编辑**;一次写太多会请求超时 → 分段写。

### 4.1 openModal2 堆叠(批次5 确定的范式)
- 用 **revive 回调重渲染**(非 innerHTML 快照——快照丢事件监听)。`openModal2(t,b,{maxWidth,revive,replace,reset})`;`closeModal2()` 弹栈调父级 `revive()` 原地重渲染重绑;`closeAllModal2()` 全清。
- 子 modal:主面板用 `reset+revive`,瞬态(进度/预览/确认)用 `replace`,返回按钮调 `closeModal2`/`closeAllModal2`。未登记 revive 的旧模块 = 旧隐藏行为(零回归)。

---

## 5. 元规则(所有会话必读)
1. 不清楚/语意不明 → 直接问用户,不要猜。
2. AI 无法把代码导入酒馆;要 mcp 验证需先让用户导入确认。
3. 代码 build 完 → 用通俗语言说改了什么 + 给验收计划(不要只说「build 通过」)。
4. 不拍截图(token 大);MCP 验证用 evaluate_script / take_snapshot。
5. 行为变化需用户拍板,记录在 PROGRESS 等验收。
6. 动代码前备份到 `.backup/<批次>/`。
7. 破坏性操作(覆盖写入/删快照/恢复出厂/反向导出覆盖)走二次确认 modal。

---

## 6. 回滚协议:本项目无 git 历史
`src/前端悬浮球V1/` 在 git 工作树内但 **0 文件被跟踪**(`git ls-files` 为空),`git checkout` 无法还原。
- 每批动手前备份到 `src/前端悬浮球V1/.backup/<批次>/`(已 gitignore)。
- 回滚:`cp .backup/<批次>/<file> src/前端悬浮球V1/<path>/ && pnpm build:dev`;新建文件回滚直接 `rm`。
- 已验收批次可清理对应备份。

---

## 7. 通用验收清单(每批完成后给用户)
改了什么(通俗) / build 结果 / 逐项点验计划 / 回滚预案(§6) / 下一步。

---

## 8. 已实现功能盘点(代码即真相,验收均通过/待验收;细节见各模块源码 + memory)
- **第一阶段**:解耦重构(主文件 7451→1865 行)+ 视觉升级 P1-P11(美学地基/微交互/标签桶/modal 放大/NPC 详情/外观+API 面板/系统统一/精致收尾)。
- **第二阶段(世界书资产 + AI 建卡)**:
  - 关联模板 `[初始·关联]`(links-init);三层初始化管理看板(init-manager,实时⟷初始⟷世界书,8 行,可视化编辑/双向同步检测/整包导出导入)。
  - 酒馆环境预设集成(preset-env + api-settings,API 连接 × 提示词预设 两维度正交)。
  - AI 总结注入(ai-summarize,世界书多选/任务池/同 kind 分桶统一发送/json_schema/归一化/注入确认/重 roll/流式/增量/快照回滚/冲突策略)。
  - 提示词体系(prompt-registry + prompt-settings 三段式:**头部人格**(9 内置,拼 system 最前)+ **提取风格**(16 内置)+ 提取提示词;均 CRUD + 内置 override)。
  - 卡片 AI 重写/润色(ai-refine,弹 modal 选人格/风格 + 额外输出,跟随激活设定);卡片反向导出世界书条目(card-export);激活监控(activation-monitor)。
- **当前菜单按钮**(`status-bar.html` 顶栏):地点/事件/DLC/储藏间/**变量审核**/菜单。菜单内:系统(编辑模式/刷新)、工具(世界书识别/AI 总结注入)、设置(API 设置/外观设置/初始化管理/提示词编辑/激活监控)。

> 注:顶栏「变量审核」是 `.th-btn-review`,「菜单」是 `.th-btn-menu`。**反馈 11 的「世界」按钮要插在 `.th-btn-review` 与 `.th-btn-menu` 之间**(原话「变量审核与设置按钮中间」,顶栏里设置在菜单内,故位置=审核与菜单之间)。

---

## 9. 酒馆环境能力(实现「世界」APP 前必读,已核实)
| 能力 | 接口 | 现实 / 降级策略 |
|---|---|---|
| **AI 生成文本** | `generateRaw({ordered_prompts:[{role,content},'user_input'], should_silence:true})` 绕开 RP 预设;`generate({...,json_schema,custom_api?,preset_name?})` 带预设。多任务**必须串行 await**(撞生成锁) | 复用现有 `resolveGenerateApiConfig`(两维度正交);json_schema 时返回值是 **JSON 字符串**需 `JSON.parse`;json_schema 与 tools 互斥 |
| **注入正文** | `injectPrompts([{id, position:'in_chat'/'none', depth, role, content}], {once})` + `uninjectPrompts(ids)` | **用户拍板:注入走临时世界书条目/injectPrompts,可控开关,不直接改聊天楼层**(安全可回滚)。`position:'none'` 仅激活世界书不发给 AI |
| **图片生成** | **comfyui 直连**:iframe 内 `fetch` comfyui 的 HTTP API(`POST /prompt` 提交工作流 → 轮询 `/history/{id}` → 取图)。酒馆**无** `/imagine` 命令定义(只在角色卡示例作 pipe 引用),不能依赖 slash | **用户拍板:文生图接 comfyui**。封装 `tryGenImage(prompt, opts)`:读配置的 comfyui 地址(默认 `http://127.0.0.1:8188`)+ 工作流模板 → 提交 → 取图 URL/base64。未配置/连不上 → 返回 null → UI 文字占位 + 「未配置图片后端」提示。绝不阻塞 |
| **角色/人格设定** | 复用 `AI_PERSONAS`(9 内置) + 世界书**角色档案条目**(32 个 `<char_xxx>`)+ `getNPCs` 变量 | 微信聊天对象 = 选人格 或 选角色档案条目;聊天身份注入走 ordered_prompts system |
| **离场 NPC** | `getVariables` 读 `NPC.{name}.是否在场=false`;`insertOrAssignVariables`/`updateVariablesWith` 写回 | 世界演化的演化对象来源 |
| **最新剧情** | `getChatMessages(range)` / `getLastMessageId()` | **用户拍板:所有 APP 酌情读取正文,且读几楼/读不读由玩家自定义**(每 APP 设置项)。小剧场/通话/演化等的素材来源 |
| **角色卡内嵌世界书** | `lib/char-book.ts` `getCharData/updateCharacterWith` | 世界套件**不用**(用户拍板数据纯本地);此接口供其他功能用 |

> **关键原则**:能复用酒馆助手已做好的就复用(generate/inject/worldbook/变量)。图片走 comfyui 直连,**无后端则降级占位 + 留配置接口,绝不阻塞主流程**。**TTS/语音功能不做**(用户拍板删除)。

---

# ════════════════════════════════════════════════
# §10. 「世界」按钮 APP 套件(反馈 11/12)— 实施计划
# ════════════════════════════════════════════════

> **状态:计划 + 决策已定稿,新会话可直接开做 P0。** 用户已拍板:①**TTS/语音不做**(已删);②文生图接 **comfyui**(iframe 直 fetch,默认 `http://127.0.0.1:8188`,可降级);③注入正文走临时世界书条目 + injectPrompts(可控开关);④按 P0→P1→P2 分批;⑤记忆三层(短期小总结/长期大总结/手动压缩),**阈值玩家可自定义**(默认 20 条 / 5 条小总结);⑥**所有 APP 酌情读取正文,读不读/读几楼玩家自定义**;⑦世界数据**纯本地**(不随卡走)。
> 设计总纲(用户原话):**视觉友好、可操作性强、自定义性、最重要是便捷好用**。能复用酒馆助手已做好的就复用,不重造。

## 10.0 定位与入口
- 顶栏 `.th-btn-review`(变量审核)与 `.th-btn-menu`(菜单)之间新增 `.th-btn-world` 按钮(图标 `fa-globe`/lucide `globe`,title「世界」)。
- 点击打开**全屏/大 modal 的「手机桌面」**(`openModal2`,maxWidth: min(960px,96vw),内部自带高度滚动)。桌面网格排布 APP 图标,点进各自界面。桌面顶部状态条(时间/天气取酒馆 `世界信息` 变量,呼应沉浸感)。
- APP 间可跳转(微信↔微博↔蜜语 联动),用内部「打开 APP(appId)」路由,不嵌套多层 modal(用 replace 切换桌面 ↔ APP 视图)。

## 10.1 架构原则(沿用 §4/§5 地基)
- 命令式 innerHTML + openModal2(reset+revive 桌面,replace 切 APP 视图)+ data 属性委托,不引 Vue。
- 数据落 `localStorage` `_th_world_*` 系列,全部登记 `INIT_LS_KEYS`,纳入整包导出(批次7 `th-full-pack-v1` 扩 `PACK_EXTRA_KEYS`)。
- 所有 AI 文本走 `generateRaw` + ordered_prompts(人格/设定注入 system)或 `generate`(带 json_schema 结构化);复用 `resolveGenerateApiConfig`。
- 图片走 `tryGenImage`(§9 comfyui 直连,可降级);**不做 TTS/语音**。
- 注入正文走 `injectPrompts` + 临时世界书条目,**每个 APP 的注入都是独立可控开关**(默认关,用户开)。
- 错误统一 `safeRun` + toastr;破坏性操作二次确认。

## 10.2 共享底座(P0 必先做,所有 APP 依赖)
新建 `lib/world/` 子目录,放套件共享层:
| 文件 | 职责 |
|---|---|
| `lib/world/world-store.ts` | `_th_world_*` 统一读写;APP 数据结构定义;整包导出钩子 |
| `lib/world/contacts.ts` | **联系人中心**(全套件共享):联系人 = {id, 来源(人格id/角色档案条目名/自定义), 昵称, 头像(url/占位), 固定形象tag(用于 comfyui 出图保持一致), 备注}。微信/微博/蜜语/通话都从这里取对象 |
| `lib/world/memory.ts` | **记忆中心**(用户拍板,复用现有 AI 总结):短期记忆(小总结,每 N 条对话自动滚动总结)+ 长期记忆(大总结,多条小总结压缩合并)+ 手动「压缩合并」按钮。每个会话(联系人/群)独立记忆。复用 `ai-summarize` 的 generate 封装,提示词走 prompt-registry 新增 `registerExtra` 注册的记忆专用提示词 |
| `lib/world/media.ts` | `tryGenImage(prompt, opts)` 的统一封装 + comfyui 后端配置读取(地址默认 `http://127.0.0.1:8188` + 工作流模板;iframe 内直接 fetch comfyui HTTP API:`POST /prompt` → 轮询 `/history/{id}` → 取图)。无后端/连不上 → 返回 null,UI 占位。**不含 TTS(用户拍板不做)** |
| `lib/world/ai-chat.ts` | 聊天/内容生成的通用 generate 流(传 system=人格+设定+记忆,user=对话历史+新输入+可选读取的正文楼层,可选 json_schema) |
| `modules/world/world-app.ts` | 桌面壳 + APP 路由 + 顶部状态条 + 设置入口(comfyui 后端配置/记忆参数/各 APP 读正文设置/数据管理) |

> **正文读取(用户拍板,全 APP 通用)**:每个 APP 设置项里有「读取酒馆正文」开关 + 读取楼层数(默认关 / 玩家自定义读几楼);开启则 `getChatMessages` 取最近 N 楼拼进 user 上下文,让 APP 内容贴合当前剧情。**读取与注入是两个独立开关**(读=APP 参考正文;注入=APP 内容反哺正文)。

> **记忆设计细节(用户强调,阈值玩家可自定义)**:三层——
> 1. **短期记忆/小总结**:每个会话累积对话,达阈值(**默认 20 条,玩家可在套件设置改**)自动触发一次小总结(generate 提取要点),存 `_th_world_mem_short_<sessionId>`。
> 2. **长期记忆/大总结**:小总结累积达阈值(**默认 5 条,玩家可改**),压缩合并成一条大总结,存 `_th_world_mem_long_<sessionId>`,清理已合并的小总结。
> 3. **手动压缩合并**:每个会话记忆面板给「立即压缩/合并」按钮,玩家可手动触发。发送给 AI 时:system 注入「长期记忆摘要 + 最近若干条小总结 + 最近原始对话」,控制 token。

## 10.3 APP 优先级与批次
| 批次 | APP | 核心 |
|---|---|---|
| **P0** | 共享底座 + 微信 + 世界演化 | 最核心:聊天互动 + 离场 NPC 演化 |
| **P1** | 小剧场 + 世界论坛 | 选角色/地点 + 参考正文生成片段 / 论坛帖 |
| **P2** | 微博 + 蜜语 + 魔坊 + 通话 | 社交/直播/模板/电话 扩展玩法 |

---

## 10.4 P0-A · 微信(`modules/world/wechat.ts`)
**定位**:和角色聊天互动的核心 APP。视觉仿微信(联系人列表 / 聊天气泡 / 输入栏 / 朋友圈)。
- **聊天对象**:从 `contacts.ts` 选 —— 来源可为 ① 已有人格(AI_PERSONAS)② 世界书角色档案条目(`<char_xxx>` 设定)③ 自定义联系人。每个对象带头像/昵称/固定形象 tag/备注。
- **单聊**:气泡对话;发送 → `ai-chat.ts` 组 system(对象设定 + 该会话记忆)+ user(最近对话 + 新消息 + 可选读取的正文楼层)→ `generateRaw` → 回复气泡。支持:表情包(预置 + 自定义图)、发图(`tryGenImage`,描述生成)、撤回/重 roll/编辑。**不做语音消息**。
- **群聊**:多对象;每轮可指定「谁说话」或让 AI 自选发言角色(json_schema 返回 `{speaker, content}` 序列);群内每个角色独立设定,共享群记忆。
- **朋友圈**:时间线;角色可发动态(AI 生成文字 + `tryGenImage` 配图)、玩家可发、互相点赞/评论(AI 生成评论)。
- **联系人管理**:增删改对象(昵称/头像/固定形象 tag);头像支持 `tryGenImage` 生成或上传。
- **记忆/总结**:复用 `memory.ts`(每会话短期 + 长期 + 手动压缩,见 10.2)。
- **视频/通话**:文字剧情形态(无 TTS,纯文字对话 + 可选 `tryGenImage` 通话截图);与 P2「通话」APP 共享 `ai-chat` 流。
- **自定义美化**:气泡色/背景/字体在套件设置里调(沿用糖果粉基元,可换皮)。
- **联动**:微信内可跳「微博/蜜语」查看该角色的社交动态(P2 落地后接通,P0 先留按钮)。
- **注入正文(可控开关)**:微信对话默认**不**注入酒馆正文;开开关后,本次微信交互摘要经 `injectPrompts`/临时世界书条目喂下次酒馆生成(让正文知道「刚和谁聊了什么」)。
- **数据**:`_th_world_wechat_v1`(会话列表/消息/朋友圈),联系人在 `_th_world_contacts_v1`,记忆独立 key。

## 10.5 P0-B · 世界演化(`modules/world/evolution.ts`)
**定位**:对离场 NPC 等做酒馆正文之外的额外演化。
- **演化对象**:默认列 `getVariables` 里 `是否在场=false` 的 NPC;也可手动加任意角色档案/联系人。
- **演化机制**:玩家点「推进演化」(单个或批量)→ `generateRaw` 组 system(角色设定 + 该角色历史演化记忆 + 世界信息时间)+ user(「该角色在玩家不在场期间发生了什么」+ 可选玩家给的方向提示)→ 返回演化片段(json_schema:`{summary, 变量变化?, 关键事件}`)→ 存演化时间线。
- **时间推进**:可选「按酒馆世界时间」或「玩家手动指定时长」;演化以世界信息日期为锚。
- **注入正文(可控开关,用户明确要求)**:每条演化结果带「注入/不注入」开关。开 → 演化摘要经 `injectPrompts`(position:'in_chat' 或临时世界书条目)喂下次酒馆生成,让正文反映离场期间变化;关 → 仅存档不影响正文。
- **变量回写(可选,谨慎)**:演化若产生变量变化(如 NPC 心情/位置),给「应用到酒馆变量」按钮(`updateVariablesWith`,二次确认);默认不自动写。
- **演化记忆**:每个角色独立演化时间线,长了可压缩合并(复用 `memory.ts`)。
- **数据**:`_th_world_evolution_v1`(每角色演化时间线 + 注入状态)。

---

## 10.6 P1-A · 小剧场(`modules/world/theater.ts`)（已实现待验收 2026-06-26,见 §10.17）
**定位**:选角色 + 地点等世界书条目,参考最新楼层正文生成番外片段。
- **选材**:多选角色(角色档案/联系人/在场 NPC)+ 地点(世界书 `[地点]`/managed location)+ 可选主题/桥段提示。
- **参考正文**:`getChatMessages` 取最近 N 楼作为上下文,让片段衔接当前剧情(可关,纯架空)。
- **生成**:`generateRaw` 组 system(所选角色 + 地点设定 + 风格,复用 AI_STYLES)+ user(参考正文 + 桥段指令)→ 输出小剧场文本;支持续写/重 roll/分段生成。
- **形态**:旁白 + 对话混排;可选「单次短片」或「连续多幕」(每幕基于上一幕)。
- **注入正文(可控开关)**:小剧场默认独立存档不入正文;可选把某片段作为「已发生剧情」注入(临时世界书条目)。
- **导出**:可存为世界书条目(复用 `card-export`)或导出文本。
- **数据**:`_th_world_theater_v1`(剧本列表/幕)。

## 10.7 P1-B · 世界论坛(`modules/world/forum.ts`)（已实现待验收 2026-06-26,见 §10.17）
**定位**:世界观内的论坛/贴吧,角色与 NPC 在此发帖回帖,丰富世界氛围。
- **板块**:玩家建板块(如「江湖传闻」「坊市交易」);每板块下帖子列表。
- **发帖**:玩家发主题帖,或让 AI 以某角色身份发帖(`generateRaw`,身份注入);AI 自动生成楼中楼回帖(json_schema 返回 `[{楼主, 内容}]`);可点赞/盖楼/追评。
- **世界感**:帖子内容参考世界书设定 + 当前世界信息(时间/地点/事件);可触发「热帖」联动正文(可控开关注入)。
- **数据**:`_th_world_forum_v1`(板块/帖子/楼层)。

---

## 10.8 P2 · 微博 / 蜜语 / 魔坊 / 通话
> P2 都复用 P0 底座(contacts/ai-chat/media/memory),按相同范式做,落地时再细化。

### 微博(`modules/world/weibo.ts`)
浏览 + 生成微博:推荐页 / 热搜榜 / 个人主页(角色) / 评论互动 / 点赞 / 下拉刷新(AI 生成新内容)/ 转发 / 配图(`tryGenImage`)。内容以世界观角色为博主,参考设定 + 世界信息。联动微信(从微博点角色 → 微信聊天)。数据 `_th_world_weibo_v1`。

### 蜜语(`modules/world/miyu.ts`)
直播向社交:直播间互动(实时弹幕 + 主播 AI 回应)/ 关注列表 / 推荐刷新 / 私密互动 / 礼物系统 / 场景生成。偏 NSFW 互动玩法(沿用项目无外审基调)。数据 `_th_world_miyu_v1`。

### 魔坊(`modules/world/mofang.ts`)
高度自定义模板 APP:玩家定义模板(信笺 / 论坛帖 / 公告 / 日记等),每模板含字段 + 提示词;用模板 + 角色/世界设定 → AI 生成富文本内容。本质是「自定义内容生成器」,接 prompt-registry。数据 `_th_world_mofang_v1`(模板库 + 产出)。

### 通话(`modules/world/call.ts`)
模拟电话:通话记录列表 / 发起通话(文字剧情形态,无 TTS,逐句文字对话)/ 配合剧情电话互动(可选读取正文 + 角色设定)。与微信视频/通话共享 `ai-chat` 流。可控开关注入正文。数据 `_th_world_call_v1`。

---

## 10.9 实施步骤(每批独立 build + tsc + 用户导入验收 + 可回滚)

### P0(共享底座 + 微信 + 世界演化)
1. **Step1 入口 + 桌面壳**:`status-bar.html` 加 `.th-btn-world`(审核↔菜单之间);`status-bar-init.ts` bindEvents 挂 click;`modules/world/world-app.ts` 桌面壳 + APP 路由 + 顶部状态条 + 套件设置(媒体后端/记忆参数/数据管理)。`status-bar.css` 加 `.th-world-*` 样式。
2. **Step2 共享底座**:`lib/world/{world-store,contacts,memory,media,ai-chat}.ts`。先把 `tryGenImage`(comfyui)降级链路跑通(无后端时占位)。INIT_LS_KEYS 登记全部 `_th_world_*` key。
3. **Step3 微信**:`modules/world/wechat.ts` —— 联系人列表 → 单聊(气泡/发送/重 roll/表情/发图)→ 群聊 → 朋友圈 → 注入开关 + 读正文开关。
4. **Step4 世界演化**:`modules/world/evolution.ts` —— 离场 NPC 列表 → 推进演化 → 时间线 → 注入开关 → 可选变量回写。
5. **Step5 收尾**:整包导出纳入 `_th_world_*`;build + tsc + 验收清单。

### P1(小剧场 + 世界论坛)
`modules/world/{theater,forum}.ts`,复用底座;桌面加两图标。独立 build + 验收。

### P2(微博 + 蜜语 + 魔坊 + 通话)
`modules/world/{weibo,miyu,mofang,call}.ts`,逐个或合并小批;复用底座 + 联动微信。

## 10.10 约束(同 §4/§5/§6,世界套件补充)
- 所有 `_th_world_*` key 登记 INIT_LS_KEYS + 纳入整包导出 `PACK_EXTRA_KEYS`。
- 图片(comfyui)**必须可降级**:无后端/连不上时占位 + 提示「未配置图片后端」,绝不报错阻塞。**不做 TTS/语音**。
- 每个 APP 两个独立开关:**读取正文**(读不读/读几楼,玩家自定义)+ **注入正文**(默认关,走 injectPrompts/临时世界书条目,**绝不直接改聊天楼层**)。
- AI 调用串行(撞生成锁);长内容用记忆三层压缩控 token。
- 跨窗口 data 属性委托 + getRoot 兜底;命令式 + openModal2 reset/replace/revive(不引 Vue)。
- 桌面 ↔ APP 视图用 replace 切换(不无限堆叠 modal);APP 内子弹窗(联系人编辑/设置)才 push。
- NSFW 玩法沿用项目无外审基调,不中性化。
- 视觉:糖果粉基元 + 各 APP 仿真皮肤(微信绿/微博橙等)在套件设置可调,默认糖果粉协调。

## 10.11 用户已拍板的决策(开做依据,已固化)
2. **图片后端**:接 **comfyui**(iframe 内直接 fetch comfyui HTTP API;地址默认 `http://127.0.0.1:8188`,套件设置可改 + 配工作流模板)。无后端则降级占位。
3. **桌面 APP 出现方式**:按批次逐个出现(P0/P1/P2 做到哪显示哪,不灰显占位)。
4. **微信群聊发言**:两者都给(AI 自选发言角色 / 玩家每轮指定),开关切换,玩家自己调。
5. **记忆阈值**:默认小总结每 20 条、大总结每 5 条小总结,**且套件设置里玩家可自定义**。
6. **读取正文**:所有 APP 酌情读取正文,**读不读 / 读几楼由玩家在每个 APP 设置里自定义**(默认关)。
7. **数据隔离**:世界套件数据**纯本地** `_th_world_*` + 整包导出迁移(不随角色卡走)。

> 开做前若仍有未决细节(如 comfyui 默认工作流模板的具体参数、各 APP 皮肤配色),按「视觉友好/可操作/自定义/便捷好用」总纲酌情定,拿不准再问用户。

## 10.12 记忆中心(重设计,反馈2 定稿,已实现待验收)

旧版「短/长两个阈值数字」太简陋且归属不明 → 重设计为**全套件共享的记忆设施**,所有 APP(微信/世界演化/...)的每条对话线 = 一个 `session`(由 `appId` 标记归属 + `sessionId` 寻址),记忆中心按 APP 分组枚举,「给哪个 APP 用」一目了然。

**四层(由浅到深,token 由大到小)**:
1. **待总结缓冲 buffer**:最新原始对话,累积到 `shortThreshold` 自动小结。
2. **短期记忆 shortterm**:小结(每 `shortThreshold` 条对话压一条)。
3. **长期记忆 longterm**:大总结(每 `longThreshold` 条小结再压一条)。
4. **关键设定 pinned**:玩家手动钉住,**永不压缩,每次注入必带**(人物关系/世界观锚点)。

**注入上下文** = 关键设定(全) + 长期(全) + 最近 `recentShortCount` 条短期 + 最近 `recentRawCount` 条原始 → 控 token。

**文件**:
- `lib/world/memory.ts` 纯引擎:会话索引(`_th_world_mem_index_v1`)+ 每会话 blob(`_th_world_mem_<id>`);`appendTurn`(返回是否达阈值)/`runShortSummary`/`runLongCompress`/`manualSummarize`/pin/edit/delete/clear/`setSessionOverrides`/`buildMemoryContext`。**summarize 注入式**(generate 由 ai-chat 提供,引擎不碰 generate/DOM)。
- `modules/world/memory-center.ts` 可视化:总览(按 APP 分组+数量徽标)→ 单会话(四层卡片+**进度条**+立即小结/压缩长期/钉住/编辑/删除/每会话阈值覆盖)。
- `lib/world/ai-chat.ts` `makeSummarizer()` 给引擎注入真实 generate;`sessionReply()` 高层便捷(组记忆+可选正文→生成→落库→达阈值自动小结);`readTavernFloors(n)` 可选读正文。
- `lib/world/media.ts` `tryGenImage`(comfyui 直连,降级返回 null)+ `isImageBackendReady`。
- `lib/world/contacts.ts` 联系人中心(persona/charcard/custom 三来源)。

**每会话阈值覆盖**:`session.overrides` 覆盖全局 4 个参数,记忆中心单会话页可改,留空=用全局。`effectiveMemConfig()` 合并。

**Step3/4 接法**:微信单聊/群聊、世界演化各角色 = 各自 `ensureSession({id,appId,appName,title})`;发消息走 `sessionReply` 或自行 `appendTurn`+`buildMemoryContext`;APP 内「记忆」按钮调 `openSessionMemory(sessionId)`。

## 10.13 微信 APP(Step3,P0-A,已实现待验收)

仿微信绿(`--wx:#07c160` 覆盖糖果粉),自注册到桌面(`registerWorldApp`,order 10)。桌面壳 `world-app.ts` 顶部 `import './wechat'` 触发 side-effect 注册。

**文件**:
- `lib/world/wechat-store.ts` 纯数据层(单 blob `_th_world_wechat_v1`):`chats[]`(单聊/群聊)+ `messages{chatId:[]}` + `moments[]` + `stickers[]`;CRUD 全套。会话设置 `{readFloors, injectEnabled, groupAutoSpeaker, aiPresetName?}`。记忆 sessionId 约定 `wxSessionId(chatId)='wx_'+chatId`(appId='wechat')。
- `modules/world/wechat.ts` UI+流:聊天列表/单聊气泡/群聊/通讯录/联系人编辑/朋友圈/会话设置/表情选择器。
- `lib/world/ai-chat.ts` 新增 `groupReply()`(群聊,json_schema 返回 `{speaker,content}`,auto 自选或 forcedSpeaker 指定)+ `injectWorldOnce(id,content)`(injectPrompts+once 注入下次正文,绝不改楼层)。
- `lib/world/contacts.ts` 新增 `importPersonaContact()`(从 AI 人格导入,同源复用不重复建)。

**能力**:单聊走 `sessionReply`;群聊走 `groupReply`(AI 自选/玩家指定发言,聊天界面下拉选);发图走 `tryGenImage`(未配置/失败→文字占位);表情(预置 8 + 自定义 emoji/图);消息重 roll(删旧回复重生成)/编辑/撤回/删除;通讯录(人格导入/自定义/生成头像/编辑删除);朋友圈(我发/角色 AI 发/点赞/评论/AI 评论);每会话「读正文楼数」+「注入正文」开关(默认关);APP 内「记忆」按钮→`openSessionMemory(wx_<chatId>)`。AI 调用串行(`_busy` 锁)。

**约束遵守**:`_th_world_wechat_v1` 已在 world-store `getWorldStorageKeys()` 固定 key 内(纳入整包导出);注入只走 injectPrompts+once;图片可降级;data 属性委托 + openModal2 replace。

## 10.14 微信反馈大重构(Step3b,12 项,已实现待验收 2026-06-25)

用户验收 Step3 后给 12 条反馈,通盘重构微信并奠定后续 APP 通用机制。

**架构换骨(修反馈4)**:`wechat.ts` 改**单 modal SPA**。`openModal2` 全程只调 1 次(`reset`+`revive:openApp`),内部 `#th-wx-app-root` 常驻容器 + `_view` 视图状态机,`render()` 只换根容器 innerHTML,事件委托一次性绑根容器(click/keydown/change)。表情/发图/发描述/世界书选条目/提示词编辑全部改成 **app 内底部 sheet**(`_sheet` 状态 + `.th-wx-sheet` 遮罩),**绝不 push 新 modal**——根治旧版「打开表情后其他 modal 全关」。

**逐项**:
- **#1 输入黑底终极修**:统一 `.th-wx-field` 类(所有 input/textarea/select),`background:#fff!important`+`background-image:none`+`color-scheme:light!important`+`-webkit-text-fill-color`+`::placeholder` 全压;`select.th-wx-field` 自绘 svg 箭头。
- **#2 API 预设下拉**:会话设置用 `getApiPresetNames()`(读 `_th_api_presets_v1`)列已存预设,不再手输。
- **#3 资料页**:单聊顶部 ℹ→联系人编辑页(含角色档案);群聊 ℹ→`groupInfo` 视图(成员列表 + 加入/移出成员 + 改群名)。
- **#5 角色外观**:`contacts.ts` 加 `appearance`+`gender` + `DEFAULT_APPEARANCE`(女·高挑御姐火辣);**config.ts 9 个内置人格各自贴合追加【外观与形象】**(妹妹/清纯少女型不强行御姐——会顺带影响 AI 总结人格语气,用户已同意)。组对话 `fullPersona()` 把性别+外观拼进 system。
- **#6 bot 式多气泡**:`sessionReply` 改返 `string[]`(json_schema `{messages:[]}`),逐条 append 成气泡;`parseJsonLoose`/`splitToBubbles` 兜底非 JSON。
- **#7 文字描述卡**:`WxMsgKind` 加 `'desc'`;未开本地生图的图片 + 旁白描述都渲染 `.th-wx-desccard` 文字卡;输入栏加「发描述」按钮。
- **#8 提示词可编辑**:新建 `lib/world/world-prompts.ts`(`registerPromptTemplate`/`getPromptText`/`setPromptOverride`/`resetPrompt`,覆盖存 `_th_world_prompts_v1`,已入整包导出)。微信注册 4 模板,会话设置页可编辑/重置(走 sheet)。**后续每个 APP 都用此机制注册自己的提示词**。
- **#9 群聊多人多段 / 朋友圈多人评论**:`groupReply` 改返 `{speaker,content}[]`(json_schema `{replies:[{speaker,messages[]}]}`)一次多人多条;朋友圈 AI 评论一次多角色(`{comments:[{speaker,text}]}`)。设置加 multiSpeaker/maxSpeakers/maxBubbles。
- **#10 世界书导入**:新建 `lib/world/worldbook.ts`(`listWorldbookNames`/`listWorldbookEntries`,window→getRoot 兜底,只读降级空);`contacts.ts` 加 `importWorldbookContact`;联系人编辑里「从世界书导入」sheet 选书→列条目→注入设定(`_ceDraft` 暂存表单防丢)。

**文件**:新建 `lib/world/{world-prompts,worldbook}.ts`;改 `lib/world/{ai-chat,contacts,wechat-store,world-store}.ts`、`lib/config.ts`、`modules/world/wechat.ts`、`status-bar.css`。build+tsc 全过;备份 `.backup/world-p0-step3b/`。

## 10.15 Step5 大重构(反馈+设计补充,已实现待验收 2026-06-25)

用户验收方向:微信皮肤+设计补充全照做、交互只做流式预览+空态;反馈 1-6:演化提示词丰富/输入框黑底/演化设置扩充/多角色联合演化/世界背景演化/全状态栏提示词重写。

- **#2 输入框黑底坑(反复踩,已写 §4 硬规则)**:`.th-evo-field` 没硬压被酒馆全局 input 染黑→改用与 `.th-wx-field` 同范式(白底+`!important`+`color-scheme:light`+`-webkit-text-fill-color`+`appearance:none`+select 自绘箭头)。**新加输入框必须套此范式**。
- **#3 演化设置**(sheet `settings`):API 预设/读正文楼数/注入条数/联合上限,存 `_th_world_evo_config_v1`(入整包导出)。**角色配置**(sheet `charConfig`):改名/人设/维度 + 绑专属世界书条目(`worldbookRefs`,推演拉内容拼 system)+ 额外设定。
- **#4 多选联合推演**:列表行 checkbox,选 ≥2→`runCoAdvance` 一次 API 产出全部(json_schema `{actors:[...]}`),鼓励角色交集,共享 `batchId`。
- **#5 世界背景演化**:`source:'world'` 伪对象,按维度(势力/民生/天候/暗流/舆论+自定义)推演世界宏观变化。
- **#6 提示词三套**(`advance`/`coadvance`/`world`)专业级重写,sheet tab 切换;**全状态栏其它提示词同步升级**:`memory.ts` SHORT_SYS/LONG_SYS(记忆官口吻)、`ai-chat.ts` DEFAULT_SINGLE/GROUP_INSTRUCTION(活人感)。`config.ts` 6 套提取提示词与 `AI_SUMMARY_SYSTEM_PROMPT` 本就是结构化精度提示词、契约不可动,保留。
- **流式预览**:`ai-chat.onStreamToken`(订阅 `STREAM_TOKEN_RECEIVED_FULLY`)+ `chatGenerate({shouldStream})`;演化推演 sheet 实时显示生成文本(`pushStream` 只更新 `<pre>` 不整树重渲染)。
- **微信皮肤+设计补充**:对话区微信风壁纸(米灰+极淡点阵纹理)+ 气泡尖角;「对方正在输入…」三点跳动动态气泡(`_busy` 时 render 出);空态升级(图标+引导文案)。

**文件**:改 `lib/world/{evolution-store,ai-chat,memory,world-store}.ts`、`modules/world/{evolution,wechat}.ts`、`status-bar.css`、`PROGRESS.md`。build+tsc 全过;备份 `.backup/world-p0-step5/`。

> **设计补充储备(未做,后续可挑)**:微信——引用回复/拍一拍/语音条/角色主动发消息/时间分隔/未读置顶已在 Step6 落地;剩 表情雨·红包·转账等娱乐玩法。演化——时间线竖轴可视化/关系图(Step6 做了节拍总览);剩 关系网络图谱。整体——手机外壳/灵动岛已落地;剩 多 APP 间转场动画。**PC 端设计,不做移动端适配**(`feedback_pc_only_design`)。

## 10.16 Step6 大重构(反馈 1-7,已实现待验收 2026-06-26)

用户验收 Step5 后给 7 条反馈,聚焦演化 UI 卡片化/操作便捷、提示词落地到本卡世界观、微信流畅化 + 设计补充一并做完。

- **#1 演化 UI 卡片化 + 操作前置**:列表从「一行一个」改 `th-evo-card` **卡片网格**(`actorCardHtml`);「推进/配置」按钮直接在卡片上(`data-evo-card-advance`/`data-evo-card-cfg`),不必进详情再点。**联合推演固定顶部工具条**(`th-evo-toolbar`,常驻不再选中弹条)。
- **#2 三套提示词应用确认**:`runAdvance` 按 `a.useCustomPrompt && a.customPrompt` 决定用专属内置提示词 or 默认模板(world→`evolution.world`,角色→`evolution.advance`);联合走 `evolution.coadvance`。三套都经 `getPromptText` 取「覆盖优先」,可编辑可重置。
- **#3 世界背景演化线重构到主 modal**:三套内置预设固定为主界面上方 `th-evo-wbar` 预设条(一点开线);**新建 `lib/world/evolution-presets.ts`**——基于本卡《此间天地》世界书提炼出三套落地预设:`sxtd.cosmos`(天地灵网·社会风向)/`sxtd.sect`(霜月仙宗·宗门动向)/`sxtd.academy`(星见丘学园·校园日常),各带 backdrop(世界观背景)+ 专业级 prompt。
- **#4 提示词内置 + 可勾选**:每个 world 预设自带 prompt;每个角色经 `buildActorBuiltinPrompt(name)` 给一份专属内置提示词;`charConfig` 加「专属内置提示词」textarea + ☑「使用内置提示词」开关 + 「填入内置范本」按钮(`useCustomPrompt`/`customPrompt` 存 evolution-store)。**微信 4 提示词全部重写**(单聊/群聊/朋友圈发/评)+ 新增 `wechat.initiate`(主动找你)。
- **#5 全局默认绑定世界书**:`EvoConfig.globalWbRefs`,设置面板里绑定,`buildGlobalWbText()` 把内容作「世界观锚点」拼进**每一次**推演(单/联/世界都带)。
- **#6 微信 tab 流畅化**:聊天/通讯录/朋友圈改**持久底部导航栏**(`phoneTabbar`/`th-wx-navbar`),点击同界面切换不再翻页带返回;顶栏 `th-wx-topbar`。
- **#7 设计补充**:微信——聊天**时间分隔**(>5min 插分隔)、**未读红点 + 置顶**(`unread`/`pinned`,进会话清零,置顶排前)、**引用回复**(`replyTo*` + 引用栏)、**拍一拍**(系统消息 `kind:'system'`)、**语音条降级**(`kind:'voice'`,无 TTS→语音条样式+转文字)、**角色主动发消息**(`data-wx-initiate`/`initiateMessage`);演化——**世界节拍总览**(`pulse` sheet 跨对象最近演化汇总)、**方向 chip 快捷填**(`DIR_CHIPS`)、**演化→微信联动**(`evoToWechat`:把某条演化转成 ta 主动发来的微信);整体——**手机外壳 + 灵动岛**(`th-phone`/`th-phone-island`/`th-phone-screen` 包裹微信/演化,世界桌面状态条加灵动岛药丸)。

**文件**:新建 `lib/world/evolution-presets.ts`;改 `lib/world/{evolution-store,wechat-store}.ts`、`modules/world/{evolution,wechat,world-app}.ts`、`status-bar.css`、`PROGRESS.md`。build+tsc 全过(world 文件零报错);备份 `.backup/world-p0-step6/`。bundle ~7.32MB。

> **注**:演化→微信联动要求角色在微信通讯录里存在(contact 来源直接用,其它按名字匹配);找不到会提示先去通讯录加。

## 10.17 P1 阶段 · 小剧场 + 世界论坛 + 演化添加对象卡片化(已实现待验收 2026-06-26)

Step6 验收通过后,用户:① 演化「添加对象」选择也做成卡片;② 继续原计划下一步=P1(小剧场 + 世界论坛)。一并实现待验收。

- **#1 添加对象卡片化**:演化 `pick` sheet 的离场 NPC / 联系人由横条 `th-evo-pick-item` 改为 `th-evo-pcard` **卡片网格**(头像 + 名 + 来源标签 + 已添加角标),与 Step6 列表卡片风格统一。仅改 `evolution.ts` 的 pick 分支 + `status-bar.css` 新增 `.th-evo-pcard*`。
- **P1-A 小剧场**(`modules/world/theater.ts` + `lib/world/theater-store.ts`,新 APP order 30):选角色(联系人/在场+离场 NPC,卡片多选)+ 地点(世界书条目卡片选 / 自定义)+ 桥段主题 + 风格(复用 `AI_STYLES_BUILTIN`)+ 形态(单次短片 / 连续多幕,多幕承接上一幕)+ 是否参考最近正文楼层(`readTavernFloors`)。`chatGenerate` 出片段(旁白+对话混排);每「幕」可删、可「注入正文」(`injectWorldOnce` 一次性)。剧本/幕存 `_th_world_theater_v1`。提示词 `theater.generate` 注册到 world-prompts(可在设置页改/重置)。
- **P1-B 世界论坛**(`modules/world/forum.ts` + `lib/world/forum-store.ts`,新 APP order 40):板块(玩家建/删)→ 帖子列表(热帖优先)→ 帖子详情(楼主 + 楼层)。发帖支持「我」手动发 or 选某联系人由 **AI 代角色发**(`forum.post`,json 出 title/content);帖子可「AI 盖楼」(`forum.replies`,json 数组出多条不同身份回帖)、点赞、设热帖、「联动正文」(`injectWorldOnce`)。楼层可点赞/删。数据存 `_th_world_forum_v1`。两个提示词均注册到 world-prompts。
- **整体**:两 APP 都套 Step6 手机外壳(`th-phone`/灵动岛/`th-phone-screen`),单 modal SPA + 底部 sheet 范式,输入框全部白底硬化(`.th-thr-field`/`.th-frm-field` 同 `.th-evo-field` 范式)。`world-app.ts` 新增 `import './theater'; import './forum';`,桌面自动多出两个图标。`WORLD_LS_KEYS` 加 `theater`/`forum`,`getWorldStorageKeys` 纳入整包导出。

**文件**:新建 `lib/world/{theater-store,forum-store}.ts`、`modules/world/{theater,forum}.ts`;改 `lib/world/world-store.ts`、`modules/world/{evolution,world-app}.ts`、`status-bar.css`、`PROGRESS.md`。build+tsc 全过(新文件零报错,余为既有 noise);备份 `.backup/world-p1/`。bundle ~7.70MB。

> **注**:小剧场/论坛的 AI 生成都走 `chatGenerate`(单次,非流式),需用户在总 API 设置里配好预设;失败有 toastr 提示。论坛 AI 代发/盖楼依赖联系人中心里有角色(无则只能用「我」手动发 + 路人盖楼)。

## §11. 新会话接手「世界」按钮须知
1. 先读本文件 §0-§9(地基)+ §10(本计划)。
2. 读 `@types/function/{generate,inject,worldbook,variables,chat_message}.d.ts` + `@types/iframe/exported.mvu.d.ts`;用前 grep 签名。
3. `ls src/前端悬浮球V1/{lib,modules}/`;确认是否已有 `lib/world/`、`modules/world/`(判断做到哪步)。
4. 动手前备份到 `.backup/<批次名>/`(P0:`world-p0`);改完 `pnpm build:dev` + `npx tsc --noEmit`;UI 需用户导入实测。
5. 按 §10.9 步骤推进;每批按 §7 给验收清单。决策已固化在 §10.11,无需再问已定项。
6. 关联 memory:`project_batch8_feedback`(本批 1-10 + 世界计划)、`project_frontend_ball_v1`、`feedback_tsc_catch_missing_export`、`project_no_git_rollback`。

> 历史批次(解耦/视觉 P1-P11、第二阶段批次 0-7、批次 8 反馈 1-10)的逐条规格与实施日志已从本文件清理——代码是真相,批次摘要在 memory。需要查某批改了什么:看对应 `.backup/<批次>/` 快照 或 memory 文件。
