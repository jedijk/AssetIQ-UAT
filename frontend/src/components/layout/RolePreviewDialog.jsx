import { useQuery } from "@tanstack/react-query";
import { Eye, Loader2 } from "lucide-react";
import { permissionsAPI } from "../../lib/api";
import { formatRoleLabel, resolveRoleDescription, resolveRoleDisplayName } from "../../lib/roleLabels";
import { useRolePreview } from "../../contexts/RolePreviewContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

export default function RolePreviewDialog({ open, onOpenChange, t }) {
  const { previewRole, setPreviewRole, clearPreview } = useRolePreview();

  const { data, isLoading } = useQuery({
    queryKey: ["permissions", "roles"],
    queryFn: () => permissionsAPI.listRoles(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const roles = (data?.roles || []).filter((r) => r.name !== "owner");

  const handleSelect = (roleName) => {
    if (previewRole === roleName) {
      clearPreview();
    } else {
      setPreviewRole(roleName);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="role-preview-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-amber-600" />
            {t("rolePreview.title")}
          </DialogTitle>
          <DialogDescription>{t("rolePreview.description")}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            {t("common.loading")}
          </div>
        ) : (
          <div className="grid gap-2 py-2 max-h-[60vh] overflow-y-auto">
            {roles.map((role) => {
              const isActive = previewRole === role.name;
              return (
                <Button
                  key={role.name}
                  variant={isActive ? "default" : "outline"}
                  className={`justify-start h-auto py-3 px-4 ${isActive ? "bg-amber-600 hover:bg-amber-700" : ""}`}
                  onClick={() => handleSelect(role.name)}
                  data-testid={`role-preview-option-${role.name}`}
                >
                  <div className="flex flex-col items-start gap-0.5 text-left flex-1">
                    <span className="font-medium">
                      {resolveRoleDisplayName(role.name, role)}
                    </span>
                    {resolveRoleDescription(role.name, role) && (
                      <span className={`text-xs ${isActive ? "text-amber-100" : "text-slate-500"}`}>
                        {resolveRoleDescription(role.name, role)}
                      </span>
                    )}
                  </div>
                  {role.is_system && (
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      {t("rolePreview.systemRole")}
                    </Badge>
                  )}
                  {isActive && (
                    <Badge className="ml-2 bg-white/20 text-white text-[10px]">
                      {t("rolePreview.active")}
                    </Badge>
                  )}
                </Button>
              );
            })}
          </div>
        )}

        {previewRole && (
          <Button variant="ghost" className="w-full text-slate-600" onClick={() => { clearPreview(); onOpenChange(false); }}>
            {t("rolePreview.exit")}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
