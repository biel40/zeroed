import { getSettings, onSettingsChange } from '../core/PlayerSettings';
import { t } from '../i18n/i18n';
import { actionKey } from './InteractionPrompts';

/** Keep the preference independent from the current target's `.hidden` state. */
export function bindInteractionPromptVisibility(element: HTMLElement): () => void {
  const sync = (): void => { element.hidden = !getSettings().showInteractionPrompts; };
  sync();
  return onSettingsChange(sync);
}

/** Presentation of the existing localized, two-line prompt contract. */
export function interactionPromptContent(text: string): {
  title: string;
  detail: string;
  action: { label: string; key: string } | null;
} {
  const [title, ...lines] = text.split('\n');
  const detail = lines.join('\n').trim();
  const hints = [t('prompt.press'), t('prompt.hold'), t('prompt.pressTouch'), t('prompt.holdTouch'), actionKey(false), actionKey(false, true)];
  for (const hint of hints) {
    // Match whole hints, so item names and locked-state text stay literal.
    if (detail !== hint && !detail.startsWith(`${hint} — `)) continue;
    const separator = hint.lastIndexOf(' ');
    return {
      title,
      detail: detail.slice(hint.length).replace(/^ — /u, ''),
      action: { label: hint.slice(0, separator), key: hint.slice(separator + 1) },
    };
  }
  return { title, detail, action: null };
}

/** Uses text nodes throughout: map-provided labels are never interpreted as HTML. */
export function renderInteractionPrompt(element: HTMLElement, text: string): void {
  const content = interactionPromptContent(text);
  const title = document.createElement('strong');
  title.className = 'interaction-title';
  title.textContent = content.title;
  const children: HTMLElement[] = [title];

  if (content.action || content.detail) {
    const detail = document.createElement('div');
    detail.className = 'interaction-detail';
    if (content.action) {
      const action = document.createElement('span');
      action.className = 'interaction-action';
      const key = document.createElement('kbd');
      key.className = 'interaction-key';
      key.textContent = content.action.key;
      action.append(`${content.action.label} `, key);
      detail.append(action);
    }
    if (content.detail) {
      const note = document.createElement('span');
      note.className = 'interaction-note';
      note.textContent = content.detail;
      detail.append(note);
    }
    children.push(detail);
  }
  let sheen = element.querySelector<HTMLElement>('.interaction-sheen');
  if (!sheen) {
    sheen = document.createElement('span');
    sheen.className = 'interaction-sheen';
    sheen.setAttribute('aria-hidden', 'true');
    element.prepend(sheen);
  }
  // Updating a locked case's counter must not replay its entrance reflection.
  for (const child of Array.from(element.childNodes)) {
    if (child !== sheen) child.remove();
  }
  element.append(...children);
}
