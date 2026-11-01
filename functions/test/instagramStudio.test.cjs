const {test}=require('node:test');
const assert=require('node:assert/strict');
const admin=require('firebase-admin');
const {validateStudioPost,studioSchedule,studioUrl,insightValue,studioFunnel,registerInstagramStudio,runInstagramPublication,runInstagramStudioQueue,PUBLISH_SCOPE,INSIGHTS_SCOPE,instagramStudioScopes}=require('../lib/instagramStudio');
function fakeDb(seed={}){
 const data=new Map(Object.entries(structuredClone(seed)));
 const doc=path=>({id:path.split('/').pop(),path,get:async()=>({exists:data.has(path),data:()=>data.get(path)}),set:async(v,o)=>data.set(path,o?.merge?{...data.get(path),...v}:v),update:async v=>data.set(path,{...data.get(path),...v}),collection:n=>col(`${path}/${n}`)});
 const col=(path,filters=[],order=null,max=10000)=>({doc:id=>doc(`${path}/${id}`),where:(k,op,v)=>col(path,[...filters,[k,op,v]],order,max),orderBy:(k,d='asc')=>col(path,filters,[k,d],max),limit:n=>col(path,filters,order,n),get:async()=>{let rows=[...data].filter(([k,v])=>k.startsWith(path+'/')&&!k.slice(path.length+1).includes('/')&&filters.every(([key,op,w])=>op==='in'?w.includes(v[key]):op==='<='?v[key]<=w:v[key]===w));if(order)rows.sort((a,b)=>String(a[1][order[0]]).localeCompare(String(b[1][order[0]]))*(order[1]==='desc'?-1:1));return {docs:rows.slice(0,max).map(([k,v])=>({id:k.split('/').pop(),ref:doc(k),data:()=>v}))};}});
 return {data,collection:col,runTransaction:async cb=>cb({get:r=>r.get(),set:(r,v,o)=>r.set(v,o),update:(r,v)=>r.update(v)})};
}
const past=()=>new Date(Date.now()-60000).toISOString();
const content={title:'Projeto Golf',format:'IMAGE',caption:'Um projeto cadastrado',media:['https://example.com/car.jpg'],mediaAuthorized:true,productId:'',goal:'quote',keywords:[],summary:'Projeto de referência'};
const connection={connected:true,enabled:false,accountId:'123456',username:'flow',accessToken:'test-token',expiresAt:'2099-01-01',grantedPermissions:[PUBLISH_SCOPE,INSIGHTS_SCOPE]};
function seed(status='scheduled'){return fakeDb({'establishments/flow':{segment:'AUTOMOTIVE_PARTS'},'instagramConnections/flow':connection,'instagramPublications/post':{...content,storeId:'flow',accountId:'123456',status,nextRunAt:past(),scheduledAt:past(),containerId:'777777',processingStartedAt:past(),updatedAt:'v1'}});}
const response=()=>({code:200,set(){return this},status(c){this.code=c;return this},json(body){this.body=body;return this}});
function routes(db,graph=async()=>assert.fail('No provider call expected')){const r={};registerInstagramStudio({get:(p,f)=>r['GET '+p]=f,post:(p,f)=>r['POST '+p]=f},db,graph);return r;}
const req=(body={},id='flow')=>({headers:{authorization:'Bearer valid'},query:{establishmentId:id},params:{postId:'post'},body});
function auth(t){if(!admin.apps.length)admin.initializeApp({projectId:'studio-tests'});t.mock.method(admin.auth(),'verifyIdToken',async token=>{if(token==='valid')return {uid:'flow'};throw Error('bad');});}

