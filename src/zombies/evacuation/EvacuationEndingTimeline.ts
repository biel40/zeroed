/**
 * Beats of the filmed evacuation ending, in seconds from boarding. The map's
 * camera shots, vehicles and blaze, the HUD overlay (style.css, evacuation
 * block) and the ending audio all run on this one clock.
 */
export const EVACUATION_ENDING_TIMELINE = {
  /** The box body's rear doors swing shut behind the survivors. */
  doorsShut: 0.3,
  /** Starter motor; the engine catches about a second later. */
  ignition: 0.7,
  /** Headlights flicker on. */
  headlights: 1.8,
  /** The truck pulls away. */
  launch: 3.6,
  /** The nose rams the yard's gate open. */
  gateImpact: 4.9,
  /** The horde starts pouring out after the truck. */
  horde: 5.4,
  /** The stairhead bursts into flames behind the horde and the fire spreads over the station. */
  blaze: 8.2,
  /** The title card rises over the closing crane shot; the last radio call follows it. */
  title: 12.8,
  /** The picture fades to black. */
  fadeOut: 18,
  /** The credits start rising. */
  credits: 18.8,
} as const;

/** How long the credits take to land after `credits` (style.css: the credits title animation). */
export const EVACUATION_CREDITS_LANDING = 3.4;

/** Whole ending, from boarding until the credits have landed and the menu button shows. */
export const EVACUATION_ENDING_DURATION = EVACUATION_ENDING_TIMELINE.credits + EVACUATION_CREDITS_LANDING;
