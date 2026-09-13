# dsh-todo-float-ball

**Keep your AI agent's task checklist always on screen — a floating progress ball for DeepSeek Harness (DSH).**

English | [简体中文](README.zh.md)

## What is this?

When an AI agent in DSH works on a multi-step task, it records its plan with the built-in `todo_write` tool. The official UI shows this plan in a small strip above the input box — but the strip is easy to miss, disappears into the conversation flow, and collapses while the agent is still working.

**dsh-todo-float-ball** mirrors that checklist onto a small, persistent, draggable floating ball:

- The ball sits in a corner of the window at all times (default: bottom-right).
- Its face shows live progress: `done/total`, with the active task's name underneath.
- Click it to expand a full task panel; click again (or press `Esc`) to fold it back.
- Color tells you the state at a glance: pulsing orange = work in progress, green = all done, blue = pending only, gray = no list yet.

It is a pure, read-only companion: the plugin never modifies the official panel, the conversation, or any other plugin.

## Features

| Feature | Detail |
|---|---|
| Persistent floating ball | Always visible in the viewport, draggable anywhere, position saved to `localStorage` and restored across restarts (off-screen stale positions are clamped back) |
| Live progress | `done/total` on the ball face plus the first active task's content (truncated), updated in real time |
| Fold / expand | Click the ball to toggle the task panel; the panel opens next to the ball and flips sides when near the screen edge |
| Status colors | Per-item icons and colors: ✓ completed (green, strikethrough), ▶ in progress (orange), ○ pending (dashed gray); ball itself: orange pulse / green / blue / idle gray |
| Dual-channel data sync | Channel A: `MutationObserver` over the official todo panel DOM. Channel B: passively inspects session projection frames (`{type:"projection", key:"todos", ...}`) via wrapped `fetch` and `WebSocket.onmessage`, so the full list is available even when the official strip is collapsed |
| Shadow DOM isolation | All UI lives inside an open Shadow DOM with `all:initial` — no style leaks in or out, immune to theme/skin plugins |
| Dual-end support | Works in DSH Desktop (Electron window) and the web UI (browser) with the same code, because both render the same page; the UI mounts on `<html>` to dodge `transform`-related `position:fixed` breakage |
| Privacy-friendly | Zero telemetry, zero data upload. The only host-side surface is a loopback-only health route (`/dsh-todo-float-ball/health`) |
| **Discipline injection (v0.9.0)** | The host injects 5 hardest todo rules (~340 chars, `order=190`) into the system prompt of **every session** — **works as soon as the plugin is installed, no skill needs to be loaded**; turn it off with `injectDiscipline: false` |
| **History archive & panel tools (v0.10.0)** | Merged snapshots no longer wipe older todos — they become a foldable history archive; per-row ✕ hide, two independent fold rows, 🧹 batch cleanup, ♻️ one-click restore, 📋 full-text copy; all counters reflect only the latest snapshot |
| **Pinned-panel parity & layout switch (v0.11.0)** | 📌 pinned sessions render through the *same* history renderer as the current view (folds, 🧹, ♻️, per-session state and per-session action scoping); the panel header gained a ⇄ button to flip between a stacked layout and a side-by-side layout (left = current list, right = pinned sessions) with per-column captions |

## Pinned sessions & panel layout (v0.11.0)

- **One renderer, two lists** — the current conversation and every pinned (📌)
  conversation are rendered by the same `historySectionHtml()` function: latest
  snapshot flat, then `▾ Completed history (N)` and
  `▸ Abandoned history tasks (M)`, each fold with its own 🧹, plus
  `🧹 Clear all history` and `♻️ Restore all hidden history`. Pinned panels got
  the last two rows for the first time in this release.
- **Per-session state** — fold open/closed and hidden rows are keyed by session
  id, so expanding or cleaning one conversation never moves another one; every
  control carries the id of the list it was rendered for (`data-ownsid`).
- **Stable snapshot boundary** — the snapshot/history split is taken on the raw
  list and the hidden-row filter is applied afterwards, so hiding a snapshot row
  can no longer drag an archived row into the live area or shift a fold count.
- **⇄ layout switch** — stacked (current list above, pinned below) or
  side-by-side (left current, right pinned). The preference is stored in
  `localStorage["dsh-todo-float-ball-layout"]` and restored on load.
- **Column captions** — in side-by-side mode the left column is captioned with
  the current conversation title and the right one with `📌 固定会话`; in stacked
  mode the captions stay hidden and nothing about the old layout changes.


## History & panel management (v0.10.0)

A plan is rewritten many times during a long task. From v0.10.0 the panel keeps
the **latest snapshot** as the live list and archives everything older instead
of discarding it:

- **Merge, not replace** — a fresh snapshot updates the leading `snapLen` rows
  of the session bucket; previous items that are not part of the new snapshot
  are appended after it, so old tasks never disappear.
- **Statistics mean "the current plan"** — the ball face (`done/total`), the
  progress ring, the header summary and the "N items left" notice count only
  the latest snapshot (`snapshotList()`); history is a pure archive.
