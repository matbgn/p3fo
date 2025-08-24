import React from 'react';
import { useTasks } from '@/hooks/useTasks';
import { Button } from '@/components/ui/button';

const DataExporter: React.FC = () => {
  const { tasks } = useTasks();

  const handleExport = () => {
    const settingsToExport = {
      userWorkloadPercentage: localStorage.getItem('userWorkloadPercentage'),
      weeksComputation: localStorage.getItem('weeksComputation'),
      highImpactTaskGoal: localStorage.getItem('highImpactTaskGoal'),
      failureRateGoal: localStorage.getItem('failureRateGoal'),
      qliGoal: localStorage.getItem('qliGoal'),
      newCapabilitiesGoal: localStorage.getItem('newCapabilitiesGoal'),
    };

    const exportData = {
      tasks,
      qolSurveyResponse: JSON.parse(localStorage.getItem('qolSurveyResponse') || '{}'),
      settings: settingsToExport,
    };

    const data = JSON.stringify(exportData, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'p3fo-export.json';
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
