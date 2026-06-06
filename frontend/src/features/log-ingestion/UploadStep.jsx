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

export default function UploadStep({ onUploaded }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileCount, setFileCount] = useState(0);
  const inputRef = useRef(null);
  const folderInputRef = useRef(null);

  const VALID_EXT = ["csv", "txt", "log", "zip", "xlsx", "xls"];

  const filterValid = (fileList) => {
    const valid = [];
    for (const f of fileList) {
      const ext = (f.name || "").split(".").pop().toLowerCase();
      if (VALID_EXT.includes(ext)) valid.push(f);
    }
    return valid;
  };

  // Recursively read folder entries from drag & drop
  const readEntries = async (entry) => {
    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file((f) => {
          // Attach relative path
          Object.defineProperty(f, "relativePath", { value: entry.fullPath.replace(/^\//, "") });
          resolve([f]);
        }, () => resolve([]));
      });
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      const files = [];
      const readBatch = () => new Promise((resolve) => {
        reader.readEntries((entries) => resolve(entries), () => resolve([]));
      });
      let batch = await readBatch();
      while (batch.length > 0) {
        for (const e of batch) {
          const sub = await readEntries(e);
          files.push(...sub);
        }
        batch = await readBatch();
      }
      return files;
    }
    return [];
  };

  const handleFiles = async (fileList, fromFolder = false) => {
    const valid = filterValid(fileList);
    if (!valid.length) {
      toast.error("No valid log files found (CSV, TXT, LOG, XLSX, XLS, ZIP)");
      return;
    }
    setUploading(true);
    setFileCount(valid.length);

    const CHUNK_SIZE = 5;
    let jobId = null;

    try {
      for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
        const chunk = valid.slice(i, i + CHUNK_SIZE);
        setFileCount(valid.length - i);

        const fd = new FormData();
        if (jobId) fd.append("job_id", jobId);
        for (const f of chunk) {
          const path = f.relativePath || f.webkitRelativePath || f.name;
          fd.append("files", f, path);
        }

        const data = await productionLogsAPI.upload(fd);
        if (!jobId) jobId = data.job_id;
      }

      toast.success(`${valid.length} file(s) uploaded`);
      onUploaded(jobId);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      setFileCount(0);
    }
  };

  const onDrop = async (e) => {
    e.preventDefault();
    setDragging(false);
    // Check for folder drops via webkitGetAsEntry
    const items = e.dataTransfer.items;
    if (items?.length) {
      const allFiles = [];
      for (const item of items) {
        const entry = item.webkitGetAsEntry?.() || item.getAsEntry?.();
        if (entry) {
          const files = await readEntries(entry);
          allFiles.push(...files);
        }
      }
      if (allFiles.length) {
        handleFiles(allFiles, true);
        return;
      }
    }
    handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  return (
    <div className="space-y-3">
      <div
        onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
        className={`border-2 border-dashed rounded-xl p-8 sm:p-12 text-center transition-colors ${
          dragging ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:border-slate-400 bg-slate-50/50"
        }`}
        data-testid="log-upload-dropzone"
      >
        <input ref={inputRef} type="file" multiple accept=".csv,.txt,.log,.zip,.xlsx,.xls" className="hidden"
          onChange={(e) => { handleFiles(Array.from(e.target.files)); e.target.value = ""; }} />
        <input ref={folderInputRef} type="file" className="hidden"
          onChange={(e) => { handleFiles(Array.from(e.target.files), true); e.target.value = ""; }}
          {...{ webkitdirectory: "", directory: "", multiple: true }} />
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            <p className="text-sm text-slate-600">Uploading {fileCount} file(s)...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload className="w-10 h-10 text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-700">Drag & drop files or folders here</p>
              <p className="text-xs text-slate-400 mt-1">CSV, TXT, LOG, XLSX, XLS, ZIP — supports folder structures</p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>Browse Files</Button>
              <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
                className="text-indigo-600 border-indigo-200 hover:bg-indigo-50" data-testid="browse-folder-btn">
                <FolderOpen className="w-3.5 h-3.5 mr-1" /> Browse Folder
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
