export const DEFAULT_BOARD_HEADER = {
  assetiq_logo_height: 56,
  tyromer_logo_height: 32,
  title_font_size: 16,
  transparent_logo_background: true,
  display_title: "",
};

export function normalizeBoardHeader(header) {
  const merged = {
    ...DEFAULT_BOARD_HEADER,
    ...(header && typeof header === "object" ? header : {}),
  };
  merged.display_title = typeof merged.display_title === "string" ? merged.display_title : "";
  return merged;
}

export function resolveBoardHeaderTitle(boardName, header) {
  const config = normalizeBoardHeader(header);
  const custom = (config.display_title || "").trim();
  return custom || boardName || "Visual Management Board";
}

export function headerMinHeightPx(header) {
  const h = normalizeBoardHeader(header);
  return Math.max(h.assetiq_logo_height, h.tyromer_logo_height) + 20;
}
