import type { WebGLInfo } from 'three';
import { FRAME_HISTORY_SIZE, FramePerformance } from '../core/FramePerformance';
import { formatNumber, setTranslatedText, t, type TranslationKey } from '../i18n/i18n';
import './debug-stats.css';

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K, className: string, key?: TranslationKey,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (key) setTranslatedText(node, key);
  return node;
}

function svgElement<K extends keyof SVGElementTagNameMap>(
  tag: K, attributes: Readonly<Record<string, string>>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function metric(key: TranslationKey, value: HTMLElement): HTMLElement {
  const row = element('div', 'debug-metric');
  row.append(element('span', 'debug-label', key), value);
  return row;
}

function milliseconds(value: number): string {
  return `${formatNumber(Math.round(value * 10) / 10)} ms`;
}

/** Read-only diagnostics view. Game owns its lifecycle and supplies real frame intervals. */
export class DebugStats {
  private readonly root = element('section', 'debug-stats');
  private readonly performance = new FramePerformance();
  private readonly status = element('span', 'debug-status');
  private readonly fps = element('strong', 'debug-fps');
  private readonly average = element('strong', 'debug-value');
  private readonly p95 = element('strong', 'debug-value');
  private readonly peak = element('strong', 'debug-value');
  private readonly scale = element('strong', 'debug-value');
  private readonly dimensions = element('span', 'debug-dimensions');
  private readonly calls = element('strong', 'debug-value');
  private readonly triangles = element('strong', 'debug-value');
  private readonly geometries = element('strong', 'debug-value');
  private readonly textures = element('strong', 'debug-value');
  private readonly history = element('span', 'debug-history');
  private readonly plot = svgElement('polyline', { class: 'debug-plot', points: '' });
  private skipNextInterval = true;
  private paused = false;

  public constructor() {
    this.root.id = 'debug-stats';
    this.root.setAttribute('aria-label', t('debug.title'));
    this.root.setAttribute('aria-live', 'off');
    const header = element('header', 'debug-header');
    header.append(element('strong', 'debug-title', 'debug.title'), this.status);

    const summary = element('div', 'debug-summary');
    const cadence = element('div', 'debug-cadence');
    const unit = element('span', 'debug-unit');
    unit.textContent = 'FPS';
    cadence.append(this.fps, unit);
    summary.append(cadence, metric('debug.frameTime', this.average));

    const chart = element('div', 'debug-chart');
    const caption = element('div', 'debug-chart-caption');
    caption.append(this.history, element('span', '', 'debug.chartScale'));
    const svg = svgElement('svg', { viewBox: '0 0 240 54', 'aria-hidden': 'true' });
    for (const ms of [0, 1000 / 60, 1000 / 30, 50]) {
      const y = 50 - ms / 50 * 48;
      svg.append(svgElement('line', { x1: '0', x2: '210', y1: String(y), y2: String(y),
        class: ms === 1000 / 60 ? 'debug-target-line' : 'debug-grid-line' }));
      const label = svgElement('text', { x: '216', y: String(Math.max(8, y + 3)) });
      label.textContent = ms === 50 ? '50+' : formatNumber(Math.round(ms * 10) / 10);
      svg.append(label);
    }
    svg.append(this.plot);
    chart.append(caption, svg);

    const timings = element('div', 'debug-grid');
    timings.append(metric('debug.p95', this.p95), metric('debug.peak', this.peak));
    const reference = element('p', 'debug-explanation', 'debug.reference');
    const p95Hint = element('p', 'debug-explanation', 'debug.p95Hint');

    const resolution = element('div', 'debug-resolution');
    const resolutionValue = element('div', 'debug-resolution-value');
    resolutionValue.append(this.scale, this.dimensions);
    resolution.append(element('span', 'debug-label', 'debug.resolution'), resolutionValue);

    const render = element('div', 'debug-section');
    const renderMetrics = element('div', 'debug-grid');
    renderMetrics.append(metric('debug.calls', this.calls), metric('debug.triangles', this.triangles));
    render.append(element('p', 'debug-section-title', 'debug.render'), renderMetrics,
      element('p', 'debug-explanation', 'debug.renderHint'));

    const resources = element('div', 'debug-section');
    const resourceMetrics = element('div', 'debug-grid');
    resourceMetrics.append(metric('debug.geometries', this.geometries), metric('debug.textures', this.textures));
    resources.append(element('p', 'debug-section-title', 'debug.resources'), resourceMetrics,
      element('p', 'debug-explanation', 'debug.resourcesHint'));

    this.root.append(header, summary, reference, chart, timings, p95Hint, resolution, render, resources);
    for (const value of [this.scale, this.dimensions, this.calls, this.triangles, this.geometries, this.textures]) {
      value.textContent = '—';
    }
    this.clearTiming();
    document.body.appendChild(this.root);
  }

  public update(
    seconds: number, info: Pick<WebGLInfo, 'render' | 'memory'>,
    resolutionScale: number, width: number, height: number,
  ): void {
    // Neither the activation interval nor the first interval after a pause is a gameplay sample.
    if (this.skipNextInterval) {
      this.skipNextInterval = false;
      this.paused = false;
      this.performance.reset();
      this.clearTiming();
      return;
    }
    if (!this.performance.sample(seconds)) return;
    this.root.dataset.state = this.performance.status;
    this.status.textContent = t(`debug.status.${this.performance.status}`);
    this.fps.textContent = formatNumber(Math.round(this.performance.fps));
    this.average.textContent = milliseconds(this.performance.averageMs);
    this.p95.textContent = milliseconds(this.performance.p95Ms);
    this.peak.textContent = milliseconds(this.performance.peakMs);
    this.history.textContent = t('debug.history', { frames: this.performance.frameCount });
    this.scale.textContent = `${Math.round(resolutionScale * 100)}%`;
    this.dimensions.textContent = `${width} × ${height} px`;
    this.calls.textContent = formatNumber(info.render.calls);
    this.triangles.textContent = formatNumber(info.render.triangles);
    this.geometries.textContent = formatNumber(info.memory.geometries);
    this.textures.textContent = formatNumber(info.memory.textures);
    this.updatePlot();
  }

  /** Freeze the last sample and identify it, instead of measuring the cheaper pause render. */
  public pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.skipNextInterval = true;
    this.root.dataset.state = 'paused';
    this.status.textContent = t('debug.paused');
  }

  public dispose(): void { this.root.remove(); }

  private clearTiming(): void {
    this.root.dataset.state = 'waiting';
    this.status.textContent = t('debug.waiting');
    for (const value of [this.fps, this.average, this.p95, this.peak]) value.textContent = '—';
    this.history.textContent = t('debug.history', { frames: 0 });
    this.plot.setAttribute('points', '');
  }

  private updatePlot(): void {
    let points = '';
    const count = this.performance.frameCount;
    for (let index = 0; index < count; index++) {
      const x = (FRAME_HISTORY_SIZE - count + index) / (FRAME_HISTORY_SIZE - 1) * 210;
      // Keep long stalls visible at the top; the peak readout retains the actual duration.
      const y = 50 - Math.min(this.performance.frameMsAt(index), 50) / 50 * 48;
      points += `${index === 0 ? '' : ' '}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    this.plot.setAttribute('points', points);
  }
}
