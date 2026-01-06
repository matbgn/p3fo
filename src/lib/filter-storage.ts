import { Filters } from "@/components/FilterControls";

const FILTER_STORAGE_KEY = "taskFilters";

// Get default filters for new users
export const getDefaultFilters = (): Filters => ({
  showUrgent: false,
  showImpact: false,
  showMajorIncident: false,
  status: [],
  showDone: false,
  searchText: "",
  difficulty: [],
  category: [],
  selectedUserId: null
});

// Save filters to localStorage (per-user, persisted across views)
export const saveFiltersToSessionStorage = async (filters: Filters): Promise<void> => {
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  } catch (error) {
    console.error("Error saving filters to localStorage:", error);
  }
};

// Load filters from localStorage (per-user, persisted across views)
export const loadFiltersFromSessionStorage = async (): Promise<Filters | null> => {
  try {
    const storedFilters = localStorage.getItem(FILTER_STORAGE_KEY);
    return storedFilters ? JSON.parse(storedFilters) : null;
  } catch (error) {
    console.error("Error loading filters from localStorage:", error);
    return null;
  }
};

// Clear filters from localStorage
export const clearFiltersFromSessionStorage = async (): Promise<void> => {
  try {
    localStorage.removeItem(FILTER_STORAGE_KEY);
  } catch (error) {
    console.error("Error clearing filters from localStorage:", error);
  }
};