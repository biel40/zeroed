/**
 * Tuning of the first-person walking motion (head and weapon bob). Distances
 * are metres, angles radians. Both layers read the same gait (`WalkGait`), so
 * every footstep lands on the camera and on the weapon at once.
 */
export const WALK_BOB = {
  /** Ground covered by one footstep; a stride (two steps) is one full cycle. */
  stepLength: 1.5,
  /** Seconds for the motion to fade in or out on starting, stopping, jumping and landing. */
  transitionTime: 0.15,
  /** Camera offset only: it never rotates the view and never reaches the aim. */
  head: {
    /** Dip at each footfall. */
    vertical: 0.009,
    /** Shift towards the supporting foot, once per stride. */
    lateral: 0.005,
    /** Fraction removed at full aim down sights. */
    adsReduction: 0.7,
  },
  /** First-person weapon, on top of the head: the stronger of the two layers. */
  weapon: {
    vertical: 0.005,
    lateral: 0.006,
    roll: 0.011,
    /** Muzzle dip at each footfall. */
    pitch: 0.006,
    /** How far the weapon trails the body in the cycle, so it settles just after the foot. */
    phaseLag: 0.3,
    /** Fraction removed at full aim down sights. */
    adsReduction: 0.88,
  },
} as const;
