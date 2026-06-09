import { Eye, X } from "lucide-react";
import { Button } from "../ui/button";
import { useRolePreview } from "../../contexts/RolePreviewContext";

export default function RolePreviewBanner({ t }) {
  const { isPreviewing, previewRoleLabel, clearPreview } = useRolePreview();

  if (!isPreviewing) return null;

  return (
    <div
      className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-center gap-3 text-sm text-amber-900"
      data-testid="role-preview-banner"
    >
      <Eye className="w-4 h-4 shrink-0 text-amber-600" />
      <span>
        {(t("rolePreview.banner") || "Previewing as {role}").replace("{role}", previewRoleLabel)}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs border-amber-300 bg-white hover:bg-amber-100"
        onClick={clearPreview}
        data-testid="role-preview-exit"
      >
        <X className="w-3 h-3 mr-1" />
        {t("rolePreview.exit")}
      </Button>
    </div>
  );
}
