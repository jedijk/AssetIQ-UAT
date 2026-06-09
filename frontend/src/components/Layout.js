import { useState, useEffect, useCallback, useRef } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionsContext";
import { useUndo } from "../contexts/UndoContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useRolePreview } from "../contexts/RolePreviewContext";
import RolePreviewBanner from "./layout/RolePreviewBanner";
import RolePreviewDialog from "./layout/RolePreviewDialog";
import { getBackendUrl } from "../lib/apiConfig";
import { api } from "../lib/api";
import { AlertTriangle, LogOut, Menu, X, BookOpen, MessageSquare, Plus, PanelLeftOpen, PanelLeftClose, Settings, Building2, GitBranch, Undo2, ClipboardList, Info, LayoutDashboard, Users, BarChart3, Sliders, Bell, Clock, ChevronRight, Calendar, Activity, FileText, Brain, Wifi, WifiOff, RefreshCw, Cloud, ClipboardCheck, MessageCircleQuestion, Tag, Shield, Loader2, Server, HelpCircle, User, Camera, Briefcase, Save, Database, ScrollText, Gauge, Sparkles } from "lucide-react";
import AnimatedDrawer from "./animations/AnimatedDrawer";
import { pageTransition, pageVariants, springPresets } from "./animations/constants";
import IntroOverlay, { useIntroOverlay } from "./IntroOverlay";
import { useNotificationTriggers } from "../hooks/useNotificationTriggers";
import { useAutoEnableNotifications } from "../hooks/useAutoEnableNotifications";
import { publicAssetUrl } from "../lib/assetUrl";
import LayoutHeader from "./layout/LayoutHeader";
import ProfileEditDialog from "./layout/ProfileEditDialog";
import {
  buildNavItems,
  buildSettingsMenuItems,
  filterNavItems,
  filterSettingsMenuItems,
} from "./layout/layoutNavConfig";

// App version - automatically read from package.json via REACT_APP_VERSION
const APP_VERSION = process.env.REACT_APP_VERSION || "3.7.3";
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
  DialogFooter,
  DialogDescription,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "./ui/avatar";
import { Switch } from "./ui/switch";
import { toast } from "sonner";
import ChatSidebar from "./ChatSidebar";
import ImageEditor from "./ImageEditor";
import EquipmentHierarchy from "./EquipmentHierarchy";
import ObservationTour from "./ObservationTour";
import { actionsAPI, feedbackAPI } from "../lib/api";
import { useOfflineSync } from "../hooks/useOfflineSync";
import { usePageTracking } from "../hooks/useAnalyticsTracking";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { useCapabilities } from "../core/performance";
import { notify, getNotificationSettings, isNotificationSupported, getPermissionStatus } from "../services/notificationService";

