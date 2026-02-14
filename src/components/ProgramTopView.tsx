import React, { useState } from 'react';
import ProgramView from './ProgramView';
import ResourcesScheduler from './ResourcesScheduler';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { TaskEditModal } from './TaskEditModal';
import { useTasks, Task } from '@/hooks/useTasks';
import { useAllTasks } from '@/hooks/useAllTasks';
import { useUserSettings } from '@/hooks/useUserSettings';

interface ProgramTopViewProps {
    onFocusOnTask: (taskId: string) => void;
}

type ActiveView = 'calendar' | 'resources';

const ProgramTopView: React.FC<ProgramTopViewProps> = ({ onFocusOnTask }) => {
    const [activeView, setActiveView] = useState<ActiveView>('calendar');
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);

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

    const ViewToggleButtons = () => (
        <div className="flex space-x-2">
            <Button
                variant={activeView === 'calendar' ? 'default' : 'outline'}
                onClick={() => setActiveView('calendar')}
            >
                Calendar
            </Button>
            <Button
                variant={activeView === 'resources' ? 'default' : 'outline'}
                onClick={() => setActiveView('resources')}
            >
                Resources
            </Button>
        </div>
    );

    return (
        <Card className="h-full flex flex-col border-none shadow-none">
            <div className="flex flex-col h-full space-y-4">
                {/* Header Area */}
                <div className="flex flex-row items-center justify-between px-1 shrink-0">
                    <h2 className="text-2xl font-bold tracking-tight">Program View</h2>
                    <ViewToggleButtons />
                </div>

                <div className="flex-1 overflow-hidden">
                    {activeView === 'calendar' ? (
                        <ProgramView onFocusOnTask={onFocusOnTask} onEditTask={setSelectedTask} />
                    ) : (
                        <ResourcesScheduler onFocusOnTask={onFocusOnTask} onEditTask={setSelectedTask} />
                    )}
                </div>
            </div>

            {selectedTask && (
                <TaskEditModal
                    task={selectedTask}
                    tasks={tasks}
                    isOpen={!!selectedTask}
                    onClose={() => setSelectedTask(null)}
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
