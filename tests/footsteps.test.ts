import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FOOTSTEP_SAMPLES, FOOTSTEP_SURFACES, FOOTSTEP_VARIATION, type FootSide, type FootstepSurface } from '../src/config/footsteps';
import { WALK_BOB } from '../src/config/walkBob';
import { FootstepVariantPicker, footstepGainScale, footstepPlaybackRate, pickFootstepVariant } from '../src/audio/FootstepVariation';
import { PlayerFootsteps, type FootstepPlayer } from '../src/player/PlayerFootsteps';
import { WalkGait, type WalkGaitSample } from '../src/player/WalkGait';
import { footstepSurfaceAt, footstepSurfacesUsed, surfaceArea, surfacePatch, type ArenaFootstepSurfaces } from '../src/zombies/maps/FootstepSurfaces';
import { MANSION_FOOTSTEP_SURFACES } from '../src/zombies/maps/burnedMansion/MansionFootstepSurfaces';
import { DIE_KATHEDRALE_FOOTSTEP_SURFACES } from '../src/zombies/maps/dieKathedrale/DieKathedraleFootstepSurfaces';
import { STATION33_FOOTSTEP_SURFACES } from '../src/zombies/maps/station33/Station33FootstepSurfaces';
import {
  COCHERAS, COCHERAS_TRACKS, CONSIGNA, KOVKA_UPGRADE_SITE, MILICIA, POWER_LEVER, PROTOCOL33_SURFACE, STATION33_DRIP_SOURCES, SUBESTACION, VESTIBULE,
} from '../src/zombies/maps/Station33Config';
import { MANSION_BUNKER_Y, MANSION_PLASTER_RUBBLE, MANSION_STAIR_BOTTOM_Z, MANSION_STAIR_CENTER_X, MANSION_STAIR_TOP_Z } from '../src/zombies/maps/BurnedMansionConfig';
import { DIE_KATHEDRALE_SCREENS, NAVE, PLAZA } from '../src/zombies/maps/DieKathedraleConfig';
import { seededRandom } from '../src/zombies/maps/shared/ProceduralNoise';

const WALK_SPEED = 4.6;

describe('WalkGait footfalls', () => {
  function walk(gait: WalkGait, metres: number, dt = 1 / 60, speed = WALK_SPEED, grounded = true): void {
    const frames = Math.round(metres / speed / dt);
    for (let frame = 0; frame < frames; frame++) gait.update(dt, speed * dt, grounded);
  }

  it('lands one footfall per step length of ground covered, whatever the frame rate', () => {
    for (const fps of [30, 60, 144]) {
      const gait = new WalkGait(WALK_SPEED);
      walk(gait, WALK_BOB.stepLength * 6 + 0.01, 1 / fps);
      expect(gait.footfalls).toBe(6);
    }
  });

  it('adapts the cadence to the walking speed', () => {
    const brisk = new WalkGait(WALK_SPEED);
    const slow = new WalkGait(WALK_SPEED);
    for (let frame = 0; frame < 120; frame++) {
      brisk.update(1 / 60, WALK_SPEED / 60, true);
      slow.update(1 / 60, WALK_SPEED * 0.45 / 60, true);
    }
    expect(brisk.footfalls).toBeGreaterThan(slow.footfalls * 2 - 1);
    expect(slow.footfalls).toBeGreaterThan(0);
  });

  it('never steps standing still or in the air', () => {
    const gait = new WalkGait(WALK_SPEED);
    for (let frame = 0; frame < 240; frame++) gait.update(1 / 60, 0, true);
    walk(gait, 9, 1 / 60, WALK_SPEED, false);
    expect(gait.footfalls).toBe(0);
  });

  it('counts at most one footfall per frame, even across a long hitch', () => {
    const gait = new WalkGait(WALK_SPEED);
    gait.update(0.9, WALK_BOB.stepLength * 2.5, true);
    expect(gait.footfalls).toBe(1);
  });

  it('ignores a discontinuous jump in position (teleport, snap)', () => {
    const gait = new WalkGait(WALK_SPEED);
    gait.update(1 / 60, 12, true);
    expect(gait.footfalls).toBe(0);
    expect(gait.phase).toBe(0);
  });

  it('starts a fresh step after a reset', () => {
    const gait = new WalkGait(WALK_SPEED);
    walk(gait, WALK_BOB.stepLength * 0.9);
    gait.reset();
    walk(gait, WALK_BOB.stepLength * 0.5);
    expect(gait.footfalls).toBe(0);
  });
});

