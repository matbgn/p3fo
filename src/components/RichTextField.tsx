import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { BlockNotePreview } from "./BlockNotePreview";
import { doc, isCollaborationEnabled, provider, yCircles } from "@/lib/collaboration";
import { useUserSettings } from "@/hooks/useUserSettings";

/* ── Serialize: BlockNote blocks → JSON string ─────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeBlocks(blocks: any[]): string {
  return JSON.stringify(blocks);
}

/* ── Deserialize: JSON string → BlockNote blocks ───────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deserializeBlocks(raw: string | undefined): any[] {
  if (!raw || raw.trim() === "") {
    return [{ type: "paragraph", content: [{ type: "text", text: "" }] }];
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // fall through to markdown fallback
  }
  // Fallback: turn raw markdown text into basic blocks
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      blocks.push({
        type: "paragraph",
        content: [{ type: "text", text: trimmed }],
      });
    }
  }
  return blocks.length
    ? blocks
    : [{ type: "paragraph", content: [{ type: "text", text: "" }] }];
}

/* ── Color palette for user cursors ───────────────────────────────── */
const CURSOR_COLORS = [
  "#f87171", "#fb923c", "#facc15", "#a3e635", "#4ade80",
  "#2dd4bf", "#38bdf8", "#818cf8", "#c084fc", "#f472b6",
];

function getRandomColor(): string {
  return CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
}

/* ── Collaborative Editor Modal ───────────────────────────────────── */
interface EditorModalProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialBlocks: any[];
  label: string;
  placeholder: string;
  onSave: (json: string) => void;
  onCancel: () => void;
  collaborativeKey?: string; // e.g., "circle-123-purpose"
}

const EditorModal: React.FC<EditorModalProps> = ({
  initialBlocks,
  label,
  placeholder,
  onSave,
  onCancel,
  collaborativeKey,
}) => {
  const { userSettings } = useUserSettings();
  const [userColor] = React.useState(getRandomColor);

  // Create editor with or without collaboration
  const editor = useCreateBlockNote(
    collaborativeKey && isCollaborationEnabled()
      ? {
          collaboration: {
            fragment: doc.getXmlFragment(collaborativeKey),
            provider: provider || undefined,
            user: {
              name: userSettings.username || "Anonymous",
              color: userColor,
            },
            showCursorLabels: "activity",
          },
          placeholders: { default: placeholder },
        }
      : {
          initialContent: initialBlocks,
          placeholders: { default: placeholder },
        }
  );

  // For collaborative mode, sync initial content if Yjs fragment is empty
  React.useEffect(() => {
    if (!collaborativeKey || !isCollaborationEnabled()) return;
    if (!editor) return;
    
    // Check if this is the first time opening this document - if the fragment is empty, seed it
    const fragment = doc.getXmlFragment(collaborativeKey);
    const isEmpty = fragment.length === 0;
    
    if (isEmpty && initialBlocks.length > 0) {
      // Use setTimeout to ensure editor is ready
      const timeout = setTimeout(() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          editor.replaceBlocks(editor.document.map((b: any) => b.id), initialBlocks);
        } catch {
          // Editor might not be ready yet, ignore
        }
      }, 0);
      return () => clearTimeout(timeout);
    }
  }, [collaborativeKey, editor, initialBlocks]);

  const handleSave = () => {
    const json = serializeBlocks(editor.document);
    onSave(json);
    // In collaborative mode, also push to yCircles so other clients'
    // parent modals see the update immediately.
    if (collaborativeKey && isCollaborationEnabled()) {
      const match = collaborativeKey.match(/^circle-([^-]+)-(purpose|missions|authorityScope)$/);
      if (match) {
        const [, circleId, field] = match;
        doc.transact(() => {
          const existing = yCircles.get(circleId);
          if (existing && typeof existing === "object") {
            yCircles.set(circleId, { ...existing, [field]: json });
          }
        });
      }
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit {label}</DialogTitle>
        <DialogDescription className="sr-only">
          Edit the {label} field using the rich text editor below.
        </DialogDescription>
      </DialogHeader>
      <div className="flex-1 min-h-[300px] py-4">
        <BlockNoteView
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          editor={editor as any}
          theme="light"
          className="w-full h-full"
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave}>Save</Button>
      </DialogFooter>
    </>
  );
};

/* ── Main component ─────────────────────────────────────────────────── */
interface RichTextFieldProps {
  value: string | undefined;        // stored as JSON string of blocks
  onChange: (json: string) => void; // emits JSON string of blocks
  label: string;
  placeholder?: string;
  className?: string;
  collaborativeKey?: string;       // optional Yjs fragment key for live collaboration
}

export const RichTextField: React.FC<RichTextFieldProps> = ({
  value,
  onChange,
  label,
  placeholder = "Type here…",
  className,
  collaborativeKey,
}) => {
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editorKey, setEditorKey] = React.useState(0);

  const handleOpen = () => {
    setEditorKey((k) => k + 1); // force fresh EditorModal mount
    setModalOpen(true);
  };

  const handleSave = (json: string) => {
    onChange(json);
    setModalOpen(false);
  };

  const handleCancel = () => {
    setModalOpen(false);
  };

  return (
    <div className={className}>
      {/* Inline read-only preview (BlockNote renders JSON blocks natively) */}
      <div className="flex items-start gap-2 group">
        <div className="flex-1 min-w-0">
          {(value || "").trim() !== "" ? (
            <BlockNotePreview value={value} />
          ) : (
            <span className="text-sm text-muted-foreground italic">
              {placeholder}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity"
          onClick={handleOpen}
          title={`Edit ${label}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>

      {/* Modal: fresh EditorModal on every open */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className="max-w-2xl max-h-[85vh] flex flex-col"
          aria-describedby="__bn_editor_desc__"
        >
          <DialogDescription id="__bn_editor_desc__" className="sr-only">
            Edit the {label} field using the rich text editor below.
          </DialogDescription>
          {modalOpen && (
            <EditorModal
              key={editorKey}
              initialBlocks={deserializeBlocks(value)}
              label={label}
              placeholder={placeholder}
              onSave={handleSave}
              onCancel={handleCancel}
              collaborativeKey={collaborativeKey}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};