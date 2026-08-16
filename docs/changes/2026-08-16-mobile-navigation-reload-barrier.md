# Mobile, navigation, reload and barrier fixes

**Que**: mobile FIRE now repeats semi-automatic weapons at their configured RPM while held, without changing desktop fire modes. Tactical reloads use shorter per-weapon timings and preserve the action; empty reloads keep the longer magazine-plus-action choreography. Fully open barriers remain repairable. Zombie arenas now define per-floor navigation bounds so an out-of-bounds zombie is relocated as the same live instance and resumes pursuit.

**Por que**: held touch fire was still edge-triggered for semi-auto weapons, reloads did not distinguish a retained round from an empty weapon, `isDamaged` excluded zero-board barriers, and stuck recovery had no explicit out-of-bounds signal.

**Donde**: `src/player`, `src/core/Game.ts`, `src/weapons`, `src/zombies`, `src/modes/ZombiesMode.ts`, and focused tests for mobile fire, reload animation, barriers, zombie recovery and Burned Mansion routes.

**Aprendido**: device-specific repetition belongs in frame input rather than weapon definitions. Reload phases can share one fractional timeline while empty reload alone works the action. Player bounds cannot define zombie bounds in Shooting Range because valid entry spawns are outside the player enclosure. Burned Mansion's adjusted wall, door, prop, barricade and stair colliders passed focused route tests, including both stair edges, so no oversized fallback collider was added.