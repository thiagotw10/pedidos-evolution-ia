import { Express } from 'express';
import crypto from 'crypto';
import * as admin from 'firebase-admin';
import { sendInstagramDirect } from './instagramWebhook';
import { sendWhatsAppMessage } from './whatsappSender';

export async function storeInboxMedia(storeId: string, chatId: string, media: {mimeType:string;data:string}): Promise<string> {
  if (/^https:\/\//.test(media.data)) return media.data;
  const bytes = Buffer.from(media.data,'base64');
  if (bytes.length > 25 * 1024 * 1024) throw new Error('Mídia grande demais para sincronizar.');
  const token = crypto.randomUUID();
  const extensions:Record<string,string>={'audio/mp4':'m4a','audio/mpeg':'mp3','audio/wav':'wav','image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'};
  const file = admin.storage().bucket().file(`chat-media/${storeId}/${chatId}/${crypto.randomUUID()}.${extensions[media.mimeType]||'bin'}`);
  await file.save(bytes,{resumable:false,metadata:{contentType:media.mimeType,metadata:{firebaseStorageDownloadTokens:token}}});
  return `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${token}`;
}

export function isHumanControlled(chat: any, since?: string): boolean {
  return !!(chat?.aiPaused && (!chat.aiPausedUntil || new Date(chat.aiPausedUntil).getTime() > Date.now())) ||
    !!(since && chat?.aiPausedAt && chat.aiPausedAt > since);
}
export function inboxChannel(id: string) { return /^(ig_|instagram_)/.test(id) ? 'instagram' : 'whatsapp'; }
export async function setInboxControl(db: admin.firestore.Firestore, storeId: string, chatId: string, paused: boolean) {
  const timestamp = new Date().toISOString();
  const update = { aiPaused: paused, aiPausedUntil: null,
    ...(paused ? {aiPausedAt: timestamp, aiPausedReason: 'platform_takeover'} : {aiResumedAt: timestamp}) };
  // Chat is authoritative for both channels, including contacts without a CRM project.
  await db.collection('establishments').doc(storeId).collection('chats').doc(chatId).set(update, {merge:true});
  const projects = await db.collection('automotive_projects').where('establishmentId','==',storeId).where('phone','==',chatId).get();
  await Promise.all(projects.docs.map(p => p.ref.set(update, {merge:true})));
  return update;
}
export function registerInboxRoutes(app: Express, db: admin.firestore.Firestore) {
  app.use('/api/inbox', async (req, res, next) => {
    try {
      const token = (req.headers.authorization || '').replace(/^Bearer /, '');
      if (!token) return res.status(401).json({error:'Entre novamente para acessar as conversas.'});
      res.locals.inboxUid = (await admin.auth().verifyIdToken(token)).uid;
      next();
    } catch { return res.status(401).json({error:'Sessão expirada.'}); }
  });
  app.post('/api/inbox/:chatId/:action', async (req, res) => {
    const storeId = res.locals.inboxUid;
    const chatId = String(req.params.chatId);
    const action = String(req.params.action);
    if (!/^(?:ig_\d+|instagram_\d+|\d{8,16})$/.test(chatId)) return res.status(400).json({error:'Contato inválido.'});
    const chat = db.collection('establishments').doc(storeId).collection('chats').doc(chatId);
    try {
      if (!(await chat.get()).exists) return res.status(404).json({error:'Conversa não encontrada.'});
      if (action === 'project') {
        const matches = await db.collection('automotive_projects').where('establishmentId','==',storeId).where('phone','==',chatId).get();
        if (matches.docs.length) return res.json({project:{id:matches.docs[0].id,...matches.docs[0].data()}});
        const id=crypto.createHash('sha256').update(`inbox:${storeId}:${chatId}`).digest('hex');
        const ref=db.collection('automotive_projects').doc(id);
        await db.runTransaction(async tx=>{
          const existing=await tx.get(ref);
          const current=(await tx.get(chat)).data()||{};
          const memory=(await tx.get(db.collection('establishments').doc(storeId).collection('customers').doc(chatId))).data()||{};
          if(existing.exists)return;
          const ctx=memory.automotiveContext||{};
          const now=new Date().toISOString();
          tx.set(ref,{establishmentId:storeId,phone:chatId,customerName:current.customerName||ctx.customerName||'Cliente',
            brand:ctx.brand||'',model:ctx.model||'',year:ctx.year||'',version:ctx.version||'',modifications:ctx.modifications||'',objective:ctx.objective||'',cep:ctx.cep||'',
            references:[],delivery:ctx.delivery||'A definir',status:'Novo contato',source:inboxChannel(chatId)==='instagram'?'instagram_ai':'whatsapp_ai',
            currency:ctx.currency||'BRL',detectedLanguage:ctx.detectedLanguage||'pt',conversationSummary:ctx.summary||'',lastMessage:current.lastMessage||'',
            aiPaused:current.aiPaused||false,aiPausedUntil:current.aiPausedUntil||null,createdAt:now,updatedAt:now});
        });
        return res.json({project:{id,...(await ref.get()).data()}});
      }
      if (action === 'read') {
        // Read only through the message actually rendered, never newer arrivals in flight.
        const readAt = String(req.body.readAt || '');
        if (!Number.isFinite(Date.parse(readAt)) || Date.parse(readAt) > Date.now() + 5000) return res.status(400).json({error:'Leitura inválida.'});
        await db.runTransaction(async tx => {
          const current = (await tx.get(chat)).data() || {};
          if (readAt >= (current.humanReadAt || '')) tx.set(chat, {humanReadAt: readAt, unreadByHuman: !!(current.lastInboundAt && current.lastInboundAt > readAt)}, {merge:true});
        });
        return res.json({success:true});
      }
      if (action === 'pause' || action === 'resume') return res.json({success:true, ...await setInboxControl(db,storeId,chatId,action === 'pause')});
      if (action !== 'send') return res.status(404).json({error:'Ação inválida.'});
      const text = String(req.body.text || '').trim();
      if (!text || text.length > 10000) return res.status(400).json({error:'Escreva uma mensagem de até 10 mil caracteres.'});
      // Pause BEFORE the network send, so the bot cannot race the human reply.
      await setInboxControl(db,storeId,chatId,true);
      const message = chat.collection('messages').doc();
      const timestamp = new Date().toISOString();
      await message.set({sender:'assistant', author:'Atendente', origin:'human', text, timestamp, deliveryStatus:'pending', channel:inboxChannel(chatId)});
      try {
        let result: {success:boolean; error?:string};
        if (inboxChannel(chatId) === 'instagram') result = await sendInstagramDirect(db,storeId,chatId,text);
        else {
          const store = (await db.collection('establishments').doc(storeId).get()).data() || {};
          result = await sendWhatsAppMessage((process.env.EVOLUTION_API_URL || store.evolutionApiUrl || '').replace(/\/$/,''),
            store.evolutionApiKey || process.env.EVOLUTION_API_KEY || '', store.evolutionInstanceName || `pedidos_${storeId.slice(0,15)}`,chatId,text);
        }
        if (!result.success) throw new Error(result.error || 'O canal não confirmou o envio.');
        await message.update({deliveryStatus:'sent', sentAt:new Date().toISOString()});
        return res.json({success:true, messageId:message.id});
      } catch (err:any) {
        await message.update({deliveryStatus:'failed', deliveryError:err.message});
        return res.status(502).json({error:err.message});
      }
    } catch (err:any) { return res.status(500).json({error:err.message}); }
  });
}

// One trigger for both channels, regardless of AI status or CRM qualification.
export async function syncInboxMessage(db: admin.firestore.Firestore, storeId: string, chatId: string, messageId: string,
  notify: (storeId: string, payload: {title:string;body:string;url:string}) => Promise<void>) {
  const chat = db.collection('establishments').doc(storeId).collection('chats').doc(chatId);
  const message = chat.collection('messages').doc(messageId);
  let notification: any;
  await db.runTransaction(async tx => {
    const m = (await tx.get(message)).data();
    const current = (await tx.get(chat)).data() || {};
    if (!m || m.inboxSynced || !['user','assistant'].includes(m.sender)) return;
    const timestamp = m.timestamp || new Date().toISOString();
    const user = m.sender === 'user';
    const patch: any = {channel:inboxChannel(chatId), customerPhone:chatId};
    if (timestamp >= (current.lastMessageAt || '')) Object.assign(patch, {lastMessage:m.text || '[Mídia]',lastMessageAt:timestamp,lastSender:m.sender});
    if (user && timestamp >= (current.lastInboundAt || '')) Object.assign(patch, {lastInboundAt:timestamp,lastUserMessage:m.text || '[Mídia]',unreadByHuman:timestamp > (current.humanReadAt || '')});
    tx.set(chat,patch,{merge:true});
    tx.update(message,{inboxSynced:true});
    if (user && !m.isOfflineCatchup && Date.now()-Date.parse(timestamp) < 5*60000 && Date.now()-Date.parse(timestamp) >= -5000) {
      const channel = inboxChannel(chatId) === 'instagram' ? 'Instagram' : 'WhatsApp';
      notification = {title:`${current.customerName || 'Cliente'} · ${channel}`,body:String(m.text || '[Mídia recebida]').slice(0,140),url:`/?tab=inbox&chat=${encodeURIComponent(chatId)}`};
    }
  });
  if (notification) await notify(storeId,notification);
}
