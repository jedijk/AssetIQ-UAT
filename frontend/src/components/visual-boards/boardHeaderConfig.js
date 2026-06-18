export const DEFAULT_BOARD_HEADER = {
  assetiq_logo_height: 56,
  tyromer_logo_height: 32,
  title_font_size: 16,
  transparent_logo_background: true,
};

export function normalizeBoardHeader(header) {
  return {
    ...DEFAULT_BOARD_HEADER,
    ...(header && typeof header === "object" ? header : {}),
  };
}

export function headerMinHeightPx(header) {
  const h = normalizeBoardHeader(header);
  return Math.max(h.assetiq_logo_height, h.tyromer_logo_height) + 20;
}
