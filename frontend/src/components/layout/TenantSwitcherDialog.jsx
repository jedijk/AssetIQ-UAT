import { useQuery } from "@tanstack/react-query";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/apiClient";
import { tenantManagementAPI } from "../../lib/apis/tenantManagement";
import { getActiveTenantId, setActiveTenantId } from "../../lib/activeTenant";
import { useAuth } from "../../contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

export default function TenantSwitcherDialog({ open, onOpenChange, t }) {
  const { user } = useAuth();
  const activeTenantId = getActiveTenantId();
  const homeTenantId = user?.home_tenant_id || user?.company_id;

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "tenants", "switcher"],
    queryFn: () => tenantManagementAPI.listTenants(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const tenants = data?.tenants || data || [];

  const handleSelect = async (tenant) => {
    const tenantId = tenant?.tenant_id || tenant?.id;
    const isHome = !tenantId || tenantId === homeTenantId;
    const switchingAway = !isHome && activeTenantId !== tenantId;
    const clearingOverride = isHome && activeTenantId;

    if (!switchingAway && !clearingOverride) {
      onOpenChange(false);
      return;
    }

    try {
      const response = await api.post("/auth/switch-tenant", {
        tenant_id: isHome ? null : tenantId,
      });
      if (isHome) {
        setActiveTenantId(null);
      } else {
        setActiveTenantId(response.data.tenant_id);
      }
      toast.success(t("tenantSwitch.switchSuccess"), {
        description: response.data.name || response.data.tenant_id,
        duration: 1500,
      });
      onOpenChange(false);
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      toast.error(err.response?.data?.detail || t("tenantSwitch.switchFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="tenant-switcher-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            {t("tenantSwitch.title")}
          </DialogTitle>
          <DialogDescription>{t("tenantSwitch.description")}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            {t("tenantSwitch.loading")}
          </div>
        ) : (
          <div className="grid gap-2 py-2 max-h-[60vh] overflow-y-auto">
            {homeTenantId && (
              <Button
                variant={!activeTenantId ? "default" : "outline"}
                className={`justify-start h-auto py-3 px-4 ${!activeTenantId ? "bg-blue-600 hover:bg-blue-700" : ""}`}
                onClick={() => handleSelect({ tenant_id: homeTenantId })}
                data-testid="tenant-switch-home"
              >
                <div className="flex flex-col items-start gap-0.5 text-left flex-1">
                  <span className="font-medium">{t("tenantSwitch.homeTenant")}</span>
                  <span className={`text-xs ${!activeTenantId ? "text-blue-100" : "text-slate-500"}`}>
                    {homeTenantId}
                  </span>
                </div>
                {!activeTenantId && (
                  <Badge className="ml-2 bg-white/20 text-white text-[10px]">
                    {t("tenantSwitch.active")}
                  </Badge>
                )}
              </Button>
            )}
            {tenants
              .filter((tenant) => {
                const tid = tenant.tenant_id || tenant.id;
                return tid && tid !== homeTenantId;
              })
              .map((tenant) => {
                const tid = tenant.tenant_id || tenant.id;
                const isActive = activeTenantId === tid;
                return (
                  <Button
                    key={tid}
                    variant={isActive ? "default" : "outline"}
                    className={`justify-start h-auto py-3 px-4 ${isActive ? "bg-blue-600 hover:bg-blue-700" : ""}`}
                    onClick={() => handleSelect(tenant)}
                    data-testid={`tenant-switch-option-${tid}`}
                  >
                    <div className="flex flex-col items-start gap-0.5 text-left flex-1">
                      <span className="font-medium">{tenant.name || tid}</span>
                      <span className={`text-xs ${isActive ? "text-blue-100" : "text-slate-500"}`}>
                        {tid}
                      </span>
                    </div>
                    {isActive && (
                      <Badge className="ml-2 bg-white/20 text-white text-[10px]">
                        {t("tenantSwitch.active")}
                      </Badge>
                    )}
                  </Button>
                );
              })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
