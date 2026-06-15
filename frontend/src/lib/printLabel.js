/**
 * Cross-platform label print helper — v3, mobile-safe.
 *
 * Mobile (iOS Safari, Android Chrome):
 *  - `window.open` MUST be called synchronously inside a user-gesture event.
 *  - PDF blob URLs created in the parent page often cannot be opened in a child
 *    tab on Android (tab stays on "Preparing label…").
 *  - Use server-rendered HTML (/labels/render-html) and inject it into the
 *    print window; the page auto-calls window.print() on load.
 *
 * Desktop:
 *  - PDF in a pre-opened window or hidden iframe → native print dialog.
 */
import { labelsAPI } from "./api";

export const isMobileDevice = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
};

const PRINT_WINDOW_BOOTSTRAP =
  "<!DOCTYPE html><html><head>" +
  '<meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  "<title>Preparing label…</title>" +
  "<style>body{font-family:-apple-system,system-ui,Helvetica,Arial,sans-serif;" +
  "display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#64748b}</style>" +
  "</head><body>Preparing label…" +
  "<script>" +
  'window.addEventListener("message",function(e){' +
  "if(!e.data)return;" +
  'if(e.data.type==="assetiq-label-html"&&e.data.html){' +
  "try{document.open();document.write(e.data.html);document.close();" +
  'try{e.source&&e.source.postMessage({type:"assetiq-label-loaded"},e.origin);}catch(_x){}}catch(_e){}' +
  "return;}" +
  'if(e.data.type==="assetiq-label-pdf"&&e.data.url){' +
  'try{window.location.replace(e.data.url);}catch(_e){try{window.location.href=e.data.url;}catch(_e2){}}' +
  "}});" +
  "</script></body></html>";

/**
 * Call synchronously from a click handler BEFORE any await, then pass the handle
 * to `printLabel({ win })` once the label HTML/PDF is ready.
 */
export function openPrintWindow() {
  try {
    const w = window.open("about:blank", "_blank");
    if (!w) return null;
    try {
      const doc = w.document;
      doc.open();
      doc.write(PRINT_WINDOW_BOOTSTRAP);
      doc.close();
    } catch (_e) {
      /* ignore */
    }
    return w;
  } catch (_err) {
    return null;
  }
}


function deliverHtmlToPrintWindow(win, html) {
  if (!win || win.closed) return Promise.resolve(false);

  try {
    const doc = win.document;
    doc.open();
    doc.write(html);
    doc.close();
    return Promise.resolve(true);
  } catch (_e) {
    /* opener may lose access after async — fall through to postMessage */
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener("message", onAck);
      resolve(ok);
    };
    const onAck = (ev) => {
      if (ev.data?.type === "assetiq-label-loaded") finish(true);
    };
    const timer = setTimeout(() => finish(false), 5000);
    window.addEventListener("message", onAck);
    try {
      win.postMessage({ type: "assetiq-label-html", html }, window.location.origin);
    } catch (_err) {
      finish(false);
    }
  });
}


function showMobilePrintOverlay(html) {
  try {
    document.getElementById("assetiq-mobile-print-host")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "assetiq-mobile-print-host";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483646;background:#f8fafc;display:flex;flex-direction:column;";

    const bar = document.createElement("div");
    bar.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #e2e8f0;background:#fff;";

    const title = document.createElement("span");
    title.textContent = "Label preview";
    title.style.cssText = "font:600 14px system-ui,sans-serif;color:#334155;";

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.style.cssText =
      "font:600 13px system-ui,sans-serif;padding:6px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;";

    const printBtn = document.createElement("button");
    printBtn.type = "button";
    printBtn.textContent = "Print";
    printBtn.style.cssText =
      "font:600 13px system-ui,sans-serif;padding:6px 12px;border:none;border-radius:8px;background:#4f46e5;color:#fff;margin-left:8px;";

    const actions = document.createElement("div");
    actions.appendChild(close);
    actions.appendChild(printBtn);

    bar.appendChild(title);
    bar.appendChild(actions);

    const frame = document.createElement("iframe");
    frame.setAttribute("title", "Label preview");
    frame.style.cssText = "flex:1;width:100%;border:0;background:#fff;";
    frame.srcdoc = html;

    close.onclick = () => overlay.remove();
    printBtn.onclick = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch (_e) {
        /* ignore */
      }
    };

    overlay.appendChild(bar);
    overlay.appendChild(frame);
    document.body.appendChild(overlay);
    return true;
  } catch (_e) {
    return false;
  }
}


