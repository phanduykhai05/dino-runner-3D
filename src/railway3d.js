import * as THREE from 'three';
import { laneX, trainPoseAt } from '../shared/race.js';
import { railSection, RAIL_FIRST_START, RAIL_PERIOD, RAIL_LENGTH } from '../shared/railway.js';

export class RailwayField {
  constructor(scene, soilTexture) {
    this.laneCount = 3;
    this.seed = 0;
    const steel = new THREE.MeshStandardMaterial({ color: '#919593', metalness: .8, roughness: .32 });
    const wood = new THREE.MeshStandardMaterial({ color: '#544333', roughness: .95 });
    const bedTexture = soilTexture.clone(); bedTexture.repeat.set(.7, RAIL_LENGTH / 8);
    const ballast = new THREE.MeshStandardMaterial({ map: bedTexture, color: '#686b65', roughness: 1 });
    const dark = new THREE.MeshStandardMaterial({ color: '#333b3b', roughness: .65, metalness: .4 });
    const white = new THREE.MeshStandardMaterial({ color: '#eee4cb', roughness: .8 });
    const railGeometry = new THREE.BoxGeometry(.13, .12, 1);
    const sleeperGeometry = new THREE.BoxGeometry(3.85, .08, .27);
    this.sections = Array.from({ length: 2 }, () => {
      const group = new THREE.Group(); scene.add(group);
      const bed = new THREE.Mesh(new THREE.PlaneGeometry(4.6, RAIL_LENGTH, 1, 200).rotateX(-Math.PI / 2).translate(0, 0, RAIL_LENGTH / 2), ballast);
      bed.position.y = .015; bed.receiveShadow = true; group.add(bed);
      const rails = new THREE.InstancedMesh(railGeometry, steel, 400);
      rails.receiveShadow = true; group.add(rails);
      const sleepers = new THREE.InstancedMesh(sleeperGeometry, wood, Math.floor(RAIL_LENGTH / .95));
      sleepers.receiveShadow = true; group.add(sleepers);
      const signal = new THREE.Group(); signal.position.set(2.7, 0, -24); group.add(signal);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.075, .1, 4.7, 8), steel); pole.position.y = 2.35; signal.add(pole);
      for (const angle of [-.65, .65]) {
        const cross = new THREE.Mesh(new THREE.BoxGeometry(2.2, .22, .1), white);
        cross.position.y = 4.3; cross.rotation.z = angle; signal.add(cross);
      }
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.7, .65, .18), dark); board.position.y = 3.35; signal.add(board);
      const lamps = [-.5, .5].map(x => {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(.21, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff3122' }));
        lamp.position.set(x, 3.35, -.15); signal.add(lamp); return lamp;
      });
      group.visible = false;
      return { group, lamps, bed, rails, sleepers, signal, key: null };
    });
  }

  setLaneCount(count) { this.laneCount = count; this.update(0, 0); }
  setSeed(seed) { this.seed = seed ?? 0; }

  shapeTrack(pool, section) {
    const baseX = laneX(section.lane), up = new THREE.Vector3(0, 1, 0);
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(1, 1, 1);
    const place = (mesh, index, at, side, y, length = 1) => {
      const pose = trainPoseAt(section, at), c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
      position.set(pose.x - baseX + side * c, y, at - section.start - side * s);
      rotation.setFromAxisAngle(up, pose.yaw); scale.set(1, 1, length);
      mesh.setMatrixAt(index, matrix.compose(position, rotation, scale));
    };
    for (let i = 0; i < 200; i++) {
      const at = section.start + (i + .5) * RAIL_LENGTH / 200;
      const length = RAIL_LENGTH / 200 / Math.cos(trainPoseAt(section, at).yaw) + .025;
      place(pool.rails, i * 2, at, -1.5, .14, length);
      place(pool.rails, i * 2 + 1, at, 1.5, .14, length);
    }
    for (let i = 0; i < pool.sleepers.count; i++) place(pool.sleepers, i, section.start + .3 + i * .95, 0, .06);
    for (const mesh of [pool.rails, pool.sleepers]) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
    const vertices = pool.bed.geometry.attributes.position;
    for (let i = 0; i <= 200; i++) {
      const at = section.start + i * RAIL_LENGTH / 200, pose = trainPoseAt(section, at);
      for (let side = 0; side < 2; side++) {
        const offset = side ? 2.3 : -2.3;
        vertices.setXYZ(i * 2 + side, pose.x - baseX + offset * Math.cos(pose.yaw), 0, at - section.start - offset * Math.sin(pose.yaw));
      }
    }
    vertices.needsUpdate = true; pool.bed.geometry.computeBoundingSphere();
    pool.signal.position.x = laneX(section.targetLane) - baseX + 2.7;
  }

  update(distance, seconds = 0) {
    const first = Math.max(0, Math.floor((distance - RAIL_FIRST_START) / RAIL_PERIOD));
    for (let i = 0; i < this.sections.length; i++) {
      const section = railSection(first + i, this.laneCount, this.seed), pool = this.sections[i], { group, lamps } = pool;
      group.visible = section.start <= distance + 260 && section.end >= distance - 80;
      if (!group.visible) continue;
      const key = `${section.index}:${this.laneCount}:${this.seed}`;
      if (pool.key !== key) { this.shapeTrack(pool, section); pool.key = key; }
      group.position.set(laneX(section.lane), 0, section.start - distance);
      lamps.forEach((lamp, index) => lamp.material.color.setHex((Math.floor(seconds * 4) + index) % 2 ? 0xff321c : 0x56180f));
    }
  }
}
