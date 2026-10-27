import * as THREE from 'three';
import { seededRandom } from '../shared/ProceduralNoise';

/**
 * Diegetic Cyrillic signage of the station, painted on canvases at load.
 * These are part of the art (never translated, never UI). Iconography stays
 * generic: stars, rays, lettering and tesserae; no portraits or real emblems.
 */
export type SignId =
  | 'exit'
  | 'ticket-office'
  | 'no-smoking'
  | 'no-entry'
  | 'to-trains'
  | 'do-not-run'
  | 'civil-defence'
  | 'torn-poster-a'
  | 'torn-poster-b'
  | 'luggage-office'
  | 'lost-property'
  | 'service-passage'
  | 'no-boarding'
  | 'third-rail'
  | 'blast-gate'
  | 'route-33'
  | 'depot'
  | 'substation'
  | 'main-switch'
  | 'high-voltage'
  | 'men-at-work'
  | 'mimic-diagram'
  | 'militia'
  | 'evidence'
  | 'wanted'
  | 'decontamination'
  | 'militia-poster'
  | 'vigilance-poster'
  | 'serve-the-people'
  | 'honour-board'
  | 'duty-roster'
  | 'holding-cell';

const ATLAS_WIDTH = 1024;
/**
 * Two 128 px rows below the original square (the machine room's plates, then
 * the militia post's), then a 384 px band of the post's red corner.
 */
const ATLAS_HEIGHT = 1664;

/** Atlas cells in canvas pixels: x, y, width, height. */
const SIGN_REGIONS: Readonly<Record<SignId, readonly [number, number, number, number]>> = {
  exit: [0, 0, 512, 128],
  'ticket-office': [512, 0, 512, 128],
  'no-smoking': [0, 128, 256, 128],
  'no-entry': [256, 128, 256, 128],
  'to-trains': [512, 128, 512, 128],
  'do-not-run': [768, 256, 256, 128],
  'civil-defence': [0, 256, 256, 384],
  'torn-poster-a': [256, 256, 256, 384],
  'torn-poster-b': [512, 256, 256, 384],
  'luggage-office': [768, 384, 256, 128],
  'lost-property': [768, 512, 256, 128],
  'no-boarding': [512, 640, 512, 128],
  'service-passage': [512, 768, 256, 128],
  'third-rail': [768, 768, 256, 128],
  'blast-gate': [512, 896, 256, 128],
  'route-33': [768, 896, 128, 128],
  depot: [896, 896, 128, 128],
  substation: [0, 896, 256, 128],
  'main-switch': [256, 896, 256, 128],
  'high-voltage': [0, 1024, 256, 128],
  'men-at-work': [256, 1024, 256, 128],
  'mimic-diagram': [512, 1024, 512, 128],
  militia: [0, 1152, 256, 128],
  evidence: [256, 1152, 256, 128],
  wanted: [512, 1152, 256, 128],
  decontamination: [768, 1152, 256, 128],
  'militia-poster': [0, 1280, 256, 384],
  'vigilance-poster': [256, 1280, 256, 384],
  'serve-the-people': [512, 1280, 512, 128],
  'honour-board': [512, 1408, 512, 128],
  'duty-roster': [512, 1536, 256, 128],
  'holding-cell': [768, 1536, 256, 128],
};

/** Grid of enamel number tags for the luggage lockers: bank letter and number. */
const LOCKER_PLATES = { x: 0, y: 640, columns: 8, rows: 8, cellWidth: 64, cellHeight: 32 } as const;
const LOCKER_PLATE_COUNT = LOCKER_PLATES.columns * LOCKER_PLATES.rows;
const LOCKER_BANK_LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'И'] as const;

const SIGN_FONT = '"Arial Narrow", "Roboto Condensed", Arial, sans-serif';

export interface Station33Signage {
  /** Enamel plates and paper posters (cut out by alpha). */
  readonly material: THREE.MeshStandardMaterial;
  /** Lightbox faces; the lighting circuits drive their colour. */
  readonly litMaterial: THREE.MeshBasicMaterial;
  /** Faded smalt mosaic above the escalator portal. */
  readonly muralMaterial: THREE.MeshStandardMaterial;
  /** Plane of `width` x `height` metres showing one atlas cell. */
  signGeometry(id: SignId, width: number, height: number): THREE.PlaneGeometry;
  /** Plane showing locker number tag `index` (wraps over LOCKER_PLATE_COUNT). */
  lockerPlateGeometry(index: number, width: number, height: number): THREE.PlaneGeometry;
}

