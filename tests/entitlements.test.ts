import { describe, expect, it } from 'vitest';
import { PRODUCT_IDS, type ProductId } from '../src/config/products';
import { canAccessZombieMap, getZombieMapProduct, isZombieMapReleased, ZOMBIE_MAPS } from '../src/config/zombieMaps';
import type { EntitlementProvider } from '../src/entitlements/EntitlementProvider';

function owning(...products: ProductId[]): EntitlementProvider {
  return { owns: (product: ProductId): boolean => products.includes(product) };
}

describe('map entitlements', () => {
  it('sells each premium map as its own product and keeps Burned Mansion free', () => {
    expect(getZombieMapProduct('station-33')).toBe('map.station-33');
    expect(getZombieMapProduct('die-kathedrale')).toBe('map.die-kathedrale');
    expect(getZombieMapProduct('burned-mansion')).toBeUndefined();
    expect(PRODUCT_IDS).toContain('map.station-33');
    expect(PRODUCT_IDS).toContain('map.die-kathedrale');
  });

  it('opens free maps without any product and premium maps only with theirs', () => {
    expect(canAccessZombieMap('burned-mansion', owning(), false)).toBe(true);
    expect(canAccessZombieMap('station-33', owning(), false)).toBe(false);
    expect(canAccessZombieMap('station-33', owning('map.station-33'), false)).toBe(true);
    expect(canAccessZombieMap('die-kathedrale', owning(), true)).toBe(false);
    expect(canAccessZombieMap('die-kathedrale', owning('map.die-kathedrale'), true)).toBe(true);
  });

  it('keeps the two premium map entitlements independent', () => {
    expect(canAccessZombieMap('die-kathedrale', owning('map.station-33'), true)).toBe(false);
    expect(canAccessZombieMap('station-33', owning('map.die-kathedrale'), false)).toBe(false);
  });

  it('rejects unknown map ids whatever the player owns', () => {
    expect(canAccessZombieMap('unknown', owning(...PRODUCT_IDS), true)).toBe(false);
    expect(canAccessZombieMap(null, owning(...PRODUCT_IDS), true)).toBe(false);
  });

  it('references only declared products from the map registry', () => {
    for (const id of Object.keys(ZOMBIE_MAPS) as (keyof typeof ZOMBIE_MAPS)[]) {
      const product = getZombieMapProduct(id);
      if (product !== undefined) expect(PRODUCT_IDS).toContain(product);
    }
  });

  it('keeps Die Kathedrale locked as a work in progress unless the build opts in to WIP maps', () => {
    expect(isZombieMapReleased('die-kathedrale', false)).toBe(false);
    expect(isZombieMapReleased('die-kathedrale', true)).toBe(true);
    // Owning the product never bypasses the WIP lock.
    expect(canAccessZombieMap('die-kathedrale', owning(...PRODUCT_IDS), false)).toBe(false);
    expect(canAccessZombieMap('die-kathedrale', owning(...PRODUCT_IDS), true)).toBe(true);
  });

  it('leaves every other map released and ruled only by its product', () => {
    for (const id of Object.keys(ZOMBIE_MAPS) as (keyof typeof ZOMBIE_MAPS)[]) {
      if (id === 'die-kathedrale') continue;
      expect(isZombieMapReleased(id, false)).toBe(true);
      expect(canAccessZombieMap(id, owning(...PRODUCT_IDS), false)).toBe(true);
    }
  });
});
