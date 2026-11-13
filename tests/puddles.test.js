import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PuddleField } from '../src/puddles3d.js';
import { laneX } from '../shared/race.js';
import { obstacleRow } from '../shared/course.js';

test('puddles stay on the road, scroll with world distance and use bounded drawing resources', () => {
  const field = new PuddleField(new THREE.Scene(), 320, null);
  for (const lanes of [3, 5, 3]) {
    const width = lanes * 6.4 + 2;
    field.setRoad(lanes, width);
    for (const distance of [0, 57, 59, 300, 100000, 50]) {
      field.update(distance);
      assert.equal(field.mesh.count, lanes * field.rows);
      assert.equal(field.mesh.castShadow, false);
      for (const puddle of field.entries) {
        assert.ok(Math.abs(puddle.x - laneX(puddle.lane)) < .36);
        assert.ok(Math.abs(puddle.x) + puddle.width / 2 + .6 < width / 2);
        assert.ok(Math.abs(puddle.worldZ - distance - puddle.z) < 1e-8);
        assert.ok([puddle.z, puddle.width, puddle.depth, puddle.seed].every(Number.isFinite));
      }
    }
  }
});

test('all clients see identical puddles at the same progress; water is absent from obstacle rows', () => {
  const a = new PuddleField(new THREE.Scene(), 320, null), b = new PuddleField(new THREE.Scene(), 320, null);
  a.setRoad(5, 34); b.setRoad(5, 34);
  a.update(389.4); b.update(389.4);
  assert.deepEqual(a.entries, b.entries);
  const stable = a.entries.find(p => p.z > 30 && p.z < 100);
  a.update(391.4);
  const next = a.entries.find(p => p.tile === stable.tile && p.lane === stable.lane);
  assert.equal(next.worldZ, stable.worldZ);
  assert.equal(next.seed, stable.seed);
  assert.ok(Math.abs(next.z - stable.z + 2) < 1e-8);
  for (let at = 0; at < 5000; at += 37) {
    assert.ok(obstacleRow(at, 5).every(o => ['CONTAINER', 'PTERODACTYL', 'CACTUS_SMALL', 'CACTUS_LARGE'].includes(o.type)));
  }
});
