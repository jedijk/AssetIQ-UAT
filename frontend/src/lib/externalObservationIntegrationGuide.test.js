import {
  buildExternalObservationIntegrationGuide,
} from "./externalObservationIntegrationGuide";

describe("externalObservationIntegrationGuide", () => {
  it("uses placeholder base URL when none provided", () => {
    const guide = buildExternalObservationIntegrationGuide();
    expect(guide).toContain("https://your-assetiq-instance.example.com");
    expect(guide).not.toMatch(/aiq_live_[A-Za-z0-9_-]+/);
  });

  it("includes public endpoint path without secrets", () => {
    const guide = buildExternalObservationIntegrationGuide("https://uat.example.com");
    expect(guide).toContain("/api/v1/external/observations");
    expect(guide).toContain("https://uat.example.com/api/v1/external/observations");
    expect(guide).toContain("YOUR_API_KEY");
    expect(guide).not.toContain("tenant_id");
    expect(guide).not.toMatch(/aiq_live_[A-Za-z0-9_-]{8,}/);
  });

  it("documents required payload fields", () => {
    const guide = buildExternalObservationIntegrationGuide("https://app.example.com");
    expect(guide).toContain("source_system");
    expect(guide).toContain("external_reference");
    expect(guide).toContain("idempotency_mode");
    expect(guide).toContain("equipment_match_required");
  });

  it("documents equipment read endpoints", () => {
    const guide = buildExternalObservationIntegrationGuide("https://app.example.com");
    expect(guide).toContain("/api/v1/external/installations/{installation_id}/hierarchy");
    expect(guide).toContain("/api/v1/external/equipment/{equipment_id}");
    expect(guide).toContain("equipment:read");
    expect(guide).toContain("/api/v1/external/openapi.json");
  });
});
