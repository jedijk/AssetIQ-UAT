import React from "react";
import { useQuery } from "@tanstack/react-query";
import { actionsAPI, threatsAPI } from "../lib/api";
import { Bell, AlertTriangle, CheckCircle, Clock, Info } from "lucide-react";

const MobileNotifications = () => {
  const { data: overdueData = {} } = useQuery({
    queryKey: ["overdueActions"],
    queryFn: actionsAPI.getOverdue,
  });

  const overdueActions = overdueData.overdue_actions || [];

  const { data: threats = [] } = useQuery({
    queryKey: ["threats"],
    queryFn: () => threatsAPI.getAll(),
  });

  // Generate notifications from various sources
  const notifications = [
    // Overdue actions
    ...overdueActions.map((action) => ({
      id: `overdue-${action.id}`,
      type: "overdue",
      title: "Action Overdue",
      message: action.title || action.description,
      time: action.due_date,
      icon: AlertTriangle,
      color: "#ef4444",
    })),
    // High risk observations
    ...threats
      .filter((t) => t.risk_level === "High" || t.risk_level === "Critical")
      .slice(0, 5)
      .map((threat) => ({
        id: `threat-${threat.id}`,
        type: "high_risk",
        title: `${threat.risk_level} Risk Observation`,
        message: threat.title,
        time: threat.created_at,
        icon: AlertTriangle,
        color: threat.risk_level === "Critical" ? "#ef4444" : "#f97316",
      })),
    // Recent observations
    ...threats.slice(0, 3).map((threat) => ({
      id: `new-${threat.id}`,
      type: "new_observation",
      title: "New Observation",
      message: threat.title,
      time: threat.created_at,
      icon: Bell,
      color: "#3b82f6",
    })),
  ];

  // Sort by time (most recent first)
  notifications.sort((a, b) => new Date(b.time) - new Date(a.time));

  const formatTime = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 0) return "Upcoming";
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="mobile-notifications" data-testid="mobile-notifications">
      <header className="mobile-header">
        <h1>Notifications</h1>
        {overdueActions.length > 0 && (
          <span className="alert-badge">{overdueActions.length}</span>
        )}
      </header>

      <div className="notifications-list">
        {notifications.length === 0 ? (
          <div className="empty">
            <Bell size={40} className="empty-icon" />
            <p>No notifications</p>
            <p className="hint">You're all caught up!</p>
          </div>
        ) : (
          notifications.map((notif) => {
            const Icon = notif.icon;
            return (
              <div
                key={notif.id}
                className={`notification-card ${notif.type}`}
                data-testid={`notification-${notif.id}`}
              >
                <div
                  className="notif-icon"
                  style={{ backgroundColor: `${notif.color}20`, color: notif.color }}
                >
                  <Icon size={18} />
                </div>
                <div className="notif-content">
                  <p className="notif-title" style={{ color: notif.color }}>
                    {notif.title}
                  </p>
                  <p className="notif-message">{notif.message}</p>
                  <span className="notif-time">{formatTime(notif.time)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <style>{`
        .mobile-notifications {
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

        .alert-badge {
          background: #ef4444;
          color: #fff;
          font-size: 12px;
          font-weight: 600;
          min-width: 20px;
          height: 20px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 6px;
        }

        .notifications-list {
          padding: 8px;
        }

        .empty {
          text-align: center;
          padding: 60px 20px;
          color: #888;
        }

        .empty-icon {
          color: #444;
          margin-bottom: 16px;
        }

        .empty p {
          margin: 0;
        }

        .empty .hint {
          font-size: 13px;
          color: #666;
          margin-top: 4px;
        }

        .notification-card {
          display: flex;
          gap: 12px;
          padding: 14px;
          background: #1a1a1a;
          border-radius: 12px;
          margin-bottom: 8px;
        }

        .notification-card.overdue {
          border-left: 3px solid #ef4444;
        }

        .notification-card.high_risk {
          border-left: 3px solid #f97316;
        }

        .notif-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .notif-content {
          flex: 1;
          min-width: 0;
        }

        .notif-title {
          font-size: 12px;
          font-weight: 600;
          margin: 0 0 4px 0;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .notif-message {
          font-size: 14px;
          color: #fff;
          margin: 0 0 6px 0;
          line-height: 1.3;
        }

        .notif-time {
          font-size: 11px;
          color: #666;
        }
      `}</style>
    </div>
  );
};

export default MobileNotifications;
