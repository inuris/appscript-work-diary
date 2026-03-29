window.DiaryTransport = (function () {
  function createHttpTransport(baseUrl) {
    console.info("[DiaryDebug] createHttpTransport baseUrl:", baseUrl);

    function parseJsonResponse(response) {
      console.info(
        "[DiaryDebug] HTTP response:",
        response.status,
        response.statusText,
        response.url
      );
      return response.text().then(function (text) {
        var data;
        try {
          data = JSON.parse(text);
        } catch (err) {
          console.error("[DiaryDebug] JSON parse failed. Raw response:", text);
          throw new Error(
            "Server returned invalid JSON (first 300 chars): " +
              String(text || "").slice(0, 300)
          );
        }
        if (!response.ok) {
          throw new Error(
            (data && data.error) || "HTTP " + response.status + " from Apps Script"
          );
        }
        return data;
      });
    }

    function post(action, payload) {
      console.info("[DiaryDebug] POST action:", action, "payload:", payload);
      return fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ action: action, payload: payload || {} }),
      })
        .then(parseJsonResponse)
        .then(function (data) {
          if (!data.ok) throw new Error(data.error || "Apps Script error");
          return data;
        });
    }

    return {
      list: function () {
        var url = baseUrl + "?action=list";
        console.info("[DiaryDebug] GET list:", url);
        return fetch(baseUrl + "?action=list")
          .then(parseJsonResponse)
          .then(function (data) {
            if (!data.ok) throw new Error(data.error || "Apps Script error");
            return data.entries || [];
          });
      },
      create: function (payload) {
        return post("create", payload);
      },
      update: function (payload) {
        return post("update", payload);
      },
      remove: function (payload) {
        return post("delete", payload);
      },
      importLogs: function (payload) {
        return post("import", payload);
      },
      appendTag: function (payload) {
        return post("append_tag", payload);
      },
    };
  }

  return {
    createHttpTransport: createHttpTransport,
  };
})();
