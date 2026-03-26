import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { equipmentHierarchyAPI } from "../lib/api";
import { ChevronRight, ChevronDown, Layers, AlertTriangle, Settings } from "lucide-react";

const MobileHierarchy = () => {
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [selectedNode, setSelectedNode] = useState(null);

  const { data: nodesData = {}, isLoading } = useQuery({
    queryKey: ["equipmentNodes"],
    queryFn: equipmentHierarchyAPI.getNodes,
  });

  const nodes = nodesData.nodes || [];

  const toggleExpand = (nodeId) => {
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
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  };

  const getLevelColor = (level) => {
    const colors = {
      site: "#ef4444",
      area: "#f97316",
      unit: "#eab308",
      equipment: "#22c55e",
      subunit: "#3b82f6",
      component: "#8b5cf6",
    };
    return colors[level] || "#6b7280";
  };

  const getLevelIcon = (level) => {
    if (level === "site" || level === "area") return <Layers size={16} />;
    if (level === "equipment" || level === "subunit") return <Settings size={16} />;
    return <AlertTriangle size={16} />;
  };

  const renderNode = (node, depth = 0) => {
    const children = buildTree(nodes, node.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNode === node.id;

    return (
      <div key={node.id} className="hierarchy-node">
        <button
          onClick={() => {
            setSelectedNode(node.id);
            if (hasChildren) toggleExpand(node.id);
          }}
          className={`node-button ${isSelected ? "selected" : ""}`}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
          data-testid={`hierarchy-node-${node.id}`}
        >
          <span className="expand-icon">
            {hasChildren ? (
              isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />
            ) : (
              <span style={{ width: 18 }} />
            )}
          </span>
          <span 
            className="level-indicator" 
            style={{ backgroundColor: getLevelColor(node.level) }}
          >
            {getLevelIcon(node.level)}
          </span>
          <div className="node-info">
            <span className="node-name">{node.name}</span>
            {node.tag && <span className="node-tag">{node.tag}</span>}
          </div>
          {node.criticality?.level && (
            <span className={`criticality-badge ${node.criticality.level.toLowerCase()}`}>
              {node.criticality.level[0]}
            </span>
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

  const rootNodes = buildTree(nodes, null);

  return (
    <div className="mobile-hierarchy" data-testid="mobile-hierarchy">
      <header className="mobile-header">
        <h1>Equipment Hierarchy</h1>
        <span className="node-count">{nodes.length} items</span>
      </header>

      <div className="hierarchy-list">
        {isLoading ? (
          <div className="loading">Loading hierarchy...</div>
        ) : rootNodes.length === 0 ? (
          <div className="empty">No equipment found</div>
        ) : (
          rootNodes.map((node) => renderNode(node))
        )}
      </div>

      <style>{`
        .mobile-hierarchy {
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

        .node-count {
          font-size: 12px;
          color: #888;
          background: #222;
          padding: 4px 8px;
          border-radius: 12px;
        }

        .hierarchy-list {
          padding: 8px 0;
        }

        .hierarchy-node {
          width: 100%;
        }

        .node-button {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          background: none;
          border: none;
          color: #fff;
          text-align: left;
          cursor: pointer;
          transition: background 0.2s;
        }

        .node-button:hover {
          background: #1a1a1a;
        }

        .node-button.selected {
          background: #1e3a5f;
        }

        .expand-icon {
          color: #666;
          display: flex;
          align-items: center;
        }

        .level-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          color: #fff;
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
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .node-tag {
          font-size: 11px;
          color: #888;
        }

        .criticality-badge {
          font-size: 10px;
          font-weight: 600;
          padding: 4px 8px;
          border-radius: 4px;
          flex-shrink: 0;
        }

        .criticality-badge.critical { background: #7f1d1d; color: #fca5a5; }
        .criticality-badge.high { background: #7c2d12; color: #fdba74; }
        .criticality-badge.medium { background: #713f12; color: #fcd34d; }
        .criticality-badge.low { background: #14532d; color: #86efac; }

        .node-children {
          border-left: 1px solid #333;
          margin-left: 24px;
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

export default MobileHierarchy;
