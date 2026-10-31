/** Await a native dialog without blocking the frame loop that polls controller input. */
export function confirmDialog(dialog: HTMLDialogElement): Promise<boolean> {
  return new Promise(resolve => {
    dialog.returnValue = '';
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'accept'), { once: true });
    dialog.showModal();
  });
}
