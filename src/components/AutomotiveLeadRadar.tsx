import React, { useState } from 'react';
import {
  Compass,
  MapPin,
  Instagram,
  Sparkles,
  Search,
  ExternalLink,
  Phone,
  Flame,
  CheckCircle2,
  RefreshCw,
  Building2,
  Car,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
  Share2,
  Globe,
  PlusCircle,
  Clock,
  ArrowUpRight,
  UserCheck
} from 'lucide-react';
import { Establishment } from '../types';

interface LeadItem {
  id: string;
  source: 'google_maps' | 'instagram';
  title: string;
  subtitle: string;
  handleOrLocation: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  instagramUrl?: string;
  avatarUrl: string;
  carModel?: string;
  porscheScore: number; // 0 to 100
  buyingSignal: string;
  aiSuggestedPitch: string;
  tags: string[];
  status: 'new' | 'contacted' | 'imported';
  city: string;
  country: 'BR' | 'US' | 'EU';
}

const INITIAL_MOCK_LEADS: LeadItem[] = [
  {
    id: 'lead-real-ig-1',
    source: 'instagram',
    title: '@dupontregistry',
    subtitle: '700hp Porsche 911 com escapamento esportivo',
    handleOrLocation: '@dupontregistry',
    instagramUrl: 'https://www.instagram.com/p/De5l6gUF2p2/',
    avatarUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=150&auto=format&fit=crop&q=80',
    carModel: 'Porsche 911 Turbo S (700hp RYFT Exhaust)',
    porscheScore: 98,
    buyingSignal: 'Postou vídeo do Porsche 911 com 700hp e escape de alto fluxo com ronco encorpado.',
    aiSuggestedPitch: 'Incrível o projeto do 911 no feed! Aqui na Flow Garage fabricamos sistemas em Inox 304 com válvulas ativas plug-and-play para 992 Turbo e GT3. Como podemos fechar uma parceria técnica?',
    tags: ['Instagram Real', '700hp Turbo S', 'Alta Intenção'],
    status: 'new',
    city: 'Miami / Global',
    country: 'US'
  },
  {
    id: 'lead-real-maps-1',
    source: 'google_maps',
    title: 'Stuttgart Porsche Vila Olímpia',
    subtitle: 'Concessionária & Centro Técnico Especializado',
    handleOrLocation: 'Av. Dr. Cardoso de Melo, 1507 - Vila Olímpia, São Paulo - SP',
    phone: '+55 11 5644-6700',
    whatsapp: '551156446700',
    website: 'https://www.stuttgartporsche.com.br/',
    avatarUrl: 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=150&auto=format&fit=crop&q=80',
    carModel: 'Hub Autorizado & Manutenção Porsche',
    porscheScore: 97,
    buyingSignal: 'Maior rede especializada Porsche de São Paulo, alto fluxo de 911 (991/992) e 718 Boxster.',
    aiSuggestedPitch: 'Olá equipe técnica Stuttgart! A Flow Garage é fabricante especializada em escapamentos e downpipes em inox 304 com bypass valvulado para Porsche. Gostaríamos de apresentar nossa linha com condições para parceiros.',
    tags: ['Google Maps Real', 'Vila Olímpia SP', 'B2B Porsche'],
    status: 'new',
    city: 'São Paulo, SP',
    country: 'BR'
  },
  {
    id: 'lead-real-ig-2',
    source: 'instagram',
    title: '@campeonf1',
    subtitle: 'Porsche 911 GT3 R & Motorsport Enthusiast',
    handleOrLocation: '@campeonf1',
    instagramUrl: 'https://www.instagram.com/p/De5mEQIjYur/',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    carModel: 'Porsche 911 GT3 R Motorsport',
    porscheScore: 94,
    buyingSignal: 'Publicou sobre o projeto Porsche 911 GT3 R com interesse em linha de som de corrida.',
    aiSuggestedPitch: 'Fala @campeonf1! Acompanhei o post sobre o 911 GT3 R. Na Flow Garage desenvolvemos o catback direto com ponteiras duplas em inox 304 que valoriza o ronco do boxer 4.0 aspirado. Quer ver o simulador 3D?',
    tags: ['Instagram Real', '#porsche911gt3', 'Motorsport'],
    status: 'new',
    city: 'São Paulo, SP',
    country: 'BR'
  },
  {
    id: 'lead-real-maps-2',
    source: 'google_maps',
    title: 'Park Place Porsche Dallas',
    subtitle: 'Authorized Porsche Sales & Performance Service',
    handleOrLocation: '6107 Lemmon Ave, Dallas, TX 75209',
    phone: '(469) 393-7031',
    whatsapp: '14693937031',
    website: 'https://www.porschedallas.com/',
    avatarUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=150&auto=format&fit=crop&q=80',
    carModel: 'Specialized Porsche Exotic Center',
    porscheScore: 96,
    buyingSignal: 'Premier Texas Porsche performance & service center looking for bespoke aftermarket exhaust applications.',
    aiSuggestedPitch: 'Hello Park Place Porsche team! Flow Garage manufactures precision TIG-welded 304 stainless exhaust systems with dual-valve control for Porsche 992 and 718. Would love to send you our wholesale catalog!',
    tags: ['Google Maps Real', 'Texas USA', 'Wholesale Partner'],
    status: 'new',
    city: 'Dallas, TX',
    country: 'US'
  },
  {
    id: 'lead-real-ig-3',
    source: 'instagram',
    title: '@eldonaspotting',
    subtitle: 'Flagra Porsche 911 Carrera 2025 Coupe',
    handleOrLocation: '@eldonaspotting',
    instagramUrl: 'https://www.instagram.com/p/De5l5cCEeHe/',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    carModel: 'Porsche 911 Carrera 2025',
    porscheScore: 91,
    buyingSignal: 'Spotting recente de novo 911 Carrera 2025 coupe com discussões ativas sobre o som do novo motor.',
    aiSuggestedPitch: 'Belo flagra do Carrera 2025! O novo motor precisa daquele ronco característico. Desenvolvemos o sistema com bypass sob medida para o 992.2 aqui na Flow Garage!',
    tags: ['Instagram Real', '#porsche911', 'Spotting 2025'],
    status: 'new',
    city: 'América do Sul / SP',
    country: 'BR'
  }
];

