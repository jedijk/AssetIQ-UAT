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
    const w = window.open("", "_blank", "noopener=no");
    if (!w) return null;
    // Show a "Preparing…" placeholder while we fetch the HTML
    try {
      w.document.open();
      w.document.close();
      // Avoid document.write: render a minimal placeholder via DOM APIs.
      const doc = w.document;
      doc.title = "Preparing label…";
      const metaCharset = doc.createElement("meta");
      metaCharset.setAttribute("charset", "utf-8");
      const metaViewport = doc.createElement("meta");
      metaViewport.setAttribute("name", "viewport");
      metaViewport.setAttribute("content", "width=device-width,initial-scale=1");
      doc.head.appendChild(metaCharset);
      doc.head.appendChild(metaViewport);

      const style = doc.createElement("style");
      style.textContent =
        "body{font-family:-apple-system,system-ui,Helvetica,Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#64748b}";
      doc.head.appendChild(style);

      const body = doc.body || doc.createElement("body");
      body.textContent = "Preparing label…";
      if (!doc.body) doc.documentElement.appendChild(body);
    } catch (_e) { /* ignore */ }
    return w;
  } catch (_err) {
    return null;
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


async function printMobileViaPdf(payload, preOpened, filename) {
  try {
    const blob = await labelsAPI.printBlob(payload);
    const url = URL.createObjectURL(blob);
    if (preOpened && !preOpened.closed) {
      try {
        // Navigate the already-opened window to the PDF blob URL.
        // User can Print/Share from the native PDF viewer.
        preOpened.location.href = url;
        // Best-effort: some browsers will allow print after load.
        preOpened.addEventListener(
          "load",
          () => {
            try {
              preOpened.focus();
              preOpened.print();
            } catch (_e) {
              /* ignore */
            }
          },
          { once: true }
        );
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return { method: "window", ok: true, mobile: true };
      } catch (_navErr) {
        /* fall through to download */
      }
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
 * @returns {Promise<{ method: "window"|"iframe"|"download", ok: boolean, mobile: boolean }>}
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
      try {
        const url = URL.createObjectURL(blob);
        preOpened.location.href = url;
        preOpened.addEventListener(
          "load",
          () => {
            try {
              preOpened.focus();
              preOpened.print();
            } catch (_e) {}
          },
          { once: true }
        );
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return { method: "window", ok: true, mobile: false };
      } catch (_e) { /* fall through to iframe */ }
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
