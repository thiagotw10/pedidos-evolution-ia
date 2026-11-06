const text=(v:any,max:number)=>typeof v==='string'?v.trim().slice(0,max):'';
const normalized=(v:any)=>' '+text(v,3000).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()+' ';
/** A caption match is a reference to an ad, never proof of stock, price or ownership. */
export function matchVehiclePost(caption:string,products:any[]){
 const content=normalized(caption);
 const found=products.filter(p=>{
  const name=text(p.name,180),model=text(p.vehicleSpecs?.model,100),brand=text(p.vehicleSpecs?.brand||p.category,100);
  const exact=normalized(name);if(exact.trim().length>=6&&content.includes(exact))return true;
  if(brand&&model&&normalized(model).trim().length>=3&&content.includes(normalized(brand))&&content.includes(normalized(model)))return true;
  const first=name.split(/\s+/).slice(0,2).join(' ');return first.split(' ').length===2&&normalized(first).trim().length>=7&&content.includes(normalized(first));
 });
 return found.length===1?{match:'unique_caption',productIds:[found[0].id]}:{match:found.length?'ambiguous':'unmatched',productIds:found.map(p=>p.id).slice(0,5)};
}
export function vehiclePostContext(source:any,products:any[]){
 if(!source||source.kind!=='instagram_comment'||!source.mediaId)return null;
 const configured=typeof source.productId==='string'?products.find(p=>p.id===source.productId):null;
 const match=source.productId?{match:configured?'configured':'removed',productIds:configured?[configured.id]:[]}:matchVehiclePost(source.caption||'',products);
 const permalink=text(source.permalink,500);
 return {mediaId:text(source.mediaId,100),comment:text(source.comment,1000),caption:text(source.caption,2200),summary:text(source.summary,700),goal:text(source.goal,40),campaignName:text(source.campaignName,120),permalink:/^https:\/\/(www\.)?instagram\.com\/(p|reel|tv)\//.test(permalink)?permalink:null,capturedAt:text(source.capturedAt,40),...match,visualAnalysis:'not_performed'};
}
