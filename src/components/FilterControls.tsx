import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { TriageStatus, Category } from "@/hooks/useTasks";
import { CATEGORIES } from "@/data/categories";
import { saveFiltersToSessionStorage, clearFiltersFromSessionStorage } from "@/lib/filter-storage";
import { UserFilterSelector } from "@/components/UserFilterSelector";

export type Filters = {
  showUrgent: boolean;
  showImpact: boolean;
  showMajorIncident: boolean;
  status: TriageStatus[];
  showDone?: boolean;
  searchText?: string;
  difficulty: number[];
  category: Category[];
  selectedUserId?: string | null; // For multi-user filtering
};

interface FilterControlsProps {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  includeDoneFilter?: boolean;
  defaultFilters?: Partial<Filters>;
}

export const FilterControls: React.FC<FilterControlsProps> = ({
  filters,
  setFilters,
  includeDoneFilter,
  defaultFilters
}) => {
  // Update state and persist to session storage
  const updateAndPersistFilters = (newFilters: Filters) => {
    setFilters(newFilters);
    saveFiltersToSessionStorage(newFilters);
  };

  const getResetFilters = (): Filters => {
    // Default reset filters (previous behavior)
    const baseResetFilters: Filters = {
      showUrgent: false,
      showImpact: false,
      showMajorIncident: false,
      status: [],
      showDone: false,
      searchText: "",
      difficulty: [],
      category: []
    };

    // If defaultFilters is provided, use it to override the base reset filters
    if (defaultFilters) {
      return {
        ...baseResetFilters,
        ...defaultFilters,
        // Ensure difficulty and category are always arrays
        difficulty: defaultFilters.difficulty || [],
        category: defaultFilters.category || []
      };
    }

    return baseResetFilters;
  };

  const handleClearFilters = () => {
    const resetFilters = getResetFilters();
    updateAndPersistFilters(resetFilters);
    clearFiltersFromSessionStorage();
  };

  return (
    <React.Fragment>
      <div className="flex items-center space-x-2">
        <Input
          type="text"
          placeholder="Search tasks..."
          value={filters.searchText || ""}
          onChange={(e) => updateAndPersistFilters({ ...filters, searchText: e.target.value })}
          className="w-40"
        />
      </div>

      <UserFilterSelector
        selectedUserId={filters.selectedUserId}
        onUserChange={(userId) => updateAndPersistFilters({ ...filters, selectedUserId: userId })}
      />

      <div className="flex items-center space-x-2">
        <Checkbox
          id="show-urgent"
          checked={filters.showUrgent}
          onCheckedChange={(checked) => updateAndPersistFilters({ ...filters, showUrgent: !!checked })}
        />
        <Label htmlFor="show-urgent">Urgent</Label>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="show-impact"
          checked={filters.showImpact}
          onCheckedChange={(checked) => updateAndPersistFilters({ ...filters, showImpact: !!checked })}
        />
        <Label htmlFor="show-impact">High Impact</Label>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="show-major-incident"
          checked={filters.showMajorIncident}
          onCheckedChange={(checked) => updateAndPersistFilters({ ...filters, showMajorIncident: !!checked })}
        />
        <Label htmlFor="show-major-incident">Incident on Delivery</Label>
      </div>

      <div className="flex items-center space-x-2">
        <Label>Status:</Label>
        <MultiSelect
          options={[
            { value: "Backlog", label: "Backlog" },
            { value: "Ready", label: "Ready" },
            { value: "WIP", label: "WIP" },
            { value: "Blocked", label: "Blocked" },
            { value: "Done", label: "Done" },
            { value: "Dropped", label: "Dropped" }
          ]}
          selected={filters.status || []}
          onChange={(selected) => updateAndPersistFilters({ ...filters, status: selected as TriageStatus[] })}
          placeholder="Select status..."
          className="w-40"
        />
      </div>
      {includeDoneFilter && (
        <div className="flex items-center space-x-2">
          <Checkbox
            id="show-done"
            checked={!!filters.showDone}
            onCheckedChange={(checked) => updateAndPersistFilters({ ...filters, showDone: !!checked })}
          />
          <Label htmlFor="show-done">Done</Label>
        </div>
      )}
      <div className="flex items-center space-x-2">
        <Label>Difficulty:</Label>
        <MultiSelect
          options={[
            { value: "0.5", label: "0.5" },
            { value: "1", label: "1" },
            { value: "2", label: "2" },
            { value: "3", label: "3" },
            { value: "5", label: "5" },
            { value: "8", label: "8" }
          ]}
          selected={filters.difficulty?.map(String) || []}
          onChange={(selected) => updateAndPersistFilters({ ...filters, difficulty: selected?.map(Number) || [] })}
          placeholder="Select difficulty..."
          className="w-40"
        />
      </div>
      <div className="flex items-center space-x-2">
        <Label>Category:</Label>
        <MultiSelect
          options={CATEGORIES.map(c => ({ value: c, label: c }))}
          selected={filters.category || []}
          onChange={(selected) => updateAndPersistFilters({ ...filters, category: (selected as Category[]) || [] })}
          placeholder="Select category..."
          className="w-40"
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleClearFilters}
      >
        Clear All Filters
      </Button>
    </React.Fragment>
  );
};