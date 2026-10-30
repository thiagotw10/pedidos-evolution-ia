const {test}=require('node:test');
const assert=require('node:assert/strict');
const admin=require('firebase-admin');
const {validateAffiliateProduct,affiliateKeywords,matchesAffiliateKeyword,affiliateCaption,extractAffiliateComments,processAffiliateComment,affiliateDirectReply,registerAffiliateRoutes}=require('../lib/affiliate');
function fakeDb(seed={}) {
 const data=new Map(Object.entries(seed));let n=0;
 const doc=path=>({id:path.split('/').pop(),path,get:async()=>({exists:data.has(path),data:()=>data.get(path)}),set:async(v,o)=>data.set(path,o?.merge?{...data.get(path),...v}:v),update:async v=>data.set(path,{...data.get(path),...v}),collection:name=>col(`${path}/${name}`)});
 const col=(path,filters=[])=>({doc:id=>doc(`${path}/${id||`auto${++n}`}`),add:async v=>{const d=doc(`${path}/auto${++n}`);await d.set(v);return d;},where:(key,op,v)=>col(path,[...filters,[key,v]]),limit:()=>col(path,filters),get:async()=>({docs:[...data].filter(([k,v])=>k.startsWith(path+'/')&&!k.slice(path.length+1).includes('/')&&filters.every(([key,wanted])=>v[key]===wanted)).map(([k,v])=>({ref:doc(k),id:k.split('/').pop(),data:()=>v}))})});
 return {data,collection:col,runTransaction:async cb=>cb({get:ref=>ref.get(),set:(ref,v,o)=>ref.set(v,o),update:(ref,v)=>ref.update(v)})};
}
const product={name:'Organizador de cozinha',affiliateUrl:'https://s.shopee.com.br/teste',active:true,description:'Três divisórias',videoUrl:'https://example.com/video.mp4',mediaAuthorized:true};
const seeded=()=>fakeDb({
 'establishments/isa':{segment:'AFFILIATES'},
 'instagramConnections/isa':{connected:true,affiliatePermissions:true,accountId:'123',accessToken:'test-token',expiresAt:'2099-01-01'},
 'affiliateWorkspaces/isa/products/p':{...product},
 'affiliateWorkspaces/isa/posts/reel':{productId:'p',mediaId:'456',status:'published',accountId:'123',keywords:['quero'],automationEnabled:true},
 'instagramEvents/comment':{kind:'affiliate_comment',accountId:'123',senderId:'789',storeId:'isa',mediaId:'456',mid:'comment1',text:'QUERO!',timestamp:Date.now(),status:'pending'}
});
const response=()=>({code:200,status(c){this.code=c;return this},json(v){this.body=v;return this}});
function routes(db,graph=async()=>assert.fail('No provider call expected')) {const r={};registerAffiliateRoutes({get:(p,f)=>r['GET '+p]=f,post:(p,f)=>r['POST '+p]=f},db,graph);return r;}