interface AutomotiveLeadRadarProps {
  establishment?: Establishment | null;
  onNavigateToProjects?: () => void;
}

export const AutomotiveLeadRadar: React.FC<AutomotiveLeadRadarProps> = ({
  establishment,
  onNavigateToProjects
}) => {
  const [activeEngine, setActiveEngine] = useState<'all' | 'instagram' | 'google_maps'>('all');
  const [selectedCountry, setSelectedCountry] = useState<'all' | 'BR' | 'US'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [leads, setLeads] = useState<LeadItem[]>(INITIAL_MOCK_LEADS);
  const [isScanning, setIsScanning] = useState(false);
  const [scanKeyword, setScanKeyword] = useState('Porsche 911');
  const [scanLocation, setScanLocation] = useState('São Paulo, Brasil');
  const [copiedPitchId, setCopiedPitchId] = useState<string | null>(null);
  const [activeFilterSignal, setActiveFilterSignal] = useState<'all' | 'high_score' | 'has_whatsapp'>('all');
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  // Load leads from Firestore on mount
  React.useEffect(() => {
    const loadLeads = async () => {
      try {
        const storeId = establishment?.id || 'ZFFWUNspKNYKsn22kKDH6nybCWw2';
        const res = await fetch(`/api/automotive/radar/leads?establishmentId=${storeId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.leads && Array.isArray(data.leads) && data.leads.length > 0) {
            setLeads(data.leads);
          }
        }
      } catch (err) {
        console.warn('Failed to load saved radar leads:', err);
      }
    };
    loadLeads();
  }, [establishment?.id]);

  const filteredLeads = leads.filter((lead) => {
    if (activeEngine !== 'all' && lead.source !== activeEngine) return false;
    if (selectedCountry !== 'all' && lead.country !== selectedCountry) return false;
    if (activeFilterSignal === 'high_score' && lead.porscheScore < 90) return false;
    if (activeFilterSignal === 'has_whatsapp' && !lead.whatsapp) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchText = `${lead.title} ${lead.subtitle} ${lead.carModel} ${lead.city} ${lead.tags.join(' ')}`.toLowerCase();
      return matchText.includes(q);
    }
    return true;
  });

  const handleRealScan = async () => {
    try {
      setIsScanning(true);
      setScanMessage('Minerando dados reais no Instagram e Google Maps via Apify & Gemini 2.5...');
      const storeId = establishment?.id || 'ZFFWUNspKNYKsn22kKDH6nybCWw2';

      const res = await fetch(`/api/automotive/radar/scan?establishmentId=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: scanKeyword,
          location: scanLocation,
          engine: activeEngine,
          country: selectedCountry
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Erro na varredura');
      }

      const data = await res.json();
      if (data.leads && Array.isArray(data.leads) && data.leads.length > 0) {
        setLeads(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newUnique = data.leads.filter((l: LeadItem) => !existingIds.has(l.id));
          return [...newUnique, ...prev];
        });
        setScanMessage(`🎉 ${data.leads.length} novos leads reais minerados e qualificados pela IA!`);
      } else {
        setScanMessage('Varredura concluída. Nenhum novo lead encontrado para os filtros atuais.');
      }
    } catch (err: any) {
      alert('Erro ao disparar varredura real: ' + err.message);
      setScanMessage(null);
    } finally {
      setIsScanning(false);
      setTimeout(() => setScanMessage(null), 6000);
    }
  };

  const handleCopyPitch = (lead: LeadItem) => {
    navigator.clipboard.writeText(lead.aiSuggestedPitch);
    setCopiedPitchId(lead.id);
    setTimeout(() => setCopiedPitchId(null), 2500);
  };

  const handleOpenWhatsApp = (lead: LeadItem) => {
    if (!lead.whatsapp) return;
    const cleanNumber = lead.whatsapp.replace(/\D/g, '');
    const encoded = encodeURIComponent(lead.aiSuggestedPitch);
    window.open(`https://wa.me/${cleanNumber}?text=${encoded}`, '_blank');
  };

  const [credentialedLeadIds, setCredentialedLeadIds] = useState<Set<string>>(new Set());

  const handleCredenciarOficina = async (lead: LeadItem) => {
    try {
      const storeId = establishment?.id || 'ZFFWUNspKNYKsn22kKDH6nybCWw2';
      const res = await fetch('/api/automotive/partners/import-from-lead', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-establishment-id': storeId
        },
        body: JSON.stringify({ lead })
      });
      if (!res.ok) throw new Error('Falha ao credenciar oficina');
      setCredentialedLeadIds(prev => new Set(prev).add(lead.id));
      alert(`🎉 Oficina "${lead.title || lead.handleOrLocation}" credenciada com sucesso! O RAG da IA já começou a indicá-la para clientes dessa região.`);
    } catch (err: any) {
      alert('Erro ao credenciar oficina: ' + err.message);
    }
  };

  const handleImportLead = async (leadId: string) => {
    try {
      const storeId = establishment?.id || 'ZFFWUNspKNYKsn22kKDH6nybCWw2';
      await fetch(`/api/automotive/radar/leads/${leadId}/import?establishmentId=${storeId}`, {
        method: 'POST'
      });
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: 'imported' } : l));
      alert('Lead importado com sucesso para a aba de Projetos & Orçamentos!');
      if (onNavigateToProjects) {
        onNavigateToProjects();
      }
    } catch (err: any) {
      console.error('Erro ao importar lead:', err);
    }
  };

  return (
    <div className="p-3 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-emerald-400 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-cyan-500/20">
              <Compass className="w-5 h-5 animate-spin-slow" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                Radar de Leads & Prospecção Automotiva
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Dual-Engine: Maps + Instagram
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Inspirado em Harvey AI SDR & Google Maps Scraper Kit. Minere donos de Porsche, preparadoras e oficinas qualificadas.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Stats Banner */}
        <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 p-1.5 rounded-2xl shadow-inner">
          <div className="px-3 py-1.5 bg-slate-950/70 rounded-xl border border-slate-800/80 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Leads no Radar</span>
            <span className="text-base font-black text-white">{leads.length}</span>
          </div>
          <div className="px-3 py-1.5 bg-slate-950/70 rounded-xl border border-slate-800/80 text-center">
            <span className="text-[10px] uppercase font-bold text-emerald-400 block tracking-wider">Alta Intenção</span>
            <span className="text-base font-black text-emerald-400">{leads.filter(l => l.porscheScore >= 90).length}</span>
          </div>
          <div className="px-3 py-1.5 bg-slate-950/70 rounded-xl border border-slate-800/80 text-center">
            <span className="text-[10px] uppercase font-bold text-cyan-400 block tracking-wider">Com WhatsApp</span>
            <span className="text-base font-black text-cyan-300">{leads.filter(l => !!l.whatsapp).length}</span>
          </div>
        </div>
      </div>

      {/* Control & Scanner Panel */}
      <div className="bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800/90 rounded-3xl p-4 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/70 pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-400 mr-1 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
              Fonte de Mineração:
            </span>
            <button
              onClick={() => setActiveEngine('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeEngine === 'all'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
              }`}
            >
              Todos ({leads.length})
            </button>
            <button
              onClick={() => setActiveEngine('instagram')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeEngine === 'instagram'
                  ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md shadow-pink-500/20'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
              }`}
            >
              <Instagram className="w-3.5 h-3.5" />
              Instagram B2C ({leads.filter(l => l.source === 'instagram').length})
            </button>
            <button
              onClick={() => setActiveEngine('google_maps')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeEngine === 'google_maps'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              Google Maps B2B ({leads.filter(l => l.source === 'google_maps').length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              País:
            </span>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-medium focus:ring-1 focus:ring-cyan-500 outline-none"
            >
              <option value="all">🌍 Global (Todos)</option>
              <option value="BR">🇧🇷 Brasil</option>
              <option value="US">🇺🇸 Estados Unidos</option>
            </select>
          </div>
        </div>

        {/* Live Scanner Inputs */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-6 lg:col-span-5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Termo / Alvo de Pesquisa
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={scanKeyword}
                onChange={(e) => setScanKeyword(e.target.value)}
                placeholder="Ex: Porsche 911 GT3, Oficina Porsche, Escapamento Inox"
                className="w-full bg-slate-950/90 border border-slate-800 rounded-2xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
              />
            </div>
          </div>

          <div className="sm:col-span-6 lg:col-span-4">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Região / Cidade de Varredura
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={scanLocation}
                onChange={(e) => setScanLocation(e.target.value)}
                placeholder="Ex: São Paulo, Curitiba, Miami FL, Munique"
                className="w-full bg-slate-950/90 border border-slate-800 rounded-2xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
              />
            </div>
          </div>

          <div className="sm:col-span-12 lg:col-span-3 flex items-end">
            <button
              onClick={handleRealScan}
              disabled={isScanning}
              className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 hover:opacity-95 active:scale-98 transition disabled:opacity-50 cursor-pointer"
            >
              {isScanning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  <span>Minerando Dados Reais (Apify)...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 fill-slate-950" />
                  <span>Disparar Varredura Real</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live Status Scan Message Banner */}
        {scanMessage && (
          <div className="mt-3.5 p-3 rounded-2xl bg-cyan-950/40 border border-cyan-500/40 text-cyan-200 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
            {isScanning ? <RefreshCw className="w-4 h-4 animate-spin text-cyan-400 shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            <span>{scanMessage}</span>
          </div>
        )}

        {/* Filters Quick Row */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/50">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-medium">Filtrar por:</span>
            <button
              onClick={() => setActiveFilterSignal('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                activeFilterSignal === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setActiveFilterSignal('high_score')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 ${
                activeFilterSignal === 'high_score' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400 hover:text-emerald-300'
              }`}
            >
              <Flame className="w-3 h-3 text-emerald-400" />
              Score 90%+
            </button>
            <button
              onClick={() => setActiveFilterSignal('has_whatsapp')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 ${
                activeFilterSignal === 'has_whatsapp' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-cyan-300'
              }`}
            >
              <Phone className="w-3 h-3 text-cyan-400" />
              Apenas com WhatsApp
            </button>
          </div>

          <div className="text-[11px] text-slate-400">
            Exibindo <span className="font-bold text-white">{filteredLeads.length}</span> oportunidades de negócio
          </div>
        </div>
      </div>

      {/* Leads Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredLeads.map((lead) => {
          const isCopied = copiedPitchId === lead.id;
          const isImported = lead.status === 'imported';

          return (
            <div
              key={lead.id}
              className="bg-slate-900/80 border border-slate-800/80 hover:border-slate-700/80 rounded-3xl p-5 flex flex-col justify-between gap-4 transition shadow-lg relative group overflow-hidden"
            >
              {/* Top Row: Avatar, Identity, Score Badge */}
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={lead.avatarUrl}
                      alt={lead.title}
                      className="w-12 h-12 rounded-2xl object-cover border border-slate-700/80 shadow-md"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm sm:text-base text-white">{lead.title}</h3>
                        {lead.source === 'instagram' ? (
                          <span className="p-1 rounded-lg bg-pink-500/10 text-pink-400 border border-pink-500/20" title="Origem: Instagram">
                            <Instagram className="w-3 h-3" />
                          </span>
                        ) : (
                          <span className="p-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" title="Origem: Google Maps">
                            <Building2 className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{lead.subtitle}</p>
                      <p className="text-[11px] font-mono text-cyan-400 mt-0.5 flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {lead.handleOrLocation}
                      </p>
                    </div>
                  </div>

                  {/* Porsche Lead Score (IA Qualification) */}
                  <div className="flex flex-col items-end">
                    <div className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center gap-1.5 shadow-sm">
                      <Flame className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                      <span className="text-xs font-black text-emerald-300">{lead.porscheScore}% Match</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-bold">
                      {lead.country === 'BR' ? '🇧🇷 Brasil' : '🇺🇸 USA'}
                    </span>
                  </div>
                </div>

                {/* Tags & Car Identified */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-800 text-[10px] font-bold text-slate-200 flex items-center gap-1">
                    <Car className="w-3 h-3 text-amber-400" />
                    {lead.carModel}
                  </span>
                  {lead.tags.map((tag, idx) => (
                    <span key={idx} className="px-2 py-0.5 rounded-lg bg-slate-800/60 text-slate-400 text-[10px] font-medium">
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Buying Signal (Harvey Analysis) */}
                <div className="mt-3.5 p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-cyan-400 tracking-wider">
                    <Sparkles className="w-3 h-3" />
                    Sinal de Compra Identificado (Harvey IA):
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed italic">
                    "{lead.buyingSignal}"
                  </p>
                </div>

                {/* AI Generated Cold Pitch */}
                <div className="mt-3 p-3 rounded-2xl bg-cyan-950/20 border border-cyan-800/30 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-cyan-300 tracking-wider flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                      Abordagem Cirúrgica Sugerida:
                    </span>
                    <button
                      onClick={() => handleCopyPitch(lead)}
                      className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 transition flex items-center gap-1"
                    >
                      {isCopied ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-3 h-3" />
                          <span>Copiar Pitch</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed font-sans">
                    {lead.aiSuggestedPitch}
                  </p>
                </div>
              </div>

              {/* Action Buttons Footer */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {lead.whatsapp && (
                    <button
                      onClick={() => handleOpenWhatsApp(lead)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Phone className="w-3.5 h-3.5 text-emerald-400" />
                      <span>WhatsApp</span>
                    </button>
                  )}
                  {lead.instagramUrl && (
                    <button
                      onClick={() => window.open(lead.instagramUrl, '_blank')}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-800 text-slate-300 text-xs font-medium transition flex items-center gap-1 cursor-pointer"
                    >
                      <Instagram className="w-3.5 h-3.5 text-pink-400" />
                      <span>Instagram</span>
                    </button>
                  )}
                  {lead.website && (
                    <button
                      onClick={() => window.open(lead.website, '_blank')}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-800 text-slate-300 text-xs font-medium transition flex items-center gap-1 cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Site</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {lead.source === 'google_maps' && (
                    credentialedLeadIds.has(lead.id) ? (
                      <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        Credenciada no RAG
                      </span>
                    ) : (
                      <button
                        onClick={() => handleCredenciarOficina(lead)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-emerald-950/80 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                        title="Credenciar como oficina parceira oficial e ativar no RAG da IA"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Credenciar Oficina</span>
                      </button>
                    )
                  )}

                  {isImported ? (
                    <span className="px-3 py-1.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                      Importado no CRM
                    </span>
                  ) : (
                    <button
                      onClick={() => handleImportLead(lead.id)}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-400 text-slate-950 text-xs font-black hover:opacity-95 active:scale-98 transition flex items-center gap-1 shadow-md shadow-cyan-500/20 cursor-pointer"
                    >
                      <PlusCircle className="w-3.5 h-3.5 text-slate-950" />
                      <span>Importar Lead</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredLeads.length === 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center space-y-3">
          <Compass className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="font-bold text-white text-base">Nenhum lead encontrado com estes filtros</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Tente ajustar o país, o termo de busca ou disparar uma nova varredura no botão superior.
          </p>
        </div>
      )}
    </div>
  );
};
