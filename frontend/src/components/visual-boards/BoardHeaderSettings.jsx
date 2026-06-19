import React from "react";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { normalizeBoardHeader } from "./boardHeaderConfig";

export default function BoardHeaderSettings({ header, onChange, showTyromerControls = false }) {
  const config = normalizeBoardHeader(header);

  const update = (patch) => onChange({ ...config, ...patch });

  return (
    <div className="space-y-3 pt-2 border-t">
      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase">Board Header</div>
        <p className="text-[11px] text-slate-500 mt-0.5">Logo sizes and title between logos.</p>
      </div>
      <div className="space-y-2">
        <Label className="text-xs">AssetIQ logo height (px)</Label>
        <Input
          type="number"
          min={16}
          max={160}
          value={config.assetiq_logo_height}
          onChange={(e) => update({ assetiq_logo_height: Number(e.target.value) || 56 })}
        />
      </div>
      {showTyromerControls ? (
        <div className="space-y-2">
          <Label className="text-xs">Tyromer logo height (px)</Label>
          <Input
            type="number"
            min={16}
            max={160}
            value={config.tyromer_logo_height}
            onChange={(e) => update({ tyromer_logo_height: Number(e.target.value) || 32 })}
          />
        </div>
      ) : null}
      <div className="space-y-2">
        <Label className="text-xs">Display title</Label>
        <Input
          value={config.display_title || ""}
          onChange={(e) => update({ display_title: e.target.value })}
          placeholder={config.display_title ? undefined : "Uses board name when empty"}
        />
        <p className="text-[11px] text-slate-500">Shown centered in the board header on preview and TV.</p>
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Title font size (px)</Label>
        <Input
          type="number"
          min={10}
          max={72}
          value={config.title_font_size}
          onChange={(e) => update({ title_font_size: Number(e.target.value) || 16 })}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs">Transparent logo background</Label>
        <Switch
          checked={config.transparent_logo_background !== false}
          onCheckedChange={(v) => update({ transparent_logo_background: v })}
        />
      </div>
    </div>
  );
}
