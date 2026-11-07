import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ProgramView from './ProgramView';
import ResourcesScheduler from './ResourcesScheduler';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAllTasks } from '@/hooks/useAllTasks';
import { TaskEditorDialog } from './planner/TaskEditorDialog';

import { useViewNavigation } from '@/hooks/useView';
import { FocusModeProvider } from '@/components/FocusModeProvider';
import { FocusModeOverlay } from '@/components/FocusModeOverlay';
import { FocusModeBar } from '@/components/planView/FocusModeBar';
import { useFocusMode } from '@/hooks/useFocusMode';
import type { ModuleId } from '@/lib/persistence-types';

type ActiveView = 'calendar' | 'resources';

const ViewToggleButtons: React.FC<{ activeView: ActiveView; setActiveView: (v: ActiveView) => void; enabledSubViews: ActiveView[] }> = React.memo(({ activeView, setActiveView, enabledSubViews }) => {
    const { t } = useTranslation();
    return (
    <div className="flex space-x-2">
        {enabledSubViews.includes('calendar') && (
        <Button
            variant={activeView === 'calendar' ? 'default' : 'outline'}
            onClick={() => setActiveView('calendar')}
        >
            {t('programTop.calendar')}
        </Button>
        )}
        {enabledSubViews.includes('resources') && (
        <Button
            variant={activeView === 'resources' ? 'default' : 'outline'}
            onClick={() => setActiveView('resources')}
        >
            {t('programTop.resources')}
        </Button>
        )}
    </div>
    );
});

const ProgramTopViewInner: React.FC = () => {
    const { t } = useTranslation();
    const [activeView, setActiveView] = useState<ActiveView>('calendar');
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const { pendingSubView, clearPendingSubView, disabledModules } = useViewNavigation();
    const { isFocusMode } = useFocusMode();
    const { tasks } = useAllTasks({ includeRecurring: true });

    const selectedTask = selectedTaskId
        ? tasks.find((task) => task.id === selectedTaskId) ?? null
        : null;

    const enabledSubViews: ActiveView[] = ['calendar', 'resources'].filter(
        v => !disabledModules.includes(`program.${v}` as ModuleId)
    ) as ActiveView[];

    useEffect(() => {
        if (enabledSubViews.length > 0 && !enabledSubViews.includes(activeView)) {
            setActiveView(enabledSubViews[0]);
        }
    }, [enabledSubViews, activeView]);

    useEffect(() => {
        if (!pendingSubView) return;
        const valid: ActiveView[] = ['calendar', 'resources'];
        if (valid.includes(pendingSubView as ActiveView)) {
            setActiveView(pendingSubView as ActiveView);
            clearPendingSubView();
        }
    }, [pendingSubView, clearPendingSubView]);

    const viewTitle = activeView === 'calendar' ? t('programTop.programCalendar') : t('programTop.resources');


    if (activeView === 'resources' && enabledSubViews.includes('resources')) {
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
                                <CardTitle>{viewTitle}</CardTitle>
                                {enabledSubViews.length > 1 && <ViewToggleButtons activeView={activeView} setActiveView={setActiveView} enabledSubViews={enabledSubViews} />}
                            </div>
                        </CardHeader>
                    )}
                    <CardContent className="flex-1 min-h-0 overflow-y-auto p-0 program-view-scroll-container">
                        <ResourcesScheduler onOpenTask={(task) => setSelectedTaskId(task.id)} />
                    </CardContent>
                </Card>

                <TaskEditorDialog
                    task={selectedTask}
                    open={Boolean(selectedTask)}
                    onOpenChange={(open) => {
                        if (!open) setSelectedTaskId(null);
                    }}
                    defaultTab="card"
                />

            </div>
        );
    }

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
                            <CardTitle>{viewTitle}</CardTitle>
                            {enabledSubViews.length > 1 && <ViewToggleButtons activeView={activeView} setActiveView={setActiveView} enabledSubViews={enabledSubViews} />}
                        </div>
                    </CardHeader>
                )}
                <CardContent className="flex-1 min-h-0 overflow-y-auto p-0 program-view-scroll-container">
                    <ProgramView />
                </CardContent>
            </Card>

        </div>
    );
};

const ProgramTopView: React.FC = () => {
    return (
        <FocusModeProvider viewId="program">
            <FocusModeOverlay>
                <ProgramTopViewInner />
            </FocusModeOverlay>
        </FocusModeProvider>
    );
};

export default ProgramTopView;