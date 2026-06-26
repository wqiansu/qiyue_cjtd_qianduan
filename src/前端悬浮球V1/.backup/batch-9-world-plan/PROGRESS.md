# 前端悬浮球V1 · 状态与下一步

> 单一可信源。新会话接手本项目时,先读完本文件,再读 `@types/` 关键类型,最后 `ls src/前端悬浮球V1/` 确认结构。

---

## 0. 当前结论(新会话先看)

| 维度 | 信息 |
|---|---|
| **项目** | `src/前端悬浮球V1/` - 此间天地酒馆助手悬浮球状态栏 |
| **来源** | 从 `src/0615悬浮球/`(已验收稳定版)复制 |
| **打包** | `pnpm build:dev`(项目根目录执行) |
| **产物** | `dist/前端悬浮球V1/index.js`(用户手动导入酒馆) |
| **解耦** | ✅ 已完成:主文件 7451→1865 行,lib/+modules/ 多文件 |
| **视觉升级** | ✅ P1-P11 全部完成(美学地基→扩 modal→新功能→系统统一→精致收尾) |
| **核心约束** | 改动涉及行为/布局变化需用户拍板;每批 build + 用户导入验收 + 可回滚 |
| **必读文件** | 本文件 + `@types/function/variables.d.ts` + `@types/function/generate.d.ts` |
| **回滚** | 无 git(V1 源码未跟踪),只能文件备份到 `.backup/<批次>/`(见 §6) |

### 0.1 本项目与 0615 的关系

- `src/0615悬浮球/`:**已验收稳定版,原样保留,不动**。
- `src/前端悬浮球V1/`:**所有改动在这里做**。两项目独立 webpack 入口,互不影响。

### 0.2 正确的变量路径(关键!)

**User 玩家路径**(通过 `getUserKey(data)` 获取 userKey,不是固定的 'user'):

| 数据类型 | 路径 |
|---|---|
| 拥有物品 | `{userKey}.拥有物品` |
| 拥有技能 | `{userKey}.拥有技能` |
| 状态 | `{userKey}.状态` |
| 当前穿着衣物 | `{userKey}.当前穿着衣物` |

**NPC 路径**(`getNPCs(data)` 返回 `[{name, info}]`):

| 数据类型 | 路径 |
|---|---|
| 拥有物品 | `NPC.{npcName}.拥有物品` |
| 拥有技能 | `NPC.{npcName}.拥有技能` |
| 状态 | `NPC.{npcName}.状态` |
| 当前穿着衣物 | `NPC.{npcName}.当前穿着衣物` |

### 0.3 敏感词还原状态

NPC 数值指标已从外审中性词**还原为原始词**(与 MVU 角色卡酒馆变量同名):情欲值/敏感值/羞耻值/高潮次数/被内射次数;hover-tip 标题"亲密记录";局部变量 orgasm/creampie;data-attr `data-orgasm/data-creampie`。还原参照 `src/此间天地前端/V1敏感词替换存档.md`(该文件为历史存档,可留作记录)。**不要再次中性化**——当前渠道无外审。

---

## 1. 新会话开场清单(必须按顺序)

1. **全文读本文件**。
2. 读酒馆助手类型定义:`@types/function/variables.d.ts`、`@types/function/generate.d.ts`、`@types/iframe/exported.tavernhelper.d.ts`、`@types/iframe/exported.mvu.d.ts`。
3. `ls src/前端悬浮球V1/` 确认结构(见 §3)。
4. 改代码后必须跑 `pnpm build:dev`(+ 必要时 `npx tsc --noEmit -p tsconfig.json` 查 TS2304/2305/2306/2459)。UI 行为需用户重新导入 `dist/前端悬浮球V1/index.js` 实测。

---

## 2. 数据模型

### 2.1 ManagedItemV2
```ts
type ManagedItemV2 = {
  desc: string; tags: string[]; order?: number; inject?: string;
  favorite?: boolean; lastEdited?: number;
  links?: { locations?: string[]; events?: string[]; dlcs?: string[] };
};
```
### 2.2 Tag
```ts
type Tag = { color: string; desc: string; defaultInject?: string; };
```
### 2.3 ManagedKind
```ts
type ManagedKind = 'location'|'event'|'dlc'
  |'stash-item'|'stash-skill'|'stash-status'|'stash-clothing'
  |'stash-uncategorized'|`stash-custom-${string}`;
// 统一配置用 getStashKindCfg(kind),不要直接 MANAGED_CFG[kind]
```
### 2.4 初始数据条目:`[初始·地点]`/`[初始·事件]`/`[初始·DLC]`/`[初始·储藏间]`(蓝灯+禁用,避免入上下文)。

---

## 3. 当前文件结构(解耦后)

```text
src/前端悬浮球V1/
├── index.ts                # webpack 入口:createApp(Shell).use(createPinia()) 挂 parent.document.body
├── Shell.vue               # 悬浮球/面板外壳:球折叠态+拖拽/缩放/最大化;onMounted 注入 status-bar.html 并调 setupStatusBar()
├── status-bar.html         # 状态栏静态 HTML 模板(?raw 导入)
├── status-bar.css          # 单主题糖果粉,全部 .th-* 前缀(~4700 行,视觉升级主战场)
├── status-bar-init.ts      # 状态栏业务逻辑(~1865 行):render 主调度+bindEvents+轮询+setupStatusBar 编排+顶层全局 export
├── lib/
│   ├── icons.ts            # Lucide SVG 映射 + stripFa 拦截器(fa→lucide 全量映射,无白方块)
│   ├── dom-utils.ts        # DOM 查询/工具 + 环境单例(__doc/__abortController/getter-setter)
│   ├── tavern-api.ts       # 酒馆助手 API 封装层
│   ├── managed-store.ts    # managed/tag/stash-kind 数据层 + 类型 + 可变全局
│   ├── config.ts           # 纯常量配置(NPC_METRICS/NPC_COUNTS 含原始敏感词 key)
│   └── variable-review.ts  # 变量审核/快照数据层
├── modules/
│   ├── managed-modal.ts    # location/event/dlc 总览+编辑+关联(最大)
│   ├── stash-modal.ts      # 储藏间 modal+自定义 kind+add form
│   ├── stash-io.ts         # 储藏间导入导出/初始数据/运行时导入
│   ├── tag-manager.ts      # 标签管理 modal+批量打标
│   ├── wb-inspector.ts     # 世界书识别器 modal+条目编辑器
│   ├── npc-detail.ts       # NPC 详情+属性+画廊
│   ├── hover-tip.ts        # hover tip/metric wheel/状态·衣物详情/地点 hover
│   ├── item-skill-grid.ts  # 物品/技能网格+详情+bag/skill 弹窗
│   ├── appearance-settings.ts  # 外观设置面板(13 项自定义,data 属性重绑+持久化)
│   └── api-settings.ts     # API 设置面板(配置+测试连接+预设管理,预留地基)
└── PROGRESS.md             # 本文件
```

---

## 4. 不要破坏的约束

- 单主题糖果粉;**不要加 dark mode / 主题切换**(外观设置的"强调色/背景"只在糖果调色板内换,不引入 dark)。
- 悬浮球只做展开面板入口(球 tip 已删除,不要恢复)。
- 图标优先 Lucide SVG(经 stripFa 拦截器);不要新增 emoji 图标。
- **不要在 `.th-fab-panel` 上加 transform/filter/perspective/backdrop-filter**(Shell.vue 的球面板容器,非状态栏)。
- 主角名提取逻辑沿用 0612:第一个非 `user/{{user}}/<user>` 占位符 key 为主角。不要随意重写。
- 不要引入 jQuery 或 UI 框架之外的 DOM 库。
- 不要长期跑 `pnpm watch`。
- localStorage key 命名:`_th_*`(带 `_vN` 版本号)。
- **储藏间永不绑世界书**:`bindsWorldbook:false`。
- **不要用 `qsRoot(..., document.body)` 查询 wrapper 内元素** — 用 `qs()`。
- **fa 图标拦截器必须同时装 iframe 和 parent 的 `Element.prototype`**。
- **`lib/icons.ts` 的 `inner()` 必须保留 undefined 防御**。新增 lucide 导入前先确认 named export 存在。
- **外观设置各项默认值 = 维持现状**(默认开:呼吸光晕/流光薄雾/玻璃模糊都开),玩家想关再关。

### 4.1 可变全局引用规则
- 对象引用型(`managedEntryStates`/`currentManagedItems`/`showRecentOnly`/`showFavOnly`/`batchMode`/`batchSelection`):`export let` + `import {}` 同一对象引用,只读写属性,**禁止整体赋值**。
- 会被整体重新赋值的(`currentData`/`isEditMode`/`avatarImages`/`uploadingTarget`/`currentFilterTag`/`currentlyCollapsed`):走 getter/setter(`getCurrentStatusData()`/`getStatusEditMode()`/`getAvatarImages()`/`setUploadingTarget()`/`getCurrentFilterTag()`/`getCurrentlyCollapsed()`),**禁止 import 侧直接赋值**(会断引用)。

### 4.2 跨窗口陷阱(头像上传 bug 根因,必读)
脚本跑在 **unsandboxed iframe**;inline `onclick` 在 **parent 文档上下文**执行(`window`=parent),模块/`addEventListener` 在 **iframe 上下文**(`window`=iframe)。inline onclick 设 `window.__x__` 会落在 parent 窗口,iframe 代码读 `window.__x__` 读 iframe 窗口(空)→ 错位。**所有按钮交互必须用 data 属性 + iframe 内 addEventListener 委托**,不要用 inline onclick。

---

## 5. 元规则(所有后续会话必读)

1. 出现不清楚/语意不明时,不要自己猜,直接询问用户。
2. **AI 无法将代码导入酒馆**。改完代码若要用 mcp 验证,需先让用户导入并确认。
3. **代码全部 build 完毕后,用通俗易懂的语言告诉用户改了什么,并为用户设计对应的验收计划**。不要只输出"build 通过"一行。
4. **不要拍截图**(token 消耗大)。MCP 验证用 evaluate_script / take_snapshot。
5. **新会话开场协议**:先读本文件 + 读 `@types/` + `ls`,再动手。改前先 grep `@types/` 确认签名。
6. **行为变化需用户拍板**,记录在 PROGRESS,等用户验收。
7. **动代码前先备份到 `.backup/<批次>/`**(无 git 回滚)。

---

## 6. 回滚协议:本项目无 git 历史(必读)

`src/前端悬浮球V1/` 虽在 git 工作树内,但**0 文件被 git 跟踪**(`git ls-files src/前端悬浮球V1/` 为空)。`git checkout` **无法还原** V1 源码。

- 回滚只能基于文件备份。每个批次动手前备份到 `src/前端悬浮球V1/.backup/<批次>/`(已加 gitignore,不入产物)。
- 回滚:`cp .backup/<批次>/<file> src/前端悬浮球V1/<path>/ && pnpm build:dev`。
- 已验收批次可清理对应备份(目前保留 P9/P10/P11 等近期备份;早期解耦备份已清理)。

---

## 7. 通用验收清单(每批完成后)

1. **改了什么**:通俗说明改了哪些文件/样式/行为。
2. **build 结果**:`pnpm build:dev` 是否通过,产物是否生成。
3. **验收计划**:列出该批涉及的功能点,让用户导入后逐项点验。
4. **回滚预案**:说明如何回滚(§6)。
5. **下一步**:下一批是什么。

---

## 8. 项目状态总结

- **解耦重构**:✅ 完成(阶段 0+1,主文件 7451→1865 行,行为零变化)。
- **视觉升级**:✅ P1-P11 全部完成验收:
  - P1 美学地基 / P2 微交互 / P3 标签桶重做 / P4 modal 放大+密度 / P5 NPC 详情重做 / P6 右侧菜单按钮 / P7 外观设置面板 / P8 API 设置面板(预留地基)/ P9 系统统一(按钮矩阵+圆角+focus ring)/ P10 精致收尾(滚动条+大图查看器+缓动分化+z-index 变量化+好感槽+空态拟人化+全量 Lucide)/ P11 外观设置扩充(背景主题/饱和度/行高/阴影深度/玻璃强度滑块)+ 进度条刻度线去除 + 敏感词还原。
  - §10.7 补充优化 15 项中,已做:#1 空态拟人化 / #4 好感槽(后去刻度)/ #9 缓动分化 / #10 z-index 变量化 / #11 精致滚动条 / #12 大图查看器 / #15 外观切换平滑。**未做(用户指定不做)**:#2 骨架屏 / #3 count-up / #5 卡片错峰入场 / #6 在场脉冲 / #7 已有 backdrop / #8 已有 reduced-motion / #13 在场脉冲点 / #14 签名主角时刻。
- **未做且不再计划**:视觉升级路线图已全部走完,无后续批次,除非用户提新需求。

> 历史批次的详细规格(§10.0-10.11 视觉升级计划、IA 细化、逐批进度记录)已清理。如需查证某批改了什么,看 `.backup/<批次>/` 快照或 git 提交外的文件对比。

---
---

# ════════════════════════════════════════════════════════════════
# 第二阶段:世界书关联模板 + 初始化管理 + AI总结注入 + 酒馆环境预设
# ════════════════════════════════════════════════════════════════

> 本章是 2026-06-23 起的新功能开发计划。**多会话接手须知**:本章独立自洽,新会话只需读本文件 + `@types/` 关键类型 + `ls` 确认结构即可接手,**不依赖任何历史对话上下文**。每个任务的需求/目的/约束/验收都写全,照此执行即可。

## §A. 新功能总览与背景

### A.0 为什么做(背景)
V1 解耦+视觉升级已全部完成验收(见 §8)。本阶段在已验收基础上扩展 4 大功能,围绕「世界书资产利用」和「AI 辅助建卡」两条主线。**严格向下兼容**:不破坏现有 managed 卡片体系、导入导出逻辑、localStorage key、`[初始·xxx]` 条目名。新功能一律加新条目/新 key/新函数/新模块。

### A.1 四大任务一句话目的
| 任务 | 目的 |
|---|---|
| **任务1 世界书关联模板** | 把地点/事件/DLC 卡片间的双向 links 关联图存进新世界书条目 `[初始·关联]`,支持一键导入恢复整张关联网 |
| **任务2 初始化管理** | 集中管理散落各处的初始化数据,加格式校验/备份/恢复/健康自检,防坏数据崩溃 |
| **任务3 AI总结与注入** | 选世界书→AI提取地点/人物/事件/储藏间4类要素→批量注入为 managed 卡片;含任务池统一发送、重roll、卡片AI重构 |
| **任务4 酒馆环境预设** | 扩展现有 api-settings 面板,调 AI 时能选用酒馆已有的提示词预设;接通现有「预留地基」 |

### A.2 关键技术事实(实现前必读,避免走弯路)
1. **`generate()` 一次调用 = 一次 AI 请求**,无原生「合并多任务」能力。任务池「统一发送」靠把 N 个任务素材拼进**一次请求**的 `user_input`+`injects`,让 AI 返回一份 JSON 数组(N 份结果),再按 `task_id` 拆分。**1 次发送 = 1 份 token**(达省发送/省 token 目的)。
2. **API连接配置 与 提示词预设是两个正交维度**,非互斥。一次 AI 调用 = ①连哪个API(`custom_api` 或酒馆当前源) × ②用哪套提示词(`preset_name` 选酒馆预设 或 内置总结提示词)。`generate({custom_api?, preset_name?})` 同时支持。
3. **储藏间4类变量是嵌套对象**,非纯字符串(见 §A.3)。AI 生成储藏间卡片时 `desc` 必须是对应结构的 JSON 字符串,提示词里写死字段模板。
4. **`generate` 多任务必须串行**(await 逐个调),不能并发——会撞酒馆生成锁。任务池统一发送是把多任务拼进单次请求,不是并发多次请求。
5. **现有「互相关联」** = location/event/dlc 三类 `bindsWorldbook:true` 卡片间的双向 `links`(`ManagedItemV2.links`,localStorage,双向同步逻辑在 `modules/managed-modal.ts:1743`)。储藏间 `bindsWorldbook:false`,不参与关联。

