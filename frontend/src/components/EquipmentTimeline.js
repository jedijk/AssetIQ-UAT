import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  ClipboardList,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Target,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { equipmentHierarchyAPI, threatsAPI } from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";

// Timeline item colors and icons - lighter colors
const ITEM_CONFIG = {
  observation: {
    icon: AlertTriangle,
    bgColor: "bg-amber-50",
    iconColor: "text-amber-500",
    borderColor: "border-amber-200",
    dotColor: "bg-amber-400",
    label: "Observation",
    route: "/threats",
  },
  action: {
    icon: Target,
    bgColor: "bg-blue-50",
    iconColor: "text-blue-500",
    borderColor: "border-blue-200",
    dotColor: "bg-blue-400",
    label: "Action",
    route: "/actions",
  },
  task: {
    icon: ClipboardList,
    bgColor: "bg-violet-50",
    iconColor: "text-violet-500",
    borderColor: "border-violet-200",
    dotColor: "bg-violet-400",
    label: "Task",
    route: "/my-tasks",
  },
};

// Status badge component
const StatusBadge = ({ status, type }) => {
  const statusConfig = {
    open: { bg: "bg-amber-100", text: "text-amber-700", label: "Open" },
    in_progress: { bg: "bg-blue-100", text: "text-blue-700", label: "In Progress" },
    completed: { bg: "bg-green-100", text: "text-green-700", label: "Completed" },
    closed: { bg: "bg-slate-100", text: "text-slate-700", label: "Closed" },
    pending: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Pending" },
    overdue: { bg: "bg-red-100", text: "text-red-700", label: "Overdue" },
  };
  
  const config = statusConfig[status] || statusConfig.open;
  
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
};

