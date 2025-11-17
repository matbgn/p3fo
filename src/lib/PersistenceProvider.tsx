import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { PersistenceAdapter } from './persistence-types';
import { getPersistenceAdapter } from './persistence-factory';

// Create the context
const PersistenceContext = createContext<PersistenceAdapter | null>(null);

// Custom hook to use the persistence context
export const usePersistence = (): PersistenceAdapter => {
  const context = useContext(PersistenceContext);
  if (!context) {
    throw new Error('usePersistence must be used within a PersistenceProvider');
  }
  return context;
};

// Props for the provider component
interface PersistenceProviderProps {
  children: ReactNode;
}

// Provider component
export const PersistenceProvider: React.FC<PersistenceProviderProps> = ({ children }) => {
  const [persistence, setPersistence] = useState<PersistenceAdapter | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializePersistence = async () => {
      try {
        const adapter = await getPersistenceAdapter();
        setPersistence(adapter);
      } catch (error) {
        console.error('Failed to initialize persistence:', error);
        // We could potentially provide a fallback here
      } finally {
        setLoading(false);
      }
    };

    initializePersistence();
  }, []);

  if (loading) {
    // You might want to return a loading component here
    return <div>Loading persistence...</div>;
  }

  return (
    <PersistenceContext.Provider value={persistence}>
      {children}
    </PersistenceContext.Provider>
  );
};