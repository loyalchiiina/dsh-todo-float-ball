// dsh-todo-float-ball - host half.
// Minimal dual-face mount pattern (identical to the verified dsh-font-enhancer):
// the host registers a loopback-only health route so the bundle has a real
// cordis activate (inject=['webServer']); the visual work lives in lib/client.js,
// mounted by the client-modules system once the host activates. Works on both
// web and desktop profiles.

var SETTINGS_PREFIX = "/dsh-todo-float-ball";

export var name = "dsh-todo-float-ball";
export var inject = ["webServer"];

function isLoopback(req) {
  var a = (req.socket && req.socket.remoteAddress) || "";
  var n = a.toLowerCase();
  if (n === "::1") return true;
  if (n.startsWith("::ffff:")) return n.slice(7).startsWith("127.");
  return n.startsWith("127.");
}

export function apply(ctx) {
  ctx.logger.info("dsh-todo-float-ball: host half mounted (health api + client)");
  ctx.effect(function () {
    var h1 = ctx.webServer.register({ kind: "exact", path: SETTINGS_PREFIX + "/health", handler: function (req, res) {
      if (!isLoopback(req)) { res.writeHead(403); res.end(); return; }
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, plugin: "dsh-todo-float-ball", version: "0.1.0" }));
    }});
    var h2 = ctx.webServer.register({ kind: "exact", path: SETTINGS_PREFIX + "/client-alive", handler: function (req, res) {
      ctx.logger.info("dsh-todo-float-ball: CLIENT-ALIVE ping received from browser");
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
    }});
    return function () { h1(); h2(); };
  }, "dsh-todo-float-ball: health routes");
}
