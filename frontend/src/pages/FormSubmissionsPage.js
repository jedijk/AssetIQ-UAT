import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { getBackendUrl, getAuthHeaders } from '../lib/apiConfig';
import { useLanguage } from "../contexts/LanguageContext";
import { AuthenticatedImage, useAuthenticatedMedia } from "../components/AuthenticatedMedia";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { VirtualList } from "../components/ui/VirtualList";
import { Skeleton } from "../components/ui/skeleton";
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
  ArrowLeft,
  Check,
  CheckSquare,
  Lightbulb,
  Settings,
  Sparkles,
  Users,
  Printer,
  Loader2,
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
import { formatDate as formatDateUtil, formatDateTime as formatDateTimeUtil } from "../lib/dateUtils";
import { formAPI } from "../components/forms/formAPI";
import { openPrintWindow, isMobileDevice } from "../lib/printLabel";

const API_BASE_URL = getBackendUrl();
const AUTH_MODE = process.env.REACT_APP_AUTH_MODE || "bearer";
const FETCH_CREDENTIALS = AUTH_MODE === "cookie" ? "include" : "same-origin";

function getCookie(name) {
  try {
    const cookies = document.cookie ? document.cookie.split(";") : [];
    for (const c of cookies) {
      const [k, ...rest] = c.trim().split("=");
      if (k === name) return decodeURIComponent(rest.join("=") || "");
    }
  } catch (_e) {}
  return null;
}

