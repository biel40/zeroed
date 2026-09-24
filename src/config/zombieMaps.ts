export interface ZombieMapDefinition {
  readonly id: string;
  readonly visible: boolean;
}

/** Supported arenas are independent from which ones the public menu exposes. */
export const ZOMBIE_MAPS = {
  'burned-mansion': {
    id: 'burned-mansion',
    visible: true,
  },
} as const satisfies Record<string, ZombieMapDefinition>;

export type ZombieMapId = keyof typeof ZOMBIE_MAPS;

export function isZombieMapId(value: string | null | undefined): value is ZombieMapId {
  return value != null && Object.hasOwn(ZOMBIE_MAPS, value);
}

export function getZombieMapDefinition(
  value: string | undefined,
): (typeof ZOMBIE_MAPS)[ZombieMapId] | undefined {
  return isZombieMapId(value) ? ZOMBIE_MAPS[value] : undefined;
}
