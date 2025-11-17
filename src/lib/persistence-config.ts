// Configuration for persistence selection

export const PERSISTENCE_CONFIG = {
  // API URL for server persistence (set via environment variable)
  API_URL: import.meta.env.VITE_P3FO_API_URL as string | undefined,
  
  // Force browser mode (set via environment variable)
 FORCE_BROWSER: import.meta.env.VITE_P3FO_FORCE_BROWSER === 'true',
};