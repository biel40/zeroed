import {
  BOOLEAN_SETTINGS,
  getSettings,
  onSettingsChange,
  resetSettings,
  SETTING_RANGES,
  updateSettings,
  type NumericSetting,
  type BooleanSetting,
} from '../core/PlayerSettings';

function isNumericSetting(value: string | undefined): value is NumericSetting {
  return value !== undefined && Object.hasOwn(SETTING_RANGES, value);
}

function isBooleanSetting(value: string | undefined): value is BooleanSetting {
  return BOOLEAN_SETTINGS.some(key => key === value);
}

function formatSetting(key: NumericSetting, value: number): string {
  if (key === 'fieldOfView') return `${value}°`;
  if (key === 'gamepadLookHorizontal' || key === 'gamepadLookVertical') return `${value}°/s`;
  if (key === 'lookSensitivity' || key === 'adsSensitivity' || key === 'gamepadAdsSensitivity') return `${value.toFixed(2)}×`;
  return `${Math.round(value * 100)} %`;
}

interface NumericControl {
  readonly key: NumericSetting;
  readonly input: HTMLInputElement;
  readonly output: HTMLOutputElement | null;
}

interface BooleanControl {
  readonly key: BooleanSetting;
  readonly input: HTMLInputElement;
}

/**
 * Settings dialog: a view over PlayerSettings. Every change is applied and
 * saved at once, so it behaves the same from the main menu and mid-match.
 */
export class SettingsPanel {
  private readonly controls: NumericControl[] = [];
  private readonly toggles: BooleanControl[] = [];

  /**
   * `menuButton` opens the full panel; `pauseButton` hides `[data-menu-only]`
   * rows (graphics quality), which only take effect when a match starts.
   */
  public constructor(private readonly dialog: HTMLDialogElement, menuButton: HTMLElement, pauseButton: HTMLElement) {
    for (const input of dialog.querySelectorAll<HTMLInputElement>('input[type="range"][data-setting]')) {
      const key = input.dataset.setting;
      if (!isNumericSetting(key)) continue;
      const { min, max, step } = SETTING_RANGES[key];
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.oninput = () => updateSettings({ [key]: Number(input.value) });
      this.controls.push({ key, input, output: input.parentElement?.querySelector('output') ?? null });
    }
    for (const input of dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-setting]')) {
      const key = input.dataset.setting;
      if (!isBooleanSetting(key)) continue;
      input.onchange = () => updateSettings({ [key]: input.checked });
      this.toggles.push({ key, input });
    }
    const reset = dialog.querySelector<HTMLButtonElement>('#settings-reset');
    if (reset) reset.onclick = () => resetSettings();
    const save = dialog.querySelector<HTMLButtonElement>('#settings-save');
    if (save) save.onclick = () => updateSettings(getSettings());
    menuButton.onclick = () => this.open('menu');
    pauseButton.onclick = () => this.open('pause');
    onSettingsChange(() => this.sync());
    this.sync();
  }

  /** Game checks it so ESC closes the dialog instead of resuming the match. */
  public get isOpen(): boolean {
    return this.dialog.open;
  }

  public open(context: 'menu' | 'pause'): void {
    for (const row of this.dialog.querySelectorAll<HTMLElement>('[data-menu-only]')) row.hidden = context !== 'menu';
    if (!this.dialog.open) this.dialog.showModal();
  }

  private sync(): void {
    const settings = getSettings();
    for (const { key, input, output } of this.controls) {
      input.value = String(settings[key]);
      if (output) output.textContent = formatSetting(key, settings[key]);
    }
    for (const { key, input } of this.toggles) input.checked = settings[key];
  }
}
