import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { TreePine } from "lucide-react";

// Simplified component - the original had babel compilation issues
const ProcessImportWizard = ({ isOpen, onClose, installations = [], onImportComplete }) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TreePine className="w-5 h-5 text-green-600" />
            Import Process Diagram
          </DialogTitle>
          <DialogDescription>
            Upload process documentation and AssetIQ will automatically build an ISO 14224-aligned asset hierarchy.
          </DialogDescription>
        </DialogHeader>
        <div className="p-6 text-center text-slate-500">
          <p>This feature is temporarily unavailable due to a technical issue.</p>
          <p className="text-sm mt-2">Please try again later or contact support.</p>
          <Button className="mt-4" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProcessImportWizard;
