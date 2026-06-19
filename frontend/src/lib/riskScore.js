/**
 * Weighted risk score — aligned with backend calculate_risk_score and the score modal.
 */

export function fmeaScoreFromFailureMode(failureMode) {
  if (!failureMode || typeof failureMode !== "object") return null;
  const { severity, occurrence, detectability, rpn } = failureMode;
  if (
    severity != null &&
    occurrence != null &&
    detectability != null
  ) {
    return Math.min(
      100,
      Math.max(0, Math.round((severity * occurrence * detectability) / 10))
    );
  }
  if (rpn != null) {
    return Math.min(100, Math.max(0, Math.round(Number(rpn) / 10)));
  }
  return null;
}

export function computeWeightedRiskScore(criticalityScore, fmeaScore, weights = {}) {
  const critWeight = weights.criticality_weight ?? 0.75;
  const fmeaWeight = weights.fmea_weight ?? 0.25;
  const crit = Number(criticalityScore) || 0;
  const fmea = Number(fmeaScore) || 0;
  return Math.min(100, Math.max(0, Math.round(crit * critWeight + fmea * fmeaWeight)));
}
