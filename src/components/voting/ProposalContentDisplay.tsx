import * as React from "react";
import { BlockNotePreview } from "@/components/BlockNotePreview";

interface ProposalContentDisplayProps {
  content: string | undefined | null;
  className?: string;
}

export const ProposalContentDisplay: React.FC<ProposalContentDisplayProps> = ({
  content,
  className = "",
}) => {
  if (!content) return null;
  return (
    <div className={`prose prose-sm max-w-none ${className}`}>
      <BlockNotePreview value={content} className="bn-editor-preview" />
    </div>
  );
};
