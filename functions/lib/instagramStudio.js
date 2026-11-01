"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasScope = exports.INSIGHTS_SCOPE = exports.PUBLISH_SCOPE = void 0;
exports.instagramStudioScopes = instagramStudioScopes;
exports.studioUrl = studioUrl;
exports.validateStudioPost = validateStudioPost;
exports.studioSchedule = studioSchedule;
exports.insightValue = insightValue;
exports.studioFunnel = studioFunnel;
exports.registerInstagramStudio = registerInstagramStudio;
exports.runInstagramPublication = runInstagramPublication;
exports.runInstagramStudioQueue = runInstagramStudioQueue;
const catalogPolicy_1 = require("./catalogPolicy");
const admin = __importStar(require("firebase-admin"));
const crypto_1 = __importDefault(require("crypto"));
const instagramAcquisition_1 = require("./instagramAcquisition");
const instagramBusinessPolicy_1 = require("./instagramBusinessPolicy");
const now = () => new Date().toISOString();
const posts = (db) => db.collection('instagramPublications');
const root = (db, id) => db.collection('instagramWorkspaces').doc(id);
const validId = (id) => typeof id === 'string' && /^[\w-]{1,100}$/.test(id);
const clean = (s, n) => String(s || '').trim().slice(0, n);
const ACTIVE = ['scheduled', 'preparing', 'processing', 'ready', 'publishing'];
exports.PUBLISH_SCOPE = 'instagram_business_content_publish';
exports.INSIGHTS_SCOPE = 'instagram_business_manage_insights';
const hasScope = (c, scope) => Array.isArray(c?.grantedPermissions) && c.grantedPermissions.includes(scope);
exports.hasScope = hasScope;
function instagramStudioScopes(segment, capabilities, connection) {
    const requested = Array.isArray(capabilities) ? capabilities : [];
    const scopes = new Set(['instagram_business_basic', 'instagram_business_manage_messages', 'instagram_business_manage_comments']);
    if (segment === 'AFFILIATES' || requested.includes('publishing') || (0, exports.hasScope)(connection, exports.PUBLISH_SCOPE))
        scopes.add(exports.PUBLISH_SCOPE);
    if (requested.includes('insights') || (0, exports.hasScope)(connection, exports.INSIGHTS_SCOPE))
        scopes.add(exports.INSIGHTS_SCOPE);
    return [...scopes];
}
function studioUrl(input) {
    try {
        if (typeof input !== 'string' || input.length > 4000)
            throw Error();
        const u = new URL(input);
        // Meta downloads these URLs. Never fetch arbitrary URLs with our server credentials.
        if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hostname.includes(':') || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) || !u.hostname.includes('.') || /(^|\.)(localhost|local|internal)$/.test(u.hostname))
            throw Error();
        return u.href;
    }
    catch {
        throw Error('Use uma URL HTTPS pública para a mídia.');
    }
}
function validateStudioPost(input) {
    if (!['IMAGE', 'REELS', 'CAROUSEL'].includes(input.format))
        throw Error('Escolha foto, Reel ou carrossel.');
    if (typeof input.caption !== 'string' || input.caption.length > 2200)
        throw Error('A legenda deve ter até 2.200 caracteres.');
    const media = Array.isArray(input.media) ? input.media : [];
    if (input.format === 'CAROUSEL' ? media.length < 2 || media.length > 10 : media.length !== 1)
        throw Error(input.format === 'CAROUSEL' ? 'Selecione entre 2 e 10 fotos.' : 'Selecione uma mídia.');
    if (input.mediaAuthorized !== true)
        throw Error('Confirme a autorização de uso das mídias.');
    const productId = clean(input.productId, 100);
    if (productId && !validId(productId))
        throw Error('Produto inválido.');
    const goal = input.goal || 'default';
    if (!instagramBusinessPolicy_1.ACQUISITION_GOALS.includes(goal))
        throw Error('Objetivo inválido.');
    const keywords = clean(input.keywords, 500).split(',').map((v) => v.trim()).filter(Boolean).slice(0, 12);
    return { title: clean(input.title, 120) || 'Nova publicação', format: input.format, caption: input.caption.trim(), media: media.map((v) => studioUrl(v)), mediaAuthorized: true, productId, goal, keywords, summary: clean(input.summary, 700) };
}
function studioSchedule(input, clock = Date.now()) {
    const date = Date.parse(input);
    if (!Number.isFinite(date) || date < clock + 60000 || date > clock + 180 * 86400000)
        throw Error('Escolha um horário entre 1 minuto e 180 dias no futuro.');
    return new Date(date).toISOString();
}
function usable(c, scope) {
    if (!c?.connected || !Number.isFinite(Date.parse(c.expiresAt)) || Date.parse(c.expiresAt) <= Date.now())
        throw Error('Conecte ou renove a autorização do Instagram.');
    if (scope && !(0, exports.hasScope)(c, scope))
        throw Error('Renove a autorização com a permissão necessária na central de conteúdo.');
    return c;
}
function insightValue(data) {
    const item = data?.data?.[0];
    const value = item?.total_value?.value ?? item?.values?.[0]?.value;
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function studioFunnel(chats, projects, accountId) {
    const rows = {};
    const get = (id) => rows[id] || (rows[id] = { mediaId: id, conversations: 0, leads: 0, quotes: 0, sales: 0, quotedRevenue: {} });
    const contactSources = new Map();
    for (const chat of chats) {
        const s = chat.firstInstagramAcquisition || chat.instagramAcquisition;
        if (chat.instagramAccountId !== accountId || !/^\d+$/.test(s?.mediaId || '') || (s.accountId && s.accountId !== accountId))
            continue;
        get(s.mediaId).conversations++;
        contactSources.set(chat.customerPhone || `ig_${chat.instagramSenderId}`, s.mediaId);
    }
    for (const p of projects) {
        // Only attribute to a contact belonging to the currently connected Instagram.
        const mediaId = contactSources.get(p.phone);
        if (!mediaId || p.channel !== 'instagram')
            continue;
        const row = get(mediaId);
        row.leads++;
        if (['Orçamento enviado', 'Aprovado', 'Em execução', 'Enviado', 'Concluído'].includes(p.status))
            row.quotes++;
        if (['Aprovado', 'Em execução', 'Enviado', 'Concluído'].includes(p.status)) {
            row.sales++;
            const amount = Number(p.quoteValue), currency = p.currency || 'BRL';
            if (Number.isFinite(amount) && amount >= 0)
                row.quotedRevenue[currency] = (row.quotedRevenue[currency] || 0) + amount;
        }
    }
    return Object.values(rows);
}
function postDto(id, p) { return { id, title: p.title, format: p.format, caption: p.caption, media: p.media, productId: p.productId, goal: p.goal, keywords: (p.keywords || []).join(', '), summary: p.summary, status: p.status, scheduledAt: p.scheduledAt || null, publishedAt: p.publishedAt || null, mediaId: p.mediaId || null, lastError: p.lastError || null, updatedAt: p.updatedAt, accountId: p.accountId }; }
async function checkProduct(db, id, p) {
    if (!p.productId) {
        if (p.goal === 'link')
            throw Error('Vincule um produto de afiliado para usar o objetivo de link.');
        return;
    }
    const store = (await db.collection('establishments').doc(id).get()).data();
    const affiliate = store?.segment === 'AFFILIATES';
    const ref = affiliate ? db.collection('affiliateWorkspaces').doc(id) : db.collection('establishments').doc(id);
    const product = (await ref.collection('products').doc(p.productId).get()).data();
    if (!product || (affiliate ? product.active !== true : product.available !== true) || !(0, catalogPolicy_1.visibleForSegment)([{ id: p.productId, ...product }], store?.segment).length)
        throw Error('O produto vinculado precisa estar ativo no catálogo.');
    if (p.goal === 'link' && !affiliate)
        throw Error('O objetivo de link de afiliado exige o nicho Afiliados.');
}
function registerInstagramStudio(app, db, graph) {
    const owned = (fn) => async (req, res) => {
        let uid;
        try {
            uid = (await admin.auth().verifyIdToken((req.headers.authorization || '').replace(/^Bearer /, ''))).uid;
        }
        catch {
            return res.status(401).json({ error: 'Entre novamente na plataforma.' });
        }
        const id = String(req.query.establishmentId || '');
        if (!validId(id) || uid !== id)
            return res.status(403).json({ error: 'Acesso restrito à sua empresa.' });
        try {
            if (!instagramBusinessPolicy_1.BUSINESS_SEGMENTS.includes((await db.collection('establishments').doc(id).get()).data()?.segment))
                throw Error('Cadastre o segmento da empresa.');
            res.set('Cache-Control', 'no-store');
            return await fn(req, res, id);
        }
        catch (e) {
            return res.status(400).json({ error: e.code === 9 ? 'A central está sendo preparada. Aguarde um momento e tente novamente.' : typeof e.code === 'number' ? 'Não foi possível carregar a central agora. Tente novamente.' : e.message?.startsWith('Instagram API:') ? 'A Meta recusou a operação. Confira as permissões da conta.' : e.message || 'Não foi possível concluir.' });
        }
    };
    app.get('/api/instagram/studio/summary', owned(async (_req, res, id) => {
        // Home reads only our saved snapshot. Visiting home never fans out to Meta APIs.
        const [connection, snapshot] = await Promise.all([db.collection('instagramConnections').doc(id).get(), root(db, id).get()]);
        const c = connection.data();
        if (!c?.connected)
            return res.json({ connected: false });
        const saved = snapshot.data(), analytics = saved?.accountId === c.accountId ? saved.analytics : null;
        const media = Array.isArray(analytics?.media) ? analytics.media : [];
        const total = (key) => { const values = media.map((m) => m.metrics?.[key]).filter((v) => typeof v === 'number' && Number.isFinite(v)); return values.length ? values.reduce((a, b) => a + b, 0) : null; };
        return res.json({ connected: true, accountId: c.accountId, username: c.username || '', enabled: c.enabled === true, expired: !Number.isFinite(Date.parse(c.expiresAt)) || Date.parse(c.expiresAt) <= Date.now(), insightsPermission: (0, exports.hasScope)(c, exports.INSIGHTS_SCOPE), syncedAt: analytics?.syncedAt || null, since: analytics?.since || null, until: analytics?.until || null, views: analytics?.account?.views ?? null, reach: analytics?.account?.reach ?? null, likes: total('likes'), comments: total('comments'), sampleSize: media.length, media: media.slice(0, 3).map((m) => ({ id: clean(m.id, 100), caption: clean(m.caption, 180), type: clean(m.type, 30), thumbnail: /^https:\/\//.test(m.thumbnail || '') ? m.thumbnail : '', likes: typeof m.metrics?.likes === 'number' ? m.metrics.likes : null, comments: typeof m.metrics?.comments === 'number' ? m.metrics.comments : null })) });
    }));
    app.get('/api/instagram/studio', owned(async (_req, res, id) => {
        const [connection, snap, metrics, chats, store] = await Promise.all([db.collection('instagramConnections').doc(id).get(), posts(db).where('storeId', '==', id).orderBy('updatedAt', 'desc').limit(100).get(), root(db, id).get(), db.collection('establishments').doc(id).collection('chats').where('channel', '==', 'instagram').limit(1000).get(), db.collection('establishments').doc(id).get()]);
        const c = connection.data();
        const projects = store.data()?.segment === 'AUTOMOTIVE_PARTS' ? await db.collection('automotive_projects').where('establishmentId', '==', id).limit(1000).get() : null;
        const saved = metrics.data();
        return res.json({ segment: store.data()?.segment, connection: { connected: !!c?.connected, username: c?.username || '', accountId: c?.accountId || '', publishing: (0, exports.hasScope)(c, exports.PUBLISH_SCOPE), insights: (0, exports.hasScope)(c, exports.INSIGHTS_SCOPE) }, posts: snap.docs.filter(d => d.data().accountId === c?.accountId).map(d => postDto(d.id, d.data())), analytics: saved?.accountId === c?.accountId ? saved.analytics : null, funnel: studioFunnel(chats.docs.map(d => d.data()), projects?.docs.map(d => d.data()) || [], c?.accountId || ''), crmAvailable: store.data()?.segment === 'AUTOMOTIVE_PARTS', sampleLimit: 1000 });
    }));
    app.post('/api/instagram/studio/posts', owned(async (req, res, id) => {
        const p = validateStudioPost(req.body);
        await checkProduct(db, id, p);
        const c = usable((await db.collection('instagramConnections').doc(id).get()).data());
        const postId = req.body.id || crypto_1.default.randomUUID();
        if (!validId(postId))
            throw Error('Publicação inválida.');
        const ref = posts(db).doc(postId);
        await db.runTransaction(async (tx) => {
            const old = (await tx.get(ref)).data();
            if (old && (old.storeId !== id || old.accountId !== c.accountId))
                throw Error('Publicação indisponível nesta conta.');
            if (old && !['draft', 'cancelled', 'failed'].includes(old.status))
                throw Error('Cancele o agendamento antes de editar.');
            if (old && req.body.updatedAt !== old.updatedAt)
                throw Error('A publicação mudou. Atualize a tela antes de salvar.');
            tx.set(ref, { ...p, storeId: id, accountId: c.accountId, status: 'draft', createdAt: old?.createdAt || now(), updatedAt: now() });
        });
        return res.json({ id: postId });
    }));
    app.post('/api/instagram/studio/posts/:postId/queue', owned(async (req, res, id) => {
        if (!validId(req.params.postId))
            throw Error('Publicação inválida.');
        const scheduledAt = req.body.publishNow === true ? now() : studioSchedule(req.body.scheduledAt);
        const ref = posts(db).doc(String(req.params.postId));
        const p = (await ref.get()).data();
        if (!p || p.storeId !== id)
            throw Error('Publicação indisponível.');
        await checkProduct(db, id, p);
        await db.runTransaction(async (tx) => {
            const c = usable((await tx.get(db.collection('instagramConnections').doc(id))).data(), exports.PUBLISH_SCOPE);
            const live = (await tx.get(ref)).data();
            if (!live || live.storeId !== id || live.accountId !== c.accountId || !['draft', 'cancelled'].includes(live.status) || live.updatedAt !== p.updatedAt)
                throw Error('Atualize o rascunho antes de agendar.');
            tx.update(ref, { status: 'scheduled', scheduledAt, nextRunAt: new Date(Math.max(Date.now(), Date.parse(scheduledAt) - 10 * 60000)).toISOString(), approvedAt: now(), updatedAt: now(), lastError: null });
        });
        return res.json({ success: true });
    }));
    app.post('/api/instagram/studio/posts/:postId/cancel', owned(async (req, res, id) => {
        if (!validId(req.params.postId))
            throw Error('Publicação inválida.');
        await db.runTransaction(async (tx) => { const ref = posts(db).doc(String(req.params.postId)), p = (await tx.get(ref)).data(); if (!p || p.storeId !== id || !['draft', 'scheduled', 'processing', 'ready'].includes(p.status))
            throw Error('A publicação já está em envio ou não pode ser cancelada.'); tx.update(ref, { status: 'cancelled', updatedAt: now() }); });
        return res.json({ success: true });
    }));
    app.post('/api/instagram/studio/metrics', owned(async (_req, res, id) => {
        const c = usable((await db.collection('instagramConnections').doc(id).get()).data());
        const ref = root(db, id), syncId = crypto_1.default.randomUUID();
        await db.runTransaction(async (tx) => { const state = (await tx.get(ref)).data(); if (state?.syncLease > Date.now())
            throw Error('Aguarde antes de atualizar as métricas novamente.'); tx.set(ref, { syncLease: Date.now() + 120000, syncId }, { merge: true }); });
        try {
            const listing = await graph(`${c.accountId}/media?fields=id,caption,permalink,media_type,media_product_type,timestamp,thumbnail_url,media_url,like_count,comments_count&limit=25`, c.accessToken);
            const media = [];
            const items = listing.data || [];
            for (let i = 0; i < items.length; i += 5)
                await Promise.all(items.slice(i, i + 5).map(async (m) => {
                    const values = { likes: typeof m.like_count === 'number' ? m.like_count : null, comments: typeof m.comments_count === 'number' ? m.comments_count : null, views: null, reach: null, saved: null, shares: null };
                    if ((0, exports.hasScope)(c, exports.INSIGHTS_SCOPE))
                        await Promise.all(['views', 'reach', 'saved', 'shares'].map(async (metric) => { try {
                            values[metric] = insightValue(await graph(`${m.id}/insights?metric=${metric}`, c.accessToken));
                        }
                        catch { /* Unsupported metric stays unavailable, never fabricated as zero. */ } }));
                    media.push({ id: String(m.id), caption: clean(m.caption, 2200), permalink: /^https:\/\/(www\.)?instagram\.com\//.test(m.permalink || '') ? m.permalink : '', type: m.media_product_type || m.media_type, timestamp: m.timestamp || null, thumbnail: typeof (m.thumbnail_url || m.media_url) === 'string' ? (m.thumbnail_url || m.media_url) : '', metrics: values });
                }));
            media.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
            const until = Math.floor(Date.now() / 1000), since = until - 28 * 86400, account = { views: null, reach: null };
            if ((0, exports.hasScope)(c, exports.INSIGHTS_SCOPE))
                await Promise.all(['views', 'reach'].map(async (metric) => { try {
                    account[metric] = insightValue(await graph(`${c.accountId}/insights?metric=${metric}&period=day&metric_type=total_value&since=${since}&until=${until}`, c.accessToken));
                }
                catch { } }));
            const analytics = { syncedAt: now(), since: new Date(since * 1000).toISOString(), until: new Date(until * 1000).toISOString(), account, media, insightsAuthorized: (0, exports.hasScope)(c, exports.INSIGHTS_SCOPE) };
            await db.runTransaction(async (tx) => { const live = (await tx.get(db.collection('instagramConnections').doc(id))).data(), state = (await tx.get(ref)).data(); if (!live?.connected || live.accountId !== c.accountId || state?.syncId !== syncId)
                throw Error('A conexão mudou durante a consulta. Atualize a tela.'); tx.set(ref, { accountId: c.accountId, analytics, syncLease: Date.now() + 30000 }, { merge: true }); });
            return res.json({ analytics });
        }
        catch (e) {
            await ref.set({ syncLease: 0 }, { merge: true });
            throw e;
        }
    }));
}
async function runInstagramPublication(db, postId, graph) {
    const ref = posts(db).doc(postId), lease = crypto_1.default.randomUUID();
    const claimed = await db.runTransaction(async (tx) => {
        const p = (await tx.get(ref)).data();
        if (!p || !ACTIVE.includes(p.status) || Date.parse(p.nextRunAt) > Date.now() || p.leaseUntil > Date.now())
            return null;
        if (p.status === 'publishing') {
            tx.update(ref, { status: 'needs_review', lastError: 'O envio não foi confirmado. Confira o Instagram antes de criar outra publicação.', updatedAt: now() });
            return null;
        }
        const c = (await tx.get(db.collection('instagramConnections').doc(p.storeId))).data();
        try {
            usable(c, exports.PUBLISH_SCOPE);
            if (c.accountId !== p.accountId)
                throw Error('A conta conectada foi alterada.');
        }
        catch (e) {
            tx.update(ref, { status: 'failed', lastError: e.message, updatedAt: now() });
            return null;
        }
        tx.update(ref, { lease, leaseUntil: Date.now() + 240000, status: p.status === 'scheduled' || p.status === 'preparing' ? 'preparing' : p.status, updatedAt: now() });
        return { p, c };
    });
    if (!claimed)
        return;
    const { p, c } = claimed;
    let publishing = false;
    const update = async (value) => db.runTransaction(async (tx) => { const current = (await tx.get(ref)).data(); if (current?.lease !== lease || current.status === 'cancelled')
        return false; tx.update(ref, { ...value, leaseUntil: 0, updatedAt: now() }); return true; });
    try {
        await checkProduct(db, p.storeId, p);
        if (['scheduled', 'preparing'].includes(p.status)) {
            let body = { caption: p.caption };
            if (p.format === 'CAROUSEL') {
                const children = await Promise.all(p.media.map(async (url) => { const child = await graph(`${c.accountId}/media`, c.accessToken, 'POST', { image_url: url, is_carousel_item: true }); if (!/^\d+$/.test(String(child.id)))
                    throw Error('Mídia não confirmada.'); return String(child.id); }));
                body = { ...body, media_type: 'CAROUSEL', children };
            }
            else if (p.format === 'REELS')
                body = { ...body, media_type: 'REELS', video_url: p.media[0], share_to_feed: true };
            else
                body.image_url = p.media[0];
            const result = await graph(`${c.accountId}/media`, c.accessToken, 'POST', body);
            if (!/^\d+$/.test(String(result.id)))
                throw Error('Mídia não confirmada.');
            await update({ containerId: String(result.id), status: 'processing', processingStartedAt: now(), nextRunAt: new Date(Date.now() + 60000).toISOString(), lastError: null });
            return;
        }
        if (p.status === 'processing') {
            const result = await graph(`${p.containerId}?fields=status_code`, c.accessToken);
            if (result.status_code === 'PUBLISHED') {
                await update({ status: 'needs_review', lastError: 'A Meta indica conteúdo publicado. Confira o Instagram antes de repetir.' });
                return;
            }
            if (['ERROR', 'EXPIRED'].includes(result.status_code) || Date.now() - Date.parse(p.processingStartedAt) > 45 * 60000)
                throw Error('O processamento da mídia falhou ou expirou. Revise o arquivo e salve um novo rascunho.');
            await update({ status: result.status_code === 'FINISHED' ? 'ready' : 'processing', nextRunAt: new Date(Date.now() + 60000).toISOString() });
            return;
        }
        if (Date.parse(p.scheduledAt) > Date.now()) {
            await update({ nextRunAt: p.scheduledAt });
            return;
        }
        // Claim the irreversible send only after rechecking cancellation and the live account.
        const allowed = await db.runTransaction(async (tx) => {
            const live = (await tx.get(ref)).data(), connection = (await tx.get(db.collection('instagramConnections').doc(p.storeId))).data();
            if (live?.lease !== lease || live.status !== 'ready')
                return false;
            usable(connection, exports.PUBLISH_SCOPE);
            if (connection.accountId !== p.accountId || connection.accessToken !== c.accessToken)
                throw Error('A autorização mudou. Confira a conexão e salve um novo rascunho.');
            tx.update(ref, { status: 'publishing', nextRunAt: new Date(Date.now() + 240000).toISOString(), updatedAt: now() });
            return true;
        });
        if (!allowed)
            return;
        publishing = true;
        const result = await graph(`${c.accountId}/media_publish`, c.accessToken, 'POST', { creation_id: p.containerId });
        if (!/^\d+$/.test(String(result.id)))
            throw Error('Publicação não confirmada.');
        await update({ status: 'published', mediaId: String(result.id), publishedAt: now(), lastError: null });
        // Register context without enabling acquisition or changing the account's AI settings.
        try {
            await db.runTransaction(async (tx) => { const acq = (0, instagramAcquisition_1.acquisitionRef)(db, p.storeId), saved = (await tx.get(acq)).data(), live = (await tx.get(db.collection('instagramConnections').doc(p.storeId))).data(); if (live?.accountId !== p.accountId)
                return; const cfg = saved?.accountId === p.accountId ? saved : { ...(0, instagramAcquisition_1.defaultAcquisition)(), accountId: p.accountId }; const campaigns = cfg.campaigns || []; if (campaigns.length >= 50 || campaigns.some((v) => v.mediaId === String(result.id)))
                return; tx.set(acq, { ...cfg, campaigns: [...campaigns, { mediaId: String(result.id), title: p.title, campaignName: p.title, summary: p.summary, productId: p.productId, goal: p.goal, keywords: p.keywords, triggerMode: p.keywords.length ? 'keyword' : '', paid: false, enabled: false }], updatedAt: now() }); });
        }
        catch {
            await ref.update({ contextWarning: 'Publicação concluída. Vincule o contexto na seção de captação.' });
        }
    }
    catch (e) {
        await update({ status: publishing ? 'needs_review' : 'failed', lastError: publishing ? 'Não foi possível confirmar o envio. Confira o Instagram antes de criar outra publicação.' : e.message?.startsWith('Instagram API:') ? 'A Meta recusou o processamento. Confira o arquivo, a autorização e os limites de publicação.' : clean(e.message, 300) });
    }
}
async function runInstagramStudioQueue(db, graph) {
    const due = await posts(db).where('status', 'in', ACTIVE).where('nextRunAt', '<=', now()).orderBy('nextRunAt').limit(10).get();
    for (const d of due.docs)
        await runInstagramPublication(db, d.id, graph);
}
//# sourceMappingURL=instagramStudio.js.map