import React from "react";
import { motion } from "framer-motion";

export function InvestigationTimelineTab(props) {
  return (
    <>
            {activeTab === "timeline" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div><h2 className="text-lg font-semibold">Sequence of Events</h2><p className="text-sm text-slate-500">Reconstruct the timeline</p></div>
                  <Button onClick={() => { setEditingItem(null); setEventForm({ event_time: "", description: "", category: "operational_event", evidence_source: "", confidence: "medium", notes: "", comment: "" }); setShowEventDialog(true); }} className="h-11 bg-blue-600 hover:bg-blue-700" data-testid="add-event-btn" disabled={isInvestigationLocked}><Plus className="w-4 h-4 mr-2" />Add Event</Button>
                </div>
                
                {sortedTimelineEvents.length === 0 ? (
                  <div className="empty-state py-16">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                      <Clock className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-medium mb-1">No events recorded</h3>
                    <p className="text-sm text-slate-500">Start by adding the first event</p>
                  </div>
                ) : (
                  <div className="priority-list">
                    {sortedTimelineEvents.map((event, idx) => {
                      const category = EVENT_CATEGORIES.find(c => c.value === event.category);
                      // Format the timestamp to be more readable using user preferences
                      const formatEventTime = (timeStr) => {
                        if (!timeStr) return `#${idx + 1}`;
                        try {
                          return formatDateTime(timeStr);
                        } catch {
                          return timeStr.substring(0, 16).replace('T', ' ');
                        }
                      };
                      return (
                        <motion.div key={event.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }} className="priority-item group" data-testid={`timeline-event-${event.id}`}>
                          <div className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center ${category?.bgClass?.split(' ')[0] || 'bg-slate-100'}`}>
                            <Clock className={`w-5 h-5 sm:w-6 sm:h-6 ${category?.bgClass?.split(' ')[1] || 'text-slate-600'}`} />
                          </div>
                          <div className="flex-1 min-w-0 ml-3">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-xs font-medium text-slate-500">{formatEventTime(event.event_time)}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${category?.bgClass || "bg-slate-100 text-slate-700"}`}>{category?.label || event.category}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${event.confidence === "high" ? "bg-green-100 text-green-700" : event.confidence === "low" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>{event.confidence}</span>
                              {event.comment && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1"><MessageSquare className="w-3 h-3" />Has comment</span>}
                            </div>
                            <p className="text-sm text-slate-900 line-clamp-2">{event.description}</p>
                            {event.evidence_source && <p className="text-xs text-slate-500 mt-1">Source: {event.evidence_source}</p>}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => { setEditingItem({ type: "event", data: event }); setEventForm({ event_time: event.event_time || "", description: event.description, category: event.category, evidence_source: event.evidence_source || "", confidence: event.confidence, notes: event.notes || "", comment: event.comment || "" }); setShowEventDialog(true); }}><Edit className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteEventMutation.mutate(event.id)}><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
    </>
  );
}
