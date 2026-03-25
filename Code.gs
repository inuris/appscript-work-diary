/**
 * App entry + transport wrappers.
 * Keep this file small; sheet/domain logic lives in Repo.gs.
 */
var APP_CONFIG = {
  SS_ID: "1I7uKQc4Zm0Ak9YLdDPRZLiLQb2V5hO-N9jle_UJlO9Q",
  SHEET_GID: 2116546896,
};

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/**
 * GET:
 * - default: render hosted UI
 * - ?action=list: return JSON list API (for portability)
 */
function doGet(e) {
  try {
    e = e || {};
    var action = e.parameter && e.parameter.action;
    if (action === "list") {
      var entries = readAllEntries_();
      entries.sort(function (a, b) {
        return String(b.created_at).localeCompare(String(a.created_at));
      });
      return jsonOut_({ ok: true, entries: entries });
    }

    var tpl = HtmlService.createTemplateFromFile("Index");
    var webUrl = "";
    try {
      webUrl = ScriptApp.getService().getUrl() || "";
    } catch (urlErr) {
      webUrl = "";
    }
    tpl.webAppUrl = webUrl;
    return tpl
      .evaluate()
      .setTitle("Diary")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err.message || err) });
  }
}

/**
 * POST JSON API (for portability / external clients).
 * Body schema: { action: "...", payload: {...} }
 */
function doPost(e) {
  try {
    var body = {};
    if (e.postData && e.postData.contents) {
      var raw = String(e.postData.contents).trim();
      body = JSON.parse(raw);
    } else {
      return jsonOut_({ ok: false, error: "Expected JSON body" });
    }
    return jsonOut_(dispatchAction_(body.action, body.payload || {}));
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err.message || err) });
  }
}

/**
 * Apps Script HtmlService bridge (google.script.run).
 * These wrappers make UI calls same-origin, so no CORS.
 */
function apiList() {
  var entries = readAllEntries_();
  entries.sort(function (a, b) {
    return String(b.created_at).localeCompare(String(a.created_at));
  });
  return { ok: true, entries: entries };
}
function apiCreate(payload) { return dispatchAction_("create", payload || {}); }
function apiUpdate(payload) { return dispatchAction_("update", payload || {}); }
function apiDelete(payload) { return dispatchAction_("delete", payload || {}); }
function apiImport(payload) { return dispatchAction_("import", payload || {}); }
function apiAppendTag(payload) { return dispatchAction_("append_tag", payload || {}); }

function dispatchAction_(action, payload) {
  if (action === "create") return handleCreate_(payload);
  if (action === "update") return handleUpdate_(payload);
  if (action === "delete") return handleDelete_(payload);
  if (action === "import") return handleImport_(payload);
  if (action === "append_tag") return handleAppendTag_(payload);
  return { ok: false, error: "Unknown action: " + action };
}
