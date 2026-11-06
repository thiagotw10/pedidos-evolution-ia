const {test} = require('node:test');
const assert = require('node:assert/strict');
const {groundedInstagram: run, storeWebsite} = require('../lib/groundedInstagram');
const store = {publicSlug:'flow-garage-exhaust-ZFFWU',address:'Endereço real', operatingHours:'08–18',phone:'81983220017'};
const products = [
 {id:'p1',name:'Porsche 911 992.2 Titanium', images:['https://cdn/1','https://cdn/2','https://cdn/3','https://cdn/4','https://cdn/5'],videoUrl:'https://cdn/video'},
 {id:'p2',name:'Porsche 911 992.1 Inox',imageUrl:'https://cdn/b'},
 {id:'p3',name:'BMW M',imageUrl:'https://cdn/c'},
 {id:'p4',name:'Corvette',imageUrl:'https://cdn/d'},
 {id:'p5',name:'Evento de carros',imageUrl:'https://cdn/e'}
];
const call=(text,memory={})=>run(text,products,store,'store',memory);
test('lists actual projects then other projects without repeats or events',()=>{
 const first=call('quais projetos vocês têm?'); const next=call('outros', first.memory);
 assert.deepEqual(first.memory.selectedIds,['p1','p2','p3']); assert.deepEqual(next.memory.selectedIds,['p4']);
 assert.match(call('outros', next.memory).replyText,/todas as referências/);
});
test('never substitutes 992 for requested 991',()=>{
 const reply=call('manda fotos Porsche 911 991');assert.equal(reply.mediaList.length,0);assert.match(reply.replyText,/Não encontrei/);
});
test('photos need no qualification and single images array works',()=>{
 const reply=call('fotos Porsche 992.2');assert.equal(reply.mediaList.length,4);assert.doesNotMatch(reply.replyText,/CEP|ano|versão/);
});
test('selected video only sends actual video, no substituted photos',()=>{
 const first=call('Porsche 992.2');const video=call('vídeo desse',first.memory);
 assert.equal(video.mediaList.length,1);assert.equal(video.mediaList[0].type,'video');
 assert.equal(call('vídeo',video.memory).mediaList.length,0);
 assert.equal(call('envia de novo o vídeo',video.memory).mediaList.length,1);
});
test('more photos continues remaining media, both kinds includes video',()=>{
 const first=call('fotos Porsche 992.2'); const next=call('mais fotos desse',first.memory);
 assert.deepEqual(next.mediaList.map(m=>m.url),['https://cdn/5']);
 assert.ok(call('fotos e vídeos Porsche 992.2').mediaList.some(m=>m.type==='video'));
});
test('ordinal selection, unavailable video and current registered business facts',()=>{
 const first=call('quais projetos?');const second=call('2',first.memory);
 assert.deepEqual(second.memory.selectedIds,['p2']); assert.equal(call('video',second.memory).mediaList.length,0);
 const facts=call('site e endereço e horário e telefone');assert.match(facts.replyText,/Endereço real/);assert.match(facts.replyText,/08–18/);assert.match(facts.replyText,/81983220017/);assert.match(facts.replyText,/flow-garage-exhaust-ZFFWU/);
 assert.equal(storeWebsite({website:'https://flow.example'},'s'),'https://flow.example');
});
test('budget questions stay with conversational engine; exhausted model offers different models',()=>{
 assert.equal(call('qual valor do projeto?'),null);
 const first=call('Porsche 992.2'); const next=call('outros',first.memory);assert.ok(!next.memory.selectedIds.includes('p1'));
});

test('personal address and contact questions bypass store facts to preserve conversation memory',()=>{
 for(const text of ['Olhei sim, tudo certo, eu ja te passei meu endereço?','Estou perguntando se passei meu endereço pra voce','Ja passei meu endereço?','Qual endereço de entrega eu informei?','O endereço que te passei está certo?','Você tem meu telefone?'])assert.equal(call(text),null,text);
 for(const text of ['Qual é o endereço da loja?','Qual seu endereço?','Onde fica a oficina?'])assert.match(call(text).replyText,/Ficamos na Endereço real/);
});
test('friend browsing clears the owner filter and acceptance carries the sharing goal without qualification',()=>{
 const stale={query:'2020',shownIds:['p1','p2','p3','p4'],selectedIds:['p1'],mediaUrls:['https://cdn/1']};
 const offer=call('Além disso poderia me informar outros projetos, estou querendo mostrar pra um amigo aqui',stale);
 assert.equal(offer.memory.audience,'friend');assert.equal(offer.memory.query,'');assert.equal(offer.memory.pendingAction,'resend');assert.match(offer.replyText,/compartilhar com seu amigo/);
 const accepted=call('Pode mandar',offer.memory);assert.ok(accepted.mediaList.length>0);assert.ok(accepted.mediaList.length<=3);assert.match(accepted.replyText,/amigo/);assert.doesNotMatch(accepted.replyText,/qual.*(?:modelo|ano|versão)|seu carro|orçamento/i);assert.equal(accepted.memory.pendingAction,null);
 assert.ok(accepted.mediaList.every(m=>!m.url.includes('/e')),'events are not exhaust references');
});
test('pending catalog consent is invalidated by a different question while friend topic remains',()=>{
 const {catalogMemoryForTurn}=require('../lib/groundedInstagram');const offer=call('outros projetos para meu amigo',{shownIds:['p1','p2','p3','p4']});
 const same=catalogMemoryForTurn(offer.memory,[{sender:'user',text:'quero mostrar para meu amigo'},{sender:'assistant',text:offer.replyText}]);assert.equal(same.pendingAction,'resend');
 const different=catalogMemoryForTurn(offer.memory,[{sender:'user',text:'quero mostrar para meu amigo'},{sender:'assistant',text:'Você confirma o endereço?'}]);assert.equal(different.pendingAction,null);assert.equal(different.audience,'friend');assert.equal(call('Sim',different),null);
 const recovered=catalogMemoryForTurn({query:'2020'},[{sender:'user',text:'Quero mostrar outros projetos para um amigo'},{sender:'assistant',text:'Estas são referências. Qual o modelo do seu carro?'}]);assert.equal(recovered.audience,'friend');
});
test('technical follow-up and reputation questions do not become catalog lists',()=>{for(const text of ['Ele foi feito em Titanium?','Vocês são referência?','Me fala se é manufaturado por vocês ou marcas de prateleira','Manda detalhes dessa']){assert.equal(call(text,{selectedIds:['p1']}),null,text);}});
test('custom fabrication continues vehicle qualification and offers real parts on missing project',()=>{
 const custom={segment:'AUTOMOTIVE_PARTS',automotiveBusinessFacts:{customBuildVerified:true}};
 const parts=[{id:'t',catalogKind:'exhaust_product',name:'Conjunto titânio',imageUrl:'https://cdn/t'}];
 assert.equal(run('porshe',parts,custom,'s'),null);
 assert.equal(run('porsche 911 carrera',parts,custom,'s'),null);
 const missing=run('fotos de projetos Porsche 991',parts,custom,'s');
 assert.match(missing.replyText,/sob medida/);assert.match(missing.replyText,/Conjunto titânio/);assert.equal(missing.mediaList.length,0);
 const accepted=run('pode mandar',parts,custom,'s',missing.memory);assert.equal(accepted.mediaList[0].url,'https://cdn/t');
 assert.doesNotMatch(run('fotos Porsche 991',parts,{segment:'AUTOMOTIVE_PARTS'},'s').replyText,/sob medida/);
});
