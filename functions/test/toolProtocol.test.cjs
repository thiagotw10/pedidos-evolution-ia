const {test}=require('node:test'),assert=require('node:assert/strict');
const {hasToolProtocol,repairToolProtocol}=require('../lib/toolProtocol');
const {reviewAiReply}=require('../lib/aiGateway');
const leaked='Com certeza! Vou te enviar algumas referências para seu amigo.\n[enviar_cardapio_com_fotos]';
test('internal identifiers and serialized calls are detected independently of formatting',()=>{
 for(const text of [leaked,'`consultar_andamento_projeto`','{"tool_calls":[]}','functionDeclarations','Vou usar enviar_foto_produto.'])assert.equal(hasToolProtocol(text),true,text);
 for(const text of ['Separei fotos para seu amigo.','Consultei a etapa do projeto.','As ferramentas da oficina estão disponíveis.'])assert.equal(hasToolProtocol(text),false,text);
});
test('normal native tool calls pass through without another generation',async()=>{
 const native={text:'',functionCalls:[{name:'enviar_cardapio_com_fotos',args:{}}]};const r=await repairToolProtocol(native,async()=>assert.fail('must not regenerate'));assert.equal(r.response,native);assert.equal(r.status,'none');
});
test('pseudo-call is regenerated once and only a new native call is executable',async()=>{
 let calls=0;const native={text:'',functionCalls:[{name:'enviar_cardapio_com_fotos',args:{}}]};const r=await repairToolProtocol({text:leaked},async()=>{calls++;return native});assert.equal(calls,1);assert.equal(r.status,'recovered');assert.equal(r.response,native);
});
test('failed or repeated protocol output never parses or executes the string and blocks even with existing calls',async()=>{
 for(const regenerate of [async()=>{throw Error('unavailable')},async()=>({text:leaked,functionCalls:[{name:'registrar_pedido',args:{}}]}),async()=>({text:'Vou te enviar fotos agora.',functionCalls:[]})]){
  const r=await repairToolProtocol({text:leaked,functionCalls:[{name:'registrar_pedido',args:{}}]},regenerate);assert.equal(r.status,'blocked');assert.deepEqual(r.response.functionCalls,[]);
  const reviewed=await reviewAiReply('Áudio recebido',r.response.text,{mediaCount:0},{judge:async()=>{throw Error('judge unavailable')}});assert.equal(reviewed.reason,'internal_tool_output');assert.doesNotMatch(reviewed.text,/enviar_|consultar_|registrar_|\[|vou te enviar/);
 }
});
test('dispatch promises require actual prepared media, with or without a tool identifier',async()=>{
 const reply='Vou te enviar agora algumas fotos dos projetos para mostrar ao seu amigo.';
 const bad=await reviewAiReply('Quero fotos',reply,{mediaCount:0},{remote:false});assert.equal(bad.reason,'unsupported_media');
 const good=await reviewAiReply('Quero fotos',reply,{mediaCount:3},{remote:false});assert.equal(good.corrected,false);
 assert.equal((await reviewAiReply('Quero fotos','Posso te enviar fotos?',{mediaCount:0},{remote:false})).corrected,false);
});
