import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { Weapon } from '../src/weapons/Weapon';

const ak = WEAPON_DEFINITIONS.ak47;
const RESERVE = 120;

function weapon(reserve = RESERVE): Weapon {
  return new Weapon(ak, () => 0.5, reserve);
}

/** Fires `shots` rounds on a fresh, ready weapon. */
function spend(target: Weapon, shots: number): void {
  for (let shot = 0; shot < shots; shot++) {
    target.update(target.shotInterval + 1e-6, { trigger: true, ads: false });
    target.update(target.shotInterval + 1e-6, { trigger: false, ads: false });
  }
  target.clearEvents();
}

function finishReload(target: Weapon): void {
  expect(target.reload()).toBe(true);
  target.update(ak.reloadTime + ak.tacticalReloadTime, { trigger: false, ads: false });
  target.clearEvents();
}

describe('Weapon capacity scale (a forged weapon carries more)', () => {
  it('starts at the definition capacity', () => {
    const plain = weapon();
    expect(plain.magazineCapacity).toBe(ak.magazineSize);
    expect(plain.reserveCapacity).toBe(RESERVE);
    expect(new Weapon(ak, () => 0.5, undefined).reserveCapacity).toBeNull();
  });

  it('doubles magazine and reserve capacity and keeps a full weapon full', () => {
    const forged = weapon();
    forged.setCapacityScale(2);
    expect(forged.magazineCapacity).toBe(ak.magazineSize * 2);
    expect(forged.reserveCapacity).toBe(RESERVE * 2);
    expect(forged.ammoInMagazine).toBe(ak.magazineSize * 2);
    expect(forged.reserveAmmo).toBe(RESERVE * 2);
    expect(forged.isAmmoFull).toBe(true);
  });

  it('scales a partial magazine and a low reserve by their share, never past the new limits', () => {
    const forged = weapon(7);
    spend(forged, 10);
    expect(forged.ammoInMagazine).toBe(ak.magazineSize - 10);
    forged.setCapacityScale(2);
    expect(forged.ammoInMagazine).toBe((ak.magazineSize - 10) * 2);
    expect(forged.reserveAmmo).toBe(14);
    expect(forged.ammoInMagazine).toBeLessThanOrEqual(forged.magazineCapacity);
    expect(forged.isAmmoFull).toBe(false);
  });

  it('rounds a share down, so a change never creates rounds and never goes negative', () => {
    const odd = weapon(5);
    odd.reserveAmmo = 3;
    odd.setCapacityScale(1.5);
    expect(odd.reserveCapacity).toBe(8);
    expect(odd.reserveAmmo).toBe(4);
    odd.setCapacityScale(1);
    expect(odd.reserveAmmo).toBe(2);
    const empty = weapon(0);
    spend(empty, ak.magazineSize);
    empty.setCapacityScale(2);
    expect(empty.ammoInMagazine).toBe(0);
    expect(empty.reserveAmmo).toBe(0);
  });

  it('reloads, refills and restores its reserve up to the forged capacity', () => {
    const forged = weapon();
    forged.setCapacityScale(2);
    spend(forged, 10);
    finishReload(forged);
    expect(forged.ammoInMagazine).toBe(ak.magazineSize * 2);
    expect(forged.reserveAmmo).toBe(RESERVE * 2 - 10);

    expect(forged.refillAmmo()).toBe(true);
    expect(forged.ammoInMagazine).toBe(ak.magazineSize * 2);
    expect(forged.reserveAmmo).toBe(RESERVE * 2);
    expect(forged.refillAmmo()).toBe(false);

    forged.reserveAmmo = 0;
    expect(forged.restoreReserveShare(0.1)).toBe(true);
    expect(forged.reserveAmmo).toBe(Math.round(RESERVE * 2 * 0.1));
  });

  it('applies to a reload already running: it completes into the forged magazine', () => {
    const forged = weapon();
    spend(forged, 4);
    expect(forged.reload()).toBe(true);
    forged.setCapacityScale(2);
    forged.update(ak.reloadTime + ak.tacticalReloadTime, { trigger: false, ads: false });
    expect(forged.ammoInMagazine).toBe(ak.magazineSize * 2);
    expect(forged.ammoInMagazine + (forged.reserveAmmo ?? 0)).toBe(ak.magazineSize * 2 - 8 + RESERVE * 2);
  });

  it('survives a fresh pick-up (resetAmmo) and only a scale of 1 restores the definition', () => {
    const forged = weapon();
    forged.setCapacityScale(2);
    spend(forged, 3);
    forged.resetAmmo();
    expect(forged.ammoInMagazine).toBe(ak.magazineSize * 2);
    expect(forged.reserveAmmo).toBe(RESERVE * 2);
    forged.setCapacityScale(1);
    forged.resetAmmo();
    expect(forged.ammoInMagazine).toBe(ak.magazineSize);
    expect(forged.reserveAmmo).toBe(RESERVE);
  });

  it('keeps a bottomless reserve bottomless', () => {
    const pinned = weapon();
    pinned.setInfiniteReserve();
    pinned.setCapacityScale(2);
    expect(pinned.reserveAmmo).toBeNull();
    expect(pinned.ammoInMagazine).toBe(ak.magazineSize * 2);
  });

  it('rejects a scale that is not positive', () => {
    expect(() => weapon().setCapacityScale(0)).toThrow();
    expect(() => weapon().setCapacityScale(Number.NaN)).toThrow();
  });
});
