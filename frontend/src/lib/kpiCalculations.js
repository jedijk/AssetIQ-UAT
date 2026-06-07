/** Helpers for KPI calculation tooltip text. */

export function pctFormula(numerator, denominator, value, unit = "%") {
  if (denominator == null || denominator === 0) {
    return "No items in scope.";
  }
  const pct = value != null ? value : Math.round((numerator / denominator) * 100);
  return `${numerator} ÷ ${denominator} × 100 = ${pct}${unit}`;
}

export function ratioFormula(numerator, denominator, label = "ratio") {
  if (denominator == null || denominator === 0) {
    return `No items in scope for ${label}.`;
  }
  return `${numerator} ÷ ${denominator} = ${(numerator / denominator).toFixed(1)} ${label}`;
}