### A.3 储藏间4类变量格式(任务2/3 必须遵守)
来自 `角色卡工作室/此间天地/世界书/[initvar]变量初始化勿开.yaml`:
```
拥有物品:   { 物品名: { 描述, ... } }              # 对象
拥有技能:   { 技能名: { 描述, ... } }              # 对象
状态:       { 状态名: { 效果, 来源, 持续时间 } }   # 对象
当前穿着衣物:{ 衣物名: { 穿着部位, 外观详情, 衣物状态 } } # 对象
```
现有 `stash-io.ts:runtimeValueToDesc` 把对象 `JSON.stringify` 存进卡片 `desc`。AI 生成储藏间卡片时,每类的 `desc` 必须输出对应结构的 JSON 字符串(各字段不同,提示词分写)。

### A.4 实施批次与顺序(每批独立 build + 用户导入验收 + 可回滚)
| 批次 | 内容 | 详细规格 | 依赖 |
|---|---|---|---|
| **批次0** | 变量结构脚本替换 + 衣物字段切换(独立小任务) | §B0 | 无(优先做) |
| **批次1** | 任务1 关联模板 | §B | 无 |
| **批次2** | 任务2 初始化管理 | §C | 任务1(关联条目纳入看板) |
| **批次3** | 任务4 酒馆环境预设 | §D | 无(但任务3依赖它) |
| **批次4** | 任务3 AI总结注入(含任务池/重roll/重构) | §E | 任务4(API配置)+ 任务1(关联联动) |
| **批次5**(可选) | S-7变量直读 + S-12激活监控 | §F | 独立,可后做 |

顺序理由:批次0 是独立小改动(schema 替换 + 衣物切换),优先做;任务3 依赖任务4 的 API 配置能力,故任务4 先做(批次3);任务1 的关联联动被任务3 用,故任务1 先做(批次1)。

### A.5 通用工程约束(全任务遵守,沿用 §4/§5/§6 地基)
- **向下兼容**:不删/不改现有 `[初始·xxx]` 条目名、不改现有 localStorage key、不破坏现有函数签名;新功能加新条目/新key/新函数/新模块。
- **UI 风格**:糖果粉单主题(§4,不引 dark);Lucide 图标(经 `stripFa`);沿用 `.th-btn-sm`/`.th-edit-input`/`.th-edit-select`/`.th-appearance-switch`/`.th-modal-*` 等现有基元;新 CSS 类前缀 `.th-init-*`/`.th-ai-*`/`.th-presetenv-*`/`.th-links-*`;不引 jQuery/UI 框架之外的库。
- **命令式实现**:新模块沿用命令式 innerHTML + `openModal2` + data属性委托(同 `api-settings.ts`/`appearance-settings.ts`),**不引 Vue**(memory 判定 Vue 化不做,本次复杂交互用命令式+轮询兜底)。
- **错误处理**:所有 AI 调用/世界书读写/JSON 解析统一 `try/catch`+`toastr`+`console.warn`,抽 `safeRun(label, fn)` helper(§G);破坏性操作走统一确认 modal(§G)。
- **可变全局规则**(§4.1/4.2):新模块持状态用模块闭包单例(仿 `api-settings.ts` 的 `st:PanelState|null`),不碰 `currentData`/`isEditMode` 等 whole-reassigned 全局,读这些走现有 getter。
- **localStorage key**:命名 `_th_*`+`_vN` 版本号;全部集中登记到 `lib/config.ts` 的 `INIT_LS_KEYS` 常量对象(§G),便于任务2备份枚举。
- **无 git 回滚**(§6):每批动手前备份到 `src/前端悬浮球V1/.backup/<批次名>/`(links-init/init-manager/preset-env/ai-summarize)。已加 gitignore 不入产物。
- **tsc 复查**:每批 `pnpm build:dev` 后跑 `npx tsc --noEmit -p tsconfig.json` 查 TS2304/2305/2306/2459(build:dev 走 transpileOnly 不报漏 export)。
- **跨窗口陷阱**(§4.2):所有按钮交互用 data 属性 + iframe 内 addEventListener 委托,不用 inline onclick。
- **储藏间永不绑世界书**(§4):`bindsWorldbook:false` 不变;关联图只管 location/event/dlc 三类。

### A.6 涉及文件清单(新增4模块 + 修改若干)
**新增模块**(4 个,均放 `modules/`):
| 文件 | 批次 | 职责 |
|---|---|---|
| `modules/links-init.ts` | 1 | 关联图序列化/反序列化 + `[初始·关联]` 读写 + 增量合并 + 一键导入 |
| `modules/init-manager.ts` | 2 | 初始化管理总览(看板+校验+备份/恢复/重置+健康自检) |
| `modules/preset-env.ts` | 3 | 酒馆提示词预设读取器/选择器(被 ai-summarize 与 api-settings 共用) |
| `modules/ai-summarize.ts` | 4 | 任务池+提示词管理器+AI调用+智能注入路由+重roll+卡片重构 |

**修改文件**:
| 文件 | 批次 | 改动 |
|---|---|---|
| `lib/config.ts` | 1/4 | 加 `INITIAL_ENTRY_NAMES.links`/`INITIAL_ENTRY_KINDS`映射、`INIT_LS_KEYS`字典、`AI_SUMMARY_PROMPTS`(6套内置提示词) |
| `lib/managed-store.ts` | 1 | 加 `loadLinksGraph()`/`saveLinksGraph()`/`mergeLinksGraph()` |
| `modules/managed-modal.ts` | 1 | 从 1743 行双向同步逻辑抽出共享 helper `syncBidirLink()`(**行为零变化**,原内联调用改为调 helper,供任务1/3 复用) |
| `modules/stash-io.ts` | 2 | `importStashKind`/`importAllStashKinds` 导入前加 `validateInitPayload` 校验前置闸门;`mergeInitialDataIntoLocal` 加差异预览钩子(**只加校验/预览,不接管同名覆盖逻辑**) |
| `modules/api-settings.ts` | 3 | 末尾加「酒馆提示词预设」区块;导出 `getActiveApiConfig()` 给任务3 |
| `status-bar.html` | 2/4 | `th-menu-item` 行(现尾项「API设置」「外观设置」后)加2按钮:「初始化管理」「AI总结注入」 |
| `status-bar-init.ts` | 1-4 | import 新模块入口 + bindEvents 挂新按钮 click(约1101-1105行同类挂载处);启动时按需初始化 |
| `status-bar.css` | 1-4 | 新模块样式(糖果粉+Lucide+现有基元) |

