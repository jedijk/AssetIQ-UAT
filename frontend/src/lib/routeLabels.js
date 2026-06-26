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
  Package,
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
  '/library': 'Strategy',
  '/visual-management/boards': 'Visual Management',
  '/visual-management/templates': 'Templates',
  '/visual-management/screens': 'Screens',
  '/visual-management/pair-displays': 'Pair Displays',
  '/visual-management/analytics': 'Analytics',
  '/equipment-manager': 'Equipment Manager',
  '/causal-engine': 'Causal Engine',
  '/tasks': 'Task Scheduler',
  '/my-tasks': 'My Tasks',
  '/forms': 'Forms',
  '/form-submissions': 'Form Submissions',
  '/granulometry': 'Granulometry',
  '/feedback': 'Feedback',
  '/reliability': 'Reliability Intelligence',
  '/supervisor': 'Supervisor Command Center',
  '/reliability/cases': 'Reliability Cases',
  '/definitions': 'Definitions',
  '/spareiq': 'SpareIQ',
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
  { pattern: /^\/spareiq\/([^/]+)$/, label: 'Spare Part', icon: Package },
  { pattern: /^\/equipment\/([^/]+)\/trace$/, label: 'Reliability Trace', icon: GitBranch },
  { pattern: /^\/equipment\/([^/]+)\/reliability$/, label: 'Reliability Profile', icon: Sparkles },
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
  '/supervisor': ClipboardCheck,
  '/reliability/cases': Sparkles,
  '/definitions': Sliders,
  '/spareiq': Package,
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

/** List route to keep when trimming detail pages (e.g. /actions for action detail). */
export function getDetailAnchorPath(path) {
  const normalized = normalizeBreadcrumbPath(path);
  if (/^\/actions\/[^/]+$/.test(normalized)) {
    return '/actions';
  }
  if (/^\/threats\/[^/]+\/workspace$/.test(normalized)) {
    return '/threats';
  }
  if (/^\/reliability\/cases\/[^/]+$/.test(normalized)) {
    return '/reliability/cases';
  }
  return null;
}

export function isActionDetailPath(path) {
  return /^\/actions\/[^/]+$/.test(normalizeBreadcrumbPath(path));
}

export function isObservationWorkspacePath(path) {
  return /^\/threats\/[^/]+\/workspace$/.test(normalizeBreadcrumbPath(path));
}

/** Skip auto-inserting /actions when the user arrived from these routes. */
export function shouldSkipDetailAnchorInjection(entries) {
  if (!entries || entries.length < 2) return false;
  const beforeDetail = entries[entries.length - 2];
  const beforePath = normalizeBreadcrumbPath(beforeDetail.path);
  return (
    beforePath === '/my-tasks'
    || isObservationWorkspacePath(beforePath)
    || beforePath === '/actions'
    || beforePath === '/threats'
    || beforePath === '/reliability/cases'
    || beforePath === '/dashboard'  // Skip anchor injection when coming from ops dashboard
    || beforePath === '/reliability'
    || beforePath === '/'  // Also skip when from root
  );
}

/**
 * Ensure list routes (e.g. /actions) appear before detail pages in the trail.
 */
export function ensureDetailAnchors(entries) {
  if (!entries.length) return entries;

  const last = entries[entries.length - 1];
  const anchorPath = getDetailAnchorPath(last.path);
  if (!anchorPath) return entries;
  if (entries.some((entry) => entry.path === anchorPath)) return entries;
  if (shouldSkipDetailAnchorInjection(entries)) return entries;

  const anchorEntry = {
    path: anchorPath,
    label: getRouteLabel(anchorPath),
    timestamp: (last.timestamp || Date.now()) - 1,
  };
  return [...entries.slice(0, -1), anchorEntry, last];
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
  if (/^\/spareiq\/[^/]+$/.test(normalized)) {
    return '/spareiq';
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

/** Read explicit breadcrumb origin from router location state. */
export function readBreadcrumbOrigin(locationState) {
  const origin = locationState?.breadcrumbOrigin;
  if (!origin || typeof origin !== 'string') return null;
  return normalizeBreadcrumbPath(origin);
}

/**
 * Trim breadcrumb history to max items while keeping home, the page before the
 * current one (actual navigation source), and the current page.
 */
export function trimBreadcrumbHistory(entries, homeLabel, max = 3) {
  if (!entries?.length || entries.length <= max) {
    return entries;
  }

  const current = entries[entries.length - 1];
  const prior = entries.length >= 2 ? entries[entries.length - 2] : null;
  const trimmed = [entries[0]];

  if (prior && !isHomeBreadcrumbPath(prior.path) && prior.path !== current.path) {
    if (prior.path !== trimmed[0].path) {
      trimmed.push(prior);
    }
  } else {
    const anchorPath = getDetailAnchorPath(current.path);
    if (anchorPath) {
      const anchorEntry = entries.find((entry) => entry.path === anchorPath);
      if (anchorEntry && anchorEntry.path !== trimmed[0].path) {
        trimmed.push(anchorEntry);
      }
    }
  }

  if (current.path !== trimmed[trimmed.length - 1]?.path) {
    trimmed.push(current);
  }

  return trimmed.map((entry) => (
    isHomeBreadcrumbPath(entry.path) ? { ...entry, label: homeLabel } : entry
  ));
}

// Routes to exclude from breadcrumb tracking
export const excludedRoutes = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/login/callback',
  '/mobile',
  '/tv',
  '/display',
  '/vmb',
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