test('post validation rejects private URLs, oversized captions, invalid formats and unauthorized media',()=>{
 for(const url of ['http://example.com/a','https://localhost/a','https://10.0.0.1/a','https://127.0.0.1/a','https://[::1]/a','https://user:pass@example.com/a','https://example.internal/a','file:///tmp/a'])assert.throws(()=>studioUrl(url));
 assert.throws(()=>validateStudioPost({...content,caption:'x'.repeat(2201)}));assert.throws(()=>validateStudioPost({...content,format:'STORIES'}));assert.throws(()=>validateStudioPost({...content,mediaAuthorized:false}));assert.throws(()=>validateStudioPost({...content,format:'CAROUSEL'}));assert.throws(()=>validateStudioPost({...content,goal:'freeform'}));
 assert.equal(validateStudioPost({...content,keywords:'quero, orçamento'}).keywords.length,2);
});
test('schedule uses absolute instants and bounds; missing metrics are never converted into zero',()=>{
 assert.throws(()=>studioSchedule('not-a-date'));assert.throws(()=>studioSchedule(new Date(Date.now()-1000).toISOString()));assert.throws(()=>studioSchedule(new Date(Date.now()+181*86400000).toISOString()));assert.equal(studioSchedule('2027-01-01T09:00:00-03:00',Date.parse('2026-12-31')), '2027-01-01T12:00:00.000Z');
 assert.equal(insightValue({data:[]}),null);assert.equal(insightValue({data:[{values:[{value:0}]}]}),0);assert.equal(insightValue({data:[{total_value:{value:4}}]}),4);
});
test('API restricts access to the owner; response never includes credentials or other account drafts',async t=>{
 auth(t);const db=seed('draft');db.data.set('instagramPublications/other',{...db.data.get('instagramPublications/post'),accountId:'999999'});const r=routes(db);
 let res=response();await r['GET /api/instagram/studio']({...req(),headers:{}},res);assert.equal(res.code,401);
 res=response();await r['GET /api/instagram/studio'](req({},'isa'),res);assert.equal(res.code,403);
 res=response();await r['GET /api/instagram/studio'](req(),res);assert.equal(res.code,200);assert.equal(res.body.posts.length,1);assert.doesNotMatch(JSON.stringify(res.body),/test-token|accessToken|containerId/);
 res=response();await r['POST /api/instagram/studio/posts'](req({...content,id:'post',updatedAt:'stale'}),res);assert.equal(res.code,400);assert.match(res.body.error,/mudou/);
});
test('queue requires publication scope but never requires or enables the chatbot; cancelling prevents the worker',async t=>{
 auth(t);const db=seed('draft'),r=routes(db);db.data.get('instagramConnections/flow').grantedPermissions=[];
 let res=response();await r['POST /api/instagram/studio/posts/:postId/queue'](req({publishNow:true}),res);assert.equal(res.code,400);
 db.data.get('instagramConnections/flow').grantedPermissions=[PUBLISH_SCOPE];res=response();await r['POST /api/instagram/studio/posts/:postId/queue'](req({publishNow:true}),res);assert.equal(res.code,200);assert.equal(db.data.get('instagramConnections/flow').enabled,false);
 res=response();await r['POST /api/instagram/studio/posts/:postId/cancel'](req(),res);assert.equal(res.code,200);await runInstagramPublication(db,'post',async()=>assert.fail('cancelled'));assert.equal(db.data.get('instagramPublications/post').status,'cancelled');
});
test('scheduled post prepares, polls and publishes once, stores a disabled campaign, and never sends a DM',async()=>{
 const db=seed(),calls=[];const graph=async(path,token,method,body)=>{calls.push({path,method,body});if(path.endsWith('/media'))return {id:'888888'};if(path.includes('status_code'))return {status_code:'FINISHED'};if(path.endsWith('/media_publish'))return {id:'999999'};assert.fail(path);};
 await runInstagramPublication(db,'post',graph);assert.equal(db.data.get('instagramPublications/post').status,'processing');
 db.data.get('instagramPublications/post').nextRunAt=past();await runInstagramPublication(db,'post',graph);assert.equal(db.data.get('instagramPublications/post').status,'ready');
 db.data.get('instagramPublications/post').nextRunAt=past();await runInstagramPublication(db,'post',graph);await runInstagramPublication(db,'post',graph);
 assert.equal(calls.filter(v=>v.path.endsWith('media_publish')).length,1);assert.equal(db.data.get('instagramPublications/post').status,'published');assert.equal(db.data.get('automotiveOperations/flow/instagram/acquisition').campaigns[0].enabled,false);assert.equal(db.data.get('instagramConnections/flow').enabled,false);assert.equal(db.data.get('automotiveOperations/flow/instagram/acquisition').enabled,false);
});
test('carousel makes child containers before its parent and preserves their order',async()=>{
 const db=seed();Object.assign(db.data.get('instagramPublications/post'),{format:'CAROUSEL',media:['https://example.com/1.jpg','https://example.com/2.jpg']});let n=0;const calls=[];
 await runInstagramPublication(db,'post',async(path,token,method,body)=>{calls.push(body);return {id:String(100000+ ++n)};});assert.equal(calls.length,3);assert.equal(calls[0].is_carousel_item,true);assert.deepEqual(calls[2].children,['100001','100002']);assert.equal(calls[2].media_type,'CAROUSEL');
});
test('ambiguous publish errors and abandoned publishing leases cannot cause retries',async()=>{
 for(const kind of ['timeout','abandoned']){const db=seed(kind==='abandoned'?'publishing':'ready');let sends=0;await runInstagramPublication(db,'post',async()=>{sends++;throw Error('timeout');});await runInstagramPublication(db,'post',async()=>assert.fail('retry'));assert.equal(sends,kind==='abandoned'?0:1);assert.equal(db.data.get('instagramPublications/post').status,'needs_review');}
});
test('worker refuses changed accounts, expired tokens, revoked scope and inactive linked products',async()=>{
 for(const kind of ['account','expired','scope','product']){const db=seed('ready'),c=db.data.get('instagramConnections/flow');if(kind==='account')c.accountId='999999';if(kind==='expired')c.expiresAt='2000-01-01';if(kind==='scope')c.grantedPermissions=[];if(kind==='product')db.data.get('instagramPublications/post').productId='missing';await runInstagramPublication(db,'post',async()=>assert.fail(kind));assert.equal(db.data.get('instagramPublications/post').status,'failed',kind);}
});
test('a ready container waits until scheduled time; active leases and future jobs cannot be taken',async()=>{
 const db=seed('ready');db.data.get('instagramPublications/post').scheduledAt=new Date(Date.now()+600000).toISOString();await runInstagramPublication(db,'post',async()=>assert.fail('early'));assert.equal(db.data.get('instagramPublications/post').status,'ready');await runInstagramStudioQueue(db,async()=>assert.fail('future'));
 db.data.get('instagramPublications/post').nextRunAt=past();db.data.get('instagramPublications/post').leaseUntil=Date.now()+60000;await runInstagramPublication(db,'post',async()=>assert.fail('leased'));
});
test('cancellation or account change immediately before publish cannot send',async()=>{
 const db=seed('ready');const original=db.runTransaction;let count=0;db.runTransaction=async cb=>{count++;if(count===2)db.data.get('instagramPublications/post').status='cancelled';return original(cb);};await runInstagramPublication(db,'post',async()=>assert.fail('cancel race'));assert.equal(db.data.get('instagramPublications/post').status,'cancelled');
});
test('metrics sync gracefully shows unsupported metrics and queries only the connected account',async t=>{
 auth(t);const db=seed('draft'),calls=[];const r=routes(db,async(path)=>{calls.push(path);if(path.includes('/media?'))return {data:[{id:'555555',caption:'Projeto',like_count:0,comments_count:2}]};if(path.includes('metric=views'))return {data:[{total_value:{value:10}}]};throw Error('unsupported');});
 let res=response();await r['POST /api/instagram/studio/metrics'](req(),res);assert.equal(res.code,200);assert.equal(res.body.analytics.media[0].metrics.likes,0);assert.equal(res.body.analytics.media[0].metrics.reach,null);assert.equal(res.body.analytics.media[0].metrics.views,10);assert.equal(res.body.analytics.account.reach,null);
 res=response();await r['POST /api/instagram/studio/metrics'](req(),res);assert.equal(res.code,400);
});
test('without insights grant only basic post counters are read',async t=>{
 auth(t);const db=seed();db.data.get('instagramConnections/flow').grantedPermissions=[];const r=routes(db,async(path)=>{assert.match(path,/\/media\?/);return {data:[{id:'555555',like_count:4}]};});const res=response();await r['POST /api/instagram/studio/metrics'](req(),res);assert.equal(res.code,200);assert.equal(res.body.analytics.media[0].metrics.reach,null);assert.equal(res.body.analytics.insightsAuthorized,false);
});
test('CRM attribution isolates the account, counts first touch once per contact and keeps currencies separate',()=>{
 const chats=[{customerPhone:'ig_1',instagramAccountId:'123',firstInstagramAcquisition:{mediaId:'111',accountId:'123'},instagramAcquisition:{mediaId:'222'}},{customerPhone:'ig_2',instagramAccountId:'999',instagramAcquisition:{mediaId:'111'}}];
 const projects=[{phone:'ig_1',channel:'instagram',status:'Aprovado',quoteValue:100,currency:'BRL'},{phone:'ig_1',channel:'instagram',status:'Concluído',quoteValue:20,currency:'USD'},{phone:'ig_1',channel:'whatsapp',status:'Aprovado',quoteValue:999},{phone:'ig_2',channel:'instagram',status:'Aprovado',quoteValue:999}];
 assert.deepEqual(studioFunnel(chats,projects,'123'),[{mediaId:'111',conversations:1,leads:2,quotes:2,sales:2,quotedRevenue:{BRL:100,USD:20}}]);
});

