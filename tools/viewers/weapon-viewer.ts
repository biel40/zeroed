import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { AssetManager } from '../../src/assets/AssetManager';
import { WEAPON_DEFINITIONS } from '../../src/config/weapons';
import { isZombieMapId, ZOMBIE_MAPS } from '../../src/config/zombieMaps';
import { getDeviceProfile } from '../../src/core/DeviceProfile';
import type { ZombieArena } from '../../src/zombies/maps/ZombieArena';
import { KNIFE_ATTACK_DURATION, KNIFE_HIT_MOMENT, Knife } from '../../src/weapons/Knife';
import { ARM_DETAIL } from '../../src/weapons/FirstPersonArm';
import { ViewArms } from '../../src/weapons/ViewArms';
import { Weapon } from '../../src/weapons/Weapon';
import { WeaponView } from '../../src/weapons/WeaponView';
import type { WeaponId } from '../../src/weapons/WeaponTypes';

/**
 * Dev-only visual verification harness (never shipped to the game bundle):
 * serves first-person view models for headless screenshot review on the
 * Vite dev server. Mirrors the game renderer (ACES tone mapping,
 * RoomEnvironment IBL) so screenshots compare with in-game footage.
 *
 *   /tools/viewers/weapon-viewer.html?weapon=ak47&view=pov       hip POV (left) + ADS POV (right)
 *   /tools/viewers/weapon-viewer.html?weapon=m60&view=external  3/4 silhouette, hip | ADS slots
 *   /tools/viewers/weapon-viewer.html?weapon=ak47&view=closeup  tight frame on receiver + barrel
 *   /tools/viewers/weapon-viewer.html?weapon=m1911&view=knife   knife slash phases (&t=0.3 one frame, &play=1&slow=4 loops)
 *   /tools/viewers/weapon-viewer.html?weapon=ak47&view=reload   empty-reload phases with both hands (&t=0.5 one frame)
 *   /tools/viewers/weapon-viewer.html?weapon=m4a1&view=rig      first-person rig from outside (&pose=ads, &cam=, &look=, &fov=)
 *   First-person views draw the arms; &arms=0 hides them, &detail=mobile|lowMemory picks the tier.
 *   &pose=hip|ads shows one POV; &map=station-33&worldCam=x,y,z&worldLook=x,y,z uses real map lighting.
 */

const params = new URLSearchParams(location.search);
const weaponId = (params.get('weapon') ?? 'ak47') as WeaponId;
const mode = params.get('view') ?? 'pov';
const definition = WEAPON_DEFINITIONS[weaponId];
const requestedMap = params.get('map');
const mapId = isZombieMapId(requestedMap) && ['pov', 'reload', 'knife'].includes(mode) ? requestedMap : null;
const arenas = new Map<THREE.Scene, ZombieArena>();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = mapId !== null;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);
const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

function makeScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14181e);
  scene.environment = envTexture;
  scene.environmentIntensity = 0.45;
  if (mapId) {
    const arena: ZombieArena = ZOMBIE_MAPS[mapId].createArena(scene, getDeviceProfile(undefined, 'high'));
    scene.add(arena.group);
    arena.init();
    if (params.get('power') === '1') arena.powerSwitch?.activate();
    arenas.set(scene, arena);
    return scene;
  }
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(2, 3, 1.5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xbfd0e0, 0.4);
  fill.position.set(-2.5, 0.5, 1);
  scene.add(fill);
  return scene;
}

const url = definition.view.modelUrl;
const assets = new AssetManager(8);
await assets.loadAll({ weapons: url ? [{ id: weaponId, url }] : [], textures: [], zombies: [] }, () => {});

interface Slot {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  view: WeaponView;
  weapon: Weapon;
  /** First-person arms, absent in the external/closeup views and with arms=0. */
  arms: ViewArms | null;
  /** Knife review: fixed attack progress, or -1 for a looping attack. */
  knife?: { knife: Knife; progress: number };
  label?: string;
  /** Rig review: renders the first-person rig from this outside camera. */
  external?: THREE.PerspectiveCamera;
}

/** Optional camera overrides make zone inspections a URL change only. */
function vectorParam(key: string): number[] | null {
  const raw = params.get(key);
  if (!raw) return null;
  const parts = raw.split(',').map(Number);
  return parts.length === 3 && parts.every(Number.isFinite) ? parts : null;
}

function makeWeapon(ads: boolean): Weapon {
  const weapon = new Weapon(definition, () => 0.5);
  if (ads) {
    // Drive the ADS blend to completion (speed ~8-12/s → well under 1.5 s).
    for (let index = 0; index < 90; index++) weapon.update(1 / 60, { trigger: false, ads: true });
  }
  return weapon;
}

