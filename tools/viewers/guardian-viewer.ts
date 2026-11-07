import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CaptainUssrState } from '../../src/zombies/guardians/CaptainUssrBrain';
import { CaptainUssrView, type CaptainUssrSnapshot } from '../../src/zombies/guardians/CaptainUssrView';

// Development-only visual review of CAPITÁN URSS, independent of the game entry/bundle.
// /tools/viewers/guardian-viewer.html plays a scripted fight in a loop: perch, roar, leap, march, bash,
// throw, charge, crash, death. ?state=bashWindup loops one state where it stands | ?phase=3 (red fury)
// | ?slow=4 (four times slower) | ?close=1 (his face) | ?shadows=0 (the reduced-effects profile).
const params = new URLSearchParams(location.search);
const phase = (Math.min(3, Math.max(1, Number(params.get('phase')) || 1))) as 1 | 2 | 3;
const slow = Math.max(1, Number(params.get('slow')) || 1);
const close = params.get('close') === '1';
const shadows = params.get('shadows') !== '0';

type Boss = { -readonly [K in keyof CaptainUssrSnapshot]: CaptainUssrSnapshot[K] };

/** One beat of the scripted fight: a state for `seconds`, its speed and heading, and where it moves. */
interface Beat {
  readonly state: CaptainUssrState;
  readonly seconds: number;
  readonly speed?: number;
  readonly heading?: number;
  readonly from?: { readonly x: number; readonly z: number };
  readonly to?: { readonly x: number; readonly z: number };
}

const LEAP_FROM = new THREE.Vector3(0, 6, -11);
const FIGHT: readonly Beat[] = [
  { state: 'dormant', seconds: 2.2 },
  { state: 'arriving', seconds: 1.5, from: { x: 0, z: -3 } },
  { state: 'stalking', seconds: 1.4 },
  { state: 'stalking', seconds: 2.5, speed: 2, from: { x: 0, z: -3 }, to: { x: 0, z: 2 } },
  { state: 'bashWindup', seconds: 0.55 },
  { state: 'recovering', seconds: 0.6 },
  { state: 'stalking', seconds: 0.8 },
  { state: 'throwWindup', seconds: 0.75 },
  { state: 'shieldFlight', seconds: 1.6 },
  { state: 'recovering', seconds: 0.45 },
  { state: 'stalking', seconds: 0.8, heading: Math.PI },
  { state: 'chargeWindup', seconds: 1, heading: Math.PI },
  { state: 'charging', seconds: 1, speed: 11, heading: Math.PI, from: { x: 0, z: 2 }, to: { x: 0, z: -9 } },
  { state: 'stunned', seconds: 3, heading: Math.PI },
  { state: 'stalking', seconds: 1, heading: Math.PI },
  { state: 'defeated', seconds: 6, heading: Math.PI },
];
const single = params.get('state') as CaptainUssrState | null;
const SINGLE_SECONDS: Partial<Record<CaptainUssrState, number>> = { stalking: 4, stunned: 3, defeated: 6 };
const beats: readonly Beat[] = single
  ? [{ state: single, seconds: SINGLE_SECONDS[single] ?? 1.2, speed: single === 'stalking' || single === 'charging' ? 2 : 0 }]
  : FIGHT;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = shadows;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b222b);
scene.fog = new THREE.Fog(0x1b222b, 14, 34);
scene.add(new THREE.HemisphereLight(0xb9c8d8, 0x3b3530, 1.1));
const moon = new THREE.DirectionalLight(0xdfe8f5, 2.4);
moon.position.set(-4, 7, 5);
moon.castShadow = shadows;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 30 });
scene.add(moon);
const lamp = new THREE.PointLight(0xffb070, 18, 12);
lamp.position.set(3, 3.5, 2);
scene.add(lamp);
const snow = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0xc4c9cf, roughness: 1 }));
snow.rotation.x = -Math.PI / 2;
snow.receiveShadow = true;
scene.add(snow);
// The perch he leaps from: a pole like Station 33's power line.
const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, LEAP_FROM.y, 10), new THREE.MeshStandardMaterial({ color: 0x3a3029, roughness: 0.9 }));
pole.position.set(LEAP_FROM.x, LEAP_FROM.y / 2 - 0.05, LEAP_FROM.z);
pole.castShadow = shadows;
scene.add(pole);

const view = new CaptainUssrView(shadows);
scene.add(view.group);
const camera = new THREE.PerspectiveCamera(close ? 30 : 42, 1, 0.05, 80);
camera.position.set(close ? 0.6 : 3.6, close ? 2.15 : 1.9, close ? 1.8 : 5.4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, close ? 2.1 : 1.2, 0);
controls.enablePan = false;

const boss: Boss = {
  state: 'dormant', stateProgress: 0, position: { x: 0, z: 0 }, heading: 0, speed: 0,
  shieldHeld: true, shield: { x: 0, z: 0 }, phase,
};
const follow = new THREE.Vector3();
let beatIndex = 0;
let beatTime = 0;

/** Moves the scripted fight on by `dt`: its beat, its march, the thrown shield. */
function script(dt: number): void {
  beatTime += dt;
  if (beatTime >= beats[beatIndex].seconds) {
    beatTime = 0;
    beatIndex = (beatIndex + 1) % beats.length;
    if (beatIndex === 0) {
      view.reset();
      if (!single) view.perch(LEAP_FROM, 0);
    }
    const beat = beats[beatIndex];
    if (beat.state === 'arriving') boss.position = { ...beat.from! };
    if (beat.state === 'stunned' && !single) view.crash();
  }
  const beat = beats[beatIndex];
  const progress = beatTime / beat.seconds;
  boss.state = beat.state;
  boss.stateProgress = progress;
  boss.speed = beat.speed ?? 0;
  boss.heading = beat.heading ?? 0;
  if (beat.from && beat.to) boss.position = { x: THREE.MathUtils.lerp(beat.from.x, beat.to.x, progress), z: THREE.MathUtils.lerp(beat.from.z, beat.to.z, progress) };
  boss.shieldHeld = beat.state !== 'shieldFlight';
  // The thrown shield flies 8 m out and back.
  const reach = Math.sin(Math.PI * Math.min(1, progress / 0.85)) * 8;
  boss.shield = beat.state === 'shieldFlight'
    ? { x: boss.position.x + Math.sin(boss.heading) * reach, z: boss.position.z + Math.cos(boss.heading) * reach }
    : { ...boss.position };
  if (beat.state === 'dormant' && beatTime >= 0.6 && beatTime - dt < 0.6) view.roar();
}

function resize(): void {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
resize();
window.addEventListener('resize', resize);
if (!single) view.perch(LEAP_FROM, 0);

let previous = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - previous) / 1000) / slow;
  previous = now;
  script(dt);
  view.update(dt, boss, 0, LEAP_FROM);
  // The camera follows him at a distance, still orbitable.
  if (!close && boss.state !== 'dormant') {
    follow.set(boss.position.x, 1.2, boss.position.z).sub(controls.target).multiplyScalar(1 - Math.exp(-2.5 * dt));
    controls.target.add(follow);
    camera.position.add(follow);
  }
  controls.update();
  renderer.render(scene, camera);
  document.getElementById('status')!.textContent =
    `${boss.state} · ${(boss.stateProgress * 100).toFixed(0)} % · fase ${phase} · ${renderer.info.render.calls} draws · ${renderer.info.render.triangles} triángulos`;
});
