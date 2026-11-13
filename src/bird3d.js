import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

let template;
let flightClip;
let glideClip;
let wingspan;
let center;

export async function loadBirdModel() {
  if (template) return;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const motionLoader = new THREE.FileLoader().setResponseType('json');
  const base = `${import.meta.env.BASE_URL}models/`;
  const [gltf, flap, glide] = await Promise.all([
    loader.loadAsync(`${base}pteranodon.glb`),
    motionLoader.loadAsync(`${base}pteranodon-flap.json`),
    motionLoader.loadAsync(`${base}pteranodon-glide.json`),
  ]);
  flightClip = THREE.AnimationClip.parse(flap);
  glideClip = THREE.AnimationClip.parse(glide);
  template = new THREE.Group();
  template.add(gltf.scene);
  const mixer = new THREE.AnimationMixer(template);
  mixer.clipAction(glideClip).play();
  mixer.setTime(0);
  template.updateMatrixWorld(true);
  let chest, head;
  template.traverse(object => {
    if (object.isBone && object.name.startsWith('chest')) chest = object;
    if (object.isBone && object.name.startsWith('head')) head = object;
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = false;
      object.material.side = THREE.DoubleSide;
      object.material.metalness = 0;
      if (object.material.map) object.material.map.anisotropy = 4;
    }
  });
  if (!chest || !head) throw new Error('The flying model is missing its body joints.');
  const forward = head.getWorldPosition(new THREE.Vector3()).sub(chest.getWorldPosition(new THREE.Vector3()));
  template.rotation.y = Math.PI - Math.atan2(forward.x, forward.z);

  template.updateMatrixWorld(true);
  template.traverse(object => { if (object.isSkinnedMesh) object.computeBoundingBox(); });
  wingspan = new THREE.Box3().setFromObject(template).getSize(new THREE.Vector3()).x;
  center = chest.getWorldPosition(new THREE.Vector3());
  mixer.stopAllAction();
  mixer.uncacheRoot(template);
}

export function createFlyingBird({ span = 3.4, phase = Math.random() * 7.2, rate = 1 } = {}) {
  if (!template) throw new Error('Load the bird model before creating birds.');
  const root = new THREE.Group();
  const flightBody = new THREE.Group();
  const offset = new THREE.Group();
  offset.position.copy(center).negate();
  const model = clone(template);
  offset.add(model);
  flightBody.add(offset);
  flightBody.scale.setScalar(span / wingspan);
  root.add(flightBody);
  const mixer = new THREE.AnimationMixer(model);
  const flapping = mixer.clipAction(flightClip).play();
  const gliding = mixer.clipAction(glideClip).play();
  flapping.time = phase % flightClip.duration;
  let time = phase;
  let disposed = false;
  const flight = {
    model, mixer, flightBody, flapping, gliding,
    update(dt) {
      if (disposed) return;
      time += dt * rate;
      const cycle = time % 7.2;
      const glideWeight = THREE.MathUtils.smoothstep(cycle, 3.8, 4.4)
        * (1 - THREE.MathUtils.smoothstep(cycle, 6.4, 7.2));
      flapping.setEffectiveWeight(1 - glideWeight);
      gliding.setEffectiveWeight(glideWeight);
      mixer.update(dt * rate);
      flightBody.rotation.z = Math.sin(time * 0.7) * 0.045;
      flightBody.rotation.x = Math.sin(time * 0.55) * 0.025;
      flightBody.position.y = Math.sin(time * 4) * 0.025 * (1 - glideWeight);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      model.traverse(object => { if (object.isSkinnedMesh) object.skeleton.dispose(); });
    },
  };
  root.userData.flight = flight;
  flight.update(0);
  return root;
}
