const {test}=require('node:test'),assert=require('node:assert/strict');
const {captureVehicleLead,vehicleLeadId,normalizeVehicleSpecs,vehicleAvailable,dealershipReply,dealershipReplyIssue,validateVehicleLeadPatch,registerDealershipRoutes,deliverVehicleNotification}=require('../lib/dealership');
function fakeDb(seed={}){
 const data=new Map(Object.entries(structuredClone(seed)));let sequence=0,queue=Promise.resolve();
 const doc=path=>({path,id:path.split('/').pop(),get:async()=>({exists:data.has(path),data:()=>structuredClone(data.get(path))}),set:async(v,o)=>{if(JSON.stringify(v).includes('undefined'))throw Error('undefined');data.set(path,o?.merge?{...data.get(path),...structuredClone(v)}:structuredClone(v));},update:async v=>data.set(path,{...data.get(path),...structuredClone(v)}),collection:n=>col(path+'/'+n)});
 const col=(path,filters=[],sort=null,max=Infinity)=>({doc:id=>doc(path+'/'+(id||'auto'+(++sequence))),where:(k,op,v)=>col(path,[...filters,[k,v]],sort,max),orderBy:(key,dir='asc')=>col(path,filters,[key,dir],max),limit:n=>col(path,filters,sort,n),get:async()=>{let rows=[...data.entries()].filter(([k,v])=>k.startsWith(path+'/')&&!k.slice(path.length+1).includes('/')&&filters.every(([key,wanted])=>v[key]===wanted));if(sort)rows.sort((a,b)=>String(a[1][sort[0]]||'').localeCompare(String(b[1][sort[0]]||''))*(sort[1]==='desc'?-1:1));return{docs:rows.slice(0,max).map(([k])=>({...doc(k),ref:doc(k),data:()=>structuredClone(data.get(k))}))}}});
 return {data,collection:p=>col(p),runTransaction:fn=>{const result=queue.then(async()=>{const writes=[];const result=await fn({get:r=>r.get(),set:(r,v,o)=>writes.push(()=>r.set(v,o))});for(const w of writes)await w();return result});queue=result.catch(()=>{});return result;}};
}
const root='vehicleWorkspaces/store',contact='ig_123',leadPath=root+'/leads/'+vehicleLeadId(contact),chatPath='establishments/store/chats/'+contact;
const product={id:'civic',name:'Honda Civic EXL',price:119900,available:true,vehicleSpecs:{brand:'Honda',model:'Civic',year:'2021',mileage:48000,status:'available'},imageUrl:'https://cdn.test/civic.jpg',videoUrl:'https://cdn.test/civic.mp4'};
const gateway={model:'gemini-3.1-flash-lite',channel:'instagram'};
function seed(segment='VEHICLES'){return fakeDb({'establishments/store':{segment,name:'Revenda teste'},[chatPath]:{lastInboundAt:new Date().toISOString()},'establishments/store/products/civic':product,'establishments/store/products/sold':{...product,id:'sold',name:'Golf vendido',vehicleSpecs:{status:'sold'}}});}
test('lead capture is isolated to VEHICLES and idempotent by store/contact, not mixed across channels',async()=>{
 for(const segment of ['AUTOMOTIVE_PARTS','FOOD','AFFILIATES','REAL_ESTATE','FASHION','ELECTRONICS','GENERAL']){const db=seed(segment),before=structuredClone([...db.data]);assert.equal(await captureVehicleLead(db,'store',contact,{text:'Oi'}),null);assert.deepEqual([...db.data],before,segment);}
 const db=seed();await captureVehicleLead(db,'store',contact,{name:'Teste',text:'Oi'});await captureVehicleLead(db,'store',contact,{text:'Tem Civic?'});await captureVehicleLead(db,'store','5581999900000',{text:'Oi'});
 assert.equal([...db.data.keys()].filter(k=>k.startsWith(root+'/leads/')).length,2);assert.equal(db.data.get(leadPath).stage,'Novo contato');
});
test('stock states and structured fields reject invalid data',()=>{
 assert.throws(()=>normalizeVehicleSpecs({year:'3028'}));assert.throws(()=>normalizeVehicleSpecs({mileage:-1}));assert.throws(()=>normalizeVehicleSpecs({status:'approved'}));assert.equal(normalizeVehicleSpecs({mileage:'48000'}).mileage,48000);
 for(const status of ['reserved','sold','unavailable'])assert.equal(vehicleAvailable({...product,vehicleSpecs:{status}}),false);assert.equal(vehicleAvailable(product),true);
});
test('both channels capture the first interest, retain commercial context and prepare only registered available media',async()=>{
 for(const contactId of [contact,'5581999900000']){const db=seed();const r=await dealershipReply(db,'store',contactId,'Quero fotos do Civic','Teste',undefined,'event1',gateway,async context=>{assert.equal(context.stock.find(p=>p.id==='sold').available,false);return{reply:'Separei estas fotos do Civic para você.',interestIds:['civic','invented'],updates:{budget:'Até 120 mil',tradeIn:'Gol 2015',stage:'Vendido'},media:{ids:['civic','sold','invented'],type:'all'}}});
  assert.equal(r.mediaList.length,2);assert.ok(r.mediaList.every(m=>m.url.includes('civic')));const lead=db.data.get(root+'/leads/'+vehicleLeadId(contactId));assert.equal(lead.stage,'Qualificação');assert.equal(lead.tradeIn,'Gol 2015');assert.deepEqual(lead.interestIds,['civic']);assert.equal([...db.data.keys()].some(k=>k.startsWith('automotive_projects')),false);
  let calls=0;const repeat=await dealershipReply(db,'store',contactId,'Quero fotos do Civic','Teste',undefined,'event1',gateway,async()=>{calls++;throw Error('must not regenerate')});assert.equal(calls,0);assert.equal(repeat.assistantMessageId,r.assistantMessageId);
 }
});
test('audio reaches the planner, private notes do not, and visit requests never become confirmations',async()=>{
 const db=seed();await captureVehicleLead(db,'store',contact,{text:'Oi'});db.data.get(leadPath).notes='PRIVATE SECRET';const media={mimeType:'audio/mp4',data:'synthetic'};
 await dealershipReply(db,'store',contact,'','Teste',media,'audio1',gateway,async(context,incoming)=>{assert.equal(incoming,media);assert.ok(!JSON.stringify(context).includes('PRIVATE SECRET'));return{reply:'Registrei seu interesse em visitar a loja; a equipe vai conferir o horário.',requestVisit:true,updates:{visitPreference:'Sábado pela manhã'},interestIds:['civic']}});
 assert.equal(db.data.get(leadPath).stage,'Visita solicitada');assert.equal(db.data.get(leadPath).appointmentAt,null);
});
test('AI failures preserve the opportunity; invalid replies and forged finance/booking promises fail safely',async()=>{
 const db=seed();const r=await dealershipReply(db,'store',contact,'Quero financiar','Teste',undefined,'fail',gateway,async()=>{throw Error('provider down')});assert.ok(db.data.has(leadPath));assert.match(r.replyText,/Não consegui/);
 for(const reply of ['Seu crédito está aprovado!','Financiamento aprovado.','Reservei o veículo para você.','Visita confirmada.','Cancelei sua visita.','Remarquei para amanhã.','O Civic custa R$ 90.000,00'])assert.ok(dealershipReplyIssue(reply,[product]),reply);
 const bad=await dealershipReply(db,'store',contact,'Financia?','Teste',undefined,'bad',gateway,async()=>({reply:'Seu financiamento está aprovado!',updates:{stage:'Vendido'}}));assert.doesNotMatch(bad.replyText,/está aprovado/);assert.notEqual(db.data.get(leadPath).stage,'Vendido');
});
test('owner confirmation requires actual future time and lost stage requires a reason',()=>{
 assert.throws(()=>validateVehicleLeadPatch({stage:'Visita confirmada'},{}));assert.throws(()=>validateVehicleLeadPatch({stage:'Visita confirmada',appointmentAt:'2020-01-01T09:00:00Z'},{}));assert.throws(()=>validateVehicleLeadPatch({stage:'Perdido'},{}));assert.throws(()=>validateVehicleLeadPatch({stage:'EM_PREPARO'},{}));
 assert.equal(validateVehicleLeadPatch({stage:'Visita confirmada',appointmentAt:'2099-01-01T12:00:00Z'},{}).stage,'Visita confirmada');
});
test('notification is channel-correct, idempotent and honors human control, window and later changes',async()=>{
 for(const channel of ['instagram','whatsapp']){const db=seed(),id=channel==='instagram'?contact:'5581999900000';await captureVehicleLead(db,'store',id,{text:'Oi'});const key=vehicleLeadId(id),lead=db.data.get(root+'/leads/'+key);Object.assign(lead,{stage:'Visita confirmada',appointmentAt:'2099-01-01T12:00:00Z'});db.data.set('establishments/store/chats/'+id,{lastInboundAt:new Date().toISOString()});db.data.set(root+'/notifications/n',{status:'pending',leadId:key,stage:lead.stage,appointmentAt:lead.appointmentAt,text:'Sua visita está confirmada.'});let calls=0;const send=async(d,s,c,text)=>{calls++;assert.equal(c,id);return{success:true}};await Promise.all([deliverVehicleNotification(db,'store','n',send),deliverVehicleNotification(db,'store','n',send)]);assert.equal(calls,1);}
 for(const reason of ['human','expired','changed','segment']){const db=seed();await captureVehicleLead(db,'store',contact,{});Object.assign(db.data.get(leadPath),{stage:'Visita confirmada',appointmentAt:'2099-01-01T12:00:00Z'});db.data.set(root+'/notifications/n',{status:'pending',leadId:vehicleLeadId(contact),stage:'Visita confirmada',appointmentAt:'2099-01-01T12:00:00Z',text:'Visita confirmada'});if(reason==='human')db.data.get(chatPath).aiPaused=true;if(reason==='expired')db.data.get(chatPath).lastInboundAt='2020-01-01T00:00:00Z';if(reason==='changed')db.data.get(leadPath).stage='Perdido';if(reason==='segment')db.data.get('establishments/store').segment='AUTOMOTIVE_PARTS';await deliverVehicleNotification(db,'store','n',async()=>assert.fail('must not send'));assert.equal(db.data.get(root+'/notifications/n').status,'blocked',reason);}
});
test('revenda routes deny all other segments and never read another owner selected by query',async t=>{
 const admin=require('firebase-admin');if(!admin.apps.length)admin.initializeApp({projectId:'test'});t.mock.method(admin.auth(),'verifyIdToken',async token=>{if(token!=='owner')throw Error('unauthorized');return{uid:'store'}});
 for(const segment of ['AUTOMOTIVE_PARTS','FOOD','VEHICLES']){const db=seed(segment),routes={};registerDealershipRoutes({get:(p,f)=>routes['GET '+p]=f,post:(p,f)=>routes['POST '+p]=f,patch:(p,f)=>routes['PATCH '+p]=f},db);let status=200,body;await routes['GET /api/vehicles/leads']({headers:{authorization:'Bearer owner'},query:{establishmentId:'other'}},{status(v){status=v;return this},json(v){body=v;return this}});assert.equal(status,segment==='VEHICLES'?200:403);if(segment==='VEHICLES')assert.deepEqual(body.leads,[]);}
});
test('simulator executes the same dealership engine while redirecting every write away from live CRM and chats',async()=>{
 const {vehicleSimulationDb}=require('../lib/dealership');const db=seed();const before=structuredClone([...db.data]);const sandbox=vehicleSimulationDb(db,'store','test-session');
 const r=await dealershipReply(sandbox,'store',contact,'Quero fotos do Civic','Teste',undefined,'sim1',gateway,async c=>({reply:'Separei o Civic disponível no estoque.',interestIds:['civic'],updates:{budget:'Até 120 mil'},media:{ids:['civic'],type:'image'}}));assert.equal(r.mediaList.length,1);
 for(const [key,value] of before)assert.deepEqual(db.data.get(key),value,'live data remains unchanged: '+key);
 assert.ok([...db.data.keys()].filter(k=>!new Map(before).has(k)).every(k=>k.startsWith(root+'/simulations/test-session/')));
 assert.throws(()=>sandbox.collection('establishments').doc('other'));assert.throws(()=>sandbox.collection('orders').doc('store'));
 assert.equal(db.data.get(root+'/simulations/test-session/leads/'+vehicleLeadId(contact)).stage,'Qualificação');
});
test('owner patch rejects stale versions and queues one scoped channel notification',async t=>{
 const admin=require('firebase-admin');if(!admin.apps.length)admin.initializeApp({projectId:'test'});t.mock.method(admin.auth(),'verifyIdToken',async()=>({uid:'store'}));const db=seed();await captureVehicleLead(db,'store',contact,{text:'Visita?'});const routes={};registerDealershipRoutes({get:(p,f)=>routes['GET '+p]=f,post:(p,f)=>routes['POST '+p]=f,patch:(p,f)=>routes['PATCH '+p]=f},db);
 const run=async body=>{let status=200,result;await routes['PATCH /api/vehicles/leads/:id']({headers:{authorization:'Bearer owner'},params:{id:vehicleLeadId(contact)},body},{status(v){status=v;return this},json(v){result=v;return this}});return{status,result}};
 assert.equal((await run({version:0,stage:'Vendido'})).status,409);assert.equal((await run({version:1,stage:'Visita confirmada'})).status,400);
 const result=await run({version:1,stage:'Visita confirmada',appointmentAt:'2099-01-01T12:00:00Z'});assert.equal(result.status,200);assert.equal(db.data.get(leadPath).stage,'Visita confirmada');assert.equal([...db.data.keys()].filter(k=>k.startsWith(root+'/notifications/')).length,1);
 assert.equal((await run({version:1,stage:'Vendido'})).status,409);
});
test('sold vehicles cannot be offered as available and status answers read the real opportunity without model calls',async()=>{
 assert.equal(dealershipReplyIssue('O Golf vendido está disponível.',[{...product,name:'Golf vendido',vehicleSpecs:{status:'sold'}}]),'unavailable_vehicle');
 assert.equal(dealershipReplyIssue('O Golf está disponível.',[{...product,name:'Golf',vehicleSpecs:{status:'sold'}}]),'unavailable_vehicle');
 const db=seed();await captureVehicleLead(db,'store',contact,{});db.data.get(leadPath).stage='Visita solicitada';
 const out=await dealershipReply(db,'store',contact,'Qual é a situação do meu atendimento?','Teste',undefined,'status',gateway,async()=>assert.fail('status must not depend on model'));
 assert.match(out.replyText,/visita solicitada/);assert.match(out.replyText,/a equipe ainda precisa confirmar/);
 const notRequested=await dealershipReply(db,'store',contact,'Continuo interessado no Civic','Teste',undefined,'no-repeat',gateway,async()=>({reply:'Entendido, continuamos com o Civic.',interestIds:['civic'],media:{ids:['civic'],type:'all'}}));assert.equal(notRequested.mediaList.length,0);
});
test('gallery sends remaining registered photos and never counts failed or pending sends as delivered',async()=>{
 const db=seed();const photos=Array.from({length:13},(_,i)=>`https://cdn.test/photo${i}.jpg`);
 db.data.set('establishments/store/products/civic',{...product,imageUrl:photos[0],images:photos});
 db.data.set(chatPath+'/messages/older',{sender:'assistant',timestamp:'2026-01-01',deliveryStatus:'sent',media:photos.slice(0,2).map(url=>({url,type:'image'}))});
 const draft=async()=>({reply:'Já enviei todas',interestIds:['civic'],media:{ids:['civic'],type:'image'}});
 const first=await dealershipReply(db,'store',contact,'Tem mais fotos?',undefined,undefined,'gallery1',gateway,draft);
 assert.equal(first.mediaList.length,10);assert.equal(first.mediaList[0].url,photos[2]);assert.match(first.replyText,/mais 1 dispon/);
 const pending=db.data.get(chatPath+'/messages/'+first.assistantMessageId);pending.deliveryStatus='sent';db.data.set(chatPath+'/messages/'+first.assistantMessageId,pending);
 const next=await dealershipReply(db,'store',contact,'Manda as fotos restantes',undefined,undefined,'gallery2',gateway,draft);
 assert.deepEqual(next.mediaList.map(m=>m.url),[photos[12]]);
 db.data.get(chatPath+'/messages/'+next.assistantMessageId).deliveryStatus='failed';
 const retry=await dealershipReply(db,'store',contact,'Tem mais fotos?',undefined,undefined,'gallery3',gateway,draft);
 assert.deepEqual(retry.mediaList.map(m=>m.url),[photos[12]]);
 db.data.get(chatPath+'/messages/'+retry.assistantMessageId).deliveryStatus='sent';
 const done=await dealershipReply(db,'store',contact,'Tem mais fotos?',undefined,undefined,'gallery4',gateway,draft);
 assert.equal(done.mediaList.length,0);assert.match(done.replyText,/Já compartilhei/);
});

