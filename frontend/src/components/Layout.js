import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { useUndo } from "../contexts/UndoContext";
import { useLanguage } from "../contexts/LanguageContext";
import { getBackendUrl } from "../lib/apiConfig";
import { AlertTriangle, LogOut, Menu, X, BookOpen, MessageSquare, Plus, PanelLeftOpen, PanelLeftClose, Settings, Building2, GitBranch, Undo2, ClipboardList, Info, LayoutDashboard, Users, BarChart3, Sliders, Bell, Clock, ChevronRight, Calendar, Activity, FileText, Brain, Wifi, WifiOff, RefreshCw, Cloud, ClipboardCheck, MessageCircleQuestion, Tag, Shield } from "lucide-react";

// App version - automatically read from package.json via REACT_APP_VERSION
const APP_VERSION = process.env.REACT_APP_VERSION || "1.0.0";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import ChatSidebar from "./ChatSidebar";
import EquipmentHierarchy from "./EquipmentHierarchy";
import { actionsAPI } from "../lib/api";
import { useOfflineSync } from "../hooks/useOfflineSync";
import { usePageTracking } from "../hooks/useAnalyticsTracking";

const Layout = () => {
  const { user, logout } = useAuth();
  const { canUndo, undo, isUndoing, getLastAction, undoCount } = useUndo();
  const { language, toggleLanguage, t } = useLanguage();
  const { isOnline, totalPending, isSyncing, syncAllPending } = useOfflineSync();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPrefillEquipment, setChatPrefillEquipment] = useState(null);
  const [hierarchyOpen, setHierarchyOpen] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);

  // Track page views for user statistics
  usePageTracking();

  // Fetch user avatar
  useEffect(() => {
    const fetchAvatar = async () => {
      if (!user?.id) return;
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(
          `${getBackendUrl()}/api/users/${user.id}/avatar?auth=${token}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (response.ok) {
          const blob = await response.blob();
          setAvatarUrl(URL.createObjectURL(blob));
        }
      } catch (err) {
        // No avatar available
      }
    };
    fetchAvatar();
    return () => {
      if (avatarUrl) URL.revokeObjectURL(avatarUrl);
    };
  }, [user?.id]);

  // Query overdue actions for notification bell
  const { data: overdueData } = useQuery({
    queryKey: ["overdue-actions"],
    queryFn: actionsAPI.getOverdue,
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000,
  });

  const overdueActions = overdueData?.overdue_actions || [];
  const overdueCount = overdueData?.count || 0;

  // Format how overdue an action is
  const formatOverdue = (dueDate) => {
    if (!dueDate) return "";
    const due = new Date(dueDate);
    const now = new Date();
    const diffDays = Math.floor((now - due) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return t("notifications.dueToday");
    if (diffDays === 1) return t("notifications.overdueBy1Day");
    return t("notifications.overdueByDays").replace("{days}", diffDays);
  };

  // Handler for opening chat with pre-filled equipment (from hierarchy context menu)
  const handleAddObservationFromHierarchy = (equipmentName) => {
    setChatPrefillEquipment(equipmentName);
    setChatOpen(true);
  };

  // Clear prefill when chat is closed
  const handleChatClose = () => {
    setChatOpen(false);
    setChatPrefillEquipment(null);
  };

  // Check if mobile viewport
  const [isMobileView, setIsMobileView] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto-collapse hierarchy on mobile and on Equipment Manager page
  useEffect(() => {
    if (location.pathname === "/equipment-manager" || isMobileView) {
      setHierarchyOpen(false);
    }
  }, [location.pathname, isMobileView]);

  const lastAction = getLastAction();

  const allNavItems = [
    { path: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
    { path: "/threats", label: t("nav.observations"), icon: AlertTriangle },
    { path: "/causal-engine", label: t("nav.causalEngine"), icon: GitBranch, desktopOnly: true },
    { path: "/actions", label: t("nav.actions"), icon: ClipboardList },
    { path: "/my-tasks", label: t("nav.myTasks") || "My Tasks", icon: ClipboardCheck },
    { path: "/library", label: t("nav.library"), icon: BookOpen, desktopOnly: true },
  ];
  
  // Filter nav items based on device
  const navItems = isMobileView 
    ? allNavItems.filter(item => !item.desktopOnly)
    : allNavItems;

  // Settings menu items (including Execution, Forms, AI Engine)
  const allSettingsMenuItems = [
    { path: "/equipment-manager", label: t("nav.equipmentManager"), icon: Building2, desktopOnly: true },
    { path: "/tasks", label: t("taskScheduler.execution"), icon: Calendar, desktopOnly: true },
    { path: "/forms", label: t("forms.title"), icon: FileText, desktopOnly: true },
    { path: "/decision-engine", label: t("decisionEngine.title"), icon: Brain, desktopOnly: true },
    { path: "/settings/user-management", label: t("nav.userManagement"), icon: Users },
    { path: "/settings/permissions", label: t("nav.permissions"), icon: Shield, ownerOnly: true },
    { path: "/settings/ai-usage", label: t("nav.aiUsage"), icon: Brain, adminOnly: true },
    { path: "/settings/statistics", label: t("nav.statistics"), icon: BarChart3 },
    { path: "/settings/criticality-definitions", label: t("nav.criticalityDefinitions"), icon: Sliders },
    { path: "/settings/feedback", label: t("nav.feedback") || "Feedback", icon: MessageCircleQuestion },
  ];
  
  // Filter settings items based on device and user role
  const settingsMenuItems = allSettingsMenuItems.filter(item => {
    // Filter desktop-only items for mobile
    if (isMobileView && item.desktopOnly) return false;
    // Filter owner-only items for non-owners
    if (item.ownerOnly && user?.role !== 'owner') return false;
    // Filter admin-only items for non-admins (owner can also see admin items)
    if (item.adminOnly && user?.role !== 'admin' && user?.role !== 'owner') return false;
    return true;
  });

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="header-content max-w-full px-4">
          {/* Left Section - Logo & Nav */}
          <div className="flex items-center gap-3 lg:gap-6">
            {/* Mobile Menu Toggle - LEFT side on mobile */}
            <button
              className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 -ml-1"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="mobile-menu-toggle"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5 text-slate-600" />
              ) : (
                <Menu className="w-5 h-5 text-slate-600" />
              )}
            </button>

            {/* Hierarchy Toggle - Desktop */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setHierarchyOpen(!hierarchyOpen)}
              className="hidden lg:flex h-7 w-7 text-slate-600 dark:text-slate-300 hover:text-blue-600 border-slate-300 dark:border-slate-600"
              data-testid="hierarchy-toggle"
              title={hierarchyOpen ? "Hide Equipment Panel" : "Show Equipment Panel"}
            >
              {hierarchyOpen ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeftOpen className="w-4 h-4" />
              )}
            </Button>

            {/* Logo */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <img 
                src="/logo.png" 
                alt="AssetIQ" 
                className="w-8 h-8 rounded-lg"
              />
              <span className="text-base font-semibold text-slate-900 dark:text-white hidden sm:block" data-testid="app-logo">
                AssetIQ
              </span>
            </div>

            {/* Desktop Navigation - Scrollable on smaller screens */}
            <nav className="hidden md:flex items-center gap-0.5 overflow-x-auto scrollbar-hide max-w-[calc(100vw-400px)]" data-testid="desktop-nav">
              {/* All Nav Items (including Dashboard as direct link) */}
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === "/"}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 whitespace-nowrap ${
                      isActive 
                        ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300" 
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white"
                    }`
                  }
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-0.5 sm:gap-1 md:gap-2">
            {/* Notifications Bell */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 sm:h-8 sm:w-8 text-slate-600 hover:text-slate-900 relative"
                  data-testid="notifications-button"
                >
                  <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  {overdueCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[8px] sm:text-[9px] font-bold rounded-full min-w-[14px] sm:min-w-[16px] h-[14px] sm:h-[16px] flex items-center justify-center px-0.5">
                      {overdueCount > 9 ? "9+" : overdueCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="flex items-center justify-between">
                  <span>{t("notifications.overdueActions")}</span>
                  {overdueCount > 0 && (
                    <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-medium">
                      {overdueCount}
                    </span>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {overdueCount === 0 ? (
                  <div className="px-3 py-6 text-center text-slate-400 text-sm">
                    <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    {t("notifications.noOverdueActions")}
                  </div>
                ) : (
                  <>
                    <div className="max-h-64 overflow-y-auto">
                      {overdueActions.slice(0, 5).map((action) => (
                        <DropdownMenuItem
                          key={action.id}
                          className="cursor-pointer flex flex-col items-start gap-1 py-2"
                          onClick={() => navigate("/actions")}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="font-medium text-slate-800 truncate max-w-[200px]">
                              {action.title}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              action.priority === "critical" ? "bg-red-100 text-red-700" :
                              action.priority === "high" ? "bg-orange-100 text-orange-700" :
                              action.priority === "medium" ? "bg-yellow-100 text-yellow-700" :
                              "bg-slate-100 text-slate-600"
                            }`}>
                              {action.priority}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-red-600">
                            <Clock className="w-3 h-3" />
                            {formatOverdue(action.due_date)}
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </div>
                    {overdueCount > 5 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="cursor-pointer justify-center text-blue-600 font-medium"
                          onClick={() => navigate("/actions")}
                        >
                          {t("notifications.viewAll")} ({overdueCount})
                          <ChevronRight className="w-4 h-4 ml-1" />
                        </DropdownMenuItem>
                      </>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Offline Status Indicator */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 sm:h-8 sm:w-8 relative ${
                      isOnline 
                        ? totalPending > 0 ? "text-amber-500 hover:text-amber-600" : "text-green-500 hover:text-green-600"
                        : "text-red-500 hover:text-red-600"
                    }`}
                    onClick={isOnline && totalPending > 0 ? syncAllPending : undefined}
                    disabled={isSyncing || !isOnline}
                    data-testid="offline-status-button"
                  >
                    {isSyncing ? (
                      <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                    ) : isOnline ? (
                      totalPending > 0 ? (
                        <Cloud className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      ) : (
                        <Wifi className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      )
                    ) : (
                      <WifiOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    )}
                    {totalPending > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 bg-amber-500 text-white text-[8px] sm:text-[9px] font-bold rounded-full min-w-[14px] sm:min-w-[16px] h-[14px] sm:h-[16px] flex items-center justify-center px-0.5">
                        {totalPending > 9 ? "9+" : totalPending}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {isSyncing ? (
                    <p>Syncing data...</p>
                  ) : isOnline ? (
                    totalPending > 0 ? (
                      <p>Click to sync {totalPending} pending items</p>
                    ) : (
                      <p>Online - All data synced</p>
                    )
                  ) : (
                    <p>Offline - Data will sync when connected</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Language Switcher - Compact */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleLanguage}
                    className="h-6 w-6 sm:h-7 sm:w-7 text-[10px] sm:text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    data-testid="language-switcher"
                  >
                    <span className="font-medium">{language.toUpperCase()}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>{language === "en" ? "Switch to Dutch" : "Wissel naar Engels"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Feedback Button - Mobile in Header */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/settings/feedback")}
              className="sm:hidden h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              data-testid="mobile-feedback-button"
              aria-label="Send Feedback"
            >
              <MessageCircleQuestion className="w-4 h-4" />
            </Button>

            {/* Feedback Button - Desktop Prominent */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("/settings/feedback")}
                    className="hidden sm:flex h-7 sm:h-8 px-2 sm:px-3 text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200 hover:border-blue-300"
                    data-testid="feedback-button"
                    aria-label="Send Feedback"
                  >
                    <MessageCircleQuestion className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-1.5" />
                    <span className="hidden lg:inline text-xs sm:text-sm font-medium">{t("nav.feedback") || "Feedback"}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>{t("nav.feedback") || "Feedback"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Settings Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 sm:h-8 sm:w-8 text-slate-600 hover:text-slate-900"
                  data-testid="settings-menu-button"
                >
                  <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs">{t("nav.settings")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {settingsMenuItems.map((item) => (
                  <DropdownMenuItem 
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className="cursor-pointer text-sm"
                    data-testid={`settings-${item.path.replace(/\//g, '-').replace(/^-/, '')}-menu-item`}
                  >
                    <item.icon className="w-3.5 h-3.5 mr-2" />
                    {item.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 text-[10px] text-slate-400 flex items-center gap-1">
                  <Tag className="w-3 h-3" />
                  Version {APP_VERSION}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* User Avatar with Profile Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button 
                  className="flex items-center justify-center h-8 w-8 rounded-full overflow-hidden border-2 border-slate-200 hover:border-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  data-testid="user-avatar-button"
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={user?.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-sm">
                      {user?.name?.charAt(0)?.toUpperCase() || "U"}
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <div className="px-3 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full overflow-hidden border-2 border-white shadow-md flex-shrink-0">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={user?.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                          {user?.name?.charAt(0)?.toUpperCase() || "U"}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p className="font-semibold text-slate-900 truncate" data-testid="user-name">
                        {user?.name || "User"}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {user?.department || t("userManagement.department")}
                      </p>
                      <p className="text-xs text-blue-600 font-medium mt-1 truncate" title={user?.position || t("userManagement.position")}>
                        {user?.position || t("userManagement.position")}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="py-1">
                  <DropdownMenuItem 
                    onClick={logout}
                    className="cursor-pointer text-red-600 hover:text-red-700 hover:bg-red-50"
                    data-testid="logout-menu-item"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    {t("nav.logout")}
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t border-slate-200 p-4 bg-white max-h-[70vh] overflow-y-auto" data-testid="mobile-nav">
            {/* Hierarchy toggle for mobile */}
            <button
              onClick={() => { setHierarchyOpen(true); setMobileMenuOpen(false); }}
              className="flex items-center gap-3 p-3 rounded-lg text-slate-600 hover:bg-slate-50 w-full"
            >
              <PanelLeftOpen className="w-5 h-5" />
              Equipment Hierarchy
            </button>
            
            {/* Main Navigation Items */}
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 p-3 rounded-lg ${
                    isActive
                      ? "bg-blue-50 text-blue-600"
                      : "text-slate-600 hover:bg-slate-50"
                  }`
                }
                data-testid={`mobile-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </NavLink>
            ))}
            
            {/* Settings Section */}
            <div className="border-t border-slate-100 pt-2 mt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-2">Settings</p>
              {settingsMenuItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 p-3 rounded-lg ${
                      isActive
                        ? "bg-blue-50 text-blue-600"
                        : "text-slate-600 hover:bg-slate-50"
                    }`
                  }
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </NavLink>
              ))}
            </div>
            
            {/* Version Info */}
            <div className="border-t border-slate-100 pt-2 mt-2 px-3 pb-2">
              <p className="text-[10px] text-slate-400 flex items-center gap-1">
                <Tag className="w-3 h-3" />
                Version {APP_VERSION}
              </p>
            </div>
          </nav>
        )}
      </header>

      {/* Main Layout with Sidebar */}
      <div className="flex min-h-[calc(100vh-48px)]">
        {/* Equipment Hierarchy Sidebar - Desktop */}
        {hierarchyOpen && (
          <div className="hidden lg:block w-72 flex-shrink-0 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <div className="sticky top-12 h-[calc(100vh-48px)]">
              <EquipmentHierarchy 
                isOpen={true} 
                onClose={() => setHierarchyOpen(false)}
                isMobile={false}
                onAddThreat={handleAddObservationFromHierarchy}
              />
            </div>
          </div>
        )}

        {/* Mobile Hierarchy Sidebar (overlay) */}
        <div className="lg:hidden">
          <EquipmentHierarchy 
            isOpen={hierarchyOpen} 
            onClose={() => setHierarchyOpen(false)}
            isMobile={true}
            onAddThreat={handleAddObservationFromHierarchy}
          />
        </div>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>

      {/* Floating Action Button - Report Observation */}
      <button
        onClick={() => { setChatPrefillEquipment(null); setChatOpen(true); }}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all duration-200 z-30"
        style={{ boxShadow: '0 8px 24px -4px rgba(37, 99, 235, 0.5), 0 4px 12px -2px rgba(0, 0, 0, 0.25)' }}
        data-testid="fab-report-observation"
        title="Report Observation"
      >
        <Plus className="w-7 h-7" />
      </button>

      {/* Chat Sidebar */}
      <ChatSidebar isOpen={chatOpen} onClose={handleChatClose} prefillEquipment={chatPrefillEquipment} />

      {/* Info Dialog */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">{t("info.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* FMEA Risk Scoring */}
            <div>
              <h3 className="font-semibold text-slate-800 mb-2">{t("info.fmeaScoring")}</h3>
              <p className="text-sm text-slate-600 mb-3">{t("info.fmeaDescription")}</p>
              <div className="bg-slate-50 rounded-lg p-4 font-mono text-sm">
                <p className="text-slate-700">{t("info.formula")}</p>
                <p className="text-slate-500 mt-1">{t("info.maxScore")}</p>
              </div>
            </div>

            {/* Severity */}
            <div>
              <h4 className="font-medium text-slate-700 mb-2">{t("info.severity")}</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between p-2 bg-green-50 rounded"><span>{t("info.severity1to3")}</span><span className="font-medium text-green-700">1-3</span></div>
                <div className="flex justify-between p-2 bg-yellow-50 rounded"><span>{t("info.severity4to6")}</span><span className="font-medium text-yellow-700">4-6</span></div>
                <div className="flex justify-between p-2 bg-orange-50 rounded"><span>{t("info.severity7to9")}</span><span className="font-medium text-orange-700">7-9</span></div>
                <div className="flex justify-between p-2 bg-red-50 rounded"><span>{t("info.severity10")}</span><span className="font-medium text-red-700">10</span></div>
              </div>
            </div>

            {/* Occurrence */}
            <div>
              <h4 className="font-medium text-slate-700 mb-2">{t("info.occurrence")}</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between p-2 bg-green-50 rounded"><span>{t("info.occurrence1to3")}</span><span className="font-medium text-green-700">1-3</span></div>
                <div className="flex justify-between p-2 bg-yellow-50 rounded"><span>{t("info.occurrence4to6")}</span><span className="font-medium text-yellow-700">4-6</span></div>
                <div className="flex justify-between p-2 bg-orange-50 rounded"><span>{t("info.occurrence7to9")}</span><span className="font-medium text-orange-700">7-9</span></div>
                <div className="flex justify-between p-2 bg-red-50 rounded"><span>{t("info.occurrence10")}</span><span className="font-medium text-red-700">10</span></div>
              </div>
            </div>

            {/* Detection */}
            <div>
              <h4 className="font-medium text-slate-700 mb-2">{t("info.detection")}</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between p-2 bg-green-50 rounded"><span>{t("info.detection1to3")}</span><span className="font-medium text-green-700">1-3</span></div>
                <div className="flex justify-between p-2 bg-yellow-50 rounded"><span>{t("info.detection4to6")}</span><span className="font-medium text-yellow-700">4-6</span></div>
                <div className="flex justify-between p-2 bg-orange-50 rounded"><span>{t("info.detection7to9")}</span><span className="font-medium text-orange-700">7-9</span></div>
                <div className="flex justify-between p-2 bg-red-50 rounded"><span>{t("info.detection10")}</span><span className="font-medium text-red-700">10</span></div>
              </div>
            </div>

            {/* Risk Levels */}
            <div>
              <h4 className="font-medium text-slate-700 mb-2">{t("info.riskLevels")}</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between p-2 bg-red-100 text-red-800 rounded"><span>{t("common.critical")}</span><span className="font-medium">≥ 70</span></div>
                <div className="flex justify-between p-2 bg-orange-100 text-orange-800 rounded"><span>{t("common.high")}</span><span className="font-medium">50 - 69</span></div>
                <div className="flex justify-between p-2 bg-yellow-100 text-yellow-800 rounded"><span>{t("common.medium")}</span><span className="font-medium">30 - 49</span></div>
                <div className="flex justify-between p-2 bg-green-100 text-green-800 rounded"><span>{t("common.low")}</span><span className="font-medium">&lt; 30</span></div>
              </div>
            </div>

            {/* 4-Dimension Criticality System */}
            <div>
              <h4 className="font-medium text-slate-700 mb-2">{t("info.criticalityDimensions")}</h4>
              <p className="text-sm text-slate-600 mb-3">{t("info.criticalityDimensionsDesc")}</p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-3 p-2 bg-red-50 rounded">
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(i => <div key={i} className="w-4 h-3 bg-red-500 rounded-sm" />)}
                  </div>
                  <span className="flex-1 font-medium text-red-800">{t("info.safetyDimension")}</span>
                  <span className="text-red-600">{t("info.weight")}: 25</span>
                </div>
                <div className="flex items-center gap-3 p-2 bg-orange-50 rounded">
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(i => <div key={i} className="w-4 h-3 bg-orange-500 rounded-sm" />)}
                  </div>
                  <span className="flex-1 font-medium text-orange-800">{t("info.productionDimension")}</span>
                  <span className="text-orange-600">{t("info.weight")}: 20</span>
                </div>
                <div className="flex items-center gap-3 p-2 bg-green-50 rounded">
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(i => <div key={i} className="w-4 h-3 bg-green-500 rounded-sm" />)}
                  </div>
                  <span className="flex-1 font-medium text-green-800">{t("info.environmentalDimension")}</span>
                  <span className="text-green-600">{t("info.weight")}: 15</span>
                </div>
                <div className="flex items-center gap-3 p-2 bg-purple-50 rounded">
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(i => <div key={i} className="w-4 h-3 bg-purple-500 rounded-sm" />)}
                  </div>
                  <span className="flex-1 font-medium text-purple-800">{t("info.reputationDimension")}</span>
                  <span className="text-purple-600">{t("info.weight")}: 10</span>
                </div>
              </div>
              <div className="mt-3 p-3 bg-slate-100 rounded-lg">
                <p className="text-xs text-slate-600 font-mono">{t("info.criticalityFormula")}</p>
                <p className="text-xs text-slate-500 mt-1">{t("info.overallCriticalityDesc")}</p>
              </div>
            </div>

            {/* Quick Tips */}
            <div className="border-t pt-4">
              <h4 className="font-medium text-slate-700 mb-2">{t("info.quickTips")}</h4>
              <ul className="text-sm text-slate-600 space-y-1">
                <li>• {t("info.tip1")}</li>
                <li>• {t("info.tip2")}</li>
                <li>• {t("info.tip3")}</li>
                <li>• {t("info.tip4")}</li>
                <li>• {t("info.tip5")}</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Layout;
