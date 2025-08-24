import React from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ResizablePanel,
  ResizablePanelGroup,
  ResizableHandle,
} from '@/components/ui/resizable';
import { useTasks, Task } from '@/hooks/useTasks';
import { TaskCard } from './TaskCard';

const localizer = momentLocalizer(moment);

interface ProgramViewProps {
  onFocusOnTask: (taskId: string) => void;
}

const ProgramView: React.FC<ProgramViewProps> = ({ onFocusOnTask }) => {
  const {
    tasks,
    updateStatus,
    updateDifficulty,
    updateCategory,
    updateTitle,
    deleteTask,
    duplicateTaskStructure,
    toggleUrgent,
    toggleImpact,
    toggleMajorIncident,
    toggleDone,
    toggleTimer,
    reparent,
  } = useTasks();

  const parentTasks = tasks.filter(task => task.children && task.children.length > 0);
  const tasksWithoutTerminationDate = parentTasks.filter(task => !task.terminationDate);

  const events = parentTasks
    .filter(task => task.terminationDate)
    .map(task => ({
      title: task.title,
      start: new Date(task.createdAt),
      end: new Date(task.terminationDate!),
      allDay: false,
      resource: task,
    }));

  return (
    <ResizablePanelGroup direction="vertical" className="min-h-[800px]">
      <ResizablePanel defaultSize={70}>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Program Calendar</CardTitle>
          </CardHeader>
          <CardContent className="overflow-y-auto">
            <Calendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              style={{ height: '100%' }}
              view="week"
              views={['week']}
            />
          </CardContent>
        </Card>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={30}>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>In Progress (No Termination Date)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-row flex-wrap gap-2 overflow-x-auto">
            {tasksWithoutTerminationDate.map(task => (
              <div key={task.id} className="w-64">
                <TaskCard
                  task={task}
                  tasks={tasks}
                  updateStatus={updateStatus}
                  updateDifficulty={updateDifficulty}
                  updateCategory={updateCategory}
                  updateTitle={updateTitle}
                  deleteTask={deleteTask}
                  duplicateTaskStructure={duplicateTaskStructure}
                  toggleUrgent={toggleUrgent}
                  toggleImpact={toggleImpact}
                  toggleMajorIncident={toggleMajorIncident}
                  toggleDone={() => toggleDone(task.id)}
                  toggleTimer={toggleTimer}
                  reparent={reparent}
                  onFocusOnTask={onFocusOnTask}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};

export default ProgramView;