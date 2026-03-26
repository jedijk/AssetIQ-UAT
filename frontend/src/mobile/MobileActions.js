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

  const getPriorityColor = (priority) => {
    const colors = {
      High: "#ef4444",
      Medium: "#f97316",
      Low: "#22c55e",
    };
    return colors[priority] || "#6b7280";
  };

  const getStatusIcon = (status) => {
    if (status === "Completed") return <CheckCircle size={16} className="status-icon completed" />;
    if (status === "Overdue") return <AlertCircle size={16} className="status-icon overdue" />;
    return <Clock size={16} className="status-icon pending" />;
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
        <h1>Actions</h1>
        <span className="action-count">{openActions.length} open</span>
      </header>

      <div className="actions-list">
        {isLoading ? (
          <div className="loading">Loading actions...</div>
        ) : actions.length === 0 ? (
          <div className="empty">No actions yet</div>
        ) : (
          <>
            {openActions.length > 0 && (
              <div className="action-section">
                <h2 className="section-title">Open Actions</h2>
                {openActions.map((action) => (
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
                          <span 
                            className="action-type"
                            style={{ borderColor: getPriorityColor(action.priority) }}
                          >
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
                        style={{ backgroundColor: getPriorityColor(action.priority) }}
                      >
                        {action.priority}
                      </span>
                      <span className="due-date">{formatDate(action.due_date)}</span>
                    </div>
                    <ChevronRight className="action-chevron" size={18} />
                  </div>
                ))}
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
        }

        .mobile-header {
          position: sticky;
          top: 0;
          background: #0a0a0a;
          padding: 16px;
          border-bottom: 1px solid #333;
          display: flex;
          justify-content: space-between;
          align-items: center;
          z-index: 10;
        }

        .mobile-header h1 {
          font-size: 20px;
          font-weight: 600;
          margin: 0;
        }

        .action-count {
          font-size: 12px;
          color: #f97316;
          background: rgba(249, 115, 22, 0.15);
          padding: 4px 10px;
          border-radius: 12px;
        }

        .actions-list {
          padding: 8px;
        }

        .action-section {
          margin-bottom: 24px;
        }

        .section-title {
          font-size: 13px;
          font-weight: 600;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 8px 8px 12px;
          margin: 0;
        }

        .action-card {
          position: relative;
          background: #1a1a1a;
          border-radius: 12px;
          padding: 14px;
          margin-bottom: 8px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
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
          font-weight: 500;
          margin: 0 0 6px 0;
          color: #fff;
          line-height: 1.3;
        }

        .action-meta {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .action-type {
          font-size: 11px;
          padding: 2px 6px;
          border: 1px solid;
          border-radius: 4px;
          color: #888;
        }

        .action-discipline {
          font-size: 11px;
          color: #666;
        }

        .action-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
          padding-right: 20px;
        }

        .priority-badge {
          font-size: 10px;
          font-weight: 600;
          padding: 3px 6px;
          border-radius: 4px;
          color: #fff;
        }

        .due-date {
          font-size: 11px;
          color: #888;
        }

        .action-chevron {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          color: #444;
        }

        .loading, .empty {
          text-align: center;
          padding: 40px 20px;
          color: #888;
        }
      `}</style>
    </div>
  );
};

export default MobileActions;
