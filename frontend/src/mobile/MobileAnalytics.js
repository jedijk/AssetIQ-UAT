import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Activity,
  ClipboardCheck,
  ChevronDown,
  X
} from "lucide-react";
import { format, subDays, subMonths, startOfMonth, endOfMonth } from "date-fns";

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL;

// Fetch functions
const fetchAnalytics = async (token) => {
  const response = await fetch(`${API_BASE_URL}/api/analytics/dashboard`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error("Failed to fetch analytics");
  return response.json();
};

const fetchRiskOverview = async (token) => {
  const response = await fetch(`${API_BASE_URL}/api/analytics/risk-overview`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error("Failed to fetch risk overview");
  return response.json();
};

const fetchStats = async (token) => {
  const response = await fetch(`${API_BASE_URL}/api/stats`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error("Failed to fetch stats");
  return response.json();
};

// Metric Card Component
const MetricCard = ({ icon: Icon, label, value, trend, trendValue, color }) => {
  const isPositive = trend === "up";
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    purple: "bg-purple-50 text-purple-600",
  };

  return (
    <div className="metric-card">
      <div className={`metric-icon ${colorClasses[color]}`}>
        <Icon size={18} />
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      {trendValue && (
        <div className={`metric-trend ${isPositive ? "positive" : "negative"}`}>
          {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          <span>{trendValue}</span>
        </div>
      )}
    </div>
  );
};

// Horizontal Bar Chart Component
const HorizontalBarChart = ({ data, title }) => {
  const maxValue = Math.max(...data.map(d => d.value), 1);
  
  return (
    <div className="chart-container">
      <div className="chart-header">
        <span className="chart-title">{title}</span>
        <span className="chart-period">This year</span>
      </div>
      <div className="bar-chart">
        {data.map((item, index) => (
          <div key={index} className="bar-row">
            <span className="bar-label">{item.label}</span>
            <div className="bar-track">
              <div 
                className="bar-fill"
                style={{ width: `${(item.value / maxValue) * 100}%` }}
              />
            </div>
            <span className="bar-value">{item.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Line Chart Component (simplified SVG)
const TrendLineChart = ({ data, title }) => {
  const [activePoint, setActivePoint] = useState(null);
  
  if (!data || data.length === 0) return null;
  
  const maxValue = Math.max(...data.map(d => d.value), 1);
  const minValue = Math.min(...data.map(d => d.value), 0);
  const range = maxValue - minValue || 1;
  
  const width = 300;
  const height = 120;
  const padding = { top: 20, right: 10, bottom: 30, left: 10 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  const points = data.map((d, i) => ({
    x: padding.left + (i / (data.length - 1)) * chartWidth,
    y: padding.top + chartHeight - ((d.value - minValue) / range) * chartHeight,
    value: d.value,
    label: d.label
  }));
  
  const pathD = points.reduce((acc, point, i) => {
    if (i === 0) return `M ${point.x} ${point.y}`;
    // Smooth curve
    const prev = points[i - 1];
    const cpx = (prev.x + point.x) / 2;
    return `${acc} Q ${cpx} ${prev.y} ${point.x} ${point.y}`;
  }, "");
  
  // Area fill path
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - padding.bottom} L ${padding.left} ${height - padding.bottom} Z`;

  return (
    <div className="chart-container">
      <div className="chart-header">
        <span className="chart-title">{title}</span>
        <span className="chart-period">This year</span>
      </div>
      <div className="line-chart-wrapper">
        <svg viewBox={`0 0 ${width} ${height}`} className="line-chart-svg">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
            <line
              key={i}
              x1={padding.left}
              y1={padding.top + chartHeight * (1 - ratio)}
              x2={width - padding.right}
              y2={padding.top + chartHeight * (1 - ratio)}
              stroke="#e5e7eb"
              strokeWidth="1"
              strokeDasharray="4,4"
            />
          ))}
          
          {/* Area fill */}
          <path
            d={areaD}
            fill="url(#areaGradient)"
            opacity="0.3"
          />
          
          {/* Line */}
          <path
            d={pathD}
            fill="none"
            stroke="#3B82F6"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          
          {/* Data points */}
          {points.map((point, i) => (
            <g key={i}>
              <circle
                cx={point.x}
                cy={point.y}
                r={activePoint === i ? 6 : 4}
                fill="#3B82F6"
                stroke="#fff"
                strokeWidth="2"
                onMouseEnter={() => setActivePoint(i)}
                onMouseLeave={() => setActivePoint(null)}
                style={{ cursor: "pointer" }}
              />
            </g>
          ))}
          
          {/* X-axis labels */}
          {points.map((point, i) => (
            <text
              key={i}
              x={point.x}
              y={height - 8}
              textAnchor="middle"
              fill="#64748b"
              fontSize="10"
            >
              {point.label}
            </text>
          ))}
          
          {/* Gradient definition */}
          <defs>
            <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.05" />
            </linearGradient>
          </defs>
        </svg>
        
        {/* Tooltip */}
        {activePoint !== null && (
          <div 
            className="chart-tooltip"
            style={{
              left: points[activePoint].x,
              top: points[activePoint].y - 40
            }}
          >
            <div className="tooltip-label">{data[activePoint].label}</div>
            <div className="tooltip-value">{data[activePoint].value}</div>
          </div>
        )}
      </div>
    </div>
  );
};

// Date Picker Modal
const DatePickerModal = ({ isOpen, onClose, selectedRange, onSelect }) => {
  const [startDate, setStartDate] = useState(selectedRange?.start || new Date());
  const [endDate, setEndDate] = useState(selectedRange?.end || new Date());
  
  const presets = [
    { label: "Last 7 days", getValue: () => ({ start: subDays(new Date(), 7), end: new Date() }) },
    { label: "Last 30 days", getValue: () => ({ start: subDays(new Date(), 30), end: new Date() }) },
    { label: "This month", getValue: () => ({ start: startOfMonth(new Date()), end: endOfMonth(new Date()) }) },
    { label: "Last 3 months", getValue: () => ({ start: subMonths(new Date(), 3), end: new Date() }) },
    { label: "This year", getValue: () => ({ start: new Date(new Date().getFullYear(), 0, 1), end: new Date() }) },
  ];
  
  if (!isOpen) return null;
  
  return (
    <div className="date-picker-overlay" onClick={onClose}>
      <div className="date-picker-modal" onClick={e => e.stopPropagation()}>
        <div className="date-picker-header">
          <span>Select Date Range</span>
          <button onClick={onClose} className="close-btn">
            <X size={20} />
          </button>
        </div>
        <div className="date-picker-presets">
          {presets.map((preset, i) => (
            <button
              key={i}
              className="preset-btn"
              onClick={() => {
                const range = preset.getValue();
                onSelect(range);
                onClose();
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="date-picker-footer">
          <span className="selected-range">
            {format(startDate, "MMM d, yyyy")} - {format(endDate, "MMM d, yyyy")}
          </span>
        </div>
      </div>
    </div>
  );
};

const MobileAnalytics = () => {
  const token = localStorage.getItem("token");
  const [dateRange, setDateRange] = useState({ 
    start: subMonths(new Date(), 6), 
    end: new Date() 
  });
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Queries
  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ["mobile-analytics"],
    queryFn: () => fetchAnalytics(token),
    enabled: !!token
  });

  const { data: riskData, isLoading: riskLoading } = useQuery({
    queryKey: ["mobile-risk-overview"],
    queryFn: () => fetchRiskOverview(token),
    enabled: !!token
  });

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["mobile-stats"],
    queryFn: () => fetchStats(token),
    enabled: !!token
  });

  const isLoading = analyticsLoading || riskLoading || statsLoading;

  // Process data for charts
  const equipmentRiskData = riskData?.risk_by_category 
    ? Object.entries(riskData.risk_by_category).map(([label, value]) => ({
        label,
        value: Math.round((value / (riskData.total_observations || 1)) * 100)
      })).slice(0, 5)
    : [
        { label: "Pump", value: 32 },
        { label: "Motor", value: 24 },
        { label: "Valve", value: 18 },
        { label: "Compressor", value: 15 },
        { label: "Other", value: 11 }
      ];

  // Mock trend data (in real app, would come from API)
  const trendData = [
    { label: "Jan", value: 12 },
    { label: "Feb", value: 19 },
    { label: "Mar", value: 15 },
    { label: "Apr", value: 25 },
    { label: "May", value: 22 },
    { label: "Jun", value: 30 },
    { label: "Jul", value: 28 }
  ];

  // Metrics
  const totalObservations = statsData?.total_threats || analyticsData?.summary?.total_observations || 81;
  const completedActions = statsData?.completed_actions || analyticsData?.summary?.completed_actions || 10;
  const avgRPN = riskData?.average_rpn || 145;
  const compliance = analyticsData?.task_metrics?.compliance_rate || 78;

  return (
    <div className="mobile-analytics" data-testid="mobile-analytics">
      {/* Header */}
      <div className="analytics-header">
        <h1 className="analytics-title">Analytics</h1>
        <button 
          className="date-picker-trigger"
          onClick={() => setShowDatePicker(true)}
        >
          <Calendar size={18} />
        </button>
      </div>

      {isLoading ? (
        <div className="loading-state">
          <div className="loading-spinner" />
          <span>Loading analytics...</span>
        </div>
      ) : (
        <div className="analytics-content">
          {/* Metrics Grid */}
          <div className="metrics-grid">
            <MetricCard
              icon={AlertTriangle}
              label="Observations"
              value={totalObservations}
              trend="up"
              trendValue="+12%"
              color="blue"
            />
            <MetricCard
              icon={CheckCircle}
              label="Actions Done"
              value={completedActions}
              trend="up"
              trendValue="+5%"
              color="green"
            />
            <MetricCard
              icon={Activity}
              label="Avg RPN"
              value={avgRPN}
              trend="down"
              trendValue="-8%"
              color="amber"
            />
            <MetricCard
              icon={ClipboardCheck}
              label="Compliance"
              value={`${compliance}%`}
              trend="up"
              trendValue="+3%"
              color="purple"
            />
          </div>

          {/* Risk by Equipment Chart */}
          <HorizontalBarChart 
            data={equipmentRiskData}
            title="Risk by Equipment Type"
          />

          {/* Observation Trend Chart */}
          <TrendLineChart 
            data={trendData}
            title="Observation Trend"
          />
        </div>
      )}

      {/* Date Picker Modal */}
      <DatePickerModal
        isOpen={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        selectedRange={dateRange}
        onSelect={setDateRange}
      />

      <style>{`
        .mobile-analytics {
          min-height: 100%;
          background: #F8FAFC;
          padding-bottom: 80px;
        }

        .analytics-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: #ffffff;
          border-bottom: 1px solid #e5e7eb;
          position: sticky;
          top: 0;
          z-index: 10;
        }

        .analytics-title {
          font-size: 24px;
          font-weight: 700;
          color: #1E293B;
          margin: 0;
        }

        .date-picker-trigger {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: #F1F5F9;
          border: none;
          color: #64748B;
          cursor: pointer;
          transition: all 0.2s;
        }

        .date-picker-trigger:active {
          background: #E2E8F0;
          transform: scale(0.95);
        }

        .analytics-content {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        /* Metrics Grid */
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .metric-card {
          background: #ffffff;
          border-radius: 16px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }

        .metric-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .metric-value {
          font-size: 28px;
          font-weight: 700;
          color: #1E293B;
          line-height: 1;
        }

        .metric-label {
          font-size: 13px;
          color: #64748B;
          font-weight: 500;
        }

        .metric-trend {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          font-weight: 600;
        }

        .metric-trend.positive {
          color: #10B981;
        }

        .metric-trend.negative {
          color: #EF4444;
        }

        /* Chart Container */
        .chart-container {
          background: #ffffff;
          border-radius: 16px;
          padding: 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }

        .chart-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .chart-title {
          font-size: 15px;
          font-weight: 600;
          color: #1E293B;
        }

        .chart-period {
          font-size: 12px;
          color: #64748B;
          background: #F1F5F9;
          padding: 4px 10px;
          border-radius: 6px;
        }

        /* Bar Chart */
        .bar-chart {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .bar-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .bar-label {
          width: 80px;
          font-size: 13px;
          color: #64748B;
          flex-shrink: 0;
        }

        .bar-track {
          flex: 1;
          height: 24px;
          background: #F1F5F9;
          border-radius: 6px;
          overflow: hidden;
        }

        .bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #3B82F6 0%, #60A5FA 100%);
          border-radius: 6px;
          transition: width 0.6s ease-out;
        }

        .bar-value {
          width: 40px;
          font-size: 13px;
          font-weight: 600;
          color: #1E293B;
          text-align: right;
        }

        /* Line Chart */
        .line-chart-wrapper {
          position: relative;
          width: 100%;
          overflow: visible;
        }

        .line-chart-svg {
          width: 100%;
          height: auto;
        }

        .chart-tooltip {
          position: absolute;
          transform: translateX(-50%);
          background: #1E293B;
          color: #fff;
          padding: 6px 10px;
          border-radius: 8px;
          font-size: 12px;
          pointer-events: none;
          z-index: 10;
          text-align: center;
        }

        .tooltip-label {
          font-weight: 500;
          opacity: 0.8;
        }

        .tooltip-value {
          font-weight: 700;
        }

        /* Loading State */
        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          gap: 16px;
          color: #64748B;
        }

        .loading-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #E2E8F0;
          border-top-color: #3B82F6;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Date Picker Modal */
        .date-picker-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .date-picker-modal {
          background: #ffffff;
          border-radius: 20px 20px 0 0;
          width: 100%;
          max-width: 400px;
          padding: 20px;
          animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }

        .date-picker-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          font-size: 18px;
          font-weight: 600;
          color: #1E293B;
        }

        .close-btn {
          background: none;
          border: none;
          color: #64748B;
          cursor: pointer;
          padding: 4px;
        }

        .date-picker-presets {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .preset-btn {
          width: 100%;
          padding: 14px 16px;
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          font-size: 15px;
          color: #1E293B;
          cursor: pointer;
          text-align: left;
          transition: all 0.2s;
        }

        .preset-btn:active {
          background: #3B82F6;
          color: #ffffff;
          border-color: #3B82F6;
        }

        .date-picker-footer {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #E2E8F0;
        }

        .selected-range {
          font-size: 13px;
          color: #64748B;
        }
      `}</style>
    </div>
  );
};

export default MobileAnalytics;
