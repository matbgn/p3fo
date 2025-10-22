import React, { useState, useRef } from 'react';
import { useTasks, Task } from '@/hooks/useTasks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TaskCard } from './TaskCard'; // Import TaskCard
import ComparativePrioritizationView from './ComparativePrioritizationView'; // Import the new component
import { Button } from '@/components/ui/button'; // Import Button for view switching

interface PlanViewProps {
  onFocusOnTask: (taskId: string) => void;
}

const sortPlanTasks = (a: Task, b: Task) => {
  // Always prioritize tasks with an explicit priority over those without
  if (a.priority !== undefined && b.priority === undefined) {
    return -1; // a comes before b
  }
  if (a.priority === undefined && b.priority !== undefined) {
    return 1; // b comes before a
  }

  // If both have explicit priorities, sort by priority (higher value first)
  if (a.priority !== undefined && b.priority !== undefined) {
    if (a.priority !== b.priority) {
      return b.priority - a.priority; // Descending order for priority
    }
  }

  // Then by urgency
  if (a.urgent && !b.urgent) return -1;
  if (!a.urgent && b.urgent) return 1;

  // Then by impact
  if (a.impact && !b.impact) return -1;
  if (!a.impact && b.impact) return 1;

  // Fallback to creation time
  return a.createdAt - b.createdAt;
};

const PlanView: React.FC<PlanViewProps> = ({ onFocusOnTask }) => {
  const { tasks, updateStatus, updateDifficulty, updateCategory, updateTitle, deleteTask, duplicateTaskStructure, toggleUrgent, toggleImpact, toggleMajorIncident, toggleDone, toggleTimer, reparent, updateTerminationDate, updateComment, updateDurationInMinutes, updatePriority } = useTasks();

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'storyboard' | 'prioritization'>('storyboard'); // New state for view switching

  const prioritizedTasks = React.useMemo(() => {
    return tasks
      .filter(task => !task.parentId && task.triageStatus !== 'Done' && task.triageStatus !== 'Dropped') // Filter for top-level tasks
      .sort(sortPlanTasks);
  }, [tasks]); // Re-calculate only when 'tasks' changes

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetTaskId: string) => {
    e.preventDefault();
    if (!draggedTaskId || draggedTaskId === targetTaskId) {
      return;
    }

    const draggedTask = tasks.find(task => task.id === draggedTaskId);
    const targetTask = tasks.find(task => task.id === targetTaskId);
    
    if (!draggedTask || !targetTask) return;

    // Get all top-level tasks (including Done and Dropped) for priority calculation
    const allTopLevelTasks = tasks.filter(task => !task.parentId);
    // Get visible top-level tasks that are not Done or Dropped (same filter as prioritizedTasks)
    const visibleTopLevelTasks = tasks.filter(task => !task.parentId && task.triageStatus !== 'Done' && task.triageStatus !== 'Dropped');
    
    // Remove the dragged task from its current position
    const currentOrder = visibleTopLevelTasks.filter(task => task.id !== draggedTaskId);
    
    // Find the target task's position in the current order
    const targetIndex = currentOrder.findIndex(task => task.id === targetTaskId);
    
    if (targetIndex === -1 && targetTaskId !== '') {
      // If target not found in filtered list but targetTaskId is not empty, return
      return;
    }

    let newOrder;
    if (targetTaskId === '') {
      // If dropped outside specific cards, add to the end
      newOrder = [...currentOrder, draggedTask];
    } else if (targetIndex !== -1) {
      // Insert the dragged task at the target's position
      newOrder = [...currentOrder.slice(0, targetIndex), draggedTask, ...currentOrder.slice(targetIndex)];
    } else {
      // Fallback: if target task not found, add to end
      newOrder = [...currentOrder, draggedTask];
    }

    // Assign new priority values based on the new order
    // Use high enough values to ensure they override any existing priorities
    // Start from a high base and decrease for each subsequent task
    const currentMaxPriority = Math.max(...allTopLevelTasks.map(t => t.priority || 0), 0); // Calculate dynamic base priority using ALL top-level tasks
    const basePriority = currentMaxPriority + 1000; // Ensure new priorities override existing ones
    
    newOrder.forEach((task, index) => {
      const newPriority = basePriority - index; // Higher index gets lower priority number
      updatePriority(task.id, newPriority);
    });

    setDraggedTaskId(null);
  };

  const handleUpdatePriorities = (updatedTasks: { id: string; priority: number }[]) => {
    updatedTasks.forEach(task => updatePriority(task.id, task.priority));
    setActiveView('storyboard'); // Switch back to storyboard view after applying priorities
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle>Plan View</CardTitle>
        <div className="flex space-x-2">
          <Button
            variant={activeView === 'storyboard' ? 'default' : 'outline'}
            onClick={() => setActiveView('storyboard')}
          >
            Storyboard
          </Button>
          <Button
            variant={activeView === 'prioritization' ? 'default' : 'outline'}
            onClick={() => setActiveView('prioritization')}
          >
            Prioritization
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-grow overflow-hidden">
        {activeView === 'storyboard' ? (
          <div
            className="flex flex-nowrap overflow-x-auto h-full p-2 space-x-4"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, '')} // Handle drop outside of specific cards
          >
            {prioritizedTasks.length === 0 ? (
              <div className="text-muted-foreground p-4">No tasks to plan.</div>
            ) : (
              prioritizedTasks.map(task => (
                <div
                  key={task.id}
                  className="min-w-[300px] max-w-[300px] p-2 border rounded-lg shadow-sm bg-white dark:bg-gray-800"
                  draggable
                  onDragStart={(e) => handleDragStart(e, task.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, task.id)}
                  style={{
                    opacity: draggedTaskId === task.id ? 0.5 : 1,
                    border: draggedTaskId && draggedTaskId !== task.id ? '2px dashed #ccc' : '2px solid transparent',
                  }}
                >
                  <TaskCard
                    task={task}
                    tasks={tasks} // Pass all tasks for context
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
                    updateTerminationDate={updateTerminationDate}
                    updateComment={updateComment}
                    updateDurationInMinutes={updateDurationInMinutes}
                    disableReparenting={true} // Disable reparenting in PlanView
                  />
                </div>
              ))
            )}
          </div>
        ) : (
          <ComparativePrioritizationView
            tasks={prioritizedTasks}
            onUpdatePriorities={handleUpdatePriorities}
            onClose={() => setActiveView('storyboard')}
          />
        )}
      </CardContent>
    </Card>
  );
};

export default PlanView;