import { useState, useEffect } from 'react';
import { getRandomUsername } from '@/lib/username-generator';

export interface UserSettings {
  username: string;
  logo: string; // base64 encoded image or URL
  hasCompletedOnboarding: boolean;
}

const defaultUserSettings: UserSettings = {
  username: '', // Will be set to random name on first load if empty
  logo: '',
  hasCompletedOnboarding: false,
};

// Load user settings from persistence
const loadUserSettings = async (): Promise<UserSettings> => {
  try {
    const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
    const adapter = await persistence;
    const settings = await adapter.getUserSettings();
    
    // If no username is set, generate a random one
    if (!settings.username) {
      settings.username = getRandomUsername();
      // Save the generated username
      await adapter.updateUserSettings({ username: settings.username });
    }
    
    return settings;
  } catch (error) {
    console.error('Error loading user settings from persistence:', error);
    
    // Fallback to localStorage for backward compatibility
    try {
      const storedSettings = localStorage.getItem('p3fo_user_settings_v1');
      if (storedSettings) {
        const parsedSettings = JSON.parse(storedSettings);
        // If no username is set, generate a random one
        if (!parsedSettings.username) {
          parsedSettings.username = getRandomUsername();
          // Save the generated username
          localStorage.setItem('p3fo_user_settings_v1', JSON.stringify(parsedSettings));
        }
        return { ...defaultUserSettings, ...parsedSettings };
      }
    } catch (e) {
      console.error('Error parsing legacy user settings:', e);
    }
    
    // If no settings exist, create default with random username
    const newSettings = {
      ...defaultUserSettings,
      username: getRandomUsername(),
    };
    
    try {
      localStorage.setItem('p3fo_user_settings_v1', JSON.stringify(newSettings));
    } catch (error) {
      console.error('Error saving initial user settings:', error);
    }
    
    return newSettings;
  }
};

export const useUserSettings = () => {
  const [userSettings, setUserSettings] = useState<UserSettings>(defaultUserSettings);
  const [loading, setLoading] = useState(true);

  // Load settings on mount
  useEffect(() => {
    const initializeSettings = async () => {
      const settings = await loadUserSettings();
      setUserSettings(settings);
      setLoading(false);
    };
    
    initializeSettings();
  }, []);

  // Persist settings when they change
  useEffect(() => {
    const persistSettings = async () => {
      // Don't persist if still loading initial settings
      if (loading) return;
      
      try {
        const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
        const adapter = await persistence;
        await adapter.updateUserSettings(userSettings);
      } catch (error) {
        console.error('Error saving user settings to persistence:', error);
        // Fallback to localStorage
        try {
          localStorage.setItem('p3fo_user_settings_v1', JSON.stringify(userSettings));
        } catch (e) {
          console.error('Error saving user settings to localStorage:', e);
        }
      }
    };
    
    persistSettings();
  }, [userSettings, loading]);

  const updateUsername = (newUsername: string) => {
    setUserSettings(prev => ({
      ...prev,
      username: newUsername,
    }));
  };

  const updateLogo = (newLogo: string) => {
    setUserSettings(prev => ({
      ...prev,
      logo: newLogo,
    }));
  };

  const completeOnboarding = () => {
    setUserSettings(prev => ({
      ...prev,
      hasCompletedOnboarding: true,
    }));
  };

  const regenerateUsername = () => {
    const newUsername = getRandomUsername();
    updateUsername(newUsername);
  };

  return {
    userSettings,
    loading,
    updateUsername,
    updateLogo,
    completeOnboarding,
    regenerateUsername,
  };
};