/**
 * Purchasable content. Each platform maps these ids to its own store item
 * (a Stripe price on the web, a DLC app on Steam); purchases are not linked
 * across platforms.
 */
export const PRODUCT_IDS = ['map.station-33'] as const;

export type ProductId = (typeof PRODUCT_IDS)[number];

export function isProductId(value: unknown): value is ProductId {
  return PRODUCT_IDS.includes(value as ProductId);
}
