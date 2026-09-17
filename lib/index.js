// dsh-todo-float-ball - host half.
// Dual-face mount (identical shape to the verified dsh-font-enhancer):
//   (1) the host registers a loopback-only health route so the bundle has a real
//       cordis activate (inject=['webServer']);
//   (2) since v0.9.0 the host ALSO injects a short "todo discipline" system-prompt
//       section (inject adds 'systemPrompt'), so the todo rules hold in every
//       session / preset / desktop+web build even when the `todo-show-discipline`
//       skill was never loaded (skills are loaded on demand, the prompt section is
//       resident). The long-form rules stay in the skill; this text carries only
//       the 5 hardest ones, because a system-prompt section costs tokens in EVERY
//       session.
// The visual work still lives in lib/client.js, mounted by the client-modules
// system once the host activates. Works on both web and desktop profiles.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Version reported by the health route, read from package.json so it can never
// drift from the released version again (it was hardcoded to "0.1.0" from the
// 0.1.0 skeleton until 2026-09-10, and kept reporting 0.1.0 while the package
// had moved on to 0.8.0/0.9.0). Falls back to "unknown" if the file cannot be
// read, so the route never throws.
var PKG_VERSION = (function () {
  try {
    var here = dirname(fileURLToPath(import.meta.url));
    return JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")).version;
  } catch (e) {
    return "unknown";
  }
})();

var SETTINGS_PREFIX = "/dsh-todo-float-ball";

// Stable identifier of the injected prompt section (same naming style as
// dsh-taskboard's own `TASKBOARD_PROTOCOL` section).
var DISCIPLINE_SECTION_NAME = "todo-discipline";

// Sort position. section() orders are plain numbers sorted ascending; the
// built-in band is DEPLOYMENT_PERSONA=0 -> PLAN_POLICY=500 -> TEAM_POLICY=600
// (see @deepseek-ai/dsh-system-prompt SECTION_ORDERS), and dsh-taskboard puts
// its protocol section at 180. 190 therefore keeps this discipline inside the
// same "how to work" band as the task-board protocol (rendered right after it,
// so the two work-discipline blocks stay together), stays clear of the 500
// plan-policy boundary, and leaves 181..189 free for future sections.
var DISCIPLINE_SECTION_ORDER = 190;

// Injected text - Chinese, deliberately short (hard character budget: <=500,
// actual ~400). Only the 6 hardest rules; everything else belongs to the
// `todo-show-discipline` skill, which is loaded on demand.
var DISCIPLINE_TEXT = [
  "【todo 进度表纪律 · 由 dsh-todo-float-ball 插件常驻注入，无需加载技能】",
  "1. 每个回复 turn 的第一个工具调用必须是 todo_write：覆盖式写回完整清单；先写 todo，再做检查、汇报或执行。",
  "2. 清单只增不减：已完成项保留并标 completed，绝不删除、折叠或合并；新任务到达但旧任务未完成时合并追加，禁止替换式清空重写。",
  "3. 进行中项必须带实时进度数字（如「19号 120rpm 求解 278/1000」）；每完成一步立即刷新状态。",
  "4. 用户说「消失／少了／不见了／关了」＝ 本纪律被违反：立即补全完整清单，并说明当轮首动作漏写。",
  "5. 全部任务实际完成时也要再写一次 todo_write（全标 completed），不得残留 in_progress／pending。",
  "6. 🔴 正文待办必入清单（2026-09-17 用户强制）：回复正文一旦出现「待办／待审批／还没弄的／未完成／后续要」事项，必须同轮将其同步追加进 todo 清单，禁止只写在正文不进清单；正文待办与 todo 清单必须一致（曾实测漏写：正文列 3 项待办未入清单）。"
].join("\n");

export var name = "dsh-todo-float-ball";
export var inject = ["webServer", "systemPrompt"];

function isLoopback(req) {
  var a = (req.socket && req.socket.remoteAddress) || "";
  var n = a.toLowerCase();
  if (n === "::1") return true;
  if (n.startsWith("::ffff:")) return n.slice(7).startsWith("127.");
  return n.startsWith("127.");
}

