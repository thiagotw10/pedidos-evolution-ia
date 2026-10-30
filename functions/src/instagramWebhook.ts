import { AFFILIATE_SEGMENT, registerAffiliateRoutes, extractAffiliateComments, processAffiliateComment, affiliateDirectReply } from './affiliate';
import { Express, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import crypto from 'crypto';

export type ProcessAiMessageFn = (
  establishmentId: string, customerId: string, text: string, name?: string,
  media?: { mimeType: string; data: string }, model?: string, channel?: 'whatsapp' | 'instagram', inboundMessageId?: string
) => Promise<{
  replyText: string;
  assistantMessageId?: string;
  mediaList?: Array<{ url: string; caption: string; type?: string }>;
  mediaToSend?: { url: string; caption: string; type?: string } | null;
  locationToSend?: { latitude: number; longitude: number; name: string; address: string } | null;
}>;

type Dependencies = {
  reserveCredit?: (storeId: string, text: string, model: string) => Promise<{ allowed: boolean }>;
  operatingHours?: (store: any) => { isOpen: boolean };
  inlineWorker?: boolean;
};
const CONNECTIONS = 'instagramConnections';
const EVENTS = 'instagramEvents';
const now = () => new Date().toISOString();
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const connectionRef = (db: admin.firestore.Firestore, store: string) => db.collection(CONNECTIONS).doc(store);
const config = () => ({
  appId: process.env.INSTAGRAM_APP_ID || '',
  secret: process.env.INSTAGRAM_APP_SECRET || '',
  verifyToken: process.env.INSTAGRAM_VERIFY_TOKEN || '',
  origin: (process.env.INSTAGRAM_PUBLIC_URL || 'https://iapedido.web.app').replace(/\/$/, ''),
  version: process.env.INSTAGRAM_GRAPH_VERSION || 'v26.0'
});

export function validInstagramSignature(raw: Buffer, signature: string, secret: string): boolean {
  if (!secret || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}

export function extractInstagramMessages(body: any): any[] {
  if (body?.object !== 'instagram' || !Array.isArray(body.entry)) return [];
  return body.entry.flatMap((entry: any) => [
    ...(Array.isArray(entry.messaging) ? entry.messaging : []),
    ...(Array.isArray(entry.changes) ? entry.changes.filter((change: any) => change?.field === 'messages').map((change: any) => change.value) : [])
  ].filter((item: any) => item?.message?.mid && !item.message.is_echo && !item.message.is_deleted
      && item.sender?.id && item.recipient?.id && item.sender.id !== item.recipient.id
      && (item.message.text || item.message.attachments?.length))
    .map((item: any) => ({ accountId: String(item.recipient.id), senderId: String(item.sender.id),
      mid: String(item.message.mid), timestamp: Number(item.timestamp) > 0 ? Number(item.timestamp) * (Number(item.timestamp) < 1e12 ? 1000 : 1) : Date.now(),
      text: String(item.message.text || ''), attachments: item.message.attachments || [] })));
}

class InstagramApiError extends Error {
  constructor(public code: number, public retryable: boolean) { super(`Instagram API: ${code}`); }
}
async function graph(path: string, token: string, method = 'GET', body?: any): Promise<any> {
  const response = await fetch(`https://graph.instagram.com/${config().version}/${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000)
  });
  const data: any = await response.json();
  if (!response.ok || data.error) {
    const code = Number(data.error?.code || response.status);
    throw new InstagramApiError(code, response.status >= 500 || response.status === 429 || !!data.error?.is_transient);
  }
  return data;
}
async function tokenRequest(url: string, options?: RequestInit): Promise<any> {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
  const data: any = await response.json();
  if (!response.ok || data.error || !data.access_token) throw new Error('Não foi possível autorizar o Instagram. Tente conectar novamente.');
  return data;
}

// This collection is server-only. Tokens never live on the public establishment document.
async function saveConnection(db: admin.firestore.Firestore, storeId: string, token: string, expiresIn: number) {
  const profile = await graph('me?fields=user_id,username', token);
  const accountId = String(profile.user_id || '');
  if (!/^\d+$/.test(accountId)) throw new Error('A Meta não retornou o identificador da conta profissional.');
  await db.runTransaction(async tx => {
    const mapping = db.collection('instagramAccounts').doc(accountId);
    const current = await tx.get(mapping);
    const previous = await tx.get(connectionRef(db, storeId));
    if (current.exists && current.data()?.storeId !== storeId) throw new Error('Esta conta já está conectada a outra loja.');
    const oldId = previous.data()?.accountId;
    if (oldId && oldId !== accountId) tx.delete(db.collection('instagramAccounts').doc(oldId));
    tx.set(mapping, { storeId });
    tx.set(connectionRef(db, storeId), { accountId, username: profile.username || '', accessToken: token,
      connected: false, enabled: false, connectedAt: now(), refreshedAt: now(),
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(), lastError: null });
  });
  const affiliate = (await db.collection('establishments').doc(storeId).get()).data()?.segment === AFFILIATE_SEGMENT;
  let affiliatePermissions = false;
  if (affiliate) {
    const permissions = await graph('me/permissions', token);
    const granted = (permissions.data || []).filter((p: any) => p.status === 'granted').map((p: any) => p.permission);
    affiliatePermissions = ['instagram_business_content_publish','instagram_business_manage_comments'].every(p => granted.includes(p));
  }
  await graph('me/subscribed_apps', token, 'POST', { subscribed_fields: affiliatePermissions ? 'messages,comments' : 'messages' });
  await connectionRef(db, storeId).update({ affiliatePermissions });
  await connectionRef(db, storeId).update({ connected: true });
}

export function registerInstagramWebhookRoutes(app: Express, db: admin.firestore.Firestore,
  processAi: ProcessAiMessageFn, deps: Dependencies = {}) {
  registerAffiliateRoutes(app, db, graph);
  const owned = (handler: (req: Request, res: Response, storeId: string) => Promise<any>) => async (req: Request, res: Response) => {
    let uid: string;
    try { uid = (await admin.auth().verifyIdToken((req.headers.authorization || '').replace(/^Bearer /, ''))).uid; }
    catch { return res.status(401).json({ error: 'Entre novamente para gerenciar o Instagram.' }); }
    const storeId = String(req.query.establishmentId || req.body?.establishmentId || '');
    if (!storeId || uid !== storeId) return res.status(403).json({ error: 'Acesso permitido somente ao dono da loja.' });
    try { return await handler(req, res, storeId); }
    catch (error) {
      console.error('[Instagram management]', error instanceof InstagramApiError ? error.message : 'Configuration operation failed');
      return res.status(400).json({ error: error instanceof InstagramApiError
        ? `A Meta recusou a operação (código ${error.code}). Confira as permissões e reconecte a conta.`
        : 'Não foi possível concluir a conexão. Confira a configuração do aplicativo Meta e tente novamente.' });
    }
  };

  app.get('/api/instagram/status', owned(async (_req, res, storeId) => {
    const c = config();
    const data = (await connectionRef(db, storeId).get()).data() || {};
    const webhook = (await db.collection('instagramSystem').doc('webhook').get()).data();
    const store = (await db.collection('establishments').doc(storeId).get()).data() || {};
    return res.json({ configured: !!(c.appId && c.secret && c.verifyToken),
      missing: [!c.appId && 'INSTAGRAM_APP_ID', !c.secret && 'INSTAGRAM_APP_SECRET', !c.verifyToken && 'INSTAGRAM_VERIFY_TOKEN'].filter(Boolean),
      respectSchedule: data.respectSchedule !== false, storeOpen: deps.operatingHours ? deps.operatingHours(store).isOpen : true,
      affiliatePermissions: data.affiliatePermissions === true, connected: !!data.connected, enabled: !!data.enabled, username: data.username || null,
      accountId: data.accountId || null, expiresAt: data.expiresAt || null, lastError: data.lastError || null,
      lastInboundAt: data.lastInboundAt || null, lastOutboundAt: data.lastOutboundAt || null,
      webhookVerifiedAt: webhook?.verifiedAt || null,
      webhookUrl: `${c.origin}/api/instagram/webhook`, redirectUri: `${c.origin}/api/instagram/callback`,
      verifyToken: c.verifyToken });
  }));

  app.post('/api/instagram/connect', owned(async (_req, res, storeId) => {
    const c = config();
    if (!c.appId || !c.secret || !c.verifyToken) return res.status(503).json({ error: 'Configure as credenciais do aplicativo Instagram no servidor primeiro.' });
    const state = crypto.randomBytes(32).toString('hex');
    await db.collection('instagramOauthStates').doc(hash(state)).set({ storeId, expiresAt: Date.now() + 10 * 60 * 1000 });
    const affiliate = (await db.collection('establishments').doc(storeId).get()).data()?.segment === AFFILIATE_SEGMENT;
    const query = new URLSearchParams({ client_id: c.appId, redirect_uri: `${c.origin}/api/instagram/callback`,
      response_type: 'code', scope: 'instagram_business_basic,instagram_business_manage_messages' + (affiliate ? ',instagram_business_content_publish,instagram_business_manage_comments' : ''),
      enable_fb_login: '0', force_authentication: '1', state });
    return res.json({ url: `https://www.instagram.com/oauth/authorize?${query}` });
  }));

  app.get('/api/instagram/callback', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const state = String(req.query.state || '');
      if (!/^[a-f0-9]{64}$/.test(state)) return res.status(400).send('Autorização inválida. Volte ao painel e conecte novamente.');
      const ref = db.collection('instagramOauthStates').doc(hash(state));
      const storeId = await db.runTransaction(async tx => {
        const saved = await tx.get(ref);
        if (!saved.exists || saved.data()!.expiresAt < Date.now()) throw new Error('Expired state');
        tx.delete(ref);
        return saved.data()!.storeId as string;
      });
      if (req.query.error || !req.query.code) return res.redirect(`${config().origin}/?instagram=cancelled`);
      const c = config();
      const short = await tokenRequest('https://api.instagram.com/oauth/access_token', {
        method: 'POST', body: new URLSearchParams({ client_id: c.appId, client_secret: c.secret,
          grant_type: 'authorization_code', redirect_uri: `${c.origin}/api/instagram/callback`, code: String(req.query.code) })
      });
      const long = await tokenRequest(`https://graph.instagram.com/access_token?${new URLSearchParams({
        grant_type: 'ig_exchange_token', client_secret: c.secret, access_token: short.access_token })}`);
      await saveConnection(db, storeId, long.access_token, Number(long.expires_in || 5184000));
      return res.redirect(`${c.origin}/?instagram=connected`);
    } catch {
      return res.redirect(`${config().origin}/?instagram=error`);
    }
  });

  app.post('/api/instagram/enable', owned(async (req, res, storeId) => {
    const ref = connectionRef(db, storeId);
    const data = (await ref.get()).data();
    if (!data?.connected) return res.status(400).json({ error: 'Conecte sua conta primeiro.' });
    if (req.body.enabled !== true && req.body.enabled !== false) return res.status(400).json({ error: 'Informe se a IA deve ser ativada.' });
    if (req.body.enabled && new Date(data.expiresAt).getTime() <= Date.now()) return res.status(400).json({ error: 'A autorização expirou. Reconecte sua conta.' });
    if (req.body.enabled) await graph('me?fields=user_id', data.accessToken);
    if (req.body.respectSchedule !== undefined && typeof req.body.respectSchedule !== 'boolean') return res.status(400).json({ error: 'Configuração de horário inválida.' });
    await ref.update({ enabled: req.body.enabled, ...(typeof req.body.respectSchedule === 'boolean' ? { respectSchedule: req.body.respectSchedule } : {}) });
    return res.json({ success: true });
  }));

  app.post('/api/instagram/disconnect', owned(async (_req, res, storeId) => {
    const ref = connectionRef(db, storeId);
    const data = (await ref.get()).data();
    // Pause locally before revoking so a failed remote revoke cannot leave the bot running.
    if (data) await ref.update({ enabled: false });
    if (data?.accessToken) await graph('me/subscribed_apps', data.accessToken, 'DELETE');
    const batch = db.batch();
    batch.delete(ref);
    if (data?.accountId) batch.delete(db.collection('instagramAccounts').doc(data.accountId));
    await batch.commit();
    return res.json({ success: true });
  }));

  const paths = ['/api/instagram/webhook', '/api/instagram/webhook/:establishmentId', '/api/meta/instagram-webhook'];
  app.get(paths, async (req, res) => {
    const c = config();
    if (!c.verifyToken || req.query['hub.mode'] !== 'subscribe' || req.query['hub.verify_token'] !== c.verifyToken
      || typeof req.query['hub.challenge'] !== 'string') return res.sendStatus(403);
    await db.collection('instagramSystem').doc('webhook').set({ verifiedAt: now() });
    return res.status(200).send(req.query['hub.challenge']);
  });
  app.post(paths, async (req, res) => {
    const raw = (req as any).rawBody;
    if (!Buffer.isBuffer(raw) || !validInstagramSignature(raw, String(req.headers['x-hub-signature-256'] || ''), config().secret)) return res.sendStatus(401);
    try {
      const ids: string[] = [];
      for (const message of [...extractInstagramMessages(req.body), ...extractAffiliateComments(req.body)]) {
        const mapping = (await db.collection('instagramAccounts').doc(message.accountId).get()).data();
        if (!mapping?.storeId) continue;
        if (message.kind === 'affiliate_comment' && (await db.collection('establishments').doc(mapping.storeId).get()).data()?.segment !== AFFILIATE_SEGMENT) continue;
        const id = hash(`${message.accountId}:${message.mid}`);
        try {
          await db.collection(EVENTS).doc(id).create({ ...message, storeId: mapping.storeId,
            status: 'pending', attempts: 0, receivedAt: now(), expiresAt: new Date(Date.now() + 7 * 86400000) });
          ids.push(id);
        } catch (error: any) { if (error.code !== 6 && error.code !== 'already-exists') throw error; }
      }
      // Production uses a durable Firestore trigger. Local development awaits the same worker.
      if (deps.inlineWorker) for (const id of ids) await processInstagramEvent(db, id, processAi, deps);
      return res.status(200).send('EVENT_RECEIVED');
    } catch {
      return res.sendStatus(503); // Meta retries; stable event IDs prevent duplicate processing.
    }
  });
}

