import * as React from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";

// BlockNote block content types
type BlockContent = string | Array<{ type: string; text?: string; styles?: Record<string, unknown> }>;

// Helper: convert plain text to initial BlockNote blocks
function textToBlocks(text: string | undefined): { type: string; content: BlockContent }[] {
  if (!text || text.trim() === "") {
    return [{ type: "paragraph", content: [{ type: "text", text: "" }] }];
  }
  const paragraphs = text.split("\n\n").filter((p) => p.trim() !== "");
  if (paragraphs.length === 0) {
    return [{ type: "paragraph", content: [{ type: "text", text }] }];
  }
  return paragraphs.map((p) => ({
    type: "paragraph",
    content: [{ type: "text", text: p }],
  }));
}

// Helper: extract plain text from BlockNote blocks
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function blocksToText(editor: any): string {
  const blocks = editor.document;
  return blocks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((block: any) => {
      let text = "";
      if (block.content) {
        if (typeof block.content === "string") {
          text = block.content;
        } else {
          text = block.content
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((c: any) => c.text || "")
            .join("");
        }
      }
      return text;
    })
    .filter((t: string) => t.trim() !== "")
    .join("\n\n");
}

interface BlockNoteEditorProps {
  initialContent?: string;
  onChange: (text: string) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
}

export const BlockNoteEditor: React.FC<BlockNoteEditorProps> = ({
  initialContent,
  onChange,
  placeholder = "Type here...",
  className,
  readOnly = false,
}) => {
  const didInitRef = React.useRef(false);
  const prevTextRef = React.useRef(initialContent || "");

  const editor = useCreateBlockNote({
    initialContent: textToBlocks(initialContent),
    placeholders: { default: placeholder },
  });

  // Subscribe to content changes
  React.useEffect(() => {
    if (!editor || didInitRef.current) return;
    didInitRef.current = true;
    const unsubscribe = editor.onChange((_editor) => {
      const text = blocksToText(_editor);
      if (text !== prevTextRef.current) {
        prevTextRef.current = text;
        onChange(text);
      }
    });
    return () => {
      unsubscribe();
    };
  }, [editor, onChange]);

  return (
    <div
      className={
        "flex min-h-[100px] w-full rounded-md border border-input bg-background p-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 " +
        (className || "")
      }
    >
      <BlockNoteView
        editor={editor}
        theme={"light"}
        editable={!readOnly}
      />
    </div>
  );
};