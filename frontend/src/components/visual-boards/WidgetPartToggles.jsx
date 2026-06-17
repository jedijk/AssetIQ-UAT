import React from "react";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { getWidgetDisplayParts, isWidgetPartEnabled } from "./widgetDisplayParts";

export default function WidgetPartToggles({ widget, onConfigChange }) {
  const options = getWidgetDisplayParts(widget?.type);
  if (!options.length) return null;

  const parts = widget.config?.parts || {};

  const setPart = (key, enabled) => {
    onConfigChange({ parts: { ...parts, [key]: enabled } });
  };

  return (
    <div className="space-y-2 pt-2 border-t">
      <Label>Display parts</Label>
      <p className="text-[11px] text-slate-500">Turn individual sections on or off for this widget.</p>
      <div className="space-y-2">
        {options.map((opt) => (
          <div key={opt.key} className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-600">{opt.label}</span>
            <Switch
              checked={isWidgetPartEnabled(widget.config, opt.key)}
              onCheckedChange={(v) => setPart(opt.key, v)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
