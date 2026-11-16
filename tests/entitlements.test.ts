import { describe, expect, it } from 'vitest';
import { PRODUCT_IDS, type ProductId } from '../src/config/products';
import { canAccessZombieMap, getZombieMapProduct, ZOMBIE_MAPS } from '../src/config/zombieMaps';
import type { EntitlementProvider } from '../src/entitlements/EntitlementProvider';

function owning(...products: ProductId[]): EntitlementProvider {
  return { owns: (product: ProductId): boolean => products.includes(product) };
}

describe('map entitlements', () => {
  it('sells each premium map as its own product and keeps Burned Mansion free', () => {
    expect(getZombieMapProduct('station-33')).toBe('map.station-33');
    expect(getZombieMapProduct('la-seu')).toBe('map.die-kathedrale');
    expect(getZombieMapProduct('burned-mansion')).toBeUndefined();
    expect(PRODUCT_IDS).toContain('map.station-33');
    expect(PRODUCT_IDS).toContain('map.die-kathedrale');
  });

  it('opens free maps without any product and premium maps only with theirs', () => {
    expect(canAccessZombieMap('burned-mansion', owning())).toBe(true);
    expect(canAccessZombieMap('station-33', owning())).toBe(false);
    expect(canAccessZombieMap('station-33', owning('map.station-33'))).toBe(true);
    expect(canAccessZombieMap('la-seu', owning())).toBe(false);
    expect(canAccessZombieMap('la-seu', owning('map.die-kathedrale'))).toBe(true);
  });

  it('keeps the two premium map entitlements independent', () => {
    expect(canAccessZombieMap('la-seu', owning('map.station-33'))).toBe(false);
    expect(canAccessZombieMap('station-33', owning('map.die-kathedrale'))).toBe(false);
  });

  it('rejects unknown map ids whatever the player owns', () => {
    expect(canAccessZombieMap('unknown', owning(...PRODUCT_IDS))).toBe(false);
    expect(canAccessZombieMap(null, owning(...PRODUCT_IDS))).toBe(false);
  });

  it('references only declared products from the map registry', () => {
    for (const id of Object.keys(ZOMBIE_MAPS) as (keyof typeof ZOMBIE_MAPS)[]) {
      const product = getZombieMapProduct(id);
      if (product !== undefined) expect(PRODUCT_IDS).toContain(product);
    }
  });
});
