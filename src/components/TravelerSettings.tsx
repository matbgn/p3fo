import { useSettingsContext } from '@/context/SettingsContext';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DEFAULT_TRAVELER_CONFIG, TravelerConfig } from '@/lib/traveler-types';
import { Plane } from 'lucide-react';

const TravelerSettings: React.FC = () => {
  const { settings, updateSettings } = useSettingsContext();
  const config: TravelerConfig = settings.travelerConfig ?? DEFAULT_TRAVELER_CONFIG;

  const updateTraveler = (partial: Partial<TravelerConfig>) => {
    updateSettings({ travelerConfig: { ...config, ...partial } }, 'user');
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Traveler Timer</h2>
      <div className="space-y-6 max-w-md">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Enable Traveler</Label>
            <p className="text-sm text-muted-foreground">
              Work based on flight duration between two cities.
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
                Flight duration data provided by{' '}
                <a
                  href="https://transitous.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  Transitous
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