import { WEAPON_DEFINITIONS } from '../config/weapons';
import { RING_DEFINITIONS, type RingId } from './rings/RingCatalog';
import { t } from '../i18n/i18n';
import type { WeaponId } from '../weapons/WeaponTypes';

export interface DeveloperConsoleActions {
  equip(id: WeaponId): boolean;
  ring(id: RingId): boolean;
  refill(): boolean;
  infiniteAmmo(): void;
  equipped(): WeaponId;
  invincible(enabled: boolean): void;
}

/** Explicit commands only: never evaluates JavaScript or mutates shared weapon definitions. */
export class DeveloperConsoleCommands {
  private readonly damageScales = new Map<WeaponId, number>();

  damageScale(id: WeaponId): number { return this.damageScales.get(id) ?? 1; }

  reset(): void { this.damageScales.clear(); }

  execute(line: string, actions: DeveloperConsoleActions): string {
    const [command, ...args] = line.trim().toLowerCase().split(/\s+/);
    const [value] = args;
    switch (command) {
      case 'help':
        if (args.length) break;
        return t('dev.help');
      case 'weapons':
        if (args.length) break;
        return Object.values(WEAPON_DEFINITIONS).map(({ id, name }) => `${id}: ${name}`).join('\n');
      case 'rings':
        if (args.length) break;
        return Object.values(RING_DEFINITIONS).map(({ id, nameKey }) => `${id}: ${t(nameKey)}`).join('\n');
      case 'weapon': {
        const id = Object.keys(WEAPON_DEFINITIONS).find((id) => id.toLowerCase() === value) as WeaponId | undefined;
        if (args.length !== 1 || !id) break;
        return t(actions.equip(id) ? 'dev.ok' : 'dev.unavailable');
      }
      case 'ring':
      case 'drink': {
        const id = Object.keys(RING_DEFINITIONS).find((id) => id.toLowerCase() === value) as RingId | undefined;
        if (args.length !== 1 || !id) break;
        return t(actions.ring(id) ? 'dev.ok' : 'dev.unavailable');
      }
      case 'ammo':
        if (args.length !== 1 || (value !== 'full' && value !== 'infinite')) break;
        if (value === 'infinite') actions.infiniteAmmo();
        else actions.refill();
        return t('dev.ok');
      case 'damage': {
        const scale = Number(value);
        if (args.length !== 1 || !Number.isFinite(scale) || scale < 1 || scale > 100) break;
        const id = actions.equipped();
        this.damageScales.set(id, scale);
        return `${WEAPON_DEFINITIONS[id].name}: ×${scale}`;
      }
      case 'invincible':
        if (args.length !== 1 || (value !== 'on' && value !== 'off')) break;
        actions.invincible(value === 'on');
        return t('dev.ok');
    }
    return t('dev.invalid');
  }
}
