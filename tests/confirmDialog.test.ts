import { describe, expect, it, vi } from 'vitest';
import { confirmDialog } from '../src/ui/ConfirmDialog';

class Dialog extends EventTarget {
  public returnValue = '';
  public readonly showModal = vi.fn();
  public finish(value = ''): void { this.returnValue = value; this.dispatchEvent(new Event('close')); }
}

describe('nonblocking native confirmation', () => {
  it('accepts only the affirmative form button and resets a previous response', async () => {
    const dialog = new Dialog();
    const first = confirmDialog(dialog as unknown as HTMLDialogElement);
    dialog.finish('accept');
    expect(await first).toBe(true);
    const second = confirmDialog(dialog as unknown as HTMLDialogElement);
    expect(dialog.returnValue).toBe('');
    dialog.finish();
    expect(await second).toBe(false);
  });

  it('supports cancellation without blocking the game/menu polling loop', async () => {
    const dialog = new Dialog();
    const response = confirmDialog(dialog as unknown as HTMLDialogElement);
    expect(dialog.showModal).toHaveBeenCalledOnce();
    dialog.finish('cancel');
    expect(await response).toBe(false);
  });
});
