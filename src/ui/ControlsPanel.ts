import { onLanguageChange, t, type TranslationKey } from '../i18n/i18n';
import { getControllerFamily, getInputDevice, onInputDeviceChange, type InputDevice } from '../player/InputPresentation';
import { controlDevices, describeControls, type ControlsCategory, type ControlsRow } from './ControlsCatalog';

const CATEGORY_LABELS: Readonly<Record<ControlsCategory, TranslationKey>> = {
  movement: 'controls.categoryMovement',
  combat: 'controls.categoryCombat',
  interaction: 'controls.categoryInteraction',
  other: 'controls.categoryOther',
};

const DEVICE_LABELS: Readonly<Record<InputDevice, TranslationKey>> = {
  keyboard: 'controls.deviceKeyboard',
  touch: 'controls.deviceTouch',
  gamepad: 'controls.deviceGamepad',
};

/**
 * Controls reference dialog, opened from the pause menu and the settings.
 * It renders ControlsCatalog for one device, the one in use by default.
 */
export class ControlsPanel {
  private device: InputDevice = 'keyboard';

  public constructor(
    private readonly dialog: HTMLDialogElement,
    private readonly deviceTabs: HTMLElement,
    private readonly sections: HTMLElement,
    openers: readonly HTMLElement[],
  ) {
    for (const opener of openers) opener.onclick = () => this.open();
    onLanguageChange(() => this.renderIfOpen());
    onInputDeviceChange(() => {
      if (!this.dialog.open) return;
      this.device = this.preferredDevice();
      this.render();
    });
  }

  public open(): void {
    this.device = this.preferredDevice();
    this.render();
    if (!this.dialog.open) this.dialog.showModal();
  }

  private renderIfOpen(): void {
    if (this.dialog.open) this.render();
  }

  private availableDevices(): readonly InputDevice[] {
    return controlDevices(document.documentElement.classList.contains('touch-controls-enabled'));
  }

  private preferredDevice(): InputDevice {
    const devices = this.availableDevices();
    const current = getInputDevice(devices[0]);
    return devices.includes(current) ? current : devices[0];
  }

  private render(): void {
    this.renderTabs();
    const family = getControllerFamily();
    this.sections.replaceChildren(...describeControls(this.device, family).map(({ category, rows }) => {
      const section = document.createElement('section');
      section.className = 'controls-section';
      const heading = document.createElement('h3');
      heading.textContent = t(CATEGORY_LABELS[category]);
      const list = document.createElement('dl');
      list.append(...rows.map((row) => this.renderRow(row)));
      section.append(heading, list);
      return section;
    }));
  }

  private renderTabs(): void {
    this.deviceTabs.replaceChildren(...this.availableDevices().map((device) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = t(DEVICE_LABELS[device]);
      button.setAttribute('aria-pressed', String(device === this.device));
      button.onclick = () => {
        this.device = device;
        this.render();
        this.deviceTabs.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
      };
      return button;
    }));
  }

  private renderRow(row: ControlsRow): HTMLElement {
    const item = document.createElement('div');
    item.className = 'controls-row';
    if (row.coopHidden) item.dataset.coopHidden = '';
    const label = document.createElement('dt');
    label.textContent = t(row.label);
    const keys = document.createElement('dd');
    row.keys.forEach((group, index) => {
      if (index > 0) keys.append(' / ');
      for (const key of group) {
        const kbd = document.createElement('kbd');
        kbd.textContent = key;
        keys.append(kbd);
      }
    });
    item.append(label, keys);
    return item;
  }
}
