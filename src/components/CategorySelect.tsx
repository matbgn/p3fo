import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Category } from "@/hooks/useTasks";

const CATEGORIES: Category[] = [
  "Marketing",
  "Documentation",
  "Consulting",
  "Testing",
  "Funerals",
  "Negotiated overtime",
  "Sickness",
  "Finances",
  "HR",
  "Training",
  "Support",
  "UX/UI",
  "Admin",
  "Development",
  "System Operations",
];

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
        {CATEGORIES.map((category) => (
          <SelectItem key={category} value={category}>
            {category}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};