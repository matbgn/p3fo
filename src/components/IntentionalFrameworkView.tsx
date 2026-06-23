import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

const INTENTIONAL_CATEGORIES: Omit<FrameworkCategory, 'content' | 'order'>[] = [
  { id: 'mission', label: 'Mission', description: 'What do we concretely do, and for whom? What are our main product or service offerings, our value propositions?' },
  { id: 'purpose', label: 'Purpose', description: 'Why, for whom, and for what do we do what we do? What effect are we seeking to produce by doing what we do? What is our main motivation for carrying out our mission(s)?' },
  { id: 'values', label: 'Values & Principles', description: 'What are our values and their principles for practical application? Who or what truly matters to us? What way of acting allows us to translate our values into action?' },
  { id: 'regenerative', label: 'Regenerative Aims', description: 'What positive contributions do we wish to make to natural and social systems? What results do we want to achieve, and in what timeframe?', optional: true },
  { id: 'legal', label: 'Legal & Economic', description: 'Is a particular legal status important to us, and if so, which one? Is a particular economic model important to us, and if so, which one?', optional: true },
  { id: 'ambition', label: 'Ambition', description: 'What are our concrete and measurable ambitions? What are our qualitative or quantitative ambitions? What results do we want to achieve? In what timeframe?', optional: true },
  { id: 'temporality', label: 'Temporality', description: 'Is a particular timeframe important to us, and if so, which one?', optional: true },
  { id: 'vision', label: 'Vision', description: 'What ideal world do we wish for? Why, for whom, or for what do we wish for this world?', optional: true },
  { id: 'socialRoles', label: 'Social Roles', description: 'What role do we identify with to fulfill our mission(s)? What are our professions to offer our products or services?', optional: true },
  { id: 'identity', label: 'Identity', description: 'Who do we identify as, as members of the organization? Symbolically, what is this identity like?', optional: true },
];

interface IntentionalFrameworkViewProps {
  onFocusOnTask?: (taskId: string) => void;
  hideHeader?: boolean;
}

const IntentionalFrameworkViewInner: React.FC<IntentionalFrameworkViewProps> = ({ hideHeader }) => {
  const { frameworks, createFramework, updateFramework } = useFrameworks('intentional');
  const { isFocusMode } = useFocusMode();
  const [framework, setFramework] = useState<FrameworkEntity | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());

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
    const categories: FrameworkCategory[] = INTENTIONAL_CATEGORIES.map((cat, idx) => ({
      ...cat,
      content: '',
      order: idx,
    }));
    const created = await createFramework({
      name: 'Intentional Framework',
      frameworkType: 'intentional',
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

  const viewTitle = 'Intentional Framework';

  if (!framework) {
    return (
      <div className={`h-full flex flex-col ${isFocusMode && !hideHeader ? 'relative' : ''}`}>
        {!hideHeader && isFocusMode && <FocusModeBar title={viewTitle} />}
        <Card className="flex-1 flex flex-col min-h-0 border-0 shadow-none">
          {!hideHeader && !isFocusMode && (
            <CardHeader className="flex flex-col space-y-4 pb-2 shrink-0">
              <div className="flex flex-row items-center justify-between">
                <CardTitle>Intentional Framework</CardTitle>
              </div>
            </CardHeader>
          )}
          <CardContent className="flex-1 min-h-0 overflow-auto">
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <p className="mb-4">No intentional framework created yet.</p>
              <Button onClick={handleCreateFramework}>
                <Plus className="w-4 h-4 mr-2" /> Create Intentional Framework
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
              <CardTitle>Intentional Framework</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={expandAll}>
                  <PlusCircle className="w-4 h-4 mr-1" /> Expand All
                </Button>
                <Button variant="ghost" size="sm" onClick={collapseAll}>
                  <MinusCircle className="w-4 h-4 mr-1" /> Collapse All
                </Button>
              </div>
            </div>
          </CardHeader>
        )}
        <CardContent className="flex-1 min-h-0 overflow-auto px-6 py-4">
          {hideHeader && (
            <div className="flex items-center gap-2 mb-2">
              <Button variant="ghost" size="sm" onClick={expandAll}>
                <PlusCircle className="w-4 h-4 mr-1" /> Expand All
              </Button>
              <Button variant="ghost" size="sm" onClick={collapseAll}>
                <MinusCircle className="w-4 h-4 mr-1" /> Collapse All
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