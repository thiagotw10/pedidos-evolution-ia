import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

const openDialogs: symbol[] = [];
let scrollLocks = 0;
let restoreScroll: (()=>void)|undefined;

/** Shared CRM modal layer, isolated from page layout and mobile theme overrides. */
export function ModalFrame({label,onClose,children,media=false}:{label:string;onClose:()=>void;children:React.ReactNode;media?:boolean}) {
  const frame=useRef<HTMLDivElement>(null);
  const id=useRef(Symbol('crm-modal'));
  const close=useRef(onClose);close.current=onClose;
  const [viewport,setViewport]=useState<{height:number;top:number}|null>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    openDialogs.push(id.current);
    if(scrollLocks++===0){
      const targets=[document.body,...Array.from(document.querySelectorAll<HTMLElement>('.crm-scroll'))];
      const values=targets.map(target=>target.style.overflow);
      targets.forEach(target=>{target.style.overflow='hidden';});
      restoreScroll=()=>targets.forEach((target,index)=>{if(target.style.overflow==='hidden')target.style.overflow=values[index];});
    }
    const resize=()=>setViewport(window.visualViewport?{height:window.visualViewport.height,top:window.visualViewport.offsetTop}:null);
    resize();window.visualViewport?.addEventListener('resize',resize);window.visualViewport?.addEventListener('scroll',resize);
    const initial=frame.current?.querySelector<HTMLElement>('button[aria-label^="Fechar"]:not([disabled])');
    (initial||frame.current)?.focus({preventScroll:true});
    return()=>{
      const index=openDialogs.indexOf(id.current);if(index>=0)openDialogs.splice(index,1);
      if(--scrollLocks===0){restoreScroll?.();restoreScroll=undefined;}
      window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',resize);
      const fallback=Array.from(document.querySelectorAll<HTMLElement>('.crm-header-action,.crm-shell button')).find(el=>el.getClientRects().length>0);
      if(previous?.isConnected&&previous.getClientRects().length)previous.focus({preventScroll:true});
      else fallback?.focus({preventScroll:true});
    };
  },[]);
  return createPortal(<div ref={frame} className={`crm-modal-root ${media ? 'crm-modal-media' : ''}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
    style={viewport?{height:viewport.height,top:viewport.top}:undefined}
    onKeyDown={event=>{
      if(openDialogs.at(-1)!==id.current)return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();return;}
      if(event.key!=='Tab')return;
      const elements=Array.from(frame.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')||[]).filter(el=>el.getClientRects().length);
      const first=elements[0],last=elements.at(-1);
      if(!first){event.preventDefault();return;}
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===frame.current)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===frame.current)){event.preventDefault();first.focus();}
    }}>{children}</div>,document.body);
}