export const INSTAGRAM_TEXT_MAX_BYTES = 900;

export function instagramTextParts(text: string): string[] {
  const clean = text.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  // Node 22 supports grapheme segmentation: keep joined emoji and accents together.
  const segmenter = new (Intl as any).Segmenter('pt-BR', { granularity: 'grapheme' });
  const units: string[] = Array.from(segmenter.segment(clean), (part: any) => part.segment as string)
    .flatMap(unit => Buffer.byteLength(unit, 'utf8') <= INSTAGRAM_TEXT_MAX_BYTES ? [unit] : Array.from(unit));
  const parts: string[] = [];
  let start = 0;
  while (start < units.length) {
    let end = start;
    let bytes = 0;
    let paragraph = 0;
    let line = 0;
    let sentence = 0;
    let word = 0;
    let prefix = '';
    while (end < units.length) {
      const size = Buffer.byteLength(units[end], 'utf8');
      if (bytes + size > INSTAGRAM_TEXT_MAX_BYTES) break;
      prefix += units[end];
      bytes += size;
      end++;
      if (/\s/u.test(units[end - 1])) {
        word = end;
        // Avoid a tiny first bubble just because the greeting has a blank line.
        if (bytes >= INSTAGRAM_TEXT_MAX_BYTES * 0.4) {
          if (prefix.endsWith('\n\n')) paragraph = end;
          if (units[end - 1] === '\n') line = end;
          if (/[.!?…]["'”’)]*\s+$/u.test(prefix)) sentence = end;
        }
      }
    }
    const cut = end === units.length ? end : paragraph || line || sentence || word || end;
    const part = units.slice(start, cut).join('').trim();
    if (part) parts.push(part);
    start = cut;
    while (start < units.length && /^\s+$/u.test(units[start])) start++;
  }
  return parts;
}

// Download only Meta CDN attachments; reject redirects and bound memory/time usage.
async function downloadAttachment(attachment: any): Promise<{ mimeType: string; data: string } | undefined> {
  if (!['image', 'audio', 'video'].includes(attachment?.type)) return;
  const url = new URL(attachment.payload?.url || '');
  if (url.protocol !== 'https:' || !(url.hostname.endsWith('.cdninstagram.com') || url.hostname.endsWith('.fbcdn.net') || url.hostname.endsWith('.fbsbx.com'))) return;
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.body) return;
  const mimeType = (response.headers.get('content-type') || '').split(';')[0];
  if (!/^(image|audio|video)\//.test(mimeType)) return;
  const max = 15 * 1024 * 1024;
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); return; }
    chunks.push(Buffer.from(value));
  }
  return { mimeType, data: Buffer.concat(chunks).toString('base64') };
}

