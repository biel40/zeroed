# ZEROED — Technical Audit for Large-Scale Maps (La Seu / La Almudaina)

Date: 2026-11-10 · Commit audited: `4d1fc96` (clean `main`) · Scope: audit only, no production code changed.

Every figure below is labelled **[M]** when it was measured in this audit, **[C]** when read directly from code, or **[E]** when it is an estimate or extrapolation. No FPS, GPU-memory or device numbers are claimed: none could be measured here (see §E).

---

## A. Executive Summary

**Verdict: READY WITH OPTIMIZATIONS.** The audit found no blocker in the map contract, mode separation or lifecycle that would prevent a La Seu map. The current maps are small: about 80–180 k triangles, 600–900 draw objects and navigation floors of at most 47×103 m. La Seu (cathedral nave ≈ 120×60 m, plus courtyards and the palace) would exceed several implicit limits. Those limits are workable today only because the maps are small.

What already works and can be reused:

- A strict, map-agnostic `ZombieArena` contract and a data registry (`ZOMBIE_MAPS`). Modes never depend on a specific map.
- Full teardown between matches: `Game.dispose()` calls `renderer.forceContextLoss()`, so GPU memory is released by the browser for each match.
- Quality tiers (`DeviceProfile`), adaptive resolution (`DynamicResolution`), a point-light budget per tier (`POINT_LIGHT_BUDGET`), merged static geometry (`StaticMeshBatch`), and shader warm-up behind the loading screen (`Game.prepare`).
- Pooled zombies (`MAX_ALIVE = 24`) and capped pools for blood, bullet holes, particles and projectiles.

The main gaps before La Seu:

1. **No general visibility management (High).** Only Burned Mansion hides the other floor's meshes (`updateFloorRendering`). Station 33 keeps **790 of 923** drawables visible from the spawn point [M], and frustum culling is the only cull. A cathedral where the nave, cloister and palace can all be seen at once needs sector/portal visibility plus distance culling tied to fog.
2. **Navigation cost scales with floor area (High).** A* on a uniform 0.35 m grid with 2 paths per frame. On a synthetic 200×150 m floor, one cross-map path took **16.3 ms** in Node on desktop [M], and the floor needs **19 MB** of buffers [M]. On mobile that becomes a frame spike of tens of milliseconds [E].
3. **Every map ships in the single JS bundle and builds synchronously (High).** `zombieMaps.ts` statically imports every arena. The app is one **1.99 MB / 595 kB gzip** chunk [M]. A large procedural map adds to every player's download and blocks the main thread while building (first build 0.7–0.8 s on desktop Node [M]).
4. **Baked procedural textures persist for the whole session (Medium).** `ProceduralSurface.bakeCache` never evicts. After playing both maps and returning to the menu, **≈ 47 MB of ArrayBuffers** stay alive [M]. The cache doesn't grow when you switch back and forth between the same maps, but every new map adds its own share permanently.
5. **No draw-call reduction for repeated detail beyond merging (Medium).** Station 33 uses **0** `InstancedMesh` [M]. There is no LOD, no texture compression (all textures are uncompressed RGBA on the GPU), and collision and raycast queries scan every collider linearly.

None of these needs a rewrite. Each is an incremental addition behind the existing contracts (§F, §G).

---

## B. Architecture Overview (as found)

