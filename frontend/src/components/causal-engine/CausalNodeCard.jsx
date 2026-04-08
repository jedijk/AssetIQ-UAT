/**
 * CausalNodeCard Component
 * Displays event, failure, or cause nodes in the investigation
 */
import {
  AlertCircle,
  AlertTriangle,
  Lightbulb,
  Calendar,
  Edit,
  Trash2,
  Link,
  Plus,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { formatDate } from "../../lib/dateUtils";

const nodeTypeConfig = {
  event: {
    icon: Calendar,
    color: "bg-blue-100 text-blue-700 border-blue-200",
    bgColor: "bg-blue-50",
    iconColor: "text-blue-600",
  },
  failure: {
    icon: AlertCircle,
    color: "bg-red-100 text-red-700 border-red-200",
    bgColor: "bg-red-50",
    iconColor: "text-red-600",
  },
  cause: {
    icon: Lightbulb,
    color: "bg-amber-100 text-amber-700 border-amber-200",
    bgColor: "bg-amber-50",
    iconColor: "text-amber-600",
  },
  root_cause: {
    icon: AlertTriangle,
    color: "bg-purple-100 text-purple-700 border-purple-200",
    bgColor: "bg-purple-50",
    iconColor: "text-purple-600",
  },
};

export const CausalNodeCard = ({
  node,
  type = "event",
  onEdit,
  onDelete,
  onAddChild,
  onLink,
  isSelected = false,
  showActions = true,
  t,
}) => {
  const config = nodeTypeConfig[type] || nodeTypeConfig.event;
  const NodeIcon = config.icon;

  return (
    <div
      className={`border rounded-lg p-3 transition-all ${config.bgColor} ${
        isSelected ? "ring-2 ring-offset-2 ring-violet-500" : ""
      }`}
      data-testid={`causal-node-${node.id}`}
    >
      <div className="flex items-start gap-3">
        <div className={`h-8 w-8 rounded-lg ${config.color} flex items-center justify-center flex-shrink-0`}>
          <NodeIcon className={`h-4 w-4 ${config.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-slate-900 text-sm">{node.title || node.description?.slice(0, 50)}</h4>
          {node.description && node.description !== node.title && (
            <p className="text-xs text-slate-600 mt-1 line-clamp-2">{node.description}</p>
          )}
          
          {/* Meta info */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {node.timestamp && (
              <Badge variant="outline" className="text-xs">
                <Calendar className="w-3 h-3 mr-1" />
                {formatDate(node.timestamp)}
              </Badge>
            )}
            {node.category && (
              <Badge variant="outline" className="text-xs capitalize">
                {node.category.replace(/_/g, " ")}
              </Badge>
            )}
            {node.is_root_cause && (
              <Badge className="text-xs bg-purple-100 text-purple-700">
                Root Cause
              </Badge>
            )}
            {node.probability && (
              <Badge variant="outline" className="text-xs">
                {node.probability}% likely
              </Badge>
            )}
          </div>
        </div>

        {/* Actions */}
        {showActions && (
          <div className="flex items-center gap-1">
            {onAddChild && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddChild(node);
                }}
                title={t?.("causal.addChild") || "Add child"}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
            {onLink && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  onLink(node);
                }}
                title={t?.("causal.linkNode") || "Link to"}
              >
                <Link className="h-3.5 w-3.5" />
              </Button>
            )}
            {onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(node);
                }}
              >
                <Edit className="h-3.5 w-3.5" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-red-600"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(node);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CausalNodeCard;
