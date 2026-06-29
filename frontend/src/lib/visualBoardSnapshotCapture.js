import html2canvas from "html2canvas";
import { snapshotCapturePath } from "./visualManagementPaths";
import { visualBoardAPI } from "./apis/visualBoardAPI";

const CAPTURE_WIDTH = 1920;
const CAPTURE_HEIGHT = 1080;
const READY_TIMEOUT_MS = 45_000;
const DOM_POLL_MS = 200;

function waitForSnapshotReady(iframe, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("TV snapshot capture timed out waiting for board render")),
      timeoutMs,
    );

    const onMessage = (evt) => {
      if (evt.data?.type === "vmb-snapshot-ready" && evt.source === iframe.contentWindow) {
        window.removeEventListener("message", onMessage);
        clearTimeout(timer);
        resolve();
      }
    };

    window.addEventListener("message", onMessage);
  });
}

async function waitForSnapshotTarget(doc, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const target =
      doc?.querySelector("[data-vmb-snapshot-root]") ||
      doc?.querySelector(".vmb-board-canvas");
    if (target) return target;
    await new Promise((resolve) => setTimeout(resolve, DOM_POLL_MS));
  }
  return null;
}

function describeIframeDocument(doc) {
  if (!doc) return "iframe document unavailable (check CSP frame-ancestors and login state)";
  const title = doc.title || "";
  const path = doc.location?.pathname || "";
  if (path.includes("/login")) return "iframe redirected to login — session not available in capture frame";
  if (title) return `iframe loaded "${title}" at ${path || "unknown path"}`;
  return `iframe at ${path || "unknown path"} has no snapshot root`;
}

/**
 * Render TV-exact preview off-screen, capture as JPEG, upload for paired displays.
 */
export async function captureAndUploadTvSnapshot(boardId) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.title = "TV snapshot capture";
  iframe.style.cssText = [
    "position:fixed",
    "left:-12000px",
    "top:0",
    `width:${CAPTURE_WIDTH}px`,
    `height:${CAPTURE_HEIGHT}px`,
    "border:0",
    "visibility:hidden",
  ].join(";");
  iframe.src = snapshotCapturePath(boardId);
  document.body.appendChild(iframe);

  try {
    await waitForSnapshotReady(iframe, READY_TIMEOUT_MS);
    await new Promise((resolve) => setTimeout(resolve, 300));

    let doc;
    try {
      doc = iframe.contentDocument;
    } catch (err) {
      throw new Error(`Cannot read snapshot iframe: ${err?.message || err}`);
    }

    const target = await waitForSnapshotTarget(doc, 10_000);
    if (!target) {
      throw new Error(`Board canvas not found for snapshot — ${describeIframeDocument(doc)}`);
    }

    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#000000",
      width: CAPTURE_WIDTH,
      height: CAPTURE_HEIGHT,
      windowWidth: CAPTURE_WIDTH,
      windowHeight: CAPTURE_HEIGHT,
      logging: false,
    });

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("Empty snapshot image"))),
        "image/jpeg",
        0.93,
      );
    });

    await visualBoardAPI.uploadDisplaySnapshot(boardId, blob);
    return blob;
  } finally {
    document.body.removeChild(iframe);
  }
}