| Concern | Actual implementation | Source |
| --- | --- | --- |
| Engine | Three.js **0.178** `WebGLRenderer`, TypeScript, Vite 7; no physics engine, no UI framework | `package.json`, `src/core/Game.ts` |
| Platforms | Web/PWA (Workbox), Android via Capacitor 8, desktop via Electron 45 (Steam planned) | `vite.config.ts`, `desktop/main.mjs` |
| Composition root | `Game`: renderer, loop (`setAnimationLoop`), pause, shared services; one `Game` per match | `src/core/Game.ts` |
| Map registry | `ZOMBIE_MAPS` record → `createArena(scene, profile)` factory | `src/config/zombieMaps.ts` |
| Map contract | `ZombieArena` interface: `group`, `colliders`, `wallColliders`, `navigationBounds`, `floorTransitions`, `update(dt, observer)`, `refreshColliders()`, optional capabilities | `src/zombies/maps/ZombieArena.ts` |
| Map content | 100 % procedural: zone builders, `StaticMeshBatch`, code-baked PBR textures (`ProceduralSurface.bake`) | `src/zombies/maps/**` |
| External assets | Weapons (2 GLB), zombies (2 GLB, 1.2 MB), 6 Mystery Box JPGs (3.5 MB), audio (18 MB), menu art (3.9 MB PNG) | `public/assets/**`, `AssetManager` |
| Modes | `ZombiesMode` (single player), `CoopHostMode` / `CoopGuestMode` sharing `CoopWorld`; co-op is pinned to `burned-mansion` | `src/modes/**`, `COOP_ZOMBIE_MAP_ID` |
| Zombies | Pooled skinned GLB clones (`SkeletonUtils.clone`, one `AnimationMixer` each, per-zombie cloned materials), hitboxes parented to bones | `ZombiePool`, `ZombieVisual`, `Zombie` |
| Navigation | Pure per-floor walkability grid (0.35 m cells) + A* + line-of-sight smoothing; rebuilt on topology change; 2 path queries per frame | `src/zombies/navigation/*`, `ZombieManager` |
| Ballistics | Segment raycasts (`THREE.Raycaster.intersectObjects`) against a shared collider array | `src/shooting/BallisticsSystem.ts` |
| Network | WebSocket relay (Node or Cloudflare Durable Objects); host-authoritative JSON snapshots at 15 Hz | `CoopHostMode` (`MATCH_STATE_INTERVAL`), `src/network/Protocol.ts` |

Match lifecycle: `main.ts startGame()` → `game?.dispose()` → `new Game(...)` (the mode builds the arena **synchronously** in `init`) → `await game.prepare()` (`compileAsync`, texture upload, one frame) → loop. Returning to the menu calls `Game.dispose()`.

---

## C. Current Optimizations and Their Effectiveness

| Mechanism | Where | Effectiveness (evidence) |
| --- | --- | --- |
| Frustum culling | Three.js default; 11 objects opt out per map [M] | Works, but it's the only automatic cull. Behind-wall geometry inside the frustum is still drawn. |
| Floor visibility partition | `BurnedMansionArena.classifyFloorMeshes` / `updateFloorRendering` (layer 0 toggle) | Effective: 395 of 639 drawables rendered at spawn [M]. **Mansion-only**, hard-coded to two floors and a stair room. |
| Static geometry merging | `StaticMeshBatch` (one mesh per material) | Used heavily. Bounds are the union of all pieces, so merged batches spanning far-apart areas defeat frustum culling (the mansion works around this with `userData.floorPartition`). |
| Instancing | Blood (`ZombieBlood`, 1024), billboards (`BillboardParticles`), 4 mansion meshes (675 instances) | Effective where used; **Station 33 uses none** [M]. |
| Point-light budget | `POINT_LIGHT_BUDGET` low 3 / medium 4 / high 6; mansion ranks by distance, Station 33 by room | Effective and well reasoned (fixed light count avoids shader recompiles). Station 33 declares 35 point lights and shows 4–7 [M]. |
| Shadows | `shadowMap.enabled` on high only, but **no light has `castShadow = true`** [C] | Effectively no dynamic shadows, which is cheap. The 185–327 meshes flagged `castShadow` on high [M] have no effect. |
| Quality tiers | `DeviceProfile` (pixel ratio 1 / 1.5 / 2, antialias, anisotropy, reduced effects) | Sound. Detection is heuristic (`deviceMemory <= 6 || cores <= 4`); the user can override. |
| Dynamic resolution | `DynamicResolution` (0.5–1.0, gain-checked downscale) | Good design: it gives up when the bottleneck isn't GPU fill. It can't help a CPU- or draw-call-bound frame. |
| Shader warm-up | `Game.prepare()` (`compileAsync`, fade variants, `initTexture`) | Removes compile hitches; it scales with material count (174–226 unique materials per map [M]). |
| Pools and caps | Zombies 24, bullet holes 96, shells 24, flame 140/40/96, plasma 96, blood 1024 | Bounded memory in prolonged sessions [C]. |
| Path budget | `PATH_BUDGET_PER_FRAME = 2`, retry cooldowns | Bounds the count of paths, not the cost per path (see D-2). |
| Scratch buffers | Navigation typed arrays, reused vectors in `Game`/`ZombieManager` | Avoids per-frame garbage-collection pressure [C]. |
| Lazy music | `MusicTrack.lazy` (only `captain_ussr_theme`) | The mechanism exists but most tracks are eager (see D-7). |

