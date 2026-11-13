import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRAIN_SPEED, TRAIN_CARS, trainCarPoses } from '../shared/race.js';

let template;

function buildTrain() {
  const group = new THREE.Group();
  const materials = {
    paint: new THREE.MeshStandardMaterial({ color: '#a83428', roughness: .48, metalness: .38 }),
    cream: new THREE.MeshStandardMaterial({ color: '#d4cbb5', roughness: .48, metalness: .4 }),
    steel: new THREE.MeshStandardMaterial({ color: '#757d80', roughness: .35, metalness: .8 }),
    glass: new THREE.MeshStandardMaterial({ color: '#173440', roughness: .18, metalness: .65 }),
    dark: new THREE.MeshStandardMaterial({ color: '#24292b', roughness: .8, metalness: .3 }),
  };
  const wheelGeometry = new THREE.CylinderGeometry(.55, .55, .24, 16).rotateZ(Math.PI / 2);
  const spokeGeometry = mergeGeometries([new THREE.BoxGeometry(.25, .78, .08), new THREE.BoxGeometry(.25, .08, .78)]);
  const lampGeometry = new THREE.SphereGeometry(.2, 12, 8);
  const lampMaterial = new THREE.MeshBasicMaterial({ color: '#fff1b7' });
  for (const [index, { offset, length }] of TRAIN_CARS.entries()) {
    const car = new THREE.Group(); car.position.z = offset; group.add(car);
    const parts = { paint: [], cream: [], steel: [], glass: [], dark: [] };
    const box = (kind, w, h, d, x, y, z) => parts[kind].push(new THREE.BoxGeometry(w, h, d).translate(x, y, z - offset));
    const z = offset;
    box('paint', 4, 2.35, length, 0, 2.225, z);
    const roof = new THREE.CylinderGeometry(2, 2, length, 20, 1, false, Math.PI / 2, Math.PI);
    roof.rotateX(Math.PI / 2).translate(0, 3.4, 0); parts.cream.push(roof);
    box('steel', 3.6, .35, length, 0, .93, z);
    for (const side of [-1, 1]) {
      box('cream', .035, .3, length, side * 2.015, 2.05, z);
      box('steel', .06, .1, length, side * 2.025, 1.35, z);
      for (let offset = -length / 2 + 1.2; offset < length / 2 - .6; offset += 1.7) {
        box('cream', .04, 1.18, 1.4, side * 2.02, 3.35, z + offset);
        box('glass', .055, .95, 1.17, side * 2.045, 3.35, z + offset);
      }
    }
    for (const end of [-1, 1]) {
      box('dark', 1.45, 1.9, .12, 0, 2.4, z + end * length / 2);
      box('steel', .18, .5, .7, 0, .85, z + end * (length / 2 + .2));
    }
    if (index === 0) {
      // The cab faces the approaching runner (-Z).
      box('cream', 3.82, 1.75, .1, 0, 3.65, -16.04);
      for (const side of [-1, 1]) box('glass', 1.52, 1.05, .12, side * .86, 3.72, -16.11);
      box('paint', 3.9, .7, .25, 0, 2.38, -16.11);
      box('steel', 3.8, .34, .3, 0, 1.1, -16.12);
      for (let i = 0; i < 7; i++) box('dark', 1.8, .07, .05, 0, 1.5 + i * .075, -16.2);
      for (const z of [-12, -8.4]) box('dark', 1.7, .18, 1.8, 0, 5.2, z);
    }
    for (const [kind, geometries] of Object.entries(parts)) {
      const mesh = new THREE.Mesh(mergeGeometries(geometries), materials[kind]);
      mesh.castShadow = true; mesh.receiveShadow = true; car.add(mesh);
      geometries.forEach(geometry => geometry.dispose());
    }
    for (const z of [-length / 2 + 2.2, length / 2 - 2.2]) for (const side of [-1, 1]) {
      const wheel = new THREE.Group(); wheel.name = 'train-wheel';
      wheel.position.set(side * 1.5, .75, z);
      wheel.add(new THREE.Mesh(wheelGeometry, materials.dark));
      wheel.add(new THREE.Mesh(spokeGeometry, materials.steel));
      car.add(wheel);
    }
    if (index === 0) {
      for (const x of [-1.4, 1.4]) {
        const lamp = new THREE.Mesh(lampGeometry, lampMaterial); lamp.position.set(x, 2.4, -5.7); car.add(lamp);
      }
    }
  }
  return group;
}

export function createTrain() {
  template ??= buildTrain();
  const group = template.clone(true);
  const cars = group.children;
  const wheels = cars.flatMap(car => car.children.filter(child => child.name === 'train-wheel'));
  return { group, cars, wheels, update(dt, route, at = 0) {
    for (const wheel of wheels) wheel.rotation.x -= TRAIN_SPEED / .55 * dt;
    if (!route) return;
    trainCarPoses({ ...route, at }).forEach((pose, index) => {
      cars[index].position.set(pose.x, 0, pose.z - at);
      cars[index].rotation.y = pose.yaw;
    });
  } };
}
