import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { getAllTemplates, type TaskTemplate } from '@/lib/task-templates';
import { useTasks } from '@/hooks/useTasks';

interface TemplateQuickAddProps {
  onCreated?: (parentId: string) => void;
}

export const TemplateQuickAdd: React.FC<TemplateQuickAddProps> = ({ onCreated }) => {
  const { createTask } = useTasks();
  const [isApplying, setIsApplying] = useState(false);

  const handleApplyTemplate = useCallback(async (template: TaskTemplate) => {
    setIsApplying(true);
    try {
      const parentId = await createTask(template.parentTitle, null);
      for (const child of template.children) {
        await createTask(child.title, parentId);
      }
      onCreated?.(parentId);
    } catch (error) {
      console.error('Error applying template:', error);
    } finally {
      setIsApplying(false);
    }
  }, [createTask, onCreated]);

  const templates = getAllTemplates();
  if (templates.length === 0) return null;

  const workspaceTemplates = templates.filter(t => t.scope === 'workspace');
  const userTemplates = templates.filter(t => t.scope === 'user');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={isApplying}
          className="h-8 w-8 p-0"
          title="Create from template"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
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
  );
};