import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
  placeholder,
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
  const { t } = useTranslation();
  const { createTask, updateTitle } = useTasks();
  const { tasks: allTasks } = useAllTasks();
  const { toast } = useToast();
  const [input, setInput] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const resolvedPlaceholder = placeholder ?? t('quickadd.placeholder');

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
        title: t('quickadd.noTasksTitle'),
        description: t('quickadd.noTasksDescription'),
      });
      return;
    }
    setIsBatchImporting(true);
    try {
      titles.forEach((title) => createTask(title, parentId, userId));
      toast({
        title: t('quickadd.batchCompleteTitle'),
        description: t('quickadd.batchCompleteDescription', { n: titles.length }),
      });
      setBatchImportText('');
      setIsBatchImportOpen(false);
    } catch (error) {
      console.error('Batch import error:', error);
      toast({
        variant: 'destructive',
        title: t('quickadd.batchErrorTitle'),
        description: t('quickadd.batchErrorDescription'),
      });
    } finally {
      setIsBatchImporting(false);
    }
  }, [onBatchImport, batchImportText, toast, createTask, parentId, userId, t]);

  const handleDiffApply = useCallback((result: DiffImportResult) => {
    try {
      result.create.forEach((title) => createTask(title, parentId, userId));
      result.update.forEach((u) => updateTitle(u.id, u.title));
      const total = result.create.length + result.update.length;
      toast({
        title: t('quickadd.diffAppliedTitle'),
        description: t('quickadd.diffAppliedDescription', { created: result.create.length, updated: result.update.length }),
      });
      setIsDiffImportOpen(false);
      if (total === 0) return;
    } catch (error) {
      console.error('Diff import error:', error);
      toast({
        variant: 'destructive',
        title: t('quickadd.diffErrorTitle'),
        description: t('quickadd.diffErrorDescription'),
      });
    }
  }, [createTask, updateTitle, parentId, userId, toast, t]);

  return (
    <>
      <div className={cn('flex gap-2 items-center', className)}>
        {showPlusIcon && <Plus className="h-4 w-4 text-muted-foreground shrink-0" />}
        <Input
          placeholder={resolvedPlaceholder}
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
            {t('quickadd.add')}
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
                    title={t('quickadd.fromTemplate')}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {workspaceTemplates.length > 0 && (
                    <>
                      <DropdownMenuLabel>{t('quickadd.workspaceTemplates')}</DropdownMenuLabel>
                      {workspaceTemplates.map(tpl => (
                        <DropdownMenuItem key={tpl.id} onClick={() => handleApplyTemplate(tpl)}>
                          <span className="font-medium">{tpl.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {t('quickadd.nSteps', { n: tpl.children.length })}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  {userTemplates.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>{t('quickadd.myTemplates')}</DropdownMenuLabel>
                      {userTemplates.map(tpl => (
                        <DropdownMenuItem key={tpl.id} onClick={() => handleApplyTemplate(tpl)}>
                          <span className="font-medium">{tpl.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {t('quickadd.nSteps', { n: tpl.children.length })}
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
                title={t('quickadd.importTasks')}
              >
                <Upload className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onBatchImport ? onBatchImport() : setIsBatchImportOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                {t('quickadd.batchImport')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDiffImport ? onDiffImport() : setIsDiffImportOpen(true)}>
                <ScrollText className="h-4 w-4 mr-2" />
                {t('quickadd.diffImport')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={isBatchImportOpen} onOpenChange={setIsBatchImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('quickadd.batchDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('quickadd.batchDialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder={t('quickadd.batchPlaceholder')}
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
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleBatchImportInternal}
              disabled={isBatchImporting || !batchImportText.trim()}
            >
              {isBatchImporting ? t('quickadd.importing') : t('quickadd.import')}
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