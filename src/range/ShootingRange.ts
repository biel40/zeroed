import * as THREE from 'three';
import type { AssetManager } from '../assets/AssetManager';
import type { SurfaceType } from '../shooting/HitTarget';
import { Target, type TargetKind } from './Target';

const PLAYER_Z = 4;
const LANE_X = [-3, 0, 3];
const ROWS: Array<{ distance: number; kind: TargetKind }> = [
  { distance: 25, kind: 'steel' },
  { distance: 50, kind: 'steel' },
  { distance: 100, kind: 'paper' },
  { distance: 200, kind: 'paper' },
];

function makeSignTexture(label: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.fillStyle = '#20242a';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#d8b13a';
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 244, 116);
  ctx.fillStyle = '#f2e8c8';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Builds the outdoor range: platform, bench, roof, side walls, props, target
 * rows at 25/50/100/200 m with distance signage and a backstop berm.
 * Materials use the downloaded PBR texture sets when available and fall back
 * to flat colors otherwise.
 */
export class ShootingRange {
  readonly group = new THREE.Group();
  readonly colliders: THREE.Object3D[] = [];
  readonly targets: Target[] = [];

  constructor(private readonly assets: AssetManager) {
    this.buildGround();
    this.buildPlatformAndWalls();
    this.buildBench();
    this.buildRoof();
    this.buildProps();
    this.buildBerm();
    this.buildTargetRows();
    this.buildLighting();
  }

  update(dt: number): void {
    for (const target of this.targets) target.update(dt);
  }

  private addCollider<T extends THREE.Object3D>(object: T, surface: SurfaceType): T {
    object.userData.surface = surface;
    this.colliders.push(object);
    return object;
  }

  /**
   * Clones the cached textures so each material controls its own repeat
   * without affecting other users of the same set.
   */
  private pbrMaterial(
    slug: string,
    fallbackColor: number,
    repeat: [number, number],
    options: { tint?: number; metalness?: number } = {},
  ): THREE.MeshStandardMaterial {
    const set = this.assets.getTextureSet(slug);
    const withRepeat = (texture: THREE.Texture | null): THREE.Texture | null => {
      if (!texture) return null;
      const clone = texture.clone();
      clone.repeat.set(repeat[0], repeat[1]);
      clone.needsUpdate = true;
      return clone;
    };
    return new THREE.MeshStandardMaterial({
      color: options.tint ?? (set.map ? 0xffffff : fallbackColor),
      map: withRepeat(set.map),
      normalMap: withRepeat(set.normalMap),
      roughnessMap: withRepeat(set.roughnessMap),
      roughness: 1,
      metalness: options.metalness ?? 0,
    });
  }

