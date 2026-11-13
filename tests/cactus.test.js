import test from 'node:test';
import assert from 'node:assert/strict';
import { Obstacle3D } from '../src/obstacles3d.js';
import { obstacleBounds } from '../shared/race.js';

test('rounded cactus surfaces stay finite, jumpable and consistent with online collision bounds', () => {
  for (const type of ['CACTUS_SMALL', 'CACTUS_LARGE']) for (const count of [1, 2, 3]) {
    const cactus = new Obstacle3D(type, 12, count);
    const skin = cactus.mesh.children[0].children[0];
    const geometry = skin.geometry;
    for (const name of ['position', 'normal', 'color']) {
      for (const value of geometry.getAttribute(name).array) assert.ok(Number.isFinite(value), `${type}/${count}/${name}`);
    }
    geometry.computeBoundingBox();
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    const vertex = 10 * 41 + 5;
    const offset = -(count - 1) / 2 * (type === 'CACTUS_LARGE' ? 0.98 : 0.8);
    assert.ok((positions.getX(vertex) - offset) * normals.getX(vertex)
      + positions.getZ(vertex) * normals.getZ(vertex) > 0.1, 'skin normals face outward');
    const expectedHeight = (type === 'CACTUS_LARGE' ? 1.85 : 1.35) * (count > 1 ? 1.08 : 1);
    assert.ok(Math.abs(geometry.boundingBox.max.y - expectedHeight) < 0.002);
    assert.ok(geometry.boundingBox.min.y >= -0.03, 'root only slightly enters the ground');
    assert.ok(geometry.boundingBox.max.z <= (type === 'CACTUS_LARGE' ? 0.25 : 0.2) + 0.002);
    const bounds = obstacleBounds({ type, count });
    assert.equal(cactus.box.min.y, bounds.minY);
    assert.equal(cactus.box.max.y, bounds.maxY);
    assert.equal(cactus.box.min.z, 12 - bounds.halfZ);
    assert.equal(cactus.box.max.z, 12 + bounds.halfZ);
    cactus.mesh.position.x = 6.4;
    cactus.update(1.6, 1 / 60);
    assert.equal(cactus.box.min.x, 6.4 - bounds.halfX);
    assert.equal(cactus.box.max.z, cactus.z + bounds.halfZ);
    cactus.dispose();
  }
});

test('lanes share cactus buffers and removing one obstacle keeps the others intact', () => {
  const first = new Obstacle3D('CACTUS_LARGE', 12, 3);
  const second = new Obstacle3D('CACTUS_LARGE', 24, 3);
  const geometry = first.cactus.children[0].geometry;
  assert.equal(geometry, second.cactus.children[0].geometry);
  let disposed = false;
  geometry.addEventListener('dispose', () => { disposed = true; });
  first.dispose();
  assert.equal(disposed, false);
  second.update(1.6, 1 / 60);
  assert.ok(second.box.max.y > 1.8);
  second.dispose();
});
