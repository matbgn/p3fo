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
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[bLen];
}

export function similarityRatio(a: string, b: string): number {
  const sa = (a || "").trim().toLowerCase();
  const sb = (b || "").trim().toLowerCase();
  if (sa.length === 0 && sb.length === 0) return 1;
  const maxLen = Math.max(sa.length, sb.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(sa, sb);
  return 1 - dist / maxLen;
}