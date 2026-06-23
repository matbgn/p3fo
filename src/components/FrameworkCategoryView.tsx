import * as React from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { doc, isCollaborationEnabled, provider, yFrameworks } from "@/lib/collaboration";
import { useUserSettings } from "@/hooks/useUserSettings";

const CURSOR_COLORS = [
  "#f87171", "#fb923c", "#facc15", "#a3e635", "#4ade80",
  "#2dd4bf", "#38bdf8", "#818cf8", "#c084fc", "#f472b6",
];

function getRandomColor(): string {
  return CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
}

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

interface FrameworkCategoryViewProps {
  categoryId: string;
  label: string;
  description: string;
  content: string;
  onChange: (json: string) => void;
  frameworkId: string;
  optional?: boolean;
  collapsible?: boolean;
}

export const FrameworkCategoryView: React.FC<FrameworkCategoryViewProps> = ({
  categoryId,
  label,
  description,
  content,
  onChange,
  frameworkId,
  optional = false,
  collapsible = true,
}) => {
  const { userSettings } = useUserSettings();
  const [userColor] = React.useState(getRandomColor);
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  const collaborativeKey = `framework-${frameworkId}-${categoryId}`;
  const initialBlocks = deserializeBlocks(content);

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
          placeholders: { default: `Write your ${label.toLowerCase()} here...` },
        }
      : {
          initialContent: initialBlocks,
          placeholders: { default: `Write your ${label.toLowerCase()} here...` },
        }
  );

  React.useEffect(() => {
    if (!collaborativeKey || !isCollaborationEnabled()) return;
    if (!editor) return;

    const fragment = doc.getXmlFragment(collaborativeKey);
    const isEmpty = fragment.length === 0;

    if (isEmpty && initialBlocks.length > 0) {
      const rafId = requestAnimationFrame(() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          editor.replaceBlocks(editor.document.map((b: any) => b.id), initialBlocks);
        } catch {
          // Editor might not be ready
        }
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [collaborativeKey, editor, initialBlocks]);

  // Handle content changes
  React.useEffect(() => {
    if (!editor) return;
    let didInit = false;
    const persist = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = JSON.stringify(editor.document.map((b: any) => ({
        id: b.id,
        type: b.type,
        content: b.content,
        children: b.children,
        props: b.props,
      })));
      onChange(json);

      if (collaborativeKey && isCollaborationEnabled()) {
        const match = collaborativeKey.match(/^framework-([^-]+)-(.+)$/);
        if (match) {
          const [, fwId] = match;
          doc.transact(() => {
            const existing = yFrameworks.get(fwId);
            if (existing && typeof existing === "object") {
              yFrameworks.set(fwId, { ...existing });
            }
          });
        }
      }
    };
    const unsubscribe = editor.onChange(() => {
      if (!didInit) {
        didInit = true;
        // In collaboration mode the first onChange carries the Yjs fragment
        // content synced from the server. Persist it so the SQL snapshot (and
        // therefore data export) stays in sync with the live collaborative doc.
        if (collaborativeKey && isCollaborationEnabled()) {
          persist();
        }
        return;
      }
      persist();
    });
    return () => unsubscribe();
  }, [editor, collaborativeKey, onChange]);

  return (
    <div className="border rounded-lg mb-4 bg-white">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 select-none"
        onClick={() => collapsible && setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-base font-semibold text-gray-900 uppercase tracking-wide truncate">
            {label}
          </h3>
          {optional && (
            <span className="text-xs text-gray-400 italic shrink-0">(optional)</span>
          )}
        </div>
        {collapsible && (
          <span className="text-gray-400 text-sm shrink-0 ml-2">
            {isCollapsed ? "▸" : "▾"}
          </span>
        )}
      </div>

      {!isCollapsed && (
        <>
          <div className="px-4 pb-2">
            <p className="text-sm text-gray-500 italic">{description}</p>
          </div>
          <div className="px-4 pb-4">
            <div className="min-h-[80px] rounded-md border border-gray-200 bg-white">
              <BlockNoteView
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                editor={editor as any}
                theme="light"
                className="w-full"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};