test('content scopes are opt-in, preserve existing grants, and do not break the basic chatbot login',()=>{
 const base=instagramStudioScopes('AUTOMOTIVE_PARTS',[],{});assert.equal(base.includes(PUBLISH_SCOPE),false);assert.equal(base.includes(INSIGHTS_SCOPE),false);assert.equal(base.includes('instagram_business_manage_messages'),true);
 assert.equal(instagramStudioScopes('GENERAL',['publishing'],{}).includes(PUBLISH_SCOPE),true);
 assert.equal(instagramStudioScopes('FASHION',['insights'],{}).includes(INSIGHTS_SCOPE),true);
 assert.equal(instagramStudioScopes('AFFILIATES',[],{}).includes(PUBLISH_SCOPE),true);
 assert.deepEqual(instagramStudioScopes('GENERAL',[],{grantedPermissions:[PUBLISH_SCOPE,INSIGHTS_SCOPE]}),[...base,PUBLISH_SCOPE,INSIGHTS_SCOPE]);
});
test('metrics cannot be saved under an Instagram switched while the provider was responding',async t=>{
 auth(t);const db=seed(),r=routes(db,async()=>{db.data.set('instagramConnections/flow',{...db.data.get('instagramConnections/flow'),accountId:'999999'});return {data:[]};});const res=response();await r['POST /api/instagram/studio/metrics'](req(),res);assert.equal(res.code,400);assert.equal(db.data.get('instagramWorkspaces/flow').analytics,undefined);
});
test('foreign drafts and products cannot be modified or scheduled by the current owner',async t=>{
 auth(t);const db=seed('draft'),r=routes(db);db.data.get('instagramPublications/post').storeId='other';let res=response();await r['POST /api/instagram/studio/posts/:postId/queue'](req({publishNow:true}),res);assert.equal(res.code,400);
 res=response();await r['POST /api/instagram/studio/posts'](req({...content,id:'post',updatedAt:'v1'}),res);assert.equal(res.code,400);
 db.data.set('establishments/other/products/product',{name:'Foreign kit',available:true});res=response();await r['POST /api/instagram/studio/posts'](req({...content,productId:'product'}),res);assert.equal(res.code,400);
});

