/**
 * Cross-platform label print helper — v4.
 *
 * Strategy:
 *  1. Fetch server-rendered HTML (/labels/render-html) — works for all devices.
 *  2. Show an in-app full-screen preview overlay (iframe srcdoc) — most reliable.
 *  3. Fall back to a popup window or PDF download only when HTML is unavailable.
 *
 * Do NOT pre-open blank tabs before the fetch; they often stay stuck on "Preparing label…".
 */
import { labelsAPI } from "./api";

export const isMobileDevice = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
};

function closeWindow(win) {
  if (win && !win.closed) {
    try {
      win.close();
    } catch (_e) {
      /* ignore */
    }
  }
}

function isLabelHtml(html) {
  return typeof html === "string" && html.length > 80 && /<html/i.test(html);
}

function showPrintOverlay(html) {
  try {
    document.getElementById("assetiq-print-host")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "assetiq-print-host";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483646;background:#f8fafc;display:flex;flex-direction:column;";

    const bar = document.createElement("div");
    bar.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #e2e8f0;background:#fff;flex-shrink:0;";

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
    frame.style.cssText = "flex:1;width:100%;border:0;background:#fff;min-height:0;";
    frame.srcdoc = html;

    const triggerPrint = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch (_e) {
        /* ignore */
      }
    };

    close.onclick = () => overlay.remove();
    printBtn.onclick = triggerPrint;

    overlay.appendChild(bar);
    overlay.appendChild(frame);
    document.body.appendChild(overlay);

    // On desktop, open the print dialog once the iframe has rendered.
    if (!isMobileDevice()) {
      frame.addEventListener("load", () => setTimeout(triggerPrint, 400), { once: true });
      setTimeout(triggerPrint, 1200);
    }

    return true;
  } catch (_e) {
    return false;
  }
}

async function deliverHtmlToWindow(win, html) {
  if (!win || win.closed) return false;
  try {
    const doc = win.document;
    doc.open();
    doc.write(html);
    doc.close();
    await new Promise((resolve) => setTimeout(resolve, 800));
    try {
      win.focus();
      win.print();
    } catch (_e) {
      /* ignore */
    }
    return true;
  } catch (_e) {
    return false;
  }
}

async function fetchLabelHtml(payload) {
  const html = await labelsAPI.renderHtml({
    template_id: payload.template_id,
    asset_ids: payload.asset_ids || [],
    submission_id: payload.submission_id,
    copies: payload.copies || 1,
    auto_print: false,
  });
  if (!isLabelHtml(html)) {
    throw new Error("Label HTML unavailable");
  }
  return html;
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

async function printViaPdfFallback(payload, filename, preOpened) {
  const mobile = isMobileDevice();
  try {
    const blob = await labelsAPI.printBlob(payload);
    const url = URL.createObjectURL(blob);
    const pdfHtml =
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\">" +
      "<style>html,body{margin:0;height:100%}embed{position:fixed;inset:0;width:100%;height:100%}</style></head>" +
      `<body><embed type="application/pdf" src="${url.replace(/"/g, "&quot;")}" /></body></html>`;

    closeWindow(preOpened);

    if (showPrintOverlay(pdfHtml)) {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return { method: "overlay", ok: true, mobile };
    }

    if (preOpened && !preOpened.closed) {
      try {
        preOpened.location.href = url;
        setTimeout(() => {
          try {
            preOpened.focus();
            preOpened.print();
          } catch (_e) {
            /* ignore */
          }
        }, 2000);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return { method: "window", ok: true, mobile };
      } catch (_e) {
        closeWindow(preOpened);
      }
    }

    if (await sharePdfBlob(blob, filename)) {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return { method: "share", ok: true, mobile };
    }

    URL.revokeObjectURL(url);
    downloadBlob(blob, filename);
    return { method: "download", ok: true, mobile };
  } catch (_err) {
    closeWindow(preOpened);
    return { method: "download", ok: false, mobile };
  }
}

/**
 * Legacy no-op kept for callers that still invoke it synchronously on click.
 * Pre-opened blank tabs are no longer used — fetching happens before any window opens.
 */
export function openPrintWindow() {
  return null;
}

/**
 * Trigger a native print for a label.
 *
 * @param {object} payload  - { template_id, submission_id, asset_ids, copies }
 * @param {object} opts     - { win?: Window, filename?: string }
 * @returns {Promise<{ method: "window"|"iframe"|"download"|"share"|"overlay", ok: boolean, mobile: boolean }>}
 */
export async function printLabel(payload, opts = {}) {
  const filename = opts.filename || `label-${Date.now()}.pdf`;
  const preOpened = opts.win || null;
  const mobile = isMobileDevice();

  try {
    const html = await fetchLabelHtml(payload);

    if (showPrintOverlay(html)) {
      closeWindow(preOpened);
      return { method: "overlay", ok: true, mobile };
    }

    if (preOpened && !preOpened.closed && (await deliverHtmlToWindow(preOpened, html))) {
      return { method: "window", ok: true, mobile };
    }

    try {
      const w = window.open("about:blank", "_blank");
      if (w && (await deliverHtmlToWindow(w, html))) {
        closeWindow(preOpened);
        return { method: "window", ok: true, mobile };
      }
      closeWindow(w);
    } catch (_e) {
      /* ignore */
    }

    closeWindow(preOpened);
    return { method: "download", ok: false, mobile };
  } catch (_htmlErr) {
    return printViaPdfFallback(payload, filename, preOpened);
  }
}

/**
 * Direct blob print (kept for LabelsPage bulk-print that pre-builds PDF).
 */
export async function printLabelBlob(blob, filename = "label.pdf") {
  const mobile = isMobileDevice();
  const url = URL.createObjectURL(blob);
  const pdfHtml =
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\">" +
    "<style>html,body{margin:0;height:100%}embed{position:fixed;inset:0;width:100%;height:100%}</style></head>" +
    `<body><embed type="application/pdf" src="${url.replace(/"/g, "&quot;")}" /></body></html>`;

  if (showPrintOverlay(pdfHtml)) {
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { printed: true, downloaded: false, mobile };
  }

  URL.revokeObjectURL(url);
  downloadBlob(blob, filename);
  return { printed: false, downloaded: true, mobile };
}
