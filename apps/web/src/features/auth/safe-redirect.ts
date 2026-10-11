/** Only same-app relative paths are allowed as post-login destinations (no open redirects). */
export function safeRedirect(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  return next;
}
