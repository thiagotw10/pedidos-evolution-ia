const {test}=require('node:test');
const assert=require('node:assert/strict');
const {syncInboxMessage,isHumanControlled,setInboxControl,registerInboxRoutes}=require('../lib/inbox');
function fakeDb(seed={}) {
 const data=new Map(Object.entries(seed));let n=0;
 const doc=path=>({id:path.split('/').pop(),path,get:async()=>({exists:data.has(path),data:()=>data.get(path)}),set:async(v,o)=>data.set(path,o?.merge?{...data.get(path),...v}:v),update:async v=>data.set(path,{...data.get(path),...v}),collection:name=>col(`${path}/${name}`)});
 const col=(path,filters=[])=>({
   doc:id=>doc(`${path}/${id||`auto${++n}`}`),
   where:(key,op,v)=>col(path,[...filters,[key,v]]),
   get:async()=>({docs:[...data].filter(([k,v])=>k.startsWith(path+'/')&&!k.slice(path.length+1).includes('/')&&filters.every(([key,wanted])=>v[key]===wanted)).map(([k,v])=>({ref:doc(k),id:k.split('/').pop(),data:()=>v}))})
 });
 return {data,collection:col,runTransaction:async cb=>cb({get:ref=>ref.get(),set:(ref,v,o)=>ref.set(v,o),update:(ref,v)=>ref.update(v)})};
}
const base='establishments/store/chats/';
test('incoming WhatsApp and Instagram notify once each even during human takeover; bot replies never notify',async()=>{
 const db=fakeDb();const notifications=[];
 for(const id of ['ig_123','5581999999999']) {
  db.data.set(base+id,{customerName:'Cliente',aiPaused:true});
  db.data.set(base+id+'/messages/in',{sender:'user',text:'Qual o prazo?',timestamp:new Date().toISOString()});
  for(let i=0;i<2;i++)await syncInboxMessage(db,'store',id,'in',async(s,p)=>notifications.push(p));
  db.data.set(base+id+'/messages/out',{sender:'assistant',text:'Oi',timestamp:new Date().toISOString()});
  await syncInboxMessage(db,'store',id,'out',async(s,p)=>notifications.push(p));
  assert.equal(db.data.get(base+id).unreadByHuman,true);assert.equal(db.data.get(base+id).aiPaused,true);
 }
 assert.equal(notifications.length,2);assert.match(notifications[0].url,/tab=inbox&chat=ig_123/);assert.match(notifications[1].title,/WhatsApp/);
});
test('late triggers preserve latest preview and read cursor; offline history never pushes',async()=>{
 const db=fakeDb({[base+'ig_123']:{lastMessage:'Resposta recente',lastMessageAt:'2026-10-27T23:10:00.000Z',humanReadAt:'2026-10-27T23:00:00.000Z'}});
 db.data.set(base+'ig_123/messages/old',{sender:'user',text:'antiga',timestamp:'2026-10-27T22:00:00.000Z',isOfflineCatchup:true});
 await syncInboxMessage(db,'store','ig_123','old',async()=>assert.fail('old messages must not push'));
 assert.equal(db.data.get(base+'ig_123').lastMessage,'Resposta recente');assert.equal(db.data.get(base+'ig_123').unreadByHuman,false);
});
test('taking over is indefinite, syncs CRM, resume explicitly releases only the selected channel',async()=>{
 const db=fakeDb({[base+'ig_123']:{aiPaused:false},[base+'5581999999999']:{aiPaused:false},'automotive_projects/p':{establishmentId:'store',phone:'ig_123'}});
 await setInboxControl(db,'store','ig_123',true);
 assert.equal(db.data.get(base+'ig_123').aiPausedUntil,null);assert.equal(db.data.get('automotive_projects/p').aiPaused,true);assert.equal(db.data.get(base+'5581999999999').aiPaused,false);
 const pausedAt=db.data.get(base+'ig_123').aiPausedAt;
 await setInboxControl(db,'store','ig_123',false);
 assert.equal(isHumanControlled(db.data.get(base+'ig_123')),false);
 assert.equal(isHumanControlled(db.data.get(base+'ig_123'),'2000-01-01T00:00:00.000Z'),true);
 assert.equal(db.data.get(base+'ig_123').aiPausedAt,pausedAt);
});
const response=uid=>({locals:{inboxUid:uid},code:200,status(c){this.code=c;return this},json(v){this.body=v;return this}});
function routes(db){const r={};registerInboxRoutes({use:(p,f)=>r.auth=f,post:(p,f)=>r.action=f},db);return r;}
test('inbox requires authentication and scopes every action to authenticated store',async()=>{
 const db=fakeDb({[base+'ig_123']:{}}),r=routes(db);let res=response();
 await r.auth({headers:{}},res,()=>assert.fail('unauthenticated'));assert.equal(res.code,401);
 res=response('other');await r.action({params:{chatId:'ig_123',action:'pause'},body:{establishmentId:'store'}},res);assert.equal(res.code,404);assert.equal(db.data.get(base+'ig_123').aiPaused,undefined);
});
test('manual send pauses before Meta call and records confirmed delivery',async t=>{
 const db=fakeDb({[base+'ig_123']:{instagramSenderId:'123',instagramAccountId:'456',lastInboundAt:new Date().toISOString()},'instagramConnections/store':{connected:true,accountId:'456',accessToken:'private'}});
 t.mock.method(global,'fetch',async()=>{assert.equal(db.data.get(base+'ig_123').aiPaused,true);assert.equal(db.data.get(base+'ig_123').aiPausedUntil,null);return new Response(JSON.stringify({message_id:'sent'}));});
 const r=routes(db),res=response('store');await r.action({params:{chatId:'ig_123',action:'send'},body:{text:'Vamos conferir seu orçamento.'}},res);
 assert.equal(res.code,200);assert.equal(db.data.get(base+'ig_123/messages/'+res.body.messageId).deliveryStatus,'sent');
});
test('expired Instagram window reports failure; does not pretend delivery or resume AI',async()=>{
 const db=fakeDb({[base+'ig_123']:{instagramSenderId:'123',instagramAccountId:'456',lastInboundAt:'2000-01-01T00:00:00.000Z'},'instagramConnections/store':{connected:true,accountId:'456',accessToken:'private'}});
 const r=routes(db),res=response('store');await r.action({params:{chatId:'ig_123',action:'send'},body:{text:'Oi'}},res);
 assert.equal(res.code,502);assert.equal(db.data.get(base+'ig_123/messages/auto1').deliveryStatus,'failed');assert.equal(db.data.get(base+'ig_123').aiPaused,true);
});
test('read receipt cannot clear messages newer than rendered history',async()=>{
 const db=fakeDb({[base+'ig_123']:{lastInboundAt:new Date().toISOString()}});const r=routes(db),res=response('store');
 await r.action({params:{chatId:'ig_123',action:'read'},body:{readAt:'2000-01-01T00:00:00.000Z'}},res);
 assert.equal(db.data.get(base+'ig_123').unreadByHuman,true);
});

