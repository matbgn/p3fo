import { useState, useEffect } from 'react';
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePersistence } from "@/hooks/usePersistence";
import { AppSettingsEntity } from '@/lib/persistence-types';

/**
 * Combined settings interface that merges global and user-specific settings
 */
export interface CombinedSettings {
    // User-specific or global with user override
    splitTime: string;  // HH:MM format (e.g., "13:00")
    userWorkloadPercentage: number;  // 0-100

    // Global only
    weeksComputation: number;
    highImpactTaskGoal: number;
    failureRateGoal: number;
    qliGoal: number;
    newCapabilitiesGoal: number;
    vacationLimitMultiplier: number;
    hourlyBalanceLimitUpper: number;
    hourlyBalanceLimitLower: number;
    hoursToBeDoneByDay: number;

    // User preference
    weekStartDay: 0 | 1; // 0 for Sunday, 1 for Monday
    defaultPlanView: 'week' | 'month';
    preferredWorkingDays: number[]; // Array of days (0-6)
    timezone: string; // Timezone identifier (e.g., 'Europe/Zurich')
    country: string; // Country code for holidays (e.g., 'CH')
    region: string; // Region code for holidays (e.g., 'BE')
}

/**
 * Convert AppSettings split_time number to string format
 * AppSettings uses format like 40 = 4:00 PM = 16:00
 * Formula: hours = floor(split_time / 10), minutes = (split_time % 10) * 6
 */
