const { test } = require('node:test');
const assert = require('node:assert/strict');
const { visibleForSegment } = require('../lib/catalogPolicy');
const samples = [
  { id: 'prod_1', name: 'Item Especial da Casa', description: 'Receita artesanal exclusiva com acompanhamentos frescos.', imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600' },
  { id: 'prod_2', name: 'Refrigerante Lata 350ml', description: 'Bebida bem gelada para acompanhar.', imageUrl: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600' }
];
test('oculta apenas exemplos antigos no nicho automotivo', () => {
  const real = { id: 'project', name: 'Projeto Porsche 992' };
  assert.deepEqual(visibleForSegment([...samples, real], 'AUTOMOTIVE_PARTS'), [real]);
});
test('preserva alimentação e outros nichos', () => {
  for (const segment of ['FOOD', 'GENERAL', 'VEHICLES', undefined]) assert.deepEqual(visibleForSegment(samples, segment), samples);
});
test('preserva produto editado pelo usuário e não modifica dados', () => {
  const custom = { ...samples[0], name: 'Projeto de escapamento' };
  assert.deepEqual(visibleForSegment([custom], 'AUTOMOTIVE_PARTS'), [custom]);
  visibleForSegment(samples, 'AUTOMOTIVE_PARTS'); assert.equal(samples.length, 2);
});
