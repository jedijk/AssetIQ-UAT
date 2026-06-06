import React from "react";

export function CausalEngineDialogs(props) {
  return (
    <>
      {/* Validate Action Dialog */}
      <Dialog open={showValidateDialog} onOpenChange={setShowValidateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-green-600" />
              Validate Action
            </DialogTitle>
            <DialogDescription>
              Confirm this action has been reviewed and approved by a subject matter expert.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {actionToValidate && (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-sm font-medium text-slate-700">{actionToValidate.title}</p>
                {actionToValidate.action_type && (
                  <Badge className={`mt-2 text-[10px] ${
                    actionToValidate.action_type === 'CM' ? 'bg-amber-100 text-amber-700' :
                    actionToValidate.action_type === 'PM' ? 'bg-blue-100 text-blue-700' :
                    'bg-purple-100 text-purple-700'
                  }`}>
                    {actionToValidate.action_type}
                  </Badge>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="inv-validator-name">Validator Name *</Label>
              <Input
                id="inv-validator-name"
                value={validatorName}
                onChange={(e) => setValidatorName(e.target.value)}
                placeholder="e.g., John Smith"
                data-testid="inv-validator-name-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-validator-position">Position / Role *</Label>
              <Input
                id="inv-validator-position"
                value={validatorPosition}
                onChange={(e) => setValidatorPosition(e.target.value)}
                placeholder="e.g., Reliability Engineer"
                data-testid="inv-validator-position-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowValidateDialog(false);
                setActionToValidate(null);
                setValidatorName("");
                setValidatorPosition("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleValidateAction}
              disabled={validateActionMutation.isPending || !validatorName.trim() || !validatorPosition.trim()}
              className="bg-green-600 hover:bg-green-700"
              data-testid="inv-confirm-validate-button"
            >
              {validateActionMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <ShieldCheck className="w-4 h-4 mr-2" />
              )}
              Confirm Validation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Dialogs */}
      <NewInvestigationDialog
        open={showNewInvDialog}
        onOpenChange={setShowNewInvDialog}
        form={newInvForm}
        setForm={setNewInvForm}
        onSubmit={() => createInvMutation.mutate(newInvForm)}
        isPending={createInvMutation.isPending}
        users={users}
      />
      
      <EventDialog
        open={showEventDialog}
        onOpenChange={(open) => { setShowEventDialog(open); if (!open) setEditingItem(null); }}
        editingItem={editingItem}
        form={eventForm}
        setForm={setEventForm}
        onSubmit={() => { if (editingItem?.type === "event") updateEventMutation.mutate({ eventId: editingItem.data.id, data: eventForm }); else createEventMutation.mutate(eventForm); }}
      />
      
      <FailureDialog
        open={showFailureDialog}
        onOpenChange={(open) => { setShowFailureDialog(open); if (!open) setEditingItem(null); }}
        editingItem={editingItem}
        form={failureForm}
        setForm={setFailureForm}
        onSubmit={() => { if (editingItem?.type === "failure") updateFailureMutation.mutate({ failureId: editingItem.data.id, data: failureForm }); else createFailureMutation.mutate(failureForm); }}
        equipmentNodes={equipmentNodes}
        failureModes={failureModesList}
      />
      
      <CauseDialog
        open={showCauseDialog}
        onOpenChange={(open) => { setShowCauseDialog(open); if (!open) setEditingItem(null); }}
        editingItem={editingItem}
        form={causeForm}
        setForm={setCauseForm}
        onSubmit={() => { if (editingItem?.type === "cause") updateCauseMutation.mutate({ causeId: editingItem.data.id, data: causeForm }); else createCauseMutation.mutate(causeForm); }}
        causeNodes={causeNodes}
      />
      
      <ActionDialog
        open={showActionDialog}
        onOpenChange={(open) => { setShowActionDialog(open); if (!open) setEditingItem(null); }}
        editingItem={editingItem}
        form={actionForm}
        setForm={setActionForm}
        onSubmit={() => { if (editingItem?.type === "action") updateActionMutation.mutate({ actionId: editingItem.data.id, data: actionForm }); else createActionMutation.mutate(actionForm); }}
        causeNodes={causeNodes}
        users={users}
      />
      
      {/* Complete Investigation Confirmation Dialog */}
      <AlertDialog open={showCompleteConfirm} onOpenChange={setShowCompleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-500" />
              Complete Investigation?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Marking this investigation as <strong>Completed</strong> will lock all fields. 
              You will no longer be able to edit the investigation details, add events, failures, causes, or actions.
              <br /><br />
              Are you sure you want to complete this investigation?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmComplete} className="bg-green-600 hover:bg-green-700">
              Yes, Complete Investigation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* AI Summary Dialog */}
      <Dialog open={showAISummaryDialog} onOpenChange={setShowAISummaryDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-600" />
              AI Investigation Summary
            </DialogTitle>
            <DialogDescription>
              AI-generated analysis and recommendations for this investigation
            </DialogDescription>
          </DialogHeader>
          
          {isGeneratingAISummary ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center">
                  <Brain className="w-8 h-8 text-purple-600 animate-pulse" />
                </div>
                <Loader2 className="absolute -top-1 -right-1 w-6 h-6 text-purple-600 animate-spin" />
              </div>
              <p className="text-slate-600 text-sm">Analyzing investigation data...</p>
              <p className="text-slate-400 text-xs">This may take a few moments</p>
            </div>
          ) : aiSummary ? (
            <div className="space-y-6 py-4">
              {/* Executive Summary */}
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-600" />
                  Executive Summary
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line bg-slate-50 p-4 rounded-lg">
                  {aiSummary.summary}
                </p>
              </div>
              
              {/* Key Findings */}
              {aiSummary.key_findings?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                    <Target className="w-4 h-4 text-amber-600" />
                    Key Findings
                  </h3>
                  <ul className="space-y-2">
                    {aiSummary.key_findings.map((finding, idx) => (
                      <li key={`finding-${idx}-${finding.slice(0,20)}`} className="flex items-start gap-2 text-sm text-slate-600">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-medium mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{finding}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Next Steps */}
              {aiSummary.next_steps?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                    Recommended Next Steps
                  </h3>
                  <ul className="space-y-2">
                    {aiSummary.next_steps.map((step, idx) => (
                      <li key={`step-${idx}-${step.slice(0,20)}`} className="flex items-start gap-2 text-sm text-slate-600">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Recommendations */}
              {aiSummary.recommendations?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-green-600" />
                    Strategic Recommendations
                  </h3>
                  <ul className="space-y-2">
                    {aiSummary.recommendations.map((rec, idx) => (
                      <li key={`rec-${idx}-${rec.slice(0,20)}`} className="flex items-start gap-2 text-sm text-slate-600">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-medium mt-0.5">
                          ✓
                        </span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAISummaryDialog(false)}>
              Close
            </Button>
            {aiSummary && (
              <Button 
                onClick={handleGenerateAISummary} 
                disabled={isGeneratingAISummary}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Brain className="w-4 h-4 mr-2" />
                Regenerate
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Investigation Closure Suggestion Dialog */}
      <Dialog open={!!closureSuggestion} onOpenChange={() => setClosureSuggestion(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle className="w-5 h-5 text-green-500" />
              All Actions Completed!
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <CheckSquare className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-green-800">
                  {closureSuggestion?.total_actions} action{closureSuggestion?.total_actions !== 1 ? 's' : ''} completed
                </p>
                <p className="text-sm text-green-600">
                  {closureSuggestion?.source_name}
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              {closureSuggestion?.message || "All corrective actions for this investigation have been completed. Consider closing this investigation."}
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setClosureSuggestion(null)}>
              Later
            </Button>
            <Button 
              onClick={() => {
                setClosureSuggestion(null);
                // Show the completion confirmation dialog
                setShowCompleteConfirm(true);
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Complete Investigation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Action Dialog */}
      <Dialog open={showEditActionDialog} onOpenChange={setShowEditActionDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5 text-blue-600" />
              Edit Action
            </DialogTitle>
            <DialogDescription>
              Update the action details. Changes will be saved to the action plan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="inv-edit-action-title">Action Title *</Label>
              <Input
                id="inv-edit-action-title"
                value={editActionForm.title}
                onChange={(e) => setEditActionForm({ ...editActionForm, title: e.target.value })}
                placeholder="e.g., Replace worn seals"
                data-testid="inv-edit-action-title-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-edit-action-description">Description</Label>
              <Textarea
                id="inv-edit-action-description"
                value={editActionForm.description}
                onChange={(e) => setEditActionForm({ ...editActionForm, description: e.target.value })}
                placeholder="Additional details about the action..."
                rows={3}
                data-testid="inv-edit-action-description-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="inv-edit-action-type">Action Type</Label>
                <Select
                  value={editActionForm.action_type}
                  onValueChange={(v) => setEditActionForm({ ...editActionForm, action_type: v })}
                >
                  <SelectTrigger data-testid="inv-edit-action-type-select">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CM">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        Corrective (CM)
                      </div>
                    </SelectItem>
                    <SelectItem value="PM">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        Preventive (PM)
                      </div>
                    </SelectItem>
                    <SelectItem value="PDM">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-500" />
                        Predictive (PDM)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-edit-action-discipline">Discipline</Label>
                <Select
                  value={editActionForm.discipline}
                  onValueChange={(v) => setEditActionForm({ ...editActionForm, discipline: v })}
                >
                  <SelectTrigger data-testid="inv-edit-action-discipline-select">
                    <SelectValue placeholder="Select discipline..." />
                  </SelectTrigger>
                  <SelectContent>
                    {["Mechanical", "Electrical", "Instrumentation", "Process", "Operations", "Safety", "Civil", "Rotating Equipment", "HVAC", "IT/OT", "General"].map((disc) => (
                      <SelectItem key={disc} value={disc}>{disc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="inv-edit-action-priority">Priority</Label>
                <Select
                  value={editActionForm.priority}
                  onValueChange={(v) => setEditActionForm({ ...editActionForm, priority: v })}
                >
                  <SelectTrigger data-testid="inv-edit-action-priority-select">
                    <SelectValue placeholder="Select priority..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-400" />
                        Low
                      </div>
                    </SelectItem>
                    <SelectItem value="medium">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        Medium
                      </div>
                    </SelectItem>
                    <SelectItem value="high">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        High
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-edit-action-status">Status</Label>
                <Select
                  value={editActionForm.status}
                  onValueChange={(v) => setEditActionForm({ ...editActionForm, status: v })}
                >
                  <SelectTrigger data-testid="inv-edit-action-status-select">
                    <SelectValue placeholder="Select status..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-blue-500" />
                        Open
                      </div>
                    </SelectItem>
                    <SelectItem value="in_progress">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-amber-500" />
                        In Progress
                      </div>
                    </SelectItem>
                    <SelectItem value="completed">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-green-500" />
                        Completed
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowEditActionDialog(false);
                setEditingAction(null);
              }}
              data-testid="cancel-inv-edit-action-button"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEditedAction}
              disabled={editActionMutation.isPending || !editActionForm.title.trim()}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="save-inv-edit-action-button"
            >
              {editActionMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Edit className="w-4 h-4 mr-2" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Defensive Reasoning Check Modal */}
    </>
  );
}
