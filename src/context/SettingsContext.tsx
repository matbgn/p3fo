import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import * as Y from 'yjs';
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePersistence } from "@/hooks/usePersistence";
import { AppSettingsEntity } from '@/lib/persistence-types';
import { DEFAULT_POMODORO_CONFIG, DEFAULT_FOCUS_MODE_CONFIG, PomodoroConfig, FocusModeConfig } from '@/lib/pomodoro-types';
import { DEFAULT_TRAVELER_CONFIG, TravelerConfig } from '@/lib/traveler-types';
import { normalizePreferredDays } from '@/utils/scheduler-utils';
import { yAppSettings, isCollaborationEnabled, doc } from '@/lib/collaboration';
import { eventBus } from '@/lib/events';

/**
 * Combined settings interface that merges global and user-specific settings
 */
export interface CombinedSettings {
    splitTime: string;
    userWorkloadPercentage: number;
    weeksComputation: number;
    highImpactTaskGoal: number;
    failureRateGoal: number;
    qliGoal: number;
    newCapabilitiesGoal: number;
    vacationLimitMultiplier: number;
    hourlyBalanceLimitUpper: number;
    hourlyBalanceLimitLower: number;
    hoursToBeDoneByDay: number;
    cardAgingBaseDays: number;
    weekStartDay: 0 | 1;
    defaultPlanView: 'week' | 'month';
    preferredWorkingDays: Record<string, number>;
    timezone: string;
    country: string;
    region: string;
    trigram?: string;
    disabledModules: import('@/lib/persistence-types').ModuleId[];
    pomodoroConfig: PomodoroConfig;
    focusModeConfig: FocusModeConfig;
    travelerConfig: TravelerConfig;
}

// eslint-disable-next-line react-refresh/only-export-components
export function appSplitTimeToString(splitTime: number): string {
    const hours = Math.floor(splitTime / 10);
    const minutes = (splitTime % 10) * 6;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

// eslint-disable-next-line react-refresh/only-export-components
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
    cardAgingBaseDays: 30,
    weekStartDay: 1,
    defaultPlanView: 'week',
    preferredWorkingDays: { '1': 1, '2': 1, '3': 1, '4': 1, '5': 1 },
    timezone: 'Europe/Zurich',
    country: 'CH',
    region: 'BE',
    trigram: undefined,
    disabledModules: [],
    pomodoroConfig: DEFAULT_POMODORO_CONFIG,
    focusModeConfig: DEFAULT_FOCUS_MODE_CONFIG,
    travelerConfig: DEFAULT_TRAVELER_CONFIG,
};

interface SettingsContextType {
    settings: CombinedSettings;
    loading: boolean;
    updateSettings: (updates: Partial<CombinedSettings>, scope?: 'user' | 'global') => Promise<void>;
    reloadAppSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { userSettings, updateUserSettings } = useCurrentUser();
    const persistence = usePersistence();
    const [settings, setSettings] = useState<CombinedSettings>(defaultCombinedSettings);
    const [loading, setLoading] = useState(true);
    const pendingUpdatesRef = useRef<Set<string>>(new Set());
    const lastUpdateTimestampRef = useRef<Record<string, number>>({});
    const pendingValuesRef = useRef<Record<string, unknown>>({});
    const hasMigratedRef = useRef(false);

