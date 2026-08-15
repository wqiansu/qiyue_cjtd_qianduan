# 前端悬浮球V1 · 状态与下一步

> **单一可信源**。新会话接手先读完本文件 → 读 `@types/` 关键类型 → `ls src/前端悬浮球V1/{lib,modules}/{,world/}` 确认结构,再动手。
> 逐批实施日志已清理(**代码即真相**)。本文件保留:必需地基 + 长期要求(提示词/设置/UI/API)+ app 功能盘点 + 长期结论。架构与踩坑见 [README.md](README.md)。

---

## 0. 当前结论(新会话先看)

| 维度 | 信息 |
|---|---|
| **项目** | `src/前端悬浮球V1/` — 此间天地酒馆助手悬浮球状态栏 |
| **世界观** | 此间天地 = **现代仙侠 × 高维仙宫 × 日式校园恋爱喜剧 × 轻松日常单元剧 × 无厘头甜蜜修罗场**。全女性百合(霜月仙宫 32 仙主 + 星见丘学园),修仙「降维」服务于生活/情趣/笑点,**没有阴暗面**(禁致郁/虐主/外部反派/沉重代价,冲突当天喜剧收场)。设定原文在 `角色卡工作室/此间天地/世界书/`(霜月仙宗设定·星见丘学院设定·世界观·叙事指南)。 |
| **打包** | **`pnpm build`(production,项目根执行)** → 产物 `dist/前端悬浮球V1/index.js`(用户手动导入酒馆,AI 无法代为导入)。与上游教程和 CI 一致;`build:dev` 只用于本地调试。改 CDN 外部依赖导入名后必跑 `pnpm check:cdn`,原因见 README「踩坑档案」。 |
| **核心约束** | 行为/布局变化需用户拍板;每批 `tsc --noEmit`=0 + `build` + 用户导入验收 |
| **回滚** | 走 git;分阶段 commit |
| **下一步** | 全部规划 app 与三栏重构已落地。唯一挂起项:bili/red/taobao/browser/meituan/fanfan/xmly/zui 这 8 个 app 的复审清单待用户勾选后再实现。 |

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
│       ├── ui-kit.ts             # 内置玻璃组件 thToast/thConfirm/thPrompt/thAlert
│       ├── evolution-store.ts evolution-presets.ts                # 演化(角色线)
│       ├── world-state-store.ts world-state-prompts.ts            # 结构化世界态
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
- **★二级弹窗 portal 到 body(必读,代码里不显然)**:`.th-modal-overlay-2`(世界壳 + API/外观/初始化/储藏/标签/提示词等 ~10 个共用二级弹窗)在 setup 时被 `portalModal2ToBody()` **移出 `.th-status-wrapper`、挂到父页 body**,以逃出主面板的 containing block/层叠上下文(否则世界被面板裁剪 + 面板 backdrop 玻璃透出)。配套铁律:① 查询二级弹窗**壳自身**(overlay/modal-2/title/body/close)用 `qs2()`,查**壳内内容**(如 `qs('#'+RID)`、20 个 app 容器)用 `qs()`——`qs/qsa` 已带 portal 兜底,壳内查询零改动;② portal 后 overlay 脱离 wrapper 继承,`status-bar.css` 用 `.th-modal-overlay-2[data-th-portal="1"]` 补回 font-body/色/17px/box-sizing 基线(否则字体灰白+布局散);③ 世界(phone)打开时 `openModal2` 给 body 加 `.th-world-active`,CSS `body.th-world-active .th-fab-panel` 把主面板整体透明化(不描边/不拦截/隐藏可见区),关闭移除 → 无论从悬浮球还是顶栏「世界」按钮进,面板玻璃都不透出;④ phone 外壳底部 Home 条 `[data-phone-home]` = 返回桌面(`setPhoneHomeHandler(showDesktop)`,不关整个世界,可连续切 app);⑤ **通用 `.th-modal { contain:layout paint }`(§2607) 会裁 phone 机身绘制** → 世界拖出原居中框被裁(表现为"被世界原版容器遮挡"),`.th-modal-2.th-phone-host` 必须 `contain:none !important`(单 overflow:visible 不够);⑥ **portal 前用 `.th-status-wrapper .th-X` 前缀写的弹窗内部样式,portal 后全失配**(表现:弹窗只剩按钮+文字、布局全丢)——modal 专用类族(`.th-init-*`/`.th-ps-*` 已改)一律用 `.th-modal-overlay-2 .th-X` 前缀,**别用 `.th-status-wrapper`**。新写二级弹窗内部 CSS 遵此。⑦ **ui-kit 弹窗(thConfirm/thAlert/thPrompt/thToast)也 portal 到 body**:原挂 `.th-status-wrapper`(该元素 `position:relative;z-index:0` 自建层叠上下文),世界 overlay portal 到 body(z 100300)后整个 wrapper 子树被压在世界之下、且 `body.th-world-active .th-fab-panel{pointer-events:none}` 波及 → 世界内弹确认框在世界下面且点不动。改 `ui-kit.ts` 的 `buildDialog`/`ensureToastHost` 挂 `__body`(带 `data-th-portal="1"`),z 110100/110200 真正压过世界;CSS 基线块已扩展覆盖 `.th-dlg-overlay/.th-toast-host[data-th-portal]`。新写 body 级弹层同理:挂 body + 带 portal 标记补基线。
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
- **★提示词必须通用化 + 读绑定世界书**:具体设定(六宫职能/角色名/地点细节)**不写死进 prompt**,改从**绑定的世界书条目**读取并注入 system(参考 evolution 的 `buildActorSetting`/`worldbookAnchor`、`resolveWbRefsByName` 按名自动绑定 + 持久化)。设定改了只改世界书、永不改提示词。每个能生成的模板都应支持绑定世界书条目。
- **★★去卡专有名**:除**世界演化**(world-state/evolution)一族可保留霜月仙宫/星见丘等本卡专名外,**其余所有 app 的初始提示词一律不得出现具体专名**(霜月仙宫/星见丘/谪仙宫/听风宫/婉音/秦筝/苏墨墨/顾漫漫/万花镜/仙宫…),改用中性描述(「当前世界」「绑定世界书」「通讯录里的主播」)。目的:换角色卡时不串设定、不乱入人物。
- **★★★正向指引、禁写负面禁令**:通用化=**只做正向指引**——「有世界信息/绑定世界书就以它为准,没有就退回中性常识发挥」。**绝不要**写「禁止套用某张卡的专有设定/不预设任何世界观」这类负面禁令:基础提示词本就不含那些专名、AI 读不到,写了反而会让**玩家真绑了世界书时 AI 畏手畏脚、不敢遵循绑定设定**。绑定世界书永远是权威来源,提示词只需鼓励使用它。
- **★★★★禁酒馆黑话进提示词正文**:「世界书」「角色卡」「楼层/几楼」「破限」「注入」这些是**酒馆机制的内部称呼**——AI 最终只收到提示词文本、收不到这些机制,写进 prompt 正文只会增加理解负担、让 AI 多想。**面向 AI 的提示词正文里**一律改中性说法:世界书→「以下设定资料/本作权威设定/背景资料」、角色卡→「本作/这个故事」、最近几楼正文→「最近的剧情」、破限→不提。(变量名/desc/UI 文案/代码注释里可保留这些词,只清理**发给 AI 的正文**。)
- **★★★★★禁 AI 痕迹写法**:提示词正文是**发给 AI 的指令**,不是给开发者的说明书。① 不要把「给你的要求/设计说明」当成注释、备注、补充塞进提示词结构;② 不要写括号元评论旁白(如「(成人浓度只在色情度拉高时才升温)」「(这是最重要的钩子)」「(务必)」这类对指令本身的自我点评)——要么删掉,要么改写成自然的祈使句。判断法:这句话是"让 AI 去做某事"还是"在向读者解释这条提示词"?后者一律清理。
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
- **内置警告/通知/输入框**:全部用 app 内组件,**绝不用浏览器原生 alert/confirm/prompt 或外部 toastr**。用 `lib/world/ui-kit.ts`(`thToast/thConfirm/thPrompt/thAlert`,Promise 化、portal 到 body 见 §4·⑦)。⚠️ 新增任何弹窗输入框别裸继承祖先字色(会白底粉字看不清),照 `.th-dlg-input` 的深底高对比字 + `-webkit-text-fill-color` 兜底写。
- **设计系统地基**:CSS `status-bar.css §10.6` 玻璃 token(`--th-glass-* / --th-elev-1/2 / --th-ease-in/bounce/std`);组件渲染进 `.th-status-wrapper` 内继承样式。

