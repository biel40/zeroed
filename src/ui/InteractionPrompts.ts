import { isTranslationKey, t } from '../i18n/i18n';
import type { PointDoor } from '../zombies/doors/PointDoor';
import type { TranslationKey } from '../i18n/i18n';
import type { ArenaWeaponPickup } from '../zombies/maps/ZombieArena';
import { getControllerFamily, getInputDevice } from '../player/InputPresentation';
import { gamepadButtonLabel } from '../player/GamepadBindings';

export function weaponCaseLocked(pickup: ArenaWeaponPickup, kills: number): boolean {
  return kills < (pickup.requiredKills ?? 0);
}

export function weaponCasePrompt(pickup: ArenaWeaponPickup, kills: number, touch: boolean): string {
  if (pickup.codeLock?.locked) return t('prompt.codeChest', { key: actionKey(touch) });
  return weaponCaseLocked(pickup, kills)
    ? t('prompt.weaponCaseLocked', { label: pickup.interactionLabel, kills, required: pickup.requiredKills ?? 0 })
    : t('prompt.pickup', { label: pickup.interactionLabel, key: actionKey(touch) });
}

/** Device-specific action hint used inside interaction prompts ("Press E", "Hold USE"). */
export function actionKey(touch: boolean, hold = false): string {
  const device = getInputDevice(touch ? 'touch' : 'keyboard');
  if (device === 'gamepad') return t(hold ? 'prompt.gamepadHold' : 'prompt.gamepadPress',
    { button: gamepadButtonLabel('interact', getControllerFamily()) });
  touch = device === 'touch';
  if (hold) return t(touch ? 'prompt.holdTouch' : 'prompt.hold');
  return t(touch ? 'prompt.pressTouch' : 'prompt.press');
}

export function doorPrompt(door: PointDoor, touch: boolean): string {
  if (door.prompt) return t('prompt.doorAction', { action: t(door.prompt), key: actionKey(touch), cost: door.cost });
  const nameKey = `door.${door.id}`;
  const name = isTranslationKey(nameKey) ? t(nameKey) : door.id.toUpperCase().replace(/-/g, ' ');
  return t('prompt.unlockDoor', { door: name, key: actionKey(touch), cost: door.cost });
}

export function wallBuyPrompt(weapon: string, owned: boolean, wallBuy: { readonly price: number; readonly ammoPrice: number },
  touch: boolean, ammoPromptKey: TranslationKey = 'prompt.weaponAmmo'): string {
  const key = actionKey(touch);
  return owned
    ? t(ammoPromptKey, { key, weapon, cost: wallBuy.ammoPrice })
    : t('prompt.buyWeapon', { key, weapon, cost: wallBuy.price });
}
