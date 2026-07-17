import React, { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDown, Plus, Upload, ScrollText } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { getAllTemplates, type TaskTemplate } from '@/lib/task-templates';
import { useTasks } from '@/hooks/useTasks';
import { useAllTasks } from '@/hooks/useAllTasks';
import { useToast } from '@/hooks/use-toast';
import DiffImportDialog, { type DiffImportResult } from './DiffImportDialog';
import { cn } from '@/lib/utils';

interface QuickAddTaskProps {
  placeholder?: string;
  parentId?: string | null;
  userId?: string;
  onAdd?: (taskId: string, title: string) => void;
  onCreatedFromTemplate?: (parentId: string) => void;
  onBatchImport?: () => void;
  onDiffImport?: () => void;
  onDropdownOpenChange?: (open: boolean) => void;
  className?: string;
  showPlusIcon?: boolean;
  autoFocus?: boolean;
}

export const QuickAddTask: React.FC<QuickAddTaskProps> = ({
  placeholder = 'Quick add top task...',
  parentId = null,
  userId,
  onAdd,
  onCreatedFromTemplate,
  onBatchImport,
  onDiffImport,
  onDropdownOpenChange,
  className,
  showPlusIcon = false,
  autoFocus = false,
}) => {
  const { createTask, updateTitle } = useTasks();
  const { tasks: allTasks } = useAllTasks();
  const { toast } = useToast();
  const [input, setInput] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleDropdownOpenChange = useCallback((open: boolean) => {
    setIsDropdownOpen(open);
    onDropdownOpenChange?.(open);
  }, [onDropdownOpenChange]);

  const [isBatchImportOpen, setIsBatchImportOpen] = useState(false);
  const [batchImportText, setBatchImportText] = useState('');
  const [isBatchImporting, setIsBatchImporting] = useState(false);
  const [isDiffImportOpen, setIsDiffImportOpen] = useState(false);

  const templates = useMemo(() => getAllTemplates(), []);
  const workspaceTemplates = templates.filter(t => t.scope === 'workspace');
  const userTemplates = templates.filter(t => t.scope === 'user');
  const hasTemplates = templates.length > 0;

  const handleAdd = useCallback(async () => {
    const v = input.trim();
    if (!v) return;
    const id = await createTask(v, parentId, userId);
    setInput('');
    onAdd?.(id, v);
  }, [input, createTask, parentId, userId, onAdd]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  }, [handleAdd]);

  const handleApplyTemplate = useCallback(async (template: TaskTemplate) => {
    setIsApplying(true);
    try {
      const newParentId = await createTask(template.parentTitle, parentId, userId);
      for (const child of template.children) {
        await createTask(child.title, newParentId, userId);
      }
      onCreatedFromTemplate?.(newParentId);
    } catch (error) {
      console.error('Error applying template:', error);
    } finally {
      setIsApplying(false);
    }
  }, [createTask, parentId, userId, onCreatedFromTemplate]);

  const handleBatchImportInternal = useCallback(() => {
    if (onBatchImport) {
      onBatchImport();
      return;
    }
    const titles = batchImportText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (titles.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No tasks to import',
        description: 'Paste one task title per line.',
      });
      return;
    }
    setIsBatchImporting(true);
    try {
      titles.forEach((title) => createTask(title, parentId, userId));
      toast({
        title: 'Batch import complete',
        description: `Imported ${titles.length} task${titles.length > 1 ? 's' : ''}.`,
      });
      setBatchImportText('');
      setIsBatchImportOpen(false);
    } catch (error) {
      console.error('Batch import error:', error);
      toast({
        variant: 'destructive',
        title: 'Error during batch import',
        description: 'Some tasks may not have been imported.',
      });
    } finally {
      setIsBatchImporting(false);
    }
  }, [onBatchImport, batchImportText, toast, createTask, parentId, userId]);

  const handleDiffApply = useCallback((result: DiffImportResult) => {
    try {
      result.create.forEach((title) => createTask(title, parentId, userId));
      result.update.forEach((u) => updateTitle(u.id, u.title));
      const total = result.create.length + result.update.length;
      toast({
        title: 'Diff import applied',
        description: `${result.create.length} created, ${result.update.length} updated.`,
      });
      setIsDiffImportOpen(false);
      if (total === 0) return;
    } catch (error) {
      console.error('Diff import error:', error);
      toast({
        variant: 'destructive',
        title: 'Error during diff import',
        description: 'Some changes may not have been applied.',
      });
    }
  }, [createTask, updateTitle, parentId, userId, toast]);

  return (
    <>
      <div className={cn('flex gap-2 items-center', className)}>
        {showPlusIcon && <Plus className="h-4 w-4 text-muted-foreground shrink-0" />}
        <Input
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
          className="flex-1"
        />
        <div className="flex shrink-0 rounded-md overflow-hidden border border-input">
          <Button
            onClick={handleAdd}
            disabled={!input.trim() || isApplying}
            variant="ghost"
            size="sm"
            className="rounded-none border-0"
          >
            Add
          </Button>
          {hasTemplates && (
            <>
              <div className="w-px bg-border" />
              <DropdownMenu onOpenChange={handleDropdownOpenChange}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isApplying}
                    className="rounded-none border-0 px-2"
                    title="Create from template"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {workspaceTemplates.length > 0 && (
                    <>
                      <DropdownMenuLabel>Workspace templates</DropdownMenuLabel>
                      {workspaceTemplates.map(t => (
                        <DropdownMenuItem key={t.id} onClick={() => handleApplyTemplate(t)}>
                          <span className="font-medium">{t.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {t.children.length} steps
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  {userTemplates.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>My templates</DropdownMenuLabel>
                      {userTemplates.map(t => (
                        <DropdownMenuItem key={t.id} onClick={() => handleApplyTemplate(t)}>
                          <span className="font-medium">{t.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {t.children.length} steps
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          <div className="w-px bg-border" />
          <DropdownMenu onOpenChange={handleDropdownOpenChange}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-none border-0 px-2"
                title="Import tasks"
              >
                <Upload className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onBatchImport ? onBatchImport() : setIsBatchImportOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Batch Import
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDiffImport ? onDiffImport() : setIsDiffImportOpen(true)}>
                <ScrollText className="h-4 w-4 mr-2" />
                Diff Import
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={isBatchImportOpen} onOpenChange={setIsBatchImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Batch Import Tasks</DialogTitle>
            <DialogDescription>
              Paste one task title per line. Each non-empty line will be
              created as a separate task.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder={"Task title one\nTask title two\nTask title three"}
            value={batchImportText}
            onChange={(e) => setBatchImportText(e.target.value)}
            rows={10}
            disabled={isBatchImporting}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsBatchImportOpen(false)}
              disabled={isBatchImporting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBatchImportInternal}
              disabled={isBatchImporting || !batchImportText.trim()}
            >
              {isBatchImporting ? 'Importing...' : 'Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DiffImportDialog
        open={isDiffImportOpen}
        onOpenChange={setIsDiffImportOpen}
        existingTasks={allTasks}
        onApply={handleDiffApply}
      />
    </>
  );
};