    // Centralized load once
    const loadSettings = useCallback(async () => {
        try {
            const appSettings = await persistence.getAppSettings();
            const merged: CombinedSettings = {
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
                cardAgingBaseDays: appSettings.cardAgingBaseDays ?? 30,
                weekStartDay: 1,
                defaultPlanView: 'week',
                timezone: appSettings.timezone || 'Europe/Zurich',
                country: appSettings.country || 'CH',
                region: appSettings.region || 'BE',
                preferredWorkingDays: { '1': 1, '2': 1, '3': 1, '4': 1, '5': 1 },
                trigram: undefined,
                disabledModules: (appSettings.disabledModules as import('@/lib/persistence-types').ModuleId[]) || [],
                pomodoroConfig: appSettings.pomodoroConfig ?? DEFAULT_POMODORO_CONFIG,
                focusModeConfig: appSettings.focusModeConfig ?? DEFAULT_FOCUS_MODE_CONFIG,
                travelerConfig: appSettings.travelerConfig ?? DEFAULT_TRAVELER_CONFIG,
            };

            if (userSettings) {
                if (userSettings.splitTime) merged.splitTime = userSettings.splitTime;
                if (userSettings.workload !== undefined) merged.userWorkloadPercentage = userSettings.workload;
                if (userSettings.trigram) merged.trigram = userSettings.trigram;

                if (userSettings.timezone) {
                    merged.timezone = userSettings.timezone;
                } else {
                    const local = localStorage.getItem('timezone');
                    if (local) merged.timezone = local;
                }

                if (userSettings.weekStartDay !== undefined) {
                    merged.weekStartDay = userSettings.weekStartDay;
                } else {
                    const local = localStorage.getItem('weekStartDay');
                    if (local) merged.weekStartDay = parseInt(local) as 0 | 1;
                }

                if (userSettings.defaultPlanView) {
                    merged.defaultPlanView = userSettings.defaultPlanView;
                } else {
                    const local = localStorage.getItem('defaultPlanView');
                    if (local) merged.defaultPlanView = local as 'week' | 'month';
                }

                if (userSettings.preferredWorkingDays) {
                    const normalized = normalizePreferredDays(userSettings.preferredWorkingDays);
                    const stringKeyed: Record<string, number> = {};
                    Object.entries(normalized).forEach(([k, v]) => { stringKeyed[k] = v; });
                    merged.preferredWorkingDays = stringKeyed;
                }

                if (userSettings.pomodoroConfig) {
                    merged.pomodoroConfig = userSettings.pomodoroConfig;
                }

                if (userSettings.focusModeConfig) {
                    merged.focusModeConfig = userSettings.focusModeConfig;
                }

                if (userSettings.travelerConfig) {
                    merged.travelerConfig = userSettings.travelerConfig;
                }
            }

            // Migration: move autoStartBreak/autoStartWork from pomodoroConfig to focusModeConfig
            const storedPomodoro = merged.pomodoroConfig as unknown as Record<string, unknown> | undefined;
            if (storedPomodoro && ('autoStartBreak' in storedPomodoro || 'autoStartWork' in storedPomodoro)) {
                const fc = { ...merged.focusModeConfig };
                if ('autoStartBreak' in storedPomodoro && typeof storedPomodoro.autoStartBreak === 'boolean') {
                    fc.autoStartBreak = storedPomodoro.autoStartBreak as boolean;
                }
                if ('autoStartWork' in storedPomodoro && typeof storedPomodoro.autoStartWork === 'boolean') {
                    fc.autoStartWork = storedPomodoro.autoStartWork as boolean;
                }
                merged.focusModeConfig = fc;
                const cleaned = { ...storedPomodoro };
                delete cleaned.autoStartBreak;
                delete cleaned.autoStartWork;
                merged.pomodoroConfig = cleaned as unknown as typeof merged.pomodoroConfig;
            }

            setSettings(prev => {
                const next = { ...prev };
                Object.keys(merged).forEach((key) => {
                    const k = key as keyof CombinedSettings;
                    if (!pendingUpdatesRef.current.has(k)) {
                        const pendingValue = (pendingValuesRef.current as unknown as Record<string, unknown>)[k as string];
                        if (pendingValue !== undefined && (merged as unknown as Record<string, unknown>)[k as string] !== pendingValue && prev[k] === pendingValue) {
                            // Server still has old value, keep local optimistic value
                        } else {
                            (next as unknown as Record<string, unknown>)[k as string] = merged[k];
                            if (pendingValue !== undefined) {
                                delete (pendingValuesRef.current as Record<string, unknown>)[k];
                            }
                        }
                    }
                });
                return next;
            });
        } catch (error) {
            console.error('Error loading combined settings:', error);
            setSettings(defaultCombinedSettings);
        } finally {
            setLoading(false);
        }
    }, [persistence, userSettings]);

