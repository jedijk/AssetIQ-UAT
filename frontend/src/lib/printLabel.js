/**
 * Cross-platform label print helper.
 *
 * Desktop: creates a hidden iframe, loads the PDF, and calls print() —
 *          avoids pop-up blockers and doesn't leave an orphan tab open.
 * Mobile:  loads a print-ready HTML page (with auto window.print()) into a
 *          hidden iframe. Mobile browsers DO trigger their native print
 *          sheet from HTML content — this works on both Android Chrome
 *          and iOS Safari (AirPrint).
 *
 * Usage:
 *   await printLabel({ template_id, submission_id, copies });
 */
import { labelsAPI } from "./api";

export const isMobileDevice = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
    || (typeof window !== "undefined" && window.innerWidth < 768);
};


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


function printHtmlViaIframe(html) {
  return new Promise((resolve) => {
    removeOldPrintIframes();
    const iframe = document.createElement("iframe");
    iframe.setAttribute("data-print-iframe", "1");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    // srcdoc yields a same-origin document so we can call contentWindow.print()
    iframe.srcdoc = html;

    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      resolve(ok);
      // Leave iframe attached briefly so the print sheet can read the doc
      setTimeout(() => iframe.remove(), 30000);
    };

    iframe.onload = () => {
      try {
        // HTML includes an auto-print <script>, but we also call print()
        // explicitly from the parent side in case the inline script is
        // blocked by some CSP.
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        finish(true);
      } catch (_err) {
        finish(false);
      }
    };
    // Hard timeout
    setTimeout(() => finish(true), 2500);
    document.body.appendChild(iframe);
  });
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


/**
 * Trigger a native print for a label in the most reliable way per device.
 *
 * @param {object} payload - { template_id, submission_id, asset_ids, copies }
 * @param {object} opts - { filename }
 * @returns {Promise<{ method: "html" | "pdf" | "download", ok: boolean, mobile: boolean }>}
 */
export async function printLabel(payload, opts = {}) {
  const mobile = isMobileDevice();
  const filename = opts.filename || `label-${Date.now()}.pdf`;

  if (mobile) {
    // Mobile: fetch HTML page, inject into iframe, let the auto-print script fire
    try {
      const html = await labelsAPI.renderHtml({ ...payload, auto_print: true });
      const ok = await printHtmlViaIframe(html);
      return { method: "html", ok, mobile: true };
    } catch (_err) {
      // Network or CORS problem — fall back to PDF download
      try {
        const blob = await labelsAPI.printBlob(payload);
        downloadBlob(blob, filename);
      } catch (_e2) { /* swallow */ }
      return { method: "download", ok: false, mobile: true };
    }
  }

  // Desktop: PDF in hidden iframe → native print dialog
  try {
    const blob = await labelsAPI.printBlob(payload);
    const ok = await printPdfViaIframe(blob);
    if (!ok) {
      downloadBlob(blob, filename);
      return { method: "download", ok: false, mobile: false };
    }
    return { method: "pdf", ok: true, mobile: false };
  } catch (_err) {
    return { method: "download", ok: false, mobile: false };
  }
}


/**
 * Direct blob print (kept for backward compat — LabelsPage uses it for the
 * bulk-print flow that pre-builds the PDF server-side).
 */
export async function printLabelBlob(blob, filename = "label.pdf") {
  const mobile = isMobileDevice();
  if (mobile) {
    // No payload to re-fetch HTML — just download
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
