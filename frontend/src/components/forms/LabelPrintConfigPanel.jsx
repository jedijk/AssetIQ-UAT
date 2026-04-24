import { useQuery } from "@tanstack/react-query";
import { Tag, Info } from "lucide-react";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { labelsAPI } from "../../lib/api";

/**
 * Configures label printing for a form template.
 * Props:
 *  - config: { enabled, label_template_id, trigger, button_label }
 *  - onChange(patch)
 */
export default function LabelPrintConfigPanel({ config = {}, onChange }) {
  const { data } = useQuery({
    queryKey: ["label-templates", "published"],
    queryFn: () => labelsAPI.listTemplates(),
  });
  const templates = (data?.templates || []).filter((t) => t.status !== "archived");

  return (
    <div className="space-y-3 p-4 border border-violet-200 rounded-lg bg-violet-50/30">
      <div className="flex items-center gap-2">
        <Tag className="w-4 h-4 text-violet-600" />
        <Label className="text-sm font-medium text-violet-800">Label Printing Settings</Label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Label Template</Label>
          <Select
            value={config.label_template_id || ""}
            onValueChange={(v) => onChange({ label_template_id: v })}
          >
            <SelectTrigger data-testid="form-label-template-select">
              <SelectValue placeholder="Pick a label template…" />
            </SelectTrigger>
            <SelectContent>
              {templates.length === 0 && (
                <div className="px-2 py-1 text-xs text-slate-500">
                  No label templates yet. Create one at /labels.
                </div>
              )}
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} · {t.width_mm}×{t.height_mm}mm
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">When to print</Label>
          <Select
            value={config.trigger || "manual"}
            onValueChange={(v) => onChange({ trigger: v })}
          >
            <SelectTrigger data-testid="form-label-trigger-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual — show a Print Label button</SelectItem>
              <SelectItem value="on_submit">Auto — open print dialog after submit</SelectItem>
              <SelectItem value="both">Both — button + auto after submit</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label className="text-xs">Button label</Label>
          <Input
            value={config.button_label || "Print Label"}
            onChange={(e) => onChange({ button_label: e.target.value })}
            placeholder="Print Label"
          />
        </div>
      </div>

      <div className="flex items-start gap-2 text-[11px] text-violet-700 bg-white/70 rounded-lg p-2 border border-violet-100">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <p>
          Label bindings can reference any form field via <code className="bg-violet-100 px-1 rounded">{'{form.field_id}'}</code>, plus
          standard asset fields (<code className="bg-violet-100 px-1 rounded">{'{asset_id}'}</code>,
          <code className="bg-violet-100 px-1 rounded">{'{asset_name}'}</code>, etc.) — use a <strong>Custom</strong> binding in the label designer with a value like <code className="bg-violet-100 px-1 rounded">Lot {'{form.lot_no}'}</code>.
        </p>
      </div>
    </div>
  );
}
