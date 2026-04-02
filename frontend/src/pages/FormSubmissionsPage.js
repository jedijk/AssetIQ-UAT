import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getBackendUrl } from '../lib/apiConfig';
import { useLanguage } from "../contexts/LanguageContext";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Search,
  Calendar,
  User,
  Building2,
  ClipboardList,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Eye,
  ChevronDown,
  Filter,
  X,
  Paperclip,
  Clock,
  Wrench,
  Download,
  Image,
  File,
  ExternalLink,
  ZoomIn,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import BackButton from "../components/BackButton";
import { DISCIPLINES, getDisciplineColor } from "../constants/disciplines";
import { DocumentViewer } from "../components/DocumentViewer";
import { format, parseISO } from "date-fns";

const API_BASE_URL = getBackendUrl();

// Fetch form submissions
const fetchSubmissions = async (filters) => {
  const params = new URLSearchParams();
  if (filters.hasWarnings) params.append("has_warnings", "true");
  if (filters.hasCritical) params.append("has_critical", "true");
  
  const response = await fetch(`${API_BASE_URL}/api/form-submissions?${params}`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
  });
  if (!response.ok) throw new Error("Failed to fetch submissions");
  return response.json();
};

// Fetch single submission
const fetchSubmission = async (id) => {
  const response = await fetch(`${API_BASE_URL}/api/form-submissions/${id}`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
  });
  if (!response.ok) throw new Error("Failed to fetch submission");
  return response.json();
};

