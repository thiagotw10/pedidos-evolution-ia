const {test}=require('node:test');const assert=require('node:assert/strict');const admin=require('firebase-admin');
const {lookupPostalAddress}=require('../lib/postalAddress');
const {emptyGarage,garageSlots,kitFits,localGarageDay,reserveGarage,transitionGarageBooking,validateGarageConfig,registerGarageRoutes}=require('../lib/garage');
const {resolveAutomotiveOperations,operationDay}=require('../lib/automotiveOperations');
function fakeDb(seed={}) {
 const data=new Map(Object.entries(structuredClone(seed)));let n=0,queue=Promise.resolve();
 const doc=path=>({path,id:path.split('/').pop(),get:async()=>({exists:data.has(path),data:()=>structuredClone(data.get(path))}),set:async(v,o)=>data.set(path,o?.merge?{...data.get(path),...structuredClone(v)}:structuredClone(v)),collection:name=>({doc:id=>doc(`${path}/${name}/${id||`auto${++n}`}`)})});
 const db={data,collection:path=>({doc:id=>doc(`${path}/${id||`auto${++n}`}`)}),runTransaction:fn=>{const run=queue.then(async()=>{const writes=[];const result=await fn({get:r=>r.get(),set:(r,v,o)=>writes.push(()=>r.set(v,o))});for(const write of writes)await write();return result;});queue=run.catch(()=>{});return run;}};return db;
}
const day=localGarageDay(new Date(Date.now()+86400000));
const config={enabled:true,autoConfirm:true,open:'09:00',close:'18:00',weekdays:[0,1,2,3,4,5,6],bufferMinutes:30,leadMinutes:0,horizonDays:30};
const vehicle={brand:'Volkswagen',model:'Jetta GLI',year:'2023',version:'GLI',customerName:'Pedro Silva',projectId:'project'};
const kit={id:'kit',name:'Kit GLI',brand:'Volkswagen',model:'Jetta GLI',version:'GLI',yearFrom:'2021',yearTo:'2025',onHand:2,reserved:0,durationMinutes:90,autoBook:true,enabled:true};
const root='automotiveOperations/store';
function seed(){return fakeDb({[root]:{...emptyGarage(),config,bays:[{id:'box1',name:'Box 1',enabled:true},{id:'box2',name:'Box 2',enabled:true}],kits:[kit]},'establishments/store':{segment:'AUTOMOTIVE_PARTS'},'establishments/store/chats/ig_123':{activeAutomotiveProfile:'legacy'},'automotive_projects/project':{establishmentId:'store'}});}
const offer=(state,id='booking')=>({...garageSlots(state,[],state.kits[0],day)[0],id,profile:'legacy',expiresAt:Date.now()+60000});
const contact={chatId:'ig_123',name:'Pedro',phone:'5581999999999',vehicle};
const mockPostal=async()=>({cep:'01001000',street:'Praça da Sé',district:'Sé',city:'São Paulo',state:'SP',source:'ViaCEP',lookedUpAt:new Date().toISOString(),confirmed:false});

