import { useState } from "react";
import { Plus, ChevronRight, ChevronDown, Trash2, Edit2, MoreVertical, Flag } from "lucide-react";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";

const CAUSE_CATEGORIES = [
  { value: "technical_cause", label: "Technical Cause", bgClass: "bg-blue-100 text-blue-700" },
  { value: "human_factor", label: "Human Factor", bgClass: "bg-purple-100 text-purple-700" },
  { value: "maintenance_issue", label: "Maintenance Issue", bgClass: "bg-orange-100 text-orange-700" },
  { value: "design_issue", label: "Design Issue", bgClass: "bg-red-100 text-red-700" },
  { value: "organizational_factor", label: "Organizational", bgClass: "bg-yellow-100 text-yellow-700" },
  { value: "external_condition", label: "External", bgClass: "bg-green-100 text-green-700" },
];

// Single node renderer (non-recursive)
function SingleCauseNode({ node, depth, hasChildren, isExpanded, onToggle, onEdit, onDelete, onAddChild, onToggleRoot }) {
  const category = CAUSE_CATEGORIES.find(c => c.value === node.category);
  
  return (
    <div 
      className={`flex items-start gap-3 p-3 rounded-lg border mb-2 ${node.is_root_cause ? "bg-red-50 border-red-200" : "bg-white border-slate-200"}`}
      style={{ marginLeft: depth * 24 }}
      data-testid={`cause-node-${node.id}`}
    >
      {hasChildren ? (
        <button onClick={onToggle} className="mt-1 text-slate-400 hover:text-slate-600">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      ) : <div className="w-4" />}
      
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs px-2 py-0.5 rounded-full ${category?.bgClass || "bg-slate-100 text-slate-700"}`}>{category?.label || node.category}</span>
          {node.is_root_cause && <span className="text-xs px-2 py-0.5 rounded-full bg-red-600 text-white font-medium">ROOT CAUSE</span>}
        </div>
        <p className="text-slate-900 text-sm">{node.description}</p>
        {node.evidence && <p className="text-xs text-slate-500 mt-1">Evidence: {node.evidence}</p>}
      </div>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onAddChild(node.id)}><Plus className="w-4 h-4 mr-2" />Add Child</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onToggleRoot(node)}><Flag className="w-4 h-4 mr-2" />{node.is_root_cause ? "Unmark Root" : "Mark Root"}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onEdit(node)}><Edit2 className="w-4 h-4 mr-2" />Edit</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDelete(node.id)} className="text-red-600"><Trash2 className="w-4 h-4 mr-2" />Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Flat tree renderer using iteration instead of recursion
export function CauseTree({ causes, onEdit, onDelete, onAddChild, onToggleRoot }) {
  const [expandedIds, setExpandedIds] = useState(new Set(causes.map(c => c.id)));
  
  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  
  // Build flat render list with depth info
  const renderList = [];
  const addNodesToList = (parentId, depth) => {
    const children = causes.filter(c => c.parent_id === parentId);
    children.forEach(node => {
      const nodeChildren = causes.filter(c => c.parent_id === node.id);
      renderList.push({
        node,
        depth,
        hasChildren: nodeChildren.length > 0,
        isExpanded: expandedIds.has(node.id)
      });
      if (expandedIds.has(node.id)) {
        addNodesToList(node.id, depth + 1);
      }
    });
  };
  
  // Start with root nodes (no parent)
  addNodesToList(null, 0);
  
  return (
    <div>
      {renderList.map(({ node, depth, hasChildren, isExpanded }) => (
        <SingleCauseNode
          key={node.id}
          node={node}
          depth={depth}
          hasChildren={hasChildren}
          isExpanded={isExpanded}
          onToggle={() => toggleExpand(node.id)}
          onEdit={onEdit}
          onDelete={onDelete}
          onAddChild={onAddChild}
          onToggleRoot={onToggleRoot}
        />
      ))}
    </div>
  );
}

export { CAUSE_CATEGORIES };
