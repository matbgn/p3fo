import { useTasks } from '@/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import DataExporter from '@/components/DataExporter';
import DataImporter from '@/components/DataImporter';
import { useSettings } from '@/hooks/useSettings';
import { Label } from '@/components/ui/label';

const SettingsPage: React.FC = () => {
  const { clearAllTasks } = useTasks();
  const { settings, updateSettings } = useSettings();

  const handleClearData = () => {
    if (window.confirm('Are you sure you want to delete all task data? This action cannot be undone.')) {
      clearAllTasks();
    }
  };

  const handleSettingChange = (key: keyof typeof settings, value: string) => {
    updateSettings({ [key]: value });
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Settings</h1>
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Timetable Settings</h2>
          <div className="mt-4 space-y-4 max-w-xs">
            <Label htmlFor="split-time">Day Split Time</Label>
            <Input
              id="split-time"
              type="time"
              value={settings.splitTime}
              onChange={(e) => handleSettingChange('splitTime', e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Set the time used to split the day into two halves for the timetable view.
            </p>
          </div>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Metrics Settings</h2>
          <div className="mt-4 space-y-4">
            <div>
              <Label className="block text-sm font-medium mb-1">
                User Workload Percentage
              </Label>
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={settings.userWorkloadPercentage}
                  onChange={(e) => handleSettingChange('userWorkloadPercentage', e.target.value)}
                  className="w-24"
                />
                <span>%</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Your workload percentage (default: 60%)
              </p>
            </div>
            
            <div>
              <Label className="block text-sm font-medium mb-1">
                Weeks Computation
              </Label>
              <Input
                type="number"
                min="1"
                value={settings.weeksComputation}
                onChange={(e) => handleSettingChange('weeksComputation', e.target.value)}
                className="w-24"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Number of weeks to compute metrics (default: 4 weeks)
              </p>
            </div>
            
            <div>
              <Label className="block text-sm font-medium mb-1">
                High Impact Task Goal
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={settings.highImpactTaskGoal}
                onChange={(e) => handleSettingChange('highImpactTaskGoal', e.target.value)}
                className="w-24"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Target high impact tasks per EFT (default: 3.63)
              </p>
            </div>
            
            <div>
              <Label className="block text-sm font-medium mb-1">
                Failure Rate Goal (Incident on Delivery)
              </Label>
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={settings.failureRateGoal}
                  onChange={(e) => handleSettingChange('failureRateGoal', e.target.value)}
                  className="w-24"
                />
                <span>%</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Target failure rate percentage (default: 5%)
              </p>
            </div>

            <div>
              <Label className="block text-sm font-medium mb-1">
                Quality of Life Index Goal
              </Label>
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={settings.qliGoal}
                  onChange={(e) => handleSettingChange('qliGoal', e.target.value)}
                  className="w-24"
                />
                <span>%</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Target QLI score (default: 60%)
              </p>
            </div>

            <div>
              <Label className="block text-sm font-medium mb-1">
                New Capabilities Goal
              </Label>
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={settings.newCapabilitiesGoal}
                  onChange={(e) => handleSettingChange('newCapabilitiesGoal', e.target.value)}
                  className="w-24"
                />
                <span>%</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Target time spent on new capabilities (default: 57.98%)
              </p>
            </div>
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
