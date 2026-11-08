import type * as THREE from 'three';
import {
  GRENADE_DEFINITIONS,
  LETHAL_GRENADE_LOADOUT,
  STARTING_LETHAL_GRENADE,
  type GrenadeDefinition,
} from '../../config/grenades';
import { t } from '../../i18n/i18n';
import type { CoopPlayerId } from '../../network/Protocol';
import { LETHAL_INPUT_CODES } from '../../player/Input';
import { CameraShake } from '../../rendering/CameraShake';
import { grenadeBuyPrompt } from '../../ui/InteractionPrompts';
import type { MeleeArmDriver } from '../../weapons/ViewArms';
import type { GrenadeLaunch } from '../../zombies/grenades/ThrownGrenades';
import type { ArenaGrenadeBuy } from '../../zombies/maps/ZombieArena';
import type { ModeContext } from '../GameMode';
import { GrenadeBlasts } from '../grenades/GrenadeBlasts';
import { GrenadeHand } from '../grenades/GrenadeHand';
import type { CoopWorld } from './CoopWorld';

/**
 * Grenades as both co-op roles see them: the local player's hand (pouch,
 * throw, cooking), every grenade in the shared world, whoever threw it, and
 * the shake of nearby blasts. A local throw goes into the world at once and
 * to the peer through `send`; the peer's throws arrive through `replay`.
 * What a blast does is the host's (`blasts.onDetonate`); the guest only
 * watches.
 */
export class CoopGrenades {
  public readonly definition: GrenadeDefinition = GRENADE_DEFINITIONS[STARTING_LETHAL_GRENADE];
  public readonly hand: GrenadeHand;
  public readonly blasts: GrenadeBlasts<CoopPlayerId>;
  private readonly shake = new CameraShake();

  public constructor(
    private readonly ctx: ModeContext,
    private readonly world: CoopWorld,
    self: CoopPlayerId,
    send: (launch: GrenadeLaunch) => void,
  ) {
    const colliders = (): ReadonlyArray<THREE.Object3D> => world.arena.colliders;
    this.blasts = new GrenadeBlasts<CoopPlayerId>(ctx, colliders, (amount) => this.shake.add(amount));
    this.hand = new GrenadeHand(ctx, this.definition, LETHAL_GRENADE_LOADOUT, () => world.floorHeight(ctx.player.floor));
    this.hand.onLaunch = (launch) => {
      this.blasts.launch(this.definition, launch, self);
      send(launch);
    };
  }

  public get armDriver(): MeleeArmDriver | null {
    return this.hand.armDriver;
  }

  public get isThrowing(): boolean {
    return this.hand.isThrowing;
  }

  /** `inputEnabled` false (downed, paused, a menu) puts a grenade in the hand back in the pouch. */
  public update(dt: number, inputEnabled: boolean): void {
    if (!inputEnabled && this.hand.isThrowing) this.hand.cancel();
    this.hand.update(dt, LETHAL_INPUT_CODES.some((code) => this.ctx.input.isDown(code)));
    this.blasts.update(dt);
    this.shake.update(dt, this.ctx.player.camera);
  }

  /** The peer's throw, replayed in this world. */
  public replay(launch: GrenadeLaunch, owner: CoopPlayerId): void {
    this.blasts.launch(this.definition, launch, owner);
  }

  /** The grenade wall the local player faces, if any. */
  public facingBuy(): ArenaGrenadeBuy | null {
    return this.world.findFacingGrenadeBuy();
  }

  public buyPrompt(buy: ArenaGrenadeBuy): string {
    return grenadeBuyPrompt(t(this.definition.nameKey), buy.cost, this.ctx.profile.useTouchControls);
  }

  public syncTopology(): void {
    this.blasts.syncTopology();
  }

  /** New match: the starting pouch, nothing live, no scorch. */
  public reset(): void {
    this.hand.reset();
    this.blasts.reset();
    this.shake.reset();
  }

  public exit(): void {
    this.hand.clearHud();
  }
}
