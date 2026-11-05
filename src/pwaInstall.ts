/** What the main-menu install action does on this device; 'none' hides it. */
export type InstallAction = 'none' | 'prompt' | 'ios-steps' | 'browser-steps';

export interface InstallContext {
  readonly isMobile: boolean;
  /** Running from the home screen, inside the Capacitor app, or installed during this visit. */
  readonly isInstalledApp: boolean;
  readonly isIOS: boolean;
  /** The browser fired `beforeinstallprompt` and the prompt has not been used yet. */
  readonly hasInstallPrompt: boolean;
}

/** Installing is only offered on mobile; browsers without a prompt get written steps instead. */
export function resolveInstallAction(context: InstallContext): InstallAction {
  if (!context.isMobile || context.isInstalledApp) return 'none';
  if (context.hasInstallPrompt) return 'prompt';
  return context.isIOS ? 'ios-steps' : 'browser-steps';
}
