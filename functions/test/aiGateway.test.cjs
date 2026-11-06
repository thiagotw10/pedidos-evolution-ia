const {test}=require('node:test'),assert=require('node:assert/strict');
const {prepareAiGateway,reviewAiReply,localReplyIssue}=require('../lib/aiGateway');
const safe=async()=>({blocked:false,category:'SAFE',confidence:1,durationMs:0});
const triage=async()=>({intent:'CONVERSATION',urgent:false,sentiment:'NEUTRAL',confidence:1,complexity:'MEDIUM',recommendedModel:'deepseek-flash',route:'FLASH_LITE',maxOutputTokens:800,contextBudget:'STANDARD',estimatedInputTokens:10,durationMs:1});
const facts={segment:'AUTOMOTIVE_PARTS',storeAddress:'Rua da Oficina, 75',approvedPrices:[],allowedUrls:['https://example.com/catalogo']};
test('all channels share routing and call input security and triage once',async()=>{
 for(const channel of ['whatsapp','instagram','simulator']){let screened=0,classified=0;const d=await prepareAiGateway('Olá',{segment:'AUTOMOTIVE_PARTS'},channel,false,{screen:async()=>{screened++;return safe()},triage:async(text,ctx)=>{classified++;assert.equal(ctx.channel,channel);return triage()},deepseekAvailable:true});assert.equal(d.model,'deepseek-flash');assert.equal(d.triageSource,'jev');assert.equal(screened,1);assert.equal(classified,1);}
});
test('blocked input never calls routing and missing credentials use the same local fallback',async()=>{
 const blocked=await prepareAiGateway('ataque',{},'instagram',false,{screen:async()=>({blocked:true,category:'PROMPT_INJECTION',confidence:1,durationMs:0}),triage:async()=>assert.fail('must not triage')});assert.equal(blocked.blocked,true);
 const d=await prepareAiGateway('Olá',{},'instagram',false,{screen:safe,triage:async()=>null,deepseekAvailable:false});assert.equal(d.model,'gemini-3.1-flash-lite');assert.equal(d.triageSource,'local');
});
test('media, operational complexity and personal memory questions use the stronger common route',async()=>{
 for(const [text,media] of [['foto',true],['Qual o estoque?',false],['Já passei meu endereço?',false]])assert.equal((await prepareAiGateway(text,{},'instagram',media,{screen:safe,triage,deepseekAvailable:true})).model,'gemini-3.1-flash-lite');
});
test('explicit request for a human survives unavailable or incorrect remote triage',async()=>{
 const d=await prepareAiGateway('Quero falar com um atendente humano',{},'instagram',false,{screen:safe,triage});assert.equal(d.triage.intent,'HUMAN_HELP');assert.equal(d.triage.urgent,true);
});
test('customer address confusion is repaired locally without invoking the judge',async()=>{
 for(const text of ['Olhei sim, eu ja te passei meu endereço?','Estou perguntando se passei meu endereço pra voce','Ja passei meu endereço?']){const r=await reviewAiReply(text,'Ficamos na Rua da Oficina, 75.',facts,{judge:async()=>assert.fail('local first')});assert.equal(r.corrected,true);assert.equal(r.reason,'customer_store_address_confusion');assert.doesNotMatch(r.text,/Rua da Oficina/);assert.match(r.text,/não encontrei/i);}
 const r=await reviewAiReply('Meu endereço?', 'Nosso endereço é Rua da Oficina, 75',{...facts,customerAddress:'Rua do Cliente, 9'},{remote:false});assert.match(r.text,/Rua do Cliente, 9/);
});
test('unverified bookings, stock, price, links and secrets cannot pass the local gate',async()=>{
 for(const [reply,reason] of [['Reservei a instalação para segunda.','unsupported_booking'],['Não se preocupe, reservei seu horário.','unsupported_booking'],['Temos o kit em estoque.','unsupported_stock'],['Custa R$ 2.000,00.','unsupported_price'],['Veja https://wrong.example/oferta','unsupported_link'],['GEMINI_API_KEY=secret','sensitive_output']])assert.equal(localReplyIssue('Quero orçamento',reply,facts),reason);
});
test('verified operation text and approved prices remain usable; conditional stock questions are allowed',async()=>{
 const text='Instalação confirmada para segunda. Reservei o kit.';
 const r=await reviewAiReply('Confirmo',text,{...facts,trustedOperationText:text},{judge:async()=>assert.fail('verified operation')});assert.equal(r.text,text);assert.equal(r.corrected,false);
 for(const price of ['R$ 150,00','R$ 150.00'])assert.equal(localReplyIssue('Preço?',price,{...facts,approvedPrices:[150]}),'');
 assert.equal(localReplyIssue('Tem peça?','Vou consultar se temos a peça em estoque.',facts),'');
});
test('remote judgement can reject an otherwise plausible answer; timeout keeps the local gate and records degradation',async()=>{
 const bad=await reviewAiReply('Qual o prazo?','Chega em dois dias.',facts,{judge:async()=> 'UNSUPPORTED'});assert.equal(bad.corrected,true);assert.equal(bad.reviewer,'jev');
 const mismatch=await reviewAiReply('Qual a garantia?','Bom dia!',facts,{judge:async()=> 'MISMATCH'});assert.equal(mismatch.reason,'intent_mismatch');
 const pass=await reviewAiReply('Oi','Como posso ajudar?',facts,{judge:async()=> 'PASS'});assert.equal(pass.corrected,false);assert.equal(pass.reviewer,'jev');
 const timeout=await reviewAiReply('Oi','Como posso ajudar?',facts,{judge:async()=>{throw Error('timeout')}});assert.equal(timeout.reviewer,'local_degraded');assert.equal(timeout.reason,'review_unavailable');
});

