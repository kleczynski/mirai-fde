import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

function createEnvironment(renderer: THREE.WebGLRenderer) {
  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, .045, .1, 100);
  room.dispose();
  pmrem.dispose();
  return environment;
}

export function createMaterials(renderer: THREE.WebGLRenderer) {
  let environment = createEnvironment(renderer);
  const surface = new THREE.MeshPhysicalMaterial({
    color: '#9bb3a7', metalness: .6, roughness: .27,
    clearcoat: .7, clearcoatRoughness: .22,
    anisotropy: .45, anisotropyRotation: Math.PI / 2,
    sheen: .15, sheenColor: new THREE.Color('#e4e9d9'), sheenRoughness: .65,
    side: THREE.FrontSide, vertexColors: true, envMapIntensity: 1.15,
  });
  const reverse = surface.clone();
  reverse.side = THREE.BackSide; reverse.color.set('#668f82'); reverse.metalness = .48; reverse.roughness = .32;
  const hem = new THREE.MeshStandardMaterial({ color: '#d0d7bc', metalness: .78, roughness: .24, side: THREE.DoubleSide });
  const edge = new THREE.LineBasicMaterial({ color: '#e4ecdd', transparent: true, opacity: .7 });
  const seam = new THREE.LineBasicMaterial({ color: '#405f54', transparent: true, opacity: .2 });
  const trace = new THREE.LineBasicMaterial({ color: '#c7d9c8', transparent: true, opacity: .18 });
  const orbit = new THREE.LineBasicMaterial({ color: '#93aa99', transparent: true, opacity: .2, depthWrite: false });
  return {
    surface, reverse, hem, edge, seam, trace, orbit,
    get environment() { return environment; },
    restoreEnvironment() {
      // Render-target pixels do not survive WebGL context loss.
      environment.dispose();
      environment = createEnvironment(renderer);
      return environment;
    },
    dispose() { surface.dispose(); reverse.dispose(); hem.dispose(); seam.dispose(); edge.dispose(); trace.dispose(); orbit.dispose(); environment.dispose(); },
  };
}
