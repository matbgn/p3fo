import React, { useRef, useEffect } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ResizablePanel,
  ResizablePanelGroup,
  ResizableHandle,
} from '@/components/ui/resizable';
import { useTasks, Task } from '@/hooks/useTasks';
import { TaskCard } from './TaskCard';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, CircleDot, Flame } from 'lucide-react';

const localizer = momentLocalizer(moment);

interface ProgramViewProps {
  onFocusOnTask: (taskId: string) => void;
}

const ProgramView: React.FC<ProgramViewProps> = ({ onFocusOnTask }) => {
  const [selectedTask, setSelectedTask] = React.useState<Task | null>(null);
  const [view, setView] = React.useState('week');
  const calendarRef = useRef<any>(null); // Ref for the Calendar component

  useEffect(() => {
    if (calendarRef.current) {
      const scrollToTime = new Date();
      scrollToTime.setHours(12, 0, 0); // Set to 12 PM for middle of the day
      calendarRef.current.get ;
    }
  }, [view]); // Re-scroll if view changes
  const {
    tasks,
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
    toggleDone,
    toggleTimer,
    reparent,
    updateTerminationDate,
    updateComment,
    updateDurationInMinutes, // Add updateDurationInMinutes here
  } = useTasks();

  const parentTasks = tasks.filter(
    task =>
      !task.parentId && // Only top-level tasks
      task.triageStatus !== 'Done' &&
      task.triageStatus !== 'Dropped'
  );
  const tasksWithoutTerminationDate = parentTasks.filter(task => !task.terminationDate);

  const events = parentTasks
    .filter(
      task =>
        task.terminationDate &&
        task.triageStatus !== 'Done' &&
        task.triageStatus !== 'Dropped'
    )
    .map(task => {
      const startDate = new Date(task.terminationDate!);
      const duration = task.durationInMinutes;
      const isAllDayEvent = startDate.getHours() === 0 && startDate.getMinutes() === 0 && startDate.getSeconds() === 0;

      if (duration) {
        const endDate = new Date(startDate.getTime() + duration * 60000);
        return {
          title: task.title,
          start: startDate,
          end: endDate,
          allDay: false,
          resource: task,
        };
      } else {
        if (isAllDayEvent) {
          return {
            title: task.title,
            start: startDate,
            end: startDate,
            allDay: true,
            resource: task,
          };
        } else {
          const endDate = new Date(startDate.getTime() + 120 * 60000);
          return {
            title: task.title,
            start: startDate,
            end: endDate,
            allDay: false,
            resource: task,
          };
        }
      }
    });

  return (
    <ResizablePanelGroup direction="vertical" className="min-h-[850px]">
      <ResizablePanel>
        <Card className="h-full min-h-0 flex flex-col">
          <CardHeader>
            <CardTitle>Program Calendar</CardTitle>
          </CardHeader>
          <CardContent className="h-full overflow-y-auto flex-grow">
            <Calendar
              ref={calendarRef}
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              style={{ height: '100%' }}
              view={view as any}
              onView={v => setView(v as any)}
              views={['week', 'month']}
              onSelectEvent={(event) => setSelectedTask(event.resource)}
              defaultView="week"
              defaultDate={new Date()}
              scrollToTime={new Date(0, 0, 0, 4, 0, 0)} // Scroll to 4 PM by default
              formats={{
                eventTimeRangeFormat: ({ start, end }, culture, local) => {
                  const startTime = local.format(start, 'HH:mm', culture);
                  // If start and end times are the same, only show start time
                  if (moment(start).isSame(end)) {
                    return startTime;
                  }
                  const endTime = local.format(end, 'HH:mm', culture);
                  return `${startTime} - ${endTime}`;
                },
              }}
              eventPropGetter={(event) => ({
                style: {
                  backgroundColor: event.resource.urgent ? '#dc2626' :
                                  event.resource.impact ? '#ca8a04' :
                                  event.resource.majorIncident ? '#991b1b' : '#3b82f6',
                  borderColor: 'transparent',
                  borderRadius: '4px',
                  color: 'white',
                }
              })}
              components={{
                event: ({ event }) => (
                  <div className="p-1 text-xs">
                    <div className="font-semibold truncate">{event.title}</div>
                    <div className="flex gap-1 mt-1">
                      {event.resource.urgent && (
                        <AlertTriangle className="h-3 w-3 text-red-300" />
                      )}
                      {event.resource.impact && (
                        <CircleDot className="h-3 w-3 text-yellow-300" />
                      )}
                      {event.resource.majorIncident && (
                        <Flame className="h-3 w-3 text-red-200" />
                      )}
                    </div>
                  </div>
                )
              }}
            />
          </CardContent>
        </Card>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={7} collapsible={true} collapsedSize={7} minSize={7}>
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center justify-left">
              <span>In Progress (No Termination Date)</span>
              <Badge variant="secondary" className="ml-2">
                {tasksWithoutTerminationDate.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-row flex-wrap gap-2 overflow-x-auto">
            {tasksWithoutTerminationDate
              .sort((a, b) => {
                // First, sort by priority if it exists
                if (a.priority !== undefined && b.priority !== undefined) {
                  return a.priority - b.priority; // Lower number means higher priority
                } else if (a.priority !== undefined) {
                  return -1; // Tasks with priority come first
                } else if (b.priority !== undefined) {
                  return 1; // Tasks with priority come first
                }
                // If no priority, maintain original order (by creation date)
                return a.createdAt - b.createdAt;
              })
              .map(task => (
              <div key={task.id} className="w-64">
                <TaskCard
                  task={task}
                  tasks={tasks}
                  updateStatus={updateStatus}
                  updateDifficulty={updateDifficulty}
                  updateCategory={updateCategory}
                  updateTitle={updateTitle}
                  updateUser={updateUser}
                  deleteTask={deleteTask}
                  duplicateTaskStructure={duplicateTaskStructure}
                  toggleUrgent={toggleUrgent}
                  toggleImpact={toggleImpact}
                  toggleMajorIncident={toggleMajorIncident}
                  toggleDone={() => toggleDone(task.id)}
                  toggleTimer={toggleTimer}
                  reparent={reparent}
                  onFocusOnTask={onFocusOnTask}
                  updateTerminationDate={updateTerminationDate}
                  updateComment={updateComment}
                  updateDurationInMinutes={updateDurationInMinutes} // Pass updateDurationInMinutes here
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </ResizablePanel>
      {selectedTask && (
        <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Task</DialogTitle>
            </DialogHeader>
            <TaskCard
              task={selectedTask}
              tasks={tasks}
              updateStatus={updateStatus}
              updateDifficulty={updateDifficulty}
              updateCategory={updateCategory}
              updateTitle={updateTitle}
              updateUser={updateUser}
              deleteTask={deleteTask}
              duplicateTaskStructure={duplicateTaskStructure}
              toggleUrgent={toggleUrgent}
              toggleImpact={toggleImpact}
              toggleMajorIncident={toggleMajorIncident}
              toggleDone={() => toggleDone(selectedTask.id)}
              toggleTimer={toggleTimer}
              reparent={reparent}
              onFocusOnTask={onFocusOnTask}
              updateTerminationDate={updateTerminationDate}
              updateComment={updateComment}
              updateDurationInMinutes={updateDurationInMinutes}
            />
          </DialogContent>
        </Dialog>
      )}
    </ResizablePanelGroup>
  );
};

export default ProgramView;