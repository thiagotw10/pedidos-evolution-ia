const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { validInstagramSignature, extractInstagramMessages, instagramTextParts, processInstagramEvent,
  registerInstagramWebhookRoutes, sendInstagramDirect } = require('../lib/instagramWebhook');

function fakeDb(seed = {}) {
  const data = new Map(Object.entries(seed));
  let auto = 0;
  const doc = path => ({ path, id: path.split('/').pop(),
    get: async () => { const exists = data.has(path); const value = data.get(path); return { exists, data: () => value }; },
    set: async (value, options) => { data.set(path, options?.merge ? { ...data.get(path), ...value } : value); },
    update: async value => { const previous = data.get(path) || {}; const next = { ...previous, ...value };
      if (typeof value.attempts === 'object') next.attempts = Number(previous.attempts || 0) + 1;
      data.set(path, next); },
    create: async value => { if (data.has(path)) throw { code: 6 }; data.set(path, value); },
    delete: async () => { data.delete(path); },
    collection: name => collection(`${path}/${name}`)
  });
  const collection = path => ({ doc: id => doc(`${path}/${id || `auto${++auto}`}`), add: async value => { const d = doc(`${path}/auto${++auto}`); await d.set(value); return d; } });
  return { data, collection, runTransaction: async callback => callback({ get: ref => ref.get(),
    set: (ref, value, options) => ref.set(value, options), update: (ref, value) => ref.update(value), delete: ref => ref.delete() }) };
}
const incoming = (mid = 'm1', sender = '123', account = '456') => ({ sender: { id: sender }, recipient: { id: account },
  timestamp: Date.now(), message: { mid, text: 'Quero um orçamento' } });
const seedEvent = (overrides = {}) => fakeDb({
  'instagramEvents/event1': { ...extractInstagramMessages({ object: 'instagram', entry: [{ messaging: [incoming()] }] })[0],
    storeId: 'store', status: 'pending', attempts: 0, ...overrides },
  'instagramConnections/store': { connected: true, enabled: true, accountId: '456', accessToken: 'private-token' },
  'establishments/store': { name: 'Loja' }
});
const chatPath = 'establishments/store/chats/ig_123';

