import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { threatsAPI } from "../lib/api";
import { 
  AlertTriangle, 
  Clock, 
  ChevronRight, 
  Filter,
  Search,
  MapPin,
  TrendingUp,
  Eye
} from "lucide-react";

const MobileObservations = () => {
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: observations = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["threats"],
    queryFn: () => threatsAPI.getAll(),
    retry: 2,
    staleTime: 60 * 1000,
  });

  const filteredObs = observations.filter((obs) => {
    const matchesFilter = 
      filter === "all" ? true :
      filter === "open" ? obs.status === "Open" :
      filter === "high" ? (obs.risk_level === "High" || obs.risk_level === "Critical") :
      true;
    
    const matchesSearch = !searchQuery || 
      obs.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      obs.asset?.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesFilter && matchesSearch;
  });

  const getRiskConfig = (level) => {
    const configs = {
      Critical: { color: "#dc2626", bg: "#fef2f2", gradient: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)" },
      High: { color: "#ea580c", bg: "#fff7ed", gradient: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)" },
      Medium: { color: "#ca8a04", bg: "#fefce8", gradient: "linear-gradient(135deg, #eab308 0%, #ca8a04 100%)" },
      Low: { color: "#16a34a", bg: "#f0fdf4", gradient: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)" },
    };
    return configs[level] || configs.Medium;
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
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const stats = {
    total: observations.length,
    open: observations.filter(o => o.status === "Open").length,
    critical: observations.filter(o => o.risk_level === "Critical" || o.risk_level === "High").length,
  };

  const filterTabs = [
    { id: "all", label: "All", count: stats.total },
    { id: "open", label: "Open", count: stats.open },
    { id: "high", label: "High Risk", count: stats.critical },
  ];

  return (
    <div className="mobile-observations" data-testid="mobile-observations">
      {/* Header */}
      <header className="mobile-header">
        <div className="header-content">
          <h1>Observations</h1>
          <p className="subtitle">Risk monitoring & tracking</p>
        </div>
        <div className="header-badge">
          <span className="badge-count">{stats.open}</span>
          <span className="badge-label">Open</span>
        </div>
      </header>

      {/* Search Bar */}
      <div className="search-section">
        <div className="search-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search observations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

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
              <span className="tab-count">{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Observations List */}
      <div className="observations-container">
        {isLoading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <span>Loading observations...</span>
          </div>
        ) : isError ? (
          <div className="empty-state">
            <Eye size={48} className="empty-icon" />
            <p>Could not load observations</p>
            <span>Check your connection and try again.</span>
            <button
              type="button"
              className="retry-btn"
              onClick={() => refetch()}
              style={{ marginTop: "12px", padding: "8px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#fff" }}
            >
              Retry
            </button>
          </div>
        ) : filteredObs.length === 0 ? (
          <div className="empty-state">
            <Eye size={48} className="empty-icon" />
            <p>No observations found</p>
            <span>Report new observations via the + button</span>
          </div>
        ) : (
          <div className="observations-list">
            {filteredObs.map((obs) => {
              const riskConfig = getRiskConfig(obs.risk_level);
              return (
                <div 
                  key={obs.id} 
                  className="observation-card"
                  data-testid={`observation-${obs.id}`}
                >
                  {/* Risk Indicator */}
                  <div 
                    className="risk-indicator"
                    style={{ background: riskConfig.gradient }}
                  >
                    <span className="risk-score">{obs.risk_score || "-"}</span>
                  </div>

                  {/* Content */}
                  <div className="obs-content">
                    <div className="obs-header">
                      <span 
                        className="risk-badge"
                        style={{ backgroundColor: riskConfig.bg, color: riskConfig.color }}
                      >
                        {obs.risk_level}
                      </span>
                      <span className="obs-rank">#{obs.rank}</span>
                    </div>
                    
                    <h3 className="obs-title">{obs.title}</h3>
                    
                    <div className="obs-meta">
                      <span className="meta-item">
                        <MapPin size={12} />
                        {obs.asset || "Unassigned"}
                      </span>
                      <span className="meta-item">
                        <Clock size={12} />
                        {formatDate(obs.created_at)}
                      </span>
                    </div>

                    {obs.failure_mode && (
                      <div className="failure-mode">
                        <AlertTriangle size={12} />
                        {obs.failure_mode}
                        {obs.is_new_failure_mode && (
                          <span className="new-badge">NEW</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Status & Arrow */}
                  <div className="obs-right">
                    <span className={`status-badge ${obs.status?.toLowerCase()}`}>
                      {obs.status}
                    </span>
                    <ChevronRight size={18} className="chevron" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        .mobile-observations {
          min-height: 100%;
          background: #fafafa;
          padding-bottom: 80px;
        }

        .mobile-header {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
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

        .header-badge {
          background: rgba(255,255,255,0.2);
          border-radius: 12px;
          padding: 10px 14px;
          text-align: center;
          backdrop-filter: blur(10px);
        }

        .badge-count {
          display: block;
          font-size: 22px;
          font-weight: 700;
        }

        .badge-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          opacity: 0.9;
        }

        .search-section {
          background: #ffffff;
          padding: 16px;
          border-bottom: 1px solid #f0f0f0;
        }

        .search-wrapper {
          position: relative;
        }

        .search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #9ca3af;
        }

        .search-input {
          width: 100%;
          padding: 12px 12px 12px 44px;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          font-size: 15px;
          background: #f9fafb;
          color: #1f2937;
          transition: all 0.2s;
        }

        .search-input:focus {
          outline: none;
          border-color: #f59e0b;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
        }

        .filter-section {
          background: #ffffff;
          padding: 0 16px 12px;
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
          padding: 10px 16px;
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
          background: #f59e0b;
          border-color: #f59e0b;
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

        .observations-container {
          padding: 12px;
        }

        .observations-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .observation-card {
          background: #ffffff;
          border-radius: 16px;
          padding: 14px;
          display: flex;
          align-items: flex-start;
          gap: 14px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
          cursor: pointer;
          transition: all 0.2s;
        }

        .observation-card:active {
          transform: scale(0.98);
        }

        .risk-indicator {
          width: 46px;
          height: 46px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: white;
        }

        .risk-score {
          font-size: 16px;
          font-weight: 700;
        }

        .obs-content {
          flex: 1;
          min-width: 0;
        }

        .obs-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        }

        .risk-badge {
          font-size: 10px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 20px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .obs-rank {
          font-size: 12px;
          color: #9ca3af;
          font-weight: 500;
        }

        .obs-title {
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

        .obs-meta {
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

        .failure-mode {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #9333ea;
          font-weight: 500;
          margin-top: 6px;
        }

        .new-badge {
          font-size: 9px;
          font-weight: 700;
          padding: 2px 6px;
          background: #dcfce7;
          color: #16a34a;
          border-radius: 4px;
        }

        .obs-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
          flex-shrink: 0;
        }

        .status-badge {
          font-size: 10px;
          font-weight: 600;
          padding: 5px 10px;
          border-radius: 20px;
        }

        .status-badge.open {
          background: #eff6ff;
          color: #2563eb;
        }

        .status-badge.resolved {
          background: #f0fdf4;
          color: #16a34a;
        }

        .status-badge.closed {
          background: #f1f5f9;
          color: #64748b;
        }

        .chevron {
          color: #d1d5db;
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
          border-top-color: #f59e0b;
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

export default MobileObservations;
