import { useState, useEffect } from 'react';

const SETTINGS_KEY = 'dyad_settings_v1';

interface Settings {
  splitTime: string;
  userWorkloadPercentage: string;
  weeksComputation: string;
  highImpactTaskGoal: string;
  failureRateGoal: string;
  qliGoal: string;
  newCapabilitiesGoal: string;
}

const defaultSettings: Settings = {
  splitTime: '13:00',
  userWorkloadPercentage: '60',
  weeksComputation: '4',
  highImpactTaskGoal: '3.63',
  failureRateGoal: '5',
  qliGoal: '60',
  newCapabilitiesGoal: '57.98',
};

const loadSettings = (): Settings => {
  try {
    const storedSettings = localStorage.getItem(SETTINGS_KEY);
    if (storedSettings) {
      return { ...defaultSettings, ...JSON.parse(storedSettings) };
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  return defaultSettings;
};

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }, [settings]);

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings((prevSettings) => ({ ...prevSettings, ...newSettings }));
  };

  return { settings, updateSettings };
};