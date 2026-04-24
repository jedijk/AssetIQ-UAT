/**
 * Cross-platform label print helper.
 *
 * Desktop: creates a hidden iframe, loads the PDF, and calls print() —
 *          avoids pop-up blockers and doesn't leave an orphan tab open.
 * Mobile:  silently downloads the PDF (mobile browsers don't expose a
 *          reliable print() API for blob URLs). User prints via the
 *          share sheet / native PDF viewer.
 *
 * Usage:
 *   await printLabelBlob(blob, "my-label.pdf");
 */
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


function printViaHiddenIframe(blob, filename, onFallback) {
  try {
    const url = URL.createObjectURL(blob);
    // Remove any previous print iframe
    const prev = document.getElementById("__label-print-iframe__");
    if (prev) prev.remove();

    const iframe = document.createElement("iframe");
    iframe.id = "__label-print-iframe__";
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
      } catch (_e) {
        // Cross-origin or blocked — fall back to download
        if (onFallback) onFallback();
        else downloadBlob(blob, filename);
      }
    };
    iframe.onload = () => {
      // Small timeout gives PDF viewer a moment to render
      setTimeout(tryPrint, 400);
    };
    document.body.appendChild(iframe);

    // Hard timeout — some browsers never fire onload for PDF blobs
    setTimeout(tryPrint, 1500);
    // Revoke URL later
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (_err) {
    if (onFallback) onFallback();
    else downloadBlob(blob, filename);
  }
}


/**
 * Print a label PDF Blob in the most reliable way for the current device.
 *
 * @param {Blob} blob - the PDF blob
 * @param {string} filename - suggested filename for downloads
 * @returns {Promise<{ printed: boolean, downloaded: boolean, mobile: boolean }>}
 */
export async function printLabelBlob(blob, filename = "label.pdf") {
  const mobile = isMobileDevice();
  if (mobile) {
    // Mobile: just download — user taps to open in native PDF viewer, then prints
    downloadBlob(blob, filename);
    return { printed: false, downloaded: true, mobile: true };
  }
  // Desktop: hidden iframe trick, with download fallback
  return new Promise((resolve) => {
    printViaHiddenIframe(blob, filename, () => {
      downloadBlob(blob, filename);
      resolve({ printed: false, downloaded: true, mobile: false });
    });
    // Resolve "printed: true" optimistically after a short delay — we can't
    // actually detect a successful print, only a failed attempt.
    setTimeout(() => resolve({ printed: true, downloaded: false, mobile: false }), 1800);
  });
}
