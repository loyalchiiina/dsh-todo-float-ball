# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.8.0] - 2026-09-08

### Added

- **Nebula triple-variant** (user: 都保留 — keep all three texture
  proposals): the 🎨 picker now offers SIX skins —
  🌌 星云·流光 (A, current), 🌟 星云·宝石 (B, gemstone depth),
  🌙 星云·顶弧 (C, crescent top-glow), 💎 石墨版, 🔵 蓝宝石版,
  🧊 玻璃版. B/C keep the opaque-dark base (background-independent),
  rim flow, breathing, amber in-progress and per-status tints.

### Reverted

- Glass-panel experiment (user: text hard to read) — the expanded panel
  stays on the original dark translucent style.

## [0.7.7] - 2026-09-08

### Changed

- **Nebula skin now uses an OPAQUE dark base** (user request: 深浅背景观感
  一致): all four status gradients were semi-transparent and looked
  different on light vs dark backgrounds — they are now fully opaque
  (black base + teal/amber/mint/ice nebula tints), rendering identically
  on any background. The rim flow + breathing animations are unchanged.

## [0.7.6] - 2026-09-08

### Changed

- **Panel is now frosted-glass translucent** (user request: 字体背景透明):
  background 68% opacity + 28px backdrop blur with saturate boost — the
  DSH interface shows through softly in both dark and light themes.
- **Balls get a subtle outline** (1px translucent white): clean silhouette
  on any background; on dark it reads as a gem edge, on light it keeps
  the dark balls from looking like flat blobs.

## [0.7.5] - 2026-09-08

### Fixed (ecosystem compatibility hardening)

- **悬浮球导航 shows the SAME interface no matter which balls are
  installed** (ecosystem spec): the three visibility toggles are ALWAYS
  displayed; a ball that is not installed shows its toggle grayed-out
  with "（未安装）" instead of disappearing — installing a sibling later
  makes its toggle active automatically.
- **Uninstall safety net**: if dsh-skill-browser (the section provider)
  is removed while the Todo ball was hidden, the ball would be stuck
  invisible with no way back — `applyBallVisibility` now detects the
  provider is gone and shows the ball again.
- The shared section's 🎯 reset and rec-badge detection tolerate any
  install combination (null-guarded DOM probes; todo ball resets through
  its Shadow DOM).

## [0.7.4] - 2026-09-08

### Fixed

- **Ball size parity, take two**: the progress ring now uses the same
  1px outer overhang as the skill orb's rim (was 2px), so the visual
  diameter matches the skill-browser ball exactly at 46px+1.

### Changed (dsh-skill-browser shared section)

- 🎯 button text: "所有悬浮球回到右下角" (was 双球 wording).
- Usage notes updated: three-ball visibility control (skill / font /
  todo, all shown by default on fresh install); Todo skin switching
  happens inside the todo panel via 🎨 (星云 / 石墨 / 蓝宝石); reset
  returns ALL balls to the bottom-right.

## [0.7.3] - 2026-09-08

### Fixed

- **Ball visual size now matches the skill-browser orb**: the progress
  ring's `inset:-4px` overhang made the ball look ~54px despite the 46px
  body — ring now hugs the ball edge (inset:-2px).

### Added

- **Collapse refreshes the whole plugin UI** (font-enhancer pattern):
  folding the panel rebuilds the UI after 120ms, so theme/structure
  changes apply immediately on collapse — same behavior as the font
  plugin's reload-on-collapse.
- **Three-ball reset**: the shared settings section's 🎯 reset button now
  also returns the TODO ball to the bottom-right default (clears its
  position memory + DOM reposition, no restart) — skill + font + todo
  balls all reset together.

## [0.7.2] - 2026-09-08

### Changed

- **Ball size unified with the skill-browser orb**: 46px on all skins
  (was 52px nebula / 56px others).
