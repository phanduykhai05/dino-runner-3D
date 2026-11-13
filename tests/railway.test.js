import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as THREE from 'three';
import { TRAIN_SPEED, MAX_SPEED, laneX, hitsObstacle, applyInput, stepPlayer, trainPoseAt, trainCarPoses } from '../shared/race.js';
import { railSection, trainForSection, inRailZone } from '../shared/railway.js';
import { obstacleRow } from '../shared/course.js';
import { Obstacle3D, Obstacle3DManager } from '../src/obstacles3d.js';
import { RailwayField } from '../src/railway3d.js';
import { RoomHub } from '../server/rooms.js';

test('periodic railway sections rotate lanes and leave all neighboring lanes clear', () => {
  for (const count of [3, 5]) for (let index = 0; index < 20; index++) {
    const section = railSection(index, count), train = trainForSection(index, count);
    assert.ok(section.lane >= (5 - count) / 2 && section.lane < (5 + count) / 2);
    assert.equal(train.lane, section.lane);
    assert.equal(train.velocity, TRAIN_SPEED);
    for (let at = section.triggerAt - 35; at <= section.start + 225; at += 3) {
      assert.ok(inRailZone(at));
      assert.deepEqual(obstacleRow(at, count), []);
    }
    assert.ok(obstacleRow(section.start + 226, count).length > 0);
    const timeToFront = (train.at - section.triggerAt - 16) / (MAX_SPEED * 14 + TRAIN_SPEED);
    assert.ok(timeToFront > (count - 1) * .22 + .4 + .2);
    const tailPassAt = section.triggerAt + (train.at - section.triggerAt + 17.5) / (MAX_SPEED * 14 + TRAIN_SPEED) * MAX_SPEED * 14;
    const clearAfterTrain = (section.start + 225 - 6.6 - tailPassAt) / (MAX_SPEED * 14);
    assert.ok(clearAfterTrain > (count - 1) * .22 + .4 + .2, 'time to dodge the next row after the train tail');
  }
});

test('oncoming train blocks jump and duck; changing to an adjacent lane avoids it', () => {
  const train = { type: 'TRAIN', lane: 2, at: 100 };
  const player = { alive: true, lane: 2, x: 0, distance: 100, y: 0, vy: 0 };
  assert.ok(hitsObstacle(player, train));
  applyInput(player, { duck: true }); assert.ok(hitsObstacle(player, train));
  applyInput(player, { jump: true });
  for (let i = 0; i < 29; i++) stepPlayer(player, 1 / 60, 0);
  assert.ok(player.y > 3 && hitsObstacle(player, train));
  player.x = laneX(1); assert.equal(hitsObstacle(player, train), false);
  player.x = 0; train.at = 118; assert.equal(hitsObstacle(player, train), false);
});

test('train geometry is finite, wheels animate independently and long trains are not culled early', () => {
  const first = new Obstacle3D('TRAIN', 100), second = new Obstacle3D('TRAIN', 100);
  first.mesh.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(first.mesh);
  assert.ok(Math.abs(bounds.max.y - 5.4) < .001 && bounds.min.y >= .19);
  first.mesh.traverse(object => {
    for (const value of object.geometry?.getAttribute('position').array ?? []) assert.ok(Number.isFinite(value));
  });
  first.update(2, .1);
  assert.ok(Math.abs(first.z - (100 - (28 + TRAIN_SPEED) * .1)) < 1e-9);
  assert.notEqual(first.train.wheels[0].rotation.x, second.train.wheels[0].rotation.x);
  assert.equal(first.train.cars[0].children[0].geometry, second.train.cars[0].children[0].geometry);
  let disposed = false;
  first.train.cars[0].children[0].geometry.addEventListener('dispose', () => { disposed = true; });
  first.dispose(); assert.equal(disposed, false);
  const manager = new Obstacle3DManager(new THREE.Scene());
  manager.nextSpawnDistance = 1e9;
  manager.update(0, 240, 0);
  assert.equal(manager.obstacles.filter(o => o.type === 'TRAIN').length, 1);
  manager.update(0, 240, 0); assert.equal(manager.obstacles.length, 1);
  manager.obstacles[0].updateAt(-13, 0);
  manager.update(0, 240, 0); assert.equal(manager.obstacles.length, 1);
  manager.obstacles[0].updateAt(-21, 0);
  manager.update(0, 240, 0); assert.equal(manager.obstacles.length, 0);
  manager.reset(); assert.equal(manager.nextTrainSection, 0);
});

test('rail scenery uses world distance and shared lanes without creating collision objects', () => {
  const scene = new THREE.Scene(), field = new RailwayField(scene, new THREE.Texture());
  field.update(0); assert.ok(field.sections.every(s => !s.group.visible));
  field.update(400, 1);
  assert.equal(field.sections[0].group.position.z, -40);
  assert.equal(field.sections[0].group.position.x, laneX(2));
  field.setLaneCount(5); field.update(railSection(1).start + 40, 1);
  assert.equal(field.sections[0].group.position.x, laneX(4));
  field.update(800); assert.equal(field.sections[0].group.visible, false);
});

