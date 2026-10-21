import type { QualityLevel } from '../../../core/DeviceProfile';

/**
 * Three.js evaluates every visible point light in every lit fragment, and a
 * different active count recompiles shaders. Maps keep at most this many
 * point lights visible, a number fixed for the whole match.
 */
export const POINT_LIGHT_BUDGET: Readonly<Record<QualityLevel, number>> = { low: 3, medium: 4, high: 6 };