- **Nebula skin motion fix** (user: the up/down flowing band covered the
  text): the band layer is removed; the rim light now circles the OUTER
  edge only (skill-orb style rimSpin, faster while in progress) — text
  stays clear. In-progress nebula tint is amber, matching the other
  skins.

### Added

- **🎯 一键归位** button in the panel footer: instantly moves the ball
  back to the bottom-right default corner and clears the saved position
  (no restart needed) — mirrors the skill-browser's reset button.

## [0.7.1] - 2026-09-08

### Changed

- **Ring skin removed** (user: it looked the same as graphite): the picker
  now offers three skins — 🌌 星云版 / 💎 石墨版 / 🔵 蓝宝石版; any
  previously-saved "ring" value falls back to graphite.

## [0.7.0] - 2026-09-08

### Added

- **Fourth skin: 🔵 蓝宝石版 (blue)** — deep-blue gem base with a blue
  glow and blue progress ring, the early blue version brought back as a
  first-class option. The 🎨 picker now lists four skins:
  🌌 星云版 / 💫 环版(粗环) / 💎 石墨版 / 🔵 蓝宝石版.

### Changed

- **Ring skin visually distinct from graphite** (user: they looked the
  same): the ring skin now shows a THICK (9px) glowing progress ring with
  a stronger drop-shadow, clearly different from the thin graphite ring.
  The skin renderer was refactored into per-skin rule blocks (kept the
  same public behavior; status variants + ring/band/rim per skin).
- **Open/close triggers a theme refresh** (mirrors the font plugin):
  expanding AND folding the panel re-applies the current skin, so any
  theme change is picked up on open/close instead of only on the 2s poll.

## [0.6.9] - 2026-09-07

### Changed

- **Skin picker is now an explicit menu** (user request instead of the
  invisible cycling): clicking 🎨 in the panel header opens a dropdown with
  the three skins (🌌 星云版 / 💫 环版 / 💎 石墨版), the current one marked
  with a ✓ highlight; picking one switches instantly and updates the
  highlight. Clear, visible feedback on every click.

## [0.6.8] - 2026-09-07

### Changed

- **Round ball shows only progress** (user requirement): the ball face is
  just `done/total` (or ✓ when all done) — the task-content sub-line is
  no longer rendered in round mode, since it never fit.
- **Capsule text scrolls**: overflowing task names in capsule mode
  ping-pong horizontally (measured marquee — the shift distance is
  computed from the actual overflow, capped by animation, static when it
  fits).

## [0.6.7] - 2026-09-07

### Changed

- **Skin switching moved into the ball's own panel** (user decision after
  the settings-slot buttons proved unreliable): the panel header now has a
  🎨 button between 📌 (pin) and ✕ (close) that cycles
  🌌 nebula → 💫 ring → 💎 graphite → 🌌, rebuilding the shadow stylesheet
  in place — 100% native events inside our own Shadow DOM, nothing can
  break it. The choice persists via the same `dsh-tfb-theme` key.
- The settings section keeps only the Todo promotion row in the shared
  "推荐插件" list (the unreliable in-settings skin buttons are removed).

## [0.6.6] - 2026-09-07

### Fixed

- **Skin switcher buttons now actually clickable** (second attempt, root
  cause confirmed): React synthetic events AND ref callbacks are both
  unreliable inside the settings section slot. The three skin buttons are
  now plain `data-tfb-theme` attribute buttons; the plugin delegates at
  the DOCUMENT capture phase (`installThemeDelegation`) — immune to any
  re-render, fires before anything can stopPropagation.

### Changed

- The Todo promotion + skin switcher moved INTO the shared "推荐插件"
  list (all four sibling plugins now listed together: font / skill
  browser / lightbox / todo ball) instead of a floating block.

## [0.6.5] - 2026-09-07

### Added

