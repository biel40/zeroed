import * as THREE from 'three';
import type { ArenaAmbience } from '../ZombieArena';

export function applySceneAmbience(scene: THREE.Scene, ambience: ArenaAmbience): void {
  scene.background = new THREE.Color(ambience.backgroundColor);
  scene.fog = new THREE.FogExp2(ambience.fog.color, ambience.fog.density);
}

export function createAmbienceHemisphereLight(ambience: ArenaAmbience, reducedEffects: boolean): THREE.HemisphereLight {
  const { skyColor, groundColor, intensity, reducedIntensity } = ambience.hemisphereLight;
  return new THREE.HemisphereLight(skyColor, groundColor, reducedEffects ? reducedIntensity : intensity);
}
