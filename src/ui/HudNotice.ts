import { clamp } from '../utils/math';

const NOTICE_MIN_MS = 4000;
const NOTICE_MAX_MS = 8000;
const NOTICE_BASE_MS = 1800;
const NOTICE_CHARACTER_MS = 55;

/** Total CSS animation time, including its fades, scaled to the rendered text. */
export function hudNoticeDurationMs(title: string, detail = ''): number {
  const length = `${title} ${detail}`.replace(/\s+/gu, ' ').trim().length;
  return clamp(NOTICE_BASE_MS + length * NOTICE_CHARACTER_MS, NOTICE_MIN_MS, NOTICE_MAX_MS);
}
