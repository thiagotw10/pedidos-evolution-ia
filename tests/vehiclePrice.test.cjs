const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
const context={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/vehiclePrice.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);const {parseVehiclePrice,formatVehiclePrice}=context.exports;
test('car prices are whole reais unless cents are explicitly entered',()=>{
 for(const [input,expected] of [['150000',150000],['150.000',150000],['150.000,00',150000],['R$ 150.000,50',150000.5],['150000.50',150000.5],['1.250.000,90',1250000.9],['0',0],['',0],['0,50',.5]])assert.equal(parseVehiclePrice(input),expected,input);
 for(const input of ['-10','1e6','abc','150,000','150.00.00','1,2,3','1000000000'])assert.equal(parseVehiclePrice(input),null,input);
 assert.equal(formatVehiclePrice(150000),'150.000,00');assert.equal(formatVehiclePrice(0),'');
});
