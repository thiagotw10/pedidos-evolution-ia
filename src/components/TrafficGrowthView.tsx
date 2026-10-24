import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Target,
  DollarSign,
  Share2,
  Copy,
  Check,
  Sparkles,
  Zap,
  Activity,
  Send,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Flame,
  Award,
  BarChart3,
  Sliders,
  AlertCircle,
  HelpCircle,
  Car
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { Establishment } from '../types';

interface TrafficGrowthViewProps {
  establishment: Establishment | null;
  onNavigateToProjects?: () => void;
}

interface TrafficStats {
  totalLeads: number;
  paidLeads: number;
  qualifiedLeads: number;
  quotesSent: number;
  closedSales: number;
  totalRevenue: number;
  totalCommission: number;
  conversionRate: number;
  campaigns: Array<{
    campaignName: string;
    leads: number;
    qualified: number;
    closed: number;
    revenue: number;
    commission: number;
  }>;
}

interface MetaConfig {
  metaPixelId: string;
  metaApiAccessToken: string;
  metaCapiEnabled: boolean;
  metaTestEventCode: string;
  defaultCommissionPercent: number;
}

export const TrafficGrowthView: React.FC<TrafficGrowthViewProps> = ({
  establishment,
  onNavigateToProjects
}) => {
  const [stats, setStats] = useState<TrafficStats>({
    totalLeads: 0,
    paidLeads: 0,
    qualifiedLeads: 0,
    quotesSent: 0,
    closedSales: 0,
    totalRevenue: 0,
    totalCommission: 0,
    conversionRate: 0,
    campaigns: []
  });

  const [metaConfig, setMetaConfig] = useState<MetaConfig>({
    metaPixelId: '',
    metaApiAccessToken: '',
    metaCapiEnabled: true,
    metaTestEventCode: '',
    defaultCommissionPercent: 4
  });

  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingCapi, setTestingCapi] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string } | null>(null);

  // Link Generator State
  const [campaignKey, setCampaignKey] = useState('DOWNPIPE_INOX_GOLF');
  const [carOrProduct, setCarOrProduct] = useState('Golf GTI / Jetta GLI');
  const [offerText, setOfferText] = useState('Instalação inclusa esta semana');
  const [generatedLink, setGeneratedLink] = useState('');
  const [generatedTag, setGeneratedTag] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'roi' | 'campaigns' | 'generator' | 'capi'>('roi');

  useEffect(() => {
    fetchStats();
    fetchConfig();
  }, []);

  useEffect(() => {
    handleGenerateLink();
  }, [campaignKey, carOrProduct, offerText, establishment]);

  const getAuthToken = async () => {
    return await auth.currentUser?.getIdToken();
  };

  const fetchStats = async () => {
    try {
      setLoading(true);
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch('/api/automotive/traffic/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.warn('Erro ao carregar métricas de tráfego:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch('/api/automotive/traffic/config', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMetaConfig(prev => ({ ...prev, ...data }));
      }
    } catch (e) {
      console.warn('Erro ao carregar configurações CAPI:', e);
    }
  };

  const handleSaveConfig = async () => {
    try {
      setSavingConfig(true);
      const token = await getAuthToken();
      const res = await fetch('/api/automotive/traffic/config', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metaConfig)
      });
      if (res.ok) {
        alert('Configurações de Tráfego e Meta CAPI salvas com sucesso!');
        fetchStats();
      }
    } catch (e: any) {
      alert('Erro ao salvar: ' + e.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTestCapi = async () => {
    try {
      setTestingCapi(true);
      setTestResult(null);
      const token = await getAuthToken();
      const res = await fetch('/api/automotive/traffic/test-capi', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metaConfig)
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({
          success: true,
          message: `Evento de teste enviado com sucesso ao Meta! Trace ID: ${data.fbtrace_id || 'OK'}`
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Falha ao testar Meta CAPI'
        });
      }
    } catch (e: any) {
      setTestResult({ success: false, message: e.message });
    } finally {
      setTestingCapi(false);
    }
  };

  const handleGenerateLink = async () => {
    const rawPhone = String(establishment?.whatsappNumber || establishment?.phone || '').replace(/\D/g, '');
    const phone = rawPhone.startsWith('55') ? rawPhone : (rawPhone ? `55${rawPhone}` : '5511999999999');
    const tag = `[REF:ADS_${campaignKey.toUpperCase().replace(/\s+/g, '_')}]`;
    const carPart = carOrProduct ? ` para meu ${carOrProduct}` : '';
    const offerPart = offerText ? ` Aproveitando a condição de ${offerText}.` : '';
    const message = `Olá! Vi o anúncio no Instagram e gostaria de um orçamento de projeto${carPart}.${offerPart}\n\n${tag}`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    setGeneratedLink(url);
    setGeneratedTag(tag);
  };

  const handleCopyLink = () => {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6 text-slate-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5">
              <Zap className="w-3 h-3" /> Growth Engine
            </span>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              Meta CAPI Server-Side Ativo
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white mt-2 tracking-tight">
            Tráfego Pago & Painel de Comissão
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Rastreamento de ponta a ponta dos anúncios do Meta/Google até a venda final no WhatsApp, com disparo automático de eventos de conversão e cálculo transparente da sua comissão.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => { fetchStats(); fetchConfig(); }}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-bold flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Atualizar Métricas</span>
          </button>
        </div>
      </div>

      {/* Main KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Faturamento Rastreado */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-cyan-500/30 p-5 shadow-xl shadow-cyan-950/20">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
            <span>Faturamento Rastreado</span>
            <DollarSign className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-white mt-2">
            R$ {stats.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-cyan-300">
            <Check className="w-3.5 h-3.5" />
            <span>{stats.closedSales} projeto(s) aprovado(s)</span>
          </div>
        </div>

        {/* Card 2: Sua Comissão */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/40 p-5 shadow-xl shadow-emerald-950/20">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/15 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-400">
            <span>Sua Comissão Acumulada</span>
            <Award className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-emerald-400 mt-2">
            R$ {stats.totalCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-300/80">
            <span>Base de comissão: <strong>{metaConfig.defaultCommissionPercent}%</strong> das vendas</span>
          </div>
        </div>

        {/* Card 3: Leads de Tráfego Pago */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-5 shadow-lg">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
            <span>Leads de Tráfego Pago</span>
            <Target className="w-4 h-4 text-orange-400" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-white mt-2">
            {stats.paidLeads}
            <span className="text-xs font-normal text-slate-400 ml-2">de {stats.totalLeads} total</span>
          </p>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-orange-300">
            <Flame className="w-3.5 h-3.5" />
            <span>{stats.qualifiedLeads} qualificados pela IA</span>
          </div>
        </div>

        {/* Card 4: Taxa de Conversão */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-5 shadow-lg">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
            <span>Conversão Lead ➔ Venda</span>
            <BarChart3 className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-white mt-2">
            {stats.conversionRate}%
          </p>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400">
            <span>{stats.quotesSent} orçamentos enviados</span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        {[
          { id: 'roi', label: 'Extrato de Vendas & Comissão', icon: DollarSign },
          { id: 'campaigns', label: 'Campanhas Rastreáveis', icon: BarChart3 },
          { id: 'generator', label: 'Gerador de Links de Anúncios', icon: Share2 },
          { id: 'capi', label: 'Configuração Meta CAPI', icon: Sliders }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Extrato de Vendas & Comissão */}
      {activeTab === 'roi' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-base text-white">Como Funciona a Sua Comissão</h2>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                Cada lead de tráfego que inicia no WhatsApp traz uma tag invisível. Quando o orçamento é preenchido e marcado como <strong>"Aprovado"</strong> no CRM, o valor da comissão é registrado automaticamente neste extrato para acerto de contas com o dono da empresa.
              </p>
            </div>
            {onNavigateToProjects && (
              <button
                onClick={onNavigateToProjects}
                className="px-4 py-2.5 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-300 text-xs font-bold flex items-center gap-2 transition cursor-pointer"
              >
                <Car className="w-4 h-4" />
                <span>Abrir CRM de Projetos</span>
              </button>
            )}
          </div>

          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white">Resumo de Performance por Campanha</h3>
              <span className="text-xs text-slate-400">Atualizado em tempo real</span>
            </div>

            {stats.campaigns.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3.5">Campanha / Anúncio</th>
                      <th className="p-3.5 text-center">Leads IA</th>
                      <th className="p-3.5 text-center">Qualificados</th>
                      <th className="p-3.5 text-center">Fechados</th>
                      <th className="p-3.5 text-right">Faturamento Total</th>
                      <th className="p-3.5 text-right text-emerald-400">Sua Comissão</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {stats.campaigns.map((c, i) => (
                      <tr key={i} className="hover:bg-slate-800/40 transition">
                        <td className="p-3.5 font-bold text-white flex items-center gap-2">
                          <Target className="w-3.5 h-3.5 text-cyan-400" />
                          <span>{c.campaignName}</span>
                        </td>
                        <td className="p-3.5 text-center font-mono">{c.leads}</td>
                        <td className="p-3.5 text-center font-mono text-orange-300">{c.qualified}</td>
                        <td className="p-3.5 text-center font-bold text-emerald-400">{c.closed}</td>
                        <td className="p-3.5 text-right font-mono font-bold text-white">
                          R$ {c.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-emerald-400">
                          R$ {c.commission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-10 text-center text-slate-500 space-y-2">
                <Target className="w-8 h-8 mx-auto opacity-30" />
                <p className="text-xs">Nenhuma venda de tráfego com valor registrado ainda.</p>
                <p className="text-[11px] text-slate-400">
                  Crie links rastreados na aba "Gerador de Links" e cadastre o valor do orçamento nos projetos do CRM.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Campanhas Rastreáveis */}
      {activeTab === 'campaigns' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <h3 className="font-bold text-sm text-white">Como nomear suas campanhas no Meta Ads</h3>
            <p className="text-xs text-slate-400 mt-1">
              Para que nosso robô de IA agrupe os números perfeitamente, utilize o Gerador de Links abaixo. Ele insere automaticamente o identificador <code>[REF:ADS_NOME_DA_CAMPANHA]</code> na mensagem que o cliente envia ao clicar no seu anúncio do Instagram ou Facebook.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Exemplo 1</span>
              <h4 className="font-bold text-sm text-white">Downpipe Inox Alta Performance</h4>
              <p className="text-xs text-slate-400">Público: Donos de Golf GTI, Jetta GLI, BMW 320i, Audi A3/S3.</p>
              <div className="p-2 rounded bg-slate-950 font-mono text-[11px] text-slate-300">
                Tag: [REF:ADS_DOWNPIPE_INOX]
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400">Exemplo 2</span>
              <h4 className="font-bold text-sm text-white">Catback Valvetronic com Controle</h4>
              <p className="text-xs text-slate-400">Público: Porsche 911, M3/M4, Mustang V8, Camaro, C63 AMG.</p>
              <div className="p-2 rounded bg-slate-950 font-mono text-[11px] text-slate-300">
                Tag: [REF:ADS_CATBACK_VALVETRONIC]
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">Exemplo 3</span>
              <h4 className="font-bold text-sm text-white">Combo Stage 2 + Downpipe + Pops</h4>
              <p className="text-xs text-slate-400">Público: Entusiastas de reprogramação e ronco esportivo.</p>
              <div className="p-2 rounded bg-slate-950 font-mono text-[11px] text-slate-300">
                Tag: [REF:ADS_STAGE2_REMAPPING]
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Gerador de Links de Anúncios */}
      {activeTab === 'generator' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Share2 className="w-4 h-4 text-cyan-400" />
                Gerador de Links de Campanha (WhatsApp)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Gere o link exato para colocar no botão "Enviar Mensagem no WhatsApp" do seu anúncio no Meta Ads (Facebook/Instagram).
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Identificador da Campanha (Sem espaços)
                </label>
                <input
                  type="text"
                  value={campaignKey}
                  onChange={e => setCampaignKey(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                  placeholder="EX: DOWNPIPE_GOLF_TSI"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white uppercase font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Carro / Peça do Criativo (Opcional)
                </label>
                <input
                  type="text"
                  value={carOrProduct}
                  onChange={e => setCarOrProduct(e.target.value)}
                  placeholder="EX: Golf GTI / Jetta GLI"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Gancho de Oferta (Opcional)
                </label>
                <input
                  type="text"
                  value={offerText}
                  onChange={e => setOfferText(e.target.value)}
                  placeholder="EX: 10% de desconto na instalação"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white"
                />
              </div>
            </div>
          </div>

          {/* Result Box */}
          <div className="p-5 rounded-2xl bg-slate-950 border border-cyan-500/30 space-y-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Link Rastreado Pronto
                </span>
                <span className="text-[10px] text-slate-500 font-mono">{generatedTag}</span>
              </div>

              <div className="mt-3 p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono break-all text-slate-300 max-h-32 overflow-y-auto">
                {generatedLink || 'Preencha os campos ao lado para gerar o link.'}
              </div>

              <div className="mt-4 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-200 space-y-1">
                <p className="font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Como a IA reage:
                </p>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Quando o cliente clicar neste link no anúncio e enviar a mensagem no WhatsApp, a IA automaticamente remove a tag <code className="text-cyan-300">{generatedTag}</code> da conversa visível e salva a origem no CRM. Em seguida, dispara o evento <strong>Lead</strong> para o Meta!
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={handleCopyLink}
                className="flex-1 py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-cyan-500/20"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copiado para a Área de Transferência!' : 'Copiar Link para Anúncio'}</span>
              </button>

              {generatedLink && (
                <a
                  href={generatedLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Testar</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Configuração Meta CAPI */}
      {activeTab === 'capi' && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <h3 className="font-bold text-base text-white">Configuração da Meta Conversions API (CAPI)</h3>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl">
              A API de Conversões Server-Side envia os eventos de <strong>Lead</strong> (quando o cliente qualifica o carro com a IA) e <strong>Purchase</strong> (quando o projeto de escapamento é fechado) diretamente do nosso servidor para o Facebook, ignorando bloqueadores de anúncio e iOS 14+.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Pixel ID do Meta
              </label>
              <input
                type="text"
                value={metaConfig.metaPixelId}
                onChange={e => setMetaConfig({ ...metaConfig, metaPixelId: e.target.value })}
                placeholder="Ex: 123456789012345"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Disponível no Gerenciador de Eventos do Facebook / Meta Business Suite.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Token de Acesso da API de Conversões (Access Token)
              </label>
              <input
                type="password"
                value={metaConfig.metaApiAccessToken}
                onChange={e => setMetaConfig({ ...metaConfig, metaApiAccessToken: e.target.value })}
                placeholder="Ex: EAAGm0PX4ZC7... (Gerado no Gerenciador de Eventos)"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Gerado na aba "Configurações" do seu Pixel no Gerenciador de Eventos.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Código de Teste do Gerenciador de Eventos (Opcional)
              </label>
              <input
                type="text"
                value={metaConfig.metaTestEventCode}
                onChange={e => setMetaConfig({ ...metaConfig, metaTestEventCode: e.target.value })}
                placeholder="Ex: TEST12345"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Use este código da aba "Testar Eventos" para ver os disparos caindo ao vivo no Facebook.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                % da Sua Comissão por Venda (Padrão)
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="50"
                value={metaConfig.defaultCommissionPercent}
                onChange={e => setMetaConfig({ ...metaConfig, defaultCommissionPercent: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Porcentagem pactuada com a loja (ex: 4% sobre o valor do escapamento/projeto).
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={metaConfig.metaCapiEnabled}
                onChange={e => setMetaConfig({ ...metaConfig, metaCapiEnabled: e.target.checked })}
                className="w-4 h-4 rounded accent-cyan-500"
              />
              <span className="text-xs text-slate-300 font-semibold">
                Ativar envio automático de conversões (CAPI)
              </span>
            </label>
          </div>

          {testResult && (
            <div className={`p-4 rounded-xl text-xs flex items-center gap-2 ${
              testResult.success
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/15 border border-red-500/30 text-red-300'
            }`}>
              {testResult.success ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{testResult.message}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-slate-800">
            <button
              onClick={handleSaveConfig}
              disabled={savingConfig}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition cursor-pointer disabled:opacity-50"
            >
              {savingConfig ? 'Salvando...' : 'Salvar Configurações'}
            </button>

            <button
              onClick={handleTestCapi}
              disabled={testingCapi || !metaConfig.metaPixelId}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              <Activity className={`w-4 h-4 ${testingCapi ? 'animate-spin text-cyan-400' : ''}`} />
              <span>{testingCapi ? 'Testando Conexão...' : 'Testar Disparo no Facebook'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
