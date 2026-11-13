/**
 * Main 3D Dino Game Engine with Three.js
 * Perspective: Behind-the-Dino Third-Person View (just like elgooG 3D Dino)
 */

import * as THREE from 'three';
import { Dino3D, Dino3DState } from './dino3d.js';
import { Obstacle3DManager } from './obstacles3d.js';
import { Environment3D } from './environment3d.js';
import { ScoreManager } from './score.js';
import { sound } from './audio.js';
import { OnlineRace } from './online-race.js';
import { applyInput, stepLateral, laneX, LANE_WIDTH, INITIAL_SPEED, MAX_SPEED, speedAt } from '../shared/race.js';

export const Game3DState = {
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  GAMEOVER: 'GAMEOVER',
};

export class Game3D {
  constructor(canvas, hudElements) {
    this.canvas = canvas;
    this.hud = hudElements;

    // Speeds
    this.initialSpeed = INITIAL_SPEED;
    this.maxSpeed = MAX_SPEED;
    this.currentSpeed = this.initialSpeed;

    // State
    this.state = Game3DState.IDLE;
    this.clock = new THREE.Clock();
    this.runElapsed = 0;
    this.runDistance = 0;
    this.runner = { alive: true, lane: 2, x: 0, laneMin: 1, laneMax: 3 };

    // 1. Three.js Scene, Camera, Renderer
    this.initThree();

    // 2. Game Entities
    this.dino = new Dino3D();
    this.scene.add(this.dino.mesh);

    this.environment = new Environment3D(this.scene);
    this.obstacleManager = new Obstacle3DManager(this.scene, 0x535353);

    // 3. Audio & Score
    this.scoreManager = new ScoreManager(sound);

    // 4. Input events
    this.bindEvents();
    this.online = new OnlineRace(this);

    // Start loop
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf7f7f7);
    this.scene.fog = new THREE.Fog(0xf7f7f7, 35, 115);