// These tests stub external services: they never contact Meta, Gemini or production Firestore.
test('signature requires the exact raw bytes, secret and sha256 signature', () => {
  const raw = Buffer.from('{"object":"instagram"}');
  const signature = 'sha256=' + crypto.createHmac('sha256', 'secret').update(raw).digest('hex');
  assert.equal(validInstagramSignature(raw, signature, 'secret'), true);
  assert.equal(validInstagramSignature(Buffer.from('{}'), signature, 'secret'), false);
  assert.equal(validInstagramSignature(raw, signature, ''), false);
  assert.equal(validInstagramSignature(raw, 'bad', 'secret'), false);
});
test('all entries/messages are extracted; echoes, read receipts and deleted events are ignored', () => {
  const echo = incoming('echo'); echo.message.is_echo = true;
  const deleted = incoming('deleted'); deleted.message.is_deleted = true;
  const result = extractInstagramMessages({ object: 'instagram', entry: [
    { messaging: [incoming('a'), echo, { read: {} }] }, { messaging: [incoming('b'), deleted] }
  ] });
  assert.deepEqual(result.map(m => m.mid), ['a', 'b']);
  assert.deepEqual(extractInstagramMessages({ user_id: 'manychat-id', text: 'olá' }), []);
});
test('long text preserves emoji and all characters', () => {
  const text = '🏁á'.repeat(1001);
  const parts = instagramTextParts(text);
  assert.equal(parts.join(''), text);
  assert(parts.every(p => Array.from(p).length <= 900));
});
test('webhook rejects wrong verify token and unsigned POST; signed batches persist once and route by recipient', async () => {
  process.env.INSTAGRAM_VERIFY_TOKEN = 'verify'; process.env.INSTAGRAM_APP_SECRET = 'secret';
  const db = fakeDb({ 'instagramAccounts/456': { storeId: 'store' } });
  const routes = {};
  const app = { get: (paths, fn) => routes['GET ' + (Array.isArray(paths) ? paths[0] : paths)] = fn,
    post: (paths, fn) => routes['POST ' + (Array.isArray(paths) ? paths[0] : paths)] = fn };
  registerInstagramWebhookRoutes(app, db, async () => assert.fail('Webhook must not wait for AI'));
  const response = () => ({ code: 200, status(code) { this.code = code; return this; },
    sendStatus(code) { this.code = code; return this; }, send(body) { this.body = body; return this; }, json(body) { this.body = body; return this; } });
  let res = response();
  await routes['GET /api/instagram/webhook']({ query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'anything-long' } }, res);
  assert.equal(res.code, 403);
  res = response();
  await routes['GET /api/instagram/webhook']({ query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'verify', 'hub.challenge': 'challenge' } }, res);
  assert.equal(res.body, 'challenge');
  res = response(); await routes['POST /api/instagram/webhook']({ headers: {}, body: {} }, res); assert.equal(res.code, 401);
  const body = { object: 'instagram', entry: [{ messaging: [incoming('a'), incoming('b'), incoming('c', '999', 'unknown')] }] };
  const raw = Buffer.from(JSON.stringify(body));
  const req = { rawBody: raw, body, headers: { 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', 'secret').update(raw).digest('hex') } };
  for (let i = 0; i < 2; i++) { res = response(); await routes['POST /api/instagram/webhook'](req, res); assert.equal(res.code, 200); }
  const events = [...db.data].filter(([key]) => key.startsWith('instagramEvents/'));
  assert.equal(events.length, 2); assert(events.every(([, data]) => data.storeId === 'store'));
});
test('worker uses shared AI, sends media/text/maps directly and ignores duplicate delivery', async t => {
  const db = seedEvent(); const requests = []; let aiCalls = 0; let billingCalls = 0;
  t.mock.method(global, 'fetch', async (url, opts) => { requests.push({ url, ...opts }); return new Response(JSON.stringify({ message_id: 'sent' })); });
  const ai = async (...args) => { aiCalls++; assert.equal(args[1], 'ig_123'); assert.equal(args[6], 'instagram');
    return { replyText: 'Olá!', mediaList: [{ url: 'https://example.com/photo.jpg', caption: '', type: 'image' }],
      locationToSend: { latitude: 1, longitude: 2, name: 'Loja', address: 'Rua 1' } }; };
  const deps = { reserveCredit: async () => { billingCalls++; return { allowed: true }; } };
  await processInstagramEvent(db, 'event1', ai, deps);
  await processInstagramEvent(db, 'event1', ai, deps);
  assert.equal(aiCalls, 1); assert.equal(billingCalls, 1); assert.equal(requests.length, 2);
  assert.match(requests[0].url, /graph.instagram.com\/v26.0\/456\/messages$/);
  assert.equal(requests[0].headers.Authorization, 'Bearer private-token');
  assert.match(JSON.parse(requests[0].body).message.text, /google.com\/maps/);
  assert.equal(JSON.parse(requests[1].body).message.attachment.type, 'image');
  assert.equal(db.data.get('instagramEvents/event1').status, 'sent');
  assert.equal(db.data.get(chatPath).instagramSenderId, '123');
});
test('paused chats, billing block, disabled connection and stale messages never invoke AI or send', async t => {
  t.mock.method(global, 'fetch', async () => assert.fail('No external send expected'));
  for (const mode of ['paused', 'billing', 'disabled', 'stale']) {
    const db = seedEvent(mode === 'stale' ? { timestamp: Date.now() - 25 * 3600000 } : {});
    if (mode === 'paused') db.data.set(chatPath, { aiPaused: true });
    if (mode === 'disabled') db.data.get('instagramConnections/store').enabled = false;
    await processInstagramEvent(db, 'event1', async () => assert.fail('No AI expected'), { reserveCredit: async () => ({ allowed: false }) });
    assert.equal(db.data.get('instagramEvents/event1').status, 'ignored');
  }
});
test('transient send retries resume at first unsent part without regenerating AI or resending saved parts', async t => {
  const db = seedEvent(); let aiCalls = 0; const requests = [];
  t.mock.method(global, 'fetch', async (_url, opts) => {
    requests.push(JSON.parse(opts.body).message);
    if (requests.length === 2) return new Response(JSON.stringify({ error: { code: 2, is_transient: true } }), { status: 503 });
    return new Response(JSON.stringify({ message_id: 'ok' }));
  });
  const ai = async () => { aiCalls++; return { replyText: 'texto', mediaList: [{ url: 'https://example.com/image.jpg', caption: '' }] }; };
  await assert.rejects(processInstagramEvent(db, 'event1', ai));
  assert.equal(db.data.get('instagramEvents/event1').nextPart, 1);
  await processInstagramEvent(db, 'event1', ai);
  assert.equal(aiCalls, 1); assert.equal(requests.length, 3);
  assert.equal(requests[0].text, 'texto');
  assert.equal(requests[1].attachment.payload.url, 'https://example.com/image.jpg');
  assert.deepEqual(requests[2], requests[1]); assert.equal(db.data.get('instagramEvents/event1').status, 'sent');
});
test('permanent Meta errors are marked failed instead of pretending success', async t => {
  const db = seedEvent();
  t.mock.method(global, 'fetch', async () => new Response(JSON.stringify({ error: { code: 190 } }), { status: 400 }));
  await processInstagramEvent(db, 'event1', async () => ({ replyText: 'Olá' }));
  assert.equal(db.data.get('instagramEvents/event1').status, 'failed');
  assert.equal(db.data.get(chatPath).instagramDeliveryStatus, 'failed');
  assert.match(db.data.get('instagramConnections/store').lastError, /190/);
});
test('CRM refuses historical ManyChat subscriber IDs and expired response windows', async t => {
  const db = seedEvent(); t.mock.method(global, 'fetch', async () => assert.fail('Must not send'));
  let result = await sendInstagramDirect(db, 'store', 'ig_123', 'Olá');
  assert.equal(result.success, false); assert.match(result.error, /ManyChat/);
  db.data.set(chatPath, { instagramSenderId: '123', instagramAccountId: '456', lastInboundAt: new Date(Date.now() - 25 * 3600000).toISOString() });
  result = await sendInstagramDirect(db, 'store', 'ig_123', 'Olá');
  assert.equal(result.success, false); assert.match(result.error, /janela/);
});
test('OAuth callback rejects invalid/expired state and consumes a state once', async t => {
  const db = fakeDb(); const routes = {};
  const app = { get: (paths, fn) => routes['GET ' + (Array.isArray(paths) ? paths[0] : paths)] = fn,
    post: () => {} };
  registerInstagramWebhookRoutes(app, db, async () => ({}));
  const response = () => ({ code: 200, set() {}, status(code) { this.code = code; return this; },
    send(body) { this.body = body; return this; }, redirect(url) { this.url = url; return this; } });
  let res = response(); await routes['GET /api/instagram/callback']({ query: { state: 'wrong' } }, res);
  assert.equal(res.code, 400);
  const state = 'a'.repeat(64); const key = 'instagramOauthStates/' + crypto.createHash('sha256').update(state).digest('hex');
  db.data.set(key, { storeId: 'store', expiresAt: Date.now() + 60000 });
  res = response(); await routes['GET /api/instagram/callback']({ query: { state, error: 'access_denied' } }, res);
  assert.match(res.url, /instagram=cancelled/); assert.equal(db.data.has(key), false);
  res = response(); await routes['GET /api/instagram/callback']({ query: { state, error: 'access_denied' } }, res);
  assert.match(res.url, /instagram=error/);
});
test('management endpoints reject missing authentication', async () => {
  const routes = {}; const app = { get: (paths, fn) => routes['GET ' + (Array.isArray(paths) ? paths[0] : paths)] = fn,
    post: (paths, fn) => routes['POST ' + (Array.isArray(paths) ? paths[0] : paths)] = fn };
  registerInstagramWebhookRoutes(app, fakeDb(), async () => ({}));
  for (const route of ['GET /api/instagram/status', 'POST /api/instagram/connect', 'POST /api/instagram/enable', 'POST /api/instagram/disconnect']) {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
    await routes[route]({ headers: {}, query: { establishmentId: 'victim' } }, res);
    assert.equal(res.code, 401);
  }
});
test('human takeover activated during AI generation prevents pending reply from sending', async t => {
  const db = seedEvent(); t.mock.method(global, 'fetch', async () => assert.fail('Paused during generation'));
  await processInstagramEvent(db, 'event1', async () => { db.data.get(chatPath).aiPaused = true; return { replyText: 'Olá' }; });
  assert.equal(db.data.get('instagramEvents/event1').status, 'ignored');
});
test('Instagram may attend 24h without changing the store/WhatsApp schedule', async t => {
  const db = seedEvent(); db.data.get('instagramConnections/store').respectSchedule = false;
  let aiCalls = 0;
  t.mock.method(global, 'fetch', async () => new Response(JSON.stringify({ message_id: 'sent' })));
  await processInstagramEvent(db, 'event1', async () => { aiCalls++; return { replyText: 'Olá' }; }, { operatingHours: () => ({ isOpen: false }) });
  assert.equal(aiCalls, 1); assert.equal(db.data.get('instagramEvents/event1').status, 'sent');
});
test('Meta change-style messages are accepted while comments and null values are ignored', () => {
  const result = extractInstagramMessages({ object: 'instagram', entry: [{ changes: [
    { field: 'messages', value: incoming('change1') }, { field: 'comments', value: incoming('comment1') },
    { field: 'messages', value: null }
  ] }] });
  assert.deepEqual(result.map(x => x.mid), ['change1']);
});

