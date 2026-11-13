/**
 * 3D High-Detail Obstacles for Three.js Dino Runner
 * Ribbed saguaro cacti and skeletal flying Pteranodon obstacles.
 */

import * as THREE from 'three';
import { createFlyingBird } from './bird3d.js';
import { createCactus } from './cactus3d.js';
import { createContainer } from './container3d.js';
import { obstacleBounds, laneX } from '../shared/race.js';
import { obstacleRow, rowGapAt } from '../shared/course.js';

export const Obstacle3DType = {
  CACTUS_SMALL: 'CACTUS_SMALL',
  CACTUS_LARGE: 'CACTUS_LARGE',
  PTERODACTYL: 'PTERODACTYL',
  CONTAINER: 'CONTAINER',
};

export class Obstacle3D {
  constructor(type, z, count = 1, birdHeightLevel = 0, color = 0x2e3035, variant = 0) {
    this.type = type;
    this.z = z;
    this.count = count;
    this.birdHeightLevel = birdHeightLevel;
    this.color = color;
    this.variant = variant;

    this.mesh = new THREE.Group();
    this.mesh.position.z = z;

    this.material = null;

    this.box = new THREE.Box3();

    this.build();
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
    if (this.container) return; // Cached container geometry, materials and textures are shared.
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
    this.z -= speed * dt * 14;
    this.mesh.position.z = this.z;

    if (this.type === Obstacle3DType.PTERODACTYL) {
      this.flightBird.userData.flight.update(dt);
    }

    this.updateBox();
  }

  updateBox() {
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
}

export class Obstacle3DManager {
  constructor(scene, color = 0x2e3035) {
    this.scene = scene;
    this.color = color;
    this.obstacles = [];
    this.nextSpawnDistance = 35;
  }

  setColor(color) {
    this.color = color;
    for (const obs of this.obstacles) {
      obs.setColor(color);
    }
  }

  reset() {
    for (const obs of this.obstacles) {
      obs.dispose();
      this.scene.remove(obs.mesh);
    }
    this.obstacles = [];
    this.nextSpawnDistance = 45;
  }

  update(speed, distance, dt) {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.update(speed, dt);

      if (obs.z < -12) {
        obs.dispose();
        this.scene.remove(obs.mesh);
        this.obstacles.splice(i, 1);
      }
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
    return this.obstacles.some(obs => obs.box.intersectsBox(dino3D.box));
  }
}