export function appSplitTimeToString(splitTime: number): string {
    const hours = Math.floor(splitTime / 10);
    const minutes = (splitTime % 10) * 6;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Convert string format to AppSettings split_time number
 */
export function stringToAppSplitTime(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 10 + Math.floor(minutes / 6);
}

const defaultCombinedSettings: CombinedSettings = {
    splitTime: '13:00',
    userWorkloadPercentage: 60,
    weeksComputation: 4,
    highImpactTaskGoal: 3.63,
    failureRateGoal: 5,
    qliGoal: 60,
    newCapabilitiesGoal: 57.98,
    vacationLimitMultiplier: 1.5,
    hourlyBalanceLimitUpper: 0.5,
    hourlyBalanceLimitLower: -0.5,
    hoursToBeDoneByDay: 8,
    weekStartDay: 1, // Default to Monday
    defaultPlanView: 'week',
    preferredWorkingDays: [1, 2, 3, 4, 5], // Default Mon-Fri
    timezone: 'Europe/Zurich', // Default timezone
    country: 'CH', // Default country for holidays
    region: 'BE', // Default region for holidays
};

/**
 * Hook that provides unified settings by merging global AppSettings with user-specific UserSettings.
 * User settings take precedence over global settings for overlapping fields.
 */
export const useCombinedSettings = () => {
    const { userSettings, updateUserSettings } = useCurrentUser();
    const persistence = usePersistence();
    const [settings, setSettings] = useState<CombinedSettings>(defaultCombinedSettings);
    const [loading, setLoading] = useState(true);

    // Load and merge settings
    useEffect(() => {
        const loadSettings = async () => {
            try {
                // Load global app settings
                const appSettings = await persistence.getAppSettings();

                // Start with global settings
                const merged: CombinedSettings = {
                    // Convert app settings to combined format
                    splitTime: appSplitTimeToString(appSettings.splitTime || 40),
                    userWorkloadPercentage: appSettings.userWorkloadPercentage || 60,
                    weeksComputation: appSettings.weeksComputation || 4,
                    highImpactTaskGoal: appSettings.highImpactTaskGoal || 3.63,
                    failureRateGoal: appSettings.failureRateGoal || 5,
                    qliGoal: appSettings.qliGoal || 60,
                    newCapabilitiesGoal: appSettings.newCapabilitiesGoal || 57.98,
                    vacationLimitMultiplier: appSettings.vacationLimitMultiplier || 1.5,
                    hourlyBalanceLimitUpper: appSettings.hourlyBalanceLimitUpper || 0.5,
                    hourlyBalanceLimitLower: appSettings.hourlyBalanceLimitLower || -0.5,
                    hoursToBeDoneByDay: appSettings.hoursToBeDoneByDay || 8,
                    weekStartDay: 1,
                    defaultPlanView: 'week',
                    timezone: appSettings.timezone || 'Europe/Zurich',
                    country: appSettings.country || 'CH',
                    region: appSettings.region || 'BE',
                    preferredWorkingDays: [1, 2, 3, 4, 5], // Default
                };

                // Override with user-specific settings if they exist
                if (userSettings) {
                    if (userSettings.splitTime) {
                        merged.splitTime = userSettings.splitTime;
                    }
                    if (userSettings.workload !== undefined) {
                        merged.userWorkloadPercentage = userSettings.workload;
                    }

                    // Timezone: User Settings > Local Storage > App Settings (Default)
                    if (userSettings.timezone) {
                        merged.timezone = userSettings.timezone;
                    } else {
                        const local = localStorage.getItem('timezone');
                        if (local) merged.timezone = local;
                    }

                    // WeekStartDay: User Settings > Local Storage > Default (1)
                    if (userSettings.weekStartDay !== undefined) {
                        merged.weekStartDay = userSettings.weekStartDay;
                    } else {
                        const local = localStorage.getItem('weekStartDay');
                        if (local) merged.weekStartDay = parseInt(local) as 0 | 1;
                    }

                    // DefaultPlanView: User Settings > Local Storage > Default ('week')
                    if (userSettings.defaultPlanView) {
                        merged.defaultPlanView = userSettings.defaultPlanView;
                    } else {
                        const local = localStorage.getItem('defaultPlanView');
                        if (local) merged.defaultPlanView = local as 'week' | 'month';
                    }

                    // PreferredWorkingDays: User Settings > Default ([1,2,3,4,5])
                    if (userSettings.preferredWorkingDays) {
                        merged.preferredWorkingDays = userSettings.preferredWorkingDays;
                    }
                }

                setSettings(merged);
            } catch (error) {
                console.error('Error loading combined settings:', error);
                setSettings(defaultCombinedSettings);
            } finally {
                setLoading(false);
            }
        };

        loadSettings();
    }, [persistence, userSettings]);

    // Migration Effect: Persist settings to DB if missing in UserSettings
    // This ensures that:
    // 1. Legacy localStorage settings are migrated
    // 2. Default settings are "pinned" to the user profile so they appear in exports
    useEffect(() => {
        if (!loading && userSettings) {
            const updates: Parameters<typeof updateUserSettings>[0] = {}; // Use UserSettings type
            let hasUpdates = false;

            if (!userSettings.timezone) {
                // Try localStorage first
                const local = localStorage.getItem('timezone');
                if (local) {
                    updates.timezone = local;
                } else {
                    // Fallback to current effective setting (pinning)
                    // This ensures the value is explicit in the DB and Export
                    if (settings.timezone) updates.timezone = settings.timezone;
                }
                hasUpdates = true;
            }

            if (userSettings.weekStartDay === undefined) {
                const local = localStorage.getItem('weekStartDay');
                if (local) {
                    updates.weekStartDay = parseInt(local) as 0 | 1;
                } else {
                    // Pin current effective setting
                    if (settings.weekStartDay !== undefined) updates.weekStartDay = settings.weekStartDay;
                }
                hasUpdates = true;
            }

            if (!userSettings.defaultPlanView) {
                const local = localStorage.getItem('defaultPlanView');
                if (local) {
                    updates.defaultPlanView = local as 'week' | 'month';
                } else {
                    // Pin current effective setting
                    if (settings.defaultPlanView) updates.defaultPlanView = settings.defaultPlanView;
                }
                hasUpdates = true;
            }

            if (!userSettings.preferredWorkingDays) {
                // Pin current effective setting
                if (settings.preferredWorkingDays) updates.preferredWorkingDays = settings.preferredWorkingDays;
                hasUpdates = true;
            }

            if (hasUpdates && Object.keys(updates).length > 0) {
                console.log('Migrating/Pinning settings to user persistence:', updates);
                // We use a timeout to avoid immediate state updates during render cycles if triggered excessively
                setTimeout(() => {
                    updateUserSettings({ ...userSettings, ...updates });
                }, 0);
            }
        }
    }, [loading, userSettings, settings, updateUserSettings]);

    /**
     * Update settings. User-specific fields (splitTime, userWorkloadPercentage) are saved
     * to user settings. Global fields are saved to app settings.
     */
    const updateSettings = async (updates: Partial<CombinedSettings>, scope?: 'user' | 'global') => {
        // Optimistically update local state
        setSettings(prev => ({ ...prev, ...updates }));

        try {
            // Separate user-specific updates from global updates
            const userUpdates: { splitTime?: string; workload?: number; timezone?: string; weekStartDay?: 0 | 1; defaultPlanView?: 'week' | 'month'; preferredWorkingDays?: number[] } = {};
            const appUpdates: Partial<AppSettingsEntity> = {};

            // Helper to decide where to put the update
            const addToUser = (key: string, value: unknown) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (userUpdates as any)[key] = value;
            };
            const addToApp = (key: keyof AppSettingsEntity, value: unknown) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (appUpdates as any)[key] = value;
            };

            // Route updates to appropriate storage
            if (updates.splitTime !== undefined) {
                if (userSettings) {
                    addToUser('splitTime', updates.splitTime);
                } else {
                    addToApp('splitTime', stringToAppSplitTime(updates.splitTime));
                }
            }
            if (updates.userWorkloadPercentage !== undefined) {
                if (userSettings) {
                    addToUser('workload', updates.userWorkloadPercentage);
                } else {
                    addToApp('userWorkloadPercentage', updates.userWorkloadPercentage);
                }
            }

            if (updates.weekStartDay !== undefined) {
                if (userSettings) {
                    addToUser('weekStartDay', updates.weekStartDay);
                    // Also update localStorage for redundancy/legacy
                    localStorage.setItem('weekStartDay', updates.weekStartDay.toString());
                }
            }
            if (updates.defaultPlanView !== undefined) {
                if (userSettings) {
                    addToUser('defaultPlanView', updates.defaultPlanView);
                    // Also update localStorage
                    localStorage.setItem('defaultPlanView', updates.defaultPlanView);
                }
            }
            if (updates.preferredWorkingDays !== undefined) {
                if (userSettings) {
                    addToUser('preferredWorkingDays', updates.preferredWorkingDays);
                }
            }

            // Global-only settings (always app)
            if (updates.weeksComputation !== undefined) addToApp('weeksComputation', updates.weeksComputation);
            if (updates.highImpactTaskGoal !== undefined) addToApp('highImpactTaskGoal', updates.highImpactTaskGoal);
            if (updates.failureRateGoal !== undefined) addToApp('failureRateGoal', updates.failureRateGoal);
            if (updates.qliGoal !== undefined) addToApp('qliGoal', updates.qliGoal);
            if (updates.newCapabilitiesGoal !== undefined) addToApp('newCapabilitiesGoal', updates.newCapabilitiesGoal);
            if (updates.vacationLimitMultiplier !== undefined) addToApp('vacationLimitMultiplier', updates.vacationLimitMultiplier);
            if (updates.hourlyBalanceLimitUpper !== undefined) addToApp('hourlyBalanceLimitUpper', updates.hourlyBalanceLimitUpper);
            if (updates.hourlyBalanceLimitLower !== undefined) addToApp('hourlyBalanceLimitLower', updates.hourlyBalanceLimitLower);
            if (updates.hoursToBeDoneByDay !== undefined) addToApp('hoursToBeDoneByDay', updates.hoursToBeDoneByDay);

            // Scoped settings (Timezone, Country, Region)
            if (updates.timezone !== undefined) {
                if (scope === 'user' && userSettings) {
                    addToUser('timezone', updates.timezone);
                    localStorage.setItem('timezone', updates.timezone);
                } else if (scope === 'global' || !userSettings) {
                    addToApp('timezone', updates.timezone);
                } else {
                    addToApp('timezone', updates.timezone);
                }
            }
            if (updates.country !== undefined) {
                addToApp('country', updates.country);
            }
            if (updates.region !== undefined) {
                addToApp('region', updates.region);
            }

            // Save user-specific updates if any
            if (Object.keys(userUpdates).length > 0 && userSettings) {
                await updateUserSettings({
                    ...userSettings,
                    ...userUpdates,
                });
            }

            // Save app settings updates if any
            if (Object.keys(appUpdates).length > 0) {
                const currentAppSettings = await persistence.getAppSettings();
                await persistence.updateAppSettings({
                    ...currentAppSettings,
                    ...appUpdates,
                });
            }
        } catch (error) {
            console.error('Error saving combined settings:', error);
            // Revert optimistic update on error
            setSettings(settings); // Reset to previous state
        }
    };

    return { settings, loading, updateSettings };
};
