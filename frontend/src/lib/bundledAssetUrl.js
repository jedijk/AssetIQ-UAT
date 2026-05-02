/**
 * CRA/webpack often emits imported file URLs like `static/media/foo.hash.png` without a leading slash.
 * Used as <img src>, that is resolved relative to the current path, so nested routes break:
 *   /threats/abc + static/media/x → /threats/static/media/x (404)
 * Always prefix root-relative paths so assets load on every route.
 */
export function bundledAssetUrl(url) {
  if (url == null || typeof url !== "string") return url;
  const u = url.trim();
  if (!u) return u;
  if (/^(https?:|data:|blob:)/i.test(u)) return u;
  if (u.startsWith("/")) return u;
  return `/${u}`;
}
