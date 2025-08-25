import React, { useState, useEffect } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import DataExporter from '@/components/DataExporter';
import DataImporter from '@/components/DataImporter';

const SettingsPage: React.FC = () => {
  const { clearAllTasks } = useTasks();
  
  // State for settings
  const [userWorkloadPercentage, setUserWorkloadPercentage] = useState<string>('60');
  const [weeksComputation, setWeeksComputation] = useState<string>('4');
  const [highImpactTaskGoal, setHighImpactTaskGoal] = useState<string>('3.63');
  const [failureRateGoal, setFailureRateGoal] = useState<string>('5');
  const [qliGoal, setQliGoal] = useState<string>('60');
  const [newCapabilitiesGoal, setNewCapabilitiesGoal] = useState<string>('57.98');

  // Load settings from localStorage on component mount
  useEffect(() => {
    const savedWorkload = localStorage.getItem('userWorkloadPercentage');
    if (savedWorkload) {
      setUserWorkloadPercentage((parseFloat(savedWorkload) * 100).toString());
    }
    
    const savedWeeks = localStorage.getItem('weeksComputation');
    if (savedWeeks) {
      setWeeksComputation(savedWeeks);
    }
    
    const savedHighImpactGoal = localStorage.getItem('highImpactTaskGoal');
    if (savedHighImpactGoal) {
      setHighImpactTaskGoal(savedHighImpactGoal);
    }
    
    const savedFailureRateGoal = localStorage.getItem('failureRateGoal');
    if (savedFailureRateGoal) {
      setFailureRateGoal(savedFailureRateGoal);
    }

    const savedQliGoal = localStorage.getItem('qliGoal');
    if (savedQliGoal) {
      setQliGoal(savedQliGoal);
    }

    const savedNewCapabilitiesGoal = localStorage.getItem('newCapabilitiesGoal');
    if (savedNewCapabilitiesGoal) {
      setNewCapabilitiesGoal(savedNewCapabilitiesGoal);
    }
  }, []);
  
  // Save settings to localStorage
  const saveSettings = () => {
    localStorage.setItem('userWorkloadPercentage', (parseInt(userWorkloadPercentage) / 100).toString());
    localStorage.setItem('weeksComputation', weeksComputation);
    localStorage.setItem('highImpactTaskGoal', highImpactTaskGoal);
    localStorage.setItem('failureRateGoal', failureRateGoal);
    localStorage.setItem('qliGoal', qliGoal);
    localStorage.setItem('newCapabilitiesGoal', newCapabilitiesGoal);
    
    alert('Settings saved successfully!');
  };

  const handleClearData = () => {
    if (window.confirm('Are you sure you want to delete all task data? This action cannot be undone.')) {
      clearAllTasks();
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Settings</h1>
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Metrics Settings</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                User Workload Percentage
              </label>
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={userWorkloadPercentage}
                  onChange={(e) => setUserWorkloadPercentage(e.target.value)}
                  className="w-24"
                />
                <span>%</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Your workload percentage (default: 60%)
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">
                Weeks Computation
              </label>
              <Input
                type="number"
                min="1"
                value={weeksComputation}
                onChange={(e) => setWeeksComputation(e.target.value)}
                className="w-24"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Number of weeks to compute metrics (default: 4 weeks)
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">
                High Impact Task Goal
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={highImpactTaskGoal}
                onChange={(e) => setHighImpactTaskGoal(e.target.value)}
                className="w-24"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Target high impact tasks per EFT (default: 3.63)
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">
                Failure Rate Goal (Incident on Delivery)
              </label>
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={failureRateGoal}
                  onChange={(e) => setFailureRateGoal(e.target.value)}
                  className="w-24"
                />
                <span>%</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Target failure rate percentage (default: 5%)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Quality of Life Index Goal
              </label>
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={qliGoal}
                  onChange={(e) => setQliGoal(e.target.value)}
                  className="w-24"
                />
                <span>%</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Target QLI score (default: 60%)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                New Capabilities Goal
              </label>
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={newCapabilitiesGoal}
                  onChange={(e) => setNewCapabilitiesGoal(e.target.value)}
                  className="w-24"
                />
                <span>%</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Target time spent on new capabilities (default: 57.98%)
              </p>
            </div>

            <Button onClick={saveSettings}>Save Settings</Button>
          </div>
        </div>
        
        <div>
          <h2 className="text-xl font-semibold">Data Management</h2>
          <p className="text-muted-foreground">
            Export, import, or clear all tasks and timer data from the application.
          </p>
          <div className="flex space-x-2 mt-2">
            <DataImporter />
            <DataExporter />
            <Button variant="destructive" onClick={handleClearData}>
              Clear All Data
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
