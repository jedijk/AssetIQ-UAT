import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Target, Loader2 } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import { usePermissions } from "../../../contexts/PermissionsContext";
import { cn } from "../../../lib/utils";
import {
  SUCCESS_READINESS_BASE,
  SUCCESS_READINESS_NAV,
} from "../config/nav";

export default function SuccessReadinessLayout() {
  const { user } = useAuth();
  const { canRead } = usePermissions();
  const location = useLocation();
  const isOwner = user?.role === "owner";

  if (!canRead("success_readiness")) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center px-6">
        <Target className="w-12 h-12 text-slate-300 mb-4" />
        <h2 className="text-lg font-semibold text-slate-900">Access restricted</h2>
        <p className="text-sm text-slate-500 mt-1 max-w-md">
          Success Readiness is not available for your role. Contact an administrator if you need access.
        </p>
      </div>
    );
  }

  const navItems = SUCCESS_READINESS_NAV.filter(
    (item) => !item.ownerOnly || isOwner
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-5 h-5 text-indigo-600" />
          <h1 className="text-lg font-semibold text-slate-900">Success Readiness</h1>
        </div>
        <nav className="flex flex-wrap gap-1" aria-label="Success Readiness sections">
          {navItems.map((item) => {
            const to = item.path
              ? `${SUCCESS_READINESS_BASE}/${item.path}`
              : SUCCESS_READINESS_BASE;
            return (
              <NavLink
                key={item.path || "dashboard"}
                to={to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )
                }
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </div>
      <div className="flex-1 overflow-auto" key={location.pathname}>
        <Outlet />
      </div>
    </div>
  );
}

export function SuccessReadinessLoading() {
  return (
    <div className="flex items-center justify-center py-24 text-slate-500">
      <Loader2 className="w-6 h-6 animate-spin mr-2" />
      Loading…
    </div>
  );
}
