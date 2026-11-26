/**
 * The default task categories of a new P3FO workspace.
 *
 * Workspaces may add, rename or remove categories in Settings › Labels &
 * categories, so an unknown name is only a warning, never an error. The MCP
 * server is a standalone package and cannot import from the app source tree
 * at build time; keep this in sync with `DEFAULT_CATEGORIES` in
 * `src/lib/workspace-taxonomy.ts`.
 */
export const CATEGORIES = [
  'Marketing',
  'Documentation',
  'Consulting',
  'Testing',
  'Funerals',
  'Negotiated overtime',
  'Sickness',
  'Finances',
  'HR',
  'Training',
  'Support',
  'UX/UI',
  'Admin',
  'Development',
  'System Operations',
  'Private',
] as const;

export const GENERAL_CATEGORY = 'General';

const KNOWN = new Set<string>(CATEGORIES);

export function isKnownCategory(value: string | null | undefined): boolean {
  return typeof value === 'string' && KNOWN.has(value);
}

export function isGeneralCategory(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === GENERAL_CATEGORY.toLowerCase();
}
