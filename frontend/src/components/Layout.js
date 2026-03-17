import { useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { AlertTriangle, LogOut, Menu, X, BookOpen, MessageSquare, Plus } from "lucide-react";
import { Button } from "./ui/button";
import ChatSidebar from "./ChatSidebar";

const Layout = () => {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const navItems = [
    { path: "/", label: "Threats", icon: AlertTriangle },
    { path: "/library", label: "Library", icon: BookOpen },
  ];

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-content max-w-7xl mx-auto">
          {/* Left Section - Logo & Nav */}
          <div className="flex items-center gap-8">
            {/* Logo */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <img 
                src="/app-icon.png" 
                alt="ThreatBase" 
                className="w-9 h-9 rounded-lg"
              />
              <span className="text-xl font-bold text-slate-900" data-testid="app-logo">
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
          <div className="flex items-center gap-3">
            {/* Report Threat Button - Desktop */}
            <Button
              onClick={() => setChatOpen(true)}
              className="hidden sm:flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
              data-testid="report-threat-button"
            >
              <Plus className="w-4 h-4" />
              Report Threat
            </Button>

            <span className="hidden sm:block text-sm font-medium text-slate-600" data-testid="user-name">
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

      {/* Main Content */}
      <main>
        <Outlet />
      </main>

      {/* Floating Action Button - Mobile */}
      <button
        onClick={() => setChatOpen(true)}
        className="sm:hidden fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 hover:shadow-xl active:scale-95 transition-all duration-200 z-30"
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
