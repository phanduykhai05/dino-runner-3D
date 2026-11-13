import { randomBytes, randomInt } from 'node:crypto';
import { MAX_PLAYERS, SKINS, RESPAWN_DELAY_MS, RESPAWN_SHIELD_MS, TRAIN_SPEED, laneX, applyInput, stepPlayer, hitsObstacle, rankPlayers, speedAt } from '../shared/race.js';
import { obstacleRow, rowGapAt } from '../shared/course.js';
import { railSection, trainForSection } from '../shared/railway.js';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const nameOf = value => typeof value === 'string' ? value.normalize('NFC').replace(/[\p{C}]/gu, '').trim().slice(0, 20) : '';

export class RoomHub {
  constructor({ now = Date.now, graceMs = 30000, maxRooms = 200 } = {}) {
    this.now = now;
    this.graceMs = graceMs;
    this.maxRooms = maxRooms;
    this.rooms = new Map();
    this.lastTime = now();
    this.accumulator = 0;
    this.frame = 0;
  }

  send(socket, message) {
    if (socket.readyState !== 1) return;
    if (socket.bufferedAmount > 2e6) { socket.terminate(); return; }
    if (socket.bufferedAmount > 256000 && message.type === 'snapshot') return;
    socket.send(JSON.stringify(message));
  }

  error(socket, message) { this.send(socket, { type: 'error', message }); }

  attach(socket) {
    socket.roomCode = null;
    socket.playerId = null;
    socket.budget = { at: this.now(), count: 0 };
    socket.on('message', (data, binary) => {
      if (binary) return this.error(socket, 'Dữ liệu không hợp lệ.');
      if (this.now() - socket.budget.at > 1000) socket.budget = { at: this.now(), count: 0 };
      if (++socket.budget.count > 100) { socket.close(1008, 'Too many messages'); return; }
      try {
        const message = JSON.parse(data.toString());
        if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error();
        this.handle(socket, message);
      } catch { this.error(socket, 'Dữ liệu không hợp lệ.'); }
    });
    socket.on('close', () => this.disconnect(socket));
    socket.on('error', () => {});
    this.send(socket, { type: 'hello', now: this.now() });
  }

  member(socket) {
    const room = this.rooms.get(socket.roomCode);
    const player = room?.players.get(socket.playerId);
    return player?.socket === socket ? { room, player } : {};
  }