test('timestamps in seconds are converted to milliseconds', () => {
  const message = incoming('seconds'); message.timestamp = 1793145600;
  assert.equal(extractInstagramMessages({ object: 'instagram', entry: [{ messaging: [message] }] })[0].timestamp, 1793145600000);
});

test('text splitting respects the UTF-8 budget for accented Portuguese and emoji', () => {
  const text = 'A instalação é sob medida. 🏁 '.repeat(90).trim();
  const parts = instagramTextParts(text);
  assert(parts.length > 1);
  assert(parts.every(part => Buffer.byteLength(part, 'utf8') <= 900));
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), text.replace(/\s+/g, ' '));
});
test('long replies split at paragraph boundaries rather than inside words', () => {
  const first = 'Projeto de escapamento em inox. '.repeat(20).trim();
  const second = 'Vamos conferir a aplicação no seu veículo. '.repeat(15).trim();
  const parts = instagramTextParts(first + '\n\n' + second);
  assert.deepEqual(parts, [first, second]);
});
test('sentence boundaries are preferred when a paragraph is too long', () => {
  const sentence = 'A instalação será confirmada pela equipe técnica. ';
  const text = sentence.repeat(40).trim();
  const parts = instagramTextParts(text);
  assert(parts.every(part => part.endsWith('.')));
  assert.equal(parts.join(' '), text);
});
test('normal URLs stay intact across message boundaries', () => {
  const url = 'https://iapedido.web.app/loja/flow-garage-exhaust-zffwu?referencia=porsche-911';
  const text = 'Referência '.repeat(77) + url + ' Veja os detalhes e me diga o que achou.';
  const parts = instagramTextParts(text);
  assert(parts.some(part => part.includes(url)));
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), text.replace(/\s+/g, ' '));
});
test('joined emoji and combining accents stay whole', () => {
  const family = '👨‍👩‍👧‍👦';
  const accent = 'e\u0301';
  const text = (family + accent).repeat(150);
  const parts = instagramTextParts(text);
  assert.equal(parts.join(''), text);
  for (const part of parts) {
    assert(Buffer.byteLength(part, 'utf8') <= 900);
    assert(!part.startsWith('\u200d') && !part.endsWith('\u200d'));
    assert(!part.startsWith('\u0301'));
  }
});
test('short messages stay in one bubble and excess blank lines are removed', () => {
  assert.deepEqual(instagramTextParts('  Olá!\r\n\r\n\r\nQual é o seu carro?  '), ['Olá!\n\nQual é o seu carro?']);
  assert.deepEqual(instagramTextParts(' \n\t '), []);
});
test('an unusually long word is preserved without exceeding the byte budget', () => {
  const text = 'á'.repeat(1600);
  const parts = instagramTextParts(text);
  assert.equal(parts.join(''), text);
  assert(parts.every(part => Buffer.byteLength(part, 'utf8') <= 900));
});
test('worker sends a long reply as readable byte-bounded messages without losing content', async t => {
  const db = seedEvent(); const sent = [];
  const replyText = 'A referência será validada pela equipe técnica. 🏁 '.repeat(50).trim();
  t.mock.method(global, 'fetch', async (_url, opts) => {
    sent.push(JSON.parse(opts.body).message.text);
    return new Response(JSON.stringify({ message_id: 'ok' }));
  });
  await processInstagramEvent(db, 'event1', async () => ({ replyText }));
  assert(sent.length > 1);
  assert(sent.every(text => Buffer.byteLength(text, 'utf8') <= 900));
  assert.equal(sent.join(' ').replace(/\s+/g, ' '), replyText.replace(/\s+/g, ' '));
  assert.equal(db.data.get('instagramEvents/event1').status, 'sent');
});
test('list items remain on complete lines when each item fits one message', () => {
  const lines = Array.from({ length: 8 }, (_, i) => `• Referência ${i + 1}: ` + 'escapamento em inox '.repeat(18).trim());
  const parts = instagramTextParts(lines.join('\n'));
  assert.deepEqual(parts.flatMap(part => part.split('\n')), lines);
  assert(parts.every(part => Buffer.byteLength(part, 'utf8') <= 900));
});

