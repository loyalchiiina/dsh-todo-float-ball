# dsh-todo-float-ball

**把 AI 干活的任务清单常驻挂在一个悬浮球上 —— DeepSeek Harness（DSH）进度悬浮球插件。**

[English](README.md) | 简体中文

## 这是什么？

DSH 里的 AI 在推进多步骤任务时，会用内置的 `todo_write` 工具记录任务清单。官方界面把这份清单渲染成输入框上方的一条进度条——但它很容易被忽略、会随着对话滚动走远、而且 AI 还在干活时它默认是折叠的。

**dsh-todo-float-ball** 把这份清单镜像到一个小的、常驻的、可拖动的悬浮球上：

- 悬浮球始终固定在窗口角落（默认右下角）；
- 球面实时显示进度：`完成数/总数`，下方滚动显示当前进行中的任务名；
- 点击展开完整任务面板，再点一下（或按 `Esc`）收起；
- 颜色一眼看状态：橙色脉动 = 正在干活，绿色 = 全部完成，蓝色 = 只有待办，灰色 = 暂无清单。

它是一个纯只读的伴生插件：不修改官方面板、不改对话流、不碰任何其他插件的实现。

## 功能清单

| 功能 | 说明 |
|---|---|
| 常驻悬浮球 | 始终在视口内可见，可拖到任意位置，位置存 `localStorage` 重启后恢复（保存了越界旧位置会自动拉回视口内，防"球丢了"） |
| 实时进度 | 球面显示 `完成数/总数` + 当前第一个进行中任务的内容（超长截断），随 `todo_write` 实时刷新 |
| 折叠/展开 | 点球切换任务面板；面板在球旁边弹出，靠边时自动翻到另一侧 |
| 状态颜色 | 每项带状态图标与配色：✓ 已完成（绿色+删除线）、▶ 进行中（橙色）、○ 待办（灰色虚线圈）；球本身：橙色脉动/绿/蓝/灰 |
| 数据双路同步 | 主路：`MutationObserver` 监听官方 todo 面板 DOM；辅路：包装 `fetch` 与 `WebSocket.onmessage`，被动捕获会话投影帧 `{type:"projection", key:"todos", ...}`——**官方面板折叠时也能拿到完整清单** |
| Shadow DOM 样式隔离 | 全部 UI 在 open Shadow DOM 内并加 `all:initial`——样式不进不出，主题/皮肤插件互不干扰 |
| 双端可用 | DSH Desktop 桌面端（Electron 窗口）与网页端（浏览器）同一份代码通用；UI 挂载在 `<html>` 根节点，规避 `transform` 导致的 `position:fixed` 失效 |
| 隐私友好 | 零遥测、零数据上传。宿主端只注册一个仅限本机回环访问的健康检查路由（`/dsh-todo-float-ball/health`） |
| **纪律注入（v0.9.0）** | 宿主端向**每次会话的系统提示**注入 5 条最硬的 todo 纪律（约 340 字，`order=190`）——**装上插件即生效，无需加载任何技能**；可用 `injectDiscipline: false` 关闭 |

## 纪律注入（v0.9.0）

DSH 的技能是**按需加载**的：一个会话若从未加载 `todo-show-discipline` 技能，就完全不带 todo 纪律。v0.9.0 起，宿主端会向每次会话的系统提示注入一段稳定的「todo 纪律」段落，因此**装上插件就等于纪律常驻**——与技能是否加载、用哪个预设、桌面端还是网页端都无关。

- 默认**开启**（不写 `config` 即为开）。
- 关闭：在 `cordis.patch.yml`（或 profile 的 patch 层）给本插件加 `config: { injectDiscipline: false }`，**重启 DSH 生效**。
- 只有**显式布尔 `false`** 才关闭；`"false"` / `0` / 拼错 / 缺 `config` 一律保持开启（防误关）。
- 注入文本刻意精简（系统提示每会话都占 token），完整规则仍留在 `todo-show-discipline` 技能里；该技能在装了本插件后默认不再随会话加载（`disable-model-invocation: true`）以避免重复占 token，未装本插件时可恢复启用。

## 安装

本插件是标准 DSH npm 包（自带 `dsh.bundle` 声明）。两种方式：

### 从 npm 安装（发布后）

```bash
npm install dsh-todo-float-ball
```

然后在你所用 profile 的 `package.json`（如 `%USERPROFILE%\.dsh\profiles\desktop\package.json`）里，把 `"dsh-todo-float-ball"` 同时加进 `dependencies` 和 `dsh.profile.bundles`，重启 DSH 生效。

### 手动安装

把本包目录整体复制进 profile 的 `node_modules`（必须是真实目录复制——**不要**用 `link:` / `file:` 依赖，会触发 DSH 安装恢复死循环），按上面同样方式注册后重启。

重启后右下角应出现悬浮球。可用下面的地址验证宿主端已挂载：

```
http://127.0.0.1:43120/dsh-todo-float-ball/health
→ {"ok":true,"plugin":"dsh-todo-float-ball","version":"0.1.0"}
```

## 实现原理

官方的 todo 数据是一条**会话投影（session projection）**：

1. `@deepseek-ai/dsh-tool-todo` 注册 `todo_write` 工具，并在 `sessionProjections` 上登记 `todos` 投影单元；每次调用向会话日志追加一条 `todo/write` 快照；
2. `@deepseek-ai/dsh-client-connection` 把当前值以控制帧广播：`{type:"projection", sessionId, key:"todos", value:[{content,status}...]}`；
3. `@deepseek-ai/dsh-client-ui-conversation` 把它渲染成输入框上方的任务条（`[data-testid="todo-panel"]`）。

本插件在两端各挂一个只读探针，不碰任何一端：

- **主路（DOM）**：一个带 200ms 防抖的 `MutationObserver` 盯着 `[data-testid="todo-panel"]`——面板展开时读 `li[data-status]` 全量清单；折叠时解析本地化的计数文案（如"1 完成 · 2 进行中"，含中文数字解析）。
- **辅路（传输层）**：一次性、防御式的 `window.fetch` 包装（clone 响应、只处理文本/JSON）与 `WebSocket.prototype.onmessage` 包装（文本帧），把每个载荷送进严格的提取器——只对形如投影帧、`todo/write` 事件、`{todos:[...]}` 快照的对象起反应，其余一律忽略，绝不回写。

所有通道汇入同一个归一化器：过滤出三种合法状态、丢弃空内容、列表无变化时零开销跳过（签名比对）。

## 常见问题

**悬浮球不出现？**
先开上面的 health 地址：能返回说明宿主端正常，是客户端 bundle 没加载（查 DSH 日志有无 `loaded without registering`，bundle id 必须与包名一致）；不能返回说明插件没进 profile 的 bundles 列表。

**能移动悬浮球吗？**
能，拖到哪都行。位置按浏览器/渲染进程分别记忆；万一保存的位置跑到屏幕外，启动时会自动拉回视口内。

**官方面板折叠时也能同步吗？**
能。这正是辅路存在的意义：官方面板折叠时只渲染计数文案，而投影帧始终携带完整清单。

**会拖慢界面吗？**
不会。观察器 200ms 防抖；传输层窃听先做 `"todos"` 字符串预筛再解析；兜底看门狗跑约 10 分钟后自动停止。

## 兼容性

- DSH Desktop 2.x（desktop profile）与 DSH web（web profile）
- 无 `peerDependencies`——插件自包含，只通过公开 DOM/HTTP 面与 DSH 交互

## License

MIT
