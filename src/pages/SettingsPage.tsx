
import { version } from '../../package.json';
import { useTasks } from '@/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getPersistenceAdapter } from '@/lib/persistence-factory';
import DataExporter from '@/components/DataExporter';
import DataImporter from '@/components/DataImporter';
import { useSettingsContext } from '@/context/SettingsContext';
import { Label } from '@/components/ui/label';
import { UserManagement } from '@/components/UserManagement';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CompactnessSelector } from '@/components/CompactnessSelector';
import { DaySelector } from '@/components/ui/day-selector';
import { Clock } from 'lucide-react';
import { TimePickerDialog } from '@/components/ui/time-picker-dialog';
import { Switch } from '@/components/ui/switch';
import { useState } from 'react';
import type { ModuleId } from '@/lib/persistence-types';
import PomodoroSettings from '@/components/PomodoroSettings';
import TravelerSettings from '@/components/TravelerSettings';
import FocusModeSettings from '@/components/FocusModeSettings';
import { TemplateManager } from '@/components/TemplateManager';

const ALL_MODULES: { id: ModuleId; label: string; description: string; isTopLevel: boolean }[] = [
  { id: 'celebration', label: 'Celebration', description: 'Fertilization Board for achievements and celebrations', isTopLevel: true },
  { id: 'dream', label: 'Dream', description: 'Dream Board, Storyboard, and Prioritization views', isTopLevel: true },
  { id: 'dream.dream', label: 'Dream Board', description: 'Dream Board sub-view within Dream', isTopLevel: false },
  { id: 'dream.storyboard', label: 'Storyboard', description: 'Storyboard sub-view within Dream', isTopLevel: false },
  { id: 'dream.prioritization', label: 'Prioritization', description: 'Prioritization sub-view within Dream', isTopLevel: false },
  { id: 'plan', label: 'Plan', description: 'Circles and Roles organizational views', isTopLevel: true },
  { id: 'plan.circles', label: 'Circles', description: 'Organizational circles sub-view within Plan', isTopLevel: false },
  { id: 'plan.roles', label: 'Roles', description: 'Roles sub-view within Plan', isTopLevel: false },
  { id: 'program', label: 'Program', description: 'Calendar and Resources scheduling views', isTopLevel: true },
  { id: 'program.calendar', label: 'Calendar', description: 'Calendar sub-view within Program', isTopLevel: false },
  { id: 'program.resources', label: 'Resources', description: 'Resources sub-view within Program', isTopLevel: false },
  { id: 'kanban', label: 'Project', description: 'Kanban board for project management', isTopLevel: true },
  { id: 'focus', label: 'Focus', description: 'Focus mode for concentrated task work', isTopLevel: true },
  { id: 'timetable', label: 'Timetable', description: 'Time-based view for hourly planning', isTopLevel: true },
  { id: 'metrics', label: 'Metrics', description: 'Performance metrics and dashboards', isTopLevel: true },
  { id: 'voting', label: 'Voting', description: 'Run polls and formal decisions with your audience', isTopLevel: true },
];

