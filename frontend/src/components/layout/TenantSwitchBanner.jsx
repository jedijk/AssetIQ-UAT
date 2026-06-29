import { Building2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { api } from "../../lib/apiClient";
import { clearActiveTenantId, getActiveTenantId } from "../../lib/activeTenant";
import { useAuth } from "../../contexts/AuthContext";

export default function TenantSwitchBanner({ t, activeTenantLabel }) {
  const { user } = useAuth();
  const activeTenantId = getActiveTenantId();
  const homeTenantId = user?.home_tenant_id || user?.company_id;
  const isViewingOtherTenant =
    user?.role === "owner" && activeTenantId && activeTenantId !== homeTenantId;

  if (!isViewingOtherTenant) return null;

  const label = activeTenantLabel || activeTenantId;

  const handleExit = async () => {
    try {
      await api.post("/auth/switch-tenant", { tenant_id: null });
      clearActiveTenantId();
      toast.success(t("tenantSwitch.switchSuccess"));
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      toast.error(err.response?.data?.detail || t("tenantSwitch.switchFailed"));
    }
  };

  return (
    <div
      className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center justify-center gap-3 text-sm text-blue-900"
      data-testid="tenant-switch-banner"
    >
      <Building2 className="w-4 h-4 shrink-0 text-blue-600" />
      <span>
        {(t("tenantSwitch.banner") || "Viewing tenant {tenant}").replace("{tenant}", label)}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs border-blue-300 bg-white hover:bg-blue-100"
        onClick={handleExit}
        data-testid="tenant-switch-exit"
      >
        <X className="w-3 h-3 mr-1" />
        {t("tenantSwitch.exit")}
      </Button>
    </div>
  );
}
