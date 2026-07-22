import { useSettingsContext } from '@/context/SettingsContext';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DEFAULT_TRAVELER_CONFIG, TravelerConfig } from '@/lib/traveler-types';
import { Plane } from 'lucide-react';

const TravelerSettings: React.FC = () => {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettingsContext();
  const config: TravelerConfig = settings.travelerConfig ?? DEFAULT_TRAVELER_CONFIG;

  const updateTraveler = (partial: Partial<TravelerConfig>) => {
    updateSettings({ travelerConfig: { ...config, ...partial } }, 'user');
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">{t('traveler.settings.title')}</h2>
      <div className="space-y-6 max-w-md">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">{t('traveler.settings.enable')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('traveler.settings.enableHelp')}
            </p>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(checked) => updateTraveler({ enabled: checked })}
          />
        </div>

        <div className={config.enabled ? undefined : 'opacity-50 pointer-events-none'}>
          <div className="space-y-4">

            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                {t('traveler.settings.dataBy')}{' '}
                <a
                  href="https://transitous.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  {t('traveler.settings.transitous')}
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TravelerSettings;