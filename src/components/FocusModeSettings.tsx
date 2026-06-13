import { useSettingsContext } from '@/context/SettingsContext';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FocusModeConfig, DEFAULT_FOCUS_MODE_CONFIG } from '@/lib/pomodoro-types';

const PIP_SIZES = [
  { value: 'tiny', label: 'Tiny (120×100)', width: 120, height: 100 },
  { value: 'small', label: 'Small (240×220)', width: 240, height: 220 },
  { value: 'normal', label: 'Normal (320×400)', width: 320, height: 400 },
] as const;

type PipSizeValue = typeof PIP_SIZES[number]['value'];

function getPipSizeValue(config: FocusModeConfig): PipSizeValue {
  const match = PIP_SIZES.find(s => s.width === config.pipWidth && s.height === config.pipHeight);
  return match?.value ?? 'normal';
}

function getPipDimensions(value: PipSizeValue): { pipWidth: number; pipHeight: number } {
  const match = PIP_SIZES.find(s => s.value === value);
  return match ? { pipWidth: match.width, pipHeight: match.height } : { pipWidth: 320, pipHeight: 400 };
}

const FocusModeSettings: React.FC = () => {
  const { settings, updateSettings } = useSettingsContext();
  const focusConfig: FocusModeConfig = settings.focusModeConfig ?? DEFAULT_FOCUS_MODE_CONFIG;

  const updateFocus = (partial: Partial<FocusModeConfig>) => {
    updateSettings({ focusModeConfig: { ...focusConfig, ...partial } }, 'user');
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Focus Mode</h2>
      <div className="space-y-6 max-w-md">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Auto-start Break</Label>
            <p className="text-sm text-muted-foreground">
              Automatically start break after work period ends.
            </p>
          </div>
          <Switch
            checked={focusConfig.autoStartBreak}
            onCheckedChange={(checked) => updateFocus({ autoStartBreak: checked })}
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
            checked={focusConfig.autoStartWork}
            onCheckedChange={(checked) => updateFocus({ autoStartWork: checked })}
          />
        </div>

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
  );
};

export default FocusModeSettings;