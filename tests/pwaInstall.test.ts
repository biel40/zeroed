import { describe, expect, it } from 'vitest';
import { resolveInstallAction, type InstallContext } from '../src/pwaInstall';

const MOBILE_BROWSER: InstallContext = {
  isMobile: true,
  isInstalledApp: false,
  isIOS: false,
  hasInstallPrompt: false,
};

describe('resolveInstallAction', () => {
  it('never offers installing on desktop, even with a native prompt', () => {
    expect(resolveInstallAction({ ...MOBILE_BROWSER, isMobile: false, hasInstallPrompt: true })).toBe('none');
  });

  it('hides the offer when already running as the installed PWA or the native app', () => {
    expect(resolveInstallAction({ ...MOBILE_BROWSER, isInstalledApp: true, hasInstallPrompt: true })).toBe('none');
  });

  it('uses the browser install prompt when the browser provided one', () => {
    expect(resolveInstallAction({ ...MOBILE_BROWSER, hasInstallPrompt: true })).toBe('prompt');
  });

  it('explains the Share sheet steps on iOS, which has no install prompt', () => {
    expect(resolveInstallAction({ ...MOBILE_BROWSER, isIOS: true })).toBe('ios-steps');
  });

  it('explains the browser menu steps when no prompt is available', () => {
    expect(resolveInstallAction(MOBILE_BROWSER)).toBe('browser-steps');
  });
});
