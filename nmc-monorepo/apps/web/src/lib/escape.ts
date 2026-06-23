// HTML-escape utility for safely rendering user-supplied strings inside
// innerHTML blocks (used by the ticket preview, tooltip rows, etc.).

const MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

export function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) return '';
  return String(input).replace(/[&<>"'`]/g, (c) => MAP[c] ?? c);
}

export function escapeAttr(input: unknown): string {
  return escapeHtml(input);
}
