/**
 * Score system:
 * - Distance-based score counting
 * - 5-digit zero-padded retro display (e.g., 00128)
 * - Persistent High Score (HI) saved to localStorage
 * - Flashing score and sound effect every 100 points
 */

const STORAGE_KEY_HIGH_SCORE = 'dino_runner_high_score';
const STORAGE_KEY_GAMES_PLAYED = 'dino_runner_games_count';

export class ScoreManager {
  constructor(sound) {
    this.sound = sound;
    this.currentScore = 0;
    this.highScore = this.loadHighScore();
    this.gamesPlayed = this.loadGamesPlayed();

    // 100-point milestone flashing effect
    this.isFlashing = false;
    this.flashScore = 0;
    this.flashTimer = 0;
    this.flashVisible = true;
    this.lastMilestone = 0;
  }

  loadHighScore() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_HIGH_SCORE);
      return saved ? parseInt(saved, 10) || 0 : 0;
    } catch {
      return 0;
    }
  }

  loadGamesPlayed() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_GAMES_PLAYED);
      return saved ? parseInt(saved, 10) || 0 : 0;
    } catch {
      return 0;
    }
  }

  recordGameStart() {
    this.gamesPlayed++;
    try {
      localStorage.setItem(STORAGE_KEY_GAMES_PLAYED, this.gamesPlayed.toString());
    } catch {
      // Ignore
    }
  }

  reset() {
    this.currentScore = 0;
    this.isFlashing = false;
    this.flashTimer = 0;
    this.flashVisible = true;
    this.lastMilestone = 0;
    this.recordGameStart();
  }

  update(gameSpeed, deltaTime = 1) {
    // Score increases with speed
    this.currentScore += (gameSpeed * 0.025) * deltaTime;
    const scoreInt = Math.floor(this.currentScore);

    // Check for 100-point milestone
    if (scoreInt > 0 && scoreInt % 100 === 0 && scoreInt !== this.lastMilestone) {
      this.lastMilestone = scoreInt;
      this.isFlashing = true;
      this.flashScore = scoreInt;
      this.flashTimer = 0;
      this.flashVisible = true;
      if (this.sound) {
        this.sound.playScore();
      }
    }

    // Handle score flashing
    if (this.isFlashing) {
      this.flashTimer += deltaTime;
      // Blink on/off every 10 frames
      this.flashVisible = Math.floor(this.flashTimer / 10) % 2 === 0;

      // Stop flashing after ~60 frames
      if (this.flashTimer > 60) {
        this.isFlashing = false;
        this.flashVisible = true;
      }
    }

    // High score update
    if (scoreInt > this.highScore) {
      this.highScore = scoreInt;
      try {
        localStorage.setItem(STORAGE_KEY_HIGH_SCORE, this.highScore.toString());
      } catch {
        // Ignore
      }
    }
  }

  getScore() {
    return Math.floor(this.currentScore);
  }

  formatScore(val) {
    const s = Math.floor(val).toString();
    return s.padStart(5, '0');
  }

  draw(ctx, canvasWidth, color = '#535353') {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = '13px "Press Start 2P", monospace, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';

    const rightMargin = canvasWidth - 15;
    const scoreY = 16;

    // High score string (e.g. "HI 00450")
    if (this.highScore > 0) {
      ctx.globalAlpha = 0.65;
      const hiText = `HI ${this.formatScore(this.highScore)}`;
      ctx.fillText(hiText, rightMargin - 95, scoreY);
      ctx.globalAlpha = 1.0;
    }

    // Current score (or flashing milestone)
    if (this.isFlashing) {
      if (this.flashVisible) {
        ctx.fillText(this.formatScore(this.flashScore), rightMargin, scoreY);
      }
    } else {
      ctx.fillText(this.formatScore(this.currentScore), rightMargin, scoreY);
    }

    ctx.restore();
  }
}
