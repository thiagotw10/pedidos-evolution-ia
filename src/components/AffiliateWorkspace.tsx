import React, { useCallback, useEffect, useState } from 'react';
import { ShoppingBag, Film, Plus, ExternalLink, RefreshCw, Pencil, Link, Instagram, CheckCircle2 } from 'lucide-react';
import { auth } from '../lib/firebase';

type Product = {id:string;name:string;description:string;category:string;affiliateUrl:string;imageUrl:string;videoUrl:string;price:number|null;active:boolean;mediaAuthorized:boolean};
type Post = {id:string;productId:string;caption:string;keywords:string[];status:string;automationEnabled:boolean;lastError?:string;mediaId?:string};
type Workspace = {products:Product[];posts:Post[];instagram:{connected:boolean;username:string;affiliatePermissions:boolean};shopee:{connected:boolean;status:string}};
const emptyProduct = {name:'',description:'',category:'',affiliateUrl:'',imageUrl:'',videoUrl:'',price:'' as string|number,active:true,mediaAuthorized:false};
const statusLabels:Record<string,string> = {draft:'Rascunho',preparing:'Preparando vídeo',processing:'Processando na Meta',ready:'Pronto para publicar',publishing:'Publicando',published:'Publicado',needs_review:'Conferir no Instagram'};
const field = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-pink-400 outline-none';
const button = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold bg-pink-600 hover:bg-pink-500 text-white disabled:opacity-40';

