/** Merge polled nearby pairing data without resetting UI state on refresh. */
export function mergeNearbyPairing(previous, candidate) {
  if (!candidate?.pairing_id) return previous;
  if (!previous || previous.pairing_id !== candidate.pairing_id) {
    return candidate;
  }
  return { ...previous, ...candidate };
}
