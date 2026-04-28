import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { debugLog } from "./debug";

export function cn(...inputs) {
  // Defensive: if tailwind-merge ever throws (rare/minified iOS crashes have been
  // observed), fall back to clsx so the UI keeps working.
  try {
    return twMerge(clsx(inputs));
  } catch (err) {
    try {
      debugLog("cn_twmerge_error", {
        message: String(err?.message || err),
        inputs_typeof: inputs.map((x) => typeof x),
      });
    } catch (_e) {}
    return clsx(inputs);
  }
}
