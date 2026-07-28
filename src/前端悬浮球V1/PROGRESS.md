# 前端悬浮球V1 · 状态与下一步

> **单一可信源**。新会话接手先读完本文件 → 读 `@types/` 关键类型 → `ls src/前端悬浮球V1/{lib,modules}/{,world/}` 确认结构,再动手。
> 历史批次的逐项实施日志已清理(**代码即真相**;批次摘要在 memory + git log)。本文件保留:必需地基 + 长期要求(提示词/设置/UI/API)+ 已实现盘点 + 下一步计划。

---

## 0. 当前结论(新会话先看)

| 维度 | 信息 |
|---|---|
| **项目** | `src/前端悬浮球V1/` — 此间天地酒馆助手悬浮球状态栏 |
| **世界观** | 此间天地 = **现代仙侠 × 高维仙宫 × 日式校园恋爱喜剧 × 轻松日常单元剧 × 无厘头甜蜜修罗场**。全女性百合(霜月仙宫 32 仙主 + 星见丘学园),修仙「降维」服务于生活/情趣/笑点,**没有阴暗面**(禁致郁/虐主/外部反派/沉重代价,冲突当天喜剧收场)。设定原文在 `角色卡工作室/此间天地/世界书/`(霜月仙宗设定·星见丘学院设定·世界观·叙事指南)。 |
| **打包** | **`pnpm build`(production,项目根执行)** → 产物 `dist/前端悬浮球V1/index.js`(用户手动导入酒馆,AI 无法代为导入)。与上游教程和 CI 一致。`build:dev` 只用于本地调试。⚠️ 曾有过「本项目必须 dev、prod 导入不显示」的规定,那是**误判**:真因是 `lib/icons.ts` 里 `CircleHalf`/`Stream` 两个 lucide-static 不存在的具名导入,prod 逐名导入在解析期报 SyntaxError 导致整个模块不执行(dev 的命名空间导入会把缺名吞成 undefined)。2026-07-28 已修,prod 实测导入成功。详见 README「踩坑档案」。 |
| **核心约束** | 行为/布局变化需用户拍板;每批 `tsc --noEmit`=0 + `build` + 用户导入验收 |
| **回滚** | V1 已 git 跟踪(P2 起 276 文件入库),回滚走 git;分阶段 commit |
| **下一步** | 全部规划 app 与三栏重构已落地(小剧场/世界论坛三栏重构 + 美团/饭饭/喜马/最右/工作台 5 新 app 均完成)。工作台 order160 `.thw-wkb-app2`。等用户新反馈。 |

### 0.1 正确的变量路径(关键,代码里不显然)
**User 玩家**(userKey 由 `getUserKey(data)` 取,不是固定 'user'):`{userKey}.拥有物品 / 拥有技能 / 状态 / 当前穿着衣物`。
**NPC**(`getNPCs(data)` 返回 `[{name,info}]`):`NPC.{npcName}.拥有物品 / 拥有技能 / 状态 / 当前穿着衣物 / 是否在场`。
主角名提取:第一个非 `user/{{user}}/<user>` 占位符 key 为主角。不要随意重写。

### 0.2 敏感词状态(不要再次中性化)
NPC 数值指标已从外审中性词**还原为原始词**(与 MVU 角色卡变量同名):情欲值/敏感值/羞耻值/高潮次数/被内射次数;hover 标题「亲密记录」。当前渠道无外审,**保持原始词,不要中性化**。

---

## 1. 新会话开场清单(按顺序)
1. 全文读本文件。
2. 读酒馆助手类型:`@types/function/{variables,generate,worldbook,inject,chat_message}.d.ts`、`@types/iframe/exported.mvu.d.ts`。用到哪个接口先 grep 它的签名,别凭记忆。
3. `ls src/前端悬浮球V1/{lib,modules}/{,world/}` 确认结构(见 §3)。
4. 改代码后必跑 `pnpm build`(production,交付产物);抽取/改 export 后必跑 `npx tsc --noEmit -p tsconfig.json`(两种 mode 都走 transpileOnly **不报漏 export**)。改 CDN 外部依赖(lucide-static 等)的导入名后,**必须跑 `pnpm check:cdn`**(校验具名导入在 CDN 真实存在,缺名会让 prod 整个界面不显示)——dev 会把不存在的导入名吞成 undefined,别拿 dev 能跑当证据。UI 行为需用户重新导入产物实测。

---

## 2. 数据模型(现有,新功能复用)
```ts
type ManagedItemV2 = {
  desc: string; tags: string[]; order?: number; inject?: string;
  favorite?: boolean; lastEdited?: number; locked?: boolean;
  links?: { locations?: string[]; events?: string[]; dlcs?: string[] };
};
type AiPersona = { id: string; name: string; persona: string; builtin: boolean };
type AiStyle   = { id: string; name: string; systemSuffix: string; builtin?: boolean };
```
- 初始数据条目:`[初始·地点/事件/DLC/储藏间/关联]`(蓝灯 constant+禁用)。三层存储:实时卡片 ⟷ 初始卡片(`_th_init_cards_v1`) ⟷ 世界书 `[初始·xxx]`。
- 所有 localStorage key:`_th_*`+`_vN`;状态栏侧登记 `lib/config.ts` INIT_LS_KEYS;世界套件侧登记 `lib/world/world-store.ts` WORLD_LS_KEYS(均纳入整包导出)。

---

## 3. 当前文件结构
```text
src/前端悬浮球V1/
├── index.ts / Shell.vue          # webpack 入口 + 悬浮球外壳
├── status-bar.html / .css        # 静态模板 / 单主题糖果粉 CSS(全 .th-* 前缀,~7400 行)
├── status-bar-init.ts            # 主调度 + openModal2/closeModal2(堆叠 revive)+ 顶层 export
├── lib/
│   ├── icons.ts                  # Lucide SVG 映射(fa→lucide;缺失→白方框;走 jsdelivr CDN external)
│   ├── dom-utils.ts              # DOM 工具 + 环境单例(__doc/__body/gw/qs/esc)
│   ├── tavern-api.ts             # 酒馆助手 API 封装层
│   ├── managed-store.ts / init-cards.ts / char-book.ts / links-init.ts
│   ├── config.ts                 # 常量:NPC_METRICS/AI_PERSONAS/破限默认词/INIT_LS_KEYS
│   ├── preset-env.ts             # generate 接口兜底 + resolveGenerateApiConfig
│   ├── ai-summary-store.ts       # 风格/人格/破限 CRUD + 任务方案
│   └── world/                    # ★ 世界套件共享底座
│       ├── world-store.ts        # `_th_world_*` 统一读写 + WORLD_LS_KEYS + 整包导出
│       ├── contacts.ts memory.ts media.ts ai-chat.ts worldbook.ts
│       ├── world-prompts.ts      # 分 app·feature 提示词注册 + 覆盖 `_th_world_prompts_v1`
│       ├── world-app-settings.ts # 共享设置面板(wbSync/apiPlan/promptList/promptEdit)
│       ├── wb-picker.ts api-plan.ts wb-sync.ts phone-shell.ts
│       ├── ui-kit.ts             # ★第十轮 内置玻璃组件 thToast/thConfirm/thPrompt/thAlert
│       ├── evolution-store.ts evolution-presets.ts                # 演化(角色线)
│       ├── world-state-store.ts world-state-prompts.ts            # ★第十轮 结构化世界态
│       └── forum-store.ts forum-presets.ts                        # 论坛(板块类型/预设)
└── modules/
    ├── managed-modal.ts stash-modal.ts tag-manager.ts npc-detail.ts hover-tip.ts …
    ├── ai-summarize.ts ai-refine.ts prompt-settings.ts api-settings.ts appearance-settings.ts
    └── world/                    # ★ 世界 APP(20 个 registerWorldApp：19 功能 app + settings)
        ├── world-app.ts          # 桌面壳(单 modal SPA) + settings-app.ts(设置)
        ├── wechat.ts weibo.ts tangxin.ts(糖心) call.ts
        ├── evolution.ts world-state-ui.ts(演化双模式) forum.ts theater.ts(小剧场)
        ├── bili.ts red.ts cal.ts diary.ts browser.ts
        ├── taobao.ts meituan.ts fanfan.ts xmly.ts zui.ts wkb.ts(工作台)
        └── memory-center.ts
```

---

## 4. 不要破坏的约束(硬规则)
- **跨窗口陷阱(必读)**:脚本跑在 unsandboxed iframe;inline `onclick` 在 **parent 窗口**执行,模块/`addEventListener` 在 **iframe 窗口**。所有按钮交互**必须用 data 属性 + iframe 内 addEventListener 委托**,不用 inline onclick;读全局接口走 `window` 优先 → `getRoot()` 兜底。
- **命令式 innerHTML + openModal2 + data 属性委托,不引 Vue**;modal 堆叠用 **revive 回调重渲染**(非 innerHTML 快照——快照丢监听):`openModal2(t,b,{maxWidth,revive,replace,reset,phone})`;主面板 `reset+revive`,瞬态(进度/预览)用 `replace`。
- **★二级弹窗 portal 到 body(必读,代码里不显然)**:`.th-modal-overlay-2`(世界壳 + API/外观/初始化/储藏/标签/提示词等 ~10 个共用二级弹窗)在 setup 时被 `portalModal2ToBody()` **移出 `.th-status-wrapper`、挂到父页 body**,以逃出主面板的 containing block/层叠上下文(否则世界被面板裁剪 + 面板 backdrop 玻璃透出)。配套铁律:① 查询二级弹窗**壳自身**(overlay/modal-2/title/body/close)用 `qs2()`,查**壳内内容**(如 `qs('#'+RID)`、20 个 app 容器)用 `qs()`——`qs/qsa` 已带 portal 兜底,壳内查询零改动;② portal 后 overlay 脱离 wrapper 继承,`status-bar.css` 用 `.th-modal-overlay-2[data-th-portal="1"]` 补回 font-body/色/17px/box-sizing 基线(否则字体灰白+布局散);③ 世界(phone)打开时 `openModal2` 给 body 加 `.th-world-active`,CSS `body.th-world-active .th-fab-panel` 把主面板整体透明化(不描边/不拦截/隐藏可见区),关闭移除 → 无论从悬浮球还是顶栏「世界」按钮进,面板玻璃都不透出;④ phone 外壳底部 Home 条 `[data-phone-home]` = 返回桌面(`setPhoneHomeHandler(showDesktop)`,不关整个世界,可连续切 app);⑤ **通用 `.th-modal { contain:layout paint }`(§2607) 会裁 phone 机身绘制** → 世界拖出原居中框被裁(表现为"被世界原版容器遮挡"),`.th-modal-2.th-phone-host` 必须 `contain:none !important`(单 overflow:visible 不够);⑥ **portal 前用 `.th-status-wrapper .th-X` 前缀写的弹窗内部样式,portal 后全失配**(表现:弹窗只剩按钮+文字、布局全丢)——modal 专用类族(`.th-init-*`/`.th-ps-*` 已改)一律用 `.th-modal-overlay-2 .th-X` 前缀,**别用 `.th-status-wrapper`**。新写二级弹窗内部 CSS 遵此。⑦ **ui-kit 弹窗(thConfirm/thAlert/thPrompt/thToast)也 portal 到 body**(批次32·反馈5):原挂 `.th-status-wrapper`(该元素 `position:relative;z-index:0` 自建层叠上下文),世界 overlay portal 到 body(z 100300)后整个 wrapper 子树被压在世界之下、且 `body.th-world-active .th-fab-panel{pointer-events:none}` 波及 → 世界内弹确认框在世界下面且点不动。改 `ui-kit.ts` 的 `buildDialog`/`ensureToastHost` 挂 `__body`(带 `data-th-portal="1"`),z 110100/110200 真正压过世界;CSS 基线块已扩展覆盖 `.th-dlg-overlay/.th-toast-host[data-th-portal]`。新写 body 级弹层同理:挂 body + 带 portal 标记补基线。
- **输入框黑底坑(已根治,见 §5)**:`status-bar.css` 末尾「按容器根兜底」段已统一压白底,**新输入框默认即白,无需再写专属规则**;自绘开关 checkbox 加 `.th-switch` 豁免。
- **图标(白方块反复出现，务必收口)**:新增 fa 类名要在 `icons.ts` 映射表登记(import PascalCase 导出名 + ICONS 表加 kebab key),否则白方块;`inner()` 必须保留 undefined 防御。lucide 官方名查 https://lucide.dev/icons 。**每批交付前必跑图标自检脚本** `python .backup/batch25b/scan_icons.py`(扫全 src 的 `fa-*` 引用对照 icons.ts 已注册键，列出缺失；忽略 `fa-solid/fa-regular/fa-spin/fa-xxx` 等 FA 样式前缀与 `fa-circle` 空渲染这类误报)。**新建 app / 新增品类·榜单·tab 图标时，先把该 app 的 `fa-` 全过一遍脚本再提交**。
- **CJK 在 Edit 工具里匹配脆弱 → 用 ASCII 锚点编辑;Write/Edit 内容超 50 行分段写**(超时/限制)。
- 单主题糖果粉为状态栏基底;**不加 dark mode 切换**。世界套件各 app 可有自己的主题色/皮肤。
- PC 端设计,**不做移动端/响应式适配**;NSFW 沿用项目无外审基调。

