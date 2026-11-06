// Structured catalogue facts, shared by the editor and the attendance context.
export const technicalFields = [
 ['alloy','Grau da liga'],['diameter','Diâmetro dos tubos'],['thickness','Espessura'],
 ['components','Itens incluídos'],['valves','Válvulas e acionamento'],['fitment','Aplicações confirmadas'],
 ['installation','Instalação e adaptações'],['sound','Características de ronco comprovadas'],
 ['results','Resultados medidos'],['leadTime','Prazo'],['warranty','Garantia'],['notes','Outras informações confirmadas']
] as const;
export type PerformanceCatalog = {catalogKind?:'exhaust_product'|'vehicle_project';linkedExhaustIds?:string[];technicalFacts?:Record<string,string>;priceOnRequest?:boolean};
export function performanceContext(item:any, catalog:any[]) {
 const linked=(item.linkedExhaustIds||[]).map((id:string)=>catalog.find(p=>p.id===id&&p.catalogKind==='exhaust_product')).filter(Boolean);
 return {kind:item.catalogKind||'legacy_reference',price:Number(item.price)>0&&!item.priceOnRequest?Number(item.price):null,
 technicalFacts:item.technicalFacts||{},exhausts:linked.map((p:any)=>({id:p.id,name:p.name,price:Number(p.price)>0&&!p.priceOnRequest?Number(p.price):null,material:p.automotiveSpecs?.material||null,technicalFacts:p.technicalFacts||{},knowledge:String(p.aiKnowledge||'').slice(0,2400)}))};
}
export function normalizePerformance(value:any, catalog:any[]) {
 const catalogKind=value.catalogKind;if(!['exhaust_product','vehicle_project'].includes(catalogKind))throw Error('Selecione produto ou projeto.');
 const technicalFacts:Record<string,string>={};for(const [key] of technicalFields)if(typeof value.technicalFacts?.[key]==='string')technicalFacts[key]=value.technicalFacts[key].trim().slice(0,1200);
 const ids=catalogKind==='vehicle_project'&&Array.isArray(value.linkedExhaustIds)?[...new Set<string>(value.linkedExhaustIds)]:[];
 if(ids.length>10||ids.some(id=>!catalog.some(p=>p.id===id&&p.catalogKind==='exhaust_product')))throw Error('Vincule somente escapamentos cadastrados nesta loja.');
 return {catalogKind,technicalFacts,linkedExhaustIds:ids,priceOnRequest:value.priceOnRequest===true||!(Number(value.price)>0)};
}
