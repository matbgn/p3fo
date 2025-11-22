import { useContext } from 'react';
import { UserContext, UserContextType } from '@/context/UserContextDefinition';

export const useCurrentUser = (): UserContextType => {
    const context = useContext(UserContext);
    if (context === undefined) {
        throw new Error('useCurrentUser must be used within a UserProvider');
    }
    return context;
};
