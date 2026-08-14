import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { AssetManager } from './assets/AssetManager';
import { WEAPON_DEFINITIONS } from './config/weapons';
import { Weapon } from './weapons/Weapon';
import { WeaponView } from './weapons/WeaponView';
import type { WeaponId } from './weapons/WeaponTypes';

/**
 * Dev-only visual verification harness (never shipped to the game bundle):
 * serves first-person view models for headless screenshot review on the
 * Vite dev server. Mirrors the game renderer (ACES tone mapping,
 * RoomEnvironment IBL) so screenshots compare with in-game footage.
 *
 *   /viewer.html?weapon=ak47&view=pov       hip POV (left) + ADS POV (right)
 *   /viewer.html?weapon=m60&view=external   3/4 silhouette, hip | ADS slots
 *   /viewer.html?weapon=ak47&view=closeup   tight frame on receiver + barrel
 */

const params = new URLSearchParams(location.search);
const weaponId = (params.get('weapon') ?? 'ak47') as WeaponId;
const mode = params.get('view') ?? 'pov';
const definition = WEAPON_DEFINITIONS[weaponId];

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);
const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

function makeScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14181e);
  scene.environment = envTexture;
  scene.environmentIntensity = 0.45;
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
}

function makeWeapon(ads: boolean): Weapon {
  const weapon = new Weapon(definition, () => 0.5);
  if (ads) {
    // Drive the ADS blend to completion (speed ~8-12/s → well under 1.5 s).
    for (let i = 0; i < 90; i++) weapon.update(1 / 60, { trigger: false, ads: true });
  }
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

const slots: Slot[] = [];

if (mode === 'pov') {
  // Exactly what the player sees: the view model rides the camera.
  for (const ads of [false, true]) {
    const scene = makeScene();
    const weapon = makeWeapon(ads);
    const view = makeView();
    const camera = new THREE.PerspectiveCamera(ads ? definition.ads.fov : 75, 1, 0.01, 50);
    camera.add(view.root);
    scene.add(camera);
    slots.push({ scene, camera, view, weapon });
  }
} else {
  const scene = makeScene();
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.01, 50);
  if (mode === 'closeup') {
    const weapon = makeWeapon(params.get('pose') === 'ads');
    const view = makeView();
    scene.add(view.root);
    slots.push({ scene, camera, view, weapon });
    // Optional camera overrides make zone inspections a URL change only.
    const nums = (key: string): number[] | null => {
      const raw = params.get(key);
      if (!raw) return null;
      const parts = raw.split(',').map(Number);
      return parts.length === 3 && parts.every(Number.isFinite) ? parts : null;
    };
    const [cx, cy, cz] = nums('cam') ?? [0.55, 0.08, -0.45];
    const [lx, ly, lz] = nums('look') ?? [0.22, -0.06, -0.85];
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
      slots.push({ scene, camera, view, weapon });
    }
    camera.position.set(0.85, 0.3, 1.05);
    camera.lookAt(0, -0.12, -0.3);
  }
}

function frame(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  for (const { view, weapon } of slots) view.update(1 / 60, weapon, 0, 0, 0);
  if (mode === 'pov' && slots.length === 2) {
    renderer.setScissorTest(true);
    for (const [i, slot] of slots.entries()) {
      const x = i * (w / 2);
      slot.camera.aspect = w / 2 / h;
      slot.camera.updateProjectionMatrix();
      renderer.setViewport(x, 0, w / 2, h);
      renderer.setScissor(x, 0, w / 2, h);
      renderer.render(slot.scene, slot.camera);
    }
    renderer.setScissorTest(false);
  } else {
    renderer.render(slots[0].scene, slots[0].camera);
  }
  requestAnimationFrame(frame);
}
frame();
console.info('[viewer] ready:', weaponId, mode);
