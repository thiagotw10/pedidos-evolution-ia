const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  registerAutomotiveRoutes,
  extractAutomotiveContextFromText,
  saveAutomotiveContactAndSyncCrm
} = require('../lib/automotive');

function setup(segment = 'AUTOMOTIVE_PARTS') {
  const routes = {}; const docs = new Map();
  function makeCollection(basePath) {
    return {
      doc(id) {
        const key = `${basePath}/${id}`;
        const ref = {
          id,
          key,
          collection: subName => makeCollection(`${key}/${subName}`),
          get: async () => ({
            id,
            exists: basePath === 'establishments' || docs.has(key),
            data: () => basePath === 'establishments' && !docs.has(key) ? { segment, phone: '5581999999999' } : docs.get(key),
            ref
          }),
          set: async (value, opts) => {
            docs.set(key, opts && opts.merge ? { ...(docs.get(key) || {}), ...value } : value);
          }
        };
        return ref;
      },
      where(field, op, val) {
        return {
          get: async () => {
            const matched = [];
            for (const [k, v] of docs.entries()) {
              if (k.startsWith(`${basePath}/`) && !k.slice(basePath.length + 1).includes('/')) {
                if (op === '==' && v && v[field] === val) {
                  const id = k.slice(basePath.length + 1);
                  matched.push({
                    id,
                    data: () => v,
                    ref: {
                      id,
                      key: k,
                      set: async (nextVal, opts) => {
                        docs.set(k, opts && opts.merge ? { ...(docs.get(k) || {}), ...nextVal } : nextVal);
                      }
                    }
                  });
                }
              }
            }
            return { docs: matched, empty: matched.length === 0 };
          }
        };
      },
      get: async () => ({ docs: [] })
    };
  }
  const db = {
    collection(name) {
      return makeCollection(name);
    },
    async runTransaction(fn) { return fn({ get: ref => ref.get(), create: (ref, value) => docs.set(ref.key, value), set: (ref, value) => docs.set(ref.key, value), update: (ref, value) => docs.set(ref.key, { ...docs.get(ref.key), ...value }) }); }
  };
  const app = { post: (p, f) => { if (p === '/api/public/automotive/:storeId/projects') routes.post = f; }, use: (p, f) => routes.auth = f, get: () => {}, patch: (p, f) => routes.patch = f };
  registerAutomotiveRoutes(app, db);
  async function call(handler, body, extras = {}) {
    const res = { code: 200, locals: { uid: 'other-store' }, status(c) { this.code = c; return this; }, json(value) { this.body = value; return this; } };
    await handler({ params: { storeId: 'store', id: 'private-project' }, ip: '127.0.0.1', body, ...extras }, res); return res;
  }
  return { docs, routes, call, db };
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
test('salva contexto da conversa por contato/estabelecimento e cria/atualiza lead no CRM de performance', async () => {
  const { docs, db } = setup();
  const parsed = extractAutomotiveContextFromText('Meu nome é Rafael, tenho uma BMW M3 2023 Competition Stage 2 e quero um catback valvulado em inox para o CEP 04538-132');
  assert.equal(parsed.brand, 'BMW');
  assert.equal(parsed.model, 'M3');
  assert.equal(parsed.year, '2023');
  assert.equal(parsed.cep, '04538132');
  assert.equal(parsed.delivery, 'Envio nacional');

  // Turno 1: Cliente informa veículo e objetivo no WhatsApp
  const turn1 = await saveAutomotiveContactAndSyncCrm({
    db,
    establishmentId: 'store_perf',
    customerPhone: '5511988887777',
    customerName: 'Rafael',
    incomingText: 'Oi, tenho uma BMW M3 2023 Competition e quero fazer um escapamento catback valvulado em inox',
    replyText: 'Excelente máquina! Para calcularmos o envio ou agendar na oficina, qual o seu CEP ou prefere atendimento local?'
  });

  assert.equal(turn1.isNewProject, true);
  assert.equal(turn1.project.brand, 'BMW');
  assert.equal(turn1.project.model, 'M3');
  assert.equal(turn1.project.status, 'Qualificação');

  // Verifica que o contexto foi salvo por estabelecimento tanto em chats quanto em customers
  const savedChat = docs.get('establishments/store_perf/chats/5511988887777');
  const savedCustomer = docs.get('establishments/store_perf/customers/5511988887777');
  assert.ok(savedChat);
  assert.ok(savedCustomer);
  assert.equal(savedChat.automotiveContext.brand, 'BMW');
  assert.equal(savedCustomer.automotiveContext.model, 'M3');

  // Turno 2: Cliente envia CEP e modificações -> acumula contexto sem perder dados anteriores e avança CRM para Análise técnica
  const turn2 = await saveAutomotiveContactAndSyncCrm({
    db,
    establishmentId: 'store_perf',
    customerPhone: '5511988887777',
    incomingText: 'O carro já tem downpipe e Stage 2, quero envio nacional para o CEP 04538-132',
    replyText: 'Perfeito, Rafael! Sua ficha foi atualizada para análise técnica.'
  });

  assert.equal(turn2.isNewProject, false);
  assert.equal(turn2.justQualified, true);
  assert.equal(turn2.project.brand, 'BMW');
  assert.equal(turn2.project.model, 'M3');
  assert.equal(turn2.project.year, '2023');
  assert.equal(turn2.project.cep, '04538132');
  assert.equal(turn2.project.delivery, 'Envio nacional');
  assert.equal(turn2.project.status, 'Análise técnica');
});