test('CEP lookup validates input, detects missing addresses and cannot invent success on errors',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return new Response(JSON.stringify({cep:'01001-000',logradouro:'Praça da Sé',bairro:'Sé',localidade:'São Paulo',uf:'SP'}));};
 const result=await lookupPostalAddress('01001-000',fetcher);assert.equal(result.city,'São Paulo');assert.equal(result.confirmed,false);
 await assert.rejects(lookupPostalAddress('0100x000',fetcher),/8 dígitos/);assert.equal(calls,1);
 await assert.rejects(lookupPostalAddress('99999999',async()=>new Response('{"erro":true}')),/não foi encontrado/);
 await assert.rejects(lookupPostalAddress('01001000',async()=>{throw new Error('offline')}),/consultar o CEP agora/);
 await assert.rejects(lookupPostalAddress('01001000',async()=>new Response('{"cep":"99999999","localidade":"Inventada","uf":"SP"}')),/consultar o CEP agora/);
});
test('shipping confirms real CEP then collects number/complement/contact and requires full confirmation',async()=>{
 const db=seed();const run=text=>resolveAutomotiveOperations(db,'store','ig_123','legacy',vehicle,text,mockPostal);
 assert.match((await run('CEP 01001000 para entrega')).replyText,/Praça da Sé/);
 assert.match((await run('sim')).replyText,/número do endereço/);
 assert.match((await run('25')).replyText,/complemento/);
 assert.match((await run('sem complemento')).replyText,/telefone/);
 assert.match((await run('81999999999')).replyText,/Está tudo correto/);
 assert.equal(db.data.get('automotive_projects/project').shippingAddress,undefined);
 assert.match((await run('sim')).replyText,/Endereço de entrega confirmado/);
 const address=db.data.get('automotive_projects/project').shippingAddress;assert.equal(address.number,'25');assert.equal(address.phone,'81999999999');assert.equal(address.confirmed,true);assert.equal(address.recipient,'Pedro Silva');
});
test('citywide CEP asks street and WhatsApp uses known phone; unrelated media request is not consumed by address form',async()=>{
 const db=seed();const run=text=>resolveAutomotiveOperations(db,'store','5581999999999','legacy',{...vehicle,customerName:''},text,async()=>({...await mockPostal(),street:''}));
 await run('01001000');assert.match((await run('sim')).replyText,/nome da rua/);
 await run('Rua das Flores');assert.equal(await run('manda fotos'),null);
 await run('sem número');await run('apto 4');assert.match((await run('Ana Silva')).replyText,/Está tudo correto/);
 await run('sim');assert.equal(db.data.get('establishments/store/chats/5581999999999').shippingAddress.phone,'5581999999999');
});
test('slots respect working days, duration/buffer, blocked bays and vehicle application',()=>{
 const state={...emptyGarage(),config,bays:[{id:'box1',enabled:true,name:'Box 1'}],kits:[kit]};
 const slots=garageSlots(state,[],kit,day);assert.ok(slots.length>0);assert.equal((Date.parse(slots[0].endAt)-Date.parse(slots[0].startAt))/60000,120);
 assert.equal(garageSlots({...state,bays:[{...state.bays[0],enabled:false}]},[],kit,day).length,0);
 assert.equal(garageSlots({...state,config:{...config,weekdays:[]}},[],kit,day).length,0);
 assert.equal(kitFits(kit,vehicle),true);assert.equal(kitFits(kit,{...vehicle,year:'2019'}),false);assert.equal(kitFits(kit,{...vehicle,version:'Outra'}),false);
 assert.throws(()=>validateGarageConfig({...config,close:'08:00'}));assert.throws(()=>validateGarageConfig({...config,weekdays:[8]}));
});
test('simultaneous reservations cannot double-book the same box and retries do not consume twice',async()=>{
 const db=seed(),state=db.data.get(root),first=offer(state),second={...first,id:'second'};
 const result=await Promise.allSettled([reserveGarage(db,'store',first,contact,'ai'),reserveGarage(db,'store',second,contact,'ai')]);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(db.data.get(root).kits[0].reserved,1);
 const repeated=await reserveGarage(db,'store',first,contact,'ai');assert.equal(repeated.id,'booking');assert.equal(db.data.get(root).kits[0].reserved,1);
});
test('last available kit cannot be promised in two boxes or on different days',async()=>{
 const db=seed();db.data.get(root).kits[0].onHand=1;const first=offer(db.data.get(root));await reserveGarage(db,'store',first,contact,'ai');
 await assert.rejects(reserveGarage(db,'store',{...first,id:'other',bayId:'box2'},contact,'ai'),/não está mais disponível/);assert.equal(db.data.get(root).kits[0].reserved,1);
});
test('confirmation rechecks approval, pause, expiry, profile and operating rules',async()=>{
 for(const scenario of ['paused','approval','profile','disabled','expired','vehicle']) {
  const db=seed(),state=db.data.get(root),o=offer(state),c=structuredClone(contact);
  if(scenario==='paused')db.data.get('establishments/store/chats/ig_123').aiPaused=true;
  if(scenario==='approval')state.kits[0].autoBook=false;
  if(scenario==='profile')o.profile='other';if(scenario==='disabled')state.config.autoConfirm=false;if(scenario==='expired')o.expiresAt=1;if(scenario==='vehicle')c.vehicle.year='2010';
  await assert.rejects(reserveGarage(db,'store',o,c,'ai'),scenario);assert.equal(db.data.get(root).kits[0].reserved,0);
 }
});
test('check-in consumes stock once; ready holds bay until actual release; cancellation returns unconsumed reservation only',async()=>{
 const db=seed(),o=offer(db.data.get(root));await reserveGarage(db,'store',o,contact,'ai');
 await transitionGarageBooking(db,'store',day,o.id,'installing');await transitionGarageBooking(db,'store',day,o.id,'installing');
 assert.equal(db.data.get(root).kits[0].onHand,1);assert.equal(db.data.get(root).kits[0].reserved,0);assert.equal(db.data.get(root).occupancies.box1.id,o.id);
 await transitionGarageBooking(db,'store',day,o.id,'ready');
 assert.equal(garageSlots(db.data.get(root),[],db.data.get(root).kits[0],day).some(s=>s.bayId==='box1'),false);
 await transitionGarageBooking(db,'store',day,o.id,'completed');assert.equal(db.data.get(root).occupancies.box1,undefined);
 const o2=offer(db.data.get(root),'cancel');await reserveGarage(db,'store',o2,contact,'ai');await transitionGarageBooking(db,'store',day,o2.id,'cancelled');assert.equal(db.data.get(root).kits[0].reserved,0);assert.equal(db.data.get(root).kits[0].onHand,1);
});
test('bot offers slots, asks explicit consent, and confirms from database only after customer accepts',async()=>{
 const db=seed(),run=text=>resolveAutomotiveOperations(db,'store','ig_123','legacy',vehicle,text,mockPostal);
 assert.match((await run(`quero agendar ${day}`)).replyText,/horários/);assert.equal(db.data.get(root).kits[0].reserved,0);
 assert.match((await run('1')).replyText,/telefone/);assert.match((await run('81999999999')).replyText,/Posso confirmar/);assert.equal(db.data.get(root).kits[0].reserved,0);
 assert.match((await run('sim')).replyText,/Instalação confirmada/);assert.equal(db.data.get(root).kits[0].reserved,1);assert.equal(db.data.get('automotive_projects/project').garageBooking.status,'confirmed');
});
test('unconfigured garage cannot claim stock or appointments; known calendar dates are parsed without normalizing invalid days',async()=>{
 const db=fakeDb();const result=await resolveAutomotiveOperations(db,'store','ig_123','legacy',vehicle,'tem vaga amanhã?');assert.match(result.replyText,/consultar a equipe/i);
 assert.equal(operationDay('31/02/2027'),null);assert.equal(operationDay(`dia ${day}`),day);
});
test('management API is owner-only and automotive-only',async t=>{
 if(!admin.apps.length)admin.initializeApp({projectId:'garage-tests'});t.mock.method(admin.auth(),'verifyIdToken',async token=>{if(token==='valid')return {uid:'store'};throw new Error('invalid');});
 const db=seed(),routes={};registerGarageRoutes({get:(p,f)=>routes[p]=f,post:()=>{}},db);
 const res=()=>({code:200,status(c){this.code=c;return this},json(v){this.body=v;return this}});
 let r=res();await routes['/api/garage/state']({headers:{},query:{establishmentId:'store'}},r);assert.equal(r.code,401);
 r=res();await routes['/api/garage/state']({headers:{authorization:'Bearer valid'},query:{establishmentId:'other'}},r);assert.equal(r.code,403);
 db.data.get('establishments/store').segment='AFFILIATES';r=res();await routes['/api/garage/state']({headers:{authorization:'Bearer valid'},query:{establishmentId:'store'}},r);assert.equal(r.code,403);
});

test('audio tool can consult but cannot finalize a reservation or address confirmation without text consent',async()=>{
 const db=seed(),run=(text,commit=true)=>resolveAutomotiveOperations(db,'store','ig_123','legacy',vehicle,text,mockPostal,commit);
 await run(`agendar ${day}`);await run('1');await run('81999999999');
 assert.match((await run('sim',false)).replyText,/SIM por texto/);assert.equal(db.data.get(root).kits[0].reserved,0);
 assert.match((await run('sim')).replyText,/confirmada/);assert.equal(db.data.get(root).kits[0].reserved,1);
});
