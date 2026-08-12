import * as THREE from 'three';

const MAX_BULLET_HOLES = 96;
const MAX_SHELLS = 24;
const MAX_SPARKS = 16;
const MAX_SMOKE = 10;
const SHELL_LIFETIME = 1.4;
const SPARK_LIFETIME = 0.14;
const SMOKE_LIFETIME = 0.7;
/** Height of the platform surface where casings come to rest. */
const SHELL_REST_Y = 0.172;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

interface ShellCasing {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spinX: number;
  spinZ: number;
  life: number;
  active: boolean;
  resting: boolean;
}

interface Spark {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
}

interface SmokePuff {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  life: number;
  baseSize: number;
  riseSpeed: number;
  active: boolean;
}

let holeTexture: THREE.CanvasTexture | null = null;
let smokeTexture: THREE.CanvasTexture | null = null;

function getSmokeTexture(): THREE.CanvasTexture {
  if (smokeTexture) return smokeTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(226,226,226,0.85)');
  gradient.addColorStop(0.6, 'rgba(210,210,210,0.45)');
  gradient.addColorStop(1, 'rgba(200,200,200,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  smokeTexture = new THREE.CanvasTexture(canvas);
  return smokeTexture;
}

function getHoleTexture(): THREE.CanvasTexture {
  if (holeTexture) return holeTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  const gradient = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
  gradient.addColorStop(0, 'rgba(12,12,12,0.95)');
  gradient.addColorStop(0.55, 'rgba(20,18,16,0.75)');
  gradient.addColorStop(1, 'rgba(20,18,16,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  holeTexture = new THREE.CanvasTexture(canvas);
  return holeTexture;
}

/**
 * Pooled transient visuals: bullet holes, ejected casings and impact sparks.
 * Everything is round-robin so counts are hard-capped and nothing allocates
 * per shot after construction.
 */
export class Effects {
  private readonly holes: THREE.Mesh[] = [];
  private readonly shells: ShellCasing[] = [];
  private readonly sparks: Spark[] = [];
  private readonly smoke: SmokePuff[] = [];
  private holeCursor = 0;
  private shellCursor = 0;
  private sparkCursor = 0;
  private smokeCursor = 0;

  private readonly tmpVector = new THREE.Vector3();
  private readonly tmpNormal = new THREE.Vector3();
  private readonly tmpQuaternion = new THREE.Quaternion();

  constructor(private readonly scene: THREE.Scene) {
    const holeMaterial = new THREE.MeshBasicMaterial({
      map: getHoleTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const holeGeometry = new THREE.CircleGeometry(0.024, 10);
    for (let i = 0; i < MAX_BULLET_HOLES; i++) {
      const hole = new THREE.Mesh(holeGeometry, holeMaterial);
      hole.visible = false;
      this.holes.push(hole);
    }

    const shellGeometry = new THREE.CylinderGeometry(0.005, 0.005, 0.016, 8);
    const shellMaterial = new THREE.MeshStandardMaterial({
      color: 0xc8a24a,
      roughness: 0.3,
      metalness: 0.85,
    });
    for (let i = 0; i < MAX_SHELLS; i++) {
      const mesh = new THREE.Mesh(shellGeometry, shellMaterial);
      mesh.visible = false;
      this.scene.add(mesh);
      this.shells.push({
        mesh,
        velocity: new THREE.Vector3(),
        spinX: 0,
        spinZ: 0,
        life: 0,
        active: false,
        resting: false,
      });
    }

    const sparkGeometry = new THREE.PlaneGeometry(0.07, 0.07);
    for (let i = 0; i < MAX_SPARKS; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffc46a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(sparkGeometry, material);
      mesh.visible = false;
      this.scene.add(mesh);
      this.sparks.push({ mesh, material, life: 0 });
    }

    for (let i = 0; i < MAX_SMOKE; i++) {
      const material = new THREE.SpriteMaterial({
        map: getSmokeTexture(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      this.scene.add(sprite);
      this.smoke.push({ sprite, material, life: 0, baseSize: 0.3, riseSpeed: 0.3, active: false });
    }
  }

  /** Parents a pooled decal to the hit object so it follows moving targets. */
  bulletHole(point: THREE.Vector3, normal: THREE.Vector3, object: THREE.Object3D): void {
    const hole = this.holes[this.holeCursor];
    this.holeCursor = (this.holeCursor + 1) % MAX_BULLET_HOLES;

    object.add(hole);
    this.tmpVector.copy(point);
    object.worldToLocal(this.tmpVector);
    hole.position.copy(this.tmpVector);

    object.getWorldQuaternion(this.tmpQuaternion).invert();
    this.tmpNormal.copy(normal).applyQuaternion(this.tmpQuaternion);
    hole.quaternion.setFromUnitVectors(Z_AXIS, this.tmpNormal);
    hole.position.addScaledVector(this.tmpNormal, 0.012);
    hole.visible = true;
  }

  ejectShell(position: THREE.Vector3, rightDirection: THREE.Vector3): void {
    const shell = this.shells[this.shellCursor];
    this.shellCursor = (this.shellCursor + 1) % MAX_SHELLS;

    shell.active = true;
    shell.resting = false;
    shell.life = SHELL_LIFETIME;
    shell.mesh.visible = true;
    shell.mesh.position.copy(position);
    shell.velocity
      .copy(rightDirection)
      .multiplyScalar(1.5 + Math.random() * 0.9);
    shell.velocity.y = 2 + Math.random() * 0.8;
    shell.velocity.z += (Math.random() - 0.5) * 0.6;
    shell.spinX = 6 + Math.random() * 10;
    shell.spinZ = 6 + Math.random() * 10;
  }

  spark(point: THREE.Vector3, normal: THREE.Vector3): void {
    const spark = this.sparks[this.sparkCursor];
    this.sparkCursor = (this.sparkCursor + 1) % MAX_SPARKS;

    spark.life = SPARK_LIFETIME;
    spark.mesh.visible = true;
    spark.mesh.position.copy(point).addScaledVector(normal, 0.03);
    spark.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    spark.mesh.scale.setScalar(0.7);
  }

  /** Small smoke/dust puff; tinted per surface (muzzle gas, dirt, wood…). */
  puff(point: THREE.Vector3, tint: number, size: number): void {
    const puff = this.smoke[this.smokeCursor];
    this.smokeCursor = (this.smokeCursor + 1) % MAX_SMOKE;

    puff.active = true;
    puff.life = SMOKE_LIFETIME;
    puff.baseSize = size;
    puff.riseSpeed = 0.25 + Math.random() * 0.2;
    puff.material.color.setHex(tint);
    puff.material.rotation = Math.random() * Math.PI * 2;
    puff.material.opacity = 0.28;
    puff.sprite.position.copy(point);
    puff.sprite.scale.setScalar(size * 0.5);
    puff.sprite.visible = true;
  }

  update(dt: number): void {
    for (const shell of this.shells) {
      if (!shell.active) continue;
      shell.life -= dt;
      if (shell.life <= 0) {
        shell.active = false;
        shell.mesh.visible = false;
        continue;
      }
      if (shell.resting) continue;

      shell.velocity.y -= 9.8 * dt;
      shell.mesh.position.addScaledVector(shell.velocity, dt);
      shell.mesh.rotation.x += shell.spinX * dt;
      shell.mesh.rotation.z += shell.spinZ * dt;

      if (shell.mesh.position.y <= SHELL_REST_Y && shell.velocity.y < 0) {
        shell.mesh.position.y = SHELL_REST_Y;
        shell.velocity.set(0, 0, 0);
        shell.resting = true;
      }
    }

    for (const spark of this.sparks) {
      if (spark.life <= 0) continue;
      spark.life -= dt;
      if (spark.life <= 0) {
        spark.mesh.visible = false;
        spark.material.opacity = 0;
        continue;
      }
      const t = spark.life / SPARK_LIFETIME;
      spark.material.opacity = t;
      spark.mesh.scale.setScalar(0.7 + (1 - t) * 1.6);
    }

    for (const puff of this.smoke) {
      if (!puff.active) continue;
      puff.life -= dt;
      if (puff.life <= 0) {
        puff.active = false;
        puff.sprite.visible = false;
        puff.material.opacity = 0;
        continue;
      }
      const t = puff.life / SMOKE_LIFETIME;
      puff.material.opacity = 0.28 * t;
      puff.sprite.scale.setScalar(puff.baseSize * (0.5 + (1 - t) * 1.6));
      puff.sprite.position.y += puff.riseSpeed * dt;
    }
  }
}
