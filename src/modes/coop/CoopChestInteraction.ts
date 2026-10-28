import { CodeLockDialog } from '../../ui/CodeLockDialog';
import type { ArenaWeaponPickup } from '../../zombies/maps/ZombieArena';
import type { ModeContext } from '../GameMode';

/** Local keypad; the host validates the submitted code before sharing the unlock. */
export class CoopChestInteraction {
  private dialog: CodeLockDialog | null = null;

  public get active(): boolean { return this.dialog !== null; }

  public open(ctx: ModeContext, pickup: ArenaWeaponPickup, submit: (code: string) => void): boolean {
    const lock = pickup.codeLock;
    if (!lock?.locked) return false;
    ctx.input.releaseAll();
    ctx.hud.setInteractionPrompt(null);
    this.dialog = new CodeLockDialog((code) => {
      if (!lock.acceptsCode(code)) return false;
      submit(code);
      return true;
    }, () => {
      this.dialog = null;
      ctx.input.releaseAll();
      ctx.lockPointer();
    });
    ctx.unlockPointer();
    return true;
  }

  public dispose(): void {
    this.dialog?.dispose();
    this.dialog = null;
  }
}
