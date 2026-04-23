import { useState, useEffect } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
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
  FileText,
  Shield,
  Trash2
} from "lucide-react";
import { Button } from "../components/ui/button";
import { ScrollArea } from "../components/ui/scroll-area";
import { cn } from "../lib/utils";

// Settings sections configuration
const SETTINGS_SECTIONS = [
  {
    id: "general",
    label: "General",
    description: "App preferences and display settings",
    icon: Settings,
    path: "/settings/preferences",
    roles: ["owner", "admin", "engineer", "technician", "viewer"]
  },
  {
    id: "privacy",
    label: "Privacy & Data",
    description: "GDPR compliance and data export",
    icon: Shield,
    path: "/settings/privacy",
    roles: ["owner", "admin", "engineer", "technician", "viewer"]
  },
  {
    id: "users",
    label: "Users & Roles",
    description: "Manage team members and permissions",
    icon: Users,
    path: "/settings/user-management",
    roles: ["owner", "admin"],
    feature: "users"
  },
  {
    id: "qr",
    label: "QR Management",
    description: "QR codes and scan settings",
    icon: QrCode,
    path: "/settings/qr",
    roles: ["owner", "admin", "engineer"]
  },
  {
    id: "risk",
    label: "Risk Calculation",
    description: "Risk scoring and thresholds",
    icon: Sliders,
    path: "/settings/risk-calculation",
    roles: ["owner", "admin"]
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Email and alert preferences",
    icon: Bell,
    path: "/settings/notifications",
    roles: ["owner", "admin", "engineer", "technician"]
  },
  {
    id: "ai",
    label: "AI Usage",
    description: "AI features and usage statistics",
    icon: Brain,
    path: "/settings/ai-usage",
    roles: ["owner", "admin"]
  },
  {
    id: "performance",
    label: "Server Performance",
    description: "System health and diagnostics",
    icon: Server,
    path: "/settings/server-performance",
    roles: ["owner"]
  },
  {
    id: "database",
    label: "Database Environment",
    description: "Switch between Production and UAT",
    icon: Database,
    path: "/settings/database",
    roles: ["owner"]
  },
  {
    id: "log-ingestion",
    label: "Log Ingestion",
    description: "Upload & parse production logs",
    icon: FileText,
    path: "/settings/log-ingestion",
    roles: ["owner"]
  },
  {
    id: "statistics",
    label: "Statistics",
    description: "Usage analytics and reports",
    icon: BarChart3,
    path: "/settings/statistics",
    roles: ["owner", "admin", "engineer", "technician"]
  },
  {
    id: "deletion-requests",
    label: "Deletion Requests",
    description: "Review account deletion requests",
    icon: Trash2,
    path: "/settings/deletion-requests",
    roles: ["owner"]
  },
  {
    id: "consent-management",
    label: "Consent Management",
    description: "Track and reset user consent status",
    icon: Shield,
    path: "/settings/consent-management",
    roles: ["owner"]
  }
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [activeSection, setActiveSection] = useState("general");
  const [showMobileNav, setShowMobileNav] = useState(true);
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);

  // Mobile detection with resize listener
  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Filter sections based on user role
  const visibleSections = SETTINGS_SECTIONS.filter(section => {
    if (!user?.role) return false;
    return section.roles.includes(user.role);
  });

  // Determine active section from URL
  useEffect(() => {
    const currentPath = location.pathname;
    const matchedSection = SETTINGS_SECTIONS.find(s => currentPath.startsWith(s.path));
    if (matchedSection) {
      setActiveSection(matchedSection.id);
      // On mobile, hide nav when a section is selected
      setShowMobileNav(false);
    } else if (currentPath === "/settings" || currentPath === "/settings/") {
      // Redirect to first available section
      if (visibleSections.length > 0) {
        navigate(visibleSections[0].path, { replace: true });
      }
      setShowMobileNav(true);
    }
  }, [location.pathname, navigate, visibleSections]);

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
              <h1 className="text-lg font-semibold text-slate-900">Settings</h1>
              <p className="text-xs text-slate-500">Manage your preferences</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1">
          <nav className="p-2 space-y-1">
            {visibleSections.map((section) => {
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
                      {section.label}
                    </p>
                    <p className="text-xs text-slate-500 truncate hidden xl:block">
                      {section.description}
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
              <span className="font-medium">{user?.role}</span> access level
            </div>
            <div className="text-slate-400">
              Version 3.5.6
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
            <span className="font-medium text-slate-900">
              {visibleSections.find(s => s.id === activeSection)?.label || "Settings"}
            </span>
          </div>
        )}
        
        <ScrollArea className="h-full md:h-full" style={{ height: location.pathname.includes('/user-management') ? '100%' : 'calc(100% - 56px)' }}>
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
