import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { qrCodeAPI } from "../../lib/api";
import { toast } from "sonner";
import {
  QrCode,
  Download,
  Printer,
  Settings,
  Eye,
  MessageSquare,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  X,
  ChevronDown
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Checkbox } from "../ui/checkbox";

// Action type configurations
const ACTION_TYPES = [
  { id: "view_asset", label: "View Asset Dashboard", icon: Eye, description: "Opens the equipment detail page" },
  { id: "report_observation", label: "Report Observation", icon: MessageSquare, description: "Opens chat to report an issue" },
];

// Print template options
const PRINT_TEMPLATES = [
  { id: "single", label: "Single Label", description: "One QR per page" },
  { id: "a4_2x2", label: "A4 - 2×2", description: "4 labels per page" },
  { id: "a4_3x3", label: "A4 - 3×3", description: "9 labels per page" },
  { id: "a4_4x5", label: "A4 - 4×5", description: "20 labels per page" },
];

// Size options
const SIZE_OPTIONS = [
  { id: "small", label: "Small (5cm)", pixels: 150 },
  { id: "medium", label: "Medium (8cm)", pixels: 240 },
  { id: "large", label: "Large (12cm)", pixels: 360 },
];

export function QRCodeDialog({ open, onOpenChange, equipment, existingQR = null }) {
  const queryClient = useQueryClient();
  const [qrData, setQrData] = useState(existingQR);
  const [label, setLabel] = useState(existingQR?.label || equipment?.tag || equipment?.name || "");
  const [actions, setActions] = useState(
    existingQR?.actions || [
      { action_type: "view_asset", label: "View Asset Dashboard", enabled: true, config: {} },
      { action_type: "report_observation", label: "Report Observation", enabled: true, config: {} },
    ]
  );
  const [defaultAction, setDefaultAction] = useState(existingQR?.default_action || "view_asset");
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [printTemplate, setPrintTemplate] = useState("single");
  const [printSize, setPrintSize] = useState("medium");
  const [showLabel, setShowLabel] = useState(true);
  const [copied, setCopied] = useState(false);

  // Generate QR mutation
  const generateMutation = useMutation({
    mutationFn: () => qrCodeAPI.generateForEquipment(equipment.id, defaultAction),
    onSuccess: (data) => {
      setQrData(data);
      toast.success("QR Code generated successfully!");
      queryClient.invalidateQueries(["qr-codes"]);
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to generate QR code");
    }
  });

  // Update QR mutation
  const updateMutation = useMutation({
    mutationFn: (data) => qrCodeAPI.update(qrData.id, data),
    onSuccess: (data) => {
      setQrData(data);
      toast.success("QR Code updated!");
      queryClient.invalidateQueries(["qr-codes"]);
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to update QR code");
    }
  });

  // Print QR mutation
  const printMutation = useMutation({
    mutationFn: () => qrCodeAPI.print([qrData.id], { template: printTemplate, size: printSize, showLabel }),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `qr_${label.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded!");
      setShowPrintOptions(false);
    },
    onError: () => {
      toast.error("Failed to generate PDF");
    }
  });

  // Export QR mutation
  const exportMutation = useMutation({
    mutationFn: (format) => qrCodeAPI.export([qrData.id], format),
    onSuccess: (blob, format) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `qr_${label.replace(/\s+/g, '_')}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} downloaded!`);
    },
    onError: () => {
      toast.error("Failed to export QR code");
    }
  });

  const handleCopyUrl = () => {
    if (qrData?.url) {
      navigator.clipboard.writeText(qrData.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("URL copied to clipboard!");
    }
  };

  const handleToggleAction = (actionType) => {
    setActions(prev => prev.map(a => 
      a.action_type === actionType ? { ...a, enabled: !a.enabled } : a
    ));
  };

  const handleSaveActions = () => {
    if (qrData) {
      updateMutation.mutate({ actions, default_action: defaultAction, label });
    }
  };

  const isLoading = generateMutation.isPending || updateMutation.isPending || printMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-blue-600" />
            QR Code for {equipment?.name}
          </DialogTitle>
          <DialogDescription>
            Generate and configure a QR code for this equipment
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* QR Code Display or Generate Button */}
          {qrData ? (
            <div className="flex flex-col items-center p-4 bg-slate-50 rounded-lg border">
              {qrData.qr_image && (
                <img 
                  src={qrData.qr_image} 
                  alt="QR Code" 
                  className="w-48 h-48 border border-slate-200 rounded-lg bg-white p-2"
                />
              )}
              <div className="mt-3 text-center">
                <p className="font-medium text-slate-900">{qrData.label}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    {qrData.scan_count || 0} scans
                  </Badge>
                  <Badge variant={qrData.status === "active" ? "default" : "secondary"} className="text-xs">
                    {qrData.status}
                  </Badge>
                </div>
              </div>
              
              {/* URL with copy button */}
              <div className="mt-3 w-full flex items-center gap-2 p-2 bg-white rounded border">
                <code className="text-xs text-slate-600 flex-1 truncate">{qrData.url}</code>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6"
                  onClick={handleCopyUrl}
                >
                  {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                </Button>
                <a href={qrData.url} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <ExternalLink className="w-3 h-3" />
                  </Button>
                </a>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center p-8 bg-slate-50 rounded-lg border border-dashed">
              <QrCode className="w-16 h-16 text-slate-300 mb-3" />
              <p className="text-slate-500 text-sm mb-4">No QR code generated yet</p>
              <Button 
                onClick={() => generateMutation.mutate()}
                disabled={isLoading}
              >
                {generateMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
                ) : (
                  <><QrCode className="w-4 h-4 mr-2" /> Generate QR Code</>
                )}
              </Button>
            </div>
          )}

          {/* Configuration Section */}
          {qrData && (
            <>
              {/* Label Input */}
              <div>
                <Label htmlFor="qr-label">Label</Label>
                <Input
                  id="qr-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Enter label for QR code"
                  className="mt-1"
                />
              </div>

              {/* Actions Configuration */}
              <div>
                <Label className="mb-2 block">Scan Actions</Label>
                <div className="space-y-2">
                  {ACTION_TYPES.map((actionType) => {
                    const action = actions.find(a => a.action_type === actionType.id);
                    const Icon = actionType.icon;
                    return (
                      <div 
                        key={actionType.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                          action?.enabled ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-200"
                        }`}
                      >
                        <Checkbox 
                          checked={action?.enabled}
                          onCheckedChange={() => handleToggleAction(actionType.id)}
                        />
                        <Icon className={`w-4 h-4 ${action?.enabled ? "text-blue-600" : "text-slate-400"}`} />
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${action?.enabled ? "text-slate-900" : "text-slate-500"}`}>
                            {actionType.label}
                          </p>
                          <p className="text-xs text-slate-500">{actionType.description}</p>
                        </div>
                        {action?.enabled && (
                          <input
                            type="radio"
                            name="defaultAction"
                            checked={defaultAction === actionType.id}
                            onChange={() => setDefaultAction(actionType.id)}
                            className="text-blue-600"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Selected radio = default action (direct redirect). If multiple enabled, shows menu.
                </p>
              </div>

              {/* Print Options */}
              {showPrintOptions && (
                <div className="p-3 bg-slate-50 rounded-lg border space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Print Options</Label>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowPrintOptions(false)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Template</Label>
                      <Select value={printTemplate} onValueChange={setPrintTemplate}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRINT_TEMPLATES.map(t => (
                            <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Size</Label>
                      <Select value={printSize} onValueChange={setPrintSize}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SIZE_OPTIONS.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="show-label" 
                      checked={showLabel} 
                      onCheckedChange={setShowLabel}
                    />
                    <Label htmlFor="show-label" className="text-sm">Include label on QR</Label>
                  </div>
                  
                  <Button 
                    onClick={() => printMutation.mutate()} 
                    disabled={printMutation.isPending}
                    className="w-full"
                  >
                    {printMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating PDF...</>
                    ) : (
                      <><Download className="w-4 h-4 mr-2" /> Download PDF</>
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {qrData && (
            <>
              <div className="flex gap-2 flex-1">
                <Button 
                  variant="outline" 
                  onClick={() => setShowPrintOptions(!showPrintOptions)}
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </Button>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <Download className="w-4 h-4 mr-2" />
                      Export
                      <ChevronDown className="w-4 h-4 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => exportMutation.mutate("png")}>
                      Download PNG
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportMutation.mutate("svg")}>
                      Download SVG
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => exportMutation.mutate("pdf")}>
                      Download PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              
              <Button 
                onClick={handleSaveActions}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Bulk QR Generation Dialog
export function BulkQRDialog({ open, onOpenChange, selectedItems = [] }) {
  const queryClient = useQueryClient();
  const [defaultAction, setDefaultAction] = useState("view_asset");
  const [results, setResults] = useState(null);

  const bulkMutation = useMutation({
    mutationFn: () => qrCodeAPI.generateBulk(selectedItems.map(i => i.id), defaultAction),
    onSuccess: (data) => {
      setResults(data);
      toast.success(`Generated ${data.created} QR codes!`);
      queryClient.invalidateQueries(["qr-codes"]);
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to generate QR codes");
    }
  });

  const handleClose = () => {
    setResults(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-blue-600" />
            Bulk Generate QR Codes
          </DialogTitle>
          <DialogDescription>
            Generate QR codes for {selectedItems.length} selected equipment items
          </DialogDescription>
        </DialogHeader>

        {!results ? (
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-600 mb-2">Selected items:</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {selectedItems.slice(0, 10).map(item => (
                  <div key={item.id} className="flex items-center gap-2 text-sm">
                    <QrCode className="w-3 h-3 text-slate-400" />
                    <span>{item.tag || item.name}</span>
                  </div>
                ))}
                {selectedItems.length > 10 && (
                  <p className="text-xs text-slate-500">...and {selectedItems.length - 10} more</p>
                )}
              </div>
            </div>

            <div>
              <Label>Default Action</Label>
              <Select value={defaultAction} onValueChange={setDefaultAction}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{results.created}</p>
                <p className="text-xs text-green-700">Created</p>
              </div>
              <div className="p-3 bg-yellow-50 rounded-lg">
                <p className="text-2xl font-bold text-yellow-600">{results.existing}</p>
                <p className="text-xs text-yellow-700">Already Exist</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <p className="text-2xl font-bold text-red-600">{results.errors}</p>
                <p className="text-xs text-red-700">Errors</p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {!results ? (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button 
                onClick={() => bulkMutation.mutate()}
                disabled={bulkMutation.isPending}
              >
                {bulkMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
                ) : (
                  <><QrCode className="w-4 h-4 mr-2" /> Generate QR Codes</>
                )}
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default QRCodeDialog;
