import React,{useState} from 'react';
import {Sparkles} from 'lucide-react';
import {auth} from '../lib/firebase';
import {Preloader} from './Loading';
import type {Product} from '../types';
type Suggestion={field:string;value:string|number;certainty:'observed'|'suggested';evidence:string;imageIndex:number};
const labels:Record<string,string>={name:'Título',category:'Categoria / marca',description:'Descrição',brand:'Marca',model:'Modelo',version:'Versão',year:'Ano',mileage:'Quilometragem',fuel:'Combustível',transmission:'Câmbio',engine:'Motor',color:'Cor'};
const current=(p:Partial<Product>,key:string)=>['name','category','description'].includes(key)?(p as any)[key]:(p.vehicleSpecs as any)?.[key];
export function VehiclePhotoAssistant({product,disabled,onBusyChange,onApply}:{product:Partial<Product>;disabled:boolean;onBusyChange:(busy:boolean)=>void;onApply:(items:Suggestion[])=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[suggestions,setSuggestions]=useState<Suggestion[]>([]),[selected,setSelected]=useState<string[]>([]),[notice,setNotice]=useState('');
 const images=Array.from(new Set([product.imageUrl,...(product.images||[])].filter((v):v is string=>!!v))).slice(0,6);
 async function analyze(){setBusy(true);onBusyChange(true);setError('');setNotice('');setSuggestions([]);try{
  const token=await auth.currentUser?.getIdToken();if(!token)throw Error('Entre novamente na plataforma.');
  const response=await fetch('/api/vehicles/analyze-photos',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({images})});const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível analisar as fotos.');
  setSuggestions(data.suggestions||[]);setSelected((data.suggestions||[]).filter((s:Suggestion)=>!String(current(product,s.field)??'').trim()).map((s:Suggestion)=>s.field));setNotice(data.suggestions?.length?`${data.photosAnalyzed} foto(s) analisada(s). Revise as sugestões abaixo.`:'Não identifiquei dados com evidência suficiente. Tente fotos mais nítidas do exterior, interior e painel.');
 }catch(e:any){setError(e.message);}finally{setBusy(false);onBusyChange(false);}}
 return <section className="vehicle-photo-assistant" aria-label="Preencher veículo pelas fotos"><div className="vehicle-photo-heading"><div><strong><Sparkles size={18}/>Preencher pelas fotos</strong><p>Adicione as fotos abaixo e a IA sugere os dados do veículo. Você revisa antes de aplicar.</p></div><button type="button" disabled={disabled||busy||!images.length} onClick={analyze}>{busy?<Preloader compact label="Analisando fotos…"/>:'Analisar fotos com IA'}</button></div><small>Até 6 fotos: capa e primeiras imagens da galeria. Ano, km, motor e câmbio precisam de evidência legível. Preço e situação do estoque continuam sob seu controle.</small>
 {error&&<p role="alert" className="vehicle-photo-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {!!suggestions.length&&<><div className="vehicle-photo-suggestions">{suggestions.map(item=>{const filled=String(current(product,item.field)??'').trim()!=='';return <label key={item.field}><input type="checkbox" disabled={filled||disabled} checked={selected.includes(item.field)&&!filled} onChange={e=>setSelected(v=>e.target.checked?[...v,item.field]:v.filter(k=>k!==item.field))}/><span><b>{labels[item.field]||item.field}</b><em>{item.certainty==='suggested'?'Hipótese visual · conferir':'Evidência visual'}</em><span>{String(item.value)}</span><small>Foto {item.imageIndex}: {item.evidence}{filled?' · Campo já preenchido; mantido como está.':''}</small></span></label>})}</div><p>Confirme as hipóteses e selecione os campos desejados. Dados já preenchidos não serão substituídos.</p><button type="button" disabled={disabled||!selected.some(key=>!String(current(product,key)??'').trim())} onClick={()=>{onApply(suggestions.filter(s=>selected.includes(s.field)&&!String(current(product,s.field)??'').trim()));setSuggestions([]);setNotice('Sugestões aplicadas ao formulário. Confira os dados e salve quando estiver pronto.');}}>Aplicar sugestões selecionadas</button></>}
 </section>;
}
