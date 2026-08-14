import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ZombieVisual, type ZombieModelSource } from '../src/zombies/ZombieVisual';
import type { ZombieState } from '../src/zombies/Zombie';

/**
 * Regression tests for the hit-reaction animation bug: bullet impacts used
 * to snap the zombie's walk cycle back to frame 0 (visible pop), re-pin the
 * flinch dip on every round of a burst (slow-motion foot sliding) and would
 * have strobed a real hit clip back to its first frame under sustained fire.
 *
 * The synthetic source mirrors the shipped walker GLB contract: spawn, walk
 * and attack clips, and — like the real asset — NO hit clip, so the flinch
 * falls back to the walk-cycle dip. A second source adds a hit clip to cover
 * the clip path.
 */

/** Minimal skinned humanoid: one named bone the clip tracks can bind to. */
function makeModel(): THREE.Group {
  const armature = new THREE.Group();
  const hip = new THREE.Bone();
  hip.name = 'Hips';
  armature.add(hip);

  const geometry = new THREE.CylinderGeometry(0.2, 0.2, 1.7, 6);
  geometry.translate(0, 0.85, 0); // feet at y=0, like the real assets
  const count = geometry.getAttribute('position').count;
  const skinIndices = new Uint16Array(count * 4);
  const skinWeights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) skinWeights[i * 4] = 1;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  const root = new THREE.Group();
  root.add(armature, mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([hip], [new THREE.Matrix4()]), new THREE.Matrix4());
  return root;
}

function bobClip(name: string, duration: number): THREE.AnimationClip {
  return new THREE.AnimationClip(name, duration, [
    new THREE.VectorKeyframeTrack('Hips.position', [0, duration], [0, 0.98, 0, 0, 1.05, 0]),
  ]);
}

/** Same clip set as the shipped walker GLB: no hit clip, no death clip. */
function makeWalkerSource(): ZombieModelSource {
  return {
    scene: makeModel(),
    clips: [bobClip('ZombieCrawl', 1), bobClip('ZombieWalk', 1), bobClip('ZombieBite', 0.6)],
  };
}

interface VisualInternals {
  actions: Map<ZombieState, THREE.AnimationAction>;
  currentAction: THREE.AnimationAction | null;
  hitDip: number;
}

function internals(visual: ZombieVisual): VisualInternals {
  return visual as unknown as VisualInternals;
}

const WALK_SPEED = 1.35; // == walkReferenceSpeed → walk timeScale factor 1
const DT = 1 / 60;

/** Steps the visual the way the game loop does: one update per frame. */
function step(visual: ZombieVisual, seconds: number, speed = WALK_SPEED): void {
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) visual.update(DT, speed);
}

describe('ZombieVisual hit reaction', () => {
  it('returns to walk after a clipless hit WITHOUT restarting the walk cycle', () => {
    const visual = new ZombieVisual('walker', makeWalkerSource(), 0xffffff, false);
    const walk = internals(visual).actions.get('walk')!;

    visual.setState('walk');
    visual.update(0.4, WALK_SPEED);
    const phaseBeforeHit = walk.time;
    expect(phaseBeforeHit).toBeGreaterThan(0.3);

    visual.setState('hit'); // no hit clip → dip on the still-playing walk
    visual.update(0.1, WALK_SPEED);
    visual.setState('walk');

    // The old reset() snapped this back to 0 — the visible animation jump.
    expect(walk.time).toBeGreaterThan(phaseBeforeHit);
    expect(internals(visual).currentAction).toBe(walk);
  });

  it('does not re-pin the flinch dip on every bullet of a burst', () => {
    const visual = new ZombieVisual('walker', makeWalkerSource(), 0xffffff, false);
    const walk = internals(visual).actions.get('walk')!;

    visual.setState('walk');
    step(visual, DT);
    visual.setState('hit');
    step(visual, 0.2); // dip mostly decayed: hitDip ≈ 0.3
    const settledTimeScale = walk.timeScale;
    expect(settledTimeScale).toBeGreaterThan(0.7);

    visual.setState('hit'); // second round of the burst lands mid-state
    step(visual, DT);

    // A re-pinned dip would drag timeScale back to ~0.25 (slow-motion stride).
    expect(walk.timeScale).toBeGreaterThan(0.7);
  });

  it('never restarts a real hit clip while it is already playing', () => {
    const source: ZombieModelSource = makeWalkerSource();
    source.clips.push(bobClip('ZombieHit', 0.5));
    const visual = new ZombieVisual('walker', source, 0xffffff, false);
    const hit = internals(visual).actions.get('hit')!;

    visual.setState('walk');
    visual.update(0.2, WALK_SPEED);
    visual.setState('hit');
    visual.update(0.1, WALK_SPEED);
    const timeAfterFirstHit = hit.time;
    expect(timeAfterFirstHit).toBeGreaterThan(0.1); // running at 1.4x

    visual.setState('hit'); // sustained fire re-enters the state
    visual.update(0.1, WALK_SPEED);

    // Strobing would show ~0.14 here (reset + one update); continuity shows ~0.28.
    expect(hit.time).toBeGreaterThan(timeAfterFirstHit + 0.1);
  });

  it('resumes the walk cycle seamlessly after an attack instead of snapping to frame 0', () => {
    const visual = new ZombieVisual('walker', makeWalkerSource(), 0xffffff, false);
    const walk = internals(visual).actions.get('walk')!;

    visual.setState('walk');
    step(visual, 0.4);
    const phaseBeforeAttack = walk.time;
    expect(phaseBeforeAttack).toBeGreaterThan(0.3);

    visual.setState('attack');
    // The faded-out walk keeps advancing ONLY through the crossfade window:
    // once the fade completes, three.js disables the action
    // (AnimationAction._updateWeight → enabled = false, then _update
    // early-returns) and its phase freezes. It does NOT keep running at
    // zero weight for the whole attack.
    step(visual, 0.5);
    visual.setState('walk');

    expect(internals(visual).currentAction).toBe(walk);
    // Continuity, never a restart: the old reset() dropped this to 0.
    expect(walk.time).toBeGreaterThan(phaseBeforeAttack);
    // …but it only gained the crossfade window (~0.167s), not the full attack.
    expect(walk.time).toBeLessThan(phaseBeforeAttack + 0.3);

    // And the resumed cycle keeps advancing from the live phase.
    const phaseOnResume = walk.time;
    step(visual, 0.2);
    expect(walk.time).toBeGreaterThan(phaseOnResume);
  });

  it('still restarts one-shot states on a genuine re-entry', () => {
    const visual = new ZombieVisual('walker', makeWalkerSource(), 0xffffff, false);
    const attack = internals(visual).actions.get('attack')!;

    visual.setState('attack');
    visual.update(0.3, WALK_SPEED);
    expect(attack.time).toBeGreaterThan(0.1);

    visual.setState('walk');
    visual.update(0.05, WALK_SPEED);
    visual.setState('attack'); // a NEW attack must play from the start

    expect(attack.time).toBe(0);
  });
});
