/**
 * ES5-safe Samsung / smart-TV redirect to the display kiosk (no inline script — CSP safe).
 * Also forces a cache-bust query param so TVs fetch fresh tv.html + kiosk bundles.
 */
(function () {
  var ua = navigator.userAgent || "";
  var p = location.pathname || "/";
  var isTV =
    /tizen|smarttv|smart-tv|hbbtv|smarthub/i.test(ua) ||
    (/samsung/i.test(ua) && /tv/i.test(ua));
  var isKiosk =
    p === "/tv" ||
    p.indexOf("/tv/") === 0 ||
    p === "/display" ||
    p.indexOf("/display/") === 0 ||
    p.indexOf("/vmb/") === 0;

  if (isKiosk && location.search.indexOf("_cb=") === -1) {
    var sep = location.search && location.search.length > 0 ? "&" : "?";
    location.replace(location.pathname + location.search + sep + "_cb=" + Date.now());
    return;
  }

  if (isTV && !isKiosk) {
    location.replace("/tv?_cb=" + Date.now());
  }
})();
