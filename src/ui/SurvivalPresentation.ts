import type { RingFinger } from '../game/rings/RingCatalog';
import { t, type TranslationKey } from '../i18n/i18n';

/** One worn ring as the HUD shows it. */
export interface RingHudEntry {
  readonly finger: RingFinger;
  readonly nameKey: TranslationKey;
  readonly charged: boolean;
  /** The ring's enamel colour, so each ring keeps its identity on screen. */
  readonly glowColor: number;
}

/** Original line icons. Labels carry meaning independently of shape or colour. */
function lampIcon(): string {
  return '<svg class="survival-icon lamp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6M12 2v2M7 6h10l-1.5 3v8l1.5 3H7l1.5-3V9Z"/><path class="lamp-flame" d="M12 10.5c-1.8 1.7-2 3.6 0 5.5 2-1.9 1.8-3.8 0-5.5Z"/></svg>';
}

function ringIcon(): string {
  return '<svg class="survival-icon ring-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="14" r="6.5"/><path class="ring-bezel" d="M9.2 7.4 12 4l2.8 3.4L12 9.6Z"/></svg>';
}

/** Worn rings: compact icons for the combat HUD, name, finger and state for the pause menu. */
export function ringProgress(rings: readonly RingHudEntry[], compact = false): string {
  const items = rings.map((ring) => {
    const name = t(ring.nameKey);
    const finger = t(`ring.finger.${ring.finger}`);
    const state = t(ring.charged ? 'hud.ringCharged' : 'hud.ringSpent');
    const color = `#${ring.glowColor.toString(16).padStart(6, '0')}`;
    const label = t('hud.ringLabel', { ring: name, finger, state });
    const detail = compact ? '' : `<span class="ring-text"><strong>${name}</strong><small>${finger} · ${state}</small></span>`;
    return `<span class="ring ${ring.charged ? 'charged' : 'spent'}" style="--ring-glow:${color}" aria-label="${label}" title="${label}">${ringIcon()}${detail}</span>`;
  }).join('');
  return `${compact ? '' : `<div class="lamp-heading"><span>${t('hud.rings')}</span></div>`}<div class="ring-icons">${items}</div>`;
}

export function roundMarks(round: number): string {
  const count = round > 10 ? 3 : Math.max(0, Math.floor(round));
  return `<span class="round-scratches" aria-hidden="true">${'<i></i>'.repeat(count)}</span>${round > 10 ? `<span class="round-number">${round}</span>` : ''}`;
}

/** `lamps[i]` is true once that lamp is completely filled. */
export function lampProgress(lamps: readonly boolean[], compact = false): string {
  const full = lamps.filter(Boolean).length;
  return `<div class="lamp-heading"><span>${t('hud.lamps')}</span><strong>${full} / ${lamps.length}</strong></div>
    <div class="lamp-icons">${lamps.map((filled, index) => `<span class="lamp ${filled ? 'lit' : 'unlit'}" aria-label="${t('hud.lampLabel', { index: index + 1, state: t(filled ? 'hud.lampLit' : 'hud.lampUnlit') })}">${lampIcon()}${compact ? '' : `<small>${index + 1}</small>`}</span>`).join('')}</div>`;
}

