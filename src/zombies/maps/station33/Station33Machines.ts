import type { LockerLook } from '../shared/LockerBank';
import type { PowerLeverLook } from '../shared/PowerLever';
import type { RingLockerLook } from '../shared/RingLocker';
import type { WeaponStationLook } from '../shared/WeaponStation';
import { CONSIGNA_LOCKER, STATION33_MAINS } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import type { SignId } from './Station33Signage';

/**
 * How Station 33 dresses the shared machine pieces: grey steel lockers with
 * green enamel doors and Cyrillic number tags, ring lockers that blaze on
 * the mains, and knife switches under their danger plates (the main switch,
 * Protocol 33's auxiliary systems). Every room builds its banks, ring
 * lockers and switches from these looks.
 */
export function station33LockerLook(context: Station33BuildContext): LockerLook {
  return { size: CONSIGNA_LOCKER, materials: context.materials, tags: context.signage };
}

export function station33RingLockerLook(context: Station33BuildContext): RingLockerLook {
  return { size: CONSIGNA_LOCKER, materials: context.materials, mainsGlowBoost: STATION33_MAINS.machineGlowBoost };
}

/** The decontamination cabinet: lockers' steel, its ochre plate and the red of the core crystals. */
export function station33WeaponStationLook(context: Station33BuildContext): WeaponStationLook {
  const { materials, signage } = context;
  return {
    materials,
    plate: { geometry: signage.signGeometry('decontamination', 0.7, 0.35), material: signage.material },
    glowColor: 0xff2416,
    spares: 3,
    mainsGlowBoost: STATION33_MAINS.machineGlowBoost,
  };
}

export function station33PowerLeverLook(context: Station33BuildContext, plate: SignId = 'main-switch'): PowerLeverLook {
  const { materials, signage } = context;
  return { materials, plate: { geometry: signage.signGeometry(plate, 0.7, 0.35), material: signage.material } };
}
