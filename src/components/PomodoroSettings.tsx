import { useSettingsContext } from '@/context/SettingsContext';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PomodoroConfig, FocusModeConfig, DEFAULT_POMODORO_CONFIG, DEFAULT_FOCUS_MODE_CONFIG } from '@/lib/pomodoro-types';

const PIP_SIZES = [
  { value: 'tiny', label: 'Tiny (120×100)', width: 120, height: 100 },
  { value: 'small', label: 'Small (240×220)', width: 240, height: 220 },
  { value: 'normal', label: 'Normal (320×400)', width: 320, height: 400 },
] as const;

type PipSizeValue = typeof PIP_SIZES[number]['value'];

function getPipSizeValue(config: FocusModeConfig): PipSizeValue {
  const match = PIP_SIZES.find(s => s.width === config.pipWidth && s.height === config.pipHeight);
  return match?.value ?? 'small';
}

function getPipDimensions(value: PipSizeValue): { pipWidth: number; pipHeight: number } {
  const match = PIP_SIZES.find(s => s.value === value);
  return match ? { pipWidth: match.width, pipHeight: match.height } : { pipWidth: 240, pipHeight: 220 };
}

const PomodoroSettings: React.FC = () => {
  const { settings, updateSettings } = useSettingsContext();
  const config: PomodoroConfig = settings.pomodoroConfig ?? DEFAULT_POMODORO_CONFIG;
  const focusConfig: FocusModeConfig = settings.focusModeConfig ?? DEFAULT_FOCUS_MODE_CONFIG;

  const updatePomodoro = (partial: Partial<PomodoroConfig>) => {
    updateSettings({ pomodoroConfig: { ...config, ...partial } }, 'user');
  };

  const updateFocus = (partial: Partial<FocusModeConfig>) => {
    updateSettings({ focusModeConfig: { ...focusConfig, ...partial } }, 'user');
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

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Auto-start Break</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically start break after work period ends.
                  </p>
                </div>
                <Switch
                  checked={config.autoStartBreak}
                  onCheckedChange={(checked) => updatePomodoro({ autoStartBreak: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Auto-start Work</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically start next work period after break ends.
                  </p>
                </div>
                <Switch
                  checked={config.autoStartWork}
                  onCheckedChange={(checked) => updatePomodoro({ autoStartWork: checked })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-6 border-t">
        <h2 className="text-xl font-semibold mb-4">Focus Mode</h2>
        <div className="space-y-6 max-w-md">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Enable Picture-in-Picture</Label>
              <p className="text-sm text-muted-foreground">
                Show an always-on-top timer window during Pomodoro sessions.
              </p>
            </div>
            <Switch
              checked={focusConfig.enablePiP}
              onCheckedChange={(checked) => updateFocus({ enablePiP: checked })}
            />
          </div>

          {focusConfig.enablePiP && (
            <div>
              <Label className="block text-sm font-medium mb-1">
                PiP Window Size
              </Label>
              <Select
                value={getPipSizeValue(focusConfig)}
                onValueChange={(value) => {
                  const dims = getPipDimensions(value as PipSizeValue);
                  updateFocus(dims);
                }}
              >
                <SelectTrigger className="w-48 mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIP_SIZES.map((size) => (
                    <SelectItem key={size.value} value={size.value}>
                      {size.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground mt-1">
                Size of the always-on-top timer window.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Show Focus Overlay</Label>
              <p className="text-sm text-muted-foreground">
                Display a fullscreen timer overlay in the main window during Pomodoro sessions (instead of using PiP).
              </p>
            </div>
            <Switch
              checked={focusConfig.showFocusOverlay}
              onCheckedChange={(checked) => updateFocus({ showFocusOverlay: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Prevent Screen Sleep</Label>
              <p className="text-sm text-muted-foreground">
                Keep the screen awake during Pomodoro sessions using Wake Lock API.
              </p>
            </div>
            <Switch
              checked={focusConfig.wakeLock}
              onCheckedChange={(checked) => updateFocus({ wakeLock: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Sound Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Play a chime when a Pomodoro phase transitions.
              </p>
            </div>
            <Switch
              checked={focusConfig.soundNotifications}
              onCheckedChange={(checked) => updateFocus({ soundNotifications: checked })}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PomodoroSettings;