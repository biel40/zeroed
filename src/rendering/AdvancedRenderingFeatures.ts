/** The separable parts of the top quality tier. */
export const ADVANCED_FEATURES = ['shadows', 'occlusion', 'reflections', 'film'] as const;
export type AdvancedFeature = (typeof ADVANCED_FEATURES)[number];
export type AdvancedFeatures = Readonly<Record<AdvancedFeature, boolean>>;

const SWITCH = 'gfx-off';

/**
 * Which parts of the top tier run. All of them, unless the address switches
 * some off (`?gfx-off=shadows,film`): a tuning aid for telling apart what
 * each one contributes to the picture and to the frame time.
 */
export function advancedFeatures(search: string): AdvancedFeatures {
  const off = new Set((new URLSearchParams(search).get(SWITCH) ?? '').split(','));
  return Object.fromEntries(ADVANCED_FEATURES.map((feature) => [feature, !off.has(feature)])) as AdvancedFeatures;
}
