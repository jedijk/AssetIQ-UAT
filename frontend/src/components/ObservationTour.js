/**
 * Backwards-compatible shim.
 *
 * The cinematic "Create Your First Observation" tour now lives in
 * `/components/tour/ObservationTour.jsx`. We re-export it from this legacy path
 * so existing imports (e.g. `import ObservationTour from "./ObservationTour"`)
 * keep working without any caller changes.
 */
export { default, ObservationTour } from "./tour/ObservationTour";
