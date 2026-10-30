const {test}=require('node:test');const assert=require('node:assert/strict');
const media=require('../lib/chatMedia');
const ig=require('../lib/instagramWebhook');const wa=require('../lib/whatsappSender');const voice=require('../lib/voiceGenerator');
const {registerAutomotiveRoutes,translateAutomotiveText,checkedTranslation}=require('../lib/automotive');
function wav(){const frames=8000,b=Buffer.alloc(44+frames*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(frames*2,40);for(let i=0;i<frames;i++)b.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/8000)*1000),44+i*2);return b;}
function fakeDb(seed){const data=new Map(Object.entries(seed));let n=0;
 const doc=path=>({id:path.split('/').pop(),path,get:async()=>({exists:data.has(path),data:()=>data.get(path)}),set:async(v,o)=>data.set(path,o?.merge?{...data.get(path),...v}:v),update:async(v)=>data.set(path,{...data.get(path),...v}),collection:name=>col(path+'/'+name)});
 const col=(path,filters=[])=>({doc:id=>doc(path+'/'+(id||`a${++n}`)),add:async v=>{const d=doc(path+`/a${++n}`);await d.set(v);return d;},where:(k,op,v)=>col(path,[...filters,[k,v]]),get:async()=>({docs:[...data].filter(([p,v])=>p.startsWith(path+'/')&&!p.slice(path.length+1).includes('/')&&filters.every(([k,w])=>v[k]===w)).map(([p,v])=>({ref:doc(p),id:p.split('/').pop(),data:()=>v})),empty:false})});
 return {data,collection:col,runTransaction:async cb=>cb({get:r=>r.get(),set:(r,v,o)=>r.set(v,o),update:(r,v)=>r.update(v)})};}