  private buildGround(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 500),
      this.pbrMaterial('brown_mud_dry', 0x70795a, [90, 90], { tint: 0xb6ba9a }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(this.addCollider(ground, 'dirt'));

    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xd9d9cf });
    for (const x of [-4.5, 4.5]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 225), lineMaterial);
      line.position.set(x, 0.011, -100);
      this.group.add(line);
    }
  }

  private buildPlatformAndWalls(): void {
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(16.5, 0.16, 11),
      this.pbrMaterial('concrete', 0x8d8d86, [5, 3.4]),
    );
    platform.position.set(0, 0.08, 3.5);
    platform.receiveShadow = true;
    this.group.add(this.addCollider(platform, 'concrete'));

    const wallMaterial = this.pbrMaterial('concrete', 0x7d7a70, [4, 0.9]);
    const sideGeometry = new THREE.BoxGeometry(0.4, 2.3, 11);
    const wallLeft = new THREE.Mesh(sideGeometry, wallMaterial);
    wallLeft.position.set(-8.2, 1.15, 3.5);
    const wallRight = new THREE.Mesh(sideGeometry, wallMaterial);
    wallRight.position.set(8.2, 1.15, 3.5);
    const wallBack = new THREE.Mesh(
      new THREE.BoxGeometry(16.8, 2.3, 0.4),
      this.pbrMaterial('concrete', 0x7d7a70, [6, 0.9]),
    );
    wallBack.position.set(0, 1.15, 8.8);
    for (const wall of [wallLeft, wallRight, wallBack]) {
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.group.add(this.addCollider(wall, 'concrete'));
    }
  }

  private buildBench(): void {
    const wood = this.pbrMaterial('brown_planks_03', 0x5f564a, [3, 0.6]);
    const bench = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(7, 0.09, 0.8), wood);
    top.position.y = 0.95;
    top.castShadow = true;
    bench.add(top);
    for (const x of [-3.2, 3.2]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.95, 0.6), wood);
      leg.position.set(x, 0.475, 0);
      bench.add(leg);
    }
    bench.position.set(0, 0, 1.2);
    this.group.add(bench);
    this.addCollider(top, 'wood');
  }

  /** Flat roof over the firing line: adds depth and a large shade pattern. */
  private buildRoof(): void {
    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a3f45,
      roughness: 0.5,
      metalness: 0.6,
    });
    const roofMaterial = this.pbrMaterial('metal_plate', 0x4a4f55, [6, 3], {
      tint: 0x6a7076,
      metalness: 0.55,
    });

    const postGeometry = new THREE.BoxGeometry(0.14, 3, 0.14);
    for (const x of [-7.6, 7.6]) {
      for (const z of [0.4, 8.2]) {
        const post = new THREE.Mesh(postGeometry, postMaterial);
        post.position.set(x, 1.5, z);
        post.castShadow = true;
        this.group.add(this.addCollider(post, 'metal'));
      }
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(16.6, 0.1, 9), roofMaterial);
    roof.position.set(0, 3.05, 4.3);
    roof.castShadow = true;
    this.group.add(this.addCollider(roof, 'metal'));
  }

  private buildProps(): void {
    // Wooden crates stacked by the right wall.
    const crateMaterial = this.pbrMaterial('brown_planks_03', 0x6b5b43, [1, 1]);
    const crates: Array<[number, number, number, number, number]> = [
      [5.6, 0.31, 5.6, 0.62, 0.3],
      [6.4, 0.26, 6.3, 0.52, -0.2],
      [5.8, 0.85, 5.8, 0.46, 0.85],
    ];
    for (const [x, y, z, size, yaw] of crates) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMaterial);
      crate.position.set(x, y, z);
      crate.rotation.y = yaw;
      crate.castShadow = true;
      crate.receiveShadow = true;
      this.group.add(this.addCollider(crate, 'wood'));
    }

    // Angled steel barriers between the firing line and the lanes.
    const barrierMaterial = this.pbrMaterial('metal_plate', 0x5a5f64, [2, 1], { metalness: 0.6 });
    for (const x of [-5.9, 5.9]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.1, 0.06), barrierMaterial);
      plate.position.set(x, 0.62, 0.1);
      plate.rotation.y = x < 0 ? 0.35 : -0.35;
      plate.castShadow = true;
      this.group.add(this.addCollider(plate, 'metal'));
    }
  }

  private buildBerm(): void {
    const berm = new THREE.Mesh(
      new THREE.BoxGeometry(70, 8, 8),
      this.pbrMaterial('brown_mud_dry', 0x6b5b41, [14, 2], { tint: 0x9a8563 }),
    );
    berm.position.set(0, 3.2, -215);
    berm.rotation.x = -0.12;
    berm.receiveShadow = true;
    this.group.add(this.addCollider(berm, 'dirt'));
  }

  private buildTargetRows(): void {
    const stripMaterial = new THREE.MeshBasicMaterial({ color: 0xc23b2e });
    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0x3f4449,
      roughness: 0.6,
      metalness: 0.5,
    });

    for (const row of ROWS) {
      const z = PLAYER_Z - row.distance;

      for (const x of LANE_X) {
        const target = new Target(row.kind);
        target.group.position.set(x, 0, z);
        this.group.add(target.group);
        this.targets.push(target);
        this.addCollider(target.collider, target.surface);
      }

      const strip = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.02, 0.35), stripMaterial);
      strip.position.set(0, 0.012, z + 1.2);
      this.group.add(strip);

      const sign = new THREE.Group();
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(1.15, 0.58, 0.06),
        new THREE.MeshStandardMaterial({ map: makeSignTexture(`${row.distance} m`), roughness: 0.7 }),
      );
      board.position.y = 1.5;
      board.castShadow = true;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 0.08), postMaterial);
      post.position.y = 0.75;
      sign.add(board, post);
      sign.position.set(5.4, 0, z);
      this.group.add(sign);
    }
  }

  private buildLighting(): void {
    const hemisphere = new THREE.HemisphereLight(0xbfd4ea, 0x57503f, 0.55);
    this.group.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xfff1d8, 2.2);
    sun.position.set(45, 75, 25);
    sun.target.position.set(0, 0, -60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -105;
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 220;
    sun.shadow.bias = -0.0004;
    this.group.add(sun, sun.target);
  }
}
