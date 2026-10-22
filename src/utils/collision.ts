/** Swept circle contact in XZ. Existing overlaps may separate, but never deepen or cross through. */
export function blocksCircleMovement(
  fromX: number, fromZ: number, toX: number, toZ: number,
  centerX: number, centerZ: number, combinedRadius: number,
): boolean {
  const offsetX = fromX - centerX;
  const offsetZ = fromZ - centerZ;
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const distanceSq = offsetX * offsetX + offsetZ * offsetZ;
  const radiusSq = combinedRadius * combinedRadius;
  const approach = offsetX * dx + offsetZ * dz;
  // A spawn or network correction can overlap bodies. Let movement out recover naturally.
  if (distanceSq < radiusSq) return approach < -1e-10;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq === 0) return false;
  const t = Math.max(0, Math.min(1, -approach / lengthSq));
  const closestX = offsetX + dx * t;
  const closestZ = offsetZ + dz * t;
  return closestX * closestX + closestZ * closestZ < radiusSq - 1e-10;
}