// Timeline Item Detail Popup
const TimelineItemPopup = ({ item, isOpen, onClose, onNavigate }) => {
  if (!item) return null;
  
  const config = ITEM_CONFIG[item.type];
  const Icon = config.icon;
  
  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    try {
      return format(parseISO(dateStr), "MMM d, yyyy 'at' h:mm a");
    } catch {
      return dateStr;
    }
  };

  const handleNavigate = () => {
    onClose();
    onNavigate(item);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <div className={`p-1.5 rounded-lg ${config.bgColor} flex-shrink-0`}>
              <Icon className={`w-4 h-4 ${config.iconColor}`} />
            </div>
            <span className="text-sm font-semibold leading-tight line-clamp-2">{item.title}</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-3">
          {/* Type and Status */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${config.bgColor} ${config.iconColor}`}>
              {config.label}
            </span>
            <StatusBadge status={item.status} type={item.type} />
          </div>
          
          {/* Description */}
          {item.description && (
            <div>
              <h4 className="text-xs font-medium text-muted mb-1">Description</h4>
              <p className="text-sm text-secondary leading-relaxed line-clamp-4">{item.description}</p>
            </div>
          )}
          
          {/* Failure Mode for observations */}
          {item.type === "observation" && item.failure_mode && (
            <div>
              <h4 className="text-xs font-medium text-muted mb-1">Failure Mode</h4>
              <p className="text-sm text-secondary">{item.failure_mode}</p>
            </div>
          )}
          
          {/* Risk/Priority info */}
          {item.type === "observation" && item.risk_score && (
            <div className="flex items-center gap-4">
              <div>
                <span className="text-xs text-muted">Risk Level</span>
                <p className="text-sm font-medium text-primary capitalize">{item.risk_level}</p>
              </div>
              <div>
                <span className="text-xs text-muted">Risk Score</span>
                <p className="text-sm font-medium text-primary">{item.risk_score}</p>
              </div>
            </div>
          )}
          
          {item.type === "action" && item.priority && (
            <div>
              <span className="text-xs text-muted">Priority</span>
              <p className="text-sm font-medium text-primary capitalize">{item.priority}</p>
            </div>
          )}
          
          {/* Dates */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <span className="text-xs text-muted">Created</span>
              <p className="text-xs text-secondary">{formatDate(item.created_at)}</p>
            </div>
            {item.due_date && (
              <div>
                <span className="text-xs text-muted">Due Date</span>
                <p className="text-xs text-secondary">{formatDate(item.due_date)}</p>
              </div>
            )}
            {item.scheduled_date && (
              <div>
                <span className="text-xs text-muted">Scheduled</span>
                <p className="text-xs text-secondary">{formatDate(item.scheduled_date)}</p>
              </div>
            )}
            {item.completed_at && (
              <div>
                <span className="text-xs text-muted">Completed</span>
                <p className="text-xs text-secondary">{formatDate(item.completed_at)}</p>
              </div>
            )}
          </div>
          
          {/* Navigate to item button */}
          <Button 
            onClick={handleNavigate}
            className="w-full mt-2"
            size="sm"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            View {config.label} Details
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Single timeline item
const TimelineItem = ({ item, onClick, isFirst, isLast }) => {
  const config = ITEM_CONFIG[item.type];
  const Icon = config.icon;
  
  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      return format(parseISO(dateStr), "MMM d");
    } catch {
      return "";
    }
  };

  // Get display text - failure mode for observations, title/summary for others
  const getDisplayText = () => {
    if (item.type === "observation") {
      return item.failure_mode || item.title;
    }
    if (item.type === "action") {
      // Show first 30 chars of title as summary
      return item.title?.length > 30 ? item.title.substring(0, 30) + "..." : item.title;
    }
    return item.title;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex-shrink-0 w-28 md:w-36 cursor-pointer group"
      onClick={() => onClick(item)}
      style={{ scrollSnapAlign: "start" }}
    >
      {/* Timeline connector - lighter */}
      <div className="relative flex items-center justify-center mb-1.5 md:mb-2">
        {!isFirst && (
          <div className="absolute left-0 w-1/2 h-px bg-slate-200" />
        )}
        {!isLast && (
          <div className="absolute right-0 w-1/2 h-px bg-slate-200" />
        )}
        <div className={`relative z-10 w-2.5 h-2.5 md:w-3 md:h-3 rounded-full ${config.dotColor} ring-2 ring-white group-hover:scale-125 transition-transform`} />
      </div>
      
      {/* Date */}
      <div className="text-center mb-1 md:mb-1.5">
        <span className="text-[9px] md:text-[10px] text-slate-400">{formatDate(item.created_at)}</span>
      </div>
      
      {/* Card - lighter styling */}
      <div className={`p-2 rounded-lg border ${config.borderColor} ${config.bgColor} group-hover:shadow-sm transition-all`}>
        <div className="flex items-center gap-1 mb-0.5">
          <Icon className={`w-3 h-3 ${config.iconColor}`} />
          <span className={`text-[9px] md:text-[10px] font-medium ${config.iconColor}`}>{config.label}</span>
        </div>
        <p className="text-[10px] md:text-xs font-medium text-slate-700 line-clamp-2 leading-tight">{getDisplayText()}</p>
        <div className="mt-1">
          <StatusBadge status={item.status} type={item.type} />
        </div>
      </div>
    </motion.div>
  );
};

// Main Timeline Component
const EquipmentTimeline = ({ equipmentId, equipmentName, threatId }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [selectedItem, setSelectedItem] = useState(null);
  const [filter, setFilter] = useState("all");
  const [scrollPosition, setScrollPosition] = useState(0);
  
  // Fetch from threat timeline if threatId provided, otherwise equipment history
  const { data, isLoading, error } = useQuery({
    queryKey: threatId ? ["threatTimeline", threatId] : ["equipmentHistory", equipmentId],
    queryFn: () => threatId 
      ? threatsAPI.getTimeline(threatId)
      : equipmentHierarchyAPI.getEquipmentHistory(equipmentId),
    enabled: !!(threatId || equipmentId),
  });
  
  // Handle navigation to item detail
  const handleNavigateToItem = (item) => {
    const config = ITEM_CONFIG[item.type];
    if (item.type === "observation") {
      navigate(`/threats/${item.id}`);
    } else if (item.type === "action") {
      navigate(`/actions/${item.id}`);
    } else if (item.type === "task") {
      navigate(`/my-tasks`);
    }
  };
  
  if (!equipmentId && !threatId) {
    return null;
  }
  
  if (isLoading) {
    return (
      <div className="card p-4 mb-6">
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
          <span className="ml-2 text-sm text-muted">Loading history...</span>
        </div>
      </div>
    );
  }
  
  if (error) {
    // If not found, show a friendlier message instead of error
    if (error.response?.status === 404) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card p-4 mb-6"
          data-testid="equipment-timeline-section"
        >
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-primary text-sm">
              Related Activity
            </h3>
          </div>
          <div className="text-center py-4 text-muted">
            <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No related activity yet</p>
          </div>
        </motion.div>
      );
    }
    
    return (
      <div className="card p-6 mb-6">
        <div className="flex items-center justify-center py-8 text-red-500">
          <AlertCircle className="w-5 h-5 mr-2" />
          <span>Failed to load equipment history</span>
        </div>
      </div>
    );
  }
  
  const timeline = data?.timeline || [];
  const counts = data?.counts || { observations: 0, actions: 0, tasks: 0 };
  
  // Filter timeline items
  const filteredTimeline = filter === "all" 
    ? timeline 
    : timeline.filter(item => item.type === filter);
  
  const handleScroll = (direction) => {
    const container = document.getElementById("timeline-scroll-container");
    if (container) {
      const scrollAmount = direction === "left" ? -200 : 200;
      container.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="card p-4 md:p-6 mb-6"
      data-testid="equipment-timeline-section"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-400" />
          <h3 className="font-semibold text-primary text-sm">
            Related Activity
          </h3>
          <span className="text-xs text-muted">({timeline.length})</span>
        </div>
        
        {/* Filter buttons - scrollable on mobile */}
        <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-1 px-1">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
            className="h-6 text-[10px] px-2 flex-shrink-0"
          >
            All ({timeline.length})
          </Button>
          <Button
            variant={filter === "observation" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("observation")}
            className="h-6 text-[10px] px-2 flex-shrink-0"
          >
            <AlertTriangle className="w-3 h-3 mr-0.5" />
            {counts.observations}
          </Button>
          <Button
            variant={filter === "action" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("action")}
            className="h-6 text-[10px] px-2 flex-shrink-0"
          >
            <Target className="w-3 h-3 mr-0.5" />
            {counts.actions}
          </Button>
          <Button
            variant={filter === "task" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("task")}
            className="h-6 text-[10px] px-2 flex-shrink-0"
          >
            <ClipboardList className="w-3 h-3 mr-0.5" />
            {counts.tasks}
          </Button>
        </div>
      </div>
      
      {/* Timeline */}
      {filteredTimeline.length === 0 ? (
        <div className="text-center py-6 md:py-8 text-muted">
          <Calendar className="w-8 h-8 md:w-10 md:h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No history items found for this equipment</p>
        </div>
      ) : (
        <div className="relative">
          {/* Scroll buttons - hidden on mobile (touch scroll instead) */}
          {filteredTimeline.length > 4 && (
            <>
              <Button
                variant="outline"
                size="icon"
                className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full shadow-md bg-white"
                onClick={() => handleScroll("left")}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full shadow-md bg-white"
                onClick={() => handleScroll("right")}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </>
          )}
          
          {/* Scrollable timeline - touch friendly on mobile */}
          <div
            id="timeline-scroll-container"
            className="flex gap-3 md:gap-4 overflow-x-auto py-3 md:py-4 px-1 md:px-8 scrollbar-hide -webkit-overflow-scrolling-touch"
            style={{ 
              scrollBehavior: "smooth",
              WebkitOverflowScrolling: "touch",
              scrollSnapType: "x mandatory"
            }}
          >
            {filteredTimeline.map((item, index) => (
              <TimelineItem
                key={item.id}
                item={item}
                onClick={setSelectedItem}
                isFirst={index === 0}
                isLast={index === filteredTimeline.length - 1}
              />
            ))}
          </div>
          
          {/* Mobile scroll hint */}
          <div className="md:hidden text-center mt-2">
            <span className="text-xs text-muted">← Swipe to see more →</span>
          </div>
        </div>
      )}
      
      {/* Item Detail Popup */}
      <TimelineItemPopup
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        onNavigate={handleNavigateToItem}
      />
    </motion.div>
  );
};

export default EquipmentTimeline;
