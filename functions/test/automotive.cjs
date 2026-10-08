const { test } = require('node:test');
const assert = require('node:assert/strict');
const { registerAutomotiveRoutes } = require('../lib/automotive');

function setup(segment = 'AUTOMOTIVE_PARTS') {
  const routes = {}; const docs = new Map();
  const db = {
    collection(name) {
      return { doc(id) {
        const key = `${name}/${id}`;
        const ref = { key, collection: () => ({ get: async () => ({ docs: [] }) }), get: async () => ({ exists: name === 'establishments' || docs.has(key), data: () => name === 'establishments' ? { segment, phone: '5581999999999' } : docs.get(key), ref }) };
        return ref;
      } };
    },
    async runTransaction(fn) { return fn({ get: ref => ref.get(), create: (ref, value) => docs.set(ref.key, value), set: (ref, value) => docs.set(ref.key, value), update: (ref, value) => docs.set(ref.key, { ...docs.get(ref.key), ...value }) }); }
  };
  const app = { post: (p, f) => routes.post = f, use: (p, f) => routes.auth = f, get: () => {}, patch: (p, f) => routes.patch = f };
  registerAutomotiveRoutes(app, db);
  async function call(handler, body, extras = {}) {
    const res = { code: 200, locals: { uid: 'other-store' }, status(c) { this.code = c; return this; }, json(value) { this.body = value; return this; } };
    await handler({ params: { storeId: 'store', id: 'private-project' }, ip: '127.0.0.1', body, ...extras }, res); return res;
  }
  return { docs, routes, call };
}
const payload = { customerName: 'Teste', phone: '81999999999', brand: 'Porsche', model: '911', year: '2024', objective: 'Consultar projeto', cep: '50000000', delivery: 'Envio nacional', requestId: '12345678-1234-1234-1234-123456789012' };
test('solicitação validada e repetição não duplicam projeto', async () => {
  const { docs, routes, call } = setup();
  const first = await call(routes.post, payload); const second = await call(routes.post, payload);
  assert.equal(first.code, 200); assert.equal(second.body.id, first.body.id);
  assert.equal([...docs.keys()].filter(k => k.startsWith('automotive_projects/')).length, 1);
  assert.match(first.body.whatsappUrl, /^https:\/\/wa.me\//);
});
test('rejeita CEP inválido e não afeta outro segmento', async () => {
  let env = setup(); assert.equal((await env.call(env.routes.post, { ...payload, cep: '' })).code, 400);
  env = setup('FOOD'); assert.equal((await env.call(env.routes.post, payload)).code, 404);
});
test('limite de dez solicitações por hora', async () => {
  const { routes, call } = setup();
  for (let i = 0; i < 10; i++) assert.equal((await call(routes.post, { ...payload, requestId: `12345678-1234-1234-1234-${String(i).padStart(12, '0')}` })).code, 200);
  assert.equal((await call(routes.post, payload)).code, 429);
});
test('não permite alterar projeto de outro estabelecimento', async () => {
  const { docs, routes, call } = setup(); docs.set('automotive_projects/private-project', { establishmentId: 'owner', status: 'Novo contato' });
  assert.equal((await call(routes.patch, { status: 'Aprovado' })).code, 403);
  assert.equal(docs.get('automotive_projects/private-project').status, 'Novo contato');
});
