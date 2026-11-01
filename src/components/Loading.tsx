import React from 'react';
import {Store} from 'lucide-react';

/** Neutral loading primitives shared by the public pages, CRM and dialogs. */
export function Preloader({label='Carregando…', compact=false, className=''}:{label?:string;compact?:boolean;className?:string}) {
  return <span className={`ui-preloader ${compact?'ui-preloader--compact':''} ${className}`} role="status"><span className="ui-spinner" aria-hidden="true"/><span className={compact?'ui-loading-sr':''}>{label}</span></span>;
}
export function Skeleton({className=''}:{className?:string}) {
  return <span aria-hidden="true" className={`ui-skeleton ${className}`}/>;
}
export function SkeletonScreen({variant='cards',label='Carregando informações…',count=3}:{variant?:'cards'|'list'|'conversation'|'dashboard';label?:string;count?:number}) {
  return <div className={`ui-loading-screen ui-loading-screen--${variant}`} role="status" aria-busy="true" style={{'--ui-skeleton-columns':count} as React.CSSProperties}>
    <span className="ui-loading-sr">{label}</span>
    <div className="ui-skeleton-layout" aria-hidden="true">{Array.from({length:count},(_,i)=>variant==='conversation'
      ? <div key={i} className={`ui-skeleton-bubble ${i%2?'ui-skeleton-bubble--out':''}`}><Skeleton className="ui-skeleton-line"/><Skeleton className="ui-skeleton-line ui-skeleton-line--short"/></div>
      : variant==='list' ? <div key={i} className="ui-skeleton-row"><Skeleton className="ui-skeleton-avatar"/><div className="ui-skeleton-copy"><Skeleton className="ui-skeleton-line"/><Skeleton className="ui-skeleton-line ui-skeleton-line--short"/></div></div>
      : <div key={i} className="ui-skeleton-card">{variant==='cards'&&<Skeleton className="ui-skeleton-image"/>}<Skeleton className="ui-skeleton-line ui-skeleton-line--short"/><Skeleton className="ui-skeleton-line"/><Skeleton className="ui-skeleton-line ui-skeleton-line--medium"/><Skeleton className="ui-skeleton-pill"/></div>)}</div>
  </div>;
}
export function SplashScreen() {
  return <div className="ui-splash" role="status" aria-busy="true"><div className="ui-splash-content"><div className="ui-splash-brand"><span><Store size={28} strokeWidth={1.8}/></span><strong>iaPedido</strong></div><p>Seu negócio. Tudo conectado.</p><div className="ui-splash-track" aria-hidden="true"><span/></div><span className="ui-loading-sr">Preparando seu espaço…</span></div></div>;
}
