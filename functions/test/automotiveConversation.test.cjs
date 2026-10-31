const {test}=require('node:test');
const assert=require('node:assert/strict');
const {automotiveIntent,selectAutomotiveProfile,automotiveTurnInstructions}=require('../lib/automotiveConversation');
const {normalizeAutomotiveSpecs,referenceMatches}=require('../lib/automotiveCatalog');
const {groundedInstagram}=require('../lib/groundedInstagram');
const {extractAutomotiveContextFromText,saveAutomotiveContactAndSyncCrm}=require('../lib/automotive');
function fakeDb(seed={}) {
 const data=new Map(Object.entries(seed));let n=0;
 const clean=v=>{if(v===undefined)throw new Error('Firestore cannot save undefined');if(v&&typeof v==='object')for(const x of Object.values(v))clean(x);};
 const doc=path=>({id:path.split('/').pop(),path,get:async()=>({exists:data.has(path),data:()=>data.get(path)}),set:async(v,o)=>{clean(v);data.set(path,o?.merge?{...data.get(path),...v}:v);},update:async v=>data.set(path,{...data.get(path),...v}),collection:name=>col(`${path}/${name}`)});
 const col=(path,filters=[])=>({doc:id=>doc(`${path}/${id||`auto${++n}`}`),where:(key,op,v)=>col(path,[...filters,[key,v]]),get:async()=>({docs:[...data].filter(([k,v])=>k.startsWith(path+'/')&&!k.slice(path.length+1).includes('/')&&filters.every(([key,wanted])=>v[key]===wanted)).map(([k,v])=>({ref:doc(k),id:k.split('/').pop(),data:()=>v}))})});
 return {data,collection:col};
}
const jetta={brand:'Volkswagen',model:'Jetta GLI',year:'2023',version:'GLI',modifications:'original',objective:'Mais ronco sem ressonância',projectId:'jetta-project'};
const fixtures=[{id:'jetta',name:'Projeto de cliente',imageUrl:'https://cdn.test/jetta.jpg',videoUrl:'https://cdn.test/jetta.mp4',automotiveSpecs:{brand:'Volkswagen',model:'Jetta',generation:'MK7',engine:'2.0',material:'Inox 304',configuration:'Catback valvulado',validation:'reference'}},{id:'porsche',name:'Porsche 911 992.2 Titanium',imageUrl:'https://cdn.test/porsche.jpg'}];

test('intent prioritizes all explicit requests and distinguishes desired sound from a video request',()=>{
 assert.equal(automotiveIntent('quero mais ronco sem incomodar na estrada').intents.includes('media'),false);
 const mixed=automotiveIntent('quanto custa e pode mandar um vídeo?');assert.equal(mixed.primary,'price');assert.equal(mixed.intents.includes('media'),true);
 assert.equal(automotiveIntent('quero falar com uma pessoa').primary,'human');
 assert.equal(automotiveIntent('posso agendar a instalação?').primary,'appointment');
 assert.equal(groundedInstagram('quanto custa e tem vídeo?',fixtures,{},'s'),null);
 assert.equal(groundedInstagram('Tenho um Jetta GLI 2023',fixtures,{},'s'),null);
});
test('requesting another reference cannot replace the owner vehicle or installed modifications',()=>{
 const selection=selectAutomotiveProfile('manda fotos Porsche 992',{automotiveContext:jetta},extractAutomotiveContextFromText('manda fotos Porsche 992'));
 assert.equal(selection.context.model,jetta.model);assert.equal(selection.context.version,'GLI');assert.equal(selection.context.projectId,'jetta-project');assert.equal(selection.active,'legacy');
 assert.equal(extractAutomotiveContextFromText('quero um downpipe e remap').modifications,undefined);
 assert.match(extractAutomotiveContextFromText('já tenho remap e downpipe').modifications,/downpipe/);
});
test('new vehicle starts with clean technical fields and can return to the original saved project',()=>{
 const memory={automotiveContext:jetta};
 const second=selectAutomotiveProfile('também tenho uma BMW M3 2021',memory,{brand:'BMW',model:'M3',year:'2021'});
 assert.notEqual(second.active,'legacy');assert.equal(second.context.projectId,undefined);assert.equal(second.context.modifications,undefined);assert.equal(second.context.objective,undefined);
 const back=selectAutomotiveProfile('voltando ao meu Jetta GLI 2023',{activeAutomotiveProfile:second.active,automotiveContext:second.context,automotiveProfiles:{...second.profiles,[second.active]:second.context}},{brand:'Volkswagen',model:'Jetta GLI',year:'2023'});
 assert.equal(back.active,'legacy');assert.equal(back.context.projectId,'jetta-project');assert.equal(back.context.modifications,'original');
});
test('corrected year updates the active vehicle while a different generation creates a different project',()=>{
 const corrected=selectAutomotiveProfile('na verdade meu Jetta é 2024',{automotiveContext:jetta},{model:'Jetta GLI',year:'2024'});assert.equal(corrected.active,'legacy');assert.equal(corrected.context.year,'2024');
 const changed=selectAutomotiveProfile('tenho uma Porsche 992',{automotiveContext:{brand:'Porsche',model:'911',version:'991',projectId:'old'}},{brand:'Porsche',model:'911',version:'992'});assert.notEqual(changed.active,'legacy');assert.equal(changed.context.projectId,undefined);
});
test('structured catalog finds named models even when title is generic, preserves generation and discloses reference status',()=>{
 const result=groundedInstagram('manda vídeo Jetta',fixtures,{},'s');assert.deepEqual(result.memory.selectedIds,['jetta']);assert.match(result.replyText,/Catback valvulado/);assert.match(result.replyText,/avaliação técnica/);assert.equal(result.mediaList[0].type,'video');
 assert.equal(referenceMatches(fixtures[1],'991'),false);assert.equal(referenceMatches(fixtures[1],'992.1'),false);
 assert.equal(groundedInstagram('fotos Jetta 2.0',fixtures,{},'s').mediaList.length,1);
 assert.equal(groundedInstagram('fotos Civic',fixtures,{},'s').mediaList.length,0);
 assert.throws(()=>normalizeAutomotiveSpecs({yearFrom:'2024',yearTo:'2020'}));assert.throws(()=>normalizeAutomotiveSpecs({yearFrom:'991'}));
 assert.equal(normalizeAutomotiveSpecs({validation:'yes'}).validation,'reference');
});
test('turn plan uses current context and does not re-ask known model/year or confirm an appointment',()=>{
 const plan=automotiveTurnInstructions('tem horário amanhã?',jetta);const missing=plan.split('Dados ainda não confirmados:')[1];assert.doesNotMatch(missing,/modelo|ano|versão/);assert.match(plan,/UMA pergunta/);
 assert.match(automotiveTurnInstructions('quero agendar',jetta),/Não confirme vaga/);
});
test('CRM keeps two vehicles separate, resumes previous project and preserves technical data during browsing in both channels',async()=>{
 for(const customerPhone of ['5581999999999','ig_123']) {
  const db=fakeDb({'establishments/store':{segment:'AUTOMOTIVE_PARTS'}});
  const sync=(incomingText,toolArgs)=>saveAutomotiveContactAndSyncCrm({db,establishmentId:'store',customerPhone,incomingText,replyText:'Resposta de teste',toolArgs});
  const first=await sync('Tenho um Jetta GLI 2023. Quero mais ronco',{objective:'Mais ronco',modifications:'original'});
  assert.ok(first.project?.id);const firstId=first.project.id;
  const second=await sync('Também tenho uma BMW M3 2021. Quero um escape valvulado',{objective:'Valvulado'});
  assert.ok(second.project?.id);assert.notEqual(second.project.id,firstId);assert.equal(db.data.get(`automotive_projects/${firstId}`).brand,'Volkswagen');
  assert.equal(second.context.modifications,'');
  const browse=await sync('manda fotos Porsche 992',{brand:'Porsche',model:'911',version:'992',modifications:'titânio'});
  assert.equal(browse.project.id,second.project.id);assert.equal(browse.context.brand,'BMW');assert.notEqual(browse.context.version,'992');
  const back=await sync('Voltando ao meu Jetta GLI 2023');assert.equal(back.project.id,firstId);assert.equal(back.context.modifications,'original');
  const memory=db.data.get(`establishments/store/customers/${customerPhone}`);assert.equal(Object.keys(memory.automotiveProfiles).length,2);
 }
});

