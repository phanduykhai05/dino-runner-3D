import * as THREE from 'three';
import { laneX } from '../shared/race.js';
import { GROUND_START, SOIL_TILE_SIZE } from './terrain3d.js';

const SPACING = 58;
function noise(tile, lane, salt) {
  let seed = Math.imul(tile + 8192, 73856093) ^ Math.imul(lane + 1, 19349663) ^ Math.imul(salt, 83492791);
  seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  return ((seed ^ (seed >>> 16)) >>> 0) / 4294967296;
}

// Scenery only: puddles are never registered with obstacle/collision managers.
export class PuddleField {
  constructor(scene, length, soil) {
    this.length = length;
    this.rows = Math.ceil(length / SPACING) + 2;
    this.entries = [];
    this.matrix = new THREE.Matrix4(); this.quaternion = new THREE.Quaternion();
    this.axis = new THREE.Vector3(0, 1, 0); this.scale = new THREE.Vector3();
    this.position = new THREE.Vector3();
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(this.rows * 5), 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uSoil: { value: soil }, uTime: { value: 0 }, uScroll: { value: 0 },
        uRoadOffset: { value: new THREE.Vector2() },
        uZenith: { value: new THREE.Color('#84b8e1') }, uHorizon: { value: new THREE.Color('#e1ebec') },
        uSun: { value: new THREE.Vector3(0, 1, .5).normalize() },
        uSunColor: { value: new THREE.Color('#fff5de') }, uDaylight: { value: 1 },
        uGroundTint: { value: new THREE.Color('#ffffff') },
      },
      vertexShader: `
        attribute float aSeed;
        varying vec2 vUv;
        varying vec3 vWorld;
        varying float vSeed;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv; vSeed = aSeed;
          vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          vec4 mvPosition = viewMatrix * world;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform sampler2D uSoil;
        uniform float uTime, uScroll, uDaylight;
        uniform vec2 uRoadOffset;
        uniform vec3 uZenith, uHorizon, uSun, uSunColor, uGroundTint;
        varying vec2 vUv;
        varying vec3 vWorld;
        varying float vSeed;
        #include <fog_pars_fragment>
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float angle = atan(p.y, p.x);
          float outline = .78 + sin(angle * 3.0 + vSeed) * .08
            + sin(angle * 7.0 - vSeed * 1.3) * .045 + cos(angle * 11.0 + vSeed) * .025;
          float edge = length(p) - outline;
          if (edge > .025) discard;
          float shore = 1.0 - smoothstep(-.09, .025, edge);
          vec2 absolute = vec2(vWorld.x, vWorld.z + uScroll);
          vec2 soilUv = vec2(absolute.x / 8.0 + uRoadOffset.x, uRoadOffset.y - absolute.y / 8.0);
          vec3 bottom = texture2D(uSoil, soilUv).rgb * uGroundTint * (.36 + .22 * uDaylight);
          float waveX = sin(absolute.x * 5.2 + uTime * .9 + vSeed) * cos(absolute.y * 3.7 - uTime * .7);
          float waveZ = cos(absolute.y * 4.8 + uTime * .8 + vSeed) * sin(absolute.x * 3.1 + uTime * .5);
          vec3 normal = normalize(vec3(waveX * .028, 1.0, waveZ * .028));
          vec3 view = normalize(cameraPosition - vWorld);
          vec3 reflected = reflect(-view, normal);
          vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, .72, reflected.y));
          float clouds = smoothstep(.60, .92, sin(reflected.x * 18.0 + vSeed) * cos(reflected.z * 15.0));
          sky = mix(sky, vec3(.85,.88,.89), clouds * .14 * uDaylight);
          float fresnel = .12 + .82 * pow(1.0 - max(dot(view, normal), 0.0), 5.0);
          vec3 color = mix(bottom, sky * .85, fresnel);
          float glint = pow(max(dot(reflect(-uSun, normal), view), 0.0), 100.0);
          color += uSunColor * glint * uDaylight * .55;
          color += vec3(.025,.032,.032) * (waveX * waveZ + 1.0) * .35;
          float wetEdge = smoothstep(-.15, -.045, edge);
          color = mix(color, bottom * .85, wetEdge * .7);
          gl_FragColor = vec4(color, shore * mix(.85, .55, wetEdge));
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, toneMapped: false, fog: true,
    });
    this.mesh = new THREE.InstancedMesh(geometry, this.material, this.rows * 5);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }

  setRoad(lanes, width) {
    this.lanes = lanes;
    this.width = width;
    this.mesh.count = lanes * this.rows;
    this.material.uniforms.uRoadOffset.value.set(width / (SOIL_TILE_SIZE * 2), (GROUND_START + this.length) / SOIL_TILE_SIZE);
    this.update(0);
  }

  update(distance) {
    this.distance = distance;
    this.material.uniforms.uScroll.value = distance;
    this.entries = [];
    const firstTile = Math.floor((distance + GROUND_START) / SPACING);
    const seeds = this.mesh.geometry.getAttribute('aSeed');
    let index = 0;
    for (let row = 0; row < this.rows; row++) for (let i = 0; i < this.lanes; i++) {
      const tile = firstTile + row, lane = i + (5 - this.lanes) / 2;
      const width = 2.5 + noise(tile, lane, 1) * 1.7;
      const depth = 3.5 + noise(tile, lane, 2) * 3;
      const x = laneX(lane) + (noise(tile, lane, 3) - .5) * .7;
      const worldZ = tile * SPACING + 10 + noise(tile, lane, 4) * 35;
      const rotation = (noise(tile, lane, 5) - .5) * .35;
      const seed = noise(tile, lane, 6) * 30;
      this.position.set(x, .014, worldZ - distance);
      this.quaternion.setFromAxisAngle(this.axis, rotation); this.scale.set(width, 1, depth);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.mesh.setMatrixAt(index, this.matrix); seeds.setX(index, seed);
      this.entries.push({ tile, lane, x, worldZ, z: worldZ - distance, width, depth, rotation, seed });
      index++;
    }
    this.mesh.instanceMatrix.needsUpdate = true; seeds.needsUpdate = true;
  }
}
