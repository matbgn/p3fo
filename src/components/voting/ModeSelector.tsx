import * as React from "react";
import { VoteMode } from "@/lib/persistence-types";
import { getVotingStrings } from "@/lib/voting-i18n";
import { cn } from "@/lib/utils";
import { ThumbsUp, Minus, Coins, Award, RotateCcw } from "lucide-react";

interface ModeSelectorProps {
  value: VoteMode;
  onChange: (mode: VoteMode) => void;
  disabled?: boolean;
}

const MODE_ICONS: Record<VoteMode, React.ReactNode> = {
  THUMBS_UP: <ThumbsUp className="w-4 h-4" />,
  THUMBS_UD_NEUTRAL: <Minus className="w-4 h-4" />,
  POINTS: <Coins className="w-4 h-4" />,
  MAJORITY_JUDGMENT: <Award className="w-4 h-4" />,
  CONSENT_LOOP: <RotateCcw className="w-4 h-4" />,
};

const ALL_MODES: VoteMode[] = ["THUMBS_UP", "THUMBS_UD_NEUTRAL", "POINTS", "MAJORITY_JUDGMENT", "CONSENT_LOOP"];

export const ModeSelector: React.FC<ModeSelectorProps> = ({ value, onChange, disabled }) => {
  const t = getVotingStrings();
  return (
    <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {ALL_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          disabled={disabled}
          onClick={() => onChange(mode)}
          className={cn(
            "flex items-center gap-2 rounded-md border px-3 py-2.5 text-left transition-colors",
            value === mode
              ? "border-red-600 bg-red-50 text-red-900"
              : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <span className={value === mode ? "text-red-600" : "text-gray-400"}>
            {MODE_ICONS[mode]}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{t.modes[mode]}</div>
            <div className="text-xs text-gray-500 truncate">{t.modeDescriptions[mode]}</div>
          </div>
        </button>
      ))}
    </div>
  );
};