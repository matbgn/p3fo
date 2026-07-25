import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Film, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useUserSettingsContext } from '@/context/UserSettingsContext';
import { useAllTasks } from '@/hooks/useAllTasks';
import { buildAcmeSampleData } from '@/lib/acme-sample-data';
import { applyImportedData, extractImportErrorMessage } from '@/lib/apply-imported-data';
import { DEFAULT_TASKS_INITIALIZED_KEY } from '@/hooks/useTasks';

// localStorage flag: once the user has answered the modal (load or dismiss),
// we never prompt again for this browser. Keeps the modal from nagging.
export const EXAMPLE_DATA_PROMPTED_KEY = 'p3fo_example_data_prompted';

const LANGUAGES = [
  { value: 'en', label: 'English', flag: '🇬🇧' },
  { value: 'fr', label: 'Français', flag: '🇫🇷' },
  { value: 'de', label: 'Deutsch', flag: '🇩🇪' },
];

type AcmeLocale = 'en' | 'fr' | 'de';

interface ExampleDataModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ExampleDataModal: React.FC<ExampleDataModalProps> = ({ open, onOpenChange }) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { userId } = useUserSettingsContext();
  const { tasks } = useAllTasks();
  const [loading, setLoading] = useState(false);
  // Default to the UI's current language if it's one we support.
  const current = (i18n.resolvedLanguage ?? i18n.language ?? 'en').substring(0, 2) as AcmeLocale;
  const [locale, setLocale] = useState<AcmeLocale>(
    LANGUAGES.some(l => l.value === current) ? current : 'en',
  );
  // Translator bound to the *selected* language, so the modal preview re-renders
  // live as the user picks a different language — without touching the global
  // i18n state (which only switches on "Load"). Resources are preloaded, so this
  // resolves synchronously.
  const tl = i18n.getFixedT(locale);

  const hasExistingData = tasks.length > 0;

  const handleLoad = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // Build the dataset in the chosen language, then switch the live UI to
      // the same language so the freshly imported content matches the chrome.
      const data = buildAcmeSampleData(userId, locale);
      await i18n.changeLanguage(locale);
      await applyImportedData(data, { tasksAsEntities: true });

      // Mark defaults as initialized so useTasks never re-seeds "Plan vacation".
      localStorage.setItem(DEFAULT_TASKS_INITIALIZED_KEY, 'true');
      localStorage.setItem(EXAMPLE_DATA_PROMPTED_KEY, 'true');

      toast({
        title: tl('exampleData.successTitle'),
        description: tl('exampleData.successDescription'),
      });
      // Reload so all contexts rehydrate from the freshly imported data.
      window.location.reload();
    } catch (error) {
      console.error('Error loading example data:', error);
      const message = extractImportErrorMessage(error, t);
      toast({
        variant: 'destructive',
        title: t('exampleData.errorTitle'),
        description: message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(EXAMPLE_DATA_PROMPTED_KEY, 'true');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : handleDismiss())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Film className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle>{tl('exampleData.title')}</DialogTitle>
          </div>
          <DialogDescription>{tl('exampleData.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-md border bg-muted/30 p-4 text-sm">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="font-medium">{tl('exampleData.datasetName')}</p>
              <p className="text-muted-foreground">{tl('exampleData.datasetSummary')}</p>
            </div>
          </div>
          <ul className="ml-6 list-disc space-y-1 text-muted-foreground">
            <li>{tl('exampleData.bullet.movies')}</li>
            <li>{tl('exampleData.bullet.roles')}</li>
            <li>{tl('exampleData.bullet.frameworks')}</li>
            <li>{tl('exampleData.bullet.salary')}</li>
            <li>{tl('exampleData.bullet.celebration')}</li>
          </ul>
          {hasExistingData && (
            <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
              {tl('exampleData.existingDataWarning')}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{tl('exampleData.languageLabel')}</span>
          <Select value={locale} onValueChange={(v) => setLocale(v as AcmeLocale)}>
            <SelectTrigger className="h-9 w-auto gap-1.5">
              <span className="text-base leading-none">{LANGUAGES.find(l => l.value === locale)?.flag}</span>
              <span className="text-sm">{LANGUAGES.find(l => l.value === locale)?.label}</span>
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  <span className="mr-2">{l.flag}</span>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleDismiss} disabled={loading}>
            {tl('exampleData.dismiss')}
          </Button>
          <Button onClick={handleLoad} disabled={loading || !userId}>
            {loading ? tl('exampleData.loading') : tl('exampleData.load')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExampleDataModal;