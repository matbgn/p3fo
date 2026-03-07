import { Filters } from "@/components/FilterControls";
import { validateFilters } from "./filter-merge";

const FILTER_STORAGE_KEY = "taskFilters";

// Save filters to localStorage (per-user, persisted across views)
export const saveFiltersToSessionStorage = async (filters: Filters): Promise<void> => {
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  } catch (error) {
    console.error("Error saving filters to localStorage:", error);
  }
};

// Load filters from localStorage (per-user, persisted across views)
// Validates and migrates legacy schemas
export const loadFiltersFromSessionStorage = async (): Promise<Filters | null> => {
  try {
    const storedFilters = localStorage.getItem(FILTER_STORAGE_KEY);
    if (!storedFilters) return null;
    
    const parsed = JSON.parse(storedFilters);
    return validateFilters(parsed);
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