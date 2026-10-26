import { describe, expect, it } from 'vitest';
import { MANSION_BLAST_DOOR_ID, MANSION_DOORS } from '../src/zombies/maps/BurnedMansionConfig';
import { MANSION_GROUND_FACES } from '../src/zombies/maps/burnedMansion/MansionLayout';

describe('Burned Mansion door casings', () => {
  it('leaves the blast door to its own hazard frame, so the two never share a plane', () => {
    const blastDoor = MANSION_DOORS.find((door) => door.id === MANSION_BLAST_DOOR_ID)!;
    const faces = MANSION_GROUND_FACES.filter((face) => face.axis === 'z' && Math.abs(face.plane - blastDoor.x) < 0.5 && face.doors.includes(blastDoor.z));
    expect(faces.length).toBeGreaterThan(0);
    for (const face of faces) expect(face.casedDoors).not.toContain(blastDoor.z);
    // Every other door keeps its wooden casing; the fireplace opening on the chimney breast is not a door.
    const realDoors = (face: (typeof MANSION_GROUND_FACES)[number]): number[] => face.doors.filter((center) => MANSION_DOORS.some((door) => {
      const along = face.axis === 'x' ? door.x : door.z;
      const across = face.axis === 'x' ? door.z : door.x;
      return along === center && Math.abs(across - face.plane) < 0.5;
    }));
    const cased = MANSION_GROUND_FACES.reduce((count, face) => count + face.casedDoors.length, 0);
    const all = MANSION_GROUND_FACES.reduce((count, face) => count + realDoors(face).length, 0);
    expect(cased).toBe(all - faces.length);
    expect(MANSION_GROUND_FACES.find((face) => face.id === 'banquet-chimney')!.casedDoors).toEqual([]);
  });
});
