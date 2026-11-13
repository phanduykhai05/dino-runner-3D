import { LANE_COLORS } from '../shared/race.js';

export class OnlineUI {
  constructor(game, client) {
    this.game = game;
    this.client = client;
    this.panel = document.getElementById('online-panel');
    this.form = document.getElementById('room-entry');
    this.member = document.getElementById('room-member');
    this.board = document.getElementById('live-board');
    this.lastPhase = null;
    this.rows = document.getElementById('rank-rows');
    this.message = document.getElementById('online-message');
    this.name = document.getElementById('player-name');
    this.code = document.getElementById('room-code-input');
    this.ready = document.getElementById('ready-button');
    this.start = document.getElementById('start-race');
    this.rowMap = new Map();
    try { this.name.value = localStorage.getItem('dino_player_name') || ''; } catch {}
    this.code.value = new URLSearchParams(location.search).get('room')?.slice(0, 6).toUpperCase() || '';
    document.getElementById('create-room').addEventListener('click', () => this.enter('create'));
    this.form.addEventListener('submit', event => { event.preventDefault(); this.enter('join'); });
    document.getElementById('leave-room').addEventListener('click', () => client.leave());
    document.getElementById('copy-room').addEventListener('click', () => this.copyCode());
    this.ready.addEventListener('click', () => client.send({ type: 'ready', ready: !this.local()?.ready }));
    this.start.addEventListener('click', () => client.send({ type: 'start' }));
    document.getElementById('back-to-me').addEventListener('click', () => game.online.watchPlayer(client.session.id));
    document.getElementById('online-toggle').addEventListener('click', () => {
      this.collapse(!this.panel.classList.contains('collapsed'));
    });
    this.code.addEventListener('input', () => { this.code.value = this.code.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6); });
    client.addEventListener('room', () => { this.busy(false); this.render(); });
    client.addEventListener('left', () => { this.busy(false); this.render(); this.say('Đã rời phòng. Bạn có thể chơi đơn hoặc vào phòng khác.'); });
    client.addEventListener('error', event => { this.busy(false); this.notify(event.detail, true); });
    client.addEventListener('joined', () => this.collapse(false));
    client.addEventListener('status', event => this.connection(event.detail.status));
    client.addEventListener('latency', () => this.connection(client.status));
    for (const surface of [this.panel, this.board]) surface.addEventListener('click', event => {
      if (event.detail > 0) event.target.closest('button')?.blur();
    });
    this.connection(client.status);
    this.render();
  }

  local() { return this.client.room?.players.find(p => p.id === this.client.session?.id); }
  collapse(value) {
    this.panel.classList.toggle('collapsed', value);
    document.getElementById('online-toggle').setAttribute('aria-expanded', String(!value));
  }
  say(message, error = false, force = false) {
    if (!force && this.overrideUntil > performance.now()) return;
    this.message.textContent = message; this.message.classList.toggle('error', error);
  }
  notify(message, error = false) { this.overrideUntil = performance.now() + 4000; this.say(message, error, true); }
  busy(value) {
    for (const button of this.form.querySelectorAll('button')) button.disabled = value;
  }
  async enter(type) {
    if (!this.name.value.trim()) { this.say('Nhập tên để mọi người nhận ra bạn.', true); this.name.focus(); return; }
    if (type === 'join' && this.code.value.length !== 6) { this.say('Nhập mã phòng gồm 6 chữ hoặc số.', true); this.code.focus(); return; }
    this.busy(true);
    this.say(type === 'create' ? 'Đang tạo phòng…' : 'Đang vào phòng…');
    try {
      localStorage.setItem('dino_player_name', this.name.value.trim());
      await this.client.enter(type, this.name.value.trim(), this.code.value, this.game.dino.currentType);
      clearTimeout(this.entryTimeout);
      this.entryTimeout = setTimeout(() => { if (!this.client.room) { this.busy(false); this.say('Chưa nhận được phản hồi. Vui lòng thử lại.', true); } }, 8000);
    } catch (error) { this.busy(false); this.say(error.message, true); }
  }
  async copyCode() {
    const code = this.client.room?.code;
    if (!code) return;
    try { await navigator.clipboard.writeText(code); this.say('Đã sao chép mã phòng. Gửi mã này cho bạn bè.'); }
    catch { this.say(`Mã phòng của bạn: ${code}`); }
  }
  connection(status) {
    const labels = { connected: `Đã kết nối · ${this.client.rtt} ms`, connecting: 'Đang kết nối…', reconnecting: 'Mất mạng · đang kết nối lại…', disconnected: 'Chưa kết nối máy chủ' };
    document.getElementById('connection-status').textContent = labels[status];
    document.getElementById('connection-status').dataset.status = status;
    this.ready.disabled = !this.client.connected;
    this.start.disabled = !this.client.connected;
    if (this.client.room) this.render();
  }

  render() {
    const room = this.client.room;
    const online = Boolean(room);
    this.form.hidden = online;
    this.member.hidden = !online;
    this.board.hidden = !online;
    document.body.classList.toggle('online-room', online);
    if (!online) {
      this.rows.replaceChildren(); this.rowMap.clear(); this.lastPhase = null;
      document.getElementById('online-title').textContent = 'Chơi cùng bạn bè';
      this.collapse(false);
      return;
    }
    const local = this.local();
    document.getElementById('online-title').textContent = `Phòng ${room.code}`;
    if (this.lastPhase !== room.phase) {
      this.collapse(room.phase === 'running');
      this.lastPhase = room.phase;
    }
    const host = room.players.find(p => p.id === room.hostId);
    const waiting = room.phase === 'lobby';
    document.getElementById('room-code').textContent = room.code;
    document.getElementById('room-host').textContent = room.hostId === local?.id ? 'Bạn là chủ phòng' : `Chủ phòng: ${host?.name || ''}`;
    document.getElementById('board-heading').textContent = waiting ? 'Người chơi trong phòng' : 'Xếp hạng trực tiếp';
    document.getElementById('room-capacity').textContent = `${room.players.length}/5 người`;
    this.ready.hidden = !waiting;
    this.ready.textContent = local?.ready ? '✓ Đã sẵn sàng' : 'Sẵn sàng';
    this.ready.classList.toggle('is-ready', Boolean(local?.ready));
    this.ready.disabled = !this.client.connected;
    this.start.hidden = !waiting || room.hostId !== local?.id;
    this.start.textContent = 'Bắt đầu';
    this.start.disabled = !this.client.connected || room.players.some(p => !p.ready || !p.connected);
    if (room.phase === 'lobby') this.say('Mời bạn bằng mã phòng. Tất cả nhấn Sẵn sàng trước khi bắt đầu.');
    else if (room.phase === 'countdown') this.say('Ván đấu sắp bắt đầu. Chuẩn bị nhảy và cúi!');
    else if (!local?.alive) this.say('Hồi sinh sau 3 giây, giữ nguyên điểm. Những người khác vẫn chạy tiếp.');
    else this.say('← → / A D: đổi làn · Space / ↑: nhảy · ↓: cúi. Điện thoại: vuốt 4 hướng.');
    const desired = [];
    for (const player of room.players) {
      let row = this.rowMap.get(player.id);
      if (!row) {
        row = document.createElement('button');
        row.type = 'button';
        row.className = 'rank-row';
        row.innerHTML = '<span class="place"></span><span class="runner-info"><strong></strong><small></small></span><span class="runner-score"></span>';
        row.addEventListener('click', () => this.game.online.watchPlayer(player.id));
        this.rowMap.set(player.id, row);
      }
      row.style.setProperty('--lane-color', LANE_COLORS[player.homeLane ?? player.lane]);
      row.dataset.player = player.id;
      row.classList.toggle('is-local', player.id === local?.id);
      row.classList.toggle('is-out', player.participating && !player.alive);
      row.setAttribute('aria-label', `Xem ${player.name}`);
      row.querySelector('.place').textContent = String(player.rank);
      row.querySelector('strong').textContent = player.name + (player.id === local?.id ? ' (bạn)' : '');
      const status = !player.connected ? 'Mất kết nối' : waiting ? player.ready ? 'Sẵn sàng' : 'Chưa sẵn sàng'
        : player.alive ? 'Đang chạy' : `Hồi sinh ${this.secondsUntil(player.respawnAt)}s`;
      row.querySelector('small').textContent = `Đường ${player.lane + 1} · ${status}${player.id === room.hostId ? ' · Chủ phòng' : ''}`;
      row.querySelector('.runner-score').textContent = `${player.score} đ`;
      desired.push(row);
    }
    for (const [id, row] of this.rowMap) if (!room.players.some(p => p.id === id)) { row.remove(); this.rowMap.delete(id); }
    for (const row of [...this.rows.querySelectorAll('.empty-slot')]) row.remove();
    desired.forEach((row, i) => { if (this.rows.children[i] !== row) this.rows.insertBefore(row, this.rows.children[i] || null); });
    for (let i = room.players.length; i < 5; i++) {
      const empty = document.createElement('div');
      empty.className = 'rank-row empty-slot';
      empty.textContent = '＋ Chỗ trống · Mời thêm bạn';
      this.rows.append(empty);
    }
  }

  secondsUntil(time) {
    return Math.max(1, Math.ceil((time - this.client.room.now - (performance.now() - this.client.receivedAt)) / 1000));
  }

  frame() {
    const room = this.client.room;
    if (!room) return;
    const countdown = document.getElementById('race-countdown');
    const remaining = room.startAt - room.now - (performance.now() - this.client.receivedAt);
    countdown.hidden = room.phase !== 'countdown';
    countdown.textContent = remaining > 0 ? String(Math.ceil(remaining / 1000)) : 'Chạy!';
    const local = this.local();
    const respawning = room.phase === 'running' && local?.participating && !local.alive && local.respawnAt;
    const protectedUntil = local?.alive ? local.invulnerableUntil : 0;
    const protectedNow = protectedUntil > room.now + performance.now() - this.client.receivedAt;
    const result = document.getElementById('race-result');
    result.hidden = !respawning && !protectedNow;
    if (respawning) result.textContent = `Hồi sinh sau ${this.secondsUntil(local.respawnAt)} giây · Giữ ${local.score} điểm`;
    else if (protectedNow) result.textContent = `Bảo vệ hồi sinh · ${this.secondsUntil(protectedUntil)} giây`;
    const watched = room.players.find(p => p.id === this.game.online.watchId);
    const watching = document.getElementById('watching');
    watching.hidden = !watched;
    if (watched) document.getElementById('watching-name').textContent = watched.id === this.client.session.id ? 'Góc nhìn của bạn' : `Đang xem: ${watched.name}`;
    document.getElementById('back-to-me').hidden = !watched || watched.id === this.client.session.id;
    for (const [id, row] of this.rowMap) row.classList.toggle('is-watched', id === this.game.online.watchId);
  }
}
