window.__ModuleLoader__.load({
  id: "dsh-todo-float-ball",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;

    // ============================================================
    // dsh-todo-float-ball — client half (browser).  v0.3.0
    //
    // A persistent, draggable floating ball that mirrors todo_write lists.
    //
    // v0.3.0 — data layer rebuilt on the official `sessions` service:
    //   * inject: ["sessions"] — the runtime's global session registry.
    //     Its list snapshot carries, for EVERY session, the projection
    //     values computed by the host (todos, title/plan/...), plus the
    //     current session id and a subscribe() for changes.
    //   * This gives us multi-session todo data and instant session-switch
    //     detection with ZERO interception — no fetch/WS wrapping (desktop
    //     renders go through the shell's __DSH_TRANSPORT__ Electron bridge,
    //     which page-level taps can never see).
    //   * Fallback: if ctx.sessions is unavailable, fall back to observing
    //     the official todo panel DOM ([data-testid="todo-panel"]).
    //
    // Features: auto-follow active conversation; pin any conversation (📌)
    // for cross-session monitoring; pinned list persists in localStorage;
    // per-status colors; Shadow DOM isolation; draggable ball.
    // ============================================================

    var BALL_ID = "dsh-tfb-root";
    var POS_KEY = "dsh-todo-float-ball-pos";
    var PIN_KEY = "dsh-todo-float-ball-pinned";
    var CAPSULE_KEY = "dsh-todo-float-ball-capsule";
    var MAX_CONTENT = 80;

    // ---------- multi-session state ----------
    var bySession = {};      // sessionId -> { todos:[{content,status}], sig }
    var titles = {};         // sessionId -> display title
    var pinned = [];         // [sessionId,...] (persisted)
    var currentSid = null;   // active session (from sessions.list.current)
    var hasSessionsSvc = false;
    var currentSessions = null;
    var expanded = false;
    var capsule = false;     // right-click: pill mode showing active task
    var openPin = {};        // pinned sessionId -> expanded? (UI state)
    var editing = { sid: null }; // inline rename editor state (one at a time)
    var ui = { root: null, ball: null, panel: null, list: null, summary: null, ctitle: null, pinBtn: null, pinSec: null };

    function normSid(sid) {
      return (typeof sid === "string" && sid) ? sid : "current";
    }

    // ---------- pinned persistence ----------
    function loadPinned() {
      try {
        var raw = localStorage.getItem(PIN_KEY);
        if (raw) {
          var arr = JSON.parse(raw);
          if (Array.isArray(arr)) pinned = arr.filter(function (x) { return typeof x === "string" && x; });
        }
      } catch (e) { pinned = []; }
    }
    function savePinned() {
      try { localStorage.setItem(PIN_KEY, JSON.stringify(pinned)); } catch (e) {}
    }
    function isPinned(sid) { return pinned.indexOf(sid) >= 0; }
    function pin(sid) {
      sid = normSid(sid);
      if (isPinned(sid)) return;
      pinned.push(sid);
      savePinned();
      render();
    }
    function unpin(sid) {
      var i = pinned.indexOf(sid);
      if (i >= 0) { pinned.splice(i, 1); savePinned(); render(); }
    }

    // ---------- helpers ----------
    function esc(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function countsOf(list) {
      var done = 0, active = 0;
      for (var i = 0; i < list.length; i++) {
        if (list[i].status === "completed") done++;
        else if (list[i].status === "in_progress") active++;
      }
      return { done: done, active: active, total: list.length };
    }

    function sessionTodos(sid) {
      var b = bySession[normSid(sid)];
      return b ? b.todos : null;
    }
    function sessionTitle(sid) {
      sid = normSid(sid);
      if (titles[sid]) return titles[sid];
      return sid === "current" ? "" : sid.slice(0, 10) + "…";
    }

    // ---------- rename (official API) ----------
    // Path (verified against dsh-client-runtime): the sessions facade exposes
    // .manager; SessionManager lazily builds resident Session records
    // (.sessions Map, .get(sessionId) is side-effect-safe); each Session has
    // .rename(title) → api.sessions.rename → host normalizes → title
    // projection updates → our sessions.list subscription re-renders.
    function renameSession(sid, title) {
      sid = normSid(sid);
      var clean = (typeof title === "string" ? title.trim() : "");
      if (!clean) return Promise.resolve(false);
      try {
        var mgr = currentSessions && currentSessions.manager;
        var session = mgr && mgr.sessions && typeof mgr.sessions.get === "function" ? mgr.sessions.get(sid) : null;
        if (session && typeof session.rename === "function") {
          return Promise.resolve(session.rename(clean)).then(function (result) {
            if (result && result.ok) {
              titles[sid] = (result.value && result.value.title) || clean;
              render();
              return true;
            }
            render();
            return false;
          }).catch(function () { render(); return false; });
        }
      } catch (e) {}
      return Promise.resolve(false);
    }

    function startRename(sid) {
      if (!hasSessionsSvc) return;
      sid = normSid(sid);
      if (editing.sid) return; // one editor at a time
      var isCurrent = sid === normSid(currentSid);
      var host = isCurrent ? ui.ctitle
        : (ui.pinSec ? ui.pinSec.querySelector('.tfb-pinrow[data-sid="' + sid + '"] .tfb-pinname') : null);
      if (!host) return;
      editing.sid = sid;
      var old = sessionTitle(sid);
      host.innerHTML = '<input class="tfb-rename" data-rename="1" value="' + esc(old) + '" placeholder="会话名称">';
      var input = host.querySelector("input");
      if (!input) { editing.sid = null; return; }
      input.focus();
      try { input.select(); } catch (e) {}
      var done = false;
      var commit = function () {
        if (done) return; done = true;
        var v = input.value;
        editing.sid = null;
        if (v && v.trim() && v.trim() !== old) renameSession(sid, v);
        else render();
      };
      var cancel = function () {
        if (done) return; done = true;
        editing.sid = null;
        render();
      };
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        else if (e.key === "Escape") { e.preventDefault(); cancel(); }
      });
      input.addEventListener("blur", commit);
      input.addEventListener("click", function (e) { e.stopPropagation(); });
      input.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
    }

    function currentList() { return sessionTodos(currentSid) || []; }

    function summarize(list) {
      var c = countsOf(list);
      var head = c.done + "/" + c.total;
      var detail = "";
      if (c.active > 0) {
        var first = null;
        for (var i = 0; i < list.length; i++) {
          if (list[i].status === "in_progress") { first = list[i].content; break; }
        }
        if (first) detail = first.length > 30 ? first.slice(0, 30) + "…" : first;
        if (c.active > 1) detail += " (+" + (c.active - 1) + ")";
      }
      return { head: head, detail: detail, c: c };
    }

    function ballState() {
      var list = currentList();
      if (!list.length) return { cls: "tfb-idle", label: "✓" };
      var c = countsOf(list);
      if (c.done === c.total) return { cls: "tfb-done", label: "✓" };
      return { cls: c.active > 0 ? "tfb-active" : "tfb-pending", label: String(c.done) + "/" + String(c.total) };
    }

    // ---------- durable persistence (user requirement: cross-turn /
    // cross-refresh record survival) ----------
    // Every accepted snapshot is written to localStorage keyed by session.
    // On restore we take whichever side is "further along" (more completed
    // items, tie-break by total, then by recency) so nothing — a stale
    // snapshot poll, a page reload, a projection rebuild — can drag the
    // record BACKWARD. Completed items are history, not transients.
    var PERSIST_KEY = "dsh-todo-float-ball-persist-v1";
    var persistTimer = null;
    function loadPersisted() {
      var out = {};
      try {
        var raw = localStorage.getItem(PERSIST_KEY);
        if (raw) out = JSON.parse(raw) || {};
      } catch (e) { out = {}; }
      return out;
    }
    function persistSoon() {
      if (persistTimer) return;
      persistTimer = setTimeout(function () {
        persistTimer = null;
        try {
          var out = {};
          for (var sid in bySession) {
            var b = bySession[sid];
            if (b && b.todos && b.todos.length) {
              out[sid] = { todos: b.todos, sig: b.sig, at: b.at || 0 };
            }
          }
          localStorage.setItem(PERSIST_KEY, JSON.stringify(out));
        } catch (e) {}
      }, 400);
    }
    // progress score: completed count dominates, then total, then recency.
    // planKey: the sorted content set — identical set = same plan (progress
    // within one plan must never regress); different set = a new plan.
    function planKey(todos) {
      return todos.map(function (t) { return t.content; }).sort().join("\n");
    }
    function progressScore(todos, at) {
      var c = countsOf(todos);
      return c.done * 10000 + c.total * 100 + Math.min(99, Math.floor(((at || 0) / 60000) % 100));
    }
    function restorePersisted() {
      try {
        var saved = loadPersisted();
        for (var sid in saved) {
          var rec = saved[sid];
          if (!rec || !Array.isArray(rec.todos) || rec.todos.length === 0) continue;
          var norm = [];
          for (var i = 0; i < rec.todos.length; i++) {
            var it = rec.todos[i];
            if (it && typeof it.content === "string" && it.content.trim()) {
              norm.push({ content: it.content, status: it.status });
            }
          }
          if (!norm.length) continue;
          var mem = bySession[sid];
          if (mem && mem.todos && mem.todos.length) {
            // different plan: the live snapshot wins (it is what the host
            // currently holds); same plan: keep the further-along record
            if (planKey(mem.todos) !== planKey(norm)) continue;
            if (progressScore(norm, rec.at) <= progressScore(mem.todos, mem.at)) continue;
          }
          bySession[sid] = { todos: norm, sig: rec.sig || norm.map(function (t) { return t.status + "|" + t.content; }).join("\n"), stale: false, at: rec.at || 0 };
        }
      } catch (e) {}
    }

    // ---------- data ingestion ----------
    function setSessionTodos(sid, list) {
      sid = normSid(sid);
      if (!Array.isArray(list)) return;
      var norm = [];
      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        if (!it || typeof it !== "object") continue;
        var st = it.status;
        if (st !== "pending" && st !== "in_progress" && st !== "completed") continue;
        var content = typeof it.content === "string" ? it.content : "";
        if (!content.trim()) continue;
        norm.push({ content: content, status: st });
      }
      if (norm.length === 0) {
        // STICKY: the host resets the todos projection to null at every
        // turn/start. Never wipe the last known list — only a real
        // todo_write snapshot (or a strictly-more-complete persisted one)
        // changes it. Per-session bucketing keeps this from bleeding
        // across conversations.
        var b0 = bySession[sid];
        if (b0) b0.stale = true;
        return;
      }
      var sig = norm.map(function (t) { return t.status + "|" + t.content; }).join("\n");
      var b = bySession[sid];
      if (b && b.sig === sig) { b.stale = false; return; }
      // MONOTONIC GUARD (plan-aware, v0.6.4): a todo_write is a whole-list
      // replacement — a NEW plan legitimately starts at 0 done, so the old
      // "fewer done = stale snapshot" check was rejecting freshly assigned
      // tasks (user bug: new plan never showed, ball stuck at "all done").
      // The guard now only applies WITHIN the same plan (identical content
      // set): same tasks but fewer completed = an older snapshot → reject.
      // Different content set = a new/edited plan → always accept.
      if (b && b.todos && b.todos.length && planKey(b.todos) === planKey(norm)) {
        var cMem = countsOf(b.todos);
        var cNew = countsOf(norm);
        if (cNew.done < cMem.done) {
          return; // same plan, progress regressed — stale snapshot, keep ours
        }
      }
      bySession[sid] = { todos: norm, sig: sig, stale: false, at: Date.now() };
      render();
      persistSoon();
    }

    // Primary channel: the official sessions service.
    // list snapshot shape (from dsh-client-runtime):
    //   { ids:[...], byId:{ sid:{ id, displayTitle, running, projectionValues:{todos,title,...}, ... } },
    //     current: sid|undefined, phase }
    function syncFromSessions() {
      try {
        var snap = currentSessions.list.getSnapshot();
        if (!snap || !snap.byId) return;
        for (var id in snap.byId) {
          var rec = snap.byId[id];
          if (!rec) continue;
          if (typeof rec.displayTitle === "string" && rec.displayTitle) titles[id] = rec.displayTitle;
          var pv = rec.projectionValues;
          if (pv && typeof pv === "object" && "todos" in pv) {
            setSessionTodos(id, pv.todos === null ? [] : pv.todos);
          }
        }
        if (snap.current) currentSid = snap.current;
        render();
      } catch (e) {}
    }

    // Fallback channel: observe the official todo panel DOM. Expanded panel
    // renders ul > li[data-status]; collapsed renders only header counts
    // (parsed into a skeleton — better than nothing when sessions service
    // is unavailable).
    function installPanelObserver() {
      var mo = new MutationObserver(function () {
        if (installPanelObserver._t) return;
        installPanelObserver._t = setTimeout(function () {
          installPanelObserver._t = 0;
          try { readOfficialPanel(); } catch (e) {}
        }, 200);
      });
      function start() {
        try {
          mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
          readOfficialPanel();
        } catch (e) {}
      }
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
      else start();
    }

    var ZH_NUM = { "零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10 };

    function parseZhNum(s) {
      s = String(s).trim();
      if (/^\d+$/.test(s)) return parseInt(s, 10);
      if (ZH_NUM[s] !== undefined) return ZH_NUM[s];
      if (/^十$/.test(s)) return 10;
      var m = /^([一二两三四五六七八九])?十([一二三四五六七八九])?$/.exec(s);
      if (m) return (m[1] ? ZH_NUM[m[1]] : 1) * 10 + (m[2] ? ZH_NUM[m[2]] : 0);
      return NaN;
    }

    function readOfficialPanel() {
      var panel = document.querySelector('[data-testid="todo-panel"]');
      if (!panel) return;
      var items = panel.querySelectorAll("ul li[data-status]");
      if (items.length > 0) {
        var list = [];
        for (var i = 0; i < items.length; i++) {
          var li = items[i];
          var st = li.getAttribute("data-status");
          var contentEl = li.querySelector("span:last-child") || li.lastElementChild;
          var content = contentEl ? (contentEl.textContent || "").trim() : "";
          if (content) list.push({ content: content, status: st || "pending" });
        }
        if (list.length > 0) { setSessionTodos(currentSid, list); return; }
      }
      // collapsed: skeleton only if the current session has no real data
      var cur = bySession[normSid(currentSid)];
      var hasReal = cur && cur.todos && cur.todos.length > 0 && !cur.__skeleton;
      if (hasReal) return;
      var label = panel.querySelector('[class*="progress"]');
      if (!label) return;
      var text = (label.textContent || "").trim();
      if (!text) return;
      var segs = text.split("·");
      var done = NaN, active = NaN, pending = NaN;
      for (var k = 0; k < segs.length; k++) {
        var s = segs[k].trim();
        var n = parseZhNum(s.split(" ")[0]);
        if (isNaN(n)) continue;
        if (s.indexOf("完成") >= 0) done = n;
        else if (s.indexOf("进行") >= 0) active = n;
        else if (s.indexOf("待办") >= 0) pending = n;
      }
      if (isNaN(done) && isNaN(active) && isNaN(pending)) return;
      // only show the skeleton when we have nothing real, and mark it
      if (bySession[normSid(currentSid)] && !bySession[normSid(currentSid)].__skeleton) return;
      var skel = [];
      for (var d = 0; d < (isNaN(done) ? 0 : done); d++) skel.push({ content: "已完成任务", status: "completed" });
      for (var a = 0; a < (isNaN(active) ? 0 : active); a++) skel.push({ content: "进行中任务", status: "in_progress" });
      for (var p = 0; p < (isNaN(pending) ? 0 : pending); p++) skel.push({ content: "待办任务", status: "pending" });
      if (skel.length > 0) {
        setSessionTodos(currentSid, skel);
        var bb = bySession[normSid(currentSid)];
        if (bb) bb.__skeleton = true;
        render();
      }
    }

    // ---------- UI ----------
    // ---------- theme (dual skin, user requirement) ----------
    // "nebula"  — skill-orb style clone (v0.6.2): nebula body + flowing
    //             bands + rotating conic rim + breathing + glow text.
    // "graphite" — v0.5.1 dark-gem style: same glass family as
    //             font-enhancer, teal accent + thin progress ring.
    // Persisted in localStorage; switched from the shared "悬浮球导航"
    // settings section (dsh-skill-browser provides the button).
    var THEME_KEY = "dsh-tfb-theme";
    var currentTheme = "nebula";
    function loadTheme() {
      try {
        var v = localStorage.getItem(THEME_KEY);
        if (v === "blue") currentTheme = "blue"; else if (v === "nebula") currentTheme = "nebula"; else if (v === "nebB") currentTheme = "nebB"; else if (v === "nebC") currentTheme = "nebC"; else if (v === "glass") currentTheme = "glass"; else currentTheme = "graphite";
      } catch (e) {}
    }
    function setTheme(t) {
      if (t !== "nebula" && t !== "graphite" && t !== "blue" && t !== "glass" && t !== "nebB" && t !== "nebC") return;
      currentTheme = t;
      try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
      render();
    }

    function cssText() {
      var th = currentTheme;
      // Skeleton fields that all four skins share; shape differs per skin.
      var SIZE = "width:46px;height:46px;";
      // Per-skin ball rules (status variants + ring + band/rim).
      var ball = [];
      if (th === "nebula") {
        ball = [
          ".tfb-ball{position:fixed;right:18px;bottom:18px;z-index:2147483600;border-radius:50%;border:1px solid rgba(255,255,255,.28);cursor:grab;user-select:none;touch-action:none;pointer-events:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;color:#eafff7;font-size:13px;font-weight:800;line-height:1.1;background:radial-gradient(circle at 50% 60%, #2dd4a8 0%, #17a284 20%, #12876f 45%, #0a3a32 68%, #041715 100%);box-shadow:0 0 22px rgba(45,212,168,.5),0 0 4px rgba(120,255,214,.35),0 4px 18px rgba(0,0,0,.55),inset 0 1px 3px rgba(255,255,255,.4),inset 0 -8px 16px rgba(45,212,168,.16),inset 0 0 14px rgba(20,180,150,.25);text-shadow:0 0 6px rgba(120,255,214,.75),0 2px 4px rgba(0,40,30,.8);filter:drop-shadow(0 0 6px rgba(160,255,225,.85));animation:tfbBreathe 3.2s ease-in-out infinite;transition:transform .15s ease}" + SIZE.replace(";", ";"),
          ".tfb-orb-band{display:none}",
          ".tfb-orb-rim{position:absolute;inset:-1px;border-radius:50%;z-index:1;pointer-events:none;background:conic-gradient(from 200deg, rgba(255,255,255,.55), rgba(120,240,205,.35), rgba(10,200,170,.4), rgba(255,255,255,.15), rgba(45,212,168,.4), rgba(255,255,255,.55));-webkit-mask:radial-gradient(circle, transparent 63%, #000 66%, #000 72%, transparent 76%);mask:radial-gradient(circle, transparent 63%, #000 66%, #000 72%, transparent 76%);animation:tfbRimSpin 7s linear infinite;filter:blur(.5px)}",
          ".tfb-ball .tfb-ring{display:none}",
          ".tfb-ball .tfb-label{animation:tfbGlow 2.4s ease-in-out infinite}",
          ".tfb-ball.tfb-active{color:#fff3dc;background:radial-gradient(circle at 50% 60%, #ffaa33 0%, #e08410 20%, #b56708 45%, #4a2a06 70%, #170c02 100%);box-shadow:0 0 22px rgba(255,170,51,.55),0 0 4px rgba(255,210,120,.4),0 4px 18px rgba(0,0,0,.55),inset 0 1px 3px rgba(255,255,255,.4),inset 0 -8px 16px rgba(255,170,51,.16),inset 0 0 14px rgba(230,140,20,.25);text-shadow:0 0 4px rgba(255,255,255,.95),0 0 10px rgba(255,215,140,.95),0 0 20px rgba(255,160,40,.8),0 2px 4px rgba(60,30,0,.8);filter:drop-shadow(0 0 6px rgba(255,200,110,.9))}",
          ".tfb-ball.tfb-active .tfb-orb-rim{background:conic-gradient(from 200deg, rgba(255,255,255,.6), rgba(255,200,110,.4), rgba(255,150,30,.45), rgba(255,255,255,.15), rgba(255,190,80,.4), rgba(255,255,255,.6));animation-duration:2.6s}",
          ".tfb-ball.tfb-done{color:#eafff4;background:radial-gradient(circle at 50% 60%, #5dffa8 0%, #22c070 20%, #12875c 45%, #073c26 70%, #02150c 100%);box-shadow:0 0 26px rgba(93,255,168,.6),0 0 5px rgba(180,255,215,.45),0 4px 18px rgba(0,0,0,.55),inset 0 1px 3px rgba(255,255,255,.45),inset 0 -8px 16px rgba(93,255,168,.18),inset 0 0 14px rgba(40,200,120,.3);text-shadow:0 0 4px rgba(255,255,255,1),0 0 12px rgba(190,255,220,1),0 0 24px rgba(60,255,150,.85),0 2px 4px rgba(0,40,20,.8);filter:drop-shadow(0 0 8px rgba(140,255,195,.95))}",
          ".tfb-ball.tfb-pending{color:#e8f3ff;background:radial-gradient(circle at 50% 60%, #7fc4ff 0%, #4f92e0 20%, #2f6cb0 45%, #12305c 70%, #04101e 100%);box-shadow:0 0 22px rgba(127,196,255,.5),0 0 4px rgba(180,220,255,.35),0 4px 18px rgba(0,0,0,.55),inset 0 1px 3px rgba(255,255,255,.4),inset 0 -8px 16px rgba(127,196,255,.15),inset 0 0 14px rgba(70,140,220,.25);text-shadow:0 0 4px rgba(255,255,255,.95),0 0 10px rgba(190,225,255,.9),0 0 20px rgba(90,170,255,.75),0 2px 4px rgba(0,20,45,.8);filter:drop-shadow(0 0 6px rgba(170,215,255,.85))}"
        ];
      } else if (th === "blue") {
        ball = [
          ".tfb-ball{position:fixed;right:18px;bottom:18px;z-index:2147483600;border-radius:50%;border:1px solid rgba(255,255,255,.28);cursor:grab;user-select:none;touch-action:none;pointer-events:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;color:#a8c8ff;font-size:13px;font-weight:800;line-height:1.1;background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.18),rgba(26,40,66,.96) 70%);box-shadow:0 4px 24px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.18),0 0 18px rgba(100,160,255,.5);transition:transform .15s ease}" + SIZE.replace(";", ";"),
          ".tfb-orb-band{display:none}",
          ".tfb-orb-rim{display:none}",
          ".tfb-ball .tfb-ring{position:absolute;inset:-1px;border-radius:50%;pointer-events:none;background:conic-gradient(var(--rc,#6aa8ff) calc(var(--pct,0)*1%),rgba(255,255,255,.08) 0);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 5px),#000 calc(100% - 4px));mask:radial-gradient(farthest-side,transparent calc(100% - 5px),#000 calc(100% - 4px));transition:background .4s ease;filter:drop-shadow(0 0 6px rgba(100,160,255,.5))}",
          ".tfb-ball .tfb-label{text-shadow:0 0 10px currentColor,0 0 3px currentColor}",
          ".tfb-ball.tfb-active{color:#ffcf8a;box-shadow:0 4px 24px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.18),0 0 16px rgba(255,170,51,.5);animation:tfb-pulse 1.6s ease-in-out infinite}",
          ".tfb-ball.tfb-active .tfb-ring{--rc:#ffaa33;filter:drop-shadow(0 0 8px rgba(255,170,51,.6))}",
          ".tfb-ball.tfb-done{color:#a5ffd4;box-shadow:0 4px 24px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.18),0 0 18px rgba(93,255,168,.5)}",
          ".tfb-ball.tfb-done .tfb-ring{--rc:#5dffa8;filter:drop-shadow(0 0 10px rgba(93,255,168,.7))}",
          ".tfb-ball.tfb-pending{color:#bcd9ff;box-shadow:0 4px 24px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.18),0 0 14px rgba(127,196,255,.5)}",
          ".tfb-ball.tfb-pending .tfb-ring{--rc:#7fc4ff;filter:drop-shadow(0 0 8px rgba(127,196,255,.6))}"
        ];
      } else if (th === "nebB") {
        ball = [
          ".tfb-ball{position:fixed;right:18px;bottom:18px;z-index:2147483600;border-radius:50%;border:1px solid rgba(255,255,255,.28);cursor:grab;user-select:none;touch-action:none;pointer-events:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;color:#d9fff0;font-size:13px;font-weight:800;line-height:1.1;background:radial-gradient(circle at 50% 62%, rgba(210,255,244,.5) 0%, rgba(45,212,168,.75) 14%, rgba(18,160,130,.85) 30%, rgba(12,110,92,.95) 50%, rgba(6,40,34,1) 72%, rgba(2,16,14,1) 100%);box-shadow:0 0 20px rgba(45,212,168,.45),inset 0 2px 5px rgba(255,255,255,.45),inset 0 -10px 18px rgba(45,212,168,.25),inset 0 0 18px rgba(10,60,50,.5);text-shadow:0 0 6px rgba(120,255,214,.75),0 2px 4px rgba(0,40,30,.8);animation:tfbBreathe 3.2s ease-in-out infinite;transition:transform .15s ease}" + SIZE,
          ".tfb-orb-band{display:none}",
          ".tfb-orb-rim{position:absolute;inset:-1px;border-radius:50%;z-index:1;pointer-events:none;background:conic-gradient(from 200deg, rgba(255,255,255,.45), rgba(120,240,205,.3), rgba(10,200,170,.35), rgba(255,255,255,.12), rgba(45,212,168,.35), rgba(255,255,255,.45));-webkit-mask:radial-gradient(circle, transparent 63%, #000 66%, #000 72%, transparent 76%);mask:radial-gradient(circle, transparent 63%, #000 66%, #000 72%, transparent 76%);animation:tfbRimSpin 7s linear infinite;filter:blur(.5px)}",
          ".tfb-ball .tfb-ring{display:none}",
          ".tfb-ball .tfb-label{animation:tfbGlow 2.4s ease-in-out infinite}",
          ".tfb-ball.tfb-active{color:#ffd9a8;background:radial-gradient(circle at 50% 62%, rgba(255,240,210,.55) 0%, rgba(255,180,70,.8) 14%, rgba(220,130,25,.9) 30%, rgba(150,85,15,.95) 50%, rgba(60,32,6,1) 72%, rgba(24,12,2,1) 100%);box-shadow:0 0 20px rgba(255,170,51,.5),inset 0 2px 5px rgba(255,255,255,.5),inset 0 -10px 18px rgba(255,170,51,.28),inset 0 0 18px rgba(90,50,10,.5)}",
          ".tfb-ball.tfb-active .tfb-orb-rim{background:conic-gradient(from 200deg, rgba(255,255,255,.5), rgba(255,200,110,.35), rgba(255,150,30,.4), rgba(255,255,255,.12), rgba(255,190,80,.35), rgba(255,255,255,.5));animation-duration:2.6s}",
          ".tfb-ball.tfb-done{color:#d9fff0;background:radial-gradient(circle at 50% 62%, rgba(220,255,236,.5) 0%, rgba(93,255,168,.75) 14%, rgba(30,190,105,.85) 30%, rgba(15,130,75,.95) 50%, rgba(5,45,28,1) 72%, rgba(2,16,10,1) 100%);box-shadow:0 0 20px rgba(93,255,168,.5),inset 0 2px 5px rgba(255,255,255,.5),inset 0 -10px 18px rgba(93,255,168,.25),inset 0 0 18px rgba(8,60,38,.5)}",
          ".tfb-ball.tfb-pending{color:#dbeafe;background:radial-gradient(circle at 50% 62%, rgba(220,240,255,.5) 0%, rgba(127,196,255,.7) 14%, rgba(59,130,196,.85) 30%, rgba(35,90,150,.95) 50%, rgba(10,35,65,1) 72%, rgba(3,12,24,1) 100%);box-shadow:0 0 20px rgba(127,196,255,.45),inset 0 2px 5px rgba(255,255,255,.45),inset 0 -10px 18px rgba(127,196,255,.22),inset 0 0 18px rgba(15,45,85,.5)}"
        ];
      } else if (th === "nebC") {
        ball = [
          ".tfb-ball{position:fixed;right:18px;bottom:18px;z-index:2147483600;border-radius:50%;border:1px solid rgba(255,255,255,.28);cursor:grab;user-select:none;touch-action:none;pointer-events:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;color:#d9fff0;font-size:13px;font-weight:800;line-height:1.1;background:radial-gradient(circle at 50% 55%, #1a8a70 0%, #0f6b58 30%, #083f35 60%, #031511 100%);box-shadow:0 0 18px rgba(45,212,168,.35),inset 0 2px 6px rgba(255,255,255,.28),inset 0 -8px 14px rgba(0,0,0,.5);text-shadow:0 0 6px rgba(120,255,214,.75),0 2px 4px rgba(0,40,30,.8);animation:tfbBreathe 3.2s ease-in-out infinite;transition:transform .15s ease}" + SIZE,
          ".tfb-ball::before{content:\"\";position:absolute;inset:4px 6px 58% 6px;border-radius:50%;background:radial-gradient(ellipse at 50% 30%, rgba(140,255,225,.55) 0%, rgba(140,255,225,.12) 60%, transparent 80%);filter:blur(1px);z-index:1;pointer-events:none}",
          ".tfb-orb-band{display:none}",
          ".tfb-orb-rim{position:absolute;inset:-1px;border-radius:50%;z-index:1;pointer-events:none;background:conic-gradient(from 200deg, rgba(255,255,255,.45), rgba(120,240,205,.3), rgba(10,200,170,.35), rgba(255,255,255,.12), rgba(45,212,168,.35), rgba(255,255,255,.45));-webkit-mask:radial-gradient(circle, transparent 63%, #000 66%, #000 72%, transparent 76%);mask:radial-gradient(circle, transparent 63%, #000 66%, #000 72%, transparent 76%);animation:tfbRimSpin 7s linear infinite;filter:blur(.5px)}",
          ".tfb-ball .tfb-ring{display:none}",
          ".tfb-ball .tfb-label{animation:tfbGlow 2.4s ease-in-out infinite}",
          ".tfb-ball.tfb-active{color:#ffd9a8;background:radial-gradient(circle at 50% 55%, #d98a1a 0%, #a86410 30%, #5c3608 60%, #201003 100%);box-shadow:0 0 18px rgba(255,170,51,.4),inset 0 2px 6px rgba(255,255,255,.3),inset 0 -8px 14px rgba(0,0,0,.5)}",
          ".tfb-ball.tfb-active::before{background:radial-gradient(ellipse at 50% 30%, rgba(255,220,160,.55) 0%, rgba(255,220,160,.12) 60%, transparent 80%)}",
          ".tfb-ball.tfb-active .tfb-orb-rim{background:conic-gradient(from 200deg, rgba(255,255,255,.5), rgba(255,200,110,.35), rgba(255,150,30,.4), rgba(255,255,255,.12), rgba(255,190,80,.35), rgba(255,255,255,.5));animation-duration:2.6s}",
          ".tfb-ball.tfb-done{color:#d9fff0;background:radial-gradient(circle at 50% 55%, #17a06a 0%, #0f7a4e 30%, #084a30 60%, #03150c 100%);box-shadow:0 0 18px rgba(93,255,168,.4),inset 0 2px 6px rgba(255,255,255,.28),inset 0 -8px 14px rgba(0,0,0,.5)}",
          ".tfb-ball.tfb-done::before{background:radial-gradient(ellipse at 50% 30%, rgba(180,255,220,.55) 0%, rgba(180,255,220,.12) 60%, transparent 80%)}",
          ".tfb-ball.tfb-pending{color:#dbeafe;background:radial-gradient(circle at 50% 55%, #2a6cb0 0%, #1c5288 30%, #10315c 60%, #04101e 100%);box-shadow:0 0 18px rgba(127,196,255,.35),inset 0 2px 6px rgba(255,255,255,.28),inset 0 -8px 14px rgba(0,0,0,.5)}",
          ".tfb-ball.tfb-pending::before{background:radial-gradient(ellipse at 50% 30%, rgba(180,215,255,.55) 0%, rgba(180,215,255,.12) 60%, transparent 80%)}"
        ];
      } else if (th === "glass") {
        ball = [
          ".tfb-ball{position:fixed;right:18px;bottom:18px;z-index:2147483600;border-radius:50%;border:1px solid rgba(255,255,255,.4);cursor:grab;user-select:none;touch-action:none;pointer-events:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;color:#16324a;font-size:13px;font-weight:800;line-height:1.1;background:linear-gradient(145deg,rgba(190,225,245,.4) 0%,rgba(130,170,205,.28) 50%,rgba(85,115,150,.42) 100%);backdrop-filter:blur(4px);box-shadow:inset 0 1px 5px rgba(255,255,255,.55),inset 0 -8px 14px rgba(255,255,255,.1),0 4px 16px rgba(0,0,0,.35);transition:transform .15s ease}" + SIZE,
          ".tfb-orb-band{display:none}",
          ".tfb-orb-rim{display:none}",
          ".tfb-ball::before{content:\"\";position:absolute;inset:3px 3px 55% 3px;border-radius:50% 50% 40% 40%;background:linear-gradient(rgba(255,255,255,.55),rgba(255,255,255,.06));filter:blur(.5px);pointer-events:none}",
          ".tfb-ball .tfb-ring{position:absolute;inset:-1px;border-radius:50%;pointer-events:none;background:conic-gradient(var(--rc,#3b82c4) calc(var(--pct,0)*1%),rgba(255,255,255,.25) 0);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 4px),#000 calc(100% - 3px));mask:radial-gradient(farthest-side,transparent calc(100% - 4px),#000 calc(100% - 3px));transition:background .4s ease;filter:drop-shadow(0 0 5px rgba(80,140,200,.5))}",
          ".tfb-ball .tfb-label,.tfb-ball .tfb-sub{text-shadow:0 1px 2px rgba(255,255,255,.6)}",
          ".tfb-ball.tfb-active{color:#7a4a08;box-shadow:inset 0 1px 5px rgba(255,255,255,.55),inset 0 -8px 14px rgba(255,190,120,.15),0 4px 16px rgba(0,0,0,.35),0 0 14px rgba(255,170,51,.35)}",
          ".tfb-ball.tfb-active .tfb-ring{--rc:#ffaa33;filter:drop-shadow(0 0 7px rgba(255,170,51,.6))}",
          ".tfb-ball.tfb-done{color:#14532d;box-shadow:inset 0 1px 5px rgba(255,255,255,.55),inset 0 -8px 14px rgba(160,255,200,.15),0 4px 16px rgba(0,0,0,.35),0 0 14px rgba(93,255,168,.35)}",
          ".tfb-ball.tfb-done .tfb-ring{--rc:#16a34a;filter:drop-shadow(0 0 7px rgba(22,163,74,.6))}",
          ".tfb-ball.tfb-pending{color:#1e3a5f;box-shadow:inset 0 1px 5px rgba(255,255,255,.55),inset 0 -8px 14px rgba(170,205,255,.15),0 4px 16px rgba(0,0,0,.35),0 0 12px rgba(100,160,255,.3)}",
          ".tfb-ball.tfb-pending .tfb-ring{--rc:#3b82c4;filter:drop-shadow(0 0 6px rgba(59,130,196,.55))}"
        ];
      } else { // graphite
        ball = [
          ".tfb-ball{position:fixed;right:18px;bottom:18px;z-index:2147483600;border-radius:50%;border:1px solid rgba(255,255,255,.28);cursor:grab;user-select:none;touch-action:none;pointer-events:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;color:#7defc4;font-size:13px;font-weight:800;line-height:1.1;background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.15),rgba(40,44,54,.95) 70%);box-shadow:0 4px 24px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.15),0 0 14px rgba(45,212,168,.28);transition:transform .15s ease}" + SIZE.replace(";", ";"),
          ".tfb-orb-band{display:none}",
          ".tfb-orb-rim{display:none}",
          ".tfb-ball .tfb-ring{position:absolute;inset:-1px;border-radius:50%;pointer-events:none;background:conic-gradient(var(--rc,#2dd4a8) calc(var(--pct,0)*1%),rgba(255,255,255,.07) 0);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 5px),#000 calc(100% - 4px));mask:radial-gradient(farthest-side,transparent calc(100% - 5px),#000 calc(100% - 4px));transition:background .4s ease}",
          ".tfb-ball .tfb-label{text-shadow:0 0 8px currentColor,0 0 2px currentColor}",
          ".tfb-ball.tfb-active{color:#ffcf8a;box-shadow:0 4px 24px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.15),0 0 16px rgba(255,170,51,.45);animation:tfb-pulse 1.6s ease-in-out infinite}",
          ".tfb-ball.tfb-active .tfb-ring{--rc:#ffaa33}",
          ".tfb-ball.tfb-done{color:#8dffc8;box-shadow:0 4px 24px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.15),0 0 16px rgba(93,255,168,.4)}",
          ".tfb-ball.tfb-done .tfb-ring{--rc:#5dffa8}",
          ".tfb-ball.tfb-pending{color:#a8c8ec;box-shadow:0 4px 24px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.15),0 0 12px rgba(127,196,255,.3)}",
          ".tfb-ball.tfb-pending .tfb-ring{--rc:#7fc4ff}"
        ];
      }
      return [
        ":host{all:initial}",
        ".tfb-root{position:static;pointer-events:none;font-family:'Segoe UI','Microsoft YaHei',system-ui,sans-serif}",
        ".tfb-ball:hover{transform:scale(1.08)}",
        ".tfb-ball:active{cursor:grabbing;transform:scale(.95)}"
      ].concat(ball, [
        "@keyframes tfbBandFlow{0%,100%{transform:translateY(-3px) scaleY(.94);opacity:.8}50%{transform:translateY(3px) scaleY(1.12);opacity:1}}",
        "@keyframes tfbRimSpin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}",
        "@keyframes tfbBreathe{0%,100%{transform:scale(.96);filter:brightness(.92)}50%{transform:scale(1.05);filter:brightness(1.12)}}",
        "@keyframes tfbGlow{0%,100%{text-shadow:0 0 4px rgba(255,255,255,.95),0 0 10px rgba(150,255,220,.9),0 0 20px rgba(30,220,180,.75)}50%{text-shadow:0 0 6px rgba(255,255,255,1),0 0 16px rgba(200,255,235,1),0 0 32px rgba(60,240,195,.95)}}",
        "@keyframes tfb-pulse{0%,100%{box-shadow:0 4px 24px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.15),0 0 16px rgba(255,170,51,.45),0 0 0 0 rgba(255,170,51,.5)}50%{box-shadow:0 4px 24px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.15),0 0 16px rgba(255,170,51,.55),0 0 0 10px rgba(255,170,51,0)}}",
        ".tfb-ball.tfb-active .tfb-label{animation:none;text-shadow:0 0 4px rgba(255,255,255,.95),0 0 10px rgba(255,215,140,.95),0 0 20px rgba(255,160,40,.8)}",
        ".tfb-ball.tfb-done .tfb-label{animation:none;text-shadow:0 0 6px rgba(255,255,255,1),0 0 14px rgba(190,255,220,1),0 0 28px rgba(60,255,150,.9)}",
        // capsule mode (right-click toggle): long pill, wider, text-first
        ".tfb-ball.tfb-capsule{width:auto;min-width:220px;max-width:min(520px,60vw);height:44px;border-radius:22px;flex-direction:row;gap:8px;padding:0 16px;font-size:12px;justify-content:flex-start}",
        ".tfb-ball.tfb-capsule .tfb-orb-band{inset:1px}",
        ".tfb-ball.tfb-capsule .tfb-orb-rim{display:none}",
        ".tfb-ball.tfb-capsule .tfb-ring{display:none}",
        ".tfb-ball.tfb-capsule .tfb-label{flex-shrink:0}",
        ".tfb-ball.tfb-capsule .tfb-sub{flex:1;min-width:0;max-width:none;font-size:12px;text-align:left;overflow:hidden;white-space:nowrap}",
        ".tfb-ball.tfb-capsule .tfb-capsule-text{display:inline-block;white-space:nowrap}",
        ".tfb-ball.tfb-capsule .tfb-capsule-text.tfb-marquee{animation:tfbMarquee 9s ease-in-out infinite alternate}",
        "@keyframes tfbMarquee{from{transform:translateX(0)}to{transform:translateX(var(--shift,-40px))}}",
        ".tfb-panel{position:fixed;z-index:2147483600;width:300px;max-width:calc(100vw - 24px);max-height:74vh;overflow-y:auto;overflow-x:hidden;pointer-events:auto;display:none;color:#e6e6e6;font-size:13px;line-height:1.5;border-radius:14px;padding:12px 14px 10px;background:rgba(16,18,22,.92);border:1px solid rgba(255,255,255,.08);box-shadow:0 20px 60px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.06);backdrop-filter:blur(24px)}",
        ".tfb-panel.tfb-open{display:block}",
        ".tfb-head{display:flex;align-items:center;gap:6px;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(45,212,168,.25)}",
        ".tfb-title{font-weight:700;font-size:13px;white-space:nowrap}",
        ".tfb-ctitle{flex:1;min-width:0;font-size:11px;color:#9aa3b2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:text}",
        ".tfb-summary{font-size:11px;color:#9aa3b2;white-space:nowrap}",
        ".tfb-btn{border:0;background:transparent;color:#9aa3b2;font-size:13px;cursor:pointer;padding:2px 5px;border-radius:6px;flex-shrink:0}",
        ".tfb-btn:hover{color:#e6e6e6;background:rgba(255,255,255,.06)}",
        ".tfb-btn.tfb-on{color:#ffd27a}",
        ".tfb-list{list-style:none;margin:0;padding:0}",
        ".tfb-item{display:flex;align-items:flex-start;gap:8px;padding:5px 4px;border-radius:8px;word-break:break-word}",
        ".tfb-item:nth-child(odd){background:rgba(255,255,255,.03)}",
        ".tfb-ico{flex-shrink:0;width:16px;height:16px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;margin-top:1px}",
        ".tfb-item[data-status='completed'] .tfb-ico{background:rgba(74,222,128,.18);color:#5dffa8;border:1px solid rgba(93,255,168,.4)}",
        ".tfb-item[data-status='in_progress'] .tfb-ico{background:rgba(255,170,51,.2);color:#ffaa33;border:1px solid rgba(255,170,51,.45)}",
        ".tfb-item[data-status='pending'] .tfb-ico{background:rgba(127,196,255,.14);color:#7fc4ff;border:1px dashed rgba(127,196,255,.5)}",
        ".tfb-item[data-status='in_progress']{background:rgba(255,170,51,.06)}",
        ".tfb-item[data-status='in_progress'] .tfb-txt{color:#ffcf8a;font-weight:600}",
        ".tfb-item[data-status='completed'] .tfb-txt{color:#7fae94;text-decoration:line-through}",
        ".tfb-item[data-status='pending'] .tfb-txt{color:#aebfd4}",
        ".tfb-txt{flex:1}",
        ".tfb-empty{color:#8b93a1;font-size:12px;text-align:center;padding:12px 0}",
        ".tfb-sep{margin:10px 0 6px;padding-top:8px;border-top:1px solid rgba(255,255,255,.07);display:flex;align-items:center;justify-content:space-between}",
        ".tfb-sep-label{font-size:11px;color:#9aa3b2;font-weight:600}",
        ".tfb-pinrow{display:flex;align-items:center;gap:6px;padding:6px 4px;border-radius:8px;cursor:pointer}",
        ".tfb-pinrow:hover{background:rgba(255,255,255,.05)}",
        ".tfb-pinname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}",
        ".tfb-pincount{font-size:11px;color:#9aa3b2;white-space:nowrap}",
        ".tfb-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}",
        ".tfb-dot-active{background:#fbbf24;box-shadow:0 0 6px rgba(251,191,36,.8);animation:tfb-dotpulse 1.4s ease-in-out infinite}",
        ".tfb-dot-done{background:#4ade80}",
        ".tfb-dot-none{background:#6b7280}",
        "@keyframes tfb-dotpulse{0%,100%{opacity:1}50%{opacity:.4}}",
        ".tfb-pinlist{list-style:none;margin:2px 0 4px;padding:0 0 0 10px;border-left:2px solid rgba(255,255,255,.08)}",
        ".tfb-hint{font-size:10px;color:#6b7280;padding:6px 0 0;display:flex;align-items:center;justify-content:center;gap:4px;flex-wrap:wrap}",
        ".tfb-theme-menu{display:none;margin:-2px 0 8px;padding:6px;border:1px solid rgba(45,212,168,.25);border-radius:10px;background:rgba(12,16,20,.96)}",
        ".tfb-theme-menu.tfb-open{display:block}",
        ".tfb-theme-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer;font-size:12px;color:#cdd6e2}",
        ".tfb-theme-row:hover{background:rgba(255,255,255,.06)}",
        ".tfb-theme-row.tfb-cur{color:#ffd27a;font-weight:600}",
        ".tfb-theme-row .tfb-theme-check{flex-shrink:0;width:14px;text-align:center}",
        ".tfb-theme-row .tfb-theme-label{flex:1;min-width:0}",
        ".tfb-rename{flex:1;min-width:0;padding:3px 8px;border-radius:6px;border:1px solid rgba(255,210,122,.5);background:rgba(0,0,0,.4);color:#ffd27a;font:inherit;font-size:12px;outline:none}",
        ".tfb-rename:focus{border-color:#ffd27a}",
        ".tfb-ctitle[contenteditable='true']{outline:none;border-bottom:1px dashed #ffd27a;color:#ffd27a;cursor:text}"
      ]).join("\n");
    }

    function listHtml(list) {
      var html = "";
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        var ico = t.status === "completed" ? "✓" : t.status === "in_progress" ? "▶" : "○";
        var txt = t.content.length > MAX_CONTENT ? t.content.slice(0, MAX_CONTENT) + "…" : t.content;
        html += '<li class="tfb-item" data-status="' + t.status + '"><span class="tfb-ico">' + ico + '</span><span class="tfb-txt">' + esc(txt) + "</span></li>";
      }
      return html;
    }

    function pinDotClass(sid) {
      var list = sessionTodos(sid);
      if (!list || !list.length) return "tfb-dot-none";
      var c = countsOf(list);
      if (c.done === c.total) return "tfb-dot-done";
      if (c.active > 0) return "tfb-dot-active";
      return "tfb-dot-none";
    }

    function renderList() {
      if (!ui.list) return;
      var c = currentList().length ? countsOf(currentList()) : { done: 0, active: 0, total: 0 };
      if (ui.ctitle) {
        // while the rename editor is live, don't rebuild the title cell
        if (editing.sid === normSid(currentSid)) { /* keep editor */ }
        else {
          ui.ctitle.textContent = currentSid ? sessionTitle(currentSid) : "";
          ui.ctitle.title = currentSid ? "点击重命名此对话" : "";
        }
      }
      if (ui.summary) {
        var parts = [];
        if (c.done > 0) parts.push(c.done + " 完成");
        if (c.active > 0) parts.push(c.active + " 进行中");
        var pend = c.total - c.done - c.active;
        if (pend > 0) parts.push(pend + " 待办");
        ui.summary.textContent = parts.join(" · ");
      }
      if (ui.pinBtn) {
        var on = currentSid && isPinned(currentSid);
        ui.pinBtn.classList.toggle("tfb-on", !!on);
        ui.pinBtn.title = on ? "取消固定当前会话" : "固定当前会话（切换对话后仍监控）";
        ui.pinBtn.textContent = on ? "📍" : "📌";
      }
      var list = currentList();
      if (!list.length) {
        ui.list.innerHTML = '<li class="tfb-empty">当前会话暂无任务清单<br><span style="font-size:10px">AI 使用 todo_write 后自动显示；📌 可固定会话</span></li>';
      } else {
        ui.list.innerHTML = listHtml(list);
        // user requirement 4: when work remains, remind how to keep the AI
        // going (this plugin is a read-only monitor — continuous thinking
        // is driven by dsh-client-auto-continue, already installed here).
        var cc = countsOf(list);
        if (cc.done < cc.total) {
          var left = cc.total - cc.done;
          ui.list.innerHTML += '<li class="tfb-empty" style="padding:6px 0 2px;font-size:10px">⚠️ 还有 ' + left + ' 项未完成 — 装/启用 dsh-client-auto-continue 可让 AI 连续思考直到清单完成</li>';
        }
      }
      renderPinned();
    }

    function renderPinned() {
      if (!ui.pinSec) return;
      if (pinned.length === 0) { ui.pinSec.innerHTML = ""; return; }
      if (editing.sid) return; // a rename editor is live — don't rebuild under it
      var html = '<div class="tfb-sep"><span class="tfb-sep-label">📌 已固定 (' + pinned.length + ')</span></div>';
      for (var i = 0; i < pinned.length; i++) {
        var sid = pinned[i];
        var list = sessionTodos(sid);
        var c = list ? countsOf(list) : null;
        var tname = sessionTitle(sid);
        var open = !!openPin[sid];
        html += '<div class="tfb-pinrow" data-act="togglePin" data-sid="' + esc(sid) + '">';
        html += '<span class="tfb-dot ' + pinDotClass(sid) + '"></span>';
        html += '<span class="tfb-pinname" title="' + esc(tname) + '">' + esc(tname) + "</span>";
        html += '<span class="tfb-pincount">' + (c ? c.done + "/" + c.total : "…") + "</span>";
        html += '<button class="tfb-btn" data-act="renamePin" data-sid="' + esc(sid) + '" title="重命名">✏️</button>';
        html += '<button class="tfb-btn" data-act="unpin" data-sid="' + esc(sid) + '" title="取消固定">✖</button>';
        html += "</div>";
        if (open) {
          if (list && list.length) {
            html += '<ul class="tfb-pinlist">' + listHtml(list) + "</ul>";
          } else {
            html += '<ul class="tfb-pinlist"><li class="tfb-empty" style="padding:6px 0">暂无数据（该会话产生 todo_write 后自动出现）</li></ul>';
          }
        }
      }
      ui.pinSec.innerHTML = html;
    }

    var THEME_NAMES = { nebula: "🌌 星云·流光", nebB: "🌟 星云·宝石", nebC: "🌙 星云·顶弧", graphite: "💎 石墨版", blue: "🔵 蓝宝石版", glass: "🧊 玻璃版" };

    function renderThemeMenu() {
      if (!ui.themeMenu) return;
      var html = "";
      var order = ["nebula", "nebB", "nebC", "graphite", "blue", "glass"];
      for (var i = 0; i < order.length; i++) {
        var th = order[i];
        var cur = th === currentTheme;
        html += '<div class="tfb-theme-row' + (cur ? " tfb-cur" : "") + '" data-act="setTheme" data-sid="' + th + '">' +
          '<span class="tfb-theme-check">' + (cur ? "✓" : " ") + "</span>" +
          '<span class="tfb-theme-label">' + (THEME_NAMES[th] || th) + "</span>" +
          "</div>";
      }
      ui.themeMenu.innerHTML = html;
    }

    function renderBall() {
      if (!ui.ball) return;
      var st = ballState();
      ui.ball.className = "tfb-ball " + st.cls + (capsule ? " tfb-capsule" : "");
      var labelEl = ui.ball.querySelector(".tfb-label");
      if (labelEl) labelEl.textContent = st.label;
      // progress ring: --pct = done/total*100 (0 when no list; 100 when all
      // done). The conic-gradient ring visualizes completion at a glance.
      var pct = 0;
      var list = currentList();
      if (list.length) {
        var c0 = countsOf(list);
        pct = c0.total > 0 ? Math.round(c0.done / c0.total * 100) : 0;
      }
      try { ui.ball.style.setProperty("--pct", String(pct)); } catch (e) {}
      var sub = "";
      if (capsule) {
        // capsule mode: show the running task (or overall status) in full;
        // overflowing text scrolls back and forth (marquee)
        if (list.length) {
          var c1 = countsOf(list);
          if (c1.done === c1.total) sub = "✓ 全部完成 " + c1.done + "/" + c1.total;
          else {
            var running = "";
            for (var r = 0; r < list.length; r++) {
              if (list[r].status === "in_progress") { running = list[r].content; break; }
            }
            sub = running
              ? "▶ " + running
              : "待办 " + c1.done + "/" + c1.total;
          }
        } else if (pinned.length) {
          for (var i = 0; i < pinned.length; i++) {
            var pl = sessionTodos(pinned[i]);
            if (pl && countsOf(pl).active > 0) { sub = "📌 " + (sessionTitle(pinned[i]) || "固定会话") + " 进行中"; break; }
          }
          if (!sub) sub = "📋 暂无进行中任务";
        } else {
          sub = "📋 暂无任务";
        }
      }
      // ROUND-BALL MODE: show ONLY the progress (user requirement) — no
      // task content on the ball face, since it never fits. The label is
      // done/total (or ✓); the sub line stays empty.
      var subEl = ui.ball.querySelector(".tfb-sub");
      if (subEl) {
        if (capsule) {
          subEl.innerHTML = '<span class="tfb-capsule-text">' + esc(sub) + "</span>";
          var textEl = subEl.querySelector(".tfb-capsule-text");
          if (textEl) {
            // measure AFTER layout: if the text overflows the pill, set the
            // scroll distance so the marquee ping-pongs exactly the overflow
            requestAnimationFrame(function () {
              try {
                var over = textEl.scrollWidth - subEl.clientWidth;
                if (over > 8) {
                  textEl.style.setProperty("--shift", "-" + (over + 6) + "px");
                  textEl.classList.add("tfb-marquee");
                } else {
                  textEl.classList.remove("tfb-marquee");
                }
              } catch (e2) {}
            });
          }
        } else {
          subEl.textContent = "";
        }
      }
      ui.ball.title = capsule
        ? "胶囊模式（右键切回圆球；左键仍可展开面板）"
        : (list.length
          ? "Todo 悬浮球 — 当前 " + summarize(list).head + "（" + pct + "% 完成；左键展开/折叠 · 右键胶囊 · 可拖动）"
          : "Todo 悬浮球 — 当前会话暂无任务（左键展开 · 右键胶囊 · 可拖动）");
    }

    function render() {
      renderBall();
      renderList();
      if (expanded && ui.panel) positionPanel();
    }

    function positionPanel() {
      if (!ui.panel || !ui.ball) return;
      var r = ui.ball.getBoundingClientRect();
      var pw = ui.panel.offsetWidth || 300;
      var ph = ui.panel.offsetHeight || 320;
      var left = r.left + r.width / 2 - pw / 2;
      left = Math.max(8, Math.min(window.innerWidth - pw - 8, left));
      var top = r.top - ph - 12;
      if (top < 8) top = r.bottom + 12;
      ui.panel.style.left = left + "px";
      ui.panel.style.top = top + "px";
    }

    function show() {
      try { applyThemeNow(); } catch (e) {}
      expanded = true;
      if (ui.panel) { ui.panel.classList.add("tfb-open"); positionPanel(); }
    }
    function hide() {
      try { applyThemeNow(); } catch (e) {}
      expanded = false;
      if (ui.panel) ui.panel.classList.remove("tfb-open");
      // 字体插件同款：收起面板时刷新整个插件界面（重载 UI，主题/结构即时生效）
      setTimeout(function () { try { refreshPlugin(); } catch (e) {} }, 120);
    }
    function refreshPlugin() {
      try {
        var h = document.getElementById(BALL_ID);
        if (h) h.remove();
        ui = { root: null, ball: null, panel: null, list: null, summary: null, ctitle: null, pinBtn: null, pinSec: null, themeMenu: null };
        expanded = false;
        buildUI();
        applyBallVisibility();
      } catch (e) {}
    }

    function buildUI() {
      if (document.getElementById(BALL_ID)) return;
      if (!document.body) return;
      try { fetch("/dsh-todo-float-ball/client-alive").catch(function () {}); } catch (e) {}

      var host = document.createElement("div");
      host.id = BALL_ID;

      var shadow = host.attachShadow({ mode: "open" });
      var style = document.createElement("style");
      style.textContent = cssText();
      shadow.appendChild(style);

      var root = document.createElement("div");
      root.className = "tfb-root";
      root.innerHTML =
        '<button class="tfb-ball tfb-idle" type="button">' +
        '<span class="tfb-orb-band"></span>' +
        '<span class="tfb-orb-rim"></span>' +
        '<span class="tfb-ring"></span>' +
        '<span class="tfb-label">✓</span><span class="tfb-sub"></span>' +
        "</button>" +
        '<div class="tfb-panel">' +
        '<div class="tfb-head">' +
        '<span class="tfb-title">📋</span>' +
        '<span class="tfb-ctitle"></span>' +
        '<span class="tfb-summary"></span>' +
        '<button class="tfb-btn" data-act="pin" type="button">📌</button>' +
        '<button class="tfb-btn" data-act="themeMenu" type="button" title="切换皮肤">🎨</button>' +
        '<button class="tfb-btn" data-act="close" type="button" title="折叠">✕</button>' +
        "</div>" +
        '<div class="tfb-theme-menu"></div>' +
        '<ul class="tfb-list"></ul>' +
        '<div class="tfb-pinsec"></div>' +
        '<div class="tfb-hint"><button class="tfb-btn" data-act="resetPos" type="button" title="一键归位右下角">🎯 归位</button> · 切换对话自动跟随 · 📌 固定 · 🎨 皮肤 · Esc 折叠</div>' +
        "</div>";
      shadow.appendChild(root);

      // Mount to <html>, not body — DSH gives body containers transform/filter
      // which break position:fixed children (font-enhancer verified fix).
      var mount = document.documentElement || document.body;
      if (!host.parentNode) mount.appendChild(host);

      ui.root = root;
      ui.ball = root.querySelector(".tfb-ball");
      ui.panel = root.querySelector(".tfb-panel");
      ui.list = root.querySelector(".tfb-list");
      ui.ctitle = root.querySelector(".tfb-ctitle");
      ui.summary = root.querySelector(".tfb-summary");
      ui.pinBtn = root.querySelector('[data-act="pin"]');
      ui.pinSec = root.querySelector(".tfb-pinsec");
      ui.themeMenu = root.querySelector(".tfb-theme-menu");

      // restore position (clamped inside viewport)
      var bw = ui.ball.offsetWidth || 56, bh = ui.ball.offsetHeight || 56;
      try {
        var raw = localStorage.getItem(POS_KEY);
        if (raw) {
          var pos = JSON.parse(raw);
          if (pos && typeof pos.x === "number" && typeof pos.y === "number" &&
              pos.x >= 0 && pos.y >= 0 &&
              pos.x <= window.innerWidth - bw && pos.y <= window.innerHeight - bh) {
            ui.ball.style.left = pos.x + "px";
            ui.ball.style.top = pos.y + "px";
            ui.ball.style.right = "auto";
            ui.ball.style.bottom = "auto";
          }
        }
      } catch (e) {}

      // drag + click-to-toggle (5px threshold separates the two)
      var drag = { active: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0 };
      ui.ball.addEventListener("pointerdown", function (e) {
        drag.active = true; drag.moved = false;
        drag.sx = e.clientX; drag.sy = e.clientY;
        var r = ui.ball.getBoundingClientRect();
        drag.ox = r.left; drag.oy = r.top;
        try { ui.ball.setPointerCapture(e.pointerId); } catch (err) {}
        e.preventDefault();
      });
      ui.ball.addEventListener("pointermove", function (e) {
        if (!drag.active) return;
        var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
        drag.moved = true;
        var nx = Math.max(0, Math.min(window.innerWidth - (ui.ball.offsetWidth || bw), drag.ox + dx));
        var ny = Math.max(0, Math.min(window.innerHeight - (ui.ball.offsetHeight || bh), drag.oy + dy));
        ui.ball.style.left = nx + "px";
        ui.ball.style.top = ny + "px";
        ui.ball.style.right = "auto";
        ui.ball.style.bottom = "auto";
        try { localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(nx), y: Math.round(ny) })); } catch (err) {}
        if (expanded) positionPanel();
      });
      function endDrag(e) {
        if (!drag.active) return;
        drag.active = false;
        try { ui.ball.releasePointerCapture(e.pointerId); } catch (err) {}
        if (!drag.moved) { if (expanded) hide(); else show(); }
      }
      ui.ball.addEventListener("pointerup", endDrag);
      ui.ball.addEventListener("pointercancel", endDrag);

      // RIGHT-CLICK: toggle capsule mode (long pill showing the running
      // task); persists in localStorage.
      ui.ball.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        capsule = !capsule;
        try { localStorage.setItem(CAPSULE_KEY, capsule ? "1" : "0"); } catch (err) {}
        render();
      });

      // delegated actions inside the shadow root
      root.addEventListener("click", function (e) {
        var t = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
        if (!t) {
          // clicking the title text (not while editing) starts a rename
          if (e.target === ui.ctitle && currentSid && hasSessionsSvc) startRename(currentSid);
          return;
        }
        var act = t.getAttribute("data-act");
        var sid = t.getAttribute("data-sid");
        if (act === "close") hide();
        else if (act === "pin") {
          if (!currentSid) return;
          if (isPinned(currentSid)) unpin(currentSid); else pin(currentSid);
        } else if (act === "resetPos") {
          try { localStorage.removeItem(POS_KEY); } catch (err) {}
          if (ui.ball) { ui.ball.style.left = "auto"; ui.ball.style.top = "auto"; ui.ball.style.right = "18px"; ui.ball.style.bottom = "18px"; }
        } else if (act === "themeMenu") {
          // toggle the skin picker inside the panel
          if (ui.themeMenu) ui.themeMenu.classList.toggle("tfb-open");
          renderThemeMenu();
          e.stopPropagation();
        } else if (act === "setTheme" && sid) {
          // pick a skin from the menu
          currentTheme = sid;
          try { localStorage.setItem(THEME_KEY, sid); } catch (err) {}
          try {
            var stEl = ui.root.querySelector("style");
            if (stEl) stEl.textContent = cssText();
          } catch (err) {}
          render();
          renderThemeMenu();
          e.stopPropagation();
        } else if (act === "togglePin" && sid) {
          openPin[sid] = !openPin[sid];
          render();
        } else if (act === "renamePin" && sid) {
          e.stopPropagation();
          startRename(sid);
        } else if (act === "unpin" && sid) {
          e.stopPropagation();
          unpin(sid);
        }
      });

      window.addEventListener("resize", function () { if (expanded) positionPanel(); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && expanded) hide(); });

      render();
    }

    // ---------- entry ----------
    var inject = ["sessions"];
    var currentSessions = null;

    // Skin buttons live in the sibling settings section (React-rendered);
    // React synthetic events / refs proved unreliable there, so the buttons
    // carry plain data attributes and we delegate at the DOCUMENT capture
    // phase — immune to any re-render, and capture fires before anything
    // can stopPropagation.
    function installThemeDelegation() {
      if (window.__dshtfbThemeDelegated) return;
      window.__dshtfbThemeDelegated = true;
      document.addEventListener("click", function (e) {
        var t = e.target && e.target.closest ? e.target.closest("[data-tfb-theme]") : null;
        if (!t) return;
        var theme = t.getAttribute("data-tfb-theme");
        if (theme !== "nebula" && theme !== "graphite" && theme !== "blue" && theme !== "glass" && theme !== "nebB" && theme !== "nebC") return;
        try { localStorage.setItem(THEME_KEY, theme); } catch (err) {}
        currentTheme = theme;
        applyThemeNow();
      }, true);
    }

    // ---------- ball visibility (driven by the shared settings section) ----------
    // The show/hide toggle lives in the shared "悬浮球导航" settings section
    // provided by dsh-skill-browser (same pattern as the font ball). We only
    // read the shared localStorage key and apply it defensively.
    var BALL_VIS_KEY = "dsh-tfb-ball-visible";
    function ballVisible() {
      try { var v = localStorage.getItem(BALL_VIS_KEY); return v == null ? true : v === "1"; } catch (e) { return true; }
    }
    function applyBallVisibility() {
      var b = document.querySelector("#" + BALL_ID);
      if (!b) return;
      var show = ballVisible();
      // Uninstall-fallback (ecosystem safety): the show/hide toggle lives in
      // the shared "悬浮球导航" section provided by dsh-skill-browser. If
      // that plugin is GONE and the stored flag says hidden, the ball would
      // be stuck invisible with no way back — in that case ignore the flag
      // and show the ball again.
      if (!show) {
        var providerGone = !document.getElementById("dsh-skill-browser-ball") &&
          !document.querySelector('[data-dsb-slot]');
        if (providerGone) show = true;
      }
      b.style.setProperty("display", show ? "" : "none", "important");
    }
    function watchBallVisibility() {
      // Long-lived, low-frequency: the shared settings section writes the
      // theme/visibility keys and expects them picked up — so this watcher
      // must NOT expire (the old 20-min cap made skin switching die after
      // 20 minutes). The sibling plugin also calls window.__dshtfbApplyTheme
      // directly for instant effect; the poll is just a safety net.
      setInterval(function () {
        try { applyBallVisibility(); } catch (e) {}
        try {
          var v = null;
          try { v = localStorage.getItem(THEME_KEY); } catch (e2) {}
          if ((v === "graphite" || v === "nebula" || v === "blue" || v === "glass" || v === "nebB" || v === "nebC") && v !== currentTheme) applyThemeNow();
        } catch (e) {}
      }, 2000);
    }
    // Immediate theme application — exposed as window.__dshtfbApplyTheme so
    // the sibling settings section can invoke it synchronously on click.
    function applyThemeNow() {
      try {
        var v = localStorage.getItem(THEME_KEY);
        if (v === "blue") currentTheme = "blue"; else if (v === "nebula") currentTheme = "nebula"; else if (v === "nebB") currentTheme = "nebB"; else if (v === "nebC") currentTheme = "nebC"; else if (v === "glass") currentTheme = "glass"; else currentTheme = "graphite";
      } catch (e) {}
      try {
        if (ui.root) {
          var st = ui.root.querySelector("style");
          if (st) st.textContent = cssText();
        }
      } catch (e) {}
      render();
    }

    function apply(ctx) {
      loadPinned();
      loadTheme();
      try { capsule = localStorage.getItem(CAPSULE_KEY) === "1"; } catch (e) {}
      restorePersisted();
      // primary data channel: the official sessions service
      try {
        if (ctx && ctx.sessions && ctx.sessions.list && typeof ctx.sessions.list.getSnapshot === "function") {
          currentSessions = ctx.sessions;
          hasSessionsSvc = true;
          try { ctx.sessions.list.subscribe(syncFromSessions); } catch (e) {}
          syncFromSessions();
        }
      } catch (e) {}
      // global hook: lets the shared settings section switch the theme
      // synchronously on click (no polling delay).
      try {
        window.__dshtfbApplyTheme = applyThemeNow;
      } catch (e) {}
      // document-level delegation for the sibling skin buttons (React
      // synthetic events / refs unreliable in that slot — plain
      // data-attribute buttons + capture-phase listener always fire)
      installThemeDelegation();
      // UI
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", buildUI);
      } else {
        buildUI();
      }
      applyBallVisibility();
      watchBallVisibility();
      // fallback channel only when the sessions service is unavailable
      if (!hasSessionsSvc) installPanelObserver();
      // watchdog keeps the ball alive across shell rebuilds
      var tries = 0;
      var t = setInterval(function () {
        tries++;
        try {
          if (!document.getElementById(BALL_ID)) buildUI();
          else renderBall();
          if (hasSessionsSvc) syncFromSessions();
        } catch (e) {}
        if (tries > 300) clearInterval(t);
      }, 2000);
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
