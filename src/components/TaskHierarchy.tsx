import React from 'react';
import { TaskTag } from './TaskTag';

interface TaskHierarchyProps {
  task: any;
  taskMap: Record<string, any>;
}

export const TaskHierarchy: React.FC<TaskHierarchyProps> = ({ task, taskMap }) => {
  const getHierarchy = (currentTask: any) => {
    const hierarchy = [];
    let parent = currentTask.parentId ? taskMap[currentTask.parentId] : null;
    while (parent) {
      hierarchy.unshift(parent);
      parent = parent.parentId ? taskMap[parent.parentId] : null;
    }
    return hierarchy;
  };

  const hierarchy = getHierarchy(task);

  if (hierarchy.length === 0) {
    return null;
  }

  return (
    <div className="text-xs italic text-muted-foreground flex items-center gap-2 mt-1">
      {hierarchy.map((p, index) => (
        <React.Fragment key={p.id}>
          <span>{p.title}</span>
          <TaskTag 
            impact={p.impact}
            urgent={p.urgent}
            majorIncident={p.majorIncident}
          />
          {index < hierarchy.length - 1 && <span className="mx-1">{'>'}</span>}
        </React.Fragment>
      ))}
    </div>
  );
};