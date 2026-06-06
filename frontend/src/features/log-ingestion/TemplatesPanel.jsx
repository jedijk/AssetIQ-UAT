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

export default function TemplatesPanel() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const data = await productionLogsAPI.listTemplates();
      setTemplates(data.templates || []);
    } catch (err) {
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleDelete = async (templateId, name) => {
    if (!window.confirm(`Delete template "${name}"?`)) return;
    setDeleting(templateId);
    try {
      await productionLogsAPI.deleteTemplate(templateId);
      toast.success("Template deleted");
      fetchTemplates();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No saved templates yet</p>
          <p className="text-xs text-slate-400 mt-1">
            Configure and save a template during the ingestion process to reuse it for bulk uploads
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">{templates.length} saved template(s)</p>
        <Button variant="outline" size="sm" onClick={fetchTemplates}>
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>
      <div className="grid gap-3">
        {templates.map(t => (
          <Card key={t.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-slate-900 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    {t.name}
                  </h4>
                  {t.description && <p className="text-xs text-slate-500 mt-1">{t.description}</p>}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="outline" className="text-[10px]">
                      Delimiter: {t.template?.delimiter === "\t" ? "Tab" : t.template?.delimiter || ","}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      Timestamp: {t.template?.column_mapping?.timestamp || "N/A"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      Asset: {t.template?.column_mapping?.asset_id || "N/A"}
                    </Badge>
                    {(t.template?.column_mapping?.metric_columns?.length > 0) && (
                      <Badge variant="outline" className="text-[10px]">
                        {t.template.column_mapping.metric_columns.length} metrics
                      </Badge>
                    )}
                  </div>
                  {Object.keys(t.column_aliases || {}).length > 0 && (
                    <p className="text-[10px] text-slate-400 mt-2">
                      {Object.keys(t.column_aliases).length} column aliases defined
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Badge className="bg-blue-100 text-blue-700 text-[10px]">
                    Used {t.usage_count || 0}x
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(t.id, t.name)}
                    disabled={deleting === t.id}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                  >
                    {deleting === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}


// ======================== Merged Viscosity + Metrics Chart ========================

const CHART_SERIES = [
  { key: "rpm", label: "RPM", color: "#3b82f6" },
  { key: "feed", label: "Feed", color: "#f97316" },
  { key: "mp4", label: "MP4", color: "#14b8a6" },
  { key: "t_product_ir", label: "T Product IR", color: "#ef4444" },
  { key: "magnetCleaning", label: "Magnet Cleaning", color: "#ec4899" },
];
