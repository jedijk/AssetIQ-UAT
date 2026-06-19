/**
 * ES5-safe display pairing for Samsung TV / legacy browsers (no optional chaining).
 * Loaded when the React kiosk bundle cannot run.
 */
(function () {
  var TOKEN_KEY = "assetiq_display_device_token";
  var DEVICE_ID_KEY = "assetiq_display_device_id";
  var FINGERPRINT_KEY = "assetiq_display_fingerprint";
  var DB_ENV_KEY = "assetiq_display_db_env";

  function $(id) {
    return document.getElementById(id);
  }

  function getDbEnv() {
    try {
      var fromUrl = new URLSearchParams(window.location.search).get("db_env");
      if (fromUrl === "uat" || fromUrl === "production") return fromUrl;
    } catch (e) {}
    try {
      var stored = localStorage.getItem(DB_ENV_KEY);
      if (stored === "uat" || stored === "production") return stored;
    } catch (e2) {}
    var host = (window.location.hostname || "").toLowerCase();
    if (host.indexOf("-uat") >= 0 || host.indexOf("uat.") >= 0) return "uat";
    return "production";
  }

  function apiQuery() {
    var env = getDbEnv();
    return env ? "?db_env=" + encodeURIComponent(env) : "";
  }

  function apiBase() {
    return window.location.origin;
  }

  function getFingerprint() {
    try {
      var fp = localStorage.getItem(FINGERPRINT_KEY);
      if (fp) return fp;
      fp = "fp_" + Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
      localStorage.setItem(FINGERPRINT_KEY, fp);
      return fp;
    } catch (e) {
      return "fp_" + Date.now();
    }
  }

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function setHtml(html) {
    var root = $("root");
    if (!root) return;
    root.innerHTML = html;
  }

  function showError(msg) {
    setHtml(
      '<div style="min-height:100vh;background:#020617;color:#e2e8f0;display:flex;align-items:center;justify-content:center;padding:24px;font-family:sans-serif;text-align:center">' +
        '<div style="max-width:420px"><h1 style="font-size:20px;margin:0 0 12px">Display error</h1>' +
        '<p style="color:#94a3b8;line-height:1.5">' +
        msg +
        '</p><button type="button" id="tv-reload" style="margin-top:16px;padding:12px 20px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-size:14px;font-weight:600">Reload</button></div></div>'
    );
    var btn = $("tv-reload");
    if (btn) btn.onclick = function () {
      window.location.reload();
    };
  }

  function formatCountdown(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function xhr(method, url, body, cb, extraHeaders) {
    var req = new XMLHttpRequest();
    req.open(method, url, true);
    req.setRequestHeader("Content-Type", "application/json");
    if (extraHeaders) {
      for (var key in extraHeaders) {
        if (Object.prototype.hasOwnProperty.call(extraHeaders, key)) {
          req.setRequestHeader(key, extraHeaders[key]);
        }
      }
    }
    req.onreadystatechange = function () {
      if (req.readyState !== 4) return;
      var data = null;
      try {
        data = req.responseText ? JSON.parse(req.responseText) : null;
      } catch (e) {
        data = null;
      }
      if (req.status >= 200 && req.status < 300) {
        cb(null, data);
      } else {
        var detail = data && data.detail ? data.detail : "Request failed (" + req.status + ")";
        cb(new Error(detail));
      }
    };
    req.send(body ? JSON.stringify(body) : null);
  }

  var state = {
    pairCode: "",
    fingerprint: getFingerprint(),
    expiresIn: 0,
    pollTimer: null,
    boardTimer: null,
    boardLayout: null,
  };

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function widgetPayload(data, widgetId) {
    var widgets = (data && data.widgets) || {};
    return widgets[widgetId] || {};
  }

  function formatWidgetValue(payload) {
    if (payload.formatted_value != null && payload.formatted_value !== "") {
      return payload.formatted_value;
    }
    if (payload.value != null && payload.value !== "") {
      return payload.value;
    }
    return "—";
  }

  function renderMetricWidget(widget, payload) {
    var label = widget.title || payload.label || payload.metric || widget.id || "KPI";
    var value = formatWidgetValue(payload);
    var unit = payload.unit || "";
    var subtitle = payload.subtitle || "";
    var html =
      '<div class="tv-widget-card">' +
      '<div class="tv-widget-label">' +
      escapeHtml(label) +
      "</div>" +
      '<div class="tv-widget-value-row">' +
      '<span class="tv-widget-value">' +
      escapeHtml(value) +
      "</span>";
    if (unit) {
      html += '<span class="tv-widget-unit">' + escapeHtml(unit) + "</span>";
    }
    html += "</div>";
    if (subtitle) {
      html += '<div class="tv-widget-subtitle">' + escapeHtml(subtitle) + "</div>";
    }
    html += "</div>";
    return html;
  }

  function renderStatusWidget(widget, payload, data) {
    var status = (payload.status || (data && data.status && data.status.status) || "GREEN").toUpperCase();
    var reason = payload.reason || (data && data.status && data.status.reason) || "";
    var dotClass = "tv-status-dot tv-status-dot--green";
    if (status === "RED") dotClass = "tv-status-dot tv-status-dot--red";
    else if (status === "AMBER") dotClass = "tv-status-dot tv-status-dot--amber";
    return (
      '<div class="tv-widget-card tv-widget-card--center">' +
      '<div class="' +
      dotClass +
      '"></div>' +
      '<div class="tv-widget-status">' +
      escapeHtml(status) +
      "</div>" +
      (reason ? '<div class="tv-widget-subtitle">' + escapeHtml(reason) + "</div>" : "") +
      "</div>"
    );
  }

  function renderTextWidget(widget) {
    var text = (widget.config && widget.config.text) || widget.title || "";
    return (
      '<div class="tv-widget-card">' +
      '<div class="tv-widget-body">' +
      escapeHtml(text) +
      "</div></div>"
    );
  }

  function renderListWidget(widget, payload) {
    var items = payload.items || payload.observations || payload.actions || [];
    var label = widget.title || widget.id || "List";
    var html =
      '<div class="tv-widget-card tv-widget-card--list">' +
      '<div class="tv-widget-label">' +
      escapeHtml(label) +
      "</div>";
    if (!items.length) {
      html += '<div class="tv-widget-subtitle">No items</div>';
    } else {
      html += '<ul class="tv-widget-list">';
      for (var i = 0; i < items.length && i < 8; i++) {
        var item = items[i];
        var line =
          item.title ||
          item.name ||
          item.description ||
          item.failure_mode ||
          (item.risk_score != null ? "Risk " + item.risk_score : "") ||
          "Item";
        html += "<li>" + escapeHtml(line) + "</li>";
      }
      html += "</ul>";
    }
    html += "</div>";
    return html;
  }

  function renderWidgetContent(widget, data) {
    var payload = widgetPayload(data, widget.id);
    var type = widget.type || "kpi_card";
    if (type === "production_kpi" || type === "kpi_card") {
      return renderMetricWidget(widget, payload);
    }
    if (type === "status_indicator") {
      return renderStatusWidget(widget, payload, data);
    }
    if (type === "text_block") {
      return renderTextWidget(widget);
    }
    if (
      type === "observation_list" ||
      type === "risk_observation_list" ||
      type === "action_queue" ||
      type === "form_submissions_list"
    ) {
      return renderListWidget(widget, payload);
    }
    if (payload.formatted_value != null || payload.value != null) {
      return renderMetricWidget(widget, payload);
    }
    return renderMetricWidget(widget, { metric: widget.id, formatted_value: "—" });
  }

  function widgetsFromData(data) {
    var map = (data && data.widgets) || {};
    var keys = Object.keys(map);
    var widgets = [];
    for (var i = 0; i < keys.length; i++) {
      widgets.push({
        id: keys[i],
        type: "production_kpi",
        title: keys[i].replace(/^vi_/, "").replace(/_/g, " "),
        position: { x: (i % 4) * 6, y: Math.floor(i / 4) * 3, w: 6, h: 3 },
      });
    }
    return widgets;
  }

  function renderBoardCanvas(layout, data) {
    var boardName = (layout && layout.name) || "Visual Board";
    var gridLayout = (layout && layout.layout) || {};
    var cols = gridLayout.columns || 24;
    var rows = gridLayout.rows || 16;
    var widgets = (layout && layout.widgets) || [];
    if (!widgets.length && data) {
      widgets = widgetsFromData(data);
      cols = 24;
      rows = Math.max(16, Math.ceil(widgets.length / 4) * 3);
    }

    var html =
      '<div class="tv-board-canvas">' +
      '<div class="tv-board-header">' +
      '<div class="tv-board-title">' +
      escapeHtml(boardName) +
      "</div>" +
      '<div class="tv-board-live">Live</div>' +
      "</div>" +
      '<div class="tv-board-grid" style="grid-template-columns:repeat(' +
      cols +
      ",1fr);grid-template-rows:repeat(" +
      rows +
      ',1fr)">';

    for (var i = 0; i < widgets.length; i++) {
      var w = widgets[i];
      var pos = w.position || {};
      var x = pos.x || 0;
      var y = pos.y || 0;
      var pw = pos.w || 3;
      var ph = pos.h || 2;
      html +=
        '<div class="tv-widget-cell" style="grid-column:' +
        (x + 1) +
        " / span " +
        pw +
        ";grid-row:" +
        (y + 1) +
        " / span " +
        ph +
        '">' +
        renderWidgetContent(w, data) +
        "</div>";
    }

    html += "</div></div>";
    return html;
  }

  function renderPairing() {
    setHtml(
      '<div class="display-pair-page" style="min-height:100vh;background:#020617;color:#fff;display:flex;align-items:center;justify-content:center;padding:24px;font-family:sans-serif">' +
        '<div style="max-width:480px;width:100%;text-align:center">' +
        '<p style="color:#60a5fa;font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 8px">AssetIQ Display</p>' +
        '<h1 style="font-size:28px;margin:0 0 24px">Pair this device</h1>' +
        '<div class="display-pair-code-box" style="background:#0f172a;border:1px solid #334155;border-radius:12px;padding:32px 20px;margin-bottom:16px">' +
        '<p style="color:#94a3b8;font-size:13px;margin:0 0 8px">Code</p>' +
        '<p id="tv-pair-code" class="display-pair-code" style="font-size:42px;font-family:monospace;font-weight:700;letter-spacing:0.3em;margin:0">------</p>' +
        '<p style="color:#64748b;font-size:13px;margin:16px 0 0">Expires in <span id="tv-expires">--:--</span></p>' +
        "</div>" +
        '<p id="tv-pair-status" style="color:#94a3b8;font-size:13px;margin:0">Waiting for administrator to pair…</p>' +
        '<p style="color:#475569;font-size:11px;margin-top:24px">Open AssetIQ on a phone or laptop on the same WiFi to pair this TV.</p>' +
        "</div></div>"
    );
  }

  function updatePairingUi() {
    var codeEl = $("tv-pair-code");
    var expEl = $("tv-expires");
    if (codeEl) codeEl.textContent = state.pairCode || "------";
    if (expEl) expEl.textContent = formatCountdown(state.expiresIn || 0);
  }

  function requestPairing(cb) {
    xhr(
      "POST",
      apiBase() + "/api/display/request-pairing" + apiQuery(),
      {
        device_fingerprint: state.fingerprint,
        user_agent: navigator.userAgent,
        screen_width: window.screen && window.screen.width,
        screen_height: window.screen && window.screen.height,
        device_label: navigator.platform || "Display",
      },
      cb
    );
  }

  function pollPairing(cb) {
    if (!state.pairCode) return;
    var url =
      apiBase() +
      "/api/display/pairing/" +
      encodeURIComponent(state.pairCode) +
      "/status" +
      apiQuery() +
      (apiQuery() ? "&" : "?") +
      "device_fingerprint=" +
      encodeURIComponent(state.fingerprint);
    xhr("GET", url, null, cb);
  }

  function startPairingFlow() {
    renderPairing();
    requestPairing(function (err, data) {
      if (err) {
        showError(err.message || "Could not start pairing");
        return;
      }
      state.pairCode = data.pair_code;
      state.expiresIn = data.expires_in || 600;
      updatePairingUi();

      if (state.pollTimer) clearInterval(state.pollTimer);
      state.pollTimer = setInterval(function () {
        if (state.expiresIn > 0) {
          state.expiresIn -= 1;
          updatePairingUi();
        }
        pollPairing(function (pollErr, status) {
          if (pollErr) return;
          if (status && status.status === "pending" && typeof status.expires_in === "number") {
            state.expiresIn = status.expires_in;
            updatePairingUi();
          }
          if (status && status.status === "paired" && status.device_token) {
            try {
              localStorage.setItem(TOKEN_KEY, status.device_token);
              localStorage.setItem(DEVICE_ID_KEY, status.device_id || "");
              localStorage.setItem(DB_ENV_KEY, getDbEnv());
            } catch (e) {}
            if (state.pollTimer) clearInterval(state.pollTimer);
            window.location.replace("/tv/board?fullscreen=true");
          }
          if (status && status.status === "expired") {
            requestPairing(function (e2, d2) {
              if (!e2 && d2) {
                state.pairCode = d2.pair_code;
                state.expiresIn = d2.expires_in || 600;
                updatePairingUi();
              }
            });
          }
        });
      }, 3000);
    });
  }

  function deviceHeaders() {
    var token = getToken();
    if (!token) return {};
    return { Authorization: "DeviceToken " + token };
  }

  function authedXhr(method, url, body, cb) {
    xhr(method, url, body, cb, deviceHeaders());
  }

  function renderBoard(config, layout) {
    state.boardLayout = layout;
    var title =
      (layout && layout.name) ||
      (config && config.screen_name) ||
      "Visual Board";
    setHtml(
      '<div class="tv-board-shell">' +
        '<div id="tv-board-body" class="tv-board-body">' +
        '<p class="tv-loading">Loading board data…</p>' +
        "</div></div>"
    );
  }

  function paintBoardData(data) {
    var body = $("tv-board-body");
    if (!body) return;
    if (!state.boardLayout && !data) {
      body.innerHTML = '<p class="tv-loading">Loading board…</p>';
      return;
    }
    body.innerHTML = renderBoardCanvas(state.boardLayout || {}, data || {});
  }

  function startBoardFlow() {
    var token = getToken();
    if (!token) {
      window.location.replace("/tv");
      return;
    }

    authedXhr("POST", apiBase() + "/api/display/connect" + apiQuery(), { device_token: token }, function (err) {
      if (err) {
        showError(err.message);
        return;
      }

      authedXhr("GET", apiBase() + "/api/display/config" + apiQuery(), null, function (cfgErr, config) {
        authedXhr("GET", apiBase() + "/api/display/board/layout" + apiQuery(), null, function (layErr, layout) {
          if (layErr) {
            showError(layErr.message);
            return;
          }
          state.boardLayout = layout;
          renderBoard(config, layout);

          function refreshData() {
            authedXhr("GET", apiBase() + "/api/display/board/data" + apiQuery(), null, function (dataErr, data) {
              if (dataErr) {
                var body = $("tv-board-body");
                if (body) {
                  body.innerHTML = '<p class="tv-error">' + escapeHtml(dataErr.message) + "</p>";
                }
                return;
              }
              paintBoardData(data);
            });
          }

          refreshData();
          if (state.boardTimer) clearInterval(state.boardTimer);
          var interval = (config && config.refresh_interval ? config.refresh_interval : 30) * 1000;
          state.boardTimer = setInterval(refreshData, interval);
        });
      });
    });
  }

  function ensureKioskPath() {
    var p = window.location.pathname || "/";
    var isKiosk =
      p === "/tv" ||
      p.indexOf("/tv/") === 0 ||
      p === "/display" ||
      p.indexOf("/display/") === 0 ||
      p.indexOf("/vmb/") === 0;
    if (!isKiosk) {
      window.location.replace("/tv");
      return false;
    }
    return true;
  }

  function boot() {
    if (!ensureKioskPath()) return;

    try {
      document.documentElement.className += " display-kiosk vmb-legacy-tv";
    } catch (e) {}

    var path = window.location.pathname || "/";
    var token = getToken();

    if (path.indexOf("/tv/board") === 0) {
      if (token) {
        startBoardFlow();
      } else {
        window.location.replace("/tv");
      }
      return;
    }

    if (token && path.indexOf("/tv") === 0) {
      window.location.replace("/tv/board?fullscreen=true");
      return;
    }

    startPairingFlow();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  if (typeof window !== "undefined") {
    window.__assetiqKioskBooted = function () {
      return true;
    };
  }
})();
