/**
 * Normalized equipment criticality score (0–100), same formula as the observation page.
 * Criticality Score = round((Safety×25 + Production×20 + Environmental×15 + Reputation×10) / 3.5)
 */

export function getCriticalityDimensions(criticality) {
  if (!criticality || typeof criticality !== "object") return null;
  return {
    safety:
      criticality.safety_impact ??
      criticality.safety ??
      criticality.Safety ??
      0,
    production:
      criticality.production_impact ??
      criticality.production ??
      criticality.Production ??
      0,
    environmental:
      criticality.environmental_impact ??
      criticality.environmental ??
      criticality.Environmental ??
      0,
    reputation:
      criticality.reputation_impact ??
      criticality.reputation ??
      criticality.Reputation ??
      0,
  };
}

export function computeCriticalityScore(criticality) {
  const dims = getCriticalityDimensions(criticality);
  if (!dims) return null;

  const { safety, production, environmental, reputation } = dims;
  if (!safety && !production && !environmental && !reputation) {
    return null;
  }

  const raw =
    safety * 25 + production * 20 + environmental * 15 + reputation * 10;
  return Math.min(100, Math.round(raw / 3.5));
}
