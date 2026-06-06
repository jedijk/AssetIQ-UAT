import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload, Database, Loader2, CheckCircle2, Trash2, Eye, X,
  FileSpreadsheet, Clock, Play, Settings, BookOpen, BarChart3,
  CheckSquare, Square,
} from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { productionLogsAPI } from "../../lib/apis/productionLogsAPI";
import { STATUS_STYLES, EVENT_COLORS } from "./constants";
import UploadStep from "./UploadStep";
import ConfigureStep from "./ConfigureStep";
import PreviewStep from "./PreviewStep";
import BatchConfigureStep from "./BatchConfigureStep";
import TemplatesPanel from "./TemplatesPanel";
import LogDashboard from "./LogDashboard";

export default function SettingsLogIngestionPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [stats, setStats] = useState(null);

  // Wizard state
  const [step, setStep] = useState("list"); // list, upload, configure, preview, batch-configure
  const [activeJobId, setActiveJobId] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [selectedJobs, setSelectedJobs] = useState(new Set());
  const [showCompleted, setShowCompleted] = useState(false);

  const isOwner = user?.role === "owner";

  const fetchJobs = useCallback(async () => {
    try {
      const data = await productionLogsAPI.listJobs();
      setJobs(data.jobs || []);
    } catch {} finally { setJobsLoading(false); }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      setStats(await productionLogsAPI.getStats());
    } catch {}
  }, []);

  useEffect(() => { if (isOwner) { fetchJobs(); fetchStats(); } else { setJobsLoading(false); } }, [isOwner, fetchJobs, fetchStats]);

  // Auto-refresh while any jobs are processing
  useEffect(() => {
    const hasProcessing = jobs.some(j => j.status === "processing");
    if (!hasProcessing) return;
    const interval = setInterval(() => {
      fetchJobs();
      fetchStats();
    }, 3000);
    return () => clearInterval(interval);
  }, [jobs, fetchJobs, fetchStats]);

  const deleteJob = async (jobId) => {
    if (!window.confirm("Delete this job and all its ingested data?")) return;
    try {
      await productionLogsAPI.deleteJob(jobId);
      toast.success("Job deleted");
      fetchJobs();
      fetchStats();
    } catch (err) { toast.error(err.message); }
  };

  if (!isOwner) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-slate-500">Owner access required</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto" data-testid="log-ingestion-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-600" />
            Production Log Ingestion
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Upload, parse, and analyze production logs</p>
        </div>
      </div>

      <Tabs defaultValue="ingestion" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="ingestion" className="text-xs"><Upload className="w-3.5 h-3.5 mr-1" /> Ingestion</TabsTrigger>
          <TabsTrigger value="templates" className="text-xs"><BookOpen className="w-3.5 h-3.5 mr-1" /> Templates</TabsTrigger>
          <TabsTrigger value="dashboard" className="text-xs"><BarChart3 className="w-3.5 h-3.5 mr-1" /> Dashboard</TabsTrigger>
        </TabsList>

        <TabsContent value="ingestion">
          {/* Cancel button when in wizard */}
          {step !== "list" && (
            <div className="flex justify-end mb-3">
              <Button variant="outline" size="sm" onClick={() => { setStep("list"); setActiveJobId(null); setPreviewData(null); fetchJobs(); fetchStats(); }}>
                <X className="w-3.5 h-3.5 mr-1" /> Cancel
              </Button>
            </div>
          )}

      {/* Stats bar */}
      {stats && step === "list" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white border rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-slate-700">{stats.total_entries?.toLocaleString()}</div>
            <div className="text-[10px] text-slate-500">Total Log Entries</div>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-blue-600">{stats.total_files?.toLocaleString() || 0}</div>
            <div className="text-[10px] text-slate-500">Total Files</div>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-green-600">{stats.jobs_completed || 0}</div>
            <div className="text-[10px] text-slate-500">Jobs Completed</div>
            {stats.jobs_pending > 0 && (
              <div className="text-[10px] text-amber-600 mt-0.5">{stats.jobs_pending} pending</div>
            )}
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <div className="flex justify-center gap-2 text-xs">
              {Object.entries(stats.events || {}).map(([k, v]) => (
                <Badge key={k} className={`${EVENT_COLORS[k] || "bg-slate-100 text-slate-700"} text-[10px]`}>{k}: {v}</Badge>
              ))}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Events</div>
          </div>
        </div>
      )}

      {/* Step: List / Job History */}
      {step === "list" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={() => setStep("upload")} className="bg-indigo-600 hover:bg-indigo-700" data-testid="new-ingestion-btn">
              <Upload className="w-4 h-4 mr-2" /> New Log Ingestion
            </Button>
            {selectedJobs.size > 0 && (
              <Button onClick={() => setStep("batch-configure")}
                className="bg-green-600 hover:bg-green-700" data-testid="batch-ingest-btn">
                <Play className="w-4 h-4 mr-2" /> Batch Parse & Ingest ({selectedJobs.size} jobs)
              </Button>
            )}
            {jobs.some(j => j.status === "processing") && (
              <span className="flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full" data-testid="processing-indicator">
                <Loader2 className="w-3 h-3 animate-spin" />
                Processing... auto-refreshing
              </span>
            )}
          </div>

          {jobsLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : jobs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No ingestion jobs yet</p>
                <p className="text-xs text-slate-400 mt-1">Upload production logs to get started</p>
              </CardContent>
            </Card>
          ) : (() => {
            const pendingJobs = jobs.filter(j => j.status !== "completed");
            const completedJobs = jobs.filter(j => j.status === "completed");
            const visibleJobs = showCompleted ? jobs : pendingJobs;
            return (
            <div className="space-y-2">
              {/* Filter bar */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  {/* Select all uploaded */}
                  {visibleJobs.some(j => j.status === "uploaded" || j.status === "previewed") && (
                    <button
                      className="text-xs text-blue-600 hover:underline"
                      onClick={() => {
                        const uploadedIds = visibleJobs.filter(j => j.status === "uploaded" || j.status === "previewed").map(j => j.id);
                        setSelectedJobs(prev => {
                          const allSelected = uploadedIds.every(id => prev.has(id));
                          if (allSelected) return new Set();
                          return new Set(uploadedIds);
                        });
                      }}>
                      {visibleJobs.filter(j => j.status === "uploaded" || j.status === "previewed").every(j => selectedJobs.has(j.id))
                        ? "Deselect All" : "Select All Pending"}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {pendingJobs.length > 0 && (
                    <span className="text-xs text-slate-500">{pendingJobs.length} pending</span>
                  )}
                  {completedJobs.length > 0 && (
                    <button
                      className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
                      onClick={() => setShowCompleted(!showCompleted)}
                      data-testid="toggle-completed-jobs"
                    >
                      {showCompleted ? <Eye className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {showCompleted ? `Hide ${completedJobs.length} completed` : `Show ${completedJobs.length} completed`}
                    </button>
                  )}
                </div>
              </div>
              {visibleJobs.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <CheckCircle2 className="w-10 h-10 text-green-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">All files have been imported</p>
                    <button className="text-xs text-blue-600 hover:underline mt-2" onClick={() => setShowCompleted(true)}>
                      Show {completedJobs.length} completed job(s)
                    </button>
                  </CardContent>
                </Card>
              ) : (
              visibleJobs.map(job => {
                const st = STATUS_STYLES[job.status] || STATUS_STYLES.uploaded;
                const canSelect = job.status === "uploaded" || job.status === "previewed";
                const isSelected = selectedJobs.has(job.id);
                return (
                  <Card key={job.id} className={`hover:shadow-sm transition-shadow ${isSelected ? "ring-2 ring-blue-300" : ""}`}>
                    <CardContent className="p-4 flex items-center gap-3">
                      {/* Checkbox */}
                      {canSelect ? (
                        <button className="flex-shrink-0" onClick={() => {
                          setSelectedJobs(prev => {
                            const next = new Set(prev);
                            if (next.has(job.id)) next.delete(job.id); else next.add(job.id);
                            return next;
                          });
                        }} data-testid={`select-job-${job.id}`}>
                          {isSelected
                            ? <CheckSquare className="w-5 h-5 text-blue-600" />
                            : <Square className="w-5 h-5 text-slate-300" />}
                        </button>
                      ) : <div className="w-5" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-700 truncate">
                            {job.files?.map(f => f.filename).join(", ") || "Unknown files"}
                          </span>
                          <Badge className={`${st.bg} ${st.text} text-[10px]`}>{st.label}</Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                          <span><Clock className="w-3 h-3 inline mr-0.5" />{new Date(job.created_at).toLocaleDateString()}</span>
                          <span>{job.total_files} file(s)</span>
                          {job.records_ingested > 0 && <span className="text-green-600">{job.records_ingested} ingested</span>}
                          {job.records_failed > 0 && <span className="text-red-500">{job.records_failed} failed</span>}
                          <span className="text-slate-400">by {job.created_by_name}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {job.status === "uploaded" && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Configure & Parse"
                            onClick={() => { setActiveJobId(job.id); setStep("configure"); }}>
                            <Settings className="w-4 h-4 text-blue-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600"
                          onClick={() => deleteJob(job.id)} title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
              )}
            </div>
            );
          })()}
        </div>
      )}

      {/* Step: Upload */}
      {step === "upload" && (
        <UploadStep onUploaded={(jobId) => { setActiveJobId(jobId); setStep("configure"); }} />
      )}

      {/* Step: Configure */}
      {step === "configure" && activeJobId && (
        <ConfigureStep
          jobId={activeJobId}
          onPreview={(data) => { setPreviewData(data); setStep("preview"); }}
          onBack={() => setStep("list")}
          onIngestDone={() => { setStep("list"); setActiveJobId(null); setShowCompleted(false); fetchJobs(); fetchStats(); }}
        />
      )}

      {/* Step: Preview & Ingest */}
      {step === "preview" && activeJobId && previewData && (
        <PreviewStep
          jobId={activeJobId}
          previewData={previewData}
          onIngest={() => { setStep("list"); setActiveJobId(null); setPreviewData(null); setShowCompleted(false); fetchJobs(); fetchStats(); }}
          onBack={() => setStep("configure")}
        />
      )}

      {/* Step: Batch Configure */}
      {step === "batch-configure" && selectedJobs.size > 0 && (
        <BatchConfigureStep
          jobIds={[...selectedJobs]}
          jobs={jobs.filter(j => selectedJobs.has(j.id))}
          onDone={() => { setStep("list"); setSelectedJobs(new Set()); setShowCompleted(false); fetchJobs(); fetchStats(); }}
          onBack={() => setStep("list")}
        />
      )}
        </TabsContent>

        <TabsContent value="templates">
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-green-800 flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                Parse Templates
              </h3>
              <p className="text-xs text-green-600 mt-1">
                Save column mappings from a training file to reuse for bulk uploads. Templates support fuzzy column matching for files with slightly different column names.
              </p>
            </div>
            <TemplatesPanel />
          </div>
        </TabsContent>

        <TabsContent value="dashboard">
          <LogDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