test('remote output reviewer sends bounded evidence and accepts only the documented verdict schema',async t=>{
 const old=process.env.TYPESAFE_API_KEY;process.env.TYPESAFE_API_KEY='fake-test-key';
 try{let payload;t.mock.method(global,'fetch',async(url,options)=>{assert.equal(url,'https://api.typesafe.ai/v1/systemone');payload=JSON.parse(options.body);return new Response(JSON.stringify({answers:{verdict:{choice:'UNSUPPORTED',confidence:.96}}}))});
 const r=await reviewAiReply('Qual a garantia?','Tem garantia vitalícia.',facts);assert.equal(r.corrected,true);assert.equal(r.reason,'unsupported_fact');assert.equal(payload.questions.verdict.type,'choice');assert.equal(payload.model,'jev-latest');assert.doesNotMatch(payload.state,/fake-test-key/);
 }finally{if(old===undefined)delete process.env.TYPESAFE_API_KEY;else process.env.TYPESAFE_API_KEY=old;}
});

test('unconfirmed dates and installation durations remain blocked even without the remote judge',()=>{
 assert.equal(localReplyIssue('Quando posso levar?', 'Pode levar amanhã às 9h.',facts),'unsupported_booking');
 assert.equal(localReplyIssue('Quanto tempo leva?', 'A instalação leva 30 minutos.',facts),'unsupported_deadline');
 assert.equal(localReplyIssue('Quanto tempo leva?', 'A instalação leva 2 horas.',{...facts,businessNotes:'Instalação padrão: 2 horas.'}),'');
});
test('unbacked promises to reserve after Sim are blocked even when the remote judge is unavailable',async()=>{
 const reply='Olá! Tudo bem? Só me confirma por texto um SIM para eu deixar o dia 2 de novembro às 9h reservado para a instalação do seu 911.';
 assert.equal(localReplyIssue('Olá',reply,facts),'unsupported_booking');
 const reviewed=await reviewAiReply('Olá',reply,facts,{judge:async()=>null});assert.equal(reviewed.corrected,true);assert.doesNotMatch(reviewed.text,/Qual dia/);
 assert.equal(localReplyIssue('Sim',reply,{...facts,trustedOperationText:reply}),'');
});
test('low-confidence complaint never pauses the bot; continuity is not a handoff request',async()=>{
 const {isGatewayHandoff}=require('../lib/aiGateway');
 for(const channel of ['whatsapp','instagram','simulator'])for(const confidence of [.28,.99]){
  const d=await prepareAiGateway('Mas eu ja nao conversei com voce ?',{},channel,false,{screen:safe,triage:async()=>({...await triage(),intent:'COMPLAINT',urgent:true,sentiment:'ANGRY',confidence})});
  assert.equal(isGatewayHandoff(d),false);assert.equal(d.handoff.reason,'conversation_continuity');
 }
 const low=await prepareAiGateway('Isso está errado',{},'instagram',false,{screen:safe,triage:async()=>({...await triage(),intent:'COMPLAINT',urgent:true,confidence:.28})});assert.equal(isGatewayHandoff(low),false);
 assert.equal(isGatewayHandoff({...low,handoff:undefined}),false,'old persisted decisions also respect confidence');
});
test('explicit human requests remain honored and urgency alone cannot hand over a normal conversation',async()=>{
 const {isGatewayHandoff}=require('../lib/aiGateway');
 for(const text of ['Quero falar com um atendente humano','Chama o gerente','Me passa um atendente']){
  const d=await prepareAiGateway(text,{},'instagram',false,{screen:safe,triage:async()=>({...await triage(),confidence:.1})});assert.equal(isGatewayHandoff(d),true,text);
 }
 const no=await prepareAiGateway('Não quero falar com humano',{},'instagram',false,{screen:safe,triage:async()=>({...await triage(),intent:'HUMAN_HELP',urgent:true,confidence:.99})});assert.equal(isGatewayHandoff(no),false);
 const urgent=await prepareAiGateway('É para hoje',{},'instagram',false,{screen:safe,triage:async()=>({...await triage(),urgent:true})});assert.equal(isGatewayHandoff(urgent),false);
 const complaint=await prepareAiGateway('Estou indignado com esse erro grave',{},'instagram',false,{screen:safe,triage:async()=>({...await triage(),intent:'COMPLAINT',urgent:true,confidence:.99})});assert.equal(isGatewayHandoff(complaint),true);
});
