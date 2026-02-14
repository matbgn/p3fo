import { useState, useEffect, useMemo } from 'react';
import * as Y from 'yjs';
import { UserSettingsEntity } from '@/lib/persistence-types';
import { eventBus } from '@/lib/events';
import { yUserSettings, isCollaborationEnabled, doc } from '@/lib/collaboration';
import { assignTrigrams } from '@/utils/userTrigrams';

export interface UserWithTrigram extends UserSettingsEntity {
    trigram: string;
}

export const useUsers = () => {
    const [users, setUsers] = useState<UserSettingsEntity[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchUsers = async () => {
        try {
            const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
            const adapter = await persistence;
            const userList = await adapter.listUsers();
            setUsers(userList);
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();

        // Listen for user settings changes to refresh the list
        const handleUserSettingsChanged = () => {
            console.log('User settings changed, refreshing users list');
            fetchUsers();
        };

        eventBus.subscribe('userSettingsChanged', handleUserSettingsChanged);

        return () => {
            eventBus.unsubscribe('userSettingsChanged', handleUserSettingsChanged);
        };
    }, []);

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
            console.log('Yjs user settings changed, refreshing users list');
            fetchUsers();
        };

        yUserSettings.observe(handleYjsUserSettingsChange);

        return () => {
            yUserSettings.unobserve(handleYjsUserSettingsChange);
        };
    }, []);

    const deleteUser = async (userId: string) => {
        try {
            const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
            const adapter = await persistence;
            await adapter.deleteUser(userId);

            // Refresh the list
            await fetchUsers();

            // Notify others (local)
            eventBus.publish('userSettingsChanged');

            // Sync to Yjs (remote)
            if (isCollaborationEnabled()) {
                doc.transact(() => {
                    yUserSettings.delete(userId);
                });
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            throw error;
        }
    };

    const updateUser = async (userId: string, patch: Partial<UserSettingsEntity>) => {
        try {
            const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
            const adapter = await persistence;
            const updatedUser = await adapter.updateUserSettings(userId, patch);

            // Refresh the list
            await fetchUsers();

            // Notify others (local)
            eventBus.publish('userSettingsChanged');

            // Sync to Yjs (remote)
            if (isCollaborationEnabled()) {
                doc.transact(() => {
                    yUserSettings.set(userId, updatedUser);
                });
            }
        } catch (error) {
            console.error('Error updating user:', error);
            throw error;
        }
    };

    // Calculate trigrams efficiently
    const usersWithTrigrams = useMemo(() => {
        const trigramMap = assignTrigrams(users);
        return users.map(u => ({
            ...u,
            trigram: trigramMap[u.userId] || '???'
        })) as UserWithTrigram[];
    }, [users]);

    return { users: usersWithTrigrams, loading, refreshUsers: fetchUsers, deleteUser, updateUser };
};
