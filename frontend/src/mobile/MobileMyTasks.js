import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight,
  Calendar,
  Play,
  Filter,
  Search,
  Wrench,
  Repeat,
  ClipboardList
} from "lucide-react";

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL;

const MobileMyTasks = () => {
  const [filter, setFilter] = useState("today");
  const [selectedTask, setSelectedTask] = useState(null);

  const { data: tasksData = {}, isLoading } = useQuery({
    queryKey: ["myTasks", filter],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/my-tasks?filter=${filter}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      if (!response.ok) throw new Error("Failed to fetch tasks");
      return response.json();
    },
  });

  const tasks = tasksData.tasks || [];

  const getStatusConfig = (status, dueDate) => {
    const now = new Date();
    const due = dueDate ? new Date(dueDate) : null;
    const isOverdue = due && due < now && status !== "completed";

    if (status === "completed") {
      return { icon: CheckCircle2, color: "#22c55e", bg: "#f0fdf4", label: "Completed" };
    }
    if (isOverdue) {
      return { icon: AlertCircle, color: "#ef4444", bg: "#fef2f2", label: "Overdue" };
    }
    return { icon: Clock, color: "#f59e0b", bg: "#fffbeb", label: "Pending" };
  };

  const getPriorityStyle = (priority) => {
    const styles = {
      High: { bg: "#fef2f2", text: "#dc2626", border: "#fecaca" },
      Medium: { bg: "#fff7ed", text: "#ea580c", border: "#fed7aa" },
      Low: { bg: "#f0fdf4", text: "#16a34a", border: "#bbf7d0" },
    };
    return styles[priority] || styles.Medium;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "No date";
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const filterTabs = [
    { id: "today", label: "Today" },
    { id: "week", label: "This Week" },
    { id: "overdue", label: "Overdue" },
    { id: "all", label: "All" },
  ];

  const taskStats = {
    total: tasks.length,
    completed: tasks.filter(t => t.status === "completed").length,
    overdue: tasks.filter(t => {
      const due = t.scheduled_date ? new Date(t.scheduled_date) : null;
      return due && due < new Date() && t.status !== "completed";
    }).length,
  };

  return (
    <div className="mobile-tasks" data-testid="mobile-my-tasks">
      {/* Header */}
      <header className="mobile-header">
        <div className="header-content">
          <h1>My Tasks</h1>
          <p className="subtitle">Execute & complete tasks</p>
        </div>
        <div className="header-stats">
          <div className="stat-item">
            <span className="stat-value">{taskStats.total - taskStats.completed}</span>
            <span className="stat-label">Pending</span>
          </div>
          {taskStats.overdue > 0 && (
            <div className="stat-item overdue">
              <span className="stat-value">{taskStats.overdue}</span>
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
            </button>
          ))}
        </div>
      </div>

      {/* Tasks List */}
      <div className="tasks-container">
        {isLoading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <span>Loading tasks...</span>
          </div>
        ) : tasks.length === 0 ? (
          <div className="empty-state">
            <ClipboardList size={48} className="empty-icon" />
            <p>No tasks {filter === "today" ? "for today" : ""}</p>
            <span>You're all caught up!</span>
          </div>
        ) : (
          <div className="tasks-list">
            {tasks.map((task) => {
              const statusConfig = getStatusConfig(task.status, task.scheduled_date);
              const priorityStyle = getPriorityStyle(task.priority);
              const StatusIcon = statusConfig.icon;
              const isSelected = selectedTask === task.id;

              return (
                <div 
                  key={task.id}
                  className={`task-card ${isSelected ? "selected" : ""}`}
                  onClick={() => setSelectedTask(isSelected ? null : task.id)}
                  data-testid={`task-${task.id}`}
                >
                  {/* Status Indicator */}
                  <div 
                    className="status-indicator"
                    style={{ backgroundColor: statusConfig.bg }}
                  >
                    <StatusIcon size={20} color={statusConfig.color} />
                  </div>

                  {/* Task Content */}
                  <div className="task-content">
                    <div className="task-header">
                      <h3 className="task-title">{task.title || task.form_name || "Untitled Task"}</h3>
                      <span 
                        className="priority-badge"
                        style={{ 
                          backgroundColor: priorityStyle.bg, 
                          color: priorityStyle.text,
                          borderColor: priorityStyle.border
                        }}
                      >
                        {task.priority || "Medium"}
                      </span>
                    </div>

                    <div className="task-meta">
                      {task.asset_name && (
                        <span className="meta-item">
                          <Wrench size={12} />
                          {task.asset_name}
                        </span>
                      )}
                      <span className="meta-item">
                        <Calendar size={12} />
                        {formatDate(task.scheduled_date)}
                      </span>
                      {task.is_recurring && (
                        <span className="meta-item recurring">
                          <Repeat size={12} />
                          Recurring
                        </span>
                      )}
                    </div>

                    {task.description && (
                      <p className="task-description">{task.description}</p>
                    )}
                  </div>

                  {/* Action Button */}
                  <button 
                    className="execute-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Handle task execution
                    }}
                  >
                    <Play size={16} fill="currentColor" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        .mobile-tasks {
          min-height: 100%;
          background: #fafafa;
          padding-bottom: 80px;
        }

        .mobile-header {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
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
          opacity: 0.85;
          margin: 4px 0 0 0;
          font-weight: 400;
        }

        .header-stats {
          display: flex;
          gap: 12px;
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
          border-bottom: 1px solid #f0f0f0;
          padding: 12px 16px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .filter-tabs {
          display: flex;
          gap: 8px;
          min-width: max-content;
        }

        .filter-tab {
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
          background: #3b82f6;
          border-color: #3b82f6;
          color: #fff;
        }

        .tasks-container {
          padding: 12px;
        }

        .tasks-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .task-card {
          background: #ffffff;
          border-radius: 16px;
          padding: 16px;
          display: flex;
          align-items: flex-start;
          gap: 14px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
          cursor: pointer;
          transition: all 0.2s;
          border: 1.5px solid transparent;
        }

        .task-card:active {
          transform: scale(0.98);
        }

        .task-card.selected {
          border-color: #3b82f6;
          background: #f8faff;
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

        .task-content {
          flex: 1;
          min-width: 0;
        }

        .task-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 8px;
        }

        .task-title {
          font-size: 15px;
          font-weight: 600;
          margin: 0;
          color: #1f2937;
          line-height: 1.3;
        }

        .priority-badge {
          font-size: 10px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 20px;
          border: 1px solid;
          flex-shrink: 0;
        }

        .task-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 6px;
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: #6b7280;
        }

        .meta-item.recurring {
          color: #8b5cf6;
          font-weight: 500;
        }

        .task-description {
          font-size: 13px;
          color: #6b7280;
          margin: 8px 0 0 0;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .execute-btn {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          border: none;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(34, 197, 94, 0.3);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .execute-btn:active {
          transform: scale(0.9);
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
          border-top-color: #3b82f6;
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

export default MobileMyTasks;
