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
import type { ModuleId } from '@/lib/persistence-types';

interface ProgramTopViewProps {
    onFocusOnTask: (taskId: string) => void;
}

type ActiveView = 'calendar' | 'resources';

const ProgramTopView: React.FC<ProgramTopViewProps> = ({ onFocusOnTask }) => {
    const [activeView, setActiveView] = useState<ActiveView>('calendar');
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const { pendingSubView, clearPendingSubView, disabledModules } = useViewNavigation();

    const enabledSubViews: ActiveView[] = ['calendar', 'resources'].filter(
        v => !disabledModules.includes(`program.${v}` as ModuleId)
    ) as ActiveView[];

    // Auto-select enabled sub-view if current is disabled
    useEffect(() => {
        if (enabledSubViews.length > 0 && !enabledSubViews.includes(activeView)) {
            setActiveView(enabledSubViews[0]);
        }
    }, [enabledSubViews, activeView]);

    // Consume pending sub-view from Umbrella navigation
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

    // Get fresh task from store based on selectedTaskId to ensure UI stays in sync
    const selectedTask = React.useMemo(() => {
        if (!selectedTaskId) return null;
        return tasks.find(t => t.id === selectedTaskId) || null;
    }, [selectedTaskId, tasks]);

    const ViewToggleButtons = () => (
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
    );

    return (
        <Card className="h-full flex flex-col border-none shadow-none">
            <div className="flex flex-col h-full space-y-4">
                {/* Header Area */}
                <div className="flex flex-row items-center justify-between px-1 shrink-0">
                    <h2 className="text-2xl font-bold tracking-tight">Program View</h2>
                    {enabledSubViews.length > 1 && <ViewToggleButtons />}
                </div>

                <div className="flex-1 overflow-hidden">
                    {activeView === 'resources' && enabledSubViews.includes('resources') ? (
                        <ResourcesScheduler onFocusOnTask={onFocusOnTask} onEditTask={(task) => setSelectedTaskId(task.id)} />
                    ) : (
                        <ProgramView onFocusOnTask={onFocusOnTask} onEditTask={(task) => setSelectedTaskId(task.id)} />
                    )}
                </div>
            </div>

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
        </Card>
    );
};

export default ProgramTopView;
