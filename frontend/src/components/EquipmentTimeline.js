import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
} from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { equipmentHierarchyAPI } from "../lib/api";
import { useLanguage } from "../contexts/LanguageContext";

// Timeline item colors and icons
const ITEM_CONFIG = {
  observation: {
    icon: AlertTriangle,
    bgColor: "bg-amber-100",
    iconColor: "text-amber-600",
    borderColor: "border-amber-400",
    dotColor: "bg-amber-500",
    label: "Observation",
  },
  action: {
    icon: Target,
    bgColor: "bg-blue-100",
    iconColor: "text-blue-600",
    borderColor: "border-blue-400",
    dotColor: "bg-blue-500",
    label: "Action",
  },
  task: {
    icon: ClipboardList,
    bgColor: "bg-purple-100",
    iconColor: "text-purple-600",
    borderColor: "border-purple-400",
    dotColor: "bg-purple-500",
    label: "Task",
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
const TimelineItemPopup = ({ item, isOpen, onClose }) => {
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${config.bgColor}`}>
              <Icon className={`w-5 h-5 ${config.iconColor}`} />
            </div>
            <span className="truncate">{item.title}</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Type and Status */}
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded text-xs font-medium ${config.bgColor} ${config.iconColor}`}>
              {config.label}
            </span>
            <StatusBadge status={item.status} type={item.type} />
          </div>
          
          {/* Description */}
          {item.description && (
            <div>
              <h4 className="text-sm font-medium text-secondary mb-1">Description</h4>
              <p className="text-sm text-muted">{item.description}</p>
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
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200">
            <div>
              <span className="text-xs text-muted">Created</span>
              <p className="text-sm text-secondary">{formatDate(item.created_at)}</p>
            </div>
            {item.due_date && (
              <div>
                <span className="text-xs text-muted">Due Date</span>
                <p className="text-sm text-secondary">{formatDate(item.due_date)}</p>
              </div>
            )}
            {item.scheduled_date && (
              <div>
                <span className="text-xs text-muted">Scheduled</span>
                <p className="text-sm text-secondary">{formatDate(item.scheduled_date)}</p>
              </div>
            )}
            {item.completed_at && (
              <div>
                <span className="text-xs text-muted">Completed</span>
                <p className="text-sm text-secondary">{formatDate(item.completed_at)}</p>
              </div>
            )}
          </div>
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

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex-shrink-0 w-40 cursor-pointer group"
      onClick={() => onClick(item)}
    >
      {/* Timeline connector */}
      <div className="relative flex items-center justify-center mb-2">
        {!isFirst && (
          <div className="absolute left-0 w-1/2 h-0.5 bg-slate-300" />
        )}
        {!isLast && (
          <div className="absolute right-0 w-1/2 h-0.5 bg-slate-300" />
        )}
        <div className={`relative z-10 w-4 h-4 rounded-full ${config.dotColor} ring-4 ring-white group-hover:scale-125 transition-transform`} />
      </div>
      
      {/* Date */}
      <div className="text-center mb-2">
        <span className="text-xs text-muted">{formatDate(item.created_at)}</span>
      </div>
      
      {/* Card */}
      <div className={`p-3 rounded-lg border-2 ${config.borderColor} ${config.bgColor} group-hover:shadow-md transition-all`}>
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`w-4 h-4 ${config.iconColor}`} />
          <span className={`text-xs font-medium ${config.iconColor}`}>{config.label}</span>
        </div>
        <p className="text-sm font-medium text-primary truncate">{item.title}</p>
        <div className="mt-1">
          <StatusBadge status={item.status} type={item.type} />
        </div>
      </div>
    </motion.div>
  );
};

// Main Timeline Component
const EquipmentTimeline = ({ equipmentId, equipmentName }) => {
  const { t } = useLanguage();
  const [selectedItem, setSelectedItem] = useState(null);
  const [filter, setFilter] = useState("all");
  const [scrollPosition, setScrollPosition] = useState(0);
  
  const { data, isLoading, error } = useQuery({
    queryKey: ["equipmentHistory", equipmentId],
    queryFn: () => equipmentHierarchyAPI.getEquipmentHistory(equipmentId),
    enabled: !!equipmentId,
  });
  
  if (!equipmentId) {
    return null;
  }
  
  if (isLoading) {
    return (
      <div className="card p-6 mb-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          <span className="ml-2 text-muted">Loading equipment history...</span>
        </div>
      </div>
    );
  }
  
  if (error) {
    // If equipment not found, show a friendlier message instead of error
    if (error.response?.status === 404) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card p-6 mb-6"
          data-testid="equipment-timeline-section"
        >
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-blue-500" />
            <h3 className="font-semibold text-primary">
              Equipment History
            </h3>
          </div>
          <div className="text-center py-6 text-muted">
            <Calendar className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>No equipment history available yet</p>
            <p className="text-xs mt-1">Link equipment in the Equipment Manager to track history</p>
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
      className="card p-6 mb-6"
      data-testid="equipment-timeline-section"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-500" />
          <h3 className="font-semibold text-primary">
            Equipment History
          </h3>
          <span className="text-sm text-muted">({timeline.length} items)</span>
        </div>
        
        {/* Filter buttons */}
        <div className="flex gap-1">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
            className="h-7 text-xs"
          >
            All ({timeline.length})
          </Button>
          <Button
            variant={filter === "observation" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("observation")}
            className="h-7 text-xs"
          >
            <AlertTriangle className="w-3 h-3 mr-1" />
            {counts.observations}
          </Button>
          <Button
            variant={filter === "action" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("action")}
            className="h-7 text-xs"
          >
            <Target className="w-3 h-3 mr-1" />
            {counts.actions}
          </Button>
          <Button
            variant={filter === "task" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("task")}
            className="h-7 text-xs"
          >
            <ClipboardList className="w-3 h-3 mr-1" />
            {counts.tasks}
          </Button>
        </div>
      </div>
      
      {/* Timeline */}
      {filteredTimeline.length === 0 ? (
        <div className="text-center py-8 text-muted">
          <Calendar className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>No history items found for this equipment</p>
        </div>
      ) : (
        <div className="relative">
          {/* Scroll buttons */}
          {filteredTimeline.length > 4 && (
            <>
              <Button
                variant="outline"
                size="icon"
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full shadow-md bg-white"
                onClick={() => handleScroll("left")}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full shadow-md bg-white"
                onClick={() => handleScroll("right")}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </>
          )}
          
          {/* Scrollable timeline */}
          <div
            id="timeline-scroll-container"
            className="flex gap-4 overflow-x-auto py-4 px-8 scrollbar-hide"
            style={{ scrollBehavior: "smooth" }}
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
        </div>
      )}
      
      {/* Item Detail Popup */}
      <TimelineItemPopup
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </motion.div>
  );
};

export default EquipmentTimeline;
