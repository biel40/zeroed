import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import { cameraSpatialCue } from '../src/audio/SpatialCue';
import { easeIntroTime, IntroCinematic, sampleIntroPath } from '../src/rendering/IntroCinematic';
import { DieKathedraleArena } from '../src/zombies/maps/DieKathedraleArena';
import {
  DIE_KATHEDRALE_INTRO,
  DIE_KATHEDRALE_INTRO_CUES,
  DIE_KATHEDRALE_PLAYER_SPAWN,
  DIE_KATHEDRALE_WALL_THICKNESS,
  NAVE,
} from '../src/zombies/maps/DieKathedraleConfig';
import { Station33Arena } from '../src/zombies/maps/Station33Arena';
import {
  STATION33_INTRO,
  STATION33_INTRO_POWER_UP,
  STATION33_PLAYER_SPAWN,
  STATION33_POINT_LIGHTS,
  VESTIBULE,
} from '../src/zombies/maps/Station33Config';
import { VESTIBULE_VAULT } from '../src/zombies/maps/station33/VaultProfile';
import type { ArenaAmbientCue } from '../src/zombies/maps/ZombieArena';
import { installCanvasDocument, makeContext, TEST_PROFILE } from './coopHarness';

const DT = 1 / 60;

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());

function playerCameraAtSpawn(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.08, 700);
  camera.position.set(STATION33_PLAYER_SPAWN.x, STATION33_PLAYER_SPAWN.y, STATION33_PLAYER_SPAWN.z);
  camera.updateMatrixWorld(true);
  return camera;
}

function makeArena(): Station33Arena {
  const arena = new Station33Arena(new THREE.Scene(), TEST_PROFILE);
  arena.init();
  return arena;
}

describe('IntroCinematic', () => {
  it('eases the timeline in and out without leaving it', () => {
    expect(easeIntroTime(0, 8)).toBe(0);
    expect(easeIntroTime(4, 8)).toBeCloseTo(4);
    expect(easeIntroTime(8, 8)).toBeCloseTo(8);
    expect(easeIntroTime(20, 8)).toBeCloseTo(8);
    expect(easeIntroTime(0.4, 8)).toBeLessThan(0.4);
  });

  it('passes through every key of its path', () => {
    const keys = [0, 1, 3].map((time) => ({
      time,
      position: new THREE.Vector3(time, time * 2, -time),
      target: new THREE.Vector3(0, 0, -10 - time),
    }));
    const position = new THREE.Vector3();
    const target = new THREE.Vector3();
    for (const key of keys) {
      sampleIntroPath(keys, key.time, position, target);
      expect(position.distanceTo(key.position)).toBeLessThan(1e-9);
      expect(target.distanceTo(key.target)).toBeLessThan(1e-9);
    }
    sampleIntroPath(keys, 2, position, target);
    expect(position.x).toBeGreaterThan(1);
    expect(position.x).toBeLessThan(3);
  });

  it('starts on its first shot and lands exactly in the player view', () => {
    const player = playerCameraAtSpawn();
    const intro = new IntroCinematic(STATION33_INTRO);
    intro.start(player);
    const first = STATION33_INTRO.shots[0].position;
    expect(intro.camera.position.distanceTo(new THREE.Vector3(first.x, first.y, first.z))).toBeLessThan(1e-9);

    let finished = false;
    let frames = 0;
    while (!finished && frames++ < 1000) finished = intro.update(DT, player);
    expect(finished).toBe(true);
    expect(intro.isPlaying).toBe(false);
    expect(frames * DT).toBeCloseTo(STATION33_INTRO.duration, 1);
    expect(intro.camera.position.distanceTo(player.position)).toBeLessThan(1e-6);
    const view = intro.camera.getWorldDirection(new THREE.Vector3());
    expect(view.angleTo(player.getWorldDirection(new THREE.Vector3()))).toBeLessThan(1e-4);
    expect(intro.camera.aspect).toBe(player.aspect);
    expect(intro.update(DT, player)).toBe(false);
  });
});

