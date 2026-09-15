export interface ZombieWalkMotion {
  readonly torsoPitch: number;
  readonly torsoRoll: number;
  readonly headPitch: number;
  readonly headRoll: number;
  readonly leftShoulderPitch: number;
  readonly rightShoulderPitch: number;
}

/** Upper-body offsets layered over authored locomotion; phase is one stride. */
export function sampleZombieWalkMotion(phase: number, weight: number): ZombieWalkMotion {
  const amount = Math.max(0, Math.min(1, weight));
  if (amount === 0) {
    return {
      torsoPitch: 0,
      torsoRoll: 0,
      headPitch: 0,
      headRoll: 0,
      leftShoulderPitch: 0,
      rightShoulderPitch: 0,
    };
  }
  const cycle = phase * Math.PI * 2;
  const step = Math.sin(cycle);
  const unevenStep = Math.sin(cycle * 2 + 0.45);

  return {
    torsoPitch: (0.055 + unevenStep * 0.012) * amount,
    torsoRoll: (step * 0.022 + unevenStep * 0.005) * amount,
    headPitch: (-0.03 + Math.sin(cycle + 0.7) * 0.014) * amount,
    headRoll: (-step * 0.015 + Math.sin(cycle + 1.1) * 0.006) * amount,
    leftShoulderPitch: (-0.06 - step * 0.025) * amount,
    rightShoulderPitch: (-0.2 + step * 0.03) * amount,
  };
}