/** Weapon frozen at `progress` of an empty (action-working) reload. */
function makeReloading(progress: number): Weapon {
  const weapon = new Weapon(definition, () => 0.5);
  weapon.ammoInMagazine = 0;
  weapon.reload();
  weapon.update(progress * definition.reloadTime, { trigger: false, ads: false });
  return weapon;
}

function makeView(): WeaponView {
  const cached = assets.getWeaponModel(weaponId);
  // Clone BEFORE attach: WeaponView normalizes/mutates the scene it gets,
  // and the cached GLB must stay pristine for the other slots.
  const view = new WeaponView(definition, cached ? cached.clone(true) : null, null);
  view.root.visible = true;
  return view;
}

const detailName = params.get('detail') ?? 'desktop';
const armDetail = ARM_DETAIL[detailName as keyof typeof ARM_DETAIL] ?? ARM_DETAIL.desktop;
const withArms = params.get('arms') !== '0';

/** First-person slot on the game camera rig (75 deg, near 0.08), crosshair dot included. */
function makePovSlot(weapon: Weapon, fov = 75, label?: string): Slot {
  const scene = makeScene();
  const view = makeView();
  const camera = new THREE.PerspectiveCamera(Number(params.get('fov') ?? fov), 16 / 9, 0.08, 50);
  const arena = arenas.get(scene);
  if (arena) {
    const spawn = arena.playerSpawn;
    const [x, y, z] = vectorParam('worldCam') ?? [spawn.x, spawn.y, spawn.z];
    const [tx, ty, tz] = vectorParam('worldLook') ?? [x, y, z - 1];
    camera.position.set(x, y, z);
    camera.lookAt(tx, ty, tz);
    // Settle the map's lights before reviewing the static weapon pose.
    for (let step = 0; step < 150; step++) arena.update(1 / 30, camera.position);
  }
  const crosshair = new THREE.Mesh(
    new THREE.RingGeometry(0.002, 0.0035, 16),
    new THREE.MeshBasicMaterial({ color: 0xff3b30, depthTest: false }),
  );
  crosshair.position.z = -0.4;
  crosshair.renderOrder = 10;
  camera.add(view.root, crosshair);
  const arms = withArms ? new ViewArms(armDetail) : null;
  if (arms) camera.add(arms.root);
  scene.add(camera);
  return { scene, camera, view, weapon, arms, label };
}

const slots: Slot[] = [];
const KNIFE_SAMPLES = [0.06, 0.15, 0.25, KNIFE_HIT_MOMENT / KNIFE_ATTACK_DURATION, 0.4, 0.55, 0.7, 0.88];
const RELOAD_SAMPLES = [0.04, 0.1, 0.2, 0.3, 0.42, 0.5, 0.6, 0.7, 0.8, 0.9, 0.97, 1];
const GRID_COLUMNS = 4;
const knifeSlowdown = Number(params.get('slow') ?? 1) || 1;
const single = Number(params.get('t') ?? NaN);

if (mode === 'pov') {
  // Exactly what the player sees: the view model rides the camera.
  const poses = params.get('pose') === 'ads' ? [true] : params.get('pose') === 'hip' || mapId ? [false] : [false, true];
  for (const ads of poses) slots.push(makePovSlot(makeWeapon(ads), ads ? definition.ads.fov : 75));
} else if (mode === 'knife') {
  const progresses = params.has('play') ? [-1] : Number.isFinite(single) ? [single]
    : mapId ? [KNIFE_HIT_MOMENT / KNIFE_ATTACK_DURATION] : KNIFE_SAMPLES;
  for (const progress of progresses) {
    const slot = makePovSlot(makeWeapon(false), 75, `${(progress * 100).toFixed(1)}%`);
    const knife = new Knife();
    knife.setEnabled(true);
    slot.camera.add(knife.root);
    slot.knife = { knife, progress };
    slots.push(slot);
  }
} else if (mode === 'rig') {
  // The first-person rig seen from outside: arm reach, elbows, near-plane clearance.
  const slot = makePovSlot(Number.isFinite(single) ? makeReloading(Math.min(single, 0.999)) : makeWeapon(params.get('pose') === 'ads'));
  const external = new THREE.PerspectiveCamera(Number(params.get('fov') ?? 40), window.innerWidth / window.innerHeight, 0.01, 50);
  const [cx, cy, cz] = vectorParam('cam') ?? [1.1, 0.25, 0.15];
  const [lx, ly, lz] = vectorParam('look') ?? [0.05, -0.28, -0.35];
  external.position.set(cx, cy, cz);
  external.lookAt(lx, ly, lz);
  slot.external = external;
  slots.push(slot);
} else if (mode === 'reload') {
  // Empty-reload phases with both hands; &t= shows one frame.
  // Map QA uses one sample so a grid never instantiates twelve full arenas.
  const progresses = Number.isFinite(single) ? [single] : mapId ? [0.1] : RELOAD_SAMPLES;
  for (const progress of progresses) {
    slots.push(makePovSlot(makeReloading(Math.min(progress, 0.999)), 75, `${(progress * 100).toFixed(0)}%`));
  }
} else {
  const scene = makeScene();
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.01, 50);
  if (mode === 'closeup') {
    const weapon = makeWeapon(params.get('pose') === 'ads');
    const view = makeView();
    scene.add(view.root);
    slots.push({ scene, camera, view, weapon, arms: null });
    const [cx, cy, cz] = vectorParam('cam') ?? [0.55, 0.08, -0.45];
    const [lx, ly, lz] = vectorParam('look') ?? [0.22, -0.06, -0.85];
    camera.position.set(cx, cy, cz);
    camera.lookAt(lx, ly, lz);
  } else {
    // external: hip slot left, ADS slot right, 3/4 from behind-right-above.
    for (const [x, ads] of [
      [-0.55, false],
      [0.55, true],
    ] as const) {
      const weapon = makeWeapon(ads);
      const view = makeView();
      const rig = new THREE.Group();
      rig.position.set(x, 0, 0);
      rig.add(view.root);
      scene.add(rig);
      slots.push({ scene, camera, view, weapon, arms: null });
    }
    camera.position.set(0.85, 0.3, 1.05);
    camera.lookAt(0, -0.12, -0.3);
  }
}

