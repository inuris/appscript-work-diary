(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function debugLog(message, detail) {
    if (detail === undefined) {
      console.log("[DiaryDebug] " + message);
      return;
    }
    console.log("[DiaryDebug] " + message, detail);
  }

  function getAppScriptBaseUrl() {
    var cfg = window.DIARY_APP_CONFIG || {};
    return String(cfg.APPS_SCRIPT_URL || "")
      .trim()
      .replace(/\/$/, "");
  }

  function normalizeEntry(e) {
    var out = Object.assign({}, e);
    if (out.id != null && out.id !== "") {
      var n = parseInt(String(out.id), 10);
      if (!Number.isNaN(n)) out.id = n;
    }
    if (!Array.isArray(out.tags)) out.tags = [];
    if (out.raw_text != null) out.raw_text = normalizeLineEndings(out.raw_text);
    if (out.title != null) out.title = normalizeLineEndings(out.title);
    if (out.summary != null) out.summary = normalizeLineEndings(out.summary);
    return out;
  }

  function parseTagsFromInput(s) {
    if (!s || !String(s).trim()) return [];
    var seen = {};
    var out = [];
    String(s)
      .split(",")
      .map(function (x) {
        return x.trim().toLowerCase().replace(/\s+/g, " ");
      })
      .filter(Boolean)
      .forEach(function (t) {
        if (t.length > 40) t = t.slice(0, 40);
        if (!seen[t]) {
          seen[t] = true;
          out.push(t);
        }
      });
    return out.slice(0, 12);
  }

  function trimAccent(phrase) {
    return String(phrase || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^a-zA-Z0-9 ]/g, " ");
  }

  function buildNonAccentIndexMap(orig) {
    var lower = String(orig || "").toLowerCase();
    var map = [];
    var prev = "";
    var i;
    for (i = 0; i < lower.length; i++) {
      var next = trimAccent(lower.substring(0, i + 1));
      var k = prev.length;
      while (k < next.length) {
        map.push(i);
        k++;
      }
      prev = next;
    }
    return map;
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeLineEndings(text) {
    return String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  function isEffectivelyEmptyText(text) {
    return !/[^\s\u00A0]/.test(normalizeLineEndings(text));
  }

  function formatText(text, _from, _to) {
    text = normalizeLineEndings(text);
    var result;
    if (_from !== undefined && _to !== undefined) {
      result =
        escapeHtml(text.substring(0, _from)) +
        '<span class="highlight">' +
        escapeHtml(text.substring(_from, _to)) +
        "</span>" +
        escapeHtml(text.substring(_to));
    } else {
      result = escapeHtml(text);
    }
    return result.replace(/\n/g, "<br>");
  }

  function formatTagsPlain(tags) {
    if (!tags || !tags.length) return [];
    return tags.map(function (t) {
      return { text: t, html: escapeHtml(String(t)) };
    });
  }

  function formatTagsLowerMatch(tags, keyword) {
    var kw = keyword.toLowerCase();
    return tags.map(function (t) {
      var s = String(t);
      var lower = s.toLowerCase();
      var idx = lower.indexOf(kw);
      if (idx < 0) return { text: t, html: escapeHtml(s) };
      return { text: t, html: formatText(s, idx, idx + kw.length) };
    });
  }

  function formatTagsNonAccentMatch(tags, keywordNonAccent) {
    var kn = keywordNonAccent;
    return tags.map(function (t) {
      var s = String(t);
      var tn = trimAccent(s.toLowerCase());
      var idx = tn.indexOf(kn);
      if (idx < 0) return { text: t, html: escapeHtml(s) };
      var map = buildNonAccentIndexMap(s);
      if (!map.length || idx + kn.length > map.length) {
        return { text: t, html: escapeHtml(s) };
      }
      var startOrig = map[idx];
      var endOrig = map[Math.min(idx + kn.length - 1, map.length - 1)] + 1;
      return { text: t, html: formatText(s, startOrig, endOrig) };
    });
  }

  function enrichEntry(e) {
    var ne = normalizeEntry(e);
    var raw = ne.raw_text || "";
    var title = ne.title || "";
    var summary = ne.summary || "";
    var rawL = raw.toLowerCase();
    var titleL = title.toLowerCase();
    var sumL = summary.toLowerCase();
    var tags = ne.tags || [];
    var tagsJoined = tags
      .map(function (t) {
        return String(t);
      })
      .join(" ");
    var tagsL = tagsJoined.toLowerCase();
    return Object.assign({}, ne, {
      _rawLower: rawL,
      _rawNonAccent: trimAccent(rawL),
      _rawNaMap: buildNonAccentIndexMap(raw),
      _titleLower: titleL,
      _titleNonAccent: trimAccent(titleL),
      _titleNaMap: buildNonAccentIndexMap(title),
      _summaryLower: sumL,
      _summaryNonAccent: trimAccent(sumL),
      _summaryNaMap: buildNonAccentIndexMap(summary),
      _tagsLower: tagsL,
      _tagsNonAccent: trimAccent(tagsL),
      _tagsNaMap: buildNonAccentIndexMap(tagsJoined),
    });
  }

  function matchDiaryKeyword(keyword, d) {
    var keywordNonAccent = trimAccent(keyword);
    var raw = d.raw_text || "";
    var title = d.title || "";
    var index = d._rawLower.indexOf(keyword);
    if (index >= 0) {
      return {
        prior: 4,
        rawHtml: formatText(raw, index, index + keyword.length),
        titleHtml: formatText(title || ""),
        summaryHtml: formatText(d.summary || ""),
        tagSpans: formatTagsPlain(d.tags),
      };
    }
    index = d._titleLower.indexOf(keyword);
    if (index >= 0) {
      return {
        prior: 3,
        rawHtml: formatText(raw),
        titleHtml: formatText(title || "", index, index + keyword.length),
        summaryHtml: formatText(d.summary || ""),
        tagSpans: formatTagsPlain(d.tags),
      };
    }
    index = d._summaryLower.indexOf(keyword);
    if (index >= 0) {
      return {
        prior: 2,
        rawHtml: formatText(raw),
        titleHtml: formatText(title || ""),
        summaryHtml: formatText(d.summary || "", index, index + keyword.length),
        tagSpans: formatTagsPlain(d.tags),
      };
    }
    index = d._tagsLower.indexOf(keyword);
    if (index >= 0) {
      return {
        prior: 2,
        rawHtml: formatText(raw),
        titleHtml: formatText(title || ""),
        summaryHtml: formatText(d.summary || ""),
        tagSpans: formatTagsLowerMatch(d.tags, keyword),
      };
    }
    index = d._rawNonAccent.indexOf(keywordNonAccent);
    if (index >= 0) {
      var mapR = d._rawNaMap;
      var startR = mapR[index];
      var endR =
        mapR[Math.min(index + keywordNonAccent.length - 1, mapR.length - 1)] + 1;
      return {
        prior: 2,
        rawHtml: formatText(raw, startR, endR),
        titleHtml: formatText(title || ""),
        summaryHtml: formatText(d.summary || ""),
        tagSpans: formatTagsPlain(d.tags),
      };
    }
    index = d._titleNonAccent.indexOf(keywordNonAccent);
    if (index >= 0) {
      var mapT = d._titleNaMap;
      var startT = mapT[index];
      var endT =
        mapT[Math.min(index + keywordNonAccent.length - 1, mapT.length - 1)] + 1;
      return {
        prior: 1,
        rawHtml: formatText(raw),
        titleHtml: formatText(title || "", startT, endT),
        summaryHtml: formatText(d.summary || ""),
        tagSpans: formatTagsPlain(d.tags),
      };
    }
    index = d._summaryNonAccent.indexOf(keywordNonAccent);
    if (index >= 0) {
      var sum = d.summary || "";
      var mapS = d._summaryNaMap;
      var startS = mapS[index];
      var endS =
        mapS[Math.min(index + keywordNonAccent.length - 1, mapS.length - 1)] + 1;
      return {
        prior: 1,
        rawHtml: formatText(raw),
        titleHtml: formatText(title || ""),
        summaryHtml: formatText(sum, startS, endS),
        tagSpans: formatTagsPlain(d.tags),
      };
    }
    index = d._tagsNonAccent.indexOf(keywordNonAccent);
    if (index >= 0) {
      return {
        prior: 0,
        rawHtml: formatText(raw),
        titleHtml: formatText(title || ""),
        summaryHtml: formatText(d.summary || ""),
        tagSpans: formatTagsNonAccentMatch(d.tags, keywordNonAccent),
      };
    }
    return { prior: 0, rawHtml: "", titleHtml: "", summaryHtml: "", tagSpans: [] };
  }

  function passesTagFilter(d, tagLower) {
    if (!tagLower) return true;
    var tags = d.tags || [];
    for (var i = 0; i < tags.length; i++) {
      if (String(tags[i]).toLowerCase() === tagLower) return true;
    }
    return false;
  }

  function buildViewRows(fullData, searchQ, tagFilter) {
    var tagLower = String(tagFilter || "").trim().toLowerCase();
    var keyword = String(searchQ || "").trim().toLowerCase();
    var out = [];
    var i;
    for (i = 0; i < fullData.length; i++) {
      var enriched = fullData[i];
      if (!passesTagFilter(enriched, tagLower)) continue;
      if (!keyword) {
        out.push({
          prior: 0,
          entry: enriched,
          rawHtml: formatText(enriched.raw_text || ""),
          titleHtml: enriched.title ? formatText(enriched.title) : "",
          summaryHtml: enriched.summary ? formatText(enriched.summary) : "",
          tagSpans: formatTagsPlain(enriched.tags),
        });
        continue;
      }
      var m = matchDiaryKeyword(keyword, enriched);
      if (m.prior === 0) continue;
      out.push({
        prior: m.prior,
        entry: enriched,
        rawHtml: m.rawHtml,
        titleHtml: m.titleHtml,
        summaryHtml: m.summaryHtml,
        tagSpans: m.tagSpans,
      });
    }
    out.sort(function (a, b) {
      if (b.prior !== a.prior) return b.prior - a.prior;
      return String(b.entry.created_at || "").localeCompare(
        String(a.entry.created_at || "")
      );
    });
    return out;
  }

  function rebuildTagCatalog() {
    var counts = {};
    var i;
    for (i = 0; i < S.fullData.length; i++) {
      var tags = S.fullData[i].tags || [];
      var t;
      for (t = 0; t < tags.length; t++) {
        var k = String(tags[t]).trim().toLowerCase();
        if (!k) continue;
        counts[k] = (counts[k] || 0) + 1;
      }
    }
    var pairs = Object.keys(counts).map(function (k) {
      return { tag: k, count: counts[k] };
    });
    pairs.sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count;
      return a.tag.localeCompare(b.tag);
    });
    S.tagCatalog = pairs;
    var dl = $("tag-datalist");
    if (dl) {
      dl.innerHTML = pairs
        .map(function (p) {
          return "<option value=\"" + escapeAttr(p.tag) + "\"></option>";
        })
        .join("");
    }
  }

  function getTagPrefixForSuggest(el) {
    var v = el.value;
    var end = el.selectionStart != null ? el.selectionStart : v.length;
    var before = v.slice(0, end);
    var lc = before.lastIndexOf(",");
    var frag = (lc < 0 ? before : before.slice(lc + 1)).trim().toLowerCase();
    return frag;
  }

  function renderTagSuggest() {
    var el = $("entry-tags");
    var panel = $("tag-suggest-panel");
    if (!el || !panel) return;
    if (document.activeElement !== el) {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }
    var frag = getTagPrefixForSuggest(el);
    var list = S.tagCatalog
      .filter(function (p) {
        return !frag || p.tag.indexOf(frag) === 0;
      })
      .slice(0, 12);
    if (!list.length) {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }
    panel.innerHTML = list
      .map(function (p) {
        return (
          '<button type="button" class="tag-suggest-item" data-suggest-tag="' +
          escapeAttr(p.tag) +
          '"><span>' +
          escapeHtml(p.tag) +
          '</span><span class="tag-suggest-count">' +
          p.count +
          "</span></button>"
        );
      })
      .join("");
    panel.hidden = false;
  }

  function insertTagSuggestion(tag) {
    var el = $("entry-tags");
    if (!el) return;
    var lower = tag.toLowerCase();
    var existing = parseTagsFromInput(el.value);
    if (existing.indexOf(lower) >= 0) return;
    var v = el.value.replace(/\s+$/, "");
    el.value = (v ? v + ", " : "") + tag;
    el.focus();
    renderTagSuggest();
  }

  function openImportModal(data) {
    var root = $("import-modal");
    var body = $("import-modal-body");
    if (!root || !body) return;
    var okCount = Number(data && data.imported_count ? data.imported_count : 0);
    var failCount = Number(data && data.error_count ? data.error_count : 0);
    var totalTry = okCount + failCount;
    var allSuccess = totalTry > 0 && failCount === 0;

    var html =
      '<div class="import-result-summary ' +
      (allSuccess ? "import-result-success" : "import-result-mixed") +
      '">' +
      '<h3 class="import-result-title">' +
      (allSuccess ? "Entries added successfully" : "Import completed with some issues") +
      "</h3>" +
      '<p class="import-result-lead">' +
      (allSuccess
        ? "Your selected entries were saved to the diary."
        : "Some entries were saved, and some could not be added.") +
      "</p>" +
      "</div>";

    html +=
      '<table class="stats-table"><thead><tr><th>Summary</th><th>Count</th></tr></thead><tbody>' +
      "<tr><td>Total selected</td><td>" +
      escapeHtml(String(totalTry)) +
      "</td></tr>" +
      "<tr><td>Added</td><td>" +
      escapeHtml(String(okCount)) +
      "</td></tr>" +
      "<tr><td>Not added</td><td>" +
      escapeHtml(String(failCount)) +
      "</td></tr>" +
      "</tbody></table>";

    if (data.errors && data.errors.length) {
      html += '<h3 class="modal-subhead">What needs attention</h3><ul class="import-error-list">';
      var ei;
      for (ei = 0; ei < Math.min(data.errors.length, 8); ei++) {
        var er = data.errors[ei];
        html += "<li>" + escapeHtml(String(er.error || "Unable to add one entry.")) + "</li>";
      }
      if (data.errors.length > 8) {
        html +=
          "<li>And " +
          escapeHtml(String(data.errors.length - 8)) +
          " more entries were not added.</li>";
      }
      html += "</ul>";
    }
    body.innerHTML = html;
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
  }

  function closeImportModal() {
    var root = $("import-modal");
    if (!root) return;
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
  }

  function beginSync() {
    S.syncDepth++;
    var el = $("sync-indicator");
    if (el) el.hidden = false;
  }

  function endSync() {
    S.syncDepth = Math.max(0, S.syncDepth - 1);
    if (S.syncDepth === 0) {
      var ind = $("sync-indicator");
      if (ind) ind.hidden = true;
    }
  }

  function pruneSelectedIds() {
    var keep = Object.create(null);
    var i;
    for (i = 0; i < S.fullData.length; i++) {
      keep[String(S.fullData[i].id)] = true;
    }
    var next = Object.create(null);
    Object.keys(S.selectedIds).forEach(function (k) {
      if (keep[k]) next[k] = true;
    });
    S.selectedIds = next;
  }

  function getSelectedIdsArray() {
    return Object.keys(S.selectedIds)
      .filter(function (k) {
        return S.selectedIds[k];
      });
  }

  function normalizeBulkTag(s) {
    var t = String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (t.length > 40) t = t.slice(0, 40);
    return t;
  }

  function paintBulkBar() {
    var bar = $("bulk-bar");
    if (!bar) return;
    var nShown = S.viewRows.length;
    bar.style.display = nShown > 0 ? "block" : "none";
    var label = $("bulk-selected-label");
    var ids = getSelectedIdsArray();
    if (label) {
      label.textContent = ids.length ? String(ids.length) : "—";
      label.title = ids.length ? ids.length + " selected" : "None selected";
    }
    var allCb = $("bulk-select-all");
    if (allCb) {
      if (nShown === 0) {
        allCb.checked = false;
        allCb.indeterminate = false;
      } else {
        var idStrs = S.viewRows.map(function (r) {
          return String(r.entry.id);
        });
        var allOn = idStrs.every(function (id) {
          return S.selectedIds[id];
        });
        var someOn = idStrs.some(function (id) {
          return S.selectedIds[id];
        });
        allCb.checked = allOn;
        allCb.indeterminate = someOn && !allOn;
      }
    }
    var dis = ids.length === 0;
    var addB = $("bulk-add-tag-btn");
    var delB = $("bulk-delete-btn");
    if (addB) addB.disabled = dis;
    if (delB) delB.disabled = dis;
  }

  function onEntryListChange(ev) {
    var t = ev.target;
    if (!t || !t.hasAttribute("data-entry-select")) return;
    var id = t.getAttribute("data-id");
    if (t.checked) S.selectedIds[id] = true;
    else delete S.selectedIds[id];
    paintBulkBar();
    var allCb = $("bulk-select-all");
    var nShown = S.viewRows.length;
    if (allCb && nShown > 0) {
      var idStrs = S.viewRows.map(function (r) {
        return String(r.entry.id);
      });
      var allOn =
        idStrs.length &&
        idStrs.every(function (x) {
          return S.selectedIds[x];
        });
      var someOn = idStrs.some(function (x) {
        return S.selectedIds[x];
      });
      allCb.checked = allOn;
      allCb.indeterminate = someOn && !allOn;
    }
  }

  function onBulkSelectAllChange(ev) {
    var cb = ev.target;
    var on = cb.checked;
    S.viewRows.forEach(function (row) {
      var id = String(row.entry.id);
      if (on) S.selectedIds[id] = true;
      else delete S.selectedIds[id];
    });
    paintEntryList();
  }

  function bulkDeleteSelected() {
    var ids = getSelectedIdsArray();
    if (!ids.length || !S.transport) return;
    if (!confirm("Delete " + ids.length + " entries? This cannot be undone.")) return;
    beginSync();
    setSaveError("");
    (function () {
      return ids
        .reduce(function (chain, id) {
          return chain.then(function () {
            return S.transport.remove({ id: id });
          });
        }, Promise.resolve())
        .then(function () {
          S.selectedIds = {};
          S.editingId = null;
          S.editRaw = "";
          S.editTitle = "";
          S.editSummary = "";
          S.editTags = "";
          return loadEntries();
        })
        .catch(function (err) {
          setSaveError((err && err.message) || "Bulk delete failed");
          return loadEntries();
        })
        .finally(endSync);
    })();
  }

  function bulkAddTagToSelected() {
    var ids = getSelectedIdsArray();
    var inp = $("bulk-tag-input");
    var tag = inp ? normalizeBulkTag(inp.value) : "";
    if (!ids.length || !tag || !S.transport) return;
    if (
      !confirm('Add tag "' + tag + '" to ' + ids.length + " selected entries?")
    ) {
      return;
    }
    beginSync();
    setSaveError("");
    (function () {
      return ids
        .reduce(function (chain, id) {
          return chain.then(function () {
            return S.transport.appendTag({ id: id, tag: tag });
          });
        }, Promise.resolve())
        .then(function () {
          if (inp) inp.value = "";
          return loadEntries();
        })
        .catch(function (err) {
          setSaveError((err && err.message) || "Bulk add tag failed");
          return loadEntries();
        })
        .finally(endSync);
    })();
  }

  var S = {
    transport: null,
    fullData: [],
    viewRows: [],
    tagCatalog: [],
    selectedIds: {},
    syncDepth: 0,
    saveInFlight: false,
    importInFlight: false,
    aiInFlight: false,
    approveInFlight: false,
    editInFlight: false,
    editingId: null,
    editRaw: "",
    editTitle: "",
    editSummary: "",
    editTags: "",
    loading: false,
    tagMenu: {
      visible: false,
      x: 0,
      y: 0,
      entryId: null,
      phrase: "",
    },
    previewRows: [],
  };

  function applyLocalFilter() {
    S.viewRows = buildViewRows(S.fullData, $("q").value, $("tag").value);
    paintEntryList();
    paintEmptyState();
  }

  function paintEmptyState() {
    var elNone = $("empty-none");
    var elNoMatch = $("empty-nomatch");
    if (!elNone || !elNoMatch) return;
    var loading = S.loading;
    var hasData = S.fullData.length > 0;
    var n = S.viewRows.length;
    elNone.style.display = !loading && n === 0 && !hasData ? "block" : "none";
    elNoMatch.style.display = !loading && n === 0 && hasData ? "block" : "none";
  }

  function setLoadError(msg) {
    if (msg) {
      debugLog("setLoadError", msg);
    }
    var el = $("load-error");
    if (el) {
      el.textContent = msg || "";
      el.style.display = msg ? "block" : "none";
    }
  }

  function setRuntimeWarning(msg) {
    if (msg) {
      debugLog("setRuntimeWarning", msg);
    }
    var el = $("runtime-warning");
    if (el) {
      el.textContent = msg || "";
      el.style.display = msg ? "block" : "none";
    }
  }

  function setSaveError(msg) {
    var el = $("save-error");
    if (el) {
      el.textContent = msg || "";
      el.style.display = msg ? "block" : "none";
    }
  }

  function syncSearchClear() {
    var btn = $("search-clear");
    var q = $("q");
    if (!btn || !q) return;
    btn.style.display = q.value.trim() ? "inline-flex" : "none";
  }

  function syncSaveButton() {
    var btn = $("btn-save");
    var desc = $("entry-desc");
    if (!btn || !desc) return;
    btn.disabled = isEffectivelyEmptyText(desc.value) || S.saveInFlight;
    btn.textContent = "Save";
  }

  function syncImportButton() {
    var btn = $("btn-import");
    var ta = $("import-json");
    if (!btn || !ta) return;
    btn.disabled = S.importInFlight || isEffectivelyEmptyText(ta.value);
    btn.textContent = "Import";
  }

  function syncAiProcessButton() {
    var btn = $("btn-add");
    var ta = $("add-input");
    if (!btn || !ta) return;
    btn.disabled = S.aiInFlight || S.approveInFlight || isEffectivelyEmptyText(ta.value);
    btn.textContent = S.aiInFlight ? "Processing..." : "Add";
  }

  function stripDiaryInputPrefix(text) {
    var s = normalizeLineEndings(text || "");
    s = s.replace(/^\s*diary input\s*/i, "");
    var fenced = s.match(/^\s*```[\w-]*\s*([\s\S]*?)\s*```\s*$/);
    if (fenced && fenced[1]) return fenced[1].trim();
    return s.trim();
  }

  function loadDiaryInputRulePrompt() {
    return fetch(".cursor/rules/diary-input-import.mdc?ts=" + Date.now(), {
      cache: "no-store",
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Rule file not found");
        return res.text();
      })
      .then(function (txt) {
        return String(txt || "");
      })
      .catch(function () {
        return "";
      });
  }

  function normalizePreviewRows(logs) {
    return (logs || []).map(function (x) {
      return {
        include: true,
        created_at: normalizeLineEndings(x.created_at || ""),
        raw_text: normalizeLineEndings(x.raw_text || ""),
        title: normalizeLineEndings(x.title || ""),
        summary: normalizeLineEndings(x.summary || ""),
        tags: Array.isArray(x.tags) ? x.tags : [],
        sentiment: x.sentiment || "Neutral",
      };
    }).filter(function (x) {
      return !isEffectivelyEmptyText(x.raw_text);
    });
  }

  function countIncludedPreviewRows() {
    return S.previewRows.filter(function (x) {
      return x.include !== false;
    }).length;
  }

  function paintPreviewModal() {
    var body = $("preview-modal-body");
    if (!body) return;
    if (!S.previewRows.length) {
      body.innerHTML = '<p class="empty">No rows to approve.</p>';
      return;
    }
    var selected = countIncludedPreviewRows();
    var total = S.previewRows.length;
    var html =
      '<div class="preview-toolbar">' +
      '<p id="preview-selected-meta" class="preview-selected-meta">Selected ' +
      selected +
      ' / ' +
      total +
      '</p>' +
      '<div class="preview-toolbar-actions">' +
      '<button type="button" class="secondary" data-preview-select-all>Select all</button>' +
      '<button type="button" class="secondary" data-preview-select-none>Clear all</button>' +
      '</div>' +
      '</div>' +
      '<div class="preview-table-wrap"><table class="preview-table"><thead><tr>' +
      '<th class="preview-col-check">Add</th><th class="preview-col-index">#</th><th class="preview-col-raw">Raw Text</th><th class="preview-col-title">Title</th><th class="preview-col-summary">Summary</th><th class="preview-col-del"></th></tr></thead><tbody>';
    for (var i = 0; i < S.previewRows.length; i++) {
      var r = S.previewRows[i];
      html += '<tr data-preview-row="' + i + '"' + (r.include === false ? ' class="preview-row-off"' : '') + '>' +
        '<td><input type="checkbox" data-preview-include' +
        (r.include === false ? "" : " checked") +
        ' aria-label="Select row ' +
        (i + 1) +
        '"></td>' +
        '<td>' + (i + 1) + '</td>' +
        '<td><textarea data-preview-raw>' + escapeHtml(r.raw_text) + '</textarea></td>' +
        '<td><input type="text" data-preview-title value="' + escapeAttr(r.title) + '"></td>' +
        '<td><textarea data-preview-summary>' + escapeHtml(r.summary) + '</textarea></td>' +
        '<td><button type="button" class="secondary preview-delete" data-preview-delete>×</button></td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';
    body.innerHTML = html;
  }

  function openPreviewModal() {
    var root = $("preview-modal");
    if (!root) return;
    paintPreviewModal();
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
  }

  function closePreviewModal() {
    var root = $("preview-modal");
    if (!root) return;
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
  }

  function processDiaryInputWithAi() {
    var inputEl = $("add-input");
    if (
      !inputEl ||
      !S.transport ||
      typeof S.transport.aiDiaryInput !== "function"
    ) {
      setSaveError("AI transport is unavailable");
      return;
    }
    if (S.aiInFlight || isEffectivelyEmptyText(inputEl.value)) return;

    var source = stripDiaryInputPrefix(inputEl.value);
    if (isEffectivelyEmptyText(source)) {
      setSaveError("Diary input is empty");
      return;
    }

    S.aiInFlight = true;
    beginSync();
    setSaveError("");
    syncAiProcessButton();

    Promise.resolve()
      .then(loadDiaryInputRulePrompt)
      .then(function (ruleText) {
        return S.transport.aiDiaryInput({
          text: source,
          rule_prompt: ruleText,
        });
      })
      .then(function (res) {
        var rows = normalizePreviewRows(res.logs);
        if (!rows.length) throw new Error("AI returned empty rows");
        S.previewRows = rows;
        openPreviewModal();
      })
      .catch(function (err) {
        setSaveError((err && err.message) || "AI processing failed");
      })
      .finally(function () {
        endSync();
        S.aiInFlight = false;
        syncAiProcessButton();
      });
  }

  function approvePreviewRows() {
    if (!S.previewRows.length || !S.transport || S.approveInFlight) return;
    var approvedRows = S.previewRows.filter(function (x) {
      return x.include !== false && !isEffectivelyEmptyText(x.raw_text);
    });
    if (!approvedRows.length) {
      setSaveError("Select at least one row to approve");
      return;
    }
    S.approveInFlight = true;
    beginSync();
    setSaveError("");
    var approveBtn = $("preview-approve-btn");
    if (approveBtn) {
      approveBtn.disabled = true;
      approveBtn.textContent = "Saving...";
    }
    S.transport
      .importLogs({ logs: approvedRows })
      .then(function (data) {
        var inputEl = $("add-input");
        if (inputEl) inputEl.value = "";
        S.previewRows = [];
        closePreviewModal();
        openImportModal(data);
        return loadEntries();
      })
      .catch(function (err) {
        setSaveError((err && err.message) || "Approve failed");
      })
      .finally(function () {
        endSync();
        S.approveInFlight = false;
        if (approveBtn) {
          approveBtn.disabled = false;
          approveBtn.textContent = "Approve";
        }
        syncAiProcessButton();
      });
  }

  function paintCtxMenu() {
    var menu = $("ctx-menu");
    if (!menu) return;
    if (!S.tagMenu.visible) {
      menu.style.display = "none";
      return;
    }
    menu.style.display = "block";
    menu.style.left = S.tagMenu.x + "px";
    menu.style.top = S.tagMenu.y + "px";
  }

  function closeTagMenu() {
    S.tagMenu.visible = false;
    paintCtxMenu();
  }

  function paintEntryList() {
    var root = $("entry-list");
    if (!root) return;
    var parts = [];
    var rows = S.viewRows;
    var ei;
    for (ei = 0; ei < rows.length; ei++) {
      var item = rows[ei];
      var e = item.entry;
      var id = e.id;
      var idStr = String(id);
      var editing = S.editingId === id;
      parts.push('<article class="entry" data-entry-id="' + escapeAttr(idStr) + '">');
      parts.push('<div class="entry-main">');
      if (!editing) {
        parts.push('<div class="entry-actions">');
        parts.push(
          '<button type="button" class="icon-btn" title="Edit" data-action="edit" data-id="' +
            escapeAttr(idStr) +
            '">✎</button>'
        );
        parts.push(
          '<button type="button" class="icon-btn danger" title="Delete" data-action="delete" data-id="' +
            escapeAttr(idStr) +
            '">🗑</button>'
        );
        parts.push(
          '<label class="entry-select-wrap" title="Select for bulk delete or tag"><input type="checkbox" data-entry-select data-id="' +
            escapeAttr(idStr) +
            '"' +
            (S.selectedIds[idStr] ? " checked" : "") +
            "></label>"
        );
        parts.push("</div>");
        if (e.title) {
          parts.push('<div class="entry-title-line">' + item.titleHtml + "</div>");
        } else {
          parts.push('<div class="entry-title-line untitled">Untitled</div>');
        }
        if (e.summary) {
          parts.push('<div class="entry-summary-line">' + item.summaryHtml + "</div>");
        }
        parts.push('<div class="entry-body">' + item.rawHtml + "</div>");
        if (item.tagSpans && item.tagSpans.length) {
          parts.push('<div class="tags">');
          var ti;
          for (ti = 0; ti < item.tagSpans.length; ti++) {
            var ts = item.tagSpans[ti];
            parts.push('<span class="tag"><span>');
            parts.push(ts.html);
            parts.push(
              '</span><button type="button" class="tag-remove" title="Remove tag" aria-label="Remove tag" data-action="remove-tag" data-id="' +
                escapeAttr(idStr) +
                '" data-tag="' +
                escapeAttr(String(ts.text)) +
                '">x</button></span>'
            );
          }
          parts.push("</div>");
        }
      } else {
        parts.push('<div class="edit-box">');
        parts.push(
          '<label>Title</label><input type="text" data-edit-title value="' +
            escapeAttr(S.editTitle) +
            '">'
        );
        parts.push(
          '<label style="margin-top:0.5rem">Raw text</label><textarea data-edit-raw>' +
            escapeHtml(S.editRaw) +
            "</textarea>"
        );
        parts.push(
          '<label style="margin-top:0.5rem">Summary</label><textarea data-edit-summary>' +
            escapeHtml(S.editSummary) +
            "</textarea>"
        );
        parts.push(
          '<label style="margin-top:0.5rem">Tags</label><input type="text" data-edit-tags value="' +
            escapeAttr(S.editTags) +
            '">'
        );
        parts.push('<div class="btn-row">');
        parts.push(
          '<button type="button" data-action="save-edit" id="btn-save-edit" ' +
            (S.editInFlight || isEffectivelyEmptyText(S.editRaw) ? "disabled" : "") +
            ">" +
            (S.editInFlight ? "Saving…" : "Save Edit") +
            "</button>"
        );
        parts.push(
          '<button type="button" class="secondary" data-action="cancel-edit" ' +
            (S.editInFlight ? "disabled" : "") +
            ">Cancel</button>"
        );
        parts.push("</div></div>");
      }
      parts.push("</div></article>");
    }
    root.innerHTML = parts.join("");
    paintBulkBar();
  }

  function getEntryById(id) {
    var target = String(id || "");
    var i;
    for (i = 0; i < S.fullData.length; i++) {
      if (String(S.fullData[i].id) === target) return S.fullData[i];
    }
    return null;
  }

  async function loadEntries() {
    if (!S.transport) {
      S.fullData = [];
      S.viewRows = [];
      paintEntryList();
      paintEmptyState();
      paintBulkBar();
      rebuildTagCatalog();
      return;
    }
    S.loading = true;
    beginSync();
    setLoadError("");
    try {
      var list = await S.transport.list();
      debugLog("loadEntries success count", Array.isArray(list) ? list.length : 0);
      S.fullData = (list || []).map(enrichEntry);
      pruneSelectedIds();
      rebuildTagCatalog();
      applyLocalFilter();
    } catch (err) {
      debugLog(
        "loadEntries failed",
        String(err && err.message ? err.message : err)
      );
      setLoadError((err && err.message) || "Failed to load entries");
      S.fullData = [];
      S.viewRows = [];
      S.tagCatalog = [];
      paintEntryList();
      paintEmptyState();
      paintBulkBar();
      rebuildTagCatalog();
    } finally {
      S.loading = false;
      endSync();
      paintEmptyState();
      paintBulkBar();
    }
  }

  function onAppClick(ev) {
    var t = ev.target;
    if (t.closest && t.closest("#ctx-menu")) {
      return;
    }
    closeTagMenu();
  }

  function onEntryListClick(ev) {
    var btn = ev.target.closest("[data-action]");
    if (!btn) return;
    var action = btn.getAttribute("data-action");
    var id = btn.getAttribute("data-id");
    if (action === "edit") {
      var ent = getEntryById(id);
      if (ent) {
        S.editingId = ent.id;
        S.editRaw = ent.raw_text || "";
        S.editTitle = ent.title || "";
        S.editSummary = ent.summary || "";
        S.editTags = (ent.tags || []).join(", ");
        paintEntryList();
      }
      return;
    }
    if (action === "delete") {
      void deleteEntry(id);
      return;
    }
    if (action === "remove-tag") {
      var tag = btn.getAttribute("data-tag");
      var e2 = getEntryById(id);
      if (e2) void removeTag(e2, tag);
      return;
    }
    if (action === "save-edit") {
      void updateEntry();
      return;
    }
    if (action === "cancel-edit") {
      S.editingId = null;
      S.editRaw = "";
      S.editTitle = "";
      S.editSummary = "";
      S.editTags = "";
      paintEntryList();
      return;
    }
  }

  function onEntryListInput(ev) {
    var t = ev.target;
    if (t.getAttribute("data-edit-raw")) {
      S.editRaw = t.value;
      var b = $("btn-save-edit");
      if (b) b.disabled = S.editBusy || isEffectivelyEmptyText(S.editRaw);
    } else if (t.getAttribute("data-edit-title")) {
      S.editTitle = t.value;
    } else if (t.getAttribute("data-edit-summary")) {
      S.editSummary = t.value;
    } else if (t.getAttribute("data-edit-tags")) {
      S.editTags = t.value;
    }
  }

  function onEntryContextMenu(ev) {
    var art = ev.target.closest("[data-entry-id]");
    if (!art) return;
    var id = art.getAttribute("data-entry-id");
    var sel = window.getSelection && window.getSelection();
    var phrase = (sel ? sel.toString() : "").trim();
    if (!phrase) return;
    ev.preventDefault();
    var ent = getEntryById(id);
    if (!ent) return;
    S.tagMenu = {
      visible: true,
      x: Math.min(ev.clientX, window.innerWidth - 210),
      y: Math.min(ev.clientY, window.innerHeight - 60),
      entryId: ent.id,
      phrase: phrase,
    };
    paintCtxMenu();
  }

  function saveEntry() {
    var titleEl = $("entry-title");
    var descEl = $("entry-desc");
    var tagsEl = $("entry-tags");
    if (!descEl || !S.transport) return;
    var raw_text = normalizeLineEndings(descEl.value);
    if (isEffectivelyEmptyText(raw_text)) return;
    if (S.saveInFlight) return;
    var summary = titleEl ? normalizeLineEndings(titleEl.value) : "";
    var tags = tagsEl ? parseTagsFromInput(tagsEl.value) : [];
    S.saveInFlight = true;
    beginSync();
    setSaveError("");
    syncSaveButton();
    S.transport
      .create({
        raw_text: raw_text,
        summary: summary,
        tags: tags,
      })
      .then(function () {
        if (titleEl) titleEl.value = "";
        descEl.value = "";
        if (tagsEl) tagsEl.value = "";
        var panel = $("tag-suggest-panel");
        if (panel) {
          panel.hidden = true;
          panel.innerHTML = "";
        }
        closeSidebarSheet();
        return loadEntries();
      })
      .catch(function (err) {
        setSaveError((err && err.message) || "Save failed");
      })
      .finally(function () {
        endSync();
        S.saveInFlight = false;
        syncSaveButton();
      });
  }

  function updateEntry() {
    if (!S.editingId || isEffectivelyEmptyText(S.editRaw) || !S.transport) return;
    if (S.editInFlight) return;
    var id = S.editingId;
    var raw = normalizeLineEndings(S.editRaw);
    var title = normalizeLineEndings(S.editTitle || "");
    var summary = normalizeLineEndings(S.editSummary || "");
    var tags = parseTagsFromInput(S.editTags);
    S.editInFlight = true;
    paintEntryList();
    beginSync();
    setSaveError("");
    S.transport
      .update({
        id: id,
        raw_text: raw,
        title: title,
        summary: summary,
        tags: tags,
      })
      .then(function () {
        S.editingId = null;
        S.editRaw = "";
        S.editTitle = "";
        S.editSummary = "";
        S.editTags = "";
        return loadEntries();
      })
      .catch(function (err) {
        setSaveError((err && err.message) || "Update failed");
      })
      .finally(function () {
        endSync();
        S.editInFlight = false;
        paintEntryList();
      });
  }

  function importLogs() {
    var ta = $("import-json");
    if (!ta || !S.transport) return;
    if (isEffectivelyEmptyText(ta.value)) return;
    if (S.importInFlight) return;
    S.importInFlight = true;
    beginSync();
    setSaveError("");
    syncImportButton();
    var payload;
    try {
      var parsed = JSON.parse(ta.value);
      var logs = Array.isArray(parsed) ? parsed : parsed.logs;
      if (!Array.isArray(logs) || !logs.length) {
        throw new Error("Invalid import JSON");
      }
      payload = { logs: logs };
    } catch (e) {
      endSync();
      S.importInFlight = false;
      syncImportButton();
      setSaveError((e && e.message) || "Invalid JSON");
      return;
    }
    S.transport
      .importLogs(payload)
      .then(function (data) {
        ta.value = "";
        openImportModal(data);
        return loadEntries();
      })
      .catch(function (err) {
        setSaveError((err && err.message) || "Import failed");
      })
      .finally(function () {
        endSync();
        S.importInFlight = false;
        syncImportButton();
      });
  }

  function deleteEntry(id) {
    if (!S.transport) return;
    if (!confirm("Delete this entry?")) return;
    beginSync();
    setSaveError("");
    S.transport
      .remove({ id: id })
      .then(function () {
        if (String(S.editingId) === String(id)) {
          S.editingId = null;
          S.editRaw = "";
          S.editTitle = "";
          S.editSummary = "";
          S.editTags = "";
        }
        delete S.selectedIds[String(id)];
        return loadEntries();
      })
      .catch(function (err) {
        setSaveError((err && err.message) || "Delete failed");
      })
      .finally(endSync);
  }

  function removeTag(entry, tagToRemove) {
    if (!S.transport) return;
    var nextTags = (entry.tags || []).filter(function (t) {
      return t !== tagToRemove;
    });
    beginSync();
    setSaveError("");
    S.transport
      .update({
        id: entry.id,
        raw_text: entry.raw_text || "",
        tags: nextTags,
      })
      .then(function () {
        return loadEntries();
      })
      .catch(function (err) {
        setSaveError((err && err.message) || "Remove tag failed");
      })
      .finally(endSync);
  }

  function addSelectionAsTag() {
    if (!S.tagMenu.entryId || !S.tagMenu.phrase || !S.transport) {
      closeTagMenu();
      return;
    }
    var phrase = S.tagMenu.phrase;
    var eid = S.tagMenu.entryId;
    closeTagMenu();
    beginSync();
    setSaveError("");
    S.transport
      .appendTag({
        id: eid,
        tag: phrase,
      })
      .then(function () {
        return loadEntries();
      })
      .catch(function (err) {
        setSaveError((err && err.message) || "Add tag failed");
      })
      .finally(endSync);
  }

  function closeSidebarSheet() {
    var sb = $("app-sidebar");
    var bd = $("sidebar-backdrop");
    if (sb) sb.classList.remove("sidebar-open");
    if (bd) bd.classList.remove("visible");
  }

  function clearSearch() {
    var q = $("q");
    if (q) q.value = "";
    syncSearchClear();
    applyLocalFilter();
    if (q) q.focus();
  }

  function bindModal() {
    var closes = document.querySelectorAll("[data-close-modal]");
    var i;
    for (i = 0; i < closes.length; i++) {
      closes[i].addEventListener("click", closeImportModal);
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        closeImportModal();
        closePreviewModal();
      }
    });
  }

  function bind() {
    var app = $("app");
    if (app) {
      app.addEventListener("click", onAppClick);
    }
    var list = $("entry-list");
    if (list) {
      list.addEventListener("click", onEntryListClick);
      list.addEventListener("change", onEntryListChange);
      list.addEventListener("input", onEntryListInput);
      list.addEventListener("contextmenu", onEntryContextMenu);
    }
    var bulkAll = $("bulk-select-all");
    if (bulkAll) bulkAll.addEventListener("change", onBulkSelectAllChange);
    var bulkAdd = $("bulk-add-tag-btn");
    if (bulkAdd) bulkAdd.addEventListener("click", bulkAddTagToSelected);
    var bulkDel = $("bulk-delete-btn");
    if (bulkDel) bulkDel.addEventListener("click", bulkDeleteSelected);
    var q = $("q");
    var tag = $("tag");
    if (q) {
      q.addEventListener("input", function () {
        syncSearchClear();
        applyLocalFilter();
      });
    }
    if (tag) {
      tag.addEventListener("input", applyLocalFilter);
    }
    var sc = $("search-clear");
    if (sc) sc.addEventListener("click", clearSearch);
    var aiBtn = $("btn-add");
    var aiIn = $("add-input");
    if (aiBtn) {
      aiBtn.addEventListener("click", function () {
        void processDiaryInputWithAi();
      });
    }
    if (aiIn) aiIn.addEventListener("input", syncAiProcessButton);
    var previewRoot = $("preview-modal-body");
    if (previewRoot) {
      previewRoot.addEventListener("input", function (ev) {
        var row = ev.target.closest("[data-preview-row]");
        if (!row) return;
        var idx = Number(row.getAttribute("data-preview-row"));
        if (isNaN(idx) || !S.previewRows[idx]) return;
        if (ev.target.hasAttribute("data-preview-include")) {
          S.previewRows[idx].include = !!ev.target.checked;
        } else if (ev.target.hasAttribute("data-preview-raw")) {
          S.previewRows[idx].raw_text = ev.target.value;
        } else if (ev.target.hasAttribute("data-preview-title")) {
          S.previewRows[idx].title = ev.target.value;
        } else if (ev.target.hasAttribute("data-preview-summary")) {
          S.previewRows[idx].summary = ev.target.value;
        }
      });
      previewRoot.addEventListener("change", function (ev) {
        if (!ev.target.hasAttribute("data-preview-include")) return;
        var row = ev.target.closest("[data-preview-row]");
        if (!row) return;
        var idx = Number(row.getAttribute("data-preview-row"));
        if (isNaN(idx) || !S.previewRows[idx]) return;
        S.previewRows[idx].include = !!ev.target.checked;
        paintPreviewModal();
      });
      previewRoot.addEventListener("click", function (ev) {
        if (ev.target.hasAttribute("data-preview-select-all")) {
          S.previewRows.forEach(function (r) {
            r.include = true;
          });
          paintPreviewModal();
          return;
        }
        if (ev.target.hasAttribute("data-preview-select-none")) {
          S.previewRows.forEach(function (r) {
            r.include = false;
          });
          paintPreviewModal();
          return;
        }
        if (!ev.target.hasAttribute("data-preview-delete")) return;
        var row = ev.target.closest("[data-preview-row]");
        if (!row) return;
        var idx = Number(row.getAttribute("data-preview-row"));
        if (isNaN(idx)) return;
        S.previewRows.splice(idx, 1);
        paintPreviewModal();
      });
    }
    var approveBtn = $("preview-approve-btn");
    if (approveBtn) approveBtn.addEventListener("click", function () { void approvePreviewRows(); });
    var previewCloses = document.querySelectorAll("[data-close-preview]");
    for (var pci = 0; pci < previewCloses.length; pci++) {
      previewCloses[pci].addEventListener("click", closePreviewModal);
    }
    var ctx = $("ctx-menu");
    if (ctx) {
      ctx.addEventListener("click", function (e) {
        e.stopPropagation();
      });
    }
    var ctxBtn = $("ctx-add-tag");
    if (ctxBtn) {
      ctxBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        void addSelectionAsTag();
      });
    }
    var fab = $("fab-new");
    var sidebarBackdrop = $("sidebar-backdrop");
    if (fab) {
      fab.addEventListener("click", function () {
        var sb = $("app-sidebar");
        if (!sb || !sidebarBackdrop) return;
        var isOpen = sb.classList.contains("sidebar-open");
        if (isOpen) {
          closeSidebarSheet();
        } else {
          sb.classList.add("sidebar-open");
          sidebarBackdrop.classList.add("visible");
        }
      });
    }
    if (sidebarBackdrop) {
      sidebarBackdrop.addEventListener("click", closeSidebarSheet);
    }
    window.addEventListener("scroll", closeTagMenu, true);
    window.addEventListener("resize", closeTagMenu);
    bindModal();

    var menuBtn = $("mobile-menu-toggle");
    var sidebar = $("app-sidebar");
    if (menuBtn && sidebar) {
      menuBtn.addEventListener("click", function () {
        var open = sidebar.classList.toggle("mobile-open");
        menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
  }

  function init() {
    bind();
    debugLog("Init start");
    debugLog("Location", window.location.href);
    debugLog("window.DIARY_APP_CONFIG", window.DIARY_APP_CONFIG || null);
    if (
      typeof window !== "undefined" &&
      window.location.protocol === "file:"
    ) {
      setRuntimeWarning(
        "Do not open this page as file://. Serve it over http (e.g. npx serve) — otherwise the browser blocks requests to Google Apps Script."
      );
    } else {
      setRuntimeWarning("");
    }

    var DT = window.DiaryTransport;
    if (!DT || typeof DT.createHttpTransport !== "function") {
      setLoadError("Missing window.DiaryTransport transport.js script.");
      return;
    }

    var base = getAppScriptBaseUrl();
    debugLog("Resolved APPS_SCRIPT_URL", base || "(empty)");
    if (!base) {
      fetch("config.js?ts=" + Date.now(), { cache: "no-store" })
        .then(function (res) {
          debugLog("config.js fetch status", res.status);
          return res.text();
        })
        .then(function (txt) {
          debugLog("config.js body preview", String(txt || "").slice(0, 400));
        })
        .catch(function (err) {
          debugLog(
            "config.js fetch failed",
            String(err && err.message ? err.message : err)
          );
        });
      setLoadError(
        "Set APPS_SCRIPT_URL in config.js to your deployed Apps Script Web App /exec URL."
      );
      return;
    }
    S.transport = DT.createHttpTransport(base);

    syncSaveButton();
    syncImportButton();
    syncAiProcessButton();
    syncSearchClear();
    void loadEntries();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
