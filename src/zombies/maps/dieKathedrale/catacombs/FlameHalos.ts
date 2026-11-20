import * as THREE from 'three';
import { CATACOMB_FLAME_HALO } from '../../DieKathedraleCatacombsConfig';
import type { DieKathedraleLightSite } from '../../DieKathedraleConfig';
import { makeSoftSpot } from '../../shared/SoftSpotTexture';

/**
 * A faint additive glow on every flame site given, in place of a real light
 * per candle: the pooled lights only reach the nearest sites, and these keep
 * the others from reading as bare sparks in the dark. Static, one sprite per
 * site sharing a texture and one material per flame color; fog dims the far
 * ones with the room. Returns the group holding them.
 */
export function addFlameHalos(parent: THREE.Object3D, sites: ReadonlyArray<DieKathedraleLightSite>): THREE.Group {
  const group = new THREE.Group();
  group.name = 'die-kathedrale-catacomb-halos';
  const spot = makeSoftSpot(32);
  const materials = new Map<number, THREE.SpriteMaterial>();
  for (const site of sites) {
    let material = materials.get(site.color);
    if (!material) {
      material = new THREE.SpriteMaterial({
        name: 'die-kathedrale_flame_halo', map: spot, color: site.color, transparent: true,
        opacity: CATACOMB_FLAME_HALO.opacity, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      materials.set(site.color, material);
    }
    const halo = new THREE.Sprite(material);
    halo.name = `die-kathedrale-flame-halo:${site.id}`;
    halo.position.set(site.x, site.y, site.z);
    halo.scale.setScalar(site.distance * CATACOMB_FLAME_HALO.sizePerDistance);
    group.add(halo);
  }
  parent.add(group);
  return group;
}
