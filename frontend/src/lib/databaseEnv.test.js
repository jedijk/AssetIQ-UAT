import {
  DATABASE_ENV_EXPLICIT_KEY,
  DATABASE_ENV_STORAGE_KEY,
  enforceDatabaseEnvironmentForRole,
  getDatabaseEnvironment,
  getInferredDatabaseEnvironment,
  getStoredDatabaseEnvironment,
  isExplicitDatabaseEnvironmentChoice,
  isUatHostname,
  markDatabaseEnvironmentExplicit,
} from "./databaseEnv";

const storage = {};

beforeEach(() => {
  Object.keys(storage).forEach((k) => delete storage[k]);
  delete window.location;
  window.location = { hostname: "app.assetiq.com" };
  jest.spyOn(Storage.prototype, "getItem").mockImplementation((key) => storage[key] ?? null);
  jest.spyOn(Storage.prototype, "setItem").mockImplementation((key, value) => {
    storage[key] = String(value);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("isUatHostname", () => {
  it("detects UAT host patterns", () => {
    window.location.hostname = "assetiq-uat.example.com";
    expect(isUatHostname()).toBe(true);
    window.location.hostname = "uat.assetiq.com";
    expect(isUatHostname()).toBe(true);
  });
});

describe("getInferredDatabaseEnvironment", () => {
  it("defaults UAT hosts to uat", () => {
    window.location.hostname = "assetiq-uat.example.com";
    expect(getInferredDatabaseEnvironment()).toBe("uat");
  });

  it("defaults production hosts to production", () => {
    window.location.hostname = "app.assetiq.com";
    expect(getInferredDatabaseEnvironment()).toBe("production");
  });
});

describe("getDatabaseEnvironment on UAT host", () => {
  beforeEach(() => {
    window.location.hostname = "assetiq-uat.example.com";
  });

  it("ignores stale production preference without explicit owner choice", () => {
    storage[DATABASE_ENV_STORAGE_KEY] = "production";
    expect(getDatabaseEnvironment()).toBe("uat");
  });

  it("honors explicit production choice on UAT", () => {
    storage[DATABASE_ENV_STORAGE_KEY] = "production";
    storage[DATABASE_ENV_EXPLICIT_KEY] = "true";
    expect(getDatabaseEnvironment()).toBe("production");
  });
});

describe("enforceDatabaseEnvironmentForRole", () => {
  it("clears UAT preference for non-owners on production host", () => {
    window.location.hostname = "app.assetiq.com";
    storage[DATABASE_ENV_STORAGE_KEY] = "uat";
    enforceDatabaseEnvironmentForRole("maintenance");
    expect(getStoredDatabaseEnvironment()).toBe("production");
  });

  it("does not override owner UAT preference on production host", () => {
    window.location.hostname = "app.assetiq.com";
    storage[DATABASE_ENV_STORAGE_KEY] = "uat";
    enforceDatabaseEnvironmentForRole("owner");
    expect(getStoredDatabaseEnvironment()).toBe("uat");
  });
});

describe("markDatabaseEnvironmentExplicit", () => {
  it("persists explicit choice flag", () => {
    markDatabaseEnvironmentExplicit();
    expect(isExplicitDatabaseEnvironmentChoice()).toBe(true);
  });
});
