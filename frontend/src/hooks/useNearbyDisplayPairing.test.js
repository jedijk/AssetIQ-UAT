import { mergeNearbyPairing } from "../lib/nearbyDisplayPairingUtils";

describe("mergeNearbyPairing", () => {
  const pairingA = {
    pairing_id: "p-1",
    pair_code: "ABCD",
    device_label: "Shop TV",
    expires_in: 120,
  };

  it("returns candidate when no previous pairing exists", () => {
    expect(mergeNearbyPairing(null, pairingA)).toEqual(pairingA);
  });

  it("replaces previous when pairing_id changes", () => {
    const next = { ...pairingA, pairing_id: "p-2", pair_code: "WXYZ" };
    expect(mergeNearbyPairing(pairingA, next)).toEqual(next);
  });

  it("merges refreshed fields for the same pairing_id", () => {
    const refreshed = { ...pairingA, expires_in: 90, device_label: "Shop TV" };
    expect(mergeNearbyPairing(pairingA, refreshed)).toEqual({
      ...pairingA,
      expires_in: 90,
    });
  });
});
