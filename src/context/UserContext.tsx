import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import Cookies from 'js-cookie';
import { getRandomUsername } from '@/lib/username-generator';
import { getPersistenceAdapter } from '@/lib/persistence-factory';
import { UserSettingsEntity } from '@/lib/persistence-types';
import { eventBus } from '@/lib/events';

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

                // If no cookie exists, check localStorage (legacy/migration) or generate new
                if (!currentUserId) {
                    // Check legacy localStorage ID
                    const legacyId = localStorage.getItem('p3fo_user_id');

                    if (legacyId) {
                        console.log('Found legacy user ID in localStorage:', legacyId);
                        currentUserId = legacyId;
                    } else {
                        currentUserId = crypto.randomUUID();
                        console.log('Generated new user ID:', currentUserId);
                    }

                    // Sync to cookie
                    Cookies.set(USER_ID_COOKIE_NAME, currentUserId, { expires: COOKIE_EXPIRY_DAYS });
                    // Sync to localStorage (ensure it's there for consistency)
                    localStorage.setItem('p3fo_user_id', currentUserId);
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
                        hasCompletedOnboarding: false,
                        workload: 60,
                        splitTime: '13:00',
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

            // Emit event so other components can refresh
            eventBus.publish('userSettingsChanged');
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

    // Change user ID — discard current data and adopt target UUID's workspace
    const changeUserId = async (newUserId: string) => {
        if (!userId) {
            throw new Error('Cannot change user ID: no current user ID');
        }

        try {
            setLoading(true);
            const adapter = await getPersistenceAdapter();

            // Discard old user's data
            await adapter.migrateUser(userId, newUserId);

            // Update cookie and localStorage to point to new UUID
            Cookies.set(USER_ID_COOKIE_NAME, newUserId, { expires: COOKIE_EXPIRY_DAYS });
            localStorage.setItem('p3fo_user_id', newUserId);

            console.log(`Successfully switched from ${userId} to ${newUserId}`);

            // Reload the page to cleanly re-initialize with new UUID context
            window.location.reload();
        } catch (error) {
            console.error('Error changing user ID:', error);
            setLoading(false);
            throw error;
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
