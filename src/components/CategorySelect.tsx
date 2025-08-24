import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Category } from "@/hooks/useTasks";
import { CATEGORIES } from "@/data/categories";

export const CategorySelect: React.FC<{
  value?: Category | "none";
  onChange: (v: Category | "none" | undefined) => void;
  className?: string;
}> = ({ value, onChange, className }) => {
  return (
    <Select 
      value={value || "none"} 
      onValueChange={(v) => onChange(v as Category | "none")}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder="Category" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No category</SelectItem>
        {CATEGORIES.sort().map((category) => (
          <SelectItem key={category} value={category}>
            {category}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};