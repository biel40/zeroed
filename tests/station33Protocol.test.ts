import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PlayerEconomy } from '../src/game/PlayerEconomy';
import type { PlayerHealth } from '../src/game/PlayerHealth';
import { t } from '../src/i18n/i18n';
import { actionKey } from '../src/ui/InteractionPrompts';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import { EYE_HEIGHT, PlayerController } from '../src/player/PlayerController';
import type { Input } from '../src/player/Input';
import type { Weapon } from '../src/weapons/Weapon';
import { roundConfig } from '../src/zombies/ZombieConfig';
import { ZombieManager } from '../src/zombies/ZombieManager';
import type { RoundManager } from '../src/zombies/RoundManager';
import { Station33Arena } from '../src/zombies/maps/Station33Arena';
import {
  PROTOCOL33_BLAST_DOOR,
  PROTOCOL33_ENDING,
  PROTOCOL33_ESCAPE,
  PROTOCOL33_RULES,
  PROTOCOL33_SURFACE,
  PROTOCOL33_SURFACE_AMBIENCE,
  PROTOCOL33_SURFACE_BOUNDS,
  PROTOCOL33_SURFACE_Y,
  SERVICE_PASSAGE,
  STATION33_BARRIERS,
  STATION33_DOORS,
  STATION33_SPAWNS,
  STATION33_WALL_THICKNESS,
  TALLER,
  station33ZoneAt,
  type Station33Barrier,
  type Station33ZoneId,
} from '../src/zombies/maps/Station33Config';
import type { ZombieArena } from '../src/zombies/maps/ZombieArena';
import { installCanvasDocument, makeContext, TEST_PROFILE, type TestContext } from './coopHarness';

const DT = 1 / 60;
/** Mode steps that sum exactly in binary, so the protocol's clocks land on whole seconds. */
const STEP = 0.25;
const FACE_NORTH = 0;
const FACE_SOUTH = Math.PI;
const FACE_EAST = -Math.PI / 2;
const COST = PROTOCOL33_RULES.cost;
const KEY = actionKey(false);

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());

interface ModeInternals {
  arena: Station33Arena;
  economy: PlayerEconomy;
  health: PlayerHealth;
  rounds: RoundManager;
  gameOver: boolean;
  zombies: { spawnZombie: (...args: unknown[]) => boolean };
  evacuation: unknown;
}

interface Run {
  readonly mode: ZombiesMode;
  readonly internals: ModeInternals;
  readonly side: TestContext;
  readonly spawns: ReturnType<typeof vi.fn>;
}

/** Station 33 in single player, without real audio; the horde's spawns are counted, not simulated. */
function startRun(): Run {
  const side = makeContext();
  const audio = new Proxy(side.ctx.audio, { get: (target, key) => (key === 'rawContext' ? null : Reflect.get(target, key)) });
  const mode = new ZombiesMode('station-33');
  mode.init({ ...side.ctx, audio });
  const internals = mode as unknown as ModeInternals;
  const spawns = vi.fn(() => true);
  internals.zombies.spawnZombie = spawns;
  return { mode, internals, side, spawns };
}

function fund(economy: PlayerEconomy, points: number): void {
  for (let earned = 0; earned < points; earned += 10) economy.awardRepair();
}

function stand(side: TestContext, x: number, z: number, yaw: number, floor = 0): void {
  const y = (floor === 1 ? PROTOCOL33_SURFACE_Y : 0) + EYE_HEIGHT;
  side.player.teleport(x, y, z, floor);
  side.player.face(yaw);
  side.player.rig.updateMatrixWorld(true);
}

function advance(run: Run, seconds: number): void {
  for (let step = 0; step < Math.round(seconds / STEP); step++) run.mode.update(STEP);
}

const atPanel = (run: Run): void => stand(run.side, 15.0, -58.0, FACE_EAST);
const atVentilation = (run: Run): void => stand(run.side, 7.3, -35.6, FACE_SOUTH);
const atSecurity = (run: Run): void => stand(run.side, 18.6, -25.4, FACE_NORTH);
const atTruck = (run: Run): void => stand(run.side, run.internals.arena.evacuation.extraction.position.x, -87.0, FACE_NORTH, 1);

