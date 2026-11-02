import { Color, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { burnAt, charColor, isSeveredBone } from '../src/zombies/skins/ZombieSkinDamage';

/** Body-frame sample points over a standing walker: 0.4 m wide, 1.8 m tall. */
function bodySamples(): Vector3[] {
  const points: Vector3[] = [];
  for (let x = -0.2; x <= 0.2; x += 0.05) {
    for (let y = 0; y <= 1.8; y += 0.05) {
      for (let z = -0.12; z <= 0.12; z += 0.06) points.push(new Vector3(x, y, z));
    }
  }
  return points;
}

describe('skin burns', () => {
  const samples = bodySamples();
  const share = (coverage: number, seed: number): number =>
    samples.filter((point) => burnAt(point, { coverage, seed }) > 0.5).length / samples.length;

  it('is deterministic and stays within 0..1', () => {
    const burns = { coverage: 0.4, seed: 7 };
    for (const point of samples) {
      const burn = burnAt(point, burns);
      expect(burn).toBeGreaterThanOrEqual(0);
      expect(burn).toBeLessThanOrEqual(1);
      expect(burnAt(point.clone(), burns)).toBe(burn);
    }
  });

  it('chars a larger part of the body as coverage grows, in patches rather than everywhere', () => {
    const light = share(0.3, 11);
    const heavy = share(0.55, 11);
    expect(light).toBeGreaterThan(0.03);
    expect(heavy).toBeGreaterThan(light);
    expect(heavy).toBeLessThan(0.9);
    expect(share(0, 11)).toBe(0);
  });

  it('lays the patches out differently per seed', () => {
    const differs = samples.some((point) => burnAt(point, { coverage: 0.4, seed: 1 }) !== burnAt(point, { coverage: 0.4, seed: 2 }));
    expect(differs).toBe(true);
  });

  it('scorches before charring to near black', () => {
    const cloth = new Color(0x8a7d55);
    expect(charColor(cloth.clone(), 0).equals(cloth)).toBe(true);
    const scorched = charColor(cloth.clone(), 0.5);
    const charred = charColor(cloth.clone(), 1);
    expect(scorched.getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(cloth.getHSL({ h: 0, s: 0, l: 0 }).l);
    expect(charred.getHex()).toBe(0x120e0c);
  });
});

describe('severed limbs', () => {
  it('cuts the forearm and hand of its own side only', () => {
    expect(isSeveredBone('LeftForeArm', ['leftForearm'])).toBe(true);
    expect(isSeveredBone('LeftHandIndex2', ['leftForearm'])).toBe(true);
    expect(isSeveredBone('LeftArm', ['leftForearm'])).toBe(false);
    expect(isSeveredBone('RightForeArm', ['leftForearm'])).toBe(false);
    expect(isSeveredBone('RightHand', ['rightForearm'])).toBe(true);
    expect(isSeveredBone('LeftHand', [])).toBe(false);
  });
});
