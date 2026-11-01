import { formatNumber } from '../i18n/i18n';
import { PointsGainTracker, pointsGainTier } from './PointsGain';

/** Popups alive at once; a burst of fire recycles the oldest. Covers `points-rise` (style.css) at full-auto rates. */
const POPUP_POOL_SIZE = 10;
/** Widest sideways drift of a popup, in px, so a burst fans out instead of stacking. */
const POPUP_MAX_DRIFT_PX = 26;

/**
 * Reward feedback on the points counter: every rise in the balance throws a
 * "+N" that springs out of the counter and floats away, louder for kills and
 * headshots, while the counter itself pulses.
 */
export class PointsPopups {
  private readonly tracker = new PointsGainTracker();
  private readonly pool: HTMLElement[] = [];
  private nextPopup = 0;

  public constructor(
    private readonly layer: HTMLElement,
    private readonly counter: HTMLElement,
    private readonly random: () => number = Math.random,
  ) {}

  /** Called with every rendered balance; pops whatever was gained since the last one. */
  public update(points: number): void {
    const gain = this.tracker.observe(points);
    if (gain > 0) this.show(gain);
  }

  /** A new run or a hidden panel: forgets the balance and stops every popup. */
  public reset(): void {
    this.tracker.reset();
    for (const popup of this.pool) popup.className = 'points-popup';
    this.counter.classList.remove('gained', 'gained-major');
  }

  private show(amount: number): void {
    const tier = pointsGainTier(amount);
    const popup = this.acquire();
    popup.textContent = `+${formatNumber(amount)}`;
    popup.style.setProperty('--points-drift', `${(this.random() * 2 - 1) * POPUP_MAX_DRIFT_PX}px`);
    popup.className = 'points-popup';
    this.counter.classList.remove('gained', 'gained-major');
    // Reflow so a recycled popup and the counter pulse replay from the start.
    void popup.offsetWidth;
    popup.className = `points-popup active ${tier}`;
    this.counter.classList.add(tier === 'major' ? 'gained-major' : 'gained');
  }

  private acquire(): HTMLElement {
    if (this.pool.length < POPUP_POOL_SIZE) {
      const popup = document.createElement('span');
      popup.className = 'points-popup';
      this.layer.append(popup);
      this.pool.push(popup);
      return popup;
    }
    const popup = this.pool[this.nextPopup];
    this.nextPopup = (this.nextPopup + 1) % POPUP_POOL_SIZE;
    return popup;
  }
}
