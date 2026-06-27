import { Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { sparePartsAPI } from "../../lib/apis/spareParts";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

export default function SparePartRequirementsEditor({
  equipmentId,
  requirements = [],
  onChange,
  disabled = false,
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["spare-parts", "equipment", equipmentId],
    queryFn: () => sparePartsAPI.list({ equipment_id: equipmentId }),
    enabled: Boolean(equipmentId),
  });

  const availableParts = data?.spare_parts || [];
  const selectedIds = new Set(requirements.map((req) => req.spare_part_id));
  const addableParts = availableParts.filter((part) => !selectedIds.has(part.id));

  const updateRequirement = (index, patch) => {
    onChange(
      requirements.map((req, idx) => (idx === index ? { ...req, ...patch } : req)),
    );
  };

  const removeRequirement = (index) => {
    onChange(requirements.filter((_, idx) => idx !== index));
  };

  const addRequirement = (sparePartId) => {
    if (!sparePartId || selectedIds.has(sparePartId)) return;
    const part = availableParts.find((item) => item.id === sparePartId);
    onChange([
      ...requirements,
      {
        spare_part_id: sparePartId,
        quantity: 1,
        description: part?.description,
        type_model: part?.type_model,
      },
    ]);
  };

  if (!equipmentId) {
    return (
      <p className="text-sm text-amber-700">
        Link this work item to equipment before assigning spare parts.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <div>
        <Label className="text-sm">Spare parts required</Label>
        <p className="text-xs text-slate-500">
          Only spare parts linked to this equipment can be selected.
        </p>
      </div>

      {requirements.length === 0 && (
        <p className="text-sm text-slate-500">No spare parts assigned yet.</p>
      )}

      {requirements.map((req, index) => {
        const label = req.description && req.type_model
          ? `${req.description} (${req.type_model})`
          : availableParts.find((part) => part.id === req.spare_part_id)?.description
            || req.spare_part_id;

        return (
          <div key={req.spare_part_id} className="flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate text-sm text-slate-700">{label}</div>
            <Input
              type="number"
              min={1}
              className="w-20"
              value={req.quantity ?? 1}
              disabled={disabled}
              onChange={(event) => updateRequirement(index, {
                quantity: Math.max(1, parseInt(event.target.value, 10) || 1),
              })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              onClick={() => removeRequirement(index)}
            >
              <Trash2 className="h-4 w-4 text-slate-500" />
            </Button>
          </div>
        );
      })}

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading spare parts...</p>
      ) : addableParts.length > 0 ? (
        <Select disabled={disabled} onValueChange={addRequirement}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Add spare part..." />
          </SelectTrigger>
          <SelectContent>
            {addableParts.map((part) => (
              <SelectItem key={part.id} value={part.id}>
                {part.description} ({part.type_model})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : availableParts.length === 0 ? (
        <p className="text-sm text-slate-500">
          {t("spareiq.addPartsFirstHint") || "No spare parts linked to this equipment. Add parts in Spares first."}
        </p>
      ) : (
        <p className="text-sm text-slate-500">All linked spare parts are already assigned.</p>
      )}
    </div>
  );
}
