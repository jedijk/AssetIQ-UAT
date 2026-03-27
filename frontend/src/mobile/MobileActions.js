import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { actionsAPI } from "../lib/api";
import { 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  ChevronRight,
  Wrench,
  Shield,
  Target,
  Filter,
  TrendingUp,
  CheckSquare
} from "lucide-react";

const MobileActions = () => {
  const [filter, setFilter] = useState("open");

  const { data: actionsData = {}, isLoading } = useQuery({
    queryKey: ["actions"],
    queryFn: actionsAPI.getAll,
  });

  const actions = actionsData.actions || [];

  const filteredActions = actions.filter(a => {
    if (filter === "open") return a.status !== "Completed";
    if (filter === "completed") return a.status === "Completed";
    if (filter === "overdue") {
      const due = a.due_date ? new Date(a.due_date) : null;
      return due && due < new Date() && a.status !== "Completed";
    }
    return true;
  });

  const getActionTypeConfig = (type) => {
    const configs = {
      CM: { label: "Corrective", color: "#dc2626", bg: "#fef2f2", icon: Wrench },
      PM: { label: "Preventive", color: "#2563eb", bg: "#eff6ff", icon: Shield },
      PDM: { label: "Predictive", color: "#7c3aed", bg: "#f5f3ff", icon: TrendingUp },
    };
    return configs[type] || configs.CM;
  };

  const getPriorityConfig = (priority) => {
    const configs = {
      High: { color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
      Medium: { color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
      Low: { color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
    };
    return configs[priority] || configs.Medium;
  };

  const getStatusConfig = (status, dueDate) => {
    const now = new Date();
    const due = dueDate ? new Date(dueDate) : null;
    const isOverdue = due && due < now && status !== "Completed";

    if (status === "Completed") {
      return { icon: CheckCircle, color: "#22c55e", bg: "#f0fdf4" };
    }
    if (isOverdue) {
      return { icon: AlertCircle, color: "#ef4444", bg: "#fef2f2" };
    }
    return { icon: Clock, color: "#f59e0b", bg: "#fffbeb" };
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "No due date";
    const date = new Date(dateStr);
    const today = new Date();
    const diff = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
    
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    if (diff < -1) return `${Math.abs(diff)} days overdue`;
    if (diff <= 7) return `In ${diff} days`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const stats = {
    open: actions.filter(a => a.status !== "Completed").length,
    completed: actions.filter(a => a.status === "Completed").length,
    overdue: actions.filter(a => {
      const due = a.due_date ? new Date(a.due_date) : null;
      return due && due < new Date() && a.status !== "Completed";
    }).length,
  };

  const filterTabs = [
    { id: "open", label: "Open", count: stats.open },
    { id: "overdue", label: "Overdue", count: stats.overdue },
    { id: "completed", label: "Completed", count: stats.completed },
  ];

  return (
    <div className="mobile-actions" data-testid="mobile-actions">
      {/* Header */}
      <header className="mobile-header">
        <div className="header-content">
          <h1>Actions</h1>
          <p className="subtitle">Corrective & preventive measures</p>
        </div>
        <div className="header-stats">
          <div className="stat-item">
            <span className="stat-value">{stats.open}</span>
            <span className="stat-label">Open</span>
          </div>
          {stats.overdue > 0 && (
            <div className="stat-item overdue">
              <span className="stat-value">{stats.overdue}</span>
              <span className="stat-label">Overdue</span>
            </div>
          )}
        </div>
      </header>

      {/* Filter Tabs */}
      <div className="filter-section">
        <div className="filter-tabs">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`filter-tab ${filter === tab.id ? "active" : ""}`}
            >
              {tab.label}
              {tab.count > 0 && <span className="tab-count">{tab.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Actions List */}
      <div className="actions-container">
        {isLoading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <span>Loading actions...</span>
          </div>
        ) : filteredActions.length === 0 ? (
          <div className="empty-state">
            <CheckSquare size={48} className="empty-icon" />
            <p>No {filter} actions</p>
            <span>Actions linked to observations appear here</span>
          </div>
        ) : (
          <div className="actions-list">
            {filteredActions.map((action) => {
              const typeConfig = getActionTypeConfig(action.action_type);
              const priorityConfig = getPriorityConfig(action.priority);
              const statusConfig = getStatusConfig(action.status, action.due_date);
              const StatusIcon = statusConfig.icon;
              const TypeIcon = typeConfig.icon;

              return (
                <div 
                  key={action.id} 
                  className="action-card"
                  data-testid={`action-${action.id}`}
                >
                  {/* Status Icon */}
                  <div 
                    className="status-indicator"
                    style={{ backgroundColor: statusConfig.bg }}
                  >
                    <StatusIcon size={20} color={statusConfig.color} />
                  </div>

                  {/* Content */}
                  <div className="action-content">
                    <div className="action-header">
                      <span 
                        className="type-badge"
                        style={{ backgroundColor: typeConfig.bg, color: typeConfig.color }}
                      >
                        <TypeIcon size={10} />
                        {typeConfig.label}
                      </span>
                      <span 
                        className="priority-badge"
                        style={{ 
                          backgroundColor: priorityConfig.bg, 
                          color: priorityConfig.color,
                          borderColor: priorityConfig.border
                        }}
                      >
                        {action.priority}
                      </span>
                    </div>

                    <h3 className="action-title">
                      {action.title || action.description || "Untitled Action"}
                    </h3>

                    <div className="action-meta">
                      {action.discipline && (
                        <span className="meta-item">
                          <Target size={12} />
                          {action.discipline}
                        </span>
                      )}
                      <span className={`meta-item due ${statusConfig.color === "#ef4444" ? "overdue" : ""}`}>
                        <Clock size={12} />
                        {formatDate(action.due_date)}
                      </span>
                    </div>

                    {action.assigned_to && (
                      <div className="assigned-to">
                        <div className="avatar">{action.assigned_to.charAt(0).toUpperCase()}</div>
                        <span>{action.assigned_to}</span>
                      </div>
                    )}
                  </div>

                  <ChevronRight size={18} className="chevron" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        .mobile-actions {
          min-height: 100%;
          background: #fafafa;
          padding-bottom: 80px;
        }

        .mobile-header {
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          padding: 24px 20px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          color: white;
        }

        .header-content h1 {
          font-size: 26px;
          font-weight: 700;
          margin: 0;
          letter-spacing: -0.5px;
        }

        .header-content .subtitle {
          font-size: 13px;
          opacity: 0.9;
          margin: 4px 0 0 0;
          font-weight: 400;
        }

        .header-stats {
          display: flex;
          gap: 10px;
        }

        .stat-item {
          background: rgba(255,255,255,0.2);
          border-radius: 12px;
          padding: 10px 14px;
          text-align: center;
          backdrop-filter: blur(10px);
        }

        .stat-item.overdue {
          background: rgba(239, 68, 68, 0.3);
        }

        .stat-value {
          display: block;
          font-size: 20px;
          font-weight: 700;
        }

        .stat-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          opacity: 0.9;
        }

        .filter-section {
          background: #ffffff;
          padding: 12px 16px;
          border-bottom: 1px solid #f0f0f0;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .filter-tabs {
          display: flex;
          gap: 8px;
        }

        .filter-tab {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 18px;
          border-radius: 24px;
          border: 1.5px solid #e5e7eb;
          background: #ffffff;
          color: #6b7280;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          cursor: pointer;
          transition: all 0.2s;
        }

        .filter-tab.active {
          background: #22c55e;
          border-color: #22c55e;
          color: #fff;
        }

        .tab-count {
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 10px;
          background: rgba(0,0,0,0.1);
        }

        .filter-tab.active .tab-count {
          background: rgba(255,255,255,0.3);
        }

        .actions-container {
          padding: 12px;
        }

        .actions-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .action-card {
          background: #ffffff;
          border-radius: 16px;
          padding: 16px;
          display: flex;
          align-items: flex-start;
          gap: 14px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
          cursor: pointer;
          transition: all 0.2s;
        }

        .action-card:active {
          transform: scale(0.98);
        }

        .status-indicator {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .action-content {
          flex: 1;
          min-width: 0;
        }

        .action-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .type-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 20px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .priority-badge {
          font-size: 10px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 20px;
          border: 1px solid;
        }

        .action-title {
          font-size: 15px;
          font-weight: 600;
          margin: 0 0 8px 0;
          color: #1f2937;
          line-height: 1.35;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .action-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: #6b7280;
        }

        .meta-item.overdue {
          color: #ef4444;
          font-weight: 600;
        }

        .assigned-to {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 10px;
          font-size: 12px;
          color: #6b7280;
        }

        .avatar {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 600;
        }

        .chevron {
          color: #d1d5db;
          flex-shrink: 0;
          align-self: center;
        }

        .loading-state, .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: #6b7280;
        }

        .loading-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #e5e7eb;
          border-top-color: #22c55e;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto 16px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .empty-icon {
          color: #d1d5db;
          margin-bottom: 12px;
        }

        .empty-state p {
          font-weight: 600;
          color: #374151;
          margin: 0 0 4px 0;
        }

        .empty-state span {
          font-size: 13px;
        }
      `}</style>
    </div>
  );
};

export default MobileActions;