describe('footstep variation', () => {
  it('never repeats the previous variant and reaches every one', () => {
    const picker = new FootstepVariantPicker(seededRandom(7));
    let previous = -1;
    const seen = new Set<number>();
    for (let step = 0; step < 60; step++) {
      const index = picker.next('stone', 5);
      expect(index).not.toBe(previous);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(5);
      seen.add(index);
      previous = index;
    }
    expect(seen.size).toBe(5);
  });

  it('remembers the last variant per surface', () => {
    expect(pickFootstepVariant(4, 2, () => 0.7)).toBe(3);
    expect(pickFootstepVariant(4, 2, () => 0.1)).toBe(0);
    expect(pickFootstepVariant(1, 0, () => 0.5)).toBe(0);
  });

  it('varies pitch by ±3 % and volume by ±7 %', () => {
    expect(FOOTSTEP_VARIATION.pitch).toBe(0.03);
    expect(FOOTSTEP_VARIATION.volume).toBe(0.07);
    expect(footstepPlaybackRate(() => 0)).toBeCloseTo(0.97, 9);
    expect(footstepPlaybackRate(() => 1)).toBeCloseTo(1.03, 9);
    expect(footstepGainScale(() => 0)).toBeCloseTo(0.93, 9);
    expect(footstepGainScale(() => 1)).toBeCloseTo(1.07, 9);
  });
});

describe('footstep samples', () => {
  it('ship 4 to 6 recorded clips per surface, all present on disk', () => {
    for (const surface of FOOTSTEP_SURFACES) {
      const { files, gain } = FOOTSTEP_SAMPLES[surface];
      expect(files.length).toBeGreaterThanOrEqual(4);
      expect(files.length).toBeLessThanOrEqual(6);
      expect(gain).toBeGreaterThan(0);
      for (const file of files) expect(fs.existsSync(path.join('public/assets/audio', file)), file).toBe(true);
    }
  });

  it('record where every clip came from', () => {
    const sources = fs.readFileSync('public/assets/audio/footsteps/SOURCES.txt', 'utf8');
    expect(sources).toContain('CC0');
    for (const surface of FOOTSTEP_SURFACES) expect(sources.toLowerCase()).toContain(`${surface}_`);
  });
});

describe('footstep surfaces', () => {
  const layout: ArenaFootstepSurfaces = {
    fallback: 'concrete',
    zones: [
      surfaceArea({ minX: 0, maxX: 10, minZ: 0, maxZ: 10 }, 'stone', 0),
      surfacePatch(5, 5, 0.5, 0.5, 'water', 0),
      surfaceArea({ minX: 20, maxX: 22, minZ: 0, maxZ: 4 }, 'metal'),
    ],
  };

  it('falls back outside every zone, and without a layout', () => {
    expect(footstepSurfaceAt(layout, -3, -3, 0)).toBe('concrete');
    expect(footstepSurfaceAt(undefined, 0, 0, 0)).toBe('concrete');
  });

  it('lets later zones override earlier ones and keeps zones to their floor', () => {
    expect(footstepSurfaceAt(layout, 2, 2, 0)).toBe('stone');
    expect(footstepSurfaceAt(layout, 5.2, 4.8, 0)).toBe('water');
    expect(footstepSurfaceAt(layout, 2, 2, 1)).toBe('concrete');
    expect(footstepSurfaceAt(layout, 21, 1, -1)).toBe('metal');
    expect(footstepSurfaceAt(layout, 21, 1, 3)).toBe('metal');
  });

  it('lists the surfaces a layout can play, for preloading', () => {
    expect([...footstepSurfacesUsed(layout)].sort()).toEqual(['concrete', 'metal', 'stone', 'water']);
    expect([...footstepSurfacesUsed(null)]).toEqual(['concrete']);
  });
});

