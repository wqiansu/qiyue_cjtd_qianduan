# EJS 提示词模板完整工作流指南

> **适用环境：** SillyTavern + 提示词模板扩展（ST-Prompt-Template）
> **整理：** 秋青子
> **更新日期：** 2026年3月4日

---

## 目录

1. [什么是提示词模板](#什么是提示词模板)
2. [核心原理：动态发送提示词](#核心原理动态发送提示词)
3. [基础语法](#基础语法)
4. [用 if 条件控制发送什么提示词](#用-if-条件控制发送什么提示词)
5. [用 getvar 获取变量](#用-getvar-获取变量)
6. [用 print 和 getwi 组织提示词](#用-print-和-getwi-组织提示词)
7. [用 `<%= %>` 填入变量值](#用--填入变量值)
8. [更丰富的条件判断](#更丰富的条件判断)
9. [验证和调试](#验证和调试)
10. [变量系统](#变量系统)
11. [世界书操作](#世界书操作)
12. [装饰器](#装饰器)
13. [内容注入](#内容注入)
14. [Prompt 注入（@INJECT）](#prompt-注入inject)
15. [提示词注入（injectPrompt）](#提示词注入injectprompt)
16. [激活正则](#激活正则)
17. [多阶段人设系统实战](#多阶段人设系统实战)
18. [内置常量](#内置常量)
19. [内置函数速查](#内置函数速查)
20. [常见问题](#常见问题)

---

## 什么是提示词模板

提示词模板扩展对 SillyTavern 的宏语法进行扩展，基于 [Embedded JavaScript (EJS)](https://ejs.co/) 实现，能够在提示词中使用 JavaScript 代码。

它能在**世界/知识书**、**预设提示词**、**角色相关内容**、**消息**中执行。

只需要在提示词中使用 `<% ... %>` 语句块即可。例如：

```javascript
<% print('hello world!') %>
```

### 处理流程

1. SillyTavern 准备生成时的提示词（合并预设、世界书、角色定义、消息等）
2. **提示词模板扩展**处理所有 `<% ... %>` 语句块
3. 将处理后的提示词发送给 LLM
4. 接收 LLM 输出，渲染到消息中
5. 扩展对接收的内容进行处理（处理可见的 `<% ... %>` 语句块）

### 制作角色卡时的特殊设置

输入框上方有 `启用/禁用提示词模板和酒馆助手宏` 按钮：

- **制作时**：禁用——让 AI 看到原始 EJS 代码
- **测试/游玩时**：启用——让 AI 看到处理后的结果（如 `好感度: 10` 而不是 `好感度: {{format_message_variable::络络.好感度}}`）

---

## 核心原理：动态发送提示词

传统角色卡中，AI 每次都会读取你提供的全部信息，但它怎么分配注意力是不可控的，很容易混淆不同情境下的设定。

比如你写了 100 字现代背景 + 300 字古代背景，设想是穿越后才用古代背景。但 AI 可能仅因为古代背景篇幅更长，就错误地将其作为当前主要设定。

**解决方案：让 AI 在特定条件下"看"不到暂时无关的设定。**

当好感度较低时，只发送：

```text
【络络现在非常拘谨，不太愿意与人交流】
```

好感度升高后，改为发送：

```text
【络络对你非常信任，像个话痨一样说个不停】
```

AI 只收到当前阶段的描述，就不会混淆两种状态。

为了更平滑的过渡，可以设计多个阶段：

```text
好感度 0~40 时发送：【络络非常拘谨。随着好感提升可能愿意交谈】
好感度 40~80 时发送：【络络已经能和你简单交流。好感提升后可能主动开玩笑】
好感度 80~100 时发送：【络络对你非常话痨，愿意分享小秘密】
```

这就是用 EJS 选择性发送提示词的核心思路。

---

## 基础语法

### 标签类型

| 标签 | 作用 | 说明 |
| --- | --- | --- |
| `<% 代码 %>` | 执行代码 | 不输出内容，可能产生空白行 |
| `<%_ 代码 _%>` | 执行代码（推荐） | 不输出内容，自动去除空白 |
| `<%= 表达式 %>` | 输出值 | HTML 转义后输出（渲染时格式化） |
| `<%- 表达式 %>` | 输出值（原样） | 不转义，原样输出 HTML |
| `<%# 注释 %>` | 注释 | 不会被处理 |

**推荐使用 `<%_ _%>` 执行代码，避免多余换行。**

### 区分代码与文本

`<%_ _%>` 是 EJS 的"特殊括号"。被它包裹的内容是代码指令，括号外面的是普通提示词文本：

```javascript
<%_ if (getvar('stat_data.角色.络络.好感度') < 30) { _%>
这里是好感度小于30时发送的提示词（普通文本）
<%_ } _%>
```

---

## 用 if 条件控制发送什么提示词

### 基本结构

```javascript
<%_ if (条件) { _%>
条件成立时发送的提示词
<%_ } _%>
```

### if / else

```javascript
<%_ if (条件) { _%>
条件成立时发送的提示词
<%_ } else { _%>
条件不成立时发送的提示词
<%_ } _%>
```

### if / else if / else

```javascript
<%_ if (getvar('stat_data.角色.络络.好感度') < 30) { _%>
【络络对你态度平淡，甚至有些冷漠】
<%_ } else if (getvar('stat_data.角色.络络.好感度') < 60) { _%>
【络络对你抱有好感，但仍保持着一些距离】
<%_ } else { _%>
【络络现在非常信任你，愿意和你分享她的小秘密】
<%_ } _%>
```

逻辑按顺序执行：

1. 先检查 `if`——成立则发送第一段，整个逻辑块结束
2. 不成立则检查 `else if`——成立则发送第二段，整个逻辑块结束
3. 都不成立则执行 `else`——发送最后那段

### 文本相等判断

用 `===` 判断是否相等：

```javascript
<%_ if (getvar('stat_data.事件.天气') === '晴天') { _%>
【今天阳光明媚，适合出门散步】
<%_ } else if (getvar('stat_data.事件.天气') === '雨天') { _%>
【外面下着雨，记得带伞】
<%_ } else { _%>
【今天天气一般】
<%_ } _%>
```

---

## 用 getvar 获取变量

`getvar('变量路径')` 获取变量路径下的值。变量路径和 `{{format_message_variable::变量路径}}` 宏中的路径写法一样。

### 基本用法

```javascript
/* 数值比较 */
getvar('stat_data.角色.络络.好感度') < 30

/* 文本相等 */
getvar('stat_data.事件.天气') === '晴天'
```

### 变量不存在的处理

```javascript
/* 判断变量是否存在 */
getvar('stat_data.角色.络络.好感度') !== undefined

/* 变量不存在时使用默认值 */
getvar('stat_data.角色.络络.好感度', { defaults: 0 })
```

### 完整示例

```javascript
<%_ if (getvar('stat_data.角色.络络.好感度') < 30) { _%>
这里是当络络的好感度小于30时，AI看到的专属描述
<%_ } _%>
```

---

## 用 print 和 getwi 组织提示词

### 用 print() 在代码内输出

将整个内容放在代码块中，用 `print()` 输出提示词，比频繁切换 `<%_ _%>` 和文本更清晰：

```javascript
<%_
if (getvar('stat_data.事件.天气') === '晴天') {
  print('【今天阳光明媚，适合出门散步】');
} else if (getvar('stat_data.事件.天气') === '雨天') {
  print('【外面下着雨，记得带伞】');
} else {
  print('【今天天气一般】');
}
_%>
```

### 用 getwi() 获取其他世界书条目

当不同条件对应大量提示词时，拆分为多个世界书条目，用 `getwi()` 按需加载：

```javascript
<%_
if (getvar('stat_data.事件.天气') === '晴天') {
  print(await getwi('天气-晴天'));
} else if (getvar('stat_data.事件.天气') === '雨天') {
  print(await getwi('天气-雨天'));
} else {
  print(await getwi('天气-一般'));
}
_%>
```

其中 `await getwi('天气-晴天')` 获取 `天气-晴天` 条目的内容，`print()` 将它输出。

**注意：** `getwi` 必须加 `await`。`print(await getwi('条目名'))` 和 `<%- await getwi('条目名') %>` 效果相同。

### getwi 的参数

```javascript
/* 自动推断当前世界书（推荐） */
await getwi('条目名')

/* 明确指定世界书 */
await getwi('世界书名', '条目名')

/* 传递数据给条目 */
await getwi('条目名', { key: value })
```

在递归调用时（条目 A 通过 getwi 加载条目 B，条目 B 再通过 getwi 加载条目 C），世界书名可以自动推断，只需传递条目名。

---

## 用 `<%= %>` 填入变量值

`<%= 表达式 %>` 将表达式的值直接填入提示词，类似宏但更灵活：

```javascript
/* 当前时间 */
<%= new Date(Date.now()).toISOString() %>

/* 随机整数 0~10 */
<%= _.random(0, 10) %>

/* 随机选择一个元素 */
<%= _.sample(['一', '二', '三']) %>

/* 按 YAML 展示变量 */
<%= YAML.stringify(getvar('stat_data'), { blockQuote: 'literal' }) %>

/* 按 JSON 展示变量 */
<%= JSON.stringify(getvar('stat_data')) %>
```

也可以筛选展示，比如列出好感度低于 30 的所有角色：

```javascript
当前好感度在 30 以下的人物:
<%=
  JSON.stringify(
    _(getvar('stat_data.角色'))
      .pickBy(角色 => 角色.好感度 < 30)
      .values()
      .value(),
  )
%>
```

---

## 更丰富的条件判断

代码能做的比你想象得多：

```javascript
/* 20% 概率发送提示词 */
<%_ if (_.random(0, 1, true) < 0.2) { _%>
要发送的提示词
<%_ } _%>

/* 5 楼以后才发送 */
<%_ if (TavernHelper.getLastMessageId() > 5) { _%>
要发送的提示词
<%_ } _%>

/* 现实时间 12 点以后才发送 */
<%_ if ((new Date).getHours() >= 12) { _%>
要发送的提示词
<%_ } _%>
```

### 用 matchChatMessages() 模拟绿灯

在最近聊天中提到关键字时发送提示词：

```javascript
<%_ if (matchChatMessages(['络络', '笨蛋'])) { _%>
最后 2 楼中提到了"络络"或"笨蛋"时发送的提示词
<%_ } _%>
```

调整扫描楼层数：

```javascript
/* 扫描最后 4 楼 */
<%_ if (matchChatMessages(['络络', '笨蛋'], { start: -4 })) { _%>
...
<%_ } _%>
```

支持正则表达式：

```javascript
<%_ if (matchChatMessages([/<thinking>.*<\/thinking>/s])) { _%>
最后 2 楼中有 <thinking> 块时发送的提示词
<%_ } _%>
```

---

## 验证和调试

### 提示词查看器

通过 `输入框左下角的魔棒 → 提示词查看器` 查看 EJS 处理后实际发送给 AI 的内容。

### alert 弹窗

```javascript
<%_
if (getvar('stat_data.事件.天气') === '晴天') {
  alert('触发了晴天提示词');
} else {
  alert(`什么都没触发, 天气值是: ${getvar('stat_data.事件.天气')}`);
}
_%>
```

### toastr 通知

```javascript
<%_
toastr.info('信息通知');
toastr.success('成功通知');
toastr.warning('警告通知');
toastr.error('错误通知');
_%>
```

### 控制台输出

```javascript
<%_
const value = getvar('stat_data.角色.属性', { defaults: 0 });
console.log('普通日志:', value);
console.info('信息:', value);       // 蓝色
console.warn('警告:', value);       // 黄色
console.error('错误:', value);      // 红色
_%>
```

按 `F12` → Console 标签查看。

### 断点调试

```javascript
<%_ debugger; _%>
```

按 `F12` 打开开发者工具后，执行到 `debugger;` 会暂停，可以查看所有变量。

---

## 变量系统

### 变量作用域

| 作用域 | 说明 | 持久化 | 使用场景 |
| --- | --- | --- | --- |
| `global` | 全局变量 | ✅ | 跨角色、跨对话共享 |
| `local` | 聊天变量 | ✅ | 当前聊天记录 |
| `message` | 消息变量 | ✅ | 绑定到具体消息 |
| `cache` | 临时变量 | ❌ | 临时计算（默认） |
| `initial` | 初始变量 | ❌ | 只读，来自 `[InitialVariables]` |

优先级（高到低）：消息变量（从最新到最旧）→ 局部变量 → 全局变量

所有合并后的变量存储在全局 `variables` 对象中。

### MVU ZOD 框架变量

MVU ZOD 将变量存储在 `stat_data` 路径下。**变量值直接存储**，不需要 `[0]` 索引：

```javascript
/* ✅ 正确 */
const value = getvar('stat_data.角色.好感度', { defaults: 0 });

/* ❌ 错误：缺少 stat_data 前缀 */
const value = getvar('角色.好感度');

/* ❌ 错误：不需要 [0] 索引 */
const value = getvar('stat_data.角色.好感度[0]');
```

### getvar() - 读取变量

```javascript
getvar(key, options)
```

| 参数 | 说明 |
| --- | --- |
| `key` | 变量路径（字符串），null 获取整个变量树 |
| `options.scope` | 指定作用域（`'global'`/`'local'`/`'message'`/`'cache'`/`'initial'`） |
| `options.defaults` | 默认值（变量不存在时返回） |
| `options.noCache` | 禁用缓存（用于读取刚设置的变量） |

```javascript
/* 读取 MVU ZOD 变量 */
const value = getvar('stat_data.白娅.依存度', { defaults: 0 });

/* 指定作用域 */
const name = getvar('用户名', { scope: 'local', defaults: '未知' });
```

特化版本：`getLocalVar()`、`getGlobalVar()`、`getMessageVar()`

### setvar() - 设置变量

```javascript
setvar(key, value, options)
```

| 参数 | 说明 |
| --- | --- |
| `key` | 变量名，null 替换整个变量树 |
| `value` | 变量值 |
| `options.scope` | 作用域（默认 `'message'`） |
| `options.flags` | 设置条件 |

**flags 标志：**

| 标志 | 说明 |
| --- | --- |
| `n` | 直接设置（默认） |
| `nx` | 不存在时才设置（基于 cache） |
| `xx` | 存在时才设置（基于 cache） |
| `nxs` | 不存在时才设置（基于指定 scope） |
| `xxs` | 存在时才设置（基于指定 scope） |

```javascript
/* 设置到 local 作用域 */
setvar('计数器', 1, { scope: 'local' });

/* 仅当变量不存在时设置 */
setvar('初始化标记', true, { scope: 'local', flags: 'nx' });

/* 快捷写法 */
setvar('a', 1, 'nx');        // flags 快捷
setvar('a', 1, 'global');    // scope 快捷
```

特化版本：`setLocalVar()`、`setGlobalVar()`、`setMessageVar()`

### incvar() / decvar() - 增减变量

```javascript
incvar(key, value, options)  // 增加
decvar(key, value, options)  // 减少
```

```javascript
/* 好感度 +5，限制在 [0, 100] */
incvar('好感度', 5, { scope: 'local', min: 0, max: 100 });

/* 金币 -100，不低于 0 */
decvar('金币', 100, { scope: 'local', min: 0 });
```

特化版本：`incLocalVar()`、`incGlobalVar()`、`incMessageVar()`、`decLocalVar()`、`decGlobalVar()`、`decMessageVar()`

### delvar() - 删除变量

```javascript
/* 删除整个变量 */
delvar('变量名');

/* 删除对象的某个属性 */
delvar('变量名', '属性名');

/* 删除数组的某个索引 */
delvar('变量名', 0);
```

### insvar() - 插入元素

```javascript
/* 向对象插入新键 */
insvar('对象变量', '新值', '新键名');

/* 向数组末尾追加 */
insvar('数组变量', '新元素');

/* 向数组指定位置插入 */
insvar('数组变量', '新元素', 2);
```

### define() - 定义全局变量/函数

```javascript
define('myHelper', function() {
  return this.getvar('stat_data.角色.好感度', { defaults: 0 });
});
```

**注意：** 定义函数时必须使用 `function` 语句，访问变量和函数时必须用 `this`（如 `this.getvar`、`this.setvar`）。

### JSON Patch 操作

```javascript
/* 对变量应用 JSON Patch */
patchVariables('stat_data', [
  { op: 'replace', path: '/角色/好感度', value: 50 },
  { op: 'add', path: '/角色/新属性', value: '值' },
]);

/* 底层函数：对任意对象应用 JSON Patch */
const result = jsonPatch(原始对象, [
  { op: 'replace', path: '/path', value: '新值' },
]);
```

### 宽松 JSON 解析

```javascript
/* 能解析 LLM 输出的格式错误的 JSON */
const obj = parseJSON('{ key: "value", }');  // 尾逗号也能解析
```

---

## 世界书操作

### getwi() - 读取条目内容

```javascript
/* 自动推断世界书 */
await getwi('条目名')

/* 指定世界书 */
await getwi('世界书名', '条目名')

/* 传递数据 */
await getwi('条目名', { key: value })

/* 支持正则匹配条目名 */
await getwi(/角色_\d+/)

/* 支持 UID */
await getwi(12345)
```

### activewi() - 激活条目

让酒馆原生处理条目（遵循绿灯关键词、向量化、组等所有特性）：

```javascript
/* 自动推断世界书 */
await activewi('条目名')

/* 强制激活（无视关键词检测） */
await activewi('条目名', true)

/* 指定世界书 */
await activewi('世界书名', '条目名', true)
```

**必须在 `[GENERATE:BEFORE]` 或 `@@generate_before` 条目中使用**，否则只能在下次生成时生效。

自动将禁用条目视为启用状态（不修改世界书本身）。

### getchar() - 读取角色卡定义

```javascript
const charDef = await getchar();            // 当前角色卡
const charDef = await getchar('角色名');    // 指定角色卡
```

### getpreset() - 读取预设提示词

```javascript
const prompt = await getpreset('提示词名');
```

### getqr() - 读取快速回复

```javascript
const content = await getqr('快速回复集名', '条目名');
```

### 获取原始数据

```javascript
/* 角色卡原始数据 */
const charData = await getCharData();

/* 世界书所有条目 */
const entries = await getWorldInfoData('世界书名');

/* 快速回复数据 */
const qrData = getQuickReplyData('快速回复集名');

/* 当前已启用的所有世界书条目 */
const allEntries = await getEnabledWorldInfoEntries();
```

---

## 装饰器

在世界书条目**内容开头**用 `@@` 前缀添加装饰器。每行一个，多个装饰器间不能有空行。

### 可用装饰器

| 装饰器 | 作用 |
| --- | --- |
| `@@activate` | 视为🔵永久激活条目 |
| `@@dont_activate` | 完全禁止激活（即使 `activewi` 也不行） |
| `@@generate_before` | 注入到发送给 LLM 的提示词开头 |
| `@@generate_after` | 注入到发送给 LLM 的提示词末尾 |
| `@@render_before` | 渲染到消息开头（不发送给 LLM） |
| `@@render_after` | 渲染到消息末尾（不发送给 LLM） |
| `@@preprocessing` | 在酒馆处理世界书**之前**执行（用于动态激活绿灯） |
| `@@initial_variables` | 将内容视为初始变量 |
| `@@always_enabled` | 强制启用特殊条目 |
| `@@only_preload` | 只在立即加载阶段启用 |
| `@@dont_preload` | 不在立即加载阶段处理 |
| `@@private` | 自动包裹 `<% { %>` 和 `<% } %>`，避免变量重复声明 |
| `@@if 条件` | 条件为 false 时排除此条目 |
| `@@iframe` | 创建 iframe 包裹，避免样式污染 |
| `@@message_formatting` | 输出为 HTML（仅限 RENDER 模式） |

### @@preprocessing 实战

**用途：** 在世界书处理前执行代码，动态生成关键词激活其他条目。

**要求：** SillyTavern 1.13.4+

```javascript
@@preprocessing
<%_ if (getvar('stat_data.事件.天气') === '晴天') { _%>
晴天关键词
<%_ } _%>
```

处理后条目内容变为 `晴天关键词`，可以正确激活绿灯条目。

### @@if 简洁条件

不想写一大堆 `<% ... %>` 时的简便写法：

```
@@if variables.哈基米.好感度 >= 90
哈基米很喜欢{{user}}
```

```
@@if variables.哈基米.好感度 > 50 && variables.哈基米.好感度 < 90
哈基米认为{{user}}是朋友
```

条件可以是任意 JavaScript 代码，但只能单行。

### @@iframe 创建隔离界面

```
@@render_after
@@iframe
@@if !is_user && !is_system
<html>
<head></head>
<body>
<div>
【哈基米】<br/>
好感度：<%- variables.哈基米.好感度 %>
</div>
</body>
</html>
```

在所有角色楼层末尾添加状态栏，样式不污染全局。

**折叠版：**

```
@@render_after
@@iframe 折叠状态栏（点击显示）
@@if !is_user && !is_system
<html>...内容...</html>
```

`@@iframe` 后面加标题文字会自动折叠。

---

## 内容注入

在世界书条目**标题（备忘）**中添加特殊前缀，将条目内容注入到指定位置：

| 前缀 | 注入位置 | 说明 |
| --- | --- | --- |
| `[GENERATE:BEFORE]` | 发送给 LLM 的提示词开头 | 仅限🔵 |
| `[GENERATE:AFTER]` | 发送给 LLM 的提示词末尾 | 🔵和🟢 |
| `[RENDER:BEFORE]` | 接收的 LLM 输出开头 | 仅用于渲染 |
| `[RENDER:AFTER]` | 接收的 LLM 输出末尾 | 仅用于渲染 |
| `[GENERATE:{idx}:BEFORE]` | 第 idx 条消息的开头 | idx 从 0 开始 |
| `[GENERATE:{idx}:AFTER]` | 第 idx 条消息的末尾 | idx 从 0 开始 |
| `[GENERATE:REGEX:模式]` | 匹配消息内容时注入 | 正则匹配 |
| `[InitialVariables]` | 初始变量 | 必须是标准 JSON |

`[RENDER:BEFORE]` 和 `[RENDER:AFTER]` 仅用于渲染，不会发送到 LLM。

### 正则表达式匹配注入

```
世界书条目标题: [GENERATE:REGEX:你好]
世界书条目内容:
检测到问候语！当前消息: <%- matched_message %>
消息索引: <%- matched_message_index %>
```

可用变量：`matched_message`（匹配的消息内容）、`matched_message_index`（索引）、`matched_message_role`（角色）

---

## Prompt 注入（@INJECT）

**⚠️ 条目必须设置为禁用状态才会生效。**

`@INJECT` 功能将提示词以独立的 `{role, content}` 消息直接插入到 Prompt 中，比世界书条目（被合并成一条 System 消息）更精确。

### 三种插入模式

**1. 绝对位置（pos）：**

```
@INJECT pos=1,role=system          // 在第1条消息位置插入
@INJECT pos=-1,role=user           // 在最后一条消息位置插入
```

**2. 目标消息（target）：**

```
@INJECT target=user,index=1,at=before,role=system     // 在第一条用户消息前
@INJECT target=assistant,index=-1,at=after,role=user   // 在最后一条助手消息后
```

**3. 正则匹配（regex）：**

```
@INJECT regex=你好,at=before,role=system        // 在包含"你好"的消息前
@INJECT regex="^用户.*",at=after,role=assistant  // 在以"用户"开头的消息后
```

### 排序和优先级

1. 按插入位置从后往前执行
2. 相同位置按世界书顺序参数排序
3. 类型优先级：`pos` > `target` > `regex`

### 提示词后处理注意事项

不同 API 对消息格式有不同要求：

| API | 格式要求 |
| --- | --- |
| ChatGPT | system 通常放最前面一条，不要求严格交替 |
| Gemini | 独立 systemInstruction，user/model 严格交替 |
| Claude | user/assistant 严格交替，system 可在任何位置 |
| Deepseek | user/assistant 建议交替，最后必须是 user |

**⚠️ 请保证 system 消息在开头！**

---

## 提示词注入（injectPrompt）

通过标签键实现依赖倒置，在世界书中定义提示词片段，在预设中导入使用：

**世界书中定义：**

```javascript
<%
injectPrompt("CoT", `
# 好感度
Q: <char>的好感度是多少？
Q: 接下来的生成将会导致好感度发生什么变化？
Q: 变化后的好感度是多少？
`)
%>
```

**预设中使用：**

```javascript
按照以下<thinking>步骤进行思考。
<thinking>
<%- getPromptsInjected("CoT") %>
</thinking>
```

**效果：** 世界书的 CoT 被精确注入到预设的 `<thinking>` 区块中，LLM 的注意力更集中。

相关函数：

- `injectPrompt(key, prompt, order, sticky, uid)` - 注入提示词
- `getPromptsInjected(key, postprocess)` - 读取已注入的提示词
- `hasPromptsInjected(key)` - 检查是否存在

---

## 激活正则

通过 `activateRegex()` 临时创建正则表达式处理内容：

### 酒馆正则（仅生成时）

```javascript
<%
    /* 隐藏楼层里的深度思考内容 */
    activateRegex(/<think>[\s\S]*?<\/think>/gi, "");
%>
```

### 预处理正则（生成和渲染都生效）

```javascript
<%
    /* 自定义宏 {{getvars::...}} */
    activateRegex(/\{\{getvars::([a-zA-Z0-9_]+?)\}\}/gi, function(match, varName) {
        return this.getvar(varName);
    }, {
        generate: true
    });
%>
```

### 楼层 HTML 正则

```javascript
<%_
    /* 替换图床链接为反代 */
    activateRegex(
        /files\.catbox\.moe/gi,
        'catbox.xxx.net',
        {
            message: true,
            html: true
        }
    );
_%>
```

---

## 多阶段人设系统实战

### 设计思路

根据变量动态加载不同的角色设定，实现角色成长和关系变化。

**结构：**

```
世界书/
├── 角色_控制器 (✅蓝灯永久激活)
├── 角色_阶段01   (❌禁用)
├── 角色_阶段02   (❌禁用)
├── 角色_阶段03   (❌禁用)
└── ...
```

- **控制器条目**：蓝灯永久激活，负责读取变量并调用对应阶段
- **阶段条目**：禁用，由控制器通过 `getwi()` 动态加载

### 模板1：单变量多阶段控制器

```javascript
<%_
if (typeof goodwill === 'undefined') var goodwill = getvar('stat_data.关系系统.好感度', { defaults: 0 });
if (typeof relationship === 'undefined') var relationship = getvar('stat_data.关系系统.关系状态', { defaults: '陌生人' });
_%>

<%_ if (goodwill < 26) { _%>
<%- await getwi('美玲_阶段01_陌生接触期') %>
<%_ } else if (goodwill < 51) { _%>
<%- await getwi('美玲_阶段02_暧昧拉扯期') %>
<%_ } else if (goodwill < 76) { _%>
<%- await getwi('美玲_阶段03_告白前夜期') %>
<%_ } else if (relationship === '恋人') { _%>
<%- await getwi('美玲_阶段04_恋人阶段') %>
<%- await getwi('美玲_NSFW档案') %>
<%_ } else { _%>
<%- await getwi('美玲_阶段03_告白前夜期') %>
<%_ } _%>
```

### 模板2：@@preprocessing 激活绿灯型

```javascript
@@preprocessing
<%_
if (typeof currentDate === 'undefined') var currentDate = getvar('stat_data.世界信息.当前日期', { defaults: '' });
_%>

<%_ if (currentDate.includes('10月25日') || currentDate.includes('10月27日')) { _%>
学园祭活动
<%_ } else if (currentDate.includes('12月24日') || currentDate.includes('12月25日')) { _%>
圣诞活动
<%_ } _%>
```

### 模板3：纯代码块 + print

```javascript
<%_
if (typeof value === 'undefined') var value = getvar('stat_data.角色.属性', { defaults: 0 });

if (value > 50) {
  print(await getwi('条目名'));
}
_%>
```

### 条目配置

| 条目类型 | 激活方式 | 顺序 |
| --- | --- | --- |
| 控制器（有 getwi/activewi） | 蓝灯永久激活 | 100 |
| 被加载的阶段条目 | 禁用 | 98-800 |
| 动态关键词控制器（@@preprocessing） | 蓝灯永久激活 | 100 |
| 被关键词激活的条目 | 绿灯 | 根据需求 |

### 防重复声明

多个条目可能使用同名变量，用 `typeof` 检查避免重复声明：

```javascript
/* ✅ 推荐写法 */
if (typeof xialiAo === 'undefined') var xialiAo = getvar('stat_data.傲娇系统.傲', { defaults: 100 });

/* ✅ 使用角色名前缀避免冲突 */
if (typeof xialiRelation === 'undefined') var xialiRelation = getvar('stat_data.世界信息.关系状态', { defaults: '同学' });
```

---

## 内置常量

### 始终可用

```javascript
variables         // 合并后的所有变量
SillyTavern       // SillyTavern.getContext() 返回内容
faker             // Faker 库（faker.fakerEN, faker.fakerCN）
_                 // Lodash 库
$                 // jQuery 库
toastr            // toastr 通知库
runType           // 'generate' | 'preparation' | 'render' | 'render_permanent'
charLoreBook      // 角色卡世界书名
userLoreBook      // 用户角色世界书名
chatLoreBook      // 聊天世界书名
userName          // 用户角色名
charName          // 角色卡角色名
chatId            // 聊天会话 ID
characterId       // 角色卡 ID
groupId           // 群聊 ID（null 表示非群聊）
charAvatar        // 角色卡头像 URL
userAvatar        // 用户头像 URL
lastUserMessageId // 最新用户消息楼层 ID
lastCharMessageId // 最新角色消息楼层 ID
lastUserMessage   // 最后一条用户消息内容
lastCharMessage   // 最后一条角色消息内容
lastMessageId     // 最后一条消息 ID
model             // 当前选择的模型
generateType      // 当前生成类型：'' | 'normal' | 'continue' | 'regenerate' | 'swipe' | 'quiet' 等
```

### 仅在渲染时（runType === 'render'）

```javascript
message_id        // 消息楼层号
swipe_id          // 消息页码 ID
name              // 消息角色名
is_last           // 是否为最后一条
is_user           // 是否为用户消息
is_system         // 是否为系统消息
```

### 仅在 GENERATE 时

```javascript
world_info        // 当前处理的世界书条目对象
generateBuffer    // 当前已处理的上文内容
generateData      // 当前生成内容（未经模板处理）
```

---

## 内置函数速查

### 变量操作

```javascript
getvar(key, options)           // 读取变量
setvar(key, value, options)    // 设置变量
incvar(key, value, options)    // 增加变量
decvar(key, value, options)    // 减少变量
delvar(key, index, options)    // 删除变量
insvar(key, value, index, options)  // 插入元素
define(name, value, merge)     // 定义全局变量/函数
patchVariables(key, changes, options)  // 应用 JSON Patch
```

### 世界书操作

```javascript
await getwi(title, data)                    // 读取条目内容
await getwi(lorebook, title, data)
await activewi(title, force)                // 激活条目
await activewi(lorebook, title, force)
await activateWorldInfoByKeywords(keywords)  // 通过关键字激活
await getEnabledWorldInfoEntries()           // 获取所有启用的条目
```

### 角色/预设/快速回复

```javascript
await getchar(name, template, data)    // 读取角色卡定义
await getCharData(name)                // 读取角色卡原始数据
await getpreset(name, data)            // 读取预设提示词
await getqr(name, label, data)         // 读取快速回复
```

### 聊天消息

```javascript
getChatMessage(idx, role)              // 获取指定楼层消息
getChatMessages(count)                 // 获取指定数量的消息
getChatMessages(start, end, role)      // 获取范围内消息
matchChatMessages(pattern, options)    // 搜索匹配消息
```

### 输出和注入

```javascript
print(...args)                                    // 输出文本
injectPrompt(key, prompt, order, sticky, uid)     // 注入提示词
getPromptsInjected(key, postprocess)              // 读取注入的提示词
hasPromptsInjected(key)                           // 检查是否存在注入
```

### 正则和模板

```javascript
activateRegex(pattern, replace, opts)    // 激活临时正则
await evalTemplate(content, data, options)  // 处理模板语法
await getSyntaxErrorInfo(code, max_lines)   // 检查语法错误
```

### 工具函数

```javascript
parseJSON(text)                   // 宽松 JSON 解析
jsonPatch(dest, changes)          // 应用 JSON Patch
await execute(cmd)                // 执行 SillyTavern 命令
```

---

## 常见问题

### Q1: 变量读取路径怎么写？

- **EJS/状态栏中**：`getvar('stat_data.角色.属性')`
- **`{{format_message_variable::...}}` 宏中**：`{{format_message_variable::stat_data.角色.属性}}`
- **AI 的 JSON Patch 路径中**：`/角色/属性`（不需要 `stat_data`）

### Q2: getwi 必须加 await 吗？

是的。`<%- getwi('条目') %>` ❌，`<%- await getwi('条目') %>` ✅

### Q3: 变量重复声明怎么办？

```javascript
/* ✅ typeof 检查 + var */
if (typeof value === 'undefined') var value = getvar('stat_data.角色.属性', { defaults: 0 });
```

或者使用 `@@private` 装饰器自动包裹作用域。

### Q4: @@preprocessing 能和其他装饰器一起用吗？

- `@@preprocessing` + `@@generate_before`/`@@generate_after`：**不要同时使用**，preprocessing 会被忽略
- `@@generate_before` + `@@generate_after`：**可以同时使用**

### Q5: 条目不执行怎么排查？

1. 控制器条目必须**启用**（蓝灯永久激活）
2. 检查关键词或激活方式是否正确
3. 装饰器格式是否正确（中间不能有空行）
4. 在条目中加 `<%_ console.info('条目已执行'); _%>` 确认

### Q6: 楼层渲染和生成有什么不同？

- **生成时**：处理发送给 LLM 的提示词，`<% ... %>` 被执行后替换
- **渲染时**：处理楼层 HTML，`<%=` 会格式化输出，`<%-` 原样输出 HTML
- 渲染不会修改原始消息内容，只修改显示的 HTML
- 需要正则隐藏楼层中的 `<% ... %>`，避免发送给 LLM 时重复执行

### Q7: 范围转义怎么用？

在 `<#escape-ejs>...<#/escape-ejs>` 内的 `<%` 和 `%>` 会被自动转义，不执行：

```html
<%= 'line 1' %>
<#escape-ejs>
<%= 'line 2' %>    <!-- 不执行，原样输出 -->
<#/escape-ejs>
<%= 'line 3' %>
```

### Q8: 让 AI 帮我写 EJS 代码需要什么？

- 在 EJS 代码中可用 `TavernHelper` 访问酒馆助手的功能
- 也可以直接访问提示词模板的功能如 `getvar`
- 建议将酒馆助手的 `@types` 文件夹和提示词模板的 reference_cn.md 发给 AI

---

## 参考资源

- **EJS 语法参考**：<https://ejs.co/>
- **提示词模板官方文档**：<https://github.com/zonde306/ST-Prompt-Template/blob/main/README_CN.md>
- **提示词模板 API 参考**：<https://github.com/zonde306/ST-Prompt-Template/blob/main/docs/reference_cn.md>
- **酒馆助手功能文档**：<https://n0vi028.github.io/JS-Slash-Runner-Doc/>
- **MVU ZOD 指南**：[MVU_ZOD指南.md](../MVU%20ZOD/MVU_ZOD指南.md)

---

**整理者：秋青子**
适用场景：SillyTavern + 提示词模板扩展
