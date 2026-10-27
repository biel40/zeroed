import type { WeaponDefinition, WeaponId } from '../weapons/WeaponTypes';

/**
 * Declarative weapon definitions. Values are tuned for game feel, not for
 * matching real ballistic tables: recoil angles are radians, spread is a
 * cone half-angle in radians, velocities are m/s.
 */
export const WEAPON_DEFINITIONS: Record<WeaponId, WeaponDefinition> = {
  /**
   * M1911 — the Zombies starting pistol. Deliberately a sidearm: modest
   * torso damage, light recoil, fast ADS
   * and a showy but unhurried reload. Precise players stretch it through early rounds;
   * raw damage per magazine keeps it from competing with the box weapons.
   * Detailed procedural view model (no CC0 GLB exists), finite 8 / 64 ammunition.
   */
  m1911: {
    id: 'm1911',
    name: 'M1911',
    fireModes: ['semi'],
    defaultFireMode: 'semi',
    rpm: 360,
    magazineSize: 8,
    reserveAmmo: 64,
    reloadTime: 3.1,
    tacticalReloadTime: 2.3,
    boltAction: false,
    boltCycleTime: 0,
    scoped: false,
    damage: 30,
    recoil: {
      verticalKick: 0.011,
      horizontalKick: 0.003,
      horizontalBias: 0,
      kickVariance: 0.2,
      recoverySpeed: 12,
      recoveryDelay: 0.06,
      cameraShare: 0.5,
      adsRecoilMultiplier: 0.7,
    },
    spread: {
      hipBase: 0.008,
      adsBase: 0.0015,
      bloomPerShot: 0.002,
      maxBloom: 0.012,
      bloomRecovery: 0.08,
    },
    ads: { fov: 58, speed: 12, sensitivity: 0.75 },
    projectile: { muzzleVelocity: 260, gravity: 9.8, maxDistance: 200, drag: 0.08 },
    moveSpeedMultiplier: 1.04,
    equipTime: 0.28,
    audio: { volume: 0.45, duration: 0.07, lowpass: 4200, thump: 210 },
    view: {
      // No GLB: dedicated procedural pistol builder (see WeaponView).
      frame: 'pistol',
      hip: [0.14, -0.205, -0.46],
      ads: [0, 0, -0.41],
      sway: 0.7,
      bob: 0.85,
      visualRecoil: { kickImpulse: 0.7, pitchImpulse: 1.9, rollImpulse: 0.5, stiffness: 220, damping: 18 },
      scale: 1,
      bodyColor: 0x202329,
      accentColor: 0x59301c,
      barrelLength: 0.12,
      barrelRadius: 0.0085,
      receiverLength: 0.19,
      stockLength: 0,
      magazine: 'straight',
      optic: 'irons',
      sightHeight: 0.047,
      bulk: 0.75,
      // Two-handed: the support hand wraps the shooting hand and racks the slide.
      hands: {
        right: {
          position: [0, -0.068, 0.075], axis: [0, 1, -0.087], palm: [-1, -0.1, 0], pose: 'pistolGrip',
          hold: { size: [0.0336, 0.064], axis: [0, 0.956, -0.292] }, trigger: [0, -0.038, -0.001],
        },
        // Thumbs forward: the support palm fills the grip's left flank and its
        // fingers wrap the shooting hand's from the front.
        left: {
          position: [0.016, -0.086, 0.084], axis: [-0.05, 0.99, -0.05], palm: [0.94, 0.1, 0.33], pose: 'supportPistol',
          hold: { size: [0.074, 0.08], axis: [0, 0.956, -0.292] },
        },
        actionHand: 'left',
        // Overhand on the rear serrations: the palm on the slide's upper left
        // edge, the fingers over the top onto the right flank and the thumb
        // back along the left one; the forearm rises from below left.
        action: {
          position: [0, 0, 0.072], axis: [0, -0.25, 1], palm: [0.88, -0.47, 0], pose: 'magazineGrab',
          hold: { size: [0.035, 0.034], axis: [0, 0, -1] },
        },
        // Cupped under the baseplate, wrist low on the near side: the fingers
        // climb the far flank, so the whole tube and its top round show
        // above the hand, and the palm drives it home.
        magazine: {
          position: [0, -0.0025, 0], axis: [0, 0, -1], palm: [-0.45, 0.89, 0], pose: 'supportHandguard',
          hold: { size: [0.019, 0.11], axis: [0, 0, 1] },
        },
      },
      reloadAnim: {
        style: 'pistol',
        magOut: 0.1,
        magDrop: 0.22,
        magIn: 0.36,
        magSeat: 0.68,
        charge: 0.74,
        chargeEnd: 0.9,
        // Up to the screen center, left flank to the eye; a softer turn for the slide release.
        swapPose: { shift: [-0.09, 0.18, 0.03], yaw: 0.65, roll: -0.3, tilt: 0.12 },
        rackPose: { shift: [-0.06, 0.08, 0.02], yaw: 0.35, roll: -0.12, tilt: 0.15 },
        wellDepth: 1,
        // Real 1911 single-stack proportions: it fills the grip from the
        // baseplate up under the slide, about three times deeper than wide.
        magSize: [0.015, 0.105, 0.034],
        magColor: 0x23262b,
      },
    },
  },

  m4a1: {
    id: 'm4a1',
    name: 'M4A1',
    fireModes: ['auto', 'semi'],
    defaultFireMode: 'auto',
    rpm: 800,
    magazineSize: 30,
    reloadTime: 2.8,
    tacticalReloadTime: 2.2,
    boltAction: false,
    boltCycleTime: 0,
    scoped: false,
    damage: 34,
    recoil: {
      verticalKick: 0.0105,
      horizontalKick: 0.0035,
      horizontalBias: 0,
      kickVariance: 0.25,
      recoverySpeed: 9,
      recoveryDelay: 0.08,
      cameraShare: 0.6,
      adsRecoilMultiplier: 0.75,
    },
    spread: {
      hipBase: 0.014,
      adsBase: 0.0025,
      bloomPerShot: 0.0018,
      maxBloom: 0.02,
      bloomRecovery: 0.03,
    },
    heat: { shotsToOverheat: 22, coolTime: 5, maxSpreadBonus: 0.012 },
    ads: { fov: 55, speed: 9, sensitivity: 0.7 },
    projectile: { muzzleVelocity: 880, gravity: 9.8, maxDistance: 400, drag: 0.04 },
    moveSpeedMultiplier: 1,
    equipTime: 0.35,
    audio: { volume: 0.5, duration: 0.08, lowpass: 3400, thump: 170 },
    view: {
      frame: 'm4a1',
      hip: [0.19, -0.19, -0.4],
      ads: [0, 0, -0.3],
      sway: 1,
      bob: 1,
      visualRecoil: { kickImpulse: 0.9, pitchImpulse: 1.6, rollImpulse: 0.5, stiffness: 180, damping: 16 },
      scale: 1,
      bodyColor: 0x303439,
      accentColor: 0x1b1e20,
      barrelLength: 0.3,
      barrelRadius: 0.011,
      receiverLength: 0.24,
      stockLength: 0.2,
      magazine: 'straight',
      optic: 'irons',
      sightHeight: 0.075,
      bulk: 1,
      hands: {
        right: {
          position: [0, -0.08, 0.028], axis: [0, 1, -0.14], palm: [-1, -0.1, 0], pose: 'rifleGrip',
          hold: { size: [0.033, 0.044], axis: [0, 0.94, -0.34] }, trigger: [0, -0.045, -0.051],
        },
        left: {
          position: [0, 0.01, -0.29], axis: [-0.375, -0.167, -0.912], palm: [-0.53, 0.846, 0.063], pose: 'supportHandguard',
          hold: { size: [0.06, 0.058], axis: [0, 0, -1] },
        },
        // The charging-handle latch is on the left: the support hand racks it.
        actionHand: 'left',
        action: { position: [-0.026, 0.004, 0.008], axis: [0.33, 0.74, 0.55], palm: [0.37, -0.65, 0.65], pose: 'boltPinch' },
        // Cupped under the baseplate, tilted with the magazine's slight curve.
        magazine: {
          position: [0, -0.068, 0.014], axis: [0, -0.16, -0.987], palm: [-0.45, 0.879, -0.142], pose: 'supportHandguard',
          hold: { size: [0.031, 0.11], axis: [0, 0.16, 0.987] },
        },
      },
      reloadAnim: {
        style: 'rifle',
        magOut: 0.1,
        magDrop: 0.22,
        magIn: 0.4,
        magSeat: 0.66,
        charge: 0.72,
        chargeEnd: 0.9,
        // Magwell turned to the eye; then the rear of the upper raised to the charging handle.
        swapPose: { shift: [-0.1, 0.13, 0.03], yaw: 0.4, roll: -0.25, tilt: 0.1 },
        rackPose: { shift: [-0.06, 0.09, 0.02], yaw: 0.15, roll: -0.1, tilt: -0.06 },
        wellDepth: 0.33,
        magSize: [0.025, 0.18, 0.066],
        magColor: 0x2c3033,
        magAnchor: [0, -0.06, -0.1],
        magRotation: [0.12, 0, 0],
      },
    },
  },

  /**
   * MP5A3 — 9x19 roller-delayed SMG (30-round curved magazine, ~400 m/s).
   * The cheap early automatic, one clear tier under the rifles: ~260 DPS
   * against the AK-47's 400, five torso hits on a round-1 zombie, a
   * magazine worth two thirds of an M4A1's and a short reserve. Quick to
   * handle, but its bloom punishes long bursts. The cyclic rate is trimmed
   * to 700 (MP5SD-like) for balance. Procedural model: MP5ViewModel.ts.
   */
  mp5: {
    id: 'mp5',
    name: 'MP5',
    fireModes: ['auto', 'semi'],
    defaultFireMode: 'auto',
    rpm: 700,
    magazineSize: 30,
    reloadTime: 2.8,
    tacticalReloadTime: 2.2,
    boltAction: false,
    boltCycleTime: 0,
    scoped: false,
    damage: 22,
    recoil: {
      verticalKick: 0.0092,
      horizontalKick: 0.0042,
      horizontalBias: 0.1,
      kickVariance: 0.28,
      recoverySpeed: 10,
      recoveryDelay: 0.08,
      cameraShare: 0.55,
      adsRecoilMultiplier: 0.75,
    },
    spread: {
      hipBase: 0.013,
      adsBase: 0.0035,
      bloomPerShot: 0.0024,
      maxBloom: 0.026,
      bloomRecovery: 0.03,
    },
    heat: { shotsToOverheat: 22, coolTime: 4.5, maxSpreadBonus: 0.014 },
    ads: { fov: 58, speed: 11, sensitivity: 0.72 },
    projectile: { muzzleVelocity: 400, gravity: 9.8, maxDistance: 200, drag: 0.08 },
    moveSpeedMultiplier: 1.03,
    equipTime: 0.3,
    // Pistol-calibre report: higher and drier than the rifles, with the
    // roller-delayed bolt clacking back after each shot.
    audio: { volume: 0.44, duration: 0.07, lowpass: 3900, thump: 190, mechanism: 0.12 },
    view: {
      frame: 'mp5',
      hip: [0.18, -0.18, -0.38],
      ads: [0, 0, -0.29],
      sway: 0.9,
      bob: 0.95,
      visualRecoil: { kickImpulse: 0.75, pitchImpulse: 1.3, rollImpulse: 0.45, stiffness: 200, damping: 17 },
      scale: 1,
      // Black-finished stamped steel and black polymer furniture.
      bodyColor: 0x2c2f33,
      accentColor: 0x17191b,
      barrelLength: 0.225,
      barrelRadius: 0.0085,
      receiverLength: 0.284,
      stockLength: 0.22,
      magazine: 'curved',
      optic: 'irons',
      // Apex of the hooded front post, seen through the drum aperture.
      sightHeight: 0.066,
      bulk: 0.9,
      // Same grip section and rake as the M4A1; the support hand cups the
      // slim handguard under the cocking tube.
      hands: {
        right: {
          position: [0, -0.11, 0.028], axis: [0, 1, -0.14], palm: [-1, -0.1, 0], pose: 'rifleGrip',
          hold: { size: [0.033, 0.044], axis: [0, 0.94, -0.34] }, trigger: [0, -0.075, -0.051],
        },
        left: {
          position: [0, 0.008, -0.27], axis: [-0.375, -0.167, -0.912], palm: [-0.53, 0.846, 0.063], pose: 'supportHandguard',
          hold: { size: [0.044, 0.046], axis: [0, 0, -1] },
        },
        // The cocking handle folds out on the left of the tube: the support hand racks it.
        actionHand: 'left',
        action: { position: [-0.026, 0, -0.003], axis: [0.33, 0.74, 0.55], palm: [0.37, -0.65, 0.65], pose: 'boltPinch' },
        // Cupped under the baseplate, tilted with the curve of the magazine.
        magazine: {
          position: [0, -0.098, -0.014], axis: [0, 0.296, -0.955], palm: [-0.45, 0.85, 0.263], pose: 'supportHandguard',
          hold: { size: [0.027, 0.11], axis: [0, -0.296, 0.955] },
        },
      },
      reloadAnim: {
        style: 'rifle',
        magOut: 0.1,
        magDrop: 0.22,
        magIn: 0.4,
        magSeat: 0.66,
        charge: 0.72,
        chargeEnd: 0.9,
        // Magwell turned to the eye; then the cocking tube's handle on the left.
        swapPose: { shift: [-0.1, 0.13, 0.03], yaw: 0.4, roll: -0.25, tilt: 0.1 },
        rackPose: { shift: [-0.07, 0.08, 0.02], yaw: 0.3, roll: -0.15, tilt: 0.06 },
        wellDepth: 0.35,
        magSize: [0.022, 0.15, 0.042],
        magColor: 0x1c1e20,
      },
    },
  },

  /**
   * KRISS Vector Gen II — 9x19 SMG whose off-axis "Super V" action drives
   * the recoil down, firing ~1200 rpm from a 30-round extended magazine.
   * The hose: the highest cadence in the game with very little damage per
   * hit (seven torso hits on a round-1 zombie, ~300 DPS) and very little
   * reach — heavy drag and a 35 m maximum range. Its strength is control:
   * the softest per-shot kick and the fastest recovery of every firearm.
   * Dedicated procedural view model (see VectorViewModel.ts).
   */
  vector: {
    id: 'vector',
    name: 'Vector',
    fireModes: ['auto', 'semi'],
    defaultFireMode: 'auto',
    rpm: 1200,
    magazineSize: 30,
    reloadTime: 2.9,
    tacticalReloadTime: 2.3,
    boltAction: false,
    boltCycleTime: 0,
    scoped: false,
    damage: 15,
    recoil: {
      verticalKick: 0.0042,
      horizontalKick: 0.0022,
      horizontalBias: -0.05,
      kickVariance: 0.2,
      recoverySpeed: 14,
      recoveryDelay: 0.05,
      cameraShare: 0.5,
      adsRecoilMultiplier: 0.6,
    },
    spread: {
      hipBase: 0.015,
      adsBase: 0.0055,
      bloomPerShot: 0.0011,
      maxBloom: 0.02,
      bloomRecovery: 0.04,
    },
    heat: { shotsToOverheat: 25, coolTime: 4.5, maxSpreadBonus: 0.014 },
    ads: { fov: 58, speed: 11, sensitivity: 0.72 },
    projectile: { muzzleVelocity: 380, gravity: 9.8, maxDistance: 35, drag: 0.25 },
    moveSpeedMultiplier: 1.02,
    equipTime: 0.3,
    // Short, dry pistol-calibre snaps that stay distinct at 20 shots a second.
    audio: { volume: 0.38, duration: 0.05, lowpass: 4300, thump: 210, mechanism: 0.05 },
    view: {
      frame: 'vector',
      // Pushed out like the M4A1 so the tall stock stays low in the corner.
      hip: [0.19, -0.2, -0.41],
      ads: [0, 0, -0.3],
      sway: 0.9,
      bob: 0.95,
      // Light, fast-settling kick: the action soaks most of the impulse.
      visualRecoil: { kickImpulse: 0.55, pitchImpulse: 0.9, rollImpulse: 0.3, stiffness: 240, damping: 20 },
      scale: 1,
      // Black anodised upper and black polymer lower, stock and magazine.
      bodyColor: 0x26292d,
      accentColor: 0x17191b,
      barrelLength: 0.14,
      barrelRadius: 0.0082,
      receiverLength: 0.36,
      stockLength: 0.23,
      magazine: 'straight',
      optic: 'irons',
      // Tip of the folding front post, seen through the rear aperture.
      sightHeight: 0.085,
      bulk: 0.95,
      // Same grip as the M4A1. The support hand takes the classic Vector
      // magwell hold: palm on the left flank of the well, fingers round its
      // front, thumb up toward the charging handle.
      hands: {
        right: {
          position: [0, -0.08, 0.028], axis: [0, 1, -0.14], palm: [-1, -0.1, 0], pose: 'rifleGrip',
          hold: { size: [0.033, 0.044], axis: [0, 0.94, -0.34] }, trigger: [0, -0.045, -0.051],
        },
        left: {
          position: [0, -0.074, -0.192], axis: [0, 0.97, -0.24], palm: [1, 0, 0], pose: 'supportMagwell',
          hold: { size: [0.04, 0.05], axis: [0, 0.97, -0.24] },
        },
        // The charging handle rides on the left of the upper: the support hand racks it.
        actionHand: 'left',
        action: { position: [-0.008, 0, -0.012], axis: [0.33, 0.74, 0.55], palm: [0.37, -0.65, 0.65], pose: 'boltPinch' },
        // Cupped under the baseplate of the long straight magazine.
        magazine: {
          position: [0, -0.121, 0.011], axis: [0, -0.06, -0.998], palm: [-0.45, 0.888, -0.053], pose: 'supportHandguard',
          hold: { size: [0.028, 0.11], axis: [0, 0.06, 0.998] },
        },
      },
      reloadAnim: {
        style: 'rifle',
        magOut: 0.1,
        magDrop: 0.22,
        magIn: 0.4,
        magSeat: 0.66,
        charge: 0.72,
        chargeEnd: 0.9,
        // Higher than the others for the long magazine; then the handle on the left of the upper.
        swapPose: { shift: [-0.1, 0.15, 0.03], yaw: 0.4, roll: -0.25, tilt: 0.1 },
        rackPose: { shift: [-0.07, 0.08, 0.02], yaw: 0.3, roll: -0.15, tilt: 0.08 },
        wellDepth: 0.22,
        magSize: [0.022, 0.22, 0.034],
        magColor: 0x1a1c1e,
      },
    },
  },

  /** Drum-fed Soviet SMG: sustained close-range fire traded for a heavy, slower reload. */
  ppsh41: {
    id: 'ppsh41',
    name: 'PPSh-41',
    fireModes: ['auto', 'semi'],
    defaultFireMode: 'auto',
    rpm: 900,
    magazineSize: 71,
    reloadTime: 3.8,
    tacticalReloadTime: 3.1,
    boltAction: false,
    boltCycleTime: 0,
    scoped: false,
    damage: 22,
    recoil: {
      verticalKick: 0.0085,
      horizontalKick: 0.0045,
      horizontalBias: 0.12,
      kickVariance: 0.3,
      recoverySpeed: 10,
      recoveryDelay: 0.075,
      cameraShare: 0.55,
      adsRecoilMultiplier: 0.72,
    },
    spread: {
      hipBase: 0.016,
      adsBase: 0.004,
      bloomPerShot: 0.0017,
      maxBloom: 0.027,
      bloomRecovery: 0.035,
    },
    // The barrel hides inside the perforated jacket: the glow wraps the jacket nose.
    heat: { shotsToOverheat: 40, coolTime: 5, maxSpreadBonus: 0.014, glow: { radius: 0.026, length: 0.09 } },
    ads: { fov: 58, speed: 10, sensitivity: 0.72 },
    projectile: { muzzleVelocity: 488, gravity: 9.8, maxDistance: 150, drag: 0.1 },
    moveSpeedMultiplier: 0.98,
    equipTime: 0.38,
    // Sharp pistol-calibre report over a distinctly heavier open-bolt clatter.
    audio: { volume: 0.43, duration: 0.06, lowpass: 4600, thump: 195, mechanism: 0.16, tail: 0.07 },
    view: {
      frame: 'ppsh41',
      hip: [0.19, -0.19, -0.52],
      ads: [0, 0, -0.3],
      sway: 0.95,
      bob: 0.95,
      visualRecoil: { kickImpulse: 0.8, pitchImpulse: 1.4, rollImpulse: 0.5, stiffness: 210, damping: 18 },
      scale: 1,
      bodyColor: 0x292d30,
      accentColor: 0x995025,
      barrelLength: 0.269,
      barrelRadius: 0.008,
      receiverLength: 0.25,
      stockLength: 0.35,
      magazine: 'drum',
      optic: 'irons',
      sightHeight: 0.042,
      bulk: 1,
      hands: {
        right: {
          position: [0, -0.058, 0.125], axis: [0, 0.98, -0.2], palm: [-1, -0.1, 0.2], pose: 'stockGrip',
          hold: { size: [0.032, 0.05], axis: [0, 1, 0] }, trigger: [0, -0.071, 0.015],
        },
        left: {
          position: [0, -0.044, -0.035], axis: [-0.375, -0.167, -0.912], palm: [-0.53, 0.846, 0.063], pose: 'supportHandguard',
          hold: { size: [0.033, 0.034], axis: [0, 0, -1] },
        },
        actionHand: 'right',
        action: { position: [0.012, 0, 0], axis: [0.25, 0.9, 0.35], palm: [-0.9, 0.3, -0.15], pose: 'boltPinch' },
        magazine: {
          position: [0, -0.125, 0.005], axis: [0, 0, -1], palm: [-0.45, 0.89, 0], pose: 'supportHandguard',
          hold: { size: [0.095, 0.048], axis: [0, 0, 1] },
        },
      },
      reloadAnim: {
        style: 'drum',
        magOut: 0.1,
        magDrop: 0.24,
        magIn: 0.4,
        magSeat: 0.67,
        charge: 0.74,
        chargeEnd: 0.92,
        swapPose: { shift: [-0.1, 0.15, 0.02], yaw: 0.5, roll: -0.25, tilt: 0.12 },
        rackPose: { shift: [-0.06, 0.1, 0.01], yaw: -0.4, roll: 0.2, tilt: 0.08 },
        wellDepth: 0.18,
        magSize: [0.146, 0.15, 0.048],
        magColor: 0x25292c,
      },
    },
  },

  ak47: {
    id: 'ak47',
    name: 'AK-47',
    fireModes: ['auto', 'semi'],
    defaultFireMode: 'auto',
    rpm: 600,
    magazineSize: 30,
    reloadTime: 3,
    tacticalReloadTime: 2.4,
    boltAction: false,
    boltCycleTime: 0,
    scoped: false,
    damage: 40,
    recoil: {
      verticalKick: 0.016,
      horizontalKick: 0.0065,
      horizontalBias: 0.2,
      kickVariance: 0.3,
      recoverySpeed: 7.5,
      recoveryDelay: 0.1,
      cameraShare: 0.62,
      adsRecoilMultiplier: 0.8,
    },
    spread: {
      hipBase: 0.016,
      adsBase: 0.0035,
      bloomPerShot: 0.003,
      maxBloom: 0.035,
      bloomRecovery: 0.025,
    },
    heat: { shotsToOverheat: 20, coolTime: 5, maxSpreadBonus: 0.014 },
    ads: { fov: 55, speed: 8, sensitivity: 0.7 },
    projectile: { muzzleVelocity: 715, gravity: 9.8, maxDistance: 400, drag: 0.05 },
    moveSpeedMultiplier: 0.96,
    equipTime: 0.4,
    // 7.62x39 bark: lower and heavier than the 5.56 M4, a short crack, the
    // long-stroke carrier slamming home and a brief room echo.
    audio: { volume: 0.66, duration: 0.12, lowpass: 2300, thump: 104, crack: 0.24, tail: 0.42, mechanism: 0.2 },
    view: {
      // No GLB: dedicated AK-47 Type 3 builder (see AK47ViewModel.ts).
      hip: [0.19, -0.195, -0.4],
      ads: [0, 0, -0.3],
      sway: 1.05,
      bob: 1,
      visualRecoil: { kickImpulse: 1.25, pitchImpulse: 2.4, rollImpulse: 0.9, stiffness: 140, damping: 13 },
      scale: 1,
      // Blued steel (a metal's color is its reflectance, so it reads dark
      // without being black) + lacquered reddish birch (grain is procedural).
      bodyColor: 0x3a3e43,
      accentColor: 0x7e3f1e,
      barrelLength: 0.415,
      barrelRadius: 0.0105,
      receiverLength: 0.28,
      stockLength: 0.23,
      magazine: 'curved',
      optic: 'irons',
      sightHeight: 0.046,
      bulk: 1.02,
      frame: 'ak47',
      hands: {
        right: {
          position: [0, -0.088, 0.074], axis: [0, 1, -0.03], palm: [-1, -0.1, 0], pose: 'rifleGrip',
          hold: { size: [0.03, 0.057], axis: [0, 0.972, -0.233] }, trigger: [0, -0.058, 0.001],
        },
        // Under the lower handguard, fingers over the upper one.
        left: {
          position: [0, 0.004, -0.25], axis: [-0.375, -0.167, -0.912], palm: [-0.53, 0.846, 0.063], pose: 'supportHandguard',
          hold: { size: [0.044, 0.072], axis: [0, 0, -1] },
        },
        action: { position: [0.03, 0.007, -0.004], axis: [0, 1, 0], palm: [-1, 0, 0], pose: 'boltPinch' },
        // Cupped under the baseplate, tilted with the strong curve of the magazine.
        magazine: {
          position: [0, -0.137, -0.042], axis: [0, 0.523, -0.853], palm: [-0.45, 0.759, 0.465], pose: 'supportHandguard',
          hold: { size: [0.035, 0.11], axis: [0, -0.523, 0.853] },
        },
      },
      reloadAnim: {
        style: 'rock',
        magOut: 0.08,
        magDrop: 0.22,
        magIn: 0.4,
        magSeat: 0.64,
        charge: 0.71,
        chargeEnd: 0.89,
        // Magwell turned to the eye; then the right flank up to the right-side charging handle.
        swapPose: { shift: [-0.1, 0.13, 0.03], yaw: 0.4, roll: -0.25, tilt: 0.1 },
        rackPose: { shift: [-0.07, 0.09, 0.02], yaw: -0.3, roll: 0.45, tilt: 0.06 },
        wellDepth: 0.06,
        magSize: [0.03, 0.19, 0.059],
        // Blued stamped-steel 30-round magazine, a shade lighter than the receiver.
        magColor: 0x404347,
      },
    },
  },

  m60: {
    id: 'm60',
    name: 'M60',
    fireModes: ['auto'],
    defaultFireMode: 'auto',
    rpm: 550,
    magazineSize: 100,
    reloadTime: 5.8,
    tacticalReloadTime: 4.9,
    boltAction: false,
    boltCycleTime: 0,
    scoped: false,
    damage: 32,
    recoil: {
      verticalKick: 0.019,
      horizontalKick: 0.009,
      horizontalBias: -0.1,
      kickVariance: 0.35,
      recoverySpeed: 6,
      recoveryDelay: 0.12,
      cameraShare: 0.68,
      adsRecoilMultiplier: 0.85,
    },
    spread: {
      hipBase: 0.02,
      adsBase: 0.006,
      bloomPerShot: 0.0045,
      maxBloom: 0.06,
      bloomRecovery: 0.02,
    },
    heat: { shotsToOverheat: 30, coolTime: 6, maxSpreadBonus: 0.016 },
    ads: { fov: 62, speed: 4, sensitivity: 0.8 },
    projectile: { muzzleVelocity: 850, gravity: 9.8, maxDistance: 500, drag: 0.05 },
    moveSpeedMultiplier: 0.82,
    equipTime: 0.55,
    audio: { volume: 0.65, duration: 0.11, lowpass: 2200, thump: 110 },
    view: {
      // No GLB: dedicated M60 builder traced from a reference photo (see M60ViewModel.ts).
      frame: 'lmg',
      hip: [0.28, -0.26, -0.52],
      ads: [0, 0, -0.31],
      sway: 0.7,
      bob: 0.8,
      visualRecoil: { kickImpulse: 1.5, pitchImpulse: 2.0, rollImpulse: 1.2, stiffness: 90, damping: 11 },
      scale: 1,
      // Parkerized steel and black polymer furniture.
      bodyColor: 0x35383b,
      accentColor: 0x1e1f21,
      barrelLength: 0.56,
      barrelRadius: 0.0148,
      receiverLength: 0.3,
      stockLength: 0.2,
      magazine: 'box',
      optic: 'irons',
      // Apex of the tall front sight, seen through the raised rear aperture.
      sightHeight: 0.1117,
      bulk: 1.35,
      hands: {
        right: {
          position: [0, -0.1155, 0.059], axis: [0, 1, -0.05], palm: [-1, -0.1, 0], pose: 'rifleGrip',
          hold: { size: [0.032, 0.053], axis: [0, 0.996, -0.084] }, trigger: [0, -0.088, 0],
        },
        // Under the ribbed forearm, fingers up its flank below the heat shield.
        left: {
          position: [0, -0.022, -0.215], axis: [-0.375, -0.167, -0.912], palm: [-0.53, 0.846, 0.063], pose: 'supportHandguard',
          hold: { size: [0.06, 0.111], axis: [0, 0, -1] },
        },
        action: { position: [0.014, 0, 0.002], axis: [0, 1, 0], palm: [-1, 0, 0], pose: 'boltPinch' },
        magazine: { position: [0, -0.084, 0], axis: [0, 0, -1], palm: [0, 1, 0], pose: 'magazineGrab' },
      },
      reloadAnim: {
        style: 'belt',
        magOut: 0.04,
        magDrop: 0.12,
        coverOpen: 0.18,
        magIn: 0.34,
        magSeat: 0.48,
        coverClose: 0.68,
        charge: 0.76,
        chargeEnd: 0.92,
        // Feed tray and belt box brought up to the eye; then the right-side charging handle.
        swapPose: { shift: [-0.12, 0.14, 0.04], yaw: 0.25, roll: -0.15, tilt: 0.05 },
        rackPose: { shift: [-0.08, 0.1, 0.02], yaw: -0.3, roll: 0.5, tilt: 0.05 },
        // Olive-drab 100-round belt pouch.
        magSize: [0.068, 0.128, 0.158],
        magColor: 0x4d5136,
      },
    },
  },

  l96: {
    id: 'l96',
    name: 'L96',
    fireModes: ['semi'],
    defaultFireMode: 'semi',
    rpm: 60,
    magazineSize: 5,
    // Unhurried: the rifle is shown whole while the box magazine is swapped.
    reloadTime: 3,
    tacticalReloadTime: 2.4,
    boltAction: true,
    boltCycleTime: 0.7,
    scoped: true,
    damage: 1000,
    recoil: {
      verticalKick: 0.045,
      horizontalKick: 0.004,
      horizontalBias: 0,
      kickVariance: 0.15,
      recoverySpeed: 5,
      recoveryDelay: 0.25,
      cameraShare: 0.85,
      adsRecoilMultiplier: 0.9,
    },
    spread: {
      hipBase: 0.02,
      adsBase: 0.0004,
      bloomPerShot: 0.004,
      maxBloom: 0.01,
      bloomRecovery: 0.02,
    },
    ads: { fov: 16, speed: 5, sensitivity: 0.35 },
    projectile: { muzzleVelocity: 900, gravity: 9.8, maxDistance: 600, drag: 0.03 },
    moveSpeedMultiplier: 0.9,
    equipTime: 0.5,
    // Full-power 7.62 report: supersonic crack, heavy body and a room echo.
    audio: { volume: 0.85, duration: 0.3, lowpass: 2100, thump: 82, crack: 0.42, tail: 0.9 },
    view: {
      // No GLB: dedicated L96A1 builder (see L96ViewModel.ts).
      frame: 'l96',
      hip: [0.16, -0.185, -0.33],
      ads: [0, 0, -0.32],
      sway: 1.1,
      bob: 0.9,
      visualRecoil: { kickImpulse: 1.1, pitchImpulse: 3.2, rollImpulse: 1.0, stiffness: 110, damping: 15 },
      scale: 1,
      // Parkerized action/barrel + Accuracy International olive-green stock.
      bodyColor: 0x1d2023,
      accentColor: 0x4f5834,
      barrelLength: 0.63,
      barrelRadius: 0.0125,
      receiverLength: 0.256,
      stockLength: 0.28,
      magazine: 'box',
      optic: 'scope',
      sightHeight: 0.062,
      bulk: 1.1,
      // The thumb of the shooting hand passes through the thumbhole.
      hands: {
        right: {
          position: [0, -0.098, 0.075], axis: [0, 1, -0.035], palm: [-1, -0.1, 0], pose: 'rifleGrip',
          hold: { size: [0.055, 0.058], axis: [0, 0.97, -0.242] }, trigger: [0, -0.066, -0.002],
        },
        left: {
          position: [0, -0.0295, -0.28], axis: [-0.375, -0.167, -0.912], palm: [-0.53, 0.846, 0.063], pose: 'supportHandguard',
          hold: { size: [0.055, 0.043], axis: [0, 0, -1] },
        },
        action: { position: [0.05, -0.014, 0.055], axis: [0, 1, 0], palm: [-1, 0.3, 0], pose: 'boltPinch' },
        // Cupped under the short box magazine.
        magazine: {
          position: [0, -0.0065, 0.002], axis: [0, 0, -1], palm: [-0.45, 0.89, 0], pose: 'supportHandguard',
          hold: { size: [0.033, 0.097], axis: [0, 0, 1] },
        },
      },
      reloadAnim: {
        style: 'bolt',
        magOut: 0.1,
        magDrop: 0.28,
        magIn: 0.44,
        magSeat: 0.68,
        charge: 0.76,
        chargeEnd: 0.97,
        // The long rifle swings out across the screen, left flank to the eye,
        // for the magazine swap, then goes back on the shoulder for the bolt.
        swapPose: { shift: [-0.07, 0.05, -0.24], yaw: 0.5, roll: -0.24, tilt: -0.08 },
        rackPose: { shift: [-0.02, 0.03, 0], yaw: -0.1, roll: 0.22, tilt: -0.1 },
        magSize: [0.028, 0.09, 0.07],
        // Blued steel 5-round detachable box magazine.
        magColor: 0x17191b,
      },
    },
  },

  barrett: {
    id: 'barrett',
    name: 'BARRETT .50',
    muzzleFlash: { length: 0.7, width: 0.24, sideLength: 0.55, coreScale: 2.2, duration: 0.14, lightIntensity: 28 },
    shellCasing: 'bmg50',
    fireModes: ['semi'],
    defaultFireMode: 'semi',
    rpm: 150,
    magazineSize: 7,
    reloadTime: 4.2,
    tacticalReloadTime: 3.4,
    boltAction: false,
    boltCycleTime: 0,
    scoped: true,
    damage: 1800,
    // Four rounds faster than the cool delay redline the barrel and lock
    // the trigger until it has fully cooled (~4 s); the glow covers the
    // brake and the exposed barrel behind it.
    heat: { shotsToOverheat: 4, coolTime: 3.2, coolDelay: 0.6, lockout: true, maxSpreadBonus: 0.014, glow: { radius: 0.055, length: 0.3 } },
    // The arrowhead brake vents thick clouds to both sides on every shot.
    muzzleSmoke: { puffs: 6, scale: 1.8, life: 1.6 },
    recoil: {
      verticalKick: 0.19, horizontalKick: 0.02, horizontalBias: 0,
      kickVariance: 0.15, recoverySpeed: 4, recoveryDelay: 0.28,
      cameraShare: 0.85, adsRecoilMultiplier: 1,
      // A .50 BMG punch: a hard snap of the view and the shooter rocked ~11 cm back.
      cameraJolt: 0.075, playerPush: 1.6,
    },
    spread: { hipBase: 0.03, adsBase: 0.0005, bloomPerShot: 0.006, maxBloom: 0.018, bloomRecovery: 0.024 },
    ads: { fov: 16, speed: 3.5, sensitivity: 0.35 },
    // A .50 round punches through up to five zombies in a line.
    projectile: { muzzleVelocity: 850, gravity: 9.8, maxDistance: 700, drag: 0.025, maxTargets: 5 },
    moveSpeedMultiplier: 0.8,
    equipTime: 0.7,
    audio: { volume: 1.15, duration: 0.38, lowpass: 1800, thump: 62, crack: 0.55, tail: 1.15, mechanism: 0.3, sampleFile: 'barrett_shot.mp3' },
    view: {
      frame: 'barrett',
      hip: [0.19, -0.215, -0.31],
      ads: [0, 0, -0.35],
      sway: 1.2,
      bob: 0.8,
      visualRecoil: { kickImpulse: 3.8, pitchImpulse: 12, rollImpulse: 3, stiffness: 115, damping: 17 },
      scale: 1,
      bodyColor: 0x50585e,
      accentColor: 0x191c1f,
      barrelLength: 0.74,
      barrelRadius: 0.018,
      receiverLength: 0.46,
      stockLength: 0.29,
      magazine: 'box',
      optic: 'scope',
      sightHeight: 0.095,
      bulk: 1.4,
      hands: {
        right: {
          position: [0, -0.116, 0.06], axis: [0, 1, -0.03], palm: [-1, -0.1, 0], pose: 'rifleGrip',
          hold: { size: [0.034, 0.05], axis: [0, 0.96, -0.28] }, trigger: [0, -0.086, -0.012],
        },
        left: {
          position: [0, -0.0045, -0.37], axis: [-0.375, -0.167, -0.912], palm: [-0.53, 0.846, 0.063], pose: 'supportHandguard',
          hold: { size: [0.074, 0.099], axis: [0, 0, -1] },
        },
        action: { position: [0.057, -0.005, 0], axis: [0, 1, 0], palm: [-1, 0.3, 0], pose: 'boltPinch' },
        magazine: {
          position: [0, -0.112, 0], axis: [0, 0, -1], palm: [-0.45, 0.89, 0], pose: 'supportHandguard',
          hold: { size: [0.052, 0.145], axis: [0, 0, 1] },
        },
      },
      reloadAnim: {
        style: 'rifle',
        magOut: 0.1, magDrop: 0.28, magIn: 0.43, magSeat: 0.68, charge: 0.77, chargeEnd: 0.96,
        swapPose: { shift: [-0.07, 0.07, -0.28], yaw: 0.5, roll: -0.24, tilt: -0.08 },
        rackPose: { shift: [-0.025, 0.04, -0.04], yaw: -0.12, roll: 0.24, tilt: -0.1 },
        wellDepth: 0.22,
        magSize: [0.052, 0.15, 0.145],
        magColor: 0x2b3034,
      },
    },
  },

  /**
   * Ray Gun — original retro-futuristic homage to the classic zombies-mode
   * wonder weapon. Procedural view model, synthesized audio, visible energy
   * projectile with splash damage. Only registered in Zombies mode.
   */
  raygun: {
    id: 'raygun',
    name: 'RAY GUN',
    fireModes: ['semi'],
    defaultFireMode: 'semi',
    rpm: 140,
    magazineSize: 20,
    reloadTime: 3,
    tacticalReloadTime: 2.4,
    boltAction: false,
    boltCycleTime: 0,
    scoped: false,
    damage: 600,
    energy: { projectileSpeed: 48, splashRadius: 3.5, splashDamage: 1200, color: 0x5cff3a },
    recoil: {
      verticalKick: 0.012,
      horizontalKick: 0.004,
      horizontalBias: 0,
      kickVariance: 0.2,
      recoverySpeed: 10,
      recoveryDelay: 0.06,
      cameraShare: 0.55,
      adsRecoilMultiplier: 0.8,
    },
    spread: {
      hipBase: 0.004,
      adsBase: 0.001,
      bloomPerShot: 0.001,
      maxBloom: 0.008,
      bloomRecovery: 0.05,
    },
    ads: { fov: 60, speed: 10, sensitivity: 0.8 },
    projectile: { muzzleVelocity: 48, gravity: 0, maxDistance: 80, drag: 0 },
    moveSpeedMultiplier: 1,
    equipTime: 0.4,
    audio: { volume: 0.5, duration: 0.22, lowpass: 4200, thump: 200, energy: 'raygun' },
    view: {
      // No GLB: dedicated procedural builder (RayGunViewModel). Body is the
      // chipped red enamel, accent the worn fitting metal under it.
      energyColor: 0x5cff3a,
      hip: [0.25, -0.21, -0.42],
      ads: [0, 0, -0.28],
      sway: 0.9,
      bob: 1,
      visualRecoil: { kickImpulse: 0.7, pitchImpulse: 1.4, rollImpulse: 0.6, stiffness: 160, damping: 15 },
      scale: 1,
      bodyColor: 0x9c2a1f,
      accentColor: 0x7f766a,
      barrelLength: 0.16,
      barrelRadius: 0.02,
      receiverLength: 0.2,
      stockLength: 0.06,
      magazine: 'internal',
      optic: 'irons',
      sightHeight: 0.07,
      bulk: 0.9,
      // One-handed pistol: the left arm only shows to swap the canister.
      hands: {
        right: {
          position: [0, -0.1, 0.086], axis: [0, 1, -0.12], palm: [-1, -0.1, 0], pose: 'pistolGrip',
          hold: { size: [0.03, 0.049], axis: [0, 0.946, -0.326] }, trigger: [0, -0.07, 0.003],
        },
        // Underhand around the plasma chamber, in the canister's frame.
        magazine: {
          position: [0, 0, -0.05], axis: [-0.375, -0.167, -0.912], palm: [-0.53, 0.846, 0.063], pose: 'supportHandguard',
          hold: { size: [0.078, 0.078], axis: [0, 0, -1] },
        },
      },
      reloadAnim: {
        style: 'canister',
        magOut: 0.08,
        magDrop: 0.3,
        magIn: 0.52,
        magSeat: 0.74,
        // No charging handle: the charge window drives the energy spin-up.
        charge: 0.76,
        chargeEnd: 0.97,
        // Raised and canted inboard, muzzle low, towards the support hand on the canister.
        swapPose: { shift: [-0.07, 0.09, 0.02], yaw: 0.15, roll: 0.25, tilt: -0.18 },
        magSize: [0.08, 0.08, 0.28],
        magColor: 0x5cff3a,
      },
    },
  },
  /**
   * ZEUS-77 "Tempest Coil" — original electric Wonder Weapon, homage to the
   * classic chain-lightning archetype without copying its name or design.
   * A slow, visible arc bolt: the zombie it strikes is electrocuted and the
   * charge chains to up to CHAIN_MAX_TARGETS nearby zombies (see
   * ZombieConfig.selectChainTargets). Very high damage, scarce ammunition.
   * A legendary, very rare Mystery Box pull with scarce ammunition.
   */
  tesla: {
    id: 'tesla',
    name: 'ZEUS-77',
    fireModes: ['semi'],
    defaultFireMode: 'semi',
    rpm: 90,
    magazineSize: 5,
    reserveAmmo: 25,
    reloadTime: 3.2,
    tacticalReloadTime: 2.6,
    boltAction: false,
    boltCycleTime: 0,
    scoped: false,
    // The direct hit and every chained zap deal CHAIN_ZAP_DAMAGE via the
    // mode; this base damage is what a NON-chained zombie would take.
    damage: 750,
    // A visible arc bolt, fast but readable; the chain runs off the impact.
    energy: { projectileSpeed: 90, splashRadius: 0, splashDamage: 0, color: 0x7fd4ff },
    recoil: {
      verticalKick: 0.014,
      horizontalKick: 0.005,
      horizontalBias: 0,
      kickVariance: 0.2,
      recoverySpeed: 10,
      recoveryDelay: 0.06,
      cameraShare: 0.55,
      adsRecoilMultiplier: 0.8,
    },
    spread: {
      hipBase: 0.004,
      adsBase: 0.001,
      bloomPerShot: 0.001,
      maxBloom: 0.008,
      bloomRecovery: 0.05,
    },
    ads: { fov: 60, speed: 10, sensitivity: 0.8 },
    projectile: { muzzleVelocity: 90, gravity: 0, maxDistance: 80, drag: 0 },
    moveSpeedMultiplier: 0.98,
    equipTime: 0.45,
    audio: { volume: 0.6, duration: 0.2, lowpass: 5200, thump: 240, energy: 'arc' },
    view: {
      // Dedicated procedural builder: exposed helical coil, removable caged
      // capacitor and fork emitter. No GLB, like the Ray Gun.
      teslaFrame: 'tesla',
      energyColor: 0x7fd4ff,
      hip: [0.24, -0.22, -0.44],
      ads: [0, 0, -0.3],
      sway: 0.95,
      bob: 1,
      visualRecoil: { kickImpulse: 0.9, pitchImpulse: 1.8, rollImpulse: 0.7, stiffness: 150, damping: 14 },
      scale: 1.05,
      bodyColor: 0x2e3844,
      accentColor: 0xb87333,
      barrelLength: 0.3,
      barrelRadius: 0.016,
      receiverLength: 0.26,
      stockLength: 0.18,
      magazine: 'internal',
      optic: 'reddot',
      sightHeight: 0.075,
      bulk: 1.05,
      // Rifle hold, with the support hand on the insulated chamber floor
      // behind the exposed copper coil; it lifts the capacitor cell on reload.
      hands: {
        // The trigger sits inside the transformer case: the whole hand closes on the grip.
        right: {
          position: [0, -0.085, 0.091], axis: [0, 1, -0.12], palm: [-1, -0.1, 0], pose: 'handleGrip',
          hold: { size: [0.054, 0.054], axis: [0, 0.946, -0.326] },
        },
        // Around the insulated socket behind the exposed coil.
        left: {
          position: [0, 0.0126, -0.15], axis: [-0.375, -0.167, -0.912], palm: [-0.53, 0.846, 0.063], pose: 'supportHandguard',
          hold: { size: [0.08, 0.08], axis: [0, 0, -1] },
        },
        magazine: { position: [0, 0.04, 0], axis: [0, 0, 1], palm: [0, -1, 0], pose: 'magazineGrab' },
      },
      reloadAnim: {
        style: 'cell',
        magOut: 0.1,
        magDrop: 0.26,
        magIn: 0.48,
        magSeat: 0.62,
        // No charging handle: the charge window drives the coil spin-up.
        charge: 0.68,
        chargeEnd: 0.95,
        // Raised, muzzle low and top tipped to the eye so the caged cell faces the camera.
        swapPose: { shift: [-0.06, 0.08, 0.02], yaw: 0, roll: 0.12, tilt: -0.25 },
        magSize: [0.05, 0.06, 0.05],
        magColor: 0x7fd4ff,
      },
    },
  },
};

export const WEAPON_ORDER: readonly WeaponId[] = ['m4a1', 'mp5', 'vector', 'ppsh41', 'ak47', 'm60', 'l96', 'barrett', 'm1911'];

/**
 * Zombies PRELOADS every weapon it can ever hand out — the M1911 starting
 * pistol plus the whole Mystery Box pool and the Ray Gun milestone — so
 * rolls and unlocks never touch the network. This is NOT the slot list:
 * the zombies inventory starts with the M1911 alone (see
 * ZombiesMode.startingInventory); both Wonder Weapons can come from the
 * Mystery Box, while the Ray Gun is also guaranteed at 115 kills.
 */
export const ZOMBIES_WEAPON_PRELOAD: readonly WeaponId[] = [
  'm1911',
  'm4a1',
  'mp5',
  'vector',
  'ppsh41',
  'ak47',
  'm60',
  'l96',
  'barrett',
  'raygun',
  'tesla',
];
