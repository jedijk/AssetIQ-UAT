import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Brain,
  Building2,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  Database,
  FileText,
  GitBranch,
  LayoutDashboard,
  ScrollText,
  Server,
  Settings,
  Sliders,
  Sparkles,
} from 'lucide-react';

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
  { pattern: /^\/threats\/([^/]+)\/workspace$/, label: 'Observation Workspace', icon: AlertTriangle },
  { pattern: /^\/threats\/([^/]+)$/, label: 'Observation Detail', icon: AlertTriangle },
  { pattern: /^\/actions\/([^/]+)$/, label: 'Action Detail', icon: ClipboardList },
  { pattern: /^\/reliability\/cases\/([^/]+)$/, label: 'Case Detail', icon: Sparkles },
];

const staticRouteIcons = {
  '/': LayoutDashboard,
  '/dashboard': LayoutDashboard,
  '/production': LayoutDashboard,
  '/threats': AlertTriangle,
  '/actions': ClipboardList,
  '/library': BookOpen,
  '/equipment-manager': Building2,
  '/causal-engine': GitBranch,
  '/tasks': Calendar,
  '/my-tasks': ClipboardCheck,
  '/forms': FileText,
  '/form-submissions': FileText,
  '/granulometry': Sliders,
  '/feedback': FileText,
  '/reliability': Sparkles,
  '/reliability/cases': Sparkles,
  '/definitions': Sliders,
  '/settings': Settings,
  '/settings/preferences': Settings,
  '/settings/general': Settings,
  '/settings/user-management': Settings,
  '/settings/permissions': Settings,
  '/settings/qr': Settings,
  '/settings/labels': Settings,
  '/settings/notifications': Settings,
  '/settings/risk-calculation': Sliders,
  '/settings/ai-usage': Brain,
  '/settings/server-performance': Server,
  '/settings/maintenance-readiness': ClipboardCheck,
  '/settings/database': Database,
  '/settings/audit-log': ScrollText,
  '/settings/statistics': BarChart3,
  '/settings/criticality-definitions': Sliders,
  '/settings/feedback': FileText,
  '/settings/log-ingestion': FileText,
  '/settings/privacy': Settings,
  '/settings/deletion-requests': Settings,
  '/settings/consent-management': Settings,
  '/settings/translations': Settings,
  '/settings/disciplines': Settings,
  '/settings/task-generation': Settings,
  '/user-statistics': BarChart3,
};

/**
 * Canonical path for breadcrumb storage and navigation.
 * /threats/:id redirects to /workspace — storing the short path breaks back navigation.
 */
export function normalizeBreadcrumbPath(path) {
  if (!path) return path;
  const threatDetail = path.match(/^\/threats\/([^/]+)$/);
  if (threatDetail) {
    return `/threats/${threatDetail[1]}/workspace`;
  }
  if (path === '/') {
    return '/dashboard';
  }
  return path;
}

/** Ops dashboard or simple-mode landing — both live at /dashboard. */
export const HOME_BREADCRUMB_PATH = '/dashboard';

export function getHomeBreadcrumbPath() {
  return HOME_BREADCRUMB_PATH;
}

export function isHomeBreadcrumbPath(path) {
  return normalizeBreadcrumbPath(path) === HOME_BREADCRUMB_PATH;
}

/**
 * Parent route when breadcrumb history has no previous entry (e.g. deep link).
 */
export function getParentBreadcrumbPath(path) {
  const normalized = normalizeBreadcrumbPath(path);
  if (!normalized || normalized === '/dashboard') {
    return null;
  }
  if (/^\/threats\/[^/]+\/workspace$/.test(normalized)) {
    return '/threats';
  }
  if (/^\/actions\/[^/]+$/.test(normalized)) {
    return '/actions';
  }
  if (/^\/reliability\/cases\/[^/]+$/.test(normalized)) {
    return '/reliability/cases';
  }
  if (normalized.startsWith('/settings/')) {
    return '/settings';
  }
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length > 1) {
    return `/${parts.slice(0, -1).join('/')}`;
  }
  return '/dashboard';
}

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
 * Lucide icon component for a route path (mobile breadcrumb icons).
 */
export function getRouteIcon(path) {
  if (isHomeBreadcrumbPath(path)) {
    return LayoutDashboard;
  }

  if (staticRouteIcons[path]) {
    return staticRouteIcons[path];
  }

  for (const { pattern, icon } of dynamicRoutePatterns) {
    if (pattern.test(path) && icon) {
      return icon;
    }
  }

  if (path.startsWith('/settings')) {
    return Settings;
  }

  return FileText;
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