test('new car does not inherit the old objective even without model tool arguments',async()=>{
 const db=fakeDb({'establishments/store':{segment:'AUTOMOTIVE_PARTS'}});
 const sync=incomingText=>saveAutomotiveContactAndSyncCrm({db,establishmentId:'store',customerPhone:'ig_123',incomingText,replyText:'Resposta'});
 const first=await sync('Tenho um Jetta GLI 2023 e quero muito ronco');
 const second=await sync('Também tenho uma BMW M3 2021 e quero conforto');
 assert.notEqual(second.project.id,first.project.id);assert.doesNotMatch(second.context.objective,/Jetta|muito ronco/);
});
test('structured generation wins over contradictory legacy text and year ranges filter references',()=>{
 const p={id:'s',name:'Referência Porsche 992',description:'Comparação com 991',automotiveSpecs:{generation:'992',brand:'Porsche',yearFrom:'2020',yearTo:'2024'}};
 assert.equal(referenceMatches(p,'991'),false);assert.equal(referenceMatches(p,'porsche 2023'),true);assert.equal(referenceMatches(p,'porsche 2018'),false);
});

test('vehicle explicitly extracted from audio gets a new profile without overwriting the previous project',async()=>{
 const db=fakeDb({'establishments/store':{segment:'AUTOMOTIVE_PARTS'}});
 const first=await saveAutomotiveContactAndSyncCrm({db,establishmentId:'store',customerPhone:'ig_123',incomingText:'Tenho um Jetta GLI 2023 e quero ronco',replyText:'Ok'});
 const second=await saveAutomotiveContactAndSyncCrm({db,establishmentId:'store',customerPhone:'ig_123',incomingText:'[Áudio recebido]',replyText:'Ok',sourceMediaType:'audio',toolArgs:{brand:'BMW',model:'M3',year:'2021',objective:'Valvulado'}});
 assert.notEqual(second.project.id,first.project.id);assert.equal(second.context.brand,'BMW');assert.notEqual(second.activeProfileId,'legacy');assert.equal(db.data.get(`automotive_projects/${first.project.id}`).brand,'Volkswagen');
});

test('a reference photo alone does not identify a new owned vehicle',async()=>{
 const db=fakeDb({'establishments/store':{segment:'AUTOMOTIVE_PARTS'}});
 const first=await saveAutomotiveContactAndSyncCrm({db,establishmentId:'store',customerPhone:'ig_123',incomingText:'Tenho um Jetta GLI 2023',replyText:'Ok'});
 const picture=await saveAutomotiveContactAndSyncCrm({db,establishmentId:'store',customerPhone:'ig_123',incomingText:'[Imagem recebida]',replyText:'Ok',sourceMediaType:'image',toolArgs:{brand:'Porsche',model:'911',year:'2024'}});
 assert.equal(picture.project.id,first.project.id);assert.equal(picture.context.brand,'Volkswagen');
});
