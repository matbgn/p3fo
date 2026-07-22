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
import { Plus, ChevronDown, ChevronRight, PlusCircle, MinusCircle } from 'lucide-react';

const INTENTIONAL_CATEGORY_IDS: { id: string; optional?: boolean }[] = [
  { id: 'mission' },
  { id: 'purpose' },
  { id: 'values' },
  { id: 'regenerative', optional: true },
  { id: 'legal', optional: true },
  { id: 'ambition', optional: true },
  { id: 'temporality', optional: true },
  { id: 'vision', optional: true },
  { id: 'socialRoles', optional: true },
  { id: 'identity', optional: true },
];

interface IntentionalFrameworkViewProps {
  onFocusOnTask?: (taskId: string) => void;
  hideHeader?: boolean;
}

const IntentionalFrameworkViewInner: React.FC<IntentionalFrameworkViewProps> = ({ hideHeader }) => {
  const { t } = useTranslation();
  const { frameworks, createFramework, updateFramework } = useFrameworks('intentional');
  const { isFocusMode } = useFocusMode();
  const [framework, setFramework] = useState<FrameworkEntity | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());

  const intentionalCategories = useMemo<Omit<FrameworkCategory, 'content' | 'order'>[]>(
    () => INTENTIONAL_CATEGORY_IDS.map(({ id, optional }) => ({
      id,
      label: t(`framework.intentional.category.${id}.label`),
      description: t(`framework.intentional.category.${id}.description`),
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
    const categories: FrameworkCategory[] = intentionalCategories.map((cat, idx) => ({
      ...cat,
      content: '',
      order: idx,
    }));
    const created = await createFramework({
      name: t('framework.intentional.name'),
      frameworkType: 'intentional',
      categories,
    });
    if (created) setFramework(created);
  }, [createFramework, intentionalCategories, t]);

  const handleCategoryChange = useCallback((categoryId: string, content: string) => {
    if (!framework) return;
    const updatedCategories = framework.categories.map(cat =>
      cat.id === categoryId ? { ...cat, content } : cat
    );
    const updated = { ...framework, categories: updatedCategories, updatedAt: new Date().toISOString() };
    setFramework(updated);
    updateFramework(framework.id, { categories: updatedCategories });
  }, [framework, updateFramework]);

  const viewTitle = t('framework.intentional.title');

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
              <p className="mb-4">{t('framework.intentional.noFramework')}</p>
              <Button onClick={handleCreateFramework}>
                <Plus className="w-4 h-4 mr-2" /> {t('framework.intentional.createTitle')}
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
                  <PlusCircle className="w-4 h-4 mr-1" /> {t('framework.intentional.expandAll')}
                </Button>
                <Button variant="ghost" size="sm" onClick={collapseAll}>
                  <MinusCircle className="w-4 h-4 mr-1" /> {t('framework.intentional.collapseAll')}
                </Button>
              </div>
            </div>
          </CardHeader>
        )}
        <CardContent className="flex-1 min-h-0 overflow-auto px-6 py-4">
          {hideHeader && (
            <div className="flex items-center gap-2 mb-2">
              <Button variant="ghost" size="sm" onClick={expandAll}>
                <PlusCircle className="w-4 h-4 mr-1" /> {t('framework.intentional.expandAll')}
              </Button>
              <Button variant="ghost" size="sm" onClick={collapseAll}>
                <MinusCircle className="w-4 h-4 mr-1" /> {t('framework.intentional.collapseAll')}
              </Button>
            </div>
          )}
          {framework.categories
            .sort((a, b) => a.order - b.order)
            .map(category => {
              const knownId = INTENTIONAL_CATEGORY_IDS.find(c => c.id === category.id);
              const labelKey = `framework.intentional.category.${category.id}.label`;
              const descKey = `framework.intentional.category.${category.id}.description`;
              const trLabel = t(labelKey);
              const trDesc = t(descKey);
              return (
                <FrameworkCategoryView
                  key={category.id}
                  categoryId={category.id}
                  label={knownId && trLabel !== labelKey ? trLabel : category.label}
                  description={knownId && trDesc !== descKey ? trDesc : category.description}
                  content={category.content}
                  onChange={(content) => handleCategoryChange(category.id, content)}
                  frameworkId={framework.id}
                  optional={category.optional}
                  collapsed={collapsedCats.has(category.id)}
                  onToggleCollapsed={() => toggleCategory(category.id)}
                />
              );
            })}
        </CardContent>
      </Card>
    </div>
  );
};

const IntentionalFrameworkView: React.FC<IntentionalFrameworkViewProps> = (props) => {
  return (
    <FocusModeProvider viewId="intentionalFramework">
      <FocusModeOverlay>
        <IntentionalFrameworkViewInner {...props} />
      </FocusModeOverlay>
    </FocusModeProvider>
  );
};

export { IntentionalFrameworkViewInner };
export default IntentionalFrameworkView;