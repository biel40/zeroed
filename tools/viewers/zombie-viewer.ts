import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ZombieState } from '../../src/zombies/Zombie';
import { ZOMBIE_ATTACK_DURATION, ZOMBIE_BARRIER_ATTACK_RECOVERY, ZOMBIE_ELECTRIFIED_DURATION } from '../../src/zombies/ZombieConfig';
import { resolveClip, ZombieVisual, ZOMBIE_MODELS } from '../../src/zombies/ZombieVisual';
import { ZOMBIE_FALL_STYLES, type ZombieFallStyle } from '../../src/zombies/ZombieDeath';
import { createSkinnedWalkerSource } from '../../src/zombies/skins/ZombieSkinBuilder';
import { ZOMBIE_SKINS, type ZombieSkinId } from '../../src/zombies/skins/ZombieSkinCatalog';
import { STATION33_ZOMBIE_EYES } from '../../src/zombies/maps/Station33Config';
import { ZombieHat } from '../../src/zombies/skins/ZombieHat';

// Development-only visual review, independent of the game entry/bundle.
// /tools/viewers/zombie-viewer.html?time=0.3 | ?state=attack&time=0.475 | ?state=barrierAttack | ?close=1 | ?night=1
// ?state=death&death=all (every style in a row) | ?state=death&death=slash&time=0.6 (one frame of one style)
// ?electric=1 keeps ZEUS-77 residual arcs on the bodies (shock deaths always carry them)
// ?skin=fieldOfficer dresses the walkers in one skin | ?skin=all lines every skin up in a row | ?redEyes=1 uses Station 33's eyes
const params = new URLSearchParams(location.search);
const close = params.has('close');
const night = params.has('night');
const modelId = params.get('model') === 'brute' ? 'brute' : 'walker';
const height = ZOMBIE_MODELS[modelId].height;
const speed = params.has('speed') ? Math.max(0, Number(params.get('speed')) || 0) : ZOMBIE_MODELS[modelId].walkReferenceSpeed;
const requestedState = params.get('state');
const state: ZombieState =
  requestedState === 'attack' || requestedState === 'barrierAttack' || requestedState === 'death' ? requestedState : 'walk';
const fixedTime = params.has('time') ? Math.max(0, Number(params.get('time')) || 0) : null;
const deathParam = params.get('death');
const allDeaths = state === 'death' && deathParam === 'all';
const deathStyle: ZombieFallStyle = ZOMBIE_FALL_STYLES.find((style) => style === deathParam) ?? 'knockback';
/** Death review loop: walk briefly, fall, hold the corpse, repeat. */
const DEATH_LEAD = 0.4;
const DEATH_CYCLE = 3.2;
const ROW_SPACING = 1.45;
const electric = params.has('electric');
const skinParam = params.get('skin');
const allSkins = modelId === 'walker' && skinParam === 'all';
const eyes = params.has('redEyes') ? STATION33_ZOMBIE_EYES : undefined;
const singleSkin = modelId === 'walker' && skinParam !== null && Object.hasOwn(ZOMBIE_SKINS, skinParam)
  ? skinParam as ZombieSkinId
  : null;
