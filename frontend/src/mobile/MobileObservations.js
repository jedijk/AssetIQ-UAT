import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { threatsAPI } from "../lib/api";
import { AlertTriangle, Clock, ChevronRight, Filter } from "lucide-react";

const MobileObservations = () => {
  const [filter, setFilter] = useState("all");

  const { data: observations = [], isLoading } = useQuery({
    queryKey: ["threats"],
    queryFn: () => threatsAPI.getAll(),
  });

  const filteredObs = observations.filter((obs) => {
    if (filter === "all") return true;
    if (filter === "open") return obs.status === "Open";
    if (filter === "high") return obs.risk_level === "High" || obs.risk_level === "Critical";
    return true;
  });

  const getRiskColor = (level) => {
    const colors = {
      Critical: "#ef4444",
      High: "#f97316",
      Medium: "#eab308",
      Low: "#22c55e",
    };
    return colors[level] || "#6b7280";
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="mobile-observations" data-testid="mobile-observations">
      <header className="mobile-header">
        <h1>Observations</h1>
        <span className="obs-count">{filteredObs.length}</span>
      </header>

      {/* Filter Tabs */}
      <div className="filter-tabs">
        {[
          { id: "all", label: "All" },
          { id: "open", label: "Open" },
          { id: "high", label: "High Risk" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`filter-tab ${filter === f.id ? "active" : ""}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Observations List */}
      <div className="observations-list">
        {isLoading ? (
          <div className="loading">Loading observations...</div>
        ) : filteredObs.length === 0 ? (
          <div className="empty">No observations found</div>
        ) : (
          filteredObs.map((obs) => (
            <div 
              key={obs.id} 
              className="observation-card"
              data-testid={`observation-${obs.id}`}
            >
              <div className="obs-header">
                <span 
                  className="risk-badge"
                  style={{ backgroundColor: getRiskColor(obs.risk_level) }}
                >
                  {obs.risk_level}
                </span>
                <span className="obs-rank">#{obs.rank}</span>
              </div>
              
              <h3 className="obs-title">{obs.title}</h3>
              
              <div className="obs-details">
                <span className="obs-asset">
                  <AlertTriangle size={12} />
                  {obs.asset}
                </span>
                <span className="obs-time">
                  <Clock size={12} />
                  {formatDate(obs.created_at)}
                </span>
              </div>

              <div className="obs-footer">
                <span className="obs-score">Score: {obs.risk_score}</span>
                <span className={`obs-status ${obs.status.toLowerCase()}`}>
                  {obs.status}
                </span>
              </div>

              <ChevronRight className="obs-chevron" size={20} />
            </div>
          ))
        )}
      </div>

      <style>{`
        .mobile-observations {
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

        .obs-count {
          font-size: 14px;
          color: #888;
          background: #222;
          padding: 4px 12px;
          border-radius: 12px;
        }

        .filter-tabs {
          display: flex;
          gap: 8px;
          padding: 12px 16px;
          background: #111;
          border-bottom: 1px solid #222;
          overflow-x: auto;
        }

        .filter-tab {
          padding: 8px 16px;
          border-radius: 20px;
          border: 1px solid #333;
          background: none;
          color: #888;
          font-size: 13px;
          white-space: nowrap;
          cursor: pointer;
          transition: all 0.2s;
        }

        .filter-tab.active {
          background: #3b82f6;
          border-color: #3b82f6;
          color: #fff;
        }

        .observations-list {
          padding: 8px;
        }

        .observation-card {
          position: relative;
          background: #1a1a1a;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 8px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .observation-card:hover {
          background: #222;
        }

        .obs-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .risk-badge {
          font-size: 11px;
          font-weight: 600;
          padding: 4px 8px;
          border-radius: 4px;
          color: #fff;
        }

        .obs-rank {
          font-size: 12px;
          color: #888;
        }

        .obs-title {
          font-size: 15px;
          font-weight: 500;
          margin: 0 0 8px 0;
          color: #fff;
          padding-right: 24px;
        }

        .obs-details {
          display: flex;
          gap: 16px;
          margin-bottom: 8px;
        }

        .obs-asset, .obs-time {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: #888;
        }

        .obs-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .obs-score {
          font-size: 12px;
          color: #666;
        }

        .obs-status {
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 4px;
          font-weight: 500;
        }

        .obs-status.open {
          background: #1e3a5f;
          color: #60a5fa;
        }

        .obs-status.resolved {
          background: #14532d;
          color: #86efac;
        }

        .obs-chevron {
          position: absolute;
          right: 12px;
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

export default MobileObservations;
