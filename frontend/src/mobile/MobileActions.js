import React from "react";
import { useQuery } from "@tanstack/react-query";
import { actionsAPI } from "../lib/api";
import { CheckCircle, Clock, AlertCircle, ChevronRight } from "lucide-react";

const MobileActions = () => {
  const { data: actionsData = {}, isLoading } = useQuery({
    queryKey: ["actions"],
    queryFn: actionsAPI.getAll,
  });

  const actions = actionsData.actions || [];

  const getPriorityStyle = (priority) => {
    const styles = {
      High: { bg: "#fef2f2", text: "#dc2626" },
      Medium: { bg: "#fff7ed", text: "#ea580c" },
      Low: { bg: "#f0fdf4", text: "#16a34a" },
    };
    return styles[priority] || { bg: "#f1f5f9", text: "#64748b" };
  };

  const getStatusIcon = (status) => {
    if (status === "Completed") return <CheckCircle size={18} className="status-icon completed" />;
    if (status === "Overdue") return <AlertCircle size={18} className="status-icon overdue" />;
    return <Clock size={18} className="status-icon pending" />;
  };

  const getActionTypeLabel = (type) => {
    const labels = {
      CM: "Corrective",
      PM: "Preventive",
      PDM: "Predictive",
    };
    return labels[type] || type;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "No due date";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const openActions = actions.filter(a => a.status !== "Completed");
  const completedActions = actions.filter(a => a.status === "Completed");

  return (
    <div className="mobile-actions" data-testid="mobile-actions">
      <header className="mobile-header">
        <div>
          <h1>Actions</h1>
          <p className="subtitle">Task management</p>
        </div>
        <span className="action-count">{openActions.length} open</span>
      </header>

      <div className="actions-list">
        {isLoading ? (
          <div className="loading-card">Loading actions...</div>
        ) : actions.length === 0 ? (
          <div className="empty-card">No actions yet</div>
        ) : (
          <>
            {openActions.length > 0 && (
              <div className="action-section">
                <h2 className="section-title">Open Actions</h2>
                {openActions.map((action) => {
                  const priorityStyle = getPriorityStyle(action.priority);
                  return (
                    <div 
                      key={action.id} 
                      className="action-card"
                      data-testid={`action-${action.id}`}
                    >
                      <div className="action-left">
                        {getStatusIcon(action.status)}
                        <div className="action-info">
                          <p className="action-title">{action.title || action.description}</p>
                          <div className="action-meta">
                            <span className="action-type">
                              {getActionTypeLabel(action.action_type)}
                            </span>
                            {action.discipline && (
                              <span className="action-discipline">{action.discipline}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="action-right">
                        <span 
                          className="priority-badge"
                          style={{ backgroundColor: priorityStyle.bg, color: priorityStyle.text }}
                        >
                          {action.priority}
                        </span>
                        <span className="due-date">{formatDate(action.due_date)}</span>
                      </div>
                      <ChevronRight className="action-chevron" size={18} />
                    </div>
                  );
                })}
              </div>
            )}

            {completedActions.length > 0 && (
              <div className="action-section">
                <h2 className="section-title">Completed ({completedActions.length})</h2>
                {completedActions.slice(0, 5).map((action) => (
                  <div 
                    key={action.id} 
                    className="action-card completed"
                    data-testid={`action-${action.id}`}
                  >
                    <div className="action-left">
                      {getStatusIcon(action.status)}
                      <div className="action-info">
                        <p className="action-title">{action.title || action.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        .mobile-actions {
          min-height: 100%;
          background: #f1f5f9;
        }

        .mobile-header {
          background: #ffffff;
          padding: 20px 16px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .mobile-header h1 {
          font-size: 24px;
          font-weight: 700;
          margin: 0;
          color: #0f172a;
        }

        .mobile-header .subtitle {
          font-size: 13px;
          color: #64748b;
          margin: 2px 0 0 0;
        }

        .action-count {
          font-size: 12px;
          font-weight: 600;
          color: #ea580c;
          background: #fff7ed;
          padding: 6px 12px;
          border-radius: 20px;
        }

        .actions-list {
          padding: 12px;
        }

        .action-section {
          margin-bottom: 20px;
        }

        .section-title {
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 8px 4px 12px;
          margin: 0;
        }

        .action-card {
          position: relative;
          background: #ffffff;
          border-radius: 16px;
          padding: 16px;
          margin-bottom: 10px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }

        .action-card.completed {
          opacity: 0.6;
        }

        .action-left {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          flex: 1;
          min-width: 0;
        }

        .status-icon {
          flex-shrink: 0;
          margin-top: 2px;
        }

        .status-icon.completed { color: #22c55e; }
        .status-icon.overdue { color: #ef4444; }
        .status-icon.pending { color: #f97316; }

        .action-info {
          flex: 1;
          min-width: 0;
        }

        .action-title {
          font-size: 14px;
          font-weight: 600;
          margin: 0 0 6px 0;
          color: #0f172a;
          line-height: 1.3;
        }

        .action-meta {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .action-type {
          font-size: 11px;
          font-weight: 500;
          padding: 3px 8px;
          background: #f1f5f9;
          border-radius: 4px;
          color: #64748b;
        }

        .action-discipline {
          font-size: 11px;
          color: #94a3b8;
        }

        .action-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
          padding-right: 24px;
        }

        .priority-badge {
          font-size: 10px;
          font-weight: 600;
          padding: 4px 8px;
          border-radius: 6px;
        }

        .due-date {
          font-size: 11px;
          color: #94a3b8;
        }

        .action-chevron {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #cbd5e1;
        }

        .loading-card, .empty-card {
          text-align: center;
          padding: 40px 20px;
          color: #64748b;
          background: #ffffff;
          border-radius: 16px;
        }
      `}</style>
    </div>
  );
};

export default MobileActions;
