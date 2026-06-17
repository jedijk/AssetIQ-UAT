import React from "react";
import { Trash2 } from "lucide-react";
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
import { CHART_METRICS, KPI_METRICS } from "./widgetLibrary";

const WidgetConfigPanel = ({ widget, onChange, onRemove }) => {
  if (!widget) {
    return (
      <div className="text-sm text-slate-500 p-4">
        Select a widget on the canvas to configure it.
      </div>
    );
  }

  const update = (patch) => onChange({ ...widget, ...patch });
  const updateConfig = (patch) =>
    onChange({ ...widget, config: { ...(widget.config || {}), ...patch } });
  const updatePosition = (patch) =>
    onChange({ ...widget, position: { ...(widget.position || {}), ...patch } });

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-slate-900">Widget Config</h3>
        <Button variant="ghost" size="sm" onClick={() => onRemove(widget.id)}>
          <Trash2 className="w-4 h-4 text-red-500" />
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Title</Label>
        <Input value={widget.title || ""} onChange={(e) => update({ title: e.target.value })} />
      </div>

      <div className="space-y-2">
        <Label>Type</Label>
        <Input value={widget.type} disabled className="bg-slate-100" />
      </div>

      {widget.type === "kpi_card" && (
        <div className="space-y-2">
          <Label>Metric</Label>
          <Select
            value={widget.config?.metric || "active_threat_exposure"}
            onValueChange={(v) => updateConfig({ metric: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {KPI_METRICS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {(widget.type === "observation_list" || widget.type === "action_queue") && (
        <div className="space-y-2">
          <Label>Item limit</Label>
          <Input
            type="number"
            min={1}
            max={50}
            value={widget.config?.limit ?? 10}
            onChange={(e) => updateConfig({ limit: Number(e.target.value) })}
          />
        </div>
      )}

      {widget.type === "trend_chart" && (
        <>
          <div className="space-y-2">
            <Label>Chart metric</Label>
            <Select
              value={widget.config?.chart_metric || "active_threat_exposure"}
              onValueChange={(v) => updateConfig({ chart_metric: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHART_METRICS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Days</Label>
            <Input
              type="number"
              min={7}
              max={365}
              value={widget.config?.days ?? 30}
              onChange={(e) => updateConfig({ days: Number(e.target.value) })}
            />
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-2 pt-2 border-t">
        <div className="space-y-1">
          <Label className="text-xs">Width (cols)</Label>
          <Input
            type="number"
            min={1}
            max={12}
            value={widget.position?.w ?? 3}
            onChange={(e) => updatePosition({ w: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Height (rows)</Label>
          <Input
            type="number"
            min={1}
            max={12}
            value={widget.position?.h ?? 2}
            onChange={(e) => updatePosition({ h: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">X</Label>
          <Input
            type="number"
            min={0}
            max={11}
            value={widget.position?.x ?? 0}
            onChange={(e) => updatePosition({ x: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Y</Label>
          <Input
            type="number"
            min={0}
            max={11}
            value={widget.position?.y ?? 0}
            onChange={(e) => updatePosition({ y: Number(e.target.value) })}
          />
        </div>
      </div>
    </div>
  );
};

export default WidgetConfigPanel;
