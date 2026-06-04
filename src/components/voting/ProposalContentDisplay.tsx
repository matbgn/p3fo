import * as React from "react";

interface ProposalContentDisplayProps {
  content: string | undefined | null;
  className?: string;
}

function renderBlockNoteContent(content: string): string {
  try {
    const blocks = JSON.parse(content);
    if (Array.isArray(blocks)) {
      return blocks
        .map((b: { content?: Array<{ text?: string }> }) => {
          if (!b.content || !Array.isArray(b.content)) return "";
          return `<p>${b.content.map((c: { text?: string }) => c.text || "").join("")}</p>`;
        })
        .join("");
    }
  } catch { /* empty */ }
  return content;
}

export const ProposalContentDisplay: React.FC<ProposalContentDisplayProps> = ({
  content,
  className = "",
}) => {
  if (!content) return null;
  return (
    <div
      className={`prose prose-sm max-w-none ${className}`}
      dangerouslySetInnerHTML={{
        __html: renderBlockNoteContent(content),
      }}
    />
  );
};