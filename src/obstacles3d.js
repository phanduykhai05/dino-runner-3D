/**
 * 3D High-Detail Obstacles for Three.js Dino Runner
 * Ribbed saguaro cacti and skeletal flying Pteranodon obstacles.
 */

import * as THREE from 'three';
import { createFlyingBird } from './bird3d.js';
import { createCactus } from './cactus3d.js';
import { createContainer } from './container3d.js';
import { createTrain } from './train3d.js';
import { obstacleBounds, laneX, TRAIN_SPEED, trainCarPoses, trainHitsBox } from '../shared/race.js';
import { obstacleRow, rowGapAt } from '../shared/course.js';
import { railSection, trainForSection } from '../shared/railway.js';

export const Obstacle3DType = {
  CACTUS_SMALL: 'CACTUS_SMALL',
  CACTUS_LARGE: 'CACTUS_LARGE',
  PTERODACTYL: 'PTERODACTYL',
  CONTAINER: 'CONTAINER',
  TRAIN: 'TRAIN',
};

export class Obstacle3D {
  constructor(type, z, count = 1, birdHeightLevel = 0, color = 0x2e3035, variant = 0, route = null) {
    this.type = type;
    this.z = z;
    this.count = count;
    this.birdHeightLevel = birdHeightLevel;
    this.color = color;
    this.variant = variant;
    this.route = route;
    this.at = route?.at ?? z;

    this.mesh = new THREE.Group();
    this.mesh.position.z = z;

    this.material = null;

    this.box = new THREE.Box3();

    this.build();
    this.train?.update(0, this.route, this.at);
    this.updateBox();
  }

  build() {
    if (this.type === Obstacle3DType.CACTUS_SMALL) {
      this.buildCactusSmall();
    } else if (this.type === Obstacle3DType.CACTUS_LARGE) {
      this.buildCactusLarge();
    } else if (this.type === Obstacle3DType.PTERODACTYL) {
      this.buildPterodactyl();
    } else if (this.type === Obstacle3DType.CONTAINER) {
      this.container = createContainer(this.variant);
      this.mesh.add(this.container);
    } else if (this.type === Obstacle3DType.TRAIN) {
      this.train = createTrain();
      this.mesh.add(this.train.group);
    }
  }

  buildCactusSmall() { this.buildCactus(false); }
  buildCactusLarge() { this.buildCactus(true); }

  buildCactus(large) {
    const cactus = createCactus(large, this.count);
    this.cactus = cactus;
    this.material = cactus.children[0].material;
    this.mesh.add(cactus);
  }

  buildPterodactyl() {
    const heights = [1.25, 2.15, 3.35];
    this.mesh.position.y = heights[this.birdHeightLevel];
    this.flightBird = createFlyingBird({ span: this.birdHeightLevel === 0 ? 2.8 : 3.4 });
    this.mesh.add(this.flightBird);
  }

  dispose() {
    if (this.container || this.train) return; // Cached geometry, materials and textures are shared.
    if (this.flightBird) this.flightBird.userData.flight.dispose();
    else {
      const materials = new Set();
      this.mesh.traverse(object => {
        if (object.geometry && !this.cactus) object.geometry.dispose();
        if (object.material) materials.add(object.material);
      });
      materials.forEach(material => material.dispose());
    }
  }

  setColor(color) {
    this.color = color;
    this.material?.color.set(color);
  }

  update(speed, dt) {
    this.updateAt(this.z - (speed * 14 + (this.train ? TRAIN_SPEED : 0)) * dt, dt,
      this.at - (this.train ? TRAIN_SPEED * dt : 0));
  }

  updateAt(z, dt, at = this.at) {
    this.z = z;
    this.at = at;
    this.mesh.position.z = this.z;

    if (this.type === Obstacle3DType.PTERODACTYL) {
      this.flightBird.userData.flight.update(dt);
    }
    this.train?.update(dt, this.route, this.at);

    this.updateBox();
  }

