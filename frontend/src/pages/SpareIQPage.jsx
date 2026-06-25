import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Package, Plus, Search, Upload } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";

import { sparePartsAPI } from "../lib/apis/spareParts";
import { usePermissions } from "../contexts/PermissionsContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import SparePartFormDialog from "../components/spareiq/SparePartFormDialog";
import SparePartsImportDialog from "../components/spareiq/SparePartsImportDialog";

export default function SpareIQPage() {
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const canWrite = hasPermission("spareiq", "write");

  const { data, isLoading } = useQuery({
    queryKey: ["spare-parts", search],
    queryFn: () => sparePartsAPI.list({ search: search || undefined, sort_by: "updated_at", sort_dir: -1 }),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["spare-categories"],
    queryFn: () => sparePartsAPI.listCategories(),
  });

  const createMutation = useMutation({
    mutationFn: (payload) => sparePartsAPI.create(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["spare-parts"] });
      setCreateOpen(false);
      if (result?.merged) {
        toast.success(t("spareiq.mergedExisting") || "Updated existing spare part and linked equipment");
      } else {
        toast.success(t("spareiq.created") || "Spare part created");
      }
    },
    onError: (error) => {
      toast.error(error?.response?.data?.detail || t("spareiq.saveFailed") || "Failed to save spare part");
    },
  });

  const spareParts = data?.spare_parts || [];
  const categories = categoriesData?.categories || [];

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto" data-testid="spareiq-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{t("nav.spareiq") || "SpareIQ"}</h1>
            <p className="text-sm text-slate-500">{t("spareiq.subtitle") || "Central spare parts knowledge register"}</p>
          </div>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)} data-testid="import-spare-parts-btn">
              <Upload className="w-4 h-4 mr-2" />
              {t("spareiq.import") || "Import"}
            </Button>
            <Button onClick={() => setCreateOpen(true)} data-testid="create-spare-part-btn">
              <Plus className="w-4 h-4 mr-2" />
              {t("spareiq.create") || "Create Spare Part"}
            </Button>
          </div>
        )}
      </div>

      <div className="relative max-w-md mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("spareiq.searchPlaceholder") || "Search spare parts..."}
          className="pl-9"
          data-testid="spareiq-search"
        />
      </div>

      <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-3 font-medium">{t("spareiq.description") || "Description"}</th>
              <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">{t("spareiq.typeModel") || "Type / Model"}</th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell">{t("spareiq.manufacturer") || "Manufacturer"}</th>
              <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">{t("spareiq.category") || "Category"}</th>
              <th className="text-right px-4 py-3 font-medium">{t("spareiq.equipment") || "Equipment"}</th>
              <th className="text-right px-4 py-3 font-medium hidden md:table-cell">{t("spareiq.documents") || "Docs"}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">{t("common.loading") || "Loading..."}</td>
              </tr>
            )}
            {!isLoading && spareParts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">{t("spareiq.empty") || "No spare parts registered yet"}</td>
              </tr>
            )}
            {spareParts.map((part) => (
              <tr key={part.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link to={`/spareiq/${part.id}`} className="font-medium text-blue-700 hover:underline">
                    {part.description}
                  </Link>
                  <div className="sm:hidden text-xs text-slate-500 mt-0.5">{part.type_model}</div>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell text-slate-700">{part.type_model}</td>
                <td className="px-4 py-3 hidden md:table-cell text-slate-600">{part.manufacturer || "—"}</td>
                <td className="px-4 py-3 hidden lg:table-cell text-slate-600">{part.category || "—"}</td>
                <td className="px-4 py-3 text-right text-slate-700">{part.linked_equipment_count ?? 0}</td>
                <td className="px-4 py-3 text-right hidden md:table-cell text-slate-700">{part.document_count ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SparePartFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        categories={categories}
        onSubmit={(payload) => createMutation.mutate(payload)}
        isSubmitting={createMutation.isPending}
      />
      <SparePartsImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
