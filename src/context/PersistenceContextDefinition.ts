import { createContext } from 'react';
import { PersistenceAdapter } from '@/lib/persistence-types';

export const PersistenceContext = createContext<PersistenceAdapter | null>(null);
