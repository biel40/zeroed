import type { ProductId } from '../config/products';

const CATHEDRAL_PREVIEW_EMAILS: ReadonlySet<string> = new Set([
  'bielet40@gmail.com',
  'biel40aws@gmail.com',
]);

/** Used by the account API and the development-only local backend. */
export function getDeveloperMapPreviews(normalizedEmail: string): ProductId[] {
  return CATHEDRAL_PREVIEW_EMAILS.has(normalizedEmail) ? ['map.die-kathedrale'] : [];
}
