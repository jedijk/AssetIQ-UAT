/**
 * ES5-safe Samsung / smart-TV redirect to the display kiosk (no inline script — CSP safe).
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
  if (isTV && !isKiosk) {
    location.replace("/tv");
  }
})();
