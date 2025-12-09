import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { getRandomUsername } from '@/lib/username-generator';
import { eventBus } from '@/lib/events';
import { yUserSettings, isCollaborationEnabled } from '@/lib/collaboration';
import { MonthlyBalanceData, UserSettingsEntity } from '@/lib/persistence-types';

export interface UserSettings {
    username: string;
    logo: string; // base64 encoded image or URL
    hasCompletedOnboarding: boolean;
    monthlyBalances: Record<string, MonthlyBalanceData>;
    cardCompactness: number;
    // Legacy field for import compatibility
    workload_percentage?: number;
}

const defaultUserSettings: UserSettings = {
    username: '', // Will be set to random name on first load if empty
    logo: '',
    hasCompletedOnboarding: false,
    monthlyBalances: {},
    cardCompactness: 0,
};

import { UserContext } from './UserContextDefinition';

// ... (imports remain the same)

// Remove getUserId function as we'll use UserContext

// Load user settings from persistence
const loadUserSettings = async (userId: string): Promise<UserSettings> => {
    // ... (implementation remains the same)
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
            cardCompactness: settings.card_compactness ?? 0,
        };
    } catch (error) {
        console.error('Error loading user settings from persistence:', error);
        // ... (fallback logic remains the same)
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
                    has_completed_onboarding: userSettings.hasCompletedOnboarding,
                    monthly_balances: userSettings.monthlyBalances,
                    card_compactness: userSettings.cardCompactness,
                };

                await adapter.updateUserSettings(userId, entityPatch);

                // Sync to Yjs for cross-client synchronization
                if (isCollaborationEnabled()) {
                    console.log('Syncing user settings to Yjs:', { userId, username: userSettings.username });
                    yUserSettings.set(userId, {
                        userId,
                        username: userSettings.username,
                        logo: userSettings.logo,
                        has_completed_onboarding: userSettings.hasCompletedOnboarding,
                        monthly_balances: userSettings.monthlyBalances,
                        card_compactness: userSettings.cardCompactness
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
            // ... (Yjs logic remains the same, just use userId from scope)
            if (event.transaction.local) return;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const yjsSettings = yUserSettings.get(userId) as any; // simplified type for brevity

            if (yjsSettings) {
                const currentSettings = userSettingsRef.current;
                const monthlyBalancesChanged = JSON.stringify(yjsSettings.monthly_balances || {}) !== JSON.stringify(currentSettings.monthlyBalances);

                if (yjsSettings.username !== currentSettings.username ||
                    yjsSettings.logo !== currentSettings.logo ||
                    yjsSettings.has_completed_onboarding !== currentSettings.hasCompletedOnboarding ||
                    yjsSettings.card_compactness !== currentSettings.cardCompactness ||
                    monthlyBalancesChanged) {

                    console.log('Received user settings update from Yjs:', yjsSettings);

                    setUserSettings({
                        username: yjsSettings.username,
                        logo: yjsSettings.logo,
                        hasCompletedOnboarding: yjsSettings.has_completed_onboarding,
                        monthlyBalances: yjsSettings.monthly_balances || {},
                        cardCompactness: yjsSettings.card_compactness ?? 0
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
