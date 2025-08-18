import React from 'react';
import { useTasks } from '@/hooks/useTasks';
import { Button } from '@/components/ui/button';

const DataExporter: React.FC = () => {
  const { tasks } = useTasks();

  const handleExport = () => {
    const data = JSON.stringify(tasks, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tasks.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button onClick={handleExport}>
      Export Data
    </Button>
  );
};

export default DataExporter;
