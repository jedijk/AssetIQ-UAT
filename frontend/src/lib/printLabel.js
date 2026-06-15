/**
 * Cross-platform label print helper — v2, mobile-safe.
 *
 * Mobile browser quirks (iOS Safari, Android Chrome):
 *  - `window.open` MUST be called synchronously inside a user-gesture event.
 *    Calling it after an `await` in a mutation's onSuccess is blocked.
 *  - HTML injection + `window.print()` after an async fetch is unreliable
 *    (scripts in innerHTML do not run; print() loses the user-gesture).
 *  - PDF blob URLs opened in a pre-created window work reliably; users can
 *    print/share from the native PDF viewer.
 *
 * Strategy:
 *  - `openPrintWindow()` synchronously opens `window.open('', '_blank', ...)`
 *    from the caller's click handler. Callers pass the returned handle into
 *    `printLabel({ win })` after the async fetch completes.
 *  - Mobile always uses the PDF-in-window path (same as iOS).
 *  - Desktop uses a hidden iframe, or the pre-opened window when provided.
 *  - If no window handle is provided on mobile, fall back to PDF download.
 */
import { labelsAPI } from "./api";

export const isMobileDevice = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // IMPORTANT: do not treat a narrow desktop window as "mobile".
  // This helper decides which print strategy to use; desktop Chrome with a
  // small viewport should still use the PDF iframe print path.
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
};

/**
 * Call this synchronously from a user-gesture click handler BEFORE any await,
 * then pass the returned handle to `printLabel({ win })` once the data is ready.
 *
 * Returns null if the browser blocks the pop-up (rare — mobile browsers allow
 * this when inside a direct tap handler).
 */
export function openPrintWindow() {
  try {
    // Do not pass noopener — modern browsers block opener.location after async
    // unless we navigate via the child's own document or postMessage.
    const w = window.open("about:blank", "_blank");
    if (!w) return null;
    // Show a "Preparing…" placeholder and listen for PDF URL via postMessage.
    try {
      const doc = w.document;
      doc.open();
      doc.write(
        "<!DOCTYPE html><html><head>" +
          '<meta charset="utf-8">' +
          '<meta name="viewport" content="width=device-width,initial-scale=1">' +
          "<title>Preparing label…</title>" +
          "<style>body{font-family:-apple-system,system-ui,Helvetica,Arial,sans-serif;" +
          "display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#64748b}</style>" +
          "</head><body>Preparing label…" +
          "<script>" +
          'window.addEventListener("message",function(e){' +
          'if(!e.data||e.data.type!=="assetiq-label-pdf"||!e.data.url)return;' +
          'try{window.location.replace(e.data.url);}catch(_e){try{window.location.href=e.data.url;}catch(_e2){}}' +
          "});" +
          "</script></body></html>"
      );
      doc.close();
    } catch (_e) { /* ignore */ }
    return w;
  } catch (_err) {
    return null;
  }
}


/**
 * Navigate a pre-opened print window to a blob URL after an async fetch.
 * Direct opener.location assignment fails on many browsers (implicit noopener);
 * redirecting from the child's document or via postMessage is reliable.
 */
function navigatePrintWindowToUrl(win, url) {
  if (!win || win.closed) return false;
  try {
    const doc = win.document;
    doc.open();
    doc.write(
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Label</title></head>" +
        "<body><script>window.location.replace(" +
        JSON.stringify(url) +
        ");</script></body></html>"
    );
    doc.close();
    return true;
  } catch (_e) {
    /* ignore */
  }
  try {
    win.postMessage({ type: "assetiq-label-pdf", url }, window.location.origin);
    return true;
  } catch (_e2) {
    /* ignore */
  }
  try {
    win.location.href = url;
    return true;
  } catch (_e3) {
    /* ignore */
  }
  return false;
}


function schedulePrint(win) {
  if (!win || win.closed) return;
  const tryPrint = () => {
    try {
      win.focus();
      win.print();
    } catch (_e) {
      /* ignore — mobile PDF viewers often block programmatic print */
    }
  };
  try {
    win.addEventListener("load", tryPrint, { once: true });
  } catch (_e) {
    /* ignore */
  }
  setTimeout(tryPrint, 600);
}


async function sharePdfBlob(blob, filename) {
  if (typeof navigator.share !== "function" || typeof File === "undefined") {
    return false;
  }
  const file = new File([blob], filename, { type: "application/pdf" });
  if (navigator.canShare && !navigator.canShare({ files: [file] })) {
    return false;
  }
  try {
    await navigator.share({ files: [file], title: filename });
    return true;
  } catch (_e) {
    return false;
  }
}


