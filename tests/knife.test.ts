import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { PlayerEconomy, POINTS_KNIFE_KILL } from '../src/game/PlayerEconomy';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import {
  KNIFE_ATTACK_DURATION,
  KNIFE_HIT_MOMENT,
  Knife,
  knifeDamageForRound,
} from '../src/weapons/Knife';

/** Knife mounted on the game camera rig, sampled at a given attack time. */
function knifeOnCamera(): { knife: Knife; camera: THREE.PerspectiveCamera } {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.08, 700);
  const knife = new Knife();
  camera.add(knife.root);
  knife.setEnabled(true);
  knife.trigger();
  return { knife, camera };
}

function sampleBlade(knife: Knife, camera: THREE.PerspectiveCamera, time: number) {
  knife.reset();
  knife.setEnabled(true);
  knife.trigger();
  knife.update(time, false, 0);
  camera.updateMatrixWorld(true);
  const blade = knife.root.getObjectByName('knife-blade')!;
  const hilt = blade.localToWorld(new THREE.Vector3(0, 0.02, -0.055));
  const tip = blade.localToWorld(new THREE.Vector3(0, 0.035, -0.5));
  const edge = new THREE.Vector3(0, -1, 0).applyQuaternion(blade.getWorldQuaternion(new THREE.Quaternion()));
  const hand = knife.root.getObjectByName('knife-hand')!.getWorldPosition(new THREE.Vector3());
  return { hilt, tip, edge, hand, hiltNdc: hilt.clone().project(camera), tipNdc: tip.clone().project(camera) };
}

