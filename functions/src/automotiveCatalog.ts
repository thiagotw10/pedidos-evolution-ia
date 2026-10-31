import { normalizeAuto } from './automotiveConversation';
export type AutomotiveSpecs = {brand?:string;model?:string;generation?:string;engine?:string;yearFrom?:string;yearTo?:string;material?:string;configuration?:string;validation?:'reference'|'validated';status?:'completed'|'development'};
export type AutomotiveReference = {id:string;name:string;description?:string;category?:string;imageUrl?:string;images?:string[];videoUrl?:string;automotiveSpecs?:AutomotiveSpecs};
export function normalizeAutomotiveSpecs(value:any):AutomotiveSpecs {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result:any={};
  for(const key of ['brand','model','generation','engine','material','configuration'])if(typeof value[key]==='string')result[key]=value[key].trim().slice(0,150);
  for(const key of ['yearFrom','yearTo'])if(value[key]) {if(!/^(19|20)\d{2}$/.test(String(value[key])))throw new Error('Informe anos válidos na referência técnica.');result[key]=String(value[key]);}
  if(result.yearFrom && result.yearTo && result.yearFrom>result.yearTo)throw new Error('O ano inicial não pode ser maior que o ano final.');
  result.validation=value.validation==='validated'?'validated':'reference';
  result.status=value.status==='development'?'development':'completed';
  return result;
}
const known=/\b(?:porsche|bmw|audi|volkswagen|vw|mercedes|chevrolet|corvette|ford|honda|toyota|fiat|abarth|ferrari|lamborghini|mclaren|911|991(?:\.[12])?|992(?:\.[12])?|718|spyder|carrera|jetta|gli|golf|gti|civic|corolla|mustang|camaro|rs3|rs4|rs5|rs6|a3|a4|m2|m3|m4|x3|x5|g80|g82|f80|f82|titanio|titanium|inox|catback|downpipe|valvulado|2\.0|3\.0|4\.0)\b/g;
export function catalogQuery(text:string,products:AutomotiveReference[]) {
  const t=normalizeAuto(text).replace(/porshe/g,'porsche');
  const tokens:string[]=Array.from(t.match(known) || []);
  tokens.push(...(t.match(/\b(?:19|20)\d{2}\b/g) || []));
  // Explicit structured vocabulary is also searchable, including models outside the legacy list.
  for(const p of products)for(const key of ['brand','model','generation','engine','material','configuration']) {
    const value=normalizeAuto(p.automotiveSpecs?.[key as keyof AutomotiveSpecs]);
    if(value.length>1 && t.includes(value))tokens.push(value);
  }
  return [...new Set(tokens)].join(' ');
}
export function referenceMatches(product:AutomotiveReference,query:string) {
  const p=product.automotiveSpecs;
  const corpus=normalizeAuto([product.name,product.description,product.category,...Object.values(p || {})].join(' '));
  return query.split(' ').filter(Boolean).every(term=>{
    const value=term==='titanium'?'titanio':term==='vw'?'volkswagen':term;
    if (/^(19|20)\d{2}$/.test(term) && (p?.yearFrom || p?.yearTo)) return (!p.yearFrom || term>=p.yearFrom) && (!p.yearTo || term<=p.yearTo);
    const authoritative = /^(991|992)(\.[12])?$|^(g80|g82|f80|f82|mk7|mk8)$/.test(term) && p?.generation ? p.generation
      : /^(2|3|4)\.0$/.test(term) && p?.engine ? p.engine
      : ['porsche','bmw','audi','volkswagen','vw','honda','toyota','fiat','ford','ferrari','mercedes','chevrolet','lamborghini','mclaren'].includes(term) && p?.brand ? p.brand : '';
    const normalized=normalizeAuto(authoritative || corpus).replace(/titanium/g,'titanio').replace(/\bvw\b/g,'volkswagen');
    // Keep generations and decimal engine sizes distinct (991 != 992, 992.1 != 992.2).
    return new RegExp(`(^|[^a-z0-9])${value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?=$|[^a-z0-9])`).test(normalized);
  });
}
export function referenceDetails(p:AutomotiveReference) {
  const s=p.automotiveSpecs;
  if(!s)return '';
  return [s.brand,s.model,s.generation,s.engine,[s.yearFrom,s.yearTo].filter(Boolean).join('–'),s.material,s.configuration].filter(Boolean).join(' · ');
}
