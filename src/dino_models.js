import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const models = new Map();
const anatomy = {
  't-rex': { length: 6.5, offset: -0.4, head: [0, 2.05, 1.12], neck: 0.85, headFloor: 1.45, tail: [0, 1.6, -1.15], hipY: 1.55, kneeY: 0.73, width: 0.55, backZ: -0.35, crouchDepth: 0.3, headBow: 0.27 },
  triceratops: { length: 5.8, offset: -0.25, head: [0, 1.55, 1.05], neck: 0.8, headFloor: 0.75, tail: [0, 1.05, -1.5], hipY: 1.3, kneeY: 0.62, width: 0.64, frontZ: 0.9, backZ: -1.1, crouchDepth: 0.18, headBow: 0.14 },
  brachiosaurus: { length: 5, offset: -0.35, head: [0, 1.7, 0.65], neck: 0.7, headFloor: 1.6, tail: [0, 0.9, -1.2], hipY: 1.2, kneeY: 0.55, width: 0.4, frontZ: 0.55, backZ: -0.8, crouchDepth: 0.16, headBow: 0.55 },
  stegosaurus: { length: 6.1, offset: -0.3, head: [0, 1.35, 1.75], neck: 1.5, headFloor: 0.9, tail: [0, 1.1, -1.45], hipY: 1.22, kneeY: 0.57, width: 0.47, frontZ: 1.1, backZ: -0.55, crouchDepth: 0.18, headBow: 0.16 },
};

