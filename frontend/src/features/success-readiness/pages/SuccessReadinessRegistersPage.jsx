import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Textarea } from "../../../components/ui/textarea";
import { successReadinessAPI } from "../../../lib/apis/successReadiness";
import { SuccessReadinessLoading } from "../components/SuccessReadinessLayout";
import { KpiStatusBadge } from "../components/SuccessReadinessShared";
import { REGISTER_FIELDS, REGISTER_TYPES, STATUS_OPTIONS } from "../config/registers";

const EMPTY_FORM = {
  title: "",
  owner: "",
  status: "draft",
  metadata: {},
};

function buildPayload(registerType, form) {
  const fields = REGISTER_FIELDS[registerType] || [];
  const metadata = { ...(form.metadata || {}) };
  let title = form.title?.trim();
  let owner = form.owner?.trim();

  for (const field of fields) {
    const value = form[field.key];
    if (field.useTitle && value) title = value;
    if (field.useOwner && value) owner = value;
    if (field.metadataKey && value !== undefined && value !== "") {
      if (field.type === "checkbox") {
        metadata[field.metadataKey] = Boolean(value);
      } else {
        metadata[field.metadataKey] = value;
      }
    }
  }

  return {
    title: title || "Untitled",
    owner: owner || undefined,
    status: form.status || metadata.status || "draft",
    metadata,
  };
}

function RegisterForm({ registerType, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const fields = REGISTER_FIELDS[registerType] || [];

  const mutation = useMutation({
    mutationFn: (payload) => successReadinessAPI.createRegister(registerType, payload),
    onSuccess: () => {
      toast.success("Register entry saved");
      setForm(EMPTY_FORM);
      onSaved();
    },
    onError: () => toast.error("Failed to save register entry"),
  });

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">Add entry</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {fields.map((field) => (
          <div key={field.key} className={field.type === "textarea" ? "md:col-span-2" : ""}>
            <Label className="text-xs">{field.label}</Label>
            {field.type === "textarea" ? (
              <Textarea
                value={form[field.key] || ""}
                onChange={(e) => setField(field.key, e.target.value)}
                className="mt-1 min-h-[72px]"
              />
            ) : field.type === "checkbox" ? (
              <div className="mt-2">
                <input
                  type="checkbox"
                  checked={Boolean(form[field.key])}
                  onChange={(e) => setField(field.key, e.target.checked)}
                  className="h-4 w-4"
                />
              </div>
            ) : (
              <Input
                type={field.type === "date" ? "date" : "text"}
                value={form[field.key] || ""}
                onChange={(e) => setField(field.key, e.target.value)}
                className="mt-1 h-9"
              />
            )}
          </div>
        ))}
        <div>
          <Label className="text-xs">Status</Label>
          <Select value={form.status} onValueChange={(v) => setField("status", v)}>
            <SelectTrigger className="mt-1 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button
        size="sm"
        onClick={() => mutation.mutate(buildPayload(registerType, form))}
        disabled={mutation.isPending}
      >
        <Plus className="w-4 h-4 mr-1" />
        Add entry
      </Button>
    </div>
  );
}

export default function SuccessReadinessRegistersPage() {
  const queryClient = useQueryClient();
  const [activeType, setActiveType] = useState(REGISTER_TYPES[0].id);

  const { data, isLoading } = useQuery({
    queryKey: ["success-readiness", "registers", activeType],
    queryFn: () => successReadinessAPI.getRegisters(activeType),
  });

  const updateMutation = useMutation({
    mutationFn: ({ entryId, payload }) =>
      successReadinessAPI.updateRegister(activeType, entryId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["success-readiness"] });
      toast.success("Entry updated");
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["success-readiness"] });
  };

  const entries = data || [];
  const activeMeta = useMemo(
    () => REGISTER_TYPES.find((t) => t.id === activeType),
    [activeType]
  );

  if (isLoading) return <SuccessReadinessLoading />;

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Registers</h2>
        <p className="text-sm text-slate-500 mt-1">
          Maintain training, champion, procedure, and governance records used to score manual KPIs.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {REGISTER_TYPES.map((type) => (
          <Button
            key={type.id}
            variant={activeType === type.id ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveType(type.id)}
          >
            {type.label}
          </Button>
        ))}
      </div>

      <RegisterForm registerType={activeType} onSaved={invalidate} />

      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-2 text-xs font-medium text-slate-600">
          {activeMeta?.label} entries · KPI: {activeMeta?.kpiId}
        </div>
        {!entries.length ? (
          <p className="p-4 text-sm text-slate-500">No entries yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {entries.map((entry) => (
              <div key={entry.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">{entry.title}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {entry.owner ? `Owner: ${entry.owner}` : null}
                    {entry.completion_pct != null ? ` · ${entry.completion_pct}% complete` : null}
                  </div>
                  {entry.metadata && (
                    <pre className="mt-2 text-[11px] text-slate-600 whitespace-pre-wrap">
                      {JSON.stringify(entry.metadata, null, 0)}
                    </pre>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <KpiStatusBadge
                    status={
                      entry.completion_pct >= 100
                        ? "on_track"
                        : entry.completion_pct > 0
                          ? "at_risk"
                          : "not_started"
                    }
                  />
                  {activeType === "governance" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        updateMutation.mutate({
                          entryId: entry.id,
                          payload: { status: "completed", metadata: { ...entry.metadata, status: "completed" } },
                        })
                      }
                    >
                      <Save className="w-3.5 h-3.5 mr-1" />
                      Mark done
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
