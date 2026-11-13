import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RockField, createRoadEdge, createRockGeometry, GROUND_START } from '../src/terrain3d.js';

test('road shoulders fade completely at both edges for single and five-lane widths', () => {
  for (const width of [14, 34]) {
    const map = createRoadEdge(width), { width: w, height: h, data } = map.image;
    for (let row = 0; row < h; row++) {
      assert.equal(data[row * w * 4 + 1], 0);
      assert.equal(data[(row * w + w - 1) * 4 + 1], 0);
      assert.equal(data[(row * w + Math.floor(w / 2)) * 4 + 1], 255);
    }
    map.dispose();
  }
});

test('stone meshes are finite and grounded; decorative gravel remains low and large rocks stay off the course', () => {
  const scene = new THREE.Scene(), field = new RockField(scene, 14, 320, null);
  for (const width of [14, 34, 14]) {
    field.setWidth(width);
    field.update(10000);
    const matrix = new THREE.Matrix4();
    for (const stone of field.stones) {
      assert.ok(stone.position.z >= GROUND_START && stone.position.z < GROUND_START + 320);
      if (stone.shoulder) assert.ok(Math.abs(stone.position.x) >= width / 2 + .6);
      else {
        assert.ok(Math.abs(stone.position.x) <= width / 2);
        const top = field.meshes[stone.variant].geometry.boundingBox.max.y * stone.scale.y + stone.position.y;
        assert.ok(top < .12, 'small decorative stones do not resemble jump obstacles');
      }
      field.meshes[stone.variant].getMatrixAt(stone.index, matrix);
      assert.ok(matrix.elements.every(Number.isFinite));
    }
  }
  for (let variant = 0; variant < 6; variant++) {
    const geometry = createRockGeometry(variant);
    for (const value of geometry.getAttribute('position').array) assert.ok(Number.isFinite(value));
    assert.ok(Math.abs(geometry.boundingBox.min.y) < 1e-6);
    geometry.dispose();
  }
});