    // Initial load
    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    // Migration Effect
    useEffect(() => {
        if (!loading && userSettings && !hasMigratedRef.current) {
            const updates: Parameters<typeof updateUserSettings>[0] = {};
            let hasUpdates = false;

            if (!userSettings.timezone) {
                const local = localStorage.getItem('timezone');
                if (local) updates.timezone = local;
                else if (settings.timezone) updates.timezone = settings.timezone;
                hasUpdates = true;
            }
            if (userSettings.weekStartDay === undefined) {
                const local = localStorage.getItem('weekStartDay');
                if (local) updates.weekStartDay = parseInt(local) as 0 | 1;
                else if (settings.weekStartDay !== undefined) updates.weekStartDay = settings.weekStartDay;
                hasUpdates = true;
            }
            if (!userSettings.defaultPlanView) {
                const local = localStorage.getItem('defaultPlanView');
                if (local) updates.defaultPlanView = local as 'week' | 'month';
                else if (settings.defaultPlanView) updates.defaultPlanView = settings.defaultPlanView;
                hasUpdates = true;
            }
            if (!userSettings.preferredWorkingDays) {
                if (settings.preferredWorkingDays) updates.preferredWorkingDays = settings.preferredWorkingDays;
                hasUpdates = true;
            }

            if (hasUpdates && Object.keys(updates).length > 0) {
                console.log('Migrating/Pinning settings to user persistence:', updates);
                setTimeout(() => {
                    updateUserSettings({ ...userSettings, ...updates });
                }, 0);
            }
            hasMigratedRef.current = true;
        }
    }, [loading, userSettings, settings, updateUserSettings]);

    const reloadAppSettings = useCallback(async () => {
        try {
            const appSettings = await persistence.getAppSettings();
            const freshAppValues: Partial<CombinedSettings> = {
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
                cardAgingBaseDays: appSettings.cardAgingBaseDays ?? 30,
                timezone: appSettings.timezone || 'Europe/Zurich',
                country: appSettings.country || 'CH',
                region: appSettings.region || 'BE',
                disabledModules: (appSettings.disabledModules as import('@/lib/persistence-types').ModuleId[]) || [],
                pomodoroConfig: appSettings.pomodoroConfig ?? DEFAULT_POMODORO_CONFIG,
                focusModeConfig: appSettings.focusModeConfig ?? DEFAULT_FOCUS_MODE_CONFIG,
                travelerConfig: appSettings.travelerConfig ?? DEFAULT_TRAVELER_CONFIG,
            };

            // Migration: move autoStartBreak/autoStartWork from pomodoroConfig to focusModeConfig
            const storedPomodoro2 = freshAppValues.pomodoroConfig as unknown as Record<string, unknown> | undefined;
            if (storedPomodoro2 && ('autoStartBreak' in storedPomodoro2 || 'autoStartWork' in storedPomodoro2)) {
                const fc = { ...freshAppValues.focusModeConfig };
                if ('autoStartBreak' in storedPomodoro2 && typeof storedPomodoro2.autoStartBreak === 'boolean') {
                    fc.autoStartBreak = storedPomodoro2.autoStartBreak as boolean;
                }
                if ('autoStartWork' in storedPomodoro2 && typeof storedPomodoro2.autoStartWork === 'boolean') {
                    fc.autoStartWork = storedPomodoro2.autoStartWork as boolean;
                }
                freshAppValues.focusModeConfig = fc;
                const cleaned = { ...storedPomodoro2 };
                delete cleaned.autoStartBreak;
                delete cleaned.autoStartWork;
                freshAppValues.pomodoroConfig = cleaned as unknown as typeof freshAppValues.pomodoroConfig;
            }

            setSettings(prev => {
                const next = { ...prev };
                Object.keys(freshAppValues).forEach((key) => {
                    const k = key as keyof CombinedSettings;
                    if (!pendingUpdatesRef.current.has(k)) {
                        (next as Record<string, unknown>)[k] = freshAppValues[k];
                    }
                });
                return next;
            });
        } catch (error) {
            console.error('Error reloading app settings:', error);
        }
    }, [persistence]);

