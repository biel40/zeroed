import * as THREE from 'three';

/** Small first-person shoulder/elbow reach used by both coop roles. */
export class ReviveGesture {
  private readonly root = new THREE.Group();
  private readonly shoulder = new THREE.Group();
  private readonly elbow = new THREE.Group();
  private readonly partner = new THREE.Group();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private contactTime = 0;
  private lastRole: 'reviver' | 'downed' = 'reviver';

  constructor(camera: THREE.Camera) {
    const cloth = new THREE.MeshStandardMaterial({ color: 0x555744, roughness: 1, depthTest: false });
    const skin = new THREE.MeshStandardMaterial({ color: 0x9b8068, roughness: 0.9, depthTest: false });
    this.materials.push(cloth, skin);
    const part = (parent: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material,
      x: number, y: number, z: number): void => {
      this.geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.renderOrder = 900;
      parent.add(mesh);
    };
    this.root.position.set(0.32, -0.32, -0.35);
    this.root.add(this.shoulder);
    part(this.shoulder, new THREE.CylinderGeometry(0.085, 0.095, 0.28, 9), cloth, 0, -0.14, 0);
    this.elbow.position.y = -0.28;
    this.shoulder.add(this.elbow);
    part(this.elbow, new THREE.CylinderGeometry(0.061, 0.074, 0.26, 9), cloth, 0, -0.13, 0);
    part(this.elbow, new THREE.SphereGeometry(0.075, 10, 8), skin, 0, -0.31, -0.01);
    // The teammate's forearm enters from the opposite side and meets the palm.
    part(this.partner, new THREE.CylinderGeometry(0.063, 0.073, 0.27, 9), cloth, 0, -0.12, 0);
    part(this.partner, new THREE.SphereGeometry(0.075, 10, 8), skin, 0, -0.29, 0);
    this.root.add(this.partner);
    this.root.visible = false;
    camera.add(this.root);
  }

  update(dt: number, role: 'reviver' | 'downed' | null, progress: number): void {
    this.contactTime = Math.max(0, this.contactTime - dt);
    this.root.visible = role !== null || this.contactTime > 0;
    if (!this.root.visible) return;
    if (role) this.lastRole = role;
    else { role = this.lastRole; progress = 1; }
    const reach = Math.min(1, Math.max(0, progress / 0.85));
    const slap = progress > 0.8 ? Math.min(1, (progress - 0.8) / 0.2) : 0;
    this.root.position.x = 0.32 - reach * 0.22 - slap * 0.06;
    this.root.position.y = (role === 'downed' ? -0.48 : -0.32) + reach * (role === 'downed' ? 0.22 : 0.03);
    this.shoulder.rotation.x = (role === 'downed' ? 0.8 : 0.35) + reach * (role === 'downed' ? 0.6 : 0.85);
    this.shoulder.rotation.z = -reach * 0.25;
    this.elbow.rotation.x = -0.35 + reach * 0.65 + slap * 0.25;
    this.partner.position.set(-0.64 + reach * 0.57 + slap * 0.04,
      -0.04 + reach * 0.22, -0.58 - reach * 0.05);
    this.partner.rotation.x = -0.75 + reach * 0.4;
    this.partner.rotation.z = -0.45 + reach * 0.35;
  }

  contact(): void { this.contactTime = 0.25; }

  dispose(): void {
    this.root.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}
