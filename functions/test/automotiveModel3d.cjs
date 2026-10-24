const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MAX_MODEL3D_BYTES, sanitizeModel3d, model3dForPublic, model3dUpdate, validateGlb, model3dStoragePath } = require('../lib/automotiveModel3d');

function glb(mutate = () => {}, mutateBinary = () => {}, binarySize = 44) {
  const binary = Buffer.alloc(binarySize);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((n, i) => binary.writeFloatLE(n, i * 4));
  [0, 1, 2].forEach((n, i) => binary.writeUInt16LE(n, 36 + i * 2));
  mutateBinary(binary);
  const json = {
    asset: { version: '2.0' }, buffers: [{ byteLength: 42 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }, { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    nodes: [{ mesh: 0, name: 'Ponteira' }], scenes: [{ nodes: [0] }], scene: 0
  };
  mutate(json);
  const text = Buffer.from(JSON.stringify(json));
  const jsonChunk = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32); text.copy(jsonChunk);
  const file = Buffer.alloc(12 + 8 + jsonChunk.length + 8 + binary.length);
  file.writeUInt32LE(0x46546c67, 0); file.writeUInt32LE(2, 4); file.writeUInt32LE(file.length, 8);
  file.writeUInt32LE(jsonChunk.length, 12); file.writeUInt32LE(0x4e4f534a, 16); jsonChunk.copy(file, 20);
  file.writeUInt32LE(binary.length, 20 + jsonChunk.length); file.writeUInt32LE(0x004e4942, 24 + jsonChunk.length); binary.copy(file, 28 + jsonChunk.length);
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}

const storeId = 'owner_123';
const path = `automotive-models/${storeId}/12345678-1234-1234-1234-123456789abc.glb`;
const model = { url: `https://firebasestorage.googleapis.com/v0/b/iapedido.firebasestorage.app/o/${encodeURIComponent(path)}?alt=media&token=token`, fileName: 'Porsche catback.glb', sizeBytes: 1024, source: 'photos', referenceImages: ['https://example.com/gallery.jpg', 'https://example.com/other.jpg'] };

test('accepts a static self-contained GLB fixture with a mesh', () => assert.doesNotThrow(() => validateGlb(glb())));
test('rejects non-GLB, bad version, incomplete/chunk length, and oversized input', () => {
  const badMagic = glb(); new DataView(badMagic).setUint32(0, 0, true);
  const badVersion = glb(); new DataView(badVersion).setUint32(4, 1, true);
  const badLength = glb(); new DataView(badLength).setUint32(8, 20, true);
  const badChunk = glb(); new DataView(badChunk).setUint32(12, 0xfffffff0, true);
  for (const value of [new ArrayBuffer(12), badMagic, badVersion, badLength, badChunk, new ArrayBuffer(MAX_MODEL3D_BYTES + 1)]) assert.throws(() => validateGlb(value));
});
test('blocks external/data references and unsupported compressed formats before a renderer', () => {
  for (const mutate of [
    d => d.buffers[0].uri = 'https://other.example/geometry.bin',
    d => d.images = [{ uri: 'data:image/png;base64,AAAA' }],
    d => d.images = [{ uri: 'https://other.example/image.png' }],
    d => d.extensionsUsed = ['KHR_draco_mesh_compression'],
    d => d.meshes[0].primitives[0].extensions = { EXT_meshopt_compression: {} },
    d => d.extensionsRequired = ['KHR_texture_basisu']
  ]) assert.throws(() => validateGlb(glb(mutate)));
});
test('rejects empty geometry, invalid accessors, nonfinite binary values and out-of-range indices', () => {
  for (const mutate of [
    d => d.meshes = [], d => d.meshes[0].primitives = [],
    d => d.accessors[0].count = 9000000, d => d.accessors[0].bufferView = 5,
    d => d.accessors[0].sparse = {}, d => d.bufferViews[0].byteLength = 9000,
    d => d.meshes[0].primitives[0].attributes.POSITION = 9000,
    d => d.accessors[0].type = 'VEC4', d => d.accessors[0].min = [0],
    d => d.nodes[0].matrix = [1], d => d.nodes[0].children = [0],
    d => d.scenes[0].nodes = [], d => d.scene = 7, d => d.scenes[0].nodes = [0, 0],
    d => d.nodes[0].mesh = 9000,
    d => d.animations = [{}]
  ]) assert.throws(() => validateGlb(glb(mutate)));
  assert.throws(() => validateGlb(glb(() => {}, bytes => bytes.writeFloatLE(Infinity, 0))));
  assert.throws(() => validateGlb(glb(() => {}, bytes => bytes.writeUInt16LE(4, 36))));
});
test('validates canonical tenant bucket and storage path, strips extra metadata', () => {
  assert.equal(model3dStoragePath(model.url, storeId), path);
  assert.deepEqual(sanitizeModel3d({ ...model, secret: 'do not expose' }, storeId), model);
  for (const value of [
    { ...model, url: model.url.replace('iapedido.firebasestorage.app', 'other.firebasestorage.app') },
    { ...model, url: model.url.replace('https:', 'http:') },
    { ...model, url: model.url.replace('firebasestorage.googleapis.com', 'attacker.example') },
    { ...model, url: model.url.replace('owner_123', 'another_owner') },
    { ...model, url: model.url.replace('12345678-1234-1234-1234-123456789abc.glb', 'arbitrary.glb') },
    { ...model, source: 'unknown' }, { ...model, sizeBytes: MAX_MODEL3D_BYTES + 1 },
    { ...model, sizeBytes: NaN }, { ...model, fileName: '../model.glb' },
    { ...model, referenceImages: ['javascript:alert(1)'] }
  ]) assert.throws(() => sanitizeModel3d(value, storeId));
});
test('bounds embedded PNG/JPEG/WebP decoded texture dimensions and total pixels', () => {
  const png = (width, height) => bytes => {
    bytes.writeUInt32BE(0x89504e47, 0); bytes.writeUInt32BE(0x0d0a1a0a, 4);
    bytes.write('IHDR', 12); bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20);
  };
  const image = mimeType => d => d.images = [{ bufferView: 0, mimeType }];
  assert.doesNotThrow(() => validateGlb(glb(image('image/png'), png(256, 256))));
  assert.throws(() => validateGlb(glb(image('image/png'), png(8192, 256))));
  assert.throws(() => validateGlb(glb(image('image/png'), png(0, 256))));
  assert.throws(() => validateGlb(glb(d => d.images = Array.from({ length: 5 }, () => ({ bufferView: 0, mimeType: 'image/png' })), png(2048, 2048))));
  assert.doesNotThrow(() => validateGlb(glb(image('image/jpeg'), bytes => {
    bytes.writeUInt16BE(0xffd8, 0); bytes.writeUInt16BE(0xffc0, 2); bytes.writeUInt16BE(17, 4);
    bytes[6] = 8; bytes.writeUInt16BE(240, 7); bytes.writeUInt16BE(320, 9);
  })));
  assert.doesNotThrow(() => validateGlb(glb(image('image/webp'), bytes => {
    bytes.write('RIFF', 0); bytes.writeUInt32LE(28, 4); bytes.write('WEBPVP8X', 8); bytes.writeUInt32LE(10, 16);
    bytes[24] = 0xff; bytes[25] = 3; bytes[26] = 0; bytes[27] = 0xff; bytes[28] = 1; bytes[29] = 0;
  })));
});
test('absent model field preserves association, explicit null clears and gallery references stay bounded', () => {
  assert.deepEqual(model3dUpdate({ name: 'changed' }, storeId, []), {});
  assert.deepEqual(model3dUpdate({ model3d: null }, storeId, []), { model3d: null });
  const result = model3dUpdate({ model3d: model }, storeId, ['https://example.com/gallery.jpg']);
  assert.deepEqual(result.model3d.referenceImages, ['https://example.com/gallery.jpg']);
  assert.equal(model3dForPublic({ ...model, url: 'https://attacker.example/model.glb' }, storeId, []), null);
  assert.equal(model3dForPublic(undefined, storeId), null);
  assert.deepEqual(model3dUpdate({ model3d: { ...model, source: 'cad' } }, storeId, model.referenceImages).model3d.referenceImages, []);
  assert.deepEqual(model3dUpdate({ model3d: { ...model, referenceImages: undefined } }, storeId, model.referenceImages).model3d.referenceImages, []);
  assert.deepEqual(model3dUpdate({ model3d: model }, storeId, []).model3d.referenceImages, []);
});
test('caps repeated accessors before excessive synchronous scans and budgets all loaded scenes', () => {
  const larger = extra => glb(d => {
    d.buffers[0].byteLength = 30_000_006;
    d.bufferViews[0].byteLength = 30_000_000;
    d.bufferViews[1].byteOffset = 30_000_000;
    d.accessors[0].count = 2_000_000;
    extra(d);
  }, () => {}, 30_000_008);
  assert.throws(() => validateGlb(larger(d => d.accessors.push(...Array.from({ length: 45 }, () => ({ ...d.accessors[0] }))))));
  assert.throws(() => validateGlb(larger(d => d.scenes = [{ nodes: [0] }, { nodes: [0] }, { nodes: [0] }])));
});
