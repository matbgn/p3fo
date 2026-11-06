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

export type MatchKind = 'reference' | 'id' | 'exact' | 'substring' | 'prefix' | 'fuzzy';

export interface ScoredTask {
  task: TaskRecord;
  score: number;
  matchedBy: MatchKind;
  referenceNumber: string | null;
}

// External references are deliberately purpose-agnostic: a prefixed or
// hash-marked number in the title ("REF-123456", "#123456") or a prefixed id
// ("ext-123456"). Bare 5+ digit numbers also count as references.
const REFERENCE_TITLE_PREFIXED_RE = /(?:#|[a-z][a-z0-9_-]*[#-])\s*(\d{4,})\b/gi;
const REFERENCE_TITLE_BARE_RE = /\b(\d{5,})\b/g;
const REFERENCE_ID_RE = /^[a-z][a-z0-9_-]*-(\d{4,})$/i;
const REFERENCE_QUERY_RE = /^(?:(?:[a-z][a-z0-9_-]*[#-]|#)\s*\d{4,}|\d{5,})$/i;
const REFERENCE_QUERY_PREFIX_RE = /^(?:[a-z][a-z0-9_-]*[#-]|#)\s*/i;

export function extractReferenceNumber(task: Pick<TaskRecord, 'id' | 'title'>): string | null {
  const title = task.title ?? '';
  const candidates: string[] = [];

  for (const match of title.matchAll(REFERENCE_TITLE_PREFIXED_RE)) candidates.push(match[1]);
  for (const match of title.matchAll(REFERENCE_TITLE_BARE_RE)) candidates.push(match[1]);

  const idMatch = REFERENCE_ID_RE.exec(task.id ?? '');
  if (idMatch) candidates.push(idMatch[1]);

  if (candidates.length === 0) return null;

  // Prefer the most specific (longest) number; ties keep title matches first.
  return candidates.sort((a, b) => b.length - a.length)[0];
}

export function looksLikeReference(query: string): boolean {
  // A bare 5+ digit query is treated as a reference number; 4-digit searches
  // (years, amounts) stay textual. A prefix (REF-, #, ext-) disambiguates
  // shorter reference numbers.
  return REFERENCE_QUERY_RE.test(query.trim());
}

function normalizeReferenceQuery(query: string): string | null {
  if (!looksLikeReference(query)) return null;
  return query.trim().replace(REFERENCE_QUERY_PREFIX_RE, '');
}

export interface ScoreTaskOptions {
  /** Allow reference-number queries to fall through to fuzzy title matching. Default true. */
  allowFuzzySearch?: boolean;
}

export function scoreTask(
  query: string,
  task: TaskRecord,
  options: ScoreTaskOptions = {},
): ScoredTask | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const title = (task.title ?? '').trim();
  const titleLower = title.toLowerCase();
  const reference = extractReferenceNumber(task);
  const referenceQuery = normalizeReferenceQuery(query);

  if (referenceQuery && reference === referenceQuery) {
    return { task, score: 1, matchedBy: 'reference', referenceNumber: reference };
  }

  if ((task.id ?? '').toLowerCase() === q) {
    return { task, score: 1, matchedBy: 'id', referenceNumber: reference };
  }

  if (titleLower === q) {
    return { task, score: 1, matchedBy: 'exact', referenceNumber: reference };
  }

  // Fuzzy matching is the default so search behaves like a normal ranked
  // search. Strict reference lookups pass `allowFuzzySearch: false` (the
  // `exact` mode) so an exact lookup cannot be fooled by a card whose title
  // merely resembles the number.
  const allowFuzzySearch = options.allowFuzzySearch ?? true;
  if (referenceQuery && !allowFuzzySearch) return null;

  // Fuzzy reference lookup: compare the numeric query against the card's
  // extracted reference number before falling back to title similarity. This
  // ranks a mistyped number (…201) above unrelated cards with vaguely similar
  // digits.
  const referenceSimilarity =
    referenceQuery && reference ? similarityRatio(referenceQuery, reference) : 0;

  if (titleLower.includes(q)) {
    const substringScore = 0.75 + 0.25 * Math.min(1, q.length / Math.max(1, titleLower.length));
    const score = Math.max(substringScore, referenceSimilarity);
    return {
      task,
      score,
      matchedBy: referenceSimilarity > substringScore ? 'fuzzy' : 'substring',
      referenceNumber: reference,
    };
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
  const fuzzy = Math.max(astar, bestWord, titleSimilarity, referenceSimilarity);

  if (fuzzy <= 0) return null;

  const matchedBy: MatchKind =
    referenceSimilarity >= Math.max(astar, bestWord, titleSimilarity)
      ? 'fuzzy'
      : astar >= Math.max(bestWord, titleSimilarity)
        ? 'prefix'
        : 'fuzzy';

  return {
    task,
    score: Math.min(0.999, fuzzy),
    matchedBy,
    referenceNumber: reference,
  };
}

export type SearchMode = 'exact' | 'fuzzy';

export function rankTasks(
  tasks: TaskRecord[],
  query: string,
  options: { minScore?: number; limit?: number; mode?: SearchMode } = {},
): { scored: ScoredTask[]; matched: number; referenceQuery: boolean; mode: SearchMode } {
  const minScore = options.minScore ?? 0.55;
  const limit = Math.max(1, Math.min(options.limit ?? 10, 50));
  const mode = options.mode ?? 'fuzzy';
  const referenceQuery = looksLikeReference(query);
  const allowFuzzySearch = mode === 'fuzzy';

  const scored = tasks
    .map((task) => scoreTask(query, task, { allowFuzzySearch }))
    .filter((entry): entry is ScoredTask => entry !== null && entry.score >= minScore)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;

      // For reference searches, prefer the numerically closest reference
      // before priority/title. This keeps a one-digit typo on the intended
      // card ahead of other equally-similar reference numbers.
      if (referenceQuery) {
        const queryNumber = Number(referenceQuery);
        const aReference = a.referenceNumber ? Number(a.referenceNumber) : Number.POSITIVE_INFINITY;
        const bReference = b.referenceNumber ? Number(b.referenceNumber) : Number.POSITIVE_INFINITY;
        const aDistance = Math.abs(queryNumber - aReference);
        const bDistance = Math.abs(queryNumber - bReference);
        if (aDistance !== bDistance) return aDistance - bDistance;
      }

      const ap = typeof a.task.priority === 'number' ? a.task.priority : Number.POSITIVE_INFINITY;
      const bp = typeof b.task.priority === 'number' ? b.task.priority : Number.POSITIVE_INFINITY;
      if (ap !== bp) return ap - bp;
      return (a.task.title ?? '').localeCompare(b.task.title ?? '');
    });

  // `exact` never returns substring/fuzzy hits. `fuzzy` returns everything,
  // with exact hits ranked first by score.
  const exactOnly = mode === 'exact';
  const ranked = exactOnly
    ? scored.filter((entry) => entry.matchedBy === 'reference' || entry.matchedBy === 'id' || entry.matchedBy === 'exact')
    : scored;

  return { scored: ranked.slice(0, limit), matched: ranked.length, referenceQuery, mode };
}
