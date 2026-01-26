
import { version } from '../../package.json';
import { useTasks } from '@/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import DataExporter from '@/components/DataExporter';
import DataImporter from '@/components/DataImporter';
import { useCombinedSettings } from '@/hooks/useCombinedSettings';
import { Label } from '@/components/ui/label';
import { UserManagement } from '@/components/UserManagement';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CompactnessSelector } from '@/components/CompactnessSelector';

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

  const handleSettingChange = (key: keyof typeof settings, value: string, scope?: 'user' | 'global') => {
    if (key === 'splitTime' || key === 'defaultPlanView' || key === 'timezone' || key === 'country' || key === 'region') {
      updateSettings({ [key]: value }, scope);
    } else {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        // we know the key matches and value is number
        updateSettings({ [key]: numValue }, scope);
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

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    Start of Week
                  </Label>
                  <RadioGroup
                    value={settings.weekStartDay?.toString() || "1"}
                    onValueChange={(value) => handleSettingChange('weekStartDay', value)}
                    className="flex flex-col space-y-1 mt-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="1" id="week-start-monday" />
                      <Label htmlFor="week-start-monday">Monday</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="0" id="week-start-sunday" />
                      <Label htmlFor="week-start-sunday">Sunday</Label>
                    </div>
                  </RadioGroup>
                  <p className="text-sm text-muted-foreground mt-1">
                    Choose which day the week starts on.
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    Default Plan View
                  </Label>
                  <RadioGroup
                    value={settings.defaultPlanView || "week"}
                    onValueChange={(value) => handleSettingChange('defaultPlanView', value)}
                    className="flex flex-col space-y-1 mt-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="week" id="plan-view-week" />
                      <Label htmlFor="plan-view-week">Week</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="month" id="plan-view-month" />
                      <Label htmlFor="plan-view-month">Month</Label>
                    </div>
                  </RadioGroup>
                  <p className="text-sm text-muted-foreground mt-1">
                    Choose the default view for the Program/Plan page.
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    Card Compactness
                  </Label>
                  <div className="mt-2">
                    <CompactnessSelector />
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Adjust the compactness of task cards.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t">
              <h2 className="text-xl font-semibold mb-4">Personal Location Settings</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Override workspace defaults with your specific location settings.
              </p>
              <div className="space-y-6 max-w-md">
                <div>
                  <Label className="block text-sm font-medium mb-1">
                    My Timezone
                  </Label>
                  <Input
                    type="text"
                    value={settings.timezone}
                    onChange={(e) => handleSettingChange('timezone', e.target.value, 'user')}
                    className="mt-2"
                    placeholder="Europe/Zurich"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Your local timezone (overrides workspace default)
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="workspace" className="space-y-8 mt-0">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Version:</span>
              <span className="font-mono bg-muted px-2 py-0.5 rounded">v{version}</span>
            </div>

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
                    onChange={(e) => handleSettingChange('weeksComputation', e.target.value, 'global')}
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
                    onChange={(e) => handleSettingChange('highImpactTaskGoal', e.target.value, 'global')}
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
                      onChange={(e) => handleSettingChange('failureRateGoal', e.target.value, 'global')}
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
                      onChange={(e) => handleSettingChange('qliGoal', e.target.value, 'global')}
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
                      onChange={(e) => handleSettingChange('newCapabilitiesGoal', e.target.value, 'global')}
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
              <h2 className="text-xl font-semibold mb-4">Time & Hours</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
                <div>
                  <Label className="block text-sm font-medium mb-1">
                    Standard Daily Hours
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={settings.hoursToBeDoneByDay}
                    onChange={(e) => handleSettingChange('hoursToBeDoneByDay', e.target.value, 'global')}
                    className="w-24 mt-2"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Standard working hours per day (default: 8)
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    Vacation Limit Multiplier
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={settings.vacationLimitMultiplier}
                    onChange={(e) => handleSettingChange('vacationLimitMultiplier', e.target.value, 'global')}
                    className="w-24 mt-2"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Multiplier for max vacation balance (default: 1.5)
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    Hourly Balance Upper Limit Multiplier
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={settings.hourlyBalanceLimitUpper}
                    onChange={(e) => handleSettingChange('hourlyBalanceLimitUpper', e.target.value, 'global')}
                    className="w-24 mt-2"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Multiplier for upper hourly balance limit (default: 0.5)
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    Hourly Balance Lower Limit Multiplier
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={settings.hourlyBalanceLimitLower}
                    onChange={(e) => handleSettingChange('hourlyBalanceLimitLower', e.target.value, 'global')}
                    className="w-24 mt-2"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Multiplier for lower hourly balance limit (default: -0.5)
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    Timezone
                  </Label>
                  <Input
                    type="text"
                    value={settings.timezone}
                    onChange={(e) => handleSettingChange('timezone', e.target.value, 'global')}
                    className="mt-2"
                    placeholder="Europe/Zurich"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    IANA Timezone identifier (default: Europe/Zurich)
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    Country
                  </Label>
                  <Input
                    type="text"
                    value={settings.country}
                    onChange={(e) => handleSettingChange('country', e.target.value, 'global')}
                    className="w-24 mt-2"
                    placeholder="CH"
                    maxLength={2}
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Country code for holidays (default: CH)
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    Region
                  </Label>
                  <Input
                    type="text"
                    value={settings.region}
                    onChange={(e) => handleSettingChange('region', e.target.value, 'global')}
                    className="w-24 mt-2"
                    placeholder="BE"
                    maxLength={2}
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Region code for holidays (default: BE)
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
