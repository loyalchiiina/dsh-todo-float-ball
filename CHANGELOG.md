# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.0] - 2026-09-07

### Fixed

- **Data layer rebuilt on the official `sessions` service** (the root fix):
  - previous versions tapped `window.fetch`/`WebSocket`, but DSH Desktop's
    connection runs through the shell's `__DSH_TRANSPORT__` (Electron
    `net.fetch` + renderer access header) — page-level taps never saw a
    single frame, so the ball only ever showed collapsed-panel skeleton
    placeholders and never followed session switches;
  - now the plugin injects the official `sessions` service (provided by
    `dsh-client-runtime`) and reads its list snapshot directly: every
    session's `projectionValues.todos` and `displayTitle`, plus the current
    session id and a subscribe() — zero interception, host-computed data;
  - session switching now follows instantly (the snapshot's `current` field
    is the authoritative active-session signal);
  - pinned conversations read real per-session projection data instead of
    guesses;
  - the DOM observer remains as a fallback only when the sessions service
    is unavailable; collapsed-count skeletons are now clearly marked and
    never overwrite real data.
- Requires `dsh.client.inject: ["@deepseek-ai/dsh-client-runtime"]` — a
  host restart is needed when upgrading from <= 0.2.0.

## [0.2.0] - 2026-09-07

### Added

- **Multi-session monitoring**:
  - the ball now follows the active conversation automatically — every
    projection frame carries `sessionId`, and the most recently seen session
    wins (title frames update session awareness too, so even conversations
    without todos reset the ball correctly);
  - conversations can be **pinned** from the panel (📌 button): pinned lists
    keep monitoring across session switches, are listed in a "pinned"
    section with live status dots (orange pulse = in progress, green = all
    done), expand inline to show the full list, and can be unpinned;
  - the pinned list persists in `localStorage`; conversation titles come
    from the `title` projection frames;
  - when the current session has no todos but a pinned one is running, the
    ball surfaces a "📌 in progress" hint instead of going fully idle.
- Panel header now shows the current conversation's title.

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
