import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useUndo } from "../contexts/UndoContext";
import { AlertTriangle, LogOut, Menu, X, BookOpen, MessageSquare, Plus, PanelLeftOpen, PanelLeftClose, Settings, Building2, GitBranch, Undo2, ClipboardList, Info } from "lucide-react";
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

const Layout = () => {
  const { user, logout } = useAuth();
  const { canUndo, undo, isUndoing, getLastAction, undoCount } = useUndo();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [hierarchyOpen, setHierarchyOpen] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);

  // Auto-collapse hierarchy when on Equipment Manager page
  useEffect(() => {
    if (location.pathname === "/equipment-manager") {
      setHierarchyOpen(false);
    }
  }, [location.pathname]);

  const lastAction = getLastAction();

  const navItems = [
    { path: "/", label: "Threats", icon: AlertTriangle },
    { path: "/causal-engine", label: "Causal Engine", icon: GitBranch },
    { path: "/actions", label: "Actions", icon: ClipboardList },
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
            {/* Info Button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setInfoOpen(true)}
                    className="h-9 w-9 text-slate-500 border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                    data-testid="info-button"
                  >
                    <Info className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Risk Methodology & Help</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

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

      {/* Floating Action Button - Report Threat */}
      <button
        onClick={() => setChatOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all duration-200 z-30"
        style={{ boxShadow: '0 8px 24px -4px rgba(37, 99, 235, 0.5), 0 4px 12px -2px rgba(0, 0, 0, 0.25)' }}
        data-testid="fab-report-threat"
        title="Report Threat"
      >
        <Plus className="w-7 h-7" />
      </button>

      {/* Chat Sidebar */}
      <ChatSidebar isOpen={chatOpen} onClose={() => setChatOpen(false)} />

      {/* Info Dialog */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">ThreatBase - Risk Methodology</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* FMEA Risk Scoring */}
            <div>
              <h3 className="font-semibold text-slate-800 mb-2">FMEA Risk Scoring</h3>
              <p className="text-sm text-slate-600 mb-3">
                Risk scores are calculated using Failure Mode and Effects Analysis (FMEA) methodology:
              </p>
              <div className="bg-slate-50 rounded-lg p-4 font-mono text-sm">
                <p className="text-slate-700">Risk Score = (Severity × Occurrence × Detection) / 10</p>
                <p className="text-slate-500 mt-1">Maximum score: 100</p>
              </div>
            </div>

            {/* Severity */}
            <div>
              <h4 className="font-medium text-slate-700 mb-2">Severity (Impact)</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between p-2 bg-red-50 rounded"><span>Safety Hazard</span><span className="font-medium">10</span></div>
                <div className="flex justify-between p-2 bg-orange-50 rounded"><span>Production Loss</span><span className="font-medium">8</span></div>
                <div className="flex justify-between p-2 bg-yellow-50 rounded"><span>Equipment Damage</span><span className="font-medium">6</span></div>
                <div className="flex justify-between p-2 bg-green-50 rounded"><span>Environmental</span><span className="font-medium">4</span></div>
              </div>
            </div>

            {/* Occurrence */}
            <div>
              <h4 className="font-medium text-slate-700 mb-2">Occurrence (Frequency)</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between p-2 bg-slate-50 rounded"><span>First Time</span><span className="font-medium">2</span></div>
                <div className="flex justify-between p-2 bg-slate-50 rounded"><span>Rare</span><span className="font-medium">4</span></div>
                <div className="flex justify-between p-2 bg-slate-50 rounded"><span>Occasional</span><span className="font-medium">6</span></div>
                <div className="flex justify-between p-2 bg-slate-50 rounded"><span>Frequent</span><span className="font-medium">8</span></div>
              </div>
            </div>

            {/* Detection */}
            <div>
              <h4 className="font-medium text-slate-700 mb-2">Detection (Difficulty)</h4>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="flex justify-between p-2 bg-slate-50 rounded"><span>Easy</span><span className="font-medium">3</span></div>
                <div className="flex justify-between p-2 bg-slate-50 rounded"><span>Moderate</span><span className="font-medium">5</span></div>
                <div className="flex justify-between p-2 bg-slate-50 rounded"><span>Difficult</span><span className="font-medium">7</span></div>
              </div>
            </div>

            {/* Risk Levels */}
            <div>
              <h4 className="font-medium text-slate-700 mb-2">Risk Levels</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between p-2 bg-red-100 text-red-800 rounded"><span>Critical</span><span className="font-medium">≥ 70</span></div>
                <div className="flex justify-between p-2 bg-orange-100 text-orange-800 rounded"><span>High</span><span className="font-medium">50 - 69</span></div>
                <div className="flex justify-between p-2 bg-yellow-100 text-yellow-800 rounded"><span>Medium</span><span className="font-medium">30 - 49</span></div>
                <div className="flex justify-between p-2 bg-green-100 text-green-800 rounded"><span>Low</span><span className="font-medium">&lt; 30</span></div>
              </div>
            </div>

            {/* Criticality Adjustment */}
            <div>
              <h4 className="font-medium text-slate-700 mb-2">Equipment Criticality Multipliers</h4>
              <p className="text-sm text-slate-600 mb-2">
                Risk scores are adjusted based on equipment criticality:
              </p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between p-2 bg-red-50 rounded"><span>Safety Critical</span><span className="font-medium">×1.5</span></div>
                <div className="flex justify-between p-2 bg-orange-50 rounded"><span>Production Critical</span><span className="font-medium">×1.3</span></div>
                <div className="flex justify-between p-2 bg-yellow-50 rounded"><span>Medium</span><span className="font-medium">×1.1</span></div>
                <div className="flex justify-between p-2 bg-green-50 rounded"><span>Low</span><span className="font-medium">×1.0</span></div>
              </div>
            </div>

            {/* Quick Tips */}
            <div className="border-t pt-4">
              <h4 className="font-medium text-slate-700 mb-2">Quick Tips</h4>
              <ul className="text-sm text-slate-600 space-y-1">
                <li>• Use the <strong>+</strong> button to report new threats via chat</li>
                <li>• Drag and drop equipment in the hierarchy to reorganize</li>
                <li>• Click on a threat to view details and start investigations</li>
                <li>• Use the Causal Engine to perform root cause analysis</li>
                <li>• Promote recommendations to Actions for tracking</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Layout;
