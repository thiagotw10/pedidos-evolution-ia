import React, { useEffect, useState, useMemo } from 'react';
import {
  MessageSquare,
  Globe,
  RefreshCw,
  Search,
  ExternalLink,
  Car,
  User,
  Flame,
  Sparkles,
  CheckCircle2,
  X,
  Bot,
  FileText,
  Wrench,
  DollarSign,
  Target,
  Pause,
  Play,
  Send,
  Columns,
  List,
  Clock,
  ChevronRight
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

const kanbanStages = [
  'Novo contato',
  'Qualificação',
  'Análise técnica',
  'Orçamento enviado',
  'Aprovado',
  'Em execução'
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
  aiPaused?: boolean;
  aiPausedUntil?: string | null;
  proposalSentAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

type ConversationMessage = {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  author?: string;
  text: string;
  timestamp: string;
  mediaUrl?: string;
};

export function AutomotiveProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('Todos');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'WHATSAPP' | 'SITE'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');

  // Conversation history state for the selected project
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [conversationContext, setConversationContext] = useState<any>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);

  // Proposal modal state
  const [proposalModalOpen, setProposalModalOpen] = useState(false);
  const [proposalDraft, setProposalDraft] = useState('');
  const [sendingProposal, setSendingProposal] = useState(false);

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
    if (!response.ok) throw new Error(data.error || 'Erro na requisição');
    return data;
  }

  async function refresh() {
    setBusy(true);
    setError('');
    try {
      const data = await request();
      setProjects(data);
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
    setActionSuccess('');
    void loadProjectConversation(project);
  }

  async function save() {
    if (!selected) return;
    setBusy(true);
    setError('');
    setActionSuccess('');
    try {
      await request(`/${selected.id}`, 'PATCH', selected);
      setProjects(p => p.map(v => (v.id === selected.id ? selected : v)));
      setActionSuccess('Projeto salvo com sucesso!');
      setTimeout(() => setActionSuccess(''), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Human Takeover: Pausar IA
  async function handlePauseAi(project: Project, durationMinutes: number | null) {
    setBusy(true);
    setError('');
    try {
      const res = await request(`/${project.id}/pause-ai`, 'POST', { durationMinutes });
      const updated = {
        ...project,
        aiPaused: true,
        aiPausedUntil: res.aiPausedUntil ?? null
      };
      setProjects(p => p.map(v => (v.id === project.id ? updated : v)));
      if (selected?.id === project.id) {
        setSelected(updated);
      }
      setActionSuccess(
        durationMinutes
          ? `IA pausada por ${durationMinutes} minutos. O atendimento manual (Pedro) está ativo!`
          : 'IA pausada até você reativar manualmente.'
      );
      setTimeout(() => setActionSuccess(''), 4000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Human Takeover: Retomar IA
  async function handleResumeAi(project: Project) {
    setBusy(true);
    setError('');
    try {
      await request(`/${project.id}/resume-ai`, 'POST');
      const updated = {
        ...project,
        aiPaused: false,
        aiPausedUntil: null
      };
      setProjects(p => p.map(v => (v.id === project.id ? updated : v)));
      if (selected?.id === project.id) {
        setSelected(updated);
      }
      setActionSuccess('IA retomada! O assistente voltará a responder automaticamente este cliente.');
      setTimeout(() => setActionSuccess(''), 4000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Avanço rápido de estágio
  async function handleQuickAdvanceStage(project: Project, nextStage: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    try {
      await request(`/${project.id}`, 'PATCH', { status: nextStage });
      setProjects(p => p.map(v => (v.id === project.id ? { ...v, status: nextStage } : v)));
      if (selected?.id === project.id) {
        setSelected({ ...selected, status: nextStage });
      }
    } catch (err: any) {
      setError(err.message);
    }
  }

  // Preparar proposta formatada e abrir modal de disparo
  function openProposalComposer(project: Project) {
    const vehicle = [project.brand, project.model, project.year, project.version].filter(Boolean).join(' ');
    const val = project.quoteValue
      ? `R$ ${Number(project.quoteValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      : project.quote || 'Sob consulta técnica';
    const prazo = project.leadTime || '7 a 15 dias úteis de fabricação';
    const frete = project.freight ? `Frete: ${project.freight}` : (project.cep ? `Entrega para CEP ${project.cep}` : 'Entrega a combinar / instalação na loja');
    const condicoes = project.quote || 'À vista via Pix ou até 12x no cartão de crédito';

    const draft = `Olá, ${project.customerName || 'amigo(a)'}! Tudo bem? Aqui é o Pedro da equipe técnica e projetos.

Montei a proposta personalizada para o seu ${vehicle || 'veículo'}:

🎯 *Escopo do Projeto:*
${project.objective || 'Sistema de escapamento esportivo em inox com ronco encorpado e ganho de fluxo.'}

💰 *Investimento:* ${val}
💳 *Condições:* ${condicoes}
📦 *Prazo de Produção:* ${prazo}
🚚 *Entrega / Instalação:* ${frete}

Trabalhamos com aço inox de alta durabilidade, solda TIG artesanal e gabarito milimétrico sem adaptações destrutivas.

Gostaria de garantir sua vaga na fila de produção ou ficou com alguma dúvida sobre o ronco e especificações?`;

    setProposalDraft(draft);
    setProposalModalOpen(true);
  }

  // Disparar proposta no WhatsApp oficial
  async function handleSendProposal() {
    if (!selected) return;
    setSendingProposal(true);
    setError('');
    try {
      const res = await request(`/${selected.id}/send-proposal`, 'POST', {
        proposalText: proposalDraft
      });
      const updated: Project = {
        ...selected,
        status: 'Orçamento enviado',
        proposalSentAt: res.proposalSentAt
      };
      setProjects(p => p.map(v => (v.id === selected.id ? updated : v)));
      setSelected(updated);
      setProposalModalOpen(false);
      setActionSuccess('✅ Proposta enviada com sucesso no WhatsApp do cliente!');
      setTimeout(() => setActionSuccess(''), 4000);
      void loadProjectConversation(updated);
    } catch (e: any) {
      setError(e.message || 'Falha ao enviar proposta');
    } finally {
      setSendingProposal(false);
    }
  }

  function isAiCurrentlyPaused(p: Project) {
    if (!p.aiPaused) return false;
    if (!p.aiPausedUntil) return true;
    return new Date(p.aiPausedUntil).getTime() > Date.now();
  }

  function formatRemainingPause(p: Project) {
    if (!p.aiPausedUntil) return 'Indeterminado (até reativar)';
    const diffMs = new Date(p.aiPausedUntil).getTime() - Date.now();
    if (diffMs <= 0) return 'Expirado';
    const mins = Math.round(diffMs / 60000);
    if (mins < 60) return `${mins} min restantes`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return remMins > 0 ? `${hours}h ${remMins}m restantes` : `${hours}h restantes`;
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
          p.campaignName,
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
    const totalPipelineValue = projects.reduce((acc, curr) => acc + (Number(curr.quoteValue) || 0), 0);
    const pausedAiCount = projects.filter(isAiCurrentlyPaused).length;
    return { total, fromWhatsApp, awaitingTech, hotLeads, totalPipelineValue, pausedAiCount };
  }, [projects]);

  function buildWhatsAppDirectUrl(project: Project) {
    const clean = String(project.phone || '').replace(/\D/g, '');
    if (!clean) return '';
    const waPhone = clean.startsWith('55') ? clean : `55${clean}`;
    const vehicle = [project.brand, project.model, project.year, project.version].filter(Boolean).join(' ');
    const text = `Olá, ${project.customerName || 'tudo bem'}! Sou o Pedro da equipe técnica e vi seu projeto para ${vehicle || 'seu veículo'} (${project.objective || 'escapamento/performance'}). Como posso te ajudar hoje?`;
    return `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`;
  }

  return (
    <section className="max-w-7xl mx-auto p-4 sm:p-8 text-slate-100 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-orange-400 text-xs uppercase tracking-widest font-semibold flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5" />
            CRM & Pipeline Performance Automotiva
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold mt-1 text-white flex items-center gap-2">
            Projetos & Orçamentos
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-2xl">
            Gestão completa de leads de tráfego pago (Meta Ads) e vitrine pública. Assuma conversas a qualquer momento (Human Takeover) e dispare propostas no WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-900 border border-white/10 p-1 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer ${
                viewMode === 'kanban'
                  ? 'bg-orange-400 text-black shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Funil / Kanban</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-orange-400 text-black shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Lista Detalhada</span>
            </button>
          </div>

          <button
            disabled={busy}
            onClick={refresh}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-xs font-bold flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin text-orange-400' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-white/10 bg-slate-900/90 p-4">
          <span className="text-[11px] uppercase tracking-wider text-slate-400">Total no Pipeline</span>
          <p className="text-2xl font-black text-white mt-1">{stats.total}</p>
          <span className="text-[11px] text-slate-400">Projetos em carteira</span>
        </div>
        <div className="rounded-2xl border border-emerald-500/25 bg-slate-900/90 p-4">
          <span className="text-[11px] uppercase tracking-wider text-emerald-400 flex items-center gap-1">
            <MessageSquare className="w-3 h-3" /> WhatsApp Leads
          </span>
          <p className="text-2xl font-black text-emerald-400 mt-1">{stats.fromWhatsApp}</p>
          <span className="text-[11px] text-slate-400">IA qualificando contatos</span>
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
            <Pause className="w-3 h-3" /> Takeover Humano
          </span>
          <p className="text-2xl font-black text-amber-300 mt-1">{stats.pausedAiCount}</p>
          <span className="text-[11px] text-slate-400">IA pausada (Pedro atendendo)</span>
        </div>
        <div className="rounded-2xl border border-cyan-500/25 bg-slate-900/90 p-4 col-span-2 lg:col-span-1">
          <span className="text-[11px] uppercase tracking-wider text-cyan-300 flex items-center gap-1">
            <DollarSign className="w-3 h-3" /> Volume em Propostas
          </span>
          <p className="text-2xl font-black text-cyan-300 mt-1">
            R$ {stats.totalPipelineValue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
          </p>
          <span className="text-[11px] text-slate-400">Soma de orçamentos ativos</span>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            {actionSuccess}
          </span>
          <button onClick={() => setActionSuccess('')} className="text-emerald-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search & Origin Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por cliente, telefone, carro (ex: Porsche, BMW M3, Gol Turbo), campanha ou protocolo..."
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

      {/* Stage Filter Pills for List View */}
      {viewMode === 'list' && (
        <div className="flex overflow-x-auto gap-2 py-1 scrollbar-thin">
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
      )}

      {/* KANBAN PIPELINE VIEW */}
      {viewMode === 'kanban' && (
        <div className="overflow-x-auto pb-4 pt-1">
          <div className="flex gap-4 min-w-[1280px]">
            {kanbanStages.map(stageName => {
              const columnProjects = filteredProjects.filter(p => p.status === stageName);
              const columnValue = columnProjects.reduce((acc, curr) => acc + (Number(curr.quoteValue) || 0), 0);

              return (
                <div
                  key={stageName}
                  className="flex-1 bg-slate-900/60 border border-white/5 rounded-2xl p-3 flex flex-col gap-3 min-w-[250px]"
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                    <div>
                      <h2 className="text-xs font-extrabold uppercase tracking-wide text-white flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                        {stageName}
                      </h2>
                      {columnValue > 0 && (
                        <p className="text-[10px] text-cyan-400 font-mono font-semibold mt-0.5">
                          R$ {columnValue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                      {columnProjects.length}
                    </span>
                  </div>

                  {/* Cards in Column */}
                  <div className="flex flex-col gap-2.5 min-h-[350px]">
                    {columnProjects.map(p => {
                      const isPaused = isAiCurrentlyPaused(p);
                      const isWhatsApp = p.source === 'whatsapp_ai';

                      return (
                        <div
                          key={p.id}
                          onClick={() => handleSelectProject(p)}
                          className="bg-slate-900 hover:bg-slate-800/90 border border-white/10 hover:border-orange-400/50 rounded-xl p-3.5 transition cursor-pointer space-y-2.5 text-left group shadow-sm"
                        >
                          {/* Badges */}
                          <div className="flex items-center justify-between gap-1 flex-wrap">
                            <span className="text-[10px] font-mono text-slate-400">
                              #{p.id.slice(0, 6)}
                            </span>
                            <div className="flex items-center gap-1 flex-wrap">
                              {isPaused ? (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  <Pause className="w-2.5 h-2.5" /> Pedro
                                </span>
                              ) : isWhatsApp ? (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  <Bot className="w-2.5 h-2.5" /> IA
                                </span>
                              ) : null}
                              {p.trafficSource === 'META_ADS' && (
                                <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                  Meta
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Vehicle & Customer */}
                          <div>
                            <h3 className="text-xs font-bold text-white group-hover:text-orange-300 transition line-clamp-1">
                              {p.brand} {p.model} {p.year && `· ${p.year}`}
                            </h3>
                            <p className="text-[11px] text-slate-300 flex items-center gap-1 mt-0.5">
                              <User className="w-3 h-3 text-slate-400" />
                              <span className="truncate">{p.customerName || 'Cliente'}</span>
                            </p>
                          </div>

                          {/* Objective */}
                          <p className="text-[11px] text-slate-400 line-clamp-2">
                            {p.objective || 'Interesse em escapamento esportivo'}
                          </p>

                          {/* Financial or Proposal Footer */}
                          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
                            {Number(p.quoteValue || 0) > 0 ? (
                              <span className="font-mono font-bold text-emerald-400">
                                R$ {Number(p.quoteValue).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-500">Sem valor def.</span>
                            )}

                            {/* Quick Next Stage Action */}
                            {stageName === 'Novo contato' && (
                              <button
                                type="button"
                                title="Avançar para Qualificação"
                                onClick={e => handleQuickAdvanceStage(p, 'Qualificação', e)}
                                className="px-2 py-0.5 rounded bg-white/10 hover:bg-orange-400 hover:text-black text-[10px] font-bold flex items-center gap-0.5 transition cursor-pointer"
                              >
                                <span>Qualificar</span>
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                            {stageName === 'Qualificação' && (
                              <button
                                type="button"
                                title="Avançar para Análise Técnica"
                                onClick={e => handleQuickAdvanceStage(p, 'Análise técnica', e)}
                                className="px-2 py-0.5 rounded bg-white/10 hover:bg-orange-400 hover:text-black text-[10px] font-bold flex items-center gap-0.5 transition cursor-pointer"
                              >
                                <span>Análise</span>
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                            {stageName === 'Análise técnica' && (
                              <button
                                type="button"
                                title="Avançar para Orçamento Enviado"
                                onClick={e => handleQuickAdvanceStage(p, 'Orçamento enviado', e)}
                                className="px-2 py-0.5 rounded bg-white/10 hover:bg-emerald-500 hover:text-black text-[10px] font-bold flex items-center gap-0.5 transition cursor-pointer"
                              >
                                <span>Proposta</span>
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                            {stageName === 'Orçamento enviado' && (
                              <button
                                type="button"
                                title="Aprovar e Enviar p/ Execução"
                                onClick={e => handleQuickAdvanceStage(p, 'Aprovado', e)}
                                className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500 hover:text-black text-emerald-300 text-[10px] font-bold flex items-center gap-0.5 transition cursor-pointer border border-emerald-500/30"
                              >
                                <span>Aprovar</span>
                                <CheckCircle2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {columnProjects.length === 0 && (
                      <div className="flex-1 border border-dashed border-white/5 rounded-xl flex items-center justify-center p-4 text-center">
                        <span className="text-[11px] text-slate-600">Nenhum projeto</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* LIST DETAILED VIEW */}
      {viewMode === 'list' && (
        <div className="grid md:grid-cols-2 gap-4">
          {filteredProjects.map(p => {
            const isWhatsAppLead = p.source === 'whatsapp_ai';
            const hasWhatsAppSync = isWhatsAppLead || p.whatsappConnected;
            const isPaused = isAiCurrentlyPaused(p);
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
                className="text-left rounded-2xl border border-white/10 hover:border-orange-400/50 bg-slate-900 p-5 transition cursor-pointer flex flex-col justify-between gap-3 shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-orange-300 text-xs font-semibold">
                      {p.status} · #{p.id.slice(0, 8)}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isPaused ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          <Pause className="w-2.5 h-2.5" /> Pedro no Controle ({formatRemainingPause(p)})
                        </span>
                      ) : isWhatsAppLead ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          <Bot className="w-3 h-3" /> IA Atendendo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/30">
                          <Globe className="w-3 h-3" /> Vitrine Pública
                        </span>
                      )}

                      {!isWhatsAppLead && hasWhatsAppSync && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          <MessageSquare className="w-2.5 h-2.5" /> WhatsApp Sincronizado
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
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
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
      )}

      {!busy && !filteredProjects.length && (
        <div className="p-12 border border-dashed border-white/10 rounded-2xl text-slate-400 text-center space-y-2">
          <Car className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-sm font-semibold text-slate-300">Nenhum projeto encontrado para o filtro aplicado</p>
          <p className="text-xs text-slate-500">
            As conversas de tráfego pago (Meta Ads) e cadastros da vitrine pública sincronizam automaticamente aqui.
          </p>
        </div>
      )}

      {/* Detail & Conversation Context Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex justify-center items-center p-3 sm:p-5">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Detalhes do projeto"
            className="bg-slate-900 border border-white/10 rounded-3xl p-5 sm:p-7 max-w-5xl w-full max-h-[94vh] overflow-y-auto space-y-5 shadow-2xl"
          >
            {/* Modal Top Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-white/10 pb-4">
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
                  {selected.trafficSource === 'META_ADS' && (
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                      <Target className="w-3 h-3" /> Campanha: {selected.campaignName || 'Meta Ads'}
                    </span>
                  )}
                </div>
                <h2 className="font-bold text-2xl mt-2 text-white">
                  {selected.brand} {selected.model} {selected.year && `· ${selected.year}`}
                </h2>
                <p className="text-slate-400 text-xs sm:text-sm mt-1">
                  Cliente: <strong className="text-slate-200">{selected.customerName}</strong> · Telefone:{' '}
                  <span className="font-mono text-slate-300">{selected.phone}</span>
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {selected.phone && (
                  <a
                    href={buildWhatsAppDirectUrl(selected)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition no-underline"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>WhatsApp Web</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <button
                  disabled={busy}
                  onClick={() => setSelected(null)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>

            {/* HUMAN TAKEOVER / AI CONTROL BAR */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isAiCurrentlyPaused(selected)
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  {isAiCurrentlyPaused(selected) ? <Pause className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    {isAiCurrentlyPaused(selected) ? (
                      <span className="text-amber-300 flex items-center gap-1">
                        <Pause className="w-3.5 h-3.5" /> Atendimento Humano Ativo (Pedro no controle)
                      </span>
                    ) : (
                      <span className="text-emerald-300 flex items-center gap-1">
                        <Bot className="w-3.5 h-3.5" /> IA Atendendo e Respondendo
                      </span>
                    )}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isAiCurrentlyPaused(selected)
                      ? `A IA está silenciada para este cliente. Tempo restante: ${formatRemainingPause(selected)}`
                      : 'Se você responder no WhatsApp ou assumir a conversa abaixo, a IA pausa automaticamente.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {isAiCurrentlyPaused(selected) ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleResumeAi(selected)}
                    className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Retomar IA Agora</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handlePauseAi(selected, 60)}
                      className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                    >
                      <Pause className="w-3 h-3" />
                      <span>Pausar 1h</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handlePauseAi(selected, 240)}
                      className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                    >
                      <Pause className="w-3 h-3" />
                      <span>Pausar 4h</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handlePauseAi(selected, null)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                    >
                      <Pause className="w-3 h-3" />
                      <span>Até reativar</span>
                    </button>
                  </>
                )}
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

                {/* Qualification Fields */}
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs text-slate-300">
                    Cliente
                    <input
                      type="text"
                      value={selected.customerName || ''}
                      onChange={e => setSelected({ ...selected, customerName: e.target.value })}
                      className="block w-full bg-slate-800 rounded-xl p-2.5 mt-1 text-white text-xs border border-white/5 focus:border-orange-400 focus:outline-none"
                    />
                  </label>
                  <label className="block text-xs text-slate-300">
                    CEP
                    <input
                      type="text"
                      value={selected.cep || ''}
                      onChange={e => setSelected({ ...selected, cep: e.target.value })}
                      className="block w-full bg-slate-800 rounded-xl p-2.5 mt-1 text-white text-xs border border-white/5 focus:border-orange-400 focus:outline-none"
                    />
                  </label>
                  <label className="block text-xs text-slate-300">
                    Marca
                    <input
                      type="text"
                      value={selected.brand || ''}
                      onChange={e => setSelected({ ...selected, brand: e.target.value })}
                      className="block w-full bg-slate-800 rounded-xl p-2.5 mt-1 text-white text-xs border border-white/5 focus:border-orange-400 focus:outline-none"
                    />
                  </label>
                  <label className="block text-xs text-slate-300">
                    Modelo
                    <input
                      type="text"
                      value={selected.model || ''}
                      onChange={e => setSelected({ ...selected, model: e.target.value })}
                      className="block w-full bg-slate-800 rounded-xl p-2.5 mt-1 text-white text-xs border border-white/5 focus:border-orange-400 focus:outline-none"
                    />
                  </label>
                  <label className="block text-xs text-slate-300">
                    Ano
                    <input
                      type="text"
                      value={selected.year || ''}
                      onChange={e => setSelected({ ...selected, year: e.target.value })}
                      className="block w-full bg-slate-800 rounded-xl p-2.5 mt-1 text-white text-xs border border-white/5 focus:border-orange-400 focus:outline-none"
                    />
                  </label>
                  <label className="block text-xs text-slate-300">
                    Versão / Motor
                    <input
                      type="text"
                      value={selected.version || ''}
                      onChange={e => setSelected({ ...selected, version: e.target.value })}
                      className="block w-full bg-slate-800 rounded-xl p-2.5 mt-1 text-white text-xs border border-white/5 focus:border-orange-400 focus:outline-none"
                    />
                  </label>
                </div>

                <label className="block text-sm text-slate-200 font-semibold">
                  Etapa do Funil
                  <select
                    value={selected.status}
                    onChange={e => setSelected({ ...selected, status: e.target.value })}
                    className="block w-full bg-slate-800 p-3 rounded-xl my-2 text-sm text-white border border-white/10"
                  >
                    {stages.map(s => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>

                {/* Financial Quote & Official WhatsApp Proposal Section */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-cyan-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5" /> Orçamento & Proposta Comercial
                    </span>
                    {selected.proposalSentAt && (
                      <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Proposta enviada em{' '}
                        {new Date(selected.proposalSentAt).toLocaleDateString('pt-BR')}
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
                        className="block w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 mt-1 text-white text-xs font-bold font-mono"
                      />
                    </label>

                    <label className="block text-xs text-slate-300">
                      % Comissão Estimada
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
                        className="block w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 mt-1 text-white text-xs font-bold font-mono"
                      />
                    </label>
                  </div>

                  {Number(selected.quoteValue || 0) > 0 && (
                    <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between text-xs">
                      <span className="text-emerald-300 font-semibold">Comissão Técnica da Venda:</span>
                      <span className="text-emerald-400 font-bold text-sm font-mono">
                        R${' '}
                        {Number(
                          selected.commissionValue ||
                            (Number(selected.quoteValue) * Number(selected.commissionPercent || 4)) / 100
                        ).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}

                  {/* 1-CLICK PROPOSAL DISPATCH BUTTON */}
                  <button
                    type="button"
                    onClick={() => openProposalComposer(selected)}
                    className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>⚡ Enviar Proposta Formatada no WhatsApp</span>
                  </button>
                </div>

                {(
                  [
                    ['quote', 'Orçamento / condições de pagamento (manual)'],
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
                      className="block w-full bg-slate-800 rounded-xl p-3 mt-1.5 text-xs text-white border border-white/5"
                    />
                  </label>
                ))}
              </div>

              {/* Right Column: WhatsApp History & AI Context Transcript */}
              <div className="flex flex-col rounded-2xl bg-slate-950 border border-white/10 p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-emerald-400" />
                    <h3 className="font-bold text-sm text-white">
                      Histórico da Conversa WhatsApp
                    </h3>
                  </div>
                  <span className="text-[11px] text-emerald-400 font-semibold">
                    {conversationMessages.length} mensagem(s)
                  </span>
                </div>

                {/* Context Summary Box */}
                {(selected.conversationSummary || conversationContext?.summary) && (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> Resumo do Lead Salvo pela IA
                    </p>
                    <p className="text-xs text-slate-200 leading-relaxed">
                      {conversationContext?.summary || selected.conversationSummary}
                    </p>
                  </div>
                )}

                {/* Chat Transcript */}
                <div className="flex-1 min-h-[300px] max-h-[460px] overflow-y-auto space-y-2.5 pr-1 scrollbar-thin">
                  {loadingConversation ? (
                    <p className="text-xs text-slate-400 text-center py-8">
                      Carregando histórico de mensagens...
                    </p>
                  ) : conversationMessages.length > 0 ? (
                    conversationMessages.map(msg => {
                      const isCustomer = msg.sender === 'user';
                      const isHumanAttendant = msg.author?.includes('Pedro') || msg.author?.includes('Humano');

                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'}`}
                        >
                          <div
                            className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-line ${
                              isCustomer
                                ? 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700'
                                : isHumanAttendant
                                ? 'bg-amber-500/15 text-amber-100 rounded-tr-none border border-amber-500/30'
                                : 'bg-emerald-500/15 text-emerald-100 rounded-tr-none border border-emerald-500/30'
                            }`}
                          >
                            <div className="text-[10px] font-bold mb-1 opacity-80 flex items-center gap-1">
                              {isCustomer
                                ? `👤 ${selected.customerName || 'Cliente'}`
                                : isHumanAttendant
                                ? '👨‍💼 Pedro (Atendente Humano)'
                                : '🤖 Pedro (Consultor IA)'}
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
                    <div className="text-center py-12 space-y-2 text-slate-500">
                      <MessageSquare className="w-8 h-8 mx-auto opacity-30" />
                      <p className="text-xs max-w-xs mx-auto">
                        {selected.lastMessage
                          ? `Última interação registrada: "${selected.lastMessage}"`
                          : 'Este lead ainda não possui histórico de mensagens registrado no chat.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-3 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-xs text-slate-400">
                Salvar atualiza o cadastro técnico. Mudança para <strong>Aprovado</strong> dispara o evento de conversão do Meta Ads (CAPI).
              </p>
              <button
                disabled={busy}
                onClick={save}
                className="bg-orange-400 hover:bg-orange-300 text-black rounded-xl px-6 py-3 font-bold text-xs transition cursor-pointer disabled:opacity-50 shrink-0 w-full sm:w-auto"
              >
                {busy ? 'Salvando…' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROPOSAL PREVIEW & DISPATCH MODAL */}
      {proposalModalOpen && selected && (
        <div className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md flex justify-center items-center p-4">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl p-6 max-w-2xl w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="font-extrabold text-lg text-white flex items-center gap-2">
                  <Send className="w-5 h-5 text-cyan-400" />
                  Enviar Proposta Comercial no WhatsApp
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Destinatário: <strong className="text-white">{selected.customerName}</strong> ({selected.phone})
                </p>
              </div>
              <button
                disabled={sendingProposal}
                onClick={() => setProposalModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Mensagem que será enviada pelo WhatsApp oficial:
              </label>
              <textarea
                rows={12}
                value={proposalDraft}
                onChange={e => setProposalDraft(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3.5 text-xs text-slate-100 font-mono leading-relaxed focus:outline-none focus:border-cyan-400"
              />
              <p className="text-[11px] text-slate-400">
                💡 Dica: Você pode editar o texto livremente acima antes de disparar. Ao enviar, o estágio do projeto mudará automaticamente para <strong>Orçamento enviado</strong>.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={sendingProposal}
                onClick={() => setProposalModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={sendingProposal || !proposalDraft.trim()}
                onClick={handleSendProposal}
                className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-extrabold flex items-center gap-2 transition cursor-pointer shadow-lg disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{sendingProposal ? 'Disparando WhatsApp…' : 'Confirmar e Disparar no WhatsApp'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
