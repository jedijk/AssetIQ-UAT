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
  };

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
    var title = (layout && layout.name) || (config && config.screen_name) || "Visual Board";
    setHtml(
      '<div style="min-height:100vh;background:#020617;color:#fff;font-family:sans-serif;display:flex;flex-direction:column">' +
        '<div style="padding:16px 20px;border-bottom:1px solid #1e293b;display:flex;justify-content:space-between;align-items:center">' +
        '<div style="font-size:18px;font-weight:600">' +
        title +
        "</div>" +
        '<div style="font-size:12px;color:#4ade80">Live</div></div>' +
        '<div id="tv-board-body" style="flex:1;padding:16px;overflow:auto"><p style="color:#94a3b8">Loading board data…</p></div>' +
        "</div>"
    );
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
          renderBoard(config, layout);

          function refreshData() {
            authedXhr("GET", apiBase() + "/api/display/board/data" + apiQuery(), null, function (dataErr, data) {
              var body = $("tv-board-body");
              if (!body) return;
              if (dataErr) {
                body.innerHTML = '<p style="color:#fbbf24">' + dataErr.message + "</p>";
                return;
              }
              var widgets = (data && data.widgets) || {};
              var keys = Object.keys(widgets);
              var html = "";
              for (var i = 0; i < keys.length; i++) {
                var w = widgets[keys[i]];
                html +=
                  '<div style="background:#0f172a;border:1px solid #334155;border-radius:10px;padding:12px;margin-bottom:12px">' +
                  '<div style="font-size:12px;color:#94a3b8;margin-bottom:6px">' +
                  keys[i] +
                  "</div>" +
                  '<pre style="margin:0;font-size:11px;color:#e2e8f0;white-space:pre-wrap;word-break:break-word">' +
                  JSON.stringify(w, null, 2) +
                  "</pre></div>";
              }
              body.innerHTML = html || '<p style="color:#94a3b8">No widget data yet.</p>';
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

  function boot() {
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
