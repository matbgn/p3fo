
import { useTasks } from '@/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import DataExporter from '@/components/DataExporter';
import DataImporter from '@/components/DataImporter';
import { useCombinedSettings } from '@/hooks/useCombinedSettings';
import { Label } from '@/components/ui/label';
import { UserManagement } from '@/components/UserManagement';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SettingsPage: React.FC = () => {
  const { clearAllTasks, clearAllUsers } = useTasks();
  const { settings, updateSettings } = useCombinedSettings();

  const handleClearData = async () => {
    if (window.confirm('Are you sure you want to delete all task data? This action cannot be undone.')) {
      await clearAllTasks();
      await clearAllUsers();
      // Also clear app settings if needed, but for now just tasks and users as requested
    }
  };

  const handleSettingChange = (key: keyof typeof settings, value: string) => {
    if (key === 'splitTime') {
      updateSettings({ [key]: value });
    } else {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        // we know the key matches and value is number
        updateSettings({ [key]: numValue });
      }
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <Tabs defaultValue="user" className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start border-b rounded-none p-0 h-auto bg-transparent">
          <TabsTrigger
            value="user"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
          >
            User Settings
          </TabsTrigger>
          <TabsTrigger
            value="workspace"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
          >
            Workspace Settings
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-auto py-6">
          <TabsContent value="user" className="space-y-6 mt-0">
            <div>
              <h2 className="text-xl font-semibold mb-4">Personal Preferences</h2>
              <div className="space-y-6 max-w-md">
                <div>
                  <Label htmlFor="split-time">Day Split Time</Label>
                  <div className="mt-2">
                    <Input
                      id="split-time"
                      type="time"
                      value={settings.splitTime}
                      onChange={(e) => handleSettingChange('splitTime', e.target.value)}
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                      Set the time used to split the day into two halves for the timetable view.
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    User Workload Percentage
                  </Label>
                  <div className="flex items-center space-x-2 mt-2">
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
              </div>
            </div>
          </TabsContent>

          <TabsContent value="workspace" className="space-y-8 mt-0">
            <div>
              <h2 className="text-xl font-semibold mb-4">Metrics Goals</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
                <div>
                  <Label className="block text-sm font-medium mb-1">
                    Weeks Computation
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    value={settings.weeksComputation}
                    onChange={(e) => handleSettingChange('weeksComputation', e.target.value)}
                    className="w-24 mt-2"
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
                    className="w-24 mt-2"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Target high impact tasks per EFT (default: 3.63)
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    Failure Rate Goal (Incident on Delivery)
                  </Label>
                  <div className="flex items-center space-x-2 mt-2">
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
                  <div className="flex items-center space-x-2 mt-2">
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
                  <div className="flex items-center space-x-2 mt-2">
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

            <div className="pt-6 border-t">
              <UserManagement />
            </div>

            <div className="pt-6 border-t">
              <h2 className="text-xl font-semibold mb-4">Data Management</h2>
              <p className="text-muted-foreground mb-4">
                Export, import, or clear all tasks and timer data from the application.
              </p>
              <div className="flex space-x-2">
                <DataImporter />
                <DataExporter />
                <Button variant="destructive" onClick={handleClearData}>
                  Clear All Data
                </Button>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default SettingsPage;
