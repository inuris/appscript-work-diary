/**
 * Diary persistence on Google Sheets (rows, import, tags).
 * No HTTP — only plain functions used by WebAppHost.gs.
 * You can lift these handlers into another backend later.
 */
var HEADERS = ["id", "Timestamp", "created_at", "raw_text", "title", "summary", "tags", "sentiment"];

var IDX = {
  ID: 0,
  TIMESTAMP: 1,
  CREATED_AT: 2,
  RAW_TEXT: 3,
  TITLE: 4,
  SUMMARY: 5,
  TAGS: 6,
  SENTIMENT: 7,
};

function normalizeLineEndings_(s) {
  return String(s == null ? "" : s).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** True when there is no non-whitespace content (newlines alone are allowed as “content”). */
function isEffectivelyEmptyText_(s) {
  return !/[^\s\u00A0]/.test(normalizeLineEndings_(s));
}

function getSheet_() {
  return SpreadsheetApp.openById(APP_CONFIG.SS_ID).getSheetById(APP_CONFIG.SHEET_GID);
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    return;
  }
  var first = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  var ok = true;
  for (var i = 0; i < HEADERS.length; i++) {
    if (String(first[i] || "").trim() !== HEADERS[i]) {
      ok = false;
      break;
    }
  }
  if (!ok) {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
}

function rowToObject_(row) {
  var id = row[IDX.ID] == null ? "" : String(row[IDX.ID]);
  var ts = row[IDX.TIMESTAMP] == null ? "" : String(row[IDX.TIMESTAMP]);
  return {
    id: id,
    timestamp: ts,
    created_at: row[IDX.CREATED_AT] === "" || row[IDX.CREATED_AT] == null
      ? ""
      : String(row[IDX.CREATED_AT]),
    raw_text: normalizeLineEndings_(row[IDX.RAW_TEXT] == null ? "" : String(row[IDX.RAW_TEXT])),
    title: normalizeLineEndings_(row[IDX.TITLE] == null ? "" : String(row[IDX.TITLE])),
    summary: normalizeLineEndings_(row[IDX.SUMMARY] == null ? "" : String(row[IDX.SUMMARY])),
    tags: parseTags_(row[IDX.TAGS]),
    sentiment: row[IDX.SENTIMENT] == null || row[IDX.SENTIMENT] === ""
      ? null
      : String(row[IDX.SENTIMENT]),
  };
}

function parseTags_(cell) {
  if (cell == null || cell === "") return [];
  if (typeof cell === "object") return [];
  try {
    var arr = JSON.parse(String(cell).trim());
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

function isLikelyHeaderRow_(row) {
  var c0 = String(row[0] || "").trim().toLowerCase();
  var c1 = String(row[1] || "").trim().toLowerCase();
  var c2 = String(row[2] || "").trim().toLowerCase();
  var c3 = String(row[3] || "").trim().toLowerCase();
  if (c0 === "id" && c1 === "timestamp") return true;
  if (c0 === "id" && c2 === "created_at") return true;
  if (c0 === "timestamp" && c2 === "raw_text") return true;
  if (c0 === "timestamp" && c1 === "created_at") return true;
  if (c3 === "raw_text") return true;
  var match = 0;
  for (var i = 0; i < HEADERS.length; i++) {
    if (String(row[i] || "").trim().toLowerCase() === HEADERS[i]) match++;
  }
  return match >= 3;
}

function isBlankRow_(row) {
  return isEffectivelyEmptyText_(row[IDX.RAW_TEXT] == null ? "" : row[IDX.RAW_TEXT]);
}

function readAllEntries_() {
  var sheet = getSheet_();
  ensureHeaders_(sheet);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var data = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < data.length; i++) {
    if (isLikelyHeaderRow_(data[i])) continue;
    if (isBlankRow_(data[i])) continue;
    var entry = rowToObject_(data[i]);
    if (!String(entry.id || "").trim()) {
      // Backfill ID for older rows that predate the `id` column.
      entry.id = String(entry.timestamp || (i + 1));
      sheet.getRange(i + 2, 1).setValue(entry.id);
    }
    out.push(entry);
  }
  return out;
}

function findRowIndexById_(sheet, id) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  var target = String(id || "");
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || "") === target) return i + 2;
  }
  return -1;
}

function nextTimestampId_() {
  var d = new Date();
  var ms = ("00" + d.getMilliseconds()).slice(-3);
  return formatDateTime_(d).replace(/[-: ]/g, "") + ms;
}

function nextNumericId_(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return 1;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  var maxId = 0;
  for (var i = 0; i < ids.length; i++) {
    var n = Number(ids[i][0]);
    if (!isNaN(n) && n > maxId) maxId = n;
  }
  return maxId + 1;
}