const SettingsPage: React.FC = () => {
  const { clearAllTasks, clearAllUsers } = useTasks();
  const { settings, updateSettings } = useSettingsContext();
  const [timePickerOpen, setTimePickerOpen] = useState(false);

  // Helper to convert "HH:mm" string to timestamp for time picker
  const splitTimeToTimestamp = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.getTime();
  };

  // Helper to convert timestamp back to "HH:mm" format
  const timestampToSplitTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const handleClearData = async () => {
    if (window.confirm('Are you sure you want to delete ALL application data? This action cannot be undone and will remove all tasks, settings, users, and boards.')) {
      const adapter = await getPersistenceAdapter();
      await adapter.clearAllData();
      window.location.reload();
    }
  };

  const handleSettingChange = (key: keyof typeof settings, value: string | Record<string, number> | number | ModuleId[], scope?: 'user' | 'global') => {
    if (key === 'preferredWorkingDays') {
      updateSettings({ [key]: value as Record<string, number> }, scope);
      return;
    }

    if (key === 'disabledModules') {
      updateSettings({ [key]: value as ModuleId[] }, scope);
      return;
    }

    if (key === 'splitTime' || key === 'defaultPlanView' || key === 'timezone' || key === 'country' || key === 'region') {
      updateSettings({ [key]: value as string }, scope);
    } else {
      const numValue = typeof value === 'string' ? parseFloat(value) : value as number;
      // check if it is number
      if (typeof numValue === 'number' && !isNaN(numValue)) {
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
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => setTimePickerOpen(true)}
                    >
                      <Clock className="mr-2 h-4 w-4" />
                      {settings.splitTime || "Set time..."}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Set the time used to split the day into two halves for the timetable view.
                  </p>
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
                    User Trigram
                  </Label>
                  <Input
                    type="text"
                    maxLength={3}
                    value={settings.trigram || ''}
                    onChange={(e) => handleSettingChange('trigram', e.target.value.toUpperCase())}
                    className="w-24 mt-2 uppercase"
                    placeholder="XYZ"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Your 3-letter identifier (e.g., MAB)
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

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    Preferred Working Days
                  </Label>
                  <div className="mt-2">
                    <DaySelector
                      value={settings.preferredWorkingDays}
                      onChange={(val) => handleSettingChange('preferredWorkingDays', val)}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Select the days you typically work.
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

            <div className="pt-6 border-t">
              <PomodoroSettings />
            </div>

            <div className="pt-6 border-t">
              <TravelerSettings />
            </div>

            <div className="pt-6 border-t">
              <FocusModeSettings />
            </div>

            <div className="pt-6 border-t">
              <h2 className="text-xl font-semibold mb-2">My Personal Templates</h2>
              <p className="text-muted-foreground mb-4">
                Your personal templates, complementing the workspace templates. Available only to you.
              </p>
              <TemplateManager scope="user" />
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

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    Card Aging Base Days
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    value={settings.cardAgingBaseDays}
                    onChange={(e) => handleSettingChange('cardAgingBaseDays', parseFloat(e.target.value) || 0, 'global')}
                    className="w-24 mt-2"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Days before cards show aging effects. Set to 0 to disable. (default: 30). Use decimals like 0.005 for testing (~7 min).
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    WIP Limit Per User
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={settings.wipLimitPerUser}
                    onChange={(e) => handleSettingChange('wipLimitPerUser', parseInt(e.target.value) || 0, 'global')}
                    className="w-24 mt-2"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Maximum tasks in WIP per user. Set to 0 to disable. (default: 5). Hard block — tasks cannot enter WIP when at capacity.
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    Non-Action Period (hours)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={settings.nonActionPeriodHours}
                    onChange={(e) => handleSettingChange('nonActionPeriodHours', parseFloat(e.target.value) || 0, 'user')}
                    className="w-24 mt-2"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Hours of inactivity before the mood selector appears. Set to 0 to disable. (default: 3).
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t">
              <h2 className="text-xl font-semibold mb-2">Task Templates</h2>
              <p className="text-muted-foreground mb-4">
                Templates scaffold common workflows as a parent task with predefined children. Any team member can create workspace templates.
              </p>
              <TemplateManager scope="workspace" />
            </div>

            <div className="pt-6 border-t">
              <h2 className="text-xl font-semibold mb-4">Module Management</h2>
              <p className="text-muted-foreground mb-4">
                Enable or disable modules to customize your workspace. Disabled modules are hidden from navigation and the umbrella menu.
              </p>
              <div className="space-y-4 max-w-2xl">
                {ALL_MODULES.filter(m => m.isTopLevel).map(module => (
                  <div key={module.id}>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">{module.label}</Label>
                        <p className="text-xs text-muted-foreground">{module.description}</p>
                      </div>
                      <Switch
                        checked={!settings.disabledModules?.includes(module.id)}
                        onCheckedChange={(checked) => {
                          const current = settings.disabledModules ?? [];
                          const updated = checked
                            ? current.filter((id: ModuleId) => id !== module.id)
                            : [...current, module.id];
                          handleSettingChange('disabledModules', updated as ModuleId[], 'global');
                        }}
                      />
                    </div>
                    {ALL_MODULES.filter(m => !m.isTopLevel && m.id.startsWith(module.id + '.')).length > 0 && !settings.disabledModules?.includes(module.id) && (
                      <div className="ml-6 mt-2 space-y-2">
                        {ALL_MODULES.filter(m => !m.isTopLevel && m.id.startsWith(module.id + '.')).map(subModule => (
                          <div key={subModule.id} className="flex items-center justify-between">
                            <div>
                              <Label className="text-sm font-medium">{subModule.label}</Label>
                              <p className="text-xs text-muted-foreground">{subModule.description}</p>
                            </div>
                            <Switch
                              checked={!settings.disabledModules?.includes(subModule.id)}
                              onCheckedChange={(checked) => {
                                const current = settings.disabledModules ?? [];
                                const updated = checked
                                  ? current.filter((id: ModuleId) => id !== subModule.id)
                                  : [...current, subModule.id];
                                handleSettingChange('disabledModules', updated as ModuleId[], 'global');
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
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
      {/* Time Picker Dialog for split time */}
      <TimePickerDialog
        isOpen={timePickerOpen}
        onClose={() => setTimePickerOpen(false)}
        initialTime={splitTimeToTimestamp(settings.splitTime || "12:00")}
        onTimeChange={(timestamp) => {
          handleSettingChange('splitTime', timestampToSplitTime(timestamp));
        }}
      />
    </div>
  );
};

export default SettingsPage;
