import * as React from "react";
import { VoteKind } from "@/lib/persistence-types";
import { cn } from "@/lib/utils";

interface KindSelectorProps {
  value: VoteKind;
  onChange: (kind: VoteKind) => void;
  disabled?: boolean;
}

const OPTIONS: { value: VoteKind; label: string; description: string }[] = [
  { value: "consultation", label: "Consultation", description: "Gather input — results are advisory" },
  { value: "decision", label: "Decision", description: "Formal binding outcome with finalize step" },
];

export const KindSelector: React.FC<KindSelectorProps> = ({ value, onChange, disabled }) => {
  return (
    <div className="flex gap-2">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex-1 rounded-md border px-4 py-3 text-left transition-colors",
            value === opt.value
              ? "border-red-600 bg-red-50 text-red-900"
              : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <div className="text-sm font-medium">{opt.label}</div>
          <div className="text-xs text-gray-500 mt-0.5">{opt.description}</div>
        </button>
      ))}
    </div>
  );
};