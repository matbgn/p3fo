const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '');

export function assetUrl(path: string): string {
  if (!path.startsWith('/')) path = `/${path}`;
  return `${baseUrl}${path}`;
}