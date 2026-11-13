import * as THREE from 'three';
import { Dino3D } from './dino3d.js';
import { Obstacle3D } from './obstacles3d.js';
import { RoomClient } from './room-client.js';
import { OnlineUI } from './online-ui.js';
import { LANE_COLORS, laneX, TRAIN_SPEED } from '../shared/race.js';
import { sound } from './audio.js';

export class OnlineRace {
  constructor(game) {
    this.game = game;
    this.client = new RoomClient();
    this.ui = new OnlineUI(game, this.client);
    this.active = false;
    this.actors = new Map();
    this.obstacles = new Map();
    this.labels = new Map();
    this.round = -1;
    this.watchId = null;
    this.cameraMode = 0;
    this.anchor = 0;
    this.client.addEventListener('room', () => this.sync());
    this.client.addEventListener('left', () => this.leaveScene());
  }

  sync() {
    const room = this.client.room;
    if (!room) return;
    const game = this.game;
    const localId = this.client.session.id;
    if (!this.active) {
      this.active = true;
      game.state = 'ONLINE';
      game.obstacleManager.reset();
      game.environment.setLaneCount(5);
      game.scene.fog.near = 70;
      game.scene.fog.far = 240;
      game.camera.far = 320;
      game.camera.updateProjectionMatrix();
      game.hud.idleBox.style.display = 'none';
      game.hud.gameOverBox.style.display = 'none';
      game.hud.pausedBox.style.display = 'none';
      this.watchId = localId;
      this.cameraMode = innerWidth < 700 ? 1 : 0;
      this.wasAlive = false;
    }
    if (this.round !== room.round) {
      this.round = room.round;
      this.clearObstacles();
      for (const actor of this.actors.values()) actor.reset();
      this.watchId = localId;
      this.anchor = 0;
      game.lastTrainHorn = null;
      game.environment.railway.setSeed(room.courseSeed);
    }
    for (const player of room.players) {
      let actor = this.actors.get(player.id);
      if (!actor) {
        actor = player.id === localId ? game.dino : new Dino3D(player.skin);
        this.actors.set(player.id, actor);
        if (player.id !== localId) game.scene.add(actor.mesh);
      }
      if (actor.currentType !== player.skin) actor.setDinoType(player.skin);
      if (!this.labels.has(player.id)) this.makeLabel(player);
      this.updateLabel(player, actor);
    }
    for (const [id, actor] of this.actors) {
      if (room.players.some(p => p.id === id)) continue;
      if (actor !== game.dino) actor.dispose();
      this.actors.delete(id);
      const label = this.labels.get(id);
      label.material.map.dispose(); label.material.dispose(); label.removeFromParent();
      this.labels.delete(id);
    }
    const local = room.players.find(p => p.id === localId);
    if (this.wasAlive && local?.participating && !local.alive) {
      sound.playHit();
      if (this.watchId === localId) this.watchId = room.players.find(p => p.alive && p.participating)?.id || localId;
    }
    if (this.waitingToRespawn && local?.alive) this.watchId = localId;
    this.waitingToRespawn = Boolean(local?.participating && !local.alive && local.respawnAt);
    this.wasAlive = Boolean(local?.alive);
    if (!room.players.some(p => p.id === this.watchId)) this.watchId = room.players.find(p => p.alive && p.participating)?.id || localId;
    document.querySelectorAll('.dino-select-btn').forEach(button => {
      button.classList.toggle('active', button.dataset.dino === local?.skin);
      button.disabled = room.phase === 'running' || room.phase === 'countdown';
    });
  }

