import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Plus, ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { loadTemplates, saveTemplates, type TaskTemplate, type TaskTemplateChild } from '@/lib/task-templates';
import { cn } from '@/lib/utils';

interface TemplateManagerProps {
  scope: 'workspace' | 'user';
}

export const TemplateManager: React.FC<TemplateManagerProps> = ({ scope }) => {
  const [templates, setTemplates] = useState<TaskTemplate[]>(() => loadTemplates(scope));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newParentTitle, setNewParentTitle] = useState('');

  const persist = useCallback((updated: TaskTemplate[]) => {
    setTemplates(updated);
    saveTemplates(scope, updated);
  }, [scope]);

  const handleAddTemplate = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    const tpl: TaskTemplate = {
      id: `tpl-${Date.now()}`,
      name,
      parentTitle: newParentTitle.trim() || name,
      children: [],
      scope,
    };
    persist([...templates, tpl]);
    setNewName('');
    setNewParentTitle('');
    setExpandedId(tpl.id);
  }, [newName, newParentTitle, templates, scope, persist]);

  const handleDelete = useCallback((id: string) => {
    persist(templates.filter(t => t.id !== id));
  }, [templates, persist]);

  const handleUpdateTemplate = useCallback((id: string, patch: Partial<TaskTemplate>) => {
    persist(templates.map(t => t.id === id ? { ...t, ...patch } : t));
  }, [templates, persist]);

  const handleAddChild = useCallback((templateId: string) => {
    const child: TaskTemplateChild = { title: 'New step' };
    persist(templates.map(t =>
      t.id === templateId ? { ...t, children: [...t.children, child] } : t
    ));
  }, [templates, persist]);

  const handleUpdateChild = useCallback((templateId: string, index: number, patch: Partial<TaskTemplateChild>) => {
    persist(templates.map(t =>
      t.id === templateId
        ? { ...t, children: t.children.map((c, i) => i === index ? { ...c, ...patch } : c) }
        : t
    ));
  }, [templates, persist]);

  const handleDeleteChild = useCallback((templateId: string, index: number) => {
    persist(templates.map(t =>
      t.id === templateId
        ? { ...t, children: t.children.filter((_, i) => i !== index) }
        : t
    ));
  }, [templates, persist]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Label className="text-xs text-muted-foreground">Template name</Label>
          <Input
            placeholder="e.g. Deployment checklist"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTemplate()}
            className="h-8 text-sm"
          />
        </div>
        <div className="flex-1">
          <Label className="text-xs text-muted-foreground">Parent task title</Label>
          <Input
            placeholder="e.g. Release"
            value={newParentTitle}
            onChange={(e) => setNewParentTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTemplate()}
            className="h-8 text-sm"
          />
        </div>
        <Button size="sm" onClick={handleAddTemplate} disabled={!newName.trim()}>
          <Plus className="h-4 w-4 mr-1" />
          Add template
        </Button>
      </div>

      {templates.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No templates yet. Create one above to scaffold common workflows as a parent task with predefined children.
        </p>
      )}

      <div className="space-y-2">
        {templates.map(tpl => (
          <div key={tpl.id} className="border rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
              <button
                onClick={() => setExpandedId(expandedId === tpl.id ? null : tpl.id)}
                className="shrink-0"
              >
                {expandedId === tpl.id
                  ? <ChevronDown className="h-4 w-4" />
                  : <ChevronRight className="h-4 w-4" />}
              </button>
              <Input
                value={tpl.name}
                onChange={(e) => handleUpdateTemplate(tpl.id, { name: e.target.value })}
                className="h-7 text-sm border-none shadow-none focus-visible:ring-1 max-w-[200px]"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <Input
                value={tpl.parentTitle}
                onChange={(e) => handleUpdateTemplate(tpl.id, { parentTitle: e.target.value })}
                className="h-7 text-sm border-none shadow-none focus-visible:ring-1 max-w-[200px]"
              />
              <span className="text-xs text-muted-foreground ml-auto">{tpl.children.length} steps</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                onClick={() => handleDelete(tpl.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            {expandedId === tpl.id && (
              <div className="px-3 py-2 space-y-2 border-t">
                {tpl.children.map((child, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                    <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                    <Input
                      value={child.title}
                      onChange={(e) => handleUpdateChild(tpl.id, i, { title: e.target.value })}
                      className="h-7 text-sm flex-1"
                    />
                    <select
                      value={child.difficulty ?? ''}
                      onChange={(e) => handleUpdateChild(tpl.id, i, { difficulty: e.target.value ? Number(e.target.value) as TaskTemplateChild['difficulty'] : undefined })}
                      className="h-7 text-xs border rounded px-1 bg-background"
                    >
                      <option value="">Difficulty</option>
                      <option value="0.5">0.5</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="5">5</option>
                      <option value="8">8</option>
                    </select>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive shrink-0"
                      onClick={() => handleDeleteChild(tpl.id, i)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => handleAddChild(tpl.id)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add step
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};