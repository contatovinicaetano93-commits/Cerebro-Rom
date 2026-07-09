/** Utilitário puro — seguro para Client Components. */
export function sanitizeRedirectPath(next: string | null | undefined, fallback = '/') {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback
  if (next.includes('://') || next.includes('\\')) return fallback
  return next
}
