const {test}=require('node:test');const assert=require('node:assert/strict');
const {openInternalConsultation,consultationVehicleKey,consultationReply,deliverInternalFollowup,notifyInternalConsultation}=require('../lib/internalConsultation');
function fakeDb(seed={}){const data=new Map(Object.entries(structuredClone(seed)));let queue=Promise.resolve();const doc=path=>({path,id:path.split('/').pop(),get:async()=>({data:()=>structuredClone(data.get(path))}),set:async(v,o)=>data.set(path,o?.merge?{...data.get(path),...structuredClone(v)}:structuredClone(v)),update:async v=>data.set(path,{...data.get(path),...structuredClone(v)}),collection:n=>({doc:id=>doc(`${path}/${n}/${id}`),orderBy:()=>({limit:()=>({get:async()=>({docs:[...data.entries()].filter(([key])=>key.startsWith(`${path}/${n}/`)).sort((a,b)=>String(b[1].timestamp).localeCompare(String(a[1].timestamp))).slice(0,8).map(([,v])=>({data:()=>structuredClone(v)}))})})})})});return {data,collection:p=>({doc:id=>doc(`${p}/${id}`)}),runTransaction:fn=>{const result=queue.then(async()=>{const writes=[];const result=await fn({get:r=>r.get(),set:(r,v,o)=>writes.push(()=>r.set(v,o)),update:(r,v)=>writes.push(()=>r.update(v))});for(const w of writes)await w();return result;});queue=result.catch(()=>{});return result;}};}
const ctx={brand:'VW',model:'Jetta',year:'2023',version:'GLI'},root='automotiveOperations/store',chat='establishments/store/chats/ig_123';
function seeded(changes={}){return fakeDb({[root+'/requests/request']:{id:'request',version:1,status:'answered'},[root+'/followups/job']:{requestId:'request',requestVersion:1,contactId:'ig_123',profile:'project',vehicleKey:consultationVehicleKey(ctx),channel:'instagram',text:'Fato confirmado.',status:'pending',createdAt:new Date().toISOString()},'establishments/store':{segment:'AUTOMOTIVE_PARTS'},[chat]:{activeAutomotiveProfile:'project',automotiveContext:ctx,lastInboundAt:new Date().toISOString(),...changes}});}
test('repeated consultation deduplicates by vehicle and profile; new rounds preserve history',async()=>{const db=fakeDb();const a=await openInternalConsultation(db,'store','ig_123','p',ctx,'stock','tem peça?');const b=await openInternalConsultation(db,'store','ig_123','p',ctx,'stock','tem peça mesmo?');assert.equal(a.requestId,b.requestId);assert.match(b.replyText,/continua/);await db.collection(root+'/requests').doc(a.requestId).update({status:'sent'});await openInternalConsultation(db,'store','ig_123','p',ctx,'stock','tem peça?');assert.equal(db.data.get(root+'/requests/'+a.requestId).version,2);assert.ok(db.data.get(root+'/requests/'+a.requestId+'/history/1'));const c=await openInternalConsultation(db,'store','ig_123','other',ctx,'stock','tem peça?');assert.notEqual(c.requestId,a.requestId);});
test('only public confirmed facts enter customer reply; availability never becomes reservation',()=>{const text=consultationReply({vehicle:ctx},{outcome:'available',facts:'Podemos avaliar amanhã.',internalNotes:'SEGREDO'});assert.ok(!text.includes('SEGREDO'));assert.ok(!text.includes('confirmada'));assert.throws(()=>consultationReply({},{outcome:'info'}),/fatos/);assert.throws(()=>consultationReply({},{outcome:'info',facts:'💥'.repeat(300)}),/única resposta/);});
test('correct-channel followup is mirrored and retries never send twice',async()=>{const db=seeded();let n=0;const sender=async(s,c,t,ch)=>{n++;assert.equal(c,'ig_123');assert.equal(ch,'instagram');assert.equal(t,'Fato confirmado.');return {success:true};};await Promise.all([deliverInternalFollowup(db,'store','job',sender),deliverInternalFollowup(db,'store','job',sender)]);assert.equal(n,1);assert.equal(db.data.get(root+'/requests/request').status,'sent');assert.equal(db.data.get(chat+'/messages/internal_job').deliveryStatus,'sent');});
for(const [name,changes,reason] of [['takeover',{aiPaused:true},'human_takeover'],['different project',{activeAutomotiveProfile:'other'},'project_changed'],['different car',{automotiveContext:{...ctx,model:'Polo'}},'project_changed'],['closed Instagram window',{lastInboundAt:new Date(Date.now()-25*3600000).toISOString()},'instagram_window_expired']])test(name+' prevents sending',async()=>{const db=seeded(changes);await deliverInternalFollowup(db,'store','job',async()=>{throw Error('must not send');});assert.equal(db.data.get(root+'/followups/job').reason,reason);assert.equal(db.data.get(chat+'/messages/internal_job'),undefined);});
test('ambiguous provider failure is visible and never automatically resent',async()=>{const db=seeded();let n=0;const sender=async()=>{n++;throw Error('timeout');};await deliverInternalFollowup(db,'store','job',sender);await deliverInternalFollowup(db,'store','job',sender);assert.equal(n,1);assert.equal(db.data.get(root+'/requests/request').status,'delivery_unknown');});
test('internal notification includes app link, never private notes',async()=>{const db=fakeDb({[root+'/requests/r']:{status:'pending',customerName:'Isa',vehicle:ctx,answer:{internalNotes:'PRIVATE'}}});let n=0;const push=async(s,p)=>{n++;assert.match(p.url,/tab=internal/);assert.ok(!JSON.stringify(p).includes('PRIVATE'));};await notifyInternalConsultation(db,'store','r',push);await notifyInternalConsultation(db,'store','r',push);assert.equal(n,1);});
test('answer endpoint enforces owner and stores private notes outside customer followup',async t=>{
 const admin=require('firebase-admin');if(!admin.apps.length)admin.initializeApp({projectId:'test'});t.mock.method(admin.auth(),'verifyIdToken',async token=>{if(token!=='owner')throw Error('unauthenticated');return {uid:'store'};});
 const {registerInternalConsultationRoutes}=require('../lib/internalConsultation');const db=seeded();const id='a'.repeat(64);db.data.set(root+'/requests/'+id,{id,version:1,status:'pending',contactId:'ig_123',profile:'project',vehicleKey:consultationVehicleKey(ctx),vehicle:ctx,channel:'instagram'});
 const routes={};registerInternalConsultationRoutes({get:(p,f)=>routes['GET '+p]=f,post:(p,f)=>routes['POST '+p]=f},db,async(_ticket,answer)=>'Resposta natural: '+answer.facts);
 const run=async(token,store='store',version=1)=>{let status=200,body;await routes['POST /api/internal-consultations/:id/answer']({headers:{authorization:'Bearer '+token},query:{establishmentId:store},params:{id},body:{version,outcome:'info',facts:'Avaliação presencial.',internalNotes:'PRIVADO'}},{status(n){status=n;return this;},json(v){body=v;return this;}});return {status,body};};
 assert.equal((await run('bad')).status,401);assert.equal((await run('owner','other')).status,403);assert.equal((await run('owner','store',2)).status,400);
 const result=await run('owner');assert.equal(result.status,200);assert.ok(!result.body.customerText.includes('PRIVADO'));assert.equal(db.data.get(root+'/requests/'+id).answer.internalNotes,'PRIVADO');assert.ok(!JSON.stringify(db.data.get(root+'/followups/'+result.body.followupId)).includes('PRIVADO'));assert.equal((await run('owner')).status,400);
});
test('rewriter receives only allowed context and turns staff direction into customer speech',async()=>{
 const {composeInternalReply}=require('../lib/internalConsultation');let calls=0;
 const result=await composeInternalReply({question:'Quando tem vaga?',vehicle:ctx,answer:{internalNotes:'PRIVATE'},secret:'SECRET'},{outcome:'info',facts:'pode falar que a gente vai ter vaga disponivel so na proxima segunda no horario das 9 horas',internalNotes:'PRIVATE'},async({system,context})=>{calls++;assert.ok(!JSON.stringify(context).includes('PRIVATE'));assert.ok(!JSON.stringify(context).includes('SECRET'));assert.match(system,/Vaga disponível não significa/);assert.match(context.orientacaoDaEquipe,/9 horas/);return 'Temos vaga disponível somente na próxima segunda-feira, às 9h. Esse horário funciona para você?';});
 assert.equal(calls,1);assert.match(result,/somente na próxima segunda-feira, às 9h/);assert.ok(!result.includes('pode falar'));
});
test('rewriter failure and invalid replies fail closed without copying the staff instruction',async()=>{const {composeInternalReply}=require('../lib/internalConsultation');for(const gen of [async()=>{throw Error('timeout');},async()=>'',async()=>'Pode falar que tem vaga',async()=>'a'.repeat(900)])await assert.rejects(composeInternalReply({}, {outcome:'info',facts:'pode falar que tem vaga segunda às 9h'},gen),/nada foi enviado/);});

