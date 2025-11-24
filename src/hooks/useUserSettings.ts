import { useUserSettingsContext } from '@/context/UserSettingsContext';

export const useUserSettings = () => {
  return useUserSettingsContext();
};

export type { UserSettings } from '@/context/UserSettingsContext';