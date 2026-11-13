import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { RoomHub } from '../server/rooms.js';
import { applyInput, stepPlayer, hitsObstacle } from '../shared/race.js';

class Socket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  messages = [];
  send(data) { this.messages.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.emit('close'); }
  terminate() { this.close(); }
  last(type) { return this.messages.findLast(message => message.type === type); }
}

function setup(count = 5) {
  let time = 1000;
  const hub = new RoomHub({ now: () => time });
  const sockets = [];
  const connect = () => { const socket = new Socket(); hub.attach(socket); return socket; };
  const host = connect();
  hub.handle(host, { type: 'create', name: 'Người chơi 1' });
  sockets.push(host);
  const code = host.last('joined').code;
  for (let i = 1; i < count; i++) {
    const socket = connect();
    hub.handle(socket, { type: 'join', name: `Người chơi ${i + 1}`, code });
    sockets.push(socket);
  }
  const advance = ms => {
    for (let left = ms; left > 0;) { const dt = Math.min(10, left); left -= dt; time += dt; hub.tick(); }
  };
  const start = () => {
    for (const socket of sockets) hub.handle(socket, { type: 'ready', ready: true });
    hub.handle(host, { type: 'start' });
    advance(3000);
  };
  return { hub, sockets, host, code, room: hub.rooms.get(code), connect, advance, start };
}

test('five unique lanes, room isolation, capacity and private reconnect tokens', () => {
  const s = setup();
  assert.deepEqual([...s.room.players.values()].map(p => p.lane), [0, 1, 2, 3, 4]);
  const sixth = s.connect();
  s.hub.handle(sixth, { type: 'join', name: 'Sáu', code: s.code });
  assert.match(sixth.last('error').message, /đủ 5/);
  const snapshot = s.hub.snapshot(s.room);
  for (const p of s.room.players.values()) assert.ok(!JSON.stringify(snapshot).includes(p.token));
  const outsider = s.connect();
  s.hub.handle(outsider, { type: 'create', name: 'Phòng riêng' });
  const before = outsider.messages.length;
  s.hub.handle(s.host, { type: 'ready', ready: true });
  assert.equal(outsider.messages.length, before);
  s.host.emit('message', Buffer.from('null'), false);
  assert.match(s.host.last('error').message, /không hợp lệ/);
});

test('only host starts after everyone is ready; countdown and course are shared', () => {
  const s = setup();
  s.hub.handle(s.sockets[1], { type: 'start' });
  assert.match(s.sockets[1].last('error').message, /chủ phòng/);
  s.hub.handle(s.host, { type: 'start' });
  assert.equal(s.room.phase, 'lobby');
  for (const socket of s.sockets) s.hub.handle(socket, { type: 'ready', ready: true });
  s.hub.handle(s.host, { type: 'start' });
  s.advance(2990);
  assert.equal(s.room.phase, 'countdown');
  assert.equal(s.room.distance, 0);
  s.advance(10);
  assert.equal(s.room.phase, 'running');
  for (const socket of s.sockets) {
    const snapshot = socket.last('snapshot');
    assert.equal(snapshot.startAt, s.room.startAt);
    assert.deepEqual(snapshot.obstacles, s.room.obstacles);
    assert.equal(snapshot.players.length, 5);
  }
});

test('server owns jumping, collisions and ranking, rejects replay and invented scores', () => {
  const s = setup(); s.start();
  s.room.obstacles = [{ id: 500, at: s.room.distance + 10, type: 'CACTUS_LARGE', count: 1 }];
  const player = s.room.players.get(s.host.playerId);
  s.hub.handle(s.host, { type: 'input', seq: 1, jump: true, distance: 999999, score: 999999 });
  assert.equal(player.vy, 13.8);
  s.hub.handle(s.host, { type: 'input', seq: 1, duck: true });
  assert.equal(player.duckHeld, false);
  s.advance(700);
  assert.equal(s.room.phase, 'running');
  assert.equal([...s.room.players.values()].filter(p => p.alive).length, 1);
  const ranked = s.hub.snapshot(s.room).players;
  assert.equal(ranked[0].id, player.id);
  assert.equal(ranked[0].rank, 1);
  assert.ok(ranked[0].score < 100);
  assert.ok(s.sockets.every(socket => socket.last('snapshot').phase === 'running'));
  const dead = [...s.room.players.values()].find(p => !p.alive);
  const earned = dead.scoreDistance;
  const score = s.hub.snapshot(s.room).players.find(p => p.id === dead.id).score;
  const survivorEarned = player.scoreDistance;
  s.room.obstacles = []; s.room.nextObstacle = 1e9;
  s.advance(dead.respawnAt - s.hub.now() - 1);
  assert.equal(dead.alive, false, 'must wait the full 3 seconds');
  assert.equal(dead.scoreDistance, earned, 'waiting must not earn points');
  assert.ok(player.scoreDistance > survivorEarned, 'survivor keeps earning points');
  s.advance(1);
  assert.equal(dead.alive, true);
  assert.equal(dead.respawnAt, 0);
  assert.ok(Math.abs(dead.distance - s.room.distance) < 0.5);
  assert.ok(dead.scoreDistance - earned < 0.5, 'catching up the course must not award skipped distance');
  assert.equal(s.hub.snapshot(s.room).players.find(p => p.id === dead.id).score, score);
  assert.equal(s.hub.snapshot(s.room).players[0].id, player.id);
  s.advance(200);
  assert.ok(dead.scoreDistance > earned, 'points resume after respawn');
});

