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
    var MAX_CONTENT = 80;

    // ---------- multi-session state ----------
    var bySession = {};      // sessionId -> { todos:[{content,status}], sig }
    var titles = {};         // sessionId -> display title
    var pinned = [];         // [sessionId,...] (persisted)
    var currentSid = null;   // active session (from sessions.list.current)
    var hasSessionsSvc = false;
    var currentSessions = null;
    var expanded = false;
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
        if (bySession[sid]) { delete bySession[sid]; render(); }
        return;
      }
      var sig = norm.map(function (t) { return t.status + "|" + t.content; }).join("\n");
      var b = bySession[sid];
      if (b && b.sig === sig) return;
      bySession[sid] = { todos: norm, sig: sig };
      render();
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
    function cssText() {
      return [
        ":host{all:initial}",
        ".tfb-root{position:static;pointer-events:none;font-family:'Segoe UI','Microsoft YaHei',system-ui,sans-serif}",
        ".tfb-ball{position:fixed;right:18px;bottom:18px;z-index:2147483600;width:56px;height:56px;border-radius:50%;border:0;cursor:grab;user-select:none;touch-action:none;pointer-events:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;color:#fff;font-size:13px;font-weight:700;line-height:1.1;background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.2),rgba(40,44,54,.95) 70%);box-shadow:0 4px 24px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.15);transition:transform .15s ease}",
        ".tfb-ball:active{cursor:grabbing;transform:scale(.95)}",
        ".tfb-ball .tfb-sub{font-size:9px;font-weight:500;opacity:.85;max-width:48px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
        ".tfb-active{background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.25),rgba(200,110,20,.95) 70%);animation:tfb-pulse 1.6s ease-in-out infinite}",
        ".tfb-done{background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.25),rgba(30,130,70,.95) 70%)}",
        ".tfb-pending{background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.2),rgba(50,80,140,.95) 70%)}",
        ".tfb-idle{background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.12),rgba(70,74,84,.9) 70%)}",
        "@keyframes tfb-pulse{0%,100%{box-shadow:0 4px 24px rgba(0,0,0,.6),0 0 0 0 rgba(230,140,40,.45)}50%{box-shadow:0 4px 24px rgba(0,0,0,.6),0 0 0 10px rgba(230,140,40,0)}}",
        ".tfb-panel{position:fixed;z-index:2147483600;width:300px;max-width:calc(100vw - 24px);max-height:74vh;overflow-y:auto;overflow-x:hidden;pointer-events:auto;display:none;color:#e6e6e6;font-size:13px;line-height:1.5;border-radius:14px;padding:12px 14px;background:rgba(18,20,26,.95);border:1px solid rgba(255,255,255,.1);box-shadow:0 16px 48px rgba(0,0,0,.7);backdrop-filter:blur(20px)}",
        ".tfb-panel.tfb-open{display:block}",
        ".tfb-head{display:flex;align-items:center;gap:6px;margin-bottom:6px}",
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
        ".tfb-item[data-status='completed'] .tfb-ico{background:rgba(40,170,90,.2);color:#4ade80;border:1px solid rgba(74,222,128,.35)}",
        ".tfb-item[data-status='in_progress'] .tfb-ico{background:rgba(230,140,40,.18);color:#fbbf24;border:1px solid rgba(251,191,36,.4)}",
        ".tfb-item[data-status='pending'] .tfb-ico{background:rgba(120,128,140,.15);color:#a8b0bd;border:1px dashed rgba(168,176,189,.45)}",
        ".tfb-item[data-status='in_progress']{background:rgba(230,140,40,.07)}",
        ".tfb-item[data-status='completed'] .tfb-txt{color:#8f96a3;text-decoration:line-through}",
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
        ".tfb-hint{font-size:10px;color:#6b7280;text-align:center;padding:6px 0 0}",
        ".tfb-rename{flex:1;min-width:0;padding:3px 8px;border-radius:6px;border:1px solid rgba(255,210,122,.5);background:rgba(0,0,0,.4);color:#ffd27a;font:inherit;font-size:12px;outline:none}",
        ".tfb-rename:focus{border-color:#ffd27a}",
        ".tfb-ctitle[contenteditable='true']{outline:none;border-bottom:1px dashed #ffd27a;color:#ffd27a;cursor:text}"
      ].join("\n");
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

    function renderBall() {
      if (!ui.ball) return;
      var st = ballState();
      ui.ball.className = "tfb-ball " + st.cls;
      var labelEl = ui.ball.querySelector(".tfb-label");
      if (labelEl) labelEl.textContent = st.label;
      var sub = "";
      var list = currentList();
      if (list.length) {
        var s = summarize(list);
        if (s.detail) sub = s.detail;
      } else if (pinned.length) {
        for (var i = 0; i < pinned.length; i++) {
          var pl = sessionTodos(pinned[i]);
          if (pl && countsOf(pl).active > 0) { sub = "📌 进行中"; break; }
        }
      }
      var subEl = ui.ball.querySelector(".tfb-sub");
      if (subEl) subEl.textContent = sub;
      ui.ball.title = list.length
        ? "Todo 悬浮球 — 当前 " + summarize(list).head + "（点击展开/折叠，可拖动）"
        : "Todo 悬浮球 — 当前会话暂无任务（点击展开，可拖动）";
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
      expanded = true;
      if (ui.panel) { ui.panel.classList.add("tfb-open"); positionPanel(); }
    }
    function hide() {
      expanded = false;
      if (ui.panel) ui.panel.classList.remove("tfb-open");
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
        '<span class="tfb-label">✓</span><span class="tfb-sub"></span>' +
        "</button>" +
        '<div class="tfb-panel">' +
        '<div class="tfb-head">' +
        '<span class="tfb-title">📋</span>' +
        '<span class="tfb-ctitle"></span>' +
        '<span class="tfb-summary"></span>' +
        '<button class="tfb-btn" data-act="pin" type="button">📌</button>' +
        '<button class="tfb-btn" data-act="close" type="button" title="折叠">✕</button>' +
        "</div>" +
        '<ul class="tfb-list"></ul>' +
        '<div class="tfb-pinsec"></div>' +
        '<div class="tfb-hint">切换对话自动跟随 · 📌 固定后跨对话监控 · Esc 折叠</div>' +
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

    function apply(ctx) {
      loadPinned();
      // primary data channel: the official sessions service
      try {
        if (ctx && ctx.sessions && ctx.sessions.list && typeof ctx.sessions.list.getSnapshot === "function") {
          currentSessions = ctx.sessions;
          hasSessionsSvc = true;
          try { ctx.sessions.list.subscribe(syncFromSessions); } catch (e) {}
          syncFromSessions();
        }
      } catch (e) {}
      // UI
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", buildUI);
      } else {
        buildUI();
      }
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
