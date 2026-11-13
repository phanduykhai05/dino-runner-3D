import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Geometry, ribs and spines use the same dimensions in every online lane.
export function createCactusGeometry(large, count) {
  const surfaces = [], spines = [], areoles = [];
  const height = large ? 1.85 : 1.35;
  const radius = large ? 0.25 : 0.2;
  const spacing = large ? 0.98 : 0.8;
  const base = new THREE.Color('#4c713e');
  const tip = new THREE.Color('#91a45f');
  const color = new THREE.Color();
  const ribs = 10, sides = 40, rings = 32;

  function stem(curve, width, offset, seed) {
    const length = curve.getLength();
    const positions = [], colors = [], uvs = [], indices = [];
    const center = new THREE.Vector3(), radial = new THREE.Vector3();
    const tangent = new THREE.Vector3(), normal = new THREE.Vector3(), binormal = new THREE.Vector3();
    function frameAt(t) {
      curve.getTangentAt(t, tangent);
      normal.set(tangent.y, -tangent.x, 0).normalize();
      binormal.crossVectors(tangent, normal).normalize();
    }
    function section(t) {
      const cap = Math.max(0, (t - (1 - width / length)) / (width / length));
      return Math.sqrt(Math.max(0.00001, 1 - cap * cap)) * (0.94 + 0.06 * Math.sin(t * Math.PI));
    }
    for (let row = 0; row <= rings; row++) {
      const fraction = row / rings;
      const capStart = Math.max(0.5, 1 - width / length);
      const t = fraction <= 0.75 ? fraction / 0.75 * capStart
        : capStart + Math.sin((fraction - 0.75) * Math.PI * 2) * (1 - capStart);
      frameAt(t);
      curve.getPointAt(t, center); center.x += offset;
      for (let side = 0; side <= sides; side++) {
        const angle = side / sides * Math.PI * 2;
        const ridge = Math.cos(angle * ribs);
        const r = width * section(t) * (0.92 + 0.08 * ridge);
        radial.copy(normal).multiplyScalar(Math.cos(angle)).addScaledVector(binormal, Math.sin(angle));
        positions.push(center.x + radial.x * r, center.y + radial.y * r, center.z + radial.z * r);
        const grain = Math.sin(row * 2.7 + side * 1.8 + seed) * 0.014;
        color.copy(base).lerp(tip, t * t * 0.42 + (ridge + 1) * 0.07 + grain);
        color.multiplyScalar(0.83 + Math.min(1, center.y / 0.28) * 0.17);
        colors.push(color.r, color.g, color.b);
        uvs.push(side / sides, t * length / (width * Math.PI * 2));
        if (row < rings && side < sides) {
          const a = row * (sides + 1) + side, b = a + sides + 1;
          indices.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    surfaces.push(geometry);

    const rows = Math.max(3, Math.floor(length / 0.13));
    for (let row = 1; row < rows; row++) {
      const t = row / rows * 0.93;
      frameAt(t);
      curve.getPointAt(t, center); center.x += offset;
      for (let rib = 0; rib < ribs; rib++) {
        const angle = rib / ribs * Math.PI * 2;
        radial.copy(normal).multiplyScalar(Math.cos(angle)).addScaledVector(binormal, Math.sin(angle));
        const root = center.clone().addScaledVector(radial, width * section(t) + 0.003);
        areoles.push(root.x, root.y, root.z);
        for (let needle = 0; needle < 3; needle++) {
          const spread = (needle - 1) * 0.018;
          const end = root.clone().addScaledVector(radial, 0.025 + (needle === 1 ? 0.018 : 0));
          end.addScaledVector(tangent, spread + 0.008);
          spines.push(root.x, root.y, root.z, end.x, end.y, end.z);
        }
      }
    }
  }

  for (let i = 0; i < count; i++) {
    const scale = i === 1 ? 1.08 : i === 2 ? 0.92 : 1;
    const h = height * scale, offset = (i - (count - 1) / 2) * spacing;
    stem(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.012, h * 0.36, 0),
      new THREE.Vector3(0.018, h * 0.73, 0), new THREE.Vector3(0.005, h, 0),
    ]), radius, offset, i);
    for (const sign of [-1, 1]) {
      const reach = large ? 0.59 : 0.44;
      const shoulder = sign < 0 ? 0.49 : 0.36;
      const top = sign < 0 ? 0.90 : 0.72;
      stem(new THREE.CatmullRomCurve3([
        new THREE.Vector3(sign * radius * 0.45, h * shoulder, 0),
        new THREE.Vector3(sign * reach * 0.72, h * shoulder, 0),
        new THREE.Vector3(sign * reach, h * (shoulder + 0.11), 0),
        new THREE.Vector3(sign * reach, h * top, 0),
      ], false, 'centripetal'), radius * 0.60, offset, i + sign);
    }
  }
  const geometry = mergeGeometries(surfaces);
  surfaces.forEach(surface => surface.dispose());
  const needles = new THREE.BufferGeometry();
  needles.setAttribute('position', new THREE.Float32BufferAttribute(spines, 3));
  const spots = new THREE.BufferGeometry();
  spots.setAttribute('position', new THREE.Float32BufferAttribute(areoles, 3));
  return { geometry, needles, spots };
}

let areoleTexture;
let skinBumpTexture;
const cactusShapes = new Map();
export function createCactus(large, count) {
  // Six shared shapes avoid rebuilding the same cactus in all five lanes.
  const key = `${large}/${count}`;
  if (!cactusShapes.has(key)) cactusShapes.set(key, createCactusGeometry(large, count));
  const { geometry, needles, spots } = cactusShapes.get(key);
  const group = new THREE.Group();
  if (!skinBumpTexture) {
    const data = new Uint8Array(64 * 64 * 4);
    let seed = 518;
    for (let i = 0; i < 64 * 64; i++) {
      seed = Math.imul(seed, 1664525) + 1013904223 | 0;
      const height = 100 + ((seed >>> 24) & 63);
      data.set([height, height, height, 255], i * 4);
    }
    skinBumpTexture = new THREE.DataTexture(data, 64, 64);
    skinBumpTexture.wrapS = skinBumpTexture.wrapT = THREE.RepeatWrapping;
    skinBumpTexture.magFilter = THREE.LinearFilter;
    skinBumpTexture.minFilter = THREE.LinearMipmapLinearFilter;
    skinBumpTexture.generateMipmaps = true;
    skinBumpTexture.needsUpdate = true;
  }
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.91, metalness: 0,
    bumpMap: skinBumpTexture, bumpScale: 0.006 });
  const skin = new THREE.Mesh(geometry, material);
  skin.castShadow = true; skin.receiveShadow = true;
  const thorns = new THREE.LineSegments(needles, new THREE.LineBasicMaterial({ color: '#b2a77b', transparent: true, opacity: 0.55 }));
  if (!areoleTexture) {
    const data = new Uint8Array(16 * 16 * 4);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const at = (y * 16 + x) * 4;
      data.set([255, 255, 255, Math.round(Math.max(0, 1 - Math.hypot(x - 7.5, y - 7.5) / 7.5) * 255)], at);
    }
    areoleTexture = new THREE.DataTexture(data, 16, 16);
    areoleTexture.needsUpdate = true;
  }
  const dots = new THREE.Points(spots, new THREE.PointsMaterial({ color: '#aca574', size: 0.014, map: areoleTexture, alphaTest: 0.25 }));
  group.add(skin, thorns, dots);
  return group;
}