  makeLabel(player) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 96;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false });
    const label = new THREE.Sprite(material);
    label.scale.set(3.4, 0.64, 1);
    label.renderOrder = 20;
    label.userData.canvas = canvas;
    this.game.scene.add(label);
    this.labels.set(player.id, label);
  }

  updateLabel(player, actor) {
    const label = this.labels.get(player.id);
    const text = `${player.rank}. ${player.name}`;
    if (label.userData.text !== text) {
      const ctx = label.userData.canvas.getContext('2d');
      ctx.clearRect(0, 0, 512, 96);
      ctx.fillStyle = 'rgba(255,255,255,.93)'; ctx.fillRect(0, 0, 512, 96);
      ctx.fillStyle = LANE_COLORS[player.homeLane ?? player.lane]; ctx.fillRect(0, 0, 12, 96);
      ctx.font = '600 35px system-ui, sans-serif'; ctx.fillStyle = '#24392f';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 260, 49, 480);
      label.material.map.needsUpdate = true;
      label.userData.text = text;
    }
    label.userData.height = actor.activeChar.surfaceMesh.geometry.boundingBox.max.y + 0.5;
  }

  get watchTarget() { return this.client.room?.players.find(p => p.id === this.watchId); }
  watchPlayer(id) {
    if (!this.client.room?.players.some(p => p.id === id)) return;
    this.watchId = id;
    this.cameraMode = 1;
  }
  cycleCamera() { this.cameraMode = (this.cameraMode + 1) % 3; }
  jump() { if (this.client.input({ jump: true })) sound.playJump(); }
  duck(value) { this.client.input({ duck: value }); }
  move(direction) { this.client.input({ move: direction }); }
  selectSkin(skin) { this.client.send({ type: 'profile', skin }); }

  updateCamera(dt) {
    if (!this.active) return;
    const game = this.game;
    const targetPlayer = this.watchTarget;
    const x = this.actors.get(this.watchId)?.mesh.position.x ?? targetPlayer?.x ?? 0;
    const portrait = game.camera.aspect < 0.8;
    let position, target;
    if (this.cameraMode === 0) {
      const factor = Math.max(1, 1.25 / game.camera.aspect);
      position = new THREE.Vector3(0, 17 * factor, -29 * factor);
      target = new THREE.Vector3(0, 1.3, 6);
    } else if (this.cameraMode === 1) {
      const factor = Math.max(1, 0.6 / game.camera.aspect);
      position = new THREE.Vector3(x - 7.8 * factor, 5 * factor, -11 * factor);
      target = new THREE.Vector3(x, 1.6, portrait ? 0.4 : 6);
    } else {
      position = new THREE.Vector3(x, 5.5, -12);
      target = new THREE.Vector3(x, 1.6, portrait ? 0.4 : 12);
    }
    const blend = 1 - Math.exp(-7 * dt);
    game.camera.position.lerp(position, blend);
    if (!this.cameraLook) this.cameraLook = target.clone();
    this.cameraLook.lerp(target, blend);
    game.camera.lookAt(this.cameraLook);
    game.hud.cameraBtn.textContent = `🎥 ${['Toàn cảnh', 'Theo người chơi', 'Sau lưng'][this.cameraMode]} (V)`;
  }

  update(dt) {
    const room = this.client.room;
    if (!room) return;
    const players = this.client.playersAt(dt);
    const focus = players.find(p => p.id === this.watchId) || players[0];
    const nextAnchor = room.phase === 'lobby' || room.phase === 'countdown' ? 0 : focus?.participating ? focus.distance : room.distance;
    const travel = Math.max(0, nextAnchor - this.anchor);
    this.anchor = nextAnchor;
    const moving = room.phase === 'running' && this.client.connected;
    this.game.environment.update(moving && dt > 0 ? travel / (14 * dt) : 0, dt, this.anchor);
    const sinceSnapshot = room.phase === 'running' && this.client.connected
      ? (performance.now() - this.client.receivedAt) / 1000 + this.client.rtt / 2000 : 0;
    this.game.updateSky(room.elapsed + Math.min(1, sinceSnapshot));
    for (const player of players) {
      const actor = this.actors.get(player.id);
      if (!actor) continue;
      const idle = room.phase === 'lobby' || room.phase === 'countdown' || !player.participating;
      const z = player.participating && room.phase !== 'lobby' ? player.distance - this.anchor : 0;
      const visible = z > -38 && z < 110 && (player.participating || room.phase === 'lobby');
      actor.mesh.visible = visible;
      actor.mesh.position.x = player.x ?? laneX(player.lane);
      actor.mesh.position.z = z;
      actor.update(room.speed, dt, { ...player, alive: idle || player.alive, idle });
      if (player.alive && !idle) actor.bodyGroup.rotation.z -= Math.max(-1, Math.min(1, (laneX(player.lane) - actor.mesh.position.x) / 6.4)) * .13;
      const ghost = player.id !== this.client.session.id && player.alive && players.some(other =>
        other.id !== player.id && other.alive && (other.id === this.client.session.id || other.homeLane < player.homeLane)
        && Math.abs((other.x ?? laneX(other.lane)) - actor.mesh.position.x) < 1.4
        && Math.abs(other.distance - player.distance) < 2 && Math.abs(other.y - player.y) < 1.5);
      const surface = actor.activeChar.surfaceMesh, material = surface.material;
      if (material.transparent !== ghost) { material.transparent = ghost; material.needsUpdate = true; }
      material.opacity = ghost ? .25 : 1; material.depthWrite = !ghost;
      surface.castShadow = !ghost; actor.shadowMesh.visible = !ghost;
      const label = this.labels.get(player.id);
      label.visible = visible;
      label.position.set(actor.mesh.position.x, player.y + (player.alive || idle ? label.userData.height : 1.6)
        + (ghost ? .3 * (player.homeLane + 1) : 0), z);
    }
    const desired = new Set();
    let approachingTrain;
    const trainAge = moving ? Math.max(-.09, Math.min(.25,
      (performance.now() - this.client.receivedAt) / 1000
      + (this.watchId === this.client.session.id ? this.client.rtt / 2000 : -.09))) : 0;
    for (const descriptor of room.obstacles) {
      const train = descriptor.type === 'TRAIN';
      const z = descriptor.at - (train ? TRAIN_SPEED * trainAge : 0) - this.anchor;
      if (train && z > -18 && (!approachingTrain || z < approachingTrain.z)) approachingTrain = { ...descriptor, z };
      if (z < (train ? -24 : -16) || z > (train ? 260 : 200)) continue;
      {
        const key = String(descriptor.id);
        desired.add(key);
        let obstacle = this.obstacles.get(key);
        if (!obstacle) {
          obstacle = new Obstacle3D(descriptor.type, z, descriptor.count, descriptor.height, undefined, descriptor.variant, train ? descriptor : null);
          if (!train) obstacle.mesh.position.x = laneX(descriptor.lane ?? 2);
          this.game.scene.add(obstacle.mesh);
          this.obstacles.set(key, obstacle);
        }
        obstacle.updateAt(z, moving ? dt : 0, descriptor.at - (train ? TRAIN_SPEED * trainAge : 0));
      }
    }
    for (const [key, obstacle] of this.obstacles) if (!desired.has(key)) {
      obstacle.dispose(); obstacle.mesh.removeFromParent(); this.obstacles.delete(key);
    }
    this.game.updateTrainWarning(moving ? approachingTrain : null, `${room.code}:${approachingTrain?.id}`);
    this.updateCamera(dt);
    this.ui.frame();
  }

  clearObstacles() {
    for (const obstacle of this.obstacles.values()) { obstacle.dispose(); obstacle.mesh.removeFromParent(); }
    this.obstacles.clear();
  }
  leaveScene() {
    if (!this.active) return;
    this.active = false;
    this.game.updateTrainWarning(null);
    this.clearObstacles();
    for (const actor of this.actors.values()) if (actor !== this.game.dino) actor.dispose();
    this.actors.clear();
    for (const label of this.labels.values()) { label.material.map.dispose(); label.material.dispose(); label.removeFromParent(); }
    this.labels.clear();
    this.round = -1;
    this.game.environment.setLaneCount(3);
    this.game.updateSky(0);
    this.game.scene.fog.near = 35;
    this.game.scene.fog.far = 115;
    this.game.dino.reset();
    this.game.dino.mesh.visible = true;
    this.game.dino.mesh.position.set(0, 0, 0);
    this.game.scoreManager.currentScore = 0;
    this.game.state = 'IDLE';
    this.game.runElapsed = 0;
    this.game.runDistance = 0;
    this.game.currentSpeed = this.game.initialSpeed;
    this.game.hud.idleBox.style.display = 'flex';
    this.game.hud.cameraBtn.textContent = '🎥 Góc nhìn (V)';
    this.game.applyCameraView(this.game.currentViewIndex);
    for (const id of ['race-countdown', 'race-result', 'watching']) document.getElementById(id).hidden = true;
    document.querySelectorAll('.dino-select-btn').forEach(button => { button.disabled = false; });
  }
}
