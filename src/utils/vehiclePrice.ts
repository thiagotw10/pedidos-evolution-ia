/** Accept whole reais, Brazilian currency, or a decimal value pasted from a system. */
export function parseVehiclePrice(input:string):number|null {
 const text=input.replace(/R\$/gi,'').replace(/\s/g,'');if(!text)return 0;
 let normalized:string;
 if(/^\d{1,3}(?:\.\d{3})+(?:,\d{0,2})?$/.test(text))normalized=text.replace(/\./g,'').replace(',','.');
 else if(/^\d+(?:,\d{0,2})?$/.test(text))normalized=text.replace(',','.');
 else if(/^\d+(?:\.\d{0,2})?$/.test(text))normalized=text;
 else return null;
 const value=Number(normalized);return Number.isFinite(value)&&value>=0&&value<=999999999.99?Math.round(value*100)/100:null;
}
export function formatVehiclePrice(value:number){return value>0?value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'';}
