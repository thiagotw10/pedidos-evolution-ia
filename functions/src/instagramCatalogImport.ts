import {generateInstagramCatalogContent} from './instagramCatalogContent';
import {normalizeAutomotiveSpecs} from './automotiveCatalog';
import {normalizeVehicleSpecs} from './vehicleSpecs';
import * as admin from 'firebase-admin';
import {Express,Request,Response} from 'express';
import crypto from 'crypto';
type Graph=(path:string,token:string,method?:string,body?:any)=>Promise<any>;
const clean=(v:any,max=2200)=>typeof v==='string'?v.trim().slice(0,max):'';
const bucketName='iapedido.firebasestorage.app';
const validId=(v:any)=>typeof v==='string'&&/^\d{5,40}$/.test(v);
export const instagramImportedProductId=(account:string,media:string)=>'ig_'+crypto.createHash('sha256').update(account+':'+media).digest('hex').slice(0,24);
export function trustedInstagramAsset(raw:string){let url:URL;try{url=new URL(raw);}catch{throw Error('URL de mídia inválida.');}if(url.protocol!=='https:'||url.username||url.password||url.port||!['cdninstagram.com','fbcdn.net'].some(host=>url.hostname===host||url.hostname.endsWith('.'+host)))throw Error('Origem da mídia não autorizada.');return url.toString();}
export function officialPostAssets(post:any){
 const children=Array.isArray(post.children?.data)?post.children.data:[post];
 return children.slice(0,20).filter((m:any)=>validId(String(m.id))&&['IMAGE','VIDEO'].includes(m.media_type)&&typeof m.media_url==='string').flatMap((m:any)=>{const asset={id:String(m.id),type:m.media_type==='VIDEO'?'video':'image',url:trustedInstagramAsset(m.media_url),thumbnail:m.thumbnail_url?trustedInstagramAsset(m.thumbnail_url):m.media_type==='IMAGE'?trustedInstagramAsset(m.media_url):''};return asset.type==='video'&&asset.thumbnail?[asset,{id:String(m.id)+'_cover',type:'image',url:asset.thumbnail,thumbnail:asset.thumbnail}]:[asset];});
}
async function copyAsset(store:string,product:string,asset:any){
 const url=trustedInstagramAsset(asset.url),max=(asset.type==='video'?40:8)*1024*1024;
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('A mídia expirou ou não está acessível. Reabra a publicação e tente novamente.');
 const mime=(response.headers.get('content-type')||'').split(';')[0];if(!(asset.type==='video'?['video/mp4','video/quicktime']:['image/jpeg','image/png','image/webp']).includes(mime))throw Error('Formato de mídia não suportado.');
 if(Number(response.headers.get('content-length')||0)>max)throw Error('Arquivo acima do limite: fotos 8 MB; vídeo 40 MB.');
 const chunks:Uint8Array[]=[];let bytes=0;const reader=response.body?.getReader();if(!reader)throw Error('Arquivo vazio.');
 try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>max)throw Error('Arquivo acima do limite permitido.');chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});}
 if(!bytes)throw Error('Arquivo vazio.');
 const ext=mime==='video/mp4'?'mp4':mime==='video/quicktime'?'mov':mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';const path=`establishments/${store}/products/${product}_${asset.id}.${ext}`,token=crypto.randomUUID();
 await admin.storage().bucket(bucketName).file(path).save(Buffer.concat(chunks),{resumable:false,metadata:{contentType:mime,metadata:{firebaseStorageDownloadTokens:token}}});
 return {url:`https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`,type:asset.type};
}
const suggest=generateInstagramCatalogContent;
export function registerInstagramCatalogImport(app:Express,db:admin.firestore.Firestore,graph:Graph,deps:{copy?:typeof copyAsset;suggest?:typeof suggest}={}){
 const sources=(id:string)=>db.collection('automotiveOperations').doc(id).collection('instagramImportSources');
 const products=(id:string)=>db.collection('establishments').doc(id).collection('products');
 const owned=(fn:(req:Request,res:Response,id:string,c:any,segment:string)=>Promise<any>)=>async(req:Request,res:Response)=>{
  let id;try{id=(await admin.auth().verifyIdToken((req.headers.authorization||'').replace(/^Bearer /,''))).uid;}catch{return res.status(401).json({error:'Entre novamente na plataforma.'});}
  try{const store=(await db.collection('establishments').doc(id).get()).data();if(!['AUTOMOTIVE_PARTS','VEHICLES'].includes(store?.segment))return res.status(403).json({error:'Importação disponível nos catálogos de veículos e performance.'});const c=(await db.collection('instagramConnections').doc(id).get()).data();if(!c?.connected)throw Error('Conecte o Instagram em Instagram → Conta e atendimento.');if(!Number.isFinite(Date.parse(c.expiresAt))||Date.parse(c.expiresAt)<=Date.now())throw Error('A autorização expirou. Reconecte o Instagram.');return await fn(req,res,id,c,store.segment);}catch(e:any){return res.status(400).json({error:e.message?.startsWith('Instagram API:')?'A Meta recusou o acesso. Renove a conexão do Instagram e tente novamente.':e.message||'Não foi possível importar.'});}
 };
 async function existing(id:string,c:any,media:any){const pid=instagramImportedProductId(c.accountId,String(media.id));const direct=await products(id).doc(pid).get();if(direct.exists)return pid;const shortcode=String(media.permalink||'').match(/\/(?:p|reel|tv)\/([\w-]+)/)?.[1];if(shortcode){const prior=await products(id).where('instagramShortcode','==',shortcode).limit(1).get();if(prior.docs.length)return prior.docs[0].id;}return null;}
 app.get('/api/instagram/catalog-import/posts',owned(async(req,res,id,c)=>{
  const after=clean(req.query.after,1000);if(after&&!/^[A-Za-z0-9_=-]+$/.test(after))throw Error('Página inválida.');
  const response=await graph(`${c.accountId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=25${after?'&after='+encodeURIComponent(after):''}`,c.accessToken);
  const posts=[];for(const m of response.data||[]){if(!validId(String(m.id)))continue;await sources(id).doc(String(m.id)).set({accountId:c.accountId,listedAt:Date.now(),permalink:clean(m.permalink,500)},{merge:true});posts.push({id:String(m.id),caption:clean(m.caption),type:m.media_type,thumbnail:m.thumbnail_url||m.media_type!=='VIDEO'&&m.media_url||'',permalink:clean(m.permalink,500),timestamp:clean(m.timestamp,40),existingProductId:await existing(id,c,m)});}
  return res.json({username:c.username||'',accountId:c.accountId,posts,next:response.paging?.next?response.paging?.cursors?.after||null:null});
 }));
 app.get('/api/instagram/catalog-import/posts/:mediaId',owned(async(req,res,id,c,segment)=>{
  const mediaId=String(req.params.mediaId);if(!validId(mediaId))throw Error('Publicação inválida.');const ref=sources(id).doc(mediaId),listed=(await ref.get()).data();if(listed?.accountId!==c.accountId||Date.now()-listed.listedAt>3600000)throw Error('Carregue a lista e selecione uma publicação desta conta.');
  const media=await graph(`${mediaId}?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children.limit(20){id,media_type,media_url,thumbnail_url}`,c.accessToken);if(String(media.id)!==mediaId)throw Error('Publicação não confirmada.');const assets=officialPostAssets(media);if(!assets.length)throw Error('A Meta não disponibilizou fotos ou vídeo para esta publicação.');const duplicate=await existing(id,c,media);
  await ref.set({accountId:c.accountId,assets,caption:clean(media.caption),permalink:clean(media.permalink,500),preparedAt:Date.now()},{merge:true});return res.json({id:mediaId,caption:clean(media.caption),assets,existingProductId:duplicate,suggested:await(deps.suggest||suggest)(clean(media.caption),segment)});
 }));
 app.post('/api/instagram/catalog-import/import',owned(async(req,res,id,c,segment)=>{
  const mediaId=String(req.body.mediaId||''),assetIds=req.body.assetIds;if(!validId(mediaId)||!Array.isArray(assetIds)||!assetIds.length||assetIds.length>20||new Set(assetIds).size!==assetIds.length)throw Error('Selecione as mídias da publicação.');
  const ref=sources(id).doc(mediaId),prepared=(await ref.get()).data();if(prepared?.accountId!==c.accountId||Date.now()-prepared.preparedAt>15*60000)throw Error('A seleção expirou. Reabra a publicação.');const assets=assetIds.map((key:any)=>prepared.assets?.find((a:any)=>a.id===key));if(assets.some((a:any)=>!a)||assets.filter((a:any)=>a.type==='video').length>1)throw Error('Selecione até um vídeo e as fotos desejadas.');
  const duplicate=await existing(id,c,{id:mediaId,permalink:prepared.permalink});if(duplicate)return res.status(409).json({error:'Esta publicação já está no catálogo. Edite o cadastro existente para atualizar.',existingProductId:duplicate});
  const name=clean(req.body.name,180),category=clean(req.body.category,100)||'Geral',description=clean(req.body.description,4000),price=Number(req.body.price||0);if(!name||!Number.isFinite(price)||price<0||price>999999999.99||typeof req.body.available!=='boolean')throw Error('Revise nome, preço e disponibilidade.');
  const aiKnowledge=clean(req.body.aiKnowledge,4000);
  let structured:any={};if(segment==='AUTOMOTIVE_PARTS'){structured=normalizeAutomotiveSpecs(req.body.automotiveSpecs||{});structured.validation='reference';if(!req.body.automotiveSpecs?.status)delete structured.status;}else{structured=normalizeVehicleSpecs(req.body.vehicleSpecs||{});structured.status=req.body.available?'available':'unavailable';}
  const lease=crypto.randomUUID();await db.runTransaction(async tx=>{const live=(await tx.get(ref)).data();if(live?.importUntil>Date.now())throw Error('Esta publicação já está sendo importada. Aguarde.');if(live?.accountId!==c.accountId)throw Error('A conta conectada mudou.');tx.set(ref,{importLease:lease,importUntil:Date.now()+180000},{merge:true});});
  const pid=instagramImportedProductId(c.accountId,mediaId);
  try{const permanent=[];for(const asset of assets)permanent.push(await(deps.copy||copyAsset)(id,pid,asset));const live=(await db.collection('instagramConnections').doc(id).get()).data();if(!live?.connected||live.accountId!==c.accountId)throw Error('A conexão mudou durante a importação.');const images=permanent.filter(a=>a.type==='image').map(a=>a.url),videoUrl=permanent.find(a=>a.type==='video')?.url||null;const shortcode=prepared.permalink?.match(/\/(?:p|reel|tv)\/([\w-]+)/)?.[1]||'';const product={id:pid,name,category,description,aiKnowledge,price:segment==='VEHICLES'?Math.round(price*100)/100:0,available:req.body.available,images,imageUrl:images[0]||'',videoUrl,instagramMediaId:mediaId,instagramAccountId:c.accountId,instagramPermalink:prepared.permalink||'',instagramShortcode:shortcode,...(segment==='VEHICLES'?{vehicleSpecs:structured}:{automotiveSpecs:structured}),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await products(id).doc(pid).create(product);await ref.set({importUntil:0,importedProductId:pid},{merge:true});return res.json({success:true,product});}catch(e:any){throw Error(e.code===6?'Esta publicação já foi importada. Atualize o catálogo.':e.message);}finally{await db.runTransaction(async tx=>{if((await tx.get(ref)).data()?.importLease===lease)tx.set(ref,{importUntil:0},{merge:true});});}
 }));
}
