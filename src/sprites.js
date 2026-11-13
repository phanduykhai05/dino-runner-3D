/**
 * Pixel-perfect sprite renderer for Dino Runner
 * Sprites are rendered dynamically to offscreen canvases for maximum sharpness (HiDPI/Retina ready)
 * and 60 FPS performance without any external image files.
 */

function createOffscreen(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function drawPixelRects(ctx, rects, color) {
  ctx.fillStyle = color;
  for (const [x, y, w, h] of rects) {
    ctx.fillRect(x, y, w, h);
  }
}

export class SpriteSheet {
  constructor(color = '#535353', dark = false) {
    this.setColorScheme(color, dark);
  }

  setColorScheme(color, dark = false) {
    this.color = color;
    this.bgColor = dark ? '#202124' : '#ffffff';
    this.eyeColor = dark ? '#202124' : '#ffffff';
    this.initSprites();
  }

  initSprites() {
    this.dinoIdle = this.createDinoStanding(0);
    this.dinoRun1 = this.createDinoStanding(1);
    this.dinoRun2 = this.createDinoStanding(2);
    this.dinoJump = this.createDinoStanding(0);
    this.dinoDead = this.createDinoStanding(3);

    this.dinoDuck1 = this.createDinoDucking(1);
    this.dinoDuck2 = this.createDinoDucking(2);

    this.cactusSmall1 = this.createCactusSmall(1);
    this.cactusSmall2 = this.createCactusSmall(2);
    this.cactusSmall3 = this.createCactusSmall(3);

    this.cactusLarge1 = this.createCactusLarge(1);
    this.cactusLarge2 = this.createCactusLarge(2);
    this.cactusLarge3 = this.createCactusLarge(3);

    this.pterodactyl1 = this.createPterodactyl(1);
    this.pterodactyl2 = this.createPterodactyl(2);

    this.cloud = this.createCloud();
    this.moonPhases = this.createMoonPhases();
    this.star1 = this.createStar(1);
    this.star2 = this.createStar(2);

    this.groundTile = this.createGroundTile();
    this.restartButton = this.createRestartButton();
    this.gameOverText = this.createGameOverText();
  }

  // T-Rex Standing / Running / Jump / Dead (44 x 47)
  createDinoStanding(legState = 0) {
    const w = 44;
    const h = 47;
    const { canvas, ctx } = createOffscreen(w, h);

    const bodyRects = [
      // Head & snout
      [22, 0, 22, 16],
      [22, 16, 20, 2],
      [42, 2, 2, 6],
      // Neck & back
      [18, 16, 14, 16],
      [14, 18, 8, 18],
      // Tail
      [0, 26, 4, 4],
      [2, 24, 6, 6],
      [6, 22, 8, 8],
      [10, 20, 8, 12],
      // Torso & small arm
      [22, 20, 10, 14],
      [32, 26, 6, 2],
      [36, 28, 2, 3],
    ];

    drawPixelRects(ctx, bodyRects, this.color);

    // Eye
    if (legState === 3) {
      // Dead Eye: Shocked open eye with pupil (or X)
      ctx.fillStyle = this.eyeColor;
      ctx.fillRect(27, 4, 5, 5);
      ctx.fillStyle = this.color;
      // Draw X
      ctx.fillRect(27, 4, 1, 1);
      ctx.fillRect(31, 4, 1, 1);
      ctx.fillRect(29, 6, 1, 1);
      ctx.fillRect(27, 8, 1, 1);
      ctx.fillRect(31, 8, 1, 1);
    } else {
      // Normal eye
      ctx.fillStyle = this.eyeColor;
      ctx.fillRect(27, 4, 4, 4);
      ctx.fillStyle = this.color;
      ctx.fillRect(27, 4, 2, 2);
    }

    // Legs:
    ctx.fillStyle = this.color;
    if (legState === 0 || legState === 3) {
      // Both legs standing
      ctx.fillRect(16, 36, 4, 7);
      ctx.fillRect(16, 43, 6, 4);
      ctx.fillRect(24, 36, 4, 7);
      ctx.fillRect(24, 43, 6, 4);
    } else if (legState === 1) {
      // Left leg back, right leg down
      ctx.fillRect(16, 36, 4, 4);
      ctx.fillRect(14, 40, 4, 3);
      ctx.fillRect(24, 36, 4, 7);
      ctx.fillRect(24, 43, 7, 4);
    } else if (legState === 2) {
      // Left leg down, right leg back
      ctx.fillRect(16, 36, 4, 7);
      ctx.fillRect(16, 43, 7, 4);
      ctx.fillRect(24, 36, 4, 4);
      ctx.fillRect(26, 40, 4, 3);
    }

    return canvas;
  }

  // T-Rex Ducking (59 x 26)
  createDinoDucking(frame = 1) {
    const w = 59;
    const h = 26;
    const { canvas, ctx } = createOffscreen(w, h);

    const bodyRects = [
      [36, 4, 23, 10],
      [36, 14, 18, 2],
      [14, 8, 24, 9],
      [0, 10, 4, 3],
      [2, 9, 6, 4],
      [6, 8, 8, 6],
      [42, 16, 5, 2],
      [45, 18, 2, 2],
    ];

    drawPixelRects(ctx, bodyRects, this.color);

    // Eye
    ctx.fillStyle = this.eyeColor;
    ctx.fillRect(44, 6, 3, 3);
    ctx.fillStyle = this.color;
    ctx.fillRect(44, 6, 2, 2);

    // Legs
    ctx.fillStyle = this.color;
    if (frame === 1) {
      ctx.fillRect(18, 17, 4, 5);
      ctx.fillRect(18, 22, 6, 4);
      ctx.fillRect(28, 17, 4, 3);
      ctx.fillRect(30, 20, 4, 3);
    } else {
      ctx.fillRect(18, 17, 4, 3);
      ctx.fillRect(16, 20, 4, 3);
      ctx.fillRect(28, 17, 4, 5);
      ctx.fillRect(28, 22, 6, 4);
    }

    return canvas;
  }

  // Small Cactus (single: 17x35)
  createCactusSmall(count = 1) {
    const singleW = 17;
    const h = 35;
    const w = singleW * count;
    const { canvas, ctx } = createOffscreen(w, h);

    ctx.fillStyle = this.color;

    for (let i = 0; i < count; i++) {
      const offsetX = i * singleW;
      const rects = [
        [offsetX + 6, 0, 5, 35],
        [offsetX + 7, 0, 3, 1],
        [offsetX + 1, 10, 3, 12],
        [offsetX + 1, 19, 7, 3],
        [offsetX + 13, 6, 3, 13],
        [offsetX + 9, 16, 6, 3],
      ];
      drawPixelRects(ctx, rects, this.color);
    }

    return canvas;
  }

  // Large Cactus (single: 25x50)
  createCactusLarge(count = 1) {
    const singleW = 25;
    const h = 50;
    const w = singleW * count;
    const { canvas, ctx } = createOffscreen(w, h);

    ctx.fillStyle = this.color;

    for (let i = 0; i < count; i++) {
      const offsetX = i * singleW;
      const rects = [
        [offsetX + 9, 0, 7, 50],
        [offsetX + 10, 0, 5, 2],
        [offsetX + 1, 12, 4, 18],
        [offsetX + 1, 26, 10, 4],
        [offsetX + 20, 8, 4, 20],
        [offsetX + 14, 24, 8, 4],
      ];
      drawPixelRects(ctx, rects, this.color);
    }

    return canvas;
  }

  // Pterodactyl (46x40)
  createPterodactyl(frame = 1) {
    const w = 46;
    const h = 40;
    const { canvas, ctx } = createOffscreen(w, h);

    ctx.fillStyle = this.color;
    const bodyRects = [
      [0, 16, 12, 3],
      [4, 19, 8, 2],
      [12, 14, 10, 6],
      [14, 11, 4, 3],
      [18, 18, 16, 6],
      [22, 22, 10, 4],
      [34, 19, 8, 3],
    ];
    drawPixelRects(ctx, bodyRects, this.color);

    // Eye
    ctx.fillStyle = this.eyeColor;
    ctx.fillRect(10, 15, 2, 2);

    ctx.fillStyle = this.color;
    if (frame === 1) {
      // Wings UP
      const wingUp = [
        [16, 2, 6, 14],
        [20, 0, 6, 10],
        [24, 0, 4, 6],
        [14, 6, 4, 10],
        [20, 24, 5, 4],
      ];
      drawPixelRects(ctx, wingUp, this.color);
    } else {
      // Wings DOWN
      const wingDown = [
        [16, 22, 6, 14],
        [20, 24, 6, 12],
        [24, 26, 4, 8],
        [14, 20, 4, 8],
        [20, 14, 5, 4],
      ];
      drawPixelRects(ctx, wingDown, this.color);
    }

    return canvas;
  }

  // Cloud (46 x 14)
  createCloud() {
    const w = 46;
    const h = 14;
    const { canvas, ctx } = createOffscreen(w, h);
    const cloudRects = [
      [8, 2, 30, 10],
      [14, 0, 18, 4],
      [2, 6, 42, 6],
      [0, 8, 46, 4],
    ];
    drawPixelRects(ctx, cloudRects, this.color);
    return canvas;
  }

  createMoonPhases() {
    const phases = [];
    for (let p = 0; p < 7; p++) {
      const { canvas, ctx } = createOffscreen(20, 40);
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(10, 20, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = this.bgColor;
      ctx.beginPath();
      const offset = (p - 3) * 4;
      ctx.arc(10 + offset, 20, 10, 0, Math.PI * 2);
      ctx.fill();

      phases.push(canvas);
    }
    return phases;
  }

  createStar(type = 1) {
    const { canvas, ctx } = createOffscreen(9, 9);
    ctx.fillStyle = this.color;
    if (type === 1) {
      ctx.fillRect(4, 1, 1, 7);
      ctx.fillRect(1, 4, 7, 1);
      ctx.fillRect(3, 3, 3, 3);
    } else {
      ctx.fillRect(4, 2, 1, 5);
      ctx.fillRect(2, 4, 5, 1);
    }
    return canvas;
  }

  // Ground repeating pattern (1200 x 18)
  createGroundTile() {
    const w = 1200;
    const h = 18;
    const { canvas, ctx } = createOffscreen(w, h);

    ctx.fillStyle = this.color;

    // Horizon main baseline (y = 0) with characteristic pixel gaps
    for (let x = 0; x < w; x += 4) {
      if (x % 59 !== 0 && x % 137 !== 0) {
        ctx.fillRect(x, 0, 3, 1);
      }
    }

    // Bumps, rocks, pebbles below baseline
    const pebbleOffsets = [
      12, 35, 78, 110, 145, 190, 230, 275, 310, 350, 400, 440, 480, 520,
      570, 615, 660, 705, 750, 800, 845, 890, 930, 980, 1030, 1080, 1130, 1170
    ];

    for (const x of pebbleOffsets) {
      ctx.fillRect(x, 2, 4, 1);
      ctx.fillRect(x + 5, 4, 2, 1);
      ctx.fillRect(x + 10, 6, 3, 1);
      if (x % 2 === 0) {
        ctx.fillRect(x + 18, 3, 2, 1);
        ctx.fillRect(x + 24, 7, 4, 1);
      }
    }

    return canvas;
  }

  // Restart Button (36 x 32 circular replay arrow) - Pixel perfect
  createRestartButton() {
    const w = 36;
    const h = 32;
    const { canvas, ctx } = createOffscreen(w, h);

    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.arc(18, 16, 10.5, Math.PI * 0.28, Math.PI * 1.82, false);
    ctx.stroke();

    // Arrow tip
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(25, 4);
    ctx.lineTo(29, 12);
    ctx.lineTo(20, 11);
    ctx.closePath();
    ctx.fill();

    return canvas;
  }

  // GAME OVER text (220 x 16)
  createGameOverText() {
    const w = 220;
    const h = 16;
    const { canvas, ctx } = createOffscreen(w, h);

    ctx.fillStyle = this.color;
    ctx.font = '11px "Press Start 2P", monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('G A M E   O V E R', w / 2, h / 2);

    return canvas;
  }
}
