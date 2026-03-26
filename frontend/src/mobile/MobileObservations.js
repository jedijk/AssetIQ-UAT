import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { threatsAPI } from "../lib/api";
import { AlertTriangle, Clock, ChevronRight } from "lucide-react";

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
      Critical: { bg: "#fef2f2", text: "#dc2626" },
      High: { bg: "#fff7ed", text: "#ea580c" },
      Medium: { bg: "#fefce8", text: "#ca8a04" },
      Low: { bg: "#f0fdf4", text: "#16a34a" },
    };
    return colors[level] || { bg: "#f1f5f9", text: "#64748b" };
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
        <div>
          <h1>Observations</h1>
          <p className="subtitle">Risk management status</p>
        </div>
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
          <div className="empty-card">
            <p>No observations found</p>
          </div>
        ) : (
          filteredObs.map((obs) => {
            const riskColors = getRiskColor(obs.risk_level);
            return (
              <div 
                key={obs.id} 
                className="observation-card"
                data-testid={`observation-${obs.id}`}
              >
                <div className="obs-header">
                  <span 
                    className="risk-badge"
                    style={{ backgroundColor: riskColors.bg, color: riskColors.text }}
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

                <ChevronRight className="obs-chevron" size={18} />
              </div>
            );
          })
        )}
      </div>

      <style>{`
        .mobile-observations {
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

        .obs-count {
          font-size: 18px;
          font-weight: 700;
          color: #3b82f6;
          background: #eff6ff;
          padding: 8px 16px;
          border-radius: 12px;
        }

        .filter-tabs {
          display: flex;
          gap: 8px;
          padding: 12px 16px;
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
          overflow-x: auto;
        }

        .filter-tab {
          padding: 8px 16px;
          border-radius: 20px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #64748b;
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          cursor: pointer;
          transition: all 0.2s;
        }

        .filter-tab.active {
          background: #3b82f6;
          border-color: #3b82f6;
          color: #fff;
        }

        .filter-tab:hover:not(.active) {
          border-color: #3b82f6;
          color: #3b82f6;
        }

        .observations-list {
          padding: 12px;
        }

        .observation-card {
          position: relative;
          background: #ffffff;
          border-radius: 16px;
          padding: 16px;
          margin-bottom: 10px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          cursor: pointer;
          transition: box-shadow 0.2s;
        }

        .observation-card:hover {
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .obs-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }

        .risk-badge {
          font-size: 11px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 6px;
        }

        .obs-rank {
          font-size: 12px;
          color: #94a3b8;
          font-weight: 500;
        }

        .obs-title {
          font-size: 15px;
          font-weight: 600;
          margin: 0 0 10px 0;
          color: #0f172a;
          padding-right: 24px;
          line-height: 1.3;
        }

        .obs-details {
          display: flex;
          gap: 16px;
          margin-bottom: 10px;
        }

        .obs-asset, .obs-time {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: #64748b;
        }

        .obs-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .obs-score {
          font-size: 12px;
          color: #94a3b8;
          font-weight: 500;
        }

        .obs-status {
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 6px;
          font-weight: 600;
        }

        .obs-status.open {
          background: #eff6ff;
          color: #3b82f6;
        }

        .obs-status.resolved {
          background: #f0fdf4;
          color: #16a34a;
        }

        .obs-chevron {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #cbd5e1;
        }

        .loading, .empty-card {
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

export default MobileObservations;
