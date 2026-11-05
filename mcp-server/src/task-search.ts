import type { TaskRecord } from './task-types.js';

// Mirrors src/lib/string-similarity.ts. Keep in sync with the app copy.
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  let prev = new Array<number>(bLen + 1);
  let curr = new Array<number>(bLen + 1);
  for (let j = 0; j <= bLen; j++) prev[j] = j;

  for (let i = 1; i <= aLen; i++) {
    curr[0] = i;
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[bLen];
}

export function similarityRatio(a: string, b: string): number {
  const sa = (a || '').trim().toLowerCase();
  const sb = (b || '').trim().toLowerCase();
  if (sa.length === 0 && sb.length === 0) return 1;
  const maxLen = Math.max(sa.length, sb.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(sa, sb);
  return 1 - dist / maxLen;
}

export type AStarSearchResult = {
  taskId: string;
  score: number;
  matches: { start: number; end: number }[];
};

// Mirrors src/lib/a-star-search.ts. Keep in sync with the app copy.
export function aStarTextSearch(
  query: string,
  tasks: { id: string; title: string }[],
): AStarSearchResult[] {
  if (!query.trim()) {
    return tasks.map((task) => ({ taskId: task.id, score: 1.0, matches: [] }));
  }

  const results: AStarSearchResult[] = [];
  const queryLower = query.toLowerCase().trim();

  for (const task of tasks) {
    const textLower = (task.title ?? '').toLowerCase();
    let score = 0.0;

    if (textLower === queryLower) {
      score = 1.0;
    } else if (textLower.includes(queryLower)) {
      score = 0.7 + (queryLower.length / Math.max(1, textLower.length)) * 0.3;
    } else {
      const words = textLower.split(/\s+/);
      let maxWordScore = 0;
      for (const word of words) {
        if (word.startsWith(queryLower)) {
          maxWordScore = Math.max(maxWordScore, 0.6 + (queryLower.length / Math.max(1, word.length)) * 0.4);
        } else if (word.includes(queryLower)) {
          maxWordScore = Math.max(maxWordScore, 0.3 + (queryLower.length / Math.max(1, word.length)) * 0.3);
        }
      }
      score = maxWordScore;
    }

    if (score > 0) {
      results.push({ taskId: task.id, score, matches: [] });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export type MatchKind = 'ticket' | 'id' | 'exact' | 'substring' | 'prefix' | 'fuzzy';

export interface ScoredTask {
  task: TaskRecord;
  score: number;
  matchedBy: MatchKind;
  ticketNumber: string | null;
}

export function extractTicketNumber(task: Pick<TaskRecord, 'id' | 'title'>): string | null {
  const titleMatch = /\bTicket\s*#?\s*(\d{4,})\b/i.exec(task.title ?? '');
  if (titleMatch) return titleMatch[1];

  const idMatch = /^zammad-(\d+)$/i.exec(task.id ?? '');
  if (idMatch) return idMatch[1];

  return null;
}

export function looksLikeTicket(query: string): boolean {
  return /^(?:ticket\s*#?\s*|zammad-|#)?(\d{4,})$/i.test(query.trim());
}

function normalizeTicketQuery(query: string): string | null {
  if (!looksLikeTicket(query)) return null;
  return query.trim().replace(/^(?:ticket\s*#?\s*|zammad-|#)/i, '');
}

export function scoreTask(query: string, task: TaskRecord): ScoredTask | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const title = (task.title ?? '').trim();
  const titleLower = title.toLowerCase();
  const ticket = extractTicketNumber(task);
  const ticketQuery = normalizeTicketQuery(query);

  if (ticketQuery && ticket === ticketQuery) {
    return { task, score: 1, matchedBy: 'ticket', ticketNumber: ticket };
  }

  if ((task.id ?? '').toLowerCase() === q) {
    return { task, score: 1, matchedBy: 'id', ticketNumber: ticket };
  }

  if (titleLower === q) {
    return { task, score: 1, matchedBy: 'exact', ticketNumber: ticket };
  }

  if (titleLower.includes(q)) {
    const score = 0.75 + 0.25 * Math.min(1, q.length / Math.max(1, titleLower.length));
    return { task, score, matchedBy: 'substring', ticketNumber: ticket };
  }

  const astar = aStarTextSearch(q, [{ id: task.id, title }])[0]?.score ?? 0;

  let bestWord = 0;
  for (const word of titleLower.split(/\s+/)) {
    if (!word) continue;
    if (word.startsWith(q)) {
      bestWord = Math.max(bestWord, 0.7 + 0.3 * Math.min(1, q.length / word.length));
    } else {
      bestWord = Math.max(bestWord, similarityRatio(q, word));
    }
  }

  const titleSimilarity = similarityRatio(q, titleLower) * 0.9;
  const fuzzy = Math.max(astar, bestWord, titleSimilarity);

  if (fuzzy <= 0) return null;

  const matchedBy: MatchKind = astar >= Math.max(bestWord, titleSimilarity) ? 'prefix' : 'fuzzy';

  return {
    task,
    score: Math.min(0.999, fuzzy),
    matchedBy,
    ticketNumber: ticket,
  };
}

export function rankTasks(
  tasks: TaskRecord[],
  query: string,
  options: { minScore?: number; limit?: number } = {},
): { scored: ScoredTask[]; matched: number } {
  const minScore = options.minScore ?? 0.55;
  const limit = Math.max(1, Math.min(options.limit ?? 10, 50));
  const ticketQuery = looksLikeTicket(query);

  const scored = tasks
    .map((task) => scoreTask(query, task))
    .filter((entry): entry is ScoredTask => entry !== null && entry.score >= minScore)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ap = typeof a.task.priority === 'number' ? a.task.priority : Number.POSITIVE_INFINITY;
      const bp = typeof b.task.priority === 'number' ? b.task.priority : Number.POSITIVE_INFINITY;
      if (ap !== bp) return ap - bp;
      return (a.task.title ?? '').localeCompare(b.task.title ?? '');
    });

  // A ticket query should not be diluted by fuzzy title matches when the
  // ticket itself exists. Fall back to fuzzy only when no ticket matches.
  const exactTickets = ticketQuery
    ? scored.filter((entry) => entry.matchedBy === 'ticket' || entry.matchedBy === 'id')
    : [];
  const ranked = exactTickets.length > 0 ? exactTickets : scored;

  return { scored: ranked.slice(0, limit), matched: ranked.length };
}