const Layout = () => {
  const { user, logout, mustChangePassword, mustAcceptTerms } = useAuth();
  const { hasPermission, canSeeNavItem } = usePermissions();
  const { canUndo, undo, isUndoing, getLastAction, undoCount } = useUndo();
  const { language, setLanguage, toggleLanguage, t } = useLanguage();
  const { isOnline, totalPending, isSyncing, syncAllPending } = useOfflineSync();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const caps = useCapabilities();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Ensure only one header dropdown menu is open at once (mobile + desktop).
  const [openHeaderMenu, setOpenHeaderMenu] = useState(null); // "notifications" | "help" | "settings" | "profile" | null
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPrefillEquipment, setChatPrefillEquipment] = useState(null);
  const [chatPrefillMessage, setChatPrefillMessage] = useState(null);
  const [hierarchyOpen, setHierarchyOpen] = useState(typeof window !== 'undefined' && window.innerWidth >= 1024);
  const [hierarchySearchQuery, setHierarchySearchQuery] = useState("");
  const [hierarchyWidth, setHierarchyWidth] = useState(288); // 288px = w-72 default
  const [isResizing, setIsResizing] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const avatarObjectUrlRef = useRef(null);
  const [dismissedNotifications, setDismissedNotifications] = useState(false);
  const [observationTourOpen, setObservationTourOpen] = useState(false);
  
  // Profile edit dialog state
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileLiteModeForced, setProfileLiteModeForced] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: "",
    position: "",
    phone: "",
    location: "",
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const profileFileInputRef = useRef(null);
  
  // Image editor state for profile photo
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [selectedImageSrc, setSelectedImageSrc] = useState(null);
  
  // Introduction overlay
  const { showIntro, dismissIntro, resetIntro } = useIntroOverlay();
  
  // Pull-to-refresh state
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartY = useRef(0);
  const mainContentRef = useRef(null);
  const PULL_THRESHOLD = 80;

  // Track page views for user statistics
  usePageTracking();
  
  // Version check - one-time forced refresh for users on older versions
  useEffect(() => {
    const STORAGE_KEY = `assetiq_updated_${APP_VERSION}`;
    if (localStorage.getItem(STORAGE_KEY) === "true") return;
    
    // Only run when user is authenticated
    if (!user) return;

    const checkVersion = async () => {
      try {
        const response = await fetch(`${getBackendUrl()}/api/health`);
        if (!response.ok) return;
        const data = await response.json();
        
        if (data.version === APP_VERSION) {
          localStorage.setItem(STORAGE_KEY, "true");
        }
      } catch (error) {
        console.log('Version check failed:', error);
      }
    };
    
    const timeout = setTimeout(checkVersion, 3000);
    return () => clearTimeout(timeout);
  }, [user]);
  
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
    // iOS Safari touch handling is extremely sensitive to document-level
    // preventDefault on touchmove and can degrade tap/scroll responsiveness.
    // Use native iOS pull-to-refresh instead (Safari provides it).
    const ua = typeof navigator !== "undefined" ? (navigator.userAgent || "") : "";
    const isIOS = /iPhone|iPad|iPod/i.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
    if (isIOS) return;

    let startScrollY = 0;
    
    const handleTouchStart = (e) => {
      // Store the initial scroll position and touch position
      startScrollY = window.scrollY;
      touchStartY.current = e.touches[0].clientY;
      
      // Only enable pull-to-refresh when:
      // 1. Truly at the top (scrollY === 0)
      // 2. Touch starts in the top 150px of the viewport (near header)
      const touchStartInTopArea = e.touches[0].clientY < 150;
      
      if (startScrollY === 0 && touchStartInTopArea) {
        setIsPulling(true);
      } else {
        setIsPulling(false);
      }
    };

    const handleTouchMove = (e) => {
      // Exit early if not pulling or already refreshing
      if (!isPulling || isRefreshing) return;
      
      // Double-check we're still at the top of the page
      // This prevents triggering when scrolling back up
      if (window.scrollY > 0) {
        setPullDistance(0);
        setIsPulling(false);
        return;
      }
      
      const touchY = e.touches[0].clientY;
      const distance = touchY - touchStartY.current;
      
      // Only pull down (positive distance), not up
      // AND only when we started at the very top
      if (distance > 0 && window.scrollY === 0 && startScrollY === 0) {
        // Apply resistance to the pull
        const resistedDistance = Math.min(distance * 0.5, 120);
        setPullDistance(resistedDistance);
        
        // Prevent default scroll when pulling down
        if (distance > 10) {
          e.preventDefault();
        }
      } else {
        // Reset if scrolling up or not at top
        if (pullDistance > 0) {
          setPullDistance(0);
        }
      }
    };

    const handleTouchEnd = () => {
      if (pullDistance >= PULL_THRESHOLD && !isRefreshing && window.scrollY === 0) {
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
        const AUTH_MODE = process.env.REACT_APP_AUTH_MODE || "bearer"; // "bearer" | "cookie"
        const token = AUTH_MODE === "bearer" ? localStorage.getItem("token") : null;
        const backendUrl = getBackendUrl();
        
        // Only fetch if we have a valid backend URL configured
        if (!backendUrl || !backendUrl.startsWith('http')) {
          setAvatarUrl(null);
          return;
        }

        const avatarUrl = AUTH_MODE === "cookie"
          ? `${backendUrl}/api/users/${user.id}/avatar`
          : `${backendUrl}/api/users/${user.id}/avatar?token=${token}`;

        const response = await fetch(avatarUrl, {
          credentials: AUTH_MODE === "cookie" ? "include" : "omit",
          headers: {
            ...(AUTH_MODE === "bearer" && token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        
        if (response.ok) {
          const blob = await response.blob();
          const nextUrl = URL.createObjectURL(blob);
          // Revoke previous object URL to prevent memory growth.
          if (avatarObjectUrlRef.current) {
            try { URL.revokeObjectURL(avatarObjectUrlRef.current); } catch (_e) {}
          }
          avatarObjectUrlRef.current = nextUrl;
          setAvatarUrl(nextUrl);
        } else {
          // Avatar not found - will use initials fallback
          setAvatarUrl(null);
        }
      } catch (err) {
        // Network error or avatar not available - use initials fallback
        setAvatarUrl(null);
      }
    };
    fetchAvatar();
    return () => {
      if (avatarObjectUrlRef.current) {
        try { URL.revokeObjectURL(avatarObjectUrlRef.current); } catch (_e) {}
        avatarObjectUrlRef.current = null;
      }
    };
  }, [user?.id]);

  useEffect(() => {
    if (!profileDialogOpen || user?.role !== "owner") return;
    try {
      setProfileLiteModeForced(localStorage.getItem("forceLiteMode") === "true");
    } catch (_e) {
      setProfileLiteModeForced(false);
    }
  }, [profileDialogOpen, user?.role]);

  // Open profile dialog and populate form
  const openProfileDialog = useCallback(() => {
    setProfileForm({
      name: user?.name || "",
      position: user?.position || "",
      phone: user?.phone || "",
      location: user?.location || "",
    });
    setProfileDialogOpen(true);
  }, [user]);

  const handleProfileLiteModeChange = useCallback(
    (checked) => {
      try {
        if (checked) {
          localStorage.setItem("forceLiteMode", "true");
          localStorage.removeItem("forceFullMode");
        } else {
          localStorage.removeItem("forceLiteMode");
          localStorage.setItem("forceFullMode", "true");
        }
        setProfileLiteModeForced(checked);
        toast.success(t("profile.liteModeReloading") || "Applying performance mode…");
        window.setTimeout(() => window.location.reload(), 120);
      } catch (_e) {
        toast.error(t("profile.liteModeError") || "Could not update performance preference.");
      }
    },
    [t]
  );

  // Save profile changes
  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      await api.patch("/users/me/profile", profileForm);
      // Refresh user data
      queryClient.invalidateQueries({ queryKey: ["user"] });
      toast.success(t("profile.updateSuccess") || "Profile updated successfully");
      setProfileDialogOpen(false);
    } catch (error) {
      console.error("Failed to save profile:", error);
      toast.error(error.message || "Failed to update profile");
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Handle avatar file selection - opens image editor
  const handleProfileAvatarSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    // Create URL for the image and open editor
    const imageUrl = URL.createObjectURL(file);
    setSelectedImageSrc(imageUrl);
    setImageEditorOpen(true);
    
    // Reset the file input
    if (profileFileInputRef.current) {
      profileFileInputRef.current.value = "";
    }
  };

  // Handle edited image save from ImageEditor
  const handleEditedImageSave = async (editedFile) => {
    setImageEditorOpen(false);
    setIsUploadingAvatar(true);
    
    try {
      const formData = new FormData();
      formData.append("file", editedFile);

      await api.post("/users/me/avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const backendUrl = getBackendUrl();
      const AUTH_MODE = process.env.REACT_APP_AUTH_MODE || "bearer";
      const token = localStorage.getItem("token");
      const avatarFetchUrl = AUTH_MODE === "cookie"
        ? `${backendUrl}/api/users/${user.id}/avatar?t=${Date.now()}`
        : `${backendUrl}/api/users/${user.id}/avatar?token=${token}&t=${Date.now()}`;

      const avatarResponse = await fetch(avatarFetchUrl, {
        credentials: AUTH_MODE === "cookie" ? "include" : "omit",
        headers: {
          ...(AUTH_MODE === "bearer" && token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      
      if (avatarResponse.ok) {
        const blob = await avatarResponse.blob();
        if (avatarUrl) URL.revokeObjectURL(avatarUrl);
        setAvatarUrl(URL.createObjectURL(blob));
      }

      toast.success(t("profile.photoUpdated") || "Photo updated successfully");
    } catch (error) {
      console.error("Failed to upload avatar:", error);
      toast.error(error.message || "Failed to upload avatar");
    } finally {
      setIsUploadingAvatar(false);
      // Clean up the selected image URL
      if (selectedImageSrc) {
        URL.revokeObjectURL(selectedImageSrc);
        setSelectedImageSrc(null);
      }
    }
  };

  // Close image editor and cleanup
  const handleImageEditorClose = () => {
    setImageEditorOpen(false);
    if (selectedImageSrc) {
      URL.revokeObjectURL(selectedImageSrc);
      setSelectedImageSrc(null);
    }
  };

  // Trigger push notifications for overdue actions and other events
  useNotificationTriggers({
    actions: [],
    tasks: [],
    observations: [],
    enabled: !!user,
  });

  // Auto-request notification permission on login
  useAutoEnableNotifications();

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

  // Operator view toggle (owner testing)
  const [operatorViewEnabled, setOperatorViewEnabled] = useState(
    () => localStorage.getItem("operatorViewEnabled") === "true"
  );
  const toggleOperatorView = () => {
    const next = !operatorViewEnabled;
    setOperatorViewEnabled(next);
    localStorage.setItem("operatorViewEnabled", String(next));
    window.dispatchEvent(new CustomEvent("operatorViewChanged"));
  };

  const { isOwner, isPreviewing, previewRoleLabel } = useRolePreview();
  const [rolePreviewDialogOpen, setRolePreviewDialogOpen] = useState(false);

  // Listen for custom events from OperatorLandingPage
  useEffect(() => {
    const handleOpenChat = () => { setChatPrefillEquipment(null); setChatOpen(true); };
    const handleOpenHierarchy = () => setHierarchyOpen(true);
    const handleOpenHierarchyWithSearch = (event) => {
      const { query } = event.detail || {};
      setHierarchyOpen(true);
      if (query) {
        setHierarchySearchQuery(query);
      }
    };
    window.addEventListener("open-chat", handleOpenChat);
    window.addEventListener("open-hierarchy", handleOpenHierarchy);
    window.addEventListener("open-hierarchy-with-search", handleOpenHierarchyWithSearch);
    return () => {
      window.removeEventListener("open-chat", handleOpenChat);
      window.removeEventListener("open-hierarchy", handleOpenHierarchy);
      window.removeEventListener("open-hierarchy-with-search", handleOpenHierarchyWithSearch);
    };
  }, []);

  // Auto-collapse hierarchy on Equipment Manager page and Settings pages
  useEffect(() => {
    if (location.pathname === "/equipment-manager" || location.pathname.startsWith("/settings")) {
      setHierarchyOpen(false);
    }
  }, [location.pathname]);

  // Handle hierarchy panel resize
  const handleResizeMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
    
    const startX = e.clientX;
    const startWidth = hierarchyWidth;
    
    const handleMouseMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.min(Math.max(startWidth + delta, 200), 500); // Min 200px, Max 500px
      setHierarchyWidth(newWidth);
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [hierarchyWidth]);

  const lastAction = getLastAction();

  const navItems = filterNavItems(buildNavItems(t), { isMobileView, canSeeNavItem });
  const settingsMenuItems = filterSettingsMenuItems(buildSettingsMenuItems(t), {
    isMobileView,
    user,
    canSeeNavItem,
    operatorViewEnabled,
  });

  // True when operator landing is active (mobile + operator mode)
  const isOperatorActive = isMobileView && (user?.role === "operator" || operatorViewEnabled);

  return (
    <div className="app-container">
      {/* Header */}
      <LayoutHeader
        isOperatorActive={isOperatorActive}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        setOpenHeaderMenu={setOpenHeaderMenu}
        openHeaderMenu={openHeaderMenu}
        hierarchyOpen={hierarchyOpen}
        setHierarchyOpen={setHierarchyOpen}
        navigate={navigate}
        navItems={navItems}
        settingsMenuItems={settingsMenuItems}
        isMobileView={isMobileView}
        language={language}
        setLanguage={setLanguage}
        t={t}
        resetIntro={resetIntro}
        setObservationTourOpen={setObservationTourOpen}
        user={user}
        avatarUrl={avatarUrl}
        openProfileDialog={openProfileDialog}
        logout={logout}
        operatorViewEnabled={operatorViewEnabled}
        toggleOperatorView={toggleOperatorView}
        isOwner={isOwner}
        isPreviewing={isPreviewing}
        previewRoleLabel={previewRoleLabel}
        onOpenRolePreview={() => setRolePreviewDialogOpen(true)}
        dismissedNotifications={dismissedNotifications}
        setDismissedNotifications={setDismissedNotifications}
      />

      <RolePreviewBanner t={t} />
      <RolePreviewDialog
        open={rolePreviewDialogOpen}
        onOpenChange={setRolePreviewDialogOpen}
        t={t}
      />


      {/* Main Layout with Sidebar */}
      <div className={`flex min-h-[calc(100vh-48px)] ${isResizing ? 'select-none cursor-col-resize' : ''}`}>
        {/* Equipment Hierarchy Sidebar - Desktop */}
        {hierarchyOpen && (
          <>
            <div 
              className="hidden lg:block flex-shrink-0 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              data-testid="hierarchy-sidebar"
              style={{ width: `${hierarchyWidth}px` }}
            >
              <div className="sticky top-12 h-[calc(100vh-48px)]">
                <EquipmentHierarchy 
                  isOpen={true} 
                  onClose={() => setHierarchyOpen(false)}
                  isMobile={false}
                  onAddThreat={handleAddObservationFromHierarchy}
                  initialSearchQuery={hierarchySearchQuery}
                  onSearchQueryUsed={() => setHierarchySearchQuery("")}
                />
              </div>
            </div>
            {/* Resize Handle - Separate element */}
            <div
              className="hidden lg:flex w-1.5 flex-shrink-0 cursor-col-resize items-center justify-center hover:bg-blue-100 active:bg-blue-200 transition-colors group"
              onMouseDown={handleResizeMouseDown}
              title="Drag to resize"
            >
              <div className="w-0.5 h-8 bg-slate-300 group-hover:bg-blue-400 group-active:bg-blue-500 rounded-full transition-colors" />
            </div>
          </>
        )}

        {/* Mobile Hierarchy Sidebar (overlay) */}
        <div className="lg:hidden">
          <EquipmentHierarchy 
            isOpen={hierarchyOpen} 
            onClose={() => setHierarchyOpen(false)}
            isMobile={true}
            onAddThreat={handleAddObservationFromHierarchy}
            initialSearchQuery={hierarchySearchQuery}
            onSearchQueryUsed={() => setHierarchySearchQuery("")}
          />
        </div>

        {/* Main Content with Page Transitions */}
        <main 
          ref={mainContentRef}
          className={`flex-1 min-w-0 relative transition-[padding] duration-200 ease-out ${
            chatOpen ? "sm:pr-[400px]" : ""
          }`}
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
          
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageTransition}
              className="h-full"
              style={{
                paddingTop: isRefreshing ? 48 : pullDistance,
                transition: "padding-top 0.2s ease",
              }}
            >
              <AppErrorBoundary
                context="RouteOutlet"
                title="This page crashed"
                subtitle="Something went wrong while rendering this screen. Tap reload to recover."
              >
                <Outlet />
              </AppErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Floating Action Button - Report Observation */}
      <motion.button
        onClick={() => { setChatPrefillEquipment(null); setChatOpen(true); }}
        className={`fixed bottom-6 h-14 w-14 rounded-full bg-blue-600 text-white flex items-center justify-center z-30 transition-all duration-200 ease-out right-6 ${
          chatOpen ? "sm:right-[424px] sm:z-[230]" : ""
        }`}
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
      <ChatSidebar 
        isOpen={chatOpen} 
        onClose={handleChatClose} 
        prefillEquipment={chatPrefillEquipment}
        prefillMessage={chatPrefillMessage}
      />
      
      {/* Observation Tour */}
      <ObservationTour
        isOpen={observationTourOpen}
        onClose={() => setObservationTourOpen(false)}
        setChatOpen={setChatOpen}
        setChatPrefillMessage={setChatPrefillMessage}
        setHierarchyOpen={setHierarchyOpen}
      />

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

      <ProfileEditDialog
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
        user={user}
        avatarUrl={avatarUrl}
        profileForm={profileForm}
        setProfileForm={setProfileForm}
        profileLiteModeForced={profileLiteModeForced}
        onLiteModeChange={handleProfileLiteModeChange}
        isSavingProfile={isSavingProfile}
        isUploadingAvatar={isUploadingAvatar}
        onSaveProfile={handleSaveProfile}
        profileFileInputRef={profileFileInputRef}
        onProfileAvatarSelect={handleProfileAvatarSelect}
        imageEditorOpen={imageEditorOpen}
        onImageEditorClose={handleImageEditorClose}
        selectedImageSrc={selectedImageSrc}
        onEditedImageSave={handleEditedImageSave}
      />

      {/* Introduction Overlay - only show after password change and terms acceptance is complete */}
      {showIntro && !mustChangePassword && !mustAcceptTerms && !isOperatorActive && (
        <IntroOverlay 
          onComplete={dismissIntro}
          onSkip={dismissIntro}
        />
      )}
    </div>
  );
};

export default Layout;
