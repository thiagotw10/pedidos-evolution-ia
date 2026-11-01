import React,{useRef} from 'react';
import type {LucideIcon} from 'lucide-react';
import './workspace-navigation.css';

export function WorkspaceTabs({items,value,onChange,label}:{items:Array<{id:string;label:string;icon:LucideIcon}>;value:string;onChange:(id:string)=>void;label:string}) {
 const buttons=useRef<Array<HTMLButtonElement|null>>([]);
 return <div className="crm-workspace-tabs" role="tablist" aria-label={label}>{items.map((item,index)=><button key={item.id} ref={el=>{buttons.current[index]=el;}} id={`workspace-tab-${item.id}`} aria-controls={`workspace-panel-${item.id}`} role="tab" aria-selected={value===item.id} tabIndex={value===item.id?0:-1} onClick={()=>onChange(item.id)} onKeyDown={event=>{
  let next=index;if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(index+1)%items.length;else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(index+items.length-1)%items.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=items.length-1;else return;
  event.preventDefault();onChange(items[next].id);buttons.current[next]?.focus();
 }}><item.icon size={18}/><span>{item.label}</span></button>)}</div>;
}