/** Power on, both systems restored at their switches through USE, standing at the panel. */
function readyRun(): Run {
  const run = startRun();
  run.internals.arena.switchOnPower();
  run.mode.update(STEP);
  atVentilation(run);
  run.mode.onInteract();
  atSecurity(run);
  run.mode.onInteract();
  atPanel(run);
  run.mode.update(STEP);
  return run;
}

/** Ready, funded, started at the panel and defended until the blast door opens. */
function escapingRun(): Run {
  const run = readyRun();
  fund(run.internals.economy, COST);
  run.mode.onInteract();
  advance(run, PROTOCOL33_RULES.defenseSeconds);
  return run;
}

describe('Protocol 33 through the mode', () => {
  it('stays dead and free before the power: no switch, no briefing, no charge', () => {
    const run = startRun();
    atPanel(run);
    expect(run.mode.getInteractPrompt()).toBe(t('evacuation.panelNeedsPower'));
    fund(run.internals.economy, COST);
    run.mode.onInteract();
    expect(run.internals.economy.points).toBe(COST);
    atVentilation(run);
    expect(run.mode.getInteractPrompt()).toBe(t('evacuation.switchNeedsPower', { system: t('evacuation.ventilation') }));
    run.mode.onInteract();
    expect(run.internals.arena.evacuation.switches[0].lever.isOn).toBe(false);
    expect(run.side.ctx.audio.playPowerSwitch).not.toHaveBeenCalled();
  });

  it('briefs at the panel, then restores each system once with sound and banners', () => {
    const run = startRun();
    run.internals.arena.switchOnPower();
    atPanel(run);
    expect(run.mode.getInteractPrompt()).toBe(t('evacuation.panelPrompt', { key: KEY }));
    run.mode.onInteract();
    expect(run.side.hud.showRoundBanner).toHaveBeenLastCalledWith('ПРОТОКОЛ 33', expect.stringContaining(t('evacuation.ventilation')));
    run.mode.update(STEP);
    expect(run.side.hud.setObjective).toHaveBeenLastCalledWith(expect.stringContaining(t('evacuation.objectiveRestore')), false);

    atVentilation(run);
    expect(run.mode.getInteractPrompt()).toBe(t('evacuation.restorePrompt', { system: t('evacuation.ventilation'), key: KEY }));
    run.mode.onInteract();
    expect(run.side.ctx.audio.playPowerSwitch).toHaveBeenCalledOnce();
    expect(run.side.hud.showRoundBanner).toHaveBeenLastCalledWith(t('evacuation.restoredBanner', { system: t('evacuation.ventilation') }), 'ПРОТОКОЛ 33');
    expect(run.mode.getInteractPrompt()).toBeNull();
    run.mode.onInteract();
    expect(run.side.ctx.audio.playPowerSwitch).toHaveBeenCalledOnce();
    // The lever plays its throw; the fan over it spins up once it closes.
    const rotor = run.internals.arena.group.getObjectByName('protocol33-fan-rotor')!;
    advance(run, 2);
    expect(rotor.rotation.z).not.toBe(0);

    atPanel(run);
    expect(run.mode.getInteractPrompt()).toContain(t('evacuation.ventilation'));
    expect(run.mode.getInteractPrompt()).not.toBe(t('evacuation.initiatePrompt', { key: KEY, cost: COST }));
    atSecurity(run);
    run.mode.onInteract();
    expect(run.side.hud.showRoundBanner).toHaveBeenLastCalledWith(t('evacuation.readyBanner'), t('evacuation.readySub', { cost: COST }));
    atPanel(run);
    expect(run.mode.getInteractPrompt()).toBe(t('evacuation.initiatePrompt', { key: KEY, cost: COST }));
  });

  it('needs 10000 Points, charges exactly once and suspends the rounds for its own horde', () => {
    const run = readyRun();
    fund(run.internals.economy, COST - 10);
    run.mode.onInteract();
    expect(run.side.hud.flashNotEnoughPoints).toHaveBeenCalledOnce();
    expect(run.internals.economy.points).toBe(COST - 10);
    expect(run.side.ctx.audio.playEvacuationSiren).not.toHaveBeenCalled();

    fund(run.internals.economy, 60);
    run.mode.onInteract();
    expect(run.internals.economy.points).toBe(50);
    run.mode.onInteract();
    run.mode.onInteract();
    expect(run.internals.economy.points).toBe(50);
    expect(run.side.ctx.audio.playEvacuationSiren).toHaveBeenCalledOnce();
    expect(run.side.ctx.audio.playIntercomAnnouncement).toHaveBeenCalledOnce();
    expect(run.side.hud.showRoundBanner).toHaveBeenCalledWith(t('evacuation.surviveBanner'), 'ПРОТОКОЛ 33');
    expect(run.mode.getInteractPrompt()).toBeNull();

    const round = run.internals.rounds.round;
    run.spawns.mockClear();
    advance(run, 30);
    expect(run.internals.rounds.round).toBe(round);
    const early = run.spawns.mock.calls.length;
    expect(early).toBeGreaterThan(5);
    run.spawns.mockClear();
    advance(run, 30);
    expect(run.spawns.mock.calls.length).toBeGreaterThan(early);
    expect(run.side.hud.setObjective).toHaveBeenLastCalledWith(expect.stringContaining('50%'), true);
  });

  it('unlocks only while the panel is defended and keeps the progress while nobody is there', () => {
    const run = readyRun();
    fund(run.internals.economy, COST);
    run.mode.onInteract();
    advance(run, 60);
    stand(run.side, 0, 15, FACE_NORTH);
    advance(run, 45);
    expect(run.side.hud.showRoundBanner).toHaveBeenCalledWith(t('evacuation.pausedBanner'), t('evacuation.pausedSub'));
    expect(run.side.hud.setObjective).toHaveBeenLastCalledWith(expect.stringContaining(t('evacuation.objectivePaused')), true);
    expect(run.side.hud.setObjective).toHaveBeenLastCalledWith(expect.stringContaining('50%'), true);
    expect(run.internals.arena.evacuation.blastDoorCollider).not.toBeNull();
    atPanel(run);
    advance(run, 59.75);
    expect(run.internals.arena.evacuation.blastDoorCollider).not.toBeNull();
    advance(run, STEP);
    expect(run.internals.arena.evacuation.blastDoorCollider).toBeNull();
    expect(run.side.ctx.audio.playBlastDoorOpen).toHaveBeenCalledOnce();
    expect(run.side.hud.showRoundBanner).toHaveBeenLastCalledWith(t('evacuation.escapeBanner', { seconds: 60 }), 'ПРОТОКОЛ 33');
  });

  it('ends the run with the escape when the player boards the truck in time', () => {
    const run = escapingRun();
    advance(run, 30);
    atTruck(run);
    expect(run.mode.getInteractPrompt()).toBe(t('evacuation.boardPrompt', { key: KEY }));
    run.mode.onInteract();
    expect(run.side.hud.showEnding).toHaveBeenCalledWith(run.internals.rounds.round, 'evacuation', { kills: 0, headshots: 0 });
    expect(run.side.ctx.audio.startEndingAudio).toHaveBeenCalledWith('evacuation');
    expect(run.side.ctx.unlockPointer).toHaveBeenCalled();
    run.mode.onInteract();
    expect(run.side.hud.showEnding).toHaveBeenCalledOnce();
    advance(run, PROTOCOL33_ENDING.duration);
    expect(run.side.hud.showCredits).toHaveBeenCalledOnce();
  });

  it('fails the evacuation through the normal game over after exactly 60 s on the clock', () => {
    const run = escapingRun();
    advance(run, PROTOCOL33_RULES.escapeSeconds - STEP);
    expect(run.internals.gameOver).toBe(false);
    advance(run, STEP);
    expect(run.internals.gameOver).toBe(true);
    expect(run.side.hud.showRoundBanner).toHaveBeenCalledWith(t('evacuation.failedBanner'), 'ПРОТОКОЛ 33');
    expect(run.side.hud.showDeathFilter).toHaveBeenCalledOnce();
    expect(run.side.hud.showEnding).not.toHaveBeenCalled();
  });

  it('puts the whole protocol back on restart', () => {
    const run = escapingRun();
    const { evacuation } = run.internals.arena;
    run.mode.onRestartRequested();
    expect(evacuation.blastDoorCollider).not.toBeNull();
    expect(evacuation.switches.every(({ lever }) => !lever.isOn)).toBe(true);
    expect(run.internals.arena.colliders).toContain(evacuation.blastDoorCollider);
    atPanel(run);
    expect(run.mode.getInteractPrompt()).toBe(t('evacuation.panelNeedsPower'));
    run.internals.arena.switchOnPower();
    run.mode.update(STEP);
    expect(run.mode.getInteractPrompt()).toBe(t('evacuation.panelPrompt', { key: KEY }));
    // Not briefed again yet: only the ФАКЕЛ-33 crystal note, which the power wakes.
    expect(run.side.hud.setObjective).toHaveBeenLastCalledWith(expect.not.stringContaining('ПРОТОКОЛ 33'), false);
  });

  it('shares the objective corner with the crystal note while exploring, then holds it alone', () => {
    const run = readyRun();
    expect(run.side.hud.setObjective).toHaveBeenLastCalledWith(
      expect.stringMatching(/ФАКЕЛ-33[\s\S]*\n\nПРОТОКОЛ 33/), false);
    fund(run.internals.economy, COST);
    run.mode.onInteract();
    run.mode.update(STEP);
    expect(run.side.hud.setObjective).toHaveBeenLastCalledWith(expect.not.stringContaining('ФАКЕЛ-33'), true);
  });

  it('leaves Burned Mansion without any evacuation', () => {
    const side = makeContext();
    const mode = new ZombiesMode('burned-mansion');
    mode.init(side.ctx);
    const internals = mode as unknown as { evacuation: unknown; arena: ZombieArena };
    expect(internals.evacuation).toBeNull();
    expect(internals.arena.evacuation).toBeUndefined();
    expect(internals.arena.floorTransitions?.every((zone) => zone.targetFloor !== 1)).toBe(true);
  });
});

