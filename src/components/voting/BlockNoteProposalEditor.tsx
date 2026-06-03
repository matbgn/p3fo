import * as React from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";

type BlockContent = string | Array<{ type: string; text?: string; styles?: Record<string, unknown> }>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deserializeBlocks(raw: string | undefined): any[] {
  if (!raw || raw.trim() === "") {
    return [{ type: "paragraph", content: [{ type: "text", text: "" }] }];
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // fall through
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [];
  for (const line of (raw || "").split("\n")) {
    const trimmed = line.trimEnd();
    if (!trimmed.trim()) continue;
    blocks.push({ type: "paragraph", content: [{ type: "text", text: trimmed }] });
  }
  return blocks.length
    ? blocks
    : [{ type: "paragraph", content: [{ type: "text", text: "" }] }];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeBlocks(editor: any): string {
  return JSON.stringify(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor.document.map((b: any) => ({
      id: b.id,
      type: b.type,
      content: b.content,
      children: b.children,
      props: b.props,
    }))
  );
}

interface BlockNoteProposalEditorProps {
  value: string;
  onChange: (json: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
}

export interface BlockNoteProposalEditorHandle {
  flush: () => string;
}

export const BlockNoteProposalEditor = React.forwardRef<
  BlockNoteProposalEditorHandle,
  BlockNoteProposalEditorProps
>(({ value, onChange, placeholder = "Write your proposal here...", readOnly = false, className }, ref) => {
  const didInitRef = React.useRef(false);
  const prevJsonRef = React.useRef(value);
  const editorRef = React.useRef<any>(null);

  const editor = useCreateBlockNote({
    initialContent: deserializeBlocks(value),
    placeholders: { default: placeholder },
  });

  editorRef.current = editor;

  React.useImperativeHandle(ref, () => ({
    flush: () => {
      if (!editorRef.current) return prevJsonRef.current;
      const json = serializeBlocks(editorRef.current);
      prevJsonRef.current = json;
      onChange(json);
      return json;
    },
  }), [onChange]);

  React.useEffect(() => {
    if (!editor || didInitRef.current) return;
    didInitRef.current = true;

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const unsubscribe = editor.onChange((_editor: any) => {
      const json = serializeBlocks(_editor);
      if (json !== prevJsonRef.current) {
        prevJsonRef.current = json;
        onChange(json);
      }
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return () => unsubscribe();
  }, [editor, onChange]);

  React.useLayoutEffect(() => {
    if (!editor || !didInitRef.current) return;
    if (value !== prevJsonRef.current) {
      const newBlocks = deserializeBlocks(value);
      try {
        editor.replaceBlocks(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          editor.document.map((b: any) => b.id),
          newBlocks
        );
      } catch {
        // editor not ready
      }
      prevJsonRef.current = value;
    }
  }, [value, editor]);

  return (
    <div
      className={
        "min-h-[80px] w-full rounded-md border border-gray-200 bg-white " +
        (className || "")
      }
    >
      <BlockNoteView
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        editor={editor as any}
        theme="light"
        editable={!readOnly}
        className="w-full"
      />
    </div>
  );
});

BlockNoteProposalEditor.displayName = "BlockNoteProposalEditor";

// eslint-disable-next-line react-refresh/only-export-components
export { deserializeBlocks };