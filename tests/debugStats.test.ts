import { afterEach, describe, expect, it, vi } from 'vitest';
import { DebugStats } from '../src/ui/DebugStats';
import { formatNumber, setLanguage, t } from '../src/i18n/i18n';
import { createDebugDocument } from './debugStatsDom';

const info = {
  render: { frame: 1, calls: 512, triangles: 192509, points: 0, lines: 0 },
  memory: { geometries: 807, textures: 153 },
};

function setup(): ReturnType<typeof createDebugDocument> & { panel: DebugStats } {
  const dom = createDebugDocument();
  vi.stubGlobal('document', dom.document);
  return { ...dom, panel: new DebugStats() };
}

afterEach(() => { vi.unstubAllGlobals(); setLanguage('en'); });

describe('diagnostics panel data', () => {
  it('shows translated metrics with units, a reference and the measured history', () => {
    setLanguage('es');
    const { panel, nodes, document } = setup();
    const update = (): void => panel.update(1 / 60, info, 0.8, 1536, 864);
    update(); // Discard the interval before diagnostics were enabled.
    for (let frame = 0; frame < 15; frame++) update();
    const texts = nodes.map((node) => node.textContent);
    expect(texts).toContain('60');
    expect(texts).toContain(`${formatNumber(16.7)} ms`);
    expect(texts).toContain(formatNumber(192509));
    expect(texts).toContain('512');
    expect(texts).toContain('807');
    expect(texts).toContain('153');
    expect(texts).toContain('80%');
    expect(texts).toContain('1536 × 864 px');
    expect(texts).toContain(t('debug.resourcesHint'));
    expect(texts).toContain(t('debug.history', { frames: 15 }));
    expect(document.body.children[0].dataset.state).toBe('good');
    const points = nodes.find((node) => node.tag === 'polyline')!.attributes.points.split(' ');
    expect(points).toHaveLength(15);
  });

  it('retains a real stall in the metrics while keeping the plotted coordinates in bounds', () => {
    const { panel, nodes, document } = setup();
    panel.update(1 / 60, info, 1, 1920, 1080);
    panel.update(0.5, info, 1, 1920, 1080);
    expect(nodes.map((node) => node.textContent)).toContain('500 ms');
    expect(document.body.children[0].dataset.state).toBe('critical');
    const point = nodes.find((node) => node.tag === 'polyline')!.attributes.points;
    expect(point).toBe('210.0,2.0');
  });

  it('labels frozen samples and discards the resume interval and old history', () => {
    const { panel, nodes, document } = setup();
    panel.update(0.01, info, 1, 1920, 1080);
    panel.update(0.5, info, 1, 1920, 1080);
    panel.pause();
    panel.pause();
    expect(document.body.children[0].dataset.state).toBe('paused');
    expect(nodes.map((node) => node.textContent)).toContain(t('debug.paused'));
    panel.update(10, info, 1, 1920, 1080);
    expect(document.body.children[0].dataset.state).toBe('waiting');
    for (let frame = 0; frame < 15; frame++) panel.update(1 / 60, info, 1, 1920, 1080);
    expect(document.body.children[0].dataset.state).toBe('good');
    expect(nodes.map((node) => node.textContent)).not.toContain('500 ms');
    expect(nodes.map((node) => node.textContent)).toContain(t('debug.history', { frames: 15 }));
    panel.dispose();
    expect(document.body.children[0].removed).toBe(true);
  });
});
