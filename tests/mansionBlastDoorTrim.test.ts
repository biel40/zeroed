import { describe, expect, it } from 'vitest';
import { MANSION_BLAST_DOOR_ID, MANSION_DOORS } from '../src/zombies/maps/BurnedMansionConfig';
import { MANSION_GROUND_FACES } from '../src/zombies/maps/burnedMansion/MansionLayout';

describe('Burned Mansion door casings', () => {
  it('leaves the blast door to its own hazard frame, so the two never share a plane', () => {
    const blastDoor = MANSION_DOORS.find((door) => door.id === MANSION_BLAST_DOOR_ID)!;
    const faces = MANSION_GROUND_FACES.filter((face) => face.axis === 'z' && Math.abs(face.plane - blastDoor.x) < 0.5 && face.doors.includes(blastDoor.z));
    expect(faces.length).toBeGreaterThan(0);
    for (const face of faces) expect(face.casedDoors).not.toContain(blastDoor.z);
    // Every other door keeps its wooden casing.
    const cased = MANSION_GROUND_FACES.reduce((count, face) => count + face.casedDoors.length, 0);
    const all = MANSION_GROUND_FACES.reduce((count, face) => count + face.doors.length, 0);
    expect(cased).toBe(all - faces.length);
  });
});
