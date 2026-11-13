import * as THREE from 'three';

export const SOIL_TILE_SIZE = 8;
export const GROUND_START = -80;

function randomSource(seed) {
  return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
}

function texture(data, width, height, color = false) {
  const map = new THREE.DataTexture(data, width, height);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 4;
  if (color) map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;
  return map;
}

export function createSoilTextures() {
  const size = 512, random = randomSource(97143);
  const soil = new Uint8Array(size * size * 4), dust = soil.slice(), bump = soil.slice();
  const layers = [8, 32, 128].map(n => ({ n, values: Float32Array.from({ length: n * n }, random) }));
  const smooth = t => t * t * (3 - 2 * t);
  function noise(x, y, { n, values }) {
    const px = x / size * n, py = y / size * n, ix = Math.floor(px), iy = Math.floor(py);
    const fx = smooth(px - ix), fy = smooth(py - iy);
    const a = values[iy * n + ix], b = values[iy * n + (ix + 1) % n];
    const c = values[(iy + 1) % n * n + ix], d = values[(iy + 1) % n * n + (ix + 1) % n];
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const grain = random(), coarse = noise(x, y, layers[0]), fine = noise(x, y, layers[2]);
    const value = coarse * .55 + noise(x, y, layers[1]) * .3 + fine * .15;
    const mineral = grain > .985 ? 27 : grain < .012 ? -26 : 0;
    const shade = (value - .5) * 45 + (grain - .5) * 13 + mineral;
    const at = (y * size + x) * 4;
    soil.set([154 + shade, 133 + shade * .89, 101 + shade * .72, 255], at);
    dust.set([179 + shade * .72, 158 + shade * .65, 123 + shade * .53, 255], at);
    const elevation = 103 + (fine - .5) * 73 + (grain - .5) * 44 + mineral;
    bump.set([elevation, elevation, elevation, 255], at);
  }
  return { soil: texture(soil, size, size, true), dust: texture(dust, size, size, true), bump: texture(bump, size, size) };
}

export function createRoadEdge(width) {
  const w = 512, h = 128, pixels = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const side = Math.min(x / (w - 1), 1 - x / (w - 1)) * width;
    const ripple = Math.sin(y / h * Math.PI * 6) * .07 + Math.cos(y / h * Math.PI * 14) * .035;
    const opacity = THREE.MathUtils.smoothstep(side, .04 + ripple, .65 + ripple)
      * THREE.MathUtils.smoothstep(side, 0, .12);
    pixels.set([255, Math.round(opacity * 255), 255, 255], (y * w + x) * 4);
  }
  const map = texture(pixels, w, h);
  map.wrapS = THREE.ClampToEdgeWrapping;
  return map;
}

export function createWornPathMask() {
  const w = 256, h = 256, pixels = new Uint8Array(w * h * 4), random = randomSource(483);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const bend = Math.sin(y / h * Math.PI * 2) * .07 + Math.sin(y / h * Math.PI * 6) * .025;
    const across = (x / (w - 1) - .5 - bend) * 2;
    const wear = Math.exp(-Math.pow(across / .48, 4)) * (.35 + random() * .18);
    pixels.set([255, Math.round(wear * 255), 255, 255], (y * w + x) * 4);
  }
  const map = texture(pixels, w, h);
  map.wrapS = THREE.ClampToEdgeWrapping;
  return map;
}

export function createRockGeometry(variant) {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const palette = ['#a09581', '#897e6a', '#b5a38a', '#8f8c82', '#a5987c', '#7f7769'];
  const base = new THREE.Color(palette[variant % palette.length]);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const shape = 1 + Math.sin(x * 4.1 + z * 3.7 + variant) * .105 + Math.cos(y * 5.3 - x * 2.2 + variant) * .075;
    position.setXYZ(i, x * shape, (y * shape + 1.2) * .8, z * shape);
    const vein = Math.sin(x * 15 + y * 11 + z * 7 + variant) * .035;
    color.copy(base).multiplyScalar(.94 + vein + (y + 1) * .065);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingBox();
  geometry.translate(0, -geometry.boundingBox.min.y, 0);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export class RockField {
  constructor(scene, width, length, bump) {
    this.length = length;
    this.random = randomSource(43971);
    this.matrix = new THREE.Matrix4();
    this.quaternion = new THREE.Quaternion();
    this.axis = new THREE.Vector3(0, 1, 0);
    this.meshes = [];
    this.stones = [];
    for (let variant = 0; variant < 6; variant++) {
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96, metalness: 0,
        bumpMap: bump, bumpScale: .008 });
      const mesh = new THREE.InstancedMesh(createRockGeometry(variant), material, 136);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      scene.add(mesh); this.meshes.push(mesh);
    }
    this.setWidth(width);
  }

  place(stone, initial) {
    const random = this.random;
    if (stone.shoulder) {
      stone.position.x = (random() < .5 ? -1 : 1) * (this.width / 2 + .6 + random() * 6.5);
    } else {
      stone.position.x = (random() - .5) * (this.width - .65);
    }
    stone.position.y = stone.shoulder ? -.07 : -.012;
    stone.position.z = initial ? GROUND_START + random() * this.length : stone.position.z;
  }

  setWidth(width) {
    this.width = width;
    this.stones = [];
    const smallCount = width > 20 ? 128 : 64;
    for (let variant = 0; variant < this.meshes.length; variant++) {
      const mesh = this.meshes[variant];
      mesh.count = smallCount + 8;
      for (let index = 0; index < mesh.count; index++) {
        const shoulder = index >= smallCount, random = this.random;
        const radius = shoulder ? .18 + random() * .28 : .045 + random() * .075;
        const stone = { variant, index, shoulder, position: new THREE.Vector3(),
          rotation: random() * Math.PI * 2,
          scale: new THREE.Vector3(radius * (.8 + random() * .6), radius * (shoulder ? .65 : .30 + random() * .20), radius * (.8 + random() * .7)) };
        this.place(stone, true); this.stones.push(stone);
      }
    }
    this.update(0);
  }

  update(distance) {
    for (const stone of this.stones) {
      stone.position.z -= distance;
      if (stone.position.z < GROUND_START) {
        stone.position.z = GROUND_START + ((stone.position.z - GROUND_START) % this.length + this.length) % this.length;
        this.place(stone, false);
      }
      this.quaternion.setFromAxisAngle(this.axis, stone.rotation);
      this.matrix.compose(stone.position, this.quaternion, stone.scale);
      this.meshes[stone.variant].setMatrixAt(stone.index, this.matrix);
    }
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }

  setNight(night) {
    for (const mesh of this.meshes) mesh.material.color.set(night ? '#a2b1c4' : '#ffffff');
  }
}
