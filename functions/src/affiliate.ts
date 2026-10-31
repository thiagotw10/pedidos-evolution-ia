import { Express, Request, Response } from 'express';
import * as admin from 'firebase-admin';

export const AFFILIATE_SEGMENT = 'AFFILIATES';
export type InstagramGraph = (path: string, token: string, method?: string, body?: any) => Promise<any>;
const iso = () => new Date().toISOString();
const workspace = (db: admin.firestore.Firestore, id: string) => db.collection('affiliateWorkspaces').doc(id);
const idOk = (id: string) => /^[\w-]{1,100}$/.test(id);
const text = (value: any, max: number) => String(value || '').trim().slice(0, max);
export function affiliateUrl(value: any, required = false): string {
  const input = text(value, 2000);
  if (!input && !required) return '';
  try {
    const u = new URL(input);
    if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.') || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/i.test(u.hostname)) throw new Error();
    return u.href;
  } catch { throw new Error('Informe um link HTTPS público válido.'); }
}
export function validateAffiliateProduct(input: any) {
  const name = text(input.name, 160);
  if (!name) throw new Error('Informe o nome do achadinho.');
  const price = input.price === '' || input.price == null ? null : Number(input.price);
  if (price !== null && (!Number.isFinite(price) || price < 0)) throw new Error('Preço inválido.');
  const link = affiliateUrl(input.affiliateUrl, true);
  if (link.length > 500) throw new Error('Use um link de afiliado com até 500 caracteres, preferencialmente o link curto da Shopee.');
  return { name, description: text(input.description, 3000), category: text(input.category, 100),
    affiliateUrl: link, imageUrl: affiliateUrl(input.imageUrl), videoUrl: affiliateUrl(input.videoUrl),
    price, active: input.active !== false, mediaAuthorized: input.mediaAuthorized === true, updatedAt: iso() };
}
export function affiliateKeywords(value: any): string[] {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set<string>(values.map((v: any) => text(v, 40).toLocaleLowerCase('pt-BR')).filter(Boolean))].slice(0, 12);
}
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function matchesAffiliateKeyword(comment: string, keywords: string[]) {
  const words = ` ${normalize(comment).replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  return keywords.some(k => words.includes(` ${normalize(k).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `));
}
export function affiliateCaption(product: any, keyword: string) {
  return `${product.name}\n\n${product.description ? `${product.description}\n\n` : ''}Comente ${keyword.toUpperCase()} para receber o link no Direct.\n\nLink de afiliado: posso receber comissão pela compra. Preço e disponibilidade devem ser conferidos na Shopee.`;
}

export function registerAffiliateRoutes(app: Express, db: admin.firestore.Firestore, graph: InstagramGraph) {
  const owned = (fn: (req: Request, res: Response, storeId: string) => Promise<any>) => async (req: Request, res: Response) => {
    let uid = '';
    try { uid = (await admin.auth().verifyIdToken((req.headers.authorization || '').replace(/^Bearer /, ''))).uid; }
    catch { return res.status(401).json({error:'Entre novamente para acessar seus achadinhos.'}); }
    const storeId = String(req.query.establishmentId || '');
    if (!storeId || storeId !== uid) return res.status(403).json({error:'Acesso restrito à sua conta.'});
    const store = (await db.collection('establishments').doc(storeId).get()).data();
    if (store?.segment !== AFFILIATE_SEGMENT) return res.status(403).json({error:'Este recurso pertence ao nicho Afiliados & Achadinhos.'});
    try { return await fn(req,res,storeId); }
    catch (e: any) { return res.status(400).json({error:e.message?.startsWith('Instagram API:') ? 'A Meta recusou a operação. Confira as permissões de publicação e comentários na conexão do Instagram.' : e.message || 'Não foi possível concluir.'}); }
  };
  app.get('/api/affiliate/workspace', owned(async (_req,res,id) => {
    const root = workspace(db,id);
    const [products,posts,connection] = await Promise.all([root.collection('products').limit(300).get(),root.collection('posts').limit(300).get(),db.collection('instagramConnections').doc(id).get()]);
    const c = connection.data();
    return res.json({ products:products.docs.map(d=>({id:d.id,...d.data()})), posts:posts.docs.map(d=>({id:d.id,...d.data()})),
      instagram:{connected:!!c?.connected,username:c?.username || '',affiliatePermissions:c?.affiliatePermissions === true},
      shopee:{connected:false,status:'Acesso à API de afiliados ainda não configurado. Cadastre os links manualmente por enquanto.'} });
  }));
  app.post('/api/affiliate/products', owned(async (req,res,id) => {
    const product = validateAffiliateProduct(req.body);
    const productId = req.body.id ? String(req.body.id) : workspace(db,id).collection('products').doc().id;
    if (!idOk(productId)) throw new Error('Produto inválido.');
    await workspace(db,id).collection('products').doc(productId).set(product,{merge:true});
    return res.json({id:productId,...product});
  }));
  app.post('/api/affiliate/posts', owned(async (req,res,id) => {
    const productId = String(req.body.productId || '');
    if (!idOk(productId)) throw new Error('Selecione um produto.');
    const root = workspace(db,id);
    const product = (await root.collection('products').doc(productId).get()).data();
    if (!product?.active) throw new Error('Selecione um produto ativo.');
    const keywords = affiliateKeywords(req.body.keywords);
    if (!keywords.length) throw new Error('Informe uma palavra para identificar os comentários.');
    const caption = text(req.body.caption || affiliateCaption(product, keywords[0]),2200);
    const postId = req.body.id ? String(req.body.id) : root.collection('posts').doc().id;
    if (!idOk(postId)) throw new Error('Publicação inválida.');
    const postRef = root.collection('posts').doc(postId);
    await db.runTransaction(async tx => {
      const previous = (await tx.get(postRef)).data();
      if (previous && previous.status !== 'draft') throw new Error('Esta publicação já está em processamento. Crie um novo rascunho para alterar o conteúdo.');
      tx.set(postRef,{productId,keywords,caption,status:'draft',automationEnabled:false,updatedAt:iso()},{merge:true});
    });
    return res.json({id:postId});
  }));
  const connection = async (id: string) => {
    const c = (await db.collection('instagramConnections').doc(id).get()).data();
    if (!c?.connected || !c.affiliatePermissions || new Date(c.expiresAt).getTime() <= Date.now()) throw new Error('Conecte o Instagram deste perfil com as permissões de publicação e comentários.');
    return c;
  };
  app.post('/api/affiliate/posts/:postId/prepare', owned(async (req,res,id) => {
    const postId = String(req.params.postId);
    if (!idOk(postId)) throw new Error('Publicação inválida.');
    const c = await connection(id);
    const root = workspace(db,id), ref = root.collection('posts').doc(postId);
    const post = await db.runTransaction(async tx => {
      const p = (await tx.get(ref)).data();
      if (!p || p.status !== 'draft') throw new Error('A publicação não está em rascunho.');
      const product = (await tx.get(root.collection('products').doc(p.productId))).data();
      if (!product?.active || !product.mediaAuthorized || !product.videoUrl) throw new Error('Cadastre um vídeo autorizado no produto antes de preparar o Reel.');
      tx.update(ref,{status:'preparing',updatedAt:iso(),accountId:c.accountId});
      return {...p,caption:String(p.caption || ''),videoUrl:affiliateUrl(product.videoUrl,true)};
    });
    try {
      const result = await graph(`${c.accountId}/media`,c.accessToken,'POST',{media_type:'REELS',video_url:post.videoUrl,caption:post.caption,share_to_feed:true});
      if (!result.id) throw new Error('A Meta não retornou o identificador do vídeo.');
      await ref.update({status:'processing',containerId:String(result.id),lastError:null,updatedAt:iso()});
      return res.json({success:true});
    } catch (e) { await ref.update({status:'draft',lastError:'Não foi possível preparar o vídeo na Meta. Confira a URL, o formato e as permissões.'}); throw e; }
  }));
  app.post('/api/affiliate/posts/:postId/check', owned(async (req,res,id) => {
    const postId = String(req.params.postId);
    if (!idOk(postId)) throw new Error('Publicação inválida.');
    const c = await connection(id), ref = workspace(db,id).collection('posts').doc(postId), p = (await ref.get()).data();
    if (!p?.containerId || p.accountId !== c.accountId || !['processing','ready'].includes(p.status)) throw new Error('Este vídeo não está aguardando processamento nesta conta.');
    const result = await graph(`${p.containerId}?fields=status_code`,c.accessToken);
    const status = result.status_code === 'FINISHED' ? 'ready' : ['ERROR','EXPIRED'].includes(result.status_code) ? 'draft' : 'processing';
    await ref.update({status,lastError:status==='draft'?'O processamento do vídeo falhou ou expirou. Confira o arquivo e prepare novamente.':null,updatedAt:iso()});
    return res.json({status});
  }));
  app.post('/api/affiliate/posts/:postId/publish', owned(async (req,res,id) => {
    const postId = String(req.params.postId);
    if (!idOk(postId)) throw new Error('Publicação inválida.');
    const c = await connection(id), ref = workspace(db,id).collection('posts').doc(postId);
    const p = await db.runTransaction(async tx => {
      const p = (await tx.get(ref)).data();
      if (!p || p.status !== 'ready' || p.accountId !== c.accountId) throw new Error('O vídeo precisa estar pronto nesta conta antes da publicação.');
      const product = (await tx.get(workspace(db,id).collection('products').doc(p.productId))).data();
      if (!product?.active || !product.mediaAuthorized) throw new Error('O produto ou a autorização da mídia foi desativado.');
      tx.update(ref,{status:'publishing',updatedAt:iso()}); return p;
    });
    try {
      const result = await graph(`${c.accountId}/media_publish`,c.accessToken,'POST',{creation_id:p.containerId});
      if (!result.id) throw new Error('A Meta não confirmou a publicação.');
      await ref.update({status:'published',mediaId:String(result.id),publishedAt:iso(),automationEnabled:false,lastError:null});
      return res.json({success:true});
    } catch (e) {
      await ref.update({status:'needs_review',lastError:'Não foi possível confirmar a publicação. Confira o Instagram antes de tentar publicar outro rascunho para evitar duplicidade.'}); throw e;
    }
  }));
  app.post('/api/affiliate/posts/:postId/automation', owned(async (req,res,id) => {
    const postId = String(req.params.postId);
    if (!idOk(postId) || typeof req.body.enabled !== 'boolean') throw new Error('Configuração inválida.');
    const c = await connection(id), ref = workspace(db,id).collection('posts').doc(postId), p = (await ref.get()).data();
    if (!p || p.status !== 'published' || p.accountId !== c.accountId) throw new Error('A automação exige um Reel publicado por este perfil.');
    await ref.update({automationEnabled:req.body.enabled,updatedAt:iso()});
    return res.json({success:true});
  }));
}

export function extractAffiliateComments(body: any) {
  if (body?.object !== 'instagram' || !Array.isArray(body.entry)) return [];
  return body.entry.flatMap((entry: any) => (Array.isArray(entry.changes)?entry.changes:[])
    .filter((change: any)=>change.field==='comments' && change.value?.id && change.value?.media?.id && change.value?.from?.id && change.value?.text)
    .map((change: any)=>({kind:'affiliate_comment',accountId:String(entry.id),senderId:String(change.value.from.id),
      username:String(change.value.from.username || ''),mid:String(change.value.id),mediaId:String(change.value.media.id),text:String(change.value.text),
      timestamp:Number(entry.time)>0?Number(entry.time)*1000:Date.now()})));
}

export async function processAffiliateComment(db: admin.firestore.Firestore,eventId: string,graph: InstagramGraph) {
  const eventRef = db.collection('instagramEvents').doc(eventId), event = (await eventRef.get()).data();
  if (!event || ['sent','ignored','failed','sending'].includes(event.status)) return;
  const storeRef = db.collection('establishments').doc(event.storeId);
  const [storeSnap,cSnap,posts] = await Promise.all([storeRef.get(),db.collection('instagramConnections').doc(event.storeId).get(),
    workspace(db,event.storeId).collection('posts').where('mediaId','==',event.mediaId).limit(1).get()]);
  const c = cSnap.data(), p = posts.docs[0]?.data();
  if (storeSnap.data()?.segment!==AFFILIATE_SEGMENT || !c?.connected || !c.affiliatePermissions || new Date(c.expiresAt).getTime() <= Date.now() || c.accountId!==event.accountId || event.senderId===c.accountId ||
    !p?.automationEnabled || p.status!=='published' || p.accountId!==c.accountId || Date.now()-event.timestamp>7*86400000 || !matchesAffiliateKeyword(event.text,p.keywords || [])) {
    await eventRef.update({status:'ignored'}); return;
  }
  const product = (await workspace(db,event.storeId).collection('products').doc(p.productId).get()).data();
  const chat = storeRef.collection('chats').doc(`ig_${event.senderId}`);
  if (!product?.active || (await chat.get()).data()?.aiPaused) { await eventRef.update({status:'ignored'}); return; }
  const reply = `Aqui está o link de ${product.name}:\n${affiliateUrl(product.affiliateUrl,true)}\n\nÉ um link de afiliado: podemos receber comissão. Confira preço e disponibilidade na Shopee.`;
  // At most one attempt across webhook retries; ambiguous provider timeouts require manual review.
  const acquired = await db.runTransaction(async tx => {
    const current = (await tx.get(eventRef)).data();
    const livePost = (await tx.get(posts.docs[0].ref)).data();
    const liveChat = (await tx.get(chat)).data();
    const liveConnection = (await tx.get(db.collection('instagramConnections').doc(event.storeId))).data();
    if (!current || !['pending','processing'].includes(current.status)) return false;
    if (!livePost?.automationEnabled || liveChat?.aiPaused || !liveConnection?.connected || liveConnection.accountId !== event.accountId) {
      tx.update(eventRef,{status:'ignored'}); return false;
    }
    tx.update(eventRef,{status:'sending'}); return true;
  });
  if (!acquired) return;
  try {
    const result = await graph(`${c.accountId}/messages`,c.accessToken,'POST',{recipient:{comment_id:event.mid},message:{text:reply}});
    if (!result.message_id) throw new Error('Unconfirmed private reply');
    const timestamp = iso();
    await chat.collection('messages').doc(`comment_${eventId}`).set({sender:'assistant',origin:'automation',channel:'instagram',text:reply,timestamp,deliveryStatus:'sent',providerMessageId:result.message_id,affiliateProductId:p.productId});
    await chat.set({channel:'instagram',customerPhone:`ig_${event.senderId}`,customerName:'Visitante Instagram',instagramSenderId:event.senderId,instagramAccountId:event.accountId,
      affiliateProductId:p.productId,lastMessage:reply,lastTimestamp:timestamp,updatedAt:timestamp,leadSource:'Comentário Instagram',unreadByHuman:true},{merge:true});
    // A private reply does not open the regular 24h DM window; do not set lastInboundAt.
    await eventRef.update({status:'sent'});
    await posts.docs[0].ref.update({lastLinkSentAt:timestamp,lastError:null});
  } catch {
    const lastError = 'Resposta privada não confirmada. Confira as permissões e o Instagram antes de reenviar.';
    await eventRef.update({status:'failed',lastError});
    await posts.docs[0].ref.update({lastError});
  }
}

export async function affiliateDirectReply(db: admin.firestore.Firestore,storeId: string,chatId: string,incoming: string, channel: 'instagram' | 'whatsapp' = 'instagram') {
  const root = workspace(db,storeId), chat = db.collection('establishments').doc(storeId).collection('chats').doc(chatId);
  const [productsSnap,chatSnap] = await Promise.all([root.collection('products').where('active','==',true).limit(300).get(),chat.get()]);
  const products = productsSnap.docs.map(d=>({id:d.id,...d.data()} as any));
  const query = normalize(incoming).trim();
  const explicit = products.filter(p=>query.includes(normalize(p.name)) || (query.length>=4 && normalize(p.name).includes(query)));
  let product = explicit.length===1 ? explicit[0] : null;
  if (!product && /\b(link|quero|esse|este|produto|sim)\b/i.test(query) && explicit.length===0) product = products.find(p=>p.id===chatSnap.data()?.affiliateProductId);
  let replyText: string;
  if (product && !/\b(entrega|prazo|garantia|estoque|cupom|desconto|frete)\b/.test(query)) {
    replyText = `Aqui está ${product.name} 😊\n${product.description ? `${product.description}\n\n` : ''}${affiliateUrl(product.affiliateUrl,true)}\n\nEste é um link de afiliado. Podemos receber comissão pela compra. Confira o preço atual e a disponibilidade na Shopee.`;
    await chat.set({affiliateProductId:product.id},{merge:true});
  } else if (/\b(entrega|prazo|garantia|estoque|cupom|desconto|frete)\b/.test(query)) {
    replyText = 'Essas condições dependem do vendedor e do seu endereço. Confira o anúncio na Shopee antes de comprar. Qual produto você está procurando?';
  } else {
    replyText = products.length ? `Oi! Qual achadinho você quer conhecer? 😊 Me diga o nome do produto ou envie a referência do Reel para eu localizar o link certo.` : 'Oi! Estamos preparando nossos achadinhos por aqui 😊 Qual produto você está procurando?';
  }
  const timestamp = iso();
  const message = await chat.collection('messages').add({sender:'assistant',origin:'ai',channel,text:replyText,timestamp,deliveryStatus:'pending'});
  await chat.set({lastMessage:replyText,lastTimestamp:timestamp,updatedAt:timestamp},{merge:true});
  return {replyText,assistantMessageId:message.id};
}
