import React,{useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
export type ReachPoint={key:string;label:string;country:string;lat:number;lng:number;count:number;precision:string};
export default function InstagramReachMap({points,scope,selected,onSelect}:{points:ReachPoint[];scope:'BR'|'world';selected:string;onSelect:(key:string)=>void}){
 const container=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),marks=useRef<L.LayerGroup|null>(null),select=useRef(onSelect),[failed,setFailed]=useState(false);select.current=onSelect;
 useEffect(()=>{
  if(!container.current)return;let active=true;
  const m=L.map(container.current,{zoomControl:true,scrollWheelZoom:false,attributionControl:true,minZoom:1,maxZoom:10,worldCopyJump:false});map.current=m;marks.current=L.layerGroup().addTo(m);
  m.attributionControl.setPrefix(false);m.attributionControl.addAttribution('<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">Natural Earth</a> · <a href="https://github.com/kelvins/municipios-brasileiros" target="_blank" rel="noopener noreferrer">Municípios BR</a>');
  m.setView([-14.5,-51],3);
  fetch('/maps/world-countries.geojson').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{if(active)L.geoJSON(data,{style:{color:'#fff',weight:.8,fillColor:'#dfe3df',fillOpacity:1},interactive:false}).addTo(m).bringToBack();}).catch(()=>{if(active)setFailed(true);});
  const observer=new ResizeObserver(()=>m.invalidateSize({animate:false}));observer.observe(container.current);
  return()=>{active=false;observer.disconnect();m.remove();map.current=null;marks.current=null;};
 },[]);
 useEffect(()=>{
  const m=map.current,layer=marks.current;if(!m||!layer)return;
  layer.clearLayers();const visible=points.filter(p=>scope==='world'||p.country==='BR');
  for(const p of visible){const isSelected=p.key===selected;const marker=L.circleMarker([p.lat,p.lng],{radius:Math.min(23,7+Math.sqrt(p.count)*2),weight:isSelected?3:2,color:isSelected?'#111':'#fff',fillColor:isSelected?'#111':'#426452',fillOpacity:.86}).addTo(layer);const label=document.createElement('span');label.textContent=`${p.label} · ${p.count} ${p.count===1?'lead':'leads'}`;marker.bindTooltip(label,{direction:'top',className:'ig-reach-map-tooltip'});marker.on('click',()=>select.current(p.key));}
  const target=visible.find(p=>p.key===selected);
  if(target)m.setView([target.lat,target.lng],target.precision==='city'?6:target.precision==='state'?4:3,{animate:false});
  else if(scope==='BR')m.fitBounds([[-34,-74],[6,-33]],{padding:[15,15],animate:false});
  else m.fitBounds([[-54,-170],[78,180]],{padding:[10,10],animate:false});
 },[points,scope,selected]);
 return <div className="ig-reach-map-shell"><div ref={container} className="ig-reach-map" aria-label="Mapa de regiões dos leads" role="region"/>{!points.some(p=>scope==='world'||p.country==='BR')&&<div className="ig-reach-map-empty">Os pontos aparecem quando a localização dos interessados é identificada.</div>}{failed&&<p className="ig-reach-map-failed">Não foi possível carregar os limites do mapa. As regiões continuam disponíveis na lista.</p>}</div>;
}
