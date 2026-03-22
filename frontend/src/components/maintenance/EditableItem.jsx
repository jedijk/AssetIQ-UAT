/**
 * EditableItem - Card with hover edit/delete buttons
 */
import { Edit2, X } from "lucide-react";
import { Button } from "../ui/button";

const EditableItem = ({ children, onEdit, onDelete }) => {
  return (
    <div className="group relative p-2 pr-14 bg-white border rounded hover:border-indigo-300 transition-colors">
      {children}
      <div className="absolute top-1.5 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 bg-white/90 rounded">
        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={onEdit}>
          <Edit2 className="w-3 h-3" />
        </Button>
        <Button size="icon" variant="ghost" className="h-5 w-5 text-red-500 hover:text-red-700" onClick={onDelete}>
          <X className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
};

export default EditableItem;
