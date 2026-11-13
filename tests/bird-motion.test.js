import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

const clips = ['pteranodon-flap', 'pteranodon-glide'].map(name =>
  THREE.AnimationClip.parse(JSON.parse(readFileSync(new URL(`../public/models/${name}.json`, import.meta.url), 'utf8'))));

test('flight clips retain distinct identities and seamless, finite keyframes', () => {
  assert.ok(clips[0].uuid && clips[1].uuid);
  assert.notEqual(clips[0].uuid, clips[1].uuid);
  for (const clip of clips) {
    assert.ok(clip.duration > 0);
    for (const track of clip.tracks) {
      const size = track.getValueSize();
      assert.equal(track.values.length, track.times.length * size);
      for (const value of track.values) assert.ok(Number.isFinite(value));
      for (let i = 0; i < size; i++) {
        assert.ok(Math.abs(track.values[i] - track.values[track.values.length - size + i]) < 0.0001, track.name);
      }
    }
  }
});

test('both wings move during flapping and blend into a separate glide action', () => {
  const root = new THREE.Group();
  for (const name of new Set(clips.flatMap(clip => clip.tracks.map(track => track.name.slice(0, track.name.lastIndexOf('.')))))) {
    const joint = new THREE.Bone();
    joint.name = name;
    root.add(joint);
  }
  const mixer = new THREE.AnimationMixer(root);
  const flap = mixer.clipAction(clips[0]).play();
  const glide = mixer.clipAction(clips[1]).play();
  assert.notEqual(flap, glide);
  flap.setEffectiveWeight(1);
  glide.setEffectiveWeight(0);
  mixer.setTime(0);
  const arms = root.children.filter(bone => /^[LR]upperArm/.test(bone.name));
  assert.equal(arms.length, 2);
  const initial = arms.map(bone => bone.quaternion.clone());
  mixer.update(clips[0].duration / 4);
  arms.forEach((bone, i) => assert.ok(bone.quaternion.angleTo(initial[i]) > 0.2, bone.name));
  flap.setEffectiveWeight(0);
  glide.setEffectiveWeight(1);
  assert.equal(flap.getEffectiveWeight(), 0);
  assert.equal(glide.getEffectiveWeight(), 1);
});
