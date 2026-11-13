/**
 * Main Dino Game Engine
 * Orchestrates loop, state transitions, physics updates, input events, and rendering.
 */

import { Dino, DinoState } from './dino.js';
import { Horizon } from './horizon.js';
import { ObstacleManager } from './obstacles.js';
import { ScoreManager } from './score.js';
import { sound } from './audio.js';
import { SpriteSheet } from './sprites.js';

export const GameState = {
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  GAMEOVER: 'GAMEOVER',
};

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Virtual canvas logical dimensions
    this.width = 1000;
    this.height = 250;
    this.groundY = 210;

    // HiDPI setup
    this.setupResolution();

    // Theme and Sprites
    this.theme = 'light';
    this.spriteSheet = new SpriteSheet('#535353', false);

    // Subsystems
    this.dino = new Dino(this.groundY);
    this.horizon = new Horizon(this.width, this.groundY);
    this.obstacleManager = new ObstacleManager(this.width, this.groundY);
    this.scoreManager = new ScoreManager(sound);

    // Speed configuration
    this.initialSpeed = 6.0;
    this.maxSpeed = 13.5;
    this.currentSpeed = this.initialSpeed;

    // Game lifecycle state
    this.state = GameState.IDLE;
    this.lastFrameTime = performance.now();
    this.restartRect = { x: 0, y: 0, w: 36, h: 32 };

    // Bind event handlers
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.loop = this.loop.bind(this);

    this.initEvents();

    // Start render loop
    requestAnimationFrame(this.loop);
  }

  setupResolution() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.ctx.imageSmoothingEnabled = false;
  }

  setTheme(theme) {
    this.theme = theme;
    const isDark = theme === 'dark';
    const color = isDark ? '#acbac8' : '#535353';
    this.spriteSheet.setColorScheme(color, isDark);
    if (isDark) {
      document.body.classList.add('theme-dark');
    } else {
      document.body.classList.remove('theme-dark');
    }
  }

  start() {
    this.state = GameState.RUNNING;
    this.currentSpeed = this.initialSpeed;
    this.dino.reset();
    this.horizon.reset();
    this.obstacleManager.reset();
    this.scoreManager.reset();
  }

  restart() {
    this.start();
  }

  pause() {
    if (this.state === GameState.RUNNING) {
      this.state = GameState.PAUSED;
    } else if (this.state === GameState.PAUSED) {
      this.state = GameState.RUNNING;
      this.lastFrameTime = performance.now();
    }
  }

  gameOver() {
    this.state = GameState.GAMEOVER;
    this.dino.die();
    sound.playHit();
  }

  handleKeyDown(e) {
    // Jump: Space, ArrowUp, KeyW
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (this.state === GameState.IDLE) {
        this.start();
        if (this.dino.jump()) sound.playJump();
      } else if (this.state === GameState.GAMEOVER) {
        this.restart();
      } else if (this.state === GameState.RUNNING) {
        if (this.dino.jump()) sound.playJump();
      }
    }

    // Duck: ArrowDown, KeyS
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault();
      if (this.state === GameState.RUNNING) {
        this.dino.setDuck(true);
      }
    }

    // Pause: KeyP
    if (e.code === 'KeyP') {
      e.preventDefault();
      this.pause();
    }
  }

  handleKeyUp(e) {
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault();
      if (this.state === GameState.RUNNING) {
        this.dino.setDuck(false);
      }
    }
  }

  handlePointerDown(e) {
    if (this.state === GameState.IDLE) {
      this.start();
      if (this.dino.jump()) sound.playJump();
      return;
    }

    if (this.state === GameState.GAMEOVER) {
      this.restart();
      return;
    }

    if (this.state === GameState.RUNNING) {
      const rect = this.canvas.getBoundingClientRect();
      const scaleY = this.height / rect.height;
      const clickY = (e.clientY - rect.top) * scaleY;

      // Bottom 28% of canvas = duck, upper part = jump
      if (clickY > this.height * 0.72) {
        this.dino.setDuck(true);
      } else {
        if (this.dino.jump()) sound.playJump();
      }
    }
  }

  handlePointerUp() {
    if (this.state === GameState.RUNNING) {
      this.dino.setDuck(false);
    }
  }

  initEvents() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);

    window.addEventListener('resize', () => {
      this.setupResolution();
    });
  }

  update(deltaTime) {
    if (this.state !== GameState.RUNNING) return;

    // Speed progression
    const score = this.scoreManager.getScore();
    this.currentSpeed = Math.min(this.maxSpeed, this.initialSpeed + score * 0.0016);

    // Day/Night cycle every 700 points
    const cyclePos = score % 1400;
    const isNightTime = cyclePos >= 700;
    this.horizon.setNight(isNightTime);
    this.setTheme(isNightTime ? 'dark' : 'light');

    // Update entities
    this.dino.update(this.currentSpeed, deltaTime);
    this.horizon.update(this.currentSpeed, deltaTime);
    this.obstacleManager.update(this.currentSpeed, score, deltaTime);
    this.scoreManager.update(this.currentSpeed, deltaTime);

    // Collision check
    if (this.obstacleManager.checkCollision(this.dino)) {
      this.gameOver();
    }
  }

  draw() {
    // Clear Canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Draw Horizon (Ground, Clouds, Moon, Stars)
    this.horizon.draw(this.ctx, this.spriteSheet);

    // Draw Obstacles (Cacti, Birds)
    this.obstacleManager.draw(this.ctx, this.spriteSheet);

    // Draw Dino
    this.dino.draw(this.ctx, this.spriteSheet);

    // Draw Score in upper right (HI 00000  00000)
    this.scoreManager.draw(this.ctx, this.width, this.spriteSheet.color);

    // GAME OVER State overlay
    if (this.state === GameState.GAMEOVER) {
      this.ctx.save();

      // GAME OVER text
      if (this.spriteSheet.gameOverText) {
        const textX = Math.round((this.width - 220) / 2);
        const textY = 70;
        this.ctx.drawImage(this.spriteSheet.gameOverText, textX, textY);
      }

      // RESTART circular button
      if (this.spriteSheet.restartButton) {
        const btnX = Math.round((this.width - 36) / 2);
        const btnY = 100;
        this.restartRect = { x: btnX, y: btnY, w: 36, h: 32 };
        this.ctx.drawImage(this.spriteSheet.restartButton, btnX, btnY);
      }

      this.ctx.restore();
    }

    // PAUSED State overlay
    if (this.state === GameState.PAUSED) {
      this.ctx.save();
      this.ctx.fillStyle = this.spriteSheet.color;
      this.ctx.font = '14px monospace, "Courier New", sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('PAUSED', this.width / 2, 85);
      this.ctx.restore();
    }
  }

  loop(currentTime) {
    const elapsed = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;

    const deltaTime = Math.min(2.5, elapsed / 16.667);

    this.update(deltaTime);
    this.draw();

    requestAnimationFrame(this.loop);
  }
}
