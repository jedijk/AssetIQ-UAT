import { motion } from "framer-motion";
import { AlertTriangle, Plus, Edit, Trash2, ChevronRight, MessageSquare } from "lucide-react";
import { Button } from "../../components/ui/button";

export function InvestigationFailuresTab({
  failures,
  isLocked,
  onAddFailure,
  onEditFailure,
  onDeleteFailure,
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Failure Identification</h2>
          <p className="text-sm text-slate-500">Define what technically failed</p>
        </div>
        <Button
          onClick={onAddFailure}
          className="h-11 bg-blue-600 hover:bg-blue-700"
          data-testid="add-failure-btn"
          disabled={isLocked}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Failure
        </Button>
      </div>

      {failures.length === 0 ? (
        <div className="empty-state py-16">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium mb-1">No failures identified</h3>
          <p className="text-sm text-slate-500">Document what failed</p>
        </div>
      ) : (
        <div className="priority-list">
          {failures.map((failure, idx) => (
            <motion.div
              key={failure.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="priority-item group"
              data-testid={`failure-item-${failure.id}`}
            >
              <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center bg-red-50">
                <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />
              </div>
              <div className="priority-rank text-sm">#{idx + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-semibold text-sm">{failure.asset_name}</span>
                  {failure.subsystem && (
                    <>
                      <ChevronRight className="w-3 h-3 text-slate-400" />
                      <span className="text-sm text-slate-600">{failure.subsystem}</span>
                    </>
                  )}
                  {failure.component && (
                    <>
                      <ChevronRight className="w-3 h-3 text-slate-400" />
                      <span className="text-sm text-slate-600">{failure.component}</span>
                    </>
                  )}
                  {failure.comment && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      Has comment
                    </span>
                  )}
                </div>
                <div className="text-xs sm:text-sm text-slate-500">
                  <span className="text-red-600 font-medium">{failure.failure_mode}</span>
                  {failure.degradation_mechanism && (
                    <span className="ml-2">• {failure.degradation_mechanism}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => onEditFailure(failure)}
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => onDeleteFailure(failure.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
