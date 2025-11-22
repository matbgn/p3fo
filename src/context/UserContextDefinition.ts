import { createContext } from 'react';
import { UserSettingsEntity } from '@/lib/persistence-types';

export interface UserContextType {
    userId: string | null;
    userSettings: UserSettingsEntity | null;
    loading: boolean;
    updateUserSettings: (patch: Partial<UserSettingsEntity>) => Promise<void>;
    refreshUserSettings: () => Promise<void>;
    changeUserId: (newUserId: string) => Promise<void>;
}

export const UserContext = createContext<UserContextType | undefined>(undefined);
