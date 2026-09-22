export function routeUrl(path = ""): string {
  const normalizedPath = path.replace(/^\/+/, "");
  return `${import.meta.env.BASE_URL}${normalizedPath}`;
}

export function assetUrl(path: string): string {
  return routeUrl(path);
}
