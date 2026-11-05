type AnyNode = Record<string, unknown>;

/**
 * Render a P3FO task comment (BlockNote / ProseMirror JSON) as plain text.
 *
 * The stored value is normally a JSON string such as:
 *   [{"type":"heading","props":{"level":3},"content":[{"type":"text","text":"..."}]}]
 * Plain strings and already-parsed objects are accepted too.
 */
export function renderCommentText(comment: unknown): string | null {
  if (comment === null || comment === undefined) return null;
  if (typeof comment === 'string') {
    const trimmed = comment.trim();
    if (!trimmed) return null;
    if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return trimmed;
    try {
      return finalize(renderNode(JSON.parse(trimmed)));
    } catch {
      return trimmed;
    }
  }
  if (Array.isArray(comment) || typeof comment === 'object') {
    return finalize(renderNode(comment));
  }
  return String(comment);
}

function renderInline(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((child) => {
      if (typeof child === 'string') return child;
      if (child && typeof child === 'object') {
        const node = child as AnyNode;
        if (typeof node.text === 'string') return node.text;
        if (node.content) return renderInline(node.content);
      }
      return '';
    })
    .join('');
}

function renderNode(node: unknown): string {
  if (typeof node === 'string') return node;
  if (node === null || node === undefined) return '';
  if (Array.isArray(node)) {
    return node.map((child) => renderNode(child)).filter(Boolean).join('\n');
  }
  if (typeof node !== 'object') return String(node);

  const value = node as AnyNode;
  const type = typeof value.type === 'string' ? value.type : '';
  const inline = renderInline(value.content);
  const children = renderNestedChildren(value);

  switch (type) {
    case 'heading':
      return `\n\n### ${inline}${children}`;
    case 'paragraph':
      return `\n\n${inline}${children}`;
    case 'bulletListItem':
      return `\n- ${inline}${children}`;
    case 'numberedListItem':
      return `\n1. ${inline}${children}`;
    case 'checkListItem':
      return `\n- [ ] ${inline}${children}`;
    case 'codeBlock':
      return `\n\n\`\`\`\n${inline}\n\`\`\`${children}`;
    case 'image':
      return `\n\n[image]${children}`;
    case 'table':
      return `\n\n${renderNode(value.content)}${children}`;
    default:
      if (inline) return `\n\n${inline}${children}`;
      if (value.content) return `\n${renderNode(value.content)}${children}`;
      return children;
  }
}

/** BlockNote stores nested blocks in `children`, not `content`. */
function renderNestedChildren(value: AnyNode): string {
  if (!Array.isArray(value.children) || value.children.length === 0) return '';
  const rendered = renderNode(value.children);
  if (!rendered) return '';
  const indented = rendered
    .split('\n')
    .map((line) => (line ? `  ${line}` : line))
    .join('\n');
  return `\n${indented}`;
}

function finalize(text: string): string | null {
  const normalized = text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalized.length > 0 ? normalized : null;
}