---

## D. Findings

### D-1 · High · No sector or occlusion visibility management for general maps
- **Files:** `BurnedMansionArena.ts` (`classifyFloorMeshes`, `updateFloorRendering`), `Station33Arena.ts` (`activeZones` drives only spawns/barriers), `PlayerController.ts:116` (camera `far = 700`).
- **Explanation:** Apart from the mansion's two-floor toggle, nothing hides geometry that can't be seen. Station 33's `activeZones` only gates spawns and barrier views, never rendering. The far plane (700 m) isn't tied to fog: at Station 33's exp2 density 0.026, surfaces are ~100 % fogged by ~80 m, yet they are still drawn.
- **Evidence:** [M] Station 33 renders 790 / 923 drawables and 167.5 k / 179 k triangles from the spawn point. Mansion renders 395 / 639 thanks to its partition.
- **Impact:** A Gothic interior with dozens of chapels, the cloister and palace courtyards would draw almost everything every frame. On mobile, draw calls (CPU), not triangles, are usually the first limit [E].
- **Recommendation:** Generalise the mansion's mechanism into a shared, map-agnostic `SectorVisibility` service in `maps/shared/`. The map declares sectors (AABBs) and which sectors each sector can see, tags meshes and batches by sector at build time, and toggles them with `layers` from `update(dt, observer)`, as the mansion already does. Add a per-map far-plane/fog cull distance through `ArenaAmbience`. True GPU occlusion queries aren't needed.

### D-2 · High · Pathfinding cost grows with floor area
- **Files:** `navigation/NavigationGrid.ts` (constructor buffers, `astar`), `ZombieNavigationService.rebuild`, `ZombieManager.ts:106` (`PATH_BUDGET_PER_FRAME = 2`).
- **Explanation:** One uniform 0.35 m grid per floor. The A* open list is sized `cells × 8`. Rebuilds run synchronously for **all** floors on every topology change (doors). The budget limits paths per frame, not nodes expanded.
- **Evidence:** [M] Node 24, desktop CPU, synthetic floor with a pillar every 6 m:

  | Floor | Cells | Grid build | Worst cross-map path | Buffers |
  | --- | ---: | ---: | ---: | ---: |
  | 40×40 m | 13 k | 6 ms (first build, JIT) | 0.7 ms | 1 MB |
  | 80×60 m | 39 k | 0.7 ms | 3.1 ms | 3 MB |
  | 120×90 m | 88 k | 1.1 ms | 7.8 ms | 6.8 MB |
  | 200×150 m | 245 k | 1.9 ms | 16.3 ms | 19 MB |

  Current maps: Station 33 has 40 k + 7 k cells (3.6 MB) [M].
- **Impact:** At 2 paths per frame, a La Seu-sized floor could add 15–30 ms spikes on desktop and several times that on a mid-range Android (×3–5 CPU factor) [E]. Multi-level interiors (triforium, palace upper floors) multiply grids.
- **Recommendation:** Keep the pure grid, but add (a) a node-expansion budget per frame or per query, (b) a coarse sector graph (portal/door level) that limits A* to the sectors between start and goal, or hierarchical A* over the same `NavigationRect` data, and (c) a rebuild limited to the affected floor. Tests can be deterministic, as `tests/zombieNavigation.test.ts` already is.

