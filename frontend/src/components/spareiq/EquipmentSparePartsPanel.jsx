import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Package, Pencil, Plus, Unlink } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { toast } from "sonner";

import { sparePartsAPI } from "../../lib/apis/spareParts";
import { usePermissions } from "../../contexts/PermissionsContext";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import SparePartFormDialog from "./SparePartFormDialog";

function sparePartHoverComment(part, link, t) {
  const lines = [];
  if (link?.component_position?.trim()) {
    lines.push(`${t("spareiq.componentPosition")}: ${link.component_position.trim()}`);
  }
  if (part?.notes?.trim()) {
    lines.push(part.notes.trim());
  }
  return lines.length ? lines.join("\n\n") : null;
}

function findEquipmentLink(part, equipmentId) {
  const target = String(equipmentId || "");
  if (!target) return null;
  for (const source of [part?.equipment_links, part?.linked_equipment]) {
    if (!Array.isArray(source)) continue;
    const match = source.find((link) => link && String(link.equipment_id) === target);
    if (match) return match;
  }
  return null;
}

export default function EquipmentSparePartsPanel({ equipmentId, equipmentName }) {
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editPart, setEditPart] = useState(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const canRead = hasPermission("spareiq", "read");
  const canWrite = hasPermission("spareiq", "write");

  const { data, isLoading } = useQuery({
    queryKey: ["spare-parts", "equipment", equipmentId],
    queryFn: () => sparePartsAPI.list({ equipment_id: equipmentId }),
    enabled: Boolean(equipmentId) && canRead,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["spare-categories"],
    queryFn: () => sparePartsAPI.listCategories(),
    enabled: canRead,
  });

  const { data: linkCatalogData, isLoading: linkCatalogLoading } = useQuery({
    queryKey: ["spare-parts", "link-catalog", linkSearch],
    queryFn: () => sparePartsAPI.list({ search: linkSearch || undefined, sort_by: "description", sort_dir: 1 }),
    enabled: linkOpen && canRead,
  });

  const invalidateEquipmentParts = () => {
    queryClient.invalidateQueries({ queryKey: ["spare-parts", "equipment", equipmentId] });
    queryClient.invalidateQueries({ queryKey: ["spare-parts"] });
  };

  const createMutation = useMutation({
    mutationFn: (payload) => sparePartsAPI.create(payload),
    onSuccess: (result) => {
      invalidateEquipmentParts();
      setCreateOpen(false);
      if (result?.merged) {
        toast.success(t("spareiq.mergedExisting") || "Updated existing spare part and linked equipment");
      } else {
        toast.success(t("spareiq.created") || "Spare part created");
      }
    },
    onError: (error) => toast.error(error?.response?.data?.detail || t("spareiq.saveFailed")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => sparePartsAPI.update(id, payload),
    onSuccess: () => {
      invalidateEquipmentParts();
      setEditPart(null);
      toast.success(t("spareiq.updated") || "Spare part updated");
    },
    onError: (error) => toast.error(error?.response?.data?.detail || t("spareiq.saveFailed")),
  });

  const unlinkMutation = useMutation({
    mutationFn: ({ sparePartId }) => sparePartsAPI.unlinkEquipment(sparePartId, equipmentId),
    onSuccess: () => {
      invalidateEquipmentParts();
      toast.success(t("spareiq.linkRemoved") || "Link removed");
    },
    onError: (error) => toast.error(error?.response?.data?.detail || t("spareiq.unlinkFailed")),
  });

  const linkMutation = useMutation({
    mutationFn: ({ sparePartId }) => sparePartsAPI.linkEquipment(sparePartId, equipmentId),
    onSuccess: () => {
      invalidateEquipmentParts();
      setLinkOpen(false);
      setLinkSearch("");
      toast.success(t("spareiq.linked") || "Spare part linked");
    },
    onError: (error) => toast.error(error?.response?.data?.detail || t("spareiq.linkFailed") || "Failed to link"),
  });

  const parts = data?.spare_parts || [];
  const categories = categoriesData?.categories || [];
  const linkedIds = useMemo(() => new Set(parts.map((p) => p.id)), [parts]);

  const linkCandidates = useMemo(() => {
    const catalog = linkCatalogData?.spare_parts || [];
    return catalog.filter((part) => !linkedIds.has(part.id));
  }, [linkCatalogData, linkedIds]);

  const presetEquipmentLink = {
    equipment_links: [{ equipment_id: equipmentId }],
    linked_equipment: [{ equipment_id: equipmentId, equipment_name: equipmentName }],
  };

  if (!canRead) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-3" data-testid="equipment-spare-parts">
      {canWrite && (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 shrink-0" />
            <span className="truncate">{t("spareiq.create")}</span>
          </Button>
          <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => setLinkOpen(true)}>
            <Link2 className="w-4 h-4 shrink-0" />
            <span className="truncate">{t("spareiq.linkExisting")}</span>
          </Button>
        </div>
      )}

      {isLoading && <p className="text-sm text-slate-500">{t("common.loading")}</p>}
      {!isLoading && parts.length === 0 && (
        <p className="text-sm text-slate-500">{t("spareiq.noEquipmentParts") || "No spare parts linked"}</p>
      )}
      <ul className="divide-y divide-slate-100 rounded border border-slate-200">
        {parts.map((part) => {
          const link = findEquipmentLink(part, equipmentId);
          const hoverComment = sparePartHoverComment(part, link, t);
          const partSummary = (
            <div className="min-w-0 flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-600 shrink-0" />
              <div className="min-w-0">
                <Link to={`/spareiq/${part.id}`} className="font-medium text-blue-700 hover:underline truncate block">
                  {part.description}
                </Link>
                <span className="text-xs text-slate-500 block truncate">
                  {part.type_model}
                  {link?.component_position ? ` · ${link.component_position}` : ""}
                </span>
              </div>
            </div>
          );
          return (
            <li
              key={part.id}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              title={hoverComment || undefined}
            >
              {hoverComment ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="min-w-0 flex-1 cursor-help">{partSummary}</div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs whitespace-pre-wrap text-xs z-[110]">
                    {hoverComment}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <div className="min-w-0 flex-1">{partSummary}</div>
              )}
              {canWrite && (
                <div className="flex items-center shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-slate-500"
                    onClick={() => setEditPart(part)}
                    aria-label={t("spareiq.edit") || "Edit"}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-slate-500"
                    onClick={() => unlinkMutation.mutate({ sparePartId: part.id })}
                    aria-label={t("spareiq.unlink") || "Unlink"}
                  >
                    <Unlink className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <SparePartFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        categories={categories}
        initialValues={presetEquipmentLink}
        onSubmit={(payload) => createMutation.mutate(payload)}
        isSubmitting={createMutation.isPending}
      />

      <SparePartFormDialog
        open={Boolean(editPart)}
        onOpenChange={(open) => { if (!open) setEditPart(null); }}
        categories={categories}
        initialValues={editPart}
        onSubmit={(payload) => updateMutation.mutate({ id: editPart.id, payload })}
        isSubmitting={updateMutation.isPending}
      />

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("spareiq.linkExisting") || "Link existing spare part"}</DialogTitle>
            <DialogDescription>
              {equipmentName || t("spareiq.equipmentPanelHint") || "Spare parts linked to this equipment"}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={linkSearch}
            onChange={(e) => setLinkSearch(e.target.value)}
            placeholder={t("spareiq.searchPlaceholder") || "Search description or type/model..."}
            autoFocus
          />
          <div className="max-h-56 overflow-y-auto rounded border border-slate-200 divide-y">
            {linkCatalogLoading && (
              <p className="px-3 py-2 text-sm text-slate-500">{t("common.loading")}</p>
            )}
            {!linkCatalogLoading && linkCandidates.length === 0 && (
              <p className="px-3 py-2 text-sm text-slate-500">
                {t("spareiq.noLinkCandidates") || "No spare parts to link"}
              </p>
            )}
            {linkCandidates.map((part) => (
              <button
                key={part.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                onClick={() => linkMutation.mutate({ sparePartId: part.id })}
                disabled={linkMutation.isPending}
              >
                <span className="font-medium text-slate-900 block truncate">{part.description}</span>
                <span className="text-xs text-slate-500">{part.type_model}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
