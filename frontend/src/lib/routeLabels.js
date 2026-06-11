/**
 * Route labels mapping for breadcrumb display
 * Maps route paths to human-readable labels
 */

// Static route labels
const staticRouteLabels = {
  '/': 'Dashboard',
  '/dashboard': 'Dashboard',
  '/production': 'Production',
  '/threats': 'Observations',
  '/actions': 'Actions',
  '/library': 'Library',
  '/equipment-manager': 'Equipment Manager',
  '/causal-engine': 'Causal Engine',
  '/tasks': 'Task Scheduler',
  '/my-tasks': 'My Tasks',
  '/forms': 'Forms',
  '/form-submissions': 'Form Submissions',
  '/granulometry': 'Granulometry',
  '/feedback': 'Feedback',
  '/reliability': 'Reliability Intelligence',
  '/reliability/cases': 'Reliability Cases',
  '/definitions': 'Definitions',
  '/settings': 'Settings',
  '/settings/preferences': 'Preferences',
  '/settings/general': 'General',
  '/settings/user-management': 'User Management',
  '/settings/permissions': 'Permissions',
  '/settings/qr': 'QR Codes',
  '/settings/labels': 'Labels',
  '/settings/notifications': 'Notifications',
  '/settings/risk-calculation': 'Risk Calculation',
  '/settings/ai-usage': 'AI Usage',
  '/settings/server-performance': 'Server Performance',
  '/settings/maintenance-readiness': 'Maintenance Readiness',
  '/settings/database': 'Database',
  '/settings/audit-log': 'Audit Log',
  '/settings/statistics': 'Statistics',
  '/settings/criticality-definitions': 'Criticality Definitions',
  '/settings/feedback': 'Feedback',
  '/settings/log-ingestion': 'Log Ingestion',
  '/settings/privacy': 'Privacy',
  '/settings/deletion-requests': 'Deletion Requests',
  '/settings/consent-management': 'Consent Management',
  '/settings/translations': 'Translations',
  '/settings/disciplines': 'Disciplines',
  '/settings/task-generation': 'Task Generation',
  '/user-statistics': 'User Statistics',
};

// Dynamic route patterns (with :param placeholders)
const dynamicRoutePatterns = [
  { pattern: /^\/threats\/([^/]+)\/workspace$/, label: 'Observation Workspace' },
  { pattern: /^\/threats\/([^/]+)$/, label: 'Observation Detail' },
  { pattern: /^\/actions\/([^/]+)$/, label: 'Action Detail' },
  { pattern: /^\/reliability\/cases\/([^/]+)$/, label: 'Case Detail' },
];

// Routes to exclude from breadcrumb tracking
export const excludedRoutes = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/login/callback',
  '/mobile',
];

/**
 * Get the display label for a given route path
 * @param {string} path - The route path
 * @returns {string} - The display label
 */
export function getRouteLabel(path) {
  // Check static routes first
  if (staticRouteLabels[path]) {
    return staticRouteLabels[path];
  }

  // Check dynamic route patterns
  for (const { pattern, label } of dynamicRoutePatterns) {
    if (pattern.test(path)) {
      return label;
    }
  }

  // Fallback: convert path to title case
  const pathParts = path.split('/').filter(Boolean);
  if (pathParts.length > 0) {
    const lastPart = pathParts[pathParts.length - 1];
    // Convert kebab-case to Title Case
    return lastPart
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  return 'Page';
}

/**
 * Check if a route should be excluded from breadcrumb tracking
 * @param {string} path - The route path
 * @returns {boolean} - True if route should be excluded
 */
export function shouldExcludeRoute(path) {
  return excludedRoutes.some(route => path.startsWith(route));
}

export default staticRouteLabels;
