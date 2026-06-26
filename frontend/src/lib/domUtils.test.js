import { safeRemoveNode, canUsePortalTarget } from "./domUtils";

describe("safeRemoveNode", () => {
  it("calls node.remove when available", () => {
    const node = { remove: jest.fn(), parentNode: null };
    safeRemoveNode(node);
    expect(node.remove).toHaveBeenCalled();
  });

  it("falls back to parentNode.removeChild", () => {
    const parent = { removeChild: jest.fn() };
    const node = { parentNode: parent };
    safeRemoveNode(node);
    expect(parent.removeChild).toHaveBeenCalledWith(node);
  });

  it("ignores null node", () => {
    expect(() => safeRemoveNode(null)).not.toThrow();
  });
});

describe("canUsePortalTarget", () => {
  it("returns true for connected element", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    expect(canUsePortalTarget(el)).toBe(true);
    document.body.removeChild(el);
  });

  it("returns false for detached element", () => {
    const el = document.createElement("div");
    expect(canUsePortalTarget(el)).toBe(false);
  });

  it("returns false for null", () => {
    expect(canUsePortalTarget(null)).toBe(false);
  });
});
