import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ZombieState } from '../../src/zombies/Zombie';
import { ZOMBIE_ATTACK_DURATION, ZOMBIE_BARRIER_ATTACK_RECOVERY } from '../../src/zombies/ZombieConfig';
import { resolveClip, ZombieVisual, ZOMBIE_MODELS } from '../../src/zombies/ZombieVisual';

// Development-only visual review, independent of the game entry/bundle.
// /tools/viewers/zombie-viewer.html?time=0.3 | ?state=attack&time=0.475 | ?state=barrierAttack | ?close=1 | ?night=1
const params = new URLSearchParams(location.search);
const close = params.has('close');
const night = params.has('night');
const modelId = params.get('model') === 'brute' ? 'brute' : 'walker';
const speed = params.has('speed') ? Math.max(0, Number(params.get('speed')) || 0) : ZOMBIE_MODELS[modelId].walkReferenceSpeed;
const requestedState = params.get('state');
const state: ZombieState =
  requestedState === 'attack' || requestedState === 'barrierAttack' || requestedState === 'death' ? requestedState : 'walk';
const fixedTime = params.has('time') ? Math.max(0, Number(params.get('time')) || 0) : null;
let cycleTime = 0;
let displayedState: ZombieState = state;
const cycleDuration = ZOMBIE_ATTACK_DURATION + ZOMBIE_BARRIER_ATTACK_RECOVERY;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(night ? 0x11100e : 0x30353a);
scene.add(new THREE.HemisphereLight(0xc6d5e2, 0x574635, night ? 0.5 : 1.4));
const key = new THREE.DirectionalLight(0xffe4c5, night ? 1 : 2.8);
key.position.set(-2, 4, 3);
scene.add(key);
const fill = new THREE.DirectionalLight(0xc9dcec, night ? 0.2 : 1);
fill.position.set(3, 2, -1);
scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x343432, roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.003;
scene.add(floor);
const camera = new THREE.PerspectiveCamera(close ? 32 : 38, innerWidth / innerHeight, 0.01, 30);
camera.position.set(0, close ? 1.57 : 1.25, close ? 1.05 : 3.65 * ZOMBIE_MODELS[modelId].height / 1.78);
camera.lookAt(0, close ? 1.55 : 0.91, 0);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, close ? 1.55 : 0.91, 0);
controls.enablePan = false;
controls.minDistance = close ? 0.55 : 2.3;
controls.maxDistance = 7;
controls.maxPolarAngle = Math.PI * 0.52;
const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}${ZOMBIE_MODELS[modelId].url}`);
const visuals: ZombieVisual[] = [];
const placements: THREE.Group[] = [];
const referenceMixers = new Map<ZombieVisual, THREE.AnimationMixer>();
for (const [index, yaw] of (close ? [0] : [0, 0.75, Math.PI / 2]).entries()) {
  const visual = new ZombieVisual(modelId, { scene: gltf.scene, clips: gltf.animations }, ZOMBIE_MODELS[modelId].tints[0], false);
  visual.setZombieType(modelId === 'brute' ? 'brute' : params.has('shiny') || (params.has('compare') && index === 0) ? 'shiny' : 'normal');
  visual.setWalkPhase(THREE.MathUtils.euclideanModulo(
    (Number(params.get('variant')) || index) * 0.37,
    1,
  ));
  visual.setAttackDuration(ZOMBIE_ATTACK_DURATION);
  visual.setAttackReach(0.3);
  visual.setStrikeTarget(0, 1.3, state === 'barrierAttack' ? 0.9 : 1.35);
  visual.setState(state);
  if (params.has('source')) {
    const mixer = new THREE.AnimationMixer(visual.root);
    const clip = resolveClip(gltf.animations, speed === 0 ? ['ZombieIdle', 'BruteWalk'] : speed > 2.4 ? ['ZombieRun', 'BruteWalk'] : ['ZombieWalk', 'BruteWalk']);
    if (clip) mixer.clipAction(clip).play();
    referenceMixers.set(visual, mixer);
  }
  const placement = new THREE.Group();
  placement.position.x = close ? 0 : (index - 1) * ZOMBIE_MODELS[modelId].height * 0.53;
  placement.rotation.y = yaw;
  placement.add(visual.root);
  scene.add(placement);
  placements.push(placement);
  visuals.push(visual);
  if (fixedTime !== null) advanceVisual(visual, fixedTime);
}
function advanceVisual(visual: ZombieVisual, elapsed: number): void {
  const reference = referenceMixers.get(visual);
  if (reference) { reference.update(elapsed); return; }
  if (state === 'walk' || state === 'death') {
    visual.update(elapsed, state === 'walk' ? speed : 0);
    return;
  }
  let remaining = elapsed;
  let phase = cycleTime;
  while (remaining > 0) {
    const attacking = phase < ZOMBIE_ATTACK_DURATION;
    const boundary = attacking ? ZOMBIE_ATTACK_DURATION : cycleDuration;
    const step = Math.min(remaining, boundary - phase, 1 / 60);
    displayedState = attacking ? state : 'walk';
    visual.setState(displayedState);
    visual.update(step, 0);
    remaining -= step;
    phase += step;
    if (phase >= cycleDuration) phase = 0;
  }
}
function resize(): void {
  const compact = innerWidth < 700;
  camera.aspect = innerWidth / innerHeight;
  camera.position.set(0, close ? 1.57 : 1.25, close ? Math.max(1.05, 0.25 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect)) : 3.65 * ZOMBIE_MODELS[modelId].height / 1.78);
  camera.updateProjectionMatrix();
  for (const [index, placement] of placements.entries()) {
    placement.visible = !compact || index === 0;
    placement.position.x = close || compact ? 0 : (index - 1) * ZOMBIE_MODELS[modelId].height * 0.53;
  }
  controls.update();
  renderer.setSize(innerWidth, innerHeight);
}
resize();
let previous = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - previous) / 1000);
  previous = now;
  if (fixedTime === null) {
    for (const visual of visuals) advanceVisual(visual, dt);
    cycleTime = (cycleTime + dt) % cycleDuration;
  }
  renderer.render(scene, camera);
  document.getElementById('status')!.textContent = `${displayedState} · ${fixedTime === null ? 'animado' : `${fixedTime.toFixed(3)} s`} · ${renderer.info.render.calls} draws · ${renderer.info.render.triangles} triángulos`;
});
window.addEventListener('resize', resize);
