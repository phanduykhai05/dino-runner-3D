/**
 * Horizon environment:
 * - Endless scrolling ground
 * - Parallax moving clouds
 * - Night mode with Moon phases and twinkling stars
 */

export class Horizon {
  constructor(canvasWidth, groundY) {
    this.canvasWidth = canvasWidth;
    this.groundY = groundY;

    // Ground scrolling coordinates
    this.groundX1 = 0;
    this.groundX2 = 1200;
    this.groundWidth = 1200;

    // Clouds
    this.clouds = [];
    this.cloudTimer = 0;
    this.cloudInterval = 180;

    // Night elements (Stars & Moon)
    this.isNight = false;
    this.nightAlpha = 0;
    this.moonX = canvasWidth + 50;
    this.moonY = 40;
    this.moonPhase = 0;
    this.stars = [];
    this.starTwinkleTimer = 0;

    this.initStars();
  }

  initStars() {
    this.stars = [];
    const count = 6;
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * this.canvasWidth,
        y: 20 + Math.random() * 80,
        type: Math.random() > 0.5 ? 1 : 2,
        twinkle: Math.random() > 0.5,
      });
    }
  }

  reset() {
    this.groundX1 = 0;
    this.groundX2 = this.groundWidth;
    this.clouds = [];
    this.isNight = false;
    this.nightAlpha = 0;
    this.moonX = this.canvasWidth + 50;
    this.initStars();
  }

  setNight(night) {
    this.isNight = night;
    if (night && this.moonX > this.canvasWidth) {
      this.moonX = this.canvasWidth - 90;
      this.moonPhase = (this.moonPhase + 1) % 7;
      this.initStars();
    }
  }

  update(gameSpeed, deltaTime = 1) {
    // 1. Scroll ground
    this.groundX1 -= gameSpeed * deltaTime;
    this.groundX2 -= gameSpeed * deltaTime;

    if (this.groundX1 <= -this.groundWidth) {
      this.groundX1 = this.groundX2 + this.groundWidth;
    }
    if (this.groundX2 <= -this.groundWidth) {
      this.groundX2 = this.groundX1 + this.groundWidth;
    }

    // 2. Clouds parallax
    this.cloudTimer += deltaTime;
    if (this.cloudTimer > this.cloudInterval && this.clouds.length < 4) {
      this.cloudTimer = 0;
      if (Math.random() > 0.4) {
        this.clouds.push({
          x: this.canvasWidth + 20,
          y: 25 + Math.random() * 70,
          speed: 0.8 + Math.random() * 0.4,
        });
      }
    }

    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.x -= c.speed * deltaTime;
      if (c.x < -60) {
        this.clouds.splice(i, 1);
      }
    }

    // 3. Night transition & stars
    if (this.isNight) {
      this.nightAlpha = Math.min(1, this.nightAlpha + 0.02 * deltaTime);
      this.moonX -= 0.15 * deltaTime;
      if (this.moonX < -40) {
        this.moonX = this.canvasWidth + 40;
      }

      this.starTwinkleTimer += deltaTime;
      if (this.starTwinkleTimer > 30) {
        this.starTwinkleTimer = 0;
        this.stars.forEach(s => {
          if (Math.random() > 0.6) s.twinkle = !s.twinkle;
        });
      }
    } else {
      this.nightAlpha = Math.max(0, this.nightAlpha - 0.02 * deltaTime);
    }
  }

  draw(ctx, spriteSheet) {
    // Draw Stars & Moon if night
    if (this.nightAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.nightAlpha;

      for (const star of this.stars) {
        const starSprite = (star.type === 1 && !star.twinkle) ? spriteSheet.star1 : spriteSheet.star2;
        if (starSprite) {
          ctx.drawImage(starSprite, Math.round(star.x), Math.round(star.y));
        }
      }

      if (spriteSheet.moonPhases && spriteSheet.moonPhases[this.moonPhase]) {
        ctx.drawImage(spriteSheet.moonPhases[this.moonPhase], Math.round(this.moonX), Math.round(this.moonY));
      }

      ctx.restore();
    }

    // Draw Clouds
    for (const cloud of this.clouds) {
      if (spriteSheet.cloud) {
        ctx.drawImage(spriteSheet.cloud, Math.round(cloud.x), Math.round(cloud.y));
      }
    }

    // Draw Ground - baseline aligns exactly at groundY
    if (spriteSheet.groundTile) {
      ctx.drawImage(spriteSheet.groundTile, Math.round(this.groundX1), this.groundY);
      ctx.drawImage(spriteSheet.groundTile, Math.round(this.groundX2), this.groundY);
    }
  }
}