    // Yjs collaboration refresh — debounce to avoid HTTP storms while keeping source-of-truth sync
    const yjsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!isCollaborationEnabled()) return;

        const handleYjsAppSettingsChange = (event: Y.YMapEvent<unknown>) => {
            if (event.transaction.local) return;
            if (yjsDebounceRef.current) clearTimeout(yjsDebounceRef.current);
            yjsDebounceRef.current = setTimeout(() => {
                reloadAppSettings();
            }, 300);
        };

        yAppSettings.observe(handleYjsAppSettingsChange);

        return () => {
            yAppSettings.unobserve(handleYjsAppSettingsChange);
            if (yjsDebounceRef.current) clearTimeout(yjsDebounceRef.current);
        };
    }, [reloadAppSettings]);

    // eventBus refresh — throttle to avoid cascading HTTP storms
    const eventBusThrottleRef = useRef<number>(0);
    useEffect(() => {
        const handleAppSettingsChanged = () => {
            const now = Date.now();
            if (now - eventBusThrottleRef.current < 500) return;
            eventBusThrottleRef.current = now;
            reloadAppSettings();
        };

        eventBus.subscribe('appSettingsChanged', handleAppSettingsChanged);

        return () => {
            eventBus.unsubscribe('appSettingsChanged', handleAppSettingsChanged);
        };
    }, [reloadAppSettings]);

    const updateSettings = useCallback(async (updates: Partial<CombinedSettings>, scope?: 'user' | 'global') => {
        const now = Date.now();
        Object.keys(updates).forEach(key => {
            pendingUpdatesRef.current.add(key);
            lastUpdateTimestampRef.current[key] = now;
            (pendingValuesRef.current as Record<string, unknown>)[key] = (updates as Record<string, unknown>)[key];
        });

        setSettings(prev => ({ ...prev, ...updates }));

        try {
            const userUpdates: Partial<{ splitTime?: string; workload?: number; timezone?: string; weekStartDay?: 0 | 1; defaultPlanView?: 'week' | 'month'; preferredWorkingDays?: Record<string, number>; trigram?: string }> = {};
            const appUpdates: Partial<AppSettingsEntity> = {};

            const addToUser = (key: string, value: unknown) => {
                (userUpdates as Record<string, unknown>)[key] = value;
            };
            const addToApp = (key: keyof AppSettingsEntity, value: unknown) => {
                (appUpdates as Record<string, unknown>)[key] = value;
            };

            if (updates.splitTime !== undefined) {
                if (userSettings) addToUser('splitTime', updates.splitTime);
                else addToApp('splitTime', stringToAppSplitTime(updates.splitTime));
            }
            if (updates.userWorkloadPercentage !== undefined) {
                if (userSettings) addToUser('workload', updates.userWorkloadPercentage);
                else addToApp('userWorkloadPercentage', updates.userWorkloadPercentage);
            }
            if (updates.trigram !== undefined) {
                if (userSettings) addToUser('trigram', updates.trigram);
            }
            if (updates.weekStartDay !== undefined) {
                if (userSettings) {
                    addToUser('weekStartDay', updates.weekStartDay);
                    localStorage.setItem('weekStartDay', updates.weekStartDay.toString());
                }
            }
            if (updates.defaultPlanView !== undefined) {
                if (userSettings) {
                    addToUser('defaultPlanView', updates.defaultPlanView);
                    localStorage.setItem('defaultPlanView', updates.defaultPlanView);
                }
            }
            if (updates.preferredWorkingDays !== undefined) {
                if (userSettings) addToUser('preferredWorkingDays', updates.preferredWorkingDays);
            }

            // Global-only settings
            if (updates.weeksComputation !== undefined) addToApp('weeksComputation', updates.weeksComputation);
            if (updates.highImpactTaskGoal !== undefined) addToApp('highImpactTaskGoal', updates.highImpactTaskGoal);
            if (updates.failureRateGoal !== undefined) addToApp('failureRateGoal', updates.failureRateGoal);
            if (updates.qliGoal !== undefined) addToApp('qliGoal', updates.qliGoal);
            if (updates.newCapabilitiesGoal !== undefined) addToApp('newCapabilitiesGoal', updates.newCapabilitiesGoal);
            if (updates.vacationLimitMultiplier !== undefined) addToApp('vacationLimitMultiplier', updates.vacationLimitMultiplier);
            if (updates.hourlyBalanceLimitUpper !== undefined) addToApp('hourlyBalanceLimitUpper', updates.hourlyBalanceLimitUpper);
            if (updates.hourlyBalanceLimitLower !== undefined) addToApp('hourlyBalanceLimitLower', updates.hourlyBalanceLimitLower);
            if (updates.hoursToBeDoneByDay !== undefined) addToApp('hoursToBeDoneByDay', updates.hoursToBeDoneByDay);
            if (updates.cardAgingBaseDays !== undefined) addToApp('cardAgingBaseDays', updates.cardAgingBaseDays);

            if (updates.timezone !== undefined) {
                if (scope === 'user' && userSettings) {
                    addToUser('timezone', updates.timezone);
                    localStorage.setItem('timezone', updates.timezone);
                } else if (scope === 'global' || !userSettings) addToApp('timezone', updates.timezone);
                else addToApp('timezone', updates.timezone);
            }
            if (updates.country !== undefined) addToApp('country', updates.country);
            if (updates.region !== undefined) addToApp('region', updates.region);
            if (updates.disabledModules !== undefined) addToApp('disabledModules', updates.disabledModules);
            if (updates.pomodoroConfig !== undefined) {
                if (userSettings) addToUser('pomodoroConfig', updates.pomodoroConfig);
                else addToApp('pomodoroConfig', updates.pomodoroConfig);
            }
            if (updates.focusModeConfig !== undefined) {
                if (userSettings) addToUser('focusModeConfig', updates.focusModeConfig);
                else addToApp('focusModeConfig', updates.focusModeConfig);
            }
            if (updates.travelerConfig !== undefined) {
                if (userSettings) addToUser('travelerConfig', updates.travelerConfig);
                else addToApp('travelerConfig', updates.travelerConfig);
            }

            if (Object.keys(userUpdates).length > 0 && userSettings) {
                await updateUserSettings({ ...userSettings, ...userUpdates });
            }

            if (Object.keys(appUpdates).length > 0) {
                await persistence.updateAppSettings(appUpdates);
                eventBus.publish('appSettingsChanged');

                if (isCollaborationEnabled()) {
                    doc.transact(() => {
                        for (const [key, value] of Object.entries(appUpdates)) {
                            yAppSettings.set(key, JSON.stringify(value));
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error saving combined settings:', error);
            setSettings(prev => {
                const reverted = { ...prev };
                Object.keys(updates).forEach(key => {
                    const k = key as keyof CombinedSettings;
                    if (lastUpdateTimestampRef.current[k] === now) {
                        (reverted as Record<string, unknown>)[k] = settings[k];
                    }
                });
                return reverted;
            });
        } finally {
            setTimeout(() => {
                Object.keys(updates).forEach(key => {
                    if (lastUpdateTimestampRef.current[key] === now) {
                        pendingUpdatesRef.current.delete(key);
                    }
                });
            }, 1000);

            setTimeout(() => {
                Object.keys(updates).forEach(key => {
                    if (lastUpdateTimestampRef.current[key] === now) {
                        delete (pendingValuesRef.current as Record<string, unknown>)[key];
                    }
                });
            }, 30000);
        }
    }, [persistence, userSettings, updateUserSettings, settings]);

    return (
        <SettingsContext.Provider value={{ settings, loading, updateSettings, reloadAppSettings }}>
            {children}
        </SettingsContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useSettingsContext = (): SettingsContextType => {
    const ctx = useContext(SettingsContext);
    if (!ctx) {
        throw new Error('useSettingsContext must be used within a SettingsProvider');
    }
    return ctx;
};
