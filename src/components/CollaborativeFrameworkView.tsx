import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FrameworkCategoryView } from '@/components/FrameworkCategoryView';
import { useFrameworks } from '@/hooks/useFrameworks';
import { FrameworkEntity, FrameworkCategory } from '@/lib/persistence-types';
import { FocusModeProvider } from '@/components/FocusModeProvider';
import { FocusModeOverlay } from '@/components/FocusModeOverlay';
import { FocusModeBar } from '@/components/planView/FocusModeBar';
import { useFocusMode } from '@/hooks/useFocusMode';
import { Plus, PlusCircle, MinusCircle } from 'lucide-react';

const COLLABORATIVE_CATEGORY_IDS: { id: string; optional?: boolean }[] = [
  { id: 'collaborative-values' },
  { id: 'expected-behaviors' },
  { id: 'regular-meetings' },
  { id: 'entry-process' },
  { id: 'exit-process' },
  { id: 'conflict-resolution' },
  { id: 'exclusion-process' },
  { id: 'collaborative-methods', optional: true },
  { id: 'individual-support', optional: true },
  { id: 'peer-support', optional: true },
];

interface CollaborativeFrameworkViewProps {
  onFocusOnTask?: (taskId: string) => void;
  hideHeader?: boolean;
}

const CollaborativeFrameworkViewInner: React.FC<CollaborativeFrameworkViewProps> = ({ hideHeader }) => {
  const { t } = useTranslation();
  const { frameworks, createFramework, updateFramework } = useFrameworks('collaborative');
  const { isFocusMode } = useFocusMode();
  const [framework, setFramework] = useState<FrameworkEntity | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());

  const collaborativeCategories = useMemo<Omit<FrameworkCategory, 'content' | 'order'>[]>(
    () => COLLABORATIVE_CATEGORY_IDS.map(({ id, optional }) => ({
      id,
      label: t(`framework.collaborative.category.${id}.label`),
      description: t(`framework.collaborative.category.${id}.description`),
      optional,
    })),
    [t],
  );

  const allCategoryIds = useMemo(
    () => (framework ? framework.categories.map(c => c.id) : []),
    [framework],
  );
  const toggleCategory = useCallback((id: string) => {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const expandAll = () => setCollapsedCats(new Set());
  const collapseAll = () => setCollapsedCats(new Set(allCategoryIds));

  useEffect(() => {
    if (frameworks.length > 0) {
      setFramework(frameworks[0]);
    }
  }, [frameworks]);

  const handleCreateFramework = useCallback(async () => {
    const categories: FrameworkCategory[] = collaborativeCategories.map((cat, idx) => ({
      ...cat,
      content: '',
      order: idx,
    }));
    const created = await createFramework({
      name: t('framework.collaborative.name'),
      frameworkType: 'collaborative',
      categories,
    });
    if (created) setFramework(created);
  }, [createFramework, collaborativeCategories, t]);

  const handleCategoryChange = useCallback((categoryId: string, content: string) => {
    if (!framework) return;
    const updatedCategories = framework.categories.map(cat =>
      cat.id === categoryId ? { ...cat, content } : cat
    );
    const updated = { ...framework, categories: updatedCategories, updatedAt: new Date().toISOString() };
    setFramework(updated);
    updateFramework(framework.id, { categories: updatedCategories });
  }, [framework, updateFramework]);

  const viewTitle = t('framework.collaborative.title');

  if (!framework) {
    return (
      <div className={`h-full flex flex-col ${isFocusMode && !hideHeader ? 'relative' : ''}`}>
        {!hideHeader && isFocusMode && <FocusModeBar title={viewTitle} />}
        <Card className="flex-1 flex flex-col min-h-0 border-0 shadow-none">
          {!hideHeader && !isFocusMode && (
            <CardHeader className="flex flex-col space-y-4 pb-2 shrink-0">
              <div className="flex flex-row items-center justify-between">
                <CardTitle>{viewTitle}</CardTitle>
              </div>
            </CardHeader>
          )}
          <CardContent className="flex-1 min-h-0 overflow-auto">
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <p className="mb-4">{t('framework.collaborative.noFramework')}</p>
              <Button onClick={handleCreateFramework}>
                <Plus className="w-4 h-4 mr-2" /> {t('framework.collaborative.createTitle')}
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
              <CardTitle>{viewTitle}</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={expandAll}>
                  <PlusCircle className="w-4 h-4 mr-1" /> {t('framework.collaborative.expandAll')}
                </Button>
                <Button variant="ghost" size="sm" onClick={collapseAll}>
                  <MinusCircle className="w-4 h-4 mr-1" /> {t('framework.collaborative.collapseAll')}
                </Button>
              </div>
            </div>
          </CardHeader>
        )}
        <CardContent className="flex-1 min-h-0 overflow-auto px-6 py-4">
          {hideHeader && (
            <div className="flex items-center gap-2 mb-2">
              <Button variant="ghost" size="sm" onClick={expandAll}>
                <PlusCircle className="w-4 h-4 mr-1" /> {t('framework.collaborative.expandAll')}
              </Button>
              <Button variant="ghost" size="sm" onClick={collapseAll}>
                <MinusCircle className="w-4 h-4 mr-1" /> {t('framework.collaborative.collapseAll')}
              </Button>
            </div>
          )}
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
                collapsed={collapsedCats.has(category.id)}
                onToggleCollapsed={() => toggleCategory(category.id)}
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