/**
 * Local preview: same UI bundle as Apps Script + API either local JSON or your
 * deployed web app (real Google Sheet: list/create/update/delete/import/tags).
 *
 * Sheet-backed mode — set DIARY_REMOTE_WEBAPP_URL to the web app URL (…/exec):
 *   DIARY_REMOTE_WEBAPP_URL="https://script.google.com/macros/s/…/exec" npm run preview
 *
 * Requires Node 18+ when using remote mode (global fetch).
 */
/* eslint-disable no-console */
"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");
var url = require("url");

var REPO_ROOT = path.join(__dirname, "..");
var STORE_FILE = path.join(__dirname, "local-diary-data.json");
var DEFAULT_PORT = 3333;

function readUtf8(relFromRoot) {
  return fs.readFileSync(path.join(REPO_ROOT, relFromRoot), "utf8");
}

/** Trimmed deployed web app base URL, or "" for local-only JSON store. */
function getRemoteWebAppBaseUrl() {
  var u =
    process.env.DIARY_REMOTE_WEBAPP_URL ||
    process.env.APPS_SCRIPT_WEBAPP_URL ||
    "";
  u = String(u).trim().replace(/\/$/, "");
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) {
    console.warn(
      "DIARY_REMOTE_WEBAPP_URL must be a full URL (https://…/exec). Ignoring."
    );
    return "";
  }
  return u;
}

function buildListUrl(remoteBase) {
  var u = new URL(remoteBase);
  u.searchParams.set("action", "list");
  return u.href;
}

function parseRemoteJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return {
      ok: false,
      error:
        "Remote returned non-JSON. First 400 chars:\n" + String(text).slice(0, 400),
    };
  }
}

function forwardRemoteList(remoteBase) {
  if (typeof global.fetch !== "function") {
    return Promise.reject(
      new Error("Node 18+ required for Google Sheet mode (global fetch).")
    );
  }
  return global
    .fetch(buildListUrl(remoteBase), { redirect: "follow" })
    .then(function (r) {
      return r.text();
    })
    .then(parseRemoteJson);
}

function forwardRemotePost(remoteBase, bodyObj) {
  if (typeof global.fetch !== "function") {
    return Promise.reject(
      new Error("Node 18+ required for Google Sheet mode (global fetch).")
    );
  }
  return global
    .fetch(remoteBase, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(bodyObj),
    })
    .then(function (r) {
      return r.text();
    })
    .then(parseRemoteJson);
}

function buildAssembledIndex(port, opts) {
  opts = opts || {};
  var index = readUtf8("Index.html");
  var baseUrl = "http://127.0.0.1:" + port;
  index = index.replace(
    /<\?!=\s*include\('DiaryStyles'\);\s*\?>/g,
    readUtf8("DiaryStyles.html")
  );
  index = index.replace(
    /<\?!=\s*include\('DiaryUiVanilla'\);\s*\?>/g,
    readUtf8("DiaryUiVanilla.html")
  );
  index = index.replace(
    /<\?!=\s*JSON\.stringify\(webAppUrl\s*\|\|\s*""\)\s*\?>/g,
    JSON.stringify(baseUrl)
  );
  if (opts.remoteBackend) {
    index = index.replace(
      /<body>/,
      "<body>" +
        '<div style="background:#2a1f0d;color:#f8d99a;padding:0.4rem 0.75rem;font-size:0.78rem;text-align:center;border-bottom:1px solid #5c4518;font-weight:600;" role="status">' +
        "Local preview UI — read/write <strong>your live Google Sheet</strong> via deployed web app" +
        "</div>"
    );
  }
  return index;
}

function normalizeLineEndings(s) {
  return String(s == null ? "" : s)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function isEffectivelyEmptyText(s) {
  return !/[^\s\u00A0]/.test(normalizeLineEndings(s));
}

function formatDateTime(d) {
  var pad = function (n) {
    return n < 10 ? "0" + n : "" + n;
  };
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    " " +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes()) +
    ":" +
    pad(d.getSeconds())
  );
}

