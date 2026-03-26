import React from "react";
import { useQuery } from "@tanstack/react-query";
import { actionsAPI, threatsAPI } from "../lib/api";
import { Bell, AlertTriangle } from "lucide-react";

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
      color: "#dc2626",
      bgColor: "#fef2f2",
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
        color: threat.risk_level === "Critical" ? "#dc2626" : "#ea580c",
        bgColor: threat.risk_level === "Critical" ? "#fef2f2" : "#fff7ed",
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
      bgColor: "#eff6ff",
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
        <div>
          <h1>Notifications</h1>
          <p className="subtitle">Alerts and updates</p>
        </div>
        {overdueActions.length > 0 && (
          <span className="alert-badge">{overdueActions.length}</span>
        )}
      </header>

      <div className="notifications-list">
        {notifications.length === 0 ? (
          <div className="empty-card">
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
                  style={{ backgroundColor: notif.bgColor, color: notif.color }}
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

        .alert-badge {
          background: #dc2626;
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          min-width: 24px;
          height: 24px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 8px;
        }

        .notifications-list {
          padding: 12px;
        }

        .empty-card {
          text-align: center;
          padding: 60px 20px;
          background: #ffffff;
          border-radius: 16px;
        }

        .empty-icon {
          color: #cbd5e1;
          margin-bottom: 16px;
        }

        .empty-card p {
          margin: 0;
          color: #64748b;
          font-weight: 500;
        }

        .empty-card .hint {
          font-size: 13px;
          color: #94a3b8;
          margin-top: 4px;
          font-weight: 400;
        }

        .notification-card {
          display: flex;
          gap: 14px;
          padding: 16px;
          background: #ffffff;
          border-radius: 16px;
          margin-bottom: 10px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }

        .notification-card.overdue {
          border-left: 4px solid #dc2626;
        }

        .notification-card.high_risk {
          border-left: 4px solid #ea580c;
        }

        .notif-icon {
          width: 40px;
          height: 40px;
          border-radius: 12px;
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
          font-size: 11px;
          font-weight: 700;
          margin: 0 0 4px 0;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .notif-message {
          font-size: 14px;
          font-weight: 500;
          color: #0f172a;
          margin: 0 0 6px 0;
          line-height: 1.3;
        }

        .notif-time {
          font-size: 11px;
          color: #94a3b8;
        }
      `}</style>
    </div>
  );
};

export default MobileNotifications;
