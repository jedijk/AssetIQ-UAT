import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Upload, FileText, Loader2, CheckCircle2, XCircle, AlertCircle,
  Trash2, ChevronLeft, ChevronRight, Database, Settings, RefreshCw, Play, Eye, X,
  FileSpreadsheet, Clock, Activity, FolderOpen, BarChart3, Sparkles, TrendingUp,
  CheckSquare, Square, Save, BookOpen, Copy, Check, AlertTriangle, FlaskConical, Package, Sigma
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import { toast } from "sonner";
import { productionLogsAPI } from "../../lib/apis/productionLogsAPI";
import { STATUS_STYLES, EVENT_COLORS } from "./constants";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Line, ComposedChart, ReferenceLine, ReferenceArea,
} from "recharts";

export default function SaveTemplateModal({ isOpen, onClose, template, columns, onSaved }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [aliases, setAliases] = useState({});  // {column: "alias1, alias2"}

  useEffect(() => {
    if (isOpen) {
      setName("");
      setDescription("");
      // Initialize aliases for mapped columns
      const initialAliases = {};
      if (template?.column_mapping?.timestamp) initialAliases[template.column_mapping.timestamp] = "";
      if (template?.column_mapping?.asset_id) initialAliases[template.column_mapping.asset_id] = "";
      if (template?.column_mapping?.status) initialAliases[template.column_mapping.status] = "";
      (template?.column_mapping?.metric_columns || []).forEach(col => {
        initialAliases[col] = "";
      });
      setAliases(initialAliases);
    }
  }, [isOpen, template]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Please enter a template name");
      return;
    }
    setSaving(true);
    try {
      // Convert comma-separated aliases to arrays
      const columnAliases = {};
      Object.entries(aliases).forEach(([col, aliasStr]) => {
        if (aliasStr.trim()) {
          columnAliases[col] = aliasStr.split(",").map(a => a.trim()).filter(Boolean);
        }
      });

      const data = await productionLogsAPI.createTemplate({
          name: name.trim(),
          description: description.trim() || null,
          template,
          column_aliases: columnAliases,
        });
      toast.success(`Template "${name}" saved!`);
      onSaved?.(data);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const mappedColumns = [
    template?.column_mapping?.timestamp,
    template?.column_mapping?.asset_id,
    template?.column_mapping?.status,
    ...(template?.column_mapping?.metric_columns || []),
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <Save className="w-4 h-4 text-indigo-600" />
            Save as Template
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <Label className="text-sm font-medium">Template Name *</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Production Line A Logs"
              className="mt-1"
              data-testid="template-name-input"
            />
          </div>
          <div>
            <Label className="text-sm font-medium">Description</Label>
            <Input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description..."
              className="mt-1"
            />
          </div>

          {/* Column Aliases Section */}
          <div className="border-t pt-4">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700">Column Aliases (for fuzzy matching)</span>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Add alternative column names that should map to each field. This helps when different files use slightly different column names.
            </p>
            <div className="space-y-2">
              {mappedColumns.map(col => (
                <div key={col} className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-600 min-w-[100px] truncate" title={col}>
                    {col}
                  </span>
                  <Input
                    value={aliases[col] || ""}
                    onChange={e => setAliases(prev => ({ ...prev, [col]: e.target.value }))}
                    placeholder="alias1, alias2, ..."
                    className="flex-1 h-8 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Template Preview */}
          <div className="bg-slate-50 rounded-lg p-3 text-xs">
            <div className="font-medium text-slate-700 mb-2">Template Configuration:</div>
            <div className="grid grid-cols-2 gap-1 text-slate-600">
              <span>Delimiter:</span><span className="font-mono">{template?.delimiter === "\t" ? "Tab" : template?.delimiter}</span>
              <span>Has Header:</span><span>{template?.has_header ? "Yes" : "No"}</span>
              <span>Skip Rows:</span><span>{template?.skip_rows || 0}</span>
              <span>Timestamp:</span><span className="truncate">{template?.column_mapping?.timestamp || "-"}</span>
              <span>Asset ID:</span><span className="truncate">{template?.column_mapping?.asset_id || "-"}</span>
              <span>Metrics:</span><span className="truncate">{(template?.column_mapping?.metric_columns || []).length} columns</span>
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()} className="bg-indigo-600 hover:bg-indigo-700">
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
            Save Template
          </Button>
        </div>
      </div>
    </div>
  );
}


// ======================== Templates Panel ========================