describe('Station 33 intro', () => {
  it('keeps the camera inside the hall and clear of every solid', () => {
    const arena = makeArena();
    arena.group.updateMatrixWorld(true);
    const solids = arena.colliders.map((object) => new THREE.Box3().setFromObject(object).expandByScalar(0.1));
    const player = playerCameraAtSpawn();
    const intro = new IntroCinematic(arena.intro);
    intro.start(player);
    for (let time = 0; time < arena.intro.duration; time += 0.05) {
      const { x, y, z } = intro.camera.position;
      expect(x, `t=${time.toFixed(2)}`).toBeGreaterThan(VESTIBULE.minX + 0.3);
      expect(x).toBeLessThan(VESTIBULE.maxX - 0.3);
      expect(z).toBeGreaterThan(VESTIBULE.minZ + 0.3);
      expect(z).toBeLessThan(VESTIBULE.maxZ - 0.3);
      expect(y).toBeGreaterThan(0.5);
      expect(y).toBeLessThan(VESTIBULE_VAULT.heightAt(x) - 0.4);
      for (const box of solids) expect(box.containsPoint(intro.camera.position), `t=${time.toFixed(2)}`).toBe(false);
      intro.update(0.05, player);
    }
  });

  it('wakes the hall from a blackout circuit by circuit', () => {
    const arena = makeArena();
    const lights = arena.group.children.filter((child): child is THREE.PointLight => child.userData.mapRole === 'station-light');
    const steadyIndex = STATION33_POINT_LIGHTS.findIndex((light) => light.circuit === 'steady');
    const emergencyIndex = STATION33_POINT_LIGHTS.findIndex((light) => light.circuit === 'emergency');
    expect(lights.length).toBeGreaterThan(Math.max(steadyIndex, emergencyIndex));

    arena.startIntro();
    arena.update(STATION33_INTRO_POWER_UP.steady - 0.2);
    expect(lights[steadyIndex].intensity).toBe(0);
    expect(lights[emergencyIndex].intensity).toBeGreaterThan(0);
    arena.update(0.9);
    expect(lights[steadyIndex].intensity).toBeGreaterThan(0);

    arena.startIntro();
    arena.update(0.5);
    expect(lights[steadyIndex].intensity).toBe(0);
    arena.finishIntro();
    arena.update(DT);
    expect(lights[steadyIndex].intensity).toBeGreaterThan(0);
  });

  it('plays its cues on the intro clock and drops the pending ones when skipped', () => {
    const arena = makeArena();
    const cues: ArenaAmbientCue[] = [];
    arena.onAmbientCue = (cue) => cues.push(cue);
    arena.startIntro();
    arena.update(0.3);
    expect(cues.map((cue) => cue.sound)).toEqual(['distant-train']);
    arena.finishIntro();
    for (let time = 0; time < 6; time += 0.5) arena.update(0.5);
    expect(cues.map((cue) => cue.sound)).toEqual(['distant-train']);
  });
});

