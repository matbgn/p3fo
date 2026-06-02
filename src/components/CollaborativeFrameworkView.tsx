import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FrameworkCategoryView } from '@/components/FrameworkCategoryView';
import { useFrameworks } from '@/hooks/useFrameworks';
import { FrameworkEntity, FrameworkCategory } from '@/lib/persistence-types';
import { FocusModeProvider } from '@/components/FocusModeProvider';
import { FocusModeOverlay } from '@/components/FocusModeOverlay';
import { FocusModeBar } from '@/components/planView/FocusModeBar';
import { useFocusMode } from '@/hooks/useFocusMode';
import { Plus } from 'lucide-react';

const COLLABORATIVE_CATEGORIES: Omit<FrameworkCategory, 'content' | 'order'>[] = [
  { id: 'collaborative-values', label: 'Collaborative Values & Principles', description: 'The values important for efficient and pleasant collaboration and the principles that translate these values into action within the organization.' },
  { id: 'expected-behaviors', label: 'Expected Behaviors', description: 'Behaviors to encourage, indispensable ones, to avoid, or unacceptable for efficient and pleasant collaboration.' },
  { id: 'regular-meetings', label: 'Regular Meetings', description: 'The types of meetings practiced, their frequency and duration.' },
  { id: 'entry-process', label: 'Entry Process', description: 'How a person can join the organization.' },
  { id: 'exit-process', label: 'Exit Process', description: 'How a person can leave the organization.' },
  { id: 'conflict-resolution', label: 'Conflict Resolution Process', description: 'How to constructively regulate tensions and conflicts between members.' },
  { id: 'exclusion-process', label: 'Exclusion Process', description: 'How to separate from a person harming the organization or its members.' },
  { id: 'collaborative-methods', label: 'Collaborative Methods', description: 'Project management methods used in complement to this constitution.', optional: true },
  { id: 'individual-support', label: 'Individual Support Process', description: 'How to offer personal support.', optional: true },
  { id: 'peer-support', label: 'Peer Support Process', description: 'How to help each other and learn together.', optional: true },
];

interface CollaborativeFrameworkViewProps {
  onFocusOnTask?: (taskId: string) => void;
  hideHeader?: boolean;
}

const CollaborativeFrameworkViewInner: React.FC<CollaborativeFrameworkViewProps> = ({ hideHeader }) => {
  const { frameworks, createFramework, updateFramework } = useFrameworks('collaborative');
  const { isFocusMode } = useFocusMode();
  const [framework, setFramework] = useState<FrameworkEntity | null>(null);

  useEffect(() => {
    if (frameworks.length > 0) {
      setFramework(frameworks[0]);
    }
  }, [frameworks]);

  const handleCreateFramework = useCallback(async () => {
    const categories: FrameworkCategory[] = COLLABORATIVE_CATEGORIES.map((cat, idx) => ({
      ...cat,
      content: '',
      order: idx,
    }));
    const created = await createFramework({
      name: 'Collaborative Framework',
      frameworkType: 'collaborative',
      categories,
    });
    if (created) setFramework(created);
  }, [createFramework]);

  const handleCategoryChange = useCallback((categoryId: string, content: string) => {
    if (!framework) return;
    const updatedCategories = framework.categories.map(cat =>
      cat.id === categoryId ? { ...cat, content } : cat
    );
    const updated = { ...framework, categories: updatedCategories, updatedAt: new Date().toISOString() };
    setFramework(updated);
    updateFramework(framework.id, { categories: updatedCategories });
  }, [framework, updateFramework]);

  const viewTitle = 'Collaborative Framework';

  if (!framework) {
    return (
      <div className={`h-full flex flex-col ${isFocusMode && !hideHeader ? 'relative' : ''}`}>
        {!hideHeader && isFocusMode && <FocusModeBar title={viewTitle} />}
        <Card className="flex-1 flex flex-col min-h-0 border-0 shadow-none">
          {!hideHeader && !isFocusMode && (
            <CardHeader className="flex flex-col space-y-4 pb-2 shrink-0">
              <div className="flex flex-row items-center justify-between">
                <CardTitle>Collaborative Framework</CardTitle>
              </div>
            </CardHeader>
          )}
          <CardContent className="flex-1 min-h-0 overflow-auto">
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <p className="mb-4">No collaborative framework created yet.</p>
              <Button onClick={handleCreateFramework}>
                <Plus className="w-4 h-4 mr-2" /> Create Collaborative Framework
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col ${isFocusMode && !hideHeader ? 'relative' : ''}`}>
      {!hideHeader && isFocusMode && <FocusModeBar title={viewTitle} />}
      <Card className={`flex-1 flex flex-col min-h-0 border-0 shadow-none ${isFocusMode && !hideHeader ? 'overflow-auto' : ''}`}>
        {!hideHeader && !isFocusMode && (
          <CardHeader className="flex flex-col space-y-4 pb-2 shrink-0">
            <div className="flex flex-row items-center justify-between">
              <CardTitle>Collaborative Framework</CardTitle>
            </div>
          </CardHeader>
        )}
        <CardContent className="flex-1 min-h-0 overflow-auto px-6 py-4">
          {framework.categories
            .sort((a, b) => a.order - b.order)
            .map(category => (
              <FrameworkCategoryView
                key={category.id}
                categoryId={category.id}
                label={category.label}
                description={category.description}
                content={category.content}
                onChange={(content) => handleCategoryChange(category.id, content)}
                frameworkId={framework.id}
                optional={category.optional}
              />
            ))}
        </CardContent>
      </Card>
    </div>
  );
};

const CollaborativeFrameworkView: React.FC<CollaborativeFrameworkViewProps> = (props) => {
  return (
    <FocusModeProvider viewId="collaborativeFramework">
      <FocusModeOverlay>
        <CollaborativeFrameworkViewInner {...props} />
      </FocusModeOverlay>
    </FocusModeProvider>
  );
};

export { CollaborativeFrameworkViewInner };
export default CollaborativeFrameworkView;