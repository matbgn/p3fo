import React, { useState, useEffect } from 'react';
import ProgramView from './ProgramView';
import ResourcesScheduler from './ResourcesScheduler';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { TaskEditModal } from './TaskEditModal';
import { useTasks, Task } from '@/hooks/useTasks';
import { useAllTasks } from '@/hooks/useAllTasks';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useViewNavigation } from '@/hooks/useView';
import { FocusModeProvider } from '@/components/FocusModeProvider';
import { FocusModeOverlay } from '@/components/FocusModeOverlay';
import { FocusModeBar } from '@/components/planView/FocusModeBar';
import { useFocusMode } from '@/hooks/useFocusMode';
import type { ModuleId } from '@/lib/persistence-types';

interface ProgramTopViewProps {
    onFocusOnTask: (taskId: string) => void;
}

type ActiveView = 'calendar' | 'resources';

const ViewToggleButtons: React.FC<{ activeView: ActiveView; setActiveView: (v: ActiveView) => void; enabledSubViews: ActiveView[] }> = React.memo(({ activeView, setActiveView, enabledSubViews }) => (
    <div className="flex space-x-2">
        {enabledSubViews.includes('calendar') && (
        <Button
            variant={activeView === 'calendar' ? 'default' : 'outline'}
            onClick={() => setActiveView('calendar')}
        >
            Calendar
        </Button>
        )}
        {enabledSubViews.includes('resources') && (
        <Button
            variant={activeView === 'resources' ? 'default' : 'outline'}
            onClick={() => setActiveView('resources')}
        >
            Resources
        </Button>
        )}
    </div>
));

const ProgramTopViewInner: React.FC<ProgramTopViewProps> = ({ onFocusOnTask }) => {
    const [activeView, setActiveView] = useState<ActiveView>('calendar');
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const { pendingSubView, clearPendingSubView, disabledModules } = useViewNavigation();
    const { isFocusMode } = useFocusMode();

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

    const {
        updateStatus,
        updateDifficulty,
        updateCategory,
        updateTitle,
        updateUser,
        deleteTask,
        duplicateTaskStructure,
        toggleUrgent,
        toggleImpact,
        toggleMajorIncident,
        toggleSprintTarget,
        toggleDone,
        toggleTimer,
        reparent,
        updateTerminationDate,
        updateComment,
        updateDurationInMinutes,
    } = useTasks();
    const { tasks } = useAllTasks();
    const { userId: currentUserId } = useUserSettings();

    const selectedTask = React.useMemo(() => {
        if (!selectedTaskId) return null;
        return tasks.find(t => t.id === selectedTaskId) || null;
    }, [selectedTaskId, tasks]);

    const viewTitle = activeView === 'calendar' ? 'Program Calendar' : 'Resources';

    const editTaskHandler = (task: Task) => setSelectedTaskId(task.id);

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
                    <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
                        <ResourcesScheduler onFocusOnTask={onFocusOnTask} onEditTask={editTaskHandler} />
                    </CardContent>
                </Card>

                {selectedTask && (
                    <TaskEditModal
                        task={selectedTask}
                        tasks={tasks}
                        isOpen={!!selectedTask}
                        onClose={() => setSelectedTaskId(null)}
                        updateStatus={updateStatus}
                        updateDifficulty={updateDifficulty}
                        updateCategory={updateCategory}
                        updateTitle={updateTitle}
                        updateUser={(id, userId) => updateUser(id, userId === 'current-user' ? currentUserId : userId)}
                        toggleUrgent={toggleUrgent}
                        toggleImpact={toggleImpact}
                        toggleMajorIncident={toggleMajorIncident}
                        toggleSprintTarget={toggleSprintTarget}
                        onToggleTimer={toggleTimer}
                        updateTerminationDate={updateTerminationDate}
                        updateComment={updateComment}
                        updateDurationInMinutes={updateDurationInMinutes}
                        currentUserId={currentUserId}
                    />
                )}
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
                <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
                    <ProgramView onFocusOnTask={onFocusOnTask} onEditTask={editTaskHandler} />
                </CardContent>
            </Card>

            {selectedTask && (
                <TaskEditModal
                    task={selectedTask}
                    tasks={tasks}
                    isOpen={!!selectedTask}
                    onClose={() => setSelectedTaskId(null)}
                    updateStatus={updateStatus}
                    updateDifficulty={updateDifficulty}
                    updateCategory={updateCategory}
                    updateTitle={updateTitle}
                    updateUser={(id, userId) => updateUser(id, userId === 'current-user' ? currentUserId : userId)}
                    toggleUrgent={toggleUrgent}
                    toggleImpact={toggleImpact}
                    toggleMajorIncident={toggleMajorIncident}
                    toggleSprintTarget={toggleSprintTarget}
                    onToggleTimer={toggleTimer}
                    updateTerminationDate={updateTerminationDate}
                    updateComment={updateComment}
                    updateDurationInMinutes={updateDurationInMinutes}
                    currentUserId={currentUserId}
                />
            )}
        </div>
    );
};

const ProgramTopView: React.FC<ProgramTopViewProps> = ({ onFocusOnTask }) => {
    return (
        <FocusModeProvider viewId="program">
            <FocusModeOverlay>
                <ProgramTopViewInner onFocusOnTask={onFocusOnTask} />
            </FocusModeOverlay>
        </FocusModeProvider>
    );
};

export default ProgramTopView;