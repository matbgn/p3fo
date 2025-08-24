import React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { TriageStatus } from "@/hooks/useTasks";

export type Filters = {
  showUrgent: boolean;
  showImpact: boolean;
  showMajorIncident: boolean;
  status: TriageStatus[];
  showDone?: boolean;
  searchText?: string;
};

interface FilterControlsProps {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  includeDoneFilter?: boolean;
}

export const FilterControls: React.FC<FilterControlsProps> = ({ filters, setFilters, includeDoneFilter }) => {
  return (
    <React.Fragment>
      <div className="flex items-center space-x-2">
        <Input
          type="text"
          placeholder="Search tasks..."
          value={filters.searchText || ""}
          onChange={(e) => setFilters(f => ({ ...f, searchText: e.target.value }))}
          className="w-40"
        />
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="show-urgent"
          checked={filters.showUrgent}
          onCheckedChange={(checked) => setFilters(f => ({ ...f, showUrgent: !!checked }))}
        />
        <Label htmlFor="show-urgent">Urgent</Label>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="show-impact"
          checked={filters.showImpact}
          onCheckedChange={(checked) => setFilters(f => ({ ...f, showImpact: !!checked }))}
        />
        <Label htmlFor="show-impact">High Impact</Label>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="show-major-incident"
          checked={filters.showMajorIncident}
          onCheckedChange={(checked) => setFilters(f => ({ ...f, showMajorIncident: !!checked }))}
        />
        <Label htmlFor="show-major-incident">Major Incident</Label>
      </div>

      <div className="flex items-center space-x-2">
        <MultiSelect
          options={[
            { value: "Backlog", label: "Backlog" },
            { value: "Ready", label: "Ready" },
            { value: "WIP", label: "WIP" },
            { value: "Blocked", label: "Blocked" },
            { value: "Dropped", label: "Dropped" }
          ]}
          selected={filters.status}
          onChange={(selected) => setFilters(f => ({ ...f, status: selected as TriageStatus[] }))}
          placeholder="Select status..."
          className="w-40"
        />
        <Label>Status</Label>
      </div>
      {includeDoneFilter && (
        <div className="flex items-center space-x-2">
          <Checkbox
            id="show-done"
            checked={!!filters.showDone}
            onCheckedChange={(checked) => setFilters(f => ({ ...f, showDone: !!checked }))}
          />
          <Label
            htmlFor="show-done"
            className={filters.showDone ? "" : "line-through"}
          >
            Done
          </Label>
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setFilters({
          showUrgent: false,
          showImpact: false,
          showMajorIncident: false,
          status: ["Backlog", "Ready", "WIP", "Blocked"],
          showDone: false,
          searchText: ""
        })}
      >
        Clear
      </Button>
    </React.Fragment>
  );
};