test('all introductory text blocks precede photos and videos in the persisted send plan', async t => {
  const db = seedEvent(); const messages = [];
  t.mock.method(global, 'fetch', async (_url, opts) => {
    messages.push(JSON.parse(opts.body).message);
    return new Response(JSON.stringify({message_id: 'ok'}));
  });
  const replyText = 'Vou mostrar as referências cadastradas. '.repeat(40).trim();
  await processInstagramEvent(db, 'event1', async () => ({replyText, mediaList: [
    {url: 'https://example.com/photo.jpg', caption: '', type: 'image'},
    {url: 'https://example.com/video.mp4', caption: '', type: 'video'}
  ]}));
  const textParts = messages.slice(0, -2);
  assert(textParts.length > 1);
  assert(textParts.every(m => typeof m.text === 'string' && !m.attachment));
  assert.equal(textParts.map(m => m.text).join(' ').replace(/\s+/g, ' '), replyText);
  assert.deepEqual(messages.slice(-2).map(m => m.attachment.type), ['image', 'video']);
  assert.deepEqual(db.data.get('instagramEvents/event1').plan, messages);
});

test('Instagram mirrors incoming attachment payloads even when AI is paused or disabled', async t => {
  t.mock.method(global, 'fetch', async () => assert.fail('No send while paused/disabled'));
  for (const state of ['paused','disabled']) {
    const db=seedEvent({text:'',attachments:[{type:'image',payload:{url:'https://example.com/incoming.jpg'}}]});
    if(state==='paused')db.data.set(chatPath,{aiPaused:true});
    else db.data.get('instagramConnections/store').enabled=false;
    await processInstagramEvent(db,'event1',async()=>assert.fail('No AI expected'));
    const message=db.data.get(chatPath+'/messages/event1');
    assert.equal(message.sender,'user');assert.equal(message.mediaUrl,'https://example.com/incoming.jpg');
    assert.equal(message.media.length,1);
  }
});
test('Instagram passes existing inbound ID to shared AI and stores it once across retry', async t => {
  const db=seedEvent();let calls=0;
  t.mock.method(global,'fetch',async()=>new Response(JSON.stringify({message_id:'ok'})));
  await processInstagramEvent(db,'event1',async(...args)=>{calls++;assert.equal(args[7],'event1');return {replyText:'Olá'};});
  await processInstagramEvent(db,'event1',async()=>assert.fail('Already processed'));
  assert.equal(calls,1);
  assert.equal([...db.data.keys()].filter(k=>k.startsWith(chatPath+'/messages/')).length,1);
});

