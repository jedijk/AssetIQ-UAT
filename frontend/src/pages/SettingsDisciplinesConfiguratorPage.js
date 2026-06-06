/**
 * Settings → Disciplines Configurator (P1).
 * - Admin-only CRUD for the discipline taxonomy (single source of truth
 *   used across Forms, Tasks, Actions, AI Recommendations, FMEA, Maintenance).
 * - Reorder via up/down buttons (simple, no drag-lib dependency).
 * - Aliases as chips (resolve free-text inputs to canonical values).
 * - Color picker (Tailwind classes).
 * - Default assignee per discipline (optional, used by the task bridge in P4).
 * - Cleanup Suggestions panel: scans all discipline-bearing collections and
 *   offers one-click merge for unknown variants.
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Edit2,
  Trash2,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  Sparkles,
  X,
  Tag as TagIcon,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { toast } from "sonner";
import { SettingsSection, SettingsCard } from "./SettingsPage";
import { getBackendUrl, getAuthFetchInit } from "../lib/apiConfig";

const API_BASE_URL = getBackendUrl();

async function fetchJson(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, getAuthFetchInit({
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  }));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

// Tailwind palette swatches (label / color class pairs)
const COLOR_PALETTE = [
  { label: "Blue", className: "bg-blue-100 text-blue-700" },
  { label: "Slate", className: "bg-slate-100 text-slate-700" },
  { label: "Teal", className: "bg-teal-100 text-teal-700" },
  { label: "Amber", className: "bg-amber-100 text-amber-700" },
  { label: "Purple", className: "bg-purple-100 text-purple-700" },
  { label: "Orange", className: "bg-orange-100 text-orange-700" },
  { label: "Green", className: "bg-green-100 text-green-700" },
  { label: "Cyan", className: "bg-cyan-100 text-cyan-700" },
  { label: "Rose", className: "bg-rose-100 text-rose-700" },
  { label: "Indigo", className: "bg-indigo-100 text-indigo-700" },
  { label: "Pink", className: "bg-pink-100 text-pink-700" },
];

export default function SettingsDisciplinesConfiguratorPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null); // { ...discipline } | null
  const [creating, setCreating] = useState(false);
  const [mergeTargetFor, setMergeTargetFor] = useState(null); // suggestion row being merged

  const { data: list, isLoading: listLoading } = useQuery({
    queryKey: ["disciplines", "all"],
    queryFn: () => fetchJson("/api/disciplines?include_inactive=true"),
  });
  const disciplines = list?.disciplines || [];

  const { data: cleanup, isLoading: cleanupLoading } = useQuery({
    queryKey: ["discipline-cleanup"],
    queryFn: () => fetchJson("/api/disciplines/cleanup-suggestions"),
  });
  const suggestions = cleanup?.suggestions || [];

  const { data: users } = useQuery({
    queryKey: ["users-list-min"],
    queryFn: () =>
      fetchJson("/api/rbac/users?limit=200").catch(() => ({ users: [] })),
  });
  const userOptions = users?.users || users || [];

  const reorderMutation = useMutation({
    mutationFn: (items) =>
      fetchJson("/api/disciplines/reorder", {
        method: "PATCH",
        body: JSON.stringify(items),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["disciplines"] }),
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => fetchJson(`/api/disciplines/${id}`, { method: "DELETE" }),
    onSuccess: (data) => {
      if (data.soft_deleted) {
        toast.warning(
          `Deactivated (${data.references} records still reference this discipline)`,
        );
      } else {
        toast.success("Discipline removed");
      }
      qc.invalidateQueries({ queryKey: ["disciplines"] });
      qc.invalidateQueries({ queryKey: ["discipline-cleanup"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const mergeMutation = useMutation({
    mutationFn: ({ variants, targetId, mode, dryRun }) =>
      fetchJson("/api/disciplines/merge", {
        method: "POST",
        body: JSON.stringify({
          variants,
          target_discipline_id: targetId,
          mode,
          dry_run: dryRun,
        }),
      }),
    onSuccess: (data) => {
      if (data.dry_run) return; // dry-run only updates preview
      toast.success(
        data.mode === "alias_only"
          ? `Added ${data.aliases_added.length} alias(es)`
          : `Merged: rewrote ${data.total_rewritten || 0} records across collections`,
      );
      qc.invalidateQueries({ queryKey: ["disciplines"] });
      qc.invalidateQueries({ queryKey: ["discipline-cleanup"] });
      setMergeTargetFor(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const ordered = useMemo(
    () => [...disciplines].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [disciplines],
  );

  const moveItem = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= ordered.length) return;
    const a = ordered[idx];
    const b = ordered[j];
    reorderMutation.mutate([
      { id: a.id, sort_order: b.sort_order },
      { id: b.id, sort_order: a.sort_order },
    ]);
  };

  return (
    <SettingsSection
      title="Disciplines"
      description="Single source of truth for the discipline taxonomy used across Forms, Tasks, Actions, AI, FMEA and Maintenance."
    >
      {/* List */}
      <SettingsCard
        title={`Disciplines (${ordered.length})`}
        description="Reorder with the arrows. Click a row to edit aliases, color and default assignee."
        actions={
          <Button
            size="sm"
            onClick={() => setCreating(true)}
            data-testid="add-discipline-btn"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add discipline
          </Button>
        }
      >
        {listLoading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : ordered.length === 0 ? (
          <div className="text-sm text-slate-500">No disciplines configured yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {ordered.map((d, idx) => (
              <div
                key={d.id}
                className="flex items-center gap-3 py-3"
                data-testid={`discipline-row-${d.value}`}
              >
                <div className="flex flex-col">
                  <button
                    className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    onClick={() => moveItem(idx, -1)}
                    disabled={idx === 0}
                    aria-label="Move up"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    onClick={() => moveItem(idx, 1)}
                    disabled={idx === ordered.length - 1}
                    aria-label="Move down"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
                <Badge className={`${d.color} border-0`}>{d.label}</Badge>
                <span className="text-xs text-slate-400 font-mono">{d.value}</span>
                {!d.is_active && (
                  <Badge variant="outline" className="text-[10px] text-slate-500">
                    Inactive
                  </Badge>
                )}
                <div className="flex items-center gap-1 flex-wrap ml-auto">
                  {(d.aliases || []).slice(0, 4).map((a) => (
                    <span
                      key={a}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200"
                    >
                      {a}
                    </span>
                  ))}
                  {(d.aliases || []).length > 4 && (
                    <span className="text-[10px] text-slate-400">
                      +{d.aliases.length - 4}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setEditing(d)}
                  data-testid={`edit-discipline-${d.value}`}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-rose-500 hover:text-rose-700"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove "${d.label}"? If records reference it the discipline will be deactivated instead of deleted.`,
                      )
                    ) {
                      deleteMutation.mutate(d.id);
                    }
                  }}
                  data-testid={`delete-discipline-${d.value}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      {/* Cleanup suggestions */}
      <SettingsCard
        title="Cleanup Suggestions"
        description="Free-text discipline values found in your records that don't yet match any canonical discipline."
      >
        {cleanupLoading ? (
          <div className="text-sm text-slate-500">Scanning records…</div>
        ) : suggestions.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
            <Sparkles className="w-4 h-4" /> All current discipline values match
            a canonical entry or an alias. Nothing to clean up.
          </div>
        ) : (
          <div className="space-y-2">
            {suggestions.map((s) => (
              <div
                key={s.variant_lower}
                className="flex items-center gap-3 p-3 border border-amber-200 bg-amber-50/40 rounded-md"
                data-testid={`cleanup-suggestion-${s.variant_lower}`}
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-800">
                      “{s.variant}”
                    </span>
                    <span className="text-xs text-slate-500">
                      · {s.total} record(s) across{" "}
                      {Object.keys(s.by_collection).length} collection(s)
                    </span>
                  </div>
                  {s.suggested && (
                    <div className="text-xs text-slate-500 mt-0.5">
                      Suggested merge into{" "}
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {s.suggested.label}
                      </Badge>
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMergeTargetFor(s)}
                  data-testid={`merge-suggestion-${s.variant_lower}`}
                >
                  Merge…
                </Button>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      {/* Create / Edit dialog */}
      <DisciplineFormDialog
        key={editing?.id || (creating ? "new" : "closed")}
        open={creating || !!editing}
        initial={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["disciplines"] });
          qc.invalidateQueries({ queryKey: ["discipline-cleanup"] });
        }}
        userOptions={userOptions}
      />

      {/* Merge dialog */}
      <MergeDialog
        key={mergeTargetFor?.variant_lower || "merge-closed"}
        open={!!mergeTargetFor}
        suggestion={mergeTargetFor}
        disciplines={ordered}
        onClose={() => setMergeTargetFor(null)}
        onConfirm={(targetId, mode) =>
          mergeMutation.mutate({
            variants: [mergeTargetFor.variant],
            targetId,
            mode,
            dryRun: false,
          })
        }
        onDryRun={(targetId, mode) =>
          mergeMutation.mutateAsync({
            variants: [mergeTargetFor.variant],
            targetId,
            mode,
            dryRun: true,
          })
        }
      />
    </SettingsSection>
  );
}

// ---------- Create / Edit Form ----------
function DisciplineFormDialog({ open, initial, onClose, onSaved, userOptions }) {
  const qc = useQueryClient();
  const isEdit = !!initial;
  // The parent passes a `key` based on `initial?.id` so this component
  // remounts whenever a different discipline is being edited. That lets us
  // initialize state directly from props without any prop-sync effect.
  const [form, setForm] = useState(() =>
    initial
      ? {
          value: initial.value,
          label: initial.label,
          color: initial.color || COLOR_PALETTE[0].className,
          aliases: initial.aliases || [],
          default_assignee_user_id: initial.default_assignee_user_id || null,
          is_active: initial.is_active ?? true,
        }
      : {
          value: "",
          label: "",
          color: COLOR_PALETTE[0].className,
          aliases: [],
          default_assignee_user_id: null,
          is_active: true,
        },
  );
  const [aliasInput, setAliasInput] = useState("");

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        return fetchJson(`/api/disciplines/${initial.id}`, {
          method: "PUT",
          body: JSON.stringify({
            label: form.label,
            color: form.color,
            aliases: form.aliases,
            default_assignee_user_id: form.default_assignee_user_id || null,
            is_active: form.is_active,
          }),
        });
      }
      return fetchJson("/api/disciplines", {
        method: "POST",
        body: JSON.stringify({
          value: form.value,
          label: form.label,
          color: form.color,
          aliases: form.aliases,
          default_assignee_user_id: form.default_assignee_user_id || null,
          is_active: form.is_active,
        }),
      });
    },
    onSuccess: () => {
      toast.success(isEdit ? "Discipline updated" : "Discipline created");
      qc.invalidateQueries({ queryKey: ["disciplines"] });
      onSaved?.();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const addAlias = () => {
    const v = aliasInput.trim().toLowerCase();
    if (!v) return;
    if (form.aliases.includes(v)) return;
    setForm({ ...form, aliases: [...form.aliases, v] });
    setAliasInput("");
  };

  const removeAlias = (a) => {
    setForm({ ...form, aliases: form.aliases.filter((x) => x !== a) });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg" data-testid="discipline-form-dialog">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Edit ${initial?.label}` : "Add discipline"}
          </DialogTitle>
          <DialogDescription>
            Disciplines flow through Forms, Tasks, Actions, AI Recommendations
            and Maintenance. Aliases let free-text inputs resolve to a canonical
            value.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Value (machine key)</Label>
              <Input
                value={form.value}
                disabled={isEdit}
                onChange={(e) =>
                  setForm({
                    ...form,
                    value: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
                  })
                }
                placeholder="e.g. mechanical_seal"
                data-testid="discipline-value-input"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">
                Auto-lowercased, snake_case. Cannot be changed after creation.
              </p>
            </div>
            <div>
              <Label className="text-xs">Label (displayed)</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Mechanical Seal"
                data-testid="discipline-label-input"
              />
            </div>
          </div>

          {/* Color */}
          <div>
            <Label className="text-xs">Color</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c.className}
                  type="button"
                  onClick={() => setForm({ ...form, color: c.className })}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                    c.className
                  } ${
                    form.color === c.className
                      ? "ring-2 ring-offset-1 ring-slate-700"
                      : "opacity-70 hover:opacity-100"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Aliases */}
          <div>
            <Label className="text-xs flex items-center gap-1">
              <TagIcon className="w-3 h-3" /> Aliases (resolve free-text inputs to this discipline)
            </Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAlias();
                  }
                }}
                placeholder="Type and press Enter"
                data-testid="discipline-alias-input"
              />
              <Button type="button" variant="outline" onClick={addAlias}>
                Add
              </Button>
            </div>
            {form.aliases.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.aliases.map((a) => (
                  <span
                    key={a}
                    className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1"
                  >
                    {a}
                    <button onClick={() => removeAlias(a)}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Default assignee */}
          <div>
            <Label className="text-xs">Default assignee (optional)</Label>
            <Select
              value={form.default_assignee_user_id || "_none"}
              onValueChange={(v) =>
                setForm({
                  ...form,
                  default_assignee_user_id: v === "_none" ? null : v,
                })
              }
            >
              <SelectTrigger data-testid="discipline-assignee-select">
                <SelectValue placeholder="No default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">No default</SelectItem>
                {userOptions.map((u) => (
                  <SelectItem key={u.id || u._id} value={u.id || u._id}>
                    {u.name || u.email || u.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Used by the weekly task bridge to auto-route tasks for this discipline.
            </p>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between border-t pt-3">
            <div>
              <Label className="text-sm">Active</Label>
              <p className="text-xs text-slate-500">
                Inactive disciplines stay in historical records but disappear from new pickers.
              </p>
            </div>
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!form.value || !form.label || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            data-testid="discipline-save-btn"
          >
            {saveMutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Merge dialog ----------
function MergeDialog({ open, suggestion, disciplines, onClose, onConfirm, onDryRun }) {
  // Parent passes a `key` based on suggestion variant so this component
  // remounts when the user picks a different suggestion.
  const [targetId, setTargetId] = useState(suggestion?.suggested?.id || "");
  const [mode, setMode] = useState("apply"); // "apply" | "alias_only"
  const [preview, setPreview] = useState(null);

  const handleDryRun = async () => {
    if (!targetId) return;
    try {
      const data = await onDryRun(targetId, mode);
      setPreview(data);
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (!suggestion) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="discipline-merge-dialog">
        <DialogHeader>
          <DialogTitle>Merge “{suggestion.variant}”</DialogTitle>
          <DialogDescription>
            {suggestion.total} record(s) currently use this variant. Choose how
            to merge it into a canonical discipline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Merge into</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger data-testid="merge-target-select">
                <SelectValue placeholder="Select target discipline" />
              </SelectTrigger>
              <SelectContent>
                {disciplines.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.label} ({d.value})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Strategy</Label>
            <label className="flex items-start gap-2 p-2 rounded border cursor-pointer hover:bg-slate-50">
              <input
                type="radio"
                checked={mode === "apply"}
                onChange={() => setMode("apply")}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium">Rewrite records (recommended)</div>
                <div className="text-xs text-slate-500">
                  Updates the discipline value in all{" "}
                  {Object.keys(suggestion.by_collection).length} collection(s) to the
                  target. Also adds the variant as an alias.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-2 p-2 rounded border cursor-pointer hover:bg-slate-50">
              <input
                type="radio"
                checked={mode === "alias_only"}
                onChange={() => setMode("alias_only")}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium">Add as alias only</div>
                <div className="text-xs text-slate-500">
                  Keep existing records as-is. Future reads resolve via the
                  alias list (no data rewrite).
                </div>
              </div>
            </label>
          </div>

          {preview && (
            <div className="text-xs bg-slate-50 border border-slate-200 rounded p-2">
              <div className="font-medium text-slate-700 mb-1">Dry-run preview</div>
              {Object.entries(preview.rewrites || {}).map(([col, n]) => (
                <div key={col} className="flex justify-between">
                  <span className="text-slate-500">{col}</span>
                  <span className="text-slate-700 font-mono">{n}</span>
                </div>
              ))}
              {(!preview.rewrites || Object.keys(preview.rewrites).length === 0) && (
                <div className="text-slate-500">No record rewrites (alias-only mode)</div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleDryRun}
            disabled={!targetId}
            data-testid="merge-dry-run-btn"
          >
            Preview
          </Button>
          <Button
            disabled={!targetId}
            onClick={() => onConfirm(targetId, mode)}
            data-testid="merge-confirm-btn"
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
