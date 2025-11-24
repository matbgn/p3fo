import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { getRandomUsername } from '@/lib/username-generator';
import { eventBus } from '@/lib/events';
import { yUserSettings, isCollaborationEnabled } from '@/lib/collaboration';
import { MonthlyBalanceData } from '@/lib/persistence-types';

export interface UserSettings {
    username: string;
    logo: string; // base64 encoded image or URL
    hasCompletedOnboarding: boolean;
    monthlyBalances: Record<string, MonthlyBalanceData>;
}

const defaultUserSettings: UserSettings = {
    username: '', // Will be set to random name on first load if empty
    logo: '',
    hasCompletedOnboarding: false,
    monthlyBalances: {},
};

// Get or create a unique user ID for the current client
const getUserId = (): string => {
    const userId = localStorage.getItem('p3fo_user_id');
    if (userId) {
        return userId;
    }
    const newUserId = crypto.randomUUID();
    localStorage.setItem('p3fo_user_id', newUserId);
    return newUserId;
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
            hasCompletedOnboarding: settings.has_completed_onboarding,
            monthlyBalances: settings.monthly_balances || {},
        };
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

interface UserSettingsContextType {
    userId: string;
    userSettings: UserSettings;
    loading: boolean;
    updateUsername: (newUsername: string) => void;
    updateLogo: (newLogo: string) => void;
    completeOnboarding: () => void;
    regenerateUsername: () => void;
}

const UserSettingsContext = createContext<UserSettingsContextType | undefined>(undefined);

export const UserSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [userSettings, setUserSettings] = useState<UserSettings>(defaultUserSettings);
    const [loading, setLoading] = useState(true);

    // Load settings on mount
    useEffect(() => {
        const initializeSettings = async () => {
            const userId = getUserId();
            const settings = await loadUserSettings(userId);
            setUserSettings(settings);
            setLoading(false);
        };

        initializeSettings();
    }, []);

    // Listen for external settings changes and reload
    useEffect(() => {
        const handleSettingsChanged = async () => {
            console.log('UserSettingsContext: Settings changed externally, reloading...');
            const userId = getUserId();
            const settings = await loadUserSettings(userId);
            setUserSettings(settings);
        };

        eventBus.subscribe('userSettingsChanged', handleSettingsChanged);

        return () => {
            eventBus.unsubscribe('userSettingsChanged', handleSettingsChanged);
        };
    }, []);

    // Persist settings when they change
    useEffect(() => {
        const persistSettings = async () => {
            // Don't persist if still loading initial settings
            if (loading) return;

            try {
                const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
                const adapter = await persistence;
                const userId = getUserId();
                await adapter.updateUserSettings(userId, userSettings);

                // Sync to Yjs for cross-client synchronization
                if (isCollaborationEnabled()) {
                    console.log('Syncing user settings to Yjs:', { userId, username: userSettings.username });
                    yUserSettings.set(userId, {
                        userId,
                        username: userSettings.username,
                        logo: userSettings.logo,
                        has_completed_onboarding: userSettings.hasCompletedOnboarding,
                        monthly_balances: userSettings.monthlyBalances
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
    }, [userSettings, loading]);

    // Keep a ref to the current settings for the Yjs observer to check against
    // without adding it as a dependency
    const userSettingsRef = useRef(userSettings);
    useEffect(() => {
        userSettingsRef.current = userSettings;
    }, [userSettings]);

    // Listen for Yjs user settings changes from other clients
    useEffect(() => {
        if (!isCollaborationEnabled()) {
            return;
        }

        const handleYjsUserSettingsChange = (event: Y.YMapEvent<unknown>) => {
            // Ignore local changes to prevent loops
            if (event.transaction.local) {
                return;
            }

            const userId = getUserId();
            const yjsSettings = yUserSettings.get(userId) as {
                userId: string;
                username: string;
                logo: string;
                has_completed_onboarding: boolean;
                monthly_balances?: Record<string, MonthlyBalanceData>;
            } | undefined;

            if (yjsSettings) {
                // Check if settings actually changed to avoid loops
                // Use the ref to check against current state without triggering re-subscription
                const currentSettings = userSettingsRef.current;

                // Simple deep comparison for monthlyBalances could be expensive, 
                // but for now let's check reference or JSON stringify if needed.
                // Or just assume if other fields changed or if we receive an update we might want to sync.
                // Let's do a JSON stringify comparison for monthlyBalances to be safe.
                const monthlyBalancesChanged = JSON.stringify(yjsSettings.monthly_balances || {}) !== JSON.stringify(currentSettings.monthlyBalances);

                if (yjsSettings.username !== currentSettings.username ||
                    yjsSettings.logo !== currentSettings.logo ||
                    yjsSettings.has_completed_onboarding !== currentSettings.hasCompletedOnboarding ||
                    monthlyBalancesChanged) {

                    console.log('Received user settings update from Yjs:', yjsSettings);

                    setUserSettings({
                        username: yjsSettings.username,
                        logo: yjsSettings.logo,
                        hasCompletedOnboarding: yjsSettings.has_completed_onboarding,
                        monthlyBalances: yjsSettings.monthly_balances || {}
                    });

                    // NOTE: We do NOT emit 'userSettingsChanged' here because that triggers
                    // a reload from persistence, which might be stale compared to Yjs.
                    // The local state update above is sufficient for this component.
                }
            }
        };

        yUserSettings.observe(handleYjsUserSettingsChange);

        return () => {
            yUserSettings.unobserve(handleYjsUserSettingsChange);
        };
    }, []);

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

    return (
        <UserSettingsContext.Provider value={{
            userId: getUserId(),
            userSettings,
            loading,
            updateUsername,
            updateLogo,
            completeOnboarding,
            regenerateUsername,
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
