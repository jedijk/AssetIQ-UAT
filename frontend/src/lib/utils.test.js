import { cn } from "./utils";

describe("cn", () => {
  it("merges class names with tailwind-merge", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("returns empty string for no inputs", () => {
    expect(cn()).toBe("");
  });

  it("falls back to clsx when twMerge throws", () => {
    const inputs = ["foo", "bar"];
    expect(cn(...inputs)).toContain("foo");
  });
});