export async function loadDinosaurModels(onProgress = () => {}) {
  const loader = new GLTFLoader();
  let completed = 0;
  await Promise.all(Object.keys(anatomy).map(async name => {
    if (!models.has(name)) {
      const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`);
      let source;
      gltf.scene.traverse(object => { if (object.isMesh) source = object; });
      if (!source) throw new Error(`Missing dinosaur mesh: ${name}`);
      models.set(name, source);
    }
    onProgress(++completed, Object.keys(anatomy).length);
  }));
}

// Shared by the retro scenery, which still uses outlined blocks.
export function createBoxMesh(w, h, d, material, castShadow = true, outlineColor = 0x141517) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = castShadow;
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: outlineColor })));
  return mesh;
}

const smooth = (low, high, value) => THREE.MathUtils.smoothstep(value, low, high);

function buildDinosaur(name, forest = false) {
  const source = models.get(name);
  if (!source) throw new Error('Dinosaur models must finish loading before starting the game.');
  const shape = anatomy[name];
  const geometry = source.geometry.clone();
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const scale = shape.length / (bounds.max.z - bounds.min.z);
  geometry.translate(0, -bounds.min.y, 0);
  geometry.scale(scale, scale, scale);
  geometry.translate(0, 0.025, shape.offset);
  const material = source.material.clone();
  material.metalness = 0;
  material.roughness = Math.max(0.72, material.roughness);
  if (material.normalScale) material.normalScale.setScalar(0.75);
  for (const texture of [material.map, material.normalMap, material.roughnessMap]) {
    if (texture) texture.anisotropy = 4;
  }
  if (forest) {
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        #include <map_fragment>
        float chroma = max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b)
          - min(min(diffuseColor.r, diffuseColor.g), diffuseColor.b);
        float brightness = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 forestColor = brightness * vec3(0.72, 1.03, 0.51);
        diffuseColor.rgb = mix(diffuseColor.rgb, forestColor, smoothstep(0.03, 0.2, chroma) * 0.92);
      `);
    };
    material.customProgramCacheKey = () => 'forest-rex';
  }

  const root = new THREE.Group();
  const bones = [];
  function joint(label, parent, position) {
    const bone = new THREE.Bone();
    bone.name = label;
    bone.position.set(...position);
    parent.add(bone);
    bone.userData.index = bones.length;
    bones.push(bone);
    return bone;
  }
  const bodyGroup = joint('body', root, [0, 0, 0]);
  const headGroup = joint('neck', bodyGroup, shape.head);
  const tailGroup = joint('tail-base', bodyGroup, shape.tail);
  const tailMid = joint('tail-middle', tailGroup, [0, 0, -0.85]);
  const tailTip = joint('tail-tip', tailMid, [0, 0, -0.85]);
  const isQuadruped = name !== 't-rex';
  const legs = [];
  for (const front of isQuadruped ? [true, false] : [false]) {
    for (const side of [1, -1]) {
      const z = front ? shape.frontZ : shape.backZ;
      const hip = joint(`${front ? 'front' : 'back'}-${side}-hip`, bodyGroup, [side * shape.width, shape.hipY, z]);
      const knee = joint(`${hip.name}-knee`, hip, [0, shape.kneeY - shape.hipY, front ? -0.18 : 0.25]);
      legs.push({ hip, knee, x: side * shape.width, z, front, side });
    }
  }
  const positions = geometry.attributes.position;
  const nearestLeg = (x, z) => legs.reduce((best, leg) => {
    const distance = (x - leg.x) ** 2 + (z - leg.z) ** 2;
    return distance < best.distance ? { leg, distance } : best;
  }, { distance: Infinity }).leg;
  // Locate each sole in the supplied pose, including feet already lifted slightly.
  const soles = legs.map(() => []);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    if (y < shape.kneeY * 0.7) soles[legs.indexOf(nearestLeg(x, z))].push([y, z]);
  }
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const minY = soles[i].reduce((min, p) => Math.min(min, p[0]), Infinity);
    const bottom = soles[i].filter(p => p[0] < minY + 0.08);
    leg.ankleY = Number.isFinite(minY) ? minY + 0.14 : 0.16;
    leg.footZ = bottom.length ? bottom.reduce((sum, p) => sum + p[1], 0) / bottom.length : leg.z;
    const kneeFraction = (shape.hipY - shape.kneeY) / (shape.hipY - leg.ankleY);
    leg.knee.position.z = (leg.footZ - leg.z) * kneeFraction + (leg.front ? -0.14 : 0.18);
    leg.ankle = joint(`${leg.hip.name}-ankle`, leg.knee,
      [0, leg.ankleY - shape.kneeY, leg.footZ - leg.z - leg.knee.position.z]);
    leg.upperLength = leg.knee.position.length();
    leg.lowerLength = leg.ankle.position.length();
    leg.restUpper = Math.atan2(-leg.knee.position.z, -leg.knee.position.y);
    leg.restLower = Math.atan2(-leg.ankle.position.z, -leg.ankle.position.y);
  }
  const skinIndices = new Uint16Array(positions.count * 4);
  const skinWeights = new Float32Array(positions.count * 4);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const headWeight = smooth(shape.neck - 0.15, shape.neck + 0.75, z)
      * smooth(shape.headFloor - 0.2, shape.headFloor + 0.2, y);
    const tailWeight = (1 - smooth(shape.tail[2] - 0.45, shape.tail[2] + 0.2, z)) * smooth(0.3, 0.6, y);
    const limb = nearestLeg(x, z);
    const legZ = THREE.MathUtils.lerp(limb.footZ, limb.z, smooth(limb.ankleY, shape.hipY, y));
    const legWeight = (1 - smooth(shape.hipY - 0.25, shape.hipY + 0.16, y))
      * smooth(shape.width * 0.2, shape.width * 0.72, Math.abs(x))
      * (1 - smooth(0.45, 0.9, Math.abs(z - legZ)))
      * (1 - headWeight) * (1 - tailWeight);
    const kneeWeight = 1 - smooth(shape.kneeY - 0.14, shape.kneeY + 0.22, y);
    const ankleWeight = 1 - smooth(limb.ankleY - 0.03, limb.ankleY + 0.14, y);
    const tailDistance = Math.max(0, (shape.tail[2] - z) / 0.85);
    const tailIndex = Math.min(1, Math.floor(tailDistance));
    const tailBlend = smooth(0, 1, Math.min(1, tailDistance - tailIndex));
    const tailBones = [tailGroup, tailMid, tailTip];
    const weights = [
      [bodyGroup.userData.index, Math.max(0, 1 - headWeight - tailWeight - legWeight)],
      [headGroup.userData.index, headWeight],
      [tailBones[tailIndex].userData.index, tailWeight * (1 - tailBlend)],
      [tailBones[tailIndex + 1].userData.index, tailWeight * tailBlend],
      [limb.hip.userData.index, legWeight * (1 - kneeWeight)],
      [limb.knee.userData.index, legWeight * kneeWeight * (1 - ankleWeight)],
      [limb.ankle.userData.index, legWeight * kneeWeight * ankleWeight],
    ].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
    for (let j = 0; j < 4; j++) {
      skinIndices[i * 4 + j] = weights[j][0];
      skinWeights[i * 4 + j] = weights[j][1] / total;
    }
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.computeBoundingSphere();
  const surfaceMesh = new THREE.SkinnedMesh(geometry, material);
  surfaceMesh.castShadow = true;
  surfaceMesh.receiveShadow = true;
  surfaceMesh.frustumCulled = false;
  root.add(surfaceMesh);
  root.updateMatrixWorld(true);
  surfaceMesh.bind(new THREE.Skeleton(bones));
  const char = { root, bodyGroup, headGroup, tailGroup, tailMid, tailTip, surfaceMesh, legs, isQuadruped };
  char.applyCrouch = (amount, time) => {
    const drop = shape.crouchDepth * amount;
    bodyGroup.position.y = bodyGroup.position.y * (1 - amount) - drop;
    bodyGroup.rotation.z *= 1 - amount * 0.8;
    headGroup.rotation.x += shape.headBow * amount;
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      if (amount < 0.0001) {
        leg.ankle.rotation.x = 0;
        continue;
      }
      const phase = time + (i === 0 || (isQuadruped && i === 3) ? 0 : Math.PI);
      const { upperLength: upper, lowerLength: lower } = leg;
      const upperAngle = leg.restUpper + leg.hip.rotation.x;
      const lowerAngle = leg.restLower + leg.hip.rotation.x + leg.knee.rotation.x;
      const walkingY = -upper * Math.cos(upperAngle) - lower * Math.cos(lowerAngle);
      const walkingZ = -upper * Math.sin(upperAngle) - lower * Math.sin(lowerAngle);
      // Compensate for the lowered body without pulling the planted feet underground.
      const dy = THREE.MathUtils.lerp(walkingY, leg.ankleY - shape.hipY + Math.max(0, Math.cos(phase)) * 0.045, amount) + drop;
      const dz = THREE.MathUtils.lerp(walkingZ, leg.footZ - leg.z + Math.sin(phase) * 0.08, amount);
      const cosKnee = THREE.MathUtils.clamp((dy * dy + dz * dz - upper * upper - lower * lower) / (2 * upper * lower), -1, 1);
      const bend = Math.sign(leg.restLower - leg.restUpper) || (leg.front ? -1 : 1);
      const kneeAngle = bend * Math.acos(cosKnee);
      const hipAngle = Math.atan2(-dz, -dy) - Math.atan2(lower * Math.sin(kneeAngle), upper + lower * Math.cos(kneeAngle));
      leg.hip.rotation.x = hipAngle - leg.restUpper;
      leg.knee.rotation.x = kneeAngle - (leg.restLower - leg.restUpper);
      leg.ankle.rotation.x = -(leg.hip.rotation.x + leg.knee.rotation.x) * amount;
    }
  };
  if (isQuadruped) {
    [char.frontLeft, char.frontRight, char.backLeft, char.backRight] = legs.map(leg => leg.hip);
  } else {
    [char.leftLeg, char.rightLeg] = legs.map(leg => leg.hip);
    [char.shinL, char.shinR] = legs.map(leg => leg.knee);
  }
  return char;
}

export const buildRex = () => buildDinosaur('t-rex');
export const buildGreenDino = () => buildDinosaur('t-rex', true);
export const buildTriceratops = () => buildDinosaur('triceratops');
export const buildBrachiosaurus = () => buildDinosaur('brachiosaurus');
export const buildStegosaurus = () => buildDinosaur('stegosaurus');
