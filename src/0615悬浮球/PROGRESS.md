# 0615 悬浮球 · 状态与下一步

> 单一可信源。新会话接手本项目时,先读完本文件,再读 `@types/` 关键类型,最后确认 `src/0615悬浮球/` 文件结构。
>
> 本文件在 2026-06-19 更新:§10.6 Build 2 全部完成并验收通过。

---

## 0. 当前结论(新会话先看)

| 维度 | 信息 |
|---|---|
| **项目** | `src/0615悬浮球/` - 此间天地酒馆助手悬浮球状态栏 |
| **打包** | `pnpm build:dev`(项目根目录执行) |
| **产物** | `dist/0615悬浮球/index.js`(用户手动导入酒馆) |
| **当前阶段** | §10.6 Build 2 全部完成并验收通过 |
| **关键约束** | 悬浮球只做展开面板入口(球 tip 已删除);储藏间永不绑世界书;所有代码必须可编译打包 |
| **必读文件** | 本文件 + `@types/function/variables.d.ts` + `@types/iframe/exported.mvu.d.ts` |

### 0.2 正确的变量路径(关键!)

**User 玩家路径**(通过 `getUserKey(data)` 获取 userKey,不是固定的 'user'):

| 数据类型 | 正确路径 |
|---|---|
| 拥有物品 | `{userKey}.拥有物品` |
| 拥有技能 | `{userKey}.拥有技能` |
| 状态 | `{userKey}.状态` |
| 当前穿着衣物 | `{userKey}.当前穿着衣物` |

**NPC 路径**(npcName 通过 `getNPCs(data)` 获取,返回 `[{name, info}]`):

| 数据类型 | 正确路径 |
|---|---|
| 拥有物品 | `NPC.{npcName}.拥有物品` |
| 拥有技能 | `NPC.{npcName}.拥有技能` |
| 状态 | `NPC.{npcName}.状态` |
| 当前穿着衣物 | `NPC.{npcName}.当前穿着衣物` |

### 0.3 Build 2 已完成功能一览

| Build | 功能 | 状态 |
|---|---|---|
| Build 2-1 | 初始数据读取+增量合并(世界书条目 → 本地) | ✅ 完成 |
| Build 2-2/3 | 运行时数据导入储藏间 + 写入 `[初始·储藏间]` 条目 | ✅ 完成 |
| Build 2-4 | `links` 字段双向关联(地点↔事件↔DLC) | ✅ 完成 |
| Build 2-5 | 关联分组面板(hover工具栏 + 一键开关关联卡片世界书) | ✅ 完成 |
| Build 2-6 | 收藏筛选(筛选栏加只看收藏按钮) | ✅ 完成 |
| Build 2-7 | 批量操作(多选模式 + 批量删除/打标/导出) | ✅ 完成 |
| Build 2-8 | 标签+世界书联动(按标签批量开启/关闭) | ✅ 完成 |
| Build 2-9 | 标签+配发(按标签批量配发 + 批量多NPC配发) | ✅ 完成 |
| Build 2-10 | 标签+导入导出(按标签导出 + 导入选标签) | ✅ 完成 |
| Build 2-11 | 标签+编辑(标签默认注入模板 + 编辑 modal 标签复选框) | ✅ 完成 |
| Build 2-12 | 整体验收 | ✅ 完成(2026-06-19 验收通过) |

---

## 1. 新会话开场清单(必须按顺序)

1. **全文读本文件**: `src/0615悬浮球/PROGRESS.md`。
2. 读酒馆助手类型定义,至少:
   - `@types/function/variables.d.ts`
   - `@types/iframe/exported.mvu.d.ts`
   - `@types/iframe/exported.tavernhelper.d.ts`
3. `ls src/0615悬浮球/` 确认结构见 §3。
4. 改代码后必须跑 `pnpm build:dev`。UI 行为需要用户重新导入 `dist/0615悬浮球/index.js` 后实测。

---

## 2. 项目边界与数据模型

### 2.1 数据模型(ManagedItemV2)

```ts
type ManagedItemV2 = {
  desc: string;               // 简介(必填)
  tags: string[];             // 标签数组
  order?: number;             // 桶内顺序
  inject?: string;            // 自定义注入模板
  favorite?: boolean;         // 收藏标记
  lastEdited?: number;        // 最后编辑时间戳(最近排序用)
  links?: {                   // 双向关联
    locations?: string[];     // 关联的地点名称
    events?: string[];        // 关联的事件名称
    dlcs?: string[];          // 关联的 DLC 名称
  };
};
```

