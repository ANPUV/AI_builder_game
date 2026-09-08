import * as THREE from 'three';
import type { BuildingKind } from '../data/buildings';

export const footprints: Record<BuildingKind, { width: number; depth: number }> = {
  source: { width: 1.8, depth: 1.4 },
  factory: { width: 2.5, depth: 1.9 },
  capacity: { width: 2.3, depth: 2.1 },
  contract: { width: 1.9, depth: 1.8 },
  // An agent is a desk, not a plant: it makes nothing and takes up little room.
  agent: { width: 1.6, depth: 1.6 },
};

/** A new floor at $100, $300, $700, … of actual lifetime payouts; capped for readability. */
export const contractFloors = (revenue: number) =>
  2 + Math.min(10, Math.floor(Math.log2(1 + Math.max(0, revenue) / 100)));

export function createBuildingModel(kind: BuildingKind, color: string, floors: number) {
  const root = new THREE.Group();
  const { width, depth } = footprints[kind];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, tint: string) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: tint, roughness: .5, metalness: .25 }));
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh;
  };
  box(width, .18, depth, 0, .09, 0, '#526475');
  let height = 1.25;
  if (kind === 'source') {
    // Small public-facing storefront, striped awning, glazing and entrance.
    box(1.45, .8, 1.02, 0, .58, 0, '#e4d5bd');
    box(1.6, .16, 1.16, 0, 1.05, 0, color);
    box(1.16, .44, .04, -.05, .55, .53, '#558899');
    box(.24, .65, .06, .45, .5, .54, '#203747');
    for (let i = 0; i < 8; i++) box(.19, .08, .35, -.665 + i * .19, .89, .62, i % 2 ? '#f6eedb' : color);
    box(.65, .22, .08, 0, 1.25, .3, color);
    height = 1.36;
  } else if (kind === 'factory') {
    // Broad production hall with loading bays and a sawtooth roof.
    box(2.14, 1, 1.5, 0, .68, 0, color);
    for (let i = 0; i < 3; i++) {
      box(.48, .65, .045, -.67 + i * .67, .51, .77, '#263b49');
      for (let j = 0; j < 4; j++) box(.42, .035, .025, -.67 + i * .67, .3 + j * .14, .8, '#7e939e');
      const roof = box(.73, .14, 1.64, -.72 + i * .72, 1.26, 0, '#afc0c7'); roof.rotation.z = -.2;
    }
    box(.23, .85, .23, .81, 1.62, -.48, '#596b7c');
    box(.31, .08, .31, .81, 2.06, -.48, '#b9c9d0');
    height = 2.1;
  } else if (kind === 'capacity') {
    // A campus of three server racks, cooling units and antenna.
    for (let i = 0; i < 3; i++) {
      const x = -.65 + i * .65, h = 1.45 + i * .22;
      box(.53, h, 1.28, x, .18 + h / 2, 0, '#263847');
      box(.59, .09, 1.36, x, h + .23, 0, color);
      for (let j = 0; j < 6; j++) {
        box(.4, .1, .035, x, .4 + j * .2, .66, '#6c889a');
        box(.06, .045, .04, x + .12, .4 + j * .2, .69, '#72efd2');
      }
    }
    box(.08, .8, .08, .7, 2.45, -.3, '#d1e1e8');
    box(.4, .06, .06, .7, 2.7, -.3, color);
    height = 2.85;
  } else {
    // Floor-by-floor office tower: revenue buys height rather than stretching windows.
    box(1.64, .36, 1.5, 0, .36, 0, '#d7dfe2');
    box(.42, .3, .035, 0, .35, .77, '#477a91');
    for (let f = 0; f < floors; f++) {
      const y = .56 + f * .35;
      box(1.36, .3, 1.24, 0, y + .15, 0, color);
      box(1.49, .05, 1.37, 0, y + .32, 0, '#c1d0d8');
      for (let i = 0; i < 4; i++) {
        box(.22, .19, .025, -.48 + i * .32, y + .16, .635, '#82c2d1');
        box(.025, .19, .22, .695, y + .16, -.46 + i * .3, '#6ca7bd');
      }
    }
    height = .56 + floors * .35;
    box(1.58, .12, 1.43, 0, height + .05, 0, '#e0e7e8');
    box(.5, .18, .42, 0, height + .19, -.2, '#687e8d');
    height += .3;
  }
  const light = new THREE.MeshStandardMaterial({ color: '#6becc2', emissive: '#6becc2', emissiveIntensity: .7 });
  const led = new THREE.Mesh(new THREE.BoxGeometry(.14, .1, .04), light);
  led.position.set(width / 2 - .15, .2, depth / 2 + .015); root.add(led);
  const ring = new THREE.Mesh(new THREE.BoxGeometry(width + .12, .035, depth + .12), new THREE.MeshBasicMaterial({ color: '#71f6d2' }));
  ring.position.y = .025; root.add(ring);
  return { root, light, ring, height };
}
