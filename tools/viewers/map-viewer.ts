import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { isZombieMapId, ZOMBIE_MAPS } from '../../src/config/zombieMaps';
import { getDeviceProfile } from '../../src/core/DeviceProfile';
import type { ZombieArena } from '../../src/zombies/maps/ZombieArena';

/**
 * Dev-only map inspection harness (never shipped to the game bundle): builds
 * a Zombies arena with the game's renderer settings, opens every paid door
 * and renders it from a fixed camera, so a zone can be reviewed without
 * playing up to it. The arena keeps animating (flicker, dust, drips).
 *
 *   /tools/viewers/map-viewer.html?map=station-33&cam=11,1.7,-3&look=11,1.6,-20
 *   &quality=low|medium|high picks the device tier; &doors=0 keeps doors shut;
 *   &power=1 throws the map's main switch (when it has one).
 */

const params = new URLSearchParams(location.search);
const requested = params.get('map');
const mapId = isZombieMapId(requested) ? requested : 'station-33';
const quality = (['low', 'medium', 'high'] as const).find((level) => level === params.get('quality')) ?? 'high';

function vectorParam(key: string, fallback: readonly number[]): THREE.Vector3 {
  const parts = (params.get(key) ?? '').split(',').map(Number);
  return new THREE.Vector3(...(parts.length === 3 && parts.every(Number.isFinite) ? parts : fallback));
}

const profile = getDeviceProfile(undefined, quality);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = profile.useReducedEffects ? 1.0 : 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = !profile.useReducedEffects;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

const arena: ZombieArena = ZOMBIE_MAPS[mapId].createArena(scene, profile);
scene.add(arena.group);
arena.init();
if (params.get('doors') !== '0') {
  for (const door of arena.doors) {
    if (door.tryUnlock(() => true).success) arena.activateDoor(door.id);
  }
}

const camera = new THREE.PerspectiveCamera(Number(params.get('fov') ?? 70), window.innerWidth / window.innerHeight, 0.08, 700);
camera.position.copy(vectorParam('cam', [arena.playerSpawn.x, arena.playerSpawn.y, arena.playerSpawn.z]));
camera.lookAt(vectorParam('look', [arena.playerSpawn.x, arena.playerSpawn.y, arena.playerSpawn.z - 5]));

if (params.get('power') === '1') arena.powerSwitch?.activate();

// Settle the doors' burst (and the lever) before the first frame: slow previews render only a few frames a second.
for (let step = 0; step < 150; step++) arena.update(1 / 30, camera.position);

const status = document.getElementById('status')!;
status.textContent = `${mapId} · ${quality} · cam ${camera.position.toArray().map((value) => value.toFixed(1)).join(',')}`;

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  // The camera stands in for the player: the real lights follow it between rooms.
  arena.update(Math.min(clock.getDelta(), 0.1), camera.position);
  renderer.render(scene, camera);
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