// Authenticated Lightbox component for viewing images with proper mobile auth
const AuthenticatedLightbox = ({ url, name, onClose }) => {
  const [blobUrl, setBlobUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let objectUrl = null;
    
    const fetchImage = async () => {
      // If it's a data URL (base64 signature), use directly
      if (url?.startsWith('data:')) {
        setBlobUrl(url);
        setIsLoading(false);
        return;
      }
      
      // If it's already a blob URL, use directly
      if (url?.startsWith('blob:')) {
        setBlobUrl(url);
        setIsLoading(false);
        return;
      }

      try {
        const token = localStorage.getItem("token");
        
        // Build full URL if needed
        let fullUrl = url;
        if (url?.startsWith("/api/")) {
          fullUrl = `${API_BASE_URL}${url}`;
        }

        const headers = {};
        if (AUTH_MODE !== "cookie" && token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(fullUrl, {
          headers,
          credentials: FETCH_CREDENTIALS,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        setIsLoading(false);
      } catch (err) {
        console.error("Failed to load lightbox image:", err);
        setError(err.message);
        setIsLoading(false);
      }
    };

    fetchImage();

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url]);

  const handleDownload = (e) => {
    e.stopPropagation();
    if (blobUrl) {
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = name || 'image';
      link.click();
    }
  };

  return (
    <div 
      data-testid="image-lightbox"
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
    >
      {/* Close button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 sm:top-4 sm:right-4 text-white hover:bg-white/20 active:bg-white/30 z-10 w-12 h-12 sm:w-10 sm:h-10 rounded-full bg-black/40"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <X className="w-7 h-7 sm:w-6 sm:h-6" />
      </Button>
      
      {/* Download button */}
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 left-2 sm:top-4 sm:left-4 text-white hover:bg-white/20 active:bg-white/30 z-10 h-12 sm:h-auto px-3 sm:px-4 rounded-full sm:rounded-md bg-black/40"
        onClick={handleDownload}
        disabled={!blobUrl}
      >
        <Download className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
        <span className="hidden sm:inline">Download</span>
      </Button>
      
      <div className="relative max-w-full max-h-full flex items-center justify-center">
        {isLoading && (
          <div className="flex items-center justify-center">
            <div className="animate-spin h-10 w-10 border-3 border-amber-500 border-t-transparent rounded-full" />
          </div>
        )}
        
        {error && (
          <div className="text-white/70 text-center">
            <p className="text-lg mb-2">Failed to load image</p>
            <p className="text-sm">Click anywhere to close</p>
          </div>
        )}
        
        {blobUrl && !isLoading && !error && (
          <img
            src={blobUrl}
            alt={name}
            className="max-w-full max-h-[80vh] sm:max-h-[85vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        )}
        
        {/* File name */}
        {name && (
          <div className="absolute -bottom-8 sm:-bottom-10 left-0 right-0 text-center px-4">
            <p className="text-white/80 text-xs sm:text-sm truncate">{name}</p>
          </div>
        )}
      </div>
      
      {/* Tap to close hint on mobile */}
      <p className="absolute bottom-4 left-0 right-0 text-center text-white/50 text-xs sm:hidden">
        Tap outside image to close
      </p>
    </div>
  );
};

// Image component with fallback for failed loads - matching statistics page style
const ImageWithFallback = ({ src, alt, fallback }) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Reset state when src changes
  useEffect(() => {
    setHasError(false);
    setIsLoading(true);
  }, [src]);

  if (hasError) {
    return fallback;
  }

  return (
    <>
      {isLoading && (
        <div className="w-full h-full flex items-center justify-center bg-slate-50">
          <div className="animate-spin h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-cover ${isLoading ? 'hidden' : ''}`}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
      />
    </>
  );
};

// User Avatar component with photo support
const UserAvatar = ({ name, photo, size = "sm" }) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  
  const sizeClasses = {
    xs: "w-5 h-5 text-[8px]",
    sm: "w-6 h-6 text-[9px]",
    md: "w-8 h-8 text-xs",
    lg: "w-10 h-10 text-sm"
  };
  
  const getAvatarColor = (name) => {
    const colors = [
      "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
      "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-rose-500"
    ];
    if (!name) return colors[0];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const getPhotoUrl = () => {
    if (!photo || imageError) return null;
    
    if (photo.startsWith("/api/")) {
      const token = localStorage.getItem("token");
      const backendUrl = getBackendUrl();
      if (token && backendUrl && backendUrl.startsWith('http')) {
        return `${backendUrl}${photo}?token=${token}`;
      }
      return null;
    }
    
    if (photo.startsWith("http")) {
      return photo;
    }
    
    return null;
  };

  const photoUrl = getPhotoUrl();
  const initials = name ? name.charAt(0).toUpperCase() : "?";

  if (photoUrl) {
    return (
      <div className="relative">
        {(!imageLoaded || imageError) && (
          <div className={`${sizeClasses[size]} ${getAvatarColor(name)} rounded-full flex items-center justify-center text-white font-medium ring-2 ring-white flex-shrink-0 absolute inset-0`}>
            {initials}
          </div>
        )}
        <img
          src={photoUrl}
          alt={name || "User"}
          className={`${sizeClasses[size]} rounded-full object-cover ring-2 ring-white flex-shrink-0 ${imageLoaded && !imageError ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setImageLoaded(true)}
          onError={() => {
            setImageError(true);
            setImageLoaded(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className={`${sizeClasses[size]} ${getAvatarColor(name)} rounded-full flex items-center justify-center text-white font-medium ring-2 ring-white flex-shrink-0`}>
      {initials}
    </div>
  );
};

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
    headers: getAuthHeaders(),
    credentials: FETCH_CREDENTIALS,
  });
  if (!response.ok) throw new Error("Failed to fetch submissions");
  return response.json();
};

// Fetch single submission
const fetchSubmission = async (id) => {
  const response = await fetch(`${API_BASE_URL}/api/form-submissions/${id}`, {
    headers: getAuthHeaders(),
    credentials: FETCH_CREDENTIALS,
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
  const location = useLocation();

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

  // Auto-open a submission if navigated here with { state: { submissionId } }
  useEffect(() => {
    const sid = location.state?.submissionId;
    if (sid) {
      handleSubmissionClick({ id: sid });
      // Clear the state so we don't re-open on back navigation
      window.history.replaceState({}, document.title);
    }
  }, [location.state?.submissionId]); // eslint-disable-line

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
      const headers = getAuthHeaders();
      if (AUTH_MODE === "cookie") {
        const csrf = getCookie("assetiq_csrf");
        if (csrf) headers["X-CSRF-Token"] = csrf;
      }
      const response = await fetch(`${API_BASE_URL}/api/form-submissions/${submissionId}`, {
        method: "DELETE",
        headers,
        credentials: FETCH_CREDENTIALS,
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

  const submissions = submissionsData?.submissions || [];

  // Fetch form templates so we can decide which submissions allow label reprint.
  // We only need the (lightweight) list — every template carries label_print_config.
  const { data: templatesData } = useQuery({
    queryKey: ["form-templates", "for-label-reprint"],
    queryFn: () => formAPI.getTemplates(),
    // Needed on mobile too so we can fall back to the form template's label_print_config
    // when older submissions don't yet have submission.label_template_id.
    enabled: true,
    staleTime: 5 * 60 * 1000,
  });

  // Map: template_id -> label_print_config
  const labelConfigByTemplate = (templatesData?.templates || []).reduce((acc, t) => {
    if (t?.id) acc[t.id] = t.label_print_config || null;
    return acc;
  }, {});

  // Track per-submission print state so the spinner only flips on the row clicked.
  const [printingId, setPrintingId] = useState(null);

  const reprintLabel = async (submission, e) => {
    e?.stopPropagation?.();
    const cfg = labelConfigByTemplate[submission.form_template_id];
    const templateId = submission?.label_template_id || cfg?.label_template_id;
    if (!cfg?.enabled || !templateId) {
      toast.error("This form has no label template configured.");
      return;
    }
    // Open a window synchronously inside the click handler so iOS Safari
    // doesn't block it; we'll fill it once the fetch returns.
    let preOpened = null;
    try {
      if (isMobileDevice()) preOpened = openPrintWindow();
    } catch (_e) { /* ignore */ }

    setPrintingId(submission.id);
    try {
      const { printLabel } = await import("../lib/printLabel");
      try {
        // Helpful for iOS debugging: confirm which template is actually being used.
        // eslint-disable-next-line no-console
        console.log("[labels] reprint", { submissionId: submission.id, templateId });
      } catch (_e) {}
      const res = await printLabel(
        {
          template_id: templateId,
          submission_id: submission.id,
          copies: 1,
        },
        {
          win: preOpened,
          filename: `${submission.form_template_name || "label"}.pdf`,
        }
      );
      if (res.method === "window") toast.success("Label print dialog opened");
      else if (res.mobile) toast.info("Label downloaded — use Share → Print");
      else if (res.method === "download") toast.info("Print blocked — label downloaded.");
      else toast.success("Print dialog opened");
    } catch (err) {
      if (preOpened && !preOpened.closed) preOpened.close();
      toast.error(err?.response?.data?.detail || "Print failed");
    } finally {
      setPrintingId(null);
    }
  };

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
      return formatDateTimeUtil(dateStr);
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
            <div className="p-4 sm:p-6 space-y-3" data-testid="submissions-skeleton">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-64 rounded" />
                      <Skeleton className="h-3 w-80 rounded" />
                      <div className="flex gap-2 pt-1">
                        <Skeleton className="h-5 w-20 rounded-full" />
                        <Skeleton className="h-5 w-24 rounded-full" />
                      </div>
                    </div>
                    <Skeleton className="h-8 w-20 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="p-6 sm:p-8 text-center text-slate-500">
              <FileText className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-slate-300" />
              <p className="font-medium text-sm sm:text-base">No submissions found</p>
              <p className="text-xs sm:text-sm">Form submissions will appear here when tasks are completed</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {isMobile ? (
                <VirtualList
                  className="h-[calc(100vh-260px)]"
                  data={filteredSubmissions}
                  itemContent={(idx, submission) => {
                    const discInfo = getDisciplineInfo(submission.discipline);
                    const hasAttachments = submission.attachments?.length > 0;
                    return (
                      <motion.div
                        key={submission.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.01 }}
                        className="p-3 sm:p-4 hover:bg-slate-50 cursor-pointer transition-colors"
                        onClick={() => handleSubmissionClick(submission)}
                        data-testid={`submission-row-${submission.id}`}
                      >
                        <div className="flex items-start justify-between gap-2 sm:gap-4">
                          <div className="flex-1 min-w-0">
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
                            {submission.equipment_tag && (
                              <div className="text-xs text-slate-400 font-mono mb-1">{submission.equipment_tag}</div>
                            )}
                            <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-4 gap-y-0.5 text-xs sm:text-sm text-slate-500">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                <span className="sm:hidden">{submission.submitted_at ? formatDateUtil(submission.submitted_at, { format: "short" }) : "N/A"}</span>
                              </div>
                              {submission.discipline && (
                                <div className="flex items-center gap-1">
                                  <span className={`w-2 h-2 rounded-full ${discInfo.color}`} />
                                  <span className="hidden sm:inline">{discInfo.label}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0 mt-0.5" />
                        </div>
                      </motion.div>
                    );
                  }}
                />
              ) : (
              filteredSubmissions.map((submission, idx) => {
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
                        {submission.equipment_tag && (
                          <div className="text-xs text-slate-400 font-mono mb-1">{submission.equipment_tag}</div>
                        )}
                        
                        {/* Meta Info Row - Simplified on mobile */}
                        <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-4 gap-y-0.5 text-xs sm:text-sm text-slate-500">
                          {/* Date & Time */}
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            <span className="hidden sm:inline">{formatDate(submission.submitted_at)}</span>
                            <span className="sm:hidden">{submission.submitted_at ? formatDateUtil(submission.submitted_at, { format: 'short' }) : "N/A"}</span>
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
                        {/* Reprint Label - only when form has label printing enabled */}
                        {(() => {
                          const cfg = labelConfigByTemplate[submission.form_template_id];
                          if (!cfg?.enabled || !cfg?.label_template_id) return null;
                          const isPrinting = printingId === submission.id;
                          return (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-500 hover:text-indigo-600"
                              title="Reprint label"
                              data-testid={`reprint-label-${submission.id}`}
                              onClick={(e) => reprintLabel(submission, e)}
                              disabled={isPrinting}
                            >
                              {isPrinting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Printer className="w-4 h-4" />
                              )}
                            </Button>
                          );
                        })()}

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
              })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Submission Detail Dialog */}
      {/* Quick View Modal - Matching Dashboard Design */}
      <Dialog open={!!selectedSubmission || loadingSubmission} onOpenChange={() => { setSelectedSubmission(null); setLoadingSubmission(false); }}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
          {/* Header */}
          <div className="flex items-center px-4 py-3 border-b border-slate-100 flex-shrink-0">
            <button 
              onClick={() => setSelectedSubmission(null)}
              className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
          </div>
          
          {/* Loading state */}
          {loadingSubmission && !selectedSubmission && (
            <div className="flex-1 flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          
          {selectedSubmission && (
            <>
              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {/* Title and Status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-800">{selectedSubmission.form_template_name}</h2>
                      {selectedSubmission.equipment_tag && (
                        <div className="text-xs text-slate-400 font-mono">{selectedSubmission.equipment_tag}</div>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        <UserAvatar 
                          name={selectedSubmission.submitted_by_name || "Unknown"} 
                          photo={selectedSubmission.submitted_by_photo}
                          size="xs"
                        />
                        <span className="text-sm text-slate-500">{selectedSubmission.submitted_by_name || "Unknown"}</span>
                        <span className="text-slate-300">•</span>
                        <span className="text-sm text-slate-500">{formatDate(selectedSubmission.submitted_at)}</span>
                      </div>
                    </div>
                  </div>
                  <Badge className={`shrink-0 ${
                    selectedSubmission.has_critical 
                      ? "bg-red-100 text-red-700 border-red-200" 
                      : selectedSubmission.has_warnings 
                        ? "bg-amber-100 text-amber-700 border-amber-200" 
                        : "bg-green-100 text-green-700 border-green-200"
                  }`}>
                    {selectedSubmission.has_critical ? "Critical" : selectedSubmission.has_warnings ? "Warning" : "Completed"}
                  </Badge>
                </div>
                
                {/* Info Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 border-y border-slate-100">
                  <div className="flex items-center gap-2">
                    <UserAvatar 
                      name={selectedSubmission.submitted_by_name || "Unknown"} 
                      photo={selectedSubmission.submitted_by_photo}
                      size="md"
                    />
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Submitted by</p>
                      <p className="text-sm font-medium text-slate-700 mt-0.5">{selectedSubmission.submitted_by_name || "Unknown"}</p>
                    </div>
                  </div>
                  {selectedSubmission.equipment_name && (
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-slate-400" />
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Equipment</p>
                        <p className="text-sm font-medium text-slate-700 mt-0.5">
                          {selectedSubmission.equipment_name}
                        </p>
                        {selectedSubmission.equipment_tag && (
                          <p className="text-xs text-slate-400 font-mono mt-0.5">{selectedSubmission.equipment_tag}</p>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedSubmission.task_template_name && (
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-400" />
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Task</p>
                        <p className="text-sm font-medium text-slate-700 mt-0.5">
                          {selectedSubmission.task_template_name}
                        </p>
                      </div>
                    </div>
                  )}
                  {selectedSubmission.discipline && (
                    <div className="flex items-center gap-2">
                      <span className={`w-4 h-4 flex items-center justify-center`}>
                        <span className={`w-2.5 h-2.5 rounded-full ${getDisciplineInfo(selectedSubmission.discipline).color}`} />
                      </span>
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Discipline</p>
                        <p className="text-sm font-medium text-slate-700 mt-0.5">
                          {getDisciplineInfo(selectedSubmission.discipline).label}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* AI Vision Photo - shown when submission contains __ai_scan_photo */}
                {(() => {
                  const allResponses = selectedSubmission?.values || selectedSubmission?.responses || [];
                  const aiPhotoEntry = allResponses.find(r => r.field_id === "__ai_scan_photo" && r.value);
                  const aiPhotoPath = aiPhotoEntry?.value
                    || selectedSubmission?.ai_extraction?.extracted_fields?.__ai_scan_photo?.value;
                  if (!aiPhotoPath || typeof aiPhotoPath !== "string") return null;
                  const apiPath = aiPhotoPath.startsWith("http") || aiPhotoPath.startsWith("data:")
                    ? aiPhotoPath
                    : `/api/storage/${aiPhotoPath}`;
                  return (
                    <div data-testid="ai-vision-photo-section">
                      <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-blue-500" />
                        AI Vision Photo
                      </h3>
                      <button
                        type="button"
                        onClick={() => setViewingImage({ url: apiPath, name: "AI Vision Photo" })}
                        className="group relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 hover:border-blue-300 hover:shadow-md transition-all"
                        data-testid="ai-vision-photo-thumbnail"
                      >
                        <AuthenticatedImage
                          src={apiPath}
                          alt="AI Vision Source Photo"
                          className="w-full max-h-80 object-contain bg-slate-100"
                          fallback={
                            <div className="w-full h-48 flex flex-col items-center justify-center text-slate-400 gap-2">
                              <AlertTriangle className="w-8 h-8" />
                              <span className="text-xs">Photo unavailable</span>
                            </div>
                          }
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <div className="bg-white/90 rounded-full p-2 shadow-lg">
                            <ZoomIn className="w-5 h-5 text-slate-700" />
                          </div>
                        </div>
                      </button>
                      <p className="text-xs text-slate-400 mt-2">
                        Source image used by AI to auto-fill the fields below. Tap to enlarge.
                      </p>
                    </div>
                  );
                })()}

                {/* Checklist Section */}
                {(() => {
                  const responsesAll = selectedSubmission?.values || selectedSubmission?.responses || [];
                  // Hide internal AI photo field from the checklist
                  const responses = responsesAll.filter(r => r.field_id !== "__ai_scan_photo");
                  if (responses.length === 0) return null;
                  
                  return (
                    <div>
                      <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
                        <CheckSquare className="w-5 h-5 text-slate-600" />
                        Checklist
                      </h3>
                      <div className="space-y-2">
                        {responses.map((response, idx) => {
                          const isWarning = response.threshold_status === "warning";
                          const isCritical = response.threshold_status === "critical";
                          const isBoolean = typeof response.value === "boolean";
                          const isPass = isBoolean ? response.value : !isCritical && !isWarning;
                          const isSignature = response.field_type === "signature" || 
                            (typeof response.value === "string" && response.value?.startsWith("data:image/png;base64,"));
                          const hasAttachment = response.attachment_url || response.file_url;
                          const attachmentRawUrl = response.attachment_url || response.file_url || "";
                          const isImage = hasAttachment && /\.(jpg|jpeg|png|gif|webp)$/i.test(attachmentRawUrl);
                          // Clean API path for AuthenticatedLightbox (handles auth via headers)
                          const attachmentApiPath = attachmentRawUrl && !attachmentRawUrl.startsWith('data:') && !attachmentRawUrl.startsWith('http')
                            ? `/api/storage/${attachmentRawUrl}`
                            : attachmentRawUrl;
                          // Full URL with token for non-image downloads (fallback)
                          const authToken = localStorage.getItem('token');
                          const attachmentFullUrl = attachmentRawUrl && !attachmentRawUrl.startsWith('data:') && !attachmentRawUrl.startsWith('http')
                            ? `${getBackendUrl()}/api/storage/${attachmentRawUrl}${authToken ? `?token=${authToken}` : ''}`
                            : attachmentRawUrl;
                          
                          return (
                            <div 
                              key={response.field_id || `response-${idx}`}
                              className={`flex items-start gap-3 p-3 rounded-lg border-l-4 ${
                                isCritical 
                                  ? "bg-red-50 border-l-red-500" 
                                  : isWarning 
                                    ? "bg-amber-50 border-l-amber-500" 
                                    : "bg-white border-l-green-500"
                              } border border-l-4 border-slate-100`}
                            >
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                isCritical ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-green-500"
                              }`}>
                                {isCritical ? (
                                  <X className="w-3 h-3 text-white" />
                                ) : isWarning ? (
                                  <AlertTriangle className="w-3 h-3 text-white" />
                                ) : (
                                  <Check className="w-3 h-3 text-white" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0 pr-2">
                                <p className="font-medium text-slate-800 text-sm break-words">
                                  {(response.field_label || response.field_id || "").replace(/_/g, ' ')}
                                </p>
                                <p className="text-sm text-slate-500 mt-0.5">
                                  {isSignature && response.value ? (
                                    <button
                                      onClick={() => setViewingImage({ url: response.value, name: (response.field_label || "Signature").replace(/_/g, ' ') })}
                                      className="text-blue-600 hover:underline"
                                    >
                                      View Signature
                                    </button>
                                  ) : isBoolean ? (
                                    response.value ? "Yes" : "No"
                                  ) : Array.isArray(response.value) ? (
                                    response.value.join(", ")
                                  ) : hasAttachment ? (
                                    <button
                                      onClick={() => {
                                        if (isImage) {
                                          // Use clean API path - AuthenticatedLightbox handles auth
                                          setViewingImage({ url: attachmentApiPath, name: (response.field_label || "Image").replace(/_/g, ' ') });
                                        } else {
                                          window.open(attachmentFullUrl, '_blank');
                                        }
                                      }}
                                      className="text-blue-600 hover:underline flex items-center gap-1"
                                    >
                                      <Paperclip className="w-3 h-3" /> View Attachment
                                    </button>
                                  ) : (
                                    <>
                                      {String(response.value || "—")}
                                      {response.unit && <span className="text-slate-400 ml-1">{response.unit}</span>}
                                    </>
                                  )}
                                </p>
                              </div>
                              <Badge className={`shrink-0 text-xs font-medium ${
                                isCritical 
                                  ? "bg-red-100 text-red-700 border-red-200" 
                                  : isWarning 
                                    ? "bg-amber-100 text-amber-700 border-amber-200" 
                                    : "bg-green-100 text-green-700 border-green-200"
                              }`}>
                                {isCritical ? "FAIL" : isWarning ? "WARNING" : "PASS"}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                
                {/* Insights Section */}
                {(selectedSubmission?.values?.length > 0 || selectedSubmission?.responses?.length > 0) && (
                  <div>
                    <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
                      <Lightbulb className="w-5 h-5 text-slate-600" />
                      Insights
                    </h3>
                    <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                      {(() => {
                        const responsesAll = selectedSubmission?.values || selectedSubmission?.responses || [];
                        const responses = responsesAll.filter(r => r.field_id !== "__ai_scan_photo");
                        const totalItems = responses.length;
                        const passedItems = responses.filter(r => {
                          const isBoolean = typeof r.value === "boolean";
                          return isBoolean ? r.value : r.threshold_status !== "critical" && r.threshold_status !== "warning";
                        }).length;
                        const warningItems = responses.filter(r => r.threshold_status === "warning").length;
                        const criticalItems = responses.filter(r => r.threshold_status === "critical").length;
                        
                        return (
                          <>
                            {criticalItems > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-500" />
                                <span className="text-sm text-slate-700">{criticalItems} critical issue{criticalItems > 1 ? 's' : ''} require immediate attention</span>
                              </div>
                            )}
                            {warningItems > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-amber-500" />
                                <span className="text-sm text-slate-700">{warningItems} warning{warningItems > 1 ? 's' : ''} detected - monitor closely</span>
                              </div>
                            )}
                            {criticalItems === 0 && warningItems === 0 && (
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500" />
                                <span className="text-sm text-slate-700">No deviations detected in this round</span>
                              </div>
                            )}
                            {passedItems > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500" />
                                <span className="text-sm text-slate-700">{passedItems} of {totalItems} checks passed</span>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    
                    {/* Recommendation */}
                    <div className="bg-blue-50 rounded-lg p-4 mt-3 border border-blue-100">
                      <h4 className="font-semibold text-slate-800 flex items-center gap-2 mb-2">
                        <Sparkles className="w-4 h-4 text-blue-500" />
                        Recommendation:
                      </h4>
                      <p className="text-sm text-slate-600">
                        {(() => {
                          const responsesAll = selectedSubmission?.values || selectedSubmission?.responses || [];
                          const responses = responsesAll.filter(r => r.field_id !== "__ai_scan_photo");
                          const criticalItems = responses.filter(r => r.threshold_status === "critical").length;
                          const warningItems = responses.filter(r => r.threshold_status === "warning").length;
                          
                          if (criticalItems > 0) {
                            return "Immediate corrective action required. Create observation and action items for critical issues.";
                          } else if (warningItems > 0) {
                            return "Schedule follow-up inspection to monitor warning conditions. Consider preventive maintenance.";
                          } else {
                            return "Continue current maintenance schedule. Equipment is operating normally.";
                          }
                        })()}
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Attachments */}
                {selectedSubmission?.attachments?.length > 0 && (
                  <div>
                    <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
                      <Paperclip className="w-5 h-5 text-slate-600" />
                      Attachments ({selectedSubmission.attachments.length})
                    </h3>
                    <div className="space-y-3">
                      {selectedSubmission.attachments.map((att, idx) => {
                        const isImage = att.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name || att.filename || "");
                        const rawUrl = att.url || att.data;
                        // Clean API path for AuthenticatedImage/Lightbox (handles auth via headers)
                        const apiPath = rawUrl && !rawUrl.startsWith('data:') && !rawUrl.startsWith('http') 
                          ? `/api/storage/${rawUrl}` 
                          : rawUrl;
                        // Full URL with token for non-image downloads (fallback)
                        const authToken = localStorage.getItem('token');
                        const downloadUrl = rawUrl && !rawUrl.startsWith('data:') && !rawUrl.startsWith('http') 
                          ? `${getBackendUrl()}/api/storage/${rawUrl}${authToken ? `?token=${authToken}` : ''}` 
                          : rawUrl;
                        const fileName = att.name || att.filename || "Attachment";
                        const hasError = att.error || att.needs_migration;
                        
                        return (
                          <div 
                            key={att.url || att.id || `attachment-${idx}`}
                            className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100"
                          >
                            {/* Thumbnail - Use AuthenticatedImage for proper mobile auth */}
                            <div className="w-20 h-16 bg-slate-200 rounded-lg overflow-hidden flex-shrink-0">
                              {hasError ? (
                                <div className="w-full h-full flex items-center justify-center bg-amber-50">
                                  <AlertTriangle className="w-6 h-6 text-amber-500" />
                                </div>
                              ) : isImage && apiPath ? (
                                <AuthenticatedImage 
                                  src={apiPath} 
                                  alt={fileName}
                                  className="w-full h-full object-cover"
                                  fallback={
                                    <div className="w-full h-full flex items-center justify-center">
                                      <FileText className="w-6 h-6 text-slate-400" />
                                    </div>
                                  }
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <FileText className="w-6 h-6 text-slate-400" />
                                </div>
                              )}
                            </div>
                            
                            {/* Info and actions */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{fileName}</p>
                              <div className="flex gap-2 mt-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    if (!hasError && apiPath) {
                                      if (isImage) {
                                        // Use clean API path - AuthenticatedLightbox handles auth
                                        setViewingImage({ url: apiPath, name: fileName });
                                      } else {
                                        window.open(downloadUrl, '_blank');
                                      }
                                    }
                                  }}
                                  disabled={hasError}
                                >
                                  View Full
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    if (!hasError && downloadUrl) {
                                      const link = document.createElement('a');
                                      link.href = downloadUrl;
                                      link.download = fileName;
                                      link.click();
                                    }
                                  }}
                                  disabled={hasError}
                                >
                                  Download
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {/* Notes */}
                {selectedSubmission?.notes && (
                  <div>
                    <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-slate-600" />
                      Notes
                    </h3>
                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedSubmission.notes}</p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Footer - Hidden on mobile */}
              <div className="hidden sm:flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-slate-50/50 flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => setDeleteConfirm(selectedSubmission)}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedSubmission(null)}>
                    Close
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Export functionality placeholder
                      toast.info("Export feature coming soon");
                    }}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Export
                  </Button>
                </div>
              </div>
            </>
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
        <LightboxPortal viewingImage={viewingImage} onClose={() => setViewingImage(null)} />,
        document.body
      )}
    </div>
  );
}

// Inline lightbox rendered inside a portal. Uses authenticated blob URL so that
// images served from /api/storage/... (which require Bearer auth) load correctly.
const LightboxPortal = ({ viewingImage, onClose }) => {
  const isDataOrBlob = typeof viewingImage.url === "string" &&
    (viewingImage.url.startsWith("data:") || viewingImage.url.startsWith("blob:") || viewingImage.url.startsWith("http"));

  const { blobUrl, isLoading, error } = useAuthenticatedMedia(isDataOrBlob ? null : viewingImage.url);
  const displayUrl = isDataOrBlob ? viewingImage.url : blobUrl;
  const loading = !isDataOrBlob && isLoading;
  const failed = !isDataOrBlob && error;

  const handleDownload = (e) => {
    e.stopPropagation();
    if (!displayUrl) return;
    const link = document.createElement('a');
    link.href = displayUrl;
    link.download = viewingImage.name || 'image';
    link.click();
  };

  return (
    <div
      data-testid="image-lightbox"
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
    >
      {/* Close button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 sm:top-4 sm:right-4 text-white hover:bg-white/20 active:bg-white/30 z-10 w-12 h-12 sm:w-10 sm:h-10 rounded-full bg-black/40"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        <X className="w-7 h-7 sm:w-6 sm:h-6" />
      </Button>

      {/* Download button */}
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 left-2 sm:top-4 sm:left-4 text-white hover:bg-white/20 active:bg-white/30 z-10 h-12 sm:h-auto px-3 sm:px-4 rounded-full sm:rounded-md bg-black/40"
        onClick={handleDownload}
        disabled={!displayUrl}
      >
        <Download className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
        <span className="hidden sm:inline">Download</span>
      </Button>

      <div className="relative max-w-full max-h-full flex items-center justify-center">
        {loading && (
          <div className="flex items-center justify-center">
            <div className="animate-spin h-10 w-10 border-3 border-amber-500 border-t-transparent rounded-full" />
          </div>
        )}
        {failed && (
          <div className="text-white/70 text-center">
            <p className="text-lg mb-2">Failed to load image</p>
            <p className="text-sm">Click anywhere to close</p>
          </div>
        )}
        {displayUrl && !loading && !failed && (
          <img
            src={displayUrl}
            alt={viewingImage.name}
            className="max-w-full max-h-[80vh] sm:max-h-[85vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        )}

        {viewingImage.name && (
          <div className="absolute -bottom-8 sm:-bottom-10 left-0 right-0 text-center px-4">
            <p className="text-white/80 text-xs sm:text-sm truncate">{viewingImage.name}</p>
          </div>
        )}
      </div>

      <p className="absolute bottom-4 left-0 right-0 text-center text-white/50 text-xs sm:hidden">
        Tap outside image to close
      </p>
    </div>
  );
};