test('same vehicle with generation moved from model to version remains the same consultation',()=>{
 const {consultationIdentityMatches:matches}=require('../lib/internalConsultation');
 const vehicle={brand:'Porsche',model:'911 (991)',year:'2020',version:'991'};
 const current={...vehicle,model:'911',projectId:'project-1'};
 const chat={activeAutomotiveProfile:'legacy',projectId:'project-1',automotiveContext:current,automotiveProfiles:{legacy:current}};
 assert.equal(matches(chat,{profile:'legacy',projectId:'project-1',vehicle,vehicleKey:consultationVehicleKey(vehicle)}),true);
 assert.equal(matches(chat,{profile:'legacy',vehicleKey:consultationVehicleKey(vehicle)}),true,'old jobs without a vehicle snapshot are supported');
 for(const changed of [{model:'718'},{version:'992'},{year:'2021'},{brand:'BMW'},{projectId:'project-2'}])assert.equal(matches({...chat,automotiveContext:{...current,...changed},automotiveProfiles:{legacy:{...current,...changed}}},{profile:'legacy',projectId:'project-1',vehicle}),false,JSON.stringify(changed));
 assert.equal(matches({...chat,activeAutomotiveProfile:'other'},{profile:'legacy',vehicle}),false);
 assert.equal(matches({...chat,automotiveContext:{...current,model:'911 (Turbo S)'}},{profile:'legacy',vehicle}),false,'different trim details are not discarded');
});
test('followup accepts equivalent model formatting and keeps duplicate-send protection',async()=>{
 const db=seeded({automotiveContext:{brand:'Porsche',model:'911',year:'2020',version:'991'}});
 const original={brand:'Porsche',model:'911 (991)',year:'2020',version:'991'};
 db.data.get(root+'/followups/job').vehicleKey=consultationVehicleKey(original);
 let sent=0;await deliverInternalFollowup(db,'store','job',async()=>{sent++;return{success:true}});await deliverInternalFollowup(db,'store','job',async()=>{sent++;return{success:true}});
 assert.equal(sent,1);assert.equal(db.data.get(root+'/requests/request').status,'sent');
});
test('answer endpoint queues the existing ticket when only model/version presentation changed',async t=>{
 const admin=require('firebase-admin');if(!admin.apps.length)admin.initializeApp({projectId:'test'});t.mock.method(admin.auth(),'verifyIdToken',async()=>({uid:'store'}));
 const {registerInternalConsultationRoutes}=require('../lib/internalConsultation'),id='b'.repeat(64),vehicle={brand:'Porsche',model:'911 (991)',year:'2020',version:'991'};
 const db=seeded({automotiveContext:{...vehicle,model:'911',projectId:'p1'},projectId:'p1'});
 db.data.set(root+'/requests/'+id,{id,version:1,status:'pending',contactId:'ig_123',profile:'project',projectId:'p1',vehicle,vehicleKey:consultationVehicleKey(vehicle),channel:'instagram'});
 const routes={};registerInternalConsultationRoutes({get:(p,f)=>routes[p]=f,post:(p,f)=>routes[p]=f},db,async()=> 'Temos disponibilidade para avaliação.');
 let code=200,body;await routes['/api/internal-consultations/:id/answer']({headers:{authorization:'Bearer owner'},query:{establishmentId:'store'},params:{id},body:{version:1,outcome:'available',facts:'Avaliação disponível.'}},{status(v){code=v;return this},json(v){body=v;return this}});
 assert.equal(code,200);assert.equal(body.success,true);assert.equal(db.data.get(root+'/followups/'+body.followupId).projectId,'p1');assert.deepEqual(db.data.get(root+'/followups/'+body.followupId).vehicle,vehicle);
});