test('everyone can die and respawn together without ending the score race', () => {
  const s = setup(2); s.start();
  s.room.obstacles = [{ id: 500, at: s.room.distance + 1, type: 'CACTUS_LARGE', count: 1 }];
  s.advance(20);
  const players = [...s.room.players.values()];
  assert.ok(players.every(p => !p.alive && p.respawnAt === s.hub.now() + 3000));
  assert.equal(s.room.phase, 'running');
  const earned = players.map(p => p.scoreDistance);
  s.room.obstacles = []; s.room.nextObstacle = 1e9;
  s.advance(2999);
  assert.ok(players.every((p, i) => !p.alive && p.scoreDistance === earned[i]));
  s.room.obstacles = [{ id: 501, at: s.room.distance + 1, type: 'CACTUS_LARGE', count: 1 }];
  s.advance(1);
  assert.ok(players.every(p => p.alive && p.invulnerableUntil === s.hub.now() + 1000));
  s.advance(40);
  assert.ok(players.every(p => p.alive), 'spawn protection prevents instant collision');
  s.room.obstacles = []; s.advance(1000);
  s.room.obstacles = [{ id: 502, at: s.room.distance + 1, type: 'CACTUS_LARGE', count: 1 }];
  s.advance(20);
  assert.ok(players.every(p => !p.alive), 'normal collisions return after protection');
  assert.equal(s.room.phase, 'running');
});

test('disconnected dead players wait for reconnect instead of farming respawn points', () => {
  const s = setup(2); s.start();
  s.room.obstacles = [{ id: 500, at: s.room.distance + 1, type: 'CACTUS_LARGE', count: 1 }];
  s.advance(20);
  const session = s.host.last('joined');
  const player = s.room.players.get(session.id);
  const earned = player.scoreDistance;
  s.host.close(); s.room.obstacles = []; s.room.nextObstacle = 1e9;
  s.advance(4000);
  assert.equal(player.alive, false);
  assert.equal(player.scoreDistance, earned);
  const resumed = s.connect();
  s.hub.handle(resumed, { type: 'resume', code: s.code, token: session.token });
  s.advance(10);
  assert.equal(player.alive, true);
  assert.ok(player.scoreDistance - earned < 0.5);
  assert.equal(s.room.phase, 'running');
});

test('reconnect keeps seat and identity, transfers host, expires absent players', () => {
  const s = setup(2);
  const session = s.host.last('joined');
  s.host.close();
  assert.equal(s.room.hostId, s.sockets[1].playerId);
  const resumed = s.connect();
  s.hub.handle(resumed, { type: 'resume', code: s.code, token: session.token });
  assert.equal(resumed.last('joined').id, session.id);
  assert.equal(s.room.players.size, 2);
  assert.equal(s.room.players.get(session.id).lane, 0);
  const impostor = s.connect();
  s.hub.handle(impostor, { type: 'resume', code: s.code, token: 'wrong' });
  assert.ok(impostor.last('expired'));
  resumed.close(); s.advance(30010);
  assert.equal(s.room.players.size, 1);
  s.hub.handle(impostor, { type: 'resume', code: s.code, token: session.token });
  assert.ok(impostor.last('expired'));
  s.hub.handle(s.sockets[1], { type: 'leave' });
  assert.equal(s.hub.rooms.size, 0);
});

test('late join plays immediately from zero points; disconnect cancels countdown', () => {
  const s = setup(2); s.start();
  s.advance(500);
  const late = s.connect();
  s.hub.handle(late, { type: 'join', name: 'Đến sau', code: s.code });
  const player = s.room.players.get(late.playerId);
  assert.equal(player.participating, true);
  assert.equal(player.distance, s.room.distance);
  assert.equal(player.scoreDistance, 0);
  assert.equal(s.hub.snapshot(s.room).players.find(p => p.id === player.id).score, 0);
  s.hub.handle(late, { type: 'input', seq: 1, jump: true });
  assert.equal(player.vy, 13.8);
  const countdown = setup(2);
  for (const socket of countdown.sockets) countdown.hub.handle(socket, { type: 'ready', ready: true });
  countdown.hub.handle(countdown.host, { type: 'start' });
  countdown.host.close();
  assert.equal(countdown.room.phase, 'lobby');
  assert.ok([...countdown.room.players.values()].every(p => !p.ready && !p.participating));
  const leaving = setup(2);
  for (const socket of leaving.sockets) leaving.hub.handle(socket, { type: 'ready', ready: true });
  leaving.hub.handle(leaving.host, { type: 'start' });
  leaving.hub.handle(leaving.host, { type: 'leave' });
  assert.equal(leaving.room.phase, 'lobby');
});

test('physics offers jump, crouch and walk paths for the three bird heights', () => {
  const player = { alive: true, y: 0, vy: 0, distance: 0, duckHeld: false, duck: false };
  const bird = height => ({ at: 0, type: 'PTERODACTYL', height });
  assert.ok(hitsObstacle(player, bird(0)));
  assert.ok(hitsObstacle(player, bird(1)));
  assert.ok(!hitsObstacle(player, bird(2)));
  applyInput(player, { duck: true });
  assert.ok(!hitsObstacle(player, bird(1)));
  assert.ok(hitsObstacle(player, bird(0)));
  applyInput(player, { jump: true });
  for (let i = 0; i < 25; i++) stepPlayer(player, 1 / 60, 0);
  assert.ok(player.y > 3);
  assert.ok(!hitsObstacle(player, bird(0)));
  for (let i = 0; i < 60; i++) stepPlayer(player, 1 / 60, 0);
  assert.equal(player.y, 0);
});
