/**
 * Dino (T-Rex) entity
 * Handles movement, jumping physics, ducking, animation frames, and multi-box collision detection.
 */

export const DinoState = {
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  JUMPING: 'JUMPING',
  DUCKING: 'DUCKING',
  DEAD: 'DEAD',
};

export class Dino {
  constructor(groundY) {
    this.groundY = groundY; // Baseline where dino feet touch the ground

    // Position & dimensions
    this.x = 50;
    this.y = this.groundY - 47;
    this.width = 44;
    this.height = 47;

    // Movement & physics
    this.vy = 0;
    this.jumpForce = -12.5;
    this.gravity = 0.6;
    this.dropForce = 1.6; // Fast drop when pressing down mid-air

    // State & animation
    this.state = DinoState.IDLE;
    this.animTimer = 0;
    this.animFrame = 0; // 0 or 1
    this.isDucking = false;
    this.jumpRequested = false;
    this.jumpHoldTimer = 0;
  }

  reset() {
    this.y = this.groundY - 47;
    this.width = 44;
    this.height = 47;
    this.vy = 0;
    this.state = DinoState.RUNNING;
    this.animTimer = 0;
    this.animFrame = 0;
    this.isDucking = false;
    this.jumpRequested = false;
    this.jumpHoldTimer = 0;
  }

  jump() {
    if (this.state === DinoState.DEAD) return false;
    if (this.y >= this.groundY - 47 - 0.5) {
      this.vy = this.jumpForce;
      this.state = DinoState.JUMPING;
      this.isDucking = false;
      this.width = 44;
      this.height = 47;
      return true; // Successfully initiated jump (trigger sound)
    }
    return false;
  }

  setDuck(ducking) {
    if (this.state === DinoState.DEAD) return;

    if (ducking) {
      if (this.state === DinoState.JUMPING) {
        // Fast drop downward
        this.vy += this.dropForce;
      } else {
        this.isDucking = true;
        this.state = DinoState.DUCKING;
        this.width = 59;
        this.height = 26;
        this.y = this.groundY - 26;
      }
    } else {
      if (this.isDucking) {
        this.isDucking = false;
        this.width = 44;
        this.height = 47;
        this.y = this.groundY - 47;
        if (this.state !== DinoState.JUMPING) {
          this.state = DinoState.RUNNING;
        }
      }
    }
  }

  die() {
    this.state = DinoState.DEAD;
  }

  update(gameSpeed, deltaTime = 1) {
    if (this.state === DinoState.DEAD) return;

    // Jumping physics
    if (this.state === DinoState.JUMPING) {
      this.vy += this.gravity * deltaTime;
      this.y += this.vy * deltaTime;

      // Landing check
      const baseHeight = this.isDucking ? 26 : 47;
      if (this.y >= this.groundY - baseHeight) {
        this.y = this.groundY - baseHeight;
        this.vy = 0;
        this.state = this.isDucking ? DinoState.DUCKING : DinoState.RUNNING;
      }
    }

    // Animation frame cycling (faster with higher game speed)
    if (this.state === DinoState.RUNNING || this.state === DinoState.DUCKING) {
      this.animTimer += (gameSpeed / 6) * deltaTime;
      if (this.animTimer >= 8) {
        this.animTimer = 0;
        this.animFrame = this.animFrame === 0 ? 1 : 0;
      }
    }
  }

  /**
   * Accurate Multi-Box Collision Detection
   * Prevents unfair deaths from empty spaces around the dino sprite
   */
  getHitboxes() {
    if (this.state === DinoState.DUCKING) {
      // Ducking hitboxes: lower and wider
      return [
        // Head & snout
        { x: this.x + 36, y: this.y + 4, w: 23, h: 12 },
        // Mid body
        { x: this.x + 14, y: this.y + 8, w: 24, h: 14 },
        // Tail
        { x: this.x + 2, y: this.y + 10, w: 12, h: 10 },
      ];
    } else {
      // Standing / Running / Jumping hitboxes
      return [
        // Head & jaw
        { x: this.x + 22, y: this.y + 0, w: 20, h: 16 },
        // Torso
        { x: this.x + 12, y: this.y + 16, w: 18, h: 18 },
        // Small chest / arm
        { x: this.x + 30, y: this.y + 22, w: 8, h: 8 },
        // Legs / lower body
        { x: this.x + 14, y: this.y + 34, w: 16, h: 12 },
      ];
    }
  }

  draw(ctx, spriteSheet) {
    let sprite;

    if (this.state === DinoState.DEAD) {
      sprite = spriteSheet.dinoDead;
    } else if (this.state === DinoState.JUMPING) {
      sprite = spriteSheet.dinoJump;
    } else if (this.state === DinoState.DUCKING) {
      sprite = this.animFrame === 0 ? spriteSheet.dinoDuck1 : spriteSheet.dinoDuck2;
    } else if (this.state === DinoState.RUNNING) {
      sprite = this.animFrame === 0 ? spriteSheet.dinoRun1 : spriteSheet.dinoRun2;
    } else {
      // IDLE
      sprite = spriteSheet.dinoIdle;
    }

    if (sprite) {
      ctx.drawImage(sprite, Math.round(this.x), Math.round(this.y));
    }
  }
}
