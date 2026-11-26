/**
 * Task colors accepted by the MCP API.
 *
 * Mirrors `src/lib/planner/colors.ts` in the app. The MCP server is a
 * standalone package and cannot import app source at build time, so the app
 * keeps both definitions in lockstep with `mcp-colors-parity.test.ts`.
 */
export const TASK_COLOR_VALUES = [
  'none',
  'pink',
  'yellow',
  'black',
  'grey',
  'cornflower',
  'mango',
  'green',
  'lilac',
] as const;

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;

/**
 * The canonical value for a task color: the preset id unchanged, a free
 * `#rgb` expanded to lowercase `#rrggbb`, or null when it is not a color.
 */
export function normalizeTaskColorValue(value: string): string | null {
  if ((TASK_COLOR_VALUES as readonly string[]).includes(value)) return value;

  const raw = value.trim().toLowerCase();

  if (HEX6.test(raw)) return raw;

  if (HEX3.test(raw)) {
    const [red, green, blue] = raw.slice(1).split('');
    return `#${red}${red}${green}${green}${blue}${blue}`;
  }

  return null;
}