const grid = (mode === 'knife' || mode === 'reload') && slots.length > 1;
if (grid) {
  for (const [index, slot] of slots.entries()) {
    const label = document.createElement('div');
    label.textContent = slot.label ?? '';
    const row = Math.floor(index / GRID_COLUMNS);
    label.style.cssText = `position:fixed;color:#fff;font:12px monospace;`
      + `left:${(index % GRID_COLUMNS) * (100 / GRID_COLUMNS) + 0.5}vw;`
      + `top:calc(${row} * ${100 / GRID_COLUMNS}vw * 9 / 16 + 4px)`;
    document.body.appendChild(label);
  }
}
// Draw calls and triangles of the frame, for the arm budget checks.
const stats = document.createElement('div');
stats.id = 'viewer-stats';
stats.style.cssText = 'position:fixed;right:6px;bottom:4px;color:#9fe;font:12px monospace';
document.body.appendChild(stats);
renderer.info.autoReset = false;

function poseKnife({ knife, progress }: NonNullable<Slot['knife']>): void {
  if (progress < 0) {
    if (!knife.isAttacking) knife.trigger();
    knife.update(1 / 60 / knifeSlowdown, false, 0);
    return;
  }
  knife.reset();
  knife.setEnabled(true);
  knife.trigger();
  knife.update(progress * KNIFE_ATTACK_DURATION, false, 0);
}

function frame(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  for (const slot of slots) {
    arenas.get(slot.scene)?.update(1 / 60, slot.camera.position);
    if (slot.knife) poseKnife(slot.knife);
    const melee = slot.knife?.knife ?? null;
    slot.view.update(1 / 60, slot.weapon, 0, 0, 0, melee?.firearmLowering ?? 0);
    slot.arms?.update(1 / 60, slot.view, melee);
  }
  renderer.info.reset();
  if (grid) {
    const cellWidth = width / GRID_COLUMNS;
    const cellHeight = (cellWidth * 9) / 16;
    renderer.setScissorTest(true);
    for (const [index, slot] of slots.entries()) {
      const x = (index % GRID_COLUMNS) * cellWidth;
      const y = height - (Math.floor(index / GRID_COLUMNS) + 1) * cellHeight;
      renderer.setViewport(x, y, cellWidth - 2, cellHeight - 2);
      renderer.setScissor(x, y, cellWidth - 2, cellHeight - 2);
      renderer.render(slot.scene, slot.camera);
    }
    renderer.setScissorTest(false);
  } else if (mode === 'pov' && slots.length === 2) {
    renderer.setScissorTest(true);
    for (const [index, slot] of slots.entries()) {
      const x = index * (width / 2);
      slot.camera.aspect = width / 2 / height;
      slot.camera.updateProjectionMatrix();
      renderer.setViewport(x, 0, width / 2, height);
      renderer.setScissor(x, 0, width / 2, height);
      renderer.render(slot.scene, slot.camera);
    }
    renderer.setScissorTest(false);
  } else {
    const camera = slots[0].external ?? slots[0].camera;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.render(slots[0].scene, camera);
  }
  const { calls, triangles } = renderer.info.render;
  stats.textContent = `${slots.length} slot(s): ${calls} draw calls, ${triangles} tris`;
  requestAnimationFrame(frame);
}
frame();
