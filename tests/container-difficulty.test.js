import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CONTAINER_SIZE, INITIAL_SPEED, MAX_SPEED, speedAt, obstacleBounds, hitsObstacle, applyInput, stepPlayer, laneX } from '../shared/race.js';
import { obstacleRow, rowGapAt } from '../shared/course.js';
import { inRailZone } from '../shared/railway.js';
import { Obstacle3D } from '../src/obstacles3d.js';
import { RoomHub } from '../server/rooms.js';
import { EventEmitter } from 'node:events';

test('containers block walking, crouching and the jump apex, while an adjacent lane is clear', () => {
  const obstacle = { at: 100, lane: 2, type: 'CONTAINER' };
  const p = { alive: true, lane: 2, x: 0, y: 0, vy: 0, distance: 100 };
  assert.ok(hitsObstacle(p, obstacle));
  applyInput(p, { duck: true }); assert.ok(hitsObstacle(p, obstacle));
  applyInput(p, { jump: true });
  for (let i = 0; i < 29; i++) stepPlayer(p, 1 / 60, 0);
  assert.ok(p.y > 3 && hitsObstacle(p, obstacle));
  p.x = laneX(1); assert.ok(!hitsObstacle(p, obstacle));
  const mesh = new Obstacle3D('CONTAINER', 100);
  const bounds = obstacleBounds(obstacle);
  assert.equal(mesh.box.max.y, bounds.maxY);
  assert.equal(mesh.box.min.z, 100 - bounds.halfZ);
  assert.equal(mesh.box.max.x, bounds.halfX);
  assert.ok(mesh.box.containsPoint(new THREE.Vector3(0, 4.5, 100)));
  mesh.dispose();
});

test('container variants have finite geometry, consistent dimensions and safe shared resources', () => {
  for (let variant = 0; variant < 4; variant++) {
    const first = new Obstacle3D('CONTAINER', 0, 1, 0, undefined, variant);
    const second = new Obstacle3D('CONTAINER', 20, 1, 0, undefined, variant);
    first.mesh.updateMatrixWorld(true);
    const visual = new THREE.Box3().setFromObject(first.mesh);
    assert.ok(Math.abs(visual.max.y - CONTAINER_SIZE.height) < .001);
    assert.ok(visual.min.y >= -.001);
    first.mesh.traverse(object => {
      if (!object.geometry) return;
      for (const name of ['position', 'normal']) {
        for (const value of object.geometry.getAttribute(name).array) assert.ok(Number.isFinite(value));
      }
    });
    const geometry = first.container.children[0].geometry;
    assert.equal(geometry, second.container.children[0].geometry);
    let disposed = false; geometry.addEventListener('dispose', () => { disposed = true; });
    first.dispose(); assert.equal(disposed, false);
    second.update(4.4, 1 / 60); assert.ok(Number.isFinite(second.box.min.z)); second.dispose();
  }
});

test('harder pace reaches the capped 2.75x speed in under seventy seconds', () => {
  let distance = 0, previous = INITIAL_SPEED, cappedAt;
  const milestones = [];
  for (let frame = 0; frame < 120 * 60; frame++) {
    const speed = speedAt(distance);
    assert.ok(speed >= previous && speed <= MAX_SPEED);
    distance += speed * 14 / 60; previous = speed;
    if (speed === MAX_SPEED && cappedAt === undefined) cappedAt = frame / 60;
    if ((frame + 1) % 1800 === 0) milestones.push(speed);
  }
  assert.ok(milestones[0] > 2.4 && milestones[0] < 2.6);
  assert.ok(milestones[1] > 3.8 && milestones[1] < 3.9);
  assert.ok(cappedAt > 65 && cappedAt < 70);
  assert.ok(milestones[2] > 4.3);
  assert.equal(milestones[3], MAX_SPEED);
  assert.equal(speedAt(-1), INITIAL_SPEED);
});

test('harder rows retain a clear lane and enough clearance to cross after a long container', () => {
  let seed = 9131;
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  for (const count of [3, 5]) for (let at = 0; at < 20000; at += 31) {
    const row = obstacleRow(at, count, random);
    assert.ok(row.length < count);
    assert.equal(new Set(row.map(o => o.lane)).size, row.length);
    if (inRailZone(at)) assert.equal(row.length, 0);
    else if (at >= 3500) assert.equal(row.length, count - 1);
    const gap = rowGapAt(at, random);
    const secondsClear = (gap - CONTAINER_SIZE.depth - 3.2) / (speedAt(at) * 14);
    assert.ok(secondsClear > (count - 1) * .22 + .4 + .2, 'space for lane changes, reaction and network delay');
  }
  assert.ok(obstacleRow(130, 5, random).some(o => o.type === 'CONTAINER'));
});

test('online race accelerates through repeated deaths without resetting speed or the room', () => {
  let now = 1000;
  class Socket extends EventEmitter {
    readyState = 1; bufferedAmount = 0;
    send(data) { this.latest = data; }
  }
  const hub = new RoomHub({ now: () => now });
  const socket = new Socket(); hub.attach(socket); hub.handle(socket, { type: 'create', name: 'Khải' });
  hub.handle(socket, { type: 'ready', ready: true }); hub.handle(socket, { type: 'start' });
  const room = hub.rooms.get(socket.roomCode), player = room.players.get(socket.playerId);
  room.obstacles = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, at: 48 + i * 100,
    lane: player.homeLane, type: 'CONTAINER', count: 1, height: 0, variant: i % 4 }));
  room.nextObstacle = 1e9;
  let respawns = 0, alive = true, sawContainer = false;
  for (let i = 0; i < 9800; i++) {
    now += 10; hub.tick();
    if (!alive && player.alive) respawns++;
    alive = player.alive;
    sawContainer ||= room.obstacles.some(o => o.type === 'CONTAINER');
  }
  assert.equal(room.phase, 'running');
  assert.equal(hub.snapshot(room).speed, MAX_SPEED);
  assert.ok(respawns > 2 && sawContainer);
  assert.ok(player.scoreDistance < room.distance);
  assert.ok(room.obstacles.every(o => o.type !== 'CONTAINER' || Number.isInteger(o.variant)));
});
