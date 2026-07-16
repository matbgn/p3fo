let cachedWipLimit = 5;

export function setWipLimit(limit: number): void {
  cachedWipLimit = limit;
}

export function getWipLimit(): number {
  return cachedWipLimit;
}