### 2.2 Tag 数据模型

```ts
type Tag = {
  color: string;
  desc: string;
  defaultInject?: string;     // 给打此标签的卡片自动应用的注入模板
};
```

### 2.3 ManagedKind 与关键配置

```ts
type ManagedKind = 'location'|'event'|'dlc'          // 绑世界书
                   |'stash-item'|'stash-skill'        // 储藏间 4 固定 kind
                   |'stash-status'|'stash-clothing'
                   |`stash-custom-${string}`;         // 储藏间自定义 kind

// 所有 kind 统一配置获取,不要直接 MANAGED_CFG[kind]
function getStashKindCfg(kind): {icon,label,storageName,storageKey,
                                 defaultInject,prefix,bindsWorldbook}
```

### 2.4 初始数据条目命名(精确匹配)

| 初始条目名 | 覆盖 kind | 内容格式 |
|---|---|---|
| `[初始·地点]` | location | JSON 数组 `[{name,desc,tags,inject,links}]` |
| `[初始·事件]` | event | JSON 数组 |
| `[初始·DLC]` | dlc | JSON 数组 |
| `[初始·储藏间]` | stash-item/skill/status/clothing | 多 kind JSON `{format:"th-managed-multi-v1",groups:{...}}` |

**使用示例**:

1. 玩家在角色卡世界书建条目,名称填 `[初始·地点]`,内容填:
   ```json
   [
     {"name":"甘霖天池","desc":"霜月仙宫秘境中央露天湖泊...","tags":["浴池","社交"],"links":{"events":["沐浴事件"]}},
     {"name":"百味集市","desc":"主殿正下方地下回字形街道...","tags":["商业"]}
   ]
   ```

2. 点击地点面板标题栏「🌱 重读初始数据」按钮 → 增量合并到本地。

3. 条目建议设为:**蓝灯(constant) + 禁用(disabled)**,避免内容被注入到 AI 上下文。

---

## 3. 文件结构

```text
src/0615悬浮球/
├── index.ts                    # webpack 入口
├── Shell.vue                   # 悬浮球/面板外壳(Vue)
├── status-bar.html             # 状态栏模板
├── status-bar.css              # 主题/布局/modal/标签系统 CSS
├── status-bar-init.ts          # 状态栏核心逻辑(~6300 行)
├── lib/
│   ├── icons.ts                # Lucide SVG 映射 + stripFa
│   └── variable-review.ts      # 变量审核/快照数据层
└── PROGRESS.md                 # 本文件
```

---

## 4. 不要破坏的约束

- 单主题糖果粉;不要加 dark mode / 主题切换。
- 悬浮球只做展开面板入口(球 tip 已删除),不要恢复球 tip 功能。
- 图标优先 Lucide SVG(经 stripFa 拦截器);不要新增 emoji 图标。
- 不要在 `.th-fab-panel` 上加 `transform/filter/perspective/backdrop-filter`。
- 主角名提取逻辑沿用 0612:第一个非 `user/{{user}}/<user>` 占位符 key 为主角。不要随意重写。
- 不要引入 jQuery 或 UI 框架。
- 不要长期跑 `pnpm watch`。
- localStorage key 命名:`_th_*`。
- **储藏间永不绑世界书**: `bindsWorldbook:false`。
- **不要用 `qsRoot(..., document.body)` 查询 wrapper 内元素** — 用 `qs()`。
- **fa 图标拦截器必须同时装 iframe 和 parent 的 `Element.prototype`**。
- **`lib/icons.ts` 的 `inner()` 必须保留 undefined 防御**(历史上 lucide-static 不存在的导出 Ring/HatWizard 曾导致整个悬浮球加载崩溃)。新增 lucide 导入前先确认该 named export 存在。

---

## 元规则(所有后续会话必读)

1. **当出现不清楚 / 语意不明 / 用户描述不充分时,不要自己猜,可以直接询问用户。**
2. **AI 无法将代码导入到酒馆助手脚本中。** 当修改完代码后,若 AI 计划用 mcp 验证页面行为,需要先告诉用户把代码导入,等用户导入并确认后,AI 才可以继续 mcp 验证。
3. **当目前代码全部 build 完毕之后,用通俗易懂的语言告诉用户改了什么,并为用户设计对应的验收计划来帮助用户验收。** 不要在 build 完只输出 "build 通过" 一行话。
4. **不要拍截图(token 消耗太大)**。MCP 验证用 evaluate_script / take_snapshot。
