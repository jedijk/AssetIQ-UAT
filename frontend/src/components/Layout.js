import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useUndo } from "../contexts/UndoContext";
import { AlertTriangle, LogOut, Menu, X, BookOpen, MessageSquare, Plus, PanelLeftOpen, PanelLeftClose, Settings, Building2, GitBranch, Undo2, ClipboardList } from "lucide-react";
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
import ChatSidebar from "./ChatSidebar";
import EquipmentHierarchy from "./EquipmentHierarchy";

const Layout = () => {
  const { user, logout } = useAuth();
  const { canUndo, undo, isUndoing, getLastAction, undoCount } = useUndo();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [hierarchyOpen, setHierarchyOpen] = useState(true);

  // Auto-collapse hierarchy when on Equipment Manager page
  useEffect(() => {
    if (location.pathname === "/equipment-manager") {
      setHierarchyOpen(false);
    }
  }, [location.pathname]);

  const lastAction = getLastAction();

  const navItems = [
    { path: "/", label: "Threats", icon: AlertTriangle },
    { path: "/actions", label: "Actions", icon: ClipboardList },
    { path: "/causal-engine", label: "Causal Engine", icon: GitBranch },
    { path: "/library", label: "Library", icon: BookOpen },
  ];

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-content max-w-full px-4">
          {/* Left Section - Logo & Nav */}
          <div className="flex items-center gap-4 lg:gap-8">
            {/* Hierarchy Toggle - Desktop */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setHierarchyOpen(!hierarchyOpen)}
              className="hidden lg:flex h-9 w-9 text-slate-600 hover:text-blue-600 border-slate-300"
              data-testid="hierarchy-toggle"
              title={hierarchyOpen ? "Hide Equipment Panel" : "Show Equipment Panel"}
            >
              {hierarchyOpen ? (
                <PanelLeftClose className="w-5 h-5" />
              ) : (
                <PanelLeftOpen className="w-5 h-5" />
              )}
            </Button>

            {/* Logo */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <img 
                src="/app-icon.png" 
                alt="ThreatBase" 
                className="w-9 h-9 rounded-lg"
              />
              <span className="text-xl font-bold text-slate-900 hidden sm:block" data-testid="app-logo">
                ThreatBase
              </span>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1" data-testid="desktop-nav">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === "/"}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors duration-150 ${
                      isActive 
                        ? "bg-blue-50 text-blue-700" 
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`
                  }
                  data-testid={`nav-${item.label.toLowerCase()}`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Undo Button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={undo}
                    disabled={!canUndo || isUndoing}
                    className={`h-9 w-9 transition-all duration-200 ${
                      canUndo 
                        ? "text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700" 
                        : "text-slate-300 border-slate-200"
                    }`}
                    data-testid="undo-button"
                  >
                    <Undo2 className="w-4 h-4" />
                    {undoCount > 0 && (
                      <span className="absolute -top-1 -right-1 h-4 w-4 text-[10px] font-bold bg-amber-500 text-white rounded-full flex items-center justify-center">
                        {undoCount}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {canUndo ? (
                    <p>Undo: {lastAction?.label} <span className="text-slate-400">({undoCount} actions)</span></p>
                  ) : (
                    <p>No actions to undo</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Report Threat Button - Desktop */}
            <Button
              onClick={() => setChatOpen(true)}
              className="hidden sm:flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
              data-testid="report-threat-button"
            >
              <Plus className="w-4 h-4" />
              Report Threat
            </Button>

            {/* Settings Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-slate-600 hover:text-slate-900"
                  data-testid="settings-menu-button"
                >
                  <Settings className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Settings</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => navigate("/equipment-manager")}
                  className="cursor-pointer"
                  data-testid="equipment-manager-menu-item"
                >
                  <Building2 className="w-4 h-4 mr-2" />
                  Equipment Manager
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <span className="hidden lg:block text-sm font-medium text-slate-600" data-testid="user-name">
              {user?.name}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="text-slate-500 hover:text-slate-700"
              data-testid="logout-button"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline ml-2">Logout</span>
            </Button>

            {/* Mobile Menu Toggle */}
            <button
              className="md:hidden p-2 rounded-lg hover:bg-slate-100"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="mobile-menu-toggle"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5 text-slate-600" />
              ) : (
                <Menu className="w-5 h-5 text-slate-600" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t border-slate-200 p-4 bg-white" data-testid="mobile-nav">
            {/* Hierarchy toggle for mobile */}
            <button
              onClick={() => { setHierarchyOpen(true); setMobileMenuOpen(false); }}
              className="flex items-center gap-3 p-3 rounded-lg text-slate-600 hover:bg-slate-50 w-full"
            >
              <PanelLeftOpen className="w-5 h-5" />
              Equipment Hierarchy
            </button>
            {/* Equipment Manager for mobile */}
            <button
              onClick={() => { navigate("/equipment-manager"); setMobileMenuOpen(false); }}
              className="flex items-center gap-3 p-3 rounded-lg text-slate-600 hover:bg-slate-50 w-full"
              data-testid="mobile-nav-equipment-manager"
            >
              <Building2 className="w-5 h-5" />
              Equipment Manager (ISO 14224)
            </button>
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
                data-testid={`mobile-nav-${item.label.toLowerCase()}`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {/* Main Layout with Sidebar */}
      <div className="flex min-h-[calc(100vh-64px)]">
        {/* Equipment Hierarchy Sidebar - Desktop */}
        {hierarchyOpen && (
          <div className="hidden lg:block w-72 flex-shrink-0 border-r border-slate-200 bg-white">
            <div className="sticky top-16 h-[calc(100vh-64px)]">
              <EquipmentHierarchy 
                isOpen={true} 
                onClose={() => setHierarchyOpen(false)}
                isMobile={false}
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
          />
        </div>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>

      {/* Floating Action Button - Mobile */}
      <button
        onClick={() => setChatOpen(true)}
        className="sm:hidden fixed bottom-20 right-6 h-14 w-14 rounded-full shadow-lg bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 hover:shadow-xl active:scale-95 transition-all duration-200 z-30"
        data-testid="fab-report-threat"
      >
        <MessageSquare className="w-6 h-6" />
      </button>

      {/* Chat Sidebar */}
      <ChatSidebar isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
};

export default Layout;
