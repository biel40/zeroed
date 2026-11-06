/** A measured objective (unlocking, charging): drawn as a bar under the note's title. */
export interface ObjectiveGauge {
  /** What fills (e.g. the blast door). */
  readonly label: string;
  /** 0..1; clamped when drawn. */
  readonly ratio: number;
  /** Text beside the label: percentage, clock. */
  readonly readout: string;
  /** The fill is halted (nobody defends it): the bar warns instead of advancing. */
  readonly stalled: boolean;
}

interface GaugeElements {
  readonly root: HTMLElement;
  readonly label: HTMLElement;
  readonly readout: HTMLElement;
  readonly fill: HTMLElement;
}

function part(className: string): HTMLElement {
  const element = document.createElement('div');
  element.className = className;
  return element;
}

function writeText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

/**
 * DOM of one note's `ObjectiveGauge`: a header (label and readout) over a
 * segmented track whose fill eases between updates (see `.objective-gauge`
 * in style.css). Built on the first gauge it shows, so notes without one
 * never create it.
 */
export class ObjectiveGaugeView {
  private elements: GaugeElements | null = null;
  private width = '';

  /** `mount` places the gauge's root inside its note once built. */
  public constructor(private readonly mount: (root: HTMLElement) => void) {}

  /** Draws the gauge, or hides it when the note has none. */
  public render(gauge: ObjectiveGauge | undefined): void {
    if (gauge === undefined) {
      this.elements?.root.classList.add('hidden');
      return;
    }
    const elements = this.elements ?? this.build();
    elements.root.classList.remove('hidden');
    writeText(elements.label, gauge.label);
    writeText(elements.readout, gauge.readout);
    elements.root.classList.toggle('stalled', gauge.stalled);
    const width = `${(Math.min(1, Math.max(0, gauge.ratio)) * 100).toFixed(2)}%`;
    if (width !== this.width) {
      this.width = width;
      elements.fill.style.width = width;
    }
  }

  private build(): GaugeElements {
    const elements: GaugeElements = {
      root: part('objective-gauge'),
      label: part('objective-gauge-label'),
      readout: part('objective-gauge-readout'),
      fill: part('objective-gauge-fill'),
    };
    const head = part('objective-gauge-head');
    const track = part('objective-gauge-track');
    head.append(elements.label, elements.readout);
    track.append(elements.fill);
    elements.root.append(head, track);
    this.mount(elements.root);
    this.elements = elements;
    return elements;
  }
}
