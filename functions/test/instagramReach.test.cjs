const {test}=require('node:test');const assert=require('node:assert/strict');const admin=require('firebase-admin');
const {explicitLeadLocation,resolveLeadLocation,safeLeadLocation,postalLeadLocation,saveLeadLocation,captureExplicitLeadLocation}=require('../lib/instagramLeadGeo');
const {reachRows,registerInstagramReach}=require('../lib/instagramReach');
function fakeDb(seed={}){
 const data=new Map(Object.entries(structuredClone(seed)));
 const doc=path=>({id:path.split('/').pop(),path,get:async()=>({exists:data.has(path),data:()=>data.get(path)}),set:async(v,o)=>data.set(path,o?.merge?{...data.get(path),...v}:v),update:async v=>data.set(path,{...data.get(path),...v}),collection:n=>col(`${path}/${n}`)});
 const field=(v,k)=>k.split('.').reduce((a,k)=>a?.[k],v);
 const col=(path,filters=[],max=10000)=>({doc:id=>doc(`${path}/${id}`),where:(k,op,v)=>col(path,[...filters,[k,v]],max),limit:n=>col(path,filters,n),get:async()=>({docs:[...data].filter(([k,v])=>k.startsWith(path+'/')&&!k.slice(path.length+1).includes('/')&&filters.every(([key,w])=>field(v,key)===w)).slice(0,max).map(([k,v])=>({id:k.split('/').pop(),ref:doc(k),data:()=>v}))})});
 return {data,collection:col,runTransaction:async cb=>cb({get:r=>r.get(),set:(r,v,o)=>r.set(v,o),update:(r,v)=>r.update(v)})};
}
const at='2026-11-01T12:00:00.000Z',chat={id:'ig_123',instagramAccountId:'999',channel:'instagram',customerName:'Ana',lastInboundAt:at,firstInstagramInboundAt:at};
const source={accountId:'999',kind:'instagram_comment',mediaId:'555555',caption:'Projeto Golf',capturedAt:at,paidDeclaredByOwner:true};
const response=()=>({code:200,set(){return this},status(code){this.code=code;return this},json(body){this.body=body;return this}});
const request=(body={},id='flow')=>({headers:{authorization:'Bearer valid'},query:{establishmentId:id},params:{contactId:'ig_123'},body});
function routes(db){const r={};registerInstagramReach({get:(p,f)=>r['GET '+p]=f,post:(p,f)=>r['POST '+p]=f},db);return r;}
function auth(t){if(!admin.apps.length)admin.initializeApp({projectId:'reach-tests'});t.mock.method(admin.auth(),'verifyIdToken',async token=>{if(token==='valid')return {uid:'flow'};throw Error();});}
const seed=()=>fakeDb({'instagramConnections/flow':{connected:true,accountId:'999',accessToken:'secret'},'establishments/flow/chats/ig_123':{...chat,firstInstagramAcquisition:source},'establishments/flow/chats/ig_456':{...chat,instagramAccountId:'other',customerName:'Other account'},'automotive_projects/p':{establishmentId:'flow',phone:'ig_123',channel:'instagram',status:'Orçamento enviado',quoteValue:2000,shippingAddress:{confirmed:true,source:'ViaCEP',city:'Recife',state:'PE',street:'Private street',number:'123',cep:'50000000',lookedUpAt:at}},'automotive_projects/foreign':{establishmentId:'other',phone:'ig_123',channel:'instagram',status:'Aprovado',quoteValue:999999}});

