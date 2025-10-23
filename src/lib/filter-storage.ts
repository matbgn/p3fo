import { Filters } from "@/components/FilterControls";

const SESSION_STORAGE_KEY = "taskFilters";

export const saveFiltersToSessionStorage = (filters: Filters) => {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(filters));
  } catch (error) {
    console.error("Error saving filters to session storage:", error);
  }
};

export const loadFiltersFromSessionStorage = (): Filters | null => {
  try {
    const storedFilters = sessionStorage.getItem(SESSION_STORAGE_KEY);
    return storedFilters ? JSON.parse(storedFilters) : null;
  } catch (error) {
    console.error("Error loading filters from session storage:", error);
    return null;
  }
};

export const clearFiltersFromSessionStorage = () => {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (error) {
    console.error("Error clearing filters from session storage:", error);
  }
};