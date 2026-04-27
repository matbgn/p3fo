import * as React from "react";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";

interface BlockNotePreviewProps {
  /** JSON string (BlockNote block array) or raw markdown fallback */
  value: string | undefined;
  className?: string;
}

function deserializeBlocks(raw: string | undefined): any[] {
  if (!raw || raw.trim() === "") {
    return [{ type: "paragraph", content: [{ type: "text", text: "" }] }];
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // Fall back to markdown
  }
  const blocks: any[] = [];
  for (const line of (raw || "").split("\n")) {
    const trimmed = line.trimEnd();
    if (!trimmed.trim()) continue;
    if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
      blocks.push({
        type: "bulletListItem",
        content: [{ type: "text", text: trimmed.slice(2).trimStart() }],
      });
    } else {
      blocks.push({ type: "paragraph", content: [{ type: "text", text: trimmed }] });
    }
  }
  return blocks.length
    ? blocks
    : [{ type: "paragraph", content: [{ type: "text", text: "" }] }];
}

export const BlockNotePreview: React.FC<BlockNotePreviewProps> = ({
  value,
  className,
}) => {
  const editor = useCreateBlockNote({
    initialContent: [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
    placeholders: {},
  } as any);

  // Imperatively replace blocks when value changes so preview stays in sync
  React.useLayoutEffect(() => {
    if (!editor) return;
    const newBlocks = deserializeBlocks(value);
    editor.replaceBlocks(editor.document.map((b: any) => b.id), newBlocks);
  }, [value, editor]);

  return (
    <div className={className}>
      <BlockNoteView
        editor={editor as any}
        theme="light"
        editable={false}
        className="bn-editor-preview"
      />
    </div>
  );
};
