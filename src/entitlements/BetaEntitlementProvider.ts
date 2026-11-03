import type { ProductId } from '../config/products';
import type { EntitlementProvider } from './EntitlementProvider';

export interface BetaAccessSource {
  hasBetaAccess(): boolean;
}

/**
 * Web provider while there is no account backend: closed-beta testers receive
 * every premium product, present and future, and other players none. Access
 * is read on every query so an unlock from the menu applies immediately.
 */
export class BetaEntitlementProvider implements EntitlementProvider {
  public constructor(private readonly access: BetaAccessSource) {}

  public owns(_product: ProductId): boolean {
    return this.access.hasBetaAccess();
  }
}
