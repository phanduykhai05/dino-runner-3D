import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONTAINER_SIZE } from '../shared/race.js';

const templates = new Map();
const colors = ['#9a4938', '#3d6d88', '#68734e', '#b18a43'];

function paintTexture(variant) {
  const size = 256, pixels = new Uint8Array(size * size * 4);
  const hex = colors[variant].slice(1);
  const rgb = [0, 2, 4].map(at => parseInt(hex.slice(at, at + 2), 16));
  let seed = 7823 + variant * 441;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    seed = Math.imul(seed, 1664525) + 1013904223 | 0;
    const grain = (seed >>> 0) / 4294967296;
    const drip = Math.sin(x * .17 + variant) * Math.cos(x * .43 - variant) * Math.sin(y * .045 + x * .02);
    const edge = Math.min(y, size - 1 - y) / size;
    const rust = drip > .65 || (edge < .05 && grain > .48);
    const shade = .86 + grain * .18;
    pixels.set([...(rust ? [94, 58, 36] : rgb).map(v => Math.round(v * shade)), 255], (y * size + x) * 4);
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

function labelTexture(variant) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d8d4bf'; ctx.fillRect(0, 0, 512, 192);
  ctx.fillStyle = '#303a34'; ctx.font = '700 59px monospace'; ctx.fillText('DINO CARGO', 22, 72);
  ctx.font = '28px monospace'; ctx.fillText(`DK ${2048 + variant * 37}   22G1`, 24, 120);
  ctx.font = '19px monospace'; ctx.fillText('MAX GROSS  30,480 KG', 24, 157);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function stripeTexture() {
  const pixels = new Uint8Array(64 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
    pixels.set((x + y) % 24 < 12 ? [205, 166, 75, 255] : [44, 46, 40, 255], (y * 64 + x) * 4);
  }
  const texture = new THREE.DataTexture(pixels, 64, 32); texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
  return texture;
}

function buildContainer(variant) {
  const { width: w, height: h, depth: d } = CONTAINER_SIZE;
  const group = new THREE.Group(), painted = [], frame = [], hardware = [];
  const box = (list, width, height, depth, x, y, z) => {
    const geometry = new THREE.BoxGeometry(width, height, depth); geometry.translate(x, y, z); list.push(geometry);
  };
  const paint = new THREE.MeshStandardMaterial({ map: paintTexture(variant), roughness: .83, metalness: .28 });
  const steel = new THREE.MeshStandardMaterial({ color: '#4a4f48', roughness: .72, metalness: .6 });
  const fittings = new THREE.MeshStandardMaterial({ color: '#a5a48f', roughness: .52, metalness: .72 });
  box(painted, w - .10, h - .10, d - .10, 0, h / 2, 0);
  for (let z = -d / 2 + .35; z < d / 2 - .2; z += .38) {
    for (const sign of [-1, 1]) box(painted, .075, h - .32, .09, sign * (w / 2 - .02), h / 2, z);
    box(painted, w - .3, .045, .10, 0, h - .035, z);
  }
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      box(frame, .16, h, .16, x * (w / 2 - .08), h / 2, z * (d / 2 - .08));
      for (const y of [.13, h - .13]) box(hardware, .24, .26, .24, x * (w / 2 - .12), y, z * (d / 2 - .12));
    }
    for (const y of [.08, h - .08]) box(frame, .16, .16, d, x * (w / 2 - .08), y, 0);
  }
  for (const z of [-d / 2 + .08, d / 2 - .08]) for (const y of [.08, h - .08]) box(frame, w, .16, .16, 0, y, z);
  for (const x of [-w / 4, w / 4]) {
    box(painted, w / 2 - .13, h - .34, .08, x, h / 2, -d / 2 - .015);
    for (const offset of [-.48, 0, .48]) box(painted, .06, h - .52, .07, x + offset, h / 2, -d / 2 - .09);
    for (const offset of [-.55, .55]) {
      const rod = new THREE.CylinderGeometry(.034, .034, h - .65, 8);
      rod.translate(x + offset, h / 2, -d / 2 - .15); hardware.push(rod);
      for (const y of [.6, 1.8, h - .6]) box(hardware, .17, .13, .12, x + offset, y, -d / 2 - .15);
    }
    box(hardware, .32, .055, .09, x, 1.55, -d / 2 - .21);
  }
  for (const [geometries, material] of [[painted, paint], [frame, steel], [hardware, fittings]]) {
    const merged = mergeGeometries(geometries); geometries.forEach(geometry => geometry.dispose());
    const mesh = new THREE.Mesh(merged, material); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  }
  const label = new THREE.Mesh(new THREE.PlaneGeometry(2.35, .88),
    new THREE.MeshStandardMaterial({ map: labelTexture(variant), color: '#efead7', roughness: .95 }));
  label.rotation.y = Math.PI; label.position.set(0, h - 1.0, -d / 2 - .11); group.add(label);
  const sideLabel = label.clone(); sideLabel.rotation.y = Math.PI / 2;
  sideLabel.position.set(w / 2 + .025, h - 1.05, 0); group.add(sideLabel);
  const hazard = new THREE.Mesh(new THREE.PlaneGeometry(w - .6, .22),
    new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: .9 }));
  hazard.rotation.y = Math.PI; hazard.position.set(0, .39, -d / 2 - .12); group.add(hazard);
  return group;
}

export function createContainer(variant = 0) {
  const key = ((variant % colors.length) + colors.length) % colors.length;
  if (!templates.has(key)) templates.set(key, buildContainer(key));
  return templates.get(key).clone(true);
}
