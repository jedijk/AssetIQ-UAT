import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { qrCodeAPI } from "../lib/api";
import { toast } from "sonner";
import {
  QrCode,
  Download,
  Printer,
  Trash2,
  Search,
  Filter,
  Eye,
  MoreVertical,
  RefreshCw,
  FileDown,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Checkbox } from "../components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { SettingsSection, SettingsCard } from "./SettingsPage";
import { QR_PRINT_TEMPLATES } from "../lib/qrTemplates";

export default function SettingsQRPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedQRs, setSelectedQRs] = useState(new Set());
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printTemplate, setPrintTemplate] = useState("a4_3x3");
  const [viewQR, setViewQR] = useState(null);
  
  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    description: "",
    variant: "default", // "default" | "destructive"
    onConfirm: () => {},
  });

  // Fetch QR codes
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["qr-codes-list", statusFilter],
    queryFn: () => qrCodeAPI.list({ status: statusFilter === "all" ? undefined : statusFilter }),
    staleTime: 30000,
  });

  const qrCodes = data?.qr_codes || [];
  const totalQRs = data?.total || 0;

  // Filter by search
  const filteredQRs = qrCodes.filter(qr => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      qr.label?.toLowerCase().includes(query) ||
      qr.hierarchy_item_name?.toLowerCase().includes(query) ||
      qr.id?.toLowerCase().includes(query)
    );
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: ({ qrId, permanent }) => qrCodeAPI.delete(qrId, permanent),
    onSuccess: (data, variables) => {
      toast.success(variables.permanent ? "QR code permanently deleted" : "QR code deactivated");
      queryClient.invalidateQueries({ queryKey: ["qr-codes-list"] });
    },
    onError: () => {
      toast.error("Failed to delete QR code");
    }
  });

  // Bulk print mutation
  const printMutation = useMutation({
    mutationFn: () => qrCodeAPI.print(Array.from(selectedQRs), { template: printTemplate }),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `qr_codes_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded!");
      setPrintDialogOpen(false);
      setSelectedQRs(new Set());
    },
    onError: () => {
      toast.error("Failed to generate PDF");
    }
  });

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: (format) => {
      const idsToExport = selectedQRs.size > 0 
        ? Array.from(selectedQRs) 
        : filteredQRs.map(q => q.id);
      return qrCodeAPI.export(idsToExport, format, true);
    },
    onSuccess: (blob, format) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `qr_codes_export.${format === 'csv' ? 'csv' : 'zip'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Export downloaded!`);
    },
    onError: (error) => {
      console.error("Export error:", error);
      toast.error("Failed to export QR codes");
    }
  });

  const toggleSelectAll = () => {
    if (selectedQRs.size === filteredQRs.length) {
      setSelectedQRs(new Set());
    } else {
      setSelectedQRs(new Set(filteredQRs.map(q => q.id)));
    }
  };

  const toggleSelect = (qrId) => {
    const newSelected = new Set(selectedQRs);
    if (newSelected.has(qrId)) {
      newSelected.delete(qrId);
    } else {
      newSelected.add(qrId);
    }
    setSelectedQRs(newSelected);
  };

  // Helper to show confirmation dialog
  const showConfirm = (title, description, variant, onConfirm) => {
    setConfirmDialog({
      open: true,
      title,
      description,
      variant,
      onConfirm: () => {
        onConfirm();
        setConfirmDialog(prev => ({ ...prev, open: false }));
      },
    });
  };

  return (
    <SettingsSection
      title="QR Code Management"
      description="View, manage, and print QR codes for your equipment"
    >
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-2xl font-bold text-slate-900">{totalQRs}</p>
          <p className="text-sm text-slate-500">Total QR Codes</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-2xl font-bold text-green-600">
            {qrCodes.filter(q => q.status === 'active').length}
          </p>
          <p className="text-sm text-slate-500">Active</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-2xl font-bold text-slate-600">
            {qrCodes.filter(q => q.status === 'inactive').length}
          </p>
          <p className="text-sm text-slate-500">Inactive</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-2xl font-bold text-blue-600">
            {qrCodes.reduce((sum, q) => sum + (q.scan_count || 0), 0)}
          </p>
          <p className="text-sm text-slate-500">Total Scans</p>
        </div>
      </div>

      {/* QR Code List */}
      <SettingsCard
        title="QR Codes"
        description={`${filteredQRs.length} QR codes`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <FileDown className="w-4 h-4 mr-1" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => exportMutation.mutate("zip")}>
                  Export as ZIP (images)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportMutation.mutate("csv")}>
                  Export as CSV (metadata)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      >
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search QR codes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bulk Actions */}
        {selectedQRs.size > 0 && (
          <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg mb-4">
            <span className="text-sm text-blue-700 font-medium">
              {selectedQRs.size} selected
            </span>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPrintDialogOpen(true)}
            >
              <Printer className="w-4 h-4 mr-1" />
              Print Selected
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-amber-600 hover:text-amber-700"
              onClick={() => showConfirm(
                "Deactivate QR Codes",
                `Are you sure you want to deactivate ${selectedQRs.size} QR code(s)? They can be reactivated later.`,
                "default",
                () => {
                  selectedQRs.forEach(id => deleteMutation.mutate({ qrId: id, permanent: false }));
                  setSelectedQRs(new Set());
                }
              )}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Deactivate
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-700"
              onClick={() => showConfirm(
                "Permanently Delete QR Codes",
                `Are you sure you want to permanently delete ${selectedQRs.size} QR code(s)? This action cannot be undone.`,
                "destructive",
                () => {
                  selectedQRs.forEach(id => deleteMutation.mutate({ qrId: id, permanent: true }));
                  setSelectedQRs(new Set());
                }
              )}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </Button>
          </div>
        )}

        {/* Table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <Checkbox 
                    checked={selectedQRs.size === filteredQRs.length && filteredQRs.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  QR Code
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Equipment
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                  Scans
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading QR codes...
                  </td>
                </tr>
              ) : filteredQRs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    <QrCode className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    No QR codes found
                  </td>
                </tr>
              ) : (
                filteredQRs.map((qr) => (
                  <tr key={qr.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Checkbox 
                        checked={selectedQRs.has(qr.id)}
                        onCheckedChange={() => toggleSelect(qr.id)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center">
                          <QrCode className="w-5 h-5 text-slate-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 text-sm">{qr.label}</p>
                          <p className="text-xs text-slate-500 font-mono">{qr.id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {qr.hierarchy_item_name ? (
                        <div>
                          <p className="text-sm text-slate-900">{qr.hierarchy_item_name}</p>
                          <p className="text-xs text-slate-500">{qr.hierarchy_item_level}</p>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">Not assigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={qr.status === 'active' ? 'default' : 'secondary'}>
                        {qr.status === 'active' ? (
                          <><CheckCircle2 className="w-3 h-3 mr-1" /> Active</>
                        ) : (
                          <><XCircle className="w-3 h-3 mr-1" /> Inactive</>
                        )}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-600">{qr.scan_count || 0}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewQR(qr)}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setSelectedQRs(new Set([qr.id]));
                            setPrintDialogOpen(true);
                          }}>
                            <Printer className="w-4 h-4 mr-2" />
                            Print
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-amber-600"
                            onClick={() => showConfirm(
                              "Deactivate QR Code",
                              `Are you sure you want to deactivate "${qr.label}"? It can be reactivated later.`,
                              "default",
                              () => deleteMutation.mutate({ qrId: qr.id, permanent: false })
                            )}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Deactivate
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-red-600"
                            onClick={() => showConfirm(
                              "Delete Permanently",
                              `Are you sure you want to permanently delete "${qr.label}"? This action cannot be undone.`,
                              "destructive",
                              () => deleteMutation.mutate({ qrId: qr.id, permanent: true })
                            )}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Permanently
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SettingsCard>

      {/* Print Dialog */}
      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5" />
              Print QR Codes
            </DialogTitle>
            <DialogDescription>
              Generate a PDF with {selectedQRs.size} QR code(s)
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Template</label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {QR_PRINT_TEMPLATES.map(template => (
                  <button
                    key={template.id}
                    onClick={() => setPrintTemplate(template.id)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      printTemplate === template.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <p className="font-medium text-sm">{template.label}</p>
                    <p className="text-xs text-slate-500">{template.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => printMutation.mutate()} disabled={printMutation.isPending}>
              {printMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
              ) : (
                <><Download className="w-4 h-4 mr-2" /> Download PDF</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View QR Dialog */}
      <Dialog open={!!viewQR} onOpenChange={() => setViewQR(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>QR Code Details</DialogTitle>
          </DialogHeader>
          {viewQR && (
            <div className="space-y-4">
              <div className="flex justify-center p-4 bg-slate-50 rounded-lg min-h-[200px] items-center">
                <img 
                  src={`${(process.env.REACT_APP_BACKEND_URL || '').replace(/\/$/, '')}/api/qr/${viewQR.id}/image?size=large&show_label=true`}
                  alt={viewQR.label}
                  className="w-48 h-48"
                  onLoad={(e) => e.target.style.opacity = 1}
                  onError={(e) => {
                    console.error("Failed to load QR image:", e.target.src);
                    // Try alternative URL format
                    if (!e.target.dataset.retried) {
                      e.target.dataset.retried = 'true';
                      e.target.src = qrCodeAPI.getImageUrl(viewQR.id, "large");
                    }
                  }}
                  style={{ opacity: 0, transition: 'opacity 0.3s' }}
                />
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Label:</span>
                  <span className="font-medium">{viewQR.label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Equipment:</span>
                  <span className="font-medium">{viewQR.hierarchy_item_name || "Not assigned"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Status:</span>
                  <Badge variant={viewQR.status === 'active' ? 'default' : 'secondary'}>
                    {viewQR.status}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Scans:</span>
                  <span className="font-medium">{viewQR.scan_count || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Created:</span>
                  <span className="font-medium">
                    {new Date(viewQR.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="p-2 bg-slate-100 rounded text-xs font-mono text-slate-600 break-all">
                {viewQR.url}
              </div>
              
              {/* Download Actions */}
              <div className="flex gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={async () => {
                    try {
                      const blob = await qrCodeAPI.export([viewQR.id], "png");
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `${viewQR.label.replace(/\s+/g, '_')}.png`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(url);
                      toast.success("PNG downloaded!");
                    } catch {
                      toast.error("Failed to download PNG");
                    }
                  }}
                >
                  <Download className="w-4 h-4 mr-1" />
                  PNG
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={async () => {
                    try {
                      const blob = await qrCodeAPI.export([viewQR.id], "svg");
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `${viewQR.label.replace(/\s+/g, '_')}.svg`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(url);
                      toast.success("SVG downloaded!");
                    } catch {
                      toast.error("Failed to download SVG");
                    }
                  }}
                >
                  <Download className="w-4 h-4 mr-1" />
                  SVG
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={async () => {
                    try {
                      const blob = await qrCodeAPI.print([viewQR.id], { template: "single" });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `${viewQR.label.replace(/\s+/g, '_')}.pdf`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(url);
                      toast.success("PDF downloaded!");
                    } catch {
                      toast.error("Failed to download PDF");
                    }
                  }}
                >
                  <Printer className="w-4 h-4 mr-1" />
                  PDF
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewQR(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {confirmDialog.variant === "destructive" ? (
                <AlertTriangle className="w-5 h-5 text-red-500" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              )}
              {confirmDialog.title}
            </DialogTitle>
            <DialogDescription className="pt-2">
              {confirmDialog.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
            >
              Cancel
            </Button>
            <Button 
              variant={confirmDialog.variant === "destructive" ? "destructive" : "default"}
              onClick={confirmDialog.onConfirm}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}
