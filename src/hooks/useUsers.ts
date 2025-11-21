import { useState, useEffect } from 'react';
import { UserSettingsEntity } from '@/lib/persistence-types';

export const useUsers = () => {
    const [users, setUsers] = useState<UserSettingsEntity[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
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

        fetchUsers();
    }, []);

    return { users, loading };
};
