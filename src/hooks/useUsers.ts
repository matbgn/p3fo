import { useState, useEffect } from 'react';
import { UserSettingsEntity } from '@/lib/persistence-types';
import { eventBus } from '@/lib/events';
import { yUserSettings, isCollaborationEnabled } from '@/lib/collaboration';

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

        const handleYjsUserSettingsChange = () => {
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

            // Notify others
            eventBus.publish('userSettingsChanged');
        } catch (error) {
            console.error('Error deleting user:', error);
            throw error;
        }
    };

    return { users, loading, refreshUsers: fetchUsers, deleteUser };
};
