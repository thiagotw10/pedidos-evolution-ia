import React, {useEffect, useState} from 'react';
import {collection,onSnapshot} from 'firebase/firestore';
import {Bell,Instagram,Smartphone} from 'lucide-react';
import {AutomotiveProjects} from './AutomotiveProjects';
import {auth,db} from '../lib/firebase';
import {isPushSupported,subscribeToPushNotifications} from '../utils/pwaNotifications';
type Chat={id:string;customerName?:string;lastMessage?:string;lastUserMessage?:string;lastMessageAt?:string;lastTimestamp?:string;lastInboundAt?:string;unreadByHuman?:boolean;aiPaused?:boolean;aiPausedUntil?:string|null};
const isInstagram=(id:string)=>/^(ig_|instagram_)/.test(id);
const controlled=(c:Chat)=>c.aiPaused&&(!c.aiPausedUntil||Date.parse(c.aiPausedUntil)>Date.now());
const time=(s?:string)=>s&&Number.isFinite(Date.parse(s))?new Date(s).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
export function InboxView(){
  const [chats,setChats]=useState<Chat[]>([]);
  const [selectedId,setSelectedId]=useState(new URLSearchParams(location.search).get('chat')||'');
  const [search,setSearch]=useState('');const [filter,setFilter]=useState('all');
  const [error,setError]=useState('');const [notice,setNotice]=useState('');const [loading,setLoading]=useState(true);
  useEffect(()=>{
    const uid=auth.currentUser?.uid;if(!uid){setLoading(false);return;}
    return onSnapshot(collection(db,'establishments',uid,'chats'),snap=>{
      setChats(snap.docs.map(d=>({id:d.id,...d.data()} as Chat)).filter(c=>/^(ig_|instagram_|\d)/.test(c.id)).sort((a,b)=>(b.lastMessageAt||b.lastTimestamp||b.lastInboundAt||'').localeCompare(a.lastMessageAt||a.lastTimestamp||a.lastInboundAt||'')));setLoading(false);
    },()=>{setError('Não foi possível sincronizar as conversas.');setLoading(false);});
  },[]);
  useEffect(()=>{const navigate=()=>setSelectedId(new URLSearchParams(location.search).get('chat')||'');window.addEventListener('popstate',navigate);return()=>window.removeEventListener('popstate',navigate);},[]);
  function open(id:string){setSelectedId(id);setError('');const url=new URL(location.href);url.searchParams.set('tab','inbox');if(id)url.searchParams.set('chat',id);else url.searchParams.delete('chat');history.replaceState({},'',url);}
  async function notifications(){const uid=auth.currentUser?.uid;if(!uid)return;const result=await subscribeToPushNotifications(uid);if(result.success)setNotice('Notificações ativadas neste aparelho.');else setError(result.error||'Não foi possível ativar notificações.');}
  const visible=chats.filter(c=>(filter==='all'||(filter==='instagram'?isInstagram(c.id):filter==='whatsapp'?!isInstagram(c.id):c.unreadByHuman))&&`${c.customerName||''} ${c.id} ${c.lastMessage||''}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="space-y-3 p-3 sm:p-5 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold text-white">Conversas</h1><p className="text-sm text-slate-400">WhatsApp e Instagram no mesmo atendimento.</p></div>
      <button onClick={notifications} disabled={!isPushSupported()} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"><Bell size={16}/>Ativar notificações</button></div>
    {!isPushSupported()&&<p className="text-xs text-slate-400">Para receber notificações no iPhone, abra pelo Safari, adicione o app à Tela de Início e ative as notificações no aplicativo instalado.</p>}
    {notice&&<p role="status" className="text-sm text-emerald-300">{notice}</p>}
    {error&&<p role="alert" className="text-sm text-red-300 bg-red-500/10 rounded-xl p-3">{error}</p>}
    <div className="flex min-h-[320px] h-[calc(100dvh-265px)] md:h-[calc(100dvh-240px)] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
      <aside className="flex w-full min-w-0 flex-col">
        <div className="p-3 space-y-2"><input aria-label="Buscar conversa" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar contato ou mensagem" className="w-full rounded-xl bg-slate-900 p-3 text-sm text-white border border-slate-800"/>
          <select aria-label="Filtrar canal" value={filter} onChange={e=>setFilter(e.target.value)} className="w-full rounded-lg bg-slate-900 p-2 text-sm text-slate-300"><option value="all">Todos os canais</option><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option><option value="unread">Não lidas</option></select></div>
        <div className="overflow-y-auto flex-1">{visible.map(c=><button key={c.id} onClick={()=>open(c.id)} className={`text-left w-full p-4 border-b border-slate-800/60 ${c.id===selectedId?'bg-emerald-500/10':'hover:bg-slate-900'}`}>
          <div className="flex items-center gap-2">{isInstagram(c.id)?<Instagram size={17} className="text-pink-400"/>:<Smartphone size={17} className="text-emerald-400"/>}<span className="truncate text-sm font-semibold text-white flex-1">{c.customerName|| (isInstagram(c.id)?'Cliente Instagram':c.id)}</span>{c.unreadByHuman&&<span aria-label="Mensagem não lida" className="w-2 h-2 rounded-full bg-emerald-400"/>}</div>
          <p className="truncate text-xs text-slate-400 mt-2">{c.lastMessage||c.lastUserMessage||'Abrir conversa'}</p><div className="flex justify-between text-[10px] text-slate-500 mt-2"><span>{controlled(c)?'Atendimento humano':'Com a IA'}</span><span>{time(c.lastMessageAt||c.lastTimestamp||c.lastInboundAt)}</span></div></button>)}
          {!visible.length&&<p className="p-5 text-sm text-slate-500">{loading?'Carregando…':'Nenhuma conversa encontrada.'}</p>}</div>
      </aside>
    </div>
    {selectedId&&<AutomotiveProjects key={selectedId} conversationContactId={selectedId} onConversationClose={()=>open('')}/>}
  </section>;
}
