import { isUatEnvironment } from "./envDetection";

const ORIGINAL_ENV = process.env;

describe("isUatEnvironment", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.REACT_APP_DEPLOY_ENV;
    delete process.env.REACT_APP_ENVIRONMENT;
    delete process.env.REACT_APP_BACKEND_URL;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("returns true when REACT_APP_DEPLOY_ENV is uat", () => {
    process.env.REACT_APP_DEPLOY_ENV = "uat";
    expect(isUatEnvironment()).toBe(true);
  });

  it("returns true when REACT_APP_ENVIRONMENT is UAT (case insensitive)", () => {
    process.env.REACT_APP_ENVIRONMENT = "UAT";
    expect(isUatEnvironment()).toBe(true);
  });

  it("returns true when hostname contains uat", () => {
    Object.defineProperty(window, "location", {
      value: { hostname: "assetiq-uat.example.com" },
      writable: true,
      configurable: true,
    });
    expect(isUatEnvironment()).toBe(true);
  });

  it("returns true when backend URL contains uat", () => {
    process.env.REACT_APP_BACKEND_URL = "https://assetiq-uat.railway.app";
    expect(isUatEnvironment()).toBe(true);
  });

  it("returns false in default local dev", () => {
    Object.defineProperty(window, "location", {
      value: { hostname: "localhost" },
      writable: true,
      configurable: true,
    });
    expect(isUatEnvironment()).toBe(false);
  });
});
