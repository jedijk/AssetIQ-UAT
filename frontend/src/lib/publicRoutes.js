/** Public kiosk routes that must work without a user session. */
export function isPublicKioskPath(pathname) {
  if (!pathname) return false;
  if (pathname === "/tv" || pathname.startsWith("/tv/")) return true;
  if (pathname === "/display" || pathname.startsWith("/display/")) return true;
  if (pathname.startsWith("/vmb/")) return true;
  return false;
}