function navigatePrintWindowToUrl(win, url) {
  if (!win || win.closed) return false;
  try {
    win.location.href = url;
    return true;
  } catch (_e) {
    /* ignore */
  }
  try {
    const doc = win.document;
    doc.open();
    doc.write(
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Label</title></head>" +
        "<body style=\"margin:0\">" +
        "<embed type=\"application/pdf\" src=\"" +
        url.replace(/"/g, "&quot;") +
        "\" width=\"100%\" height=\"100%\" style=\"position:fixed;inset:0\" />" +
        "</body></html>"
    );
    doc.close();
    return true;
  } catch (_e2) {
    /* ignore */
  }
  return false;
}


/** Print after the target window has had time to load PDF content. */
function schedulePrintWhenReady(win, delayMs = 2000) {
  if (!win || win.closed) return;
  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch (_e) {
      /* ignore */
    }
  }, delayMs);
}


function openPdfInPrintWindow(win, blob) {
  if (!win || win.closed) return false;
  const url = URL.createObjectURL(blob);
  const cleanup = () => setTimeout(() => URL.revokeObjectURL(url), 60000);
  if (navigatePrintWindowToUrl(win, url)) {
    schedulePrintWhenReady(win);
    cleanup();
    return true;
  }
  URL.revokeObjectURL(url);
  return false;
}


async function deliverHtmlAndPrint(win, html) {
  if (!win || win.closed) return false;
  const delivered = await deliverHtmlToPrintWindow(win, html);
  if (!delivered) return false;
  // Do not rely on inline load handlers — they may not run after opener document.write.
  await new Promise((resolve) => setTimeout(resolve, 900));
  try {
    win.focus();
    win.print();
  } catch (_e) {
    /* ignore */
  }
  return true;
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


async function printMobileViaPdfFallback(payload, preOpened, filename) {
  try {
    const blob = await labelsAPI.printBlob(payload);

    if (preOpened && !preOpened.closed && openPdfInPrintWindow(preOpened, blob)) {
      return { method: "window", ok: true, mobile: true };
    }

    if (await sharePdfBlob(blob, filename)) {
      return { method: "share", ok: true, mobile: true };
    }

    downloadBlob(blob, filename);
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


async function printMobileLabel(payload, preOpened, filename) {
  try {
    const html = await labelsAPI.renderHtml({
      template_id: payload.template_id,
      asset_ids: payload.asset_ids || [],
      submission_id: payload.submission_id,
      copies: payload.copies || 1,
      auto_print: false,
    });

    if (preOpened && !preOpened.closed) {
      const delivered = await deliverHtmlAndPrint(preOpened, html);
      if (delivered) {
        return { method: "window", ok: true, mobile: true };
      }
      try {
        preOpened.close();
      } catch (_e) {
        /* ignore */
      }
    }

    try {
      const w = window.open("about:blank", "_blank");
      if (w) {
        try {
          const doc = w.document;
          doc.open();
          doc.write(PRINT_WINDOW_BOOTSTRAP);
          doc.close();
        } catch (_e) {
          /* ignore */
        }
        const delivered = await deliverHtmlAndPrint(w, html);
        if (delivered) {
          return { method: "window", ok: true, mobile: true };
        }
        try {
          w.close();
        } catch (_e) {
          /* ignore */
        }
      }
    } catch (_e) {
      /* ignore */
    }

    if (showMobilePrintOverlay(html)) {
      return { method: "overlay", ok: true, mobile: true };
    }

    return printMobileViaPdfFallback(payload, preOpened, filename);
  } catch (_err) {
    return printMobileViaPdfFallback(payload, preOpened, filename);
  }
}


/**
 * Trigger a native print for a label.
 *
 * @param {object} payload  - { template_id, submission_id, asset_ids, copies }
 * @param {object} opts     - { win?: Window, filename?: string }
 * @returns {Promise<{ method: "window"|"iframe"|"download"|"share"|"overlay", ok: boolean, mobile: boolean }>}
 */
export async function printLabel(payload, opts = {}) {
  const mobile = isMobileDevice();
  const filename = opts.filename || `label-${Date.now()}.pdf`;
  const preOpened = opts.win || null;

  if (mobile) {
    return printMobileLabel(payload, preOpened, filename);
  }

  try {
    const blob = await labelsAPI.printBlob(payload);
    if (preOpened && !preOpened.closed && openPdfInPrintWindow(preOpened, blob)) {
      return { method: "window", ok: true, mobile: false };
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
