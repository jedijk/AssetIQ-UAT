/**
 * DatabaseEnvSwitcher
 *
 * A compact header badge (owner only) that displays the active database
 * environment and lets the owner switch between Production and UAT with
 * a single tap — works on mobile AND desktop, no detour through Settings.
 *
 * Persists to localStorage["database_environment"] (same key read by the
 * axios interceptor in lib/api.js + raw-fetch helper in lib/apiConfig.js).
 */
import { useState, useEffect } from "react";
import { Shield, Beaker, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import api from "../lib/api";

const ENV_META = {
  production: { label: "Prod", name: "Production", color: "emerald", icon: Shield },
  uat: { label: "UAT", name: "UAT", color: "amber", icon: Beaker },
};

export default function DatabaseEnvSwitcher() {
  const [current, setCurrent] = useState(
    () => localStorage.getItem("database_environment") || "production"
  );
  const [switching, setSwitching] = useState(false);

  // Keep in sync if another tab changes it
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "database_environment" && e.newValue) {
        setCurrent(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const meta = ENV_META[current] || ENV_META.production;
  const Icon = meta.icon;

  const switchEnv = async (target) => {
    if (target === current || switching) return;
    setSwitching(true);
    try {
      await api.post("/system/databases/switch", { environment: target });
      localStorage.setItem("database_environment", target);
      setCurrent(target);
      toast.success(`Switched to ${ENV_META[target].name}`, {
        description: "Reloading with new database…",
        duration: 1500,
      });
      // Reload so React-Query caches flush against the new DB
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Switch failed");
      setSwitching(false);
    }
  };

  const colorClasses = meta.color === "emerald"
    ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
    : "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="db-env-switcher"
          disabled={switching}
          className={`flex items-center gap-1 px-1.5 sm:px-2 h-7 sm:h-8 rounded-md border text-[11px] sm:text-xs font-semibold transition-colors ${colorClasses} disabled:opacity-50`}
          title={`Active database: ${meta.name}. Tap to switch.`}
        >
          {switching ? (
            <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin" />
          ) : (
            <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          )}
          <span className="tracking-wide">{meta.label}</span>
          <ChevronDown className="w-2.5 h-2.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs text-slate-500 font-normal">
          Database environment
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => switchEnv("production")}
          className="flex items-center gap-2 cursor-pointer"
          data-testid="db-env-switch-production"
        >
          <Shield className="w-4 h-4 text-emerald-600" />
          <div className="flex-1">
            <div className="text-sm font-medium">Production</div>
            <div className="text-[10px] text-slate-500">assetiq</div>
          </div>
          {current === "production" && (
            <span className="text-[10px] font-semibold text-emerald-600">ACTIVE</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => switchEnv("uat")}
          className="flex items-center gap-2 cursor-pointer"
          data-testid="db-env-switch-uat"
        >
          <Beaker className="w-4 h-4 text-amber-600" />
          <div className="flex-1">
            <div className="text-sm font-medium">UAT</div>
            <div className="text-[10px] text-slate-500">assetiq-UAT</div>
          </div>
          {current === "uat" && (
            <span className="text-[10px] font-semibold text-amber-600">ACTIVE</span>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
