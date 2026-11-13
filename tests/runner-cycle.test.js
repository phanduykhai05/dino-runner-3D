import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyInput, stepPlayer, laneX, hitsObstacle } from '../shared/race.js';
import { dayCycleAt, DAY_CYCLE_SECONDS } from '../shared/day-cycle.js';
import { Sky3D } from '../src/sky3d.js';
import { RoomHub } from '../server/rooms.js';
import { EventEmitter } from 'node:events';

test('lane changes take time, obey road edges and work during a jump', () => {
  const p = { alive: true, lane: 2, x: 0, laneMin: 1, laneMax: 3, y: 0, vy: 0, distance: 0 };
  applyInput(p, { move: -1 });
  assert.equal(p.lane, 1);
  assert.equal(p.x, 0, 'input does not teleport');
  stepPlayer(p, 1 / 60, 0);
  assert.ok(p.x > 0 && p.x < laneX(1), 'left moves toward screen left from the rear camera');
  for (let i = 0; i < 14; i++) stepPlayer(p, 1 / 60, 0);
  assert.equal(p.x, laneX(1));
  applyInput(p, { move: -1 }); assert.equal(p.lane, 1);
  applyInput(p, { jump: true, move: 1 });
  stepPlayer(p, .1, 0);
  assert.ok(p.y > 0 && p.x < laneX(1) && p.x > 0);
  for (let i = 0; i < 10; i++) applyInput(p, { move: 1 });
  assert.equal(p.lane, 3);
  p.alive = false; applyInput(p, { move: -1 }); assert.equal(p.lane, 3);
});

test('collisions follow physical horizontal position, including a lane transition', () => {
  const p = { alive: true, lane: 2, x: 0, y: 0, vy: 0, distance: 40 };
  const cactus = { at: 40, type: 'CACTUS_LARGE', count: 1, lane: 2 };
  assert.ok(hitsObstacle(p, cactus));
  assert.ok(!hitsObstacle(p, { ...cactus, lane: 1 }));
  applyInput(p, { move: 1 });
  assert.ok(hitsObstacle(p, cactus), 'choosing a target lane alone does not evade a collision');
  stepPlayer(p, .1, 0);
  assert.ok(!hitsObstacle(p, cactus));
});

test('sky cycles through dawn, daylight, sunset and night without a jump at the loop', () => {
  assert.deepEqual([0, 60, 120, 180].map(t => dayCycleAt(t).label), ['Bình minh', 'Ban ngày', 'Hoàng hôn', 'Ban đêm']);
  assert.equal(dayCycleAt(60).daylight, 1);
  assert.equal(dayCycleAt(180).daylight, 0);
  assert.ok(dayCycleAt(60).sunDirection[1] > dayCycleAt(120).sunDirection[1]);
  assert.ok(dayCycleAt(180).moonDirection[1] > .7);
  assert.equal(dayCycleAt(180).starOpacity, 1);
  assert.deepEqual(dayCycleAt(0), dayCycleAt(DAY_CYCLE_SECONDS));
  const scene = new THREE.Scene(); scene.background = new THREE.Color(); scene.fog = new THREE.Fog(0, 1, 100);
  const sky = new Sky3D(scene);
  sky.update(DAY_CYCLE_SECONDS - .01);
  const before = sky.horizon.clone(); sky.update(.01);
  assert.ok(Math.hypot(before.r - sky.horizon.r, before.g - sky.horizon.g, before.b - sky.horizon.b) < .001);
  for (let t = 0; t < DAY_CYCLE_SECONDS; t += .5) {
    const state = sky.update(t);
    assert.ok(sky.sun.position.toArray().every(Number.isFinite));
    assert.ok(state.daylight >= 0 && state.daylight <= 1);
  }
});

test('server owns lateral movement, keeps player seats stable and leaves an open lane per obstacle row', () => {
  let time = 1000;
  class Socket extends EventEmitter {
    readyState = 1; bufferedAmount = 0; messages = [];
    send(data) { this.messages.push(JSON.parse(data)); }
  }
  const hub = new RoomHub({ now: () => time });
  const socket = new Socket(); hub.attach(socket);
  hub.handle(socket, { type: 'create', name: 'Khải' });
  const room = hub.rooms.get(socket.roomCode), player = room.players.get(socket.playerId);
  hub.handle(socket, { type: 'ready', ready: true }); hub.handle(socket, { type: 'start' });
  for (let i = 0; i < 300; i++) { time += 10; hub.tick(); }
  hub.handle(socket, { type: 'input', seq: 1, move: 1, x: -9999 });
  assert.equal(player.lane, 1); assert.equal(player.homeLane, 0); assert.equal(player.x, laneX(0));
  for (let i = 0; i < 10; i++) { time += 10; hub.tick(); }
  assert.ok(player.x < laneX(0) && player.x > laneX(1));
  hub.handle(socket, { type: 'input', seq: 2, move: 99 }); assert.equal(player.ack, 1);
  const guest = new Socket(); hub.attach(guest); hub.handle(guest, { type: 'join', name: 'An', code: room.code });
  assert.equal(room.players.get(guest.playerId).homeLane, 1);
  const rows = new Map();
  for (const obstacle of room.obstacles) {
    assert.ok(obstacle.lane >= 0 && obstacle.lane < 5);
    if (!rows.has(obstacle.at)) rows.set(obstacle.at, new Set());
    assert.ok(!rows.get(obstacle.at).has(obstacle.lane)); rows.get(obstacle.at).add(obstacle.lane);
  }
  for (const lanes of rows.values()) assert.ok(lanes.size >= 2 && lanes.size <= 4);
  const snapshot = hub.snapshot(room);
  assert.equal(snapshot.players.find(p => p.id === player.id).x, player.x);
  assert.equal(snapshot.elapsed, room.elapsed);
});
