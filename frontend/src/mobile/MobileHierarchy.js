import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { equipmentHierarchyAPI } from "../lib/api";
import { 
  ChevronRight, 
  ChevronDown, 
  Search, 
  Building2, 
  Factory, 
  Layers, 
  Cpu, 
  Settings,
  CircleDot,
  Filter
} from "lucide-react";

const MobileHierarchy = () => {
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [selectedNode, setSelectedNode] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: nodesData = {}, isLoading } = useQuery({
    queryKey: ["equipmentNodes"],
    queryFn: equipmentHierarchyAPI.getNodes,
  });

  const nodes = nodesData.nodes || [];

  const toggleExpand = (nodeId, e) => {
    e.stopPropagation();
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const buildTree = (nodes, parentId = null) => {
    return nodes
      .filter((n) => n.parent_id === parentId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (a.name || "").localeCompare(b.name || ""));
  };

  const getLevelConfig = (level) => {
    const configs = {
      installation: { icon: Building2, color: "#8b5cf6", bg: "#f5f3ff", label: "Installation" },
      plant_unit: { icon: Factory, color: "#3b82f6", bg: "#eff6ff", label: "Plant Unit" },
      section_system: { icon: Layers, color: "#06b6d4", bg: "#ecfeff", label: "Section" },
      equipment_unit: { icon: Settings, color: "#f59e0b", bg: "#fffbeb", label: "Equipment" },
      equipment: { icon: Cpu, color: "#22c55e", bg: "#f0fdf4", label: "Equipment" },
      subunit: { icon: CircleDot, color: "#ec4899", bg: "#fdf2f8", label: "Subunit" },
      maintainable_item: { icon: CircleDot, color: "#64748b", bg: "#f8fafc", label: "M. Item" },
    };
    return configs[level] || configs.equipment;
  };

  const filteredNodes = searchQuery
    ? nodes.filter(n => n.name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : nodes;

  const renderNode = (node, depth = 0) => {
    const children = buildTree(nodes, node.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNode === node.id;
    const config = getLevelConfig(node.level);
    const Icon = config.icon;

    return (
      <div key={node.id} className="hierarchy-node">
        <button
          onClick={() => setSelectedNode(isSelected ? null : node.id)}
          className={`node-button ${isSelected ? "selected" : ""}`}
          style={{ paddingLeft: `${depth * 20 + 16}px` }}
          data-testid={`hierarchy-node-${node.id}`}
        >
          <span 
            className="expand-icon"
            onClick={(e) => hasChildren && toggleExpand(node.id, e)}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />
            ) : (
              <span style={{ width: 18 }} />
            )}
          </span>
          
          <div 
            className="level-icon"
            style={{ backgroundColor: config.bg }}
          >
            <Icon size={16} color={config.color} />
          </div>
          
          <div className="node-info">
            <span className="node-name">{node.name}</span>
            <span className="node-level" style={{ color: config.color }}>{config.label}</span>
          </div>
          
          {node.process_step && (
            <span className="process-badge">{node.process_step}</span>
          )}
        </button>

        {hasChildren && isExpanded && (
          <div className="node-children">
            {children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const rootNodes = buildTree(searchQuery ? filteredNodes : nodes, null);
  const flatResults = searchQuery ? filteredNodes : [];

  return (
    <div className="mobile-hierarchy" data-testid="mobile-hierarchy">
      {/* Header */}
      <header className="mobile-header">
        <div className="header-content">
          <h1>Equipment</h1>
          <p className="subtitle">Asset Hierarchy</p>
        </div>
        <div className="header-badge">
          <span className="badge-count">{nodes.length}</span>
          <span className="badge-label">Assets</span>
        </div>
      </header>

      {/* Search Bar */}
      <div className="search-section">
        <div className="search-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search equipment..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
        <button className="filter-btn">
          <Filter size={18} />
        </button>
      </div>

      {/* Hierarchy Tree */}
      <div className="hierarchy-container">
        {isLoading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <span>Loading hierarchy...</span>
          </div>
        ) : searchQuery && flatResults.length > 0 ? (
          <div className="search-results">
            {flatResults.map((node) => {
              const config = getLevelConfig(node.level);
              const Icon = config.icon;
              return (
                <button
                  key={node.id}
                  className={`search-result-item ${selectedNode === node.id ? "selected" : ""}`}
                  onClick={() => setSelectedNode(node.id)}
                >
                  <div className="level-icon" style={{ backgroundColor: config.bg }}>
                    <Icon size={16} color={config.color} />
                  </div>
                  <div className="result-info">
                    <span className="node-name">{node.name}</span>
                    <span className="node-level" style={{ color: config.color }}>{config.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : rootNodes.length === 0 ? (
          <div className="empty-state">
            <Building2 size={48} className="empty-icon" />
            <p>No equipment found</p>
            <span>Add equipment from the web app</span>
          </div>
        ) : (
          <div className="hierarchy-tree">
            {rootNodes.map((node) => renderNode(node))}
          </div>
        )}
      </div>

      {/* Selected Node Details */}
      {selectedNode && (
        <div className="node-details-panel">
          {(() => {
            const node = nodes.find(n => n.id === selectedNode);
            if (!node) return null;
            const config = getLevelConfig(node.level);
            return (
              <>
                <div className="details-header" style={{ borderColor: config.color }}>
                  <span className="details-level" style={{ color: config.color }}>{config.label}</span>
                  <h3>{node.name}</h3>
                </div>
                <div className="details-body">
                  {node.process_step && (
                    <div className="detail-row">
                      <span className="detail-label">Process Step</span>
                      <span className="detail-value">{node.process_step}</span>
                    </div>
                  )}
                  {node.description && (
                    <div className="detail-row">
                      <span className="detail-label">Description</span>
                      <span className="detail-value">{node.description}</span>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      <style>{`
        .mobile-hierarchy {
          min-height: 100%;
          background: #fafafa;
          padding-bottom: 80px;
        }

        .mobile-header {
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
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

        .header-badge {
          background: rgba(255,255,255,0.2);
          border-radius: 12px;
          padding: 10px 14px;
          text-align: center;
          backdrop-filter: blur(10px);
        }

        .badge-count {
          display: block;
          font-size: 20px;
          font-weight: 700;
        }

        .badge-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          opacity: 0.9;
        }

        .search-section {
          display: flex;
          gap: 10px;
          padding: 16px;
          background: #ffffff;
          border-bottom: 1px solid #f0f0f0;
        }

        .search-wrapper {
          flex: 1;
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
          border-color: #8b5cf6;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
        }

        .search-input::placeholder {
          color: #9ca3af;
        }

        .filter-btn {
          padding: 12px;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          background: #ffffff;
          color: #6b7280;
          cursor: pointer;
        }

        .hierarchy-container {
          padding: 12px;
        }

        .hierarchy-tree {
          background: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }

        .hierarchy-node {
          width: 100%;
        }

        .node-button {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: none;
          border: none;
          border-bottom: 1px solid #f5f5f5;
          color: #1f2937;
          text-align: left;
          cursor: pointer;
          transition: background 0.15s;
        }

        .node-button:active {
          background: #f9fafb;
        }

        .node-button.selected {
          background: #f5f3ff;
        }

        .expand-icon {
          color: #9ca3af;
          display: flex;
          align-items: center;
          padding: 4px;
          margin: -4px;
        }

        .level-icon {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .node-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .node-name {
          font-size: 14px;
          font-weight: 600;
          color: #1f2937;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .node-level {
          font-size: 11px;
          font-weight: 500;
        }

        .process-badge {
          font-size: 10px;
          font-weight: 600;
          padding: 4px 10px;
          background: #fef3c7;
          color: #b45309;
          border-radius: 20px;
          flex-shrink: 0;
        }

        .node-children {
          background: #fafafa;
        }

        .search-results {
          background: #ffffff;
          border-radius: 16px;
          overflow: hidden;
        }

        .search-result-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: none;
          border: none;
          border-bottom: 1px solid #f5f5f5;
          cursor: pointer;
          text-align: left;
        }

        .search-result-item.selected {
          background: #f5f3ff;
        }

        .result-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
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
          border-top-color: #8b5cf6;
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

        .node-details-panel {
          position: fixed;
          bottom: 70px;
          left: 12px;
          right: 12px;
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 -4px 20px rgba(0,0,0,0.15);
          overflow: hidden;
          animation: slideUp 0.25s ease-out;
        }

        @keyframes slideUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .details-header {
          padding: 16px;
          border-left: 4px solid;
        }

        .details-level {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .details-header h3 {
          font-size: 16px;
          font-weight: 700;
          margin: 4px 0 0 0;
          color: #1f2937;
        }

        .details-body {
          padding: 0 16px 16px;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          border-top: 1px solid #f5f5f5;
        }

        .detail-label {
          font-size: 13px;
          color: #6b7280;
        }

        .detail-value {
          font-size: 13px;
          font-weight: 600;
          color: #1f2937;
        }
      `}</style>
    </div>
  );
};

export default MobileHierarchy;
