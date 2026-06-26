import { bundledAssetUrl, publicAssetUrl } from "./assetUrl";

const ORIGINAL_PUBLIC_URL = process.env.PUBLIC_URL;

describe("bundledAssetUrl", () => {
  it("prefixes relative static paths with slash", () => {
    expect(bundledAssetUrl("static/media/logo.hash.png")).toBe("/static/media/logo.hash.png");
  });

  it("leaves absolute and external URLs unchanged", () => {
    expect(bundledAssetUrl("/assets/icon.png")).toBe("/assets/icon.png");
    expect(bundledAssetUrl("https://cdn.example.com/x.png")).toBe("https://cdn.example.com/x.png");
    expect(bundledAssetUrl("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
  });

  it("returns falsy inputs unchanged", () => {
    expect(bundledAssetUrl(null)).toBeNull();
    expect(bundledAssetUrl("")).toBe("");
  });
});

describe("publicAssetUrl", () => {
  afterEach(() => {
    process.env.PUBLIC_URL = ORIGINAL_PUBLIC_URL;
  });

  it("normalizes path without leading slash", () => {
    expect(publicAssetUrl("favicon.ico")).toBe("/favicon.ico");
  });

  it("prepends PUBLIC_URL when set", () => {
    process.env.PUBLIC_URL = "/assetiq";
    expect(publicAssetUrl("/icons/app.png")).toBe("/assetiq/icons/app.png");
  });

  it("strips trailing slash from PUBLIC_URL", () => {
    process.env.PUBLIC_URL = "/assetiq/";
    expect(publicAssetUrl("/logo.png")).toBe("/assetiq/logo.png");
  });
});
