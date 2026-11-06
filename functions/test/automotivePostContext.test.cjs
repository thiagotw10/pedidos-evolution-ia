const {test}=require('node:test'),assert=require('node:assert/strict');
const {automotiveOriginPost,automotivePostTurn,automotivePostInstructions,matchAutomotivePost}=require('../lib/automotivePostContext');const {groundedInstagram}=require('../lib/groundedInstagram');
const products=[{id:'titanium',name:'Porsche 911 992.2 Catback Titanium',category:'Porsche',imageUrl:'https://cdn.test/titanium.jpg',videoUrl:'https://cdn.test/titanium.mp4',automotiveSpecs:{brand:'Porsche',model:'911',generation:'992.2',material:'Titanium',configuration:'Catback',validation:'reference'}},{id:'inox',name:'Porsche 911 992.2 Catback Inox',category:'Porsche',imageUrl:'https://cdn.test/inox.jpg'},{id:'event',name:'Evento Porsche 911',imageUrl:'https://cdn.test/event.jpg'}];
const source={kind:'instagram_comment',accountId:'123456',mediaId:'987654',productId:'titanium',caption:'Porsche 911 992.2 Catback Titanium',comment:'Serve no meu carro?',capturedAt:'2025-01-01'};
test('performance source preserves historic reference but never declares it the customer vehicle or commercial terms',()=>{
 const origin=automotiveOriginPost({...source,accessToken:'secret',customerPhone:'private'},products,'123456');assert.equal(origin.comment,source.comment);assert.equal(origin.currentReferences[0].validation,'reference');assert.equal(origin.visualAnalysis,'not_performed');assert.doesNotMatch(JSON.stringify(origin),/secret|private|price|customerVehicle/);assert.match(automotivePostInstructions(origin),/NÃO é o veículo do cliente/);assert.match(automotivePostInstructions(origin),/não comprova compatibilidade/);assert.equal(automotiveOriginPost(source,products,'other'),null);
});
test('post media uses configured reference without rewriting customer data or unrelated catalogue memory',()=>{
 const origin=automotiveOriginPost(source,products,'123456'),previous={selectedIds:['inox'],query:'inox',audience:'self'};
 const turn=automotivePostTurn('Quero fotos desse projeto do anúncio',origin,previous);assert.deepEqual(turn.memory.selectedIds,['titanium']);assert.deepEqual(previous.selectedIds,['inox']);const result=groundedInstagram('Quero fotos desse projeto do anúncio',products,{},'store',turn.memory);assert.equal(result.mediaList[0].url,products[0].imageUrl);assert.doesNotMatch(result.replyText,/compatível|reserva confirmada/i);
 for(const text of ['Como anda meu projeto?','Quero mostrar outros projetos para um amigo','Meu carro é um Golf 2019'])assert.equal(automotivePostTurn(text,origin,previous).memory,previous);
});
test('unbound posts require a unique catalogue reference and removed or ambiguous references cannot send arbitrary projects',()=>{
 assert.deepEqual(matchAutomotivePost(source.caption,products).productIds,['titanium']);
 const ambiguous=automotiveOriginPost({...source,productId:'',caption:'Porsche 911 992.2 Catback'},products,'123456');assert.equal(ambiguous.match,'ambiguous');assert.ok(automotivePostTurn('Quero ver fotos do anúncio',ambiguous,{}).reply);
 const removed=automotiveOriginPost({...source,productId:'removed'},products,'123456');assert.equal(removed.match,'removed');assert.ok(automotivePostTurn('Quero ouvir o ronco desse projeto',removed,{}).reply);
});
