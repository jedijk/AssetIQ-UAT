import React from "react";

export function InvestigationCausesTab(props) {
  return (
    <>
            {activeTab === "causes" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div><h2 className="text-lg font-semibold">Causal Tree</h2><p className="text-sm text-slate-500">Build cause-and-effect relationships</p></div>
                  <Button onClick={() => { setEditingItem(null); setCauseForm({ description: "", category: "technical_cause", parent_id: null, is_root_cause: false, evidence: "", comment: "" }); setShowCauseDialog(true); }} className="h-11 bg-blue-600 hover:bg-blue-700" data-testid="add-cause-btn" disabled={isInvestigationLocked}><Plus className="w-4 h-4 mr-2" />Add Cause</Button>
                </div>
                
                {causeNodes.length === 0 ? (
                  <div className="empty-state py-16">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                      <GitBranch className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-medium mb-1">No causes identified</h3>
                    <p className="text-sm text-slate-500">Start building the causal tree</p>
                  </div>
                ) : (
                  <CauseTree causes={causeNodes} onEdit={handleEditCause} onDelete={handleDeleteCause} onAddChild={handleAddChildCause} onToggleRoot={handleToggleRootCause} isLocked={isInvestigationLocked} />
                )}
              </div>
            )}
    </>
  );
}
