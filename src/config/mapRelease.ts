/**
 * Local-development opt-in for maps marked `workInProgress` in the registry:
 * set `VITE_WIP_MAPS=true` (e.g. in `.env.local`) and run the dev server.
 * `vite build` replaces `import.meta.env.DEV` with `false`, so production
 * builds rely on account preview entitlements for WIP maps.
 */
export const WIP_MAPS_ENABLED: boolean = import.meta.env.DEV && import.meta.env.VITE_WIP_MAPS === 'true';
