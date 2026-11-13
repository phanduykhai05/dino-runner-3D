/**
 * 3D Environment for Three.js Dino Runner
 * Endless scrolling runway, volumetric clouds, dynamic lighting and day/night cycles.
 */

import * as THREE from 'three';
import { createFlyingBird } from './bird3d.js';
import { createCloudMaterial } from './cloud3d.js';
import { Sky3D } from './sky3d.js';
import { PuddleField } from './puddles3d.js';
import { RailwayField } from './railway3d.js';
import { DAY_CYCLE_SECONDS } from '../shared/day-cycle.js';
import { LANE_WIDTH, laneX } from '../shared/race.js';
import { SOIL_TILE_SIZE, GROUND_START, createSoilTextures, createRoadEdge, createWornPathMask, RockField } from './terrain3d.js';

export class Environment3D {
  constructor(scene) {
    this.scene = scene;

    this.isNight = false;
    this.dayColor = 0xe9f2f7;
    this.nightColor = 0x202124;
    this.elementColor = 0x535353;
    this.nightElementColor = 0xacbac8;
    this.scene.background.set(this.dayColor);
    this.scene.fog.color.set(this.dayColor);

    // Ground & Pebbles
    this.groundWidth = LANE_WIDTH * 3 + 2;
    this.groundLength = 320;
    this.groundOffset = 0;
    this.travelDistance = 0;
    this.pebbles = [];

    // Clouds
    this.clouds = [];

    // Ambient Sky Birds (Flying High in the Sky)
    this.skyBirds = [];

    // Night items (Moon & Stars)
    this.stars = [];
    this.moonGroup = null;

    this.initLights();
    this.initGround();
    this.initPebbles();
    this.puddles = new PuddleField(this.scene, this.groundLength, this.soilTextures.soil);
    this.puddles.setRoad(this.laneCount, this.groundWidth);
    this.railway = new RailwayField(this.scene, this.soilTextures.soil);
    this.initClouds();
    this.initSkyBirds();
    this.initMoonAndStars();
  }

  initLights() {
    this.ambientLight = new THREE.HemisphereLight(0xdce9f2, 0x847760, 1.1);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xffefd5, 2.6);
    this.dirLight.position.set(-8, 16, -5);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.normalBias = 0.035;
    this.dirLight.shadow.bias = -0.0002;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 120;
    this.dirLight.shadow.camera.left = -15;
    this.dirLight.shadow.camera.right = 15;
    this.dirLight.shadow.camera.top = 25;
    this.dirLight.shadow.camera.bottom = -10;
    this.scene.add(this.dirLight);

