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
      "Return JSON object with shape: {\"logs\":[...]}",
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