- **Per-row hide (✕)** — hover a history row and click ✕ to hide it. Hidden
  rows live in `localStorage` (`dsh-todo-float-ball-hidden-v1`, per session);
  the data layer is untouched. Pinned (📌) sessions hide rows independently —
  a hidden row in session A can never hide a row in session B (`data-ownsid`).
- **Two fold rows** — `▾ Completed history (N)` and `▸ Abandoned history
  tasks (M)` are independent collapsible rows (collapsed by default); the
  latest snapshot always renders fully expanded.
- **Batch cleanup (🧹)** — each fold row has a 🧹 button to clear that fold,
  plus a `🧹 Clear all history (X)` row that hides both folds at once.
- **One-click restore (♻️)** — `♻️ Restore all hidden history (X)` appears
  only while something is hidden and unhides everything in the session.
- **Row copy (📋)** — copies the *full* task text (not the 80-char display
  truncation), with a real ✓/⚠ feedback.

## Discipline injection (v0.9.0)

DSH skills are **loaded on demand**: a session that never loads the `todo-show-discipline` skill carries no todo rules at all. Since v0.9.0 the host half injects a stable "todo discipline" section into every session's system prompt, so **installing the plugin is enough** — independent of which skill got loaded, which preset is active, and whether you run Desktop or the web UI.

- **ON by default** (no `config` row means ON).
- To turn it off: add `config: { injectDiscipline: false }` to this plugin's row in `cordis.patch.yml` (or your profile's patch layer), then **restart DSH**.
- Only an explicit boolean `false` disables it; `"false"` / `0` / typos / a missing `config` all keep it ON (guards against accidental shutdown).
- The injected text is deliberately short (a system-prompt section costs tokens in every session); the full rules stay in the `todo-show-discipline` skill, which is disabled for model invocation by default once this plugin is installed, and can be re-enabled if you uninstall the plugin.

## Install

The plugin is a standard DSH npm package (`dsh.bundle` self-declared). Two ways:

### From npm (when published)

```bash
npm install dsh-todo-float-ball
```

Then add `"dsh-todo-float-ball"` to both `dependencies` and `dsh.profile.bundles` in your profile's `package.json` (e.g. `%USERPROFILE%\.dsh\profiles\desktop\package.json`), and restart DSH.

### Manual

Copy this package folder into your profile's `node_modules` (a real copy — do **not** use `link:` / `file:` dependencies, they can trigger DSH's install-recovery loop), then register it the same way and restart.

After the restart you should see the ball in the bottom-right corner. Verify the host half with:

```
http://127.0.0.1:43120/dsh-todo-float-ball/health
→ {"ok":true,"plugin":"dsh-todo-float-ball","version":"<the installed package.json version>"}
```

## How it works

The official todo data is a **session projection**:

1. `@deepseek-ai/dsh-tool-todo` registers the `todo_write` tool and a `todos` projection unit on `sessionProjections`; every call appends a `todo/write` snapshot to the session log.
2. `@deepseek-ai/dsh-client-connection` broadcasts the current value as a control frame: `{type:"projection", sessionId, key:"todos", value:[{content,status}...]}`.
3. `@deepseek-ai/dsh-client-ui-conversation` renders it as the plan strip above the input box (`[data-testid="todo-panel"]`).

This plugin attaches to both ends without touching either:

- **Channel A (DOM)**: a debounced `MutationObserver` watches for `[data-testid="todo-panel"]`, reads `li[data-status]` items when the strip is expanded, and parses the localized count label (e.g. "1 完成 · 2 进行中") when it is collapsed.
- **Channel B (transport)**: a one-time, defensive wrapper around `window.fetch` (cloning responses, text/json only) and `WebSocket.prototype.onmessage` (text frames) feeds every payload through a strict extractor that only reacts to objects shaped like projection frames, `todo/write` events, or `{todos:[...]}` snapshots. Malformed payloads are ignored; nothing is ever written back.

All channels funnel into one normalizer: items are filtered to the three known statuses, blank contents are dropped, and unchanged lists are no-ops (cheap signature comparison).

## FAQ

**The ball doesn't show up.**
Check the health URL above; if it responds, the host half is fine — the client bundle may have been blocked (look for `loaded without registering` in DSH logs; the bundle id must equal the package name). If it doesn't respond, the plugin isn't in your profile's bundles list.

**Can I move the ball?**
Yes — drag it anywhere. The position persists per browser/renderer profile. If a saved position somehow lands off-screen, the plugin clamps it back into the viewport on startup.

**Does it work while the official strip is collapsed?**
Yes. That is exactly why channel B exists: the official strip renders only a counts label when collapsed, while projection frames always carry the full list.

**Does it slow the UI down?**
No. The observer is debounced (200 ms), the transport tap only string-scans for `"todos"` before parsing, and the periodic re-render watchdog stops after ~10 minutes.

## Compatibility

- DSH Desktop 2.x (desktop profile) and DSH web (web profile)
- No `peerDependencies` — the plugin is self-contained and talks to DSH only through public DOM/HTTP surfaces

## License

MIT
