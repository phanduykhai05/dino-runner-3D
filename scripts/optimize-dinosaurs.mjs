import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';

await MeshoptSimplifier.ready;
for (const name of ['t-rex', 'triceratops', 'stegosaurus', 'brachiosaurus']) {
  const path = new URL(`../public/models/${name}.glb`, import.meta.url);
  const original = await readFile(path);
  const jsonLength = original.readUInt32LE(12);
  const gltf = JSON.parse(original.subarray(20, 20 + jsonLength));
  if (gltf.asset.extras?.optimizedForRunner) continue;
  await copyFile(path, `/tmp/${name}-original.glb`);
  const binary = original.subarray(28 + jsonLength);
  const primitive = gltf.meshes[0].primitives[0];
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const arrays = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array };
  function accessor(id) {
    const a = gltf.accessors[id];
    const v = gltf.bufferViews[a.bufferView];
    const ArrayType = arrays[a.componentType];
    const size = components[a.type];
    const stride = v.byteStride ?? size * ArrayType.BYTES_PER_ELEMENT;
    const result = new ArrayType(a.count * size);
    for (let i = 0; i < a.count; i++) {
      const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * stride;
      const bytes = binary.subarray(start, start + size * ArrayType.BYTES_PER_ELEMENT);
      result.set(new ArrayType(Uint8Array.from(bytes).buffer), i * size);
    }
    return result;
  }
  const positions = accessor(primitive.attributes.POSITION);
  const indices = accessor(primitive.indices);
  const [reduced] = MeshoptSimplifier.simplify(indices, positions, 3, 55000 * 3, 0.007);
  const used = new Map();
  for (let i = 0; i < reduced.length; i++) {
    const originalIndex = reduced[i];
    if (!used.has(originalIndex)) used.set(originalIndex, used.size);
    reduced[i] = used.get(originalIndex);
  }
  const chunks = [];
  const views = [];
  let offset = 0;
  function append(data, target) {
    const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const view = { buffer: 0, byteOffset: offset, byteLength: bytes.length };
    if (target) view.target = target;
    views.push(view);
    chunks.push(bytes);
    offset += bytes.length;
    const padding = (4 - offset % 4) % 4;
    if (padding) chunks.push(Buffer.alloc(padding));
    offset += padding;
    return views.length - 1;
  }
  for (const id of Object.values(primitive.attributes)) {
    const a = gltf.accessors[id];
    const data = accessor(id);
    const size = components[a.type];
    const compact = new data.constructor(used.size * size);
    for (const [oldIndex, newIndex] of used) compact.set(data.subarray(oldIndex * size, (oldIndex + 1) * size), newIndex * size);
    a.bufferView = append(compact, 34962);
    a.count = used.size;
    a.byteOffset = 0;
  }
  const indexAccessor = gltf.accessors[primitive.indices];
  indexAccessor.bufferView = append(new Uint32Array(reduced), 34963);
  indexAccessor.componentType = 5125;
  indexAccessor.count = reduced.length;
  indexAccessor.byteOffset = 0;
  delete indexAccessor.min;
  delete indexAccessor.max;
  for (const image of gltf.images) {
    const view = gltf.bufferViews[image.bufferView];
    image.bufferView = append(binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
  }
  gltf.bufferViews = views;
  gltf.buffers = [{ byteLength: offset }];
  gltf.asset.extras = { ...gltf.asset.extras, optimizedForRunner: true };
  const json = Buffer.from(JSON.stringify(gltf));
  const paddedJson = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32);
  json.copy(paddedJson);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + paddedJson.length + offset, 8);
  header.writeUInt32LE(paddedJson.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(offset, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  const output = Buffer.concat([header, paddedJson, binHeader, ...chunks]);
  await writeFile(path, output);
  console.log(`${name}: ${indices.length / 3} → ${reduced.length / 3} triangles; ${(output.length / 1e6).toFixed(1)} MB`);
}
