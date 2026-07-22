import { useSettingsContext } from '@/context/SettingsContext';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FocusModeConfig, DEFAULT_FOCUS_MODE_CONFIG } from '@/lib/pomodoro-types';

const PIP_SIZES = [
  { value: 'tiny', width: 200, height: 100 },
  { value: 'small', width: 240, height: 140 },
  { value: 'medium', width: 260, height: 240 },
  { value: 'normal', width: 320, height: 400 },
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
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettingsContext();
  const focusConfig: FocusModeConfig = settings.focusModeConfig ?? DEFAULT_FOCUS_MODE_CONFIG;

  const updateFocus = (partial: Partial<FocusModeConfig>) => {
    updateSettings({ focusModeConfig: { ...focusConfig, ...partial } }, 'user');
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">{t('focusMode.settings.title')}</h2>
      <div className="space-y-6 max-w-md">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">{t('focusMode.settings.autoStartBreak')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('focusMode.settings.autoStartBreakHelp')}
            </p>
          </div>
          <Switch
            checked={focusConfig.autoStartBreak}
            onCheckedChange={(checked) => updateFocus({ autoStartBreak: checked })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">{t('focusMode.settings.autoStartWork')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('focusMode.settings.autoStartWorkHelp')}
            </p>
          </div>
          <Switch
            checked={focusConfig.autoStartWork}
            onCheckedChange={(checked) => updateFocus({ autoStartWork: checked })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">{t('focusMode.settings.enablePiP')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('focusMode.settings.enablePiPHelp')}
            </p>
          </div>
          <Switch
            checked={focusConfig.enablePiP}
            onCheckedChange={(checked) => updateFocus({ enablePiP: checked })}
          />
        </div>

        {focusConfig.enablePiP && (
          <div className="flex items-center justify-between pl-4 border-l-2 border-muted">
            <div>
              <Label className="text-sm font-medium">{t('focusMode.settings.autoOpenPiP')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('focusMode.settings.autoOpenPiPHelp')}
              </p>
            </div>
            <Switch
              checked={focusConfig.autoOpenPiPOnStart}
              onCheckedChange={(checked) => updateFocus({ autoOpenPiPOnStart: checked })}
            />
          </div>
        )}

        {focusConfig.enablePiP && (
          <div>
            <Label className="block text-sm font-medium mb-1">
              {t('focusMode.settings.pipSize')}
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
                    {t(`focusMode.pipSize.${size.value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-1">
              {t('focusMode.settings.pipSizeHelp')}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">{t('focusMode.settings.showFocusOverlay')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('focusMode.settings.showFocusOverlayHelp')}
            </p>
          </div>
          <Switch
            checked={focusConfig.showFocusOverlay}
            onCheckedChange={(checked) => updateFocus({ showFocusOverlay: checked })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">{t('focusMode.settings.wakeLock')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('focusMode.settings.wakeLockHelp')}
            </p>
          </div>
          <Switch
            checked={focusConfig.wakeLock}
            onCheckedChange={(checked) => updateFocus({ wakeLock: checked })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">{t('focusMode.settings.soundNotifications')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('focusMode.settings.soundNotificationsHelp')}
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