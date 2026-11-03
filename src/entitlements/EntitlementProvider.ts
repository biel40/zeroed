import type { ProductId } from '../config/products';

/**
 * Answers which products the current player owns on this platform. Each
 * platform supplies its own implementation; callers read it synchronously,
 * so providers keep an up-to-date snapshot instead of querying on demand.
 */
export interface EntitlementProvider {
  owns(product: ProductId): boolean;
}
