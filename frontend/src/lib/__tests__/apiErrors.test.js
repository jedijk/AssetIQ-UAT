import { formatApiError, formatApiErrorDetail } from "../apiErrors";

describe("formatApiErrorDetail", () => {
  it("returns strings unchanged", () => {
    expect(formatApiErrorDetail("Failed to apply strategy: boom")).toBe(
      "Failed to apply strategy: boom",
    );
  });

  it("joins pydantic validation array messages", () => {
    const detail = [
      { type: "missing", loc: ["body", "equipment_ids"], msg: "Field required", input: {} },
    ];
    expect(formatApiErrorDetail(detail)).toBe("Field required");
  });

  it("handles single validation object", () => {
    expect(
      formatApiErrorDetail({
        type: "value_error",
        loc: ["body", "run_async"],
        msg: "Input should be a valid boolean",
      }),
    ).toBe("Input should be a valid boolean");
  });

  it("uses fallback when detail is empty", () => {
    expect(formatApiErrorDetail(null, "fallback")).toBe("fallback");
  });
});

describe("formatApiError", () => {
  it("extracts axios response detail", () => {
    const err = {
      response: { data: { detail: [{ msg: "Not found" }] } },
      message: "Request failed with status code 404",
    };
    expect(formatApiError(err, "fallback")).toBe("Not found");
  });
});
