import html2canvas from "html2canvas";
import { visualBoardAPI } from "./apis/visualBoardAPI";

const CAPTURE_WIDTH = 1920;
const CAPTURE_HEIGHT = 1080;

function waitForSnapshotReady(iframe, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("TV snapshot capture timed out")), timeoutMs);

    const finish = () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      setTimeout(resolve, 400);
    };

    const onMessage = (evt) => {
      if (evt.data?.type === "vmb-snapshot-ready" && evt.source === iframe.contentWindow) {
        finish();
      }
    };

    window.addEventListener("message", onMessage);
    iframe.onload = () => {
      setTimeout(() => {
        if (timer) finish();
      }, 10_000);
    };
  });
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
  iframe.src = `/visual-management/boards/${encodeURIComponent(boardId)}/preview?tv-exact&snapshot=1`;
  document.body.appendChild(iframe);

  try {
    await waitForSnapshotReady(iframe, 25_000);
    const doc = iframe.contentDocument;
    const target =
      doc?.querySelector("[data-vmb-snapshot-root]") ||
      doc?.querySelector(".vmb-board-canvas")?.parentElement;
    if (!target) {
      throw new Error("Board canvas not found for snapshot");
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
