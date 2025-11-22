import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import Cookies from 'js-cookie';
import { getRandomUsername } from '@/lib/username-generator';
import { getPersistenceAdapter } from '@/lib/persistence-factory';
import { UserSettingsEntity } from '@/lib/persistence-types';

import { UserContext, UserContextType } from './UserContextDefinition';

const USER_ID_COOKIE_NAME = 'p3fo_user_id';
const COOKIE_EXPIRY_DAYS = 365 * 10; // 10 years

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [userId, setUserId] = useState<string | null>(null);
    const [userSettings, setUserSettings] = useState<UserSettingsEntity | null>(null);
    const [loading, setLoading] = useState(true);

    // Initialize user identity and settings
    useEffect(() => {
        const initializeUser = async () => {
            try {
                // Check for existing user ID in cookie
                let currentUserId = Cookies.get(USER_ID_COOKIE_NAME);

                // If no cookie exists, generate new user ID and set cookie
                if (!currentUserId) {
                    currentUserId = crypto.randomUUID();
                    Cookies.set(USER_ID_COOKIE_NAME, currentUserId, { expires: COOKIE_EXPIRY_DAYS });
                    console.log('Generated new user ID:', currentUserId);
                }

                setUserId(currentUserId);

                // Load user settings from persistence
                const adapter = await getPersistenceAdapter();
                let settings = await adapter.getUserSettings(currentUserId);

                // If no settings exist, create default settings with random username
                if (!settings) {
                    const defaultSettings: Partial<UserSettingsEntity> = {
                        userId: currentUserId,
                        username: getRandomUsername(),
                        logo: '',
                        has_completed_onboarding: false,
                        workload_percentage: 60,
                        split_time: '13:00',
                    };

                    settings = await adapter.updateUserSettings(currentUserId, defaultSettings);
                    console.log('Created default user settings:', settings);
                }

                setUserSettings(settings);
            } catch (error) {
                console.error('Error initializing user:', error);
            } finally {
                setLoading(false);
            }
        };

        initializeUser();
    }, []);

    // Update user settings
    const updateUserSettings = async (patch: Partial<UserSettingsEntity>) => {
        if (!userId) {
            throw new Error('Cannot update settings: no user ID');
        }

        try {
            const adapter = await getPersistenceAdapter();
            const updated = await adapter.updateUserSettings(userId, patch);
            setUserSettings(updated);
        } catch (error) {
            console.error('Error updating user settings:', error);
            throw error;
        }
    };

    // Refresh user settings from persistence
    const refreshUserSettings = async () => {
        if (!userId) {
            console.warn('Cannot refresh settings: no user ID');
            return;
        }

        try {
            const adapter = await getPersistenceAdapter();
            const settings = await adapter.getUserSettings(userId);
            if (settings) {
                setUserSettings(settings);
            }
        } catch (error) {
            console.error('Error refreshing user settings:', error);
        }
    };

    // Change user ID and migrate data
    const changeUserId = async (newUserId: string) => {
        if (!userId) {
            throw new Error('Cannot change user ID: no current user ID');
        }

        try {
            setLoading(true);
            const adapter = await getPersistenceAdapter();

            // Migrate data
            await adapter.migrateUser(userId, newUserId);

            // Update cookie
            Cookies.set(USER_ID_COOKIE_NAME, newUserId, { expires: COOKIE_EXPIRY_DAYS });

            // Update state
            setUserId(newUserId);

            // Reload settings for new user
            const settings = await adapter.getUserSettings(newUserId);
            if (settings) {
                setUserSettings(settings);
            } else {
                // Should not happen if migration worked, but just in case
                await refreshUserSettings();
            }

            console.log(`Successfully changed user ID from ${userId} to ${newUserId}`);
        } catch (error) {
            console.error('Error changing user ID:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    return (
        <UserContext.Provider
            value={{
                userId,
                userSettings,
                loading,
                updateUserSettings,
                refreshUserSettings,
                changeUserId,
            }}
        >
            {children}
        </UserContext.Provider>
    );
};
