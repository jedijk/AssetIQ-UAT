import { mergeNearbyPairing } from "./nearbyDisplayPairingUtils";

describe("mergeNearbyPairing", () => {
  it("returns candidate when no previous pairing", () => {
    const candidate = { pairing_id: "p1", status: "pending" };
    expect(mergeNearbyPairing(null, candidate)).toEqual(candidate);
  });

  it("replaces previous when pairing id changes", () => {
    const previous = { pairing_id: "p1", status: "pending" };
    const candidate = { pairing_id: "p2", status: "pending" };
    expect(mergeNearbyPairing(previous, candidate)).toEqual(candidate);
  });

  it("merges fields for same pairing id", () => {
    const previous = { pairing_id: "p1", status: "pending", code: "1234" };
    const candidate = { pairing_id: "p1", status: "confirmed" };
    expect(mergeNearbyPairing(previous, candidate)).toEqual({
      pairing_id: "p1",
      status: "confirmed",
      code: "1234",
    });
  });

  it("ignores candidate without pairing_id", () => {
    const previous = { pairing_id: "p1", status: "pending" };
    expect(mergeNearbyPairing(previous, { status: "confirmed" })).toBe(previous);
  });
});