    // Perspective Camera: 3/4 Isometric tilted angle to show FULL Dino and clear runway/obstacles
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 200);

    // Camera preset angles (calibrated for the full majestic roaring T-Rex)
    this.cameraViews = [
      // View 0: 3/4 Left Tilt (Shows full profile: roaring open jaw, sharp teeth, spines, S-tail & obstacles)
      { pos: new THREE.Vector3(-7.8, 4.8, -8.6), lookAt: new THREE.Vector3(0.5, 1.6, 7.5) },
      // View 1: 3/4 Right Tilt
      { pos: new THREE.Vector3(7.8, 4.8, -8.6), lookAt: new THREE.Vector3(-0.5, 1.6, 7.5) },
      // View 2: Classic Behind
      { pos: new THREE.Vector3(0, 6, -14), lookAt: new THREE.Vector3(0, 2.0, 10.0) },
    ];
    this.currentViewIndex = 2;
    this.previewViews = [
      new THREE.Vector3(-6.4, 3.6, 7.4),
      new THREE.Vector3(6.4, 3.6, 7.4),
      new THREE.Vector3(-8.8, 3.8, 0.5),
    ];

    this.applyCameraView(this.currentViewIndex);

    // WebGL Renderer with High-DPI & Soft Shadows
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
  }

  cameraPose(index) {
    const view = this.cameraViews[index];
    const portrait = this.camera.aspect < .8;
    const preview = this.state === Game3DState.IDLE;
    const target = preview ? new THREE.Vector3(0, 1.6, .4)
      : portrait ? new THREE.Vector3(0, 1.6, -.7) : view.lookAt.clone();
    const position = (preview ? this.previewViews[index] : view.pos).clone();
    if (portrait) position.multiplyScalar(Math.max(1.3, .72 / this.camera.aspect));
    if (!preview) { position.x += this.runner.x; target.x += this.runner.x; }
    return { position, target };
  }

  applyCameraView(index) {
    if (this.online?.active) { this.online.updateCamera(1); return; }
    const { position, target } = this.cameraPose(index);
    this.camera.position.copy(position);
    this.cameraTarget = target;
    this.camera.lookAt(target);
  }

  followCamera(dt) {
    const { position, target } = this.cameraPose(this.currentViewIndex);
    const blend = 1 - Math.exp(-8 * dt);
    this.camera.position.lerp(position, blend);
    this.cameraTarget.lerp(target, blend);
    this.camera.lookAt(this.cameraTarget);
  }

  updateSky(seconds) {
    const sky = this.environment.setTimeOfDay(seconds, this.camera);
    const label = document.getElementById('sky-status');
    const speed = this.online?.active ? this.online.client.room?.speed ?? INITIAL_SPEED : this.currentSpeed;
    const text = `${sky.daylight > .2 ? '☀' : '☾'} ${sky.label} · ${(speed / INITIAL_SPEED).toFixed(1)}×`;
    if (label && label.textContent !== text) label.textContent = text;
  }

  switchCameraView() {
    if (this.online?.active) { this.online.cycleCamera(); return; }
    this.currentViewIndex = (this.currentViewIndex + 1) % this.cameraViews.length;
    this.applyCameraView(this.currentViewIndex);
  }

  start() {
    if (this.online?.active) return;
    this.state = Game3DState.RUNNING;
    Object.assign(this.runner, { alive: true, lane: 2, x: 0 });
    this.runElapsed = 0;
    this.runDistance = 0;
    this.dino.mesh.position.x = 0;
    this.scene.fog.near = 55; this.scene.fog.far = 185;
    this.camera.far = 260; this.camera.updateProjectionMatrix();
    this.online?.ui.collapse(true);
    this.applyCameraView(this.currentViewIndex);
    this.currentSpeed = this.initialSpeed;
    this.dino.reset();
    this.obstacleManager.reset();
    this.scoreManager.reset();

    if (this.hud.gameOverBox) this.hud.gameOverBox.style.display = 'none';
    if (this.hud.idleBox) this.hud.idleBox.style.display = 'none';
  }

  restart() {
    this.start();
  }

  pause() {
    if (this.online?.active) { this.online.ui.notify('Ván online vẫn tiếp tục, không thể tạm dừng.'); return; }
    if (this.state === Game3DState.RUNNING) {
      this.state = Game3DState.PAUSED;
      if (this.hud.pausedBox) this.hud.pausedBox.style.display = 'block';
    } else if (this.state === Game3DState.PAUSED) {
      this.state = Game3DState.RUNNING;
      this.clock.getDelta();
      if (this.hud.pausedBox) this.hud.pausedBox.style.display = 'none';
    }
  }

  gameOver() {
    this.state = Game3DState.GAMEOVER;
    this.dino.die();
    sound.playHit();
    if (this.hud.gameOverBox) this.hud.gameOverBox.style.display = 'flex';
  }

  jumpAction() {
    if (this.online?.active) { this.online.jump(); return; }
    if (this.state === Game3DState.IDLE || this.state === Game3DState.GAMEOVER) this.start();
    if (this.state === Game3DState.RUNNING && this.dino.jump()) sound.playJump();
  }

  moveLane(direction) {
    if (this.online?.active) { this.online.move(direction); return; }
    if (this.state === Game3DState.IDLE || this.state === Game3DState.GAMEOVER) this.start();
    if (this.state === Game3DState.RUNNING) applyInput(this.runner, { move: direction });
  }

  duckAction(value) {
    if (this.online?.active) { this.online.duck(value); return; }
    if (this.state === Game3DState.RUNNING || (!value && this.state === Game3DState.PAUSED)) this.dino.setDuck(value);
  }

  bindEvents() {
    window.addEventListener('keydown', e => {
      if (e.target.closest('input, textarea, select, button, [contenteditable]')) return;
      if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(e.code)) {
        e.preventDefault();
        if (!e.repeat) this.moveLane(e.code === 'ArrowLeft' || e.code === 'KeyA' ? -1 : 1);
      } else if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) {
        e.preventDefault(); if (!e.repeat) this.jumpAction();
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault(); clearTimeout(this.duckTimer); this.duckAction(true);
      } else if (e.code === 'KeyP') { e.preventDefault(); this.pause(); }
      else if (e.code === 'KeyV') { e.preventDefault(); this.switchCameraView(); }
    });
    window.addEventListener('keyup', e => {
      if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); this.duckAction(false); }
    });

    this.canvas.style.touchAction = 'none';
    window.addEventListener('pointerdown', e => {
      if (e.target.closest('button, a, input, form, #online-panel, #live-board')) return;
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        e.preventDefault();
        if (!this.gesture) this.gesture = { id: e.pointerId, x: e.clientX, y: e.clientY };
        return;
      }
      if (e.clientY / innerHeight > .72 && (this.online?.active || this.state === Game3DState.RUNNING)) this.duckAction(true);
      else this.jumpAction();
    });
    window.addEventListener('pointerup', e => {
      const gesture = this.gesture;
      if (gesture && e.pointerId === gesture.id) {
        this.gesture = null;
        const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
        const threshold = Math.max(24, Math.min(innerWidth, innerHeight) * .07);
        if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy)) this.moveLane(dx < 0 ? -1 : 1);
        else if (dy > threshold) {
          clearTimeout(this.duckTimer); this.duckAction(true);
          this.duckTimer = setTimeout(() => this.duckAction(false), 650);
        } else this.jumpAction();
      } else if (e.pointerType !== 'touch' && e.pointerType !== 'pen') this.duckAction(false);
    });
    window.addEventListener('pointercancel', () => { this.gesture = null; this.duckAction(false); });
    window.addEventListener('blur', () => { this.gesture = null; clearTimeout(this.duckTimer); this.duckAction(false); });

    // Resize
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.applyCameraView(this.currentViewIndex);
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Restart button in DOM
    if (this.hud.restartBtn) {
      this.hud.restartBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.restart();
      });
    }

    // Camera switch button in DOM
    if (this.hud.cameraBtn) {
      this.hud.cameraBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.switchCameraView();
        if (e.detail > 0) e.currentTarget.blur();
      });
    }

    // Dinosaur Roster Selector Buttons in DOM
    const dinoBtns = document.querySelectorAll('.dino-select-btn');
    dinoBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const type = btn.dataset.dino;
        this.selectDinosaur(type);
        if (e.detail > 0) btn.blur();
      });
    });

    // Restore saved dinosaur selection
    const savedDino = localStorage.getItem('dino_selected_type') || 'dark_rex';
    this.selectDinosaur(savedDino);
  }

  selectDinosaur(type) {
    if (this.online?.active) { this.online.selectSkin(type); return; }
    if (this.dino) {
      this.dino.setDinoType(type);
      try {
        localStorage.setItem('dino_selected_type', type);
      } catch {}

      const dinoBtns = document.querySelectorAll('.dino-select-btn');
      dinoBtns.forEach((btn) => {
        if (btn.dataset.dino === type) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }
  }

  updateHUD() {
    if (this.online?.active) return;
    if (!this.hud.scoreDisplay) return;

    const hi = this.scoreManager.highScore;
    const cur = this.scoreManager.isFlashing && !this.scoreManager.flashVisible
      ? ''
      : this.scoreManager.formatScore(this.scoreManager.isFlashing ? this.scoreManager.flashScore : this.scoreManager.currentScore);

    let text = '';
    if (hi > 0) {
      text += `<span class="hi-score">HI ${this.scoreManager.formatScore(hi)}</span>  `;
    }
    text += `<span class="cur-score">${cur}</span>`;
    this.hud.scoreDisplay.innerHTML = text;
  }

  update(dt) {
    if (this.online?.active) { this.online.update(dt); return; }
    if (this.state === Game3DState.IDLE) {
      this.dino.state = Dino3DState.IDLE;
      this.dino.update(0, dt);
      this.environment.update(0, dt);
      return;
    }
    if (this.state !== Game3DState.RUNNING) return;

    this.currentSpeed = speedAt(this.runDistance);
    this.runDistance += this.currentSpeed * 14 * dt;

    this.runElapsed += dt;
    stepLateral(this.runner, dt);
    this.dino.mesh.position.x = this.runner.x;

    // Update Dino, Obstacles, Environment, Score
    this.dino.update(this.currentSpeed, dt);
    this.dino.bodyGroup.rotation.z -= Math.max(-1, Math.min(1, (laneX(this.runner.lane) - this.runner.x) / LANE_WIDTH)) * .13;
    this.followCamera(dt);
    this.environment.update(this.currentSpeed, dt, this.runDistance);
    this.obstacleManager.update(this.currentSpeed, this.runDistance, dt);
    this.scoreManager.update(this.currentSpeed * 2.5, dt * 60);

    // Collision check
    if (this.obstacleManager.checkCollision(this.dino)) {
      this.gameOver();
    }
  }

  loop() {
    const dt = Math.min(this.clock.getDelta(), 0.1);

    this.update(dt);
    this.updateHUD();
    if (!this.online?.active) this.updateSky(this.runElapsed);

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  }
}
