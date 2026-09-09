import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ZombieVisual, ZOMBIE_MODELS } from '../../src/zombies/ZombieVisual';

// Development-only visual review, independent of the game entry/bundle.
// /tools/viewers/zombie-viewer.html?time=0.3 | ?state=attack&time=0.475 | ?close=1 | ?night=1
const params = new URLSearchParams(location.search);
const close = params.has('close');
const night = params.has('night');
const state = params.get('state') === 'attack' ? 'attack' : 'walk';
const fixedTime = params.has('time') ? Math.max(0, Number(params.get('time')) || 0) : null;
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
camera.position.set(0, close ? 1.57 : 1.25, close ? 1.05 : 3.65);
camera.lookAt(0, close ? 1.55 : 0.91, 0);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, close ? 1.55 : 0.91, 0);
controls.enablePan = false;
controls.minDistance = close ? 0.55 : 2.3;
controls.maxDistance = 7;
controls.maxPolarAngle = Math.PI * 0.52;
const gltf = await new GLTFLoader().loadAsync(ZOMBIE_MODELS.walker.url);
const visuals: ZombieVisual[] = [];
const placements: THREE.Group[] = [];
for (const [index, yaw] of (close ? [0] : [0, 0.75, Math.PI / 2]).entries()) {
  const visual = new ZombieVisual('walker', { scene: gltf.scene, clips: gltf.animations }, ZOMBIE_MODELS.walker.tints[0], false);
  visual.setZombieType(params.has('shiny') || (params.has('compare') && index === 0) ? 'shiny' : 'normal');
  visual.setWalkJitter(1);
  visual.setAttackDuration(0.75);
  visual.setState(state);
  const placement = new THREE.Group();
  placement.position.x = close ? 0 : (index - 1) * 0.72;
  placement.rotation.y = yaw;
  placement.add(visual.root);
  scene.add(placement);
  placements.push(placement);
  visuals.push(visual);
  if (fixedTime !== null) visual.update(fixedTime, ZOMBIE_MODELS.walker.walkReferenceSpeed);
}
function resize(): void {
  const compact = innerWidth < 700;
  camera.aspect = innerWidth / innerHeight;
  camera.position.set(0, close ? 1.57 : 1.25, close ? Math.max(1.05, 0.25 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect)) : 3.65);
  camera.updateProjectionMatrix();
  for (const [index, placement] of placements.entries()) {
    placement.visible = !compact || index === 0;
    placement.position.x = close || compact ? 0 : (index - 1) * 0.72;
  }
  controls.update();
  renderer.setSize(innerWidth, innerHeight);
}
resize();
let previous = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - previous) / 1000);
  previous = now;
  if (fixedTime === null) for (const visual of visuals) visual.update(dt, ZOMBIE_MODELS.walker.walkReferenceSpeed);
  renderer.render(scene, camera);
  document.getElementById('status')!.textContent = `${state} · ${fixedTime === null ? 'animado' : `${fixedTime.toFixed(3)} s`} · ${renderer.info.render.calls} draws · ${renderer.info.render.triangles} triángulos`;
});
window.addEventListener('resize', resize);