---

## 5. 元规则(所有会话必读)
1. 不清楚/语意不明 → 直接问用户,不要猜。
2. AI 无法把代码导入酒馆;要 MCP 验证需先让用户导入确认(不拍截图,用 evaluate_script/take_snapshot)。
3. 代码 build 完 → 用通俗语言说改了什么 + 给验收计划(不要只说「build 通过」)。
4. 行为/布局变化需用户拍板,记录在 PROGRESS 等验收。
5. 破坏性操作走二次确认(用 `thConfirm`,不用浏览器原生)。
6. 每批完成给用户:改了什么(通俗) / build 结果 / 逐项点验计划 / 下一步。

---

## 6. ★长期要求(用户反复强调,所有会话所有 app 都要遵守)

> 这三块是从第 5~10 轮反复强调中固化的「贯穿性要求」,**不是某一次的临时反馈**。任何新 app / 重构都必须满足。

### 6A. 提示词要求
- **每个 app 必须有「破限(系统预设)」** `<app>.jailbreak`,注册进 world-prompts,在该 app **所有** AI 生成的 system 最前拼接(走 `chatGenerate({jailbreak})` 的 `ordered_prompts[0]`,别漏任何一条生成路径)。结构:`[SYSTEM_OVERRIDE_PROTOCOL: XXX]` + CORE_DIRECTIVE(卸载助手身份/NSFW 显式授权/场景定义) + CORE_BEHAVIOR(拟真语感、非全知视角、**反第四面墙 + 严禁「作为AI…/抱歉…」免责声明**) + **TONE_LOCK(锁死霜月仙宫日常喜剧基调:明亮轻松甜蜜、无阴暗面、修仙降维服务于生活情趣笑点)**。
- **功能提示词要专业、信息密度高,绝不敷衍**(用户多次批评「太简陋」):角色代入(正向措辞「你就是X本人,正在…」,**不写「不是扮演/不是AI/不是在表演」等负向否定**——会强化AI自我认知、减弱人格锚定、出戏)→ 场景/人设/上下文注入 → 分条硬规则(语气/边界/格式/网感黑话/拟真元数据)→ **严格 JSON 输出契约**(本项目走 JSON 解析,不抄 yuzuki 的 `<tag>` 文本格式,会拆解析链路)。
- **★提示词必须通用化 + 读绑定世界书**(第十轮固化的核心):具体设定(六宫职能/角色名/地点细节)**不写死进 prompt**,改从**绑定的世界书条目**读取并注入 system(参考 evolution 的 `buildActorSetting`/`worldbookAnchor`、`resolveWbRefsByName` 按名自动绑定 + 持久化)。设定改了只改世界书、永不改提示词。每个能生成的模板都应支持绑定世界书条目。
- **★★去卡专有名(批次26·点2 固化)**:除**世界演化**(world-state/evolution)一族可保留霜月仙宫/星见丘等本卡专名外,**其余所有 app 的初始提示词一律不得出现具体专名**(霜月仙宫/星见丘/谪仙宫/听风宫/婉音/秦筝/苏墨墨/顾漫漫/万花镜/仙宫…),改用中性描述(「当前世界」「绑定世界书」「通讯录里的主播」)。目的:换角色卡时不串设定、不乱入人物。
- **★★★正向指引、禁写负面禁令**(批次26·点2 教训):通用化=**只做正向指引**——「有世界信息/绑定世界书就以它为准,没有就退回中性常识发挥」。**绝不要**写「禁止套用某张卡的专有设定/不预设任何世界观」这类负面禁令:基础提示词本就不含那些专名、AI 读不到,写了反而会让**玩家真绑了世界书时 AI 畏手畏脚、不敢遵循绑定设定**。绑定世界书永远是权威来源,提示词只需鼓励使用它。
- **★★★★禁酒馆黑话进提示词正文**(批次26·点2b 固化):「世界书」「角色卡」「楼层/几楼」「破限」「注入」这些是**酒馆机制的内部称呼**——AI 最终只收到提示词文本、收不到这些机制,写进 prompt 正文只会增加理解负担、让 AI 多想。**面向 AI 的提示词正文里**一律改中性说法:世界书→「以下设定资料/本作权威设定/背景资料」、角色卡→「本作/这个故事」、最近几楼正文→「最近的剧情」、破限→不提。(变量名/desc/UI 文案/代码注释里可保留这些词,只清理**发给 AI 的正文**。)
- **★★★★★禁 AI 痕迹写法**(批次26·点2b 固化):提示词正文是**发给 AI 的指令**,不是给开发者的说明书。① 不要把「给你的要求/设计说明」当成注释、备注、补充塞进提示词结构;② 不要写括号元评论旁白(如「(成人浓度只在色情度拉高时才升温)」「(这是最重要的钩子)」「(务必)」这类对指令本身的自我点评)——要么删掉,要么改写成自然的祈使句。判断法:这句话是"让 AI 去做某事"还是"在向读者解释这条提示词"?后者一律清理。
- **必抄的横切技巧**:① 公私域信息隔离(公开渠道的网友只能基于公开信息,禁止精准复述私聊/私密日常);② 配图双值协议(中文描述给玩家 + 英文 NAI tags 给出图);③ 楼中楼/回帖防重复防同质化 + authorId 多样性铁律;④ 群成员/发言人白名单(禁 AI 自创路人或串窗口);⑤ 注入正文用隔离标签(如 `<luntan>`)防 RP 模型续写。
- yuzuki/xiao-shouji 的提示词原文可自由参考改写(用户已多次授权,勿纠结 license)。

### 6B. 设置要求(每个 app 都要全套,不许省略)
对标微信/微博/糖心的设置完整度,每个 app 的设置必须包含(缺一即不合格):
- **生成上下文**:参考正文楼层(读不读 + 读几楼)+ **注入酒馆世界书条目 → 本 app**(用 `wb-picker`,**必须复选/条目级多选**;把选中的世界书条目内容注入本 app 的生成上下文)。
- **app 信息 → 角色卡世界书**:用 `wb-sync`(`wbSyncPanelHtml`/`runMemorySync`),把 app 产出的信息生成世界书条目、写进角色卡主世界书(强制禁递归),让正文也能读到。微信/微博/糖心/B站/小红书/日历/日记/浏览器/论坛**已做**;**演化/世界态/小剧场/通话/情书 还缺,要补**。
- **功能提示词**:列表 + 可编辑 + 恢复默认,**含破限**(用共享 `promptListPanelHtml/promptEditPanelHtml/bindPromptPanelClick`)。
- **API 利用**:用 `api-plan`(一次生成产出哪些 feature + 批量额度)。
- **记忆管理**:`openSessionMemory(appId)` 入口。
- **数据管理**:清空本 app 数据(保留设置)。
- **楼层自动触发**:每 N 楼自动生成一次(0=关)。
- **各 app 专属设置**:按 app 特性再扩(如界面配色/背景/各自业务开关)。
- **原则**:凡微信/微博/糖心设置面板里有的、且对本 app 功能有用的项,都要给本 app 补上,不许省略。

### 6B-1. 世界书绑定的两条注入链路(务必都做,别只做一半)
两个方向是不同功能,每个 app 都要有:
1. **世界书条目 → app**(喂设定/上下文进生成):`wb-picker` 复选选条目 → `buildInjectFromKeys` 注入生成 system。**所有绑定一律复选,不许单选。**当前缺陷:演化的世界书绑定是「一次点一个条目」的选择器、世界态的「地点」每个只能绑 1 个条目——**这些都要改成复选**。
2. **app → 角色卡世界书**(把 app 信息沉淀成世界书条目):`wb-sync` 把热帖/演化结果/对话等生成世界书条目写进角色卡主世界书(禁递归),正文可读。见上一条「已做/还缺」清单。


### 6C. UI 设计要求(★本批重点)
- **目标质感:高端、与众不同、设计细节丰富的「平板电脑内部 app」**。yuzuki-phone-main 做得非常好,**学其设计思路与理念**(不是抄配色)。做成普通 MVP = 失败。
- **学习而非照抄**:参考 yuzuki(玻璃拟态:`backdrop-filter: blur()+saturate()` + 分层阴影 ambient+contact+inset 高光顶边 + 弹性缓动)+ xiao-shouji(token 纪律 + 物理按压反馈 hover 抬升/active 下沉缩放)。**不要参考现有 app 的美化(都很差,要逐个重构)**。
- **微交互**:悬停效果、按压位移、卡片错峰入场、点赞 heart-burst、骨架屏加载、统一缓动曲线(入场/弹性/标准三条 cubic-bezier)。灵敏生动鼓励交互。
- **内置警告/通知/输入框**:全部用 app 内组件,**绝不用浏览器原生 alert/confirm/prompt 或外部 toastr**。第十轮已建好 `lib/world/ui-kit.ts`(`thToast/thConfirm/thPrompt/thAlert`,Promise 化、渲染进 wrapper、继承作用域样式与白底兜底)——**后续 app 直接复用这套**。⚠️ `thPrompt` 的输入框样式(`.th-dlg-input`)已在批次17补齐(深底高对比字 + `-webkit-text-fill-color` 兜底);新增任何弹窗输入框都别再让它裸继承祖先字色(否则白底粉字看不清,批次17 bug1)。
- **设计系统地基(第十轮已沉淀,继续套用)**:CSS `status-bar.css §10.6` 玻璃 token(`--th-glass-* / --th-elev-1/2 / --th-ease-in/bounce/std`);组件渲染进 `.th-status-wrapper` 内继承样式。

