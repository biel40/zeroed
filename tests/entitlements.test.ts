import { describe, expect, it } from 'vitest';
import { PRODUCT_IDS, type ProductId } from '../src/config/products';
import { canAccessZombieMap, getZombieMapProduct, ZOMBIE_MAPS } from '../src/config/zombieMaps';
import { BetaEntitlementProvider } from '../src/entitlements/BetaEntitlementProvider';
import type { EntitlementProvider } from '../src/entitlements/EntitlementProvider';

function owning(...products: ProductId[]): EntitlementProvider {
  return { owns: (product: ProductId): boolean => products.includes(product) };
}

describe('map entitlements', () => {
  it('sells Station 33 as its own product and keeps Burned Mansion free', () => {
    expect(getZombieMapProduct('station-33')).toBe('map.station-33');
    expect(getZombieMapProduct('burned-mansion')).toBeUndefined();
    expect(PRODUCT_IDS).toContain('map.station-33');
  });

  it('opens free maps without any product and premium maps only with theirs', () => {
    expect(canAccessZombieMap('burned-mansion', owning())).toBe(true);
    expect(canAccessZombieMap('station-33', owning())).toBe(false);
    expect(canAccessZombieMap('station-33', owning('map.station-33'))).toBe(true);
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

  it('grants every premium product to closed-beta testers and none to other players', () => {
    let tester = false;
    const entitlements = new BetaEntitlementProvider({ hasBetaAccess: () => tester });
    for (const product of PRODUCT_IDS) expect(entitlements.owns(product)).toBe(false);
    // Read live, so a tester unlocking from the menu owns the products immediately.
    tester = true;
    for (const product of PRODUCT_IDS) expect(entitlements.owns(product)).toBe(true);
  });
});