test('out of hours automatic reply is mirrored with sent status', async t => {
 const db=seedEvent();db.data.get('establishments/store').aiOutOfHoursAction='AUTO_REPLY';
 t.mock.method(global,'fetch',async()=>new Response(JSON.stringify({message_id:'ok'})));
 await processInstagramEvent(db,'event1',async()=>assert.fail('Outside hours should not generate AI'),{operatingHours:()=>({isOpen:false})});
 assert.equal(db.data.get(chatPath+'/messages/auto_event1').deliveryStatus,'sent');
 assert.equal(db.data.get(chatPath+'/messages/event1').sender,'user');
});
test('takeover midway through a media batch preserves partial status rather than hiding sent text', async t => {
 const db=seedEvent();let sends=0;
 t.mock.method(global,'fetch',async()=>{sends++;db.data.get(chatPath).aiPaused=true;return new Response(JSON.stringify({message_id:'ok'}));});
 await processInstagramEvent(db,'event1',async()=>{
  db.data.set(chatPath+'/messages/answer',{sender:'assistant',text:'Referência',deliveryStatus:'pending'});
  return {replyText:'Referência',assistantMessageId:'answer',mediaList:[{url:'https://example.com/photo.jpg',type:'image',caption:''}]};
 });
 assert.equal(sends,1);assert.equal(db.data.get(chatPath+'/messages/answer').deliveryStatus,'partial');
 assert.equal(db.data.get(chatPath+'/messages/answer').deliveredParts,1);
});
