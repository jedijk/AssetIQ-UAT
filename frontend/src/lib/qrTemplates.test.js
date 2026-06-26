import { QR_PRINT_TEMPLATES } from "./qrTemplates";

describe("QR_PRINT_TEMPLATES", () => {
  it("includes single and grid layouts", () => {
    const ids = QR_PRINT_TEMPLATES.map((t) => t.id);
    expect(ids).toContain("single");
    expect(ids).toContain("a4_4x5");
  });

  it("each template has id, label, and description", () => {
    for (const template of QR_PRINT_TEMPLATES) {
      expect(template.id).toBeTruthy();
      expect(template.label).toBeTruthy();
      expect(template.description).toBeTruthy();
    }
  });
});
