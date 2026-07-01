import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Menu, X, PanelLeftOpen, PanelLeftClose, Settings, HelpCircle, LogOut, User, Shield, Eye, Building2,
  Info, MessageCircleQuestion, Tag, Sparkles, Route,
} from "lucide-react";
import AnimatedDrawer from "../animations/AnimatedDrawer";
import { springPresets } from "../animations/constants";
import { publicAssetUrl } from "../../lib/assetUrl";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import LayoutNotificationsMenu from "./LayoutNotificationsMenu";
import EquipmentUnitFilterSelect from "./EquipmentUnitFilterSelect";
import DisciplineFilterSelect from "./DisciplineFilterSelect";

const APP_VERSION = process.env.REACT_APP_VERSION || "3.7.7";

export default function LayoutHeader({
  isOperatorActive,
  mobileMenuOpen,
  setMobileMenuOpen,
  setOpenHeaderMenu,
  openHeaderMenu,
  hierarchyOpen,
  setHierarchyOpen,
  navigate,
  navItems,
  settingsMenuItems,
  isMobileView,
  chatOpen = false,
  language,
  setLanguage,
  t,
  resetIntro,
  setObservationTourOpen,
  setProgressObservationTourOpen,
  user,
  avatarUrl,
  openProfileDialog,
  logout,
  operatorViewEnabled,
  toggleOperatorView,
  isOwner,
  isPreviewing,
  previewRoleLabel,
  onOpenRolePreview,
  onOpenTenantSwitcher,
  isViewingOtherTenant,
  activeTenantLabel,
  dismissedNotifications,
  setDismissedNotifications,
}) {
  const navItemIsActive = (item) => (_, loc) => {
    if (item.activePrefix) {
      return loc.pathname === item.activePrefix || loc.pathname.startsWith(`${item.activePrefix}/`);
    }
    return loc.pathname === item.path || (item.path !== "/" && loc.pathname.startsWith(`${item.path}/`));
  };

  return (
    <header
      className={`app-header bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 pointer-events-auto ${
        chatOpen && isMobileView ? "z-[230]" : ""
      }`}
    >
        <div className="header-content relative max-w-full px-4">
          {/* Left Section - Logo & Nav */}
          <div className="flex items-center gap-2 sm:gap-3 lg:gap-6 min-w-0 flex-1 overflow-hidden">
            {/* Mobile Menu Toggle - LEFT side on mobile */}
            {!isOperatorActive && (
            <motion.button
              className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 -ml-1"
              onClick={() => {
                setOpenHeaderMenu(null);
                // If the equipment hierarchy overlay is open on mobile,
                // close it when opening the hamburger menu.
                setHierarchyOpen(false);
                setMobileMenuOpen(!mobileMenuOpen);
              }}
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
            )}

            {/* Hierarchy Toggle - Desktop */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setHierarchyOpen(!hierarchyOpen)}
              className="hidden lg:flex h-7 w-7 text-slate-600 dark:text-slate-300 hover:text-blue-600 border-slate-300 dark:border-slate-600"
              data-testid="hierarchy-toggle"
              title={hierarchyOpen ? t("equipment.hideEquipmentPanel") : t("equipment.showEquipmentPanel")}
            >
              {hierarchyOpen ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeftOpen className="w-4 h-4" />
              )}
            </Button>

            {/* Logo — in simple mode, also closes equipment overlay to return home */}
            <div
              className="flex items-center gap-2 flex-shrink-0 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                if (hierarchyOpen) {
                  setHierarchyOpen(false);
                }
                navigate("/dashboard", { state: null });
              }}
              data-testid="app-logo-link"
              role="button"
              tabIndex={0}
              aria-label={isOperatorActive ? t("simpleMode.home") || "Home" : "AssetIQ Dashboard"}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (hierarchyOpen) {
                    setHierarchyOpen(false);
                  }
                  navigate("/dashboard", { state: null });
                }
              }}
            >
              <span className="brand-logo-plate inline-flex shrink-0 overflow-hidden rounded-lg ring-1 ring-black/15 dark:ring-white/20">
                <img
                  src={publicAssetUrl("/logo.png")}
                  alt="AssetIQ"
                  className="w-8 h-8 block object-cover"
                />
              </span>
              <span className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white truncate" data-testid="app-logo">
                <span>Asset</span>
                <span className="text-blue-600 dark:text-blue-400">IQ</span>
              </span>
            </div>

            {/* Desktop Navigation - Scrollable on smaller screens */}
            <nav className="hidden md:flex items-center gap-0.5 overflow-x-auto scrollbar-hide max-w-[calc(100vw-400px)]" data-testid="desktop-nav">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === "/"}
                  isActive={navItemIsActive(item)}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap ${
                      isActive 
                        ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300" 
                        : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                    }`
                  }
                  data-testid={`nav-${item.navTestId || String(item.label || "").toLowerCase().replace(/\s+/g, "-")}`}
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

          {/* Right Side - packed cluster, never grows/shrinks into logo */}
          <div className="flex items-center flex-nowrap shrink-0 ml-auto gap-0.5 sm:gap-1 md:gap-2">
            <LayoutNotificationsMenu
              open={openHeaderMenu === "notifications"}
              onOpenChange={(open) => setOpenHeaderMenu(open ? "notifications" : null)}
              dismissedNotifications={dismissedNotifications}
              setDismissedNotifications={setDismissedNotifications}
            />

            {/* Language Switcher - Compact */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 sm:h-7 sm:w-7 text-[10px] sm:text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-transform hover:scale-105 active:scale-95"
                    data-testid="language-switcher"
                    title={t("tooltips.changeLanguage")}
                  >
                    <span className="font-medium">{language.toUpperCase()}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40" data-testid="language-switcher-menu">
                  <DropdownMenuLabel className="text-xs">Language / Sprache</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => setLanguage("en")}
                    className={`cursor-pointer ${language === "en" ? "bg-blue-50" : ""}`}
                    data-testid="language-option-en"
                  >
                    <span className="mr-2">🇬🇧</span> English
                    {language === "en" && <span className="ml-auto text-blue-600">✓</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => setLanguage("nl")}
                    className={`cursor-pointer ${language === "nl" ? "bg-blue-50" : ""}`}
                    data-testid="language-option-nl"
                  >
                    <span className="mr-2">🇳🇱</span> Nederlands
                    {language === "nl" && <span className="ml-auto text-blue-600">✓</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => setLanguage("de")}
                    className={`cursor-pointer ${language === "de" ? "bg-blue-50" : ""}`}
                    data-testid="language-option-de"
                  >
                    <span className="mr-2">🇩🇪</span> Deutsch
                    {language === "de" && <span className="ml-auto text-blue-600">✓</span>}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

            {/* Help Button */}
            <DropdownMenu
              open={openHeaderMenu === "help"}
              onOpenChange={(open) => setOpenHeaderMenu(open ? "help" : null)}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 sm:h-8 sm:w-8 text-slate-600 hover:text-slate-900 hover:scale-105 active:scale-95 transition-transform"
                  data-testid="help-menu-button"
                >
                  <HelpCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs">Help</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {!isOperatorActive && (
                <DropdownMenuItem 
                  onClick={resetIntro}
                  className="cursor-pointer text-sm"
                  data-testid="replay-tour-menu-item"
                >
                  <Info className="w-3.5 h-3.5 mr-2" />
                  Replay Tour
                </DropdownMenuItem>
                )}
                {setObservationTourOpen && (
                <DropdownMenuItem
                  onClick={() => setObservationTourOpen(true)}
                  className="cursor-pointer text-sm"
                  data-testid="observation-tour-menu-item"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-2 text-blue-500" />
                  {t("observationTour.menuLabel")}
                </DropdownMenuItem>
                )}
                {!isOperatorActive && setProgressObservationTourOpen && (
                <DropdownMenuItem
                  onClick={() => setProgressObservationTourOpen(true)}
                  className="cursor-pointer text-sm"
                  data-testid="progress-observation-tour-menu-item"
                >
                  <Route className="w-3.5 h-3.5 mr-2 text-purple-500" />
                  {t("progressObservationTour.menuLabel")}
                </DropdownMenuItem>
                )}
                <DropdownMenuItem 
                  onClick={() => navigate("/settings/feedback")}
                  className="cursor-pointer text-sm"
                >
                  <MessageCircleQuestion className="w-3.5 h-3.5 mr-2" />
                  Send Feedback
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Settings - Navigate to /settings on desktop, dropdown on mobile */}
            {isMobileView ? (
              <DropdownMenu
                open={openHeaderMenu === "settings"}
                onOpenChange={(open) => setOpenHeaderMenu(open ? "settings" : null)}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 sm:h-8 sm:w-8 text-slate-600 hover:text-slate-900 transition-transform hover:scale-105 hover:rotate-12 active:scale-95"
                    data-testid="settings-menu-button"
                  >
                    <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 p-0 flex flex-col max-h-[min(70vh,24rem)] overflow-hidden">
                  <div className="flex-1 min-h-0 overflow-y-auto p-1">
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
                  </div>
                  <DropdownMenuSeparator className="m-0" />
                  <div className="flex-shrink-0 px-2 py-1.5 text-[10px] text-slate-400 flex items-center gap-1 bg-popover border-t border-slate-100">
                    <Tag className="w-3 h-3 shrink-0" />
                    <span className="truncate">Version {APP_VERSION}</span>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <motion.div
                whileHover={{ scale: 1.08, rotate: 15 }}
                whileTap={{ scale: 0.92 }}
                transition={springPresets.snappy}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 sm:h-8 sm:w-8 text-slate-600 hover:text-slate-900"
                  onClick={() => navigate("/settings")}
                  data-testid="settings-menu-button"
                >
                  <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </Button>
              </motion.div>
            )}

            {/* User Avatar with Profile Dropdown */}
            <DropdownMenu
              open={openHeaderMenu === "profile"}
              onOpenChange={(open) => setOpenHeaderMenu(open ? "profile" : null)}
            >
              <DropdownMenuTrigger asChild>
                <button 
                  className="flex items-center justify-center h-8 w-8 rounded-full overflow-hidden border-2 border-slate-200 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-transform hover:scale-110 active:scale-95"
                  data-testid="user-avatar-button"
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={user?.name}
                      className="h-full w-full object-cover"
                      onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                    />
                  ) : null}
                  <div className={`h-full w-full bg-gradient-to-br from-blue-500 to-indigo-600 items-center justify-center text-white font-semibold text-sm ${avatarUrl ? 'hidden' : 'flex'}`}>
                    {user?.name?.split(' ').map(n => n.charAt(0)).join('').toUpperCase().slice(0, 2) || "U"}
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <div className="px-3 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full overflow-hidden border-2 border-white shadow-md flex-shrink-0">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={user?.name}
                          className="h-full w-full object-cover"
                          onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                        />
                      ) : null}
                      <div className={`h-full w-full bg-gradient-to-br from-blue-500 to-indigo-600 items-center justify-center text-white font-bold text-lg ${avatarUrl ? 'hidden' : 'flex'}`}>
                        {user?.name?.split(' ').map(n => n.charAt(0)).join('').toUpperCase().slice(0, 2) || "U"}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p className="font-semibold text-slate-900 truncate" data-testid="user-name">
                        {user?.name || "User"}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {user?.email}
                      </p>
                      <p className="text-xs text-blue-600 font-medium mt-1 truncate" title={user?.position || t("userManagement.position")}>
                        {user?.position || t("userManagement.position")}
                      </p>
                    </div>
                  </div>
                </div>
                {!isOperatorActive && (
                  <>
                    <DropdownMenuSeparator />
                    <div
                      className="px-3 py-2 space-y-2"
                      onPointerDown={(e) => e.preventDefault()}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {t("filters.scope") || "Scope filters"}
                      </p>
                      <EquipmentUnitFilterSelect inProfileMenu />
                      <DisciplineFilterSelect inProfileMenu />
                    </div>
                  </>
                )}
                <div className="py-1">
                  <DropdownMenuItem 
                    onClick={openProfileDialog}
                    className="cursor-pointer"
                    data-testid="edit-profile-menu-item"
                  >
                    <User className="w-4 h-4 mr-2" />
                    {t("profile.editProfile") || "Edit Profile"}
                  </DropdownMenuItem>
                  {isOwner && (
                    <DropdownMenuItem
                      onClick={onOpenTenantSwitcher}
                      className="cursor-pointer"
                      data-testid="tenant-switch-menu-item"
                    >
                      <Building2 className="w-4 h-4 mr-2" />
                      {t("tenantSwitch.menu")}
                      {isViewingOtherTenant && (
                        <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 truncate max-w-[80px]">
                          {activeTenantLabel}
                        </span>
                      )}
                    </DropdownMenuItem>
                  )}
                  {isOwner && (
                    <DropdownMenuItem
                      onClick={onOpenRolePreview}
                      className="cursor-pointer"
                      data-testid="role-preview-menu-item"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      {t("rolePreview.menu")}
                      {isPreviewing && (
                        <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 truncate max-w-[80px]">
                          {previewRoleLabel}
                        </span>
                      )}
                    </DropdownMenuItem>
                  )}
                  {isMobileView && (
                  <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={toggleOperatorView}
                    className="cursor-pointer"
                    data-testid="toggle-operator-view"
                  >
                    <Shield className="w-4 h-4 mr-2" />
                    {t("simpleMode.title")}
                    <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded ${operatorViewEnabled ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {operatorViewEnabled ? t("simpleMode.on") : t("simpleMode.off")}
                    </span>
                  </DropdownMenuItem>
                  </>
                  )}
                  <DropdownMenuSeparator />
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
              data-testid="mobile-nav-hierarchy"
            >
              <PanelLeftOpen className="w-5 h-5" />
              {t("equipment.equipmentHierarchyTitle")}
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
                  isActive={navItemIsActive(item)}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      isActive
                        ? "bg-blue-50 text-blue-600"
                        : "text-slate-600 hover:bg-slate-50"
                    }`
                  }
                  data-testid={`mobile-nav-${item.navTestId || String(item.label || "").toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </NavLink>
              </motion.div>
            ))}
            
            {/* Divider */}
            <div className="my-3 border-t border-slate-200" />
            
{/* Settings and Definitions removed from mobile drawer - accessible via gear wheel menu */}
          </nav>
        </AnimatedDrawer>
    </header>
  );
}
