import { afterEach, describe, expect, it, vi } from 'vitest';
import { HUD } from '../src/ui/HUD';
import { QUALITY_LEVELS, type QualityLevel } from '../src/core/DeviceProfile';

afterEach(() => vi.unstubAllGlobals());

function qualityButtons(available: readonly QualityLevel[]): Map<string, HTMLButtonElement> {
  const buttons = new Map(['auto', ...QUALITY_LEVELS].map((quality) => {
    const button = {
      dataset: { quality }, hidden: false, onclick: null,
      setAttribute: vi.fn(),
    } as unknown as HTMLButtonElement;
    return [quality, button];
  }));
  vi.stubGlobal('document', {
    getElementById: () => ({ querySelectorAll: () => [...buttons.values()] }),
  });
  const hud = Object.create(HUD.prototype) as HUD;
  hud.setQualitySelect('auto', available, vi.fn());
  return buttons;
}

describe('Combined quality settings', () => {
  it('keeps Auto selectable while hiding Ultra Max on devices limited to High', () => {
    const buttons = qualityButtons(['low', 'medium', 'high']);
    expect(buttons.get('auto')!.hidden).toBe(false);
    expect(buttons.get('auto')!.setAttribute).toHaveBeenLastCalledWith('aria-pressed', 'true');
    expect(buttons.get('ultraMax')!.hidden).toBe(true);
    expect(buttons.get('high')!.hidden).toBe(false);
  });

  it('switches from Ultra Max back to Auto through the same callback', () => {
    const buttons = qualityButtons(QUALITY_LEVELS);
    const select = vi.fn();
    (Object.create(HUD.prototype) as HUD).setQualitySelect('ultraMax', QUALITY_LEVELS, select);
    expect(buttons.get('ultraMax')!.hidden).toBe(false);
    expect(buttons.get('ultraMax')!.setAttribute).toHaveBeenLastCalledWith('aria-pressed', 'true');
    buttons.get('auto')!.onclick!.call(buttons.get('auto')!, {} as PointerEvent);
    expect(select).toHaveBeenCalledExactlyOnceWith('auto');
    expect(buttons.get('ultraMax')!.setAttribute).toHaveBeenLastCalledWith('aria-pressed', 'false');
  });
});
