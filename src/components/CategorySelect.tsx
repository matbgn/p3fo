import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Category } from "@/hooks/useTasks";
import { useWorkspaceTaxonomy } from "@/hooks/useWorkspaceTaxonomy";

const CategorySelectInner: React.FC<{
  value?: Category | "none";
  onChange: (v: Category | "none" | undefined) => void;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}> = ({ value, onChange, className, onOpenChange }) => {
  const { options } = useWorkspaceTaxonomy();
  // A task may still carry a category removed or renamed in the workspace
  // settings; keep it selectable so editing a task never silently drops it.
  const current = value && value !== "none" ? value : null;
  const choices = current && !options.includes(current) ? [...options, current] : options;

  return (
    <Select
      value={value || "none"}
      onValueChange={(v) => onChange(v as Category | "none")}
      onOpenChange={onOpenChange}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder="Category" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No category</SelectItem>
        {choices.map((category) => (
          <SelectItem key={category} value={category}>
            {category}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export const CategorySelect = React.memo(CategorySelectInner);