- **Third skin: 💫 环版 (ring)** — the 0.6.0 style restored as a first-class
  option: dark-gem base with a THICK glowing conic progress ring around the
  ball (done/total arc, amber while active, mint with strong glow when all
  done, ice-blue when pending-only). The switcher in the shared "悬浮球
  导航" section now offers all three skins:
  - 🌌 星云版 (nebula) — skill-orb clone, flowing bands + rotating rim;
  - 💫 环版 (ring) — dark gem + thick progress ring;
  - 💎 石墨版 (graphite) — v0.5.1 dark gem + thin progress ring.

## [0.6.4] - 2026-09-07

### Fixed

- **CRITICAL: newly assigned plans were silently rejected** (user bug
  report: "todo 显示均已完成，没有我安排的新增任务"):
  - the v0.6.1 monotonic guard compared raw completed counts, so a genuine
    NEW plan (whole-list replacement starting at 0 done) was misjudged as
    a stale snapshot and dropped — the ball stayed stuck on the old
    "all done" list;
  - the guard is now **plan-aware**: it only applies within the SAME plan
    (identical content set — progress within one plan must not regress);
    a different content set is a new/edited plan and is always accepted;
  - the persisted-record restore applies the same plan-aware rule (a
    different plan on disk never overrides the live one).

### Changed

- Skin buttons in the shared settings section now bind native click
  listeners via React refs (the slot's synthetic events were unreliable —
  user-reported "切换按钮点击不了").

## [0.6.3] - 2026-09-07

### Fixed

- **Skin switching now works reliably** (user-reported: buttons had no
  effect):
  - root cause 1: the visibility/theme watcher self-expired after ~20
    minutes (tries cap), so after that the localStorage key was written
    but never read again — the watcher is now permanent;
  - root cause 2: polling alone meant up to 2s latency; the plugin now
    exposes `window.__dshtfbApplyTheme()` and the shared settings buttons
    call it synchronously on click — the skin swaps instantly.

### Added

- **Dual skin with a switcher in the shared settings section** (user
  request: keep the previous skin too):
  - 🌌 **星云版 (nebula)** — the skill-orb clone from 0.6.2 (default);
  - 💎 **石墨版 (graphite)** — the v0.5.1 dark-gem style with the thin
    progress ring, preserved as a first-class option;
  - the switcher lives in the shared "悬浮球导航" section next to the Todo
    toggle (provided by dsh-skill-browser); picking a skin writes
    `dsh-tfb-theme` to localStorage and the ball hot-swaps within ~2s —
    the shadow stylesheet is rebuilt in place, no reload needed;
  - both skins keep the four status tints (teal idle / amber active /
    mint done / ice pending) and the per-status list text colors.

## [0.6.2] - 2026-09-07

### Changed

- **Orb visuals cloned from the skill-browser ball, hue-shifted to the
  todo teal identity** (user request: "和他一样呢换个颜色"):
  - nebula-body radial gradient (bright highlight → teal nebula → deep
    space rim) exactly mirroring the skill orb's structure;
  - flowing nebula bands (bandFlow) + rotating conic rim light (rimSpin,
    7s; amber status spins faster at 2.6s) + breathing pulse (orbBreathe)
    + glowing face text (dsbGlow-style keyframes) — the full five-piece
    skill-orb motion stack, now on the todo ball;
  - status variants are full nebula re-tints, not overlays: amber nebula
    + fast rim while work is in progress, mint nebula + extra glow when
    everything is done, ice-blue nebula for pending-only, teal at idle;
  - hover scale-up (1.08) like the sibling orbs. The thin progress ring
    from 0.6.0 is kept underneath the rim (done/total arc).

## [0.6.1] - 2026-09-07

### Fixed

