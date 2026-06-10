import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  Calendar,
  CircleDot,
  Cog,
  Eye,
  FileSearch,
  History,
  List,
  Wrench,
  XCircle,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { useLanguage } from "../../contexts/LanguageContext";
import { translateEnum } from "../../lib/translateEnum";

const EVENT_TYPE_ENUM = {
  observation: "Observation",
  failure: "Failure",
  work_order: "Action",
  action: "Action",
  inspection: "Inspection",
  repair: "Repair",
  investigation: "Investigation",
  strategy_change: "Strategy Change",
};

const getEventTypeLabel = (t, type) => translateEnum(t, EVENT_TYPE_ENUM[type] || "Event");

function TimelineEventCard({ event, isCurrent }) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  
  const getEventConfig = (type) => {
    const configs = {
      observation: { icon: AlertTriangle, color: "amber" },
      failure: { icon: XCircle, color: "red" },
      work_order: { icon: Wrench, color: "blue" },
      action: { icon: Wrench, color: "blue" },
      inspection: { icon: Eye, color: "green" },
      repair: { icon: Wrench, color: "purple" },
      investigation: { icon: FileSearch, color: "indigo" },
      strategy_change: { icon: Cog, color: "slate" },
    };
    const base = configs[type] || configs.observation;
    return { ...base, label: getEventTypeLabel(t, type) };
  };

  const config = getEventConfig(event.event_type);
  const Icon = config.icon;
  
  // For actions/work orders, show the action_type (PM, CM, PDM, etc.)
  const isAction = event.event_type === "action" || event.event_type === "work_order";
  const actionType = event.action_type || event.task_type || event.type;
  
  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      return format(parseISO(dateStr), "MMM yyyy");
    } catch {
      return dateStr;
    }
  };

  const handleClick = () => {
    if (event.event_type === "observation" && event.id) {
      navigate(`/threats/${event.id}`);
    } else if (event.event_type === "investigation" && event.id) {
      navigate(`/causal-engine?id=${event.id}`);
    }
  };

  // Compose a full tooltip showing all available context for the event.
  const tooltipParts = [];
  if (event.title) tooltipParts.push(event.title);
  if (event.date) {
    try { tooltipParts.push(format(parseISO(event.date), "PPP")); } catch (_) { tooltipParts.push(event.date); }
  }
  if (config.label) tooltipParts.push(config.label);
  if (actionType) tooltipParts.push(t("observationWorkspace.eventTypeLabel", { type: actionType }));
  if (event.reference_id) tooltipParts.push(event.reference_id);
  if (event.status) tooltipParts.push(t("observationWorkspace.statusLabel", { status: translateEnum(t, event.status) }));
  if (event.description) tooltipParts.push(event.description);
  const tooltip = tooltipParts.join("\n");

  return (
    <div 
      className="flex flex-col items-center cursor-pointer group flex-shrink-0 w-20"
      onClick={handleClick}
      title={tooltip}
    >
      {/* Date */}
      <div className="text-[10px] text-slate-500 mb-1.5 font-medium h-3.5 leading-3.5">
        {formatDate(event.date)}
      </div>
      
      {/* Event Circle — sits above the connector line; bg-white outer ring punches through the rail */}
      <div className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center transition-transform group-hover:scale-105 ring-2 ring-white ${
        isCurrent 
          ? "bg-blue-600 text-white shadow-sm shadow-blue-200"
          : `bg-${config.color}-100 text-${config.color}-600`
      }`}>
        <Icon className="w-3 h-3" />
      </div>
      
      {/* Action Type Badge (for actions/work orders) */}
      {isAction && actionType && (
        <div className="text-[9px] font-semibold mt-1 px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
          {actionType}
        </div>
      )}
      
      {/* Event Title */}
      <div className={`text-[10px] font-medium ${isAction && actionType ? 'mt-1' : 'mt-1.5'} text-center max-w-[72px] truncate leading-tight ${
        isCurrent ? "text-blue-700 font-semibold" : "text-slate-700"
      }`}>
        {event.title?.substring(0, 22) || config.label}
      </div>
      
      {/* Reference ID */}
      {event.reference_id && (
        <div className="text-[9px] text-slate-400 mt-0.5 leading-none">
          {event.reference_id}
        </div>
      )}
    </div>
  );
};

/**
 * Equipment Reliability Timeline
 */
export function EquipmentReliabilityTimeline({ events, aiEvidence }) {
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState("timeline"); // timeline or list
  const navigate = useNavigate();

  // Find current event
  const currentEvent = events?.find(e => e.is_current);

  return (
    <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
      {/* Header — compact */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <History className="w-3.5 h-3.5 text-slate-500" />
          <h3 className="font-medium text-xs text-slate-700">{t("observationWorkspace.equipmentHistory")}</h3>
          {events && events.length > 0 && (
            <span className="text-[10px] text-slate-400">({events.length})</span>
          )}
        </div>
        
        {/* View Toggle */}
        <div className="flex items-center gap-1">
          <Button
            variant={viewMode === "timeline" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("timeline")}
            className="h-6 px-2 text-xs"
          >
            <Calendar className="w-3 h-3 mr-1" />
            {t("observationWorkspace.timeline")}
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("list")}
            className="h-6 px-2 text-xs"
          >
            <List className="w-3 h-3 mr-1" />
            {t("observationWorkspace.list")}
          </Button>
        </div>
      </div>

      {/* Timeline View */}
      {viewMode === "timeline" && events && events.length > 0 ? (
        <div className="relative px-1.5">
          {/* Horizontal connector — aligned with the centre of the event circles.
              Position math: date row (14px text + mb-1.5 = 6px) + half of circle (24/2 = 12px) = 32px. */}
          <div className="pointer-events-none absolute left-0 right-0 h-px bg-slate-200" style={{ top: "32px" }} />
          
          {/* Events */}
          <div className="flex items-start overflow-x-auto pb-1.5 gap-3 scrollbar-thin scrollbar-thumb-slate-300">
            {events.slice(0, 10).map((event, index) => (
              <TimelineEventCard 
                key={event.id || index}
                event={event} 
                isCurrent={event.is_current}
              />
            ))}
          </div>
        </div>
      ) : viewMode === "list" ? (
        <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
          {events?.map((event, index) => {
            const configBase = {
              observation: { icon: AlertTriangle, color: "amber" },
              failure: { icon: XCircle, color: "red" },
              work_order: { icon: Wrench, color: "blue" },
              action: { icon: Wrench, color: "blue" },
              inspection: { icon: Eye, color: "green" },
              repair: { icon: Wrench, color: "purple" },
              investigation: { icon: FileSearch, color: "indigo" },
            }[event.event_type] || { icon: CircleDot, color: "slate" };
            const config = { ...configBase, label: getEventTypeLabel(t, event.event_type) };
            const Icon = config.icon;
            
            // For actions/work orders, show the action_type (PM, CM, PDM, etc.)
            const isAction = event.event_type === "action" || event.event_type === "work_order";
            const actionType = event.action_type || event.task_type || event.type;
            
            return (
              <div 
                key={event.id || index}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                  event.is_current 
                    ? "border-blue-300 bg-blue-50" 
                    : "border-slate-200 hover:bg-slate-50"
                }`}
                onClick={() => {
                  if (event.event_type === "observation" && event.id) {
                    navigate(`/threats/${event.id}`);
                  }
                }}
              >
                <div className={`p-2 rounded-lg bg-${config.color}-100`}>
                  <Icon className={`w-4 h-4 text-${config.color}-600`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {isAction && actionType && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                        {actionType}
                      </span>
                    )}
                    {!isAction && (
                      <span className="text-[10px] text-slate-500">{config.label}</span>
                    )}
                  </div>
                  <div className="font-medium text-sm text-slate-900 truncate">{event.title}</div>
                  <div className="text-xs text-slate-500">
                    {event.date && format(parseISO(event.date), "MMM d, yyyy")}
                    {event.reference_id && ` • ${event.reference_id}`}
                  </div>
                </div>
                {event.is_current && (
                  <Badge className="bg-blue-600 text-xs">{t("observationWorkspace.current")}</Badge>
                )}
                {event.status && !event.is_current && (
                  <Badge variant="outline" className="text-xs capitalize">{translateEnum(t, event.status)}</Badge>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-slate-500">
          <History className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t("observationWorkspace.noHistoricalEvents")}</p>
        </div>
      )}
    </div>
  );
};