test('server spawns one train, advances it toward all five players and shares its position', () => {
  let now = 1000;
  class Socket extends EventEmitter {
    readyState = 1; bufferedAmount = 0;
    send(data) { const message = JSON.parse(data); if (message.type === 'snapshot') this.latest = message; }
  }
  const hub = new RoomHub({ now: () => now }), sockets = [];
  const advance = ms => { for (let left = ms; left > 0; left -= 10) { now += 10; hub.tick(); } };
  for (let i = 0; i < 5; i++) {
    const socket = new Socket(); hub.attach(socket); sockets.push(socket);
    hub.handle(socket, i ? { type: 'join', name: `Player ${i}`, code: sockets[0].roomCode } : { type: 'create', name: 'Host' });
    hub.handle(socket, { type: 'ready', ready: true });
  }
  const room = hub.rooms.get(sockets[0].roomCode);
  hub.handle(sockets[0], { type: 'start' }); advance(3000);
  room.obstacles = []; room.nextObstacle = 1e9;
  while (room.distance < 245) advance(10);
  const train = room.obstacles.find(o => o.type === 'TRAIN'), before = train.at;
  assert.ok(train && train.lane === 2);
  advance(100);
  assert.ok(Math.abs(train.at - (before - TRAIN_SPEED * .1)) < 1e-6);
  assert.equal(room.obstacles.filter(o => o.type === 'TRAIN').length, 1);
  for (const socket of sockets) assert.deepEqual(socket.latest.obstacles, sockets[0].latest.obstacles);
  assert.equal(hub.snapshot(room).courseSeed, room.courseSeed);
  assert.deepEqual(train, { ...trainForSection(0, 5, room.courseSeed), id: train.id, at: train.at });
  const middle = [...room.players.values()].find(p => p.homeLane === train.targetLane);
  const side = [...room.players.values()].find(p => p.homeLane === 2);
  room.distance = train.curveStart - 25;
  for (const player of room.players.values()) player.distance = room.distance;
  train.at = room.distance;
  advance(50);
  assert.equal(middle.alive, false); assert.equal(side.alive, true);
  advance(3010);
  assert.equal(middle.alive, true); assert.equal(room.phase, 'running');
});

test('left and right railway bends are deterministic, smooth and remain inside the road', () => {
  const turns = new Set();
  for (const laneCount of [3, 5]) for (let seed = 0; seed < 32; seed++) for (let index = 0; index < 6; index++) {
    const section = railSection(index, laneCount, seed), train = trainForSection(index, laneCount, seed);
    turns.add(section.turn);
    assert.deepEqual(railSection(index, laneCount, seed), section);
    assert.equal(Math.abs(section.targetLane - section.lane), 1);
    assert.ok(section.targetLane >= (5 - laneCount) / 2 && section.targetLane < (5 + laneCount) / 2);
    assert.equal(trainPoseAt(section, section.curveStart).x, laneX(section.targetLane));
    assert.equal(trainPoseAt(section, section.curveEnd).x, laneX(section.lane));
    assert.ok(Math.abs(trainPoseAt(section, section.curveStart).yaw) < 1e-10);
    for (let at = section.curveStart - 20; at <= section.curveEnd + 20; at += 7) {
      const pose = trainPoseAt(section, at);
      assert.ok(Number.isFinite(pose.yaw) && Math.abs(pose.yaw) < .12);
      const neighboringLanes = Array.from({ length: laneCount }, (_, i) => i + (5 - laneCount) / 2)
        .filter(lane => lane !== section.lane && lane !== section.targetLane);
      for (const lane of neighboringLanes) assert.equal(hitsObstacle({ lane, x: laneX(lane), distance: at, y: 0, vy: 0 }, { ...train, at }), false);
    }
  }
  assert.deepEqual([...turns].sort(), [-1, 1]);
});

test('articulated cars, curved rails and local/server collisions follow the same path', () => {
  for (const seed of [0, 1, 2, 3]) {
    const route = trainForSection(0, 3, seed); route.at = (route.curveStart + route.curveEnd) / 2;
    const obstacle = new Obstacle3D('TRAIN', 0, 1, 0, undefined, 0, route);
    const poses = trainCarPoses(route);
    for (let i = 0; i < 3; i++) {
      assert.equal(obstacle.train.cars[i].position.x, poses[i].x);
      assert.equal(obstacle.train.cars[i].rotation.y, poses[i].yaw);
    }
    assert.notEqual(poses[0].yaw, poses[1].yaw);
    let excludedEmptySpace = false;
    for (let x = -10; x <= 10; x += .4) for (let z = -18; z <= 18; z += 2) {
      const player = { lane: 2, x, distance: route.at + z, y: 0, vy: 0 };
      const box = new THREE.Box3(new THREE.Vector3(x - .5, .425, z - 1.1), new THREE.Vector3(x + .5, 2.975, z + 1.1));
      const serverHit = hitsObstacle(player, route), localHit = obstacle.intersectsBox(box);
      assert.equal(localHit, serverHit);
      excludedEmptySpace ||= obstacle.box.intersectsBox(box) && !localHit;
    }
    assert.ok(excludedEmptySpace, 'a broad box around the whole bend must not cause phantom collisions');
    const field = new RailwayField(new THREE.Scene(), new THREE.Texture());
    field.setSeed(seed); field.update(400);
    const pool = field.sections[0], vertices = pool.bed.geometry.attributes.position;
    for (const i of [0, 40, 65, 100, 200]) {
      const centreX = (vertices.getX(i * 2) + vertices.getX(i * 2 + 1)) / 2 + pool.group.position.x;
      assert.ok(Math.abs(centreX - trainPoseAt(route, route.railStart + i * 1.5).x) < 1e-5);
    }
  }
});
