import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createRemoteAvatar, REMOTE_SOLDIER_MODEL_URL, type RemoteAvatarMotion } from '../../src/rendering/RemotePlayerAvatar';
import { STANCE, type PlayerStance } from '../../src/player/PlayerStance';

const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x30353a);
scene.add(new THREE.HemisphereLight(0xc6d5e2, 0x574635, 2));
const key = new THREE.DirectionalLight(0xffe4c5, 3);
key.position.set(-2, 4, -3);
scene.add(key);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x494946 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.03;
scene.add(floor, new THREE.GridHelper(20, 40));
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.01, 50);
camera.position.set(5, 3.2, -7);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.7, 0);
controls.update();
const gltf = params.has('fallback') ? null : await new GLTFLoader().loadAsync(`/${REMOTE_SOLDIER_MODEL_URL}`);
const source = gltf ? { scene: gltf.scene, clips: gltf.animations } : null;
const stances: readonly PlayerStance[] = ['standing', 'crouched', 'prone'];
const avatars = stances.map((stance, index) => {
  const avatar = createRemoteAvatar(source, false);
  avatar.group.position.x = (1 - index) * 2.2;
  avatar.setWeapon('m1911');
  scene.add(avatar.group);
  const motion: RemoteAvatarMotion = { speed: 0, forwardSpeed: 0, pitch: 0, aiming: false,
    reloading: false, alive: true, life: 'alive', reviving: false, stance };
  for (let i = 0; i < 120; i++) avatar.update(1 / 60, motion);
  return { avatar, motion };
});
document.getElementById('status')!.textContent = avatars.every(({ avatar }) => avatar.isSkinned) ? 'Soldado GLB · clips de postura activos' : 'Modelo procedural de reserva';
document.getElementById('fire')!.onclick = (): void => { for (const { avatar } of avatars) avatar.playFire(); };
const moving = document.getElementById('moving') as HTMLInputElement;
const aiming = document.getElementById('aiming') as HTMLInputElement;
const reloading = document.getElementById('reloading') as HTMLInputElement;
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  for (const { avatar, motion } of avatars) {
    motion.speed = moving.checked ? 4.6 * STANCE[motion.stance!].speed : 0;
    motion.forwardSpeed = motion.speed;
    motion.aiming = aiming.checked;
    motion.pitch = aiming.checked ? 0.15 : 0;
    motion.reloading = reloading.checked;
    avatar.update(dt, motion);
  }
  renderer.render(scene, camera);
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