test('WhatsApp manual reply also pauses before provider request and persists sent history',async t=>{
 const id='5581999999999';const db=fakeDb({[base+id]:{},'establishments/store':{evolutionApiUrl:'https://evolution.example',evolutionInstanceName:'instance'}});
 t.mock.method(global,'fetch',async()=>{assert.equal(db.data.get(base+id).aiPaused,true);return new Response(JSON.stringify({key:{id:'sent'}}));});
 const r=routes(db),res=response('store');await r.action({params:{chatId:id,action:'send'},body:{text:'Sua avaliação está registrada.'}},res);
 assert.equal(res.code,200);assert.equal(db.data.get(base+id+'/messages/'+res.body.messageId).deliveryStatus,'sent');
});

test('opening a conversation reuses the existing CRM record and creates one only for a new contact',async()=>{
 const db=fakeDb({[base+'ig_123']:{customerName:'Teste',aiPaused:true},'automotive_projects/existing':{establishmentId:'store',phone:'ig_123',customerName:'Teste'}});const r=routes(db);let response=responseFor('store');
 function responseFor(uid){return {locals:{inboxUid:uid},code:200,status(n){this.code=n;return this},json(body){this.body=body;return this}};}
 await r.action({params:{chatId:'ig_123',action:'project'},body:{}},response);assert.equal(response.body.project.id,'existing');
 db.data.set(base+'ig_456',{customerName:'Novo',aiPaused:true});response=responseFor('store');
 await r.action({params:{chatId:'ig_456',action:'project'},body:{}},response);const id=response.body.project.id;
 assert.equal(response.body.project.phone,'ig_456');assert.equal(response.body.project.aiPaused,true);assert.equal(response.body.project.source,'instagram_ai');
 response=responseFor('store');await r.action({params:{chatId:'ig_456',action:'project'},body:{}},response);assert.equal(response.body.project.id,id);
});
