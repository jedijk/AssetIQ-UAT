import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Package, Pencil, Search, Trash2, Upload } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";

import { sparePartsAPI } from "../lib/apis/spareParts";
import { usePermissions } from "../contexts/PermissionsContext";
import { useBreadcrumbTab } from "../contexts/BreadcrumbContext";
import { Button } from "../components/ui/button";
import SparePartFormDialog from "../components/spareiq/SparePartFormDialog";

function equipmentLinkLabel(link) {
  return link?.equipment_tag || link?.tag || link?.equipment_name || link?.equipment_id || "—";
}

function hierarchySearchQuery(link) {
  return link?.equipment_tag || link?.tag || link?.equipment_name || "";
}

function openHierarchySearch(query) {
  const q = String(query || "").trim();
  if (!q) return;
  window.dispatchEvent(new CustomEvent("open-hierarchy-with-search", { detail: { query: q } }));
}

export default function SparePartDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const canWrite = hasPermission("spareiq", "write");
  const canDelete = hasPermission("spareiq", "delete");

  const { data: part, isLoading } = useQuery({
    queryKey: ["spare-part", id],
    queryFn: () => sparePartsAPI.getById(id),
    enabled: Boolean(id),
  });

  useBreadcrumbTab(part?.description || null);

  const { data: categoriesData } = useQuery({
    queryKey: ["spare-categories"],
    queryFn: () => sparePartsAPI.listCategories(),
  });

  const { data: insights } = useQuery({
    queryKey: ["spare-part-insights", id],
    queryFn: () => sparePartsAPI.getInsights(id),
    enabled: Boolean(id),
  });

  const updateMutation = useMutation({
    mutationFn: (payload) => sparePartsAPI.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spare-part", id] });
      queryClient.invalidateQueries({ queryKey: ["spare-parts"] });
      setEditOpen(false);
      toast.success(t("spareiq.updated") || "Spare part updated");
    },
    onError: (error) => {
      toast.error(error?.response?.data?.detail || t("spareiq.saveFailed") || "Failed to save");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => sparePartsAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spare-parts"] });
      toast.success(t("spareiq.deleted") || "Spare part deleted");
      navigate("/spareiq");
    },
    onError: (error) => {
      toast.error(error?.response?.data?.detail || t("spareiq.deleteFailed") || "Failed to delete");
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file) => sparePartsAPI.uploadFile(id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spare-part", id] });
      toast.success(t("spareiq.fileUploaded") || "Document uploaded");
    },
    onError: () => toast.error(t("spareiq.uploadFailed") || "Upload failed"),
  });

  const deleteFileMutation = useMutation({
    mutationFn: (fileId) => sparePartsAPI.deleteFile(fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spare-part", id] });
      toast.success(t("spareiq.fileDeleted") || "Document removed");
    },
  });

  if (isLoading) {
    return <div className="p-6 text-slate-500">{t("common.loading") || "Loading..."}</div>;
  }

  if (!part) {
    return <div className="p-6 text-slate-500">{t("spareiq.notFound") || "Spare part not found"}</div>;
  }

  const categories = categoriesData?.categories || [];

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto" data-testid="spare-part-detail">
      <div className="mb-6">
        <Link to="/spareiq" className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-3">
          <ArrowLeft className="w-4 h-4 mr-1" />
          {t("nav.spareiq") || "SpareIQ"}
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{part.description}</h1>
              <p className="text-sm text-slate-600">{part.type_model}{part.manufacturer ? ` · ${part.manufacturer}` : ""}</p>
              {(part.linked_equipment || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(part.linked_equipment || []).map((link) => (
                    <button
                      key={link.equipment_id}
                      type="button"
                      onClick={() => openHierarchySearch(hierarchySearchQuery(link))}
                      className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-700 hover:bg-blue-100 hover:text-blue-700 transition-colors cursor-pointer"
                      title={t("observationWorkspace.clickToFindInHierarchy") || "Click to find in hierarchy"}
                    >
                      <Search className="w-3 h-3 shrink-0" />
                      {equipmentLinkLabel(link)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {canWrite && (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="w-4 h-4 mr-2" />
                {t("common.edit") || "Edit"}
              </Button>
            )}
            {canDelete && (
              <Button
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => {
                  if (window.confirm(t("spareiq.confirmDelete") || "Delete this spare part?")) {
                    deleteMutation.mutate();
                  }
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t("common.delete") || "Delete"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="font-medium text-slate-900 mb-3">{t("spareiq.overview") || "Overview"}</h2>
          <dl className="grid sm:grid-cols-2 gap-3 text-sm">
            <div><dt className="text-slate-500">{t("spareiq.category") || "Category"}</dt><dd>{part.category || "—"}</dd></div>
            <div><dt className="text-slate-500">{t("spareiq.manufacturer") || "Manufacturer"}</dt><dd>{part.manufacturer || "—"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-slate-500">{t("spareiq.notes") || "Notes"}</dt><dd className="whitespace-pre-wrap">{part.notes || "—"}</dd></div>
          </dl>
        </section>

        {insights && (
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="font-medium text-slate-900 mb-3">{t("spareiq.insights") || "Insights"}</h2>
            <dl className="grid sm:grid-cols-3 gap-3 text-sm mb-4">
              <div>
                <dt className="text-slate-500">{t("spareiq.linkedEquipment") || "Linked equipment"}</dt>
                <dd className="font-medium">{insights.linked_equipment_count}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("spareiq.programTasks") || "Program tasks"}</dt>
                <dd className="font-medium">{insights.program_task_references}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("spareiq.actions") || "Actions"}</dt>
                <dd className="font-medium">{insights.action_references}</dd>
              </div>
            </dl>
            {(insights.insights || []).length === 0 ? (
              <p className="text-sm text-slate-500">{t("spareiq.noInsights") || "No insights yet."}</p>
            ) : (
              <ul className="space-y-2">
                {insights.insights.map((item, index) => (
                  <li
                    key={`${item.type}-${index}`}
                    className={`rounded-md px-3 py-2 text-sm ${
                      item.severity === "warning"
                        ? "bg-amber-50 text-amber-800"
                        : "bg-slate-50 text-slate-700"
                    }`}
                  >
                    {item.message}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="font-medium text-slate-900 mb-3">{t("spareiq.linkedEquipment") || "Linked Equipment"}</h2>
          {(part.linked_equipment || []).length === 0 ? (
            <p className="text-sm text-slate-500">{t("spareiq.noEquipment") || "No equipment linked"}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {(part.linked_equipment || []).map((link) => (
                <li key={link.equipment_id} className="py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-sm">
                  <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                    {link.equipment_tag ? (
                      <button
                        type="button"
                        onClick={() => openHierarchySearch(link.equipment_tag)}
                        className="inline-flex items-center gap-1 font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-xs hover:bg-blue-100 hover:text-blue-700 transition-colors cursor-pointer"
                        title={t("observationWorkspace.clickToFindInHierarchy") || "Click to find in hierarchy"}
                      >
                        <Search className="w-3 h-3 shrink-0" />
                        {link.equipment_tag}
                      </button>
                    ) : null}
                    {(link.equipment_name || (!link.equipment_tag && link.equipment_id)) && (
                      <button
                        type="button"
                        onClick={() => openHierarchySearch(hierarchySearchQuery(link))}
                        className="font-medium text-blue-700 hover:underline text-left"
                        title={t("observationWorkspace.clickToFindInHierarchy") || "Click to find in hierarchy"}
                      >
                        {link.equipment_name || link.equipment_id}
                      </button>
                    )}
                  </div>
                  <span className="text-slate-500 shrink-0">{link.component_position || link.equipment_type || ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-slate-900">{t("spareiq.documents") || "Documents"}</h2>
            {canWrite && (
              <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50">
                <Upload className="w-4 h-4" />
                {t("spareiq.upload") || "Upload"}
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadMutation.mutate(file);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          {part.document_url && (
            <a href={part.document_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-blue-700 hover:underline mb-2">
              <ExternalLink className="w-4 h-4" />
              {part.document_url}
            </a>
          )}
          <ul className="divide-y divide-slate-100">
            {(part.files || []).map((file) => (
              <li key={file.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                <a href={sparePartsAPI.fileViewUrl(file.id)} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline truncate">
                  {file.filename}
                </a>
                {canWrite && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-600"
                    onClick={() => deleteFileMutation.mutate(file.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <SparePartFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        categories={categories}
        initialValues={part}
        onSubmit={(payload) => updateMutation.mutate(payload)}
        isSubmitting={updateMutation.isPending}
      />
    </div>
  );
}
