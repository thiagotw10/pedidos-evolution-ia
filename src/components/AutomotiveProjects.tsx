import React, { useEffect, useState, useMemo, useRef } from 'react';
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
  ChevronRight,
  ArrowLeft,
  CheckCheck,
  Paperclip,
  Smile,
  MoreVertical,
  Phone,
  Video,
  Mic,
  Image as ImageIcon
} from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { collection, query, orderBy, limitToLast, onSnapshot } from 'firebase/firestore';

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
  zipCode?: string;
  country?: string;
  currency?: string;
  detectedLanguage?: string;
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

export function formatProjectCurrency(val: number = 0, currency: string = 'BRL'): string {
  const curr = (currency || 'BRL').toUpperCase();
  if (curr === 'USD') {
    return `$ ${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
  }
  if (curr === 'EUR') {
    return `€ ${Number(val).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
  }
  if (curr === 'GBP') {
    return `£ ${Number(val).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GBP`;
  }
  return `R$ ${Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function getCountryBadge(country?: string): { flag: string; label: string } {
  const c = (country || 'BR').toUpperCase();
  switch (c) {
    case 'US': return { flag: '🇺🇸', label: 'EUA' };
    case 'ES': return { flag: '🇪🇸', label: 'Espanha' };
    case 'DE': return { flag: '🇩🇪', label: 'Alemanha' };
    case 'IT': return { flag: '🇮🇹', label: 'Itália' };
    case 'FR': return { flag: '🇫🇷', label: 'França' };
    case 'GB': return { flag: '🇬🇧', label: 'UK' };
    case 'PT': return { flag: '🇵🇹', label: 'Portugal' };
    case 'MX': return { flag: '🇲🇽', label: 'México' };
    case 'AE': return { flag: '🇦🇪', label: 'Emirados' };
    case 'INTL': return { flag: '🌐', label: 'Internacional' };
    case 'BR':
    default:
      return { flag: '🇧🇷', label: 'Brasil' };
  }
}

export function normalizeBrPhoneVariants(phone: string): string[] {
  const clean = String(phone || '').replace(/\D/g, '');
  if (!clean) return [];
  const variants = new Set<string>([clean]);
  if (clean.startsWith('55') && (clean.length === 12 || clean.length === 13)) {
    variants.add(clean.slice(2));
  } else if (!clean.startsWith('55') && (clean.length === 10 || clean.length === 11)) {
    variants.add(`55${clean}`);
  }
  return Array.from(variants);
}

export function formatWhatsAppTime(isoString?: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function renderWhatsAppFormattedText(text: string) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, lineIdx) => {
        const parts = line.split(/(\*[^*]+\*)/g);
        return (
          <p key={lineIdx} className="leading-relaxed whitespace-pre-wrap">
            {parts.map((part, i) => {
              if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
                return (
                  <strong key={i} className="font-bold text-white">
                    {part.slice(1, -1)}
                  </strong>
                );
              }
              return <span key={i}>{part}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}

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

  // Mobile modal tab switcher ('chat' | 'specs')
  const [mobileModalTab, setMobileModalTab] = useState<'chat' | 'specs'>('chat');
  const [showSpecsDrawer, setShowSpecsDrawer] = useState(false);

  // Conversation history state for the selected project
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [conversationContext, setConversationContext] = useState<any>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Translation states
  const [translations, setTranslations] = useState<Record<string, { text: string; loading: boolean }>>({});
  const [proposalTargetLang, setProposalTargetLang] = useState('en');
  const [translatingProposal, setTranslatingProposal] = useState(false);

  // Live direct chat states (Pedro)
  const [directMessageText, setDirectMessageText] = useState('');
  const [sendingDirectMessage, setSendingDirectMessage] = useState(false);
  const [directMessageTargetLang, setDirectMessageTargetLang] = useState('pt');
  const [translatingDirectMessage, setTranslatingDirectMessage] = useState(false);

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

  // Deep Link PWA Handler: Ao clicar na notificação push no celular, abre direto o projeto
  useEffect(() => {
    if (projects.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const targetId = params.get('projectId') || params.get('project');
    if (targetId && (!selected || selected.id !== targetId)) {
      const found = projects.find(p => p.id === targetId || p.id.startsWith(targetId));
      if (found) {
        handleSelectProject(found);
      }
    }
  }, [projects]);

  // Auto-scroll para a mensagem mais recente
  useEffect(() => {
    if (conversationMessages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversationMessages.length]);

  // Sincronização em tempo real (onSnapshot) da conversa do cliente e da IA
  useEffect(() => {
    if (!selected) return;
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) return;

    const variants = normalizeBrPhoneVariants(selected.phone);
    if (!variants.includes(selected.phone)) variants.push(selected.phone);
    const targetPhone = variants[0] || selected.phone;
    if (!targetPhone) return;

    const messagesCol = collection(db, 'establishments', currentUid, 'chats', targetPhone, 'messages');
    const q = query(messagesCol, orderBy('timestamp', 'asc'), limitToLast(60));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const liveMsgs: ConversationMessage[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as any)
        }));
        setConversationMessages(liveMsgs);
        setLoadingConversation(false);
      }
    }, (err) => {
      console.warn('[Firestore Live Chat Sync Warn]:', err);
    });

    return () => {
      unsubscribe();
    };
  }, [selected?.id, selected?.phone]);

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
    setDirectMessageText('');
    setMobileModalTab('chat');
    setShowSpecsDrawer(false);
    const initialLang = (project.detectedLanguage && project.detectedLanguage !== 'pt')
      ? project.detectedLanguage
      : (project.country === 'ES' || project.country === 'MX' ? 'es' : (project.country === 'DE' ? 'de' : (project.country && project.country !== 'BR' ? 'en' : 'pt')));
    setDirectMessageTargetLang(initialLang);
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

  async function translateText(text: string, targetLang: string = 'pt'): Promise<string> {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Entre novamente para acessar o tradutor.');
    const response = await fetch('/api/automotive/translate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text, targetLang })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro na tradução');
    return data.translated || text;
  }

  async function handleTranslateMessage(msgId: string, text: string) {
    setTranslations(prev => ({ ...prev, [msgId]: { text: '', loading: true } }));
    try {
      const translated = await translateText(text, 'pt');
      setTranslations(prev => ({ ...prev, [msgId]: { text: translated, loading: false } }));
    } catch (err: any) {
      setTranslations(prev => ({ ...prev, [msgId]: { text: '⚠️ Falha ao traduzir: ' + (err.message || ''), loading: false } }));
    }
  }

  async function handleTranslateProposal() {
    if (!proposalDraft.trim()) return;
    setTranslatingProposal(true);
    try {
      const translated = await translateText(proposalDraft, proposalTargetLang);
      setProposalDraft(translated);
      setActionSuccess(`✨ Proposta traduzida para ${proposalTargetLang.toUpperCase()}!`);
      setTimeout(() => setActionSuccess(''), 3500);
    } catch (err: any) {
      setError('Falha ao traduzir proposta: ' + (err.message || ''));
    } finally {
      setTranslatingProposal(false);
    }
  }

  async function handleTranslateDirectMessage() {
    if (!directMessageText.trim()) return;
    setTranslatingDirectMessage(true);
    try {
      const translated = await translateText(directMessageText, directMessageTargetLang);
      setDirectMessageText(translated);
      setActionSuccess(`✨ Mensagem traduzida para ${directMessageTargetLang.toUpperCase()}!`);
      setTimeout(() => setActionSuccess(''), 3500);
    } catch (err: any) {
      setError('Falha ao traduzir: ' + (err.message || ''));
    } finally {
      setTranslatingDirectMessage(false);
    }
  }

  async function handleSendDirectMessage() {
    if (!selected || !directMessageText.trim()) return;
    setSendingDirectMessage(true);
    setError('');
    try {
      const res = await request(`/${selected.id}/send-message`, 'POST', {
        text: directMessageText.trim(),
        author: 'Pedro (Atendente Humano)',
        targetLang: directMessageTargetLang,
        autoTranslate: directMessageTargetLang !== 'pt'
      });

      const newMsg: ConversationMessage = {
        id: `msg_${Date.now()}`,
        sender: 'assistant',
        author: 'Pedro (Atendente Humano)',
        text: res.message || directMessageText.trim(),
        timestamp: res.timestamp || new Date().toISOString()
      };
      setConversationMessages(prev => [...prev, newMsg]);

      const updated: Project = {
        ...selected,
        aiPaused: true,
        aiPausedUntil: res.aiPausedUntil,
        lastAssistantReply: newMsg.text
      };
      setProjects(p => p.map(v => (v.id === selected.id ? updated : v)));
      setSelected(updated);
      setDirectMessageText('');
      setActionSuccess('💬 Mensagem enviada no WhatsApp do cliente! IA pausada por 1h para você conduzir.');
      setTimeout(() => setActionSuccess(''), 4500);
    } catch (err: any) {
      setError(err.message || 'Falha ao enviar mensagem');
    } finally {
      setSendingDirectMessage(false);
    }
  }

  // Preparar proposta formatada e abrir modal de disparo
  function openProposalComposer(project: Project) {
    const vehicle = [project.brand, project.model, project.year, project.version].filter(Boolean).join(' ');
    const curr = project.currency || 'BRL';
    const isIntl = curr !== 'BRL' || (project.country && project.country !== 'BR');
    const val = project.quoteValue
      ? formatProjectCurrency(project.quoteValue, curr)
      : project.quote || (curr === 'BRL' ? 'Sob consulta técnica' : 'Under technical review');
    const prazo = project.leadTime || (curr === 'BRL' ? '7 a 15 dias úteis de fabricação' : '7 to 15 business days for fabrication');
    const frete = project.freight
      ? `Frete: ${project.freight}`
      : (project.zipCode || project.cep
        ? `Entrega para CEP/ZIP ${project.zipCode || project.cep}`
        : (curr === 'BRL' ? 'Entrega a combinar / instalação na loja' : 'Worldwide DHL/FedEx Express insured shipping'));
    const condicoes = project.quote || (curr === 'BRL' ? 'À vista via Pix ou até 12x no cartão de crédito' : 'Wire transfer, Stripe, or major credit cards');

    const draft = `Olá, ${project.customerName || 'amigo(a)'}! Tudo bem? Aqui é o Pedro da equipe técnica e projetos.

Montei a proposta personalizada para o seu ${vehicle || 'veículo'}:

🎯 *Escopo do Projeto:*
${project.objective || 'Sistema de escapamento esportivo em inox com ronco encorpado e ganho de fluxo.'}

💰 *Investimento:* ${val}
💳 *Condições:* ${condicoes}
📦 *Prazo de Produção:* ${prazo}
🚚 *Entrega / Envio:* ${frete}

Trabalhamos com aço inox 304 de alta durabilidade, solda TIG artesanal e gabarito milimétrico sem adaptações destrutivas.

Gostaria de garantir sua vaga na fila de produção ou ficou com alguma dúvida sobre o ronco e especificações?`;

    const initialTarget = (project.detectedLanguage && project.detectedLanguage !== 'pt')
      ? project.detectedLanguage
      : (project.country === 'ES' || project.country === 'MX' ? 'es' : (project.country === 'DE' ? 'de' : (isIntl ? 'en' : 'pt')));
    setProposalTargetLang(initialTarget);
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
                              {p.country && p.country !== 'BR' && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                  {getCountryBadge(p.country).flag} {p.country}
                                </span>
                              )}
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
                                {formatProjectCurrency(p.quoteValue, p.currency)}
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

                      {p.country && p.country !== 'BR' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          {getCountryBadge(p.country).flag} {getCountryBadge(p.country).label} ({p.country})
                        </span>
                      )}

                      {Number(p.quoteValue || 0) > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                          <DollarSign className="w-2.5 h-2.5" /> {formatProjectCurrency(p.quoteValue, p.currency)}
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

      {/* 100% WhatsApp Authentic Experience & Slide-over Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex justify-center items-center p-0 md:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="WhatsApp Chat"
            className="w-full h-full md:max-w-5xl md:h-[94vh] bg-[#0b141a] md:rounded-2xl shadow-2xl flex flex-col overflow-hidden border-0 md:border md:border-[#222e35] relative"
          >
            {/* Top WhatsApp Mobile / Web Header */}
            <div className="bg-[#202c33] text-[#e9edef] px-3 sm:px-4 py-2.5 flex items-center justify-between border-b border-[#222e35] shrink-0 z-20">
              {/* Left: Back button + Avatar + Contact Name / Status */}
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="p-1 -ml-1 text-[#aebac1] hover:text-white rounded-full hover:bg-white/5 cursor-pointer transition"
                  title="Voltar para a lista de projetos"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                {/* Profile Circle Avatar */}
                <div
                  onClick={() => setShowSpecsDrawer(true)}
                  className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 text-white font-bold flex items-center justify-center text-sm ring-1 ring-white/10 shrink-0 cursor-pointer shadow-sm select-none"
                  title="Ver ficha técnica"
                >
                  {selected.customerName ? selected.customerName.charAt(0).toUpperCase() : 'C'}
                </div>

                {/* Contact Name & Online / Vehicle Subtitle */}
                <div
                  onClick={() => setShowSpecsDrawer(true)}
                  className="cursor-pointer min-w-0"
                  title="Clique para ver a ficha técnica e orçamento"
                >
                  <h3 className="font-semibold text-sm sm:text-base text-[#e9edef] truncate max-w-[130px] sm:max-w-xs leading-tight">
                    {selected.customerName || 'Cliente'}
                  </h3>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#8696a0] truncate mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-[#00a884] inline-block animate-pulse shrink-0" />
                    <span className="truncate">
                      online · {selected.brand} {selected.model} {selected.year && `(${selected.year})`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Actions, AI Toggle & Specs Drawer Trigger */}
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {/* AI / Takeover Toggle Button */}
                {isAiCurrentlyPaused(selected) ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleResumeAi(selected)}
                    className="px-2.5 py-1 rounded-full bg-[#00a884]/20 hover:bg-[#00a884]/30 text-[#00a884] border border-[#00a884]/40 text-xs font-semibold flex items-center gap-1 transition cursor-pointer active:scale-95 disabled:opacity-50"
                    title={`IA pausada. Tempo restante: ${formatRemainingPause(selected)}`}
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span className="hidden sm:inline">Retomar IA</span>
                    <span className="sm:hidden">IA</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handlePauseAi(selected, 60)}
                    className="px-2.5 py-1 rounded-full bg-[#182229] hover:bg-[#202c33] text-amber-300 border border-amber-500/40 text-xs font-semibold flex items-center gap-1 transition cursor-pointer active:scale-95 disabled:opacity-50"
                    title="Pausar IA por 1 hora e assumir conversa manualmente"
                  >
                    <Pause className="w-3 h-3" />
                    <span className="hidden sm:inline">Assumir Conversa</span>
                    <span className="sm:hidden">Assumir</span>
                  </button>
                )}

                {/* Direct External WhatsApp Links */}
                {selected.phone && (
                  <a
                    href={buildWhatsAppDirectUrl(selected)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-[#aebac1] hover:text-[#00a884] transition rounded-full hover:bg-white/5"
                    title="Abrir WhatsApp oficial"
                  >
                    <Phone className="w-4 h-4" />
                  </a>
                )}

                {/* Specs Drawer Button */}
                <button
                  type="button"
                  onClick={() => setShowSpecsDrawer(prev => !prev)}
                  className={`px-2.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer active:scale-95 ${
                    showSpecsDrawer
                      ? 'bg-orange-400 text-black shadow-md'
                      : 'bg-[#2a3942] hover:bg-[#32424b] text-[#e9edef]'
                  }`}
                  title="Abrir/Fechar Ficha Técnica e Orçamento"
                >
                  <Car className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Ficha & Orçamento</span>
                  <span className="sm:hidden">Ficha</span>
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="p-1.5 text-[#aebac1] hover:text-white transition rounded-full hover:bg-white/5 cursor-pointer"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Chat Body - Authentic WhatsApp Wallpaper & Bubbles */}
            <div
              className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 relative flex flex-col scrollbar-thin"
              style={{
                backgroundColor: '#0b141a',
                backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.035) 1.5px, transparent 1.5px)',
                backgroundSize: '18px 18px'
              }}
            >
              {/* WhatsApp Encryption Security Banner */}
              <div className="flex justify-center my-1">
                <div className="bg-[#182229] border border-[#222e35] text-[#ffd279] text-[11px] px-3.5 py-1 rounded-lg max-w-sm text-center shadow-sm leading-tight select-none">
                  🔒 As mensagens e chamadas são protegidas com a criptografia de ponta a ponta.
                </div>
              </div>

              {/* Lead Summary Pill (if AI recorded summary) */}
              {(selected.conversationSummary || conversationContext?.summary) && (
                <div className="flex justify-center my-1">
                  <div className="bg-[#182229]/95 border border-[#00a884]/40 text-[#e9edef] text-[11px] px-3.5 py-1 rounded-full shadow flex items-center gap-1.5 max-w-md">
                    <Sparkles className="w-3 h-3 text-[#00a884] shrink-0" />
                    <span className="truncate">
                      <strong>Resumo IA:</strong> {conversationContext?.summary || selected.conversationSummary}
                    </span>
                  </div>
                </div>
              )}

              {/* Date Separator Pill */}
              <div className="flex justify-center my-1.5">
                <span className="bg-[#182229] text-[#8696a0] text-[10px] font-semibold px-2.5 py-0.5 rounded-md uppercase tracking-wider select-none">
                  Hoje
                </span>
              </div>

              {/* Conversation Messages */}
              {loadingConversation ? (
                <div className="text-center py-16 text-[#8696a0] text-xs animate-pulse">
                  Carregando conversa do WhatsApp...
                </div>
              ) : conversationMessages.length > 0 ? (
                conversationMessages.map(msg => {
                  const isCustomer = msg.sender === 'user';
                  const isHumanAttendant = msg.author?.includes('Pedro') || msg.author?.includes('Humano');

                  if (isCustomer) {
                    // Customer Inbound Bubble (WhatsApp Dark Mode Inbound: #202c33)
                    return (
                      <div key={msg.id} className="flex flex-col items-start">
                        <div className="bg-[#202c33] text-[#e9edef] rounded-2xl rounded-tl-sm px-3.5 py-2 max-w-[88%] sm:max-w-[70%] shadow-sm relative border border-white/5 space-y-1">
                          <span className="text-[11px] font-bold text-[#53bdeb] block mb-0.5">
                            {selected.customerName || 'Cliente'}
                          </span>

                          {msg.mediaUrl && (
                            <div className="my-1 rounded-xl overflow-hidden border border-white/10">
                              <img src={msg.mediaUrl} alt="Mídia enviada" className="w-full max-h-72 object-cover rounded-xl" />
                            </div>
                          )}

                          <div className="text-xs sm:text-[13px] leading-relaxed">
                            {renderWhatsAppFormattedText(msg.text)}
                          </div>

                          {/* Quick translation button & timestamp */}
                          <div className="pt-1 border-t border-white/5 flex items-center justify-between gap-3 text-[10px]">
                            <button
                              type="button"
                              disabled={translations[msg.id]?.loading}
                              onClick={() => handleTranslateMessage(msg.id, msg.text)}
                              className="text-[#53bdeb] hover:underline flex items-center gap-1 font-medium cursor-pointer"
                            >
                              <Globe className="w-3 h-3 text-[#53bdeb]" />
                              <span>{translations[msg.id]?.loading ? 'Traduzindo…' : 'Traduzir para Português'}</span>
                            </button>
                            <span className="text-[#8696a0] text-[10px]">
                              {formatWhatsAppTime(msg.timestamp)}
                            </span>
                          </div>

                          {/* Translated text card if clicked */}
                          {translations[msg.id]?.text && (
                            <div className="mt-1.5 p-2 bg-[#111b21] rounded-lg border border-cyan-500/30 text-xs text-cyan-200">
                              <p className="text-[10px] font-bold text-cyan-400 flex items-center gap-1 mb-0.5">
                                <Sparkles className="w-3 h-3" /> Tradução IA (Português):
                              </p>
                              <p className="whitespace-pre-line leading-relaxed">{translations[msg.id].text}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  // Outbound Bubble (Pedro IA or Human: WhatsApp Dark Mode Outbound: #005c4b)
                  return (
                    <div key={msg.id} className="flex flex-col items-end">
                      <div className="bg-[#005c4b] text-[#e9edef] rounded-2xl rounded-tr-sm px-3.5 py-2 max-w-[88%] sm:max-w-[70%] shadow-sm relative space-y-1">
                        <div className="text-[10px] font-semibold text-[#25d366] opacity-90 mb-0.5 flex items-center gap-1">
                          {isHumanAttendant ? '👨‍💼 Pedro (Atendimento Humano)' : '🤖 Pedro (Consultor IA)'}
                        </div>

                        {msg.mediaUrl && (
                          <div className="my-1 rounded-xl overflow-hidden shadow-inner border border-emerald-400/20">
                            <img src={msg.mediaUrl} alt="Mídia do projeto" className="w-full max-h-80 object-cover rounded-xl" />
                          </div>
                        )}

                        <div className="text-xs sm:text-[13px] leading-relaxed">
                          {renderWhatsAppFormattedText(msg.text)}
                        </div>

                        {/* Timestamp & Double Blue Checks */}
                        <div className="flex items-center justify-end gap-1 mt-0.5 text-right">
                          <span className="text-[10px] text-[#e9edef]/70">
                            {formatWhatsAppTime(msg.timestamp)}
                          </span>
                          <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-16 space-y-2 text-[#8696a0]">
                  <MessageSquare className="w-10 h-10 mx-auto opacity-30 text-[#00a884]" />
                  <p className="text-xs">
                    {selected.lastMessage
                      ? `Última mensagem: "${selected.lastMessage}"`
                      : 'Nenhuma mensagem recente gravada. Envie uma mensagem abaixo para abrir o contato no WhatsApp!'}
                  </p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Bottom WhatsApp Mobile / Web Input Bar */}
            <div className="bg-[#202c33] p-2 sm:p-2.5 flex flex-col gap-1.5 border-t border-[#222e35] shrink-0 z-20">
              {/* International Translation Quick Bar */}
              {(selected.country !== 'BR' || directMessageTargetLang !== 'pt') && (
                <div className="flex items-center justify-between px-2 text-[11px] text-[#8696a0]">
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-3 h-3 text-[#00a884]" />
                    <span>Traduzir mensagem para:</span>
                    <select
                      value={directMessageTargetLang}
                      onChange={e => setDirectMessageTargetLang(e.target.value)}
                      className="bg-[#182229] border border-[#2a3942] rounded px-1.5 py-0.5 text-[#e9edef] text-[11px] focus:outline-none"
                    >
                      <option value="pt">🇧🇷 Português</option>
                      <option value="en">🇺🇸 English</option>
                      <option value="es">🇪🇸 Español</option>
                      <option value="de">🇩🇪 Deutsch</option>
                      <option value="fr">🇫🇷 Français</option>
                      <option value="it">🇮🇹 Italiano</option>
                    </select>
                  </div>
                  {directMessageTargetLang !== 'pt' && (
                    <button
                      type="button"
                      disabled={translatingDirectMessage || !directMessageText.trim()}
                      onClick={handleTranslateDirectMessage}
                      className="text-[#00a884] font-semibold text-[11px] hover:underline flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>{translatingDirectMessage ? 'Traduzindo…' : 'Traduzir texto'}</span>
                    </button>
                  )}
                </div>
              )}

              {/* Message Pill Input & Circular Send Button */}
              <div className="flex items-end gap-2">
                <div className="bg-[#2a3942] rounded-3xl flex-1 flex items-center px-3 py-1 gap-2 border border-white/5">
                  <button type="button" className="text-[#8696a0] hover:text-[#e9edef] p-1 transition cursor-pointer">
                    <Smile className="w-5 h-5" />
                  </button>
                  <textarea
                    rows={1}
                    value={directMessageText}
                    onChange={e => setDirectMessageText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleSendDirectMessage();
                      }
                    }}
                    placeholder="Mensagem"
                    className="flex-1 bg-transparent text-sm text-[#e9edef] placeholder-[#8696a0] focus:outline-none resize-none max-h-28 py-1.5 leading-relaxed"
                  />
                  <button
                    type="button"
                    onClick={() => openProposalComposer(selected)}
                    title="Enviar Proposta Comercial no WhatsApp"
                    className="text-[#8696a0] hover:text-[#00a884] p-1 transition cursor-pointer"
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSpecsDrawer(true)}
                    title="Ficha Técnica & Orçamento"
                    className="text-[#8696a0] hover:text-white p-1 transition cursor-pointer"
                  >
                    <ImageIcon className="w-5 h-5" />
                  </button>
                </div>

                {/* Circular Send Button */}
                <button
                  type="button"
                  disabled={sendingDirectMessage || !directMessageText.trim()}
                  onClick={handleSendDirectMessage}
                  className="w-11 h-11 rounded-full bg-[#00a884] hover:bg-[#06cf9c] active:scale-95 flex items-center justify-center text-white shrink-0 shadow-lg cursor-pointer transition disabled:opacity-50"
                  title={directMessageText.trim() ? 'Enviar mensagem no WhatsApp' : 'Gravar áudio / Mensagem vazia'}
                >
                  {directMessageText.trim() ? (
                    <Send className="w-5 h-5 ml-0.5" />
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Slide-over Specs & Commercial Drawer */}
            {showSpecsDrawer && (
              <div className="absolute inset-y-0 right-0 w-full sm:w-[440px] max-w-full bg-[#111b21] border-l border-[#222e35] shadow-2xl flex flex-col z-30 animate-in slide-in-from-right duration-200">
                {/* Drawer Top Header */}
                <div className="p-4 bg-[#202c33] border-b border-[#222e35] flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-white flex items-center gap-2">
                      <Car className="w-4 h-4 text-orange-400" />
                      Ficha Técnica & Orçamento
                    </h3>
                    <p className="text-[11px] text-[#8696a0]">
                      Protocolo #{selected.id.slice(0, 8)} · {selected.brand} {selected.model}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSpecsDrawer(false)}
                    className="p-1.5 rounded-full text-[#8696a0] hover:text-white hover:bg-white/5 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Drawer Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Scope & Customer Interest */}
                  <div className="p-3 rounded-xl bg-[#182229] border border-[#222e35] space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-orange-300 flex items-center gap-1.5">
                      <Car className="w-3.5 h-3.5" /> Escopo & Interesse
                    </p>
                    <p className="text-xs text-slate-200 whitespace-pre-line">{selected.objective}</p>
                    <p className="text-[11px] text-slate-400">
                      Modalidade: {selected.delivery || 'A definir'} · CEP: {selected.cep || 'Não informado'}
                    </p>
                  </div>

                  {/* Qualification Fields */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="block text-xs text-slate-300">
                      Cliente
                      <input
                        type="text"
                        value={selected.customerName || ''}
                        onChange={e => setSelected({ ...selected, customerName: e.target.value })}
                        className="block w-full bg-[#182229] rounded-xl p-2.5 mt-1 text-white text-xs border border-white/10 focus:border-orange-400 focus:outline-none"
                      />
                    </label>
                    <label className="block text-xs text-slate-300">
                      CEP / ZIP Code
                      <input
                        type="text"
                        value={selected.zipCode || selected.cep || ''}
                        onChange={e => setSelected({ ...selected, cep: e.target.value, zipCode: e.target.value })}
                        placeholder="CEP (BR) ou ZIP"
                        className="block w-full bg-[#182229] rounded-xl p-2.5 mt-1 text-white text-xs border border-white/10 focus:border-orange-400 focus:outline-none"
                      />
                    </label>
                    <label className="block text-xs text-slate-300">
                      País de Origem
                      <select
                        value={selected.country || 'BR'}
                        onChange={e => {
                          const newCountry = e.target.value;
                          const autoCurr = newCountry === 'BR' ? 'BRL' : (['ES', 'DE', 'FR', 'IT', 'PT'].includes(newCountry) ? 'EUR' : (newCountry === 'GB' ? 'GBP' : 'USD'));
                          const autoLang = ['BR', 'PT'].includes(newCountry) ? 'pt' : (['ES', 'MX'].includes(newCountry) ? 'es' : (newCountry === 'DE' ? 'de' : 'en'));
                          setSelected({
                            ...selected,
                            country: newCountry,
                            currency: selected.currency || autoCurr,
                            detectedLanguage: selected.detectedLanguage || autoLang
                          });
                        }}
                        className="block w-full bg-[#182229] rounded-xl p-2.5 mt-1 text-white text-xs border border-white/10 focus:border-orange-400 focus:outline-none"
                      >
                        <option value="BR">🇧🇷 Brasil (BR)</option>
                        <option value="US">🇺🇸 Estados Unidos (US)</option>
                        <option value="ES">🇪🇸 Espanha (ES)</option>
                        <option value="DE">🇩🇪 Alemanha (DE)</option>
                        <option value="PT">🇵🇹 Portugal (PT)</option>
                        <option value="GB">🇬🇧 Reino Unido (GB)</option>
                        <option value="IT">🇮🇹 Itália (IT)</option>
                        <option value="FR">🇫🇷 França (FR)</option>
                        <option value="MX">🇲🇽 México (MX)</option>
                        <option value="AE">🇦🇪 Emirados Árabes (AE)</option>
                        <option value="INTL">🌐 Outro / Internacional</option>
                      </select>
                    </label>
                    <label className="block text-xs text-slate-300">
                      Moeda
                      <select
                        value={selected.currency || 'BRL'}
                        onChange={e => setSelected({ ...selected, currency: e.target.value })}
                        className="block w-full bg-[#182229] rounded-xl p-2.5 mt-1 text-white text-xs border border-white/10 font-bold focus:border-orange-400 focus:outline-none"
                      >
                        <option value="BRL">R$ - Real (BRL)</option>
                        <option value="USD">$ - Dólar (USD)</option>
                        <option value="EUR">€ - Euro (EUR)</option>
                        <option value="GBP">£ - Libra (GBP)</option>
                      </select>
                    </label>
                    <label className="block text-xs text-slate-300">
                      Marca
                      <input
                        type="text"
                        value={selected.brand || ''}
                        onChange={e => setSelected({ ...selected, brand: e.target.value })}
                        className="block w-full bg-[#182229] rounded-xl p-2.5 mt-1 text-white text-xs border border-white/10 focus:border-orange-400 focus:outline-none"
                      />
                    </label>
                    <label className="block text-xs text-slate-300">
                      Modelo
                      <input
                        type="text"
                        value={selected.model || ''}
                        onChange={e => setSelected({ ...selected, model: e.target.value })}
                        className="block w-full bg-[#182229] rounded-xl p-2.5 mt-1 text-white text-xs border border-white/10 focus:border-orange-400 focus:outline-none"
                      />
                    </label>
                    <label className="block text-xs text-slate-300">
                      Ano
                      <input
                        type="text"
                        value={selected.year || ''}
                        onChange={e => setSelected({ ...selected, year: e.target.value })}
                        className="block w-full bg-[#182229] rounded-xl p-2.5 mt-1 text-white text-xs border border-white/10 focus:border-orange-400 focus:outline-none"
                      />
                    </label>
                    <label className="block text-xs text-slate-300">
                      Versão / Motor
                      <input
                        type="text"
                        value={selected.version || ''}
                        onChange={e => setSelected({ ...selected, version: e.target.value })}
                        className="block w-full bg-[#182229] rounded-xl p-2.5 mt-1 text-white text-xs border border-white/10 focus:border-orange-400 focus:outline-none"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="block text-xs text-slate-300">
                      Idioma
                      <select
                        value={selected.detectedLanguage || 'pt'}
                        onChange={e => setSelected({ ...selected, detectedLanguage: e.target.value })}
                        className="block w-full bg-[#182229] rounded-xl p-2.5 mt-1 text-white text-xs border border-white/10"
                      >
                        <option value="pt">🇧🇷 Português</option>
                        <option value="en">🇺🇸 English</option>
                        <option value="es">🇪🇸 Español</option>
                        <option value="de">🇩🇪 Deutsch</option>
                        <option value="fr">🇫🇷 Français</option>
                        <option value="it">🇮🇹 Italiano</option>
                      </select>
                    </label>
                    <label className="block text-xs text-slate-300">
                      Etapa do Funil
                      <select
                        value={selected.status}
                        onChange={e => setSelected({ ...selected, status: e.target.value })}
                        className="block w-full bg-[#182229] rounded-xl p-2.5 mt-1 text-xs text-white border border-white/10 font-bold"
                      >
                        {stages.map(s => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {/* Financial Quote Section */}
                  <div className="p-3.5 rounded-xl bg-[#182229] border border-cyan-500/30 space-y-2.5">
                    <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5" /> Orçamento & Proposta ({selected.currency || 'BRL'})
                    </span>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-xs text-slate-300">
                        Valor ({selected.currency || 'BRL'})
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
                          placeholder="Ex: 15000.00"
                          className="block w-full bg-[#111b21] border border-slate-700 rounded-xl p-2 mt-1 text-white text-xs font-bold font-mono"
                        />
                      </label>

                      <label className="block text-xs text-slate-300">
                        % Comissão
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
                          className="block w-full bg-[#111b21] border border-slate-700 rounded-xl p-2 mt-1 text-white text-xs font-bold font-mono"
                        />
                      </label>
                    </div>

                    {Number(selected.quoteValue || 0) > 0 && (
                      <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between text-xs">
                        <span className="text-emerald-300 font-semibold">Comissão Técnica:</span>
                        <span className="text-emerald-400 font-bold text-sm font-mono">
                          {formatProjectCurrency(
                            selected.commissionValue ||
                              (Number(selected.quoteValue) * Number(selected.commissionPercent || 4)) / 100,
                            selected.currency
                          )}
                        </span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => openProposalComposer(selected)}
                      className="w-full py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>⚡ Enviar Proposta no WhatsApp</span>
                    </button>
                  </div>

                  {/* Manual notes */}
                  <label className="block text-xs text-slate-300">
                    Notas técnicas internas
                    <textarea
                      maxLength={3000}
                      rows={2}
                      value={selected.notes || ''}
                      onChange={e => setSelected({ ...selected, notes: e.target.value })}
                      className="block w-full bg-[#182229] rounded-xl p-2.5 mt-1 text-xs text-white border border-white/5"
                    />
                  </label>
                </div>

                {/* Drawer Footer Actions */}
                <div className="p-3 bg-[#182229] border-t border-[#222e35] flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setShowSpecsDrawer(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold cursor-pointer"
                  >
                    Voltar ao Chat
                  </button>
                  <button
                    disabled={busy}
                    onClick={async () => {
                      await save();
                      setShowSpecsDrawer(false);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-orange-400 hover:bg-orange-300 text-black font-bold text-xs transition cursor-pointer disabled:opacity-50 text-center"
                  >
                    {busy ? 'Salvando…' : 'Salvar alterações'}
                  </button>
                </div>
              </div>
            )}
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
                  Destinatário: <strong className="text-white">{selected.customerName}</strong> ({selected.phone}) · {getCountryBadge(selected.country).flag} {getCountryBadge(selected.country).label} ({selected.currency || 'BRL'})
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

            {/* International Translation Toolbar */}
            <div className="p-3 rounded-2xl bg-slate-950 border border-white/10 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-cyan-400" /> Idioma da Proposta:
                </span>
                <select
                  value={proposalTargetLang}
                  onChange={e => setProposalTargetLang(e.target.value)}
                  className="bg-slate-800 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white font-semibold focus:outline-none focus:border-cyan-400"
                >
                  <option value="en">🇺🇸 Inglês (English - US)</option>
                  <option value="es">🇪🇸 Espanhol (Español)</option>
                  <option value="de">🇩🇪 Alemão (Deutsch)</option>
                  <option value="pt">🇧🇷 Português (Brasil)</option>
                  <option value="fr">🇫🇷 Francês (Français)</option>
                  <option value="it">🇮🇹 Italiano</option>
                </select>
              </div>

              <button
                type="button"
                disabled={translatingProposal || !proposalDraft.trim()}
                onClick={handleTranslateProposal}
                className="px-3.5 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{translatingProposal ? 'Traduzindo com IA…' : '⚡ Traduzir Mensagem'}</span>
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
                💡 Dica: Você pode escrever em português e clicar em <strong>⚡ Traduzir Mensagem</strong> para adaptar o texto na língua nativa do cliente antes de enviar.
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
