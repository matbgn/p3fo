/**
 * Task categories known to the P3FO application.
 *
 * Keep in sync with `src/data/categories.ts`. The MCP server is a standalone
 * package and cannot import from the app source tree at build time.
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
