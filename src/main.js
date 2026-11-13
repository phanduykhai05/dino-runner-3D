/**
 * 3D Dino Game Bootstrap
 */

import { Game3D } from './game3d.js';
import { loadDinosaurModels } from './dino_models.js';
import { loadBirdModel } from './bird3d.js';

window.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('game-canvas');
  const hudElements = {
    scoreDisplay: document.getElementById('score-display'),
    idleBox: document.getElementById('idle-prompt'),
    gameOverBox: document.getElementById('game-over-box'),
    pausedBox: document.getElementById('paused-box'),
    restartBtn: document.getElementById('btn-restart'),
    cameraBtn: document.getElementById('btn-camera-view'),
  };

  if (canvas) {
    const prompt = hudElements.idleBox.querySelector('p');
    let loadingFailed = false;
    try {
      prompt.textContent = 'Đang tải mô hình 3D…';
      let loaded = 0;
      const onLoaded = () => {
        loaded++;
        if (!loadingFailed) prompt.textContent = `Đang tải mô hình 3D… ${loaded}/5`;
      };
      await Promise.all([loadDinosaurModels(onLoaded), loadBirdModel().then(onLoaded)]);
      new Game3D(canvas, hudElements);
      prompt.textContent = 'BẤM SPACE HOẶC CHẠM ĐỂ CHƠI';
    } catch (error) {
      loadingFailed = true;
      console.error('Model loading failed', error);
      prompt.textContent = 'Không tải được mô hình. Tải lại trang để thử lại.';
    }
  }
});
