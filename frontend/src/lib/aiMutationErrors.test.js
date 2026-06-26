import { toast } from "sonner";
import { showAiMutationError } from "./aiMutationErrors";

jest.mock("sonner", () => ({
  toast: { error: jest.fn() },
}));

const t = (key) => {
  const map = {
    "ai.analysisTakingLonger": "Taking longer",
    "ai.rateLimitExceeded": "Rate limited",
    "ai.configurationError": "Config error",
    "ai.analysisFailed": "Analysis failed",
  };
  return map[key] || key;
};

describe("showAiMutationError", () => {
  beforeEach(() => {
    toast.error.mockClear();
  });

  it("shows timeout message for ECONNABORTED", () => {
    showAiMutationError({ code: "ECONNABORTED" }, t);
    expect(toast.error).toHaveBeenCalledWith("Taking longer");
  });

  it("shows rate limit message", () => {
    showAiMutationError({ message: "OpenAI rate limit exceeded" }, t);
    expect(toast.error).toHaveBeenCalledWith("Rate limited");
  });

  it("shows config error for token/key failures", () => {
    showAiMutationError({ message: "Invalid API key" }, t);
    expect(toast.error).toHaveBeenCalledWith("Config error");
  });

  it("shows generic failure message", () => {
    showAiMutationError({ message: "Something broke" }, t);
    expect(toast.error).toHaveBeenCalledWith("Analysis failed");
  });

  it("uses isTimeout flag", () => {
    showAiMutationError({ isTimeout: true }, t);
    expect(toast.error).toHaveBeenCalledWith("Taking longer");
  });
});
