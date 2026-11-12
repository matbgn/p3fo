import { Filters } from "@/components/FilterControls";
import { getDefaultFilters, validateFilters } from "./filter-merge";

const FILTER_STORAGE_KEY = "taskFilters";
const FILTER_CHANGED_EVENT = "p3fo:filters-changed";

const notifyFilterListeners = (filters: Filters) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Filters>(FILTER_CHANGED_EVENT, { detail: filters }));
};

// Save filters to localStorage (per-user, persisted across views)
export const saveFiltersToSessionStorage = async (filters: Filters): Promise<void> => {
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
    notifyFilterListeners(filters);
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
    notifyFilterListeners(getDefaultFilters());
  } catch (error) {
    console.error("Error clearing filters from localStorage:", error);
  }
};

// Keep mounted views (kept alive across view switches) in sync with filter
// changes made anywhere in the app, including other tabs.
export const subscribeToFilterChanges = (
  listener: (filters: Filters) => void,
): (() => void) => {
  if (typeof window === "undefined") return () => {};

  const handleCustom = (event: Event) => {
    const detail = (event as CustomEvent<Filters>).detail;
    if (detail) listener(detail);
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== FILTER_STORAGE_KEY) return;
    if (!event.newValue) {
      listener(getDefaultFilters());
      return;
    }
    try {
      listener(validateFilters(JSON.parse(event.newValue)));
    } catch (error) {
      console.error("Error parsing stored filters:", error);
    }
  };

  window.addEventListener(FILTER_CHANGED_EVENT, handleCustom);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(FILTER_CHANGED_EVENT, handleCustom);
    window.removeEventListener("storage", handleStorage);
  };
};