/** Lineups (every death style or every skin) share the row camera. */
const lineup = allDeaths || allSkins;
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
const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 20), new THREE.MeshStandardMaterial({ color: 0x343432, roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.003;
scene.add(floor);
// Close-ups frame the face of either model; Brutus hunches below its height.
const faceY = modelId === 'brute' ? 2.02 : 1.55;
const camera = new THREE.PerspectiveCamera(close ? 32 : 38, innerWidth / innerHeight, 0.01, 40);
const lookY = close ? faceY : allDeaths ? 0.6 : 0.91;
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, lookY, 0);
controls.enablePan = false;
controls.minDistance = close ? 0.55 : 2.3;
controls.maxDistance = lineup ? 16 : 7;
controls.maxPolarAngle = Math.PI * 0.52;
const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}${ZOMBIE_MODELS[modelId].url}`);
const visuals: ZombieVisual[] = [];
const placements: THREE.Group[] = [];
const labels: HTMLElement[] = [];
const referenceMixers = new Map<ZombieVisual, THREE.AnimationMixer>();
const deathStyles = new Map<ZombieVisual, ZombieFallStyle>();
const deathClocks = new Map<ZombieVisual, number>();
const hats = new Map<ZombieVisual, ZombieHat>();
const hatClocks = new Map<ZombieVisual, number>();
const source = { scene: gltf.scene, clips: gltf.animations };
const layout: readonly { yaw: number; style: ZombieFallStyle; skin: ZombieSkinId | null }[] = close
  ? [{ yaw: 0, style: deathStyle, skin: singleSkin }]
  : allDeaths
    ? ZOMBIE_FALL_STYLES.map((style) => ({ yaw: 0.65, style, skin: singleSkin }))
    : allSkins
      ? (Object.keys(ZOMBIE_SKINS) as ZombieSkinId[]).map((skin) => ({ yaw: 0.45, style: deathStyle, skin }))
      : [0, 0.75, Math.PI / 2].map((yaw) => ({ yaw, style: deathStyle, skin: singleSkin }));
for (const [index, { yaw, style, skin }] of layout.entries()) {
  const look = { ...(skin ? createSkinnedWalkerSource(source, skin) : source), eyes };
  const visual = new ZombieVisual(modelId, look, ZOMBIE_MODELS[modelId].tints[0], false);
  visual.setZombieType(zombieType(index));
  visual.setWalkPhase(THREE.MathUtils.euclideanModulo(
    (Number(params.get('variant')) || index) * 0.37,
    1,
  ));
  visual.setAttackDuration(ZOMBIE_ATTACK_DURATION);
  visual.setAttackReach(0.3);
  visual.setStrikeTarget(0, 1.3, state === 'barrierAttack' ? 0.9 : 1.35);
  visual.setState(state === 'death' ? 'walk' : state);
  if (params.has('source')) {
    const mixer = new THREE.AnimationMixer(visual.root);
    const clip = resolveClip(gltf.animations, speed === 0 ? ['ZombieIdle', 'BruteWalk'] : speed > 2.4 ? ['ZombieRun', 'BruteWalk'] : ['ZombieWalk', 'BruteWalk']);
    if (clip) mixer.clipAction(clip).play();
    referenceMixers.set(visual, mixer);
  }
  if (state === 'death') {
    deathStyles.set(visual, style);
    deathClocks.set(visual, 0);
  }
  if (state === 'death' || allSkins) {
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = allSkins ? skin ?? '' : style;
    document.body.appendChild(label);
    labels.push(label);
  }
  const placement = new THREE.Group();
  placement.rotation.y = yaw;
  placement.add(visual.root);
  scene.add(placement);
  placements.push(placement);
  visuals.push(visual);
  if (params.has('hatshot')) {
    const hat = ZombieHat.create(visual.root, placement, { boxes: [] });
    if (hat) hats.set(visual, hat);
  }
}
function zombieType(index: number): 'brute' | 'shiny' | 'normal' {
  if (modelId === 'brute') return 'brute';
  return params.has('shiny') || (params.has('compare') && index === 0) ? 'shiny' : 'normal';
}
function advanceVisual(visual: ZombieVisual, elapsed: number): void {
  const hat = hats.get(visual);
  if (!hat) { advanceBody(visual, elapsed); return; }
  let clock = hatClocks.get(visual) ?? 0;
  let remaining = elapsed;
  while (remaining > 0) {
    const step = Math.min(remaining, 1 / 60);
    advanceBody(visual, step);
    if (clock < DEATH_LEAD && clock + step >= DEATH_LEAD) hat.detach();
    hat.update(step);
    remaining -= step;
    clock += step;
    if (clock >= DEATH_CYCLE) { clock = 0; hat.reset(); }
  }
  hatClocks.set(visual, clock);
}
function advanceBody(visual: ZombieVisual, elapsed: number): void {
  const reference = referenceMixers.get(visual);
  if (reference) { reference.update(elapsed); return; }
  if (electric && state !== 'death') visual.electrify(1);
  if (state === 'death') { advanceDeath(visual, elapsed); return; }
  if (state === 'walk') {
    visual.update(elapsed, speed);
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
/** Same entry as the game: a walking body is shot from the front, then falls. */
function advanceDeath(visual: ZombieVisual, elapsed: number): void {
  let remaining = elapsed;
  let clock = deathClocks.get(visual) ?? 0;
  while (remaining > 0) {
    const step = Math.min(remaining, 1 / 60);
    if (clock < DEATH_LEAD && clock + step >= DEATH_LEAD) {
      const style = deathStyles.get(visual) ?? deathStyle;
      visual.prepareDeath(style, 0, -1);
      visual.setState('death');
      if (electric || style === 'shock') visual.electrify(ZOMBIE_ELECTRIFIED_DURATION);
    }
    visual.update(step, clock < DEATH_LEAD ? speed : 0);
    clock += step;
    remaining -= step;
    if (clock >= DEATH_CYCLE) {
      clock = 0;
      visual.setZombieType(zombieType(visuals.indexOf(visual)));
      visual.setState('walk');
    }
  }
  deathClocks.set(visual, clock);
  displayedState = clock < DEATH_LEAD ? 'walk' : 'death';
}
function resize(): void {
  const compact = innerWidth < 700 && !lineup;
  camera.aspect = innerWidth / innerHeight;
  if (lineup) {
    // Fit the whole row, whatever the aspect ratio.
    const halfWidth = (layout.length * ROW_SPACING) / 2 + 0.4;
    const distance = halfWidth / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    camera.position.set(0, 0.6 + distance * 0.42, distance);
  } else {
    camera.position.set(0, close ? faceY + 0.02 : 1.25, close ? Math.max(1.05, 0.25 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect)) : 3.65 * height / 1.78);
  }
  camera.updateProjectionMatrix();
  for (const [index, placement] of placements.entries()) {
    placement.visible = !compact || index === 0;
    const spacing = lineup ? ROW_SPACING : height * 0.53;
    placement.position.x = close || compact ? 0 : (index - (layout.length - 1) / 2) * spacing;
  }
  controls.update();
  renderer.setSize(innerWidth, innerHeight);
}
resize();
if (fixedTime !== null) {
  for (const visual of visuals) advanceVisual(visual, state === 'death' ? DEATH_LEAD + fixedTime : fixedTime);
}
const labelPoint = new THREE.Vector3();
let previous = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - previous) / 1000);
  previous = now;
  if (fixedTime === null) {
    for (const visual of visuals) advanceVisual(visual, dt);
    cycleTime = (cycleTime + dt) % cycleDuration;
  }
  renderer.render(scene, camera);
  for (const [index, label] of labels.entries()) {
    labelPoint.set(placements[index].position.x, -0.15, placements[index].position.z).project(camera);
    label.style.left = `${(labelPoint.x * 0.5 + 0.5) * innerWidth}px`;
    label.style.top = `${(-labelPoint.y * 0.5 + 0.5) * innerHeight}px`;
    label.style.display = placements[index].visible ? '' : 'none';
  }
  document.getElementById('status')!.textContent = `${displayedState} · ${fixedTime === null ? 'animado' : `${fixedTime.toFixed(3)} s`} · ${renderer.info.render.calls} draws · ${renderer.info.render.triangles} triángulos`;
});
window.addEventListener('resize', resize);
