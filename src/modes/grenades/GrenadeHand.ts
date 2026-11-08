import * as THREE from 'three';
import type { GrenadeDefinition, LethalGrenadeLoadout } from '../../config/grenades';
import { LethalGrenadeStock } from '../../game/LethalGrenadeStock';
import { GrenadeThrow } from '../../weapons/GrenadeThrow';
import type { MeleeArmDriver } from '../../weapons/ViewArms';
import type { GrenadeLaunch } from '../../zombies/grenades/ThrownGrenades';
import type { ModeContext } from '../GameMode';

/** Where the grenade leaves the hand, from the eye: ahead, to the right and a little low. */
const RELEASE_AHEAD = 0.35;
const RELEASE_RIGHT = 0.14;
const RELEASE_DOWN = 0.08;

/**
 * The local player's lethal grenades: the pouch, the throw that borrows
 * the right arm and the cooking. The fuse starts when the pin comes out;
 * holding the lethal button keeps the arm cocked while it burns, letting
 * go throws it with what is left, and a grenade held too long goes off in
 * the hand. Every throw is handed to `onLaunch` as plain numbers, so single
 * player and both co-op roles put it into their world the same way.
 */
export class GrenadeHand {
  /** A grenade left the hand (or went off in it: zero fuse, no throw). */
  public onLaunch: ((launch: GrenadeLaunch) => void) | null = null;

  private readonly stock: LethalGrenadeStock;
  private readonly view = new GrenadeThrow();
  private readonly eye = new THREE.Vector3();
  private readonly aim = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly origin = new THREE.Vector3();
  /** Seconds since the pin came out of the grenade in the hand; null with none pulled. */
  private cooked: number | null = null;
  private ticks = 0;

  public constructor(
    private readonly ctx: ModeContext,
    public readonly definition: GrenadeDefinition,
    loadout: LethalGrenadeLoadout,
    /** Floor height under the player, where a dropped or thrown grenade comes to rest. */
    private readonly floorHeight: () => number,
  ) {
    this.stock = new LethalGrenadeStock(loadout);
    ctx.player.camera.add(this.view.root);
    this.view.onPinPulled = () => {
      this.cooked = 0;
      this.ticks = 0;
      ctx.audio.playGrenadePinPull();
    };
    this.view.onRelease = () => this.letGo();
    ctx.audio.preloadGrenadeAudio(definition.audio);
    this.pushHud();
  }

  /** The throw borrows the right arm while it plays. */
  public get armDriver(): MeleeArmDriver | null {
    return this.view.isThrowing ? this.view : null;
  }

  public get isThrowing(): boolean {
    return this.view.isThrowing;
  }

  public get count(): number {
    return this.stock.count;
  }

  public get isFull(): boolean {
    return this.stock.isFull;
  }

  /** Starts a throw when a grenade is left and the arm is free; it is spent when it leaves the hand. */
  public throw(): boolean {
    if (this.stock.count <= 0) return false;
    return this.view.start();
  }

  /** `held`: the lethal button is down, so a pulled grenade keeps cooking in the hand. */
  public update(dt: number, held: boolean): void {
    if (this.cooked !== null) {
      this.cooked += dt;
      // A tick for every second the fuse has burnt in the hand.
      while (this.ticks < Math.floor(this.cooked)) {
        this.ticks++;
        this.ctx.audio.playGrenadeCookTick();
      }
      if (this.cooked >= this.definition.fuseSeconds) {
        this.view.reset();
        this.launch(0);
        return;
      }
    }
    this.view.update(dt, this.ctx.player.speed01, held);
    // A plain tap only passes through the wind-up: the dial is for a held grenade.
    this.pushCookDial(held && this.view.isCooking && this.cooked !== null ? this.cooked : null);
  }

  /** A new round hands out its grenades. */
  public grantRound(): void {
    this.stock.grantRound();
    this.pushHud();
  }

  /** A purchase fills the pouch; false when it already was full. */
  public refill(): boolean {
    const refilled = this.stock.refill();
    this.pushHud();
    return refilled;
  }

  /** Gameplay stopped mid-throw: the grenade goes back in the pouch, pin and all. */
  public cancel(): void {
    this.view.reset();
    this.cooked = null;
    this.pushCookDial(null);
  }

  /** New run or respawn: the starting pouch and empty hands. */
  public reset(): void {
    this.cancel();
    this.stock.reset();
    this.pushHud();
  }

  /** Leaving the run: the HUD outlives it, so its grenade row goes. */
  public clearHud(): void {
    this.ctx.hud.setLethalGrenades(0, 0);
  }

  private letGo(): void {
    const cooked = this.cooked ?? 0;
    this.launch(Math.max(0, this.definition.fuseSeconds - cooked));
    this.ctx.audio.playGrenadeThrow();
  }

  /** Spends the grenade and hands its launch, from the eye along the aim, to `onLaunch`. */
  private launch(fuse: number): void {
    this.cooked = null;
    this.pushCookDial(null);
    if (!this.stock.consume()) return;
    const camera = this.ctx.player.camera;
    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(this.eye);
    camera.getWorldDirection(this.aim);
    this.right.set(-this.aim.z, 0, this.aim.x).normalize();
    this.origin.copy(this.eye).addScaledVector(this.aim, RELEASE_AHEAD).addScaledVector(this.right, RELEASE_RIGHT);
    this.origin.y -= RELEASE_DOWN;
    this.onLaunch?.({
      from: { x: this.eye.x, y: this.eye.y, z: this.eye.z },
      origin: { x: this.origin.x, y: this.origin.y, z: this.origin.z },
      aim: { x: this.aim.x, y: this.aim.y, z: this.aim.z },
      fuse,
      floorY: this.floorHeight(),
    });
    this.pushHud();
  }

  /** `cooked`: seconds the held grenade has burnt, or null when none is cooking. */
  private pushCookDial(cooked: number | null): void {
    const fuse = this.definition.fuseSeconds;
    this.ctx.hud.setGrenadeCook(cooked === null ? null : fuse - cooked, fuse);
  }

  private pushHud(): void {
    this.ctx.hud.setLethalGrenades(this.stock.count, this.stock.max);
  }
}