describe('Knife', () => {
  it('keeps the attack cadence and resolves contact inside the slash phase', () => {
    expect(KNIFE_ATTACK_DURATION).toBe(0.72);
    expect(KNIFE_HIT_MOMENT).toBeGreaterThan(KNIFE_ATTACK_DURATION * 0.15);
    expect(KNIFE_HIT_MOMENT).toBeLessThan(KNIFE_ATTACK_DURATION * 0.4);
  });

  it('builds a large knife silhouette and only applies contact at the visible strike', () => {
    const knife = new Knife();
    const swing = vi.fn();
    const impact = vi.fn();
    knife.onSwing = swing;
    knife.onImpact = impact;
    knife.setEnabled(true);

    const blade = knife.root.getObjectByName('knife-blade')!;
    const geometry = (blade as THREE.Mesh).geometry;
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.getSize(new THREE.Vector3()).z).toBeGreaterThan(0.4);
    knife.update(KNIFE_HIT_MOMENT - 0.01, true, 0);
    expect(swing).toHaveBeenCalledTimes(1);
    expect(impact).not.toHaveBeenCalled();
    knife.update(0.01, true, 0);
    expect(impact).toHaveBeenCalledTimes(1);
    knife.update(KNIFE_ATTACK_DURATION, true, 0);
    expect(impact).toHaveBeenCalledTimes(1);
    knife.update(0, false, 0);
    knife.update(0, true, 0);
    expect(swing).toHaveBeenCalledTimes(2);
  });

  it('hides and cancels its swing when firearm ammunition becomes available', () => {
    const knife = new Knife();
    const impact = vi.fn();
    knife.onImpact = impact;
    knife.setEnabled(true);
    knife.update(0.1, true, 0);
    knife.setEnabled(false);
    knife.update(KNIFE_ATTACK_DURATION, true, 0);
    expect(knife.root.visible).toBe(false);
    expect(knife.isAttacking).toBe(false);
    expect(impact).not.toHaveBeenCalled();
  });

  it('fully clears the view even when reset interrupts an active stab', () => {
    const knife = new Knife();
    knife.setEnabled(true);
    knife.trigger();

    knife.reset();

    expect(knife.enabled).toBe(false);
    expect(knife.root.visible).toBe(false);
    expect(knife.isAttacking).toBe(false);
  });

  it('slashes edge-first across the crosshair from right to left', () => {
    const { knife, camera } = knifeOnCamera();
    const drawn = sampleBlade(knife, camera, KNIFE_ATTACK_DURATION * 0.15);
    const contact = sampleBlade(knife, camera, KNIFE_HIT_MOMENT);
    const cutEnd = sampleBlade(knife, camera, KNIFE_ATTACK_DURATION * 0.4);

    // Raised on the right before the cut, out to the lower left after it.
    expect(drawn.hiltNdc.x).toBeGreaterThan(0.3);
    expect(cutEnd.hiltNdc.x).toBeLessThan(0);
    expect(cutEnd.hiltNdc.y).toBeLessThan(drawn.hiltNdc.y);
    // At contact the blade spans the crosshair horizontally.
    expect(contact.hiltNdc.x).toBeGreaterThan(0);
    expect(contact.tipNdc.x).toBeLessThan(0);
    expect(Math.abs(contact.hiltNdc.y)).toBeLessThan(0.3);
    // The edge leads the leftward cut; the tip is not aimed at the crosshair.
    const justAfter = sampleBlade(knife, camera, KNIFE_HIT_MOMENT + 0.01);
    const cutDirection = justAfter.hilt.clone().add(justAfter.tip)
      .sub(contact.hilt).sub(contact.tip).normalize();
    expect(contact.edge.dot(cutDirection)).toBeGreaterThan(0.6);
    expect(contact.edge.x).toBeLessThan(-0.5);
    // A sideways cut, not a lunge: lateral travel dominates depth travel.
    const travel = cutEnd.hand.clone().sub(drawn.hand);
    expect(Math.abs(travel.x)).toBeGreaterThan(Math.abs(travel.z) * 3);
  });

  it('winds up against the cut and strikes at its fastest at contact', () => {
    const { knife, camera } = knifeOnCamera();
    // Before release the blade drifts back to the right, away from the cut.
    const raised = sampleBlade(knife, camera, KNIFE_ATTACK_DURATION * 0.13);
    const cocked = sampleBlade(knife, camera, KNIFE_ATTACK_DURATION * 0.175);
    expect(cocked.hiltNdc.x).toBeGreaterThan(raised.hiltNdc.x);

    const step = 1 / 240;
    const handSpeed = (time: number): number =>
      sampleBlade(knife, camera, time + step / 2).hand.distanceTo(sampleBlade(knife, camera, time - step / 2).hand) / step;
    let peak = 0;
    for (let time = KNIFE_ATTACK_DURATION * 0.2; time < KNIFE_ATTACK_DURATION * 0.5; time += step) {
      peak = Math.max(peak, handSpeed(time));
    }
    expect(handSpeed(KNIFE_HIT_MOMENT)).toBeGreaterThan(peak * 0.95);
    // The cut brakes hard once the blade is through.
    expect(handSpeed(KNIFE_ATTACK_DURATION * 0.4)).toBeLessThan(peak * 0.35);
  });

  it('recovers along a lower path and returns exactly to its resting pose', () => {
    const { knife, camera } = knifeOnCamera();
    const rest = sampleBlade(knife, camera, 0);
    const recovery = sampleBlade(knife, camera, KNIFE_ATTACK_DURATION * 0.78);
    const crossing = sampleBlade(knife, camera, KNIFE_HIT_MOMENT);
    expect(recovery.hand.y).toBeLessThan(crossing.hand.y - 0.3);

    const finished = sampleBlade(knife, camera, KNIFE_ATTACK_DURATION);
    expect(finished.hand.distanceTo(rest.hand)).toBeLessThan(1e-6);
    expect(finished.tip.distanceTo(rest.tip)).toBeLessThan(1e-6);
  });

  it('bends the elbow smoothly, without snapping or hyperextending', () => {
    const { knife, camera } = knifeOnCamera();
    const elbowAngle = (time: number): number => {
      sampleBlade(knife, camera, time);
      const axis = (name: string) => new THREE.Vector3(0, 0, -1)
        .applyQuaternion(knife.root.getObjectByName(name)!.getWorldQuaternion(new THREE.Quaternion()));
      return axis('knife-upper-arm').angleTo(axis('knife-forearm'));
    };
    for (let time = 0; time <= KNIFE_ATTACK_DURATION; time += 1 / 120) {
      const angle = elbowAngle(time);
      expect(angle).toBeGreaterThan(THREE.MathUtils.degToRad(15));
      expect(angle).toBeLessThan(THREE.MathUtils.degToRad(125));
    }
    // The contact frame is the fastest moment of the cut: the elbow must pass
    // through it with a continuous velocity instead of a visible kink.
    const step = 0.002;
    const before = (elbowAngle(KNIFE_HIT_MOMENT) - elbowAngle(KNIFE_HIT_MOMENT - step)) / step;
    const after = (elbowAngle(KNIFE_HIT_MOMENT + step) - elbowAngle(KNIFE_HIT_MOMENT)) / step;
    expect(Math.abs(before)).toBeGreaterThan(2);
    expect(Math.abs(after - before)).toBeLessThan(0.25);
  });

  it('keeps the knife locked in the fist through the whole attack', () => {
    const { knife, camera } = knifeOnCamera();
    const gripOffsets = [0.1, 0.3, 0.5, 0.8].map((fraction) => {
      const { hilt, hand } = sampleBlade(knife, camera, KNIFE_ATTACK_DURATION * fraction);
      const forearm = knife.root.getObjectByName('knife-forearm')!;
      return forearm.worldToLocal(hilt.clone()).distanceTo(forearm.worldToLocal(hand.clone()));
    });
    for (const offset of gripOffsets) expect(offset).toBeCloseTo(gripOffsets[0], 6);
  });

  it('asks for the firearm to dip before the hand enters and restores it by the end', () => {
    const knife = new Knife();
    expect(knife.firearmLowering).toBe(0);
    knife.setEnabled(true);
    knife.trigger();
    knife.update(KNIFE_ATTACK_DURATION * 0.1, false, 0);
    expect(knife.firearmLowering).toBe(1);
    knife.update(KNIFE_HIT_MOMENT, false, 0);
    expect(knife.firearmLowering).toBe(1);
    knife.update(KNIFE_ATTACK_DURATION, false, 0);
    expect(knife.firearmLowering).toBe(0);
  });
});

