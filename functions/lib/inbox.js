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
exports.storeInboxMedia = storeInboxMedia;
exports.isHumanControlled = isHumanControlled;
exports.inboxChannel = inboxChannel;
exports.setInboxControl = setInboxControl;
exports.registerInboxRoutes = registerInboxRoutes;
exports.syncInboxMessage = syncInboxMessage;
const crypto_1 = __importDefault(require("crypto"));
const admin = __importStar(require("firebase-admin"));
const instagramWebhook_1 = require("./instagramWebhook");
const whatsappSender_1 = require("./whatsappSender");
async function storeInboxMedia(storeId, chatId, media) {
    if (/^https:\/\//.test(media.data))
        return media.data;
    const bytes = Buffer.from(media.data, 'base64');
    if (bytes.length > 25 * 1024 * 1024)
        throw new Error('Mídia grande demais para sincronizar.');
    const token = crypto_1.default.randomUUID();
    const extensions = { 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
    const file = admin.storage().bucket().file(`chat-media/${storeId}/${chatId}/${crypto_1.default.randomUUID()}.${extensions[media.mimeType] || 'bin'}`);
    await file.save(bytes, { resumable: false, metadata: { contentType: media.mimeType, metadata: { firebaseStorageDownloadTokens: token } } });
    return `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${token}`;
}
function isHumanControlled(chat, since) {
    return !!(chat?.aiPaused && (!chat.aiPausedUntil || new Date(chat.aiPausedUntil).getTime() > Date.now())) ||
        !!(since && chat?.aiPausedAt && chat.aiPausedAt > since);
}
function inboxChannel(id) { return /^(ig_|instagram_)/.test(id) ? 'instagram' : 'whatsapp'; }
async function setInboxControl(db, storeId, chatId, paused) {
    const timestamp = new Date().toISOString();
    const update = { aiPaused: paused, aiPausedUntil: null,
        ...(paused ? { aiPausedAt: timestamp, aiPausedReason: 'platform_takeover' } : { aiResumedAt: timestamp }) };
    // Chat is authoritative for both channels, including contacts without a CRM project.
    await db.collection('establishments').doc(storeId).collection('chats').doc(chatId).set(update, { merge: true });
    const projects = await db.collection('automotive_projects').where('establishmentId', '==', storeId).where('phone', '==', chatId).get();
    await Promise.all(projects.docs.map(p => p.ref.set(update, { merge: true })));
    return update;
}
function registerInboxRoutes(app, db) {
    app.use('/api/inbox', async (req, res, next) => {
        try {
            const token = (req.headers.authorization || '').replace(/^Bearer /, '');
            if (!token)
                return res.status(401).json({ error: 'Entre novamente para acessar as conversas.' });
            res.locals.inboxUid = (await admin.auth().verifyIdToken(token)).uid;
            next();
        }
        catch {
            return res.status(401).json({ error: 'Sessão expirada.' });
        }
    });
    app.post('/api/inbox/:chatId/:action', async (req, res) => {
        const storeId = res.locals.inboxUid;
        const chatId = String(req.params.chatId);
        const action = String(req.params.action);
        if (!/^(?:ig_\d+|instagram_\d+|\d{8,16})$/.test(chatId))
            return res.status(400).json({ error: 'Contato inválido.' });
        const chat = db.collection('establishments').doc(storeId).collection('chats').doc(chatId);
        try {
            if (!(await chat.get()).exists)
                return res.status(404).json({ error: 'Conversa não encontrada.' });
            if (action === 'project') {
                const matches = await db.collection('automotive_projects').where('establishmentId', '==', storeId).where('phone', '==', chatId).get();
                if (matches.docs.length)
                    return res.json({ project: { id: matches.docs[0].id, ...matches.docs[0].data() } });
                const id = crypto_1.default.createHash('sha256').update(`inbox:${storeId}:${chatId}`).digest('hex');
                const ref = db.collection('automotive_projects').doc(id);
                await db.runTransaction(async (tx) => {
                    const existing = await tx.get(ref);
                    const current = (await tx.get(chat)).data() || {};
                    const memory = (await tx.get(db.collection('establishments').doc(storeId).collection('customers').doc(chatId))).data() || {};
                    if (existing.exists)
                        return;
                    const ctx = memory.automotiveContext || {};
                    const now = new Date().toISOString();
                    tx.set(ref, { establishmentId: storeId, phone: chatId, customerName: current.customerName || ctx.customerName || 'Cliente',
                        brand: ctx.brand || '', model: ctx.model || '', year: ctx.year || '', version: ctx.version || '', modifications: ctx.modifications || '', objective: ctx.objective || '', cep: ctx.cep || '',
                        references: [], delivery: ctx.delivery || 'A definir', status: 'Novo contato', source: inboxChannel(chatId) === 'instagram' ? 'instagram_ai' : 'whatsapp_ai',
                        currency: ctx.currency || 'BRL', detectedLanguage: ctx.detectedLanguage || 'pt', conversationSummary: ctx.summary || '', lastMessage: current.lastMessage || '',
                        aiPaused: current.aiPaused || false, aiPausedUntil: current.aiPausedUntil || null, createdAt: now, updatedAt: now });
                });
                return res.json({ project: { id, ...(await ref.get()).data() } });
            }
            if (action === 'read') {
                // Read only through the message actually rendered, never newer arrivals in flight.
                const readAt = String(req.body.readAt || '');
                if (!Number.isFinite(Date.parse(readAt)) || Date.parse(readAt) > Date.now() + 5000)
                    return res.status(400).json({ error: 'Leitura inválida.' });
                await db.runTransaction(async (tx) => {
                    const current = (await tx.get(chat)).data() || {};
                    if (readAt >= (current.humanReadAt || ''))
                        tx.set(chat, { humanReadAt: readAt, unreadByHuman: !!(current.lastInboundAt && current.lastInboundAt > readAt) }, { merge: true });
                });
                return res.json({ success: true });
            }
            if (action === 'pause' || action === 'resume')
                return res.json({ success: true, ...await setInboxControl(db, storeId, chatId, action === 'pause') });
            if (action !== 'send')
                return res.status(404).json({ error: 'Ação inválida.' });
            const text = String(req.body.text || '').trim();
            if (!text || text.length > 10000)
                return res.status(400).json({ error: 'Escreva uma mensagem de até 10 mil caracteres.' });
            // Pause BEFORE the network send, so the bot cannot race the human reply.
            await setInboxControl(db, storeId, chatId, true);
            const message = chat.collection('messages').doc();
            const timestamp = new Date().toISOString();
            await message.set({ sender: 'assistant', author: 'Atendente', origin: 'human', text, timestamp, deliveryStatus: 'pending', channel: inboxChannel(chatId) });
            try {
                let result;
                if (inboxChannel(chatId) === 'instagram')
                    result = await (0, instagramWebhook_1.sendInstagramDirect)(db, storeId, chatId, text);
                else {
                    const store = (await db.collection('establishments').doc(storeId).get()).data() || {};
                    result = await (0, whatsappSender_1.sendWhatsAppMessage)((process.env.EVOLUTION_API_URL || store.evolutionApiUrl || '').replace(/\/$/, ''), store.evolutionApiKey || process.env.EVOLUTION_API_KEY || '', store.evolutionInstanceName || `pedidos_${storeId.slice(0, 15)}`, chatId, text);
                }
                if (!result.success)
                    throw new Error(result.error || 'O canal não confirmou o envio.');
                await message.update({ deliveryStatus: 'sent', sentAt: new Date().toISOString() });
                return res.json({ success: true, messageId: message.id });
            }
            catch (err) {
                await message.update({ deliveryStatus: 'failed', deliveryError: err.message });
                return res.status(502).json({ error: err.message });
            }
        }
        catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });
}
// One trigger for both channels, regardless of AI status or CRM qualification.
async function syncInboxMessage(db, storeId, chatId, messageId, notify) {
    const chat = db.collection('establishments').doc(storeId).collection('chats').doc(chatId);
    const message = chat.collection('messages').doc(messageId);
    let notification;
    await db.runTransaction(async (tx) => {
        const m = (await tx.get(message)).data();
        const current = (await tx.get(chat)).data() || {};
        if (!m || m.inboxSynced || !['user', 'assistant'].includes(m.sender))
            return;
        const timestamp = m.timestamp || new Date().toISOString();
        const user = m.sender === 'user';
        const patch = { channel: inboxChannel(chatId), customerPhone: chatId };
        if (timestamp >= (current.lastMessageAt || ''))
            Object.assign(patch, { lastMessage: m.text || '[Mídia]', lastMessageAt: timestamp, lastSender: m.sender });
        if (user && timestamp >= (current.lastInboundAt || ''))
            Object.assign(patch, { lastInboundAt: timestamp, lastUserMessage: m.text || '[Mídia]', unreadByHuman: timestamp > (current.humanReadAt || '') });
        tx.set(chat, patch, { merge: true });
        tx.update(message, { inboxSynced: true });
        if (user && !m.isOfflineCatchup && Date.now() - Date.parse(timestamp) < 5 * 60000 && Date.now() - Date.parse(timestamp) >= -5000) {
            const channel = inboxChannel(chatId) === 'instagram' ? 'Instagram' : 'WhatsApp';
            notification = { title: `${current.customerName || 'Cliente'} · ${channel}`, body: String(m.text || '[Mídia recebida]').slice(0, 140), url: `/?tab=inbox&chat=${encodeURIComponent(chatId)}` };
        }
    });
    if (notification)
        await notify(storeId, notification);
}
//# sourceMappingURL=inbox.js.map