  handle(socket, message) {
    if (message.type === 'ping') {
      if (typeof message.sentAt === 'number') this.send(socket, { type: 'pong', sentAt: message.sentAt, now: this.now() });
      return;
    }
    if (message.type === 'create' || message.type === 'join') {
      if (socket.roomCode) return this.error(socket, 'Bạn đang ở trong một phòng. Hãy rời phòng trước.');
      const name = nameOf(message.name);
      if (!name) return this.error(socket, 'Nhập tên người chơi trước khi vào phòng.');
      let room;
      if (message.type === 'create') {
        if (this.rooms.size >= this.maxRooms) return this.error(socket, 'Máy chủ đang đầy. Vui lòng thử lại sau.');
        let code;
        do { code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(''); } while (this.rooms.has(code));
        room = { code, hostId: null, phase: 'lobby', round: 0, players: new Map(), distance: 0, elapsed: 0, obstacles: [], nextObstacle: 48, obstacleId: 0, nextTrainSection: 0, courseSeed: randomInt(0x100000000) };
        this.rooms.set(code, room);
      } else {
        const code = typeof message.code === 'string' ? message.code.trim().toUpperCase() : '';
        if (!/^[A-Z2-9]{6}$/.test(code)) return this.error(socket, 'Mã phòng gồm 6 chữ hoặc số.');
        room = this.rooms.get(code);
        if (!room) return this.error(socket, 'Không tìm thấy phòng này. Kiểm tra lại mã phòng.');
      }
      if (room.players.size >= MAX_PLAYERS) return this.error(socket, 'Phòng đã đủ 5 người chơi.');
      const lane = Array.from({ length: MAX_PLAYERS }, (_, i) => i).find(i => ![...room.players.values()].some(p => p.homeLane === i));
      const player = {
        id: randomBytes(8).toString('hex'), token: randomBytes(24).toString('hex'), name,
        skin: SKINS.includes(message.skin) ? message.skin : SKINS[lane], lane, homeLane: lane, x: laneX(lane), socket,
        connected: true, ready: false, alive: false, participating: false, distance: 0,
        scoreDistance: 0, respawnAt: 0, invulnerableUntil: 0,
        y: 0, vy: 0, duck: false, duckHeld: false, ack: 0, disconnectedAt: null,
      };
      if (room.phase === 'running') this.respawn(room, player, this.now());
      else if (room.phase === 'countdown') Object.assign(player, { alive: true, participating: true });
      room.players.set(player.id, player);
      if (!room.hostId) room.hostId = player.id;
      socket.roomCode = room.code;
      socket.playerId = player.id;
      this.send(socket, { type: 'joined', code: room.code, id: player.id, token: player.token });
      this.broadcast(room);
      return;
    }
    if (message.type === 'resume') {
      if (socket.roomCode) return this.error(socket, 'Bạn đã kết nối với phòng.');
      const room = this.rooms.get(message.code);
      const player = typeof message.token === 'string' && room && [...room.players.values()].find(p => p.token === message.token);
      if (!player) return this.send(socket, { type: 'expired', message: 'Phiên chơi đã hết hạn. Hãy vào lại phòng.' });
      const previous = player.socket;
      player.socket = socket;
      player.connected = true;
      player.disconnectedAt = null;
      socket.roomCode = room.code;
      socket.playerId = player.id;
      if (previous && previous !== socket) previous.close(4000, 'Session resumed');
      this.send(socket, { type: 'joined', code: room.code, id: player.id, token: player.token, resumed: true });
      this.broadcast(room);
      return;
    }
    const { room, player } = this.member(socket);
    if (!room) return this.error(socket, 'Hãy tạo hoặc vào phòng trước.');
    if (message.type === 'leave') {
      this.remove(room, player);
      this.send(socket, { type: 'left' });
    } else if (message.type === 'ready') {
      if (room.phase !== 'lobby') return;
      player.ready = message.ready === true;
      this.broadcast(room);
    } else if (message.type === 'profile') {
      if (room.phase !== 'lobby') return this.error(socket, 'Chọn nhân vật trước khi bắt đầu chạy.');
      if (SKINS.includes(message.skin)) player.skin = message.skin;
      this.broadcast(room);
    } else if (message.type === 'start') {
      if (player.id !== room.hostId) return this.error(socket, 'Chỉ chủ phòng được bắt đầu ván.');
      if (room.phase !== 'lobby') return;
      const connected = [...room.players.values()].filter(p => p.connected);
      if (connected.length !== room.players.size || connected.some(p => !p.ready)) return this.error(socket, 'Chờ tất cả người chơi kết nối và sẵn sàng.');
      room.phase = 'countdown';
      room.startAt = this.now() + 3000;
      room.round++;
      room.distance = 0;
      room.elapsed = 0;
      room.obstacles = [];
      room.nextObstacle = 48;
      room.obstacleId = 0;
      room.nextTrainSection = 0;
      room.courseSeed = randomInt(0x100000000);
      for (const p of connected) Object.assign(p, { alive: true, participating: true, ready: false, distance: 0, scoreDistance: 0, respawnAt: 0, invulnerableUntil: 0, y: 0, vy: 0, duck: false, duckHeld: false, lane: p.homeLane, x: laneX(p.homeLane) });
      this.fillCourse(room);
      this.broadcast(room);
    } else if (message.type === 'input') {
      if (room.phase !== 'running' || !player.alive || !player.participating) return;
      if (!Number.isSafeInteger(message.seq) || message.seq <= player.ack || message.seq > 1e9) return;
      if (message.jump !== true && typeof message.duck !== 'boolean' && message.move !== -1 && message.move !== 1) return;
      player.ack = message.seq;
      applyInput(player, message);
    }
  }

  fillCourse(room) {
    while (room.nextObstacle < room.distance + 240) {
      for (const descriptor of obstacleRow(room.nextObstacle, 5)) {
        room.obstacles.push({ ...descriptor, id: ++room.obstacleId });
      }
      room.nextObstacle += rowGapAt(room.nextObstacle);
    }
    while (railSection(room.nextTrainSection).triggerAt <= room.distance) {
      const index = room.nextTrainSection++;
      if (railSection(index).end >= room.distance) room.obstacles.push({ ...trainForSection(index, 5, room.courseSeed), id: ++room.obstacleId });
    }
    room.obstacles = room.obstacles.filter(o => o.at > room.distance - 30);
  }

