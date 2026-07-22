import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import CirclesView from '@/components/CirclesView';
import type { CirclesViewHandle } from '@/components/CirclesView';
import { RolesTable } from '@/components/RolesTable';
import { SalaryView } from '@/components/SalaryView';
import { useViewNavigation } from '@/hooks/useView';
import { useFocusMode } from '@/hooks/useFocusMode';
import { FocusModeProvider } from '@/components/FocusModeProvider';
import { FocusModeOverlay } from '@/components/FocusModeOverlay';
import { FocusModeBar } from '@/components/planView/FocusModeBar';
import { Plus, Edit, Trash2, Move, PanelLeftClose, Home } from 'lucide-react';
import type { ModuleId } from '@/lib/persistence-types';
import { useTranslation } from 'react-i18next';

interface PlanViewProps {
  onFocusOnTask: (taskId: string) => void;
}

type ActiveView = 'circles' | 'roles' | 'salary';

const ViewToggleButtons: React.FC<{ activeView: ActiveView; setActiveView: (v: ActiveView) => void; enabledSubViews: ActiveView[] }> = React.memo(({ activeView, setActiveView, enabledSubViews }) => {
  const { t } = useTranslation();
  return (
  <div className="flex space-x-2">
    {enabledSubViews.includes('circles') && (
    <Button
      variant={activeView === 'circles' ? 'default' : 'outline'}
      onClick={() => setActiveView('circles')}
    >
      {t('nav.circles')}
    </Button>
    )}
    {enabledSubViews.includes('roles') && (
    <Button
      variant={activeView === 'roles' ? 'default' : 'outline'}
      onClick={() => setActiveView('roles')}
    >
      {t('nav.roles')}
    </Button>
    )}
    {enabledSubViews.includes('salary') && (
    <Button
      variant={activeView === 'salary' ? 'default' : 'outline'}
      onClick={() => setActiveView('salary')}
    >
      {t('nav.salarySystem')}
    </Button>
    )}
  </div>
  );
});