export function AffiliateWorkspace({establishmentId,view,onOpenInstagram,client}:{establishmentId:string;view:'products'|'posts';onOpenInstagram:()=>void;client?:(path:string,body?:object)=>Promise<any>}) {
  const [data,setData] = useState<Workspace|null>(null);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false);
  const [search,setSearch] = useState('');
  const [editing,setEditing] = useState<(typeof emptyProduct & {id?:string})|null>(null);
  const [draft,setDraft] = useState<{id?:string;productId:string;caption:string;keywords:string}|null>(null);
  const request = useCallback(async (path:string,body?:object) => {
    if (client) return client(path,body);
    const user = auth.currentUser;
    if (!user) throw new Error('Entre novamente para continuar.');
    const response = await fetch(`/api/affiliate/${path}?establishmentId=${encodeURIComponent(establishmentId)}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${await user.getIdToken()}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível concluir.');
    return result;
  },[establishmentId,client]);
  const reload = useCallback(async()=>setData(await request('workspace')),[request]);
  useEffect(()=>{setData(null);setEditing(null);setDraft(null);reload().catch(e=>setError(e.message));},[reload]);
  useEffect(()=>{setEditing(null);setDraft(null);},[view]);
  const run = async (fn:()=>Promise<void>) => {setBusy(true);setError('');setNotice('');try{await fn();}catch(e:any){setError(e.message);}finally{setBusy(false);}};
  const makeDraft = (productId:string) => {setEditing(null);setDraft({productId,caption:'',keywords:'quero'});};
  const saveProduct = (e:React.FormEvent) => {e.preventDefault();run(async()=>{await request('products',editing!);setEditing(null);await reload();setNotice('Achadinho salvo. O link permanece vinculado a este produto.');});};
  const saveDraft = (e:React.FormEvent) => {e.preventDefault();run(async()=>{await request('posts',draft!);setDraft(null);await reload();setNotice('Rascunho salvo. Nenhum conteúdo foi publicado.');});};
  const action = (post:Post,operation:string,body:object={}) => run(async()=>{await request(`posts/${post.id}/${operation}`,body);await reload();setNotice(operation==='publish'?'Reel publicado. Ative o envio de links nos comentários quando desejar.':operation==='automation'?'Automação atualizada.':operation==='prepare'?'Vídeo enviado para processamento na Meta. Confira o status para continuar.':'Status atualizado.');});
  const products = data?.products || [];
  const posts = data?.posts || [];
  return <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6 text-slate-200 pb-10">
    <header className="flex flex-wrap justify-between items-start gap-4">
      <div><p className="text-xs uppercase tracking-widest text-pink-300 font-semibold mb-2">Afiliados & Achadinhos</p><h1 className="text-2xl sm:text-3xl font-bold text-white flex gap-3 items-center">{view==='products'?<ShoppingBag className="text-pink-400"/>:<Film className="text-pink-400"/>}{view==='products'?'Meus Achadinhos':'Conteúdo & Reels'}</h1><p className="text-sm text-slate-400 mt-2">Do produto ao conteúdo, com o link certo para cada pessoa.</p></div>
      <div className="flex gap-2"><button className="p-3 bg-slate-800 rounded-xl disabled:opacity-40" disabled={busy} onClick={()=>run(reload)} aria-label="Atualizar achadinhos"><RefreshCw size={18}/></button><button className={button} disabled={busy} onClick={()=>{setError('');setDraft(null);view==='products'?setEditing({...emptyProduct}):makeDraft(products.find(p=>p.active)?.id || '');}}><Plus size={18}/>{view==='products'?'Novo achadinho':'Novo rascunho'}</button></div>
    </header>
    <div className="grid sm:grid-cols-3 gap-3">
      {[['Achadinhos ativos',products.filter(p=>p.active).length],['Conteúdos publicados',posts.filter(p=>p.status==='published').length],['Automações ativas',posts.filter(p=>p.automationEnabled).length]].map(([label,value])=><div key={label} className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><p className="text-xs text-slate-400">{label}</p><p className="text-2xl font-bold text-white mt-1">{value}</p></div>)}
    </div>
    {error && <p role="alert" className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-200">{error}</p>}
    {notice && <p role="status" className="p-4 bg-emerald-500/10 rounded-xl text-emerald-200">{notice}</p>}
    {!data && !error && <p className="text-slate-400">Carregando seus achadinhos...</p>}
    {data && <section className="grid md:grid-cols-2 gap-4">
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 flex items-start gap-3"><Instagram className="text-pink-400 shrink-0" size={22}/><div className="min-w-0"><h2 className="font-semibold text-white">{data.instagram.username?`@${data.instagram.username}`:'Instagram do seu perfil'}</h2><p className="text-sm text-slate-400 mt-1">{data.instagram.connected && data.instagram.affiliatePermissions?'Conectado para publicar e gerenciar comentários.':data.instagram.connected?'Conectado para mensagens. Renove a autorização para publicar e responder comentários.':'Conecte a conta profissional deste perfil para publicar e enviar links.'}</p><button className="text-pink-300 text-sm font-semibold mt-3" onClick={onOpenInstagram}>Gerenciar conexão →</button></div></div>
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5"><h2 className="font-semibold text-white">Importação da Shopee</h2><p className="text-sm text-slate-400 mt-1">{data.shopee.status}</p><a href="https://affiliate.shopee.com.br/open_api" target="_blank" rel="noopener noreferrer" className="inline-flex gap-2 items-center text-pink-300 text-sm mt-3">Conferir acesso no Portal do Afiliado <ExternalLink size={14}/></a></div>
    </section>}
    {editing && <form onSubmit={saveProduct} className="bg-slate-900 border border-pink-500/30 rounded-2xl p-5 space-y-4">
      <h2 className="font-bold text-lg text-white">{editing.id?'Editar achadinho':'Cadastrar achadinho'}</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="text-sm space-y-1">Nome do produto<input required maxLength={160} className={field} value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/></label>
        <label className="text-sm space-y-1">Categoria<input maxLength={100} className={field} placeholder="Casa, beleza, tecnologia..." value={editing.category} onChange={e=>setEditing({...editing,category:e.target.value})}/></label>
        <label className="text-sm space-y-1 sm:col-span-2">Seu link de afiliado<input required type="url" className={field} placeholder="https://..." value={editing.affiliateUrl} onChange={e=>setEditing({...editing,affiliateUrl:e.target.value})}/></label>
        <label className="text-sm space-y-1">Link da imagem<input type="url" className={field} placeholder="https://..." value={editing.imageUrl} onChange={e=>setEditing({...editing,imageUrl:e.target.value})}/></label>
        <label className="text-sm space-y-1">Link público do vídeo<input type="url" className={field} placeholder="URL direta do arquivo de vídeo" value={editing.videoUrl} onChange={e=>setEditing({...editing,videoUrl:e.target.value})}/></label>
        <label className="text-sm space-y-1">Preço de referência (opcional)<input type="number" min="0" step="0.01" className={field} value={editing.price} onChange={e=>setEditing({...editing,price:e.target.value})}/><span className="block text-xs text-slate-500">O preço atual deve ser conferido no anúncio.</span></label>
        <label className="text-sm space-y-1 sm:col-span-2">Descrição confirmada no anúncio<textarea rows={3} maxLength={3000} className={field} value={editing.description} onChange={e=>setEditing({...editing,description:e.target.value})}/></label>
      </div>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={editing.mediaAuthorized} onChange={e=>setEditing({...editing,mediaAuthorized:e.target.checked})}/>Tenho autorização para usar esta mídia na divulgação.</label>
      <label className="flex gap-3 text-sm"><input type="checkbox" checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/>Disponível para divulgação e envio de links</label>
      <div className="flex gap-3"><button disabled={busy} className={button} type="submit">Salvar achadinho</button><button type="button" disabled={busy} className="px-3 text-slate-400" onClick={()=>setEditing(null)}>Cancelar</button></div>
    </form>}
    {draft && <form onSubmit={saveDraft} className="bg-slate-900 border border-pink-500/30 rounded-2xl p-5 space-y-4">
      <h2 className="font-bold text-lg text-white">Preparar conteúdo</h2>
      <label className="block text-sm space-y-1">Achadinho<select required className={field} value={draft.productId} onChange={e=>setDraft({...draft,productId:e.target.value})}><option value="">Selecione um produto</option>{products.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="block text-sm space-y-1">Palavras nos comentários<input required className={field} value={draft.keywords} onChange={e=>setDraft({...draft,keywords:e.target.value})}/><span className="block text-xs text-slate-500">Separe por vírgulas. Ex.: quero, link. O link será enviado em uma resposta privada ao comentário correspondente.</span></label>
      <label className="block text-sm space-y-1">Legenda<textarea rows={5} maxLength={2200} className={field} placeholder="Deixe em branco para preparar uma legenda com os dados cadastrados, chamada para comentário e aviso de afiliado." value={draft.caption} onChange={e=>setDraft({...draft,caption:e.target.value})}/></label>
      <p className="text-xs text-slate-400">Revise a legenda e o vídeo antes de publicar. Não reutilize vídeos sem autorização. Este fluxo não baixa vídeos de vendedores automaticamente.</p>
      <div className="flex gap-3"><button disabled={busy} className={button} type="submit">Salvar rascunho</button><button type="button" disabled={busy} className="px-3 text-slate-400" onClick={()=>setDraft(null)}>Cancelar</button></div>
    </form>}
    {data && view==='products' && <>
      <label className="block"><span className="sr-only">Buscar achadinhos</span><input className={field} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por produto ou categoria..."/></label>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{products.filter(p=>`${p.name} ${p.category}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).map(p=><article key={p.id} className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden flex flex-col">
        {p.imageUrl?<img src={p.imageUrl} alt={p.name} loading="lazy" className="w-full h-40 object-contain bg-white"/>:<div className="h-32 bg-pink-500/5 flex items-center justify-center"><ShoppingBag size={36} className="text-pink-400/50"/></div>}
        <div className="p-4 flex flex-col flex-1 gap-3"><p className="text-xs text-slate-500">{p.category || 'Sem categoria'} · {p.active?'Ativo':'Pausado'}</p><h2 className="font-bold text-white">{p.name}</h2>{p.price!==null && <p className="text-sm text-slate-400">Referência: {p.price.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>}<p className="text-sm text-slate-400 line-clamp-3">{p.description}</p><div className="flex gap-2 text-xs text-slate-400"><span>{p.videoUrl?'Vídeo cadastrado':'Sem vídeo'}</span>{p.mediaAuthorized && <span className="text-emerald-400 inline-flex gap-1"><CheckCircle2 size={12}/>Mídia autorizada</span>}</div><div className="mt-auto flex flex-wrap gap-3 items-center"><a href={p.affiliateUrl} target="_blank" rel="noopener noreferrer" className="text-pink-300 text-sm inline-flex gap-1 items-center"><Link size={14}/>Ver link</a><button disabled={busy} onClick={()=>{setDraft(null);setEditing({...p,price:p.price??''});}} className="text-sm inline-flex gap-1 items-center"><Pencil size={14}/>Editar</button><button disabled={busy || !p.active} onClick={()=>makeDraft(p.id)} className="text-sm text-pink-300 inline-flex gap-1 items-center"><Film size={14}/>Criar Reel</button></div></div>
      </article>)}</div>
      {!products.length && <div className="p-8 rounded-2xl border border-dashed border-slate-700 text-center"><ShoppingBag className="mx-auto text-pink-400 mb-3"/><h2 className="font-bold text-white">Seu primeiro achadinho começa aqui</h2><p className="text-sm text-slate-400 mt-2">Cadastre um produto com seu link de afiliado e um vídeo autorizado. Depois prepare seu primeiro Reel.</p></div>}
    </>}
    {data && view==='posts' && <div className="space-y-4">{posts.map(p=>{const product=products.find(product=>product.id===p.productId);return <article key={p.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4"><div className="flex gap-3 flex-wrap justify-between items-start"><h2 className="font-bold text-white">{product?.name || 'Produto indisponível'}</h2><span className="rounded-full bg-slate-800 px-3 py-1 text-xs">{statusLabels[p.status] || p.status}</span></div>{product?.videoUrl && <video controls playsInline preload="metadata" src={product.videoUrl} aria-label={`Vídeo de ${product.name}`} className="w-full max-h-96 bg-black rounded-xl"/>}<p className="whitespace-pre-wrap text-sm text-slate-300 break-words">{p.caption}</p><p className="text-xs text-slate-400">Palavras: {p.keywords.join(', ')} · Envio de links: {p.automationEnabled?'ativo':'pausado'}</p>{p.lastError && <p className="text-sm text-amber-300">{p.lastError}</p>}
        <div className="flex flex-wrap gap-3">{p.status==='draft' && <><button disabled={busy} className="text-sm text-slate-300" onClick={()=>{setEditing(null);setDraft({id:p.id,productId:p.productId,caption:p.caption,keywords:p.keywords.join(', ')});}}>Editar rascunho</button><button disabled={busy || !data.instagram.affiliatePermissions} className={button} onClick={()=>action(p,'prepare')}>Preparar vídeo na Meta</button></>}{['processing','ready'].includes(p.status) && <button disabled={busy} className="text-sm text-pink-300" onClick={()=>action(p,'check')}>Conferir processamento</button>}{p.status==='ready' && <button disabled={busy} className={button} onClick={()=>action(p,'publish')}>Publicar Reel agora</button>}{p.status==='published' && <button disabled={busy} className={button} onClick={()=>action(p,'automation',{enabled:!p.automationEnabled})}>{p.automationEnabled?'Pausar envio de links':'Ativar links nos comentários'}</button>}</div>
      </article>;})}{!posts.length && <div className="p-8 rounded-2xl border border-dashed border-slate-700 text-center"><Film className="mx-auto text-pink-400 mb-3"/><h2 className="font-bold text-white">Prepare seu primeiro conteúdo</h2><p className="text-sm text-slate-400 mt-2">Escolha um achadinho, revise a legenda e publique quando estiver pronto. A automação de comentários é ativada separadamente por Reel.</p></div>}</div>}
  </div>;
}