function normalizeTagsInput(tags) {
  if (!tags) return [];
  var arr = Array.isArray(tags) ? tags : String(tags).split(",");
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    var t = String(arr[i])
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (!t) continue;
    if (t.length > 40) t = t.substring(0, 40);
    if (out.indexOf(t) < 0) out.push(t);
  }
  return out.slice(0, 12);
}

function normalizeSentiment(s) {
  if (s == null || s === "") return null;
  var v = String(s).trim();
  if (v === "Positive" || v === "Negative" || v === "Neutral") return v;
  return null;
}

function buildEntry(id, created_at, raw_text, summary, tags, sentiment) {
  return {
    id: id,
    created_at: created_at,
    raw_text: raw_text,
    summary: summary,
    tags: tags,
    sentiment: sentiment,
  };
}

function loadStore() {
  try {
    var raw = fs.readFileSync(STORE_FILE, "utf8");
    var data = JSON.parse(raw);
    if (!data || !Array.isArray(data.entries)) return { entries: [] };
    return data;
  } catch (_) {
    return { entries: [] };
  }
}

function saveStore(data) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf8");
}

function nextId(entries) {
  var maxId = 0;
  for (var i = 0; i < entries.length; i++) {
    var n = Number(entries[i].id);
    if (!isNaN(n) && n > maxId) maxId = n;
  }
  return maxId + 1;
}

function handleCreate_(store, p) {
  var raw = normalizeLineEndings(p.raw_text);
  if (isEffectivelyEmptyText(raw))
    return { ok: false, error: "raw_text is required" };

  var id = nextId(store.entries);
  var created =
    p.created_at && String(p.created_at).trim()
      ? String(p.created_at).trim()
      : formatDateTime(new Date());
  var summary = normalizeLineEndings(p.summary);
  var tags = normalizeTagsInput(p.tags);
  var sentiment = normalizeSentiment(p.sentiment);
  var entry = buildEntry(id, created, raw, summary, tags, sentiment);
  store.entries.push(entry);
  saveStore(store);
  return { ok: true, entry: entry };
}

function findIndexById(entries, id) {
  var target = Number(id);
  for (var i = 0; i < entries.length; i++) {
    if (Number(entries[i].id) === target) return i;
  }
  return -1;
}

function handleUpdate_(store, p) {
  var id = Number(p.id);
  if (!id) return { ok: false, error: "id is required" };
  var raw = normalizeLineEndings(p.raw_text);
  if (isEffectivelyEmptyText(raw))
    return { ok: false, error: "raw_text is required" };

  var idx = findIndexById(store.entries, id);
  if (idx < 0) return { ok: false, error: "entry not found" };

  var cur = store.entries[idx];
  var summary = p.hasOwnProperty("summary")
    ? normalizeLineEndings(p.summary)
    : cur.summary;
  var tags = p.hasOwnProperty("tags") ? normalizeTagsInput(p.tags) : cur.tags;
  var sentiment = p.hasOwnProperty("sentiment")
    ? normalizeSentiment(p.sentiment)
    : cur.sentiment;

  var entry = buildEntry(id, cur.created_at, raw, summary, tags, sentiment);
  store.entries[idx] = entry;
  saveStore(store);
  return { ok: true, entry: entry };
}

function handleDelete_(store, p) {
  var id = Number(p.id);
  if (!id) return { ok: false, error: "id is required" };
  var idx = findIndexById(store.entries, id);
  if (idx < 0) return { ok: false, error: "entry not found" };
  store.entries.splice(idx, 1);
  saveStore(store);
  return { ok: true };
}

function handleImport_(store, p) {
  var logs = p.logs;
  if (!logs || !logs.length) return { ok: false, error: "logs required" };
  var imported = [];
  var errors = [];
  for (var i = 0; i < logs.length; i++) {
    var item = logs[i];
    var r = handleCreate_(store, {
      raw_text: item.raw_text,
      summary: item.summary,
      tags: item.tags,
      sentiment: item.sentiment,
      created_at: item.created_at,
    });
    if (r.ok && r.entry) imported.push(r.entry.id);
    else errors.push({ index: i, error: r.error || "failed" });
  }
  return {
    ok: true,
    imported_count: imported.length,
    imported_ids: imported,
    error_count: errors.length,
    errors: errors,
  };
}