/**
 * Mimic diagram composition, shared with the board that carries its lamps:
 * where each feeder drops from the busbar (fraction of the plate width) and
 * the height of the lamp row (fraction of the plate height from its top).
 */
export const MIMIC_LAYOUT = {
  feeders: [0.12, 0.27, 0.42, 0.58, 0.73, 0.88],
  lampRow: 0.84,
} as const;

/** Mural composition, shared with the builder that shapes its geometry. */
export const MURAL_LAYOUT = {
  /** Mural area: x in [-halfWidth, halfWidth], y from bottomY up to the vault. */
  halfWidth: 6.5,
  bottomY: 3.05,
  /** Height of the lettered band along the bottom. */
  bandHeight: 0.5,
  canvasWidth: 1950,
  canvasHeight: 306,
  tessera: 6,
} as const;

/** Texture coordinates of a mural point given in metres (x across, y absolute height). */
export function muralUv(x: number, y: number): readonly [number, number] {
  const { halfWidth, bottomY, canvasWidth, canvasHeight } = MURAL_LAYOUT;
  const heightMetres = (canvasHeight / canvasWidth) * halfWidth * 2;
  return [(x + halfWidth) / (halfWidth * 2), (y - bottomY) / heightMetres];
}

function makeCanvas(width: number, height: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Station 33 signage needs a 2D canvas');
  return { canvas, context };
}

function canvasTexture(canvas: HTMLCanvasElement, anisotropy: number): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

/** Scuffs, chips and soot over a painted cell. */
function weather(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, random: () => number, amount: number): void {
  for (let index = 0; index < amount; index++) {
    const size = 2 + random() * 9;
    context.fillStyle = random() < 0.7 ? 'rgba(20, 18, 14, 0.35)' : 'rgba(120, 104, 80, 0.4)';
    context.fillRect(x + random() * (width - size), y + random() * (height - size), size, size * (0.4 + random()));
  }
}

