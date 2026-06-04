import React, { useState, useEffect } from 'react';
import { failureModesAPI } from '../../lib/apis/failureModes';
import { pmImportAPI } from '../../lib/apis/pmImport';
import { toast } from 'sonner';
import { Loader2, Target, GitMerge, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

const actionLabel = (action, idx) => {
  if (typeof action === 'string') return action;
  if (!action || typeof action !== 'object') return `Action ${idx + 1}`;
  return action.description || action.action || action.name || `Action ${idx + 1}`;
};

const PMApplyFailureModeDialog = ({ task, onClose, onSuccess }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [selectedFm, setSelectedFm] = useState(null);
  const [loadingFm, setLoadingFm] = useState(false);
  const [placementMode, setPlacementMode] = useState('add');
  const [replaceIndex, setReplaceIndex] = useState(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!task) return;
    setQuery('');
    setResults([]);
    setSelectedFm(null);
    setPlacementMode('add');
    setReplaceIndex(null);
  }, [task]);

  useEffect(() => {
    if (!task) return;
    let cancelled = false;
    const run = async () => {
      setLoadingSearch(true);
      try {
        const data = await failureModesAPI.getAll({ search: query });
        if (!cancelled) setResults(data?.failure_modes || []);
      } catch {
        if (!cancelled) toast.error('Failed to search failure modes');
      } finally {
        if (!cancelled) setLoadingSearch(false);
      }
    };
    const t = setTimeout(run, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, task]);

  const selectFailureMode = async (fm) => {
    setLoadingFm(true);
    try {
      const full = await failureModesAPI.getById(fm.id);
      setSelectedFm(full);
      const actions = full?.recommended_actions || [];
      setPlacementMode(actions.length > 0 ? 'replace' : 'add');
      setReplaceIndex(actions.length > 0 ? 0 : null);
    } catch {
      toast.error('Failed to load failure mode');
    } finally {
      setLoadingFm(false);
    }
  };

  const handleApply = async () => {
    if (!task || !selectedFm?.id) return;
    if (task.review_status !== 'accepted' && task.review_status !== 'implemented') {
      toast.error('Accept the task before applying to a failure mode');
      return;
    }
    if (placementMode === 'replace' && (replaceIndex === null || replaceIndex === undefined)) {
      toast.error('Select which existing action to replace');
      return;
    }

    setApplying(true);
    try {
      const result = await pmImportAPI.applyToFailureMode(task.session_id, task.task_id, {
        target_failure_mode_id: selectedFm.id,
        placement_mode: placementMode,
        replace_action_index: placementMode === 'replace' ? replaceIndex : null,
      });
      if (result.success) {
        const suffix =
          result.mode === 'replaced'
            ? ' (replaced existing action)'
            : result.mode === 'existing'
              ? ' (already on failure mode)'
              : ' (added as new action)';
        toast.success((result.message || 'Applied to failure mode') + suffix);
        onSuccess?.(result);
        onClose();
      } else {
        toast.error(result.message || 'Failed to apply');
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message || 'Failed to apply');
    } finally {
      setApplying(false);
    }
  };

  if (!task) return null;

  const existingActions = selectedFm?.recommended_actions || [];
  const isImplemented = task.import_status === 'implemented' || task.review_status === 'implemented';

  return (
    <Dialog open={!!task} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl" data-testid="pm-apply-fm-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-purple-600" />
            Apply to Failure Mode
          </DialogTitle>
          <DialogDescription>
            {(task.task_description || '').slice(0, 120)}
            {isImplemented && (
              <Badge variant="outline" className="ml-2 bg-emerald-50 text-emerald-700">
                Already implemented
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        {!selectedFm ? (
          <div className="space-y-3">
            <Input
              placeholder="Search failure modes..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="pm-apply-fm-search"
            />
            <ScrollArea className="h-72 border rounded">
              {loadingSearch && (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              )}
              {!loadingSearch && results.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">No failure modes found</p>
              )}
              {!loadingSearch &&
                results.map((fm) => (
                  <button
                    key={fm.id}
                    type="button"
                    onClick={() => selectFailureMode(fm)}
                    className="w-full text-left px-3 py-2 border-b hover:bg-gray-50 text-sm"
                    data-testid={`pm-apply-fm-option-${fm.id}`}
                  >
                    <div className="font-medium">{fm.failure_mode}</div>
                    <div className="text-xs text-gray-500">
                      {fm.equipment || '—'} · RPN {fm.rpn ?? '—'}
                    </div>
                  </button>
                ))}
            </ScrollArea>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2">
              <div>
                <p className="font-medium text-sm">{selectedFm.failure_mode}</p>
                <p className="text-xs text-gray-500">{selectedFm.equipment || '—'}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedFm(null)}>
                Change
              </Button>
            </div>

            {loadingFm ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={placementMode === 'add' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setPlacementMode('add');
                      setReplaceIndex(null);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add as new action
                  </Button>
                  <Button
                    type="button"
                    variant={placementMode === 'replace' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    disabled={existingActions.length === 0}
                    onClick={() => {
                      setPlacementMode('replace');
                      if (replaceIndex === null && existingActions.length > 0) {
                        setReplaceIndex(0);
                      }
                    }}
                  >
                    <GitMerge className="h-4 w-4 mr-1" />
                    Replace existing
                  </Button>
                </div>

                {placementMode === 'replace' && existingActions.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-600">Select action to replace</Label>
                    <ScrollArea className="h-40 border rounded">
                      {existingActions.map((action, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setReplaceIndex(idx)}
                          className={`w-full text-left px-3 py-2 border-b text-sm ${
                            replaceIndex === idx ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
                          }`}
                        >
                          <span className="text-xs text-gray-400 mr-2">#{idx + 1}</span>
                          {actionLabel(action, idx)}
                        </button>
                      ))}
                    </ScrollArea>
                  </div>
                )}

                {placementMode === 'add' && (
                  <p className="text-xs text-gray-500">
                    The imported task will be appended as a new recommended action on this failure mode.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={applying}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={!selectedFm || applying || loadingFm}
            data-testid="pm-apply-fm-submit"
          >
            {applying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Apply & mark implemented
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PMApplyFailureModeDialog;
