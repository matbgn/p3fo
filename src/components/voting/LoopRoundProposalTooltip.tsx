import * as React from "react";
import { deserializeBlocks } from "./BlockNoteProposalEditor";
import { getVotingStrings } from "@/lib/voting-i18n";

interface LoopRoundProposalTooltipProps {
  children: React.ReactNode;
  proposalContent: string | undefined;
  roundNumber: number;
}

function blocksToPlainText(json: string | undefined): string {
  if (!json || json.trim() === "") return "";
  const blocks = deserializeBlocks(json);
  return blocks
    .map((b: { content?: Array<{ text?: string }> }) => {
      if (!b.content || !Array.isArray(b.content)) return "";
      return b.content.map((c: { text?: string }) => c.text || "").join("");
    })
    .filter(Boolean)
    .join("\n\n");
}

const TOOLTIP_WIDTH = 288;
const TOOLTIP_OFFSET = 12;
const TOOLTIP_MARGIN = 8;

export const LoopRoundProposalTooltip: React.FC<LoopRoundProposalTooltipProps> = ({
  children,
  proposalContent,
  roundNumber,
}) => {
  const t = getVotingStrings();
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number; placement: "right" | "left" } | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mousePosRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleMouseMove = React.useCallback((e: React.MouseEvent) => {
    mousePosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const show = React.useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const { x, y } = mousePosRef.current;
      const placement: "right" | "left" =
        x + TOOLTIP_OFFSET + TOOLTIP_WIDTH + TOOLTIP_MARGIN <= vw ? "right" : "left";
      const left =
        placement === "right"
          ? Math.min(x + TOOLTIP_OFFSET, vw - TOOLTIP_WIDTH - TOOLTIP_MARGIN)
          : Math.max(x - TOOLTIP_OFFSET - TOOLTIP_WIDTH, TOOLTIP_MARGIN);
      const top = Math.max(
        TOOLTIP_MARGIN,
        Math.min(y - 16, vh - 200 - TOOLTIP_MARGIN)
      );
      setPos({ top, left, placement });
      setOpen(true);
    }, 120);
  }, []);

  const hide = React.useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(false), 80);
  }, []);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const text = blocksToPlainText(proposalContent);
  const hasContent = text.length > 0;

  return (
    <>
      <div
        ref={containerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onMouseMove={handleMouseMove}
        onFocus={show}
        onBlur={hide}
        className="contents"
      >
        {children}
      </div>
      {open && pos && (
        <div
          ref={tooltipRef}
          className="fixed z-50 max-w-md w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-left"
          style={{ top: pos.top, left: pos.left }}
          onMouseEnter={() => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
          }}
          onMouseLeave={hide}
          role="tooltip"
        >
          <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">
            {t.labels.round} {roundNumber} — Proposal
          </div>
          {hasContent ? (
            <div className="text-xs text-gray-800 whitespace-pre-wrap line-clamp-8 max-h-48 overflow-y-auto">
              {text}
            </div>
          ) : (
            <div className="text-xs text-gray-400 italic">(empty)</div>
          )}
        </div>
      )}
    </>
  );
};
