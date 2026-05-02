/**
 * CRA/webpack often emits imported file URLs like `static/media/foo.hash.png` without a leading slash.
 * Used as <img src>, that resolves relative to the current route and breaks on nested paths.
 */
export function bundledAssetUrl(url) {
  if (url == null || typeof url !== "string") return url;
  const u = url.trim();
  if (!u) return u;
  if (/^(https?:|data:|blob:)/i.test(u)) return u;
  if (u.startsWith("/")) return u;
  return `/${u}`;
}

/**
 * URLs for files in `/public` (copied as-is into build output). Uses CRA `PUBLIC_URL` when the app
 * is hosted under a subpath. Prefer this over importing PNGs from `src/` so CI clones always resolve.
 */
export function publicAssetUrl(pathInPublic) {
  const path = pathInPublic.startsWith("/") ? pathInPublic : `/${pathInPublic}`;
  const base = process.env.PUBLIC_URL || "";
  if (!base) return path;
  return `${String(base).replace(/\/$/, "")}${path}`;
}
