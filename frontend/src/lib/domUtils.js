import { isConnectedDomNode } from "./deviceUtils";

/**
 * Safely remove a transient DOM node (download links, hidden inputs, etc.).
 * Avoids Android Chrome throwing when removeChild races React unmount.
 */
export function safeRemoveNode(node) {
  if (!node) return;
  try {
    if (typeof node.remove === "function") {
      node.remove();
      return;
    }
  } catch (_e) {
    /* fall through */
  }
  try {
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
  } catch (_e) {
    /* ignore */
  }
}

/**
 * Portal only into a container that is still connected to the document.
 */
export function canUsePortalTarget(container) {
  return isConnectedDomNode(container);
}