### D-3 · High · All maps are bundled together and built synchronously on the main thread
- **Files:** `src/config/zombieMaps.ts` (static `import { BurnedMansionArena }`, `import { Station33Arena }`), `src/main.ts` `startGame()` (comment: "Building the arena blocks the main thread"), `ZombiesMode.ts:182`, `CoopWorld.ts:42`.
- **Evidence:** [M] `vite build` produces a single `index-*.js` of **1,989.9 kB (595.3 kB gzip)** with no map chunks. Arena build on desktop Node: mansion 802 ms cold / ~130 ms warm, Station 33 726 ms cold / ~190 ms warm (cold includes the procedural texture bake).
- **Impact:** Each new map increases initial download, parse and startup cost for every player, including free players who never open the premium map. A La Seu map several times larger than Station 33 could mean multi-second main-thread stalls on mobile while loading [E]. The loading overlay keeps animating on the compositor, but input and audio stall.
- **Recommendation:** Make `createArena` asynchronous, for example `loadArena: () => import('./maps/LaSeuArena').then(...)`, so each map becomes its own chunk. Keep the metadata (id, product, nameKey, coop) static. Let large maps build in time-sliced steps (zone by zone, yielding between builders) behind the existing `#map-loading`. Both changes fit the current contract: `ZOMBIE_MAPS` stays the single registry.

### D-4 · Medium · Baked textures stay in the JS heap for the whole session
- **Files:** `maps/shared/ProceduralSurface.ts:29` (`bakeCache`, never cleared).
- **Evidence:** [M] Cold process, ArrayBuffers retained after building and discarding each map: mansion **21.6 MB**, plus Station 33 **46.9 MB**. This stays flat over 6 alternating builds (38–46.9 MB), so there's no per-switch leak. The JS heap after discard drifts from 5.9 to 10.7 MB over 6 builds; GC noise and per-switch retention couldn't be separated in Node.
- **Impact:** Memory used by inactive maps is bounded but adds up per map. A La Seu with many 512–1024 px surfaces could add 50–150 MB [E], which matters on low-memory Android WebViews.
- **Recommendation:** Give the cache an owner. Clear map-specific keys on `Game.dispose()`, or key the cache by map and release it when switching maps. Keep shared keys (weapons, zombies) alive.

