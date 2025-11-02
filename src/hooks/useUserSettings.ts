import { useState, useEffect } from 'react';
import { getRandomUsername } from '@/lib/username-generator';

const USER_SETTINGS_KEY = 'p3fo_user_settings_v1';

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

const loadUserSettings = (): UserSettings => {
  try {
    const storedSettings = localStorage.getItem(USER_SETTINGS_KEY);
    if (storedSettings) {
      const parsedSettings = JSON.parse(storedSettings);
      // If no username is set, generate a random one
      if (!parsedSettings.username) {
        parsedSettings.username = getRandomUsername();
        // Save the generated username
        localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(parsedSettings));
      }
      return { ...defaultUserSettings, ...parsedSettings };
    }
  } catch (error) {
    console.error('Error loading user settings:', error);
  }
  
  // If no settings exist, create default with random username
  const newSettings = {
    ...defaultUserSettings,
    username: getRandomUsername(),
  };
  
  try {
    localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(newSettings));
  } catch (error) {
    console.error('Error saving initial user settings:', error);
  }
  
  return newSettings;
};

export const useUserSettings = () => {
  const [userSettings, setUserSettings] = useState<UserSettings>(loadUserSettings);

  useEffect(() => {
    try {
      localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(userSettings));
    } catch (error) {
      console.error('Error saving user settings:', error);
    }
  }, [userSettings]);

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
    updateUsername,
    updateLogo,
    completeOnboarding,
    regenerateUsername,
  };
};