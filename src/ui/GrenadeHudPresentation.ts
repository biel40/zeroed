/** Under this many seconds the cooking dial turns red: throw it now. */
const COOK_URGENT_SECONDS = 1;

/** What the cooking dial around the crosshair shows. */
export interface GrenadeCookDial {
  /** Share of the ring still lit, 0..1. */
  readonly remaining: number;
  /** Seconds left, one decimal. */
  readonly label: string;
  readonly urgent: boolean;
}

export function grenadeCookDial(secondsLeft: number, fuseSeconds: number): GrenadeCookDial {
  const left = Math.max(0, secondsLeft);
  return {
    remaining: Math.round(Math.min(1, left / Math.max(1e-6, fuseSeconds)) * 200) / 200,
    label: left.toFixed(1),
    urgent: left < COOK_URGENT_SECONDS,
  };
}

/**
 * Side view of the F-1 for the HUD pouch: the "limonka" body cut by its
 * lattice, the fuse, the spoon down its flank and the pull ring. Colours
 * live in the stylesheet: a carried grenade is filled, a thrown one hollow.
 */
export function grenadeIcon(carried: boolean): string {
  return `<svg class="lethal-pip${carried ? ' full' : ''}" viewBox="0 0 28 36">`
    + '<circle class="f1-ring" cx="5.6" cy="6.6" r="3.5"/>'
    + '<path class="f1-ring" d="M9.1 6.6H11"/>'
    + '<rect class="f1-metal" x="11.5" y="1.2" width="3.4" height="2.6" rx=".6"/>'
    + '<rect class="f1-metal" x="10.4" y="3.6" width="5.6" height="5.4" rx=".7"/>'
    + '<rect class="f1-metal" x="9.2" y="8.6" width="8" height="3.4" rx=".8"/>'
    + '<ellipse class="f1-body" cx="13.2" cy="23" rx="9.4" ry="11.8"/>'
    + '<path class="f1-groove" d="M6.4 15.5H20M4.5 20H21.9M4.4 24.5H22M5.5 29H20.9'
    + 'M13.2 11.4Q4.8 23 13.2 34.6M13.2 11.4Q21.6 23 13.2 34.6"/>'
    + '<ellipse class="f1-shine" cx="9" cy="17.6" rx="1.5" ry="3" transform="rotate(24 9 17.6)"/>'
    + '<path class="f1-spoon" d="M15.6 3.4H20.6Q24.4 3.8 24.8 8L25.6 21.5"/>'
    + '</svg>';
}