    this.fillLight = new THREE.DirectionalLight(0xc5def4, 0.65);
    this.fillLight.position.set(8, 6, 4);
    this.scene.add(this.fillLight);
  }

  initGround() {
    this.soilTextures = createSoilTextures();
    const tiled = (source, width, length) => {
      const map = source.clone();
      map.repeat.set(width / SOIL_TILE_SIZE, length / SOIL_TILE_SIZE);
      return map;
    };
    this.groundMat = new THREE.MeshStandardMaterial({
      map: tiled(this.soilTextures.soil, this.groundWidth, this.groundLength),
      bumpMap: tiled(this.soilTextures.bump, this.groundWidth, this.groundLength),
      bumpScale: .035, roughness: .98, transparent: true, depthWrite: false,
    });
    this.groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(14, this.groundLength), this.groundMat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.position.z = GROUND_START + this.groundLength / 2;
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);

    this.terrainMat = new THREE.MeshStandardMaterial({
      map: tiled(this.soilTextures.soil, 320, 480),
      bumpMap: tiled(this.soilTextures.bump, 320, 480),
      color: '#b5b2a7', bumpScale: .05, roughness: 1,
    });
    this.terrainMesh = new THREE.Mesh(new THREE.PlaneGeometry(320, 480), this.terrainMat);
    this.terrainMesh.rotation.x = -Math.PI / 2;
    this.terrainMesh.position.set(0, -.035, 140);
    this.terrainMesh.receiveShadow = true;
    this.scene.add(this.terrainMesh);

    const pathWidth = LANE_WIDTH - .8;
    const pathMask = createWornPathMask();
    pathMask.repeat.y = this.groundLength / SOIL_TILE_SIZE;
    this.wearMat = new THREE.MeshStandardMaterial({
      map: tiled(this.soilTextures.dust, pathWidth, this.groundLength),
      bumpMap: tiled(this.soilTextures.bump, pathWidth, this.groundLength),
      alphaMap: pathMask, bumpScale: .025, roughness: 1, transparent: true, depthWrite: false,
    });
    this.setLaneCount(3);
  }

  setLaneCount(count) {
    this.laneCount = count;
    this.travelDistance = 0;
    this.groundWidth = count === 1 ? 14 : LANE_WIDTH * count + 2;
    this.groundMesh.scale.x = this.groundWidth / 14;
    this.groundMat.map.repeat.x = this.groundMat.bumpMap.repeat.x = this.groundWidth / SOIL_TILE_SIZE;
    this.groundMat.alphaMap?.dispose();
    this.groundMat.alphaMap = createRoadEdge(this.groundWidth);
    this.groundMat.alphaMap.repeat.y = this.groundLength / SOIL_TILE_SIZE;
    this.groundMat.needsUpdate = true;
    for (const group of [this.laneMarkings, this.pathGroup]) {
      if (!group) continue;
      const materials = new Set(), geometries = new Set();
      group.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material && object.material !== this.wearMat) materials.add(object.material);
      });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      group.removeFromParent();
    }
    this.pathGroup = new THREE.Group();
    const pathGeometry = new THREE.PlaneGeometry(LANE_WIDTH - .8, this.groundLength);
    for (let lane = 0; lane < count; lane++) {
      const path = new THREE.Mesh(pathGeometry, this.wearMat);
      path.rotation.x = -Math.PI / 2;
      path.position.set(count === 1 ? 0 : laneX(lane + (5 - count) / 2), .004, GROUND_START + this.groundLength / 2);
      path.renderOrder = 1; path.receiveShadow = true;
      this.pathGroup.add(path);
    }
    this.scene.add(this.pathGroup);
    this.laneMarkings = null;
    if (count > 1) {
      this.laneMarkings = new THREE.Group();
      const dash = new THREE.PlaneGeometry(.055, 2.8);
      const chalk = new THREE.MeshStandardMaterial({ color: '#d9cdb5', roughness: 1, transparent: true, opacity: .5, depthWrite: false });
      const matrix = new THREE.Matrix4();
      const dashCount = Math.ceil(this.groundLength / 7) + 2;
      for (let lane = 0; lane < count - 1; lane++) {
        const line = new THREE.InstancedMesh(dash, chalk, dashCount);
        for (let i = 0; i < dashCount; i++) {
          matrix.makeRotationX(-Math.PI / 2);
          matrix.setPosition((lane - (count - 2) / 2) * LANE_WIDTH, .009, GROUND_START - 7 + i * 7);
          line.setMatrixAt(i, matrix);
        }
        line.renderOrder = 2;
        this.laneMarkings.add(line);
      }
      this.scene.add(this.laneMarkings);
      this.laneOffset = 0;
    }
    this.rockField?.setWidth(this.groundWidth);
    this.puddles?.setRoad(count, this.groundWidth);
    this.railway?.setLaneCount(count);
    if (this.rockField) this.pebbles = this.rockField.stones;
    this.dirLight.shadow.camera.left = -Math.max(16, this.groundWidth / 2 + 8);
    this.dirLight.shadow.camera.right = Math.max(16, this.groundWidth / 2 + 8);
    this.dirLight.shadow.camera.updateProjectionMatrix();
  }

  initPebbles() {
    this.rockField = new RockField(this.scene, this.groundWidth, this.groundLength, this.soilTextures.bump);
    this.pebbles = this.rockField.stones;
  }

  initClouds() {
    this.cloudMat = createCloudMaterial();
    this.cloudGeometry = new THREE.BoxGeometry(1, 1, 1);

    for (let i = 0; i < 6; i++) {
      const cloud = this.createCloudMesh();
      cloud.position.set(
        (Math.random() - 0.5) * 42,
        14 + Math.random() * 8,
        25 + i * 18 + Math.random() * 12
      );
      cloud.scale.set(6 + Math.random() * 4, 3 + Math.random() * 1.5, 4 + Math.random() * 2);
      cloud.rotation.y = Math.random() * Math.PI;
      cloud.userData.wind = 0.06 + Math.random() * 0.07;
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  createCloudMesh() {
    return new THREE.Mesh(this.cloudGeometry, this.cloudMat);
  }

  initSkyBirds() {
    for (let i = 0; i < 3; i++) {
      const bird = this.createSkyBirdMesh();
      bird.position.set(
        (Math.random() - 0.5) * 32,
        9 + Math.random() * 4,
        22 + Math.random() * 65
      );
      bird.userData.speed = 0.8 + Math.random() * 0.4;
      bird.userData.baseX = bird.position.x;
      bird.userData.baseY = bird.position.y;
      bird.userData.time = Math.random() * Math.PI * 2;
      this.scene.add(bird);
      this.skyBirds.push(bird);
    }
  }

  createSkyBirdMesh() {
    return createFlyingBird({ span: 3.6, rate: 0.9 + Math.random() * 0.2 });
  }

  initMoonAndStars() {
    this.sky = new Sky3D(this.scene);
    this.moonGroup = this.sky.moon;
    this.stars = this.sky.stars;
    this.skyColors = Object.fromEntries(Object.entries({
      groundNight: '#8792a3', groundDay: '#ffffff', terrainNight: '#697587', terrainDay: '#b5b2a7',
      lightNight: '#adc9f1', lightDay: '#fff0d0', lightWarm: '#ffb56c',
      ambientNight: '#bacdeb', ambientDay: '#dce9f2', ambientWarm: '#efc7a4',
      cloudNight: '#60748e', cloudDay: '#ffffff', cloudWarm: '#ffe0bc',
    }).map(([key, color]) => [key, new THREE.Color(color)]));
    this.skyLightDirection = new THREE.Vector3();
    this.setTimeOfDay(0);
  }

  setTimeOfDay(seconds, camera) {
    this.skyTime = seconds;
    this.railway.update(this.travelDistance, seconds);
    const state = this.sky.update(seconds, camera);
    const { daylight, warmth } = state, c = this.skyColors;
    this.isNight = daylight < .2;
    this.groundMat.color.copy(c.groundNight).lerp(c.groundDay, daylight);
    this.terrainMat.color.copy(c.terrainNight).lerp(c.terrainDay, daylight);
    this.wearMat.color.copy(this.groundMat.color);
    for (const mesh of this.rockField.meshes) mesh.material.color.copy(c.groundNight).lerp(c.groundDay, daylight);
    this.ambientLight.intensity = .85 + daylight * .25;
    this.ambientLight.color.copy(c.ambientNight).lerp(c.ambientDay, daylight).lerp(c.ambientWarm, warmth * daylight * .5);
    this.dirLight.intensity = 1.1 + daylight * 1.5;
    this.dirLight.color.copy(c.lightNight).lerp(c.lightDay, daylight).lerp(c.lightWarm, warmth * daylight * .75);
    this.skyLightDirection.copy(this.sky.sunDirection).multiplyScalar(daylight)
      .addScaledVector(this.sky.moonDirection, 1 - daylight);
    this.dirLight.position.copy(this.skyLightDirection).multiplyScalar(30);
    this.dirLight.position.y = Math.max(5, this.dirLight.position.y);
    this.fillLight.intensity = .5 + daylight * .15;
    this.fillLight.position.set(-8, 8, -10);
    this.cloudMat.uniforms.uTint.value.copy(c.cloudNight).lerp(c.cloudDay, daylight).lerp(c.cloudWarm, warmth * daylight * .4);
    this.cloudMat.uniforms.uSky.value.copy(this.sky.horizon);
    const water = this.puddles.material.uniforms;
    water.uTime.value = seconds; water.uDaylight.value = daylight;
    water.uHorizon.value.copy(this.sky.horizon); water.uZenith.value.copy(this.sky.zenith);
    water.uSun.value.copy(this.sky.sunDirection); water.uSunColor.value.copy(this.sky.sunColor);
    water.uGroundTint.value.copy(this.groundMat.color);
    return state;
  }

  setNight(night) { this.setTimeOfDay(DAY_CYCLE_SECONDS * (night ? .75 : .25)); }

  update(speed, dt, worldDistance) {
    const moveZ = speed * dt * 14;
    this.travelDistance = worldDistance ?? this.travelDistance + moveZ;
    if (this.laneMarkings) {
      this.laneOffset = this.travelDistance % 7;
      this.laneMarkings.position.z = -this.laneOffset;
    }

    this.groundOffset = this.travelDistance % SOIL_TILE_SIZE;
    for (const material of [this.groundMat, this.terrainMat, this.wearMat]) {
      for (const map of [material.map, material.bumpMap, material.alphaMap]) {
        if (map) map.offset.y = -this.groundOffset / SOIL_TILE_SIZE;
      }
    }
    this.rockField.update(moveZ);
    this.puddles.update(this.travelDistance);
    this.railway.update(this.travelDistance, this.skyTime);

    // Scroll clouds slowly
    const cloudSpeed = moveZ * 0.12;
    for (const c of this.clouds) {
      c.position.z -= cloudSpeed + dt * 0.08;
      c.position.x += dt * c.userData.wind;
      if (c.position.x > 28) c.position.x = -28;
      if (c.position.z < -10) {
        c.position.z += 120;
        c.position.x = (Math.random() - 0.5) * 40;
      }
    }

    // Animate Sky Birds (Soaring gracefully in the high sky)
    for (const bird of this.skyBirds) {
      const bSpeed = bird.userData.speed || 1.0;
      bird.position.z -= (moveZ * 0.18 + bSpeed * dt * 4);
      bird.userData.time += dt;
      bird.userData.flight.update(dt);
      bird.position.x = bird.userData.baseX + Math.sin(bird.userData.time * 0.4) * 1.2;
      bird.position.y = bird.userData.baseY + Math.sin(bird.userData.time * 0.55) * 0.22;
      bird.rotation.y = Math.cos(bird.userData.time * 0.4) * -0.08;

      if (bird.position.z < -15) {
        bird.position.z += 130;
        bird.userData.baseX = (Math.random() - 0.5) * 34;
        bird.userData.baseY = 9 + Math.random() * 4;
      }
    }
  }
}
