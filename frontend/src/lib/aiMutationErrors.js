import { toast } from "sonner";

/**
 * Shared toast handling for AI risk / causal analysis mutations.
 */
export function showAiMutationError(error, t) {
  if (error?.isTimeout || error?.code === "ECONNABORTED") {
    toast.error(
      t("ai.analysisTakingLonger") ||
        "AI analysis taking longer than expected. Please wait and try again."
    );
    return;
  }

  const errorMessage = error?.response?.data?.detail || error?.message;
  if (errorMessage?.includes("rate limit")) {
    toast.error(
      t("ai.rateLimitExceeded") ||
        "AI rate limit exceeded. Please wait a moment and try again."
    );
  } else if (errorMessage?.includes("token") || errorMessage?.includes("key")) {
    toast.error(
      t("ai.configurationError") ||
        "AI service configuration error. Please contact support."
    );
  } else {
    toast.error(t("ai.analysisFailed") || errorMessage || "AI analysis failed");
  }
}
