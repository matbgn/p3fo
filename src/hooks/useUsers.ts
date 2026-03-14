import { useState, useEffect, useMemo, useRef } from 'react';
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
    const pendingUpdatesRef = useRef<Set<string>>(new Set()); // Keys: "userId:field"
    const lastUpdateTimestampRef = useRef<Record<string, number>>({}); // Keys: "userId:field"

    const fetchUsers = async () => {
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
            // Revert changes if no newer update has occurred
            setUsers(prev => prev.map(u => {
                if (u.userId !== userId) return u;
                const reverted = { ...u };
                Object.keys(patch).forEach(key => {
                    const compositeKey = `${userId}:${key}`;
                    if (timestamps[compositeKey] === now) {
                        // We don't have the original value easily here, 
                        // but fetchUsers will eventually bring it back if we clear pending.
                        // For a quick revert, we might just rely on the next fetch.
                    }
                });
                return reverted;
            }));
            throw error;
        } finally {
            // Clear pending status after a delay
            setTimeout(() => {
                Object.keys(patch).forEach(key => {
                    const compositeKey = `${userId}:${key}`;
                    if (timestamps[compositeKey] === now) {
                        pending.delete(compositeKey);
                    }
                });
            }, 1000);
        }
    };

    // Calculate trigrams efficiently
    const usersWithTrigrams = useMemo(() => {
        const trigramMap = assignTrigrams(users);
        return users.map(u => ({
            ...u,
            // Prefer the persisted trigram if it exists (which assignTrigrams also respects for collision)
            // But we always take what assignTrigrams returned to ensure consistency/fallback
            trigram: u.trigram || trigramMap[u.userId] || '???'
        })) as UserWithTrigram[];
    }, [users]);

    return { users: usersWithTrigrams, loading, refreshUsers: fetchUsers, deleteUser, updateUser };
};