function makeArena(): Station33Arena {
  const arena = new Station33Arena(new THREE.Scene(), TEST_PROFILE);
  arena.init();
  return arena;
}

const DOORS_TO_TALLER: ReadonlyArray<Station33ZoneId> = ['cocheras', 'subestacion', 'taller'];

function openWayToTaller(arena: ZombieArena): void {
  for (const zone of DOORS_TO_TALLER) {
    const id = STATION33_DOORS.find((door) => door.zone === zone)!.id;
    arena.doors.find((door) => door.id === id)!.tryUnlock(() => true);
    arena.activateDoor(id);
  }
}

/** Footprint of an entrance's dead-end service passage, walls included (as in station33.test.ts). */
function passageBox(barrier: Station33Barrier): THREE.Box3 {
  const halfWidth = SERVICE_PASSAGE.width[barrier.kind] / 2 + STATION33_WALL_THICKNESS;
  const near = STATION33_WALL_THICKNESS / 2;
  const far = near + SERVICE_PASSAGE.length + STATION33_WALL_THICKNESS;
  const a = new THREE.Vector3(barrier.x + barrier.outwardX * near, 0, barrier.z + barrier.outwardZ * near);
  const b = new THREE.Vector3(barrier.x + barrier.outwardX * far, 3, barrier.z + barrier.outwardZ * far);
  const box = new THREE.Box3().setFromPoints([a, b]);
  if (barrier.outwardX !== 0) box.expandByVector(new THREE.Vector3(0, 0, halfWidth));
  else box.expandByVector(new THREE.Vector3(halfWidth, 0, 0));
  return box;
}

