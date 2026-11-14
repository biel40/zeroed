import * as THREE from 'three';
import { LA_SEU_MOON, LA_SEU_WALL_THICKNESS, PLAZA } from '../LaSeuConfig';
import { seededRandom } from '../shared/ProceduralNoise';
import { StaticMeshBatch } from '../shared/StaticMeshBatch';
import { makeShaftTexture } from './StainedGlass';

/** Level of the bay below the plaza. */
const SEA_Y = -9;
const STAR_COUNT = 260;
const HARBOUR_LIGHTS = 46;

/**
 * Everything beyond the parapet, never reachable: the bay under the moon,
 * the old sea wall below the plaza, the Almudaina palace west of it and
 * Bellver's hill across the water. Unlit and unfogged silhouettes in a
 * handful of draw calls; the haze of the playable space would erase them.
 */
export function buildPlazaVista(parent: THREE.Group): void {
  const vista = new THREE.Group();
  vista.name = 'laseu-vista';
  parent.add(vista);
  const flat = (name: string, color: number): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ name, color, fog: false });
  const sea = flat('laseu_sea', 0x060c19);
  const nearStone = flat('laseu_vista_near', 0x15161c);
  const farStone = flat('laseu_vista_far', 0x0c111d);
  const windowGlow = flat('laseu_vista_window', 0xe0a45c);
  const batch = new StaticMeshBatch();

  batch.add(new THREE.PlaneGeometry(900, 520).rotateX(-Math.PI / 2).translate(0, SEA_Y, PLAZA.maxZ + 250), sea);
  // The sea wall (Dalt Murada) and its walk, straight under the parapet.
  const wallZ = PLAZA.maxZ + LA_SEU_WALL_THICKNESS;
  batch.addBox(nearStone, 0, SEA_Y / 2 - 0.2, wallZ + 3.5, 120, -SEA_Y - 0.4, 7);
  batch.addBox(nearStone, 0, SEA_Y / 2 - 2.8, wallZ + 9, 120, -SEA_Y - 5.6, 4);

  addAlmudaina(batch, nearStone, windowGlow);
  addFarShore(batch, farStone);
  batch.build(vista, 'laseu-vista', { castShadow: false, receiveShadow: false });

  addMoon(vista);
  addStars(vista);
  addHarbourLights(vista);
}

/** The royal palace west of the plaza: a long block, square towers and the arcaded loggia facing the sea. */
function addAlmudaina(batch: StaticMeshBatch, stone: THREE.Material, glow: THREE.Material): void {
  const eastFace = PLAZA.minX - 9;
  batch.addBox(stone, eastFace - 20, 6.5, 14, 40, 13, 34);
  const towers = [
    { x: eastFace - 3, z: 29, height: 19 },
    { x: eastFace - 3, z: 6, height: 17 },
    { x: eastFace - 18, z: 30, height: 22 },
    { x: eastFace - 34, z: 28, height: 18 },
  ];
  for (const tower of towers) {
    batch.addBox(stone, tower.x, tower.height / 2, tower.z, 6, tower.height, 6);
    for (const dx of [-2.4, -0.8, 0.8, 2.4]) {
      for (const dz of [-2.6, 2.6]) batch.addBox(stone, tower.x + dx, tower.height + 0.45, tower.z + dz, 0.9, 0.9, 0.6);
    }
  }
  // Loggia arches on the sea front and a few windows still lit.
  for (let arch = 0; arch < 6; arch++) batch.addBox(glow, eastFace - 8 - arch * 2.6, 9.6, 31.05, 1.1, 1.9, 0.1);
  for (const [dz, y] of [[10, 8.6], [17, 5.2], [22, 9.4]] as const) batch.addBox(glow, eastFace + 0.05, y, dz, 0.1, 1.2, 0.7);
}

/** The far side of the bay: a low shoreline and Bellver's wooded hill with its round castle. */
function addFarShore(batch: StaticMeshBatch, stone: THREE.Material): void {
  batch.addBox(stone, -40, SEA_Y + 3, 430, 900, 6, 40);
  const hill = new THREE.SphereGeometry(70, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.6, 0.55, 1).translate(-230, SEA_Y, 400);
  batch.add(hill, stone);
  batch.add(new THREE.CylinderGeometry(12, 12, 9, 16).translate(-230, SEA_Y + 42, 400), stone);
  batch.add(new THREE.CylinderGeometry(3.4, 3.4, 15, 10).translate(-216, SEA_Y + 45, 400), stone);
}

/** The moon over the bay, its halo and the glitter it lays on the water, brightest towards the horizon. */
function addMoon(vista: THREE.Group): void {
  const { x, y, z } = LA_SEU_MOON.position;
  // Kept inside the camera's far plane (700 m).
  const scale = 3.2;
  const position = new THREE.Vector3(x * scale, y * scale, z * scale);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(14, 28), new THREE.MeshBasicMaterial({ name: 'laseu_moon', color: 0xe8edfb, fog: false }));
  const halo = new THREE.Mesh(new THREE.CircleGeometry(48, 28), new THREE.MeshBasicMaterial({
    name: 'laseu_moon_halo', color: 0x5d76b4, fog: false, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  for (const mesh of [halo, disc]) {
    mesh.position.copy(position);
    mesh.lookAt(0, 2, PLAZA.maxZ);
    vista.add(mesh);
  }
  const glitter = new THREE.Mesh(new THREE.PlaneGeometry(34, 420).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({
    name: 'laseu_moon_glitter', map: makeShaftTexture(), color: 0x7890c8, fog: false, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  glitter.name = 'moon-glitter';
  glitter.position.set(x * 1.6, SEA_Y + 0.05, PLAZA.maxZ + 230);
  glitter.rotation.y = Math.atan2(x, z);
  vista.add(glitter);
}

/** Fixed stars over the southern sky, the half the plaza looks at. */
function addStars(vista: THREE.Group): void {
  const random = seededRandom(6401);
  const positions = new Float32Array(STAR_COUNT * 3);
  for (let star = 0; star < STAR_COUNT; star++) {
    const azimuth = (random() - 0.5) * Math.PI * 1.5;
    const elevation = 0.06 + random() * 1.2;
    const radius = 560;
    positions[star * 3] = Math.sin(azimuth) * Math.cos(elevation) * radius;
    positions[star * 3 + 1] = Math.sin(elevation) * radius;
    positions[star * 3 + 2] = Math.cos(azimuth) * Math.cos(elevation) * radius;
  }
  vista.add(pointCloud('laseu-stars', positions, 0xcfd8f2, 1.6, 0.85));
}

/** Lights of the harbour along the far shore. */
function addHarbourLights(vista: THREE.Group): void {
  const random = seededRandom(6402);
  const positions = new Float32Array(HARBOUR_LIGHTS * 3);
  for (let light = 0; light < HARBOUR_LIGHTS; light++) {
    positions[light * 3] = -420 + random() * 760;
    positions[light * 3 + 1] = SEA_Y + 6.5 + random() * 5;
    positions[light * 3 + 2] = 409;
  }
  vista.add(pointCloud('laseu-harbour-lights', positions, 0xffc98a, 2.2, 0.9));
}

function pointCloud(name: string, positions: Float32Array, color: number, size: number, opacity: number): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    name: name.replace(/-/g, '_'), color, size, sizeAttenuation: false, fog: false, transparent: true, opacity, depthWrite: false,
  }));
  points.name = name;
  return points;
}
