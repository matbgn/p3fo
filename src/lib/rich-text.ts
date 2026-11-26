type UnknownRecord = Record<string, unknown>;

function isBlockLike(value: unknown): value is UnknownRecord {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as UnknownRecord).type === "string"
  );
}

function inlineText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return "";
      const record = item as UnknownRecord;
      if (typeof record.text === "string") return record.text;
      if (Array.isArray(record.content)) return inlineText(record.content);
      return "";
    })
    .join("");
}

function blockLines(block: unknown, depth = 0): string[] {
  if (!block || typeof block !== "object") return [];
  const record = block as UnknownRecord;
  const type = typeof record.type === "string" ? record.type : "";
  const text = inlineText(record.content).trimEnd();
  const indent = "  ".repeat(depth);
  const lines: string[] = [];
  if (text) {
    if (
      type === "bulletListItem" ||
      type === "numberedListItem" ||
      type === "checkListItem"
    ) {
      lines.push(`${indent}- ${text}`);
    } else {
      lines.push(`${indent}${text}`);
    }
  }
  if (Array.isArray(record.children)) {
    for (const child of record.children) {
      lines.push(...blockLines(child, depth + 1));
    }
  }
  return lines;
}

function blockHasContent(block: unknown): boolean {
  if (!block || typeof block !== "object") return false;
  const record = block as UnknownRecord;
  if (inlineText(record.content).trim() !== "") return true;
  if (
    Array.isArray(record.children) &&
    record.children.some((child) => blockHasContent(child))
  ) {
    return true;
  }
  const type = typeof record.type === "string" ? record.type : "";
  return type !== "" && type !== "paragraph";
}

function parseBlockArray(value: string | undefined): unknown[] | null {
  if (!value || value.trim() === "") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.some((item) => isBlockLike(item))) {
      return parsed;
    }
  } catch {
    // Legacy plain text / markdown is handled by the caller.
  }
  return null;
}

/**
 * Plain-text projection of a vote/proposal description.
 *
 * Newer descriptions are BlockNote JSON; older ones are plain text or markdown.
 * Both are supported so cards, ICS files and emptiness checks never leak raw
 * JSON or collapse the author's line breaks.
 */
export function richTextToPlainText(value: string | undefined): string {
  if (!value || value.trim() === "") return "";
  const blocks = parseBlockArray(value);
  if (blocks) {
    return blocks
      .flatMap((block) => blockLines(block))
      .join("\n")
      .trim();
  }
  return value.trim();
}

/** True for absent content and for a BlockNote document with only empty blocks. */
export function isRichTextEmpty(value: string | undefined): boolean {
  if (!value || value.trim() === "") return true;
  const blocks = parseBlockArray(value);
  if (blocks) {
    return !blocks.some((block) => blockHasContent(block));
  }
  return false;
}
