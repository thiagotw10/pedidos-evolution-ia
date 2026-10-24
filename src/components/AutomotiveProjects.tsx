import React, { useEffect, useState, useMemo } from 'react';
import {
  MessageSquare,
  Globe,
  RefreshCw,
  Search,
  ExternalLink,
  Car,
  User,
  MapPin,
  Flame,
  Sparkles,
  CheckCircle2,
  X,
  Bot,
  FileText,
  Wrench,
  DollarSign,
  Target
} from 'lucide-react';
import { auth } from '../lib/firebase';

const stages = [
  'Novo contato',
  'Qualificação',
  'Análise técnica',
  'Orçamento enviado',
  'Aprovado',
  'Em execução',
  'Enviado',
  'Concluído',
  'Cancelado'
];

type Project = {
  id: string;
  customerName: string;
  phone: string;
  brand: string;
  model: string;
  year: string;
  version: string;
  modifications: string;
  objective: string;
  cep: string;
  delivery: string;
  status: string;
  source?: 'public_site' | 'whatsapp_ai' | string;
  whatsappConnected?: boolean;
  conversationSummary?: string;
  lastMessage?: string;
  lastAssistantReply?: string;
  interactionCount?: number;
  leadTemperature?: 'HOT' | 'WARM' | 'COLD';
  references: { id: string; name: string }[];
  notes?: string;
  quote?: string;
  freight?: string;
  leadTime?: string;
  tracking?: string;
  trafficSource?: 'META_ADS' | 'GOOGLE_ADS' | 'SITE' | 'ORGANIC' | string;
  campaignName?: string;
  adName?: string;
  quoteValue?: number;
  commissionPercent?: number;
  commissionValue?: number;
  createdAt?: string;
  updatedAt?: string;
};

type ConversationMessage = {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  mediaUrl?: string;
};

