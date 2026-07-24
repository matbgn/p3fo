import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const LANGUAGES = [
  { value: 'en', label: 'English', flag: '🇬🇧' },
  { value: 'fr', label: 'Français', flag: '🇫🇷' },
  { value: 'de', label: 'Deutsch', flag: '🇩🇪' },
];

export const LanguageSwitcher = () => {
  const { i18n } = useTranslation();
  const current = (i18n.resolvedLanguage ?? i18n.language ?? 'en').substring(0, 2);
  const currentFlag = LANGUAGES.find(l => l.value === current)?.flag ?? '🌐';

  return (
    <Select value={current} onValueChange={(lng) => i18n.changeLanguage(lng)}>
      <SelectTrigger className="w-auto gap-1.5 h-9 px-2" aria-label="Language">
        <span className="text-base leading-none">{currentFlag}</span>
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
  );
};

export default LanguageSwitcher;