test('database preparation failures expose a useful retry message without internal index details',async t=>{
 auth(t);const db=seed(),original=db.collection;db.collection=name=>name==='instagramPublications'?{where:()=>({orderBy:()=>({limit:()=>({get:async()=>{throw Object.assign(Error('private index details'),{code:9});}})})})}:original(name);const r=routes(db),res=response();await r['GET /api/instagram/studio'](req(),res);assert.equal(res.code,400);assert.match(res.body.error,/preparada/);assert.doesNotMatch(res.body.error,/private|index/);
});

test('home summary uses only the current account snapshot, hides disconnected accounts and never calls Meta',async t=>{
 auth(t);const db=seed(),r=routes(db);db.data.set('instagramWorkspaces/flow',{accountId:'123456',syncId:'private',analytics:{syncedAt:'2026-11-01T12:00:00Z',account:{views:0,reach:null},media:[{id:'555555',caption:'Project',thumbnail:'https://example.com/a.jpg',metrics:{likes:2,comments:1}},{id:'666666',caption:'Other project',metrics:{likes:null,comments:0}}]}});
 let res=response();await r['GET /api/instagram/studio/summary'](req(),res);assert.equal(res.code,200);assert.equal(res.body.views,0);assert.equal(res.body.reach,null);assert.equal(res.body.likes,2);assert.equal(res.body.comments,1);assert.equal(res.body.media.length,2);assert.equal(res.body.enabled,false);assert.doesNotMatch(JSON.stringify(res.body),/test-token|accessToken|syncId|private/);
 db.data.get('instagramWorkspaces/flow').accountId='999999';res=response();await r['GET /api/instagram/studio/summary'](req(),res);assert.equal(res.body.syncedAt,null);assert.equal(res.body.views,null);assert.equal(res.body.likes,null);assert.deepEqual(res.body.media,[]);
 db.data.get('instagramConnections/flow').connected=false;res=response();await r['GET /api/instagram/studio/summary'](req(),res);assert.deepEqual(res.body,{connected:false});
 res=response();await r['GET /api/instagram/studio/summary'](req({},'other'),res);assert.equal(res.code,403);
});
