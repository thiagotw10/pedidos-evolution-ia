import {Express,Request,Response} from 'express';
import * as admin from 'firebase-admin';
import {BR_CITIES} from './leadGeoData';
import {safeLeadLocation,postalLeadLocation,resolveLeadLocation,geoCountries,geoStates,geoNormalize} from './instagramLeadGeo';
import {acquisitionRef} from './instagramAcquisition';
const clean=(v:any,n=200)=>String(v||'').trim().slice(0,n);
export const reachStage=(status:string)=>['Aprovado','Em execução','Pronto para retirada','Enviado','Concluído'].includes(status)?'won':status==='Cancelado'?'lost':status==='Orçamento enviado'?'quote':['Qualificação','Análise técnica'].includes(status)?'qualified':'new';
const validTime=(value:any)=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:null;
function sourceDto(value:any){return value?{kind:clean(value.kind,40),mediaId:/^\d+$/.test(value.mediaId||'')?String(value.mediaId):'',adId:/^\d+$/.test(value.adId||'')?String(value.adId):'',title:clean(value.campaignName||value.caption||'Publicação Instagram',180),capturedAt:validTime(value.capturedAt),paidDeclared:value.paidDeclaredByOwner===true}:null;}
export function reachRows(chats:any[],projects:any[],accountId:string,events:any[]=[]){
 return chats.filter(c=>c.instagramAccountId===accountId&&/^(ig_|instagram_)\d+$/.test(c.id)).flatMap(c=>{
  const recovered=events.filter(e=>e.contactId===c.id&&e.source?.accountId===accountId&&['sending','sent','failed','delivery_unknown'].includes(e.status)).sort((a,b)=>String(a.source.capturedAt||'').localeCompare(String(b.source.capturedAt||'')))[0]?.source;
  const first=[c.firstInstagramAcquisition,c.instagramAcquisition,recovered].find(s=>s&&(!s.accountId||s.accountId===accountId));
  const source=first&&(!first.accountId||first.accountId===accountId)?sourceDto(first):null;
  if(!source&&!c.lastInboundAt&&!c.firstInstagramInboundAt)return [];
  const own=projects.filter(p=>p.phone===c.id&&p.channel==='instagram');
  const p=own.find(p=>p.id===c.projectId)||own.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0];
  const shipping=postalLeadLocation(c.shippingAddress)||postalLeadLocation(p?.shippingAddress);
  const location=safeLeadLocation(c.leadLocation)||shipping;
  const stage=reachStage(p?.status||'');
  return [{id:c.id,name:clean(c.customerName||'Cliente Instagram',100),source:source||{kind:'instagram_direct',mediaId:'',adId:'',title:'Direct sem publicação identificada',capturedAt:null,paidDeclared:false},firstAt:source?.capturedAt||validTime(c.firstInstagramInboundAt)||validTime(c.createdAt)||null,lastAt:validTime(c.lastInboundAt)||validTime(c.lastTimestamp)||source?.capturedAt||null,location,locationVersion:clean(c.leadLocation?.updatedAt,100),stage,stageLabel:p?.status||'Novo contato',projectId:p?.id||null,quoteValue:p&&Number.isFinite(Number(p.quoteValue))?Number(p.quoteValue):null,currency:/^[A-Z]{3}$/.test(p?.currency||'')?p.currency:'BRL',aiPaused:c.aiPaused===true,unread:c.unreadByHuman===true}];
 });
}
export function registerInstagramReach(app:Express,db:admin.firestore.Firestore){
 const owned=(fn:(req:Request,res:Response,id:string)=>Promise<any>)=>async(req:Request,res:Response)=>{
  let uid:string;try{uid=(await admin.auth().verifyIdToken((req.headers.authorization||'').replace(/^Bearer /,''))).uid;}catch{return res.status(401).json({error:'Entre novamente na plataforma.'});}
  const id=String(req.query.establishmentId||'');if(uid!==id||!id)return res.status(403).json({error:'Acesso restrito à sua empresa.'});
  try{res.set('Cache-Control','no-store');return await fn(req,res,id);}catch(e:any){return res.status(400).json({error:typeof e.code==='number'?'Não foi possível consultar as origens agora. Tente novamente.':e.message||'Não foi possível concluir.'});}
 };
 app.get('/api/instagram/reach',owned(async(_req,res,id)=>{
  const c=(await db.collection('instagramConnections').doc(id).get()).data();if(!c?.connected)return res.json({connected:false,leads:[],media:[]});
  const [chats,projects,snapshot,config,events]=await Promise.all([db.collection('establishments').doc(id).collection('chats').where('instagramAccountId','==',c.accountId).limit(1001).get(),db.collection('automotive_projects').where('establishmentId','==',id).limit(2001).get(),db.collection('instagramWorkspaces').doc(id).get(),acquisitionRef(db,id).get(),db.collection('automotiveOperations').doc(id).collection('instagramLeads').where('source.accountId','==',c.accountId).limit(1001).get()]);
  const saved=snapshot.data(),cfg=config.data(),analytics=saved?.accountId===c.accountId?saved.analytics:null;
  const leads=reachRows(chats.docs.slice(0,1000).map(d=>({...d.data(),id:d.id})),projects.docs.slice(0,2000).map(d=>({...d.data(),id:d.id})),c.accountId,events.docs.slice(0,1000).map(d=>d.data()));
  const media=new Map<string,any>();
  for(const m of analytics?.media||[])media.set(String(m.id),{id:String(m.id),title:clean(m.caption||'Publicação sem legenda',180),thumbnail:/^https:\/\//.test(m.thumbnail||'')?m.thumbnail:'',metrics:m.metrics||{},permalink:/^https:\/\/(www\.)?instagram\.com\//.test(m.permalink||'')?m.permalink:''});
  if(cfg?.accountId===c.accountId)for(const m of cfg.campaigns||[])if(!media.has(m.mediaId))media.set(m.mediaId,{id:m.mediaId,title:clean(m.title||m.campaignName||'Publicação vinculada',180),metrics:{}});
  for(const lead of leads)if(lead.source.mediaId&&!media.has(lead.source.mediaId))media.set(lead.source.mediaId,{id:lead.source.mediaId,title:lead.source.title,metrics:{}});
  const live=(await db.collection('instagramConnections').doc(id).get()).data();if(!live?.connected||live.accountId!==c.accountId)throw Error('A conexão mudou. Atualize a tela antes de consultar as origens.');
  return res.json({connected:true,accountId:c.accountId,username:c.username||'',updatedAt:new Date().toISOString(),metricsUpdatedAt:analytics?.syncedAt||null,leads,media:[...media.values()],countries:geoCountries.map(c=>({code:c.code,name:c.name})),states:geoStates,limited:chats.docs.length>1000||projects.docs.length>2000||events.docs.length>1000,limits:{chats:1000,projects:2000}});
 }));
 app.get('/api/instagram/reach/cities',owned(async(req,res,_id)=>{
  const state=String(req.query.state||''),q=geoNormalize(req.query.q||'');if(!geoStates.some(s=>s.code===state)||q.length<2)return res.json({cities:[]});
  return res.json({cities:BR_CITIES.filter(c=>c[2]===state&&geoNormalize(c[1]).includes(q)).slice(0,30).map(c=>({id:c[0],name:c[1],state:c[2]}))});
 }));
 app.post('/api/instagram/reach/:contactId/location',owned(async(req,res,id)=>{
  const contact=String(req.params.contactId);if(!/^(ig_|instagram_)\d{1,40}$/.test(contact))throw Error('Contato inválido.');
  if(req.body.confirmed!==true)throw Error('Confirme que essa localização foi informada pelo cliente.');
  const value=resolveLeadLocation(req.body,'owner_confirmed'),ref=db.collection('establishments').doc(id).collection('chats').doc(contact);
  await db.runTransaction(async tx=>{const c=(await tx.get(db.collection('instagramConnections').doc(id))).data(),chat=(await tx.get(ref)).data();if(!c?.connected||!chat||chat.instagramAccountId!==c.accountId)throw Error('O contato não pertence ao Instagram conectado.');if(String(chat.leadLocation?.updatedAt||'')!==String(req.body.expectedUpdatedAt||''))throw Error('A localização mudou. Atualize a tela antes de confirmar.');tx.set(ref,{leadLocation:value},{merge:true});});
  return res.json({location:value});
 }));
}