function setup(phone){const db=fakeDb({'automotive_projects/p':{establishmentId:'store',phone,detectedLanguage:'pt'},'establishments/store':{evolutionApiUrl:'https://evolution.example',evolutionInstanceName:'inst'},['establishments/store/chats/'+phone]:{aiPaused:false}});const handlers={};const app={get:(p,h)=>handlers['GET '+p]=h,post:(p,h)=>handlers['POST '+p]=h,patch:(p,h)=>handlers['PATCH '+p]=h,use:()=>{}};registerAutomotiveRoutes(app,db);return {db,handlers};}
const res=()=>({locals:{uid:'store'},statusCode:200,status(n){this.statusCode=n;return this},json(v){this.body=v;return this}});
const request=body=>({params:{id:'p'},body,headers:{}});
const aiResponse=text=>new Response(JSON.stringify({candidates:[{content:{role:'model',parts:[{text}]},finishReason:'STOP'}]}),{headers:{'Content-Type':'application/json'}});
test('media upload validation rejects wrong formats and oversize before hosting',()=>{
 assert.throws(()=>media.decodeChatUpload('data:text/html;base64,PGgxPg==','image'),/Formato/);
 assert.throws(()=>media.decodeChatUpload('https://example.com','image'),/arquivo válido/);
 assert.throws(()=>media.decodeChatUpload('data:image/png;base64,'+Buffer.alloc(8*1024*1024+1).toString('base64'),'image'),/8 MB/);
 assert.equal(media.decodeChatUpload('data:audio/webm;codecs=opus;base64,AQID','audio').data,'AQID');
});
test('real audio converter produces an AAC/M4A container and rejects corrupt audio',async()=>{
 const normalized=await media.normalizeChatAudio(wav().toString('base64'),'audio/wav');assert.equal(normalized.mimeType,'audio/mp4');assert.equal(Buffer.from(normalized.data,'base64').toString('ascii',4,8),'ftyp');
 await assert.rejects(media.normalizeChatAudio('AQID','audio/webm'));
});
for(const phone of ['ig_123','5581999999999']){
 test(`gallery photo/video and voice upload use original channel for ${phone}`,async t=>{
  const {db,handlers}=setup(phone);const calls=[];
  t.mock.method(media,'hostChatUpload',async(s,c,input,kind)=>{assert.equal(s,'store');assert.equal(c,phone);return{url:`https://storage.example/${kind}.m4a`,data:'AQID',mimeType:'audio/mp4'};});
  t.mock.method(ig,'sendInstagramDirect',async(...args)=>{calls.push(['ig',...args.slice(1)]);return{success:true};});
  t.mock.method(wa,'sendWhatsAppMedia',async(...args)=>{calls.push(['wa-media',...args.slice(3)]);return{success:true};});
  t.mock.method(wa,'sendWhatsAppAudio',async(...args)=>{calls.push(['wa-audio',...args.slice(3)]);return{success:true};});
  for(const kind of ['image','video']){const response=res();await handlers['POST /api/automotive/projects/:id/send-media'](request({mediaBase64:`data:${kind==='image'?'image/png':'video/mp4'};base64,AQID`,type:kind,caption:'Referência de teste',targetLang:'pt'}),response);assert.equal(response.statusCode,200);}
  const response=res();await handlers['POST /api/automotive/projects/:id/send-audio'](request({audioBase64:'data:audio/webm;codecs=opus;base64,AQID',mimeType:'audio/webm',targetLang:'pt'}),response);
  assert.equal(response.statusCode,200);assert.equal(response.body.audioUrl,'https://storage.example/audio.m4a');
  assert.equal(calls.length,3);assert(calls.every(c=>phone.startsWith('ig_')?c[0]==='ig':c[0].startsWith('wa-')));
  const logs=[...db.data].filter(([key])=>key.startsWith('establishments/store/chats/'+phone+'/messages/')).map(([,m])=>m);assert.equal(logs.length,3);assert.equal(logs[0].media[0].type,'image');assert.equal(logs[1].media[0].type,'video');assert.equal(logs[2].audioUrl,'https://storage.example/audio.m4a');assert.equal(db.data.get('establishments/store/chats/'+phone).aiPausedUntil,null);
 });
}
test('explicit English dubbing is honored for Brazilian phone and never silently falls back',async t=>{
 const {handlers}=setup('5581999999999');let sent=false;let spoken='';
 t.mock.method(global,'fetch',async()=>aiResponse(JSON.stringify({transcriptionPt:'Olá',translatedText:'Hello'})));
 t.mock.method(voice,'generateVoiceAudioBase64',async text=>{spoken=text;return 'AQID';});
 t.mock.method(media,'hostChatUpload',async()=>({url:'https://storage.example/translated.m4a'}));
 t.mock.method(wa,'sendWhatsAppAudio',async()=>{sent=true;return{success:true};});
 let response=res();await handlers['POST /api/automotive/projects/:id/send-audio'](request({audioBase64:'data:audio/webm;base64,AQID',mimeType:'audio/webm',targetLang:'en'}),response);
 assert.equal(response.statusCode,200);assert.equal(spoken,'Hello');assert.equal(sent,true);assert.match(response.body.textNote,/Hello/);
 sent=false;t.mock.method(voice,'generateVoiceAudioBase64',async()=>null);response=res();
 await handlers['POST /api/automotive/projects/:id/send-audio'](request({audioBase64:'data:audio/webm;base64,AQID',mimeType:'audio/webm',targetLang:'en'}),response);
 assert.equal(response.statusCode,502);assert.equal(sent,false);
});
test('strict text translation surfaces provider failures instead of claiming a translation',async t=>{
 t.mock.method(global,'fetch',async()=>new Response(JSON.stringify({error:{code:400,message:'test error',status:'INVALID_ARGUMENT'}}),{status:400,headers:{'Content-Type':'application/json'}}));
 await assert.rejects(translateAutomotiveText('Olá','en',true),/tradução fiel/);
});
test('a provider rejection is reported as failure, not a delivered image',async t=>{
 const {handlers}=setup('ig_123');t.mock.method(media,'hostChatUpload',async()=>({url:'https://storage.example/test.png'}));t.mock.method(ig,'sendInstagramDirect',async()=>({success:false,error:'Janela encerrada'}));
 const response=res();await handlers['POST /api/automotive/projects/:id/send-media'](request({mediaBase64:'data:image/png;base64,AQID',type:'image',targetLang:'pt'}),response);
 assert.equal(response.statusCode,400);assert.equal(response.body.error,'Janela encerrada');
});

test('translation guard blocks advertising expansions, new placeholders and changed facts',()=>{
 assert.throws(()=>checkedTranslation('Foto de teste','Our products: '.repeat(100)),/acrescentou/);
 assert.throws(()=>checkedTranslation('Olá','Hello [Company Name]'),/placeholder/);
 assert.throws(()=>checkedTranslation('Prazo 15 dias','Delivery in 7 days'),/número/);
 assert.equal(checkedTranslation('Olá, Flow Garage','Hello, Flow Garage'),'Hello, Flow Garage');
});