  snapshot(room) {
    const players = [...room.players.values()].map(p => ({
      id: p.id, name: p.name, skin: p.skin, lane: p.lane, homeLane: p.homeLane, x: p.x, connected: p.connected, ready: p.ready,
      alive: p.alive, participating: p.participating, distance: p.distance, y: p.y, vy: p.vy,
      duck: p.duck, duckHeld: p.duckHeld, ack: p.ack,
      scoreDistance: p.scoreDistance, respawnAt: p.respawnAt, invulnerableUntil: p.invulnerableUntil,
    }));
    return { type: 'snapshot', code: room.code, hostId: room.hostId, phase: room.phase, round: room.round,
      now: this.now(), startAt: room.startAt || 0, elapsed: room.elapsed, distance: room.distance,
      courseSeed: room.courseSeed, speed: speedAt(room.distance), players: rankPlayers(players), obstacles: room.obstacles };
  }

  broadcast(room) {
    const snapshot = this.snapshot(room);
    for (const player of room.players.values()) if (player.socket) this.send(player.socket, snapshot);
  }

  respawn(room, player, now) {
    // Rejoin the live course without awarding the distance missed while dead.
    Object.assign(player, { alive: true, participating: true, distance: room.distance,
      x: laneX(player.lane), y: 0, vy: 0, duck: false, duckHeld: false, respawnAt: 0, invulnerableUntil: now + RESPAWN_SHIELD_MS });
  }

  remove(room, player) {
    if (player.socket) { player.socket.roomCode = null; player.socket.playerId = null; }
    room.players.delete(player.id);
    if (!room.players.size) { this.rooms.delete(room.code); return; }
    if (room.hostId === player.id) room.hostId = [...room.players.values()].find(p => p.connected)?.id || room.players.keys().next().value;
    this.cancelCountdown(room);
    this.broadcast(room);
  }

  cancelCountdown(room) {
    if (room.phase !== 'countdown') return;
    room.phase = 'lobby';
    for (const p of room.players.values()) { p.alive = false; p.participating = false; p.ready = false; }
  }

  disconnect(socket) {
    const { room, player } = this.member(socket);
    if (!room) return;
    player.socket = null;
    player.connected = false;
    player.ready = false;
    player.duckHeld = false;
    player.disconnectedAt = this.now();
    if (room.hostId === player.id) room.hostId = [...room.players.values()].find(p => p.connected)?.id || player.id;
    this.cancelCountdown(room);
    this.broadcast(room);
  }

  tick() {
    const now = this.now();
    this.accumulator += Math.min(0.25, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    for (const room of this.rooms.values()) {
      for (const p of [...room.players.values()]) {
        if (!p.connected && now - p.disconnectedAt >= this.graceMs) this.remove(room, p);
      }
      if (room.phase === 'countdown' && now >= room.startAt) { room.phase = 'running'; this.broadcast(room); }
      if (room.phase === 'running') {
        for (const p of room.players.values()) {
          if (p.connected && p.participating && !p.alive && p.respawnAt && now >= p.respawnAt) this.respawn(room, p, now);
        }
      }
    }
    let stepped = false;
    while (this.accumulator >= 1 / 60) {
      this.accumulator -= 1 / 60;
      this.frame++;
      for (const room of this.rooms.values()) {
        if (room.phase !== 'running') continue;
        const speed = speedAt(room.distance);
        room.elapsed += 1 / 60;
        room.distance += speed * 14 / 60;
        this.fillCourse(room);
        for (const obstacle of room.obstacles) if (obstacle.type === 'TRAIN') obstacle.at -= TRAIN_SPEED / 60;
        for (const p of room.players.values()) {
          if (!p.alive || !p.participating) continue;
          stepPlayer(p, 1 / 60, speed);
          if (now >= p.invulnerableUntil && room.obstacles.some(o => hitsObstacle(p, o))) {
            p.alive = false; p.duck = false; p.duckHeld = false;
            p.respawnAt = now + RESPAWN_DELAY_MS;
          }
        }
      }
      if (this.frame % 3 === 0) stepped = true;
    }
    if (stepped) for (const room of this.rooms.values()) if (room.phase === 'running' || room.phase === 'countdown') this.broadcast(room);
  }
}
