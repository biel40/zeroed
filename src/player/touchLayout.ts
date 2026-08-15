/**
 * Where a finger landing on the canvas belongs. Pure geometry so the touch
 * layout can be reasoned about (and tested) without a DOM: Input only feeds
 * it pointer coordinates local to the canvas.
 */
export type TouchZone = 'move' | 'look' | 'none';

export const TOUCH_LAYOUT = {
  /** Left fraction of the canvas that can host the movement joystick. */
  moveZoneWidth: 0.48,
  /** Movement pad starts at this fraction of the height (portrait). */
  moveZoneTop: 0.4,
  /** Landscape viewports are short: the pad has to start higher up. */
  landscapeMoveZoneTop: 0.28,
  /** Width/height ratio from which a viewport counts as landscape. */
  landscapeAspect: 1.2,
} as const;

/**
 * Movement owns the bottom-left pad and camera dragging owns the right side.
 * The upper-left HUD area is deliberately inert, preventing accidental look
 * gestures while a thumb enters the movement zone or touches status panels.
 */
export function resolveTouchZone(
  localX: number,
  localY: number,
  width: number,
  height: number,
): TouchZone {
  if (width <= 0 || height <= 0) return 'look';
  const topFraction =
    width / height >= TOUCH_LAYOUT.landscapeAspect
      ? TOUCH_LAYOUT.landscapeMoveZoneTop
      : TOUCH_LAYOUT.moveZoneTop;
  const onLeft = localX < width * TOUCH_LAYOUT.moveZoneWidth;
  if (!onLeft) return 'look';
  return localY > height * topFraction ? 'move' : 'none';
}
