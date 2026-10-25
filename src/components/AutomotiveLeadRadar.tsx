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
    id: 'lead-1',
    source: 'instagram',
    title: 'Guilherme S. (992 GT3)',
    subtitle: 'Proprietário Porsche 911 GT3 Touring',
    handleOrLocation: '@gui_992gt3',
    phone: '+55 11 98844-3211',
    whatsapp: '5511988443211',
    instagramUrl: 'https://instagram.com/gui_992gt3',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    carModel: 'Porsche 911 GT3 (992) 2023',
    porscheScore: 98,
    buyingSignal: 'Postou vídeo no autódromo de Interlagos mencionando que quer abrir o som do motor boxer 4.0 aspirado.',
    aiSuggestedPitch: 'Fala Guilherme, vi seu 992 GT3 Touring em Interlagos! Máquina absurda. Aqui na Flow Garage desenvolvemos o sistema em Inox 304 com bypass valvulado específico para liberar o ronco do 4.0 sem dar drone na estrada. Quer dar uma olhada no projeto 3D?',
    tags: ['Dono 992 GT3', 'Track Day Interlagos', 'Alta Intenção'],
    status: 'new',
    city: 'São Paulo, SP',
    country: 'BR'
  },
  {
    id: 'lead-2',
    source: 'google_maps',
    title: 'Stuttgart Garage & Performance',
    subtitle: 'Oficina Especializada Porsche & Supercarros',
    handleOrLocation: 'Av. Europa, Jardins - São Paulo, SP',
    phone: '+55 11 3062-8900',
    whatsapp: '5511997238900',
    website: 'https://stuttgartgarage.com.br',
    instagramUrl: 'https://instagram.com/stuttgartgarage',
    avatarUrl: 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=150&auto=format&fit=crop&q=80',
    carModel: 'Hub Especializado (Atende ~40 Porsches/mês)',
    porscheScore: 95,
    buyingSignal: 'Atende grande volume de 911 (991/992) e 718 Cayman para revisões e upgrades de performance.',
    aiSuggestedPitch: 'Olá pessoal da Stuttgart Garage! Acompanhamos o trabalho de vocês na Av. Europa. A Flow Garage fabrica escapamentos e downpipes plug-and-play de alta performance com condições especiais para oficinas parceiras. Podemos agendar uma visita ou enviar nosso catálogo técnico?',
    tags: ['Oficina Especializada', 'Parceiro B2B', 'Av. Europa SP'],
    status: 'new',
    city: 'São Paulo, SP',
    country: 'BR'
  },
  {
    id: 'lead-3',
    source: 'instagram',
    title: 'Dr. Rodrigo Menezes',
    subtitle: 'Porsche 718 Boxster GTS 4.0',
    handleOrLocation: '@rodrigo.boxstergts',
    phone: '+55 41 99122-4589',
    whatsapp: '5541991224589',
    instagramUrl: 'https://instagram.com/rodrigo.boxstergts',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    carModel: 'Porsche 718 Boxster GTS 2022',
    porscheScore: 91,
    buyingSignal: 'Comentou no post da Stuttgart perguntando sobre opções de difusor e ponteiras esportivas duplas.',
    aiSuggestedPitch: 'Olá Rodrigo! Tudo bem? Vi seu 718 Boxster GTS, belíssima configuração. Temos o sistema de ponteiras duplas e catback em inox 304 específico para o GTS que valoriza o ronco e mantém as válvulas originais ativas. Se quiser, te mando o simulador 3D com o ronco!',
    tags: ['Dono Boxster GTS', 'Interesse Ponteiras', 'Curitiba'],
    status: 'new',
    city: 'Curitiba, PR',
    country: 'BR'
  },
  {
    id: 'lead-4',
    source: 'google_maps',
    title: 'Apex Motorsport Miami',
    subtitle: 'European Exotic Exhaust & Tuning Center',
    handleOrLocation: 'NW 36th St, Doral - Miami, FL',
    phone: '+1 305 592-4411',
    whatsapp: '13055924411',
    website: 'https://apexmotorsportmiami.com',
    instagramUrl: 'https://instagram.com/apexmiami',
    avatarUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=150&auto=format&fit=crop&q=80',
    carModel: 'Exotic Tuning (Porsche 992 Turbo & GT3)',
    porscheScore: 94,
    buyingSignal: 'Foco exclusivo em escapamentos esportivos para clientes americanos e sul-americanos em Miami.',
    aiSuggestedPitch: 'Hey Apex Motorsport team! We manufacture custom precision TIG-welded 304 stainless exhaust systems for Porsche 992 and 718 platforms with full valve control. We are looking for wholesale installation partners in Florida. Would love to send you our wholesale catalog!',
    tags: ['Parceiro EUA', 'Atacado / Exportação', 'Miami FL'],
    status: 'new',
    city: 'Miami, FL',
    country: 'US'
  },
  {
    id: 'lead-5',
    source: 'instagram',
    title: 'Lucas Alencar (991.2 Carrera S)',
    subtitle: 'Porsche 911 Carrera S 3.0 Bi-Turbo',
    handleOrLocation: '@lucas_carrera991',
    phone: '+55 47 99912-7788',
    whatsapp: '5547999127788',
    instagramUrl: 'https://instagram.com/lucas_carrera991',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    carModel: 'Porsche 911 (991.2) Carrera S 2018',
    porscheScore: 89,
    buyingSignal: 'Postou story marcando encontro na Marina de Balneário Camboriú querendo fazer remap Stage 2 e escape.',
    aiSuggestedPitch: 'Fala Lucas! Vi seu 991.2 Carrera S na Marina de BC, carro muito alinhado! Para o projeto Stage 2 que você planeja, nosso catback com downpipes de alto fluxo em inox 304 libera toda a turbina sem perder torque em baixa. Posso te passar os gráficos de ganho?',
    tags: ['Dono 991.2', 'Stage 2 & Escape', 'Balneário Camboriú'],
    status: 'new',
    city: 'Balneário Camboriú, SC',
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
  const [scanKeyword, setScanKeyword] = useState('Porsche 911 escapamento esportivo');
  const [scanLocation, setScanLocation] = useState('São Paulo, Brasil');
  const [copiedPitchId, setCopiedPitchId] = useState<string | null>(null);
  const [activeFilterSignal, setActiveFilterSignal] = useState<'all' | 'high_score' | 'has_whatsapp'>('all');

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

  const handleSimulateNewScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      // Adiciona um novo lead descoberto pela simulação do scraper
      const newLead: LeadItem = {
        id: `lead-${Date.now()}`,
        source: scanKeyword.toLowerCase().includes('oficina') ? 'google_maps' : 'instagram',
        title: scanKeyword.toLowerCase().includes('oficina') ? 'EuroSpec Porsche Works' : 'Felipe R. (718 Cayman GT4)',
        subtitle: scanKeyword.toLowerCase().includes('oficina') ? 'Preparação & Escapamentos Importados' : 'Porsche 718 Cayman GT4 2021',
        handleOrLocation: scanLocation,
        phone: '+55 11 97722-1090',
        whatsapp: '5511977221090',
        avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
        carModel: scanKeyword.toLowerCase().includes('oficina') ? 'Centro Especializado Porsche' : 'Porsche 718 Cayman GT4',
        porscheScore: 96,
        buyingSignal: `Detectado pelo radar buscando por "${scanKeyword}" na região de ${scanLocation}. Alto índice de interesse.`,
        aiSuggestedPitch: `Olá! Identificamos o seu interesse em projetos para Porsche na região de ${scanLocation}. A Flow Garage desenvolve escapamentos sob medida em inox 304 com ronco esportivo de precisão. Gostaria de conhecer nossas opções?`,
        tags: ['Recém Descoberto', 'Radar Ativo', scanLocation.split(',')[0]],
        status: 'new',
        city: scanLocation,
        country: scanLocation.toLowerCase().includes('miami') || scanLocation.toLowerCase().includes('us') ? 'US' : 'BR'
      };
      setLeads(prev => [newLead, ...prev]);
    }, 1800);
  };

  const handleCopyPitch = (lead: LeadItem) => {
    navigator.clipboard.writeText(lead.aiSuggestedPitch);
    setCopiedPitchId(lead.id);
    setTimeout(() => setCopiedPitchId(null), 2500);
  };

  const handleOpenWhatsApp = (lead: LeadItem) => {
    if (!lead.whatsapp) return;
    const encoded = encodeURIComponent(lead.aiSuggestedPitch);
    window.open(`https://wa.me/${lead.whatsapp}?text=${encoded}`, '_blank');
  };

  const handleImportLead = (leadId: string) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: 'imported' } : l));
    if (onNavigateToProjects) {
      onNavigateToProjects();
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
              onClick={handleSimulateNewScan}
              disabled={isScanning}
              className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 hover:opacity-95 active:scale-98 transition disabled:opacity-50 cursor-pointer"
            >
              {isScanning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  <span>Minerando Leads com IA...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 fill-slate-950" />
                  <span>Disparar Varredura IA</span>
                </>
              )}
            </button>
          </div>
        </div>

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

                <div>
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
