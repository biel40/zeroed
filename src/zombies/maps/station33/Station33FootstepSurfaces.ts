import { grownArea, surfaceArea, surfacePatch, type ArenaFootstepSurfaces } from '../FootstepSurfaces';
import {
  CONSIGNA,
  KOVKA_UPGRADE_SITE,
  MILICIA,
  PROTOCOL33_SURFACE,
  STATION33_DRIP_SOURCES,
  STATION33_PUDDLE,
  STATION33_WALL_THICKNESS,
  SUBESTACION,
  VESTIBULE,
  VESTIBULE_COLLAPSED_PATCH,
} from '../Station33Config';
import { COCHERAS_TRACK_RUNS, TRACK_BED_WIDTH } from './CocherasTracks';
import { ESCALATOR_LANDING } from './EscalatorHeadBuilder';
import { SUBESTACION_TRENCH_COVERS } from './SubestacionFloorDetail';

const UNDERGROUND = 0;
const SURFACE = 1;
/** Rooms reach the middle of their walls, so each doorway threshold belongs to the room either side. */
const HALF_WALL = STATION33_WALL_THICKNESS / 2;
/** Half size of the square taken as a puddle (they lie at any angle). */
const PUDDLE_REACH = (STATION33_PUDDLE.halfWidth + STATION33_PUDDLE.halfDepth) / 2;
/** How far past its scattered pieces fallen plaster still crunches. */
const RUBBLE_MARGIN = 0.1;

/** Polished granite (vestibule, luggage office) and ceramic tile (militia post, machine room). */
const HARD_FLOORED_ROOMS = [VESTIBULE, CONSIGNA.corridor, CONSIGNA.hall, MILICIA.hall, SUBESTACION.gallery, SUBESTACION.hall] as const;

/**
 * Underfoot in Station 33, read off its floors. Granite and tiled halls ring
 * like stone; the train sheds, workshop, KOVKA chamber, corridors and escape
 * stair are bare concrete; checker plates over the machine room's trench and
 * under the upgrade machine are steel; drips keep their puddles wet; track
 * ballast and fallen plaster crunch; the yard up top is trodden snow.
 */
export const STATION33_FOOTSTEP_SURFACES: ArenaFootstepSurfaces = {
  fallback: 'concrete',
  zones: [
    ...HARD_FLOORED_ROOMS.map((room) => surfaceArea(grownArea(room, HALF_WALL), 'stone', UNDERGROUND)),
    surfaceArea(ESCALATOR_LANDING, 'stone', UNDERGROUND),
    ...SUBESTACION_TRENCH_COVERS.map((cover) => surfaceArea(cover, 'metal', UNDERGROUND)),
    surfacePatch(KOVKA_UPGRADE_SITE.x, KOVKA_UPGRADE_SITE.z, KOVKA_UPGRADE_SITE.width / 2, KOVKA_UPGRADE_SITE.depth / 2, 'metal', UNDERGROUND),
    ...STATION33_DRIP_SOURCES.map((drip) => surfacePatch(drip.x, drip.z, PUDDLE_REACH, PUDDLE_REACH, 'water', UNDERGROUND)),
    ...COCHERAS_TRACK_RUNS.map((run) => surfaceArea(
      { minX: run.x - TRACK_BED_WIDTH / 2, maxX: run.x + TRACK_BED_WIDTH / 2, minZ: run.fromZ, maxZ: run.toZ }, 'debris', UNDERGROUND,
    )),
    surfacePatch(
      VESTIBULE_COLLAPSED_PATCH.x, VESTIBULE_COLLAPSED_PATCH.z,
      VESTIBULE_COLLAPSED_PATCH.spreadX / 2 + RUBBLE_MARGIN, VESTIBULE_COLLAPSED_PATCH.spreadZ / 2 + RUBBLE_MARGIN, 'debris', UNDERGROUND,
    ),
    surfaceArea(PROTOCOL33_SURFACE.yard, 'snow', SURFACE),
  ],
};