test('explicit locations recognize real municipalities, ambiguous cities stay unknown and unrelated text cannot geolocate a lead',()=>{
 for(const text of ['Sou de Recife/PE','Recife PE','Moro em São Paulo, SP'])assert.equal(explicitLeadLocation(text).precision,'city');
 assert.equal(explicitLeadLocation('sou de Recife').state,'PE');
 for(const text of ['Sou de Bom Jesus','quero visitar Recife/PE','qual o endereço da loja?','BR','PT','Porsche 911','meu número é 5581999999999','Recife PE é o endereço da loja'])assert.equal(explicitLeadLocation(text),null,text);
 assert.equal(explicitLeadLocation('Moro em Lisboa, Portugal').precision,'country');assert.equal(explicitLeadLocation('Moro em Lisboa, Portugal').country,'PT');
 assert.equal(explicitLeadLocation('sou de Portugal').city,'');
});
test('location normalization validates country/state/city and never trusts supplied coordinates',()=>{
 const result=resolveLeadLocation({country:'BR',state:'PE',city:'recife',lat:80,lng:150},'owner_confirmed',at);assert.equal(result.city,'Recife');assert.ok(result.lat<0&&result.lng<0);assert.equal(result.cityId,'2611606');
 assert.throws(()=>resolveLeadLocation({country:'BR',state:'SP',city:'Recife'},'owner_confirmed'));
 assert.throws(()=>resolveLeadLocation({country:'ZZ',city:'Imaginary'},'owner_confirmed'));
 assert.equal(safeLeadLocation({...result,source:'language_inference'}),null);
 const pt=resolveLeadLocation({country:'PT',city:'Porto'},'owner_confirmed');assert.equal(pt.precision,'country');assert.equal(pt.city,'Porto');assert.throws(()=>resolveLeadLocation({country:'PT',city:'<img onerror=alert(1)>'},'owner_confirmed'));
});
test('a default CRM country, unconfirmed CEP or post location never becomes a geographic fact',()=>{
 let rows=reachRows([{...chat,country:'BR',city:'Recife',firstInstagramAcquisition:{...source,location:{city:'Recife'}}}],[{phone:'ig_123',channel:'instagram',country:'BR',shippingAddress:{city:'Recife',state:'PE',confirmed:false,source:'ViaCEP'}}],'999');assert.equal(rows[0].location,null);
 assert.equal(postalLeadLocation({confirmed:true,source:'manual',city:'Recife',state:'PE'}),null);assert.equal(postalLeadLocation({confirmed:true,source:'ViaCEP',city:'Recife',state:'PE'}).city,'Recife');
});
test('one contact counts once, active project wins, stale accounts and other channel projects cannot enter the funnel',()=>{
 const rows=reachRows([{...chat,firstInstagramAcquisition:source,instagramAcquisition:{...source,mediaId:'666666'},projectId:'active'},{...chat,id:'ig_456',instagramAccountId:'other'}],[{id:'old',phone:'ig_123',channel:'instagram',status:'Concluído',updatedAt:'2026-12-01'},{id:'active',phone:'ig_123',channel:'instagram',status:'Orçamento enviado',updatedAt:at},{id:'wa',phone:'ig_123',channel:'whatsapp',status:'Aprovado'}],'999');assert.equal(rows.length,1);assert.equal(rows[0].source.mediaId,'555555');assert.equal(rows[0].stage,'quote');assert.equal(rows[0].source.kind,'instagram_comment');assert.equal(rows[0].source.paidDeclared,true);
});
test('commercial interest whose private reply failed is retained, while ignored comments do not create leads',()=>{
 const c={id:'ig_123',instagramAccountId:'999'};const event={contactId:'ig_123',source,status:'failed'};
 assert.equal(reachRows([c],[],'999',[event]).length,1);assert.equal(reachRows([c],[],'999',[event])[0].source.mediaId,'555555');assert.deepEqual(reachRows([c],[],'999',[{...event,status:'ignored'}]),[]);assert.deepEqual(reachRows([c],[],'999',[{...event,source:{...source,accountId:'other'}}]),[]);
});
test('automatic location capture is idempotent and cannot overwrite newer facts or a different account',async()=>{
 const db=seed();await captureExplicitLeadLocation(db,'flow','ig_123','Sou de Recife/PE','999',Date.parse(at));assert.equal(db.data.get('establishments/flow/chats/ig_123').leadLocation.city,'Recife');
 await captureExplicitLeadLocation(db,'flow','ig_123','Sou de São Paulo/SP','999',Date.parse(at)-1000);assert.equal(db.data.get('establishments/flow/chats/ig_123').leadLocation.city,'Recife');await captureExplicitLeadLocation(db,'flow','ig_123','Sou de São Paulo/SP','other',Date.parse(at)+1000);assert.equal(db.data.get('establishments/flow/chats/ig_123').leadLocation.city,'Recife');
});
test('reach API isolates the company/account, avoids leaking addresses/tokens, and rejects foreign writes',async t=>{
 auth(t);const db=seed(),r=routes(db);let res=response();await r['GET /api/instagram/reach']({...request(),headers:{}},res);assert.equal(res.code,401);res=response();await r['GET /api/instagram/reach'](request({},'other'),res);assert.equal(res.code,403);
 res=response();await r['GET /api/instagram/reach'](request(),res);assert.equal(res.code,200);assert.equal(res.body.leads.length,1);assert.equal(res.body.leads[0].stage,'quote');assert.equal(res.body.leads[0].location.city,'Recife');assert.doesNotMatch(JSON.stringify(res.body),/Private street|50000000|secret|accessToken|999999/);
 res=response();await r['POST /api/instagram/reach/:contactId/location']({...request({country:'BR',city:'Recife',state:'PE',confirmed:true}),params:{contactId:'ig_456'}},res);assert.equal(res.code,400);
});
test('manual geographic confirmation requires confirmation and optimistic version; cities are canonical',async t=>{
 auth(t);const db=seed(),r=routes(db),path='POST /api/instagram/reach/:contactId/location';let res=response();await r[path](request({country:'BR',state:'PE',city:'Recife'}),res);assert.equal(res.code,400);
 res=response();await r[path](request({country:'BR',state:'PE',city:'recife',confirmed:true,expectedUpdatedAt:''}),res);assert.equal(res.code,200);assert.equal(res.body.location.city,'Recife');assert.equal(res.body.location.source,'owner_confirmed');
 res=response();await r[path](request({country:'BR',state:'SP',city:'São Paulo',confirmed:true,expectedUpdatedAt:''}),res);assert.equal(res.code,400);assert.equal(db.data.get('establishments/flow/chats/ig_123').leadLocation.city,'Recife');
 res=response();await r['GET /api/instagram/reach/cities']({...request(),query:{establishmentId:'flow',state:'PE',q:'reci'}},res);assert.equal(res.body.cities[0].name,'Recife');
});
test('disconnected Instagram exposes no prior account data',async t=>{auth(t);const db=seed();db.data.get('instagramConnections/flow').connected=false;const r=routes(db),res=response();await r['GET /api/instagram/reach'](request(),res);assert.deepEqual(res.body,{connected:false,leads:[],media:[]});});