export default function FormSubmissionsPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [viewingDocument, setViewingDocument] = useState(null);
  const [viewingImage, setViewingImage] = useState(null);

  // Fetch submissions
  const { data: submissionsData, isLoading } = useQuery({
    queryKey: ["form-submissions", { hasWarnings: statusFilter === "warnings", hasCritical: statusFilter === "critical" }],
    queryFn: () => fetchSubmissions({
      hasWarnings: statusFilter === "warnings",
      hasCritical: statusFilter === "critical",
    }),
  });

  const submissions = submissionsData?.submissions || [];

  // Filter submissions
  const filteredSubmissions = submissions.filter(sub => {
    // Search filter
    if (searchQuery) {
      const search = searchQuery.toLowerCase();
      const matchesSearch = 
        sub.form_template_name?.toLowerCase().includes(search) ||
        sub.equipment_name?.toLowerCase().includes(search) ||
        sub.task_template_name?.toLowerCase().includes(search) ||
        sub.submitted_by_name?.toLowerCase().includes(search);
      if (!matchesSearch) return false;
    }
    
    // Discipline filter
    if (disciplineFilter !== "all" && sub.discipline !== disciplineFilter) {
      return false;
    }
    
    return true;
  });

  // Calculate stats
  const stats = {
    total: submissions.length,
    withWarnings: submissions.filter(s => s.has_warnings).length,
    withCritical: submissions.filter(s => s.has_critical).length,
    today: submissions.filter(s => {
      if (!s.submitted_at) return false;
      const subDate = new Date(s.submitted_at);
      const today = new Date();
      return subDate.toDateString() === today.toDateString();
    }).length,
  };

  const getStatusBadge = (submission) => {
    if (submission.has_critical) {
      return <Badge className="bg-red-100 text-red-700 border-red-200">Critical</Badge>;
    }
    if (submission.has_warnings) {
      return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Warning</Badge>;
    }
    return <Badge className="bg-green-100 text-green-700 border-green-200">Normal</Badge>;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    try {
      return format(parseISO(dateStr), "MMM d, yyyy 'at' h:mm a");
    } catch {
      return dateStr;
    }
  };

  const getDisciplineInfo = (discipline) => {
    const disc = DISCIPLINES.find(d => d.value === discipline);
    return disc || { label: discipline || "Unknown", color: "bg-slate-500" };
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-12 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <BackButton />
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <FileText className="w-6 h-6 text-blue-600" />
                  Form Submissions
                </h1>
                <p className="text-sm text-slate-500 hidden sm:block">
                  View all submitted forms and their responses
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Total</p>
                <p className="text-xl font-bold text-slate-800">{stats.total}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Clock className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Today</p>
                <p className="text-xl font-bold text-slate-800">{stats.today}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Warnings</p>
                <p className="text-xl font-bold text-slate-800">{stats.withWarnings}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Critical</p>
                <p className="text-xl font-bold text-slate-800">{stats.withCritical}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by form, equipment, task, or user..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={disciplineFilter} onValueChange={setDisciplineFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Wrench className="w-4 h-4 mr-2 text-slate-400" />
                <SelectValue placeholder="Discipline" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Disciplines</SelectItem>
                {DISCIPLINES.map(d => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <Filter className="w-4 h-4 mr-2 text-slate-400" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="warnings">With Warnings</SelectItem>
                <SelectItem value="critical">Critical Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Submissions List */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-slate-500">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
              Loading submissions...
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="font-medium">No submissions found</p>
              <p className="text-sm">Form submissions will appear here when tasks are completed</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredSubmissions.map((submission, idx) => {
                const discInfo = getDisciplineInfo(submission.discipline);
                
                return (
                  <motion.div
                    key={submission.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="p-4 hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => setSelectedSubmission(submission)}
                    data-testid={`submission-row-${submission.id}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Form Name & Status */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <h3 className="font-semibold text-slate-800 truncate">
                            {submission.form_template_name || "Unknown Form"}
                          </h3>
                          {getStatusBadge(submission)}
                        </div>
                        
                        {/* Meta Info Row */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                          {/* Date & Time */}
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{formatDate(submission.submitted_at)}</span>
                          </div>
                          
                          {/* Submitted By */}
                          {submission.submitted_by_name && (
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5" />
                              <span>{submission.submitted_by_name}</span>
                            </div>
                          )}
                          
                          {/* Discipline */}
                          {submission.discipline && (
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${discInfo.color}`} />
                              <span>{discInfo.label}</span>
                            </div>
                          )}
                        </div>
                        
                        {/* Equipment & Task Row */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 mt-1">
                          {/* Equipment */}
                          {submission.equipment_name && (
                            <div className="flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-slate-600">{submission.equipment_name}</span>
                            </div>
                          )}
                          
                          {/* Task */}
                          {submission.task_template_name && (
                            <div className="flex items-center gap-1.5">
                              <ClipboardList className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-slate-600">{submission.task_template_name}</span>
                            </div>
                          )}
                          
                          {/* Attachment indicator */}
                          {submission.attachments?.length > 0 && (
                            <div className="flex items-center gap-1 text-slate-500">
                              <Paperclip className="w-3 h-3" />
                              <span className="text-xs">{submission.attachments.length}</span>
                            </div>
                          )}
                          
                          {/* Response count */}
                          {(submission.responses?.length || submission.values?.length) > 0 && (
                            <div className="flex items-center gap-1 text-slate-500">
                              <FileText className="w-3 h-3" />
                              <span className="text-xs">{submission.responses?.length || submission.values?.length} fields</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* View Button */}
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSubmission(submission);
                        }}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Submission Detail Dialog */}
      <Dialog open={!!selectedSubmission} onOpenChange={() => setSelectedSubmission(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              {selectedSubmission?.form_template_name || "Form Submission"}
            </DialogTitle>
          </DialogHeader>
          
          {selectedSubmission && (
            <div className="space-y-4 mt-4">
              {/* Submission Info */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Submitted At</p>
                  <p className="text-sm font-medium">{formatDate(selectedSubmission.submitted_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Submitted By</p>
                  <p className="text-sm font-medium">{selectedSubmission.submitted_by_name || "Unknown"}</p>
                </div>
                {selectedSubmission.discipline && (
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">Discipline</p>
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${getDisciplineInfo(selectedSubmission.discipline).color}`} />
                      {getDisciplineInfo(selectedSubmission.discipline).label}
                    </p>
                  </div>
                )}
                {selectedSubmission.equipment_name && (
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">Equipment</p>
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      {selectedSubmission.equipment_name}
                    </p>
                  </div>
                )}
                {selectedSubmission.task_template_name && (
                  <div className="col-span-2">
                    <p className="text-xs text-slate-500 mb-0.5">Originating Task</p>
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <ClipboardList className="w-3.5 h-3.5 text-slate-400" />
                      {selectedSubmission.task_template_name}
                    </p>
                  </div>
                )}
              </div>
              
              {/* Form Responses */}
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-blue-500" />
                  Form Responses ({(selectedSubmission.responses || selectedSubmission.values || []).length})
                </h4>
                <div className="space-y-2">
                  {(selectedSubmission.responses || selectedSubmission.values || []).map((response, idx) => {
                    const isWarning = response.threshold_status === "warning";
                    const isCritical = response.threshold_status === "critical";
                    const isBoolean = typeof response.value === "boolean";
                    const isArray = Array.isArray(response.value);
                    const isNumeric = typeof response.value === "number";
                    const hasAttachment = response.attachment_url || response.file_url;
                    const isImage = hasAttachment && /\.(jpg|jpeg|png|gif|webp)$/i.test(response.attachment_url || response.file_url || "");
                    
                    return (
                      <div 
                        key={idx}
                        className={`p-3 rounded-lg border ${
                          isCritical 
                            ? "bg-red-50 border-red-200" 
                            : isWarning 
                              ? "bg-amber-50 border-amber-200" 
                              : "bg-white border-slate-200"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-medium mb-1 ${
                              isCritical ? "text-red-600" : isWarning ? "text-amber-600" : "text-slate-500"
                            }`}>
                              {response.field_label || response.field_id}
                              {response.required && <span className="text-red-400 ml-0.5">*</span>}
                            </p>
                            
                            {/* Value display based on type */}
                            <div className={`text-sm font-medium ${
                              isCritical ? "text-red-800" : isWarning ? "text-amber-800" : "text-slate-800"
                            }`}>
                              {isBoolean ? (
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${
                                  response.value 
                                    ? "bg-green-100 text-green-700" 
                                    : "bg-slate-100 text-slate-600"
                                }`}>
                                  {response.value ? (
                                    <><CheckCircle2 className="w-3 h-3" /> Yes</>
                                  ) : (
                                    <><X className="w-3 h-3" /> No</>
                                  )}
                                </span>
                              ) : isArray ? (
                                <div className="flex flex-wrap gap-1">
                                  {response.value.map((v, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs">
                                      {String(v)}
                                    </Badge>
                                  ))}
                                </div>
                              ) : isNumeric ? (
                                <span className="font-mono text-base">
                                  {response.value}
                                  {response.unit && <span className="text-slate-500 ml-1 text-sm">{response.unit}</span>}
                                </span>
                              ) : hasAttachment ? (
                                <button
                                  onClick={() => {
                                    const url = response.attachment_url || response.file_url;
                                    if (isImage) {
                                      setViewingImage({ url, name: response.field_label || "Image" });
                                    } else {
                                      window.open(url, '_blank');
                                    }
                                  }}
                                  className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800"
                                >
                                  {isImage ? <Image className="w-4 h-4" /> : <Paperclip className="w-4 h-4" />}
                                  <span className="underline">View attachment</span>
                                </button>
                              ) : (
                                <span className="whitespace-pre-wrap break-words">
                                  {String(response.value || "—")}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          {/* Status badges */}
                          <div className="flex items-center gap-1 shrink-0">
                            {(isWarning || isCritical) && (
                              <Badge className={`text-[10px] ${isCritical ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                                {isCritical ? "Critical" : "Warning"}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  {(!selectedSubmission.responses?.length && !selectedSubmission.values?.length) && (
                    <div className="text-center py-6 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                      <FileText className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <p className="text-sm text-slate-500">No responses recorded</p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Attachments */}
              {selectedSubmission.attachments?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-slate-500" />
                    Attachments ({selectedSubmission.attachments.length})
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {selectedSubmission.attachments.map((att, idx) => {
                      const isImage = att.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name || att.filename || "");
                      const isPdf = att.type === 'application/pdf' || /\.pdf$/i.test(att.name || att.filename || "");
                      const isDoc = /\.(doc|docx)$/i.test(att.name || att.filename || "");
                      const previewUrl = att.url || att.data;
                      const fileName = att.name || att.filename || "Attachment";
                      
                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            if (isImage && previewUrl) {
                              setViewingImage({ url: previewUrl, name: fileName });
                            } else if ((isPdf || isDoc) && previewUrl) {
                              setViewingDocument({ url: previewUrl, name: fileName, type: att.type });
                            } else if (previewUrl) {
                              const link = document.createElement('a');
                              link.href = previewUrl;
                              link.download = fileName;
                              link.click();
                            }
                          }}
                          className="relative group bg-slate-100 rounded-xl border border-slate-200 overflow-hidden aspect-square hover:border-blue-300 hover:shadow-md transition-all"
                        >
                          {isImage && previewUrl ? (
                            <img src={previewUrl} alt={fileName} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center p-3">
                              {isPdf ? (
                                <FileText className="w-10 h-10 text-red-400 mb-2" />
                              ) : isDoc ? (
                                <FileText className="w-10 h-10 text-blue-400 mb-2" />
                              ) : (
                                <File className="w-10 h-10 text-slate-400 mb-2" />
                              )}
                              <span className="text-xs text-slate-500 uppercase font-medium">
                                {fileName.split('.').pop()}
                              </span>
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
                            <p className="text-[11px] text-white truncate font-medium">{fileName}</p>
                          </div>
                          <div className="absolute inset-0 bg-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="bg-white/90 rounded-full p-2 shadow-lg">
                              {isImage ? <ZoomIn className="w-5 h-5 text-blue-600" /> : <Eye className="w-5 h-5 text-blue-600" />}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Notes */}
              {selectedSubmission.notes && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Notes</h4>
                  <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
                    {selectedSubmission.notes}
                  </p>
                </div>
              )}
              
              {/* Signature Indicator */}
              {selectedSubmission.has_signature && (
                <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded-lg">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Digitally signed</span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Document Viewer */}
      {viewingDocument && (
        <DocumentViewer
          url={viewingDocument.url || viewingDocument.data}
          fileName={viewingDocument.name}
          fileType={viewingDocument.type}
          onClose={() => setViewingDocument(null)}
        />
      )}

      {/* Image Lightbox */}
      {viewingImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setViewingImage(null)}
        >
          <div className="relative max-w-full max-h-full">
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute -top-12 right-0 text-white hover:bg-white/20"
              onClick={() => setViewingImage(null)}
            >
              <X className="w-6 h-6" />
            </Button>
            
            {/* Image */}
            <img
              src={viewingImage.url}
              alt={viewingImage.name}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            
            {/* File name */}
            <div className="absolute -bottom-10 left-0 right-0 text-center">
              <p className="text-white/80 text-sm">{viewingImage.name}</p>
            </div>
            
            {/* Download button */}
            <Button
              variant="ghost"
              size="sm"
              className="absolute -top-12 left-0 text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                const link = document.createElement('a');
                link.href = viewingImage.url;
                link.download = viewingImage.name;
                link.click();
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
