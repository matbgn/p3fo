import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { getRandomUsername } from '@/lib/username-generator';
import { eventBus } from '@/lib/events';
import { yUserSettings, isCollaborationEnabled } from '@/lib/collaboration';
import { MonthlyBalanceData, UserSettingsEntity } from '@/lib/persistence-types';
import { UserContext } from './UserContextDefinition';

export interface UserSettings {
    username: string;
    logo: string; // base64 encoded image or URL
    hasCompletedOnboarding: boolean;
    monthlyBalances: Record<string, MonthlyBalanceData>;
    cardCompactness: number;
    // Legacy field for import compatibility
    workload_percentage?: number;
    // New fields
    splitTime?: string;
    timezone?: string;
    weekStartDay?: 0 | 1;
    defaultPlanView?: 'week' | 'month';
    preferredWorkingDays?: number[];
    trigram?: string;
}

const defaultUserSettings: UserSettings = {
    username: '', // Will be set to random name on first load if empty
    logo: '',
    hasCompletedOnboarding: false,
    monthlyBalances: {},
    cardCompactness: 0,
    trigram: undefined,
    // Defaults for new fields are undefined to fall back to global settings
};

// Load user settings from persistence
const loadUserSettings = async (userId: string): Promise<UserSettings> => {
    try {
        const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
        const adapter = await persistence;
        const settings = await adapter.getUserSettings(userId);

        // If no settings are found for this user, create them
        if (!settings) {
            const newSettings: UserSettings = {
                ...defaultUserSettings,
                username: getRandomUsername(),
            };
            await adapter.updateUserSettings(userId, newSettings);
            return newSettings;
        }

        // Map UserSettingsEntity to UserSettings
        return {
            username: settings.username,
            logo: settings.logo,
            hasCompletedOnboarding: settings.hasCompletedOnboarding,
            monthlyBalances: settings.monthlyBalances || {},
            cardCompactness: settings.cardCompactness ?? 0,
            splitTime: settings.splitTime,
            timezone: settings.timezone,
            weekStartDay: settings.weekStartDay,
            defaultPlanView: settings.defaultPlanView,
            preferredWorkingDays: settings.preferredWorkingDays as number[] | undefined,
            trigram: settings.trigram,
        };
    } catch (error) {
        console.error('Error loading user settings from persistence:', error);
        return defaultUserSettings;
    }
};

interface UserSettingsContextType {
    userId: string;
    userSettings: UserSettings;
    loading: boolean;
    updateUsername: (newUsername: string) => void;
    updateLogo: (newLogo: string) => void;
    completeOnboarding: () => void;
    regenerateUsername: () => void;
    updateCardCompactness: (compactness: number) => void;
    updatePreferredWorkingDays: (days: number[]) => void;
    updateTrigram: (trigram: string) => void;
}

const UserSettingsContext = createContext<UserSettingsContextType | undefined>(undefined);

