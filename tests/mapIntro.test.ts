import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import { easeIntroTime, IntroCinematic, sampleIntroPath } from '../src/rendering/IntroCinematic';
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

describe('ZombiesMode map intro', () => {
  /** A mode context whose audio has no Web Audio context yet (no footstep listener). */
  function silentContext(): ReturnType<typeof makeContext> {
    const base = makeContext();
    const audio = new Proxy(base.ctx.audio, { get: (target, key) => (key === 'rawContext' ? null : Reflect.get(target, key)) });
    return { ...base, ctx: { ...base.ctx, audio } };
  }

  function startStation() {
    const { ctx, hud } = silentContext();
    const mode = new ZombiesMode('station-33');
    mode.init(ctx);
    mode.onGameplayStarted();
    return { mode, hud };
  }

  it('films the intro, holds the run, then hands control to the player once', () => {
    const { mode, hud } = startStation();
    expect(hud.showIntro).toHaveBeenCalledWith('station33', STATION33_INTRO.duration, expect.any(Function));
    expect(mode.isGameplayInputEnabled()).toBe(false);
    expect(mode.getCinematicCamera()).toBeInstanceOf(THREE.PerspectiveCamera);

    for (let time = 0; time < STATION33_INTRO.duration - 0.1; time += DT) mode.update(DT);
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
    const mode = new ZombiesMode('station-33');
    mode.init(ctx);
    const world = [...ctx.scene.children];
    mode.onGameplayStarted();
    expect(ctx.scene.children).toEqual(world);
    for (let frame = 0; frame <= STATION33_INTRO.duration / DT; frame++) {
      mode.update(DT);
      expect(ctx.scene.children).toEqual(world);
    }
    expect(load).not.toHaveBeenCalled();
    expect(model).not.toHaveBeenCalled();
    expect(mode.getCinematicCamera()).toBeNull();
  });

  it('skips on a key press after the start guard, or when the run pauses', () => {
    const keyed = startStation();
    keyed.mode.onKeyInput('w');
    expect(keyed.mode.getCinematicCamera()).not.toBeNull();
    for (let frame = 0; frame < 60; frame++) keyed.mode.update(DT);
    keyed.mode.onKeyInput('w');
    expect(keyed.mode.getCinematicCamera()).toBeNull();
    expect(keyed.mode.isGameplayInputEnabled()).toBe(true);
    expect(keyed.hud.hideIntro).toHaveBeenCalledTimes(1);

    const paused = startStation();
    paused.mode.onLocalPauseChanged(true);
    expect(paused.mode.getCinematicCamera()).toBeNull();
    expect(paused.hud.hideIntro).toHaveBeenCalledTimes(1);
  });

  it('touch players skip through the HUD button', () => {
    const { mode, hud } = startStation();
    const onSkip = hud.showIntro.mock.calls[0][2] as () => void;
    onSkip();
    expect(mode.getCinematicCamera()).toBeNull();
  });

  it('hands control to the player when restarting during the intro', () => {
    const { mode } = startStation();
    mode.onRestartRequested();
    expect(mode.getCinematicCamera()).toBeNull();
    mode.onGameplayStarted();
    expect(mode.getCinematicCamera()).toBeNull();
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
});
