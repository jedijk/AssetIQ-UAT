import { useState, useEffect, useCallback, useRef } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionsContext";
import { useUndo } from "../contexts/UndoContext";
import { useLanguage } from "../contexts/LanguageContext";
import { getBackendUrl } from "../lib/apiConfig";
import { AlertTriangle, LogOut, Menu, X, BookOpen, MessageSquare, Plus, PanelLeftOpen, PanelLeftClose, Settings, Building2, GitBranch, Undo2, ClipboardList, Info, LayoutDashboard, Users, BarChart3, Sliders, Bell, Clock, ChevronRight, Calendar, Activity, FileText, Brain, Wifi, WifiOff, RefreshCw, Cloud, ClipboardCheck, MessageCircleQuestion, Tag, Shield, Loader2 } from "lucide-react";
import AnimatedDrawer from "./animations/AnimatedDrawer";
import { springPresets } from "./animations/constants";

// App version - automatically read from package.json via REACT_APP_VERSION
const APP_VERSION = process.env.REACT_APP_VERSION || "2.5.1";
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
  const { hasPermission, canSeeNavItem } = usePermissions();
  const { canUndo, undo, isUndoing, getLastAction, undoCount } = useUndo();
  const { language, toggleLanguage, t } = useLanguage();
  const { isOnline, totalPending, isSyncing, syncAllPending } = useOfflineSync();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPrefillEquipment, setChatPrefillEquipment] = useState(null);
  const [hierarchyOpen, setHierarchyOpen] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [dismissedNotifications, setDismissedNotifications] = useState(false);
  
  // Pull-to-refresh state
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartY = useRef(0);
  const mainContentRef = useRef(null);
  const PULL_THRESHOLD = 80;

  // Track page views for user statistics
  usePageTracking();
  
  // Pull-to-refresh handler
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    // Invalidate all queries to refetch data
    await queryClient.invalidateQueries();
    // Small delay for visual feedback
    await new Promise(resolve => setTimeout(resolve, 500));
    setIsRefreshing(false);
    setPullDistance(0);
  }, [queryClient]);

  // Touch event handlers for pull-to-refresh
  useEffect(() => {
    const handleTouchStart = (e) => {
      // Only enable pull-to-refresh when at the top of the page
      if (window.scrollY === 0) {
        touchStartY.current = e.touches[0].clientY;
        setIsPulling(true);
      }
    };

    const handleTouchMove = (e) => {
      if (!isPulling || isRefreshing) return;
      
      const touchY = e.touches[0].clientY;
      const distance = touchY - touchStartY.current;
      
      // Only pull down, not up
      if (distance > 0 && window.scrollY === 0) {
        // Apply resistance to the pull
        const resistedDistance = Math.min(distance * 0.5, 120);
        setPullDistance(resistedDistance);
        
        // Prevent default scroll when pulling
        if (distance > 10) {
          e.preventDefault();
        }
      }
    };

    const handleTouchEnd = () => {
      if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
        handleRefresh();
      } else {
        setPullDistance(0);
      }
      setIsPulling(false);
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isPulling, isRefreshing, pullDistance, handleRefresh]);

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

  // Navigation Items with feature permissions
  const allNavItems = [
    { path: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
    { path: "/threats", label: t("nav.observations"), icon: AlertTriangle, feature: "observations" },
    { path: "/causal-engine", label: t("nav.causalEngine"), icon: GitBranch, desktopOnly: true, feature: "investigations" },
    { path: "/actions", label: t("nav.actions"), icon: ClipboardList, feature: "actions" },
    { path: "/my-tasks", label: t("nav.myTasks") || "My Tasks", icon: ClipboardCheck, feature: "tasks" },
    { path: "/library", label: t("nav.library"), icon: BookOpen, desktopOnly: true, feature: "library" },
  ];
  
  // Filter nav items based on device AND permissions
  const navItems = allNavItems.filter(item => {
    // Filter desktop-only items for mobile
    if (isMobileView && item.desktopOnly) return false;
    // Filter by permission if feature is specified
    if (item.feature && !canSeeNavItem(item.path)) return false;
    return true;
  });

  // Settings menu items with feature permissions
  const allSettingsMenuItems = [
    { path: "/equipment-manager", label: t("nav.equipmentManager"), icon: Building2, desktopOnly: true, feature: "equipment" },
    { path: "/tasks", label: t("taskScheduler.execution"), icon: Calendar, desktopOnly: true, feature: "tasks" },
    { path: "/form-submissions", label: "Form Submissions", icon: ClipboardCheck, desktopOnly: true, feature: "forms" },
    { path: "/decision-engine", label: t("decisionEngine.title"), icon: Brain, desktopOnly: true },
    { path: "/settings/user-management", label: t("nav.userManagement"), icon: Users, feature: "users" },
    { path: "/settings/risk-calculation", label: "Risk Calculation", icon: Sliders, adminOnly: true, desktopOnly: true },
    { path: "/settings/ai-usage", label: t("nav.aiUsage"), icon: Brain, adminOnly: true, desktopOnly: true },
    { path: "/settings/statistics", label: t("nav.statistics"), icon: BarChart3 },
    { path: "/settings/criticality-definitions", label: t("nav.criticalityDefinitions"), icon: Sliders, feature: "settings" },
    { path: "/settings/feedback", label: t("nav.feedback") || "Feedback", icon: MessageCircleQuestion, feature: "feedback" },
  ];
  
  // Filter settings items based on device, role, and permissions
  const settingsMenuItems = allSettingsMenuItems.filter(item => {
    // Filter desktop-only items for mobile
    if (isMobileView && item.desktopOnly) return false;
    // Filter owner-only items for non-owners
    if (item.ownerOnly && user?.role !== 'owner') return false;
    // Filter admin-only items for non-admins (owner can also see admin items)
    if (item.adminOnly && user?.role !== 'admin' && user?.role !== 'owner') return false;
    // Filter by permission if feature is specified
    if (item.feature && !canSeeNavItem(item.path)) return false;
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
            <motion.button
              className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 -ml-1"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="mobile-menu-toggle"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={springPresets.snappy}
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5 text-slate-600" />
              ) : (
                <Menu className="w-5 h-5 text-slate-600" />
              )}
            </motion.button>

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
                    `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap ${
                      isActive 
                        ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300" 
                        : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                    }`
                  }
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {({ isActive }) => (
                    <motion.div
                      className="flex items-center gap-1.5"
                      whileHover={{ scale: 1.03, y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      transition={springPresets.snappy}
                      style={{
                        backgroundColor: isActive ? undefined : "transparent",
                      }}
                    >
                      <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
                      {item.label}
                    </motion.div>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-0.5 sm:gap-1 md:gap-2">
            {/* Notifications Bell */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <motion.div
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  transition={springPresets.snappy}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 sm:h-8 sm:w-8 text-slate-600 hover:text-slate-900 relative"
                    data-testid="notifications-button"
                  >
                    <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    {overdueCount > 0 && !dismissedNotifications && (
                      <motion.span 
                        className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[8px] sm:text-[9px] font-bold rounded-full min-w-[14px] sm:min-w-[16px] h-[14px] sm:h-[16px] flex items-center justify-center px-0.5"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={springPresets.bouncy}
                      >
                        {overdueCount > 9 ? "9+" : overdueCount}
                      </motion.span>
                    )}
                  </Button>
                </motion.div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="flex items-center justify-between">
                  <span>{t("notifications.overdueActions")}</span>
                  <div className="flex items-center gap-2">
                    {overdueCount > 0 && (
                      <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-medium">
                        {overdueCount}
                      </span>
                    )}
                    {overdueCount > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDismissedNotifications(true);
                        }}
                        className="text-xs text-slate-500 hover:text-slate-700 underline"
                        data-testid="clear-notifications-btn"
                      >
                        {t("notifications.clearAll") || "Clear"}
                      </button>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {overdueCount === 0 || dismissedNotifications ? (
                  <div className="px-3 py-6 text-center text-slate-400 text-sm">
                    <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    {dismissedNotifications ? (t("notifications.cleared") || "Notifications cleared") : t("notifications.noOverdueActions")}
                    {dismissedNotifications && overdueCount > 0 && (
                      <button
                        onClick={() => setDismissedNotifications(false)}
                        className="block mx-auto mt-2 text-xs text-blue-600 hover:text-blue-700 underline"
                      >
                        {t("notifications.showAgain") || "Show notifications"}
                      </button>
                    )}
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
                  <motion.div
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    transition={springPresets.snappy}
                  >
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
                        <motion.span 
                          className="absolute -top-0.5 -right-0.5 bg-amber-500 text-white text-[8px] sm:text-[9px] font-bold rounded-full min-w-[14px] sm:min-w-[16px] h-[14px] sm:h-[16px] flex items-center justify-center px-0.5"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={springPresets.bouncy}
                        >
                          {totalPending > 9 ? "9+" : totalPending}
                        </motion.span>
                      )}
                    </Button>
                  </motion.div>
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
                  <motion.div
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    transition={springPresets.snappy}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggleLanguage}
                      className="h-6 w-6 sm:h-7 sm:w-7 text-[10px] sm:text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      data-testid="language-switcher"
                    >
                      <span className="font-medium">{language.toUpperCase()}</span>
                    </Button>
                  </motion.div>
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
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    transition={springPresets.snappy}
                  >
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
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>{t("nav.feedback") || "Feedback"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Settings Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <motion.div
                  whileHover={{ scale: 1.08, rotate: 15 }}
                  whileTap={{ scale: 0.92 }}
                  transition={springPresets.snappy}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 sm:h-8 sm:w-8 text-slate-600 hover:text-slate-900"
                    data-testid="settings-menu-button"
                  >
                    <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </Button>
                </motion.div>
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
                <motion.button 
                  className="flex items-center justify-center h-8 w-8 rounded-full overflow-hidden border-2 border-slate-200 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  data-testid="user-avatar-button"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  transition={springPresets.snappy}
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
                </motion.button>
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

        {/* Mobile Navigation - Animated Drawer */}
        <AnimatedDrawer
          isOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          side="left"
          width="280px"
          showCloseButton={false}
          className="pt-safe"
        >
          <nav className="p-4 space-y-1" data-testid="mobile-nav">
            {/* Hierarchy toggle for mobile */}
            <motion.button
              onClick={() => { setHierarchyOpen(true); setMobileMenuOpen(false); }}
              className="flex items-center gap-3 p-3 rounded-lg text-slate-600 hover:bg-slate-50 w-full"
              whileHover={{ scale: 1.02, x: 4 }}
              whileTap={{ scale: 0.98 }}
              transition={springPresets.snappy}
            >
              <PanelLeftOpen className="w-5 h-5" />
              Equipment Hierarchy
            </motion.button>
            
            {/* Main Navigation Items */}
            {navItems.map((item, index) => (
              <motion.div
                key={item.path}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05, ...springPresets.snappy }}
              >
                <NavLink
                  to={item.path}
                  end={item.path === "/"}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 p-3 rounded-lg transition-colors ${
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
              </motion.div>
            ))}
          </nav>
        </AnimatedDrawer>
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

        {/* Main Content with Page Transitions */}
        <main 
          ref={mainContentRef}
          className="flex-1 min-w-0 relative"
        >
          {/* Pull-to-refresh indicator - positioned absolutely */}
          {(pullDistance > 0 || isRefreshing) && (
            <div 
              className="absolute top-0 left-0 right-0 flex items-center justify-center bg-white/95 backdrop-blur-sm z-30 transition-all duration-200"
              style={{ 
                height: isRefreshing ? 48 : pullDistance,
              }}
            >
              {isRefreshing ? (
                <div className="flex items-center gap-2 text-blue-600">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm font-medium">Refreshing...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-slate-500">
                  <RefreshCw 
                    className={`w-5 h-5 transition-transform duration-200 ${pullDistance >= PULL_THRESHOLD ? 'rotate-180 text-blue-600' : ''}`} 
                  />
                  <span className={`text-sm ${pullDistance >= PULL_THRESHOLD ? 'text-blue-600 font-medium' : ''}`}>
                    {pullDistance >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull down to refresh'}
                  </span>
                </div>
              )}
            </div>
          )}
          
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{
              type: "tween",
              duration: 0.25,
              ease: [0.25, 0.1, 0.25, 1],
            }}
            className="h-full"
            style={{ 
              paddingTop: isRefreshing ? 48 : pullDistance,
              transition: 'padding-top 0.2s ease'
            }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>

      {/* Floating Action Button - Report Observation */}
      <motion.button
        onClick={() => { setChatPrefillEquipment(null); setChatOpen(true); }}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-blue-600 text-white flex items-center justify-center z-30"
        style={{ boxShadow: '0 8px 24px -4px rgba(37, 99, 235, 0.5), 0 4px 12px -2px rgba(0, 0, 0, 0.25)' }}
        whileHover={{ scale: 1.08, boxShadow: '0 12px 32px -4px rgba(37, 99, 235, 0.6), 0 6px 16px -2px rgba(0, 0, 0, 0.3)' }}
        whileTap={{ scale: 0.92 }}
        transition={springPresets.snappy}
        data-testid="fab-report-observation"
        title="Report Observation"
      >
        <Plus className="w-7 h-7" />
      </motion.button>

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