- **Durable cross-update record survival (user clarification on "跨轮次")**:
  the checklist and its COMPLETED history now survive every kind of update,
  not just turn resets:
  - every accepted snapshot is persisted to localStorage per session
    (debounced 400ms);
  - on startup / page refresh the persisted record is restored, taking
    whichever side is strictly further along (progress score: done count →
    total → recency) — a page reload can no longer drop completed items;
  - a monotonic guard rejects incoming snapshots that would drag the
    record backward (fewer completed items with an equal-or-larger total,
    e.g. a stale polling snapshot), while still accepting genuine plan
    rewrites (tasks added or total shrunk).

## [0.6.0] - 2026-09-07

### Fixed

- **Sticky checklist (requirements 1/2/5)**: the host resets the todos
  projection to `null` at every `turn/start`, which previously wiped the
  ball the moment a new reply began. The last known list is now kept
  per-session until a real `todo_write` snapshot overwrites it — the
  checklist and progress never blink away mid-conversation, across turns,
  and completed items stay visible the whole time.

### Added

- **Progress ring + flow effects (requirement 7, skill-orb style)**:
  - a conic-gradient ring around the ball visualizing done/total (e.g.
    1/5 → 20% arc), rotating amber flow while work is in progress and a
    full mint ring with glow when everything is done;
  - the face label (1/5 or ✓) now carries a matching glow;
  - when items remain, the panel shows a hint pointing to
    `dsh-client-auto-continue` as the driver for continuous thinking (this
    plugin is a read-only monitor and never sends messages itself).

## [0.5.1] - 2026-09-07

### Changed

- **Settings centralized into the shared "悬浮球导航" section** (per user
  request): the ball's show/hide toggle now lives in the
  dsh-skill-browser-provided settings section (which already controlled the
  font ball the same way), alongside a promoted entry for this plugin with
  a Star link. This plugin no longer registers its own settings section;
  `exports.inject` is back to `["sessions"]` and `dsh.client.inject` back
  to just `@deepseek-ai/dsh-client-runtime` — **no host restart needed**
  when upgrading to 0.5.1 (a page refresh suffices).

### Fixed

- **Theme aligned with the sibling balls** (user request): the ball base is
  back to the same dark-gem gradient as font-enhancer / skill-browser;
  only the accent glow + ball-face text color differ (teal), with status
  colors amber (in progress, pulsing) / mint (done) / ice blue (pending).
  Per-status list TEXT colors are kept: amber semibold for in-progress,
  gray-green strikethrough for completed, light gray-blue for pending.

## [0.5.0] - 2026-09-07

### Added

- **DSH settings-page section (悬浮球设置)** — same official
  `settings.section` slot mechanism as the skill-browser and
  font-enhancer balls:
  - show/hide toggle for the ball (persists in localStorage; the panel can
    be re-enabled from settings if hidden);
  - a "floating-ball family" list promoting the four sibling plugins
    (font-enhancer / skill-browser / chat-image-lightbox / this one) with
    Star links;
  - registration follows the four verified requirements: official client
    dependencies declared in `dsh.client.inject` (requires a host restart
    when upgrading), pure-array `exports.inject`, no effect-wrapping, and
    a hooks-free React component.
- **New teal-gem theme** — distinct from the skill browser's blue-purple
  nebula orb and font-enhancer's graphite gem, same radial-gradient glass
  language:
  - ball states: teal (idle) / amber pulsing (in progress) / mint (all
    done) / ice blue (pending only), each with matching glow;
  - per-status TEXT colors in the list: in-progress = bright amber
    (semibold), completed = gray-green strikethrough, pending = light
    gray-blue — no more uniform white;
  - panel border/header rule tinted teal to match the ball.

## [0.4.0] - 2026-09-07

### Added

- **Inline conversation rename from the ball**:
  - click the conversation title in the panel header (or the ✏️ button on a
    pinned row) to edit its name in place — Enter commits, Esc cancels;
  - goes through the official session rename API (`session.rename` from
    `dsh-client-runtime`), so the change is the same as renaming the
    conversation in DSH itself: the sidebar, the projection store and the
    ball all update together;
  - works on the current session and on pinned sessions.

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
