/** Skeletal dinosaur models, movement, jump physics and collision bounds. */

import * as THREE from 'three';
import {
  buildRex,
  buildGreenDino,
  buildTriceratops,
  buildBrachiosaurus,
  buildStegosaurus,
} from './dino_models.js';

export const Dino3DState = {
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  JUMPING: 'JUMPING',
  DUCKING: 'DUCKING',
  DEAD: 'DEAD',
};

export class Dino3D {
  constructor(type = 'dark_rex') {
    this.mesh = new THREE.Group();
    this.currentType = type;

    // Physics
    this.y = 0;
    this.vy = 0;
    this.gravity = -28.0;
    this.jumpForce = 13.8;
    this.dropForce = 24.0;

    // States
    this.state = Dino3DState.IDLE;
    this.animTime = 0;
    this.isDucking = false;
    this.duckAmount = 0;

    // Shadow
    this.initShadow();

    // Build Initial Dino
    this.setDinoType(this.currentType);

    // 3D Collision Box
    this.box = new THREE.Box3();
    this.updateBoundingBox();
  }

  initShadow() {
    const size = 64;
    const pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const radius = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
        const i = (y * size + x) * 4;
        pixels[i + 3] = Math.round(Math.pow(Math.max(0, 1 - radius), 1.7) * 255);
      }
    }
    const texture = new THREE.DataTexture(pixels, size, size);
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    const shadowGeo = new THREE.PlaneGeometry(3.2, 5.4);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, opacity: 0.18, depthWrite: false,
    });
    this.shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowMesh.rotation.x = -Math.PI / 2;
    this.shadowMesh.position.set(0, 0.02, 0);
    this.mesh.add(this.shadowMesh);
  }

  setDinoType(type) {
    const builders = {
      dark_rex: buildRex,
      green_rex: buildGreenDino,
      triceratops: buildTriceratops,
      brachiosaurus: buildBrachiosaurus,
      stegosaurus: buildStegosaurus,
    };
    const selected = Object.hasOwn(builders, type) ? type : 'dark_rex';
    if (this.activeChar) {
      const materials = new Set();
      this.activeChar.root.traverse(object => {
        if (object.isMesh) {
          object.geometry.dispose();
          materials.add(object.material);
          if (object.isSkinnedMesh) object.skeleton.dispose();
        }
      });
      materials.forEach(material => material.dispose());
      this.mesh.remove(this.activeChar.root);
    }
    this.currentType = selected;
    const char = builders[selected]();
    this.activeChar = char;
    for (const key of [
      'bodyGroup', 'headGroup', 'tailGroup', 'lowerJaw',
      'leftLeg', 'rightLeg', 'shinL', 'shinR', 'leftArm', 'rightArm',
      'frontLeft', 'frontRight', 'backLeft', 'backRight',
    ]) {
      this[key] = char[key] || null;
    }
    this.isQuadruped = char.isQuadruped;
    this.mesh.add(char.root);
    this.reset();
    if (this.box) this.updateBoundingBox();
  }

  reset() {
    this.y = 0;
    this.vy = 0;
    this.state = Dino3DState.RUNNING;
    this.animTime = 0;
    this.isDucking = false;
    this.duckAmount = 0;
    this.mesh.position.y = 0;
    this.mesh.rotation.set(0, 0, 0);
    this.bodyGroup.position.set(0, 0, 0);
    this.bodyGroup.rotation.set(0, 0, 0);
    this.headGroup.rotation.set(0, 0, 0);
    this.tailGroup.rotation.set(0, 0, 0);
    if (this.lowerJaw) this.lowerJaw.rotation.x = 0.15;
    this.activeChar.surfaceMesh.skeleton.bones.forEach(bone => bone.rotation.set(0, 0, 0));
    this.shadowMesh.position.y = 0.02;
    this.shadowMesh.scale.setScalar(1);
    this.shadowMesh.material.opacity = 0.18;
  }

  jump() {
    if (this.state === Dino3DState.DEAD) return false;
    if (this.y <= 0.02) {
      this.setDuck(false);
      this.duckAmount = 0;
      this.bodyGroup.position.set(0, 0, 0);
      this.vy = this.jumpForce;
      this.state = Dino3DState.JUMPING;

      if (this.lowerJaw) this.lowerJaw.rotation.x = 0.32;
      return true;
    }
    return false;
  }

  setDuck(ducking) {
    if (this.state === Dino3DState.DEAD) return;
    if (this.state === Dino3DState.JUMPING) {
      if (ducking) this.vy -= this.dropForce * 0.05;
      return;
    }
    this.isDucking = ducking;
    this.state = ducking ? Dino3DState.DUCKING : Dino3DState.RUNNING;
  }

  die() {
    this.state = Dino3DState.DEAD;
    this.mesh.rotation.z = 0.45;
    this.mesh.rotation.x = 0.2;
    this.mesh.position.y = Math.max(0, this.y);
    if (this.lowerJaw) this.lowerJaw.rotation.x = 0.75;
  }

  update(gameSpeed, dt, networkPose = null) {
    if (networkPose) {
      if (networkPose.alive && this.state === Dino3DState.DEAD) this.reset();
      this.y = networkPose.y;
      this.vy = networkPose.vy;
      this.isDucking = networkPose.duck;
      if (!networkPose.alive) {
        if (this.state !== Dino3DState.DEAD) this.die();
        this.mesh.position.y = this.y;
        return;
      }
      this.state = networkPose.idle ? Dino3DState.IDLE : this.y > 0.02 || this.vy > 0 ? Dino3DState.JUMPING : this.isDucking ? Dino3DState.DUCKING : Dino3DState.RUNNING;
    }
    if (this.state === Dino3DState.DEAD) return;
    this.bodyGroup.position.set(0, 0, 0);
    this.bodyGroup.rotation.set(0, 0, 0);
    this.headGroup.rotation.x = 0;
    this.duckAmount = THREE.MathUtils.damp(this.duckAmount, this.isDucking ? 1 : 0, 18, dt);
    if (Math.abs(this.duckAmount - Number(this.isDucking)) < 0.0001) this.duckAmount = Number(this.isDucking);

    // Jump Physics
    if (!networkPose && this.state === Dino3DState.JUMPING) {
      this.vy += this.gravity * dt;
      this.y += this.vy * dt;

      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.state = this.isDucking ? Dino3DState.DUCKING : Dino3DState.RUNNING;
        if (this.lowerJaw) this.lowerJaw.rotation.x = 0.15;
      }
    }

    this.mesh.position.y = this.y;

    // Ground shadow
    const shadowScale = Math.max(0.35, 1 - (this.y / 7));
    this.shadowMesh.scale.set(shadowScale, shadowScale, shadowScale);
    this.shadowMesh.material.opacity = Math.max(0.04, 0.18 - (this.y / 24));
    this.shadowMesh.position.y = -this.y + 0.02;

    // Running Animation Loop
    if (this.state === Dino3DState.RUNNING || this.state === Dino3DState.DUCKING) {
      const legFreq = 7.0 + gameSpeed * 3.5;
      this.animTime += dt * legFreq;
      const swing = Math.sin(this.animTime) * 0.36;

      if (this.isQuadruped) {
        // 4-Legged Trot cycle (Front-Left & Back-Right move together)
        if (this.frontLeft) this.frontLeft.rotation.x = swing * 0.65;
        if (this.frontRight) this.frontRight.rotation.x = -swing * 0.65;
        if (this.backLeft) this.backLeft.rotation.x = -swing * 0.65;
        if (this.backRight) this.backRight.rotation.x = swing * 0.65;
        for (let i = 0; i < this.activeChar.legs.length; i++) {
          const phase = i === 0 || i === 3 ? 0 : Math.PI;
          this.activeChar.legs[i].knee.rotation.x = Math.max(0, Math.sin(this.animTime + phase)) * 0.24;
        }

        // Subtle torso roll & head bobbing
        if (this.bodyGroup && !this.isDucking) {
          this.bodyGroup.position.y = Math.abs(Math.sin(this.animTime * 2)) * 0.035;
        }
        if (this.headGroup) {
          this.headGroup.rotation.x = Math.sin(this.animTime * 2) * 0.025;
        }
      } else {
        // 2-Legged Sprint cycle
        if (this.leftLeg) this.leftLeg.rotation.x = swing;
        if (this.rightLeg) this.rightLeg.rotation.x = -swing;

        if (this.shinL) this.shinL.rotation.x = Math.max(0, -swing) * 0.85;
        if (this.shinR) this.shinR.rotation.x = Math.max(0, swing) * 0.85;

        if (this.leftArm) this.leftArm.rotation.x = -swing * 0.65;
        if (this.rightArm) this.rightArm.rotation.x = swing * 0.65;

        if (this.bodyGroup && !this.isDucking) {
          this.bodyGroup.position.y = Math.abs(Math.sin(this.animTime)) * 0.075;
        }
        if (this.headGroup) {
          this.headGroup.rotation.x = Math.sin(this.animTime * 2) * 0.035;
        }
      }

      // Counterbalance each step with one continuous tail.
      this.tailGroup.rotation.y = Math.sin(this.animTime - 0.45) * 0.075;
      this.activeChar.tailMid.rotation.y = Math.sin(this.animTime - 0.8) * 0.06;
      this.activeChar.tailTip.rotation.y = Math.sin(this.animTime - 1.2) * 0.08;
      this.bodyGroup.rotation.z = Math.sin(this.animTime) * (this.isQuadruped ? 0.012 : 0.02);
      if (this.lowerJaw) this.lowerJaw.rotation.x = 0.15 + Math.sin(this.animTime * 0.5) * 0.025;

    } else if (this.state === Dino3DState.JUMPING) {
      if (this.isQuadruped) {
        if (this.frontLeft) this.frontLeft.rotation.x = 0.4;
        if (this.frontRight) this.frontRight.rotation.x = 0.4;
        if (this.backLeft) this.backLeft.rotation.x = -0.4;
        if (this.backRight) this.backRight.rotation.x = -0.4;
        this.activeChar.legs.forEach(leg => { leg.knee.rotation.x = 0.3; });
      } else {
        if (this.leftLeg) this.leftLeg.rotation.x = 0.45;
        if (this.rightLeg) this.rightLeg.rotation.x = 0.45;
        if (this.shinL) this.shinL.rotation.x = 0.55;
        if (this.shinR) this.shinR.rotation.x = 0.55;
      }
    } else {
      // Idle
      this.animTime += dt * 2.5;
      if (this.bodyGroup) this.bodyGroup.position.y = Math.sin(this.animTime) * 0.04;
    }

    this.activeChar.applyCrouch(this.duckAmount, this.animTime);
    this.updateBoundingBox();
  }

  updateBoundingBox() {
    if (this.isDucking) {
      this.box.setFromCenterAndSize(
        new THREE.Vector3(this.mesh.position.x, this.y + 1.1, this.mesh.position.z + 0.3),
        new THREE.Vector3(1.1, 1.3, 2.6)
      );
    } else if (this.state === Dino3DState.JUMPING) {
      this.box.setFromCenterAndSize(
        new THREE.Vector3(this.mesh.position.x, this.y + 1.95, this.mesh.position.z),
        new THREE.Vector3(1.0, 2.3, 2.1)
      );
    } else {
      this.box.setFromCenterAndSize(
        new THREE.Vector3(this.mesh.position.x, this.y + 1.7, this.mesh.position.z),
        new THREE.Vector3(1.0, 2.55, 2.2)
      );
    }
  }

  dispose() {
    const materials = new Set();
    this.mesh.traverse(object => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) materials.add(object.material);
      if (object.isSkinnedMesh) object.skeleton.dispose();
    });
    this.shadowMesh.material.map.dispose();
    materials.forEach(material => material.dispose());
    this.mesh.removeFromParent();
  }
}
