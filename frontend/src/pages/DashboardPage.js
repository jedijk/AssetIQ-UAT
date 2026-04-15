import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { statsAPI, actionsAPI, investigationAPI, equipmentHierarchyAPI, threatsAPI, usersAPI } from "../lib/api";
import { formAPI } from "../components/forms";
import { useLanguage } from "../contexts/LanguageContext";
import { getBackendUrl, getAuthHeaders } from "../lib/apiConfig";
import { formatDate, formatDateTime } from "../lib/dateUtils";
import { AuthenticatedImage, useAuthenticatedMedia } from "../components/AuthenticatedMedia";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  GitBranch,
  Wrench,
  FileText,
  PieChart,
  Layers,
  AlertOctagon,
  Zap,
  Shield,
  Calendar,
  Users,
  Gauge,
  ExternalLink,
  User,
  Briefcase,
  Filter,
  X,
  Building2,
  ChevronDown,
  ClipboardList,
  Paperclip,
  Download,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckSquare,
  Lightbulb,
  Settings,
  Sparkles,
} from "lucide-react";
import { Progress } from "../components/ui/progress";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../components/ui/hover-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import InsightsPage from "./InsightsPage";
import { DISCIPLINES } from "../constants/disciplines";
import ProductionDashboardPage from "./ProductionDashboardPage";

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
          fullUrl = `${getBackendUrl()}${url}`;
        }

        const response = await fetch(fullUrl, {
          headers: {
            "Authorization": token ? `Bearer ${token}` : "",
          },
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

// Image component with fallback for failed loads
const ImageWithFallback = ({ src, alt, fallback, className = "" }) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  if (hasError) {
    return fallback;
  }

  return (
    <>
      {isLoading && (
        <div className={`flex items-center justify-center bg-slate-50 ${className}`}>
          <div className="animate-spin h-5 w-5 border-2 border-amber-500 border-t-transparent rounded-full" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`${className} ${isLoading ? 'hidden' : ''}`}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
      />
    </>
  );
};

// User avatar component with optional hover card
const UserAvatar = ({ name, photo, initials, size = "sm", position = null, showPopover = false }) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const sizeClasses = {
    xs: "w-5 h-5 text-[8px]",
    sm: "w-6 h-6 text-[9px]",
    md: "w-8 h-8 text-xs",
    lg: "w-10 h-10 text-sm"
  };
  
  // Generate a consistent color based on name
  const getAvatarColor = (name) => {
    const colors = [
      "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
      "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-rose-500"
    ];
    if (!name) return colors[0];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  // Build photo URL with auth token if needed
  const getPhotoUrl = () => {
    if (!photo || imageError) return null;
    
    // If it's an API path, add auth token and backend URL
    if (photo.startsWith("/api/")) {
      const token = localStorage.getItem("token");
      const backendUrl = getBackendUrl();
      
      // Only build URL if we have all required parts
      if (token && backendUrl && backendUrl.startsWith('http')) {
        return `${backendUrl}${photo}?token=${token}`;
      }
      // If backend URL is not configured, skip the image
      return null;
    }
    
    // If it's already a full URL (https://...), use as-is
    if (photo.startsWith("http")) {
      return photo;
    }
    
    // For any other path format, skip (prevents 404s from relative paths)
    return null;
  };

  const photoUrl = getPhotoUrl();

  // Initials fallback element
  const initialsElement = (
    <div 
      className={`${sizeClasses[size]} ${getAvatarColor(name)} rounded-full flex items-center justify-center text-white font-medium ring-2 ring-white flex-shrink-0 cursor-pointer`}
      title={!showPopover ? (name || "Unknown user") : undefined}
    >
      {initials || (name ? name.charAt(0).toUpperCase() : "?")}
    </div>
  );

  const avatarElement = photoUrl ? (
    <div className="relative">
      {/* Show initials as fallback while image loads or on error */}
      {(!imageLoaded || imageError) && (
        <div 
          className={`${sizeClasses[size]} ${getAvatarColor(name)} rounded-full flex items-center justify-center text-white font-medium ring-2 ring-white flex-shrink-0 cursor-pointer absolute inset-0`}
          title={!showPopover ? (name || "Unknown user") : undefined}
        >
          {initials || (name ? name.charAt(0).toUpperCase() : "?")}
        </div>
      )}
      <img
        src={photoUrl}
        alt={name || "User"}
        className={`${sizeClasses[size]} rounded-full object-cover ring-2 ring-white flex-shrink-0 cursor-pointer ${imageLoaded && !imageError ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setImageLoaded(true)}
        onError={(e) => {
          setImageError(true);
          setImageLoaded(false);
        }}
      />
    </div>
  ) : initialsElement;

  if (showPopover && name) {
    return (
      <HoverCard openDelay={200} closeDelay={100}>
        <HoverCardTrigger asChild>
          <span className="inline-block" onClick={(e) => e.stopPropagation()}>
            {avatarElement}
          </span>
        </HoverCardTrigger>
        <HoverCardContent className="w-48 p-3" side="top" align="center">
          <div className="flex items-center gap-3">
            {photoUrl && !imageError ? (
              <div className="relative w-10 h-10">
                {/* Initials fallback */}
                <div className={`w-10 h-10 rounded-full ${getAvatarColor(name)} flex items-center justify-center text-sm font-semibold text-white absolute inset-0`}>
                  {initials || name.charAt(0).toUpperCase()}
                </div>
                {/* Photo overlay */}
                <img 
                  src={photoUrl} 
                  alt={name} 
                  className="w-10 h-10 rounded-full object-cover border border-slate-200 absolute inset-0"
                  onError={() => setImageError(true)}
                />
              </div>
            ) : (
              <div className={`w-10 h-10 rounded-full ${getAvatarColor(name)} flex items-center justify-center text-sm font-semibold text-white`}>
                {initials || name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{name}</p>
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Briefcase className="w-3 h-3" />
                {position || "Team Member"}
              </p>
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  }

  return avatarElement;
};

// Mini chart component for trends
const MiniBarChart = ({ data, maxValue }) => {
  return (
    <div className="flex items-end gap-1 h-12">
      {data.map((value, idx) => (
        <div
          key={idx}
          className="flex-1 bg-indigo-400 rounded-t transition-all hover:bg-indigo-500"
          style={{ height: `${(value / maxValue) * 100}%`, minHeight: value > 0 ? '4px' : '0' }}
        />
      ))}
    </div>
  );
};

// Stat card component - clickable with deep linking
const StatCard = ({ label, value, icon: Icon, color, bg, subtitle, trend, trendUp, onClick, clickable = false }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className={`themed-card rounded-xl border p-4 transition-all ${
      clickable ? 'hover:shadow-md cursor-pointer active:scale-[0.98]' : 'hover:shadow-md'
    }`}
    onClick={clickable ? onClick : undefined}
    role={clickable ? "button" : undefined}
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-muted mb-1 flex items-center gap-1">
          {label}
          {clickable && <ExternalLink className="w-3 h-3 opacity-50" />}
        </p>
        <p className="text-2xl font-bold text-primary">{value}</p>
        {subtitle && <p className="text-xs text-muted mt-1">{subtitle}</p>}
      </div>
      <div className={`p-2.5 rounded-xl ${bg}`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
    </div>
    {trend !== undefined && (
      <div className={`flex items-center gap-1 mt-2 text-xs ${trendUp ? 'text-red-500' : 'text-green-500'}`}>
        {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        <span>{trend}% vs last week</span>
      </div>
    )}
  </motion.div>
);

// Progress card for completion metrics - clickable
const ProgressCard = ({ title, completed, total, icon: Icon, color, onClick, clickable = false }) => {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div 
      className={`themed-card rounded-xl border p-4 transition-all ${
        clickable ? 'hover:shadow-md cursor-pointer active:scale-[0.98]' : ''
      }`}
      onClick={clickable ? onClick : undefined}
      role={clickable ? "button" : undefined}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-secondary flex items-center gap-1">
            {title}
            {clickable && <ExternalLink className="w-3 h-3 opacity-50" />}
          </p>
          <p className="text-xs text-muted">{completed} of {total} completed</p>
        </div>
      </div>
      <Progress value={percentage} className="h-2" />
      <p className="text-right text-xs text-muted mt-1">{percentage}%</p>
    </div>
  );
};

// Distribution card - clickable
const DistributionCard = ({ title, data, colors, onClick, clickable = false }) => {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  return (
    <div 
      className={`themed-card rounded-xl border p-4 transition-all ${
        clickable ? 'hover:shadow-md cursor-pointer active:scale-[0.98]' : ''
      }`}
      onClick={clickable ? onClick : undefined}
      role={clickable ? "button" : undefined}
    >
      <h3 className="text-sm font-medium text-secondary mb-3 flex items-center gap-1">
        {title}
        {clickable && <ExternalLink className="w-3 h-3 opacity-50" />}
      </h3>
      <div className="space-y-2">
        {Object.entries(data).map(([key, value], idx) => {
          const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
          return (
            <div key={key} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${colors[idx % colors.length]}`} />
              <span className="text-xs text-muted flex-1 capitalize">{key.replace(/_/g, ' ')}</span>
              <span className="text-xs font-medium text-secondary">{value}</span>
              <span className="text-xs text-muted">({percentage}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Recent item card - clickable
const RecentItemCard = ({ items, title, icon: Icon, emptyMessage, renderItem, onClick, clickable = false }) => (
  <div 
    className={`themed-card rounded-xl border p-4 transition-all ${
      clickable ? 'hover:shadow-md cursor-pointer' : ''
    }`}
    onClick={clickable ? onClick : undefined}
    role={clickable ? "button" : undefined}
  >
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-muted" />
      <h3 className="text-sm font-medium text-secondary flex items-center gap-1">
        {title}
        {clickable && <ExternalLink className="w-3 h-3 opacity-50" />}
      </h3>
    </div>
    {items.length > 0 ? (
      <div className="space-y-2">
        {items.slice(0, 5).map((item, idx) => renderItem(item, idx))}
      </div>
    ) : (
      <p className="text-xs text-muted text-center py-4">{emptyMessage}</p>
    )}
  </div>
);

export default function DashboardPage({ initialTab }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(initialTab || "operational");
  
  // Redirect to operational tab on mobile if viewing hidden tabs
  useEffect(() => {
    const handleResize = () => {
      // sm breakpoint is 640px
      if (window.innerWidth < 640 && (activeTab === "reliability" || activeTab === "production")) {
        setActiveTab("operational");
      }
    };
    
    // Check on mount
    handleResize();
    
    // Listen for resize
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [activeTab]);
  
  // Filter states
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [plantUnitFilter, setPlantUnitFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  
  // Quick View states
  const [quickViewSubmission, setQuickViewSubmission] = useState(null);
  const [loadingQuickView, setLoadingQuickView] = useState(false);
  const [viewingImage, setViewingImage] = useState(null);

  // Function to handle clicking on a submission - fetches full details
  const handleQuickViewClick = async (submission) => {
    setLoadingQuickView(true);
    try {
      const apiUrl = getBackendUrl();
      const response = await fetch(`${apiUrl}/api/form-submissions/${submission.id}`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const fullSubmission = await response.json();
        setQuickViewSubmission(fullSubmission);
      } else {
        // Fallback to lightweight version
        setQuickViewSubmission(submission);
      }
    } catch (error) {
      console.error("Failed to fetch submission details:", error);
      setQuickViewSubmission(submission);
    } finally {
      setLoadingQuickView(false);
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

  // Navigation state for back button support
  const navState = { from: "dashboard", fromPage: "Dashboard" };
  
  // Fetch users for owner filter
  const { data: usersData } = useQuery({
    queryKey: ["rbac-users"],
    queryFn: usersAPI.getAll,
    staleTime: 5 * 60 * 1000,
  });
  const usersList = usersData?.users || [];

  // Fetch equipment hierarchy for plant unit filter
  const { data: equipmentData } = useQuery({
    queryKey: ["equipment-nodes"],
    queryFn: equipmentHierarchyAPI.getNodes,
    staleTime: 5 * 60 * 1000,
  });
  const equipmentNodes = equipmentData?.nodes || [];
  
  // Get plant units from equipment hierarchy
  const plantUnits = equipmentNodes
    .filter(node => node.level === "plant_unit")
    .map(node => ({ id: node.id, name: node.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Get all descendant equipment IDs for a given plant unit
  const getDescendantIds = (parentId) => {
    const descendants = new Set();
    const findChildren = (pid) => {
      equipmentNodes.forEach(node => {
        if (node.parent_id === pid) {
          descendants.add(node.id);
          descendants.add(node.name);
          findChildren(node.id);
        }
      });
    };
    findChildren(parentId);
    return descendants;
  };

  // Fetch all data
  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: statsAPI.get,
  });

  const { data: observationsData = [] } = useQuery({
    queryKey: ["threats"],
    queryFn: () => threatsAPI.getAll(),
  });
  const allObservations = Array.isArray(observationsData) ? observationsData : [];

  // Apply filters to observations
  const observations = allObservations.filter(o => {
    if (disciplineFilter !== "all" && o.discipline !== disciplineFilter) return false;
    if (ownerFilter !== "all" && o.owner_id !== ownerFilter) return false;
    if (plantUnitFilter !== "all") {
      // Get all equipment IDs/names under this plant unit
      const descendantIds = getDescendantIds(plantUnitFilter);
      const equipmentMatch = 
        descendantIds.has(o.equipment_id) || 
        descendantIds.has(o.linked_equipment_id) ||
        descendantIds.has(o.equipment_name) ||
        descendantIds.has(o.linked_equipment_name) ||
        o.plant_unit === plantUnitFilter ||
        o.location === plantUnitFilter;
      if (!equipmentMatch) return false;
    }
    return true;
  });

  const { data: actionsData = { actions: [], stats: {} } } = useQuery({
    queryKey: ["actions"],
    queryFn: () => actionsAPI.getAll(),
  });
  const allActions = Array.isArray(actionsData?.actions) ? actionsData.actions : (Array.isArray(actionsData) ? actionsData : []);
  const actionsStats = actionsData?.stats || {};
  
  // Apply filters to actions
  const actions = allActions.filter(a => {
    if (disciplineFilter !== "all" && a.discipline !== disciplineFilter) return false;
    if (ownerFilter !== "all" && a.assignee !== ownerFilter) return false;
    if (plantUnitFilter !== "all") {
      const descendantIds = getDescendantIds(plantUnitFilter);
      const equipmentMatch = 
        descendantIds.has(a.linked_equipment_id) ||
        descendantIds.has(a.equipment_name);
      if (!equipmentMatch) return false;
    }
    return true;
  });

  const { data: investigationsData = { investigations: [] }, isLoading: isLoadingInvestigations, error: investigationsError } = useQuery({
    queryKey: ["investigations"],
    queryFn: () => investigationAPI.getAll(),
    staleTime: 0,
    refetchOnMount: 'always',
    retry: 2,
  });
  const allInvestigations = Array.isArray(investigationsData?.investigations) ? investigationsData.investigations : (Array.isArray(investigationsData) ? investigationsData : []);
  
  // Apply filters to investigations  
  const investigations = allInvestigations.filter(i => {
    if (ownerFilter !== "all" && i.investigation_leader !== ownerFilter && i.created_by !== ownerFilter) return false;
    if (plantUnitFilter !== "all") {
      const descendantIds = getDescendantIds(plantUnitFilter);
      const equipmentMatch = 
        descendantIds.has(i.equipment_id) ||
        descendantIds.has(i.asset_name) ||
        i.location === plantUnitFilter;
      if (!equipmentMatch) return false;
    }
    return true;
  });

  // Fetch recent form submissions for dashboard widget
  const { data: formSubmissionsData = [] } = useQuery({
    queryKey: ["form-submissions-dashboard"],
    queryFn: () => formAPI.getSubmissions({ limit: 10 }),
    staleTime: 60 * 1000, // 1 minute
  });
  const recentSubmissions = Array.isArray(formSubmissionsData) ? formSubmissionsData : (formSubmissionsData?.submissions || []);

  // Equipment data already fetched above as equipmentNodes
  const equipment = equipmentNodes;

  // Top 10 highest scoring observations
  const { data: topObservationsData = [] } = useQuery({
    queryKey: ["top-observations"],
    queryFn: () => threatsAPI.getTop(10),
  });
  const topObservations = Array.isArray(topObservationsData) ? topObservationsData : [];
  
  // Check if any filter is active
  const hasActiveFilters = disciplineFilter !== "all" || ownerFilter !== "all" || plantUnitFilter !== "all";
  
  // Clear all filters
  const clearFilters = () => {
    setDisciplineFilter("all");
    setOwnerFilter("all");
    setPlantUnitFilter("all");
  };

  // Calculate metrics
  const observationsByStatus = observations.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  // Order risk levels correctly: Critical > High > Medium > Low
  const riskOrder = ["Critical", "High", "Medium", "Low"];
  const observationsByRisk = riskOrder.reduce((acc, level) => {
    const count = observations.filter(t => t.risk_level === level).length;
    if (count > 0) acc[level] = count;
    return acc;
  }, {});

  const observationsByType = observations.reduce((acc, t) => {
    const type = t.equipment_type || "Unknown";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const actionsByStatus = actions.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});

  // Order action priorities correctly: critical > high > medium > low
  const priorityOrder = ["critical", "high", "medium", "low"];
  const actionsByPriority = priorityOrder.reduce((acc, level) => {
    const count = actions.filter(a => a.priority === level).length;
    if (count > 0) acc[level] = count;
    return acc;
  }, {});

  const investigationsByStatus = investigations.reduce((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1;
    return acc;
  }, {});

  // Calculate completion rates
  const closedObservations = (observationsByStatus["Closed"] || 0) + (observationsByStatus["Mitigated"] || 0);
  const completedActions = actionsByStatus["completed"] || 0;
  const completedInvestigations = investigationsByStatus["completed"] || 0;
  
  // Used for stat card subtitle
  const openObservations = observationsByStatus["Open"] || 0;

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col" data-testid="dashboard-page">
      {/* Fixed Header with Tabs - Condensed */}
      <div className="flex-shrink-0 px-6 pt-4 pb-2 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{t("dashboard.title") || "Dashboard"}</h1>
            <p className="text-sm text-slate-500">{t("dashboard.subtitle") || "Overview of your risk management status"}</p>
          </div>
        </div>
        
        {/* Dashboard Tab Buttons - Mobile Optimized */}
        <div className="flex items-center justify-between gap-4">
          <div className="inline-flex h-10 items-center rounded-lg bg-slate-100 p-1 gap-1">
            <button 
              onClick={() => setActiveTab("operational")}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md transition-colors text-sm font-medium ${activeTab === "operational" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/50"}`}
              data-testid="operational-tab"
            >
              <Activity className="w-4 h-4 flex-shrink-0" />
              <span>{t("dashboard.operational") || "Operational"}</span>
            </button>
            <button 
              onClick={() => setActiveTab("reliability")}
              className={`hidden sm:flex items-center justify-center gap-1.5 px-3 py-2 rounded-md transition-colors text-sm font-medium ${activeTab === "reliability" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/50"}`}
              data-testid="reliability-tab"
            >
              <Activity className="w-4 h-4 flex-shrink-0" />
              <span className="hidden sm:inline">Reliability Insights</span>
              <span className="sm:hidden">Insights</span>
            </button>
            <button 
              onClick={() => setActiveTab("production")}
              className={`hidden sm:flex items-center justify-center gap-1.5 px-3 py-2 rounded-md transition-colors text-sm font-medium ${activeTab === "production" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/50"}`}
              data-testid="production-tab"
            >
              <Gauge className="w-4 h-4 flex-shrink-0" />
              <span>Production</span>
            </button>
          </div>
          
          {/* Filter Button - Next to tabs, only on operational */}
          {activeTab === "operational" && (
            <div className="flex items-center gap-2">
              {/* Active Filter Badges */}
              {hasActiveFilters && (
                <div className="hidden sm:flex items-center gap-2">
                  {disciplineFilter !== "all" && (
                    <Badge variant="secondary" className="gap-1 bg-slate-100">
                      <Wrench className="w-3 h-3" />
                      {DISCIPLINES.find(d => d.value === disciplineFilter)?.label || disciplineFilter}
                      <X className="w-3 h-3 cursor-pointer hover:text-red-500" onClick={() => setDisciplineFilter("all")} />
                    </Badge>
                  )}
                  {ownerFilter !== "all" && (
                    <Badge variant="secondary" className="gap-1 bg-slate-100">
                      <User className="w-3 h-3" />
                      {usersList.find(u => u.id === ownerFilter)?.name || "Unknown"}
                      <X className="w-3 h-3 cursor-pointer hover:text-red-500" onClick={() => setOwnerFilter("all")} />
                    </Badge>
                  )}
                  {plantUnitFilter !== "all" && (
                    <Badge variant="secondary" className="gap-1 bg-slate-100">
                      <Building2 className="w-3 h-3" />
                      {plantUnits.find(pu => pu.id === plantUnitFilter)?.name || plantUnitFilter}
                      <X className="w-3 h-3 cursor-pointer hover:text-red-500" onClick={() => setPlantUnitFilter("all")} />
                    </Badge>
                  )}
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-slate-500 hover:text-red-500 h-7 px-2">
                    Clear
                  </Button>
                </div>
              )}
              <Button
                variant={showFilters ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="gap-1.5 h-9"
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">Filters</span>
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-1 bg-blue-100 text-blue-700 px-1.5 py-0 text-xs">
                    {[disciplineFilter !== "all", ownerFilter !== "all", plantUnitFilter !== "all"].filter(Boolean).length}
                  </Badge>
                )}
              </Button>
            </div>
          )}
        </div>
        
        {/* Expanded Filter Panel - Below tabs when open */}
        {activeTab === "operational" && showFilters && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 p-4 bg-slate-50 rounded-lg border border-slate-200"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Discipline Filter */}
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
                  <Wrench className="w-3 h-3" /> Discipline
                </label>
                <Select value={disciplineFilter} onValueChange={setDisciplineFilter}>
                  <SelectTrigger className="h-9 bg-white">
                    <SelectValue placeholder="All Disciplines" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Disciplines</SelectItem>
                    {DISCIPLINES.map(d => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Owner Filter */}
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
                  <User className="w-3 h-3" /> Owner / Assignee
                </label>
                <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                  <SelectTrigger className="h-9 bg-white">
                    <SelectValue placeholder="All Users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    {usersList.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Plant/Unit Filter */}
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> Plant / Unit
                </label>
                <Select value={plantUnitFilter} onValueChange={setPlantUnitFilter}>
                  <SelectTrigger className="h-9 bg-white">
                    <SelectValue placeholder="All Plants/Units" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Plants/Units</SelectItem>
                    {plantUnits.map(pu => (
                      <SelectItem key={pu.id} value={pu.id}>{pu.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </motion.div>
        )}
      </div>
      
      {/* Scrollable Tab Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="max-w-7xl mx-auto">
          {/* Operational Dashboard Tab */}
          {activeTab === "operational" && (
            <div className="animate-fade-in">
      {/* Key Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label={t("dashboard.totalObservations") || "Total Observations"}
          value={observations.length}
          icon={AlertTriangle}
          color="text-amber-600"
          bg="bg-amber-50"
          subtitle={`${openObservations} ${t("common.open") || "open"}`}
          clickable={true}
          onClick={() => navigate("/threats", { state: navState })}
        />
        <StatCard
          label={t("dashboard.totalActions") || "Total Actions"}
          value={actions.length}
          icon={CheckCircle2}
          color="text-blue-600"
          bg="bg-blue-50"
          subtitle={`${completedActions} ${t("actionsPage.completed") || "completed"}`}
          clickable={true}
          onClick={() => navigate("/actions", { state: navState })}
        />
        <StatCard
          label={t("dashboard.investigations") || "Investigations"}
          value={investigations.length}
          icon={GitBranch}
          color="text-purple-600"
          bg="bg-purple-50"
          subtitle={`${completedInvestigations} ${t("actionsPage.completed") || "completed"}`}
          clickable={true}
          onClick={() => navigate("/causal-engine", { state: navState })}
        />
        <StatCard
          label={t("dashboard.equipment") || "Equipment"}
          value={equipment.length}
          icon={Layers}
          color="text-green-600"
          bg="bg-green-50"
          subtitle={t("dashboard.totalAssets") || "total assets"}
          clickable={true}
          onClick={() => navigate("/equipment-manager", { state: navState })}
        />
      </div>

      {/* Progress Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <ProgressCard
          title={t("dashboard.observationResolution") || "Observation Resolution"}
          completed={closedObservations}
          total={observations.length}
          icon={Shield}
          color="bg-amber-500"
          clickable={true}
          onClick={() => navigate("/threats", { state: navState })}
        />
        <ProgressCard
          title={t("dashboard.actionCompletion") || "Action Completion"}
          completed={completedActions}
          total={actions.length}
          icon={Target}
          color="bg-blue-500"
          clickable={true}
          onClick={() => navigate("/actions", { state: navState })}
        />
        <ProgressCard
          title={t("dashboard.investigationProgress") || "Investigation Progress"}
          completed={completedInvestigations}
          total={investigations.length}
          icon={GitBranch}
          color="bg-purple-500"
          clickable={true}
          onClick={() => navigate("/causal-engine", { state: navState })}
        />
      </div>

      {/* Top 10 Highest Scoring Observations */}
      {topObservations.length > 0 && (
        <div className="mb-6">
          <div className="themed-card rounded-xl border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-red-500" />
                <h3 className="text-sm font-medium text-secondary">
                  {t("dashboard.topRiskObservations") || "Top 10 Highest Risk Observations"}
                </h3>
              </div>
              <button 
                onClick={() => navigate("/threats", { state: navState })}
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                View All <ExternalLink className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2">
              {topObservations.map((obs, index) => (
                <div 
                  key={obs.id} 
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/threats/${obs.id}`, { state: navState })}
                  data-testid={`top-obs-${obs.id}`}
                >
                  {/* Rank Badge */}
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold flex-shrink-0 bg-slate-200 text-slate-600">
                    {index + 1}
                  </span>
                  
                  {/* User Avatar - Show owner if assigned, else creator */}
                  <UserAvatar 
                    name={obs.owner_name || obs.creator_name}
                    photo={obs.creator_photo}
                    initials={(obs.owner_name || obs.creator_name || "U").charAt(0)}
                    size="sm"
                    position={obs.creator_position}
                    showPopover={true}
                  />
                  
                  {/* Risk Level Dot */}
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    obs.risk_level === "Critical" ? "bg-red-500" :
                    obs.risk_level === "High" ? "bg-orange-500" :
                    obs.risk_level === "Medium" ? "bg-yellow-500" : "bg-green-500"
                  }`} />
                  
                  {/* Title and Asset */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-slate-700 truncate">
                        {obs.title?.includes(" - ") ? obs.title.split(" - ")[0] : obs.title}
                      </p>
                      <span className="sm:hidden text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold tabular-nums flex-shrink-0" title="Risk Score">
                        {typeof obs.risk_score === 'number' ? Math.round(obs.risk_score) : obs.risk_score || 0}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {obs.title?.includes(" - ") && (
                        <span className="text-[10px] text-slate-500 truncate">{obs.title.split(" - ").slice(1).join(" - ")}</span>
                      )}
                      {obs.equipment_tag && (
                        <span className="text-[9px] font-mono text-slate-400">{obs.equipment_tag}</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Risk Score - desktop only */}
                  <div className="w-8 flex-shrink-0 text-right hidden sm:block">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold tabular-nums inline-block" title="Risk Score">
                      {typeof obs.risk_score === 'number' ? Math.round(obs.risk_score) : obs.risk_score || 0}
                    </span>
                  </div>

                  {/* RPN Badge */}
                  <div className="w-16 flex-shrink-0 text-right hidden sm:block">
                    {obs.fmea_rpn ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium inline-block" title="Risk Priority Number">
                        RPN: {obs.fmea_rpn}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-300">—</span>
                    )}
                  </div>
                  
                  {/* Status Badge - Fixed width for alignment */}
                  <div className="w-16 flex-shrink-0 text-right">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded inline-block ${
                      obs.status === "Open" ? "bg-blue-100 text-blue-700" :
                      obs.status === "Mitigated" ? "bg-green-100 text-green-700" :
                      obs.status === "In Progress" ? "bg-amber-100 text-amber-700" :
                      "bg-slate-100 text-slate-700"
                    }`}>{obs.status || "Open"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Distribution Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <DistributionCard
          title={t("dashboard.observationsByStatus") || "Threats by Status"}
          data={observationsByStatus}
          colors={["bg-blue-400", "bg-amber-400", "bg-green-400", "bg-slate-400"]}
          clickable={true}
          onClick={() => navigate("/threats", { state: navState })}
        />
        <DistributionCard
          title={t("dashboard.observationsByRisk") || "Threats by Risk Level"}
          data={observationsByRisk}
          colors={["bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-green-400"]}
          clickable={true}
          onClick={() => navigate("/threats", { state: navState })}
        />
        <DistributionCard
          title={t("dashboard.actionsByStatus") || "Actions by Status"}
          data={actionsByStatus}
          colors={["bg-blue-400", "bg-amber-400", "bg-green-400"]}
          clickable={true}
          onClick={() => navigate("/actions", { state: navState })}
        />
        <DistributionCard
          title={t("dashboard.actionsByPriority") || "Actions by Priority"}
          data={actionsByPriority}
          colors={["bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-green-400"]}
          clickable={true}
          onClick={() => navigate("/actions", { state: navState })}
        />
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <RecentItemCard
          title={t("dashboard.recentObservations") || "Recent Observations"}
          icon={AlertTriangle}
          items={observations.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))}
          emptyMessage={t("dashboard.noObservations") || "No observations recorded"}
          clickable={true}
          onClick={() => navigate("/threats", { state: navState })}
          renderItem={(item, idx) => (
            <div 
              key={item.id || `observation-${idx}`} 
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
              onClick={(e) => { e.stopPropagation(); navigate(`/threats/${item.id}`, { state: navState }); }}
              data-testid={`observation-item-${item.id}`}
            >
              <UserAvatar 
                name={item.creator_name}
                photo={item.creator_photo}
                initials={item.creator_initials}
                position={item.creator_position}
                size="sm"
                showPopover={true}
              />
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                item.risk_level === "Critical" ? "bg-red-500" :
                item.risk_level === "High" ? "bg-orange-500" :
                item.risk_level === "Medium" ? "bg-yellow-500" : "bg-green-500"
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{item.title}</p>
                <p className="text-[10px] text-slate-400">{item.asset}</p>
              </div>
              {/* Compact Risk Score & RPN */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-[9px] px-1 py-0.5 rounded bg-slate-100 text-slate-600 font-medium tabular-nums" title="Risk Score">
                  {typeof item.risk_score === 'number' ? Math.round(item.risk_score) : item.risk_score || 0}
                </span>
                {item.fmea_rpn && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-purple-100 text-purple-600 font-medium tabular-nums" title="RPN">
                    {item.fmea_rpn}
                  </span>
                )}
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                item.status === "Open" ? "bg-blue-100 text-blue-700" :
                item.status === "Mitigated" ? "bg-green-100 text-green-700" :
                "bg-slate-100 text-slate-700"
              }`}>{item.status}</span>
            </div>
          )}
        />

        <RecentItemCard
          title={t("dashboard.recentFormSubmissions") || "Recent Form Submissions"}
          icon={FileText}
          items={recentSubmissions.sort((a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at))}
          emptyMessage={t("dashboard.noFormSubmissions") || "No form submissions yet"}
          clickable={true}
          onClick={() => navigate("/forms", { state: { ...navState, tab: "submissions" } })}
          renderItem={(item, idx) => (
            <div 
              key={item.id || `submission-${idx}`} 
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
              onClick={(e) => { e.stopPropagation(); handleQuickViewClick(item); }}
              data-testid={`form-submission-item-${item.id}`}
            >
              <UserAvatar 
                name={item.submitted_by_name || item.submitter_name || "User"}
                photo={item.submitted_by_photo}
                initials={(item.submitted_by_name || item.submitter_name || "U").charAt(0)}
                size="sm"
                showPopover={true}
              />
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                item.status === "completed" || item.status === "approved" ? "bg-green-500" :
                item.status === "pending" ? "bg-amber-500" :
                item.status === "rejected" ? "bg-red-500" : "bg-blue-500"
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{item.form_template_name || item.template_name || item.form_name || "Form"}</p>
                <p className="text-[10px] text-slate-400">
                  {item.submitted_by_name && <span>{item.submitted_by_name} • </span>}
                  {formatDate(item.submitted_at || item.created_at)}
                </p>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${
                item.status === "completed" || item.status === "approved" ? "bg-green-100 text-green-700" :
                item.status === "pending" ? "bg-amber-100 text-amber-700" :
                item.status === "rejected" ? "bg-red-100 text-red-700" :
                "bg-blue-100 text-blue-700"
              }`}>{item.status || "submitted"}</span>
            </div>
          )}
        />

        <RecentItemCard
          title={t("dashboard.recentActions") || "Recent Actions"}
          icon={CheckCircle2}
          items={actions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))}
          emptyMessage={t("dashboard.noActions") || "No actions recorded"}
          clickable={true}
          onClick={() => navigate("/actions", { state: navState })}
          renderItem={(item, idx) => (
            <div 
              key={item.id || `action-${idx}`} 
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
              onClick={(e) => { e.stopPropagation(); navigate(`/actions/${item.id}`, { state: navState }); }}
              data-testid={`action-item-${item.id}`}
            >
              <UserAvatar 
                name={item.creator_name}
                photo={item.creator_photo}
                initials={item.creator_initials}
                position={item.creator_position}
                size="sm"
                showPopover={true}
              />
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                item.priority === "critical" ? "bg-red-500" :
                item.priority === "high" ? "bg-orange-500" :
                item.priority === "medium" ? "bg-yellow-500" : "bg-green-500"
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{item.title}</p>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-slate-400">{item.source_name || "Manual"}</p>
                  {item.attachments?.length > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                      <Paperclip className="w-2.5 h-2.5" />
                      {item.attachments.length}
                    </span>
                  )}
                </div>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${
                item.status === "completed" ? "bg-green-100 text-green-700" :
                item.status === "in_progress" ? "bg-amber-100 text-amber-700" :
                "bg-blue-100 text-blue-700"
              }`}>{item.status?.replace("_", " ")}</span>
            </div>
          )}
        />

        <RecentItemCard
          title={t("dashboard.recentInvestigations") || "Recent Investigations"}
          icon={GitBranch}
          items={investigations.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))}
          emptyMessage={t("dashboard.noInvestigations") || "No investigations started"}
          clickable={true}
          onClick={() => navigate("/causal-engine", { state: navState })}
          renderItem={(item, idx) => (
            <div 
              key={item.id || `investigation-${idx}`} 
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
              onClick={(e) => { e.stopPropagation(); navigate(`/causal-engine?inv=${item.id}`, { state: navState }); }}
              data-testid={`investigation-item-${item.id}`}
            >
              {/* Lead Picture with Popover - FIRST */}
              <UserAvatar 
                name={item.lead_name || item.investigation_leader}
                photo={item.lead_picture}
                position={item.lead_position || "Investigation Lead"}
                size="sm"
                showPopover={true}
              />
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                item.status === "completed" ? "bg-green-500" :
                item.status === "in_progress" ? "bg-amber-500" : "bg-blue-500"
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{item.title}</p>
                <p className="text-[10px] text-slate-400">{item.asset_name || "No asset"}</p>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize flex-shrink-0 ${
                item.status === "completed" ? "bg-green-100 text-green-700" :
                item.status === "in_progress" ? "bg-amber-100 text-amber-700" :
                "bg-blue-100 text-blue-700"
              }`}>{item.status?.replace("_", " ")}</span>
            </div>
          )}
        />
      </div>

      {/* Equipment by Type */}
      {Object.keys(observationsByType).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 themed-card rounded-xl border p-4 hover:shadow-md cursor-pointer transition-all"
          onClick={() => navigate("/threats", { state: navState })}
        >
          <h3 className="text-sm font-medium text-secondary mb-4 flex items-center gap-1">
            {t("dashboard.observationsByEquipment") || "Observations by Equipment Type"}
            <ExternalLink className="w-3 h-3 opacity-50" />
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {Object.entries(observationsByType).map(([type, count], idx) => (
              <div key={type} className="themed-card rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-secondary">{count}</p>
                <p className="text-xs text-muted truncate" title={type}>{type}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}
            </div>
          )}
          
          {/* Reliability Insights Tab */}
          {activeTab === "reliability" && (
            <div className="animate-fade-in -mx-4 sm:-mx-6">
              <InsightsPage embedded={true} />
            </div>
          )}

          {/* Production Dashboard Tab */}
          {activeTab === "production" && (
            <div className="animate-fade-in -mx-4 sm:-mx-6">
              <ProductionDashboardPage />
            </div>
          )}
        </div>
      </div>
      
      {/* Quick View Modal for Form Submissions */}
      <Dialog open={!!quickViewSubmission || loadingQuickView} onOpenChange={() => { setQuickViewSubmission(null); setLoadingQuickView(false); }}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
          {/* Header */}
          <div className="flex items-center px-4 py-3 border-b border-slate-100 flex-shrink-0">
            <button 
              onClick={() => setQuickViewSubmission(null)}
              className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
          </div>
          
          {/* Loading state */}
          {loadingQuickView && !quickViewSubmission && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          )}
          
          {/* Scrollable content */}
          {quickViewSubmission && (
          <>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <div className="space-y-5">
              {/* Form Title and Status */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 leading-tight">
                      {quickViewSubmission?.form_template_name || quickViewSubmission?.template_name || quickViewSubmission?.form_name || "Form Submission"}
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                      <UserAvatar 
                        name={quickViewSubmission?.submitted_by_name || "User"}
                        photo={quickViewSubmission?.submitted_by_photo}
                        initials={(quickViewSubmission?.submitted_by_name || "U").charAt(0)}
                        size="xs"
                        showPopover={false}
                      />
                      <span className="text-sm text-slate-500">
                        {quickViewSubmission?.submitted_by_name || "Unknown"}
                        <span className="mx-1.5">•</span>
                        {quickViewSubmission?.submitted_at ? formatDateTime(quickViewSubmission.submitted_at) : "Unknown"}
                      </span>
                    </div>
                  </div>
                </div>
                <Badge className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${
                  quickViewSubmission?.status === "completed" || quickViewSubmission?.status === "approved" 
                    ? "bg-green-100 text-green-700 border-green-200" 
                    : quickViewSubmission?.status === "pending" 
                      ? "bg-amber-100 text-amber-700 border-amber-200"
                      : quickViewSubmission?.status === "rejected"
                        ? "bg-red-100 text-red-700 border-red-200"
                        : "bg-blue-100 text-blue-700 border-blue-200"
                }`}>
                  {quickViewSubmission?.status === "completed" ? "Completed" : 
                   quickViewSubmission?.status === "approved" ? "Approved" :
                   quickViewSubmission?.status === "pending" ? "Pending" :
                   quickViewSubmission?.status === "rejected" ? "Rejected" : "Submitted"}
                </Badge>
              </div>
              
              {/* Info Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 border-y border-slate-100">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-400" />
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Submitted by</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <UserAvatar 
                        name={quickViewSubmission?.submitted_by_name || "User"}
                        photo={quickViewSubmission?.submitted_by_photo}
                        initials={(quickViewSubmission?.submitted_by_name || "U").charAt(0)}
                        size="xs"
                        showPopover={false}
                      />
                      <span className="text-sm font-medium text-slate-700">{quickViewSubmission?.submitted_by_name || "Unknown"}</span>
                    </div>
                  </div>
                </div>
                {quickViewSubmission?.equipment_name && (
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Equipment</p>
                      <p className="text-sm font-medium text-slate-700 mt-0.5">
                        {quickViewSubmission.equipment_name}
                      </p>
                    </div>
                  </div>
                )}
                {quickViewSubmission?.task_template_name && (
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Task</p>
                      <p className="text-sm font-medium text-slate-700 mt-0.5">
                        {quickViewSubmission.task_template_name}
                      </p>
                    </div>
                  </div>
                )}
                {quickViewSubmission?.discipline && (
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 flex items-center justify-center">
                      <span className={`w-2.5 h-2.5 rounded-full bg-blue-500`} />
                    </span>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Discipline</p>
                      <p className="text-sm font-medium text-slate-700 mt-0.5">
                        {quickViewSubmission.discipline}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Checklist Section */}
              {(() => {
                const responses = quickViewSubmission?.values || quickViewSubmission?.responses || [];
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
                        // Build clean API path for AuthenticatedLightbox (no token query param)
                        const attachmentApiPath = attachmentRawUrl && !attachmentRawUrl.startsWith('data:') && !attachmentRawUrl.startsWith('http')
                          ? `/api/storage/${attachmentRawUrl}`
                          : attachmentRawUrl;
                        // Build full URL with token for non-image downloads (fallback)
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
              
              {/* Insights Section - Generated summary */}
              {quickViewSubmission?.values?.length > 0 && (
                <div>
                  <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-slate-600" />
                    Insights
                  </h3>
                  <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                    {(() => {
                      const responses = quickViewSubmission?.values || [];
                      const totalItems = responses.length;
                      const passedItems = responses.filter(r => {
                        const isBoolean = typeof r.value === "boolean";
                        return isBoolean ? r.value : r.threshold_status !== "critical" && r.threshold_status !== "warning";
                      }).length;
                      const warningItems = responses.filter(r => r.threshold_status === "warning").length;
                      const criticalItems = responses.filter(r => r.threshold_status === "critical").length;
                      
                      return (
                        <>
                          {criticalItems === 0 && warningItems === 0 && (
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-green-500" />
                              <span className="text-sm text-slate-700">No deviations detected in this round</span>
                            </div>
                          )}
                          {passedItems === totalItems && (
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-green-500" />
                              <span className="text-sm text-slate-700">Equipment performing within expected parameters</span>
                            </div>
                          )}
                          {criticalItems > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-red-500" />
                              <span className="text-sm text-slate-700">{criticalItems} critical issue{criticalItems > 1 ? 's' : ''} requiring immediate attention</span>
                            </div>
                          )}
                          {warningItems > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-amber-500" />
                              <span className="text-sm text-slate-700">{warningItems} warning{warningItems > 1 ? 's' : ''} detected - monitor closely</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500" />
                            <span className="text-sm text-slate-700">{passedItems} of {totalItems} checks passed</span>
                          </div>
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
                        const responses = quickViewSubmission?.values || [];
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
              {quickViewSubmission?.attachments?.length > 0 && (
                <div>
                  <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <Paperclip className="w-5 h-5 text-slate-600" />
                    Attachments ({quickViewSubmission.attachments.length})
                  </h3>
                  <div className="space-y-3">
                    {quickViewSubmission.attachments.map((att, idx) => {
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
                            {att.failure_mode && (
                              <p className="text-xs text-slate-500 mt-0.5">Failure Mode: {att.failure_mode}</p>
                            )}
                            {att.equipment && (
                              <p className="text-xs text-slate-500">Equipment: {att.equipment}</p>
                            )}
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
              {quickViewSubmission?.notes && (
                <div>
                  <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-slate-600" />
                    {t("common.notes")}
                  </h3>
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{quickViewSubmission.notes}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Fixed footer with actions - Hidden on mobile */}
          <div className="hidden sm:flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => setQuickViewSubmission(null)}
                className="px-4"
              >
                Close
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  // Export functionality
                  toast.info("Export feature coming soon");
                }}
                className="px-4"
              >
                Export
              </Button>
            </div>
            <Button 
              onClick={() => {
                setQuickViewSubmission(null);
                navigate("/forms?tab=submissions");
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4"
            >
              View All Submissions
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
          </>
          )}
        </DialogContent>
      </Dialog>

      {/* Image Lightbox - Using Portal to render above all dialogs */}
      {viewingImage && createPortal(
        <AuthenticatedLightbox
          url={viewingImage.url}
          name={viewingImage.name}
          onClose={() => setViewingImage(null)}
        />,
        document.body
      )}
    </div>
  );
}
