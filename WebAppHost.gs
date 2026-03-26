/**
 * Web app entrypoint used by the GitHub Pages frontend.
 * - doGet/doPost expose JSON API only
 * - Sheet CRUD lives in DiarySheetStore.gs
 */
var APP_CONFIG = {
  SS_ID: "1I7uKQc4Zm0Ak9YLdDPRZLiLQb2V5hO-N9jle_UJlO9Q",
  SHEET_GID: 2116546896,
};

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/** GET JSON API. Supports ?action=list */
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
    return jsonOut_({
      ok: false,
      error:
        "Unknown action. Use GET ?action=list or POST with { action, payload }.",
    });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err.message || err) });
  }
}

/**
 * POST JSON API for GitHub Pages frontend and external clients.
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

function dispatchAction_(action, payload) {
  if (action === "create") return handleCreate_(payload);
  if (action === "update") return handleUpdate_(payload);
  if (action === "delete") return handleDelete_(payload);
  if (action === "import") return handleImport_(payload);
  if (action === "append_tag") return handleAppendTag_(payload);
  return { ok: false, error: "Unknown action: " + action };
}
