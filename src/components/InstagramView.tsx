import {InstagramAcquisitionView} from './InstagramAcquisitionView';
import React, { useCallback, useEffect, useState } from 'react';
import { Instagram, RefreshCw, ExternalLink, CheckCircle2, AlertCircle, Copy } from 'lucide-react';
import { auth } from '../lib/firebase';

type Status = {
  commentsPermission?:boolean;affiliatePermissions?: boolean; respectSchedule: boolean; storeOpen: boolean;
  configured: boolean; missing: string[]; connected: boolean; enabled: boolean;
  username: string | null; accountId: string | null; expiresAt: string | null;
  lastError: string | null; lastInboundAt: string | null; lastOutboundAt: string | null;
  webhookVerifiedAt: string | null; webhookUrl: string; redirectUri: string; verifyToken: string;
};

export function InstagramView({ establishmentId, affiliate = false, automotive=false }: { establishmentId: string; affiliate?: boolean; automotive?:boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [respectSchedule, setRespectSchedule] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(() => {
    const result = new URLSearchParams(location.search).get('instagram');
    return result === 'connected' ? 'Conta autorizada. Confira o status abaixo e configure o atendimento no Direct.'
      : result === 'cancelled' ? 'Você cancelou a autorização. Pode tentar novamente.'
      : result === 'error' ? 'Não foi possível autorizar. Confira o aplicativo Meta e tente novamente.' : '';
  });
  const request = useCallback(async (path: string, body?: object) => {
    const user = auth.currentUser;
    if (!user) throw new Error('Entre novamente na sua conta para gerenciar o Instagram.');
    const token = await user.getIdToken();
    const response = await fetch(`/api/instagram/${path}?establishmentId=${encodeURIComponent(establishmentId)}`, {
      method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
    return data;
  }, [establishmentId]);
  const reload = useCallback(async () => { const data = await request('status'); setStatus(data); setRespectSchedule(data.respectSchedule !== false); }, [request]);
  useEffect(() => { reload().catch(e => setError(e.message)); }, [reload]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const connect = () => run(async () => { const data = await request('connect', {}); location.assign(data.url); });
  const toggle = () => run(async () => { const enabled = !status?.enabled; await request('enable', { enabled, respectSchedule }); await reload(); setNotice(enabled ? 'Atendimento automático ativado no Instagram.' : 'Atendimento automático pausado no Instagram.'); });
  const disconnect = () => run(async () => { await request('disconnect', {}); await reload(); setNotice('Instagram desconectado.'); });
  const copy = (value: string) => run(async () => { await navigator.clipboard.writeText(value); setNotice('Copiado.'); });
  const date = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR') : 'Aguardando';
  const expired = !!status?.expiresAt && new Date(status.expiresAt).getTime() <= Date.now();

  return <div className="max-w-4xl mx-auto space-y-6 pb-8">
    <div className="flex items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-white flex items-center gap-3"><Instagram className="text-pink-400" /> {affiliate ? 'Instagram para Achadinhos' : 'Instagram Direct'}</h1>
        <p className="text-slate-400 mt-2">{affiliate ? 'Conecte o Instagram deste perfil para publicar Reels e enviar os links dos produtos.' : 'O mesmo assistente, catálogo e regras da sua loja, agora no Direct.'}</p></div>
      <button disabled={busy} onClick={() => run(reload)} className="p-3 rounded-xl bg-slate-800 text-slate-200 disabled:opacity-50" aria-label="Atualizar conexão"><RefreshCw className={busy ? 'animate-spin' : ''} size={20} /></button>
    </div>
    {error && <div role="alert" className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex gap-2"><AlertCircle className="shrink-0" size={20} />{error}</div>}
    {notice && <p role="status" className="p-4 rounded-xl bg-sky-500/10 text-sky-200">{notice}</p>}
    {affiliate && status?.connected && !status.affiliatePermissions && <p className="p-4 rounded-xl bg-amber-500/10 text-amber-200 text-sm">Renove a autorização para permitir publicações e comentários. Essas permissões precisam estar disponíveis no aplicativo Meta. As automações de links são ativadas por Reel na tela Conteúdo & Reels.</p>}
    {!status && !error && <p className="text-slate-400">Carregando conexão...</p>}
    {status && <>
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap gap-3 items-center justify-between"><div>
          <h2 className="text-lg font-bold text-white">{status.username ? `@${status.username}` : 'Conectar sua conta profissional'}</h2>
          <p className="text-sm text-slate-400 mt-1">{status.connected ? 'Autorização direta com o Instagram' : 'Autorize o acesso às mensagens pelo Instagram.'}</p>
        </div><span className={`text-sm rounded-full px-3 py-1 ${status.enabled && !expired ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
          {expired ? 'Autorização expirada' : status.enabled ? 'IA ativa' : status.connected ? 'IA pausada' : 'Não conectado'}</span></div>
        {!status.configured && <div className="rounded-xl bg-amber-500/10 p-4 text-amber-200 text-sm">
          <p>Primeiro, configure o aplicativo Meta no servidor. Depois o botão de conexão será liberado.</p>
          <p className="mt-2">Configurações pendentes: {status.missing.join(', ')}.</p>
        </div>}
        {status.lastError && <p role="alert" className="text-rose-300 text-sm">{status.lastError}</p>}
        <label className="flex gap-3 items-start text-sm text-slate-300">
          <input type="checkbox" checked={respectSchedule} disabled={busy || status.enabled} onChange={e => setRespectSchedule(e.target.checked)} className="mt-1" />
          <span>Seguir o horário da IA da loja.<span className="block text-xs text-slate-500">Desmarque antes de ativar para atender 24h somente no Instagram. O WhatsApp mantém seu horário.</span></span>
        </label>
        {respectSchedule && !status.storeOpen && <p className="text-sm text-amber-300">A loja está fora do horário de atendimento da IA. Novas mensagens seguirão a regra de fora de expediente configurada na loja.</p>}
        <div className="flex flex-wrap gap-3">
          <button onClick={connect} disabled={busy || !status.configured} className="bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white px-5 py-3 rounded-xl font-semibold flex items-center gap-2"><Instagram size={18} />{status.connected ? 'Renovar autorização' : 'Conectar Instagram'}</button>
          {status.connected && <>
            <button onClick={toggle} disabled={busy || expired} className="bg-slate-800 text-white px-5 py-3 rounded-xl font-semibold disabled:opacity-40">{status.enabled ? 'Pausar IA' : 'Ativar IA no Direct'}</button>
            <button onClick={disconnect} disabled={busy} className="text-slate-400 px-3 py-3 disabled:opacity-40">Desconectar</button>
          </>}
        </div>
        {status.connected && <div className="grid sm:grid-cols-3 gap-4 text-sm border-t border-slate-800 pt-4">
          <div><p className="text-slate-500">Última mensagem recebida</p><p className="text-slate-200 mt-1">{date(status.lastInboundAt)}</p></div>
          <div><p className="text-slate-500">Última resposta enviada</p><p className="text-slate-200 mt-1">{date(status.lastOutboundAt)}</p></div>
          <div><p className="text-slate-500">Autorização válida até</p><p className="text-slate-200 mt-1">{date(status.expiresAt)}</p></div>
        </div>}
      </section>
      {automotive&&<InstagramAcquisitionView establishmentId={establishmentId} onReconnect={connect}/>}
      {!affiliate && !automotive && <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h2 className="font-bold text-white">Trocar o atendimento do ManyChat</h2>
        <ol className="list-decimal pl-5 space-y-3 text-slate-300 text-sm">
          <li>Conecte sua conta acima. A autorização não ativa o chatbot automaticamente.</li>
          <li>No ManyChat, pause as automações e a resposta padrão desse Instagram.</li>
          <li>Ative a IA no Direct e envie uma mensagem de outra conta. Verifique a resposta e atualize os horários de recebimento e envio acima.</li>
          <li>Depois do teste, remova a conexão do Instagram no ManyChat. Se o teste falhar, pause esta IA antes de reativar o atendimento anterior.</li>
        </ol>
        <p className="text-xs text-slate-500">As conversas ficam separadas das do WhatsApp. A IA responde a mensagens recebidas e respeita as permissões e a janela de atendimento do Instagram.</p>
      </section>}
      <details className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <summary className="text-white font-semibold cursor-pointer">Configuração inicial na Meta</summary>
        <div className="space-y-4 mt-5 text-sm text-slate-300">
          <p>Crie um aplicativo com Instagram API e Instagram Login. Configure as permissões de perfil profissional e mensagens. Para uso público, conclua os requisitos de acesso da Meta.</p>
          <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="text-pink-300 inline-flex items-center gap-2">Abrir Meta for Developers <ExternalLink size={14} /></a>
          {[['URL de redirecionamento OAuth', status.redirectUri], ['URL do webhook', status.webhookUrl], ['Token de verificação do webhook', status.verifyToken]].map(([label, value]) => <div key={label}>
            <p className="text-slate-400 mb-1">{label}</p><div className="flex gap-2 items-center"><code className="min-w-0 break-all flex-1 bg-slate-950 p-3 rounded-lg">{value || 'Configure no servidor'}</code>
              {value && <button onClick={() => copy(value)} disabled={busy} aria-label={`Copiar ${label}`} className="p-2"><Copy size={17} /></button>}</div>
          </div>)}
          <p>Assine os campos <code>messages</code>{(automotive||affiliate)&&<> e <code>comments</code></>} no webhook do Instagram.</p>
          <p className="flex gap-2 items-center">{status.webhookVerifiedAt && <CheckCircle2 size={16} className="text-emerald-400" />}Webhook verificado: {date(status.webhookVerifiedAt)}</p>
        </div>
      </details>
    </>}
  </div>;
}
