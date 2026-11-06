const {test}=require('node:test'),assert=require('node:assert/strict');
const {vehiclePhotoPath,validateVehicleVision}=require('../lib/vehicleVision');
const url=(path,bucket='iapedido.firebasestorage.app')=>`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=test`;
test('vision accepts only this store product images in the configured bucket',()=>{
 assert.equal(vehiclePhotoPath(url('establishments/store/products/car.jpg'),'store','iapedido.firebasestorage.app'),'establishments/store/products/car.jpg');
 for(const value of ['https://evil.test/a.jpg',url('establishments/other/products/car.jpg'),url('establishments/store/chats/a.jpg'),url('establishments/store/products/a.jpg','other'),url('establishments/store/products/../secret')])assert.throws(()=>vehiclePhotoPath(value,'store','iapedido.firebasestorage.app'));
});
test('vision suggestions cannot set price, availability, guessed year or unreadable technical details',()=>{
 const item=(field,value,certainty='observed',imageIndex=1)=>({field,value,certainty,imageIndex,evidence:'Texto visível na foto',evidenceKind:'readable_text',visibleText:String(value)});
 const result=validateVehicleVision({suggestions:[item('brand','Honda','suggested'),item('color','Prata'),item('year','2021','suggested'),item('engine','2.0','suggested'),item('year','2021'),item('mileage','45000'),item('price',1),item('status','available'),item('transmission','Automático','suggested'),item('description','CPF 123'),item('model','Civic','suggested',7)]},3);
 assert.deepEqual(result.suggestions.map(s=>[s.field,s.value]),[['brand','Honda'],['color','Prata'],['year','2021'],['mileage',45000]]);
 assert.deepEqual(validateVehicleVision(null,2).suggestions,[]);
 assert.deepEqual(validateVehicleVision({suggestions:[item('mileage','9999999'),item('year','20999'),{field:'model',value:'Civic',imageIndex:1,certainty:'observed'}]},1).suggestions,[]);
});

test('technical inference marked observed is still rejected without matching literal text',()=>{
 const base={certainty:'observed',imageIndex:1,evidenceKind:'visual_inference',visibleText:'',evidence:'Motor visualmente corresponde ao modelo'};
 assert.deepEqual(validateVehicleVision({suggestions:[{...base,field:'engine',value:'V12'},{...base,field:'fuel',value:'Híbrido'},{...base,field:'year',value:'2021'}]},1).suggestions,[]);
 assert.equal(validateVehicleVision({suggestions:[{...base,evidenceKind:'readable_text',visibleText:'V12',evidence:'Inscrição V12 na tampa',field:'engine',value:'V12'}]},1).suggestions.length,1);
});
