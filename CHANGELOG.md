# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-09-06

### Added

- Persistent draggable floating ball showing the current session's `todo_write`
  progress (`done/total` + active task content).
- Click-to-toggle task panel with per-status colored items
  (✓ completed / ▶ in progress / ○ pending) and `Esc` to fold.
- Dual-channel data sync:
  - `MutationObserver` over the official todo panel (`[data-testid="todo-panel"]`),
    including localized count-label parsing for the collapsed state;
  - passive projection-frame inspection via wrapped `window.fetch` and
    `WebSocket.prototype.onmessage`.
- Shadow DOM style isolation (`all:initial`).
- Position persistence with viewport clamping; Electron-safe mount on `<html>`.
- Loopback-only host health route `/dsh-todo-float-ball/health`.
