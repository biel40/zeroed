/** Arrow for each `bearingIndex`, ahead first and clockwise. */
export const BEARING_ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'] as const;

/**
 * Eighth of a turn (0 ahead, clockwise) from the player's view towards an
 * objective, for the HUD's objective note: `forward` is where the player
 * looks on the ground plane and (dx, dz) the offset to the objective.
 */
export function bearingIndex(forwardX: number, forwardZ: number, dx: number, dz: number): number {
  const angle = Math.atan2(forwardX * dz - forwardZ * dx, forwardX * dx + forwardZ * dz);
  return (Math.round(angle / (Math.PI / 4)) + 8) % 8;
}

/** The arrow of `bearingIndex`. */
export function bearingArrow(forwardX: number, forwardZ: number, dx: number, dz: number): string {
  return BEARING_ARROWS[bearingIndex(forwardX, forwardZ, dx, dz)];
}
