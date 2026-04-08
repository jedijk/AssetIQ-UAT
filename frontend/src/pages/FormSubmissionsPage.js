import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Trash2,
  MoreVertical,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import DesktopOnlyMessage from "../components/DesktopOnlyMessage";
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
  DialogFooter,
} from "../components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import BackButton from "../components/BackButton";
import { DISCIPLINES, getDisciplineColor } from "../constants/disciplines";
import { DocumentViewer } from "../components/DocumentViewer";
import { format, parseISO } from "date-fns";

const API_BASE_URL = getBackendUrl();

// Hook to detect mobile
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  return isMobile;
};

// Fetch form submissions
const fetchSubmissions = async (filters) => {
  const params = new URLSearchParams();
  params.append("limit", "20");  // Optimized limit for fast loading
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
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [loadingSubmission, setLoadingSubmission] = useState(false);
  const [viewingDocument, setViewingDocument] = useState(null);
  const [viewingImage, setViewingImage] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Function to handle clicking on a submission - fetches full details
  const handleSubmissionClick = async (submission) => {
    setLoadingSubmission(true);
    try {
      const fullSubmission = await fetchSubmission(submission.id);
      setSelectedSubmission(fullSubmission);
    } catch (error) {
      console.error("Failed to fetch submission details:", error);
      // Fallback to the lightweight version if fetch fails
      setSelectedSubmission(submission);
    } finally {
      setLoadingSubmission(false);
    }
  };

  // Close image lightbox with Escape key
  const closeImageLightbox = useCallback(() => {
    setViewingImage(null);
  }, []);
  
  useEffect(() => {
    if (!viewingImage) return;
    
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        closeImageLightbox();
      }
    };
    
    // Disable pointer events on dialog overlay when lightbox is open
    const dialogOverlay = document.querySelector('[data-dialog-overlay="true"]');
    if (dialogOverlay) {
      dialogOverlay.style.pointerEvents = 'none';
    }
    
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Re-enable pointer events when lightbox closes
      if (dialogOverlay) {
        dialogOverlay.style.pointerEvents = '';
      }
    };
  }, [viewingImage, closeImageLightbox]);

  // Fetch submissions
  const { data: submissionsData, isLoading, refetch } = useQuery({
    queryKey: ["form-submissions", { hasWarnings: statusFilter === "warnings", hasCritical: statusFilter === "critical" }],
    queryFn: () => fetchSubmissions({
      hasWarnings: statusFilter === "warnings",
      hasCritical: statusFilter === "critical",
    }),
    enabled: !isMobile, // Don't fetch on mobile
    staleTime: 30000, // Cache for 30 seconds to prevent excessive refetching
    gcTime: 60000, // Keep in cache for 1 minute
  });

  // Delete mutation - must be before any early returns
  const deleteMutation = useMutation({
    mutationFn: async (submissionId) => {
      const response = await fetch(`${API_BASE_URL}/api/form-submissions/${submissionId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (!response.ok) throw new Error("Failed to delete submission");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Form submission deleted");
      queryClient.invalidateQueries({ queryKey: ["form-submissions"] });
      setDeleteConfirm(null);
      setSelectedSubmission(null);
    },
    onError: () => {
      toast.error("Failed to delete submission");
    },
  });

  // Show mobile restriction message
  if (isMobile) {
    return (
      <DesktopOnlyMessage 
        title="Form Submissions" 
        icon={ClipboardList}
        description="Form submissions viewing is optimized for desktop. Please use a larger screen for the best experience."
      />
    );
  }

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
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <BackButton />
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-slate-800 flex items-center gap-1.5 sm:gap-2">
                  <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                  <span className="hidden xs:inline">Form</span> Submissions
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 hidden sm:block">
                  View all submitted forms and their responses
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
        <div className="grid grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-white rounded-lg sm:rounded-xl border border-slate-200 p-2 sm:p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row items-center sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-blue-100 flex items-center justify-center mb-1 sm:mb-0">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
              </div>
              <div className="text-center sm:text-left">
                <p className="text-[10px] sm:text-xs text-slate-500">Total</p>
                <p className="text-lg sm:text-xl font-bold text-slate-800">{stats.total}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg sm:rounded-xl border border-slate-200 p-2 sm:p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row items-center sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-green-100 flex items-center justify-center mb-1 sm:mb-0">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
              </div>
              <div className="text-center sm:text-left">
                <p className="text-[10px] sm:text-xs text-slate-500">Today</p>
                <p className="text-lg sm:text-xl font-bold text-slate-800">{stats.today}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg sm:rounded-xl border border-slate-200 p-2 sm:p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row items-center sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-amber-100 flex items-center justify-center mb-1 sm:mb-0">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
              </div>
              <div className="text-center sm:text-left">
                <p className="text-[10px] sm:text-xs text-slate-500">Warn</p>
                <p className="text-lg sm:text-xl font-bold text-slate-800">{stats.withWarnings}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg sm:rounded-xl border border-slate-200 p-2 sm:p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row items-center sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-red-100 flex items-center justify-center mb-1 sm:mb-0">
                <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
              </div>
              <div className="text-center sm:text-left">
                <p className="text-[10px] sm:text-xs text-slate-500">Critical</p>
                <p className="text-lg sm:text-xl font-bold text-slate-800">{stats.withCritical}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg sm:rounded-xl border border-slate-200 p-3 sm:p-4 mb-4 sm:mb-6 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search forms..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Select value={disciplineFilter} onValueChange={setDisciplineFilter}>
                <SelectTrigger className="w-full sm:w-[150px] h-9 text-sm">
                  <Wrench className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
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
                <SelectTrigger className="w-full sm:w-[130px] h-9 text-sm">
                  <Filter className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="warnings">Warnings</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Submissions List */}
        <div className="bg-white rounded-lg sm:rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 sm:p-8 text-center text-slate-500">
              <div className="animate-spin w-6 h-6 sm:w-8 sm:h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
              <span className="text-sm">Loading submissions...</span>
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="p-6 sm:p-8 text-center text-slate-500">
              <FileText className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-slate-300" />
              <p className="font-medium text-sm sm:text-base">No submissions found</p>
              <p className="text-xs sm:text-sm">Form submissions will appear here when tasks are completed</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredSubmissions.map((submission, idx) => {
                const discInfo = getDisciplineInfo(submission.discipline);
                const hasAttachments = submission.attachments?.length > 0;
                
                return (
                  <motion.div
                    key={submission.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="p-3 sm:p-4 hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => handleSubmissionClick(submission)}
                    data-testid={`submission-row-${submission.id}`}
                  >
                    <div className="flex items-start justify-between gap-2 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Form Name & Status & Attachment Badge */}
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-slate-800 text-sm sm:text-base truncate max-w-[180px] sm:max-w-none">
                            {submission.form_template_name || "Unknown Form"}
                          </h3>
                          {getStatusBadge(submission)}
                          {hasAttachments && (
                            <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 py-0 gap-0.5 border-blue-200 text-blue-600">
                              <Paperclip className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                              {submission.attachments.length}
                            </Badge>
                          )}
                        </div>
                        
                        {/* Meta Info Row - Simplified on mobile */}
                        <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-4 gap-y-0.5 text-xs sm:text-sm text-slate-500">
                          {/* Date & Time */}
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            <span className="hidden sm:inline">{formatDate(submission.submitted_at)}</span>
                            <span className="sm:hidden">{submission.submitted_at ? format(parseISO(submission.submitted_at), "MMM d") : "N/A"}</span>
                          </div>
                          
                          {/* Submitted By - Hide name on mobile */}
                          {submission.submitted_by_name && (
                            <div className="hidden sm:flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5" />
                              <span>{submission.submitted_by_name}</span>
                            </div>
                          )}
                          
                          {/* Discipline */}
                          {submission.discipline && (
                            <div className="flex items-center gap-1">
                              <span className={`w-2 h-2 rounded-full ${discInfo.color}`} />
                              <span className="hidden sm:inline">{discInfo.label}</span>
                            </div>
                          )}
                          
                          {/* Response count */}
                          {(submission.responses?.length || submission.values?.length) > 0 && (
                            <div className="flex items-center gap-0.5 text-slate-400">
                              <FileText className="w-3 h-3" />
                              <span className="text-[10px] sm:text-xs">{submission.responses?.length || submission.values?.length}</span>
                            </div>
                          )}
                        </div>
                        
                        {/* Equipment & Task Row - Only on larger screens */}
                        <div className="hidden sm:flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 mt-1">
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
                        </div>
                      </div>
                      
                      {/* Actions - Desktop: View button, Mobile: Menu */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* View Button - Desktop only */}
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="hidden sm:flex"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSubmissionClick(submission);
                          }}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        
                        {/* More Menu */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handleSubmissionClick(submission);
                            }}>
                              <Eye className="w-4 h-4 mr-2" /> View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirm(submission);
                              }}
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Submission Detail Dialog */}
      <Dialog open={!!selectedSubmission || loadingSubmission} onOpenChange={() => { setSelectedSubmission(null); setLoadingSubmission(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
              {selectedSubmission?.form_template_name || "Loading..."}
            </DialogTitle>
          </DialogHeader>
          
          {loadingSubmission && !selectedSubmission && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}
          
          {selectedSubmission && (
            <div className="space-y-4 mt-2 sm:mt-4">
              {/* Submission Info - Responsive grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 p-3 sm:p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-[10px] sm:text-xs text-slate-500 mb-0.5">Submitted At</p>
                  <p className="text-xs sm:text-sm font-medium">{formatDate(selectedSubmission.submitted_at)}</p>
                </div>
                <div>
                  <p className="text-[10px] sm:text-xs text-slate-500 mb-0.5">Submitted By</p>
                  <p className="text-xs sm:text-sm font-medium">{selectedSubmission.submitted_by_name || "Unknown"}</p>
                </div>
                {selectedSubmission.discipline && (
                  <div>
                    <p className="text-[10px] sm:text-xs text-slate-500 mb-0.5">Discipline</p>
                    <p className="text-xs sm:text-sm font-medium flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${getDisciplineInfo(selectedSubmission.discipline).color}`} />
                      {getDisciplineInfo(selectedSubmission.discipline).label}
                    </p>
                  </div>
                )}
                {selectedSubmission.equipment_name && (
                  <div>
                    <p className="text-[10px] sm:text-xs text-slate-500 mb-0.5">Equipment</p>
                    <p className="text-xs sm:text-sm font-medium flex items-center gap-1.5">
                      <Building2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400" />
                      <span className="truncate">{selectedSubmission.equipment_name}</span>
                    </p>
                  </div>
                )}
                {selectedSubmission.task_template_name && (
                  <div className="sm:col-span-2">
                    <p className="text-[10px] sm:text-xs text-slate-500 mb-0.5">Originating Task</p>
                    <p className="text-xs sm:text-sm font-medium flex items-center gap-1.5">
                      <ClipboardList className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400" />
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
                    
                    // Check if this is a signature field (base64 data URL or field_type is signature)
                    const isSignature = response.field_type === "signature" || 
                      (typeof response.value === "string" && response.value?.startsWith("data:image/png;base64,"));
                    
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
                              {isSignature && response.value ? (
                                <button
                                  onClick={() => setViewingImage({ url: response.value, name: response.field_label || "Signature" })}
                                  className="block bg-slate-50 border border-slate-200 rounded-lg p-2 hover:border-blue-300 hover:shadow-sm transition-all"
                                >
                                  <img 
                                    src={response.value} 
                                    alt="Signature" 
                                    className="max-h-16 sm:max-h-20 w-auto object-contain"
                                  />
                                  <span className="text-[10px] text-slate-500 mt-1 block">Tap to enlarge</span>
                                </button>
                              ) : isBoolean ? (
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
                                    <Badge key={`${response.field_id}-${i}`} variant="secondary" className="text-xs">
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
                  <div className="flex flex-wrap gap-2">
                    {selectedSubmission.attachments.map((att) => {
                      const isImage = att.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name || att.filename || "");
                      const isPdf = att.type === 'application/pdf' || /\.pdf$/i.test(att.name || att.filename || "");
                      const isDoc = /\.(doc|docx)$/i.test(att.name || att.filename || "");
                      // Construct full URL for attachments stored in object storage
                      // Include token in URL for browser image loading (can't send auth headers with <img>)
                      const rawUrl = att.url || att.data;
                      const authToken = localStorage.getItem('token');
                      const previewUrl = rawUrl && !rawUrl.startsWith('data:') && !rawUrl.startsWith('http') 
                        ? `${getBackendUrl()}/api/storage/${rawUrl}${authToken ? `?token=${authToken}` : ''}` 
                        : rawUrl;
                      const fileName = att.name || att.filename || "Attachment";
                      const hasError = att.error || att.needs_migration;
                      
                      return (
                        <button
                          key={att.id || att.url || att.name}
                          onClick={() => {
                            if (hasError) return; // Don't allow interaction for unavailable attachments
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
                          className={`relative group rounded-lg border overflow-hidden transition-all w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0 ${
                            hasError 
                              ? 'bg-amber-50 border-amber-300 cursor-not-allowed opacity-75' 
                              : 'bg-slate-100 border-slate-200 hover:border-blue-300 hover:shadow-md'
                          }`}
                          disabled={hasError}
                        >
                          {hasError ? (
                            <div className="w-full h-full flex flex-col items-center justify-center p-2">
                              <AlertTriangle className="w-8 h-8 text-amber-500 mb-1" />
                              <span className="text-[10px] text-amber-600 text-center px-1">
                                Unavailable
                              </span>
                            </div>
                          ) : isImage && previewUrl ? (
                            <img src={previewUrl} alt={fileName} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center p-2">
                              {isPdf ? (
                                <FileText className="w-8 h-8 text-red-400 mb-1" />
                              ) : isDoc ? (
                                <FileText className="w-8 h-8 text-blue-400 mb-1" />
                              ) : (
                                <File className="w-8 h-8 text-slate-400 mb-1" />
                              )}
                              <span className="text-[10px] text-slate-500 uppercase font-medium">
                                {fileName.split('.').pop()}
                              </span>
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1">
                            <p className="text-[10px] text-white truncate font-medium">{fileName}</p>
                          </div>
                          {!hasError && (
                            <div className="absolute inset-0 bg-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <div className="bg-white/90 rounded-full p-1.5 shadow-lg">
                                {isImage ? <ZoomIn className="w-4 h-4 text-blue-600" /> : <Eye className="w-4 h-4 text-blue-600" />}
                              </div>
                            </div>
                          )}
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
              
              {/* Delete Button */}
              <div className="pt-4 border-t border-slate-200">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => setDeleteConfirm(selectedSubmission)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Submission
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Form Submission</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this form submission "{deleteConfirm?.form_template_name}"? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deleteConfirm?.id)}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Document Viewer */}
      {viewingDocument && (
        <DocumentViewer
          url={viewingDocument.url || viewingDocument.data}
          fileName={viewingDocument.name}
          fileType={viewingDocument.type}
          onClose={() => setViewingDocument(null)}
        />
      )}

      {/* Image Lightbox - Using Portal to render above all dialogs */}
      {viewingImage && createPortal(
        <div 
          data-testid="image-lightbox"
          className="fixed inset-0 z-[9999] bg-black flex items-center justify-center p-2 sm:p-4"
          onClick={() => setViewingImage(null)}
        >
          {/* Close button - Fixed position in top right corner, larger on mobile */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 sm:top-4 sm:right-4 text-white hover:bg-white/20 active:bg-white/30 z-10 w-12 h-12 sm:w-10 sm:h-10 rounded-full bg-black/40"
            onClick={(e) => {
              e.stopPropagation();
              setViewingImage(null);
            }}
          >
            <X className="w-7 h-7 sm:w-6 sm:h-6" />
          </Button>
          
          {/* Download button - Fixed position in top left corner, icon-only on mobile */}
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-2 left-2 sm:top-4 sm:left-4 text-white hover:bg-white/20 active:bg-white/30 z-10 h-12 sm:h-auto px-3 sm:px-4 rounded-full sm:rounded-md bg-black/40"
            onClick={(e) => {
              e.stopPropagation();
              const link = document.createElement('a');
              link.href = viewingImage.url;
              link.download = viewingImage.name;
              link.click();
            }}
          >
            <Download className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
            <span className="hidden sm:inline">Download</span>
          </Button>
          
          <div className="relative max-w-full max-h-full flex items-center justify-center">
            {/* Image - Tap anywhere outside to close */}
            <img
              src={viewingImage.url}
              alt={viewingImage.name}
              className="max-w-full max-h-[80vh] sm:max-h-[85vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            
            {/* File name - Positioned below image */}
            <div className="absolute -bottom-8 sm:-bottom-10 left-0 right-0 text-center px-4">
              <p className="text-white/80 text-xs sm:text-sm truncate">{viewingImage.name}</p>
            </div>
          </div>
          
          {/* Tap to close hint on mobile */}
          <p className="absolute bottom-4 left-0 right-0 text-center text-white/50 text-xs sm:hidden">
            Tap outside image to close
          </p>
        </div>,
        document.body
      )}
    </div>
  );
}
