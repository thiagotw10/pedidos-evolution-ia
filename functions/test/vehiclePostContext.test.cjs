const {test}=require('node:test'),assert=require('node:assert/strict');const {matchVehiclePost,vehiclePostContext}=require('../lib/vehiclePostContext');
const products=[{id:'f',name:'Ferrari LaFerrari — Unidade Exclusiva Brasil',category:'Ferrari'},{id:'h',name:'Hyundai HB20',vehicleSpecs:{brand:'Hyundai',model:'HB20'}}];
test('post references match only a unique catalogue vehicle; ambiguity and removed links stay explicit',()=>{
 assert.deepEqual(matchVehiclePost('Conheça a Ferrari LaFerrari no showroom',products),{match:'unique_caption',productIds:['f']});
 assert.equal(matchVehiclePost('Carro incrível',products).match,'unmatched');
 assert.equal(matchVehiclePost('Hyundai HB20 à venda',[...products,{...products[1],id:'h2'}]).match,'ambiguous');
 const context=vehiclePostContext({kind:'instagram_comment',mediaId:'123456',productId:'removed',caption:'Outro carro',comment:'Quanto custa?',notes:'segredo',accessToken:'secret',permalink:'https://evil.test'},products);
 assert.equal(context.match,'removed');assert.deepEqual(context.productIds,[]);assert.equal(context.visualAnalysis,'not_performed');assert.equal(context.permalink,null);assert.doesNotMatch(JSON.stringify(context),/segredo|secret/);
});
