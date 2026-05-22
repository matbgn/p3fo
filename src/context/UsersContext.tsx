import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback, ReactNode } from 'react';
import * as Y from 'yjs';
import { UserSettingsEntity } from '@/lib/persistence-types';
import { eventBus } from '@/lib/events';
import { yUserSettings, isCollaborationEnabled, doc } from '@/lib/collaboration';
import { assignTrigrams } from '@/utils/userTrigrams';

export interface UserWithTrigram extends UserSettingsEntity {
    trigram: string;
}

interface UsersContextType {
    users: UserWithTrigram[];
    loading: boolean;
    refreshUsers: () => Promise<void>;
    deleteUser: (userId: string) => Promise<void>;
    updateUser: (userId: string, patch: Partial<UserSettingsEntity>) => Promise<void>;
}

const UsersContext = createContext<UsersContextType | undefined>(undefined);

export const UsersProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [users, setUsers] = useState<UserSettingsEntity[]>([]);
    const [loading, setLoading] = useState(true);
    const pendingUpdatesRef = useRef<Set<string>>(new Set());
    const lastUpdateTimestampRef = useRef<Record<string, number>>({});

    const fetchUsers = useCallback(async () => {
        try {
            const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
            const adapter = await persistence;
            const userList = await adapter.listUsers();
            setUsers(prev => {
                const pending = pendingUpdatesRef.current;
                return userList.map(u => {
                    const existing = prev.find(p => p.userId === u.userId);
                    if (!existing) return u;

                    const merged = { ...u };
                    Object.keys(u).forEach(key => {
                        const compositeKey = `${u.userId}:${key}`;
                        if (pending.has(compositeKey)) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            (merged as any)[key] = (existing as any)[key];
                        }
                    });
                    return merged;
                });
            });
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Single fetch on mount + eventBus refresh
    useEffect(() => {
        fetchUsers();

        const handleUserSettingsChanged = () => {
            console.log('User settings changed, refreshing users list');
            fetchUsers();
        };

        eventBus.subscribe('userSettingsChanged', handleUserSettingsChanged);

        return () => {
            eventBus.unsubscribe('userSettingsChanged', handleUserSettingsChanged);
        };
    }, [fetchUsers]);

    // Yjs collaboration refresh — debounce to avoid HTTP storms while keeping source-of-truth sync
    const yjsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!isCollaborationEnabled()) return;

        const handleYjsUserSettingsChange = (event: Y.YMapEvent<unknown>) => {
            if (event.transaction.local) return;
            if (yjsDebounceRef.current) clearTimeout(yjsDebounceRef.current);
            yjsDebounceRef.current = setTimeout(() => {
                fetchUsers();
            }, 300);
        };

        yUserSettings.observe(handleYjsUserSettingsChange);

        return () => {
            yUserSettings.unobserve(handleYjsUserSettingsChange);
            if (yjsDebounceRef.current) clearTimeout(yjsDebounceRef.current);
        };
    }, [fetchUsers]);

    const deleteUser = useCallback(async (userId: string) => {
        try {
            const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
            const adapter = await persistence;
            await adapter.deleteUser(userId);

            await fetchUsers();

            eventBus.publish('userSettingsChanged');

            if (isCollaborationEnabled()) {
                doc.transact(() => {
                    yUserSettings.delete(userId);
                });
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            throw error;
        }
    }, [fetchUsers]);

    const updateUser = useCallback(async (userId: string, patch: Partial<UserSettingsEntity>) => {
        const now = Date.now();
        const pending = pendingUpdatesRef.current;
        const timestamps = lastUpdateTimestampRef.current;

        // Optimistically update local state
        Object.keys(patch).forEach(key => {
            const compositeKey = `${userId}:${key}`;
            pending.add(compositeKey);
            timestamps[compositeKey] = now;
        });

        setUsers(prev => prev.map(u => u.userId === userId ? { ...u, ...patch } : u));

        try {
            const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
            const adapter = await persistence;
            const updatedUser = await adapter.updateUserSettings(userId, patch);

            eventBus.publish('userSettingsChanged');

            if (isCollaborationEnabled()) {
                doc.transact(() => {
                    yUserSettings.set(userId, updatedUser);
                });
            }
        } catch (error) {
            console.error('Error updating user:', error);
            setUsers(prev => prev.map(u => {
                if (u.userId !== userId) return u;
                const reverted = { ...u };
                Object.keys(patch).forEach(key => {
                    const compositeKey = `${userId}:${key}`;
                    if (timestamps[compositeKey] === now) {
                        // We don't have the original value easily here
                    }
                });
                return reverted;
            }));
            throw error;
        } finally {
            setTimeout(() => {
                Object.keys(patch).forEach(key => {
                    const compositeKey = `${userId}:${key}`;
                    if (timestamps[compositeKey] === now) {
                        pending.delete(compositeKey);
                    }
                });
            }, 1000);
        }
    }, []);

    const usersWithTrigrams = useMemo(() => {
        const trigramMap = assignTrigrams(users);
        return users.map(u => ({
            ...u,
            trigram: u.trigram || trigramMap[u.userId] || '???'
        })) as UserWithTrigram[];
    }, [users]);

    return (
        <UsersContext.Provider value={{
            users: usersWithTrigrams,
            loading,
            refreshUsers: fetchUsers,
            deleteUser,
            updateUser,
        }}>
            {children}
        </UsersContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useUsersContext = (): UsersContextType => {
    const ctx = useContext(UsersContext);
    if (!ctx) {
        throw new Error('useUsersContext must be used within a UsersProvider');
    }
    return ctx;
};