const forwardInput = {
  isDown: (code: string) => code === 'KeyW', wasPressed: () => false, mouseDeltaX: 0, mouseDeltaY: 0, moveAxisX: 0, moveAxisY: 0,
} as unknown as Input;

const weaponStub = {
  definition: { ads: { fov: 60, sensitivity: 1 }, moveSpeedMultiplier: 1 },
  adsAlpha: 0,
  recoil: { pitch: 0, yaw: 0 },
} as unknown as Weapon;

/** A player with the arena's walls, bounds and stair, walking forward along `yaw` for `seconds`. */
function walker(arena: Station33Arena, x: number, z: number): (yaw: number, seconds: number) => PlayerController {
  const player = new PlayerController(1);
  player.setWallColliders(arena.wallColliders);
  player.setFloorTransitions(arena.floorTransitions);
  player.teleport(x, EYE_HEIGHT, z, 0, arena.playerBounds);
  return (yaw, seconds) => {
    player.setWallColliders(arena.wallColliders);
    player.face(yaw);
    for (let frame = 0; frame < seconds / DT; frame++) player.update(DT, forwardInput, weaponStub);
    return player;
  };
}

describe('Protocol 33 escape route', () => {
  it('keeps the blast door shut and solid until the escape opens it at once', () => {
    const arena = makeArena();
    openWayToTaller(arena);
    const onTopology = vi.fn();
    arena.onTopologyChanged = onTopology;
    const walk = walker(arena, PROTOCOL33_BLAST_DOOR.x, TALLER.hall.minZ + 1.2);
    expect(walk(FACE_NORTH, 2).rig.position.z).toBeGreaterThan(TALLER.hall.minZ);
    expect(arena.colliders).toContain(arena.evacuation.blastDoorCollider);

    arena.evacuation.showStage('exploration');
    arena.evacuation.showStage('ready');
    expect(onTopology).not.toHaveBeenCalled();
    arena.evacuation.showStage('defending');
    expect(onTopology).toHaveBeenCalledOnce();
    arena.evacuation.showStage('escaping');
    expect(onTopology).toHaveBeenCalledTimes(2);
    expect(arena.evacuation.blastDoorCollider).toBeNull();
    expect(walk(FACE_NORTH, 1.5).rig.position.z).toBeLessThan(PROTOCOL33_ESCAPE.corridorMaxZ - 1);
    // The leaf grinds up into the lintel, out of the way.
    arena.update(4);
    const leaf = arena.group.getObjectByName('protocol33-blast-door-leaf')!;
    expect(leaf.position.y).toBeGreaterThan(PROTOCOL33_BLAST_DOOR.height + 0.5);

    arena.reset();
    expect(leaf.position.y).toBe(0);
    expect(arena.colliders).toContain(arena.evacuation.blastDoorCollider);
  });

  it('climbs to the surface as floor 1 and comes back down to floor 0', () => {
    const arena = makeArena();
    openWayToTaller(arena);
    arena.evacuation.showStage('escaping');
    const walk = walker(arena, PROTOCOL33_BLAST_DOOR.x, -60.5);
    const up = walk(FACE_NORTH, 6);
    expect(up.floor).toBe(1);
    expect(up.rig.position.z).toBeLessThan(PROTOCOL33_SURFACE.yard.maxZ);
    expect(up.rig.position.y).toBeCloseTo(PROTOCOL33_SURFACE_Y + EYE_HEIGHT, 1);
    expect(station33ZoneAt(up.rig.position.x, up.rig.position.z)).toBe('superficie');
    // The yard's fence and the truck hold the player in.
    expect(walk(FACE_NORTH, 8).rig.position.z).toBeGreaterThan(PROTOCOL33_SURFACE_BOUNDS.minZ - 1e-6);
    const down = walk(FACE_SOUTH, 9);
    expect(down.floor).toBe(0);
    expect(down.rig.position.y).toBeCloseTo(EYE_HEIGHT, 1);
  });

  it('keeps the escape and the surface off every zombie entrance and out of the other rooms', () => {
    const arena = makeArena();
    arena.group.updateMatrixWorld(true);
    const escape = new THREE.Box3(
      new THREE.Vector3(PROTOCOL33_ESCAPE.minX - STATION33_WALL_THICKNESS, 0, PROTOCOL33_SURFACE.yard.minZ),
      new THREE.Vector3(PROTOCOL33_ESCAPE.maxX + STATION33_WALL_THICKNESS, PROTOCOL33_SURFACE_Y + 5, PROTOCOL33_ESCAPE.corridorMaxZ),
    );
    for (const barrier of STATION33_BARRIERS) expect(escape.intersectsBox(passageBox(barrier)), barrier.id).toBe(false);
    for (const name of ['escape-wall', 'escape-kiosk-wall', 'surface-fence', 'surface-truck']) {
      arena.group.traverse((object) => {
        if (object.name !== name) return;
        const box = new THREE.Box3().setFromObject(object);
        expect(box.max.z, name).toBeLessThan(TALLER.hall.minZ);
        for (const barrier of STATION33_BARRIERS) expect(box.intersectsBox(passageBox(barrier)), `${name} / ${barrier.id}`).toBe(false);
      });
    }
  });

  it('lets the horde follow the player from the workshop up the stair into the yard', () => {
    const arena = makeArena();
    openWayToTaller(arena);
    arena.evacuation.showStage('escaping');
    const gate = arena.barriers.find((barrier) => barrier.id === 'taller-service-door')!;
    while (!gate.isOpen) gate.damage(gate.boards[0].maxHp);
    const manager = new ZombieManager(() => 0, {}, false, [STATION33_SPAWNS.taller[0]], arena.barriers, arena.floorTransitions, () => 1);
    manager.setNavigationBounds(arena.navigationBounds);
    manager.registerColliders([...arena.colliders]);
    const player = { x: 12, y: PROTOCOL33_SURFACE_Y + EYE_HEIGHT, z: -86 };
    expect(manager.spawnZombie(roundConfig(6), player.x, player.z, 6)).toBe(true);
    const zombie = [...manager.actives][0];
    zombie.state = 'walk';
    let hit = false;
    manager.onPlayerAttack = () => { hit = true; };
    for (let frame = 0; frame < 90 / DT && !hit; frame++) manager.update(DT, player.x, player.z, 1, player.y);
    expect(hit).toBe(true);
    expect(zombie.floor).toBe(1);
    expect(zombie.position.y).toBeCloseTo(PROTOCOL33_SURFACE_Y, 1);
  });

  it('routes the protocol\'s horde through the entrances around the workshop only', () => {
    const arena = makeArena();
    for (const door of arena.doors) {
      door.tryUnlock(() => true);
      arena.activateDoor(door.id);
    }
    const everyEntrance = arena.spawnPoints.length;
    arena.evacuation.showStage('defending');
    const near = new Set(['cocheras', 'subestacion', 'taller'].flatMap((zone) => STATION33_SPAWNS[zone as Station33ZoneId]));
    expect(arena.spawnPoints.length).toBeGreaterThan(0);
    expect(arena.spawnPoints.length).toBeLessThan(everyEntrance);
    for (const spawn of arena.spawnPoints) expect(near.has(spawn as never)).toBe(true);
    arena.reset();
    expect(arena.spawnPoints).toEqual(STATION33_SPAWNS.vestibule);
  });

  it('sounds the alarm on every battery lamp once the defence starts, until a reset', () => {
    const arena = makeArena();
    const emergency = (): number[] => {
      const levels: number[] = [];
      for (let step = 0; step < 40; step++) {
        arena.update(0.05, new THREE.Vector3(0, 1.7, 2));
        arena.group.traverse((object) => {
          if (object instanceof THREE.PointLight && object.visible && object.color.getHex() === 0xff2a12) levels.push(object.intensity);
        });
      }
      return levels;
    };
    const calm = emergency();
    arena.evacuation.showStage('defending');
    const alarm = emergency();
    expect(Math.max(...alarm)).toBeGreaterThan(Math.max(...calm) * 1.3);
    expect(Math.min(...alarm)).toBeLessThan(Math.min(...calm) * 0.5);
    arena.reset();
    expect(Math.max(...emergency())).toBeCloseTo(Math.max(...calm), 3);
  });

  it('opens the air to the surface mood as the observer climbs out, and back', () => {
    const scene = new THREE.Scene();
    const arena = new Station33Arena(scene, TEST_PROFILE);
    arena.init();
    const station = (scene.fog as THREE.FogExp2).density;
    arena.update(0.1, new THREE.Vector3(15, PROTOCOL33_SURFACE_Y + EYE_HEIGHT, -88));
    expect((scene.fog as THREE.FogExp2).density).toBeCloseTo(PROTOCOL33_SURFACE_AMBIENCE.fog.density, 6);
    expect((scene.background as THREE.Color).getHex()).toBe(PROTOCOL33_SURFACE_AMBIENCE.backgroundColor);
    arena.update(0.1, new THREE.Vector3(15, EYE_HEIGHT, -58));
    expect((scene.fog as THREE.FogExp2).density).toBeCloseTo(station, 6);
    arena.update(0.1, new THREE.Vector3(15, PROTOCOL33_SURFACE_Y + EYE_HEIGHT, -88));
    arena.reset();
    expect((scene.fog as THREE.FogExp2).density).toBeCloseTo(station, 6);
  });
});
