/**
 * Web app entrypoint used by the GitHub Pages frontend.
 * - doGet/doPost expose JSON API only
 * - Sheet CRUD lives in DiarySheetStore.gs
 */
var APP_CONFIG = {
  SS_ID: "1I7uKQc4Zm0Ak9YLdDPRZLiLQb2V5hO-N9jle_UJlO9Q",
  SHEET_GID: 2116546896,
  DEBUG_LOG_SHEET: "Logs",
};

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function getDebugSheet_() {
  var ss = SpreadsheetApp.openById(APP_CONFIG.SS_ID);
  var name = APP_CONFIG.DEBUG_LOG_SHEET || "Logs";
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  if (sh.getLastRow() < 1) {
    sh
      .getRange(1, 1, 1, 5)
      .setValues([["logged_at", "level", "message", "data_json", "actor"]]);
  }
  return sh;
}

function writeDebugSheetLog_(level, message, data) {
  try {
    var sh = getDebugSheet_();
    var actor = "";
    try {
      actor = Session.getActiveUser().getEmail() || "";
    } catch (_) {
      actor = "";
    }
    var payload = "";
    if (typeof data !== "undefined") {
      try {
        payload = JSON.stringify(data);
      } catch (_) {
        payload = String(data);
      }
    }
    if (payload.length > 50000) payload = payload.slice(0, 50000);
    sh.appendRow([
      formatDateTime_(new Date()),
      String(level || "INFO"),
      String(message || ""),
      payload,
      actor,
    ]);
  } catch (_) {
    // Never break API response because logging failed.
  }
}

function logLine_(level, message, data) {
  var line = "[DiaryAPI][" + level + "] " + message;
  if (typeof data !== "undefined") {
    try {
      line += " " + JSON.stringify(data);
    } catch (_) {
      line += " " + String(data);
    }
  }

  // Guaranteed sheet-level fallback for production diagnostics.
  writeDebugSheetLog_(level, message, data);
  Logger.log(line);
}

function payloadSummary_(payload) {
  var p = payload || {};
  return {
    keys: Object.keys(p),
    has_raw_text: !!(p.raw_text && String(p.raw_text).trim()),
    raw_text_len: p.raw_text == null ? 0 : String(p.raw_text).length,
    has_text: !!(p.text && String(p.text).trim()),
    text_len: p.text == null ? 0 : String(p.text).length,
    logs_len: Array.isArray(p.logs) ? p.logs.length : 0,
    id: p.id == null ? "" : String(p.id),
  };
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
  var requestId = Utilities.getUuid();
  var started = new Date().getTime();
  try {
    var body = {};
    var raw = "";

    logLine_("INFO", "doPost received", {
      requestId: requestId,
      hasPostData: !!(e && e.postData),
      hasContents: !!(e && e.postData && e.postData.contents),
    });

    if (e.postData && e.postData.contents) {
      raw = String(e.postData.contents).trim();
      body = JSON.parse(raw);
    } else {
      logLine_("ERROR", "doPost missing JSON body", { requestId: requestId });
      return jsonOut_({ ok: false, error: "Expected JSON body" });
    }

    var action = String(body.action || "");
    var payload = body.payload || {};
    logLine_("INFO", "doPost dispatch", {
      requestId: requestId,
      action: action,
      payload: payloadSummary_(payload),
      raw_len: raw.length,
    });

    var out = dispatchAction_(action, payload);
    logLine_("INFO", "doPost completed", {
      requestId: requestId,
      action: action,
      ok: !!(out && out.ok),
      error: out && out.error ? String(out.error).slice(0, 300) : "",
      imported_count: out && out.imported_count ? out.imported_count : 0,
      elapsed_ms: new Date().getTime() - started,
    });
    return jsonOut_(out);
  } catch (err) {
    logLine_("ERROR", "doPost exception", {
      requestId: requestId,
      message: String(err && err.message ? err.message : err),
      stack: err && err.stack ? String(err.stack).slice(0, 1200) : "",
      elapsed_ms: new Date().getTime() - started,
    });
    return jsonOut_({ ok: false, error: String(err.message || err) });
  }
}

function dispatchAction_(action, payload) {
  if (action === "create") return handleCreate_(payload);
  if (action === "update") return handleUpdate_(payload);
  if (action === "delete") return handleDelete_(payload);
  if (action === "import") return handleImport_(payload);
  if (action === "append_tag") return handleAppendTag_(payload);
  if (action === "ai_diary_input") return handleAiDiaryInput_(payload);
  return { ok: false, error: "Unknown action: " + action };
}

function handleAiDiaryInput_(payload) {
  var p = payload || {};
  var sourceText = String(p.text || "");
  if (!sourceText.trim()) return { ok: false, error: "text is required" };

  var apiKey =
    PropertiesService.getScriptProperties().getProperty("GOOGLE_AI_API_KEY") ||
    "";
  if (!apiKey) {
    return {
      ok: false,
      error:
        "Missing GOOGLE_AI_API_KEY in Script Properties. Set it before using AI processing.",
    };
  }

  var rulePrompt = String(p.rule_prompt || "").trim();
  var prompt =
    (rulePrompt ? rulePrompt + "\n\n" : "") +
    [
      "Task: convert the following diary input text to the diary import JSON schema.",
      "Return JSON object with shape: {\"logs\":[...]} and each log should include raw_text, title, summary.",
      "Output requirements:",
      "- valid JSON only",
      "- no markdown or code fences",
      "- no extra keys outside schema",
      "",
      "Input:",
      sourceText,
    ].join("\n");

  var endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
    encodeURIComponent(apiKey);

  var req = {
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };

  var response = UrlFetchApp.fetch(endpoint, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(req),
    muteHttpExceptions: true,
  });

  var status = response.getResponseCode();
  var rawBody = String(response.getContentText() || "");
  if (status < 200 || status >= 300) {
    return {
      ok: false,
      error:
        "Google AI request failed (" +
        status +
        "): " +
        rawBody.slice(0, 500),
    };
  }

  var body;
  try {
    body = JSON.parse(rawBody);
  } catch (e) {
    return { ok: false, error: "Invalid Google AI response JSON" };
  }

  var parts =
    (((body.candidates || [])[0] || {}).content || {}).parts || [];
  var modelText = parts
    .map(function (x) {
      return String((x && x.text) || "");
    })
    .join("")
    .trim();

  if (!modelText) return { ok: false, error: "Google AI returned empty content" };

  var parsed = parseDiaryLogsJson_(modelText);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    logs: parsed.logs,
  };
}

function parseDiaryLogsJson_(raw) {
  var text = String(raw || "").trim();
  if (!text) return { ok: false, error: "Empty AI output" };

  var fence =
    text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/);
  if (fence && fence[1]) text = String(fence[1]).trim();

  var data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      error: "AI output is not valid JSON: " + String(e.message || e),
    };
  }

  if (!data || !Array.isArray(data.logs)) {
    return { ok: false, error: "AI output must be an object with logs array" };
  }
  return { ok: true, logs: data.logs };
}

/**
 * Manual auth probe.
 * Run once in Apps Script editor (as deployment owner) to grant
 * script.external_request before using ai_diary_input from web clients.
 */
function testUrlFetchPermission_() {
  var res = UrlFetchApp.fetch("https://httpbin.org/get", {
    method: "get",
    muteHttpExceptions: true,
  });
  return {
    ok: true,
    status: res.getResponseCode(),
    body_preview: String(res.getContentText() || "").slice(0, 200),
  };
}
