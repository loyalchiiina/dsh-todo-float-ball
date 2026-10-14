# dsh-todo-float-ball

> 悬浮任务球常驻屏幕显示实时待办，并在每一轮对话注入清单纪律。

> 完整文档以 [English README](./README.md) 为准，本页提供中文导读与关键信息速查。

## What it does · 一句话说明

本节内容详见 [English README](./README.md)。

## Why it matters · 为什么值得装

本节内容详见 [English README](./README.md)。

## Screenshots

本节内容详见 [English README](./README.md)。

## Basic usage · 基本用法

本节内容详见 [English README](./README.md)。

## 功能总览 · At a glance（中英对照 / Bilingual）

### 悬浮球 · Floating ball

| 中文 | English |
|---|---|
| 常驻可拖拽悬浮球（默认右下角），位置记忆跨重启恢复，越界自动拉回 | Persistent draggable ball, position remembered, off-screen clamped back |
| 球面实时 `完成数/总数` + 当前进行中任务名（截断） | Live `done/total` + active task name, updated in real time |
| 状态颜色：橙脉动=进行中 / 绿=完成 / 蓝=待办 / 灰=空清单 | Status colours: orange pulse / green / blue / gray |
| 每项带图标与配色：✓ 完成（绿+删除线）、▶ 进行中（橙）、○ 待办（灰虚线） | Per-item icons: ✓ done, ▶ in progress, ○ pending |

### 面板与数据 · Panel & data

| 中文 | English |
|---|---|
| 点球折叠/展开，靠屏幕边缘自动翻侧 | Click to fold/expand; flips sides near the edge |
| 双路数据同步：DOM 观察 + 会话投影帧解析——官方面板折叠时也有完整清单 | Dual-channel sync: DOM observer + projection frames — full list even when collapsed |
| Shadow DOM + `all:initial` 样式隔离 | Shadow DOM with `all:initial` isolation |
| 桌面端 + 网页端双端可用 | Works on Desktop and web |

### 历史与固定会话 · History & pinned sessions

| 中文 | English |
|---|---|
| 快照合并而非替换，旧任务进历史归档区 | Snapshots merge, older todos become a history archive |
| 行级 ✕ 隐藏、两个折叠行、🧹 批量清理、♻️ 一键恢复、📋 整行复制 | Per-row hide, fold rows, batch cleanup, one-click restore, full-text copy |
| 📌 固定会话共用同一渲染器，状态按会话独立 | Pinned sessions share the renderer, per-session state |
| ⇄ 上下堆叠 ⇄ 左右并排布局切换 | ⇄ stacked / side-by-side layout switch |

### 纪律注入 · Discipline injection

| 中文 | English |
|---|---|
| 向每次会话系统提示注入 todo 纪律（order=190）——装插件即生效 | Injects todo discipline into every session — works on install |
| 硬门：每轮首个工具调用必须是 todo_write（可用 `enforceFirstTodoWrite: false` 关闭） | Hard gate: first tool call per turn must be `todo_write` (toggle) |
| 只有显式布尔 `false` 才关闭 | Only explicit `false` disables it |

### 皮肤与隐私 · Skins & privacy

| 中文 | English |
|---|---|
| 三球共享 128 款皮肤（含经典旧皮肤） | Shares the 128-skin catalogue across the three balls |
| 零遥测、零上传，仅回环健康路由 | Zero telemetry, loopback-only health route |

## Features

本节内容详见 [English README](./README.md)。

## Pinned sessions & panel layout (v0.11.0)

本节内容详见 [English README](./README.md)。

## History & panel management (v0.10.0)

本节内容详见 [English README](./README.md)。

## Discipline injection (v0.9.0)

本节内容详见 [English README](./README.md)。

## Install

本节内容详见 [English README](./README.md)。

## How it works

本节内容详见 [English README](./README.md)。

## FAQ

本节内容详见 [English README](./README.md)。

## Compatibility

本节内容详见 [English README](./README.md)。

## License

MIT