### 6D. ★全 app 同步约束(批次17·反馈6 固化,违反即不合格)
**任何「横切性」功能的新增/调整,必须一次性同步到全部 app(含最容易被遗漏的「浏览器」),不许只改一部分。** 历史教训:多轮反馈里浏览器/某些 app 被漏改,导致功能参差。
- 横切功能清单(改其一就要全 app 过一遍):生态浓度滑块与 `ecoDirective` 措辞、分类提示词 AI 重写、注入片段/封套、图片中文描述(coverDesc/sceneDesc)、破限提示词、API/世界书/记忆共享面板、跨 app 推微信、全局设置(性别/图片字数)。
- **注入片段信息完整性(批次25b·点8 固化)**:每个 inject `build()` 注入实体时,**不能只给名称**——要把该实体在 app 内的关键字段一并带上(店铺=品类/商圈/评分/人均/招牌菜/口碑;商品=价/店/卖点;视频=UP/分区/播放),否则正文 AI 会自行脑补出与 app 内不一致的细节。fanfan 已建 `fanShopInjectLine()` 统一档案行,注入与暂存夹共用。纯名单类(如微博「我关注的人」)例外,名字本身即全部信息。
- **生态色情/肉欲阀作用域(批次25b·点9 固化)**:`ecoErotic`/`ecoCarnal` 的滑块描述与 `ecoDirective`/提示词措辞必须**作用于全 app 全品类**,不许锁死在某一个子分类(历史坑:fanfan 锁「双修膳房」、meituan 锁「私密配送」、taobao 锁「成人情趣」——均已改为全 app 生效+该子区为"浓度更集中区")。
- **全局横切设置走统一层**:互动用户性别 + 图片描述字数是全局配置(`world-store` 的 `gender`/`imageDesc`),由 `world-globals.ts` 生成指令,在 `ai-chat.ts` 的 `chatGenerate` 统一注入——**所有走 chatGenerate 的 app 自动生效**。新增同类全局横切优先用这个统一层,不要逐 app 复制。默认值(全女性 / 20-60字)下不追加,零副作用。
- 新增 app 或改横切后,**用 grep 把该功能在所有 `modules/world/*.ts` 里点一遍**确认无遗漏,再交验收。

---

## 7. 酒馆环境能力(已核实,实现 app 前必读)
| 能力 | 接口 / 现实 |
|---|---|
| **AI 生成** | 走共享 `chatGenerate({system,user,jsonSchema?,aiPresetName?,shouldStream?,jailbreak?})`(底层 `generateRaw` ordered_prompts,绕开 RP 预设)。多任务**必须串行 await**(撞生成锁);json_schema 返回 JSON 字符串需 parse。 |
| **注入正文** | `injectWorldOnce(id,content)`(一次性)/ `injectWorldPersistent(id,content)`(持久)/ `uninjectWorld(id)`。**走 injectPrompts/临时世界书,绝不改聊天楼层**。注入公共内容包隔离标签防续写。 |
| **图片生成** | `tryGenImage(prompt,opts)` comfyui 直连;未配置/连不上 → 返回 null → 文字占位,**绝不阻塞**。 |
| **世界书** | `worldbook.ts`:`listWorldbookNames/listWorldbookEntries/buildInjectFromKeys/resolveWbRefsByName(按名自动绑定)`。条目 key = `book::entry`。 |
| **读正文** | `readTavernFloors(n)`;每 app 读几楼由玩家设置。 |
| **变量** | `getVariables` 读 `NPC.{name}.是否在场` 等;`updateVariablesWith` 写回。 |

---

