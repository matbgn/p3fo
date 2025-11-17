import { useState, useEffect } from 'react';

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

// Load settings from persistence
const loadSettings = async (): Promise<Settings> => {
  try {
    const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
    const adapter = await persistence;
    const appSettings = await adapter.getSettings();
    
    // Map AppSettingsEntity to Settings interface
    return {
      splitTime: appSettings.split_time?.toString() || defaultSettings.splitTime,
      userWorkloadPercentage: appSettings.user_workload_percentage?.toString() || defaultSettings.userWorkloadPercentage,
      weeksComputation: appSettings.weeks_computation?.toString() || defaultSettings.weeksComputation,
      highImpactTaskGoal: appSettings.high_impact_task_goal?.toString() || defaultSettings.highImpactTaskGoal,
      failureRateGoal: appSettings.failure_rate_goal?.toString() || defaultSettings.failureRateGoal,
      qliGoal: appSettings.qli_goal?.toString() || defaultSettings.qliGoal,
      newCapabilitiesGoal: appSettings.new_capabilities_goal?.toString() || defaultSettings.newCapabilitiesGoal,
    };
  } catch (error) {
    console.error('Error loading settings from persistence:', error);
    
    // Fallback to localStorage for backward compatibility
    try {
      const storedSettings = localStorage.getItem('dyad_settings_v1');
      if (storedSettings) {
        return { ...defaultSettings, ...JSON.parse(storedSettings) };
      }
    } catch (e) {
      console.error('Error parsing legacy settings:', e);
    }
    
    return defaultSettings;
  }
};

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  // Load settings on mount
  useEffect(() => {
    const initializeSettings = async () => {
      const loadedSettings = await loadSettings();
      setSettings(loadedSettings);
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
        
        // Map Settings interface to AppSettingsEntity
        const appSettings: import('@/lib/persistence-types').AppSettingsEntity = {
          split_time: parseInt(settings.splitTime),
          user_workload_percentage: parseInt(settings.userWorkloadPercentage),
          weeks_computation: parseInt(settings.weeksComputation),
          high_impact_task_goal: parseFloat(settings.highImpactTaskGoal),
          failure_rate_goal: parseFloat(settings.failureRateGoal),
          qli_goal: parseFloat(settings.qliGoal),
          new_capabilities_goal: parseFloat(settings.newCapabilitiesGoal),
        };
        
        await adapter.updateSettings(appSettings);
      } catch (error) {
        console.error('Error saving settings to persistence:', error);
        // Fallback to localStorage
        try {
          localStorage.setItem('dyad_settings_v1', JSON.stringify(settings));
        } catch (e) {
          console.error('Error saving settings to localStorage:', e);
        }
      }
    };
    
    persistSettings();
  }, [settings, loading]);

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings((prevSettings) => ({ ...prevSettings, ...newSettings }));
  };

  return { settings, loading, updateSettings };
};