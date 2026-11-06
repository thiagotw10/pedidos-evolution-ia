const {test}=require('node:test'),assert=require('node:assert/strict');
const {resolveProjectProgress,isProjectProgressQuestion,projectProgressText,projectProgressNotification,deliverProjectProgress}=require('../lib/projectProgress');
function fakeDb(seed={}){const data=new Map(Object.entries(structuredClone(seed)));let queue=Promise.resolve();const doc=path=>({path,id:path.split('/').pop(),get:async()=>({data:()=>structuredClone(data.get(path))}),set:async(v,o)=>data.set(path,o?.merge?{...data.get(path),...structuredClone(v)}:structuredClone(v)),collection:n=>({doc:id=>doc(`${path}/${n}/${id}`)})});return {data,collection:p=>({doc:id=>doc(`${p}/${id}`)}),runTransaction:fn=>{const run=queue.then(async()=>{const writes=[];const result=await fn({get:r=>r.get(),set:(r,v,o)=>writes.push(()=>r.set(v,o))});for(const w of writes)await w();return result;});queue=run.catch(()=>{});return run;}};}
const project={establishmentId:'store',phone:'ig_123',brand:'Porsche',model:'911',year:'2020',status:'Em execução',delivery:'Atendimento local',notes:'PRIVATE'};
function seed(overrides={}){return fakeDb({'automotive_projects/p':{...project,...overrides},'establishments/store':{segment:'AUTOMOTIVE_PARTS'},'establishments/store/chats/ig_123':{lastInboundAt:new Date().toISOString()}});}
test('progress questions read the linked project live instead of catalog references',async()=>{
 const db=seed();const r=await resolveProjectProgress(db,'store','ig_123','p','Como anda meu projeto M');assert.equal(r.kind,'project_progress');assert.match(r.replyText,/em execução/);assert.match(r.replyText,/não há uma previsão/);assert.doesNotMatch(r.replyText,/PRIVATE|referência|9h/);
 db.data.get('automotive_projects/p').completionForecast='04/11 às 17h, sujeito ao teste final';db.data.get('automotive_projects/p').serviceUpdate='Em teste de vedação.';
 const updated=await resolveProjectProgress(db,'store','ig_123','p','Quando meu carro vai sair?');assert.match(updated.replyText,/04\/11 às 17h, sujeito ao teste final/);assert.match(updated.replyText,/teste de vedação/);
 for(const text of ['Como anda meu projeto?','Qual o status do meu carro?','Meu carro já está pronto?','Quando posso buscar?'])assert.equal(isProjectProgressQuestion(text),true,text);
 for(const text of ['Mostre projetos para Porsche','Tem fotos do escape?','Quero um orçamento'])assert.equal(isProjectProgressQuestion(text),false,text);
});
test('project ownership and unknown project never expose another customer progress',async()=>{
 for(const changes of [{establishmentId:'other'},{phone:'ig_other'}]){const r=await resolveProjectProgress(seed(changes),'store','ig_123','p','Como anda meu projeto?');assert.doesNotMatch(r.replyText,/Porsche|execução/);}
 assert.match((await resolveProjectProgress(seed(),'store','ig_123',undefined,'Como anda meu projeto?')).replyText,/qual.*projeto/i);
});
test('approval, readiness, shipping and completion remain distinct; quote lead time is not a completion date',()=>{
 assert.match(projectProgressText({...project,status:'Aprovado',leadTime:'2 dias'}),/início.*não foi registrado/);
 assert.doesNotMatch(projectProgressText({...project,status:'Aprovado',leadTime:'2 dias'}),/2 dias/);
 assert.match(projectProgressText({...project,status:'Pronto para retirada'}),/liberado para retirada/);
 assert.doesNotMatch(projectProgressText({...project,status:'Concluído'}),/liberado para retirada/);
 assert.match(projectProgressText({...project,status:'Enviado',tracking:'BR123'}),/BR123/);
});
test('notifications only follow real transitions or changed registered forecasts',()=>{
 assert.equal(projectProgressNotification(null,project),'');assert.equal(projectProgressNotification(project,project),'');
 assert.match(projectProgressNotification({...project,status:'Aprovado'},project),/Recebemos seu carro/);
 assert.match(projectProgressNotification(project,{...project,status:'Pronto para retirada'}),/liberado para retirada/);
 assert.equal(projectProgressNotification(project,{...project,status:'Pronto para retirada',delivery:'Envio nacional'}),'');
 assert.match(projectProgressNotification(project,{...project,completionForecast:'04/11 às 17h'}),/04\/11 às 17h/);
});
test('event retries send once to the project channel and mirror the sent message',async()=>{
 const db=seed(),before={...project,status:'Aprovado'};let calls=0;
 const send=async(s,c,t,ch)=>{calls++;assert.equal(ch,'instagram');assert.equal(c,'ig_123');assert.doesNotMatch(t,/PRIVATE/);return{success:true}};
 await Promise.all([deliverProjectProgress(db,'p','e',before,project,send),deliverProjectProgress(db,'p','e',before,project,send)]);
 assert.equal(calls,1);assert.equal([...db.data.entries()].filter(([k,v])=>k.includes('/messages/')&&v.deliveryStatus==='sent').length,1);
});
for(const mode of ['expired','invalid-window','human','stale','wrong-store'])test('notification blocks '+mode,async()=>{
 const db=seed(),chat=db.data.get('establishments/store/chats/ig_123');
 if(mode==='expired')chat.lastInboundAt=new Date(Date.now()-25*3600000).toISOString();
 if(mode==='invalid-window')chat.lastInboundAt='invalid';
 if(mode==='human')chat.aiPaused=true;
 if(mode==='stale')db.data.get('automotive_projects/p').status='Cancelado';
 if(mode==='wrong-store')db.data.get('establishments/store').segment='RESTAURANT';
 await deliverProjectProgress(db,'p','e',{...project,status:'Aprovado'},project,async()=>assert.fail('must not send'));
 assert.equal([...db.data.values()].filter(v=>v.status==='blocked').length,1);
});
test('ambiguous send is recorded and never automatically retried',async()=>{
 const db=seed();let calls=0;const send=async()=>{calls++;throw Error('timeout')};
 await deliverProjectProgress(db,'p','e',{...project,status:'Aprovado'},project,send);await deliverProjectProgress(db,'p','e',{...project,status:'Aprovado'},project,send);
 assert.equal(calls,1);assert.equal([...db.data.values()].filter(v=>v.status==='delivery_unknown').length,1);
});
test('pickup notification uses WhatsApp for a WhatsApp project, never an Instagram test contact',async()=>{
 const phone='5581999990000',after={...project,phone,status:'Pronto para retirada'},db=seed();db.data.set('automotive_projects/p',after);db.data.set('establishments/store/chats/'+phone,{});
 let sent=0;await deliverProjectProgress(db,'p','ready',project,after,async(s,c,t,ch)=>{sent++;assert.equal(c,phone);assert.equal(ch,'whatsapp');assert.match(t,/liberado para retirada/);return{success:true}});assert.equal(sent,1);
});
test('a human takeover after the event claim cancels the notification before dispatch',async()=>{
 const db=seed();const collection=db.collection;let reads=0;db.collection=p=>{const col=collection(p);if(p!=='automotive_projects')return col;return{doc:id=>{const ref=col.doc(id),get=ref.get;return{...ref,get:async()=>{reads++;if(reads===2)db.data.get('establishments/store/chats/ig_123').aiPaused=true;return get()}}}}};
 await deliverProjectProgress(db,'p','e',{...project,status:'Aprovado'},project,async()=>assert.fail('must not send after takeover'));
 assert.ok([...db.data.values()].some(v=>v.reason==='changed_before_send'));
});
test('greeting and memory complaints resume the live project without reopening quotes or slots',async()=>{
 const db=seed();for(const input of ['Oi','Mas eu ja nao conversei com voce ?','Você não lembra de mim?']){
  const result=await resolveProjectProgress(db,'store','ig_123','p',input);assert.match(result.replyText,/em execução/);assert.doesNotMatch(result.replyText,/preparar.*orçamento|confirmação da vaga|equipe continuar/);
 }
 assert.equal(await resolveProjectProgress(db,'store','ig_123',undefined,'Oi'),null,'new contacts retain normal greeting');
 assert.equal(await resolveProjectProgress(db,'other','ig_123','p','Oi'),null,'no project information from another store');
});
