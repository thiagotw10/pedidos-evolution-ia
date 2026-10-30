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