export const UserSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { userId } = useContext(UserContext)!; // We know it exists because of provider hierarchy
    const [userSettings, setUserSettings] = useState<UserSettings>(defaultUserSettings);
    const [loading, setLoading] = useState(true);

    // Load settings when userId is available
    useEffect(() => {
        const initializeSettings = async () => {
            if (!userId) return;

            const settings = await loadUserSettings(userId);
            setUserSettings(settings);
            setLoading(false);
        };

        initializeSettings();
    }, [userId]);

    // Listen for external settings changes and reload
    useEffect(() => {
        const handleSettingsChanged = async () => {
            if (!userId) return;

            console.log('UserSettingsContext: Settings changed externally, reloading...');
            const settings = await loadUserSettings(userId);
            setUserSettings(settings);
        };

        eventBus.subscribe('userSettingsChanged', handleSettingsChanged);

        return () => {
            eventBus.unsubscribe('userSettingsChanged', handleSettingsChanged);
        };
    }, [userId]);

    // Persist settings when they change
    useEffect(() => {
        const persistSettings = async () => {
            // Don't persist if still loading initial settings or no userId
            if (loading || !userId) return;

            try {
                const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
                const adapter = await persistence;

                // Map UserSettings to UserSettingsEntity
                const entityPatch: Partial<UserSettingsEntity> = {
                    username: userSettings.username,
                    logo: userSettings.logo,
                    hasCompletedOnboarding: userSettings.hasCompletedOnboarding,
                    monthlyBalances: userSettings.monthlyBalances,
                    cardCompactness: userSettings.cardCompactness,
                    splitTime: userSettings.splitTime,
                    timezone: userSettings.timezone,
                    weekStartDay: userSettings.weekStartDay,
                    defaultPlanView: userSettings.defaultPlanView,
                    preferredWorkingDays: userSettings.preferredWorkingDays,
                    trigram: userSettings.trigram,
                };

                await adapter.updateUserSettings(userId, entityPatch);

                // Sync to Yjs for cross-client synchronization
                if (isCollaborationEnabled()) {
                    console.log('Syncing user settings to Yjs:', { userId, username: userSettings.username });
                    yUserSettings.set(userId, {
                        userId,
                        username: userSettings.username,
                        logo: userSettings.logo,
                        hasCompletedOnboarding: userSettings.hasCompletedOnboarding,
                        monthlyBalances: userSettings.monthlyBalances,
                        cardCompactness: userSettings.cardCompactness,
                        splitTime: userSettings.splitTime,
                        timezone: userSettings.timezone,
                        weekStartDay: userSettings.weekStartDay,
                        yearStartDay: userSettings.weekStartDay,
                        defaultPlanView: userSettings.defaultPlanView,
                        preferredWorkingDays: userSettings.preferredWorkingDays,
                        trigram: userSettings.trigram,
                    });
                }
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
    }, [userSettings, loading, userId]);

    // Keep a ref to the current settings
    const userSettingsRef = useRef(userSettings);
    useEffect(() => {
        userSettingsRef.current = userSettings;
    }, [userSettings]);

    // Listen for Yjs user settings changes from other clients
    useEffect(() => {
        if (!isCollaborationEnabled() || !userId) {
            return;
        }

        const handleYjsUserSettingsChange = (event: Y.YMapEvent<unknown>) => {
            if (event.transaction.local) return;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const yjsSettings = yUserSettings.get(userId) as any; // simplified type for brevity

            if (yjsSettings) {
                const currentSettings = userSettingsRef.current;
                const monthlyBalancesChanged = JSON.stringify(yjsSettings.monthlyBalances || {}) !== JSON.stringify(currentSettings.monthlyBalances);

                if (yjsSettings.username !== currentSettings.username ||
                    yjsSettings.logo !== currentSettings.logo ||
                    yjsSettings.hasCompletedOnboarding !== currentSettings.hasCompletedOnboarding ||
                    yjsSettings.cardCompactness !== currentSettings.cardCompactness ||
                    yjsSettings.timezone !== currentSettings.timezone ||
                    yjsSettings.trigram !== currentSettings.trigram ||
                    monthlyBalancesChanged) {

                    console.log('Received user settings update from Yjs:', yjsSettings);

                    setUserSettings({
                        username: yjsSettings.username,
                        logo: yjsSettings.logo,
                        hasCompletedOnboarding: yjsSettings.hasCompletedOnboarding,
                        monthlyBalances: yjsSettings.monthlyBalances || {},
                        cardCompactness: yjsSettings.cardCompactness ?? 0,
                        splitTime: yjsSettings.splitTime,
                        timezone: yjsSettings.timezone,
                        weekStartDay: yjsSettings.weekStartDay,
                        defaultPlanView: yjsSettings.defaultPlanView,
                        preferredWorkingDays: yjsSettings.preferredWorkingDays,
                        trigram: yjsSettings.trigram,
                    });
                }
            } else {
                // Settings were deleted remotely (e.g. Clear All Data)
                console.log('User settings deleted remotely, reloading defaults...');
                // We reload from persistence which should now be empty/default
                // This effectively resets the user
                loadUserSettings(userId).then(settings => {
                    setUserSettings(settings);
                });
            }
        };

        yUserSettings.observe(handleYjsUserSettingsChange);

        return () => {
            yUserSettings.unobserve(handleYjsUserSettingsChange);
        };
    }, [userId]);

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

    const updateCardCompactness = (compactness: number) => {
        setUserSettings(prev => ({
            ...prev,
            cardCompactness: compactness,
        }));
    };

    const updatePreferredWorkingDays = (days: number[]) => {
        setUserSettings(prev => ({
            ...prev,
            preferredWorkingDays: days,
        }));
    };

    const updateTrigram = (trigram: string) => {
        setUserSettings(prev => ({
            ...prev,
            trigram: trigram,
        }));
    };

    return (
        <UserSettingsContext.Provider value={{
            userId: userId || '', // Provide empty string if null to match type, though loading handles it
            userSettings,
            loading,
            updateUsername,
            updateLogo,
            completeOnboarding,
            regenerateUsername,
            updateCardCompactness,
            updatePreferredWorkingDays,
            updateTrigram
        }}>
            {children}
        </UserSettingsContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useUserSettingsContext = () => {
    const context = useContext(UserSettingsContext);
    if (context === undefined) {
        throw new Error('useUserSettingsContext must be used within a UserSettingsProvider');
    }
    return context;
};