export async function processInstagramEvent(db: admin.firestore.Firestore, eventId: string,
  processAi: ProcessAiMessageFn, deps: Dependencies = {}) {
  const ref = db.collection(EVENTS).doc(eventId);
  const event = (await ref.get()).data();
  if (!event || ['sent', 'ignored', 'failed'].includes(event.status)) return;
  if (event.kind === 'affiliate_comment') return processAffiliateComment(db, eventId, graph);
  const chatKey = `ig_${event.senderId}`;
  const chat = db.collection('establishments').doc(event.storeId).collection('chats').doc(chatKey);
  const lock = db.collection('instagramLocks').doc(hash(`${event.storeId}:${chatKey}`));
  const lease = crypto.randomUUID();
  const acquired = await db.runTransaction(async tx => {
    const locked = (await tx.get(lock)).data();
    const current = (await tx.get(ref)).data();
    if (!current || ['sent', 'ignored', 'failed'].includes(current.status)) return false;
    if (locked?.until > Date.now()) throw new Error('Instagram conversation busy; retry');
    tx.set(lock, { lease, until: Date.now() + 300000 });
    tx.update(ref, { attempts: admin.firestore.FieldValue.increment(1), status: 'processing' });
    return true;
  });
  if (!acquired) return;
  const connection = connectionRef(db, event.storeId);
  try {
    const c = (await connection.get()).data();
    const store = (await db.collection('establishments').doc(event.storeId).get()).data();
    const inbound = chat.collection('messages').doc(eventId);
    if (store && !(await inbound.get()).exists) {
      const attachments = (event.attachments || []).map((a: any) => ({type:a.type,url:a.payload?.url || a.url || ''})).filter((a: any) => /^https:\/\//.test(a.url));
      await inbound.set({sender:'user', text:event.text || '[Mídia recebida pelo Instagram]',
        timestamp:new Date(event.timestamp).toISOString(), channel:'instagram',
        media:attachments.map((a: any) => ({url:a.url,type:a.type})),
        mediaUrl:attachments.find((a: any) => a.type === 'image')?.url || null,
        audioUrl:attachments.find((a: any) => a.type === 'audio')?.url || null});
      await chat.set({channel:'instagram',customerPhone:chatKey,instagramSenderId:event.senderId,instagramAccountId:event.accountId}, {merge:true});
    }
    if (!c?.connected || !c.enabled || c.accountId !== event.accountId || !store || Date.now() - event.timestamp > 23 * 3600000) {
      await ref.update({ status: 'ignored', reason: 'inactive_or_expired_window' }); return;
    }
    await connection.update({ lastInboundAt: now() });
    const existing = (await chat.get()).data() || {};
    const paused = existing.aiPaused && (!existing.aiPausedUntil || new Date(existing.aiPausedUntil).getTime() > Date.now());
    const outsideHours = c.respectSchedule !== false && deps.operatingHours && !deps.operatingHours(store).isOpen;
    await chat.set({ channel: 'instagram', customerPhone: chatKey, customerName: existing.customerName || 'Cliente Instagram',
      leadSource: 'Instagram Direct', instagramSenderId: event.senderId, instagramAccountId: event.accountId, lastInboundAt: new Date(event.timestamp).toISOString(), unreadByHuman: true }, { merge: true });
    let plan: any[] = event.plan;
    if (!plan) {
      const text = event.text || `[${event.attachments[0]?.type || 'Mídia'} recebida pelo Instagram]`;
      if (paused || outsideHours) {
        if (paused || store.aiOutOfHoursAction !== 'AUTO_REPLY') {
          await ref.update({ status: 'ignored', reason: paused ? 'human_takeover' : 'outside_hours' }); return;
        }
        plan = instagramTextParts(store.aiOutOfHoursMessage || 'Olá! Recebemos sua mensagem e retornaremos no horário de atendimento.').map(text => ({ text }));
        const autoMessage = chat.collection('messages').doc(`auto_${eventId}`);
        await autoMessage.set({sender:'assistant',origin:'ai',text:plan.map(p=>p.text).join('\n\n'),timestamp:now(),channel:'instagram',deliveryStatus:'pending'});
        await ref.update({assistantMessageId:autoMessage.id});
      } else {
        const media = await downloadAttachment(event.attachments[0]);
        if (deps.reserveCredit) {
          const reserved = await deps.reserveCredit(event.storeId, text, 'gemini-3.1-flash-lite');
          if (!reserved.allowed) { await ref.update({ status: 'ignored', reason: 'billing_required' }); return; }
        }
        const result: Awaited<ReturnType<ProcessAiMessageFn>> = store.segment === AFFILIATE_SEGMENT
          ? await affiliateDirectReply(db, event.storeId, chatKey, text)
          : await processAi(event.storeId, chatKey, text, existing.customerName || 'Cliente Instagram', media, 'gemini-3.1-flash-lite', 'instagram', eventId);
        if (result.assistantMessageId) await ref.update({assistantMessageId:result.assistantMessageId});
        const mediaList = result.mediaList?.length ? result.mediaList : result.mediaToSend ? [result.mediaToSend] : [];
        const mediaMessages = mediaList.slice(0, 10).filter(m => /^https:\/\//.test(m.url)).map(m => ({ attachment: {
          type: m.type === 'video' ? 'video' : 'image', payload: { url: m.url } } }));
        let reply = result.replyText || 'Olá! Como posso ajudar?';
        if (result.locationToSend) reply += `\n📍 ${result.locationToSend.name}: ${result.locationToSend.address}\nhttps://www.google.com/maps?q=${result.locationToSend.latitude},${result.locationToSend.longitude}`;
        // Present the response before its attachments; persist this exact order for retries.
        plan = [...instagramTextParts(reply).map(text => ({ text })), ...mediaMessages];
      }
      await ref.update({ plan, nextPart: 0 });
    }
    for (let i = Number(event.nextPart || 0); i < plan.length; i++) {
      // Recheck pause/disconnect during long responses before sending each part.
      const live = (await connection.get()).data();
      const liveChat = (await chat.get()).data();
      const newlyPaused = (liveChat?.aiPaused && (!liveChat.aiPausedUntil || new Date(liveChat.aiPausedUntil).getTime() > Date.now())) || (liveChat?.aiPausedAt && liveChat.aiPausedAt !== existing.aiPausedAt);
      if (newlyPaused || !live?.enabled || !live.connected) {
        const messageId = (await ref.get()).data()?.assistantMessageId;
        if (messageId) await chat.collection('messages').doc(messageId).update({deliveryStatus:i > 0 ? 'partial' : 'cancelled',deliveredParts:i});
        await ref.update({ status: 'ignored', reason: 'disabled_during_send' }); return; }
      const data = await graph(`${c.accountId}/messages`, c.accessToken, 'POST', { recipient: { id: event.senderId }, message: plan[i] });
      await ref.update({ nextPart: i + 1, lastMessageId: data.message_id || null });
    }
    const assistantId = (await ref.get()).data()?.assistantMessageId;
    if (assistantId) await chat.collection('messages').doc(assistantId).update({deliveryStatus:'sent'});
    await ref.update({ status: 'sent', sentAt: now() });
    await connection.update({ lastOutboundAt: now(), lastError: null });
    await chat.set({ lastOutboundAt: now(), instagramDeliveryStatus: 'sent' }, { merge: true });
  } catch (error: any) {
    const permanent = error instanceof InstagramApiError && !error.retryable;
    const assistantId = (await ref.get()).data()?.assistantMessageId;
    const failed = permanent || Number(event.attempts || 0) >= 4;
    if (assistantId) await chat.collection('messages').doc(assistantId).update({deliveryStatus: failed ? 'failed' : 'pending'}).catch(() => {});
    await ref.update({ status: failed ? 'failed' : 'pending', lastError: error instanceof InstagramApiError ? error.message : 'Falha no processamento. Nova tentativa agendada.' });
    await connection.set({ lastError: error instanceof InstagramApiError
      ? `A Meta recusou o envio (código ${error.code}). Confira a autorização da conta.`
      : 'Falha ao processar uma mensagem. Consulte os eventos do Instagram.' }, { merge: true });
    await chat.set({ instagramDeliveryStatus: failed ? 'failed' : 'pending' }, { merge: true });
    if (!failed) throw error;
  } finally {
    await db.runTransaction(async tx => {
      if ((await tx.get(lock)).data()?.lease === lease) tx.delete(lock);
    });
  }
}

