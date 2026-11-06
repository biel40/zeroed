/** API the Electron preload (`desktop/preload.cjs`) exposes; absent in browsers and the Android app. */
export interface DesktopShell {
  quit(): void;
}

declare global {
  interface Window {
    readonly zeroedDesktop?: DesktopShell;
  }
}

/** The desktop shell when running as the desktop app, otherwise null. */
export function getDesktopShell(): DesktopShell | null {
  return window.zeroedDesktop ?? null;
}
