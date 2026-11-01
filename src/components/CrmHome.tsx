import React, {useEffect, useState} from 'react';
import {ArrowUpRight, ChevronRight, MessageCircle, Car, Wrench, Package, Users, Instagram, Settings, Search, ArrowRight} from 'lucide-react';
import {collection, onSnapshot} from 'firebase/firestore';
import {auth, db} from '../lib/firebase';
import {Establishment} from '../types';

type Props = {establishment: Establishment|null; productCount:number; onNavigate:(tab:string)=>void};
export function CrmHome({establishment,productCount,onNavigate}:Props) {
  const [unread,setUnread]=useState<number|null>(null);
  const [projects,setProjects]=useState<number|null>(null);
  const [failed,setFailed]=useState(false);
  const [search,setSearch]=useState('');
  const [recent,setRecent]=useState<{id:string;name:string;text:string;at:string;unread:boolean}[]>([]);
  const [chatFailed,setChatFailed]=useState(false);
  const automotive=establishment?.segment==='AUTOMOTIVE_PARTS';
  const actions=[{id:'orders',label:automotive?'Projetos':'Pedidos',icon:Car,detail:'Acompanhe suas vendas'}, {id:'inbox',label:'Conversas',icon:MessageCircle,detail:'WhatsApp e Instagram'}, ...(automotive?[{id:'garage',label:'Garagem',icon:Wrench,detail:'Boxes, agenda e estoque'}]:[]),{id:'products',label:'Catálogo',icon:Package,detail:'Produtos e referências'},{id:'instagram',label:'Instagram',icon:Instagram,detail:'Conexão e comentários'},...(automotive?[{id:'internal',label:'Equipe',icon:Users,detail:'Consultas internas'}]:[]),{id:'settings',label:'Configurações',icon:Settings,detail:'Dados e atendimento'}];
  useEffect(()=>{
    const user=auth.currentUser;if(!user)return;
    let active=true;
    const unsubscribe=onSnapshot(collection(db,'establishments',user.uid,'chats'),snapshot=>{
      const chats=snapshot.docs.filter(d=>/^(ig_|instagram_|\d)/.test(d.id)).map(d=>{
        const value=d.data();return {id:d.id,name:String(value.customerName||(/^(ig_|instagram_)/.test(d.id)?'Cliente Instagram':d.id)),text:String(value.lastMessage||value.lastUserMessage||'Abrir atendimento'),at:String(value.lastMessageAt||value.lastTimestamp||value.lastInboundAt||''),unread:!!value.unreadByHuman};
      });
      setUnread(chats.filter(chat=>chat.unread).length);setRecent(chats.sort((a,b)=>b.at.localeCompare(a.at)).slice(0,5));setChatFailed(false);
    },()=>{setUnread(null);setChatFailed(true);});
    if(automotive) user.getIdToken().then(token=>fetch('/api/automotive/projects',{headers:{Authorization:`Bearer ${token}`}})).then(async response=>{if(!response.ok)throw new Error();return response.json();}).then(data=>{if(active)setProjects(Array.isArray(data)?data.filter(p=>!['Concluído','Cancelado'].includes(p.status)).length:null);}).catch(()=>{if(active)setFailed(true);});
    return()=>{active=false;unsubscribe();};
  },[automotive]);
  const visible=actions.filter(action=>`${action.label} ${action.detail}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  function openChat(id:string){const url=new URL(location.href);url.searchParams.set('tab','inbox');url.searchParams.set('chat',id);history.replaceState(history.state,'',url);onNavigate('inbox');}
  return <section className="crm-home">
    <header className="crm-overview-header"><div><span>Seu negócio em movimento</span><h1>Visão geral</h1><p>Acompanhe os atendimentos e encontre o que precisa para o dia.</p></div>
      <label className="crm-overview-search"><Search size={19}/><input aria-label="Buscar atalhos" placeholder="Buscar atalhos" value={search} onChange={event=>setSearch(event.target.value)}/></label>
    </header>
    <div className="crm-overview-stats">
      <button className="crm-overview-stat is-primary" onClick={()=>onNavigate('inbox')}><span><MessageCircle size={19}/> Conversas não lidas<ArrowUpRight size={18}/></span><strong>{unread===null?'—':unread}</strong><small>{unread===1?'Uma conversa para acompanhar':'Conversas para acompanhar'}</small></button>
      <button className="crm-overview-stat" onClick={()=>onNavigate('orders')}><span><Car size={19}/>{automotive?'Projetos em aberto':'Pedidos'}<ArrowUpRight size={18}/></span><strong>{automotive?(projects===null?'—':projects):'Ver pedidos'}</strong><small>{failed?'Não foi possível atualizar. Abra a lista.':'Acompanhe o andamento das suas vendas'}</small></button>
      <button className="crm-overview-stat" onClick={()=>onNavigate('products')}><span><Package size={19}/>Catálogo<ArrowUpRight size={18}/></span><strong>{productCount}</strong><small>Produtos e referências cadastrados</small></button>
    </div>
    <div className="crm-overview-workspace"><section className="crm-recent-chats"><header><div><h2>Conversas recentes</h2><p>Continue de onde o atendimento parou.</p></div><button onClick={()=>onNavigate('inbox')}>Ver todas <ChevronRight size={16}/></button></header>
      {recent.map(chat=><button key={chat.id} className="crm-recent-chat" onClick={()=>openChat(chat.id)}><span className="crm-recent-avatar">{chat.name.charAt(0).toUpperCase()}</span><span className="crm-recent-text"><strong>{chat.name}{chat.unread&&<i aria-label="Mensagem não lida"/>}</strong><small>{chat.text}</small></span><span className="crm-recent-meta"><span>{/^(ig_|instagram_)/.test(chat.id)?'Instagram':'WhatsApp'}</span><small>{chat.at&&Number.isFinite(Date.parse(chat.at))?new Date(chat.at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):''}</small></span><ChevronRight size={16}/></button>)}
      {!recent.length&&<p className="crm-overview-empty">{chatFailed?'Não foi possível carregar os atendimentos. Abra Conversas para tentar novamente.':unread===null?'Carregando os atendimentos…':'As conversas dos seus clientes aparecerão aqui.'}</p>}
    </section><aside className="crm-overview-operation"><span className="crm-overview-operation-icon"><Wrench size={24}/></span><h2>{automotive?'Organize sua operação':'Mantenha tudo em dia'}</h2><p>{automotive?'Confira a agenda de instalações, os boxes e os kits disponíveis.':'Mantenha seu catálogo e suas informações de atendimento atualizados.'}</p><button onClick={()=>onNavigate(automotive?'garage':'products')}>{automotive?'Abrir garagem':'Abrir catálogo'}<ArrowRight size={17}/></button>{automotive&&<button className="secondary" onClick={()=>onNavigate('internal')}><Users size={17}/>Consultas da equipe<ChevronRight size={16}/></button>}<div className="crm-overview-channels"><h3>Canais de atendimento</h3>{establishment?.segment!=='AFFILIATES'&&<button onClick={()=>onNavigate('whatsapp')}><MessageCircle size={17}/>WhatsApp<ChevronRight size={16}/></button>}<button onClick={()=>onNavigate('instagram')}><Instagram size={17}/>Instagram<ChevronRight size={16}/></button></div></aside></div>
    <div className="crm-home-hero">
      <label className="crm-home-search"><Search size={21}/><input aria-label="Buscar no CRM" placeholder="O que você precisa?" value={search} onChange={event=>setSearch(event.target.value)}/></label>
      <div className="crm-home-channels"><button onClick={()=>onNavigate('inbox')} className="selected">Visão geral</button><button onClick={()=>onNavigate('whatsapp')}>WhatsApp</button><button onClick={()=>onNavigate('instagram')}>Instagram</button></div>
      <div className="crm-home-summary"><div className="flex items-center justify-between"><span className="flex items-center gap-2"><MessageCircle size={18}/> Seu atendimento</span><button onClick={()=>onNavigate('inbox')} aria-label="Ver conversas"><ArrowUpRight size={22}/></button></div>
        <strong>{unread===null?'—':unread}</strong><p>{unread===1?'conversa com mensagem não lida':'conversas com mensagens não lidas'}</p>
        <button className="crm-home-summary-action" onClick={()=>onNavigate('inbox')}>Abrir conversas <ArrowRight size={18}/></button>
      </div>
      <div className="crm-home-counters"><button onClick={()=>onNavigate('orders')}><strong>{automotive?(projects===null?'—':projects):'Ver'}</strong><span>{automotive?'Projetos em aberto':'Meus pedidos'}</span></button><span/><button onClick={()=>onNavigate('products')}><strong>{productCount}</strong><span>Itens no catálogo</span></button></div>
      {failed&&<p className="text-xs text-white/70 mt-3" role="status">Não foi possível atualizar os projetos. Abra a lista para tentar novamente.</p>}
    </div>
    <div className="crm-home-body"><h2>Pro dia a dia</h2><div className="crm-home-shortcuts">{visible.map(({id,label,icon:Icon})=><button key={id} onClick={()=>onNavigate(id)}><span><Icon size={27} strokeWidth={1.6}/></span>{label}</button>)}</div>
      {!visible.length&&<p className="text-sm text-slate-500 py-5">Nenhum atalho encontrado.</p>}
      <button className="crm-home-feature" onClick={()=>onNavigate(automotive?'garage':'products')}><div><span>{automotive?'Sua operação':'Seu catálogo'}</span><h3>{automotive?'Tudo pronto para o próximo projeto?':'Organize o que você vende'}</h3><p>{automotive?'Consulte os boxes, a agenda e os kits disponíveis.':'Mantenha produtos e informações atualizados.'}</p></div><ChevronRight size={24}/></button>
      <h2>Acesso rápido</h2><div className="crm-home-links">{actions.slice(3).map(({id,label,detail,icon:Icon})=><button key={id} onClick={()=>onNavigate(id)}><span className="crm-home-link-icon"><Icon size={20}/></span><span><strong>{label}</strong><small>{detail}</small></span><ChevronRight size={18}/></button>)}</div>
    </div>
  </section>;
}