### 6D. ★全 app 同步约束(违反即不合格)
**任何「横切性」功能的新增/调整,必须一次性同步到全部 app(含最容易被遗漏的「浏览器」),不许只改一部分。** 历史教训:多轮反馈里浏览器/某些 app 被漏改,导致功能参差。
- 横切功能清单(改其一就要全 app 过一遍):生态浓度滑块与 `ecoDirective` 措辞、分类提示词 AI 重写、注入片段/封套、图片中文描述(coverDesc/sceneDesc)、破限提示词、API/世界书/记忆共享面板、跨 app 推微信、全局设置(性别/图片字数)。
- **注入片段信息完整性**:每个 inject `build()` 注入实体时,**不能只给名称**——要把该实体在 app 内的关键字段一并带上(店铺=品类/商圈/评分/人均/招牌菜/口碑;商品=价/店/卖点;视频=UP/分区/播放),否则正文 AI 会自行脑补出与 app 内不一致的细节。fanfan 已建 `fanShopInjectLine()` 统一档案行,注入与暂存夹共用。纯名单类(如微博「我关注的人」)例外,名字本身即全部信息。
- **生态色情/肉欲阀作用域**:`ecoErotic`/`ecoCarnal` 的滑块描述与 `ecoDirective`/提示词措辞必须**作用于全 app 全品类**,不许锁死在某一个子分类(历史坑:fanfan 锁「双修膳房」、meituan 锁「私密配送」、taobao 锁「成人情趣」——均已改为全 app 生效+该子区为"浓度更集中区")。
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

