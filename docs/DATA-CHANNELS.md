# Data channels — how the ball learns about todos

This document records the (read-only) data surfaces this plugin attaches to,
so future maintainers can re-validate them against newer DSH versions.

## Where the official todo data lives

| Layer | Package | Role |
|---|---|---|
| Tool | `@deepseek-ai/dsh-tool-todo` | Registers the `todo_write` tool; every accepted call appends a `todo/write` snapshot event to the session log; registers the `todos` unit on `sessionProjections` |
| Transport | `@deepseek-ai/dsh-client-connection` | Broadcasts projection values as control frames: `{type:"projection", sessionId, key:"todos", value: TodoItem[] \| null, seq}`; recomputes `todos` on `todo/write` and `turn/start` events |
| View | `@deepseek-ai/dsh-client-ui-conversation` | Renders the `todos` projection as the plan strip above the composer (`section[data-testid="todo-panel"]`), collapsible; expanded it renders `ul > li[data-status]` with a content span; collapsed it renders only a localized counts label |
| Tool row | `@deepseek-ai/dsh-client-ui-tool` | Renders the one-line `todo_write` conversation row (summary derived from call args) |

## Channel A — DOM (primary)

- Selector: `[data-testid="todo-panel"]`
- Expanded: `panel.querySelectorAll("ul li[data-status]")` →
  `{status: li[data-status], content: last span textContent}`
- Collapsed: the counts label (class contains `progress`) is parsed.
  Formats seen: `"1 完成 · 2 进行中 · 3 待办"` (zh) and equivalent English
  segments; both Arabic numerals and simple Chinese numerals (一/两/三…十) are
  supported. Count-only data is used solely as a last resort when no
  projection frame has been seen yet, because it cannot recover item contents.

## Channel B — transport (fallback)

- `window.fetch` is wrapped once (`window.__dshtfbFetchPatched` guard):
  responses are cloned; binary-ish content types (javascript/font/image) are
  skipped; the text is handed to the extractor.
- `WebSocket.prototype.onmessage` is wrapped once (`WebSocket.__dshtfbTapped`
  guard): string frames go straight to the extractor, Blob frames are read via
  `.text()` when small enough.
- The extractor (`tryIngest`) pre-filters on the substring `"todos"`, then
  tries whole-body JSON; on failure it scans line-by-line (tolerating SSE
  `data:` prefixes). An object is accepted only if it matches one of:
  1. `{key:"todos", value:[...]}` — projection frame
  2. `{todos:[...]}` — snapshot/log frame
  3. `{data:{todos:[...]}}` — `todo/write` event frame
- The wrapper never mutates requests or responses; failures inside the tap are
  swallowed so the host UI is unaffected.

## Normalization

Both channels funnel into `setTodos`:

- items are filtered to `pending | in_progress | completed`;
- blank/whitespace contents are dropped;
- a signature (`status|content` joined) detects no-op updates;
- rendering is fully re-computed from the normalized list (no incremental DOM
  state).

## Stability notes

- The panel `data-testid` is a stable test hook, safer than CSS-module class
  names which re-hash between DSH builds.
- If a future DSH renames the projection key or frame shape, channel A keeps
  working as long as the panel exists; if both channels break, the ball
  degrades to the idle state instead of showing wrong data.
