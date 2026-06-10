import * as React from "react";

interface ProposalContentDisplayProps {
  content: string | undefined | null;
  className?: string;
}

function renderBlockNoteContent(content: string): React.ReactNode {
  try {
    const blocks = JSON.parse(content);
    if (Array.isArray(blocks)) {
      return blocks.map(
        (b: { content?: Array<{ text?: string }> }, i: number) => {
          if (!b.content || !Array.isArray(b.content)) return null;
          const text = b.content
            .map((c: { text?: string }) => c.text || "")
            .join("");
          return <p key={i}>{text}</p>;
        },
      );
    }
  } catch {
    // fall through to safe text rendering
  }
  return <p>{content}</p>;
}

export const ProposalContentDisplay: React.FC<ProposalContentDisplayProps> = ({
  content,
  className = "",
}) => {
  if (!content) return null;
  return (
    <div className={`prose prose-sm max-w-none ${className}`}>
      {renderBlockNoteContent(content)}
    </div>
  );
};