function handleCreate_(p) {
  var raw = normalizeLineEndings_(p.raw_text);
  if (isEffectivelyEmptyText_(raw)) return { ok: false, error: "raw_text is required" };

  var sheet = getSheet_();
  ensureHeaders_(sheet);
  var id = p.id != null && String(p.id).trim()
    ? String(p.id).trim()
    : String(nextNumericId_(sheet));
  var ts = p.timestamp && String(p.timestamp).trim()
    ? String(p.timestamp).trim()
    : nextTimestampId_();
  var created = p.created_at && String(p.created_at).trim()
    ? String(p.created_at).trim()
    : formatDateTime_(new Date());
  var title = normalizeLineEndings_(p.title);
  var summary = normalizeLineEndings_(p.summary);
  var tags = normalizeTagsInput_(p.tags);
  var sentiment = normalizeSentiment_(p.sentiment);

  sheet.appendRow([id, ts, created, raw, title, summary, JSON.stringify(tags), sentiment]);
  return { ok: true, entry: buildEntry_(id, ts, created, raw, title, summary, tags, sentiment) };
}

function handleUpdate_(p) {
  var id = String(p.id || "");
  if (!id) return { ok: false, error: "id is required" };
  var raw = normalizeLineEndings_(p.raw_text);
  if (isEffectivelyEmptyText_(raw)) return { ok: false, error: "raw_text is required" };

  var sheet = getSheet_();
  ensureHeaders_(sheet);
  var rowIndex = findRowIndexById_(sheet, id);
  if (rowIndex < 0) return { ok: false, error: "entry not found" };

  var cur = rowToObject_(sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0]);
  var title = p.hasOwnProperty("title") ? normalizeLineEndings_(p.title) : cur.title;
  var summary = p.hasOwnProperty("summary") ? normalizeLineEndings_(p.summary) : cur.summary;
  var tags = p.hasOwnProperty("tags") ? normalizeTagsInput_(p.tags) : cur.tags;
  var sentiment = p.hasOwnProperty("sentiment")
    ? normalizeSentiment_(p.sentiment)
    : cur.sentiment;

  sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([[
    id,
    cur.timestamp,
    cur.created_at,
    raw,
    title,
    summary,
    JSON.stringify(tags),
    sentiment,
  ]]);

  return { ok: true, entry: buildEntry_(id, cur.timestamp, cur.created_at, raw, title, summary, tags, sentiment) };
}

function handleDelete_(p) {
  var id = String(p.id || "");
  if (!id) return { ok: false, error: "id is required" };
  var sheet = getSheet_();
  ensureHeaders_(sheet);
  var rowIndex = findRowIndexById_(sheet, id);
  if (rowIndex < 0) return { ok: false, error: "entry not found" };
  sheet.deleteRow(rowIndex);
  return { ok: true };
}

function handleImport_(p) {
  var logs = p.logs;
  if (!logs || !logs.length) return { ok: false, error: "logs required" };
  var imported = [];
  var errors = [];
  for (var i = 0; i < logs.length; i++) {
    var item = logs[i];
    var r = handleCreate_({
      id: item.id,
      raw_text: item.raw_text,
      title: item.title,
      summary: item.summary,
      tags: item.tags,
      sentiment: item.sentiment,
      created_at: item.created_at,
      timestamp: item.timestamp,
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

function handleAppendTag_(p) {
  var id = String(p.id || "");
  var tag = String(p.tag || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!id || !tag) return { ok: false, error: "id and tag required" };
  if (tag.length > 40) tag = tag.substring(0, 40);

  var sheet = getSheet_();
  ensureHeaders_(sheet);
  var rowIndex = findRowIndexById_(sheet, id);
  if (rowIndex < 0) return { ok: false, error: "entry not found" };

  var cur = rowToObject_(sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0]);
  var tags = cur.tags.slice();
  if (tags.indexOf(tag) < 0) tags.push(tag);
  if (tags.length > 12) tags = tags.slice(0, 12);

  sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([[
    cur.id,
    cur.timestamp,
    cur.created_at,
    cur.raw_text,
    cur.title,
    cur.summary,
    JSON.stringify(tags),
    cur.sentiment,
  ]]);

  return {
    ok: true,
    entry: buildEntry_(
      cur.id,
      cur.timestamp,
      cur.created_at,
      cur.raw_text,
      cur.title,
      cur.summary,
      tags,
      cur.sentiment
    ),
  };
}

function buildEntry_(id, timestamp, created_at, raw_text, title, summary, tags, sentiment) {
  return {
    id: id,
    timestamp: timestamp,
    created_at: created_at,
    raw_text: raw_text,
    title: title,
    summary: summary,
    tags: tags,
    sentiment: sentiment,
  };
}

function formatDateTime_(d) {
  var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
  return (
    d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " +
    pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds())
  );
}

function normalizeTagsInput_(tags) {
  if (!tags) return [];
  var arr = Array.isArray(tags) ? tags : String(tags).split(",");
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    var t = String(arr[i]).trim().toLowerCase().replace(/\s+/g, " ");
    if (!t) continue;
    if (t.length > 40) t = t.substring(0, 40);
    if (out.indexOf(t) < 0) out.push(t);
  }
  return out.slice(0, 12);
}

function normalizeSentiment_(s) {
  if (s == null || s === "") return null;
  var v = String(s).trim();
  if (v === "Positive" || v === "Negative" || v === "Neutral") return v;
  return null;
}
