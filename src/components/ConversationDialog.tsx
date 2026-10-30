import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

// Shared frame for inbox and project chats. VisualViewport keeps the composer
// above mobile keyboards without shrinking the message list to a fixed height.
export function ConversationDialog({label, onClose, children}: {
  label:string; onClose:()=>void; children:React.ReactNode;
}) {
  const frame=useRef<HTMLDivElement>(null);
  const closeRef=useRef(onClose);closeRef.current=onClose;
  const [viewport,setViewport]=useState<{height:number;top:number}|null>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    frame.current?.focus({preventScroll:true});
    const resize=()=>setViewport(window.innerWidth<768&&window.visualViewport?{height:window.visualViewport.height,top:window.visualViewport.offsetTop}:null);
    resize();window.visualViewport?.addEventListener('resize',resize);window.visualViewport?.addEventListener('scroll',resize);window.addEventListener('resize',resize);
    return ()=>{
      document.body.style.overflow=overflow;
      window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',resize);window.removeEventListener('resize',resize);
      previous?.focus({preventScroll:true});
    };
  },[]);
  return createPortal(<div className="fixed inset-x-0 top-0 z-50 h-dvh bg-black/85 backdrop-blur-sm flex justify-center items-center p-0 md:p-4 overscroll-none" style={viewport?{height:viewport.height,top:viewport.top}:undefined}>
    <div ref={frame} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
      onKeyDown={event=>{
        if(event.key==='Escape'){event.stopPropagation();closeRef.current();}
        if(event.key!=='Tab')return;
        const focusable=Array.from(frame.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex="0"]')||[]).filter(el=>el.getClientRects().length);
        const first=focusable[0],last=focusable.at(-1);
        if(!first){event.preventDefault();return;}
        if(event.shiftKey&&(document.activeElement===first||document.activeElement===frame.current)){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===frame.current)){event.preventDefault();first.focus();}
      }}
      className="w-full h-full min-h-0 min-w-0 md:max-w-5xl md:h-[94dvh] bg-[#0b141a] md:rounded-2xl shadow-2xl flex flex-col overflow-hidden border-0 md:border md:border-[#222e35] relative outline-none">
      {children}
    </div>
  </div>,document.body);
}
