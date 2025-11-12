import { Filters } from "@/components/FilterControls";

// Save filters to persistence (sessionStorage or backend)
export const saveFiltersToSessionStorage = async (filters: Filters) => {
  try {
    const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
    const adapter = await persistence;
    await adapter.saveFilters(filters);
  } catch (error) {
    console.error("Error saving filters to persistence:", error);
    // Fallback to sessionStorage
    try {
      sessionStorage.setItem("taskFilters", JSON.stringify(filters));
    } catch (e) {
      console.error("Error saving filters to sessionStorage:", e);
    }
  }
};

// Load filters from persistence (sessionStorage or backend)
export const loadFiltersFromSessionStorage = async (): Promise<Filters | null> => {
  try {
    const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
    const adapter = await persistence;
    return await adapter.getFilters();
  } catch (error) {
    console.error("Error loading filters from persistence:", error);
    // Fallback to sessionStorage
    try {
      const storedFilters = sessionStorage.getItem("taskFilters");
      return storedFilters ? JSON.parse(storedFilters) : null;
    } catch (e) {
      console.error("Error loading filters from sessionStorage:", e);
      return null;
    }
  }
};

// Clear filters from persistence (sessionStorage or backend)
export const clearFiltersFromSessionStorage = async () => {
  try {
    const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
    const adapter = await persistence;
    await adapter.clearFilters();
  } catch (error) {
    console.error("Error clearing filters from persistence:", error);
    // Fallback to sessionStorage
    try {
      sessionStorage.removeItem("taskFilters");
    } catch (e) {
      console.error("Error clearing filters from sessionStorage:", e);
    }
  }
};