const PlanViewInner: React.FC<PlanViewProps> = ({ onFocusOnTask }) => {
  const { t } = useTranslation();
  const [activeView, setActiveView] = useState<ActiveView>('circles');
  const { pendingSubView, clearPendingSubView, disabledModules } = useViewNavigation();
  const { isFocusMode } = useFocusMode();
  const circlesRef = useRef<CirclesViewHandle>(null);

  const enabledSubViews: ActiveView[] = ['circles', 'roles', 'salary'].filter(
    v => !disabledModules.includes(`plan.${v}` as ModuleId)
  ) as ActiveView[];

  // Auto-select enabled sub-view if current is disabled
  useEffect(() => {
    if (enabledSubViews.length > 0 && !enabledSubViews.includes(activeView)) {
      setActiveView(enabledSubViews[0]);
    }
  }, [enabledSubViews, activeView]);

  useEffect(() => {
    if (!pendingSubView) return;
    const valid: ActiveView[] = ['circles', 'roles', 'salary'];
    if (valid.includes(pendingSubView as ActiveView)) {
      setActiveView(pendingSubView as ActiveView);
      clearPendingSubView();
    }
  }, [pendingSubView, clearPendingSubView]);

  const viewTitle = activeView === 'circles' ? t('nav.circles') : activeView === 'roles' ? t('nav.roles') : t('nav.salarySystem');

  const circleActions = (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => circlesRef.current?.toggleTreePanel()}
      >
        <PanelLeftClose className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => circlesRef.current?.zoomToRoot()}
      >
        <Home className="w-4 h-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={() => circlesRef.current?.openAddDialog()}>
        <Plus className="w-4 h-4 mr-1" /> {t('common.add')}
      </Button>
      <Button variant="outline" size="sm" onClick={() => circlesRef.current?.openEditDialog()}>
        <Edit className="w-4 h-4 mr-1" /> {t('common.edit')}
      </Button>
      <Button variant="outline" size="sm" onClick={() => circlesRef.current?.openMoveDialog()}>
        <Move className="w-4 h-4 mr-1" /> {t('circles.move')}
      </Button>
      <Button variant="destructive" size="sm" onClick={() => circlesRef.current?.handleDeleteNode()}>
        <Trash2 className="w-4 h-4 mr-1" /> {t('common.delete')}
      </Button>
    </div>
  );

  // Render Circles view
  if (activeView === 'circles') {
    return (
      <div className={`h-full flex flex-col ${isFocusMode ? 'relative' : ''}`}>
        {isFocusMode && (
          <FocusModeBar
            title={viewTitle}
            rightContent={
              <ViewToggleButtons activeView={activeView} setActiveView={setActiveView} enabledSubViews={enabledSubViews} />
            }
            moderatorDropdownContent={circleActions}
          />
        )}
        <Card className={`flex-1 flex flex-col min-h-0 border-0 shadow-none ${isFocusMode ? 'overflow-auto' : ''}`}>
          {!isFocusMode && (
            <CardHeader className="flex flex-col space-y-4 pb-2 shrink-0">
              <div className="flex flex-row items-center justify-between">
                <CardTitle>{t('nav.circles')}</CardTitle>
                <ViewToggleButtons activeView={activeView} setActiveView={setActiveView} enabledSubViews={enabledSubViews} />
              </div>
            </CardHeader>
          )}
          <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
            <CirclesView embedded hideHeaderActions={isFocusMode} ref={circlesRef} />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render Salary view
  if (activeView === 'salary') {
    return (
      <div className={`h-full flex flex-col ${isFocusMode ? 'relative' : ''}`}>
        {isFocusMode && (
          <FocusModeBar
            title={viewTitle}
            rightContent={
              <ViewToggleButtons activeView={activeView} setActiveView={setActiveView} enabledSubViews={enabledSubViews} />
            }
          />
        )}
        <Card className={`flex-1 flex flex-col min-h-0 border-0 shadow-none ${isFocusMode ? 'overflow-auto' : ''}`}>
          {!isFocusMode && (
            <CardHeader className="flex flex-col space-y-4 pb-2 shrink-0">
              <div className="flex flex-row items-center justify-between">
                <CardTitle>{t('nav.salarySystem')}</CardTitle>
                <ViewToggleButtons activeView={activeView} setActiveView={setActiveView} enabledSubViews={enabledSubViews} />
              </div>
            </CardHeader>
          )}
          <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
            <SalaryView />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render Roles view
  return (
    <div className={`h-full flex flex-col ${isFocusMode ? 'relative' : ''}`}>
      {isFocusMode && (
        <FocusModeBar
          title={viewTitle}
          rightContent={
             <ViewToggleButtons activeView={activeView} setActiveView={setActiveView} enabledSubViews={enabledSubViews} />
          }
        />
      )}
      <Card className={`flex-1 flex flex-col min-h-0 border-0 shadow-none ${isFocusMode ? 'overflow-auto' : ''}`}>
        {!isFocusMode && (
          <CardHeader className="flex flex-col space-y-4 pb-2 shrink-0">
            <div className="flex flex-row items-center justify-between">
              <CardTitle>{t('nav.roles')}</CardTitle>
              <ViewToggleButtons activeView={activeView} setActiveView={setActiveView} enabledSubViews={enabledSubViews} />
            </div>
          </CardHeader>
        )}
        <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
          <div className="h-full px-6 py-1">
            <RolesTable />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const PlanView: React.FC<PlanViewProps> = ({ onFocusOnTask }) => {
  return (
    <FocusModeProvider viewId="plan">
      <FocusModeOverlay>
        <PlanViewInner onFocusOnTask={onFocusOnTask} />
      </FocusModeOverlay>
    </FocusModeProvider>
  );
};

export default PlanView;