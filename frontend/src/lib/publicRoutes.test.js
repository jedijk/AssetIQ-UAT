import { isPublicKioskPath } from "./publicRoutes";

describe("isPublicKioskPath", () => {
  it("recognizes TV and display kiosk routes", () => {
    expect(isPublicKioskPath("/tv")).toBe(true);
    expect(isPublicKioskPath("/tv/board-1")).toBe(true);
    expect(isPublicKioskPath("/display/pair")).toBe(true);
  });

  it("recognizes VMB token routes", () => {
    expect(isPublicKioskPath("/vmb/abc123")).toBe(true);
  });

  it("rejects authenticated app routes", () => {
    expect(isPublicKioskPath("/dashboard")).toBe(false);
    expect(isPublicKioskPath("/threats")).toBe(false);
    expect(isPublicKioskPath("")).toBe(false);
  });
});