function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}


function removeOldPrintIframes() {
  document.querySelectorAll("iframe[data-print-iframe]").forEach((n) => n.remove());
}


function printPdfViaIframe(blob) {
  return new Promise((resolve) => {
    try {
      removeOldPrintIframes();
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.setAttribute("data-print-iframe", "1");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.src = url;

      let printed = false;
      const tryPrint = () => {
        if (printed) return;
        printed = true;
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          resolve(true);
        } catch (_e) {
          resolve(false);
        }
      };
      iframe.onload = () => setTimeout(tryPrint, 400);
      setTimeout(tryPrint, 1800);
      setTimeout(() => {
        URL.revokeObjectURL(url);
        iframe.remove();
      }, 60000);
      document.body.appendChild(iframe);
    } catch (_err) {
      resolve(false);
    }
  });
}


async function openPdfInNewTab(url) {
  try {
    const w = window.open(url, "_blank");
    if (w) return w;
  } catch (_e) {
    /* ignore */
  }
  return null;
}


async function printMobileViaPdf(payload, preOpened, filename) {
  let url = null;
  try {
    const blob = await labelsAPI.printBlob(payload);
    url = URL.createObjectURL(blob);

    if (preOpened && !preOpened.closed && navigatePrintWindowToUrl(preOpened, url)) {
      schedulePrint(preOpened);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return { method: "window", ok: true, mobile: true };
    }

    const tab = await openPdfInNewTab(url);
    if (tab) {
      schedulePrint(tab);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return { method: "window", ok: true, mobile: true };
    }

    if (await sharePdfBlob(blob, filename)) {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return { method: "share", ok: true, mobile: true };
    }

    downloadBlob(blob, filename);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    if (preOpened && !preOpened.closed) {
      try {
        preOpened.close();
      } catch (_c) {
        /* ignore */
      }
    }
    return { method: "download", ok: true, mobile: true };
  } catch (_err) {
    if (url) URL.revokeObjectURL(url);
    if (preOpened && !preOpened.closed) {
      try {
        preOpened.close();
      } catch (_c) {
        /* ignore */
      }
    }
    return { method: "download", ok: false, mobile: true };
  }
}


/**
 * Trigger a native print for a label.
 *
 * @param {object} payload  - { template_id, submission_id, asset_ids, copies }
 * @param {object} opts     - { win?: Window, filename?: string }
 *   - win: a Window handle returned from openPrintWindow() (REQUIRED on mobile
 *     for reliable printing; optional on desktop)
 *   - filename: suggested file name if we fall back to download
 * @returns {Promise<{ method: "window"|"iframe"|"download"|"share", ok: boolean, mobile: boolean }>}
 */
export async function printLabel(payload, opts = {}) {
  const mobile = isMobileDevice();
  const filename = opts.filename || `label-${Date.now()}.pdf`;
  const preOpened = opts.win || null;

  if (mobile) {
    return printMobileViaPdf(payload, preOpened, filename);
  }

  // Desktop: PDF in hidden iframe → native print dialog
  try {
    const blob = await labelsAPI.printBlob(payload);
    // If a window was pre-opened, navigate it to the PDF blob URL.
    // This keeps the action user-gesture associated (popup opened on click),
    // and avoids Chrome blocking iframe.print() after an async fetch.
    if (preOpened && !preOpened.closed) {
      const url = URL.createObjectURL(blob);
      if (navigatePrintWindowToUrl(preOpened, url)) {
        schedulePrint(preOpened);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return { method: "window", ok: true, mobile: false };
      }
      URL.revokeObjectURL(url);
    }
    const ok = await printPdfViaIframe(blob);
    if (!ok) {
      downloadBlob(blob, filename);
      return { method: "download", ok: false, mobile: false };
    }
    return { method: "iframe", ok: true, mobile: false };
  } catch (_err) {
    return { method: "download", ok: false, mobile: false };
  }
}


/**
 * Direct blob print (kept for LabelsPage bulk-print that pre-builds PDF).
 */
export async function printLabelBlob(blob, filename = "label.pdf") {
  const mobile = isMobileDevice();
  if (mobile) {
    downloadBlob(blob, filename);
    return { printed: false, downloaded: true, mobile: true };
  }
  return new Promise((resolve) => {
    printPdfViaIframe(blob).then((ok) => {
      if (!ok) {
        downloadBlob(blob, filename);
        resolve({ printed: false, downloaded: true, mobile: false });
      } else {
        resolve({ printed: true, downloaded: false, mobile: false });
      }
    });
  });
}