describe('Zombies knife lifecycle', () => {
  it('clears an interrupted knife view when gameplay ends', () => {
    const mode = new ZombiesMode() as any;
    mode.knife.setEnabled(true);
    mode.knife.trigger();
    mode.runFlow.beginEnding();
    mode.arena = { update: vi.fn() };
    mode.ctx = { hud: { showCredits: vi.fn() } };

    mode.update(0.016);

    expect(mode.knife.enabled).toBe(false);
    expect(mode.knife.root.visible).toBe(false);
    expect(mode.knife.isAttacking).toBe(false);
  });
});

describe('Zombies knife impact', () => {
  it('starts a dedicated knife attack while a firearm is still usable', () => {
    const mode = new ZombiesMode() as any;
    mode.ctx = {};
    mode.isGameplayInputEnabled = () => true;

    mode.onMeleeAttack();

    expect(mode.knife.isAttacking).toBe(true);
    expect(mode.usesFallbackAttack()).toBe(true);
    expect(mode.getFallbackWeaponName()).toBe('KNIFE');
  });

  it('keeps the firearm selected when every carried weapon is empty', () => {
    const mode = new ZombiesMode() as any;
    mode.ctx = {};
    mode.isGameplayInputEnabled = () => true;

    expect(mode.knife.isAttacking).toBe(false);
    expect(mode.usesFallbackAttack()).toBe(false);
    expect(mode.getFallbackWeaponName()).toBeNull();
  });

  it('tags an unobstructed knife kill and awards its exclusive 200 points', () => {
    const mode = new ZombiesMode() as any;
    const economy = new PlayerEconomy();
    mode.economy = economy;
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.7, 0);
    const zombie = { isAlive: true, floor: 0, maxHp: 150 };
    const hitbox = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshBasicMaterial());
    hitbox.position.set(0, 1.7, -1.2);
    hitbox.userData.zombie = zombie;
    const group = new THREE.Group();
    group.add(hitbox);
    const damageZombie = vi.fn((_zombie, _part, _damage, source) => {
      mode.onZombieKilled(false, undefined, undefined, source);
      return true;
    });
    mode.ctx = {
      player: { camera, floor: 0 },
      hitColliders: [hitbox],
      stats: { registerHit: vi.fn() },
      hud: { showHitmarker: vi.fn() },
      audio: { playKnifeHit: vi.fn(), playZombieDeath: vi.fn() },
      effects: { puff: vi.fn() },
    };
    mode.zombies = { group, damageZombie };
    mode.knife.setEnabled(true);
    mode.knife.trigger();

    mode.applyKnifeImpact();

    expect(damageZombie).toHaveBeenCalledWith(zombie, 'torso', 150, 'knife');
    expect(mode.ctx.audio.playKnifeHit).toHaveBeenCalledTimes(1);
    expect(economy.points).toBe(POINTS_KNIFE_KILL);
  });

  it.each([
    [1, 500],
    [2, 250],
    [5, 100],
  ])('scales knife damage for round %i', (round, expectedDamage) => {
    const mode = new ZombiesMode() as any;
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.7, 0);
    const zombie = { isAlive: true, floor: 0, maxHp: 500 };
    const hitbox = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshBasicMaterial());
    hitbox.position.set(0, 1.7, -1.2);
    hitbox.userData.zombie = zombie;
    const group = new THREE.Group();
    group.add(hitbox);
    const damageZombie = vi.fn();
    mode.rounds = { round };
    mode.ctx = {
      player: { camera, floor: 0 },
      hitColliders: [hitbox],
      stats: { registerHit: vi.fn() },
      hud: { showHitmarker: vi.fn() },
      audio: { playKnifeHit: vi.fn() },
      effects: { puff: vi.fn() },
    };
    mode.zombies = { group, damageZombie };
    mode.knife.setEnabled(true);
    mode.knife.trigger();

    mode.applyKnifeImpact();

    expect(damageZombie).toHaveBeenCalledWith(zombie, 'torso', expectedDamage, 'knife');
  });

  it('treats pre-round startup as round one', () => {
    expect(knifeDamageForRound(150, 0)).toBe(150);
  });

  it('cannot stab through arena geometry', () => {
    const mode = new ZombiesMode() as any;
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.7, 0);
    const zombie = { isAlive: true, floor: 0 };
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.1), new THREE.MeshBasicMaterial());
    wall.position.set(0, 1.7, -0.6);
    const hitbox = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshBasicMaterial());
    hitbox.position.set(0, 1.7, -1.2);
    hitbox.userData.zombie = zombie;
    const group = new THREE.Group();
    group.add(wall, hitbox);
    const damageZombie = vi.fn();
    mode.ctx = {
      player: { camera, floor: 0 },
      hitColliders: [hitbox, wall],
      stats: { registerHit: vi.fn() },
      hud: { showHitmarker: vi.fn() },
      audio: { playKnifeHit: vi.fn() },
      effects: { puff: vi.fn() },
    };
    mode.zombies = { group, damageZombie };
    mode.knife.setEnabled(true);
    mode.knife.trigger();

    mode.applyKnifeImpact();

    expect(damageZombie).not.toHaveBeenCalled();
  });
});
