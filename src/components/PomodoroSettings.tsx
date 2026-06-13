import { useSettingsContext } from '@/context/SettingsContext';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { PomodoroConfig, DEFAULT_POMODORO_CONFIG } from '@/lib/pomodoro-types';

const PomodoroSettings: React.FC = () => {
  const { settings, updateSettings } = useSettingsContext();
  const config: PomodoroConfig = settings.pomodoroConfig ?? DEFAULT_POMODORO_CONFIG;

  const updatePomodoro = (partial: Partial<PomodoroConfig>) => {
    updateSettings({ pomodoroConfig: { ...config, ...partial } }, 'user');
  };

  const workMinutes = Math.round(config.workDuration / 60000);
  const breakMinutes = Math.round(config.breakDuration / 60000);
  const longBreakMinutes = Math.round(config.longBreakDuration / 60000);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold mb-4">Pomodoro Timer</h2>
        <div className="space-y-6 max-w-md">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Enable Pomodoro</Label>
              <p className="text-sm text-muted-foreground">
                Activate the Pomodoro timer with work/break cycles.
              </p>
            </div>
            <Switch
              checked={config.pomodoroEnabled}
              onCheckedChange={(checked) => updatePomodoro({ pomodoroEnabled: checked })}
            />
          </div>

          <div className={config.pomodoroEnabled ? undefined : 'opacity-50 pointer-events-none'}>
            <div className="space-y-5">
              <div>
                <Label className="block text-sm font-medium mb-2">
                  Work Duration: {workMinutes} min
                </Label>
                <Slider
                  value={[workMinutes]}
                  min={1}
                  max={60}
                  step={1}
                  onValueChange={([v]) => updatePomodoro({ workDuration: v * 60000 })}
                  className="w-full"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Length of each work period (1–60 min, default: 25 min)
                </p>
              </div>

              <div>
                <Label className="block text-sm font-medium mb-2">
                  Break Duration: {breakMinutes} min
                </Label>
                <Slider
                  value={[breakMinutes]}
                  min={1}
                  max={15}
                  step={1}
                  onValueChange={([v]) => updatePomodoro({ breakDuration: v * 60000 })}
                  className="w-full"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Short break between work periods (1–15 min, default: 5 min)
                </p>
              </div>

              <div>
                <Label className="block text-sm font-medium mb-2">
                  Long Break Duration: {longBreakMinutes} min
                </Label>
                <Slider
                  value={[longBreakMinutes]}
                  min={5}
                  max={30}
                  step={5}
                  onValueChange={([v]) => updatePomodoro({ longBreakDuration: v * 60000 })}
                  className="w-full"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Break after completing a full cycle set (5–30 min, default: 15 min)
                </p>
              </div>

              <div>
                <Label className="block text-sm font-medium mb-1">
                  Cycles before Long Break
                </Label>
                <div className="flex items-center space-x-2 mt-2">
                  <Slider
                    value={[config.cyclesBeforeLongBreak]}
                    min={1}
                    max={10}
                    step={1}
                    onValueChange={([v]) => updatePomodoro({ cyclesBeforeLongBreak: v })}
                    className="w-32"
                  />
                  <span className="text-sm font-mono w-6 text-center">{config.cyclesBeforeLongBreak}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Number of work periods before a long break (1–10, default: 4)
                </p>
              </div>


            </div>
          </div>
         </div>
      </div>
    </div>
  );
};

export default PomodoroSettings;