function lettering(context: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string): void {
  context.fillStyle = color;
  context.font = `bold ${size}px ${SIGN_FONT}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, x, y);
}

/** Enamel plate: coloured field, thin border, centred lettering. */
function enamelPlate(
  context: CanvasRenderingContext2D,
  id: SignId,
  field: string,
  border: string,
  ink: string,
  lines: ReadonlyArray<string>,
  fontSize: number,
  random: () => number,
): void {
  const [x, y, width, height] = SIGN_REGIONS[id];
  context.fillStyle = border;
  context.fillRect(x, y, width, height);
  context.fillStyle = field;
  context.fillRect(x + 6, y + 6, width - 12, height - 12);
  const step = height / (lines.length + 1);
  lines.forEach((line, index) => lettering(context, line, x + width / 2, y + step * (index + 1), fontSize, ink));
  weather(context, x, y, width, height, random, 40);
}

/** Arrow pointing up the plate, drawn as a polygon so no glyph support is needed. */
function arrow(context: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(x, y - size);
  context.lineTo(x + size * 0.7, y - size * 0.1);
  context.lineTo(x + size * 0.25, y - size * 0.1);
  context.lineTo(x + size * 0.25, y + size);
  context.lineTo(x - size * 0.25, y + size);
  context.lineTo(x - size * 0.25, y - size * 0.1);
  context.lineTo(x - size * 0.7, y - size * 0.1);
  context.closePath();
  context.fill();
}

/** Paper torn along a jagged outline; everything outside stays transparent. */
function tornPaper(context: CanvasRenderingContext2D, id: SignId, keep: number, random: () => number): void {
  const [x, y, width, height] = SIGN_REGIONS[id];
  context.fillStyle = '#b4aa8e';
  context.beginPath();
  context.moveTo(x + 4, y + 4);
  context.lineTo(x + width - 4, y + 4);
  const tornY = y + height * keep;
  context.lineTo(x + width - 4, tornY - random() * 40);
  for (let step = 1; step < 12; step++) {
    context.lineTo(x + width - 4 - (width - 8) * step / 12, tornY + (random() - 0.5) * 70);
  }
  context.lineTo(x + 4, tornY - random() * 60);
  context.closePath();
  context.fill();
}

/** Illegible print: grey bars standing in for paragraphs. */
function printLines(context: CanvasRenderingContext2D, x: number, y: number, width: number, rows: number, random: () => number): void {
  context.fillStyle = 'rgba(40, 36, 30, 0.75)';
  for (let row = 0; row < rows; row++) {
    context.fillRect(x, y + row * 13, width * (0.55 + random() * 0.45), 6);
  }
}

function paintAtlas(context: CanvasRenderingContext2D): void {
  const random = seededRandom(3333);
  context.clearRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);
  enamelPlate(context, 'exit', '#d9d3c1', '#3a3a36', '#a3241a', ['ВЫХОД В ГОРОД'], 66, random);
  enamelPlate(context, 'ticket-office', '#1c2a3a', '#b9ae8c', '#e2d8b8', ['КАССЫ'], 84, random);
  enamelPlate(context, 'no-smoking', '#e4e0d4', '#a3241a', '#1b1b1b', ['НЕ КУРИТЬ'], 46, random);
  enamelPlate(context, 'no-entry', '#9a1f16', '#e8e2d2', '#f1ead8', ['ВХОДА НЕТ'], 50, random);
  enamelPlate(context, 'to-trains', '#1c2a3a', '#b9ae8c', '#e2d8b8', ['К ПОЕЗДАМ'], 66, random);
  arrow(context, 512 + 448, 128 + 64, 34, '#e2d8b8');
  enamelPlate(context, 'do-not-run', '#d8b02c', '#1b1b1b', '#1b1b1b', ['НЕ БЕГИТЕ', 'ПО ЭСКАЛАТОРУ'], 30, random);

  // Civil-defence notice: red header, instructions, a shelter arrow, torn off at the bottom.
  const [cx, cy, cw] = SIGN_REGIONS['civil-defence'];
  tornPaper(context, 'civil-defence', 0.82, random);
  context.fillStyle = '#8f2018';
  context.fillRect(cx + 14, cy + 16, cw - 28, 54);
  lettering(context, 'ГРАЖДАНСКАЯ', cx + cw / 2, cy + 32, 22, '#efe6cf');
  lettering(context, 'ОБОРОНА', cx + cw / 2, cy + 55, 22, '#efe6cf');
  lettering(context, 'ПАМЯТКА НАСЕЛЕНИЮ', cx + cw / 2, cy + 88, 17, '#2a2620');
  printLines(context, cx + 20, cy + 108, cw - 40, 8, random);
  arrow(context, cx + cw / 2, cy + 240, 26, '#8f2018');
  printLines(context, cx + 20, cy + 276, cw - 40, 3, random);
  weather(context, cx, cy, cw, 300, random, 70);

  enamelPlate(context, 'luggage-office', '#1c2a3a', '#b9ae8c', '#e2d8b8', ['КАМЕРА', 'ХРАНЕНИЯ'], 40, random);
  enamelPlate(context, 'lost-property', '#d9d3c1', '#3a3a36', '#1c2a3a', ['БЮРО', 'НАХОДОК'], 40, random);
  paintLockerPlates(context, random);

  // Older bills almost scraped away: only a corner and a stripe of print survive.
  for (const [id, keep] of [['torn-poster-a', 0.45], ['torn-poster-b', 0.62]] as const) {
    const [px, py, pw] = SIGN_REGIONS[id];
    tornPaper(context, id, keep, random);
    context.fillStyle = 'rgba(30, 60, 90, 0.55)';
    context.fillRect(px + 16, py + 18, pw - 32, 40);
    lettering(context, id === 'torn-poster-a' ? 'ГО...' : 'СТАНЦИЯ', px + pw / 2, py + 38, 28, '#d9cfb3');
    printLines(context, px + 20, py + 74, pw - 40, 6, random);
    weather(context, px, py, pw, 200, random, 50);
  }
  // Painted last so the older cells keep their weathering.
  paintTrainShedSigns(context, random);
  paintSubstationSigns(context, random);
  paintMilitiaSigns(context, random);
}

/**
 * Militia post: the door plate, the evidence-room plate over the Armour
 * locker and a "wanted" bulletin whose photographs were torn off.
 */
function paintMilitiaSigns(context: CanvasRenderingContext2D, random: () => number): void {
  enamelPlate(context, 'militia', '#1c2a3a', '#b9ae8c', '#e2d8b8', ['МИЛИЦИЯ'], 46, random);
  enamelPlate(context, 'evidence', '#d9d3c1', '#3a3a36', '#9a1f16', ['ВЕЩЕСТВЕННЫЕ', 'ДОКАЗАТЕЛЬСТВА'], 27, random);
  const [x, y, width, height] = SIGN_REGIONS.wanted;
  tornPaper(context, 'wanted', 0.92, random);
  lettering(context, 'РАЗЫСКИВАЕТСЯ', x + width / 2, y + 18, 24, '#8f2018');
  // Pale squares where the photographs were glued, then torn away.
  context.fillStyle = 'rgba(214, 206, 182, 0.9)';
  for (const left of [x + 18, x + 136]) context.fillRect(left, y + 36, 46, 56);
  printLines(context, x + 70, y + 40, 56, 4, random);
  printLines(context, x + 188, y + 40, 52, 4, random);
  weather(context, x, y, width, height, random, 30);
  paintRedCornerSigns(context, random);
}

/** Five-pointed star pointing up, centred on (x, y), as a polygon. */
function paintStar(context: CanvasRenderingContext2D, x: number, y: number, outer: number, color: string): void {
  context.fillStyle = color;
  context.beginPath();
  for (let index = 0; index < 10; index++) {
    const [vx, vy] = starVertex(index, outer, outer * 0.4);
    // Canvas rows grow downwards, so the star's y flips.
    if (index === 0) context.moveTo(x + vx, y - vy);
    else context.lineTo(x + vx, y - vy);
  }
  context.closePath();
  context.fill();
}

/** Sunburst of alternating rays behind a poster's star. */
function paintRays(context: CanvasRenderingContext2D, x: number, y: number, radius: number, rays: number, color: string): void {
  context.fillStyle = color;
  for (let ray = 0; ray < rays; ray += 2) {
    const from = (ray / rays) * Math.PI * 2;
    const to = ((ray + 1) / rays) * Math.PI * 2;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(from) * radius, y + Math.sin(from) * radius);
    context.lineTo(x + Math.cos(to) * radius, y + Math.sin(to) * radius);
    context.closePath();
    context.fill();
  }
}

/**
 * The militia post's red corner: two propaganda posters (a star over rays,
 * a call for vigilance), the slogan banner, the board of honour's header,
 * the duty roster pinned by the desk and the holding cell's plate.
 */
function paintRedCornerSigns(context: CanvasRenderingContext2D, random: () => number): void {
  const [px, py, pw, ph] = SIGN_REGIONS['militia-poster'];
  context.fillStyle = '#c9bb94';
  context.fillRect(px + 4, py + 4, pw - 8, ph - 8);
  context.save();
  context.beginPath();
  context.rect(px + 14, py + 14, pw - 28, 230);
  context.clip();
  context.fillStyle = '#8f2018';
  context.fillRect(px + 14, py + 14, pw - 28, 230);
  paintRays(context, px + pw / 2, py + 130, 220, 24, 'rgba(214, 160, 70, 0.35)');
  context.restore();
  paintStar(context, px + pw / 2, py + 128, 78, '#d8a640');
  paintStar(context, px + pw / 2, py + 128, 62, '#b8261a');
  lettering(context, 'МИЛИЦИЯ', px + pw / 2, py + 282, 40, '#8f2018');
  lettering(context, 'НА СТРАЖЕ ПОРЯДКА', px + pw / 2, py + 326, 20, '#2a2620');
  weather(context, px, py, pw, ph, random, 80);

  const [vx, vy, vw, vh] = SIGN_REGIONS['vigilance-poster'];
  tornPaper(context, 'vigilance-poster', 0.94, random);
  context.fillStyle = '#1b1b1b';
  context.fillRect(vx + 14, vy + 14, vw - 28, 200);
  paintStar(context, vx + vw / 2, vy + 104, 64, '#b8261a');
  context.fillStyle = '#8f2018';
  context.fillRect(vx + 14, vy + 226, vw - 28, 64);
  lettering(context, 'БУДЬ', vx + vw / 2, vy + 244, 26, '#efe6cf');
  lettering(context, 'БДИТЕЛЕН!', vx + vw / 2, vy + 272, 28, '#efe6cf');
  printLines(context, vx + 24, vy + 304, vw - 48, 3, random);
  weather(context, vx, vy, vw, vh, random, 70);

  enamelPlate(context, 'serve-the-people', '#8f2018', '#d8a640', '#efe2c0', ['СЛУЖИМ НАРОДУ'], 62, random);
  const [sx, sy, , sh] = SIGN_REGIONS['serve-the-people'];
  for (const offset of [44, 512 - 44]) paintStar(context, sx + offset, sy + sh / 2, 26, '#d8a640');
  enamelPlate(context, 'honour-board', '#8f2018', '#d8a640', '#d8a640', ['ДОСКА ПОЧЁТА'], 64, random);

  const [rx, ry, rw, rh] = SIGN_REGIONS['duty-roster'];
  context.fillStyle = '#c9bf9f';
  context.fillRect(rx + 4, ry + 4, rw - 8, rh - 8);
  lettering(context, 'ГРАФИК ДЕЖУРСТВ', rx + rw / 2, ry + 20, 20, '#2a2620');
  context.strokeStyle = 'rgba(40, 36, 30, 0.7)';
  context.lineWidth = 1;
  for (let row = 0; row < 6; row++) context.strokeRect(rx + 12, ry + 34 + row * 14, rw - 24, 14);
  for (let column = 1; column < 7; column++) {
    context.beginPath();
    context.moveTo(rx + 12 + column * ((rw - 24) / 7), ry + 34);
    context.lineTo(rx + 12 + column * ((rw - 24) / 7), ry + 118);
    context.stroke();
  }
  weather(context, rx, ry, rw, rh, random, 20);

  enamelPlate(context, 'holding-cell', '#d9d3c1', '#3a3a36', '#1b1b1b', ['КПЗ'], 70, random);
}

/**
 * Machine room: the gallery door's plate, the danger plate over the main
 * switch, the high-voltage warning on the machines, the "men at work" tag
 * someone hung on a switchboard and the mimic diagram of the network.
 */
function paintSubstationSigns(context: CanvasRenderingContext2D, random: () => number): void {
  enamelPlate(context, 'substation', '#1c2a3a', '#b9ae8c', '#e2d8b8', ['ТЯГОВАЯ', 'ПОДСТАНЦИЯ'], 36, random);
  enamelPlate(context, 'main-switch', '#e4e0d4', '#a3241a', '#a3241a', ['ГЛАВНЫЙ', 'РУБИЛЬНИК'], 36, random);
  enamelPlate(context, 'high-voltage', '#e4e0d4', '#a3241a', '#a3241a', ['СТОЙ!', '', 'НАПРЯЖЕНИЕ'], 30, random);
  const [vx, vy, vw, vh] = SIGN_REGIONS['high-voltage'];
  lightningArrow(context, vx + vw / 2, vy + vh / 2, vw * 0.62, '#1b1b1b');
  enamelPlate(context, 'men-at-work', '#e4e0d4', '#a3241a', '#a3241a', ['НЕ ВКЛЮЧАТЬ!', 'РАБОТАЮТ ЛЮДИ'], 27, random);
  // The ФАКЕЛ-33 cabinet: experimental decontamination equipment, in faded hazard ochre.
  enamelPlate(context, 'decontamination', '#b9993f', '#1d1b17', '#1d1b17', ['ФАКЕЛ-33', 'ДЕЗАКТИВАЦИЯ'], 30, random);
  paintMimicDiagram(context, random);
}

/** Horizontal lightning arrow of the Soviet danger plates: a zigzag ending in a barb. */
function lightningArrow(context: CanvasRenderingContext2D, x: number, y: number, length: number, color: string): void {
  const half = length / 2;
  const rise = length * 0.09;
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(x - half, y - rise * 0.4);
  context.lineTo(x + half * 0.1, y - rise);
  context.lineTo(x - half * 0.05, y - rise * 0.15);
  context.lineTo(x + half * 0.72, y - rise * 0.55);
  context.lineTo(x + half * 0.68, y - rise * 1.5);
  context.lineTo(x + half, y + rise * 0.2);
  context.lineTo(x + half * 0.6, y + rise * 1.4);
  context.lineTo(x + half * 0.64, y + rise * 0.45);
  context.lineTo(x - half * 0.1, y + rise * 0.85);
  context.lineTo(x + half * 0.05, y);
  context.lineTo(x - half, y + rise * 0.35);
  context.closePath();
  context.fill();
}

/**
 * Mimic diagram of the substation: two incoming transformers feed a busbar
 * across the board, which drops through a breaker to each feeder. Its lamps
 * are geometry on the board (see `MIMIC_LAYOUT`), not paint.
 */
function paintMimicDiagram(context: CanvasRenderingContext2D, random: () => number): void {
  const [x, y, width, height] = SIGN_REGIONS['mimic-diagram'];
  context.fillStyle = '#1b1b1b';
  context.fillRect(x, y, width, height);
  context.fillStyle = '#34403a';
  context.fillRect(x + 5, y + 5, width - 10, height - 10);
  context.strokeStyle = '#d6cfba';
  context.lineWidth = 3;
  const busY = y + 44;
  context.beginPath();
  context.moveTo(x + 30, busY);
  context.lineTo(x + width - 30, busY);
  for (const share of [0.34, 0.66]) {
    // Incoming transformer: two linked windings above the bus.
    const cx = x + width * share;
    context.moveTo(cx, busY);
    context.lineTo(cx, y + 31);
    for (const cy of [y + 24, y + 13]) {
      context.moveTo(cx + 7, cy);
      context.arc(cx, cy, 7, 0, Math.PI * 2);
    }
  }
  for (const share of MIMIC_LAYOUT.feeders) {
    const fx = x + width * share;
    context.moveTo(fx, busY);
    context.lineTo(fx, y + 60);
    context.strokeRect(fx - 7, y + 60, 14, 14);
    context.moveTo(fx, y + 74);
    context.lineTo(fx, y + height * MIMIC_LAYOUT.lampRow - 9);
  }
  context.stroke();
  lettering(context, 'СХЕМА ПИТАНИЯ', x + 82, y + 18, 15, '#d6cfba');
  MIMIC_LAYOUT.feeders.forEach((share, index) => {
    lettering(context, `Ф-${index + 1}`, x + width * share + 22, y + 84, 13, '#d6cfba');
  });
  weather(context, x, y, width, height, random, 70);
}

/**
 * Train sheds: the service-door plate, the cab's "no boarding" lightbox,
 * the contact-rail warning, the blast-gate plate, the route number and the
 * depot plate over the crew's ring locker.
 */
function paintTrainShedSigns(context: CanvasRenderingContext2D, random: () => number): void {
  enamelPlate(context, 'service-passage', '#1c2a3a', '#b9ae8c', '#e2d8b8', ['СЛУЖЕБНЫЙ', 'ПРОХОД'], 40, random);
  // Lightbox face: dark glass, letters lit from behind (the circuit dims them).
  const [bx, by, bw, bh] = SIGN_REGIONS['no-boarding'];
  context.fillStyle = '#0d0f0e';
  context.fillRect(bx, by, bw, bh);
  lettering(context, 'ПОСАДКИ НЕТ', bx + bw / 2, by + bh / 2 + 2, 74, '#ffd9a0');
  weather(context, bx, by, bw, bh, random, 25);
  enamelPlate(context, 'third-rail', '#d8b02c', '#1b1b1b', '#1b1b1b', ['ОСТОРОЖНО!', 'КОНТАКТНЫЙ РЕЛЬС'], 28, random);
  enamelPlate(context, 'blast-gate', '#9a1f16', '#e8e2d2', '#f1ead8', ['ГЕРМОЗАТВОР', 'НЕ ОТКРЫВАТЬ'], 30, random);
  const [rx, ry, rw, rh] = SIGN_REGIONS['route-33'];
  context.fillStyle = '#d9d3c1';
  context.fillRect(rx, ry, rw, rh);
  lettering(context, '33', rx + rw / 2, ry + rh / 2 + 4, 92, '#1b1b1b');
  weather(context, rx, ry, rw, rh, random, 12);
  enamelPlate(context, 'depot', '#1c2a3a', '#b9ae8c', '#e2d8b8', ['ДЕПО'], 36, random);
}

/** Small cream tags with the bank letter and locker number, like "Б-17". */
function paintLockerPlates(context: CanvasRenderingContext2D, random: () => number): void {
  const { x, y, columns, rows, cellWidth, cellHeight } = LOCKER_PLATES;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const cellX = x + column * cellWidth;
      const cellY = y + row * cellHeight;
      context.fillStyle = '#3a3a36';
      context.fillRect(cellX + 2, cellY + 2, cellWidth - 4, cellHeight - 4);
      context.fillStyle = '#cfc7b0';
      context.fillRect(cellX + 4, cellY + 4, cellWidth - 8, cellHeight - 8);
      const number = String(row * columns + column + 1).padStart(2, '0');
      lettering(context, `${LOCKER_BANK_LETTERS[row]}-${number}`, cellX + cellWidth / 2, cellY + cellHeight / 2 + 1, 17, '#2a2620');
      weather(context, cellX, cellY, cellWidth, cellHeight, random, 3);
    }
  }
}

/** Mosaic colour at a point of the mural, in metres (x across, y above the portal). */
function muralColor(x: number, y: number, random: () => number): string {
  const { halfWidth, bandHeight } = MURAL_LAYOUT;
  // Fading: tesserae lose saturation towards grey, unevenly.
  const fade = 0.45 + random() * 0.2;
  const jitter = 0.88 + random() * 0.24;
  let rgb: [number, number, number];
  if (y < bandHeight) {
    rgb = [92, 34, 28];
  } else {
    const cy = bandHeight + 0.55;
    const dx = x;
    const dy = y - cy;
    const radius = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const star = insideStar(dx, dy, 0.42, 0.17);
    const ray = Math.cos(angle * 16) > 0.55 && radius > 0.5;
    const laurel = Math.abs(Math.hypot(dx * 0.5, dy + 0.3) - 1.65) < 0.11 && Math.sin(Math.atan2(dy + 0.3, dx) * 40) > 0 && Math.abs(dx) > 1.2;
    if (star) rgb = [176, 44, 30];
    else if (radius < 0.5) rgb = [196, 158, 70];
    else if (laurel) rgb = [70, 104, 66];
    else if (ray && radius < 3.6) rgb = [188, 150, 76];
    else {
      const sky = THREE.MathUtils.clamp((y - bandHeight) / 1.3, 0, 1);
      rgb = [46 + (150 - 46) * (1 - sky), 82 + (128 - 82) * (1 - sky), 104 + (96 - 104) * (1 - sky)];
    }
    if (Math.abs(x) > halfWidth - 0.15) rgb = [168, 140, 80];
  }
  const grey = (rgb[0] + rgb[1] + rgb[2]) / 3;
  return `rgb(${[0, 1, 2].map((channel) => Math.round((rgb[channel] + (grey - rgb[channel]) * fade) * jitter)).join(',')})`;
}

function insideStar(x: number, y: number, outer: number, inner: number): boolean {
  // Ray-casting test against the ten-vertex star polygon pointing up.
  let inside = false;
  for (let index = 0, previous = 9; index < 10; previous = index++) {
    const vertex = starVertex(index, outer, inner);
    const other = starVertex(previous, outer, inner);
    if ((vertex[1] > y) !== (other[1] > y) && x < (other[0] - vertex[0]) * (y - vertex[1]) / (other[1] - vertex[1]) + vertex[0]) {
      inside = !inside;
    }
  }
  return inside;
}

function starVertex(index: number, outer: number, inner: number): readonly [number, number] {
  const angle = Math.PI / 2 + index * Math.PI / 5;
  const radius = index % 2 === 0 ? outer : inner;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

function paintMural(context: CanvasRenderingContext2D): void {
  const { canvasWidth, canvasHeight, tessera, halfWidth, bandHeight } = MURAL_LAYOUT;
  const random = seededRandom(3361);
  const muralHeight = canvasHeight / tessera;
  const metresPerTessera = (halfWidth * 2) / (canvasWidth / tessera);
  context.fillStyle = '#4a4740';
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  // Missing tesserae cluster where water came through the vault.
  const losses = Array.from({ length: 9 }, () => ({ x: random() * canvasWidth, y: random() * canvasHeight, r: 12 + random() * 46 }));
  for (let row = 0; row < muralHeight; row++) {
    for (let column = 0; column < canvasWidth / tessera; column++) {
      const px = column * tessera;
      const py = row * tessera;
      const lost = losses.some((loss) => Math.hypot(px - loss.x, py - loss.y) < loss.r * (0.6 + random() * 0.5));
      if (lost) continue;
      const x = (column + 0.5) * metresPerTessera - halfWidth;
      const y = (muralHeight - row - 0.5) * metresPerTessera;
      context.fillStyle = muralColor(x, y, random);
      context.fillRect(px + 1, py + 1, tessera - 1, tessera - 1);
    }
  }
  const bandRows = bandHeight / metresPerTessera;
  lettering(context, 'СТАНЦИЯ 33', canvasWidth / 2, canvasHeight - bandRows * tessera / 2, 56, '#c4a65c');
  // Seepage darkens the mosaic from the top down.
  for (let index = 0; index < 14; index++) {
    context.fillStyle = 'rgba(30, 26, 18, 0.18)';
    const width = 12 + random() * 40;
    context.fillRect(random() * canvasWidth, 0, width, canvasHeight * (0.3 + random() * 0.6));
  }
}

export function createStation33Signage(anisotropyLimit: number): Station33Signage {
  const anisotropy = Math.min(anisotropyLimit, 8);
  const atlas = makeCanvas(ATLAS_WIDTH, ATLAS_HEIGHT);
  paintAtlas(atlas.context);
  const atlasTexture = canvasTexture(atlas.canvas, anisotropy);
  const mural = makeCanvas(MURAL_LAYOUT.canvasWidth, MURAL_LAYOUT.canvasHeight);
  paintMural(mural.context);

  const cellGeometry = (x: number, y: number, cellWidth: number, cellHeight: number, width: number, height: number): THREE.PlaneGeometry => {
    const geometry = new THREE.PlaneGeometry(width, height);
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (let index = 0; index < uv.count; index++) {
      // Canvas rows grow downwards; texture v grows upwards (flipY).
      uv.setXY(
        index,
        (x + uv.getX(index) * cellWidth) / ATLAS_WIDTH,
        1 - (y + (1 - uv.getY(index)) * cellHeight) / ATLAS_HEIGHT,
      );
    }
    return geometry;
  };

  return {
    material: new THREE.MeshStandardMaterial({ name: 'station33_signs', map: atlasTexture, alphaTest: 0.5, roughness: 0.6, metalness: 0.05 }),
    litMaterial: new THREE.MeshBasicMaterial({ name: 'station33_lit_signs', map: atlasTexture, alphaTest: 0.5 }),
    muralMaterial: new THREE.MeshStandardMaterial({ name: 'station33_mural', map: canvasTexture(mural.canvas, anisotropy), roughness: 0.5, metalness: 0.05 }),
    signGeometry(id, width, height) {
      const [x, y, cellWidth, cellHeight] = SIGN_REGIONS[id];
      return cellGeometry(x, y, cellWidth, cellHeight, width, height);
    },
    lockerPlateGeometry(index, width, height) {
      const { x, y, columns, cellWidth, cellHeight } = LOCKER_PLATES;
      const cell = ((index % LOCKER_PLATE_COUNT) + LOCKER_PLATE_COUNT) % LOCKER_PLATE_COUNT;
      const cellX = x + (cell % columns) * cellWidth;
      const cellY = y + Math.floor(cell / columns) * cellHeight;
      return cellGeometry(cellX, cellY, cellWidth, cellHeight, width, height);
    },
  };
}
