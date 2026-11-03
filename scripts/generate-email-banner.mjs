// Builds the animated header of the login email from a Station 33 screenshot:
// the flamethrower's flame flickers over a slowly breathing scene.
//   node scripts/generate-email-banner.mjs
// The GIF ships with the site (public/) because mail clients load it by URL.
import { mkdirSync, writeFileSync } from 'node:fs';
import gifenc from 'gifenc';
import sharp from 'sharp';

const { GIFEncoder, quantize, applyPalette } = gifenc;

const SOURCE = 'public/assets/beta/thanks-6.webp';
const OUTPUT = 'public/assets/email/login-banner.gif';
const WIDTH = 520;
const HEIGHT = 180;
/** Region of the 1280x638 screenshot without HUD, centred on the flame. */
const CROP = { left: 250, top: 120, width: 940, height: 325 };
/** Flame centre in banner pixels. */
const FLAME = { x: 218, y: 98 };
const CARD_COLOR = '#121110';
const FRAME_DELAY_MS = 90;
/** Per frame: flame glow strength and scene brightness. */
const FRAMES = [
  [0.55, 1], [0.8, 1.02], [0.45, 1], [0.95, 1.04], [0.6, 1.01], [0.75, 1.02], [0.4, 0.98],
  [0.9, 1.03], [0.5, 1], [0.7, 1.02], [1, 1.05], [0.55, 1], [0.35, 0.97], [0.8, 1.02],
];

function glowOverlay(strength) {
  return Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}"><defs>
    <radialGradient id="glow" cx="${FLAME.x}" cy="${FLAME.y}" r="105" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffb347" stop-opacity="${(0.32 * strength).toFixed(3)}"/>
      <stop offset="0.35" stop-color="#ff6a1a" stop-opacity="${(0.1 * strength).toFixed(3)}"/>
      <stop offset="1" stop-color="#ff6a1a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.6" stop-color="${CARD_COLOR}" stop-opacity="0"/>
      <stop offset="1" stop-color="${CARD_COLOR}" stop-opacity="1"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#glow)"/>
    <rect width="100%" height="100%" fill="url(#fade)"/></svg>`);
}

async function renderFrame(scene, [glow, brightness]) {
  const lit = await sharp(scene).modulate({ brightness }).toBuffer();
  return sharp(lit).composite([{ input: glowOverlay(glow) }]).ensureAlpha().raw().toBuffer();
}

const scene = await sharp(SOURCE).extract(CROP).resize(WIDTH, HEIGHT).modulate({ saturation: 1.15 }).png().toBuffer();
const frames = await Promise.all(FRAMES.map((frame) => renderFrame(scene, frame)));
// One palette for every frame keeps colours steady and the file small.
const palette = quantize(Buffer.concat(frames), 256);
const gif = GIFEncoder();
for (const frame of frames) {
  gif.writeFrame(applyPalette(frame, palette), WIDTH, HEIGHT, { palette, delay: FRAME_DELAY_MS });
}
gif.finish();

mkdirSync('public/assets/email', { recursive: true });
writeFileSync(OUTPUT, gif.bytes());
console.log(`${OUTPUT}: ${FRAMES.length} frames, ${(gif.bytes().length / 1024).toFixed(0)} KiB`);
