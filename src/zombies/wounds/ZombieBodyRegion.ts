/** Coarse body area a bullet met, for cosmetic reactions only (damage keeps its head/torso hitboxes). */
export type ZombieBodyRegion = 'head' | 'torso' | 'arm' | 'leg';

/** Region plus body-local side: +1 is the zombie's left (+X), -1 its right, 0 the midline. */
export interface ZombieBodyLocation {
  region: ZombieBodyRegion;
  side: -1 | 0 | 1;
}

const HEAD_BONE = /head|neck/i;
const ARM_BONE = /shoulder|arm|hand|thumb|index|finger/i;
const LEG_BONE = /upleg|leg|foot|toe/i;

/** Classifies a humanoid rig bone by name (Mixamo-style `LeftForeArm`, `RightUpLeg`, ...). */
export function locateBone(name: string, out: ZombieBodyLocation): ZombieBodyLocation {
  out.side = /left/i.test(name) ? 1 : /right/i.test(name) ? -1 : 0;
  if (HEAD_BONE.test(name)) out.region = 'head';
  else if (LEG_BONE.test(name)) out.region = 'leg';
  else if (ARM_BONE.test(name)) out.region = 'arm';
  else out.region = 'torso';
  if (out.region === 'head' || out.region === 'torso') out.side = 0;
  return out;
}