test('only these photos resolves the current vehicle even if the planner omits media IDs',async()=>{
 const db=seed();await captureVehicleLead(db,'store',contact,{productId:'civic'});
 const result=await dealershipReply(db,'store',contact,'Só tem essas fotos?',undefined,undefined,'more-short',gateway,async()=>({reply:'Todas foram compartilhadas'}));
 assert.equal(result.mediaList.length,1);assert.match(result.replyText,/Separei/);
});
test('photo analysis authenticates and denies every non-vehicle segment before accessing images',async t=>{
 const admin=require('firebase-admin');if(!admin.apps.length)admin.initializeApp({projectId:'test'});
 t.mock.method(admin.auth(),'verifyIdToken',async token=>{if(token==='owner')return {uid:'store'};throw Error('invalid');});
 for(const segment of ['AUTOMOTIVE_PARTS','FOOD','AFFILIATES','REAL_ESTATE','GENERAL']){
  const db=seed(segment),before=structuredClone([...db.data]),routes={};registerDealershipRoutes({get:(p,f)=>routes['GET '+p]=f,post:(p,f)=>routes['POST '+p]=f,patch:(p,f)=>routes['PATCH '+p]=f},db);
  let status;const res={status(v){status=v;return this},json(){return this}};
  await routes['POST /api/vehicles/analyze-photos']({headers:{authorization:'Bearer owner'},body:{images:['https://example.test/photo.jpg']}},res);assert.equal(status,403);assert.deepEqual([...db.data],before);
  await routes['POST /api/vehicles/analyze-photos']({headers:{},body:{}},res);assert.equal(status,401);
 }
});
test('natural acceptance and non-receipt prepare real photos for the vehicle in context',async()=>{
 for(const answer of ['Gostaria sim','Sim, por favor','Quero sim','Claro','Pode ser','Não chegou','Não recebi']){
  const db=seed();db.data.set('establishments/store/products/hb20',{...product,id:'hb20',name:'Hyundai HB20',imageUrl:'https://cdn.test/hb20.jpg'});
  await captureVehicleLead(db,'store',contact,{productId:'civic'});
  db.data.set(chatPath+'/messages/offer',{sender:'assistant',timestamp:'2026-01-01',text:'O Hyundai HB20 está por R$ 55.000. Temos fotos dele, gostaria de vê-las?',deliveryStatus:'sent',media:[]});
  const out=await dealershipReply(db,'store',contact,answer,undefined,undefined,answer,gateway,async()=>({reply:'Separamos as referências do Hyundai HB20 para você.',media:{ids:['hb20'],type:'image'}}));
  assert.deepEqual(out.mediaList.map(m=>m.url),['https://cdn.test/hb20.jpg'],answer);assert.match(out.replyText,/(?:Separei|Vou reenviar) 1/);
 }
 const db=seed();await captureVehicleLead(db,'store',contact,{productId:'civic'});
 db.data.set(chatPath+'/messages/sent',{sender:'assistant',timestamp:'2026-01-01',text:'Separei as fotos do Honda Civic EXL.',media:[{url:product.imageUrl,type:'image'}],deliveryStatus:'sent'});
 const retry=await dealershipReply(db,'store',contact,'Não chegou',undefined,undefined,'retry-context',gateway,async()=>({reply:'Separei novamente as referências para você.'}));
 assert.equal(retry.mediaList.length,1);assert.equal(retry.mediaList[0].url,product.imageUrl);
});
test('acceptance of a non-media question does not send gallery',async()=>{
 const db=seed();db.data.set(chatPath+'/messages/offer',{sender:'assistant',timestamp:'2026-01-01',text:'Você quer visitar a loja?',deliveryStatus:'sent'});
 const out=await dealershipReply(db,'store',contact,'Gostaria sim',undefined,undefined,'no-media',gateway,async()=>({reply:'Vamos registrar a visita.',media:{ids:['civic'],type:'image'}}));assert.equal(out.mediaList.length,0);
});