### D-5 · Medium · No instancing for repeated architectural elements; no LOD
- **Files:** `StaticMeshBatch.ts` (merging only), Station 33 builders (0 `InstancedMesh` [M]); no `THREE.LOD` anywhere [C].
- **Evidence:** [M] Unique geometries: mansion 494, Station 33 758. Geometry memory: 5.4 MB and 15.1 MB. Station 33 has 860 plain meshes.
- **Impact:** Gothic architecture is extremely repetitive (columns, ribs, tracery, pews, crenellations). Merging all of it creates large world-spanning batches that frustum culling can't reject. Unmerged, it creates thousands of draw calls.
- **Recommendation:** Add a sibling to `StaticMeshBatch` that emits `InstancedMesh` per sector for repeated props, and make `StaticMeshBatch` able to build one batch per sector (the mansion's `floorPartition` idea, generalised). Add simple distance LOD (swap or hide fine tracery and props beyond N m) only for the few ornate kits; fog already hides the far field.

### D-6 · Medium · Collision and raycast queries are linear in collider count
- **Files:** `ZombieManager.findObstacle` / `ZombieManager.ts:1861` (loop over `this.obstacles`), `BallisticsSystem.ts:169` (`intersectObjects(this.colliders)`), `GibWalls`.
- **Evidence:** [M] colliders: mansion 90 + 76 wall boxes; Station 33 272 + 191. Per frame: 24 zombies × several probes × N boxes [C].
- **Impact:** With 1,000–2,000 boxes (cathedral columns, chapels, palace rooms) [E], zombie steering alone reaches ~10⁵ box tests per frame, and every bullet segment tests every collider's bounding sphere. Probably 1–3 ms on desktop and more on mobile [E].
- **Recommendation:** Add a static uniform XZ hash (or per-sector lists) of collider boxes, rebuilt in `refreshColliders()`, and query only nearby cells. Use the same index to pre-filter ballistic candidates. This needs no new dependency.

### D-7 · Medium · Global eager asset loading regardless of the selected map
- **Files:** `main.ts initialize()` (`loadAll` of every weapon GLB, `TEXTURE_MANIFEST`, every zombie GLB), `MusicManager.preload()` (every non-`lazy` track, `preload='auto'`), `vite.config.ts` (runtime caching with `maxEntries` 48/24/16).
- **Evidence:** [C/M] Audio on disk is 18 MB. `station33_theme.mp3` (4.5 MB) and the nuclear and evacuation tracks are requested for every session. The 3.5 MB of Mystery Box JPGs load at boot.
- **Impact:** Each map's music, ending audio and props add to every session's network cost, which matters on Android mobile data.
- **Recommendation:** Declare per-map assets on `ZombieMapDefinition` (music track, ending audio, extra textures/GLBs) and load them in `startGame` behind the map loading screen. Mark map themes `lazy`. Review the Workbox `maxEntries` once more maps exist.

### D-8 · Medium · Uncompressed, code-baked textures; no texture budget per tier
- **Files:** `ProceduralSurface.bake` (RGBA8 color/normal/roughness/emissive), `DeviceProfile.anisotropyLimit` (the only texture-quality knob).
- **Evidence:** [M] Estimated uploaded texture memory (RGBA + mips): mansion ~24.5 MB, Station 33 ~38.4 MB, including one 1024×1920 and one 1950×306 texture. It doesn't change with the quality tier.
- **Impact:** GPU texture memory grows linearly with surface variety. Low-tier Android gets the same resolution as high-end desktop.
- **Recommendation:** Let `bake()` take a per-tier size (for example, halve on `low`), and cap distinct surfaces per map. KTX2/Basis would require new dependencies and an asset pipeline, so defer it unless authored textures are introduced.

### D-9 · Medium · Transparent and double-sided materials
- **Evidence:** [M] Transparent drawables: mansion 92–112, Station 33 99–117 (more on high). [C] 31 `transparent: true` and 16 `DoubleSide` usages under `src/zombies/maps`.
- **Impact:** Stained-glass windows, light shafts, dust and incense in a cathedral invite heavy overdraw on mobile fill-rate.
- **Recommendation:** Give a La Seu style guide (like `STATION_33.md`) a transparency budget. Prefer additive billboards from `BillboardLayer`, and cull transparent volumes by sector.

### D-10 · Low · Misleading shadow configuration
- **Files:** `Game.ts:146-148`, `prepare()` comment ("so the shadow maps exist"), `castShadow = true` on `WindowBarrierView`, `MysteryBoxView`, doors.
- **Evidence:** [C] No light casts shadows. [M] 185–327 meshes are flagged `castShadow` on high.
- **Impact:** None at runtime today, but it misleads future map authors. Enabling one shadow-casting light in a large outdoor courtyard would render every flagged mesh into the shadow map.
- **Recommendation:** Document the "no dynamic shadows" decision in `DECISIONS.md`, or add a tiered shadow budget before La Seu's courtyards use a sun.

### D-11 · Low · Map-specific visibility logic isn't reusable
- `updatePointLightBudget` (distance-ranked) and `Station33Lighting` (room-ranked) implement the same budget twice, and `classifyFloorMeshes` lives inside the mansion arena. These should move to `maps/shared/` as part of D-1 rather than being copied a third time.

### D-12 · Low · Co-op scope
- **Files:** `COOP_ZOMBIE_MAP_ID`, `CoopHostMode.ts:61` (15 Hz full state), `Protocol.ts` (`zombies: ZombieNetState[]`).
- Zombie count is capped at 24, so snapshot size doesn't depend on map size [C]. Co-op is pinned to Burned Mansion and doesn't negotiate maps, so a co-op La Seu would also need map negotiation in the protocol. That isn't a scalability risk for single player.

### Zombie, combat and effects cost (no finding above Low)
- Zombies are hard-capped (`MAX_ALIVE = 24`, `MAX_ACTIVE_BRUTES = 2`). Each zombie is a skinned clone with its own mixer and cloned materials, which costs about 24 × submeshes in draw calls and is independent of the map [C].
- Hit detection uses bone-parented hitboxes, with no extra skinning work [C].
- Decals and effects are ring-buffer pools (bullet holes 96, blood 1024 instanced with a 45 s lifetime), so prolonged sessions stay bounded [C].
- Environment size affects zombie cost only through navigation (D-2) and collision (D-6).

---

## E. Performance Baseline

### Measured in this audit [M]
Measured headlessly in Node 24 with Vitest (`--expose-gc`), building each registered arena with a real `DeviceProfile` per tier. Draw objects are drawables (mesh, instanced, points, sprites); "rendered" means visible and on layer 0 at the player spawn, before frustum culling.

| Metric | Burned Mansion (low / med / high) | Station 33 (low / med / high) |
| --- | --- | --- |
| Arena build, cold / warm | 802 / ~130 ms | 726 / ~190 ms |
| `arena.update()` per frame | 0.008–0.019 ms | 0.010–0.012 ms |
| `refreshColliders + refreshSpawnPoints` | 0.3–0.6 ms | 0.4–0.5 ms |
| Drawables total / rendered at spawn | 619–639 / 390–395 | 905–923 / 787–790 |
| Triangles total / rendered at spawn | 81.5 k / 53.4 k | 171–179 k / 160–168 k |
| Instanced meshes (instances) | 4 (675) | 0 |
| Unique geometries / materials / textures | 494 / 172–192 / 84 | 758 / 208–226 / 82 |
| Geometry buffers | 5.4 MB | 14.4–15.1 MB |
| Texture estimate (RGBA + mips) | 24.5 MB | 38.4 MB |
| Point lights declared / visible | 16–18 / 3–6 | 35 / 3–6 |
| Colliders / wall boxes | 90 / 76 | 272 / 191 |
| Navigation floors (extent) | 32×45 m, 20×11 m | 47×103 m, 24×36 m |
| Retained ArrayBuffers after discard | 21.6 MB | 46.9 MB cumulative |

Other measurements:
- Bundle: `vite build` gives 1,989.9 kB JS (595.3 kB gzip), 122.7 kB CSS, PWA precache of 13 entries (2,121 KiB).
- Static assets: audio 18 MB, menu PNGs 3.9 MB, Mystery Box textures 3.5 MB, zombies 1.2 MB, player 316 kB, weapons 228 kB.
- Test suite: 183 files / 1,993 tests pass.

### Not measured, and why
FPS (average and 1 % low), frame-time spikes, GPU time, draw calls under real culling, GPU memory, Android figures, load time in a browser, and heap during repeated menu round-trips. These require a real WebGL context and devices. Project rules reserve browser validation for the user (`AGENTS.md`), and no device was available.

### Reproducible procedure for the missing numbers
1. Run `npm run dev` and open `/?debug&map=station-33` (also `burned-mansion`). The `#debug-stats` overlay (`Game.updateDebug`) shows FPS, resolution scale, `renderer.info` calls, triangles, geometries and textures.
2. For each map and tier (Settings → quality): record 60 s idle at spawn, 60 s at round 10+ with 24 zombies, and 60 s of heavy fire with flame and energy weapons. Use Chrome DevTools Performance with CPU throttling ×4 for a mobile approximation and read the frame times for 1 % lows.
3. Memory: DevTools Memory → heap snapshot at the menu, after 5 cycles of match → menu, then compare. Use `chrome://gpu` / `about:tracing` (`gpu.memory`) for GPU memory.
4. Android: `npm run android:run`, then `chrome://inspect` remote DevTools on a mid-range device (e.g. 4–6 GB RAM) and a low-end one, repeating steps 2–3.
5. Optional: re-run this audit's headless probe (scene stats, nav scaling and retained heap). It is a scratch Vitest file kept outside the repo, and can be added under `tests/` as a budget test if wanted.

---

## F. Recommended Architecture for Large Environments

Keep `ZombieArena` as the single contract and add optional, map-agnostic capabilities in `maps/shared/`:

1. **Lazy map modules.** `ZombieMapDefinition` keeps static metadata plus `loadArena(): Promise<ZombieArenaFactory>` through dynamic `import()`. The map declares its own audio and assets, which load behind `#map-loading`.
2. **Time-sliced build.** Large arenas build as a list of zone steps, and the loader yields between steps so the main thread stays responsive.
3. **Sectors.** The map declares sectors (AABB per area: nave, aisles, chapels, cloister, Almudaina courtyard, palace halls) with visibility lists and portals. A shared `SectorVisibility` toggles mesh layers, the shared light budget prefers the current sector, and batches and instances are built per sector.
4. **Distance policy.** A per-map cull distance tied to fog. Fine ornament gets a hide-beyond-distance LOD, and silhouettes and skyline use the existing `HighlandCathedral`-style low-poly backdrop technique.
5. **Spatial index.** One XZ hash over `colliders` and `wallColliders`, rebuilt in `refreshColliders`, shared by zombie steering, ballistics pre-filtering and `GibWalls`.
6. **Hierarchical navigation.** The same pure grid per sector, plus a sector/portal graph. A* runs only across the sectors on the route, with an expansion budget, and rebuilds are limited to the affected floor.
7. **Resource ownership.** Map-scoped bake caches are released on dispose. Texture size follows the quality tier.

Is a sector-based design recommended? **Yes. Sector-based visibility and navigation, without streaming.** Full streaming (loading and unloading geometry at runtime) isn't justified: a procedural map of this kind fits in memory (current maps use 20–60 MB of geometry and textures), and frame cost is driven by what's drawn and searched, not by what's resident.

---

## G. Prioritized Roadmap

**Essential before building La Seu**
1. Shared sector visibility (generalise the mansion's floor partition) and a fog-tied cull distance. Fixes D-1 and D-11.
2. Navigation: expansion budget plus a sector-limited search and per-floor rebuild. Fixes D-2.
3. Lazy per-map module chunk and per-map asset/music loading. Fixes D-3 and D-7.
4. Collider spatial index. Fixes D-6.
5. Headless budget tests per map (drawables per sector, triangles, unique materials, nav cells, collider count), modelled on this audit's probe, so regressions show up in `npm run test`.
6. Manual baseline on desktop and on one mid-range and one low-end Android device (§E procedure), repeated after items 1–4.

**Strongly recommended during La Seu development**
7. Instanced and per-sector batches for repeated Gothic kits. Fixes D-5.
8. Map-scoped bake cache and tier-scaled texture sizes. Fixes D-4 and D-8.
9. Transparency and overdraw budget in a La Seu style guide. Fixes D-9.
10. Time-sliced arena build.

**Optional**
11. Decide on shadows: document "none", or add a single tiered sun shadow for courtyards. Fixes D-10.
12. Distance LOD for ornate tracery.
13. Co-op map negotiation, if La Seu should support co-op. Covers D-12.

---

## H. Final Verdict — **READY WITH OPTIMIZATIONS**

**Ready:**
- The contract boundaries (`ZombieArena`, registry, mode separation) already isolate maps cleanly.
- Per-match teardown releases the WebGL context.
- Pooling caps zombie and effect cost independently of map size.
- Quality tiers, dynamic resolution and light budgets already exist and are sound.

**Not ready as-is:**
- Visibility management exists only for one map, and Station 33 already draws ~86 % of its objects from the spawn point.
- Pathfinding cost grows with floor area (16 ms per path at 200×150 m on desktop).
- Every map adds to the single bundle and builds synchronously.
- Baked textures accumulate per map across the session.

**Expected mobile impact if La Seu is built without these changes:** draw-call-bound frames in open views, path spikes during hordes, longer startup for every player and higher memory pressure on low-end WebViews [E]. Dynamic resolution won't recover CPU-bound frames.

The changes above are incremental, fit the existing contracts and need no new dependencies, and both existing maps and co-op keep working.
