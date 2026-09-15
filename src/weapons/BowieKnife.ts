import * as THREE from 'three';

export const BOWIE_ATTACK_DURATION = 0.62;
export const BOWIE_HIT_MOMENT = 0.34;
export const BOWIE_DAMAGE = 150;
export const BOWIE_RANGE = 2.05;

const REST_POSITION = new THREE.Vector3(0.34, -0.31, -0.48);
const WINDUP_POSITION = new THREE.Vector3(0.47, -0.37, -0.38);
const HIT_POSITION = new THREE.Vector3(0.02, -0.11, -0.3);
const FOLLOW_POSITION = new THREE.Vector3(-0.2, -0.2, -0.38);
const REST_ROTATION = new THREE.Euler(-0.28, -0.18, 0.72);
const WINDUP_ROTATION = new THREE.Euler(-0.08, -0.42, 1.02);
const HIT_ROTATION = new THREE.Euler(-0.92, 0.12, -0.78);
const FOLLOW_ROTATION = new THREE.Euler(-1.08, 0.22, -1.2);

function smoothStep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Large procedural Bowie view model and its contact-timed attack sequence. */
export class BowieKnife {
  readonly root = new THREE.Group();
  onSwing: (() => void) | null = null;
  onImpact: (() => void) | null = null;

  private elapsed = BOWIE_ATTACK_DURATION;
  private impactApplied = false;
  private previousTrigger = false;
  private active = false;
  private idleTime = 0;

  constructor() {
    this.root.name = 'bowie-knife-view';
    this.buildView();
    this.applyPose(0);
    this.root.visible = false;
  }

  get enabled(): boolean {
    return this.active;
  }

  get isAttacking(): boolean {
    return this.elapsed < BOWIE_ATTACK_DURATION;
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.active) return;
    this.active = enabled;
    this.root.visible = enabled;
    this.elapsed = BOWIE_ATTACK_DURATION;
    this.impactApplied = false;
    this.applyPose(0);
  }

  reset(): void {
    this.previousTrigger = false;
    this.setEnabled(false);
  }

  public trigger(): boolean {
    if (!this.active || this.isAttacking) return false;
    this.elapsed = 0;
    this.impactApplied = false;
    this.onSwing?.();
    return true;
  }

  update(dt: number, trigger: boolean, speed01: number): void {
    this.idleTime += dt;
    const triggerEdge = trigger && !this.previousTrigger;
    this.previousTrigger = trigger;
    if (!this.active) return;

    if (triggerEdge) this.trigger();
    if (this.isAttacking) {
      const previous = this.elapsed;
      this.elapsed = Math.min(BOWIE_ATTACK_DURATION, this.elapsed + dt);
      this.applyPose(this.elapsed / BOWIE_ATTACK_DURATION);
      if (!this.impactApplied && previous < BOWIE_HIT_MOMENT && this.elapsed >= BOWIE_HIT_MOMENT) {
        this.impactApplied = true;
        this.onImpact?.();
      }
      return;
    }

    const bob = Math.sin(this.idleTime * 7) * speed01;
    this.root.position.copy(REST_POSITION);
    this.root.position.y += Math.abs(bob) * 0.012;
    this.root.position.x += bob * 0.009;
    this.root.rotation.copy(REST_ROTATION);
  }

  private applyPose(progress: number): void {
    let fromPosition = REST_POSITION;
    let toPosition = WINDUP_POSITION;
    let fromRotation = REST_ROTATION;
    let toRotation = WINDUP_ROTATION;
    let local = progress / 0.34;
    if (progress >= 0.34 && progress < 0.55) {
      fromPosition = WINDUP_POSITION;
      toPosition = HIT_POSITION;
      fromRotation = WINDUP_ROTATION;
      toRotation = HIT_ROTATION;
      local = (progress - 0.34) / 0.21;
    } else if (progress >= 0.55 && progress < 0.72) {
      fromPosition = HIT_POSITION;
      toPosition = FOLLOW_POSITION;
      fromRotation = HIT_ROTATION;
      toRotation = FOLLOW_ROTATION;
      local = (progress - 0.55) / 0.17;
    } else if (progress >= 0.72) {
      fromPosition = FOLLOW_POSITION;
      toPosition = REST_POSITION;
      fromRotation = FOLLOW_ROTATION;
      toRotation = REST_ROTATION;
      local = (progress - 0.72) / 0.28;
    }
    const blend = smoothStep(THREE.MathUtils.clamp(local, 0, 1));
    this.root.position.lerpVectors(fromPosition, toPosition, blend);
    this.root.rotation.set(
      THREE.MathUtils.lerp(fromRotation.x, toRotation.x, blend),
      THREE.MathUtils.lerp(fromRotation.y, toRotation.y, blend),
      THREE.MathUtils.lerp(fromRotation.z, toRotation.z, blend),
    );
  }

  private buildView(): void {
    const bladeMaterial = new THREE.MeshStandardMaterial({
      color: 0xb9bdba, metalness: 0.88, roughness: 0.3, envMapIntensity: 1.4,
    });
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: 0xe2e5df, metalness: 0.92, roughness: 0.2, envMapIntensity: 1.7,
    });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x25282a, metalness: 0.78, roughness: 0.45 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x4b2415, metalness: 0.03, roughness: 0.78 });
    const skin = new THREE.MeshStandardMaterial({ color: 0x9b7359, metalness: 0, roughness: 0.86 });

    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, -0.045);
    bladeShape.lineTo(0.31, -0.052);
    bladeShape.lineTo(0.46, 0.012);
    bladeShape.lineTo(0.31, 0.065);
    bladeShape.lineTo(0.04, 0.06);
    bladeShape.lineTo(0, 0.035);
    bladeShape.closePath();
    const bladeGeometry = new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.012, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.004, bevelThickness: 0.003,
    });
    bladeGeometry.rotateY(Math.PI / 2);
    bladeGeometry.translate(-0.006, 0.025, -0.055);
    const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
    blade.name = 'bowie-blade';
    this.root.add(blade);

    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.31), edgeMaterial);
    edge.name = 'bowie-edge';
    edge.position.set(-0.007, -0.018, -0.25);
    edge.rotation.x = -0.035;
    this.root.add(edge);

    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.035), darkMetal);
    guard.name = 'bowie-guard';
    guard.position.z = -0.055;
    guard.rotation.z = 0.08;
    this.root.add(guard);
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.16, 4, 10), wood);
    grip.name = 'bowie-grip';
    grip.rotation.x = Math.PI / 2;
    grip.position.z = 0.075;
    this.root.add(grip);
    for (const z of [0.015, 0.055, 0.095, 0.135]) {
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.004, 5, 10), darkMetal);
      wrap.rotation.x = Math.PI / 2;
      wrap.position.z = z;
      this.root.add(wrap);
    }
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.043, 10, 7), darkMetal);
    pommel.position.z = 0.18;
    pommel.scale.z = 0.65;
    this.root.add(pommel);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.067, 10, 8), skin);
    hand.name = 'bowie-hand';
    hand.position.set(0.018, -0.018, 0.08);
    hand.scale.set(0.8, 1, 1.35);
    this.root.add(hand);
  }
}
