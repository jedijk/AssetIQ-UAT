import { getTenantDisplayName, getTenantSubtitle, isTenantUuid } from "./tenantDisplay";

describe("tenantDisplay", () => {
  const uuid = "226ed7fe-5b8f-49be-9de3-4c43223c3bd7";

  test("isTenantUuid detects uuid", () => {
    expect(isTenantUuid(uuid)).toBe(true);
    expect(isTenantUuid("Tyromer")).toBe(false);
  });

  test("getTenantDisplayName prefers registry name", () => {
    expect(
      getTenantDisplayName({ name: "UAT Proof Tenant B", slug: "uat-proof-b" }, uuid)
    ).toBe("UAT Proof Tenant B");
  });

  test("getTenantSubtitle never returns uuid", () => {
    expect(
      getTenantSubtitle({ name: "UAT Proof Tenant B", slug: "uat-proof-b" }, uuid)
    ).toBe("uat-proof-b");
    expect(getTenantSubtitle({ name: "UAT Proof Tenant B" }, uuid)).toBeNull();
  });

  test("getTenantDisplayName uses readable tenant id", () => {
    expect(getTenantDisplayName(null, "Tyromer")).toBe("Tyromer");
  });
});