describe('Die Kathedrale intro', () => {
  function startCathedral(): { arena: DieKathedraleArena; player: THREE.PerspectiveCamera; intro: IntroCinematic } {
    const arena = new DieKathedraleArena(new THREE.Scene(), TEST_PROFILE);
    arena.init();
    const player = playerCameraAtSpawn();
    const spawn = DIE_KATHEDRALE_PLAYER_SPAWN;
    player.position.set(spawn.x, spawn.y, spawn.z);
    const intro = new IntroCinematic(DIE_KATHEDRALE_INTRO);
    arena.startIntro();
    intro.start(player);
    return { arena, player, intro };
  }

  it('enters through the real wicket, reveals the nave and lands in the live player view without clipping', () => {
    const { arena, player, intro } = startCathedral();
    const solids = arena.colliders
      .filter((object) => object.name !== 'point-door-collider:to-plaza')
      .map((object) => ({ name: object.name, box: new THREE.Box3().setFromObject(object).expandByScalar(0.12) }));
    const previousPosition = intro.camera.position.clone();
    const previousVelocity = new THREE.Vector3();
    const velocity = new THREE.Vector3();
    const previousDirection = intro.camera.getWorldDirection(new THREE.Vector3());
    const direction = new THREE.Vector3();
    let crossedPortal = false;
    let revealedNave = false;
    expect(intro.camera.position.z).toBeGreaterThan(17);
    for (let time = 0; time <= DIE_KATHEDRALE_INTRO.duration + DT; time += DT) {
      intro.update(DT, player);
      const position = intro.camera.position;
      for (const { name, box } of solids) expect(box.containsPoint(position), `${name} t=${time.toFixed(2)}`).toBe(false);
      if (Math.abs(position.z - DIE_KATHEDRALE_WALL_THICKNESS / 2) < 0.4) {
        crossedPortal = true;
        expect(Math.abs(position.x)).toBeLessThan(0.5);
        expect(position.y).toBeGreaterThan(0.5);
        expect(position.y).toBeLessThan(1.9);
      }
      if (position.z < -14 && position.y > 6) revealedNave = true;
      if (position.z < 0) expect(position.y).toBeLessThan(NAVE.naveSpringY - 1);
      expect(position.distanceTo(previousPosition) / DT, `speed t=${time.toFixed(2)}`).toBeLessThan(16);
      velocity.subVectors(position, previousPosition).divideScalar(DT);
      expect(velocity.distanceTo(previousVelocity) / DT, `acceleration t=${time.toFixed(2)}`).toBeLessThan(40);
      intro.camera.getWorldDirection(direction);
      expect(direction.angleTo(previousDirection) / DT, `turn t=${time.toFixed(2)}`).toBeLessThan(2);
      previousPosition.copy(position);
      previousVelocity.copy(velocity);
      previousDirection.copy(direction);
    }
    expect(crossedPortal).toBe(true);
    expect(revealedNave).toBe(true);
    expect(intro.isPlaying).toBe(false);
    expect(intro.camera.position.distanceTo(player.position)).toBeLessThan(1e-6);
    expect(direction.angleTo(player.getWorldDirection(previousDirection))).toBeLessThan(1e-4);
  });

  it('stages only the wicket view and restores it on finish, skip and reset without opening any zones', () => {
    const { arena } = startCathedral();
    const wicket = arena.group.getObjectByName('point-door-collider:to-plaza')!;
    const view = wicket.parent!;
    const colliders = [...arena.colliders];
    const spawns = [...arena.spawnPoints];
    const topologyChanged = vi.fn();
    arena.onTopologyChanged = topologyChanged;
    expect(view.visible).toBe(false);
    arena.finishIntro();
    arena.finishIntro();
    expect(view.visible).toBe(true);
    arena.startIntro();
    expect(view.visible).toBe(false);
    arena.reset();
    expect(view.visible).toBe(true);
    expect(arena.doors.every((door) => door.isLocked)).toBe(true);
    expect(arena.colliders).toEqual(colliders);
    expect(arena.spawnPoints).toEqual(spawns);
    expect(topologyChanged).not.toHaveBeenCalled();
  });

  it('plays each authored cue once on its own clock and cancels pending cues on skip or reset', () => {
    const { arena } = startCathedral();
    const cues: ArenaAmbientCue[] = [];
    arena.onAmbientCue = (cue) => cues.push(cue);
    arena.update(-1);
    expect(cues).toEqual([]);
    arena.update(DIE_KATHEDRALE_INTRO.duration);
    expect(cues.map((cue) => cue.sound)).toEqual(DIE_KATHEDRALE_INTRO_CUES.map((cue) => cue.sound));
    arena.update(DT);
    expect(cues).toHaveLength(DIE_KATHEDRALE_INTRO_CUES.length);
    for (const finish of [(): void => arena.finishIntro(), (): void => arena.reset()]) {
      cues.length = 0;
      arena.startIntro();
      arena.update(DIE_KATHEDRALE_INTRO_CUES[0].time);
      expect(cues).toHaveLength(1);
      finish();
      arena.update(DIE_KATHEDRALE_INTRO.duration);
      expect(cues).toHaveLength(1);
    }
  });
});