export function AutomotiveProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('Todos');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'WHATSAPP' | 'SITE'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Conversation history state for the selected project
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [conversationContext, setConversationContext] = useState<any>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);

  async function request(path = '', method = 'GET', body?: unknown) {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Entre novamente para acessar os projetos.');
    const response = await fetch(`/api/automotive/projects${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  }

  async function refresh() {
    setBusy(true);
    setError('');
    try {
      setProjects(await request());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function loadProjectConversation(project: Project) {
    setLoadingConversation(true);
    setConversationMessages([]);
    setConversationContext(null);
    try {
      const data = await request(`/${project.id}/conversation`);
      if (data) {
        setConversationMessages(Array.isArray(data.messages) ? data.messages : []);
        setConversationContext(data.context || null);
      }
    } catch {
      // Fallback gracefully if no chat messages exist yet
    } finally {
      setLoadingConversation(false);
    }
  }

  function handleSelectProject(project: Project) {
    setSelected({
      ...project,
      references: Array.isArray(project.references) ? project.references : []
    });
    void loadProjectConversation(project);
  }

  async function save() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await request(`/${selected.id}`, 'PATCH', selected);
      setProjects(p => p.map(v => (v.id === selected.id ? selected : v)));
      setSelected(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      if (filter !== 'Todos' && p.status !== filter) return false;
      if (sourceFilter === 'WHATSAPP' && p.source !== 'whatsapp_ai' && !p.whatsappConnected) return false;
      if (sourceFilter === 'SITE' && p.source !== 'public_site') return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const haystack = [
          p.customerName,
          p.phone,
          p.brand,
          p.model,
          p.year,
          p.version,
          p.objective,
          p.conversationSummary,
          p.id
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [projects, filter, sourceFilter, searchTerm]);

  const stats = useMemo(() => {
    const total = projects.length;
    const fromWhatsApp = projects.filter(p => p.source === 'whatsapp_ai' || p.whatsappConnected).length;
    const awaitingTech = projects.filter(p => ['Novo contato', 'Qualificação', 'Análise técnica'].includes(p.status)).length;
    const hotLeads = projects.filter(p => p.leadTemperature === 'HOT' || p.status === 'Análise técnica').length;
    return { total, fromWhatsApp, awaitingTech, hotLeads };
  }, [projects]);

  function buildWhatsAppDirectUrl(project: Project) {
    const clean = String(project.phone || '').replace(/\D/g, '');
    if (!clean) return '';
    const waPhone = clean.startsWith('55') ? clean : `55${clean}`;
    const vehicle = [project.brand, project.model, project.year, project.version].filter(Boolean).join(' ');
    const text = `Olá, ${project.customerName || 'tudo bem'}! Sou da equipe técnica e vi seu interesse no projeto para ${vehicle || 'seu veículo'} (${project.objective || 'escapamento/performance'}). Vamos avançar com sua análise e orçamento?`;
    return `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`;
  }

  return (
    <section className="max-w-6xl mx-auto p-5 md:p-10 text-slate-100 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-orange-300 text-xs uppercase tracking-widest font-semibold flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5" />
            CRM Performance & Escapamentos
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold mt-1.5">Projetos & Orçamentos</h1>
          <p className="text-slate-400 text-sm mt-1">
            Leads qualificados pelo Agente Chatbot no WhatsApp e solicitações da vitrine pública com contexto salvo por contato.
          </p>
        </div>
        <button
          disabled={busy}
          onClick={refresh}
          className="self-start sm:self-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-bold flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin text-orange-400' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-white/10 bg-slate-900/90 p-4">
          <span className="text-[11px] uppercase tracking-wider text-slate-400">Total no CRM</span>
          <p className="text-2xl font-black text-white mt-1">{stats.total}</p>
          <span className="text-[11px] text-slate-400">Interessados e projetos</span>
        </div>
        <div className="rounded-2xl border border-emerald-500/25 bg-slate-900/90 p-4">
          <span className="text-[11px] uppercase tracking-wider text-emerald-400 flex items-center gap-1">
            <MessageSquare className="w-3 h-3" /> Interações WhatsApp
          </span>
          <p className="text-2xl font-black text-emerald-400 mt-1">{stats.fromWhatsApp}</p>
          <span className="text-[11px] text-slate-400">Com contexto salvo pela IA</span>
        </div>
        <div className="rounded-2xl border border-orange-500/25 bg-slate-900/90 p-4">
          <span className="text-[11px] uppercase tracking-wider text-orange-300 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Triagem / Análise
          </span>
          <p className="text-2xl font-black text-orange-300 mt-1">{stats.awaitingTech}</p>
          <span className="text-[11px] text-slate-400">Aguardando retorno técnico</span>
        </div>
        <div className="rounded-2xl border border-amber-500/25 bg-slate-900/90 p-4">
          <span className="text-[11px] uppercase tracking-wider text-amber-300 flex items-center gap-1">
            <Flame className="w-3 h-3" /> Prontos p/ Orçamento
          </span>
          <p className="text-2xl font-black text-amber-300 mt-1">{stats.hotLeads}</p>
          <span className="text-[11px] text-slate-400">Dados técnicos coletados</span>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm">
          {error}
        </p>
      )}

      {/* Search & Origin Filter */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por cliente, telefone, carro (ex: Porsche, BMW M3), objetivo ou protocolo..."
            className="w-full bg-slate-900 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-400"
          />
        </div>
        <div className="flex items-center gap-1.5 bg-slate-900 border border-white/10 p-1 rounded-xl text-xs">
          <button
            type="button"
            onClick={() => setSourceFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
              sourceFilter === 'ALL' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Todas Origens
          </button>
          <button
            type="button"
            onClick={() => setSourceFilter('WHATSAPP')}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition cursor-pointer ${
              sourceFilter === 'WHATSAPP'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3 h-3" />
            WhatsApp IA
          </button>
          <button
            type="button"
            onClick={() => setSourceFilter('SITE')}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition cursor-pointer ${
              sourceFilter === 'SITE'
                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Globe className="w-3 h-3" />
            Vitrine Site
          </button>
        </div>
      </div>

      {/* Stage Filter Pills */}
      <div className="flex overflow-x-auto gap-2 py-1">
        {['Todos', ...stages].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition cursor-pointer ${
              filter === s ? 'bg-orange-400 text-black' : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {s} ({projects.filter(p => s === 'Todos' || p.status === s).length})
          </button>
        ))}
      </div>

      {busy && <p role="status" className="text-sm text-slate-400">Carregando…</p>}

      {/* CRM Cards Grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {filteredProjects.map(p => {
          const isWhatsAppLead = p.source === 'whatsapp_ai';
          const hasWhatsAppSync = isWhatsAppLead || p.whatsappConnected;
          const refsList = Array.isArray(p.references) ? p.references : [];

          return (
            <div
              key={p.id}
              onClick={() => handleSelectProject(p)}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') handleSelectProject(p);
              }}
              className="text-left rounded-2xl border border-white/10 hover:border-orange-400/50 bg-slate-900 p-5 transition cursor-pointer flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-orange-300 text-xs font-semibold">
                    {p.status} · {p.id.slice(0, 8)}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isWhatsAppLead ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        <Bot className="w-3 h-3" /> Chatbot WhatsApp
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/30">
                        <Globe className="w-3 h-3" /> Vitrine Pública
                      </span>
                    )}
                    {!isWhatsAppLead && hasWhatsAppSync && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        <MessageSquare className="w-2.5 h-2.5" /> Ativo no WhatsApp
                      </span>
                    )}
                    {p.leadTemperature === 'HOT' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        <Flame className="w-2.5 h-2.5" /> Qualificado
                      </span>
                    )}
                    {(p.trafficSource === 'META_ADS' || p.campaignName) && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        <Target className="w-2.5 h-2.5" /> Anúncio: {p.campaignName || 'Meta Ads'}
                      </span>
                    )}
                    {Number(p.quoteValue || 0) > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <DollarSign className="w-2.5 h-2.5" /> R$ {Number(p.quoteValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                </div>

                <h2 className="font-bold text-xl mt-2 text-white">
                  {p.brand || 'Veículo'} {p.model || ''}{p.year ? ` · ${p.year}` : ''}{p.version ? ` (${p.version})` : ''}
                </h2>

                <p className="text-slate-300 text-sm mt-1 flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>{p.customerName || 'Cliente'}</span>
                  {p.phone && <span className="text-slate-500 font-mono text-xs">· +{p.phone}</span>}
                </p>

                <p className="mt-3 text-sm text-slate-200 line-clamp-2">{p.objective}</p>

                {p.conversationSummary && p.conversationSummary !== p.objective && (
                  <div className="mt-2.5 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 line-clamp-2">
                    <span className="text-emerald-400 font-semibold">Contexto IA: </span>
                    {p.conversationSummary}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-2 text-xs text-slate-400">
                <span>
                  {p.delivery || 'Modalidade a definir'} · {p.cep ? `CEP ${p.cep}` : 'CEP não informado'}
                </span>
                <div className="flex items-center gap-2">
                  {p.interactionCount ? (
                    <span className="text-[11px] text-emerald-400 font-medium">
                      {p.interactionCount} interaç{p.interactionCount === 1 ? 'ão' : 'ões'}
                    </span>
                  ) : null}
                  {refsList.length > 0 && (
                    <span className="text-[11px] text-orange-300 font-medium">
                      {refsList.length} ref(s)
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!busy && !filteredProjects.length && (
        <p className="p-8 border border-dashed border-white/20 rounded-2xl text-slate-400 text-center">
          As solicitações feitas na vitrine e os leads qualificados pelo agente chatbot no WhatsApp aparecerão aqui.
        </p>
      )}

      {/* Detail & Conversation Context Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/80 flex justify-center items-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Detalhes do projeto"
            className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-4xl w-full max-h-[92vh] overflow-auto space-y-5"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-orange-400/20 text-orange-300 border border-orange-400/30">
                    Protocolo #{selected.id.slice(0, 8)}
                  </span>
                  {selected.source === 'whatsapp_ai' ? (
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Origem: Agente Chatbot WhatsApp
                    </span>
                  ) : (
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      Origem: Vitrine Pública
                    </span>
                  )}
                </div>
                <h2 className="font-bold text-2xl mt-2 text-white">
                  {selected.brand} {selected.model} {selected.year && `· ${selected.year}`}
                </h2>
                <p className="text-slate-400 text-sm mt-1">
                  {selected.customerName} · {selected.phone}
                  <br />
                  {selected.year || 'Ano a confirmar'} · {selected.version || 'Versão a confirmar'}
                  <br />
                  {selected.modifications || 'Sem modificações informadas'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {selected.phone && (
                  <a
                    href={buildWhatsAppDirectUrl(selected)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition no-underline"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Chamar no WhatsApp</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <button
                  disabled={busy}
                  onClick={() => setSelected(null)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Left Column: Project & Commercial CRM Fields */}
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-white/10 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-orange-300 flex items-center gap-1.5">
                    <Car className="w-3.5 h-3.5" /> Escopo & Interesse do Cliente
                  </p>
                  <p className="text-sm text-slate-200 whitespace-pre-line">{selected.objective}</p>
                  <p className="text-xs text-slate-400 pt-1">
                    Referências:{' '}
                    {(selected.references || []).map(r => r.name).join(', ') || 'A definir'}
                  </p>
                  <p className="text-xs text-slate-400">
                    Modalidade: {selected.delivery || 'A definir'} · CEP: {selected.cep || 'Não informado'}
                  </p>
                </div>

                {/* Editable qualification fields in case consultant collects more details */}
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs text-slate-300">
                    Cliente
                    <input
                      type="text"
                      value={selected.customerName || ''}
                      onChange={e => setSelected({ ...selected, customerName: e.target.value })}
                      className="block w-full bg-slate-800 rounded-xl p-2.5 mt-1 text-white text-xs"
                    />
                  </label>
                  <label className="block text-xs text-slate-300">
                    CEP
                    <input
                      type="text"
                      value={selected.cep || ''}
                      onChange={e => setSelected({ ...selected, cep: e.target.value })}
                      className="block w-full bg-slate-800 rounded-xl p-2.5 mt-1 text-white text-xs"
                    />
                  </label>
                  <label className="block text-xs text-slate-300">
                    Marca
                    <input
                      type="text"
                      value={selected.brand || ''}
                      onChange={e => setSelected({ ...selected, brand: e.target.value })}
                      className="block w-full bg-slate-800 rounded-xl p-2.5 mt-1 text-white text-xs"
                    />
                  </label>
                  <label className="block text-xs text-slate-300">
                    Modelo
                    <input
                      type="text"
                      value={selected.model || ''}
                      onChange={e => setSelected({ ...selected, model: e.target.value })}
                      className="block w-full bg-slate-800 rounded-xl p-2.5 mt-1 text-white text-xs"
                    />
                  </label>
                  <label className="block text-xs text-slate-300">
                    Ano
                    <input
                      type="text"
                      value={selected.year || ''}
                      onChange={e => setSelected({ ...selected, year: e.target.value })}
                      className="block w-full bg-slate-800 rounded-xl p-2.5 mt-1 text-white text-xs"
                    />
                  </label>
                  <label className="block text-xs text-slate-300">
                    Versão / Motor
                    <input
                      type="text"
                      value={selected.version || ''}
                      onChange={e => setSelected({ ...selected, version: e.target.value })}
                      className="block w-full bg-slate-800 rounded-xl p-2.5 mt-1 text-white text-xs"
                    />
                  </label>
                </div>

                <label className="block text-sm text-slate-200 font-semibold">
                  Etapa
                  <select
                    value={selected.status}
                    onChange={e => setSelected({ ...selected, status: e.target.value })}
                    className="block w-full bg-slate-800 p-3 rounded-xl my-2 text-sm text-white"
                  >
                    {stages.map(s => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>

                {/* Financial Quote & Commission Section */}
                <div className="p-3.5 rounded-xl bg-slate-900 border border-cyan-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5" /> Financeiro & Comissão por Venda
                    </span>
                    {selected.trafficSource && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        {selected.trafficSource} {selected.campaignName ? `(${selected.campaignName})` : ''}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs text-slate-300">
                      Valor do Projeto (R$)
                      <input
                        type="number"
                        step="50"
                        min="0"
                        value={selected.quoteValue ?? ''}
                        onChange={e => {
                          const val = Number(e.target.value);
                          const commPct = selected.commissionPercent ?? 4;
                          setSelected({
                            ...selected,
                            quoteValue: val,
                            commissionValue: Number(((val * commPct) / 100).toFixed(2))
                          });
                        }}
                        placeholder="Ex: 3800.00"
                        className="block w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 mt-1 text-white text-xs font-bold font-mono"
                      />
                    </label>

                    <label className="block text-xs text-slate-300">
                      % Comissão Acordada
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="50"
                        value={selected.commissionPercent ?? 4}
                        onChange={e => {
                          const commPct = Number(e.target.value);
                          const val = selected.quoteValue ?? 0;
                          setSelected({
                            ...selected,
                            commissionPercent: commPct,
                            commissionValue: Number(((val * commPct) / 100).toFixed(2))
                          });
                        }}
                        placeholder="Ex: 4"
                        className="block w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 mt-1 text-white text-xs font-bold font-mono"
                      />
                    </label>
                  </div>

                  {Number(selected.quoteValue || 0) > 0 && (
                    <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-between text-xs">
                      <span className="text-emerald-300 font-semibold">Sua Comissão nesta Venda:</span>
                      <span className="text-emerald-400 font-bold text-sm font-mono">
                        R$ {Number(selected.commissionValue || ((Number(selected.quoteValue) * Number(selected.commissionPercent || 4)) / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </div>

                {(
                  [
                    ['quote', 'Orçamento / condições (manual)'],
                    ['freight', 'Frete / transportadora (manual)'],
                    ['leadTime', 'Prazo de produção e transporte'],
                    ['tracking', 'Código de rastreamento'],
                    ['notes', 'Notas técnicas internas']
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block mt-3 text-sm text-slate-300">
                    {label}
                    <textarea
                      maxLength={3000}
                      rows={2}
                      value={selected[key] || ''}
                      onChange={e => setSelected({ ...selected, [key]: e.target.value })}
                      className="block w-full bg-slate-800 rounded-xl p-3 mt-1.5 text-xs text-white"
                    />
                  </label>
                ))}
              </div>

              {/* Right Column: Saved WhatsApp Conversation Context & Chat History */}
              <div className="flex flex-col rounded-2xl bg-slate-950 border border-white/10 p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-emerald-400" />
                    <h3 className="font-bold text-sm text-white">
                      Contexto & Histórico da Conversa (WhatsApp)
                    </h3>
                  </div>
                  <span className="text-[11px] text-emerald-400 font-semibold">
                    {conversationMessages.length} mensagen(s)
                  </span>
                </div>

                {/* Context Summary Box */}
                {(selected.conversationSummary || conversationContext?.summary) && (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> Resumo de Contexto Salvo pela IA
                    </p>
                    <p className="text-xs text-slate-200 leading-relaxed">
                      {conversationContext?.summary || selected.conversationSummary}
                    </p>
                  </div>
                )}

                {/* Chat Transcript */}
                <div className="flex-1 min-h-[260px] max-h-[420px] overflow-y-auto space-y-2.5 pr-1">
                  {loadingConversation ? (
                    <p className="text-xs text-slate-400 text-center py-8">
                      Carregando histórico de mensagens do contato...
                    </p>
                  ) : conversationMessages.length > 0 ? (
                    conversationMessages.map(msg => {
                      const isCustomer = msg.sender === 'user';
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'}`}
                        >
                          <div
                            className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-line ${
                              isCustomer
                                ? 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700'
                                : 'bg-emerald-500/15 text-emerald-100 rounded-tr-none border border-emerald-500/30'
                            }`}
                          >
                            <div className="text-[10px] font-bold mb-1 opacity-75">
                              {isCustomer ? `👤 ${selected.customerName || 'Cliente'}` : '🤖 Consultor IA da Loja'}
                            </div>
                            {msg.text}
                            <div className="text-[9px] opacity-60 mt-1 text-right">
                              {msg.timestamp
                                ? new Date(msg.timestamp).toLocaleString('pt-BR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                : ''}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-10 space-y-2 text-slate-500">
                      <MessageSquare className="w-6 h-6 mx-auto opacity-40" />
                      <p className="text-xs">
                        {selected.lastMessage
                          ? `Última interação registrada: "${selected.lastMessage}"`
                          : 'Este projeto foi registrado pela vitrine pública e ainda não possui mensagens trocadas no chat automático.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-white/10">
              <p className="text-xs text-slate-400 mb-3">
                Salvar atualiza o CRM técnico da loja. O envio de proposta comercial e cobrança continuam sob controle da equipe.
              </p>
              {error && (
                <p role="alert" className="text-red-300 text-sm mb-3">
                  {error}
                </p>
              )}
              <button
                disabled={busy}
                onClick={save}
                className="bg-orange-400 hover:bg-orange-300 text-black rounded-xl p-3.5 w-full font-bold transition cursor-pointer disabled:opacity-50"
              >
                {busy ? 'Salvando…' : 'Salvar projeto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
