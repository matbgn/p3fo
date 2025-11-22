import { useContext } from 'react';
import { PersistenceContext } from '@/context/PersistenceContextDefinition';
import { PersistenceAdapter } from '@/lib/persistence-types';

export const usePersistence = (): PersistenceAdapter => {
    const context = useContext(PersistenceContext);
    if (!context) {
        throw new Error('usePersistence must be used within a PersistenceProvider');
    }
    return context;
};
