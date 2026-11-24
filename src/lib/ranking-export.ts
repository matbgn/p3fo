export interface RankingExportItem {
  rank: number;
  id: string;
  title: string;
  score?: number;
  tied?: boolean;
}

function csvEscape(value: string): string {
  const neutralized = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

/** One title per line, in rank order; suitable for batch import. */
function singleLine(value: string): string {
  return value.replace(/\s*\n+\s*/g, ' ').trim();
}

export function buildPlainRankingList(items: RankingExportItem[]): string {
  return items.map((item) => singleLine(item.title)).join('\n');
}

/** Rank-prefixed list; tied items keep the same rank. */
export function buildRankedList(items: RankingExportItem[]): string {
  return items
    .map((item) => `${item.rank}. ${singleLine(item.title)}`)
    .join('\n');
}

export function buildRankingCsv(items: RankingExportItem[]): string {
  const header = 'rank,title,id,score,tied';
  const rows = items.map((item) =>
    [
      String(item.rank),
      csvEscape(item.title),
      csvEscape(item.id),
      item.score === undefined ? '' : String(item.score),
      item.tied ? 'true' : 'false',
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

export function buildRankingJson(items: RankingExportItem[]): string {
  return JSON.stringify(items, null, 2);
}

/**
 * Copy text to the clipboard.
 *
 * @returns `true` when a clipboard path reported success, `false` when both
 * the async Clipboard API and the legacy fallback failed, so callers do not
 * show a false success confirmation.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path.
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  try {
    textarea.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Delay revocation to ensure download starts, matching DataExporter/BoardOptions.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 100);
}