export async function refreshInstagramTokens(db: admin.firestore.Firestore) {
  const connections = await db.collection(CONNECTIONS).where('connected', '==', true).get();
  for (const snap of connections.docs) {
    const data = snap.data();
    if (new Date(data.expiresAt).getTime() > Date.now() + 15 * 86400000) continue;
    try {
      const refreshed = await tokenRequest(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: data.accessToken })}`);
      await db.runTransaction(async tx => {
        const current = (await tx.get(snap.ref)).data();
        if (current?.accessToken !== data.accessToken) return;
        tx.update(snap.ref, { accessToken: refreshed.access_token, refreshedAt: now(),
          expiresAt: new Date(Date.now() + Number(refreshed.expires_in || 5184000) * 1000).toISOString(), lastError: null });
      });
    } catch {
      await snap.ref.update({ lastError: 'Não foi possível renovar a autorização. Reconecte o Instagram.' });
    }
  }
}

// Shared by the authenticated CRM routes. Never treats a ManyChat subscriber ID as an Instagram recipient.
export async function sendInstagramDirect(db: admin.firestore.Firestore, storeId: string, contactKey: string,
  text: string, attachment?: { url: string; type: string }): Promise<{ success: boolean; error?: string }> {
  const c = (await connectionRef(db, storeId).get()).data();
  const chat = (await db.collection('establishments').doc(storeId).collection('chats').doc(contactKey).get()).data();
  if (!c?.connected) return { success: false, error: 'Conecte o Instagram da loja primeiro.' };
  if (!chat?.instagramSenderId || chat.instagramAccountId !== c.accountId)
    return { success: false, error: 'Este contato precisa enviar uma nova mensagem pelo Direct após a conexão. O ID antigo do ManyChat não pode ser usado na API do Instagram.' };
  if (!chat.lastInboundAt || Date.now() - new Date(chat.lastInboundAt).getTime() >= 24 * 3600000)
    return { success: false, error: 'A janela de resposta do Instagram encerrou. Aguarde uma nova mensagem do cliente.' };
  try {
    if (attachment && (!/^https:\/\//.test(attachment.url) || !['image','video','audio'].includes(attachment.type))) return {success:false,error:'No Instagram, envie uma mídia com URL HTTPS pública.'};
    for (const part of instagramTextParts(text)) await graph(`${c.accountId}/messages`, c.accessToken, 'POST', {
      recipient: { id: chat.instagramSenderId }, message: { text: part } });
    if (attachment) {
      await graph(`${c.accountId}/messages`, c.accessToken, 'POST', { recipient: { id: chat.instagramSenderId },
        message: { attachment: { type: attachment.type, payload: { url: attachment.url } } } });
    }
    await connectionRef(db, storeId).update({ lastOutboundAt: now(), lastError: null });
    return { success: true };
  } catch {
    return { success: false, error: 'O Instagram recusou o envio. Confira a autorização e a janela de atendimento.' };
  }
}
