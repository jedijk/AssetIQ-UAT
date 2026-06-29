import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "../contexts/LanguageContext";
import { api } from "../lib/apiClient";
import { toast } from "sonner";
import {
  Languages, BookOpen, RefreshCw, Plus, Pencil, Trash2,
  CheckCircle, AlertTriangle, Loader2, Search, Sparkles, ShieldCheck, Play,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

// Supported entity types we can bulk-translate
const ENTITY_TYPES = [
  { id: "failure_mode",              label: "Failure Modes" },
  { id: "equipment_type",            label: "Equipment Types" },
  { id: "equipment_node",            label: "Equipment Hierarchy" },
  { id: "maintenance_task_template", label: "Maintenance Tasks" },
  { id: "observation",               label: "Observations" },
  { id: "investigation",             label: "Investigations" },
  { id: "action",                    label: "Actions" },
  { id: "form_template",             label: "Form Templates" },
];

const TARGET_LANGS = ["nl", "de"];
const CATEGORIES = ["mechanical", "electrical", "instrumentation", "maintenance", "reliability", "process", "safety", "other"];

function CoverageCard({ entityType, data, languages }) {
  const total = data?.total ?? 0;
  const byLang = data?.by_language || {};
  const langs = (data?.languages && data.languages.length ? data.languages : languages) || TARGET_LANGS;

  // Overall completeness = average per-language %
  const langPcts = langs.map(lc => total > 0 ? Math.round(((byLang[lc] ?? 0) / total) * 100) : 0);
  const overall = langPcts.length ? Math.round(langPcts.reduce((a, b) => a + b, 0) / langPcts.length) : 0;
  const color = overall >= 95 ? "bg-emerald-500" : overall >= 60 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="border border-slate-200 rounded-lg p-4 bg-white" data-testid={`coverage-card-${entityType.id}`}>
      <div className="flex items-baseline justify-between mb-1">
        <h4 className="text-sm font-semibold text-slate-800">{entityType.label}</h4>
        <span className="text-xs font-mono text-slate-500">{total} entities</span>
      </div>
      <Progress value={overall} className={`h-2 [&>div]:${color}`} data-testid={`coverage-progress-${entityType.id}`} />
      <div className="mt-2 space-y-1">
        {langs.map(lc => {
          const done = byLang[lc] ?? 0;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          const pctColor = pct >= 95 ? "text-emerald-600" : pct >= 60 ? "text-amber-600" : "text-red-600";
          return (
            <div key={lc} className="flex items-center justify-between text-xs" data-testid={`coverage-lang-${entityType.id}-${lc}`}>
              <span className="text-slate-500 uppercase tracking-wide">{lc}</span>
              <span className="font-mono text-slate-600">
                {done} / {total}
                {" "}
                <span className={`${pctColor} font-semibold`}>({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CoverageTab() {
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(null); // entity_type id while bulk generation in flight
  const [buildingLegacy, setBuildingLegacy] = useState(false);
  const [processingQueue, setProcessingQueue] = useState(false);

  const { data: covData, isLoading: covLoading, refetch: refetchCov } = useQuery({
    queryKey: ["translation-coverage"],
    queryFn: async () => (await api.get("/translations/coverage")).data,
    staleTime: 1000 * 30,
  });

  const { data: jobsData, refetch: refetchJobs } = useQuery({
    queryKey: ["translation-jobs"],
    queryFn: async () => (await api.get("/translations/jobs?limit=10")).data,
    staleTime: 1000 * 15,
    refetchInterval: 5000,
  });

  const { data: pendingData, refetch: refetchPending } = useQuery({
    queryKey: ["translation-jobs-pending"],
    queryFn: async () => (await api.get("/translations/jobs?status=pending&limit=100")).data,
    staleTime: 1000 * 10,
    refetchInterval: 5000,
  });

  const pendingCount = pendingData?.jobs?.length ?? 0;

  const generateAll = useMutation({
    mutationFn: async ({ entityType, onlyMissing = true }) => {
      const r = await api.post(
        `/translations/generate-all/${entityType}?only_missing=${onlyMissing}&queue_only=true&target_languages=nl&target_languages=de`
      );
      return r.data;
    },
    onMutate: ({ entityType }) => setGenerating(entityType),
    onSuccess: (data, { entityType }) => {
      const total = data?.total;
      const msg = total === 0
        ? `${entityType}: nothing to add – already up to date`
        : total > 0
          ? `${entityType}: added ${total} entities to queue`
          : `${entityType}: added to queue`;
      toast.success(msg);
      queryClient.invalidateQueries({ queryKey: ["translation-coverage"] });
      queryClient.invalidateQueries({ queryKey: ["translation-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["translation-jobs-pending"] });
    },
    onError: (e, { entityType }) => {
      toast.error(`Failed to queue ${entityType}: ${e.response?.data?.detail || e.message}`);
    },
    onSettled: () => setGenerating(null),
  });

  const buildLegacy = useMutation({
    mutationFn: async () => {
      const r = await api.post("/translations/build-legacy?only_missing=false&queue_only=true&target_languages=nl&target_languages=de");
      return r.data;
    },
    onMutate: () => setBuildingLegacy(true),
    onSuccess: (data) => {
      const total = data?.total_queued ?? 0;
      const skipped = (data?.summaries || []).filter(s => s.status === "skipped").length;
      if (total === 0) {
        toast.success("All legacy data is already translated");
      } else {
        toast.success(`Added ${total} legacy entities to queue across ${ENTITY_TYPES.length - skipped} entity types`);
      }
      queryClient.invalidateQueries({ queryKey: ["translation-coverage"] });
      queryClient.invalidateQueries({ queryKey: ["translation-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["translation-jobs-pending"] });
    },
    onError: (e) => {
      toast.error(`Failed to queue legacy translations: ${e.response?.data?.detail || e.message}`);
    },
    onSettled: () => setBuildingLegacy(false),
  });

  const processQueue = useMutation({
    mutationFn: async () => (await api.post("/translations/jobs/process-pending?limit=10")).data,
    onMutate: () => setProcessingQueue(true),
    onSuccess: (data) => {
      const started = data?.started ?? 0;
      if (started === 0) {
        toast.info(data?.message || "No pending jobs to execute");
      } else {
        toast.success(`Started processing ${started} queued job${started === 1 ? "" : "s"}`);
      }
      queryClient.invalidateQueries({ queryKey: ["translation-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["translation-jobs-pending"] });
      queryClient.invalidateQueries({ queryKey: ["translation-coverage"] });
    },
    onError: (e) => {
      toast.error(`Failed to execute queue: ${e.response?.data?.detail || e.message}`);
    },
    onSettled: () => setProcessingQueue(false),
  });

  const coverage = covData?.coverage || {};
  const targetLanguages = covData?.target_languages || TARGET_LANGS;
  const jobs = jobsData?.jobs || [];

  return (
    <div className="space-y-6">
      <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Build legacy translations</h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Add AI translation jobs for every existing record (NL + DE) to the queue without running them immediately.
            </p>
          </div>
          <Button
            onClick={() => buildLegacy.mutate()}
            disabled={buildingLegacy || buildLegacy.isPending || processingQueue}
            data-testid="build-legacy-btn"
          >
            {buildingLegacy ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Adding…</>
            ) : (
              <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Add all legacy to queue</>
            )}
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-slate-900">Coverage by entity type</h3>
          <Button variant="outline" size="sm" onClick={() => { refetchCov(); refetchJobs(); refetchPending(); }} data-testid="refresh-coverage-btn">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
        {covLoading ? (
          <div className="text-sm text-slate-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading coverage…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {ENTITY_TYPES.map(et => (
              <div key={et.id} className="space-y-2">
                <CoverageCard entityType={et} data={coverage[et.id]} languages={targetLanguages} />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    disabled={generating === et.id || generateAll.isPending || buildingLegacy || processingQueue}
                    onClick={() => generateAll.mutate({ entityType: et.id, onlyMissing: true })}
                    data-testid={`generate-all-${et.id}`}
                  >
                    {generating === et.id ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Adding…</>
                    ) : (
                      <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Add missing to queue</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    disabled={generating === et.id || generateAll.isPending || buildingLegacy || processingQueue}
                    onClick={() => generateAll.mutate({ entityType: et.id, onlyMissing: false })}
                    data-testid={`rebuild-all-${et.id}`}
                  >
                    Add all to queue
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Jobs */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="text-base font-semibold text-slate-900">Translation queue</h3>
          <Button
            size="sm"
            onClick={() => processQueue.mutate()}
            disabled={processingQueue || processQueue.isPending || pendingCount === 0}
            data-testid="execute-translation-queue-btn"
          >
            {processingQueue ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Executing…</>
            ) : (
              <><Play className="w-3.5 h-3.5 mr-1.5" /> Execute queue{pendingCount > 0 ? ` (${pendingCount})` : ""}</>
            )}
          </Button>
        </div>
        {jobs.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No translation jobs yet.</p>
        ) : (
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white" data-testid="jobs-list">
            {jobs.map(job => (
              <div key={job.id} className="flex items-center justify-between p-3 text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <Badge variant="outline" className="text-[10px]">{job.entity_type}</Badge>
                  <span className="text-slate-600 truncate">
                    {job.target_languages?.join(", ")} · {job.total_items} items
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-slate-500">
                    {job.completed_items}/{job.total_items} done
                    {job.failed_items > 0 && ` · ${job.failed_items} failed`}
                  </span>
                  <Badge
                    className={
                      job.status === "completed" ? "bg-emerald-100 text-emerald-700"
                      : job.status === "failed" ? "bg-red-100 text-red-700"
                      : job.status === "processing" || job.status === "in_progress" ? "bg-blue-100 text-blue-700"
                      : job.status === "pending" ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-600"
                    }
                  >
                    {job.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TermDialog({ open, onOpenChange, term, onSave }) {
  const [form, setForm] = useState(term || {
    source_term: "", category: "mechanical", translations: { nl: "", de: "" }, context: "", is_protected: false,
  });

  useEffect(() => {
    if (term) setForm({
      source_term: term.source_term || "",
      category: term.category || "mechanical",
      translations: term.translations || { nl: "", de: "" },
      context: term.context || "",
      is_protected: !!term.is_protected,
    });
    else setForm({ source_term: "", category: "mechanical", translations: { nl: "", de: "" }, context: "", is_protected: false });
  }, [term, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{term?.id ? "Edit term" : "Add dictionary term"}</DialogTitle>
          <DialogDescription>Enforce consistent terminology across AI translations.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="source_term">Source term (English)</Label>
            <Input
              id="source_term"
              value={form.source_term}
              disabled={!!term?.id}
              onChange={e => setForm({ ...form, source_term: e.target.value })}
              placeholder="e.g. Bearing"
              data-testid="term-source-input"
            />
          </div>
          <div>
            <Label htmlFor="category">Category</Label>
            <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="trans-nl">Dutch (NL)</Label>
              <Input id="trans-nl" value={form.translations.nl} onChange={e => setForm({ ...form, translations: { ...form.translations, nl: e.target.value } })} data-testid="term-nl-input" />
            </div>
            <div>
              <Label htmlFor="trans-de">German (DE)</Label>
              <Input id="trans-de" value={form.translations.de} onChange={e => setForm({ ...form, translations: { ...form.translations, de: e.target.value } })} data-testid="term-de-input" />
            </div>
          </div>
          <div>
            <Label htmlFor="context">Context / usage note (optional)</Label>
            <Input id="context" value={form.context} onChange={e => setForm({ ...form, context: e.target.value })} placeholder="e.g. Rotating equipment context" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.is_protected} onChange={e => setForm({ ...form, is_protected: e.target.checked })} data-testid="term-protected-checkbox" />
            Protected — never auto-overwrite via AI
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!form.source_term.trim()} data-testid="term-save-btn">
            {term?.id ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DictionaryTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [editingTerm, setEditingTerm] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [validateLang, setValidateLang] = useState("nl");
  const [validationIssues, setValidationIssues] = useState(null);

  const { data: dictData, refetch: refetchDict, isLoading } = useQuery({
    queryKey: ["dictionary", category, search],
    queryFn: async () => {
      const params = {};
      if (category !== "all") params.category = category;
      if (search) params.search = search;
      const r = await api.get("/translations/dictionary", { params });
      return r.data;
    },
  });

  const terms = dictData?.terms || [];

  const createTerm = useMutation({
    mutationFn: async (body) => (await api.post("/translations/dictionary", body)).data,
    onSuccess: () => { toast.success("Term added"); setDialogOpen(false); refetchDict(); },
    onError: (e) => toast.error(e.response?.data?.detail || "Failed to add term"),
  });

  const updateTerm = useMutation({
    mutationFn: async ({ id, body }) => (await api.patch(`/translations/dictionary/${id}`, body)).data,
    onSuccess: () => { toast.success("Term updated"); setDialogOpen(false); refetchDict(); },
    onError: (e) => toast.error(e.response?.data?.detail || "Failed to update term"),
  });

  const deleteTerm = useMutation({
    mutationFn: async (id) => (await api.delete(`/translations/dictionary/${id}`)).data,
    onSuccess: () => { toast.success("Term deleted"); refetchDict(); },
    onError: (e) => toast.error(e.response?.data?.detail || "Failed to delete term"),
  });

  const seedDefaults = useMutation({
    mutationFn: async () => (await api.post("/translations/dictionary/seed")).data,
    onSuccess: (d) => { toast.success(`Seeded ${d.created} default terms`); refetchDict(); },
    onError: (e) => toast.error(e.response?.data?.detail || "Failed to seed"),
  });

  const validate = useMutation({
    mutationFn: async (lang) => (await api.post(`/translations/dictionary/validate?language_code=${lang}`)).data,
    onSuccess: (d) => {
      setValidationIssues(d);
      if (d.total_issues === 0) toast.success(`No issues found across ${d.terms_checked} terms`);
      else toast.info(`Found ${d.total_issues} inconsistencies across ${d.terms_checked} terms`);
    },
    onError: (e) => toast.error(e.response?.data?.detail || "Validation failed"),
  });

  const handleSave = (form) => {
    if (editingTerm?.id) {
      updateTerm.mutate({ id: editingTerm.id, body: form });
    } else {
      createTerm.mutate(form);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search terms…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
            data-testid="dictionary-search-input"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44" data-testid="dictionary-category-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => seedDefaults.mutate()} disabled={seedDefaults.isPending} data-testid="seed-defaults-btn">
          {seedDefaults.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
          Seed defaults
        </Button>
        <Button size="sm" onClick={() => { setEditingTerm(null); setDialogOpen(true); }} data-testid="add-term-btn">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add term
        </Button>
      </div>

      {/* Validate Section */}
      <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-slate-800">Validate translations against dictionary</span>
          </div>
          <div className="flex items-center gap-2">
            <Select value={validateLang} onValueChange={setValidateLang}>
              <SelectTrigger className="w-28 h-8 text-xs" data-testid="validate-lang-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nl">Dutch</SelectItem>
                <SelectItem value="de">German</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => validate.mutate(validateLang)} disabled={validate.isPending} data-testid="run-validate-btn">
              {validate.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 mr-1.5" />}
              Run check
            </Button>
          </div>
        </div>
        {validationIssues && (
          <div className="mt-3" data-testid="validation-results">
            {validationIssues.total_issues === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle className="w-4 h-4" />
                Checked {validationIssues.terms_checked} terms — no inconsistencies found.
              </div>
            ) : (
              <div className="text-sm">
                <div className="flex items-center gap-2 text-amber-700 mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  Found {validationIssues.total_issues} inconsistencies (top 20 shown):
                </div>
                <div className="max-h-72 overflow-y-auto border border-slate-200 rounded bg-white divide-y divide-slate-100">
                  {validationIssues.issues.slice(0, 20).map((iss, idx) => (
                    <div key={idx} className="p-2 text-xs flex flex-col gap-0.5" data-testid={`issue-row-${idx}`}>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{iss.entity_type}</Badge>
                        <span className="font-mono text-slate-700 truncate">{iss.translation_value}</span>
                      </div>
                      <div className="text-slate-500">
                        Should use <strong className="text-slate-700">{iss.expected_term}</strong> for "{iss.source_term}" ({iss.category || "—"})
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Terms Table */}
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white" data-testid="dictionary-table">
        <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-50 border-b border-slate-200">
          <div className="col-span-3">Term (EN)</div>
          <div className="col-span-2">Category</div>
          <div className="col-span-3">Dutch</div>
          <div className="col-span-3">German</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>
        {isLoading ? (
          <div className="p-4 text-sm text-slate-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : terms.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 text-center">No terms yet — click "Seed defaults" or "Add term".</div>
        ) : (
          terms.map(term => (
            <div key={term.id} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm border-b border-slate-100 items-center hover:bg-slate-50" data-testid={`term-row-${term.source_term}`}>
              <div className="col-span-3 font-medium text-slate-800 flex items-center gap-1.5">
                {term.is_protected && <ShieldCheck className="w-3.5 h-3.5 text-blue-500" title="Protected" />}
                {term.source_term}
              </div>
              <div className="col-span-2"><Badge variant="outline" className="text-[10px]">{term.category || "—"}</Badge></div>
              <div className="col-span-3 text-slate-600">{term.translations?.nl || <span className="text-slate-300 italic">—</span>}</div>
              <div className="col-span-3 text-slate-600">{term.translations?.de || <span className="text-slate-300 italic">—</span>}</div>
              <div className="col-span-1 flex justify-end gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditingTerm(term); setDialogOpen(true); }} data-testid={`edit-term-${term.source_term}`}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:text-red-700" onClick={() => { if (window.confirm(`Delete "${term.source_term}"?`)) deleteTerm.mutate(term.id); }} data-testid={`delete-term-${term.source_term}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <TermDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingTerm(null); }}
        term={editingTerm}
        onSave={handleSave}
      />
    </div>
  );
}

export default function SettingsTranslationsPage() {
  return (
    <div className="space-y-4" data-testid="settings-translations-page">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
          <Languages className="w-5 h-5 text-blue-600" />
          Translations
        </h2>
        <p className="text-sm text-slate-500">Manage translation coverage and the technical dictionary.</p>
      </div>

      <Tabs defaultValue="coverage" className="w-full">
        <TabsList>
          <TabsTrigger value="coverage" data-testid="tab-coverage">
            <Languages className="w-3.5 h-3.5 mr-1.5" /> Coverage
          </TabsTrigger>
          <TabsTrigger value="dictionary" data-testid="tab-dictionary">
            <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Dictionary
          </TabsTrigger>
        </TabsList>
        <TabsContent value="coverage" className="mt-4">
          <CoverageTab />
        </TabsContent>
        <TabsContent value="dictionary" className="mt-4">
          <DictionaryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
