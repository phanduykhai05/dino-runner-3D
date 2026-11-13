import * as THREE from 'three';
import { dayCycleAt } from '../shared/day-cycle.js';

const palette = [
  [0, '#6689b4', '#e6b290'], [.08, '#84b8e1', '#e1ebec'], [.25, '#6fafe0', '#dcebf3'],
  [.42, '#a2bacd', '#e9cfad'], [.50, '#7d729b', '#efad79'], [.56, '#30384e', '#6e647f'],
  [.64, '#0b1427', '#242b41'], [.88, '#0b1427', '#242b41'], [.95, '#344567', '#6a657d'],
  [1, '#6689b4', '#e6b290'],
].map(([at, zenith, horizon]) => ({ at, zenith: new THREE.Color(zenith), horizon: new THREE.Color(horizon) }));

function glowTexture() {
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const radius = Math.hypot(x - 31.5, y - 31.5) / 31.5;
    const alpha = Math.pow(Math.max(0, 1 - radius), 2.4);
    pixels.set([255, 255, 255, Math.round(alpha * 255)], (y * 64 + x) * 4);
  }
  const texture = new THREE.DataTexture(pixels, 64, 64);
  texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
  return texture;
}

function moonTexture() {
  const pixels = new Uint8Array(128 * 64 * 4);
  const craters = [[21, 25, 10], [48, 38, 13], [79, 19, 9], [104, 39, 12], [62, 12, 6], [17, 49, 5], [91, 54, 6]];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
    let value = 205 + Math.sin(x * .42 + y * .71) * 5;
    for (const [cx, cy, radius] of craters) {
      const distance = Math.hypot(Math.min(Math.abs(x - cx), 128 - Math.abs(x - cx)), y - cy) / radius;
      value -= Math.max(0, 1 - distance * distance) * 42;
      value += Math.exp(-Math.pow((distance - 1) * 9, 2)) * 9;
    }
    pixels.set([value, value, value, 255], (y * 128 + x) * 4);
  }
  const texture = new THREE.DataTexture(pixels, 128, 64);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
  return texture;
}

export class Sky3D {
  constructor(scene) {
    this.scene = scene;
    this.sunDirection = new THREE.Vector3(); this.moonDirection = new THREE.Vector3();
    this.horizon = new THREE.Color(); this.zenith = new THREE.Color();
    this.sunColor = new THREE.Color(); this.white = new THREE.Color('#fff9e7'); this.orange = new THREE.Color('#ffb166');
    this.origin = new THREE.Vector3();
    this.material = new THREE.ShaderMaterial({
      uniforms: { uZenith: { value: this.zenith }, uHorizon: { value: this.horizon },
        uSun: { value: this.sunDirection }, uSunColor: { value: this.sunColor }, uGlow: { value: 1 } },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0); vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
          gl_Position.z = gl_Position.w;
        }`,
      fragmentShader: `
        uniform vec3 uZenith, uHorizon, uSun, uSunColor;
        uniform float uGlow;
        varying vec3 vWorld;
        void main() {
          vec3 direction = normalize(vWorld - cameraPosition);
          vec3 color = mix(uHorizon, uZenith, smoothstep(-.04, .72, direction.y));
          float halo = exp((dot(direction, uSun) - 1.0) * 55.0) * uGlow;
          color += uSunColor * halo * .22;
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 20), this.material);
    this.dome.frustumCulled = false; this.dome.renderOrder = -1000;
    scene.add(this.dome);
    const glow = glowTexture();
    this.sun = new THREE.Group();
    this.sunDisc = new THREE.Mesh(new THREE.SphereGeometry(1.8, 20, 16),
      new THREE.MeshBasicMaterial({ color: '#fff9e7', fog: false, toneMapped: false, depthWrite: false }));
    this.sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#ffcf86',
      transparent: true, opacity: .4, depthWrite: false, fog: false, toneMapped: false }));
    this.sunHalo.scale.set(18, 18, 1);
    this.sun.add(this.sunDisc, this.sunHalo); scene.add(this.sun);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(1.8, 24, 16),
      new THREE.MeshBasicMaterial({ color: '#c9d5e7', map: moonTexture(), fog: false, depthWrite: false }));
    scene.add(this.moon);
    const positions = [];
    let seed = 2761;
    const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
    for (let i = 0; i < 360; i++) {
      const y = .12 + random() * .88, angle = random() * Math.PI * 2, r = Math.sqrt(1 - y * y);
      positions.push(Math.cos(angle) * r * 125, y * 125, Math.sin(angle) * r * 125);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#e5edff', size: .4,
      map: glow, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false }));
    this.stars.renderOrder = -5; this.stars.frustumCulled = false; scene.add(this.stars);
  }

  update(seconds, camera) {
    const state = dayCycleAt(seconds);
    let next = 1;
    while (palette[next].at < state.phase) next++;
    const before = palette[next - 1], after = palette[next];
    const fraction = THREE.MathUtils.smoothstep(state.phase, before.at, after.at);
    this.zenith.copy(before.zenith).lerp(after.zenith, fraction);
    this.horizon.copy(before.horizon).lerp(after.horizon, fraction);
    this.sunDirection.set(...state.sunDirection); this.moonDirection.set(...state.moonDirection);
    this.sunColor.copy(this.white).lerp(this.orange, state.warmth);
    this.material.uniforms.uGlow.value = state.sunVisibility;
    this.origin.copy(camera?.position ?? this.dome.position);
    this.sun.position.copy(this.sunDirection).multiplyScalar(130).add(this.origin);
    this.moon.position.copy(this.moonDirection).multiplyScalar(125).add(this.origin);
    this.sun.visible = state.sunVisibility > .01;
    this.sunDisc.material.color.copy(this.sunColor);
    this.sunHalo.material.color.copy(this.sunColor); this.sunHalo.material.opacity = .4 * state.sunVisibility;
    this.sunHalo.scale.setScalar(16 + state.warmth * 8);
    this.moon.visible = state.moonVisibility > .01;
    this.moon.material.color.setRGB(.7, .8, 1).multiplyScalar(state.moonVisibility);
    this.stars.position.copy(this.origin); this.stars.material.opacity = state.starOpacity * .85;
    this.scene.background.copy(this.horizon); this.scene.fog.color.copy(this.horizon);
    return state;
  }
}