test('a refusal of photos cannot trigger gallery fallback',async()=>{
 const db=seed();await captureVehicleLead(db,'store',contact,{productId:'civic'});
 db.data.set(chatPath+'/messages/offer',{sender:'assistant',text:'Temos fotos do Honda Civic EXL, gostaria de ver?',timestamp:'2026-01-01'});
 const out=await dealershipReply(db,'store',contact,'Não quero fotos',undefined,undefined,'no-photos',gateway,async()=>({reply:'Certo, seguimos por texto.',media:{ids:['civic'],type:'image'}}));assert.equal(out.mediaList.length,0);
});

test('where are the photos resends; named Ferrari overrides previous HB20 even without the word photos',async()=>{
 const db=seed();const ferrari={...product,id:'ferrari',name:'Ferrari LaFerrari — Unidade Exclusiva Brasil',category:'Ferrari',imageUrl:'https://cdn.test/ferrari.jpg',vehicleSpecs:{brand:'Ferrari',model:'LaFerrari',status:'available'}};
 db.data.set('establishments/store/products/ferrari',ferrari);db.data.set(chatPath,{vehicleMediaContext:{ids:['civic'],type:'image'}});
 db.data.set(chatPath+'/messages/previous',{sender:'assistant',text:'Aqui estão as fotos do Honda Civic EXL.',timestamp:'2026-01-01',media:[{url:product.imageUrl},{url:ferrari.imageUrl}],deliveryStatus:'sent'});
 const missing=await dealershipReply(db,'store',contact,'Cadê as fotos?',undefined,undefined,'where-photos',gateway,async()=>({reply:'Já enviei todas',media:{ids:['civic'],type:'image'}}));assert.equal(missing.mediaList[0].url,product.imageUrl);assert.match(missing.replyText,/reenviar/);
 const again=await dealershipReply(db,'store',contact,'Gostaria que enviasse novamente da ferrari',undefined,undefined,'ferrari-again',gateway,async()=>({reply:'Separei as referências',media:{ids:['civic'],type:'image'}}));
 assert.deepEqual(again.mediaList.map(m=>m.url),[ferrari.imageUrl]);assert.doesNotMatch(again.replyText,/qual veículo/i);assert.deepEqual(db.data.get(chatPath).vehicleMediaContext.ids,['ferrari']);
});
test('semantic media intent works without exact phrases and respects explicit refusal',async()=>{
 const db=seed();db.data.set(chatPath,{vehicleMediaContext:{ids:['civic'],type:'image'}});
 const out=await dealershipReply(db,'store',contact,'Queria aquelas outra vez',undefined,undefined,'semantic-media',gateway,async context=>{assert.deepEqual(context.mediaContext.ids,['civic']);return {reply:'Vamos lá',media:{intent:'resend',ids:[],type:'image'}}});assert.equal(out.mediaList.length,1);
 const refusal=await dealershipReply(db,'store',contact,'Não quero fotos',undefined,undefined,'semantic-refusal',gateway,async()=>({reply:'Seguimos por texto',media:{intent:'send',ids:['civic'],type:'image'}}));assert.equal(refusal.mediaList.length,0);
});
test('DM receives original post beyond recent history and current catalogue prevails over the old caption',async()=>{
 const db=seed();db.data.set('instagramConnections/store',{accountId:'456'});db.data.set(chatPath,{instagramAcquisition:{kind:'instagram_comment',accountId:'456',mediaId:'987654',caption:'Honda Civic EXL por R$ 100.000',comment:'Quanto custa esse carro?',summary:'Anúncio de showroom',capturedAt:'2026-01-01'}});
 for(let i=0;i<20;i++)db.data.set(chatPath+'/messages/history'+i,{sender:i%2?'user':'assistant',text:'Conversa posterior',timestamp:'2026-02-'+String(i+1).padStart(2,'0')});
 const out=await dealershipReply(db,'store',contact,'Queria fotos do carro do anúncio',undefined,undefined,'post-origin',gateway,async c=>{assert.equal(c.originPost.comment,'Quanto custa esse carro?');assert.equal(c.originPost.caption,'Honda Civic EXL por R$ 100.000');assert.equal(c.originPost.currentCatalog[0].price,119900);assert.equal(c.originPost.match,'unique_caption');assert.equal(c.originPost.visualAnalysis,'not_performed');return {reply:'Separei as fotos',media:{intent:'send',ids:[],type:'image'}};});assert.equal(out.mediaList[0].url,product.imageUrl);
 db.data.set('instagramConnections/store',{accountId:'other'});
 await dealershipReply(db,'store',contact,'Esse carro',undefined,undefined,'switched-account',gateway,async c=>{assert.equal(c.originPost,null);return {reply:'Qual veículo chamou sua atenção?'}});
});

test('origin post does not turn a price question into unsolicited photos even if planner requests media',async()=>{
 const db=seed();db.data.set(chatPath,{vehicleMediaContext:{ids:['civic'],type:'image'}});
 const out=await dealershipReply(db,'store',contact,'Quanto está esse carro do anúncio?',undefined,undefined,'price-not-media',gateway,async()=>({reply:'O Honda Civic EXL está por R$ 119.900.',media:{intent:'send',ids:['civic'],type:'image'}}));
 assert.equal(out.mediaList.length,0);assert.match(out.replyText,/119.900/);
});
