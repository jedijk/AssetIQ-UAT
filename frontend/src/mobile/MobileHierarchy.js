import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { equipmentHierarchyAPI } from "../lib/api";
import { ChevronRight, ChevronDown, Layers, Settings, Circle } from "lucide-react";

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
    return colors[level] || "#94a3b8";
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
          style={{ paddingLeft: `${depth * 16 + 16}px` }}
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
            className="level-dot" 
            style={{ backgroundColor: getLevelColor(node.level) }}
          />
          <div className="node-info">
            <span className="node-name">{node.name}</span>
            {node.tag && <span className="node-tag">{node.tag}</span>}
          </div>
          {node.criticality?.level && (
            <span className={`criticality-badge ${node.criticality.level.toLowerCase()}`}>
              {node.criticality.level}
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
        <div>
          <h1>Hierarchy</h1>
          <p className="subtitle">Equipment structure</p>
        </div>
        <span className="node-count">{nodes.length} items</span>
      </header>

      <div className="hierarchy-container">
        <div className="hierarchy-card">
          {isLoading ? (
            <div className="loading">Loading hierarchy...</div>
          ) : rootNodes.length === 0 ? (
            <div className="empty">No equipment found</div>
          ) : (
            rootNodes.map((node) => renderNode(node))
          )}
        </div>
      </div>

      <style>{`
        .mobile-hierarchy {
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

        .node-count {
          font-size: 12px;
          font-weight: 500;
          color: #3b82f6;
          background: #eff6ff;
          padding: 6px 12px;
          border-radius: 20px;
        }

        .hierarchy-container {
          padding: 12px;
        }

        .hierarchy-card {
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          overflow: hidden;
        }

        .hierarchy-node {
          width: 100%;
        }

        .node-button {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px;
          background: none;
          border: none;
          border-bottom: 1px solid #f1f5f9;
          color: #1e293b;
          text-align: left;
          cursor: pointer;
          transition: background 0.2s;
        }

        .node-button:hover {
          background: #f8fafc;
        }

        .node-button.selected {
          background: #eff6ff;
        }

        .expand-icon {
          color: #94a3b8;
          display: flex;
          align-items: center;
        }

        .level-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
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
          color: #1e293b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .node-tag {
          font-size: 11px;
          color: #64748b;
        }

        .criticality-badge {
          font-size: 10px;
          font-weight: 600;
          padding: 4px 8px;
          border-radius: 6px;
          flex-shrink: 0;
        }

        .criticality-badge.critical { background: #fef2f2; color: #dc2626; }
        .criticality-badge.high { background: #fff7ed; color: #ea580c; }
        .criticality-badge.medium { background: #fefce8; color: #ca8a04; }
        .criticality-badge.low { background: #f0fdf4; color: #16a34a; }

        .node-children {
          background: #fafafa;
        }

        .loading, .empty {
          text-align: center;
          padding: 40px 20px;
          color: #64748b;
        }
      `}</style>
    </div>
  );
};

export default MobileHierarchy;