  updateBox() {
    if (this.train && this.route) {
      this.box.makeEmpty();
      for (const car of trainCarPoses({ ...this.route, at: this.at })) {
        const hx = car.halfX * Math.cos(car.yaw) + car.halfZ * Math.abs(Math.sin(car.yaw));
        const hz = car.halfZ * Math.cos(car.yaw) + car.halfX * Math.abs(Math.sin(car.yaw));
        const z = this.z + car.z - this.at;
        this.box.expandByPoint(new THREE.Vector3(car.x - hx, .08, z - hz));
        this.box.expandByPoint(new THREE.Vector3(car.x + hx, 5.36, z + hz));
      }
      return;
    }
    if (this.type === Obstacle3DType.PTERODACTYL) {
      // Wing tips are visual: flapping must not change whether a dodge succeeds.
      this.box.setFromCenterAndSize(this.mesh.position, new THREE.Vector3(0.6, 0.42, 1.2));
      return;
    }
    // Small fittings and spines are decorative; collision uses the shared body bounds.
    const bounds = obstacleBounds({ type: this.type, count: this.count });
    this.box.min.set(this.mesh.position.x - bounds.halfX, bounds.minY, this.z - bounds.halfZ);
    this.box.max.set(this.mesh.position.x + bounds.halfX, bounds.maxY, this.z + bounds.halfZ);
  }

  intersectsBox(box) {
    return this.train && this.route
      ? trainHitsBox({ ...this.route, at: this.at }, box, this.at - this.z)
      : this.box.intersectsBox(box);
  }
}

export class Obstacle3DManager {
  constructor(scene, color = 0x2e3035) {
    this.scene = scene;
    this.color = color;
    this.obstacles = [];
    this.nextSpawnDistance = 35;
    this.nextTrainSection = 0;
    this.courseSeed = 0;
  }

  setColor(color) {
    this.color = color;
    for (const obs of this.obstacles) {
      obs.setColor(color);
    }
  }

  reset(courseSeed = 0) {
    this.courseSeed = courseSeed;
    for (const obs of this.obstacles) {
      obs.dispose();
      this.scene.remove(obs.mesh);
    }
    this.obstacles = [];
    this.nextSpawnDistance = 45;
    this.nextTrainSection = 0;
  }

  update(speed, distance, dt) {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.update(speed, dt);

      if (obs.z < -Math.max(12, obstacleBounds(obs).halfZ + 4)) {
        obs.dispose();
        this.scene.remove(obs.mesh);
        this.obstacles.splice(i, 1);
      }
    }

    while (railSection(this.nextTrainSection, 3).triggerAt <= distance) {
      const index = this.nextTrainSection++;
      if (railSection(index, 3).end < distance) continue;
      const descriptor = trainForSection(index, 3, this.courseSeed);
      const obs = new Obstacle3D(descriptor.type, descriptor.at - distance, 1, 0, undefined, 0, descriptor);
      obs.lane = descriptor.lane; obs.section = index; obs.updateBox();
      this.scene.add(obs.mesh); this.obstacles.push(obs);
    }

    this.nextSpawnDistance -= speed * dt * 14;

    if (this.nextSpawnDistance <= 0) {
      this.spawn(distance, speed);
    }
  }

  spawn(distance, speed) {
    const spawnZ = Math.max(95, speed * 14 * 2.7);
    for (const descriptor of obstacleRow(distance + spawnZ, 3)) {
      const obs = new Obstacle3D(descriptor.type, spawnZ, descriptor.count, descriptor.height, this.color, descriptor.variant);
      obs.mesh.position.x = laneX(descriptor.lane);
      obs.updateBox();
      this.scene.add(obs.mesh);
      this.obstacles.push(obs);
    }
    this.nextSpawnDistance = rowGapAt(distance);
  }

  checkCollision(dino3D) {
    return this.obstacles.some(obs => obs.intersectsBox(dino3D.box));
  }
}