### A.7 世界书实际资产分布(任务3 选材依据)
`角色卡工作室/此间天地/世界书/` 共 928 文件:`[事件]`760 + `[地点]`113 + 角色档案32 + 变量类6 + 设定类(世界观/关系/速览/NSFW/叙事指南/词汇库/肉体描写规则)若干 + `[初始·xxx]`4。状态栏目前只用了 `[地点]/[事件]/[DLC]/储藏间`,角色档案等静态设定资产未利用——任务3 的角色档案提取(#31)正是利用这块。

---

## §B0. 批次0 · 变量结构脚本替换 + 衣物字段切换(独立小任务,优先做)

> 两个独立小改动,优先于批次1-4 完成。批次备份:`.backup/b0-schema-clothing/`。

### B0.1 任务A:替换变量结构脚本
- **文件**:`角色卡工作室/此间天地/脚本/变量结构脚本.js`(当前是旧版 schema)。
- **动作**:用用户提供的**新版 Schema** 整体替换该文件内容(新版见 B0.5 完整代码)。
- **新版变化要点**(相对旧版):
  - `AttributeSchema` = `z.intersection(固定十维, z.record(额外属性))`(旧版无 intersection record)。
  - `SkillSchema`/`ItemSchema` 新增 `评价` 字段(z.string.describe('打破第四面墙...'))。
  - `ClothingSchema` **新增 3 字段**:`穿着情况`(enum:穿着/脱下,默认穿着)、`破损状态`(enum:完好无缺/轻微破损/中度破损/严重破坏,默认完好无缺)、`评价`(z.string)。
  - 抽出 `BaseCharacterSchema`({属性,姿态动作,状态,身体状态,当前穿着衣物,拥有物品,拥有技能}),`{{user}}` 和 `NPC` 都 extend 它;`{{user}}` 加 {位置,货币},NPC 加 {身份,生日日期,基础外貌,内心想法,当前情绪状态与心情,当前本能渴望,心动值/兴奋值/情欲值/敏感值/羞耻值,高潮次数/被内射次数,是否在场}。
  - 注意:`BaseCharacterSchema` 作为被 extend 的基类**不能调用 `.prefault()`**(zod 限制:prefault 后不可 extend,见 `.cursor/rules/mvu角色卡.mdc` z.extend limit)。
- **约束**:遵循 mvu 角色卡规则(`.cursor/rules/mvu角色卡.mdc`)——保留开头 `import { registerMvuSchema }` 和结尾 `$(() => { registerMvuSchema(Schema); })`,只改中间 Schema 定义。替换后该脚本进入角色卡世界书/脚本体系(由 tavern_sync 管理,非 V1 源码)。

### B0.2 任务B:状态栏衣物卡片增加「穿着情况」「破损状态」切换按钮
- **目的**:新 schema 给衣物加了 `穿着情况`(穿着/脱下)和 `破损状态`(4档 enum)两个有限选项字段。状态栏所有衣物显示位置同步显示这两个字段,且在卡片上提供**点击切换按钮**(点击循环切换 enum 值,同步修改变量),逻辑镜像 NPC 在场/离场切换。
- **镜像的范式**:`toggleNpcPresence`(`status-bar-init.ts:483-496`):
  ```
  _.get(npc,'是否在场') → _.set(npc,'是否在场',!current) → _.set(currentData,'NPC',npcs) → saveData(currentData) → collectStatDataChange(currentData,{snapshot:true,label}) → renderCurrent()
  ```
  衣物切换函数仿此:`toggleClothingField(ownerPath, clothingName, field:'穿着情况'|'破损状态')` —— 读当前值 → 切到 enum 下一个 → `_.set` 回 `当前穿着衣物.{name}.{field}` → `saveData` → `collectStatDataChange` → `renderCurrent()`。

### B0.3 需同步改动的衣物显示位置(共4处 + 字段表/默认值)
| # | 位置 | 文件:行 | 改动 |
|---|---|---|---|
| ① | 主角衣物方块渲染 | `status-bar-init.ts:713` `renderClothingBlocks` | 方块上显示穿着情况/破损状态;加点击切换按钮(data 属性委托,§4.2) |
| ② | NPC 衣物 hover(单件) | `hover-tip.ts:114-125` | 显示穿着情况/破损状态(只读) |
| ③ | 衣物 hover(列表) | `hover-tip.ts:224-245` `buildClothingHoverHtml` | 显示穿着情况/破损状态(只读);缓存 key `getClothingCacheKey`(203-205)需加入新字段 |
| ④ | 衣物编辑详情弹窗 | `hover-tip.ts:356-358` | 加穿着情况/破损状态编辑(下拉或分段按钮) |
| ⑤ | 衣物字段表 | `status-bar-init.ts:984` `fieldOrder.clothing` | 加 `'穿着情况','破损状态'`(及 `'评价'` 若显示) |
| ⑥ | 衣物默认值 | `status-bar-init.ts:929` `getDefaultEntry.clothing` | 加 `穿着情况:'穿着',破损状态:'完好无缺'` |
- **NPC 衣物切换**:NPC 衣物卡片(hover 或 npc-detail)也要能点击切换,ownerPath 是 `NPC.{npcName}` 而非 userKey。主角是 `{userKey}`。
- **enum 循环**:`穿着情况` 在 ['穿着','脱下'] 循环;`破损状态` 在 ['完好无缺','轻微破损','中度破损','严重破坏'] 循环。

### B0.4 待确认项(实现前问用户)
1. **`评价` 字段是否在 UI 显示**:新 schema 给衣物/物品/技能都加了 `评价`(z.string 文本)。本小任务用户只说「衣物增加穿着情况与破损状态切换」,`评价` 是否也要在衣物(及物品/技能)显示?**默认:本批次只做衣物的穿着情况/破损状态,`评价` 字段留待后续**(若用户要一起做则补)。
2. **穿着情况=脱下时的显示**:衣物「脱下」时,方块是否灰显/加标记?默认:脱下的衣物方块加 `.is-off` class 灰显,仍在列表但视觉区分。

### B0.5 新版变量结构脚本完整代码(替换 `角色卡工作室/此间天地/脚本/变量结构脚本.js`)
```js
import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';

// 1. 定义基础子模块 Schema
const AttributeSchema = z.intersection(
  z.object({
    实力: z.coerce.number().transform(v => _.clamp(v, 0, 300)).prefault(0),
    魅力: z.coerce.number().transform(v => _.clamp(v, 0, 300)).prefault(0),
    智慧: z.coerce.number().transform(v => _.clamp(v, 0, 300)).prefault(0),
    专注: z.coerce.number().transform(v => _.clamp(v, 0, 300)).prefault(0),
    学识: z.coerce.number().transform(v => _.clamp(v, 0, 300)).prefault(0),
    交流: z.coerce.number().transform(v => _.clamp(v, 0, 300)).prefault(0),
    文艺: z.coerce.number().transform(v => _.clamp(v, 0, 300)).prefault(0),
    经营: z.coerce.number().transform(v => _.clamp(v, 0, 300)).prefault(0),
    手工: z.coerce.number().transform(v => _.clamp(v, 0, 300)).prefault(0),
    家务: z.coerce.number().transform(v => _.clamp(v, 0, 300)).prefault(0),
  }),
  z.record(z.string(), z.coerce.number().transform(v => _.clamp(v, 0, 300)))
).prefault({});

const SkillSchema = z.record(
  z.string().describe('技能名称'),
  z.object({
    简介: z.string().prefault(''),
    等级: z.coerce.number().prefault(1),
    效果: z.string().prefault(''),
    评价: z.string().describe('打破第四面墙，用幽默风趣以及各类多元文化进行点评').prefault(''),
  }).prefault({})
).prefault({});

const ItemSchema = z.record(
  z.string().describe('物品名称'),
  z.object({
    简介: z.string().prefault(''),
    效果: z.string().prefault(''),
    评价: z.string().describe('打破第四面墙，用幽默风趣以及各类多元文化进行点评').prefault(''),
    数量: z.coerce.number().prefault(1),
  }).prefault({})
).prefault({});

const StatusSchema = z.record(
  z.string().describe('状态名称'),
  z.object({
    效果: z.string().prefault(''),
    来源: z.string().prefault(''),
    持续时间: z.string().prefault(''),
  }).prefault({})
).prefault({});

const ClothingSchema = z.record(
  z.string().describe('衣物名称'),
  z.object({
    穿着部位: z.string().prefault(''),
    穿着情况: z.enum(['穿着', '脱下']).prefault('穿着'),
    破损状态: z.enum(['完好无缺', '轻微破损', '中度破损', '严重破坏']).prefault('完好无缺'),
    外观详情: z.string().describe('客观的衣物整体外观和细节的详细描述，至少20字以上').prefault(''),
    衣物状态: z.string().describe('当前的衣物状态是什么样的，如：整洁如新。/打湿，紧贴身体。/大面积破损，勉强挂在腿上').prefault(''),
    评价: z.string().describe('打破第四面墙，用幽默风趣以及各类多元文化进行点评').prefault(''),
  }).prefault({})
).prefault({});

// 2. 提取共用的基础角色模型 (BaseCharacterSchema)
// 注意：这里作为被 extend 的基类，本身不能调用 .prefault()
const BaseCharacterSchema = z.object({
  属性: AttributeSchema,
  姿态动作: z.string().describe('当前从外界来看处于什么样的姿态，正在进行什么样的动作，至少30字以上').prefault('暂无动作'),
  状态: StatusSchema,
  身体状态: z.string().describe('透视视角下的客观身体裸体状态，包括整体描述和身材细节，胸型/乳晕与乳头/腰臀/私密区域等，至少50字以上').prefault('暂无描述'),
  当前穿着衣物: ClothingSchema,
  拥有物品: ItemSchema,
  拥有技能: SkillSchema,
});

// 3. 构建完整的顶层 Schema
export const Schema = z.object({
  世界信息: z.object({
    当前所处区域名称: z.string().prefault('未知区域'),
    具体位置: z.string().prefault('未知地点'),
    日期: z.string().prefault('X年X月X日'),
    时间: z.string().prefault('00:00'),
    天气: z.string().prefault('晴朗'),
  }).prefault({}),

  // {{user}} 继承基础模型，并添加独有字段
  "{{user}}": BaseCharacterSchema.extend({
    位置: z.string().prefault('未知地点'),
    货币: z.object({
      金钱: z.coerce.number().prefault(0),
    }).prefault({}),
  }).prefault({}),

  // NPC 继承基础模型，并添加独有字段
  NPC: z.record(
    z.string().describe('NPC姓名'),
    BaseCharacterSchema.extend({
      身份: z.string().describe('角色在世界观中的主要头衔和职业').prefault(''),
      生日日期: z.string().prefault('未知'),
      基础外貌: z.string().describe('极其详细的客观固定特征描述，至少40字以上。包含：整体印象、发型、面部、身材细节（罩杯与胸型/乳晕与乳头/腰臀/私密区域等）、特殊特征。').prefault(''),
      内心想法: z.string().describe('始终以第一人称视角记录，内容长度至少40字。').prefault(''),
      当前情绪状态与心情: z.string().describe('至少三个词语描述当前的情绪状态与心情').prefault('平静'),
      当前本能渴望: z.string().describe('内心深处潜意识渴望作什么').prefault('无'),
      心动值: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(0),
      兴奋值: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(0),
      情欲值: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(0),
      敏感值: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(0),
      羞耻值: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(0),
      高潮次数: z.coerce.number().prefault(0),
      被内射次数: z.coerce.number().prefault(0),
      是否在场: z.boolean().prefault(false),
    }).prefault({})
  ).prefault({}),
});

$(() => {
  registerMvuSchema(Schema);
})
```

### B0.6 验收清单(批次0 完成后用户导入逐项点验)
1. **脚本替换**:`角色卡工作室/此间天地/脚本/变量结构脚本.js` 内容为新版(含 BaseCharacterSchema、ClothingSchema 含穿着情况/破损状态/评价);酒馆加载该脚本无报错(可在控制台验 `window.Mvu` 与 schema 注册)。
2. **主角衣物方块**:状态栏主角衣物方块显示穿着情况/破损状态;点击「穿着情况」在穿着/脱田间循环切换;点击「破损状态」在4档循环切换;切换后变量同步更新(刷新状态栏值正确)。
3. **NPC 衣物切换**:NPC 衣物卡片同样能点击切换穿着情况/破损状态,变量同步(`NPC.{name}.当前穿着衣物.{衣物}.{字段}`)。
4. **切换逻辑镜像在场/离场**:切换走 `saveData`+`collectStatDataChange`+`renderCurrent`(同 `toggleNpcPresence`),不破坏现有编辑保存链。
5. **hover 浮窗(单件+列表)**:衣物 hover 显示穿着情况/破损状态;缓存 key 含新字段(改值后 hover 内容更新,不显示旧缓存)。
6. **编辑弹窗**:衣物详情弹窗能编辑穿着情况/破损状态(下拉或分段)。
7. **脱下视觉**:穿着情况=脱下的衣物方块灰显/标记区分。
8. **字段表/默认值**:新增衣物时默认 `穿着情况:'穿着',破损状态:'完好无缺'`(getDefaultEntry);fieldOrder 含新字段。
9. **tsc**:`npx tsc --noEmit` 无新增 TS2304/2305/2306/2459。
10. **无回归**:现有衣物方块渲染、hover、编辑、NPC 在场/离场切换全部正常。
- **回滚**:`cp .backup/b0-schema-clothing/<file> ... && pnpm build:dev`(脚本文件单独回滚:从备份恢复 `变量结构脚本.js`)。

---

## §B. 批次1 · 任务1 世界书关联初始化模板

> 模块:`modules/links-init.ts`(新建)。批次备份:`.backup/links-init/`。

### B.1 目的与范围
把 location/event/dlc 三类 managed 卡片(`bindsWorldbook:true`)之间的双向 `links` 关联图,序列化存进新世界书条目 `[初始·关联]`,支持一键导入恢复整张关联网。**只存关联关系,不存卡片内容**(内容仍走现有 `[初始·地点]` 等)。储藏间(`bindsWorldbook:false`)不参与。

### B.2 数据结构
```yaml
# [初始·关联] 条目 content 是 JSON 字符串:
{
  "format": "th-links-graph-v1",   # 版本号,v1 占位,未来结构变了能识别旧数据迁移
  "links": {
    "location": { "甘霖天池": { "locations": [...], "events": [...], "dlcs": [...] }, ... },
    "event":     { "事件名": { ... }, ... },
    "dlc":       { "DLC名": { ... }, ... }
  }
}
```
- 形状直接复用 `ManagedItemV2.links`(见 `lib/managed-store.ts:18`):`{locations?,events?,dlcs?}`,每个是 string[]。
- 序列化遍历 `location/event/dlc` 三类 `currentManagedItems`,收集每张卡片的 `item.links`。

### B.3 config.ts 改动
- `INITIAL_ENTRY_NAMES` 加 `links: '[初始·关联]'`(见 `lib/config.ts:90`)。
- `INITIAL_ENTRY_KINDS` 加 `'[初始·关联]': ['location','event','dlc']` 三类(见 `config.ts:98`)。

### B.4 managed-store.ts 新增函数(关联图 CRUD,复用现有 managed items)
- `loadLinksGraph(): LinksGraph` —— 从 `currentManagedItems` 的 location/event/dlc 收集 `links`,组装成图。
- `saveLinksGraph(graph)` —— 本地无独立存储(关联图就是 managed items 的 links 投影),此函数仅用于触发 `saveManagedOverrides` 落盘三类。
- `mergeLinksGraphIntoLocal(graph): {added,skipped,orphans}` —— 增量合并:对图中每条 `A.links.X=[B,...]`,本地 A 已有该关联则跳过(尊重玩家改动),缺失则补;补完后**自动补反向关联**。
- **双向同步 helper**:从 `managed-modal.ts:1743` 抽出 `syncBidirLink(kind,name,field,targetKind,targetName,add:boolean)` 共享函数,供任务1合并和任务3注入联动复用(避免重复实现双向同步)。

### B.5 links-init.ts 主要函数(仿 `stash-io.ts` 初始数据范式)
- `readLinksGraphFromWorldbook(): Promise<LinksGraph>` —— 仿 `stash-io.ts:readInitialDataFromWorldbook`,遍历 `getCharWorldbookList()`,找名为 `[初始·关联]` 的条目,解析其 content(多本同名合并)。
- `mergeLinksGraphIntoLocal(graph)` —— 见 B.4。
- `writeLinksGraphToInitial(mode:'overwrite'|'merge')` —— 收集本地关联图,`overwrite`=全量覆盖写,`merge`=与旧 content 去重合并(`mergeStashInitialContent` 同款合并逻辑);不存在则 `createInitialWorldbookEntry`(蓝灯 constant+禁用,与现有初始条目一致,见 `stash-io.ts:453`)。
- `openImportLinksConfirmModal()` —— 一键导入确认 modal:读图→合并→toast「补入 N 条关联,跳过 M 条已存在」。
- `exportLinksGraphFile()` / `importLinksGraphFile(text)` —— 文件导入导出(`downloadText`),与世界书条目互为逆操作。
- `openLinksPreviewModal(graph)` —— 导入前列表预览:「A → B, C」清单,限高滚动;只做列表不做树。

### B.6 功能点清单(对应总览#1-7)
| # | 功能 | 实现位置 |
|---|---|---|
| 1 | 新建 `[初始·关联]` 条目 | `config.ts` + `createInitialWorldbookEntry` 复用 |
| 2 | 关联图序列化 | `loadLinksGraph` |
| 3 | 一键导入 | `readLinksGraphFromWorldbook`+`mergeLinksGraphIntoLocal`+`openImportLinksConfirmModal` |
| 4 | 写入(全量/增量) | `writeLinksGraphToInitial(mode)` |
| 5 | 孤儿关联自检 | 合并后扫「图引用但本地无的卡片名」→`openOrphanLinksModal`:忽略/建占位卡片(打`待补全`标签,空desc不进配发) |
| 6 | 文件导入导出 | `exportLinksGraphFile`/`importLinksGraphFile` |
| 7 | 导入前列表预览 | `openLinksPreviewModal` |

### B.7 入口
- 总览面板(`managed-modal.ts`)现有「导出」旁加「导出关联图」「导入关联图」按钮。
- 储藏间面板同理(若需要)。
- 任务2 初始化管理面板(批次2)会把关联读写也收拢进去(B.7 入口保留,向下兼容)。

### B.8 验收清单(批次1 完成后用户导入 `dist/前端悬浮球V1/index.js` 逐项点验)
1. **建关联**:建 3 张地点卡 A/B/C,A 关联 B、A 关联 C → 点「导出关联图」→ 文件下载,JSON 含 `format:th-links-graph-v1` 且 links 正确。
2. **写入条目**:点「写入 `[初始·关联]`」(全量)→ 世界书出现 `[初始·关联]` 条目,蓝灯+禁用,content 是关联图 JSON。
3. **导入恢复**:清空本地 A/B/C 关联(手动删关联)→ 点「一键导入」→ 关联图恢复,A↔B、A↔C 双向同步正确(补关联自动补反向)。
4. **增量不覆盖**:导入前手动改 A 关联 D → 导入 → A 的 D 关联保留不丢,新增 B/C 关联正常补入。
5. **孤儿关联**:导入一个引用了本地不存在卡片 X 的关联图 → 弹孤儿提示 → 选「建占位卡片」→ 出现 X 占位卡(标`待补全`,desc 空)。
6. **写入模式**:全量覆盖 vs 增量合并 两种模式结果符合预期(全量=以本地为准重写条目;增量=条目旧关联保留+本地新关联补入)。
7. **预览**:导入前弹列表预览,显示「A → B, C」清单,确认才执行。
8. **tsc**:`npx tsc --noEmit` 无新增 TS2304/2305/2306/2459。
9. **无回归**:现有地点/事件/DLC 卡片的关联编辑、配发、双向同步全部正常(纯新增,不动现有逻辑)。
- **回滚**:`cp .backup/links-init/<file> src/前端悬浮球V1/<path>/ && pnpm build:dev`。

---

## §C. 批次2 · 任务2 初始化管理模块

> 模块:`modules/init-manager.ts`(新建)。批次备份:`.backup/init-manager/`。

### C.1 目的与范围
把目前散落在总览/储藏间面板各处的初始化按钮和初始数据,集中到一个「初始化管理」面板统一管。新增:内容看板、格式正确性检查、统一备份/恢复/恢复出厂、健康自检。**原各处初始化入口保留不动**(向下兼容),本面板是统一入口的补充。

### C.2 面板结构(`openInitManager()` → `openModal2`,maxWidth: min(820px,94vw))

**① 内容看板**:列出全部 5 个初始条目(`[初始·地点]`/`[初始·事件]`/`[初始·DLC]`/`[初始·储藏间]`/`[初始·关联]`),每行:
- 条目名 + 所在世界书(可能多本)+ 卡片数/关联数 + 健康状态(见③)
- 「读取」「写入」「编辑」三按钮(读取=合并入本地;写入=导出本地到条目;编辑=直接改条目 content,复用 wb-inspector 的条目编辑器)

**② 格式正确性检查器**:内置 `validateInitPayload(text, type)`:
- JSON 路径:`jsonrepair` 容错修复 → `JSON.parse` → `zod` schema 校验(每个 type 一个 zod schema:单 kind 数组 / 多 kind `{format,groups}` / 关联图 `th-links-graph-v1`)
- YAML 路径:`yaml.parse` → 同 zod 校验(支持玩家用 YAML 写初始数据)
- UI:粘贴文本框 + 实时红/绿提示 + 错误定位(`z.prettifyError` 格式化)

**③ 健康度 + 自检报告**(合并 2-4/2-5,不拆两个功能):
- 看板每行标:条目存在于哪几本世界书、content 能否解析、卡片数是否为 0、有无重复同名条目(多本合并提醒)
- 一个「全面自检」按钮 → 生成报告:列出所有解析失败条目、孤儿关联、损坏 localStorage 块

**④ 统一备份/恢复/重置**:
- **备份**:一键导出全部 5 个初始条目 content + 全部 managed localStorage(`_th_locations_v2` 等见 §G `INIT_LS_KEYS`)+ 标签字典 + 关联图,打包单个 `th-init-backup-YYYYMMDD.json`
- **恢复**:从快照导入,给「仅初始条目 / 仅本地卡片 / 全部」三选
- **恢复出厂**:清空 managed 卡片数据(保留标签字典与外观设置,仅清卡片)→ 二次确认 → 重读初始条目重建

### C.3 关键约束(实现注意)
- **校验作为导入前置闸门**(#12):现有 `importStashKind`/`importAllStashKinds` 在导入前先调 `validateInitPayload`,坏数据直接 toast 拦截+定位。**只拦坏数据,不接管现有同名覆盖确认逻辑**(不破坏现有流程)。
- **读取前差异预览**(#13):读初始数据前先 diff「本地已有 vs 待读入」,弹窗列将新增卡片名,玩家确认才合并(`mergeInitialDataIntoLocal` 改造,列表限高滚动)。
- 破坏性操作(恢复出厂/覆盖写入/删快照)统一走 `openReadInitialConfirmModal` 同款确认 modal(§G)。
- 备份快照格式带版本号 `format:'th-init-backup-v1'`,字段:`{version, initEntries:{name:content}, managed:{storageKey:data}, tags, linksGraph, exportedAt}`。

### C.4 功能点清单(对应总览#8-17)
| # | 功能 | 实现位置 |
|---|---|---|
| 8 | 面板入口 | `status-bar.html`加按钮 + `status-bar-init.ts`挂click + `openInitManager` |
| 9 | 内容看板 | `renderInitDashboard` |
| 10 | 健康度+自检报告 | `renderHealthRow`+`runFullDiagnostic` |
| 11 | 格式正确性检查器 | `validateInitPayload`+校验UI |
| 12 | 校验前置闸门 | 改 `importStashKind`/`importAllStashKinds` |
| 13 | 读取前差异预览 | `openDiffPreviewModal`+`mergeInitialDataIntoLocal`改造 |
| 14 | 统一备份快照 | `exportInitBackup` |
| 15 | 快照恢复 | `openRestoreModal`+`restoreInitBackup` |
| 16 | 恢复出厂 | `openFactoryResetConfirm`+`factoryResetManaged` |
| 17 | 入口整合 | 面板内含关联读写(任务1)+ AI总结入口(任务4,批次4补) |

### C.5 入口
- `status-bar.html` 的 `th-menu-item` 行,在「API 设置」「外观设置」后加「初始化管理」按钮(`fa-solid fa-sliders` 或 Lucide)。
- `status-bar-init.ts` bindEvents 挂 click(约 1101-1105 行同类挂载处)。
- 任务1 的关联读写、任务3 的 AI 总结,后续批次把入口也收拢进本面板(#17),同时保留各自独立入口。

### C.6 验收清单(批次2 完成后用户导入逐项点验)
1. **入口**:设置菜单出现「初始化管理」按钮,点击打开面板;原各处初始化按钮仍在(向下兼容)。
2. **看板**:列出 5 个初始条目,每行显示条目名/世界书/卡片数/健康状态正确。
3. **健康度**:故意把某条目 content 改成非法 JSON → 该行健康度标红「解析失败」;空条目标「卡片数 0」;多本同名条目提醒「合并自 N 本」。
4. **格式校验**:粘贴合法 JSON → 绿提示;粘贴非法 JSON → 红提示+错误定位;YAML 同理。
5. **校验前置**:用现有储藏间导入功能导入一份坏 JSON → 被 toast 拦截+定位,不进 localStorage;导入好 JSON 正常走原有同名覆盖确认流程。
6. **差异预览**:读初始数据前弹差异预览,列出将新增的卡片名,确认才合并;本地已有的不重复进。
7. **备份**:点「备份」→ 下载 `th-init-backup-日期.json`,含 5 条目+managed+标签+关联图。
8. **恢复**:从快照恢复,选「仅初始条目」→ 只恢复条目 content;选「仅本地卡片」→ 只恢复 managed;选「全部」→ 全恢复。恢复前二次确认。
9. **恢复出厂**:点「恢复出厂」→ 二次确认 → managed 卡片清空(标签/外观保留)→ 重读初始条目重建。
10. **自检报告**:点「全面自检」→ 报告列出所有问题条目/孤儿关联/损坏 localStorage。
11. **tsc**:无新增 TS2304/2305/2306/2459。
12. **无回归**:现有储藏间/总览的导入导出、初始数据读写全部正常。
- **回滚**:`cp .backup/init-manager/<file> ... && pnpm build:dev`。

### C.7 实施进度记录(2026-06-24)

**已完成(✅):**
- ✅ Step1 `lib/config.ts`:`INIT_LS_KEYS` 字典(managed 8 个 key + tags/stashKinds/groupCollapsed + customStashPrefix + 预留 aiPrompts/aiTaskpool/presetenvActive)、`INIT_BACKUP_FORMAT='th-init-backup-v1'`。
- ✅ Step2 `modules/stash-io.ts`:
  - import jsonrepair/yaml parse/zod。
  - `export function createInitialWorldbookEntry`(从主文件抽出)。
  - `export type InitPayloadType = 'location'|'event'|'dlc'|'stash'|'links'`。
  - `INIT_ITEM_SCHEMA`/`INIT_MULTI_SCHEMA`/`INIT_LINKS_SCHEMA`(zod v4:`z.object().passthrough()` + `z.record(keySchema, valSchema)` 二参)。
  - `export function validateInitPayload(text, type): {ok, errors[], repairedText?}` — JSON 走 jsonrepair→JSON.parse→zod;YAML 走 yaml.parse→zod。
  - `function inferStashKindsFromPayload` + `function assertImportPayload`(导入闸门,toast 拦截坏数据,不接管同名覆盖 confirm)。
  - `importStashKind`/`importAllStashKinds` 前插 `assertImportPayload` 闸门。
  - `mergeInitialDataIntoLocal(parsed, opts?:{onPreview?})` 新增可选 onPreview,默认无保持原行为。
  - `export function openDiffPreviewModal(willAdd): Promise<boolean>`(openModal2 差异列表)。
  - tsc:无我引入的 TS 错误(仅 pre-existing TS7053 TagsByKind 索引报错,backup 版本同样存在,非我引入)。
- ✅ 备份:`.backup/init-manager/`(config.ts/stash-io.ts/wb-inspector.ts/status-bar.html/status-bar-init.ts/status-bar.css)。

**已完成 Step3-5（2026-06-24）：**
- Step3 `modules/init-manager.ts`（新建，~430 行）：`openInitManager`→openModal2（`maxWidth min(820px,94vw)`），5 区全部实现 —— ① `gatherInitState`/`renderInitDashboard`（5 条目行：条目名/所在世界书/卡片数/健康徽章 missing|empty|parse-error|ok + 读取+写入+编辑，逐本实例 `validateInitPayload` 校验，多本合并提示「合并自 N 本」）；② `renderValidator`/`runValidator`（粘贴框 + type 下拉(5 类) + 防抖实时红/绿 + 错误定位，调 `validateInitPayload`，显示 jsonrepair 容错修复提示）；③ `renderHealthRow`/`collectOrphanRefs`/`runFullDiagnostic`（全面自检：解析失败条目/孤儿关联/损坏 localStorage 三类扫描）；④ `exportInitBackup`/`openRestoreModal`/`restoreInitBackup`/`openFactoryResetConfirm`/`factoryResetManaged`（备份 `th-init-backup-v1`，恢复「仅初始条目/仅本地卡片/全部」三选；恢复出厂清空 managed 重读重建，保留标签/外观/类别定义）；⑤ `renderLinksSection`（导出关联图/写入[初始·关联]覆盖二次确认/一键导入恢复，收拢批次1 入口）。`wb-inspector.ts` export `openWorldbookEntryDetail` 供看板「编辑」复用（行为零变化）。
- Step4 入口接线：`status-bar.html`「外观设置」后加 `.th-btn-init-manager`（fa-database「初始化管理」）；`status-bar-init.ts` import `{openInitManager}` + bindEvents click（disabled 移除）；`status-bar.css` 末尾加 `.th-init-*` 全套样式（糖果粉 + rose 健康配色 + 复用 `.th-btn-sm/xs/edit-select/edit-textarea` 基元）。
- Step5 收尾：`pnpm build:dev` 通过（产物 `dist/前端悬浮球V1/index.js` 已生成）；`npx tsc --noEmit` — `init-manager.ts`/`wb-inspector.ts` **零错误**，仅 pre-existing TS6133（全库未用变量）+自身噪音（vueuse Bluetooth / lucide-static / @floating-ui 的 TS2307/2304），无我引入的错误。
- **待用户导入验收**：通知用户导入新 `dist/前端悬浮球V1/index.js`批次0（修复）+批次1+批次2 统一验收（见下方验收清单）。
- 🗂️ 备份：`.backup/init-manager/`（含 wb-inspector.ts / status-bar.html / status-bar-init.ts / status-bar.css 前快照；init-manager.ts 是新建文件，回滚直接删除）。

**追加修正（2026-06-24，反馈 1+2）：**
- **首字丢失修复（反馈1）**：逐处补回上轮手误漏掉的首字——「始化→初始化」「康自检→健康自检」「康徽章→健康徽章」「次2→批次2」「令式→命令式」「板入口→面板入口」「新看板→刷新看板」「儿关联→孤儿关联」「一备份/一导出→一键备份/一键导出」「描中→扫描中」「份 /复 /复出厂→备份 /恢复 /恢复出厂」「签字典→标签字典」「认恢复→确认恢复」「复→恢复」「份→备份」「坏 localStorage→损坏 localStorage」「−次2 任务2→批次2 任务2 初始化管理」；WB-inspector 注释「次2…板」→「批次2…面板」；PROGRESS §C.7 注释「disabled除」「rose康配色」等同步修正。覆盖 `init-manager.ts`/`status-bar-init.ts`/`status-bar.css`/`status-bar.html`/`wb-inspector.ts`/`PROGRESS.md`。
- **可视化编辑器（反馈2）**：新建 `modules/init-visual-editor.ts`（约 430 行）—— `openVisualEditor(key)` 直接编辑世界书条目 content（不触碰 localStorage managed 卡片，不污染运行时数据）：扫码读条目 → modal 按卡片网格可视化增删改（name/desc/tags/inject/links 5 字段）→ 确认后严格序列化覆盖写回同一条目（`safeUpdateWorldbookWith`），格式自动保合法。5 类全支持：location/event/dlc 走单 kind JSON 数组、stash 走 `{format,groups}` 多 kind（物品/技能/状态/衣物分组）、links 走 `{format,links}` node 网格（name→{locations,events,dlcs} CSV 输入）。links 引用本地不存在卡片名时给警告+二次确认（不阻断，允许占位）。
- **接线**：`init-manager.ts` 看 5 行各加第 4 按钮「可视化」（`.th-btn-visual` + `data-init-act="visual"`，handler 调 `openVisualEditor`）；`status-bar.css` 末尾加 `.th-init-ved-*` 全套样式；`init-manager.ts` import `openVisualEditor`。
- **构建**：`pnpm build:dev` 通过（`dist/前端悬浮球V1/index.js` 含可视化编辑器代码）；`npx tsc --noEmit` — `init-visual-editor.ts`/`wb-inspector.ts` **零错误**，仅 pre-existing 噪音。
- 🗂️ 备份：`.backup/init-visual-editor/`（改动前快照含 init-manager.ts/status-bar.css/status-bar-init.ts/status-bar.html/wb-inspector.ts）。回滚：`cp .backup/init-visual-editor/{init-manager.ts,wb-inspector.ts} modules/ && cp .backup/init-visual-editor/{status-bar.css,status-bar.html,status-bar-init.ts} ./ && rm modules/init-visual-editor.ts && pnpm build:dev`。

**批次0/1 状态(待用户统一验收):** 批次0 schema替换+衣物切换已完成(含反馈1 hover闪烁修复:MCP 定位 carUpdate 每帧触发,改单次快照定位+parent scroll/resize);批次1 `links-init.ts` 已完成+调试挂载。均待导入实测。

---

## §D. 批次3 · 任务4 酒馆环境预设集成

> 模块:`lib/preset-env.ts`(新建，共享层)+ 扩展 `modules/api-settings.ts`(+`status-bar.css`)。批次备份:`.backup/preset-env/`。

> **状态(2026-06-24)：✅ Step1-4 完成，待用户导入验收**。`lib/preset-env.ts`（约 200 行，preset/generate 全局接口兜底封装）+ `api-settings.ts` 末尾加「AI 总结来源（两维度正交）」新区块（①API连接 单选 × ②提示词预设 下拉+详情+导出+切全局+测试+预览+仅本次有效复选）+导出 `resolveGenerateApiConfig`/`exportEnvPresetSnapshot`/`getEnvPresetNames` 等。`pnpm build:dev` 通过，`tsc --noEmit` 新文件零错误。见 D.10 实施记录。

### D.1 目的与范围
扩展现有 `api-settings.ts` 面板(当前是「预留地基」未接 generate),让我们调 AI 时能**选用酒馆已有的提示词预设**(`getPresetNames()`)作为提示词。接通现有预留地基,导出 `getActiveApiConfig()` 给任务3 AI 总结调用。

### D.2 核心设计:两维度正交(A.2 第2点)
一次 AI 调用配置 = **①API连接** × **②提示词预设**,两个独立维度:
- **①API连接**(沿用现有 `_th_api_presets_v1`):选某个自定义 API 预设(走 `custom_api`,带 source/apiurl/key/model) 或 选「酒馆当前源」(不带 custom_api)。
- **②提示词预设**(新):选某个酒馆提示词预设名(走 `preset_name`) 或 选「内置总结提示词」(任务3的6套,不传 preset_name,用 `generate({user_input, json_schema})` 自带提示词)。
- `generate({ custom_api?, preset_name? })` 同时支持两维度,互不冲突。

### D.3 preset-env.ts(共享层,被 ai-summarize 与 api-settings 共用)
- `getEnvPresetNames(): {name, isLoaded}[]` —— `getPresetNames()` 列表 + 标记当前 `getLoadedPresetName()`。
- `loadEnvPreset(name)` / `getEnvPresetDetail(name): {prompts, settings, promptCount}` —— `loadPreset`/`getPreset`,返回主要字段(系统提示词、温度、流式、max_context、prompts 列表)供面板展示。
- `exportEnvPresetSnapshot(name)` —— `getPreset(name)` 导出 JSON 文件备份。
- `resolveGenerateApiConfig(): GenerateConfig` —— 读 api-settings 活动预设 + 面板选的提示词预设,组装成 `generate` 的 `{custom_api?, preset_name?}`。优先级见 D.2。

### D.4 api-settings.ts 扩展(在面板末尾「完成」按钮上方加区块)
- **「AI 来源」单选段**:「自定义 API」/「酒馆当前源」(对应①的两选项)。
- **「提示词预设」区块**:下拉选 `getEnvPresetNames()` + 「查看详情」(modal 显示 prompts 列表/参数)+ 「设为 AI 总结默认」单选 + 「仅本次有效」复选框(D.6)。
- 导出 `getActiveApiConfig(): GenerateConfig` 给任务3 ai-summarize 调用(实现现有面板注释里「实际接入 generate 流是以后的事」→ 现在做掉)。
- 持久化:`_th_presetenv_active_v1`(选的提示词预设名 + 仅本次有效标志)。

### D.5 连接测试(两种模式)
- 选自定义 API 时「测试连接」走现有 `getModelList`(api-settings.ts:257 已有)。
- 选酒馆当前源/环境预设时改为「发送测试 prompt」:`generateRaw({ordered_prompts:[{role:'user',content:'ping'}], should_silence:true})` 一句 ping,验证预设+源可用。

### D.6 「仅本次有效」选项(#40)
选提示词预设时勾「仅本次有效」→ AI 总结用 `generate({preset_name})` 临时指定,**不调 `loadPreset`**,不影响玩家正常聊天用的预设。不勾 → 调 `loadPreset` 切换酒馆全局预设(影响正常聊天,慎用,给提示)。

### D.7 功能点清单(对应总览#34-41)
| # | 功能 | 实现位置 |
|---|---|---|
| 34 | 两维度正交配置 | `resolveGenerateApiConfig` |
| 35 | 提示词预设选择器 | api-settings.ts 新区块 + `getEnvPresetNames` |
| 36 | 预设详情查看 | `getEnvPresetDetail` + 详情 modal(不做对比) |
| 37 | 环境预设快照导出 | `exportEnvPresetSnapshot` |
| 38 | 两种连接测试 | `getModelList` + `generateRaw` ping |
| 39 | 接通预留地基 | `getActiveApiConfig` 导出 |
| 40 | 仅本次有效 | D.6 复选框逻辑 |
| 41 | 发送前预览 | `previewGeneratePayload`(见 D.8) |

### D.8 发送前预览(#41)
点「预览发送内容」:`getPreset` 读选中提示词预设的 prompts + 拼装 user_input + injects → 展示最终将发给 AI 的提示词文本(modal,不实际发送)。调提示词时能看实际效果,避免盲调。

### D.9 验收清单(批次3 完成后用户导入逐项点验)
1. **提示词预设选择器**:API 设置面板出现「提示词预设」区块,下拉列出 `getPresetNames()` 全部预设,标记当前加载的那个。
2. **详情查看**:点「查看详情」→ modal 显示该预设的 prompts 列表/温度/max_context/流式。
3. **快照导出**:点「导出预设」→ 下载该预设 JSON 文件。
4. **连接测试(自定义API)**:选自定义 API 预设 → 「测试连接」走 getModelList,成功显示模型数。
5. **连接测试(环境预设)**:选酒馆当前源 → 「测试连接」发 ping,成功显示回复。
6. **两维度正交**:同时选「自定义API预设X」+「提示词预设Y」→ `getActiveApiConfig()` 返回 `{custom_api:X的字段, preset_name:Y}`。
7. **仅本次有效**:勾「仅本次有效」→ AI 调用用 `preset_name` 临时指定,酒馆全局预设不变;不勾 → 切换全局预设(有提示)。
8. **发送前预览**:点「预览发送内容」→ modal 显示最终提示词拼装,不实际发送。
9. **接通地基**:任务3 ai-summarize(批次4)调 `getActiveApiConfig()` 能拿到正确配置(批次4验收时确认)。
10. **tsc**:无新增 TS2304/2305/2306/2459。
11. **无回归**:现有 api-settings 的预设增删改、测试连接、采样参数全部正常;原「预留地基」提示文字更新为已接通。
- **回滚**:`cp .backup/preset-env/<file> ... && pnpm build:dev`。

### D.10 实施记录(2026-06-24 Step1-4 完成)
- **Step1 现状勘察**：读 `api-settings.ts`(306 行，预留地基，已有 LS_PRESETS/LS_ACTIVE/getModelList/采样参数)、`tavern-api.ts`(无 preset/generate 封装)、`@types/function/preset.d.ts`(Preset/settings/prompts 字段) + `generate.d.ts`(GenerateConfig/GenerateRawConfig/CustomApiConfig 字段、`preset_name`/`custom_api` 两维度)，确认两类全局接口在 ambient 但 iframe 需 `getRoot()` 兜底（同 safeGetWorldbook 范式）。
- **Step2 `lib/preset-env.ts`（新建，约 200 行）**：`getEnvPresetNames`/`getEnvLoadedPresetName`/`getEnvPresetDetail`/`envLoadPreset`/`exportEnvPresetSnapshot`/`envTestPing`（generateRaw ping）/`previewGeneratePayload`（拼提示词文本，D.8 预览）/`resolveGenerateApiConfig(aiMode, presetName?, onceOnly?)`（核心组装 `{custom_api?, preset_name?, onceOnly?}`）/`getPresetEnvPersist`/`setPresetEnvPersist`（持久化 `_th_presetenv_active_v1`：选的预设名+仅本次有效标志）。全局接口走 `getFn`（window 优先→getRoot 兜底）。lib 层纯数据/接口封装，放 `lib/`（非 PROGRESS 计划的 `modules/`，更合分层；exportEnvPresetSnapshot 内联 Blob 下载避免 lib→modules 反向依赖 downloadText）。
- **Step3 `api-settings.ts` 扩展**：`PanelState` 加 `aiMode/selPreset/onceOnly` 三态；panel 末尾「完成」上方加「AI 总结来源（两维度正交）」新区块——①API连接 单选(自定义API/酒馆当前源) × ②提示词预设 下拉(`getEnvPresetNames` 列全部+标当前加载)+「详情」(modal 列 prompts/温度/max_context/流式/top_k)+「导出」(`exportEnvPresetSnapshot`)+「切全局」(`envLoadPreset`，破坏性给 confirm 提示)+「测试」(custom 防呆指向上方 getModelList / tavern 发 `envTestPing` ping)+「预览」(`previewGeneratePayload` modal，可复制)+「仅本次有效」复选(D.6)。`bindApiEvents` 加对应委托；完成时 `setPresetEnvPersist` 持久化；原「预留地基」提示文字更新为已接通。`export { resolveGenerateApiConfig }` 给批次4 ai-summarize 调。`status-bar.css` 加 `.th-api-group-ai/.th-api-ai-mode/.th-api-preset-env/.th-api-env-*` 全套样式（糖果粉 + 复用 `.th-edit-select/.th-btn-sm/.th-edit-textarea` 基元）。
- **Step4 收尾**：`pnpm build:dev` 通过（`dist/前端悬浮球V1/index.js` 含 `resolveGenerateApiConfig`/`getEnvPresetNames`/`th-api-env-*` 代码，grep 命中 4 处区域）；`npx tsc --noEmit` — `preset-env.ts`/`api-settings.ts` **零错误**（修掉 esc/onceOnlyOverride/rEl 三处 TS6133 未用变量），仅 pre-existing 基准噪音 156 条（vueuse/lucide/floating-ui/全库 TS6133），无我引入的 TS2304/2305/2306/2459。
- 🗂️ 备份：`.backup/preset-env/`（含 api-settings.ts / status-bar.css 前 306 行快照；preset-env.ts 是新建文件，回滚直接删除）。回滚：`cp .backup/preset-env/api-settings.ts modules/ && cp .backup/preset-env/status-bar.css ./ && rm lib/preset-env.ts && pnpm build:dev`。

---

## §E. 批次4 · 任务3 世界书 AI 总结与注入

> 模块:`modules/ai-summarize.ts`(新建)+ `config.ts` 加 `AI_SUMMARY_PROMPTS`。批次备份:`.backup/ai-summarize/`。依赖:任务4(`getActiveApiConfig`)+ 任务1(`syncBidirLink`)。

### E.1 目的与范围
选世界书→AI 提取地点/人物/事件/储藏间4类要素→批量注入为 managed 卡片。含**任务池统一发送**(省发送/省 token)、**重 roll**、**卡片 AI 重构**。智能注入主语义=注入为 managed 卡片(持久);另有可选的第二语义=注入到 AI 上下文(`injectPrompts`,临时喂 AI)。

### E.2 世界书选择器(#18)
- 三源去重列出多选复选框:`getWorldbookNames()`(全部)+ `getGlobalWorldbookNames()`(全局)+ `getCharWorldbookList()`(角色卡绑定)。
- 支持全选/反选/按世界书折叠;每本显示条目数;选中条目可加入任务池。

### E.3 内置提示词(`config.ts:AI_SUMMARY_PROMPTS`,6套,#19/#31)
| key | 用途 | 输出 kind | 输出结构 |
|---|---|---|---|
| `location` | 地点提取 | location | `{name,desc,tags?,inject?}` desc=地点简介 |
| `character` | 角色档案提取(#31) | (NPC 卡,见 E.3a) | 姓名/身份/外貌摘要/穿着 |
| `event` | 事件提取 | event | `{name,desc,tags?}` desc=事件简介 |
| `item` | 物品提取 | stash-item | desc=`{描述}` JSON 字符串 |
| `skill` | 技能提取 | stash-skill | desc=`{描述}` JSON 字符串 |
| `status` | 状态提取 | stash-status | desc=`{效果,来源,持续时间}` JSON 字符串 |
| `clothing` | 衣物提取 | stash-clothing | desc=`{穿着部位,外观详情,衣物状态}` JSON 字符串 |

**E.3a 角色档案提取(#31)**:32 个角色档案格式统一(`<char_xxx>`+姓名/身份/外貌/穿着/特殊特征),提示词解析成 NPC 卡片(姓名/身份/外貌摘要/穿着)。注入到状态栏 NPC 体系——现状 NPC 只能从变量读(`getNPCs`),静态设定档案进不来;提取后能在 NPC 详情看设定。**注意**:NPC 卡片是否复用 managed 体系需实现时确认(managed 无 npc kind,可能需新增 kind 或单独存 `_th_npc_archives_v1`,实现时定)。

**变量格式遵守**(A.3):储藏间4类的 desc 必须是对应嵌套对象的 JSON 字符串,每套提示词写死字段模板,不能让 AI 自由发挥结构。

### E.4 提示词管理器(#20)
- 文本框可编辑/新建/保存自定义提示词,持久化 `_th_ai_prompts_v1`。
- 内置6套只读可复制(复制后存为自定义);自定义可删改。
- 每条提示词:`{id, label, kind, template, isBuiltin}`。

### E.5 任务池统一发送(#核心,用户需求1)

**E.5.1 任务池 UI**:
- 勾选世界书条目 + 选提示词类型 → 「加入任务池」→ 任务池列表显示每个任务(可删/可调顺序/可改提示词)。
- 任务池持久化到 `_th_ai_taskpool_v1`(Q6 选B,关面板再开还在,可分批攒任务)。

**E.5.2 统一发送机制**(Q1 选A,同 kind 分桶):
- **同 kind 分桶**:任务池按 kind 分桶,**每个 kind 桶内**的任务拼成一次请求(A.2第1点)。例:2地点+1角色+1事件 → 3个桶(地点2个/角色1个/事件1个)→ 3次请求(不是1次)。**这是可靠优先**:不同 kind 的 items 结构不同,混合易出错。
- **拼装**:`user_input` = 桶内所有任务的素材拼接 + 指令「按 task_id 分别提取」;`injects` 附自定义指令;`json_schema` 强制返回 `{results:[{task_id, items:[...]}]}` 数组,按 task_id 拆分回对应任务。
- **省 token 体现**:同 kind 多任务合并为1次请求(而非N次),省了 N-1 次的预设/上下文开销。
- **串行发桶**:`await` 逐桶调,不能并发(A.2第4点,撞酒馆生成锁)。每桶完成更新进度。

**E.5.3 任务素材**(Q2 选C):每个任务的输入 = 选中的世界书条目原文 + 可附加自定义指令。默认喂条目 content,玩家可在任务池里给单任务加备注指令(如「换个风格」)。

### E.6 AI 调用(#21)
- `generate({user_input, injects, json_schema, custom_api?, preset_name?, should_silence:true})`。
- API 配置来自任务4 `getActiveApiConfig()`(两维度正交)。
- `json_schema` 强制结构化输出,按 kind 用对应 schema。
- **返回值处理(关键)**:`generate` 传 `json_schema` 时**返回值是 JSON 字符串**(非对象),必须 `JSON.parse` 后才能取 `.results`。返回类型 `string | GenerateToolCallResult`,需先 `typeof result==='string'` 判断再 parse;parse 失败走错误处理。
- **`json_schema` 与 `tools` 互斥**(`@types/function/generate.d.ts:308`),任务3 不用 tools,不要同时传。
- **schema 形状(统一)**:无论桶内 1 个还是多个任务,`json_schema` 都返回 `{results:[{task_id, items:[...]}]}` 数组结构(单任务时数组长度为1)。这样 §E.8 重 roll(单任务)和 §E.5.2 统一发送(多任务)用同一套 parse 逻辑,下个会话不用分两套处理。`task_id` 由任务池在拼装 `user_input` 时分配并记在任务上,用于回拆。
- 失败走 `safeRun` 包裹(§G),toast 提示。

### E.7 提取结果处理
- **归一化**(#22):AI 返回 `kind` 模糊匹配(「地点」/「location」→`location`),用映射表不用纯 includes(避免「事件」误匹配「事件簿」);`tags` 收敛到现有标签字典,不存在按 `TAG_COLOR_PALETTE` 自动建(复用 `ensureTagsForKind`)。
- **批处理进度+取消**(#23):逐桶串行,每桶完成更新进度条+增量显示已提取卡片;可中途取消(`stopGenerationById`)。
- **注入前确认**(#24):AI 返回后弹确认 modal,逐条勾选(复用 `openRuntimeImportModal` 同款 UI);同名冲突「跳过/覆盖」。
- **注入为卡片**(#25):勾选后按 kind `addManagedItem`(location/event/dlc/stash-*)。
- **注入后联动建关联**(#26,#3-4约束):若 AI 返回「关联」字段,注入新卡片时调任务1 `syncBidirLink` 建关联。**只接受关联到已存在卡片名的值**,否则丢弃(防 AI 幻觉关联)。
- **回写初始数据**(#27):可选复选框,把总结结果也写入 `[初始·地点]` 等条目(复用 `writeInitialItemsForKind`)。

### E.8 重 roll(用户需求3,#用户需求3)
对 AI 已生成的某条结果不满意 → 原任务再调一次 AI 重新生成 → 替换结果。
- **范围**(Q3 选B):任务池里每个任务、注入确认面板里每条结果都能重 roll。
- **微调再 roll**(Q3 选B):重 roll 前允许玩家**微调提示词/参数**(如加一句「换个风格」「更详细」),再调 AI。非完全相同输入(不只靠 AI 随机性)。
- **实现**:每个结果行带「重 roll」按钮,点击弹微调框(可选改提示词)→ 用原任务的 kind 桶单独发一次请求 → 新结果替换旧结果(保留旧结果可对比,或直接替换,实现时定)。

### E.9 卡片 AI 重构(用户需求3,#用户需求3b)
对**已存在的 managed 卡片**(本地已有)单独调 AI 重构(改写 desc、补全字段、换风格等)。
- **输入**(Q4 选C):喂给 AI = 当前卡片(name/desc)+ 关联的世界书条目原文(若有,让 AI 参照原始设定重构)+ 玩家自定义提示词。
- **可发自定义提示词**:重构 modal 有提示词文本框,玩家自由输入重构要求(如「把这个地点描述改得更阴暗」「补充3个随机事件」)。
- **实现**:卡片详情/编辑入口加「AI 重构」按钮 → 弹重构 modal(显示当前 desc + 关联条目 + 提示词框)→ 调 `generate({json_schema, user_input=卡片+条目+提示词})` → 返回值是 JSON 字符串需 `JSON.parse`(同 §E.6)→ 新 desc 预览 → 确认替换/放弃。重构的 `json_schema` 可用单元素 `{results:[{task_id, items:[{name,desc,...}]}]}` 复用统一形状,或单独定义单卡 schema(实现时定,但 parse 逻辑统一)。
- **kind 适配**:重构按卡片 kind 用对应 schema(储藏间4类重构后 desc 仍是合法嵌套对象 JSON)。

### E.10 其他增强(#28-33)
- **流式实时预览**(#28):AI 开流式时面板内实时显示进度文本;流式期显示原文(半截 JSON 不能 parse),结束才 parse 校验。监听 `STREAM_TOKEN_RECEIVED_FULLY`。
- **token 预估与分批警告**(#29):选多本世界书/多任务时预估总 token(字数÷1.5 粗估),超阈值警告建议分批。
- **智能注入到 AI 上下文(#30,第二语义)**:除「注入为卡片」外,可选支持用 `injectPrompts` 把总结要素注入到**下次 AI 请求的提示词**(`position:'in_chat'` 或激活世界书绿灯条目)。做开关,默认关;临时喂 AI 影响生成,不持久化成卡片。
- **角色档案建档**(#31):见 E.3a。
- **增量模式**(#32):总结时跳过「本地已存在同名卡片」的条目,只总结新增/变更的,省 token。任务池加入时自动跳过本地已有同名(可关)。
- **置信度标注**(#33):AI 返回每张卡片带 `confidence`(高/中/低),低置信度卡片在状态栏标黄提醒玩家复核。json_schema 加 `confidence` 字段。

### E.11 功能点清单(对应总览#18-33)
| # | 功能 | 实现 |
|---|---|---|
| 18 | 世界书多选选择器 | E.2 |
| 19 | 6套内置提示词 | E.3 + `AI_SUMMARY_PROMPTS` |
| 20 | 提示词管理器 | E.4 |
| 21 | AI 调用 | E.6 |
| 22 | 归一化 | E.7 |
| 23 | 批处理进度+取消 | E.7 |
| 24 | 注入前确认 | E.7 |
| 25 | 注入为卡片 | E.7 |
| 26 | 注入后联动建关联 | E.7 |
| 27 | 回写初始数据 | E.7 |
| 28 | 流式预览 | E.10 |
| 29 | token 预估 | E.10 |
| 30 | 注入到AI上下文(第二语义) | E.10 |
| 31 | 角色档案建档 | E.3a |
| 32 | 增量模式 | E.10 |
| 33 | 置信度标注 | E.10 |
| (新) | 任务池统一发送 | E.5 |
| (新) | 重 roll | E.8 |
| (新) | 卡片 AI 重构 | E.9 |

### E.12 入口
- `status-bar.html` 的 `th-menu-item` 行加「AI 总结注入」按钮(`fa-solid fa-wand-magic-sparkles` 或 Lucide)。
- 任务2 初始化管理面板也收拢一个 AI 总结入口(#17)。
- 卡片详情/编辑入口加「AI 重构」按钮(E.9)。

### E.13 验收清单(批次4 完成后用户导入逐项点验)
1. **世界书选择器**:列出全部/全局/角色卡世界书,多选/全选/反选/折叠正常,显示条目数。
2. **任务池**:选条目+选提示词→加入任务池→列表显示,可删/调序/改提示词;关面板再开任务池还在(持久化)。
3. **统一发送(同kind分桶)**:2地点+1角色+1事件→分3桶→3次请求;每桶内多任务合并为1次请求,返回 JSON 数组按 task_id 拆分正确。
4. **AI调用配置**:调 `getActiveApiConfig()` 拿到任务4 配的 custom_api/preset_name,两维度正交生效。
5. **归一化**:AI 返回「地点」/「location」都能路由到 location kind;「事件」不误匹配「事件簿」;新标签自动建。
6. **进度+取消**:逐桶串行,进度条更新+增量显示;中途取消生效。
7. **注入确认**:AI 返回后弹勾选 modal,逐条勾选;同名冲突跳过/覆盖生效。
8. **注入为卡片**:勾选后按 kind 进 managed,储藏间4类 desc 是合法嵌套对象 JSON。
9. **联动建关联**:AI 返回关联字段→注入后自动建双向关联;关联到不存在卡片名的丢弃。
10. **回写初始**:勾选回写→结果写入对应 `[初始·xxx]` 条目。
11. **重roll**:结果行点「重roll」→微调提示词→重新生成→替换结果。
12. **卡片重构**:已有卡片点「AI重构」→弹框(当前desc+关联条目+提示词框)→发AI→新desc预览→确认替换。
13. **流式预览**:开流式→面板实时显示进度文本,结束才 parse。
14. **token预估**:选多本/多任务→超阈值警告建议分批。
15. **注入到上下文(第二语义)**:开开关→总结要素经 `injectPrompts` 注入下次AI请求,不建卡片。
16. **角色档案**:选角色档案条目+character提示词→提取成NPC卡片,能在NPC详情看设定。
17. **增量模式**:本地已有同名卡片自动跳过(可关)。
18. **置信度**:低置信度卡片状态栏标黄。
19. **tsc**:无新增 TS2304/2305/2306/2459。
20. **无回归**:现有 managed 卡片增删改、关联、配发、储藏间导入导出全部正常。
- **回滚**:`cp .backup/ai-summarize/<file> ... && pnpm build:dev`。

---

## §F. 批次5(可选) · 补充模块

> 独立小模块,可在批次1-4 后做,也可跳过。依赖:无。

### F.1 S-7 变量规则状态栏直读(#46)
- 状态栏直读世界书的 `变量列表`、`[mvu_update]变量更新规则`、`[mvu_update]变量输出格式` 条目,只读展示「当前变量结构 + 更新规则」。
- 玩家调卡时能在状态栏看变量规则,不用翻世界书。
- 复用现有 `lib/variable-review.ts` + `getWorldbook`。
- 入口:状态栏加「变量规则」查看按钮,或纳入初始化管理面板。

### F.2 S-12 世界书激活态实时监控(#47)
- 状态栏显示当前这一轮 AI 请求中哪些世界书条目被激活了,实时列出激活条目名。
- 监听 `tavern_events.WORLDINFO_SCAN_DONE` / `WORLD_INFO_ACTIVATED` 事件。
- 调试绿灯关键词时极有用——能看见世界书到底喂了什么给 AI。
- 入口:状态栏加「激活监控」面板(可折叠),实时刷新。

### F.3 验收清单(批次5)
1. **变量直读**:状态栏显示当前变量结构 + 更新规则,与世界书条目内容一致;只读不改。
2. **激活监控**:AI 请求时实时列出激活的世界书条目名;改绿灯关键词后重新请求,激活列表变化正确。
3. **tsc**:无新增 TS 错误。
4. **无回归**:现有功能正常。

---

## §G. 跨任务通用增强(贯穿批次1-4)

### G.1 统一 localStorage key 字典(#42)
- `lib/config.ts` 加 `INIT_LS_KEYS` 常量对象,集中登记所有 `_th_*` key(现有 + 新增)。
- 新增 key 一律登记,便于任务2 备份枚举,不漏不 hardcode。
- 新增 key 清单(预计):`_th_ai_prompts_v1`(任务3自定义提示词)、`_th_ai_taskpool_v1`(任务3任务池)、`_th_presetenv_active_v1`(任务4环境预设)、`_th_init_backup_*`(任务2快照,文件不落LS)。

### G.2 统一确认 modal 复用(#43)
- 破坏性操作(恢复出厂/覆盖写入/删预设/删快照)统一走 `openReadInitialConfirmModal` 同款确认 modal(见 `stash-io.ts:467`)。
- 不各写各的,交互一致 + 省代码。

### G.3 错误处理统一封装(#44)
- 抽 `safeRun(label, fn)` helper(放 `lib/dom-utils.ts` 或新 `lib/safe.ts`):统一 `try/catch` + `toastr.error` + `console.warn`。
- 所有 AI 调用/世界书读写/JSON 解析走 `safeRun`。
- 满足「关键节点完善错误处理」约束。

### G.4 操作日志 + 轻量撤销栈(#45)
- 初始化管理面板记最近 10 次操作(读/写/注入/重置),可回看。
- 破坏性操作前自动存内存快照(限 N=10 不无限长),支持「撤销上次」。
- 内存栈不持久化(刷新即清,与文件备份互补)。
- 撤销仅针对 managed 卡片增删改类操作;世界书条目写入的撤销走「恢复快照」(任务2备份)。

### G.5 入口整合(#17)
- 任务1 关联读写、任务3 AI 总结,入口都收拢进任务2「初始化管理」面板作子区块。
- **同时保留各自独立入口**(向下兼容,玩家可从原入口进)。

---

## §H. 更新:新会话开场清单(补充 §1)

接手本阶段(第二阶段)新功能开发的新会话,在原 §1 开场清单基础上追加:
1. 读本文件 §A-§G(第二阶段计划)。
2. 确认要做的批次(§A.4),读对应 §B/§C/§D/§E/§F 详细规格。
3. 读相关 `@types/`:`generate.d.ts`(任务3/4)、`worldbook.d.ts`(任务1/3)、`preset.d.ts`(任务4)、`inject.d.ts`(任务3第二语义)、`import_raw.d.ts`(任务2备份)。
4. `ls src/前端悬浮球V1/modules/` 确认已有哪些模块,避免重复造。
5. 动手前:备份到 `.backup/<批次名>/`(无git回滚,§6);改完 `pnpm build:dev` + `npx tsc --noEmit`;UI 行为需用户导入 `dist/前端悬浮球V1/index.js` 实测。
6. **每批完成后**:按对应 §X.X 验收清单逐项让用户点验,记录在 PROGRESS(标✅/❌)。

## §I. 更新:项目状态总结(补充 §8)

- **第一阶段(解耦+视觉升级)**:✅ 全部完成验收(见 §8 原文)。
- **第二阶段(世界书关联/初始化管理/AI总结/环境预设)**:📋 计划已写入 §A-§G,待逐批实施。
  - 批次0 变量结构脚本替换+衣物字段切换:✅ 代码完成待导入实测(规格 §B0,优先做)
  - 批次1 任务1 关联模板:✅ 代码完成待导入实测(规格 §B)
  - 批次2 任务2 初始化管理：🔧 Step3-5 已完成 + 首字修复 + 可视化编辑器已完成待导入验收 — 读/写/编辑/可视化 4 按钮、格式校验、健康自检、备份恢复/恢复出厂、关联读写收拢；首字丢失全部补回（始化/健康自检/批次2/命令式/面板/刷新看板/孤儿关联/一键备份导出/扫描中/损坏 localStorage 等）；「可视化」按钮直接编辑世界书条目 content（卡片网格增删改，格式自动保合法）。待用户导入 `dist/前端悬浮球V1/index.js` 批次0/1/2 统一验收（详见 §C.7 + 追加修正块）
  - 批次3 任务4 环境预设：🔧 Step1-4 已完成待导入验收 — `lib/preset-env.ts`(preset/generate 全局接口兜底封装) + `api-settings.ts` 加「AI 总结来源(两维度正交)」区块(①API连接 × ②提示词预设：下拉/详情/导出/切全局/测试/预览/仅本次有效) + 导出 `resolveGenerateApiConfig` 给批次4 调。`build:dev` + `tsc` 通过（详见 §D.10）
  - 批次4 任务3 AI总结注入：🔧 4a+4b+4b-fix+4c 代码完成待导入验收 — 4a AI总结主闭环；4b 6项体验增强(置信度/token/重roll/增量/卡片AI重构/流式)；4b-fix(验收反馈3项:generateRaw绕开RP预设/世界书修复注入失败、按钮置顶+任务池顶部对齐、失败不自动关+流式加大可复制+解析前确认取消)；4c 第二语义(injectPrompts注入到AI上下文临时不建卡)+任务池导入导出。`build:dev`+`tsc` 通过。备份 `.backup/batch-4b-fix-4c/`。
  - 批次5 补充模块:✅ 验收反馈修复 + 9 项功能延伸 + modal 堆叠 全 7 Step 代码完成待导入验收（规格+完成记录 §J）
- **实施时更新本表**:每批完成后 ⬜→✅ 并记录验收结果。

---

> 本文件(§A-§I)为 2026-06-23 新增的第二阶段开发计划。与第一阶段(§0-§8)共同构成 V1 完整状态。新会话接手只需读本文件即可,不依赖任何历史对话上下文。

---

## §J. 批次5 · 验收反馈修复 + 9 项功能延伸 + modal 堆叠修复(2026-06-24 计划,待实施)

> **本节自洽**:新会话接手只需读本节 + §0/§4/§5/§6 即可动手,不依赖任何对话上下文。
> **前置状态**:批次4(4a+4b+4b-fix+4c)代码已完成待用户导入验收(见 §I)。本批次在 4b-fix+4c 基础上修验收反馈 + 加功能。备份基线 `.backup/batch-4b-fix-4c/`。

### J.0 用户反馈(原话要点,2026-06-24)
1. 选世界书条目:加搜索;**提示词下拉框本身太长占位置**(已确认指 `#th-ai-prompt` select 撑满整行);条目排序默认跟世界书内部排序;**开启的条目显示向右错位**;**未开启条目复选框与名称不在同一行**。
2. 设置里增加「提示词编辑模块」,能统一编辑保存所有内置提示词,并**留接口**给未来其他提示词功能接入。
3. **confidence(把握自评高/中/低)完全没用,整体删除**;**提示词内不生成任何 tag 和 link**(让玩家自定义)。
4. 功能延伸(用户已勾选全做):A 卡片快照回滚 / B 冲突策略 / C 锁定保护 / D 变量扩展 / E 提取方案 / F 反向导出 / G AI润色续写 / H 悬浮预览 / I 风格预设。
5. **modal 嵌套问题**:功能 modal 打开后会关闭上一级 modal,体验差,需排查修复。

### J.1 当前代码精确位置(动手前先核对这些行号是否仍准确)
- `modules/ai-summarize.ts`:`renderSelector` L100-133;`renderBookEntries` L135-156(条目行 label L143 是错位根因);提示词 select L124 `style="flex:1;min-width:120px"`(下拉太长根因);`allPrompts` L26 / `promptById` L29;`openPromptManager` L386-418 / `openPromptEditor` L420-451;注入确认 `confBadge` L874-875 / `linkBadge` L873;injectable `confidence` 字段 L811;`filterLinks` L832-844;`syncBidirLink` 调用 L1081;`formatItemLine` links refs L995-1000。
- `lib/config.ts`:`AI_SUMMARY_SYSTEM_PROMPT` L153-170(confidence 字段 L156-160、links 规则 L165、confidence 规则 L166);`AI_SUMMARY_PROMPTS` 6 套 L180-300(每套含 tags/links/confidence 字段行 + 示例 JSON)。
- `lib/ai-summary-schema.ts`:`confidenceProp` L15;location/event schema 的 tags L23/confidence L24/links L25;各 stash schema confidence L47/60/72/87;`NormalizedItem.confidence` L228;`normalizeItems` 里 conf L252/257/269/273/277/283、tags L255-256、links L258-265;`linksByName` L236/247;`pickConfidence` L290;`buildJsonSchema` L103。
- `lib/ai-summary-store.ts`:`LS_PROMPTS='_th_ai_prompts_v1'` L8;`getCustomPrompts`/`saveCustomPrompt`/`deleteCustomPrompt` L91-104。
- `status-bar-init.ts`:`openModal2` L897 / `closeModal2` L907(单槽位 `.th-modal-overlay-2`,堆叠问题根因);Escape 处理 L1746。
- `lib/managed-store.ts`:`addManagedItem`/`getManagedItems`(功能 A/C 要扩展)。
- `lib/tavern-api.ts`:`safeGetWorldbook`(反馈1-c 排序要核对是否重排)。

### J.2 实施步骤(建议顺序,每步独立 build,最后统一验收)

#### Step 1 · modal 堆叠修复(基础设施,先做)
**根因**:`openModal2`/`closeModal2` 只有一个共享槽 `.th-modal-overlay-2`,再次 openModal2 覆盖父级 innerHTML,closeModal2 整个隐藏——父级丢失。
**改法**(status-bar-init.ts L897-912 + L1746):
- 维护模块级 `_modal2Stack: { title: string; body: string; opts?: { maxWidth?: string }; scrollTop: number }[]`。
- `openModal2(t,b,opts)`:先把当前槽位内容(若 overlay 显示中)压栈(存 title/body/opts/body.scrollTop),再渲染新 t/b。
- `closeModal2()`:pop 栈顶;若栈非空,恢复上一个(渲染其 title/body/opts + 恢复 scrollTop + 保持 overlay 显示);若栈空,隐藏 overlay + 清空。
- Escape(L1746):改为调 `closeModal2()`(走 pop 逻辑)。
- **审计 ai-summarize.ts 手写"返回"**:`openPromptManager`「返回」(L412 调 `renderPanel()`)、`openPromptEditor`「取消」(L439 调 `openPromptManager()`)——堆栈化后改为 `closeModal2()` 让栈自动恢复父级,避免双重 push。其他模块(api-settings/appearance-settings/stash-modal/init-visual-editor)嵌套自动受益,但需实测确认无双重 push。

#### Step 2 · 反馈3 删 confidence + 提示词不生成 tag/link
- `config.ts` `AI_SUMMARY_SYSTEM_PROMPT`:各 kind 字段行(L156-160)去掉 `tags`/`links`/`confidence`;删 L165 links 规则、L166 confidence 规则;重写为只含 name+desc(+储藏间结构化字段)。
- `config.ts` 6 套 `AI_SUMMARY_PROMPTS` 模板:每套删 `- tags`/`- links`/`- confidence` 字段要求行 + 示例 JSON 里的 `"tags":...`/`"links":...`/`"confidence":...` 键值。
- `ai-summary-schema.ts`:删 `confidenceProp` L15;location/event schema 删 tags/confidence/links(L23-25);各 stash schema 删 confidence(L47/60/72/87);`NormalizedItem` 删 `confidence` L228(+ `tags` L227 / `links` L230 若仅 AI 路径用);`normalizeItems` 删 conf/tags/links 收集(L252-265)+ `linksByName`(L236/247)+ `pickConfidence` L290。`buildJsonSchema` 移除 tags/links/confidence 后 AI 只返回核心字段。
- `ai-summarize.ts`:injectable 类型删 `confidence` L811;删 `confBadge` L874-875、`linkBadge` L873;`filterLinks`(L832-844)AI 路径不再调(可保留供玩家手填路径或删);`BucketResult.linksByName` 字段及 `syncBidirLink` 调用(L1081)移除(AI 不再触发关联);`formatItemLine` links refs(L995-1000)删。**保留**:`addManagedItem`/`syncBidirLink` 链路本身(玩家卡片编辑手填 tags/links 仍走它,不受影响)。

#### Step 3 · 反馈1 选择器(ai-summarize.ts renderSelector/renderBookEntries)
- (a) 搜索:`.th-ai-sel` 顶部加 `<input id="th-ai-search" placeholder="搜索条目/世界书名…">`;input 事件过滤——跨所有书匹配 entryName/bookName,命中则自动展开其所在书 + 命中行高亮(`.th-ai-hit`);未加载的书搜索时按需 await 加载。
- (b) 下拉太长:`#th-ai-prompt` select 的 `style="flex:1;min-width:120px"` 改为 `style="max-width:200px"`(不撑满)。
- (c) 排序:核对 `lib/tavern-api.ts` `safeGetWorldbook` 是否对 entries 重排;若重排则保留酒馆原始 order。条目顺序 = 世界书内部顺序。
- (d)(e) 错位:重写 `renderBookEntries` L143 条目行——`<label class="th-ai-entry ${e.enabled?'':'th-ai-entry-off'}" style="display:flex;align-items:center;gap:8px;padding:5px 10px">`,复选框与名称严格同行;未开启只用 `.th-ai-entry-off{opacity:.5}` 类,不用 inline style 覆盖整个 label(L142 `off` 变量覆盖 style 是错位根因)。`status-bar.css` 加 `.th-ai-entry-off`。

#### Step 4 · 反馈2 提示词编辑模块 + registry 接口
- 新建 `lib/prompt-registry.ts`:`PromptEntry = { id, kind: AiSummaryPromptKind, label, template, builtin, editable }`。导出 `registerPrompt(e)`/`getAllPrompts()`/`getPrompt(id)`/`savePrompt(e)`/`deletePrompt(id)`/`resetBuiltin(id)`。内置 6 套从 `AI_SUMMARY_PROMPTS` 注册(builtin=true,editable=true);自定义从 `_th_ai_prompts_v1` 注册。**override 机制**:内置提示词编辑后存 override 到 `_th_ai_prompts_v1` 的 `builtinOverrides: Record<id, template>` 槽;`getPrompt(id)` 优先返回 override;`resetBuiltin(id)` 清该 id override。**接口预留**:未来 NPC/角色档案/续写润色提示词调 `registerPrompt()` 挂入,设置面板自动渲染。
- 新建 `modules/prompt-settings.ts`:`openPromptSettings()` 面板——统一列表(内置+自定义)+ 编辑/保存/新建/删除/复制/恢复内置;内置可直接编辑(存 override)+「恢复内置」按钮。入口:status-bar-init.ts 设置区加按钮(仿 `.th-btn-api-settings` L1181 模式)。AI 总结面板「管理提示词」按钮(L213 `openPromptManager`)改为调 `openPromptSettings()`。
- `ai-summarize.ts` `allPrompts()`/`promptById()` 改读 registry。`ai-summary-store.ts` 的 getCustomPrompts/saveCustomPrompt/deleteCustomPrompt 保留(registry 在其上封装,向后兼容)。
- 集中登记新 key 到 `config.ts` `INIT_LS_KEYS`(见 §G.1)。

#### Step 5 · 功能 D 变量扩展(依赖 Step 4 registry)
- 模板支持新占位符:`{{当前卡片名列表}}` `{{角色名}}` `{{最近剧情}}`。
- `buildBucketInput`(ai-summarize.ts L520 附近)渲染时替换:`{{当前卡片名列表}}`→该 kind 已有卡片名(`getManagedItems(kind)`);`{{角色名}}`→酒馆当前角色名(走酒馆 character API);`{{最近剧情}}`→最近 N=5 条 chat 消息摘要(走酒馆 chat API,跨窗口兜底)。
- `openPromptEditor` 帮助文本列出全部可用占位符。

#### Step 6 · 功能 B 冲突策略 + C 锁定保护 + A 快照回滚(注入链路增强)
- **C 锁定**:`ManagedItemV2` 加 `locked?:boolean`(`managed-store.ts`)。卡片编辑/卡片菜单加「锁定/解锁」开关;AI 注入时跳过 locked 卡片(toast「N 项已锁定,跳过」);锁定卡片状态栏角标显🔒。
- **B 冲突策略**:`openInjectConfirm`(ai-summarize.ts L860 附近)当提取项 `exists` 时,当前直接覆盖。改为每项单选「覆盖/合并/跳过/新建副本」,默认「跳过」(保护手工数据)。注入执行(L1077 附近)按策略:覆盖=替换;合并=旧 desc 保留+新字段追加/更新;跳过=不动;新建副本=改名 `xxx(2)`。locked 项强制跳过。
- **A 快照回滚**:新 key `_th_ai_snapshots_v1` = `[{ ts, kind, snapshots: {name, oldItem}[] }]` 最近 N=20。注入执行前(`addManagedItem` 覆盖前)push 将被覆盖的同名卡片旧值。注入确认面板加「查看快照/回滚」入口,列快照,选中回滚(恢复 oldItem)。回滚走二次确认 modal。

#### Step 7 · 功能 E 提取方案 + F 反向导出 + G AI润色 + H 悬浮预览 + I 风格预设
- **E 提取方案**:新 key `_th_ai_plans_v1` = `[{ id, name, tasks:[{kind,promptId,book,entryName,customInstruction}] }]`。任务池面板头加「存为方案」「载入方案」按钮;载入=清空当前池+填入方案任务(`addTask`)。
- **F 反向导出**:卡片菜单/批量加「导出为世界书条目」——把选中 managed 卡片写成世界书条目(content=卡片 desc 或结构化 JSON),经酒馆世界书 API 写入玩家选的目标书+条目名前缀;区别于 [初始·xxx],用玩家可见常亮条目。走二次确认。
- **G AI 润色/续写**:卡片菜单加「AI 润色」——取卡片 desc + 可选「结合最近剧情」,调 `generateRaw` + 专门润色提示词(registry 注册 `builtin-refine`),返回新 desc,玩家确认后写回。
- **H 悬浮预览**:选择器条目行 hover 调 hover-tip 显示 content 全文;`toggleBook` 加载时缓存 content(当前只存 contentLen,见 L328)。
- **I 风格预设**:新 key `_th_ai_style_v1` = 当前风格 id。风格包={id,name,systemSuffix}(暗黑/幽默/严肃)。`AI_SUMMARY_SYSTEM_PROMPT` 拼接当前风格 suffix。设置面板加风格切换。

### J.3 约束(自洽,新会话必读,同 §4/§5/§6 + memory)
- **无 git** → 动手前备份到 `src/前端悬浮球V1/.backup/batch-5-feedback-features/`(至少:config.ts/ai-summarize.ts/ai-summary-schema.ts/ai-summary-store.ts/status-bar.css/status-bar-init.ts/managed-store.ts/tavern-api.ts)。回滚:`cp .backup/batch-5-feedback-features/<file> <path> && pnpm build:dev`。
- 改完 `pnpm build:dev` + `npx tsc --noEmit`(抓我引入的 TS2304/2305/2306/2459/6133;忽略 zod/vueuse/lucide 自身噪音 + pre-existing TS7053)。**build:dev 走 transpileOnly 不报漏 export,抽取后必须 tsc --noEmit 查 TS2305/2306**。
- **严格向下兼容**:不改现有 `[初始·xxx]` 条目名;不改现有 localStorage key(仅新增 `_th_ai_plans_v1`/`_th_ai_snapshots_v1`/`_th_ai_style_v1`,`_th_ai_prompts_v1` 加 `builtinOverrides` 槽);不破坏现有函数签名(`resolveGenerateApiConfig` 等);`getCustomPrompts`/`saveCustomPrompt`/`deleteCustomPrompt` 保留。
- 储藏间永不绑世界书 `bindsWorldbook:false` 不变。
- 破坏性操作(覆盖写入/删快照/回滚/反向导出覆盖)走二次确认 modal。
- 跨窗口用 data 属性 + iframe 内 addEventListener 委托,不 inline onclick;`getRoot()` 兜底。
- 单主题糖果粉 + Lucide/FontAwesome + 沿用 `.th-*` 基元 + 命令式 innerHTML + openModal2(不引 Vue)。
- **CJK 字符在 Edit 工具里匹配脆弱 → 用 ASCII 锚点编辑**(用附近英文/符号做唯一锚点)。
- 行为变化需用户拍板,不擅自改 UI 行为。
- 一次性写完会请求超时 → 分段写代码。
- 新会话开场:先读本文件 §0/§J + 相关 `@types/` + `ls src/前端悬浮球V1/` 确认结构。

### J.4 验收清单(导入 `dist/前端悬浮球V1/index.js` 后逐项点验)
**反馈修复**:
1. 选择器顶部有搜索框,输入关键字跨书过滤+命中展开高亮;提示词下拉不再撑满(≤200px);条目顺序=世界书内部顺序;开启条目无向右错位;未开启条目复选框与名称严格同一行(仅灰度区分)。
2. 设置区有「提示词编辑」入口,面板能编辑/保存 6 套内置(可恢复内置)+ 新建/删除/复制自定义;AI 总结面板「管理提示词」跳到该面板。
3. AI 返回的 JSON 不再含 confidence/tags/links 字段;注入确认面板无置信度/关联徽章;系统提示词与 6 模板无 confidence/tags/links 字段说明;玩家在卡片编辑手填 tags/links 仍正常双向同步。
4. **modal 堆叠**:AI 总结面板→打开提示词设置→打开编辑器→关闭编辑器→恢复提示词设置(非空)→关闭→恢复 AI 总结面板(非空);设置→子面板嵌套同理;Escape 逐级关闭不丢父级。
**功能**:
5. A:AI 注入建卡前存快照;注入确认面板「查看快照/回滚」能恢复旧卡片(二次确认)。
6. B:提取项已存在时给「覆盖/合并/跳过/新建副本」选择,默认跳过;按选择执行正确。
7. C:卡片能锁定/解锁;锁定卡片 AI 注入跳过+toast;状态栏显🔒。
8. D:提示词模板能用 `{{当前卡片名列表}}` `{{角色名}}` `{{最近剧情}}` 占位符,发送时正确替换。
9. E:任务池能「存为方案」「载入方案」,载入后任务池正确填入。
10. F:卡片能「导出为世界书条目」,写入指定世界书(二次确认),区别于 [初始·xxx]。
11. G:卡片「AI 润色」能调 AI 返回新 desc,确认后写回。
12. H:选择器条目 hover 显示 content 全文预览。
13. I:设置能切换风格(暗黑/幽默/严肃),AI 总结系统提示词拼接对应 suffix。
**回归**:4b 的增量/重roll/流式复制/解析前确认/4c 注入上下文/任务池导入导出仍正常。

### J.5 关联
关联 memory:`project_batch4b_ai_enhance` / `feedback_tsc_catch_missing_export` / `project_frontend_ball_v1` / `project_no_git_rollback` / `feedback_combine_small_refactors`。

### J.6 实施完成记录（2026-06-25，全 7 Step 已完成待用户导入验收）

备份基线 `.backup/batch-5-feedback-features/`（16 文件）。`pnpm build:dev` 通过（产物 `dist/前端悬浮球V1/index.js` ~5.2MB），`npx tsc --noEmit` 我引入文件零错误（仅 pre-existing 噪音：lucide-static/@floating-ui TS2307、stash-io TagsByKind TS7053、status-bar-init TS6192/18047、跨窗口 pw.Element TS2339）。

- **Step1 modal 堆叠**：用户拍板用 **revive 回调重渲染**（非 §J.2 的 innerHTML 快照——快照会丢事件监听）。`status-bar-init.ts` openModal2 加 `revive/replace/reset` 选项 + `_modal2Stack/_modal2CurrentRevive/_modal2Restoring`；closeModal2 弹栈调父级 revive() 原地重渲染重绑；新增 `closeAllModal2`。ai-summarize 主面板 reset+revive、瞬态 modal(进度/预览/注入) replace、返回按钮改 closeModal2/closeAllModal2+renderPanel；init-manager/api-settings 入口加 reset+revive。未登记 revive 的旧模块 closeModal2=旧隐藏行为（零回归）。
- **Step2 删 confidence + 不生成 tag/link**：config 系统提示词+6 模板删 tags/links/confidence 字段与示例；ai-summary-schema 删 confidenceProp/各 schema 的 tags-links-confidence/NormalizedItem.confidence-tags-links/linksByName/pickConfidence；ai-summarize 删 confBadge/linkBadge/filterLinks 调用/syncBidirLink 调用/formatItemLine links。保留 addManagedItem/syncBidirLink 本体（玩家手填仍走）。
- **Step3 选择器**：搜索框 `#th-ai-search`（跨书过滤+命中展开高亮 `.th-ai-hit`+「命中 N」）；提示词下拉 `max-width:200px`；`safeGetWorldbook` 不重排（条目=世界书内部序，核对无需改）；条目行错位修复（开启/未开启同一 inline style，`.th-ai-entry-off` 灰度 class）。
- **Step4 提示词编辑 + registry**：`lib/prompt-registry.ts`（内置 override 存独立 key `_th_ai_builtin_overrides_v1`，不动 `_th_ai_prompts_v1`；`registerExtra` 接口预留）；`modules/prompt-settings.ts`（`openPromptSettings` 列表+编辑器，内置锁 label/kind 只改模板可恢复，自定义增删改复制，占位符帮助）；ai-summarize allPrompts/promptById 改读 registry，「管理提示词」改调 openPromptSettings，删旧 openPromptManager/openPromptEditor；status-bar.html/init.ts/css 加「提示词编辑」入口。INIT_LS_KEYS 补登记全部 ai/presetenv key。
- **Step5 变量扩展**：buildBucketInput 懒求值替换 `{{当前卡片名列表}}`(getManagedItems)、`{{角色名}}`(getCharData)、`{{最近剧情}}`(getChatMessages 最近5楼)。
- **Step6 B/C/A**：C 锁定—managed-store 加 `locked` 字段+toggleLock/isManagedItemLocked，编辑弹窗加锁定按钮+卡片🔒角标，AI 注入跳过锁定项；B 冲突—注入确认下拉加「合并」(mergeDesc 逐字段)，collectPicks/doInject 支持 merge+locked 过滤；A 快照—`lib/ai-snapshots.ts`(`_th_ai_snapshots_v1` 最近20)，doInject 覆盖/合并前 pushSnapshot，注入确认「快照/回滚」按钮(openSnapshotsModal+二次确认)。
- **Step7 E/F/G/H/I**：E 方案—ai-summary-store 加 `_th_ai_plans_v1`+getPlans/savePlan/deletePlan，任务池头「存为方案/载入方案」；F 反向导出—`modules/card-export.ts`(选目标书+前缀+常亮→createWorldbookEntries)，编辑弹窗「导出条目」按钮；G AI润色—`modules/ai-refine.ts`(卡片desc+可选最近剧情+润色要求→generateRaw→预览编辑写回)，编辑弹窗「AI润色」按钮；H 悬浮预览—选择器条目 hover 自绘浮层显 content 全文(`.th-ai-entry-preview` 挂 iframe body)；I 风格预设—ai-summary-store 加 `_th_ai_style_v1`+AI_STYLES(默认/暗黑/幽默/严肃)，系统提示词拼 suffix，提示词编辑面板加风格下拉。

**新增文件**：`lib/prompt-registry.ts` / `lib/ai-snapshots.ts` / `modules/prompt-settings.ts` / `modules/ai-refine.ts` / `modules/card-export.ts`。
**回滚**：`cp .backup/batch-5-feedback-features/<file> <path> && rm 上述5新文件 && pnpm build:dev`。
**待验收**：见 §J.4 验收清单（13 项 + 回归）。

---

## §K. 批次6 · 选择器重构 + 提示词风格/头部人格 + 内置重写 + 初始化收拢（2026-06-25，代码完成待验收）

> 备份 `.backup/batch-6-prompt-persona-init/`（9 文件）。`pnpm build:dev` 通过（产物 ~5.4MB），`npx tsc --noEmit` 我引入文件零错误（仅 pre-existing 噪音）。

### K.0 用户6项反馈
1. AI总结选择器：搜索只显示命中世界书；改两级钻取（外层世界书列表→点进看条目，不再原地展开）。
2. 提示词风格扩到 7-8 种；风格旁加 新建/编辑/删除/初始化。
3. 作为专业设计师重写 6 套内置提示词；增加可调内置（字数/条目数/总分限制）→ **UI 可调参数**。
4. 提示词设置加**头部提示词**（人格，置于全部最前，赋予 AI 身份）；7 内置人格（调月莉音/樱岛麻衣/千反田爱瑠/四宫辉夜/米拉杰/妈妈系/魅魔系）+ CRUD。
5. 初始化数据收拢：散落按钮移除（用户拍板）；初始化管理读写绑定世界书（已有）+ 本地全部卡片（收拢）+ 角色卡内嵌世界书（character_book，随卡走）。
6. 产出改进清单（见会话输出，未入本批实现）。

### K.1 实施（全 6 Step 完成）
- **Step1 人格+风格+registry**：config.ts 加 `AI_PERSONAS`(7内置)+`AiPersona`+`AiPromptConstraints` 类型；ai-summary-store 风格扩到 8 内置 + 风格/人格 CRUD（内置 override + 自定义）+ `getActivePersonaText/getAiStyleList/getPersonaList`；prompt-registry override 结构升级为 `{template,constraints}`（兼容旧纯字符串）；ai-summarize sendOneBucket 拼接顺序=人格+系统契约+风格后缀，buildBucketInput 渲染约束文本。INIT_LS_KEYS 登记 5 新 key。
- **Step2 提示词面板三段式**：prompt-settings.ts 重构为 头部人格/提取风格/提取提示词 三段，各带下拉+新建/编辑/删除/恢复内置；提示词编辑器底部加「提取约束」旋钮（descMaxChars/maxItems/attrTotalCap）。
- **Step3 内置重写**：config.ts 系统提示词 + 6 模板专业重写（角色定位/分步法/字段语义/反幻觉/枚举约束/JSON 契约），字段口径不变。
- **Step4 选择器两级钻取**：ai-summarize PanelState `expanded`→`drillBook`；renderBooksView（搜索只显命中书）+ renderEntriesView（返回按钮+本书条目）；onSearch 填 searchBooks；enterBook/back 替代 toggle。
- **Step5 初始化收拢+内嵌载体**：managed-modal/stash-modal 删 seed/write-initial 按钮与 handler + 清未用 import；init-manager 看板行改「读入本地/写出条目」并显「条目 N 卡 / 本地 M 卡」；新增 ⑥ 数据载体区（绑定世界书↔内嵌 character_book 复制迁移 + 从内嵌读入本地）；新建 `lib/char-book.ts`（getCharData/updateCharacterWith 读写内嵌世界书）；stash-io 抽出 `parseInitialEntryContents`（零行为变化，供两载体共用）。
- **Step6 改进清单**：见会话输出。

**新增文件**：`lib/char-book.ts`。
**新增 key**：`_th_ai_styles_custom_v1` / `_th_ai_style_overrides_v1` / `_th_ai_personas_v1` / `_th_ai_persona_overrides_v1` / `_th_ai_persona_active_v1`（均登记 INIT_LS_KEYS）。
**回滚**：`cp .backup/batch-6-prompt-persona-init/<file> <path> && rm lib/char-book.ts && pnpm build:dev`。
**待验收**：见下方会话验收清单。

---

## §L. 批次7 · 7 项反馈（搜索失焦/人格风格完善/卡片AI跟随/初始化三层重构/补充设计）（2026-06-25，代码完成待验收）

> 备份 `.backup/batch-7-feedback/`（13 文件）。`pnpm build:dev` 通过（产物 ~5.6MB），`npx tsc --noEmit` 我引入文件零错误（仅 pre-existing 噪音：lucide/@floating-ui TS2307、stash-io TagsByKind TS7053、links-init 既有 syncBidirLink/escAttr TS6133、status-bar-init 全库 TS6133）。

### L.0 用户 7 项反馈
1. 搜索框输入汉字失焦（拼音 didian 未上屏即失焦，无法输入中文）。
2. 7 人格细节太简略需完善；「温柔妈妈」「魅魔」起诗意名；删调月莉音/米拉杰的括号。
3. 8 风格提示词同样太简略需完善。
4. 所有卡片「AI 重写」「AI 润色」要跟随头部人格+风格，不能单独。
5. 初始化管理「写入」是全部一次写很难用，5 种类型分开；三层存储模型（实时卡片 ⟷ 初始卡片 ⟷ 角色卡 [初始] 世界书），逻辑乱需重整。
6. 补充设计：激活监控、发送前预览、世界书↔卡片双向同步检测、整包导出导入、提示词 token 实时估算。
7. 一次性做完统一验收。

### L.1 实施
- **反馈1（搜索失焦）** `ai-summarize.ts`：选择器列表区独立成 `.th-ai-body` 包裹层，搜索/进入/勾选只重渲染 `rerenderBody()`（绝不触碰 `#th-ai-search` 输入框 DOM）；新增 `_imeComposing` 标志 + compositionstart/end 监听——拼音组合期间不触发搜索重渲染。`enterBook/toggleBookAll/onSearch/onAddToPool` 全改调 `rerenderBody`。
- **反馈2（人格）** `config.ts`：7 人格全部扩写为「身份/性格/说话风格/工作态度」多段细节；温柔妈妈→**慈樱**、魅魔→**梦魇蔷薇**（诗意名）；删「调月莉音（碧蓝档案）」「米拉杰（妖精的尾巴）」括号→「调月莉音」「米拉杰」。
- **反馈3（风格）** `ai-summary-store.ts`：8 内置风格 systemSuffix 全部扩写（意象/句式/适用范围 + 不破坏结构与事实的守卫语）。
- **反馈4（卡片 AI 跟随）**：`ai-refine.ts` 润色系统词 = `getActivePersonaText()+REFINE_SYSTEM+getAiStyleSuffix()`；`managed-modal.ts` aiRewriteDesc 改用 generateRaw + ordered_prompts（人格+重写指令+风格），与 AI 总结同口径。
- **反馈5（三层重构）**：
  - 新建 `lib/init-cards.ts`：独立中间层 `_th_init_cards_v1`（7 kind 卡片字典 + 关联图），CRUD + 整包快照。
  - `stash-io.ts` 加 `setInitialItemsForKind`（按 kind 覆盖写世界书，储藏间只动该子类分组）+ `managedMapToInitialItems`。
  - `init-manager.ts` 看板重构为**三层 8 行**（地点/事件/DLC/物品/技能/状态/衣物/关联），每行 6 向流：实时→初始 / 初始→实时（增量+diff 预览）/ 初始→世界书（覆盖）/ 世界书→初始（覆盖）+ 编辑初始卡片（新增 `openInitCardsEditor` 网格增删改 + `editInitLinks` JSON 编辑）。储藏间 4 子类各一行落到同一 [初始·储藏间] 条目不同 group；未分类/自定义不入初始流（看板下方注明）。
  - `links-init.ts` `writeLinksGraphToInitial` 加可选 `graphOverride` 参数（供初始层关联写出）。
- **反馈6a（激活监控）**：新建 `modules/activation-monitor.ts`，监听 `WORLD_INFO_ACTIVATED`，环形缓冲最近 20 轮，面板实时列条目名/世界书/关键词；`setupStatusBar` 开机即 `startActivationMonitor()`；菜单加「激活监控」入口（satellite-dish）。
- **反馈6b（发送前预览）** `ai-summarize.ts`：AI 面板加「发送前预览」按钮 → `openSendPreview` 逐桶展示最终 system（人格+系统+风格）+ user_input（模板+约束+各 task 原文）+ 每桶 token 估算。
- **反馈6c（双向同步检测）** `init-manager.ts`：`renderSyncCheckSection`/`runSyncCheck` 对比初始卡片层 vs 世界书条目，列「仅初始/仅世界书/内容不一致」差异。
- **反馈6d（整包导出导入）** `init-manager.ts`：`renderPackSection`/`exportFullPack`/`importFullPack`，打包初始层+managed+标签+世界书 [初始] 条目+全部 AI 配置（`th-full-pack-v1`），导入二次确认覆盖。
- **反馈6e（token 估算）** `prompt-settings.ts`：提示词/人格/风格编辑器各加实时 token 估算（输入即刷新，≈字数/1.5）。

**新增文件**：`lib/init-cards.ts` / `modules/activation-monitor.ts`。
**新增 key**：`_th_init_cards_v1`（初始卡片中间层，未登记 INIT_LS_KEYS 但 PACK_EXTRA_KEYS 已含；整包导出覆盖）。
**回滚**：`cp .backup/batch-7-feedback/<file> <path> && rm lib/init-cards.ts modules/activation-monitor.ts && pnpm build:dev`。

### L.2 验收清单（导入 `dist/前端悬浮球V1/index.js` 逐项点验）
1. AI 总结左栏搜索框输入「didian」拼音→能正常上屏选字，不再失焦；搜索只显命中世界书；中文/英文搜索均正常。
2. 提示词编辑→头部人格下拉：7 人格名为「调月莉音/樱岛麻衣/千反田爱瑠/四宫辉夜/米拉杰/慈樱/梦魇蔷薇」（无括号）；编辑某人格→文本为多段细节。
3. 提示词编辑→提取风格：8 风格编辑后 systemSuffix 为扩写详版。
4. 卡片编辑弹窗「AI 重写」+ 卡片「AI 润色」：选某人格/风格后，结果文风跟随（可在发送前预览/输出对比）。
5. 初始化管理：三层 8 行看板，每行实时/初始/世界书三列 + 4 箭头独立读写；储藏间物品/技能/状态/衣物各一行，写出只动对应 group 不互相覆盖；点「编辑」改初始卡片层不影响实时/世界书。
6. 双向同步检测：改某条初始卡片后点「检测差异」→ 列出与世界书的差异。
7. 整包导出→换环境导入→三层数据+AI 配置齐全。
8. 激活监控：菜单「激活监控」→ 发起对话后实时列激活条目。
9. 发送前预览：任务池非空→「发送前预览」→ 逐桶显示最终拼装文本 + token。
10. token 估算：编辑提示词/人格/风格时实时显示 ≈token。
11. tsc 无我引入错误；批次 1-6 全部功能无回归。


---

## §M. 批次8 · 10 项反馈修复 +（11/12 待设计）（2026-06-25，1-10 代码完成待验收）

> 备份 `.backup/batch-8-feedback/`（13 文件，icons.ts 例外见下）。`pnpm build:dev` 通过（产物 ~5.42 MiB / 5682346 B），`npx tsc --noEmit` 我引入文件零错误（仅 pre-existing 噪音：lucide/@floating-ui TS2307、status-bar-init/links-init/tag-manager 全库 TS6133）。
> 注：lucide-static 经 webpack externals 走 jsdelivr CDN（`webpack.config.ts:575`），node_modules 里没有；图标缺失表现为白色 `th-ico-missing` 方框。

### M.0 用户反馈（1-10 做，11-12 仅设计）
1. 人格扩两个（修仙空灵小师妹 / 清冷反差肉欲师尊）+ 全人格再扩细节去标签化；风格扩更多题材（修仙/武侠/玄幻/西幻等）。
2. 多处图标白方框：初始化管理、写入写出、激活监控、世界书激活监控、卡片导出条目、锁定。
3. 三层数据看板表头文字与下方行未对齐。
4. 激活监控加手动刷新。
5. 初始化管理卡片可视化重新设计（旧可视化好用，现版不好用）。
6. 数据载体功能已多余 → 删除。
7. AI 重写/润色加 modal：选发送提示词设定（默认读提示词编辑设定）+ 玩家自定义额外输出。
8. 发送预览「预计输入 token」错（加 4 条共 2 万 token 仍显示 3）。
9. 自定义提示词字数改上下限区间；数值总分上限含义不清 → 删除。
10. 统一占位符字体颜色为灰白（很多占位符与输入字体同色无法区分）。
11. 新增「世界」按钮（变量审核与设置之间）：微信聊天 / 世界演化 / 小剧场 / 世界论坛。
12. 11 的补充：微信/微博/蜜语/魔坊/通话 五大 APP 细节。

### M.1 实施（反馈 1-10）
- **1 人格+风格** `config.ts`：7 人格全部扩写为「身份与来历/性格内核/说话风格/习惯与癖好/工作态度」5 段细节（去刻板化）；新增 2 人格 `云杪`（修仙空灵小师妹）`墨渊`（清冷反差肉欲师尊），共 9 内置。`ai-summary-store.ts`：8 风格基础上加 8 题材风格（修仙·仙侠/武侠·江湖/玄幻·东方奇幻/西幻·剑与魔法/科幻·未来/赛博朋克/古风·诗词雅韵/克苏鲁·诡秘），共 16 内置。
- **2 图标** `icons.ts`：补 27 个缺失 fa→lucide 映射（arrow-right/database/satellite-dish/file-export/lock/code-compare/pen-ruler/spinner/stethoscope/syringe/trash-can-arrow-up/id-card/play/image/eraser/grip-lines/diagram-project/circle-* 等），全部为已验证存在的 lucide-static 官方导出。
- **3 看板对齐** `init-manager.ts` renderTriLayerDashboard 表头补成 6 格（label/live/⟷/mid/⟷/wb）与行 grid 列严格对应；`status-bar.css` 表头 live/mid/wb 居中、gap 列居中弱化。
- **4 激活刷新** `activation-monitor.ts`：加「刷新」按钮（重确保监听 + 重渲染 body + toastr 提示）。
- **5 可视化重设计** `init-visual-editor.ts` 新增 `openInitLayerVisualEditor(kind,getMap,saveMap,onClose)`：复用世界书可视化的卡片网格 + 结构化字段拆分（物品/技能/状态/衣物各字段独立 input/select/textarea，地点/事件/DLC 走 desc+links），数据源改初始卡片层内存 map，整组覆盖保存。`init-manager.ts` editInitCards 改调它；删旧 `openInitCardsEditor`/`openInitCardEntryEditor`（纯文本表单）。
- **6 删数据载体** `init-manager.ts`：删 renderCarrierSection/refreshCarrierCount/copyBoundToEmbed/copyEmbedToBound/readEmbedIntoLocal + 渲染调用 + 3 绑定 + char-book 导入 + 孤儿 parseInitialEntryContents/escAttr import。
- **7 AI 重写/润色 modal** `ai-refine.ts`：加 `renderPersonaStyleControls()`（人格/风格下拉，默认选中激活项）+ resolvePersonaText/resolveStyleSuffix（id 显式覆盖、undefined 跟随激活）；润色 modal 加该控件 + 「润色要求/额外输出指令」；新增 `openRewriteModal(kind,name,curDesc,onResult)`。`managed-modal.ts`：AI 重写改调 openRewriteModal（填回 desc 输入框），删旧 aiRewriteDesc/getGenerateRawForRewrite + 孤儿 import（getRoot/resolveGenerateApiConfig/getActivePersonaText/getAiStyleSuffix）。
- **8 token 修复** `ai-summarize.ts` dryRunPreview：原 `estimateTokens(String(chars))` 把字符总数当字符串估算（2万→"20000"→3 tok），改为按真实拼装文本（system 人格+系统+风格 + buildBucketInput 的 user_input）估算，与发送口径一致。
- **9 字数区间+删总分** `config.ts` AiPromptConstraints：加 `descMinChars`、删 `attrTotalCap`；`prompt-settings.ts` 编辑器 desc 改「下限~上限」双输入 + 下限>上限校验、删数值总分上限输入；`ai-summarize.ts` 约束文本渲染支持区间（都填=区间/只上限=N字内/只下限=不少于N字）。
- **10 占位符灰白** `status-bar.css`：加全局兜底 `.th-status-wrapper input/textarea::placeholder{color:var(--tx3)!important;opacity:.6!important}`（含 -webkit- 前缀），压过零散旧规则，真实输入文字不受影响。

**改动文件**：lib/icons.ts、lib/config.ts、lib/ai-summary-store.ts、modules/init-manager.ts、modules/init-visual-editor.ts、modules/activation-monitor.ts、modules/ai-refine.ts、modules/managed-modal.ts、modules/prompt-settings.ts、modules/ai-summarize.ts、status-bar.css。
**新增 key**：无。**删除**：数据载体功能、AiPromptConstraints.attrTotalCap。
**回滚**：`cp .backup/batch-8-feedback/<file> <path> && pnpm build:dev`（icons.ts 为纯增量加映射，回滚意义不大；其余为完整原件）。

### M.2 验收清单（导入 `dist/前端悬浮球V1/index.js` 逐项点验）
1. 提示词编辑→人格下拉见 9 人格（含「云杪」「墨渊」），每个编辑见 5 段细节；风格下拉见 16 种（含修仙/武侠/玄幻/西幻/科幻/赛博/古风/克苏鲁）。
2. 初始化管理/激活监控/卡片编辑弹窗：原白方框图标（写入写出箭头、database、satellite-dish、导出条目、锁定🔒）现在都是正常线条图标。
3. 初始化管理三层看板：表头「类别/实时卡片/初始卡片/世界书」与下方各列对齐。
4. 激活监控弹窗有「刷新」按钮，点击重列当前激活记录。
5. 初始化管理三层看板某行点「编辑」→ 弹可视化卡片网格（储藏间结构化字段拆成独立输入框），增删改/复制/保存写回初始层。
6. 初始化管理面板底部不再有「数据载体（角色卡内嵌世界书）」区块。
7. 卡片编辑弹窗点「AI 重写」「AI 润色」→ 弹 modal，内有人格/风格下拉（默认=提示词编辑里的激活项）+ 额外输出指令框；生成跟随所选设定。
8. 发送前预览/发送预览：加几条 2 万字条目后「预计输入 token」显示万级而非个位数。
9. 提示词编辑器约束区：desc 字数为「下限~上限」双框，无「数值总分上限」；下限>上限报错。
10. 各输入框/文本域占位符为灰白，与输入的深色文字明显可区分。
11. tsc 无我引入错误；批次 1-7 全部功能无回归。

### M.3 反馈 11/12 — 「世界」按钮（仅设计方案，未实现，待与用户讨论后开做）
见会话输出方案文档。