test('affiliate links, prices and media must be valid; long links cannot break private replies',()=>{
 assert.throws(()=>validateAffiliateProduct({...product,affiliateUrl:'javascript:alert(1)'}));
 assert.throws(()=>validateAffiliateProduct({...product,videoUrl:'http://localhost/private'}));
 assert.throws(()=>validateAffiliateProduct({...product,price:-1}));
 assert.throws(()=>validateAffiliateProduct({...product,affiliateUrl:'https://example.com/'+ 'x'.repeat(501)}));
 assert.equal(validateAffiliateProduct(product).price,null);
 assert.equal(validateAffiliateProduct({...product,mediaAuthorized:'true'}).mediaAuthorized,false);
});
test('keywords match words and accents without matching unrelated substrings',()=>{
 assert.deepEqual(affiliateKeywords('Quero, link, QUERO'),['quero','link']);
 assert.equal(matchesAffiliateKeyword('Eu QUERO!!',['quero']),true);
 assert.equal(matchesAffiliateKeyword('coração',['coracao']),true);
 assert.equal(matchesAffiliateKeyword('requero outra coisa',['quero']),false);
 assert.equal(matchesAffiliateKeyword('olá',[]),false);
 assert.match(affiliateCaption(product,'quero'),/comissão/);
 assert.doesNotMatch(affiliateCaption(product,'quero'),/R\$/);
});
test('comment webhook extraction ignores DMs and malformed events',()=>{
 const body={object:'instagram',entry:[{id:'123',time:100,changes:[{field:'comments',value:{id:'c',from:{id:'789'},media:{id:'456'},text:'quero'}},{field:'comments',value:null},{field:'messages',value:{}}]}]};
 const result=extractAffiliateComments(body);assert.equal(result.length,1);assert.equal(result[0].accountId,'123');assert.equal(result[0].timestamp,100000);
});
test('comment sends the exact linked product once; private reply never opens normal DM window',async()=>{
 const db=seeded(),calls=[];const graph=async(...args)=>{calls.push(args);return {message_id:'sent'};};
 await processAffiliateComment(db,'comment',graph);await processAffiliateComment(db,'comment',graph);
 assert.equal(calls.length,1);assert.deepEqual(calls[0][3].recipient,{comment_id:'comment1'});assert.match(calls[0][3].message.text,/s\.shopee\.com\.br\/teste/);
 assert.equal(db.data.get('establishments/isa/chats/ig_789').lastInboundAt,undefined);
 assert.equal(db.data.get('establishments/isa/chats/ig_789').affiliateProductId,'p');
});
test('automotive, disabled automations, mismatched Instagram accounts and stale comments cannot send',async()=>{
 for(const scenario of ['automotive','disabled','wrong-account','expired','paused','inactive-product','no-keyword']) {
  const db=seeded();
  if(scenario==='automotive')db.data.get('establishments/isa').segment='AUTOMOTIVE_PARTS';
  if(scenario==='disabled')db.data.get('affiliateWorkspaces/isa/posts/reel').automationEnabled=false;
  if(scenario==='wrong-account')db.data.get('instagramEvents/comment').accountId='999';
  if(scenario==='expired')db.data.get('instagramEvents/comment').timestamp=Date.now()-8*86400000;
  if(scenario==='paused')db.data.set('establishments/isa/chats/ig_789',{aiPaused:true});
  if(scenario==='inactive-product')db.data.get('affiliateWorkspaces/isa/products/p').active=false;
  if(scenario==='no-keyword')db.data.get('instagramEvents/comment').text='lindo!';
  await processAffiliateComment(db,'comment',async()=>assert.fail(scenario));
  assert.equal(db.data.get('instagramEvents/comment').status,'ignored',scenario);
 }
});
test('ambiguous private reply failures are not retried and show an error on the Reel',async()=>{
 const db=seeded();let calls=0;const graph=async()=>{calls++;throw new Error('timeout');};
 await processAffiliateComment(db,'comment',graph);await processAffiliateComment(db,'comment',graph);
 assert.equal(calls,1);assert.equal(db.data.get('instagramEvents/comment').status,'failed');assert.match(db.data.get('affiliateWorkspaces/isa/posts/reel').lastError,/não confirmada/);
});
test('Direct uses the product from comment context and asks when ambiguous; cannot promise delivery or another store link',async()=>{
 const db=seeded();db.data.set('establishments/isa/chats/ig_789',{affiliateProductId:'p'});
 db.data.set('affiliateWorkspaces/flow/products/other',{...product,name:'Escape',affiliateUrl:'https://example.com/flow'});
 let result=await affiliateDirectReply(db,'isa','ig_789','quero o link');assert.match(result.replyText,/s\.shopee/);assert.doesNotMatch(result.replyText,/flow/);
 result=await affiliateDirectReply(db,'isa','ig_789','qual o prazo de entrega?');assert.match(result.replyText,/dependem do vendedor/);assert.doesNotMatch(result.replyText,/dias/);
 result=await affiliateDirectReply(db,'isa','ig_unknown','oi');assert.match(result.replyText,/Qual achadinho/);assert.doesNotMatch(result.replyText,/https:/);
});
test('API rejects unauthenticated callers, cross-tenant access and automotive accounts',async t=>{
 if(!admin.apps.length)admin.initializeApp({projectId:'affiliate-unit-tests'});
 t.mock.method(admin.auth(),'verifyIdToken',async token=>{if(token==='valid')return {uid:'isa'};throw new Error('invalid');});
 const db=seeded(),r=routes(db);
 let res=response();await r['GET /api/affiliate/workspace']({headers:{},query:{establishmentId:'isa'}},res);assert.equal(res.code,401);
 res=response();await r['GET /api/affiliate/workspace']({headers:{authorization:'Bearer valid'},query:{establishmentId:'flow'}},res);assert.equal(res.code,403);
 db.data.get('establishments/isa').segment='AUTOMOTIVE_PARTS';res=response();await r['GET /api/affiliate/workspace']({headers:{authorization:'Bearer valid'},query:{establishmentId:'isa'}},res);assert.equal(res.code,403);
});
test('publishing requires a ready container, correct account, active product and authorized media',async t=>{
 if(!admin.apps.length)admin.initializeApp({projectId:'affiliate-unit-tests'});
 t.mock.method(admin.auth(),'verifyIdToken',async()=>({uid:'isa'}));
 for(const scenario of ['draft','wrong-account','inactive','unauthorized']) {
  const db=seeded(),p=db.data.get('affiliateWorkspaces/isa/posts/reel');p.status='ready';p.containerId='container';
  if(scenario==='draft')p.status='draft';if(scenario==='wrong-account')p.accountId='999';if(scenario==='inactive')db.data.get('affiliateWorkspaces/isa/products/p').active=false;if(scenario==='unauthorized')db.data.get('affiliateWorkspaces/isa/products/p').mediaAuthorized=false;
  const res=response();await routes(db)['POST /api/affiliate/posts/:postId/publish']({headers:{authorization:'Bearer valid'},query:{establishmentId:'isa'},params:{postId:'reel'},body:{}},res);assert.equal(res.code,400,scenario);
 }
});
test('publishing is not repeated after success and does not enable comments automatically',async t=>{
 if(!admin.apps.length)admin.initializeApp({projectId:'affiliate-unit-tests'});
 t.mock.method(admin.auth(),'verifyIdToken',async()=>({uid:'isa'}));
 const db=seeded(),p=db.data.get('affiliateWorkspaces/isa/posts/reel');p.status='ready';p.containerId='container';let calls=0;
 const r=routes(db,async()=>{calls++;return {id:'newmedia'};});const req={headers:{authorization:'Bearer valid'},query:{establishmentId:'isa'},params:{postId:'reel'},body:{}};
 let res=response();await r['POST /api/affiliate/posts/:postId/publish'](req,res);assert.equal(res.code,200);assert.equal(db.data.get('affiliateWorkspaces/isa/posts/reel').automationEnabled,false);
 res=response();await r['POST /api/affiliate/posts/:postId/publish'](req,res);assert.equal(res.code,400);assert.equal(calls,1);
});