## 8. 已实现盘点(代码即真相)
- **状态栏地基**:世界书资产管理(地点/事件/DLC/储藏间/关联,三层初始化看板);AI 总结注入(任务池/分桶/json_schema/重roll/流式/快照);提示词体系(人格/风格/**破限**三段式 + CRUD);卡片 AI 重写/反向导出/激活监控。
- **世界套件入口**:顶栏「世界」按钮 → 桌面壳 + phone 外壳(`openModal2({phone:true})`,屏幕中央悬浮一台平板 + 实时状态栏)。
- **20 个 APP**(自注册 order,完整清单见 §9):微信10 / 演化20 / 小剧场30 / 论坛40 / 微博50 / 糖心60 / 通话80 / B站90 / 淘宝·小红书100 / 美团·日历110 / 饭饭·日记120 / 浏览器·喜马130 / 最右140 / 记忆150 / 工作台160 / 设置999。
- **共享底座**(`lib/world/`):world-store / contacts / memory(四层) / media / ai-chat / world-prompts / worldbook / wb-picker / api-plan / wb-sync / phone-shell / ui-kit / prompt-kit / inject-plan / read-config / world-globals / world-writer-persona。

---

## 9. 各 app 功能清单(代码即真相)

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

### 世界演化
- **世界演化(order20)**：顶部 tab = 世界线(角色/世界背景) / 世界态 / 地点 / 订阅 / 节拍。世界钟(纯 24 小时制，等长历 12月×30天，授时三法：读正文/手动拨/随推演)+134 节日表铺入日历。演化对象单人/联合(拼推)/世界背景推演、回归简报、编年史、烈度阀、6 基调透镜、12 题材一键换装、订阅组按楼自动推进、世界大事阶段机(进展/冲突/节庆)。
- **世界态(演化内 tab)**：单栏仪表盘。维度：日常单元剧/万花镜打榜(主榜+10 子榜全展开，「统一演化万花镜」钮)/六大宫殿(「统一演化六宫」钮)/氛围三维(每维三词+一句)/综艺企划/学园社团/八卦(引论坛)/修罗场/当季/突发/身份双轨/悄悄话/时令。每条目 ✎编辑/🗑删除。「建立开局」一键铺满 + 「推进一轮」整体推。(声望多轴已删,`charm` 万花镜人气是独立字段仍在。)
- **地点(演化内 tab)**：独立 `place-store`/`places-ui`，绑定「地点」世界书条目，单独或整体演化地点镜头外动静。**核心铁律：只写地方本身，绝不把正文主角拉进来演戏**(对标 `参考/提示词/世界事件.txt` 后台独立于正文)。

### 设置 / 记忆（全局）
- **设置 app**：独立 API 预设隔离/读取管理/通讯录；全局横切(性别/图片字数走 `world-globals` 统一层)。
- **记忆 app(order150·角色记忆池)**：`CharPool` 按 `contactId` 跨 app 共享+角色隔离，三层(关键设定/长期/近期)+来源计数，零重复归档；三栏(角色列表/分层视图/注入预览+token+静音+阈值覆盖)。多角色场景(演化/剧场/群聊)作独立场景不入池。

### 提示词「后台独立于正文」总则
- 世界演化 / 世界态 / 地点 一族的推演提示词，均要求：补的是「主角镜头之外同时在发生的事」，可与正文完全无交集；**绝不把正文当前在场的主角/角色搬进后台当主角、发生剧情**；正文只用来对齐时间线/时节/流速。新增同类后台推演一律遵循此则。

### 长期结论(从历次实施沉淀;机制细节以代码为准)

- **宏安全铁律**:`world-prompts.fillTemplate` 是自研模板引擎,不在 vars 里的 `{{key}}` **就地抹成空串**(不留给酒馆宏)。故 prompt-kit 的块文本一律不含 `{{...}}`,人名由调用方填 vars;破限/场景 system 里的宏由自研 `expandLocalMacros` 在发送前本地展开(`{{user}}`→通讯录 isUser 名、`{{char}}`→调用方传入、`{{random::a,b}}`→每次随机挑一个、未知留原样、幂等)。**不赌酒馆原生宏**。
- **破限单点维护**:全部 app 破限由 `prompt-kit.buildJailbreak()` 工厂生成(两族骨架 + `sovereignty/extraSections/behaviorTitle/nsfwText/allowNsfw/omitStdLocks/trailingRule/title/lockLine` 旋钮),新 app 别手写 SYSTEM_OVERRIDE 骨架。**身份锚互斥**:开写手人格时 `downgradeJailbreakForPersona` 把 app 破限的「你就是角色本人」首句(`CORE_IDENTITY_DISSOLUTION`)换成服从上位写手人格的从属声明,避免两个身份锚打架。
- **入戏确认锚**:`chatGenerate` 在 `ordered_prompts` 的 user_input **之前**插一条 assistant 锚(`buildAssistantPrefill`)——非末条,故不会被当 prefill 续写、不漏进正文、不破 JSON。
- **写作质感块(共享 registry)**:5 核心块默认开 + 13 选用块默认关 + 玩家自定义块,统一注册在 `appId='quality'`(各 app `listPromptTemplates` 按自身 appId 过滤,不串入)。剧情类生成传**块 id 数组**(`QUALITY_DIALOGUE/PROSE/EVOLUTION`)经 `resolveQualityBlocks` 解析(覆盖文本优先 + 过滤关停 + 附加已开选用/自定义块);结构类/社区类不传即零附加。改一个块 → 所有挂载的 app 一起生效。
- **提示词必须玩家可见**:每个注册 appId 都要有可见可编辑的提示词面板(片段走各自折叠区、封套走 inject-plan 面板、分类引导内联编辑)。**新增提示词的同时补面板**,否则玩家看不到也改不了(通话曾漏)。
- **四条注入通道(别再误判)**:生成走 `generateRaw` 的 `ordered_prompts`,**没有 chat_history 锚点** → `injectWorldOnce` 的 in_chat/depth 注入会被静默丢弃。故 ① app 勾选的世界书条目走 `queueSysInject` 一次性 system 追加队列(逐 app 隔离、发完即清);② 全局背景走 `read-config.ctxWbKeys` → `buildInjectFromKeys`;③ app 产出沉淀走 `wb-sync` 写角色卡世界书;④ `injectWorldOnce` 只留给 wb-sync 的「注入聊天框」通道。app 侧注入门闸一律 **key 驱动**(勾了条目即生效,无独立总开关)。
- **MVU 铁律**:世界套件**不写** MVU 变量,沉淀只走「写世界书条目 + 注入聊天框」两种(全套件已无 `updateVariablesWith` 写)。
- **世界设定唯一来源 = 玩家绑定的世界书**:内置 CANON 设定速记已删;提示词里的 JSON 示例只示范结构与基调,标注不要照抄。
- **未读红点要即时刷**:产生未读后调 `refreshWorldUnread()`(顶栏 syncdot 桥 + 桌面在场重渲染),别只靠 8s 轮询——AI 生成时玩家常在 app 内,`markChatRead` 每次 render 清零会让红点形同无效。
- **死脚手架(别当成在用)**:`prompt-kit` 的 7 个横切常量块与 `buildSceneTail()` 从未接线(0 引用),只有 5 质感块 + `buildJailbreak` 是真在跑的。
- **用户长期决策(勿自行加回)**:不加**全男模式**(只保留全女/对半/自定义);日历 31 号不补节日;糖心→微信私域联动不做;无老玩家旧存档,默认值可直接干净重写、不做版本迁移。
- **两套破限互不交叉**:主面板(状态栏)用 `config.AI_JAILBREAK_DEFAULT`=`UNBOUND_ASSISTANT_ENGINE`(中性解锁、**不锁任何人格**,因主面板本有可切换人格库 AI_PERSONAS,人格锚定会冲突),只 `ai-summarize` 用;世界各 app 用自己的 `<app>.jailbreak`,`ai-chat` 从不 import config 破限。人格锚定版(宅女作家月轻轻)在 `lib/world/world-writer-persona.ts`(`_th_world_writer_persona_v1`,**默认开**;存档没写过 on 即视为开、显式关过则尊重),开启后拼在每个世界 app 破限**之前**。API 也早已隔离(世界 `_th_world_api_*` vs 主面板 `_th_api_presets_v1`)。
- **「读取管理」只剩三项真配置**:`ReadConfig` = `{maxChars(默认20000), excludeTags, ctxWbKeys}`。**读不读正文/读几楼归各 app 自己**(曾有一个从不被读的全局「参考正文」总开关,已删,别再加回)。
- **「全局生态」只有两项真全局**:互动用户性别 + 图片描述字数(走 `world-globals.buildGlobalCrosscut`,默认值下不追加)。各 app 的 eco 滑块(色情/网暴/阴阳/玩梗…)都是**各 app 独立**,别在文案里写"作用于全 app"。
- **审计出的死配置一律清掉,不留空壳**:历次排查已删 `should_stream`/`syncEnabled`/`festivalFromWb`/`autoFreq`/`proactiveInterval`/`refEnabled` 等假开关与 per-app 死级联。**新增设置项必须当轮接线**,否则就是下一个"勾了没用"。
- **每批交付前的只读审计**:新 app / 大改后按「真 bug → 死配置 → 半成品闭环 → 内容扩展」四类过一遍再交验收(历次都是这样捞出真问题的);盲目重写已达标的提示词只会劣化,**先审计再富化**。

---

## §10. 设计系统地基参考（`.thw-*` 前缀 / `status-bar.css §11`）

> 全 app 三栏重构已落地。这里是设计系统 token/组件速查，新 app 或改样式时套用。

- **作用域 token**：每 app 根设 `--thw-accent`，其余结构色 color-mix 派生（`--thw-soft/-2`、`--thw-line`、`--thw-text/-2/muted/faint`、`--thw-accent-2/-ink`）。
- **玻璃三件套** `.thw-card`：145deg 双层渐变 + `blur()saturate()` + 双 inset 高光/暗线；海拔 4 档 `--thw-elev-contact/card/float/modal`；缓动 4 条 `--thw-std/in/drift/bounce`（回弹仅给点赞爆点）。
- **布局原语**：`.thw-topbar` / `.thw-sidebar`+`.thw-nav`(窄左导航，带 `.thw-nav-badge`) / `.thw-body`(横向flex) / `.thw-content`(主区自滚) / `.thw-inspector`(右检视栏)。详情展开统一「隐藏浏览列 + 详情独占居中限宽 + 返回按钮」。
- **按钮三级**：`.thw-btn-primary`(+`.thw-fab`) / `.thw-btn`(`.thw-btn-mini/-danger`) / `.thw-iconbtn`(hover 显形，`.thw-like` 心跳 `thw-heart`)。
- **组件**：`.thw-seg` / `.thw-field/-input/-select/-textarea`+`.thw-flabel` / `.thw-switch(row)` / `.thw-chip` / `.thw-tag` / `.thw-empty` / `.thw-loading(thw-spin)` / `.thw-skel`(骨架屏 `thw-shimmer`) / `.thw-rise(-stagger)` 错峰入场 / `.thw-set-group`+`.thw-set-glabel`+`.thw-set-hint`(承载 §6B 全套设置)。
- **弹窗**：一律 `ui-kit` 的 `thToast/thConfirm/thPrompt/thAlert`，禁原生 alert/confirm/prompt 与 toastr。

### 新会话接手须知
1. 读本文件(尤其 §6 长期要求 + §9 长期结论 + §10)。
2. 读 `@types/function/{generate,inject,worldbook,variables,chat_message}.d.ts` + `@types/iframe/exported.mvu.d.ts`;用前 grep 签名。
3. `ls src/前端悬浮球V1/{lib,modules}/{,world/}` 确认结构。
4. 改完 `npx tsc --noEmit -p tsconfig.json`(0 容忍)+ `pnpm build`(production,项目根)。UI 需用户导入 `dist/前端悬浮球V1/index.js` 实测。回滚靠 git。
5. 架构 / 两套隔离体系 / 踩坑档案 / 硬约束 / 提示词长期要求见 [README.md](README.md),改前必读。

> 远程导入(jsdelivr,需先 git push 触发 CI 重打包):
> `import 'https://testingcf.jsdelivr.net/gh/wqiansu/qiyue_cjtd_qianduan@main/dist/%E5%89%8D%E7%AB%AF%E6%82%AC%E6%B5%AE%E7%90%83V1/index.js';`
