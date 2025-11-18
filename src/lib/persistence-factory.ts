import { BrowserJsonPersistence } from './persistence-browser';
import { HttpApiPersistence } from './persistence-http'; // We'll create this later
import { PersistenceAdapter } from './persistence-types';
import { PERSISTENCE_CONFIG } from './persistence-config';

let persistenceAdapter: PersistenceAdapter | null = null;

// Health check function to test backend availability
async function checkBackendHealth(apiUrl: string): Promise<boolean> {
 try {
    const response = await fetch(`${apiUrl}/api/health`);
    const data = await response.json();
    return response.ok && data.ok === true;
  } catch (error) {
    console.warn('Backend health check failed:', error);
    return false;
  }
}

export async function getPersistenceAdapter(): Promise<PersistenceAdapter> {
  if (persistenceAdapter) {
    return persistenceAdapter;
  }

 // 1. If force browser mode is enabled, use browser persistence
  if (PERSISTENCE_CONFIG.FORCE_BROWSER) {
    console.log('Persistence: Using browser JSON mode (forced)');
    persistenceAdapter = new BrowserJsonPersistence();
    return persistenceAdapter;
  }

 // 2. If API URL is configured, try to use server persistence
  if (PERSISTENCE_CONFIG.API_URL) {
    const isHealthy = await checkBackendHealth(PERSISTENCE_CONFIG.API_URL);
    
    if (isHealthy) {
      console.log('Persistence: Using server mode');
      // We'll import dynamically once HttpApiPersistence is created
      const { HttpApiPersistence } = await import('./persistence-http');
      persistenceAdapter = new HttpApiPersistence(PERSISTENCE_CONFIG.API_URL);
      return persistenceAdapter;
    } else {
      console.warn('Persistence: Server not available, falling back to browser JSON mode');
    }
  }

  // 3. Default to browser persistence
 console.log('Persistence: Using browser JSON mode (default)');
  persistenceAdapter = new BrowserJsonPersistence();
  return persistenceAdapter;
}

export function getSelectedMode(): 'browser-json' | 'server-sql' {
  if (persistenceAdapter) {
    // This would require a method on the adapter to identify the type
    // For now we'll implement a simple check
    return persistenceAdapter instanceof BrowserJsonPersistence 
      ? 'browser-json' 
      : 'server-sql';
  }
  
  // If not initialized yet, determine based on config
 if (PERSISTENCE_CONFIG.FORCE_BROWSER) {
    return 'browser-json';
  }
  
  if (PERSISTENCE_CONFIG.API_URL) {
    // Would check health, but we're just determining type
    return 'server-sql';
  }
  
  return 'browser-json';
}