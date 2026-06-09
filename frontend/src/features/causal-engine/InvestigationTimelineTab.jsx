import { motion } from "framer-motion";
import { Clock, Plus, Edit, Trash2, MessageSquare } from "lucide-react";
import { Button } from "../../components/ui/button";

export function InvestigationTimelineTab({
  events,
  isLocked,
  eventCategories,
  formatDateTime,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
}) {
  const formatEventTime = (timeStr, idx) => {
    if (!timeStr) return `#${idx + 1}`;
    try {
      return formatDateTime(timeStr);
    } catch {
      return timeStr.substring(0, 16).replace("T", " ");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Sequence of Events</h2>
          <p className="text-sm text-slate-500">Reconstruct the timeline</p>
        </div>
        <Button
          onClick={onAddEvent}
          className="h-11 bg-blue-600 hover:bg-blue-700"
          data-testid="add-event-btn"
          disabled={isLocked}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Event
        </Button>
      </div>

      {events.length === 0 ? (
        <div className="empty-state py-16">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <Clock className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium mb-1">No events recorded</h3>
          <p className="text-sm text-slate-500">Start by adding the first event</p>
        </div>
      ) : (
        <div className="priority-list">
          {events.map((event, idx) => {
            const category = eventCategories.find((c) => c.value === event.category);
            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="priority-item group"
                data-testid={`timeline-event-${event.id}`}
              >
                <div
                  className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center ${
                    category?.bgClass?.split(" ")[0] || "bg-slate-100"
                  }`}
                >
                  <Clock
                    className={`w-5 h-5 sm:w-6 sm:h-6 ${
                      category?.bgClass?.split(" ")[1] || "text-slate-600"
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0 ml-3">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-medium text-slate-500">
                      {formatEventTime(event.event_time, idx)}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        category?.bgClass || "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {category?.label || event.category}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        event.confidence === "high"
                          ? "bg-green-100 text-green-700"
                          : event.confidence === "low"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {event.confidence}
                    </span>
                    {event.comment && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        Has comment
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-900 line-clamp-2">{event.description}</p>
                  {event.evidence_source && (
                    <p className="text-xs text-slate-500 mt-1">Source: {event.evidence_source}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => onEditEvent(event)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => onDeleteEvent(event.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