function offerDb(){const db=seeded();const ticket=db.data.get(root+'/requests/request');Object.assign(ticket,{status:'sent',profile:'project',contactId:'ig_123',channel:'instagram',vehicle:ctx,vehicleKey:consultationVehicleKey(ctx),answer:{outcome:'available'},customerText:'Temos vaga para a instalação no dia 2 de novembro, às 9h. Esse horário funciona para você?',sentAt:new Date().toISOString()});Object.assign(db.data.get(chat),{lastInternalRequestId:'request'});db.data.set(chat+'/messages/offer',{sender:'assistant',text:ticket.customerText,internalRequestId:'request',deliveryStatus:'sent',timestamp:new Date().toISOString()});return db;}
test('staff offer followed by Sim preserves the slot and queues one final confirmation without inventing a reservation',async()=>{
 const {acceptStaffScheduleOffer}=require('../lib/internalConsultation');const db=offerDb();
 const replies=await Promise.all([acceptStaffScheduleOffer(db,'store','ig_123','project','Sim'),acceptStaffScheduleOffer(db,'store','ig_123','project','Sim')]);
 for(const r of replies){assert.equal(r.kind,'staff_offer_accepted');assert.doesNotMatch(r.replyText,/Qual dia|Instalação confirmada|Reservei/);}
 const pending=[...db.data.values()].filter(v=>v.sourceRequestId==='request');assert.equal(pending.length,1);assert.equal(pending[0].status,'pending');assert.match(pending[0].acceptedOffer,/2 de novembro, às 9h/);assert.match(pending[0].question,/não peça outra data/);assert.equal(db.data.get(root+'/requests/request').status,'sent');
});
for(const mode of ['other-question','other-car','expired','not-delivered','negative','other-profile'])test('staff slot acceptance rejects '+mode,async()=>{
 const {acceptStaffScheduleOffer}=require('../lib/internalConsultation');const db=offerDb();
 if(mode==='other-question')db.data.set(chat+'/messages/later',{sender:'assistant',text:'Quer fotos?',timestamp:'9999'});
 if(mode==='other-car')db.data.get(chat).automotiveContext={...ctx,model:'Polo'};
 if(mode==='expired')db.data.get(root+'/requests/request').sentAt=new Date(Date.now()-25*3600000).toISOString();
 if(mode==='not-delivered')db.data.get(chat+'/messages/offer').deliveryStatus='failed';
 assert.equal(await acceptStaffScheduleOffer(db,'store','ig_123',mode==='other-profile'?'other':'project',mode==='negative'?'Não':'Sim'),null);
 assert.equal([...db.data.values()].filter(v=>v.sourceRequestId==='request').length,0);
});
test('same-slot generated confirmation and the reported menu loop continue the authoritative staff offer',async()=>{
 const {staffScheduleContinuation,acceptStaffScheduleOffer}=require('../lib/internalConsultation');const db=offerDb(),ticket=db.data.get(root+'/requests/request');
 const prompt={sender:'assistant',deliveryStatus:'sent',text:'Olá! Tudo bem? Só me confirma por texto um SIM para eu deixar o dia 2 de novembro às 9h reservado para a instalação do seu 911.',timestamp:'2026-11-02T00:36:02Z'};
 assert.equal(staffScheduleContinuation(ticket,[prompt],'Sim'),true);
 assert.equal(staffScheduleContinuation(ticket,[{...prompt,text:prompt.text.replace('9h','10h')}],'Sim'),false);
 const menu={sender:'assistant',deliveryStatus:'sent',text:'Qual consulta você quer fazer: endereço de entrega, estoque de um kit ou instalação?',timestamp:'2026-11-02T00:36:53Z'};
 const history=[menu,{sender:'user',text:'Instalacao',timestamp:'2026-11-02T00:36:50Z'},{...menu,timestamp:'2026-11-02T00:36:18Z'},{sender:'user',text:'Sim',timestamp:'2026-11-02T00:36:15Z'},prompt];
 assert.equal(staffScheduleContinuation(ticket,history,'Instalação'),true);
 assert.equal(staffScheduleContinuation(ticket,history.filter(m=>m.text!=='Sim'),'Instalação'),false);
 assert.equal(staffScheduleContinuation(ticket,[{...menu,text:'Quer ver fotos?'},...history],'Sim'),false);
 for(const [key] of db.data)if(key.startsWith(chat+'/messages/'))db.data.delete(key);
 history.forEach((m,i)=>db.data.set(chat+'/messages/m'+i,m));
 const result=await acceptStaffScheduleOffer(db,'store','ig_123','project','Instalacao');assert.equal(result.kind,'staff_offer_accepted');
 assert.equal([...db.data.values()].filter(v=>v.sourceRequestId==='request').length,1);
});
