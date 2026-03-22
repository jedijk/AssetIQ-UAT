/**
 * CollapsibleSection - Expandable/collapsible section with icon and count
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

const CollapsibleSection = ({ 
  title, 
  icon: Icon, 
  children, 
  defaultOpen = false, 
  count = 0, 
  color = "slate", 
  onAdd, 
  addLabel = "Add" 
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between p-2 bg-${color}-50 hover:bg-${color}-100 transition-colors text-left`}
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 text-${color}-600`} />
          <span className="font-medium text-sm text-slate-700">{title}</span>
          {count > 0 && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0">{count}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onAdd && (
            <Button size="sm" variant="ghost" className="h-6 px-2" onClick={(e) => { e.stopPropagation(); onAdd(); }}>
              <Plus className="w-3 h-3 mr-1" />{addLabel}
            </Button>
          )}
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-2 space-y-2 text-sm">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CollapsibleSection;
