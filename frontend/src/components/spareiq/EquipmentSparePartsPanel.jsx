import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Plus, Unlink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { sparePartsAPI } from "../../lib/apis/spareParts";
import { usePermissions } from "../../contexts/PermissionsContext";
import { Button } from "../ui/button";
import SparePartFormDialog from "./SparePartFormDialog";

export default function EquipmentSparePartsPanel({ equipmentId, equipmentName }) {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const canWrite = hasPermission("spareiq", "write");

  const { data, isLoading } = useQuery({
    queryKey: ["spare-parts", "equipment", equipmentId],
    queryFn: () => sparePartsAPI.list({ equipment_id: equipmentId }),
    enabled: Boolean(equipmentId),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["spare-categories"],
    queryFn: () => sparePartsAPI.listCategories(),
  });

  const createMutation = useMutation({
    mutationFn: (payload) => sparePartsAPI.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spare-parts", "equipment", equipmentId] });
      setCreateOpen(false);
      toast.success(t("spareiq.created") || "Spare part created");
    },
    onError: (error) => toast.error(error?.response?.data?.detail || t("spareiq.saveFailed")),
  });

  const unlinkMutation = useMutation({
    mutationFn: ({ sparePartId }) => sparePartsAPI.unlinkEquipment(sparePartId, equipmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spare-parts", "equipment", equipmentId] });
      toast.success(t("spareiq.linkRemoved") || "Link removed");
    },
    onError: (error) => toast.error(error?.response?.data?.detail || t("spareiq.unlinkFailed")),
  });

  const parts = data?.spare_parts || [];
  const categories = categoriesData?.categories || [];

  return (
    <div className="space-y-3" data-testid="equipment-spare-parts">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          {t("spareiq.equipmentPanelHint") || "Spare parts linked to this equipment"}
        </p>
        {canWrite && (
          <Button type="button" size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            {t("spareiq.create") || "Create"}
          </Button>
        )}
      </div>

      {isLoading && <p className="text-sm text-slate-500">{t("common.loading")}</p>}
      {!isLoading && parts.length === 0 && (
        <p className="text-sm text-slate-500">{t("spareiq.noEquipmentParts") || "No spare parts linked"}</p>
      )}
      <ul className="divide-y divide-slate-100 rounded border border-slate-200">
        {parts.map((part) => {
          const link = (part.equipment_links || []).find((l) => l.equipment_id === equipmentId);
          return (
            <li key={part.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <div className="min-w-0 flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-600 shrink-0" />
                <div className="min-w-0">
                  <Link to={`/spareiq/${part.id}`} className="font-medium text-blue-700 hover:underline truncate block">
                    {part.description}
                  </Link>
                  <span className="text-xs text-slate-500">{part.type_model}{link?.component_position ? ` · ${link.component_position}` : ""}</span>
                </div>
              </div>
              {canWrite && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-slate-500 shrink-0"
                  onClick={() => unlinkMutation.mutate({ sparePartId: part.id })}
                >
                  <Unlink className="w-4 h-4" />
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <SparePartFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        categories={categories}
        initialValues={{
          equipment_links: [{ equipment_id: equipmentId }],
          linked_equipment: [{ equipment_id: equipmentId, equipment_name: equipmentName }],
        }}
        onSubmit={(payload) => createMutation.mutate(payload)}
        isSubmitting={createMutation.isPending}
      />
    </div>
  );
}
