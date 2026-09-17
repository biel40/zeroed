import * as THREE from 'three';

export const KNIFE_ATTACK_DURATION = 0.72;
export const KNIFE_HIT_MOMENT = 0.39;
export const KNIFE_DAMAGE = 150;
export const KNIFE_RANGE = 2.05;

const REST_POSITION = new THREE.Vector3(0.34, -0.31, -0.48);
const WINDUP_POSITION = new THREE.Vector3(0.47, -0.37, -0.36);
const HIT_POSITION = new THREE.Vector3(0.04, -0.15, -0.76);
const FOLLOW_POSITION = new THREE.Vector3(-0.04, -0.18, -0.66);
const REST_ROTATION = new THREE.Euler(-0.28, -0.18, 0.72);
const WINDUP_ROTATION = new THREE.Euler(-0.18, -0.38, 0.94);
const HIT_ROTATION = new THREE.Euler(-0.08, 0.04, 0.12);
const FOLLOW_ROTATION = new THREE.Euler(-0.12, 0.08, -0.05);

const REST_QUATERNION = new THREE.Quaternion().setFromEuler(REST_ROTATION);
const WINDUP_QUATERNION = new THREE.Quaternion().setFromEuler(WINDUP_ROTATION);
const HIT_QUATERNION = new THREE.Quaternion().setFromEuler(HIT_ROTATION);
const FOLLOW_QUATERNION = new THREE.Quaternion().setFromEuler(FOLLOW_ROTATION);
const WINDUP_END = 0.3;
const CONTACT = KNIFE_HIT_MOMENT / KNIFE_ATTACK_DURATION;
const FOLLOW_END = 0.7;

function smoothStep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Large procedural knife view model and its contact-timed attack sequence. */
export class Knife {
  public readonly root = new THREE.Group();
  public onSwing: (() => void) | null = null;
  public onImpact: (() => void) | null = null;

  private elapsed = KNIFE_ATTACK_DURATION;
  private impactApplied = false;
  private previousTrigger = false;
  private active = false;
  private idleTime = 0;

  public constructor() {
    this.root.name = 'knife-view';
    this.buildView();
    this.applyPose(0);
    this.root.visible = false;
  }

  public get enabled(): boolean {
    return this.active;
  }

  public get isAttacking(): boolean {
    return this.elapsed < KNIFE_ATTACK_DURATION;
  }

  public setEnabled(enabled: boolean): void {
    if (enabled === this.active) {
      // Visibility is derived state. Reasserting it here makes cleanup robust
      // if a view transition or interrupted frame changed the Object3D only.
      this.root.visible = enabled;
      return;
    }
    this.active = enabled;
    this.root.visible = enabled;
    this.elapsed = KNIFE_ATTACK_DURATION;
    this.impactApplied = false;
    this.applyPose(0);
  }

  public reset(): void {
    this.previousTrigger = false;
    this.active = false;
    this.root.visible = false;
    this.elapsed = KNIFE_ATTACK_DURATION;
    this.impactApplied = false;
    this.applyPose(0);
  }

  public trigger(): boolean {
    if (!this.active || this.isAttacking) return false;
    this.elapsed = 0;
    this.impactApplied = false;
    this.onSwing?.();
    return true;
  }

  public update(dt: number, trigger: boolean, speed01: number): void {
    this.idleTime += dt;
    const triggerEdge = trigger && !this.previousTrigger;
    this.previousTrigger = trigger;
    if (!this.active) return;

    if (triggerEdge) this.trigger();
    if (this.isAttacking) {
      const previous = this.elapsed;
      this.elapsed = Math.min(KNIFE_ATTACK_DURATION, this.elapsed + dt);
      this.applyPose(this.elapsed / KNIFE_ATTACK_DURATION);
      if (!this.impactApplied && previous < KNIFE_HIT_MOMENT && this.elapsed >= KNIFE_HIT_MOMENT) {
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
    let fromRotation = REST_QUATERNION;
    let toRotation = WINDUP_QUATERNION;
    let local = progress / WINDUP_END;
    let blend = smoothStep(THREE.MathUtils.clamp(local, 0, 1));
    if (progress >= WINDUP_END && progress < CONTACT) {
      fromPosition = WINDUP_POSITION;
      toPosition = HIT_POSITION;
      fromRotation = WINDUP_QUATERNION;
      toRotation = HIT_QUATERNION;
      local = (progress - WINDUP_END) / (CONTACT - WINDUP_END);
      // A stab accelerates into contact instead of stopping between every
      // authored pose, which was what made the old swing feel mechanical.
      blend = THREE.MathUtils.clamp(local, 0, 1) ** 2;
    } else if (progress >= CONTACT && progress < FOLLOW_END) {
      fromPosition = HIT_POSITION;
      toPosition = FOLLOW_POSITION;
      fromRotation = HIT_QUATERNION;
      toRotation = FOLLOW_QUATERNION;
      local = (progress - CONTACT) / (FOLLOW_END - CONTACT);
      const clamped = THREE.MathUtils.clamp(local, 0, 1);
      blend = 1 - (1 - clamped) ** 2;
    } else if (progress >= FOLLOW_END) {
      fromPosition = FOLLOW_POSITION;
      toPosition = REST_POSITION;
      fromRotation = FOLLOW_QUATERNION;
      toRotation = REST_QUATERNION;
      local = (progress - FOLLOW_END) / (1 - FOLLOW_END);
      blend = smoothStep(THREE.MathUtils.clamp(local, 0, 1));
    }
    this.root.position.lerpVectors(fromPosition, toPosition, blend);
    this.root.quaternion.slerpQuaternions(fromRotation, toRotation, blend);
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
    blade.name = 'knife-blade';
    this.root.add(blade);

    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.31), edgeMaterial);
    edge.name = 'knife-edge';
    edge.position.set(-0.007, -0.018, -0.25);
    edge.rotation.x = -0.035;
    this.root.add(edge);

    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.035), darkMetal);
    guard.name = 'knife-guard';
    guard.position.z = -0.055;
    guard.rotation.z = 0.08;
    this.root.add(guard);
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.16, 4, 10), wood);
    grip.name = 'knife-grip';
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
    hand.name = 'knife-hand';
    hand.position.set(0.018, -0.018, 0.08);
    hand.scale.set(0.8, 1, 1.35);
    this.root.add(hand);
  }
}
