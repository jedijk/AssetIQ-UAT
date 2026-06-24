import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionsContext";
import { useEffectiveRole } from "../contexts/RolePreviewContext";
import { formatRoleLabel } from "../lib/roleLabels";
import { useLanguage } from "../contexts/LanguageContext";
import {
  Settings,
  Users,
  QrCode,
  Bell,
  Sliders,
  Brain,
  Server,
  Database,
  BarChart3,
  ChevronRight,
  ArrowLeft,
  Search,
  FileText,
  Shield,
  ScrollText,
  Trash2,
  Tag,
  Wrench,
  CalendarClock,
  Languages,
  ClipboardCheck,
  Monitor,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { ScrollArea } from "../components/ui/scroll-area";
import { cn } from "../lib/utils";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightMatch(text, query) {
  if (!query.trim()) return text;

  const parts = text.split(new RegExp(`(${escapeRegExp(query.trim())})`, "gi"));
  return parts.map((part, index) =>
    part.toLowerCase() === query.trim().toLowerCase() ? (
      <mark key={index} className="bg-yellow-200/80 text-inherit rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function sectionMatchesQuery(section, query, t) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const label = t(`settings.sections.${section.sectionKey}.label`).toLowerCase();
  const description = t(`settings.sections.${section.sectionKey}.description`).toLowerCase();
  const keywords = `${section.id} ${section.sectionKey}`.toLowerCase();

  return (
    label.includes(normalizedQuery) ||
    description.includes(normalizedQuery) ||
    keywords.includes(normalizedQuery)
  );
}

const APP_VERSION = process.env.REACT_APP_VERSION || "3.7.7";

// Settings sections configuration
const SETTINGS_SECTIONS = [
  {
    id: "general",
    sectionKey: "general",
    icon: Settings,
    path: "/settings/preferences",
    roles: ["owner", "admin", "reliability_engineer", "maintenance", "operations", "viewer"],
    personal: true,
  },
  {
    id: "privacy",
    sectionKey: "privacy",
    icon: Shield,
    path: "/settings/privacy",
    roles: ["owner", "admin", "reliability_engineer", "maintenance", "operations", "viewer"],
    personal: true,
  },
  {
    id: "users",
    sectionKey: "users",
    icon: Users,
    path: "/settings/user-management",
    roles: ["owner", "admin"],
    feature: "users"
  },
  {
    id: "qr",
    sectionKey: "qr",
    icon: QrCode,
    path: "/settings/qr",
    roles: ["owner", "admin", "reliability_engineer"],
    requiresSettings: true,
  },
  {
    id: "risk",
    sectionKey: "risk",
    icon: Sliders,
    path: "/settings/risk-calculation",
    roles: ["owner", "admin"],
    requiresSettings: true,
  },
  {
    id: "definitions",
    sectionKey: "definitions",
    icon: Sliders,
    path: "/definitions",
    roles: ["owner", "admin", "reliability_engineer", "maintenance", "operations", "viewer"],
    feature: "equipment",
  },
  {
    id: "visual-management",
    sectionKey: "visualManagement",
    icon: Monitor,
    path: "/visual-management/boards",
    roles: ["owner", "admin", "reliability_engineer", "maintenance", "operations", "viewer"],
    feature: "visual_boards",
  },
  {
    id: "notifications",
    sectionKey: "notifications",
    icon: Bell,
    path: "/settings/notifications",
    roles: ["owner", "admin", "reliability_engineer", "maintenance", "operations"],
    personal: true,
  },
  {
    id: "ai",
    sectionKey: "ai",
    icon: Brain,
    path: "/settings/ai-usage",
    roles: ["owner", "admin"],
    requiresSettings: true,
  },
  {
    id: "maintenance-readiness",
    sectionKey: "maintenanceReadiness",
    icon: ClipboardCheck,
    path: "/settings/maintenance-readiness",
    roles: ["owner", "admin"],
    desktopOnly: true,
    requiresSettings: true,
  },
  {
    id: "performance",
    sectionKey: "performance",
    icon: Server,
    path: "/settings/server-performance",
    roles: ["owner"]
  },
  {
    id: "database",
    sectionKey: "database",
    icon: Database,
    path: "/settings/database",
    roles: ["owner"]
  },
  {
    id: "log-ingestion",
    sectionKey: "logIngestion",
    icon: FileText,
    path: "/settings/log-ingestion",
    roles: ["owner"]
  },
  {
    id: "statistics",
    sectionKey: "statistics",
    icon: BarChart3,
    path: "/settings/statistics",
    roles: ["owner", "admin", "reliability_engineer", "maintenance", "operations"],
    feature: "statistics",
  },
  {
    id: "deletion-requests",
    sectionKey: "deletionRequests",
    icon: Trash2,
    path: "/settings/deletion-requests",
    roles: ["owner"]
  },
  {
    id: "consent-management",
    sectionKey: "consentManagement",
    icon: Shield,
    path: "/settings/consent-management",
    roles: ["owner"]
  },
  {
    id: "labels",
    sectionKey: "labels",
    icon: Tag,
    path: "/settings/labels",
    roles: ["owner"],
    desktopOnly: true
  },
  {
    id: "disciplines",
    sectionKey: "disciplines",
    icon: Wrench,
    path: "/settings/disciplines",
    roles: ["owner", "admin"],
    requiresSettings: true,
  },
  {
    id: "task-generation",
    sectionKey: "taskGeneration",
    icon: CalendarClock,
    path: "/settings/task-generation",
    roles: ["owner", "admin"],
    requiresSettings: true,
  },
  {
    id: "translations",
    sectionKey: "translations",
    icon: Languages,
    path: "/settings/translations",
    roles: ["owner", "admin"],
    requiresSettings: true,
  },
  {
    id: "audit-log",
    sectionKey: "auditLog",
    icon: ScrollText,
    path: "/settings/audit-log",
    roles: ["owner"]
  }
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { effectiveRole } = useEffectiveRole();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const { t } = useLanguage();
  const [activeSection, setActiveSection] = useState("general");
  const [showMobileNav, setShowMobileNav] = useState(true);
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
  const [searchQuery, setSearchQuery] = useState("");

  // Mobile detection with resize listener
  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const visibleSections = useMemo(() => {
    return SETTINGS_SECTIONS.filter((section) => {
      if (!user?.role) return false;
      if (section.desktopOnly && isMobileView) return false;
      if (effectiveRole === "owner") return true;
      if (section.personal) return true;
      if (section.roles?.length === 1 && section.roles[0] === "owner") return false;

      if (!permissionsLoading) {
        if (section.feature && !hasPermission(section.feature, "read")) return false;
        if (section.requiresSettings && !hasPermission("settings", "read")) return false;
      }

      if (section.roles?.includes(effectiveRole)) return true;
      if (!permissionsLoading && section.feature && hasPermission(section.feature, "read")) return true;
      if (!permissionsLoading && section.requiresSettings && hasPermission("settings", "read")) return true;
      return false;
    });
  }, [user?.role, effectiveRole, isMobileView, hasPermission, permissionsLoading]);

  const filteredSections = useMemo(
    () => visibleSections.filter((section) => sectionMatchesQuery(section, searchQuery, t)),
    [visibleSections, searchQuery, t]
  );

  // Determine active section from URL
  useEffect(() => {
    const currentPath = location.pathname;
    const matchedSection = SETTINGS_SECTIONS.find(s => currentPath.startsWith(s.path));
    if (matchedSection) {
      const isVisible = visibleSections.some((s) => s.id === matchedSection.id);
      if (!isVisible && visibleSections.length > 0) {
        navigate(visibleSections[0].path, { replace: true });
        return;
      }
      setActiveSection(matchedSection.id);
      // On mobile, hide nav when a section is selected
      setShowMobileNav(false);
    } else if (currentPath === "/settings" || currentPath === "/settings/") {
      // Redirect to first available section; users without settings access land on definitions
      if (visibleSections.length > 0) {
        const preferDefinitions = !permissionsLoading && !hasPermission("settings", "read");
        const target = preferDefinitions
          ? (visibleSections.find((s) => s.id === "definitions") || visibleSections[0])
          : visibleSections[0];
        navigate(target.path, { replace: true });
      }
      setShowMobileNav(true);
    }
  }, [location.pathname, navigate, visibleSections, hasPermission, permissionsLoading]);

  const handleSectionClick = (section) => {
    setActiveSection(section.id);
    setShowMobileNav(false);
    navigate(section.path);
  };

  const handleBackToNav = () => {
    setShowMobileNav(true);
  };

  // On mobile, render settings pages directly without the Settings wrapper
  // This applies to all settings sub-pages (user-management, statistics, preferences, etc.)
  const isSettingsSubPage = location.pathname !== '/settings' && location.pathname.startsWith('/settings/');
  
  if (isMobileView && isSettingsSubPage) {
    return <Outlet />;
  }

  return (
    <div className="h-[calc(100vh-48px)] flex bg-slate-50">
      {/* Left Sidebar - Hidden on mobile when content is shown */}
      <aside className={cn(
        "bg-white border-r border-slate-200 flex flex-col flex-shrink-0",
        "w-full md:w-72 xl:w-80",
        "md:flex",
        showMobileNav ? "flex" : "hidden md:flex"
      )}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigate("/")}
              data-testid="settings-back-btn"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">{t("settings.title")}</h1>
              <p className="text-xs text-slate-500">{t("settings.subtitle")}</p>
            </div>
          </div>
        </div>

        <div className="px-4 pb-3 border-b border-slate-200">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder={t("settings.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 text-sm"
              data-testid="settings-search"
            />
          </div>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1" persistKey="settings.sidebar">
          <nav className="p-2 space-y-1">
            {filteredSections.length === 0 && (
              <p className="px-3 py-6 text-sm text-slate-500 text-center">
                {t("settings.noSearchResults")}
              </p>
            )}
            {filteredSections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              
              return (
                <button
                  key={section.id}
                  onClick={() => handleSectionClick(section)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all group",
                    isActive
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                  data-testid={`settings-nav-${section.id}`}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors",
                    isActive
                      ? "bg-blue-100 text-blue-600"
                      : "bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700"
                  )}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm font-medium truncate",
                      isActive ? "text-blue-700" : "text-slate-900"
                    )}>
                      {highlightMatch(
                        t(`settings.sections.${section.sectionKey}.label`),
                        searchQuery
                      )}
                    </p>
                    <p className="text-xs text-slate-500 line-clamp-2 sm:truncate hidden sm:block">
                      {highlightMatch(
                        t(`settings.sections.${section.sectionKey}.description`),
                        searchQuery
                      )}
                    </p>
                  </div>
                  <ChevronRight className={cn(
                    "w-4 h-4 flex-shrink-0 transition-transform ml-3",
                    isActive ? "text-blue-500" : "text-slate-400 group-hover:translate-x-0.5"
                  )} />
                </button>
              );
            })}
          </nav>
        </ScrollArea>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50">
          <div className="text-xs text-slate-500 text-center space-y-1">
            <div>
              {t("settings.accessLevel").replace("{role}", formatRoleLabel(effectiveRole || user?.role || ""))}
            </div>
            <div className="text-slate-400">
              {t("settings.version").replace("{version}", APP_VERSION)}
            </div>
          </div>
        </div>
      </aside>

      {/* Right Content Panel - Full width on mobile */}
      <main className={cn(
        "flex-1 overflow-hidden",
        showMobileNav ? "hidden md:block" : "block"
      )}>
        {/* Mobile back button - Hidden on user-management page which has its own header */}
        {!location.pathname.includes('/user-management') && (
          <div className="md:hidden p-4 border-b border-slate-200 bg-white flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleBackToNav}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <span className="font-medium text-slate-900 min-w-0 flex-1 break-words line-clamp-2">
              {visibleSections.find(s => s.id === activeSection)
                ? t(`settings.sections.${visibleSections.find(s => s.id === activeSection).sectionKey}.label`)
                : t("settings.title")}
            </span>
          </div>
        )}
        
        <ScrollArea
          className="h-full md:h-full"
          style={{ height: location.pathname.includes('/user-management') ? '100%' : 'calc(100% - 56px)' }}
          persistKey={`settings.content.${location.pathname}`}
        >
          <div className={cn(
            "md:p-6 xl:p-8",
            // No padding on mobile for user-management - it has its own layout
            location.pathname.includes('/user-management') ? "p-0" : "p-4"
          )}>
            <Outlet />
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}

// Settings Section Wrapper Component for consistent styling
export function SettingsSection({ title, description, children }) {
  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-slate-900">{title}</h2>
        {description && (
          <p className="text-sm md:text-base text-slate-500 mt-1">{description}</p>
        )}
      </div>
      <div className="space-y-4 md:space-y-6">
        {children}
      </div>
    </div>
  );
}

// Settings Card Component
export function SettingsCard({ title, description, children, actions }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {(title || description) && (
        <div className="px-4 md:px-6 py-3 md:py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            {title && <h3 className="font-semibold text-slate-900 text-sm md:text-base">{title}</h3>}
            {description && <p className="text-xs md:text-sm text-slate-500 mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-4 md:p-6">
        {children}
      </div>
    </div>
  );
}

// Settings Row Component
export function SettingsRow({ label, description, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-b border-slate-100 last:border-0 gap-2 sm:gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        {description && (
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex-shrink-0 w-full sm:w-auto">
        {children}
      </div>
    </div>
  );
}
