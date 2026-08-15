export interface DeviceProfile {
  readonly isMobile: boolean;
  readonly isTouch: boolean;
  readonly isLowMemory: boolean;
  readonly pixelRatioLimit: number;
  readonly shadowQuality: 0 | 1 | 2;
  readonly useReducedEffects: boolean;
  readonly useTouchControls: boolean;
  readonly anisotropyLimit: number;
  readonly log: Record<string, unknown>;
}

type DeviceNavigator = Partial<Navigator> & {
  matchMedia?: (query: string) => { matches: boolean };
  deviceMemory?: number;
};

export function getDeviceProfile(navigatorLike: DeviceNavigator = navigator as DeviceNavigator): DeviceProfile {
  const userAgent = navigatorLike.userAgent ?? '';
  const touchPoints = navigatorLike.maxTouchPoints ?? 0;
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(userAgent);
  const matchMedia = navigatorLike.matchMedia ??
    (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia.bind(window)
      : undefined);
  const coarsePointer = matchMedia?.('(pointer: coarse)').matches ?? false;
  const reducedMotion = matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  // Capability is authoritative. The UA is only a fallback for old mobile
  // WebViews that report touch points but do not expose pointer media queries.
  const useTouchControls = coarsePointer || (touchPoints > 0 && mobileUserAgent);
  const isMobile = useTouchControls;
  const deviceMemory = typeof navigatorLike.deviceMemory === 'number' ? navigatorLike.deviceMemory : 8;
  const hardwareConcurrency = navigatorLike.hardwareConcurrency ?? 8;
  const isLowMemory = deviceMemory <= 6 || hardwareConcurrency <= 4;
  const isTouch = touchPoints > 0 || coarsePointer;
  const useReducedEffects = isMobile || coarsePointer || isLowMemory || reducedMotion;
  const pixelRatioLimit = isMobile ? (isLowMemory ? 1 : 1.5) : 2;
  const shadowQuality: 0 | 1 | 2 = useReducedEffects ? (isLowMemory ? 0 : 1) : 2;

  return {
    isMobile,
    isTouch,
    isLowMemory,
    pixelRatioLimit,
    shadowQuality,
    useReducedEffects,
    useTouchControls,
    anisotropyLimit: useReducedEffects ? 2 : 8,
    log: {
      userAgent,
      touchPoints,
      hardwareConcurrency,
      deviceMemory,
      isMobile,
      isTouch,
      isLowMemory,
      coarsePointer,
      useTouchControls,
      reducedMotion,
      pixelRatioLimit,
      shadowQuality,
      useReducedEffects,
    },
  };
}