export function apply(ctx, config) {
  ctx.logger.info("dsh-todo-float-ball: host half mounted (health api + client)");

  // Config switch `injectDiscipline` (default true).
  // The default is deliberately permissive: an install that carries no `config`
  // row at all - every existing user, including both local profiles - keeps the
  // discipline ON, so this feature is "install the plugin and it works".
  // Turn it OFF from the inserted bundle row (the plugin's own
  // cordis.patch.yml, or a manual mount line in the profile's patch):
  //   - insert:
  //       - id: dsh-todo-float-ball
  //         name: dsh-todo-float-ball
  //         config:
  //           injectDiscipline: false
  // Only an explicit boolean false disables it, so "0"/""/typos cannot silently
  // switch the discipline off. When disabled the section is NOT registered at
  // all (no empty-text section is left behind).
  var injectDiscipline = !(config && config.injectDiscipline === false);
  if (injectDiscipline) {
    var disposeSection = ctx.systemPrompt.section({
      name: DISCIPLINE_SECTION_NAME,
      order: DISCIPLINE_SECTION_ORDER,
      text: DISCIPLINE_TEXT
    });
    ctx.effect(function () { return disposeSection; }, "dsh-todo-float-ball: todo discipline section");
    ctx.logger.info("dsh-todo-float-ball: todo discipline prompt section registered (order " + DISCIPLINE_SECTION_ORDER + ", " + DISCIPLINE_TEXT.length + " chars)");
  } else {
    ctx.logger.info("dsh-todo-float-ball: todo discipline prompt section disabled by config (injectDiscipline: false)");
  }

  // ---------------------------------------------------------------------------
  // v0.13.0: HARD GATE - first tool call of every turn must be todo_write.
  //
  // Why: the injected prompt section above is advisory text; in practice the
  // agent (this very plugin's author included) sometimes "forgets" to write the
  // todo list at the start of a turn, especially during long autonomous runs,
  // and the float ball then shows a stale list. Text cannot enforce itself, so
  // this is enforced at the tool dispatch layer instead: the first tool
  // invocation of a turn that is NOT `todo_write` is DENIED with a reason the
  // model reads back, so it corrects itself immediately.
  //
  // How it decides "first tool call of the turn": dsh-agent-loop appends the
  // durable `tool/call` event BEFORE dispatching the call (appendToolCall runs
  // before the dsh-tools scheduler reaches tools/pre-execute), so when the
  // gate runs, exactly one `tool/call` exists in the current turn if this is
  // the first one.
  //
  // Safety: every path is wrapped in try/catch and ANY unexpected shape falls
  // through to next() (allow). A mis-detection therefore degrades to "gate does
  // nothing", never to "blocks legitimate work".
  // ---------------------------------------------------------------------------
  var gateEnabled = !(config && config.enforceFirstTodoWrite === false);
  if (gateEnabled) {
    ctx.on("tools/pre-execute", async function (exec, next) {
      try {
        if (exec && exec.name === "todo_write") return next();
        var session = exec && exec.agent && exec.agent.session;
        if (!session || typeof session.snapshotEvents !== "function") return next();
        var events = session.snapshotEvents();
        if (!events || typeof events[Symbol.iterator] !== "function") return next();
        var toolCallsThisTurn = 0;
        for (var ev of events) {
          var type = ev && ev.type;
          if (type === "turn/start") toolCallsThisTurn = 0;
          else if (type === "tool/call") toolCallsThisTurn++;
        }
        if (toolCallsThisTurn === 1) {
          ctx.logger.info("dsh-todo-float-ball: GATE denied first-tool \"" + String(exec.name) + "\" (expected todo_write)");
          return {
            kind: "deny",
            reason: "【todo 进度表纪律·硬约束】每个回复 turn 的第一个工具调用必须是 todo_write（覆盖式写回完整清单：已完成的保留并标 completed、只增不减、进行中项带进度数字）。本轮你还没有写 todo 清单。请先用 todo_write 写回完整清单，再执行其它工具调用。"
          };
        }
      } catch (err) {
        try { ctx.logger.warn("dsh-todo-float-ball: todo gate error, allowing call: " + String(err)); } catch (_) {}
      }
      return next();
    });
    ctx.logger.info("dsh-todo-float-ball: hard gate registered (first tool call of a turn must be todo_write)");
  } else {
    ctx.logger.info("dsh-todo-float-ball: hard gate disabled by config (enforceFirstTodoWrite: false)");
  }

  ctx.effect(function () {
    var h1 = ctx.webServer.register({ kind: "exact", path: SETTINGS_PREFIX + "/health", handler: function (req, res) {
      if (!isLoopback(req)) { res.writeHead(403); res.end(); return; }
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, plugin: "dsh-todo-float-ball", version: PKG_VERSION }));
    }});
    var h2 = ctx.webServer.register({ kind: "exact", path: SETTINGS_PREFIX + "/client-alive", handler: function (req, res) {
      ctx.logger.info("dsh-todo-float-ball: CLIENT-ALIVE ping received from browser");
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
    }});
    return function () { h1(); h2(); };
  }, "dsh-todo-float-ball: health routes");
}
