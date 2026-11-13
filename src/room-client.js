import { applyInput, stepPlayer } from '../shared/race.js';

const storageKey = 'dino_online_session';
export class RoomClient extends EventTarget {
  constructor() {
    super();
    this.socket = null;
    this.room = null;
    this.status = 'disconnected';
    this.rtt = 0;
    this.sequence = 0;
    this.pendingInputs = [];
    this.history = [];
    this.receivedAt = 0;
    this.prediction = null;
    this.retry = 0;
    try { this.session = JSON.parse(sessionStorage.getItem(storageKey)); } catch { this.session = null; }
    this.connect().catch(() => {});
    this.pingTimer = setInterval(() => this.send({ type: 'ping', sentAt: performance.now() }), 2000);
    window.addEventListener('pagehide', () => { this.closing = true; this.socket?.close(); });
    window.addEventListener('pageshow', event => {
      if (event.persisted) { this.closing = false; this.connect().catch(() => {}); }
    });
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  setStatus(status) { this.status = status; this.emit('status', { status, rtt: this.rtt }); }
  send(message) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.setStatus(this.session ? 'reconnecting' : 'connecting');
    const url = import.meta.env.VITE_WS_URL || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
    this.connecting = new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      this.socket = socket;
      const timeout = setTimeout(() => { socket.close(); reject(new Error('Không kết nối được máy chủ. Vui lòng thử lại.')); }, 8000);
      socket.addEventListener('open', () => {
        clearTimeout(timeout);
        this.retry = 0;
        this.setStatus('connected');
        if (this.session) this.send({ type: 'resume', code: this.session.code, token: this.session.token });
        this.send({ type: 'ping', sentAt: performance.now() });
        resolve();
      });
      socket.addEventListener('message', event => {
        let data;
        try { data = JSON.parse(event.data); } catch { return; }
        this.receive(data);
      });
      socket.addEventListener('close', () => {
        clearTimeout(timeout);
        this.connecting = null;
        this.setStatus(this.session ? 'reconnecting' : 'disconnected');
        reject(new Error('Mất kết nối máy chủ.'));
        if (this.session && !this.closing) {
          clearTimeout(this.retryTimer);
          this.retryTimer = setTimeout(() => this.connect().catch(() => {}), Math.min(5000, 500 * 2 ** this.retry++));
        }
      });
      socket.addEventListener('error', () => {});
    });
    return this.connecting;
  }

  receive(data) {
    if (data.type === 'joined') {
      if (data.resumed) {
        this.pendingInputs = [];
        this.prediction = null;
        this.history = [];
      }
      this.session = { code: data.code, id: data.id, token: data.token };
      sessionStorage.setItem(storageKey, JSON.stringify(this.session));
      this.emit('joined', data);
    } else if (data.type === 'snapshot' && this.session && data.code === this.session.code) {
      const at = performance.now();
      const previousLocal = this.room?.players.find(p => p.id === this.session.id);
      if (this.room?.round !== data.round || this.room?.code !== data.code) {
        this.history = [];
        this.pendingInputs = [];
        this.prediction = null;
      }
      this.room = data;
      this.receivedAt = at;
      this.history.push({ room: data, at });
      if (this.history.length > 8) this.history.shift();
      const local = data.players.find(p => p.id === this.session.id);
      if (local) {
        if (previousLocal?.alive !== local.alive) this.pendingInputs = [];
        this.sequence = Math.max(this.sequence, local.ack);
        this.pendingInputs = this.pendingInputs.filter(input => input.seq > local.ack);
        this.prediction = { ...local, duckHeld: local.duckHeld };
        const latency = Math.min(200, this.rtt / 2);
        let cursor = at - latency;
        for (const input of this.pendingInputs) {
          const inputAt = Math.max(cursor, Math.min(at, input.at));
          this.simulatePrediction((inputAt - cursor) / 1000);
          applyInput(this.prediction, input);
          cursor = inputAt;
        }
        this.simulatePrediction((at - cursor) / 1000);
      }
      this.emit('room', data);
    } else if (data.type === 'pong') {
      this.rtt = Math.round(Math.max(0, performance.now() - data.sentAt));
      this.emit('latency', this.rtt);
    } else if (data.type === 'left' || data.type === 'expired') {
      this.clearRoom();
      if (data.message) this.emit('error', data.message);
    } else if (data.type === 'error') this.emit('error', data.message);
  }

  simulatePrediction(dt) {
    if (!this.prediction || this.room?.phase !== 'running') return;
    let left = Math.min(0.2, dt);
    while (left > 0.00001) {
      const step = Math.min(1 / 120, left);
      stepPlayer(this.prediction, step, this.room.speed);
      left -= step;
    }
  }

  input(command) {
    const player = this.room?.players.find(p => p.id === this.session?.id);
    if (this.status !== 'connected' || this.room?.phase !== 'running' || !player?.alive || !player.participating) return false;
    const input = { type: 'input', seq: ++this.sequence, at: performance.now(), ...command };
    this.pendingInputs.push(input);
    if (this.prediction) applyInput(this.prediction, input);
    this.send({ type: input.type, seq: input.seq, jump: input.jump, duck: input.duck, move: input.move });
    return true;
  }

  async enter(type, name, code, skin) {
    await this.connect();
    this.send({ type, name, code, skin });
  }
  clearRoom() {
    this.room = null;
    this.session = null;
    this.history = [];
    this.prediction = null;
    this.pendingInputs = [];
    sessionStorage.removeItem(storageKey);
    clearTimeout(this.retryTimer);
    this.emit('left');
  }
  leave() { this.send({ type: 'leave' }); this.clearRoom(); }
  get connected() { return this.status === 'connected'; }

  playersAt(dt) {
    if (!this.room) return [];
    if (!this.history.length) return this.room.players.map(player => ({ ...player }));
    if (this.connected) this.simulatePrediction(dt);
    const target = performance.now() - 90;
    let before = this.history[0], after = this.history.at(-1);
    for (let i = 0; i < this.history.length - 1; i++) {
      if (this.history[i].at <= target && this.history[i + 1].at >= target) { before = this.history[i]; after = this.history[i + 1]; break; }
    }
    const span = after.at - before.at;
    const alpha = span > 0 ? Math.max(0, Math.min(1, (target - before.at) / span)) : 1;
    return this.room.players.map(player => {
      if (player.id === this.session.id && this.prediction && this.room.phase === 'running' && this.connected) return { ...player, ...this.prediction };
      const older = before.room.players.find(p => p.id === player.id);
      const newer = after.room.players.find(p => p.id === player.id);
      if (!older || !newer || before.room.round !== after.room.round || older.alive !== newer.alive
        || older.invulnerableUntil !== newer.invulnerableUntil) return { ...player };
      return { ...player, x: older.x + (newer.x - older.x) * alpha,
        y: older.y + (newer.y - older.y) * alpha, distance: older.distance + (newer.distance - older.distance) * alpha };
    });
  }
}