describe.each([
  { mapId: 'station-33' as const, presentation: 'station33', duration: STATION33_INTRO.duration },
  { mapId: 'die-kathedrale' as const, presentation: 'dieKathedrale', duration: DIE_KATHEDRALE_INTRO.duration },
])('ZombiesMode $mapId intro', ({ mapId, presentation, duration }) => {
  /** A mode context whose audio has no Web Audio context yet (no footstep listener). */
  function silentContext(): ReturnType<typeof makeContext> {
    const base = makeContext();
    const audio = new Proxy(base.ctx.audio, { get: (target, key) => (key === 'rawContext' ? null : Reflect.get(target, key)) });
    return { ...base, ctx: { ...base.ctx, audio } };
  }

  function startMapIntro(): { mode: ZombiesMode; hud: ReturnType<typeof makeContext>['hud'] } {
    const { ctx, hud } = silentContext();
    const mode = new ZombiesMode(mapId);
    mode.init(ctx);
    mode.onGameplayStarted();
    return { mode, hud };
  }

  it('lets the map lighting follow the filmed camera, then the player again after skip', () => {
    const { ctx } = silentContext();
    const update = vi.spyOn(mapId === 'station-33' ? Station33Arena.prototype : DieKathedraleArena.prototype, 'update');
    try {
      const mode = new ZombiesMode(mapId);
      mode.init(ctx);
      mode.onGameplayStarted();
      const camera = mode.getCinematicCamera()!;
      mode.update(DT);
      expect(update.mock.lastCall?.[1]).toBe(camera.position);
      mode.onLocalPauseChanged(true);
      mode.update(DT);
      expect(update.mock.lastCall?.[1]).toBe(ctx.player.rig.position);
    } finally {
      update.mockRestore();
    }
  });

  it('hears the map intro cues from the moving shot', () => {
    const { ctx } = silentContext();
    const mode = new ZombiesMode(mapId);
    mode.init(ctx);
    mode.onGameplayStarted();
    // Both maps emit their first authored sound within this first second.
    mode.update(0.8);
    const call = vi.mocked(ctx.audio.playAmbientCue).mock.lastCall!;
    expect(call).toBeDefined();
    const cue = call[0] as ArenaAmbientCue;
    expect(call[1]).toEqual(cameraSpatialCue(mode.getCinematicCamera()!, cue.position));
    expect(call[1]).not.toEqual(cameraSpatialCue(ctx.player.camera, cue.position));
  });

  it('films the intro, holds the run, then hands control to the player once', () => {
    const { mode, hud } = startMapIntro();
    expect(hud.showIntro).toHaveBeenCalledWith(presentation, duration, expect.any(Function));
    expect(mode.isGameplayInputEnabled()).toBe(false);
    expect(mode.getCinematicCamera()).toBeInstanceOf(THREE.PerspectiveCamera);

    for (let time = 0; time < duration - 0.1; time += DT) mode.update(DT);
    expect(mode.isGameplayInputEnabled()).toBe(false);
    expect(hud.showRoundBanner).not.toHaveBeenCalled();
    for (let frame = 0; frame < 12; frame++) mode.update(DT);

    expect(mode.isGameplayInputEnabled()).toBe(true);
    expect(mode.getCinematicCamera()).toBeNull();
    expect(hud.hideIntro).toHaveBeenCalledTimes(1);

    // Resuming after a pause re-enters gameplay without replaying the intro.
    mode.onGameplayStarted();
    expect(hud.showIntro).toHaveBeenCalledTimes(1);
    expect(mode.getCinematicCamera()).toBeNull();
  });

  it('never loads or adds a player body during the cinematic', () => {
    const { ctx } = silentContext();
    const load = vi.fn(async () => undefined);
    ctx.assets.loadPlayerModel = load;
    const model = vi.spyOn(ctx.assets, 'getPlayerModel');
    const mode = new ZombiesMode(mapId);
    mode.init(ctx);
    const world = [...ctx.scene.children];
    mode.onGameplayStarted();
    expect(ctx.scene.children).toEqual(world);
    for (let frame = 0; frame <= duration / DT; frame++) {
      mode.update(DT);
      expect(ctx.scene.children).toEqual(world);
    }
    expect(load).not.toHaveBeenCalled();
    expect(model).not.toHaveBeenCalled();
    expect(mode.getCinematicCamera()).toBeNull();
  });

  it('skips on a key press after the start guard, or when the run pauses', () => {
    const keyed = startMapIntro();
    keyed.mode.onKeyInput('w');
    expect(keyed.mode.getCinematicCamera()).not.toBeNull();
    for (let frame = 0; frame < 60; frame++) keyed.mode.update(DT);
    keyed.mode.onKeyInput('w');
    expect(keyed.mode.getCinematicCamera()).toBeNull();
    expect(keyed.mode.isGameplayInputEnabled()).toBe(true);
    expect(keyed.hud.hideIntro).toHaveBeenCalledTimes(1);

    const paused = startMapIntro();
    paused.mode.onLocalPauseChanged(true);
    expect(paused.mode.getCinematicCamera()).toBeNull();
    expect(paused.hud.hideIntro).toHaveBeenCalledTimes(1);
  });

  it('touch players skip through the HUD button', () => {
    const { mode, hud } = startMapIntro();
    const onSkip = hud.showIntro.mock.calls[0][2] as () => void;
    onSkip();
    expect(mode.getCinematicCamera()).toBeNull();
  });

  it('hands control to the player when restarting during the intro', () => {
    const { mode } = startMapIntro();
    mode.onRestartRequested();
    expect(mode.getCinematicCamera()).toBeNull();
    mode.onGameplayStarted();
    expect(mode.getCinematicCamera()).toBeNull();
  });

});

it('leaves maps without an intro straight in first person', () => {
  const { ctx, hud } = makeContext();
  const mode = new ZombiesMode('burned-mansion');
  mode.init(ctx);
  mode.onGameplayStarted();
  expect(hud.showIntro).not.toHaveBeenCalled();
  expect(mode.getCinematicCamera()).toBeNull();
  expect(mode.isGameplayInputEnabled()).toBe(true);
});
