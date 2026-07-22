
import { version } from '../../package.json';
import { useTranslation } from 'react-i18next';
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

const ALL_MODULES: { id: ModuleId; isTopLevel: boolean }[] = [
  { id: 'celebration', isTopLevel: true },
  { id: 'dream', isTopLevel: true },
  { id: 'dream.dream', isTopLevel: false },
  { id: 'dream.storyboard', isTopLevel: false },
  { id: 'dream.prioritization', isTopLevel: false },
  { id: 'plan', isTopLevel: true },
  { id: 'plan.circles', isTopLevel: false },
  { id: 'plan.roles', isTopLevel: false },
  { id: 'plan.salary', isTopLevel: false },
  { id: 'program', isTopLevel: true },
  { id: 'program.calendar', isTopLevel: false },
  { id: 'program.resources', isTopLevel: false },
  { id: 'kanban', isTopLevel: true },
  { id: 'focus', isTopLevel: true },
  { id: 'timetable', isTopLevel: true },
  { id: 'metrics', isTopLevel: true },
  { id: 'voting', isTopLevel: true },
];

const moduleLabelKey = (id: ModuleId): string => `settings.module.${id}.label`;
const moduleDescriptionKey = (id: ModuleId): string => `settings.module.${id}.description`;

const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
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
    if (window.confirm(t('settings.dataManagement.clearAllConfirm'))) {
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
        <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
      </div>

      <Tabs defaultValue="user" className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start border-b rounded-none p-0 h-auto bg-transparent">
          <TabsTrigger
            value="user"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
          >
            {t('settings.tabs.user')}
          </TabsTrigger>
          <TabsTrigger
            value="workspace"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
          >
            {t('settings.tabs.workspace')}
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-auto py-6">
          <TabsContent value="user" className="space-y-6 mt-0">
            <div>
              <h2 className="text-xl font-semibold mb-4">{t('settings.personalPreferences.title')}</h2>
              <div className="space-y-6 max-w-md">
                <div>
                  <Label htmlFor="split-time">{t('settings.personalPreferences.daySplitTime')}</Label>
                  <div className="mt-2">
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => setTimePickerOpen(true)}
                    >
                      <Clock className="mr-2 h-4 w-4" />
                      {settings.splitTime || t('settings.personalPreferences.setTime')}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('settings.personalPreferences.daySplitTimeHelp')}
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    {t('settings.personalPreferences.userWorkloadLabel')}
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
                    {t('settings.personalPreferences.userWorkloadHelp')}
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    {t('settings.personalPreferences.userTrigramLabel')}
                  </Label>
                  <Input
                    type="text"
                    maxLength={3}
                    value={settings.trigram || ''}
                    onChange={(e) => handleSettingChange('trigram', e.target.value.toUpperCase())}
                    className="w-24 mt-2 uppercase"
                    placeholder={t('settings.personalPreferences.trigramPlaceholder')}
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('settings.personalPreferences.trigramHelp')}
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    {t('settings.personalPreferences.startOfWeekLabel')}
                  </Label>
                  <RadioGroup
                    value={settings.weekStartDay?.toString() || "1"}
                    onValueChange={(value) => handleSettingChange('weekStartDay', value)}
                    className="flex flex-col space-y-1 mt-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="1" id="week-start-monday" />
                      <Label htmlFor="week-start-monday">{t('common.day.monday')}</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="0" id="week-start-sunday" />
                      <Label htmlFor="week-start-sunday">{t('common.day.sunday')}</Label>
                    </div>
                  </RadioGroup>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('settings.personalPreferences.startOfWeekHelp')}
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    {t('settings.personalPreferences.defaultPlanViewLabel')}
                  </Label>
                  <RadioGroup
                    value={settings.defaultPlanView || "week"}
                    onValueChange={(value) => handleSettingChange('defaultPlanView', value)}
                    className="flex flex-col space-y-1 mt-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="week" id="plan-view-week" />
                      <Label htmlFor="plan-view-week">{t('common.view.week')}</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="month" id="plan-view-month" />
                      <Label htmlFor="plan-view-month">{t('common.view.month')}</Label>
                    </div>
                  </RadioGroup>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('settings.personalPreferences.defaultPlanViewHelp')}
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    {t('settings.personalPreferences.cardCompactnessLabel')}
                  </Label>
                  <div className="mt-2">
                    <CompactnessSelector />
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('settings.personalPreferences.cardCompactnessHelp')}
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    {t('settings.personalPreferences.preferredWorkingDaysLabel')}
                  </Label>
                  <div className="mt-2">
                    <DaySelector
                      value={settings.preferredWorkingDays}
                      onChange={(val) => handleSettingChange('preferredWorkingDays', val)}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('settings.personalPreferences.preferredWorkingDaysHelp')}
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t">
              <h2 className="text-xl font-semibold mb-4">{t('settings.personalLocation.title')}</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {t('settings.personalLocation.help')}
              </p>
              <div className="space-y-6 max-w-md">
                <div>
                  <Label className="block text-sm font-medium mb-1">
                    {t('settings.personalLocation.timezoneLabel')}
                  </Label>
                  <Input
                    type="text"
                    value={settings.timezone}
                    onChange={(e) => handleSettingChange('timezone', e.target.value, 'user')}
                    className="mt-2"
                    placeholder={t('settings.personalLocation.timezonePlaceholder')}
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('settings.personalLocation.timezoneHelp')}
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
              <h2 className="text-xl font-semibold mb-2">{t('settings.personalTemplates.title')}</h2>
              <p className="text-muted-foreground mb-4">
                {t('settings.personalTemplates.help')}
              </p>
              <TemplateManager scope="user" />
            </div>
          </TabsContent>

          <TabsContent value="workspace" className="space-y-8 mt-0">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{t('settings.workspace.version')}</span>
              <span className="font-mono bg-muted px-2 py-0.5 rounded">v{version}</span>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-4">{t('settings.metricsGoals.title')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
                <div>
                  <Label className="block text-sm font-medium mb-1">
                    {t('settings.metricsGoals.weeksComputationLabel')}
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    value={settings.weeksComputation}
                    onChange={(e) => handleSettingChange('weeksComputation', e.target.value, 'global')}
                    className="w-24 mt-2"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('settings.metricsGoals.weeksComputationHelp')}
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    {t('settings.metricsGoals.highImpactTaskGoalLabel')}
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
                    {t('settings.metricsGoals.highImpactTaskGoalHelp')}
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    {t('settings.metricsGoals.failureRateGoalLabel')}
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
                    {t('settings.metricsGoals.failureRateGoalHelp')}
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    {t('settings.metricsGoals.qliGoalLabel')}
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
                    {t('settings.metricsGoals.qliGoalHelp')}
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    {t('settings.metricsGoals.newCapabilitiesGoalLabel')}
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
                    {t('settings.metricsGoals.newCapabilitiesGoalHelp')}
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t">
              <h2 className="text-xl font-semibold mb-4">{t('settings.timeHours.title')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
                <div>
                  <Label className="block text-sm font-medium mb-1">
                    {t('settings.timeHours.standardDailyHoursLabel')}
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
                    {t('settings.timeHours.standardDailyHoursHelp')}
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    {t('settings.timeHours.vacationLimitMultiplierLabel')}
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
                    {t('settings.timeHours.vacationLimitMultiplierHelp')}
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    {t('settings.timeHours.hourlyBalanceUpperLabel')}
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
                    {t('settings.timeHours.hourlyBalanceUpperHelp')}
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    {t('settings.timeHours.hourlyBalanceLowerLabel')}
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={settings.hourlyBalanceLimitLower}
                    onChange={(e) => handleSettingChange('hourlyBalanceLimitLower', e.target.value, 'global')}
                    className="w-24 mt-2"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('settings.timeHours.hourlyBalanceLowerHelp')}
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    {t('settings.timeHours.timezoneLabel')}
                  </Label>
                  <Input
                    type="text"
                    value={settings.timezone}
                    onChange={(e) => handleSettingChange('timezone', e.target.value, 'global')}
                    className="mt-2"
                    placeholder={t('settings.timeHours.timezonePlaceholder')}
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('settings.timeHours.timezoneHelp')}
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    {t('settings.timeHours.countryLabel')}
                  </Label>
                  <Input
                    type="text"
                    value={settings.country}
                    onChange={(e) => handleSettingChange('country', e.target.value, 'global')}
                    className="w-24 mt-2"
                    placeholder={t('settings.timeHours.countryPlaceholder')}
                    maxLength={2}
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('settings.timeHours.countryHelp')}
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    {t('settings.timeHours.regionLabel')}
                  </Label>
                  <Input
                    type="text"
                    value={settings.region}
                    onChange={(e) => handleSettingChange('region', e.target.value, 'global')}
                    className="w-24 mt-2"
                    placeholder={t('settings.timeHours.regionPlaceholder')}
                    maxLength={2}
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('settings.timeHours.regionHelp')}
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    {t('settings.timeHours.cardAgingBaseDaysLabel')}
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
                    {t('settings.timeHours.cardAgingBaseDaysHelp')}
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    {t('settings.timeHours.wipLimitPerUserLabel')}
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
                    {t('settings.timeHours.wipLimitPerUserHelp')}
                  </p>
                </div>

                <div>
                  <Label className="block text-sm font-medium mb-1">
                    {t('settings.timeHours.nonActionPeriodLabel')}
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
                    {t('settings.timeHours.nonActionPeriodHelp')}
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t">
              <h2 className="text-xl font-semibold mb-2">{t('settings.workspace.taskTemplatesTitle')}</h2>
              <p className="text-muted-foreground mb-4">
                {t('settings.workspace.taskTemplatesHelp')}
              </p>
              <TemplateManager scope="workspace" />
            </div>

            <div className="pt-6 border-t">
              <h2 className="text-xl font-semibold mb-4">{t('settings.moduleManagement.title')}</h2>
              <p className="text-muted-foreground mb-4">
                {t('settings.moduleManagement.help')}
              </p>
              <div className="space-y-4 max-w-2xl">
                {ALL_MODULES.filter(m => m.isTopLevel).map(module => (
                  <div key={module.id}>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">{t(moduleLabelKey(module.id))}</Label>
                        <p className="text-xs text-muted-foreground">{t(moduleDescriptionKey(module.id))}</p>
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
                              <Label className="text-sm font-medium">{t(moduleLabelKey(subModule.id))}</Label>
                              <p className="text-xs text-muted-foreground">{t(moduleDescriptionKey(subModule.id))}</p>
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
              <h2 className="text-xl font-semibold mb-4">{t('settings.dataManagement.title')}</h2>
              <p className="text-muted-foreground mb-4">
                {t('settings.dataManagement.help')}
              </p>
              <div className="flex space-x-2">
                <DataImporter />
                <DataExporter />
                <Button variant="destructive" onClick={handleClearData}>
                  {t('settings.dataManagement.clearAllButton')}
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
