import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { MessageSquare, AlertTriangle, LogOut, Menu, X, BookOpen } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";

const Layout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { path: "/", label: "Chat", icon: MessageSquare },
    { path: "/threats", label: "Threats", icon: AlertTriangle },
    { path: "/library", label: "Library", icon: BookOpen },
  ];

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          {/* Logo */}
          <div className="flex items-center gap-3">
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

          {/* User Menu */}
          <div className="flex items-center gap-3">
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
    </div>
  );
};

export default Layout;
