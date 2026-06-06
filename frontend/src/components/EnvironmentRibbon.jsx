import { isUatEnvironment } from "../lib/envDetection";

/**
 * Unobtrusive fixed ribbon shown in UAT deployments.
 */
export default function EnvironmentRibbon({ className = "" }) {
  if (!isUatEnvironment()) {
    return null;
  }

  return (
    <>
      <div
        role="status"
        aria-label="UAT environment"
        data-testid="uat-environment-ribbon"
        className={`fixed top-0 left-0 right-0 z-[100] pointer-events-none ${className}`}
      >
        <div className="flex items-center justify-center h-6 bg-amber-500 text-white text-[11px] font-semibold tracking-widest uppercase shadow-sm">
          UAT Environment
        </div>
      </div>
      <div className="h-6 shrink-0" aria-hidden="true" />
    </>
  );
}