describe('map footstep surfaces', () => {
  const at = (surfaces: ArenaFootstepSurfaces, x: number, z: number, floor = 0): FootstepSurface =>
    footstepSurfaceAt(surfaces, x, z, floor);

  it('Station 33: granite and tiled halls, concrete sheds, ballast, steel plates, puddles and the snowy yard', () => {
    const s = STATION33_FOOTSTEP_SURFACES;
    expect(at(s, 0, (VESTIBULE.minZ + VESTIBULE.maxZ) / 2 - 3)).toBe('stone');
    expect(at(s, (CONSIGNA.hall.minX + CONSIGNA.hall.maxX) / 2, 8)).toBe('stone');
    expect(at(s, (MILICIA.hall.minX + MILICIA.hall.maxX) / 2, 9)).toBe('stone');
    expect(at(s, 10.5, -13)).toBe('concrete');
    expect(at(s, COCHERAS_TRACKS.east.x, (COCHERAS.hall.minZ + COCHERAS_TRACKS.east.bufferZ) / 2 - 2)).toBe('debris');
    expect(at(s, POWER_LEVER.x, SUBESTACION.hall.maxZ - 1)).toBe('metal');
    expect(at(s, SUBESTACION.hall.minX + 1, SUBESTACION.hall.minZ + 1.5)).toBe('stone');
    expect(at(s, KOVKA_UPGRADE_SITE.x, KOVKA_UPGRADE_SITE.z)).toBe('metal');
    const drip = STATION33_DRIP_SOURCES.find((source) => source.z < -50)!;
    expect(at(s, drip.x + 0.2, drip.z - 0.2)).toBe('water');
    expect(at(s, 15, -90, 1)).toBe('snow');
    expect(at(s, (PROTOCOL33_SURFACE.kiosk.minX + PROTOCOL33_SURFACE.kiosk.maxX) / 2, -75, 1)).toBe('concrete');
  });

  it('Burned Mansion: parquet upstairs, concrete bunker, steel stair and fallen plaster', () => {
    const m = MANSION_FOOTSTEP_SURFACES;
    expect(at(m, -3.5, 7.2)).toBe('wood');
    expect(at(m, -1.5, -11)).toBe('wood');
    expect(at(m, 0, -4, -1)).toBe('concrete');
    const stairZ = (MANSION_STAIR_TOP_Z + MANSION_STAIR_BOTTOM_Z) / 2;
    expect(at(m, MANSION_STAIR_CENTER_X, stairZ, 0)).toBe('metal');
    expect(at(m, MANSION_STAIR_CENTER_X, stairZ, -1)).toBe('metal');
    const [x, z] = MANSION_PLASTER_RUBBLE[0];
    expect(at(m, x, z)).toBe('debris');
    expect(MANSION_BUNKER_Y).toBeLessThan(0);
  });

  it('Die Kathedrale: stone throughout, with rubble round the collapse', () => {
    const k = DIE_KATHEDRALE_FOOTSTEP_SURFACES;
    expect(at(k, 0, -3.6)).toBe('stone');
    expect(at(k, 0, (PLAZA.minZ + PLAZA.maxZ) / 2)).toBe('stone');
    const collapse = DIE_KATHEDRALE_SCREENS.find((screen) => screen.style === 'rubble')!;
    expect(at(k, (collapse.min + collapse.max) / 2, collapse.fixed + 1.5)).toBe('debris');
    expect(at(k, -NAVE.columnX - 2, collapse.fixed + 1.5)).toBe('stone');
  });
});

describe('PlayerFootsteps', () => {
  class RecordingPlayer implements FootstepPlayer {
    public readonly steps: Array<{ surface: FootstepSurface; foot: FootSide; loudness: number }> = [];
    public playFootstep(surface: FootstepSurface, foot: FootSide, loudness: number): void {
      this.steps.push({ surface, foot, loudness });
    }
  }
  const surfaces: ArenaFootstepSurfaces = { fallback: 'wood', zones: [surfaceArea({ minX: 10, maxX: 20, minZ: -5, maxZ: 5 }, 'metal')] };
  const gait = (footfalls: number, intensity = 1): WalkGaitSample => ({ phase: 0, intensity, footfalls });

  it('plays one step per footfall on the surface underfoot, alternating feet', () => {
    const player = new RecordingPlayer();
    const footsteps = new PlayerFootsteps(player);
    footsteps.setSurfaces(surfaces);
    footsteps.update(gait(0), 0, 0, 0, 'standing', true);
    footsteps.update(gait(1), 0, 0, 0, 'standing', true);
    footsteps.update(gait(1), 0.2, 0, 0, 'standing', true);
    footsteps.update(gait(2), 12, 0, 0, 'standing', true);
    expect(player.steps.map((step) => step.surface)).toEqual(['wood', 'metal']);
    expect(player.steps[0].foot).not.toBe(player.steps[1].foot);
    expect(player.steps[0].loudness).toBeCloseTo(1, 9);
  });

  it('stays silent while not audible and does not catch up afterwards', () => {
    const player = new RecordingPlayer();
    const footsteps = new PlayerFootsteps(player);
    footsteps.update(gait(3), 0, 0, 0, 'standing', false);
    footsteps.update(gait(3), 0, 0, 0, 'standing', true);
    expect(player.steps).toHaveLength(0);
    footsteps.update(gait(4), 0, 0, 0, 'standing', true);
    expect(player.steps).toHaveLength(1);
  });

  it('is quieter crouched and at a slow pace, and silent prone', () => {
    const player = new RecordingPlayer();
    const footsteps = new PlayerFootsteps(player);
    footsteps.update(gait(1), 0, 0, 0, 'crouched', true);
    footsteps.update(gait(2, 0.3), 0, 0, 0, 'standing', true);
    footsteps.update(gait(3), 0, 0, 0, 'prone', true);
    expect(player.steps).toHaveLength(2);
    expect(player.steps[0].loudness).toBeLessThan(0.8);
    expect(player.steps[1].loudness).toBeLessThan(0.9);
    expect(player.steps[1].loudness).toBeGreaterThan(0.4);
  });
});
