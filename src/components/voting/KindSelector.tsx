import * as React from "react";
import { VoteKind } from "@/lib/persistence-types";
import { getVotingStrings } from "@/lib/voting-i18n";
import { cn } from "@/lib/utils";

interface KindSelectorProps {
  value: VoteKind;
  onChange: (kind: VoteKind) => void;
  disabled?: boolean;
}

const KINDS: VoteKind[] = ["consultation", "decision"];

export const KindSelector: React.FC<KindSelectorProps> = ({ value, onChange, disabled }) => {
  const t = getVotingStrings();
  return (
    <div className="flex gap-2">
      {KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          disabled={disabled}
          onClick={() => onChange(kind)}
          className={cn(
            "flex-1 rounded-md border px-4 py-3 text-left transition-colors",
            value === kind
              ? "border-red-600 bg-red-50 text-red-900"
              : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <div className="text-sm font-medium">{t.kinds[kind]}</div>
          <div className="text-xs text-gray-500 mt-0.5">{t.kindDescriptions[kind]}</div>
        </button>
      ))}
    </div>
  );
};