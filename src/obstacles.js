/**
 * Obstacles Manager:
 * Handles Small Cacti, Large Cacti, and Pterodactyls (Birds) with accurate hitboxes and fair spawn intervals.
 */

export const ObstacleType = {
  CACTUS_SMALL: 'CACTUS_SMALL',
  CACTUS_LARGE: 'CACTUS_LARGE',
  PTERODACTYL: 'PTERODACTYL',
};

class Obstacle {
  constructor(type, x, groundY, count = 1, birdHeightLevel = 0) {
    this.type = type;
    this.x = x;
    this.count = count;
    this.birdHeightLevel = birdHeightLevel; // 0 = low (jump over), 1 = mid (duck under), 2 = high (fly over)
    this.animTimer = 0;
    this.animFrame = 0;

    if (type === ObstacleType.CACTUS_SMALL) {
      this.width = 17 * count;
      this.height = 35;
      this.y = groundY - this.height;
    } else if (type === ObstacleType.CACTUS_LARGE) {
      this.width = 25 * count;
      this.height = 50;
      this.y = groundY - this.height;
    } else if (type === ObstacleType.PTERODACTYL) {
      this.width = 46;
      this.height = 40;
      // 3 flight elevations relative to ground
      // Level 0: Low (y ~ ground - 42) -> Must JUMP
      // Level 1: Mid (y ~ ground - 68) -> Must DUCK
      // Level 2: High (y ~ ground - 96) -> Safe walking under
      if (birdHeightLevel === 0) {
        this.y = groundY - 42;
      } else if (birdHeightLevel === 1) {
        this.y = groundY - 68;
      } else {
        this.y = groundY - 96;
      }
    }
  }

  update(gameSpeed, deltaTime = 1) {
    this.x -= gameSpeed * deltaTime;

    // Bird flight animation
    if (this.type === ObstacleType.PTERODACTYL) {
      this.animTimer += deltaTime;
      if (this.animTimer > 9) {
        this.animTimer = 0;
        this.animFrame = this.animFrame === 0 ? 1 : 0;
      }
    }
  }

  getHitboxes() {
    if (this.type === ObstacleType.CACTUS_SMALL) {
      return [
        { x: this.x + 2, y: this.y + 4, w: this.width - 4, h: this.height - 4 },
      ];
    } else if (this.type === ObstacleType.CACTUS_LARGE) {
      return [
        { x: this.x + 4, y: this.y + 4, w: this.width - 8, h: this.height - 4 },
      ];
    } else {
      // Pterodactyl hitboxes: beak + body + wings
      return [
        // Head & beak
        { x: this.x + 2, y: this.y + 12, w: 16, h: 10 },
        // Main body
        { x: this.x + 16, y: this.y + 14, w: 20, h: 12 },
        // Wings (upper or lower depending on frame)
        this.animFrame === 0
          ? { x: this.x + 16, y: this.y + 2, w: 12, h: 14 }
          : { x: this.x + 16, y: this.y + 20, w: 12, h: 16 },
      ];
    }
  }

  draw(ctx, spriteSheet) {
    let sprite;
    if (this.type === ObstacleType.CACTUS_SMALL) {
      if (this.count === 1) sprite = spriteSheet.cactusSmall1;
      else if (this.count === 2) sprite = spriteSheet.cactusSmall2;
      else sprite = spriteSheet.cactusSmall3;
    } else if (this.type === ObstacleType.CACTUS_LARGE) {
      if (this.count === 1) sprite = spriteSheet.cactusLarge1;
      else if (this.count === 2) sprite = spriteSheet.cactusLarge2;
      else sprite = spriteSheet.cactusLarge3;
    } else if (this.type === ObstacleType.PTERODACTYL) {
      sprite = this.animFrame === 0 ? spriteSheet.pterodactyl1 : spriteSheet.pterodactyl2;
    }

    if (sprite) {
      ctx.drawImage(sprite, Math.round(this.x), Math.round(this.y));
    }
  }
}

export class ObstacleManager {
  constructor(canvasWidth, groundY) {
    this.canvasWidth = canvasWidth;
    this.groundY = groundY;
    this.obstacles = [];
    this.nextSpawnDistance = 0;
  }

  reset() {
    this.obstacles = [];
    this.nextSpawnDistance = 400; // Safe distance before first obstacle
  }

  update(gameSpeed, currentScore, deltaTime = 1) {
    // Move existing obstacles
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.update(gameSpeed, deltaTime);

      if (obs.x + obs.width < -30) {
        this.obstacles.splice(i, 1);
      }
    }

    // Decrease spawn distance countdown
    this.nextSpawnDistance -= gameSpeed * deltaTime;

    // Check if ready to spawn new obstacle
    if (this.nextSpawnDistance <= 0) {
      this.spawnObstacle(currentScore, gameSpeed);
    }
  }

  spawnObstacle(currentScore, gameSpeed) {
    // Can spawn Pterodactyls if score >= 350
    const allowBirds = currentScore >= 350;
    const isBird = allowBirds && Math.random() < 0.35;

    let obs;
    if (isBird) {
      // Pick random height level:
      // 0: low (jump over), 1: mid (duck under), 2: high (walk under)
      const rand = Math.random();
      const heightLevel = rand < 0.4 ? 0 : (rand < 0.8 ? 1 : 2);
      obs = new Obstacle(ObstacleType.PTERODACTYL, this.canvasWidth + 20, this.groundY, 1, heightLevel);
    } else {
      // Cactus
      const isLarge = Math.random() < 0.45;
      const countRand = Math.random();
      let count = 1;
      if (countRand > 0.82) count = 3;
      else if (countRand > 0.55) count = 2;

      const type = isLarge ? ObstacleType.CACTUS_LARGE : ObstacleType.CACTUS_SMALL;
      obs = new Obstacle(type, this.canvasWidth + 20, this.groundY, count);
    }

    this.obstacles.push(obs);

    // Compute fair minimum gap based on player speed and jump arc
    // A faster speed requires a wider gap for the player to touch ground and jump again
    const minGap = Math.round(obs.width + gameSpeed * 28 + 140);
    const maxGap = Math.round(minGap * 1.7 + Math.random() * 150);
    this.nextSpawnDistance = Math.floor(minGap + Math.random() * (maxGap - minGap));
  }

  checkCollision(dino) {
    const dinoBoxes = dino.getHitboxes();

    for (const obs of this.obstacles) {
      const obsBoxes = obs.getHitboxes();

      for (const dBox of dinoBoxes) {
        for (const oBox of obsBoxes) {
          if (
            dBox.x < oBox.x + oBox.w &&
            dBox.x + dBox.w > oBox.x &&
            dBox.y < oBox.y + oBox.h &&
            dBox.y + dBox.h > oBox.y
          ) {
            return true; // Collision detected!
          }
        }
      }
    }
    return false;
  }

  draw(ctx, spriteSheet) {
    for (const obs of this.obstacles) {
      obs.draw(ctx, spriteSheet);
    }
  }
}
