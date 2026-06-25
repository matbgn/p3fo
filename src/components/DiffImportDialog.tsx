import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Plus, Edit3, Check, X, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { similarityRatio } from '@/lib/string-similarity';
import type { Task } from '@/hooks/useTasks';
import MultiCursorEditor, { type MultiCursorEditorHandle } from './MultiCursorEditor';

export interface DiffImportResult {
  create: string[];
  update: { id: string; title: string }[];
}

type LineAction = 'new' | 'update' | 'skip';

interface LeftLine {
  index: number;
  title: string;
  matchedTaskId: string | null;
  matchedTaskTitle: string | null;
  similarity: number;
  action: LineAction;
  accepted: boolean;
}

interface DiffImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingTasks: Task[];
  onApply: (result: DiffImportResult) => void;
}

const SIMILARITY_THRESHOLD = 0.6;

const DiffImportDialog: React.FC<DiffImportDialogProps> = ({
  open,
  onOpenChange,
  existingTasks,
  onApply,
}) => {
  const [inputText, setInputText] = useState('');
  const [analyzed, setAnalyzed] = useState(false);
  const [lines, setLines] = useState<LeftLine[]>([]);
  const [manualOverrides, setManualOverrides] = useState<
    Record<number, { action?: LineAction; accepted?: boolean }>
  >({});
  const [isApplying, setIsApplying] = useState(false);
  const editorHandleRef = useRef<MultiCursorEditorHandle | null>(null);

  const reset = useCallback(() => {
    setInputText('');
    setLines([]);
    setAnalyzed(false);
    setManualOverrides({});
    setIsApplying(false);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset],
  );

  const handleAnalyze = useCallback(() => {
    const titles = inputText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const computed: LeftLine[] = titles.map((title, index) => {
      let bestId: string | null = null;
      let bestTitle: string | null = null;
      let bestSim = 0;
      for (const task of existingTasks) {
        const sim = similarityRatio(title, task.title);
        if (sim > bestSim) {
          bestSim = sim;
          bestId = task.id;
          bestTitle = task.title;
        }
      }
      let action: LineAction;
      let accepted: boolean;
      if (bestSim >= SIMILARITY_THRESHOLD && bestId) {
        action = bestSim >= 1 ? 'skip' : 'update';
        accepted = bestSim >= 1 ? false : true;
      } else {
        action = 'new';
        accepted = true;
      }
      return {
        index,
        title,
        matchedTaskId: bestId,
        matchedTaskTitle: bestTitle,
        similarity: bestSim,
        action,
        accepted,
      };
    });
    setLines(computed);
    setManualOverrides({});
    setAnalyzed(true);
  }, [inputText, existingTasks]);

  // Re-compute lines when overrides change so toggles reflect immediately.
  useEffect(() => {
    if (!analyzed) return;
    setLines((prev) =>
      prev.map((line) => {
        const override = manualOverrides[line.index];
        if (!override) return line;
        return { ...line, ...override };
      }),
    );
  }, [manualOverrides, analyzed]);

  const setOverride = useCallback(
    (index: number, patch: { action?: LineAction; accepted?: boolean }) => {
      setManualOverrides((prev) => ({
        ...prev,
        [index]: { ...prev[index], ...patch },
      }));
    },
    [],
  );

  const handleAction = useCallback(
    (index: number, action: LineAction) => {
      setOverride(index, { action, accepted: action !== 'skip' });
    },
    [setOverride],
  );

  const toggleAccept = useCallback(
    (index: number) => {
      const line = lines.find((l) => l.index === index);
      if (!line) return;
      setOverride(index, { accepted: !line.accepted });
    },
    [lines, setOverride],
  );

  const handleBack = useCallback(() => {
    setAnalyzed(false);
    setLines([]);
    setManualOverrides({});
  }, []);

  const handleApply = useCallback(() => {
    const create: string[] = [];
    const update: { id: string; title: string }[] = [];
    for (const line of lines) {
      if (!line.accepted) continue;
      if (line.action === 'new') {
        create.push(line.title);
      } else if (line.action === 'update' && line.matchedTaskId) {
        update.push({ id: line.matchedTaskId, title: line.title });
      }
    }
    setIsApplying(true);
    onApply({ create, update });
    reset();
  }, [lines, onApply, reset]);

  const stats = useMemo(() => {
    let newCount = 0;
    let updateCount = 0;
    let skipCount = 0;
    let acceptedCount = 0;
    for (const l of lines) {
      if (l.action === 'new') newCount++;
      else if (l.action === 'update') updateCount++;
      else skipCount++;
      if (l.accepted && l.action !== 'skip') acceptedCount++;
    }
    return { newCount, updateCount, skipCount, acceptedCount };
  }, [lines]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Diff Import</DialogTitle>
          <DialogDescription>
            {analyzed
              ? 'Review the comparison, then move lines to create or update tasks.'
              : 'Paste task titles (one per line). Use Alt+click for multi-cursor and Ctrl+D to select the next occurrence. Click Analyze when ready.'}
          </DialogDescription>
        </DialogHeader>

        {!analyzed ? (
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            <MultiCursorEditor
              value={inputText}
              onChange={setInputText}
              placeholder={'Paste task titles here, one per line\nUse Alt+click for multiple cursors, Ctrl+D to select next occurrence'}
              className="h-[55vh] w-full"
              onReady={(h) => (editorHandleRef.current = h)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleAnalyze} disabled={!inputText.trim()}>
                Analyze
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 flex-1 overflow-hidden">
            <div className="flex items-center gap-4 text-xs flex-wrap">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-green-500/20 border border-green-500/50 inline-block" />
                New ({stats.newCount})
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-yellow-500/20 border border-yellow-500/50 inline-block" />
                Update ({stats.updateCount})
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-muted border inline-block" />
                Match ({stats.skipCount})
              </span>
              <span className="ml-auto text-muted-foreground">
                {stats.acceptedCount} to apply
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 flex-1 overflow-hidden">
              <div className="border rounded-md flex flex-col overflow-hidden">
                <div className="px-3 py-2 text-xs font-medium border-b bg-muted/50">
                  Pasted ({lines.length})
                </div>
                <div className="overflow-y-auto flex-1">
                  {lines.map((line) => (
                    <div
                      key={line.index}
                      className={cn(
                        'flex items-start gap-2 px-3 py-2 border-b text-sm',
                        line.action === 'new' && !line.accepted && 'opacity-50',
                        line.action === 'update' && !line.accepted && 'opacity-50',
                        line.action === 'skip' && 'opacity-40',
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{line.title}</div>
                        {line.matchedTaskTitle && (
                          <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                            ~{line.matchedTaskTitle}
                            <span className="ml-1">
                              ({Math.round(line.similarity * 100)}%)
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className={cn(
                            'h-6 w-6 p-0',
                            line.action === 'new' ? 'text-green-600' : 'text-muted-foreground',
                          )}
                          title="Create new task"
                          onClick={() => handleAction(line.index, 'new')}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={cn(
                            'h-6 w-6 p-0',
                            line.action === 'update' ? 'text-yellow-600' : 'text-muted-foreground',
                          )}
                          title="Update existing task"
                          disabled={!line.matchedTaskId}
                          onClick={() => handleAction(line.index, 'update')}
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={cn(
                            'h-6 w-6 p-0',
                            line.action === 'skip' ? 'text-muted-foreground' : 'text-muted-foreground/50',
                          )}
                          title="Already exists (skip)"
                          disabled={!line.matchedTaskId}
                          onClick={() => handleAction(line.index, 'skip')}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          title={line.accepted ? 'Disable' : 'Enable'}
                          onClick={() => toggleAccept(line.index)}
                        >
                          {line.accepted ? (
                            <Check className="h-4 w-4 text-primary" />
                          ) : (
                            <X className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                  {lines.length === 0 && (
                    <div className="px-3 py-4 text-sm text-muted-foreground">
                      No lines to analyze.
                    </div>
                  )}
                </div>
              </div>

              <div className="border rounded-md flex flex-col overflow-hidden">
                <div className="px-3 py-2 text-xs font-medium border-b bg-muted/50">
                  Active tasks ({existingTasks.length})
                </div>
                <div className="overflow-y-auto flex-1">
                  {existingTasks.map((task) => {
                    const importingLine = lines.find(
                      (l) =>
                        l.action === 'update' &&
                        l.accepted &&
                        l.matchedTaskId === task.id,
                    );
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          'flex items-start gap-2 px-3 py-2 border-b text-sm',
                          importingLine && 'bg-yellow-500/10',
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          {importingLine ? (
                            <>
                              <div className="line-through text-muted-foreground truncate">
                                {task.title}
                              </div>
                              <div className="text-foreground truncate flex items-center gap-1">
                                <ArrowRight className="h-3 w-3 text-yellow-600 shrink-0" />
                                {importingLine.title}
                              </div>
                            </>
                          ) : (
                            <div className="truncate">{task.title}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {existingTasks.length === 0 && (
                    <div className="px-3 py-4 text-sm text-muted-foreground">
                      No active top-level tasks.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={handleBack}>
                Back to editor
              </Button>
              <Button
                onClick={handleApply}
                disabled={isApplying || stats.acceptedCount === 0}
              >
                {isApplying ? 'Applying...' : `Apply (${stats.acceptedCount})`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DiffImportDialog;