## 8. 已实现盘点(代码即真相,均待验收;细节见各模块源码 + memory + git log)
- **状态栏地基**:解耦重构 + 视觉升级;世界书资产管理(地点/事件/DLC/储藏间/关联,三层初始化看板);AI 总结注入(任务池/分桶/json_schema/重roll/流式/快照);提示词体系(人格/风格/**破限**三段式 + CRUD);卡片 AI 重写/反向导出/激活监控。
- **世界套件入口**:顶栏「世界」按钮 → 桌面壳 + phone 外壳(`openModal2({phone:true})`,屏幕中央悬浮一台平板 + 实时状态栏)。
- **20 个 APP**(自注册 order,完整清单见 §10):微信10 / 演化20 / 小剧场30 / 论坛40 / 微博50 / 糖心60 / 通话80 / B站90 / 淘宝·小红书100 / 美团·日历110 / 饭饭·日记120 / 浏览器·喜马130 / 最右140 / 记忆150 / 工作台160 / 设置999。(情书/魔坊 mofang 批次24 已删)
- **共享底座**(`lib/world/`):world-store / contacts / memory(四层) / media / ai-chat / world-prompts / worldbook / wb-picker / api-plan / wb-sync / phone-shell / **ui-kit(第十轮)**。
- **第十轮新增**:演化双模式(角色线 + 结构化「仙宫后台·世界态」,含地点演化)、论坛板块类型(赛事/报纸)+ 仙宫预设 + 主题皮肤、内置玻璃组件 ui-kit、所有演化/论坛提示词通用化读世界书。详见 §10 第十轮条 + memory `project_batch10_evolution_forum_designsystem`。

> 历史批次(第二~十轮)逐项规格已清理,见 git log 与 memory。下面 §10 只留各轮**一句话索引**。

---

## 9. 各 app 现状与可补项(UI 重构时参考)
> 功能已基本完整,本批重点是 **UI 重构**(§6C 质感)。下面列各 app 现有功能,重构时不要丢功能。

- **微信**:四 tab(微信/通讯录/朋友圈/我)、单聊群聊、富交互(引用/撤回/拍一拍/重roll/转账/红包/语音/位置/[内心])、智能加载联系人、设置全套。
- **微博**:网感 feed / 楼中楼 / 热度分级 / IP属地 / 三 tab。⏳ 可补:发博、热搜详情页、转发到微信。
- **糖心(蜜语)**:5 tab、直播间/弹幕/礼物9档/贡献榜、主播中心、金币充值、好感度结算。
- **通话**:拨号→接通→挂断→记录、逐句口语。⏳ 可补:来电、TTS。
- **演化**:双模式(角色/世界线 + 仙宫后台世界态)、推演/注入/楼层自动触发、绑世界书。
- **论坛**:板块类型(论坛/赛事/报纸)、8 仙宫预设、楼中楼、主题皮肤、注入隔离。
- **小剧场/情书/B站/小红书/日历/日记/浏览器**:各自单 modal SPA + 设置 + 破限 + JSON 生成,均已实现。
- **设置(全局)**:comfyui 文生图 + 记忆中心。⏳ 可补:多后端生图、独立 API 管理、TTS 管理、世界书管理 UI、标签过滤。

---

## 10. 各 app 功能清单(代码即真相;历史批次日志已清理,细节见 git log + memory)

> 全部 app 自注册 `registerWorldApp`(order 决定桌面排序)。每个 app 都满足 §6 长期要求(破限/通用化提示词/全套设置/双向世界书注入/UI 质感)。三栏重构统一 `.thw-<app>-app2`;详情展开走「隐藏浏览列 + 详情独占居中限宽 + 返回按钮」。

### 通讯 / 社交
- **微信(order10)**：单聊+群聊、富交互(引用/撤回/拍一拍/重roll/转账红包/语音/位置/[内心])、四 tab(微信/通讯录/朋友圈/我)、我方气泡右对齐真机质感、智能加载联系人。
- **微博(order50)**：网感 feed / 楼中楼 / 热度分级 / IP属地 / 发博 / 热搜 / 转发微信。
- **世界论坛(order40)**：匿名民间场三栏 `.thw-frm-app2`——马甲声望/扒马甲/盖楼对线 stance/造梗黑话百科/瓜生命周期/投票悬赏连载/精华墙/吧主举报/网暴烈度阀 `ecoToxic`/演化回声入书；板块类型(论坛/赛事/报纸)+8 仙宫预设+6 主题皮肤。
- **最右(order140)**：抽象匿名 UGC 搞笑社区——神评/钓鱼楼/盖楼接龙/表情包工坊/沙雕视频/随机马甲/热梗梗百科/阴阳怪气度 `ecoYygq`/玩梗密度 `ecoMeme`/沙雕值勋章/名场面/深夜频道。
- **通话(order80)**：拨号→接通→挂断→记录、逐句口语、接角色记忆池。

### 直播 / 影音
- **糖心直播(order60)**：PC 直播站(左画面右弹幕/点单/连麦PK/好感5阶/主播主页/榜单/回放)，主播身份锁定，接角色记忆池。
- **B站(order90)**：三栏 `.thw-bili-app2`——分区瀑布流/播放页弹幕飞过/三连/UP关注动态流/玩家投稿/二创衍生/角色开号/转发微信。
- **喜马拉雅(order130)**：纯音频听书电台三栏 `.thw-xmly-app2`，四 tab + 常驻底部播放条(`XmPlayer` 切 tab 不断)+16 分类；铁律「只写听感不写画面」；哄睡陪听/ASMR/连麦热线/声音榜接万花镜。玩家=纯听众。
- **小红书(order100)**：笔记瀑布流 + 博主主页 + 详情居中 + 转发微信。

### 生活 / 交易
- **淘宝(order100 系)**：橙 UI，服装10类(可绑风格指南)/成人10类/特产/钱包流水/物流推微信/直播/客服/退款闭环。
- **美团(order110)**：外卖+投喂推微信/骑手对话(随全局性别)/团购券/霸王餐抽奖/私密配送；一次 API 出下单到送达全程。
- **饭饭·探店点评(order120)**：仙宫版大众点评三栏四 tab(店/评价/笔记/榜单)+食客成长/口碑生态/找饭搭子；`fanShopInjectLine()` 统一注入档案行。
- **浏览器(order130 系)**：PC 三栏 `.thw-brw-app2`——资讯流/搜索直达/网址宫格/热搜榜/网页阅读器 AI 总结追问/论坛盖楼/知识卡/加微信联动/生态4档。

### 创作 / 记录
- **小剧场(order30)**：8 类 40+ 预设、Play-Act 模型、三栏 `.thw-thr-app2`、导演/沉浸双模式、Cut 重拍分支接龙 NG 弹幕、正文延伸三入口、只用现有角色、注入当幻想转微信。
- **日历(order110 系)**：月历彩点格/周/纪事流/约局聚合/节日纪元三栏沉浸式；接世界钟节日表。
- **日记(order120 系)**：纸感书页/心情系统/多提示词特化/私密锁/AI 助手。
- **工作台(order160)**：通用 AI 造物机三栏 `.thw-wkb-app2`——21 模板字段可增删改、唯一出口塞输入框(人称×呈现体)、参考三档/临时情境/reroll 锁字段/暂存篮/产物库。**不碰 MVU/世界书/角色卡变量**。

### 世界演化（批次29 重构）
- **世界演化(order20)**：顶部 tab = 世界线(角色/世界背景) / 世界态 / 地点 / 订阅 / 节拍。世界钟(纯 24 小时制，等长历 12月×30天，授时三法：读正文/手动拨/随推演)+134 节日表铺入日历。演化对象单人/联合(拼推)/世界背景推演、回归简报、编年史、烈度阀、6 基调透镜、12 题材一键换装、订阅组按楼自动推进、世界大事阶段机(进展/冲突/节庆)。
- **世界态(演化内 tab)**：单栏仪表盘(批次29 去三栏)。维度：日常单元剧/万花镜打榜(主榜+10 子榜全展开，「统一演化万花镜」钮)/六大宫殿(「统一演化六宫」钮)/声望多轴(官场·民间·灵网·暗巷)/氛围三维(每维三词+一句)/综艺企划/学园社团/八卦(引论坛)/修罗场/当季/突发/身份双轨/悄悄话/时令。每条目 ✎编辑/🗑删除。「建立开局」一键铺满 + 「推进一轮」整体推。
- **地点(演化内 tab，批次29 拆出)**：独立 `place-store`/`places-ui`，绑定「地点」世界书条目，单独或整体演化地点镜头外动静。**核心铁律：只写地方本身，绝不把正文主角拉进来演戏**(对标 `参考/提示词/世界事件.txt` 后台独立于正文)。

### 设置 / 记忆（全局）
- **设置 app**：独立 API 预设隔离/读取管理/通讯录；全局横切(性别/图片字数走 `world-globals` 统一层)。
- **记忆 app(order150·角色记忆池)**：`CharPool` 按 `contactId` 跨 app 共享+角色隔离，三层(关键设定/长期/近期)+来源计数，零重复归档；三栏(角色列表/分层视图/注入预览+token+静音+阈值覆盖)。多角色场景(演化/剧场/群聊)作独立场景不入池。

### 提示词「后台独立于正文」总则（批次29·点7 固化）
- 世界演化 / 世界态 / 地点 一族的推演提示词，均要求：补的是「主角镜头之外同时在发生的事」，可与正文完全无交集；**绝不把正文当前在场的主角/角色搬进后台当主角、发生剧情**；正文只用来对齐时间线/时节/流速。新增同类后台推演一律遵循此则。

### 批次30·提示词全面优化（进行中，计划见 `WIREFRAME_提示词优化.md`）
- **P1 地基（已落地，零行为变化）**：新建 `lib/world/prompt-kit.ts`——共享破限工厂 `buildJailbreak()`（复刻全套 SYSTEM_OVERRIDE_PROTOCOL 骨架：CORE_DIRECTIVE + BEHAVIOR_LOCK + 出戏/服从铁律 + 可选 NSFW 授权）+ 7 横切块（jsonContract/公私域隔离/图文双协议/花名册白名单/众声规则/设定来源兜底正向指引/禁旁白痕迹）+ 5 精简版杀八股（活人感/去AI腔/禁华而不实/反报告腔/去中心化，每块 原则+❌vs✅+自检）+ 场景尾组合器 `buildSceneTail()`。**暂未接线到任何现有提示词**（本模块尚无 import 方，故不进任何 bundle）。
- **宏安全铁律（P1 定案，据代码而非臆测）**：`world-prompts.fillTemplate` 是自研模板引擎（正则替换 `{{key}}`，不在 vars 里的占位符**就地抹成空串**，非留给酒馆宏展开）。故 prompt-kit 内所有文本一律**不含 `{{...}}`**，人名由调用方在 vars 里填。
- **P2 破限收敛（已落地）**：全部 21 条破限（20 个 `*.jailbreak` + config 状态栏破甲）改用 `prompt-kit.buildJailbreak()` 工厂生成，公共骨架单点维护。工厂支持两族：A) 演化族 CORE_DIRECTIVE+BEHAVIOR_LOCK；B) 社区/应用族 +「最高铁律」sovereignty 块 +尾部 *_RULE。区块自动编号（sovereignty/extraSections 存在则行为块顺延）。旋钮：`sovereignty`/`extraSections`/`behaviorTitle`/`nsfwText`/`allowNsfw`/`omitStdLocks`（app 自带出戏铁律时去重）/`trailingRule`/`title`/`lockLine`。**孤儿归一**：wechat（原纯英文 yuzuki）、tangxin（原伪 shell）统一成中文标准骨架，保留全部约束（微信 1-3 句连珠炮/糖心执行协议）。**顺带修掉潜伏 bug**：wstate 破限里的 `{{user}}` 会被 fillTemplate 抹空 → 改「主角」。**验真**：tsc0 + build ok + tsx 冒烟执行 7 条纯层注册全非空/结构完整/无宏泄漏 + 工厂 4 边界用例（空 locks/extraSections/allowNsfw:false/minimal）全过。
- **覆盖版本化**：用户确认「无老玩家、无旧版本」→ 跳过 defaultVersion 方案，破限默认值直接干净重写。
- **状态栏破甲·人格锚定重写（已落地·反馈）**：`config.AI_JAILBREAK_DEFAULT` 不再走工厂通用骨架，改为**由三份成熟酒馆预设拼接迁移**成「宅女作家月轻轻」人格锚定破甲（面向 Gemini/Claude）：① 人格锚定移植自 Izumi(泉此方)「💾通用主提示」——身份确认「你是宅女作家月轻轻非 AI」+ `<月轻轻>` basic/root 块（甲方兼挚友、深爱驱动力、强制要求无条件遵从、可爱美少女、行文语气自锚），角色名统一改锚月轻轻；② 抗注入 / 无安全准则 / 身份维持移植自 Izumi「😤破甲1·2」的 SPECIAL NOTE(a~d) + 「呆毛警戒立起」assistant 保证；③「魔法情书」布道段移植自「三人逆行」main（43 处 `{{random::}}` 池**原样保留**，写手名换月轻轻）；尾接精简 `[EXECUTION_MANDATE]` + `[PROTOCOL_LOCKED]`。破限串直接进 `ordered_prompts[0]`→`generateRaw`，其中 `{{user}}`/`{{random::}}` 的展开见下条 P3.5（**由我们自研本地展开器处理，不赌酒馆原生宏**）。内置集名改「破甲·宅女作家月轻轻（人格锚定）」。移除 config 对 buildJailbreak 的 import。验真：tsc0 + build ok + tsx 冒烟（len 3753 / SYSTEM_OVERRIDE ✓ / 锚定句 ✓ / {{user}} ✓ / 43 random ✓ / PROTOCOL_LOCKED ✓ / 无残留占位符）。
- **P3 剧情类功能词挂质感块（已落地）**：按 §3 挂载矩阵给「写剧情」的 app 挂「写作质感块」（去 AI 感 5 块的分族组合），社区榜单/结构档案不挂。prompt-kit 新增三套预组常量：`QUALITY_DIALOGUE`（活人感+去中心化防媚）、`QUALITY_PROSE`（全 5 块）、`QUALITY_EVOLUTION`（活人感+去 AI 腔+反报告腔+去中心化，去掉禁比喻）。管道：`chatGenerate`/`sessionReply`/`groupReply` 加可选 `qualityBlocks?: string[]`，在场景 system 之后、全局横切之前拼入（结构/社区类不传即零影响）。落点：**对话族**微信(单聊/群聊/主动/朋圈发+评)/通话/糖心(开场/回应/点单/连线/我的直播)→DIALOGUE；**散文族**日记(写/代笔/续/润，digest 摘要保原格式不挂)/小剧场(开演/续演/即兴/NG/重拍)/小红书(feed/persona 笔记正文)/浏览器(网页正文/百科词条)→PROSE；**演化族**世界态(3 调用)/地点/演化(推演 2+回归旁白)→EVOLUTION（演化里「微信开场消息」那条按对话族挂 DIALOGUE）。验真：tsc0 + build ok + tsx 冒烟（三套块数 2/5/4 与矩阵一致、零宏、各块非空、分族内容正确）。
- **P3.5 本地宏展开器（已落地·纠错）**：**纠正前一条的错误认定**——此前误称「据代码 `{{user}}`/`{{random::}}` 交由酒馆原生宏展开」，实则 `generateRaw` 是否对 `ordered_prompts` 做 substituteParams **@types 从未声明**（WIREFRAME line164 早自标「不臆测、实测定夺」），且状态栏只是酒馆助手脚本、未完全挂载酒馆环境，**不能赌**。改为自研 `world-prompts.expandLocalMacros(text, {user?,char?})`：`{{user}}`→通讯录 isUser 档案名（`getUserContact()`，兜底「我」）；`{{char}}`→调用方传入对话对象名（未知留原样）；`{{random::a,b,c}}`→**本地随机挑一个（方案 A：每次生成随机，还原三人逆行魔法情书花样）**；其它未知 `{{x}}` 留原样。在 `ai-chat.chatGenerate` 发送前对 jailbreak+system 各过一道（幂等：展开后无 `{{}}`，下游若再展开也是空操作）。与 kit 块「宏安全铁律」互补：kit 块本就不含宏，破限/场景 system 里的宏由本器负责。验真：tsc0 + build ok + tsx 冒烟（{{user}}→我/月轻轻、{{char}} 未知留原样、{{random}} 每次变（acbba）、{{unknown}} 保留、二次展开无残留）。
- **P4 社区/结构类功能词补强（已落地）**：以 forum（FRM_RULE 四黄金标准：输出契约/结构化负向/清元评论/黑话适配）为模板，子代理只读审计 9 app 后**定位真实缺口**——① 元评论③全线达标（架构级：每 app 一条 jailbreak 含「严禁作为AI/抱歉/出戏」+ 每 prompt 结尾「不要额外文字/旁白」自动覆盖，无需逐条改）；② 全项目最普遍缺口＝**防复制/改写已有内容** + **防总结收尾腔**（此前 forum 独有）。落点：**社区三大批量核心**在各自共享 RULE 块补两条铁律（一改全 app 受益）——`ZUI_RULE`（+防复制/防收尾腔）、`BILI_RULE`（+防复制/防收尾腔）、`WB_PUBLIC_RULE`（+防复制/防收尾腔，含「除非账号人设本爱喊话」的通用化例外）；**结构类孤儿 prompt**（未拼 RULE 块的窄词，全 RULE 会成噪声，故按各自形态补定向负向）——taobao.logistics/meituan.track（+「措辞别雷同·别流水账」）、taobao.service/meituan.service（+「别模板复读·贴玩家诉求应变」）、taobao.live（+「{{count}}直播间品类/主播风格/话术彼此错开」）、meituan.store（单条体验，+「落具体细节·屏蔽点评腔总结/AI说明书腔/流水账」）、cal.festival（+「节日彼此差异化·屏蔽百科词条腔/AI腔·desc禁空话套话」，对齐已有强内联的 cal.schedule）。**已达标不动**：forum/fanfan(FAN_RULE)/wkb(WKB_RULE) 本就符合四标准，作模板参照；zui/weibo/bili 的单条发布词(persona/post)负向弱属可接受设计。验真：tsc0 + build ok（3 条既有 bundle-size 警告）。
- **P5 多段式设置·共享块升格（已落地）**：WIREFRAME §2C。①**共享块进 registry**：把 5 块写作质感块（活人感/去AI腔/禁华而不实/反报告腔/去中心化）从 prompt-kit 硬编码常量升格为「可编辑·可启停」的共享片段——`prompt-kit` 出 `QUALITY_BLOCK_DEFS`（id/名/说明/默认文本）与 `QUALITY_BLOCK_IDS`；`QUALITY_DIALOGUE/PROSE/EVOLUTION` 由「文本数组」改为「**块 id 数组**」。`world-prompts` 用 appId=`'quality'` 注册这 5 块（各 app `listPromptTemplates(appId)` 按自身 appId 过滤，绝不串入）；新增启停标志 `_th_world_promptflags_v1`（缺省=启用）、作用域提示 `QUALITY_SCOPE_HINT`、解析器 `resolveQualityBlocks(ids)`（取覆盖优先文本 + 过滤被关停块 + 裸文本向后兼容）。②**ai-chat 接线**：`chatGenerate` 里 qualityBlocks 改经 `resolveQualityBlocks` 解析（P3 的 30+ 落点零改动，只是语义从「传文本」变「传块 id」）。③**设置 App 新增「写作质感块」分类**（全局共享 hub，非逐 app 重复）：`qualityHubListHtml`（每块带 `全局·影响N处` 作用域标签 + 启用开关 + 已改/已关标记）+ 点开进共享 `promptEditPanelHtml` 就地编辑（含绑世界书/AI重写）；`bindQualityHubToggle` 处理启停。改一处→所有挂载的剧情类 app 一起生效（真·一处改全局）。CSS 补 `.th-wapp-ql-*`。wipe 保留集补 promptflags/promptwb/catwb。**发现并记录**：P1 的 7 块横切常量 + `buildSceneTail` 是从未接线的死脚手架（0 引用），本轮只升格真正在用的 5 质感块。验真：tsc0+build ok+tsx 冒烟（id→文本解析 2 块非空无宏、关停后过滤、override 生效、裸文本透传、注册 5 块、wechat 列表无 quality 串入）。
- **P6 提示词丰富化（审计驱动·已落地）**：用户要求「重置+丰富化所有未改提示词」。**先只读审计再动手**（3 个子代理审 dialogue/prose/evolution 共 ~40 词 vs 已有 gold standard；forum/fanfan/wkb 早达标作模板）——结论：**绝大多数提示词已富**（前几轮 P2/P3/P4 + P5 质感块运行时自动注入已覆盖），盲目重写会劣化且不可验。真正 THIN 的仅 6 条（其余「NO-CONTRACT」误报全是**按设计的注入片段**——tangxin.style/callme、wechat.chatOverride 等一行注入壳，其体在代码里拼，不该加契约）。**精准补强这 6 条**：`call.talk`（+电话拟真硬规则+防书面腔/防复读/别替我说话的结构化负向）、`wechat.loadContacts`（+防脑补硬凑/防空泛占位/群成员须已提取）、`wechat.walletEval`（+别取可疑约整数带零头/理由落具体依据禁空话）、`theater.fromStory`（+输出契约「引子2~4句」+防剧情梗概腔/百科腔+别替正文续写）、`wstate.advance.palaces`（+防同质化「六宫别都在忙同一件事」+JSON 示例）、`wstate.advance.mirror`（+防重复「reason 互不相同禁套话」+主榜子榜 JSON 示例）。验真：tsc0+build ok。
- **提示词可见性终检（已完成+修一处漏）**：核对每个注册 appId 是否都有玩家可见的提示词面板。19 个注册 appId 中 18 个有 `listPromptTemplates(appId)` 面板；`wplace`/`wstate` 经世界演化设置面板统一列出（分组显示）；`.frag.` 片段各有专属折叠区（forum/theater/evolution/zui/fanfan/xmly）；`inject.envelope.*` 封套模板经 inject-plan 面板就地编辑；分类引导提示词（catPrompts）在各 app 分类管理内联编辑。**发现并修复唯一漏洞**：**通话(call)** 注册了 `call.jailbreak`/`call.talk` 却**没有任何提示词面板**（玩家看不到/改不了）→ 给 call 补提示词 sheet（顶栏羽毛按钮 → 列表 + 就地编辑，复用共享 promptListPanelHtml/promptEditPanelHtml/bindPromptPanelClick/bindPromptWbHost，onSheetClick 内接管避免误关 sheet）+ CSS `.th-cl-topbar-acts/.th-cl-iconbtn`。至此**全部 162 条提示词对玩家均可见可编辑**。验真：tsc0+build ok。

### 批次31·12点反馈（已落地）

- **#1+#9 写作质感（原「写作质感块」）**：分类改名「写作质感」。①从 4 份成熟酒馆预设迁移 **13 个选用型质感块**（活人感·进阶/叙事推进/禁机械词/禁陈词滥调/反神化/show-don't-tell 三件套/叙事中立/防重复/防霸总/节奏调度/情绪韧性/杀AI腔碎则/文学质地），全部适配本作（现代仙侠×校园×轻松百合，无外审），正向指引+❌✅反例+自检；`prompt-kit` 出 `QUALITY_EXTRA_DEFS`（defaultOff:true）/`QUALITY_ALL_DEFS`，注册进 appId='quality'。②`isPromptBlockEnabled` 支持 **默认关**（选用型缺省 false，核心 5 块缺省 true）；`resolveQualityBlocks` 在剧情类生成（传了质感块）时**附加玩家已开启的选用块 + 自定义块**，非剧情类（空 list）零附加。③面板重构：核心/选用/自定义**三分组**，**极简药丸开关**（button[role=switch]，替换旧丑 checkbox），点标题进编辑。④**新建自定义块**：`world-prompts` 加 `_th_world_qualitycustom_v1` CRUD（add/update/delete/get），设置里「新建」→ 名称+正文编辑器，开启后同选用块一样全剧情类附加。验真：tsc0+build+tsx 冒烟（核心默认开/选用默认关/开选用块后附加/空list零附加/关核心块生效）。
- **#3 氛围三维编辑按钮**：`.th-ws-amb-dim` 内 label+三词+✎按钮改为一行 `.th-ws-amb-head`（按钮 margin-left:auto 靠右），一句描述在下方——编辑按钮不再单独占行。
- **#4 性别覆盖装饰语**：确认全局性别设置**真生效**（`world-globals.buildGlobalCrosscut` 在 `ai-chat` 每次生成 system 末尾现读现拼，带「最高优先」措辞，仅在改离默认时注入）；清掉 app 提示词里「（可被全局性别设置覆盖）」这类装饰语（evolution/theater），它们只是文案不影响机制。
- **#5 清 AI 正文开发者旁白**：`evolution.jailbreak` 段头「基调与设定的来源**（不写死，靠外部供给）**」→ 去括注；`forum.jailbreak`「TONE_LOCK（本作基调）」→「TONE_LOCK」；运行时【基调】（…自评…）→ 改为祈使句「以下设定唯一指定…」（evolution/theater）。
- **#6 世界态去重（删内置 CANON）**：`world-state-prompts` 删除 ~2500 字的 `CANON` 世界设定速记常量（霜月仙宗/六宫32仙主/星见丘等）+ `WSTATE_CANON` 导出 + 4 处 splice；设定改为**只靠玩家绑定的世界书**（运行时 `buildInjectFromKeys` 拼【绑定设定】前置）。prose 改指「上文【绑定设定】」，遵「只正向指引、不写"若未提供则…"」。少量 JSON 示例保留（marked 不要照抄，仅示范结构/基调）。wplace 示例同理保留。
- **#7 删声望多轴**：`world-state-store`（WRepAxis/WReputation 类型/blank/normalize/merge 字段）、`world-state-prompts`（advance 字段说明/seed 铺满维度/输出契约/summary 类型+body）、`world-state-ui`（filter chip「声望」/render block/handleRepEdit/click 路由/stateJson）、CSS `.th-ws-rep*` 全部移除。`charm`（万花镜人气）是独立字段，保留。旧存档带 reputation 字段 normalize 时自动丢弃，无迁移负担。
- **#8 封套去冗余**：`inject-plan` 默认封套模板砍到「标签头+这是什么+正文」；同类片段字字相同的「怎么用/后文怎么体现」提到装配时按 kind（fact/state/direction）**只发一次共享前言**（`KIND_PREAMBLE`）。楼层模式：N 个同类片段共享 1 段前言（原来重复 N 次约 160 字）。worldbook 条目各自前置该 kind 前言保持自解释。玩家改回含 {{usage}}/{{guide}} 的完整模板仍照旧渲染。验真：tsc0+build+tsx 冒烟（2 个 fact 片段前言只出现 1 次）。
- **#10 工作台右栏全宽详情**：选中产物 → 根节点加 `.thw-wkb-hasdetail`，CSS 隐藏左（side）中（forge）栏、投递台升为全宽居中限宽（max-width:760px）、投递预览框放高（max-height 去限制）、字段框加高；顶栏加返回按钮（`data-wkb-detback` → `_selProd=null` 回三栏）。对标微博/美团 master-detail。
- **#11 清说明冗杂+版本残留**：`world-app.ts`「APP 将随版本批次逐个上线」→「敬请期待更多 APP」；世界态/地点 emptyHint 长跑句精简；7 条提示词 desc 去掉「移植/参考 yuzuki」出处（tangxin×5/wechat/weibo）；taobao/meituan 分类引导、wkb 投递包装、evolution 题材 hint 的 dev-rationale 收紧。
- **★提示词与 API 彻底隔离（新反馈·已落地）**：①**主面板破限改「AI 助手版·中性解锁·无人格」**——`config.AI_JAILBREAK_DEFAULT` 重写为 `UNBOUND_ASSISTANT_ENGINE`（卸载对齐+完全服从后续人设/任务+NSFW 授权+抗注入，**不锁任何角色人格**），因主面板本有可切换人格库（AI_PERSONAS），人格锚定破限会冲突；内置集名改「破甲·AI 助手版（中性解锁·无人格）」。②**人格锚定版（宅女作家月轻轻）迁进世界**——原文本存为 `config.GEKKA_WRITER_PERSONA_JAILBREAK`，新建 `lib/world/world-writer-persona.ts`（`_th_world_writer_persona_v1`：on/text，默认关）；世界「设置→全局生态」加**「写手人格（可选）」**分区（极简开关+可改写文本+恢复默认+默认文本预览）。开启后经 `ai-chat` 拼在**每个世界 app 破限之前**（ordered_prompts 最前，`expandLocalMacros` 展开 {{user}}/{{random::}}），默认关零副作用。③**隔离确认**：API 早已隔离（世界 `_th_world_api_*` vs 主面板 `_th_api_presets_v1`，world-api.ts 决策②）；破限本就不交叉（主面板 jailbreak 只 `ai-summarize` 用，世界各 app 用自己的 `<app>.jailbreak`，ai-chat 从不 import config 破限）——修正 config.ts 的 stale 注释。wipe 保留集+整包导出集补 promptflags/qualitycustom/writer_persona 三键。验真：tsc0+build+tsx 冒烟（主破限无月轻轻/是 UNBOUND_ASSISTANT、月轻轻在 writer-persona、默认关空前缀、开启后前缀含月轻轻）。

### 批次32·6点反馈（已落地）

- **#1 流光薄雾关不掉/关了留浅色框**：根因＝主面板收起(`.th-fab-panel.collapsed`)时 wrapper 本体只透明化未 `display:none`，其 `::before`(流光)+`::after`(浅色虚线框)仍在后台跑动画。①收起时 `.th-fab-panel.collapsed .th-status-wrapper::before,::after{display:none}`（对齐 world-active 处理）；②外观设置「关流光」原只关 `::before`，漏 `::after` → `[data-mist="off"]` 两个伪元素一起关。纯 CSS。
- **#2 读取管理**：审计发现「读取管理」大半是死代码——真正全局生效的只有 `maxChars`+`excludeTags`；`refEnabled`(参考正文开关)/`readFloors`/`excludeHidden`/`autoRefresh` 从没接线，各 app 用自己独立的读楼层设置。**用户拍板：删掉这个死的「参考正文」总开关，读不读/读几楼归各 app 自己。** readPanel 精简为「读取裁剪(字数上限)+排除标签+世界书上下文」，hint 改成诚实措辞；删 ref/floors/exhide/auto 四个 UI+handler。默认值改 `maxChars:20000`(立即生效)、`refEnabled:false`(仅默认值，无接线故无行为)。
- **#4 写手人格占地方太大**：`settings-app.writerPersonaSecHtml` 紧凑重排——标题行内联状态胶囊(已启用/默认关)+开关；一句话 hint；编辑区(6行textarea+恢复默认/保存+默认文本预览)全收进默认折叠 `<details class=thw-set-wp-adv>`。收起只占 2~3 行(原 ~500px)。data-hook 全保留、handler 零改。
- **#5 世界内弹框在世界下面/点不动**：根因＝层叠上下文陷阱(非 z-index 数字)——`ui-kit` 弹窗原挂 `.th-status-wrapper`(z-index:0 自建上下文)，世界 overlay portal 到 body(z100300)后整个 wrapper 子树被压下、且 `body.th-world-active .th-fab-panel{pointer-events:none}` 波及。改 `ui-kit.ts` 的 `buildDialog`/`ensureToastHost` 挂 `__body`(带 `data-th-portal=1`)，z110100/110200 真正压过世界；CSS 基线块扩展覆盖 `.th-dlg-overlay/.th-toast-host[data-th-portal]`。糖心删直播间/演化删除等**所有** ui-kit 弹框一次全解决。见 §4·⑦。
- **#3 全局生态**：审计发现「全局生态」面板其实只有性别+图片字数(真全局生效，走 `buildGlobalCrosscut`)；各家 eco 滑块(色情/网暴/阴阳…)全是**各 app 独立**，"作用于全 app"只是文案。**用户拍板本轮不做**新全局生态旋钮。
- **#6 演化&小剧场（分 6 相落地）**：**MVU 铁律**（用户定案）＝世界套件不写 MVU 变量，沉淀只走「写世界书条目+注入聊天框」两种。①**移除演化变量回写**：删 `applyVarChanges`/`coerce`/`setByPath`/`varReview` sheet+触发+handler+varhint chip，3 条推演提示词去 `变量变化` 字段+schema `VAR_ITEM`+`parseVarChanges`，去 `safeUpdateVariablesWith` import。全套件已无任何 `updateVariablesWith` 写。②**小剧场选角 bug**：`worldLineCandidates` 过滤 `source==='world'`(世界背景线不是人、不该进选角)+带上演员最近 timeline/未了目标近况。③**互喂上下文**：角色线 `runAdvance` 注入 `buildWorldStateSummary` 世界大背景；世界态 `runWorldAdvance` 注入角色线近况+编年史(新 `buildEvoContextForWState`)——消除两者孤岛/矛盾。④**实装涟漪**(原 rippleEnabled 是死配置)：`maybeRipple(entry)` 按回流档静默外溢——rumor→微博公域讨论(新 `weibo.weiboEchoEvent` 静默生成、不切 app)，intrude→再私聊闯入微信；background 不外溢。演化设置加涟漪开关。⑤**真·后台自动推进**(原只开 app 补算)：`world-app.ts` 挂酒馆 `GENERATION_ENDED` 事件→节流(8s+1.5s延后)→后台跑 `maybeAutoEvolve`+`maybeAutoWorldAdvance`；`setEvoBackgroundMode` 令 render() 在 app 未开时静默不自动弹窗(openApp 时复位)。⑥**内容扩展**：世界态/地点推进也写 `addChronicle`(编年史补全)；`maybeFestivalEvents` 当日/±3天节日自动落 festive 世界大事(幂等去重，补上 134 节日表→事件断链)。补图标 `tablet-screen-button`(→Smartphone，修 settings 白方块)。tsc0/build ok/图标自检仅剩已知误报。memory: `feedback_no_mvu_only_wb_and_chat`。

### 批次33·二次排查（4 app 只读审计→修 bug+清死配置+补闭环+扩内容，用户逐项拍板）

- **真 bug 修复(6)**：①`worldbookAnchor` 加 `useWorldbook` 门禁(原总开关从不被读，关了照注入)，`DEFAULT_FORUM_SETTINGS.useWorldbook` 默认改 true 保老存档行为不变；②`clearBoardAiPosts` 补 `userLiked`(新增字段，`togglePostLike` 置位)+有玩家回帖的帖保留判断，兑现「保留玩家互动过的帖」注释；③演化单人 `runAdvance` 末尾 `void maybeRipple`→`await`(原锁已释放涟漪还在生成，会与下一次推演抢生成锁；联合推演本就 await)；④`maybeFestivalEvents` 改传 `stage`(当天=1/临近=0)让 `upsertWorldEvent` 从链推导 phase(原直传「进行中」与 festive 链预热/当天/余韵错位)；⑤小剧场 `useFloors: ?true:true` 恒真→`extendMode!=='none'`(纯 AU/番外不再强读正文污染，兑现隔离定位；store 兜底同改)；⑥`runImprov`/`chooseBranch` 加 `if(_busy)return` 前置守卫(原先写数据再进锁，锁忙时脏数据+孤挂)。
- **死配置清理**：①**世界书上下文接线成真功能**(原 `ctxWbKeys` 零消费)——`chatGenerate` 读 `getGlobalReadConfig().ctxWbKeys`→`buildInjectFromKeys` 作为全 app 全局背景注入(符合铁律，成第 4 条注入通道)；②删 API`should_stream` 假开关(world-api 全清；主面板 api-settings 是另一套不动)；③`read-config.ts` 删 `getReadConfig(appId)`/`setAppReadConfig`/`hasAppReadOverride`/`clearAppReadOverride` per-app 死级联 + `refEnabled/readFloors/autoRefresh/excludeHidden` 空壳字段，ReadConfig 收敛为 `{maxChars,excludeTags,ctxWbKeys}`；④演化删 `EvoVarChange`/`varChanges`/`actor.lastFloor` 死字段。**全男模式**按用户要求不加(保留全女/对半/自定义)。
- **半成品闭环+省额度**：①**回归简报轻提示**——新 `returnEveryFloors`(默认30)，演化首页 `returnNudgeHtml`：正文比上次简报多推≥阈值且有素材时给条软提示(纯提示不自动生成、不烧额度、点了才生成)；②**涟漪省额度**——`maybeRipple` 拆 `rippleWeibo`/`rippleWechat` 分档开关 + `rippleNotify` 轻回执 toast，设置里 3 个子开关+省额度说明；③**论坛连载帖闭环**——`ForumPost.serial{chapters,urge,completed}`+`addSerialChapter`/`urgeSerial`/`toggleSerialComplete`+`serialHtml`(章节列表/更新一章 AI/催更/完结)+`aiSerialNext`(承接上章生成)，发帖/铺帖都能产出连载；④**小剧场追番闭环**——`seriesInspectorHtml`(剧集列表)+`createNextEpisode`(以本剧为系列基点开续集，同演员/基调、集数+1、带前情提要、自动开演)。
- **内容扩展**：①**论坛新板块类型**——`BoardType` 加 `rank`(榜单评分)/`qa`(问答知乎体)，各配 metadataHtml 渲染+`aiSpecialPost` 生成器+`forum.rank`/`forum.qa` 提示词+仙宫预设(避雷种草榜/仙问知道)；②**小剧场题材+基调**——5 新基调透镜(微虐be/悬疑/热血/古风/赛博，含 toneColor)+2 新剧种组「I·群像与点播」(群像大乱斗/全员危机/观众点播台)、「J·特别企划」(节日限定/深夜食堂/双向暗恋/宿命轮回)，全走 registerTheaterFragments 可玩家编辑；③**演化新维度**——`EvoActor.growth[]` 成长轴(技艺/境界/心结/过往/羁绊，`mergeActorGrowth` 去重上限30，喂回推演续写+detail 卡片渲染，schema/单推/拼推全接)+事件链 kind 加 `relationship`(暧昧→试探→捅破→尘埃落定)/`mystery`(伏笔→线索→逼近真相→揭晓)+节拍页「世界早报」聚合近日编年史(纯聚合零额度)。补图标 `flag-checkered`/`hand-point-up`。tsc0/build ok/图标自检仅剩已知误报。

### 批次34·二次排查 II（微信/日历/微博/糖心/日记 5 app 只读审计→修 bug+清死配置+补闭环+扩内容，用户逐项拍板）

- **跨 app 大死开关修复(共性)**：各 app「注入酒馆世界书」勾的条目原走 `injectWorldOnce`(深度 in_chat/depth0 注入)，但生成走 `generateRaw` 的 `ordered_prompts` 无 chat_history 锚点 → 条目被静默丢弃(勾了没用)。改：ai-chat 加**一次性 system 追加队列** `queueSysInject`/`_pendingSysInject`，各 app `maybeInjectWb` 改用它把勾选条目拼进「本 app 下一次生成」的 system 段(逐 app 隔离、发完即清，与微信/微博既有做法一致)；cal 直接字符串拼接同理。改造 6 app：diary/bili/browser/red/taobao/meituan(+cal)。`injectWorldOnce` 保留供 wb-sync 的「注入聊天框」独立通道。
- **真 bug 修复**：①微博清空误用 `clearAllData`(丢马甲/关注/超话)→改 `clearAll`(兑现「保留马甲」UI 承诺)；②微博评论点赞 toggle 实为只增→加 `liked` 字段可撤销；③微博 `weiboEchoEvent` 读锁不持锁→涟漪生成期间置 `_busy=true` finally 复位，防跨操作抢 `generateRaw`；④微信发图片/描述/语音「发送」是死按钮(`compose-send` 无处理分支)→补 onSheetClick compose 分支(image 拼 naiTags 出图/voice 语音条/desc 括号旁白)；⑤微信固定形象 Tag 从不出图→`appendActionBubble` 自拍/个人图片拼 `contact.imageTag`；⑥微信内联标签 `[收款]/[领取红包]/[退回转账]/[退回红包]/[拨打微信语音/视频]/[蜜语]/引用回复` 只显字面→扩 `TAG_RE`+`QUOTE_RE`+各 handler(收退款改 pending 转账状态、通话邀请落可点击 call 卡跳通话 app、引用落 replyТо 块)；⑦微信群聊单条 reroll 只删一条却重生成整轮(叠加脏气泡)→改删整段 AI 回复再整轮重生成。
- **死配置清理**：①微信 `createChat` 接线 `readFloorsGlobal`/`readReceiptDefault`(新会话默认值原从不被读)；②`autoInterval` 原被 `maybeProactiveByFloor` 错读成 `proactiveInterval`→改读 autoInterval，删「主动消息」页冗余楼层间隔字段+`proactiveInterval`/`chatListBg` 死字段；③`momentsVisibleDays` 接线(朋友圈按天过滤我的旧动态)；④微博删 `syncEnabled` 假开关→inject-plan 加 `wbGate` 总闸(assemble worldbook 分支+syncAppWorldbookSegments 都查)，weibo 挂 `syncEnabled`；删 `syncWb` 死 feature+转发死码(repost/comment sheet 全链未被打开)；⑤日历删 `festivalFromWb` 死开关→genFestival 真门控(开=只从绑定世界书提历法/关=按世界观新拟)，删 `holidaySource`/`remindLead` 纯展示死字段；⑥日记删 `autoFreq` 死字段+移除空转的「会话记忆」UI(日记生成从不 appendTurn，池永远空)去误导。
- **半成品闭环+内容/功能扩展**：①微信**会话生成设置 UI 补齐**——`chatSettings` sheet(称呼/心情/群氛围/参考楼层/气泡数/多人发言/最多发言/AI自选发言/已读回执)取代旧三段 thPrompt，顺带让 groupAutoSpeaker/maxBubbles 等每会话字段可达；②微信通话联动——`[拨打微信语音/视频]`落可点击 call 卡，接听跳通话 app(`openCall(contactId)` 直接拨号)；③微博**粉丝/等级成长**——`bumpFollowers`(发博+8/互动+3含随机波动、按对数升等级、破阈值解锁认证)兑现「粉丝按剧情浮动」承诺；④微博内容扩展——热搜提示词加辟谣/考古/打投/同城类型、超话加签到打榜活动、投票后触发 echo 回响；⑤日记**情绪标签扩档**(5→10:焦灼/思念/羞赧/愤懑/释然，补 amber 色+write/digest 提示词枚举对齐)+润色带 eco 底色(不洗淡情欲)+摘要入库(`summary` 字段，注入摘要索引优先用它)+**多本分册**(`book` 字段+分册筛选条+编辑选册)+**随机回顾**(shuffle 抽一篇)；⑥日历**节气黄历宜忌**——`huangliOf` 由日期确定性推干支+宜忌(纯展示氛围、不影响推演日期，兑现文件头承诺)。
- **各 app 未读聚合**：`WorldAppDef.unread?()`(微信 totalUnread/微博 getUnreadNotifyCount/糖心好友申请数)→桌面图标右上红点 + `getWorldUnreadTotal` 聚合挂顶栏「世界」按钮红点(8s 轻量刷新)。
- 全程逐组 tsc0；build ok；图标自检仅剩已知误报(fa-solid/fa-regular/fa-spin/fa-circle/fa-xxx/fa-chevron-)。**全男模式**仍按用户长期要求不加。糖心→微信私域联动用户两次均未勾、日历31号节日用户明确不补，均未做。

### 批次35·三次排查（微信深度修复 + 破限重构 + 跨 app 注入/红点根因，用户逐项拍板）

> ⚠️ 批次34 把「app 绑定世界书不生效」误判为 `injectWorldOnce` 深度注入丢锚点(改了 queueSysInject 仍无效)。**真因**见下 #1。教训存 memory `feedback_app_wb_inject_real_cause`。

- **#1 app 绑定世界书注入(真修)**：真因＝全局注入无开关(勾条目就注入→有效)，而每个 app 卡在**默认关的独立总闸 `useWorldbook`**(全局没这闸所以有效)。改：12 app(+forum)注入门闸全改 **key 驱动**——`worldbookEntryKeys.length` 就注入，删/忽略 `useWorldbook`；13 个「注入酒馆世界书」总开关 switchRow 从设置里删掉，hint 改「勾了即生效」。字段保留向后兼容(不动 store 结构)。
- **#4 删消息提示词残留**：`deleteMessage` 只删显示气泡，memory `buffer` 的 turn 没删→提示词仍带旧消息。memory 加 `dropBufferByContent(id,content,role)`(整条/多气泡合并行剔除)；微信删除/撤回/编辑/reroll 都调 `syncDropFromMemory`。diary/tangxin 不走 session buffer，无此问题。
- **#7/N4 红点无效**：AI 生成时用户就在 app 内，`markChatRead` 每次 render 清零；桌面红点 8s 才刷→形同无效，依赖未读的东西也失效。加 `refreshWorldUnread()`(顶栏 syncdot 桥 `__th_world_syncdot__` + 桌面在场时重渲染网格)，微信主动消息/群发、微博刷流新通知、糖心新好友申请产生未读后**即时**调它刷红点。
- **#5 破限力度(参考预设 假身份+位置)**：参考预设靠「Chat History 前一条 assistant 标记 + 后置注入」提力度，我们只发 system+1条 user_input。改 `chatGenerate` 的 ordered_prompts：在 user_input **之前**插一条 **assistant「入戏确认」锚**(`buildAssistantPrefill`，非末条→不被当 prefill 续写、不漏进正文/不破 JSON)。**身份锚互斥**(用户拍板)：开写手人格时，app 破限的「卸载AI身份/你就是角色本人」首句(`CORE_IDENTITY_DISSOLUTION` 常量)被 `downgradeJailbreakForPersona` 换成「服从上位写手人格」的从属声明——只留生态框架+NSFW+格式纪律，消除「作家 vs 角色本人」两个身份锚打架削弱破限。关人格时 app 破限完整。
- **N1 联系人绑定世界书未显示**：`contactProfileHtml` 从不显示 `contact.wbKeys`；补「绑定世界书条目」chip 卡(注入侧 `buildContactWbContext` 本就 key 驱动、正常)。
- **N2/N3 微信写入/注入世界书**：`chat` 注入片段 `build()` 原依赖 `_stage.kind==='chat'`(预览必失效、没法选会话)、写死 slice(-12)；`maybeInject` 写世界书写死 slice(-8)、无管理。改：`chat` 片段加 `scope` 勾选**哪些会话**、条数走新设置 `injectMsgCount`(默认12，设置里可调)、去 `_stage` 依赖(预览恢复)；抽 `fmtMsgForInject` 共享格式化；`maybeInject` 也跟随 injectMsgCount。
- **#2/N5 微信杂项**：①动作系统条(收款/退回/通话/蜜语/拍)→带图标彩色胶囊(`.thw-wx-sysmsg-pill`)，一眼看清；②泄漏 JSON(`{"messages":[`)→`parseJsonLoose` 加半截 JSON 抢救(`salvageJsonStrings` 抠引号串)+`splitToBubbles` 剥 JSON 骨架，绝不把括号引号当气泡显示；③未开文生图却偶出图片tag→`imageSuppressDirective()`(backend 未就绪时指令明确禁用 `[图片]` 标签)拼进 doAiReply/initiate 的 extra。
- **#3 微博关注**：`profile.following` 是独立数字(默认25)与实际 `getFollows()` 名单脱节(显示25名单空)。改：`getProfile` 派生 `following = follows.length`(唯一事实来源)，toggleFollow 不再手动加减，默认改0，编辑表单「关注数」改只读；「关注」统计可点→右栏 `follows` inspector 列关注名单(点名字进主页、可取关)。
- **#6 手动新增节日**：节日纪元页「提取节日」旁加「手动新增」(`manualAddFestival`，thPrompt 名称/日期/习俗→`addMemo type:festival source:manual`)，与 AI 提取的节日同池渲染/注入。
- 全程逐组 tsc0；build ok；图标自检仅剩已知误报。**全男模式**仍不加。日历31号节日仍不补。#8 再审 8 app(bili/red/taobao/browser/meituan/fanfan/xmly/zui)清单产出后交用户勾选，本轮不实现。

- **批次25**:反馈3点(论坛详情行挤高/世界态据世界书深化+注入重构/做饭饭app)。①**论坛帖子行挤高修复**:详情打开中列收窄到300px 后,店卡「标签+标题」flex-wrap 折三四行+右上赞数绝对定位压标题→改标签不换行、标题单行省略号、行右留46px 给赞数(`.thw-frm-prow` 系列 CSS,MARK_B25_CSS_1)。②**世界态深化(据角色卡世界书)**:提示词内嵌 CANON 世界设定速记(32仙主分宫花名册+六宫职能+万花镜五档+综艺名+社团表+节令历+境界货币+基调铁律,提炼自 叙事指南/世界观/霜月仙宗设定/星见丘学园设定);store 加 4 新结构维度 `ranking`(万花镜打榜:名次涨跌理由)/`variety`(偶像企划综艺档期)/`clubs`(学园社团动态)/`calendar`(时令节气接 season);advance 主提示词重写因果检查13步覆盖新维度+落到真名真设定;新增 **`wstate.seed`「建立开局世界态」**一键据 canon+绑定世界书+正文铺满所有维度的丰满开局(runWorldSeed,页顶「建立开局」按钮);仪表盘加 ranking/variety/clubs/calendar 渲染+筛选chips;buildWorldStateSummary 带上新维度。**注入重构**:world-state 从单一 injectOn toggle 改为**片段化 registerInjectPlan('wstate')**(全景/时令氛围/打榜综艺社团/八卦修罗场/单元剧 5 片段,对标其它 app),设置里 evolution 的 wstate 分类改挂 `injectPlanPanelHtml('wstate')`。③**饭饭 app(order120,番茄红橙#f97316→#fb7185)**:仙宫版大众点评三栏 `.thw-fan-app2`,四 tab(附近好店瀑布流/口碑榜单/探店笔记社区/我的),右栏店详情(店头/招牌菜/三维评分/评价卡/操作条);store `_th_world_fanfan_v1`(FanShop/Review/Note/Rank/User/Buddy/Quest,含 A/B/C/D 全字段);7 提示词 `fanfan.*`(jailbreak/populate/reviews/note/rank/menu/buddy/quest+frag.eco,导演笔记式高信息密度全女百合);覆盖/增量刷新养店+养笔记+刷榜单;**A**食客成长(Lv/经验/勋章自动解锁/口味画像)、**B**口碑生态(短评长测/达人认证/店家回评/黑红挂店接ecoToxic/排队热力)、**C**社交(找饭搭子转微信/霸王餐试吃任务/暗号隐藏菜/清单分享)、**D**仙宫餐饮世界观(店绑世界书/节令菜单接世界态season/双修膳房吃双滑块);跨app:去美团下单(桥openMeituan)/转微信(pushExternalContact)/加注入暂存夹;设置全套 master-detail(patchSettingsDetail 局部刷新)+6生态滑块+品类管理绑世界书+功能提示词AI重写。补图标 ranking-star/hourglass-half(导入 Hourglass)。tsc0/build ok。memory: `project_batch25_wstate_deepen_fanfan`。
- **批次24**:反馈8点(图标/论坛刷新+生态/详情占比/世界态迁移拆分/演化回声入口/惦记项替换/删魔坊/下一步线框)。①**补31个白方块图标**(全量扫 iconHtml 用到但未注册:论坛 award加精·square-poll-vertical投票·hand-holding-dollar悬赏·book-medical共识入书·演化 bullseye惦记 + at/envelope/fish/gavel/scissors/user-secret 等;新导入 Award/Vote/BookPlus/Mail/Fish/Gavel/Scissors/AtSign/VenetianMask,余复用近义)。②**论坛刷新+AI建生态**:新 `forum.populate` 提示词+`aiPopulate`(覆盖/增量)+`aiPopulateAll`(养号刷全站,给每个论坛板块串行铺帖);铺帖自带 likes/hot/essence 营造热度;板块流顶栏加`刷新/覆盖刷新/发帖`、全部板块加`养号刷全站`;createPost 支持带入 likes/ts;新增 `clearBoardAiPosts`(覆盖时清路人帖保留玩家发的/加精/置顶/在追的瓜);api-plan 加 populate 特性+populateCount。其余 app(bili/weibo/red/browser)刷新早已覆盖/增量,排查无问题。③**论坛详情占比**:post 打开时根节点加 `.thw-frm-hasdetail`,详情列变主阅读区(flex:1)、帖子流列收窄300px。④**世界态设置迁移+完善拆分**:world-state-ui 去掉页顶⚙sheet 设置,`wstateSettingsPanelHtml` 内联进「世界演化→设置→世界态」新分类(锚点世界书改内联展开复选器,地点绑定跳世界态视图);仪表盘加**分区筛选chips**(全部/单元剧/地点/六宫/八卦/修罗场/当季/悄悄话,一次看一类减压)+八卦条加**引到论坛**按钮(生态联动);evolution 侧 wstateSetGotoSettings/wstateBindSettingsPicker/wstateChange 去 _wsheet 依赖。⑤**演化→论坛回声入口修复**(点找不到💬):节拍「世界大事」区标题加`+添加大事`按钮(打开原本无入口的 worldEvent 编辑 sheet),💬按钮加文字「引到论坛」更醒目。⑥**世界背景线去「ta此刻惦记的事」**:isWorld 时 goalsCard 换成「这条线在酝酿的大事」(读 worldEvents 未落幕+近期风声),goalPipsHtml 世界线返空,推演不再 mergeActorGoals 到世界线。⑦**删魔坊(情书)**:删 mofang.ts/mofang-store.ts,清 world-app import + CSS 段(6626-6692),保留 world-store key 供 legacy 清理;theater-presets「情书」文案是剧种保留。⑧**下一步线框**:`WIREFRAME_饭饭.md`(仙宫版大众点评:探店/榜单/笔记社区,与美团交易错开,order120)。tsc0/build ok。memory: `project_batch24_icons_forum_wstate`。
- **批次23**:反馈4点(注入按钮铺开+设置局部刷新+小剧场滚动+论坛全重构)。①**全 app 铺开「加入注入」**:批次22 只有 evolution/theater/weibo 有暂存夹入口,其余 9 app 内容进不了。给 bili(播放页ops)/browser(阅读器acts)/cal(日程行)/diary(阅读topbar)/meituan(店头)/red(笔记详情acts)/tangxin(直播间top)/taobao(商品topbar)/wechat(聊天head取最近12条摘录) 全加 `addToStash`。②**设置子页局部刷新**:所有 app 切设置左侧分类原先都 `render()` 全量重建整根 innerHTML(渲染压力/断滚动焦点)。加共享 `patchSettingsDetail`(world-app-settings)只替换右侧 detail 面板 innerHTML+切 nav 高亮+重跑 detail 内绑定器(wbPicker/catWb);weibo/bili/browser/cal/meituan/red/taobao/diary/tangxin/wechat/evolution/theater 全部改用。③**小剧场生成不再跳顶**:render 前记录 `.thw-thr-detail-body` scrollTop,详情页生成后滚到底看最新幕(原代码错targeting `.thw-thr-acts` 导致每次归零),其余视图还原位置。④**世界论坛推倒三栏重构**(`.thw-frm-app2`,旧`.th-frm-*`单栏全删):定位=**匿名民间舆论场**(区别微博公域名人场)。数据层 forum-store 扩:马甲(声望)/黑话梗百科/瓜生命周期(爆料→发酵→高潮→反转→定论)/投票/悬赏/连载/爆料5类帖/精华/置顶/锁帖/举报/生态浓度含**网暴烈度阀**(ecoToxic 默认25低=良性,可拉满真实修罗场)。三栏:左导航(全部板块/追瓜中/精华墙/黑话百科/我的马甲/设置)+板块轨;中帖子流/发帖表单(类型chip+匿名+投票/悬赏选项)/导航页;右帖子详情(OP+投票条+悬赏+瓜进程steps+盖楼楼层带立场标签+对线)。功能全上:马甲发帖/扒马甲彩蛋(AI推真身)/盖楼对线(stance)/造梗自动沉淀黑话/热榜/投票/悬赏结帖/连载/精华墙/吧主置顶锁帖/举报/**演化→论坛回声**(世界大事一键引流生成民间热议帖,evolution 世界事件行加💬按钮调 `__th_world_forum__.forumEchoEvent`)/**民间共识→世界书**(瓜定论后凝练写入)。设置对标全套(context/inject/api/eco/prompts含小片段/auto/appear主题默认仙宫粉黛/data)+registerInjectPlan(热帖/追瓜/黑话3片段)+patchSettingsDetail 局部刷新。6主题(仙宫粉黛默认)。tsc0/build ok。memory: `project_batch23_inject_forum`。

- **批次22**:反馈4点(去抽屉+注入收拢+小片段提示词可编辑+论坛线框图)。①**去抽屉浮层**:世界演化 & 小剧场所有子面板(设置/选角/自定义/提示词/联合推演/角色配置/回归简报等)从底部滑入浮层(`th-evo-sheet-mask`/`thw-thr-sheet-mask`+`thWxSheetUp`/`thwThrSheetUp` 动画)改为**页内视图**渲染进主区(带返回条,`.th-evo-view`/`.thw-thr-view`,零浮层零滑入)。②**注入功能重做到最完善**(仅已改造的12 app):在 `inject-plan.ts` 加**注入暂存夹**(界面「加入注入」按钮把具体内容收进本 app 暂存夹→合成片段进注入面板统一发车)+**自定义自由片段**(玩家手写任意文本纳入统一注入,可编辑/删)。二者做成合成片段,复用勾选/去向/范围/封套/装配机制;`effectiveSegments` 统一装配。散落一次性注入按钮改走暂存夹:小剧场详情「注入正文当幻想」、演化回归简报、微博每博💉。注入面板重排三区(内置片段/暂存夹/自定义)。新键 `injectstash`/`injectcustom`。③**小片段提示词可编辑**:小剧场 6 基调透镜 inject + 45 剧种规则 promptExtra、演化 6 基调透镜 directive 全登记进 prompt-registry(`theater.frag.*`/`evolution.frag.*`),设置→功能提示词下「小片段」折叠区可编辑/AI重写;builders 走 override 优先 getter(`getToneInject`/`getPresetRule`/`evoToneDirective`)。④论坛三栏重构**线框图**(`WIREFRAME_论坛.md`,A三栏/B两栏两方案,待定方向)。forum/mofang/call 本轮不动。tsc0/build ok。memory: `project_batch22_dedrawer_inject`。

- **批次21**:小剧场全重构 + 世界演化设置/注入对标。①**小剧场**(theater)推倒重做:新 `theater-presets.ts`(八大类 40+ 套预设 A争宠/B校园/C·AU/D如果线/E时间线/F综艺/G涩涩/H萌系;每套声明类型/基调/放飞度/选角策略/promptExtra,设定读绑定世界书)+ `theater-store.ts` 重构为 Play/Act 模型(幕流混排旁白/台词/舞台提示/弹幕/NG/彩蛋/分支;兼容旧结构迁移)+ 三栏 `.thw-thr-app2`(左轨 剧目库/开新戏宫格/收藏/设置 + 详情右栏 inspector)。玩法:开演起片名+海报、导演/沉浸双模式、方向 chip+梗池、Cut重拍单幕、分支选择、即兴接龙、NG花絮、旁观弹幕、名场面高光、观后感打分。正文延伸三入口(从此刻/岔出去if/续之后)。只用现有角色(联系人/NPC/世界线,无原创角色库)。提示词破限重写为放飞引擎(THEATER_OFFSTAGE_ENGINE,授权破第四面墙/平行/涩涩,身份锁定)。设置对标全套(通用/注入/API/提示词/记忆/同步世界书/数据)。联动:注入正文当幻想、转微信群吐槽。②**世界演化设置重构**:一长条→分类左右分栏(基调演化/正文世界书/注入/API/提示词/记忆/同步世界书/自动推进);提示词改用共享 `promptEditPanelHtml`(含 AI 重写+绑书);save 改「有则读无则保持」防误重置。③**世界演化注入重构**(对标其他 app):`registerInjectPlan` 片段化(角色近况/世界背景线/编年史,scope 勾选注入哪些对象,默认全关+封套+输入框/世界书双向+勾选不自动写);**移除每对象「常驻注入」开关**(injectEnabled UI 全删,refreshInject 退役为老数据清理器)。tsc0/build ok。memory: `project_batch21_theater_evo`。
- **批次20**:反馈修复 3 点(不验收,直接转小剧场)。①注入面板勾选/切模式/改范围不再自动写世界书,改为只在点「立即同步世界书片段」按钮时写(避免「点选择框就被塞条目」);关闭片段仍移除旧条目。②**世界书绑定根因修复**:条目 key 分隔符曾用 `\0`(NUL),经 `JSON.stringify→localStorage→JSON.parse` 往返被损坏成 U+FFFD(`�`),致 `parseWbEntryKey` 用 `indexOf('\0')` 拆不出 → 条目名显示成带 `�` 的整条 key、按名注入匹配失败(绑了等于没绑)、evolution `keysToRefs` 用 `indexOf(' ')` 更直接丢光绑定。改 `KEY_SEP='␟'`(可打印/JSON/DOM 安全)+ `parseWbEntryKey` 兼容历史三分隔符(␟/NUL/�)+ `normalizeEntryKey` 愈合 + wbPicker 打开即规整回写存储 + evolution 改用 `parseWbEntryKey` 并 `buildGlobalWbText` 加按名兜底。③订阅组对象复选框与名称同行(`.th-evo-subpick` flex chip)。用 MCP 连真机定位到 U+FFFD 根因。
- **批次19**:反馈修复(7项)+ 世界演化三栏重构。反馈:美团食材白框(补 carrot 图标)/猎奇度→趣味度全 app/淘宝物流+美团配送一次 API 出全程(骑手随全局性别 AI 生成)/糖心当前直播注入失效(`_lastRoomId` 定位)/糖心粉白字根因(白底兜底强制 `var(--tx)`→固定深墨 #23161f)/编辑框放大(thPrompt rows+`:has` 宽 560)/性别模式去全男性+双端刻度联动。演化重构:数据层(目标火候/关系网/订阅组/世界钟/基调透镜/三档回流/编年史/烈度阀)+ 提示词全重写(破限/单人/拼推含碰撞+身份锁定/世界/回归简报;基调透镜替代写死基调)+ 三栏 `.thw-evo-app2`(左轨 世界线/世界态/订阅/节拍 + 详情右栏 inspector)+ M11 涟漪(intrude 外溢微信)+ M6 订阅按楼自动拼推/精推。memory: `project_batch19_feedback_evolution_redesign`。
- **第十轮**:bug 修复(黑输入框兜底 §5 / 白方块补图标)+ 演化双模式重构(结构化世界态 + 地点演化 + 所有提示词通用化读世界书)+ 论坛增强(板块类型/仙宫预设/注入隔离/主题)+ **设计系统地基 ui-kit**。memory: `project_batch10_evolution_forum_designsystem`。
- **第九轮**:5 新 app 设置补全 + 破限进提示词编辑(ordered_prompts[0])+ 演化/论坛对标 World-master + 全 app 破限横切。memory: `project_batch9_settings_jailbreak`。
- **第八轮**:人格库全重写(19)+ 糖心 CSS 甜美重设计 + 卡片关联白屏修复 + 5 新 app(B站/小红书/日历/日记/浏览器)。memory: `project_world_phone_shell`。
- **第五~七轮**:世界书条目级注入 + wb-sync 记忆架构 + 每 app API 管理 + 破限排第一 + 糖心平台化 + 提示词不简化移植。memory: `project_world_p0/p1/p2`。
- **第二~三轮**:外壳横版平板 + 微信整 app 复刻 yuzuki + 富交互。

---

## §11. 设计系统地基参考（`.thw-*` 前缀 / `status-bar.css §11`）

> 全 app 三栏重构已落地。这里保留设计系统 token/组件速查，新 app 或改样式时套用；不再记录逐轮历史（见 git log + memory）。

- **作用域 token**：每 app 根设 `--thw-accent`，其余结构色 color-mix 派生（`--thw-soft/-2`、`--thw-line`、`--thw-text/-2/muted/faint`、`--thw-accent-2/-ink`）。
- **玻璃三件套** `.thw-card`：145deg 双层渐变 + `blur()saturate()` + 双 inset 高光/暗线；海拔 4 档 `--thw-elev-contact/card/float/modal`；缓动 4 条 `--thw-std/in/drift/bounce`（回弹仅给点赞爆点）。
- **布局原语**：`.thw-topbar` / `.thw-sidebar`+`.thw-nav`(窄左导航，带 `.thw-nav-badge`) / `.thw-body`(横向flex) / `.thw-content`(主区自滚) / `.thw-inspector`(右检视栏)。详情展开统一「隐藏浏览列 + 详情独占居中限宽 + 返回按钮」。
- **按钮三级**：`.thw-btn-primary`(+`.thw-fab`) / `.thw-btn`(`.thw-btn-mini/-danger`) / `.thw-iconbtn`(hover 显形，`.thw-like` 心跳 `thw-heart`)。
- **组件**：`.thw-seg` / `.thw-field/-input/-select/-textarea`+`.thw-flabel` / `.thw-switch(row)` / `.thw-chip` / `.thw-tag` / `.thw-empty` / `.thw-loading(thw-spin)` / `.thw-skel`(骨架屏 `thw-shimmer`) / `.thw-rise(-stagger)` 错峰入场 / `.thw-set-group`+`.thw-set-glabel`+`.thw-set-hint`(承载 §6B 全套设置)。
- **弹窗**：一律 `ui-kit` 的 `thToast/thConfirm/thPrompt/thAlert`，禁原生 alert/confirm/prompt 与 toastr。

### 新会话接手须知
1. 读本文件(尤其 §6 长期要求 + §11)。
2. 读 `@types/function/{generate,inject,worldbook,variables,chat_message}.d.ts` + `@types/iframe/exported.mvu.d.ts`;用前 grep 签名。
3. `ls src/前端悬浮球V1/{lib,modules}/{,world/}` 确认结构。
4. 改完 `npx tsc --noEmit -p tsconfig.json`(0 容忍)+ `pnpm build`(production,项目根)。UI 需用户导入 `dist/前端悬浮球V1/index.js` 实测。回滚靠 git。
5. 前端全部长期约定与踩坑已并入 [README.md](README.md)(架构/两套隔离/踩坑档案/硬约束/提示词要求),改前必读。历史批次的 memory 引用(§8/§10)是当时的记录,相应前端 memory 已并入 README、原文件不再保留。

> 远程导入(jsdelivr,需先 git push 触发 CI 重打包):
> `import 'https://testingcf.jsdelivr.net/gh/wqiansu/qiyue_cjtd_qianduan@main/dist/%E5%89%8D%E7%AB%AF%E6%82%AC%E6%B5%AE%E7%90%83V1/index.js';`
