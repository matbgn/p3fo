import { useState, useEffect } from 'react';
import { UserSettingsEntity } from '@/lib/persistence-types';
import { eventBus } from '@/lib/events';

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

    return { users, loading, refreshUsers: fetchUsers };
};