function handleAppendTag_(store, p) {
  var id = Number(p.id);
  var tag = String(p.tag || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!id || !tag) return { ok: false, error: "id and tag required" };
  if (tag.length > 40) tag = tag.substring(0, 40);

  var idx = findIndexById(store.entries, id);
  if (idx < 0) return { ok: false, error: "entry not found" };

  var cur = store.entries[idx];
  var tags = cur.tags.slice();
  if (tags.indexOf(tag) < 0) tags.push(tag);
  if (tags.length > 12) tags = tags.slice(0, 12);

  var entry = buildEntry(
    cur.id,
    cur.created_at,
    cur.raw_text,
    cur.summary,
    tags,
    cur.sentiment
  );
  store.entries[idx] = entry;
  saveStore(store);
  return { ok: true, entry: entry };
}

function dispatchAction_(store, action, payload) {
  if (action === "create") return handleCreate_(store, payload || {});
  if (action === "update") return handleUpdate_(store, payload || {});
  if (action === "delete") return handleDelete_(store, payload || {});
  if (action === "import") return handleImport_(store, payload || {});
  if (action === "append_tag") return handleAppendTag_(store, payload || {});
  return { ok: false, error: "Unknown action: " + action };
}

function readAllSorted(store) {
  var entries = store.entries.slice();
  entries.sort(function (a, b) {
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
  return entries;
}

function jsonResponse(res, obj) {
  var body = JSON.stringify(obj);
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body, "utf8"),
  });
  res.end(body);
}

function main() {
  var port = Number(process.env.PORT) || DEFAULT_PORT;
  var store = loadStore();
  var remoteBase = getRemoteWebAppBaseUrl();

  var server = http.createServer(function (req, res) {
    var pu = url.parse(req.url || "/", true);

    if (req.method === "GET" && pu.pathname === "/") {
      if (pu.query && pu.query.action === "list") {
        if (remoteBase) {
          forwardRemoteList(remoteBase)
            .then(function (out) {
              jsonResponse(res, out);
            })
            .catch(function (err) {
              jsonResponse(res, {
                ok: false,
                error: String(err && err.message ? err.message : err),
              });
            });
          return;
        }
        return jsonResponse(res, { ok: true, entries: readAllSorted(store) });
      }
      var html = buildAssembledIndex(port, {
        remoteBackend: Boolean(remoteBase),
      });
      var htmlBuf = Buffer.from(html, "utf8");
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": htmlBuf.length,
      });
      return res.end(htmlBuf);
    }

    if (req.method === "POST" && pu.pathname === "/") {
      var chunks = [];
      req.on("data", function (c) {
        chunks.push(c);
      });
      req.on("end", function () {
        try {
          var rawBody = Buffer.concat(chunks).toString("utf8").trim();
          var body = JSON.parse(rawBody);
          if (remoteBase) {
            forwardRemotePost(remoteBase, {
              action: body.action,
              payload: body.payload || {},
            })
              .then(function (out) {
                jsonResponse(res, out);
              })
              .catch(function (err) {
                jsonResponse(res, {
                  ok: false,
                  error: String(err && err.message ? err.message : err),
                });
              });
            return;
          }
          var out = dispatchAction_(store, body.action, body.payload || {});
          return jsonResponse(res, out);
        } catch (err) {
          return jsonResponse(res, {
            ok: false,
            error: String(err && err.message ? err.message : err),
          });
        }
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });

  server.listen(port, "127.0.0.1", function () {
    var lines = [
      "Diary local preview — open http://127.0.0.1:" + port + "/",
    ];
    if (remoteBase) {
      lines.push("  Backend: Google Sheet (proxy → deployed web app)");
      lines.push("  Remote:  " + remoteBase);
    } else {
      lines.push("  Backend: local JSON — " + STORE_FILE);
      lines.push(
        "  Sheet:   set DIARY_REMOTE_WEBAPP_URL=…/exec to use your live Sheet"
      );
    }
    console.log(lines.join("\n"));
  });
}

main();
