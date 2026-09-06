window.__ModuleLoader__.load({
  id: "dsh-todo-float-ball",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;

    // ============================================================
    // dsh-todo-float-ball — client half (browser).
    // A persistent, draggable floating ball that mirrors the current
    // session's todo_write list: total / done / active counts, expandable
    // full list, per-status colors. Data comes from two channels:
    //   A (primary):   MutationObserver over the official todo panel
    //                  ([data-testid="todo-panel"]) rendered by
    //                  @deepseek-ai/dsh-client-ui-conversation.
    //   B (fallback):  wraps window.fetch + WebSocket message handling to
    //                  catch `{type:"projection", key:"todos", value:[...]}`
    //                  frames even when the official panel is collapsed
    //                  (collapsed panels render no list, only the header).
    // UI lives inside a Shadow DOM so plugin styles never leak in or out.
    // ============================================================

    var BALL_ID = "dsh-tfb-root";
    var POS_KEY = "dsh-todo-float-ball-pos";
    var MAX_CONTENT = 80;

    // ---------- state ----------
    var todos = [];          // latest known todo list [{content, status}]
    var hasData = false;     // true once any channel delivered a list
    var expanded = false;
    var ui = { root: null, ball: null, panel: null, list: null, badge: null, summary: null };

    // ---------- helpers ----------
    function esc(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function counts() {
      var done = 0, active = 0;
      for (var i = 0; i < todos.length; i++) {
        if (todos[i].status === "completed") done++;
        else if (todos[i].status === "in_progress") active++;
      }
      return { done: done, active: active, total: todos.length };
    }

    function summarize() {
      var c = counts();
      var head = c.done + "/" + c.total;
      var detail = "";
      if (c.active > 0) {
        var first = null;
        for (var i = 0; i < todos.length; i++) {
          if (todos[i].status === "in_progress") { first = todos[i].content; break; }
        }
        if (first) detail = first.length > 30 ? first.slice(0, 30) + "…" : first;
        if (c.active > 1) detail += " (+" + (c.active - 1) + ")";
      }
      return { head: head, detail: detail, c: c };
    }

    // Ball color follows the current work status:
    //   all completed        -> green
    //   something in progress-> orange (pulsing)
    //   only pending         -> blue/gray
    //   no data yet          -> neutral gray
    function ballState() {
      if (!hasData || todos.length === 0) return { cls: "tfb-idle", label: "✓" };
      var c = counts();
      if (c.done === c.total) return { cls: "tfb-done", label: "✓" };
      if (c.active > 0) return { cls: "tfb-active", label: String(c.done) + "/" + String(c.total) };
      return { cls: "tfb-pending", label: String(c.done) + "/" + String(c.total) };
    }

    // ---------- data ingestion (both channels funnel here) ----------
    function setTodos(list) {
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
      if (norm.length === 0) return;
      // cheap change detection: same statuses+contents in same order = no-op
      var sig = norm.map(function (t) { return t.status + "|" + t.content; }).join("\n");
      if (sig === todos.__tfbSig) return;
      todos.__tfbSig = sig;
      todos = norm;
      hasData = true;
      render();
    }

    // Channel B: extract a todos array from any JSON text that may contain a
    // projection frame ({type:"projection", key:"todos", value:[...]}) or a
    // log snapshot ({... "todos": [...]}). Tolerates SSE-ish multi-line bodies.
    function tryIngest(text) {
      if (typeof text !== "string" || text.length > 2 * 1024 * 1024) return;
      if (text.indexOf('"todos"') < 0) return;
      var candidates = [];
      try {
        var whole = JSON.parse(text);
        if (whole && typeof whole === "object") candidates.push(whole);
      } catch (e) {
        var lines = text.split("\n");
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (line.length < 12 || line.indexOf('"todos"') < 0) continue;
          if (line.charAt(0) === "d" && line.indexOf("data:") === 0) line = line.slice(5).trim();
          try {
            var j = JSON.parse(line);
            if (j && typeof j === "object") candidates.push(j);
          } catch (e2) {}
        }
      }
      for (var k = 0; k < candidates.length; k++) {
        var obj = candidates[k];
        if (obj.key === "todos" && obj.value !== undefined && obj.value !== null) { setTodos(obj.value); return; }
        if (Array.isArray(obj.todos)) { setTodos(obj.todos); return; }
        if (obj.data && typeof obj.data === "object" && Array.isArray(obj.data.todos)) { setTodos(obj.data.todos); return; }
      }
    }

    // Channel B wiring — install once per page lifetime.
    function installFetchTap() {
      if (window.__dshtfbFetchPatched) return;
      window.__dshtfbFetchPatched = true;
      try {
        var origFetch = window.fetch;
        if (typeof origFetch !== "function") return;
        window.fetch = function () {
          var p = origFetch.apply(this, arguments);
          try {
            p.then(function (res) {
              try {
                var ct = "";
                try { ct = (res.headers && res.headers.get && res.headers.get("content-type")) || ""; } catch (e) {}
                if (ct.indexOf("javascript") >= 0 || ct.indexOf("font") >= 0 || ct.indexOf("image") >= 0) return;
                res.clone().text().then(function (t) { tryIngest(t); }).catch(function () {});
              } catch (e) {}
            }).catch(function () {});
          } catch (e) {}
          return p;
        };
      } catch (e) {}
      // WebSocket: tap incoming message text frames too (some builds stream
      // control frames over ws instead of fetch).
      try {
        var WS = window.WebSocket;
        if (typeof WS === "function" && typeof WS.prototype.send === "function" && !WS.__dshtfbTapped) {
          WS.__dshtfbTapped = true;
          var desc = Object.getOwnPropertyDescriptor(WS.prototype, "onmessage");
          if (desc && desc.set) {
            Object.defineProperty(WS.prototype, "onmessage", {
              get: desc.get,
              set: function (fn) {
                var wrapped = function (ev) {
                  try {
                    var d = ev && ev.data;
                    if (typeof d === "string") tryIngest(d);
                    else if (d && typeof d.size === "number" && d.size < 512 * 1024 && typeof d.text === "function") {
                      d.text().then(function (t) { tryIngest(t); }).catch(function () {});
                    }
                  } catch (e) {}
                  return fn.apply(this, arguments);
                };
                try { wrapped.__dshtfb = true; } catch (e) {}
                desc.set.call(this, wrapped);
              },
              configurable: true,
              enumerable: desc.enumerable
            });
          }
        }
      } catch (e) {}
    }

    // Channel A: observe the official todo panel. Expanded panel renders
    // ul > li[data-status] with a content span; collapsed renders only the
    // header (counts live in its progress label text like "2 完成 · 1 进行中").
    function installPanelObserver() {
      var mo = new MutationObserver(function () {
        // scheduled via rAF-ish debounce to avoid thrash during streaming
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

    // Reads the official panel DOM. Full list when expanded; header-only
    // counts when collapsed. Never touches or modifies the panel itself.
    function readOfficialPanel() {
      var panel = document.querySelector('[data-testid="todo-panel"]');
      if (!panel) return;
      // expanded: full list
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
        if (list.length > 0) { setTodos(list); return; }
      }
      // collapsed: parse the progress label text ("1 完成 · 2 进行中 · 3 待办")
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
      // Reconstruct a minimal list skeleton from counts only when we have
      // nothing better (panel-only data is weaker than projection frames).
      if (!isNaN(done) || !isNaN(active) || !isNaN(pending)) {
        if (!hasData) {
          var skel = [];
          for (var d = 0; d < (isNaN(done) ? 0 : done); d++) skel.push({ content: "已完成任务", status: "completed" });
          for (var a = 0; a < (isNaN(active) ? 0 : active); a++) skel.push({ content: "进行中任务", status: "in_progress" });
          for (var p = 0; p < (isNaN(pending) ? 0 : pending); p++) skel.push({ content: "待办任务", status: "pending" });
          if (skel.length > 0) setTodos(skel);
        }
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
        ".tfb-panel{position:fixed;z-index:2147483600;width:280px;max-width:calc(100vw - 24px);max-height:70vh;overflow-y:auto;overflow-x:hidden;pointer-events:auto;display:none;color:#e6e6e6;font-size:13px;line-height:1.5;border-radius:14px;padding:12px 14px;background:rgba(18,20,26,.95);border:1px solid rgba(255,255,255,.1);box-shadow:0 16px 48px rgba(0,0,0,.7);backdrop-filter:blur(20px)}",
        ".tfb-panel.tfb-open{display:block}",
        ".tfb-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}",
        ".tfb-title{font-weight:700;font-size:13px}",
        ".tfb-summary{font-size:11px;color:#9aa3b2}",
        ".tfb-close{border:0;background:transparent;color:#9aa3b2;font-size:14px;cursor:pointer;padding:2px 6px}",
        ".tfb-close:hover{color:#e6e6e6}",
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
        ".tfb-empty{color:#8b93a1;font-size:12px;text-align:center;padding:14px 0}",
        ".tfb-foot{margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.07);font-size:10px;color:#6b7280;text-align:center}"
      ].join("\n");
    }

    function renderList() {
      if (!ui.list) return;
      var c = counts();
      if (!hasData || todos.length === 0) {
        ui.list.innerHTML = '<li class="tfb-empty">暂无任务清单<br><span style="font-size:10px">当 AI 使用 todo_write 后自动显示</span></li>';
        return;
      }
      var html = "";
      for (var i = 0; i < todos.length; i++) {
        var t = todos[i];
        var ico = t.status === "completed" ? "✓" : t.status === "in_progress" ? "▶" : "○";
        var txt = t.content.length > MAX_CONTENT ? t.content.slice(0, MAX_CONTENT) + "…" : t.content;
        html += '<li class="tfb-item" data-status="' + t.status + '"><span class="tfb-ico">' + ico + '</span><span class="tfb-txt">' + esc(txt) + "</span></li>";
      }
      ui.list.innerHTML = html;
      if (ui.summary) {
        var parts = [];
        if (c.done > 0) parts.push(c.done + " 完成");
        if (c.active > 0) parts.push(c.active + " 进行中");
        var pend = c.total - c.done - c.active;
        if (pend > 0) parts.push(pend + " 待办");
        ui.summary.textContent = parts.join(" · ");
      }
    }

    function renderBall() {
      if (!ui.ball) return;
      var st = ballState();
      ui.ball.className = "tfb-ball " + st.cls;
      var sub = "";
      if (hasData && todos.length > 0) {
        var s = summarize();
        if (s.detail) sub = s.detail;
      }
      var subEl = ui.ball.querySelector(".tfb-sub");
      if (subEl) subEl.textContent = sub;
      ui.ball.title = hasData && todos.length > 0
        ? "Todo 悬浮球 — " + summarize().head + "（点击展开/折叠，可拖动）"
        : "Todo 悬浮球 — 暂无任务（点击展开，可拖动）";
    }

    function render() {
      renderBall();
      renderList();
      if (expanded && ui.panel) positionPanel();
    }

    function positionPanel() {
      if (!ui.panel || !ui.ball) return;
      var r = ui.ball.getBoundingClientRect();
      var pw = ui.panel.offsetWidth || 280;
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
        '<div class="tfb-head"><span class="tfb-title">📋 任务清单</span><span class="tfb-summary"></span><button class="tfb-close" type="button" title="折叠">✕</button></div>' +
        '<ul class="tfb-list"></ul>' +
        '<div class="tfb-foot">dsh-todo-float-ball · 数据实时同步自 todo_write</div>' +
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
      ui.badge = root.querySelector(".tfb-label");
      ui.summary = root.querySelector(".tfb-summary");

      // restore position (clamped inside viewport so a stale position can
      // never push the ball off-screen)
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

      root.querySelector(".tfb-close").addEventListener("click", hide);
      window.addEventListener("resize", function () { if (expanded) positionPanel(); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && expanded) hide(); });

      render();
    }

    // ---------- entry ----------
    var inject = [];
    function apply(ctx) {
      // Channel B first (catches early projection frames), then UI, then
      // channel A observer.
      installFetchTap();
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", buildUI);
      } else {
        buildUI();
      }
      installPanelObserver();
      // periodic re-render keeps the ball honest if styles/DOM get rebuilt
      // around it (Electron focus re-runs etc.)
      var tries = 0;
      var t = setInterval(function () {
        tries++;
        try {
          if (!document.getElementById(BALL_ID)) buildUI();
          else renderBall();
        } catch (e) {}
        if (tries > 300) clearInterval(t);
      }, 2000);
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
