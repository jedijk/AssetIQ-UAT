import { createContext, useContext, useState, useCallback } from "react";
import { toast } from "sonner";

const UndoContext = createContext(null);

const MAX_UNDO_ACTIONS = 5;

export const UndoProvider = ({ children }) => {
  const [undoStack, setUndoStack] = useState([]);
  const [isUndoing, setIsUndoing] = useState(false);

  // Add an action to the undo stack
  const pushUndo = useCallback((action) => {
    /*
      action shape:
      {
        type: string,          // e.g., 'DELETE_THREAT', 'UPDATE_THREAT', 'CREATE_NODE'
        label: string,         // Human-readable label, e.g., "Delete threat"
        undo: async () => {},  // Function to reverse the action
        data: any,             // Optional: data for reference
        timestamp: Date,       // Auto-added
      }
    */
    const actionWithTimestamp = {
      ...action,
      timestamp: new Date(),
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    setUndoStack((prev) => {
      const newStack = [actionWithTimestamp, ...prev];
      // Keep only the last MAX_UNDO_ACTIONS
      return newStack.slice(0, MAX_UNDO_ACTIONS);
    });
  }, []);

  // Undo the last action
  const undo = useCallback(async () => {
    if (undoStack.length === 0 || isUndoing) return false;

    setIsUndoing(true);
    const lastAction = undoStack[0];

    try {
      await lastAction.undo();
      setUndoStack((prev) => prev.slice(1));
      toast.success(`Undone: ${lastAction.label}`);
      return true;
    } catch (error) {
      console.error("Undo failed:", error);
      toast.error(`Failed to undo: ${lastAction.label}`);
      return false;
    } finally {
      setIsUndoing(false);
    }
  }, [undoStack, isUndoing]);

  // Clear the undo stack
  const clearUndo = useCallback(() => {
    setUndoStack([]);
  }, []);

  // Get the last action (for display purposes)
  const getLastAction = useCallback(() => {
    return undoStack.length > 0 ? undoStack[0] : null;
  }, [undoStack]);

  // Check if undo is available
  const canUndo = undoStack.length > 0 && !isUndoing;

  const value = {
    undoStack,
    pushUndo,
    undo,
    clearUndo,
    getLastAction,
    canUndo,
    isUndoing,
    undoCount: undoStack.length,
  };

  return <UndoContext.Provider value={value}>{children}</UndoContext.Provider>;
};

export const useUndo = () => {
  const context = useContext(UndoContext);
  if (!context) {
    throw new Error("useUndo must be used within an UndoProvider");
  }
  return context;
};

export default UndoContext;
